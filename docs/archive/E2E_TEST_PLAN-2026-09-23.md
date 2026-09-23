# Elemental Foundry Playwright E2E Plan

This plan is specific to the current Elemental Foundry implementation. It
documents the completed browser migration and its coverage contract. The
current source of truth is the 121-test `e2e/` tree; dated superseded notes are
kept separately in [`archive/`](archive/). Every functional area has
exhaustive user-visible coverage. The browser physics contract in `e2e/physics/`
covers the user-visible surface, while exhaustive non-UI material and rule
matrices remain in the headless integration suite.

## 1. Codebase Audit

### Application architecture and startup

- `index.html` is the single-page entry point. It contains the menu, simulator
  workspace, `#canvas`, tool controls, save/import dialogs, machine dialogs, and
  blueprint controls.
- `ui.js` registers the `DOMContentLoaded` startup handler (line 69), loads
  `particles.json`, initializes the world, caches DOM elements, builds material
  buttons and themes, and wires all controls.
- `game.js` owns canvas sizing, rendering, screen state, drawing primitives,
  machines/blueprints at the UI boundary, and the animation loop.
- `physics.js` is DOM-free and owns the cellular simulation. It uses flat typed
  arrays, one entry per cell, rather than rigid-body objects. `stepSimulation()`
  is the discrete physics tick.
- `constantsAndGlobalVars.js` stores mutable UI/game flags and cached elements.
- `saveLoadGame.js` serializes typed-array simulation state and tools into a
  compressed URI-safe string and owns the local resume slot.
- `themes.js` owns theme selection and the `elemental-foundry.theme` localStorage
  value. `lzString.js` provides compression.
- `tools/serve.mjs` is the real-app static server. It serves ES modules and
  `particles.json` over HTTP; Playwright already starts it on port 4173.

### Game loop, rendering, and timing

- `game.startGame()` creates the one-pixel-per-cell canvas and starts one
  `requestAnimationFrame(gameLoop)` loop.
- `gameLoop()` calls `stepSimulation()` unless paused, fades wind trails, draws
  one `ImageData` frame, updates the FPS readout, and schedules the next frame.
- Physics is frame-count based. It currently has no public `dt` parameter, so
  browser frame cadence must not be used as a physics assertion boundary.
- UI intervals include paint repetition (`ui.js`, 30 ms), machine/mixer dialog
  refresh (150 ms), and autosave (`saveLoadGame.js`, 60 s). These are sources of
  asynchronous flakiness and need explicit cleanup or fake-clock control in
  tests.

### Canvas mapping and input

- `ui.js:1836` maps `clientX/clientY` through `getBoundingClientRect()` to grid
  cells. The canvas is CSS-stretched while its internal dimensions remain grid
  dimensions.
- Mouse input is `mousedown` on the canvas, `mousemove` on the canvas, and
  `mouseup` on `window` (`ui.js:1533-1752`). Right-click temporarily erases.
- Touch input has separate `touchstart`, `touchmove`, and `touchend` paths.
- Input priority is blueprint stamp, marquee, machine dialog, grabber, machine
  placement, line/shape preview, then brush painting.
- `cellFromEvent()` is the source of truth for mapping. The E2E helper mirrors
  its center-of-cell mapping using rendered dimensions, with contract coverage
  for fractional CSS scaling, resize, and narrow viewports.

### State, persistence, randomness, and physics

- Simulation state is `world` in `physics.js`, comprising typed arrays such as
  `type`, `temp`, `life`, `moved`, `shade`, `surface`, `power`, `charge`, and
  airflow planes. `getWorld()`, `setCell()`, `clearWorld()`, and
  `captureSimulationState()` are existing seams for test setup and validation.
- `prepareDefinitions()` resolves material names from `particles.json` to IDs.
  Definitions include density, temperature, phase transitions, reactions,
  conductivity, machines, tubing, storage, and mixer behavior.
- The engine implements gravity/settling, liquids and gases, heat transfer and
  phase changes, fire/life decay, reactions, wind, electrical propagation,
  machines, tubing, vents, storage, and mixers. There is no separate spatial
  partition module: flat-grid/index-neighbor traversal is the spatial system.
- Randomness is already isolated in `physics.js` (`setRandomSource`,
  `setRandomSeed`, `getRandomSeed`, `resetRandomSource`). E2E setup calls the
  seed hook before painting and records the seed in diagnostics.
