# Sunsetbot architecture

## Purpose and boundaries

An independent, self-hostable sunrise/sunset cloud-colour forecast service for
the Yangtze River Delta. Shanghai is the first validation location. The system
obtains numerical weather forecasts, evaluates spatial cloud illumination and
visibility, and serves an explanatory web interface and a versioned HTTP API.

The original sunsetbot.top is a source of public product and domain evidence.
Its availability and proprietary forecast outputs are independent of runtime.

## Module ownership

- `src/astro.mjs`: solar positions, civil-date event discovery and geodesy.
- `src/engine.mjs`: cloud illumination, sightline attenuation, aerosol and
  weather factors, event scoring, explanations and model version.
- `src/cloud-optics.mjs`: cloud-occurrence overlap and conditional transmission.
- `src/cloud-column.mjs`: isolated research cloud-base eligibility; its target
  threshold is supplied by the frozen engine assumptions.
- `src/scattering-engine.mjs`: isolated directional single-scattering research
  model and its explicit optical/numerical assumptions.
- `src/section-medium.mjs` and `src/radiative-geometry.mjs`: spherical ray-cell
  intersections and the declared extruded atmospheric medium.
- `src/radiance.mjs` and `src/quadrature.mjs`: normalized phase functions,
  formal-source checks, solid angles and numerical integration diagnostics.
- `src/angular-support.mjs` and `src/angular-bound.mjs`: projected cloud
  support and per-source-cell whole-elevation-interval transfer envelopes.
- `src/clear-depth-bound.mjs`: deterministic clear-gas optical-depth lower
  bounds covering the angular interval and positive gas-quadrature panels.
- `src/sky-radiance.mjs`: nested angular integration, RGB uncertainty
  propagation and explicit error ownership at bounded local limits.
- `src/quality-rank.mjs`: separate offline three-parameter weak-label ranking
  research; fitted parameters stay with their frozen study artifacts.
- `src/provider.mjs`: Open-Meteo requests, units, strict validation and metadata.
- `src/refresh.mjs`: exclusive runtime owner of external acquisition, fixed
  scheduled/forced plans, whole-job budget reservation and publication jobs.
- `src/refresh-schedule.mjs`: Asia/Shanghai 08:00/16:00 slots and strictly future
  event identities.
- `src/acquisition-pacer.mjs`: persisted weighted minute/hour admissions.
- `src/source-snapshots.mjs`: shared native-cell plans and bounded persistent
  full/forced inputs, with a local-only provider for the forecast engine.
- `src/published-forecasts.mjs`: atomic result publication and public reads or
  local computation from covered saved inputs, including age/expiry projection.
- `src/cache.mjs`: bounded atomic disk cache and request coalescing.
- `src/archive.mjs`: bounded forecast/source retention for observation pairing.
- `src/service.mjs`: input validation, shared section sampling and forecast
  calculation against its injected provider. Public runtime injection is local.
- `src/evaluation.mjs`: observed-label integrity, case selection and ranking metrics.
- `src/model-evidence.mjs` and `src/evidence/`: published historical evidence
  matched to its model version, generated from preserved study results.
- `src/forecast-assessment.mjs`: explicit visible-colour calibration status and
  layer/pressure-cloud support diagnostics; the cached service supplies saved
  same-event model comparisons with their own source/update identities.
- `src/server.mjs`: HTTP routing, static assets and process lifecycle.
- `web/`: Chinese interface projecting the API result.
- `scripts/`: public-source capture, MCP research, frozen historical comparison
  and offline verification commands.
- `research/`: public snapshots, source manifest and source-grounded findings.
- `var/`: local runtime cache and observations, excluded from version control.

The listed modules are implemented. The delivery record and verification
evidence retain their operational scope and scientific limits.

## Runtime policy

The location owns the IANA timezone; initial presets use `Asia/Shanghai`.
API event dates are civil `YYYY-MM-DD` values in that zone. Runtime instants,
provider series, cache expiry and capture timestamps use UTC ISO 8601 or epoch
seconds with explicit units. The service receives an injectable clock. Device
and process timezone settings have no role in event-day interpretation.

Only scheduled and key-authenticated refresh jobs obtain actual provider data.
Public forecast requests use saved results or saved input cells and have no
network provider. Cache misses remain local errors. Test fixtures have a fixed reference
date and remain in tests. Dependency failures produce an actionable error or
an explicitly aged cached result within its contract limit.

## Delivery

Node.js 20 or newer runs the service. A buildless web client keeps deployment
simple. Docker packages the same application. External requests use fixed
weather-provider origins, bounded timeouts and a declared request budget.
Scheduled acquisition starts at 08:00 and 16:00 Asia/Shanghai for the next three
occurrences of each event at the eleven presets and both models. The protected
refresh endpoint covers the next one of each event. Persist claims and weighted
quota reservations before effects; minute/hour admission bounds request pace.
Single-process refresh coordination coalesces matching target identities.
Source and result files use atomic replacement; a required source failure
preserves the old published generation. Full and forced source slots remain
separate. Custom queries require local grid coverage and never expand it.
Persistent local files use atomic replacement. The first delivery targets
personal use; public hosting is a separate deployment choice.
