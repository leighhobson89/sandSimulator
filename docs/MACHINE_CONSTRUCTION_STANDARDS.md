# Machine construction standards

Use this standard whenever adding a machine or changing an existing machine's
ports, interaction, artwork, collision, or state. The machine definition and
its declared port roles are the source of truth for construction, runtime
behavior, rendering, and tests.

## Ports and connection anchors

- Declare every required input and output in the machine definition, with its
  family, role, stable `connectionCell` anchor, material, and any supported
  direction or rotation. Use only the ports the machine requires.
- Keep input and output roles distinct. Logical-current relays read from
  declared input ports and forward to declared output ports; storage machines use their
  declared material routes. Do not infer a port from the broad icon body or
  silently accept a connection at an undeclared location.
- Keep connector artwork, port hit targets, lead previews, and the actual
  connection anchor aligned at normal and zoomed cell scales. A port marker
  must communicate disconnected and connected state accessibly.
- Treat the whole visible port protrusion as a functional connector for its
  originating port. Compatible Tubing, Copper, or electrical wire touching the
  protrusion connects directly to that port; an additional drawn extension
  lead is optional. Keep this separate from pointer hit proximity: a nearby
  click or hover does not create a physical connection. Preserve Tubing's
  cardinal terminal/contact rule and electrical/Copper eight-way terminal
  contacts, with no ambiguous ownership when contacts overlap.
- Machine-port artwork uses a 15-unit local SVG protrusion (about 15 CSS pixels
  at default zoom); it scales with the world zoom. Keep this independent of the
  connector-drag preview's 30-screen-pixel maximum. Use sufficient vertical
  spacing for adjacent multi-input connectors. Logic-gate connectors protrude
  straight outward from their faces: one horizontal left-facing connector per
  signal input, one horizontal right-facing output, and one downward supply
  connector. The supply marker is blue while inactive and cyan while powered.
  Hover feedback identifies each port's role, direction, and live state.
- Use Tubing for material transfer ports and Elec for electrical connector
  material. Electrical lead construction forces a two-cell paint-brush width
  regardless of the selected brush setting. Preserve the established 2-pixel
  electrical stub/lead rendering and align it with the declared anchor.
- Derive electrical logical ON/OFF from the connected charged-Battery route,
  independently of traveling-Spark artwork or delay arrays. Use the same
  logical-current state for machine inputs, relays, outputs, and powered
  effects; turning a switch OFF or losing Battery charge must turn logical
  output OFF immediately even if an animation trail remains visible.

## Interaction, settings, and sensors

- A machine that players configure must open an accessible settings dialog
  from its icon. Give every selector and input a visible label, meaningful
  bounds, the correct units, validation, and persisted updates. Support
  fractional values when the machine specification allows them.
- Show live state in the dialog and hover surface when a player needs to
  understand a machine's current behavior. Status must reflect the actual
  runtime condition, including whether required logical input current is
  present; configuration alone must not be presented as an active output.
- Add a yellow sensor marker only when the machine measures the environment.
  Its marker must be the same radius as the connector ports, touch or protrude
  from the housing edge, and expose the intended environmental probe cells.
  Keep it visually distinct from connector markers. The marker is visual and
  does not create a hole in body collision.
- For the Temperature Switch and Humidity Switch reference geometry, the yellow
  marker is centered at `cx=32`, `cy=14` and crosses the housing edge at `y=14`.
  Their five probe cells lie immediately outside the 5-by-5 collision body.

## Collision and intentional openings

- Machine bodies block particles from passing through or behind the housing.
  Align collision geometry with the rendered solid footprint and include
  diagonal movement checks where the simulator's movement path requires them.
- Openings are exceptions only when specified by the machine's behavior, such
  as a Collector's world-facing intake or a machine's explicit release face.
  Keep an intake, output, sensor probe area, and ordinary body collision
  separately defined so particles cannot leak through adjacent housing cells.
- Connector leads and visual port or sensor markers do not weaken the machine
  body's collision. Test both the intended opening and nearby sealed edges.

## State and persistence

- Define machine settings and inventories in explicit fields with suitable
  numeric types and documented defaults. Do not store fractional or multiple
  independent settings in an integer or bit-style field intended for another
  control.
- Preserve machine state through the existing lifecycle paths: clear and
  recreate, transforms, swaps, Grabber moves, local reset/resume, portable
  Save/Load, and blueprint capture/stamping. Reset paths should restore
  definition defaults; moves and round trips should retain configured values.
- Add defaults or migrations for saves and blueprints that predate newly added
  fields. Keep save and blueprint allowlists in sync with machine state fields.

## Regression checklist

Before completing a machine change, verify the owning focused regression area
covers the applicable contracts:

1. Catalog name, group, stable ID, internal key, declared port roles, material,
   anchors, connector brush width, direct protrusion contacts, and optional
   extension-lead behavior.
2. Artwork and hit projection at normal and zoomed scales, including the
   15-unit SVG protrusion and separate 30-screen-pixel drag cap, adequate
   signal-port spacing, straight
   outward connector direction and per-input count for logic gates, an exposed
   sensor marker where applicable, and the 2-pixel Elec stub.
3. Accessible configuration controls, bounds, units, fractional input where
   supported, defaults, and immediate settings updates.
4. Input/output behavior under logical-current ON and OFF states, including
   comparator truth boundaries and live status when the machine exposes status.
5. Collision across the housing and around any documented intake, release, or
   sensing opening; verify nearby particles cannot leak through or behind it.
6. Battery-backed DC logical-current state, switch gating, powered effects,
   and separation from cosmetic traveling-Spark animation, including immediate
   OFF transitions.
7. State retention and defaults through reset, swap, Grabber, Save/Load, and
   blueprint workflows as applicable.

Keep browser-visible contracts in the owning `e2e/` area and use the documented
`npm run test:browser -- <area-or-spec>` wrapper for focused verification. Keep
deterministic simulation behavior in the existing `tools/` harnesses. Update
`docs/GAME_MECHANICS.md`, the owning E2E README, and any affected material or
machine guide whenever behavior, state, presentation, or test ownership
changes.
