---
doc_type: contract
status: current
authority: normative
implementation: implemented
verification_status: partial
last_reconciled: 2026-11-10
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
The viewing assessment identifies visible-colour quality calibration as
unavailable even when both model indices agree. The web surface names the
numeric diagnostic a modeled cloud-illumination index; a verified vividness
or visible-colour probability requires matching observational calibration.
Public results compare the same saved location/date/event across both models,
showing each score and source time. Different update batches remain explicit;
an absent or expired counterpart leaves the selected valid forecast available.
Different engine label categories or a positive low-cloud layer aggregate with
zero sampled low-level pressure cloud cover qualify the observing advice.
Layer aggregates retain their distinct support and supply no inferred cloud
height or replacement optical depth. Retained-input diagnostics require the
exact forecast identity and weather-source time. The original engine index,
label and retrospective evidence retain their definitions.

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
The horizon is today through three days ahead, exposing the complete next three
event occurrences even after today's event. Past events use retained outputs.

The backend owns event time, observing window, labels and explanations. UTC
instants retain their identity through display. Calendar date selection is
independent of host and browser timezone. Polar/absent events have an explicit
result state. Model data must cover the complete scored window.

## Data, cost and recovery

External acquisition is owned by scheduled and authenticated refresh work.
Daily 08:00/16:00 Asia/Shanghai runs start acquiring and computing the next three strictly future
sunrises and sunsets for the configured regional presets and both models.
Shared native weather/aerosol grid cells are retrieved once per refresh.
Normal forecast requests read published results or compute from covered local
source snapshots. Cache absence and expiry have explicit states; a public
request never initiates upstream acquisition. Custom-coordinate forecasts use
the coverage of the locally acquired cells.

`POST /api/v1/refresh` checks the hardcoded server-side `X-Refresh-Key` before
starting the next strictly future sunrise and sunset refresh for the same
configured locations and models. Active jobs coalesce. The response identifies
the background job and its status URL. Matching event identities coalesce;
cross-boundary targets receive an explicit 409 conflict. The last sixteen jobs
remain queryable. `GET /api/v1/status` reports progress and the next slot.
Persist each scheduled claim before external effects and catch up once to the
latest missed slot after startup. Failed/interrupted claims stay recorded.
Publish staged results atomically and preserve prior results on required
source failure. Full scheduled and forced-subset inputs retain separate slots.

Weather requests target documented public provider origins. Requests have a
timeout and bounded concurrency. Persist weighted minute/hour admissions and
a complete-job daily reservation before effects. Forced jobs preserve budget
for remaining scheduled runs in the same UTC day. Local cache writes replace
atomically, with bounded retention. Provider throttling opens a circuit and
surfaces a retry time. An upstream failure preserves the preceding published
results with their actual source age. A missed update marks results stale;
48-hour-old weather expires with HTTP 503. Snapshot absence and missing spatial
coverage have distinct 503 codes. Shared grid sampling uses the provider's
terrain height at the grid position and explicitly reports this approximation.
Missing optional aerosol data is explicit and widens uncertainty. Missing
required cloud data stops scoring the affected forecast.

Local runtime records and optional observation reports belong under `var/`.
Retain up to 180 distinct forecast identities with exact provider inputs for
later observation pairing; report a retention failure while preserving output.
Private user context and provider credentials stay outside source and research
snapshots. The owner explicitly selects a hardcoded server-only refresh key.
The service exposes its model/data versions and forecast
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
