# Spotlamp and Light Switch

## Status

**Completed and verified.** Spotlamp adds a directional local-light emitter;
Light Switch adds a single-cell illumination comparator. Both preserve the
ambient/local effective-light contract, machine port rules, and battery-backed
binary electrical behavior. Focused deterministic and browser results are
recorded below.

## Scope and defaults

- Add **Spotlamp** to the Electricals catalog with an electrical input and the
  existing eight-way machine facing.
- Add **Light Switch** to Electricals with internal key `lightSwitch`, one
  electrical input, one electrical output, and one exposed sensor cell on its
  sensor face.
- The Spotlamp's emission uses Euclidean distance in simulation cells and has a
  `37.5`-cell radius (`1.5 ×` the Lamp radius), intensity `100`, and
  Lamp-style linear falloff with denominator `37.5`; distance `37` reads `4`,
  distance `37.5` remains about `2.67`, and cells outside the radius (for
  example distance `38`) contribute zero. The cone's field and artwork share
  `SPOTLAMP_CONE_ANGLE_DEGREES` (`26.565...°` half-angle).
- Spotlamp emission is active only when its persisted ON setting and its live
  logical electrical input are both ON, matching Lamp activation semantics.
  Use the existing local-light blocker/transmitter rules and additive,
  100-clamped source field. Effective light remains
  `max(ambient illumination, summed local illumination)`.
- Light Switch reads the literal `0`-to-`100` effective illumination value at
  its single exposed sensor cell. It does not average neighboring cells. It
  uses the existing comparator dialog and operators, defaults to `>= 50`, and
  relays its input to its output only while the comparison passes.
- Keep `getIlluminationAt(x, y)` as the read path for effective illumination.
  The Light Switch reads the completed cached illumination plane during
  electrical solving and must not call or recursively trigger an electrical
  graph refresh. If its comparison changes an emitter's power, the resulting
  light change is observed at a subsequent logical refresh, not during the
  same sensor read; do not promise an exact frame count.

## Machine definition, catalog, and construction

- Give each machine a new stable particle ID and machine definition. Spotlamp's
  display name is `Spotlamp`; use the internal machine key `spotLamp` unless
  the definition audit identifies an existing key. Light Switch uses the
  explicitly selected display name and internal key `lightSwitch`.
- Place both in Electricals, not LOGIC. Add their buttons, names, descriptions,
  and applicable metadata to `particles.json` and the catalog presentation.
- Declare Spotlamp's electrical input and Light Switch's distinct electrical
  input/output roles, anchors, Elec material, 8-way contact ownership, and
  direct-protrusion contacts. Render each port as a straight 15-local-SVG-unit
  protrusion; retain the separate 30-screen-pixel connector-drag cap and
  two-cell Elec brush width.
- Keep the Light Switch's single sensor marker distinct from its connectors,
  centered on the declared exposed face cell. The marker is visual only: it
  does not cut a hole in the sealed housing. Reuse the comparator-machine
  housing/collision footprint where suitable and test the sensor face and
  adjacent sealed edges.
- Reuse the existing facing encode/decode path and `machineDirectionVector`
  semantics so Spotlamp field and cone rotate through all eight directions.
  Align source origin, cone preview, active cone, hit/collision footprint, and
  declared input anchor at normal and zoomed cell scales.
- Both machines expose live active/inactive and input/output state. Light
  Switch additionally reports current illumination, comparator rule and
  threshold, whether input is present, and whether its output is passing.
  The Spotlamp dialog exposes its ON/OFF setting; hover reports active state,
  input status, and received illumination.

## Light field and cone agreement

- Store Spotlamp contributions in the existing derived per-cell local
  illumination field. Preserve ambient chunk sampling unchanged. At distance
  `d <= 37.5`, the source uses Lamp-style falloff with radius and denominator
  `37.5` before the existing sum-and-clamp behavior. The source center reads
  `100`, distance `37` reads `4`, and distance `38` is dark; the 38-cell point
  is outside the emitter's support.
