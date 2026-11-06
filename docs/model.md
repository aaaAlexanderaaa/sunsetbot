# Model: section-optics-0.3.1

The model estimates relative cloud-colour viewing potential using actual
weather forecasts and an independent optical approximation. The original
author's tutorials and official provider documentation are indexed in
[research](../research/README.md). The calibration status is experimental.

## Inputs and geometry

Pinned SunCalc 1.9.0 supplies event times and solar positions. The event's civil
day resolves in `Asia/Shanghai`. Fourteen columns extend from 150 km antisunward
to 800 km sunward, with denser spacing near the observer. Three bearings span
the azimuths at event ±40 minutes with an additional two-degree margin. Each
frame interpolates between its neighbouring bearings using the actual solar
azimuth. This is a rotating two-dimensional approximation of a sampled fan.

Eleven common pressure levels supply cloud cover and geopotential height.
GFS pressure cloud cover is a model field; ECMWF IFS 0.25° pressure cloud cover
is a humidity-derived provider diagnostic. Source differences affect model
comparisons. Open-Meteo supplies hourly series; the selected global GFS has
approximately hourly native data over this horizon, IFS 0.25° and CAMS Global
approximately three-hourly. CAMS has a 0.4° grid, weather a 0.25° grid. Five-minute
frames describe solar geometry on interpolated fields. Forecast initialization
time is unknown in these responses and remains null, separate from fetch time.

For arc distance x and height h, the Earth-centred point is
`p = ((R+h) sin(x/R), (R+h) cos(x/R))`, R=6371 km. Straight Cartesian rays are
tested against Earth shadow and coarse sampled terrain. Solar incidence and
observer sightlines are separate paths; their cloud pieces combine for joint
transmission under the selected overlap scenario. A 15% cloud-profile threshold
selects target bands; target bases coincide with their nearest-level opacity-band
boundaries. Targets extend to 300 km sunward and 150 km
antisunward, with a minimum apparent elevation of 0.5°. Cloud tops, side faces,
multiple scattering, refraction and small cloud holes require richer geometry.

## Occurrence and conditional opacity

Cloud fraction f describes occurrence area. Inside a cloudy cell the chosen
conditional extinction coefficients are 2/km below 3 km, 0.7/km at 3–8 km and
0.2/km above 8 km. These are independent scenario assumptions pending cloud
water/ice and optical-property data.

Each horizontal column and nearest pressure-level band has one occupancy
variable. A repeated ray integration step adds conditional optical depth to the
same cell, preserving cloud holes. Pieces with the same fraction share their
accumulated optical depth; distinct thresholds retain their occurrence events.
A single cloudy cell has expected transmission
`(1-f) + f * exp(-tau_cloudy)`; an opaque 10% cloud cell therefore transmits
approximately 90%, even along a long within-cell path.

Within each column, a common uniform occurrence variable U supplies vertical
maximum overlap. A newly exposed base face occupies the interval
`max(f_below) <= U < f_current`, with area equal to that interval's width.
A 20% lower layer beneath an 80% upper layer therefore produces a 20% low base
and a 60% exposed upper base. Conditioning integrates over that exact interval
without changing any original cloud fraction.

The central horizontal model is a stationary Markov chain. Neighbouring columns
at separation d share U with probability `r=exp(-d/50 km)` and independently
redraw U with probability `1-r`. The chosen 50 km correlation length is a
scenario assumption awaiting observations. Piecewise-constant quadrature over
all cloud fractions and target-interval endpoints evaluates the conditional
joint transmission exactly for this finite-cell probability model. Repeated
solar/viewing pieces of the same cell share occupancy and add optical depth.

The fully correlated (`r=1`) and independent-column (`r=0`) cases supply
sensitivity comparisons at the central model's reference time. These endpoints
and the central value form a scenario range. Vertical maximum overlap across
separated layers, horizontal correlation length, nearest-cell boundaries,
sparse vertical levels and the 15% target threshold remain material model
assumptions. Cloud-field displacement can still change the resulting ordering.

## Spectral proxy and index

Molecular extinction at 550 nm is 0.012/km, density scale height 8 km and
wavelength dependence `(550/lambda)^4`. Aerosol extinction is
`(AOD550/H) exp(-h/H) (550/lambda)^1.2`. The author's preserved formula images
support the molecular coefficient, exponential aerosol profile and typical
1.2 exponent. H=1.5 km is the central choice; 0.8 and 3 km form a sensitivity
comparison at the central reference time. Three wavelengths (680/550/440 nm)
supply a brightness/warmth proxy. Normalized RGB is a transmission diagnostic.

