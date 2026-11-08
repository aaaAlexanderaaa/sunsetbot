import SunCalc from 'suncalc';

export const EARTH_KM = 6371;
export const RAD = Math.PI / 180;
export const clamp = (x, min = 0, max = 1) => Math.max(min, Math.min(max, x));
export const round = (x, digits = 2) => Number(x.toFixed(digits));

export function civilDate(instant, zone = 'Asia/Shanghai') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(instant));
  const value = type => parts.find(p => p.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function addDays(date, days) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

export function validDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(`${date}T12:00:00Z`)) && addDays(date, 0) === date;
}

export function sunPosition(instant, lat, lon) {
  const p = SunCalc.getPosition(new Date(instant), lat, lon);
  return { altitude: p.altitude / RAD, azimuth: (p.azimuth / RAD + 180 + 360) % 360 };
}

export function solarEvent(date, event, lat, lon, zone) {
  for (const day of [-1, 0, 1]) {
    const times = SunCalc.getTimes(new Date(`${addDays(date, day)}T12:00:00Z`), lat, lon);
    const value = times[event];
    if (Number.isFinite(+value) && civilDate(value, zone) === date) {
      return { time: value.toISOString(), ...sunPosition(value, lat, lon) };
    }
  }
  return null;
}

export function destination(lat, lon, bearing, km) {
  const phi = lat * RAD, lambda = lon * RAD, theta = bearing * RAD, d = km / EARTH_KM;
  const p = Math.asin(Math.sin(phi) * Math.cos(d) + Math.cos(phi) * Math.sin(d) * Math.cos(theta));
  const l = lambda + Math.atan2(Math.sin(theta) * Math.sin(d) * Math.cos(phi), Math.cos(d) - Math.sin(phi) * Math.sin(p));
  return { lat: round(p / RAD, 4), lon: round(((l / RAD + 540) % 360) - 180, 4) };
}

export function sectionPoint(x, height) {
  const a = x / EARTH_KM, r = EARTH_KM + height;
  return [r * Math.sin(a), r * Math.cos(a)];
}

export function rayPoint(point, direction, distance) {
  const x = point[0] + direction[0] * distance, y = point[1] + direction[1] * distance;
  return { x: Math.atan2(x, y) * EARTH_KM, height: Math.hypot(x, y) - EARTH_KM };
}

export function earthBlocks(point, direction) {
  const t = -(point[0] * direction[0] + point[1] * direction[1]);
  return t > 0 && Math.hypot(point[0] + t * direction[0], point[1] + t * direction[1]) < EARTH_KM;
}

export function viewElevation(x, height, observerHeight = 0) {
  const p = sectionPoint(x, height);
  return Math.atan2(p[1] - EARTH_KM - observerHeight, Math.abs(p[0])) / RAD;
}
