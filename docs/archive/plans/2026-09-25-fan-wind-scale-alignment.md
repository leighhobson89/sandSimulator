# Align Fan Settings with the Wind Scale

## Goal

Move Fan settings to the 1-50 scale used by wind controls. Newly placed Fans keep the default speed of 7 to match the new Breeze default. Preserve existing Fan output through a one-time migration: legacy speed 7 becomes approximately 23, and legacy setting 15 maps to new setting 50.

## Scope

- Keep newly placed Fans at speed 7 to match the new Breeze default; update Fan descriptions and UI controls to expose the 1-50 scale consistently.
- Update physics so Fan values on the new scale produce the intended wind strength. Legacy Fan settings must retain their previous behavior after conversion, including legacy speed 7 migrating to approximately 23 and legacy setting 15 mapping to new setting 50.
- Add a one-time scale marker and migration for legacy Fan values in both simulation arrays and blueprint cell settings. The marker must prevent a migrated value from being converted again on subsequent save/load or blueprint use.
- Keep new-game defaults and newly created or edited blueprint Fan settings on the new scale.
- Update `docs/GAME_MECHANICS.md` after implementation so Fan defaults, the setting range, output behavior, and legacy migration are documented accurately.

## Implementation outline

1. Identify the Fan setting paths for simulation state, portable save/load, and blueprint cell settings. Define the marker's persistence and the migration boundary so old values are converted once while already scaled values remain unchanged.
2. Implement and document one shared scale conversion. Preserve the old physical output for migrated legacy values, including legacy 7-to-new approximately 23 and legacy 15-to-new 50. Keep migration idempotent in both simulation arrays and blueprint cell settings.
3. Keep the new Fan default at 7, and update the UI range/value display and descriptions to match 1-50. Ensure physics consumes the new scale and the displayed value corresponds to its output.
4. Add or update focused regression coverage for new Fan range/output, legacy simulation-state migration, and legacy blueprint-setting migration, including protection against repeated conversion.
5. Update `docs/GAME_MECHANICS.md` after implementation and verification.

## Focused verification

Run the owning browser specs through the repository npm wrapper with one worker:

```text
npm run test:browser -- e2e/machines/placement.spec.mjs --workers=1 --trace=off
npm run test:browser -- e2e/machines/persistence.spec.mjs --workers=1 --trace=off
```

Run the deterministic simulation regression through the existing npm harness:

```text
npm test -- --focus=fan-wind-scale-alignment
```

Verify that newly placed Fans start at 7, the UI presents values from 1 through 50, setting 50 preserves legacy setting 15's output, legacy simulation speed 7 migrates to approximately 23, legacy blueprint values migrate once, and already migrated values remain stable through repeated load/use.

## Regression coverage and baseline results

The focused tests now present in the repository cover:

- `e2e/machines/placement.spec.mjs`: a newly placed Fan stores speed 7; its settings dialog exposes the 1-50 range and edits the stored value; out-of-range values clamp to 1 and 50, and fractional values round to the nearest integer.
- `e2e/machines/persistence.spec.mjs`: a legacy simulation Fan speed 7 migrates to 23, a legacy blueprint Fan speed 9 migrates to 30, and the scale marker is saved. Reloading the migrated save and placing the blueprint again must not apply the conversion a second time.
- `tools/simTest.mjs`: the focused Fan calibration regression checks that speed 50 is accepted, maps to legacy wind strength 15, and produces the same physical maximum output as legacy speed 15.

Before implementation, the focused browser run had 3 tests and all 3 failed as expected: the current Fan maximum is 20, and legacy simulation speed 7 remained 7 instead of migrating to 23. The focused simulation harness had 1 pass and 2 failures: Fan setting clamping and maximum-effect calibration did not yet match the new scale.

## Implementation and final verification

- Fan settings now use the 1-50 scale with default speed 7, matching Breeze. Physics converts the new Fan scale to the legacy 0-15 physical reference, so speed 50 has the old speed-15 output.
- Legacy Fan settings in simulation state and blueprint cell data migrate once using the `fanWindScale: 50` marker. The conversion clamps the old value to 0-15, scales it to 0-50, and rounds; world speed 7 becomes 23 and blueprint speed 9 becomes 30. Re-saved state carries the marker and remains unchanged on subsequent load or blueprint placement.
- Fan UI bounds, descriptions, machine coverage, and `docs/GAME_MECHANICS.md` now describe the implemented range, default, conversion, and migration.

Final verification completed on 25 September 2026:

- Full browser suite: 173/173 passed with 6 workers.
- Full `npm.cmd test`: 369/369 passed.
- Focused machine placement and persistence specs: 9/9 passed with one worker.
- Focused Fan scale harness: 3/3 passed.

## Documentation follow-up

`docs/GAME_MECHANICS.md`, `docs/E2E_TEST_PLAN.md`, and `e2e/machines/README.md` were updated for the completed behavior and coverage. This finalized plan is archived under `docs/archive/plans/2026-09-25-fan-wind-scale-alignment.md`.
