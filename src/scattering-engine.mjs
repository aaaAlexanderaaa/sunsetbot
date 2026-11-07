import { EARTH_KM, RAD, sunPosition } from './astro.mjs';
import { interpolate } from './provider.mjs';
import { cloudTransmission } from './cloud-optics.mjs';
import { sectionMedium } from './section-medium.mjs';
import { pointAlong, skyDirection, earthShadowed, sectionCrossing, shadowCrossings, dot } from './radiative-geometry.mjs';
import { henyeyGreenstein, skyGrid, integrateSky } from './radiance.mjs';
import { adaptiveSimpson } from './quadrature.mjs';

export const SCATTERING_VERSION = 'directional-single-scatter-0.1.1';
export const SCATTERING_ASSUMPTIONS = {
  wavelengthsNm: [680, 550, 440], directSolarIrradiancePerChannel: [1, 1, 1],
  cloudExtinction: { low: 2, mid: 0.7, high: 0.2 }, singleScatteringAlbedo: 1,
  asymmetry: 0.85, phaseScenarios: [0, 0.75, 0.85, 0.9], correlationLengthKm: 50,
  rayleigh550: 0.012, molecularScaleHeightKm: 8, aerosolScaleHeightKm: 1.5, aerosolAngstrom: 1.2,
  sourceExtentKm: 150, maximumViewingPathKm: 350, maximumSolarPathKm: 2200,
  azimuthHalfWidthDegrees: 10, referenceSolarAltitudeDegrees: -0.833,
  gasStepKm: 4, maximumEmissionOpticalDepth: 0.5, sourceTailAbsoluteTolerance: 1e-9,
  sourceRelativeTolerance: 0.002, sourceAbsoluteTolerance: 1e-12, sourceMaximumDepth: 18,
  elevationEdgesDegrees: [0.5, 2, 5, 10, 20, 40, 65, 85],
  cloudField: 'Current solar section extruded along cross-track; U depends on longitude-like section coordinate and height bands',
  terrain: 'Nearest fixed horizontal column; constant within each probability column',
  scope: 'Single cloud scattering with Rayleigh/aerosol extinction; relative spectral radiance per unit direct irradiance, sr^-1',
};

const difference = (a, b) => ((a - b + 540) % 360) - 180;
const clamp = value => Math.max(-1, Math.min(1, value));

// getTimes supplies a calendar event estimate. Use the same getPosition
// ephemeris to establish a common geometric solar altitude for radiance
// comparisons, retaining the original event-time result as a separate measure.
export function solarAltitudeReference(event, location, target = SCATTERING_ASSUMPTIONS.referenceSolarAltitudeDegrees) {
  const centre = Date.parse(event.time);
  let left = centre - 10 * 60000, right = centre + 10 * 60000;
  const value = t => sunPosition(t, location.lat, location.lon).altitude - target;
  let a = value(left), b = value(right);
  if (a * b > 0) throw Error('Solar-altitude reference is outside the preserved event neighbourhood');
  for (let i = 0; i < 40 && right - left > 10; i++) {
    const middle = (left + right) / 2, c = value(middle);
    if (a * c <= 0) { right = middle;b = c; }
    else { left = middle;a = c; }
  }
  const time = Math.round((left + right) / 2);
  return { time: new Date(time).toISOString(), targetAltitude: target,
    actualAltitude: sunPosition(time, location.lat, location.lon).altitude,
    offsetSeconds: (time - centre) / 1000 };
}

