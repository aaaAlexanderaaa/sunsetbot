# Frozen reanalysis input comparison

Model section-optics-0.3.1; 20 source-labelled events. The original GFS control replays exactly.

2x2 ERA5 pressure-profile and EAC4 AOD interventions, all other consumed inputs fixed to GFS control

| Event | Source grade | GFS + CAMS | ERA5 + CAMS | GFS + EAC4 | ERA5 + EAC4 | GFS cloud baseline | ERA5 cloud baseline |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2023-06-01-sunrise | 0 | 0.6 | 0 | 0.6 | 0 | 0 | 1.29 |
| 2023-06-01-sunset | 0 | 0 | 0 | 0 | 0 | 0 | 17.64 |
| 2023-06-02-sunrise | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 |
| 2023-06-02-sunset | 0 | 0 | 0 | 0 | 0 | 4.56 | 28.17 |
| 2023-06-03-sunrise | 0 | 0.7 | 0.9 | 0.6 | 0.8 | 72.61 | 76.39 |
| 2023-06-03-sunset | 3 | 36.4 | 2.4 | 37.3 | 2.7 | 100 | 80.71 |
| 2023-06-04-sunrise | 0 | 43.5 | 6.7 | 50.4 | 7.8 | 100 | 34.65 |
| 2023-06-04-sunset | 0 | 65.3 | 1 | 65.8 | 1 | 79.81 | 70.61 |
| 2023-06-05-sunrise | 0 | 57.2 | 23.5 | 61.2 | 27.8 | 0 | 77.79 |
| 2023-06-05-sunset | 0 | 2.1 | 0.4 | 1.4 | 0.1 | 17.21 | 19.71 |
| 2023-06-06-sunrise | 0 | 3.1 | 10.2 | 3.2 | 10.2 | 0 | 0.45 |
| 2023-06-06-sunset | 0 | 38.9 | 0 | 38.9 | 0 | 42.32 | 1.18 |
| 2023-06-07-sunrise | 0 | 18.3 | 11.4 | 18.1 | 11.9 | 86.01 | 49.25 |
| 2023-06-07-sunset | 0 | 0 | 0 | 0 | 0 | 0 | 98.60 |
| 2023-06-08-sunrise | 0 | 0.3 | 1.7 | 0.3 | 1.6 | 27.5 | 71.22 |
| 2023-06-08-sunset | 0 | 46.3 | 29.6 | 56.8 | 35.9 | 96.55 | 93.28 |
| 2023-06-09-sunrise | 4 | 41.9 | 38 | 41.2 | 38 | 100 | 83.52 |
| 2023-06-09-sunset | 3 | 23.8 | 0 | 28.6 | 0.1 | 97.59 | 30.02 |
| 2023-06-10-sunrise | 0 | 83.1 | 15.6 | 80.3 | 14.4 | 100 | 68.07 |
| 2023-06-10-sunset | 0 | 0 | 39.8 | 0 | 47 | 2.09 | 88.89 |

Ranking metrics: {"gfs_cams":{"evaluatedCases":20,"missingScores":0,"positiveControlPairs":51,"correctlyOrderedPairs":34,"tiedPairs":0,"pairwiseAuc":0.6666666666666666,"ordinalSpearman":0.21347337597995777},"era5_cams":{"evaluatedCases":20,"missingScores":0,"positiveControlPairs":51,"correctlyOrderedPairs":26,"tiedPairs":6,"pairwiseAuc":0.5686274509803921,"ordinalSpearman":0.11380056828305729},"gfs_eac4":{"evaluatedCases":20,"missingScores":0,"positiveControlPairs":51,"correctlyOrderedPairs":34,"tiedPairs":0,"pairwiseAuc":0.6666666666666666,"ordinalSpearman":0.2135549010453624},"era5_eac4":{"evaluatedCases":20,"missingScores":0,"positiveControlPairs":51,"correctlyOrderedPairs":32,"tiedPairs":1,"pairwiseAuc":0.6372549019607843,"ordinalSpearman":0.19453755167938713}}

GFS baseline: {"evaluatedCases":20,"missingScores":0,"positiveControlPairs":51,"correctlyOrderedPairs":45,"tiedPairs":4,"pairwiseAuc":0.9215686274509803,"ordinalSpearman":0.5326916207913593}

ERA5 baseline: {"evaluatedCases":20,"missingScores":0,"positiveControlPairs":51,"correctlyOrderedPairs":35,"tiedPairs":0,"pairwiseAuc":0.6862745098039216,"ordinalSpearman":0.24212826643591376}

## Pressure-field attribution

These auxiliary interventions hold the original CAMS aerosol and all other GFS fields fixed.

| Event | ERA5 cloud fraction only | ERA5 height only |
| --- | --- | --- |
| 2023-06-01-sunrise | 0 | 0.6 |
| 2023-06-01-sunset | 0 | 0 |
| 2023-06-02-sunrise | 0 | 0 |
| 2023-06-02-sunset | 0 | 0 |
| 2023-06-03-sunrise | 0.9 | 0.7 |
| 2023-06-03-sunset | 2.4 | 36.4 |
| 2023-06-04-sunrise | 6.7 | 43.6 |
| 2023-06-04-sunset | 1 | 65.3 |
| 2023-06-05-sunrise | 23.5 | 57.3 |
| 2023-06-05-sunset | 0.4 | 2.1 |
| 2023-06-06-sunrise | 10.2 | 3.1 |
| 2023-06-06-sunset | 0 | 38.9 |
| 2023-06-07-sunrise | 11.4 | 18.3 |
| 2023-06-07-sunset | 0 | 0 |
| 2023-06-08-sunrise | 1.7 | 0.3 |
| 2023-06-08-sunset | 29.6 | 46.3 |
| 2023-06-09-sunrise | 37.9 | 41.9 |
| 2023-06-09-sunset | 0 | 23.8 |
| 2023-06-10-sunrise | 15.5 | 83.2 |
| 2023-06-10-sunset | 39.8 | 0 |

Ablation rankings: {"era5CloudOnly":{"evaluatedCases":20,"missingScores":0,"positiveControlPairs":51,"correctlyOrderedPairs":26,"tiedPairs":6,"pairwiseAuc":0.5686274509803921,"ordinalSpearman":0.11380056828305729},"era5HeightOnly":{"evaluatedCases":20,"missingScores":0,"positiveControlPairs":51,"correctlyOrderedPairs":34,"tiedPairs":0,"pairwiseAuc":0.6666666666666666,"ordinalSpearman":0.21347337597995777}}

Frozen input intervention on the preserved curator-labelled June slice. GFS ancillary terrain/rain/visibility are held fixed. ERA5 water/ice are diagnostics. Fixed-lead forecasting, independent truth coverage and generalisation retain separate evaluation.

The cloud baseline is max(mid, high) * (1 - low/100), in percent. Each native layer baseline retains its own data source. Source pressure fields and AOD use nearest grid points; actual coordinates and source hashes are retained. All optical parameters remain frozen. Missing native ERA5 aggregate layers stay unavailable.
