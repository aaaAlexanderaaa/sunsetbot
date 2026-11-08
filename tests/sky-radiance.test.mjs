import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptiveSkyRadiance } from '../src/sky-radiance.mjs';
import { SCATTERING_ASSUMPTIONS } from '../src/scattering-engine.mjs';
import { sectionMedium } from '../src/section-medium.mjs';
import { EARTH_KM } from '../src/astro.mjs';

const blocks = [{ xLow: -150, xHigh: 150, heightLow: 0, heightHigh: 30 }];
const ray = rgb => ({ spectra: [{ rgb, coveredRgb: rgb, sourceErrorEstimate: [0, 0, 0], coveredSourceErrorEstimate: [0, 0, 0], tailUpperBound: 0 }],
  potentialLitCloudProbability: 1, quadraturePoints: 0, uncoveredPoints: 0, sourceDepthLimitCount: 0 });

test('nested angular integration retains analytic spectra, both sides and the fixed solid angle', () => {
  const result = adaptiveSkyRadiance({ blocks, observerHeight: 0, solarAltitude: 10, asymmetries: [0], assumptions: SCATTERING_ASSUMPTIONS,
    rayAt: (phi, elevation) => ray([Math.sin(elevation * Math.PI / 180) ** 2, 0.5, 1]) });
  const low = Math.sin(0.5 * Math.PI / 180), high = Math.sin(85 * Math.PI / 180), width = 10 * Math.PI / 180;
  const area = 4 * width * (high - low), expected = 4 * width * (high ** 3 - low ** 3) / 3;
  assert.ok(Math.abs(result.spectra[0].rgbIntegral[0] - expected) < 1e-12);
  assert.ok(Math.abs(result.spectra[0].solidAngleSr - area) < 1e-12);
  assert.ok(Math.abs(result.spectra[0].sides.toward.rgbIntegral[0] - expected / 2) < 1e-12);
  assert.equal(result.diagnostics.numericalStatus, 'estimated_converged');
});

test('supported zero samples and a ray-budget limit retain explicit numerical failure', () => {
  const result = adaptiveSkyRadiance({ blocks, observerHeight: 0, solarAltitude: 10, asymmetries: [0],
    assumptions: { ...SCATTERING_ASSUMPTIONS, angularMuMaximumDepth: 0, angularAzimuthMaximumDepth: 0 }, rayAt: () => ray([0, 0, 0]) });
  assert.equal(result.diagnostics.numericalStatus, 'not_converged');
  assert.ok(result.diagnostics.angularErrorEstimate > 0);
  assert.throws(() => adaptiveSkyRadiance({ blocks, observerHeight: 0, solarAltitude: 10, asymmetries: [0],
    assumptions: { ...SCATTERING_ASSUMPTIONS, maximumAngularRays: 2 }, rayAt: () => ray([1, 1, 1]) }), error => error.code === 'ANGULAR_BUDGET');
});

test('bounded angular limits pass only when the accumulated envelope fits the global budget', () => {
  const columns = [-150, 0, 150].map((x, index) => ({ x, index, ground: 0, aod: 0,
    levels: [{ height: 0.3, cover: 1 }, { height: 30, cover: 1 }] }));
  const medium = sectionMedium(columns, SCATTERING_ASSUMPTIONS);
  const input = { medium, cells: medium.emissionBlocks(150, { merge: false }), blocks: medium.emissionBlocks(150),
    observer: [0, 0, EARTH_KM], observerHeight: 0, solarAltitude: 10, asymmetries: [0],
    rayAt: (phi, elevation) => ray(Array(3).fill(elevation < 1 ? 0.01 : 0.001)) };
  const bounded = adaptiveSkyRadiance({ ...input, assumptions: { ...SCATTERING_ASSUMPTIONS,
    angularMuMaximumDepth: 0, totalAbsoluteTolerance: 1 } });
  assert.equal(bounded.diagnostics.numericalStatus, 'estimated_converged');
  const truth = 4 * 10 * Math.PI / 180 * ((Math.sin(Math.PI / 180) - Math.sin(0.5 * Math.PI / 180)) * 0.01 +
    (Math.sin(85 * Math.PI / 180) - Math.sin(Math.PI / 180)) * 0.001);
  assert.ok(Math.abs(bounded.spectra[0].rgbIntegral[0] - truth) <= bounded.spectra[0].totalErrorEstimate[0]);
  assert.ok(bounded.diagnostics.angularErrorEstimate > 0);
  assert.ok(bounded.diagnostics.angularBoundedLimitCount > 0);
  assert.equal(bounded.diagnostics.angularBoundedLimitCount, bounded.diagnostics.angularDepthLimitCount);
  const rejected = adaptiveSkyRadiance({ ...input, assumptions: { ...SCATTERING_ASSUMPTIONS,
    angularMuMaximumDepth: 0, totalAbsoluteTolerance: 1e-10 } });
  assert.equal(rejected.diagnostics.numericalStatus, 'not_converged');
  const outerZero = adaptiveSkyRadiance({ ...input, rayAt: () => ray([0, 0, 0]), assumptions: {
    ...SCATTERING_ASSUMPTIONS, angularMuMaximumDepth: 0, angularAzimuthMaximumDepth: 0, totalAbsoluteTolerance: 1 } });
  assert.equal(outerZero.diagnostics.numericalStatus, 'not_converged');
  assert.ok(outerZero.diagnostics.angularDepthLimitCount > outerZero.diagnostics.angularBoundedLimitCount);
});

test('blue-channel source uncertainty rejects a frame and propagates into its colour ratio', () => {
  const result = adaptiveSkyRadiance({ blocks, observerHeight: 0, solarAltitude: 10, asymmetries: [0],
    assumptions: SCATTERING_ASSUMPTIONS, rayAt: () => {
      const r = ray([1, 0.1, 1e-5]);
      r.spectra[0].sourceErrorEstimate = [0, 0, 2e-5];r.spectra[0].coveredSourceErrorEstimate = [0, 0, 2e-5];return r;
    } });
  assert.equal(result.diagnostics.numericalStatus, 'not_converged');
  assert.equal(result.spectra[0].redBlueRatioErrorInterval.status, 'denominator_unresolved');
  assert.equal(result.spectra[0].redBlueRatioErrorInterval.upper, null);
});

test('nonuniform source and tail uncertainty integrals include their nested quadrature errors', () => {
  const result = adaptiveSkyRadiance({ blocks, observerHeight: 0, solarAltitude: 10, asymmetries: [0],
    assumptions: SCATTERING_ASSUMPTIONS, rayAt: (phi, elevation) => {
      const mu = Math.sin(elevation * Math.PI / 180), r = ray([1, 1, 1]);
      r.spectra[0].sourceErrorEstimate = Array(3).fill(1e-5 * mu ** 4);
      r.spectra[0].coveredSourceErrorEstimate = r.spectra[0].sourceErrorEstimate;
      r.spectra[0].tailUpperBound = 1e-7 * mu ** 6;return r;
    } });
  const a = Math.sin(0.5 * Math.PI / 180), b = Math.sin(85 * Math.PI / 180), width = 4 * 10 * Math.PI / 180;
  const source = width * 1e-5 * (b ** 5 - a ** 5) / 5, tail = width * 1e-7 * (b ** 7 - a ** 7) / 7;
  assert.ok(result.spectra[0].sourceErrorEstimate[0] >= source - 1e-13);
  assert.ok(result.spectra[0].tailUpperBound >= tail - 1e-13);
  assert.equal(result.diagnostics.numericalStatus, 'estimated_converged');
});
