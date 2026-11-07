import test from 'node:test';
import assert from 'node:assert/strict';
import { pairedDateBlockAuc, topKPrecision } from '../scripts/validation-statistics.mjs';

test('paired date blocks retain paired equality and deterministic resampling', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: `event-${i}`, date: `2023-06-${String(1 + Math.floor(i / 2)).padStart(2, '0')}`,
    observedGrade: i % 3 ? 0 : 3, score: i }));
  const result = pairedDateBlockAuc(rows, r => r.score, r => r.score, { replicates: 100, blockDays: 3, seed: 1 });
  assert.equal(result.difference, 0);assert.deepEqual(result.interval95, [0, 0]);assert.equal(result.validReplicates, 100);
  const reversed = pairedDateBlockAuc(rows, r => -r.score, r => r.score, { replicates: 100, blockDays: 3, seed: 1 });
  assert.deepEqual(reversed, pairedDateBlockAuc(rows, r => -r.score, r => r.score, { replicates: 100, blockDays: 3, seed: 1 }));
  assert.equal(topKPrecision(rows, r => r.score, 3).selected, 3);
  assert.equal(pairedDateBlockAuc(rows.map(r => ({ ...r, observedGrade: 0 })), r => r.score, r => r.score, { replicates: 10 }).interval95, null);
});
