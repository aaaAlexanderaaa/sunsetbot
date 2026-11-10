---
doc_type: plan
status: complete
authority: planning
last_reconciled: 2026-11-08
---

# Scheduled source acquisition and published forecasts

## Owner outcome

External weather acquisition has a fixed operational cost. Local computation
and public reads consume saved inputs and never initiate external acquisition.
The owner requests daily updates at 08:00 and 16:00 in Asia/Shanghai, covering
the next three sunrise and sunset occurrences, plus a server-key-protected
endpoint refreshing the next strictly future occurrence of each event.

## Defined behavior

- The scheduled coverage starts with the existing eleven regional presets and
  both GFS/ECMWF. Weather cells at 0.25 degrees and aerosol cells at 0.4 degrees
  are deduplicated across locations, event dates and bearings before retrieval.
  Exact native provider responses retain their coordinates, units and fetch
  times. This changes acquisition ownership without tuning engine parameters.
- Normal forecast reads use published results. Other supported queries can
  compute from covered local source snapshots. A missing result/input returns
  a corrective cache-status response. Public reads have no network loader.
- Every scheduled run covers the next three strictly future sunrises and
  sunsets per location. The ordinary calendar UI covers today through
  three days ahead, making the third upcoming sunrise accessible after today's
  event has passed. Previously published events remain available within retention.
- `POST /api/v1/refresh`, authenticated with the hardcoded server-side key in
  `X-Refresh-Key`, refreshes the next one of each event for all scheduled
  locations and both models. It has no caller-selected geographic expansion.
  It returns a background job receipt. Active refresh work is coalesced.
- `GET /api/v1/status` reports refresh progress and the next scheduled time.
  Cold starts catch up to the latest missed slot once. A persisted claim
  precedes external effects; restart and failure preserve that claim.
- Only the refresh coordinator holds an external provider. Requests are paced
  within minute/hour allowances, with a persisted complete-job daily reservation
  and cooldown. Forced admission leaves budget for remaining scheduled slots.
  Reads, local recomputation, refresh progress and cache misses
  consume zero external units.
- Readers retain the previous published generation during refresh. Required
  source failure preserves its old forecasts; optional aerosol absence stays
  explicit. The latest full and forced source bundles persist separately so
  a forced subset preserves broader local coverage.
- Returned data retain publication/source identity and expose present age,
  event-relative time, scheduled expiry and refresh status. Scientific model
  and retrospective evidence retain their current ownership.

## Verification

Check scheduled slots and next-event selection around midnight and actual
event instants; fixed acquisition plans and grid deduplication; zero external
effects for HTTP reads, misses, custom coordinates and unauthorized refresh;
authorized forced scope; overlapping jobs; startup/restart and interrupted
claim behavior; atomic publication; required-source failure and optional AOD;
existing regressions, Docker startup and an actual bounded provider refresh.

## Verification outcome

Ninety Node checks pass, including real HTTP authorization/read isolation,
minute/hour admissions, crash reservations, interrupted-slot deduplication,
cross-event conflicts and publication failure/restart. Both original captured
model replays still match. The Docker service's actual scheduled catch-up
published all 132 forecasts as ready. Reading every identity, local custom
computation and a real restart preserve acquisition counts and forecast identity.
The [observed delivery record](../evidence/scheduled-cache.md) retains exact
job, HTTP, source and counter evidence.

The independent Ask ChatGPT assessment selected hourly budgets, persisted
reservations, event-boundary conflicts, publication recovery and visible local
coverage as material checks; those are implemented. Source-grid terrain is an
explicit input approximation, retaining its own scientific scope.

The owner confirmed the acquisition scope on 2026-11-08: the existing eleven
preset locations receive scheduled updates, and custom-coordinate queries use
complete coverage already available locally. This matches the delivered scope.
