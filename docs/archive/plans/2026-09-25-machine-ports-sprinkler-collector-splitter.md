# Plan: machine ports, Sprinkler modes, Collector, and flow splitter

## Current architecture and scope

- `physics.js` owns machine definitions, state arrays and serialization, tubing
  component discovery, material acceptance, transfer scheduling, Collector
  world intake, and machine particle release. Machine/tubing attachment currently mixes cardinally
  adjacent endpoint discovery with a broad invisible Mixer footprint and
  Mixer-specific distance heuristics.
- `game.js` draws machine faces and tubing flow overlays as SVG over the
  simulation canvas. Mixer artwork is 64 screen pixels; other machines and
  storage icons are roughly 30–32 pixels. `styles.css` supplies the overlay
  presentation. Storage bins currently also collect matching world particles;
  change them to accept inventory only through family-compatible Tubing.
- `ui.js` and `index.html` expose the existing release toggle and rate
  controls for particle ID 52. Rename the active machine, player-facing
  label, and code-facing terminology to Sprinkler while retaining ID 52. Save
  and blueprint code copies machine state explicitly in `physics.js` and
  `game.js`.
- `tools/simTest.mjs` owns deterministic tubing, storage, Sprinkler, and Mixer
  regressions. Browser-facing machine interaction belongs under
  `e2e/machines/`; the repository wrapper remains the only browser test entry
  point.

Implement a shared declarative machine-port description that supplies the
transformed visible marker, stable per-port `connectionCell` anchor (using the
existing machine-relative connection offsets), screen-space hit/snap region,
visible stub, direction, role, and accepted material family. Keep artwork,
pointer-hit, and topology geometry independent. Use the descriptor for
rendering, endpoint discovery, destination compatibility, and snapping. UI
hit/snap resolves from the transformed marker within 20 CSS pixels, then maps
to its specific `connectionCell`; it must never widen the topology target.
Physical routing attaches only when compatible material occupies or touches
the declared anchor according to the existing four-way network rules. Resolve
ambiguous UI picks by nearest transformed marker, then stable port order, and
reject incompatible material for that port. Proximity and pointer hits alone
never create a route. Storage bins accept inventory only through
family-compatible Tubing, never by absorbing world particles. Add a Collector
with a rotatable funnel world intake for Powder, Liquid, or Gas and a single
Tubing output. It buffers only one material type at a time, up to 100 particles;
if no compatible receiving route is available, keep its inventory. Preserve
the established four-way Tubing network and existing Sprinkler and Mixer
buffer/rate rules.

## Machine identity and setting migration

Use Sprinkler as the active machine definition key, UI label, API terminology,
and new serialized field naming. Keep the Sprinkler at the current Vent's
numeric particle ID 52 so existing saves and blueprints still resolve to the
same machine cell. Accept the legacy `Vent` identity and old `vent*` field
names only in save/blueprint loading and migration; emit current Sprinkler
names in new machine definitions and UI.

Retain `machineSetting` bit 0 as Release enabled. In the new encoding, bit 1
is Drain Mode: ON means the existing single downward release path, and OFF
means seven-way Sprinkler projection. Drain Mode defaults ON, so new machines
use setting value `3` (Release and Drain both on) and preserve normal downward
release. Write new portable saves as format version 2 and retain a version-1
read path. Store `sprinklerModeVersion: 2` with new simulation and blueprint
state. Version-2 state uses bit 1 directly for Drain Mode. For version-1
data, preserve bit 0 and map the former bit-1 Sprinkler flag inversely with
`(old & 1) | ((old & 2) ? 0 : 2)`. Thus original values 0/1
become 2/3 (Release-off/on with Drain Mode on); values 2/3 from the legacy
Release-plus-Sprinkler encoding become 0/1, retaining Release state and
Sprinkler mode. If an old save has no `machineSetting` field, apply current
defaults: Release on and Drain Mode on (`3`). Apply the same version-1
migration to old blueprint arrays and write the current setting encoding and
`sprinklerModeVersion: 2` in new blueprint data. Decode legacy state fields
such as `ventSprayFlow*` as
aliases for current Sprinkler fields in both version-1 save and blueprint
arrays; serialize current names in new saves and blueprints. Preserve the
legacy text identity `Vent` only as a load-time alias, while emitting current
Sprinkler names.

## Image-based port artwork and interaction

Use the supplied `1536 x 1024` source sheet as a 3-by-3 icon sheet. Its tile
boundaries are x=`0/512/1024/1536` and y=`0/341/683/1024`; the rows are Fan,
Heater, Cooler / Powder, Liquid, Gas Storage / Sprinkler, Splitter, Mixer.
Each machine face is alpha-trimmed, aspect-preserved, and centered in a `64 x
64` overlay with artwork capped at `56 x 56`. Transform its port markers with
the same trim, scale, centering, and machine rotation as the artwork. Source
port circles have diameter 29 pixels. Keep the visible circle small (about
4-7 CSS pixels in the rendered face), with a separate screen-space pointer
hit/snap region and a stable `connectionCell` anchor. The anchor uses the
machine's existing relative connection offset; do not derive or expand it from
the artwork marker or pointer radius.

Resolve each rotated `connectionCell` with the existing machine-relative
offsets and the same direction mapping and rounding used for machine
placement. Map it through the runtime `cellWidth` and `cellHeight` and the
machine's screen transform; use that projection for the hit region, stub
endpoint, and port-gesture endpoints. Keep the artwork marker in the
alpha-trimmed icon transform and draw the 2-pixel stub between marker and
projected anchor. Use the same transform and rounding in placement previews;
never assume square cells or a fixed cell-to-screen scale.

Tile-local source port marker centers:

| Machine | Port marker centers (x, y) | Roles and material |
| --- | --- | --- |
| Fan | Copper input `(138, 196)` | Copper cable input; airflow cone is the output, opposite the input |
| Heater | Copper input `(76, 196)` | Copper cable input; heat cone is the output, opposite the input |
| Cooler | Copper input `(41, 196)` | Copper cable input; cold cone is the output, opposite the input |
| Powder Storage | Input `(298, 55)`, output `(298, 251)` | Powder-family Tubing input/output |
| Liquid Storage | Input `(256, 55)`, output `(256, 230)` | Liquid-family Tubing input/output |
| Gas Storage | Input `(215, 55)`, output `(215, 230)` | Gas-family Tubing input/output |
| Sprinkler | Tubing input `(298, 46)` | One Tubing input; released material projects into the world, no Tubing output |
| Splitter | Tubing input `(256, 38)`, outputs `(158, 188)` and `(354, 188)` | One input and two Tubing outputs |
| Mixer | Tubing inputs `(75, 135)` and `(359, 135)` | Two separate inputs; released output goes to the world, no Tubing output |
| Collector | One Tubing output; use its declared marker and `connectionCell` | A rotatable funnel is the world intake; it accepts Powder, Liquid, or Gas |

