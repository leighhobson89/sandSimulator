Exhaustive browser workflows for machines and material transfer.

- `placement.spec.mjs` checks every machine family, ghost-only first placement
  stage, two-click machine-plus-connector commit, Collector's output-only lead
  preview, blocked placement, all Fan directions, hit testing, Fan speed
  bounds/default, settings bounds, and tooltip behavior.
- `powered.spec.mjs` checks powered/unpowered Fan, Heater, and Cooler outcomes.
- `electrical.spec.mjs` checks Battery charge sharing and conductor pulses,
  electrical wire compatibility at Simple Switch and Lamp ports, ON/OFF switch
  relay behavior, Lamp glow and its small Battery load, two-cell Elec leads,
  signal expiry, and electrical-state reset.
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
  and hit projection from world `connectionCell` anchors. It also checks the
  20 CSS pixel hit distance, declared port roles, near-port Tubing snapping,
  and rejection of incompatible Copper at Mixer inputs.
- `persistence.spec.mjs` checks machine settings, including Simple Switch OFF
  and Lamp ON, inventories, tubing, Mixer
  inputs, Sprinkler fractional credits and launch state, and machine state
  through portable Save/Load, blueprints, and Grabber moves. It also verifies
  legacy Sprinkler mode and spray-credit migration, compatible legacy machine
  port endpoint migration, and one-time migration of Fan speeds.

Run the machine browser tests headlessly for required verification; headed
runs are optional diagnostics only and are never an acceptance or release
prerequisite. The physics boundary seeds inventory for deterministic setup; UI
placement, dialogs, toggles, tooltips, and canvas interaction use Playwright.
Engine-level flow-rate and reaction matrices remain in `tools/simTest.mjs`; they
are not duplicated as slow browser tests when no additional user-visible
contract exists.
