# Independent directional-radiance validation

Status: frozen candidate, prospective weather-only predictions in progress.
New-date source observations follow the complete prediction capture.

## Frozen identity

- Model: `directional-single-scatter-0.2.1`.
- Candidate: `f25187812a6edeb5132eccf76ee9c118ff9f63277eb260eb21ce18de05732b58`.
- Frozen at: `2026-11-08T02:39:04.998Z`.
- Physics/source identity: `4470c34660ede8d0abcde9e092513e5941052af0c01df9eccd6c982dc7099013`.
- [Immutable selection and policy](../../research/experiments/scattering-selection.json).
- [Source and analysis snapshot](../../research/model-snapshots/directional-single-scatter-0.2.1/manifest.json).

The source, assumptions, evaluation policy, analysis programs, numerical
results, weather manifest and old-model references are hashed together before
retrieving independent observations. Original production remains
`section-optics-0.3.1`, with its separate completed 164-event evidence.

## Numerical acceptance

All 24 jobs across six fixed coarse/dense media pass the registered RGB
error targets and independent source/angle/gas controls. The 432 raw/covered
channel comparisons use a 2% budget, with 0.1% for gas-step changes. Among
channels above the absolute-error floor, the largest source/angle change is
0.6658%; the largest gas-step change is 0.0003255%. The largest fraction of a
comparison's allowed budget is 0.333.

[The numerical capture](../../research/experiments/scattering-numerical-acceptance/summary.json)
preserves every result, input hash, option and per-channel comparison.
[The development record](directional-scattering-numerics.md) retains the
preceding failures, actual clear-gas mechanism and thirteen completed
independent Ask ChatGPT assessments. The real-medium envelope sweep checks
18,515 rays, including all three clear-attenuated source bounds. Seventy-two
Node tests and thirteen Python checks pass.

This establishes finite empirical numerical convergence under the declared
medium and controls. Positive-background subgrid peaks retain adaptive-
estimator scope. Physical optics, cloud reconstruction and observation
coverage have their separately stated limits.

## Independent calendar and observables

The calendar contains every Shanghai sunrise and sunset from 2023-09-01 through
2023-10-31: 61 days, 122 possible events. Selection uses calendar identity,
with no label- or score-based event sampling. All 122 ERA5/EAC4 weather bundles
at 37 pressure levels are preserved locally; their 399,672 field series pass
alignment, finite-value and cloud/AOD-range checks.

The primary observable is integrated normalized 680 nm cloud radiance at
g=0.85 and a common geometric Sun altitude of -0.833 degrees, within the fixed
Sun/antisolar viewing wedges. It is compared to the frozen eleven-level
heuristic at that same instant and to the native ERA5 cloud-layer baseline.
The original heuristic peak, phase scenarios and covered radiance are declared
secondary results. These are relative-radiance and structural comparisons;
the experiment has no fitted photographic quality transformation.

## Execution and missingness

`score_scattering_calendar.mjs` first stores weather-only predictions and
explicit numerical failures for all 122 identities. Two workers and a
900-second per-event wall budget bound computation. The candidate identity
owns restartable checkpoints. A complete prediction manifest precedes the
seven bounded public observation requests.

The evaluator retains missing observations, linked/source-only evidence and
failed numerical predictions separately. Paired comparisons mask both models
together while retaining all calendar days in the three-day-block bootstrap
(1,000 replicates, seed 20230901). Numeric error intervals produce explicit
ties; missing predictions keep their pair ordering unresolved. Top-20 alerts
are selected before label availability, with unknown selected outcomes kept
in sensitivity bounds. A synthetic end-to-end test independently checks these
counts and the expected AUC comparison without reading new-date labels.

Observation retrieval, completed ranking metrics and their interpretation
remain the next execution steps at this record's owner.
