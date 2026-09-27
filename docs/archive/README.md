# Documentation archive

This directory contains historical completion, migration, audit, and status
records. They preserve what was recorded at a point in time and are not the
current source of truth. Current reference and maintenance guidance is indexed
in [`../README.md`](../README.md); active findings remain in
[`../ISSUES.md`](../ISSUES.md).

## New Dated Archives

- [`scale-profiling-2026-09-23.md`](scale-profiling-2026-09-23.md) — completion
  record for the headless scale-profiling baseline from 23 September 2026.
- [`E2E_PROGRESS-2026-09-23.md`](E2E_PROGRESS-2026-09-23.md) — the E2E
  completion matrix and verification snapshot from 23 September 2026.
- [`COMPLETED_FEATURES-2026-09-23.md`](COMPLETED_FEATURES-2026-09-23.md) — the
  implemented-feature inventory from 23 September 2026.
- [`E2E_TEST_PLAN-2026-09-23.md`](E2E_TEST_PLAN-2026-09-23.md) — the E2E plan's
  completed migration record and policy snapshot from 23 September 2026.

## Completed Reviews

- [`reviews/2026-09-26-performance-review.md`](reviews/2026-09-26-performance-review.md)
  — source-backed performance findings and priorities.
- [`reviews/2026-09-26-p0-performance-results.md`](reviews/2026-09-26-p0-performance-results.md)
  — P0 benchmark method, measurements, and limitations.
- [`reviews/2026-09-26-electrical-rendering-performance-results.md`](reviews/2026-09-26-electrical-rendering-performance-results.md)
  — electrical rendering optimization benchmark.
- [`reviews/2026-09-27-battery-trend-fps-investigation.md`](reviews/2026-09-27-battery-trend-fps-investigation.md)
  — investigation into the Battery trend indicator and FPS drop.
- [`reviews/2026-09-27-electrical-hover-and-battery-optimization-results.md`](reviews/2026-09-27-electrical-hover-and-battery-optimization-results.md)
  — electrical, hover, and ambient-light measurements with a functional-area chart.
- [`reviews/2026-09-27-ambient-illumination-chunk-performance-results.md`](reviews/2026-09-27-ambient-illumination-chunk-performance-results.md)
  — center-sampled ambient-light benchmark history and rollback comparison.

## Executed Plans

- [`plans/2026-09-27-spotlamp-and-light-switch.md`](plans/2026-09-27-spotlamp-and-light-switch.md)
  - Spotlamp directional light and Light Switch single-cell comparator, with 7/7 simulation, 4/4 machine/feedback browser, and 2/2 port verification.
- [`plans/2026-09-27-ambient-illumination-adaptive-refinement-rollback.md`](plans/2026-09-27-ambient-illumination-adaptive-refinement-rollback.md)
  - rollback to uniform center-sampled ambient chunks, focused verification, and before/after benchmark comparison; see the [results report](reviews/2026-09-27-ambient-illumination-chunk-performance-results.md).

- [`plans/2026-09-27-ambient-illumination-chunk-approximation.md`](plans/2026-09-27-ambient-illumination-chunk-approximation.md)
  — tuneable center-sampled ambient-light chunks, incremental invalidation,
  focused verification, and benchmark results; see the
  [performance report](reviews/2026-09-27-ambient-illumination-chunk-performance-results.md).
- [`plans/2026-09-27-electrical-hover-and-battery-optimization.md`](plans/2026-09-27-electrical-hover-and-battery-optimization.md)
  — binary electrical state, Battery entity trend rendering, hover caching,
  opt-in instrumentation, and incremental ambient-light profiling; see the
  [benchmark results and graph](reviews/2026-09-27-electrical-hover-and-battery-optimization-results.md).
- [`plans/2026-09-27-debug-performance-menu.md`](plans/2026-09-27-debug-performance-menu.md)
  — runtime-only debug overrides for local and ambient illumination, humidity,
  and electricity; records implementation scope and syntax/whitespace-only
  checks, with automated test suites not added or run.
- [`plans/2026-09-26-plant-illumination-and-world-light.md`](plans/2026-09-26-plant-illumination-and-world-light.md)
  — ambient world illumination, species-specific plant light responses,
  feedback, focused regressions, and the opt-in P0 performance benchmark.
- [`plans/2026-09-26-logic-gates-and-local-illumination.md`](plans/2026-09-26-logic-gates-and-local-illumination.md)
  — implemented Battery-backed logic gates and the initial local illumination
  field, with the 32/32 focused browser verification record.
- [`plans/2026-09-26-lamp-illumination-and-gate-circuit-regressions.md`](plans/2026-09-26-lamp-illumination-and-gate-circuit-regressions.md)
  — derived grid illumination, persistent and transient emitters, independent
  gate circuits and load attribution, port geometry, and the focused 32/32
  verification record.
