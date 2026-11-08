import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { codeIdentity, loadInput } from './diagnose_scattering.mjs';
import { computeDirectionalFrame, solarAltitudeReference, SCATTERING_ASSUMPTIONS } from '../src/scattering-engine.mjs';
import { DISTANCES } from '../research/model-snapshots/section-optics-0.3.1/engine.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const save = async (file, value) => { await writeFile(file + '.partial', JSON.stringify(value, null, 2) + '\n');await rename(file + '.partial', file); };
const ids = ['2023-06-03-sunset', '2023-06-09-sunset', '2023-06-10-sunrise'];

async function run(job) {
  if ((await codeIdentity()).sha256 !== job.codeSha256) throw Error('Numerical sources changed during acceptance');
  const input = await loadInput(job.id, job.density, 'pilot'), reference = solarAltitudeReference(input.event, input.location), options = {};
  if (job.mode === 'tight') Object.assign(options, {
    sourceRelativeTolerance: SCATTERING_ASSUMPTIONS.sourceRelativeTolerance / 4,
    sourceAbsoluteTolerance: SCATTERING_ASSUMPTIONS.sourceAbsoluteTolerance / 4,
    angularRelativeTolerance: SCATTERING_ASSUMPTIONS.angularRelativeTolerance / 4,
    angularAbsoluteTolerance: SCATTERING_ASSUMPTIONS.angularAbsoluteTolerance / 4, maximumAngularRays: 8192,
  });
  if (job.mode === 'gas') options.gasStepKm = SCATTERING_ASSUMPTIONS.gasStepKm / 2;
  if (job.mode === 'partition') Object.assign(options, { azimuthPartitionFractions: [0.25, 0.75],
    elevationEdgesDegrees: [0.5, 0.75, 1.5, 3.5, 7.5, 15, 30, 55, 75, 85], maximumAngularRays: 8192 });
  const started = performance.now();
  try {
    const frame = computeDirectionalFrame({ ...input, time: Date.parse(reference.time), distancesKm: DISTANCES }, options);
    return { ...job, options, reference, inputSources: input.sources, frame, wallSeconds: (performance.now() - started) / 1000 };
  } catch (error) {
    if (error.code !== 'ANGULAR_BUDGET' && !error.message.includes('evaluation budget')) throw error;
    return { ...job, options, reference, inputSources: input.sources, wallSeconds: (performance.now() - started) / 1000,
      failure: { code: error.code ?? 'SOURCE_BUDGET', message: error.message, rays: error.rays }, numericalStatus: 'not_converged' };
  }
}

if (!isMainThread) run(workerData).then(result => parentPort.postMessage(result)).catch(error => { throw error; });
else main().catch(error => { console.error(error.stack);process.exitCode = 1; });

async function main() {
  const identity = await codeIdentity(), scriptSha256 = hash(await readFile(new URL(import.meta.url)));
  const jobs = ids.flatMap(id => ['coarse', 'dense'].flatMap(density => ['base', 'tight', 'gas', 'partition'].map(mode => ({ id, density, mode, codeSha256: identity.sha256 }))));
  const signature = hash(JSON.stringify({ jobs, identity, scriptSha256 })), stage = 'var/reanalysis/scattering-acceptance/' + signature;
  const output = 'research/experiments/scattering-numerical-acceptance';
  await mkdir(stage, { recursive: true });const results = [];let cursor = 0, failed = false;
  const pools = await Promise.allSettled(Array.from({ length: 2 }, async () => {
    while (!failed && cursor < jobs.length) {
      const job = jobs[cursor++], file = stage + '/' + job.id + '-' + job.density + '-' + job.mode + '.json';let result;
      try { result = await json(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      try {
        if (!result) {
          result = await new Promise((resolve, reject) => {
            const worker = new Worker(new URL(import.meta.url), { workerData: job });
            worker.once('message', resolve);worker.once('error', reject);
            worker.once('exit', code => { if (code !== 0) reject(Error('Acceptance worker exited: ' + code)); });
          });
          await save(file, result);
        }
        results.push(result);
        console.log(JSON.stringify({ done: results.length, total: jobs.length, id: job.id, density: job.density, mode: job.mode,
          status: result.frame?.diagnostics.numericalStatus ?? result.numericalStatus, seconds: result.wallSeconds,
          red: result.frame?.spectra.find(s => s.asymmetry === 0.85)?.rgbIntegral[0], failure: result.failure }));
      } catch (error) { failed = true;throw error; }
    }
  }));
  for (const pool of pools) if (pool.status === 'rejected') throw pool.reason;
  const comparisons = [];
  for (const id of ids) for (const density of ['coarse', 'dense']) {
    const selected = results.filter(r => r.id === id && r.density === density), baseline = selected.find(r => r.mode === 'base');
    let accepted = selected.every(r => r.frame?.diagnostics.numericalStatus === 'estimated_converged');
    const differences = [];
    if (baseline.frame) for (const result of selected.filter(r => r.mode !== 'base' && r.frame)) {
      for (let p = 0; p < baseline.frame.spectra.length; p++) for (const field of ['rgbIntegral', 'coveredRgbIntegral']) for (let channel = 0; channel < 3; channel++) {
        const a = baseline.frame.spectra[p][field][channel], b = result.frame.spectra[p][field][channel];
        const tolerance = Math.max(SCATTERING_ASSUMPTIONS.totalAbsoluteTolerance, SCATTERING_ASSUMPTIONS.totalRelativeTolerance * Math.abs(b));
        const budget = result.mode === 'gas' ? tolerance * 0.05 : tolerance;
        accepted &&= Math.abs(a - b) <= budget;
        differences.push({ mode: result.mode, asymmetry: baseline.frame.spectra[p].asymmetry, field, channel, baseline: a, refined: b,
          absoluteDifference: Math.abs(a - b), relativeDifference: b !== 0 ? Math.abs(a - b) / Math.abs(b) : null, budget });
      }
    }
    comparisons.push({ id, density, accepted, differences });
  }
  await mkdir(output, { recursive: true });
  for (const result of results) await save(output + '/' + result.id + '-' + result.density + '-' + result.mode + '.json', result);
  const summary = { completedAt: new Date().toISOString(), signature, codeIdentity: identity, scriptSha256,
    accepted: comparisons.every(c => c.accepted), comparisons,
    scope: 'Six fixed real media; numerical acceptance only. Label grades have no role in numerical acceptance.' };
  await save(output + '/summary.json', summary);
  console.log(JSON.stringify({ output, accepted: summary.accepted, cases: comparisons.map(c => ({ id: c.id, density: c.density, accepted: c.accepted })) }));
}
