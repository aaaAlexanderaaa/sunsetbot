import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { referenceModel } from '../scripts/scattering-reference.mjs';
import { computeForecast } from '../research/model-snapshots/section-optics-0.3.1/engine.mjs';

test('the equal-altitude comparator exposes the exact frozen frame without changing the forecast', async () => {
  const c = JSON.parse(await readFile(new URL('../research/backtests/shanghai-era5-input-2023-06/2023-06-03-sunset.json', import.meta.url), 'utf8'));
  const reference = await referenceModel(), inputs = { weather: c.era5Weather, aerosol: c.eac4Aerosol,
    event: c.event, location: c.location, fanOffsets: c.fanOffsets };
  const forecast = computeForecast(inputs), wrapped = reference.module.computeForecast(inputs);
  assert.deepEqual(wrapped, forecast);
  const frame = reference.module.computeReferenceFrame(c.era5Weather, c.eac4Aerosol, Date.parse(c.event.time), c.location, c.event, c.fanOffsets);
  assert.equal(frame.score, forecast.timeline.find(p => p.time === c.event.time).score);
  assert.equal(frame.solarAltitude, forecast.timeline.find(p => p.time === c.event.time).solarAltitude);
});