- `saveLoadGame.js` persists `elemental-foundry.autosave.v1`; exported save
  strings include simulation, tools, and blueprints. The save timestamp makes
  raw string equality unsuitable; compare parsed semantic state.

### Existing tests and tools

- The current browser suite is under `e2e/` and contains 121 tests. It uses
  Playwright actions for controls, dialogs, gestures, canvas input, and visible
  state, with deterministic physics-boundary setup only for source fixtures.
- The former `tests/browser.spec.mjs` suite, its six snapshots, and
  `e2e/baseline.spec.mjs` were removed after their behavior was covered by the
  current functional-area specs. Those paths are historical migration context,
  not current sources.
- `tools/simTest.mjs` is a large deterministic headless physics regression suite.
  Retain it as an engine integration test. Move only user-visible workflows to
  Playwright; keep conservation, level settling, reactions, thermal behavior,
  electrical behavior, wind, machines, vents, mixers, and blueprint data math
  at this faster level.
- `tools/smokeTest.mjs` is a DOM/browser stand-in wiring test. It remains a
  fast startup contract check alongside Playwright and is not replaced by
  visual E2E tests.
- `tools/serve.mjs` is test infrastructure, not a test. Keep and use it as the
  Playwright `webServer` command.
- Current failure artifacts are produced by Playwright traces, screenshots,
  videos, HTML reports, and the shared state diagnostics helper. No snapshot
  directory is required by the migrated suite.

## 2. Discovered Functional Areas

1. Application startup, menu, New Game, Resume Game, and screen transitions.
2. Theme selection, theme persistence, and accessible selected state.
3. Canvas sizing, desktop layout, pixelated rendering, and canvas mapping.
4. Material catalog generation, selection, tooltips, and material metadata.
5. Brush painting, repeated paint timer, eraser/right-click, and keyboard tools.
6. Line, rectangle, ellipse, brush-size, and shape preview/commit behavior.
7. Grabber pickup, movement, cancellation, and drop behavior.
8. Environment controls: air temperature, layers, lapse, breeze, wind strength,
   heat view, and readouts.
9. Cellular physics: gravity/settling, collision/blocking, liquid flow,
   gas/fire rise, conservation, and temperature integration.
10. Material reactions: phase changes, burning, extinguishing, growth, and
    decay/residue.
11. Electrical systems: batteries, conductors, charge, pulses, and powered
    machines.
12. Machines and tubing: placement/orientation, heaters/coolers/fans, storage,
    vents, tubing flow, and mixer inventories/release.
13. Blueprints: marquee selection, copy, preview/stamp, slot library, undo/redo.
14. Save/export/import, validation errors, autosave, resume choice, and clear.
15. Desktop keyboard accessibility, dialogs, focus, ARIA state, and tooltips.

## 3. Current E2E Structure

```text
e2e/
  helpers/
    canvas.mjs              # CSS/client to grid-cell mapping and real gestures
    gamePage.mjs            # startup, pause, deterministic stepping, inspection
    diagnostics.mjs         # state JSON and screenshot attachments
    contract.spec.mjs       # helper, mapping, rendering, and stepping contracts
  navigation/
    menu.spec.mjs
    themes.spec.mjs
  accessibility/
    accessibility.spec.mjs
    dialogs.spec.mjs
  tools/
    painting.spec.mjs
    shapes.spec.mjs
    grabber.spec.mjs
    environment.spec.mjs
    edge-cases.spec.mjs
  physics/
    settling.spec.mjs
    thermal.spec.mjs
    reactions.spec.mjs
    determinism.spec.mjs
  materials/
    catalog.spec.mjs         # grouping, selection, accessible tooltips, metadata
    rendering.spec.mjs       # selected material painted at an exact canvas cell
    reactions.spec.mjs       # deterministic browser-observable physics outcomes
  machines/
    placement.spec.mjs       # all machine placement/orientation/settings
    powered.spec.mjs         # powered Fan/Heater/Cooler outcomes
    storage.spec.mjs         # storage intake, capacity, purge, and dialogs
    tubing-vents.spec.mjs    # topology, rates, visualization, Vent release
    mixer.spec.mjs           # recipes, non-mixing output, purge, release
    persistence.spec.mjs     # machine fields through portable save/import
    electrical.spec.mjs
  blueprints/
    capture-stamp.spec.mjs
    history.spec.mjs
    lifecycle.spec.mjs
    persistence.spec.mjs
  persistence/
    export-import.spec.mjs
    autosave-resume.spec.mjs
    validation.spec.mjs
    choices.spec.mjs
  regressions/
    README.md               # focused bug-fix ownership and additions
```