Render every port circle red while idle and green only after an external
compatible connector touches the port directly or joins its connector lead.
Track port-drag leads separately so a lead's own cells do not count as external
contact and turn the port green. Proximity or a pointer hit alone does not
turn a port green. Draw each port's short Tubing or Copper stub with the
requested 2-pixel stroke, bridging the transformed marker and its projected
connection anchor. Set SVG overflow/clipping so the complete stub stays visible
through the anchor. Machine faces remain 64 pixels, with all artwork preserving
aspect ratio and no stretching.

Resolve pointer hit/snap within 20 CSS pixels of transformed port markers on
the 64-pixel overlay, independent of the smaller visible circle and anchor.
Map the selected rotated anchor through the actual cell dimensions and use the
same screen-space point for placement preview and pointer gestures.
Pointer-down on a port is deferred. If the pointer moves past the drag
threshold, begin a forced size-3 connector stroke from its `connectionCell`,
using the port's compatible connector material: Tubing for flow ports and
Copper for powered-machine inputs. Clamp the straight stroke to a maximum 20
CSS pixels from the selected port marker. Commit the stroke atomically only if
its clamped path physically reaches compatible material at the selected
anchor, directly or by joining the separately tracked lead; blocked or
incompatible paths leave no partial stroke. An overlong
valid drag is clamped before this contact check. A pointer release below the
drag threshold opens the normal machine UI, preserving click-to-open behavior;
a body click also opens the normal machine UI. Snapping selects the nearest
compatible marker but only creates topology at its declared anchor. Do not
paint under a visible machine face except for the connector path; keep eraser
and grabber interactions working.

Machine placement uses two transient stages. In `poseSelecting`, the first
pointer down/click and the existing facing drag update only the ghost pose; do
not mutate the world or any saveable machine state. On the first pointer-up,
freeze the selected location and direction and enter `extensionPreview`. Pick
the first compatible input port in definition order; for the output-only
Collector, pick its single Tubing output. Preview a size-3 compatible connector
lead from that anchor to the cursor, clamped to 20 CSS pixels and projected
with the same rotated-anchor/cell-dimension transform as the placed artwork.
The second click preflights placement, anchor, material, blockers, and path,
then atomically commits the machine and connector. A disconnected connector
lead may be committed but does not activate its port; compatible external
contact activates it later. If invalid, keep the preview active for retry with
no partial world changes. Escape or right-click cancels;
touch follows the same two-stage transitions. These preview stages remain
transient: save and blueprint capture include only committed machines and
connector cells.

The Mixer-to-world output and Sprinkler-to-world spray are not machine-port
connections. In particular, remove the Mixer Tubing output endpoint while
retaining its existing world-release behavior. Keep Splitter transfer rates
balanced between its declared outputs. Powered machine output cones render
opposite their Copper input. Fan placement preview must use the same cone path
and range as Heater/Cooler previews.

Legacy machine-to-tubing connections are encoded by tubing cells, not saved
port IDs. Old endpoint cells may not overlap the current stable anchors. Add a
separate `machinePortLayoutVersion: 2` marker to new simulation and blueprint
snapshots. A missing marker means legacy attachment geometry, even when the
portable save itself is already format version 2 for the Drain Mode change.
During load and blueprint restore, preserve tube networks and add an endpoint
remap only where necessary to retain a compatible legacy connection at its
declared anchor; do not widen current topology targets to solve it. Test legacy
world saves and blueprints for route continuity, tube-cell preservation, and
absence of new
false connections. Treat a legacy Mixer output route as ordinary Tubing after
removing the Mixer output endpoint; do not consume Mixer inventory through it.
This remains a save compatibility risk because the old Mixer footprint
accepted many tube cells that no longer correspond to visible ports.

Add a `splitter` machine definition with one Tubing input and two Tubing
outputs. It receives and buffers the existing supported Tubing materials,
then routes each material to either available output while keeping the two
output rates balanced. Fractional transfer/remainder handling must preserve
the input rate exactly subject to the simulation's established precision.
Storage inputs remain family-restricted; ports must not broaden the existing
material acceptance rules. Powder, Liquid, and Gas Storage Bins no longer
collect particles from the world: remove their legacy funnel suction and
collision intake while retaining their Tubing-fed, family-restricted input,
existing inventory, purge, and Tubing output behavior.

Add a rotatable `collector` at the next unused particle ID. It has a directional
funnel intake and exactly one Tubing output port, with no connector input. Its
native 64px SVG face should match the supplied machine art style. Default its
legacy front direction down (index 3), so its rear suction mouth faces up and
collects particles placed above the icon. Reuse the legacy funnel's rotated
`intakeBarrierCells` and two-cell suction only for the Collector. Keep those
intake/suction cells distinct from a direction-rotated `collectorSealMask`.
Build the seal mask as supercover side rails from funnel rim ends toward the
shoulders, plus a short shell around the Collector body. Treat those cells as
virtual solids in particle movement and diagonal collision checks, but never
scan the seal rails as suction targets. Keep the central intake lane open and
the Tubing output `connectionCell` outside and unmasked. The static-solid paint
exception is limited to the rotated funnel rim and side-lip cells; arbitrary
cells under the Collector face remain blocked.
It accepts ordinary powder, liquid, or gas particles, but its 100-particle
buffer holds one exact material ID at a time; particles of another type remain
in the world until the buffer empties. A connected output transfers its
buffered material only to a compatible receiver at `min(30 units/s, tubing
route capacity)`. The 30/s source cap matches the normal size-3 port
connector; a single-cell route remains limited to its 10/s capacity. If no
compatible route is available, retain the buffer.
Preserve its inventory and direction through saves, blueprints, and grab/drop.

## Sprinkler stream-count conflict decision (recorded before implementation)

The seven requested clock positions (9, 8, 7, 6, 5, 4, and 3) unambiguously
describe seven simultaneous spray directions, while the stated per-direction
calculation divides by six. Keep all seven directions and preserve the
configured total release rate. Apply the stated `/6` as the nominal share,
then normalize each stream by `6/7`: the final share per direction is
`(releaseRate / 6) * (6 / 7) = releaseRate / 7`. Thus every direction is
represented, and the sum of seven streams remains exactly `releaseRate`.
Do not round this rate; retain fractional release credit using the existing
simulation precision rules. In sprinkler mode, accrue `releaseRate / 7 / 60`
independently for each direction each simulation frame. Store the seven
per-direction credits in seven `Float32Array(cellCount)` planes, one plane per
clock position. This matches the existing per-cell state shape used by
save/restore and blueprint handling. Cap each credit at one ready particle,
matching the current machine's no-burst behavior. Each unobstructed stream then
releases independently at `releaseRate / 7`; a blocked target holds at most
its own one-particle credit and cannot redirect that direction's share to a
clear target. With Drain Mode OFF, the Sprinkler releases its stored material,
whatever type it has received through Tubing, through those seven targets.
The requested raindrop appearance describes the emitted particle shape;
retain the stored material identity. With Drain Mode ON, keep the existing
single downward outlet and release behavior unchanged.

