# Campaign Mission Outline

The campaign target is 25 missions. Missions 1–6 are established; earlier drafts for Missions 6–23 are legacy material, not guidance or checklists, and the current Mission 6 design supersedes any earlier Mission 6 draft. Design Missions 7–25 from scratch based on implemented systems and the mission-designer instructions in `.kilo/agents/mission-designer.md`. Each Equipment list is the complete lesson kit: materials, tools, and machines omitted from that mission are unavailable there. Missions can lock materials and climate sliders, then unlock them as objectives are completed. Slider limits can also change between stages.

## 1. The First Daffodil

Turn a sandy basin into a living habitat by preparing soil and growing a Daffodil using the supplied seed retries.

**Objectives**

- Lay out a small planting bed of Dry Mud over the sandy floor.
- Wet the soil with Water.
- Grow one Daffodil from the supplied seeds.

**Equipment:** Sand, Dry Mud, Water, Daffodil Seeds (5 attempts), Brush.
**Controls:** None.

## 2. The Icebound Grove

Thaw the frozen ground, prepare a warm growing climate, and bring a Banana Plant to life.

**Objectives**

- Melt Ice into Water.
- Set a growing climate using Temperature, Humidity, and Ambient Light.
- Turn Dry Mud and Water into Wet Mud.
- Grow one Banana Plant from the supplied seeds.

**Equipment:** Ice, Dry Mud, Banana Seeds (5 attempts), Brush.
**Controls:** Temperature (maximum 30 C in Mission 2), Humidity, Ambient Light. Sandbox retains its 4,000 C maximum.

## 3. The Basin in Three States

Begin with a blank basin, build three dry material piles, use a finite Cloud kit and climate controls to make rain, dry 150 cells of each pile in any order, then form 200 Glass at 350 °C before unlocking 2,000 °C for the Lava stage. The Lava stage requires 150 Glass, 150 Dry Mud, and 150 Ash.

**Objectives**

- Place 500 cells each of Sand, Dry Mud, and Ash. Cloud becomes available after all three piles are placed; then place 500 Cloud above the piles.
- Set Humidity to 95% and Dewpoint to 20 °C to make rain; let 150 cells of each pile become wet.
- Raise Temperature to the 150 °C limit and dry 150 Sand, Dry Mud, and Ash cells back to their original forms in any order.
- Drying Ash unlocks a 350 °C temperature limit. Raise Temperature to 350 °C and form 200 Glass from Sand.
- Forming 200 Glass unlocks the 2,000 °C limit. Raise Temperature to 2,000 °C, then melt 150 Glass, 150 Dry Mud, and 150 Ash cells into Lava. Dry Mud melts above 1,200 °C.

**Equipment:** Sand (5,000), Dry Mud (5,000), Ash (5,000), Cloud (8,000), Brush.
**Controls:** Temperature (maximum 150 °C, then 350 °C, then 2,000 °C), Humidity and Dewpoint (unlocked after Cloud); Ambient Light and Wind remain locked.

## 4. The Meltwater Garden

A dry Mud basin has no Water supply, but a reserve of Snow and five Red Tulip Seed attempts; recover the garden by turning the Snow into usable soil moisture.

**Objectives**

- Melt 150 Snow cells into Water.
- Let the thaw wet 100 Dry Mud cells into Wet Mud.
- Grow one Red Tulip from the supplied seed reserve.

**Starting Scenario:** A 260×150 world with a full-width, five-row Dry Mud floor authored into the scenario. The canvas initializes immediately at the mission's −10 °C starting temperature, including when entering from a hotter mission. Humidity is 72%, Ambient Light is 70%, Dewpoint is 10 °C, and Wind is off. Temperature control is unlocked and capped at 8 °C; all other climate controls are locked. The world and loadout contain no Water, Steam, Cloud, Sand, or Wet Mud. Supply 500 Snow for the player to place and five Red Tulip Seeds for retries.

**Equipment:** Dry Mud (starting floor), Snow (500), Red Tulip Seeds (5), Brush. No Water.

