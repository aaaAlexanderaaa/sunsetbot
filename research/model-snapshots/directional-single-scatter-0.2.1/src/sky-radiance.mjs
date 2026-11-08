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
  const primary = Array.from({ length: n }, (_, i) => i), rayCache = new Map(), sliceCache = new Map();
  const reference = Array.from({ length: m }, (_, i) => i < n ? i : i === n ? 0 : i <= 2 * n ? i - n - 1 : (i - 2 * n - 1) * 6 + 5);
  const controlled = Array.from({ length: m }, (_, i) => i).filter(i => i !== n);
  const outerReference = [...reference, ...reference], outerControlled = [...controlled, ...controlled.map(c => m + c)];
  const phaseMaxima = asymmetries.map(g => (1 + Math.abs(g)) / (4 * Math.PI * (1 - Math.abs(g)) ** 2));
  const zeroIntervals = [];
  let angularDepthLimits = 0, angularBoundedLimits = 0, sourceDepthLimits = 0, sourceBoundedLimits = 0, quadraturePoints = 0, uncoveredPoints = 0;
  const sideResults = {};
  function slice(side, delta) {
    const key = side + ':' + delta;
    if (sliceCache.has(key)) return sliceCache.get(key);
    const phi = side === 'toward' ? delta / RAD : 180 - delta / RAD;
    const support = cloudAngularSupport(blocks, observerHeight, phi, solarAltitude, eLow, eHigh, { shadowClip: false });
    const litHints = cloudAngularSupport(blocks, observerHeight, phi, solarAltitude, eLow, eHigh);
    const cloudUpper = medium ? angularCloudUpperBoundFactory({ medium, cells, observer, observerHeight, azimuth: phi,
      solarAltitude, assumptions, includeClearAttenuation: true }) : () => 1;
    const initial = assumptions.elevationEdgesDegrees.map(e => Math.sin(e * RAD));
    const possible = (a, b) => support.intervals.some(([lo, hi]) => Math.min(b, hi) > Math.max(a, lo));
    function intervalBound(a, b) {
      const p = Math.cos(solarAltitude * RAD) * Math.cos(phi * RAD), q = Math.sin(solarAltitude * RAD);
      const stationary = q / Math.hypot(p, q);
      const mus = [a, b, stationary, -stationary].filter(mu => mu >= a && mu <= b);
      const cosines = mus.map(mu => p * Math.sqrt(Math.max(0, 1 - mu * mu)) + q * mu);
      const phase = asymmetries.map(g => Math.max(...cosines.map(c => henyeyGreenstein(c, g))));
      const channelBounds = cloudUpper.channels?.(a, b) ?? Array(3).fill(cloudUpper(a, b));
      const radianceBounds = phase.flatMap(p => {
        const rgb = channelBounds.map((bound, c) => (b - a) * assumptions.directSolarIrradiancePerChannel[c] * bound * p);
        return [...rgb, ...rgb];
      });
      return [...radianceBounds, ...Array(m - n).fill(0)];
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
      breakpoints: [...initial, ...support.sineEdges, ...litHints.sineEdges], errorComponents: controlled, relativeReferenceComponents: reference,
      additionalError: (a, b, fa, fm, fb, fine) => {
        if (!primary.every(c => fine[c] === 0) || !possible(a, b)) return null;
        if (zeroIntervals.length < 8) zeroIntervals.push({ side, azimuth: phi, elevationLow: Math.asin(a) / RAD, elevationHigh: Math.asin(b) / RAD,
          samples: [a, (a + b) / 2, b].map(mu => {
            const ray = rayCache.get(side + ':' + delta + ':' + mu);
            return ray ? { elevation: Math.asin(mu) / RAD, rgb: ray.spectra.map(s => s.rgb),
              potentialLit: ray.potentialLitCloudProbability, points: ray.quadraturePoints, tail: ray.omittedTailUpperBoundPerSr,
              viewTransmission: ray.viewCloudTransmission, terrainBlocked: ray.terrainBlocked } : { elevation: Math.asin(mu) / RAD, outsideSupport: true };
          }) });
        return intervalBound(a, b);
      },
      // Both exact transfer and the positive nested source/angle Boole rules
      // lie in this view-source envelope. It therefore owns ALL numerical
      // error in a limited mu interval, including source/tail uncertainty.
      // Those subordinate integrals are absorbed only on this interval.
      onLimitError: medium ? (a, b) => ({ errorBound: intervalBound(a, b),
        absorbedComponents: Array.from({ length: m - n - 1 }, (_, i) => n + 1 + i) }) : null,
    });
    angularDepthLimits += result.depthLimitCount;
    angularBoundedLimits += result.boundedLimitCount;
    const combined = [...result.value, ...result.errorEstimate];
    sliceCache.set(key, combined);return combined;
  }
  for (const side of ['toward', 'opposite']) {
    const result = adaptiveSimpson(delta => slice(side, delta), 0, width, {
      absoluteTolerance: assumptions.angularAbsoluteTolerance / 8, relativeTolerance: assumptions.angularRelativeTolerance,
      maxDepth: assumptions.angularAzimuthMaximumDepth, errorComponents: outerControlled, relativeReferenceComponents: outerReference,
      breakpoints: assumptions.azimuthPartitionFractions.map(f => width * f),
      additionalError: (a, b, fa, fm, fb, fine) => {
        if (!blocks.length || !primary.every(c => fine[c] === 0)) return null;
        // A complete (azimuth,mu) box has a pathwise cloud-source integral<=1
        // for every ray. This guards zero outer samples independently of
        // inner samples; a subdivision limit retains explicit failure.
        const upper = (b - a) * (muHigh - muLow) * Math.max(...assumptions.directSolarIrradiancePerChannel);
        return [...phaseMaxima.flatMap(p => Array(6).fill(p * upper)), ...Array(2 * m - n).fill(0)];
      },
    });
    angularDepthLimits += result.depthLimitCount;
    sideResults[side] = { values: result.value.map(v => 2 * v), outerError: result.errorEstimate.map(v => 2 * v) };
  }
  const total = sideResults.toward.values.map((v, i) => v + sideResults.opposite.values[i]);
  const spectra = asymmetries.map((g, p) => {
    const offset = p * 6, rgbIntegral = total.slice(offset, offset + 3), coveredRgbIntegral = total.slice(offset + 3, offset + 6);
    const outerErrorAt = c => sideResults.toward.outerError[c] + sideResults.opposite.outerError[c];
    const uncertaintyAt = c => total[c] + total[m + c] + outerErrorAt(c) + outerErrorAt(m + c);
    const errorAt = c => outerErrorAt(offset + c) + total[m + offset + c] + outerErrorAt(m + offset + c);
    const errors = [0, 1, 2].map(errorAt), coveredErrors = [3, 4, 5].map(errorAt);
    const sourceErrors = [0, 1, 2].map(c => uncertaintyAt(n + 1 + offset + c));
    const coveredSourceErrors = [3, 4, 5].map(c => uncertaintyAt(n + 1 + offset + c));
    const tail = uncertaintyAt(2 * n + 1 + p), totalErrors = errors.map((e, c) => e + sourceErrors[c] + tail);
    const coveredTotalErrors = coveredErrors.map((e, c) => e + coveredSourceErrors[c] + tail);
    const denominatorResolved = rgbIntegral[2] > totalErrors[2];
    return { asymmetry: g, rgbIntegral, coveredRgbIntegral, rgbMean: rgbIntegral.map(v => v / area), solidAngleSr: area,
      angularErrorEstimate: errors, coveredAngularErrorEstimate: coveredErrors,
      sourceErrorEstimate: sourceErrors, coveredSourceErrorEstimate: coveredSourceErrors,
      tailUpperBound: tail, totalErrorEstimate: totalErrors, coveredTotalErrorEstimate: coveredTotalErrors,
      sides: Object.fromEntries(['toward', 'opposite'].map(side => [side, {
        rgbIntegral: sideResults[side].values.slice(offset, offset + 3), solidAngleSr: area / 2 }])),
      redBlueRelativeTransmissionRatio: rgbIntegral[2] > 0 ? rgbIntegral[0] / rgbIntegral[2] : null,
      redBlueRatioErrorInterval: { lower: denominatorResolved ? Math.max(0, rgbIntegral[0] - totalErrors[0]) / (rgbIntegral[2] + totalErrors[2]) : null,
        upper: denominatorResolved ? (rgbIntegral[0] + totalErrors[0]) / (rgbIntegral[2] - totalErrors[2]) : null,
        status: denominatorResolved ? 'bounded_by_error_estimates' : 'denominator_unresolved' } };
  });
  const maximumAngularError = Math.max(...spectra.map(s => s.angularErrorEstimate[0]));
  const sourceError = Math.max(...spectra.map(s => s.sourceErrorEstimate[0])), tailBound = Math.max(...spectra.map(s => s.tailUpperBound));
  const errorsWithinTarget = spectra.every(s => s.rgbIntegral.every((v, c) => s.totalErrorEstimate[c] <=
    Math.max(assumptions.totalAbsoluteTolerance, assumptions.totalRelativeTolerance * v) && s.coveredTotalErrorEstimate[c] <=
    Math.max(assumptions.totalAbsoluteTolerance, assumptions.totalRelativeTolerance * s.coveredRgbIntegral[c])));
  return { spectra, potentialLitCloudSolidAngleSr: total[n], diagnostics: {
    numericalStatus: errorsWithinTarget && angularDepthLimits === angularBoundedLimits && sourceDepthLimits === sourceBoundedLimits ? 'estimated_converged' : 'not_converged',
    criterionScope: 'RGB adaptive error estimates including integration of inner/source/tail uncertainty, conservative dark-region and limit envelopes; independent gas/partition checks required. Subgrid peaks with resolved positive background retain adaptive-estimator scope.',
    quadraturePoints, uncoveredPoints, angularRays: rayCache.size, angularSlices: sliceCache.size,
    angularErrorEstimate: maximumAngularError, sourceErrorEstimate: sourceError, omittedTailIntegralUpperBound: tailBound,
    angularDepthLimitCount: angularDepthLimits, angularBoundedLimitCount: angularBoundedLimits, sourceDepthLimitCount: sourceDepthLimits,
    sourceBoundedLimitCount: sourceBoundedLimits,
    sourceSupportBlocks: blocks.length, cellCount: null } };
}
