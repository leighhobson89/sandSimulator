# Fast Metal Thermal Network and Solid-Metal Glow Plan

Finalized and implemented: 24 September 2026

## Implementation scope

- Preserve ordinary per-frame conductivity for pairs not handled by the fast
  network. This remains the heat-transfer path for Wood, Stone, Wall, and other
  ineligible contacts.
- Opt Copper, Molten Copper, Battery, Molten Aluminum, Iron, Molten Iron,
  Tubing, Fan, Heater, and Cooler into a fast local network through their
  positive `thermalNetworkRate` property. Tubing uses rate `0.12`, while its
  ordinary conductivity and electrical conductivity remain zero. Exchange heat
  through 32 local substeps per frame between eligible conductors and between
  those conductors and adjacent enclosed empty/gas cells. For these eligible
  links, the network replaces ordinary pair exchange to avoid double-counting.
- Exclude open air, non-network materials, and Insulation from network links.
  Other contacts continue through ordinary per-frame conductivity, including a
  conductor's existing slower interface with open air or ordinary materials.
- Keep Insulation as material 54 in the Solids picker. Its conductivity remains
  zero, `thermalNetworkRate` is zero, ambient cooling is disabled, and its
  cooling rate is very slow. It absorbs radiant heat and retains its heat, but
  does not transfer heat by contact or bridge chambers in the fast network.
- Add local heat glow to solid Copper, Battery, Iron, Fan, Cooler, Tubing, and
  Heater. Parse each material's `glowColor` to `glowRgb`; blend its pixel from
  its base color starting at `glowStartTemp` and reaching the glow color at
  `glowTemp`, set to that solid material's `meltPoint`. This is local pixel
  interpolation only: it creates no halo, heat emission, or neighboring-pixel
  tint. Existing molten color/color2 gradients remain unchanged.

## Acceptance and verification

- [x] Configured conductors exchange heat through the fast network; enclosed
  air/gas couples to conductors while open air and ordinary neighboring
  materials do not join those network links.
- [x] Ordinary conductivity transfers heat between pairs not handled by the
  fast network, including slow Wood, Stone, and Wall exchange and other
  ineligible contacts; eligible fast links replace ordinary pair exchange.
- [x] Insulation remains cataloged, radiantly heatable, non-conductive, and
  outside the fast network; it does not bridge enclosed chambers.
- [x] Tubing joins the fast thermal network at rate `0.12` despite its zero
  ordinary and electrical conductivity.
- [x] The solid-metal glow transition is covered by the canvas regression in
  `e2e/materials/rendering.spec.mjs`; glow affects only the local pixel and
  leaves molten gradients unchanged.
- [x] Focused npm simulation runs passed:
  - `npm.cmd test -- --focus=thermal-contracts`: **9/9** (final red/green
    correction; it first exposed the missing Tubing rate and bridge)
  - `npm.cmd test -- --focus=thermal-chamber`: **16/16**
  - `npm.cmd test -- --focus=thermal-air-faces`: **7/7**
- The focused rendering browser wrapper was attempted through npm with one
  worker, but did not reach assertions; cleanup stalled and was interrupted.
- No full suite was run for the network and glow update.
