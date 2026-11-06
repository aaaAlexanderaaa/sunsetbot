import test from 'node:test';
import assert from 'node:assert/strict';
import { civilDate, solarEvent, sunPosition, earthBlocks, sectionPoint, RAD, validDate } from '../src/astro.mjs';
import { computeForecast, DISTANCES, samplingOffsets, cloudDecks } from '../src/engine.mjs';
import { cloudTransmission } from '../src/cloud-optics.mjs';
import { precedingAccumulation } from '../src/provider.mjs';
import { LEVELS } from '../src/provider.mjs';

import { LOCATION, EVENT, fixture } from './fixture.mjs';

test('Shanghai event retains its civil date and matches the western sunset bearing', () => {
  assert.equal(civilDate(EVENT.time, LOCATION.timezone), '2026-11-06');
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: LOCATION.timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(EVENT.time));
  assert.ok(hour >= '16:45' && hour <= '17:10', hour);
  assert.ok(EVENT.azimuth > 245 && EVENT.azimuth < 255);
  assert.ok(Math.abs(sunPosition(EVENT.time, LOCATION.lat, LOCATION.lon).altitude + 0.833) < 0.4);
});

test('date and calendar behavior survives UTC midnight and a western timezone', () => {
  assert.equal(civilDate('2026-11-05T17:00:00Z', 'Asia/Shanghai'), '2026-11-06');
  const value = solarEvent('2026-06-21', 'sunset', 40.7128, -74.006, 'America/New_York');
  assert.equal(civilDate(value.time, 'America/New_York'), '2026-06-21');
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2024-02-29'), true);
});

test('spherical Earth shadow separates low and high clouds at the same sun angle', () => {
  const direction = [Math.cos(-2 * RAD), Math.sin(-2 * RAD)];
  assert.equal(earthBlocks(sectionPoint(0, 2), direction), true);
  assert.equal(earthBlocks(sectionPoint(0, 10), direction), false);
});

test('a cloud-free section has zero cloud colour potential', () => {
  const result = computeForecast({ weather: fixture(), event: EVENT, location: LOCATION });
  assert.equal(result.score, 0);
  assert.equal(result.window, null);
  assert.equal(result.peakTime, null);
  assert.equal(result.section.time, EVENT.time);
  assert.equal(result.section.targets.length, 0);
});

test('upstream low-cloud obstruction changes the result even with identical local high clouds', () => {
  const clear = fixture({ clouds: (x, p) => p === 300 && x < 200 ? 60 : 0 });
  const blocked = fixture({ clouds: (x, p) => p === 300 && x < 200 ? 60 : p >= 700 && x >= 25 && x <= 450 ? 100 : 0 });
  const a = computeForecast({ weather: clear, event: EVENT, location: LOCATION });
  const b = computeForecast({ weather: blocked, event: EVENT, location: LOCATION });
  assert.ok(a.score > 0, JSON.stringify(a.timeline));
  assert.ok(b.score < a.score, `${a.score} -> ${b.score}`);
  assert.ok(a.timeline.every(t => Number.isFinite(t.score) && t.score >= 0 && t.score <= 100));
  assert.equal(a.aod, null);
  assert.equal(a.sensitivity.minimum, null);
  assert.equal(a.sensitivity.maximum, null);
  assert.ok(a.uncertainty.some(t => t.includes('偏差方向与幅度待评估')));
});

test('missing required cloud data rejects a forecast rather than assigning clear sky', () => {
  const rows = fixture();
  rows[0].hourly.cloud_cover_850hPa.fill(null);
  assert.throws(() => computeForecast({ weather: rows, event: EVENT, location: LOCATION }), /垂直云层数据缺失/);
});

test('missing geopotential height has the same explicit failure as a missing cloud observation', () => {
  const rows = fixture();
  rows[4].hourly.geopotential_height_925hPa.fill(null);
  assert.throws(() => computeForecast({ weather: rows, event: EVENT, location: LOCATION }), /垂直云层数据缺失/);
});

test('high aerosol extinction reduces illuminated cloud potential', () => {
  const weather = fixture({ clouds: (x, p) => p === 300 && x < 200 ? 60 : 0 });
  const aerosol = aod => weather.map(row => ({ hourly: { time: row.hourly.time,
    aerosol_optical_depth: row.hourly.time.map(() => aod) } }));
  const clean = computeForecast({ weather, aerosol: aerosol(0), event: EVENT, location: LOCATION });
  const hazy = computeForecast({ weather, aerosol: aerosol(1), event: EVENT, location: LOCATION });
  assert.ok(hazy.score < clean.score, `${clean.score} -> ${hazy.score}`);
  assert.equal(hazy.aod, 1);
  assert.ok(hazy.sensitivity.minimum <= hazy.score && hazy.sensitivity.maximum >= hazy.score);
});

test('ten-percent opaque cloud preserves its holes over a long cloudy path', () => {
  const pieces = Array.from({ length: 20 }, () => ({ column: 0, x: 0, level: 0, fraction: 0.1, depth: 2 }));
  assert.ok(Math.abs(cloudTransmission(pieces, { overlap: 'maximum' }) - 0.9) < 1e-10);
  assert.ok(Math.abs(cloudTransmission(pieces, { overlap: 'random-columns' }) - 0.9) < 1e-10);
  const two = [...pieces, ...pieces.map(p => ({ ...p, column: 1, x: 100 }))];
  assert.ok(Math.abs(cloudTransmission(two, { overlap: 'maximum' }) - 0.9) < 1e-10);
  assert.ok(Math.abs(cloudTransmission(two, { overlap: 'random-columns' }) - 0.81) < 1e-10);
});

