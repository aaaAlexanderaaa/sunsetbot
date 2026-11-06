---
doc_type: evidence
status: current
authority: evidence
last_reconciled: 2026-11-06
---

# Historical validation and map interpretation

## Finding

Frozen section-optics-0.3.1 ranks the original curator's 20 returned Shanghai
labels worse than a simple cloud-layer baseline. Model AUC is 0.667 (34 of 51
positive/zero pairs ordered correctly); baseline AUC is 0.922 (45 wins and four
ties). Ordinal Spearman is 0.213 versus 0.533. The highest model score is 83.1
for sunrise 2023-06-10, labeled essentially no glow. All three positive cases
have lower scores: 36.4 on June 3 sunset, 41.9 on June 9 sunrise and 23.8 on
June 9 sunset. Model parameters and sampling remain frozen; no thresholds were
fit to these outcomes. The page now describes the numerical index as a research
diagnostic and explicitly mentions the observed historical ranking failures.
The live Nanjing page was checked with that notice visible and no browser
console errors; the [saved interface](../../research/screenshots/historical-status.jpg)
records this interpretation change. Only agent-created QA tabs were closed.

## What was actually tested

The [complete report](../../research/backtests/shanghai-2023-06-all/report.md)
contains every returned event in the continuous June 1–10 slice: three positive
labels and 17 zero labels, both sunrise and sunset each day. The original
request covered June 1–30 but returned only that slice. Later dates retain
missingness. The six-event challenge was preselected before retrieval, then
expanded to all returned events after an observed-zero event scored above all
three positives. Input values, labels, frozen model identity and hashes are
preserved. Replaying both studies locally reproduces the captured scores.

Weather inputs are actual Open-Meteo archived GFS pressure profiles with CAMS
AOD, using the production three-bearing/14-position sampling and the same pure
engine. Historical Forecast stitches the initial hours of successive runs.
Initialization and fixed lead are unknown; this checks reconstruction using
those archived fields. ERA5/CAMS reanalysis would further isolate input-weather
error. A forecast made 24/48 hours ahead requires run/lead-preserving archives
with the full field inventory. Those meanings remain explicit.

The baseline, fixed before retrieval, is
`max(mid_cloud_percent,high_cloud_percent)*(1-low_cloud_percent/100)` at the
solar event instant. Both methods use the same local weather inputs. The
baseline and model indices have their own scales, so evaluation uses ordering
rather than a direct numerical score-to-label conversion.

## Truth and sampling limits

Labels are the original curator's published ordinal judgments, not an
independently audited observation network. Positive cases contain public case
links; zero-label cases have sparse observation metadata. Their coverage and
any imputation policy remain to be verified. Annual calendar zeros are unused.
The twenty events cover ten days with positives on only two dates; they bound
the statistical interpretation. Pair counts share events and are dependent.
AUC here describes ordering against this source's labels; broad forecast skill
requires a larger continuous held-out set and verified labeling coverage.

The original linked section image has conflicting time/model metadata (GFS
2025-05-01 20Z in its header and 2023-06-03 in the side panel). It is retained
as illustrative layout evidence. Its numerical fields are excluded from the
backtest inputs. The separately downloaded historical GFS/CAMS values have
explicit queried valid times and independent capture receipts.

## Original map versus section

The original map page describes regional planar quality maps for eastern,
northeastern, southwestern and northwestern China, the South China Sea and
Japan/Korea. It says the map is a supplementary final-quality product with
simplified computation for efficiency. The exact grid spacing and simplified
formula are unresolved in the available public material.

A reproducible implementation can load a shared three-dimensional weather
field (horizontal location, pressure/height, time), calculate solar illumination,
visibility and cloud/aerosol contributions for observer grid points around
their local solar events, aggregate cloud colour/brightness/visible area and
duration into an index field, then render that field in map coordinates.
This is an architectural derivation from the published factors; the original
implementation's details retain their own evidence scope. A city atmospheric
section instead extracts a distance-versus-height slice along the solar bearing.
A national batch should reuse gridded weather arrays and interpolation rather
than multiply independent external point queries by every output pixel.

The present service implements regional city queries and vertical diagnostics.
A national index field, batch compute/cache and planar renderer remain separate
implementation work. Its current 0–100 proxy is independently defined; the
original map uses its own approximately 0–2.5 quality scale.

## Priority after this evidence

The fifth independent MCP assessment inspected the actual engine and identified
cloud targets suppressed before oblique visibility testing, a brightness proxy
without an explicit cloud scattering source, distorted angular weights and
maximum-only temporal aggregation. Retain spherical geometry, double optical
paths, conditional occurrence and source retention. Use the exposed failures
for development and separate dates for judging revised cloud/radiance physics.
Parameter tuning alone is deferred until those structural assumptions are
compared against observations and the simple baseline.

The free CDS/ADS data catalogues provide the native ERA5 cloud/water/ice and
CAMS reanalysis route. This machine has no CDS/ECMWF credential configuration
or CDS client installed. The owner has been asked whether suitable access or
historical files already exist. That resource is for the next reanalysis stage;
the present 20-event open-API comparison is complete.

## Operational checks and resources

Thirty regressions cover the existing engine/service behavior and new label,
ranking, historical route and response-body interruption contracts. Both
historical replay modes match their saved numerical scores. Source hashes
cover all newly captured public documents, examples, labels and field probes.

The research ledger records 3,612 conservative units: 3,360 for 20 successful
GFS/CAMS event inputs plus two 126-unit interrupted weather requests. A
4,000-unit research envelope and 360-unit/minute pacing bound this work. New
weather requests select only the three or four hourly samples needed for the
80-minute event curve. This reduces archive transfer while preserving inputs.
A separate live-service budget remains unchanged. No throttling retries ran.