- Restrict contributions to the cone represented by the rendered cone. Use
  `SPOTLAMP_CONE_ANGLE_DEGREES` in field and render calculations;
  do not duplicate or independently approximate the angle. The shared value
  is `26.565...°` as a half-angle. Reuse the existing eight-way directional
  cone shape and blocker ray rules.
- The preview and active overlay show the same reach, angle, orientation,
  blocking, and powered/ON state as the simulation field. The inactive device
  does not add local intensity. Its source color/tint should follow the
  established Lamp/local-light rendering conventions unless the icon palette
  already defines a Spotlamp tint.
- Changes to orientation, ON setting, logical input, blockers, direct cell
  edits, Grabber moves, and world lifecycle invalidate/rebuild the derived
  local field through its established path. Reads of a Light Switch must
  consume the completed field without invoking electrical recomputation from
  inside the sensor getter.

## Light Switch comparator and electrical behavior

- Define the probe as exactly the one cell exposed at the sensor face and
  report that cell's effective illumination as a literal `0`-to-`100` reading.
  The reading is not humidity/temperature data, a five-probe mean, a Lamp-only
  value, or a render tint sample.
- Reuse the comparator UI and runtime comparison semantics already used by
  Temperature Switch and Humidity Switch: `<`, `<=`, `=`, `>=`, and `>`, with
  default `>= 50`. Restrict the numeric threshold to `0` through `100`, allow
  supported fractional values, and label the units as illumination on the
  `0`-to-`100` scale.
- Pass steady logical input to the declared output only when the comparison is
  true. A false comparison, absent input, or unavailable machine/world read
  must not create current. Verify output changes when the sampled light or
  input changes and that it does not create a feedback-refresh recursion.
- Preserve the project binary-current model. Do not add traveling current
  pulses or create Battery charge. Spotlamp load must be explicitly declared
  and billed to its connected Battery network; use Lamp's load (`1`) unless
  implementation review establishes a different device load. The Light Switch
  is a comparator relay and does not independently supply power.

## Settings, state, and persistence

- Persist Spotlamp ON/OFF through machine settings, using the same default and
  dialog interaction as Lamp. Persist Light Switch comparator rule and
  threshold through the sensor setting state.
- Preserve values through reset/default recreation, transforms, swaps, Grabber
  moves, local reset/resume, portable Save/Load, and blueprint capture/stamping.
  Reset paths restore definition defaults; transforms and round trips retain
  user settings.
- Update save/blueprint allowlists or legacy migration only if new state fields
  are needed. Prefer the existing `machineSetting`, `machineSensorRule`, and
  `machineSensorThreshold` fields where their contracts fit. Add explicit
  defaults for legacy saves and blueprints.
- Keep derived Spotlamp illumination and sensor readings out of persistent
  data; rebuild or resample them after create, reset, resize, restore, and
  relevant edits.

## Focused regression scope

The focused regression coverage is in `tools/simTest.mjs`,
`e2e/feedback/illumination.spec.mjs`, and `e2e/machines/electrical.spec.mjs`.
Before implementation, focused runs were expected-red because the new machine
definitions were missing:

- Simulation: `npm.cmd test -- --focus=spotlamp-light-switch` reported **0
  passed, 2 failed**; both failures are the expected missing-definition checks
  for Spotlamp and Light Switch.
- Browser: `npm.cmd run test:browser -- --grep "Spotlamp|Light Switch" --workers=1 --trace=off`
  reported **0 passed, 3 failed**; all three are expected missing-definition
  failures for the new machines.

After implementation, the focused simulation and browser runs passed. The
initial expected-red counts remain here as historical baseline; final results
follow each suite's coverage list.

### Deterministic simulation

Run the focused section with:

```text
npm.cmd test -- --focus=spotlamp-light-switch
```

The `tools/simTest.mjs` section contains these exact checks:

- `Spotlamp is defined in Electricals with its directional light profile`.
- `Light Switch is defined in Electricals with a >=50 illumination comparator`.
- `Spotlamp rotates its powered cone through all eight facings with linear Euclidean falloff`.
- `Spotlamp cuts off at 37.5 cells and emits only when ON with a live input`.
- `Light Switch uses one exposed cell, compares effective max light, and gates powered input`.
- `Light Switch relays only while both its illumination comparison and input pass`.
- `Spotlamp toggle and Light Switch comparator settings survive simulation state round trip`.

The Light Switch fixture samples the single exposed face cell (currently
`x, y - 3`) and assigns distinct adjacent-cell values to prove it does not
average the five-cell face. It verifies effective ambient/local maximum,
default `>= 50`, equality and strict-greater boundaries, a fractional
threshold, live input/output gating, and the unpowered-input case. Spotlamp
checks all eight orientations, source-center intensity, inside/outside cone
samples, linear Euclidean falloff, the 37.5/38-cell cutoff, and no emission
when switched OFF or disconnected from its live input. The state round trip
checks the Spotlamp toggle and comparator rule/threshold.

Final focused result: **7 passed, 0 failed**.

### Browser regressions

The browser cases are:

- In `e2e/feedback/illumination.spec.mjs`, `powered Spotlamp follows its 37.5-cell cone through all eight facings`.
- In `e2e/feedback/illumination.spec.mjs`, `moving a Spotlamp with the Grabber immediately rebuilds local illumination`.

- In `e2e/machines/electrical.spec.mjs`, `Spotlamp and Light Switch have Electricals definitions, declared ports, and settings defaults` — Electricals metadata and role/Elec ports, default settings, and comparator UI.
- In `e2e/machines/electrical.spec.mjs`, `Light Switch samples one exposed illumination cell and relays only a powered passing input` — exact probe location/value, non-average neighbor values, effective illumination, equality and strict-greater boundaries, powered pass, and output blocking after Battery removal.

Run this focused spec through the documented browser wrapper:

```text
npm.cmd run test:browser -- --grep "Spotlamp|Light Switch" --workers=1 --trace=off
```

Final focused result after the Grabber invalidation regression was added:
**4 passed, 0 failed**. It covers the powered cone in all eight facings and
the immediate source-field change after moving a Spotlamp with the Grabber.

The related connector regression also passed:

```text
npm.cmd run test:browser -- e2e/machines/ports.spec.mjs --grep "direct contact at compatible Elec|every machine port has a visible 15 CSS px protrusion" --workers=1 --trace=off
```

Final focused result: **2 passed, 0 failed**. It verifies compatible direct
Elec contact at the originating port and the visible 15 CSS px machine-port
protrusions.

### Completion and optional follow-up

Implementation and focused verification are complete. The deterministic
simulation section passed **7/7**, the Spotlamp/Light Switch browser selection
passed **4/4**, and the connector browser selection passed **2/2**. The focused
commands and coverage are recorded above and in the owning E2E documentation.

### QMODE follow-up — 27 September 2026

Spotlamp was retuned to a 45-cell Euclidean radius with linear intensity from
100% at the source to 40% at the edge, then zero beyond it. The cone artwork is
clipped to the same radius. Seed hover feedback now uses the target plant's
profile to show actual temperature, humidity, and illumination alongside the
species' ideal values and ranges. The focused test expectations and mechanics
documentation were updated; tests were not run for this QMODE follow-up.

The following are optional follow-ups and were not acceptance requirements for
this completed scope:

- Add a dedicated Spotlamp P0 performance fixture covering field build,
  powered steady-state simulation, cone rendering, and hover/readout cost.
- Add broader browser assertions for cone preview/active-overlay boundary
  alignment and world-edge clipping.
- Add dedicated catalog accordion-order and portable Save/Load or blueprint
  regressions for these machines. Current deterministic coverage verifies
  simulation-state settings round-trip; it does not claim portable or blueprint
  migration coverage.
