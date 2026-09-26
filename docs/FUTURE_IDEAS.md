# Future ideas and brainstorming roadmap

These are options to explore, not commitments or scheduled work. The aim is to
give future design discussions concrete starting points while keeping ideas
consistent with the game that exists today. Historical completion snapshots
are preserved in the [archive](archive/) index.

## Current starting point

- New games offer two fixed worlds: **260×150** and **520×300**. Both start
  fitted to show their edges. The larger world is flagged as performance-heavy;
  a 780×450 choice was removed after a focused browser start took more than ten
  seconds. The 1040×600 profile is diagnostic only, not a supported world size.
- Electrical logic is steady DC: a conductor is logically ON while its route
  reaches a charged Battery. Switches gate logical current toward declared
  outputs; travelling Sparks are visual effects and do not determine machine
  power. This remains an intentionally readable game rule, not a voltage/current
  simulation.
- Tubing moves discrete stored particles through declared machine ports,
  including storage, Mixer, Sprinkler, Collector, and Splitter connections.
  Connections use touching edges; transfer is limited by the narrowest
  section. Its iron body conducts heat through connected metal and enclosed
  air, but does not conduct electricity or model fluid pressure.
- The local resume game autosaves on a five-minute interval when autosave is
  enabled. Large saves can pause play while they are written, so additional
  world sizes and save-heavy features need measured browser performance.

For exact current behavior, see [PROGRAM_OVERVIEW.md](PROGRAM_OVERVIEW.md) and
[GAME_MECHANICS.md](GAME_MECHANICS.md). Nothing below should be read as
already implemented.

## Power: make circuits easier to understand and extend

