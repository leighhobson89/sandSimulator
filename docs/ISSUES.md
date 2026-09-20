# Active issues and improvements

Last reviewed: 20 September 2026. Detailed evidence is in
[`CODE_REVIEW-2026-09-20.md`](CODE_REVIEW-2026-09-20.md).

## Confirmed defects

- [ ] **Headless results can be non-deterministic.** The review observed one
  243/1 physics test run followed by passing reruns; the steam-boundary
  assertion crossed its random tolerance. Introduce a seeded injectable RNG,
  record failed seeds and run deterministic scenarios in CI.

## Code-quality and security improvements

- [ ] Regenerate `package-lock.json`; it lists Express dependencies despite the
  dependency-free manifest and built-in HTTP server.
- [ ] Review the remaining debug and audio scaffolding; legacy save code has
  been removed, and autosave is now a supported user feature.
- [ ] Add a real-browser suite for canvas, CSS, themes, mobile/touch, resize,
  keyboard focus and accessibility. The existing smoke test is a useful
  stand-in DOM test but not visual browser coverage.
- [ ] Split `physics.js` by stable domain boundaries after deterministic tests
  are in place; it is now over 3,000 lines and carries several systems.

Do not archive an item until the underlying implementation and its verification
have changed.
