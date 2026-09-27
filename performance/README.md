# Opt-in P0 browser performance benchmark

Run this benchmark only with:

```powershell
npm run test:performance
```

Run this suite only when a performance-specific test is explicitly requested. It is excluded from `npm test`, the ordinary `npm run test:browser` suite, and routine validation; do not add it to normal test commands. It has no timing thresholds; it records timings so reviewers can compare runs on the same host and commit. The Playwright project starts the repository's normal local server and uses its configured Chromium browser.

The default benchmark uses deterministic fixtures at 260 x 150 cells, the small-world size relevant to the current FPS investigation. Set `P0_PERFORMANCE_SCOPE=all` before running the same npm command to include the 520 x 300 full-scale fixtures; this longer run has a 60-minute limit. Each selected size covers an empty control, the scaled particle profile, ordinary Spark charging, a Battery-backed Lamp, combined Spark plus Battery workload, an AND-to-NOT gate chain, Battery hover feedback, a repeated solid edit plus target remap for ambient visibility, and mostly open plus occlusion-dense ambient profiles. The ambient fixtures report chunk samples, writes, pending work, ray traces, slider remaps, and fallback counts.

For each fixture, the harness restores the same captured simulation state, runs 10 warm-up samples, and collects 60 measured samples. An instrumentation-off pass times `stepSimulation`, `decayWindTrails`, and `renderWorld` externally. A second pass enables optional production timing hooks and records internal stage durations and counters separately. It reports median and p95, along with browser version, user agent, viewport, canvas size and on-screen visibility, world size, host/CPU/RAM, Node version, commit, working-tree dirty status, and WebGL renderer information when the browser exposes it. Wind-decay values below the browser clock's effective resolution appear as `0`; that means the measured duration was below resolution, not that the work is free. Missing browser or GPU details are recorded as unavailable rather than inferred.

The fixtures contain no plants, so they do not measure plant-heavy simulation behavior. The ambient edit case measures visibility-cache updates; all scenes also measure the local illumination layer.

Artifacts are written to the ignored `test-results/performance/` folder as `p0-browser.json` and `p0-browser.csv`, with a readable table printed to the test output. Keep artifacts with their metadata when comparing revisions. Do not compare timings across different machines, browser versions, power states, or commits as if they were equivalent.

## Optional production timing hook contract

The harness installs `window.__P0_PERF__` with `enabled`, `events`, `record(name, durationMs, counters)`, `reset()`, and `snapshot()` members. Production code should call `record` only when the object exists and `enabled` is true. Use `performance.now()` around each stage and pass non-negative milliseconds. Counter objects should be numeric and describe the work done by that event. Instrument these stage names:

| Event name | Production location | Suggested counters |
| --- | --- | --- |
| `stepSimulation` | `physics.js`, the complete exported tick | `worldCells` |
| `updateElectricalPower` | `physics.js`, `updateElectricalPower()` | `worldCells`, `conductiveCells` |
| `electricalTopologyRefresh` | `physics.js`, topology/load rebuild and logical refresh cadence | `worldCells`, `conductiveCells`, `batteryGroups`, `batteryCells`, `loadMachines`, `visitedCells`, `scheduledRefreshes`, `forcedRefreshes`, `topologyRebuilt`, `loadCacheRebuilt` |
| `logicalGateSolve` | `physics.js`, synchronous logic-gate state solve | `gateCount`, `iterations`, `iterationLimit`, `forcedOffCount` |
| `ambientIlluminationFullBuild` | `physics.js`, full ambient center-sample build | `worldCells`, `visibilityCells`, `chunksSampled`, `cellsWritten`, `pendingChunks`, `rayTraces` |
| `ambientIlluminationIncrementalUpdate` | `physics.js`, queued ambient visibility updates | `worldCells`, `chunksSampled`, `cellsWritten`, `pendingChunks`, `rayTraces`, `queuedTargets`, `processedTargets`, `dirtyTargets`, `columnsUpdated`, `rowsUpdated`, `fallbackCount`; recorder-only `sampledChunkIds` is row-major |
| `ambientIlluminationSliderRemap` | `physics.js`, cached visibility-class remap after target change | `chunksRemapped`, `cellsWritten`, `rayTraces` (always zero) |
| `hoverHitTest` | `game.js`, pointer-to-machine artwork hit testing | `exactSvgTests`, `cacheHits`, `candidateCount`, `hit` |
| `updateFeedback` | `game.js`, feedback-panel refresh | `hasPointer`, `machineCount` |
| `ordinarySparkPropagation` | `physics.js`, ordinary (`data === 0`) Spark path through `energizeConnectedMetal()` | `touchedCells`, `connectionVisits`, `allocatedCells` |
| `batteryLoadTraversal` | `physics.js`, Battery graph/load calculation around `balanceStoredCharge()` and connected load traversal | `batteryGroups`, `batteryCells`, `conductiveCells`, `loadMachines`, `visitedCells` |
| `drawWorld` | `game.js`, `drawWorld()` | `visibleCells` |
| `machineOverlayRebuild` | `game.js`, the actual rebuild path in `drawMachineOverlays()` | `machineCount`, `svgElements` |
| `machineOverlayReuse` | `game.js`, retained machine overlay and Battery status update | `machineCount`, `staticSvgReuse`, `batteryGroupsVisited`, `trendGlyphsCreated` |
| `electricalStatusOverlay` | `game.js`, one cached charge-trend glyph per Battery group | `batteryGroupsVisited`, `trendGlyphsCreated` |
| `illuminationLayer` | `game.js`, `drawIlluminationLayer()` | `cellsScanned`, `litCells` |

