// Deterministic vector quadrature. Known geometric support and discontinuities
// belong in breakpoints; refinement alone cannot certify an unseen peak.
export function adaptiveSimpson(evaluate, low, high, {
  absoluteTolerance = 1e-10, relativeTolerance = 0.005, maxDepth = 16, breakpoints = [], maxInterval = Infinity,
  maxEvaluations = 100000,
  errorComponents = null, additionalError = null, onLimitError = null,
} = {}) {
  if (!Number.isFinite(low) || !Number.isFinite(high) || high < low || !(absoluteTolerance > 0) || !(relativeTolerance >= 0) ||
      !Number.isInteger(maxDepth) || maxDepth < 0 || !(maxInterval > 0)) throw Error('Invalid adaptive quadrature bounds or tolerances');
  const cache = new Map();let dimensions = null, acceptedIntervals = 0, depthLimitCount = 0, boundedLimitCount = 0, deepest = 0;
  function sample(x) {
    if (cache.has(x)) return cache.get(x);
    if (cache.size >= maxEvaluations) throw Error('Adaptive quadrature evaluation budget exceeded');
    const y = evaluate(x);
    if (!Array.isArray(y) || !y.length || y.some(v => !Number.isFinite(v)) || (dimensions !== null && y.length !== dimensions)) {
      throw Error('Adaptive integrands require consistent finite vectors');
    }
    dimensions = y.length;cache.set(x, y);return y;
  }
  const estimate = (a, b, fa, fm, fb) => fa.map((v, c) => (b - a) / 6 * (v + 4 * fm[c] + fb[c]));
  function recurse(a, b, fa, fm, fb, coarse, absolute, depth) {
    const middle = (a + b) / 2, fl = sample((a + middle) / 2), fr = sample((middle + b) / 2);
    const left = estimate(a, middle, fa, fl, fm), right = estimate(middle, b, fm, fr, fb);
    const fine = left.map((v, c) => v + right[c]), extra = additionalError?.(a, b, fa, fm, fb, fine);
    const error = fine.map((v, c) => Math.max(Math.abs(v - coarse[c]) / 15, extra?.[c] ?? 0));
    deepest = Math.max(deepest, depth);
    const accepted = (errorComponents ?? error.map((_, i) => i)).every(c => error[c] <= absolute + relativeTolerance * Math.abs(fine[c]));
    if (accepted || depth >= maxDepth) {
      acceptedIntervals++;
      if (!accepted) {
        depthLimitCount++;
        const bound = onLimitError?.(a, b);
        if (bound?.length === dimensions && bound.every(v => Number.isFinite(v) && v >= 0)) {
          boundedLimitCount++;
          for (let c = 0; c < dimensions; c++) error[c] = Math.max(error[c], bound[c]);
        }
      }
      return { value: fine.map((v, c) => v + (v - coarse[c]) / 15), error };
    }
    const first = recurse(a, middle, fa, fl, fm, left, absolute / 2, depth + 1);
    const second = recurse(middle, b, fm, fr, fb, right, absolute / 2, depth + 1);
    return { value: first.value.map((v, c) => v + second.value[c]), error: first.error.map((v, c) => v + second.error[c]) };
  }
  const raw = [low, high, ...breakpoints.filter(v => v > low && v < high)].sort((a, b) => a - b);
  const cuts = [...new Set(raw)].flatMap((v, i, all) => {
    if (i === all.length - 1) return [v];
    const count = Number.isFinite(maxInterval) ? Math.ceil((all[i + 1] - v) / maxInterval) : 1;
    return Array.from({ length: count }, (_, j) => v + j / count * (all[i + 1] - v));
  });
  let value, error;
  for (let i = 1; i < cuts.length; i++) {
    const a = cuts[i - 1], b = cuts[i], fa = sample(a), fm = sample((a + b) / 2), fb = sample(b);
    const result = recurse(a, b, fa, fm, fb, estimate(a, b, fa, fm, fb), absoluteTolerance * (b - a) / (high - low), 0);
    value ??= Array(dimensions).fill(0);error ??= Array(dimensions).fill(0);
    value = value.map((v, c) => v + result.value[c]);error = error.map((v, c) => v + result.error[c]);
  }
  return { value: value ?? sample(low).map(() => 0), errorEstimate: error ?? Array(dimensions).fill(0),
    evaluations: cache.size, acceptedIntervals, depthLimitCount, boundedLimitCount, maximumDepth: deepest, converged: depthLimitCount === 0 };
}
