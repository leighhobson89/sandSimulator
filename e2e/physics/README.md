# Physics E2E Coverage

Focused browser contracts for deterministic, user-visible physics outcomes.

- `determinism.spec.mjs`: four tests for seeded snapshots, restore/replay,
  controlled stepping, and an electrical boundary.
- `settling.spec.mjs`: six tests for brush settling, liquid flow and level,
  reset, density ordering, sealed boundaries, and gas movement.
- `thermal.spec.mjs`: gradual temperature integration, phase changes, fire,
  lava, material insulation, ambient easing, altitude layers, sealed and open
  air, chamber breach, local rays/fire/Lava effects, Steam retention, mixed
  Wall/open-air cooling, and metal bridges using Tubing that transfer heat at
  configured rates between enclosed chambers while Insulation isolates them.
- `reactions.spec.mjs`: eight tests for quenching, growth, residue, drying,
  corrosion, snow, gunpowder, cold decay, and wind behavior.

## Run

Run the focused area through the documented npm wrapper with one worker.

```text
npm run test:browser -- e2e/physics --workers=1 --trace=off
```

The material catalog's Insulation retention properties and participating metal
network rates are covered in
[`../materials/catalog.spec.mjs`](../materials/catalog.spec.mjs). Run the
focused physics and catalog browser specs together with:

```text
npm run test:browser -- e2e/physics/thermal.spec.mjs e2e/materials/catalog.spec.mjs --workers=1 --trace=off
```

## Thermal Simulation Results

The preceding full `npm test` passed 306/306 before the fast-metal-network
update. Focused simulation checks for the metal network and glow updates passed:
`thermal-contracts` 9/9, `thermal-chamber` 16/16, and `thermal-air-faces` 7/7.
The glow update also adds a canvas regression in
[`../materials/rendering.spec.mjs`](../materials/rendering.spec.mjs). Its
focused browser wrapper was attempted with one worker, but did not reach
assertions; cleanup stalled and was interrupted. No full suite was run for the
glow update.

Focused simulation selectors:

```text
npm test -- --focus=thermal-air-faces
npm test -- --focus=thermal-chamber
npm test -- --focus=thermal-contracts
```

The focused rendering wrapper did not reach assertions before cleanup stalled
and was interrupted. These specs remain the browser-visible coverage for the
retained Insulation material, metal network behavior, and solid-metal
rendering. No full suite was run for this update.

Run the full browser suite through the npm wrapper:

```text
npm run test:browser -- --workers=1 --trace=off
```

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

Browser specs cover user-visible physics outcomes, while exhaustive non-UI
material, conservation, and rule-combination matrices remain owned by
`npm test`; they are not duplicated as slow browser cases. Keep this boundary
aligned with the current architecture, commands, and maintenance contract in
[`../../docs/E2E_TEST_PLAN.md`](../../docs/E2E_TEST_PLAN.md).
