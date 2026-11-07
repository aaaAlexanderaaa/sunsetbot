// Prepare weather retrieval only. No new-date observation labels are read.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { addDays, solarEvent, destination } from '../src/astro.mjs';
import { samplingOffsets, DISTANCES } from '../research/model-snapshots/section-optics-0.3.1/engine.mjs';

const frozen = JSON.parse(await readFile('research/experiments/cloud-column-selection.json', 'utf8'));
const location = { id: 'shanghai', name: '上海', lat: 31.2304, lon: 121.4737, timezone: 'Asia/Shanghai' };
const cases = [], months = new Map(), aerosolTimes = new Set(), aerosolDates = new Set();
for (let date = '2023-09-01'; date <= '2023-10-31'; date = addDays(date, 1)) {
  for (const eventType of ['sunrise', 'sunset']) {
    const event = solarEvent(date, eventType, location.lat, location.lon, location.timezone), fanOffsets = samplingOffsets(event, location);
    const t = Date.parse(event.time) / 1000;
    const first = Math.floor((t - 2400) / 3600) * 3600, last = Math.ceil((t + 2400) / 3600) * 3600;
    const hours = Array.from({ length: (last - first) / 3600 + 1 }, (_, i) => first + i * 3600);
    const startAod = Math.floor(first / 10800) * 10800, endAod = Math.ceil(last / 10800) * 10800;
    const aerosolHours = Array.from({ length: (endAod - startAod) / 10800 + 1 }, (_, i) => startAod + i * 10800);
    cases.push({ id: date + '-' + eventType, date, eventType, location, event, fanOffsets, hours, aerosolHours,
      points: fanOffsets.flatMap(offset => DISTANCES.map(distance => destination(location.lat, location.lon, event.azimuth + offset, distance))) });
    for (const time of hours) {
      const iso = new Date(time * 1000).toISOString(), month = iso.slice(0, 7);
      if (!months.has(month)) months.set(month, { days: new Set(), times: new Set() });
      months.get(month).days.add(iso.slice(8, 10));months.get(month).times.add(iso.slice(11, 16));
    }
    for (const time of aerosolHours) {
      const iso = new Date(time * 1000).toISOString();aerosolTimes.add(iso.slice(11, 16));aerosolDates.add(iso.slice(0, 10));
    }
  }
}
const jobs = [];
for (const [month, selected] of months) {
  if (month === '2023-08') continue; // Existing August regional files cover the Sep-1 sunrise brackets.
  const common = { product_type: ['reanalysis'], year: [month.slice(0, 4)], month: [month.slice(5)],
    day: [...selected.days].sort(), time: [...selected.times].sort(), area: [38, 110, 26, 132], data_format: 'grib', download_format: 'unarchived' };
  jobs.push({ id: 'scattering-pressure-' + month, dataset: 'reanalysis-era5-pressure-levels',
    request: { ...common, variable: ['fraction_of_cloud_cover', 'geopotential'], pressure_level: frozen.candidate.levelsHpa.map(String) } });
  jobs.push({ id: 'scattering-layers-' + month, dataset: 'reanalysis-era5-single-levels',
    request: { ...common, variable: ['low_cloud_cover', 'medium_cloud_cover', 'high_cloud_cover'] } });
}
const dates = [...aerosolDates].sort();
jobs.push({ id: 'scattering-eac4', dataset: 'cams-global-reanalysis-eac4', request: {
  variable: ['total_aerosol_optical_depth_550nm'], date: dates[0] + '/' + dates.at(-1), time: [...aerosolTimes].sort(),
  area: [38, 110, 26, 132], data_format: 'grib' } });
await mkdir('research/experiments/scattering-validation-calendar', { recursive: true });
await writeFile('research/experiments/scattering-validation-calendar/weather-selection.json', JSON.stringify({
  preparedAt: new Date().toISOString(), dates: ['2023-09-01', '2023-10-31'], cases,
  stage: 'Weather-only preparation; observation labels remain unrequested until a candidate/policy freeze',
  existingRegionalDependencies: ['var/reanalysis/validation-data/validation-pressure-2023-08.grib',
    'var/reanalysis/validation-data/validation-layers-2023-08.grib', 'var/reanalysis/validation-data/validation-terrain.grib'] }, null, 2) + '\n');
await writeFile('config/reanalysis/shanghai-scattering-validation-son.json', JSON.stringify({ version: 1,
  purpose: 'Weather-only acquisition for the prespecified Sep/Oct calendar; new observations follow candidate source freeze', jobs }, null, 2) + '\n');
console.log(JSON.stringify({ events: cases.length, jobs: jobs.length, sourceLabelsRead: 0, aerosolTimes: [...aerosolTimes].sort() }));
