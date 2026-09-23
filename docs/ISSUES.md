# Active issues and improvements

Last reviewed: 23 September 2026.

## Confirmed defects

None currently recorded. Mixer workflows are covered by seeded physics tests
and real-browser tests, including late recipes, accumulation, release and
mixed-output exclusivity.

## Code-quality and security improvements

- [ ] Split `physics.js` by stable domain boundaries after deterministic tests
  are in place; it is now over 3,000 lines and carries several systems.

- [ ] Add broader manual device and assistive-technology checks as the UI grows.
  The current source discovers 135 browser tests covering mouse, touch, themes,
  focus, rendered canvas mapping, dialogs, keyboard state, persistence, machines,
  blueprints, physics, and Mixer workflows. The last full run covered 121 tests;
  the middle-click picker changes have only focused verification so far. This
  follow-up is supplementary to the functional-area E2E matrix.

Do not archive an item until the underlying implementation and its verification
have changed.
