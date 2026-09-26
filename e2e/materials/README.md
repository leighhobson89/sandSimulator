Exhaustive browser contracts for the material catalog and canvas behavior.

- `catalog.spec.mjs` checks every prepared definition button, category grouping,
  exact IDs/order, hover and keyboard-focus glossary text, and seeded material
  rendering. It checks that Battery, Spark, Spark Dust, Spark Block, Temperature
  Switch, and Humidity Switch are grouped under Electricals, and protects the
  switch particle IDs, internal keys, and `machineSensor*` API/field contract.
  It also verifies Vegetation is the last picker group, starts collapsed, and
  collapses again after a second successful new-game start. Existing vegetation
  and all-definition checks expand the initially hidden group before reading
  its entries. The spec checks Insulation's heat-retaining, non-conductive properties and
  `thermalNetworkRate` participation for metals and powered machines, including
  Tubing's rate and that Insulation remains outside the fast network.
- `rendering.spec.mjs` checks Water painting at an exact mapped cell, prepared
  canvas colors, selected state, and exit from eraser/grabber/blueprint modes.
  Its thermal-color regression checks per-cell glow interpolation for solid
  Copper, Battery, Iron, Fan, Cooler, Tubing, and Heater, with no effect on
  neighboring pixels and unchanged molten gradients.
- `reactions.spec.mjs` checks deterministic settling, phase thresholds, wetting,
  extinguishing, and seed growth outcomes in the real browser loop.

The complete reaction matrix remains in the physics integration tests; browser
specs cover user-observable rendering and reaction outcomes, while the
integration suite covers every rule combination and conservation edge case
without duplicating slow UI setup. Run material browser coverage through the
documented npm wrapper:

```text
npm run test:browser -- e2e/materials --workers=1 --trace=off
```

The solid-metal glow regression can be run on its own through the same wrapper:

```text
npm run test:browser -- e2e/materials/rendering.spec.mjs --workers=1 --trace=off
```

For the 24 September 2026 update, focused simulation selectors passed
`thermal-contracts` 9/9, `thermal-chamber` 16/16, and `thermal-air-faces` 7/7.
The focused rendering wrapper attempt did not reach assertions; cleanup stalled
and was interrupted. No full suite was run for this update.
