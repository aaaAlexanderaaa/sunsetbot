import test from 'node:test';
import assert from 'node:assert/strict';
import { numericalOrdering, calendarAlertBudget, pairedCalendarComparison } from '../scripts/radiance-ranking.mjs';

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

test('the calendar alert budget selects before label availability and preserves unknown outcomes', () => {
  const result = calendarAlertBudget([{ id: 'a', score: 10 }, { id: 'b', score: 9, observedGrade: 1 },
    { id: 'c', score: 8, observedGrade: 0 }, { id: 'd', score: null, observedGrade: 1 }], c => c.score, 2);
  assert.deepEqual(result.selectedIds, ['a', 'b']);
  assert.equal(result.precisionOnKnownLabels, 1);
  assert.equal(result.missingLabels, 1);
  assert.deepEqual(result.selectedLabelSensitivityRange, [0.5, 1]);
});

test('paired bootstrap masks both comparators together and retains empty calendar days', () => {
  const cases = [{ date: '2023-09-01', observedGrade: 1, a: 2, b: 1 }, { date: '2023-09-01', observedGrade: 0, a: 1, b: 2 },
    { date: '2023-09-02', a: 100, b: -100 }, { date: '2023-09-02', observedGrade: 1, a: null, b: 10 },
    { date: '2023-09-02', observedGrade: 0, a: 0, b: 0 }, { date: '2023-09-03', a: null, b: null }];
  const result = pairedCalendarComparison(cases, c => c.a, c => c.b, { replicates: 100, blockDays: 1, seed: 42 });
  assert.equal(result.calendarDates, 3);
  assert.equal(result.pairedEvents, 3);
  assert.equal(result.difference, 0.5);
});
