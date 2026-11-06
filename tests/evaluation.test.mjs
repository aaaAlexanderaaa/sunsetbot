import test from 'node:test';
import assert from 'node:assert/strict';
import { observationRows, selectChallenge, rankCorrelation, rankingMetrics } from '../src/evaluation.mjs';

test('observation import preserves missing labels and detects conflicting duplicate judgments', () => {
  const row = ['2023-06-01', '日落', '-', '-', '基本不烧', '大烧', '-', '-', '', '', ''];
  const imported = observationRows({ status: 'ok', table_content: [row, [...row.slice(0, 4), '未知']] });
  assert.equal(imported.rows.length, 1);
  assert.equal(imported.rows[0].observedGrade, 0);
  assert.equal(imported.excluded.length, 1);
  assert.throws(() => observationRows({ status: 'ok', table_content: [row, [...row.slice(0, 4), '大烧']] }), /Conflicting/);
});

test('matched controls retain the same solar event and are selected before looking at scores', () => {
  const rows = [
    { id: 'a', date: '2023-06-01', eventType: 'sunrise', observedGrade: 0 },
    { id: 'b', date: '2023-06-01', eventType: 'sunset', observedGrade: 0 },
    { id: 'c', date: '2023-06-02', eventType: 'sunset', observedGrade: 3 },
  ];
  const selected = selectChallenge(rows, 1);
  assert.deepEqual(selected.map(r => r.id).sort(), ['b', 'c']);
});

test('ordinal ranks and positive-control ordering account for ties and missing scores', () => {
  assert.equal(rankCorrelation([1, 2, 3], [3, 2, 1]), -1);
  assert.equal(rankCorrelation([1, 1, 2], [1, 1, 2]), 1);
  assert.equal(rankCorrelation([0, 0], [1, 2]), null);
  const metrics = rankingMetrics([{ observedGrade: 0, score: 1 }, { observedGrade: 0, score: 2 },
    { observedGrade: 2, score: 2 }, { observedGrade: 0, score: null }], 'score');
  assert.equal(metrics.pairwiseAuc, 0.75);
  assert.equal(metrics.missingScores, 1);
  assert.equal(metrics.correctlyOrderedPairs, 1);
  assert.equal(metrics.tiedPairs, 1);
});
