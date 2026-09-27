# Airflow-Driven Air Mixing Plan

Status: implementation and current performance iteration complete. Focused
air-circulation regressions still have unresolved failures, documented below.
The user confirmed advection through existing air fields, wind exchange through
chamber openings, and aimed Heater/Cooler jets. The user set 200 cells as the
default air-only reach and later requested a debug-menu control for changing
that runtime distance.

## Goal

Make powered Fans, Heaters, Coolers, General Wind, and Gusts move air's existing
temperature and humidity values through open air cells. Machine-driven air
mixing should reach up to 200 cells along a clear route. Keep direct particle
movement and direct machine temperature management within the original 28-cell
cone; transport beyond that cone changes only the air fields. Air outside and
inside an enclosure should flow within their connected domains; outdoor wind
may enter a chamber through an opening, while sealed chambers remain isolated.

## Current architecture

- Empty cells are implicit air. `world.temp` and `world.humidity` already hold
  per-cell air temperature and relative humidity.
- A face-connected (four-neighbor) flood in `markOpenAirCells` distinguishes
  outdoor air from enclosed air. Only the top and side boundaries expose air
  to outdoors; the bottom is implicit ground and does not expose a bottom-only
  cavity to ambient conditions. Diagonal-only contact does not connect ambient
  domains.
- A powered Fan moves particles and adds particle-driving vectors in its
  widening 28-cell cone. General Wind and Gusts also provide vector fields.
- Heater and Cooler directly change air temperature in their 28-cell cones and
  launch rays. Their aimed jet should add scalar-mixing flow without extending
  direct particle effects or direct machine temperature management.
- Wind vectors can move particles, while a separate air-only transport pass
  advects the temperature and humidity fields beyond machine cones.
- Air in sealed chambers circulates as a calm, deterministic, slow 2D roll:
  warm air rises, returns horizontally across the upper chamber, cooler air
  descends, and a lower return closes the loop. This changes only the existing
  air temperature and humidity fields; it does not move particles or materials.
- Normal-mode air tint should reflect the local temperature of enclosed air.
  Outdoor air tint remains controlled by the ambient temperature slider;
  temperature/heat view continues to display `world.temp`.

## Design decision

Keep air as the existing scalar fields on air-space cells. Do not introduce an
explicit air material or per-cell air particles. Adding occupants to the
particle grid would give implicit empty space a second, conflicting occupancy
model, enlarge particle update/collision costs substantially, and require new
material, save/load, placement, and interaction behavior. Instead, transport
the existing temperature and humidity values through connected air-space
neighbors using bounded, buffered scalar transport. This represents bulk
circulation without changing world occupancy or persistence formats.

The transport pass should:

- Use the combined active vector fields from Fans, General Wind, Gusts, and the
  aimed jets from powered Heaters and Coolers.
- Let Fan, Heater, and Cooler scalar mixing reach up to 200 cells along clear
  air routes. The extended field is air-only: Fan particle shoves and direct
  Heater/Cooler temperature management remain limited to the existing 28-cell
  machine cone. Keep existing ray behavior.
- Carry temperature and humidity together so a moving air parcel mixes both
  properties. Keep humidity clamped to its valid range and temperature bounded
  by the same limits used by existing environment and thermal updates.
- Add a calm, deterministic, low-rate circulation roll in connected enclosed
  air even with no active driver. Warm updrafts, upper horizontal returns, cool
  downdrafts, and lower returns form a closed 2D loop. For driven wind and
  machine flow, combine the forward stream with a slower return through the
  same connected air region. Route each leg around solids using face-connected
  air links; do not cross walls or cut diagonal corners. Use bounded,
  conservative buffered transport for temperature and humidity. Keep this
  air-only: do not move particles/materials or directly change material
  temperatures. Existing sources and sinks continue to operate.
- Replace scatter-based writes with stable, order-independent transport from a
  snapshot through reusable buffers. Use bounded pairwise fluxes or an
  equivalent conservative method so transport cannot create extreme values,
  overshoot donor-neighbor ranges, or depend on cell scan order. Existing
  sources, sinks, ambient relaxation, and explicit clamps remain separate.
- Build runtime-only union masks for currently powered Fan, Heater, and Cooler
  machines each frame. Mark each active machine's direct cone through 28 cells
  and its unobstructed air-only extension from 29 through 200 cells; stop both
  masks at wind-blocking solids and storage walls. Clear and rebuild the masks
  every frame so unpowered or removed machines leave no suppression state.
- Suppress only an air-to-non-air thermal contact when the air endpoint is in
  the active air-only extension and the material endpoint is outside the union
  of all active direct cones. Apply this face rule to ordinary contact
  conduction, material `coolingAir` averaging and `coolsBy` clamping, and
  air-material links in `thermalNetwork` transfer. Material-to-material
  conduction and every other unmasked thermal contact stay unchanged. If a
  material falls within any active direct cone, its direct machine effect and
  ordinary contacts remain enabled.
- When a machine powers down or is removed, rebuild the union with its
  extension cleared. Residual airflow and warmed/cooled air remain ordinary
  air state; air-to-material exchange resumes through existing contact,
  `coolingAir`, and thermal-network paths on subsequent frames.
