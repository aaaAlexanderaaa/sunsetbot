// Each vertical column shares U~Uniform(0,1): a cell exists when U<fraction.
// Horizontally, U is copied with probability exp(-distance/L), or independently
// redrawn. Piecewise-constant quadrature integrates the Markov chain exactly.
export function cloudTransmission(pieces, { overlap = 'decorrelated', correlationLengthKm = 50, condition = null } = {}) {
  if (!['maximum', 'random-columns', 'decorrelated'].includes(overlap)) throw new Error('Unknown cloud overlap scenario');
  if (!Number.isFinite(correlationLengthKm) || correlationLengthKm <= 0 || (condition &&
    (!Number.isFinite(condition.x) || !(condition.lower >= 0 && condition.lower < condition.upper && condition.upper <= 1)))) {
    throw new Error('Invalid cloud probability condition or correlation length');
  }
  const groups = new Map();
  for (const { column, x, level, fraction, depth } of pieces) {
    if (![x, fraction, depth].every(Number.isFinite) || fraction < 0 || fraction > 1 || depth < 0) {
      throw new Error('Cloud pieces require km positions, nonnegative depth and fractions in [0,1]');
    }
    if (depth <= 0 || fraction <= 0) continue;
    const key = `${column}:${level}:${fraction}`;
    const cell = groups.get(key) ?? { column, x, level, fraction, depth: 0 };
    cell.depth += depth;
    groups.set(key, cell);
  }
  const cells = [...groups.values()];
  const columns = new Map();
  for (const c of cells) {
    if (!columns.has(c.column)) columns.set(c.column, { column: c.column, x: c.x, cells: [] });
    columns.get(c.column).cells.push(c);
  }
  if (condition && !columns.has(condition.column)) columns.set(condition.column, { column: condition.column, x: condition.x, cells: [] });
  const breaks = [...new Set([0, 1, ...cells.map(c => c.fraction), ...(condition ? [condition.lower, condition.upper] : [])])].sort((a, b) => a - b);
  const bins = breaks.slice(1).map((end, i) => ({ u: (breaks[i] + end) / 2, width: end - breaks[i] }));
  let density = bins.map(() => 1), previous = null;
  for (const c of [...columns.values()].sort((a, b) => a.x - b.x)) {
    const mass = density.reduce((sum, d, i) => sum + d * bins[i].width, 0);
    const correlation = previous === null || overlap === 'random-columns' ? 0 : overlap === 'maximum' ? 1 :
      Math.exp(-Math.abs(c.x - previous) / correlationLengthKm);
    density = bins.map((bin, i) => {
      const depth = c.cells.reduce((sum, cell) => sum + (bin.u < cell.fraction ? cell.depth : 0), 0);
      const selected = !condition || c.column !== condition.column || (bin.u >= condition.lower && bin.u < condition.upper);
      return selected ? (correlation * density[i] + (1 - correlation) * mass) * Math.exp(-Math.min(80, depth)) : 0;
    });
    previous = c.x;
  }
  const mass = density.reduce((sum, d, i) => sum + d * bins[i].width, 0);
  return mass / (condition ? condition.upper - condition.lower : 1);
}
