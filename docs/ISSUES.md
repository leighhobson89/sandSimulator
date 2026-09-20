# Active issues and improvements

Last reviewed: 20 September 2026. Detailed evidence is in
[`CODE_REVIEW-2026-09-20.md`](CODE_REVIEW-2026-09-20.md).

## Confirmed defects

None currently recorded. The physics suite now uses a reproducible seed and
prints it with every failed assertion, so a future regression can be replayed.

## Code-quality and security improvements

- [ ] Split `physics.js` by stable domain boundaries after deterministic tests
  are in place; it is now over 3,000 lines and carries several systems.

- [ ] Expand the real-browser matrix with additional viewport sizes and manual
  assistive-technology checks as the UI grows. The initial Playwright suite
  covers the core mouse, touch, theme, focus and narrow-layout paths.

Do not archive an item until the underlying implementation and its verification
have changed.
