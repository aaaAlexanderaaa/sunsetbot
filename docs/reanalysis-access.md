# Historical reanalysis access

Investigated on 2026-11-06 after the owner requested actionable data-access
research through Ask ChatGPT. The selected bulk route is **CDS ERA5 pressure
levels plus ADS CAMS EAC4 AOD550**. Both datasets are freely accessible after
account registration and licence acceptance. The two portals share an ECMWF
account and personal access token; their API endpoints are distinct.
[ECMWF's shared-authentication instructions](https://confluence.ecmwf.int/spaces/DAC/pages/453683015/Using+the+ECMWF+data+store+-+ECDS)
and the official [CDS](https://cds.climate.copernicus.eu/how-to-api) /
[ADS](https://ads.atmosphere.copernicus.eu/how-to-api) setup pages establish
these steps. Local copies and hashes are under
`research/sources/reanalysis-access/`.

Follow-up completed on 2026-11-07: both official endpoints authenticated, all
regional ERA5/EAC4 inputs were downloaded, and the twenty-event four-way study
completed with exact offline replay. [Results and interpretation](evidence/era5-input-comparison.md)
retain the frozen model's limits. The steps below also document fresh-machine
setup; this workspace's account configuration is already complete.

## What the owner does

1. Open the [CDS setup page](https://cds.climate.copernicus.eu/how-to-api),
   register/login with an ECMWF account, and verify the email when requested.
2. With that account, open both the
   [ERA5 download form](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-pressure-levels?tab=download)
   and the [CAMS EAC4 download form](https://ads.atmosphere.copernicus.eu/datasets/cams-global-reanalysis-eac4?tab=download).
   Accept each dataset's licence at the bottom of its form. This acceptance is
   a manual portal action required by the publisher before API retrieval.
3. Copy the personal access token from the authenticated
   [API setup page](https://cds.climate.copernicus.eu/how-to-api). Save the
   following two-line configuration as `~/.cdsapirc`, replacing the placeholder:

   ```yaml
   url: https://cds.climate.copernicus.eu/api
   key: YOUR_PERSONAL_ACCESS_TOKEN
   ```

   Use local file permissions `chmod 600 ~/.cdsapirc`. The downloader reads
   this standard SDK configuration and supplies the same token to each fixed
   endpoint explicitly. `CDSAPI_KEY` or the hidden `--prompt-key` input also
   works. Configuration contains the token; public research receipts contain
   dataset identities, requests and data hashes.

These steps supply the account authorization. Field selection, UTC conversion,
request preparation, submission, resumption and data archiving are implemented
locally. Initial requests stay on the free datasets and the bounded region.

## Commands already prepared

The optional Python environment has been installed locally at
`var/reanalysis-venv`. Recreate it in a fresh checkout with:

```sh
cd /path/to/sunsetbot
python3 -m venv var/reanalysis-venv
var/reanalysis-venv/bin/python -m pip install -r requirements-reanalysis.txt
```

After the three account steps, the agent can run:

```sh
# Verify the same configured token against both endpoints, without a data job:
var/reanalysis-venv/bin/python scripts/fetch_reanalysis.py --check-auth
# Retrieve a fully bracketed Shanghai sunrise input acceptance case:
var/reanalysis-venv/bin/python scripts/fetch_reanalysis.py --fetch
# Retrieve the complete currently labelled 20-event block:
var/reanalysis-venv/bin/python scripts/fetch_reanalysis.py --fetch \
  --plan config/reanalysis/shanghai-20230601-10.json
```

Omit `--fetch` for a local dry run containing exact requests. The commands use
the fixed CDS/ADS origins, retain native GRIB, save a remote request ID before
waiting for a result, and resume that ID on rerun. Completed files have SHA-256
receipts and are checked before reuse. Raw official inputs and job state live
under ignored `var/reanalysis/official/`. An ambiguous submission failure can
still create a remote job before a local receipt is written; check the portal's
request list in that case. Dataset licence errors are resolved at the two forms.

## Selected data and measured cost

| Route | Verified fields/access | Role and cost |
| --- | --- | --- |
| [CDS ERA5 pressure levels](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-pressure-levels) | cloud fraction, cloud liquid/ice mixing ratios, temperature, geopotential; hourly, 0.25-degree requested grid | Main three-dimensional cloud archive. Free registration/licence, queued regional extraction. |
| [ADS CAMS EAC4](https://ads.atmosphere.copernicus.eu/datasets/cams-global-reanalysis-eac4) | `total_aerosol_optical_depth_550nm`; three-hourly, 0.75-degree, total-column dimensionless AOD | Main historical aerosol archive. Same account/token, separate licence and endpoint. |
| [Google Research ARCO ERA5](https://github.com/google-research/arco-era5) | All five cloud/thermodynamic fields occur in actual anonymous consolidated metadata; time/grid coordinates decoded successfully; cloud object returned HTTP 206 | Anonymous fallback and access probe. This store uses a global 37-level chunk per variable/hour: 153,659,520 decoded bytes. One actual cloud-fraction chunk is 26,486,167 compressed bytes. |

The cloud request area is `[38,110,26,132]` in north/west/south/east order.
The frozen engine uses 11 levels: 1000, 925, 850, 700, 600, 500, 400, 300, 250,
200, 150 hPa. The regular regional grid has 49 latitudes × 89 longitudes.
Liquid/ice values are grid-box mean mass mixing ratios (kg/kg); cloud fraction
is 0–1, temperature is K, and geopotential is m²/s². Cloudy-subcolumn optical
properties require an explicit later reconstruction from these means.

The acceptance case requests 2023-06-09 20/21/22 UTC ERA5 and bracketing EAC4
times around the 2023-06-10 Shanghai sunrise. Its ERA5 arrays contain about
2.88 MB of float32 values before transport compression. The full block requests
2023-05-31 through 2023-06-10 UTC, including the prior UTC day for the first
local sunrise. Its ERA5 arrays contain **253,286,880 bytes (253 MB decimal)**,
plus a small AOD grid. These are raw-value estimates; GRIB download size and
server wait depend on packing and service load. The catalogue's free-access
and licence information is preserved in the captured official catalogue pages.

The inspected anonymous cloud metadata is for Zarr format 2 despite the
store name's `-v3` dataset-version suffix. Its global chunks make small regional
reads expensive. Two bounded local transfer probes obtained about 13 and
17 kB/s on this network; a later cached 128 KiB read took 4.7 seconds. The
initial full cloud chunk was interrupted rather than continuing a long global
download. The recommended bulk route therefore uses server-side regional
extraction. No Google Cloud billing account was used for the anonymous probes.

## Evidence and verification scope

- [Self-contained MCP question](../research/questions/06-data-acquisition.txt),
  [raw reply](../research/chatgpt/06-data-acquisition.json), and
  [reading copy](../research/chatgpt/06-data-acquisition.md). The reply recommends
  the same official main route. Other mirror suggestions in that response
  remain leads; only routes verified above inform the selected implementation.
- [Actual mirror metadata](../research/sources/reanalysis-access/arco-zmetadata.json)
  and its capture receipt identify source fields, units, stable coverage and
  compression layout. The stable source coverage includes 2023.
- [Anonymous access receipt](../research/reanalysis/arco-20230609T21Z-access-probe.json)
  preserves URLs, decoded time index 1082037, coordinate checks, object ETags,
  generations and SHA-256 values. The archived 128 KiB cloud prefix establishes
  byte access; the coordinates NPZ contains decoded grid/time values. A complete
  numerical cloud subset was not produced during this access investigation.
- [Transfer measurements](../research/reanalysis/transfer-probes.json) preserve
  the completed range response and the explicitly partial timed-out response.
- Six offline checks verify official-form field choices, every five-minute
  frame's hourly/three-hourly brackets for all 20 preserved events, the sampled
  spatial extent, anonymous grid/object identity, rejection before an oversized
  body download, standard CDS credential resolution, and remote-job resumption
  plus file-integrity handling. Run:

  ```sh
  var/reanalysis-venv/bin/python -m unittest discover -s tests -p test_reanalysis_tools.py -v
  ```

Authenticated submission, official GRIB decoding, native-layer cloud baselines
and the frozen GFS/ERA5/EAC4 comparison have now completed. Python checks cover
actual GRIB reference values and input isolation; Node checks cover UTC alignment
when older control captures contain surplus hours. Full event bundles replay
without network access. The engine source and parameters remain frozen.
Native cloud-column representation and independent-date evaluation are the
next scientific stage in `docs/plans/cloud-column-representation.md`.

Additional native-layer baseline requests and a bounded 37-level diagnostic are
under `config/reanalysis/`. The same credential successfully retrieved the
single-level ERA5 dataset. To reproduce the completed studies from local raw
files:

```sh
var/reanalysis-venv/bin/python scripts/build_reanalysis_cases.py --require-baseline
node scripts/backtest-reanalysis.mjs --evaluate
node scripts/backtest-reanalysis.mjs
var/reanalysis-venv/bin/python scripts/diagnose_vertical_resolution.py
```

`--submit-only` queues each missing remote request and saves its ID before any
download wait. `scripts/complete_reanalysis_study.py` watches local download
receipts and completes a staged full study; it submits zero data requests.
