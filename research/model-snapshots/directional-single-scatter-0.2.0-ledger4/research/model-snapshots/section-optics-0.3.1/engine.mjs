import { EARTH_KM, RAD, clamp, round, sectionPoint, rayPoint, earthBlocks, viewElevation, sunPosition } from './astro.mjs';
import { LEVELS, interpolate, precedingAccumulation } from './provider.mjs';
import { cloudTransmission } from './cloud-optics.mjs';
import { AppError } from './errors.mjs';

export const MODEL_VERSION = 'section-optics-0.3.1';
export const DISTANCES = [-150, -100, -50, -25, 0, 25, 50, 100, 150, 200, 300, 450, 600, 800];
export const ASSUMPTIONS = {
  earthRadiusKm: EARTH_KM, molecularScaleHeightKm: 8, molecularExtinction550PerKm: 0.012,
  aerosolScaleHeightsKm: [0.8, 1.5, 3], aerosolAngstromExponent: 1.2,
  conditionalCloudExtinctionPerKm: { low: 2, mid: 0.7, high: 0.2 },
  cloudOverlap: ['decorrelated', 'maximum', 'random-columns'], cloudHorizontalCorrelationLengthKm: 50,
  profileCloudThreshold: 0.15,
  minimumViewElevationDegrees: 0.5, maximumTargetDistanceKm: 300,
  solarRayStepKm: 4, viewingRayStepKm: 0.5, timelineStepMinutes: 5,
  qualityScale: 'independent heuristic 0–100', calibration: 'experimental',
};

const angleDifference = (a, b) => ((a - b + 540) % 360) - 180;
export function samplingOffsets(event, location) {
  const offsets = [-40, 40].map(m => Math.abs(angleDifference(
    sunPosition(Date.parse(event.time) + m * 60000, location.lat, location.lon).azimuth, event.azimuth)));
  const width = Math.ceil(Math.max(...offsets)) + 2;
  return [-width, 0, width];
}

function profile(row, time) {
  const levels = LEVELS.map(pressure => ({ pressure,
    height: interpolate(row, `geopotential_height_${pressure}hPa`, time),
    cover: interpolate(row, `cloud_cover_${pressure}hPa`, time),
  }));
  if (levels.some(p => p.cover === null || p.height === null || p.height < -1000 || p.cover < 0 || p.cover > 100)) {
    throw new AppError('PROFILE_INCOMPLETE', '预报时段的垂直云层数据缺失，请选择其他时段或模型。');
  }
  levels.forEach(p => { p.cover /= 100; p.height /= 1000; });
  levels.sort((a, b) => a.height - b.height);
  if (levels.some((p, i) => i && p.height <= levels[i - 1].height)) {
    throw new AppError('PROFILE_HEIGHT', '云层高度序列需要检查，请选择其他模型。');
  }
  return levels;
}

export function cloudDecks(levels, ground = 0) {
  const decks = [];
  let below = 0;
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    if (level.height < ground) continue;
    const lower = below;
    below = Math.max(below, level.cover);
    if (level.cover < ASSUMPTIONS.profileCloudThreshold || level.cover <= lower) continue;
    const previous = levels[i - 1], next = levels[i + 1];
    // A base face occupies the new fraction beyond all lower cloudy bands.
    // Conditioning uses this exact U interval, preserving every original f.
    const base = Math.max(ground + 0.05, previous ?
      (previous.height + level.height) / 2 : level.height - 0.3);
    const top = next ? (level.height + next.height) / 2 : level.height + 0.5;
    if (top > base) decks.push({ base, top, cover: level.cover - lower, lower, upper: level.cover });
  }
  return decks;
}

function pair(values, value, key) {
  let i = 0;
  while (i < values.length - 2 && value > key(values[i + 1])) i++;
  const a = values[i], b = values[i + 1];
  return { a, b, index: i, w: clamp((value - key(a)) / (key(b) - key(a))) };
}