The spectral proxy transforms expected transmission after averaging; its
nonlinearity creates an aggregation bias to evaluate with observations.
The viewing path includes the full observer-to-cloud-base segment; the solar
path starts at that base without an artificial distance offset. Paths that
extend beyond sampled low-atmosphere columns carry `pathCoverage:extrapolated`
and an explicit boundary note.

Target fraction and angular section weights aggregate using
`100 * (1-exp(-5*integral))`, then local rain and visibility factors apply when
available. The gain, extinction coefficients and 15/40/65 label thresholds are
implementation heuristics requiring observation calibration. Directional
indices split the overhead cell evenly. Section indices depend on sampling.

## Time, missing data and interpretation

The curve spans event ±40 minutes in five-minute increments. The window is the
contiguous interval around the central peak exceeding `max(8, 0.6*peak)`; a
clipped boundary is explicit. A curve with all zero values has `peakTime:null`
and uses the event instant for its diagnostic section. An isolated qualifying
sample can produce a zero-duration window at the available sample resolution.

Precipitation uses the preceding-hour accumulated total for the containing
interval; it is held over that interval rather than linearly blending totals.
Missing rain or visibility leaves the optional factor at 1 and adds an explicit
note. Missing AOD uses zero at affected path samples, with unquantified bias
in score direction and magnitude. Its aerosol-height sensitivity is null.
Required cloud-profile gaps stop scoring. Fresh/partial/stale states and exact
source fetch times remain visible. Past events are labeled current-data
recalculations; lead times beyond 36 hours invite another short-range check.

Aerosol-height and cloud-overlap ranges evaluate assumptions at one reference
time. They describe separate sensitivities. Statistical confidence, overall
error coverage and forecast skill require paired observations.

## Retention and next validation

Runtime retains up to 180 unique forecast identities in `var/forecasts`, with
exact weather/CAMS payloads, sampled coordinates, bearing offsets, fetch times
and the first generated result. Unchanged source identities reuse their record.
Atomic writes and bounded pruning keep this independent of provider caching.
The API reports retention success or an actionable failure. Docker preserves it
in the same named data volume. These records support observation pairing;
retention of unknown model initialization time remains an explicit provenance
limit. Export important study periods before the rolling bound is reached.

Regression tests cover event/calendar geometry, Earth shadow, low-angle
remote clouds, conditional cloud transmission and overlap, missing inputs,
precipitation intervals, caching/cooldown and source retention. Captured public
GFS/ECMWF/CAMS bundles replay offline. The next skill study should include weak
and failed events, cloud-field spatial perturbations and a simple layered-cloud
baseline, with held-out dates grouped by season and forecast lead time.

## Historical findings and development priority (2026-11-06)

The frozen 0.3.1 engine has now been run against the original curator's actual
Shanghai observation labels using archived GFS profiles and CAMS AOD. The
initial six-event matched challenge preserves parameters, source hashes and
selection. It gives index 46.3 to an observed-zero sunset (2023-06-08), above
all three observed-positive events. Its pairwise ranking AUC is 0.667 against
1.0 for the prespecified cloud-layer baseline. This small matched sample
provides a concrete failure case; the continuous returned-event study also gives AUC 0.667 for the model
versus 0.922 for the baseline (3 positive and 17 zero labels). Its highest
index, 83.1, occurs on a labeled-zero sunrise on 2023-06-10.

The scientific assessment identifies priority hypotheses: target generation
suppresses upper cloud bases using overhead vertical overlap before testing
oblique visibility; the brightness proxy has transmission without an explicit
cloud scattering source term; angular-area quadrature and maximum-only time
aggregation can distort quality ordering. These are model-structure questions.
Future revisions should be developed on these diagnostic cases and judged on
separate held-out dates, before tuning extinction coefficients or thresholds.

Historical Forecast archives stitch short-lead model output. The current study
evaluates reconstruction using those fields, with unknown initialization and
fixed lead. ERA5 cloud/water/ice plus CAMS reanalysis can isolate the weather
input error further; run/lead-preserving archives support prospective forecast
skill evaluation. Source labels, missing dates and original-image provenance
retain their limits in the historical evidence record.
