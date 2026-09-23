# Physics E2E Coverage

Focused browser contracts for deterministic, user-visible physics outcomes.
The folder contains 24 Playwright tests:

- `determinism.spec.mjs`: four tests for seeded snapshots, restore/replay,
  controlled stepping, and a representative electrical boundary.
- `settling.spec.mjs`: six tests for brush settling, liquid flow and level,
  reset, density ordering, sealed boundaries, and gas movement.
- `thermal.spec.mjs`: six tests for gradual temperature integration, phase
  changes, fire, lava, insulation, ambient easing, and altitude layers.
- `reactions.spec.mjs`: eight tests for quenching, growth, residue, drying,
  corrosion, snow, gunpowder, cold decay, and wind behavior.

## Run

Run the focused area with one worker in both modes:

```text
npx playwright test e2e/physics --workers=1
npx playwright test e2e/physics --workers=1 --headed
```

The accepted verification passes both commands. The full headless integration
suite remains `npm test`; its current accepted run passes 284 assertions with
default seed `0`. `npm run test:smoke` remains the stand-in browser wiring and
persistence check.

## Fixture Boundary

`fixtures.mjs` uses the public browser physics module boundary to clear worlds,
seed deterministic source cells, set fixture temperatures, and inspect cells or
material counts. This is setup and state inspection, not a replacement for user
workflows. Material selection, canvas painting, and other visible interactions
must use Playwright actions; fixture calls must not stand in for controls,
gestures, dialogs, or rendered UI assertions.

Tests use the seeded adapter and exact `GamePage.step()` counts for evolution,
and retain state/screenshot diagnostics on failure. Add a browser test here when
a physics behavior has a user-visible contract. Keep exhaustive material,
conservation, and rule-combination matrices in `tools/simTest.mjs` rather than
duplicating them as slow browser cases.

This is a representative browser contract, not exhaustive material coverage.
Under the policy in [`../../docs/E2E_TEST_PLAN.md`](../../docs/E2E_TEST_PLAN.md),
the focused physics tests pass in both modes but functional areas 9 and 10 stay
amber while the headless matrix and remaining machine/UI gaps are tracked in
[`../../docs/E2E_PROGRESS.md`](../../docs/E2E_PROGRESS.md).