function prepareColumns(weather, aerosol, time, offset, fanOffsets) {
  const single = fanOffsets.length === 1;
  const angular = single ? { index: 0, w: 0 } : pair(fanOffsets, offset, v => v);
  const first = angular.index * DISTANCES.length;
  const second = single ? first : first + DISTANCES.length;
  const blendOptional = (a, b) => a === null || b === null ? null : a * (1 - angular.w) + b * angular.w;
  return DISTANCES.map((x, index) => {
    const a = weather[first + index], b = weather[second + index];
    const al = profile(a, time), bl = single ? al : profile(b, time);
    const levels = al.map((p, j) => ({ pressure: p.pressure,
      height: p.height * (1 - angular.w) + bl[j].height * angular.w,
      cover: p.cover * (1 - angular.w) + bl[j].cover * angular.w }));
    return { x, index, levels,
      ground: Math.max(0, (Number(a.elevation) || 0) * (1 - angular.w) + (Number(b.elevation) || 0) * angular.w) / 1000,
      aod: aerosol ? blendOptional(interpolate(aerosol[first + index], 'aerosol_optical_depth', time),
        interpolate(aerosol[second + index], 'aerosol_optical_depth', time)) : null };
  });
}

function atmosphere(columns, x, height, aerosolHeight) {
  // Repeated integration steps share an occurrence variate per horizontal
  // column/vertical-level cell, and accumulate conditional cloudy depth.
  const { a, b, w } = pair(columns, x, c => c.x), column = w <= 0.5 ? a : b;
  const levels = column.levels;
  let level = 0;
  while (level < levels.length - 1 && height > (levels[level].height + levels[level + 1].height) / 2) level++;
  const within = height >= Math.max(column.ground, levels[0].height - 0.3) && height <= levels.at(-1).height + 0.5;
  const fraction = within ? levels[level].cover : 0;
  const coefficient = ASSUMPTIONS.conditionalCloudExtinctionPerKm[height < 3 ? 'low' : height < 8 ? 'mid' : 'high'];
  const aod = a.aod === null || b.aod === null ? null : a.aod * (1 - w) + b.aod * w;
  return { column: column.index, level, fraction, coefficient,
    rayleigh: ASSUMPTIONS.molecularExtinction550PerKm * Math.exp(-Math.max(0, height) / ASSUMPTIONS.molecularScaleHeightKm),
    aerosol: aod === null ? 0 : aod / aerosolHeight * Math.exp(-Math.max(0, height) / aerosolHeight),
    terrain: a.ground * (1 - w) + b.ground * w, missingAerosol: aod === null };
}

function opticalDepth(columns, origin, direction, maxDistance, aerosolHeight, step) {
  const depth = { pieces: [], rayleigh: 0, aerosol: 0, bounded: true, blocked: false, missingAerosol: false };
  for (let start = 0; start < maxDistance; start += step) {
    const ds = Math.min(step, maxDistance - start), p = rayPoint(origin, direction, start + ds / 2);
    if (p.height > 65) break;
    if (p.height < 0) { depth.blocked = true; break; }
    const v = atmosphere(columns, p.x, p.height, aerosolHeight);
    if ((p.x < columns[0].x || p.x > columns.at(-1).x) && p.height < 15) depth.bounded = false;
    if (p.height < v.terrain) { depth.blocked = true; break; }
    if (v.fraction > 0) depth.pieces.push({ column: v.column, x: columns[v.column].x, level: v.level, fraction: v.fraction, depth: v.coefficient * ds });
    depth.rayleigh += v.rayleigh * ds;
    depth.aerosol += v.aerosol * ds;
    depth.missingAerosol ||= v.missingAerosol;
  }
  return depth;
}