- Clamp Heater updates so air temperature does not rise above the configured
  target; clamp Cooler updates so it does not fall below its configured
  target. A machine already on the wrong side of its target remains a no-op.
- Use the same face-connected (four-neighbor) topology for outdoor exposure,
  ambient relaxation, and scalar transport. Solid cells block transfer; no
  scalar should jump through a wall, and diagonal-only contact does not connect
  outdoor domains or chambers. Ensure sealed chambers do not couple to
  outdoor air.
- Deflect flow around obstacles and add a slower reverse-flow wake downstream
  of them. The wake moves air values through open cells around the obstacle;
  it must never transfer through the solid itself.
- Keep transport incremental. Existing source, diffusion, ambient, and weather
  rules remain active and compose with transport rather than being replaced.
- Allow outdoor wind to move values through each top/side-connected air
  region and into a chamber only through its air opening. Enclosed regions
  remain independent domains except when a real air path connects them.
- Treat the bottom edge as implicit ground for air classification and ambient
  coupling. A cavity exposed only at the bottom remains enclosed; opening its
  top or side reconnects it to outdoor air. This must not change the existing
  material support behavior of the bottom boundary.
- In normal rendering, tint enclosed air from its local chamber temperature
  while open/outdoor air follows the ambient temperature slider/profile.
  Keep heat view sourced from `world.temp`; the tint change is presentation
  only and must not modify simulation fields.

No air particle state or new persisted fields are planned. Existing wind and
machine state should continue to save and load unchanged. In particular, do
not persist the active direct-cone/air-extension masks or add per-cell air
provenance to remember which machine moved a temperature value.

## Scope

In scope:

- A bounded wind-driven transport step for `world.temp` and `world.humidity`.
- Flow contributions from Fan, General Wind, Gusts, Heater, and Cooler.
- Air connectivity and wall blocking for both open and enclosed regions.
- Calm, deterministic, low-rate 2D roll circulation and gradual
  temperature/humidity equalization in enclosed air, with a slower return path
  for driven wind and machine flows in connected air. Transport remains
  conservative, buffered, face-connected, and air-only.
- Top/side-only outdoor exposure, with the bottom treated as implicit ground;
  bottom-only cavities stay thermally enclosed until a top/side opening is made.
- Normal-mode chamber air tint driven by local temperature, with outdoor tint
  driven by the ambient slider and heat view unchanged.
- Up to 200-cell air-only reach for Fan, Heater, and Cooler mixing, with their
  direct particle/temperature effects retained inside the original 28-cell
  cone.
- Fuse compatible face fluxes and active-jet exchange, reuse existing flow
  math, and reduce repeated whole-grid callback/limiter passes while preserving
  conservative bounded results.
- Reuse air-space and storage-wall masks within each scalar transport tick to
  avoid repeated topology queries in the scalar transport phases and limiter,
  without changing the flux equations. Active-jet field construction happens
  earlier in the tick and is outside this reuse.
- Evaluate deterministic two-tick scalar transport as a proposed quick win,
  pending focused correctness tests and performance benchmarks. Run each
  scalar update at its original per-update rate with no doubled rate scaling;
  this updates air scalars at 30 Hz and should reduce average solver cost by
  about half. Skipping every other scalar pass reduces temporal sensitivity
  and can make fast air changes respond less accurately between passes.
  Machine direct treatment, particle movement, weather, and sources/sinks stay
  live every tick. Consider four ticks only if equal-simulated-time results
  remain smooth.
- Add a P0 browser performance fixture/hook targeting complete-frame p95 at
  260x150 and measuring scaling at 520x300.
- Heater/Cooler target caps, bounded stable transport, obstacle deflection, and
  a slower reverse wake that does not carry values through solids.
- Runtime-only active-machine union masks for direct cones and air-only
  extensions, selective air/material contact suppression across extension
  faces, and normal exchange restored as soon as the active mask clears.
- Focused deterministic regressions and relevant mechanics/E2E documentation.

Out of scope:

- A physical air material, pressure/velocity fluid simulation, or individual
  air-particle rendering and collision. The in-scope circulation is a
  simplified deterministic flow-field roll over existing air scalars, without
  a pressure solve or material motion.
- Changes to wind generation, machine power requirements, ports, machine
  geometry, Heater/Cooler ray behavior, humidity source rules, ambient
  temperature profiles, save formats, or UI controls.
- A full test suite unless separately requested. The focused profiling and
  browser timing checks below are in scope; broader benchmark coverage is not.

## Implementation approach

1. Trace the current update order for air classification, temperature and
   humidity diffusion/source rules, Fan vectors, General Wind/Gust vectors,
   and machine cone effects. Choose a stable place for advection so newly
   transferred values compose predictably with those rules.
2. Define the calm enclosed-air roll and the slower return flow for driven
   wind/machine streams over connected air links. Route updrafts, upper returns,
   downdrafts, lower returns, and driven-flow returns around solids, using only
   face-connected empty-air cells.
3. Replace scatter-based scalar writes with conservative, bounded,
   order-independent transport using stable input values and reusable scratch
   buffers. Prove transport alone cannot create peaks or exceed donor-neighbor
   bounds.
