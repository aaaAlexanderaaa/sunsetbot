# Directional-scattering numerical development

Status: active numerical acceptance, 2026-11-08. Production remains the frozen
`section-optics-0.3.1` and retains its separate 164-event evidence.

## Implemented physical observable

The research solver integrates cloud single scattering along spherical viewing
rays, with direct-solar illumination, shared-cell conditional cloud extinction,
Rayleigh/aerosol extinction and normalized Henyey–Greenstein phase scenarios.
Cloud occurrence uses the original fixed-column Markov field and global
vertical maximum overlap. Every positive pressure-band cloud fraction supplies
a possible volume source. The actual solar and observer paths share the same
condition `U_source < fraction`; the source fraction is multiplied once.

The current solar section is explicitly extruded cross-track. Its coordinate
is `R * atan2(X,Z)`; height is geocentric radius minus R. Terrain is constant
within each nearest probability column. Sources use symmetric ±150 km support;
the medium continues along illumination paths outside the viewing wedge.
Low-altitude extrapolation and covered radiance are recorded separately.
The fixed viewing windows span ±10 degrees around the Sun and antisolar
direction, with elevations 0.5..85 degrees. These are sampled viewing domains.

Per-ray spectra at 680/550/440 nm are normalized by direct solar irradiance at
the same wavelength and have units sr⁻¹. Their solid-angle integrals are
angular-integrated relative radiance. Calibrated photographic RGB, background
contrast and multiple scattering retain their own physical scope. The new
observable has no fitted 0–100 quality transformation.

The nominal SunCalc event-time spectrum and a common geometric solar-altitude
reference of −0.833 degrees are both retained. SunCalc is pinned to 1.9.0;
bisection uses its actual position function so sunrise and sunset can be
compared at the same solar altitude. The initial full development run also
retains the complete seventeen-frame event ±40-minute curve.

## Mathematical evidence

Focused checks cover phase normalization and mean cosine; constant-source
subdivision invariance; thin-cloud linearity; same-side and both-side
illuminated slab solutions; source occurrence and joint extinction; opaque
foreground; an independent tangent-line Earth-shadow boundary; exact cloud
band crossings; analytic molecular/aerosol integrals; fixed-column Markov cloud
union probability; uniform-sky solid angle and angular refinement.

The original [transfer and phase references](../../research/sources/transfer-math/manifest.json)
are preserved with URL, capture time and hash. The PBRT authors use two
outward-pointing direction vectors; the local solver uses incoming/outgoing
photon propagation, with the corresponding phase-cosine sign explicitly tested.

## Initial prototype and real-field failure

Version 0.1.0 uses composite two-point Gauss source integration with a maximum
viewing cloud optical-depth step of 0.5 and midpoint angular integration.
It passes the mathematical kernel checks and computes all twenty development
events at both eleven and thirty-seven pressure levels.

At g=0.85, the development source-label AUCs are:

| Observable | 11 pressure levels | 37 pressure levels |
| --- | ---: | ---: |
| Nominal event-time red radiance | 0.706 | 0.706 |
| Common-altitude red radiance | 0.647 | 0.725 |
| Maximum red radiance over ±40 minutes | 0.667 | 0.745 |

These are diagnostic results on three positive and seventeen zero source
labels. Numerical refinement determines acceptance before predictive selection.
The first curve maxima often occur at the daytime window boundary, emphasizing
the distinction between a radiometric observable and a human glow-quality
index.

Six fixed-medium reference cases (June 3 sunset, June 9 sunset and June 10
sunrise, each coarse/dense) expose large numerical changes. Halving source
optical-depth step and gas step changes red integrals by +11%..+104%. Refining
the angular grid changes them by +24%..+342%. The combined change reaches
+39%..+369%. Source refinement initially also changed gas precision; their
separate error contributions require separate controls.

The [full development capture](../../research/experiments/scattering-development/summary.json)
and the source/angle/source-angle refinement directories retain every result.
The exact initial source is preserved in
`research/model-snapshots/directional-single-scatter-0.1.0/`. An additional
164-calendar diagnostic was stopped after 136 completed coarse/dense jobs when
the numerical failure was established; its partial checkpoints remain under
ignored `var/reanalysis/scattering-batches/` and supply no completed skill claim.

