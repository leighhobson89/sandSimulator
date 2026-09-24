Exhaustive Playwright coverage for the blueprint workflow:

- `capture-stamp.spec.mjs` uses real canvas drags and clicks to verify marquee
  selection, copy-to-slot, preview rendering, and stamping at a new location.
- `history.spec.mjs` verifies the session-only undo and redo patch history.
- `lifecycle.spec.mjs` verifies workspace transitions, cancellation, reverse and
  edge selections, field-preserving stamps, clipping, keyboard history, and redo
  invalidation.
- `persistence.spec.mjs` verifies all 24 library slots, slot wrapping, and a
  portable Save/Load round trip through the real Save dialogs.

Run the eight blueprint browser tests headlessly for required verification;
headed runs are optional diagnostics only and are never an acceptance or release
prerequisite. The setup seeds deterministic source cells through the public
browser module boundary, while all user workflow actions remain Playwright
interactions. Lifecycle, field preservation, clipping, history, slot capacity,
and persistence scenarios use the same server, hooks, seed, and test steps.
