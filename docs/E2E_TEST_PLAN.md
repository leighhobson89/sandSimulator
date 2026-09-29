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
- `e2e/navigation/menu.spec.mjs` verifies the refreshed menu and preserves the
  Sandbox startup flow. Its first two actions are vertically stacked as New
  Campaign followed by Sandbox; the theme panel sits beneath them, and Terminal
  retains centered alignment. Campaign entry presents the mission briefing
  before the workspace opens. The navigation area also retains Load, Resume,
  theme, pause, and workspace-tab coverage.
- `e2e/campaign/mission.spec.mjs` covers Mission 1, **The First Daffodil**:
  the Sand-only starting habitat, 100 Dry Mud / 1,000 Water / one Daffodil Seed
  player budgets, ideal fixed climate and locks, supply placement, and the
  actual seed-germination objective/event firing once. Exhausted budgeted
  supplies disappear from the material catalog rather than remaining as
  disabled buttons.
- `e2e/campaign/mission-progression.spec.mjs` covers Mission 1 recap resource
  statistics, **OK** dismissal, the completion toast, and persistent
  **ADVANCE** into Mission 2's briefing and Ice scenario. It also checks the
  Mission 2 climate target, initial climate, floor and budgets; hidden Water;
  disabled markers, opacity, and red `DISABLED` tooltips for unavailable
  controls; usable system-action exceptions; Sandbox isolation; named climate
  slider guidance; and pristine Mission 2 climate, world, budgets, and
  objectives after checkpoint Resume. It also verifies that Mission 2's
  Temperature slider and numeric input expose a 30 C maximum, clamp values
  above 30 C, and restore Sandbox's 4,000 C maximum after leaving Campaign.
- `e2e/campaign/mission.spec.mjs` checks the bottom-right
  `#missionToast`, its status semantics and ten-second fade, confirms
  the old full-width `#missionPassedBar` stays hidden, and verifies that the
  top-right `#missionAdvance` action remains enabled after the toast expires.
- `e2e/campaign/mission-three-staged-progression.spec.mjs` covers the blank
  Mission 3 world, staged pile and Steam placement, climate-control unlocks,
  Humidity 95% / Dewpoint 20 C rain targets, 150-transition wet milestones,
  continuing rain until 500 of each material is wet, the 150 C drying cap, the
  2,000 C Lava phase, and campaign completion. Material-phase progress is
  driven through the campaign transition callback; the spec does not simulate
  a full rainfall cycle.
- `e2e/campaign/objective-carousel.spec.mjs` verifies Mission 1's 1/1
  objective and disabled navigation at both ends; Mission 2's four objectives,
  progress rerender stability, and selection resets on restart, reload/resume,
  and advance; and Mission 3's 17 objectives, locked Steam state, boundaries,
  and completed-card selection without auto-advance. The carousel selectors
  include `#missionObjectivePrevious`, `#missionObjectiveNext`,
  `#missionObjectivePosition`, `#missionObjectiveCurrent`, and
  `#missionObjectiveCheck`.
- `e2e/campaign/checkpoint-controls.spec.mjs` covers Restart confirmation and
  cancellation, resetting the authored mission without changing the checkpoint,
  hidden unbudgeted material entries, category auto-expansion and empty-category
  locking/tooltips, and Sandbox catalog and Save-to-Library behavior.
- `e2e/campaign/editor.spec.mjs` covers the main-menu editor entry and docked
  unrestricted canvas workspace, blank/edit/load flows, local draft and
  captured-save round trips, validation and mandatory review, autosave
  suspension with the resume save preserved, marker-bounded file installation,
  replacement cancel/confirm, and source-backup metadata. It also verifies
  round-trip persistence and validation for Mission 2's three
  `environmentTargets` fields and 30 C `controlLimits`, blank layouts,
  objective prerequisites, partial `targetValues` including Dewpoint, and
  objective `unlocks.controls` / `unlocks.controlLimits`. Mission-specific
  slider-limit JSON is entered through `#campaignEditorControlLimits`.
- Campaign editor drafts use localStorage key
  `elemental-foundry.campaign-editor.drafts.v1`. Loading a draft with a captured
  `startingSave` resizes and clears the canvas to the saved dimensions before
  restoring the simulation. Drawing, clearing, or resuming simulation makes a
  capture stale until the developer captures the scene again. Autosave writes
  are suspended while the editor is open; explicitly re-enabling Autosave after
  return releases the write guard.
