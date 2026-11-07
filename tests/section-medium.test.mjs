import test from 'node:test';
import assert from 'node:assert/strict';
import { EARTH_KM } from '../src/astro.mjs';
import { coordinates, pointAlong, skyDirection, earthShadowed, sphereCrossings, shadowCrossings } from '../src/radiative-geometry.mjs';
import { sectionMedium } from '../src/section-medium.mjs';
import { cloudTransmission } from '../src/cloud-optics.mjs';

const optics = { cloudExtinction: { low: 2, mid: 0.7, high: 0.2 }, rayleigh550: 0.012,
  molecularScaleHeightKm: 8, aerosolScaleHeightKm: 1.5 };
const columns = [-150, 0, 100, 300, 800].map((x, index) => ({ x, index, ground: 0, aod: 0.2,
  levels: [{ height: 1, cover: 0.5 }, { height: 2, cover: 0.5 }, { height: 4, cover: 0.5 }] }));
const close = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} versus ${b}`);

test('spherical rays preserve 2D shadow limits and include off-plane curvature', () => {
  assert.equal(earthShadowed([0, 0, EARTH_KM + 1], skyDirection(0, -2)), true);
  assert.equal(earthShadowed([0, 0, EARTH_KM + 10], skyDirection(0, -2)), false);
  const point = pointAlong([0, 0, EARTH_KM], skyDirection(90, 0), 100);
  close(coordinates(point).x, 0);
  close(coordinates(point).height, Math.hypot(EARTH_KM, 100) - EARTH_KM);
  close(sphereCrossings([0, 0, EARTH_KM], [0, 0, 1], EARTH_KM + 3).at(-1), 3);
});

test('Earth-shadow boundary follows the independent tangent-line construction', () => {
  const origin = [0, 0, EARTH_KM], view = skyDirection(0, 2), sun = skyDirection(0, -3);
  const expected = EARTH_KM * (1 - Math.cos(3 * Math.PI / 180)) / Math.sin(5 * Math.PI / 180);
  const boundary = shadowCrossings(origin, view, sun).find(t => Math.abs(t - expected) < 1e-6);
  assert.ok(boundary !== undefined);
  assert.equal(earthShadowed(pointAlong(origin, view, expected - 0.01), sun), true);
  assert.equal(earthShadowed(pointAlong(origin, view, expected + 0.01), sun), false);
});

test('exact cloud boundaries remove pressure-band step aliasing and preserve occurrence conditioning', () => {
  const medium = sectionMedium(columns, optics), origin = [0, 0, EARTH_KM];
  const result = medium.trace(origin, skyDirection(0, 90), 6, { gasStepKm: 4 });
  assert.equal(result.blocked, false);
  const pieces = result.segments.map(s => s.cloud), depth = pieces.filter(p => p.fraction > 0).reduce((s, p) => s + p.depth, 0);
  const expected = 2 * (3 - 0.7) + 0.7 * (4.5 - 3);
  close(depth, expected);
  close(cloudTransmission(pieces, { condition: { column: 1, x: 0, lower: 0, upper: 0.5 } }), Math.exp(-expected));
  close(cloudTransmission(pieces), 0.5 + 0.5 * Math.exp(-expected));
  const rayleigh = result.segments.reduce((sum, s) => sum + s.rayleigh, 0);
  const aerosol = result.segments.reduce((sum, s) => sum + s.aerosol, 0);
  close(rayleigh, 0.012 * 8 * (1 - Math.exp(-6 / 8)), 1e-8);
  close(aerosol, 0.2 * (1 - Math.exp(-6 / 1.5)), 2e-6);
});

test('nearest-column boundaries, terrain and sampling coverage have explicit path effects', () => {
  const raised = columns.map(c => ({ ...c, ground: c.x === 100 ? 2 : 0 }));
  const result = sectionMedium(raised, optics).trace([0, 0, EARTH_KM + 0.1], skyDirection(0, 0), 180);
  assert.equal(result.blocked, true);
  const end = result.segments.at(-1).endKm;
  close(coordinates(pointAlong([0, 0, EARTH_KM + 0.1], skyDirection(0, 0), end)).x, 50);
  const outside = sectionMedium(columns, optics).trace([0, 0, EARTH_KM + 1], skyDirection(180, 0), 300);
  assert.equal(outside.bounded, false);
});