**Controls:** Temperature (starts at −10 °C; maximum 8 °C), Humidity (fixed at 72%), Ambient Light (fixed at 70%), Dewpoint (fixed at 10 °C), Wind (off).

**Design Notes:** Combines temperature and thaw from Mission 2, soil wetting from Mission 3, and flowering-plant growth introduced in Mission 1. Snow is the only water source; the fixed humidity and light support the Red Tulip while the player solves thaw and moisture. Red Tulip seeds require at least 4 °C, 38% humidity, and 20% light; mature plants thrive from 4–28 °C, with ideal conditions at 15 °C, 72% humidity, and 70% light. The temperature cap yields at most 15.5 °C at the documented ground-level profile, meeting the temperature ideal. Five seeds allow retries; one Red Tulip that uses half its initial growth budget satisfies the growth objective. This prepares Mission 5's water-cycle work without introducing Steam or Dewpoint as new focus.

## 5. Moisture in Motion

The upper soil holds the last usable moisture while Sand beneath it is dry. Move that stored water through the atmosphere, recover it as snowfall, and return it to the soil.

**Starting Scenario:** Use a captured, unrestricted 260×150 Sandbox snapshot with a four-row Sand floor along the bottom and an exposed Wet Sand strip directly above it. The Wet Sand is the moisture source and the Sand below is the catch bed. Initialize local Humidity and Base Humidity at 95%. Start at 25 °C with a 10 °C Dewpoint, 50% Ambient Light, and Wind off. The snapshot contains no preplaced Water, Steam, Snow, or Cloud, and the player has no water-cycle or Cloud supply. Cloud must nucleate naturally from the existing open-air weather system; this mission adds no unlimited Cloud placement supply. This authored terrain and humidity configuration must come from a captured Sandbox snapshot, not a new declarative layout type.

**Objectives**

1. Set Temperature to 150 °C (`environment-target`; id `heat-drying`).
2. Dry 100 Wet Sand into Sand (`transformation`: Wet Sand → Sand; id `dry-wet-sand`; `requires: [heat-drying]`); unlock Dewpoint.
3. Set Temperature to −10 °C and Dewpoint to 20 °C while Humidity remains at 95% (`environment-target`; id `set-cold-dewpoint`; `requires: [dry-wet-sand]`).
4. Let naturally formed Cloud condense into at least 75 Snow cells (`transformation`: Cloud → Snow; id `condense-snow`; `requires: [set-cold-dewpoint]`).
5. Set Temperature to 8 °C (`environment-target`; id `set-thaw-temperature`; `requires: [condense-snow]`).
6. Melt 60 Snow into Water (`transformation`: Snow → Water; id `melt-snow`; `requires: [set-thaw-temperature]`).
7. Let recovered Water wet 50 Sand cells (`transformation`: Sand → Wet Sand; id `wet-catch-bed`; `requires: [melt-snow]`).

**Objective Setup:** Use the listed `requires` links to enforce this sequence: drying Wet Sand → setting the cold temperature and Dewpoint → waiting for the open air to cool and naturally nucleate Cloud that precipitates as Snow → warming the air → melting Snow into Water → wetting Sand. No Cloud is placed or supplied to the player in this mission. The `environment-target` and `transformation` objective types used here are supported by the campaign runtime.

**Equipment:** Sand and Wet Sand in the starting ground, Brush. No additional water supply.

**Controls:** Temperature (starts at 25 °C; available throughout; minimum −10 °C and maximum 150 °C), Humidity (fixed at 95%), Dewpoint (starts at 10 °C; unlocks after Wet Sand dries), Ambient Light (fixed at 50%), Wind (off).

**Design Notes:** Treat Cloud, Humidity, and Dewpoint as familiar from Mission 3, then apply Mission 4's thaw knowledge to complete the soil-moisture loop. At the −10 °C Temperature target, allow the open-air profile to cool fully; with 20 °C Dewpoint and 95% local Humidity, naturally nucleated Cloud yields Snow rather than rain. At 8 °C, all open air is above freezing, about 0.5–15.5 °C, so Snow melts into recoverable Water. Mission 8's Water → Steam conversion is a separate Lava-quench byproduct, not a weather objective or Cloud source.

