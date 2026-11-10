---
doc_type: plan
status: complete
authority: planning
last_reconciled: 2026-11-06
---

# Independent Sunsetbot implementation

## Cold-start summary

Build an operational, self-hostable cloud-colour forecaster for the Yangtze
River Delta, starting with Shanghai. Preserve public source documents locally,
use the owner's Ask ChatGPT MCP for substantive research when reachable, and
derive forecasts from weather data through an independent engine.

## Complete end state

Source archive and findings; documented engine assumptions; actual weather
provider integration; versioned API; Chinese web client with event/model/date
selection and spatial diagnostics; reproducible startup/Docker; relevant tests,
live verification and explicit calibration limits.

## Delivery state

The self-hosted web/API/Docker first delivery is complete. Model 0.3.1 uses
actual Shanghai GFS/ECMWF/CAMS data with a rotating three-bearing fan, distinct
cloud occurrence/conditional opacity, exact exposed-base conditioning,
horizontal decorrelation and explicit missing-data/coverage semantics.
Twenty-five regression checks pass; final captured forecasts replay exactly.
Four Ask ChatGPT MCP calls completed and material findings were corrected.
All 35 successful public-source captures pass their SHA-256 checks. Final web
checks, source/forecast retention and browser cleanup are recorded in
[verification](../evidence/verification.md). The local service remains running.

Field skill and observation calibration retain their scientific-work ownership
in [the model](../model.md). They are explicit limits of the experimental index.

## Execution and evidence

1. Preserve original pages and official provider documentation with URL, UTC
   capture time, status and SHA-256. Investigate source maintenance status.
2. Compare data routes and resolve the engine's available-input assumptions.
3. Land the selected model/API/surface behavior, then implement and integrate.
4. Exercise meaningful engine and service failure cases plus real Shanghai
   data. Verify the user-facing result and fix discrepancies.
5. Reconcile docs and retain exact verification evidence and remaining field
   calibration requirements.

## Risk and resource envelope

The investigation uses at most 40 source downloads, including selected formula
images whose equations are image-only in the original tutorial, and four substantive
MCP calls. A fourth focused probability review was selected after the third
review found conditional-probability distortion in the revised cloud model.
Stop automated retries on quota responses. Public documents and newly authored
technical questions are the only material transmitted to research models.
Provider evaluation uses at most 800 location-equivalent units, expanded from
the initial 100 after actual vertical-profile and aerosol compatibility gaps
required targeted probes and corrected full-section checks. The independent
review justifies two additional three-bearing live checks (294 new units).
Scientific heuristics and live forecast skill remain separately identified.

## Completion record

Completed on 2026-11-06. The requested regional self-hosted implementation,
local public research archive, independent MCP assessments and operational
verification are delivered. Source maintenance cause remains unresolved in
the public evidence and is recorded without assigning a speculative cause.

## Subsequent operational delivery

On 2026-11-08 the owner selected fixed 08:00/16:00 source acquisition and
server-key-protected upcoming-event refresh, with public reads/local computation
isolated from external costs. The [scheduled-cache plan](scheduled-cache.md)
is complete; its [observed evidence](../evidence/scheduled-cache.md) records 90
passing checks, 132 actual published forecasts and unchanged acquisition
counters through public reads and restart. Scientific calibration retains its
existing model/study ownership.

On 2026-11-10 the [saved-input audit](../evidence/bright-sky-audit.md) adds
same-event model/source comparison, retained-input cloud-support diagnostics
and explicit visible-colour calibration status even when both indices agree.
All 94 Node checks pass, and actual retained-data HTTP/browser replay is verified.
The original engine remains 0.3.1. The already frozen 122-event physical and
empirical studies now have complete later source-label evaluation, with their
respective numerical, observational and operational limits preserved at
[the scientific owner](directional-scattering.md).
