---
doc_type: evidence
status: current
authority: evidence
last_reconciled: 2026-11-06
---

# Verification record

## Outcome and environment

The operational first delivery provides a self-hosted Chinese web interface,
versioned forecast API and Docker runtime for the Yangtze River Delta. It uses
actual GFS/ECMWF/CAMS inputs with independent model section-optics-0.3.1.
Field skill remains experimental, with a distinct observation/calibration path.

Checks ran on macOS with Node 20.18.1 and Docker/OrbStack. The container uses
Node 22.23.4, an unprivileged user, persistent runtime storage and the pinned
Docker Official Images multi-platform base digest in Dockerfile.

## Observed results

| Claim | Evidence | Result |
| --- | --- | --- |
| Physical and service invariants | `npm test`: 25 tests passed, 0 failed | Passed |
| Actual Shanghai source chain | final GFS and IFS 0.25° HTTP 200, `ready`, 42 points × 11 pressure levels, CAMS AOD, retention saved | Passed |
| Final-version reproducibility | both default offline replay commands return `matchesCapturedScore:true` | Passed |
| Docker runtime | compose build/up, health, static assets and API through 127.0.0.1:8787 | Passed |
| Input/result identity | changing model hides old output; submitting updates model and forecast identity | Passed |
| Keyboard interaction | arrow key advances the curve slider and visible time/score | Passed |
| Invalid coordinates | latitude 99 triggers native validation with the prior result hidden | Passed |
| Responsive layout | 390/768/1280 CSS px checks; final 390 px document width remains 390; chart text stays 10 CSS px | Passed |
| Section inspection | 154 interpolated reference rows (14 positions × 11 levels); source fan contains 42 actual requested positions | Passed |
| Missing optional data and zero curve | separate temporary 8788 fixture HTTP service shows partial AOD, unavailable aerosol sensitivity, absent peak and event-time section | Passed |
| Real interruption/recovery | stopped/restarted Docker with retained volume; actionable Chinese connection error, enabled retry, recovered same source identity | Passed |
| JSON export | browser saved valid forecast JSON; parsed model/location/ID and column count match displayed response | Passed |
| Independent assessment | four isolated Ask ChatGPT MCP research/review calls completed; material findings corrected and regression checked | Completed |
| Source preservation | 40 capture receipts, 35 HTTP 200 documents/images; SHA-256 checks match all successful source files | Passed |

The interruption/export trials used the 0.1.1 baseline; those handlers remain
unchanged. Missing-data/zero-curve browser trials used 0.2.1 with an explicitly
separate synthetic fixture server, which was then stopped. Final 0.3.1 browser
checks verify the real index, prominent scenario range, source timestamps,
model reference time, past-event notice and responsive layout. Screenshots:
[desktop](../../research/screenshots/desktop.jpg),
[mobile](../../research/screenshots/mobile.jpg). Browser QA tabs are closed.

## Reproducible live material

- [Final GFS response](../../research/live/fan-shanghai-gfs.json)
- [Final ECMWF response](../../research/live/fan-shanghai-ecmwf.json)
- [Exact fan inputs and preserved-version manifest](../../research/live/fan-forecasts/manifest.json)
- [Earlier single-bearing bundles](../../research/live/source-manifest.json)
- [Public research and independent review](../../research/README.md)

The final Shanghai responses use weather fetched at 17:29 local time on
2026-11-06 and an event at about 17:03. They are explicitly labeled as
current-data recalculations of an elapsed event. These samples establish
operation/replay. Prospective skill studies must select forecasts captured
before their event, preserve lead time and pair them with observations.

## Review findings and corrections

The second review identified cloud fraction/opacity conflation, fixed bearing,
low-angle exclusion, precipitation interpolation and misleading absent-data
outputs. The revision separates occurrence/conditional extinction, samples a
three-bearing rotating fan, includes targets at 0.5° elevation up to 300 km
sunward, preserves precipitation intervals and handles absent AOD/zero peaks.

The third review identified target-probability conditioning and mismatched
cloud-base/opacity geometry. The final model uses band-aligned base faces with
exact exposed-area intervals and a horizontally decorrelating occurrence model.
The fourth review confirms that the conditional Markov quadrature matches its
stated probability model. Distinct same-cell thresholds are now preserved and
viewing extinction includes the complete observer-to-cloud-base segment.
Regression cases include the analytical 20% target/50% remote blocker and
20% low/80% upper-cloud exposure, plus exact single-cell variable thresholds
and the integrated molecular extinction to an overhead base.

Aerosol height, cloud overlap and nonlinear aggregation remain model
sensitivities, described beside the result and in [model details](../model.md).
These checks establish the stated mathematics and technical behavior. They
supply a foundation for subsequent empirical forecast evaluation.

## Environment resolutions and resource use

Actual IFS responses lack 800 hPa data and visibility; the common profile uses
11 available levels and keeps optional visibility absent. The environment's
existing HTTP proxy resolved direct weather-network failure. Docker reaches it
through host.docker.internal in ignored local environment state. Docker Hub
metadata returned EOF; the verified official-image ECR mirror succeeded.

The host ledger reserved 224 conservative units, the Docker ledger 350 (56
initial plus 294 for two three-bearing models with shared aerosol data), and
about 10 targeted probe units were used outside those ledgers: approximately
584 total, within the expanded 800-unit evaluation envelope. Final engine/UI
checks reuse those provider caches. There were four substantive MCP calls.

## Delivery boundary

The operational delivery and named regression behaviors are verified. Actual
prediction skill requires dated observations including ordinary and failed
sunsets, a simple cloud-layer baseline and held-out evaluation. Native cloud
water/ice, cloud optical properties, vertical overlap, sideward cloud geometry,
sub-hour evolution and aerosol-height distribution remain scientific work.
Source HTML retains some remote assets; key equations and reading text are
saved locally. The original site's specific maintenance cause remains open.
