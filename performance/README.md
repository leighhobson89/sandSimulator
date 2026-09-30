# Opt-in P0 browser performance benchmark

Run this benchmark only with:

```powershell
npm run test:performance
```

Run the brush-specific subset with:

```powershell
npm run test:performance -- performance/brush-painting.spec.mjs
```

Run the Tier 0 live-frame capture with:

```powershell
npm run test:performance -- performance/live-frame.spec.mjs
```

Run this suite only when a performance-specific test is explicitly requested. It is excluded from `npm test`, the ordinary `npm run test:browser` suite, and routine validation; do not add it to normal test commands. It has no timing thresholds; it records timings so reviewers can compare runs on the same host and commit. The 260 x 150 target is a minimum of 24 FPS, or a `completeFrame` p95 no greater than 41.67 ms; this is a reference target, not a wrapper pass/fail threshold. The Playwright project starts the repository's normal local server and uses its configured Chromium browser.

The default benchmark uses deterministic fixtures at 260 x 150 cells, the small-world size relevant to the current FPS investigation. Set `P0_PERFORMANCE_SCOPE=all` before running the same npm command to include the 520 x 300 full-scale fixtures; this longer run has a 60-minute limit. Each selected size covers an empty control, the scaled particle profile, ordinary Spark charging, a Battery-backed Lamp, combined Spark plus Battery workload, an AND-to-NOT gate chain, Battery hover feedback, a repeated solid edit plus target remap for ambient visibility, mostly open plus occlusion-dense ambient profiles, and calm-sealed (`air-calm`) plus driven-wind/Heater (`air-driven`) circulation. The ambient fixtures report chunk samples, writes, pending work, ray traces, slider remaps, and fallback counts.

The Tier 0 live-frame capture is a separate 260 x 150 procedure. It leaves the
normal RAF loop active and compares a Sandbox control with Mission 6's pending
`confirm-fire-out` objective. Collect 10 warm-up frames and 60 measured frames
for each scene. It reports RAF interval summaries, six sequential simulation
stage timings, `stepSimulation` counts, and Mission 6 world-state scan counts
and scanned cells. A real size-31 canvas click records the time from canvas
mousedown to the next completed draw, plus accepted paint cells, resource use,
Campaign notifications, and click-triggered scans. The browser spec writes
`test-results/performance/live-frame.json`; it has no host-sensitive timing
threshold. Record the actual browser renderer and host metadata when comparing
local hardware with the headless run.

For each fixture, the harness restores the same captured simulation state, runs 10 warm-up samples, and collects 60 measured samples. An instrumentation-off pass times `stepSimulation`, `decayWindTrails`, and `renderWorld` externally, then calculates each sample's `completeFrame` as their sum plus the separately measured UI `feedbackFrame`. The p95 of this per-sample sum is the complete-frame metric; `feedbackFrame` alone is only UI feedback time. A second pass enables optional production timing hooks and records internal stage durations and counters separately. It reports median and p95, along with browser version, user agent, viewport, canvas size and on-screen visibility, world size, host/CPU/RAM, Node version, commit, working-tree dirty status, and WebGL renderer information when the browser exposes it. Wind-decay values below the browser clock's effective resolution appear as `0`; that means the measured duration was below resolution, not that the work is free. Missing browser or GPU details are recorded as unavailable rather than inferred.

The fixtures contain no plants, so they do not measure plant-heavy simulation behavior. The ambient edit case measures visibility-cache updates; all scenes also measure the local illumination layer.

Artifacts are written to the ignored `test-results/performance/` folder as `p0-browser.json` and `p0-browser.csv`, with a readable table printed to the test output. Keep artifacts with their metadata when comparing revisions. Do not compare timings across different machines, browser versions, power states, or commits as if they were equivalent.

## Optional production timing hook contract

The harness installs `window.__P0_PERF__` with `enabled`, `events`, `record(name, durationMs, counters)`, `reset()`, and `snapshot()` members. Production code should call `record` only when the object exists and `enabled` is true. Use `performance.now()` around each stage and pass non-negative milliseconds. Counter objects should be numeric and describe the work done by that event. Instrument these stage names:

| Event name | Production location | Suggested counters |
| --- | --- | --- |
| `stepSimulation` | `physics.js`, the complete exported tick | `worldCells` |
| `simulationStage:environmentOpenAir` | `physics.js`, wind-cycle/environment setup and open-air classification | `worldCells` |
| `simulationStage:thermalSurfaces` | `physics.js`, thermal masks, humidity, heat, radiation, and liquid surfaces | `worldCells` |
| `simulationStage:machinesPower` | `physics.js`, power refresh, active machines, storage, sprinklers, tubing, and mixers | `worldCells` |
| `simulationStage:airTransport` | `physics.js`, ambient wind and scalar air transport | `worldCells` |
| `simulationStage:particleScan` | `physics.js`, ordered bottom-up particle traversal | `worldCells` |
| `simulationStage:postProcessing` | `physics.js`, ambient/plant work and the simulation-step listener | `worldCells` |
| `animationFrame` | `game.js`, normal RAF loop after `drawWorld()` returns; duration is the interval between RAF timestamps | `frameIndex`, `rafTimestampMs` |
| `drawComplete` | `game.js`, normal RAF loop after `drawWorld()` returns; duration is callback start to draw completion | `frameIndex`, `rafTimestampMs` |
| `inputToNextDrawCompleteMs` | `game.js`/`ui.js`, real canvas mousedown through the next `drawWorld()` completion | `inputCount`, `brushSize` |
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
| `airScalarTransport` | `physics.js`, bounded air-temperature/humidity mixing pass | `ran`, `intervalTicks`, `airCellsVisited`, `horizontalFacesVisited`, `verticalFacesVisited`, `classTwoCells`, `faceSweepCellVisits`, `limiterPasses`, `topologyMaskBuildMs`, `topologyMaskCells`, `uniformBackgroundEdgesSkipped`, `activeMachineCount`, `activeMaskCells`, `activeJetCells`, `mixSkipCount` |
| `simulationStage:postProcessing:flushAmbientPendingChanges` | `physics.js`, complete pending ambient-change flush | `worldCells`, `pendingCells` |
| `simulationStage:postProcessing:ambientFlush:pendingClassificationFilter` | `physics.js`, filter pending changes and collect affected rows/columns | `pendingCells`, `changedCells`, `uniqueColumns`, `uniqueRows` |
| `simulationStage:postProcessing:ambientFlush:columnRefresh` | `physics.js`, refresh affected ambient columns | `uniqueColumns`, `columnsRefreshed`, `columnCellsVisited` |
| `simulationStage:postProcessing:ambientFlush:rowRefresh` | `physics.js`, refresh affected ambient rows | `uniqueRows`, `rowsRefreshed`, `fullRowPrefixCells`, `fullRowSuffixCells` |
| `simulationStage:postProcessing:ambientFlush:shadowWedgeEnqueueFallback` | `physics.js`, enqueue shadow wedges and apply the existing queue fallback | `changedCells`, `wedgeEnqueueAttempts`, `queuedWork`, `fallbackCount` |
| `campaignWorldStateObjectiveScan` | `campaign.js`, full-world count used by pending Campaign world-state objectives | `worldCells`, `pendingObjectives` |

The recorder is deliberately an optional hook rather than a permanent profiler. Hook duration distributions include only the instrumented measured pass; setup events are used only to confirm a hook can fire (for example, an SVG overlay rebuild may happen only once). `allocatedCells` is a scratch-array cell-slot proxy counting the world-sized distance buffer plus queue/touched indices; it is not bytes, total allocation volume, or garbage-collection data. The benchmark also requires positive numeric `touchedCells` for measured ordinary Spark propagation and positive `loadMachines` for measured Battery load traversal. Missing hooks or workload counters are listed in the artifacts and fail the benchmark after the JSON and CSV have been written. The harness does not patch or wrap production functions, so instrumentation overhead is not mixed into the external timing pass.

The brush benchmark reports paused `paintCell()` duration distributions for Sandbox, a material-placement Campaign mission, and Mission 6 with its world-state objective pending, at brush sizes 1 and 31. It times with production hooks disabled, then uses a separate instrumented pass to count Campaign notifications and world-state scans. It prints median/p95 placement time, accepted cells, notifications per paint, scans per paint, and scanned world cells. These measurements have no timing threshold. It currently uses eight measured samples, so p95 is near the sample maximum rather than a stable tail estimate; increase to at least 30 for future distribution comparisons.

## Campaign brush batching results (30 September 2026)

Campaign material placements now retain per-cell budget and objective-progress
updates while deferring world-state checks, completion checks, and Campaign
refresh notifications until the outer paint operation finishes. The same-host
size-31 results were:

| Scenario | Before median -> after median / p95 | Notifications before -> after | World-state scans before -> after | World cells scanned before -> after |
| --- | ---: | ---: | ---: | ---: |
| Sandbox | 2.5 -> 2.8 / 2.9 ms | 0 -> 0 | 0 -> 0 | 0 -> 0 |
| Mission 3 placement objective | 426.45 -> 6.7 / 7.6 ms | 387.5 -> 1 | 0 -> 0 | 0 -> 0 |
| Mission 6 pending world-state objective | 1,167.2 -> 6.3 / 6.9 ms | 709 -> 1 | 709 -> 1 | 27,651,000 -> 39,000 |

Mission 6 compares the same deterministic 709-cell Water placement and is the
cleanest before/after measurement. The earlier Sandbox and Mission 3 runs used
the loose-material random sprinkle, while the saved benchmark now uses a fixed
random result so it accepts all 709 candidate cells. Treat those two timings as
indicative rather than exact apples-to-apples ratios. Full environment data and
the historical pre-Tier 1 260 x 150 frame baseline are in the
[30 September performance results](../docs/archive/reviews/2026-09-30-campaign-brush-performance-results.md).
The benchmark calls `paintCell()` directly while paused; it does not measure
pointer-event-to-presented-frame latency or live RAF pacing.