## 4. Harness Architecture

`playwright.config.mjs` runs only `e2e/**/*.spec.mjs`. Default execution is
headless. Use `npx playwright test --workers=1 --trace=off` for the accepted
headless verification and `npx playwright test --headed --workers=1 --trace=off`
for the equivalent headed run; both execute the same 121 tests. Use `--project`
only if additional browser projects are later added.

Each test creates a fresh browser context, opens New Game, pauses immediately,
seeds randomness when needed, and uses `GamePage` for setup.
The helper contract suite in `e2e/helpers/contract.spec.mjs` verifies this
shared harness behavior directly, including CSS-to-cell mapping and snapshot
restore semantics.
`canvas.mjs` computes screen points from the actual rendered bounding rectangle
rather than assuming a fixed canvas size. `diagnostics.mjs` attaches a full-page
PNG and semantic state JSON to failed tests; Playwright retains trace,
screenshot, and video on failure through the config.

## 5. Functional-Area Coverage Contract

Coverage is behavioral, not a test-count or line-coverage percentage. A
functional area is complete only when its focused Playwright specs exercise all
user-visible code paths identified in the audit, including the normal workflow,
alternate branches, boundary values, invalid/rejected input, cancellation, and
state reset behavior. The area checklist is:

- Enumerate every control, dialog, state indicator, rendering surface, and
  persistence field owned by the area.
- Exercise each control through real Playwright clicks, keyboard input, pointer
  gestures, or mapped canvas coordinates rather than calling UI handlers.
- Cover happy paths and the error, cancellation, disabled, empty, full,
  clipped, disconnected, and out-of-range branches that a user can reach.
- Assert semantic DOM/ARIA state and exact deterministic game state, including
  all persisted fields relevant to the area, not only visible material types.
- Cover round trips through save/import/resume when the area participates in
  persistence; verify malformed data is rejected without mutating live state.
- Reuse deterministic physics-boundary setup only for source fixtures. Do not
  replace user workflows with direct module calls or duplicate exhaustive
  engine matrices that belong in integration tests.
- Run the focused area twice: once with the default headless configuration and
  once with `npx playwright test <focused-spec-path> --headed`. The headed run
  must use the same focused spec path, server, hooks, seed, and test steps.
  Retain diagnostics on failure and record any explicitly integration-only
  behavior in the area README.

All fifteen current areas satisfy this checklist and pass in both accepted
modes. A future area or behavior change must complete the same checklist before
it is recorded as green.

## 5a. Bug-Fix Regression Coverage

Whenever a bug is found and fixed, add a focused regression test to the
appropriate spec under `e2e/regressions/`. If the established owner is a
functional-area spec, keep the test there while ensuring the regression
scenario remains discoverable. The `e2e/regressions/` folder is the ongoing
  home for bug-fix regression coverage. It currently has no regression-only
  specs because repaired defects are owned by their functional-area specs.

## 6. Determinism Strategy

- **Physics ticks:** add a test-only engine API such as
  `window.__GAME_INSTANCE__.step(count)` that calls `stepSimulation()` exactly
  `count` times while paused. This is preferable to timing assertions.
- **Animation loop:** refactor `gameLoop(now)` to calculate a clamped delta only
  for rendering/readouts, or add an injected scheduler. In test mode, stop the
  automatic RAF after startup and let `step()` render explicitly. Production
  behavior remains RAF-driven.
- **Delta-time/clamping:** if a `dt` API is introduced, clamp large gaps (for
  example to a documented maximum) and test 0, nominal, and oversized values.
  Do not let a background tab turn one RAF gap into hundreds of physics ticks.
- **Randomness:** call existing `setRandomSeed(seed)` through the test hook and
  expose the active seed in `inspect()`. Never monkey-patch global `Math.random`
  in Playwright.
- **Canvas input:** dispatch real Playwright mouse events at mapped cell
  centers. Validate mapping with a paused single-cell paint and inspect the
  resulting `type` plane. Use `page.mouse.move(..., { steps })` for drags.
- **Timers:** pause before state setup; use Playwright clock only for UI timer
  workflows such as autosave and repeated paint. Avoid `waitForTimeout`; poll
  semantic DOM state or advance deterministic steps.
