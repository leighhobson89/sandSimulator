# Electrical and rendering performance results — 26 September 2026

## Scope and method

This is the follow-up to the [P0 baseline](2026-09-26-p0-performance-results.md)
and implements the low-risk P1 work in the
[performance review](2026-09-26-performance-review.md): reuse electrical
traversal scratch, cache unchanged electrical topology and loads, retain static
machine artwork, and sample prepared illumination arrays directly. It also
measures the requested wire-animation checkbox and 30-tick electrical refresh.

The opt-in benchmark passed on 26 September at `2026-09-26T20:17:47.671Z`,
commit `33090d4`, with a dirty working tree. It used the same host, Chromium,
viewport, deterministic fixtures, and 10 warm-up / 60 measured samples as the
baseline: Windows 10 x64 build 10.0.26200, Intel Core i7-10700KF at 3.80 GHz,
16 logical CPUs, 64 GiB RAM, Node v24.13.0, headless Chromium 153.0.8010.12,
1440×900 viewport, and visible canvas. The browser reported SwiftShader, a
software renderer. Timings are diagnostic for this environment, not a
hardware-GPU or general FPS forecast.

The benchmark retains the baseline's empty, particle, ordinary-Spark,
Battery/Lamp, and combined fixtures at 260×150 and 520×300. It adds a paired
ordinary-Spark fixture with wire animation disabled. Timing columns below are
median / p95 milliseconds, measured externally with production profiling
hooks off. **Bold current values are lower than the corresponding baseline.**
The no-animation rows have no earlier comparison.

## Whole-step and render timings

| World | Scenario | Step median / p95 | Render median / p95 |
|---|---|---:|---:|
| 260×150 | Empty control | **4.80 / 5.80** | 0.70 / 0.80 |
| 260×150 | Particle baseline | **18.35 / 23.00** | **2.40 / 2.60** |
| 260×150 | Ordinary Spark | **20.40 / 25.80** | **2.70 / 2.80** |
| 260×150 | Ordinary Spark, no wire animation | 21.20 / 25.30 | 2.50 / 2.70 |
| 260×150 | Battery + Lamp | **17.70 / 22.60** | **2.90 / 4.00** |
| 260×150 | Combined | **22.25 / 26.00** | **3.00 / 3.10** |
| 520×300 | Empty control | **18.40 / 18.60** | 2.50 / 2.60 |
| 520×300 | Particle baseline | **91.40 / 97.30** | **9.60 / 9.90** |
| 520×300 | Ordinary Spark | **103.15 / 110.00** | **10.20 / 10.50** |
| 520×300 | Ordinary Spark, no wire animation | 103.65 / 110.50 | 10.10 / 10.30 |
| 520×300 | Battery + Lamp | **90.85 / 98.70** | **10.50 / 10.70** |
| 520×300 | Combined | **102.15 / 108.20** | **10.80 / 11.10** |

The baseline had 23,473 / 94,067 non-empty cells in the particle fixture;
25,424 / 101,868 in ordinary Spark; 23,722 / 94,576 in Battery + Lamp; and
25,673 / 102,377 in Combined, for 260×150 / 520×300 respectively. Each paired
no-animation fixture had exactly the same cells, materials, and Spark seed as
its normal-animation fixture.

All comparable whole-step medians and p95s improved. Render time improved for
all populated fixtures. The 260×150 empty render is unchanged at 0.70 / 0.80;
the 520×300 empty render is 0.10 ms higher at both percentiles, a small
difference near the timer's resolution. With wire animation disabled, render
median improved by about 0.2 ms at 260×150 and 0.1 ms at 520×300 relative to
its paired animated fixture. Whole-step timing did not improve in that pair,
as expected for a rendering preference.

## Electrical and renderer stages

The old `updateElectricalPower` hook measured the full electrical work every
tick. Its new per-tick wrapper usually measures only the cadence check; the
separate `electricalTopologyRefresh` hook measures the scheduled graph and
logical-power work. For the Combined fixture:

