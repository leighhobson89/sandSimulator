Exhaustive browser workflows for machines and material transfer.

- `placement.spec.mjs` checks every machine family, previews, blocked placement,
  all Fan directions, hit testing, settings bounds, and tooltip behavior.
- `powered.spec.mjs` checks powered/unpowered Fan, Heater, and Cooler outcomes.
- `storage.spec.mjs` checks all storage dialogs, categories, intake, capacity,
  type retention, and purge confirmation.
- `tubing-vents.spec.mjs` checks Vent release/rate controls, topology, 10/20/30
  per-second bottlenecks, flow visualization, and storage transfer.
- `mixer.spec.mjs` checks all documented recipes, non-mixing output, purge, and
  release behavior.
- `persistence.spec.mjs` checks machine settings, inventories, tubing, and
  Mixer inputs through portable export/import.

The physics boundary seeds inventory for deterministic setup; UI placement,
dialogs, toggles, tooltips, and canvas interaction use Playwright. The area is
complete only when the focused machine specs pass once with the default
headless configuration and once with
`npx playwright test e2e/machines --headed`, using the same server, hooks, seed,
and test steps. Engine-level flow-rate and reaction matrices remain in
`tools/simTest.mjs`; they are not duplicated as slow browser tests when no
additional user-visible contract exists.
