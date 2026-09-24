# Fitted camera and canvas boundaries

## Finalized behavior

- Both the 260×150 and 520×300 worlds start at fitted zoom level 1. All edges
  are visible and the initial view does not scroll.
- The 260×150 zoom factors are `[1, 1.5, 2, 3]`; the 520×300 factors are
  `[1, 2, 3, 4, 6]`.
- The stage is bottom-aligned at start.
- The sides and bottom use the existing 4px brown stroke centered on the canvas
  boundary: left at x=2, right at x=width−2, bottom at y=height.

## Verification record

- `e2e/tools/zoom.spec.mjs`: 14/14 passed headlessly.
- Focused accessibility and contract files: 9/9 passed.
- Scale-profile passed. Smoke passed after correcting its mock canvas geometry.
- The one authorized full run recorded `npm test`: 268 passed and 21 failed.
  The browser run was 144/151 before later focused fixes; the remaining failures
  were in physics. No full-suite rerun is recorded.
- The latest QMODE boundary-stroke geometry edit was not intentionally retested.
- This documentation handoff ran no tests.
