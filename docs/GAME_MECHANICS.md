# Game mechanics

This is the current reference for material definitions, machine behavior,
machine ports, Collector intake, Mixer recipes, Tubing, Sprinkler release, and
their maintenance contracts.
The broad simulation model remains in [`PROGRAM_OVERVIEW.md`](PROGRAM_OVERVIEW.md).
Use [`E2E_TEST_PLAN.md`](E2E_TEST_PLAN.md) for test ownership and browser-test
commands; active follow-ups and proposed changes remain in [`ISSUES.md`](ISSUES.md)
and [`FUTURE_IDEAS.md`](FUTURE_IDEAS.md).

## 1. Material catalogue and glossary maintenance

The material picker is also the simulator's glossary. Its category headings
are keyboard-accessible buttons that expand and collapse each material grid;
they start expanded and show a right-side arrow for the current state.
Hovering or focusing any material button shows a fixed, readable tooltip with
the material name, short description, important physical and electrical
properties, and implemented
reactions. The tooltip is assembled from the prepared definition used by the
physics engine, so temperatures and target materials come from the rules that
actually run.

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

The 84 entries are grouped in the same order as the picker:

| Group | Materials |
| --- | --- |
| Powders | Sand, Wet Mud, Ash, Wet Sand, Dry Mud, Gunpowder, Snow, Scoria, Wet Ash, Spark Dust, Corrosion |
| Liquids | Water, Oil, Lava, Acid |
| Gases | Fire, Steam, Smoke, Toxic Gas, Cloud |
| Solids | Ice, Stone, Wood, Glass, Wall, Clay, Ceramic, Spark Block, Insulation |
| Seeds | Grass Seeds, Moss Spores, Daffodil Seeds, Red Tulip Seeds, Geranium Seeds, Blue Flower Seeds, Banana Seeds, Water Grass / Lily Seeds |
| Vegetation | Plant, Grass, Flower, Lily Stem, Lily Pad, Lily Flower, Ash Grass, Moss, Daffodil, Red Tulip, Geranium, Blue Flower, Banana Plant, Water Grass, Daffodil Bloom, Tulip Bloom, Geranium Bloom, Blue Flower Bloom, Banana Bunch, Water Grass Bloom, Water Grass Pad, Banana Leaf |
| Metals | Spark, Copper, Molten Copper, Battery, Molten Aluminum, Iron, Molten Iron, Stainless Steel, Tubing |
| Electricals | Elec, Simple Switch, Lamp |
| Machines | Fan, Heater, Cooler, Sprinkler, Mixer, Splitter, Collector |
| Storage | Powder Storage Bin, Liquid Storage Bin, Gas Storage Bin |
| Tools | Heat Ray, Cold Ray, Wind |

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
| Solids | Ice, Stone, Wood, Glass, Wall, Clay, Ceramic, Spark Block, and Insulation provide the fixed, structural, or phase-change behavior declared by their definitions. |
| Seeds | Eight viable powder seed types wait for suitable local temperature, humidity, and substrate moisture before germinating. Species rules in `particles.json` set their substrate, aquatic depth, and germination requirements. |
| Vegetation | Plant, grass, moss, aquatic plants, and flowering species use the environmental viability, growth, flowering, and seed-setting rules declared in `particles.json`; their leaves, pads, blooms, and fruit appear in this group too. |
| Metals | Spark, Copper and Molten Copper, Battery and Molten Aluminum, Iron and Molten Iron, Tubing, and Stainless Steel are listed here. Copper, Iron, Battery, and Stainless Steel carry electrical pulses; Stainless Steel transfers heat and electricity more slowly than Iron, draws Battery charge as a wire, and does not rust from Water or humid air. Battery stores charge; Tubing has no electrical conductivity despite being in the Metals picker group. |
| Electricals | Elec is high-purity copper wire with higher heat and electrical conductivity than Copper. Simple Switch relays a live signal from its electrical input to its output while ON; OFF blocks it. Lamp glows yellow only when ON and powered, with a small Battery load. |
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
- Air spaces are classified by an eight-way perimeter flood fill each frame.
  Empty cells and gas cells reachable from the world edge are open air; diagonal
  routes count as routes. Open air continues to follow the shared ambient
  temperature and its height-dependent profile. Air spaces with no
  route to the perimeter are enclosed and keep a local temperature instead of
  being pulled toward global ambient. Enclosed empty air and gases still receive
  heat or cold from nearby matter, Heat Ray, Cold Ray, fire, Lava, and other
  normal local sources. Steam in a sealed chamber can therefore remain hot
  while outside air cools; when the chamber is opened, its air returns to the
  open-air ambient behavior gradually.
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
  Steel, Elec, and Battery participate in the electrical network; Spark is
  absorbed by connected metal and Battery stores charge. Copper, Iron,
  Stainless Steel, and Elec can discharge a charged Battery through their
  connected length. Elec uses electrical conductivity `2`, wire reach `2`, and
  a small per-cell charge draw of `0.35`; its fast thermal-network rate is
  `0.3`. It behaves like pure copper, melts into Molten Copper, and takes four
  times the qualifying exposure to become Corrosion powder compared with
  ordinary Copper. Tubing has no electrical conductivity and opts into fast
  thermal links while keeping zero ordinary conductivity.