| World | Baseline `updateElectricalPower` median / p95 | Current per-tick call median / p95 | Current scheduled refresh median / p95 |
|---|---:|---:|---:|
| 260×150 | 3.60 / 3.70 | **0.00 / 0.10** | 1.20 / 1.20 |
| 520×300 | 14.90 / 15.30 | **0.10 / 0.20** | 4.60 / 4.60 |

The browser timer reports in roughly 0.1 ms increments here; `0.00` means the
measured call was below that resolution, not that it took literally no time.
The separately recorded scheduled-refresh duration includes the expensive work.

Each stable 60-tick pass recorded exactly two scheduled refreshes and zero
forced refreshes. Topology edits and signal/supply cutoffs still trigger an
immediate refresh, as covered by the focused circuit regressions. Battery
charge application and pulse countdown remain per-tick; the Battery load graph
is not traversed again on each tick when topology and loads stay unchanged.
No battery-load traversal event occurred in the measured steady pass because
the setup-created topology/load cache was reused. The setup traversal recorded
four Battery cells, 244 / 504 conductor cells, and one load in the two world
sizes.

The ordinary-Spark traversal retained its existing workload (1,950 / 7,800
conductor cells), and its measured CPU time stayed near baseline: 0.60 / 0.70
ms at 260×150 and 2.50 / 2.70 ms at 520×300, versus 0.60 / 0.70 and
2.40 / 2.70 ms before. The scratch-allocation proxy fell from 42,900 / 171,600
cell slots to **0 newly allocated cell slots**; the visited/distance/queue
storage is retained and reused. This removed repeated world-sized scratch
allocation, but did not produce a measurable Spark traversal CPU-time win.

The combined `drawWorld` hook fell from 5.70 / 6.10 to **2.90 / 3.10 ms** at
260×150, and from 17.40 / 18.50 to **10.80 / 11.10 ms** at 520×300. Direct
illumination-array sampling reduced its combined-scene hook from 2.60 / 2.80
to **1.50 / 1.60 ms** and from 10.20 / 10.40 to **5.60 / 5.80 ms**,
respectively.

Static machine artwork was created during fixture setup, then reused across
the 60 measured frames. The current measured hook is `machineOverlayReuse`;
the baseline measured `machineOverlayRebuild`, so their durations are not a
like-for-like comparison. The new run reported one reused machine SVG per
frame in Battery + Lamp and Combined. The repeated rebuild is gone; dynamic
port state, wire bolts, Battery trend marks, and machine effects remain live.

## Conclusions and next work

- The per-tick electrical call is now cheap between scheduled refreshes, and
  Battery charge and pulse lifetimes continue at their original tick rate.
  The measured per-tick wrapper and separate refresh events make the cadence
  visible without treating a 30-tick delay as acceptable for circuit edits.
- Reusing graph scratch removed the per-Spark world-sized cell-slot
  allocation. Spark graph traversal still consumes similar CPU time, so any
  future Spark optimization should first profile Spark frequency and the
  connected-route walk on representative networks.
- Static SVG reuse and direct illumination reads materially reduced populated
  render timings. The no-animation setting gives a smaller additional render
  reduction; it does not reduce simulation-step cost.
- Battery + Lamp remains close to the particle baseline at 520×300
  (90.85 ms versus 91.40 ms median step time). This fixture does not support
  Battery drain as the main source of the large-world tick cost.
- A 520×300 particle step still takes about 91 ms and the Combined step about
  102 ms median. Whole-world physics passes remain the clearest next area to
  investigate. Profile representative gameplay in a hardware-accelerated
  browser, then use targeted measurements to select any sparse indexes or
  additional pass reductions; preserve seeded simulation behavior.

The software-rendered Chromium measurements limit conclusions about GPU work.
They also omit plant-rich worlds and do not include a user's full browser or
desktop workload. The result files are local ignored artifacts at
`test-results/performance/p0-browser.json` and
`test-results/performance/p0-browser.csv`; keep them with their host/build
metadata when making a later comparison.
