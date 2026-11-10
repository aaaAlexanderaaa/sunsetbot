import { DiskCache } from './cache.mjs';
import { ForecastService, eventTimingNotes } from './service.mjs';
import { MODEL_VERSION } from './engine.mjs';
import { civilDate, addDays, round } from './astro.mjs';
import { refreshSchedule } from './refresh-schedule.mjs';
import { SOURCE_MAX_AGE_MS } from './source-snapshots.mjs';
import { AppError } from './errors.mjs';
import { cloudInputDiagnostics, assessForecast } from './forecast-assessment.mjs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const forecastKey = input => JSON.stringify([
  input.location.id, input.location.lat, input.location.lon, input.date, input.eventType ?? input.event, input.model,
]);

export class PublishedForecasts {
  constructor(directory, { now = () => Date.now() } = {}) {
    this.disk = new DiskCache(directory, { maxEntries: 1 });
    this.now = now;
    this.entries = new Map();
    this.publishedAt = null;
  }
  async load() {
    const saved = await this.disk.get('published');
    if (saved?.schemaVersion !== 1 || saved.modelVersion !== MODEL_VERSION || !Array.isArray(saved.entries)) return;
    this.entries = new Map(saved.entries.map(entry => [forecastKey(entry.result), entry]));
    this.publishedAt = saved.publishedAt;
  }
  get(input) { return this.entries.get(forecastKey(input)); }
  async importRetained(directory) {
    if (this.entries.size) return;
    let files;
    try { files = await readdir(directory); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    const entries = [], today = civilDate(this.now());
    for (const file of files.filter(file => file.endsWith('.json')).slice(0, 180)) {
      let saved;
      try { saved = JSON.parse(await readFile(join(directory, file), 'utf8')); }
      catch (error) { if (error instanceof SyntaxError || error.code === 'ENOENT') continue; throw error; }
      const result = saved.result;
      if (result?.modelVersion !== MODEL_VERSION || !result.data?.weather?.fetchedAt || result.date < today || result.date > addDays(today, 3)) continue;
      entries.push({ result: { ...result, retention: { state: 'saved', retainedAt: saved.retainedAt, limit: 180 } }, refresh: {
        kind: 'retained', jobId: null, sourceId: `retained:${result.id}`, requestedAt: result.generatedAt,
        publishedAt: result.generatedAt, nextUpdateAt: refreshSchedule(result.generatedAt).nextUpdateAt,
      } });
    }
    await this.publish(entries);
  }
  async publish(entries) {
    if (!entries.length) return;
    const today = civilDate(this.now()), merged = new Map(this.entries);
    for (const entry of entries) merged.set(forecastKey(entry.result), entry);
    const retained = [...merged.values()].filter(entry =>
      entry.result.date >= addDays(today, -1) && entry.result.date <= addDays(today, 4))
      .sort((a, b) => Date.parse(b.refresh.publishedAt) - Date.parse(a.refresh.publishedAt)).slice(0, 512);
    const publishedAt = new Date(this.now()).toISOString();
    await this.disk.put('published', { schemaVersion: 1, modelVersion: MODEL_VERSION,
      fetchedAt: this.now(), publishedAt, entries: retained });
    this.entries = new Map(retained.map(entry => [forecastKey(entry.result), entry]));
    this.publishedAt = publishedAt;
  }
}

export function publicationFor(snapshot, publishedAt) {
  return { kind: snapshot.kind, jobId: snapshot.jobId, sourceId: snapshot.sourceId,
    requestedAt: snapshot.requestedAt, publishedAt,
    nextUpdateAt: refreshSchedule(snapshot.requestedAt).nextUpdateAt,
    weatherSamplingDegrees: 0.25, aerosolSamplingDegrees: 0.4,
    weatherFetchedThrough: new Date(snapshot.weather.fetchedThrough ?? snapshot.weather.fetchedAt).toISOString() };
}

export class CachedForecastService {
  constructor({ published, sources, archive = null, now = () => Date.now() }) {
    Object.assign(this, { published, sources, archive, now });
    this.validation = new ForecastService({ provider: null, now });
    this.local = new Map();
    this.pending = new Map();
    this.diagnostics = new Map();
  }
  async forecast(params) {
    const input = this.validation.validate(params), saved = this.published.get(input);
    if (saved) return this.assess(saved);
    const provider = this.sources.forInput(input, this.now());
    if (!provider) {
      const coveredModel = this.sources.hasModel(input.model);
      throw new AppError(coveredModel ? 'NO_LOCAL_COVERAGE' : 'FORECAST_PENDING', coveredModel ?
        '所选位置或时段超出本地资料覆盖，请选择预设地点的未来朝晚霞。' : '所选预报的本地资料待更新，请稍后查看计划更新结果。', 503,
      { cacheState: coveredModel ? 'coverage_missing' : 'missing', nextUpdateAt: refreshSchedule(this.now()).nextUpdateAt });
    }
    const key = provider.snapshot.sourceId + forecastKey(input);
    if (this.local.has(key)) return this.assess(this.local.get(key));
    if (this.pending.has(key)) return this.assess(await this.pending.get(key));
    if (this.pending.size >= 2) throw new AppError('BUSY', '正在计算其他本地预报，请稍后重试。', 429);
    const task = (async () => {
      const result = await new ForecastService({ provider, archive: this.archive, now: this.now }).compute(input);
      const entry = { result, refresh: publicationFor(provider.snapshot, new Date(this.now()).toISOString()) };
      this.local.set(key, entry);
      if (this.local.size > 64) this.local.delete(this.local.keys().next().value);
      return entry;
    })();
    this.pending.set(key, task);
    try { return this.assess(await task); } finally { this.pending.delete(key); }
  }
  async assess(entry) {
    const result = this.present(entry);
    if (result.state === 'no_event') return result;
    if (!result.cloudInputDiagnostics && this.archive?.inputsFor) {
      if (!this.diagnostics.has(result.id)) {
        let diagnostic = null;
        try {
          const inputs = await this.archive.inputsFor(result);
          if (inputs?.weather?.data && Array.isArray(inputs.fanOffsets)) {
            diagnostic = cloudInputDiagnostics(result, inputs.weather.data, inputs.fanOffsets);
          }
        } catch { /* Optional retained-input diagnostics leave the saved forecast available. */ }
        this.diagnostics.set(result.id, diagnostic);
        if (this.diagnostics.size > 64) this.diagnostics.delete(this.diagnostics.keys().next().value);
      }
      result.cloudInputDiagnostics = this.diagnostics.get(result.id);
    }
    const otherModel = result.model === 'gfs' ? 'ecmwf' : 'gfs';
    const otherInput = { ...result, model: otherModel };
    const companion = this.published.get(otherInput) ?? [...this.local.values()].reverse().find(e =>
      forecastKey(e.result) === forecastKey(otherInput));
    let comparison = { state: 'unavailable', reason: 'saved_comparison_missing',
      meaning: '另一模式的对应预报待保存，当前展示所选模式的实验指数。' };
    if (companion && companion.result.modelVersion === result.modelVersion && companion.result.state !== 'no_event') {
      let other;
      try { other = this.present(companion); }
      catch (error) { if (error.code !== 'FORECAST_EXPIRED') throw error; comparison.reason = 'saved_comparison_expired'; }
      if (other) {
        const forecasts = [result, other].sort((a, b) => a.model.localeCompare(b.model)).map(r => ({
          model: r.model, score: r.score, label: r.label, id: r.id,
          generatedAt: r.generatedAt, weatherFetchedAt: r.data.weather.fetchedAt, state: r.state,
        }));
        comparison = { state: 'available', forecasts, difference: round(Math.abs(result.score - other.score), 1),
          labelsDiffer: result.label !== other.label,
          sameRefresh: Boolean(entry.refresh.jobId && entry.refresh.jobId === companion.refresh.jobId),
          meaning: '同一地点、日期与事件的两种天气输入各自计算的实验指数；各自资料时间随结果列出。' };
      }
    }
    result.modelComparison = comparison;
    result.assessment = assessForecast(result, comparison);
    return result;
  }
  present(entry) {
    const result = structuredClone(entry.result);
    if (result.state === 'no_event') return result;
    const age = this.now() - Date.parse(result.data.weather.fetchedAt);
    if (age < 0 || age > SOURCE_MAX_AGE_MS) throw new AppError('FORECAST_EXPIRED', '保存的天气资料已超出有效年龄，请等待计划更新。', 503,
      { cacheState: 'expired', nextUpdateAt: refreshSchedule(this.now()).nextUpdateAt });
    const overdue = this.now() >= Date.parse(entry.refresh.nextUpdateAt);
    result.data.weather.ageMinutes = round(age / 60000);
    result.timeUntilEventHours = round((Date.parse(result.event.time) - this.now()) / 3600000, 1);
    result.timingNotes = eventTimingNotes(result.timeUntilEventHours);
    if (entry.refresh.weatherSamplingDegrees === 0.25) result.uncertainty.push('天气资料按共享的 0.25° 网格取样，地形采用该网格位置的供应商高度；海岸与山地的局部差异需结合现场。');
    if (result.data.aerosol.fetchedAt) result.data.aerosol.ageMinutes = round((this.now() - Date.parse(result.data.aerosol.fetchedAt)) / 60000);
    result.cache = { ...entry.refresh, state: overdue ? 'stale' : 'published',
      nextScheduledAt: refreshSchedule(this.now()).nextUpdateAt };
    if (overdue) {
      result.state = 'stale';
      result.data.weather.staleReason = 'SCHEDULED_UPDATE_PENDING';
      result.uncertainty.unshift('计划更新尚待完成，当前显示保留了原始获取时间的本地预报。');
    }
    return result;
  }
}