- Stainless Steel has nonzero ordinary heat conductivity and electrical
  conductivity, both lower than Iron's. Its power draw is `0.5` per cell and it
  reaches conductive machines across up to two empty cells, like Iron. It does
  not join the fast thermal network or rust from Water or humid air.
- Electrical port signals travel through Copper, Iron, Stainless Steel, and
  Elec wire, and are shown as short yellow zig-zag sparks moving over live
  conductors. Machine ports retain their protruding connection markers: red
  while open and green when connected. Electrical machine lead previews and
  painted leads use gold Elec with a forced two-cell width, independent of the
  selected paint-brush size. Their input ports accept compatible conductive
  wire rather than Tubing.
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
distance remains 20 CSS pixels as zoom changes; hit proximity does not create a
physical route. A route requires compatible material at the declared anchor.
A port becomes connected through compatible external Tubing, Copper, or
conductive electrical wire at the declared anchor; its own tagged lead alone
does not activate it. Electrical ports accept Copper, Iron, Stainless Steel,
and Elec, and reject Tubing. Focused port coverage is documented in the machine
E2E README.

Clicking a placed machine opens its settings or inventory dialog. Machine state
persists in local Resume Game saves and portable LZString saves. Portable save
format version `2` is written and versions `1` and `2` are accepted on load.
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
- Airflow is produced only while powered; decaying residual air remains after a
  powered effect.

#### Heater

Heater is an eight-direction powered machine that drives its 28-cell cone
toward a target temperature and launches Heat Rays along the centreline.

- Temperature: `0-4000 C`, default `2000 C`.
- Power load: `100`.
- It is inactive without power.

#### Cooler

Cooler is the cold counterpart to Heater. It drives a 28-cell cone toward its
target and launches Cold Rays along the centreline.

- Temperature: `-60 to 20 C`, default `-60 C`.
- Power load: `100`.
- It is inactive without power.

### Electrical machines

Both electrical machines start ON. Their setting is persisted with machine
state in world saves and blueprints, and each has an ON/OFF switch in its
settings dialog.

- **Simple Switch** accepts a live signal through its electrical input. ON
  relays the signal to its electrical output; OFF blocks it. The switch does
  not create a signal by itself.
- **Lamp** has one electrical input. ON emits a warm yellow glow only while
  that input receives power; OFF blocks its input and keeps the glow dark. Its
  Battery load is `1` per tick, less than one tenth of Heater's `100` load.
- Both ports use Elec as the protruding connector material and force a
  two-cell-wide lead regardless of the paint-brush setting. Ports accept
  Copper, Iron, Elec, Stainless Steel, and other compatible conductive wire.
  They keep the existing red disconnected and green connected markers.

