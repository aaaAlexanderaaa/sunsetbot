import test from 'node:test';
import assert from 'node:assert/strict';
import { henyeyGreenstein, singleScatterRay, skyGrid, integrateSky } from '../src/radiance.mjs';

const close = (actual, expected, tolerance = 1e-11) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} versus ${expected}`);
const segment = (lengthKm, k = 0.7) => ({ lengthKm, extinctionPerKm: [k, k, k], scatteringPerKm: [k, k, k], incidentIrradiance: [1, 0.8, 0.4] });

test('phase normalization and mean photon cosine retain the declared asymmetry', () => {
  const n = 12000, width = 2 / n;
  for (const g of [-0.85, 0, 0.85]) {
    let mass = 0, moment = 0;
    for (let i = 0; i <= n; i++) {
      const mu = -1 + i * width, weight = (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * width / 3;
      const density = 2 * Math.PI * henyeyGreenstein(mu, g);
      mass += weight * density;moment += weight * density * mu;
    }
    close(mass, 1, 3e-8);close(moment, g, 3e-8);
  }
  assert.ok(henyeyGreenstein(1, 0.85) > 1000 * henyeyGreenstein(-1, 0.85));
});

test('homogeneous constant-source slab is exact under subdivision and has the thin linear limit', () => {
  const settings = { cosine: 0.3, asymmetry: 0.85 }, phase = henyeyGreenstein(settings.cosine, settings.asymmetry);
  for (const n of [1, 2, 7, 100]) {
    const result = singleScatterRay(Array.from({ length: n }, () => segment(3 / n)), settings);
    [1, 0.8, 0.4].forEach((e, c) => close(result.rgb[c], e * phase * (1 - Math.exp(-2.1))));
  }
  const thin = singleScatterRay([segment(1e-9)], settings);
  close(thin.rgb[0] / (phase * 0.7e-9), 1, 1e-8);
});

test('cloud-free and unilluminated media emit zero while opaque foreground extinguishes a background cloud', () => {
  const settings = { cosine: 1, asymmetry: 0.85 };
  assert.deepEqual(singleScatterRay([segment(10, 0)], settings).rgb, [0, 0, 0]);
  assert.deepEqual(singleScatterRay([{ ...segment(2), incidentIrradiance: [0, 0, 0] }], settings).rgb, [0, 0, 0]);
  const foreground = { ...segment(1, 100), scatteringPerKm: [0, 0, 0] };
  const obscured = singleScatterRay([foreground, segment(3)], settings);
  assert.ok(obscured.rgb.every(v => v < 1e-40));
});

test('solid-angle aggregation preserves a uniform hemisphere under tessellation and converges for varying radiance', () => {
  const uniform = (a, e) => integrateSky(skyGrid(a, e).map(c => ({ ...c, rgb: [1, 0.5, 0.2] })));
  for (const result of [uniform([0, 360], [0, 90]), uniform([0, 30, 180, 360], [0, 4, 20, 50, 90])]) {
    close(result.solidAngleSr, 2 * Math.PI);close(result.rgbIntegral[0], 2 * Math.PI);close(result.rgbMean[1], 0.5);
  }
  const quadratic = n => integrateSky(skyGrid([0, 360], Array.from({ length: n + 1 }, (_, i) => Math.asin(i / n) * 180 / Math.PI))
    .map(c => ({ ...c, rgb: Array(3).fill(Math.sin(c.elevation * Math.PI / 180) ** 2) }))).rgbIntegral[0];
  const exact = 2 * Math.PI / 3;
  assert.ok(Math.abs(quadratic(16) - exact) < Math.abs(quadratic(4) - exact) / 15);
  assert.throws(() => integrateSky([{ ...skyGrid([0, 360], [0, 90])[0], rgb: [1, 1, 1] },
    { ...skyGrid([-10, 10], [20, 30])[0], rgb: [1, 1, 1] }]), /Overlapping/);
});
