# E2E Progress

## Summary

The E2E audit, baseline architecture, helper contract coverage, blueprint
migration, and expanded machine/material browser contracts are complete for the
areas currently under migration. The Playwright suite continues incrementally
into the functional-area folders using the production deterministic test
adapter (`window.__GAME_INSTANCE__`).

**Overall status:** Helpers, blueprints, material catalog/rendering, and the
machines/tubing browser contract are complete under the exhaustive area policy.
The separate cellular-physics/material-reaction matrix remains integration-led
and is still amber until its broader browser scenarios are migrated. Three of
15 functional areas are complete (20%).

The baseline contract passes against the real served application. Mobile and
narrow-viewport coverage is intentionally out of scope because this is a
desktop-only web application. The original `npm run test:smoke` suite remains
fully passing.

| Status | Meaning |
| --- | --- |
| 🟢 Green | Area is implemented, migrated, and passing in the new E2E structure |
| 🟡 Amber | Area is partially covered, has legacy coverage, or is blocked by planned hooks |
| 🔴 Red | Area has no migrated E2E coverage yet |

## Functional Areas

| # | Functional area | Status | Completed | Summary / next action |
| ---: | --- | :---: | :---: | --- |
| 1 | Application startup, menu, New Game, Resume Game, and screen transitions | 🟡 | No | Existing legacy browser coverage; migrate to `e2e/navigation/menu.spec.mjs`. |
| 2 | Theme selection, theme persistence, and accessible selected state | 🟡 | No | Existing theme browser coverage; migrate to `e2e/navigation/themes.spec.mjs`. |
| 3 | Canvas sizing, desktop layout, pixelated rendering, and canvas mapping | 🟡 | No | Baseline canvas helper and production mapping adapter exist; focused canvas/layout coverage remains. |
| 4 | Material catalog generation, selection, tooltips, and material metadata | 🟢 | Yes | All prepared definition buttons are checked for IDs, order/count, generated tooltip metadata, hover/focus behavior, selection state, category rendering, tool exit behavior, and representative canvas colors in `e2e/materials/`. |
| 5 | Brush painting, repeated paint timer, eraser/right-click, and keyboard tools | 🟡 | No | Existing basic browser coverage; migrate to `e2e/tools/painting.spec.mjs`. |
| 6 | Line, rectangle, ellipse, brush-size, and shape preview/commit behavior | 🟡 | No | Smoke coverage exists; add real Playwright migration in `e2e/tools/shapes.spec.mjs`. |
| 7 | Grabber pickup, movement, cancellation, and drop behavior | 🟡 | No | Smoke coverage exists; migrate to `e2e/tools/grabber.spec.mjs`. |
| 8 | Environment controls: air temperature, layers, lapse, breeze, wind strength, heat view, and readouts | 🟡 | No | Smoke coverage exists; migrate to `e2e/tools/environment.spec.mjs`. |
| 9 | Cellular physics: gravity/settling, collision/blocking, liquid flow, gas/fire rise, conservation, and temperature integration | 🟡 | No | Headless integration coverage is strong; add representative user-driven E2E after deterministic stepping hook. |
| 10 | Material reactions: phase changes, burning, extinguishing, growth, and decay/residue | 🟡 | No | Headless integration coverage is strong; retain detailed matrix at integration level and add smoke E2E. |
| 11 | Electrical systems: batteries, conductors, charge, pulses, and powered machines | 🟡 | No | Headless integration coverage exists; add representative browser workflows after hook migration. |
| 12 | Machines and tubing: placement/orientation, heaters/coolers/fans, storage, vents, tubing flow, and mixer inventories/release | 🟢 | Yes | Placement previews/blocked cells/all eight directions, powered Fan/Heater/Cooler, settings bounds, all storage dialogs/purge/capacity/intake, Vent release/rate limits, tubing topology/rates/visualization/storage transfer, all recipes/non-mixing output, and portable machine persistence in `e2e/machines/`. |
| 13 | Blueprints: marquee selection, copy, preview/stamp, slot library, undo/redo | 🟢 | Yes | Lifecycle, reverse/edge clipping, all persisted blueprint fields, air overwrite, preview, 24-slot wrap, keyboard history, redo invalidation, and portable export/import in `e2e/blueprints/`. |
| 14 | Save/export/import, validation errors, autosave, resume choice, and clear | 🟡 | No | Export/import and clear have legacy/smoke coverage; migrate to `e2e/persistence/`. |
| 15 | Desktop keyboard accessibility, dialogs, focus, ARIA state, and tooltips | 🟡 | No | Existing browser coverage for focus, ARIA, and tooltips; migrate to navigation/tools. Mobile and narrow viewport behavior are out of scope. |

