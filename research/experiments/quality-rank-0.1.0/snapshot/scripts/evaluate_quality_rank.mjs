// Evaluate the separately frozen empirical candidate once the registered
// physical study has captured its complete calendar and public observations.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pairedCalendarComparison, calendarAlertBudget } from './radiance-ranking.mjs';
import { rankingMetrics } from '../research/model-snapshots/section-optics-0.3.1/evaluation.mjs';
import { qualityRank } from '../src/quality-rank.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const directory = 'research/experiments/quality-rank', modelBytes = await readFile(directory + '/model.json'), model = JSON.parse(modelBytes);
for (const receipt of model.recipe.source) {
  if (hash(await readFile(receipt.file)) !== receipt.sha256) throw Error('Frozen quality source changed: ' + receipt.file);
}
for (const receipt of model.recipe.frozenReference.dependencies) {
  if (hash(await readFile('research/model-snapshots/section-optics-0.3.1/' + receipt.file)) !== receipt.sha256) throw Error('Frozen quality reference dependency changed');
}
if (hash(await readFile(directory + '/development-features.json')) !== model.recipe.developmentFeaturesSha256 ||
    hash(await readFile(model.recipe.referencePredictions.file)) !== model.recipe.referencePredictions.sha256) throw Error('Frozen quality feature identity changed');
const predictionBytes = await readFile(directory + '/predictions.json'), predictions = JSON.parse(predictionBytes);
if (predictions.candidateIdentity !== model.candidateIdentity || predictions.modelSha256 !== hash(modelBytes) ||
    predictions.independentLabelsRead !== 0 || predictions.cases.length !== 122) throw Error('Prospective quality predictions changed');
const references = JSON.parse(await readFile(model.recipe.referencePredictions.file, 'utf8'));
if (new Set(predictions.cases.map(c => c.id)).size !== 122) throw Error('Complete unique quality calendar required');
const physicalFile = 'research/experiments/scattering-independent-validation/summary.json', physicalBytes = await readFile(physicalFile), physical = JSON.parse(physicalBytes);
if (physical.candidateIdentity !== model.recipe.physicalCandidate || physical.cases.length !== 122) throw Error('Independent calendar join changed');
const sourceManifestBytes = await readFile('research/sources/scattering-validation-calendar/manifest.json');
if (hash(sourceManifestBytes) !== physical.sourceManifestSha256) throw Error('Independent source receipt changed');
for (const receipt of JSON.parse(sourceManifestBytes)) {
  if (Date.parse(receipt.captured_at) <= Date.parse(predictions.completedAt)) throw Error('Quality predictions must precede independent label capture');
  if (receipt.status === 200 && hash(await readFile('research/sources/scattering-validation-calendar/' + receipt.file)) !== receipt.sha256) throw Error('Independent observation changed');
}
const cases = predictions.cases.map(prediction => {
  const observed = physical.cases.find(c => c.id === prediction.id);
  const reference = references.cases.find(c => c.id === prediction.id);
  if (!observed || prediction.score !== qualityRank(model.recipe.fit.parameters, prediction.features) ||
      prediction.peakIndex !== reference?.heuristicPeakScore || prediction.nativeBaseline !== reference?.nativeBaselineScore ||
      prediction.features[0] !== prediction.peakIndex / 100 || prediction.features[1] !== prediction.nativeBaseline / 100) throw Error('Frozen quality prediction mismatch');
  return { ...prediction, observedGrade: observed.observedGrade, observation: observed.observation };
});
const models = { empirical: c => c.score, neutralPeakIndex: c => c.peakIndex, nativeLayerBaseline: c => c.nativeBaseline };
const result = { evaluatedAt: new Date().toISOString(), candidateIdentity: model.candidateIdentity, policy: model.policy,
  modelSha256: hash(modelBytes), predictionSha256: hash(predictionBytes), physicalEvaluationSha256: hash(physicalBytes), sourceManifestSha256: hash(sourceManifestBytes),
  cases, calendarEvents: cases.length, missingSourceLabels: cases.filter(c => !Number.isFinite(c.observedGrade)).length,
  rankings: Object.fromEntries(Object.entries(models).map(([name, score]) => [name,
    rankingMetrics(cases.map(c => ({ ...c, selectedScore: score(c) })), 'selectedScore')])),
  primaryComparison: pairedCalendarComparison(cases, c => c.score, c => c.peakIndex, model.policy.bootstrap),
  baselineComparison: pairedCalendarComparison(cases, c => c.score, c => c.nativeBaseline, model.policy.bootstrap),
  alertBudget: Object.fromEntries(Object.entries(models).map(([name, score]) => [name, calendarAlertBudget(cases, score, model.policy.topK)])),
  scope: model.scope };
await writeFile(directory + '/evaluation.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: directory + '/evaluation.json', rankings: result.rankings, primaryComparison: result.primaryComparison,
  baselineComparison: result.baselineComparison, calendarEvents: result.calendarEvents, missingSourceLabels: result.missingSourceLabels }));
