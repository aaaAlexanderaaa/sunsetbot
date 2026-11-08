import { EARTH_KM, RAD } from './astro.mjs';

export function projectedElevation(xKm, heightKm, observerHeightKm, azimuthDegrees) {
  if (xKm === 0) return heightKm > observerHeightKm ? 90 : heightKm < observerHeightKm ? -90 : null;
  const cosine = Math.cos(azimuthDegrees * RAD);
  if (Math.abs(cosine) < 1e-12 || xKm * cosine < 0) return null;
  const ratio = Math.tan(xKm / EARTH_KM) / cosine;
  const z = (EARTH_KM + heightKm) / Math.sqrt(1 + ratio * ratio), horizontal = z * ratio;
  return Math.atan2(z - EARTH_KM - observerHeightKm, horizontal) / RAD;
}

export function directSunShadowHeight(xKm, azimuthDegrees, solarAltitudeDegrees) {
  const gamma = xKm / EARTH_KM, phi = azimuthDegrees * RAD;
  const cosineLatitude = Math.sqrt((1 + Math.tan(gamma) ** 2) / (1 + (Math.tan(gamma) / Math.cos(phi)) ** 2));
  const sineAltitude = cosineLatitude * Math.sin(solarAltitudeDegrees * RAD + gamma);
  if (sineAltitude >= 0) return 0;
  const cosineAltitude = Math.sqrt(Math.max(0, 1 - sineAltitude ** 2));
  return EARTH_KM * sineAltitude ** 2 / (cosineAltitude * (1 + cosineAltitude));
}

// Positive-cloud support projected into a fixed azimuth plane. Earth-shadow
// clipping supplies additional visible vertices; terrain shadow remains in
// the exact per-source ray test. Bounds cover the declared narrow twilight
// domain, and numerical zero-source intervals retain their uncertainty bound.
export function cloudAngularSupport(blocks, observerHeight, azimuth, solarAltitude, elevationLow, elevationHigh, { shadowClip = true } = {}) {
  const toward = Math.cos(azimuth * RAD) >= 0, intervals = [], edges = [elevationLow, elevationHigh];
  for (const block of blocks) {
    let left = toward ? Math.max(0, block.xLow) : block.xLow;
    const right = toward ? block.xHigh : Math.min(0, block.xHigh);
    if (right <= left) continue;
    const shadow = shadowClip ? x => directSunShadowHeight(x, azimuth, solarAltitude) : () => 0;
    if (shadow(right) >= block.heightHigh) continue;
    function crossing(height, lo, hi) {
      for (let i = 0; i < 50; i++) {
        const middle = (lo + hi) / 2;
        if (shadow(middle) > height) lo = middle;else hi = middle;
      }
      return (lo + hi) / 2;
    }
    if (shadow(left) > block.heightHigh) left = crossing(block.heightHigh, left, right);
    const xs = [left, right];
    if (shadow(left) > block.heightLow && shadow(right) < block.heightLow) xs.push(crossing(block.heightLow, left, right));
    const lower = xs.map(x => projectedElevation(x, Math.max(block.heightLow, shadow(x)), observerHeight, azimuth)).filter(v => v !== null);
    const upper = xs.map(x => projectedElevation(x, block.heightHigh, observerHeight, azimuth)).filter(v => v !== null);
    if (!lower.length || !upper.length) continue;
    const low = Math.max(elevationLow, Math.min(...lower)), high = Math.min(elevationHigh, Math.max(...upper));
    if (high <= low) continue;
    intervals.push([Math.sin(low * RAD), Math.sin(high * RAD)]);
    edges.push(low, high, ...lower.filter(v => v > low && v < high), ...upper.filter(v => v > low && v < high));
  }
  return { intervals, sineEdges: [...new Set(edges.filter(v => v >= elevationLow && v <= elevationHigh).sort((a, b) => a - b))].map(v => Math.sin(v * RAD)) };
}
