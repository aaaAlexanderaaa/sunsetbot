// Prospective weather-only predictions. This script never retrieves labels.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Worker, isMainThread, workerData, parentPort } from 'node:worker_threads';
import { codeIdentity } from './diagnose_scattering.mjs';
import { computeDirectionalFrame } from '../src/scattering-engine.mjs';
import { DISTANCES } from '../research/model-snapshots/section-optics-0.3.1/engine.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const save = async (file, data) => { await writeFile(file + '.partial', JSON.stringify(data, null, 2) + '\n');await rename(file + '.partial', file); };
const selectionPath = 'research/experiments/scattering-selection.json';
const weatherDirectory = 'research/experiments/scattering-weather-inputs';

async function run(job) {
  if ((await codeIdentity()).sha256 !== job.codeSha256) throw Error('Candidate source changed before calendar prediction');
  const bytes = await readFile(weatherDirectory + '/' + job.input.file);
  if (hash(bytes) !== job.input.sha256) throw Error('Calendar weather input changed');
  const input = JSON.parse(bytes);
  if (input.observedCase || input.observedGrade !== undefined) throw Error('Prospective predictions require label-free inputs');
  const started = performance.now();
  try {
    const frame = computeDirectionalFrame({ ...input, levelsHpa: input.pressureHpa,
      distancesKm: DISTANCES, time: Date.parse(job.reference.time) });
    const primary = frame.spectra.find(s => s.asymmetry === 0.85);
    if (!primary) throw Error('Frozen primary phase scenario absent');
    const numericalStatus = frame.diagnostics.numericalStatus;
    return { ...job, numericalStatus, score: numericalStatus === 'estimated_converged' ? primary.rgbIntegral[0] : null,
      errorEstimate: numericalStatus === 'estimated_converged' ? primary.totalErrorEstimate[0] : null,
      frame, computedAt: new Date().toISOString(), wallSeconds: (performance.now() - started) / 1000, runtime: process.version };
  } catch (error) {
    return { ...job, numericalStatus: 'not_converged', score: null, errorEstimate: null,
      failure: { code: error.code ?? 'MODEL_ERROR', message: error.message, rays: error.rays, zeroIntervals: error.zeroIntervals },
      computedAt: new Date().toISOString(), wallSeconds: (performance.now() - started) / 1000, runtime: process.version };
  }
}

if (!isMainThread) run(workerData).then(result => parentPort.postMessage(result)).catch(error => { throw error; });
else main().catch(error => { console.error(error.stack);process.exitCode = 1; });

async function main() {
  const selectionBytes = await readFile(selectionPath), selection = JSON.parse(selectionBytes);
  const identity = await codeIdentity();
  if (identity.sha256 !== selection.recipe.codeIdentity.sha256) throw Error('Calendar prediction requires the frozen candidate source');
  const manifestBytes = await readFile(weatherDirectory + '/manifest.json'), manifest = JSON.parse(manifestBytes);
  const referenceBytes = await readFile('research/experiments/scattering-reference-predictions.json'), references = JSON.parse(referenceBytes);
  if (hash(manifestBytes) !== selection.recipe.weatherManifestSha256 ||
      hash(referenceBytes) !== selection.recipe.referencePredictionsSha256 || manifest.sourceLabelsRead !== 0) throw Error('Frozen input/reference identity changed');
  const jobs = manifest.cases.map(input => {
    const reference = references.cases.find(c => c.id === input.id);
    if (!reference) throw Error('Prospective common-altitude reference missing');
    return { id: input.id, input, reference: reference.reference, candidateIdentity: selection.candidateIdentity, codeSha256: identity.sha256 };
  });
  const stage = 'var/reanalysis/scattering-calendar-predictions/' + selection.candidateIdentity;
  await mkdir(stage, { recursive: true });const results = [];let cursor = 0, stopped = false;
  const pools = await Promise.allSettled(Array.from({ length: 2 }, async () => {
    while (!stopped && cursor < jobs.length) {
      const job = jobs[cursor++], file = stage + '/' + job.id + '.json';let result;
      try { result = await json(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      try {
        if (result && (result.candidateIdentity !== job.candidateIdentity || result.codeSha256 !== job.codeSha256 ||
            JSON.stringify(result.input) !== JSON.stringify(job.input) || JSON.stringify(result.reference) !== JSON.stringify(job.reference))) throw Error('Calendar checkpoint identity changed');
        if (!result) {
          result = await new Promise((resolve, reject) => {
            const worker = new Worker(new URL(import.meta.url), { workerData: job });
            worker.once('message', resolve);worker.once('error', reject);
            worker.once('exit', code => { if (code !== 0) reject(Error('Calendar worker exited: ' + code)); });
          });
          await save(file, result);
        }
        results.push(result);
        console.log(JSON.stringify({ completed: results.length, total: jobs.length, id: job.id,
          status: result.numericalStatus, seconds: result.wallSeconds, red: result.score, failure: result.failure?.code }));
      } catch (error) { stopped = true;throw error; }
    }
  }));
  for (const pool of pools) if (pool.status === 'rejected') throw pool.reason;
  const output = 'research/experiments/scattering-validation-predictions';await mkdir(output, { recursive: true });
  const receipts = [];
  for (const result of results.sort((a, b) => a.id.localeCompare(b.id))) {
    const file = result.id + '.json';await save(output + '/' + file, result);
    receipts.push({ id: result.id, file, sha256: hash(await readFile(output + '/' + file)), numericalStatus: result.numericalStatus });
  }
  await save(output + '/manifest.json', { completedAt: new Date().toISOString(), candidateIdentity: selection.candidateIdentity,
    selectionSha256: hash(selectionBytes), weatherManifestSha256: hash(manifestBytes),
    scriptSha256: hash(await readFile(new URL(import.meta.url))), cases: receipts,
    sourceLabelsRead: 0, acceptedNumericalPredictions: receipts.filter(r => r.numericalStatus === 'estimated_converged').length,
    scope: 'All 122 calendar-selected prospective weather-only predictions; numerical failures retain null scores and complete diagnostics' });
}
