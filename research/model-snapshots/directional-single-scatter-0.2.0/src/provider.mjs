import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError } from './errors.mjs';

// Common actual pressure levels supported by both selected Open-Meteo models.
export const LEVELS = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150];
export const WEATHER_FIELDS = [
  'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high', 'visibility',
  'precipitation', 'relative_humidity_2m', 'wind_speed_10m',
  ...LEVELS.flatMap(p => [`cloud_cover_${p}hPa`, `geopotential_height_${p}hPa`]),
];

export class WeatherProvider {
  constructor({ cache, directory, now = () => Date.now(), fetcher = fetch,
    timeout = 20000, dailyBudget = 1500, apiKey = '' }) {
    Object.assign(this, { cache, directory, now, fetcher, timeout, dailyBudget, apiKey });
    this.queue = Promise.resolve();
    this.blockedUntil = 0;
    this.requests = 0;
    this.units = 0;
  }
  async budget(units) {
    const day = new Date(this.now()).toISOString().slice(0, 10);
    const file = join(this.directory, 'weather-budget.json');
    let value;
    try { value = JSON.parse(await readFile(file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new AppError('BUDGET_STATE_INVALID', '天气额度记录需要检查，请查看服务日志。');
    }
    if (value !== undefined && (value === null || typeof value !== 'object' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.day) || !Number.isInteger(value.units) || value.units < 0 ||
      (value.blockedUntil !== undefined && !Number.isFinite(value.blockedUntil)))) {
      throw new AppError('BUDGET_STATE_INVALID', '天气额度记录需要检查，请查看服务日志。');
    }
    if (value?.blockedUntil > this.now()) {
      this.blockedUntil = value.blockedUntil;
      throw new AppError('UPSTREAM_COOLDOWN', '天气服务正在冷却，请稍后重试。', 503, { retryAt: new Date(this.blockedUntil).toISOString() });
    }
    if (!value || value.day !== day) value = { day, units: 0 };
    if (value.units + units > this.dailyBudget) {
      throw new AppError('DAILY_BUDGET', '今日天气请求预算已用完，缓存预报仍可查看；预算于 UTC 零点恢复。', 503);
    }
    value.units += units;
    await mkdir(this.directory, { recursive: true });
    await writeFile(file + '.tmp', JSON.stringify(value), { mode: 0o600 });
    await rename(file + '.tmp', file);
    this.units += units;
  }
  request(url, units) {
    const operation = this.queue.then(async () => {
      if (this.now() < this.blockedUntil) {
        throw new AppError('UPSTREAM_COOLDOWN', '天气服务正在冷却，请稍后重试。', 503, { retryAt: new Date(this.blockedUntil).toISOString() });
      }
      await this.budget(units);
      this.requests++;
      let response;
      try { response = await this.fetcher(url, { signal: AbortSignal.timeout(this.timeout), redirect: 'error' }); }
      catch { throw new AppError('UPSTREAM_UNAVAILABLE', '天气数据暂时连接失败，请稍后重新获取。'); }
      if (response.status === 429) {
        const header = response.headers.get('retry-after');
        const delay = header === null ? 300000 : Number.isFinite(Number(header)) ? Number(header) * 1000 : Date.parse(header) - this.now();
        this.blockedUntil = this.now() + Math.max(60000, Math.min(3600000, Number.isFinite(delay) ? delay : 300000));
        const file = join(this.directory, 'weather-budget.json');
        const ledger = JSON.parse(await readFile(file, 'utf8'));
        ledger.blockedUntil = this.blockedUntil;
        await writeFile(file + '.tmp', JSON.stringify(ledger), { mode: 0o600 });
        await rename(file + '.tmp', file);
        throw new AppError('UPSTREAM_RATE_LIMIT', '天气数据额度暂时受限，请在冷却时间后重新获取。', 503, { retryAt: new Date(this.blockedUntil).toISOString() });
      }
      if (!response.ok) {
        throw new AppError('UPSTREAM_HTTP', `天气服务返回 ${response.status}，请稍后重新获取。`, 503);
      }
      let body;
      try { body = await response.text(); }
      catch { throw new AppError('UPSTREAM_UNAVAILABLE', '天气数据读取超时或中断，请稍后重新获取。'); }
      if (body.length > 12 * 1024 * 1024) throw new AppError('UPSTREAM_SIZE', '天气响应超出容量限制。');
      try { return JSON.parse(body); }
      catch { throw new AppError('UPSTREAM_FORMAT', '天气服务返回了无法解析的数据，请稍后重新获取。'); }
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  async weather(points, model, startDate, endDate, { historical = false, startHour, endHour } = {}) {
    const host = historical ? 'historical-forecast-api' : this.apiKey ? 'customer-api' : 'api';
    const endpoint = historical ? 'forecast' : model === 'gfs' ? 'gfs' : 'ecmwf';
    const url = new URL(`https://${host}.open-meteo.com/v1/${endpoint}`);
    const parameters = {
      latitude: points.map(p => p.lat).join(','), longitude: points.map(p => p.lon).join(','),
      hourly: WEATHER_FIELDS.join(','), timezone: 'GMT', timeformat: 'unixtime',
      ...(historical && startHour && endHour ? { start_hour: startHour, end_hour: endHour } : { start_date: startDate, end_date: endDate }),
      cell_selection: 'nearest',
      ...(historical ? { models: model === 'gfs' ? 'gfs_global' : 'ecmwf_ifs025' } : model === 'ecmwf' ? { models: 'ecmwf_ifs025' } : {}),
    };
    for (const [k, v] of Object.entries(parameters)) url.searchParams.set(k, v);
    const key = url.toString();
    // Research history requests use the documented public archive origin.
    if (this.apiKey && !historical) url.searchParams.set('apikey', this.apiKey);
    return this.cache.load(key, async () => {
      const data = await this.request(url, points.length * Math.ceil(WEATHER_FIELDS.length / 10));
      const rows = Array.isArray(data) ? data : [data];
      if (rows.length !== points.length) throw new AppError('UPSTREAM_LOCATION_COUNT', '天气数据中的采样点数量发生变化，请重新获取。');
      rows.forEach((row, index) => this.validate(row, points[index]));
      return rows;
    }, historical ? { ttl: 365 * 86400000, staleFor: 365 * 86400000 } : undefined);
  }
  validate(row, point) {
    const h = row.hourly, units = row.hourly_units;
    if (!h || !Array.isArray(h.time) || h.time.length < 2 || units?.time !== 'unixtime' || row.utc_offset_seconds !== 0) {
      throw new AppError('UPSTREAM_TIME', '天气数据时间格式与约定有差异，请检查供应商接口。');
    }
    if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude) ||
      Math.abs(row.latitude - point.lat) > 0.6 || Math.abs(row.longitude - point.lon) > 0.6) {
      throw new AppError('UPSTREAM_LOCATION', '天气数据位置偏离请求采样点。');
    }
    if (h.time.some((v, i) => !Number.isFinite(v) || (i && v <= h.time[i - 1]))) {
      throw new AppError('UPSTREAM_TIME', '天气数据时间序列需要检查。');
    }
    for (const p of LEVELS) {
      for (const field of [`cloud_cover_${p}hPa`, `geopotential_height_${p}hPa`]) {
        const expected = field.startsWith('cloud') ? '%' : 'm';
        if (!Array.isArray(h[field]) || h[field].length !== h.time.length || units[field] !== expected) {
          throw new AppError('UPSTREAM_PROFILE', '天气服务缺少计算所需的垂直云层数据。');
        }
      }
    }
    for (const [field, expected] of [['precipitation', 'mm'], ['visibility', 'm']]) {
      const values = h[field];
      if (values?.some(Number.isFinite) && (values.length !== h.time.length || units[field] !== expected || values.some(v => v !== null && (!Number.isFinite(v) || v < 0)))) {
        throw new AppError('UPSTREAM_UNITS', '降水或能见度资料的单位与取值需要检查。');
      }
    }
  }
  async aerosol(points, startDate, endDate) {
    const url = new URL(`https://${this.apiKey ? 'customer-air-quality-api' : 'air-quality-api'}.open-meteo.com/v1/air-quality`);
    for (const [k, v] of Object.entries({
      latitude: points.map(p => p.lat).join(','), longitude: points.map(p => p.lon).join(','),
      hourly: 'aerosol_optical_depth', domains: 'cams_global', timezone: 'GMT', timeformat: 'unixtime',
      start_date: startDate, end_date: endDate,
    })) url.searchParams.set(k, v);
    const key = url.toString();
    if (this.apiKey) url.searchParams.set('apikey', this.apiKey);
    return this.cache.load(key, async () => {
      const data = await this.request(url, points.length);
      const rows = Array.isArray(data) ? data : [data];
      if (rows.length !== points.length || rows.some((row, i) =>
        row.hourly_units?.time !== 'unixtime' || row.utc_offset_seconds !== 0 ||
        !['', 'dimensionless'].includes(row.hourly_units?.aerosol_optical_depth) ||
        !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude) ||
        Math.abs(row.latitude - points[i].lat) > 0.6 || Math.abs(row.longitude - points[i].lon) > 0.6 ||
        !Array.isArray(row.hourly?.time) || row.hourly.time.length < 2 ||
        row.hourly.time.some((v, j, t) => !Number.isFinite(v) || (j && v <= t[j - 1])) ||
        !Array.isArray(row.hourly?.aerosol_optical_depth) ||
        row.hourly.aerosol_optical_depth.length !== row.hourly.time.length ||
        row.hourly.aerosol_optical_depth.some(v => v !== null && (!Number.isFinite(v) || v < 0)))) {
        throw new AppError('UPSTREAM_AEROSOL', '气溶胶数据暂时缺失。');
      }
      return rows;
    }, { ttl: 3 * 3600000, staleFor: 8 * 3600000 });
  }
}

export function interpolate(row, field, instant) {
  const h = row?.hourly, values = h?.[field], times = h?.time;
  if (!values || !times) return null;
  const time = +new Date(instant) / 1000;
  let index = Math.floor((time - times[0]) / 3600);
  index = Math.max(0, Math.min(times.length - 2, index));
  while (index > 0 && times[index] > time) index--;
  while (index < times.length - 2 && times[index + 1] < time) index++;
  const a = values[index], b = values[index + 1];
  if (time < times[index] || time > times[index + 1] || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  const weight = (time - times[index]) / (times[index + 1] - times[index]);
  return a + (b - a) * weight;
}

// Open-Meteo precipitation is an accumulation over the hour ending at the
// timestamp. Interior instants use that interval's total, rather than a blend
// between totals belonging to different hours.
export function precedingAccumulation(row, field, instant) {
  const times = row?.hourly?.time, values = row?.hourly?.[field], seconds = +new Date(instant) / 1000;
  if (!times || !values || seconds <= times[0] - 3600 || seconds > times.at(-1)) return null;
  const index = times.findIndex(t => t >= seconds);
  const value = values[index];
  return Number.isFinite(value) && value >= 0 ? value : null;
}
