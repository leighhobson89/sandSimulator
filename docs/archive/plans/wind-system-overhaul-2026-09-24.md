# Wind System Overhaul Plan

Finalized and archived: 24 September 2026

## Goal

Replace the single Wind Strength range and intermittent, independently directed
Breeze with one accessible two-value control for persistent General Wind and
travelling Gusts. General Wind should be a smooth, spatially varied background
flow. Gusts should travel in its prevailing direction, add temporary turbulence,
and respect walls, terrain, and the existing airflow behavior. The Breeze toggle
remains the master switch for both systems.

## Current integration points

- `index.html`, `styles.css`, and `ui.js` define and initialize the current
  native 1–8 `#windStrength` range, its single value output, and the Breeze
  checkbox.
- `constantsAndGlobalVars.js` owns the current single `windStrength` setting.
- `physics.js` owns `windDial`, `ambientWindOn`, gust scheduling and traversal,
  per-cell wind trails, and the advected `airflowX/Y` field used by Fans. The
  existing Breeze travels in either direction and has a row-based shelter pass.
- `game.js` colors and draws the combined physical airflow and display-only
  `displayWindX/Y` samples in Wind visualization mode.
- `saveLoadGame.js` saves the single strength in `tools.windStrength`; the
  simulation snapshot saves Breeze enable state, the old dial, and `frameCount`.
- Existing deterministic wind coverage is in `tools/simTest.mjs`; environment
  controls and Wind visualization are covered in `e2e/tools/environment.spec.mjs`.
  Portable-save coverage lives under `e2e/persistence/`, and `tools/smokeTest.mjs`
  also checks the Breeze control.

## Design and implementation scope

1. **Two-value control and state.** Replace the single displayed strength with
   two keyboard-accessible range handles, both integer-valued from 0 through 50.
   The General Wind handle is the lower value and the Gust handle is the upper
   value. Keep separate visible values and accessible names. Moving General
   Wind up to Gust Strength and continuing to drag pushes both values together;
   moving Gust Strength cannot place it below General Wind. Keep the existing
   Breeze checkbox as the only enable toggle.

2. **Strength calibration.** Preserve the requested scale relationship at the
   UI-to-physics boundary: **50 on the new scale has the effect of 15 on the
   legacy strength scale** (a linear reference factor of 0.3 for paths that use
   that legacy scale). Centralize this conversion and tune the General Wind,
   gust, and wind-tool paths against their existing formulas separately; do not
   multiply every physics formula by 0.3 or apply the dial mapping to Fan speed.
   Fan settings retain their existing independent 1–20 scale. When restoring an
   old save with only `tools.windStrength`, convert that value back to the new
   scale, clamp it to 0–50, and use it for both handles so the old single setting
   retains its approximate effect.

3. **Persistent background flow.** Add an obstacle-aware General Wind field
   whose local strength is smoothly varied and bounded by the selected General
   Wind maximum. Zero produces no generated background force. Higher values
   increase average force. Prefer a reusable low-resolution or otherwise cached
   coherent field with interpolation/staggered updates over independent random
   values per cell or a newly randomized whole-world field every frame. Feed
   physical airflow and the visualization from the generated field while
   preserving sheltering and existing airflow behavior.

4. **Prevailing direction and clock.** Hold one horizontal direction for about
   30 minutes of simulation time, then choose left or right again; the next
   choice may match the previous one. The simulation runs at 60 steps per
   second, so use `frameCount` and a 108,000-step interval rather than render
   frames. Gusts use the prevailing direction even when General Wind is zero.
   Persist a validated direction and time remaining, or initialize both to a
   valid cycle on restore; older saves without these fields must restore safely.

5. **Travelling gusts.** Evolve the current Breeze into a more frequent,
   randomized-but-bounded sequence of bands entering from the upwind edge,
   crossing the simulation in roughly three seconds under normal conditions,
   and ending after they leave the opposite edge. A gust uses the prevailing
   direction and adds force on top of General Wind. Bound the General Wind
   component by its configured maximum and the temporary gust addition by Gust
   Strength independently. During a gust, combined generated airflow may
   approach the sum of those two configured strengths before calibration. Keep
   events intermittent and avoid stacking enough gusts to create effectively
   constant weather. Add coherent seeded/time-varying curvature, vertical
   deflection, and local swirl without frame-by-frame random jitter. Reuse
   existing obstruction/shelter rules where they fit and ensure solids do not
   receive airflow through their interiors.

6. **Visualization and persistence.** Wind visualization must show the
   generated General Wind and gust contribution alongside existing Fan airflow,
   with speed and direction reflecting their local combined result. Show gust
   bands and swirl as they move, while preserving the blue-to-red speed mapping
   and visible-bound rendering. Persist both selected strengths and the master
   toggle through existing save paths, migrate legacy single-strength settings,
   and reset ephemeral active-gust scheduling cleanly on restore if it is not
   persisted.

## Invariants and acceptance criteria

- UI range is 0–50; `0 <= General Wind <= Gust Strength <= 50` after pointer,
  keyboard, programmatic, and save restoration updates.
- General Wind at zero emits no background airflow; Gust Strength at zero
  cannot create a gust. A nonzero gust value with General Wind zero still uses
  the current prevailing direction.
- Disabling Breeze stops new background and gust generation. Existing generated
  trails and momentum may decay naturally; re-enabling follows the selected
  values without creating separate enable controls.
- General Wind remains spatially coherent, has local calm and stronger regions,
  and does not exceed its configured maximum outside gust contributions.