export function scatteringColumns({ weather, aerosol, time, event, location, fanOffsets, levelsHpa, distancesKm }) {
  if (!Array.isArray(levelsHpa) || levelsHpa.length < 2 || !distancesKm?.length || fanOffsets.length < 1 ||
      weather.length !== fanOffsets.length * distancesKm.length || aerosol?.length !== weather.length) throw Error('Directional profiles, pressure grid or aerosol inputs are incomplete');
  const sun = sunPosition(time, location.lat, location.lon), offset = difference(sun.azimuth, event.azimuth);
  let index = 0;
  while (index < fanOffsets.length - 2 && offset > fanOffsets[index + 1]) index++;
  const second = fanOffsets.length === 1 ? index : index + 1;
  const weight = index === second ? 0 : Math.max(0, Math.min(1, (offset - fanOffsets[index]) / (fanOffsets[second] - fanOffsets[index])));
  const columns = distancesKm.map((x, i) => {
    const left = index * distancesKm.length + i, right = second * distancesKm.length + i;
    const blend = field => {
      const a = interpolate(weather[left], field, time), b = interpolate(weather[right], field, time);
      if (a === null || b === null) throw Error('Directional weather profile missing at frame time: ' + field);
      return a * (1 - weight) + b * weight;
    };
    const levels = levelsHpa.map(pressure => ({ pressure, height: blend('geopotential_height_' + pressure + 'hPa') / 1000,
      cover: blend('cloud_cover_' + pressure + 'hPa') / 100 })).sort((a, b) => a.height - b.height);
    if (levels.some((p, j) => p.cover < 0 || p.cover > 1 || (j && p.height <= levels[j - 1].height))) throw Error('Directional pressure profiles require valid occurrence fractions and ordered heights');
    const aa = interpolate(aerosol[left], 'aerosol_optical_depth', time), ab = interpolate(aerosol[right], 'aerosol_optical_depth', time);
    if (aa === null || ab === null || aa < 0 || ab < 0) throw Error('Directional spectral experiment requires complete nonnegative AOD');
    return { x, index: i, ground: Math.max(0, (Number(weather[left].elevation) || 0) * (1 - weight) + (Number(weather[right].elevation) || 0) * weight) / 1000,
      aod: aa * (1 - weight) + ab * weight, levels };
  });
  return { columns, sun, bearingClipped: offset < fanOffsets[0] || offset > fanOffsets.at(-1) };
}

const clearTransmission = (rayleigh, aerosol, wavelength, assumptions) => Math.exp(-rayleigh * (550 / wavelength) ** 4 - aerosol * (550 / wavelength) ** assumptions.aerosolAngstrom);

