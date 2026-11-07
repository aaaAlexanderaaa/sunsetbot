import test from 'node:test';
import assert from 'node:assert/strict';
import { EARTH_KM, solarEvent, sunPosition } from '../src/astro.mjs';
import { sectionMedium } from '../src/section-medium.mjs';
import { sectionCrossing } from '../src/radiative-geometry.mjs';
import { SCATTERING_ASSUMPTIONS, directionalRay, solarAltitudeReference } from '../src/scattering-engine.mjs';

const slab = fraction => [0, 50, 100, 150, 800].map((x, index) => ({ x, index, ground: 0, aod: 0,
  levels: [{ height: 0.3, cover: x === 50 ? fraction : 0 }, { height: 29.5, cover: x === 50 ? fraction : 0 }] }));
const observer = [0, 0, EARTH_KM + 1], direction = [1, 0, 0];
const length = sectionCrossing(observer, direction, 75) - sectionCrossing(observer, direction, 25);
const run = (fraction, solarDirection, maximumEmissionOpticalDepth) => {
  const assumptions = { ...SCATTERING_ASSUMPTIONS, cloudExtinction: { low: 0.02, mid: 0.02, high: 0.02 },
    rayleigh550: 0, sourceTailAbsoluteTolerance: 1e-13, maximumEmissionOpticalDepth };
  return directionalRay({ medium: sectionMedium(slab(fraction), assumptions), observer, direction, solarDirection,
    assumptions, asymmetries: [0] });
};

test('directional volume source agrees with both-side and same-side illumination slab solutions', () => {
  const tau = 0.02 * length, phase = 1 / (4 * Math.PI);
  const opposite = run(1, [1, 0, 0], 0.5);
  assert.ok(Math.abs(opposite.spectra[0].rgb[0] - phase * tau * Math.exp(-tau)) < 1e-12);
  const exact = phase * (1 - Math.exp(-2 * tau)) / 2;
  const coarse = run(1, [-1, 0, 0], 0.5), fine = run(1, [-1, 0, 0], 0.1);
  const error = result => Math.abs(result.spectra[0].rgb[0] - exact);
  const refinement = fine.quadraturePoints / coarse.quadraturePoints;
  assert.ok(error(fine) < 1e-7 && error(fine) < error(coarse) / (refinement ** 4 * 0.95));
});

test('source occurrence multiplies conditional extinction once and geometric shadow emits zero', () => {
  const full = run(1, [1, 0, 0], 0.2), partial = run(0.3, [1, 0, 0], 0.2);
  assert.ok(Math.abs(partial.spectra[0].rgb[0] / full.spectra[0].rgb[0] - 0.3) < 1e-12);
  assert.ok(Math.abs(partial.potentialLitCloudProbability - 0.3) < 1e-12);
  const dark = run(1, [0, 0, -1], 0.5);
  assert.deepEqual(dark.spectra[0].rgb, [0, 0, 0]);
  assert.equal(dark.potentialLitCloudProbability, 0);
});

test('sunrise and sunset reference spectra use a common geometric solar altitude', () => {
  const location = { lat: 31.2304, lon: 121.4737, timezone: 'Asia/Shanghai' };
  for (const eventType of ['sunrise', 'sunset']) {
    const event = solarEvent('2023-06-09', eventType, location.lat, location.lon, location.timezone);
    const reference = solarAltitudeReference(event, location);
    assert.ok(Math.abs(sunPosition(Date.parse(reference.time), location.lat, location.lon).altitude + 0.833) < 0.00005);
    assert.ok(Math.abs(reference.offsetSeconds) < 600);
  }
});

test('illuminated cloud area uses the fixed-column Markov union probability', () => {
  const columns = slab(0.3).map(c => c.x === 100 ? { ...c, levels: c.levels.map(p => ({ ...p, cover: 0.6 })) } : c);
  const assumptions = { ...SCATTERING_ASSUMPTIONS, cloudExtinction: { low: 0.02, mid: 0.02, high: 0.02 }, rayleigh550: 0 };
  const result = directionalRay({ medium: sectionMedium(columns, assumptions), observer, direction, solarDirection: [1, 0, 0], assumptions, asymmetries: [0] });
  const rho = Math.exp(-50 / 50), intersection = rho * 0.3 + (1 - rho) * 0.3 * 0.6;
  assert.ok(Math.abs(result.potentialLitCloudProbability - (0.3 + 0.6 - intersection)) < 1e-12);
});
