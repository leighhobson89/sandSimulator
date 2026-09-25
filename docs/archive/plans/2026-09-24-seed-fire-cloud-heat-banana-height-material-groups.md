# Seed fire, cloud heat, banana height, and material groups

## Goal

Give all seeds working ignition behavior, including burning Lily Seeds at
4000 C; make hot clouds evaporate, raise the full-grown Banana Plant height by
about 75%, document how humidity and plants affect growing conditions, and make
each Materials catalog group collapsible from its header.

## Implementation scope

- Add ignition settings for all seed definitions so seeds burn into Fire; cover
  Water Grass / Lily Seeds burning at 4000 C.
- Give Cloud a high-temperature evaporation threshold; each evaporation adds up
  to 12 humidity points locally, capped at 100%.
- Scale Banana Plant's growth-height range from 8–18 to about 14–32 cells,
  increasing both endpoints by approximately 75%.
- Add `docs/PLANT_GROWERS_HANDBOOK.md` with the Base Humidity control, local
  humidity sources and sinks, and each seed's germination temperature,
  humidity, and substrate requirements. Link it from `docs/GAME_MECHANICS.md`.
- Render each Materials group heading as an accessible toggle with a right-side
  arrow, `aria-expanded`, and `aria-controls`; style open and collapsed states.

## Changed areas

Changes are in `particles.json`, `physics.js`, `ui.js`, `styles.css`,
`docs/GAME_MECHANICS.md`, and `docs/PLANT_GROWERS_HANDBOOK.md`, with focused
simulation and browser regressions in the test files listed below.

## Verification scope

Focused simulation checks cover hot Lily Seed ignition, Cloud evaporation, and
Banana Plant maximum height. A focused Materials catalog browser spec covers
collapse, expand, and accessibility state. The full suite was not run.

## Test plan

- In `tools/simTest.mjs` under `--focus=ecology-climate`, verify Water Grass /
  Lily Seeds at 4000 C leave the seed type and produce Fire, Cloud at 4000 C
  evaporates, and Banana Plant `growHeight` is at least
  `ceil(18 × 1.75) = 32` cells.
- Also assert every prepared `isSeed` definition has a finite ignition point
  and burns into Fire. After one Cloud evaporation frame with base and local
  humidity starting at zero, verify the Cloud's local humidity is within
  11.99–12.01 (12 points, allowing for the pre-evaporation humidity update).
- In `e2e/materials/catalog.spec.mjs`, iterate every `.panel-heading` and check
  its accessible toggle starts expanded, Enter collapses it with
  `aria-expanded="false"` and a hidden grid, and Space expands it with
  `aria-expanded="true"` and a visible grid.
- Every prepared seed definition is checked for a finite ignition point and
  Fire as its burn result. The Cloud humidity assertion accepts `11.99–12.01`
  after one evaporation frame because the humidity source update runs before
  evaporation.
- Focused commands used: `npm.cmd test -- --focus=ecology-climate`,
  `npm.cmd run test:smoke`, and
  `npm.cmd run test:browser -- e2e/materials/catalog.spec.mjs --workers=1 --trace=off`.

## Verification record

- `npm.cmd test -- --focus=ecology-climate`: **passed, 5/5**.
- `npm.cmd run test:smoke`: **passed** after adapting the existing fake DOM APIs
  for the accessible Materials group toggles.