## Adaptive-source revision and remaining numerical owner

Version 0.1.1 replaces Gauss source sampling with endpoint-aware adaptive
Simpson, preserving exact pressure/horizontal/shadow boundaries and the fixed
U field. It records source error estimates, depth limits and ray trace counts.
The six fixed-medium reference captures are in
`research/experiments/scattering-adaptive-source/`; exact transitional source
is retained in its matching snapshot. The midpoint sky grid retains its
known unresolved angular-sampling owner.

The [eleventh self-contained MCP question](../../research/questions/11-real-cloud-numerical-convergence.txt)
provides exact code and all six refinement tables. The
[completed assessment](../../research/chatgpt/11-real-cloud-numerical-convergence.md)
reports 532 seconds of thinking and recommends:

- Conditional removal of the current viewing segment's exact `exp(-k*t)`
  factor, integrating in `u = 1 - exp(-k*t)` instead.
- Geometric cloud-support projections, followed by nested adaptive integration
  in sine elevation and azimuth. The declared extruded field has exact
  cross-track mirror symmetry, reducing duplicate directions.
- A global ledger for angular, source and gas estimates plus cumulative
  radiance-tail bounds. Computational/depth limits retain an explicit
  unresolved convergence state.
- Independent tightened-tolerance and changed-initial-partition checks on all
  six fixed media, plus the isotropic constant-illumination identity
  `4*pi*L = 1 - E[T_view_cloud]` using actual cloud fractions and correlations.

These revisions remain at the active
[directional-scattering plan](../plans/directional-scattering.md). New-date
observation retrieval and candidate promotion follow numerical acceptance and
a preserved source/policy freeze.

## Optical-depth and angular solver (0.2.0 development)

The new source variable is `u=1-exp(-k*t)`. Conditioning on the source cell
makes the current viewing segment's extinction exactly `exp(-k*t)`, so its
Jacobian cancels `k*dt`. Solar-path and shared-cloud attenuation remain inside
the same conditional expectation. Endpoint adaptive Simpson integrates the
remaining density, with explicit source-limit envelopes and omitted-tail
bounds. The actual-cloud isotropic, zero-gas, constant-illumination identity
`4*pi*L=1-E[T_view_cloud]` passes to 1e-10.

Nested angular integration uses sine elevation and azimuth, exact cross-track
reflection, cloud projections and Earth-shadow vertices. A whole-elevation-
interval bound prevents exact-zero samples from silently discarding supported
cloud sources. For a shadowed observer, separate maxima of the cylinder-ray
quadratic coefficients lower-bound the first possible sunlight distance.
Common same-cell foreground portions of both endpoint viewing rays attenuate
every intermediate ray. Conditional source-cell probabilities then bound the
remaining view-only source. A stable quadratic root is used for every positive
quadratic coefficient.

At a limited angular interval, both the exact transfer and positive nested
source/angle Boole rules lie inside this view-source envelope. Its angular
ledger therefore owns the complete numerical error on that interval; the
subordinate source/tail uncertainty integrals are absorbed there. Other
intervals retain separately integrated source/tail estimates. Their inner and
outer quadrature errors are included in the final RGB ledger. All raw/covered
RGB channels must meet `max(1e-10,0.02*channel)`; colour ratios receive error-
estimate intervals or an unresolved denominator status. Azimuth limits and
unbounded limits retain numerical failure.

### Independent review and observed corrections

Question [12](../../research/questions/12-angular-zero-region-bound.txt) supplies
the complete implementation and the first 24-job failure to an isolated MCP
conversation. Its [assessment](../../research/chatgpt/12-angular-zero-region-bound.md)
supports the fixed-azimuth geometric/probability argument, identifies a small-
coefficient linear-root issue, and finds red-only and nested-uncertainty gaps.
The current implementation corrects these gaps and guards exact-zero outer
azimuth intervals using a complete-box pathwise envelope.

