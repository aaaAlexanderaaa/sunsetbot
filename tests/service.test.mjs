import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DiskCache } from '../src/cache.mjs';
import { WeatherProvider } from '../src/provider.mjs';
import { ForecastService } from '../src/service.mjs';
import { ForecastArchive } from '../src/archive.mjs';
import { createApp } from '../src/server.mjs';
import { AppError } from '../src/errors.mjs';
import { fixture } from './fixture.mjs';

test('concurrent identical requests coalesce, persist, and recover through bounded stale data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sunset-cache-'));
  let now = 1000, loads = 0;
  try {
    const cache = new DiskCache(directory, { now: () => now });
    const load = async () => { loads++; await new Promise(r => setTimeout(r, 5)); return { value: 42 }; };
    const values = await Promise.all(Array.from({ length: 10 }, () => cache.load('shared', load, { ttl: 100, staleFor: 1000 })));
    assert.equal(loads, 1);
    assert.ok(values.every(v => v.data.value === 42));
    now += 200;
    const restarted = new DiskCache(directory, { now: () => now });
    const stale = await restarted.load('shared', async () => { throw new AppError('UPSTREAM_UNAVAILABLE', 'offline'); }, { ttl: 100, staleFor: 1000 });
    assert.equal(stale.cache, 'stale');
    now += 1001;
    await assert.rejects(restarted.load('shared', async () => { throw Error('offline'); }, { ttl: 100, staleFor: 1000 }), /offline/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('an upstream rate limit opens the circuit without a second request', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sunset-provider-'));
  let calls = 0;
  try {
    const provider = new WeatherProvider({ directory, cache: new DiskCache(join(directory, 'cache')),
      fetcher: async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '60' } }); } });
    await assert.rejects(provider.request('https://example.test', 1), e => e.code === 'UPSTREAM_RATE_LIMIT');
    await assert.rejects(provider.request('https://example.test', 1), e => e.code === 'UPSTREAM_COOLDOWN');
    const restarted = new WeatherProvider({ directory, cache: new DiskCache(join(directory, 'cache')),
      fetcher: async () => { calls++; return new Response('{}'); } });
    await assert.rejects(restarted.request('https://example.test', 1), e => e.code === 'UPSTREAM_COOLDOWN');
    assert.equal(calls, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('a response-body timeout keeps a stable upstream error and the spent request debit', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sunset-body-'));
  let calls = 0;
  try {
    const provider = new WeatherProvider({ directory, fetcher: async () => {
      calls++;
      return { ok: true, status: 200, text: async () => { throw new DOMException('body timeout', 'TimeoutError'); } };
    } });
    await assert.rejects(provider.request('https://example.test', 1), e => e.code === 'UPSTREAM_UNAVAILABLE' && e.status === 503);
    assert.equal(calls, 1);
    assert.equal(JSON.parse(await readFile(join(directory, 'weather-budget.json'), 'utf8')).units, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('invalid date, coordinates and model stop before provider effects', async () => {
  let calls = 0;
  const service = new ForecastService({ now: () => Date.parse('2026-11-06T07:00:00Z'), provider: { weather() { calls++; } } });
  for (const query of ['date=2026-02-30', 'model=unknown', 'lat=&lon=121', 'lat=91&lon=121', 'date=2026-11-09']) {
    await assert.rejects(service.forecast(new URLSearchParams(query)), e => e.status === 400);
  }
  assert.equal(calls, 0);
});

test('invalid persisted budget state rejects network work before an upstream effect', async () => {
  const { writeFile } = await import('node:fs/promises');
  const directory = await mkdtemp(join(tmpdir(), 'sunset-budget-'));
  let calls = 0;
  try {
    const provider = new WeatherProvider({ directory, now: () => Date.parse('2026-11-06T08:00:00Z'),
      fetcher: async () => { calls++; return new Response('{}'); } });
    for (const value of [null, false, { day: '2026-11-06', units: 'invalid' }]) {
      await writeFile(join(directory, 'weather-budget.json'), JSON.stringify(value));
      await assert.rejects(provider.request('https://example.test', 1), e => e.code === 'BUDGET_STATE_INVALID');
    }
    assert.equal(calls, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('real HTTP path reports partial aerosol data and preserves error codes', async () => {
  const now = () => Date.parse('2026-11-06T07:00:00Z');
  const service = new ForecastService({ now, archive: { save: async () => { throw Error('test readonly storage'); } }, provider: {
    weather: async () => ({ data: fixture({ fanCount: 3 }), fetchedAt: now(), cache: 'fresh' }),
    aerosol: async () => { throw new AppError('AEROSOL_UNAVAILABLE', 'offline'); },
  } });
  const app = createApp({ service, now });
  await new Promise(r => app.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.address().port}`;
  try {
    const result = await fetch(base + '/api/v1/forecast?city=shanghai&date=2026-11-06');
    const data = await result.json();
    assert.equal(result.status, 200);
    assert.equal(data.state, 'partial');
    assert.equal(data.data.aerosol.error, 'AEROSOL_UNAVAILABLE');
    assert.equal(data.location.id, 'shanghai');
    assert.equal(data.date, '2026-11-06');
    assert.equal(data.retention.state, 'unavailable');
    assert.equal(data.evaluation.study.events, 164);
    assert.equal(data.evaluation.modelVersion, data.modelVersion);
    const evaluation = await fetch(base + '/api/v1/evaluation');
    assert.equal(evaluation.status, 200);
    assert.deepEqual((await evaluation.json()).evidence, data.evaluation);
    assert.ok(data.uncertainty.some(s => s.includes('留存写入失败')));
    const invalid = await fetch(base + '/api/v1/forecast?model=unknown');
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'MODEL_INVALID');
  } finally { await new Promise(r => app.close(r)); }
});

test('forecast retention coalesces identities, preserves exact inputs and prunes old records', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sunset-archive-'));
  let now = 1000;
  try {
    const archive = new ForecastArchive(directory, { now: () => now++, maxEntries: 2 });
    const inputs = { result: { id: 'one' }, weather: { data: [1], fetchedAt: 900 }, aerosol: null };
    const [a, b] = await Promise.all([archive.save(inputs), archive.save(inputs)]);
    assert.equal(a.retainedAt, b.retainedAt);
    await archive.save({ ...inputs, result: { id: 'two' } });
    await archive.save({ ...inputs, result: { id: 'three' } });
    const files = await readdir(directory);
    assert.equal(files.length, 2);
    const records = await Promise.all(files.map(f => readFile(join(directory, f), 'utf8').then(JSON.parse)));
    assert.deepEqual(records.map(r => r.result.id).sort(), ['three', 'two']);
    assert.ok(records.every(r => r.inputs.weather.data[0] === 1 && r.inputs.aerosol === null));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('captured ECMWF protocol accepts its actual common pressure levels and absent optional visibility', async () => {
  const captured = JSON.parse(await readFile(new URL('../research/live/source-ecmwf.json', import.meta.url), 'utf8'));
  const row = captured.data[0], provider = new WeatherProvider({});
  provider.validate(row, { lat: row.latitude, lon: row.longitude });
  const broken = structuredClone(row);
  broken.hourly_units.geopotential_height_925hPa = 'undefined';
  assert.throws(() => provider.validate(broken, { lat: row.latitude, lon: row.longitude }), e => e.code === 'UPSTREAM_PROFILE');
});

test('historical profiles use the public archive, fixed model and bounded UTC hours', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sunset-history-'));
  let requested;
  try {
    const provider = new WeatherProvider({ directory, cache: new DiskCache(join(directory, 'cache')), apiKey: 'test-private-key',
      fetcher: async url => { requested = new URL(url); return Response.json(fixture()[0]); } });
    const result = await provider.weather([{ lat: 31.2304, lon: 121.4737 }], 'gfs', '2026-11-05', '2026-11-07',
      { historical: true, startHour: '2026-11-06T08:00', endHour: '2026-11-06T10:00' });
    assert.equal(result.data.length, 1);
    assert.equal(requested.hostname, 'historical-forecast-api.open-meteo.com');
    assert.equal(requested.searchParams.get('models'), 'gfs_global');
    assert.equal(requested.searchParams.get('start_hour'), '2026-11-06T08:00');
    assert.equal(requested.searchParams.get('start_date'), null);
    assert.equal(requested.searchParams.get('apikey'), null);
    assert.ok(requested.searchParams.get('hourly').includes('geopotential_height_300hPa'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
