# Completed plan: Natural atmosphere and Water-contact rust

## Delivered behavior

- Open-air temperature now follows a smooth linear profile centered on Air
  Temperature. The top is `7.5 C` cooler and the surface is `7.5 C` warmer,
  for a fixed `15 C` top-to-surface difference. A one-row world uses the
  Air Temperature value; independent per-particle temperature variation
  remains.
- The Layers toggle and Layer Strength slider, their UI setup, and the layer
  setter/getter APIs and mutable state were removed. New saves omit
  `layerLapse` and `airLayersOn`; restore ignores either legacy version-1 field
  without a version bump.
- Environment controls were reflowed around Breeze, General Wind and Gust
  Strength, Air Temperature, Humidity, and Dew Point.
- Rust exposure is shared by the existing per-cell counter for non-machine
  metal definitions only. Cardinally adjacent Water or adjacent air at local
  humidity of at least `98%` adds `1` once every four simulation frames. A
  check without either condition removes `2`. At `120` exposure, the source
  metal cell becomes Corrosion powder. Machine definitions, including storage
  bins, are excluded even when their bodies are metal-flagged. Molten forms do
  not accumulate this exposure.
- The player-facing Metals Guide covers heat versus electrical conduction,
  Copper/Battery/Iron/Tubing uses, metal-bodied machine uses, melt and supported
  return paths, and rust. It explicitly excludes machine bodies and storage
  bins from the rust rule, and is linked from `docs/README.md` and the root
  README's **Metals and power** section.
- Current references were updated in the root README, `docs/GAME_MECHANICS.md`,
  `docs/PROGRAM_OVERVIEW.md`, `docs/PHYSICS_REFACTOR_AUDIT.md`, and
  `e2e/physics/README.md`. The Plant Growers Handbook's weather section remains
  intact.

## Regression coverage and verification status

- `tools/simTest.mjs` contains reusable
  `runNaturalAtmosphereProfileRegression()` and
  `runSealedWaterContactCorrosionRegression()` checks. The profile checks
  monotonic cooling, top/surface offsets, the `15 C` span, mid-height reference,
  one-row handling, capture omission of the removed settings, and restoring a
  legacy save with the old layer fields. The corrosion check compares sealed
  cardinal Water contact at low humidity with a sealed dry control. Both helpers
  are used by the normal simulation path and a focused `--focus` branch.
- Run the focused simulation coverage with
  `npm.cmd test -- --focus=atmosphere-corrosion`; it passed all `18/18` checks.
- `tools/smokeTest.mjs` contains checks that the removed controls are absent
  and the natural profile remains active. A prior `npm.cmd run test:smoke`
  attempt stopped at a duplicate `getWorld` import syntax error before
  assertions; the duplicate import has since been removed, but Smoke was not
  rerun.
- `e2e/tools/environment.spec.mjs` and
  `e2e/tools/edge-cases.spec.mjs` cover the revised Environment controls and
  layout, including narrow viewports and removed-control absence. The
  catalog spec's Stainless Steel checks are recorded in the Stainless Steel
  plan.