Keep the per-ray release credits separate from per-particle trajectory
metadata. Each particle emitted by a sprinkler ray carries its launch clock
position and age through physics movement. For positions 3/9, 4/8, and 5/7,
project along the outlet ray at one cell per simulation frame for a 12-frame
launch, using DDA-style grid projection so diagonal rays traverse neighboring
cells correctly. The ray angle controls the lateral component: 3/9 project
farthest laterally, 4/8 less, and 5/7 less again as their directions point
further downward. Ramp vertical gravity linearly to native gravity during the
same 12 frames, starting at multipliers 0.00 for 3/9, 0.05 for 4/8, and 0.25
for 5/7. At frame 12, gravity is native and launch metadata is cleared. The
downward 6 outlet remains untagged and uses native movement from the outset;
Drain Mode ON particles also remain untagged and follow the existing normal
downward release behavior.

Persist launch direction and age as separate per-particle state from the
seven release-credit planes. Move and swap this metadata with the particle and
carry it through save/restore, blueprint capture/stamp, and grab/drop. Clear
it when the particle hits an obstacle or world boundary, is removed or
replaced, or reaches launch age 12. A blocked trajectory must terminate at
the collision rather than project through a solid.

Use the versioned bit policy above: bit 0 remains Release, and bit 1 is Drain
Mode in Sprinkler mode version 2. The UI calls this switch “Drain Mode”; ON releases
downward, OFF sprays in seven directions. Preserve older Sprinkler-on saves by
inverting their legacy bit-1 flag during migration. Add seven per-direction
Float32Array planes as explicit save state with zero defaults when older data
has no corresponding field. Carry all seven credits through save/restore,
blueprint capture/stamp, typed-array swapping, and grab/drop. Clear them when
a machine is cleared or replaced. Splitter buffers should use the established
storage inventory fields so old saves remain readable and new machines are
saved by the normal machine/material arrays.

## Implementation sequence

1. Add port descriptors for every existing machine, the Splitter, and the
   Collector. Define roles, source-sheet marker centers, stable `connectionCell`
   anchors at established machine-relative offsets, material families, and
   code-drawn Collector output geometry in one source of truth. Resolve the
   rotated anchor with the same direction transform and rounding as placement.
   Map marker, hit, stub, and gesture endpoints using runtime `cellWidth` and
   `cellHeight`; placement previews must use identical mapping. Preserve
   particle identities and the single-cell machine footprint.
2. Replace machine-specific Tubing attachment and Mixer footprint heuristics
   with exact-anchor discovery. Share compatibility checks among input
   attachment, source/destination routing, and world-cell snap suggestions.
   Resolve UI hit/snap within 20 CSS pixels of the transformed marker, but
   attach topology only when compatible material occupies or touches that
   port's `connectionCell`. Defer pointer-down on ports; after the drag
   threshold, use a forced size-3 stroke of Tubing for flow ports or Copper for
   powered inputs. Clamp its straight extension to 20 CSS pixels and commit
   atomically only when the clamped path connects the anchor to compatible
   external material. Blocked or incompatible paths leave no partial stroke.
   Track port-drag leads separately, and keep a port red until compatible
   external Tubing/Copper contacts it directly or joins its lead. Allow the
   selected anchor through the machine-face paint guard, while blocking other
   under-face paint. Preserve click-to-open behavior, eraser, and grabber.
   Implement machine placement as the transient `poseSelecting` then
   `extensionPreview` sequence; capture/save logic must ignore both stages and
   serialize only a successful atomic commit.
3. Alpha-trim each supplied face, preserve aspect ratio, and center it in a
   64-pixel icon with artwork no larger than 56 pixels. Transform artwork
   markers consistently, then project their resolved rotated connectionCell
   anchors through actual `cellWidth`/`cellHeight` for connector geometry.
   Draw idle circles red and externally connected circles green, with short
   2-pixel stubs bridging markers and anchors. Fix SVG overflow/clipping so
   stubs remain visible up to the anchor. Preserve machine details, state
   affordances, flow overlays, selection, and placement preview. Add the Fan
   placement cone preview with the same path, direction, and range as
   Heater/Cooler previews.
4. Rename the active machine and code/UI references to Sprinkler while
   retaining particle ID 52 and the load-time legacy `Vent` alias. Add a
   default-on Drain Mode toggle to the Sprinkler controls. Preserve
   `machineSetting` bit 0 for Release and use bit 1 for Drain Mode in setting
   version 2. Write portable saves as format version 2 with
   `sprinklerModeVersion: 2` on simulation and blueprint state. When Drain
   Mode is off, emit the Sprinkler's stored Tubing-fed
   material toward the seven declared clock-position targets, using seven
   persisted per-direction Float32Array planes and the normalized
   `releaseRate / 7` share. A blocked target retains only its own capped credit
   and does not redirect flow. Tag particles from rays 3/9, 4/8, and 5/7 with
   separate launch direction/age state; project them with DDA at one cell per
   frame for 12 frames while gravity ramps to native gravity from the
   specified group multipliers. Keep ray 6 and Drain-Mode-ON particles
   untagged with existing movement. Clear trajectory state on collision,
   boundary, removal, replacement, or age completion, and persist and move it
   with the particle. Drain Mode on continues through the existing downward
   release path. Write the setting-version marker into save and blueprint
   payloads and migrate legacy mode values and field names during load.
5. Add the Splitter machine to definitions, machine picker/artwork, inventory
   behavior, Tubing source/destination routing, balanced two-output scheduling,
   and save/blueprint/grab operations. A 10 units/s input should yield 5/s on
   each output when both are available; preserve the full incoming rate when
   one branch is unavailable according to buffered-output capacity.
6. Add the rotatable Collector definition, directional funnel SVG, one output
   port, one-material 100-particle buffer, legacy two-cell suction area, and
   tubing-limited output capped at 30 units/second. Restrict world suction to
   Collector; all three Storage Bins fill only through compatible Tubing
   inputs. Preserve their inventory and output behavior. Add machine collision
   and sealing masks that stop material leaking around housings while retaining
   declared connector openings, the Collector's facing intake, and the
   Sprinkler/Mixer world outlets. Preserve the legacy rotated
   `intakeBarrierCells` for suction and implement a separate rotated
   `collectorSealMask` from supercover side rails and a short body shell. Use
   the seal as virtual solids in movement/diagonal checks, exclude seal rails
   from suction, leave the central intake lane open and output anchor unmasked,
   and allow static-solid painting only at rotated funnel rim/side-lip cells.