function targetLight(columns, target, altitude, observerHeight, aerosolHeight, overlap) {
  const origin = sectionPoint(target.x, target.base), direction = [Math.cos(altitude * RAD), Math.sin(altitude * RAD)];
  const dark = { strength: 0, rgb: [0, 0, 0], bounded: true, missingAerosol: false, reason: 'earth-shadow' };
  if (earthBlocks(origin, direction)) return dark;
  const solar = opticalDepth(columns, origin, direction, 1600, aerosolHeight, ASSUMPTIONS.solarRayStepKm);
  const observer = sectionPoint(0, observerHeight), delta = [origin[0] - observer[0], origin[1] - observer[1]];
  const distance = Math.hypot(...delta);
  const viewing = opticalDepth(columns, observer, delta.map(v => v / distance), distance,
    aerosolHeight, ASSUMPTIONS.viewingRayStepKm);
  if (solar.blocked || viewing.blocked) return { ...dark, reason: 'terrain-obstruction' };
  const condition = { column: target.index, x: target.x, lower: target.lower, upper: target.upper };
  const cloud = cloudTransmission([...solar.pieces, ...viewing.pieces], { overlap, condition,
    correlationLengthKm: ASSUMPTIONS.cloudHorizontalCorrelationLengthKm });
  const rgb = [680, 550, 440].map(wavelength => cloud * Math.exp(
    -(solar.rayleigh + viewing.rayleigh) * (550 / wavelength) ** 4 -
    (solar.aerosol + viewing.aerosol) * (550 / wavelength) ** ASSUMPTIONS.aerosolAngstromExponent));
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const warmth = clamp((rgb[0] - rgb[2]) / Math.max(rgb[0], 0.00001));
  return { strength: clamp(Math.sqrt(luminance) * warmth * 2.5) * target.cover, rgb,
    bounded: solar.bounded && viewing.bounded, missingAerosol: solar.missingAerosol || viewing.missingAerosol,
    viewingPathKm: round(distance, 4), viewingRayleighDepth550: round(viewing.rayleigh, 6),
    reason: cloud < 0.05 ? 'cloud-obstruction' : 'illuminated' };
}

function frame(weather, aerosol, time, location, event, fanOffsets, aerosolHeight = 1.5, overlap = 'decorrelated') {
  const sun = sunPosition(time, location.lat, location.lon);
  const offset = angleDifference(sun.azimuth, event.azimuth);
  const columns = prepareColumns(weather, aerosol, time, offset, fanOffsets);
  const local = columns.find(c => c.x === 0), targets = [];
  for (let i = 0; i < columns.length; i++) {
    const column = columns[i];
    if (Math.abs(column.x) > ASSUMPTIONS.maximumTargetDistanceKm) continue;
    const width = ((columns[i + 1]?.x ?? column.x + 25) - (columns[i - 1]?.x ?? column.x - 25)) / 2;
    for (const deck of cloudDecks(column.levels, column.ground)) {
      const elevation = viewElevation(column.x, deck.base, local.ground);
      if (elevation < ASSUMPTIONS.minimumViewElevationDegrees) continue;
      const light = targetLight(columns, { ...deck, x: column.x, index: column.index }, sun.altitude, local.ground, aerosolHeight, overlap);
      const weight = Math.min(1, width * Math.max(0.2, deck.base - local.ground) /
        (column.x ** 2 + (deck.base - local.ground) ** 2)) / Math.PI;
      targets.push({ x: column.x, baseKm: round(deck.base), topKm: round(deck.top), elevation: round(elevation),
        cover: round(deck.cover), strength: round(light.strength, 4), weight, rgb: light.rgb,
        reason: light.reason, bounded: light.bounded, missingAerosol: light.missingAerosol,
        viewingPathKm: light.viewingPathKm ?? null, viewingRayleighDepth550: light.viewingRayleighDepth550 ?? null });
    }
  }
  const integral = targets.reduce((sum, t) => sum + t.strength * t.weight, 0);
  const localRow = weather[Math.floor(fanOffsets.length / 2) * DISTANCES.length + DISTANCES.indexOf(0)];
  const rain = precedingAccumulation(localRow, 'precipitation', time), visibility = interpolate(localRow, 'visibility', time);
  const localFactor = Math.exp(-Math.max(0, rain ?? 0) * 0.15) * (visibility === null ? 1 : clamp(visibility / 12000, 0.2, 1));
  const score = 100 * (1 - Math.exp(-integral * 5)) * localFactor;
  const directional = sign => 100 * (1 - Math.exp(-targets.filter(t => t.x * sign >= 0)
    .reduce((sum, t) => sum + t.strength * t.weight * (t.x === 0 ? 0.5 : 1), 0) * 5)) * localFactor;
  return { time: new Date(time).toISOString(), score: round(score, 1), solarAltitude: round(sun.altitude), bearing: sun.azimuth,
    towardSun: round(directional(1), 1), oppositeSun: round(directional(-1), 1), targets, columns,
    aod: local.aod, rain, visibility, bearingClipped: fanOffsets.length === 1 || offset < fanOffsets[0] || offset > fanOffsets.at(-1) };
}

