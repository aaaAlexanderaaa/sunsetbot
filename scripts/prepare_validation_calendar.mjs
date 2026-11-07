import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { observationRows } from '../research/model-snapshots/section-optics-0.3.1/evaluation.mjs';
import { solarEvent, destination } from '../research/model-snapshots/section-optics-0.3.1/astro.mjs';
import { DISTANCES, samplingOffsets } from '../research/model-snapshots/section-optics-0.3.1/engine.mjs';
import { researchModel } from './cloud-column-model.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async file => JSON.parse(await readFile(file, 'utf8'));
const save = async (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');

async function main() {
  const selection = await read('research/experiments/cloud-column-selection.json');
  const candidate = await researchModel(selection.candidate.levelsHpa, 'adjacent');
  if (candidate.identity !== selection.candidateIdentity) throw Error('Candidate changed after source freeze');
  const location = { id: 'shanghai', name: '上海', lat: 31.2304, lon: 121.4737, timezone: 'Asia/Shanghai' };
  const sources = await read('research/sources/validation-calendar/manifest.json');
  const rows = new Map(), excluded = [];
  for (const receipt of sources) {
    if (receipt.status !== 200) throw Error('Validation source capture missing');
    const file = join('research/sources/validation-calendar', receipt.file);
    const bytes = await readFile(file);
    if (hash(bytes) !== receipt.sha256) throw Error('Validation source integrity mismatch');
    const observed = observationRows(JSON.parse(bytes));
    excluded.push(...observed.excluded);
    for (const row of observed.rows) {
      if (rows.has(row.id)) throw Error('Overlapping validation date windows');
      rows.set(row.id, { ...row, evidenceState: row.evidenceUrls && row.evidenceUrls !== '-' ? 'linked_source' : 'source_label_only',
        labelSource: { file, sha256: receipt.sha256 } });
    }
  }
  const cases = [...rows.values()].sort((a, b) => a.id.localeCompare(b.id)).map(observedCase => {
    const event = solarEvent(observedCase.date, observedCase.eventType, location.lat, location.lon, location.timezone);
    const fanOffsets = samplingOffsets(event, location);
    const points = fanOffsets.flatMap(offset => DISTANCES.map(distance => destination(location.lat, location.lon, event.azimuth + offset, distance)));
    const t = Date.parse(event.time) / 1000;
    const first = Math.floor((t - 2400) / 3600) * 3600, last = Math.ceil((t + 2400) / 3600) * 3600;
    const hours = Array.from({ length: (last - first) / 3600 + 1 }, (_, i) => first + 3600 * i);
    const firstAod = Math.floor(first / 10800) * 10800, lastAod = Math.ceil(last / 10800) * 10800;
    const aerosolHours = Array.from({ length: (lastAod - firstAod) / 10800 + 1 }, (_, i) => firstAod + i * 10800);
    return { observedCase, location, event, fanOffsets, points, hours, aerosolHours };
  });
  if (cases.length !== 164 || cases[0].observedCase.date !== '2023-06-11' || cases.at(-1).observedCase.date !== '2023-08-31') {
    throw Error('Prespecified calendar coverage differs; preserve missing dates explicitly before scoring');
  }
  await mkdir('research/experiments/validation-calendar', { recursive: true });
  await save('research/experiments/validation-calendar/selection.json', { candidateIdentity: candidate.identity,
    sourceFrozenAt: selection.frozenAt, preparedAt: new Date().toISOString(), candidateUnchanged: true,
    dates: selection.validationDates, excluded, cases, scope: 'Independent calendar source labels; linked evidence and source-only records stay distinct. No candidate scores computed here.' });
  const months = new Map();
  for (const c of cases) for (const hour of c.hours) {
    const iso = new Date(hour * 1000).toISOString(), month = iso.slice(0, 7);
    if (!months.has(month)) months.set(month, { days: new Set(), times: new Set() });
    months.get(month).days.add(iso.slice(8, 10));months.get(month).times.add(iso.slice(11, 16));
  }
  const jobs = [];
  for (const [month, period] of months) {
    const common = { product_type: ['reanalysis'], year: [month.slice(0, 4)], month: [month.slice(5)],
      day: [...period.days].sort(), time: [...period.times].sort(), area: [38, 110, 26, 132], data_format: 'grib', download_format: 'unarchived' };
    jobs.push({ id: 'validation-pressure-' + month, dataset: 'reanalysis-era5-pressure-levels',
      request: { ...common, variable: ['fraction_of_cloud_cover', 'geopotential'], pressure_level: selection.candidate.levelsHpa.map(String) } });
    jobs.push({ id: 'validation-layers-' + month, dataset: 'reanalysis-era5-single-levels',
      request: { ...common, variable: ['low_cloud_cover', 'medium_cloud_cover', 'high_cloud_cover'] } });
  }
  jobs.push({ id: 'validation-terrain', dataset: 'reanalysis-era5-single-levels', request: {
    product_type: ['reanalysis'], variable: ['geopotential'], year: ['2023'], month: ['06'], day: ['10'], time: ['00:00'],
    area: [38, 110, 26, 132], data_format: 'grib', download_format: 'unarchived' } });
  jobs.push({ id: 'validation-eac4', dataset: 'cams-global-reanalysis-eac4', request: {
    variable: ['total_aerosol_optical_depth_550nm'], date: '2023-06-10/2023-08-31', time: ['00:00', '09:00', '12:00', '18:00', '21:00'],
    area: [38, 110, 26, 132], data_format: 'grib' } });
  await save('config/reanalysis/shanghai-validation-jja.json', { version: 1,
    purpose: 'Prespecified independent 164-event structural validation; candidate frozen before labels were retrieved. Monthly union of actual UTC score brackets.', jobs });
  const positives = cases.filter(c => c.observedCase.observedGrade > 0);
  console.log(JSON.stringify({ events: cases.length, positives: positives.length,
    linkedSourceRecords: cases.filter(c => c.observedCase.evidenceState === 'linked_source').length,
    rawRowsExcluded: excluded.length, dataJobs: jobs.length, candidateUnchanged: true }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
