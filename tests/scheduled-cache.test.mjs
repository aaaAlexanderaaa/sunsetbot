import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PRESETS } from '../src/presets.mjs';
import { solarEvent, civilDate } from '../src/astro.mjs';
import { fixture } from './fixture.mjs';
import { createApp } from '../src/server.mjs';
import { DiskCache } from '../src/cache.mjs';
import { AppError } from '../src/errors.mjs';
import { AcquisitionPacer } from '../src/acquisition-pacer.mjs';
import { refreshSchedule, upcomingEvents } from '../src/refresh-schedule.mjs';
import { acquisitionPlan } from '../src/source-snapshots.mjs';
import { createAcquisitionProvider, createForecastRuntime } from '../src/refresh.mjs';

const SHANGHAI = PRESETS[0];
const AT = Date.parse('2026-11-08T07:00:00Z');

function rows(points, start, end, aerosol = false) {
  const first = Date.parse(start + 'T00:00:00Z') / 1000;
  const count = (Date.parse(end + 'T00:00:00Z') / 1000 - first) / 3600 + 24;
  const times = Array.from({ length: count }, (_, i) => first + i * 3600);
  const template = fixture()[0];
  const hourly = aerosol ? { time: times, aerosol_optical_depth: times.map(() => 0.2) } :
    Object.fromEntries(Object.entries(template.hourly).map(([key, values]) => [key, key === 'time' ? times : times.map(() => values[0])]));
  return points.map(point => ({ ...template, latitude: point.lat, longitude: point.lon, hourly,
    hourly_units: aerosol ? { time: 'unixtime', aerosol_optical_depth: '' } : template.hourly_units }));
}

async function setup(t, { locations = [SHANGHAI], initial = AT } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'sunset-scheduled-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const state = { now: initial, calls: 0, points: 0, failWeather: false, failAerosol: false, gate: null };
  const now = () => state.now;
  const provider = {
    weather: async (points, model, start, end) => {
      state.calls++; state.points += points.length;
      if (state.gate) await state.gate;
      if (state.failWeather) throw new AppError('UPSTREAM_UNAVAILABLE', 'test offline');
      return { data: rows(points, start, end), fetchedAt: now() };
    },
    aerosol: async (points, start, end) => {
      state.calls++; state.points += points.length;
      if (state.failAerosol) throw new AppError('AEROSOL_UNAVAILABLE', 'test offline');
      return { data: rows(points, start, end, true), fetchedAt: now() };
    },
  };
  const runtime = await createForecastRuntime({ directory, provider, now, locations });
  t.after(() => runtime.refresh.stop());
  return { directory, provider, runtime, state, now, locations };
}

test('Shanghai slots and upcoming event identities are independent of the process zone', () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = 'America/Los_Angeles';
    assert.deepEqual(refreshSchedule('2026-11-07T23:59:59Z'), {
      timezone: 'Asia/Shanghai', hours: [8, 16], latestSlot: '2026-11-07T08:00:00.000Z', nextUpdateAt: '2026-11-08T00:00:00.000Z',
    });
    assert.equal(refreshSchedule('2026-11-08T00:00:00Z').latestSlot, '2026-11-08T00:00:00.000Z');
    assert.equal(refreshSchedule('2026-11-08T08:00:00Z').nextUpdateAt, '2026-11-09T00:00:00.000Z');
    const events = upcomingEvents(SHANGHAI, '2026-11-08T00:00:00Z', 3);
    assert.deepEqual(events.filter(e => e.event === 'sunrise').map(e => e.date), ['2026-11-09', '2026-11-10', '2026-11-11']);
    assert.deepEqual(events.filter(e => e.event === 'sunset').map(e => e.date), ['2026-11-08', '2026-11-09', '2026-11-10']);
    const sunrise = solarEvent('2026-11-08', 'sunrise', SHANGHAI.lat, SHANGHAI.lon, SHANGHAI.timezone);
    assert.equal(upcomingEvents(SHANGHAI, sunrise.time, 1).find(e => e.event === 'sunrise').date, '2026-11-09');
    assert.equal(civilDate(sunrise.time), '2026-11-08');
  } finally {
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
  }
});

