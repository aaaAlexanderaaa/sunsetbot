import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { evidenceForModel } from '../src/model-evidence.mjs';
import { MODEL_VERSION } from '../src/engine.mjs';

test('published evidence retains its actual model/input identity and experimental scope', async () => {
  const evidence = evidenceForModel(MODEL_VERSION);
  const source = Buffer.concat(await Promise.all(['engine.mjs', 'cloud-optics.mjs', 'astro.mjs'].map(f => readFile(new URL('../src/' + f, import.meta.url)))));
  assert.equal(createHash('sha256').update(source).digest('hex'), evidence.modelSourceSha256);
  const bytes = await readFile(new URL('../research/experiments/cloud-column-validation/summary.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.study.summarySha256);
  const summary = JSON.parse(bytes);
  assert.deepEqual(evidence.original.ranking, summary.rankings.coarse_cumulative);
  assert.equal(evidence.study.events, summary.cases.length);
  assert.equal(evidence.study.fixedLeadEstablished, false);
  assert.equal(evidence.study.independentlyVettedObservations, false);
  assert.equal(evidence.study.probabilityCalibrated, false);
  assert.equal(evidenceForModel('future-engine'), null);
});
