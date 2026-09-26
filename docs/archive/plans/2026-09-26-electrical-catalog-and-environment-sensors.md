# Plan: Electrical catalog and environment sensors

**Status:** Implemented, reviewed, and focused verification completed.

## Architecture baseline before this change

- Before implementation, `particles.json` supplied the picker/catalog group
  for every material and machine. Battery was under Metals, Spark under Metals,
  Spark Dust under Powders, and Spark Block under Solids. Electricals already
  contained Elec, Simple Switch, and Lamp.
- Before implementation, `physics.js` owned machine definitions, declared
  electrical ports, machine settings, and transient electrical pulse routing.
  `relayElectricalSwitches` implemented the Simple Switch's input-to-output
  signal relay. The completed design now has a separate logical-current state
  for charged-Battery DC routes; traveling-Spark arrays are visual-only.
- Machine settings and machine-owned arrays are explicitly listed in
  `PERSISTED_WORLD_FIELDS`. The same machine state is copied when cells are
  cleared, transformed, swapped, grabbed, saved, restored, or captured in a
  blueprint; blueprint cell fields are separately listed in `game.js`.
- `game.js` draws machine icons, port markers, and electrical lead previews.
  Electrical machine leads use Elec with a forced two-cell brush width.
- `ui.js` and `index.html` build and open the settings dialog when a placed
  machine is clicked. `docs/GAME_MECHANICS.md` documents catalog groups,
  machine behavior, ports, and persistence. `e2e/machines/` owns browser
  coverage for machine interaction and persistence.

## Scope

- Move Battery, Spark, Spark Dust, and Spark Block into the existing
  **Electricals** picker/catalog group while preserving their definitions,
  behavior, and stable particle IDs.
- Put Vegetation last in the picker heading order and leave its section
  collapsed on initial setup. After an explicit new game starts successfully,
  collapse Vegetation again. Preserve a player's manual expansion/collapse
  while the current game is running, and do not reset the group when loading
  or resuming a game.
- Add **Temperature Switch** and **Humidity Switch** machine definitions to
  Electricals. Their internal machine keys are `temperatureSwitch` and
  `humiditySwitch`, respectively. Keep Temperature Switch at particle ID 85
  and Humidity Switch at ID 86; change their display names and internal keys
  without changing either stable ID. Each declares one electrical input and
  one electrical output, has the normal machine body collision, and uses Elec
  for its connector lead.
- Preserve the existing `machineSensor*` fields and APIs, including
  `machineSensorRule`, `machineSensorThreshold`,
  `getMachineSensorRule`, `setMachineSensorRule`,
  `getMachineSensorThreshold`, `setMachineSensorThreshold`,
  `getMachineSensorReading`, and `getMachineSensorStatus`. Renaming display
  names and machine keys does not rename or remove this state/API surface.
- Draw each sensor as a distinct machine icon with one yellow sensing circle
  on the exposed top edge of its housing, at about `cy=14` in the 64-by-64
  icon viewBox. Keep the circle exposed at the housing edge so ambient air
  cells reach the probe; it has the same rendered diameter as a port marker.
- Open a settings dialog by clicking either sensor. Provide a rule dropdown
  with less than, less than or equal to, equal to, greater than or equal to,
  and greater than choices, plus a numeric threshold input. The
  Temperature Switch threshold is in degrees Celsius; the Humidity Switch
  threshold is a percentage on the simulation's 0 to 100 humidity scale.
  Accept finite fractional values, reject invalid input, and keep each value
  within its physical range.
- Show live sensor status both in the open settings dialog and the machine
  hover tooltip: current reading and unit, selected comparison and threshold,
  whether logical input current is present, and whether that current is
  passing.
  Refresh the status while the dialog is open or the machine is hovered.
- Gate logical current from the declared input to the declared output: a sensor
  forwards input current only when its current reading meets the selected
  comparison. It does not create current when its input is OFF. A missing
  sensor reading evaluates false and immediately switches the output OFF.
- Add a durable, reusable machine-construction standard covering port roles,
  exposed sensor/interaction details, lead material and 2-pixel rendering,
  collision, and documented exceptions for intentionally open machine faces.

## Behavior choices

- Each simulation update, sample up to five distinct air cells immediately
  around the sensor's exposed edge and compare their arithmetic mean with the
  configured threshold. Use available samples when fewer than five cells are
  adjacent. If there are no air cells to sample, the comparison is false,
  including for equality rules. Keep neighbor selection deterministic so
  readings and tests do not depend on iteration randomness.
- The sensor marker is a visual locator for the sensing edge, not an
  additional connector or a pass-through opening in the machine body. Place
  its center at about `cy=14`, where it touches the visible housing edge and
  remains exposed, and ensure it does not cover or merge with either port.
  Keep it visible at normal and zoomed cell scales.