## Baseline Deliverables

| Deliverable | Status | Completed | Summary |
| --- | :---: | :---: | --- |
| Full codebase E2E audit | 🟢 | Yes | Recorded in `docs/E2E_TEST_PLAN.md`. |
| Functional-area taxonomy | 🟢 | Yes | Fifteen areas derived from the application code. |
| Playwright config diagnostics | 🟢 | Yes | Headed override, CI retries, traces, screenshots, videos, and HTML report configured. |
| E2E folder skeleton | 🟢 | Yes | Functional-area folders, reusable helpers, and baseline contract spec created under `e2e/`. |
| Canvas mapping helper | 🟢 | Yes | `e2e/helpers/canvas.mjs` maps CSS coordinates to cell centers; the guarded adapter exposes matching `canvasToCell()`. |
| Deterministic game-loop control | 🟢 | Yes | `?e2e` suppresses automatic RAF scheduling; `step(count)` runs exact physics ticks and renders once. |
| Deterministic random seed control | 🟢 | Yes | E2E adapter exposes the existing seeded PRNG and active seed. |
| Test-only state inspection | 🟢 | Yes | Guarded `window.__GAME_INSTANCE__` returns copied state and supports snapshot/restore. |
| Failure snapshots and state dumps | 🟢 | Yes | Playwright retains trace/screenshot/video; diagnostics helper attaches screenshot and state JSON on failed baseline tests. |

## Completed Migration: Helpers and Blueprints

The helper contract previously lived implicitly in `e2e/baseline.spec.mjs` and
the shared helper modules. It is now explicitly covered by
`e2e/helpers/contract.spec.mjs`, including CSS-to-cell mapping, deterministic
seed/step behavior, and copied snapshot restore semantics. The baseline spec is
retained because it remains the cross-area harness smoke contract.

Blueprint browser coverage was new rather than a mechanical move: the suite
now drives the real app through Playwright for marquee selection, slot copy,
preview, stamping, and undo/redo. Deterministic cell setup is kept at the
physics module boundary so the tests focus on the user workflow. The expanded
suite also covers reverse/edge clipping, all blueprint fields, 24-slot wrapping,
keyboard history, redo invalidation, and portable export/import. No old
blueprint browser tests were removed because none existed.

## Completed Migration: Materials and Representative Machines

Material coverage now verifies catalog category grouping, every prepared
definition button, accessible selection, keyboard focus and tooltip behavior,
material metadata, representative rendering, exact canvas placement, settling,
phase thresholds, wetting, extinguishing, and seed growth. The exhaustive
reaction matrix remains in the headless integration suite because it is not a
distinct browser interaction contract.

Machine coverage now verifies every machine family through real placement and
dialogs, all Fan orientations and setting bounds, powered machine effects,
storage intake/capacity/purge, Vent release/rate controls, tubing topology,
bottleneck rates, flow visualization, storage transfer, all Mixer recipes and
non-mixing streams, and portable persistence. Fixtures seed machine inventory at
the physics boundary while placement, dialogs, toggles, tooltips, and canvas
interaction remain real UI workflows.

## Exhaustive Coverage Policy

The migration now treats a green area as exhaustive behavioral coverage, not
representative smoke coverage. Before changing an area to green, enumerate its
controls, dialogs, rendering, persistence fields, normal and alternate paths,
validation/cancellation branches, boundary conditions, and reset behavior. Use
real Playwright workflows for user actions, deterministic physics setup only for
fixtures, and keep non-user-visible rule matrices in integration tests. Each
focused area must pass both headless and headed runs with useful failure
diagnostics. See the full checklist in section 5 of `E2E_TEST_PLAN.md`.

## Migration Gates

An area may be marked green only when its focused spec files exist in the new
folder, the old coverage decision is recorded, the focused specs pass once with
the default headless configuration and once with
`npx playwright test <focused-spec-path> --headed`, and failures retain useful
screenshots/traces/state JSON. Both runs use the same server, hooks, seed, and
test steps.
Material catalog/rendering, machines/tubing, and blueprints/helpers are green
only after their expanded focused suites pass in both modes. The separate
cellular-physics/material-reaction area remains amber where its browser contract
is still narrower than the full integration matrix.
