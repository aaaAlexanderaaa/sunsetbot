# Frozen historical studies

- [Matched challenge](shanghai-2023-06/report.md): six cases, selected before
  weather retrieval, three positive and three matched labeled-zero events.
- [Continuous returned slice](shanghai-2023-06-all/report.md): all twenty labels
  returned for Shanghai June 1–10, 2023, without changing model parameters.

Run from the repository root after `npm ci`:

```sh
node scripts/backtest.mjs
node scripts/backtest.mjs --all
```

Both commands replay the preserved inputs and compare against saved scores;
they perform no upstream requests. Explicit `--fetch` retrieves missing inputs
under the frozen study identity and the research budget. Model-source or label
identity changes require a separately versioned experiment. Baseline values
and performance statements remain tied to the documented selection and source
labels. The all-event manifest reuses six source snapshots from the initial
challenge through explicit relative paths.

These inputs are stitched short-lead GFS archives and CAMS aerosol values.
Fixed 24/48-hour forecasts and native ERA5/CAMS reanalysis are separate data
routes. See [evidence and limitations](../../docs/evidence/historical-validation.md).
