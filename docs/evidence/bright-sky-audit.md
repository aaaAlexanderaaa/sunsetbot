---
doc_type: evidence
status: current
authority: evidence
last_reconciled: 2026-11-10
---

# Bright-sky and visible-colour audit

## Saved operational inputs

The [audit receipt](../../research/experiments/shanghai-sunset-2026-11-10/audit.json)
preserves source hashes, exact replay and controlled input changes for the
Shanghai preset's November 10 sunset. The two retained JSON bundles contain
the service's original normalized public-provider inputs and generated result.
Weather was fetched at 08:00:24 (GFS) and 08:03:29 (ECMWF), Asia/Shanghai;
model initialization times remain unavailable. The solar event is 17:00:43.

| Calculation | Index |
| --- | ---: |
| Retained GFS, exactly replayed | 4.5 |
| Retained ECMWF, exactly replayed | 57.8 |
| ECMWF with GFS pressure-cloud fractions | 4.6 |
| ECMWF with GFS geopotential heights | 57.8 |
| ECMWF with GFS aerosol | 57.8 |
| ECMWF with all GFS weather inputs | 4.5 |

Both saved indices and complete timelines replay exactly. The inputs share the
requested section sampling plan; individual variable/grid support retains the
provider's documented scope. Mixed-provider interventions isolate deterministic
score sensitivity and retain meteorological-consistency limits.

At the ECMWF peak the low-cloud layer aggregate is 44.806%, while sampled
1000/925/850 hPa cloud fractions are all zero. The local 200 hPa fraction is
29.158%, producing a reconstructed 11.48 km cloud base. A positive layer
aggregate with zero sampled low-level fractions exposes a support gap. Sparse
levels, different diagnostic definitions and input sources remain possible
explanations; a replacement cloud height or optical depth requires more data.
The actual atmosphere and observed viewing outcome have separate evidence.

Run the reproducible, local-only audit with:

```sh
node scripts/audit_saved_forecast.mjs research/experiments/shanghai-sunset-2026-11-10
```

## Physical and source interpretation

The current production score transforms expected direct transmission into a
brightness/warmth proxy. Its wavelength-independent cloud factor cancels from
the red/blue warmth ratio when the red denominator is above its numerical
floor. Cloud scattering into the viewing direction, diffuse sky illumination,
background contrast and perceptual colour are absent from that transformation.
This is a material structural explanation to investigate for bright-cloud false
alarms, alongside weather-input errors.

The [WMO cloud-colour account](https://cloudatlas.wmo.int/en/appearance-of-clouds-colour.html)
describes solar and sky illumination and high clouds remaining whitish near
sunset. Official [ECMWF](https://open-meteo.com/en/docs/ecmwf-api) and
[GFS](https://open-meteo.com/en/docs/gfs-api) documentation distinguishes
humidity-derived and native pressure cloud fields. Source downloads, URLs,
capture times and hashes are in [provider receipts](../../research/sources/bright-sky/manifest.json)
and [WMO receipts](../../research/sources/bright-sky/wmo/manifest.json).
The NOAA download failed with a TLS EOF and retains a failed receipt; the web
reader separately retrieved its cloud-colour explanation.

Two isolated Ask ChatGPT assessments received the actual source, known
interventions and changing task facts. The [first response](../../research/chatgpt/17-bright-sky-false-alarm.json)
prioritizes input disagreement and support diagnostics. Its returned markup
has a discontinuity after a proposed category rule. The
[second response](../../research/chatgpt/18-common-mode-bright-cloud-failure.json)
identifies common colour-model limitations even when both weather indices
agree, and prioritizes the frozen empirical evaluation and explicit product
scope. Model answers provide peer analysis; the saved code/data and primary
references establish their respective facts. Its mention of 108 source-only
zeros belongs to the earlier development record; the newly evaluated calendar
has 96 source-only zeros.

## Delivered assessment behavior

The public response preserves the engine index, label, model version,
generation identity and historical evidence. A separate assessment reports
visible-colour quality calibration as unavailable in every case, including
two equal moderate indices. The surface calls the value an experimental
cloud-illumination index. The time curve and peak window carry model-reference
semantics.

Saved results for the same location/date/event supply both model indices,
their source dates and update-batch identity. Different engine label categories
qualify observing advice. Missing or expired counterparts leave a valid selected
result readable, with explicit comparison status. Public reads perform no
external acquisition. A retained-input diagnostic requires matching forecast
ID, model version and weather-fetch time. A positive low-cloud layer aggregate
with all sampled low-level fractions zero adds an input-support note. Small
positive fractions and optional-data missingness retain their actual values.

All 94 Node checks pass, including actual HTTP comparison absence/recovery,
expiry, wrong-event isolation, batch differences, legacy retained inputs,
source identity and two-moderate-index calibration semantics. The actual saved
Shanghai pair also passed the HTTP path through a temporary local replay with
the clock fixed at November 10 15:00 Asia/Shanghai. Browser checks showed the
qualified headline, both source dates, low-cloud gap and unchanged 57.8 index.
390- and 1280-pixel document widths equal their viewport widths. The preview
tab and temporary service are closed after verification; the owner's stopped
Docker service retains its prior state. The implementation is verified locally.

## Scientific outcome and remaining owner

The previously frozen 122-event independent calendar now has complete public
source-label coverage. Its [physical result](scattering-independent-validation.md)
and [empirical result](quality-ranking.md) retain ranking, numerical failure,
top-20 selection and observation provenance. The empirical fit has an AUC change
of -0.00341 [-0.05181, 0.03766] against the old peak-index feature. The physical
candidate improves paired same-altitude ranking on 108 numerically available
events, with 14 numerical failures retained. Its top 20 contain 12 positive
source labels, compared with 11 for the old peak index. These outcomes preserve
the current production index and support further controlled colour/sky research.

Verified visible-colour quality, fewer bright-white false recommendations,
operational input transfer and the physical solver's numerical/compute coverage
remain at the [scientific plan](../plans/directional-scattering.md). A separate
firsthand observing record and unresolved reported-score/batch identity remain
in the ignored local diagnostic directory. That development observation has
its own location/view/time coverage and stays outside independent validation.
