import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ForecastService } from '../src/service.mjs';
import { ForecastArchive } from '../src/archive.mjs';
import { PublishedForecasts, CachedForecastService } from '../src/published-forecasts.mjs';
import { cloudInputDiagnostics, assessForecast } from '../src/forecast-assessment.mjs';
import { createApp } from '../src/server.mjs';
import { PRESETS } from '../src/presets.mjs';
import { fixture } from './fixture.mjs';

const AT = Date.parse('2026-11-06T07:00:00Z');
const input = { location: PRESETS[0], date: '2026-11-06', event: 'sunset' };

async function forecast(model, { archive = null, low = 45 } = {}) {
  const weather = fixture({ fanCount: 3, clouds: (x, p) => model === 'ecmwf' && p === 300 && x < 200 ? 60 : 0 });
  for (const row of weather) row.hourly.cloud_cover_low.fill(low);
  const service = new ForecastService({ now: () => AT, archive, provider: {
    weather: async () => ({ data: weather, fetchedAt: AT, cache: 'snapshot' }),
    aerosol: async () => { throw Error('optional aerosol unavailable'); },
  } });
  return { result: await service.compute({ ...input, model }), weather };
}

test('cloud diagnostics preserve positive aggregates, missingness and small pressure fractions', async () => {
  const { result, weather } = await forecast('ecmwf');
  const original = structuredClone(weather);
  assert.equal(result.cloudInputDiagnostics.lowCloudGap, true);
  assert.equal(result.cloudInputDiagnostics.layers.low.layerCoverPercent, 45);
  assert.equal(result.cloudInputDiagnostics.layers.low.maximumSampledPressureCoverPercent, 0);
  assert.equal(result.cloudInputDiagnostics.pressureCloudCoverMethod, 'relative-humidity-diagnostic');
  assert.deepEqual(weather, original);
  // A small positive fraction is retained even when the chart rounds it to zero.
  for (const row of weather) row.hourly.cloud_cover_925hPa.fill(0.001);
  let diagnostic = cloudInputDiagnostics(result, weather, [-10, 0, 10]);
  assert.equal(diagnostic.lowCloudGap, false);
  assert.equal(diagnostic.layers.low.maximumSampledPressureCoverPercent, 0.001);
  for (const row of weather) {
    row.hourly.cloud_cover_925hPa.fill(0);
    row.hourly.cloud_cover_low.fill(null);
  }
  diagnostic = cloudInputDiagnostics(result, weather, [-10, 0, 10]);
  assert.equal(diagnostic.layers.low.layerCoverPercent, null);
  assert.equal(diagnostic.lowCloudGap, false);
});

test('retained-input diagnostics require the original forecast and source identity', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sunset-assessment-archive-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const archive = new ForecastArchive(directory, { now: () => AT });
  const { result } = await forecast('ecmwf', { archive });
  assert.ok((await archive.inputsFor(result)).weather.data.length);
  const changed = structuredClone(result);
  changed.data.weather.fetchedAt = new Date(AT + 1000).toISOString();
  assert.equal(await archive.inputsFor(changed), null);
  assert.equal(await archive.inputsFor({ ...result, modelVersion: 'different-engine' }), null);
});

test('agreement of two moderate indices retains unavailable visible-colour calibration', () => {
  const result = { score: 50, label: '中等观赏潜力', cloudInputDiagnostics: { notes: [] } };
  const assessment = assessForecast(result, { state: 'available', labelsDiffer: false, sameRefresh: true,
    forecasts: [{ model: 'gfs', score: 50 }, { model: 'ecmwf', score: 50 }] });
  assert.equal(assessment.qualityCalibration, 'unavailable');
  assert.equal(assessment.label, '可见霞色质量待校准');
  assert.match(assessment.advice, /受光云层信号/);
});

test('real HTTP reads qualify saved model disagreement, retain source identity and recover comparison locally', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sunset-assessment-http-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const archive = new ForecastArchive(join(directory, 'forecasts'), { now: () => AT });
  const gfs = (await forecast('gfs', { archive, low: 0 })).result;
  const ecmwf = (await forecast('ecmwf', { archive })).result;
  assert.notEqual(gfs.label, ecmwf.label);
  const published = new PublishedForecasts(join(directory, 'published'), { now: () => AT });
  const entry = result => ({ result, refresh: { jobId: 'same-refresh', publishedAt: new Date(AT).toISOString(),
    nextUpdateAt: '2026-11-06T08:00:00Z' } });
  // Upgrade existing saved output from before diagnostics were introduced.
  const legacy = structuredClone(ecmwf); delete legacy.cloudInputDiagnostics;
  await published.publish([entry(legacy)]);
  let sourceCalls = 0;
  const service = new CachedForecastService({ published, archive, now: () => AT,
    sources: { forInput: () => { sourceCalls++; throw Error('saved reads must remain local'); } } });
  const app = createApp({ service, now: () => AT });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const url = `http://127.0.0.1:${app.address().port}/api/v1/forecast?city=shanghai&event=sunset&model=ecmwf`;
  const read = async () => {
    const response = await fetch(url); assert.equal(response.status, 200); return response.json();
  };
  let result = await read();
  assert.equal(result.modelComparison.state, 'unavailable');
  assert.equal(result.cloudInputDiagnostics.lowCloudGap, true);
  assert.equal(result.score, ecmwf.score);
  assert.match(result.assessment.advice, /低云分层指标/);
  // A different event never supplies the comparison.
  await published.publish([entry({ ...gfs, eventType: 'sunrise' })]);
  assert.equal((await read()).modelComparison.state, 'unavailable');
  await published.publish([entry(gfs)]);
  result = await read();
  assert.equal(result.modelComparison.state, 'available');
  assert.equal(result.modelComparison.sameRefresh, true);
  assert.equal(result.modelComparison.labelsDiffer, true);
  assert.equal(result.assessment.label, '霞色判断依据存在缺口');
  assert.match(result.assessment.advice, /分歧/);
  assert.equal(result.label, ecmwf.label);
  assert.equal(result.id, ecmwf.id);
  assert.equal(result.generatedAt, ecmwf.generatedAt);
  assert.equal(result.modelComparison.forecasts.find(r => r.model === 'gfs').weatherFetchedAt, gfs.data.weather.fetchedAt);
  // An expired counterpart leaves the selected valid forecast readable.
  const expired = structuredClone(gfs);
  expired.data.weather.fetchedAt = new Date(AT - 49 * 3600000).toISOString();
  await published.publish([entry(expired)]);
  assert.equal((await read()).modelComparison.reason, 'saved_comparison_expired');
  const anotherBatch = entry(gfs); anotherBatch.refresh.jobId = 'another-refresh';
  await published.publish([anotherBatch]);
  result = await read();
  assert.equal(result.modelComparison.sameRefresh, false);
  assert.match(result.assessment.advice, /不同更新批次/);
  assert.equal(sourceCalls, 0);
});
