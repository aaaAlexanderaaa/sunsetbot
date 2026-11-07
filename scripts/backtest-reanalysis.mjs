import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { computeForecast, DISTANCES, MODEL_VERSION } from '../src/engine.mjs';
import { interpolate } from '../src/provider.mjs';
import { rankingMetrics } from '../src/evaluation.mjs';
import { mixPressureFields } from './reanalysis-inputs.mjs';

const option = process.argv.indexOf('--directory');
const directory = option < 0 ? 'research/backtests/shanghai-era5-input-2023-06' : process.argv[option + 1];
const evaluate = process.argv.includes('--evaluate');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const hash = data => createHash('sha256').update(data).digest('hex');

async function main() {
  const manifest = await json(join(directory, 'manifest.json'));
  const modes = manifest.aerosolIntervention === false ? ['gfs_cams', 'era5_cams'] : ['gfs_cams', 'era5_cams', 'gfs_eac4', 'era5_eac4'];
  const control = await json('research/backtests/shanghai-2023-06-all/summary.json');
  const code = await Promise.all(['src/engine.mjs', 'src/cloud-optics.mjs', 'src/astro.mjs'].map(p => readFile(p)));
  if (hash(Buffer.concat(code)) !== manifest.modelSha256 || manifest.modelSha256 !== control.codeSha256) {
    throw Error('Frozen engine source identity differs from the archived control');
  }
  for (const [file, expected] of Object.entries(manifest.dependencySha256 ?? {})) {
    if (hash(await readFile(file)) !== expected) throw Error('Frozen model dependency changed: ' + file);
  }
  const cases = [];
  for (const receipt of manifest.cases) {
    const bytes = await readFile(join(directory, receipt.file));
    if (hash(bytes) !== receipt.sha256) throw Error('Reanalysis bundle hash mismatch: ' + receipt.file);
    const bundle = JSON.parse(bytes), originalBytes = await readFile(bundle.sourceGfs.file);
    if (hash(originalBytes) !== bundle.sourceGfs.sha256) throw Error('Control input hash mismatch');
    const original = JSON.parse(originalBytes), result = {};
    const inputs = {
      gfs_cams: [original.weather.data, original.aerosol.data],
      era5_cams: [bundle.era5Weather, original.aerosol.data],
    };
    if (manifest.aerosolIntervention !== false) {
      if (!bundle.eac4Aerosol) throw Error('EAC4 experiment requires complete aerosol data');
      inputs.gfs_eac4 = [original.weather.data, bundle.eac4Aerosol];
      inputs.era5_eac4 = [bundle.era5Weather, bundle.eac4Aerosol];
    }
    for (const [mode, [weather, aerosol]] of Object.entries(inputs)) {
      const computed = computeForecast({ weather, aerosol, event: bundle.event, location: bundle.location, fanOffsets: bundle.fanOffsets });
      result[mode] = { score: computed.score, peakTime: computed.peakTime, aodAtPeak: computed.aod,
        pathCoverage: computed.pathCoverage, overlapSensitivity: computed.cloudOverlapSensitivity,
        aerosolSensitivity: computed.sensitivity };
    }
    const profileAblations = {};
    for (const [name, pattern] of [['era5CloudOnly', /^cloud_cover_\d+hPa$/], ['era5HeightOnly', /^geopotential_height_\d+hPa$/]]) {
      const weather = mixPressureFields(original.weather.data, bundle.era5Weather, pattern);
      const computed = computeForecast({ weather, aerosol: original.aerosol.data,
        event: bundle.event, location: bundle.location, fanOffsets: bundle.fanOffsets });
      profileAblations[name] = { score: computed.score, peakTime: computed.peakTime };
    }
    const captured = control.cases.find(c => c.id === bundle.observedCase.id);
    if (!captured || result.gfs_cams.score !== captured.score) throw Error('GFS control failed exact replay: ' + bundle.observedCase.id);
    const center = Math.floor(bundle.fanOffsets.length / 2) * DISTANCES.length + DISTANCES.indexOf(0);
    const levels = bundle.nativeDiagnostics.pressureHpa;
    const localProfiles = levels.map(pressure => ({ pressureHpa: pressure,
      gfsCloudPercent: interpolate(original.weather.data[center], `cloud_cover_${pressure}hPa`, bundle.event.time),
      era5CloudPercent: interpolate(bundle.era5Weather[center], `cloud_cover_${pressure}hPa`, bundle.event.time),
      gfsHeightM: interpolate(original.weather.data[center], `geopotential_height_${pressure}hPa`, bundle.event.time),
      era5HeightM: interpolate(bundle.era5Weather[center], `geopotential_height_${pressure}hPa`, bundle.event.time) }));
    const baseline = row => {
      const values = ['low', 'mid', 'high'].map(level => interpolate(row, `cloud_cover_${level}`, bundle.event.time));
      return values.every(Number.isFinite) ? Math.max(values[1], values[2]) * (1 - values[0] / 100) : null;
    };
    const era5Baseline = baseline(bundle.era5Weather[center]);
    const row = { ...bundle.observedCase, baselineScore: captured.baselineScore, era5BaselineScore: era5Baseline,
      modes: result, profileAblations, localAtSolarEvent: { profiles: localProfiles,
        camsAod: interpolate(original.aerosol.data[center], 'aerosol_optical_depth', bundle.event.time),
        eac4Aod: bundle.eac4Aerosol ? interpolate(bundle.eac4Aerosol[center], 'aerosol_optical_depth', bundle.event.time) : null,
        era5Grid: bundle.selectedGrids.era5[center], eac4Grid: bundle.selectedGrids.eac4?.[center] ?? null },
      scoreInteraction: result.era5_eac4 ? Math.round(1000 * (result.era5_eac4.score - result.era5_cams.score - result.gfs_eac4.score + result.gfs_cams.score)) / 1000 : null };
    cases.push(row);
    console.log(JSON.stringify({ id: row.id, observedGrade: row.observedGrade,
      ...Object.fromEntries(modes.map(m => [m, result[m].score])), era5BaselineScore: era5Baseline }));
  }
  const summary = { generatedAt: new Date().toISOString(), modelVersion: MODEL_VERSION, modelSha256: manifest.modelSha256,
    design: manifest.design, cases,
    rankings: Object.fromEntries(modes.map(mode => [mode, rankingMetrics(cases.map(c => ({ ...c, score: c.modes[mode].score })), 'score')])),
    profileAblationRankings: Object.fromEntries(['era5CloudOnly', 'era5HeightOnly'].map(mode =>
      [mode, rankingMetrics(cases.map(c => ({ ...c, score: c.profileAblations[mode].score })), 'score')])),
    gfsBaselineRanking: rankingMetrics(cases, 'baselineScore'), era5BaselineRanking: rankingMetrics(cases, 'era5BaselineScore'),
    scope: 'Frozen input intervention on the preserved curator-labelled June slice. GFS ancillary terrain/rain/visibility are held fixed. ERA5 water/ice are diagnostics. Fixed-lead forecasting, independent truth coverage and generalisation retain separate evaluation.' };
  if (!evaluate) {
    const captured = await json(join(directory, 'summary.json'));
    const scores = rows => rows.map(c => [c.id, ...modes.map(m => c.modes[m].score), c.era5BaselineScore,
      c.profileAblations.era5CloudOnly.score, c.profileAblations.era5HeightOnly.score]);
    if (JSON.stringify(scores(captured.cases)) !== JSON.stringify(scores(cases))) throw Error('Frozen reanalysis scores differ from the captured experiment');
    console.log(JSON.stringify({ replayMatchesCapturedScores: true, rankings: summary.rankings }));
    return;
  }
  await writeFile(join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  const table = cases.map(c => `| ${c.id} | ${c.observedGrade} | ${modes.map(m => c.modes[m].score).join(' | ')} | ${c.baselineScore} | ${c.era5BaselineScore === null ? 'unavailable' : c.era5BaselineScore.toFixed(2)} |`).join('\n');
  const ablations = cases.map(c => `| ${c.id} | ${c.profileAblations.era5CloudOnly.score} | ${c.profileAblations.era5HeightOnly.score} |`).join('\n');
  const headings = { gfs_cams: 'GFS + CAMS', era5_cams: 'ERA5 + CAMS', gfs_eac4: 'GFS + EAC4', era5_eac4: 'ERA5 + EAC4' };
  await writeFile(join(directory, 'report.md'), `# Frozen reanalysis input comparison\n\nModel ${MODEL_VERSION}; ${cases.length} source-labelled events. The original GFS control replays exactly.\n\n${manifest.design}\n\n| Event | Source grade | ${modes.map(m => headings[m]).join(' | ')} | GFS cloud baseline | ERA5 cloud baseline |\n| ${Array(modes.length + 4).fill('---').join(' | ')} |\n${table}\n\nRanking metrics: ${JSON.stringify(summary.rankings)}\n\nGFS baseline: ${JSON.stringify(summary.gfsBaselineRanking)}\n\nERA5 baseline: ${JSON.stringify(summary.era5BaselineRanking)}\n\n## Pressure-field attribution\n\nThese auxiliary interventions hold the original CAMS aerosol and all other GFS fields fixed.\n\n| Event | ERA5 cloud fraction only | ERA5 height only |\n| --- | --- | --- |\n${ablations}\n\nAblation rankings: ${JSON.stringify(summary.profileAblationRankings)}\n\n${summary.scope}\n\nThe cloud baseline is max(mid, high) * (1 - low/100), in percent. Each native layer baseline retains its own data source. Source pressure fields and AOD use nearest grid points; actual coordinates and source hashes are retained. All optical parameters remain frozen. Missing native ERA5 aggregate layers stay unavailable.\n`);
  console.log(JSON.stringify({ output: directory, rankings: summary.rankings,
    gfsBaseline: summary.gfsBaselineRanking, era5Baseline: summary.era5BaselineRanking }));
}

main().catch(error => { console.error(error.code ?? error.name, error.message); process.exitCode = 1; });