- Default Temperature Switch configuration is greater than or equal to 20
  degrees Celsius; default Humidity Switch configuration is greater than or
  equal to 50%. Show values with enough precision to round-trip
  fractional thresholds without silently rounding them.
- Electrical logic is an independent DC state: a conductor is logically ON
  exactly while a wire route reaches a charged Battery. Add dedicated logical
  current state and the `isLogicallyPowered()` query API,
  and route machine input status, switch/sensor relays, and Lamp power through
  that state. `world.power` and `world.powerDelay` represent traveling-spark
  visualization only; they must never determine whether an input, output, or
  Lamp is logically ON. A Simple Switch or sensor gates current only toward
  its declared output; a true sensor comparison passes it and a false rule
  blocks it. An ON Lamp stays lit only while its logical input is ON. A false
  rule or a depleted/disconnected Battery turns affected logical outputs OFF
  immediately, even if old spark-animation cells remain visible. Both sensors
  use their declared input/output anchors; no broad body contact or hidden
  port is added.
- Pre-fix diagnosis: `getMachineSensorStatus()` defined `inputActive` using
  `world.power[wire] > 0`, while `machineIsPowered()` considered either
  `world.power` or `world.powerDelay` active. A long route could therefore be
  logically connected to a charged Battery while the visual arrays showed a
  delay-only frame. Directly seeded sensor fixtures did not cover the complete
  Battery-to-switch-to-Lamp path. The implementation and long-route regression
  now separate logical input, output relay, Lamp power, and visual animation.
- Derive status from both the current comparison and logical current at the
  declared electrical input, using the dedicated current-state query rather
  than `world.power` or `world.powerDelay`. Current passes only when the input
  is logically ON and the comparison is true. Use `#machineDialogSensorStatus` in the
  open dialog and `.machine-sensor-tooltip` on hover. Both expose
  `data-signal-state` with one of `passing`, `ready`, `blocked`, or `no-air`,
  and child selectors `[data-sensor-live-state]`,
  `[data-sensor-live-reading]`, `[data-sensor-live-comparison]`, and
  `[data-sensor-live-input]`. `passing` means rule true plus logical input
  current present and is the only green state. `ready` means rule true with no
  input current; show the exact label `RULE TRUE · NO INPUT CURRENT` and color
  it red.
  `blocked` means the rule is false; `no-air` means no reading is available.
  Both states are red, with `no-air` showing the exact label
  `SIGNAL BLOCKED · NO AIR`. Show input current separately so status text
  distinguishes an unmet rule from an OFF input. Never report `passing` solely
  because the comparator is true.
- Humidity thresholds use the defined `0 to 100%` scale. Temperature thresholds
  use degrees Celsius and must accept finite fractional values across the
  simulation's usable temperature range; do not introduce an arbitrary cap.
  Keep UI constraints aligned with the actual stored humidity/temperature
  ranges and document any required limits.
- Give the new comparator fields explicit defaults when restoring older
  saves or blueprints that predate sensors. Persist the comparison operator
  and the fractional threshold separately from integer/bit-style
  `machineSetting`; include both fields in state copy/reset/swap logic and
  migrate absent or malformed values to the definition defaults. Existing
  save and blueprint formats remain readable.
- Keep machine collision solid across the icon/body by default so particles
  cannot pass through or behind it. Exempt only openings and face geometry
  that a machine specification explicitly defines, such as world-facing
  intakes or releases. Connector leads and exposed sensor dots do not weaken
  body collision.

## Planned implementation areas

- `particles.json`: reassign the four existing catalog groups and rename the
  Electricals definitions at IDs 85 and 86 to Temperature Switch and Humidity
  Switch. Set their internal machine keys to `temperatureSwitch` and
  `humiditySwitch`, preserving the stable IDs and existing `machineSensor*`
  fields.
- `physics.js`: retain the `machineSensor*` fields and APIs while changing
  machine branches to the new keys; add sensor setting arrays/accessors,
  deterministic nearby-air sampling, comparator evaluation, input-to-output
  logical-current gating, defaults, and full lifecycle handling. Add separate logical
  current state/query based on a connected charged Battery route; use it for
  sensor and switch inputs/outputs, Lamp power, and `inputActive` status. Keep
  `world.power` and `world.powerDelay` solely for traveling-spark display and
  never use them to derive logical on/off state. Apply rule changes and Battery
  depletion immediately to the logical output, even when animation cells have
  a remaining tail.
  Update persisted field lists, save restore, blueprint state handling,
  clear/reset, transform, swap, and Grabber paths.
