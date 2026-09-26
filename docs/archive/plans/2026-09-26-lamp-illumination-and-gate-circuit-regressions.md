# Plan: local Lamp illumination

## Goal

Add a derived local light field emitted by powered Lamps, expose its value to
hover feedback, and tint the normal canvas view. Keep illumination independent
of heat, thermal glow, and the alternate visualization palettes. This plan
records the implemented and verified behavior described below.

## Design

- Maintain a derived `world.illumination` scalar field from `0` to `100` per
  world-grid cell, with the same flat indexing as `world.type`. This is the
  authoritative simulation data; the separate canvas/layer is only its visual
  representation. Add `getIlluminationAt(x, y)` as the read API, and have the
  renderer sample `world.illumination`. Rebuild or update the field
  deterministically from current sources and blockers; do not persist the
  derived per-cell field in world saves or blueprints.
- A Lamp emits only while ON and receiving a valid Battery-backed logical
  input. Build its omnidirectional, 360-degree field in
  world-space grid cells, measured by Euclidean distance and independent of
  canvas zoom. At distance `d`, one Lamp contributes
  `min(100, max(0, 100 * (16 - d) / 15))`: the source cell is `100`, distance
  `15` is `100/15`, and distance `16` is zero. Sum overlapping contributions
  and clamp the field to `100`.
- Persistent Fire and Lava emit at source intensity `28`, with linear spatial
  falloff `max(0, 28 * (6 - d) / 6)` at Euclidean distance `d` in world cells.
  This gives a five-cell radius and reaches zero at distance six. These sources
  contribute to the same additive, clamped `world.illumination` field.
- A Gunpowder explosion creates a transient flash with peak intensity `100`
  and a radius of ten cells. Record the flash at `explode()` before the
  explosion clears cells, so the blast site and cleared cells receive its
  illumination. Fade the flash over four simulation ticks. When it expires,
  only any resulting persistent Fire remains as a lower-intensity emitter.
  Sparks and fuses do not emit light.
- Solids, plants, and machine bodies block light. Air, gases, Elec, and Tubing
  transmit it. Keep light out of plant viability, temperature, phase changes,
  and all other physics in this scope.
- Render `world.illumination` as a distinct grid-cell visual layer above
  particles and below machine overlays. The layer is a rendering of the
  world-grid field, not a separate illumination data store. Apply a yellow tint
  only in the Normal view; preserve Heat, Humidity, Wind, and all alternate
  visualization palettes unchanged. Clip drawing to the canvas/world viewport
  without changing field intensity at world edges. Lamp icon glow remains
  decorative and is not the illumination field. With no active emitters, the
  visual compositing must be fully transparent so normal particle colors are
  unchanged.
- Machine-port artwork uses a 15-unit local SVG protrusion length, reduced
  from 30. This is separate from the connector-drag preview's 30-screen-pixel
  maximum; do not couple the icon stub length to the user-painted lead cap.
- A logic-gate supply marker is blue while inactive and cyan while powered. In
  a real AND circuit, severing any one of the separate supply, signal A, or
  signal B paths must independently turn the gate output and Lamp off. Resolve
  each path using the circuit's eight-neighbor connectivity rule. The supply
  route still ends at the gate and never directly bridges into the output.
- Report the computed numeric local reading in feedback for empty air and
  particles; keep the reading independent of temperature and thermal glow.
  Lamp hover feedback and its catalog tooltip should identify emission state,
  the 15-cell range, and source intensity. Do not retain the old
  `Illumination: Not simulated` placeholder after this feature is verified.

## Implementation areas

- Inspect the renderer and visualization mode selection before adding the
  separate grid-cell light layer above particles and below machines; keep the
  alternate palette rendering paths unchanged. Preserve decorative icon glow
  as a separate effect.
- Add `world.illumination` with the same flat-cell indexing as `world.type`,
  and implement `getIlluminationAt(x, y)` over that field in the existing
  world/physics lifecycle. Include powered Lamps, persistent Fire/Lava, and
  short-lived Gunpowder flash events as emitters. Capture the flash at the
  explosion site in `explode()` before cells are cleared. Recompute correctly
  when Lamp power or ON/OFF state changes, a source or blocker is placed,
  removed, or moved, a flash expires, the world is cleared, or a save/blueprint
  is loaded.
- Update hover feedback and the existing E2E feedback documentation/spec to
  report the local numeric field. Drafts currently live in
  `e2e/feedback/hover.spec.mjs` and `e2e/feedback/illumination.spec.mjs`.
  Update `docs/GAME_MECHANICS.md`,
  `docs/FUTURE_IDEAS.md`, `docs/README.md`, and
  `docs/proposals/LOGIC_GATES_AND_LIGHTING.md` after implementation and focused
  verification. Keep plant response and all other unimplemented lighting ideas
  clearly future-facing.

## Focused regression scope

- `e2e/feedback/illumination.spec.mjs` covers powered Lamp emission, exact
  `d=0/15/16` values, equal Euclidean falloff at cardinal and diagonal cells,
  world-field indexing, zoom-independent values, edge clipping and layer
  alignment, and stale-field cleanup after moving a Lamp or blocker. It also
  covers Fire/Lava source intensity and radius, Fire produced from Oil/Wood,
  Gunpowder's dark fuse and flash at cleared cells (nonzero at distance ten,
  zero at eleven, center intensity exactly `100`, and monotonically fading to
  zero over four ticks), followed by dim Fire. It also covers additive
  clamping, blockers and transmitting materials, transparent no-emitter
  compositing, Normal-view tint versus alternate palettes, and derived field
  restoration after save/blueprint operations.
- `e2e/machines/logic-gates.spec.mjs` covers the five truth tables and missing
  supply, AND-to-Lamp behavior using distinct supply, A/B, and output paths,
  Battery load attribution, and independently cutting the supply, A, or B path
  while decorative wire pulses remain. In its supply-only, one-active-input,
  and both-input scenarios, it pairwise-checks eight-neighbor separation among
  supply, A/B signal routes, charged Battery terminals, and the complete output
  route to Lamp. It also checks blue inactive/cyan powered supply markers,
  straight per-port gate geometry, 15-unit protrusions and zoom scaling,
  vertical spacing, hover, and Save/Load/reset.
- `e2e/machines/ports.spec.mjs` covers direct contact and port ownership,
  every machine's 15 CSS-pixel default protrusion, zoom registration, and the
  separate 30-screen-pixel connector-drag cap.
- The focused baseline npm browser run executed six cases and all six failed
  as expected against the current implementation: persistent Fire/Lava and
  Oil/Wood-derived Fire had no illumination, the Gunpowder flash was absent,
  the powered supply marker was not cyan, and machine protrusions remained 30
  units instead of meeting the 15-unit target. In the AND path-cut case,
  execution stopped first at the missing cyan marker; assertions for severing
  supply/A/B paths remain unverified. This baseline is not a passing run.
- The initial baseline run was expected to fail as recorded above. After
  implementation, the focused browser run through the documented npm wrapper
  passed 32/32 on 26 September 2026. This verifies the illumination field and
  rendering, emitter lifecycle, AND circuit isolation and load attribution,
  gate supply marker, and machine-port geometry in the named specs.
- `e2e/feedback/hover.spec.mjs` checks numeric illumination on material hover
  while retaining temperature and humidity readings.

## Verification and documentation status

Implementation, review, focused verification, and permanent documentation are
complete. The implementation remains covered by the archived plan and the
current mechanics, E2E, and proposal documentation.