The current DC contract provides a stable base for more circuits: machine
inputs read logical current, and directional switches pass that current only
when their rule permits it. The NOT, AND, OR, NAND, and XOR gates have separate
Battery-backed supply and signal routes. A focused AND-to-Lamp circuit confirms
independent source cutoff, eight-neighbor route separation, and output-network
loads billed to the gate's supply, not either signal Battery. See
[Game Mechanics](GAME_MECHANICS.md#3-powered-storage-transfer-and-connection-machines)
and [Canvas feedback](GAME_MECHANICS.md#9-canvas-feedback-and-live-inspection).
Keep future timed pulses separate from sustained current so each behavior has
a clear meaning.

| Candidate | What the player could do | Design point to resolve |
| --- | --- | --- |
| **Toggle / button** | Manually hold a route ON or trigger a temporary action. | Distinguish saved toggle state from momentary activation duration. |
| **Latch / timer** | Remember an input or produce repeatable and one-shot timing. | Specify simultaneous set/reset priority, restart rules, timing bounds, and persistence. |
| **Generator family** | Add a Wind Turbine that turns ambient airflow into stored Battery charge; later consider a Steam Dynamo. | A generator needs a defined output path into the current Battery network and understandable rate feedback. |

The hover panel now reports local material/air state, machine signals, Battery
circuit load, and five-second charge trends with elapsed-time estimates. A
logical-current overlay remains a possible extension; it should stay separate
from cosmetic traveling Sparks.

## Machines that connect the existing loops

The strongest additions would link materials, Tubing, and power rather than
introduce isolated effects.

| Candidate machine | Possible behavior | Existing systems it could join |
| --- | --- | --- |
| **Pump** | Draw Water or another supported liquid from the canvas or a storage bin and push it into a connected route. A direction and rate setting would make the output legible. | Tubing, liquid flow, storage, power. Decide whether it needs a world-facing intake, a tube input, or two variants. |
| **Valve** | Manually or electrically open and close a Tubing connection; a diverter could select one of two destinations. | Tubing routes and Power Switch / Sensor. Begin with a single on/off valve before branching. |
| **Manifold** | Extend the existing balanced two-output Splitter to three or more branches or another explicit routing rule. | Existing bin transfer, Splitter, and Mixer input handling. Needs explicit fairness and bottleneck rules. |
| **Conveyor** | Carry powders or selected solids horizontally, with a powered direction and speed. | Material movement and machine power. Needs careful interaction with falling particles and world boundaries. |
| **Sorter** | Send a supported material type to one of two outputs, leaving unmatched particles on a return path or in a buffer. | Bins, Tubing, manifolds and Mixer recipes. This could turn the current transfer tools into a small production puzzle. |

These are alternatives to investigate, not a list that all needs to be built.
Pump + Valve + storage is a particularly coherent first chain because its
purpose is visible and it extends the existing discrete-particle transport
model without requiring a continuous fluid solver.

## New materials and environmental mechanics

- **Plant nutrients and compost:** let Ash, Wet Ash, or a new Compost material
  improve growth or seed production. A soil-quality readout could make the
  effect observable without adding a hidden global fertility map.
- **Light-responsive plants and additional emitters:** the derived local field
  already combines powered Lamps, Fire, Lava, Scoria, and brief Gunpowder
  explosion flashes. Fire, Lava, and Scoria use orange rendering tints with
  their configured peak intensities; the tint does not change numeric light.
  The field is separate from heat, thermal glow, and plant viability. Let
  selected plants respond to light only after defining species ranges and
  growth behavior; consider other emitters deliberately. The
  [logic gates and lighting proposal](proposals/LOGIC_GATES_AND_LIGHTING.md)
  records those remaining ideas. Ambient sunlight, Solar generation, and
  day/night are later ideas.
- **Wind Turbine element or machine:** use existing decaying airflow as an
  input to a generator. It would pair naturally with the Wind tool and Fan,
  though a powered Fan feeding its own generator must not create free energy.
- **Filter media:** a new porous material or machine insert could remove Toxic
  Gas, Ash, or selected particles from an airflow or Tubing route. This needs a
  clear capacity and replacement rule so filtering is visible rather than
  magical.

These concepts should use the existing material definitions where possible.
Avoid adding near-duplicate materials whose only distinction is a colour or a
small numeric tweak; each new element should create a new interaction or
construction choice.

## Tubing as a production and routing system

Current Tubing has a useful constraint: it transports stored particles through
a connected run with clear bottlenecks. Possible extensions, from smaller to
larger, are:

1. **Manual shutoff:** a Valve stops a route without erasing its contents.
2. **Branching:** a Manifold connects several routes with a documented
   round-robin or priority rule.
3. **World intake and output:** Extend the existing Collector intake and
   Sprinkler release paths with Pumps that move selected materials between the
   canvas and the network.
4. **Filtering or buffering:** an inline Filter rejects or consumes selected
   material; a Reservoir buffers a larger amount and exposes its fill level.
5. **Pressure, only if needed:** richer flow or pressure behavior could make
   construction more expressive, but would require new state, UI feedback, and
   performance testing. It should not be added just to imitate real pipes.

Every extension should define what happens when a route is incomplete, full,
blocked, or connected to an incompatible endpoint. Keep Tubing non-conductive
unless a deliberate combined pipe-and-wire material proves useful; accidental
cross-system coupling would make layouts harder to reason about.

## New ways to play and learn

- **Small guided builds:** short, replayable scenarios such as power a Fan,
  cool a trapped Lava pool, grow a Lily pond, or route Water through a Pump and
  Valve. Teach one rule at a time and allow experimentation after completion.
- **Optional goals and challenge rules:** objectives could ask players to
  produce a material, keep a plant alive, or move a target quantity through
  Tubing. Keep the open-ended sandbox as the default.
- **Richer inspectors:** extend the live hover panel with an optional pinned
  selection, recent-history view, or Tubing flow details without removing its
  existing temperature, charge, transition, and machine-load feedback.
- **Reusable local designs:** expand the current Blueprint workflow into a
  named local gallery with folders or tags. Sharing and online discovery can
  wait until storage, moderation, and compatibility rules are designed.
- **Custom content:** validate material definitions first, then consider a
  constrained mod format. A safe schema is a smaller step than executing user
  JavaScript and can cover many data-driven reactions already supported by
  `particles.json`.

## Combinations worth prototyping

| Prototype | Player-facing loop | Prerequisites / open questions |
| --- | --- | --- |
| **Thermostat** | A temperature Sensor pulses a Heater or Cooler to keep a chamber in a chosen range. | Define sustained activation versus pulse activation; expose the threshold and machine status. |
| **Irrigation** | A Pump feeds a Valve and the existing Sprinkler; a sensor or timer controls watering for plants. | Choose pump intake geometry, route rules, and whether a timer is a new component. |
| **Wind-powered workshop** | Ambient airflow charges a Battery through a Wind Turbine, then runs a Fan or Heater. | Prevent self-power loops; show generation and consumption clearly. |
| **Material line** | A bin supplies a Manifold or Sorter, then two destinations or a Mixer. | Define branch fairness, buffering, and what happens to rejected material. |
| **Rain garden scenario** | A not-yet-implemented optional challenge asks players to use the existing humidity, rain, and plant systems to grow a thriving patch. | Define the scenario, target, and success conditions; it can build on current weather without adding another humidity or rain mechanic. |

## Suggested exploration order and guardrails

1. Consider a logical-current overlay using the existing signal state, keeping
   it separate from traveling-Spark animation.
2. Specify stateful controls such as buttons, latches, and timers separately
   from the implemented combinational gates.
3. Prototype a Pump or Valve and extend Tubing only as far as that use case
   needs; add a small scenario to explain the resulting loop.
4. Consider light-responsive species and additional emitters as separate work;
   profile field updates with dense sources before broadening illumination.

Keep simulations deterministic under the seeded test harness. New machine,
route, or environmental state must be included in both local resume and
portable saves, and the UI should explain blocked, inactive, and full states.
Treat the 520×300 world's autosave pause and measured browser startup/rendering
costs as constraints. Consider larger worlds again only after profiling and
focused browser startup checks support them; parallel or GPU simulation is a
possible later investment, not a prerequisite for these gameplay ideas.

Before implementing any proposal, turn it into a small design note covering
the player action, visible feedback, save behavior, expected cost, and focused
regressions. This file is a brainstorming catalogue, not a promise that the
ideas will ship.