The latest Tier 1 P0 run still exceeds the 41.67 ms p95 reference in 7 of 12
260 x 150 scenes. See the complete-frame table below and the subphase timing
breakdown under Tier 1. Chromium exposed SwiftShader in this headless run, so
these measurements do not assess the installed RTX 3080's hardware-accelerated
rendering path.

## Air-scalar transport behavior

Calm and driven air-scalar transport runs every other simulation tick at its
original per-update rate. This reduces solver work but also makes air-field
mixing less responsive to changes between due transport ticks; direct machine
treatment, particle movement, weather, and sources/sinks continue on the normal
simulation cadence.

Each due transport tick builds a transient three-state topology mask from the
current world: `0` is non-air, `1` is air behind a storage barrier, and `2` is
transfer-eligible air. Scalar transport phases and the limiter reuse this mask;
active-jet field construction occurs earlier in the tick. The classification
preserves storage-wall blocking and is rebuilt on each due tick. The face sweep
skips an edge only when both eligible cells exactly equal the live background
for every enabled scalar field. It uses strict equality without a tolerance, so
small temperature or humidity anomalies and mixed-field cases remain active.
The `uniformBackgroundEdgesSkipped` counter records these no-op edges.

## Current P0 260 x 150 frame baseline

The latest P0 wrapper run recorded complete-frame times for all 12 scenes.
`completeFrame` is the per-sample sum of simulation, wind decay, rendering,
and UI feedback. The 41.67 ms p95 value is a 24 FPS reference, not a benchmark
pass/fail limit.

| Scene | Complete-frame median | Complete-frame p95 |
| --- | ---: | ---: |
| Empty control | 18.20 ms | 28.10 ms |
| Particle baseline | 36.30 ms | 82.80 ms |
| Ordinary Spark | 40.40 ms | 87.00 ms |
| Battery + Lamp | 35.95 ms | 84.50 ms |
| Combined workload | 41.20 ms | 88.60 ms |
| Gate chain | 35.25 ms | 83.40 ms |
| Battery hover | 36.00 ms | 85.40 ms |
| Ambient visibility edit | 34.20 ms | 80.40 ms |
| Ambient open | 21.15 ms | 31.10 ms |
| Ambient occlusion dense | 14.90 ms | 15.60 ms |
| Calm air | 24.95 ms | 36.10 ms |
| Driven air | 25.60 ms | 36.60 ms |

Seven of the twelve scenes exceed the 41.67 ms p95 reference, so this run does
not establish 24 FPS across all scenes. It used an Intel Core i7-10700KF with
64 GiB RAM, Chromium 153.0.8010.12, and headless ANGLE/SwiftShader. The profile
does not measure the machine's hardware-accelerated GPU rendering path. The
JSON and CSV artifacts report `completeFrameMedianMs` and
`completeFrameP95Ms` alongside solver-work counters for same-host comparisons.

## Tier 1 air-scalar transport results

Tier 1 builds a reusable row-major index of transfer-eligible class-2 air cells
during the existing topology classification. The three face sweeps and
receiver-scale updates reuse it; class-1 global-minimum and donor passes remain
full-world scans. Seeded world arrays and RNG state match exactly with
instrumentation enabled or disabled, and humidity-on/off per-tick golden hashes
remain unchanged.

| Fixture | Indexed class-2 cells / 39,000 slots | `airScalarTransport` p50 / p95 |
| --- | ---: | ---: |
| Ambient open | about 19,500 | 9.15 / 19.20 ms |
| Dense occlusion | median 116.5; about 349.5 visits across three sweeps versus 117,000 full-scan slots | 0.25 / 0.70 ms |
| Calm air | about 19,500 | 10.00 / 20.40 ms |
| Driven air | about 19,500 | 10.00 / 20.50 ms |

The reduction is largest in the dense profile, where transfer-eligible air is
sparse. Open-air transport still visits roughly half the board and remains a
measurable CPU cost. Fine post-processing and ambient-flush timing events now
identify subordinate work and its counters without changing queue behavior.
The browser E2E contract verifies the event sequence and seeded telemetry
parity. Focused Tier 1 checks passed: air-scalar-index (9/9), air-circulation
(76/76), physics telemetry E2E (1/1), live-frame (1/1), and P0 (1/1). The
browser spec used the repository npm wrapper with approved browser-cache access.

The live-frame capture reported complete-frame p50/p95 of 16.70/33.30 ms in
Sandbox and 16.75/33.40 ms in Mission 6; input-to-next-draw completion was
69.4 ms and 41.2 ms respectively. Chromium used SwiftShader, so these figures
do not validate RTX 3080 hardware rendering.

The new post-processing events narrow the large P0 tails: in particle,
circuit, and ambient-edit fixtures, `flushAmbientPendingChanges` p95 was about
45.6–47.7 ms. `shadowWedgeEnqueueFallback` accounted for about 43.3–45.3 ms of
that tail; column refresh was about 1.8–2.0 ms. The dedicated Mission 6
objective scan remained non-dominant. These measurements identify a candidate
for a later evidence-gated investigation. No shadow-wedge queue or fallback
behavior changed in Tier 1.

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
