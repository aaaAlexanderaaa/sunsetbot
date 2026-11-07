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
- `src/provider.mjs`: Open-Meteo requests, units, strict validation and metadata.
- `src/cache.mjs`: bounded atomic disk cache and request coalescing.
- `src/archive.mjs`: bounded forecast/source retention for observation pairing.
- `src/service.mjs`: input validation, orchestration and API result ownership.
- `src/evaluation.mjs`: observed-label integrity, case selection and ranking metrics.
- `src/model-evidence.mjs` and `src/evidence/`: published historical evidence
  matched to its model version, generated from preserved study results.
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

Live mode obtains actual provider data. Test fixtures have a fixed reference
date and remain in tests. Dependency failures produce an actionable error or
an explicitly aged cached result within its contract limit.

## Delivery

Node.js 20 or newer runs the service. A buildless web client keeps deployment
simple. Docker packages the same application. External requests use fixed
weather-provider origins, bounded timeouts and a declared request budget.
Persistent local files use atomic replacement. The first delivery targets
personal use; public hosting is a separate deployment choice.
