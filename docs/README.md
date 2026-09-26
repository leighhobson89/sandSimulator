# Elemental Foundry documentation

This is the index for current reference, maintenance guidance, active issues,
and future work. Historical completion and status snapshots are under the
short [`Archive`](archive/README.md) index and are not current guidance.

## Active References

The consolidated mechanics reference includes the former metal and plant
guides, with material tables and practical setup advice maintained beside the
corresponding implemented rules. It also covers canvas feedback and the
Electricals/LOGIC catalog behavior. Environment controls and display-only
visualization modes are documented there as well.

- [`PROGRAM_OVERVIEW.md`](PROGRAM_OVERVIEW.md) — architecture, behavior, scope,
  and comparison context.
- [`GAME_MECHANICS.md`](GAME_MECHANICS.md) — material catalogue and glossary
  maintenance, former metal and plant guides, material behavior, live hover
  feedback, logic gates and Battery diagnostics, machine controls and
  capacities, Mixer recipes and lifecycle rules, port contact geometry,
  Collector intake and sealing, Sprinkler release, save migration, and Tubing
  connections and regression maintenance.
- [`ISSUES.md`](ISSUES.md) — active defects, quality work, and maintenance
  follow-ups.
- [`FUTURE_IDEAS.md`](FUTURE_IDEAS.md) — unfinished product and technical
  roadmap ideas.
- [`proposals/LOGIC_GATES_AND_LIGHTING.md`](proposals/LOGIC_GATES_AND_LIGHTING.md)
  — implemented gate and local illumination behavior, with future proposals
  for light-responsive plants and additional emitters.
- [`E2E_TEST_PLAN.md`](E2E_TEST_PLAN.md) — current Playwright architecture,
  commands, maintenance contract, regression policy, and next coverage work.
- [`PHYSICS_REFACTOR_AUDIT.md`](PHYSICS_REFACTOR_AUDIT.md) — source-backed
  inventory, contracts, risks, and incremental extraction plan for a possible
  future `physics.js` refactor; it is not implementation authorization.

The repository root [`README.md`](../README.md) remains the user-facing guide
for running and extending the simulator.
