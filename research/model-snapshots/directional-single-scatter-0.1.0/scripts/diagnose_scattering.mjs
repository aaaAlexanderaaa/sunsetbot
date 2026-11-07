import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { join } from 'node:path';
import { computeDirectionalFrame, solarAltitudeReference, SCATTERING_ASSUMPTIONS } from '../src/scattering-engine.mjs';
import { DISTANCES } from '../research/model-snapshots/section-optics-0.3.1/engine.mjs';
import { LEVELS } from '../research/model-snapshots/section-optics-0.3.1/provider.mjs';
import { rankingMetrics } from '../research/model-snapshots/section-optics-0.3.1/evaluation.mjs';

const json = async path => JSON.parse(await readFile(path, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const save = async (path, data) => {
  await writeFile(path + '.partial', JSON.stringify(data, null, 2) + '\n');await rename(path + '.partial', path);
};
const codeFiles = ['src/scattering-engine.mjs', 'src/radiance.mjs', 'src/radiative-geometry.mjs', 'src/section-medium.mjs',
  'src/astro.mjs', 'src/cloud-optics.mjs', 'src/provider.mjs', 'package-lock.json', 'scripts/diagnose_scattering.mjs',
  'research/model-snapshots/section-optics-0.3.1/engine.mjs', 'research/model-snapshots/section-optics-0.3.1/provider.mjs'];
async function codeIdentity() {
  const files = await Promise.all(codeFiles.map(async file => ({ file, sha256: hash(await readFile(file)) })));
  return { sha256: hash(JSON.stringify(files)), files };
}
function subdivide(values, sine = false) {
  return values.flatMap((v, i) => i === values.length - 1 ? [v] : [v, sine ?
    Math.asin((Math.sin(v * Math.PI / 180) + Math.sin(values[i + 1] * Math.PI / 180)) / 2) * 180 / Math.PI : (v + values[i + 1]) / 2]);
}

async function loadInput(id, density, cohort) {
  const directory = cohort === 'pilot' ? 'research/backtests/shanghai-era5-input-2023-06' : 'research/experiments/cloud-column-validation';
  const manifest = await json(directory + '/manifest.json'), receipt = manifest.cases.find(c => c.file === id + '.json');
  if (!receipt) throw Error('Unknown diagnostic case: ' + id);
  const file = join(directory, receipt.file), bytes = await readFile(file);
  if (hash(bytes) !== receipt.sha256) throw Error('Diagnostic input source mismatch');
  const c = JSON.parse(bytes), sources = [{ file, sha256: receipt.sha256 }];
  let weather = cohort === 'pilot' ? c.era5Weather : c.weather;
  let levelsHpa = LEVELS;
  if (density === 'dense') {
    if (cohort === 'pilot') {
      const directory = 'research/experiments/cloud-column-dense-inputs', manifest = await json(directory + '/manifest.json');
      const receipt = manifest.cases.find(r => r.file === id + '.json'), file = join(directory, receipt.file), bytes = await readFile(file);
      if (hash(bytes) !== receipt.sha256) throw Error('Dense diagnostic source mismatch');
      const dense = JSON.parse(bytes);
      if (dense.base.sha256 !== sources[0].sha256 || !dense.coarseOverlapMatches) throw Error('Dense input changed its coarse control');
      weather = dense.denseEra5Weather;levelsHpa = manifest.pressureHpa;sources.push({ file, sha256: receipt.sha256 });
    } else levelsHpa = c.pressureHpa;
  }
  return { ...c, weather, aerosol: cohort === 'pilot' ? c.eac4Aerosol : c.aerosol, levelsHpa, sources };
}

async function evaluate(job) {
  const identity = await codeIdentity();
  if (identity.sha256 !== job.codeSha256) throw Error('Research sources changed while the diagnostic batch was running');
  const input = await loadInput(job.id, job.density, job.cohort), frames = [], started = performance.now();
  const width = SCATTERING_ASSUMPTIONS.azimuthHalfWidthDegrees;
  const options = {};
  if (job.mesh.includes('source')) Object.assign(options, { maximumEmissionOpticalDepth: 0.25, gasStepKm: 2 });
  if (job.mesh.includes('angle')) Object.assign(options, { azimuthEdgesDegrees: subdivide([-width, 0, width]),
    elevationEdgesDegrees: subdivide(SCATTERING_ASSUMPTIONS.elevationEdgesDegrees, true) });
  for (const minute of job.minutes) {
    const result = computeDirectionalFrame({ ...input, time: Date.parse(input.event.time) + minute * 60000, distancesKm: DISTANCES }, options);
    frames.push(result);
  }
  const reference = solarAltitudeReference(input.event, input.location);
  const referenceFrame = computeDirectionalFrame({ ...input, time: Date.parse(reference.time), distancesKm: DISTANCES }, options);
  const measures = Object.fromEntries(SCATTERING_ASSUMPTIONS.phaseScenarios.map((g, p) => {
    const eventFrame = frames.find(f => f.time === input.event.time);
    const maximum = frames.reduce((a, b) => a.spectra[p].rgbIntegral[0] >= b.spectra[p].rgbIntegral[0] ? a : b);
    const excess = frame => Math.max(0, frame.spectra[p].rgbIntegral[0] - frame.spectra[p].rgbIntegral[2]);
    const maximumExcess = frames.reduce((a, b) => excess(a) >= excess(b) ? a : b);
    return [g, { eventRed: eventFrame?.spectra[p].rgbIntegral[0] ?? null,
      eventCoveredRed: eventFrame?.spectra[p].coveredRgbIntegral[0] ?? null,
      referenceRed: referenceFrame.spectra[p].rgbIntegral[0],
      referenceCoveredRed: referenceFrame.spectra[p].coveredRgbIntegral[0],
      maximumRed: maximum.spectra[p].rgbIntegral[0], maximumTime: maximum.time, maximumSunAltitude: maximum.sun.altitude,
      maximumRedExcess: excess(maximumExcess), maximumExcessTime: maximumExcess.time }];
  }));
  return { id: job.id, density: job.density, mesh: job.mesh, cohort: job.cohort, observedCase: input.observedCase,
    codeIdentity: identity, inputSources: input.sources, minuteOffsets: job.minutes, options, measures, frames, reference, referenceFrame,
    wallSeconds: (performance.now() - started) / 1000, scope: 'Previously inspected source-label development diagnostics; relative spectral cloud radiance, uncalibrated' };
}

if (!isMainThread) {
  evaluate(workerData).then(result => parentPort.postMessage(result)).catch(error => { throw error; });
} else main().catch(error => { console.error(error.stack);process.exitCode = 1; });

async function main() {
  const value = (name, fallback) => { const i = process.argv.indexOf(name);return i < 0 ? fallback : process.argv[i + 1]; };
  const cohort = value('--cohort', 'pilot'), density = value('--density', 'both'), mesh = value('--mesh', 'base');
  const directory = value('--directory', 'research/experiments/scattering-development');
  const minutes = value('--minutes', Array.from({ length: 17 }, (_, i) => i * 5 - 40).join(',')).split(',').map(Number);
  const threads = Number(value('--threads', '2')), capture = process.argv.includes('--capture');
  if (!['pilot', 'calendar'].includes(cohort) || !['coarse', 'dense', 'both'].includes(density) ||
      !['base', 'source', 'angle', 'source-angle'].includes(mesh) || !minutes.length || minutes.some(m => !Number.isFinite(m) || Math.abs(m) > 40) ||
      !Number.isInteger(threads) || threads < 1 || threads > 3) throw Error('Invalid bounded diagnostic configuration');
  const inputDirectory = cohort === 'pilot' ? 'research/backtests/shanghai-era5-input-2023-06' : 'research/experiments/cloud-column-validation';
  const manifest = await json(inputDirectory + '/manifest.json');
  const available = manifest.cases.map(c => c.file.replace('.json', ''));
  const ids = value('--ids', available.join(',')).split(',');
  if (ids.some(id => !available.includes(id)) || new Set(ids).size !== ids.length) throw Error('Diagnostic IDs must exist once in the preserved input cohort');
  const identity = await codeIdentity(), densities = density === 'both' ? ['coarse', 'dense'] : [density];
  const jobs = ids.flatMap(id => densities.map(density => ({ id, density, cohort, mesh, minutes, codeSha256: identity.sha256 })));
  const signature = hash(JSON.stringify({ jobs, codeIdentity: identity })), staging = 'var/reanalysis/scattering-batches/' + signature;
  await mkdir(staging, { recursive: true });
  let cursor = 0, failed = false;const results = [];
  const pools = await Promise.allSettled(Array.from({ length: Math.min(threads, jobs.length) }, async () => {
    while (!failed && cursor < jobs.length) {
      const job = jobs[cursor++], target = join(staging, job.id + '-' + job.density + '.json');
      let result;
      try { result = capture ? await json(target) : null; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      try {
        if (result) {
          const input = await loadInput(job.id, job.density, job.cohort);
          if (result.codeIdentity.sha256 !== identity.sha256 || JSON.stringify(input.sources) !== JSON.stringify(result.inputSources)) throw Error('Diagnostic checkpoint identity changed');
        } else {
          result = await new Promise((resolve, reject) => {
            const worker = new Worker(new URL(import.meta.url), { workerData: job });
            worker.once('message', resolve);worker.once('error', reject);
            worker.once('exit', code => { if (code !== 0) reject(Error('Diagnostic worker exited: ' + code)); });
          });
          await save(target, result);
        }
        results.push(result);
        console.log(JSON.stringify({ done: results.length, total: jobs.length, id: job.id, density: job.density, seconds: result.wallSeconds, measures: result.measures[0.85] }));
      } catch (error) { failed = true;throw error; }
    }
  }));
  for (const pool of pools) if (pool.status === 'rejected') throw pool.reason;
  results.sort((a, b) => a.id.localeCompare(b.id) || a.density.localeCompare(b.density));
  const rankings = {};
  for (const density of densities) for (const g of SCATTERING_ASSUMPTIONS.phaseScenarios) for (const measure of ['eventRed', 'eventCoveredRed', 'referenceRed', 'referenceCoveredRed', 'maximumRed', 'maximumRedExcess']) {
    const rows = results.filter(r => r.density === density).map(r => ({ observedGrade: r.observedCase.observedGrade, score: r.measures[g][measure] }));
    rankings[`${density}:g=${g}:${measure}`] = rankingMetrics(rows, 'score');
  }
  const summary = { computedAt: new Date().toISOString(), signature, codeIdentity: identity, cohort, mesh, minuteOffsets: minutes,
    cases: results.map(({ frames, referenceFrame, codeIdentity, ...record }) => record), rankings,
    scope: 'Preserved source labels now used for model development; radiance observables and g scenarios are diagnostic. New-date promotion requires a source freeze and independent coverage.' };
  if (capture) {
    await mkdir(directory, { recursive: true });
    for (const record of results) await save(join(directory, record.id + '-' + record.density + '.json'), record);
    await save(join(directory, 'summary.json'), summary);
  } else {
    const expected = await json(join(directory, 'summary.json'));
    const stable = ({ computedAt, ...s }) => ({ ...s, cases: s.cases.map(({ wallSeconds, ...r }) => r) });
    if (JSON.stringify(stable(expected)) !== JSON.stringify(stable(summary))) throw Error('Scattering diagnostic replay changed');
    console.log(JSON.stringify({ replayMatchesCaptured: true, signature }));
  }
  console.log(JSON.stringify({ directory, cases: results.length, rankings }));
}
