# Performance overhaul: measurement-first roadmap

**Status:** Tiers 0 and 1 complete. Tiers 2-3 remain unexecuted and
evidence-gated; stop here until a later review identifies a measured need.

## Archive review and synthesis

The completed [Campaign brush review](../reviews/2026-09-30-campaign-brush-performance-results.md)
isolated the large-brush Campaign lag: a size-31 Mission 6 placement fell from
1,167.2 ms to 6.3 ms after batching objective scans and Campaign refreshes,
while preserving the 709 placed Water cells and reducing full-world objective
scans from 709 to one per gesture. This fixes that input burst, but its
`paintCell()` benchmark calls the function directly while paused. It does not
measure live RAF pacing or pointer-to-render latency.

The same-host [pre-Tier 1 P0 baseline](../reviews/2026-09-30-campaign-brush-performance-results.md#post-fix-frame-baseline)
has seven of twelve 260 x 150 scenes above the 41.67 ms complete-frame p95
reference. The headless browser used SwiftShader, not the installed RTX 3080,
so the results point to CPU simulation work on that run without describing the
normal hardware-accelerated rendering path.

Earlier work already improved electrical topology/cache behavior, retained
static SVG artwork, and direct illumination-array reads. The dedicated
Battery-hover/trend investigation did not support hover or trend drawing as
the dominant cause. The 23 September physics-only scale profile measured
6.216 ms at 260 x 150, 27.535 ms at 520 x 300, and 132.624 ms at 1040 x 600;
those synthetic physics-only timings are not directly comparable with the
later full-frame P0 profile. The 26 September electrical-rendering work
improved rendering, while the 520 x 300 particle-physics step still took about
91 ms. See the [scale profile](../scale-profiling-2026-09-23.md) and
[electrical-rendering results](../reviews/2026-09-26-electrical-rendering-performance-results.md).

Ambient center-sampled chunks reduced one full build from about 9.56 seconds
to about 19 ms, but populated-scene p95 and incremental queue backlog remained
(71.9 ms p95 and 42 pending chunks median in the recorded edit run); adaptive
per-cell refinement was expensive and was rolled back. The archived airflow
optimization records 51 focused passes and 17 failures in scalar-flow
expectations. Do not add another cadence-based solver approximation until
that regression debt is resolved. Older code/refactor audits warn that physics
phases share mutable world arrays and RNG state, and depend on scan and call
order; broad restructuring therefore needs per-tick equivalence coverage. See
the [physics refactor audit](../../PHYSICS_REFACTOR_AUDIT.md),
[electrical/hover results](../reviews/2026-09-27-electrical-hover-and-battery-optimization-results.md),
[ambient results and rollback](../reviews/2026-09-27-ambient-illumination-chunk-performance-results.md),
and [airflow record](2026-09-28-airflow-air-mixing-performance-optimization.md).

## Ordered roadmap

### Tier 0: guarded telemetry and live-frame measurement (complete)

Implement only measurement hooks and fixtures in this tier. Keep simulation
behavior, phase order, tick cadence, pointer behavior, and browser launch
settings unchanged.

- In `stepSimulation`, add sequential, guarded timing events around the
  existing major phases in their current order. Keep the existing whole-step
  event. Record numeric counters that describe each phase's actual work where
  available, such as world cells, particles visited, mask cells, and skipped
  no-op edges. Only read the clock, assemble counters, and call the recorder
  when the existing optional `window.__P0_PERF__` recorder is enabled. Do not
  move, split, combine, or conditionally skip simulation work for profiling.
- In the normal `gameLoop(now)`, record `rafIntervalMs` from consecutive RAF
  callback timestamps and a post-draw completion duration after `drawWorld()`
  returns. On a real pointer event, retain its event timestamp and record
  `inputToNextDrawCompleteMs` at the completion of the next draw. This metric
  ends at JavaScript draw completion; it is not named or reported as
  presentation latency. If the browser exposes an Event Timing
  `presentationTime`, record that optional field separately and only when it
  is available. Do not modify RAF scheduling, game-loop cadence, or launch
  flags to improve the measurement.
- Add `performance/live-frame.spec.mjs` for 260 x 150 active-loop runs with
  10 warm-up frames and 60 measured frames. Compare a matching Sandbox
  control with a Campaign Mission 6 fixture in which `confirm-fire-out` is
  pending. Assert one pending-objective world scan of 39,000 cells per active
  simulation tick; report scan count/cells separately from timed phases. Use a
  real size-31 canvas click in both controls while the normal RAF loop remains
  active, and record RAF intervals plus `inputToNextDrawCompleteMs`.
- The three created specs are `e2e/physics/performance-telemetry.spec.mjs`,
  `e2e/tools/input-render-telemetry.spec.mjs`, and
  `performance/live-frame.spec.mjs`. The physics contract verifies guarded
  six-stage events, counters, and identical seeded snapshots with telemetry
  disabled and enabled. The tools contract drives a real size-31 brush press
  and verifies its input-to-next-draw-completion event. The live-frame fixture
  records the active Sandbox and Mission 6 comparison, including the one
  39,000-cell pending-objective scan per active tick.
- Preserve the P0 10 warm-up / 60 measured procedure and fixed matching
  fixtures. Report p50, p95, max, and raw RAF intervals for the P0 and live
  frames, alongside stage timings and work counters. Keep 260 x 150 as the
  required comparison size. Repeat the same fixtures at 520 x 300 only as an
  opt-in run with `P0_PERFORMANCE_SCOPE=all` set as described in the
  [performance README](../../../performance/README.md).
- Capture complete host/run metadata: OS/build, CPU, GPU and driver, available
  memory, browser/version and renderer, Node version, commit and worktree
  state, viewport/canvas dimensions and visibility, world size, power state
  when available, fixture identifiers, and warm-up/sample counts. Run once
  through the existing headless Chromium configuration and separately through
  the user's normal RTX 3080 hardware-accelerated browser setup. Record the
  renderer actually reported by each run; retain the current Chromium 153
  SwiftShader data as a software-rendered reference. Do not add browser launch
  flags or alter launch settings to force GPU use.
- Timing output is diagnostic and has no host-sensitive pass threshold.
  Assert event/counter contracts and seeded snapshot equivalence for
  correctness; compare timing only across matching host/browser/fixture
  conditions.

Use only these focused npm entry points for this tier:

```powershell
npm.cmd run test:browser -- e2e/physics/performance-telemetry.spec.mjs --workers=1 --trace=off
npm.cmd run test:browser -- e2e/tools/input-render-telemetry.spec.mjs --workers=1 --trace=off
npm.cmd run test:performance -- performance/live-frame.spec.mjs
npm.cmd run test:performance -- performance/p0-browser.spec.mjs
```

#### Tier 0 implementation and verification (30 September 2026)

The telemetry and focused contracts are green:

- The focused physics and tools E2E command passed **2/2** tests.
- `performance/live-frame.spec.mjs` passed **1/1** test and wrote
  `test-results/performance/live-frame.json`.
- `performance/p0-browser.spec.mjs` passed **1/1** benchmark test and wrote
  the updated `test-results/performance/p0-browser.json` and `.csv` artifacts
  at 19:25.
- The live-frame artifact contains 10 warm-up and 60 measured RAF intervals
  for each active 260 x 150 fixture, with all six stage events present for
  each of 60 measured samples. Mission 6 had `confirm-fire-out` pending and
  recorded **61 world-state scans across 61 active simulation steps**, each
  scanning 39,000 cells. Its real size-31 click placed 709 Water cells,
  emitted one Campaign notification, and overlapped six simulation steps with
  seven scans (one per active step plus one final paint-batch evaluation).
- RAF interval p50/p95/max was **16.7/16.8/33.3 ms** in Sandbox and
  **16.7/33.4/33.4 ms** in Mission 6. These are this headless run's observed
  frame intervals, not a hardware-rendering guarantee.
- The 19:25 P0 instrumented-pass hook events still show unexplained coarse
  `simulationStage:postProcessing` tails: particle baseline p95/max
  **47.5/53.3 ms**, combined workload **48.9/54.1 ms**. The dedicated Mission 6
  live fixture measured that stage at p95 **1.0 ms**, max **1.2 ms**. The
  difference is fixture-specific and does not identify the subphase responsible
  for the P0 tail; Tier 1 adds guarded detail around ambient pending-change
  flushing.
- The live-frame artifact reports Chromium 153 on the i7-10700KF/64 GiB host,
  but its renderer is headless ANGLE/SwiftShader. A normal RTX 3080
  hardware-accelerated capture remains outstanding; do not treat these results
  as GPU-rendering measurements.

Instrumentation and timing remain diagnostic. Green results establish the
telemetry contracts and fixture counts, not a timing threshold or a universal
FPS guarantee.

The existing brush benchmark remains a separate placement microbenchmark. It
uses two warm-ups and eight measured samples, so its p95 is effectively near
the maximum, and it calls `paintCell()` directly while paused. It does not
measure a real click, active RAF pacing, or input-to-draw latency.

### Tier 1: exact air-transport work reduction and post-processing diagnosis (complete)

Tier 0 identified air transport as a high-cost stage in the live fixture and
showed a coarse post-processing p95 tail in several P0 workloads. Tier 1 made
one exact traversal optimization and added detail only to the suspect
post-processing path; it does not alter simulation cadence or formulas.

- During the existing air-topology classification pass, build a reusable
  row-major index of class-2 (transfer-eligible) cells. Do not add a separate
  full-world classification pass. Use this index only in the three existing
  face traversals and the receiver-scale updates that the audit identified.
- Preserve the original scan and face order, transport formulas, limiting
  behavior, and strict equality rules. Keep class-1 global-minimum and donor
  passes as full-world passes; they must not be narrowed to the class-2 index.
  Add no interval/cadence approximation.
- Guard the `work` counter object and all counter increments in
  `advectAirScalars()` behind the same enabled-recorder check as timing. When
  the recorder is enabled, every existing counter value must remain unchanged.
- Add guarded fine timing around `flushAmbientPendingChanges()` using the event
  prefix `simulationStage:postProcessing:<subphase>`. Separate pending-cell
  filtering/classification, column refresh, row refresh, and shadow-wedge
  enqueue/fallback work. Include numeric counters such as pending/changed cells,
  unique columns and rows, queued work, and fallback count. Keep event order
  sequential; do not change queue limits, invalidation, or ambient results.
- Correctness oracles must compare seeded per-tick world arrays and RNG state,
  verify class-2 index membership and unchanged face order/formulas, and cover
  class-1 global min/donor behavior and storage-wall rules. Instrumentation-off
  and -on snapshots must match exactly. Use the existing live-frame and P0
  fixtures for before/after stage distributions and work counters.
- The archived airflow optimization recorded a historical **51 passed / 17
  failed** result. Keep that older baseline visible when interpreting the
  current focus; do not weaken expectations or claim broad airflow coverage
  green while failures remain unexplained.

### Tier 1 focused regression rows and verification

The test-engineer added the air-circulation regression contracts before
implementation. The red phase confirmed that the new work-counter assertions
failed until the class-2 index and face-visit counter were implemented. After
implementation, the per-tick humidity-on/off golden hashes, RNG state, and
recorder-enabled/disabled snapshots matched exactly. Focused regression and
browser contracts all passed:

| Coverage row | Spec path / focused command |
| --- | --- |
| Row-major class-2 index membership, face-sweep visit counters, and exact scalar-transfer behavior in both humidity modes | `npm.cmd test -- --focus=air-scalar-index` — **9 passed / 0 failed**. |
| Full focused air-circulation regressions: class-1 global min/donor behavior, storage-wall barrier, powered Fan, and restore/edit lifecycle | `npm.cmd test -- --focus=air-circulation` — **76 passed / 0 failed**. |
| Guarded `flushAmbientPendingChanges` subphase event order/counters and seeded telemetry parity | `npm.cmd run test:browser -- e2e/physics/performance-telemetry.spec.mjs --workers=1 --trace=off` — **1/1 passed**. The unchanged npm wrapper needed command-level approval to access the browser cache under the test account. |
| Active-loop Sandbox/Mission 6 comparison | `npm.cmd run test:performance -- performance/live-frame.spec.mjs` — **1/1 passed**. |
| Latest 260 x 150 P0 frame profiles | `npm.cmd run test:performance -- performance/p0-browser.spec.mjs` — **1/1 passed**. |

The row-major index is built during the existing topology-classification pass
and reused by the three face sweeps and receiver-scale updates. Class-1
global-minimum and donor scans remain full-world passes. The class-2 index and
all formulas preserve exact seeded output and RNG ordering. The existing
`airCellsVisited` diagnostic retains its prior meaning, with its exact expected
total covered by regression. In the dense
occlusion fixture, the class-2 list had a median of 116.5 cells and the three
face traversals visited about 349.5 entries instead of scanning 117,000 world
slots; open-ish fixtures indexed about 19,500 of 39,000 cells.

Latest `airScalarTransport` event timings (p50/p95) were 9.15/19.20 ms for
ambient-open, 0.25/0.70 ms for dense-occlusion, 10.00/20.40 ms for calm air,
and 10.00/20.50 ms for driven air. The sparse fixture benefits most from the
index; open-air transport remains a meaningful CPU cost. The latest P0
complete-frame p95 remains over the 41.67 ms reference in 7 of 12 scenes. See
the [performance README](../../../performance/README.md) for all scene timings and
the renderer limitation. This evidence records Tier 1's result and leaves any
additional optimization for a later, separately scoped review.

The Campaign world-state count remains one 39,000-cell scan per active Mission
6 tick. In the dedicated fixture, coarse post-processing p95 was 1.0 ms, so
that scan is not promoted to the next implementation target on current
evidence. Any later cache proposal must cover paint, movement, transformations,
machines, clear/reset, restore/load, and mission scenario setup.

Commands used for this completed tier:

```powershell
npm.cmd test -- --focus=air-circulation
npm.cmd test -- --focus=air-scalar-index
npm.cmd run test:browser -- e2e/physics/performance-telemetry.spec.mjs --workers=1 --trace=off
npm.cmd run test:performance -- performance/live-frame.spec.mjs
npm.cmd run test:performance -- performance/p0-browser.spec.mjs
```

### Tier 2: evidence-backed targeted caching

Tier 1's new P0 subphase timings now attribute a material portion of the
particle, circuit, and ambient-edit tails to `flushAmbientPendingChanges`:
subphase p95 is about 45.6–47.7 ms, with `shadowWedgeEnqueueFallback` at about
43.3–45.3 ms and column refresh at about 1.8–2.0 ms. This is evidence for a
possible narrow follow-up around shadow-wedge enqueue/fallback work, not
authorization to change it in this tier. The live Mission 6 objective scan
remains non-dominant. First inspect queue behavior and produce a bounded
correctness proposal; then require explicit invalidation and rebuild rules,
lifecycle coverage for clear/restore/load, and deterministic comparison
against the uncached implementation. Avoid broad caches without a demonstrated
hot path and a bounded correctness argument.

### Tier 3: larger architecture changes only with proof

Consider phase/index redesign, parallel workers, or other structural changes
only if Tier 0 through Tier 2 leave a measured frame-time problem. A proposal
must first prove deterministic and RNG-order equivalence, simulation ordering,
Campaign objective behavior, and persistence/restore equivalence on matching
fixtures. GPU, WASM, and Worker rewrites are not prescribed fixes; select a
technology only if measurements and a behavior-preserving prototype support
it.

## Verification and approval boundary

For each accepted change, use focused tests for the affected functional area
and compare the matching performance fixtures before and after on the same
host. Check counter invariants and world/objective snapshots as well as timing
distributions. The P0 performance suite remains opt-in. Run only focused
commands listed for the active tier; do not run a full test suite without user
approval.