4. Extend powered Fan, Heater, and Cooler air-only flow to a maximum 200-cell
   reach. Keep Fan particle shoves and direct Heater/Cooler temperature
   management within their original 28-cell cones. Cap Heater/Cooler air
   temperatures at their configured targets.
5. Derive active-machine direct-cone and air-only-extension union masks from
   powered machines every frame. Use their shared face predicate to suppress
   only out-of-cone air-to-material exchange, covering ordinary contact
   conduction, the material `coolingAir` average/clamp, and thermal-network
   air/material contacts. Leave material/material conduction and all faces
   outside this mask unchanged. Rebuilding the masks must clear suppression
   immediately when no powered machine owns the extension.
6. Deflect flow around obstacles and add a slower reverse wake downstream.
   Keep all transport on face-connected air-space links so no amount transfers
   through a solid. Use this same four-neighbor connectivity for outdoor-domain
   classification and ambient relaxation, so a diagonal-only corner cannot
   connect two domains.
7. Document the behavior in `docs/GAME_MECHANICS.md` and update the owning
   deterministic and browser E2E documentation. Check machine-specific details
   against `docs/MACHINE_CONSTRUCTION_STANDARDS.md`; no geometry or port changes
   are expected.

## Solver performance plan

The scalar solver currently repeats whole-grid callback and limiter passes.
Reduce that work without weakening the bounded, conservative transport
contract:

1. Profile the complete frame at 260x150 and 520x300. Record p95 and identify
   the cost of full-grid scalar passes, limiter iterations, flow-field work,
   active-jet exchange, and rendering.
2. Fuse compatible face fluxes and active-jet exchange into fewer grid scans.
   Reuse the existing Fan, wind, gust, and machine flow calculations instead
   of building equivalent flow math in another pass.
3. Replace the current eight limiter iterations only with a validated bounded
   and conservative limiter. Preserve donor/neighbor bounds, deterministic
   order-independent output, temperature and humidity limits, and all focused
   regression behavior. Do not remove limiter work solely to improve speed.
4. Treat deterministic every-other-tick scalar transport as a proposed quick
   win, pending focused correctness and benchmark confirmation. Keep the
   original per-update transport rates without doubled rate scaling: air scalars update
   at 30 Hz and average solver cost should fall by about half. This reduces
   temporal sensitivity and accuracy for fast temperature/humidity changes
   between scalar updates. Keep direct machine treatment, particle movement,
   weather, and sources/sinks live every tick. Compare cadence choices over
   equal simulated time, inspect due-frame peaks, and confirm the sensitivity
   tradeoff is acceptable before adoption. Consider every four ticks only if
   those results remain smooth and bounded.
5. As the next proposed quick win, derive the air-space and storage-wall masks
   once per scalar transport tick and reuse them across topology queries for
   the scalar transport phases and limiter only. Active-jet field construction
   happens earlier in the tick and is excluded. This should reduce repeated
   topology queries without changing any flux equation. Keep the masks transient
   and rebuild them from current cell topology on the next transport tick.
6. Add the second proposed quick win in the face sweep: skip an edge only when
   both eligible endpoints exactly equal the live background values for every
   enabled scalar field. Use strict equality, without a tolerance, so small
   anomalies remain active; an edge with a temperature or humidity anomaly
   must still be evaluated. Add a `uniformBackgroundEdgesSkipped` counter.
   Validate unchanged flux results for active and mixed temperature/humidity
   cases, then benchmark the current 260x150 air-driven p95 of 43.3 ms against
   the 41.67 ms budget. This optimization remains pending focused tests and
   benchmark confirmation.
7. Consider caching face-connected air topology across transport ticks only if
   profiling justifies it. Invalidate any cache after connectivity-changing
   cell edits, opening or closing walls, world resize/reset, and state
   restore/load; otherwise rebuild from the current world.
8. Extend `performance/p0-browser.spec.mjs` with calm sealed-air circulation
   and driven wind/machine-jet fixtures that include an obstacle and an
   opening, at 260x150 and opt-in 520x300. Use the existing optional
   `window.__P0_PERF__` hook with an `airScalarTransport` event and numeric
   counters for air cells, horizontal/vertical face visits, limiter passes,
   cadence, active machines, masks, active jets, and uniformly skipped
   background edges. For every measured sample,
   sum `stepSimulation`, `decayWindTrails`, `renderWorld`, and `feedbackFrame`
   into `completeFrame`, then report the p95 of those sums against the 41.67 ms
   (24 FPS minimum) target. Keep the timing target informational rather than a
   host-sensitive automated pass/fail threshold; use the existing performance
   project and npm command.
9. Re-run the focused deterministic and browser correctness regressions after
   solver, limiter, or cadence changes. Keep performance and correctness
   verification pending until implementation review and these checks are
   complete.

## Acceptance criteria

- [ ] A powered Fan's flow transports both local temperature and humidity in
  the direction of its airflow, visibly affecting air near the machine and
  reaching up to 200 cells where the route is clear. Particle shoves remain
  confined to the original 28-cell cone.
