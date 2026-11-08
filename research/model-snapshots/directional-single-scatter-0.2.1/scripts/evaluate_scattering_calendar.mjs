// Join frozen prospective predictions to later public observations. Preserve
// all calendar events, missing labels and numerical failures in the result.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { codeIdentity } from './diagnose_scattering.mjs';
import { numericalOrdering, calendarAlertBudget, pairedCalendarComparison } from './radiance-ranking.mjs';
import { observationRows, rankingMetrics } from '../research/model-snapshots/section-optics-0.3.1/evaluation.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const selectionPath = 'research/experiments/scattering-selection.json', selectionBytes = await readFile(selectionPath);
const selection = JSON.parse(selectionBytes), policy = selection.recipe.policy;
if ((await codeIdentity()).sha256 !== selection.recipe.codeIdentity.sha256) throw Error('Frozen candidate source changed');
for (const receipt of selection.recipe.analysisFiles) {
  if (hash(await readFile(receipt.file)) !== receipt.sha256) throw Error('Frozen analysis source changed: ' + receipt.file);
}
const predictionsDirectory = 'research/experiments/scattering-validation-predictions';
const predictionManifest = await json(predictionsDirectory + '/manifest.json');
const referenceBytes = await readFile('research/experiments/scattering-reference-predictions.json'), references = JSON.parse(referenceBytes);
if (predictionManifest.candidateIdentity !== selection.candidateIdentity || predictionManifest.selectionSha256 !== hash(selectionBytes) ||
    hash(referenceBytes) !== selection.recipe.referencePredictionsSha256 || predictionManifest.cases.length !== 122) throw Error('Frozen prediction/reference identity changed');
const sourceDirectory = 'research/sources/scattering-validation-calendar', sourceManifest = await json(sourceDirectory + '/manifest.json');
const labels = new Map(), excluded = [], unavailableSources = [];
for (const receipt of sourceManifest) {
  if (receipt.candidateIdentity !== selection.candidateIdentity || receipt.sourceFrozenAt !== selection.frozenAt ||
      Date.parse(receipt.captured_at) < Date.parse(predictionManifest.completedAt) ||
      new URL(receipt.url).searchParams.get('city_name') !== '上海') throw Error('Label capture precedes matching prospective predictions');
  if (receipt.status !== 200) { unavailableSources.push({ file: receipt.file, status: receipt.status });continue; }
  const bytes = await readFile(sourceDirectory + '/' + receipt.file);
  if (hash(bytes) !== receipt.sha256) throw Error('Observation source hash changed');
  const observed = observationRows(JSON.parse(bytes));excluded.push(...observed.excluded);
  for (const row of observed.rows) {
    if (row.date < receipt.requested_range[0] || row.date > receipt.requested_range[1]) {
      excluded.push({ id: row.id, reason: 'outside_requested_source_window' });continue;
    }
    if (labels.has(row.id)) throw Error('Overlapping observation sources: ' + row.id);
    labels.set(row.id, { ...row, evidenceState: row.evidenceUrls && row.evidenceUrls !== '-' ? 'linked_source' : 'source_label_only',
      labelSource: { file: sourceDirectory + '/' + receipt.file, sha256: receipt.sha256 } });
  }
}
const cases = [];
for (const receipt of predictionManifest.cases) {
  const bytes = await readFile(predictionsDirectory + '/' + receipt.file);
  if (hash(bytes) !== receipt.sha256) throw Error('Prospective prediction hash changed');
  const prediction = JSON.parse(bytes), reference = references.cases.find(r => r.id === receipt.id);
  if (!reference || prediction.candidateIdentity !== selection.candidateIdentity) throw Error('Calendar result identity changed');
  const label = labels.get(receipt.id);
  cases.push({ id: receipt.id, date: receipt.id.slice(0, 10), eventType: receipt.id.slice(11),
    observedGrade: label?.observedGrade ?? null, observation: label ?? null,
    score: prediction.score, errorEstimate: prediction.errorEstimate, numericalStatus: prediction.numericalStatus,
    numericalFailure: prediction.failure ?? null,
    referenceScore: reference.heuristicReferenceScore, peakReferenceScore: reference.heuristicPeakScore,
    nativeBaselineScore: reference.nativeBaselineScore,
    phaseSensitivity: prediction.frame?.spectra.map(s => ({ asymmetry: s.asymmetry, rgbIntegral: s.rgbIntegral,
      coveredRgbIntegral: s.coveredRgbIntegral, totalErrorEstimate: s.totalErrorEstimate })) ?? null });
}
cases.sort((a, b) => a.id.localeCompare(b.id));
const labelled = cases.filter(c => Number.isFinite(c.observedGrade));
const models = { primary: c => c.score, commonAltitudeHeuristic: c => c.referenceScore,
  nativeCloudBaseline: c => c.nativeBaselineScore, originalPeakHeuristic: c => c.peakReferenceScore };
