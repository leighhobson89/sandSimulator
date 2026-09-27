# Debug performance menu and simulation bypasses

## Goal

Add a small runtime-only debug panel for isolating the cost and behavior of
local illumination, world ambient illumination, humidity simulation, and
electricity. The menu changes only the selected subsystem behavior; it does
not reset the world or add debug state to world saves.

## Menu interaction

- The panel is closed by default and toggles with `event.code ===
  'NumpadSubtract'`.
- Include a close button and support `Escape` to close the panel.
- Ignore the shortcut while a text-entry control is focused and ignore key
  repeats. The shortcut must not interfere with typing into settings or dialogs.
- Provide four feature switches, all enabled by default: `localLight`,
  `worldIllumination`, `humidity`, and `electricity`.
- These switches are runtime-only and are not part of world saves. Changing a
  switch takes effect without clearing or resetting the world, except for the
  explicitly described electrical charge reset.

## Switch behavior

| Flag | Enabled behavior | Disabled behavior |
| --- | --- | --- |
| `localLight` | Build and use local emitter and explosion-flash fields. | Skip local emitter/flash field builds, clear cached local intensity and tint, and hide or clear the local-light overlay. Ambient illumination remains available. |
| `worldIllumination` | Build ambient illumination from visibility, reflection, and gas-ray rules. | `getIlluminationAt` supplies the Ambient Light slider value uniformly as ambient contribution. Leave the expensive ambient array unused, without rewriting the grid when the slider changes; skip sky visibility, reflection, and gas-ray work. Local emitters can still add light. |
| `humidity` | Run per-cell humidity diffusion and local humidity exchange. | Make humidity queries and visualization use `getHumidityAt` and return the Environment slider value uniformly. Reset the humidity field to the slider on disable, slider adjustment, and re-enable; skip diffusion, local exchange, and cloud nucleation. |
| `electricity` | Run electrical refresh, pulse aging, network/load traversal, charge transfer, logical signals, Battery Spark charging, wire tint, and wire animation. | Stop electrical work and render sampling. On disable, clear power, logical-power, gate-output, pulse-delay, and Battery-charge planes once. Batteries retain material identity and thermal behavior but have no electrical or storage behavior. Re-enabling leaves Batteries empty and rebuilds electrical state. Power-consuming actuators use their always-powered fallback; gates, switches, and signal sensors remain inactive. |

### Subsystem interactions

- Local source light and world ambient illumination are independent. With local
  light disabled, the ambient field still affects effective illumination. With
  world illumination disabled, the ambient value is the slider value, while
  local emitters can still contribute if `localLight` is enabled.
- Humidity-dependent queries, sensors, feedback, visualizations, and reactions
  read the uniform slider value while humidity is disabled. The humidity field
  itself is not diffused or locally exchanged, and cloud nucleation does not
  run as it is part of the skipped update.
- With electricity disabled, power-consuming actuators behave as if powered.
  Gates, switches, and signal sensors remain electrically inactive because
  their wires carry no signal. A Battery keeps its material identity and
  thermal behavior; the override removes its charge storage and electrical
  functions.
- The existing **No wire sparks** preference remains an animation-only
  control: it hides moving bolts while powered wires remain yellow. Disabling
  `electricity` additionally removes power, wire tint, and wire animation.
  Re-enabling electricity respects the current **No wire sparks** preference.
- Toggling a flag does not reset simulation time, particles, machines, or
  environment settings. Cache invalidation and the one-time power-plane clear
  are limited to the affected subsystem.

## Likely implementation areas

- `index.html`, `constantsAndGlobalVars.js`, `ui.js`, and `styles.css`: debug
  panel structure, runtime flag defaults, keyboard handling, accessibility,
  and visible states.
- `physics.js`: local/world illumination bypasses, humidity fallback and
  update bypass, and electrical bypass/charge reset/rebuild lifecycle.
- `game.js`: suppress or clear local-light and electrical render layers while
  their corresponding flags are disabled.
- `tools/simTest.mjs`: deterministic checks of simulation fallback values,
  bypassed side effects, and re-enable behavior.
- Browser coverage under `e2e/` for hotkey focus/repeat handling, panel
  controls, visible overlays, and no-world-reset behavior.
- Update `docs/GAME_MECHANICS.md`, `docs/E2E_TEST_PLAN.md`, and
  `e2e/machines/README.md` after implementation and verification.

## Focused verification scope

The implementation is complete. The focused coverage below records the
intended behavior, but no test suites were added or run for this change. Only
code syntax and whitespace checks were performed, so automated behavior remains
unverified.

- **Menu:** Numpad-minus opens/closes the panel; the close button and Escape
  close it; repeats do not toggle repeatedly; focused text inputs retain the
  key; changing switches does not reset the world.
- **Local light:** With `localLight` off, Lamps and explosion flashes stop
  contributing and cached tint/intensity and overlay are cleared. Ambient
  illumination remains effective.
- **World illumination:** With `worldIllumination` off, reads return the slider
  uniformly and visibility/reflection/gas-ray calculations are bypassed;
  enabled local sources still contribute.
- **Humidity:** With `humidity` off, air reads, humidity sensors, feedback, and
  visualization all use the slider value; diffusion, local exchange, and
  cloud nucleation stop. Dewpoint and other humidity-dependent rules use the
  same uniform value.
- **Electricity:** Disabling clears Battery charge and power planes once; Spark
  cannot charge a Battery; wires lose logical power, tint, and animation; gates,
  switches, and signal sensors do not emit powered output; actuators remain
  active. Re-enabling starts Batteries empty and rebuilds electrical state.
- **Interactions:** Verify the existing **No wire sparks** option remains
  animation-only, local and ambient light bypasses remain independent, and
  environment slider values remain readable when their simulation is disabled.

Run only the focused simulation and browser areas for these regressions. Do not
run the full test suite without explicit user authorization.

## Acceptance criteria

- The menu obeys the hotkey, close, Escape, focus, and key-repeat behavior
  above; the four enabled-by-default flags are runtime-only and reset on page
  reload.
- Each disabled subsystem follows its bypass semantics, including clearing
  local light cache/overlay and clearing electrical charge/power state only
  once on disable.
- Light and humidity feature flags compose as described; electricity-off
  behavior preserves Battery identity/thermal behavior and fails actuators on
  while leaving signal-dependent devices inactive.
- `docs/GAME_MECHANICS.md` describes the implemented behavior. Automated
  acceptance remains unverified because focused simulation and browser suites
  were neither added nor run.
