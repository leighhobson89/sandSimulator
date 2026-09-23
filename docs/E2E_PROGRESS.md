# E2E Progress

## Summary

The E2E audit and baseline architecture are complete. The Playwright suite has
not yet been migrated into the proposed functional-area folders, and the
production deterministic test adapter (`window.__GAME_INSTANCE__`) is not yet
implemented. The next phase is migration, beginning with navigation and shell
workflows.

**Overall status:** Baseline complete; 0 of 15 functional areas migrated (0%).

The baseline contract passes against the real served application. The legacy
browser suite has one pre-existing 9-pixel narrow-layout screenshot mismatch;
the original `npm run test:smoke` suite remains fully passing.

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
| 3 | Canvas sizing, responsive layout, pixelated rendering, and canvas mapping | 🟡 | No | Baseline canvas helper exists; production mapping/test adapter contract remains. |
| 4 | Material catalog generation, selection, tooltips, and material metadata | 🟡 | No | Existing browser and smoke coverage; migrate to `e2e/materials/catalog.spec.mjs`. |
| 5 | Brush painting, repeated paint timer, eraser/right-click, and keyboard tools | 🟡 | No | Existing basic browser coverage; migrate to `e2e/tools/painting.spec.mjs`. |
| 6 | Line, rectangle, ellipse, brush-size, and shape preview/commit behavior | 🟡 | No | Smoke coverage exists; add real Playwright migration in `e2e/tools/shapes.spec.mjs`. |
| 7 | Grabber pickup, movement, cancellation, and drop behavior | 🟡 | No | Smoke coverage exists; migrate to `e2e/tools/grabber.spec.mjs`. |
| 8 | Environment controls: air temperature, layers, lapse, breeze, wind strength, heat view, and readouts | 🟡 | No | Smoke coverage exists; migrate to `e2e/tools/environment.spec.mjs`. |
| 9 | Cellular physics: gravity/settling, collision/blocking, liquid flow, gas/fire rise, conservation, and temperature integration | 🟡 | No | Headless integration coverage is strong; add representative user-driven E2E after deterministic stepping hook. |
| 10 | Material reactions: phase changes, burning, extinguishing, growth, and decay/residue | 🟡 | No | Headless integration coverage is strong; retain detailed matrix at integration level and add smoke E2E. |
| 11 | Electrical systems: batteries, conductors, charge, pulses, and powered machines | 🟡 | No | Headless integration coverage exists; add representative browser workflows after hook migration. |
| 12 | Machines and tubing: placement/orientation, heaters/coolers/fans, storage, vents, tubing flow, and mixer inventories/release | 🟡 | No | Legacy browser mixer/vent coverage and smoke coverage exist; migrate to `e2e/machines/`. |
| 13 | Blueprints: marquee selection, copy, preview/stamp, slot library, undo/redo | 🔴 | No | No migrated E2E spec; implement in `e2e/blueprints/`. |
| 14 | Save/export/import, validation errors, autosave, resume choice, and clear | 🟡 | No | Export/import and clear have legacy/smoke coverage; migrate to `e2e/persistence/`. |
| 15 | Touch input, narrow viewport usability, keyboard accessibility, dialogs, focus, ARIA state, and tooltips | 🟡 | No | Existing browser coverage for touch, focus, ARIA, and tooltips; migrate to `e2e/responsive/` and navigation/tools. |

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

## Migration Gates

An area may be marked green only when its focused spec files exist in the new
folder, the old coverage decision is recorded, the relevant headed and
headless runs pass, and failures retain useful screenshots/traces/state JSON.
