# Game mechanics

This is the current reference for material definitions, machine behavior,
storage intake, mixer recipes, tubing, vents, and their maintenance contracts.
The broad simulation model remains in [`PROGRAM_OVERVIEW.md`](PROGRAM_OVERVIEW.md).
Use [`E2E_TEST_PLAN.md`](E2E_TEST_PLAN.md) for test ownership and browser-test
commands; active follow-ups and proposed changes remain in [`ISSUES.md`](ISSUES.md)
and [`FUTURE_IDEAS.md`](FUTURE_IDEAS.md).

## 1. Material catalogue and glossary maintenance

The material picker is also the simulator's glossary. Hovering or focusing any
material button shows a fixed, readable tooltip with the material name, short
description, important physical and electrical properties, and implemented
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

The 54 entries are grouped in the same order as the picker:

| Group | Materials |
| --- | --- |
| Powders | Sand, Wet Mud, Ash, Wet Sand, Dry Mud, Seed, Gunpowder, Snow, Scoria, Wet Ash, Spark Dust |
| Liquids | Water, Oil, Lava, Acid |
| Gases | Fire, Steam, Smoke, Toxic Gas |
| Solids | Ice, Stone, Wood, Glass, Plant, Wall, Flower, Grass, Lily Stem, Lily Pad, Lily Flower, Ash Grass, Clay, Ceramic, Spark Block, Insulation |
| Metals | Spark, Copper, Molten Copper, Battery, Molten Aluminum, Iron, Molten Iron, Tubing |
| Machines | Fan, Heater, Cooler, Vent, Mixer |
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
| Powders | Loose materials fall and slide diagonally. Water wets Sand, Dry Mud, and Ash into Wet Sand, Wet Mud, and Wet Ash. Powders do not sort themselves by density against other powders. |
| Liquids | Water, Oil, Lava, and Acid flow and seek a level. Liquid storage also accepts molten metals. Water changes phase at its configured thresholds; Lava and Acid have their own material-defined heat and reaction rules. |
| Gases | Fire, Steam, Smoke, and Toxic Gas rise and spread. Gas storage accepts non-flaming gases, so Fire is not accepted by a Gas Storage Bin. |
| Solids | Solids provide the fixed, structural, growing, or phase-change behavior declared by their definitions. Ice, Glass, Clay, Ceramic, and plant materials participate in the heat and reaction rules defined in `particles.json`. |
| Metals | Spark, Copper, Battery, Iron, their molten forms, Molten Aluminum, and Tubing are listed here. Copper, Iron, and Battery carry electrical pulses and Battery stores charge; Tubing has no electrical conductivity despite being in the Metals picker group. |
| Tools | Heat Ray and Cold Ray are short-lived directional brushes. A left-button stroke starts Heat Ray upward or Cold Ray downward; its first non-zero drag selects the nearest cardinal direction, which persists while stationary and changes only when the drag heading changes. Painted ray cells travel as projectiles using that stored heading. Wind moves light materials and stirs air; it stops at solid barriers but passes through plants. |

### Heat, electrical, and reaction anchors

- Ice above `0 C` becomes Water and Water below `0 C` becomes Ice. Water above
  `100 C` becomes Steam; Steam below `95 C` condenses to Water.
- Wood, Oil, and Plants ignite at their definition thresholds. Sand next to Lava
  becomes Glass; Lava below `700 C` becomes Scoria, and Scoria below `100 C`
  becomes Stone. Heating Stone above `100 C` returns it to Scoria, and heating
  Scoria above `900 C` returns it to Lava.
- Battery melts at `660 C` into Molten Aluminum and cools back into Battery.
  Copper and Iron use approximate melting points of `1085 C` and `1538 C`.
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
  temperature and its height-dependent lapse as before. Air spaces with no
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
  The current conductors are Copper, Molten Copper, Battery, Molten Aluminum,
  Iron, Molten Iron, Tubing, Fan, Heater, and Cooler. Tubing uses
  `thermalNetworkRate: 0.12`, despite having zero ordinary conductivity and no
  electrical conductivity. The network transfers heat between two opted-in
  conductors or between an opted-in conductor and adjacent enclosed empty/gas
  cells. It uses 32 local substeps per frame and replaces ordinary pair
  exchange for those eligible links. Open air, non-network materials, and
  Insulation are not network endpoints. Ordinary per-frame conductivity still
  handles every other contact pair, including slower Wood, Stone, and Wall
  exchange; eligible conductors use ordinary conductivity for links to open air
  or other non-network materials when their conductivity permits it.