- `game.js`: draw Temperature Switch and Humidity Switch faces, exposed yellow
  sensing dots, electrical input/output markers and stubs; preserve the
  forced two-cell Elec lead preview/commit behavior. Add new per-cell state to
  blueprint capture and stamp paths.
- `ui.js` and `index.html`: add accessible rule selectors and decimal-capable
  threshold controls for both sensors, with Celsius and percent labels,
  bounds, validation, and immediate persistence to the selected machine.
  Move Vegetation to the final picker group, initialize its toggle as
  collapsed, and collapse it after successful explicit
  `startGame({ newWorld: true })` calls. Leave in-game manual toggle state
  intact and do not collapse Vegetation during the ordinary load/resume
  `startGame()` path.
  Add `#machineDialogSensorStatus` and `.machine-sensor-tooltip` surfaces
  exposing `data-signal-state` values `passing`, `ready`, `blocked`, and
  `no-air`, plus the `[data-sensor-live-state]`,
  `[data-sensor-live-reading]`, `[data-sensor-live-comparison]`, and
  `[data-sensor-live-input]` details. Only passing status is green; ready,
  blocked, and no-air states are red.
- `docs/MACHINE_CONSTRUCTION_STANDARDS.md`: document the reusable standards
  for new and existing machines, including declared input/output ports,
  exposed interactive/sensing markers, 2-pixel Tubing/Electrical connector
  artwork with the required electrical lead width, collision, exceptions,
  state lifecycle, and the focused review checklist.
- `AGENTS.md`: add a short durable instruction linking machine changes to the
  construction standard and requiring it to be checked when building or
  changing a machine.
- `docs/GAME_MECHANICS.md`, `docs/METALS_GUIDE.md`, and
  `e2e/machines/README.md`: document the new catalog grouping, sensor
  comparison and sampling semantics, defaults, ports, settings, persistence,
  standards reference, and regression ownership.

## Planned regression coverage

- `e2e/materials/catalog.spec.mjs`:
  - Verify the Electricals picker contains Battery, Spark, Spark Dust, Spark
    Block, Temperature Switch, and Humidity Switch, and that each definition's
    `group` is `Electricals`.
  - Verify the ID/key/API contract: particle 85 is Temperature Switch with
    machine key `temperatureSwitch`; particle 86 is Humidity Switch with key
    `humiditySwitch`. Confirm the public APIs
    `getMachineSensorRule`, `setMachineSensorRule`,
    `getMachineSensorThreshold`, `setMachineSensorThreshold`,
    `getMachineSensorReading`, and `getMachineSensorStatus` remain functions;
    world fields remain `machineSensorRule: Uint8Array` and
    `machineSensorThreshold: Float64Array`; and both `machineSensor*` fields
    remain in `game.BLUEPRINT_FIELDS`.
  - Verify the exact heading order is Powders, Liquids, Gases, Solids, Seeds,
    Metals, Electricals, Machines, Storage, Tools, Vegetation. In the
    dedicated Vegetation behavior test, verify the group is initially
    collapsed, expand it, remove the autosave to avoid the unrelated
    replacement prompt, open the menu, and start a second new game; after
    startup, verify it is collapsed again.
  - The existing seed/vegetation/Cloud test first expands the hidden
    Vegetation group before checking its entries. The all-definition button
    and glossary test expands the initially hidden group before enumerating
    every definition. The collapse/expand test asserts Vegetation starts
    collapsed while the other catalog groups start expanded, then exercises
    the accessible toggles for every group.
- `e2e/machines/electrical.spec.mjs`: use Temperature Switch and Humidity
  Switch as the fixture and lookup names. Verify each declares an electrical
  input and output in order, with Elec material and
  `connectorBrushWidth: 2`. Check its yellow marker is centered at
  `cx=32`, `cy=14`, has the same radius as a port, and crosses the outer
  housing edge at `y=14`. Click each switch and check the accessible settings
  dialog, all five comparison options, fractional Temperature/Humidity input
  values (`37.5` and `61.25`), and values after reopening.
  The reading-and-routing regression seeds a uniform air pocket for each
  switch and exercises true and false outcomes for all five comparisons by
  energizing the declared input `connectionCell` and checking the output. It
  blocks the Temperature Switch's exposed probe and neighboring cells with
  Walls, then checks for a null reading and no logical output current. The collision
  test places Sand five cells above the Temperature Switch and verifies that
  after 12 steps it rests at `y - 3`, immediately above the 5x5 collision
  footprint whose top row is `y - 2`. The existing Elec lead regression checks
  the forced two-cell brush width regardless of selected brush size. A mixed
  probe test verifies five exposed cells average to `32.2 degrees Celsius`
  for Temperature Switch and `53.4%` for Humidity Switch.
  The live-status regression runs for both switches in the settings dialog
  and hover tooltip. Check `#machineDialogSensorStatus` and
  `.machine-sensor-tooltip`, `data-signal-state`, and child selectors
  `[data-sensor-live-state]`, `[data-sensor-live-reading]`,
  `[data-sensor-live-comparison]`, and `[data-sensor-live-input]`. Verify the
  reading/unit, comparator/threshold, active or inactive logical-current text, state
  label, and color. Exercise `ready` (red, `RULE TRUE · NO INPUT CURRENT`),
  `passing` (green), `blocked` (red), and `no-air` (red,
  `SIGNAL BLOCKED · NO AIR`) while readings, threshold, and input-current state change;
  verify hover updates after closing the dialog. Only `passing` is green.
