import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MODEL_VERSION } from '../src/engine.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const directory = 'research/experiments/cloud-column-validation';
const summary = await json(directory + '/summary.json');
const freeze = await json('research/experiments/cloud-column-selection.json');
const source = Buffer.concat(await Promise.all(['engine.mjs', 'cloud-optics.mjs', 'astro.mjs'].map(f => readFile('src/' + f))));
if (MODEL_VERSION !== 'section-optics-0.3.1' || hash(source) !== freeze.candidate.base) {
  throw Error('Historical evidence belongs to the frozen original model; establish evidence for this implementation before publishing it');
}
if (summary.candidateIdentity !== freeze.candidateIdentity || summary.cases.length !== 164) throw Error('Validation result and freeze differ');
const original = summary.rankings.coarse_cumulative;
const budget = summary.alertBudget.coarse_cumulative;
const evidence = {
  modelVersion: MODEL_VERSION, modelSourceSha256: freeze.candidate.base,
  status: 'experimental', evaluatedAt: summary.evaluatedAt,
  study: { location: 'Shanghai', dates: ['2023-06-11', '2023-08-31'], events: summary.cases.length,
    positiveSourceLabels: summary.cases.filter(c => c.observedGrade > 0).length,
    input: 'ERA5 pressure-level cloud/geopotential and terrain; CAMS EAC4 AOD550; historical GFS observer precipitation/visibility',
    scope: 'Retrospective structural reconstruction against original-curator labels',
    evidenceCounts: summary.evidenceCounts, fixedLeadEstablished: false, independentlyVettedObservations: false,
    probabilityCalibrated: false, labelSource: 'https://sunsetbot.top/reanalysis/',
    summarySha256: hash(await readFile(directory + '/summary.json')),
    modelSnapshotManifestSha256: hash(await readFile('research/model-snapshots/section-optics-0.3.1/manifest.json')) },
  original: { ranking: original, topBudget: budget, nativeLayerBaseline: summary.baselineRanking,
    baselineTopBudget: summary.alertBudget.nativeBaseline },
  researchVariants: { rankings: summary.rankings, primaryComparison: summary.primaryComparison,
    densityComparison: summary.secondaryDensityComparison, decision: 'Retain original production engine; paired representation-change intervals span zero' },
  summaryZh: `上海 ${summary.cases.length} 场历史重建：分数最高 ${budget.selected} 场中 ${budget.positive} 场有霞标签，排序 AUC ${original.pairwiseAuc.toFixed(3)}。采用 ERA5/CAMS 资料及原站标签；观测覆盖、预报提前量和概率校准仍待核实。`,
};
await mkdir('src/evidence', { recursive: true });
await writeFile('src/evidence/section-optics-0.3.1.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ modelVersion: MODEL_VERSION, events: evidence.study.events, sourceVerified: true }));