test('a fixed eleven-city three-occurrence plan fits the daily budget by sharing native cells', () => {
  for (const date of ['2026-03-21', '2026-06-21', '2026-11-08', '2026-12-21']) {
    const plans = [0, 8].map(hour => acquisitionPlan(PRESETS, `${date}T${String(hour).padStart(2, '0')}:00:00Z`, 3));
    assert.ok(plans.reduce((sum, p) => sum + p.estimatedUnits, 0) < 10000);
    for (const plan of plans) {
      assert.equal(plan.events.length, 66);
      assert.equal(new Set(plan.weatherPoints.map(p => JSON.stringify(p))).size, plan.weatherPoints.length);
      assert.ok(plan.weatherPoints.length < 66 * 42);
      assert.ok(plan.weatherPoints.every(p => Number.isInteger(p.lat * 4) && Number.isInteger(p.lon * 4)));
    }
  }
});

test('real HTTP public reads and unauthorized refreshes have zero external effects', async t => {
  const { runtime, state, now } = await setup(t);
  const app = createApp({ ...runtime, now, refreshKey: 'test-refresh-key' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  for (const path of ['/healthz', '/api/v1/status', '/api/v1/locations', '/api/v1/evaluation',
    '/api/v1/forecast?city=shanghai', '/api/v1/forecast?lat=27&lon=116', '/api/v1/refresh?key=test-refresh-key']) {
    const response = await fetch(base + path);
    await response.arrayBuffer();
  }
  for (const headers of [{}, { 'X-Refresh-Key': 'incorrect' }]) {
    const response = await fetch(base + '/api/v1/refresh', { method: 'POST', headers });
    assert.equal(response.status, 401);
  }
  assert.equal(state.calls, 0);
  const response = await fetch(base + '/api/v1/refresh', { method: 'POST', headers: { 'X-Refresh-Key': 'test-refresh-key' } });
  assert.equal(response.status, 202);
  const receipt = await response.json();
  assert.equal(receipt.job.occurrences, 1);
  assert.deepEqual(receipt.job.targets, [
    { city: 'shanghai', date: '2026-11-09', event: 'sunrise' }, { city: 'shanghai', date: '2026-11-08', event: 'sunset' },
  ]);
  await runtime.refresh.idle();
  assert.equal(runtime.refresh.status().job.state, 'succeeded');
  const effects = state.calls;
  for (let i = 0; i < 15; i++) {
    const result = await fetch(base + '/api/v1/forecast?city=shanghai&event=sunset');
    assert.equal(result.status, 200);
    assert.equal((await result.json()).cache.kind, 'forced');
  }
  const local = await fetch(base + `/api/v1/forecast?lat=${SHANGHAI.lat}&lon=${SHANGHAI.lon}&event=sunset`);
  assert.equal(local.status, 200);
  assert.equal((await local.json()).location.id, 'custom');
  const missing = await fetch(base + '/api/v1/forecast?lat=27&lon=116');
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).error.code, 'NO_LOCAL_COVERAGE');
  assert.equal(state.calls, effects);
});

test('authorized concurrent requests join one refresh job while readers retain the old generation', async t => {
  const { runtime, state } = await setup(t);
  await runtime.refresh.trigger('forced'); await runtime.refresh.idle();
  const query = new URLSearchParams('city=shanghai&event=sunset');
  const original = await runtime.service.forecast(query);
  let release;
  state.gate = new Promise(resolve => { release = resolve; });
  state.now += 300000;
  try {
    const [a, b] = await Promise.all([runtime.refresh.trigger('forced'), runtime.refresh.trigger('forced')]);
    assert.equal(a.id, b.id);
    const during = await runtime.service.forecast(query);
    assert.equal(during.id, original.id);
    assert.ok(during.data.weather.ageMinutes >= 5);
  } finally { release(); state.gate = null; }
  await runtime.refresh.idle();
  const updated = await runtime.service.forecast(query);
  assert.notEqual(updated.id, original.id);
  assert.equal(updated.cache.jobId, runtime.refresh.status().job.id);
});

test('scheduled claims persist before effects, survive interrupted restart, and advance only at the next slot', async t => {
  const { directory, provider, runtime, state, now, locations } = await setup(t);
  const weather = provider.weather;
  provider.weather = async (...args) => {
    const saved = await new DiskCache(join(directory, 'refresh')).get('state');
    assert.equal(saved.latestScheduledSlot, refreshSchedule(now()).latestSlot);
    assert.equal(saved.job.state, 'running');
    return weather(...args);
  };
  await runtime.refresh.tick(); await runtime.refresh.idle();
  assert.equal(runtime.refresh.status().job.occurrences, 3);
  assert.equal(runtime.refresh.status().job.publishedForecasts, 12);
  const calls = state.calls;
  await runtime.refresh.tick(); await runtime.refresh.idle();
  assert.equal(state.calls, calls);
  const disk = new DiskCache(join(directory, 'refresh'));
  const saved = await disk.get('state'); saved.job.state = 'running'; await disk.put('state', saved);
  const restarted = await createForecastRuntime({ directory, provider, now, locations });
  assert.equal(restarted.refresh.status().job.state, 'interrupted');
  await restarted.refresh.tick(); await restarted.refresh.idle();
  assert.equal(state.calls, calls);
  const existing = await restarted.service.forecast(new URLSearchParams('city=shanghai&event=sunset'));
  assert.equal(existing.cache.kind, 'scheduled');
  const thirdSunrise = await restarted.service.forecast(new URLSearchParams('city=shanghai&event=sunrise&date=2026-11-11'));
  assert.equal(thirdSunrise.date, '2026-11-11');
  state.now = Date.parse('2026-11-08T08:00:00Z');
  await restarted.refresh.tick(); await restarted.refresh.idle();
  assert.ok(state.calls > calls);
  assert.equal(restarted.refresh.status().latestScheduledSlot, '2026-11-08T08:00:00.000Z');
});