## 6. A Controlled Burn

Ignite the exposed top of a broad Wood bridge, let the burn spread briefly, then pour unlimited Water over it. Finish after the Fire is out while some Wood remains.

**Starting Scenario:** Use a captured 260×150 Sandbox snapshot with the existing full-width, five-row Sand floor and a substantial Wood structure beside the planting ground. The structure has two supporting legs, a five-cell-thick overhead span, and an open bay underneath. Leave an exposed Wood surface at the top for the Fire placement. No Fire or Water is preplaced. Temperature is fixed at 25 °C and all climate controls are locked. Save this terrain as a captured Sandbox snapshot rather than adding a new declarative layout type.

**Objectives**

1. Place one Fire cell on the exposed top of the Wood span (material-placement; id start-fire; target 1; Fire is available initially).
2. Let one second of active simulation pass after ignition (active-simulation-steps; id water-unlock-delay; target 60; requires start-fire; unlocks Water).
3. Pour unlimited Water over the burning structure and turn at least one Fire cell into Smoke (Fire to Smoke caused by Water; id quench-with-water; target 1; requires water-unlock-delay).
4. Finish with some Wood remaining and no active Fire (world-state; id confirm-fire-out; requires quench-with-water).

**Guidance:** Ignite the exposed upper surface of the overhead span. Water unlocks after 60 active simulation steps; paused time does not count. When it unlocks, the largest Brush is selected automatically. Pour Water over the burning structure to quench it, keeping some Wood intact. The final check requires both surviving Wood and zero active Fire.

**Equipment:** Sand floor, preplaced Wood bridge, Fire (10), Water (unlimited after unlock), Brush. Fire is available initially; Water unlocks after the one-second active-simulation delay.

**Controls:** Temperature (fixed at 25 °C); Humidity, Ambient Light, Dewpoint, and Wind locked.

**Design Notes:** Wood ignites above 150 °C, becomes Fire for 150 frames, then leaves Ash. Fire is 800 °C, clings to nearby fuel, and radiates 9 °C per frame. Fire expires naturally unless quenched; only a Fire-to-Smoke transition caused by Water counts toward the quench objective. The unlock timer advances through active simulation steps, so a pause does not consume the delay. Unlimited Water is explicitly represented as an unmetered resource, and the largest Brush is selected when it unlocks. Mission completion additionally checks the live world for at least one Wood cell and no Fire cells.

**Captured Scenario Restore:** Missions 5 and 6 restore their authored `startingSave` snapshots by decoding the simulation arrays while preserving the active Campaign state, objectives, and resource budgets.

## 7. The Warmth Bridge

Build an insulated thermal bridge from a Lava pocket to a sealed Ice vault, then carry enough heat across to thaw the receiver.

**Starting Scenario:** Use a captured 260×150 Sandbox snapshot. An Insulation-lined hot pocket on the left contains 40 preplaced Lava cells at 1,150 °C. A wall partition near the middle has a narrow channel. An Insulation-lined Ice vault on the right contains 100 preplaced Ice cells at −10 °C; a preplaced Insulation plug seals its opening. Lava, Ice, and the plug are authored into the snapshot and unavailable as supplies. Climate controls are locked.

**Objectives**

1. Build a continuous 53-cell Iron bridge through the partition channel toward the sealed Ice vault (material-placement; id build-approach; target 53; unlocks Insulation).
2. Sleeve the section crossing the partition with Insulation along its upper and lower sides (material-placement; id sleeve-bridge; target 98; requires build-approach).
3. Erase the plug at the vault opening and complete the bridge with one Iron cell (material-placement; id complete-bridge; target 1; requires sleeve-bridge).
4. Thaw at least 10 receiver cells (`transformation`: Ice → Water; id `thaw-receiver`; target 10; `requires: [complete-bridge]`).