- [ ] General Wind and Gusts transport both fields through the outdoor domain;
  disabling Breeze stops new wind-driven transport as its vector fields clear
  or decay under existing behavior.
- [ ] Powered Heater and Cooler produce a modest oriented air jet that carries
  their warmed/cooled air and humidity up to 200 cells downstream, without
  extending direct particle/temperature effects beyond the original 28-cell
  cone or changing existing ray behavior. Heating never raises air above the
  configured target, and cooling never lowers it below the configured target.
- [ ] A Mud cell at +70 along a powered Heater path stays at its starting
  temperature while the air at that distance is heated by the 200-cell
  air-only effect. Non-air direct temperature effects remain confined to the
  28-cell cone. Confirm the mask handles ordinary face conduction and
  material cooling-air averaging without disturbing unrelated material
  conduction.
- [ ] The runtime mask is the union of all active machines' direct cones
  (through 28 cells) and air-only extensions (29-200 cells). Mask only a
  cardinal air/material face whose air cell is in an active extension and
  whose material cell is outside every active direct cone. Ordinary material
  contact conduction outside those faces stays unchanged.
- [ ] The face mask covers all three existing heat paths: `thermalContactRate`
  conduction, adjacent-air selection for material `coolingAir` and `coolsBy`,
  and air/material pairs in `thermalNetwork`. Material/material transfer and
  air/material transfer in direct cones or outside active extensions remain
  enabled.
- [ ] Turning off or removing the Heater clears its runtime mask on the next
  frame. Residual air still exchanges heat with the Mud through ordinary
  contact, `coolingAir`, and thermal-network rules as applicable.
- [ ] If an active machine's extension overlaps another active machine's
  direct cone, the union mask preserves normal contact at the material cell
  inside that direct cone. Opening/removing machines updates the mask on the
  next frame from currently powered machines and live obstacle/storage walls.
- [ ] Solid barriers prevent scalar transfer across blocked air-space links.
  Flow deflects around obstacles and creates a slower reverse-flow wake on the
  downstream side without moving air values through the solid. A wall with an
  opening permits gradual exchange; sealing it stops cross-domain mixing.
  Outdoor classification, ambient relaxation, and transport all use
  face-connected air paths, so a diagonal-only corner sealed by two solid
  faces remains isolated.
- [ ] A sealed chamber retains its own temperature and humidity distribution
  under outdoor wind; a chamber connected by an opening can exchange air with
  the outside through that opening.
- [ ] Enclosed air circulates without a machine or wind driver as a calm,
  deterministic, slow 2D roll: warm air rises, flows horizontally across the
  upper region, cooler air descends, and a lower horizontal return closes the
  loop. It gradually reduces temperature and humidity variance while remaining
  bounded and conservative. It is air-only and does not move particles or
  materials.
- [ ] Driven wind and machine streams in a connected air region are accompanied
  by a slower return flow. Main and return paths follow face-connected air
  around solids, remain bounded and conservative, and never transfer through
  walls or cut diagonal corners.
- [ ] Fan, Heater, Cooler, and natural wind can carry temperature and humidity
  through a connected opening. A sealed wall and a diagonal solid corner block
  cross-domain transfer.
- [ ] Enclosed humidity does not relax to the outdoor ambient humidity merely
  because time passes; existing humidity sources and sinks still work.
- [ ] A bottom-only cavity stays isolated from extreme outdoor temperature
  targets because the bottom is implicit ground. Opening a top or side path
  reconnects it to outdoor ambient behavior.
- [ ] In normal rendering, a room at ambient temperature has neutral air tint,
  open/outdoor air follows the ambient slider tint, and locally hot/cold
  chamber air tints from its own temperature. Heat view remains driven by
  `world.temp`.
- [ ] Transport is deterministic and scan-order independent. Stable buffered
  fluxes remain within donor-neighbor bounds, cannot create extreme peaks such
  as the observed ~27,000 C result, keep humidity within 0-100%, and never
  transfer values through solid cells.
- [ ] Compatible face fluxes and active-jet exchange are fused into fewer
  whole-grid passes and reuse existing flow math. The replacement limiter is
  validated to remain bounded and conservative; limiter iterations are not
  removed without that validation.
- [ ] Air-space and storage-wall masks are reused within each scalar transport
  tick for scalar transport phases and the limiter only; active-jet field
  construction is excluded. Reuse removes repeated topology queries without
  changing flux equations. Masks are rebuilt from current connectivity each
  tick, so wall and cell edits cannot leave cross-tick topology stale.
- [ ] The face sweep skips an edge only if both eligible endpoints exactly
  match the live background for every enabled scalar field. Strict equality
  preserves small anomalies; mixed temperature/humidity edges remain active.
  The `airScalarTransport` event reports a `uniformBackgroundEdgesSkipped`
  counter, with focused tests and benchmark confirmation pending.
