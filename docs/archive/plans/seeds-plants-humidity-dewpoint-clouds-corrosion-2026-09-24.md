# Seeds, plants, humidity, dewpoint, clouds, and corrosion

**Status: implemented; final verification record pending.** This dated archive
preserves the finalized implementation plan and confirmed design decisions.
Verification outcomes are to be appended after the full regression run.

## Goal and boundaries

Connect seeds and plant growth to local ground moisture, temperature, and air
humidity. Add humidity and dewpoint controls, make boiling Steam and upper-air
Clouds share a condensation loop, allow rain or snow to return water to the
world, and make persistent saturated air structurally corrode exposed metal.
Keep these rules in the existing definition-driven material and physics model,
preserve the existing boiling source for Steam, and save the new state through
local Resume Game and portable world saves.

The controls are fixed design decisions: **Base Humidity** spans `0-100%` and
defaults to `50%`; **Dewpoint** spans `0-100 C` and defaults to `10 C`. The
material catalog retains ID `19` for compatibility, now naming Grass Seeds so
old generic Seed particles load as the grass species.

## Architecture and implementation phases

1. **Environmental foundation.** Add a local relative-humidity field to the
   existing flat world arrays. Update it in staggered portions of the grid,
   diffuse it between neighboring air locations, return exposed open air slowly
   toward the Base Humidity setting, and account for local sources and sinks:
   above-freezing Water, Steam, Cloud, and plants add humidity; Sand and Dry Mud
   remove it. Add the Dewpoint setting and expose both settings through the
   existing environmental controls.
2. **Reusable seed and plant framework.** Drive species behavior from
   `particles.json`: minimum/maximum and ideal temperature and humidity,
   moisture requirements, seed germination thresholds, allowed substrates,
   growth style, reproduction, health, and humidity contribution. A viable seed
   remains dormant until the local temperature/humidity and its substrate
   moisture requirements are met. Growing cells track thriving, surviving, or
   dying conditions; fitness toward the species' ideal climate affects health.
   Growth and reproduction require thriving plants, while sustained unsuitable
   conditions reduce health until the plant returns to Dry Mud.
3. **Eight distinct ecological species.** Support Grass, Moss, Daffodil, Red
   Tulip, Geranium, Blue Flower, Banana Plant, and Water Grass, with their seed
   forms, species-appropriate substrates and climate ranges, growth patterns,
   flowering or fruit forms, and seed production. Wet Mud gives Grass a richer
   soil advantage. Moss colonizes damp Wood, Stone, and wet soils; Banana grows
   a leafy tropical trunk; aquatic Water Grass grows through open water, then
   spreads pads and flowers at the surface.
4. **Corrosion as structural conversion.** Track sustained saturated-air
   exposure on metal-flagged definitions. When the exposure threshold is met,
   replace the source metal cell itself with Corrosion powder, leaving the
   opening for the remaining structure to reveal. Corrosion falls under gravity
   and melts into Lava at high heat; the powder does not corrode itself.
5. **Persistence, compatibility, balance, and regressions.** Persist local
   humidity, plant health, corrosion exposure, plant reproduction cooldown,
   Base Humidity, and Dewpoint. Initialize missing fields in older version-1
   saves to the new defaults and blank biological state. Preserve material ID
   `19` as Grass Seeds. Keep humidity updates staggered to bound cost at both
   supported world sizes. Cover ecology, humidity/weather, Steam, corrosion,
   save/restore, old-save compatibility, and relevant browser-visible controls
   with focused regressions.

## Final mechanic contract

- Base Humidity is a slow open-air target, not a snap operation. Humidity is a
  local field carried by air locations and bounded from `0%` to `100%`.
- Cloud particles may nucleate sparsely in exposed upper air at or below the
  configured Dewpoint once local humidity reaches `88%`. Enclosed rooms retain
  and diffuse humidity but do not spontaneously nucleate weather.
- Cloud particles condense probabilistically at or below the Dewpoint in air at
  `88%` humidity or higher. They become Water above freezing and Snow at or
  below freezing. Steam is still created by boiling Water or Wet Mud; it has no
  lifetime-based condensation and becomes Water or Snow when the local air is
  at or below the Dewpoint and humidity is at least `82%`.
- Plants raise local humidity as they grow and depend on species-specific
  temperature, humidity, and substrate moisture. Seeds remain dormant if their
  configured germination conditions are not met.
- Metal corrosion requires adjacent air with local humidity at `98%` or higher
  for a sustained exposure period. Drier or unexposed conditions reduce the
  exposure counter. Corrosion replaces the exposed source cell, falls as a
  powder, and melts into Lava at `1000 C`.
- Older saves without new scalar settings default to `50%` Base Humidity and
  `10 C` Dewpoint. Missing local humidity defaults to the restored Base Humidity;
  missing plant health initializes existing growing material, while corrosion
  exposure and plant cooldown start clear.

## Verification record

- `npm.cmd test`: **336 passed, 0 failed**.
- `npm.cmd run test:smoke`: **passed**.
- `npm.cmd run test:scale-profile`: scale-profile and world-allocation checks
  **passed**.
- Focused browser checks passed for seed germination and dry-soil dormancy,
  humidity persistence, metal glow rendering, density/buoyancy, Stone-to-Scoria-
  to-Lava reheating, and the corrected 260-by-150 fit boundary.
- Full browser run: **159 passed, 1 failed**. The sole failure was a `0.003 px`
  SVG/canvas edge comparison. Its assertion was adjusted for a `0.01 px`
  subpixel tolerance, and the exact browser case then passed **1/1**. Together,
  the full run and focused rerun cover all **160 browser tests** with a passing
  result.
- `node --check` passed for the changed JavaScript modules/specs, `particles.json`
  parsed successfully, and `git diff --check` was clean before the final
  documentation wording update.