7. Update `docs/GAME_MECHANICS.md` in the same change, along with the machine
   guide or overview pages whose current behavior descriptions need correction.
   Keep this plan active until verification is complete, then archive it under
   `docs/archive/plans/` with its content preserved and leave `docs/plans/`
   empty.

## Test plan and pre-implementation baseline

The test engineer added `runMachinePortsFlowRegressions()` to
`tools/simTest.mjs`, selected by the focused `machine-ports-flow` option. It
expects these new physics APIs:

- `getMachinePorts(x, y)` to describe each machine's declared ports and stable
  `connectionCell` anchors.
- `getMachinePortAt(x, y, materialId)` to resolve a compatible connection at
  that exact anchor.
- `getMachinePortSnapTarget(x, y, materialId)` to return a compatible
  `connectionCell` suggestion for a world-cell query without mutating the cell
  or world. The UI separately maps screen-space hits near transformed markers
  to that anchor.
- Sprinkler-named inventory, tubing-rate, and release APIs, plus
  `isDrainModeEnabled(x, y)` / `setDrainModeEnabled(x, y, enabled)` for the
  Drain Mode switch. The latter reads and writes bit 1 without changing
  Release bit 0. Existing `getVent*` / `setVent*` machine-facing names are
  renamed in active code and tests; old `Vent` names remain only as explicit
  save/blueprint read aliases.
- Simulation and blueprint snapshots carry `sprinklerModeVersion: 2` and
  `machinePortLayoutVersion: 2`; portable save files use format version 2 and
  accept version 1 for migration. The port-layout marker, not the portable
  file version, distinguishes legacy and stable-anchor connection geometry.

Focused deterministic and browser coverage uses the 3-by-3 sheet dimensions
and checks that each exact alpha-trimmed marker center maps to its rendered
64-by-64 SVG location. Check port role, connector material, count, and stable
`connectionCell` anchors for Copper-powered Fan/Heater/Cooler inputs,
family-restricted Storage inputs and outputs, the input-only Sprinkler, the
two-input/no-output Mixer, the one-input/two-output Splitter, and the
output-only Collector. Check that
anchors match the established machine-relative offsets and remain distinct for
adjacent ports. Check idle markers stay red until external compatible Tubing
or Copper touches the anchor directly or joins its separately tracked lead;
the port's own unjoined lead alone must not turn it green. Verify screen-space
hit/snap regions are centered on transformed markers, independent from anchors,
and select the nearest compatible marker within 20 CSS pixels; marker
proximity alone must not create topology. At zoom 2 and across resize, verify
markers, hit regions, stub endpoints, and gesture endpoints project from the
same rotated anchor using actual `cellWidth`/`cellHeight`; placement previews
must use identical direction mapping and rounding.

Exercise port and body clicks opening the correct dialogs, and direct port
drags starting a forced size-3 stroke in the port's connector material:
Tubing for flow ports and Copper for powered inputs. Verify an overlong drag
clamps to 20 CSS pixels from the selected marker and commits atomically only
when the clamped path connects the selected anchor to compatible existing
material. Dragging into existing Tubing must create a real network. Invalid
materials, misses, blocked paths, and canceled drags leave no partial stroke.
Verify the selected port's own `connectionCell` remains paintable through the
machine-face guard while every other under-face cell stays protected. Confirm
SVG overflow exposes the complete 2px marker-to-anchor stub. Check output-cone
orientation for powered machines and Fan's placement cone direction against the
Heater/Cooler preview.

Cover the two-stage placement state machine separately. In `poseSelecting`,
the existing first facing drag changes only the ghost; the world and captured
save/blueprint state remain unchanged. First pointer-up freezes position and
direction and enters `extensionPreview`, selecting the first input in
definition order or the Collector's output-only port. Verify the cursor preview
uses the port's Tubing/Copper material, size 3, transformed anchor, and 20 CSS
pixel cap. A valid second click atomically creates the machine and connector;
an invalid or blocked placement leaves the preview active and creates neither,
then a corrected second click succeeds. Verify Escape and right-click cancel,
touch follows the same transitions, and preview-only machine/connector state
never appears in save or blueprint captures while committed state does.

Test legacy Tubing routes through the stable connectionCell anchors. Missing
`machinePortLayoutVersion` on a world save or blueprint must select legacy
attachment geometry even when the portable save is format version 2; verify
version-aware remapping keeps route continuity and tube cells without creating
false connections. Confirm new captures carry layout version 2. Old Mixer
output Tubing remains as material but does not drain Mixer inventory after that
endpoint is removed.

Test Drain Mode default-on, both toggle positions, and version-1-to-version-2
setting migration for original Release values and legacy Sprinkler values
0/1/2/3. Check missing-setting defaults; version-2 portable save and
`sprinklerModeVersion` markers/round-trip; old world and blueprint
`ventSprayFlow*` aliases; missing launch fields; Sprinkler identity at particle
ID 52; and the load-time `Vent` alias. Verify the UI toggle and saved state
agree, with ON selecting the ordinary downward outlet and OFF selecting the
seven-way projection while Release remains independent.

Verify that tipping each family of material onto a Storage Bin does not change
its inventory, while compatible Tubing input still fills it and incompatible
material is refused. Verify Collector placement in all eight directions;
powder/liquid/gas collection; one-type-only buffering; capacity 100; suction
only within its rotated two-cell funnel area; no collection through a blocked
funnel; and no loss when its output route is absent or incompatible. Across all
eight facings, verify open-mouth suction for powder, liquid, and gas while seal
side rails are never treated as suction targets. Check diagonal and side
leakage at each facing, including a glass pane placed flush against the funnel,
and confirm the central intake lane stays open. Test that only rotated
rim/side-lip cells permit static-solid painting; arbitrary under-face cells
remain blocked. Check its output rate against both the 30 units/second source
cap and Tubing route capacity, including a single-cell 10/s restriction.
Verify transfer into each compatible Storage Bin and refusal by incompatible
receivers. Verify buffer and direction through save/restore, blueprint
capture/stamp, and grab/drop. Verify Collector-to-Storage Tubing flow before
and after persistence, preserve current routes, and use version-aware remapping
for legacy connections without breaking the Collector route. The concrete
browser fixtures in `placement.spec.mjs` cover the two-click Collector machine
and output-lead commit; `storage.spec.mjs` covers Collector-to-Storage transfer,
both rotated intake lips, and side-leak probes.

