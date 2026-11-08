// Relative radiance with a unit direct-solar spectral irradiance. Coefficients
// are conditional on a realized medium; cloud-occurrence expectation is owned
// by the research engine and must precede angular aggregation.
const RAD = Math.PI / 180;
const finite = value => Number.isFinite(value);
const spectrum = value => Array.isArray(value) && value.length === 3 && value.every(v => finite(v) && v >= 0);

export function henyeyGreenstein(cosine, asymmetry) {
  if (!finite(cosine) || cosine < -1 || cosine > 1 || !finite(asymmetry) || Math.abs(asymmetry) >= 1) {
    throw Error('Phase requires a photon-propagation cosine in [-1,1] and |g| < 1');
  }
  const magnitude = Math.abs(asymmetry);
  const denominator = (1 - magnitude) ** 2 + 2 * magnitude * (1 - Math.sign(asymmetry) * cosine);
  return ((1 - asymmetry) * (1 + asymmetry)) / (4 * Math.PI * denominator ** 1.5);
}

export function attenuationIntegral(extinctionPerKm, lengthKm) {
  if (!finite(extinctionPerKm) || extinctionPerKm < 0 || !finite(lengthKm) || lengthKm < 0) {
    throw Error('Attenuation requires nonnegative finite km and per-km coefficients');
  }
  return extinctionPerKm === 0 ? lengthKm : -Math.expm1(-extinctionPerKm * lengthKm) / extinctionPerKm;
}

// Segments run from observer to scene. Each segment has constant extinction,
// scattering and incident direct irradiance. Its internal viewing attenuation
// is integrated analytically; foreground transmission is carried exactly.
export function singleScatterRay(segments, { cosine, asymmetry }) {
  const phase = henyeyGreenstein(cosine, asymmetry), rgb = [0, 0, 0], transmission = [1, 1, 1];
  for (const { lengthKm, extinctionPerKm, scatteringPerKm, incidentIrradiance } of segments) {
    if (!finite(lengthKm) || lengthKm < 0 || !spectrum(extinctionPerKm) || !spectrum(scatteringPerKm) ||
        !spectrum(incidentIrradiance) || scatteringPerKm.some((v, i) => v > extinctionPerKm[i])) {
      throw Error('Realized segments require finite spectra and 0 <= scattering <= extinction');
    }
    for (let c = 0; c < 3; c++) {
      rgb[c] += transmission[c] * scatteringPerKm[c] * incidentIrradiance[c] * phase * attenuationIntegral(extinctionPerKm[c], lengthKm);
      transmission[c] *= Math.exp(-extinctionPerKm[c] * lengthKm);
    }
  }
  return { rgb, transmission };
}

export function solidAngle({ azimuthLow, azimuthHigh, elevationLow, elevationHigh }) {
  if (![azimuthLow, azimuthHigh, elevationLow, elevationHigh].every(finite) ||
      azimuthHigh <= azimuthLow || azimuthHigh - azimuthLow > 360 ||
      elevationLow < -90 || elevationHigh > 90 || elevationHigh <= elevationLow) {
    throw Error('Angular bounds require a positive <=360-degree azimuth span and ordered elevations in [-90,90]');
  }
  return (azimuthHigh - azimuthLow) * RAD * (Math.sin(elevationHigh * RAD) - Math.sin(elevationLow * RAD));
}

export function skyGrid(azimuthEdges, elevationEdges) {
  if (![azimuthEdges, elevationEdges].every(edges => Array.isArray(edges) && edges.length >= 2 &&
      edges.every((v, i) => finite(v) && (i === 0 || v > edges[i - 1])))) throw Error('Sky grids require increasing finite degree edges');
  const cells = [];
  for (let a = 1; a < azimuthEdges.length; a++) for (let e = 1; e < elevationEdges.length; e++) {
    const bounds = { azimuthLow: azimuthEdges[a - 1], azimuthHigh: azimuthEdges[a],
      elevationLow: elevationEdges[e - 1], elevationHigh: elevationEdges[e] };
    cells.push({ ...bounds, azimuth: (bounds.azimuthLow + bounds.azimuthHigh) / 2,
      elevation: Math.asin((Math.sin(bounds.elevationLow * RAD) + Math.sin(bounds.elevationHigh * RAD)) / 2) / RAD,
      solidAngleSr: solidAngle(bounds) });
  }
  return cells;
}

function azimuthIntervals(cell) {
  const start = ((cell.azimuthLow % 360) + 360) % 360, end = start + cell.azimuthHigh - cell.azimuthLow;
  return end <= 360 ? [[start, end]] : [[start, 360], [0, end - 360]];
}

export function integrateSky(cells) {
  const integral = [0, 0, 0];let area = 0;
  const selected = [];
  for (const cell of cells) {
    const weight = solidAngle(cell);
    if (!spectrum(cell.rgb)) throw Error('Sky cells require nonnegative finite relative-radiance spectra');
    const intervals = azimuthIntervals(cell);
    for (const previous of selected) {
      const elevationOverlap = Math.min(cell.elevationHigh, previous.cell.elevationHigh) - Math.max(cell.elevationLow, previous.cell.elevationLow);
      if (elevationOverlap > 1e-12 && intervals.some(([lo, hi]) => previous.intervals.some(([pl, ph]) => Math.min(hi, ph) - Math.max(lo, pl) > 1e-12))) {
        throw Error('Overlapping sky cells would count the same viewing direction more than once');
      }
    }
    selected.push({ cell, intervals });area += weight;
    for (let c = 0; c < 3; c++) integral[c] += cell.rgb[c] * weight;
  }
  return { rgbIntegral: integral, rgbMean: area > 0 ? integral.map(v => v / area) : null, solidAngleSr: area };
}
