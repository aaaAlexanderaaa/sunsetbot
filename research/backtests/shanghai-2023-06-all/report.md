# Shanghai historical continuous pilot

Model: section-optics-0.3.1. Parameters are frozen across both studies.

All 20 returned labels across the continuous 2023-06-01..2023-06-10 block, including all same-day sunrise/sunset controls. Model parameters remain frozen after the initial challenge.

Continuous returned-event pilot using stitched short-lead forecast archives; fixed-lead predictive skill remains separate.

| Date | Event | Observed label | Model index | Cloud baseline | Original ERA5 prediction |
| --- | --- | --- | --- | --- | --- |
| 2023-06-01 | sunrise | 基本不烧 | 0.6 | 0 | 基本不烧 |
| 2023-06-01 | sunset | 基本不烧 | 0 | 0 | 基本不烧 |
| 2023-06-02 | sunrise | 基本不烧 | 0 | 0 | 基本不烧 |
| 2023-06-02 | sunset | 基本不烧 | 0 | 4.56 | 基本不烧 |
| 2023-06-03 | sunrise | 基本不烧 | 0.7 | 72.61 | 基本不烧 |
| 2023-06-03 | sunset | 小到中烧 | 36.4 | 100 | 基本不烧 |
| 2023-06-04 | sunrise | 基本不烧 | 43.5 | 100 | 基本不烧 |
| 2023-06-04 | sunset | 基本不烧 | 65.3 | 79.81 | 基本不烧 |
| 2023-06-05 | sunrise | 基本不烧 | 57.2 | 0 | 基本不烧 |
| 2023-06-05 | sunset | 基本不烧 | 2.1 | 17.21 | 基本不烧 |
| 2023-06-06 | sunrise | 基本不烧 | 3.1 | 0 | 基本不烧 |
| 2023-06-06 | sunset | 基本不烧 | 38.9 | 42.32 | 基本不烧 |
| 2023-06-07 | sunrise | 基本不烧 | 18.3 | 86.01 | 微烧 |
| 2023-06-07 | sunset | 基本不烧 | 0 | 0 | 基本不烧 |
| 2023-06-08 | sunrise | 基本不烧 | 0.3 | 27.5 | 基本不烧 |
| 2023-06-08 | sunset | 基本不烧 | 46.3 | 96.55 | 微烧 |
| 2023-06-09 | sunrise | 中到大烧 | 41.9 | 100 | 小烧 |
| 2023-06-09 | sunset | 小到中烧 | 23.8 | 97.59 | 基本不烧 |
| 2023-06-10 | sunrise | 基本不烧 | 83.1 | 100 | 微烧 |
| 2023-06-10 | sunset | 基本不烧 | 0 | 2.09 | 小烧 |

Model ranking: {"evaluatedCases":20,"missingScores":0,"positiveControlPairs":51,"correctlyOrderedPairs":34,"tiedPairs":0,"pairwiseAuc":0.6666666666666666,"ordinalSpearman":0.21347337597995777}

Baseline ranking: {"evaluatedCases":20,"missingScores":0,"positiveControlPairs":51,"correctlyOrderedPairs":45,"tiedPairs":4,"pairwiseAuc":0.9215686274509803,"ordinalSpearman":0.5326916207913593}

The cloud baseline is max(mid_cloud_percent,high_cloud_percent)*(1-low_cloud_percent/100) at the solar event instant. Source observation labels are the original curator's ordinal judgments. The request returned 20 labeled events over 2023-06-01 to 2023-06-10; later requested dates remain unknown. The initial balanced challenge supplies case-level error evidence, and the complete returned ten-day slice adds controls. General forecast accuracy requires a larger held-out continuous sample. Exact inputs and SHA-256 receipts are retained. Fixed-lead forecast evaluation requires run/lead-preserving archives.
