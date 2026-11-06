import { solarEvent } from '../src/astro.mjs';
import { DISTANCES } from '../src/engine.mjs';
import { LEVELS } from '../src/provider.mjs';

export const LOCATION = { lat: 31.2304, lon: 121.4737, timezone: 'Asia/Shanghai' };
export const EVENT = solarEvent('2026-11-06', 'sunset', LOCATION.lat, LOCATION.lon, LOCATION.timezone);
const HEIGHTS = [100, 750, 1500, 3100, 4200, 5500, 7200, 9200, 10400, 11800, 13600];

export function fixture({ clouds = () => 0, fanCount = 1 } = {}) {
  const times = Array.from({ length: 48 }, (_, i) => Date.parse('2026-11-05T12:00:00Z') / 1000 + i * 3600);
  return Array.from({ length: fanCount }, () => DISTANCES.map(x => {
    const hourly = { time: times };
    for (const [key, value] of Object.entries({ visibility: 50000, precipitation: 0, relative_humidity_2m: 50,
      cloud_cover_low: 0, cloud_cover_mid: 0, cloud_cover_high: 60, wind_speed_10m: 5 })) hourly[key] = times.map(() => value);
    LEVELS.forEach((p, i) => {
      hourly[`cloud_cover_${p}hPa`] = times.map(() => clouds(x, p));
      hourly[`geopotential_height_${p}hPa`] = times.map(() => HEIGHTS[i]);
    });
    return { latitude: LOCATION.lat, longitude: LOCATION.lon, elevation: 0, utc_offset_seconds: 0,
      hourly, hourly_units: Object.fromEntries(Object.keys(hourly).map(k => [k, k === 'time' ? 'unixtime' : k.startsWith('geopotential') || k === 'visibility' ? 'm' : k === 'precipitation' ? 'mm' : '%'])) };
  })).flat();
}
