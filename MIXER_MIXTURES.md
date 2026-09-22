# Mixer Mixtures

This document is the source of truth for mixer recipes and behavior. Update it
whenever mixer logic, recipes, output presentation, or persistence changes.

The mixer checks the two input materials in either order. When a recipe exists,
one particle from each input becomes one particle of the result. When no recipe
exists, the two input materials are emitted alternately as separate outputs.

## Current Recipes

| Inputs | Output |
| --- | --- |
| Sand + Water | Wet Sand |
| Dry Mud + Water | Wet Mud |
| Ash + Water | Wet Ash |

These recipes are derived from the material definitions' existing `wetsInto`
physics. The mixer therefore stays aligned with the normal simulation reactions.

Mixed results are logged as a single output stream. They never appear alongside
their source materials in the output list or visualization.

The mixer never overwrites an existing non-mixed output stream while creating a
recipe result. A lone non-mixing output remains a single half-width stream until
the complementary material arrives; only then can the pair be converted into
the documented mixed result.

When both source bins contain a valid recipe, one particle is consumed from each
bin immediately and one result particle is added to bin 3. Production continues
until either source bin cannot provide another particle. Source bin types reset
independently when their counts reach zero. Bin 3 resets its output type only
when its output count reaches zero.

With release disabled, bin 3 retains its output and continues accumulating up to
its 1000-particle capacity. With release enabled, output particles are released
through the mixer outlet at the configured mixer release rate.

## Non-Mixing Inputs

Any pair not listed above remains separate and is emitted alternately. For
example, Sand + Ash produces alternating Sand and Ash output rather than a new
material.

## Output Display

The mixer dialog reports the actual output below the third bin. A mixed recipe
shows its result, such as `output: Wet Mud`; a non-mixing pair shows the two
materials, such as `output: Sand + Ash`.
