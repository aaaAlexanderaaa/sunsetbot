---
doc_type: plan
status: active
authority: planning
last_reconciled: 2026-11-08
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

The source now integrates in `u=1-exp(-k*t)`, with geometric cloud support,
conditional interval attenuation bounds, reflection symmetry and nested
adaptive sky integration. All raw/covered RGB channels have propagated
angular/source/tail error estimates and colour-ratio diagnostics. A bounded
local angular interval owns its complete numerical error; its subordinate
source/tail ledger is absorbed on that interval. Positive-background subgrid
peaks retain explicitly estimated-quadrature scope.

The six-real-medium view-only envelope check passes 18,515 interior rays over
2,645 boundary-aware intervals. It exposed and corrected a floating-point
support exclusion on sub-1e-17-wide intervals. Sixty-seven Node tests and
thirteen Python checks pass. Full empirical acceptance is a separate 24-job
gate: base, fourfold tighter tolerances, independent gas-step refinement, and
changed source/angle partitions at both pressure resolutions. Job identities
include actual input hashes, source hashes and options. Budget failures retain
their zero-region samples. [Numerical evidence](../evidence/directional-scattering-numerics.md)
preserves development failures and independent assessments.

Five official weather retrievals are downloaded. Together with reused August
and static-terrain files they normalize all 122 Sep/Oct events at 37 levels.
All 399,672 weather field series pass alignment/range checks. New-date labels
remain unrequested. A prospective evaluation-policy draft specifies equal-Sun-
altitude comparison to an exactly exposed frozen heuristic frame and a native
layer baseline. Candidate/source/policy freeze follows the numerical gate;
observed-label retrieval and new-date scoring follow that freeze.

The original component-ablation idea now has two explicit scopes: the earlier
representation study isolates vertical discovery/density; the new comparison
evaluates the combined directional-source/angular observable. Its source and
area have different physical units from the old target-strength proxy, so a
mixed-unit factorial score would require another defined observable.
