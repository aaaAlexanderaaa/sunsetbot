import { readFile, writeFile } from 'node:fs/promises';
import { pairedDateBlockAuc } from './validation-statistics.mjs';
import { rankingMetrics, OBSERVED_GRADES } from '../research/model-snapshots/section-optics-0.3.1/evaluation.mjs';

const json = async path => JSON.parse(await readFile(path, 'utf8'));
const directory = 'research/experiments/cloud-column-validation';
const summary = await json(directory + '/summary.json');
const calendar = await json('research/experiments/validation-calendar/selection.json');
const original = calendar.cases.map(({ observedCase }) => {
  const category = OBSERVED_GRADES.indexOf(observedCase.originalPrediction);
  return { ...observedCase, score: category < 0 ? null : category };
});
const output = {
  scope: 'Exploratory descriptive comparisons defined after validation scores; original source categories may use different input/retrospective semantics.',
  baselineComparison: pairedDateBlockAuc(summary.cases, c => c.scores.coarse_cumulative.score, c => c.baselineScore, summary.policy.bootstrap),
  originalPublishedCategories: rankingMetrics(original, 'score'),
  alertBudget: summary.alertBudget,
  distinctDates: new Set(calendar.cases.map(c => c.observedCase.date)).size,
};
await writeFile(directory + '/exploratory-comparisons.json', JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output));
