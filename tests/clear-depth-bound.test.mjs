import test from 'node:test';
import assert from 'node:assert/strict';
import { clearDepthLowerBound } from '../src/clear-depth-bound.mjs';
import { EARTH_KM, RAD } from '../src/astro.mjs';
import { sectionMedium } from '../src/section-medium.mjs';
import { skyDirection } from '../src/radiative-geometry.mjs';
import { SCATTERING_ASSUMPTIONS } from '../src/scattering-engine.mjs';

const observer = [0, 0, EARTH_KM + 0.005];
const columns = [-150, -75, 0, 75, 150].map((x, index) => ({ x, index, ground: 0,
  aod: [0.12, 0.3, 0.94, 0.2, 0.7][index], levels: [{ height: 0.3, cover: 0 }, { height: 10, cover: 0 }] }));
const medium = sectionMedium(columns, SCATTERING_ASSUMPTIONS);

test('whole-angle gas lower rectangles remain below finely integrated depth across AOD knots and viewing sides', () => {
  for (const azimuth of [0, 10, 170, 180]) for (const [low, high] of [[0.5, 0.7], [2, 10], [20, 60]]) for (const distanceKm of [25, 108, 250]) {
    const muLow = Math.sin(low * RAD), muHigh = Math.sin(high * RAD);
    const bound = clearDepthLowerBound({ medium, observer, columnPositions: columns.map(c => c.x), azimuth, muLow, muHigh, distanceKm });
    const numericalBound = clearDepthLowerBound({ medium, observer, columnPositions: columns.map(c => c.x), azimuth, muLow, muHigh, distanceKm, samplingRadiusKm: 4 });
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      const mu = muLow + fraction * (muHigh - muLow), direction = skyDirection(azimuth, Math.asin(mu) / RAD);
      const actual = medium.clearDepth(observer, direction, 0, distanceKm, 0.1);
      const implemented = medium.clearDepth(observer, direction, 0, distanceKm, 4);
      for (const field of ['rayleigh', 'aerosol']) {
        assert.ok(bound[field] <= actual[field] * (1 + 1e-8) + 1e-12,
          JSON.stringify({ azimuth, low, high, distanceKm, fraction, field, bound: bound[field], actual: actual[field] }));
        assert.ok(numericalBound[field] <= implemented[field] * (1 + 1e-8) + 1e-12);
      }
    }
  }
});

test('finer nested rectangles tighten a haze-depth bound and retain explicit domain checks', () => {
  const options = { medium, observer, columnPositions: columns.map(c => c.x), azimuth: 0,
    muLow: Math.sin(0.5 * RAD), muHigh: Math.sin(0.7 * RAD), distanceKm: 100 };
  const a = clearDepthLowerBound({ ...options, maximumStepKm: 4 }), b = clearDepthLowerBound({ ...options, maximumStepKm: 2 });
  assert.ok(b.rayleigh >= a.rayleigh && b.aerosol >= a.aerosol);
  assert.throws(() => clearDepthLowerBound({ ...options, muLow: -0.1 }));
});