The recorder is deliberately an optional hook rather than a permanent profiler. Hook duration distributions include only the instrumented measured pass; setup events are used only to confirm a hook can fire (for example, an SVG overlay rebuild may happen only once). `allocatedCells` is a scratch-array cell-slot proxy counting the world-sized distance buffer plus queue/touched indices; it is not bytes, total allocation volume, or garbage-collection data. The benchmark also requires positive numeric `touchedCells` for measured ordinary Spark propagation and positive `loadMachines` for measured Battery load traversal. Missing hooks or workload counters are listed in the artifacts and fail the benchmark after the JSON and CSV have been written. The harness does not patch or wrap production functions, so instrumentation overhead is not mixed into the external timing pass.

## Electrical rendering and refresh comparison

Electrical wires use steady binary `logicalPower` only. There is no wire-pulse toggle, delay plane, Battery Spark emission, or animation-control scenario. Ordinary Spark, Battery, and gate fixtures record the Battery status overlay; every measured tick must keep `world.power` and `world.powerDelay` empty. The gate-chain fixture verifies the AND output feeds a NOT input while each gate uses its separate Battery-backed supply.

`electricalTopologyRefresh` measures the expensive topology/load and logical
power refresh, separate from per-tick battery charge application. For each
stable 60-tick measured pass, the fixture expects exactly two
scheduled refreshes and zero forced refreshes. Any forced refresh or additional
refresh is reported as a cadence failure; circuit edits remain covered by the
focused machine tests. A `batteryLoadTraversal` event can be sparse when the
topology/load cache is reused, so positive `loadMachines` evidence may come
from setup or `electricalTopologyRefresh`. The live Battery circuit must still
report positive load and its Lamp must remain active.

Ambient world light uses a 30 x 30-cell chunk grid, exported as `AMBIENT_ILLUMINATION_CHUNK_SIZE`. Each chunk samples the in-bounds center cell (the lower center for even extents and partial edges), then fills every cell in that chunk uniformly from the sampled visibility class and selected-ray gas flag. Dirty updates resample only queued chunk centers; slider remaps reuse cached chunk classifications with zero ray traces. Incremental events include `sampledChunkIds` as a row-major array of zero-based IDs (`chunkY * chunkCols + chunkX`, where `chunkCols = ceil(worldCols / AMBIENT_ILLUMINATION_CHUNK_SIZE)`).

The JSON artifact retains hook counter summaries and raw events. The CSV also reports refresh cadence, Spark charging work, Battery load-machine counts, retained overlay reuse, Battery groups and trend glyphs, gate solve counts, ambient chunks sampled/cells written/pending chunks/ray traces/slider remaps, hover cache hits versus exact SVG tests, and local illumination lookup/rebuild deltas. `machineOverlayReuse` and `electricalStatusOverlay` report Battery-group and glyph counts; no wire-bolt counters remain. `electricalTopologyRefresh` reports its scheduled/forced refreshes, topology/load rebuild flags, and graph sizes as numeric counters. These are workload and reuse indicators; timing comparisons still need the same host, browser, and commit context.
