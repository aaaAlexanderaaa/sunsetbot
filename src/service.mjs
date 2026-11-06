import { createHash } from 'node:crypto';
import { civilDate, validDate, addDays, destination, solarEvent, round } from './astro.mjs';
import { PRESETS } from './presets.mjs';
import { DISTANCES, computeForecast, samplingOffsets } from './engine.mjs';
import { AppError } from './errors.mjs';
import { LEVELS } from './provider.mjs';

export class ForecastService {
  constructor({ provider, archive = null, now = () => Date.now() }) {
    this.provider = provider;
    this.archive = archive;
    this.now = now;
    this.pending = new Map();
  }
  validate(params) {
    const cityId = params.get('city') ?? 'shanghai';
    let location = PRESETS.find(p => p.id === cityId);
    if (!location) throw new AppError('CITY_INVALID', '请选择支持的长三角城市。', 400);
    if (params.has('lat') || params.has('lon')) {
      const lat = Number(params.get('lat')), lon = Number(params.get('lon'));
      if (!params.get('lat')?.trim() || !params.get('lon')?.trim() || !Number.isFinite(lat) ||
        !Number.isFinite(lon) || lat < 27 || lat > 35 || lon < 116 || lon > 125) {
        throw new AppError('COORDINATES_INVALID', '长三角坐标范围为北纬 27–35°、东经 116–125°。', 400);
      }
      location = { id: 'custom', name: '自选位置', lat: round(lat, 4), lon: round(lon, 4), timezone: 'Asia/Shanghai' };
    }
    const event = params.get('event') ?? 'sunset', model = params.get('model') ?? 'gfs';
    if (!['sunrise', 'sunset'].includes(event)) throw new AppError('EVENT_INVALID', '请选择朝霞或晚霞。', 400);
    if (!['gfs', 'ecmwf'].includes(model)) throw new AppError('MODEL_INVALID', '请选择 GFS 或 ECMWF。', 400);
    const today = civilDate(this.now(), location.timezone), date = params.get('date') ?? today;
    if (!validDate(date) || date < today || date > addDays(today, 2)) {
      throw new AppError('DATE_INVALID', '请选择当地今天起三天内的有效日期。', 400);
    }
    return { location, event, model, date };
  }
  async forecast(params) {
    const input = this.validate(params), key = JSON.stringify(input);
    if (this.pending.has(key)) return this.pending.get(key);
    if (this.pending.size >= 2) throw new AppError('BUSY', '正在计算其他预报，请稍后重新获取。', 429);
    const task = this.compute(input);
    this.pending.set(key, task);
    try { return await task; } finally { this.pending.delete(key); }
  }
  async compute({ location, event: eventType, model, date }) {
    const event = solarEvent(date, eventType, location.lat, location.lon, location.timezone);
    if (!event) return { state: 'no_event', location, date, eventType, model };
    const fanOffsets = samplingOffsets(event, location);
    const points = fanOffsets.flatMap(offset => DISTANCES.map(distance => destination(location.lat, location.lon, event.azimuth + offset, distance)));
    const utcDate = event.time.slice(0, 10), startDate = addDays(utcDate, -1), endDate = addDays(utcDate, 1);
    const weather = await this.provider.weather(points, model, startDate, endDate);
    let aerosol = null, aerosolError = null;
    try { aerosol = await this.provider.aerosol(points, startDate, endDate); }
    catch (error) { aerosolError = error.code ?? 'AEROSOL_UNAVAILABLE'; }
    const forecast = computeForecast({ weather: weather.data, aerosol: aerosol?.data ?? null, event, location, fanOffsets });
    const leadTimeHours = round((Date.parse(event.time) - this.now()) / 3600000, 1);
    if (leadTimeHours > 36) forecast.uncertainty.unshift(`距离事件约 ${leadTimeHours} 小时，建议在 36 小时内再次查看最新云况。`);
    if (leadTimeHours < 0) forecast.uncertainty.unshift('所选日出日落事件已发生，结果为当前资料下的回算。');
    const identity = JSON.stringify({ location, date, eventType, model, weatherAt: weather.fetchedAt,
      aerosolAt: aerosol?.fetchedAt, version: forecast.modelVersion });
    const fetchedAt = new Date(weather.fetchedAt).toISOString();
    const stale = weather.cache === 'stale' || aerosol?.cache === 'stale';
    const result = {
      state: stale ? 'stale' : aerosolError || forecast.missingAerosol ? 'partial' : 'ready',
      id: createHash('sha256').update(identity).digest('hex').slice(0, 20),
      generatedAt: new Date(this.now()).toISOString(), location, date, eventType,
      event: { time: event.time, azimuth: round(event.azimuth, 1), altitude: round(event.altitude, 2) },
      model, weatherModel: model === 'gfs' ? 'NCEP GFS (Open-Meteo GFS)' : 'ECMWF IFS 0.25°',
      leadTimeHours,
      data: { weather: { fetchedAt, cache: weather.cache, ageMinutes: round((this.now() - weather.fetchedAt) / 60000),
        initializationTime: null, provider: 'Open-Meteo', sourceUrl: model === 'gfs' ? 'https://open-meteo.com/en/docs/gfs-api' : 'https://open-meteo.com/en/docs/ecmwf-api',
        profile: 'Pressure-level cloud-cover diagnostic and geopotential height',
        nativeTimeStepMinutes: model === 'gfs' ? 60 : 180, apiTimeStepMinutes: 60,
        gridResolutionDegrees: 0.25, precipitationMeaning: 'mm accumulated over the preceding hour',
        pointCount: points.length, pressureLevelCount: LEVELS.length, staleReason: weather.staleReason ?? null },
      aerosol: { fetchedAt: aerosol ? new Date(aerosol.fetchedAt).toISOString() : null,
        cache: aerosol?.cache ?? 'unavailable', provider: 'CAMS Global via Open-Meteo', wavelengthNm: 550,
        nativeTimeStepMinutes: 180, gridResolutionDegrees: 0.4, initializationTime: null,
        error: aerosolError, sourceUrl: 'https://open-meteo.com/en/docs/air-quality-api' } },
      ...forecast,
    };
    result.retention = { state: 'disabled' };
    if (this.archive) {
      try { result.retention = await this.archive.save({ result, weather, aerosol, points, fanOffsets }); }
      catch { result.retention = { state: 'unavailable' }; result.uncertainty.push('这次预报的本地留存写入失败，可先保存 JSON 并检查数据目录。'); }
    }
    return result;
  }
}
