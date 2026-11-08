# Sunsetbot public-source research

Research date: 2026-11-06. Original pages, provider documentation and selected
image-only formulae are captured under `sources/`. Each capture group has a
manifest with URL, UTC capture time, HTTP result and SHA-256. The downloaded
material retains its original copyright and attribution and serves this local
research archive. Source HTML may reference additional remote images/styles;
the selected mathematical images are also preserved locally.

## What the original project does

The original author's [homepage](https://sunsetbot.top/) describes GFS/ECMWF
cloud forecasts with CAMS aerosol information, event selection, city search,
vividness, AOD, atmospheric sections, records and evaluation. Its quality factors
include duration, brightness/colour, cloud amount/phase/water, sky coverage,
cloud-base height and inter-cloud illumination/obstruction.
Local copy: [home](sources/original/home.html).

The original [about page](https://sunsetbot.top/about/) describes a personal
project growing from the author's forecast discussions since 2021, supported by
sponsorship for server/traffic costs. Local copy: [about](sources/original/about.html).
Its stated operating costs are project background; the specific cause of the
current data interruption remains unknown.

The most useful primary material is the author's **Quantitative Rosy-Cloud
Forecast Tutorial (Yangtze River Delta applicable)**:

| Primary source | Local source and reading copy | Useful content |
| --- | --- | --- |
| [Chapter 1](https://www.sunsetbot.top/halo/posts/2026/huo-shao-yun-yu-bao-jiao-cheng-zhang-jie-yi/) | [HTML](sources/tutorials/chapter-1.html), [text](sources/tutorials/chapter-1.txt) | spherical geometry, cloud boundaries, line of sight, spectral extinction |
| [Chapters 2–3](https://www.sunsetbot.top/halo/posts/2026/huo-shao-yun-yu-bao-jiao-cheng-zhang-jie-er-san/) | [HTML](sources/tutorials/chapters-2-3.html), [text](sources/tutorials/chapters-2-3.txt) | cloud observation, aerosols, numerical/satellite/radar sources |
| [Chapter 4](https://www.sunsetbot.top/halo/posts/2026/huo-shao-yun-yu-bao-jiao-cheng-zhang-jie-si/) | [HTML](sources/tutorials/chapter-4.html), [text](sources/tutorials/chapter-4.txt) | short-range and nowcast cases, moving boundaries, aerosol-height sensitivity |

The article text says first publication 2022-11-12 and latest modification
2025-04-01; the current blog wrapper marks publication 2026-01-31. These are
different timestamps. The tutorial recommends short-range interpretations
within roughly 36 hours and emphasizes actual satellite cloud boundaries for
the final one to two hours. Its local/regional empirical limits remain attached
to its examples.

The author's key geometry is the location of cloud boundaries relative to the
sun, cloud base, and Earth curvature. A cloud deck can receive warm light
through a distant clear region, while a closer deck can block the light or the
observer. AOD supplies a vertical integral; its vertical distribution remains
a consequential unknown. The original figures support exponential aerosol
profiles, a typical wavelength exponent of 1.2, and 550 nm sea-level molecular
extinction of 0.012/km. [Selected equations and palette](sources/formulas/manifest.json)
preserve those image-only details.

## Current original-site observation

On 2026-11-06 the homepage and tutorial were retrievable. The detailed endpoint
returned HTTP 200 with an application exception string. The public Shanghai
current-sunset queries for both GFS and EC returned an empty result state with
a message that the selected forecast time had no forecast. These are captured
in [the extended manifest](sources/extended/manifest.json) and its JSON/HTML files.
The exact cause and a formal maintenance/retirement announcement remain open.
The homepage footer's 2025-03-15 edit timestamp identifies page text, while
forecast freshness requires its own data observation.

## Data route selected

| Source | Available role | Important limit |
| --- | --- | --- |
| [Open-Meteo GFS](https://open-meteo.com/en/docs/gfs-api) | pressure-level cloud cover and geopotential height, weather conditions | cloud water/ice optical properties require additional native fields |
| [Open-Meteo ECMWF](https://open-meteo.com/en/docs/ecmwf-api) | independent weather-model input; IFS 0.25° pressure levels | pressure cloud diagnostic derives from humidity; 800 hPa and visibility were unavailable in actual selected-model responses |
| [Open-Meteo CAMS](https://open-meteo.com/en/docs/air-quality-api) | AOD550 along the entire sampled optical path | a column integral supplies limited aerosol-height information |
| [NOAA solar documentation](https://gml.noaa.gov/grad/solcalc/calcdetails.html) and [SunCalc](https://github.com/mourner/suncalc) | solar geometry and event calculation | atmospheric refraction and a finite solar disk remain approximations |

The implementation uses 11 common actual pressure levels and retains absent
optional visibility explicitly. Actual source bundles and derived responses
for both weather models are in [live/](live/source-manifest.json). Final
three-bearing results and exact inputs are indexed in the
[fan-source manifest](live/fan-forecasts/manifest.json). Numerical
weather fetch timestamps are preserved separately from unknown initialization
times. The provider's [pricing](https://open-meteo.com/en/pricing) currently
lists 10,000 free noncommercial calls/day and 300,000/month, with weighted
counting by location/variables. The application has its own smaller budget.

## Ask ChatGPT MCP

Thirteen completed self-contained, isolated assessments use the owner's configured
`ask_chatgpt` MCP and account model/thinking settings. The actual questions,
raw HTML/JSON responses and extracted reading copies are retained:

| Question | Evidence and result |
| --- | --- |
| [Original and model research](questions/01-original-and-model.txt) | [raw](chatgpt/01-original-and-model.json), [reading copy](chatgpt/01-original-and-model.md); public-source routes and input limitations; server reported 477 s thinking |
| [Implementation review](questions/02-engine-review.txt) | [raw](chatgpt/02-engine-review.json), [reading copy](chatgpt/02-engine-review.md); cloud fraction/opacity conflation, fixed geometry and missing-data output issues |
| [Revised-engine review](questions/03-revised-engine-review.txt) | [raw](chatgpt/03-revised-engine-review.json), [reading copy](chatgpt/03-revised-engine-review.md); incorrect target conditioning and cloud-base/opacity inconsistency |
| [Focused probability review](questions/04-probability-review.txt) | [raw](chatgpt/04-probability-review.json), [reading copy](chatgpt/04-probability-review.md); confirms the stated conditional Markov integral and exposed-base areas, identifies threshold-merging and shortened-path risks |
| [Historical validation review](questions/05-historical-validation.txt) | [raw](chatgpt/05-historical-validation.json), [reading copy](chatgpt/05-historical-validation.md); identifies cloud-target/scattering errors and a frozen historical evaluation route |
| [Reanalysis data access](questions/06-data-acquisition.txt) | [raw](chatgpt/06-data-acquisition.json), [reading copy](chatgpt/06-data-acquisition.md); recommends official regional CDS/ADS retrieval and concrete account steps |
| [Priority after complete ERA5/EAC4 replay](questions/08-model-priority-after-era5.txt) | [raw](chatgpt/08-model-priority-after-era5.json), [reading copy](chatgpt/08-model-priority-after-era5.md); prioritizes vertical representation, paired ablations and independent dates; server reported 222 s thinking |
| [Physics after independent-calendar validation](questions/09-next-physics-after-independent-validation.txt) | [raw](chatgpt/09-next-physics-after-independent-validation.json), [reading copy](chatgpt/09-next-physics-after-independent-validation.md); full frozen source and all 164 scores; prioritizes directional scattering and angular integration; server reported 332 s thinking |
| [Minimal directional-transfer design](questions/10-minimal-consistent-directional-transfer.txt) | [raw](chatgpt/10-minimal-consistent-directional-transfer.json), [reading copy](chatgpt/10-minimal-consistent-directional-transfer.md); fixed-U volume source, photon-direction phase convention and declared extruded medium |
| [Real-field numerical convergence](questions/11-real-cloud-numerical-convergence.txt) | [raw](chatgpt/11-real-cloud-numerical-convergence.json), [reading copy](chatgpt/11-real-cloud-numerical-convergence.md); optical-depth source variable, known support, angular adaptivity and independent controls |
| [Whole-angle zero-region bound](questions/12-angular-zero-region-bound.txt) | [raw](chatgpt/12-angular-zero-region-bound.json), [reading copy](chatgpt/12-angular-zero-region-bound.md); supports fixed-azimuth probability/geometry proof and identifies nested/RGB/outer-angle accounting gaps |
| [Finite numerical acceptance](questions/13-finite-numerical-acceptance.txt) | [raw](chatgpt/13-finite-numerical-acceptance.json), [reading copy](chatgpt/13-finite-numerical-acceptance.md); accepts a bounded empirical convergence design, with source partitions, real-medium envelope checks and numerical rank resolution |
| [Clear-gas angular envelope](questions/14-clear-gas-angular-envelope.txt) | [raw](chatgpt/14-clear-gas-angular-envelope.json), [reading copy](chatgpt/14-clear-gas-angular-envelope.md); supports per-source-cell gas-depth/arrival bounds; requires all AOD knots, cellwise summation and numerical-gas consistency |

The owner authorized relevant newly authored source for these assessments.
Every question includes the required implementation/context. Model answers are
independent judgments with the evidence scope supplied in that question.
The first call's tutorial-access gap was resolved by direct primary downloads.
The third reviewed 0.2.0; the consistent cloud-band boundary landed in 0.2.1,
and exact exposed-base conditioning with horizontal decorrelation in 0.3.0.
Version 0.3.1 preserves each distinct same-cell threshold and integrates the
viewing path fully to its cloud-base endpoint, addressing the fourth review.
The score transforms expected transmission nonlinearly; observation-based
aggregation and calibration remain separate scientific work.

Official materials added after review include local [GFS documentation](sources/validation/gfs.html),
[ECMWF overlap research](sources/validation/cloud-overlap.html), and
[WMO cloud-colour explanation](sources/validation/cloud-colour.html).
The latter two clarify physical overlap and illuminated cloud surfaces; the
implementation's 50 km horizontal correlation length remains its own scenario
assumption. A [same-name public repository](https://github.com/fengfengzhidao/sunsetbot)
describes a cloud-index notification service in its
[locally saved README](sources/clients/public-client-readme.md). That description
supports its messaging/deployment role. This application's independent engine
is grounded in the supplied primary tutorial and the actual source here.

## Evaluation route

The original site's [ERA5 reanalysis page](sources/original/reanalysis.html)
and historical records are useful methodological and case sources. An actual
forecast evaluation needs the forecast that existed at each lead time and
observations including uneventful/failed sunsets. Separate physics checks,
held-out ordinal-quality evaluation and probability calibration. The current
service supplies an experimental index; its live-operation evidence and future
field-skill evidence have separate status.

## Historical validation follow-up (2026-11-06)

The owner's question exposed the missing empirical step in the initial
implementation. Public observations were already accessible through the
original reanalysis UI and its documented query structure. The captured
[query response](sources/history/shanghai-2023-06-labels.json) requested June
2023 and returned 20 labels for June 1–10, with 3 observed-positive events and
17 labeled essentially no glow. Dates June 11–30 remain missing. Annual
calendar zeros are excluded as a truth source because their observation
coverage is ambiguous.

- [Frozen matched six-event challenge](backtests/shanghai-2023-06/report.md)
- [Complete returned-event pilot](backtests/shanghai-2023-06-all/report.md)
- [Source inputs and hashes](backtests/shanghai-2023-06-all/manifest.json)
- [Detailed interpretation](../docs/evidence/historical-validation.md)
- [Fifth Ask ChatGPT question](questions/05-historical-validation.txt),
  [raw answer](chatgpt/05-historical-validation.json),
  [reading copy](chatgpt/05-historical-validation.md)

The model stays at 0.3.1 with parameters frozen. Historical GFS pressure-level
fields and CAMS AOD are actually available for these dates. The 20-event model
ranking AUC is 0.667, compared with 0.922 for a prespecified cloud-layer
baseline; ordinal Spearman values are 0.213 and 0.533. The result supports
prioritizing model structure before relying on the numerical index. It has the
scope of this small curator-labeled June slice; negative-label observation
coverage still requires independent confirmation.

The [historical forecast documentation](sources/history/historical-forecast.html)
describes short-lead model runs stitched into a series. Fixed-lead and fixed-run
assessment use the separately preserved
[previous-runs](sources/history-methods/previous-runs.html) and
[single-runs](sources/history-methods/single-runs.html) routes with verified field
coverage. The present pilot has no known fixed lead and uses GFS rather than
ERA5. The official [ERA5 pressure-level catalogue](sources/history-copernicus/era5-pressure-levels.html)
and [CAMS EAC4 catalogue](sources/history-copernicus/cams-eac4.html) identify the
next native reanalysis route.

Original [map](sources/history-examples/2023-06-03-regional-map.jpg) and
[section](sources/history-examples/2023-06-03-shanghai-section.jpg) examples
illustrate the planar versus vertical geometry. The linked section's run header
says GFS 2025-05-01 20Z while its side panel says 2023-06-03. Its input provenance
therefore remains unresolved; it serves only as layout evidence in this study.

## Reanalysis access follow-up (2026-11-06)

The [data-access guide](../docs/reanalysis-access.md) selects free official CDS
ERA5 plus ADS CAMS EAC4, with exact regional request files and a resumable
downloader. ECMWF confirms one shared account/token across both stores;
each dataset's licence is accepted manually. A full first block has about
253 MB of regional raw ERA5 values, plus AOD, before packing.

An anonymous Google Research ARCO route was also verified against actual
[metadata](sources/reanalysis-access/arco-zmetadata.json), decoded coordinates
and a [cloud-object range receipt](reanalysis/arco-20230609T21Z-access-probe.json).
This store chunks each variable/hour globally; the first cloud chunk is
26.5 MB compressed. Slow actual local transfers led to a bounded access probe
and the official regional route as the bulk recommendation. Full numerical
cloud-array retrieval was bounded at the probe stage. Authenticated official
requests subsequently completed, as recorded below. The model remains frozen
at 0.3.1.

## Complete official input comparison (2026-11-07)

The configured official sources now work end to end. Exact ERA5/EAC4 regional
GRIB inputs, including native cloud water/ice, and ERA5 native low/mid/high
cover were retrieved. The [full four-way study](backtests/shanghai-era5-input-2023-06/report.md)
evaluates the same twenty events with unchanged parameters. Ranking AUC is
0.667 (GFS/original CAMS), 0.569 (ERA5/original CAMS), 0.667 (GFS/EAC4), and
0.637 (ERA5/EAC4); the native ERA5 simple baseline gives 0.686.
[Detailed evidence](../docs/evidence/era5-input-comparison.md) includes field
attribution and exact offline replay.

A [37-level diagnostic](reanalysis/vertical-resolution.json) reveals a 225 hPa
cloud band omitted by the eleven-level input representation in both an
observed-positive sunset and a source-labelled zero sunrise. The completed
[representation experiment](../docs/evidence/cloud-column-validation.md)
keeps optics fixed and specifies independent calendar dates before scoring.
Official current-IFS cloud concepts support the distinction between layer
cover integrated across model levels and pressure-level samples; the actual
ERA5 fields remain their own data evidence.

The [seventh question attempt](questions/07-era5-experiment-design.txt) returned
a [pre-dispatch compatibility error](chatgpt/07-era5-experiment-design.json).
The fresh eighth question completed with full local facts/code and the finished
experiment. The client now propagates MCP tool errors after preserving their
raw response, preventing a failed assessment from being counted as complete.

## Independent calendar validation (2026-11-07)

The exact 0.3.1 model source and a dense/adjacent research candidate were frozen
before retrieving the new-date labels. A same-source 2×2 experiment compares
11/37 pressure levels and cumulative/adjacent cloud-base discovery. The
twenty-event development block and all 164 events from June 11 through August
31 replay from public normalized inputs. Original-model ranking AUC is 0.716,
dense/cumulative 0.727, dense/adjacent 0.707, and native ERA5 layer baseline
0.660. Both primary candidate and density-only paired change intervals span
zero; the original production engine is retained.

[The detailed report](../docs/evidence/cloud-column-validation.md) records the
freeze, date-block statistics, raw input hashes and observation evidence.
Fifty-six source-positive events include 46 linked records; all 108 zero labels
have source-only evidence. A bounded public-link probe records guest pages
and an accessible photo post while retaining the need to verify capture time,
location and negative observation coverage. The ninth self-contained MCP
question supplies all scores, actual code and exact diagnostic profiles and
completed with 332 seconds of reported thinking. Its physical recommendations
are checked against the saved libRadtran, ECMWF ecRad and JMA primary sources.
The [next implementation plan](../docs/plans/directional-scattering.md) owns
directional scattering, angular integration and independent acceptance.

## Directional-source numerical work (2026-11-08)

The isolated research solver now integrates normalized directional cloud
radiance with a conditional optical-depth variable and adaptive solid-angle
quadrature. [The numerical record](../docs/evidence/directional-scattering-numerics.md)
retains initial large mesh differences, transitional failures and exact source
snapshots where available. A real-medium geometric envelope sweep passes
18,515 rays at coarse/dense pressure resolution. Full empirical acceptance
uses six fixed media and four independent controls; it precedes a new source
freeze and new-date observed labels.

All 122 weather-only Sep/Oct cases are preserved in
[normalized inputs](experiments/scattering-weather-inputs/manifest.json), with
five new official raw-data receipts and three reused regional/terrain files.
[The weather audit](experiments/scattering-weather-verification.json) checks
399,672 aligned finite field series. Labels remain unrequested during numerical
development. The local web/API/Docker continues to use the frozen 0.3.1 model
and its completed independent-calendar evidence.
