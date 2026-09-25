# Plan: Explain clouds and rain in the Plant Growers Handbook

## Goal

Add practical guidance for cloud formation and precipitation to
`docs/PLANT_GROWERS_HANDBOOK.md`, including ways to set up frequent clouds with
rain and clouds that persist without rain.

## Scope

- Add a concise **Clouds and rain** section, using the Environment controls and
  the existing weather rules; do not change simulation behavior or controls.
- Explain that Base Humidity is a slow outside-air target and local humidity
  varies. Water above `0 C`, Steam, Cloud, and plants add nearby humidity;
  exposed Sand and Dry Mud remove it.
- Explain the verified formation conditions: exposed upper air, local humidity
  of at least `88%`, and local air temperature at or below the configured
  Dewpoint. Spontaneous formation is sparse and does not occur in enclosed
  chambers. Formation consumes `12` local humidity points.
- Explain Cloud precipitation: at or below Dewpoint and at least `88%` local
  humidity, each Cloud can precipitate with a `0.012` per-reaction chance.
  Precipitation is Water above `0 C` and Snow at or below `0 C`; it consumes
  `18` local humidity points. Cloud gas can also be placed from the material
  picker and evaporates above `100 C`, adding up to `12` local humidity points.
- Give practical setup examples: raise Base Humidity and set Dewpoint above the
  exposed upper-air temperature for frequent cloud formation and rain; to keep
  visible clouds without precipitation, place Clouds and keep their air warmer
  than Dewpoint or below `88%` local humidity. Note that manually placed Clouds
  still move and may precipitate if condensation conditions are met.
- Link to the detailed weather rules in
  `docs/GAME_MECHANICS.md#7-seeds-plants-humidity-dewpoint-weather-and-corrosion`.

## Verification

- Cross-check every threshold, probability, temperature boundary, source/sink,
  and chamber behavior against `physics.js`, `particles.json`, and the weather
  subsection of `docs/GAME_MECHANICS.md`.
- No suitable automated documentation harness exists. Static prose assertions
  in simulation or browser harnesses would be a poor fit, so use focused manual
  review instead of adding automated checks.
- Manually verify that the section states the `88%` Cloud humidity threshold
  and distinguishes it from Steam's separate `82%` condensation threshold.
- Check that its practical recipes explain both humid air at/below Dewpoint for
  clouds with rain and keeping placed Clouds above Dewpoint or below `88%`
  humidity to avoid precipitation.
- Read the handbook section in context, confirm Base Humidity is distinguished
  from local humidity, and verify the mechanics link target.
- This is a documentation-only change; no simulation tests are needed.
