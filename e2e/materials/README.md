Exhaustive browser contracts for the material catalog and canvas behavior.

- `catalog.spec.mjs` checks every prepared definition button, category grouping,
  exact IDs/order, hover and keyboard-focus glossary text, and representative
  seeded material rendering.
- `rendering.spec.mjs` checks Water painting at an exact mapped cell, prepared
  canvas colors, selected state, and exit from eraser/grabber/blueprint modes.
- `reactions.spec.mjs` checks deterministic settling, phase thresholds, wetting,
  extinguishing, and seed growth outcomes in the real browser loop.

The complete reaction matrix remains in the headless physics integration tests;
browser specs cover the user-observable rendering and representative outcomes,
while the integration suite covers every rule combination and conservation
edge case without duplicating slow UI setup. The area is complete only when the
focused material specs pass once with the default headless configuration and
once with `npx playwright test e2e/materials --headed`, using the same server,
hooks, seed, and test steps.