**Guidance:** Extend a straight Iron bridge from the hot pocket through the partition channel to the sealed vault. Insulate the part crossing the partition along its upper and lower sides. Once that sleeve is complete, erase the plug and finish the bridge at the vault opening. Placement objectives count material totals rather than layout, so make the intended route clear in the briefing.

**Equipment:** Iron (65), Insulation (120), Brush, Eraser. Lava and Ice are preplaced and unavailable.

**Controls:** Temperature, Humidity, Ambient Light, Dewpoint, and Wind locked.

**Design Notes:** Insulation melts above 5,000 °C, so it can sleeve the hot bridge. Iron conducts heat quickly from the 1,150 °C Lava source. The 40-cell Lava source supports the 10-cell thaw objective. The plug keeps the Ice sealed until the Insulation sleeve is complete; only then should the player erase it and finish the thermal path.

## 8. Quench the Flow

Fill a lined basin with Lava and Water, quench the flow into Scoria, then cool the Scoria into Stone.

**Starting Scenario:** Use a 260×150 world with the full-width, five-row Sand floor and an empty, Wall-lined basin. No Lava, Water, or Scoria is preplaced. Start at 25 °C with Humidity 40%, Ambient Light 50%, Dewpoint 10 °C, and Wind off. Temperature is fixed at 25 °C until quenching is underway; when unlocked, its slider ranges from −10 °C to 25 °C. Other climate controls remain locked.

**Objectives**

1. Place 80 Lava in the basin (`material-placement`; id `place-lava`; target 80; `unlocks.materials: [Water]`).
2. Place 100 Water in the basin (`material-placement`; id `place-quench-water`; target 100; `requires: [place-lava]`).
3. Quench 60 Lava into Scoria (`transformation`: Lava → Scoria; id `quench-lava`; target 60; `requires: [place-quench-water]`).
4. Convert 60 Water into Steam during quenching (`transformation`: Water → Steam; id `flash-water`; target 60; `requires: [place-quench-water]`; `unlocks.controls: [temperature]`).
5. Set Temperature to −10 °C (`environment-target`; id `cool-slag`; target 1; `targetValues: { temperature: -10 }`; `requires: [quench-lava, flash-water]`).
6. Cool 30 Scoria cells into Stone (`transformation`: Scoria → Stone; id `set-stone`; target 30; `requires: [cool-slag]`).

**Equipment:** Lava (80), Water (250), Brush. Water is initially locked and unlocks after Lava is placed.

**Controls:** Temperature (starts at 25 °C; locked until `flash-water`, then range −10 °C to 25 °C), Humidity (fixed at 40%), Ambient Light (fixed at 50%), Dewpoint (fixed at 10 °C), Wind (off).

**Design Notes:** Cardinal contact between Lava and Water deterministically converts Lava to Scoria and Water to Steam. This Steam is a quench byproduct, separate from weather formation. Scoria becomes Stone below 100 °C, and the Sand floor supports the cooled material. The 80-cell Lava and 250-cell Water supplies provide headroom for the 60-cell quench and Steam objectives; keep the basin large enough to contain the poured materials.

## 9. The Deep Kiln

Compact a supported Wet Mud column into Clay, then fire the Clay into Ceramic.

**Starting Scenario:** Use a captured 260×150 snapshot with a full-width, five-row Sand floor and a continuous, supported 80-cell Wet Mud column near the center. Its lowest 30 cells extend below the material compaction depth. Start at 25 °C with Humidity 50%, Ambient Light 50%, Dewpoint 10 °C, and Wind off. Temperature is locked at 25 °C until compaction unlocks it.

**Objectives**

1. Compact 25 Wet Mud cells into Clay (`transformation`: Wet Mud → Clay; id `compact-clay`; target 25; `unlocks: { controls: [temperature], controlLimits: { temperature: { max: 650 } } }`).
2. Set Temperature to 650 °C (`environment-target`; id `set-kiln-temperature`; target 1; `targetValues: { temperature: 650 }`; `requires: [compact-clay]`).
3. Fire 20 Clay cells into Ceramic (`transformation`: Clay → Ceramic; id `fire-ceramic`; target 20; `requires: [set-kiln-temperature]`).