- Campaign blueprint placement charges the mission budget at the user stamp
  operation. Undo/redo only restores the saved stamp state and does not charge
  those resources again.
- The campaign browser contracts are exposed by `campaign.js`:
  `getMissionDefinitions()`, `getCurrentMission()`, `getCampaignState()`,
  `recordMaterialTransition(fromId, toId)`, `recordMaterialPlacement(name, amount)`,
  `canUseMaterial(name)`, and `canPlaceMissionMachine(name)`. The briefing/HUD selectors include
  `#missionIntroDialog`, `#missionIntroOk`, `#missionHud`,
  `#missionResourceList`, `#missionObjectiveCarousel`,
  `#missionObjectivePrevious`, `#missionObjectiveNext`,
  `#missionObjectivePosition`, `#missionObjectiveCurrent`,
  `#missionObjectiveCheck`, and the floating `#missionToast`. Completion uses
  `#missionCompleteDialog`, `#missionCompleteStats`, and `#missionCompleteOk`;
  after recap dismissal, the canvas action exposes `#missionAdvance` inside
  `#missionAdvanceFloat`. The debug menu's Campaign mission picker is
  `#debugMissionSelect`. The next briefing guidance is `#missionIntroGuidance`.
- `e2e/tools/` covers painting, shapes, Grabber, and environment controls. The
  environment specs check the Visualizations section and Environment order,
  equal-width rows, narrow sidebar fit, existing control behavior, Heat
  rendering, local Humidity colors without field mutation, Wind speed colors and
  direction marks (including localized wind-tool trails), exclusive mode
  switching, and Normal restoration. `e2e/tools/environment.spec.mjs`
  also checks the accessible General Wind and Gust Strength range handles,
  their `0-50` bounds, keyboard push-through and lower-bound clamping behavior,
  and Breeze as their shared master toggle. Base Humidity and player-facing
  Dewpoint sliders both expose `0-100`; the physics API and campaign-editor
  environment profile accept Dewpoint down to `-60`.
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
  cancellation of pending Line, Rectangle, and Ellipse gestures, and a real
  held-brush gesture that repeats paint until release. In the `?e2e` adapter,
  that gesture test advances simulation steps while the pointer remains held
  because requestAnimationFrame is suppressed for deterministic stepping.
  `e2e/blueprints/lifecycle.spec.mjs` verifies middle-click no-ops during
  marquee selection and blueprint stamping.
  Horizontal and Shift + wheel remain browser-owned rather than entering the
  application zoom path.
- `e2e/materials/` covers catalog metadata, rendering, and browser-observable
  material reactions. The catalog spec checks the Electricals grouping for
  Battery, Spark, Spark Dust, Spark Block, and both environment switches, plus
  the switch ID/key/API contract and Vegetation's last/initially-collapsed/new
  game behavior. It also checks Insulation's retained Solids entry,
  heat-retention glossary text, and zero network rate; it checks
  `thermalNetworkRate` participation by metals including Tubing, molten forms,
  and powered Fan/Heater/Cooler machines. `rendering.spec.mjs` checks local glow
  color interpolation for solid Copper, Battery, Iron, Fan, Cooler, Tubing, and
  Heater, while preserving existing molten gradients.
  It also verifies that shared catalog/tooltips clear when leaving those panels
  or entering the canvas, while machine-owned hover tooltips remain visible.
- `e2e/feedback/hover.spec.mjs` covers the fixed, non-scrolling feedback panel,
  preserved FPS/particle-count readout, cleared feedback outside the canvas,
  empty-air measurements, particle category/environment/state-transition
  details and numeric illumination received by material hover. It also checks
  live machine signals and Battery circuit load, five-second charge trend,
  elapsed-time ETA, charge icon placement, and status colors. The panel keeps a
  fixed height on narrow viewports; it does not show cell numbers.
