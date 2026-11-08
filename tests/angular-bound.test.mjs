import test from 'node:test';
import assert from 'node:assert/strict';
import { EARTH_KM, RAD } from '../src/astro.mjs';
import { firstSunlitDistanceLowerBound, angularCloudUpperBoundFactory } from '../src/angular-bound.mjs';
import { cloudTransmission } from '../src/cloud-optics.mjs';
import { sectionMedium } from '../src/section-medium.mjs';
import { skyDirection, shadowCrossings, pointAlong, earthShadowed, sectionCrossing } from '../src/radiative-geometry.mjs';
import { SCATTERING_ASSUMPTIONS } from '../src/scattering-engine.mjs';

test('the interval shadow-exit bound precedes every exact ray exit and tightens on refinement', () => {
  for (const height of [0.005, 0.1]) for (const altitude of [-0.4, -0.833, -3]) {
    const observer = [0, 0, EARTH_KM + height], solar = skyDirection(0, altitude);
    for (const phi of [0, 5, 10, 170, 175, 180]) for (const [low, high] of [[0.5, 2], [2, 10], [10, 40], [40, 85]]) {
      const a = Math.sin(low * RAD), b = Math.sin(high * RAD);
      const bound = firstSunlitDistanceLowerBound(height, phi, altitude, a, b);
      for (let i = 0; i <= 20; i++) {
        const mu = a + (b - a) * i / 20, direction = skyDirection(phi, Math.asin(mu) / RAD);
        const events = shadowCrossings(observer, direction, solar).filter(s => s >= 0).sort((x, y) => x - y);
        const exit = earthShadowed(observer, solar) ? events.find(s => !earthShadowed(pointAlong(observer, direction, s + 1e-5), solar)) : 0;
        assert.ok(exit === undefined || bound <= exit + 1e-7, JSON.stringify({ height, altitude, phi, low, high, bound, exit }));
      }
      const middle = (a + b) / 2;
      assert.ok(firstSunlitDistanceLowerBound(height, phi, altitude, a, middle) >= bound - 1e-8);
      assert.ok(firstSunlitDistanceLowerBound(height, phi, altitude, middle, b) >= bound - 1e-8);
    }
  }
});

// Exact view-only source: each cloud segment integrates analytically, with
// Earth-shadow interfaces inserted by independent cylinder-ray intersections.
// Solar cloud/gas attenuation can only reduce this quantity.
function viewSource(medium, observer, phi, mu, altitude, assumptions) {
  const direction = skyDirection(phi, Math.asin(mu) / RAD), solar = skyDirection(0, altitude);
  const maximum = Math.min(assumptions.maximumViewingPathKm,
    ...[-assumptions.sourceExtentKm, assumptions.sourceExtentKm].map(x => sectionCrossing(observer, direction, x)).filter(s => s > 0));
  const trace = medium.trace(observer, direction, maximum, { integrateGas: false, extraDistancesKm: shadowCrossings(observer, direction, solar) });
  const prefix = [];let source = 0;
  for (const segment of trace.segments) {
    const cell = segment.cloud;
    if (cell.fraction > 0 && !earthShadowed(pointAlong(observer, direction, (segment.startKm + segment.endKm) / 2), solar)) {
      source += cell.fraction * cloudTransmission(prefix, { overlap: assumptions.cloudOverlap,
        correlationLengthKm: assumptions.correlationLengthKm,
        condition: { column: cell.column, x: cell.x, lower: 0, upper: cell.fraction } }) * -Math.expm1(-cell.depth);
    }
    prefix.push(cell);
  }
  return source;
}

test('the whole-angle cloud bound contains exact sunlit view-source integrals with shared-column conditioning', () => {
  let strictlyAttenuated = 0, nonzeroSources = 0;
  const observerHeight = 0.005, observer = [0, 0, EARTH_KM + observerHeight];
  for (const coefficient of [0.4, 2]) for (const overlap of ['decorrelated', 'maximum', 'random-columns']) {
    const assumptions = { ...SCATTERING_ASSUMPTIONS, cloudOverlap: overlap,
      cloudExtinction: { low: coefficient, mid: coefficient, high: coefficient } };
    const columns = [-150, -75, -25, 0, 25, 75, 150].map((x, index) => ({ x, index, ground: 0, aod: 0,
      levels: [{ height: 0.3, cover: index % 2 ? 0.3 : 0.7 }, { height: 3, cover: 0.2 }, { height: 10, cover: 0.1 }] }));
    const medium = sectionMedium(columns, assumptions), cells = medium.emissionBlocks(assumptions.sourceExtentKm, { merge: false });
    for (const phi of [0, 7, 173, 180]) for (const [low, high] of [[0.5, 0.7], [0.7, 2], [2, 10], [10, 40], [40, 85]]) {
      const a = Math.sin(low * RAD), b = Math.sin(high * RAD);
      const boundAt = angularCloudUpperBoundFactory({ medium, cells, observer, observerHeight,
        azimuth: phi, solarAltitude: -0.833, assumptions });
      const bound = boundAt(a, b);
      if (bound < 0.01) strictlyAttenuated++;
      for (let i = 0; i <= 16; i++) {
        const mu = a + (b - a) * i / 16, source = viewSource(medium, observer, phi, mu, -0.833, assumptions);
        if (source > 1e-8) nonzeroSources++;
        assert.ok(source <= bound + 1e-12, JSON.stringify({ coefficient, overlap, phi, low, high, mu, source, bound }));
      }
    }
  }
  assert.ok(strictlyAttenuated > 0);
  assert.ok(nonzeroSources > 0);
});
