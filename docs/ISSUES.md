# Active issues and improvements

Last reviewed: 25 September 2026.

## Confirmed defects

None currently recorded. Mixer workflows are covered by seeded physics tests
and real-browser tests, including late recipes, accumulation, release and
mixed-output exclusivity.

## Code-quality and security improvements

- [ ] Split `physics.js` by stable domain boundaries after deterministic tests
  are in place; it is 4,691 lines and carries several systems. The source-backed
  follow-up audit is in [`PHYSICS_REFACTOR_AUDIT.md`](PHYSICS_REFACTOR_AUDIT.md).

- [ ] Add broader manual device and assistive-technology checks as the UI grows.
  On 25 September, `npm.cmd test` passed 371 checks, smoke passed 59 checks,
  scale-profile and world-allocation checks passed, and the focused machine
  browser suite passed 23 tests. A full browser run passed 191 tests and had
  one 30-second timeout in the v1 Sprinkler migration test. After raising that
  test's timeout to 60 seconds, its focused rerun passed in 35.5 seconds; the
  full browser suite was not rerun after this adjustment. The later QMODE
  palette catalog regression passed 8/8. This follow-up remains supplementary
  to the functional-area E2E matrix.

Do not archive an item until the underlying implementation and its verification
have changed.
