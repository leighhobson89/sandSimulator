# Uniform ambient illumination chunk rollback

## Status

**Completed: adaptive refinement rolled back and uniform center-sampled chunks
verified.** The user selected coarse ambient illumination at 30 simulation
cells. The rollback restores the uniform center-sampled model while preserving
incremental dirty-chunk updates and existing ambient behavior. Focused
simulation, browser, and performance verification passed; see the results
report linked from the documentation index.

AMBIENT_ILLUMINATION_CHUNK_SIZE in physics.js is the sole chunk-size tuning
point, currently 30 simulation cells per side. Geometry derives from this
constant; its units are simulation cells, independent of rendered pixels and
zoom.

## Reason for rollback

The adaptive exact-refinement implementation had high cost in mixed geometry:

| Profile | Measurement |
| --- | --- |
| Mixed-world field | 9,658.3 ms build; 29 of 45 chunks were mixed; 5.58 million ray checks |
| Occlusion-dense profile | 521.1 ms |
| Open profile | 1.7 ms |

The mixed-world cost erases the advantage of the 30-cell chunk approximation.
Restore its uniform center-sample behavior. Preserve the measured inexpensive
open path and keep the dense fixture in verification so the tradeoff remains
visible.

## Required behavior

### Uniform center-sampled chunks

- Use AMBIENT_ILLUMINATION_CHUNK_SIZE for every chunk dimension and all
  row/column calculations. Keep the constant as the only location needed to
  change chunk size, for example from 30 to 20 simulation cells.
- Classify exactly the in-bounds center cell of each chunk with the current
  ambient witness rules. For partial edge chunks, take the center of the
  clipped in-world bounds.
- Apply that center's visibility class and selected-ray gas flag uniformly to
  every cell in the chunk. Do not classify uncertain cells individually or
  refine a chunk to per-cell values. Keep the ambient world field available to
  existing callers, with equal values throughout each chunk.
- Remove adaptive mixed-chunk refinement, per-cell visibility/gas caches, and
  the fast certification path. Remove the adaptive-only counters
  certifiedUniformChunks, mixedRefinedChunks, and exactCellWitnessQueries.
  Keep general counters needed for performance work: chunks sampled, cells
  written, rays traced, chunks queued/processed/pending, dirty age, fallback
  count, and elapsed time.

### Preserve existing illumination behavior

- Keep the Ambient Light rules at each sampled center: values at or below 10
  are uniform; above 10, top visibility gets the full target, bottom-only gets
  half, and neither gets reflected value 10. The selected ray's gas flag
  attenuates its ambient result once by 25%.
- Preserve the effective-light rule max(ambient, local source contribution).
  Keep Lamps, Fire, Lava, Scoria, and explosion fields, local source tint, and
  the renderer unchanged.
- Cache each chunk center's visibility class and gas flag. Slider changes
  remap those cached values and fill uniform chunks without new witness rays.
- Preserve shadow-wedge invalidation and the incremental dirty-chunk queue.
  Re-sample only each dirty chunk center under the existing time/work budget.
  Getters return cached values while the queue drains; they do not trigger a
  synchronous full rebuild.
- Preserve queued full-refresh fallback for world reset, broad invalidation,
  or degenerate geometry. Retain convergence within 120 simulation ticks.
- Keep derived ambient illumination out of saves and blueprints. Rebuild it
  after create, reset, resize, Save/Load, or restore.

## Focused regression scope

Regression drafts are in `tools/simTest.mjs` and
`e2e/feedback/illumination.spec.mjs`; performance coverage is in
`performance/p0-browser.spec.mjs`.

Before the rollback, the focused simulation run reported **23 passed, 2 failed**.
The only failures were `ambient chunks sample their center and fill partial
edge tiles uniformly` and `every cell in a mixed chunk uses its in-bounds
center sample across the former wall split`. All ambient-rule and local-light
assertions passed. This was the baseline for the rollback. After the rollback,
the focused simulation suite passed **25/25**.

### Deterministic simulation

Run with the project's focused npm command:

```text
npm test -- --focus=plant-illumination
```

Coverage includes the configured positive chunk-size constant; center sampling
for full and partial chunks; uniform values across former wall, gas, and
diagonal splits; defaults and clamping; low-light floor; top/bottom visibility
and reflection fallback; diagonal and non-45-degree rays; one-time gas
attenuation; slider, blocker, gas, and tick invalidation; stable cache reuse;
effective `max(ambient, local)` including Fire; persistence defaults; and
exclusion of derived illumination from saves.

Post-implementation result: **25 passed, 0 failed**.

### Browser regressions

Run the drafted focused spec through the repository wrapper:

```text
npm run test:browser -- e2e/feedback/illumination.spec.mjs --workers=1 --trace=off
```

The spec cases cover: low-light floor, top/bottom visibility, and gas
attenuation; uniform center samples across a former wall split; slider remaps
without rays and convergence after edits; local-source maximum and refresh
after slider/solid/gas/tick changes; build-once and idle behavior with
incremental convergence; and comparison against full builds for visibility,
overlapping wedges, and world edges. Fixtures exercise full/partial chunks,
heterogeneous wall/gas/diagonal layouts, configured chunk size, standard
45/180 chunk counts, debug-off uniformity, plant/hover reads, and cached
getters. Comparisons use the uniform center-sample reference.

Post-implementation result: **20 passed, 0 failed**.

### Performance profiles

Run the opt-in benchmark with:

```text
npm run test:performance
```

`performance/p0-browser.spec.mjs` includes `ambient-open` and
`ambient-occlusion-dense`. The final 260x150 run used 10 warmups and 60
measured samples; the ambient edit build took 20.2 ms (45 visibility samples,
39,000 cells written, 10,082 rays) and step median/p95 was 21.85/69.6 ms.
Open build: 1.7 ms, 45 samples, zero rays. Occlusion-dense build: 3.8 ms,
45 samples, 20,716 rays. All builds filled 39,000 cells. Report full-build, incremental-edit, and
slider-remap median/p95; `chunksSampled`, `cellsWritten`, ray traces,
pending/processed chunks, dirty age, fallback count, warmups, sample count, and
environment. Do not expect or report adaptive-only counters
`certifiedUniformChunks`, `mixedRefinedChunks`, or
`exactCellWitnessQueries`. Compare before/after on the same host, world size,
browser, and fixtures; label nested stage timings as overlapping and
non-additive. Post-implementation result: **1 passed, 0 failed, no missing
hooks**.

## Acceptance outcome

The rollback restores uniform center-sampled values, with no mixed-chunk
refinement or per-cell visibility/gas cache. The dirty queue and slider remap
remain incremental, local illumination remains unchanged, and the browser
regression confirms convergence within 120 simulation ticks. The benchmark
compares open, occlusion-dense, and ambient-edit scenarios without adaptive
counters. See
`docs/archive/reviews/2026-09-27-ambient-illumination-chunk-performance-results.md`
for the dated comparison and measurement limits.
