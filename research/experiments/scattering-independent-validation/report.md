# Independent directional-radiance calendar comparison

Candidate f25187812a6edeb5132eccf76ee9c118ff9f63277eb260eb21ce18de05732b58. Model, analysis policy and weather-only predictions precede source labels.

| Observable | Scored labelled cases | AUC | Spearman |
| --- | ---: | ---: | ---: |
| primary | 108 | 0.8718072289156626 | 0.54660323202903 |
| commonAltitudeHeuristic | 122 | 0.7465945512820513 | 0.41971820122081727 |
| nativeCloudBaseline | 122 | 0.7137419871794872 | 0.31962460444948054 |
| originalPeakHeuristic | 122 | 0.7433894230769231 | 0.3969605808902334 |

Paired primary comparison: {"difference":0.12457831325301205,"interval95":[0.04797355571353741,0.20166314223057644],"replicates":1000,"validReplicates":1000,"blockDays":3,"seed":20230901,"sampling":"paired circular moving blocks of whole calendar days","calendarDates":61,"pairedEvents":108}

Paired native-baseline comparison: {"difference":0.1901204819277108,"interval95":[0.10244676420864202,0.28625248870616826],"replicates":1000,"validReplicates":1000,"blockDays":3,"seed":20230901,"sampling":"paired circular moving blocks of whole calendar days","calendarDates":61,"pairedEvents":108}

Numerical ordering sensitivity: {"labelledEvents":122,"unlabelledEvents":0,"numericallyUnavailableEvents":14,"pairs":2496,"wins":1809,"losses":265,"numericalTies":1,"unavailablePairs":421,"tieAwareAuc":null,"allLabelledAucSensitivityRange":[0.7247596153846154,0.8938301282051282],"scope":"Intervals express retained numerical error estimates/control variation. Overlap is a numerical tie; missing numerical predictions retain fully unresolved ordering. Label error and statistical confidence have separate scopes."}

Calendar/evidence coverage: {"possibleCalendarEvents":122,"explicitLabels":122,"missingLabels":0,"numericalFailures":14,"linkedPositive":18,"sourceOnlyPositive":8,"sourceOnlyZero":96,"failedPredictionLabelGrades":[{"id":"2023-09-03-sunrise","observedGrade":0},{"id":"2023-09-06-sunrise","observedGrade":0},{"id":"2023-09-07-sunrise","observedGrade":0},{"id":"2023-09-08-sunrise","observedGrade":0},{"id":"2023-09-09-sunset","observedGrade":0},{"id":"2023-09-23-sunrise","observedGrade":0},{"id":"2023-09-24-sunrise","observedGrade":0},{"id":"2023-10-01-sunset","observedGrade":0},{"id":"2023-10-09-sunrise","observedGrade":2},{"id":"2023-10-11-sunrise","observedGrade":0},{"id":"2023-10-16-sunrise","observedGrade":0},{"id":"2023-10-19-sunset","observedGrade":0},{"id":"2023-10-21-sunrise","observedGrade":0},{"id":"2023-10-26-sunset","observedGrade":0}]}

Independent-date source-label ranking of a frozen relative-radiance model on retrospective ERA5/EAC4. Calendar missingness and numerical failures retained. Source-only zeros and linked URLs retain their own observation coverage; calibration and operational forecast lead have separate scope. Production remains section-optics-0.3.1.
