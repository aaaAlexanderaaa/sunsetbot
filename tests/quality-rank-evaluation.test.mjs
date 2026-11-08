import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { qualityRank } from '../src/quality-rank.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('quality evaluation excludes missing labels from metrics, preserves the calendar and rejects refitted held-out features', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sunsetbot-quality-evaluation-'));
  try {
    const save = async (file, value) => {
      const path = join(root, file);await mkdir(join(path, '..'), { recursive: true });
      const bytes = JSON.stringify(value);await writeFile(path, bytes);return hash(bytes);
    };
    const parameters = [0, 1, 0], predictions = [], observations = [], references = [];
    for (let i = 0; i < 122; i++) {
      const date = new Date(Date.UTC(2023, 8, 1 + Math.floor(i / 2))).toISOString().slice(0, 10);
      const eventType = i % 2 ? 'sunset' : 'sunrise', id = date + '-' + eventType, target = i % 2;
      const features = [target, 1 - target];
      predictions.push({ id, date, eventType, features, score: qualityRank(parameters, features), peakIndex: target * 100, nativeBaseline: (1 - target) * 100 });
      observations.push({ id, date, observedGrade: i === 2 ? null : target, observation: { evidenceState: 'synthetic_test_only' } });
      references.push({ id, heuristicPeakScore: target * 100, nativeBaselineScore: (1 - target) * 100 });
    }
    const referenceFile = 'references.json', referenceHash = await save(referenceFile, { cases: references });
    const developmentHash = await save('research/experiments/quality-rank/development-features.json', { fixture: true });
    const model = { candidateIdentity: 'synthetic-quality-only', recipe: { source: [], frozenReference: { dependencies: [] },
      developmentFeaturesSha256: developmentHash, referencePredictions: { file: referenceFile, sha256: referenceHash },
      physicalCandidate: 'synthetic-physical-only', fit: { parameters } },
      policy: { bootstrap: { replicates: 20, blockDays: 3, seed: 20230901 }, topK: 20 }, scope: 'Synthetic test only' };
    const modelHash = await save('research/experiments/quality-rank/model.json', model);
    const predictionFile = 'research/experiments/quality-rank/predictions.json';
    const predictionDocument = { candidateIdentity: model.candidateIdentity, modelSha256: modelHash, independentLabelsRead: 0,
      completedAt: '2023-11-01T00:00:00Z', cases: predictions };
    await save(predictionFile, predictionDocument);
    const rawFile = 'research/sources/scattering-validation-calendar/observations.json', rawHash = await save(rawFile, { fixture: true });
    const sourceManifest = [{ file: 'observations.json', sha256: rawHash, status: 200, captured_at: '2023-11-02T00:00:00Z' }];
    const manifestHash = await save('research/sources/scattering-validation-calendar/manifest.json', sourceManifest);
    await save('research/experiments/scattering-independent-validation/summary.json', {
      candidateIdentity: 'synthetic-physical-only', sourceManifestSha256: manifestHash, cases: observations });
    const run = () => spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/evaluate_quality_rank.mjs', import.meta.url))], { cwd: root, encoding: 'utf8' });
    const result = run();assert.equal(result.status, 0, result.stderr);
    const evaluation = JSON.parse(await readFile(join(root, 'research/experiments/quality-rank/evaluation.json'), 'utf8'));
    assert.equal(evaluation.calendarEvents, 122);
    assert.equal(evaluation.missingSourceLabels, 1);
    assert.equal(evaluation.rankings.empirical.evaluatedCases, 121);
    assert.equal(evaluation.rankings.empirical.pairwiseAuc, 1);
    assert.equal(evaluation.rankings.empirical.ordinalSpearman, 1);
    assert.equal(evaluation.rankings.nativeLayerBaseline.pairwiseAuc, 0);
    assert.equal(evaluation.baselineComparison.difference, 1);
    assert.equal(evaluation.primaryComparison.calendarDates, 61);
    assert.equal(evaluation.primaryComparison.pairedEvents, 121);
    predictions[0].features[0] = 0.5;predictions[0].peakIndex = 50;
    predictions[0].score = qualityRank(parameters, predictions[0].features);
    await save(predictionFile, predictionDocument);
    const altered = run();assert.equal(altered.status, 1);assert.match(altered.stderr, /Frozen quality prediction mismatch/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
