# Fix Browser Regression Failures

## Goal

Resolve the reproducible browser regressions found while running the E2E suite, while preserving the existing keyboard, layout, and save migration behavior.

## Findings and scope

1. **Catalog accordion keyboard activation.** The global Space shortcut in `ui.js` handles Space while a native button is focused. That prevents the browser's native button activation behavior, so a catalog group accordion cannot be toggled with Space. Adjust the shortcut's focus handling so native controls retain their expected keyboard behavior, and cover Space activation of a catalog group. Keep the workspace Space shortcut working when focus is not on a native control.
2. **Narrow environment layout overflow.** At a 390 px viewport, the dual wind control in `styles.css` makes `#environmentSection.scrollWidth` exceed its client width. Adjust the narrow layout so the environment section fits without horizontal overflow. Keep the dual controls usable and retain the existing row ordering and control behavior.
3. **Legacy wind-pair migration assertion.** The migration check in `e2e/persistence/export-import.spec.mjs` calls the low-level `restoreSavePayload` function directly, then checks UI values that are stale because the UI load/render flow was bypassed. Correct the regression coverage by exercising the normal UI load flow, or remove only the stale DOM assertion. Keep assertions that legacy wind values migrate semantically to the calibrated `{ general: 50, gust: 50 }` pair and that current saves restore their saved pair.

The New Game timeouts were limited to the 520 x 300 world starts and subsequent save work. `GamePage.newGame()` and `e2e/scaling/default-world.spec.mjs` now use 120-second test and page timeouts for those starts; standard-size starts keep the normal timeout.

## Implementation outline

- Update the global Space-key handling in `ui.js` so focused native buttons can use their built-in Space activation. Preserve the global pause/play behavior for the intended non-control focus context.
- Update the narrow-viewport rules in `styles.css` for the Environment dual wind controls. Keep both wind controls inside the section's available width.
- Update the persistence regression in `e2e/persistence/export-import.spec.mjs` to follow the supported load path when checking UI state, or limit direct restore assertions to semantic state and omit stale UI values.
- Preserve unrelated behavior. No save format or migration semantics should change.

## Focused verification

Run the affected browser specs through the repository npm wrapper with one worker:

```text
npm run test:browser -- e2e/materials/catalog.spec.mjs --workers=1 --trace=off
npm run test:browser -- e2e/tools/environment.spec.mjs --workers=1 --trace=off
npm run test:browser -- e2e/persistence/export-import.spec.mjs --workers=1 --trace=off
```

Confirm that the new keyboard regression verifies both accordion activation and preservation of the workspace Space shortcut. Confirm the narrow viewport assertion passes and the dual wind controls remain accessible. Confirm persistence coverage checks the migrated pair and any UI assertion only after an actual UI load. The 520 x 300 start/save cases use 120-second timeouts as recorded in `docs/E2E_TEST_PLAN.md`.

## Regression tests and baseline results

The focused catalog and persistence runs cover these cases:

- Pressing Space on a focused catalog group button toggles its expanded state.
- Space handling on a focused native button does not get intercepted by the global shortcut, while the workspace pause/play shortcut remains covered.
- Legacy wind settings loaded through the UI migrate to `{ general: 50, gust: 50 }`; current saves continue to restore their saved pair.

Before implementation, the focused catalog and persistence specs ran 16 tests: 14 passed and 2 failed. Both failures were the catalog Space-key behaviors. The updated legacy wind migration case using the UI Load flow passed.

The narrow viewport overflow was also independently reproduced in the earlier one-worker materials/environment/zoom run: the Environment section width assertion failed at 390 px. The zoom spec passed when run serially. The Environment layout regression has since been fixed and is covered by the final browser suite.

## Implementation and final verification

- The global Space shortcut now leaves native button activation to the browser. Catalog group buttons toggle with Space, and the workspace pause/play shortcut remains covered.
- The narrow Environment layout now fits the 390 px viewport without horizontal section overflow.
- The legacy wind-pair persistence regression follows the UI Load flow and verifies both migrated semantic values and the current-save round-trip.
- The 520 x 300 startup and save scenarios use 120-second test/page timeouts, scoped to those large-world cases.

Final verification completed on 25 September 2026:

- Full browser suite: 173/173 passed with 6 workers.
- Full `npm.cmd test`: 369/369 passed.
- Focused machine placement and persistence specs: 9/9 passed with one worker.
- Focused Fan scale harness: 3/3 passed.

## Documentation follow-up

`docs/GAME_MECHANICS.md`, `docs/E2E_TEST_PLAN.md`, and `e2e/machines/README.md` were updated for the completed behavior and coverage. This finalized plan is archived under `docs/archive/plans/2026-09-25-fix-browser-regressions.md`.
