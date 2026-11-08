// A separate, small empirical candidate. Keep the registered radiance study
// and its source/policy immutable while using already-known development labels.
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { referenceModel } from './scattering-reference.mjs';
import { solarAltitudeReference } from '../src/scattering-engine.mjs';
import { interpolate } from '../research/model-snapshots/section-optics-0.3.1/provider.mjs';
import { fitQualityRank, qualityLogLoss, qualityRank } from '../src/quality-rank.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async file => JSON.parse(await readFile(file, 'utf8'));
const output = 'research/experiments/quality-rank';
const save = async (name, data) => writeFile(output + '/' + name, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
try {
  await access('research/sources/scattering-validation-calendar/manifest.json');
  throw Error('Independent labels already captured; prospective quality freeze requires a fresh calendar');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
try { await access(output + '/model.json');throw Error('Quality candidate already frozen'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const policyFile = 'research/experiments/quality-rank-policy.json', policyBytes = await readFile(policyFile), policy = JSON.parse(policyBytes);
const reference = await referenceModel(), cases = [], inputs = [];
for (const directory of ['research/backtests/shanghai-era5-input-2023-06', 'research/experiments/cloud-column-validation']) {
  const manifestFile = directory + '/manifest.json', manifestBytes = await readFile(manifestFile), manifest = JSON.parse(manifestBytes);
  inputs.push({ file: manifestFile, sha256: hash(manifestBytes) });
  for (const receipt of manifest.cases) {
    const file = directory + '/' + receipt.file, bytes = await readFile(file);
    if (hash(bytes) !== receipt.sha256) throw Error('Development input hash changed: ' + file);
    const input = JSON.parse(bytes), observation = input.observedCase;
    if (!observation || !Number.isInteger(observation.observedGrade) || observation.observedGrade < 0 || observation.observedGrade > 5 ||
        observation.date < policy.developmentDates[0] || observation.date > policy.developmentDates[1]) throw Error('Explicit in-calendar development label required');
    const weather = structuredClone(input.era5Weather ?? input.weather), aerosol = input.eac4Aerosol ?? input.aerosol;
    for (const point of weather) for (const field of ['precipitation', 'visibility']) {
      delete point.hourly[field];delete point.hourly_units[field];
    }
    const forecast = reference.module.computeForecast({ ...input, weather, aerosol });
    const solar = solarAltitudeReference(input.event, input.location), time = Date.parse(solar.time);
    const center = Math.floor(input.fanOffsets.length / 2) * reference.module.DISTANCES.length + reference.module.DISTANCES.indexOf(0);
    const [low, mid, high] = ['low', 'mid', 'high'].map(level => interpolate(weather[center], 'cloud_cover_' + level, time));
    if (![low, mid, high].every(Number.isFinite)) throw Error('Development native layer baseline missing');
    const peak = forecast.score, baseline = Math.max(mid, high) * (1 - low / 100);
    cases.push({ id: observation.id, date: observation.date, eventType: observation.eventType,
      observedGrade: observation.observedGrade, target: Number(observation.observedGrade > 0),
      evidenceState: observation.evidenceUrls && observation.evidenceUrls !== '-' ? 'linked_source' : 'source_label_only',
      features: [peak / 100, baseline / 100], peakIndex: peak, nativeBaseline: baseline,
      reference: solar, source: { file, sha256: receipt.sha256 } });
  }
}
cases.sort((a, b) => a.id.localeCompare(b.id));
if (cases.length !== 184 || new Set(cases.map(c => c.id)).size !== 184) throw Error('Complete development calendar required');
const training = cases.filter(c => c.date <= policy.innerTrainingDates[1]);
const validation = cases.filter(c => c.date >= policy.innerValidationDates[0]);
if (training.length !== 136 || validation.length !== 48) throw Error('Fixed chronological split changed');
const selection = policy.ridgeGrid.map(ridge => {
  const fit = fitQualityRank(training, ridge);
  return { ...fit, validationLogLoss: qualityLogLoss(validation, fit.parameters), trainingLogLoss: qualityLogLoss(training, fit.parameters) };
}).sort((a, b) => Math.abs(a.validationLogLoss - b.validationLogLoss) <= 1e-12 ? b.ridge - a.ridge : a.validationLogLoss - b.validationLogLoss);
const fit = fitQualityRank(cases, selection[0].ridge);
const referenceFile = 'research/experiments/scattering-reference-predictions.json';
const referenceBytes = await readFile(referenceFile), independent = JSON.parse(referenceBytes), physical = await read('research/experiments/scattering-selection.json');
if (hash(referenceBytes) !== physical.recipe.referencePredictionsSha256 || independent.observedLabelsRead !== 0 || independent.cases.length !== 122) throw Error('Prospective reference identity changed');
await mkdir(output, { recursive: true });
await save('development-features.json', { builtAt: new Date().toISOString(), cases, inputs, neutralizedOptionalFields: ['precipitation', 'visibility'], reference: reference.recipe });
const sourceFiles = [policyFile, 'src/quality-rank.mjs', 'scripts/freeze_quality_rank.mjs', 'scripts/evaluate_quality_rank.mjs',
  'tests/quality-rank.test.mjs', 'scripts/scattering-reference.mjs', 'scripts/validation-statistics.mjs', 'scripts/radiance-ranking.mjs',
  'src/scattering-engine.mjs', 'src/astro.mjs', 'research/model-snapshots/section-optics-0.3.1/manifest.json'];
const source = [];
for (const file of sourceFiles) source.push({ file, sha256: hash(await readFile(file)) });
const recipe = { model: policy.candidate, policySha256: hash(policyBytes), source, developmentFeaturesSha256: hash(await readFile(output + '/development-features.json')),
  referencePredictions: { file: referenceFile, sha256: hash(referenceBytes) }, frozenReference: reference.recipe,
  physicalCandidate: physical.candidateIdentity, fit, ridgeSelection: selection,
  trainingEvents: training.length, validationEvents: validation.length, totalDevelopmentEvents: cases.length,
  positiveDevelopmentLabels: cases.filter(c => c.target).length, parameterMeaning: ['intercept', 'neutral peak index / 100', 'native layer baseline / 100'] };
const candidateIdentity = hash(JSON.stringify(recipe)), frozenAt = new Date().toISOString();
await save('model.json', { frozenAt, candidateIdentity, recipe, policy, independentLabelsRead: 0,
  scope: 'Additional exploratory weak-source-label ranking candidate, separate from the frozen radiance primary study. Production remains section-optics-0.3.1. ERA5/EAC4 feature scope; operational provider transfer and verified probability calibration remain separate.' });
const predictions = independent.cases.map(c => {
  if (c.date < policy.independentDates[0] || c.date > policy.independentDates[1] || c.observedGrade !== undefined) throw Error('Prospective quality calendar changed');
  const features = [c.heuristicPeakScore / 100, c.nativeBaselineScore / 100];
  return { id: c.id, date: c.date, eventType: c.eventType, features, score: qualityRank(fit.parameters, features),
    peakIndex: c.heuristicPeakScore, nativeBaseline: c.nativeBaselineScore };
});
await save('predictions.json', { completedAt: new Date().toISOString(), candidateIdentity, independentLabelsRead: 0,
  modelSha256: hash(await readFile(output + '/model.json')), cases: predictions });
console.log(JSON.stringify({ output, candidateIdentity, developmentEvents: cases.length, positiveDevelopmentLabels: recipe.positiveDevelopmentLabels,
  ridge: fit.ridge, parameters: fit.parameters, validationLogLoss: selection[0].validationLogLoss, independentPredictions: predictions.length, independentLabelsRead: 0 }));
