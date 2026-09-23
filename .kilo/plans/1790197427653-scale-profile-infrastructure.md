# Scale-profile infrastructure

## Goal and boundaries

Add an isolated, headless profiling tool that establishes comparable allocation
and simulation-step measurements at the existing 260×150 baseline and a small
fixed set of larger synthetic grids. These grids exist only inside the Node
profiling tool; they are not playable worlds.

Preserve the current 150-row, fitted-column new-world default, UI, controls,
save/import behavior, and existing import limit. Do not add or expose any
canvas-size option, change runtime defaults or persisted formats, or migrate the
simulator to Workers, WASM, WebGL/WebGPU. Do not refactor `physics.js` in this
work. The existing `tools/simTest.mjs` 260×150 `<8 ms/frame` regression remains
unchanged; the new profiler is diagnostic and has no machine-dependent timing
pass/fail threshold.

The current repo has no `#worldSize` control in `index.html`, although
`worldConfig.js` retains a `large` preset and
`e2e/scaling/large-world.spec.mjs` expects a selector. Do not activate, remove,
or otherwise expand that legacy surface in this work. Keep that stale spec out
of focused verification and track any cleanup separately.

## Implementation sequence

1. **Test engineer first:** add focused failing tests before implementation:
   - `tools/scaleProfileTest.mjs` imports the planned pure profiling helpers and
     checks the fixed profile matrix, safe synthetic cell counts, and summary
     statistics using deterministic sample values. It must not assert elapsed
     performance thresholds.
   - `e2e/scaling/default-world.spec.mjs` checks that the menu/workspace exposes
     no world-size selector, a new world still has 150 rows and fitted columns,
     and the canvas reflects that world. This is a guard on current product
     behavior, not a larger-world test.
2. **Implementation:** add `tools/scaleProfile.mjs`, a Node-only, no-argument
   command. It loads `particles.json`, seeds physics with `0`, profiles fixed
   dimensions `[260×150, 520×150, 520×300]`, and creates a deterministic
   sand/water/fire workload whose proportions match the existing 260×150
   performance fixture. The largest synthetic case is 156,000 cells, below the
   existing 2,000,000-cell import limit. Keep the matrix internal: no size CLI
   flags, UI, saved-world entry, or runtime configuration.
3. For each synthetic size, report world-creation time separately from
   simulation cost; initialize the workload outside the timed step loop; warm
   up before sampling; then report average, median, p95, and ms/cell for
   `stepSimulation()`. Include the cell count and
   `estimateWorldMemoryBytes()` estimate, clearly labelled as a model estimate
   rather than measured process memory. Label measurements physics-only: do not
   claim to measure `game.js` rendering or SVG overlays. Use the existing
   `process.hrtime.bigint()` timing convention. Profile output is informational,
   not a gate.
4. Add package scripts in `package.json`:
   - `profile:scale`: `node tools/scaleProfile.mjs`
   - `test:scale-profile`: `node tools/scaleProfileTest.mjs`
5. After implementation and focused verification, have the docs specialist:
   - Update `docs/PROGRAM_OVERVIEW.md` to describe the report-only profiling
     command, its physics-only boundary, and synthetic-only dimensions.
   - Move only the completed “Profile before changing architecture” bullet from
     `docs/FUTURE_IDEAS.md` into
     `docs/archive/scale-profiling-2026-09-23.md`, recording that the profile
     tool complements the existing 260×150 performance assertion.
   - Update `docs/archive/README.md` to index that dated archive.
   - Leave the deferred Worker/WASM and WebGL/WebGPU roadmap bullet and the
     material-validator idea in `docs/FUTURE_IDEAS.md` unchanged.
6. Review the final diff for absence of changes to app dimensions, controls,
   saved-world code, and physics semantics. After the plan is executed, archive
   this plan at
   `docs/archive/plans/scale-profile-infrastructure-2026-09-23.md` per project
   policy.

## Exact files in scope

- Add `tools/scaleProfile.mjs`.
- Add `tools/scaleProfileTest.mjs` before implementation.
- Add `e2e/scaling/default-world.spec.mjs` before implementation.
- Update `package.json` with the two profiling scripts.
- Update `docs/PROGRAM_OVERVIEW.md`, `docs/FUTURE_IDEAS.md`, and
  `docs/archive/README.md` after verification.
