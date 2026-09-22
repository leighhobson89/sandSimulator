# Active issues and improvements

Last reviewed: 22 September 2026.

## Confirmed defects

None currently recorded. Mixer workflows are covered by seeded physics tests
and real-browser tests, including late recipes, accumulation, release and
mixed-output exclusivity.

## Code-quality and security improvements

- [ ] Split `physics.js` by stable domain boundaries after deterministic tests
  are in place; it is now over 3,000 lines and carries several systems.

- [ ] Expand the real-browser matrix with additional viewport sizes and manual
  assistive-technology checks as the UI grows. The current suite covers mouse,
  touch, themes, focus, narrow layouts and mixer workflows.

Do not archive an item until the underlying implementation and its verification
have changed.
