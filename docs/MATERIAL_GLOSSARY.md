# Material glossary

The material picker is also the simulator's glossary. Hovering or focusing any
material button shows a fixed, readable tooltip containing the material name,
its short description, important physical/electrical properties, and the
reactions currently implemented for it. The tooltip is assembled from the
prepared definition used by the physics engine, so temperatures and target
materials come from the rules that actually run.

## Source of truth

- `particles.json` is the source for names, descriptions, properties and
  reaction rules. Every particle entry must have a non-empty `description`.
- `physics.js` validates that description when definitions are prepared and
  exposes the normalized values to the UI.
- `ui.js` (`formatMaterialTooltip`) formats those values. If a new rule adds
  user-visible behavior, add its readable line there at the same time.
- `styles.css` keeps the tooltip above the panels, wraps its text and allows a
  long glossary entry to scroll without covering the whole workspace.

## Current catalogue

The 53 entries are grouped in the same order as the picker:

| Group | Materials |
| --- | --- |
| Powders | Sand, Wet Mud, Ash, Wet Sand, Dry Mud, Seed, Gunpowder, Snow, Scoria, Wet Ash, Spark Dust |
| Liquids | Water, Oil, Lava, Acid |
| Gases | Fire, Steam, Smoke, Toxic Gas |
| Solids | Ice, Stone, Wood, Glass, Plant, Wall, Flower, Grass, Lily Stem, Lily Pad, Lily Flower, Ash Grass, Clay, Ceramic, Spark Block |
| Metals | Spark, Copper, Molten Copper, Battery, Molten Aluminum, Iron, Molten Iron, Tubing |
| Machines | Fan, Heater, Cooler, Vent, Mixer |
| Storage | Powder Storage Bin, Liquid Storage Bin, Gas Storage Bin |
| Tools | Heat Ray, Cold Ray, Wind |

The short descriptions live beside each name in `particles.json`, rather than
being duplicated here. This prevents the documentation from claiming a
threshold or conversion that the simulator does not implement.

## Adding or changing a material

1. Add or update the `description` immediately beside the material's `name` in
   `particles.json`. Keep it concise and describe the behavior a new player
   can observe.
2. Add the relevant reaction/property fields and make sure every referenced
   target material exists.
3. If the physics rule is new, add its temperature/condition/target wording to
   `formatMaterialTooltip` in `ui.js`.
4. Run `npm test` and `npm run test:smoke`; the smoke test rejects missing
   descriptions and checks that every picker button has an accessible tooltip.
5. Update this catalogue if the material set or the glossary mechanism changes.

This file is the maintenance note for the glossary: keep it with the code and
review it whenever material definitions evolve.
