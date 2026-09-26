# Elemental Foundry documentation

This is the index for current reference, maintenance guidance, active issues,
and future work. Historical completion and status snapshots are under the
short [`Archive`](archive/README.md) index and are not current guidance.

## Active References

- [`METALS_GUIDE.md`](METALS_GUIDE.md) - heat and electrical conduction, metal
  uses, melting paths, and Water-contact or saturated-air corrosion.
- [`PLANT_GROWERS_HANDBOOK.md`](PLANT_GROWERS_HANDBOOK.md) - Base Humidity,
  local humidity sources and sinks, seed temperature/humidity/substrate
  requirements, and established plant growing ranges.

The mechanics reference also covers Environment controls and display-only
visualization modes.

- [`PROGRAM_OVERVIEW.md`](PROGRAM_OVERVIEW.md) — architecture, behavior, scope,
  and comparison context.
- [`GAME_MECHANICS.md`](GAME_MECHANICS.md) — material catalogue and glossary
  maintenance, material behavior, machine controls and capacities, Mixer
  recipes and lifecycle rules, two-stage machine placement, zoom-aligned ports,
  Collector intake and sealing, Sprinkler release, save migration, and Tubing
  connections and regression maintenance.
- [`ISSUES.md`](ISSUES.md) — active defects, quality work, and maintenance
  follow-ups.
- [`FUTURE_IDEAS.md`](FUTURE_IDEAS.md) — unfinished product and technical
  roadmap ideas.
- [`proposals/LOGIC_GATES_AND_LIGHTING.md`](proposals/LOGIC_GATES_AND_LIGHTING.md)
  — a not-yet-implemented design proposal for composable electrical logic and
  a local light field that can affect plant growth.
- [`E2E_TEST_PLAN.md`](E2E_TEST_PLAN.md) — current Playwright architecture,
  commands, maintenance contract, regression policy, and next coverage work.
- [`PHYSICS_REFACTOR_AUDIT.md`](PHYSICS_REFACTOR_AUDIT.md) — source-backed
  inventory, contracts, risks, and incremental extraction plan for a possible
  future `physics.js` refactor; it is not implementation authorization.

The repository root [`README.md`](../README.md) remains the user-facing guide
for running and extending the simulator.
