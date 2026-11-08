// Freeze only after the finite numerical gate; observed labels follow this file.
import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { codeIdentity } from './diagnose_scattering.mjs';
import { referenceModel } from './scattering-reference.mjs';
import { SCATTERING_VERSION, SCATTERING_ASSUMPTIONS } from '../src/scattering-engine.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const file = 'research/experiments/scattering-selection.json';
try { await access(file);throw Error('Existing scattering freeze is immutable'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const identity = await codeIdentity(), acceptance = await json('research/experiments/scattering-numerical-acceptance/summary.json');
if (!acceptance.accepted || acceptance.comparisons.length !== 6 || acceptance.codeIdentity.sha256 !== identity.sha256 ||
    acceptance.scriptSha256 !== hash(await readFile('scripts/accept_scattering_numerics.mjs'))) {
  throw Error('A complete matching six-medium numerical acceptance is required before candidate freeze');
}
const geometry = await json('research/experiments/scattering-angular-envelope-verification.json');
if (!geometry.passed || geometry.codeIdentity.sha256 !== identity.sha256 || geometry.cases.length !== 6 ||
    geometry.verifierSha256 !== hash(await readFile('scripts/verify_angular_envelopes.mjs'))) throw Error('Matching actual-medium envelope verification is required');
try {
  await access('research/sources/scattering-validation-calendar/manifest.json');
  throw Error('New-date label sources already exist; preserve their earlier freeze before selecting a candidate');
} catch (e) { if (e.code !== 'ENOENT') throw e; }
const weatherManifest = 'research/experiments/scattering-weather-inputs/manifest.json', weather = await json(weatherManifest);
if (weather.sourceLabelsRead !== 0 || weather.cases.length !== 122) throw Error('The prespecified label-free weather calendar is required');
const predictionsPath = 'research/experiments/scattering-reference-predictions.json', predictions = await json(predictionsPath);
if (predictions.observedLabelsRead !== 0 || predictions.cases.length !== 122 ||
    predictions.weatherManifestSha256 !== hash(await readFile(weatherManifest)) ||
    predictions.scriptSha256 !== hash(await readFile('scripts/score_scattering_references.mjs')) ||
    predictions.solarReferenceSourceSha256 !== hash(await readFile('src/scattering-engine.mjs'))) throw Error('Matching weather-only reference predictions are required');
const acceptanceResults = [];
for (const comparison of acceptance.comparisons) for (const mode of ['base', 'tight', 'gas', 'partition']) {
  const path = `research/experiments/scattering-numerical-acceptance/${comparison.id}-${comparison.density}-${mode}.json`;
  const bytes = await readFile(path), result = JSON.parse(bytes);
  if (result.codeSha256 !== identity.sha256 || result.frame?.diagnostics.numericalStatus !== 'estimated_converged') {
    throw Error('Matching complete numerical result missing: ' + path);
  }
  acceptanceResults.push({ file: path, sha256: hash(bytes) });
}
const policyPath = 'research/experiments/scattering-validation-calendar/evaluation-policy-draft.json';
const policy = { ...await json(policyPath), status: 'frozen_before_observed_labels' };
const reference = await referenceModel(), analysisFiles = [];
for (const path of [policyPath, 'scripts/validation-statistics.mjs', 'scripts/scattering-reference.mjs',
  'scripts/accept_scattering_numerics.mjs', 'scripts/verify_angular_envelopes.mjs', 'scripts/build_scattering_weather.py',
  'scripts/freeze_scattering_candidate.mjs', 'scripts/score_scattering_references.mjs', 'scripts/score_scattering_calendar.mjs',
  'scripts/radiance-ranking.mjs']) {
  analysisFiles.push({ file: path, sha256: hash(await readFile(path)) });
}
const recipe = { codeIdentity: identity, modelVersion: SCATTERING_VERSION, assumptions: SCATTERING_ASSUMPTIONS,
  policy, reference: reference.recipe, analysisFiles, weatherManifestSha256: hash(await readFile(weatherManifest)),
  referencePredictionsSha256: hash(await readFile(predictionsPath)), acceptanceResults,
  acceptanceSummarySha256: hash(await readFile('research/experiments/scattering-numerical-acceptance/summary.json')),
  geometrySummarySha256: hash(await readFile('research/experiments/scattering-angular-envelope-verification.json')) };
const candidateIdentity = hash(JSON.stringify(recipe)), directory = 'research/model-snapshots/' + SCATTERING_VERSION;
try { await access(directory + '/manifest.json');throw Error('Existing source snapshot is immutable'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
for (const receipt of [...identity.files, ...analysisFiles]) {
  const target = directory + '/' + receipt.file;
  await mkdir(dirname(target), { recursive: true });await copyFile(receipt.file, target);
}
const frozen = { frozenAt: new Date().toISOString(), candidateIdentity, recipe,
  independentDates: ['2023-09-01', '2023-10-31'], observedLabelsRead: 0,
  replayMethod: 'Overlay archived source and scripts on source-base commit faaaed8; matching public input bundles remain in research/experiments/scattering-weather-inputs',
  scope: 'Finite six-medium empirical numerical acceptance followed by an independent retrospective source-label calendar' };
await writeFile(directory + '/manifest.json', JSON.stringify(frozen, null, 2) + '\n', { flag: 'wx' });
await writeFile(file, JSON.stringify(frozen, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ file, candidateIdentity, labelsRead: 0 }));
