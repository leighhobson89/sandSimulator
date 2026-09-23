# E2E Progress

## Summary

The browser migration is complete. The current Playwright source of truth is the
`e2e/` tree, and `playwright.config.mjs` discovers only `e2e/**/*.spec.mjs`.
The inventory contains 121 browser tests across all fifteen functional areas.
The full suite passes in both accepted modes:

```text
npx playwright test --workers=1 --trace=off
npx playwright test --headed --workers=1 --trace=off
```

The same verification records `npm test` passing 284/284 assertions with
default seed `0` and `npm run test:smoke` passing. All 15/15 functional areas
are migrated, complete, and green. The current documentation describes this
tree; [`archive/`](archive/) contains dated historical snapshots and is not the
current source of truth.

| Status | Meaning |
| --- | --- |
| 🟢 Green | Area is implemented, migrated, complete, and passing in the current E2E structure |

## Functional Areas

| # | Functional area | Status | Completed | Current coverage |
| ---: | --- | :---: | :---: | --- |
| 1 | Application startup, menu, New Game, Resume Game, and screen transitions | 🟢 | Yes | `e2e/navigation/menu.spec.mjs` and persistence choice/resume specs cover startup, import, New Game, Resume Game, pause transitions, confirmations, cancellation, and reset. |
| 2 | Theme selection, theme persistence, and accessible selected state | 🟢 | Yes | `e2e/navigation/themes.spec.mjs` covers all six themes, menu/toolbar synchronization, persisted selection, invalid stored values, and accessible selected state. |
| 3 | Canvas sizing, desktop layout, pixelated rendering, and canvas mapping | 🟢 | Yes | `e2e/helpers/contract.spec.mjs` covers rendered canvas dimensions, one-pixel-per-cell rendering, pixelation, resize, fractional CSS scaling, viewport mapping, bounds, and exact cell centers. |
| 4 | Material catalog generation, selection, tooltips, and material metadata | 🟢 | Yes | The 11 tests in `e2e/materials/` cover every prepared definition, grouping/order/IDs, generated glossary metadata, hover/focus, selection, rendering, tool exit, settling, phase changes, wetting, extinguishing, and growth. |
| 5 | Brush painting, repeated paint timer, eraser/right-click, and keyboard tools | 🟢 | Yes | `e2e/tools/painting.spec.mjs` and `edge-cases.spec.mjs` cover mapped painting, repeated gestures, timer release, erasing, keyboard shortcuts, brush-size bounds, mode exclusivity, and reset behavior. |
| 6 | Line, rectangle, ellipse, brush-size, and shape preview/commit behavior | 🟢 | Yes | `e2e/tools/shapes.spec.mjs` and `edge-cases.spec.mjs` cover all shape commits, previews, cancellation paths, brush sizing, occupied cells, clipping, and release boundaries. |
| 7 | Grabber pickup, movement, cancellation, and drop behavior | 🟢 | Yes | `e2e/tools/grabber.spec.mjs` and `edge-cases.spec.mjs` cover pickup, exact movement, size bounds, empty/blocked and edge drops, cancel/restore, and clean mode exit. |
| 8 | Environment controls: air temperature, layers, lapse, breeze, wind strength, heat view, and readouts | 🟢 | Yes | `e2e/tools/environment.spec.mjs` and `edge-cases.spec.mjs` cover values, bounds, dependencies, reset, wind gestures, breeze, heat rendering, keyboard toggles, and readouts. |
| 9 | Cellular physics: gravity/settling, collision/blocking, liquid flow, gas/fire rise, conservation, and temperature integration | 🟢 | Yes | The 16 cellular tests in `e2e/physics/` cover deterministic stepping, snapshots, settling, collision/blocking, liquid levels and boundaries, gas movement, thermal integration, insulation, phase paths, and environmental temperature. |
| 10 | Material reactions: phase changes, burning, extinguishing, growth, and decay/residue | 🟢 | Yes | Physics and material reaction specs cover quenching, fire, phase changes, growth/rejection, drying, corrosion/toxic gas, snow, gunpowder, decay, wetting, and residue; exhaustive rule combinations remain owned by `npm test`. |
| 11 | Electrical systems: batteries, conductors, charge, pulses, and powered machines | 🟢 | Yes | The six tests in `e2e/machines/electrical.spec.mjs` cover Spark absorption, pulse traversal/expiry, connected charge sharing, Copper/Iron discharge, powered Fan boundaries, invalid gaps, and electrical reset. |
| 12 | Machines and tubing: placement/orientation, heaters/coolers/fans, storage, vents, tubing flow, and mixer inventories/release | 🟢 | Yes | The 30 tests in `e2e/machines/` cover every machine family, previews, eight directions, dialogs, powered effects, storage, Vent/tubing topology and rates, Mixer recipes, non-mixing streams, and portable persistence. |
| 13 | Blueprints: marquee selection, copy, preview/stamp, slot library, undo/redo | 🟢 | Yes | The eight tests in `e2e/blueprints/` cover lifecycle, reverse/edge clipping, field-preserving stamps, air overwrite, preview, 24-slot wrapping, keyboard history, redo invalidation, and portable persistence. |
| 14 | Save/export/import, validation errors, autosave, resume choice, and clear | 🟢 | Yes | The 11 tests in `e2e/persistence/` cover semantic round trips, dialog state, malformed/empty/unsupported data, autosave/resume, New Game and Import Yes/No/Cancel choices, clear confirmation, and saved-state boundaries. |
| 15 | Desktop keyboard accessibility, dialogs, focus, ARIA state, and tooltips | 🟢 | Yes | The six tests in `e2e/accessibility/`, together with navigation and tool assertions, cover names, focus, modal semantics, keyboard activation, pressed/selected ARIA state, and material/tool descriptions. |

