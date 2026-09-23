# Canvas zoom and edge-pan plan

## Context

The fitted canvas needed a transient enlarged view without changing the
simulation grid, pointer mapping, painting tools, touch behavior, or machine
overlay behavior. Scrolling had to remain a viewport concern: the simulation
must continue while an enlarged canvas is being viewed away from its origin.

## Decisions

- Use four transient zoom levels. Level 1 is the fitted full view; levels 2,
  3, and 4 enlarge the canvas. The implementation uses fitted, 1.5x, 2x, and
  3x stage factors.
- Reserve an unmodified vertical mouse wheel for one-level zoom changes and
  prevent its default vertical scrolling. Preserve horizontal and Shift + wheel
  behavior for native horizontal scrolling where the browser supports it.
- Expose thin scrollbars only for enlarged views, using the active theme's
  scrollbar colors. Above level 1, unmodified arrow keys scroll the viewport;
  focused controls retain their normal arrow-key behavior.
- Add an optional, initially unchecked **Edge pan** checkbox beside Import.
  When enabled, mouse hover near only the outer 5% of a zoomed viewport slowly
  scrolls it. Do not add application-owned drag panning; middle-click remains
  browser-owned/native where supported.
- Show `Zoom: N/4` in a top-right status overlay after each zoom change and fade
  it over one second. Zoom level and scroll offsets are transient view state:
  entering the workspace or reloading resets them to level 1 and the origin,
  and save data does not include them.
- Keep `cellFromEvent()` based on the rendered canvas rectangle so coordinate
  mapping, painting, erasing, touch input, machine overlays, and simulation
  timing remain independent of the viewport.

## Implementation scope

1. Extend `game.js` with fitted dimensions, zoom-level application, viewport
   reset, pointer-anchored zooming, and the transient status overlay lifecycle.
2. Extend `ui.js` with vertical-wheel zoom ownership, keyboard scrolling,
   mouse-only five-percent edge hover panning, and middle-button pass-through.
3. Add the Edge pan control and zoom status markup to `index.html`, cache both
   elements, and add theme-responsive thin scrollbar and overlay styling.
4. Extend `e2e/helpers/canvas.mjs` with viewport metrics and a helper that
   centers a selected grid cell in a scrolled viewport. Add
   `e2e/tools/zoom.spec.mjs` for level bounds, overlay timing, scrollability,
   themes, keyboard guards, mapping, middle-click, simulation continuity,
   reset behavior, machine overlays, and edge-pan gates.
5. Update the active usage, ownership, and E2E maintenance documentation, then
   archive this finalized plan.

## Focused verification

- `npx playwright test e2e/tools/zoom.spec.mjs` — **9 passed**. This focused
  run covers the final zoom behavior, including the one-second overlay fade and
  vertical-wheel-only input.
- Focused compatibility checks for the existing painting and machine placement
  areas were run after the zoom spec; no zoom-related regression was reported.
- JavaScript syntax checks for the changed game, UI, globals, and test-hook
  files passed.
- The full project suite was not run as part of this focused feature handoff.
  This documentation-only stage also ran no tests.

## Review status

Implementation review was completed before focused verification. Review findings
around the Edge pan markup, overlay placement/lifecycle, vertical-wheel
prevention at zoom clamps, and native middle-click behavior were resolved by the
main session. The focused zoom spec then passed 9/9.

## Known limitation

The frontend runtime's `Write`/`apply_patch` permission probe remained denied,
so the frontend specialist could not apply the final markup and related fixes.
The main session applied the missing markup/fixes after the probe and retained
the required review-before-verification order.
