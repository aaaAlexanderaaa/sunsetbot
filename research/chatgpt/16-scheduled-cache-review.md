# Scheduled acquisition boundary review

The exact [question](../questions/16-scheduled-cache-review.txt) and
[response](16-scheduled-cache-review.json) preserve the isolated Ask ChatGPT
architecture assessment captured on 2026-11-08. It reviewed the supplied
proposal rather than independently executing this repository.

The assessment supports a single-process source coordinator, local snapshots
and public reads. Its material concerns are weighted hourly/daily budgets,
source-grid equivalence, atomic publication/recovery, event-boundary request
identity and visible cache coverage. Integration adds rolling hourly admission,
whole-job quota reservation before effects, budget protection for remaining
scheduled slots, receipt history, cross-event conflicts, explicit coverage
errors and publication failure/restart checks.

Original direct-point terrain and shared-grid terrain have distinct input
scope. The current collection preserves actual provider coordinates and raw
values while using a 0.25-degree shared request lattice, with provider terrain
at that position. This approximation accompanies results. Official GFS
documentation distinguishes 0.11-degree surface and 0.25-degree pressure
variables; a combined response's coordinate is insufficient to establish all
variables' native grid equivalence. The original model and historical study
remain separately identified. Input equivalence is not claimed by the new
acquisition policy.

The public-source receipts in
[`research/sources/scheduled-cache`](../sources/scheduled-cache/manifest.json)
retain official quota, coordinate/elevation and GFS resolution documentation.
Actual implementation and HTTP observations are recorded in
[`docs/evidence/scheduled-cache.md`](../../docs/evidence/scheduled-cache.md).
