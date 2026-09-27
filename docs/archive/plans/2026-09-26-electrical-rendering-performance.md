# Plan: electrical refresh and rendering performance

## Goal

Reduce repeated electrical simulation and rendering work while keeping circuit
behavior responsive and Battery accounting correct. Refresh electrical state on
a 30 simulation-tick cadence, with immediate refresh after relevant topology or
machine-setting edits. Keep the animation choice clear: the checkbox means
“no wire spark/bolt animation” when checked, and is unchecked by default to
preserve current visuals.

This plan follows the P0 measurements in
[`../reviews/2026-09-26-p0-performance-results.md`](../reviews/2026-09-26-p0-performance-results.md)
and the source review in
[`../reviews/2026-09-26-performance-review.md`](../reviews/2026-09-26-performance-review.md).
Compare before/after runs with the same fixtures, world sizes, host, browser,
and benchmark command. Run the performance benchmark only when a
performance-specific test has been requested; never include it in routine or
normal test commands.

## Design and behavior

### Electrical refresh cadence

- Throttle the expensive electrical calculations—the topology/load rebuilds
  and logical-power solve—to once every 30 simulation ticks while the circuit
  is unchanged, rather than repeating them every tick.
- Keep Battery drain/charge and pulse/Spark countdown on their existing cheap
  per-tick cadence. Do not batch, defer, or multiply these updates to match the
  electrical recalculation interval; preserve their current rates and expiry
  timing.
- Mark electrical state dirty when a change can alter a circuit's topology or
  machine configuration: conductor placement, removal, movement or transform;
  machine placement/removal or port layout; and switch, gate, sensor, or Lamp
  settings. Resolve a dirty state promptly so a cut input or gate supply cannot
  leave a downstream Lamp powered until the next periodic refresh.
- Preserve gate supply separation, input truth tables, output routing,
  Battery-load attribution, and current eight-neighbor electrical connections.
  Environment-driven sensor comparisons may use the scheduled refresh when no
  explicit edit marks the network dirty.
- Cache reusable electrical topology and load data. Invalidate it on edits that
  change conductor connectivity, machine ports, or load settings; keep dynamic
  ON/OFF signals, charge and pulse lifetimes on their proper update schedule.

### Traversal scratch storage

- Reuse generation-stamped visited storage for electrical graph walks rather
  than clearing or allocating a world-sized array for every Spark, Battery, or
  power pass.
- Handle world resize, new/cleared worlds, restore, and generation rollover
  safely. Keep traversal order and logical results deterministic.
- Preserve the existing Spark and Battery gameplay mechanics. This work changes
  when and how traversal state is refreshed, not route rules or load units.

### Wire and machine rendering

- Replace per-conductor SVG zigzags with a bounded number of moving Z-shaped
  bolts routed only through currently conducting cells. Match their visual
  cadence and movement to the existing Tubing animation, clip them to the
  visible area, and keep SVG/path work bounded as the wire network grows.
- Add an explicit user setting whose checked state means wire spark/bolt
  animation is disabled. It is unchecked by default. When disabled, powered
  conductor base pixels remain bright yellow; only the moving animation is
  suppressed. Preserve the setting through the app's normal preference/save
  lifecycle.
- Never draw moving wire bolts on Battery cells. Battery glow reflects charge;
  while charging show a centered green `+`, while discharging show a centered
  red `−`, and show neither sign while idle.
- Retain static machine SVG artwork between frames. Rebuild it after relevant
  machine, world, viewport, or zoom changes. Update port state, signal marks,
  wire animation, and Battery status in separate dynamic layers so live state
  remains current without rebuilding static icons.
- Let the illumination renderer refresh required local fields once before its
  draw loop, then read the prepared local illumination arrays directly per
  cell. Preserve local-only overlay rendering, source/blocker behavior,
  intensity, tint, zoom alignment, and ambient light's non-rendered status.

## Likely implementation areas

- `physics.js`: electrical dirty flags and 30-tick scheduling; per-tick
  Battery and pulse updates; reusable generation-stamp traversal buffers;
  topology/load cache invalidation; one-time illumination freshness at render
  boundaries if the current API needs adjustment.
- `game.js`: static/dynamic machine-overlay separation; bounded conductor-bolt
  paths; Battery charge glow and centered status sign; direct prepared-array
  reads in the illumination draw loop.
