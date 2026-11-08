// Offline weak-label ranking research. The fitted sigmoid describes the
// preserved curator labels; its output retains that observation protocol.
const sigmoid = z => z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const design = features => {
  if (!Array.isArray(features) || features.length !== 2 || !features.every(Number.isFinite)) throw Error('Two finite quality features required');
  return [1, ...features];
};

export function qualityRank(parameters, features) {
  if (!Array.isArray(parameters) || parameters.length !== 3 || !parameters.every(Number.isFinite)) throw Error('Three finite quality parameters required');
  return 100 * sigmoid(dot(parameters, design(features)));
}

export function qualityLogLoss(rows, parameters) {
  if (!rows.length) throw Error('Labelled quality rows required');
  return rows.reduce((sum, row) => {
    if (![0, 1].includes(row.target)) throw Error('Explicit binary source label required');
    const z = dot(parameters, design(row.features));
    return sum + Math.max(z, 0) - row.target * z + Math.log1p(Math.exp(-Math.abs(z)));
  }, 0) / rows.length;
}

function solve(matrix, vector) {
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let k = 0; k < 3; k++) {
    let pivot = k;
    for (let i = k + 1; i < 3; i++) if (Math.abs(a[i][k]) > Math.abs(a[pivot][k])) pivot = i;
    [a[k], a[pivot]] = [a[pivot], a[k]];
    if (Math.abs(a[k][k]) < 1e-15) throw Error('Singular quality fit');
    for (let i = k + 1; i < 3; i++) {
      const factor = a[i][k] / a[k][k];
      for (let j = k; j <= 3; j++) a[i][j] -= factor * a[k][j];
    }
  }
  const x = Array(3).fill(0);
  for (let i = 2; i >= 0; i--) x[i] = (a[i][3] - a[i].slice(i + 1, 3).reduce((sum, value, j) => sum + value * x[i + 1 + j], 0)) / a[i][i];
  return x;
}

export function fitQualityRank(rows, ridge) {
  if (!Number.isFinite(ridge) || ridge <= 0) throw Error('Positive ridge required');
  // Validate labels/features before optimizing, including all-zero features.
  qualityLogLoss(rows, [0, 0, 0]);
  const positive = rows.filter(row => row.target === 1).length;
  if (!positive || positive === rows.length) throw Error('Both source-label classes required');
  const x = rows.map(row => design(row.features));
  let parameters = [Math.log(positive / (rows.length - positive)), 0, 0];
  const objective = b => qualityLogLoss(rows, b) + ridge * (b[1] ** 2 + b[2] ** 2) / 2;
  for (let iteration = 0; iteration < 50; iteration++) {
    const gradient = [0, ridge * parameters[1], ridge * parameters[2]];
    const hessian = [[0, 0, 0], [0, ridge, 0], [0, 0, ridge]];
    for (let n = 0; n < rows.length; n++) {
      const p = sigmoid(dot(parameters, x[n]));
      for (let i = 0; i < 3; i++) {
        gradient[i] += (p - rows[n].target) * x[n][i] / rows.length;
        for (let j = 0; j < 3; j++) hessian[i][j] += p * (1 - p) * x[n][i] * x[n][j] / rows.length;
      }
    }
    const gradientMaximum = Math.max(...gradient.map(Math.abs));
    if (gradientMaximum < 1e-10) return { parameters, ridge, iterations: iteration, gradientMaximum, objective: objective(parameters) };
    const delta = solve(hessian, gradient), before = objective(parameters);
    let step = 1, next;
    while (step >= 2 ** -30) {
      next = parameters.map((b, i) => b - step * delta[i]);
      if (objective(next) <= before - 1e-4 * step * dot(gradient, delta) + 1e-15) break;
      step /= 2;
    }
    if (step < 2 ** -30) throw Error('Quality fit line search failed');
    parameters = next;
  }
  throw Error('Quality fit iteration budget exceeded');
}
