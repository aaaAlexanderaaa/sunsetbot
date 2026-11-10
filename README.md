# Sunsetbot

An independent, self-hostable sunrise and sunset cloud-colour forecaster for
the Yangtze River Delta, starting with Shanghai. It uses actual Open-Meteo
GFS/ECMWF weather forecasts and CAMS aerosol data, with a spherical-Earth
illumination and viewing-path model.

## Scientific status

The current 0.3.1 index is a research diagnostic. A frozen six-event historical
challenge already found a severe false positive (Shanghai sunset 2023-06-08:
observed essentially no glow, index 46.3) and weaker ranking than a simple
cloud-layer baseline. The complete 20-event returned slice has ranking AUC 0.667 versus 0.922
for that baseline; it includes a labeled-zero sunrise given 83.1.
See the [continuous historical pilot](research/backtests/shanghai-2023-06-all/report.md).
The [completed ERA5/EAC4 comparison](docs/evidence/era5-input-comparison.md)
includes all twenty cases with both input factors: ERA5+EAC4 gives ranking AUC
0.637 versus 0.686 for the native ERA5 cloud-layer baseline. Dense diagnostic
profiles reveal omitted 225 hPa cloud. The [data-access guide](docs/reanalysis-access.md)
documents the working free official sources and reproducible acquisition.
The [independent 164-event calendar](docs/evidence/cloud-column-validation.md)
now gives original-model AUC 0.716 versus 0.660 for that baseline. Dense sampling
gives 0.727; the frozen dense/adjacent candidate gives 0.707. Their paired
change intervals span zero, so production retains the original engine.
Source-label evidence coverage, run/lead provenance and probability calibration
remain explicit in the report. Engineering replay and empirical prediction
skill retain their respective scope.

## Run

```sh
docker compose up -d --build
```

