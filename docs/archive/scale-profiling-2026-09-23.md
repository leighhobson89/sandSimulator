# Scale profiling baseline — 23 September 2026

The roadmap item to profile before changing architecture is complete. The
existing headless simulation suite retains its fixed 260×150 workload and
8 ms/frame average assertion. The no-CLI-option `npm run profile:scale` command
adds creation and physics-step diagnostics for this fixed synthetic-only matrix:

| Synthetic world | Cells | Create (ms) | Step average (ms) | Step median (ms) | Step p95 (ms) | Estimated memory (MiB) |
|---|---:|---:|---:|---:|---:|---:|
| 260×150 | 39,000 | 2.96 | 6.216 | 5.613 | 8.969 | 3.46 |
| 520×300 | 156,000 | 5.69 | 27.535 | 23.939 | 37.675 | 13.84 |
| 1040×600 | 624,000 | 8.09 | 132.624 | 143.439 | 156.901 | 55.34 |

These figures are machine-specific, informational measurements—not performance
thresholds. The profile is physics-only: it does not measure `game.js` canvas
drawing or SVG overlays. Creation is timed separately from simulation steps.
Memory values estimate 85 bytes of primary physics arrays and 8 bytes of render
memory per cell; they are not measured process memory or RSS.

All profile dimensions are fixed and cannot be selected with CLI options. The
1040×600 size is synthetic only: no UI size selector or larger playable world
exists. New worlds retain the 150-row, workspace-fitted default. The old
`WORLD_PRESETS.large` preset has been removed. `worldConfig.js` retains the
2,000,000-cell allocation limit, and `physics.createWorld()` validates before
changing global dimensions or allocating arrays. Deferred Worker/WASM and
WebGL/WebGPU recommendations remain in `docs/FUTURE_IDEAS.md`.
