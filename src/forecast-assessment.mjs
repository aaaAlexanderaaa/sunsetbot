import { DISTANCES } from './engine.mjs';
import { interpolate } from './provider.mjs';

// Layer aggregates and sparse pressure samples measure different cloud support.
// Preserve both; an aggregate supplies no cloud height or optical depth.
export function cloudInputDiagnostics(result, weather, fanOffsets) {
  const time = result.section.time;
  const local = result.section.columns.find(c => c.distanceKm === 0);
  const row = weather?.[Math.floor(fanOffsets.length / 2) * DISTANCES.length + DISTANCES.indexOf(0)];
  if (!local || !row) return null;
  const bands = { low: [0, 3], mid: [3, 8], high: [8, Infinity] };
  const layers = Object.fromEntries(Object.entries(bands).map(([name, [low, high]]) => {
    const levels = local.levels.filter(p => p.heightKm >= Math.max(local.terrainKm, low) && p.heightKm < high);
    const aggregate = interpolate(row, `cloud_cover_${name}`, Date.parse(time));
    const fractions = levels.map(p => interpolate(row, `cloud_cover_${p.pressureHpa}hPa`, Date.parse(time)));
    return [name, { layerCoverPercent: aggregate,
      maximumSampledPressureCoverPercent: fractions.length && fractions.every(f => f !== null) ? Math.max(...fractions) : null,
      sampledPressureLevelsHpa: levels.map(p => p.pressureHpa) }];
  }));
  const low = layers.low;
  const lowCloudGap = low.layerCoverPercent > 0 && low.maximumSampledPressureCoverPercent === 0;
  return { referenceTime: time, weatherFetchedAt: result.data.weather.fetchedAt, layers,
    pressureCloudCoverMethod: result.model === 'ecmwf' ? 'relative-humidity-diagnostic' : 'native-model-field',
    lowCloudGap,
    notes: lowCloudGap ? [`低云分层指标为 ${Number(low.layerCoverPercent.toPrecision(3))}%，采样低层等压面均为 0%；低云遮挡的垂直信息存在缺口。`] : [],
  };
}

export function assessForecast(result, comparison) {
  const notes = [...(result.cloudInputDiagnostics?.notes ?? [])];
  if (comparison.state === 'available' && comparison.labelsDiffer) {
    notes.unshift('两个天气模式对观赏潜力的判断存在分歧，现场云况与临近云图更关键。');
  }
  const caveat = comparison.state === 'available' && !comparison.sameRefresh ?
    '两份预报来自不同更新批次，各自资料时间已列出。' : null;
  if (caveat) notes.push(caveat);
  return { label: notes.length ? '霞色判断依据存在缺口' : '可见霞色质量待校准',
    advice: ['当前指数描述模型中的受光云层信号；肉眼可见的霞色鲜艳度仍待实测校准。', ...notes].join(' '), notes,
    qualityCalibration: 'unavailable',
    meaning: '实验指数结合资料完整性与已保存的双模式结果，供临近观察参考。' };
}
