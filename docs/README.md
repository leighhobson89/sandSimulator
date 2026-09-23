# Elemental Foundry documentation

Machine behavior and controls are documented in
[`MACHINE_GLOSSARY.md`](MACHINE_GLOSSARY.md).

Storage-machine collision and intake maintenance is documented in
[`STORAGE_BIN_COLLISION.md`](STORAGE_BIN_COLLISION.md).

Tubing connection, flow-rate, and Vent behavior is documented in
[`TUBING_AND_VENTS.md`](TUBING_AND_VENTS.md).

The material picker is also a maintained in-app glossary; see
[`MATERIAL_GLOSSARY.md`](MATERIAL_GLOSSARY.md) for its source and update rules.

This folder is the current documentation index for Elemental Foundry.

- [`PROGRAM_OVERVIEW.md`](PROGRAM_OVERVIEW.md) — what the simulator is, how it
  works, what it does well and less well, plus comparisons with similar tools.
- [`COMPLETED_FEATURES.md`](COMPLETED_FEATURES.md) — implemented material,
  thermal, weather, biological, electrical, machine and UI features.
- [`FUTURE_IDEAS.md`](FUTURE_IDEAS.md) — a prioritised product and technical
  roadmap.
- [`ISSUES.md`](ISSUES.md) — active findings and maintenance follow-ups only.
- [`E2E_TEST_PLAN.md`](E2E_TEST_PLAN.md) — Playwright architecture, coverage,
  and bug-fix regression policy.
- [`E2E_PROGRESS.md`](E2E_PROGRESS.md) — current E2E migration status and gates.
- Focused Playwright specs are grouped under `e2e/navigation/`, `e2e/tools/`,
  and `e2e/persistence/`; their current 13-test headless/headed status and
  remaining coverage gaps are tracked in `E2E_PROGRESS.md`.
- [`archive/`](archive/) — superseded documentation findings and closed notes.

The repository root [`README.md`](../README.md) remains the user-facing guide
for running and extending the simulator. It documents local minute-by-minute
autosave, Resume Game and portable LZString export/import. This folder keeps
audit material and issue tracking separate from that guide.
