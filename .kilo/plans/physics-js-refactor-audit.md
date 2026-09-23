# Physics Core Size and Incremental Refactor Audit

## Purpose and boundary

Audit `physics.js` (currently approximately 4,700 lines) to identify safe,
incremental extraction opportunities and the contracts each would need to
preserve. This document is an audit and future planning input only. It does not
authorize an implementation, broad rewrite, Worker/WASM migration, or GPU work.

## Audit scope

1. **Subsystem inventory**
   - Material-definition compilation and derived lookups.
   - World creation, reset, cell helpers, state capture, and restore.
   - Thermal transfer, radiation, state changes, and material reactions.
   - Plant rooting, growth, lily behavior, and explosions.
   - Electrical connectivity, power pulses, battery charge, and consumption.
   - Liquid surface computation and powder, liquid, and gas movement.
   - Ambient and machine-driven wind, airflow, and projectiles.
   - Machine settings and storage, vents, tubing, and mixers.
2. **Globals and dependency graph**
   - Inventory dimensions, world arrays, definitions, ambient settings, frame
     counter, random source/seed, and feature settings.
   - Inventory module-level caches and scratch structures, including liquid
     surfaces, plant traversal stamps/stacks, storage barriers, tubing-flow
     summaries, wind buffers, and machine flags.
   - Trace read/write dependencies through shared cell helpers and phase calls.
   - Identify direct consumers: `game.js`, `ui.js`, `saveLoadGame.js`,
     `e2eHooks.js`, and headless tools/tests.
3. **Contracts and invariants**
   - Flat `y * cols + x` indexing, cell bounds, typed-array field types, and
     persistent versus transient fields.
   - `stepSimulation()` phase order, alternating scan direction, and moved-cell
     semantics.
   - Seeded random stream and the order/number of random draws.
   - `captureSimulationState()` / `restoreSimulationState()` behavior and save
     format compatibility.
   - DOM-free physics boundary and the public module API consumed by callers.
4. **Incremental extraction candidates**
   - Rank seams by dependency strength and shared mutable state, with evidence
     from the global/dependency inventory.
   - Propose a dependency-ordered sequence of small extractions, naming the
     state/context each boundary would need and which current consumers would
     change.
   - Define stop/go criteria for each stage. Do not select a wholesale rewrite
     or lock in a target architecture before the audit supports it.
5. **Risk assessment**
   - Cover phase-order drift, random-stream changes, aliasing and cache lifetime,
     cyclic imports, typed-array or save compatibility, and browser/headless
     parity.
   - Pair each material risk with a containment or rollback approach.
6. **Test and equivalence strategy**
   - Map existing tests to subsystem contracts and list focused gaps before any
     extraction starts.
   - Require seeded headless regressions and state/snapshot comparisons for
     extracted seams, plus focused browser checks for externally visible
     behavior.
   - Treat timing profiles as performance evidence, not proof of behavioral
     equivalence.

## Required audit output

The completed audit should include a subsystem/dependency table, a contract
checklist, a ranked incremental extraction sequence with explicit non-goals,
risks with mitigations, and a focused verification matrix. Record uncertain
ownership or behavior as an open item rather than proposing speculative code
changes.
