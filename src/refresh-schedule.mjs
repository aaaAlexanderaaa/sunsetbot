import { civilDate, addDays, solarEvent } from './astro.mjs';

export const REFRESH_TIMEZONE = 'Asia/Shanghai';
export const REFRESH_HOURS = [8, 16];

// Shanghai's modern civil offset is UTC+08:00; process/device zones have no role.
const slot = (date, hour) => Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00+08:00`);

export function refreshSchedule(instant) {
  const now = +new Date(instant), today = civilDate(now, REFRESH_TIMEZONE);
  const slots = [-1, 0, 1].flatMap(day => REFRESH_HOURS.map(hour => slot(addDays(today, day), hour)));
  return {
    timezone: REFRESH_TIMEZONE, hours: REFRESH_HOURS,
    latestSlot: new Date(slots.filter(time => time <= now).at(-1)).toISOString(),
    nextUpdateAt: new Date(slots.find(time => time > now)).toISOString(),
  };
}

export function upcomingEvents(location, instant, count) {
  const now = +new Date(instant), today = civilDate(now, location.timezone), events = [];
  for (const type of ['sunrise', 'sunset']) {
    let found = 0;
    for (let day = 0; day <= count + 1 && found < count; day++) {
      const date = addDays(today, day), event = solarEvent(date, type, location.lat, location.lon, location.timezone);
      if (event && Date.parse(event.time) > now) {
        events.push({ location, event: type, date });
        found++;
      }
    }
  }
  return events;
}
