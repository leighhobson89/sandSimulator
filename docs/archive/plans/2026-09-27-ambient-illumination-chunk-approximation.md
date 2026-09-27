# Ambient illumination chunk approximation

## Status

**Completed and archived.** The selected design samples one center cell per
30×30 simulation-cell block and applies that classification uniformly to the
block. The user confirmed the permanent coarse approximation and center
sampling. Focused simulation/browser checks and the opt-in performance run
passed; results are recorded in
[`2026-09-27-ambient-illumination-chunk-performance-results.md`](../reviews/2026-09-27-ambient-illumination-chunk-performance-results.md).

The chunk dimension has one easy-to-change implementation endpoint,
`AMBIENT_ILLUMINATION_CHUNK_SIZE`, set to 30 simulation cells in `physics.js`.
Changing it to 20 updates chunk geometry across the implementation without
editing multiple algorithms or hard-coded dimensions. It is independent of
rendered pixel size and zoom.

The related electrical hover and Battery optimization plan is archived at
docs/archive/plans/2026-09-27-electrical-hover-and-battery-optimization.md.
This plan narrows the remaining ambient-field work to reduce ray-classification
cost while retaining its incremental invalidation behavior.

## Goal

Reduce the cost of ambient world illumination by classifying coarse chunks
instead of every simulation cell. Keep the current top/ground/reflected/gas
semantics at the sampled point, keep local emitter illumination at cell
resolution, and make the coarser ambient accuracy tradeoff visible in tests and
documentation.

## Measured motivation

The focused performance artifact
test-results/performance/p0-browser.json records an ambient-visibility-edit
fixture at 260×150:

- A one-time ambientIlluminationFullBuild setup sample visited all 39,000
  cells and took **9,564.4 ms**. This is a single setup observation, not a
  steady per-tick duration.
- Across 60 measured incremental updates, the median was **0.1 ms** and p95
  **0.2 ms**. The median queued 32,760 targets and processed 2,600; p95 queued
  37,180 and processed 4,200. The oldest queued target was 38.5 ticks at the
  median and 65 ticks at p95.
- The run used 10 warmups and 60 measured samples. Its external
  stepSimulation median/p95 was 53.0/453.8 ms in this scenario. Those large
  tail values are recorded as observed and are not attributed to ambient work
  without further evidence.

At a 30×30 chunk size, the current supported world sizes require:

| World | Per-cell reference classifications | Chunk samples per full build | Reduction |
| --- | ---: | ---: | ---: |
| 260×150 | 39,000 | 9 × 5 = **45** | **866.7× fewer** |
| 520×300 | 156,000 | 18 × 10 = **180** | **866.7× fewer** |

Counts use ceiling division, so partial chunks at the world edges still get one
sample. The reduction is in ambient visibility classifications; normal cell
simulation, rendering, local emitters, and hover queries still use their
existing world-cell data.

## Implemented behavior

### Chunk grid and sampled classification

- Define the chunk width and height from the single
  AMBIENT_ILLUMINATION_CHUNK_SIZE constant, initially 30 cells. Use ceiling
  division for the last partial row or column.
- For each chunk, classify its center cell using the existing ambient-light
  rules. For an edge chunk, choose the center of its actual in-world bounds.
  Store one ambient result for the chunk and expose that same value for every
  world cell it covers.
- Preserve the current rules at the sampled cell:
  - Ambient target at or below 10 gives that value uniformly.
  - Above 10, top-visible is full target; otherwise bottom-visible is half
    target; neither is reflected value 10.
  - Choose the current deterministic straight ray. If it crosses any gas,
    attenuate the selected ambient value once by 25%.
- Preserve effective illumination as the maximum of the chunk ambient value
  and the existing derived local-emitter field at the queried world cell.
  Keep local Lamp, Fire, Lava, Scoria, and explosion illumination at their
  current world-cell resolution and keep the local source overlay unchanged.
- Keep ambient values derived and non-persistent. Saves, blueprints, and world
  payloads continue to store the Ambient Light target and rebuild derived
  values.
- On a slider change, remap cached visibility classes and gas attenuation to
  the new target without retracing every chunk ray.

### Incremental invalidation

- Keep change tracking for solids, powders, plants, machines, and gas that can
  affect a visibility ray. Convert each conservative shadow wedge into the set
  of intersected ambient chunks; deduplicate dirty chunks with a generation
  stamped mask and queue.
- Update affected row/column visibility summaries before classifying dirty
  chunk centers. A chunk may be recomputed more than once only when a later
  edit invalidates it again.
- Return cached chunk values while the queue drains; ambient getters must not
  synchronously trigger a world-wide rebuild.
- Process dirty chunks under the existing per-tick work budget and increase
  the budget as the oldest queued chunk approaches the accepted 1–2 second
  staleness bound. Keep queued full-refresh fallback for world reset, broad
  invalidation, or degenerate wedge geometry.
- Track chunk samples queued, processed, and pending; oldest dirty age;
  updated rows/columns; fallback count; full-build count; and elapsed time.

## Accuracy tradeoff

