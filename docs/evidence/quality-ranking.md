# Fast empirical quality-ranking study

Status: independently evaluated on 2026-11-10; all 122 predictions preceded
source-label access. The candidate remains offline research.

## Purpose and scope

The user wants useful cloud-colour forecasts. The fourteenth completed Ask
ChatGPT assessment receives the actual physical implementation, development
examples, runtime costs and observation coverage. It prioritizes a small
empirical model alongside the registered physical study. Its
[raw response](../../research/chatgpt/15-forecast-quality-target.json) and
[reading copy](../../research/chatgpt/15-forecast-quality-target.md) preserve
that independent judgment. Existing official provider documents establish
distinct input sources; operational GFS/ECMWF transfer remains its own work.

This secondary candidate targets the preserved public curator's positive
source labels. Source-only zeros keep their observation coverage. A fitted
sigmoid index has that weak-label scope. Verified photographic quality,
probability calibration and fixed-lead forecast skill require their respective
observations. The current production engine remains `section-optics-0.3.1`.

## Definition and freeze

- Model: `source-quality-rank-0.1.1`.
- Frozen at: `2026-11-08T03:22:04.074Z`.
- Candidate: `a8905ab1c091eb5a27a5477fb29f36a122fb3bdad02f6903fb92374d80c5368c`.
- [Policy](../../research/experiments/quality-rank-policy.json),
  [source/input/parameter receipt](../../research/experiments/quality-rank/model.json),
  [development features](../../research/experiments/quality-rank/development-features.json),
  [prospective predictions](../../research/experiments/quality-rank/predictions.json).

Two features feed a regularized logistic fit with an unpenalized intercept:

1. Frozen original eleven-level peak index over its five-minute event curve,
   with optional rain and visibility neutralized consistently, divided by 100.
2. Native ERA5 `max(mid, high) * (1 - low/100)` at geometric Sun altitude
   -0.833 degrees, divided by 100.

The existing 184 Shanghai Jun-through-Aug development events include 59 positive labels.
Jun 1 through Aug 7 supplies 136 training events; Aug 8 through Aug 31 supplies
48 inner validation events. The registered ridge grid is 0.001, 0.01, 0.1, 1.
Minimum validation mean log loss selects 0.01 (0.596154); refitting all 184
events produces parameters `[-1.5218036139512838, 1.2257039363381608,
0.7931579751588534]`. This inner selection is development work; the next
calendar owns independent evaluation.

The 122 independent events cover every Shanghai sunrise and sunset in Sep/Oct
2023. Their two features come from the previously saved weather-only reference
predictions. All 122 empirical predictions precede new-date source access.
The registered physical candidate and its analysis files remain unchanged.

## Evaluation and verification

After the physical study captures its complete prediction calendar and public
source observations, run `node scripts/evaluate_scattering_calendar.mjs` and
then `node scripts/evaluate_quality_rank.mjs`. The latter verifies frozen
source/input hashes, recomputes each empirical prediction from its registered
features, and checks that source capture follows its prediction timestamp.

The primary comparison is paired AUC change against the identical neutralized
peak-index feature; the native layer baseline is secondary. Three-day paired
calendar bootstrap uses 1,000 replicates and seed 20230901. The top-20 selection
precedes label availability, preserving missing-label sensitivity. This is an
additional exploratory secondary comparison registered after weather preparation
and before independent labels, with its own preserved source and policy.

All 76 Node tests pass, including the real HTTP path. New optimizer checks
cover the analytic constant-feature optimum, independent feature direction,
regularization shrinkage, stable extreme logits and explicit missing labels.
The live web/API and physical prediction batch retain their existing sources.

Before independent-label access, review identified a coverage/correlation issue
when missing labels reach the generic ranking helper. Version 0.1.1 explicitly
filters labelled rows for those metrics while keeping the complete calendar in
paired sampling and alert selection. The original 0.1.0 sources and captures
remain in [the superseded archive](../../research/experiments/quality-rank-0.1.0/superseded.json).
Features, fitted weights and the registered comparisons are unchanged. A real
script-path synthetic test checks 121 labels across 122 events and rejects
modified held-out features even when their fitted score is recomputed.

## Completed independent result (2026-11-10)

The [evaluation](../../research/experiments/quality-rank/evaluation.json) joins
all 122 unchanged predictions to the subsequently captured public labels.
There are 26 source-positive events and 96 source-only zeros, with no missing
source labels. The registered comparison gives:

| Model | AUC | Positive source labels among top 20 |
| --- | ---: | ---: |
| Frozen empirical ranker | 0.739984 | 10 |
| Original neutralized peak index | 0.743389 | 11 |
| Native ERA5 layer baseline | 0.713742 | 7 |

Empirical minus original AUC is -0.003405 with three-day-block paired 95%
interval [-0.051813, +0.037662]. Against the layer baseline the difference is
+0.026242 [-0.009303, +0.057784]. The candidate supplies no supported
independent improvement over the original index in this calendar, and the
top-20 comparison also favors retaining the original reference. The fitted
parameters stay frozen; this observed result supplies no retrospective tuning.

These are curator-source-label rankings with the stated negative-observation
coverage and ERA5/EAC4 retrospective inputs. Visible-colour probability,
bright-white false-alarm reduction and live GFS/ECMWF transfer retain their own
validation. The scientific next step follows the completed physical comparison
and explicit cloud/sky colour contrast, with independently covered outcomes.
