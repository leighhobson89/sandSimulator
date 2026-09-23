# Elemental Foundry Playwright E2E Plan

This plan is specific to the current Elemental Foundry implementation. It
defines the architecture and migration target. Every functional area must be
expanded to exhaustive user-visible coverage before it is marked complete; the
specs themselves live under `e2e/`.

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
  its center-of-cell mapping and should test at fractional CSS scaling and both
  desktop/mobile viewports.

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
  `setRandomSeed`, `getRandomSeed`, `resetRandomSource`). E2E setup should call
  the seed hook before painting and record the seed in diagnostics.
- `saveLoadGame.js` persists `elemental-foundry.autosave.v1`; exported save
  strings include simulation, tools, and blueprints. The save timestamp makes
  raw string equality unsuitable; compare parsed semantic state.

### Existing tests and tools

- `tests/browser.spec.mjs` is an existing browser-level suite. It covers theme
  rendering, mouse/touch drawing, keyboard shortcuts, material tooltips,
  clear confirmation, mixer behavior, vent tubing, and narrow layout. It should
  be retained temporarily as a compatibility suite, then migrated by behavior
  into the folders below. Its direct dynamic imports and `physics.stepSimulation`
  calls are useful patterns for setup but should move behind the test hook.
- `tools/simTest.mjs` is a large deterministic headless physics regression suite.
  Retain it as an engine integration test. Move only user-visible workflows to
  Playwright; keep conservation, level settling, reactions, thermal behavior,
  electrical behavior, wind, machines, vents, mixers, and blueprint data math
  at this faster level.
- `tools/smokeTest.mjs` is a DOM/browser stand-in wiring test. Retain it as a
  startup contract check, but reduce overlap as Playwright navigation smoke
  coverage grows. It should not be replaced by visual E2E tests.
- `tools/serve.mjs` is test infrastructure, not a test. Keep and use it as the
  Playwright `webServer` command.
- Existing screenshot snapshots under `tests/browser.spec.mjs-snapshots/` remain
  during migration. Rebaseline only after the new test grouping is stable.

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

## 3. Proposed E2E Structure

```text
e2e/
  helpers/
    canvas.mjs              # CSS/client to grid-cell mapping and real gestures
    gamePage.mjs            # startup, pause, deterministic stepping, inspection
    diagnostics.mjs         # state JSON and screenshot attachments
  navigation/
    menu.spec.mjs
    themes.spec.mjs
  tools/
    painting.spec.mjs
    shapes.spec.mjs
    grabber.spec.mjs
    environment.spec.mjs
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
  regressions/
    # Focused bug-fix regression specs; currently empty as this regimen starts.
```

## 4. Harness Architecture

`playwright.config.mjs` runs both `e2e/**/*.spec.mjs` and the legacy
`tests/**/*.spec.mjs`. Default execution is headless for CI. Use
`npx playwright test --headed` to watch real clicks, drags, dialogs, and canvas
painting; use `--project` only if additional browser projects are later added.

Each test creates a fresh browser context, opens New Game, pauses immediately,
seeds randomness when needed, and uses `GamePage` for setup.
The helper contract suite in `e2e/helpers/contract.spec.mjs` verifies this
shared harness behavior directly, including CSS-to-cell mapping and snapshot
restore semantics.
`canvas.mjs` computes screen points from the actual bounding rectangle rather
than assuming a fixed canvas size. `diagnostics.mjs` attaches a full-page PNG and
semantic state JSON to failed tests; Playwright retains trace, screenshot, and
video on failure through the config.

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

An area may be called complete only after this checklist is satisfied and the
focused suite passes in both modes. Partial representative coverage must remain
amber, even when its existing tests pass.

## 5a. Bug-Fix Regression Coverage

Whenever a bug is found and fixed, add a focused regression test to the
appropriate spec under `e2e/regressions/`. If the established owner is a
functional-area spec, keep the test there while ensuring the regression
scenario remains discoverable. The `e2e/regressions/` folder is the ongoing
home for bug-fix regression coverage. It currently has no regression specs
because this regimen is just starting, not because the folder is omitted or
incomplete.

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

## 7. Required Production Refactors and Hooks

1. Add a test-build or query-flag guarded `window.__GAME_INSTANCE__` adapter
   after startup. It should expose read-only `inspect()`, `step(count)`,
   `setRandomSeed(seed)`, `canvasToCell({x,y})`, `captureState()`, and
   `restoreState(state)` methods. Return copied arrays or compact summaries, not
   mutable live references.