- [ ] The proposed deterministic two-tick scalar cadence is confirmed by
  focused correctness tests and benchmarks before adoption. Keep original
  per-update rates without doubled rate scaling, giving 30 Hz scalar updates
  and an expected average solver-cost reduction of about half. Its reduced
  temporal sensitivity/accuracy for fast scalar changes is acceptable; direct
  machine treatment, particle movement, weather, and sources/sinks remain live
  every tick. Inspect due-frame peaks. Consider four-tick cadence only after
  equal-simulated-time comparisons show acceptable smoothness and a material
  performance gain.
- [ ] Any optional air-topology cache invalidates after connectivity-changing
  edits, wall openings/closures, resize/reset, and state restore/load.
- [ ] At 260x150, the p95 of per-sample `completeFrame` sums is at most 41.67
  ms (a minimum of 24 FPS), where each sum is
  `stepSimulation + decayWindTrails + renderWorld + feedbackFrame`; record
  opt-in scaling at 520x300. The P0 browser run has
  `air-calm` and `air-driven` fixtures; the driven scene uses a powered Heater,
  an opening, and a Glass obstacle. Both report `airScalarTransport` through
  `window.__P0_PERF__`, including air-cell, horizontal/vertical face, limiter,
  cadence, active-machine, mask, and active-jet counters. Keep timing
  informational without a host-sensitive automated pass/fail threshold.
- [ ] Existing source, diffusion, ambient, and weather rules continue to work;
  no save migration, per-cell air provenance, or persisted mask field is
  required.
- [ ] Focused physics and browser regressions cover machine jets, outdoor wind,
  wall blocking, open/sealed chamber domains, both transported scalars, and
  persistence compatibility if state serialization is touched.

## Focused test plan and verification

The Windows focused command `npm.cmd test -- --focus=air-circulation`
(`npm test -- --focus=air-circulation` on POSIX) runs both
`runAirCirculationRegressions()` and the expanded
`runAirflowBoundaryRegressions()` in `tools/simTest.mjs`. The focused scope
includes the following cases; implementation and verification are pending:

- The solver regression runs calm mixing for 480 simulated ticks in the
  sealed 64x64 fixture, then repeats it with the same seed and compares the
  complete temperature and humidity fields. It checks gradual equalization,
  closed-loop warm-updraft/upper-return and cool-downdraft/lower-return
  transport, conserved chamber means, global temperature/humidity bounds,
  local face-neighbor bounds, unchanged particle occupancy and material
  temperatures, and air-only scalar movement. Instrumentation must show a
  deterministic two-tick interval, exactly 240 transport runs and 240 skipped
  scalar ticks, and one limiter aggregation per run (240 versus the prior
  7,680 scalar limiter passes over the same 480 ticks), with numeric work
  counters. The existing focused air regressions also cover machine reach and
  direct-effect boundaries, chamber opening/isolation, and obstacle routing.

- Calm sealed-air mixing uses a 64x64 fixture with seed 9147, a warm/humid
  source block at x=23..25, y=43..45 (100 C/90%), and a cool/dry block at
  x=43..45, y=14..16 (-20 C/10%), against a 20 C/50% baseline. After 180
  ticks, matched runs must have identical complete temperature and humidity
  arrays, temperature and humidity variance must each decline by more than
  0.05, and means must remain within 18..22 C and 45..55% RH. Warm air at
  (24, 36) must exceed its lateral sample at (32, 44) by more than 0.02 C;
  cool air at (44, 23) must be more than 0.02 C colder than its lateral sample
  at (52, 15). The world type array must remain unchanged. The separate full
  roll regression below checks both horizontal return legs.
  Copper at (55, 55) must stay within 0.05 C of an otherwise identical
  no-anomaly 180-tick control, accounting for ordinary altitude cooling.
- Full 2D-roll coverage uses a 64x64 world with a 48x48 Insulation cavity shell
  spanning x/y=8..55 (46x46 empty interior). Combined, warm-only, and cool-only
  fixtures each run 480 ticks. The warm/humid source occupies x=19..21,
  y=37..39 (80 C/90% RH); the cool/dry source occupies x=43..45, y=25..27
  (-40 C/10% RH). Repeat the combined run with the same seed and require
  identical temperature/humidity arrays, means within 0.5 C and 0.5 percentage
  point of their starting values, temperature bounded to -40..80 C, humidity
  bounded to 0..100%, unchanged particle occupancy, and unchanged non-air
  temperatures. The warm plume rises at (20, 32) versus lateral sample
  (26, 38); in a warm-only run its upper-right return must carry warmer and
  more humid air from (20, 20) to (24, 20), each by more than 0.02. The cool
  plume descends at (44, 32) versus lateral sample (38, 26); in a cool-only
  run its lower-left return must carry colder and drier air from (44, 44) to
  (40, 44), each by more than 0.02.
- Diagonal-only ambient isolation leaves only top cell (19, 0) open, puts Glass
  at (19, 2) and (20, 1), and samples the target at (20, 2) beside the
  face-connected control at (19, 1). Starting temperature and humidity are
  100; outdoor targets are -40 C/0% RH. After 120 ticks, the corner target
  must remain near 100 C and above 95% RH while the face-connected control's
  humidity drops below 95%. This checks that diagonal-only contact cannot
  connect ambient domains.