- `e2e/machines/electrical.spec.mjs` adds
  `Battery-backed long Elec runs keep a Temperature Switch and Lamp active until
  charge is depleted`. It fills the Battery to its definition's
  `chargeCapacity`, sets Temperature Switch to `Greater than 1 C` with air at
  `30 C`, and advances one simulation step. It must find an Elec cell with
  `world.power === 0`, `world.powerDelay > 0`, and
  `isLogicallyPowered(x, y) === true` at the same time, proving a delay-only
  visual frame remains logically ON. After 150 settling steps it samples 45
  consecutive frames. Each frame checks logical sensor input ON, comparator
  passage, every input/output route cell ON through `isLogicallyPowered()`, and
  logical Lamp power. Setting the threshold to `100` makes the rule false; on
  the next simulation update the Battery-fed input remains logically ON while
  the sensor output and Lamp are logically OFF despite an asserted visible
  output-animation tail. Sample 89 more frames (90 total) and keep those logical
  outputs OFF. Restoring threshold `1`, advancing 150 steps, and sampling 35
  frames checks that logical passage and Lamp power resume. Finally, set
  Battery charge to zero, advance one update, and immediately assert that the
  input, sensor output, and Lamp are logically OFF; if a visual tail remains,
  it is cosmetic only. Advance 179 additional frames (180 total) and confirm
  the logical path remains OFF. This end-to-end path verifies independent
  Battery-backed DC logic and cosmetic traveling Sparks; direct comparator
  fixtures remain separate.
- `e2e/machines/persistence.spec.mjs`: use the renamed Temperature Switch and
  Humidity Switch fixtures and verify configured comparison/threshold values
  after portable Save/Load, then after blueprint capture and stamping. The
  round-trip values are Temperature Switch `Greater than`, `42.5` degrees and
  Humidity Switch `Less than or equal to`, `67.25` percent. Keep planned
  additional persistence coverage for missing legacy sensor fields,
  clear/swap, and Grabber moves.

The current marker check covers its default displayed scale; retain the
zoomed-marker geometry check if the UI contract requires it. Use the
documented `npm run test:browser -- ...` wrapper for the two browser areas and
the deterministic `tools/simTest.mjs` harness only if simulation-level
coverage is needed. A full suite requires separate user approval.

Run this stale-name check against active implementation, tests, and current
docs after renaming:

```text
rg -n -e 'Heat Sensor' -e 'Humidity Sensor' -e 'heatSensor' -e 'humiditySensor' particles.json constantsAndGlobalVars.js physics.js game.js ui.js index.html styles.css saveLoadGame.js e2e docs/GAME_MECHANICS.md docs/METALS_GUIDE.md AGENTS.md
```

No stale display names or internal keys should remain in those active files.
Historical archive and plan files are excluded. Verify definitions still
resolve at IDs 85/86 and that the existing `machineSensor*` fields and APIs
remain unchanged.

## Completion documentation

The catalog, sensor settings, comparator gating, status surfaces, persistence,
and Vegetation picker behavior have been implemented and reviewed. The
catalog, machine behavior, machine construction standard, project instructions,
and E2E ownership documentation have been updated. Focused browser coverage
for the catalog, electrical behavior, and persistence areas first completed
with 33 passing tests and one failure. The only failure was a live-reading
fixture assertion that assumed an exact temperature. The fixture was corrected
to assert the observed reading, and that focused live-status test passed on its
rerun. A clean aggregate rerun across `e2e/materials/catalog.spec.mjs`,
`e2e/machines/electrical.spec.mjs`, and
`e2e/machines/persistence.spec.mjs` then passed all 34 tests. The passing
aggregate included the Battery-backed long-route test:
it verified delay-only visual frames while logical routes remained ON, the
false comparison turned logical output and Lamp OFF while their animation
tail remained, restoring the rule resumed logical current, and zero charge
turned the path OFF immediately and kept it OFF through the remaining visual
tail. JSON, syntax, and diff checks passed. This plan is archived as the
execution record under `docs/archive/plans/`.
