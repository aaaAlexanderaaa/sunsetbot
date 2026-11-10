---
doc_type: evidence
status: current
authority: evidence
last_reconciled: 2026-11-08
---

# Scheduled acquisition and read isolation

## Delivered behavior

Only the refresh coordinator holds the runtime external weather provider.
Daily 08:00/16:00 Asia/Shanghai slots acquire shared inputs and compute the
next three strictly future sunrises and sunsets for eleven presets and both
GFS/ECMWF. The protected POST refresh covers the next one of each event;
matching active targets coalesce and event-boundary conflicts return 409.
Public requests read published results or compute from covered local snapshots.
Missing coverage remains a local 503 response.

Scheduled claims and whole-job daily reservations reach disk before external
effects. Minute/hour admissions persist independently. A reservation crossing
UTC midnight reserves its remaining work in the new budget day. Forced jobs
leave room for remaining scheduled slots in that UTC day. Failed/interrupted
slots retain their claim; restart catches up once to the latest missed slot.
Publication replaces the result map atomically, preserving prior output after
required-source or publication failure. The full and forced source slots
persist independently. The latest sixteen job receipts remain queryable.

The original private delivery used an owner-selected server-only key. Public
publication on November 10 moves that value to the local `SUNSETBOT_REFRESH_KEY`
environment setting. The original credential stays in ignored local
configuration; published history retains a configuration lookup. Provider
credentials retain their environment-only ownership. First-upgrade retained results migrate
locally. Public dates cover today through three days ahead so the third
upcoming sunrise remains accessible after today's event.

## Actual provider and HTTP observations

The [machine-readable verification](../../research/experiments/scheduled-cache-http-verification.json)
preserves all 132 tested identities, source hashes, job receipt, errors and
before/after acquisition counters.
Its source hashes describe the original private deployment. The public
publication record preserves the distinction between that historical capture
and the later credential-loading change.

- Catch-up job `8a684300-c510-49b4-8840-eb1421ff643c` represents the November 8
  16:00 Shanghai slot. It ran from `2026-11-08T09:06:48.021Z` to
  `2026-11-08T09:13:55.417Z`, about seven minutes under acquisition pacing.
- The plan used 519 shared weather positions and 321 aerosol positions.
  Nineteen external requests reserved 3,435 conservative units and acquired
  1,359 model/location rows across GFS, ECMWF and CAMS.
- All 132 staged forecasts published successfully and every target/model
  identity returned HTTP 200 with `ready` through the actual Docker service.
- An exact-coordinate custom query computed locally. An uncovered coordinate
  returned `NO_LOCAL_COVERAGE`. Missing/incorrect refresh keys returned 401;
  GET refresh returned 405 and an invalid model returned 400.
- Reading all 132 forecasts plus custom/error paths left the daily ledger at
  3,897 units and the acquisition ledger at 19 admissions / 3,435 units.
  The extra 462 daily units precede this delivery.
- A real Docker restart preserved the forecast ID, successful job ID, daily
  debit and acquisition admission count. The same scheduled slot remained
  claimed. The next scheduled slot is `2026-11-09T00:00:00Z` (08:00 Shanghai).
- The browser showed Shanghai ECMWF sunrise on November 11, selected as
  "大后天", with index 54.8, source/publication times, the next 08:00 update,
  event-relative timing and the shared-grid terrain qualification.

## Regression and evidence scope

`npm test` passes 90 checks. New coverage exercises real HTTP admission and
read isolation, strict future-event identities, timezone/slot boundaries,
third-event date access, overlapping jobs, source failure/optional aerosol,
publication interruption and restart, weighted minute/hour quotas, whole-job
crash reservations and UTC-day rollover. The production-provider adapter also
passes a captured-protocol test with counted network effects. Both original
GFS and ECMWF offline replays still reproduce 13.2 and 7.9 exactly.

The [isolated Ask ChatGPT review](../../research/chatgpt/16-scheduled-cache-review.md)
assessed the supplied design and identified quota, source-grid, recovery,
event-boundary and coverage concerns. Its answer has design-review scope;
the tests and actual HTTP observations establish implementation behavior.

Shared request positions form a 0.25-degree weather lattice and a 0.4-degree
aerosol lattice. Actual source coordinates, values and capture ranges are
preserved. Official GFS documentation distinguishes 0.11-degree surface and
0.25-degree pressure variables. In the preserved earlier Shanghai captures,
the GFS combined-response coordinates differ from the 0.25-degree lattice at
all 42 positions; ECMWF matches at all 42. These coordinate facts establish
their own scope, while variable-level equivalence remains unclaimed.
Grid-position DEM heights and surface variables are an explicit acquisition
approximation. The result includes that qualification and retains the original
experimental engine and retrospective evidence, without a new accuracy claim.

[Official provider receipts](../../research/sources/scheduled-cache/manifest.json)
preserve URLs, capture times, raw HTML and SHA-256 for quota, elevation/grid
selection and GFS resolution documentation. Broad arbitrary-coordinate
acquisition has a separate resource scope. The owner confirmed the delivered
eleven-preset acquisition plan on 2026-11-08; custom-coordinate queries use
whatever complete local coverage that fixed plan already supplies.