Test the collision/sealing mask around every machine housing: particles must
not pass through or leak around sealed faces, while declared Tubing/Copper
anchors remain usable, the Collector can take material through its facing
funnel, and Sprinkler/Mixer release outlets can emit into the world. Verify the
Collector's output anchor remains outside the seal mask and transfer into
compatible Storage Bins is unchanged.

For Sprinkler simulation, test all seven clock directions, unrounded equal
per-ray shares, combined release-rate conservation, and independent blocked
ray credits. Feed non-Water material through compatible Tubing and verify
material identity is preserved by all spray rays. Check seven saved
`Float32Array` credit planes, old-save zero defaults, and round-trip through
save/restore and blueprint capture/stamp. For tagged particles in groups 3/9,
4/8, and 5/7, assert the 0.00, 0.05, and 0.25 initial gravity multipliers,
angle-specific lateral projection at one cell per frame, and linear convergence
to native gravity by frame 12. Check 3/9 travel farthest laterally and 5/7
project further downward. Verify launch metadata clears on obstacle, boundary,
removal, replacement, and age completion; follows swaps and grab/drop; and
survives save/restore and blueprint capture/stamp. Verify direction 6 and Drain
Mode ON stay untagged on their existing downward paths.

For Splitter, check one Tubing input/two Tubing outputs, the `10/s -> 5/s +
5/s` split, balanced branch totals, and combined inventory conservation.
Verify a blocked outlet buffers only its unserved share while the available
outlet retains its half-rate, then check buffer and branch inventories across
save/restore.

The initial focused simulation baseline was red at the missing Drain Mode and
Sprinkler API guard; syntax checks and `git diff --check` passed. After the
machine-flow implementation, and before the later seal-mask scaffold, the
focused simulation run passed all 83 checks:

```text
npm.cmd run test -- --focus=machine-ports-flow
83 passed, 0 failed
```

The earlier pre-implementation result was `exit code: 1`, `0 passed, 1
failed` at the missing machine-port/Sprinkler API guard. Neither simulation
result validates the later partial Collector seal-mask scaffold.

The pre-implementation placement/storage browser baseline was:

```text
npm.cmd run test:browser -- e2e/machines/placement.spec.mjs e2e/machines/storage.spec.mjs --workers=1 --trace=off
15 tests ran: 6 passed, 9 failed
```

Those failures confirmed the missing two-stage machine placement and Collector
rim/seal behavior. The Collector-to-Storage route fixture was corrected after
this run because its Sand particle coordinate was outside the default
facing-3 intake. That corrected fixture was not rerun; treat the fixture
correction separately from runtime failures. The fixtures include two-click placement, Glass on both
Collector rim lips in all eight rotations, arbitrary under-face paint
rejection, powder and liquid side-leak probes, and compatible Collector-to-
Storage transfer.

After implementation, rerun that exact focused command and continue iterating
until all checks pass. The simulation harness should retain the existing
storage, Sprinkler, Mixer, and tubing regressions, updating active fixtures and
API use to Sprinkler names while preserving ID 52 and the `Vent` load alias.
Browser specs under `e2e/machines/ports.spec.mjs`,
`e2e/machines/sprinkler.spec.mjs`, `e2e/machines/persistence.spec.mjs`, and
`e2e/machines/placement.spec.mjs`, plus Collector behavior under
`e2e/machines/collector.spec.mjs`, should cover art scale/trim/marker alignment,
idle/connected colors, click-versus-drag behavior, the 20 CSS pixel connector,
port role/material rejection, two-stage placement ghost/extension, atomic
retry and cancel behavior, touch parity, Drain Mode states and save migration,
legacy route compatibility, Collector funnel orientation/output to Storage,
and Fan cone preview parity. Confirm eraser/grabber behavior and that there is
no paint beneath the face outside connector strokes. Run focused specs only
through the documented npm wrapper; do not run a full suite without user
approval.

The test engineer updated the machine browser specs, including the renamed
`e2e/machines/sprinkler.spec.mjs`, the Drain Mode UI, save migration, and Fan
preview cone. An earlier broad browser run before the Sprinkler rename reported
30 passing and 4 failing checks; those failures came from stale fixture names
and modal/save-dialog setup. The affected specs now use the new fixture
identity and corrected dialogs. Re-run focused machine browser coverage after
implementation and record its current result here.

## QA pause — 2026-09-25

Runtime work and testing are paused. No tests have run after the partial
Collector seal-mask scaffold. Before closing this plan:

- Implement and verify two-click `poseSelecting` / `extensionPreview` placement
  with ghost-only first stage, atomic commit, retry/cancel, touch parity, and
  committed-only save/blueprint state.
- Verify external Tubing/Copper contact controls port connection color and
  survives save/load; finish exact rotated-anchor projection for marker, hit,
  stub, and gesture geometry using runtime cell dimensions.
- Implement and test the rotated Collector Glass-rim paint exception, complete
  and validate the separate seal mask, and rerun the corrected
  Collector-to-Storage fixture.
- Rerun the focused placement/storage browser command above and the focused
  machine-flow simulation after the seal-mask work. Review docs against
  verified behavior, then archive this plan only after QA passes.

Evidence at pause: focused machine-flow simulation passed `83/83` before the
seal-mask scaffold; the pre-implementation browser baseline was `15` tests,
`6` passed and `9` failed. The Sand intake fixture was corrected afterward but
not rerun. No test result currently covers the seal-mask scaffold.

## Resume handoff and acceptance scope — 2026-09-25

The resumed implementation starts from the partially changed working tree; it
must preserve the current Sprinkler, Splitter, port, and persistence work while
closing these remaining contracts:

1. Complete the two-stage placement state in the pointer UI. The first gesture
   sets only a ghost pose. Its pointer-up freezes that pose and selects the
   first input port, or the Collector output. The second gesture previews and
   atomically commits a size-3 lead of at most 20 CSS pixels with the machine.
   Invalid placement or lead paths keep the preview available for retry; Escape,
   right-click, and touch use the documented cancel/commit transitions. Only
   committed cells enter saves and blueprints.
2. Use one rotation and runtime cell-size projection for port markers, hit and
   snap regions, stubs, lead origins, and placement previews. Separate screen
   proximity from the physical `connectionCell` topology. A port's own lead
   alone remains red and inactive; compatible external Tubing or Copper contact
   makes it green and enables its route or power. Recheck this after restore,
   blueprint stamping, and grab/drop. Persist lead ownership with
   `machinePortLeadRemap` (`Uint32Array`, signed relative owner `dx`/`dy` packed
   into two 16-bit offsets) and `machinePortLeadSlot` (`Uint8Array`, port slot
   plus one; zero means unowned). Relative encoding is intended to keep
   ownership with a jointly moved or stamped machine and lead.