test('optional aerosol failure publishes partial results; required failure keeps saved outputs through restart', async t => {
  const { directory, provider, runtime, state, now, locations } = await setup(t);
  state.failAerosol = true;
  await runtime.refresh.trigger('forced'); await runtime.refresh.idle();
  const query = new URLSearchParams('city=shanghai&event=sunset');
  const partial = await runtime.service.forecast(query);
  assert.equal(partial.state, 'partial');
  assert.equal(partial.data.aerosol.fetchedAt, null);
  assert.equal(runtime.refresh.status().job.state, 'partial');
  state.now += 10000; state.failWeather = true;
  await runtime.refresh.trigger('forced'); await runtime.refresh.idle();
  assert.equal(runtime.refresh.status().job.state, 'failed');
  assert.equal((await runtime.service.forecast(query)).id, partial.id);
  const calls = state.calls;
  const restarted = await createForecastRuntime({ directory, provider, now, locations });
  assert.equal((await restarted.service.forecast(query)).id, partial.id);
  assert.equal(state.calls, calls);
});

test('forced subsets preserve full-source coverage and cached time/expiry semantics', async t => {
  const { runtime, state } = await setup(t);
  await runtime.refresh.tick(); await runtime.refresh.idle();
  state.now += 60000;
  await runtime.refresh.trigger('forced'); await runtime.refresh.idle();
  const effects = state.calls;
  const future = await runtime.service.forecast(new URLSearchParams(
    `lat=${SHANGHAI.lat}&lon=${SHANGHAI.lon}&date=2026-11-10&event=sunset`));
  assert.equal(future.cache.kind, 'scheduled');
  state.now = Date.parse('2026-11-08T10:00:00Z');
  const past = await runtime.service.forecast(new URLSearchParams('city=shanghai&event=sunset'));
  assert.equal(past.state, 'stale');
  assert.ok(past.timeUntilEventHours < 0);
  assert.ok(past.timingNotes[0].includes('已发生'));
  state.now = AT + 49 * 3600000;
  await assert.rejects(runtime.service.forecast(new URLSearchParams('city=shanghai&date=2026-11-11&event=sunrise')), e => e.code === 'FORECAST_EXPIRED');
  assert.equal(state.calls, effects);
});

test('minute admissions and failed effects survive a pacer restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sunset-pacer-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let now = 1000, waited = 0, effects = 0;
  const options = { now: () => now, wait: async ms => { waited += ms; now += ms; }, limit: 480 };
  const pacer = new AcquisitionPacer(directory, options);
  await pacer.run(240, async () => { effects++; });
  await assert.rejects(pacer.run(240, async () => { effects++; throw Error('offline'); }), /offline/);
  const restarted = new AcquisitionPacer(directory, options);
  await restarted.run(240, async () => { effects++; });
  assert.equal(effects, 3);
  assert.equal(waited, 60000);
});

test('the rolling hourly allowance survives restart independently of the minute allowance', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sunset-hourly-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let now = 1000, waited = 0;
  const options = { now: () => now, wait: async ms => { waited += ms; now += ms; }, limit: 480, hourlyLimit: 720 };
  const first = new AcquisitionPacer(directory, options);
  for (let i = 0; i < 3; i++) { await first.run(240, async () => {}); now += 60000; }
  const restarted = new AcquisitionPacer(directory, options);
  await restarted.run(240, async () => {});
  assert.equal(waited, 3600000 - 180000);
});

