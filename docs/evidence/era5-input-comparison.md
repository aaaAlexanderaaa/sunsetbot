# Frozen ERA5 / EAC4 input comparison

Completed 2026-11-07. The owner-supplied Copernicus token was configured in the
private standard SDK configuration with mode 600. CDS and ADS authentication
and actual dataset retrieval succeeded. Public artifacts contain dataset
requests, downloaded values and hashes. Account tokens, personal profile data,
remote job identifiers and signed download links stay outside this archive.

## Prespecified experiment

Keep `section-optics-0.3.1`, its coefficients, 42 section points, solar geometry
and event windows frozen. Use the same 20 Shanghai curator-labelled events from
2023-06-01..10: three positive labels and seventeen source-labelled no-glow
events. The original stitched-GFS plus historical-CAMS control replays exactly.
The original records' observation coverage and precise camera locations retain
the uncertainty documented in the historical study.

The two input interventions replace (a) pressure-level cloud fractions and
geopotential heights with ERA5, and (b) AOD550 with CAMS EAC4. GFS terrain,
precipitation and visibility stay fixed. Native low/mid/high ERA5 cloud cover
provides a same-source simple baseline using the unchanged formula
`max(mid, high) * (1 - low/100)`. Water, ice and temperature are archived as
native diagnostics. The frozen engine consumes fraction and height.

## Complete results

| Input / score | Pairwise ranking AUC | Ordinal Spearman |
| --- | ---: | ---: |
| GFS + original CAMS, frozen model | 0.667 | 0.213 |
| ERA5 + original CAMS, frozen model | 0.569 | 0.114 |
| GFS + EAC4, frozen model | 0.667 | 0.214 |
| ERA5 + EAC4, frozen model | 0.637 | 0.195 |
| GFS native-layer simple baseline | 0.922 | 0.533 |
| ERA5 native-layer simple baseline | 0.686 | 0.242 |

Every row evaluates all twenty events with zero missing scores. There are 51
positive/negative pairs; tied scores count as half a correctly ordered pair.
Scores are the existing rounded model index, so changes near zero can change
ties. These are paired diagnostics on this short, already-inspected slice.
Fixed-lead operational skill and independent-date generalisation have separate
validation ownership.

The full [report](../../research/backtests/shanghai-era5-input-2023-06/report.md),
[summary](../../research/backtests/shanghai-era5-input-2023-06/summary.json),
and [manifest](../../research/backtests/shanghai-era5-input-2023-06/manifest.json)
contain exact case scores, observed grades, selected native grids, diagnostic
water/ice/temperature and input hashes. The independently completed
[pressure-only stage](../../research/backtests/shanghai-era5-cloud-2023-06/report.md)
holds original CAMS fixed; its ERA5 scores match the full study exactly.

For the source-labelled no-glow 2023-06-10 sunrise, GFS + original CAMS gives
83.1, ERA5 + original CAMS 15.6, GFS + EAC4 80.3, and ERA5 + EAC4 14.4.
For the observed-positive June 9 sunset, the ERA5 + EAC4 score is only 0.1.
The source-labelled zero June 10 sunset receives 47.0 with ERA5 + EAC4.
These paired failures keep cloud representation and illumination/scattering
structure as active development priorities.

## Input attribution

Auxiliary interventions change cloud fraction alone or height alone while
keeping the original CAMS and other GFS fields fixed. Across twenty events:

| Replacement | Median absolute score change | Maximum absolute change |
| --- | ---: | ---: |
| ERA5 cloud fraction alone | 7.0 | 67.6 |
| ERA5 height alone | 0.0 | 0.1 |
| EAC4 AOD with GFS pressure fields | 0.15 | 10.5 |
| EAC4 AOD with ERA5 pressure fields | 0.10 | 7.2 |

The fraction-only AUC is 0.569; the height-only AUC remains 0.667. This locates
the strongest frozen-index sensitivity in the cloud field and its representation.
It describes this model intervention, rather than establishing which atmosphere
or observation record best captures each real sky.

## Vertical sampling diagnostic

