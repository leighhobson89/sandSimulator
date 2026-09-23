# Playwright E2E Test Plan

This document is the current maintenance contract for the browser test suite.
Playwright discovers specs only under `e2e/`. Browser tests cover user-visible
workflows; exhaustive non-UI material and rule matrices remain in the headless
integration suite.

## Current Architecture

- `playwright.config.mjs` starts `tools/serve.mjs`, runs `e2e/**/*.spec.mjs`,
  and retains traces, screenshots, videos, and the HTML report for failures.
- `e2e/helpers/canvas.mjs` maps pointer coordinates through the rendered canvas
  rectangle and provides `canvasViewportMetrics()` plus
  `scrollCanvasToCell()` for zoomed/scrollable viewports. `gamePage.mjs` owns
  startup, pause, deterministic stepping, and state inspection. `diagnostics.mjs`
  attaches screenshots and semantic state.
- `e2e/helpers/contract.spec.mjs` protects helper, mapping, rendering, stepping,
  and snapshot-restore contracts.
- `e2e/navigation/` and `e2e/accessibility/` cover startup, themes, dialogs,
  focus, keyboard behavior, ARIA state, and tooltips.
- `e2e/tools/` covers painting, shapes, Grabber, and environment controls.
- `e2e/tools/zoom.spec.mjs` covers the transient four-level canvas zoom,
  zoom-only vertical wheel behavior and fading status, fitted versus scrollable
  layouts, thin themed scrollbars, arrow-key scrolling, coordinate-preserving
  painting/erasing, mode-gated middle-click material sampling, prevented
  middle-button defaults and unchanged viewport offsets, continued simulation,
  workspace reset, machine-overlay hit testing, and the optional five-percent
  edge-pan behavior. `e2e/tools/painting.spec.mjs` covers all four eligible
  drawing modes, empty-cell and active-tool no-ops, selection synchronization,
  and cancellation of pending Line, Rectangle, and Ellipse gestures.
  `e2e/blueprints/lifecycle.spec.mjs` verifies middle-click no-ops during
  marquee selection and blueprint stamping.
  Horizontal and Shift + wheel remain browser-owned rather than entering the
  application zoom path.
- `e2e/materials/` covers catalog metadata, rendering, and browser-observable
  material reactions.
- `e2e/physics/` covers deterministic, user-visible settling, thermal, and
  reaction behavior.
- `e2e/machines/` covers placement, powered machines, storage, tubing, Vents,
  Mixers, electrical behavior, and machine persistence.
- `e2e/blueprints/` covers capture, stamping, history, lifecycle, and portable
  persistence.
- `e2e/persistence/` covers export/import, autosave, resume choices, validation,
  and clear behavior. `e2e/regressions/` is available for defects without a
  more specific functional-area owner.

Each test uses a fresh browser context, opens a New Game, pauses before
deterministic setup, and seeds randomness when the scenario needs it. The
`?e2e` adapter exposes copied state inspection, exact stepping, seeded random
control, rendered canvas mapping, and snapshot restore without replacing user
actions. Production behavior remains animation-frame driven.

Use Playwright controls, keyboard input, pointer gestures, dialogs, and mapped
canvas coordinates for user workflows. Use the physics boundary only to create
fixtures or inspect state. Keep conservation, collision ordering, reactions,
thermal behavior, electrical propagation, flow rates, and exhaustive material
combinations in `tools/simTest.mjs`. Keep startup and persistence wiring checks
in `tools/smokeTest.mjs`.

## Commands

Required Playwright verification is headless, using the default configuration.
Headed runs are optional visual or input diagnostics only; they are never an
acceptance or release prerequisite. Do not rerun a passing headless test in
headed mode just to establish mode parity.

Install the browser once when needed:

```text
npx playwright install chromium
```

Run the non-browser checks and the browser suite with one worker:

```text
npm test
npm run test:smoke
npm run test:browser
```

`npm run test:browser` is the headless full-browser-suite command. To run a
focused area, replace the path with its owning folder or spec:

```text
npx playwright test e2e/physics --workers=1 --trace=off
```

Run the middle-click picker regressions without running the full suite:

```text
npm run test:browser -- e2e/tools/painting.spec.mjs e2e/tools/zoom.spec.mjs e2e/blueprints/lifecycle.spec.mjs
```

For the canvas viewport feature, run the focused spec headlessly:

```text
npx playwright test e2e/tools/zoom.spec.mjs --workers=1 --trace=off
```

If a visual or input issue needs inspection, an optional headed diagnostic can
use `npx playwright test <path> --headed --workers=1 --trace=off`. It is not
required after a passing headless run and must never be treated as an
acceptance/release gate.

## Ongoing Maintenance Contract

- Keep the test inventory aligned with every user-visible control, dialog,
  state indicator, rendering surface, and persisted field.
- Exercise controls through real Playwright actions rather than calling UI
  handlers. Use deterministic fixtures only for source state setup.
- Cover normal behavior and reachable alternate, boundary, invalid, rejected,
  disabled, empty, full, clipped, disconnected, cancellation, and reset paths.
- Assert semantic DOM/ARIA state and exact deterministic game state. For saves,
  compare parsed semantic state rather than timestamp-bearing strings.
- Pause before state setup, use exact adapter steps for physics, preserve seeds in
  diagnostics, and avoid `waitForTimeout`. Use Playwright clock controls only
  for UI timer behavior such as autosave or repeated painting.
- Use rendered canvas dimensions for coordinate mapping and retain state JSON,
  screenshots, traces, videos, and the HTML report when failures occur.
- Run the focused area headlessly after changes. Use headed mode only as an
  optional diagnostic, never as an acceptance/release prerequisite. Update the
  owning area README when its scope, fixture boundary, or maintenance contract
  changes.

## Regression Policy

Whenever a defect is fixed, add a focused regression to the owning functional
area. If no established owner exists, add it under `e2e/regressions/`. Keep the
scenario discoverable, use shared helpers, cover the user-visible failure and
reset behavior, and preserve deterministic seed and state diagnostics.

## Future Coverage Work

- Broaden manual viewport, device, and assistive-technology checks as the UI
  grows; these supplement rather than replace automated functional coverage.
- Add browser scenarios for new controls, machine behavior, persistence fields,
  and visible physics outcomes as those features are introduced.
- Add a dedicated regression spec only when a repaired defect has no suitable
  functional-area owner; otherwise keep the case beside its behavior.
- Preserve the separation between browser-visible contracts and exhaustive
  headless rule matrices while extending both suites.
- If scheduling or delta-time behavior changes, retain exact-step coverage and
  add zero, nominal, oversized-gap, and background-tab cases without allowing
  timing to become a physics assertion boundary.
