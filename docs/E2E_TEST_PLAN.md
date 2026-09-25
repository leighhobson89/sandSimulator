# Playwright E2E Test Plan

This document is the current maintenance contract for the browser test suite.
Playwright discovers specs only under `e2e/`. Browser tests cover user-visible
workflows; exhaustive non-UI material and rule matrices remain in the headless
integration suite.

## Fresh checkout setup

For a fresh setup, use a current Playwright-supported Node.js release: `22.x`,
`24.x`, or `26.x` ([system requirements](https://playwright.dev/docs/intro#system-requirements)).
The lockfile pins `@playwright/test`, `playwright`, and `playwright-core` to
`1.63.0`; their declared engine floor is Node `20+`. The project does not pin
npm separately; use the npm version shipped with your Node installation. From
the repository root, install the locked packages and the Chromium binary
selected by the test configuration:

```text
npm ci
npx playwright install chromium
```

Only Chromium is configured (`browserName: 'chromium'`). Playwright browser
downloads are version-specific. After changing the locked Playwright version,
run `npm ci` and `npx playwright install chromium` again so the installed
browser matches the package. See Playwright's
[browser installation guide](https://playwright.dev/docs/browsers).

On Linux, install Chromium's operating-system libraries when they are missing
or on a fresh machine. The dependency installer may need administrator access:

```text
sudo npx playwright install-deps chromium
```

See Playwright's [Linux browser dependency instructions](https://playwright.dev/docs/browsers#install-system-dependencies).
The browser binary and OS libraries are separate setup steps.

In PowerShell, if script-execution policy blocks the `npm` or `npx` PowerShell
shim, run the Windows command wrappers instead:

```text
npm.cmd ci
npx.cmd playwright install chromium
```

When running the browser tests in the same PowerShell session, use
`npm.cmd run test:browser` if the `npm` shim is blocked.

The browser-test command starts `node tools/serve.mjs` automatically through
`playwright.config.mjs`; do not start a second server. The default URL is
`http://127.0.0.1:4173`. Set `PLAYWRIGHT_PORT` to change the port. The config
does not reuse a server already listening there, so the selected port must be
free before the test command starts.

If Playwright reports that its Chromium executable is missing, first check
whether the reported path is absent or inaccessible (see below). For a genuinely
missing browser, run the install command above from the repository root after
`npm ci`, then retry the same npm test wrapper. If Linux reports missing shared libraries, install them
with `sudo npx playwright install-deps chromium`. Keep the configured Chromium
and repository Playwright config when troubleshooting; do not switch browsers
or override browser launch settings.

## Windows agents: browser cache permissions

On 25 September 2026, the agent shell ran as `codexsandboxoffline`, while
`USERPROFILE` and `LOCALAPPDATA` still pointed to Leigh's profile. The installed
Playwright Chromium was present under `%LOCALAPPDATA%\ms-playwright`, but its
cache ACL allowed only Leigh, Administrators, and SYSTEM. The sandbox account
received `EPERM`. Playwright's executable check catches access errors and can
display "Executable doesn't exist" for this case.

Use `whoami` to identify the actual process account. Inspect the exact executable
path from the error using `Get-Item -LiteralPath '<reported path>' -ErrorAction Stop`.
An access-denied error must be resolved before concluding the browser is absent;
`Test-Path` or `existsSync()` alone cannot establish that distinction.

For an authorized test run, the agent should use its execution tool's supported
`sandbox_permissions: "require_escalated"` option with a justification explaining
the browser-cache access, keeping the repository working directory and command:

```text
npm run test:browser -- e2e/navigation --workers=1 --trace=off
```

This ran as Leigh and passed **6/6 tests in 8.8 seconds** without reinstalling
anything or changing browser configuration or ACLs. The existing Windows setting
`sandbox = "elevated"` still creates a restricted sandbox account; command-level
approval is a separate mechanism. If a future session cannot request access,
check the Codex permissions control: **Ask for approval** or **Approve for me**,
when available, can review such requests. A review rejection must be respected
and reported. See [OpenAI's sandbox and approval documentation](https://learn.chatgpt.com/docs/sandboxing).

No permanent allow rule was installed. Future agents should follow this
documented approval path; a restart or Full Access setting is not required for
the demonstrated fix. Full-suite test authorization still follows `AGENTS.md`.
Do not repeatedly reinstall into a denied cache. If an installer is interrupted,
record the interruption rather than treating its exit code as an independent
installer failure.

## Reports and failure artifacts

Local runs print the list reporter to the terminal. Playwright writes the
configured trace, screenshot, and video for failed tests under
`test-results/playwright`. With `CI` set, the config uses line and HTML
reporters; the HTML report is written to `playwright-report` and is not opened
automatically. The failure artifacts remain under `test-results/playwright`.
Both output directories are ignored by Git. This repository does not configure
a CI artifact-upload step, so a CI runner only preserves these reports when its
own workflow captures them. See the [Playwright HTML reporter guide](https://playwright.dev/docs/test-reporters#html-reporter).

## Current Architecture

- `playwright.config.mjs` starts `tools/serve.mjs` and runs
  `e2e/**/*.spec.mjs`. Local and CI reporters and failure-artifact locations
  are described in [Reports and failure artifacts](#reports-and-failure-artifacts).
- `e2e/helpers/canvas.mjs` maps pointer coordinates through the rendered canvas
  rectangle and provides `canvasViewportMetrics()` plus
  `scrollCanvasToCell()` for zoomed/scrollable viewports. `gamePage.mjs` owns
  startup, pause, deterministic stepping, and state inspection. `diagnostics.mjs`
  attaches screenshots and semantic state. Starts that select the 520 x 300
  world raise the test and page timeouts to 120 seconds, covering world startup
  and subsequent save/load work in those cases.
- `e2e/helpers/contract.spec.mjs` protects helper, mapping, rendering, stepping,
  and snapshot-restore contracts.
- `e2e/navigation/` and `e2e/accessibility/` cover startup, themes, dialogs,
  focus, keyboard behavior, ARIA state, and the shared theme-styled tooltips for
  toolbar buttons, checkboxes, and the theme selector. The Visualizations modal
  coverage checks its six-option grid, modal semantics, narrow viewport bounds,
  safe placeholders, Escape and Close behavior, and focus restoration. The Ember
  tooltip background is opaque.
- `e2e/tools/` covers painting, shapes, Grabber, and environment controls. The
  environment specs check the Visualizations section and Environment order,
  equal-width rows, narrow sidebar fit, existing control behavior, Heat
  rendering, local Humidity colors without field mutation, Wind speed colors and
  direction marks (including localized wind-tool trails), exclusive mode
  switching, and Normal restoration. `e2e/tools/environment.spec.mjs`
  also checks the accessible General Wind and Gust Strength range handles,
  their `0-50` bounds, keyboard push-through and lower-bound clamping behavior,
  and Breeze as their shared master toggle.
- `e2e/tools/zoom.spec.mjs` covers the transient four-level standard-world zoom
  and five-level 520×300 zoom. Both sizes start fitted at level 1 with all edges
  visible and no scrolling; the level factors are `[1, 1.5, 2, 3]` and
  `[1, 2, 3, 4, 6]`. The spec also covers zoom-only vertical wheel behavior and
  fading status, fitted versus scrollable layouts, thin themed scrollbars,
  arrow-key scrolling, coordinate-preserving painting/erasing, mode-gated
  middle-click material sampling, prevented middle-button defaults and
  unchanged viewport offsets, continued simulation, workspace reset,
  machine-overlay hit testing, and the optional five-percent edge-pan behavior.
  `e2e/tools/painting.spec.mjs` covers all four eligible
  drawing modes, empty-cell and active-tool no-ops, selection synchronization,
  and cancellation of pending Line, Rectangle, and Ellipse gestures.
  `e2e/blueprints/lifecycle.spec.mjs` verifies middle-click no-ops during
  marquee selection and blueprint stamping.
  Horizontal and Shift + wheel remain browser-owned rather than entering the
  application zoom path.
- `e2e/materials/` covers catalog metadata, rendering, and browser-observable
  material reactions. The Insulation catalog spec checks its retained Solids
  entry, heat-retention glossary text, and zero network rate; it also checks
  `thermalNetworkRate` participation by metals including Tubing, molten forms,
  and powered Fan/Heater/Cooler machines. `rendering.spec.mjs` checks local glow color
  interpolation for solid Copper, Battery, Iron, Fan, Cooler, Tubing, and
  Heater, while preserving existing molten gradients.
- `e2e/physics/` covers deterministic, user-visible settling, thermal, and
  reaction behavior. Thermal coverage includes open versus enclosed air,
  chamber breach, local rays/fire/Lava effects, retained Steam, Insulation
  isolation, Wall mixed-face cooling, and heat transfer through fast metal
  bridges between enclosed chambers without open-air leakage.
- `e2e/machines/` covers placement, powered machines, storage, tubing, Vents,
  Mixers, electrical behavior, and machine persistence. Fan placement coverage
  checks the 1-50 speed range and default speed 7; machine persistence checks
  one-time migration of legacy Fan speeds in both saved worlds and blueprints.
- `e2e/blueprints/` covers capture, stamping, history, lifecycle, and portable
  persistence.
- `e2e/scaling/default-world.spec.mjs` covers the two fixed New Game choices
  (260×150 and 520×300), the usable-canvas threshold for the larger choice,
  chooser cancellation/replacement behavior, and the absence of 780×450 and
  1040×600 choices. The 520×300 option becomes available when the usable
  `#canvasArea` content box is at least 260×150 CSS pixels. Camera and viewport
  behavior is covered with `e2e/tools/zoom.spec.mjs`; persistence coverage
  includes the selected world size in save, resume, and load flows. The
  profiler's 1040×600 dimension remains synthetic and is not a UI option.
- `e2e/persistence/` covers Save/Load, resume choices, validation, clear
  behavior, and the live Autosave checkbox. It also verifies modern
  visualization-mode save/load and restores Heat from a legacy payload with
  `tools.heatViewOn` but no `tools.visualizationMode`. Its cases verify state
  across New Game, Resume, Load, and write failure. In
  `e2e/persistence/export-import.spec.mjs`, wind strengths round-trip
  independently and a legacy `tools.windStrength` value migrates to an ordered
  pair on the new scale (`15` becomes `50/50`). Disabling Autosave stops future
  automatic writes but preserves the current resume save, while re-enabling
  starts a new five-minute interval without an immediate write.
  `e2e/regressions/` is available for defects without a more specific
  functional-area owner.

Historical verification snapshot for the visualization UI rework
(24 September 2026):

- `npm.cmd test`: 336 passed, 0 failed.
- `npm.cmd run test:smoke`: passed.
- `npm.cmd run test:scale-profile`: Scale profile checks passed and World
  allocation checks passed.
- Full browser suite: 167 passed, 0 failed (12.8 minutes).
- Focused browser regressions for tools, accessibility dialogs, and
  persistence passed, including the localized Wind trail direction case.

Wind overhaul verification attempt:

- `npm.cmd test -- --focus=wind-overhaul`: 17 passed, 0 failed.
- The broader deterministic harness was stopped before suite completion after
  the wind section passed; no result is claimed for the rest of that harness or
  the full test suite.
- The focused npm browser run could not launch tests in this environment, so
  the slider and save/load browser assertions remain unverified here.

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

Use the project's npm test commands as the only test entry points. Keep
deterministic simulation regressions in the `tools/` harnesses and browser
regressions as Playwright specs under `e2e/`. Run the full checks with one
worker:

```text
npm test
npm run test:smoke
npm run test:scale-profile
npm run test:browser -- --workers=1 --trace=off
```

Run just the wind deterministic regression section with the existing npm test
entry point:

```text
npm test -- --focus=wind-overhaul
```

`npm run test:browser -- --workers=1 --trace=off` runs the full browser suite.
To run a focused functional area or spec, pass its path through the npm wrapper:

```text
npm run test:browser -- e2e/physics --workers=1 --trace=off
```

The focused visualization and environment regressions can be run with the
owning tools, accessibility, and persistence specs:

```text
npm run test:browser -- e2e/tools/environment.spec.mjs e2e/tools/edge-cases.spec.mjs --workers=1 --trace=off
npm run test:browser -- e2e/accessibility/dialogs.spec.mjs --workers=1 --trace=off
npm run test:browser -- e2e/persistence/export-import.spec.mjs --workers=1 --trace=off
```

The wind slider behavior and independent save/load migration cases are owned by
`e2e/tools/environment.spec.mjs` and
`e2e/persistence/export-import.spec.mjs`, respectively. Run either spec alone
through the same npm wrapper when iterating on its focused area.

Fan scale and legacy save migration coverage is owned by the machine placement
and persistence specs:

```text
npm run test:browser -- e2e/machines/placement.spec.mjs e2e/machines/persistence.spec.mjs --workers=1 --trace=off
npm test -- --focus=fan-wind-scale-alignment
```

The Insulation material catalog coverage is owned by
`e2e/materials/catalog.spec.mjs`; run it through the same wrapper:

```text
npm run test:browser -- e2e/materials/catalog.spec.mjs --workers=1 --trace=off
```

The focused thermal physics and material catalog specs can be run together:

```text
npm run test:browser -- e2e/physics/thermal.spec.mjs e2e/materials/catalog.spec.mjs --workers=1 --trace=off
```

The scale profile's allocation and pure math/CLI checks are headless Node tests
and can be run independently from Playwright. `npm run profile:scale` reports
the fixed physics-only synthetic matrix; it is diagnostic evidence, not a
60-fps guarantee. Its 1040×600 case remains synthetic; playable choices are
260×150 and 520×300. To verify chooser, gating, and scaling behavior, run the
scaling spec together with the determinism regression:

```text
npm run test:scale-profile
npm run test:browser -- e2e/scaling/default-world.spec.mjs e2e/physics/determinism.spec.mjs --workers=1 --trace=off
```

Run the middle-click picker regressions without running the full suite:

```text
npm run test:browser -- e2e/tools/painting.spec.mjs e2e/tools/zoom.spec.mjs e2e/blueprints/lifecycle.spec.mjs --workers=1 --trace=off
```

For the canvas viewport feature, run the focused spec through the same wrapper:

```text
npm run test:browser -- e2e/tools/zoom.spec.mjs --workers=1 --trace=off
```

Browser coverage remains Playwright-based. Use the documented npm wrapper for
all focused and full browser runs; do not invoke Playwright as a standalone
command.

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
  screenshots, traces, and videos when failures occur. Preserve the HTML report
  on CI runs when `CI` is set, as described in
  [Reports and failure artifacts](#reports-and-failure-artifacts).
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