Live electrical pulses display as moving yellow zig-zag sparks over powered
wire cells. The signal animation is a visual layer; electrical power and
machine effects continue to use the conductor network and declared ports.

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
footprint. A route attaches only when compatible Tubing reaches its exact
anchor. Storage inputs enforce Powder, Liquid, or Gas family compatibility;
the Sprinkler and Mixer accept the materials allowed by their existing
inventory rules. Copper is the connector for Fan, Heater, and Cooler inputs.
Electrical ports use Elec connectors and accept conductive wire materials;
they are separate from Tubing routes.

### Declared material ports

| Machine | Material ports | Other input/output |
| --- | --- | --- |
| Fan, Heater, Cooler | One Copper input | Directional world-effect cone output, opposite the input |
| Simple Switch | One electrical input and one electrical output; accepts compatible conductive wire | Relays a live signal when ON; blocks the signal when OFF |
| Lamp | One electrical input; accepts compatible conductive wire | Yellow light while ON and powered; no output when OFF or unpowered |
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
material, role, and stable anchor. Its visible marker and 2px stub project from
the rotated world `connectionCell`; hit targets remain 20 CSS pixels and
topology still requires exact compatible contact at the anchor. The Mixer has
two distinct inputs and no Tubing output; the Splitter has one input and two
outputs. A missing `machinePortLayoutVersion` identifies legacy connection
geometry in saves and blueprints; current snapshots use the explicit port
layout marker. Legacy compatible endpoints migrate to the current declared
`connectionCell` anchors. Sprinkler's former Vent identity is retained only for
load migration; its particle ID remains `52`. Focused port coverage passes
8/8.

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
dormant. A seed germinates only when its per-species minimum temperature and
humidity are met and its configured substrate has enough moisture. Tooltips
summarize each species, while `particles.json` contains the exact numeric
thresholds and viable substrate rules. Dry ground or unsuitable air leaves the
seed dormant. ID `19`, previously the generic Seed, is retained as Grass Seeds
so existing worlds and saves preserve that particle as the grass species.

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
Banana Plant grows `14-32` cells tall. See the
[Plant Growers Handbook](PLANT_GROWERS_HANDBOOK.md) for the complete per-seed
threshold and substrate table, plus practical humidity guidance.

Growing cells track health against their species' minimum/maximum and ideal
temperature and humidity, plus the required root-zone moisture. In-range plants
thrive and grow; plants within a wider survival band pause growth while health
recovers or declines; plants outside that band wither into Dry Mud when health
reaches zero. Plant color reflects its health. Only thriving, sufficiently
healthy plants reproduce; a cooldown and nearby-seed limit prevent a mature
patch from producing seeds every frame. Existing burn, freeze, and acid
reactions still apply.

### Humidity and condensation

Relative humidity is a local `0-100%` field attached to air locations, not a
visible particle. It diffuses between neighboring air cells and is updated in
staggered portions of the world each frame. Exposed open air slowly returns
toward the Base Humidity slider. Water above freezing, Steam, Cloud, and growing
plants raise nearby humidity; exposed Sand and Dry Mud lower it. Plants
therefore both depend on moisture and contribute humidity as they grow.

The Dewpoint slider sets a configurable `0-100 C` threshold, defaulting to
`10 C`. When exposed upper air is at or below the dewpoint and local humidity
reaches `88%`, sparse Cloud gas particles can nucleate without an existing
cloud. Enclosed chambers retain and diffuse humidity but do not spontaneously
spawn weather. Cloud gas rises/drifts and, at or below the dewpoint in air at
`88%` or higher humidity, can condense into individual precipitation particles:
Water when the precipitation temperature is above `0 C`, Snow at or below
`0 C`. A Cloud above `100 C` evaporates and restores up to `12` percentage
points to humidity at its location, matching the amount consumed when the cloud
formed. Local humidity is capped at `100%`, so the actual increase can be
smaller when the air is already humid.
Clouds are a gas material and can be placed with the material picker.

Steam remains produced by boiling Water and Wet Mud, evaporates above `3000 C`,
and has no lifetime timer. It adds moisture to nearby air and condenses to Water
or Snow when the air reaches the configured Dewpoint and local humidity is at
least `82%`. Boiling, Steam condensation, cloud formation, and rain/snow all
participate in the same humidity and temperature cycle; changing the dewpoint
affects both Steam and Cloud.

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