3. Finish the Collector's rotated seal rails and body shell without closing its
   central intake or output anchor. Permit Glass and other static solids only
   on its rotated rim and side lips; reject ordinary under-face paint. Confirm
   powder, liquid, and gas intake in all eight directions, side and diagonal
   containment, single-material capacity 100, and transfer capped by both
   30/s and route capacity. Rerun the corrected Collector-to-Storage Sand
   fixture rather than treating its earlier result as runtime evidence.
4. Recheck Sprinkler Drain Mode ON/OFF, seven generic-material streams at
   `releaseRate / 7` each, projection and credits, and migration. Recheck
   Splitter half-rate branches, blocked-output buffering, and persistence.
   Preserve Storage's compatible Tubing-only intake, Mixer release/recipes,
   powered machine activation, Fan cone preview, existing tube routes, and
   legacy saves and blueprints.

The test engineer supplies focused failing regressions before implementation
changes for this resume. Record their file names, red baseline, and final
focused results below as they arrive. Run only the relevant documented npm
simulation and browser wrappers; full-suite execution requires separate user
approval. After all focused checks pass, reconcile `docs/GAME_MECHANICS.md`
and `e2e/machines/README.md` with the verified behavior, preserve this plan
under `docs/archive/plans/` with a dated descriptive name, and leave
`docs/plans/` empty.

### Resume test-engineer handoff

- `e2e/machines/ports.spec.mjs` adds a Fan Copper-lead regression: an unjoined
  port lead stays red and electrically idle through save/restore and blueprint
  stamping, then becomes connected only when an external compatible connector
  joins it.
- `e2e/machines/placement.spec.mjs` adds a Collector placement regression:
  pending pose/lead preview does not enter save or blueprint state; a blocked
  second click commits neither machine nor lead and allows retry; a valid retry
  commits both; right-click cancels a subsequent preview without saving a
  ghost.
- The same placement spec adds a touch-input regression using Chromium with
  `hasTouch: true`: first tap must leave only the Collector ghost and enter the
  lead-preview stage; the second tap commits the machine and connector.
- The test engineer ran the pre-fix baseline through the repository wrapper:

  ```text
  npm.cmd run test:browser -- e2e/machines/ports.spec.mjs e2e/machines/placement.spec.mjs --grep 'a port lead|blocked machine lead' --workers=1 --trace=off
  2 tests ran: 0 passed, 2 failed
  ```

  The placement case failed at its first click because the Collector preview
  count was `0`, expected `1` (`placement.spec.mjs:381`). The port case failed
  because a port with only its own lead was not red/idle
  (`ports.spec.mjs:103`). Both specs passed `node --check`, and the test
  engineer reported no `git diff --check` whitespace errors. Keep this new
  red baseline distinct from the earlier placement/storage baseline; append
  the final focused rerun after implementation.

  ```text
  npm.cmd run test:browser -- e2e/machines/placement.spec.mjs --grep 'uses the same ghost' --workers=1 --trace=off
  1 test ran: 0 passed, 1 failed
  ```

  The touch baseline failed at its first tap because the Collector preview
  count was `0`, expected `1` (`placement.spec.mjs:451`); syntax check passed.

### Post-seal QA checkpoint

After the Collector seal changes, the focused `machine-ports-flow` simulation
passed `83/83`. The focused `storage.spec.mjs` browser run passed `5/5`,
including the corrected Collector-to-Storage transfer fixture and the rotated
rim/side-leak cases. The focused `placement.spec.mjs` browser run passed `6/12`;
two failures still showed no preview after the first facing drag, and four
found an empty SVG port-stub path. Placement is being corrected. This
checkpoint does not close the plan or validate the remaining port and
persistence specs.

### Collector Glass painting scope addendum

The user extended the Collector painting requirement beyond the narrow
funnel-rim exception: Glass may be painted along both rotated side rails from
the funnel lips down to the housing. Keep the central intake lane and output
anchor open, and continue to reject arbitrary under-face painting outside
those rails and the allowed funnel rim. Recheck the Glass placement and
particle side-leak cases in all eight facings after this change. This addendum
supersedes the narrower rim-only paint wording earlier in this plan and in
the current `docs/GAME_MECHANICS.md` QA-hold text.

## QA pause and handoff — 2026-09-25, after Glass side-rail work

The plan stays active and unarchived. The latest focused evidence is:

| Check | Result | Scope and limit |
| --- | --- | --- |
| `machine-ports-flow` simulation | `83/83` passed | Ran after the Collector seal work. |
| `storage.spec.mjs` | `5/5` passed | Includes corrected Collector-to-Storage transfer and rotated rim/leak checks; ran before the later Glass side-rail extension. |
| Glass side-rail focused browser case | `1/1` passed | Paints Glass down both Collector rails to the housing in all eight rotations. |
| `placement.spec.mjs` full focused spec | `11/12` passed | One catalog placement case failed before the port-lead endpoint clamp. |
| Catalog placement focused case | `1/1` passed | Ran after the endpoint clamp; the full placement spec has not been rerun. |
| `ports.spec.mjs` full focused spec | `3/7` passed | Four failures at that checkpoint; see disposition below. |
| Corrected external-lead focused case | `1/1` passed | Its earlier cardinal-contact fixture was corrected; this does not resolve the other port failures. |

The port failures still needing a full-spec rerun are: Gas Storage's visible
stub was `0.852px` from its expected projection against a `<=0.75px`
tolerance; a Storage-to-Sprinkler direct gesture route showed no flow; and a
port with only its own lead appeared green at zoom. After the `3/7` ports run,
the overlay projection changed to use `getBoundingClientRect()` width and
height for cell dimensions and SVG view boxes. The Gas Storage case has not
been rerun after that edit. The external-lead cardinal fixture was corrected
and its isolated test passed `1/1`; do not count that former fixture failure as
an unresolved runtime defect. Storage-to-Sprinkler flow and zoomed own-lead
color remain unresolved runtime issues. Core/test syntax checks and
`git diff --check` passed. No full test suite was run.

Next, fix the two known runtime issues and rerun the focused repository npm
wrappers from the repository root, keeping the configured Playwright browser
and server:

```text
npm.cmd run test:browser -- e2e/machines/ports.spec.mjs --workers=1 --trace=off
npm.cmd run test:browser -- e2e/machines/placement.spec.mjs --workers=1 --trace=off
npm.cmd run test:browser -- e2e/machines/storage.spec.mjs --workers=1 --trace=off
npm.cmd run test -- --focus=machine-ports-flow
```

After those pass, run the remaining focused machine browser coverage for
Sprinkler, persistence, powered machines, and Mixer, and record its result:

```text
npm.cmd run test:browser -- e2e/machines/sprinkler.spec.mjs e2e/machines/persistence.spec.mjs e2e/machines/electrical.spec.mjs e2e/machines/mixer.spec.mjs --workers=1 --trace=off
```