- Solid Copper, Battery, Iron, Fan, Cooler, Tubing, and Heater have a local
  temperature glow. The material definitions provide `glowColor`, prepared as
  `glowRgb`, and blend from the base pixel color starting at `glowStartTemp`;
  `glowTemp` marks the fully blended point and equals each material's
  `meltPoint`. This changes only that cell's rendered color: it adds no halo,
  heat emission, or tint to neighboring pixels. Molten materials keep their
  existing color/color2 gradients unchanged.
- Ordinary materials are non-conductive by default. Copper, Iron, and Battery
  participate in the electrical network; Spark is absorbed by connected metal,
  Battery stores charge, and Copper or Iron can discharge a charged Battery
  through their connected length. Tubing has no electrical conductivity and
  opts into fast thermal links while keeping zero ordinary conductivity.
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

Directional machines are aimed by dragging during placement. The preview shows
the facing direction and effects; releasing the pointer commits one machine
cell, regardless of brush size or drawing mode. Clicking a machine opens its
settings or inventory dialog. Machine state persists in local Resume Game saves
and portable LZString saves. The shared air temperature control ranges from
`-60 C` to `4000 C`.

### Powered machines

#### Fan

Fan is an eight-direction powered airflow machine with a widening 28-cell cone.

- Wind speed: `1-20`, default `7`.
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

### Storage machines