- The bottom-only cavity test uses a 64x64 world with open top and side outdoor
  boundaries and a Glass chamber with interior x=21..39, y=43..62 (bounded by
  x=20..40 and top row y=42), with its bottom row at y=63 closed except for
  the opening at (30, 63). Outside is -40 C/0% RH; the chamber starts at
  100 C/80% RH, with General Wind and Gust strength 50 and ambient wind on.
  After 90 ticks its center at (30, 52) must remain classified enclosed and
  retain heat and humidity. Opening the windward side at y=52 (left or right
  wall selected from prevailing wind direction) then running 120 ticks must
  change `openAir` from enclosed to connected and move its center toward
  outdoors.
- Sealed humidity retention uses a 64x64 fixture with ambient humidity target
  0% and starting humidity 50%. Water at (22, 40) and Dry Mud at (42, 40) are
  each trapped in a 3x3 Glass shell with its sole air opening immediately above.
  After 120 ticks, center-room humidity at (32, 32) must remain above 35%,
  Water must remain a humidity source, and the Water-adjacent air at (22, 39)
  must be at least 0.1 percentage point more humid than air above the Dry Mud
  at (42, 39).
- Existing outdoor-wind opening coverage compares General Wind and Gusts in
  matched sealed and open-chamber fixtures: the opening is at wall x=30,
  y=22; the warm/humid source is four cells upwind and the sample is two cells
  inside. After 24 ticks, both scalar anomalies just inside the opening must
  exceed those behind the sealed wall.

- In a 128x64 sealed boundary fixture, powered Fan, Heater, and Cooler each
  start at (4, 32), with a warm or room-temperature/humid source at x=14..16,
  y=31..33, then carry values near +198 after 180 ticks. Temperature is sampled
  at (202, 40) and humidity at (202, 32). Relative to matched unpowered
  controls, Heater/Fan temperature must increase and Cooler temperature must
  decrease by more than 0.01 C; all three humidity values must rise by more
  than 0.001%. For Fan, the air-mix vector magnitudes must taper
  `+54 > +198 > +200`; humidity deltas at +198 and +200 must both exceed
  0.001%, with +200 no larger than +198. Earlier +54/72-tick scalar checks
  remain in the focus.
- Fan particle movement is tested at +27 for one tick and +29 for two ticks;
  only the inside particle should move. Powered Heater/Cooler direct
  temperature effects use Ceramic at offsets (+12,-27) inside and (+16,-29)
  outside from a machine at (32, 50), both initialized to 20 C and positioned
  off the ray centerline. After one tick, compare powered and unpowered cases:
  the inside material changes in the configured direction and the outside
  material does not receive a direct machine temperature effect.
- Two opposing Heater setpoints of 30 C (20 C baseline) and two opposing
  Cooler setpoints of 20 C (30 C baseline) run for 60 ticks. Air and Ash at
  x=34 must not pass their respective configured target.
- Four Fans aimed toward a common interior area in a 96x64 fixture run for 80
  ticks. The whole temperature field must remain finite, with minimum above
  -100 C and maximum below 1000 C.
- The +70 Heater/Mud case uses a 96x64 fixture, a powered Heater at (4, 32),
  target 30 C, and Dry Mud at (74, 63) on the implicit ground boundary, with
  no Glass support. Mud starts at adjacent air temperature at (74, 62). After
  180 ticks, air at (74, 62) must be warmer than the unpowered control, while
  Mud at (74, 63) remains within 0.05 C of its unpowered temperature. A +27
  Dry Mud case after one tick remains supported by three Glass cells at 20 C
  and confirms the direct Heater effect still applies inside the cone.
- An unmasked ordinary-contact control places Dry Mud at (40, 62) next to
  air at (39, 62) initialized to 100 C; one simulation step must warm the Mud
  above 20.05 C. An unmasked thermal-network control places 100 C Copper at
  (40, 62) next to enclosed air at (39, 62); one step must warm that air above
  20.05 C while its open-air flag remains clear.
- With a Fan facing a Glass obstacle at (20, 32), one tick checks incoming
  forward flow at (18, 32), upward/downward deflection at (19, 31)/(19, 33),
  and slower reverse flow at (22, 32). Humidity must remain at baseline in the
  obstacle and directly lee-side cell. A direct-corner fixture starts warm,
  humid air at (20, 20), blocks (21, 20) and (20, 21) with Glass, then compares
  the (21, 21) target after one tick with and without a diagonal airflow vector
  at the source; its humidity must not change from that vector. Together with
  the diagonal-only ambient fixture above, these checks ensure face-connected
  classification, ambient relaxation, and direct scalar transport cannot pass
  between domains through two blocked cardinal faces.
- The driven scalar-return regression compares a powered and unpowered Fan at
  (4, 32), facing a Glass obstacle at (20, 32), with warm/humid source air at
  (18, 32). After 120 ticks, temperature and humidity at the edge route
  (20, 31) and reversed wake (22, 32) must exceed the unpowered control by
  more than 0.01 C and 0.001% RH, respectively. The wake vector must point
  backward, humidity in the Glass must remain at baseline, and the world type
  array must remain unchanged in both runs.
