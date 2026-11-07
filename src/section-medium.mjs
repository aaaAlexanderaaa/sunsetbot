import { EARTH_KM } from './astro.mjs';
import { coordinates, pointAlong, sectionCrossing, sphereCrossings } from './radiative-geometry.mjs';

function partition(values, maximum) {
  const selected = [0, maximum, ...values.filter(v => Number.isFinite(v) && v > 0 && v < maximum)].sort((a, b) => a - b);
  return selected.filter((v, i) => i === 0 || v - selected[i - 1] > 1e-8);
}

// A spherical, cross-section-extruded medium with piecewise-constant cloud
// occurrence bands and nearest-column terrain. The supplied engine owns all
// optical coefficients. Gas/AOD interpolation retains the original section law.
export function sectionMedium(columns, optics) {
  if (columns.length < 2 || columns.some((c, i) => !Number.isFinite(c.x) || (i && c.x <= columns[i - 1].x))) throw Error('Medium columns require increasing km positions');
  const horizontal = [...columns.map(c => c.x), ...columns.slice(1).map((c, i) => (columns[i].x + c.x) / 2)];
  function gasAt(x, height) {
    let i = 0;
    while (i < columns.length - 2 && x > columns[i + 1].x) i++;
    const a = columns[i], b = columns[i + 1], w = Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x)));
    const aod = a.aod === null || b.aod === null ? 0 : a.aod * (1 - w) + b.aod * w;
    return [optics.rayleigh550 * Math.exp(-Math.max(0, height) / optics.molecularScaleHeightKm),
      aod / optics.aerosolScaleHeightKm * Math.exp(-Math.max(0, height) / optics.aerosolScaleHeightKm)];
  }
  function sample(x, height) {
    let i = 0;
    while (i < columns.length - 2 && x > columns[i + 1].x) i++;
    const a = columns[i], b = columns[i + 1], w = Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x)));
    const column = w <= 0.5 ? a : b, levels = column.levels;
    let level = 0;
    while (level < levels.length - 1 && height > (levels[level].height + levels[level + 1].height) / 2) level++;
    const inside = height >= Math.max(column.ground, levels[0].height - 0.3) && height <= levels.at(-1).height + 0.5;
    const aod = a.aod === null || b.aod === null ? null : a.aod * (1 - w) + b.aod * w;
    return { column: column.index, x: column.x, level, fraction: inside ? levels[level].cover : 0,
      coefficient: optics.cloudExtinction[height < 3 ? 'low' : height < 8 ? 'mid' : 'high'],
      rayleigh: optics.rayleigh550 * Math.exp(-Math.max(0, height) / optics.molecularScaleHeightKm),
      aerosol: aod === null ? 0 : aod / optics.aerosolScaleHeightKm * Math.exp(-Math.max(0, height) / optics.aerosolScaleHeightKm),
      ground: column.ground, missingAerosol: aod === null,
      bounded: !(height < 15 && (x < columns[0].x || x > columns.at(-1).x)), levels };
  }

  function clearDepth(origin, direction, start, end, gasStepKm = 4) {
    const at = t => coordinates(pointAlong(origin, direction, t));
    const distanceKm = end - start;
    const count = Math.max(1, Math.ceil(distanceKm / gasStepKm), Math.ceil(Math.abs(at(end).height - at(start).height) / 0.5));
    let rayleigh = 0, aerosol = 0;
    for (let k = 0; k < count; k++) {
      const a = start + distanceKm * k / count, b = start + distanceKm * (k + 1) / count;
      const pa = at(a), pm = at((a + b) / 2), pb = at(b), length = b - a;
      const va = gasAt(pa.x, pa.height), vm = gasAt(pm.x, pm.height), vb = gasAt(pb.x, pb.height);
      rayleigh += length * (va[0] + 4 * vm[0] + vb[0]) / 6;
      aerosol += length * (va[1] + 4 * vm[1] + vb[1]) / 6;
    }
    return { rayleigh, aerosol };
  }

  function trace(origin, direction, maximumKm, { gasStepKm = 4, extraBoundariesXKm = [], extraDistancesKm = [], integrateGas = true } = {}) {
    if (!Number.isFinite(maximumKm) || maximumKm <= 0 || !Number.isFinite(gasStepKm) || gasStepKm <= 0 ||
        Math.abs(Math.hypot(...direction) - 1) > 1e-9) throw Error('Ray tracing requires unit direction and positive finite km steps');
    const cuts = partition([...extraDistancesKm, ...[...horizontal, ...extraBoundariesXKm].map(x => sectionCrossing(origin, direction, x))], maximumKm), segments = [];
    let blocked = false, bounded = true, missingAerosol = false;
    for (let i = 1; i < cuts.length && !blocked; i++) {
      const lo = cuts[i - 1], hi = cuts[i], middle = coordinates(pointAlong(origin, direction, (lo + hi) / 2));
      const cell = sample(middle.x, middle.height), levels = cell.levels;
      const heights = [cell.ground, Math.max(cell.ground, levels[0].height - 0.3), levels.at(-1).height + 0.5, 3, 8, 65,
        ...levels.slice(1).map((p, j) => (levels[j].height + p.height) / 2)];
      const vertical = [lo, hi, ...heights.flatMap(h => sphereCrossings(origin, direction, EARTH_KM + h)).filter(t => t > lo + 1e-8 && t < hi - 1e-8)]
        .sort((a, b) => a - b).filter((v, j, all) => j === 0 || v - all[j - 1] > 1e-8);
      for (let j = 1; j < vertical.length; j++) {
        const start = vertical[j - 1], end = vertical[j], distanceKm = end - start;
        const at = t => { const p = coordinates(pointAlong(origin, direction, t));return { ...p, ...sample(p.x, p.height) }; };
        const centre = at((start + end) / 2);
        if (centre.height < centre.ground - 1e-9) { blocked = true;break; }
        if (centre.height > 65) continue;
        const { rayleigh, aerosol } = integrateGas ? clearDepth(origin, direction, start, end, gasStepKm) : { rayleigh: 0, aerosol: 0 };
        bounded &&= centre.bounded;missingAerosol ||= centre.missingAerosol;
        const { levels: unused, ...medium } = centre;
        segments.push({ startKm: start, endKm: end, lengthKm: distanceKm, medium,
          rayleigh, aerosol, cloud: { column: centre.column, x: centre.x, level: centre.level,
            fraction: centre.fraction, depth: centre.coefficient * distanceKm } });
      }
    }
    return { segments, blocked, bounded, missingAerosol };
  }
  return { sample, trace, clearDepth };
}
