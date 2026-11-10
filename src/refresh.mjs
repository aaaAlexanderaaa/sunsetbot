import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { DiskCache } from './cache.mjs';
import { WeatherProvider } from './provider.mjs';
import { AcquisitionPacer } from './acquisition-pacer.mjs';
import { PRESETS } from './presets.mjs';
import { ForecastService } from './service.mjs';
import { ForecastArchive } from './archive.mjs';
import { SourceSnapshots, SnapshotProvider, acquisitionPlan, makeSourceSnapshot, FORECAST_MODELS } from './source-snapshots.mjs';
import { PublishedForecasts, CachedForecastService, publicationFor } from './published-forecasts.mjs';
import { refreshSchedule } from './refresh-schedule.mjs';
import { AppError } from './errors.mjs';

export function createAcquisitionProvider({ directory, fetcher, now = () => Date.now(), dailyBudget = 10000, timeout = 20000, apiKey = '', pacer }) {
  const limiter = pacer ?? new AcquisitionPacer(join(directory, 'acquisition-rate'), { now });
  class PacedProvider extends WeatherProvider {
    request(url, units) { return limiter.run(units, () => super.request(url, units)); }
    async reserve(units, scheduledHold) {
      let previous;
      try { previous = JSON.parse(await readFile(join(this.directory, 'weather-budget.json'), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw new AppError('BUDGET_STATE_INVALID', '天气额度记录需要检查，请查看服务日志。'); }
      const today = new Date(this.now()).toISOString().slice(0, 10);
      const used = previous?.day === today ? previous.units : 0;
      if (!Number.isInteger(used) || used < 0) throw new AppError('BUDGET_STATE_INVALID', '天气额度记录需要检查，请查看服务日志。');
      if (used + units + scheduledHold > this.dailyBudget) {
        throw new AppError('REFRESH_BUDGET', '剩余额度已为计划更新保留，本次刷新请在额度恢复后重试。', 503,
          { availableUnits: Math.max(0, this.dailyBudget - used - scheduledHold), requestedUnits: units, scheduledReserveUnits: scheduledHold });
      }
      // Reserve the whole job before the first request; a crash retains its debit.
      await super.budget(units);
      this.reserved = units;
      this.reservedDay = today;
    }
    async budget(units) {
      if (this.reserved === undefined) return super.budget(units);
      if (units > this.reserved) throw new AppError('REFRESH_RESERVATION', '取数超出任务预留额度，请检查任务配置。');
      const day = new Date(this.now()).toISOString().slice(0, 10);
      if (day !== this.reservedDay) {
        // Requests after UTC midnight also reserve their remaining work in that day.
        await super.budget(this.reserved);
        this.reservedDay = day;
      }
      this.reserved -= units;
    }
    finishReservation() { this.reserved = undefined; }
  }
  return new PacedProvider({ directory, fetcher, now, dailyBudget, timeout, apiKey,
    // Every admitted refresh acquires fresh inputs. Query paths have no access.
    cache: { load: async (_key, loader) => ({ data: await loader(), fetchedAt: now(), cache: 'miss' }) } });
}

export class RefreshManager {
  constructor({ directory, provider, sources, published, archive = null, locations = PRESETS, now = () => Date.now(), batchSize = 80 }) {
    Object.assign(this, { provider, sources, published, archive, locations, now, batchSize });
    this.disk = new DiskCache(directory, { maxEntries: 1 });
    this.state = { schemaVersion: 1, latestScheduledSlot: null, job: null };
    this.active = null;
    this.starting = null;
    this.timer = null;
    this.stopped = false;
  }
  async load() {
    const saved = await this.disk.get('state');
    if (saved?.schemaVersion === 1) this.state = saved;
    if (this.state.job?.state === 'running') {
      this.state.job.state = 'interrupted';
      this.state.job.completedAt = new Date(this.now()).toISOString();
      await this.persist();
    }
  }
  async persist() {
    const jobs = (this.state.jobs ?? []).filter(job => job.id !== this.state.job?.id);
    if (this.state.job) jobs.push(structuredClone(this.state.job));
    this.state.jobs = jobs.slice(-16);
    await this.disk.put('state', { ...this.state, fetchedAt: this.now() });
  }
  status(jobId = null) {
    const job = !jobId || jobId === this.state.job?.id ? this.state.job : (this.state.jobs ?? []).find(job => job.id === jobId);
    if (jobId && !job) throw new AppError('JOB_NOT_FOUND', '任务记录已超出保留范围，请查看最近一次更新。', 404);
    return { ...refreshSchedule(this.now()), locations: this.locations.map(location => location.id), models: FORECAST_MODELS,
      publishedAt: this.published.publishedAt, publishedForecasts: this.published.entries.size,
      latestScheduledSlot: this.state.latestScheduledSlot, job: structuredClone(job) };
  }
  async tick() {
    if (this.stopped || this.active || this.starting) return;
    const { latestSlot } = refreshSchedule(this.now());
    if (this.state.latestScheduledSlot !== latestSlot) return this.trigger('scheduled', latestSlot);
  }
  start() {
    this.stopped = false;
    const tick = () => this.tick().catch(error => console.error(JSON.stringify({ event: 'refresh_schedule_error', message: error.message })));
    this.timer = setInterval(tick, 30000);
    this.timer.unref();
    void tick();
  }
  stop() { this.stopped = true; clearInterval(this.timer); }
  join(job, plan) {
    const targets = new Set(job.targets.map(target => `${target.city}:${target.date}:${target.event}`));
    if (plan.events.some(input => !targets.has(`${input.location.id}:${input.date}:${input.event}`))) {
      throw new AppError('REFRESH_BUSY', '当前更新任务正在处理另一组朝晚霞时刻，请等待完成后再次刷新。', 409);
    }
    return structuredClone(job);
  }
  scheduledHold(instant) {
    const date = new Date(instant).toISOString().slice(0, 10);
    return ['00', '08'].map(hour => `${date}T${hour}:00:00.000Z`)
      .filter(time => Date.parse(time) >= +new Date(instant) && time !== this.state.latestScheduledSlot)
      .reduce((sum, time) => sum + acquisitionPlan(this.locations, time, 3).estimatedUnits, 0);
  }
  async trigger(kind = 'forced', slot = null) {
    const requestedAt = new Date(this.now()).toISOString();
    const plan = acquisitionPlan(this.locations, requestedAt, kind === 'scheduled' ? 3 : 1);
    if (this.starting) return this.join(await this.starting, plan);
    if (this.active) return this.join(this.state.job, plan);
    const admission = (async () => {
      const job = { id: randomUUID(), kind, state: 'running', requestedAt, slot,
        phase: 'acquiring_weather', occurrences: plan.occurrences,
        targets: plan.events.map(input => ({ city: input.location.id, date: input.date, event: input.event })),
        plannedWeatherPoints: plan.weatherPoints.length, plannedAerosolPoints: plan.aerosolPoints.length,
        estimatedUnits: plan.estimatedUnits, acquiredPoints: 0, publishedForecasts: 0, failures: [] };
      const previous = this.state;
      this.state = { ...previous, job, ...(kind === 'scheduled' ? { latestScheduledSlot: slot } : {}) };
      // A claim must reach disk before the provider can spend a unit.
      try { await this.persist(); } catch (error) { this.state = previous; throw error; }
      try {
        const hold = kind === 'forced' ? this.scheduledHold(requestedAt) : 0;
        await this.provider.reserve?.(plan.estimatedUnits, hold);
        job.reservedUnits = plan.estimatedUnits;
      } catch (error) {
        job.state = 'failed'; job.phase = 'complete'; job.completedAt = new Date(this.now()).toISOString();
        job.failures.push({ stage: 'admission', code: error.code ?? 'BUDGET_UNAVAILABLE' });
        await this.persist(); throw error;
      }
      this.active = this.run(job, plan).catch(async error => {
        job.state = 'failed'; job.phase = 'complete'; job.completedAt = new Date(this.now()).toISOString();
        job.failures.push({ stage: 'refresh', code: error.code ?? 'REFRESH_FAILED' });
        try { await this.persist(); } catch (failure) {
          console.error(JSON.stringify({ event: 'refresh_state_error', message: failure.message }));
        }
      }).finally(() => { this.provider.finishReservation?.(); this.active = null; });
      return job;
    })();
    this.starting = admission;
    try { return structuredClone(await admission); }
    finally { if (this.starting === admission) this.starting = null; }
  }
  async idle() { if (this.starting) await this.starting; if (this.active) await this.active; }
  async acquire(points, model, plan, job) {
    const data = [], fetchTimes = [];
    for (let start = 0; start < points.length; start += this.batchSize) {
      const batch = points.slice(start, start + this.batchSize);
      const response = model ? await this.provider.weather(batch, model, plan.startDate, plan.endDate) :
        await this.provider.aerosol(batch, plan.startDate, plan.endDate);
      data.push(...response.data); fetchTimes.push(response.fetchedAt);
      job.acquiredPoints += batch.length;
      await this.persist();
    }
    return { points, data, fetchedAt: Math.min(...fetchTimes), fetchedThrough: Math.max(...fetchTimes) };
  }
  async run(job, plan) {
    const weather = new Map();
    for (const model of FORECAST_MODELS) {
      job.phase = `acquiring_${model}`;
      try { weather.set(model, await this.acquire(plan.weatherPoints, model, plan, job)); }
      catch (error) { job.failures.push({ stage: 'weather', model, code: error.code ?? 'UPSTREAM_UNAVAILABLE' }); }
    }
    let aerosol = null;
    if (weather.size) {
      job.phase = 'acquiring_aerosol';
      try { aerosol = await this.acquire(plan.aerosolPoints, null, plan, job); }
      catch (error) { job.failures.push({ stage: 'aerosol', code: error.code ?? 'AEROSOL_UNAVAILABLE' }); }
    }
    job.phase = 'computing';
    await this.persist();
    const entries = [];
    for (const [model, data] of weather) {
      const snapshot = makeSourceSnapshot({ kind: job.kind, model, jobId: job.id, requestedAt: job.requestedAt, weather: data, aerosol });
      const provider = new SnapshotProvider(snapshot);
      const computer = new ForecastService({ provider, archive: this.archive, now: this.now });
      let successes = 0;
      for (const input of plan.events) {
        try {
          const result = await computer.compute({ ...input, model });
          entries.push({ result, refresh: publicationFor(snapshot, new Date(this.now()).toISOString()) });
          successes++;
        } catch (error) {
          job.failures.push({ stage: 'compute', model, city: input.location.id, date: input.date, event: input.event, code: error.code ?? 'COMPUTE_FAILED' });
        }
      }
      if (successes) await this.sources.save(snapshot);
    }
    job.phase = 'publishing';
    await this.published.publish(entries);
    job.publishedForecasts = entries.length;
    job.state = entries.length ? job.failures.length ? 'partial' : 'succeeded' : 'failed';
    job.phase = 'complete'; job.completedAt = new Date(this.now()).toISOString();
    await this.persist();
  }
}

export async function createForecastRuntime({ directory, provider, now = () => Date.now(), locations = PRESETS }) {
  const sources = new SourceSnapshots(join(directory, 'sources'));
  const published = new PublishedForecasts(join(directory, 'published'), { now });
  const archive = new ForecastArchive(join(directory, 'forecasts'), { now });
  const refresh = new RefreshManager({ directory: join(directory, 'refresh'), provider, sources, published, archive, locations, now });
  await Promise.all([sources.load(), published.load(), refresh.load()]);
  await published.importRetained(join(directory, 'forecasts'));
  const service = new CachedForecastService({ published, sources, archive, now });
  return { service, refresh };
}