- [`plans/2026-09-26-feedback-and-logic-gates.md`](plans/2026-09-26-feedback-and-logic-gates.md)
  — fixed canvas feedback and Battery diagnostics, logic-gate catalog and
  connector behavior, documentation consolidation, and its initial routed-AND
  verification gap, later closed by the Lamp illumination and gate-circuit
  regression plan above.
- [`plans/2026-09-26-electrical-catalog-and-environment-sensors.md`](plans/2026-09-26-electrical-catalog-and-environment-sensors.md)
  — Electricals catalog regrouping, Temperature/Humidity Switches, independent
  Battery-backed DC logic, Vegetation picker behavior, persistence, and focused
  verification outcome.
- [`plans/2026-09-25-machine-ports-sprinkler-collector-splitter.md`](plans/2026-09-25-machine-ports-sprinkler-collector-splitter.md)
  — machine ports, two-stage placement, Sprinkler migration, Collector sealing,
  Splitter flow, compatibility regressions, and final verification record.
- [`plans/2026-09-25-windows-agent-playwright-permissions.md`](plans/2026-09-25-windows-agent-playwright-permissions.md)
  — Windows sandbox browser-cache access diagnosis and verified command-level approval workflow.
- [`plans/2026-09-25-e2e-browser-setup-guidance.md`](plans/2026-09-25-e2e-browser-setup-guidance.md)
  — fresh-checkout Playwright setup, Chromium and Linux dependency installation,
  server startup, PowerShell wrappers, and report/artifact guidance.
- [`plans/2026-09-25-stainless-steel.md`](plans/2026-09-25-stainless-steel.md)
  — Stainless Steel's slower heat and electrical conduction, Battery-grid wire
  behavior, rust immunity, documentation, and verification status.
- [`plans/2026-09-25-natural-atmosphere-water-corrosion.md`](plans/2026-09-25-natural-atmosphere-water-corrosion.md)
  — the fixed natural temperature profile, Environment controls, Water-contact
  and saturated-air rust behavior, current references, and verification status.
- [`plans/2026-09-25-plant-growers-clouds-rain-handbook.md`](plans/2026-09-25-plant-growers-clouds-rain-handbook.md)
  — the practical Clouds and Rain section added to the Plant Growers Handbook.
- [`plans/2026-09-24-visualization-ui-rework.md`](plans/2026-09-24-visualization-ui-rework.md) - the Visualizations sidebar, dialog, Heat/Humidity/Wind display, save migration, and completed regression record from 24 September 2026.
- [`plans/seeds-plants-humidity-dewpoint-clouds-corrosion-2026-09-24.md`](plans/seeds-plants-humidity-dewpoint-clouds-corrosion-2026-09-24.md)
  — the seed, plant, humidity, dewpoint, cloud, precipitation, and corrosion
  implementation plan from 24 September 2026.
- [`plans/live-autosave-and-toolbar-tooltips-2026-09-24.md`](plans/live-autosave-and-toolbar-tooltips-2026-09-24.md)
  — the live Autosave control and shared toolbar-tooltip implementation from
  24 September 2026.
- [`plans/fitted-camera-and-canvas-borders-2026-09-24.md`](plans/fitted-camera-and-canvas-borders-2026-09-24.md)
  — the fitted start-view and canvas boundary-stroke follow-up from 24
  September 2026.
- [`plans/large-world-sizes-and-camera-2026-09-24.md`](plans/large-world-sizes-and-camera-2026-09-24.md)
  — the executed fixed world-size chooser, canvas gate, and large-world camera
  plan from 24 September 2026.
- [`plans/fast-metal-thermal-network-2026-09-24.md`](plans/fast-metal-thermal-network-2026-09-24.md)
  — the executed fast metal thermal network and solid-metal glow plan from
  24 September 2026.
- [`plans/scale-profile-infrastructure-2026-09-23.md`](plans/scale-profile-infrastructure-2026-09-23.md)
  — the executed headless scale-profile infrastructure plan from 23 September
  2026.
- [`plans/heat-transfer-rays-2026-09-23.md`](plans/heat-transfer-rays-2026-09-23.md)
  — the executed heat-transfer and ray-tuning implementation plan from 23
  September 2026.
- [`plans/canvas-zoom-edge-pan-2026-09-23.md`](plans/canvas-zoom-edge-pan-2026-09-23.md)
  — the executed canvas zoom, scrolling, and optional edge-pan implementation
  plan from 23 September 2026.
- [`plans/middle-click-material-picker-2026-09-23.md`](plans/middle-click-material-picker-2026-09-23.md)
  — the executed middle-click material picking and regression-verification plan
  from 23 September 2026.

## Earlier Dated Archives

- [`DOCUMENTATION-2026-09-20.md`](DOCUMENTATION-2026-09-20.md) — documentation
  findings closed during the Elemental Foundry rename and code audit.
- [`CODE_AUDIT-2026-09-20.md`](CODE_AUDIT-2026-09-20.md) — dated source and
  behavior audit.
- [`CODE_REVIEW-2026-09-20.md`](CODE_REVIEW-2026-09-20.md) — dated code review
  and verification record.
