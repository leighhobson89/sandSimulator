# Physics E2E Coverage

Focused browser contracts for deterministic, user-visible physics outcomes.

- `determinism.spec.mjs`: four tests for seeded snapshots, restore/replay,
  controlled stepping, and an electrical boundary.
- `settling.spec.mjs`: six tests for brush settling, liquid flow and level,
  reset, density ordering, sealed boundaries, and gas movement.
- `thermal.spec.mjs`: gradual temperature integration, phase changes, fire,
  lava, material insulation, ambient easing, altitude layers, sealed and open
  air, chamber breach, local rays/fire/Lava effects, Steam retention, mixed
  Wall/open-air cooling, and connected Insulation bridges that transfer heat
  between enclosed chambers without leaking to open air.
- `reactions.spec.mjs`: eight tests for quenching, growth, residue, drying,
  corrosion, snow, gunpowder, cold decay, and wind behavior.

## Run

Run the focused area through the documented npm wrapper with one worker.

```text
npm run test:browser -- e2e/physics --workers=1 --trace=off
```

The material catalog's Insulation group, color, and glossary behavior are
covered in [`../materials/catalog.spec.mjs`](../materials/catalog.spec.mjs).
Run that focused browser spec with:

```text
npm run test:browser -- e2e/materials/catalog.spec.mjs --workers=1 --trace=off
```

## Thermal Simulation Results

The previous full Insulation-network validation passed 306/306, and its smoke
and scale-profile checks passed. For the later enclosed-content air-face fix,
`thermal-air-faces` passed 7/7, `thermal-chamber` passed 16/16, and
`thermal-contracts` passed 4/4. No full suite was run for that fix.

Focused simulation selectors:

```text
npm test -- --focus=thermal-air-faces
npm test -- --focus=thermal-chamber
npm test -- --focus=thermal-contracts
```

The focused catalog browser wrapper discovered four tests, but its configured
test context could not start, so no assertions ran. The catalog specs remain
the browser-visible coverage for the Insulation picker and glossary.

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
