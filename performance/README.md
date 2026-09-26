# Opt-in P0 browser performance benchmark

Run this benchmark only with:

```powershell
npm run test:performance
```

Run this suite only when a performance-specific test is explicitly requested. It is excluded from `npm test`, the ordinary `npm run test:browser` suite, and routine validation; do not add it to normal test commands. It has no timing thresholds; it records timings so reviewers can compare runs on the same host and commit. The Playwright project starts the repository's normal local server and uses its configured Chromium browser.

The benchmark uses deterministic fixtures at 260×150 and 520×300 cells. Each size covers an empty control, the scaled particle profile used by `tools/scaleProfile.mjs`, ordinary Spark propagation through a rectangular Elec grid, a fully charged four-Battery bank connected to an enabled Lamp over a long Elec route, and the combined Spark plus Battery workload. It records exact fixture counts and checks that the Battery circuit has a positive load and the Lamp is active before timing.

For each fixture, the harness restores the same captured simulation state, runs 10 warm-up samples, and collects 60 measured samples. An instrumentation-off pass times `stepSimulation`, `decayWindTrails`, and `renderWorld` externally. A second pass enables optional production timing hooks and records internal stage durations and counters separately. It reports median and p95, along with browser version, user agent, viewport, canvas size and on-screen visibility, world size, host/CPU/RAM, Node version, commit, working-tree dirty status, and WebGL renderer information when the browser exposes it. Wind-decay values below the browser clock's effective resolution appear as `0`; that means the measured duration was below resolution, not that the work is free. Missing browser or GPU details are recorded as unavailable rather than inferred.

The fixtures contain no plants, so they do not measure geometry-based ambient-field rebuilds or plant-heavy simulation behavior. They do measure per-frame local-illumination-layer scanning and drawing.

Artifacts are written to the ignored `test-results/performance/` folder as `p0-browser.json` and `p0-browser.csv`, with a readable table printed to the test output. Keep artifacts with their metadata when comparing revisions. Do not compare timings across different machines, browser versions, power states, or commits as if they were equivalent.

## Optional production timing hook contract

The harness installs `window.__P0_PERF__` with `enabled`, `events`, `record(name, durationMs, counters)`, `reset()`, and `snapshot()` members. Production code should call `record` only when the object exists and `enabled` is true. Use `performance.now()` around each stage and pass non-negative milliseconds. Counter objects should be numeric and describe the work done by that event. Instrument these stage names:

| Event name | Production location | Suggested counters |
| --- | --- | --- |
| `stepSimulation` | `physics.js`, the complete exported tick | `worldCells` |
| `updateElectricalPower` | `physics.js`, `updateElectricalPower()` | `worldCells`, `conductiveCells` |
| `ordinarySparkPropagation` | `physics.js`, ordinary (`data === 0`) Spark path through `energizeConnectedMetal()` | `touchedCells`, `connectionVisits`, `allocatedCells` |
| `batteryLoadTraversal` | `physics.js`, Battery graph/load calculation around `balanceStoredCharge()` and connected load traversal | `batteryGroups`, `batteryCells`, `conductiveCells`, `loadMachines`, `visitedCells` |
| `drawWorld` | `game.js`, `drawWorld()` | `visibleCells` |
| `machineOverlayRebuild` | `game.js`, the actual rebuild path in `drawMachineOverlays()` | `machineCount`, `svgElements`, `sparkPaths` |
| `illuminationLayer` | `game.js`, `drawIlluminationLayer()` | `cellsScanned`, `litCells` |

The recorder is deliberately an optional hook rather than a permanent profiler. Hook duration distributions include only the instrumented measured pass; setup events are used only to confirm a hook can fire (for example, an SVG overlay rebuild may happen only once). `allocatedCells` is a scratch-array cell-slot proxy counting the world-sized distance buffer plus queue/touched indices; it is not bytes, total allocation volume, or garbage-collection data. The benchmark also requires positive numeric `touchedCells` for measured ordinary Spark propagation and positive `loadMachines` for measured Battery load traversal. Missing hooks or workload counters are listed in the artifacts and fail the benchmark after the JSON and CSV have been written. The harness does not patch or wrap production functions, so instrumentation overhead is not mixed into the external timing pass.
