import { rankingMetrics } from '../research/model-snapshots/section-optics-0.3.1/evaluation.mjs';

export function topKPrecision(cases, score, k) {
  const available = cases.filter(c => Number.isFinite(score(c))).sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
  const selected = available.slice(0, k);
  return { budget: k, selected: selected.length, positive: selected.filter(c => c.observedGrade > 0).length,
    precision: selected.length ? selected.filter(c => c.observedGrade > 0).length / selected.length : null };
}

export function pairedDateBlockAuc(cases, scoreA, scoreB, { replicates = 1000, blockDays = 3, seed = 20230611 } = {}) {
  const groups = new Map();
  for (const row of cases) {
    if (!groups.has(row.date)) groups.set(row.date, []);
    groups.get(row.date).push(row);
  }
  const dates = [...groups.keys()].sort();
  if (!dates.length) return { validReplicates: 0, interval95: null };
  let state = seed >>> 0;
  const random = () => { state ^= state << 13;state ^= state >>> 17;state ^= state << 5;return (state >>> 0) / 4294967296; };
  const auc = (rows, score) => rankingMetrics(rows.map(c => ({ ...c, selectedScore: score(c) })), 'selectedScore').pairwiseAuc;
  const differences = [];
  for (let r = 0; r < replicates; r++) {
    const sampled = [];
    while (sampled.length < dates.length) {
      const start = Math.floor(random() * dates.length);
      for (let i = 0; i < blockDays && sampled.length < dates.length; i++) sampled.push(dates[(start + i) % dates.length]);
    }
    const rows = sampled.flatMap(date => groups.get(date));
    const a = auc(rows, scoreA), b = auc(rows, scoreB);
    if (a !== null && b !== null) differences.push(a - b);
  }
  differences.sort((a, b) => a - b);
  const quantile = p => {
    if (!differences.length) return null;
    const x = p * (differences.length - 1), lo = Math.floor(x), hi = Math.ceil(x);
    if (lo === hi) return differences[lo];
    return differences[lo] * (hi - x) + differences[hi] * (x - lo);
  };
  const a = auc(cases, scoreA), b = auc(cases, scoreB);
  return { difference: a === null || b === null ? null : a - b, interval95: differences.length ? [quantile(0.025), quantile(0.975)] : null,
    replicates, validReplicates: differences.length, blockDays, seed, sampling: 'paired circular moving blocks of whole calendar days' };
}