**Equipment:** Preplaced Sand floor and Wet Mud column, Brush. No additional material supply.

**Controls:** Temperature (starts at 25 °C; locked until `compact-clay`, then maximum 650 °C); Humidity (fixed at 50%), Ambient Light (fixed at 50%), Dewpoint (fixed at 10 °C), Wind (off).

**Design Notes:** The supported column compacts its bottom cells below the depth-50 line into Clay. Clay fires above 600 °C; the 650 °C limit is below Ceramic's 800 °C melting threshold, so the finished material remains intact.

## 10. The Rusted Bath

Fill a Glass-lined bath and compare Iron corrosion with Stainless Steel resistance.

**Starting Scenario:** Use a captured 260×150 snapshot with an empty Glass-lined basin. Place a row of 16 preplaced Iron cells beside 16 preplaced Stainless Steel cells along the basin floor so the bath will submerge both rows. The basin and metals are authored into the snapshot; no Water is preplaced. Start at 25 °C and Humidity 40%; climate controls are locked.

**Objectives**

1. Place 50 Water in the basin (`material-placement`; id `fill-bath`; target 50).
2. Let all 12 Iron cells corrode (`transformation`: Iron → Corrosion; id `rust-iron`; target 12; `requires: [fill-bath]`).

**Equipment:** Water (65), Brush. The basin, Iron, and Stainless Steel are preplaced; the objective asks the player to place 50 Water.

**Controls:** Temperature (fixed at 25 °C), Humidity (fixed at 40%); Ambient Light, Dewpoint, and Wind locked.

**Design Notes:** Water contact corrodes Iron over 360 frames, while Stainless Steel resists corrosion. The objective reports Iron conversion; the Stainless Steel comparison is observed in the scene but is not counted by a separate objective.

## 11. The Glass Etcher

Etch a supported Copper plate with Acid, then observe both the gas released by corrosion and the spent Acid's change.

**Starting Scenario:** Use a captured 260×150 snapshot with a Glass-lined tray and a supported, continuous 40-cell Copper plate along its base. No Acid, plants, or other Acid-targeted corrodible material is present. Start at 25 °C; all climate controls are locked.

**Objectives**

1. Place 60 Acid in the tray (`material-placement`; id `dose-etcher`; target 60).
2. Corrode Copper into Toxic Gas (`transformation`: Copper → Toxic Gas; id `etch-copper`; target 20; `requires: [dose-etcher]`).
3. Observe spent Acid become Smoke (`transformation`: Acid → Smoke; id `spent-acid`; target 10; `requires: [dose-etcher]`).

**Equipment:** Acid (80), Brush. The tray and Copper plate are preplaced; the objective asks the player to place 60 Acid.

**Controls:** Temperature (fixed at 25 °C); Humidity, Ambient Light, Dewpoint, and Wind locked.

**Design Notes:** Acid releases Toxic Gas as it corrodes eligible Copper. Successful corrosion events can convert Acid to Smoke probabilistically, so allow both transformation objectives to progress after dosing rather than gating one behind the other. Glass is not an Acid target; the 40-cell plate and 80 Acid supply provide headroom for the targets.

## 12. The Stone Garden

Prepare damp soil beside a Stone ledge, plant Moss Spores, and unlock the cool, humid climate they need to grow.

**Starting Scenario:** Use a 260×150 world with a Sand bed beneath a Stone ledge and a small preplaced Wet Sand patch touching the ledge. Start at 25 °C, Humidity 40%, and Ambient Light 50%. Temperature, Humidity, and Ambient Light controls are initially locked; Dewpoint and Wind remain locked throughout.

**Objectives**

