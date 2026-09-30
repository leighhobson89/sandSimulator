# Mission 6 Timed Controlled Burn

**Status:** Implemented; focused browser verification passed.

## Goal

Revise Mission 6, “A Controlled Burn,” so the player starts a fire at the upper surface of a captured Wood structure, waits one second of active simulation for Water to unlock, then pours Water over the structure. The player must quench the fire while leaving some Wood and no active Fire in the final world.

The captured scene should read as a substantial two-leg bridge with an overhead Wood span and a clear, open burn bay underneath. The Fire placement cell is exposed at the top of the Wood and adjacent to it. No Fire is preplaced. Mission 6 provides a finite Fire budget of 10 placements and unlocks unlimited Water with the largest Brush size after the ignition delay.

Remove coordinate directions from player-facing campaign copy and from the per-mission prose in `docs/CAMPAIGN_MISSIONS.md`. Use relative descriptions such as “the exposed top of the overhead span,” “the open space beneath the bridge,” and “pour Water over the burning structure.” Coordinates may remain inside encoded snapshots, internal layouts, and regression fixtures.

## Current behavior and required change

- Mission 6 currently restores a compact 2,000-cell Wood block, asks the player to place one Fire cell in a coordinate-described notch, and unlocks a finite supply of 500 Water after 1,000 cumulative Wood-to-Fire transitions.
- Replace the rectangular block with a captured 260×150 Sandbox snapshot showing two supporting Wood legs and a wide overhead bridge, with open space beneath and an exposed ignition surface at the top. Keep the established five-row Sand floor, fixed 25°C environment, and locked climate controls. Do not preplace Fire or Water.
- Set the Fire budget to 10 and make Fire available when the mission starts. Replace the 1,000-ignition Water gate with a one-second active-simulation delay that begins only after the player successfully places Fire to start the burn. Pausing, menus, and wall-clock time while simulation is paused must not advance the delay.
- On delay completion, unlock unlimited Water and select the largest Brush size (31) so the player can pour over the top. Water must remain unavailable before the delay expires. Represent unlimited availability explicitly; do not encode it as `Infinity` in a serializable resource budget. Keep the HUD/palette, resource checks, consumption path, campaign-state save/restore, and validation consistent with the unmetered supply.
- Use the objective IDs `start-fire`, `water-unlock-delay`, `quench-with-water`, and `confirm-fire-out`. The Water-quench objective counts one Fire-to-Smoke transformation caused by Water and requires the Water-unlock delay. Do not use the old cumulative Wood-to-Fire count as the unlock condition.
- Make `confirm-fire-out` require at least one Wood cell and zero active Fire cells before Mission 6 can complete. Objective progress alone must not complete the mission while Fire remains or after all Wood is gone. Reevaluate this condition when simulation changes the world, including when Fire expires or transformations complete.

## Implementation scope

### Mission data and campaign state (`campaign.js`)

- Update the Mission 6 captured `startingSave` to the bridge-shaped Wood scene; preserve the 260×150 world and authored floor. Keep geometry coordinates only in this internal snapshot and tests.
- Revise Mission 6 briefing, guidance, objective labels, and event messages to describe upper-surface ignition, the active-simulation wait, Water unlocking, pouring from above, and the desired surviving-Wood/no-Fire result without coordinates.
- Configure Fire budget 10, initially available Fire, a one-second delay after the `start-fire` milestone, and unmetered Water availability after that delay. Use `water-unlock-delay` for the timer gate, `quench-with-water` for one Fire-to-Smoke transformation caused by Water, and `confirm-fire-out` for the final world-state check; replace the 1,000-ignition unlock stage.
- Store any delayed-unlock state needed for campaign checkpoint/save restoration. Add narrow normalization for prior Mission 6 states so the former Fire/Water budgets and ignition objective do not make existing saves fail validation. A formerly completed 1,000-ignition stage may be migrated to the unlocked state; pre-unlock saves should retain a locked Water state and resume the delay safely.
- Add a Mission 6 completion predicate for current Wood count greater than zero and current Fire count equal to zero. Keep this world-state condition separate from cumulative transformation counters.

### Simulation timing and world-state hook (`game.js`, `physics.js`, campaign runtime)

