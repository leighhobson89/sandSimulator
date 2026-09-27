# Electrical hover and Battery rendering performance

## Goal

Investigate and reduce repeated hit testing, electrical simulation, Battery
trend rendering, and ambient-illumination rebuild work while preserving machine
interaction, logical power, Battery accounting, and the stable bright-wire
read. Capture focused before/after performance data for the authorized
benchmark rerun. This plan records candidate hotspots, not a proven root cause
for any single low-FPS report.

## Findings and confidence

1. **Repeated machine-art hit testing — high confidence in redundant work.**
   `getMachineArtworkAtClientPoint` scans the cached SVG icons in two passes and
   performs fine-grained SVG geometry checks. Feedback queries it on animation
   frames; pointer/cursor handlers also query it. Cache the pointer result and
   filter candidates before precise checks. Main source locations:
   [`game.js`](../../game.js#L956), [`game.js`](../../game.js#L2333), and
   [`ui.js`](../../ui.js#L2440).
2. **Spark traversal and gate solving — medium confidence as performance
   contributors; measure before optimizing.** Ordinary Sparks may revisit the
   same conductive graph, and `recomputeLogicalCurrent` iterates the full gate
   set until stable or the iteration limit. Add opt-in timings and workload
   counters to identify the actual cost. See [`physics.js`](../../physics.js#L3603)
   and [`physics.js`](../../physics.js#L4097).
3. **Per-cell Battery trend glyphs — high confidence in node-count scaling.**
   The trend renderer samples and may append a glyph for every visible Battery
   cell; the dynamic SVG layer is replaced each frame. Aggregate existing
   touching-Battery reservoirs and render one glyph per entity. See
   [`game.js`](../../game.js#L1362) and
   [`game.js`](../../game.js#L1747).
4. **Binary power versus Spark pulses — design change confirmed by
   architecture.** Logical power will be steady boolean state in
   `logicalPower`; transient `power`/`powerDelay` visuals and pulse scheduling
   are removed. Ordinary Sparks may still charge a connected Battery, but a
   Spark passing through Battery-less wire does not create logical power.
   Battery `chargeSparkChance` is removed. The old No wire sparks toggle and
   moving-wire animation become obsolete. See
   [`game.js`](../../game.js#L1747), [`physics.js`](../../physics.js#L3603),
   [`physics.js`](../../physics.js#L5210), and
   [`particles.json`](../../particles.json#L1039).
5. **Ambient illumination rebuilding — likely repeated work; dependency
   footprint needs confirmation.** Current ambient invalidation and lazy build
   paths can rebuild visibility values repeatedly. Build the field once, track
   changed cells, and recompute only affected visibility results. The user
   accepts up to 1–2 seconds of transient ambient-value inaccuracy while the
   incremental work catches up. The exact affected-cell dependency and
   invalidation strategy must be finalized with architecture before
   implementation; blockers and gas along visibility rays can affect cells
   beyond the changed cell. See
   [`physics.js`](../../physics.js#L1036) and
   [`physics.js`](../../physics.js#L1198).

These findings are not a causal diagnosis of a persistent FPS collapse. The
work below should isolate each cost and verify whether it matters at the
reported scale.

## Design and behavior

### Pointer-result caching and candidate filtering

- Cache both hit and miss results for the current pointer position so repeated
  animation-frame feedback and cursor queries reuse one result.
- Use coarse screen-space bounds or a spatial candidate index to avoid scanning
  all machine SVGs before exact alpha-aware SVG hit tests.
- Invalidate cached results when the pointer changes and whenever hit geometry
  may change: machine add/remove/move/rotate, overlay rebuild, canvas resize,
  browser resize, scroll, zoom, world load/restore, or other viewport changes.
- Keep body-before-port priority, visible-art hit rules, and current interaction
  ownership. A stale hit/miss after scroll, zoom, or machine edits is a
  correctness regression.

### Targeted electrical profiling

- Extend the optional performance recorder with Spark work counters and
  timings: processed Spark count/hits, unique conductive cells visited,
  connection visits, and propagation elapsed time.
- Add gate count, solver iteration count, and elapsed time around the complete
  logical-gate solve. Separate simulation solver time from machine SVG and
  electrical overlay rendering time.
- Keep hooks opt-in and avoid adding per-frame profiler overhead when disabled.
- Use measured evidence to decide whether to cache/reuse Spark component
  traversals or reduce gate-solver work. Preserve deterministic charge transfer,
  signal timing, and gate truth tables.

### Battery trend aggregation

- Sample net stored-charge change for each existing connected Battery group,
  not each Battery cell independently.
- Keep the five-second trend window and charging/discharging meaning. Emit one
  `+` or `−` trend glyph per connected Battery entity, using a stable visible
  anchor; emit none when there is no net flow.
- Reuse group identity and topology data where practical; do not run a new
  whole-component walk for every Battery cell on every rendered frame.
- Clear stale group samples when a reservoir is removed, split, merged, or the
  world changes. Keep the hovered Battery feedback load/ETA attached to the
  same connected storage group.

### Binary electrical state and rendering

- `world.logicalPower` is the steady ON/OFF electrical state. Keep it as the
  authority for power queries; `isPowered` aliases this logical state. A
  charged Battery route can keep a conductor logically ON without a moving
  animation or timed pulse.
- Remove transient pulse scheduling/aging and the `world.power` /
  `world.powerDelay` visual behavior. Retain those planes at zero for save and
  compatibility shape; do not set, age, or render pulse values. Powered wire
  pixels use a steady bright-yellow base derived from `logicalPower`.
- An ordinary Spark still traverses conductors and may add charge to a connected
  Battery. Its traversal alone must not make Battery-less wire logically ON.
  A route becomes powered only through the existing charged-Battery/logical
  relay rules.
- Remove Battery's decorative `chargeSparkChance` and the corresponding
  particle-emission path. Preserve Battery charge storage, sharing, discharge,
  temperature, and logical signals.
- Remove the obsolete **No wire sparks** checkbox, its localStorage preference,
  and moving Z-bolt overlay. There is no transient wire animation to toggle.
  **Do not treat the absence of visual Sparks while Electricity is disabled as
  a defect**; test ordinary Spark charge propagation with electricity enabled.
- Retain a runtime-only **Electrical effects** debug switch, enabled by
  default, only to suppress the remaining Battery-group trend glyph/status
  rendering while leaving Battery charge and `logicalPower` calculations
  unchanged. Do not use the full Electricity-off bypass for render-versus-solve
  comparisons because it intentionally clears electrical state.

### Incremental ambient illumination

- Build the ambient visibility field at initialization or when the Ambient
  Light target changes, rather than invalidating and rebuilding the whole field
  on every simulation tick.
- Track cell changes that alter ambient visibility or gas-ray attenuation, then
  recompute only ambient values whose ray dependencies are affected. Do not
  assume only the changed cell is affected: solids, powders, plants, machines,
  and gas can alter rays crossing a broader area.
- For each changed blocker or gas cell, conservatively project top- and
  bottom-shadow wedges from the changed cell's square. Pad rasterized target
  intervals by about two cells to cover the Bresenham ray rules. Union affected
  targets into a generation-stamped dirty mask and queue so overlapping wedges
  are deduplicated without clearing a world-sized mask on every edit.
- Before recomputing affected targets, update the changed columns' vertical
  clear/gas masks and the changed rows' opacity and prefix/suffix summaries.
  Recompute only queued targets whose ambient visibility class or selected
  gas-ray attenuation may have changed.
- Process large dirty regions incrementally with a bounded queue/budget. The
  user accepts at most 1–2 seconds of temporary value staleness; after that,
  every affected cell must match a complete rebuild. Stable unchanged worlds
  should not repeat full-grid visibility work.
- Getters keep returning cached values while the queue drains and never force a
  full synchronous rebuild. Process a target/time budget per simulation tick;
  increase that budget as the oldest dirty target approaches the accepted
  1–2 second bound.
- When the Ambient Light slider changes, remap cached visibility classes
  (top-visible/full, bottom-only/half, reflected) and their gas attenuation
  using the new target without tracing all rays again.
- A world reset, broad invalidation, or high dirty-cell coverage may queue a
  full refresh. Degenerate geometry or a shadow projection whose coverage is
  too broad also uses the queued full-refresh fallback; the fallback still
  drains under the budget and getters continue to use cached values.
- Track opt-in counters/timings for queued, processed, and dirty targets; oldest
  dirty-target age; columns and rows updated; fallback count; and time spent.
- Preserve the current light formula, blocker/transmitter rules, slider
  semantics, and effective value `max(ambient, local emitters)`. Ambient light
  remains readout/plant data and does not become a rendered overlay.
- Apply invalidation to world resize, save/load, blueprint stamping, blocker or
  gas movement/removal, plant/machine placement and movement, and new/cleared
  worlds. Validate that the wedge covers every target ray affected by either
  top/bottom visibility choice or selected-ray gas attenuation.

## Focused verification scope

Focused regression specs and benchmark-stage hooks are drafted but have not
been run. No tests or benchmarks were run while updating this plan.

### Authored regression artifacts

- `e2e/feedback/illumination.spec.mjs` covers the Ambient Light low-value floor,
  top/bottom visibility and gas attenuation, local-versus-ambient effective
  light, and slider/solid/gas/tick refresh. The incremental-field cases are
  **“ambient visibility builds once, stays idle in stable worlds, and
  incrementally converges after cell edits”** (initial build, stable reads,
  blocker/gas edits, pending-cell convergence within 120 simulation ticks, and
  exact differential against a fresh full build) and **“ambient incremental
  fields match full builds for top/bottom visibility, overlapping wedges, and
  world edges.”**
- `e2e/machines/electrical.spec.mjs` contains binary-model coverage titled
  **“ordinary Spark contact does not create transient wire fields or
  Battery-less logical current,” “connected Batteries share one Spark charge
  while an isolated Battery keeps its own capacity,”** and **“steady Battery
  current has no transient wire effects or obsolete No wire sparks control.”**
  It also covers **“Battery charge direction glyph is centered, colored, and
  tracks net charge flow without wire bolts”** and **“Battery charge trend
  renders once per touching storage group.”** The storage-group case asserts
  one glyph for a four-cell touching reservoir and another for a separate
  Battery entity. Replace the old **“moving Z bolts follow powered conductive
  cells and never appear on Battery cells”** test and update **“clearWorld
  resets electrical charge, pulse state, and machine power”**, which currently
  expects a real Spark to create a pulse. Preserve the route, yellow-wire,
  world-reset, and charge-clearing checks while asserting no bolt nodes and
  zero compatibility pulse planes.
- `tools/simTest.mjs` contains the deterministic Battery-less Spark check and
  zero-plane assertion. Extend it to assert that `isPowered` aliases
  `logicalPower`, zero pulse compatibility planes remain zero through
  simulation and save/restore, and an ordinary Spark can charge a connected
  Battery without energizing Battery-less wire. Keep the existing Battery
  sharing and no-decorative-Spark checks.
- In `e2e/machines/electrical.spec.mjs`, retain the binary-state Spark,
  connected-Battery sharing, steady Battery route, and Battery trend cases
  listed above. Replace every moving-bolt/pulse-expiry expectation, including
  **“moving Z bolts follow powered conductive cells and never appear on Battery
  cells,”** and revise the pulse assertion in **“clearWorld resets electrical
  charge, pulse state, and machine power.”** Assert steady yellow
  logical-wire rendering, no bolt nodes or obsolete toggle, and zero pulse
  planes. Add or retain checks that ordinary Spark charges Batteries without
  powering Battery-less conductors, and that charged Batteries do not emit
  decorative Sparks. Extend the storage-group case for split/merge/removal
  cleanup and verify the effects-only switch hides trend glyphs without
  changing charge or logical state.

### Benchmark process-stage coverage

`performance/p0-browser.spec.mjs` is the benchmark test artifact. It records
external `stepSimulation`,
`decayWindTrails`, `renderWorld`, and `feedbackFrame` measurements. The latter
times a complete `gameLoop` call (simulation, wind decay, draw, and feedback),
not isolated feedback work. Its
optional internal hooks cover `updateElectricalPower`,
`electricalTopologyRefresh`, `ordinarySparkPropagation`, `batteryLoadTraversal`,
`logicalGateSolve`, `ambientIlluminationFullBuild`,
`ambientIlluminationIncrementalUpdate`, `hoverHitTest`, `updateFeedback`,
`drawWorld`, `machineOverlayRebuild`, `machineOverlayReuse`,
`electricalWireAnimation`, and `illuminationLayer`. Replace the obsolete
`electricalWireAnimation` hook with an electrical status-overlay hook reporting
Battery groups visited and trend glyphs created; `drawWorld` and the new hook
must distinguish steady logical-wire rendering from Battery status glyphs.
This separates pointer hit
testing/feedback, electrical solving, ambient field work, and renderer stages.
The existing benchmark scenarios are `empty-control`, `particle-baseline`,
`ordinary-spark`, `ordinary-spark-no-wire-animation`, `battery-lamp`, and
`combined` at 260×150 and 520×300, with 10 warm-ups and 60 measured samples.
Remove the no-wire-animation variant and its UI manipulation after the control
is retired; use the five remaining standard scenarios and add Battery-hover,
many-Battery, gate-chain, repeated-Spark-route, and ambient-edit stress
fixtures. Retain comparable standard scenarios and label historical
no-animation data unpaired in the results chart.
The timed pointer is over the Lamp when a fixture has one and otherwise at the
world center; this exercises hit-test/feedback frames but does not hover a
Battery for `getBatteryCircuitMetrics`. The standard scenarios contain no gate
fixture, so add dedicated gate-chain and Battery-hover cases to exercise
`logicalGateSolve` and Battery metric cost. Ambient hooks also need a deliberate
visibility-edit workload to make incremental-update measurements representative.
The benchmark remains unrun. Rerun it after implementation with
`npm run test:performance`; run the drafted browser specs after implementation
with:

```text
npm run test:browser -- e2e/feedback/illumination.spec.mjs e2e/machines/electrical.spec.mjs --workers=1 --trace=off
```

The stage list and planned baseline/after visual chart below remain required.
New process hooks without matching baseline data must be labeled unpaired.

### Remaining focused assertions

The authored cases cover the main ambient convergence and Battery group
contracts. Add or extend focused cases where the authored specs do not yet
cover the following:

- **Hit testing:** add/extend browser coverage so repeated queries at a
  stationary pointer reuse the result; pointer movement updates it; body/port
  priority remains unchanged; machine edits, zoom, resize, scroll, and restore
  invalidate it. The current drafted files do not contain these cache-specific
  assertions yet.
- **Profiler:** deterministic Spark layouts report Spark/hit and unique-cell
  counts; gate fixtures report gate count and actual solver iterations; timing
  separates propagation/solver work from rendering.
- **Battery trends:** the drafted electrical spec verifies one glyph for a
  touching multi-cell Battery reservoir and a separate glyph for another
  entity. Extend coverage for split/merge/removal cleanup and ensure the trend
  sample follows the resulting entity identity. The trend aggregation is per
  touching Battery group, never per Battery cell.
- **Binary power:** replace pulse-expiry assertions with deterministic checks
  that `logicalPower` is steady boolean state, `isPowered` returns the same
  result, and `world.power` / `world.powerDelay` remain zero through Spark
  traversal and simulation ticks. Confirm saved/restored compatibility fields
  stay zero. An ordinary Spark may charge a connected Battery, but does not
  power Battery-less wire or create a transient overlay. Remove the obsolete
  No wire sparks control and its localStorage behavior.
- **Battery spark removal:** with electricity enabled, verify a charged Battery
  does not emit decorative Spark particles while its stored charge, discharge,
  and logical circuit supply continue to work.
- **Effects-only debug switch:** while paused, toggling effects changes only
  Battery trend/status rendering; Battery charge, zero pulse planes, and
  `logicalPower` remain identical. Re-enabling restores the glyphs. Keep full
  Electricity-off behavior out of this assertion because it intentionally
  clears charge and power state.
- **Ambient field:** unchanged worlds do not rebuild the full field every tick;
  blocker/gas changes update the affected region and converge to full-rebuild
  values within the accepted 1–2 seconds; slider changes, world lifecycle,
  and plant/feedback reads remain correct during and after catch-up.
  Also assert conservative top/bottom shadow wedges with approximately two
  cells of raster padding, refreshed column/row summaries, old-value reads
  during queue drain, slider class remapping without ray retracing, and queued
  fallbacks for broad coverage or degenerate geometry. Verify stale-age budget
  increases and counters for queued/processed targets, age, rows/columns,
  fallback count, and elapsed work; all changed targets must equal a complete
  rebuild within the accepted bound. The drafted cases cover stable idle,
  blocker/gas incremental updates, 120-tick convergence, and exact full-build
  comparisons across visibility/wedge/edge cases; extend assertions for the
  queued-age budget, row/column counters, fallback counters, and slider
  remapping without ray retracing.
- **Performance comparison:** after focused regressions pass, rerun the
  authorized opt-in benchmark with the same host/browser, viewport, world sizes,
  warm-ups, samples, and fixtures as the matching baseline. Add stress fixtures
  for many Batteries, repeated Spark hits on shared conductor routes, gate
  chains, and ambient-visibility changes. Record raw artifact location, timing
  medians/p95, workload counters, environment, and limitations in a dated
  `docs/archive/reviews/` report. Include a readable chart in the report, with a
  standalone SVG (or another repo-native visual artifact) linked from the
  Markdown. The chart must compare baseline and after measurements for
  comparable stages, group results by functional area/process, label axes in
  milliseconds, and make larger bars mean more measured cost. Show median and
  p95 distinctly and include all stage names needed to interpret the bars.
  Compare only like-for-like measurements; mark stages without a baseline as
  new/unpaired rather than implying a comparison. Do not populate chart data
  until the authorized benchmark has run. Include sample counts, warm-ups,
  host/browser/viewport, fixture sizes and workload counts, benchmark command,
  and raw artifact path alongside the chart. Do not make universal FPS claims.

Use the existing `tools/simTest.mjs` and Playwright specs under `e2e/` for
focused deterministic and browser-visible coverage. Keep the benchmark
separate from `npm test` and ordinary browser runs.

## Implementation areas

- `game.js` and relevant pointer handlers in `ui.js`: hit-test cache,
  invalidation, Battery-group glyph sampling, effects-only visual switch, and
  removal of transient electrical overlays.
- `physics.js`: Spark and gate profiler counters, Battery-group trend support
  if needed, binary `logicalPower` authority, zero compatibility pulse planes,
  removal of pulse scheduling/aging and Battery spark emission, and incremental
  ambient invalidation/work.
- `particles.json`: remove Battery `chargeSparkChance`.
- `index.html`, `constantsAndGlobalVars.js`, `ui.js`, and `styles.css`: runtime
  effects-only debug switch; remove the obsolete No wire sparks control,
  preference wiring, and transient bolt artwork.
- `performance/p0-browser.spec.mjs` and `performance/README.md`: opt-in stress
  fixtures and counter documentation; keep before/after methodology matched.
- After the authorized benchmark, create a dated Markdown report and standalone
  chart under `docs/archive/reviews/` (for example,
  `2026-09-27-electrical-hover-and-battery-optimization-results.md` and
  `2026-09-27-electrical-hover-and-battery-optimization.svg`). Embed or link the
  chart in the report and describe its method and environment.
- Update `docs/GAME_MECHANICS.md`, `docs/E2E_TEST_PLAN.md`, and
  `e2e/machines/README.md` after implementation and verification.

## Acceptance criteria

- Repeated stationary-pointer machine queries avoid redundant full SVG scans;
  invalidation keeps machine, port, pointer, and viewport results accurate.
- Optional profiler output identifies Spark traversal counts, gate solver
  iterations, and rendering costs independently.
- Each connected Battery group shows at most one trend glyph, and trend
  sampling does not force one component traversal per cell per rendered frame.
- `logicalPower` is the steady boolean state, and `isPowered` returns that
  state. Transient `power` / `powerDelay` visuals, scheduling, and aging are
  removed; compatibility planes remain zero. There is no moving wire-bolt
  overlay or No wire sparks UI.
- Ordinary Sparks may charge connected Batteries but do not power Battery-less
  wire. Removing Battery `chargeSparkChance` does not change charge storage,
  normal discharge, or logical-power behavior.
- Each touching Battery reservoir produces at most one trend glyph. The
  effects-only debug switch hides those glyphs without changing charge or
  logical state; the separate Electricity-off switch remains a full bypass.
- Ambient illumination settles to a correct field after supported mutations
  within the accepted 1–2 seconds and avoids full-grid rebuilds on stable ticks.
- Focused regressions and the authorized matched opt-in benchmark are recorded
  before final documentation and plan archival. The dated report links a
  readable SVG of current per-stage median cost, records p95 timings in its
  tables, and compares like-for-like external step/render timings with the
  prior run. Internal stage hooks are reported as unpaired because their
  instrumentation and event cadence differ from the prior measurement.

## Implementation and verification record

Implemented binary `logicalPower` circuit state with no wire pulse animation,
connected-Battery-group trend sampling and one sign per entity, cached hover
queries, and opt-in performance instrumentation. Added the Battery-static
artwork regression and performance fixtures for gate chains, Battery hover,
and ambient visibility edits. Updated current mechanics and machine E2E
documentation.

Focused browser verification passed: electrical and logic-gate coverage (36),
feedback and illumination coverage (26), persistence coverage (10), plus the
isolated Battery-static-artwork regression (1). The authorized
`npm run test:performance` run passed all eight small-world fixtures with 10
warm-ups and 60 measured samples per pass. The full-size 520×300 matrix timed
out before completion and has no new results; see the dated
[performance report](../reviews/2026-09-27-electrical-hover-and-battery-optimization-results.md)
and its linked SVG chart for measurements, limits, and follow-up work.