1. Place 30 Water near the ledge (`material-placement`; id `wet-ledge`; target 30).
2. Wet 20 Sand cells (`transformation`: Sand → Wet Sand; id `prepare-moss-bed`; target 20; `requires: [wet-ledge]`).
3. Place 3 Moss Spores beside damp Stone or Wet Sand (`material-placement`; id `seed-stone`; target 3; `requires: [prepare-moss-bed]`; `unlocks.controls: [temperature, humidity, illumination]`).
4. Set Temperature to 16 °C, Humidity to 92%, and Ambient Light to 50% (`environment-target`; id `set-moss-climate`; target 1; `targetValues: { temperature: 16, humidity: 92, illumination: 50 }`; `requires: [seed-stone]`).
5. Grow at least one Moss cell from Moss Spores (`transformation`: Moss Spores → Moss; id `grow-moss`; target 1; `requires: [set-moss-climate]`).

**Equipment:** Water (40), Moss Spores (5), Brush. The objective asks the player to place 30 Water and 3 Moss Spores. Sand, Stone, and the small Wet Sand patch are in the starting ground.

**Controls:** Temperature (starts at 25 °C; unlocks after `seed-stone`), Humidity (starts at 40%; unlocks after `seed-stone`), Ambient Light (starts at 50%; unlocks after `seed-stone`), Dewpoint and Wind locked.

**Design Notes:** Moss Spores need at least 0 °C, 78% Humidity, and damp substrate. At 16 °C and 92% Humidity, place spores beside damp Stone or Wet Sand to provide a suitable growing surface. Moss growth is probabilistic at 4%; the five-spore budget allows retries while the objective asks for three placements. Dewpoint and Wind are not needed for this lesson.

## 13. The Flooded Reach

Set a warm, humid pond climate, seed the deep bank, and grow aquatic cover from submerged seeds.

**Starting Scenario:** Use a captured 260×150 pond snapshot with Wall sides, a floor, a Wet Mud bed across the basin, and connected Water above the bed, leaving open air above the pond. Seeds placed into the pond settle on the Wet Mud with at least three Water cells above them. Start at 10 °C, Humidity 40%, and Ambient Light 10%; Temperature, Humidity, and Ambient Light controls are unlocked, while Dewpoint and Wind are locked.

**Objectives**

1. Set Temperature to 24 °C, Humidity to 90%, and Ambient Light to 50% (`environment-target`; id `set-pond-climate`; target 1; `targetValues: { temperature: 24, humidity: 90, illumination: 50 }`).
2. Place 4 Water Grass / Lily Seeds in the pond (`material-placement`; id `plant-deep-bank`; target 4; `requires: [set-pond-climate]`).
3. Grow at least one Water Grass plant (`transformation`: Water Grass / Lily Seeds → Water Grass; id `grow-aquatic-cover`; target 1; `requires: [plant-deep-bank]`).

**Equipment:** Water Grass / Lily Seeds (5), Brush. The objective asks the player to place 4 seeds; Water and Wet Mud are preplaced.

**Controls:** Temperature (starts at 10 °C), Humidity (starts at 40%), Ambient Light (starts at 10%); Dewpoint and Wind locked.

**Design Notes:** Water Grass seeds need at least 8 °C, 65% Humidity, Wet Mud, and open water; they must settle with at least three Water cells above them to germinate submerged. Growth is probabilistic at 3.5% per eligible check. Four spaced seeds provide headroom while preserving enough open water for the aquatic stems.

## 14. A Lamp for the Ledge

Repair and charge a Lamp circuit to light a damp ledge, then grow Moss beside it.

**Starting Scenario:** Use a captured 260×150 snapshot with ambient illumination at 0. A Lamp above a damp ledge is on, and an uncharged Battery is connected to the Lamp input by an Elec lead with a single missing cell. A small Wet Sand patch rests on a Stone ledge within the Lamp 25-cell range. Start at 16 °C and Humidity 92%; Temperature, Humidity, and Ambient Light controls are locked, as are Dewpoint and Wind.

**Objectives**

1. Place one Elec cell in the gap (`material-placement`; id `repair-lamp-lead`; target 1).
2. Place 6 Sparks to charge the Battery (`material-placement`; id `charge-battery`; target 6; `requires: [repair-lamp-lead]`).
3. Place 4 Moss Spores on the damp ledge (`material-placement`; id `sow-dark-ledge`; target 4; `requires: [charge-battery]`).
4. Grow at least one Moss cell (`transformation`: Moss Spores → Moss; id `grow-ledgeside-moss`; target 1; `requires: [sow-dark-ledge]`).

