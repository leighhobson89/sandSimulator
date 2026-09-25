# Fixed world sizes and camera plan

## Context

The fitted 260×150 world needed a second selectable size while keeping startup
usable on small viewports. The larger canvas also needed predictable framing,
bounded navigation, and persistence through existing v1 saves without saving
camera position.

## Decisions

- Offer exactly two fixed New Game choices: 260×150 and 520×300. Keep 260×150
  selected by default.
- Make the 520×300 choice available only when the usable `#canvasArea` content
  box is at least 260×150 CSS pixels. The threshold is based on usable content
  dimensions, not the outer dialog or viewport.
- Start the standard world at zoom 1 of its original four levels. Start the
  520×300 world at level 3 of six: it has two dynamic zoom-out levels, with the
  widest fitting the world vertically, and three zoom-in levels.
- Center new worlds horizontally and align them to the bottom of the viewport.
  Clamp scroll offsets at the world's left, right, and bottom boundaries.
- Preserve the selected world size through v1 save, resume, and import using
  the saved simulation dimensions. Keep zoom and scroll state transient.
- Keep 1040×600 as a physics profiler synthetic case only. A 780×450 browser
  world was tried and removed after a focused Start Game action exceeded
  10 seconds.

## Implementation scope

1. Add the New Game size chooser and hide the larger option until the usable
   canvas area reaches the minimum CSS dimensions.
2. Create the selected fixed dimensions safely, align the new world at the
   ground, and initialize its horizontal framing.
3. Retain the original four zoom levels for 260×150 and give 520×300 its
   initial level and six-level zoom path with dynamic lower levels. Keep camera
   bounds clamped across scrolling and zoom changes.
4. Use the existing v1 simulation dimensions in resume/import flow so either
   size restores correctly. Preserve replacement/cancellation behavior.
5. Extend focused chooser, viewport, and persistence coverage. Update active
   docs and archive this finalized plan after verification.

## Focused verification

- The focused headless browser work confirmed 38 unique cases across multiple
  runs, not in a single 38-case run. The first run passed 35/38; the two
  below-threshold visibility cases and the edge-pan case were the remaining
  failures. A separate focused run passed five gate/edge cases after the CSS
  hidden-rule and edge-pan fixes.
- JavaScript syntax and diff checks passed. No full suite was run.
- The 520×300 physics-only profile recorded a 27.535 ms average and 37.675 ms
  p95 on the profiling machine. This is machine-specific diagnostic timing,
  excludes rendering, and is not a 60-fps guarantee. The focused browser Start
  Game action for 780×450 exceeded 10 seconds, so that option was removed.

## Review status

Implementation and the focused fixes were reviewed before the docs handoff.
The final focused gate/edge cases passed after the initial visibility and
edge-pan failures were addressed. No claim is made that all 38 cases passed in
one run or that a full suite was executed.
