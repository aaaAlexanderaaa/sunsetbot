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
Engineering regression/replay and empirical prediction skill retain separate
evidence. Cloud-target reconstruction and cloud scattering require priority
review before relying on the numerical index for outings.

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
paid access uses `OPEN_METEO_API_KEY`. The default internal budget is 1,500
conservative location/variable-equivalent units per UTC day, with one-hour
weather caching, three-hour aerosol caching and coalesced repeated requests.
The free API's 10,000/day limit is shared with other clients using the same IP.

If the host requires an HTTP proxy, the Node service honors standard
`http_proxy`, `https_proxy` and `no_proxy` variables. Docker uses the explicit
`SUNSETBOT_HTTP_PROXY` setting. For example, an existing macOS proxy can be
reached as `http://host.docker.internal:7890`. Keep credentials in local
environment/configuration and out of Git. The default bind address is loopback;
choose a reverse proxy and access policy when making a shared deployment.

## Use

Choose a location, date, sunrise/sunset and model, then get a forecast. The
interface presents the solar event, 0–100 experimental viewing-potential index,
modeled viewing window, sunward/antisunward potential, a time curve and an
800 km atmospheric section. Reference-section samples are available in a table, and each
forecast can be downloaded as JSON. Dates are interpreted in `Asia/Shanghai`.

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
GET /api/v1/forecast?city=shanghai&event=sunset&model=gfs
```

Omit `date` for the current Shanghai civil day. Dates from today through two
days ahead are supported. Models are `gfs` and `ecmwf`; events are `sunrise` and
`sunset`. Presets include Shanghai, Lingang, Suzhou, Hangzhou, Nanjing, Ningbo,
Wuxi, Jiaxing, Huzhou, Nantong and Zhoushan. Optional `lat`/`lon` accept WGS84
coordinates within 27–35° N, 116–125° E.

Responses identify the location/date/model, source fetch times, data status,
model version and assumptions. `ready`, `partial`, `stale` and `no_event` are
explicit states. Invalid input returns 400; upstream failure returns 503;
excess simultaneous distinct work returns 429. A provider rate limit opens a
cooldown circuit. Permitted stale data keep their original fetch time.
Fetch time and numerical-model initialization time have separate fields.
An all-zero curve has `peakTime:null`. Missing aerosol has a null aerosol-height
sensitivity range. Source resolution, cloud-overlap sensitivity and local
forecast/source retention status are also exposed.

## Evidence and development

```sh
npm test
node scripts/replay.mjs gfs
node scripts/replay.mjs ecmwf
# Historical observation comparison; local replay uses preserved inputs:
node scripts/backtest.mjs
node scripts/backtest.mjs --all
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
fields and satellite nowcasting are the next data upgrades. A dated observation
set including ordinary and failed sunsets is needed for calibration and held-out
evaluation. Each downloaded forecast already preserves a reproducible identity
and explanatory samples for that work.
