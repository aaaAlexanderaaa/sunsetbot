---
doc_type: plan
status: active
authority: planning
last_reconciled: 2026-11-07
---

# Cloud-column representation experiment

The completed frozen ERA5/EAC4 comparison and seventh completed independent
Ask ChatGPT assessment prioritize representation. Preserve 0.3.1 and its exact
replay. First investigate pressure resolution and premature upper-cloud target
deletion with a same-source 2x2 experiment: original 11 versus dense ERA5
pressure levels, and cumulative-column versus adjacent-layer cloud-base
discovery. Keep AOD, geometry, optical coefficients, 15% target threshold and
score aggregation fixed. A separate threshold-only ablation may diagnose that
gate after the primary comparison is preserved.

Use an immutable snapshot of the current model and an isolated experimental
runner so the historical control and local web service retain their behavior.
The initial candidate changes local cloud-base eligibility while retaining the
existing explicitly declared vertical maximum-overlap transmission scenario.
Separated-layer overlap is a distinct subsequent factor; it needs consistent
target conditioning and path probabilities. Keep that physical assumption
visible rather than treating cloud-target repair as a complete overlap model.

Mechanism checks: a clear gap between lower and upper clouds restores upper
target eligibility; decreasing cover creates no extra base; increasing cover
preserves exact exposed fractions; below-threshold cloud remains an occluder;
terrain and same-cell conditioning retain their semantics. Shared clear/opaque
and single-layer controls should retain their expected behavior.

The full 37-level diagnostic already found omitted 225 hPa cloud in a positive
and a negative case. Acquire only required hourly brackets for the development
cases, preserve unchanged coarse overlaps, then evaluate all four variants on
the existing twenty diagnostic events. Report paired scores and native-layer
baselines; choose a candidate on its declared mechanism and freeze its source
before new-date scoring.

Prespecify 2023-06-11..2023-08-31 (82 days, 164 possible sunrise/sunset events)
as the next independent calendar block, following the independent review.
Investigate original-site date windows/pagination and observation evidence.
Preserve missing labels, source-only negative labels and photo/location coverage;
credible observed negatives and unobserved default zeros need separate states.
Candidate scoring on that block follows source freeze. Use date-paired AUC
changes and date-block bootstrap, fixed observation/alert budgets, and enough
credible positive cases to interpret the result. A live forecasting claim also
requires run/lead-preserving inputs. Production promotion follows review of the
concrete validation result.
