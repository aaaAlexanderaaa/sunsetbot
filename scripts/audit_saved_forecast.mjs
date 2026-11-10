// Replay a retained GFS/ECMWF pair and isolate input changes without acquisition.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { computeForecast, MODEL_VERSION } from '../src/engine.mjs';
import { LEVELS } from '../src/provider.mjs';
import { cloudInputDiagnostics } from '../src/forecast-assessment.mjs';

const directory = process.argv[2];
if (!directory) throw Error('Usage: node scripts/audit_saved_forecast.mjs <retained-pair-directory> [output.json]');
const bundles = {}, sources = {};
for (const model of ['gfs', 'ecmwf']) {
  const file = join(directory, `${model}-retained.json`), bytes = await readFile(file);
  const bundle = JSON.parse(bytes);
  if (bundle.schemaVersion !== 1 || bundle.result.model !== model || bundle.result.modelVersion !== MODEL_VERSION) {
    throw Error('Retained model/source identity differs from this engine');
  }
  sources[model] = { file, sha256: createHash('sha256').update(bytes).digest('hex') };
  bundles[model] = bundle;
}
const gfs = bundles.gfs, ecmwf = bundles.ecmwf;
for (const key of ['location', 'date', 'eventType', 'event']) {
  if (JSON.stringify(gfs.result[key]) !== JSON.stringify(ecmwf.result[key])) throw Error('Forecast event/location identities differ');
}
if (JSON.stringify(gfs.inputs.points) !== JSON.stringify(ecmwf.inputs.points) ||
    JSON.stringify(gfs.inputs.fanOffsets) !== JSON.stringify(ecmwf.inputs.fanOffsets)) throw Error('Requested sampling plans differ');
const run = (bundle, weather = bundle.inputs.weather.data, aerosol = bundle.inputs.aerosol?.data ?? null) =>
  computeForecast({ weather, aerosol, event: bundle.result.event, location: bundle.result.location, fanOffsets: bundle.inputs.fanOffsets });
const cases = {};
for (const [model, bundle] of Object.entries(bundles)) {
  const result = run(bundle);
  if (result.score !== bundle.result.score || JSON.stringify(result.timeline) !== JSON.stringify(bundle.result.timeline)) {
    throw Error('Retained forecast fails exact index/timeline replay');
  }
  cases[model] = { id: bundle.result.id, score: result.score, peakTime: result.peakTime, window: result.window,
    weatherFetchedAt: bundle.result.data.weather.fetchedAt, aerosolFetchedAt: bundle.result.data.aerosol.fetchedAt,
    cloudInputDiagnostics: cloudInputDiagnostics(bundle.result, bundle.inputs.weather.data, bundle.inputs.fanOffsets) };
}
const interventions = {};
for (const kind of ['pressureCloudOnly', 'heightsOnly', 'allWeather', 'aerosolOnly']) {
  let weather = structuredClone(ecmwf.inputs.weather.data), aerosol = ecmwf.inputs.aerosol?.data ?? null;
  if (kind === 'allWeather') weather = gfs.inputs.weather.data;
  if (kind === 'aerosolOnly') aerosol = gfs.inputs.aerosol?.data ?? null;
  if (kind === 'pressureCloudOnly' || kind === 'heightsOnly') {
    for (let i = 0; i < weather.length; i++) for (const pressure of LEVELS) {
      const field = `${kind === 'pressureCloudOnly' ? 'cloud_cover' : 'geopotential_height'}_${pressure}hPa`;
      weather[i].hourly[field] = gfs.inputs.weather.data[i].hourly[field];
    }
  }
  interventions[kind] = run(ecmwf, weather, aerosol).score;
}
const receipt = { auditedAt: new Date().toISOString(), modelVersion: MODEL_VERSION, sources, cases, interventions,
  scope: 'Exact saved-index/timeline replay and deterministic input sensitivity at the same requested sampling plan. '
    + 'Mixed inputs are development diagnostics; their meteorological consistency, actual cloud truth, viewing outcome and forecast skill have separate scope.' };
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
