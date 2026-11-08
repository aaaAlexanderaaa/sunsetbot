import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { codeIdentity } from '../scripts/diagnose_scattering.mjs';

const run = promisify(execFile), root = fileURLToPath(new URL('..', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('the full offline evaluator preserves calendar missingness and pairs both baselines on synthetic observations', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sunset-evaluation-fixture-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const path of ['src', 'scripts', 'package-lock.json']) await symlink(join(root, path), join(directory, path));
  await mkdir(join(directory, 'research/model-snapshots'), { recursive: true });
  await symlink(join(root, 'research/model-snapshots/section-optics-0.3.1'), join(directory, 'research/model-snapshots/section-optics-0.3.1'));
  const save = async (path, value) => {
    const bytes = JSON.stringify(value) + '\n', target = join(directory, path);
    await mkdir(resolve(target, '..'), { recursive: true });await writeFile(target, bytes);return hash(bytes);
  };
  // Weather-only dates supply identities; every label and prediction below is
  // fabricated for this test. No independent-calendar observations are read.
  const calendar = JSON.parse(await readFile(join(root, 'research/experiments/scattering-validation-calendar/weather-selection.json')));
  const references = { cases: calendar.cases.map(c => ({ id: c.id, heuristicReferenceScore: 0,
    heuristicPeakScore: 0, nativeBaselineScore: c.eventType === 'sunset' ? 1 : 0 })) };
  const referenceHash = await save('research/experiments/scattering-reference-predictions.json', references);
  const selection = { candidateIdentity: 'synthetic-fixture-only', frozenAt: '2026-01-01T00:00:00Z', recipe: {
    codeIdentity: await codeIdentity(), referencePredictionsSha256: referenceHash, analysisFiles: [],
    policy: { bootstrap: { replicates: 10, blockDays: 3, seed: 42 }, topK: 20 } } };
  const selectionHash = await save('research/experiments/scattering-selection.json', selection);
  const receipts = [], rows = [];
  for (const [i, c] of calendar.cases.entries()) {
    const positive = c.eventType === 'sunset', failed = i === 1, score = positive ? 2 : 1;
    const prediction = { id: c.id, candidateIdentity: selection.candidateIdentity, score: failed ? null : score,
      errorEstimate: failed ? null : 0.01, numericalStatus: failed ? 'not_converged' : 'estimated_converged',
      frame: failed ? undefined : { spectra: [0, 0.75, 0.85, 0.9].map(asymmetry => ({ asymmetry,
        rgbIntegral: [score, score, score], coveredRgbIntegral: [score, score, score], totalErrorEstimate: [0.01, 0.01, 0.01] })) } };
    const file = c.id + '.json', sha256 = await save('research/experiments/scattering-validation-predictions/' + file, prediction);
    receipts.push({ id: c.id, file, sha256 });
    if (i < 120) rows.push([c.date, positive ? '日落' : '日出', 'synthetic', 'synthetic', positive ? '微烧' : '基本不烧', '-', '-', '-', '-', '-', '-']);
  }
  await save('research/experiments/scattering-validation-predictions/manifest.json', { candidateIdentity: selection.candidateIdentity,
    selectionSha256: selectionHash, completedAt: '2026-01-02T00:00:00Z', cases: receipts });
  const sourceFile = 'synthetic-labels.json', sourceHash = await save('research/sources/scattering-validation-calendar/' + sourceFile,
    { status: 'ok', table_content: rows });
  await save('research/sources/scattering-validation-calendar/manifest.json', [{ file: sourceFile, sha256: sourceHash, status: 200,
    url: 'https://example.invalid/?city_name=' + encodeURIComponent('上海'), candidateIdentity: selection.candidateIdentity,
    sourceFrozenAt: selection.frozenAt, captured_at: '2026-01-03T00:00:00Z', requested_range: ['2023-09-01', '2023-10-31'] }]);
  await run(process.execPath, [join(root, 'scripts/evaluate_scattering_calendar.mjs')], { cwd: directory, timeout: 30000 });
  const result = JSON.parse(await readFile(join(directory, 'research/experiments/scattering-independent-validation/summary.json')));
  assert.equal(result.cases.length, 122);
  assert.equal(result.evidenceCounts.missingLabels, 2);
  assert.equal(result.evidenceCounts.numericalFailures, 1);
  assert.equal(result.rankings.primary.evaluatedCases, 119);
  assert.equal(result.rankings.primary.pairwiseAuc, 1);
  assert.equal(result.primaryComparison.pairedEvents, 119);
  assert.equal(result.primaryComparison.calendarDates, 61);
  assert.equal(result.primaryComparison.difference, 0.5);
  assert.equal(result.numericalOrdering.unavailablePairs, 60);
});
