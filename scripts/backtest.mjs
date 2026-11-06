import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { fetch as networkFetch, EnvHttpProxyAgent } from 'undici';
import { DiskCache } from '../src/cache.mjs';
import { WeatherProvider, interpolate } from '../src/provider.mjs';
import { computeForecast, DISTANCES, MODEL_VERSION, ASSUMPTIONS, samplingOffsets } from '../src/engine.mjs';
import { addDays, destination, solarEvent, round } from '../src/astro.mjs';
import { observationRows, selectChallenge, rankingMetrics } from '../src/evaluation.mjs';

const allReturned = process.argv.includes('--all');
const pilotDirectory = 'research/backtests/shanghai-2023-06';
const directory = allReturned ? pilotDirectory + '-all' : pilotDirectory;
const labelFile = 'research/sources/history/shanghai-2023-06-labels.json';
const location = { id: 'shanghai', name: '上海', lat: 31.2304, lon: 121.4737, timezone: 'Asia/Shanghai' };
const fetchInputs = process.argv.includes('--fetch');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const save = async (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function main() {
  await mkdir(directory, { recursive: true });
  const sourceBytes = await readFile(labelFile), observed = observationRows(JSON.parse(sourceBytes));
  const code = await Promise.all(['src/engine.mjs', 'src/cloud-optics.mjs', 'src/astro.mjs'].map(p => readFile(p)));
  const codeSha256 = hash(Buffer.concat(code));
  const selectionFile = join(directory, 'selection.json');
  let selection;
  try { selection = await json(selectionFile); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    selection = { selectedAt: new Date().toISOString(), modelVersion: MODEL_VERSION, codeSha256, assumptions: ASSUMPTIONS,
      labelSource: labelFile, labelSourceSha256: hash(sourceBytes), observedRows: observed.rows.length,
      excludedRows: observed.excluded, requestedRange: ['2023-06-01', '2023-06-30'],
      actualReturnedRange: [observed.rows[0]?.date, observed.rows.at(-1)?.date],
      design: allReturned ? 'All 20 returned labels across the continuous 2023-06-01..2023-06-10 block, including all same-day sunrise/sunset controls. Model parameters remain frozen after the initial challenge.' :
        'First three observed-positive events, each matched to nearest available same-event observed-zero control; ties prefer earlier dates. Selection frozen before forecast retrieval.',
      evaluation: allReturned ? 'Continuous returned-event pilot using stitched short-lead forecast archives; fixed-lead predictive skill remains separate.' :
        'Exploratory matched challenge using stitched short-lead forecast archives; fixed-lead predictive skill remains separate.',
      baseline: 'max(mid_cloud_percent,high_cloud_percent)*(1-low_cloud_percent/100) at the solar event instant',
      cases: allReturned ? observed.rows : selectChallenge(observed.rows) };
    await save(selectionFile, selection);
  }
  if (selection.codeSha256 !== codeSha256 || selection.modelVersion !== MODEL_VERSION || selection.labelSourceSha256 !== hash(sourceBytes)) {
    throw Error('Frozen model/label identity changed. Preserve this study and create a separately versioned experiment.');
  }
  const dispatcher = new EnvHttpProxyAgent();
  const provider = new WeatherProvider({ cache: new DiskCache('var/backtest/cache'), directory: 'var/backtest', dailyBudget: 4000, timeout: 60000,
    fetcher: (url, options) => networkFetch(url, { ...options, dispatcher }) });
  // Reserve time by conservative billing units, leaving space for the live app.
  const request = provider.request.bind(provider);
  let nextRequestAt = 0;
  provider.request = async (url, units) => {
    await sleep(Math.max(0, nextRequestAt - Date.now()));
    nextRequestAt = Date.now() + units * 60000 / 360;
    return request(url, units);
  };
  const cases = [], receipts = [];
  try {
    for (const observedCase of selection.cases) {
      let file = join(directory, observedCase.id + '.json');
      if (allReturned) {
        const existing = join(pilotDirectory, observedCase.id + '.json');
        try { await access(existing); file = existing; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      let source;
      try { await access(file); source = await json(file); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        if (!fetchInputs) throw Error('Missing archived input for ' + observedCase.id + '; use --fetch to retrieve this frozen study.');
        const event = solarEvent(observedCase.date, observedCase.eventType, location.lat, location.lon, location.timezone);
        const fanOffsets = samplingOffsets(event, location);
        const points = fanOffsets.flatMap(offset => DISTANCES.map(distance => destination(location.lat, location.lon, event.azimuth + offset, distance)));
        const day = event.time.slice(0, 10), startDate = addDays(day, -1), endDate = addDays(day, 1);
        const instant = Date.parse(event.time);
        const startHour = new Date(Math.floor((instant - 40 * 60000) / 3600000) * 3600000).toISOString().slice(0, 16);
        const endHour = new Date(Math.ceil((instant + 40 * 60000) / 3600000) * 3600000).toISOString().slice(0, 16);
        const weather = await provider.weather(points, 'gfs', startDate, endDate, { historical: true, startHour, endHour });
        const aerosol = await provider.aerosol(points, startDate, endDate);
        source = { capturedAt: new Date().toISOString(), kind: 'historical-forecast-stitched',
          initializationTime: null, fixedLeadHours: null, requestedWeatherHours: [startHour, endHour], observedCase, location, event, fanOffsets, points, weather, aerosol };
        await save(file, source);
      }
      const result = computeForecast({ weather: source.weather.data, aerosol: source.aerosol.data,
        event: source.event, location, fanOffsets: source.fanOffsets });
      const local = source.weather.data[Math.floor(source.fanOffsets.length / 2) * DISTANCES.length + DISTANCES.indexOf(0)];
      const low = interpolate(local, 'cloud_cover_low', source.event.time), mid = interpolate(local, 'cloud_cover_mid', source.event.time),
        high = interpolate(local, 'cloud_cover_high', source.event.time);
      const baselineScore = [low, mid, high].every(Number.isFinite) ? round(Math.max(mid, high) * (1 - low / 100), 2) : null;
      const row = { ...observedCase, score: result.score, baselineScore, modelVersion: result.modelVersion,
        aod: result.aod, pathCoverage: result.pathCoverage, peakTime: result.peakTime,
        aerosolSensitivity: result.sensitivity, cloudOverlapSensitivity: result.cloudOverlapSensitivity,
        localCloud: { low, mid, high }, inputFile: file, fixedLeadHours: null };
      cases.push(row); receipts.push({ file: relative(directory, file), sha256: hash(await readFile(file)) });
      console.log(JSON.stringify({ id: row.id, observed: row.observedLabel, score: row.score, baseline: row.baselineScore, aod: row.aod }));
    }
    const summary = { generatedAt: new Date().toISOString(), modelVersion: MODEL_VERSION, codeSha256,
      selection, cases, modelRanking: rankingMetrics(cases, 'score'), baselineRanking: rankingMetrics(cases, 'baselineScore'),
      currentProcessReservedUnits: provider.units,
      interpretation: (allReturned ? 'Twenty continuously returned labeled events supply a short June pilot, with only three observed-positive events. ' :
        'Six matched challenge cases expose failure modes; balanced case selection bounds interpretation. ') +
        'Stitched archives evaluate near-analysis reconstruction, with original model initialization and fixed forecast lead unknown.' };
    if (!fetchInputs) {
      const captured = await json(join(directory, 'summary.json'));
      const identical = JSON.stringify(captured.cases.map(c => [c.id, c.score, c.baselineScore])) === JSON.stringify(cases.map(c => [c.id, c.score, c.baselineScore]));
      console.log(JSON.stringify({ replayMatchesCapturedScores: identical, modelRanking: summary.modelRanking, baselineRanking: summary.baselineRanking }));
      if (!identical) throw Error('Local replay differs from captured historical evaluation');
      return;
    }
    await save(join(directory, 'summary.json'), summary);
    await save(join(directory, 'manifest.json'), receipts);
    const table = cases.map(c => `| ${c.date} | ${c.eventType} | ${c.observedLabel} | ${c.score} | ${c.baselineScore ?? 'missing'} | ${c.originalPrediction} |`).join('\n');
    await writeFile(join(directory, 'report.md'), `# Shanghai historical ${allReturned ? 'continuous pilot' : 'challenge'}\n\nModel: ${MODEL_VERSION}. Parameters are frozen across both studies.\n\n${selection.design}\n\n${selection.evaluation}\n\n| Date | Event | Observed label | Model index | Cloud baseline | Original ERA5 prediction |\n| --- | --- | --- | --- | --- | --- |\n${table}\n\nModel ranking: ${JSON.stringify(summary.modelRanking)}\n\nBaseline ranking: ${JSON.stringify(summary.baselineRanking)}\n\nThe cloud baseline is ${selection.baseline}. Source observation labels are the original curator's ordinal judgments. The request returned ${selection.observedRows} labeled events over ${selection.actualReturnedRange.join(' to ')}; later requested dates remain unknown. The initial balanced challenge supplies case-level error evidence, and the complete returned ten-day slice adds controls. General forecast accuracy requires a larger held-out continuous sample. Exact inputs and SHA-256 receipts are retained. Fixed-lead forecast evaluation requires run/lead-preserving archives.\n`);
    console.log(JSON.stringify({ report: join(directory, 'report.md'), modelRanking: summary.modelRanking, baselineRanking: summary.baselineRanking }));
  } finally { await dispatcher.close(); }
}
main().catch(error => { console.error(error.code ?? error.name, error.message); process.exitCode = 1; });
