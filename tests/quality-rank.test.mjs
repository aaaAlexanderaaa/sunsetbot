import test from 'node:test';
import assert from 'node:assert/strict';
import { fitQualityRank, qualityRank, qualityLogLoss } from '../src/quality-rank.mjs';

test('constant features recover the empirical source-label frequency', () => {
  const rows = [1, 0, 0, 0].map(target => ({ target, features: [0.5, 0.5] }));
  const fit = fitQualityRank(rows, 0.01);
  assert.ok(Math.abs(qualityRank(fit.parameters, [0.5, 0.5]) - 25) < 1e-7);
  assert.ok(Math.abs(fit.parameters[1]) < 1e-8 && Math.abs(fit.parameters[2]) < 1e-8);
  assert.ok(Math.abs(qualityLogLoss(rows, fit.parameters) - (-0.25 * Math.log(0.25) - 0.75 * Math.log(0.75))) < 1e-10);
});

test('independent informative features improve held-out ranking and ridge shrinks the fitted weights', () => {
  const rows = [[0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 1]].map(([a, b, target]) => ({ features: [a, b], target }));
  const low = fitQualityRank(rows, 0.001), high = fitQualityRank(rows, 1);
  assert.ok(qualityRank(low.parameters, [0.2, 0.2]) < qualityRank(low.parameters, [0.8, 0.2]));
  assert.ok(qualityRank(low.parameters, [0.2, 0.2]) < qualityRank(low.parameters, [0.2, 0.8]));
  assert.ok(Math.hypot(...low.parameters.slice(1)) > Math.hypot(...high.parameters.slice(1)));
  assert.ok(qualityLogLoss(rows, low.parameters) < qualityLogLoss(rows, [Math.log(3), 0, 0]));
});

test('quality fitting preserves explicit labels and rejects incomplete or single-class samples', () => {
  for (const rows of [[], [{ features: [0, 1], target: null }], [{ features: [NaN, 1], target: 0 }], [{ features: [0, 1], target: 1 }]]) {
    assert.throws(() => fitQualityRank(rows, 0.01));
  }
  assert.throws(() => qualityRank([0, 0, 0], [0, null]));
  assert.equal(qualityRank([1000, 0, 0], [0, 0]), 100);
  assert.equal(qualityRank([-1000, 0, 0], [0, 0]), 0);
});
