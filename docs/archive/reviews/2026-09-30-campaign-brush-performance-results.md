# Campaign brush batching and post-fix performance baseline

## Result

A size-31 brush over an empty area places up to 709 cells. Campaign mode used to
run its placement bookkeeping once for every accepted cell. Each call updated
the Campaign HUD and material catalog; when Mission 6's `confirm-fire-out`
objective was pending, it also counted all 39,000 world cells. A single brush
could therefore trigger 709 world scans and 709 synchronous UI refreshes.

The paint path now batches at the outer `paintCell`, `paintLine`, or
`paintShape` operation. Cell writes, collision/occupancy checks, random calls,
campaign budget consumption, and placement objective progress remain in their
original per-cell order. World-state evaluation, mission completion checks,
and the Campaign state notification run once when the operation finishes.
Simulation-step world-state evaluation remains unchanged because fire and
other materials can transform during an active tick.

## Brush measurements

The opt-in brush benchmark was run on 260 x 150 worlds while paused. It used two
warm-up and eight measured samples per case. With only eight samples, p95 is
effectively near the sample maximum and is not a stable tail estimate. The
pre-fix Mission 6 case and the post-fix case both placed all 709 Water cells:

The timing benchmark calls `paintCell()` directly, so it isolates placement
work. The separate browser regression covers a real brush gesture, but neither
measurement records the pointer-event-to-presented-frame delay or live RAF
frame pacing.

| Scenario | Size | Before median | After median / p95 | Accepted cells before -> after | State notifications before -> after | World scans / cells scanned before -> after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sandbox | 31 | 2.5 ms | 2.8 / 2.9 ms | 386 -> 709 | 0 -> 0 | 0 -> 0 |
| Mission 3 placement objective | 31 | 426.45 ms | 6.7 / 7.6 ms | 387.5 -> 709 | 387.5 -> 1 | 0 -> 0 |
| Mission 6 pending world-state objective | 31 | 1,167.2 ms | 6.3 / 6.9 ms | 709 -> 709 | 709 -> 1 | 709 / 27,651,000 -> 1 / 39,000 |

The Mission 6 brush improved by about 185 times on this host. The earlier
Sandbox and Mission 3 runs used the unseeded loose-material sprinkle; the saved
post-fix benchmark forces Sand placements to be deterministic and accepts all
709 cells. Their timing ratios are not a strict same-work comparison. Brush
size 1 measured 0.3 ms in Sandbox, 1.25 ms for Mission 3, and 2.0 ms for
Mission 6 after the fix; Mission 6 evaluated its pending world-state objective
once (39,000 cells).

The benchmark stores its latest detailed post-fix results in the ignored
`test-results/performance/campaign-brush.json` artifact.

## Post-fix frame baseline

The existing P0 benchmark ran 10 warm-up and 60 measured samples for each
deterministic 260 x 150 scene. `completeFrame` is the measured sum of physics
step, wind decay, rendering, and UI feedback; it does not wait for display
refresh. The 41.67 ms p95 line is a 24 FPS reference, not a pass/fail limit.

| Scene | Complete-frame median | Complete-frame p95 | `stepSimulation` median | `renderWorld` median |
| --- | ---: | ---: | ---: | ---: |
| Empty control | 18.20 ms | 27.20 ms | 16.25 ms | 0.80 ms |
| Particle baseline | 36.10 ms | 82.40 ms | 32.25 ms | 2.50 ms |
| Ordinary Spark | 39.85 ms | 86.70 ms | 36.05 ms | 2.50 ms |
| Battery + Lamp | 35.90 ms | 84.80 ms | 31.70 ms | 2.80 ms |
| Combined workload | 40.90 ms | 88.10 ms | 36.65 ms | 2.90 ms |
| Gate chain | 35.05 ms | 84.80 ms | 30.70 ms | 2.70 ms |
| Battery hover | 36.45 ms | 85.80 ms | 32.20 ms | 2.90 ms |
| Ambient visibility edit | 34.05 ms | 82.40 ms | 30.20 ms | 2.50 ms |
| Ambient open | 21.05 ms | 30.90 ms | 19.00 ms | 1.10 ms |
| Ambient occlusion dense | 15.00 ms | 15.70 ms | 11.40 ms | 2.00 ms |
| Calm air | 25.00 ms | 35.40 ms | 21.50 ms | 1.90 ms |
| Driven air | 25.55 ms | 36.10 ms | 23.15 ms | 1.30 ms |

Seven of the twelve scenes exceeded the 41.67 ms complete-frame p95 reference.
The heavier scenes were dominated by `stepSimulation`; render medians remained
between 2.5 and 2.9 ms in those scenes. This supports a CPU simulation audit as
the next performance step.

## Host and limits

- Windows 10, Intel Core i7-10700KF at 3.80 GHz, 16 logical CPUs, and 64 GiB RAM.
- Playwright's Chromium 153.0.8010.12, Node 24.13.0.
- The headless browser exposed ANGLE/SwiftShader rather than the RTX 3080. The
  frame profile is useful for CPU workload comparisons but does not measure the
  machine's hardware-accelerated rendering path.
- The measured commit was `2b9f500` with a dirty worktree. Results are
  host-specific and should be compared only with matching fixtures and setup.

## Verification

Passed focused checks:

- `npm.cmd run test:browser -- e2e/tools/campaign-paint-batching.spec.mjs --workers=1 --trace=off` — 3 tests.
- `npm.cmd run test:browser -- e2e/tools/painting.spec.mjs --grep "large campaign brush commits one placement state change" --workers=1 --trace=off` — 1 test.
- `npm.cmd run test:performance -- performance/brush-painting.spec.mjs` — 6 brush cases.
- `npm.cmd run test:performance -- performance/p0-browser.spec.mjs` — 12 frame-profile scenes.

The P0 selector was updated from the retired “New Game” label to the current
“Sandbox” menu button so the documented benchmark can start a world.
