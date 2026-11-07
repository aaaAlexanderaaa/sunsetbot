# Cloud-column experiment and independent calendar validation

Completed 2026-11-07. The live engine remains `section-optics-0.3.1`. Its exact
source is preserved in `research/model-snapshots/section-optics-0.3.1/`; the
research factory and source identities make the four variants reproducible.

## Decision

Retain the original implementation for production. Increasing pressure-level
density has a small favorable point estimate; the prespecified dense/adjacent
candidate has a small unfavorable point estimate. Both paired uncertainty
intervals span zero. The independent calendar therefore supports continued
controlled investigation of scattering, overlap and sky aggregation, with the
representation variants retained as research comparators.

## Frozen design and data

The development block is Shanghai 2023-06-01..10: twenty source-labelled events,
three positive and seventeen zero. The independent calendar is
2023-06-11..08-31: 82 days, 164 events, 56 positive and 108 zero. All date windows
were specified before scoring. The dense/adjacent candidate source was frozen
at `2026-11-07T01:58:14.974Z`, before retrieving the new calendar labels.
Its [freeze record](../../research/experiments/cloud-column-selection.json)
remains the original historical record. The
[evaluation policy](../../research/experiments/validation-calendar/evaluation-policy.json)
was defined after label inventory and before candidate scoring.

The two factors are:

- Eleven original pressure levels versus all 37 ERA5 pressure levels, including
  225 hPa. Cloud fractions and geopotential heights come from the same ERA5
  files; overlapping coarse development values were checked for exact equality.
- Cumulative lower-column cloud-base eligibility versus adjacent-layer
  eligibility. The latter restores an upper base after a clear gap. It retains
  the original global vertical maximum-overlap transmission and exact target
  mask conditioning. Separated-layer vertical decorrelation remains a distinct
  physical factor.

All variants hold optics, 15% target threshold, solar geometry, three bearings,
fourteen distances, EAC4 AOD550 and score aggregation fixed. The development
bundles preserve their original ancillary fields. Validation uses native ERA5
low/mid/high cover, static ERA5 surface geopotential /9.80665 for terrain, and
single-city historical GFS precipitation/visibility for the observer's local
multiplier. A 102-value overlap check exactly reproduces the preceding
development event-frame ancillary factors. The historical GFS initialization
and lead time remain unknown.

The official validation downloads comprise eight regional GRIB files,
307,129,074 bytes, retained in `var/reanalysis/validation-data/`. The normalized
[164 input bundles and manifest](../../research/experiments/cloud-column-validation/manifest.json)
preserve the exact requests, native-grid coordinates, units, source hashes,
decoder identity, labels and evidence state. Decoding retains the 42 required
points per field to bound memory. A real-GRIB regression verifies equality with
full-grid sampling. The two dense development files total 32,816,592 bytes.

## Results

Positive means curator grade 1..5, zero means grade 0. AUC counts positive/zero
ordering with half credit for ties. The independent calendar has 6,048 such
pairs sharing 82 dates; whole-date resampling retains this dependence.
Top-20 precision uses the twenty highest indices, with source ID as a stable
tie-break. It is a fixed observation budget, rather than a calibrated alert
threshold.

| Variant | Development AUC, 20 events | Independent calendar AUC, 164 events | Ordinal Spearman | Positive labels in top 20 |
| --- | ---: | ---: | ---: | ---: |
| 11 levels, cumulative (original) | 0.637 | 0.716 | 0.373 | 14 |
| 11 levels, adjacent | 0.588 | 0.695 | 0.338 | 12 |
| 37 levels, cumulative | 0.745 | 0.727 | 0.389 | 13 |
| 37 levels, adjacent (primary candidate) | 0.686 | 0.707 | 0.355 | 14 |
| Native ERA5 layer baseline | 0.686 | 0.660 | 0.269 | 9 |

The native-layer baseline is `max(mid, high) * (1 - low/100)` at solar-event
time. The primary candidate minus original AUC is **−0.00934**, with a paired
95% block-bootstrap interval **[−0.04648, +0.02620]**. The prespecified secondary
density-only comparison is **+0.01100**, interval **[−0.02278, +0.04815]**.
Both use circular three-day blocks, 1,000 replicates and seed 20230611.

