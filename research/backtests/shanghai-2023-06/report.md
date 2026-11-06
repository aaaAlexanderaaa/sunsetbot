# Shanghai historical challenge

Model: section-optics-0.3.1. Selection and parameters were frozen before input retrieval.

First three observed-positive events, each matched to nearest available same-event observed-zero control; ties prefer earlier dates. Selection frozen before forecast retrieval.

Exploratory matched challenge using stitched short-lead forecast archives; fixed-lead predictive skill remains separate.

| Date | Event | Observed label | Model index | Cloud baseline | Original ERA5 prediction |
| --- | --- | --- | --- | --- | --- |
| 2023-06-02 | sunset | 基本不烧 | 0 | 4.56 | 基本不烧 |
| 2023-06-03 | sunset | 小到中烧 | 36.4 | 100 | 基本不烧 |
| 2023-06-08 | sunrise | 基本不烧 | 0.3 | 27.5 | 基本不烧 |
| 2023-06-08 | sunset | 基本不烧 | 46.3 | 96.55 | 微烧 |
| 2023-06-09 | sunrise | 中到大烧 | 41.9 | 100 | 小烧 |
| 2023-06-09 | sunset | 小到中烧 | 23.8 | 97.59 | 基本不烧 |

Model ranking: {"evaluatedCases":6,"missingScores":0,"positiveControlPairs":9,"correctlyOrderedPairs":6,"tiedPairs":0,"pairwiseAuc":0.6666666666666666,"ordinalSpearman":0.37032803990902063}

Baseline ranking: {"evaluatedCases":6,"missingScores":0,"positiveControlPairs":9,"correctlyOrderedPairs":9,"tiedPairs":0,"pairwiseAuc":1,"ordinalSpearman":0.892369614796338}

The cloud baseline is max(mid_cloud_percent,high_cloud_percent)*(1-low_cloud_percent/100) at the solar event instant. Source observation labels are the original curator's ordinal judgments. The request returned 20 labeled events over 2023-06-01 to 2023-06-10; later requested dates remain unknown. The balanced challenge supplies case-level error evidence; representative prevalence and overall forecast accuracy require a continuous held-out sample. Exact inputs and SHA-256 receipts are retained. Fixed-lead forecast evaluation requires run/lead-preserving archives.
