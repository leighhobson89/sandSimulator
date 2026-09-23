# Active issues and improvements

Last reviewed: 23 September 2026.

## Confirmed defects

None currently recorded. Mixer workflows are covered by seeded physics tests
and real-browser tests, including late recipes, accumulation, release and
mixed-output exclusivity.

## Code-quality and security improvements

- [ ] Split `physics.js` by stable domain boundaries after deterministic tests
  are in place; it is 4,691 lines and carries several systems. The source-backed
  follow-up audit is in [`PHYSICS_REFACTOR_AUDIT.md`](PHYSICS_REFACTOR_AUDIT.md).

- [ ] Add broader manual device and assistive-technology checks as the UI grows.
  The current source discovers 137 browser tests in 34 files covering mouse, touch, themes,
  focus, rendered canvas mapping, dialogs, keyboard state, persistence, machines,
  blueprints, physics, and Mixer workflows. The last full run covered 121 tests;
  the middle-click picker and scale-profile changes have focused verification,
  but the current inventory has not been run as a full suite. This follow-up is
  supplementary to the functional-area E2E matrix.

Do not archive an item until the underlying implementation and its verification
have changed.
