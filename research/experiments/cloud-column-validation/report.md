# Independent calendar representation comparison

164 source-labelled events; candidate source frozen before label retrieval.

| Variant | Ranking AUC | Spearman | Top-20 source-label precision |
| --- | --- | --- | --- |
| coarse_cumulative | 0.716 | 0.373 | 0.700 |
| coarse_adjacent | 0.695 | 0.338 | 0.600 |
| dense_cumulative | 0.727 | 0.389 | 0.650 |
| dense_adjacent | 0.707 | 0.355 | 0.700 |

Native ERA5 layer baseline: {"evaluatedCases":164,"missingScores":0,"positiveControlPairs":6048,"correctlyOrderedPairs":3990,"tiedPairs":6,"pairwiseAuc":0.660218253968254,"ordinalSpearman":0.26876906804438977}

Prespecified primary paired comparison: {"difference":-0.009341931216931276,"interval95":[-0.04647687395337002,0.026202361100432333],"replicates":1000,"validReplicates":1000,"blockDays":3,"seed":20230611,"sampling":"paired circular moving blocks of whole calendar days"}

Secondary density-only comparison: {"difference":0.01099537037037035,"interval95":[-0.022783798615600006,0.04814685949287754],"replicates":1000,"validReplicates":1000,"blockDays":3,"seed":20230611,"sampling":"paired circular moving blocks of whole calendar days"}

Evidence coverage: {"sourceOnlyNegative":108,"linkedPositive":46,"sourceOnlyPositive":10}

Independent calendar source-label ranking. Negative observation coverage remains source-only; linked positive URLs retain their stated evidence scope. ERA5/EAC4 structural reconstruction with historical GFS local factors; fixed-lead forecast skill remains separate.