test('job reservations protect scheduled capacity and preserve their full debit across crashes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sunset-reservation-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const settings = { directory, now: () => AT, dailyBudget: 1000,
    pacer: { run: async (_units, action) => action() }, fetcher: async () => Response.json({}) };
  const provider = createAcquisitionProvider(settings);
  await assert.rejects(provider.reserve(400, 700), e => e.code === 'REFRESH_BUDGET');
  await provider.reserve(400, 500);
  const restarted = createAcquisitionProvider(settings);
  await assert.rejects(restarted.reserve(200, 500), e => e.code === 'REFRESH_BUDGET');
  const ledger = JSON.parse(await (await import('node:fs/promises')).readFile(join(directory, 'weather-budget.json'), 'utf8'));
  assert.equal(ledger.units, 400);
});

test('a reserved job crossing UTC midnight reserves its remaining effects in the new day', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sunset-reservation-midnight-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let now = Date.parse('2026-11-08T23:59:00Z');
  const provider = createAcquisitionProvider({ directory, now: () => now, dailyBudget: 1000,
    pacer: { run: async (_units, action) => action() }, fetcher: async () => Response.json({}) });
  await provider.reserve(400, 0);
  await provider.request('https://example.test', 100);
  now += 120000;
  await provider.request('https://example.test', 100);
  const ledger = JSON.parse(await (await import('node:fs/promises')).readFile(join(directory, 'weather-budget.json'), 'utf8'));
  assert.equal(ledger.day, '2026-11-09');
  assert.equal(ledger.units, 300);
});

test('a forced request crossing an event instant gets an explicit conflict and old job receipts remain queryable', async t => {
  const sunrise = solarEvent('2026-11-08', 'sunrise', SHANGHAI.lat, SHANGHAI.lon, SHANGHAI.timezone);
  const { runtime, state } = await setup(t, { initial: Date.parse(sunrise.time) - 1 });
  let release;
  state.gate = new Promise(resolve => { release = resolve; });
  const first = await runtime.refresh.trigger('forced');
  try {
    state.now += 2;
    await assert.rejects(runtime.refresh.trigger('forced'), e => e.code === 'REFRESH_BUSY' && e.status === 409);
  } finally { release(); state.gate = null; }
  await runtime.refresh.idle();
  state.now += 1000;
  await runtime.refresh.trigger('forced'); await runtime.refresh.idle();
  assert.equal(runtime.refresh.status(first.id).job.state, 'succeeded');
  assert.notEqual(runtime.refresh.status().job.id, first.id);
});

test('an output publication write failure preserves the prior generation in memory and on disk', async t => {
  const { directory, provider, runtime, state, now, locations } = await setup(t);
  await runtime.refresh.trigger('forced'); await runtime.refresh.idle();
  const query = new URLSearchParams('city=shanghai');
  const prior = await runtime.service.forecast(query);
  runtime.service.published.disk.put = async () => { throw Error('test storage interruption'); };
  state.now += 10000;
  await runtime.refresh.trigger('forced'); await runtime.refresh.idle();
  assert.equal(runtime.refresh.status().job.state, 'failed');
  assert.equal((await runtime.service.forecast(query)).id, prior.id);
  const restarted = await createForecastRuntime({ directory, provider, now, locations });
  assert.equal((await restarted.service.forecast(query)).id, prior.id);
});

test('acquisition refreshes bypass source TTL while local HTTP computation consumes the same captured inputs', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sunset-acquisition-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let now = AT, calls = 0;
  const provider = createAcquisitionProvider({ directory, now: () => now,
    pacer: { run: async (_units, action) => action() },
    fetcher: async value => {
      calls++;
      const url = new URL(value), p = url.searchParams;
      const lat = p.get('latitude').split(',').map(Number), lon = p.get('longitude').split(',').map(Number);
      return Response.json(rows(lat.map((value, i) => ({ lat: value, lon: lon[i] })), p.get('start_date'), p.get('end_date'), url.pathname.includes('air-quality')));
    } });
  const runtime = await createForecastRuntime({ directory, provider, now: () => now, locations: [SHANGHAI] });
  await runtime.refresh.trigger(); await runtime.refresh.idle();
  assert.equal(runtime.refresh.status().job.state, 'succeeded');
  const firstCalls = calls, firstUnits = provider.units;
  const first = await runtime.service.forecast(new URLSearchParams('city=shanghai'));
  assert.equal(calls, firstCalls);
  assert.equal(provider.units, firstUnits);
  now += 1000;
  await runtime.refresh.trigger(); await runtime.refresh.idle();
  assert.equal(calls, firstCalls * 2);
  assert.equal(provider.units, firstUnits * 2);
  assert.notEqual((await runtime.service.forecast(new URLSearchParams('city=shanghai'))).id, first.id);
});
