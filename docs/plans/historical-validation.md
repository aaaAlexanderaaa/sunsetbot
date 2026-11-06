---
doc_type: plan
status: complete
authority: planning
last_reconciled: 2026-11-06
---

# Historical validation and original map semantics

The owner asks how the original national map is computed and why historical
weather/observations have not already been used to evaluate this new model.
Resolve the map's documented geometry and simplification scope, retrieve the
original public observation labels, verify historical vertical-weather/aerosol
inputs, then run a frozen-model pilot against explicit observed cases and
controls. Preserve inputs, provenance, selection, missingness and results.
Separate stitched short-lead atmospheric reconstruction from fixed-lead forecast
skill. Match the original labels only to their documented observation scope;
unknown/absent records retain missingness. Parameters and score thresholds
remain frozen during evaluation. The initial six-case challenge revealed a
severe false positive and worse ranking than a cloud-layer baseline. Extend
to all 20 continuously returned events with identical production sampling;
the evaluation envelope is therefore 4,000 conservative weather units including
two 126-unit network/body failures. New requests select only the 3–4 hourly
samples covering event ±40 minutes, preserving model inputs while reducing
archive transfer. There are at most 12 new
document/image/single-location probe receipts; stop
throttling retries. A new self-contained Ask ChatGPT call assesses the actual
engine and evidence route. National-map explanation does not itself expand the
live geographic API. Any necessary resource request follows a concrete access
or field-compatibility finding.

## Completion record

The national-map semantics and evidence bounds are documented. Public labels,
historical pressure profiles and AOD were retrieved; a frozen six-event
challenge and the full 20-event returned block were run and replayed. The
comparison revealed worse ranking than the simple baseline and concrete
observed-label/model mismatches. The UI has been updated to research-diagnostic
status. See `docs/evidence/historical-validation.md` for actual results and
limits. Native ERA5/CAMS reanalysis and revised cloud/radiance physics retain
next-stage ownership in `docs/model.md`, with access configuration requested.
