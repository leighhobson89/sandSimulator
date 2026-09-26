# Plan: canvas feedback and electrical logic gates

## Goal

Make the fixed space below the canvas a live inspection surface while keeping
FPS and particle count in the top row. Add a small, documented logic-gate set
as a separate top-level catalog panel immediately below Electricals, and
consolidate current guide material into the mechanics reference.

## Design scope

### Fixed feedback panel

- Keep FPS and particle count in the existing top row. Use the currently empty
  area directly below the canvas for feedback; it must remain outside the
  canvas scrolling region and stay visible while the world viewport scrolls.
  Give the bottom panel a fixed height: it must not resize or scroll. Reduce the
  canvas's allocated height by 10 px to make room for it.
- Refresh the panel from the current pointer and simulation state each tick.
  Do not display cell numbers. Clear pointer-specific feedback when the pointer
  leaves the canvas. Remove brush-mode feedback.
- When the pointer hovers over empty air, show air temperature, humidity, and
  wind speed.
- For a hovered particle, show its catalog name and classification, current
  temperature, humidity, illumination, and applicable state-transition rule
  (for example, `Water -> Steam above 100 C`). Use the prepared material rules
  and the existing catalog categories as the sources of truth.
- For a hovered machine, show its name, temperature, active/inactive state, and
  declared input/output signal states. Keep the reading tied to live logical
  current, not traveling-Spark animation.
- Move the Battery icon/readout from the top row to the feedback panel. For a
  hovered Battery, include its ordinary environmental/material readings and
  circuit load, plus an estimated time to empty or full where a measurable net
  charge rate exists. Derive charging/discharging state from a rolling
  five-second trend sample so short Spark Block bursts are smoothed. Calculate
  ETA using elapsed seconds across that sample, rather than assuming a fixed
  tick rate. Show `DISCHARGING` in red or `CHARGING` in green according to the
  trend. Do not report an unsupported estimate when the rate is zero or
  unavailable. Document exactly which connected devices and wire loads count.
- Show `Illumination: Not simulated` for this scope. No local light field
  currently exists; do not imply that heat glow or visual effects are simulated
  light.

### Logic gates

- Add a top-level `LOGIC` accordion/panel immediately below the top-level
  Electricals panel, separate from the Electricals grid. Add catalog entries
  for NOT, AND, OR, NAND, and XOR. Draw familiar official gate symbols in the
  project's existing icon style. Give each gate appropriate protruding Elec connectors and
  declared, direction-specific signal ports: NOT has one input; AND, OR, NAND,
  and XOR have two inputs; each has one output. Draw the separate, downward
  supply connector blue, space the two signal protrusions vertically, and have
  gate hover feedback name every connector's role and direction.
- Use wiring model A: existing Copper, Iron, Stainless Steel, and Elec
  conductors carry logical ON/OFF signal levels. Do not add a dedicated
  logical-wire material.
- Give every gate a distinct Battery-backed supply input, separate from its
  signal inputs and output. Signal-pin counts are NOT: one input; AND, OR, NAND,
  and XOR: two inputs; all gates: one output. The separate supply is an
  additional connection, not one of those signal pins.
- Every visible machine protrusion is a functional connector for its specific
  originating port. Compatible direct contact connects to that port; a separately
  drawn extension wire is optional. Preserve Tubing cardinal contact and
  electrical/Copper eight-way contact across declared terminal/contact cells.
  Keep protrusions at about 30 CSS pixels at default zoom and cap them at
  30 screen pixels.
- Evaluate sustained Boolean signal levels only while the gate has a valid
  charged-Battery supply: NOT inverts, AND requires both signal inputs, OR
  accepts either, NAND inverts AND, and XOR is ON for exactly one active input.
  This lets NOT and NAND produce an ON output from OFF signal inputs without
  creating free power. The supply route physically terminates at the gate and
  does not bridge into the output route; only a valid gate result energizes the
  distinct output circuit. Keep signal routes distinct from the supply route
  and prevent input back-feed. Visible Spark trails do not determine signal or
  gate state.
- Charge the gate's own load and the wire/device load of its output network
  back to its separate supply circuit. Do not charge those output loads to the
  signal-source batteries. Keep the routes electrically separate while
  computing supply load, fan-out, and deterministic feedback behavior.
  Synchronous evaluation should force gates that oscillate in a feedback cycle
  OFF for that solve. Preserve gate, ports, wiring, and Battery charge through
  Save/Load; derive gate output state from the live circuits.
- Follow `MACHINE_CONSTRUCTION_STANDARDS.md` for port roles and anchors,
  Elec material and lead width, artwork/hit alignment, collision, runtime
  status, save lifecycle, and machine regression coverage.

## Implementation areas

- UI/layout and pointer inspection: `index.html`, `styles.css`,
  `constantsAndGlobalVars.js`, `ui.js`, and `game.js`.
- Material catalog, gate definitions, and logical evaluation: `particles.json`,
  `physics.js`, and any catalog/runtime modules identified by the architect.
- Focused browser coverage: `e2e/feedback/hover.spec.mjs`,
  `e2e/machines/logic-gates.spec.mjs`, `e2e/machines/ports.spec.mjs`, and
  `e2e/materials/catalog.spec.mjs`.

## Regression scope

