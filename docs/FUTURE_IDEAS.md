# Future ideas and recommended roadmap

These are proposals, not promises. They are ordered to protect reliability
before expanding the sandbox.

## First: make the current product dependable — complete

Completed 20 September 2026:

1. **Deterministic simulation tests.** The physics core accepts an injectable
   random source. `tools/simTest.mjs` runs with a reproducible default seed,
   accepts `--seed=` or `SIM_TEST_SEED`, and includes the seed in failures.
2. **Real-browser visual/accessibility checks.** `tests/browser.spec.mjs`
   covers the six themes, mouse and touch drawing, keyboard focus, and narrow
   layouts. Run it with `npm run test:browser` after installing Chromium with
   `npx playwright install chromium`. The stand-in smoke test remains useful
   for fast startup and persistence checks.
3. **Legacy cleanup and repository hygiene.** Unused audio/debug state was
   removed, `package-lock.json` now matches `package.json`, and generated
   dependencies/test output are excluded by `.gitignore`.

## Next: deepen the existing systems

- Add clear in-app material descriptions, a searchable picker, a reaction
  guide and small starter scenarios. The simulation is now rich enough that
  discovery is the main usability bottleneck.
- Give electricity a model users can reason about: insulators, switches,
  directional diodes, sensors, lamps/heaters, batteries with explicit outputs,
  and overload/short-circuit feedback. Decide whether to remain a gameplay
  pulse system or introduce voltage/resistance deliberately; avoid a confusing
  half-step.
- Add more machines that reuse the power interface: heater/cooler, pump,
  valve, conveyor, sprinkler, pressure source and light.
- Improve environmental feedback: an airflow or power overlay, material
  inspector at the hover cell, chart/readout for temperature and charge, and
  optional pause/single-step/reset-world tools.
- Refine physical rules with user-visible goals: material-specific heat
  capacity, more explicit phase diagrams, smoke opacity, humidity/rain clouds,
  sediment and erosion. Preserve the current game-like clarity rather than
  chasing scientific realism everywhere.

## Broaden creative scope

- Introduce stamps, selection/copy/paste, undo/redo and local galleries. These
  create experimentation loops before the cost of online accounts or moderation.
- Add replayable worlds and an optional share gallery around the existing
  copy/paste LZString save format.
- Offer a documented custom-material schema, then a safe rule API or a curated
  mod format. The existing JSON definitions are a good first step but some
  mechanics still require JavaScript changes.
- Add objectives/tutorials: build a powered fan, grow a lily pond, manage a
  lava flow, make a rain cycle, or keep a plant alive through winter.

## Scale and technical investment

- Profile before changing architecture. At the tested 260x150 grid the core
  meets its 8 ms/frame assertion, so premature GPU work is unnecessary.
- If larger canvases become a product goal, move the simulation to Web Workers
  or WASM and investigate WebGL/WebGPU rendering/compute. Sandspiel is a useful
  reference for Rust/WASM/WebGL; do this only after deterministic regression
  tests establish behavioural equivalence.
- Add a material-definition validator that rejects missing target names,
  impossible values and inconsistent properties before startup.
