import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { researchModel } from './cloud-column-model.mjs';
import { pairedDateBlockAuc, topKPrecision } from './validation-statistics.mjs';
import { rankingMetrics } from '../research/model-snapshots/section-optics-0.3.1/evaluation.mjs';
import { LEVELS, interpolate } from '../research/model-snapshots/section-optics-0.3.1/provider.mjs';

const index = process.argv.indexOf('--directory');
const directory = index < 0 ? 'research/experiments/cloud-column-validation' : process.argv[index + 1];
const capture = process.argv.includes('--capture');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));

async function main() {
  const manifest = await json(join(directory, 'manifest.json'));
  const selection = await json('research/experiments/cloud-column-selection.json');
  const models = {};
  for (const [density, levels] of [['coarse', LEVELS], ['dense', manifest.pressureHpa]]) {
    for (const base of ['cumulative', 'adjacent']) models[density + '_' + base] = await researchModel(levels, base);
  }
  if (models.dense_adjacent.identity !== selection.candidateIdentity || manifest.candidateIdentity !== selection.candidateIdentity) {
    throw Error('Validation candidate differs from the source frozen before label retrieval');
  }
  const policy = await json('research/experiments/validation-calendar/evaluation-policy.json');
  if (policy.candidateIdentity !== selection.candidateIdentity) throw Error('Validation policy belongs to another candidate');
  const cases = [];
  for (const receipt of manifest.cases) {
    const bytes = await readFile(join(directory, receipt.file));
    if (hash(bytes) !== receipt.sha256) throw Error('Validation input integrity mismatch');
    const c = JSON.parse(bytes), scores = {};
    for (const [name, model] of Object.entries(models)) {
      const result = model.module.computeForecast({ weather: c.weather, aerosol: c.aerosol,
        event: c.event, location: c.location, fanOffsets: c.fanOffsets });
      scores[name] = { score: result.score, peakTime: result.peakTime, targetsAtPeak: result.section.targets.length };
    }
    const width = c.points.length / c.fanOffsets.length, start = width * Math.floor(c.fanOffsets.length / 2);
    const center = start + Array.from({ length: width }, (_, i) => i).reduce((best, i) => {
      const distance = j => (c.points[start + j].lat - c.location.lat) ** 2 + (c.points[start + j].lon - c.location.lon) ** 2;
      return distance(i) < distance(best) ? i : best;
    }, 0);
    const [low, mid, high] = ['low', 'mid', 'high'].map(level => interpolate(c.weather[center], 'cloud_cover_' + level, c.event.time));
    if (![low, mid, high].every(Number.isFinite)) throw Error('Native layer baseline incomplete');
    cases.push({ id: c.observedCase.id, date: c.observedCase.date, observedGrade: c.observedCase.observedGrade,
      evidenceState: c.observedCase.evidenceState, scores, baselineScore: Math.max(mid, high) * (1 - low / 100) });
    console.log(JSON.stringify({ id: c.observedCase.id, grade: c.observedCase.observedGrade,
      ...Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v.score])) }));
  }
  const rankings = Object.fromEntries(Object.keys(models).map(name => [name,
    rankingMetrics(cases.map(c => ({ ...c, score: c.scores[name].score })), 'score')]));
  const summary = { evaluatedAt: new Date().toISOString(), candidateIdentity: selection.candidateIdentity,
    policy, cases, rankings, baselineRanking: rankingMetrics(cases, 'baselineScore'),
    evidenceCounts: { sourceOnlyNegative: cases.filter(c => c.observedGrade === 0 && c.evidenceState === 'source_label_only').length,
      linkedPositive: cases.filter(c => c.observedGrade > 0 && c.evidenceState === 'linked_source').length,
      sourceOnlyPositive: cases.filter(c => c.observedGrade > 0 && c.evidenceState === 'source_label_only').length },
    primaryComparison: pairedDateBlockAuc(cases, c => c.scores.dense_adjacent.score, c => c.scores.coarse_cumulative.score, policy.bootstrap),
    secondaryDensityComparison: pairedDateBlockAuc(cases, c => c.scores.dense_cumulative.score, c => c.scores.coarse_cumulative.score, policy.bootstrap),
    alertBudget: { ...Object.fromEntries(Object.keys(models).map(name => [name, topKPrecision(cases, c => c.scores[name].score, policy.topK)])),
      nativeBaseline: topKPrecision(cases, c => c.baselineScore, policy.topK) },
    scope: 'Independent calendar source-label ranking. Negative observation coverage remains source-only; linked positive URLs retain their stated evidence scope. ERA5/EAC4 structural reconstruction with historical GFS local factors; fixed-lead forecast skill remains separate.' };
  if (!capture) {
    const expected = await json(join(directory, 'summary.json'));
    const stable = ({ evaluatedAt, ...result }) => result;
    if (JSON.stringify(stable(expected)) !== JSON.stringify(stable(summary))) throw Error('Independent validation scores, statistics or policy changed');
    console.log(JSON.stringify({ replayMatchesCaptured: true, rankings }));return;
  }
  await writeFile(join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  const table = Object.entries(rankings).map(([name, r]) => `| ${name} | ${r.pairwiseAuc?.toFixed(3)} | ${r.ordinalSpearman?.toFixed(3)} | ${summary.alertBudget[name].precision?.toFixed(3)} |`).join('\n');
  await writeFile(join(directory, 'report.md'), `# Independent calendar representation comparison\n\n${cases.length} source-labelled events; candidate source frozen before label retrieval.\n\n| Variant | Ranking AUC | Spearman | Top-${policy.topK} source-label precision |\n| --- | --- | --- | --- |\n${table}\n\nNative ERA5 layer baseline: ${JSON.stringify(summary.baselineRanking)}\n\nPrespecified primary paired comparison: ${JSON.stringify(summary.primaryComparison)}\n\nSecondary density-only comparison: ${JSON.stringify(summary.secondaryDensityComparison)}\n\nEvidence coverage: ${JSON.stringify(summary.evidenceCounts)}\n\n${summary.scope}\n`);
  console.log(JSON.stringify({ output: directory, rankings, primary: summary.primaryComparison, secondary: summary.secondaryDensityComparison }));
}

main().catch(error => { console.error(error.code ?? error.name, error.message); process.exitCode = 1; });