- `e2e/feedback/illumination.spec.mjs` covers powered-Lamp falloff, zoom
  independence, OFF/unpowered behavior, exact distance values, cardinal and
  diagonal readings, additive/clamped sources, Fire/Lava and Oil/Wood-derived
  Fire, Gunpowder's four-tick flash, blockers and transmitting materials,
  transparent compositing, Normal-view tint versus diagnostic palettes,
  edge clipping, zoom registration, stale-field cleanup, save/blueprint rebuild,
  numeric hover, and Lamp emission feedback/tooltip. Its Spotlamp cases check
  the 45-cell powered cone, 40%-at-edge falloff, all eight facings, OFF/unpowered
  behavior, the active cone overlay, and immediate local-field invalidation on
  a Grabber move.
- `e2e/physics/` covers deterministic, user-visible settling, thermal, and
  reaction behavior. Thermal coverage includes open versus enclosed air,
  chamber breach, local rays/fire/Lava effects, retained Steam, Insulation
  isolation, Wall mixed-face cooling, and heat transfer through fast metal
  bridges between enclosed chambers without open-air leakage.
- `e2e/machines/` covers two-stage placement, powered machines, storage,
  Collector intake/sealing, Sprinkler release, machine ports and Tubing, Mixers,
  Splitter flow, electrical behavior, and persistence. Electrical browser
  coverage includes Temperature Switch and Humidity Switch probe means,
  comparator routing, exposed marker and collision geometry, live dialog/hover
  reading and logical-current status, and all four sensor status states. The
  Battery-to-switch-to-Lamp regression checks dedicated DC-current state
  independently of traveling-Spark animation, including delay-only visual
  frames, immediate switch blocking, and Battery-depletion shutdown. The
  Spotlamp/Light Switch cases check Electricals metadata, Elec input/output
  ports, ON and comparator settings, the exact single-cell effective-light
  reading without averaging, comparison boundaries, and powered output gating.
  Machine persistence checks sensor comparison/threshold values through portable
  Save/Load and blueprints, as well as legacy Sprinkler mode and endpoint
  migration and one-time migration of Fan speeds. Fan placement coverage checks
  its 1-50 speed range and default speed 7. The Sprinkler browser coverage lives
  in `e2e/machines/sprinkler.spec.mjs`.
- `e2e/machines/electrical.spec.mjs` also covers the `No wire sparks`
  preference (`localStorage` key `sandSimulator.noWireSparks`), bright powered
  wire bases with bounded moving Z bolts, Battery cells without bolts, the
  centered green/red Battery charge glyph, and static machine artwork reuse.
  Its cadence regression checks the expensive electrical refresh every 30
  stable ticks while Battery drain and pulse countdown remain per tick.
- `e2e/machines/logic-gates.spec.mjs` covers the five gate truth tables and
  absent-supply shutdown, declared signal/supply/output port roles, blue supply
  artwork, hover labels and directions, separated two-input geometry, exactly
  one straight-outward horizontal input per signal input, a horizontal output,
  a downward supply, and Save/Load/reset. Its routed AND-to-Lamp cases use
  distinct supply, A/B, and output circuits; pairwise eight-neighbor checks
  include charged Battery terminals and the complete output route. The Lamp
  stays dark with supply only or one active input, lights only with both inputs
  and supply, and turns off when any source path is lost. Battery metrics bill
  gate and output-network load to the supply source. `e2e/machines/ports.spec.mjs` checks
  direct contact at each compatible machine-port protrusion/contact region,
  exact originating-port ownership, optional extension wires, 15-unit local
  SVG protrusions (about 15 CSS pixels at default zoom), zoom scaling, and the
  separate 30-screen-pixel connector-drag cap.
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
  behavior, and the live Autosave checkbox. `multi-save-registry.spec.mjs`
  checks separate named Sandbox and Campaign snapshots, active-record switching,
  that fresh Sandbox and Campaign starts preserve existing records, and that the
  first Campaign record is created on ADVANCE to unlock its successor, with the
  checkpoint renamed to the newly unlocked mission. `campaign-checkpoints.spec.mjs`
  checks the mission-number-only v3 payload, no checkpoint before ADVANCE,
  hidden in-mission Save/export controls and disabled timed autosave, pristine
  Resume, and migration of legacy full-state v3 Campaign autosaves. Resume must leave the
  checkpoint `saveString` and `updatedAt` unchanged. Portable v1 and v2 saves
  remain readable as Sandbox; v3 Campaign checkpoints store only the mission
  number. Registry assertions use `saveGameToLibrary(name)`,
  `listSavedGames()`, `getActiveSaveId()`, and `loadSavedGame(id)` from
  `saveLoadGame.js`; each listed record exposes its own `id`, `name`, `type`,
  and compressed `saveString`. The Save dialog lists local records and offers a
  Load action for each alongside the existing portable import/export actions.
  The area also verifies modern
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