- Prevailing direction remains stable until its approximately 30-minute
  simulation-time deadline. All gusts travel in that direction and exit rather
  than applying maximum force everywhere at once.
- Gust force is an additive temporary contribution with coherent turbulence.
  Its contribution is bounded by Gust Strength independently of the General
  Wind bound; combined generated airflow may approach the sum of both strengths
  before calibration. The gust contribution ceases after traversal.
- Walls, terrain, chambers, and the existing airflow mechanics continue to
  affect flow where supported. Fan speed and unrelated environment controls
  retain their current behavior.
- Wind visualization reports the combined generated and existing airflow;
  save/load preserves both settings and loads legacy saves with valid values.
- Field updates avoid per-frame whole-world random generation and avoid
  independent per-cell random work; performance remains within the existing
  simulation scaling expectations.

## Planned test coverage

The test engineer has prepared failing regressions in the project harnesses.
These are the concrete test-facing contracts and checks for implementation:

- `tools/simTest.mjs` uses distinct `setGeneralWindStrength` /
  `getGeneralWindStrength` and `setGustWindStrength` / `getGustWindStrength`
  APIs. It inspects the generated field through `world.generalWindX` and
  `world.generalWindY`, the prevailing cycle through
  `getPrevailingWindDirection()` and `getPrevailingWindTicksRemaining()`, and
  active traversal through `getActiveGustState()`. The gust state consumed by
  the regression includes `direction`, `x`, and `duration`. The saved simulation
  state carries `prevailingWindDirection` and
  `prevailingWindTicksRemaining`. `windStrengthToLegacyScale(50)` must return
  `15`.
- The deterministic checks cover zero General/Gust behavior, a coherent but
  spatially varied General Wind field capped by its setting, higher average
  flow at stronger settings, an approximately 30-minute stable direction cycle
  and its renewal, more frequent gust scheduling, same-direction travel with
  zero General Wind, visible vertical swirl, traversal instead of a global
  impulse, roughly 120–240 ticks for a typical 200-cell crossing, and the
  Breeze master switch stopping new activity.
- `e2e/tools/environment.spec.mjs` verifies distinct accessible range controls
  named **General Wind** and **Gust Strength**, each spanning 0–50. Its keyboard
  crossing check starts with both at 10 and presses ArrowRight on General Wind,
  expecting 11/11. It then verifies Gust can move independently from 20 to 19
  while General stays 8, and clamps a lower Gust attempt to General's value.
  Existing environment coverage also exercises control layout, Breeze enable,
  wind-tool display, and Wind visualization. Update legacy assertions that
  still assume the old single 1–8 range or one value output to match the two
  controls.
- `e2e/persistence/export-import.spec.mjs` saves/restores
  `tools.generalWindStrength` and `tools.gustWindStrength` independently. Its
  legacy migration case removes those fields, supplies
  `tools.windStrength = 15`, and expects both new values to restore at 50.
  Existing persistence cases continue to cover other save payload fields.

Run the deterministic harness with `npm test` or just its wind section with
`npm test -- --focus=wind-overhaul`. Run the control and visualization coverage
with
`npm run test:browser -- e2e/tools/environment.spec.mjs --workers=1 --trace=off`,
and save migration coverage with
`npm run test:browser -- e2e/persistence/export-import.spec.mjs --workers=1
--trace=off`. The deterministic focus can be selected through the documented
test entry point with `npm test -- --focus=wind-overhaul`. Browser tests must use
the npm wrapper. **Ask the user for approval before any full test suite run**, as
required by `AGENTS.md`, even though the feature brief requests a full regression
run.

## Verification record

- `npm.cmd test -- --focus=wind-overhaul`: **17 passed, 0 failed**.
- The broader deterministic harness was stopped before suite completion after
  the wind section passed; no result is claimed for the remaining harness or
  full suite.
- The focused npm browser run could not launch tests in this environment, so
  the browser assertions remain unverified.
- `docs/GAME_MECHANICS.md` and `docs/E2E_TEST_PLAN.md` were updated with the
  implemented controls, additive strength calibration, direction and gust
  behavior, persistence migration, and current verification status.

## Documentation and plan closeout

`docs/GAME_MECHANICS.md` now records the two settings, toggle behavior, direction
timing, gust behavior, additive calibration, and save/load migration.
`docs/E2E_TEST_PLAN.md` records the slider and persistence browser coverage and
the verification status. This finalized plan is archived at
`docs/archive/plans/wind-system-overhaul-2026-09-24.md`.

## Risks to resolve during implementation

- General airflow and Fan airflow currently share advected arrays; combine
  contributions without changing powered Fan behavior or allowing velocity to
  bypass obstacles.
- The numeric UI scale differs from the old range, and General Wind, gusts,
  wind-tool strokes, and Fans do not share identical physical formulas. Keep
  conversions explicit at each input boundary and balance them independently.
- Native range controls do not provide two thumb values in one input. The
  selected markup/CSS approach must remain independently keyboard-accessible,
  expose each value clearly to assistive technology, and support push-through
  dragging without unstable pointer arbitration.
- Frame-based wind deadlines must use simulation time, including pause and
  restored `frameCount` behavior; rendering must not advance weather state.
- Persisting new tool fields and optional simulation fields must preserve old
  portable saves, local resume games, and blueprints that omit transient flow
  state.
- A coherent field, vortices, and obstacle checks can become costly at large
  worlds. Reuse arrays and stagger calculations, then compare existing scale
  performance profiles after the implementation.
