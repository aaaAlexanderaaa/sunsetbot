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

## Next-calendar resource preparation

The prespecified next calendar is Shanghai 2023-09-01..10-31, 61 days and
122 sunrise/sunset events. Weather-only geometry and exact UTC brackets are
preserved in `research/experiments/scattering-validation-calendar/`.
Five official ERA5/EAC4 retrieval jobs were submitted through the working
account, using only cloud fraction/geopotential, native low/mid/high cloud and
AOD. Existing August regional and static terrain files cover reused boundaries.
The native AOD selection includes 06 UTC for autumn sunset brackets.
Observation labels for this calendar remain unrequested. Job IDs and account
state stay in ignored local state.