- `ui.js`, `index.html`, `constantsAndGlobalVars.js`, `styles.css`: the checked
  “no wire spark animation” setting, its default unchecked state and placement,
  accessible label/help text, and persistence wiring.
- `e2e/machines/` and `e2e/feedback/`: focused browser regressions for circuit
  cutoffs, edit responsiveness, machine overlays, the animation setting, and
  Battery charging/discharging/idle visuals.
- `performance/README.md`, `docs/GAME_MECHANICS.md`,
  `docs/E2E_TEST_PLAN.md`, and the relevant E2E area README: record the visual
  control and maintenance contract. Keep the performance suite strictly
  opt-in.

## Focused verification plan

The focused browser coverage added for this change is owned by
`e2e/machines/electrical.spec.mjs` and
`e2e/machines/logic-gates.spec.mjs`:

- `electrical.spec.mjs` checks the 30-tick expensive-solve cadence while
  Battery drain remains per tick; the wire-spark toggle and powered yellow
  conductor pixels; bounded Z bolts that avoid Batteries; Battery charge
  direction glyphs; and retained static machine SVG artwork.
- `logic-gates.spec.mjs` checks the complete gate truth tables and that cutting
  either signal or supply turns the gate and Lamp off promptly, including
  invalidation of cached power after a signal Battery is removed.

Run focused browser coverage first:

```powershell
npm.cmd run test:browser -- e2e/machines/electrical.spec.mjs e2e/machines/logic-gates.spec.mjs --workers=1 --trace=off
```

After focused coverage passes, run the explicitly requested, opt-in performance
benchmark:

```powershell
npm.cmd run test:performance
```

Do not include the performance command in `npm test`, ordinary browser runs, or
routine validation. Compare its external step/render median and p95 plus Spark,
Battery traversal, SVG overlay, and illumination-layer results against the P0
report using identical fixtures and host/browser metadata. Include the
“no animation” setting as a separate renderer scenario if the harness is
extended. Report medians, p95, workload counts, artifacts, and limitations
without timing pass/fail thresholds. Do not run the full test suite without
explicit user authorization.

## Risks and safeguards

- A 30-tick schedule can delay naturally changing sensor results unless the
  cadence is bounded and explicit edits have a dirty path. Circuit-breaking
  edits must immediately cut output power.
- Keep the per-tick Battery and pulse work separate from the throttled graph
  calculations so neither energy rates nor expiry timing change.
- Cached topology can become stale after less-obvious cell mutation paths,
  blueprint stamping, drag/drop, restore, or machine setting changes. Centralize
  invalidation where possible and cover lifecycle changes.
- Reusing generation-stamp arrays requires correct resize and rollover rules;
  stale stamps must never imply that a node has already been visited.
- SVG simplification can make active routes harder to read or make bolts appear
  disconnected from wire geometry. Keep paths aligned, clipped, bounded, and
  visibly distinct from Battery decorations.
- The P0 measurements used a visible headless Chromium canvas with SwiftShader;
  renderer costs are software-rendered and not representative of a user's GPU.
  Compare identical benchmark environments and avoid universal FPS claims.

## Acceptance criteria

- Electrical state refreshes at most once per 30 simulation ticks when idle,
  while topology or relevant setting edits promptly recompute affected circuit
  state. Gate input or supply cutoff immediately disables its output.
- Battery charge/discharge and finite pulse countdown remain on their current
  per-tick schedule while topology/load rebuilds and logical-power solves use
  the 30-tick cadence.
- Generation-stamped traversal scratch and cached topology/load calculations
  remain correct across edits, world lifecycle changes, and restore.
- Moving conductor animation uses bounded Z bolts, is disabled only when the
  explicit checkbox is checked, and leaves powered base wire pixels bright
  yellow. The default remains unchecked.
- Batteries have no wire bolts; charge glow and charging/discharging signs use
  the requested colors and disappear in the idle state.
- Static machine artwork is reused while dynamic status stays responsive, and
  the local illumination draw loop reads prepared arrays without changing its
  output or introducing ambient-light tint.
- Focused regressions pass, current mechanics/E2E documentation is updated, and
  any performance comparison is recorded as machine-specific measurements
  under `docs/archive/reviews/`.
