Browser regressions for the fixed canvas feedback panel and live hover details.

- `hover.spec.mjs` checks the non-scrolling footer, preserved FPS/particle
  readout, outside-canvas clearing, fixed height at desktop and narrow sizes,
  and the canvas layout's 10px height allowance for the footer. Empty-air hover
  reports temperature, humidity, and wind speed. Particle hover reports the
  catalog section, temperature, humidity, definition-driven transitions, and
  numeric received illumination. Machine hover checks live input/output state.
  Battery hover checks its relocated charge indicator, connected circuit load,
  five-second trend, elapsed-time ETA, and charge-state colors.
- `illumination.spec.mjs` covers the world-grid field and API, powered Lamp
  falloff and zoom independence, Fire/Lava/Scoria intensity and tint, Fire from
  Oil/Wood, Gunpowder's dark fuse and four-tick flash, overlap/clamping, blocker and
  transmission rules, world-edge clipping, stale-field cleanup, Normal-view
  rendering, transparent no-light compositing, hover readings, and derived
  state after Save/Load and blueprint stamping.

Run the feedback regression through the repository wrapper:

```text
npm run test:browser -- e2e/feedback --workers=1 --trace=off
```

The Playwright configuration starts the local server automatically. Keep
browser-visible feedback assertions here rather than in the deterministic
physics harness.
