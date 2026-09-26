# Plan: electrical materials and machines

**Status:** Implemented and verified.

## Scope

- Add an **Electricals** category below Metals and add **Elec**, a copper-based
  wire material with stronger electrical and thermal conductivity than Copper.
- Add **Simple Switch**, with one electrical input and output. Its persisted
  ON/OFF setting passes an incoming electrical signal while ON and blocks it
  while OFF.
- Add **Lamp**, with one electrical input. Its persisted ON/OFF setting gates
  power to a yellow glow; an unpowered or switched-off Lamp stays dark. While
  lit, it draws a very small battery load compared with high-demand machines
  such as Heater.
- Use Elec as the electrical machine-port connector material, with a 2-cell
  brush width for port leads. Preserve the existing protruding port markers,
  their idle/connected colors, and connection-status behavior.
- Accept Copper, Iron, Elec, and other compatible conductive wires such as
  Stainless Steel at electrical inputs. Redesign the electrical signal overlay
  as a legible yellow spark-like flow effect consistent with the existing
  connector visualization.
- Make Elec produce Corrosion powder more slowly than Copper.

## Implementation areas

- Material/catalog definitions and material picker ordering for the new
  Electricals category and Elec.
- Machine definitions, electrical signal propagation, Lamp power consumption,
  and save/blueprint state handling for machine settings.
- Machine port rendering and electrical flow overlays for input/output ports
  and the yellow signal effect.
- Machine interaction UI for ON/OFF controls on Simple Switch and Lamp.
- `docs/GAME_MECHANICS.md` and relevant materials documentation, including the
  catalog category, material properties, machine behavior, signal gating, and
  power use.

## Behavior choices

- Electrical signals travel only through compatible conductive wire and
  declared machine ports. Machine-port leads use Elec at 2-cell brush width;
  inputs accept Copper, Iron, Elec, Stainless Steel, and other compatible
  conductive wires. Existing protruding port markers and connection status
  colors remain in place.
- Elec retains copper-like heat behavior, conducts heat and electricity better
  than Copper, and corrodes more slowly than Copper.
- Simple Switch relays signal only from its input to its output while ON; it
  does not create a signal of its own.
- Lamp emits light only when ON and receiving power. Its small operating load
  is accounted for by the existing battery/power system.
- Both machine settings must survive save/load and blueprint capture/restore;
  defaults are ON to preserve the requested pass-through and illumination
  behavior when first placed.

## Verification scope

The test engineer added these focused browser regressions before
implementation:

- `e2e/machines/electrical.spec.mjs` covers Spark absorption, wire traversal
  and pulse expiry; shared versus isolated Battery charge; Copper and Iron wire
  loads and Fan power across the two-cell gap; Switch and Lamp port roles and
  acceptance of Copper, Iron, Elec, and Stainless Steel (with Tubing rejected);
  Switch signal relay/block behavior; accessible ON/OFF controls starting ON;
  Lamp's yellow glow only when powered and ON, with load below one tenth of
  Heater's; Elec port leads with forced two-cell width independent of brush
  size; existing Fan source/pulse behavior; rejection of off-port connections
  and inert invalid queries; and `clearWorld` electrical-state reset.
- `e2e/materials/catalog.spec.mjs` checks that Elec appears in Electricals and
  the catalog, is conductive and metal, has higher thermal-network and
  electrical conductivity than Copper, can discharge Batteries, has positive
  wire reach and higher corrosion resistance than Copper, describes its
  copper-like heat/electrical properties, can be selected and viewed in the
  tooltip, and directly verifies that Elec can rust to Corrosion powder after
  four times Copper's exposure.
- `e2e/machines/persistence.spec.mjs` checks portable Save/Load preservation of
  machine settings, including Simple Switch OFF and Lamp ON, and blueprint
  capture/stamp preservation of both settings.

The pre-implementation focused wrapper run had 15 existing tests pass and
feature-related assertions fail as expected. The final combined run passed all
23 tests across the three focused browser areas on 2026-09-26. After adding the
direct Elec corrosion regression, the complete materials catalog area passed
10/10 tests:

```text
npm.cmd run test:browser -- e2e/machines/electrical.spec.mjs e2e/machines/persistence.spec.mjs e2e/materials/catalog.spec.mjs --workers=1 --trace=off
npm.cmd run test:browser -- e2e/materials/catalog.spec.mjs --workers=1 --trace=off
```

The documented npm wrapper required elevated command access because the
sandbox identity could not read the existing Playwright Chromium cache. No
full-suite run was performed.
- `docs/GAME_MECHANICS.md`, `docs/METALS_GUIDE.md`, and the machine E2E README
  now describe the implemented behavior.
- This completed plan is archived under `docs/archive/plans/`.