test('light incident on a known cloudy target traverses its cloudy optical depth', () => {
  const t = cloudTransmission([{ column: 0, x: 0, level: 0, fraction: 0.1, depth: 3 }],
    { condition: { column: 0, x: 0, lower: 0, upper: 0.1 } });
  assert.ok(Math.abs(t - Math.exp(-3)) < 1e-10);
});

test('a low-angle remote cloud base is retained and a rotating fan covers the event window', () => {
  const fanOffsets = samplingOffsets(EVENT, LOCATION);
  const weather = fixture({ fanCount: 3, clouds: (x, p) => x === 100 && p === 700 ? 80 : 0 });
  const result = computeForecast({ weather, event: EVENT, location: LOCATION, fanOffsets });
  assert.ok(result.section.targets.some(t => t.x === 100 && t.elevation >= 0.5 && t.elevation < 3));
  assert.ok(!result.uncertainty.some(t => t.includes('固定方位')));
  for (const minutes of [-40, 40]) {
    const bearing = sunPosition(Date.parse(EVENT.time) + minutes * 60000, LOCATION.lat, LOCATION.lon).azimuth;
    assert.ok(bearing - EVENT.azimuth > fanOffsets[0] && bearing - EVENT.azimuth < fanOffsets.at(-1));
  }
});

test('rain totals keep their preceding-hour interval semantics', () => {
  const row = { hourly: { time: [0, 3600, 7200], precipitation: [0, 10, 0] } };
  assert.equal(precedingAccumulation(row, 'precipitation', 1800000), 10);
  assert.equal(precedingAccumulation(row, 'precipitation', 3600000), 10);
  assert.equal(precedingAccumulation(row, 'precipitation', 3600001), 0);
});

test('emitting cloud base coincides with its nearest-level opacity band', () => {
  const decks = cloudDecks([{ height: 1.5, cover: 0 }, { height: 3.1, cover: 0.8 }, { height: 4.2, cover: 0 }]);
  assert.equal(decks[0].base, 2.3);
  assert.ok(Math.abs(decks[0].top - 3.65) < 1e-10);
});

test('a cloud on a neighbouring bearing changes the rotated forecast despite a clear central section', () => {
  const clear = fixture();
  const side = fixture({ clouds: (x, p) => x === 25 && p === 200 ? 100 : 0 });
  const fixed = computeForecast({ weather: clear, event: EVENT, location: LOCATION });
  const rotated = computeForecast({ weather: [...clear, ...clear, ...side], event: EVENT,
    location: LOCATION, fanOffsets: samplingOffsets(EVENT, LOCATION) });
  assert.equal(fixed.score, 0);
  assert.ok(rotated.score > 0);
});

test('partial lower clouds preserve the exposed upper cloud base area and its conditional probability', () => {
  const faces = cloudDecks([{ height: 1, cover: 0.2 }, { height: 3, cover: 0.8 }]);
  assert.equal(faces.length, 2);
  assert.ok(Math.abs(faces[1].cover - 0.6) < 1e-10);
  const pieces = [{ column: 0, x: 0, level: 0, fraction: 0.2, depth: 5 },
    { column: 0, x: 0, level: 1, fraction: 0.8, depth: 3 }];
  const t = cloudTransmission(pieces, { condition: { column: 0, x: 0, lower: faces[1].lower, upper: faces[1].upper } });
  assert.ok(Math.abs(t - Math.exp(-3)) < 1e-10);
});

test('a remote fifty-percent blocker retains its probability when a twenty-percent target is present', () => {
  const pieces = [{ column: 1, x: 500, level: 0, fraction: 0.5, depth: 40 }];
  const options = { condition: { column: 0, x: 0, lower: 0, upper: 0.2 }, correlationLengthKm: 50 };
  const t = cloudTransmission(pieces, options);
  assert.ok(Math.abs(t - 0.5 * (1 - Math.exp(-10))) < 1e-10);
  assert.ok(cloudTransmission(pieces, { ...options, overlap: 'maximum' }) < 1e-10);
  assert.ok(Math.abs(cloudTransmission(pieces, { ...options, overlap: 'random-columns' }) - 0.5) < 1e-10);
});

test('different occurrence thresholds inside one cell retain their exact joint transmission', () => {
  const pieces = [{ column: 0, x: 0, level: 0, fraction: 0.2, depth: 1 },
    { column: 0, x: 0, level: 0, fraction: 0.8, depth: 1 }];
  assert.ok(Math.abs(cloudTransmission(pieces) - (0.2 * Math.exp(-2) + 0.6 * Math.exp(-1) + 0.2)) < 1e-10);
  assert.throws(() => cloudTransmission([{ ...pieces[0], fraction: -0.1 }]), /fractions/);
});

test('viewing extinction includes the complete path up to a nearby overhead cloud base', () => {
  const weather = fixture({ clouds: (x, p) => x === 0 && p === 300 ? 60 : 0 });
  const result = computeForecast({ weather, event: EVENT, location: LOCATION });
  const target = result.section.targets.find(t => t.x === 0 && t.viewingPathKm !== null);
  assert.ok(target);
  const expected = 0.012 * 8 * (1 - Math.exp(-target.baseKm / 8));
  assert.ok(Math.abs(target.viewingRayleighDepth550 - expected) < 0.0001);
  assert.ok(Math.abs(target.viewingPathKm - target.baseKm) < 0.0001);
});
