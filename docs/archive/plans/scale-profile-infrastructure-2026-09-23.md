# Scale-profile infrastructure

**Status: implemented and focused-verified.** This archived plan records the
final implementation and its verification, not an unexecuted proposal.

## Goal and boundaries

Add an isolated, headless profiling tool with a fixed matrix of 260×150,
520×300, and 1040×600. The 1040×600 case—and the 520×300 case—are synthetic
profiler workloads only. They are not selectable or playable worlds.

The new-world default remains 150 rows with columns fitted to the workspace.
There is no UI world-size selector. The old `WORLD_PRESETS.large` preset was
removed. This work does not change save formats, the fitted default, or
simulation rules, and does not introduce Workers, WASM, WebGL, or WebGPU.
Deferred scale-technology proposals remain in `docs/FUTURE_IDEAS.md`.

The existing `tools/simTest.mjs` 260×150 `<8 ms/frame` regression remains
unchanged. The added profile is diagnostic and has no machine-dependent timing
pass/fail threshold.

## Final implementation

1. `tools/scaleProfile.mjs` is a Node-only, no-CLI-option command. It loads
   `particles.json`, seeds physics with `0`, uses a deterministic sand/water/fire
   workload based on the existing 260×150 performance fixture, and profiles
   exactly 260×150 (39,000 cells), 520×300 (156,000 cells), and 1040×600
   (624,000 cells). The matrix is not configurable through CLI flags, UI, saved
   worlds, or runtime settings.
2. For each size, the tool reports creation time separately from physics-step
   average, median, p95, and per-cell cost. Fixture construction and warm-up are
   outside the timed step samples. It labels memory as an estimate, not measured
   process memory, and does not claim to measure `game.js` canvas rendering or
   SVG overlays.
3. `worldConfig.js` defines the existing 2,000,000-cell limit, validation, and
   the estimate of 85 bytes of primary physics arrays plus 8 bytes of render
   estimate per cell. `physics.createWorld()` validates dimensions before
   changing global `COLS`/`ROWS` or allocating arrays. A rejected request leaves
   the current world object intact. These bounds are allocation safeguards, not
   selectable world sizes.
4. `npm run test:scale-profile` runs both the profile math/CLI checks and the
   world-allocation checks. `e2e/scaling/default-world.spec.mjs` protects the
   no-selector, 150-row fitted new-world behavior. It is a product-default
   regression, not a test of the larger synthetic profiles.
5. `docs/FUTURE_IDEAS.md` retains the deferred Worker/WASM/WebGL/WebGPU and
   material-validator ideas. The completed profile baseline is recorded in
   [`../scale-profiling-2026-09-23.md`](../scale-profiling-2026-09-23.md).

## Verification performed

All Playwright verification below used the default headless configuration.
The focused runs were:

```text
npm run test:scale-profile
npm run profile:scale
npm run test:browser -- e2e/scaling/default-world.spec.mjs e2e/physics/determinism.spec.mjs --workers=1 --trace=off
npm run test:browser -- --list
```

Recorded outcomes:

- `npm run test:scale-profile`: both profile math/CLI checks and world
  allocation checks passed.
- Focused Playwright command: 5/5 passed across the default-world and
  determinism specs. The unrelated persistence export/import spec was not part
  of this successful run.
- `npm run profile:scale`: completed and printed the results recorded in the
  profiling archive. Timings are machine-specific diagnostics, not thresholds;
  memory results are estimates rather than RSS measurements.
- `npm run test:browser -- --list`: discovers 137 tests in 34 files. Discovery
  is an inventory count, not a full-suite execution. The last recorded full
  Playwright run was 121 tests; no full suite was run for this change.

The measured `npm run profile:scale` diagnostic results were:

| Synthetic world | Create (ms) | Step average / median / p95 (ms) | Estimated memory (MiB) |
|---|---:|---:|---:|
| 260×150 | 2.96 | 6.216 / 5.613 / 8.969 | 3.46 |
| 520×300 | 5.69 | 27.535 / 23.939 / 37.675 | 13.84 |
| 1040×600 | 8.09 | 132.624 / 143.439 / 156.901 | 55.34 |

These are machine-specific, physics-only timings for synthetic workloads, not
thresholds. Memory is an estimate based on configured bytes per cell, not RSS.

The final browser guard checks that the menu has no `#worldSize` element, the
world still has 150 rows and fitted columns, and the canvas matches those
dimensions. The focused determinism spec also protects seeded simulation and
snapshot behavior. No headed run was required; headed runs remain optional
diagnostics, never an acceptance or release prerequisite.

## Scope recorded

- Added `worldConfig.js`, `tools/scaleProfile.mjs`,
  `tools/scaleProfileTest.mjs`, `tools/worldAllocationTest.mjs`, and
  `e2e/scaling/default-world.spec.mjs`.
- Added the `profile:scale` and `test:scale-profile` package scripts.
- Updated `physics.js` only for the early world-dimension validation guard; no
  simulation-rule extraction or larger playable-world behavior was added.
- Updated the program overview, current E2E plan, scale-profiling archive, and
  archive index as part of the documentation handoff.
- The separate `docs/PHYSICS_REFACTOR_AUDIT.md` is a planning/audit document for
  a possible later task. It does not authorize refactoring `physics.js`.
