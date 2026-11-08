import { EARTH_KM, RAD } from './astro.mjs';
import { skyDirection, sectionCrossing } from './radiative-geometry.mjs';
import { cloudTransmission } from './cloud-optics.mjs';
import { cloudAngularSupport } from './angular-support.mjs';

// For an observer inside the Sun's shadow cylinder, q(s,mu)=A(mu)s^2+
// 2*B(mu)s+C is negative until direct sunlight is geometrically possible.
// Maxima of A and B over an angular interval give q<=Amax*s^2+2*Bmax*s+C;
// that upper quadratic's positive root is a lower bound on every exit distance.
export function firstSunlitDistanceLowerBound(observerHeight, azimuth, solarAltitude, muLow, muHigh) {
  const radius = EARTH_KM + observerHeight, a = solarAltitude * RAD, phi = azimuth * RAD;
  if (Math.sin(a) >= 0) return 0;
  const c = (radius * Math.cos(a) - EARTH_KM) * (radius * Math.cos(a) + EARTH_KM);
  if (c >= 0) return 0;
  const p = Math.cos(a) * Math.cos(phi), q = Math.sin(a);
  const cosine = mu => p * Math.sqrt(Math.max(0, 1 - mu * mu)) + q * mu;
  const ca = cosine(muLow), cb = cosine(muHigh);
  const maximumA = ca * cb <= 0 ? 1 : Math.max(0, 1 - Math.min(ca * ca, cb * cb));
  const linear = radius * Math.cos(a) ** 2, curved = -radius * Math.sin(a) * Math.cos(a) * Math.cos(phi);
  const coefficient = mu => linear * mu + curved * Math.sqrt(Math.max(0, 1 - mu * mu));
  let maximumB = Math.max(coefficient(muLow), coefficient(muHigh));
  if (curved > 0) {
    const stationary = linear / Math.hypot(linear, curved);
    if (stationary > muLow && stationary < muHigh) maximumB = Math.max(maximumB, coefficient(stationary));
  }
  if (maximumA === 0) return maximumB > 0 ? Math.max(0, -c / (2 * maximumB) - 1e-7) : Infinity;
  const root = Math.sqrt(maximumB * maximumB - maximumA * c);
  const distance = maximumB >= 0 ? -c / (maximumB + root) : (-maximumB + root) / maximumA;
  return Math.max(0, distance - 1e-7);
}

function commonForeground(first, second) {
  const result = [];let i = 0, j = 0;
  while (i < first.length && j < second.length) {
    const a = first[i], b = second[j], low = Math.max(a.startKm, b.startKm), high = Math.min(a.endKm, b.endKm);
    if (high > low && a.cloud.column === b.cloud.column && a.cloud.level === b.cloud.level &&
        a.medium.extinctionBand === b.medium.extinctionBand && a.cloud.fraction === b.cloud.fraction) {
      result.push({ ...a.cloud, depth: a.medium.coefficient * (high - low) });
    }
    if (a.endKm <= b.endKm) i++;else j++;
  }
  return result;
}

// End-ray x and height are monotone in mu. Where both end rays occupy the
// same fixed column/band, every intermediate ray does too. These common path
// portions supply a genuine attenuation lower bound before any sunlit source.
// For each possible source cell c, its remaining conditional source integral
// is <=1, hence sum_c f_c E[T_common|C_c] bounds cloud radiance / phase / E0.
export function angularCloudUpperBoundFactory({ medium, cells, observer, observerHeight, azimuth, solarAltitude, assumptions }) {
  const possible = cells.map(cell => ({ cell, support: cloudAngularSupport([cell], observerHeight, azimuth, solarAltitude,
    assumptions.elevationEdgesDegrees[0], assumptions.elevationEdgesDegrees.at(-1), { shadowClip: false }).intervals }));
  return (low, high) => {
    let candidates = possible.filter(item => item.support.some(([a, b]) => Math.min(high, b) > Math.max(low, a) + 1e-15));
    if (!candidates.length) return 0;
    const distance = firstSunlitDistanceLowerBound(observerHeight, azimuth, solarAltitude, low, high);
    if (distance >= assumptions.maximumViewingPathKm) return 0;
    if (distance <= 0) return 1;
    const radius = EARTH_KM + observerHeight;
    candidates = candidates.filter(({ cell }) => {
      const topRadius = EARTH_KM + cell.heightHigh, c = (topRadius - radius) * (topRadius + radius);
      if (c <= 0) return false;
      const topExit = c / (Math.sqrt((radius * low) ** 2 + c) + radius * low);
      const farX = Math.cos(azimuth * RAD) >= 0 ? cell.xHigh : cell.xLow;
      const farCrossing = sectionCrossing(observer, skyDirection(azimuth, Math.asin(high) / RAD), farX);
      const maximumDistance = Math.min(assumptions.maximumViewingPathKm, topExit,
        farCrossing > 0 ? farCrossing : Infinity);
      return maximumDistance + 1e-7 >= distance;
    });
    if (!candidates.length) return 0;
    const first = medium.trace(observer, skyDirection(azimuth, Math.asin(low) / RAD), distance, { integrateGas: false });
    const second = medium.trace(observer, skyDirection(azimuth, Math.asin(high) / RAD), distance, { integrateGas: false });
    const foreground = commonForeground(first.segments, second.segments);
    let upper = 0;
    for (const { cell } of candidates) {
      upper += cell.fraction * cloudTransmission(foreground, { overlap: assumptions.cloudOverlap ?? 'decorrelated',
        correlationLengthKm: assumptions.correlationLengthKm,
        condition: { column: cell.column, x: cell.x, lower: 0, upper: cell.fraction } });
    }
    return Math.min(1, upper) * (1 + 1e-9);
  };
}
