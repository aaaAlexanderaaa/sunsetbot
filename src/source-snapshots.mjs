import { createHash } from 'node:crypto';
import { DiskCache } from './cache.mjs';
import { forecastSampling } from './service.mjs';
import { upcomingEvents } from './refresh-schedule.mjs';
import { AppError } from './errors.mjs';
import { WEATHER_FIELDS } from './provider.mjs';

export const WEATHER_GRID_DEGREES = 0.25;
export const AEROSOL_GRID_DEGREES = 0.4;
export const SOURCE_MAX_AGE_MS = 48 * 3600000;
export const FORECAST_MODELS = ['gfs', 'ecmwf'];

export function gridPoint(point, step) {
  return { lat: Number((Math.round(point.lat / step) * step).toFixed(4)),
    lon: Number((Math.round(point.lon / step) * step).toFixed(4)) };
}
const pointKey = point => `${point.lat},${point.lon}`;
const gridKey = (point, step) => pointKey(gridPoint(point, step));

export function acquisitionPlan(locations, instant, occurrences) {
  const events = locations.flatMap(location => upcomingEvents(location, instant, occurrences));
  const weather = new Map(), aerosol = new Map(), dates = [];
  for (const input of events) {
    const sample = forecastSampling(input);
    dates.push(sample.startDate, sample.endDate);
    for (const point of sample.points) {
      const w = gridPoint(point, WEATHER_GRID_DEGREES), a = gridPoint(point, AEROSOL_GRID_DEGREES);
      weather.set(pointKey(w), w); aerosol.set(pointKey(a), a);
    }
  }
  dates.sort();
  return { events, weatherPoints: [...weather.values()], aerosolPoints: [...aerosol.values()],
    startDate: dates[0], endDate: dates.at(-1), occurrences,
    estimatedUnits: weather.size * Math.ceil(WEATHER_FIELDS.length / 10) * FORECAST_MODELS.length + aerosol.size };
}

export function makeSourceSnapshot({ kind, model, jobId, requestedAt, weather, aerosol }) {
  const sourceId = createHash('sha256').update(JSON.stringify({ model, weather, aerosol })).digest('hex');
  return { schemaVersion: 1, kind, model, jobId, requestedAt, sourceId,
    fetchedAt: weather.fetchedAt, weather, aerosol };
}

export class SnapshotProvider {
  constructor(snapshot) {
    this.snapshot = snapshot;
    this.weatherRows = new Map(snapshot.weather.points.map((p, i) => [pointKey(p), snapshot.weather.data[i]]));
    this.aerosolRows = new Map((snapshot.aerosol?.points ?? []).map((p, i) => [pointKey(p), snapshot.aerosol.data[i]]));
  }
  covers(input, now) {
    const age = now - this.snapshot.weather.fetchedAt;
    if (input.model !== this.snapshot.model || age < 0 || age > SOURCE_MAX_AGE_MS) return false;
    const { event, points } = forecastSampling(input);
    if (!event) return true;
    const start = Date.parse(event.time) / 1000 - 40 * 60, end = start + 80 * 60;
    return points.every(point => {
      const row = this.weatherRows.get(gridKey(point, WEATHER_GRID_DEGREES)), times = row?.hourly?.time;
      return times && times[0] <= start && times.at(-1) >= end;
    });
  }
  async weather(points, model) {
    const data = points.map(p => this.weatherRows.get(gridKey(p, WEATHER_GRID_DEGREES)));
    if (model !== this.snapshot.model || data.some(row => !row)) {
      throw new AppError('CACHE_COVERAGE', '所选位置的光路超出已保存天气资料的覆盖范围，请使用预设地点。');
    }
    return { data, fetchedAt: this.snapshot.weather.fetchedAt, cache: 'snapshot' };
  }
  async aerosol(points) {
    const data = points.map(p => this.aerosolRows.get(gridKey(p, AEROSOL_GRID_DEGREES)));
    if (data.some(row => !row)) throw new AppError('AEROSOL_UNAVAILABLE', '本次保存的气溶胶资料待补充。');
    return { data, fetchedAt: this.snapshot.aerosol.fetchedAt, cache: 'snapshot' };
  }
}

// This store only reads and writes saved data. It has no external loader.
export class SourceSnapshots {
  constructor(directory) {
    this.disk = new DiskCache(directory, { maxEntries: 4 });
    this.providers = new Map();
  }
  async load() {
    for (const kind of ['scheduled', 'forced']) for (const model of FORECAST_MODELS) {
      const saved = await this.disk.get(`${kind}:${model}`);
      if (saved?.schemaVersion === 1 && saved.model === model && saved.kind === kind && Array.isArray(saved.weather?.points) &&
        saved.weather?.points?.length === saved.weather?.data?.length) {
        this.providers.set(`${kind}:${model}`, new SnapshotProvider(saved));
      }
    }
  }
  async save(snapshot) {
    const key = `${snapshot.kind}:${snapshot.model}`;
    await this.disk.put(key, snapshot);
    this.providers.set(key, new SnapshotProvider(snapshot));
  }
  forInput(input, now) {
    return [...this.providers.values()]
      .sort((a, b) => b.snapshot.weather.fetchedAt - a.snapshot.weather.fetchedAt)
      .find(provider => provider.covers(input, now));
  }
  hasModel(model) { return [...this.providers.values()].some(provider => provider.snapshot.model === model); }
}