Each test uses a fresh browser context. Sandbox scenarios open a New Game;
campaign scenarios enter through the campaign briefing. Deterministic scenarios
pause before setup and seed randomness when needed. The `?e2e` adapter exposes
copied state inspection, exact stepping, seeded random control, rendered canvas
mapping, and snapshot restore without replacing user actions. Production
behavior remains animation-frame driven.

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

Focused browser coverage for live feedback, gates, ports, and their catalog
placement can be run together through the documented wrapper:

```text
npm run test:browser -- e2e/feedback/hover.spec.mjs e2e/machines/logic-gates.spec.mjs e2e/machines/ports.spec.mjs e2e/materials/catalog.spec.mjs --workers=1 --trace=off
```

The focused feedback/gate/port/illumination verification completed on 26
September 2026: `e2e/feedback/illumination.spec.mjs`,
`e2e/machines/logic-gates.spec.mjs`, and `e2e/machines/ports.spec.mjs` passed
32/32 tests through the npm browser wrapper.

`npm run test:browser -- --workers=1 --trace=off` runs the full browser suite.
To run a focused functional area or spec, pass its path through the npm wrapper:

```text
npm run test:browser -- e2e/physics --workers=1 --trace=off
```

The browser performance benchmark is a separate, strictly opt-in suite. Run it
only when a performance-specific test is explicitly requested, using
`npm run test:performance`. It is excluded from `npm test`, the ordinary
`npm run test:browser` suite, and routine validation. See
[`performance/README.md`](../performance/README.md) for fixture scope and
measurement details; do not add this benchmark to normal test commands.

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

The focused electrical rendering and refresh regressions run with the electrical
and gate specs:

```text
npm run test:browser -- e2e/machines/electrical.spec.mjs e2e/machines/logic-gates.spec.mjs --workers=1 --trace=off
```

Spotlamp and Light Switch focused verification (27 September 2026):

```text
npm.cmd test -- --focus=spotlamp-light-switch
npm.cmd run test:browser -- --grep "Spotlamp|Light Switch" --workers=1 --trace=off
```

The deterministic section passed **7/7**. The focused browser selection passed
**4/4** across `e2e/feedback/illumination.spec.mjs` and
`e2e/machines/electrical.spec.mjs`.

## Campaign menu and save-library verification (28 September 2026)

The refreshed menu and mode entry points passed **7/7** navigation tests,
including a rerun after fresh-Sandbox saves were isolated into their own record.
Before the First Daffodil/editor follow-up, the initial campaign mission and
resource suite passed **2/2**, including a rerun after the blueprint undo/redo
accounting review. Their focused commands were:

```text
npm.cmd run test:browser -- e2e/navigation --workers=1 --trace=off
npm.cmd run test:browser -- e2e/campaign/mission.spec.mjs --workers=1 --trace=off
```

The selected persistence regression set passed **5/5**. A later focused run of
the complete multi-save registry spec passed **3/3**, including the additional
fresh-Sandbox isolation case:

```text
npm.cmd run test:browser -- e2e/persistence --grep "resume slot is offered|clear cancel and confirm|New Game autosave choices|Load Cancel leaves|legacy single-slot" --workers=1 --trace=off
npm.cmd run test:browser -- e2e/persistence/multi-save-registry.spec.mjs --workers=1 --trace=off
```

An earlier broader persistence attempt exposed save-migration failures. These
were fixed before the focused runs above. The entire persistence area was not
rerun after those fixes, so these focused results do not establish a clean
full-area or full-browser-suite result. The browser performance suite and full
project suite were not run for this handoff.

The related machine-port selection passed **2/2**, covering compatible direct
Elec contact at its declared port and the 15 CSS px protrusion:

```text
npm.cmd run test:browser -- e2e/machines/ports.spec.mjs --grep "direct contact at compatible Elec|every machine port has a visible 15 CSS px protrusion" --workers=1 --trace=off
```

## Campaign checkpoint, restart, and catalog verification (28 September 2026)

