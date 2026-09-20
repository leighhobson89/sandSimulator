# Elemental Foundry code audit

Audit date: 20 September 2026  
Scope: the application source, particle definitions, UI, tooling, tests and
repository documentation in the current working tree.

## Executive summary

Elemental Foundry is a browser-based falling-sand simulation with a headless
physics core. The current data file defines 45 material and tool entries:

| Group | Entries |
|---|---:|
| Powders | 11 |
| Liquids | 4 |
| Gases | 4 |
| Solids | 15 |
| Metals | 7 |
| Machines | 1 |
| Tools | 3 |

The simulator currently exposes six visual themes, a 150-row world, heat and
state changes, flowing liquids, gases, fire, weather, plants, lilies, snow,
gunpowder, electrical pulses, Aluminum charge storage, conductive power grids,
Spark Dust and the longer-lived Spark Block. Spark Block lasts five times the
Dust lifetime, becomes Dust in its final tenth and Dust expires into Ash. The
Machines section currently contains Fan, a one-cell directional wind machine
with a fixed 30x30 SVG face, eight cardinal/diagonal orientations and a
strength-21, 28-cell airflow cone whose residual air decelerates beyond the
cone.

No confirmed functional regression was found in this audit. The full headless
suite and browser-oriented smoke suite both pass. The remaining findings are
repository-maintenance gaps, recorded in [`ISSUES.md`](ISSUES.md).

## Architecture review

| Area | Current implementation | Status |
|---|---|---|
| Particle data | `particles.json` is the source of material names, categories, colors, movement, heat, reactions, electrical properties and lifetimes. | Healthy |
| Simulation core | `physics.js` uses flat typed arrays and a bottom-up frame loop. Heat diffusion, radiation, movement, reactions, liquids, gases, plants, wind and electrical state are kept outside the DOM. | Healthy |
| Electrical model | Conductivity, temporary pulses, connected Aluminum reservoirs, battery indicators and grid consumption are separate from thermal conductivity. Copper draws 1 and Iron 0.5 per cell, with a 100× discharge scale. | Healthy |
| Rendering and loop | `game.js` owns the canvas, frame scheduling, drawing, hover state and charge indicator. | Healthy |
| Controls and layout | `ui.js`, `index.html` and `styles.css` provide material selection, drawing modes, tools, weather controls, themes and responsive workspace layout. | Healthy |
| Theme and persistence | `themes.js` applies six themes and stores the selected theme under the Elemental Foundry key. `saveLoadGame.js` handles simulation saves. | Healthy |
| Test tooling | `tools/simTest.mjs` covers physics and performance; `tools/smokeTest.mjs` exercises startup and UI behavior through a stand-in browser environment. | Passing |

## Behavior coverage checked

The test suite covers conservation and movement, water leveling and infiltration,
heat transfer, melting, freezing, boiling, fire, lava/scoria/stone, gases,
wind and breeze, plants and lilies, snow, seeds, gunpowder, metals, electrical
pulses, Aluminum charge sharing and discharge, Spark Dust, Spark Block lifetime,
liquid suppression around spark sources, Fan activation, its 28-cell reach,
residual-air deceleration and eight-way orientation, Copper/Iron two-cell
machine reach, plus the UI controls exercised by the smoke test.

The audit also corrected documentation drift found in the source data:

- the project now reports 45 entries rather than 36;
- the configured starting ambient temperature is 8°C rather than 20°C;
- seed buoyancy is 10% rather than two in five;
- the product is now named Elemental Foundry throughout the application.

## Verification outcome

All commands below were run from the repository root on the audit date.

| Check | Outcome |
|---|---|
| `npm test` | **244 passed, 0 failed** |
| `node tools/smokeTest.mjs` | **Passed**: startup, 45 material buttons, seven groups, canvas rendering, Fan placement/orientation, drawing tools, themes, charge rendering, temperature and breeze controls all passed |
| `node --check physics.js` | Passed |
| `node --check tools/simTest.mjs` | Passed |
| JSON parse of `particles.json` | Passed |
| `git diff --check` | No whitespace errors; Git only reported existing line-ending normalization warnings |

The performance assertion in the headless suite also passed: a full 260×150
world remained within the test's 8 ms/frame budget on the audit run.

## Audit boundary

This is a source and automated-behavior audit, not a replacement for a visual
browser acceptance pass across every theme and screen size. The smoke test uses
a stand-in browser environment so it can run without launching a real browser.
That limitation is kept as an active maintenance note rather than presented as
a physics defect.