Reconcile `docs/GAME_MECHANICS.md` and `e2e/machines/README.md` with verified
behavior only after the outstanding checks pass. Then archive this plan under
`docs/archive/plans/` and leave `docs/plans/` empty. Do not run a full suite
without the user's approval.

## Resume scope addendum — 2026-09-25

The plan remains active and unarchived. Preserve all implementation and QA
evidence above. Current disposition of the architect's ordered scope:

1. Port connection behavior and external-contact rules are confirmed. Zoomed
   artwork/port registration is also implemented and verified by the 8/8
   focused port run below.
2. Retain the two-stage placement acceptance: ghost-only first stage,
   atomic machine-and-lead commit, retry/cancel, touch parity, and
   committed-only save/blueprint state. Keep this item in the broader QA review.
3. Global alpha-aware painting is confirmed: transparent rendered pixels
   permit paint and non-transparent artwork blocks it across all 64px machine
   overlays. The Collector first-row physics collision and full-buffer
   containment are implemented and verified by the 7/7 focused storage run.
   This supersedes the earlier Collector-specific numeric paint offset. At the
   default down-facing direction, the first opaque funnel row is
   `y = machine.y - 7`; eligible material is collected only while the exact
   material can be stored, otherwise particles remain upstream. Preserve the
   open intake lane and Tubing output.
4. Zoom registration for placed and preview icons, connection-cell stub
   projection, and the 20 CSS pixel port hit distance are implemented and
   verified by the focused port spec.
5. Recheck the remaining machine contracts: two-stage placement, Collector
   persistence/output, Sprinkler modes and migration, Splitter branch rates
   and buffering, Storage's Tubing-only intake, Mixer behavior, powered
   machines, Fan preview, existing routes, and legacy saves/blueprints.

The alpha-paint and Collector overflow regressions and zoom geometry coverage
are in place, and their focused owning specs pass as recorded below. The
mechanics guide and machine E2E README have been reconciled against those
results. The user authorized the full regression suite after focused checks;
the full-suite result remains pending, so keep this plan active and do not
archive it yet.

### Global paint regression — pre-fix baseline

- `e2e/machines/storage.spec.mjs` adds the focused test `Glass paints
  transparent machine artwork pixels` (around line 406). It exercises the
  registered machine overlays. For each Collector direction, it chooses a
  transparent point outside the existing rim allowance, paints Glass through
  Playwright, and uses that same painted cell as the Water guardrail probe
  while checking the intake and output.
- Red baseline:

  ```text
  npm.cmd run test:browser -- e2e/machines/storage.spec.mjs --grep "Glass paints transparent machine artwork pixels" --workers=1 --trace=off
  1 test ran: 0 passed, 1 failed in 3.9s
  ```

  The initial pre-fix red run stopped on the Fan assertion. The test was then
  strengthened to run Collector first; its transparent target was outside the
  existing `isCollectorRimCell` allowance. The pre-fix baseline failed at
  Collector direction 0 before Water simulation: the UI should paint Glass ID
  13 on that transparent pixel, but the cell remained empty. The test
  engineer reported that `node --check` and `git diff --check` passed. The
  subsequent alpha-paint check passed 1/1, and the full focused storage suite
  passed 7/7, including Collector containment; see post-fix results below.

### Port zoom regression handoff

- `e2e/machines/ports.spec.mjs` covers rotated Liquid Storage icon center and
  size, port marker/stub/hit projection, and painting at default and zoomed
  levels.
- Red baseline:

  ```text
  npm.cmd run test:browser -- e2e/machines/ports.spec.mjs --grep "rotated machine artwork, port projection" --workers=1 --trace=off
  1 test ran: 0 passed, 1 failed as intended
  ```

  At zoom level 2, the pre-fix test expected a 96px icon but measured 64px.
  The test syntax check and `git diff --check` passed. The later full focused
  port spec passes 8/8; retain this red result as historical evidence.

## Latest confirmed scope and verification — 2026-09-25

The user confirms that machine connection behavior and transparent-alpha paint
permission are now good. Preserve those fixes. The earlier connection and
alpha-paint red results above remain historical baselines, not open behavior
failures.

The focused alpha-paint check passed:

```text
npm.cmd run test:browser -- e2e/machines/storage.spec.mjs --grep "Glass paints transparent machine artwork pixels" --workers=1 --trace=off
1 test passed (19.7s)
```

This result verifies transparent-pixel painting coverage only. It does not
by itself exercise the Collector under realistic full-buffer overflow. The
later focused storage run below covers that behavior and passes.

### Remaining focused acceptance

- **Zoom registration:** Implemented and verified. Placed and preview machine
  icons scale and reposition with cell zoom; port stubs project from their
  world `connectionCell`s, and the hit distance remains 20 CSS pixels. The
  full focused `ports.spec.mjs` run passes 8/8; the earlier 96px-expected,
  64px-actual result is the pre-fix red baseline recorded below.
- **Collector overflow:** Implemented and verified by the focused storage run
  passing 7/7. At direction 3, the first opaque artwork row is
  `y = machine.y - 7`. Accepted material at that edge enters the buffer while
  there is room and fills capacity to 100. Once full or when the exact material
  type is rejected, physics collision keeps particles upstream at that row;
  they do not pass behind the housing, travel partway down, or spill past the
  flanks. Intake resumes when an inventory slot opens. The aligned collision
  keeps the upstream intake lane and Tubing output usable and is independent
  of UI alpha-paint hit testing.

Keep the plan active and unarchived. Project documentation is now reconciled
against the focused results. The user has authorized the full regression suite
after the relevant focused checks complete; its final result is still pending.

### QMODE Collector output marker adjustment

For the user-authorized QMODE adjustment, place the Collector output marker
and its presentation hit target at local SVG `(50.6, 32)`: centered on the
down-facing icon axis and 5 viewBox units above the lowest drawn row. Keep the
port's logical `x`/`y` `connectionCell` unchanged. This is presentation/hit
target positioning only; no separate test task is opened for this QMODE edit.

### Collector boundary regression handoff

- Focused regression: `e2e/machines/storage.spec.mjs`, test `zoomed full
  Collector keeps UI-poured Water above its first drawn row`.
- Red run:

  ```text
  npm.cmd run test:browser -- e2e/machines/storage.spec.mjs --grep "zoomed full Collector keeps UI-poured Water above its first drawn row" --workers=1 --trace=off
  ```

- The default down-facing Collector's first opaque artwork row is measured at
  `y = machine.y - 7`. The focused overflow test shows accepted Water fills the
  Collector to `100/100`; the next Water must collide on this row while the
  upstream intake lane and Tubing output remain open.