## Completed Deliverables

| Deliverable | Status | Completed | Summary |
| --- | :---: | :---: | --- |
| Full codebase E2E audit | 🟢 | Yes | Recorded in `docs/E2E_TEST_PLAN.md`; current inventory is 121 tests. |
| Functional-area taxonomy | 🟢 | Yes | Fifteen areas derived from the application code and mapped to current specs. |
| Playwright configuration | 🟢 | Yes | Only `e2e/**/*.spec.mjs` is discovered; headed mode, retries, traces, screenshots, video, and reports are configured. |
| E2E source tree | 🟢 | Yes | Current functional-area folders, accessibility specs, persistence choices, helpers, and diagnostics are under `e2e/`. |
| Canvas mapping helper | 🟢 | Yes | `e2e/helpers/canvas.mjs` maps CSS points using rendered `getBoundingClientRect()` dimensions; the guarded adapter exposes matching `canvasToCell()`. |
| Deterministic game-loop control | 🟢 | Yes | `?e2e` suppresses automatic RAF scheduling; `step(count)` runs exact physics ticks and renders once. |
| Deterministic random seed control | 🟢 | Yes | The E2E adapter exposes the seeded PRNG and active seed. |
| Test-only state inspection | 🟢 | Yes | Guarded `window.__GAME_INSTANCE__` returns copied state and supports snapshot/restore. |
| Failure diagnostics | 🟢 | Yes | Playwright retains trace/screenshot/video on failure and the diagnostics helper attaches screenshot and state JSON. |

## Completed Migration

`e2e/helpers/contract.spec.mjs` now owns helper behavior, including rendered
canvas mapping, deterministic seed/step behavior, and copied snapshot restore
semantics. The former `e2e/baseline.spec.mjs`, `tests/browser.spec.mjs`, and its
six snapshots were removed. No current documentation depends on those paths.

Blueprint, material, machine, navigation, tool, accessibility, persistence,
electrical, physics, reaction, and helper workflows now live in their current
functional-area folders. User actions use Playwright; deterministic physics
setup is limited to source fixtures and state inspection. Non-user-visible
material and rule matrices remain in the headless integration suite without
reducing the browser-area status.

## Focused Physics Contract

The `e2e/physics/` folder contains 24 tests: four determinism tests, six
settling tests, six thermal tests, and eight reaction tests. It passes in both
headless and headed modes using the same server, hooks, seed, and steps. The
browser specs cover user-visible physics contracts, while `npm test` retains
the exhaustive non-UI material, conservation, and rule-combination matrices.

## Coverage Policy

A green area means exhaustive behavioral coverage of its current user-visible
surface: controls, dialogs, rendering, persistence fields, normal and alternate
paths, validation/cancellation branches, boundaries, and reset behavior. Real
Playwright workflows cover user actions, deterministic physics setup is used
only for fixtures, and integration tests retain non-user-visible rule matrices.
Every current area has passed both full-suite commands above with failure
diagnostics enabled. See section 5 of `E2E_TEST_PLAN.md` for the detailed
checklist.

## Bug-Fix Regression Policy

Whenever a bug is found and fixed, add a focused regression test to the
appropriate functional-area spec or to `e2e/regressions/` when it has no
established owner. Keep the regression scenario discoverable and use the shared
helpers and deterministic diagnostics.

## Migration Gates

All migration gates are satisfied: every area has current focused specs, the
pre-migration coverage decision is recorded, the full suite passes with
`npx playwright test --workers=1 --trace=off` and
`npx playwright test --headed --workers=1 --trace=off`, and failures retain
screenshots, traces, video, and state JSON. Both runs use the same server,
hooks, seed, and test steps. Dated historical snapshots remain under
`docs/archive/` for audit context only.