A separate bounded request retrieved all 37 ERA5 pressure levels at four hours
(740 GRIB fields, 5,561,680 downloaded bytes). Three nearest-hour cases were
inspected. Overlapping coarse pressure fields match the frozen inputs to
numerical precision. The engine and all preceding event scores stay frozen.

| Case / sampled UTC hour | Source grade | Local maximum across 11 levels | Local maximum across 37 levels | Dense peak |
| --- | ---: | ---: | ---: | --- |
| June 3 sunset / 11:00 | 3 | 12.50% | 56.25% | 225 hPa, 11.74 km |
| June 9 sunset / 11:00 | 3 | 22.66% | 22.66% | 700 hPa, 3.08 km |
| June 10 sunrise / June 9 21:00 | 0 | 13.28% | 68.75% | 225 hPa, 11.48 km |

The current 11-level set omits 225 hPa. At the June 3 positive snapshot its
entire sampled centre-column cloud fraction falls below the engine's 15%
target threshold, while the denser profile exposes a substantial thin-cloud
band. The June 10 negative snapshot also gains cloud information. A representation
repair therefore needs positive and negative controls plus the existing
illumination/visibility calculation. Native aggregate cloud cover is a different
vertical aggregation statistic from a sampled pressure-level maximum.

[Exact 37-level values](../../research/reanalysis/vertical-resolution.json)
retain the three full 37-by-42 sampled fields, native aggregate cover, grid
coordinates, source request and raw-file hash. The raw GRIB remains locally
under `var/reanalysis/vertical-diagnostic/`.

## Engineering verification and provenance

- 31 Node checks and 12 Python checks pass. Both completed studies replay
  exactly; 58 primary-source/sample receipts and every retained official raw
  file pass SHA-256 checks. The local web service reports healthy model 0.3.1.
  The [verification record](../../research/reanalysis/official-verification.json)
  retains counts, byte sizes and checks without credentials.
- Official pressure sample: 165 GRIB fields (five parameters × eleven levels ×
  three hours); EAC4 sample: six fields. The exact public GRIB samples and
  their receipts are in `research/sources/reanalysis-acceptance/`.
- Raw regional inputs are retained locally in `var/reanalysis/official/`.
  Study manifests retain the precise requests, source catalogue URLs, capture
  times, decoder version and raw-file hashes, with account-specific identifiers
  omitted. Reconstructed event bundles support entirely offline Node replay.
- The original model source hash is
  `f80a37d9a92cb2a421fda2599af9e336e2261d7b4a49980159a931be5e28e71f`.
  The new manifests additionally pin provider and package-lock dependencies and
  input-tool sources. Optical model files retain their original bytes.
- Unit conversion is explicit: cloud fraction ×100, geopotential /9.80665.
  GRIB scanning order is reconstructed by coordinates. Nearest-cell selection
  matches the documented provider selection policy, with actual grids retained.
- Early control captures have surplus days. Interventions select only hourly
  brackets of event ±40 minutes and align every held-fixed field by UTC time.
  Regression checks cover this mixed-length archive case, coordinate orientation,
  source units/reference values, ancillary-field identity, missing pressure fields,
  official-form choices, request resumption and source/file integrity.
- The full four-way continuation normalizes and scores in ignored staging,
  verifies exact offline replay and the pressure-only control, then promotes
  the complete directory. The resumed queue completed successfully.

Commands:

```sh
var/reanalysis-venv/bin/python scripts/build_reanalysis_cases.py --require-baseline
node scripts/backtest-reanalysis.mjs --evaluate
node scripts/backtest-reanalysis.mjs
var/reanalysis-venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/reanalysis-inputs.test.mjs
```

The seventh Ask ChatGPT attempt failed at webpage compatibility before dispatch;
its exact error is preserved. The eighth question supplied all twenty results,
native local fields and actual engine/geometry/overlap source, and completed
successfully. Its [reading copy](../../research/chatgpt/08-model-priority-after-era5.md)
prioritizes cloud-column representation, denser sampling and separated-layer
overlap before tuning optics. The concrete next experiment is owned by
`docs/plans/cloud-column-representation.md`.