- **Assertions:** exact positions mean exact cell occupancy, not CSS pixels. Use
  tolerances only where a documented randomized or asynchronous system requires
  them, and always preserve the seed and frame count in failure output.

## 7. Production Refactors and Hooks

The current test adapter and scheduler provide the migration seams required by
the focused suites:

1. A test-build or query-flag guarded `window.__GAME_INSTANCE__` adapter is
   available after startup. It exposes read-only `inspect()`, `step(count)`,
   `setRandomSeed(seed)`, `canvasToCell({x,y})`, `captureState()`, and
   `restoreState(state)` methods, returning copied arrays or compact summaries.
2. The test scheduler suppresses uncontrolled RAF progression while `step()`
   controls exact physics ticks; production behavior remains RAF-driven.
3. `physics.js` remains the stable browser physics boundary, with inspection
   data for dimensions, frame, seed, material counts, selected cells, and
   selected typed-array planes.
4. The adapter exposes the production-equivalent canvas mapping using rendered
   canvas dimensions so helper coordinates and application mapping cannot drift.
5. Page lifecycle is the cleanup boundary for paint, dialog, and autosave
   activity. Test hooks are disabled unless the `?e2e` query flag is present.

## 8. E2E Versus Unit/Integration Coverage

**E2E:** menu and dialogs, visible controls, real clicks/drags, tool selection,
canvas mapping, rendering changes, machine workflows, blueprint workflows,
export/import through UI, autosave/resume, desktop layout,
accessibility-visible state, and user-visible physics outcomes after
deterministic user actions.

**Unit/integration:** coordinate math edge cases, shape rasterization, typed-array
serialization, save validation, material definition parsing, individual phase
and reaction rules, conservation, collision/neighbor ordering, temperature
integration, wind/electrical propagation, machine flow rates, and exhaustive
material matrix coverage. `tools/simTest.mjs` is the current integration home.

## 9. Completed Migration Record

- `tools/simTest.mjs` remains the deterministic headless integration suite and
  `tools/smokeTest.mjs` remains the startup and persistence wiring suite.
- Navigation, accessibility, painting, shapes, grabber, environment, materials,
  physics, electrical, machines, blueprints, and persistence workflows are
  organized under their current `e2e/` functional-area folders.
- User actions use real Playwright controls, gestures, dialogs, tooltips, and
  rendered canvas coordinates. Deterministic physics-boundary setup is limited
  to source fixtures and state inspection.
- `tests/browser.spec.mjs`, its six snapshots, and `e2e/baseline.spec.mjs` were
  removed after equivalent migrated coverage passed. The current Playwright
  configuration cannot discover those removed paths.
- Semantic DOM and state assertions are the source of truth for dynamic canvas
  and physics behavior; no dated snapshot is part of the current suite.
- The completed migration is documented in
  [`E2E_PROGRESS-2026-09-23.md`](E2E_PROGRESS-2026-09-23.md). Historical findings
  and superseded paths remain unchanged under `docs/archive/`.

## 10. Current Maintenance Priorities

1. Keep the 121-test browser inventory aligned with user-visible controls,
   dialogs, persistence fields, and reset behavior.
2. Keep `tools/simTest.mjs` responsible for exhaustive non-UI material,
   conservation, and rule-combination matrices.
3. Add focused regressions to the owning functional-area spec or
   `e2e/regressions/` when a repaired defect has no established owner.
4. Preserve deterministic seeds, exact stepping, rendered-dimension canvas
   mapping, and failure diagnostics when extending coverage.

## 11. CI Execution

- `npm test`: deterministic headless physics integration (`tools/simTest.mjs`).
- `npm run test:smoke`: DOM wiring/startup smoke (`tools/smokeTest.mjs`).
- `npx playwright test --workers=1 --trace=off`: full 121-test browser suite in
  headless mode.
- `npx playwright test --headed --workers=1 --trace=off`: the same full suite in
  headed mode.
- `npm run test:browser`: project shortcut for the full current browser suite.
- Run CI with one worker for deterministic shared-resource behavior; retain
  traces, videos, screenshots, HTML report, and attached state JSON as artifacts.
- Headed and headless use the same server, hooks, seed, and test steps. The
  accepted non-browser checks are `npm test` (284/284 assertions with seed `0`)
  and `npm run test:smoke`.
