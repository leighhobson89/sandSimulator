Exhaustive Playwright coverage for the blueprint workflow:

- `capture-stamp.spec.mjs` uses real canvas drags and clicks to verify marquee
  selection, copy-to-slot, preview rendering, and stamping at a new location.
- `history.spec.mjs` verifies the session-only undo and redo patch history.
- `lifecycle.spec.mjs` verifies workspace transitions, cancellation, reverse and
  edge selections, field-preserving stamps, clipping, keyboard history, and redo
  invalidation.
- `persistence.spec.mjs` verifies all 24 library slots, slot wrapping, and a
  portable export/import round trip through the real Save dialogs.

The setup seeds deterministic source cells through the public browser module
boundary, while all user workflow actions remain Playwright interactions. The
area is complete only when lifecycle, field preservation, clipping, history,
slot capacity, and persistence scenarios pass once with the default headless
configuration and once with `npx playwright test e2e/blueprints --headed`, using
the same server, hooks, seed, and test steps.