A trial extension to tiny positive backgrounds exhausts the ray budget on
actual solar-opaque clouds with sampled radiance around 1e-21. A view-only
bound remains loose there. The exact source and samples are preserved in
`scattering-numerical-ledger1`; the current solver explicitly retains estimated
adaptive-quadrature scope for subgrid peaks on positive backgrounds. The
textbook authors' [adaptive integration chapter](https://fncbook.com/adaptive/)
describes extrapolation-based error estimates; NIST's
[arithmetic reference](https://dlmf.nist.gov/3.1) defines interval-arithmetic
coverage. Both primary pages are locally archived in
`research/sources/integration-followup/`. The original QUADPACK source is also
preserved; the attempted GSL HTML capture records its actual connection failure.

Question [13](../../research/questions/13-finite-numerical-acceptance.txt) supplies
the revised code, costs, failed tiny-signal trial and prospective acceptance
policy. Its [assessment](../../research/chatgpt/13-finite-numerical-acceptance.md)
accepts finite empirical convergence as a suitable research claim, contingent
on actual six-medium controls, independent source partitions, real-medium
envelope checks and explicit numerical ties. It precedes the later complete-
error ownership correction at bounded local intervals; that correction has its
own conservation argument and regression test.

The [real-medium envelope verification](../../research/experiments/scattering-angular-envelope-verification.json)
passes 18,515 independently integrated view-only source rays in 2,645 intervals
at six fixed coarse/dense media. Its first sweep found 28 false exclusions on
intervals no wider than 6.94e-18 in sine elevation. Removing an artificial
minimum overlap width retains those source cells. A trial closed-touch rule
was conservative but enlarged blue-channel bounds; the final rule retains
every positive-width overlap, with a deeper local angular budget. These
observed effects are retained with their respective source identities.

### Empirical gate and replay

`node scripts/accept_scattering_numerics.mjs` runs six fixed media under base,
fourfold tighter source/angle tolerances, gas step 4 to 2 km, and changed
source/angle partitions. The changed source partition uses optical-depth step
0.35 versus 0.5. All g/raw/covered RGB integrals must agree within 2%; the gas
control receives a 0.1% budget. Job identities include exact source hashes,
actual input hashes and options; matching jobs resume without changing their
scientific identity. Model exceptions and zero-region budget diagnostics are
retained as failures. The run must finish before its acceptance status exists.

The evidence directories `scattering-numerical-prebound`, `-bound1` and
`-ledger1` through `-ledger4` preserve intermediate failures and stopped runs.
Their matching source snapshots are complete except the first prebound sky
integrator: that file was replaced before capture and retains only its recorded
hash. Its snapshot manifest explicitly marks the archive partial. This first
failure record supplies development evidence with that reproducibility limit.

The current full Node suite covers 67 checks, including actual HTTP behavior,
conditional slab/real-cloud conservation, support envelopes, blue-channel
failure, nested uncertainty integration, local error ownership and numerical
rank ties. Thirteen Python decoder/access checks also pass. The original
production core SHA remains
`f80a37d9a92cb2a421fda2599af9e336e2261d7b4a49980159a931be5e28e71f`.

`scripts/freeze_scattering_candidate.mjs` requires matching accepted gate,
envelope sweep and label-free reference predictions, then preserves source,
policy and input identities before new-date labels. The prospective policy
uses common-Sun-altitude red radiance at g=0.85 and 37 levels, compares the
exact exposed 0.3.1 frame and native layer baseline, and retains source-label
coverage and numerical missingness. Numerical interval overlap is reported as
a tie; failed forecasts retain unresolved pair orderings. The uncertainty
ordering range has empirical numerical scope.

## Next-calendar resource preparation

The prespecified next calendar is Shanghai 2023-09-01..10-31, 61 days and
122 sunrise/sunset events. Weather-only geometry and exact UTC brackets are
preserved in `research/experiments/scattering-validation-calendar/`.
Five official ERA5/EAC4 retrieval jobs completed through the working account,
using cloud fraction/geopotential, native low/mid/high cloud and AOD. Existing
August regional and static terrain files cover reused boundaries. All eight
raw dependencies normalize into 122 public label-free weather bundles at 37
levels. Independent checks cover 399,672 aligned, finite, valid field series.
The weather-only old-model reference and native baseline predictions are also
preserved before labels, with original optional rain/visibility defaults made
explicit.
The native AOD selection includes 06 UTC for autumn sunset brackets.
Observation labels for this calendar remain unrequested. Job IDs and account
state stay in ignored local state.
