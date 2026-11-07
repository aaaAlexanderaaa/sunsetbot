import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptiveSimpson } from '../src/quadrature.mjs';

test('adaptive source quadrature resolves a grazing-illumination boundary skin', () => {
  const result = adaptiveSimpson(x => [Math.exp(-1000 * x), Math.exp(-50 * x)], 0, 1,
    { absoluteTolerance: 1e-12, relativeTolerance: 1e-5, maxDepth: 20 });
  assert.ok(Math.abs(result.value[0] - 0.001) < 1e-9);
  assert.ok(Math.abs(result.value[1] - 0.02) < 1e-9);
  assert.equal(result.converged, true);
  assert.ok(result.evaluations < 1000);
});

test('known support partitions retain a narrow interior source and max-depth failure stays explicit', () => {
  const result = adaptiveSimpson(x => [x >= 0.101 && x <= 0.102 ? 1 : 0], 0, 1,
    { breakpoints: [0.101, 0.102], absoluteTolerance: 1e-7, relativeTolerance: 0, maxDepth: 20 });
  assert.ok(Math.abs(result.value[0] - 0.001) < 1e-7);
  const limited = adaptiveSimpson(x => [Math.exp(-1000 * x)], 0, 1,
    { absoluteTolerance: 1e-15, relativeTolerance: 1e-8, maxDepth: 1 });
  assert.equal(limited.converged, false);
  assert.ok(limited.depthLimitCount > 0);
});
