# Proposal: composable logic gates and local light for plant growth

**Status: Proposal - not implemented.** This document records design direction
for future work. It does not describe current game behavior or authorize
implementation by itself.

## Design goals

- Extend the steady, Battery-backed DC model with predictable, composable
  logic and visible feedback.
- Add a local light field that can connect powered Lamps and explicitly
  light-emitting materials to plant growth.
- Keep light distinct from temperature, humidity, thermal color, and cosmetic
  traveling-Spark animation.
- Keep simulation deterministic and affordable in both supported world sizes.

## Electrical component recommendations

### Preserve the current DC contract

Treat a conductor as logically ON only while its route reaches a charged
Battery. Simple Switch and Temperature/Humidity Switch components gate current
toward their declared outputs. `world.power` and `world.powerDelay` remain
visual Spark-animation state; they are not inputs to logic. New electrical
components should use that logical-current contract and expose their ports and
active state clearly.

### Add a small combinational gate set

Start with four directional, stateless gates:

| Gate | Signal inputs | Output rule |
| --- | ---: | --- |
| NOT | 1 | ON when its input is OFF |
| AND | 2 | ON when both inputs are ON |
| OR | 2 | ON when either input is ON |
| XOR | 2 | ON when exactly one input is ON |

Do not add NAND, NOR, or XNOR initially; players can compose them from these
gates. Outputs should respond to sustained input levels and remain stable for
as long as the expression and supply remain true. Keep timed pulses as a
separate family of behavior.

Before implementation, specify how a gate receives its power supply and how
its output load is charged. In particular, NOT must be able to produce an ON
output when its signal input is OFF without creating free energy. Prefer an
explicit supply contact or route separate from signal inputs, with output
current accounted against the connected Battery. Set a modest documented
gate-load budget, define fan-out, and keep that budget separate from Lamp
illumination load. Signal inputs should read only their declared routes; the
body must not create broad hidden contacts or back-feed another input.

Combinational gates should have a clear evaluation order and deterministic
behavior. Feedback loops, disconnected supplies, overloaded outputs, and
ambiguous routes need defined outcomes before they are built. Keep memory and
timing out of the combinational gate definitions so steady logic remains easy
to predict.

### Add state and timing as separate components

After the basic gates, consider these practical controls:

- A maintained toggle for persistent manual ON/OFF control.
- A momentary button for a temporary signal while held or during a clearly
  specified activation window.
- An SR latch for memory, with an explicit set/reset priority when both inputs
  are active.
- An adjustable clock or timer for repeatable intervals.
- A one-shot, delay, or pulse extender for timing a single transition or
  lengthening a short trigger.

Keep each component directional where appropriate, make state visible, and
persist user-configured or latched state through save/load and blueprints.
Lamp already serves as a useful signal indicator. A later light comparator
could connect the light field to the same sensor-and-gate system.

Useful player feedback includes a logical-current overlay, a per-cell or
per-route ON/OFF inspector, and a machine status readout that distinguishes a
missing Battery route, an OFF input, a blocked rule, and an overloaded output.
Diagnostics should show logical current independently from visible travelling
Sparks.

## Local light field proposal

### Represent light separately from heat and appearance

Add a derived scalar `light` value from 0 to 100 per cell. Do not infer light
from temperature, thermal color, or a material's heat-emission value. Existing
glow is a rendering treatment, and heat emission remains a thermal behavior.
Materials that should illuminate the world must be explicitly marked as light
emitters.

Each emitter should define strength, range, display color, and projection
shape. A powered ON Lamp emits while it has logical DC current and projects in
all directions through 360 degrees. Directional emitters can project a cone
with a configured angle, or a laser-like single line with a defined width and
range. Orient each directional projection from the component's facing and
show that facing in its icon. A curated set of materials may emit without
electrical power; choose those deliberately and document their values. Spark,
Spark Dust, and Spark Block effects should not automatically count as
illumination just because they animate or glow in the icon.

Start without ambient sunlight or a day/night cycle. Compute local irradiance
with deterministic distance attenuation within each emitter's projection.
For the initial occlusion rule, every solid particle, plant particle, and
machine body blocks light. Elec wires and Tubing do not block light. Apply
this rule consistently to omnidirectional, cone, and line projections; the
emitter's own occupied cell is the source and does not shadow its own output.
Do not add material-specific translucent transmission in the first version.
Contributions from multiple emitters should combine deterministically and
clamp at 100. Source removal, Lamp power-off, moved emitters, and changed
blockers must update the affected field without leaving stale light behind.

### Connect light to plant viability

Allow species to declare minimum, ideal, and maximum light values alongside
their existing temperature, humidity, and substrate requirements. Fold light
fitness into plant viability using a documented curve. Existing species
should default to light-neutral so adding the field does not invalidate
existing gardens or saves. Add a small number of shade-loving and
light-seeking species to demonstrate the new rule.

Provide a Light visualization or inspector that displays the computed field
and the selected cell's value. Keep it distinct from the Heat view and make
clear that it shows simulated irradiance, not material temperature.

### State, cost, and edge cases

- Treat the light field as derived state. Rebuild it deterministically after
  load or blueprint stamping instead of persisting every cell's value.
- Define source overlap, attenuation order, boundary behavior, projection
  geometry, and exact shadow updates before implementation. Preserve the
  initial blocker contract: solids, plants, and machines block; Elec and
  Tubing transmit light.
- Prefer source/dirty-region updates or a bounded propagation frontier over
  rescanning every source against every world cell each frame.
- Profile both supported world sizes with dense emitters, solid/plant/machine
  blockers, and transmitting Elec/Tubing routes. Set a measurable frame-time
  budget.
- Keep the first version local and static: ambient sun, day/night, weather
  scattering, dynamic colored-light mixing, Solar Panels, and light-driven
  electrical generation remain out of scope.

## Suggested implementation order and focused checks

1. Specify gate supply, signal, fan-out, and load semantics; test each truth
   table, sustained ON/OFF transitions, directionality, disconnection, and
   deterministic behavior. Check that the NOT gate cannot create power without
   a charged supply.
2. Add stateful controls and timing only after the combinational level model is
   stable; cover set/reset priority, timing boundaries, restart, and
   persistence.
3. Implement a deterministic light field with one powered Lamp and a small
   curated material-emitter set. Check omnidirectional, cone, and line
   projections; attenuation; solid, plant, and machine occlusion; Elec/Tubing
   transmission; overlapping sources; source removal; and rebuild after load
   or blueprint stamping.
4. Add light-neutral defaults for existing plants, then light-responsive
   species. Check viability at minimum, ideal, and maximum values and verify
   that old saves preserve their growth behavior.
5. Profile the supported world sizes with worst-case source and blocker counts
   before considering ambient light or solar generation.

This proposal is a starting point for a bounded implementation plan. Update
current mechanics documentation only after a specific feature is implemented
and verified.