Center sampling makes ambient illumination piecewise constant within each
30×30 block. Hover feedback and plant growth/germination read that same
tile-uniform ambient contribution, so a blocker or gas change near a chunk
boundary can affect a larger area than its exact cell-level shadow would.
Chunk boundaries can also create visible step changes in numeric readings or
plant fitness. Local emitter light remains cell-resolved and combines with the
coarse value using the existing max(ambient, local) rule.

This is the selected intentional approximation. Do not describe chunk-uniform
values as exact per-cell ray results. Focused coverage demonstrates the
defined sampled semantics, edge-chunk behavior, and bounded update staleness;
the implementation does not require equality with the old per-cell ambient
field away from sample centers.

## Performance outcome

- The 260×150 full build now classifies 45 chunk centers, down from 39,000
  per-cell classifications. The 520×300 geometry is covered by regression
  expectations at 180 chunks; that larger benchmark was not run.
- Stable unchanged worlds avoid repeated full ambient classification. Dirty
  chunks are queued by conservative invalidation regions; the measured
  continuous-edit fixture kept a backlog, while browser regression coverage
  converged after edits stopped.
- Full-build setup measured 18.6 ms in one sample, versus the prior 9,564.4 ms
  one-sample observation. Incremental updates measured 0 ms median and 0.1 ms
  p95. These are reported separately in the dated results document.
- In the ambient-visibility-edit fixture, simulation-step median/p95 changed
  from 53.0/453.8 ms to 21.6/71.9 ms. Rendering remained at 2.5/2.7 ms.
- The benchmark used the same 260×150 default scope, 10 warmups, and 60
  measured samples. It was not run at 520×300.

## Focused verification completed

Focused regression coverage is complete in
`e2e/feedback/illumination.spec.mjs` and `tools/simTest.mjs`. Deterministic
simulation coverage passed 24/24, browser illumination coverage passed 19/19,
and the opt-in performance test passed 1/1. The browser edit regression
converged within 120 ticks.

### Browser regression coverage

The focused browser spec ran through the project npm wrapper:

```text
npm run test:browser -- e2e/feedback/illumination.spec.mjs --workers=1 --trace=off
```

The authored cases cover:

- **ambient light builds one center sample per 30-cell chunk, remaps without
  rays, and converges after edits** — a 95×61 world with 12 chunks, including
  a 5×1 bottom-right partial chunk; center-cell classification; tile-uniform
  values; the standard 45-sample and 180-sample counts for 260×150 and
  520×300 worlds; slider remapping without ray traversal; world-illumination
  debug-off uniform values; and ambient values consumed by hover/plant reads.
- **ambient visibility builds once, stays idle in stable worlds, and
  incrementally converges after cell edits** — no repeated full build in an
  unchanged world; localized blocker and gas invalidation; dirty-chunk counters;
  queue catch-up within the accepted 1–2 second bound; and differential checks
  against a fresh build using the same center-sampled semantics.
- **ambient incremental fields match full builds for top/bottom visibility,
  overlapping wedges, and world edges** — chunk-center reference values for
  both boundary choices, intersecting shadow wedges, and clipped partial
  chunks.
- Existing illumination regressions continue to cover the low-value floor,
  selected-ray gas attenuation, effective max(ambient, local source), slider
  and geometry changes, and plant/hover consumers.

### Deterministic parity and performance coverage

- Deterministic parity coverage in `tools/simTest.mjs` passed under the
  plant-illumination focus, using:

  ```text
  npm test -- --focus=plant-illumination
  ```

- It asserts the configured chunk size, 45/180 standard-world sample counts,
  partial-edge center selection, field uniformity, sampled ambient rules,
  local-source max behavior, and consumer readings.
- The opt-in benchmark passed through `npm run test:performance`. Its
  ambient-visibility-edit fixture reports chunk sample and dirty-queue
  counters alongside the one-time full-build setup sample and repeated
  incremental timings. It used the default 260×150 scope; the 520×300 run was
  not performed.
- The dated review records test status, sample counts, median/p95,
  host/browser/viewport, fixture size, benchmark scope, and raw artifact path.
  One-time full-build measurements are reported separately from per-tick
  incremental work.

## Acceptance criteria

- [x] Ambient full-refresh work classifies exactly one actual center cell per
  chunk, with AMBIENT_ILLUMINATION_CHUNK_SIZE set to 30 by default and a defined
  center for partial edge chunks.
- [x] Every cell in a chunk exposes that chunk's ambient classification; the
  current threshold, boundary visibility priority, reflection fallback, gas
  attenuation, and slider semantics apply at the sampled center.
- [x] Effective illumination remains max(chunk ambient, local emitter at cell).
  Local source fields, local overlay composition, and non-ambient simulation
  behavior remain unchanged.
- [x] Supported edits invalidate every affected chunk through conservative shadow
  wedges, and the queue converges within the accepted 1–2 second bound without
  getter-triggered full synchronous rebuilds.
- [x] Stable-world and edit benchmarks demonstrate the reduced classification
  counts, report one-time full-build and incremental costs separately, and
  preserve medians, p95s, sample counts, and environment metadata.
- [x] Documentation clearly describes the selected center-sampled 30×30
  approximation and its tile-uniform feedback/plant-light tradeoff.
