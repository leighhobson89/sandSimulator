# Game mechanics

This is the current reference for material definitions and practical material
guidance, live canvas feedback, electrical logic, machine behavior and ports,
Collector intake, Mixer recipes, Tubing, Sprinkler release, and their
maintenance contracts.
For machine interface and construction requirements, see
[`MACHINE_CONSTRUCTION_STANDARDS.md`](MACHINE_CONSTRUCTION_STANDARDS.md).
The broad simulation model remains in [`PROGRAM_OVERVIEW.md`](PROGRAM_OVERVIEW.md).
Use [`E2E_TEST_PLAN.md`](E2E_TEST_PLAN.md) for test ownership and browser-test
commands; active follow-ups and proposed changes remain in [`ISSUES.md`](ISSUES.md)
and [`FUTURE_IDEAS.md`](FUTURE_IDEAS.md).

## Game modes, missions, and local saves

The main menu starts either a **Sandbox** or a **New Campaign**. Sandbox keeps
the freeform world-size chooser and normal unlimited painting and machine
placement. Campaign starts a story mission with an authored world, finite
player-placement resources, machine limits, cumulative objectives, and event
notices. The menu stacks New Campaign above Sandbox, followed by Resume Game
when a resume record exists and Load Game; its theme panel sits below the
actions. Theme-specific presentation keeps the menu centered in Terminal.

The current first mission is **Mission 1: The First Daffodil**. It uses a
260×150 world with a five-row Sand floor spanning the full width. The floor is
the only material in the starting scene; Dry Mud and Daffodil Seeds are player
supplies. The player can place 100 Dry Mud, 1,000 Water, and one Daffodil Seed,
with no machine allowance. Mission data also fixes the ideal growing climate:
14 °C temperature, 68% humidity, 65% illumination, 10 °C dewpoint, and no wind.
Climate controls are locked during play, while Normal, Heat, Humidity, and Wind
visualizations remain available.

Campaign budgets apply to player-created placements. Attempts rejected by
world occupancy or an exhausted quota do not spend resources. Palette controls
reflect exhausted supplies. Blueprint stamps charge their newly placed
contents once; undo/redo restores the recorded stamp without charging again.
Mission starting-layout cells and particles created by simulation reactions
do not use player supplies. Sandbox bypasses all campaign limits.

Mission objectives count actual simulation transitions. **Grow one Daffodil
from seed** counts one `Daffodil Seeds → Daffodil` germination transition.
Painting or stamping a Daffodil does not count. Progress accumulates from the
transition and the configured completion event fires once; objective counters
and fired event IDs remain in the active session only. The mission briefing
displays the mission number, title, briefing, objective, and available supplies
before play. During play, the mission HUD shows objective progress, each
supply's used and total counts, and event notices.

**Mission 2: The Icebound Grove** uses a 260×150 world with a full-width
five-row Ice floor. The opening climate is −10 °C, 35% humidity, and 10%
illumination, with a −15 °C dewpoint and calm wind. Player supplies are 500 Dry
Mud and one Banana Seed; the Ice floor is part of the authored world, and
melting it creates Water through simulation. The authored climate objective is
30 °C, 95% humidity, and 85% illumination. Banana Plant's material definition
sets ideal temperature to 30 °C and ideal humidity to 95%; it has no
material-level ideal illumination, so 85% is a Mission 2 target only.
The briefing directs the player to the Temperature and Humidity sliders in
World Parameters and the Ambient Light slider. It distinguishes Banana's
temperature/humidity ideals from the authored 85% illumination target.

The four guided Mission 2 objectives each have target one: count an actual
Ice-to-Water transition, reach all three authored climate targets at once,
count a Dry Mud-to-Wet Mud transition, then count an actual Banana Seeds-to-
Banana Plant germination. Painting or blueprint stamping the resulting
materials does not satisfy transition objectives. Each objective event fires
once per run; progress, used supplies, and fired event IDs are session state and
are not saved. The temperature,
humidity, and illumination controls stay available so the climate target can be
reached; dewpoint and wind are locked for this mission.

Campaign catalogs hide unavailable materials, machines, and tools. Categories
with available entries automatically expand in Campaign; empty categories are
collapsed and locked. Their visible headings remain keyboard focusable and
explain that no items are available. Other unavailable controls use disabled
semantics, reduced opacity, and a focusable tooltip with a bold red **DISABLED**
status and reason. Pause and Load remain usable during a mission. Campaign Save,
Save to Library, export, and Autosave are disabled; Sandbox keeps the full
catalog and its normal controls.

Completing all mission objectives pauses the simulation and automatically
opens a recap dialog with objective results and used, total, and remaining
counts for each finite player supply. Clicking **OK** closes the recap and
leaves the objective-passed bar in the HUD. Its **ADVANCE** action opens the
next mission briefing; confirming that briefing initializes its authored world
and fresh resource budgets. A Campaign checkpoint is written only when
**ADVANCE** selects an installed successor. It stores the next mission number;
Mission start, objective completion, recap dismissal, Restart, and a final
mission with no successor do not write a checkpoint. Restart asks for
confirmation, then rebuilds the authored scenario without changing the saved
mission number. Resume resolves the checkpoint's number and reconstructs a
pristine world, environment, full budgets, and zeroed objectives/events. The
completion recap and current run progress do not persist. When no later mission
is installed, the bar reports **CAMPAIGN COMPLETE** and cannot advance.

Portable LZString save payloads are version 3. Sandbox saves contain the full
world and tool state. A Campaign checkpoint contains the standard format,
version, timestamp, `mode: "campaign"`, and only the campaign-specific
`missionNumber`; it has no simulation, tool, blueprint, objective, event, or
resource-use state. Versions 1 and 2 remain loadable as Sandbox. Older version-3
full-state Campaign records normalize to a mission-number checkpoint and resume
from that mission's pristine authored start. Invalid checkpoint metadata is
rejected before the live world is restored.

Named local saves are stored as individual compressed records in the local save
library. Each record has an ID, name, automatically assigned Sandbox or
Campaign type, `saveString`, and update time. A separate active-save ID selects
the record restored by Resume Game. Five-minute Autosave updates the active
Sandbox record only. Starting a Campaign creates no record; its first Campaign
checkpoint is written only when **ADVANCE** selects a successor after mission
completion. Later advances update that Campaign record with only the next
`missionNumber`. A new Campaign creates its own checkpoint at its first
ADVANCE, preserving existing Campaign records. Starting a new autosaved Sandbox
creates a fresh uniquely named Sandbox record so it preserves Campaign records.
Players can name or update Sandbox records through **Save to Library** in the
Load/Save dialog. Campaign Save, Save to Library, export, and timed Autosave
are unavailable during play. The dialog lists local records and offers a Load
action for each, while portable string copy/paste remains available for
Sandbox. Existing version-1 single-slot autosaves are migrated into the library
as a named record and become the active resume game. When migration succeeds,
the legacy slot is removed; the library record remains authoritative for
active-session autosave and resume.

The yellow **Campaign Editor** action in the main menu opens a docked side panel
beside the live canvas. It starts an unrestricted Sandbox authoring session,
with ordinary material, tool, environment, and visualization controls. Loading
a draft with a captured `startingSave` resizes and clears the canvas to the
saved dimensions before restoring that simulation; drafts that use a
declarative layout build that layout instead. Capturing the live scene stores a
compressed Sandbox save as the mission starting state. Drawing, clearing, or
resuming simulation marks a captured snapshot stale; recapture it before review
and installation. Editor drafts autosave in localStorage under
`elemental-foundry.campaign-editor.drafts.v1`, separate from game saves.

While the editor is open, periodic autosave writes are suspended and the save,
import, and export controls are disabled. The active resume save remains
untouched. Closing the editor restores the previous autosave timer without an
immediate write; re-enabling Autosave after return releases the suspended-write
guard. Installing mission data requires review and approval, then a file picker
for `campaign.js`; the editor preserves source outside the generated mission-
data markers and stores a recoverable source backup in localStorage.

## 1. Material catalogue and glossary maintenance

The material picker is also the simulator's glossary. Its category headings
are keyboard-accessible buttons that expand and collapse each material grid.
Vegetation is the final group and starts collapsed; the other groups start
expanded. Starting a new world collapses Vegetation after startup succeeds.
Manual toggles stay in effect during play, and loading or resuming a world does
not reset the group state. Each heading shows a right-side arrow for its current
state.
Hovering or focusing any material button shows a fixed, readable tooltip with
the material name, short description, important physical and electrical
properties, and implemented
reactions. The tooltip is assembled from the prepared definition used by the
physics engine, so temperatures and target materials come from the rules that
actually run.
Seed tooltips replace the general property and reaction lists with a compact
Germination section. A blank line separates it from the seed description; it
shows the grown species' temperature and humidity ranges and ideals, the seed's
minimum germination thresholds, light minimum and ideal, and suitable substrate.

### Source of truth

- `particles.json` owns material names, descriptions, properties, and reaction
  rules. Every particle entry must have a non-empty `description`.
- `physics.js` validates descriptions while preparing definitions and exposes
  normalized values to the UI.
- `ui.js` (`formatMaterialTooltip`) formats those values. When a new rule adds
  user-visible behavior, add its readable line there at the same time.
- `styles.css` keeps the tooltip above panels, wraps its text, and lets a long
  glossary entry scroll without covering the whole workspace.

### Current catalogue

The prepared entries are grouped in the same order as the picker:

| Group | Materials |
| --- | --- |
| Powders | Sand, Wet Mud, Ash, Wet Sand, Dry Mud, Gunpowder, Snow, Scoria, Wet Ash, Corrosion |
| Liquids | Water, Oil, Lava, Acid |
| Gases | Fire, Steam, Smoke, Toxic Gas, Cloud |
| Solids | Ice, Stone, Wood, Glass, Wall, Clay, Ceramic, Insulation |
| Seeds | Grass Seeds, Moss Spores, Daffodil Seeds, Red Tulip Seeds, Geranium Seeds, Blue Flower Seeds, Banana Seeds, Water Grass / Lily Seeds |
| Metals | Copper, Molten Copper, Molten Aluminum, Iron, Molten Iron, Stainless Steel, Tubing |
| Electricals | Battery, Spark, Spark Dust, Spark Block, Elec, Simple Switch, Lamp, Spotlamp, Temperature Switch, Humidity Switch, Light Switch |
| LOGIC | NOT, AND, OR, NAND, XOR |
| Machines | Fan, Heater, Cooler, Sprinkler, Mixer, Splitter, Collector |
| Storage | Powder Storage Bin, Liquid Storage Bin, Gas Storage Bin |
| Tools | Heat Ray, Cold Ray, Wind |
| Vegetation | Plant, Grass, Flower, Lily Stem, Lily Pad, Lily Flower, Ash Grass, Moss, Daffodil, Red Tulip, Geranium, Blue Flower, Banana Plant, Water Grass, Daffodil Bloom, Tulip Bloom, Geranium Bloom, Blue Flower Bloom, Banana Bunch, Water Grass Bloom, Water Grass Pad, Banana Leaf |

Descriptions remain beside each material's `name` in `particles.json`, rather
than being duplicated here. This prevents the documentation from claiming a
threshold or conversion that the simulator does not implement.

Insulation is material `54`, a static pink-red Solid. It has `conductivity: 0`,
`ambientCooling: false`, and no fast-network rate (`thermalNetworkRate: 0`). Its
cooling rate is very slow. It absorbs radiant heat and retains its own heat, but
does not transfer heat by contact. It melts at `5000 C` into Lava. Insulation
remains a heat-retaining material; it is excluded from the fast metal thermal
network described below.

### Adding or changing a material

1. Add or update the `description` immediately beside the material's `name` in
   `particles.json`. Keep it concise and describe behavior a new player can
   observe.
2. Add the relevant reaction and property fields, and make sure every referenced
   target material exists.
3. If the physics rule is new, add its temperature, condition, and target
   wording to `formatMaterialTooltip` in `ui.js`.
4. Run `npm test` and `npm run test:smoke`. The smoke test rejects missing
   descriptions and checks that every picker button has an accessible tooltip.
5. Update this catalogue if the material set or glossary mechanism changes.

Review this section whenever material definitions, tooltip presentation, or the
glossary mechanism evolves.

## 2. Material behavior quick reference

The material definitions determine individual thresholds, rates, reactions, and
rendering properties. The following is a compact guide to the category-level
behavior and the mechanic-specific interactions; it does not replace the full
simulation description in [`PROGRAM_OVERVIEW.md`](PROGRAM_OVERVIEW.md).

| Category | Quick reference |
| --- | --- |
| Powders | Loose materials fall and slide diagonally. Water wets Sand, Dry Mud, and Ash into Wet Sand, Wet Mud, and Wet Ash. Corrosion falls as a powder and melts into Lava at high heat. Powders do not sort themselves by density against other powders. |
| Liquids | Water, Oil, Lava, and Acid flow and seek a level. Liquid storage also accepts molten metals. Water changes phase at its configured thresholds; Lava and Acid have their own material-defined heat and reaction rules. |
| Gases | Fire, Steam, Smoke, Toxic Gas, and Cloud rise and spread. Steam and Cloud use humidity and dewpoint condensation. Gas storage accepts non-flaming gases, so Fire is not accepted by a Gas Storage Bin. |
| Solids | Ice, Stone, Wood, Glass, Wall, Clay, Ceramic, and Insulation provide the fixed, structural, or phase-change behavior declared by their definitions. |
| Seeds | Eight viable powder seed types wait for suitable local temperature, humidity, and substrate moisture before germinating. Species rules in `particles.json` set their substrate, aquatic depth, and germination requirements. |
| Vegetation | Plant, grass, moss, aquatic plants, and flowering species use the environmental viability, growth, flowering, and seed-setting rules declared in `particles.json`; their leaves, pads, blooms, and fruit appear in this group too. |
| Metals | Copper and Molten Copper, Molten Aluminum, Iron and Molten Iron, Tubing, and Stainless Steel are listed here. Copper, Iron, Battery, and Stainless Steel conduct electrical routes; a charged Battery supplies logical current while connected. Stainless Steel transfers heat more slowly than Iron, draws Battery charge as a wire, and does not rust from Water or humid air. Battery remains a conductive storage metal even though it is listed in the Electricals picker group. Tubing has no electrical conductivity. |
| Electricals | Battery stores charge; a connected charged Battery supplies logical DC current through conductive wire. Spark charges Battery. Powered wire has a steady bright yellow base with no moving current animation. Battery cells have static charge-tinted artwork and at most one sampled trend sign per connected Battery entity. Spark Dust and Spark Block emit Sparks. Elec is high-purity copper wire with higher heat and electrical conductivity than Copper. Simple Switch relays logical current while ON; OFF blocks it. Lamp glows only when ON and its logical input is on. Temperature Switch and Humidity Switch compare the mean of five exposed air probes to a configured threshold and relay input current only when the comparison is true. |
| LOGIC | NOT, AND, OR, NAND, and XOR evaluate sustained ON/OFF signal levels on existing conductive routes. Each gate also needs a separate charged-Battery supply input; this supply powers the gate and is distinct from signal inputs. |
| Tools | Heat Ray and Cold Ray are short-lived directional brushes. A left-button stroke starts Heat Ray upward or Cold Ray downward; its first non-zero drag selects the nearest cardinal direction, which persists while stationary and changes only when the drag heading changes. Painted ray cells travel as projectiles using that stored heading. Wind moves light materials and stirs air; it stops at solid barriers but passes through plants. |

### Heat, electrical, and reaction anchors

