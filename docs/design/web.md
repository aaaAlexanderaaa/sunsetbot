---
doc_type: surface-contract
status: current
authority: normative
implementation: implemented
verification_status: verified
last_reconciled: 2026-11-10
---

# Forecast web surface

The owner selected a self-hostable web interface, API and Docker on 2026-11-06,
with Shanghai first and the Yangtze River Delta as the initial region. The
surface helps plan a sunrise/sunset outing and inspect why the engine reached
its result. It consumes [forecast behavior](../contracts/forecast.md).

The primary flow is location/date/event/model selection followed by one query.
Every result identifies its own location, event, date, data age and model.
Changing inputs clears the previous result until the next query. A pending or
failed request carries a visible status and retry action. A stale or partial
result preserves its data status. Cached data remain explicit through sleep,
network loss or refresh. Calendar options come from the server's location zone.

Visual direction: an observatory notebook at dusk, with a dark blue atmosphere,
warm orange for light, cyan for clouds, and clear tabular diagnostic values.
The experimental cloud-illumination index, prominent cloud-scenario range and model
reference window precede the time curve and atmospheric
cross-section. Charts have equivalent text and tabular data. Keyboard focus,
labels, status announcements and reduced-motion support are part of delivery.
At 390, 768 and 1280 CSS pixels the page fits its viewport; chart data may use
an explicitly scrollable region. Layout adapts to viewport width.

Visible-colour quality remains explicitly uncalibrated even when both weather
indices agree. The summary shows both saved scores and each source date/time;
category disagreement, different refresh batches and a detected low-cloud
vertical-support gap qualify the advice. The original engine label/index
remain in the downloaded response beside this separate assessment. Five-minute
peak windows retain model-reference semantics.

`web/styles.css` owns one ordered layer list: tokens, base, layout, components.
It owns raw values and semantic roles as CSS properties. Components consume
semantic roles; charts consume the same colours through CSS classes. Dynamic
SVG geometry is data, with colours chosen by published chart classes or engine
spectral output. External consumers use the page's controls and HTTP API.
