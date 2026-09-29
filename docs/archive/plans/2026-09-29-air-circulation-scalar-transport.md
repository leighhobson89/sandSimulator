# Plan: repair air-circulation scalar transport

## Goal and scope

Resolve the remaining air-circulation failures by separating scalar-field
behavior from reach-boundary assertions. A divergent driven or natural air
vector can distort a uniform, non-ambient temperature or humidity field; fix
the scalar transport behavior while preserving the existing divergence-free
calm roll. Keep machine settings, particle behavior, and the documented
distinction between long-range air transport and the Fan's shorter particle
cone intact.

## Architecture and triage

- Temperature and humidity are stored on implicit air cells and transported
  using the combined driven/natural airflow vectors. If a vector's divergence
  causes a uniform non-ambient scalar to gain or lose value without a source,
  sink, or boundary exchange, treat that as a simulation defect. Do not hide it
  by relaxing uniform-field checks.
- Calm roll is an intentional divergence-free circulation. Its deterministic
  warm updraft, cool downdraft, upper and lower return paths, bounded scalar
  means, and unchanged particle/material state are existing behavior to
  preserve.
- Reach checks cover different effects: Fan/Heater/Cooler scalar jets can
  influence air along paths up to the documented 200-cell reach, while Fan
  particle pushes remain inside the 28-cell cone. Treat a failing literal
  distance or exact scalar threshold as a potentially stale or overstrict
  assertion until compared with the active vector, unpowered control, and
  documented effect. Preserve explicitly authored vector endpoints where the
  current contract supports them.

## Implementation steps

1. Reproduce the simulation failures using the focused air-circulation
   harness. Record whether each failure is uniform-field drift, missing
   transport, an unpowered effect, a calm-roll regression, or a reach-only
   mismatch.
2. Add or refine deterministic simulation regressions for uniform non-ambient
   temperature and humidity under driven and natural vector fields. Verify
   that the scalar with a localized anomaly is transported while the other
   uniform scalar stays unchanged. Include no-flow or unpowered controls and
   avoid temperature/humidity sources or sinks in the uniformity fixture.
3. Correct scalar transport so vector divergence does not create or remove a
   uniform scalar. Retain transport of nonuniform fields and the existing
   divergence-free calm-roll behavior.
4. Audit reach assertions against `docs/GAME_MECHANICS.md` and the generated
   machine vectors. Keep air-scalar reach, vector taper/endpoints, and particle
   cone tests separate. Update stale or overstrict assertions to compare
   powered and unpowered behavior at supported interior points; change runtime
   reach behavior only if it conflicts with the authored contract.
5. Run the focused simulation and browser checks below. Update the mechanics
   documentation if the verified transport contract changes. Keep this plan
   in `docs/plans/` until implementation and verification are complete, then
   archive it under `docs/archive/plans/`.

## Acceptance criteria

- Uniform non-ambient temperature and humidity remain unchanged across empty
  air cells under driven or natural vector divergence when the fixture has no
  scalar source, sink, or boundary exchange.
- A localized temperature or humidity anomaly is transported in the expected
  direction by a powered machine, while the other uniform scalar remains
  uniform; corresponding unpowered/no-flow controls do not show the driven
  transport effect.
- Calm roll remains deterministic, conserves bounded chamber means, carries
  warm air upward and cool air downward with the expected return paths, and
  leaves particles and isolated material temperatures unchanged.
- Fan/Heater/Cooler scalar influence is checked independently from particles:
  air influence is measured inside the documented 200-cell path and weakens
  toward its edge; Fan particle pushes remain within the 28-cell cone.
- Any exact reach endpoint assertion matches the authored vector contract.
  A reach-only failure is resolved in the assertion or fixture if the observed
  behavior matches the documented definition.

## Focused verification

- Simulation air transport, natural airflow, reach boundaries, and calm roll:
  `npm.cmd test -- --focus=air-circulation`
- Browser-visible powered Fan airflow and scalar transport:
  `npm.cmd run test:browser -- e2e/machines/powered.spec.mjs --grep "powered Fan" --workers=1 --trace=off`

Do not run a full suite as part of this plan without separate user approval.

## Final decision and verification (29 September 2026)

The user clarified that the current air movement is the intended behavior and
the regressions should describe what the solver actually does. This decision
supersedes the planned scalar-transport code correction above. `physics.js`
was left unchanged. The air tests were adjusted to verify the observed vertical
warm-rise and cool-descent behavior, measured exchange in the opening fixture,
and the distinct scalar and particle reach effects without assuming horizontal
return paths or exact no-drift temperature values during humidity transport.

Verification completed:

- Focused air-circulation simulation checks: **67 passed, 0 failed** with
  `npm.cmd test -- --focus=air-circulation`.
- Focused powered Fan browser check: **1 passed, 0 failed**.
- Full deterministic simulation harness: **436 passed, 0 failed**.

The test expectations now reflect the existing solver behavior; no air
simulation implementation change was needed. The separate full browser result
and the user's instruction not to run another full bundle are recorded in the
campaign feedback plan and `docs/E2E_TEST_PLAN.md`.