export function directionalRay({ medium, observer, direction, solarDirection, assumptions = SCATTERING_ASSUMPTIONS,
  asymmetries = assumptions.phaseScenarios, overlap = 'decorrelated' }) {
  const crossing = [-assumptions.sourceExtentKm, assumptions.sourceExtentKm].map(x => sectionCrossing(observer, direction, x)).filter(t => t > 0);
  const maximum = Math.min(assumptions.maximumViewingPathKm, ...crossing);
  const view = medium.trace(observer, direction, maximum, { gasStepKm: assumptions.gasStepKm,
    extraBoundariesXKm: [-assumptions.sourceExtentKm, assumptions.sourceExtentKm],
    extraDistancesKm: shadowCrossings(observer, direction, solarDirection) });
  const cosine = clamp(dot(solarDirection, direction)), phases = asymmetries.map(g => henyeyGreenstein(cosine, g));
  const rgb = asymmetries.map(() => [0, 0, 0]), coveredRgb = asymmetries.map(() => [0, 0, 0]);
  const prefix = [], litCells = [];let rayleigh = 0, aerosol = 0, viewBounded = true, quadraturePoints = 0, omittedTailBound = 0, uncoveredPoints = 0;
  let sourceErrorEstimate = 0, sourceDepthLimitCount = 0;
  const cloudSegments = view.segments.filter(s => s.cloud.fraction > 0).length;
  const transmissionOptions = condition => ({ overlap, condition, correlationLengthKm: assumptions.correlationLengthKm });
  for (const segment of view.segments) {
    const cell = segment.cloud, k = segment.medium.coefficient, length = segment.lengthKm;
    const condition = { column: cell.column, x: cell.x, lower: 0, upper: cell.fraction };
    if (cell.fraction > 0 && k > 0) {
      const startCloud = cloudTransmission(prefix, transmissionOptions(condition));
      const upper = cell.fraction * Math.max(...phases) * Math.max(...assumptions.directSolarIrradiancePerChannel) * assumptions.singleScatteringAlbedo *
        startCloud * clearTransmission(rayleigh, aerosol, 680, assumptions);
      const retainedLength = upper > assumptions.sourceTailAbsoluteTolerance ? Math.min(length,
        Math.log(upper / assumptions.sourceTailAbsoluteTolerance) / k) : 0;
      if (retainedLength < length) omittedTailBound += upper * Math.exp(-k * retainedLength);
      // Area eligibility samples the full segment, independently of the
      // numerical radiance tail cutoff. It counts a cell once through U-union.
      for (const fraction of [1e-7, 0.5, 1 - 1e-7]) {
        const point = pointAlong(observer, direction, segment.startKm + length * fraction);
        if (!earthShadowed(point, solarDirection) && !medium.trace(point, solarDirection, assumptions.maximumSolarPathKm,
          { integrateGas: false }).blocked) { litCells.push({ ...cell, depth: 80 });break; }
      }
      function sourceAt(rawOffset) {
        // The fixed source-cell condition supplies the one-sided material
        // limit at an interface; ray extinction starts beyond that point.
        const offset = rawOffset, distance = segment.startKm + offset;
        const point = pointAlong(observer, direction, distance);
        quadraturePoints++;
        if (earthShadowed(point, solarDirection)) return [0, 0, 0, 0, 0, 0];
        const solar = medium.trace(point, solarDirection, assumptions.maximumSolarPathKm, { gasStepKm: assumptions.gasStepKm });
        if (solar.blocked) return [0, 0, 0, 0, 0, 0];
        const cloud = cloudTransmission([...prefix, { ...cell, depth: k * offset }, ...solar.segments.map(s => s.cloud)], transmissionOptions(condition));
        const partial = medium.clearDepth(observer, direction, segment.startKm, distance, assumptions.gasStepKm);
        const solarRayleigh = solar.segments.reduce((sum, s) => sum + s.rayleigh, 0), solarAerosol = solar.segments.reduce((sum, s) => sum + s.aerosol, 0);
        const covered = viewBounded && segment.medium.bounded && solar.bounded;
        if (!covered) uncoveredPoints++;
        const density = cell.fraction * k * assumptions.singleScatteringAlbedo * cloud, common = [];
        for (let c = 0; c < 3; c++) {
          const contribution = density * assumptions.directSolarIrradiancePerChannel[c] *
            clearTransmission(rayleigh + partial.rayleigh + solarRayleigh, aerosol + partial.aerosol + solarAerosol, assumptions.wavelengthsNm[c], assumptions);
          common.push(contribution);
        }
        return [...common, ...common.map(v => covered ? v : 0)];
      }
      if (retainedLength > 0) {
        const result = adaptiveSimpson(sourceAt, 0, retainedLength, {
          absoluteTolerance: assumptions.sourceAbsoluteTolerance / (Math.max(...phases) * Math.max(1, cloudSegments)),
          relativeTolerance: assumptions.sourceRelativeTolerance, maxDepth: assumptions.sourceMaximumDepth,
          maxInterval: assumptions.maximumEmissionOpticalDepth / k, maxEvaluations: 30000,
        });
        sourceDepthLimitCount += result.depthLimitCount;
        sourceErrorEstimate += Math.max(...result.errorEstimate) * Math.max(...phases);
        for (let c = 0; c < 3; c++) {
          for (let p = 0; p < phases.length; p++) {
            rgb[p][c] += result.value[c] * phases[p];
            coveredRgb[p][c] += result.value[c + 3] * phases[p];
          }
        }
      }
    }
    prefix.push(cell);rayleigh += segment.rayleigh;aerosol += segment.aerosol;viewBounded &&= segment.medium.bounded;
  }
  return { cosine, spectra: asymmetries.map((asymmetry, i) => ({ asymmetry, rgb: rgb[i], coveredRgb: coveredRgb[i] })),
    potentialLitCloudProbability: litCells.length ? 1 - cloudTransmission(litCells, { overlap, correlationLengthKm: assumptions.correlationLengthKm }) : 0,
    quadraturePoints, uncoveredPoints, omittedTailUpperBoundPerSr: omittedTailBound,
    sourceErrorEstimatePerSr: sourceErrorEstimate, sourceDepthLimitCount,
    terrainBlocked: view.blocked, bounded: view.bounded && uncoveredPoints === 0 };
}

