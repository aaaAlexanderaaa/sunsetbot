import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { computeForecast } from '../src/engine.mjs';

const model = process.argv[2] ?? 'gfs';
if (!['gfs', 'ecmwf'].includes(model)) throw Error('Choose gfs or ecmwf');
const directory = fileURLToPath(new URL('../research/live/', import.meta.url));
const read = async file => JSON.parse(await readFile(join(directory, file), 'utf8'));
const legacy = process.argv.includes('--legacy');
const captured = await read(`${legacy ? '' : 'fan-'}shanghai-${model}.json`);
let weather, aerosol, fanOffsets = [0];
if (legacy) {
  weather = await read(`source-${model}.json`);
  aerosol = await read('source-cams.json');
} else {
  const manifest = await read('fan-forecasts/manifest.json');
  const source = manifest.find(r => r.id === captured.id);
  if (!source) throw Error('The captured response requires its matching source archive');
  const record = await read('fan-forecasts/' + source.file);
  ({ weather, aerosol, fanOffsets } = record.inputs);
}
const result = computeForecast({ weather: weather.data, aerosol: aerosol?.data ?? null,
  event: captured.event, location: captured.location, fanOffsets });
console.log(JSON.stringify({ model, referenceDate: captured.date, modelVersion: result.modelVersion,
  score: result.score, peakTime: result.peakTime, aod: result.aod, window: result.window,
  capturedModelVersion: captured.modelVersion, capturedScore: captured.score,
  matchesCapturedScore: captured.modelVersion === result.modelVersion ? captured.score === result.score : null }, null, 2));
