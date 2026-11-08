// Independently integrate the sunlit VIEW-ONLY source analytically. Solar and
// gas attenuation can only reduce it. Labels have no role in this check.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadInput, codeIdentity } from './diagnose_scattering.mjs';
import { scatteringColumns, solarAltitudeReference, SCATTERING_ASSUMPTIONS as assumptions } from '../src/scattering-engine.mjs';
import { sectionMedium } from '../src/section-medium.mjs';
import { angularCloudUpperBoundFactory } from '../src/angular-bound.mjs';
import { cloudAngularSupport } from '../src/angular-support.mjs';
import { skyDirection, sectionCrossing, shadowCrossings, pointAlong, earthShadowed } from '../src/radiative-geometry.mjs';
import { EARTH_KM, RAD } from '../src/astro.mjs';
import { cloudTransmission } from '../src/cloud-optics.mjs';
import { DISTANCES } from '../research/model-snapshots/section-optics-0.3.1/engine.mjs';

const records = [], violations = [], identity = await codeIdentity();
for (const id of ['2023-06-03-sunset', '2023-06-09-sunset', '2023-06-10-sunrise']) for (const density of ['coarse', 'dense']) {
  const input = await loadInput(id, density, 'pilot'), reference = solarAltitudeReference(input.event, input.location);
  const prepared = scatteringColumns({ ...input, time: Date.parse(reference.time), distancesKm: DISTANCES });
  const medium = sectionMedium(prepared.columns, assumptions), observerHeight = prepared.columns.find(c => c.x === 0).ground;
  const observer = [0, 0, EARTH_KM + observerHeight], solar = skyDirection(0, prepared.sun.altitude);
  const cells = medium.emissionBlocks(assumptions.sourceExtentKm, { merge: false });
  let intervals = 0, rays = 0, zeroBounds = 0, tightenedBounds = 0, maximumSourceToBound = 0;
  function source(phi, mu) {
    const direction = skyDirection(phi, Math.asin(mu) / RAD), prefix = [];
    const maximum = Math.min(assumptions.maximumViewingPathKm,
      ...[-assumptions.sourceExtentKm, assumptions.sourceExtentKm].map(x => sectionCrossing(observer, direction, x)).filter(t => t > 0));
    const trace = medium.trace(observer, direction, maximum, { gasStepKm: 0.1, extraDistancesKm: shadowCrossings(observer, direction, solar) });
    let value = 0, rayleigh = 0, aerosol = 0;const clearUpper = [0, 0, 0];
    for (const segment of trace.segments) {
      const cell = segment.cloud;
      if (cell.fraction > 0 && !earthShadowed(pointAlong(observer, direction, (segment.startKm + segment.endKm) / 2), solar)) {
        const contribution = cell.fraction * cloudTransmission(prefix, { overlap: assumptions.cloudOverlap,
          correlationLengthKm: assumptions.correlationLengthKm,
          condition: { column: cell.column, x: cell.x, lower: 0, upper: cell.fraction } }) * -Math.expm1(-cell.depth);
        value += contribution;
        for (let c = 0; c < 3; c++) {
          const wavelength = assumptions.wavelengthsNm[c];
          // Clear transmission at the segment START bounds its source from
          // above; absorption within the segment can only reduce it further.
          clearUpper[c] += contribution * Math.exp(-rayleigh * (550 / wavelength) ** 4 - aerosol * (550 / wavelength) ** assumptions.aerosolAngstrom);
        }
      }
      prefix.push(cell);rayleigh += segment.rayleigh;aerosol += segment.aerosol;
    }
    return { value, clearUpper };
  }
  for (const phi of [0, 5, 10, 170, 175, 180]) {
    const support = cloudAngularSupport(cells, observerHeight, phi, prepared.sun.altitude, 0.5, 85);
    const cuts = [...new Set([...assumptions.elevationEdgesDegrees.map(e => Math.sin(e * RAD)), ...support.sineEdges])].sort((a, b) => a - b);
    const upperAt = angularCloudUpperBoundFactory({ medium, cells, observer, observerHeight,
      azimuth: phi, solarAltitude: prepared.sun.altitude, assumptions });
    const clearUpperAt = angularCloudUpperBoundFactory({ medium, cells, observer, observerHeight,
      azimuth: phi, solarAltitude: prepared.sun.altitude, assumptions, includeClearAttenuation: true });
    for (let i = 1; i < cuts.length; i++) {
      const a = cuts[i - 1], b = cuts[i], upper = upperAt(a, b), clearBounds = clearUpperAt.channels(a, b);intervals++;
      if (upper === 0) zeroBounds++;
      if (upper < 0.5) tightenedBounds++;
      for (const fraction of [1e-8, 0.125, 0.25, 0.5, 0.75, 0.875, 1 - 1e-8]) {
        const mu = a + fraction * (b - a), sampled = source(phi, mu), actual = sampled.value;rays++;
        if (upper > 0) maximumSourceToBound = Math.max(maximumSourceToBound, actual / upper);
        if (actual > upper * (1 + 1e-9) + 1e-30) violations.push({ id, density, phi, a, b, mu, actual, upper });
        for (let c = 0; c < 3; c++) if (sampled.clearUpper[c] > clearBounds[c] * (1 + 1e-9) + 1e-30) {
          violations.push({ id, density, phi, a, b, mu, wavelengthNm: assumptions.wavelengthsNm[c], actual: sampled.clearUpper[c], upper: clearBounds[c] });
        }
      }
    }
  }
  records.push({ id, density, inputSources: input.sources, intervals, rays, zeroBounds, tightenedBounds, maximumSourceToBound });
  console.log(JSON.stringify(records.at(-1)));
}
const result = { verifiedAt: new Date().toISOString(), codeIdentity: identity,
  verifierSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
  cases: records, violations, passed: violations.length === 0,
  scope: 'Six actual media; exact view-only sunlit source plus per-segment clear-transmission source upper bounds at seven interior locations per boundary interval. Gas uses 0.1km positive Simpson panels, compared against whole-angle envelopes covering panels up to4km. Finite geometry coverage, independent of solar-source quadrature and label grades.' };
await writeFile('research/experiments/scattering-angular-envelope-verification.json', JSON.stringify(result, null, 2) + '\n');
if (!result.passed) process.exitCode = 1;
