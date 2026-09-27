# Plan: ambient illumination and plant light response

## Goal

Add a persisted ambient illumination target and species-specific plant light
needs. Plants use the brighter of the ambient target and the existing local
emitter field. Keep the canvas overlay tied only to local emitters, so ambient
light changes plant conditions without washing the world in a full-screen tint.

The completed gate and initial local-light baseline is recorded in the adjacent
[logic-gates and local-illumination plan](2026-09-26-logic-gates-and-local-illumination.md).
Current local-emitter behavior remains documented in
[`GAME_MECHANICS.md`](../../GAME_MECHANICS.md#9-canvas-feedback-and-live-inspection).

## Design

- Add an ambient illumination target on the same `0–100` scale as local light.
  Its default for a new world and for older saves without the setting is `50`.
  Provide `setAmbientIlluminationTarget(value)` and
  `getAmbientIlluminationTarget()` alongside the existing environment APIs.
  Clamp and persist the target in portable saves and normal resume/autosave
  state. Loading an old save without this field restores `50`.
- Maintain a separate derived per-cell `world.ambientIllumination` grid with
  the same indexing as `world.type`; do not save it. For a target at or below
  `10`, fill this grid uniformly with the target. For targets above `10`, use
  geometry: cells with top visibility receive `100%` of the target; cells
  visible from the bottom but not the top receive `50%`; cells visible from
  neither receive fixed ambient intensity `10`.
- For that geometry-based ambient value, trace one deterministic selected
  straight ray. If any gas lies along that ray, attenuate the ambient value by
  `25%` once; multiple gas cells on the selected path do not compound the
  attenuation. Keep this gas attenuation in the ambient field calculation,
  separate from the local emitter field.
- Preserve `world.illumination` as the derived local-emitter field.
  `getIlluminationAt(x, y)` returns effective light as
  `max(world.ambientIllumination[index(x, y)], world.illumination[index(x, y)])`.
  Keep the canvas overlay sampling only `world.illumination`; ambient light
  must not create a rendered glow, tint, or full-world overlay. Existing Lamp,
  Fire, Lava, Scoria, and Gunpowder local contribution and tint behavior remain
  intact.
- Cache the derived ambient grid so it is rebuilt at most once per simulation
  tick. Invalidate it when the ambient target, cell geometry, or gas layout
  changes; avoid per-lookup rebuilding. Rebuild it after world creation, clear,
  restore, or load. The field remains derived and is not persisted.
- Add `plantMinIllumination` and `plantIdealIllumination` to each species
  definition, using these profiles:

  | Species | Minimum | Ideal |
  |---|---:|---:|
  | Moss | 5 | 25 |
  | Grass | 15 | 70 |
  | Daffodil | 15 | 65 |
  | Red Tulip | 20 | 70 |
  | Geranium | 25 | 75 |
  | Blue Flower | 10 | 55 |
  | Banana Plant | 30 | 85 |
  | Water Grass | 10 | 60 |

- Seed germination requires effective light at or above that species' minimum,
  in addition to the existing substrate, temperature, and humidity conditions.
  For established plants, the minimum is the threshold for thriving; plants
  can survive below it down to a floor of `40%` of their species minimum. Below
  that survival floor, existing health/decline behavior should take over.
- Define light fitness as `clamp((effective - minimum) / (ideal - minimum),
  0, 1)`. It rises linearly from minimum to ideal and saturates at `1` above
  ideal. Include light fitness in the existing plant vigor/health calculation
  and scale the existing growth chance by `0.25 + 0.75 * fitness`.
- Add `getPlantEnvironment(x, y)` as a plant inspection query with these flat
  fields for the plant at that location: `temperature`, `minTemperature`,
  `idealTemperature`, `maxTemperature`; `humidity`, `minHumidity`,
  `idealHumidity`, `maxHumidity`; and `illumination`, `minIllumination`,
  `idealIllumination`. The first temperature, humidity, and illumination field
  is the current reading. Temperature and humidity limits/ideals come from the
  plant definition; current values come from the plant's local environment.
  Illumination values are effective light, where `illumination` is the value
  returned by `getIlluminationAt`; there is no maximum-light cap. Keep the
  existing `getPlantHealth` API and its return shape unchanged. Plant hover
  feedback should expose current and ideal readings without duplicating or
  changing the health query.
- Add an Ambient Light slider between Air Temperature and Humidity in the
  Environment controls. Update its displayed value and effective plant queries
  immediately when moved. Ambient light affects plant calculations and the
  numeric effective-light reading only; the local-emitter overlay remains
  source-only.
- Treat ambient light as world environment state. Blueprints preserve the
  placed plant materials and recompute their environment against the active
  ambient grid and local emitters when stamped; they must not serialize a
  stale per-cell ambient or effective-light field.

## Implementation areas

- Environment control markup, element lookup, slider setup/order, and styling:
  `index.html`, `constantsAndGlobalVars.js`, `ui.js`, and `styles.css`.
- Ambient target lifecycle, separate ambient and local derived grids,
  geometry/gas calculation and invalidation/cache, portable/automatic
  persistence and legacy defaults; effective light and `getPlantEnvironment`;
  germination and established plant fitness/health/growth: `physics.js` and its
  existing persistence integration.
- Hover details and source-only rendering checks: `game.js` and the existing
  illumination overlay path. Keep `world.illumination` as the rendered field.
- Add species min/ideal values in the authoritative material definitions,
  currently `particles.json`.
- After implementation and focused verification, update Game Mechanics,
  Future Ideas, the archived initial-light record links, E2E area READMEs, and
  `docs/E2E_TEST_PLAN.md`.

## Performance harness and P0 measurements

- The requested P0 benchmark is an opt-in Playwright suite under
  `performance/`. It covers empty and particle controls, ordinary Spark
  propagation, a charged Battery/Lamp circuit, and the combined case at
  260×150 and 520×300.
- Each fixture uses 10 warm-up and 60 measured samples. It records external
  simulation-step, wind-decay, and render timings plus optional internal
  timings for electrical updates, Spark propagation, Battery load traversal,
  `drawWorld`, machine-overlay rebuilds, and illumination drawing. It records
  median/p95, fixture counts, browser, viewport, host, build, canvas visibility,
  and renderer details.
- The suite does not measure ambient-grid rebuilds or plant-rich scenes. The
  recorded browser used SwiftShader, so GPU/render timings need
  hardware-accelerated follow-up. Results and interpretation are in the
  [P0 performance results report](../reviews/2026-09-26-p0-performance-results.md).
- Run `npm run test:performance` only when a performance-specific test is
  explicitly requested. The suite is excluded from `npm test`, routine
  validation, and the ordinary `npm run test:browser` suite.

## Focused regression scope

- `tools/simTest.mjs`, focused with `npm test -- --focus=plant-illumination`,
  covers the API, default and clamped targets, effective `max(ambient, local)`
  readings, all eight min/ideal profiles, ambient save restoration and the
  legacy `50` fallback, derived-field exclusion from simulation saves, the
  minimum-light thriving and `40%` survival-floor states, health/vigor fitness
  at minimum/intermediate/ideal/above-ideal readings, and quarter/full growth
  chance at minimum/ideal. The current deterministic case does not directly
  test seed germination at and below minimum.
- `e2e/tools/environment.spec.mjs` covers slider `0–100` bounds/default and
  placement between Air Temperature and Humidity, immediate effective
  plant-light updates, brighter local-emitter readings, and ambient-only pixels
  remaining transparent while the source-only overlay stays unchanged as the
  ambient target rises.
- `e2e/persistence/export-import.spec.mjs` adds portable-save round trip and
  legacy fallback coverage, but that browser spec was not included in the final
  focused browser run. The deterministic harness covers target capture, restore,
  the legacy `50` fallback, and exclusion of derived fields.
- `e2e/feedback/hover.spec.mjs` covers current/preferred temperature,
  humidity, and effective-light hover pairs, local emission overriding ambient,
  and ambient `80` overriding a dimmer local value in the plant readout.
- No blueprint-specific plant-light regression is currently authored. By code
  inspection confirmed by the test engineer, `BLUEPRINT_FIELDS` contains
  neither the ambient target nor local/effective illumination; these remain
  world/environment data, not blueprint cell fields. Keep that schema
  unchanged. Blueprint compatibility is an inspection-only check in this
  regression handoff, not a dedicated test.
- Keep alternate visualization palettes, local emitter colors/falloff,
  blockers, and the existing `getPlantHealth` return shape covered as unchanged
  contracts.

The final focused environment and illumination browser run used the documented
npm wrapper:

```text
npm run test:browser -- e2e/tools/environment.spec.mjs e2e/feedback/illumination.spec.mjs --workers=1 --trace=off
```

- The focused plant-illumination simulation regression passed 21/21. The
  environment and illumination browser specs passed 27/27 together and cover
  ambient geometry, top/bottom/occluded values, selected-ray gas attenuation,
  effective max versus local light, transparent ambient-only rendering, and
  cache rebuild behavior.
- The focused P0 performance browser benchmark passed 1/1 and records artifacts
  without timing thresholds. Do not include it in routine test commands; run it
  only for an explicit performance-specific request.

## Acceptance criteria

- New worlds and older saves use ambient target `50`; explicit values round-trip
  through save/load and update live through the correctly ordered slider.
- Every listed species has its specified unique min/ideal values. Germination,
  survival, thriving, health/vigor, and growth chance follow the thresholds and
  formulas above while retaining existing temperature, humidity, and substrate
  rules.
- `getIlluminationAt` reports effective ambient/local light and
  `getPlantEnvironment` exposes actual/ideal readings, while
  `getPlantHealth` retains its existing return contract.
- Ambient light alone creates no canvas glow. Local emitter overlays and their
  current rendering behavior remain unchanged.
- Focused simulation, environment, and illumination regressions pass through
  the documented npm entry points. The portable-save browser spec is authored
  but was not run in the final browser slice; save/restore behavior is covered
  by the deterministic harness. Blueprint field compatibility is confirmed by
  review; this regression set has no dedicated blueprint test.

## Verification status

Implementation and review are complete. The deterministic
`--focus=plant-illumination` run passed 21/21. The focused
`e2e/tools/environment.spec.mjs` and `e2e/feedback/illumination.spec.mjs` run
passed 27/27. The performance-specific `npm run test:performance` run passed
1/1; its ignored JSON/CSV artifacts and analysis are described in the P0 report.
These focused results are not a full test-suite run. The performance suite
remains opt-in and is run only when specifically requested.
