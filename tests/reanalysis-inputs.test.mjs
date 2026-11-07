import test from 'node:test';
import assert from 'node:assert/strict';
import { mixPressureFields } from '../scripts/reanalysis-inputs.mjs';

test('pressure-only intervention aligns surplus archive hours and preserves ancillary values', () => {
  const control = [{ elevation: 15, hourly: { time: [0, 3600, 7200, 10800, 14400],
    cloud_cover_500hPa: [10, 11, 12, 13, 14], geopotential_height_500hPa: [5000, 5100, 5200, 5300, 5400],
    cloud_cover_high: [10, 20, 30, 40, 50], precipitation: [0, 1, 2, 3, 4], visibility: [null, 9000, 8000, 7000, null] } }];
  const snapshot = structuredClone(control);
  const reanalysis = [{ hourly: { time: [3600, 7200, 10800], cloud_cover_500hPa: [61, 62, 63],
    geopotential_height_500hPa: [5500, 5600, 5700], cloud_cover_high: [99, 99, 99] } }];
  const mixed = mixPressureFields(control, reanalysis, /^cloud_cover_\d+hPa$/);
  assert.deepEqual(mixed[0].hourly, { time: [3600, 7200, 10800], cloud_cover_500hPa: [61, 62, 63],
    geopotential_height_500hPa: [5100, 5200, 5300], cloud_cover_high: [20, 30, 40],
    precipitation: [1, 2, 3], visibility: [9000, 8000, 7000] });
  assert.deepEqual(control, snapshot);
  assert.equal(mixed[0].elevation, 15);
  assert.throws(() => mixPressureFields(control, [{ hourly: { time: [1800] } }], /^cloud/), /UTC hour/);
});