**Guidance:** Place Sparks in contact with the Battery to charge it, then sow the spores on the damp Stone/Wet Sand ledge. The Spark placement counter cannot verify contact with the Battery; use the live charge and Lamp indicators to confirm the circuit. The 12-Spark supply allows retries, and the final Moss growth is the observable habitat outcome.

**Equipment:** Elec (2), Spark (12), Moss Spores (5), Brush. The objective asks the player to place 1 Elec cell and 4 Moss Spores. The Battery, Lamp, wiring, Stone, and Wet Sand are preplaced.

**Controls:** Temperature (fixed at 16 °C), Humidity (fixed at 92%), Ambient Light (fixed at 0); all climate and illumination controls, Dewpoint, and Wind locked.

**Design Notes:** Each Spark adds 28 charge to a touching Battery, so 6 correctly applied Sparks provide 168 charge. A live Battery-backed circuit powers the Lamp, which emits light across 25 cells. Moss needs at least 5% light, 78% Humidity, and damp substrate; the patch is within range and the starting climate meets its other needs.

## 15. Conditions for Light

Complete a humidity sensor path so temperature and humidity conditions can jointly switch on a Lamp and illuminate a Moss bed.

**Starting Scenario:** Use a captured 260×150 circuit snapshot with a charged Battery, Temperature and Humidity Switches, an AND gate, and a Lamp above a damp bed. Preserve the prewired topology: the Battery powers both switches and the separate AND-gate supply; Temperature output feeds one AND input; AND output feeds the Lamp. Only two adjacent Elec cells are missing from the Humidity output path. Keep both sensor probe faces exposed. A Wet Sand bed lies over Stone within the Lamp effective range. Start at 10 °C and Humidity 70%, with Ambient Light locked at 0; Temperature and Humidity are locked, as are Dewpoint and Wind.

**Objectives**

1. Place 2 Elec cells to complete the Humidity output path (`material-placement`; id `complete-humidity-signal`; target 2).
2. Place 4 Moss Spores on the damp bed (`material-placement`; id `sow-controlled-bed`; target 4; `requires: [complete-humidity-signal]`; `unlocks.controls: [temperature, humidity]`).
3. Set Temperature to 16 °C and Humidity to 92%, keeping Ambient Light at 0 (`environment-target`; id `set-growth-climate`; target 1; `targetValues: { temperature: 16, humidity: 92, illumination: 0 }`; `requires: [sow-controlled-bed]`).
4. Grow at least one Moss cell (`transformation`: Moss Spores → Moss; id `grow-lit-moss`; target 1; `requires: [set-growth-climate]`).

**Guidance:** Complete the two-cell gap in the Humidity output path and check the live switch and AND-gate indicators as the conditions change. Placement objectives count Elec cells but cannot inspect the sensor-to-AND wiring, so the briefing must call out the required connections and exposed probe faces. Moss growth verifies suitable habitat and effective light, not the circuit topology by itself.

**Equipment:** Elec (4), Moss Spores (5), Brush. The objectives ask the player to place 2 Elec cells and 4 Moss Spores. Battery, switches, AND gate, Lamp, wiring, and the damp Stone/Wet Sand bed are preplaced.

**Controls:** Temperature (starts at 10 °C; unlocks after `sow-controlled-bed`), Humidity (starts at 70%; unlocks after `sow-controlled-bed`), Ambient Light (locked at 0); Dewpoint and Wind locked.

**Design Notes:** The Temperature Switch passes at 14 °C or above and the Humidity Switch at 80% or above, so the 16 °C/92% climate makes both conditions true and the AND gate powers the Lamp. The Lamp provides local illumination to the nearby bed even though ambient illumination remains 0. Moss Spores need at least 5% effective light, 78% Humidity, and damp substrate; the final growth objective verifies the resulting habitat. Use `illumination` as the Ambient Light field in `targetValues`.