- Ice above `0 C` becomes Water and Water below `0 C` becomes Ice. Water above
  `100 C` becomes Steam; Wet Mud above its definition threshold becomes Dry Mud
  and emits Steam. Steam condenses by the humidity and dewpoint rules in
  [Section 7](#7-seeds-plants-humidity-dewpoint-weather-and-corrosion), rather
  than by a lifetime countdown.
- Wood, Oil, and Plants ignite at their definition thresholds. Sand next to Lava
  becomes Glass; Lava below `700 C` becomes Scoria, and Scoria below `100 C`
  becomes Stone. Heating Stone above `100 C` returns it to Scoria, and heating
  Scoria above `900 C` returns it to Lava.
- Battery melts at `660 C` into Molten Aluminum and cools back into Battery.
  Copper and Elec melt into Molten Copper at `1085 C`; Iron uses `1538 C`.
- Battery charge is shared across cells that touch as one Battery reservoir;
  newly placed Battery touching a charged reservoir equalizes with its charge.
  Applying a Spark adds charge. A visible Spark emitted by a charged Battery
  is only an effect and does not replenish or drain the reservoir. The metal
  wire loads are `1` per Copper cell, `0.5` per Iron or Stainless Steel cell,
  and `0.35` per Elec cell. Machine loads use the same power-load units.
- State changes bank heat over time using each material's latent amount rather
  than changing immediately at a threshold. Water extinguishes Fire on contact,
  Lava chills to Scoria when Water touches it, and water wetting is limited to
  the declared powder reactions.
- Ordinary pairwise contact exchange runs each frame for material pairs that
  are not handled by the fast thermal network. Those pairs use their ordinary
  thermal conductivity, and bulk insulation still slows exchange for buried
  cells. This includes slower Wood, Stone, and Wall exchange, along with other
  ineligible contacts. Temperature updates remain bounded; ambient cooling,
  source radiation, and latent state changes remain separate effects.
- Air spaces are classified by a four-way, face-connected flood fill from the
  open top and sides each frame; the bottom world boundary represents implicit
  ground and is not an ambient-air opening. Empty cells and eligible gases
  reachable through cardinal faces are open air; diagonal-only routes do not
  connect domains. Open air follows the shared ambient temperature and its
  height-dependent profile. Air spaces with no face-connected route to the open
  top or sides are enclosed and keep a local temperature instead of being
  pulled toward global ambient. Enclosed empty air and gases still receive heat
  or cold from nearby matter, Heat Ray, Cold Ray, Fire, Lava, and other normal
  local sources. Steam in a sealed chamber can therefore remain hot while
  outside air cools; when the chamber is opened, its air returns to the
  open-air ambient behavior gradually.
- Air remains implicit in empty and eligible gas cells. Temperature and
  humidity are carried in the existing world fields; no air material or air
  particles are created. Calm enclosed air circulates in a slow deterministic
  two-dimensional roll, and Fan, General Wind, Gust, Heater, and Cooler flows
  transport those fields through face-connected air routes. The scalar mixing
  transport pass runs every other simulation tick at its original per-update
  rate. Direct machine treatment, particle movement, weather, and sources and
  sinks continue each tick, so the cadence makes air mixing less responsive to
  very fast changes between transport passes.
- Each transport pass rebuilds a transient three-state topology mask from the
  current world: `0` is non-air, `1` is air behind a storage barrier, and `2` is
  transfer-eligible air. This reuses topology classification across scalar
  transport phases and the limiter while preserving storage-wall blocking; it
  does not change active-jet field construction. In the face sweep, an edge is
  skipped only when both eligible endpoints exactly match the live background
  for every enabled scalar field. There is no tolerance threshold, so even a
  small temperature or humidity anomaly remains eligible for transport.
- Solid chamber walls are not automatically perfect insulators. Their contact
  cooling target averages all adjacent air-space faces: enclosed faces use
  their live local air temperatures, while open faces use height-adjusted
  outside ambient. A Wall cell touching both sides can therefore leak heat
  through its open-facing surface while still interacting with chamber air;
  Insulation's zero conductivity and very slow cooling make it the better
  barrier. Material-specific variance and bulk insulation continue to affect
  the rate.
- Ordinary contact exchange remains face-based, and a material's direct air
  cooling only uses cardinally adjacent air-space faces (Insulation has
  `ambientCooling: false` and is outside the fast network). Each face contributes
  its enclosed air cell's local temperature or, for open air, the
  height-adjusted outdoor temperature; those face temperatures are averaged.
  With no cardinal air-space face, a particle receives no direct
  ambient-cooling term and no `coolsBy` clamp.
  Material-to-material conduction and source heating remain active, so a shell
  can still conduct outside influence inward to enclosed contents. This blocks
  direct air cooling of shielded contents without making the shell perfectly
  thermally isolated.
- A material can opt into the fast thermal network with `thermalNetworkRate`.
  The current conductors are Copper, Elec, Molten Copper, Battery,
  Molten Aluminum, Iron, Molten Iron, Tubing, Fan, Heater, and Cooler. Tubing uses
  `thermalNetworkRate: 0.12`, despite having zero ordinary conductivity and no
  electrical conductivity. The network transfers heat between two opted-in
  conductors or between an opted-in conductor and adjacent enclosed empty/gas
  cells. It uses 32 local substeps per frame and replaces ordinary pair
  exchange for those eligible links. Open air, non-network materials, and
  Insulation are not network endpoints. Ordinary per-frame conductivity still
  handles every other contact pair, including slower Wood, Stone, and Wall
  exchange; eligible conductors use ordinary conductivity for links to open air
  or other non-network materials when their conductivity permits it.
- Solid Copper, Elec, Battery, Iron, Fan, Cooler, Tubing, and Heater have a local
  temperature glow. The material definitions provide `glowColor`, prepared as
  `glowRgb`, and blend from the base pixel color starting at `glowStartTemp`;
  `glowTemp` marks the fully blended point and equals each material's
  `meltPoint`. This changes only that cell's rendered color: it adds no halo,
  heat emission, or tint to neighboring pixels. Molten materials keep their
  existing color/color2 gradients unchanged.
- Ordinary materials are non-conductive by default. Copper, Iron, Stainless
  Steel, and Elec conduct routes from a charged Battery; Battery stores charge.
  A reached wire and machine input are logically ON while a charged Battery
  connects to the route. Logical power is steady; it has no traveling Spark
  animation. Copper, Iron, Stainless Steel, and Elec draw charge
  from a connected Battery through their wire length. Electrical wires connect
  only through occupied neighboring cells; even one empty air cell breaks the
  route. Direct diagonal adjacency is supported. Elec uses electrical
  conductivity `2`, wire reach `1`, and a small per-cell charge draw of `0.35`;
  its fast thermal-network rate is `0.3`. It behaves like pure copper, melts
  into Molten Copper, and takes four times the qualifying exposure to become
  Corrosion powder compared with ordinary Copper. Tubing has no electrical
  conductivity and opts into fast thermal links while keeping zero ordinary
  conductivity.
- Stainless Steel has nonzero ordinary heat conductivity and electrical
  conductivity, both lower than Iron's. Its power draw is `0.5` per cell and it
  connects to conductive machines through occupied neighboring cells. It does
  not join the fast thermal network or rust from Water or humid air.
- Conductive cells draw `1` power-load unit per tick for Copper, `0.5` for Iron
  and Stainless Steel, and `0.35` for Elec. One hundred power-load units
  correspond to one Battery charge unit per simulation tick. Connected
  conductive machine bodies contribute their declared cell load; active Lamps
  and supplied logic gates contribute their machine load once per device.
- Electrical current routes through Copper, Iron, Stainless Steel, and Elec
  wire as a steady binary ON/OFF state. There are no traveling wire pulses or
  spark animations; `logicalPower` is the circuit-state source of truth and an
  ON connection supplies the next input. Machine ports retain
  their protruding connection markers: red
  while open and green when connected. Electrical machine lead previews and
  painted leads use gold Elec with a forced two-cell width, independent of the
  selected paint-brush size. Their input ports accept compatible conductive
  wire rather than Tubing.
- Each visible machine-port protrusion identifies and functions as its own
  connector, ending at its declared port anchor. Compatible material touching
  that protrusion connects directly to that particular input or output; players
  do not need to draw an extra lead from it. Electrical ports use Elec
  connectors and accept Copper, Iron, Stainless Steel, or Elec. Material ports
  use their declared Copper or Tubing family. Port protrusions use a 15-unit
  local SVG length (about 15 CSS pixels at default zoom) and scale with the
  world zoom. The connector-drag preview has a separate 30-screen-pixel cap.
  Two-input logic gates space their signal-input protrusions vertically. The
  gate supply protrusion is blue while inactive and cyan while powered;
  hovering a gate names each connector's role, direction, and live state.
- Heat Ray and Cold Ray ramp their cells toward `2000 C`
  and `-120 C` over several frames rather than initializing an instant
  temperature source. Both burn out after a few frames instead of collecting as
  material. Hand-painted cells move as directional projectiles: Heat Ray starts
  upward and Cold Ray downward for each left-button stroke, then the first
  non-zero mouse/touch movement chooses the nearest cardinal direction; diagonal
  movement is resolved to its dominant horizontal or vertical axis. That heading
  persists during stationary painting and changes only with a new drag heading.
  Heater/Cooler emissions retain their marked, one-way machine target temperature
  behavior and are not affected by this brush direction rule.

### Metal phase-change reference

Metal state changes bank latent heat after crossing a threshold. Molten metals
flow until they cool to the configured freeze point and have support; some
materials return as a related metal rather than their original form.

| Solid | Melts into | Melting point | Supported return path |
| --- | --- | ---: | --- |
| Copper | Molten Copper | `1085 C` | Molten Copper becomes Copper at `1085 C`. |
| Elec | Molten Copper | `1085 C` | Cools as Copper, not Elec. |
| Battery | Molten Aluminum | `660 C` | Molten Aluminum becomes Battery at `660 C`. |
| Iron | Molten Iron | `1538 C` | Molten Iron becomes Iron at `1538 C`. |
| Tubing | Molten Iron | `1538 C` | Cools as Iron, not Tubing. |
| Fan and Cooler | Molten Iron | `1538 C` | Cool as Iron, not back into a machine. |
| Heater | Molten Iron | `10000 C` | Cools as Iron, not back into a machine. |

## 3. Powered, storage, transfer, and connection machines

### Placement, controls, and persistence

Machine port roles use stable per-port `connectionCell` anchors. The machine
face or paint footprint does not define tubing topology. Powered Fan, Heater,
and Cooler machines each have a Copper input; their environmental cone is the
output, in the opposite direction. Powder, Liquid, and Gas Storage Bins each
have family-compatible Tubing input and output ports. The Sprinkler has one
Tubing input and releases into the world. The Mixer has two Tubing inputs and
releases its output into the world, with no Tubing output. The Splitter has one
Tubing input and two Tubing outputs. The Collector has one world-facing funnel
intake and one Tubing output. Simple Switch has one electrical input and one
electrical output; Lamp has one electrical input and emits light as its output.

Machine placement uses two stages. During `poseSelecting`, the first pointer
gesture moves and faces a ghost without changing the world or saved state. On
pointer-up, `extensionPreview` freezes the pose and previews a size-3 connector
from the first input port in definition order; the output-only Collector
previews from its Tubing output. Electrical machines use Elec connectors at a
forced two-cell width. A second click preflights and commits the machine and
connector together. Invalid placement remains available to retry;
Escape or right-click cancels, and touch follows the same stages. Saves and
blueprints capture committed machines only.

Machine artwork uses a 64px reference face and scales and repositions with the
simulation cell zoom. Placed art, ghosts, port markers, 2px stubs, pointer
hit/snap, connector gestures, and placement previews use the same rotated
`connectionCell` projection with runtime cell dimensions. The pointer hit
distance remains 20 CSS pixels as zoom changes; hit proximity does not create
a physical route. Compatible Tubing may connect at the declared terminal or
its four cardinal contact cells. Electrical and Copper ports also accept
compatible contact through their declared eight-way contact cells. In
addition, each visible 15-unit protrusion is a functional connector: compatible
material touching the protrusion connects directly to its originating port.
An extra drawn lead is optional. Electrical ports accept Copper, Iron,
Stainless Steel, and Elec, and reject Tubing. Focused port coverage is
documented in the machine E2E README.

Clicking a placed machine opens its settings or inventory dialog. Machine state
persists in the active local save-library record and portable LZString saves.
Portable save format version `3` is written and versions `1`, `2`, and `3` are
accepted on load.
Version-1 Sprinkler mode is migrated to the current Drain Mode semantics.
Current snapshots and blueprints record `sprinklerModeVersion: 2` and
`machinePortLayoutVersion: 2`; missing legacy port-layout markers trigger a
one-time migration of stored endpoints to current declared anchors, using the
machine's live world type. The shared air temperature control ranges from
`-60 C` to `4000 C`.

The environmental controls also include **Base Humidity**, a `0-100%` slider
that starts at `50%`, and **Dewpoint**, a `0-100 C` slider that starts at
`10 C`. Base Humidity is the open-air field's slow return target; nearby Water,
Steam, Cloud, and plants add moisture, while Sand and Dry Mud absorb it. The
Dewpoint setting is the temperature threshold used by cloud precipitation and
Steam condensation. Both settings are saved with the world.

The **Wind Strength** control has two keyboard-accessible handles on one
`0-50` scale: **General Wind** and **Gust Strength**. Both start at `7`, and
General Wind is always less than or equal to Gust Strength. Dragging or moving
General Wind through the Gust handle advances both together; Gust Strength can
move independently but cannot fall below General Wind. The new scale is
calibrated so `50` corresponds to legacy strength `15` wherever an existing
physical formula uses that reference scale. General Wind and the temporary Gust
contribution have separate bounds, then their vectors add before the combined
magnitude is converted for legacy physical formulas. Combined airflow may
approach the sum of both settings before calibration. Fans use the same `1-50`
speed scale, and Fan speed `50` produces the output of the old Fan speed `15`.

### Powered machines

#### Fan

Fan is an eight-direction powered airflow machine with a widening 28-cell cone.

- Wind speed: `1-50`, default `7`, matching the default Breeze strength.
- Speed `50` maps to the legacy physical strength `15`; the Fan's airflow trail,
  carried air momentum, and particle push chance all use that converted value.
- Older saves and blueprints without a Fan scale marker migrate their stored
  speeds once. Legacy speeds are clamped to `0-15`, scaled to `0-50`, and
  rounded; legacy speed `7` becomes `23`, while legacy speeds above `15` clamp
  to `50`. Simulation saves and blueprint libraries record scale marker `50`
  so already converted values are not migrated again.
- Power load: `50`.
- The Fan's air temperature and humidity jet can reach 200 cells along its
  airflow path, with progressively weaker influence toward the edge. Particle
  pushes remain inside the 28-cell cone.
- Airflow is produced only while powered; decaying residual air remains after a
  powered effect.

#### Heater

Heater is an eight-direction powered machine that drives its 28-cell cone
toward a target temperature and launches Heat Rays along the centreline.

- Temperature: `0-4000 C`, default `2000 C`.
- Its aimed jet carries heated air and humidity up to 200 cells, with weaker
  influence toward the edge. Direct material heating remains inside the
  28-cell cone and respects the configured target.
- Power load: `100`.
- It is inactive without power.

#### Cooler

Cooler is the cold counterpart to Heater. It drives a 28-cell cone toward its
target and launches Cold Rays along the centreline.

- Temperature: `-60 to 20 C`, default `-60 C`.
- Its aimed jet carries cooled air and humidity up to 200 cells, with weaker
  influence toward the edge. Direct material cooling remains inside the
  28-cell cone and respects the configured target.
- Power load: `100`.
- It is inactive without power.

### Electrical machines

Simple Switch, Lamp, and Spotlamp start ON. Their setting is persisted with machine
state in world saves and blueprints, and each has an ON/OFF switch in its
settings dialog.

- **Simple Switch** accepts logical current through its electrical input. ON
  relays current to its electrical output; OFF immediately blocks it. The
  switch does not create current by itself.
- **Lamp** has one electrical input. ON emits a warm yellow glow only while
  that logical input is ON; OFF blocks its input and keeps the glow dark. Its
  Battery load is `1` per tick, less than one tenth of Heater's `100` load.
- **Spotlamp** has one electrical input and uses the same ON setting, live
  Battery-backed logical input, and `1`-unit powered-device load as Lamp. It
  projects a directional local-light cone in its selected eight-way facing;
  the range, falloff, and shared field/render angle are described under
  [Ambient and local illumination](#ambient-and-local-illumination).
- Both ports use Elec as the protruding connector material and force a
  two-cell-wide lead regardless of the paint-brush setting; the visible stub
  is 2px wide. Ports accept
  Copper, Iron, Elec, Stainless Steel, and other compatible conductive wire.
  They keep the existing red disconnected and green connected markers.

**Temperature Switch** and **Humidity Switch** are comparator machines. Each
has one electrical input and one electrical output, and uses Elec connectors
with a forced two-cell lead and a 2px visible stub. Neither switch generates
current: it passes logical input current to its output only while its
comparison is true. A false rule or an unavailable reading immediately blocks
the logical output.

Each switch samples the five air cells across its exposed top sensor face and
uses the arithmetic mean of the available air probes. Temperature Switch
compares degrees Celsius; Humidity Switch compares relative humidity as a
percentage. The settings dialog offers Less than, Less than or equal to, Equal
to, Greater than or equal to, and Greater than, plus a numeric threshold that
accepts fractional values.
The default rule is `>=`, with a threshold of `20 C` for Temperature Switch
and `50%` for Humidity Switch. If none of the five probe cells contains air,
the reading is unavailable and the output is blocked.

The settings dialog and hover tooltip show the current reading and unit,
comparison and threshold, whether input current is present, and the live
logical state. Green means the rule is true and current is passing to the
output. Red means it is not passing: the rule is false, the rule is true
without input current (`RULE TRUE · NO INPUT CURRENT`), or there is no air
reading (`SIGNAL BLOCKED · NO AIR`). Rule and threshold persist through
machine state transfers, portable world saves, and blueprints.

**Light Switch** uses the same five comparison choices, live status, and
input/output logic, but samples exactly one exposed cell centered on its sensor
face. Its reading is the cell's effective illumination on the `0`-to-`100`
scale (`max(ambient, local emitters)`), not a five-cell mean and not only light
from a Lamp. It defaults to `>= 50`; its threshold accepts fractional values
from `0` through `100`. A true comparison passes a live logical input to its
output; a false comparison or absent input leaves the output OFF. The settings
dialog shows current illumination, the rule and threshold, input state, and
whether the output is passing. Sampling reads the illumination field without
recursively refreshing electrical state. If its comparison changes a light
emitter's power, the new light level is observed at a subsequent logical
refresh, rather than during the same sensor read. The one-cell sensor face is
exposed for the light read while remaining sealed to particle movement.

### Logic gates and circuit supply

The top-level catalog has a **LOGIC** accordion immediately after Electricals;
it is a sibling panel rather than part of the Electricals grid. It contains
NOT, AND, OR, NAND, and XOR gates, drawn with familiar logic symbols in the
simulator's icon style. Their signal connectors use Elec, with signal inputs on
the left and output on the right. Two-input gates space the A and B signal
protrusions apart vertically. Every connector protrudes straight outward from
its gate face: exactly one horizontal input connector per signal input on the
left, one horizontal output connector on the right, and a separate supply
connector pointing down. The supply marker is blue while inactive and cyan
while powered. Hover feedback identifies each connector's role, direction, and
current state.
Every visible protrusion is itself a functional port contact: compatible Elec
touching it connects directly to that port, so an extra lead is optional.

Existing Copper, Iron, Stainless Steel, and Elec routes carry sustained
ON/OFF signal levels; there is no dedicated logical-wire material. Each gate
has one additional, separate Battery supply input as well as its listed signal
inputs and output. The gate produces no output unless a charged Battery reaches
its supply. This lets NOT and NAND output ON when their signal inputs are OFF
without creating power. The blue supply route terminates at the gate; it does
not directly energize or bridge into the output circuit. Only a valid gate
result energizes the separate output route. Signal inputs read their declared
routes and do not back-feed one another. A powered gate output can fan out over
its connected conductor network. The gate's own load and its output network's
wire and device consumption are charged to that separate supply, rather than to
either signal-source Battery. The blue supply route terminates at the gate and
does not bridge to the output route. Eight-neighbor circuit checks keep the
supply, signal A/B, and output-to-load routes separate, including their
Battery terminals. Focused AND-to-Lamp regression verifies the Lamp stays dark
with supply alone or one active input, lights only with supply and both active
inputs, and turns off when any of those source routes is lost.

| Gate | Signal inputs | Output is ON when |
| --- | ---: | --- |
| NOT | 1 | Input A is OFF |
| AND | 2 | Both A and B are ON |
| OR | 2 | A or B is ON |
| NAND | 2 | A and B are not both ON |
| XOR | 2 | Exactly one of A and B is ON |

All outputs are OFF without a charged Battery supply, regardless of signal
input states. Every gate draws `1` power-load unit on its separate supply route
while that supply is active. Gates are combinational and use synchronous
evaluation so circuit scan order does not change ordinary results. When a
feedback loop oscillates, gates whose outputs vary around the detected cycle
are forced OFF for that solve. Gate output state is derived from the current
supply and signals rather than saved independently; Save/Load preserves the
gate, conductor layout, and Battery charge, then recomputes the circuit.
Clearing the world removes the gates and their signal state. The routed
AND-to-Lamp behavior, path cutoffs, and supply-versus-signal Battery load
accounting are covered in the passing focused machine regressions.

Battery, Spark, Spark Dust, and Spark Block appear under the Electricals picker
heading. Battery remains conductive storage metal. Physical Spark particles
can charge a connected Battery, but do not independently power a wire. Battery
cells have static charge-tinted artwork and never emit animated sparks.

Powered conductive wire keeps a bright yellow base. No moving bolt overlay is
drawn on wires or Battery cells. A connected Battery entity is the group of
touching Battery cells that share charge; after a five-second sample, at most
one centered trend sign is shown for that whole group.

Electrical topology and load accounting are refreshed every 30 simulation
ticks while a circuit is stable. Relevant edits invalidate the cached network
and promptly recompute power, so cutting a gate input or supply turns its
output off without waiting for the next scheduled refresh. Battery charge and
charge/discharge rates continue to update each simulation tick; the 30-tick
cadence applies to topology and logical-state refresh only.

### Storage machines

All storage bins hold one material type up to `500` particles. They accept
material only through a family-compatible Tubing input; loose world particles
do not enter a bin. Purge clears a bin so it can accept another material.

- **Powder Storage Bin:** accepts powder-category materials and feeds compatible
  connected Tubing. It has a Powder-family Tubing input and output.
- **Liquid Storage Bin:** accepts liquid-category materials, including molten
  metals, through its Liquid-family Tubing input and output.
- **Gas Storage Bin:** accepts non-flaming gases through its Gas-family Tubing
  input and output.

### Sprinkler

The Sprinkler keeps one material type, up to `100` particles, delivered through
its Tubing input. Its payload is generic: the release mode preserves the exact
material ID and category received by Tubing.

- Release remains independently switchable and defaults on. Drain Mode defaults
  **ON**, preserving the normal single outlet directly downward. Release rate
  is `1-100` particles/second, default `10` particles/second.
- Drain Mode **OFF** sprays simultaneously at clock positions 9, 8, 7, 6, 5,
  4, and 3. Each direction receives an unrounded `releaseRate / 7` share, so
  all seven streams together preserve the configured total. This normalizes
  the specification's `/6` nominal share across all seven requested directions.
- Sprinkler spray renders as raindrops but carries the stored material
  unchanged. Tubing limits the effective feed/release rate. When Release is
  disabled or its buffer is full, it retains material and throttles its Tubing
  route according to the established storage rules.

### Connection material: Tubing

Tubing is a dense, electrically non-conductive, static material that carries
stored contents between compatible machines. It has zero
ordinary thermal conductivity, but its `thermalNetworkRate: 0.12` lets it
exchange heat with other fast-network conductors and enclosed air. Its
edge-sharing connection and capacity rules are in
[Section 6](#6-tubing-and-machine-port-connections-bottlenecks-and-regression-maintenance).

## 4. Mixer recipes and lifecycle rules

Mixer has two independent `500`-particle inputs and a `1000`-particle output.
Input A and input B each feed at `5` particles/second, for a `10` particles/s
combined maximum. Output releases at `8` particles/second while Release is
enabled. With Release disabled, output remains buffered up to `1000` particles.
Input A and input B can be purged independently.

### Recipes

The mixer checks its two input materials in either order. When a recipe exists,
one particle from each input becomes one particle of the result:

| Inputs | Output |
| --- | --- |
| Sand + Water | Wet Sand |
| Dry Mud + Water | Wet Mud |
| Ash + Water | Wet Ash |

These recipes mirror the material definitions' existing `wetsInto` physics.

### Mixing and output

- When both source bins contain a valid recipe, one particle is consumed from
  each immediately and one result particle is added to output bin 3. Production
  continues until either source bin cannot provide another particle.
- Source bin types reset independently when their counts reach zero. Output bin
  3 resets its output type only when its output count reaches zero.
- A documented mixed result becomes one full-width result stream immediately.
  It never appears beside its source materials in the output list or
  visualization.
- A mixed result owns output until it is drained. Unmatched source material
  remains in its input bin rather than appearing as a second output column. Once
  the mixed stream is drained, remaining source material can become a normal
  single output stream.
- The mixer never overwrites an existing non-mixed output stream while creating
  a recipe result. A lone non-mixing output remains a single half-width stream
  until the complementary material arrives; only then can the pair become the
  documented mixed result.
- Any pair not listed in the recipe table remains separate and is released
  alternately. For example, Sand + Ash produces alternating Sand and Ash output,
  not a new material.
- The dialog reports the actual output below bin 3. Mixed output is shown as
  `output: Wet Mud`; non-mixing output is shown as `output: Sand + Ash`.

### Mixer connections and persistence

The Mixer has two separately declared Tubing input anchors, input A and input
B. Tubing must reach the relevant anchor; the broader icon footprint does not
accept connections. The Mixer has no Tubing output port: its result continues
to release into the world under the existing output rules. Mixer settings and
inventories persist through the supported local Resume Game and portable
LZString save paths.

The browser regression workflows cover Water-only input, Dry Mud-only input,
Water + Dry Mud -> Wet Mud, non-mixing Water + Oil, and a late Water + Ash ->
Wet Ash transition while Water is already being processed. Keep those workflows
aligned with the owning machine specs and the maintenance contract in
[`E2E_TEST_PLAN.md`](E2E_TEST_PLAN.md).

## 5. Collector intake and machine sealing geometry

Storage Bins do not collect loose particles from the world. Powder, Liquid, and
Gas bins receive only their compatible material through their Tubing input;
they retain their one-type, `500`-particle inventory, purge, and Tubing output
behavior.

The Collector is the machine for collecting particles from the world. Its
directional funnel accepts Powder, Liquid, or Gas. It holds one exact material
ID at a time, up to `100` particles; a different material remains in the world
until the Collector is empty. With no compatible output route, buffered
material remains in the Collector. Its single Tubing output sends material to
a compatible receiver at `min(30 particles/s, route capacity)`. A one-cell
Tubing route is therefore limited to `10/s`. Its buffer and direction are
machine state and are included in saves, blueprints, and grab/drop.

Collector front direction index `3` points down, placing its rear suction mouth
upward by default. Its rotatable two-cell intake accepts an exact material ID
only when the buffer is empty or already holds that ID and has room below its
`100`-particle capacity. Accepted particles at the funnel edge enter the
buffer until it is full. A different material or any particle arriving at a
full buffer remains upstream; it cannot pass behind the Collector housing and
spill out below. Intake resumes when an inventory slot opens. Storage Bins no
longer use the legacy funnel suction.

The Collector's physical boundary is aligned with the visible funnel. In the
default down-facing direction, the first opaque row at the top of the funnel is
`y = machine.y - 7`; that row blocks rejected particles and full-buffer
overflow. The collision is part of particle movement and diagonal collision
handling, independent of UI paint hit testing. The suction barrier and the
housing/side-rail seal remain separate from each other and are never suction
targets. Their rotated geometry stays aligned across all eight facings: the
cardinal barrier uses depth 7 and half-width 5 cells; diagonal geometry uses
5/3 paired-axis steps. Keep the upstream intake lane open and the Tubing output
anchor outside the seal.

Machine-face painting uses rendered alpha across all 64px reference overlays:
transparent pixels allow ordinary material painting, while non-transparent
artwork blocks it. This lets Glass or Wood guardrails be painted through
transparent Collector pixels without changing the physics collision rule;
opaque Collector artwork remains protected. The alpha-aware rule applies to
all machines and is independent of the Collector's physical seal.

Focused browser coverage verifies Collector intake, visible-edge blocking at
full capacity, transparent-pixel guardrails, and resumed intake when space
opens. The focused storage browser suite passes 7/7, including the zoom-2
full-buffer containment case. See the
[archived implementation plan](archive/plans/2026-09-25-machine-ports-sprinkler-collector-splitter.md)
for the complete QA record.

## 6. Tubing and machine-port connections, bottlenecks, and regression maintenance

Tubing is non-conductive and static. It connects only through shared cell edges;
diagonal corner contact is not a connection. Machine connections use declared
port roles and stable `connectionCell` anchors, not a broad machine icon
footprint. Compatible Tubing connects through a port's declared terminal and
cardinal contact cells; electrical and Copper connections accept their
declared eight-way contact cells. A compatible material that touches the
visible protrusion also connects directly to that specific port, so an
additional drawn lead is optional. Storage inputs enforce Powder, Liquid, or
Gas family compatibility;
the Sprinkler and Mixer accept the materials allowed by their existing
inventory rules. Copper is the connector for Fan, Heater, and Cooler inputs.
Electrical ports use Elec connectors and accept conductive wire materials;
they are separate from Tubing routes.

### Declared material ports

| Machine | Material ports | Other input/output |
| --- | --- | --- |
| Fan, Heater, Cooler | One Copper input | Directional world-effect cone output, opposite the input |
| Simple Switch | One electrical input and one electrical output; accepts compatible conductive wire | Relays logical current when ON; blocks it immediately when OFF |
| Lamp | One electrical input; accepts compatible conductive wire | Yellow light while ON and its logical input is ON |
| Spotlamp | One electrical input; accepts compatible conductive wire | Directional local light while ON and its logical input is ON |
| Temperature Switch, Humidity Switch | One electrical input and one electrical output; accepts compatible conductive wire | Relays input current only while its environmental comparison is true; false or unavailable readings block the logical output |
| Light Switch | One electrical input and one electrical output; accepts compatible conductive wire | Relays input current when the single exposed cell's effective illumination meets its comparator |
| NOT gate | One signal input, one separate Battery supply input, and one electrical output | Output is ON only with supply present and signal input OFF |
| AND, OR, NAND, XOR gates | Two signal inputs, one separate Battery supply input, and one electrical output each | Evaluate their Boolean rules only while the separate supply is present; see [Logic gates and circuit supply](#logic-gates-and-circuit-supply) |
| Powder Storage Bin | Powder Tubing input and output | No world-particle intake |
| Liquid Storage Bin | Liquid Tubing input and output | No world-particle intake |
| Gas Storage Bin | Gas Tubing input and output | No world-particle intake |
| Sprinkler | One Tubing input | World release/spray output |
| Mixer | Two Tubing inputs; no Tubing output | World release output |
| Splitter | One Tubing input and two Tubing outputs | Splits flow evenly across available outlets |
| Collector | One Tubing output | Rotatable world-facing funnel intake |

### Connecting a run and flow limits

Tubing routes connect a source machine's output anchor to a compatible
destination machine's input anchor. The source must have buffered material, and
the destination must have room and accept that material. Connected flow appears
in the route; it stops when the route is incomplete, material is incompatible,
the source is empty, or the receiving buffer is full.

The transfer rate is controlled by the narrowest painted cross-section anywhere
along the route:

| Narrowest width | Capacity |
| ---: | ---: |
| 3 cells | 30 particles/second |
| 2 cells | 20 particles/second |
| 1 cell | 10 particles/second |

Storage output is limited by its route. Mixer inputs are separately capped at
`5` particles/s each. Sprinkler feed/release remains limited by its configured
rate and available Tubing. Collector output is limited to `30/s` and the route
capacity. Splitter divides its incoming rate equally between its two outputs:
an input of `10/s` produces `5/s` on each available branch. It preserves the
combined flow and buffers an unavailable branch's share rather than losing or
redirecting it.

### Port visuals and persistence status

Machine artwork uses a `64px` reference overlay that scales and repositions
with the cell zoom. Each material port has its declared marker, connector
material, role, and stable anchor. The visible protrusion projects from the
rotated world `connectionCell` and is functional along its exposed length:
compatible Tubing, Copper, or electrical wire touching it connects directly to
that specific originating port. An additional drawn extension lead is
optional. Hit targets remain 20 CSS pixels; hit proximity alone does not
create a route. Port protrusions use 15 local SVG units (about 15 CSS pixels at
default zoom) and scale with the world zoom. Connector-drag previews have a
separate 30-screen-pixel maximum. The Mixer has two distinct inputs and no Tubing
output; the Splitter has one input and two outputs. A missing
`machinePortLayoutVersion` identifies legacy connection geometry in saves and
blueprints; current snapshots use the explicit port layout marker. Legacy
compatible endpoints migrate to the current declared `connectionCell` anchors.
Sprinkler's former Vent identity is retained only for load migration; its
particle ID remains `52`. Focused port coverage and connector construction are
documented in the machine E2E README.

For user-visible changes, use the focused owning-machine specs through the
documented npm wrapper. See [`E2E_TEST_PLAN.md`](E2E_TEST_PLAN.md) and
[`e2e/machines/README.md`](../e2e/machines/README.md) for test ownership and
commands. Final implementation and verification outcomes are recorded in the
[archived machine plan](archive/plans/2026-09-25-machine-ports-sprinkler-collector-splitter.md).

## 7. Seeds, plants, humidity, dewpoint, weather, and corrosion

### Seed and plant lifecycle

The picker has a dedicated **Seeds** group with Grass Seeds, Moss Spores,
Daffodil Seeds, Red Tulip Seeds, Geranium Seeds, Blue Flower Seeds, Banana
Seeds, and Water Grass / Lily Seeds. They remain movable powder particles while
dormant. A seed germinates only when its per-species minimum temperature,
humidity, and effective illumination are met and its configured substrate has
enough moisture. Tooltips summarize each species, while `particles.json`
contains the exact numeric thresholds and viable substrate rules. Dry ground
or unsuitable air or light leaves the seed dormant. ID `19`, previously the
generic Seed, is retained as Grass Seeds so existing worlds and saves preserve
that particle as the grass species.

The species cover different habitats. Grass germinates on Wet Mud, Wet Sand, or
Wet Ash; Wet Mud is richer, giving grass faster/taller growth and a higher health
cap than poorer soil. Moss Spores colonize damp Wood, Stone, Wet Sand, Wet Mud,
or Wet Ash, and Moss spreads sideways. Daffodil, Red Tulip, Geranium, and Blue
Flower use their own climate ranges and grow into matching blooms. Banana Seeds
need a warm humid environment and wet substrate; the Banana Plant grows an
upright trunk with broad leaves and a fruit bunch. Water Grass / Lily Seeds need
wet ground and nearby open water; under enough water they grow a mesh stem to
the surface, spread Water Grass Pads, and can bloom there.

Seed temperature and humidity fields are minimum germination gates; seeds do
not define a separate maximum germination temperature. All eight seed types
ignite above `130 C` and become Fire with a `20`-frame burn life. A mature
Banana Plant grows `14-32` cells tall.

The seed catalog's Germination tooltip pairs the species' established-plant
temperature and humidity ranges with their ideal values, then shows the seed's
actual minimum temperature and humidity gates separately. Light is shown as a
minimum and ideal percentage; the minimum is also required for germination.
Suitable substrate materials are listed in the same section.

### Seed requirements

Temperature is checked on the seed cell; humidity is checked in nearby air.
The values below are minimums, not maximum germination temperatures.
Substrate moisture is an independent requirement, and germination is
probabilistic even when all conditions are met.

| Seed | Minimum temperature | Minimum local humidity | Substrate and additional conditions |
| --- | ---: | ---: | --- |
| Grass Seeds | `5 C` | `25%` | Wet Mud, Wet Sand, or Wet Ash; Wet Mud gives Grass a richer-soil growth bonus. |
| Moss Spores | `0 C` | `78%` | Damp Wood, Stone, Wet Sand, Wet Mud, or Wet Ash near the spores. |
| Daffodil Seeds | `2 C` | `35%` | Wet Mud or Wet Sand. |
| Red Tulip Seeds | `4 C` | `38%` | Wet Mud or Wet Sand. |
| Geranium Seeds | `8 C` | `28%` | Wet Mud or Wet Sand. |
| Blue Flower Seeds | `3 C` | `30%` | Wet Sand or Wet Ash. |
| Banana Seeds | `18 C` | `75%` | Wet Mud or Water. |
| Water Grass / Lily Seeds | `8 C` | `65%` | Wet Mud and nearby open water; at a depth of three or more water cells it grows in submerged form. |

Growing cells track health against their species' minimum/maximum and ideal
temperature and humidity, effective light, and required root-zone moisture.
Plants inside their thriving bounds grow; those inside a wider survival band
pause growth while health recovers or declines; plants outside that band
wither into Dry Mud when health reaches zero. Plant color reflects its health.
Only thriving, sufficiently healthy plants reproduce; a cooldown and
nearby-seed limit prevent a mature patch from producing seeds every frame.
Existing burn, freeze, and acid reactions still apply.

The thriving ranges below apply after germination. Plants may survive in a
wider climate band but grow more slowly or stop; prolonged unsuitable
temperature, humidity, light, or root moisture can reduce health until the plant
withers into Dry Mud.

| Established plant | Thriving temperature | Ideal temperature | Thriving humidity | Ideal humidity | Growing note |
| --- | ---: | ---: | ---: | ---: | --- |
| Grass | `5-34 C` | `22 C` | `25-95%` | `65%` | Wet Mud is richer and improves growth and health. |
| Moss | `0-30 C` | `16 C` | `68-100%` | `92%` | Damp Wood, Stone, Wet Sand, Wet Mud, or Wet Ash supports it. |
| Daffodil | `2-30 C` | `14 C` | `35-92%` | `68%` | Grows on damp soil and flowers at maturity. |
| Red Tulip | `4-28 C` | `15 C` | `38-92%` | `72%` | Grows on damp soil and flowers at maturity. |
| Geranium | `10-38 C` | `23 C` | `28-88%` | `58%` | Grows on damp soil and branches into flower clusters. |
| Blue Flower | `3-29 C` | `16 C` | `30-96%` | `72%` | Grows on Wet Sand or Wet Ash. |
| Banana Plant | `18-42 C` | `30 C` | `76-100%` | `95%` | Needs wet roots; nearby Water can satisfy the root moisture check. Mature height is `14-32` cells. |
| Water Grass | `8-36 C` | `24 C` | `65-100%` | `90%` | Needs nearby open water and forms submerged stems, surface pads, and blooms. |

### Plant light needs and inspection

Plants use effective illumination, the higher of their ambient-grid value and
the summed local-emitter value. Each species has a minimum for germination and
thriving, and an ideal value at which light fitness reaches its maximum:

| Species | Minimum light | Ideal light |
| --- | ---: | ---: |
| Moss | `5` | `25` |
| Grass | `15` | `70` |
| Daffodil | `15` | `65` |
| Red Tulip | `20` | `70` |
| Geranium | `25` | `75` |
| Blue Flower | `10` | `55` |
| Banana Plant | `30` | `85` |
| Water Grass | `10` | `60` |

Light fitness rises linearly from each species' minimum to its ideal and stays
at `1` above ideal. Established plants thrive at or above minimum illumination;
they can survive down to `40%` of that minimum if other survival conditions
and the substrate are suitable. Below this light floor, they are in the dying
state. Light fitness contributes to vigor and scales the usual growth chance by
`0.25 + 0.75 * fitness`, so growth can still occur at minimum light.

Hovering any plant part or seed reports its current temperature, humidity, and
effective illumination alongside the species' ideal temperature and humidity,
temperature and humidity bounds, and minimum/ideal illumination. Seeds use the
profile of the plant they can grow into, so players can compare the seed's
current conditions with that species' needs before it sprouts.

### Humidity and condensation

Relative humidity is a local `0-100%` field attached to air locations, not a
visible particle. It diffuses between neighboring air cells and is updated in
staggered portions of the world each frame. Exposed open air slowly returns
toward the Base Humidity slider. Water above freezing, Steam, Cloud, and growing
plants raise nearby humidity; exposed Sand and Dry Mud lower it. Plants
therefore both depend on moisture and contribute humidity as they grow.

Base Humidity is a slow outside-air target, not a value imposed on every cell.
Sheltered air keeps local conditions longer. For germination, aim for the
species' local humidity minimum and provide wet substrate separately; high air
humidity does not turn dry Sand into Wet Sand. Water above freezing, Steam,
Clouds, and growing plants add local moisture, while Sand and Dry Mud remove
some. Clusters of plants create a stronger humid pocket than one isolated
plant. Cloud evaporation above `100 C` can return up to `12` humidity points,
with a smaller rise when local humidity is already near its `100%` cap.

Plant humidity contributions are relative source strengths applied gradually
to adjacent air, not immediate percentage-point jumps:

| Growing species | Humidity contribution strength |
| --- | ---: |
| Grass | `0.25` |
| Moss | `0.8` |
| Daffodil | `0.2` |
| Red Tulip | `0.2` |
| Geranium | `0.24` |
| Blue Flower | `0.22` |
| Banana Plant | `0.55` |
| Water Grass | `0.75` |

To establish a humid planting area, set Base Humidity near the seed's minimum,
provide the required damp ground or open water, and plant moisture-producing
species nearby. If it stays too dry, inspect the Humidity view for exposed Sand
or Dry Mud, add a moisture source, or raise Base Humidity; keep the substrate
wet even when the air is humid.

The Dewpoint slider sets a configurable `0-100 C` threshold, defaulting to
`10 C`. When exposed upper air is at or below the dewpoint and local humidity
reaches `88%`, sparse Cloud gas particles can nucleate without an existing
cloud. Enclosed chambers retain and diffuse humidity but do not spontaneously
spawn weather. Cloud gas rises/drifts and, at or below the dewpoint in air at
`88%` or higher humidity, can condense into individual precipitation particles:
Water when the precipitation temperature is above `0 C`, Snow at or below
`0 C`. Each eligible Cloud has a `1.2%` chance on a reaction check to
precipitate, consuming `18` local humidity points. Clouds placed from the
material picker also rise and drift and can precipitate under the same
conditions. A Cloud above `100 C` evaporates and restores up to `12` percentage
points to humidity at its location, matching the amount consumed when the cloud
formed. Local humidity is capped at `100%`, so the actual increase can be
smaller when the air is already humid.

Steam remains produced by boiling Water and Wet Mud, evaporates above `3000 C`,
and has no lifetime timer. It adds moisture to nearby air and condenses to Water
or Snow when the air reaches the configured Dewpoint and local humidity is at
least `82%`. Boiling, Steam condensation, cloud formation, and rain/snow all
participate in the same humidity and temperature cycle; changing the dewpoint
affects both Steam and Cloud.

For more frequent cloud formation and rain, raise Base Humidity toward
`95-100%` and set Dewpoint a little above the temperature of exposed upper air.
Natural Cloud formation is sparse, so place several Clouds to build coverage
sooner. For clouds without rain, keep surrounding air warmer than Dewpoint or
local humidity below `88%`. Enclosed chambers do not form natural weather.

### Corrosion and persistence

Eligible non-machine solid metal definitions build rust exposure. Stainless
Steel does not rust from Water or humid air. All machines, including storage
bins, are excluded from Water-contact and saturated-air rust even when their
bodies are metal. Exposure advances when Water touches one of the eligible
metal cell's cardinal sides, or when the cell has adjacent air and local
humidity is at least `98%`; diagonal Water does not count. Each eligible metal
cell is checked once every four simulation frames. A qualifying check adds `1`
to its persisted exposure counter; a check without either condition removes
`2`. Copper's default resistance reaches the exposure threshold at `360`, when
the original cell becomes Corrosion powder. Elec has `corrosionResistance: 4`,
so it needs `1440` qualifying exposure counts (four times Copper's exposure).
The powder can fall away and leave a gap in a wire or metal structure. Molten
forms do not accumulate this exposure. Corrosion powder melts into Lava at
`1000 C`.

To protect a metal build, keep Water from touching it and avoid adjacent air
remaining at or above `98%` humidity. Use the Humidity view to inspect local
air. Base Humidity is a slow outside-air target and does not replace the local
reading.

Local humidity, plant health, corrosion exposure, and plant reproduction
cooldown are stored in per-cell arrays. Base Humidity and Dewpoint are saved as
world settings. Local Resume Game and portable Save/Load preserve these fields;
older version-1 saves without the added arrays or settings initialize them from
the current defaults (`50%` Base Humidity and `10 C` Dewpoint), and their ID 19
particles load as Grass Seeds.

## 8. Environment controls and visualization views

The sidebar places **Visualizations** immediately above **Environment**. The
Visualizations row has **Normal** and **Options**. Environment controls are
**Breeze**, the dual-handle Wind Strength control, Air Temperature, Humidity,
and Dew Point. Open-air temperature follows a smooth fixed profile centered on
the Air Temperature setting: the top is `7.5 C` cooler and the surface is
`7.5 C` warmer, a `15 C` top-to-surface difference. The natural gradient is
always active as part of the whole open-air atmosphere. Enclosed air keeps its
local temperature. Breeze is the master switch for General Wind and Gusts.
Turning Breeze off stops new generated airflow and gusts and clears their
active fields; already drawn wind trails and other airflow momentum can decay
naturally. Turning it on restores generation according to the two selected
strengths. The Wind visualization is a separate display mode and does not
enable or configure Breeze.

General Wind is a persistent background field with smooth spatial variation;
the selected value is a local maximum, not a uniform speed. The field has calmer
and stronger regions, updates every eight simulation steps, and uses coherent
variation instead of per-cell frame randomness. Walls and other wind-blocking
solids shelter cells downwind; loose material can slow or deflect the flow. A
strength of zero generates no General Wind.

The prevailing horizontal direction is chosen when the wind system starts and
held for `108,000` simulation steps, or about 30 minutes at the simulation's
60 steps per second. At the end of a cycle it chooses left or right again; the
new direction can match the old one. This clock uses simulation steps rather
than rendering frames. Direction and remaining cycle steps are saved; gust
activity itself is transient and is restarted cleanly after loading.

Gusts are temporary travelling bands that use the prevailing direction, even
when General Wind is zero. A gust contributes force on top of General Wind;
its contribution is independently bounded by Gust Strength, so the combined
field may approach the sum of the selected values before calibration. Gusts
arrive after a short randomized wait and leave another randomized gap, cross the
world in roughly 2–4 seconds (about 3 seconds at a 200-cell width), and stop
contributing after they exit. Their curved fronts and coherent vertical swirl
create local turbulence. Solids and existing shelter rules affect both wind
fields.

Options opens a modal with Heat, Humidity, and Wind plus three disabled
placeholders. Only one visualization mode can be active. Selecting another
mode replaces the previous one; Normal clears the mode immediately and
returns to ordinary material rendering without opening the modal. Closing the
modal leaves the selected view active. The current mode is saved. Older saves
that have `tools.heatViewOn` but no `tools.visualizationMode` restore Heat;
when both fields exist, the current mode is authoritative.

- **Heat** keeps the existing temperature coloring across the world.
- **Humidity** colors each cell from its local humidity value, including
  enclosed pockets. Dry values are warm orange, middle values are muted neutral,
  and high values are cyan-blue. It reads the existing humidity field and
  changes pixels only; it does not change the humidity simulation.
- **Wind** colors air and gas cells by relative speed from blue (slow) through
  red (fast), then draws sparse directional arrows. It combines the Fan's
  advected `airflowX/Y` field, General Wind, the travelling Gust field, and
  transient `displayWindX/Y` samples from the wind tool and gust trails. The
  generated General Wind and Gust fields also affect particle motion; display
  samples only provide visualization and fade away. Transient trails are
  excluded from saves and blueprints.

The Wind overlay samples airflow for sparse direction arrows and includes the
generated background and gust fields so their speed, direction, moving front,
and swirl are visible. Rendering is limited to visible canvas bounds. All three
views are display-only: selecting a visualization does not change the world
arrays or physical rules.

Portable Save/Load and local Resume Game save both wind strengths under the
environment settings. Older saves that contain only `tools.windStrength` map
that legacy value to the new scale and restore both handles to the same value;
legacy strength `15` therefore restores General Wind and Gust Strength at `50`.

## 9. Canvas feedback and live inspection

FPS and particle count stay in the top readout. The fixed feedback panel sits
below the canvas, outside its scrolling viewport. It has a fixed height and
does not resize or scroll when the hovered content changes; the canvas gives
up `10px` of its allocated height for the panel. No cell numbers are shown.
Feedback follows the current pointer and simulation state; leaving the canvas
clears the pointer-specific lines.

Hovering over empty air reports local air temperature, humidity, and wind speed.
The speed combines local advected airflow, wind-tool display samples, General
Wind, and gust airflow. Hovering a particle reports its name, catalog group and
subcategory where present, physical category, temperature, humidity, and
source-defined state transitions such as `> 100 C Water -> Steam`. Hover
readings include numeric local illumination; heat glow remains a separate
rendering effect and is not illumination.

### Ambient and local illumination

The Environment panel's Ambient Light slider ranges from `0` to `100`, starts
at `50`, and is saved as world environment state. Older saves without the
setting also restore `50`. The derived `world.ambientIllumination` grid uses
the same cell indexing as `world.type` and is not serialized. At slider values
of `10` or below, every cell receives that value uniformly. Above `10`, a cell
with an unobstructed straight grid ray to any top-row cell receives the full
slider value. Top visibility takes priority. A cell with no top visibility but
an unobstructed ray to any bottom-row cell receives half the slider value. If
neither boundary is visible, it receives fixed reflected ambient light of `10`.

When there is more than one clear boundary ray, the selected ray is the one
closest to vertical; equal offsets choose the smaller boundary-cell x. If the
selected ray crosses one or more gas cells, its ambient value is reduced once
by `25%`. The derived effective illumination used by plants and numeric
readouts is `max(ambient value, summed local emitter contributions capped at
100)`. It is not the sum of ambient and local light.

`world.illumination` stores the derived `0`-to-`100` local-emitter field per
world-grid cell. It is rebuilt from emitters and blockers rather than
serialized into world saves or blueprints. The `getIlluminationAt(x, y)` query
returns effective illumination, taking the higher of this field and the
ambient grid.

Ambient visibility is intentionally approximated in uniform chunks of
`AMBIENT_ILLUMINATION_CHUNK_SIZE` simulation cells per side. Each chunk samples
its in-bounds center cell, then all cells in that chunk receive the sampled
ambient value. The exported constant in `physics.js` is the one tuning point;
changing `30` to `20` changes the grid to 20×20 simulation-cell chunks,
independent of rendered pixel size and zoom. Partial edge chunks sample the
center of their actual in-world bounds. This trades exact shadow edges for far
fewer visibility rays; local emitter light and its field remain per-cell.

An ON Lamp emits only while its electrical input reaches a charged Battery.
Its omnidirectional 360-degree field is measured in world cells by Euclidean
distance and is independent of canvas zoom. At distance `d`, Lamp contribution
is `min(100, max(0, 100 * (26 - d) / 25))`: the source cell is `100`, distance
`25` receives `100/25`, and distance `26` is dark. Persistent Fire and Lava
emit at peak intensity `50`; Scoria emits at `30`. Each uses linear falloff
`max(0, intensity * (6 - d) / 6)`, reaching zero at distance six. Fire created
when Oil or Wood burns uses the same peak intensity of `50` while it persists.
Lamp light is yellow; Fire, Lava, and Scoria light is orange. Tint is rendering
metadata only: it does not alter `world.illumination` or any logical reading.

An ON Spotlamp emits only while its electrical input reaches a charged
Battery. Its eight-way facing is independent of zoom. The cone field and its
powered/placement outline use the shared half-angle
`SPOTLAMP_CONE_ANGLE_DEGREES` (`26.565...°`) so the displayed and simulated
boundaries agree. Its Euclidean reach is `45` world cells; at distance `d` up
to that edge, its intensity is `100 × (1 - 0.6 × d / 45)`, reaching `40` at
the edge and zero contribution past it. Spotlamp light is yellow, adds to
other local emitters up to the `100` cap, and obeys the same
line-of-sight blockers and transmitting materials as Lamp light. Changing its
facing, ON setting, logical input, or world cells invalidates the derived
local-light field. Direct cell edits and Grabber moves rebuild the affected
field so the old source location goes dark and the new location lights without
waiting for a later simulation tick.

Gunpowder creates a `100`-intensity, ten-cell explosion flash at `explode()`
before blast cells are cleared. The flash fades over four simulation ticks; the
resulting Fire remains as a dim emitter after the flash expires. Sparks and
fuses do not emit light. Contributions add and clamp at `100`.

Solids, powders, plants, and machine bodies block local light along a
cell-center grid ray. Air, gases, Elec, and Tubing transmit it. Ambient
visibility uses the same blockers and grid rays. Light does not affect
temperature or phase-change reactions; effective illumination does affect seed
germination, plant thriving, vigor, health, and growth as described in
[Section 7](#7-seeds-plants-humidity-dewpoint-weather-and-corrosion).

The renderer samples only `world.illumination` into a separate
one-pixel-per-cell canvas overlay above particles and below machine overlays.
Ambient light is logical plant/readout data and does not tint or fill the
canvas. Yellow and orange
tints are at most 50% opaque at illumination 100, fade in proportion to
intensity, and are fully transparent at zero. When emitter colors overlap, the
strongest local contribution chooses the tint; total illumination still adds
and clamps independently. The overlay scales with the world canvas; it appears
only in Normal view, while alternate visualization palettes remain unchanged.
Clipping at the world/canvas edge does not alter field values. A Lamp icon's
glow is decorative and separate from the simulated field.

### Runtime debug feature menu

Press **Numpad −** to open or close the debug menu. The panel starts closed;
its **Close** button and `Escape` also close it. The shortcut ignores key
repeat and does not intercept typing in text-entry controls. Its four switches
start enabled and are runtime-only; reloading the page restores the defaults.
Changing them does not reset the world.

The **Machine air-blow distance** input starts at 200 cells. Enter a whole
number and select **Set** to change the maximum air-only reach for powered Fans,
Heaters, and Coolers. The value is limited to the current world's useful
diagonal reach. This control resets to 200 on page reload; direct material
effects and Fan particle pushes remain within 28 cells.

- **Source light off** skips local emitter and explosion-flash field builds,
  clears cached local intensity and tint, and hides the local-light overlay.
  Ambient illumination still applies.
- **World illumination off** makes `getIlluminationAt` use the Ambient Light
  slider value uniformly for the ambient contribution. The ambient field array
  is left unused and is not rewritten when the slider changes; sky visibility,
  reflection, and gas-ray calculations are skipped. Local source light can
  still contribute.
- **Humidity off** sets the humidity field to the Environment slider value
  when disabled, when the slider changes, and when re-enabled. Humidity queries
  and visualization use `getHumidityAt`, so readings stay uniform; per-cell
  diffusion, local humidity exchange, and cloud nucleation are skipped.
- **Electricity off** clears the power, logical-power, gate-output, legacy
  pulse-delay, and charge planes once, then skips electrical refresh,
  network/load traversal, charge transfer, Battery Spark charging, logical
  signals, and electrical rendering. Batteries retain their material identity
  and thermal behavior but stay empty and provide no electrical or storage
  behavior. Re-enabling electricity rebuilds the network with Batteries still
  empty. Power-consuming actuators use their always-powered fallback; gates,
  switches, and signal sensors remain electrically inactive.

The electricity override also removes powered-wire tint and Battery trend
signs. The former **No wire sparks** preference has been removed because the
electrical renderer no longer animates current.

Hovering empty air or a particle reports numeric local illumination alongside
the ordinary temperature, humidity, and transition details. Machine hover also
reports received illumination; Lamp hover identifies whether emission is ON
or OFF, its 360-degree/25-cell reach, and the received value. Spotlamp hover
reports its current active state, input state, and received value; its powered
cone is drawn over the world, and the placement preview uses the same angle.

Hovering a machine shows its name, temperature, active/inactive status, and the
live state of its declared inputs and outputs. Gate ports are individually
labeled by role and direction, including the separate blue Battery supply,
signal inputs A/B, and signal output. Logical input and output readings use the
steady ON/OFF circuit state.

The Battery icon and charge percentage appear at the bottom of the feedback
panel only while hovering a Battery. The fill indicator shows charge level in
red at `25%` or below, orange below `75%`, and green at `75%` or above. The same
readout reports connected circuit load in Battery charge units per simulation
tick. Load includes every conductive cell in the connected grid, plus a
switched-ON Lamp on its input circuit and each logic gate whose supply is
powered; each device load is counted once even when the circuit branches. Wire
cells each add their material's configured per-cell load. These are the same
loads used by Battery discharge.
For a gate, its output-network wire and device loads are billed back to the
gate's separate supply, not to either signal-source Battery. The routed AND
regression verifies this distinction by comparing the supply and signal
Battery grids.

The Battery's static charge glow remains visible without moving wire bolts.
After a five-second charge-trend sample, one centered green `+` indicates
charging or one centered red `−` indicates discharging for the entire connected
Battery entity; idle charge flow shows no sign. This direction indicator
follows the same sampled trend as the text status and ETA.

Charging direction and time estimate use the connected Battery reservoir's
charge trend across five elapsed seconds. The panel initially says it is
sampling the trend, then reports `DISCHARGING` in red with an estimated time to
empty, `CHARGING` in green with an estimated time to full, or `No net charge
flow`. It calculates the trend rate and estimate from actual elapsed seconds,
not an assumed tick rate, and re-baselines each five-second sample. Short Spark
Block bursts therefore do not immediately reverse the displayed trend. The
estimate is omitted until a full trend sample is available or when there is no
net charge flow.