const rankings = Object.fromEntries(Object.entries(models).map(([name, score]) => [name,
  rankingMetrics(labelled.map(c => ({ ...c, selectedScore: score(c) })), 'selectedScore')]));
const phaseRankings = Object.fromEntries([0, 0.75, 0.85, 0.9].map(g => [g,
  rankingMetrics(labelled.map(c => ({ ...c, phaseScore: c.numericalStatus === 'estimated_converged' ?
    c.phaseSensitivity?.find(s => s.asymmetry === g)?.rgbIntegral[0] ?? null : null })), 'phaseScore')]));
const coveredRanking = rankingMetrics(labelled.map(c => ({ ...c, coveredScore: c.numericalStatus === 'estimated_converged' ?
  c.phaseSensitivity?.find(s => s.asymmetry === 0.85)?.coveredRgbIntegral[0] ?? null : null })), 'coveredScore');
const evidenceCounts = {
  possibleCalendarEvents: cases.length, explicitLabels: labelled.length, missingLabels: cases.length - labelled.length,
  numericalFailures: cases.filter(c => c.numericalStatus !== 'estimated_converged').length,
  linkedPositive: labelled.filter(c => c.observedGrade > 0 && c.observation.evidenceState === 'linked_source').length,
  sourceOnlyPositive: labelled.filter(c => c.observedGrade > 0 && c.observation.evidenceState === 'source_label_only').length,
  sourceOnlyZero: labelled.filter(c => c.observedGrade === 0 && c.observation.evidenceState === 'source_label_only').length,
  failedPredictionLabelGrades: cases.filter(c => c.numericalStatus !== 'estimated_converged').map(c => ({ id: c.id, observedGrade: c.observedGrade })),
};
const summary = { evaluatedAt: new Date().toISOString(), candidateIdentity: selection.candidateIdentity, policy, cases, rankings,
  phaseRankings, coveredRanking,
  primaryComparison: pairedCalendarComparison(cases, c => c.score, c => c.referenceScore, policy.bootstrap),
  baselineComparison: pairedCalendarComparison(cases, c => c.score, c => c.nativeBaselineScore, policy.bootstrap),
  numericalOrdering: numericalOrdering(cases), evidenceCounts,
  alertBudget: Object.fromEntries(Object.entries(models).map(([name, score]) => [name, calendarAlertBudget(cases, score, policy.topK)])),
  excludedSourceRows: excluded, unavailableSources,
  sourceManifestSha256: hash(await readFile(sourceDirectory + '/manifest.json')),
  predictionManifestSha256: hash(await readFile(predictionsDirectory + '/manifest.json')),
  scope: 'Independent-date source-label ranking of a frozen relative-radiance model on retrospective ERA5/EAC4. Calendar missingness and numerical failures retained. Source-only zeros and linked URLs retain their own observation coverage; calibration and operational forecast lead have separate scope. Production remains section-optics-0.3.1.' };
const output = 'research/experiments/scattering-independent-validation';await mkdir(output, { recursive: true });
await writeFile(output + '/summary.json', JSON.stringify(summary, null, 2) + '\n');
const table = Object.entries(rankings).map(([name, value]) => `| ${name} | ${value.evaluatedCases} | ${value.pairwiseAuc ?? 'unavailable'} | ${value.ordinalSpearman ?? 'unavailable'} |`).join('\n');
await writeFile(output + '/report.md', `# Independent directional-radiance calendar comparison\n\nCandidate ${selection.candidateIdentity}. Model, analysis policy and weather-only predictions precede source labels.\n\n| Observable | Scored labelled cases | AUC | Spearman |\n| --- | ---: | ---: | ---: |\n${table}\n\nPaired primary comparison: ${JSON.stringify(summary.primaryComparison)}\n\nPaired native-baseline comparison: ${JSON.stringify(summary.baselineComparison)}\n\nNumerical ordering sensitivity: ${JSON.stringify(summary.numericalOrdering)}\n\nCalendar/evidence coverage: ${JSON.stringify(evidenceCounts)}\n\n${summary.scope}\n`);
console.log(JSON.stringify({ output, rankings, primaryComparison: summary.primaryComparison, numericalOrdering: summary.numericalOrdering, evidenceCounts }));