2. Add an explicit `render()`/`stepAndRender()` seam in `game.js`, and a test
   scheduler switch that prevents uncontrolled RAF progression while the test
   controls ticks.
3. Keep `physics.js` as the stable public physics boundary. Do not expose
   volatile implementation variables; define a versioned inspection schema with
   dimensions, frame, seed, material counts, selected cells, and selected typed
   array planes.
4. Extract `cellFromEvent` mapping into a shared exported helper or expose the
   equivalent through the adapter so the helper and production mapping cannot
   drift.
5. Add teardown functions for paint/dialog/autosave intervals where needed, or
   ensure a page reload is the only lifecycle boundary. Test hooks must be
   disabled in normal production builds.

## 8. E2E Versus Unit/Integration Coverage

**E2E:** menu and dialogs, visible controls, real clicks/drags, tool
selection, canvas mapping, rendering changes, machine workflows, blueprint
workflows, export/import through UI, autosave/resume, desktop layout,
accessibility-visible state, and a small set of representative physics outcomes
after deterministic user actions.

**Unit/integration:** coordinate math edge cases, shape rasterization, typed-array
serialization, save validation, material definition parsing, individual phase
and reaction rules, conservation, collision/neighbor ordering, temperature
integration, wind/electrical propagation, machine flow rates, and exhaustive
material matrix coverage. `tools/simTest.mjs` is the current integration home.

## 9. Migration Plan

- Retain `tools/simTest.mjs` and `tools/smokeTest.mjs` unchanged initially.
- Split `browser.spec.mjs` theme test into `navigation/themes.spec.mjs`.
- Move startup, clear confirmation, keyboard, tooltip, and mouse drawing into
  `navigation/menu.spec.mjs` and `tools/painting.spec.mjs`.
- Migrate the complete machine workflow into `machines/`: all placement
  directions and previews, powered controls, storage lifecycle, Vent limits,
  tubing topology/rates/visualization, Mixer recipes/non-mixing output, and
  portable persistence. Deterministic physics-boundary setup remains fixture
  setup only; dialogs, controls, tooltips, and canvas gestures are real UI.
- Material catalog grouping, every prepared definition tooltip, selection/tool
  cancellation, rendering, and representative browser-observable reactions are
  covered under `materials/`; exhaustive reaction matrices remain at the
  headless integration layer.
- Keep visual snapshots only for stable shell/layout states; use semantic DOM
  and state assertions for physics and dynamic canvas content.
- Blueprint workflows are covered in
  `e2e/blueprints/capture-stamp.spec.mjs`,
  `e2e/blueprints/history.spec.mjs`, `e2e/blueprints/lifecycle.spec.mjs`, and
  `e2e/blueprints/persistence.spec.mjs`; their deterministic source-cell setup
  uses the browser physics module boundary while selection and stamping remain
  real Playwright gestures.
- Delete the legacy browser spec only after equivalent new specs pass in CI for
  two runs and snapshot ownership is clear.

## 10. Prioritized Roadmap

1. Implement the guarded test adapter, deterministic scheduler, semantic state
   schema, and teardown behavior.
2. Add helper-level contract tests for canvas mapping, seed reporting, stepping,
   state capture/restore, and failure diagnostics. (Complete for mapping,
   stepping, and state capture/restore.)
3. Migrate navigation, painting, desktop accessibility, and persistence smoke coverage.
4. Migrate machines, blueprints, and browser-observable physics workflows.
     (Helpers, blueprints, machines/tubing, and materials catalog/rendering are
     expanded; the separate cellular-reaction area remains integration-led.)
5. Expand material/reaction coverage in `tools/simTest.mjs` or focused integration
   modules rather than multiplying slow browser scenarios.
6. Add CI projects and quarantine policy for flaky visual-only tests.

## 11. CI Execution

- `npm test`: deterministic headless physics integration (`tools/simTest.mjs`).
- `npm run test:smoke`: DOM wiring/startup smoke (`tools/smokeTest.mjs`).
- `npx playwright test e2e/navigation e2e/tools --grep @smoke`: fast browser
  smoke on every pull request.
- `npx playwright test e2e/navigation e2e/tools e2e/persistence`:
  functional shell suite on pull requests.
- `npx playwright test e2e`: full browser suite on protected branches/nightly.
- Run CI with one worker for deterministic shared-resource behavior; retain
  traces, videos, screenshots, HTML report, and attached state JSON as artifacts.
- Run headed locally with `npx playwright test --headed`; headed and headless
  use the same server, hooks, seed, and test steps.