- Measure the delay from completed simulation steps, not a browser timer. Hook campaign progression to the same active `stepSimulation()` path used by the game loop, so a paused simulation does not accrue time. One active second is 60 simulation steps at the current simulation rate.
- Start counting only after the Fire-placement milestone has been recorded. Unlock Water exactly after 60 subsequent active steps; make the transition idempotent and persist it through campaign save/restore.
- Reevaluate the final material-count predicate after relevant world transitions and active simulation steps. Ensure the check notices Fire disappearing through its normal lifetime as well as Water-to-Smoke quenching.
- Keep the change scoped to campaign progression and the existing simulation loop; do not change global simulation rate, Fire lifetime, Wood ignition rules, or generic timing behavior.

### Player copy and documentation

- Audit all player-facing strings in installed campaign mission definitions for coordinate-based instructions. Replace coordinate directions with relational wording while preserving exact coordinates in internal layouts and encoded snapshot data.
- Revise each mission's prose in `docs/CAMPAIGN_MISSIONS.md` to remove coordinate directions; update Mission 6 setup, objectives, equipment, controls, and design notes to match the bridge scene, finite Fire retries, timed unlimited Water unlock, largest Brush, and final world-state requirement. Preserve authored coordinates only in code/test internals as needed.
- After implementation and verification, update `docs/GAME_MECHANICS.md`, `docs/PROGRAM_OVERVIEW.md`, `docs/E2E_TEST_PLAN.md`, and `e2e/campaign/README.md` with the campaign timing, unmetered Water behavior, active-simulation semantics, bridge scenario, and completion rule.

## Focused regression coverage

The completed focused browser coverage is in `e2e/campaign/missions-four-to-six.spec.mjs`. It verifies:

1. Mission 6 restores the 260×150 captured bridge scene, verifies the player ignites at its upper Wood surface, and confirms there is no preplaced Fire or Water and the Fire budget is 10. Coordinates remain internal to the test fixture.
2. Player-facing campaign copy is coordinate-free.
3. Water remains unavailable for the first 59 active simulation steps and unlocks after step 60; paused simulation frames do not advance the delay.
4. Unlocking makes Water unlimited and automatically selects Brush size 31.
5. Natural Fire expiry earns no `quench-with-water` credit. Direct Water dousing earns the one required Fire-to-Smoke transformation.
6. `confirm-fire-out` blocks completion while any Fire remains or if no Wood remains, and allows completion only with Wood remaining and zero active Fire.

Use the project's npm wrapper for the focused campaign regression:

```powershell
npm.cmd run test:browser -- e2e/campaign/missions-four-to-six.spec.mjs --workers=1 --trace=off
```

Do not run a full suite without user approval.

## Out of scope

- No changes to campaign missions other than removing coordinate directions from their player-facing copy and documentation prose.
- No changes to the global Fire lifetime, ignition threshold, simulation frequency, material transformations, or physics behavior outside the timing/completion hooks required by Mission 6.
- No new declarative terrain-layout format. The Mission 6 bridge remains a captured Sandbox snapshot.
- No full-suite test run as part of this plan.

## Acceptance criteria

- Mission 6 starts with no Fire or Water in the world, offers up to 10 Fire placements, and begins its delay only after a successful ignition placement at the top of the Wood structure.
- Water is unavailable through 59 active simulation steps and becomes unlimited after step 60. Paused frames and wall-clock time while paused do not count; the largest Brush is selected when Water unlocks.
- The captured scene has two supporting legs, an overhead span, and open burn space beneath it; the player can pour Water over the upper span.
- Objective IDs are `start-fire`, `water-unlock-delay`, `quench-with-water`, and `confirm-fire-out`; `quench-with-water` requires one direct Fire-to-Smoke conversion caused by Water.
- The mission finishes only when Water quenching is confirmed, some Wood remains, and no active Fire remains.
- Campaign copy and per-mission documentation contain no coordinate directions. Internal snapshot encoding and tests may retain coordinates.
- The focused Mission 4–6 browser regression passes, and relevant documentation is updated after verification.

## Implementation and verification result

Implemented the Mission 6 overhead Wood bridge, 10-cell Fire budget, one-second active-simulation delay, unlimited Water unlock, automatic largest Brush selection, Water-caused quench objective, and final surviving-Wood/no-Fire check. Rewrote Mission 6 prose and removed grid-coordinate directions from all mission descriptions in docs/CAMPAIGN_MISSIONS.md.

Focused verification passed: **7 tests** in 23.1 seconds.

npm.cmd run test:browser -- e2e/campaign/missions-four-to-six.spec.mjs --workers=1 --trace=off

No full test suite was run.