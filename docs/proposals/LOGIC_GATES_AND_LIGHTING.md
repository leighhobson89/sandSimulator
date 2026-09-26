# Proposal: light-responsive plants and additional emitters

**Status:** Battery-backed NOT, AND, OR, NAND, and XOR gates and the local
illumination field are implemented. Focused gate, port, and illumination browser
coverage passed 32/32 on 26 September 2026. The field currently responds to
powered Lamps, persistent Fire/Lava/Scoria, and short Gunpowder explosion
flashes.
Light does not yet affect plant viability. Plant response, additional emitter
types, ambient sunlight, Solar generation, and day/night remain future work.
For current behavior, see [Game Mechanics](../GAME_MECHANICS.md#3-powered-storage-transfer-and-connection-machines),
its [illumination and hover reference](../GAME_MECHANICS.md#9-canvas-feedback-and-live-inspection),
and [future ideas](../FUTURE_IDEAS.md).

## Implemented electrical baseline

Existing Copper, Iron, Stainless Steel, and Elec routes carry steady ON/OFF
signal levels. Every logic gate has separate signal inputs, one output, and a
Battery-backed supply input. Its blue supply route ends at the gate and does
not energize or bridge into the separate output route. NOT and NAND can produce
an ON output from OFF signal inputs while supplied; a gate without supply has
no output.

The gate and its output-network wire/device loads are billed to the separate
supply circuit, not either signal-source Battery. Focused AND-to-Lamp coverage
checks the separate supply, A/B signal, and output circuits under eight-neighbor
contact rules. The Lamp stays dark with supply alone or one active signal, and
lights only with both signals and supply. Losing any one source path turns the
output off even if cosmetic wire pulses remain. Active supply connectors are
cyan; inactive supply connectors are blue. Gate definitions, truth tables, and
machine-port geometry are documented in Game Mechanics and the machine E2E
reference.

## Implemented local illumination

`world.illumination` is a derived `0`-to-`100` value for each world-grid cell,
indexed like `world.type`. The renderer samples this field into a transparent
one-pixel-per-cell canvas layer above particles and below machines. Lamp light
appears yellow; Fire, Lava, and Scoria light appears orange in Normal view.
Tint is presentation-only and does not change the numeric field or logical
readings. When emitter colors overlap, the strongest local contribution
chooses the tint while numeric light continues to add and clamp independently.
Alternate visualization palettes are unchanged. The field is rebuilt rather
than saved as per-cell data. Light does not affect temperature, reactions, or
plant viability.

- An ON Lamp with a valid Battery-backed input emits omnidirectionally over 25
  world cells using Euclidean distance. Its contribution at distance `d` is
  `min(100, max(0, 100 * (26 - d) / 25))`; distance 25 receives `100/25`, and
  distance 26 is dark.
- Persistent Fire and Lava emit at peak intensity `50`, and Scoria emits at
  `30`. Each uses linear falloff `max(0, intensity * (6 - d) / 6)` and reaches
  zero at distance six. Fire created by burning Oil or Wood uses the same
  intensity of `50` while it persists.
- Gunpowder records a peak-100 flash at `explode()` before clearing blast cells.
  It spans a ten-cell radius and fades over four simulation ticks. After it
  expires, only resulting Fire remains lit. Sparks and fuses do not emit.
- Emissions add and clamp at `100`. Solids, powders, plants, and machine bodies
  block light; air, gases, Elec, and Tubing transmit it. The overlay is fully
  transparent where there is no emitted light, and viewport clipping does not
  change world-field values. Lamp icon glow is decorative and separate.
- Hover feedback reports numeric illumination for air, particles, and machines.
  Lamp hover reports emission state, its 360-degree/25-cell reach, and received
  intensity.

## Future plant response and extensions

Plant species currently ignore illumination. A future feature could add
light-neutral defaults plus minimum, ideal, and maximum light requirements, then
demonstrate the rule with shade-loving and light-seeking plants. Keep that
viability curve separate from temperature and thermal glow, and preserve
existing gardens and saves when adding species fields.

The current field has no ambient sunlight, day/night, or weather scattering.
Future emitters may add carefully selected materials or directional sources;
each needs explicit intensity, radius/range, blockers, and performance costs.
Solar generation, dynamic colored-light mixing, and light-driven electrical
generation are also out of scope until separately designed.

Focused regressions live in `e2e/feedback/illumination.spec.mjs`,
`e2e/machines/logic-gates.spec.mjs`, and `e2e/machines/ports.spec.mjs`. The
focused browser command for those areas passed 32/32 on 26 September 2026.
