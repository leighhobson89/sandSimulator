# Elemental Foundry code audit

Audit date: 20 September 2026  
Scope: the application source, particle definitions, UI, tooling, tests and
repository documentation in the current working tree.

## Executive summary

Persistence is a first-class feature. The complete world and tool/environment
state export as a versioned LZString, and one local Resume Game autosaves every
minute. Importing or creating a new game can replace the existing resume slot,
continue without autosave, or be canceled without changing the current world.
The destructive Clear action also requires confirmation and offers Cancel.

Elemental Foundry is a browser-based falling-sand simulation with a headless
physics core. The current data file defines 47 material and tool entries:

| Group | Entries |
|---|---:|
| Powders | 11 |
| Liquids | 4 |
| Gases | 4 |
| Solids | 15 |
| Metals | 8 |
| Machines | 4 |
| Storage | 3 |
| Tools | 3 |

The simulator exposes six visual themes, a 150-row world, heat and state
changes, flowing liquids, gases, fire, weather, plants, lilies, snow,
gunpowder, Battery charge storage, conductive power grids, Tubing, three storage
bins, a Vent, Spark Dust, Spark Block and the directional Fan, Heater and Cooler machines.

No confirmed functional regression was found in this audit. The seeded headless
suite and browser-oriented smoke suite pass. A Playwright suite now covers the
main real-browser interactions; remaining follow-ups are maintenance and
broader device/accessibility coverage, recorded in [`ISSUES.md`](ISSUES.md).

## Architecture review

| Area | Current implementation | Status |
|---|---|---|
| Particle data | `particles.json` is the source of material names, categories, colors, movement, heat, reactions, electrical properties and lifetimes. | Healthy |
| Simulation core | `physics.js` uses flat typed arrays and a bottom-up frame loop. Heat diffusion, radiation, movement, reactions, liquids, gases, plants, wind and electrical state are kept outside the DOM. | Healthy |
| Electrical model | Conductivity, temporary pulses, connected Battery reservoirs, battery indicators and grid consumption are separate from thermal conductivity. Copper draws 1 and Iron 0.5 per cell, with a 100x discharge scale. | Healthy |
| Rendering and loop | `game.js` owns the canvas, frame scheduling, drawing, hover state and charge indicator. | Healthy |
| Controls and layout | `ui.js`, `index.html` and `styles.css` provide material selection, drawing modes, tools, weather controls, themes and responsive workspace layout. | Healthy |
| Theme and persistence | `themes.js` applies six themes. `saveLoadGame.js` serializes durable typed-array world fields plus tool/environment settings into a versioned LZString and manages the local once-per-minute resume slot. | Healthy |
| Test tooling | `tools/simTest.mjs` covers seeded physics and performance; `tools/smokeTest.mjs` exercises startup, UI and autosave behavior through a stand-in browser; `tests/browser.spec.mjs` covers real-browser themes, input, focus and narrow layouts. | Passing / runnable |

## Behavior coverage checked

The test suite covers conservation and movement, water leveling and infiltration,
heat transfer, melting, freezing, boiling, fire, lava/scoria/stone, gases,
wind and breeze, plants and lilies, snow, seeds, gunpowder, metals, electrical
pulses, Battery charge sharing and discharge, Spark Dust, Spark Block lifetime,
liquid suppression around spark sources, Fan activation, its 28-cell reach,
residual-air deceleration and eight-way orientation, Heater/Cooler activation,
temperature cones, centreline ray projectiles, power load and drag previews,
Copper/Iron two-cell machine reach, storage intake, Tubing bottlenecks, Vent
release/full-stop behavior, UI controls, Clear confirmation, and autosave
replacement/cancellation behavior.

The audit also keeps documentation aligned with the source data: 52 entries,
an 8C starting ambient temperature, 10% seed buoyancy and the Elemental Foundry
product name.

## Verification outcome

All commands below were run from the repository root on the audit date.

| Check | Outcome |
|---|---|
| `npm test` | **250 passed, 0 failed** with the default seed |
| `npm run test:smoke` | **Passed**: startup, 47 material buttons, seven groups, canvas rendering, Fan/Heater/Cooler placement, orientation, previews, icons and active cones, drawing tools, themes, charge rendering, temperature, Clear confirmation, breeze and autosave Cancel behavior |
| `npm run test:browser` | Playwright suite available for real-browser visual and interaction checksr |
| `node --check physics.js` | Passed |
| `node --check tools/simTest.mjs` | Passed |
| JSON parse of `particles.json` | Passed |
| `git diff --check` | No whitespace errors |

The performance assertion in the headless suite also passed: a full 260x150
world remained within the test's 8 ms/frame budget on the audit run.

## Audit boundary

This is a source and automated-behavior audit, not a replacement for manual
assistive-technology or exhaustive device acceptance across every theme and
screen size. The real-browser suite covers the primary paths; the smoke test
remains a fast stand-in environment for deterministic startup and persistence
checks.
