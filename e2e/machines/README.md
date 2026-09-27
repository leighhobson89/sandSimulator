Exhaustive browser workflows for machines and material transfer.

- `placement.spec.mjs` checks every machine family, ghost-only first placement
  stage, two-click machine-plus-connector commit, Collector's output-only lead
  preview, blocked placement, all Fan directions, hit testing, Fan speed
  bounds/default, settings bounds, and tooltip behavior.
- `powered.spec.mjs` checks powered/unpowered Fan, Heater, and Cooler outcomes.
- `electrical.spec.mjs` checks Battery charge sharing, steady binary bright
  powered-wire bases, and the runtime-only Electrical effects display switch.
  Electrical effects hides presentation glyphs without changing charge or
  logical power. Battery cells never emit Spark particles. One centered green
  charging/red discharging glyph appears per connected Battery group, and
  static machine artwork is reused. The 30-tick electrical-refresh regression
  verifies that Battery drain still advances each tick while electrical graph
  and logical state refresh on the slower cadence. Legacy `world.power` and
  `world.powerDelay` remain empty. The spec also checks electrical wire
  compatibility at Simple Switch and Lamp ports,
  ON/OFF logical-current relay behavior, Lamp glow and its small Battery load,
  two-cell Elec leads, static Battery artwork without Spark/bolt animation, and
  electrical-state reset.
  Temperature Switch and Humidity
  Switch coverage checks their declared input/output ports, 2-cell Elec leads,
  exposed yellow sensor-marker geometry, accessible comparison controls,
  fractional thresholds, five-probe arithmetic means, all comparator truth
  boundaries, no-air behavior, logical-current gating, live dialog/hover
  reading and current-status transitions/colors, and the sealed 5-by-5 body
  collision. The Battery-to-switch-to-Lamp regression checks a separate
  logical-current query over long Elec runs, immediate logical blocking under
  a false comparison, restored passage, and immediate Battery-depletion
  shutdown. The new Spotlamp and Light Switch cases check Electricals
  definitions, Elec port roles, ON/comparator dialog defaults, a single-cell
  effective-illumination reading without the five-cell average, comparator
  boundaries, and Battery-backed output gating. Battery hover diagnostics,
  circuit load, charge trend,
  and ETA are covered in [`e2e/feedback/README.md`](../feedback/README.md).
- `logic-gates.spec.mjs` checks NOT, AND, OR, NAND, and XOR truth-table vectors,
  no-supply shutdown, separate Battery supply ports, signal/output roles and
  anchors, blue supply art, hover labels/directions, two-input spacing,
  straight outward port direction/counts (one left-facing signal port per
  input, right-facing output, downward supply), and Save/Load/reset behavior.
  Its routed AND-to-Lamp checks use separate supply, A/B, and output circuits;
  pairwise eight-neighbor checks keep routes and Battery terminals distinct.
  The Lamp stays dark for supply-only and one-input states, lights only with
  both inputs and supply, and switches off when any source path is lost.
  Battery metrics bill gate/output-network load to the
  supply source, not either signal source. The supply marker is blue inactive
  and cyan powered.
- `storage.spec.mjs` checks storage dialogs, family categories, tubing-only
  intake, capacity, type retention, and purge. It also checks Collector
  two-cell world suction and compatible Tubing transfer to Storage. Its
  direction-3, zoom-2 overflow case UI-pours Water into a Collector within
  continuous UI-painted Glass flanks and verifies that it fills to 100 before
  overflow stays upstream of the first opaque funnel row, Water remains
  conserved, and intake resumes when capacity opens. For the default
  down-facing icon, the first opaque row is `y = machine.y - 7`. The spec also
  checks accepted intake up to capacity, all-facing suction barriers and
  visible lips, open intake/output geometry, opaque-artwork paint blocking,
  side-leak probes, and transparent/opaque alpha-aware painting across machine
  overlays.
- `sprinkler.spec.mjs` checks Drain Mode defaults and both outlets, Sprinkler
  rate controls, topology, 10/20/30 per-second bottlenecks, flow visualization,
  and storage transfer.
- `mixer.spec.mjs` checks all documented recipes, non-mixing output, purge, and
  release behavior.
- `ports.spec.mjs` checks the 64px reference artwork at default and zoomed cell
  scales, including rotated Liquid Storage icon centers, port markers, stubs,
  and hit projection from world `connectionCell` anchors. Compatible direct
  contact at declared terminal/contact regions and along each visible
  protrusion attaches to the exact originating port; an extension wire is
  optional. The spec checks Tubing edge contact, electrical 8-way contact,
  supported materials, the 20 CSS pixel pointer hit distance, and the 15-unit
  local SVG artwork protrusion (about 15 CSS pixels at default zoom). It checks
  zoom scaling and the separate 30-screen-pixel cap on connector-drag previews.
- `persistence.spec.mjs` checks machine settings, including Simple Switch OFF,
  Lamp ON, and both sensor comparison/threshold pairs. Sensor settings include
  fractional values and are checked through portable Save/Load and blueprint
  capture/stamping: Temperature Switch `Greater than 42.5 C` and Humidity Switch
  `Less than or equal to 67.25%`. The spec also covers inventories, tubing, Mixer inputs,
  Sprinkler fractional credits and launch state, and machine state through
  portable Save/Load, blueprints, and Grabber moves. It verifies legacy
  Sprinkler mode and spray-credit migration, compatible legacy machine port
  endpoint migration, and one-time migration of Fan speeds.

The Electricals picker-group and stable switch ID/key contract are owned by
`e2e/materials/catalog.spec.mjs`; the picker heading order and Vegetation's
initial/new-game collapsed state are also covered there. See
[`MACHINE_CONSTRUCTION_STANDARDS.md`](../../docs/MACHINE_CONSTRUCTION_STANDARDS.md)
for the reusable machine review checklist.

Run the machine browser tests headlessly for required verification; headed
runs are optional diagnostics only and are never an acceptance or release
prerequisite. The physics boundary seeds inventory for deterministic setup; UI
placement, dialogs, toggles, tooltips, and canvas interaction use Playwright.
Engine-level flow-rate and reaction matrices remain in `tools/simTest.mjs`; they
are not duplicated as slow browser tests when no additional user-visible
contract exists.

Spotlamp's eight-facing 45-cell field, 40%-at-edge falloff, powered gating, and
visible cone are covered by `e2e/feedback/illumination.spec.mjs`. The focused
machine/browser cases passed 4/4 with
`npm.cmd run test:browser -- --grep "Spotlamp|Light Switch" --workers=1 --trace=off`;
the deterministic Spotlamp/Light Switch section passed 7/7 with
`npm.cmd test -- --focus=spotlamp-light-switch`.
The related direct-contact and 15 CSS px protrusion checks in `ports.spec.mjs`
passed 2/2 with:

```text
npm.cmd run test:browser -- e2e/machines/ports.spec.mjs --grep "direct contact at compatible Elec|every machine port has a visible 15 CSS px protrusion" --workers=1 --trace=off
```
