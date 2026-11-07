---
doc_type: plan
status: active
authority: planning
last_reconciled: 2026-11-07
---

# Directional cloud-scattering experiment

## Outcome and basis

Estimate how much coloured light a cloud sends toward the observer, with a
defined angular viewing domain and reproducible physical limits. The original
live engine remains 0.3.1 and its historical evidence remains immutable.

The completed 164-event representation experiment has original AUC 0.716,
dense-only 0.727 and frozen dense/adjacent 0.707; paired change intervals span
zero. The eighth completed Ask ChatGPT assessment (question 09) receives the
actual engine and all scores and selects directional single scattering with
sky-angle aggregation as the next mechanism. Its
[exact response](../../research/chatgpt/09-next-physics-after-independent-validation.json)
and [reading copy](../../research/chatgpt/09-next-physics-after-independent-validation.md)
retain scope and the prespecified-secondary qualification.

Primary documentation is archived with URL, capture time and hash in
`research/sources/scattering/`. The libRadtran usage guide establishes radiance
viewing geometry, cloud optics inputs and the need for spherical treatment at
low Sun. ECMWF's 2016 ecRad memorandum separates gas/aerosol/cloud optics and
the solver, using water/ice and particle size to define cloud optical
properties. JMA documents a ten-minute AHI full-disk cycle. These are physical
and data-route references; the new local calculation needs its own validation.

## Defined behavior before implementation

Create an isolated research engine with explicit source version and no live
promotion. For a viewing ray, integrate the formal single-scatter source

`dL_lambda = E_sun_lambda * T_sun_lambda * beta_scatter_lambda * phase(mu) * T_view_lambda * ds`.

The phase function integrates to one over 4π steradians. `mu` uses the incoming
photon propagation direction and the outgoing direction toward the observer.
Distinguish cloud occurrence from conditional cloudy extinction in the same
way as the frozen finite-cell probability model. Continuous cloud fraction
participates in volume emission; the existing 15% threshold is restricted to
optional cloud-target display. All shared-cell conditioning across illumination
and viewing paths needs one explicit probability owner.

Integrate radiance over actual angular cells. A cell bounded by azimuth and
elevation has solid angle `delta_azimuth * (sin(elevation_high) - sin(elevation_low))`.
Overlapping targets on one pixel contribute through volume transfer and
visibility. Additional target subdivisions preserve the same observable.
Report RGB radiance, sampled angular area and emitting-cloud angular coverage
before selecting an experimental quality transformation. The existing narrow
three-bearing fan establishes a bounded sampled domain; full-sky coverage
requires its own spatial input and quadrature.

Keep cloud/grid/AOD inputs, original extinction coefficients and overlap
assumptions fixed in the initial structural comparison. Explicitly declare
single-scattering albedo and a normalized phase-function scenario. Later
water/ice-derived optical depth, effective radius, vertical decorrelation and
score calibration are separate controlled factors.

## Verification and decision

Mechanism evidence must precede source-label score selection:

- Cloud-free emission is zero; conservative optically thin cloud emission
  approaches a linear optical-depth limit.
- A homogeneous slab agrees with its analytical single-scatter solution.
- Phase normalization and Sun-facing versus antisolar geometry use the same
  photon-direction convention.
- Vertical subdivision and angular refinement converge without target-count
  growth. Earth shadow, opaque foreground and conditional cloud coverage
  retain their intended effect.
- Thick cloud and deep twilight receive explicit approximation scope. A
  spherical multiple-scattering reference such as libRadtran/MYSTIC is a
  bounded numerical cross-check before claiming radiometric accuracy.

Use the existing 184 events for diagnostics after preserving the completed
study. Compare original, angular aggregation only, scattering source only and
both changes together, with identical inputs and declared score observables.
Freeze the candidate and evaluation policy before retrieving new labels from
the next calendar, provisionally Shanghai 2023-09-01..10-31 (122 possible
events). Maintain explicit observation coverage, linked-photo date/location/
direction checks and original run/lead provenance. Probability calibration and
fixed-lead operational skill have distinct acceptance evidence.

## Execution state

Primary sources are preserved and their relevant claims checked. The completed
representation study is exposed in the self-hosted forecast/API. Directional
scattering implementation and benchmark comparison remain at this plan's owner.
