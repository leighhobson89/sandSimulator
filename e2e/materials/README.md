Exhaustive browser contracts for the material catalog and canvas behavior.

- `catalog.spec.mjs` checks every prepared definition button, category grouping,
  exact IDs/order, hover and keyboard-focus glossary text, and seeded material
  rendering.
- `rendering.spec.mjs` checks Water painting at an exact mapped cell, prepared
  canvas colors, selected state, and exit from eraser/grabber/blueprint modes.
- `reactions.spec.mjs` checks deterministic settling, phase thresholds, wetting,
  extinguishing, and seed growth outcomes in the real browser loop.

The complete reaction matrix remains in the headless physics integration tests;
browser specs cover user-observable rendering and reaction outcomes, while the
integration suite covers every rule combination and conservation edge case
without duplicating slow UI setup. Run the 11 material browser tests headlessly
for required verification. Headed runs are optional diagnostics only and are
never an acceptance or release prerequisite.
