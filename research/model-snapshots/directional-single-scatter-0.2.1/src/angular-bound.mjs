import { EARTH_KM, RAD } from './astro.mjs';
import { skyDirection, sectionCrossing } from './radiative-geometry.mjs';
import { cloudTransmission } from './cloud-optics.mjs';
import { cloudAngularSupport } from './angular-support.mjs';
import { clearDepthLowerBound } from './clear-depth-bound.mjs';

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
export function angularCloudUpperBoundFactory({ medium, cells, observer, observerHeight, azimuth, solarAltitude,
  assumptions, includeClearAttenuation = false }) {
  if (Math.abs(observer[2] - EARTH_KM - observerHeight) > 1e-8) throw Error('Source envelope observer height differs from its radial position');
  const possible = cells.map(cell => ({ cell, support: cloudAngularSupport([cell], observerHeight, azimuth, solarAltitude,
    assumptions.elevationEdgesDegrees[0], assumptions.elevationEdgesDegrees.at(-1), { shadowClip: false }).intervals }));
  const cache = new Map(), radius = EARTH_KM + observerHeight, toward = Math.cos(azimuth * RAD) >= 0;
  function channels(low, high) {
    const key = low + ':' + high;
    if (cache.has(key)) return cache.get(key);
    const upper = assumptions.wavelengthsNm.map(() => 0);
    const sunlight = firstSunlitDistanceLowerBound(observerHeight, azimuth, solarAltitude, low, high);
    const lowDirection = skyDirection(azimuth, Math.asin(low) / RAD), highDirection = skyDirection(azimuth, Math.asin(high) / RAD);
    if (sunlight < assumptions.maximumViewingPathKm) for (const { cell, support } of possible) {
      if (!support.some(([a, b]) => Math.min(high, b) > Math.max(low, a))) continue;
      const topRadius = EARTH_KM + cell.heightHigh, topC = (topRadius - radius) * (topRadius + radius);
      if (topC <= 0) continue;
      const topExit = topC / (Math.sqrt((radius * low) ** 2 + topC) + radius * low);
      const farCrossing = sectionCrossing(observer, highDirection, toward ? cell.xHigh : cell.xLow);
      const maximumDistance = Math.min(assumptions.maximumViewingPathKm, topExit, farCrossing > 0 ? farCrossing : Infinity);
      const nearX = toward ? Math.max(0, cell.xLow) : Math.min(0, cell.xHigh);
      const nearCrossing = sectionCrossing(observer, lowDirection, nearX);
      const bottomRadius = EARTH_KM + cell.heightLow, bottomC = (bottomRadius - radius) * (bottomRadius + radius);
      const bottomEntry = bottomC > 0 ? bottomC / (Math.sqrt((radius * high) ** 2 + bottomC) + radius * high) : 0;
      // Every source in this cell is beyond all three necessary boundaries.
      const distance = Math.max(0, Math.max(sunlight, nearCrossing > 0 ? nearCrossing : 0, bottomEntry) - 1e-7);
      if (distance > maximumDistance + 1e-7) continue;
      const foreground = distance > 0 ? commonForeground(
        medium.trace(observer, lowDirection, distance, { integrateGas: false }).segments,
        medium.trace(observer, highDirection, distance, { integrateGas: false }).segments) : [];
      const cloud = cell.fraction * cloudTransmission(foreground, { overlap: assumptions.cloudOverlap ?? 'decorrelated',
        correlationLengthKm: assumptions.correlationLengthKm,
        condition: { column: cell.column, x: cell.x, lower: 0, upper: cell.fraction } });
      const clear = includeClearAttenuation ? clearDepthLowerBound({ medium, observer, columnPositions: medium.horizontalPositionsKm,
        azimuth, muLow: low, muHigh: high, distanceKm: distance,
        maximumStepKm: assumptions.gasStepKm, samplingRadiusKm: assumptions.gasStepKm }) : { rayleigh: 0, aerosol: 0 };
      for (let c = 0; c < upper.length; c++) {
        const wavelength = assumptions.wavelengthsNm[c];
        upper[c] += cloud * Math.exp(-clear.rayleigh * (550 / wavelength) ** 4 -
          clear.aerosol * (550 / wavelength) ** assumptions.aerosolAngstrom);
      }
    }
    const value = upper.map(v => Math.min(1, v) * (1 + 1e-9));cache.set(key, value);return value;
  }
  const maximum = (low, high) => Math.max(...channels(low, high));
  maximum.channels = channels;
  return maximum;
}
