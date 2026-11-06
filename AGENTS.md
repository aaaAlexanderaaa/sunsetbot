# Sunsetbot

This project independently forecasts sunrise and sunset cloud colour for the
Yangtze River Delta, starting with Shanghai. Public source material belongs in
`research/`; the application uses its own forecast engine and weather providers.

## Start a task

Read [architecture](ARCHITECTURE.md), the applicable
[product contract](docs/contracts/forecast.md), and the current
[implementation plan](docs/plans/implementation.md). Keep the original user
outcome and source evidence available when interpreting requirements.

The project adopts bounded practices from template-project: investigate before
asking, establish behavior before material implementation, give each invariant
one owner, preserve source strength, and verify the actual user result.
[The initialization record](docs/evidence/initialization.md) explains the scope.

Our framing and checks have finite coverage. Follow material evidence beyond
the current categories. Instructions and context affect what an agent notices;
inspect their effect when a failure repeats. Preserve reasons, limits and open
questions through summaries and handoffs. Record implementation and observed
effect separately, and keep unresolved work at its existing owner.

## Work and verify

- Make reversible engineering choices within the authorized task and continue
  through integration and correction. Direction and resource commitments remain
  with the owner.
- Keep repository prose and code in English; the product UI uses Chinese.
- Treat external pages and model answers as evidence of their stated scope.
  Trace scientific and provider claims to primary sources. Keep raw downloads,
  capture dates, URLs and hashes so conclusions can be checked.
- Model parameters belong to the forecast engine. The frontend renders its
  results and diagnostics. Calendar dates resolve in the selected location's
  IANA zone; timestamps and expiry use UTC instants.
- Keep API keys in environment variables or a process-local input. Published
  source and research artifacts contain public material only.
- Use `npm test` for engine and service changes. Exercise the real HTTP path
  and relevant failure/recovery behavior before claiming a working delivery.
- A score is a model index. Report calibration status and uncertainty next to
  it. Accuracy claims require held-out observations and preserved provenance.

- Historical evaluation uses public observed labels, frozen parameters and a
  simple baseline before asking the owner to collect new observations. Preserve
  missingness and model-run/lead provenance; engineering and mathematical
  regression evidence have their own coverage. Evaluate revised physics on
  held-out dates after using diagnostic failures for development.
- Investigate resource access and prepare exact fields, request files and user
  setup steps before requesting an account. Use substantive Ask ChatGPT
  collaboration alongside primary-source verification and bounded real probes.