The final targeted combined selection passed **15 tests in 1.4 minutes** across
Campaign mission, progression, restart/catalog, checkpoint, and save-registry
coverage. It verifies that no Campaign record exists before Mission 1 ADVANCE;
ADVANCE writes only the next `missionNumber`; completion and recap dismissal do
not write; Save/export and timed Autosave are blocked during Campaign; Resume
rebuilds a pristine mission without changing the checkpoint `saveString` or
`updatedAt`; legacy full-state v3 Campaign data normalizes to a checkpoint;
Restart resets the authored world but leaves the checkpoint unchanged; empty
catalog categories lock and explain their state; and Sandbox records/catalog
remain isolated. The exact wrapper invocation was:

```text
npm.cmd run test:browser -- e2e/campaign/checkpoint-controls.spec.mjs e2e/campaign/mission-progression.spec.mjs e2e/campaign/mission.spec.mjs e2e/persistence/campaign-checkpoints.spec.mjs e2e/persistence/multi-save-registry.spec.mjs --workers=1 --trace=off
```

Two additional focused Sandbox persistence regressions passed **1/1** each:

```text
npm.cmd run test:browser -- e2e/persistence/autosave-resume.spec.mjs --grep "clear cancel and confirm" --workers=1 --trace=off
npm.cmd run test:browser -- e2e/persistence/export-import.spec.mjs --grep "Save and Load round-trip" --workers=1 --trace=off
```

The earlier broad Campaign-plus-persistence run was exploratory and exposed
stale expectations. Those assertions were corrected before the targeted final
runs; the exploratory run is not reported as a passing suite. The final
results cover only the listed focused selections, not the complete Campaign or
persistence areas or the full browser suite. No full deterministic test run was
performed for this handoff.

## Staged materials, control limits, and objective carousel verification (29 September 2026)

The focused Campaign browser area passed **21/21** tests:

```text
npm.cmd run test:browser -- e2e/campaign --workers=1 --trace=off
```

The editor spec was rerun by itself and passed **6/6**:

```text
npm.cmd run test:browser -- e2e/campaign/editor.spec.mjs --workers=1 --trace=off
```

An earlier deterministic-harness checkpoint completed with **408 passed and
24 failed** under `npm.cmd test`, before follow-up repairs. The later full
deterministic harness passed **436/436**; see the final verification section
below. The Mission 2 temperature cap, Mission 3 staged objectives, and physical
Dry Mud-to-Lava checks were also verified.

The Mission 2 checks cover the 30 C mission-specific maximum on both inputs,
clamping, and restoration of the Sandbox 4,000 C maximum. Mission 3 begins
blank, stages material and climate access, holds temperature to 150 C until
drying completes, and unlocks 2,000 C for the final material transitions. The
editor round-trip covers the mission `controlLimits` JSON field,
`#campaignEditorControlLimits`, objective prerequisites, partial target values,
and control unlocks. Carousel coverage verifies its 1-based position, bounded
arrows, completed state without auto-advance, gated item visibility, and
transient selection resets.

## Final campaign feedback and air-transport verification (29 September 2026)

The latest full browser bundle completed **297/299**. The two failures were
followed up individually and each now passes its focused rerun:

- The Base Humidity and Dewpoint slider test now expects the player-facing
  Dewpoint slider minimum to be `0`, matching the control's `0-100` range. The
  physics API and campaign-editor environment profile still accept `-60`.
  The focused environment test passed **1/1**:
  `npm.cmd run test:browser -- e2e/tools/environment.spec.mjs --grep "Base Humidity and Dewpoint sliders" --workers=1 --trace=off`
- The real held-brush test manually advances deterministic simulation while
  the pointer remains held, because `?e2e` suppresses requestAnimationFrame.
  The focused painting test passed **1/1**:
  `npm.cmd run test:browser -- e2e/tools/painting.spec.mjs --grep "holding a real brush gesture" --workers=1 --trace=off`

The full browser bundle was not rerun after those focused fixes, following the
user's instruction not to run another full suite. The recorded full-browser
result therefore remains **297/299**; the focused results do not establish a
full-suite pass. The full deterministic simulation harness passed **436/436**
with `npm.cmd test`. The focused air-circulation harness passed **67/67** with
`npm.cmd test -- --focus=air-circulation`; the solver remained unchanged, and
no scalar-transport behavior defect was reproduced. Existing calm-roll,
uniform-field, and reach-boundary checks passed against the current solver.

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
