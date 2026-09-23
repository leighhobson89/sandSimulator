# Middle-click material picker

## Inspected baseline and decisions

- In this checkout, the behavior is already implemented in `ui.js`: `setUpCanvasInput()` (`mousedown`, around lines 1644–1665) prevents the middle-button default, stops edge pan, checks drawing/tool eligibility, bounds-checks the mapped cell, ignores ID 0 or undefined materials, and calls `selectParticleType(type)` for a valid material. The handler also prevents middle `auxclick`; `mouseup` ignores button 1.
- Reuse `selectParticleType()` (around lines 804–815) rather than setting selection directly. It synchronizes the selected ID and `.selected` picker button through `highlightSelectedParticle()` (around lines 955–960), and keeps the eraser button class/state consistent. Eraser-active clicks are ineligible and must preserve the active eraser rather than select anything.
- Eligibility is exactly a drawing mode (`brush`, `line`, `rectangle`, or `ellipse`) with Grabber, eraser, blueprint marquee/stamp, and selected-machine placement inactive. `hasBlueprintMode()` covers `marqueeMode` and `activeBlueprintSlot`; merely viewing the Blueprints workspace is not itself an active canvas tool. An ineligible click must not change selection, world/tool state, or viewport position.
- The supplied description of the zoom test is stale for this checkout: `e2e/tools/zoom.spec.mjs` currently has `middle click samples after viewport scroll without panning the zoomed canvas` (line 140), not an inert-click test. It already checks sampling, selected-button state, `mousedown`/`auxclick` default prevention, and unchanged scroll offsets. Do not change this to inert behavior.
- Existing E2E coverage also includes all four eligible drawing modes and empty-cell no-op in `e2e/tools/painting.spec.mjs`, ineligible eraser/Grabber/machine cases there, and marquee/stamp no-op cases in `e2e/blueprints/lifecycle.spec.mjs`. Audit for gaps before adding duplicate cases.

## Ordered implementation and verification

1. **`test-engineer` — audit and close regression gaps first.** Keep the existing positive sampling and mode-guard coverage in `e2e/tools/painting.spec.mjs`, `e2e/tools/zoom.spec.mjs`, and `e2e/blueprints/lifecycle.spec.mjs`. Add only missing assertions, especially that a valid pick synchronizes the selected button without changing the sampled world cell, an empty cell preserves the prior selection, pending Line, Rectangle, and Ellipse gestures are canceled without committing, and rejected modes preserve their selection and active tool state. Retain zoom/scroll and native-default assertions; ensure the test names describe sampling rather than inert behavior.

2. **`frontend-specialist` — verify/fix the canvas path in `ui.js`.** Keep the middle-button branch ahead of normal painting/tool dispatch. Always call `preventDefault()` and stop edge pan for button 1; also prevent button-1 `auxclick` so browser autoscroll is suppressed. Apply the explicit drawing-mode/tool guard before sampling; use existing `cellFromEvent()`, `getWorld()`, and `index()` with world bounds and a positive, defined material ID. On a valid sample call `selectParticleType(type)` so picker highlighting and eraser controls follow the existing selection path. On all rejected/empty/out-of-range cases return without selection or world mutation. Preserve the middle-button `mouseup` early return and all other mouse behavior. The inspected source already follows this contract; avoid duplicating or broadening it unless a regression exposes a gap.

3. **Focused verification and review.** Review that allowed clicks only change the selected material, rejected clicks do not change the world or active mode, and neither app edge-pan nor browser autoscroll moves the viewport. Run the three affected functional areas:

   ```sh
   npm run test:browser -- e2e/tools/painting.spec.mjs e2e/tools/zoom.spec.mjs e2e/blueprints/lifecycle.spec.mjs
   ```

   This focused run passed 21/21. The current Playwright inventory is 135; the last full run remains 121, and no full suite was run for this change. Fix failures and rerun this focused command. Do not run a full suite without the user's approval (`AGENTS.md`).

4. **`docs-specialist` — update after implementation, review, and focused tests pass.** In `README.md`, replace the browser-owned middle-click row with the eligible-mode picker behavior, empty-cell behavior, no-op tool modes, and no-pan/autoscroll guarantee. Add the interaction contract to the tools summary in `docs/PROGRAM_OVERVIEW.md`; update the zoom/input coverage description in `docs/E2E_TEST_PLAN.md`; and update `e2e/tools/README.md` to describe the sampling and eligibility coverage. Its current inventory says five specs/19 tests, while this checkout has six tool specs and 32 test declarations; correct the inventory to the final verified counts. Do not claim a full-suite pass based on focused results, and do not change unrelated mechanics or persistence documentation.

5. **Archive after implementation.** Preserve this finalized plan in `docs/archive/plans/middle-click-material-picker-2026-09-23.md` and add it to the Executed Plans list in `docs/archive/README.md`, as required by `AGENTS.md`.

## Acceptance cases

- In Brush, Line, Rectangle, and Ellipse modes, middle-clicking an in-bounds non-empty defined material selects that material and highlights its picker button without painting, erasing, or otherwise changing world cells.
- Empty ID 0, invalid/out-of-bounds cells, and missing definitions leave the selected material unchanged. Empty remains unselectable because picker buttons exist only for definition IDs at least 1.
- Eraser, Grabber, selected-machine placement, marquee, and active blueprint stamping reject the pick; selection, world, active mode, and relevant eraser/Grabber/blueprint controls remain unchanged.
- Middle-click does not commit a pending Line, Rectangle, or Ellipse gesture, and follows the picker’s existing gesture-cancellation behavior when a valid material selection changes.
- At zoom above level 1 and after scrolling, the mapped cell is sampled while both scroll offsets remain unchanged. Button-1 `mousedown` and `auxclick` defaults are prevented; middle click never pans.
- Existing left-click painting, right-click erasing, picker-button selection, blueprint interactions, zoom, keyboard scrolling, and optional edge pan remain unchanged.
