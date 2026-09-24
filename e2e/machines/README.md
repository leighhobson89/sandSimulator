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
  Mixer inputs through portable Save/Load.

Run the 30 machine browser tests headlessly for required verification; headed
runs are optional diagnostics only and are never an acceptance or release
prerequisite. The physics boundary seeds inventory for deterministic setup; UI
placement, dialogs, toggles, tooltips, and canvas interaction use Playwright.
Engine-level flow-rate and reaction matrices remain in `tools/simTest.mjs`; they
are not duplicated as slow browser tests when no additional user-visible
contract exists.