All storage bins are always active, hold one material type, accept material
through their rear intake, and hold up to `500` particles. Purge clears a bin so
it can accept another material. Intake collision, suction, and ordering rules
are specified in [Section 5](#5-storage-bin-intake-collision-geometry-and-regression-maintenance).

- **Powder Storage Bin:** accepts powder-category materials and feeds compatible
  connected Tubing.
- **Liquid Storage Bin:** accepts liquid-category materials, including molten
  metals, and feeds Tubing.
- **Gas Storage Bin:** accepts non-flaming gases and feeds Tubing.

### Transfer machine: Vent

Vent is always active. It receives one material through connected Tubing and
releases it below into the canvas.

- Placement creates one vertical Tubing stub directly above the Vent. Tubing
  connected to that stub is guaranteed to connect to the Vent.
- The outlet is two grid cells below the logical anchor, outside the drawn icon
  footprint, so normal output is visible below the housing.
- Release rate: `1-100` particles/second, default `10` particles/second.
- Release is enabled by default. With Release disabled, the Vent retains one
  material type up to `100` particles.
- Tubing limits the effective release rate. A full disabled Vent stops its
  connected Tubing at `0/s`.

### Connection material: Tubing

Tubing is a dense, electrically non-conductive, static material that carries
stored contents between compatible bins, Vents, and Mixer inputs. It has zero
ordinary thermal conductivity, but its `thermalNetworkRate: 0.12` lets it
exchange heat with other fast-network conductors and enclosed air. Its
edge-sharing connection, capacity, bottleneck, and persistence rules are in
[Section 6](#6-tubing-and-vent-connections-bottlenecks-and-regression-maintenance).

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

Tubing anywhere touching the invisible `64px` Mixer icon footprint is accepted.
Left contacts map to input A and right contacts map to input B. The icon is
symmetric, includes matching Tubing connections, and is rotated 90 degrees
counterclockwise. Mixer settings and inventories are machine state and persist
through the supported local Resume Game and portable LZString save paths.

The browser regression workflows cover Water-only input, Dry Mud-only input,
Water + Dry Mud -> Wet Mud, non-mixing Water + Oil, and a late Water + Ash ->
Wet Ash transition while Water is already being processed. Keep those workflows
aligned with the owning machine specs and the maintenance contract in
[`E2E_TEST_PLAN.md`](E2E_TEST_PLAN.md).

## 5. Storage-bin intake collision geometry and regression maintenance

The storage-bin intake is an invisible collision barrier at the outside edge of
the funnel drawn in the 32px machine icon. It is not the machine's one-cell
centre and is not a solid 32px square.

### Geometry and ordering

- `physics.js` rebuilds the barrier for every storage bin at the start of each
  simulation step.
- `STORAGE_OPENING_HALF_WIDTH` gives the intake its approximately 32px span.
- Barriers sit one grid step behind the machine centre, at the funnel-to-bin
  join. This keeps material against the icon without a visible air gap in any
  orientation.
- Diagonal barriers use the same one-step depth and a one-cell staircase
  supercover. Connector cells prevent a particle travelling at 45 degrees from
  passing through corner-to-corner gaps.
- `storageBarrierMask` contains the resulting cells. Powder, liquid, gas,
  ambient-wind, and Fan movement checks all see those cells as
  `STORAGE_VIRTUAL_WALL`.
- `buildStorageBarrierCells()` is the single source of barrier geometry.
  `updateStorageBins()` iterates those same cells when looking for particles to
  store, so collision and collection cannot use different entrance positions.
- The storage pass runs immediately after powered Fan movement. A particle
  delivered to the barrier during that frame can be collected before normal
  gravity runs.

### Acceptance and suction

A two-cell suction zone extends directly outward from every barrier cell. The
zone is scanned nearest to farthest, so packed liquid can enter even when it has
no free row to move into and has not moved during that frame.

A particle is accepted only when all of these are true:

- Its category is accepted by the bin.
- It matches the type already stored in the bin, or the bin is empty.
- The bin has capacity remaining.

An accepted particle is removed from the world and increments the stored count.
Empty suction cells are skipped. A wrong particle, a different stored type, or a
full bin stops that suction ray; the intake never pulls a valid particle through
an invalid one. The barrier remains solid, so refused matter falls, flows, or
continues responding to wind without crossing it.

### Regression maintenance

`tools/simTest.mjs` covers these storage checks:

- A sealed upright liquid funnel fills its bin and retains overflow.
- A Fan below and left of a diagonal powder bin fires three Ash particles
  up-right at 45 degrees, and all three enter the bin.
- A particle arriving from the front of an upside-down bin is refused.
- Two stationary packed Water cells are pulled into a liquid bin.
- A wrong particle blocks suction from reaching valid material behind it.

Run `npm test` after changing the machine icon size, direction mapping, barrier
distance, movement order, or Fan physics. If the SVG funnel moves, update the
barrier constants and these regressions together.

## 6. Tubing and Vent connections, bottlenecks, and regression maintenance

Tubing is non-conductive and static. It connects only through shared cell edges;
diagonal corner contact is not a connection.

### Connecting a run

Paint one continuous tube between a storage bin and either a compatible storage
bin or a Vent. A working run has exactly two attached machines. The source bin
must contain material, and the destination must have room and accept that
material. Only then does the source empty and moving dots appear in the tube.

The transfer rate is controlled by the narrowest painted cross-section anywhere
along the route:

| Narrowest width | Capacity |
| ---: | ---: |
| 3 cells | 30 particles/second |
| 2 cells | 20 particles/second |
| 1 cell | 10 particles/second |

Ordinary storage Tubing therefore carries `10` particles/second per cell of
narrowest cross-section. Mixer inputs are separately capped at `5` particles/s
each. A configured Vent release rate is also limited by the Tubing cap.

Dots and flow stop immediately when the source is empty, the route is
incomplete, the destination rejects the material, or the destination is full.

### Vent connection and release

A Vent's guaranteed connection is the vertical Tubing stub directly above it.
The Vent releases stored material into the canvas cell directly below its body.
Release is enabled by default; disabling it buffers one material type up to
`100` particles. A full Vent cuts the connected flow off at `0/s`. Hovering a
Vent shows its stored amount and current switch state.

### Persistence and regression commands

Worlds and Blueprints save the source inventory, Vent inventory, Release switch,
and fractional flow remainder. Portable Save and Load also preserve machine
settings, inventories, Tubing, and Mixer inputs through the supported save path.

The headless regression coverage in `tools/simTest.mjs` checks the `30/s` and
`20/s` bottlenecks, material transfer, non-conductive Tubing, Vent release, and
full-Vent flow cutoff. For browser-visible changes, run the owning machine area
headlessly:

```text
npm run test:browser -- e2e/machines --workers=1 --trace=off
```

Headed runs are optional visual or input diagnostics only and are never an
acceptance or release prerequisite.

Keep focused machine regressions beside their owning specs, and use the
regression policy in [`E2E_TEST_PLAN.md`](E2E_TEST_PLAN.md) when no functional
area owns a repaired defect.