- The active Heater/Dry Mud comparison uses the +70 bottom-boundary fixture:
  a 96x64 world, Heater at (4, 32), target 30 C, and unsupported Dry Mud at
  (74, 63) initialized to adjacent air temperature at (74, 62). After 180
  ticks, air at (74, 62) must be warmer than the unpowered control while Mud
  stays within 0.05 C of its unpowered temperature. The same fixture compares
  Dry Mud at +27 after one tick, where it remains supported by three 20 C Glass
  cells, to prove direct heating still occurs inside the cone. A separate
  ordinary-contact control has Dry
  Mud at (40, 62), 100 C adjacent air at (39, 62), and one tick to confirm
  normal air/material conduction outside any active mask.
- A masked thermal-network comparison uses the same Heater at (4, 32) and
  Copper at (74, 40), initialized to its adjacent air temperature at (74, 39),
  for 180 ticks. Heated air must be
  warmer than its unpowered control while Copper stays within 0.05 C of its
  unpowered temperature. A separate 100 C Copper at (40, 62) next to enclosed
  air at (39, 62) confirms ordinary thermal-network transfer outside a mask.
- For mask clearing, the Heater/Copper +70 fixture starts Copper at its
  adjacent air temperature, runs 180 powered ticks, captures state, removes
  every Battery in the world, then runs two ticks.
  The capture must contain no mask/provenance fields; the Heater is unpowered,
  residual air remains warm, and Copper must warm by more than 0.005 C.
- The test file does not yet cover a material inside a second active machine's
  direct cone while it overlaps another machine's air-only extension, or
  explicitly check material/material conduction across the mask. Add focused
  controls for those union/unchanged-conduction contracts if needed.

The regressions continue to use implicit EMPTY air and existing scalar fields,
without adding air-particle state. They cover machine range, 28-cell direct
effect boundaries, the +70 Heater/Dry Mud isolation case, ordinary contact and
thermal-network behavior inside and outside an active mask, target caps, a
whole-field finite/maximum bound, obstacle deflection/reverse wake, blocked
solid/corner transfer, open-chamber exchange, off-state residual exchange, and
absence of persisted mask/provenance fields. A direct overlap case for the
union of one machine's direct cone with another machine's extension, and a
masked material/material conduction control, are not present. The existing
field-bound case does not compare results under different cell scan orders.

The first focused run reported **19 passed, 11 failed** before the final Cooler
convergence-fixture adjustment and before the newer Mud/contact controls were
added. The reported failures included all +198 reach assertions, the Fan +29
particle-bound assertion, target overshoot cases, and obstacle/wake assertions.
The final Cooler convergence case uses its valid 20 C target with a 30 C
baseline. The Mud, masked-network, post-power-off, and persistence assertions
also postdate that run; the current expanded focus has not yet been run against
the implementation.

Browser-visible Fan circulation coverage is in
`e2e/machines/powered.spec.mjs`: the test samples warm, humid air at +198 after
180 steps, comparing temperature against the local ambient temperature and
humidity against its 50% baseline. A vertical Battery bank immediately left
of the Fan keeps it powered for all 180 steps. An initial browser probe
used a fixed 20 C baseline at a height where ambient is colder; the current
assertion uses the local ambient temperature. This regression has not yet been
run against the implementation. The same spec checks that an unpowered Fan
emits no directional airflow, and Heater/Cooler browser coverage checks rays
and cone display.

Normal-render tint coverage is in `e2e/physics/thermal.spec.mjs`. It creates
sealed rooms at x=40..52, x=60..72, and x=80..92 (y=40..54) with local
temperatures of 20 C, 120 C, and -20 C, while outdoor ambient is -40 C. It
checks normal-view tint at room samples (46, 47), (66, 47), and (86, 47)
against each sample's local temperature, and at outdoor (110, 47) against the
ambient target. Heat view is checked for hot/cold color direction. This browser
regression is pending verification.

Focused commands, to run after implementation:

```text
npm test -- --focus=air-circulation
npm run test:browser -- e2e/machines/powered.spec.mjs --workers=1 --trace=off
npm run test:browser -- e2e/physics/thermal.spec.mjs --workers=1 --trace=off
npm run test:performance
```

The P0 performance command defaults to 260x150 and includes `air-calm` and
`air-driven` fixtures. It reports per-sample `completeFrame` as the sum of
`stepSimulation`, `decayWindTrails`, `renderWorld`, and `feedbackFrame`, then
reports p95 against the 41.67 ms (24 FPS minimum) target without a timing
pass/fail threshold.
`feedbackFrame` alone measures UI feedback and is not the complete-frame
metric. Set `P0_PERFORMANCE_SCOPE=all` before rerunning it to include 520x300.

The interval-2 P0 run at 260x150 measured air-calm complete-frame median/p95
of 30.45/47.8 ms and air-driven median/p95 of 30.9/46.4 ms. Cadence improves
typical frame cost, but the p95 misses the 41.67 ms budget on transport due
frames. Review and focused verification remain pending; inspect those due-frame
peaks while evaluating the per-transport-tick mask reuse above.

The current 260x150 air-driven complete-frame p95 is 43.3 ms, still above the
41.67 ms budget. The face-sweep background-edge skip is the next proposed
optimization; its counter, correctness tests, and benchmark confirmation are
pending.

