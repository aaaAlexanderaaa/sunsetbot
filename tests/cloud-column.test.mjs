import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { adjacentCloudBases } from '../src/cloud-column.mjs';
import { researchModel } from '../scripts/cloud-column-model.mjs';

const column = covers => covers.map((cover, i) => ({ height: 1 + i * 3, cover }));

test('a clear gap restores an upper base even when lower clouds have more area', () => {
  const faces = adjacentCloudBases(column([0.6, 0, 0.4]), 0, 0.15);
  assert.equal(faces.length, 2);
  assert.deepEqual(faces.map(f => [f.lower, f.upper, f.cover]), [[0, 0.6, 0.6], [0, 0.4, 0.4]]);
});

test('base fractions match the exact adjacent cloudy/clear mask events', () => {
  const covers = [0.6, 0.1, 0.4], faces = adjacentCloudBases(column(covers), 0, 0.15);
  const counts = covers.map(() => 0), samples = 10000;
  for (let i = 0; i < samples; i++) {
    const u = (i + 0.5) / samples;
    for (let layer = 0; layer < covers.length; layer++) {
      if (u < covers[layer] && (layer === 0 || u >= covers[layer - 1])) counts[layer]++;
    }
  }
  assert.equal(faces.length, 2);
  assert.equal(faces[0].cover, counts[0] / samples);
  assert.ok(Math.abs(faces[1].cover - counts[2] / samples) < 1e-12);
  assert.equal(faces[1].lower, 0.1);
  assert.equal(adjacentCloudBases(column([0.8, 0.4, 0.2]), 0, 0.15).length, 1);
  assert.deepEqual(adjacentCloudBases(column([0, 0, 0]), 0, 0.15), []);
});

test('below-terrain cloud does not erase the first above-ground base', () => {
  const faces = adjacentCloudBases([{ height: -1, cover: 0.9 }, { height: 1, cover: 0.4 }], 0, 0.15);
  assert.equal(faces.length, 1);
  assert.equal(faces[0].cover, 0.4);
  assert.throws(() => adjacentCloudBases(column([0.4]), 0), /explicit/);
});

test('research cumulative model reproduces the preserved production score', async () => {
  const caseData = JSON.parse(await readFile(new URL('../research/backtests/shanghai-era5-input-2023-06/2023-06-10-sunrise.json', import.meta.url)));
  const control = await researchModel(caseData.nativeDiagnostics.pressureHpa, 'cumulative');
  const result = control.module.computeForecast({ weather: caseData.era5Weather, aerosol: caseData.eac4Aerosol,
    event: caseData.event, location: caseData.location, fanOffsets: caseData.fanOffsets });
  assert.equal(result.score, 14.4);
  const candidate = await researchModel(caseData.nativeDiagnostics.pressureHpa, 'adjacent');
  assert.equal(candidate.module.cloudDecks(column([0.6, 0, 0.4])).length, 2);
  assert.equal(control.module.cloudDecks(column([0.6, 0, 0.4])).length, 1);
});
