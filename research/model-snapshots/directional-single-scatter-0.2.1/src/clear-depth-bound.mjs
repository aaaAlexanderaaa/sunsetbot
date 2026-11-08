import { skyDirection, pointAlong, coordinates } from './radiative-geometry.mjs';

// Observer=[0,0,R+h], positive elevations. For each distance interval, every
// angular ray lies between its endpoint section positions, below the upper
// elevation ray at the interval's far end. Cloud-independent gas density is
// smallest at that upper height; AOD is piecewise linear in section x, so its
// exact range minimum occurs at an endpoint or interpolation knot. A lower
// rectangle sum therefore bounds optical depth for the WHOLE angular interval.
export function clearDepthLowerBound({ medium, observer, columnPositions, azimuth, muLow, muHigh, distanceKm,
  maximumStepKm = 4, samplingRadiusKm = 0 }) {
  if (observer[0] !== 0 || observer[1] !== 0 || !(observer[2] > 0) || !Number.isFinite(azimuth) ||
      !(muLow >= 0 && muLow <= muHigh && muHigh <= 1) || !Number.isFinite(distanceKm) || distanceKm < 0 ||
      !Number.isFinite(maximumStepKm) || !(maximumStepKm > 0) || !Number.isFinite(samplingRadiusKm) || samplingRadiusKm < 0 ||
      !Array.isArray(columnPositions) || columnPositions.length < 2 ||
      columnPositions.some((x, i) => !Number.isFinite(x) || (i && x <= columnPositions[i - 1]))) {
    throw Error('Clear-depth bound requires the radial observer, positive-elevation interval and complete increasing AOD knots');
  }
  if (distanceKm === 0) return { rayleigh: 0, aerosol: 0 };
  const low = skyDirection(azimuth, Math.asin(muLow) * 180 / Math.PI), high = skyDirection(azimuth, Math.asin(muHigh) * 180 / Math.PI);
  const count = Math.ceil(distanceKm / maximumStepKm);let rayleigh = 0, aerosol = 0;
  for (let i = 0; i < count; i++) {
    const start = distanceKm * i / count, end = distanceKm * (i + 1) / count;
    // Expanding by the maximum numerical gas-panel length also bounds the
    // implemented positive Simpson estimate: every node in the panel owning
    // any s lies inside this expanded density envelope. Its weighted average
    // exceeds this envelope at every s in the panel, hence also its integral.
    const near = Math.max(0, start - samplingRadiusKm), far = end + samplingRadiusKm;
    const first = coordinates(pointAlong(observer, high, near)), last = coordinates(pointAlong(observer, low, far));
    const height = coordinates(pointAlong(observer, high, far)).height + 1e-7;
    const xLow = Math.min(first.x, last.x) - 1e-7, xHigh = Math.max(first.x, last.x) + 1e-7;
    const samples = [xLow, xHigh, ...columnPositions.filter(x => x > xLow && x < xHigh)].map(x => medium.sample(x, height));
    rayleigh += (end - start) * Math.min(...samples.map(s => s.rayleigh));
    aerosol += (end - start) * Math.min(...samples.map(s => s.aerosol));
  }
  // An outward margin reduces a lower bound under floating-point summation.
  return { rayleigh: rayleigh * (1 - 1e-9), aerosol: aerosol * (1 - 1e-9) };
}
