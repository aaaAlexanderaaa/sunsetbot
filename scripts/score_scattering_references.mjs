// Freeze reference predictions from weather alone, before independent labels.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { referenceModel } from './scattering-reference.mjs';
import { solarAltitudeReference } from '../src/scattering-engine.mjs';
import { interpolate } from '../research/model-snapshots/section-optics-0.3.1/provider.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const directory = 'research/experiments/scattering-weather-inputs', manifestBytes = await readFile(directory + '/manifest.json');
const manifest = JSON.parse(manifestBytes), reference = await referenceModel(), cases = [];
for (const receipt of manifest.cases) {
  const bytes = await readFile(directory + '/' + receipt.file);
  if (hash(bytes) !== receipt.sha256) throw Error('Reference weather hash changed');
  const input = JSON.parse(bytes);
  if (input.observedCase || input.observedGrade !== undefined) throw Error('Weather-only reference inputs required');
  const solar = solarAltitudeReference(input.event, input.location), time = Date.parse(solar.time);
  const frame = reference.module.computeReferenceFrame(input.weather, input.aerosol, time, input.location, input.event, input.fanOffsets);
  const forecast = reference.module.computeForecast(input), center = Math.floor(input.fanOffsets.length / 2) * reference.module.DISTANCES.length + reference.module.DISTANCES.indexOf(0);
  const [low, mid, high] = ['low', 'mid', 'high'].map(level => interpolate(input.weather[center], 'cloud_cover_' + level, time));
  if (![low, mid, high].every(Number.isFinite)) throw Error('Native cloud-layer baseline incomplete');
  cases.push({ id: input.id, date: input.date, eventType: input.eventType, reference: solar,
    heuristicReferenceScore: frame.score, heuristicPeakScore: forecast.score, heuristicPeakTime: forecast.peakTime,
    nativeBaselineScore: Math.max(mid, high) * (1 - low / 100), nativeCloudPercent: { low, mid, high },
    precipitation: frame.rain, visibility: frame.visibility,
    source: { file: directory + '/' + receipt.file, sha256: receipt.sha256 } });
}
const output = 'research/experiments/scattering-reference-predictions.json';
await writeFile(output, JSON.stringify({ computedAt: new Date().toISOString(), cases, model: reference.recipe,
  weatherManifestSha256: hash(manifestBytes), scriptSha256: hash(await readFile(new URL(import.meta.url))),
  solarReferenceSourceSha256: hash(await readFile('src/scattering-engine.mjs')),
  observedLabelsRead: 0, scope: '122 prospective weather-only reference predictions: original eleven-level heuristic at common Sun altitude and its original curve peak; native ERA5 layer baseline. Missing optional rain/visibility use the frozen neutral defaults.' }, null, 2) + '\n');
console.log(JSON.stringify({ output, cases: cases.length, labelsRead: 0 }));