The original engine's AUC exceeds the simple baseline in this calendar. An
exploratory, post-scoring paired comparison gives difference +0.05622 and
interval [−0.02068, +0.13462]. The original site's published categorical output
has AUC 0.766 and Spearman 0.605 on the same source labels. That source-level
benchmark has its own input/time semantics and is retained as a descriptive
comparison. [Exploratory results](../../research/experiments/cloud-column-validation/exploratory-comparisons.json)
are separated from the prespecified primary decision.

## Observation evidence and coverage

The [nine exact source responses](../../research/sources/validation-calendar/manifest.json)
contain all 164 records. The broad original query previously returned only the
first twenty rows; bounded ten-day queries recover the later records.
Forty-six positive records link to Weibo, ten positive records and all 108
zero records provide curator labels alone. Those states remain explicit in
every bundle and statistic. Missing observed-negative coverage, camera
direction and capture time limit interpretation as field accuracy.

A [three-request evidence probe](../../research/sources/validation-evidence/manifest.json)
preserves two guest-interstitial responses and one accessible June 16 post.
The latter exposes a June 16 11:29 +08:00 publication time, a Shanghai
publication-location label and nine photo links. Publication metadata and a
photo count establish access; photo capture time, direction and glow assessment
still require their own verification. No record was upgraded to independently
verified observation status by this probe.

The calendar is temporally held out from model development, while the labels
remain original-curator evidence. ERA5/EAC4 retrospective reconstruction and
GFS ancillary factors establish structural behavior. Fixed-run, fixed-lead
operational forecast validation and probability calibration retain their own
evidence requirements.

## Verification and reproduction

All 164 four-variant scores and deterministic summary statistics replay from
the preserved bundles. The 20-event development controls replay exactly.
An independent rank-sum implementation agrees with all four validation AUCs.
Thirty-seven Node tests and thirteen Python tests pass, including actual HTTP
failure/recovery behavior and point-stream GRIB equivalence.

```sh
# Optional official SDK dependencies and credentials: docs/reanalysis-access.md
var/reanalysis-venv/bin/python scripts/fetch_reanalysis.py --fetch \
  --plan config/reanalysis/shanghai-validation-jja.json \
  --output var/reanalysis/validation-data
var/reanalysis-venv/bin/python scripts/build_validation_cases.py
# Already preserved public inputs support entirely offline replay:
node scripts/validate_cloud_columns.mjs
node scripts/experiment-cloud-columns.mjs --dense
node scripts/describe_validation.mjs
npm test
var/reanalysis-venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
var/reanalysis-venv/bin/python scripts/verify_cloud_study.py
```

The eighth completed independent assessment receives the full source, all 164 scores,
development results, exact example profiles and these evidence limits in a
self-contained [Ask ChatGPT question](../../research/questions/09-next-physics-after-independent-validation.txt).
It completed with 332 seconds of reported thinking and prioritizes directional
scattering radiance and angular integration. Its
[reading copy](../../research/chatgpt/09-next-physics-after-independent-validation.md)
qualifies the secondary-comparison terminology against the saved policy.
The follow-up implementation has an explicit
[owner plan](../plans/directional-scattering.md).

The Docker service now attaches the matching model evidence to forecasts and
serves it at `/api/v1/evaluation`. A generated compact artifact preserves the
original source and study-summary hashes. Model-version mismatch returns null;
a regression compares the artifact with actual engine bytes and the captured
summary. The Chinese forecast page renders the backend's evidence message.
The real HTTP service returned a Shanghai GFS forecast with this evidence and
successful retention. The existing user-owned browser tab was refreshed and
the summary was visually confirmed; its
[screenshot](../../research/experiments/cloud-column-validation/web-evidence.png)
is preserved. Docker remains healthy at loopback port 8787.
The [final artifact audit](../../research/experiments/cloud-column-verification.json)
checks 18 public-source receipts, six snapshot files, 184 normalized inputs,
ten regional raw files (339,945,666 bytes), calendar facts, four independent
rank-sum AUC calculations and a zero-match configured-credential scan.