export function computeDirectionalFrame(input, options = {}) {
  const assumptions = { ...SCATTERING_ASSUMPTIONS, ...options }, prepared = scatteringColumns(input);
  const medium = sectionMedium(prepared.columns, assumptions), local = prepared.columns.find(c => c.x === 0);
  const observer = [0, 0, EARTH_KM + local.ground], solarDirection = skyDirection(0, prepared.sun.altitude);
  const halfWidth = assumptions.azimuthHalfWidthDegrees;
  if (!(halfWidth > 0)) throw Error('Directional sky integration requires a declared positive angular width');
  const elevationEdges = options.elevationEdgesDegrees ?? assumptions.elevationEdgesDegrees;
  const toward = skyGrid(options.azimuthEdgesDegrees ?? [-halfWidth, 0, halfWidth], elevationEdges);
  const grid = [...toward.map(c => ({ ...c, side: 'toward' })), ...toward.map(c => ({ ...c,
    azimuthLow: c.azimuthLow + 180, azimuthHigh: c.azimuthHigh + 180, azimuth: c.azimuth + 180, side: 'opposite' }))];
  const asymmetries = options.asymmetries ?? assumptions.phaseScenarios;
  const cells = grid.map(cell => ({ ...cell, result: directionalRay({ medium, observer, direction: skyDirection(cell.azimuth, cell.elevation),
    solarDirection, assumptions, asymmetries, overlap: options.overlap ?? 'decorrelated' }) }));
  const spectra = asymmetries.map((asymmetry, p) => {
    const items = cells.map(c => ({ ...c, rgb: c.result.spectra[p].rgb }));
    const aggregate = integrateSky(items), covered = integrateSky(cells.map(c => ({ ...c, rgb: c.result.spectra[p].coveredRgb })));
    const sides = Object.fromEntries(['toward', 'opposite'].map(side => [side, integrateSky(items.filter(c => c.side === side))]));
    return { asymmetry, ...aggregate, coveredRgbIntegral: covered.rgbIntegral, sides,
      redBlueRelativeTransmissionRatio: aggregate.rgbIntegral[2] > 0 ? aggregate.rgbIntegral[0] / aggregate.rgbIntegral[2] : null };
  });
  return { modelVersion: SCATTERING_VERSION, time: new Date(input.time).toISOString(), sun: prepared.sun, spectra,
    potentialLitCloudSolidAngleSr: cells.reduce((sum, c) => sum + c.solidAngleSr * c.result.potentialLitCloudProbability, 0),
    diagnostics: { bearingClipped: prepared.bearingClipped, quadraturePoints: cells.reduce((sum, c) => sum + c.result.quadraturePoints, 0),
      uncoveredPoints: cells.reduce((sum, c) => sum + c.result.uncoveredPoints, 0),
      omittedTailIntegralUpperBound: cells.reduce((sum, c) => sum + c.solidAngleSr * c.result.omittedTailUpperBoundPerSr, 0),
      sourceErrorEstimate: cells.reduce((sum, c) => sum + c.solidAngleSr * c.result.sourceErrorEstimatePerSr, 0),
      sourceDepthLimitCount: cells.reduce((sum, c) => sum + c.result.sourceDepthLimitCount, 0),
      cellCount: cells.length, representation: assumptions.cloudField }, assumptions,
    cells: options.includeCells ? cells : undefined };
}
