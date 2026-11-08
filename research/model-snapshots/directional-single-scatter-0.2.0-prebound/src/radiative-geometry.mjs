import { EARTH_KM, RAD } from './astro.mjs';

// Observer-local axes: x is toward the solar section, y is cross-section,
// z is radial up from the Earth's centre. Positions and path lengths use km.
export const pointAlong = (origin, direction, distanceKm) => origin.map((v, i) => v + direction[i] * distanceKm);
export const coordinates = point => ({ x: EARTH_KM * Math.atan2(point[0], point[2]), height: Math.hypot(...point) - EARTH_KM });
export const skyDirection = (azimuthOffset, elevation) => [Math.cos(elevation * RAD) * Math.cos(azimuthOffset * RAD),
  Math.cos(elevation * RAD) * Math.sin(azimuthOffset * RAD), Math.sin(elevation * RAD)];
export const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

export function sphereCrossings(origin, direction, radiusKm) {
  const b = dot(origin, direction), radius = Math.hypot(...origin), c = (radius - radiusKm) * (radius + radiusKm);
  const discriminant = b * b - c;
  if (discriminant < 0) return [];
  const q = -b - (b >= 0 ? 1 : -1) * Math.sqrt(discriminant);
  return q === 0 ? [0] : [q, c / q].sort((a, b) => a - b);
}

export function earthShadowed(origin, solarDirection) {
  const nearest = -dot(origin, solarDirection);
  return nearest > 0 && Math.hypot(...pointAlong(origin, solarDirection, nearest)) < EARTH_KM - 1e-9;
}

export function sectionCrossing(origin, direction, xKm) {
  const angle = xKm / EARTH_KM, normal = [Math.cos(angle), 0, -Math.sin(angle)], denominator = dot(normal, direction);
  return Math.abs(denominator) < 1e-15 ? null : -dot(normal, origin) / denominator;
}

export function shadowCrossings(origin, direction, solarDirection) {
  const mu = dot(direction, solarDirection), os = dot(origin, solarDirection), on = dot(origin, direction);
  const a = Math.max(0, 1 - mu * mu), b = on - os * mu;
  const radius = Math.hypot(...origin), c = (radius - EARTH_KM) * (radius + EARTH_KM) - os * os;
  const roots = [];
  if (a > 1e-14) {
    const discriminant = b * b - a * c;
    if (discriminant >= 0) {
      const q = -b - (b >= 0 ? 1 : -1) * Math.sqrt(discriminant);
      if (q !== 0) roots.push(q / a, c / q);
      else roots.push(0);
    }
  } else if (Math.abs(b) > 1e-12) roots.push(-c / (2 * b));
  if (Math.abs(mu) > 1e-14) roots.push(-os / mu);
  return roots.filter(Number.isFinite);
}