- Add `docs/archive/scale-profiling-2026-09-23.md` with only the completed
  profiling roadmap content.
- Archive the executed plan as
  `docs/archive/plans/scale-profile-infrastructure-2026-09-23.md` after the
  work is complete.

Do not modify `physics.js`, `game.js`, `ui.js`, `index.html`, `worldConfig.js`,
`constantsAndGlobalVars.js`, `saveLoadGame.js`, or
`e2e/scaling/large-world.spec.mjs` for this change.

## Acceptance criteria

- `npm run profile:scale` runs headlessly with no DOM or browser dependency and
  prints one clearly labelled result per fixed matrix size. It reports
  initialization and simulation timing separately, includes average/median/p95
  and per-cell simulation cost, and has no flaky timing threshold.
- The fixed synthetic matrix includes the 260×150 comparison baseline and
  larger test-only grids, remains below 2,000,000 cells, and cannot be changed
  through UI or command-line size options.
- The profile tool uses deterministic setup and seeded randomness; fixture
  construction and warm-up are excluded from timed step samples.
- The existing seeded simulation behavior and 260×150 `<8 ms/frame` assertion
  are untouched.
- New-game rows remain 150 and columns remain workspace-fitted. No larger
  playable canvas, size control, save-format change, import-cap change, or
  runtime default change is introduced.
- The profile output accurately disclaims rendering coverage and identifies
  memory as an estimate.
- Only the completed baseline-profiling bullet is archived; Worker/WASM/GPU
  proposals remain active and explicitly deferred in `docs/FUTURE_IDEAS.md`.
- The separate physics-refactor audit is not an implementation task here; its
  exact follow-up planning-document deliverable is specified below.

## Focused headless verification

Do not run tests while planning. For implementation verification, use the
focused commands below (Playwright uses its configured headless Chromium
default):

```text
npm run test:scale-profile
npm run profile:scale
npx playwright test e2e/scaling/default-world.spec.mjs e2e/persistence/export-import.spec.mjs e2e/physics/determinism.spec.mjs --workers=1 --trace=off
```

The Playwright files cover the unchanged default, saved-world round-trip, and
deterministic simulation as three focused areas. Do not run the stale
`e2e/scaling/large-world.spec.mjs` as part of this verification. Full-suite
execution is not part of this plan and requires user approval under project
policy.

## Separate physics-refactor audit document

The separate follow-up planning deliverable is
`.kilo/plans/physics-js-refactor-audit.md`, titled **“Physics Core Size and
Incremental Refactor Audit.”** It is an audit/plan document, not authorization
to extract modules or change physics in this scale-profile task. It should
contain:

1. Purpose, scope, and explicit non-goals (no Worker/WASM/GPU rewrite assumed).
2. A subsystem map: definition compilation and world lifecycle; persistence
   capture/restore; thermal transfer and state changes; reactions and plant
   growth; electrical charge/power; powder/liquid/gas movement and liquid
   surfaces; wind/airflow/projectiles; and storage, vents, tubing, and mixers.
3. A module-global/cache inventory and dependency map, including dimensions,
   world arrays, definitions, ambient settings, frame counter, seeded RNG,
   liquid/plant/storage/tubing/wind caches, shared cell helpers, and direct
   consumers (`game.js`, `ui.js`, `saveLoadGame.js`, `e2eHooks.js`, and tools).
4. Contracts to preserve: flat `y * cols + x` indexing and typed-array layout;
   step-phase order, alternating scan and moved-cell semantics; deterministic
   random consumption; transient versus persistent state; and
   `captureSimulationState()` / `restoreSimulationState()` and save-format
   compatibility. Record that physics remains DOM-free/headless.
5. Candidate extraction seams ranked by coupling, with a dependency-ordered,
   incremental sequence and explicit stop/go criteria. Do not prescribe a
   broad rewrite before the dependency audit.
6. Risks and mitigations, especially behavior drift from phase ordering,
   random-stream changes, shared mutable arrays/caches, cyclic imports, and
   save/load compatibility.
7. Test and equivalence strategy: seeded headless regression coverage for each
   seam, snapshot/state comparisons where appropriate, focused default-world
   browser checks, and no timing-only claim of behavioral equivalence.

This audit document remains a separate planning artifact; no physics source
extraction, audit-driven implementation, or edits to `physics.js` are included
in the scale-profile scope.
