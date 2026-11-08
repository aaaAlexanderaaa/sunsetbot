import { adaptiveSimpson } from './quadrature.mjs';
import { cloudAngularSupport } from './angular-support.mjs';
import { angularCloudUpperBoundFactory } from './angular-bound.mjs';
import { henyeyGreenstein } from './radiance.mjs';

const RAD = Math.PI / 180;

// Nested integration uses the exact cross-track reflection symmetry of the
// declared extruded medium. Each side integrates delta in [0,width], then
// receives the reflected half's equal contribution.
export function adaptiveSkyRadiance({ blocks, cells, medium, observer, observerHeight, solarAltitude, rayAt, asymmetries, assumptions }) {
  const width = assumptions.azimuthHalfWidthDegrees * RAD, n = asymmetries.length * 6;
  const m = 2 * n + asymmetries.length + 1;
  const [eLow, eHigh] = [assumptions.elevationEdgesDegrees[0], assumptions.elevationEdgesDegrees.at(-1)];
  const muLow = Math.sin(eLow * RAD), muHigh = Math.sin(eHigh * RAD), area = 4 * width * (muHigh - muLow);
  const controlled = Array.from({ length: n }, (_, i) => i), rayCache = new Map(), sliceCache = new Map();
  const zeroIntervals = [];
  let angularDepthLimits = 0, angularBoundedLimits = 0, sourceDepthLimits = 0, sourceBoundedLimits = 0, quadraturePoints = 0, uncoveredPoints = 0;
  const sideResults = {};
  function slice(side, delta) {
    const key = side + ':' + delta;
    if (sliceCache.has(key)) return sliceCache.get(key);
    const phi = side === 'toward' ? delta / RAD : 180 - delta / RAD;
    const support = cloudAngularSupport(blocks, observerHeight, phi, solarAltitude, eLow, eHigh, { shadowClip: false });
    const litHints = cloudAngularSupport(blocks, observerHeight, phi, solarAltitude, eLow, eHigh);
    const cloudUpper = medium ? angularCloudUpperBoundFactory({ medium, cells, observer, observerHeight, azimuth: phi, solarAltitude, assumptions }) : () => 1;
    const initial = assumptions.elevationEdgesDegrees.map(e => Math.sin(e * RAD));
    const possible = (a, b) => support.intervals.some(([lo, hi]) => Math.min(b, hi) > Math.max(a, lo) + 1e-15);
    function intervalBound(a, b) {
      const p = Math.cos(solarAltitude * RAD) * Math.cos(phi * RAD), q = Math.sin(solarAltitude * RAD);
      const stationary = q / Math.hypot(p, q);
      const mus = [a, b, stationary, -stationary].filter(mu => mu >= a && mu <= b);
      const cosines = mus.map(mu => p * Math.sqrt(Math.max(0, 1 - mu * mu)) + q * mu);
      const upper = (b - a) * cloudUpper(a, b) * Math.max(...assumptions.directSolarIrradiancePerChannel);
      return [...asymmetries.flatMap(g => Array(6).fill(upper * Math.max(...cosines.map(c => henyeyGreenstein(c, g))))), ...Array(m - n).fill(0)];
    }
    function radiance(mu) {
      if (!support.intervals.some(([lo, hi]) => mu >= lo - 1e-15 && mu <= hi + 1e-15)) return Array(m).fill(0);
      const rayKey = side + ':' + delta + ':' + mu;
      let ray = rayCache.get(rayKey);
      if (!ray) {
        if (rayCache.size >= assumptions.maximumAngularRays) {
          const error = Error('Directional angular ray budget exhausted before numerical acceptance');
          error.code = 'ANGULAR_BUDGET';error.rays = rayCache.size;error.zeroIntervals = zeroIntervals;throw error;
        }
        ray = rayAt(phi, Math.asin(mu) / RAD);rayCache.set(rayKey, ray);
        quadraturePoints += ray.quadraturePoints;uncoveredPoints += ray.uncoveredPoints;sourceDepthLimits += ray.sourceDepthLimitCount;
        sourceBoundedLimits += ray.sourceBoundedLimitCount ?? 0;
      }
      return [...ray.spectra.flatMap(s => [...s.rgb, ...s.coveredRgb]), ray.potentialLitCloudProbability,
        ...ray.spectra.flatMap(s => [...s.sourceErrorEstimate, ...s.coveredSourceErrorEstimate]),
        ...ray.spectra.map(s => s.tailUpperBound)];
    }
    const result = adaptiveSimpson(radiance, muLow, muHigh, {
      absoluteTolerance: assumptions.angularAbsoluteTolerance / (8 * width),
      relativeTolerance: assumptions.angularRelativeTolerance, maxDepth: assumptions.angularMuMaximumDepth,
      breakpoints: [...initial, ...support.sineEdges, ...litHints.sineEdges], errorComponents: controlled,
      additionalError: (a, b, fa, fm, fb, fine) => {
        if (!controlled.every(c => fine[c] === 0) || !possible(a, b)) return null;
        if (zeroIntervals.length < 8) zeroIntervals.push({ side, azimuth: phi, elevationLow: Math.asin(a) / RAD, elevationHigh: Math.asin(b) / RAD,
          samples: [a, (a + b) / 2, b].map(mu => {
            const ray = rayCache.get(side + ':' + delta + ':' + mu);
            return ray ? { elevation: Math.asin(mu) / RAD, rgb: ray.spectra.map(s => s.rgb),
              potentialLit: ray.potentialLitCloudProbability, points: ray.quadraturePoints, tail: ray.omittedTailUpperBoundPerSr,
              viewTransmission: ray.viewCloudTransmission, terrainBlocked: ray.terrainBlocked } : { elevation: Math.asin(mu) / RAD, outsideSupport: true };
          }) });
        return intervalBound(a, b);
      },
      // A positive Boole rule and the true integral both lie in [0,envelope].
      // A bounded local limit remains in the global error sum; azimuth limits
      // and limits without a geometric medium retain failure status.
      onLimitError: medium ? intervalBound : null,
    });
    angularDepthLimits += result.depthLimitCount;
    angularBoundedLimits += result.boundedLimitCount;
    const combined = [...result.value, ...result.errorEstimate.slice(0, n)];
    sliceCache.set(key, combined);return combined;
  }
  for (const side of ['toward', 'opposite']) {
    const result = adaptiveSimpson(delta => slice(side, delta), 0, width, {
      absoluteTolerance: assumptions.angularAbsoluteTolerance / 8, relativeTolerance: assumptions.angularRelativeTolerance,
      maxDepth: assumptions.angularAzimuthMaximumDepth, errorComponents: controlled,
      breakpoints: assumptions.azimuthPartitionFractions.map(f => width * f),
    });
    angularDepthLimits += result.depthLimitCount;
    sideResults[side] = { values: result.value.map(v => 2 * v), outerError: result.errorEstimate.slice(0, n).map(v => 2 * v) };
  }
  const total = sideResults.toward.values.map((v, i) => v + sideResults.opposite.values[i]);
  const spectra = asymmetries.map((g, p) => {
    const offset = p * 6, rgbIntegral = total.slice(offset, offset + 3), coveredRgbIntegral = total.slice(offset + 3, offset + 6);
    const errorAt = c => sideResults.toward.outerError[offset + c] + sideResults.opposite.outerError[offset + c] + total[m + offset + c];
    const errors = [0, 1, 2].map(errorAt), coveredErrors = [3, 4, 5].map(errorAt);
    return { asymmetry: g, rgbIntegral, coveredRgbIntegral, rgbMean: rgbIntegral.map(v => v / area), solidAngleSr: area,
      angularErrorEstimate: errors, coveredAngularErrorEstimate: coveredErrors,
      sourceErrorEstimate: total.slice(n + 1 + offset, n + 1 + offset + 3),
      coveredSourceErrorEstimate: total.slice(n + 1 + offset + 3, n + 1 + offset + 6),
      tailUpperBound: total[2 * n + 1 + p], sides: Object.fromEntries(['toward', 'opposite'].map(side => [side, {
        rgbIntegral: sideResults[side].values.slice(offset, offset + 3), solidAngleSr: area / 2 }])),
      redBlueRelativeTransmissionRatio: rgbIntegral[2] > 0 ? rgbIntegral[0] / rgbIntegral[2] : null };
  });
  const maximumAngularError = Math.max(...spectra.map(s => s.angularErrorEstimate[0]));
  const sourceError = Math.max(...spectra.map(s => s.sourceErrorEstimate[0])), tailBound = Math.max(...spectra.map(s => s.tailUpperBound));
  const errorsWithinTarget = spectra.every(s => s.angularErrorEstimate[0] + s.sourceErrorEstimate[0] + s.tailUpperBound <=
    Math.max(assumptions.totalAbsoluteTolerance, assumptions.totalRelativeTolerance * s.rgbIntegral[0]) &&
    s.coveredAngularErrorEstimate[0] + s.coveredSourceErrorEstimate[0] + s.tailUpperBound <=
    Math.max(assumptions.totalAbsoluteTolerance, assumptions.totalRelativeTolerance * s.coveredRgbIntegral[0]));
  return { spectra, potentialLitCloudSolidAngleSr: total[n], diagnostics: {
    numericalStatus: errorsWithinTarget && angularDepthLimits === angularBoundedLimits && sourceDepthLimits === sourceBoundedLimits ? 'estimated_converged' : 'not_converged',
    criterionScope: 'Source/angle quadrature estimates and radiance-tail bound; gas and changed-partition comparisons are separate acceptance checks',
    quadraturePoints, uncoveredPoints, angularRays: rayCache.size, angularSlices: sliceCache.size,
    angularErrorEstimate: maximumAngularError, sourceErrorEstimate: sourceError, omittedTailIntegralUpperBound: tailBound,
    angularDepthLimitCount: angularDepthLimits, angularBoundedLimitCount: angularBoundedLimits, sourceDepthLimitCount: sourceDepthLimits,
    sourceBoundedLimitCount: sourceBoundedLimits,
    sourceSupportBlocks: blocks.length, cellCount: null } };
}