export function computeForecast({ weather, aerosol = null, event, location, fanOffsets = [0] }) {
  if (weather.length !== DISTANCES.length * fanOffsets.length || (aerosol && aerosol.length !== weather.length)) {
    throw new AppError('SECTION_INCOMPLETE', '大气截面采样点缺失，请重新获取。');
  }
  const instant = Date.parse(event.time), timeline = [];
  const at = (time, height = 1.5, overlap = 'decorrelated') => frame(weather, aerosol, time, location, event, fanOffsets, height, overlap);
  for (let minutes = -40; minutes <= 40; minutes += ASSUMPTIONS.timelineStepMinutes) timeline.push(at(instant + minutes * 60000));
  const maximum = timeline.reduce((a, b) => a.score >= b.score ? a : b);
  const hasPeak = maximum.score > 0, peak = hasPeak ? maximum : timeline[Math.floor(timeline.length / 2)];
  const peakIndex = timeline.indexOf(peak), missingAerosol = timeline.some(f => f.columns.some(c => c.aod === null) || f.targets.some(t => t.missingAerosol));
  const sensitivity = missingAerosol ? [] : [0.8, 3].map(h => at(Date.parse(peak.time), h).score);
  const overlapScores = ['maximum', 'random-columns'].map(overlap => at(Date.parse(peak.time), 1.5, overlap).score);
  const threshold = Math.max(8, maximum.score * 0.6);
  let left = peakIndex, right = peakIndex;
  while (left > 0 && timeline[left - 1].score >= threshold) left--;
  while (right < timeline.length - 1 && timeline[right + 1].score >= threshold) right++;
  const range = maximum.score >= 8 ? { start: timeline[left].time, end: timeline[right].time,
    resolutionMinutes: 5, clipped: left === 0 || right === timeline.length - 1 } : null;
  const score = round(maximum.score), labels = score >= 65 ? ['较强观赏潜力', '模型显示较多受光云底，临近时结合云图观察'] : score >= 40 ?
    ['中等观赏潜力', '模型显示部分受光云底，可留意天空变化'] : score >= 15 ? ['局部霞光潜力', '以临近云况为准'] : ['霞光条件偏弱', '留意临近日出日落的变化'];
  const uncertainty = [
    '云量代表出现面积，云内消光系数、云底重建及云层重叠方式采用情景假设；云水与冰含量仍待补充。',
    '三方位插值形成随太阳转动的二维截面，细小云洞、云顶侧面受光与建筑遮挡需现场判断。',
    '5 分钟曲线是天气场上的推算；GFS 原始资料约 1 小时、ECMWF 与 CAMS 约 3 小时，窗口精度受这些资料约束。',
    '指数正在积累实测校准，当前表示模型观赏潜力。',
  ];
  if (missingAerosol) uncertainty.unshift('部分光路缺少 CAMS 气溶胶资料，缺失处按 AOD=0 计算，偏差方向与幅度待评估。');
  if (peak.visibility === null) uncertainty.unshift('当前模式缺少能见度资料，视程修正系数暂取 1，雾与近地视程请结合现场判断。');
  if (peak.rain === null) uncertainty.unshift('降水资料缺失，降水修正系数暂取 1。');
  if (timeline.some(f => f.targets.some(t => !t.bounded))) uncertainty.unshift('部分低空光路超出采样边界，存在截面外遮挡风险。');
  if (timeline.some(f => f.bearingClipped)) uncertainty.unshift('本次输入采用固定方位或超出扇面，太阳方位变化的空间信息受限。');
  const illuminated = peak.targets.filter(t => t.strength > 0.05);
  const minSensitivity = missingAerosol ? null : round(Math.min(peak.score, ...sensitivity));
  const maxSensitivity = missingAerosol ? null : round(Math.max(peak.score, ...sensitivity));
  const reasons = [
    illuminated.length ? `参考时刻有 ${illuminated.length} 处采样云底具备可见受光条件。` : '采样云层的可见受光面积偏少。',
    peak.aod === null ? '本地气溶胶分布待补充。' : `本地 AOD550 为 ${round(peak.aod)}，已按垂直分布假设纳入光路积分。`,
    missingAerosol ? '气溶胶高度假设敏感性待资料齐备后评估。' : `参考时刻的气溶胶高度假设带来约 ${round(maxSensitivity - minSensitivity)} 分的变化。`,
    `参考时刻的云层重叠情景给出 ${round(Math.min(peak.score, ...overlapScores))}–${round(Math.max(peak.score, ...overlapScores))} 分。`,
  ];
  return {
    modelVersion: MODEL_VERSION, calibration: 'experimental', score, label: labels[0], advice: labels[1],
    pathCoverage: timeline.some(f => f.targets.some(t => !t.bounded)) ? 'extrapolated' : 'within-sampling',
    peakTime: hasPeak ? peak.time : null, window: range, towardSun: peak.towardSun, oppositeSun: peak.oppositeSun,
    sensitivity: { minimum: minSensitivity, maximum: maxSensitivity, meaning: '参考时刻的气溶胶高度假设范围，条件为气溶胶资料齐备' },
    cloudOverlapSensitivity: { minimum: round(Math.min(peak.score, ...overlapScores)), maximum: round(Math.max(peak.score, ...overlapScores)),
      meaning: '参考时刻水平相关衰减、完全相关与独立水平云柱情景范围' },
    aod: peak.aod === null ? null : round(peak.aod, 3), visibilityKm: peak.visibility === null ? null : round(peak.visibility / 1000),
    precipitationMm: peak.rain === null ? null : round(peak.rain), missingAerosol, reasons, uncertainty,
    timeline: timeline.map(({ time, score, solarAltitude, towardSun, oppositeSun }) => ({ time, score, solarAltitude, towardSun, oppositeSun })),
    section: { time: peak.time, bearing: round(peak.bearing), fanOffsetsDegrees: fanOffsets, distancesKm: DISTANCES,
      rays: peak.targets.filter(t => t.strength > 0.05).sort((a, b) => b.strength - a.strength).slice(0, 4).map(t => {
        const origin = sectionPoint(t.x, t.baseKm), altitude = peak.solarAltitude * RAD;
        return Array.from({ length: 49 }, (_, i) => rayPoint(origin, [Math.cos(altitude), Math.sin(altitude)], i * 25))
          .map(p => ({ distanceKm: round(p.x), heightKm: round(p.height) }));
      }),
      columns: peak.columns.map(c => ({ distanceKm: c.x, terrainKm: c.ground,
        aod: c.aod === null ? null : round(c.aod, 3), levels: c.levels.map(l => ({ pressureHpa: l.pressure, heightKm: round(l.height), cloudCover: round(l.cover * 100, 1) })) })),
      targets: peak.targets.map(({ weight, rgb, ...t }) => ({ ...t, color: '#' + rgb.map(c => Math.round(clamp(c / Math.max(...rgb, 0.001)) ** (1 / 2.2) * 255).toString(16).padStart(2, '0')).join('') })) },
    assumptions: ASSUMPTIONS,
  };
}
