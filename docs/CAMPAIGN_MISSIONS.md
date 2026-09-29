# Campaign Mission Outline

The campaign target is 25 missions. Missions 1–4 are established; the old Missions 5–23 entries are legacy drafts, not guidance or checklists. Design Missions 5–25 from scratch based on implemented systems and the mission-designer instructions in `.kilo/agents/mission-designer.md`. Each Equipment list is the complete lesson kit: materials, tools, and machines omitted from that mission are unavailable there. Missions can lock materials and climate sliders, then unlock them as objectives are completed. Slider limits can also change between stages.

## 1. The First Daffodil

Turn a sandy basin into a living habitat by preparing soil and growing the lone Daffodil seed.

**Objectives**

- Lay out a small planting bed of Dry Mud over the sandy floor.
- Wet the soil with Water.
- Grow the Daffodil Seed into a Daffodil.

**Equipment:** Sand, Dry Mud, Water, Daffodil Seeds, Brush.  
**Controls:** None.

## 2. The Icebound Grove

Thaw the frozen ground, prepare a warm growing climate, and bring a Banana Plant to life.

**Objectives**

- Melt Ice into Water.
- Set a growing climate using Temperature, Humidity, and Ambient Light.
- Turn Dry Mud and Water into Wet Mud.
- Grow the Banana Seed into a Banana Plant.

**Equipment:** Ice, Dry Mud, Banana Seeds, Brush.  
**Controls:** Temperature (maximum 30 C in Mission 2), Humidity, Ambient Light. Sandbox retains its 4,000 C maximum.

## 3. The Basin in Three States

Begin with a blank basin, build three dry material piles, make rain with Steam and climate controls, dry 150 cells of each pile, then form 200 Glass at 350 °C before unlocking 2,000 °C for the Lava stage.

**Objectives**

- Place 500 cells each of Sand, Dry Mud, and Ash. Steam becomes available after all three piles are placed; then place 500 Steam above the piles.
- Set Humidity to 95% and Dewpoint to 20 °C to make rain; let 150 cells of each pile become wet.
- Raise Temperature to the 150 °C limit and dry 150 Sand, Dry Mud, and Ash cells back to their original forms.
- Drying Ash unlocks a 350 °C temperature limit. Raise Temperature to 350 °C and form 200 Glass from Sand.
- Forming 200 Glass unlocks the 2,000 °C limit. Raise Temperature to 2,000 °C, then melt Glass, Dry Mud, and Ash into Lava. Dry Mud melts above 1,200 °C.

**Equipment:** Sand (5,000), Dry Mud (5,000), Ash (5,000), Steam (8,000), Brush.  
**Controls:** Temperature (maximum 150 °C, then 350 °C, then 2,000 °C), Humidity and Dewpoint (unlocked after Steam); Ambient Light and Wind remain locked.
## 4. The Meltwater Garden

A dry Sand basin has no Water supply, but a reserve of Snow and one Red Tulip Seed; recover the garden by turning the Snow into usable soil moisture.

**Objectives**

- Melt 100 Snow cells into Water.
- Let the thaw wet 100 Sand cells into Wet Sand.
- Grow one Red Tulip from the supplied seed.

**Starting Scenario:** A 260×150 world with a full-width, five-row Sand floor authored into the scenario. Start at −10 °C with 72% Humidity, 70% Ambient Light, a 10 °C Dewpoint, and no Wind. Temperature control is unlocked and capped at 8 °C; all other climate controls are locked. The world and loadout contain no Water, Steam, Cloud, or Wet Sand. Supply 500 Snow for the player to place and one Red Tulip Seed.

**Equipment:** Sand (starting floor), Snow (500), Red Tulip Seeds (1), Brush. No Water.

**Controls:** Temperature (starts at −10 °C; maximum 8 °C), Humidity (fixed at 72%), Ambient Light (fixed at 70%), Dewpoint (fixed at 10 °C), Wind (off).

**Design Notes:** Combines temperature and thaw from Mission 2, Sand wetting from Mission 3, and flowering-plant growth introduced in Mission 1. Snow is the only water source; the fixed humidity and light support the Red Tulip while the player solves thaw and moisture. Red Tulip seeds require at least 4 °C, 38% humidity, and 20% light; mature plants thrive from 4–28 °C, with ideal conditions at 15 °C, 72% humidity, and 70% light. The temperature cap yields at most 15.5 °C at the documented ground-level profile, meeting the temperature ideal. This prepares Mission 5's water-cycle work without introducing Steam or Dewpoint as new focus.
