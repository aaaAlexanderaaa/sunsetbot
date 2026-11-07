---
doc_type: contract
status: current
authority: normative
implementation: implemented
verification_status: partial
last_reconciled: 2026-11-07
---

# Forecast behavior

## Outcome and authority

Users choose a Yangtze River Delta location, sunrise or sunset, a civil date,
and a numerical model. They receive the event time and bearing, an explanatory
cloud-colour index, a useful observing window, spatial cloud diagnostics,
aerosol provenance and explicit data/uncertainty status.

The owner's request establishes independent implementation and locally saved
public research. Shanghai-first regional scope was specified on 2026-11-06.
The implementer selects a self-hostable web/API architecture for the initial
delivery. Production hosting and paid accounts use the owner's resources when
selected.

## Model ownership and interpretation

The engine owns every coefficient, threshold, classification and derived
window, with a version and rationale. The index ranges from 0 to 100 and means
relative modeled viewing potential in the sampled vertical section. Calibration status accompanies the index.
GFS and ECMWF are selectable weather inputs. Their agreement is a sensitivity
signal when both are available.

Public source factors guide an independent physical heuristic: available cloud
area, solar geometry and Earth shadow, cloud obstruction on the illumination
and viewing paths, local precipitation/visibility and aerosol attenuation.
Cloud-base reconstruction from pressure-level fractions and effective cloud
optical depths are model assumptions, exposed in diagnostics. Full radiative-transfer or
original-engine equivalence requires additional vertical cloud observations.
Cloud fraction describes occurrence; conditional optical depth describes a
cloudy path. A horizontal distance-decaying correlation scenario supplies the central
result; fully correlated and independent-column scenarios expose sensitivity.
Vertical maximum overlap and exact exposed-base conditioning preserve the
input fractions.
Published retrospective evidence accompanies forecasts and is available at
`/api/v1/evaluation`, tied to its model version. It reports the source-label
calendar, data reconstruction, ranking metrics, observation coverage and
calibration scope. A different model version has unavailable evidence until
a matching study is published.
Three solar bearings cover the event's changing azimuth; visible cloud bases
extend to 300 km toward the Sun at elevations of at least 0.5 degrees.
An all-zero curve has no peak time. Absent aerosol has an unquantified bias and
an unavailable aerosol sensitivity range. Source cadence and preceding-hour
precipitation semantics accompany the derived five-minute curve.

## Interface and time

The API prefix is `/api/v1`. Coordinates are finite WGS84 decimal degrees within
latitude [27,35], longitude [116,125]. Event names are `sunrise` and `sunset`;
models are `gfs` and `ecmwf`. Dates are strictly valid ISO calendar dates in the
location zone, within the supported forecast horizon. Invalid requests receive
an HTTP 400 error with a stable code and a corrective message.

The backend owns event time, observing window, labels and explanations. UTC
instants retain their identity through display. Calendar date selection is
independent of host and browser timezone. Polar/absent events have an explicit
result state. Model data must cover the complete scored window.

## Data, cost and recovery

Weather requests target documented public provider origins. Requests have a
timeout and bounded concurrency. Cache reuse and in-flight coalescing bound
repeat effects. Local cache writes replace atomically, with bounded retention.
Provider throttling opens a circuit and surfaces a retry time. An upstream
failure uses a still-permitted cached result with its age, or returns HTTP 503.
Missing optional aerosol data is explicit and widens uncertainty. Missing
required cloud data stops scoring the affected forecast.

Local runtime records and optional observation reports belong under `var/`.
Retain up to 180 distinct forecast identities with exact provider inputs for
later observation pairing; report a retention failure while preserving output.
Keys, private user context and provider credentials stay outside source and
research snapshots. The service exposes its model/data versions and forecast
fetch timestamps for diagnosis. Original forecast run initialization time is
reported only when supplied by a source that establishes it.

## Acceptance evidence

Verify solar-event dates and bearings, midnight/foreign-zone cases, cloud-free
and obscured conditions, spatial obstruction sensitivity, aggregate-cloud
limits, optional-data absence, invalid input and upstream timeout/rate limiting.
Observe a live Shanghai forecast through the HTTP API and web interface. Check
readability, keyboard use, narrow and wide layouts, loading/error/recovery and
result identity after changing controls. Preserve data snapshots and test
conditions. Field skill is evaluated with dated forecast snapshots and held-out
observations; the shipped index is labeled experimental until that evidence
exists.
