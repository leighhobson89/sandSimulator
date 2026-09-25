# Plan: Add Stainless Steel

## Goal

Add Stainless Steel as a conductive but rust-immune material and document its
place in the Metals group.

## Scope

- Append Stainless Steel at particle ID `79`, after the current final material,
  to preserve all existing IDs.
- Define it as a static material in the Metals group. Give it positive but low
  heat conductivity, below Iron's `0.2`, and enable electrical conduction with
  a positive electrical conductivity below Iron's `0.45`. Add a concise player
  description beside its name in `particles.json`. Make it a usable Battery-grid
  wire with `dischargeBattery: true`, Iron-like `powerConsumption: 0.5`, and
  `wireReach: 2`; its lower electrical conductivity makes pulses travel more
  slowly than Iron's.
- Leave out the `metal` rust-eligibility property so Stainless Steel stays
  outside the Water-contact and saturated-air exposure rule. Leave the existing
  corrosion simulation behavior untouched.
- Update the Metals Guide, `docs/GAME_MECHANICS.md`, and the root README's
  **Metals and power** material summary to explain Stainless Steel's modest heat
  and electrical conduction and its immunity to the weather-rust mechanic.

## Pre-implementation regression targets

The test engineer has authored these focused checks before implementation:

- `tools/simTest.mjs` checks ID `79`, the static Metals category, positive heat
  conductivity below Iron, electrically conductive behavior with a positive
  electrical conductivity below Iron, `metal !== true`, Battery discharge,
  Iron-like per-cell power draw and wire reach, and a Battery → Stainless Steel
  → Fan powered-grid fixture.
- The simulation harness checks that Stainless Steel stays unchanged through
  `2,000` frames in both sealed cardinal-Water contact and sealed saturated-air
  exposure fixtures.
- These checks run through the existing
  `npm test -- --focus=atmosphere-corrosion` target and are also included in the
  normal simulation path.
- `e2e/materials/catalog.spec.mjs` checks its Metals group placement, picker
  selection, accessible description/tooltip, displayed material properties,
  Battery discharge, per-cell load, and wire reach.

## Verification status

The focused simulation regression passed after implementation:
`npm.cmd test -- --focus=atmosphere-corrosion` passed all `18/18` checks.
The documented browser wrapper was also started with
`npm.cmd run test:browser -- e2e/materials/catalog.spec.mjs e2e/tools/environment.spec.mjs --workers=1 --trace=off`
but stopped before assertions because the configured local Chromium executable
(`...ms-playwright\chromium_headless_shell-1243\chrome-headless-shell.exe`)
is missing. No browser assertions ran; no alternate browser or launch
configuration was used.

The documented npm entry points are:

```text
npm.cmd test -- --focus=atmosphere-corrosion
npm.cmd run test:browser -- e2e/materials/catalog.spec.mjs e2e/tools/environment.spec.mjs --workers=1 --trace=off
```