- `e2e/feedback/hover.spec.mjs` covers the fixed feedback footer and preserved
  top row, its fixed non-resizing/non-scrolling height, the 10 px canvas height
  reduction, pointer-specific feedback clearing on exit, and footer visibility
  while scrolling the canvas, including stable sizing at a narrow viewport.
  Empty-air hover reports temperature, humidity, and wind speed. It checks Water's
  name/category, temperature, humidity, and transition text;
  `Illumination: Not simulated` is checked separately so it does not imply an
  implemented light field. It also checks live switch input/output signals and
  Battery load, five-second trend-based charge state, burst smoothing, ETA
  calculated from elapsed seconds, relocated icon, and status color.
- `e2e/machines/logic-gates.spec.mjs` covers all 18 truth-table vectors (NOT:
  2; AND, OR, NAND, and XOR: 4 each), with the no-supply case isolated. It also
  covers existing-conductor signal levels, separate Battery-backed gate
  supply, declared signal-port roles/counts and anchors, Elec connector width,
  blue supply-pin artwork, live hover labels and directions for supply,
  inputs A/B, and output, vertical spacing between two-input gate connectors,
  straight outward connector direction and counts (one horizontal input per
  signal input on the left, output horizontal on the right, supply downward),
  and Save/Load/reset lifecycle behavior. The test asserts exactly one straight
  left-facing horizontal protrusion per signal input, one right-facing
  horizontal output, a downward blue supply protrusion, and the configured
  vertical spacing between two-input ports.
- `e2e/machines/logic-gates.spec.mjs` now also contains a realistic AND-route
  case: its third blue supply circuit ends at the gate; two independent
  Battery-backed signal circuits feed A and B; a separate output circuit feeds
  a Lamp. The drafted assertions require the Lamp to stay dark with only the
  supply or only one active signal and light only when both signal inputs and
  supply are active. Battery metrics are compared across the supply-source
  grid and each signal-source grid to ensure gate/output-network load is billed
  to supply, not either signal source. This draft has not been run, so routed
  behavior and cross-route load attribution remain unverified; isolated truth
  vectors do not prove them.
- `e2e/machines/ports.spec.mjs` covers direct touching contact at compatible
  Copper, Elec, and Tubing endpoints for every declared machine port (including
  resolution to the exact owning port, no ambiguous snap neighbors, and
  Save/Load/blueprint persistence without a hand-painted lead). It checks
  visible protrusion length across every machine type with ports (approximately
  30 CSS px at default zoom) and the 30 px cap while dragging connector leads.
- `e2e/materials/catalog.spec.mjs` checks that the top-level `LOGIC` panel is
  the sibling immediately after Electricals and that the gate buttons appear
  under LOGIC.
- Reported prior focused browser batch: 34 passed and one port-fixture geometry
  mismatch failed because its wire exceeded brush reach. The fixture was
  widened and the revised case passed in isolation; the complete batch was not
  rerun, so do not report it as green. The newly drafted routed AND case and
  Battery source-grid assertions above are not included in that result and
  remain unverified. Run focused checks through the documented npm wrapper
  after implementation/review; do not run the full suite without user approval.

## Documentation and completion record

- `docs/GAME_MECHANICS.md` now records the fixed feedback contract, category and
  transition display, Battery trend/load estimates, gate truth tables and
  supply model, connector behavior, metal behavior, and plant/humidity/rain
  guidance consolidated from the former standalone guides. Its gate section
  explicitly marks routed AND behavior and output-network load accounting as
  not yet verified.
- The redundant `docs/METALS_GUIDE.md` and
  `docs/PLANT_GROWERS_HANDBOOK.md` files are removed. `docs/README.md` and the
  root `README.md` point to the consolidated mechanics reference.
- `docs/FUTURE_IDEAS.md` now treats feedback and Battery diagnostics as current
  features, and marks gates as present while retaining routed AND and
  supply-side output-load accounting as verification work. The lighting
  proposal remains partial; illumination is explicitly `Not simulated`.
- `docs/proposals/LOGIC_GATES_AND_LIGHTING.md`, `docs/E2E_TEST_PLAN.md`,
  `docs/MACHINE_CONSTRUCTION_STANDARDS.md`, and the feedback, machine, and
  materials E2E readmes describe the current behavior and drafted routed
  circuit/port-geometry checks, which remain unverified.

### Verification snapshot and remaining work

The earlier focused browser batch recorded 34 passes and one connector-geometry
fixture mismatch. The fixture was widened beyond brush reach and its revised
isolated case passed; the whole batch was not rerun after the edit. The newer
straight gate-stub assertions and AND-to-Lamp/load-accounting case are drafts
and have not been run. No tests were run during this documentation/archive
pass. The AND case checks an independent blue supply ending at the gate, two
separate Battery-backed signal circuits, a distinct output to Lamp, dark output
for supply-only/one-input states, and illumination only with both signals and
supply. Battery diagnostics must attribute gate and output-network wire/device
load to the supply-source grid, never either signal-source grid. These drafted
assertions are outstanding verification, not a passing result.

This plan is archived as the dated record for the implemented feedback and
gate baseline, with the verification limits above preserved.

### Follow-up verification record

The remaining routed AND, output-load attribution, straight-port, and local
illumination work was completed in
[`2026-09-26-lamp-illumination-and-gate-circuit-regressions.md`](2026-09-26-lamp-illumination-and-gate-circuit-regressions.md).
Its focused browser run passed 32/32 on 26 September 2026. The routed case
checks separate supply, A/B signals, and output-to-Lamp connectivity; isolates
the routes with eight-neighbor checks; attributes gate and output-network loads
to the supply circuit; and verifies that the output stops when supply, A, or B
is lost. The port spec verifies straight outward 15-unit machine stubs and the
separate 30-screen-pixel drag cap. See the follow-up plan and current Game
Mechanics for the completed illumination behavior and current status.