Open [Sunsetbot](http://127.0.0.1:8787). The Docker image uses the verified Docker
Official Images mirror on Amazon ECR with a pinned multi-platform digest.
Runtime cache, the daily request ledger and 180 unique forecast/source snapshots
persist in a named Docker volume.

For local Node development (Node 20.12 or newer):

```sh
npm ci
npm start
```

Run one of these service methods at a time on the default port. Set `PORT` to
use another port. `.env.example` documents optional configuration; copy it to
`.env` when needed. The Node service reads an existing `.env` on startup.

The free personal-use data tier requires no API key. Open-Meteo's current
[terms and pricing](https://open-meteo.com/en/pricing) govern usage. Optional
paid access uses `OPEN_METEO_API_KEY`. The default internal budget is 10,000
conservative location/variable-equivalent units per UTC day. The acquisition
worker admits at most 480 units per rolling minute and 4,800 per rolling hour.
It reserves each complete job before its first request and preserves that
debit after interruption. Forced jobs leave capacity for the remaining
scheduled runs in the same UTC budget day.
The free API's 10,000/day limit is shared with other clients using the same IP.

External data acquisition starts at **08:00 and 16:00 Asia/Shanghai**. Each
run computes the next three strictly future sunrises and sunsets at all eleven
presets with both weather models. Shared 0.25-degree weather cells and
0.4-degree aerosol cells are downloaded once per run. Representative plans
use about 6,900 conservative units per day; ordinary reads use zero units.
Acquisition and publication take several minutes under minute limits.

Forecast results and source snapshots persist in the Docker volume. Restart
catches up once to the latest missed slot. A claimed failed/interrupted slot
waits for the next slot or an authenticated forced refresh. The previous
generation stays available during work; results become explicitly stale after
their next scheduled update and expire at a weather age of 48 hours. Existing
retained forecasts are imported locally on the first upgrade.

If the host requires an HTTP proxy, the Node service honors standard
`http_proxy`, `https_proxy` and `no_proxy` variables. Docker uses the explicit
`SUNSETBOT_HTTP_PROXY` setting. For example, an existing macOS proxy can be
reached as `http://host.docker.internal:7890`. Keep credentials in local
environment/configuration and out of Git. The default bind address is loopback;
choose a reverse proxy and access policy when making a shared deployment.

## Use

Choose a location, date, sunrise/sunset and model, then get a forecast. The
interface presents the solar event, 0–100 experimental cloud-illumination index,
modeled viewing window, sunward/antisunward potential, a time curve and an
800 km atmospheric section. Reference-section samples are available in a table, and each
forecast can be downloaded as JSON. Dates are interpreted in `Asia/Shanghai`.

Visible-colour quality remains uncalibrated, including when GFS and ECMWF agree.
Saved same-event scores/source dates appear together; model-category disagreement
and missing low-cloud vertical support qualify the observing assessment.
The [saved-input audit](docs/evidence/bright-sky-audit.md) preserves exact replay,
cloud-input interventions and the separate completed 122-event research results.

The current engine samples three bearings × 14 positions and 11 common pressure
levels. It computes Earth shadow, cloud obstruction along illumination and viewing paths,
Rayleigh and aerosol extinction, and sensitivity to aerosol vertical scale
height and cloud overlap. Cloud fractions retain their occurrence meaning;
conditional cloud opacity and horizontal distance correlation are explicit
scenario assumptions. The index is an independently authored heuristic.
Its calibration status accompanies every result; field skill remains to be measured.

## API

```text
GET /healthz
GET /api/v1/locations
GET /api/v1/evaluation
GET /api/v1/forecast?city=shanghai&event=sunset&model=gfs
```

Omit `date` for the current Shanghai civil day. Dates from today through three
days ahead are supported. Models are `gfs` and `ecmwf`; events are `sunrise` and
`sunset`. Presets include Shanghai, Lingang, Suzhou, Hangzhou, Nanjing, Ningbo,
Wuxi, Jiaxing, Huzhou, Nantong and Zhoushan. Optional `lat`/`lon` accept WGS84
coordinates within 27–35° N, 116–125° E.
Custom locations require complete coverage in the already acquired sampled
cells. A read can perform local computation, and all reads are isolated from
external acquisition. Missing input returns `FORECAST_PENDING` or
`NO_LOCAL_COVERAGE`; expired output returns `FORECAST_EXPIRED`. The webpage
defaults to the next future event when a date was not explicitly selected.

The shared grid uses the provider elevation at each acquired grid position.
This is an input approximation compared with requesting a separate 90 m DEM
height for every section position; coastal and mountain differences remain
explicit in forecast uncertainty. The forecast engine and historical study
retain their original version and scope. Provider parameters are documented
in the [official API reference](https://open-meteo.com/en/docs).

```text
GET /api/v1/status
POST /api/v1/refresh      X-Refresh-Key: <server key>
GET /api/v1/status?job=<receipt job ID>
```

The owner-requested hardcoded key is `REFRESH_KEY` in
[`src/refresh.mjs`](src/refresh.mjs); it is server-only. For example:

```sh
curl -X POST http://127.0.0.1:8787/api/v1/refresh \
  -H 'X-Refresh-Key: <REFRESH_KEY from src/refresh.mjs>'
curl http://127.0.0.1:8787/api/v1/status
```

The protected endpoint updates the next one sunrise and one sunset strictly
after admission, for the fixed eleven presets and both models. Its HTTP 202
receipt identifies a background job and its status URL. Concurrent requests
join a running job that covers their event identities. A request crossing an
event boundary receives 409 when the running job has different targets.
The latest sixteen job receipts are retained. A missing/incorrect key returns
401, other refresh methods return 405, and insufficient reserved capacity
returns 503 before external requests. Public query parameters never enlarge
the acquisition plan.

Responses identify the location/date/model, source fetch times, data status,
model version and assumptions. `ready`, `partial`, `stale` and `no_event` are
explicit states. Invalid input returns 400; unavailable local input returns 503;
excess simultaneous distinct work returns 429. A provider rate limit opens a
cooldown circuit. Permitted stale data keep their original fetch time.
Fetch time and numerical-model initialization time have separate fields.
An all-zero curve has `peakTime:null`. Missing aerosol has a null aerosol-height
sensitivity range. Source resolution, cloud-overlap sensitivity and local
forecast/source retention status are also exposed.
Every forecast includes its matching retrospective evaluation summary. The
evaluation endpoint supplies ranking metrics, source-label coverage and the
independent-calendar representation decision without downloading weather data.
`generatedAt` and `leadTimeHours` retain the publication calculation's identity;
`timeUntilEventHours` and weather/aerosol ages describe the present read.
`cache` identifies the refresh, source snapshot and next scheduled update.

## Evidence and development

```sh
npm test
node scripts/replay.mjs gfs
node scripts/replay.mjs ecmwf
# Historical observation comparison; local replay uses preserved inputs:
node scripts/backtest.mjs
node scripts/backtest.mjs --all
# Frozen cloud-representation experiment and independent calendar:
node scripts/experiment-cloud-columns.mjs --dense
node scripts/validate_cloud_columns.mjs
# Earlier single-bearing source captures are also preserved:
node scripts/replay.mjs gfs --legacy
docker compose logs --tail=100 sunsetbot
```

The replay commands run entirely from preserved public Shanghai source bundles
at a fixed reference date. Their output distinguishes the captured model from
the current engine. [Research findings](research/README.md) link primary sources,
local archives, original formula images and the Ask ChatGPT MCP research result.
See [model details](docs/model.md), [architecture](ARCHITECTURE.md),
[behavior contract](docs/contracts/forecast.md) and
[verification](docs/evidence/verification.md).

## Remaining scientific work

Cloud liquid/ice content, phase-dependent optical properties, vertical
resolution, cross-section spacing, sideward cloud holes and sub-hour cloud
motion determine the next accuracy gains. Native GFS GRIB2 cloud-water/ice
fields and satellite nowcasting are possible data upgrades. The preserved
184-event development/validation calendar supplies source labels and reproducible
inputs. Independently covered ordinary and failed events, with known forecast
lead, are needed for field calibration. Each downloaded forecast already
preserves a reproducible identity and explanatory samples for that work.