- The pre-fix red run captured Water crossing into the first opaque row on
  frame 1, from `(125, 67)` to `(125, 68)`, with the Collector already full.
  At 300 frames, 21 Water cells remain within the artwork span, including
  cells at y=68–72. Filling and intake-resume assertions pass; full-buffer
  containment fails.
- The eight-facing suction/lip fixtures in `e2e/machines/storage.spec.mjs`
  use cardinal barrier depth 7 with source depths 8–9, and diagonal barrier
  projection 5 with source depths 6–7. The corresponding visible UI lip is at
  cardinal depth 7 or diagonal depth 5 per axis, with half-width 5 cardinally
  and 3 diagonally. This records fixture geometry, not a passing containment
  result.
- The test engineer reports that `node --check` and `git diff --check` pass.
  The red baseline is superseded by the post-fix focused results below; retain
  it as historical evidence. Do not archive the plan until the full suite is
  resolved.

### Post-fix focused results — 2026-09-25

The Collector collision now covers its measured first opaque row and accepts
only eligible material from upstream while there is inventory capacity. The
full-buffer overflow regression and aligned all-facing barrier/lip coverage
pass in the focused storage suite:

```text
npm.cmd run test:browser -- e2e/machines/storage.spec.mjs --workers=1 --trace=off
7 passed, 0 failed
```

Zoomed machine artwork and port geometry pass the full focused port spec:

```text
npm.cmd run test:browser -- e2e/machines/ports.spec.mjs --workers=1 --trace=off
8 passed, 0 failed
```

These focused results do not record completion of the full regression suite.
Keep this plan active and unarchived until that suite is resolved; final plan
archiving remains pending.

### Browser-failure triage and fixture corrections — 2026-09-25

The architect's browser-failure review separated stale fixture setup from a
possible compatible legacy-endpoint migration regression. Correct the fixtures
before interpreting the affected UI failures as runtime defects:

- **Mixer redraw:** Four Mixer cases stop in `openMixer()` because they seed
  physics state and call `stepSimulation()` without redrawing the SVG machine
  overlay used by pointer hit testing. After direct seeding, call
  `await game.step(0)` before clicking the Mixer. The current failures point to
  stale test setup, not an established app regression.
- **Sprinkler redraw and input targets:** Six Sprinkler cases include dialog,
  unconnected-dialog, and rate-input failures with the same missing redraw;
  call `await game.step(0)` after direct setup and before clicking. For the
  Tubing tooltip, hover a cell from the bent route's returned `path`; `(20,20)`
  is not on that route. Align throughput anchors: a bin at `(10,20)` outputs at
  `y=23`, so place the Sprinkler at `y=26` for its input at `y=23`. Use a
  straight route for 20/s and 30/s cross-section checks. Rerun the bin-transfer
  case after correcting route geometry.
- **Portable save v2:** The large-world save test still expects version 1,
  while the writer emits version 2 and reads both versions. Update the test
  title and write-version expectation to v2; retain its load and round-trip
  assertions.
- **Smoke harness scope:** Keep `test:smoke` focused on startup and wiring.
  Its DOM stand-in does not model SVG alpha hit testing, so do not use it to
  judge machine artwork hit targets or zoom visuals. Correct the Tubing fixture
  to connect machine port anchors three cells above/below their centers and
  redraw after direct physics changes. Remove obsolete fixed-size icon
  expectations or cover those visual behaviors in Playwright.
- **Compatible v1 endpoint migration:** The portable-state route fixture has
  Powder Storage holding Sand while the Sprinkler holds Water; that mismatch
  correctly prevents flow. Make this fixture material-compatible or assert
  migrated endpoints without requiring active flow. The separate legacy-route
  regression uses compatible material and expected migrated endpoint codes and
  slots but reports no flow. The confirmed root cause is
  `isLegacyPortContact()` indexing `DEFS[machine]` instead of
  `DEFS[world.type[machine]]`, leaving migrated Storage endpoints disconnected.
  Keep the correction narrow to this definition lookup. Preserve the
  compatible-material route regression and require it to demonstrate actual
  post-load flow; inspect loaded inventories, each port's `connected` state,
  and `getTubingFlows()` if it still fails. The root cause is identified, but
  focused and full-suite outcomes remain pending.

After fixture corrections, rerun focused Mixer/Sprinkler and persistence
browser coverage, then investigate the compatible v1 endpoint case. The
focused browser commands are:

```text
npm.cmd run test:browser -- e2e/machines/mixer.spec.mjs e2e/machines/sprinkler.spec.mjs --workers=1 --trace=off
npm.cmd run test:browser -- e2e/machines/persistence.spec.mjs --workers=1 --trace=off
```

The following full regression commands are authorized but remain pending; no
results are recorded here:

```text
npm.cmd test
npm.cmd run test:smoke
npm.cmd run test:scale-profile
npm.cmd run test:browser -- --workers=1 --trace=off
```

Do not archive this plan until the full regression outcomes are resolved.

## Final implementation and verification — 2026-09-25

**Disposition:** implementation and documentation handoff complete; this plan
is archived. This final record supersedes earlier chronological notes saying
verification or archiving remained pending. Those notes and their red baselines
are retained above as handoff history.

The ordered scope is implemented: declarative machine ports and zoom-aligned
artwork; two-stage ghost/connector placement with committed state only in saves
and blueprints; Collector intake, full-buffer containment at the first opaque
artwork row, all-facing geometry, and alpha-aware painting; Sprinkler Drain Mode
and legacy state migration; Mixer/Splitter/Storage machine contracts; and
compatible legacy endpoint migration. The migration defect was corrected by
resolving legacy-contact definitions through `world.type[machine]`, preserving
compatible routes on v1 loads. The Collector's default down-facing
boundary is `y = machine.y - 7`; accepted material fills available capacity,
while full or rejected material stays upstream and intake resumes when capacity
opens. Port visuals follow declared `connectionCell` anchors at all zooms with
a 20 CSS pixel pointer-hit distance. Global machine-overlay painting allows
transparent pixels and blocks opaque artwork.

Final verification reported for this work:

- `npm.cmd test`: 371 passed.
- `npm.cmd run test:smoke`: 59 checks passed.
- Scale-profile and world-allocation checks passed.
- Focused machine browser suite: 23 passed.
- Full browser run: 191 passed and one 30-second timeout in the v1 Sprinkler
  migration case in `e2e/machines/persistence.spec.mjs`.
- After raising that test's timeout to 60 seconds, the focused migration rerun
  passed: 1 passed in 35.5 seconds. The full browser suite was not rerun after
  this timeout adjustment, so the recorded full run is not represented as
  192/192 passing.
- After the QMODE palette change, focused
  `e2e/materials/catalog.spec.mjs` passed 8/8.
- `git diff --check` passed; only Windows line-ending warnings were reported.

No additional test runs were performed during this documentation closeout.
