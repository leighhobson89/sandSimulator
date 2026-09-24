# Active issues and improvements

Last reviewed: 24 September 2026.

## Confirmed defects

None currently recorded. Mixer workflows are covered by seeded physics tests
and real-browser tests, including late recipes, accumulation, release and
mixed-output exclusivity.

## Code-quality and security improvements

- [ ] Split `physics.js` by stable domain boundaries after deterministic tests
  are in place; it is 4,691 lines and carries several systems. The source-backed
  follow-up audit is in [`PHYSICS_REFACTOR_AUDIT.md`](PHYSICS_REFACTOR_AUDIT.md).

- [ ] Add broader manual device and assistive-technology checks as the UI grows.
  A prior discovery snapshot listed 137 browser tests in 34 files covering
  mouse, touch, themes, focus, rendered canvas mapping, dialogs, keyboard state,
  persistence, machines, blueprints, physics, and Mixer workflows. An earlier
  full run passed 121 tests. A later authorized run recorded 268 passed and 21
  failed in `npm test`; its browser run was 144/151 before focused fixes, with
  the remaining failures in physics. The middle-click picker, scale profile,
  fixed-world chooser/camera, and accessibility/contract areas have focused
  verification. No full-suite rerun is recorded. This follow-up is
  supplementary to the functional-area E2E matrix.

Do not archive an item until the underlying implementation and its verification
have changed.
