# Performance review — 26 September 2026

## Scope and confidence

This is a read-only source review of the simulation, electrical paths, and
renderer. No tests or benchmarks were run for this review. The code findings
below are hypotheses about cost based on loop scope and allocation behavior;
they are not profiler measurements. The historical measurements are labeled
separately and predate this review.

## Findings

### Existing measured baseline

The recorded [scale profile](../archive/scale-profiling-2026-09-23.md) reports
physics-only timings for a synthetic 260×150 world of 6.216 ms average and
8.969 ms p95, and 520×300 of 27.535 ms average and 37.675 ms p95. The 260×150
case leaves roughly 10 ms of a 16.7 ms frame for rendering, browser work, and
input at 60 FPS. This profile excludes `game.js` drawing and SVG overlays, and
its fixture contains sand, water, and fire but no batteries, sparks, or
machines. It therefore cannot confirm or dismiss the current Battery/Spark
theory. These are machine-specific historical numbers, not current guarantees.

### Highest-priority code-based leads

1. **Every rendered frame rebuilds SVG machine overlays.** `gameLoop()` calls
   `drawWorld()` on every animation frame, and `drawWorld()` calls
   `drawMachineOverlays()`. That function clears the overlay and creates new
   SVG layers and machine artwork over the visible area. Powered conductor
   cells can add more SVG spark paths. This is a strong renderer-side
   allocation/layout candidate when many machines or powered wires are visible;
   no browser profile has measured its share yet. See `game.js:423-447`,
   `game.js:657-665`, `game.js:1190-1229`, and `game.js:1501-1524`.

2. **Ordinary Sparks can repeat whole-network work and allocate world-sized
   scratch.** When an ordinary Spark touches a conductor,
   `energizeConnectedMetal()` allocates an `Int32Array` the size of the world,
   traverses the connected conductor graph, and records touched/storage cells.
   Each Spark contacting the same large network can repeat that work. Battery
   decorative Sparks are marked visual-only (`world.data === 1`) and skip this
   energizing path, so a useful comparison must distinguish ordinary Sparks
   from Battery decoration. The cost depends on Spark frequency and network
   size. See `physics.js:2888-2956` and `physics.js:4337-4346`.

3. **Battery accounting scans and allocates over the full world each tick.**
   `updateElectricalPower()` runs from each simulation step. It scans every
   cell, then calls `balanceStoredCharge()`, which allocates a world-sized
   visited array and scans all cells to find connected Battery groups. When a
   Battery exists, it builds electrical machine-load data and traverses
   connected conductor networks to calculate consumption. This makes a
   Battery circuit a plausible cost multiplier, but the unconditional scan and
   empty allocation also cost worlds without Batteries. See
   `physics.js:3354-3413` and `physics.js:3416-3446`.

4. **Logical current and relay resolution rescan machine/world state.**
   `recomputeLogicalCurrent()` scans the whole grid for gates and resolves gate
   states iteratively; each iteration clears logical power and reseeds Battery
   current. The relay pass separately scans all cells for switches and sensors.
   Large gate networks can repeat work according to gate count and iteration
   limit. This is a targeted concern for active circuits, distinct from
   transient Spark pulses. See `physics.js:3207-3242`,
   `physics.js:3244-3347`, and `physics.js:3448-3468`.

5. **There are several unavoidable whole-world simulation passes.** One tick
   includes open-air reachability, heat transfer/radiation, liquid surface
   work, electrical state, airflow, and the particle scan. Humidity deliberately
   updates one quarter of cells per tick, but inspects neighbors for each
   selected air cell. These passes explain why time grows with world area even
   when most cells look still. See `physics.js:3659-3705` and
   `physics.js:3587-3638`.

6. **Illumination rendering visits every world cell and samples through an API
   per cell.** `drawIlluminationLayer()` clears a full-size ImageData buffer,
   loops through all cells, calls `getIlluminationAt()` for each, then uploads
   the buffer. The getter checks field freshness and logical-current state
   every time. The field is frame-sensitive and can be rebuilt on demand. This
   is likely small with few emitters but adds predictable per-frame work and
   should be included in the render profile. See `game.js:481-505` and
   `physics.js:672-740`.

## Prioritized checklist

### P0 — Measure the reported FPS drop before changing simulation semantics

- [ ] Add temporary timing around `stepSimulation()`, `drawWorld()`, and
  `decayWindTrails()` in `gameLoop()`; capture median and p95 separately.
- [ ] In a local diagnostic run, time `updateElectricalPower()`, Spark network
  propagation, and Battery load traversal independently. Record Spark count,
  connected conductor-cell count, Battery-cell count, and machine count with
  each sample.
- [ ] Compare the same small world in four cases: baseline; ordinary Spark
  touching a conductor; a charged Battery and connected load; both together.
  Keep a no-machine/no-electrical control. Repeat at 260×150 and 520×300.
- [ ] Record browser, hardware, build, and whether the canvas is visible. The
  current CLI profile cannot diagnose browser drawing or electrical workloads.

### P1 — Low-risk candidates if measurements confirm the hotspots

- [ ] Reuse scratch buffers for electrical graph traversal rather than
  allocating world-sized typed arrays for each call. A generation-stamp
  visited buffer can avoid a full clear, provided resize/restore lifecycle is
  covered.
- [ ] Avoid full electrical topology/load reconstruction when neither
  electrical topology nor machine settings/ports changed. Introduce a clear
  invalidation version before caching; charge and live power still need to
  update on their own schedule.
- [ ] Keep static machine SVG artwork between frames. Update only dynamic
  signal marks/flow animations and rebuild static icons on world, viewport,
  zoom, or machine changes. Verify pan/zoom, port activity, and placement
  previews before adopting this.
- [ ] In illumination drawing, consume the already-built illumination arrays
  directly instead of invoking the bounds/freshness getter once per cell.
  Preserve lazy field rebuild behavior and ensure the slider/source changes
  invalidate it once, not once per sampled cell.

### P2 — Larger changes; require profiling and behavioral coverage first

- [ ] Consider maintaining sparse indexes for Batteries, machines, active
  Sparks, or non-empty cells to reduce repeated full-grid scans. Cell movement,
  transforms, restore, stamping, and grab/drop make index correctness
  nontrivial; update all mutation paths and compare deterministic snapshots.
- [ ] Consider consolidating compatible whole-grid passes only after phase
  ordering and seeded simulation behavior are characterized. Reordering heat,
  reactions, movement, and power can change results.
- [ ] Optimize gate fixed-point solving only if profiles show it matters;
  preserve synchronous results, feedback-cycle handling, and battery-supply
  separation.

## Suggested verification after any optimization

- [ ] Keep the existing headless scale profile as a physics comparison, but
  add an explicitly electrical fixture before drawing conclusions about
  Sparks/Batteries.
- [ ] Compare seeded world snapshots and electrical state (`power`,
  `powerDelay`, `logicalPower`, and `charge`) before and after each change.
- [ ] Run focused browser coverage for electrical machines and any renderer
  interaction touched; separately profile real browser frames because the
  headless physics profile excludes rendering.
- [ ] Report median and p95 before/after for the same fixture and machine,
  instead of relying on a single FPS reading.