The initial host baseline measured `stepSimulation` alone at p50/p95 160.6/
165.0 ms for `air-calm` and 155.1/157.5 ms for `air-driven`; these are not
composite `completeFrame` timings. The benchmark saved its timing artifact but
ended with expected missing-counter assertions before the new instrumentation
was available. This is baseline evidence only, not focused verification.

On Windows, invoke these focused commands with `npm.cmd`:

```text
npm.cmd test -- --focus=air-circulation
npm.cmd run test:browser -- e2e/machines/powered.spec.mjs --workers=1 --trace=off
npm.cmd run test:browser -- e2e/physics/thermal.spec.mjs --workers=1 --trace=off
npm.cmd run test:performance
```

For the Windows full-scale P0 run:

```powershell
$env:P0_PERFORMANCE_SCOPE = 'all'
npm.cmd run test:performance
```

Do not run a full suite without user approval under the project instructions.
Run the scoped focused correctness regressions, P0 browser timing fixture, and
scale-profile checks after implementation and review. A separate broad
benchmark suite is outside this plan.

## Risks and performance

- Machine flow footprints extended to 200 cells and unnecessary full-grid
  passes can increase frame cost, especially at larger world sizes. Fuse
  compatible work, keep the computation allocation-light, reuse typed buffers,
  and measure complete-frame timings at both planned world sizes.
- Scatter or unbounded in-place updates can create scan-order bias, artificial
  scalar gradients, extreme temperature peaks, or instability. Use a stable
  bounded flux method and test repeated transport in both horizontal
  directions.
- Combining the Fan, wind, gust, and heater/cooler vectors may create stronger
  flow than any one source. Clamp resultant transport per step and avoid
  changing particle-force calibration as part of this work.
- Outdoor/enclosed classification and all air transport use the same
  face-connected four-neighbor topology. A diagonal-only path behind two
  blocked cardinal faces cannot connect ambient domains or transfer scalar
  values through a sealed corner.
- The 200-cell reach applies to air-field transport only. Particle shoves and
  direct Heater/Cooler temperature management stay inside the original
  28-cell cone.
- Humidity clamps and outdoor ambient/weather relaxation can alter total field
  values independently of advection; deterministic tests should isolate
  transport or account for those established sources and sinks.

## Documentation touchpoints

- `docs/GAME_MECHANICS.md`: powered Fan/Heater/Cooler behavior, air temperature
  and humidity mixing, barriers, outdoor/enclosed domains, and retained source
  and ambient behavior.
- `docs/E2E_TEST_PLAN.md`: ownership and npm commands for the focused
  deterministic/browser coverage, with results recorded after implementation.
- `performance/p0-browser.spec.mjs` and `performance/README.md`: calm and
  driven airflow fixtures, the optional scalar-transport timing hook, and
  complete-frame p95/scaling measurement method.
- `e2e/machines/README.md`: powered machine circulation scenario ownership.
- `docs/MACHINE_CONSTRUCTION_STANDARDS.md`: review the standards; update only
  if implementation changes a machine's declared roles, anchors, controls,
  markers, materials, collision, persistence, or openings.

## Selected working defaults

1. Use up to 200 cells for machine-induced air-field circulation along a clear
   flow path. The 28-cell direct cone remains unchanged.
2. Powered Heaters and Coolers create aimed airflow jets in their stored
   orientation in addition to their current heating/cooling and ray behavior.
   The user confirmed this behavior.
3. Outdoor wind mixes top/side-connected air and enters chambers through
   face-connected openings, while sealed chambers remain separate domains.
   The bottom is implicit ground. The user confirmed this behavior.

## Current implementation and verification (2026-09-28)

- Scalar temperature/humidity transport runs every other simulation tick at
  its original per-update rate (30 Hz at the normal simulation cadence).
  Direct machine treatment, particle movement, weather, and sources/sinks
  remain per tick.
- Every due transport update builds a transient three-state air topology mask
  once and reuses it through the scalar scans and limiter, including the
  existing storage-wall distinction. A face is skipped only when both eligible
  endpoints exactly match the live background for every enabled scalar; the
  strict comparisons do not discard small anomalies. The performance counter
  can correctly remain zero when a fixture has no exact-background edges.
- Focused deterministic selection (`npm.cmd test -- --focus=air-circulation`):
  51 passed, 17 failed. Passing coverage includes the transport cadence,
  topology/storage-wall behavior, and the exact-background skip counter. The
  remaining failures concern airflow scalar thresholds, obstacle/circulation
  expectations, doorway exchange, and open-world field assertions; these are
  still visible in the harness and are not treated as passed.
- Focused P0 browser benchmark (`npm.cmd run test:performance`) passed at
  260x150 with 10 warm-up and 60 measured samples. Complete-frame p95 was
  46.0 ms for calm air and 38.3 ms for driven air, against the 41.67 ms
  reference target. The particle-baseline p95 was 93.1 ms; these results do not
  establish a 24 FPS floor for every workload. Artifacts are written to the
  ignored `test-results/performance/p0-browser.json` and `.csv` files.
