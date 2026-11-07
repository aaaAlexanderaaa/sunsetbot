---
doc_type: plan
status: complete
authority: planning
last_reconciled: 2026-11-07
---

# Frozen reanalysis input comparison

The owner supplied the requested Copernicus token after the concrete account
instructions. Configure private local access, verify both fixed endpoints,
submit the prepared acceptance requests and inspect actual GRIB fields before
the first complete 20-event comparison. Preserve raw inputs and source hashes.

Keep engine 0.3.1 and its parameters frozen. The existing GFS short-lead archive
supplies the control. Compare replacement ERA5 pressure cloud fractions and
geopotential heights, and replacement EAC4 AOD, in an explicit factorial design
when data access permits. Retain GFS ancillary terrain/rain/visibility and
cloud-layer baseline unchanged for this intervention, with per-field provenance.
Native cloud liquid/ice/temperature are archived and diagnosed; the frozen
engine does not consume them. Nearest grid-point selection matches the existing
provider selection policy; preserve the selected coordinates for both grids.
Keep time interpolation in the existing engine and verify complete bracketing.

Ask ChatGPT to assess the actual experiment and data interpretation with all
necessary facts supplied. Source labels remain the same 20 curator judgements,
including their observation-coverage uncertainty. Preserve ranking metrics,
severe mismatches, and exact case scores. ERA5 reconstruction skill and fixed
forecast-lead skill retain separate meanings. If the service needs a manual
licence action, report its exact link and continue independent preparation.

Initial retrieval is the prepared acceptance pair, followed by the prepared
three regional jobs covering 2023-05-31 through 2023-06-10 UTC. These free
requests contain approximately 253 MB of unpacked ERA5 values. Submit each
remote request once, persist its ID immediately, and resume rather than
resubmit while queued. Use an isolated optional Python environment for GRIB
decoding. Model/input/test changes require appropriate offline and captured
data checks; keep the local web service available.

The accepted pressure sample decodes all 165 expected fields with valid units
and no missing cells. The source-label-zero 2023-06-10 sunrise changes from
83.1 to 15.6 with ERA5 pressure fields alone and to 14.4 with ERA5 plus EAC4;
GFS plus EAC4 gives 80.3. This warrants the full prespecified comparison.
Add two small single-level ERA5 requests (native low/medium/high cloud cover,
about 13.8 MB raw arrays total) to compare the unchanged cloud-layer formula
on ERA5 inputs too. Its original GFS baseline remains separately preserved.
The seventh Ask ChatGPT attempt returned a runtime compatibility error before
dispatch; the question and exact error are retained, and no automatic retry
has been sent.

After the full four-way replay completed on 2026-11-07, the results and actual
engine source were supplied in a fresh eighth substantive review. A bounded
37-level diagnostic request adds four hours (about 13 MB unpacked) to examine
the contrast between 11 sampled pressure levels and native aggregate cloud
cover. Its separate directory preserves the frozen experiment's original
inputs. It adds data evidence without changing the engine or its scores.

## Completion record

Both official endpoints authenticated. All prepared regional inputs were
retrieved, decoded and retained locally. The twenty-event pressure-only stage
and full four-way experiment completed and replayed exactly; their shared
ERA5 controls match. Native ERA5 cloud-layer baselines and fraction/height
ablations are preserved. The independent review completed on the fresh eighth
question, following the earlier pre-dispatch compatibility failure.

The bounded 37-level diagnostic confirms omitted 225 hPa cloud in both a
positive and a negative case. Full results and limits are reconciled in
`docs/evidence/era5-input-comparison.md`. Further representation changes and
independent-date validation have a separate owner in
`docs/plans/cloud-column-representation.md`; model 0.3.1 remains unchanged here.
