import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { researchModel } from './cloud-column-model.mjs';
import { rankingMetrics } from '../research/model-snapshots/section-optics-0.3.1/evaluation.mjs';

const dense = process.argv.includes('--dense');
const capture = process.argv.includes('--capture');
const base = 'research/backtests/shanghai-era5-input-2023-06';
const denseDirectory = 'research/experiments/cloud-column-dense-inputs';
const output = 'research/experiments/cloud-column-' + (dense ? 'factorial' : 'coarse');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));

async function main() {
  const manifest = await json(join(base, 'manifest.json'));
  const control = await json(join(base, 'summary.json'));
  const first = await json(join(base, manifest.cases[0].file));
  const coarseLevels = first.nativeDiagnostics.pressureHpa;
  const denseManifest = dense ? await json(join(denseDirectory, 'manifest.json')) : null;
  const models = {};
  for (const [resolution, levels] of [['coarse', coarseLevels], ...(dense ? [['dense', denseManifest.pressureHpa]] : [])]) {
    for (const representation of ['cumulative', 'adjacent']) models[resolution + '_' + representation] = await researchModel(levels, representation);
  }
  const selection = await json('research/experiments/cloud-column-selection.json');
  if (dense && models.dense_adjacent.identity !== selection.candidateIdentity) throw Error('Prespecified candidate source changed');
  const cases = [];
  for (const item of manifest.cases) {
    const bytes = await readFile(join(base, item.file));
    if (hash(bytes) !== item.sha256) throw Error('Frozen case integrity mismatch');
    const b = JSON.parse(bytes);
    let extended;
    if (dense) {
      const receipt = denseManifest.cases.find(c => c.file === item.file);
      const extraBytes = await readFile(join(denseDirectory, item.file));
      if (!receipt || hash(extraBytes) !== receipt.sha256) throw Error('Dense case integrity mismatch');
      extended = JSON.parse(extraBytes);
      if (extended.base.sha256 !== item.sha256 || !extended.coarseOverlapMatches) throw Error('Dense input changed its control');
    }
    const scores = {};
    for (const [name, model] of Object.entries(models)) {
      const result = model.module.computeForecast({ weather: name.startsWith('dense') ? extended.denseEra5Weather : b.era5Weather,
        aerosol: b.eac4Aerosol, event: b.event, location: b.location, fanOffsets: b.fanOffsets });
      scores[name] = { score: result.score, peakTime: result.peakTime, targetsAtPeak: result.section.targets.length };
    }
    const old = control.cases.find(c => c.id === b.observedCase.id);
    if (scores.coarse_cumulative.score !== old.modes.era5_eac4.score) throw Error('Immutable cumulative control failed exact reproduction');
    cases.push({ id: b.observedCase.id, observedGrade: b.observedCase.observedGrade, scores,
      era5BaselineScore: old.era5BaselineScore, sourceSha256: item.sha256 });
    console.log(JSON.stringify({ id: b.observedCase.id, grade: b.observedCase.observedGrade,
      ...Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v.score])) }));
  }
  const summary = { generatedAt: new Date().toISOString(), design: 'Pressure density x cumulative/adjacent cloud-base discovery; original coefficients, 15% threshold, global maximum vertical overlap, AOD and all other inputs frozen.',
    models: Object.fromEntries(Object.entries(models).map(([name, model]) => [name, { identity: model.identity, recipe: model.recipe }])),
    cases, rankings: Object.fromEntries(Object.keys(models).map(name => [name,
      rankingMetrics(cases.map(c => ({ ...c, score: c.scores[name].score })), 'score')])),
    baselineRanking: rankingMetrics(cases, 'era5BaselineScore'),
    scope: 'Known twenty-event development slice; candidate source is frozen before the independent validation calendar is read or scored.' };
  if (!capture) {
    const expected = await json(join(output, 'summary.json'));
    const scores = rows => rows.map(c => [c.id, c.scores]);
    if (JSON.stringify(scores(expected.cases)) !== JSON.stringify(scores(cases))) throw Error('Candidate replay changed');
    console.log(JSON.stringify({ replayMatchesCaptured: true, rankings: summary.rankings }));
    return;
  }
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ output, rankings: summary.rankings, baseline: summary.baselineRanking }));
}

main().catch(error => { console.error(error.code ?? error.name, error.message); process.exitCode = 1; });
