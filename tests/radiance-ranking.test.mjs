import test from 'node:test';
import assert from 'node:assert/strict';
import { numericalOrdering } from '../scripts/radiance-ranking.mjs';

const row = (score, errorEstimate, observedGrade) => ({ score, errorEstimate, observedGrade, numericalStatus: 'estimated_converged' });

test('overlapping numerical intervals retain ties and bound all source-label pair orderings', () => {
  const result = numericalOrdering([row(10, 1, 1), row(2, 1, 1), row(5, 1, 0), row(1, 1, 0)]);
  assert.deepEqual([result.wins, result.losses, result.numericalTies], [2, 1, 1]);
  assert.equal(result.tieAwareAuc, 0.625);
  assert.deepEqual(result.allLabelledAucSensitivityRange, [0.5, 0.75]);
});

test('failed predictions preserve unresolved pairs instead of gaining a clear-sky score', () => {
  const result = numericalOrdering([row(10, 1, 1), { observedGrade: 1, score: 2, errorEstimate: 0, numericalStatus: 'not_converged' },
    row(5, 1, 0), { score: 8, errorEstimate: 1, numericalStatus: 'estimated_converged' }]);
  assert.equal(result.unlabelledEvents, 1);
  assert.equal(result.numericallyUnavailableEvents, 1);
  assert.equal(result.unavailablePairs, 1);
  assert.equal(result.tieAwareAuc, null);
  assert.deepEqual(result.allLabelledAucSensitivityRange, [0.5, 1]);
});
