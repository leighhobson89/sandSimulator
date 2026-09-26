# P0 browser performance results — 26 September 2026

## Scope

This opt-in diagnostic measures the P0 leads in the
[performance review](2026-09-26-performance-review.md): whole-tick and render
time, electrical power updates, ordinary Spark propagation, Battery load
traversal, SVG machine overlays, and the illumination layer. It compares an
empty control, the scale-profile particle fixture, Spark wiring, a Battery and
Lamp circuit, and the combined Spark plus Battery workload at 260×150 and
520×300 cells.

Run it only when a performance-specific test is requested:

```powershell
npm run test:performance
```

This suite is separate from routine validation and is excluded from `npm test`
and `npm run test:browser`. Its fixture definitions, hook contract, and
reproduction details are in [`performance/README.md`](../../performance/README.md).

## Method

The run used 10 warm-up samples and 60 measured samples per fixture and size.
The first pass kept production profiling hooks off and measured simulation
steps, wind decay, and rendering externally. A second pass enabled the
optional hooks and recorded internal stage timings and counters. The measured
run was at `2026-09-26T18:00:57.124Z`, commit `004eb6d`, with a dirty working
tree. Environment: Windows 10 x64 build 10.0.26200, Intel Core i7-10700KF at
3.80 GHz, 16 logical CPUs, 64 GiB RAM, Node v24.13.0, headless Chromium
153.0.8010.12, 1440×900 viewport, visible canvas. WebGL reported Google ANGLE
Vulkan SwiftShader, a software renderer; renderer timings therefore do not
represent a hardware GPU.

The raw, ignored outputs are `test-results/performance/p0-browser.json` and
`test-results/performance/p0-browser.csv`. Timings below are milliseconds and
show median / p95. The recorded wind-decay values are below the effective
timer resolution; they should not be interpreted as zero work.

## Whole-step and render timings

These are external, instrumentation-off timings. Empty-control is the
no-particle control; particle-baseline reproduces the scale-profile mixture.
Fixture cell counts are included to make the different workloads clear.

| World | Scenario | Non-empty cells | Step median / p95 | Render median / p95 |
|---|---|---:|---:|---:|
| 260×150 | Empty control | 0 | 5.65 / 6.40 | 0.70 / 0.80 |
| 260×150 | Particle baseline | 23,473 | 19.40 / 24.30 | 3.40 / 3.60 |
| 260×150 | Ordinary Spark | 25,424 | 23.00 / 28.00 | 5.30 / 5.70 |
| 260×150 | Battery + Lamp | 23,722 | 20.20 / 24.70 | 4.20 / 5.80 |
| 260×150 | Combined | 25,673 | 24.90 / 29.00 | 5.85 / 6.20 |
| 520×300 | Empty control | 0 | 22.10 / 22.40 | 2.40 / 2.50 |
| 520×300 | Particle baseline | 94,067 | 93.90 / 101.00 | 13.30 / 13.60 |
| 520×300 | Ordinary Spark | 101,868 | 112.95 / 119.00 | 16.30 / 17.20 |
| 520×300 | Battery + Lamp | 94,576 | 93.85 / 99.80 | 14.80 / 15.00 |
| 520×300 | Combined | 102,377 | 111.30 / 117.10 | 17.00 / 18.50 |

The key material counts in those fixtures were:

| World | Scenario | Sand | Water | Fire | Elec | Spark | Batteries | Lamps |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 260×150 | Empty control | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 260×150 | Particle baseline | 7,713 | 15,513 | 160 | 0 | 0 | 0 | 0 |
| 260×150 | Ordinary Spark | 7,713 | 15,513 | 160 | 1,950 | 1 | 0 | 0 |
| 260×150 | Battery + Lamp | 7,713 | 15,513 | 160 | 244 | 0 | 4 | 1 |
| 260×150 | Combined | 7,713 | 15,513 | 160 | 2,194 | 1 | 4 | 1 |
| 520×300 | Empty control | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 520×300 | Particle baseline | 31,027 | 62,227 | 640 | 0 | 0 | 0 | 0 |
| 520×300 | Ordinary Spark | 31,027 | 62,227 | 640 | 7,800 | 1 | 0 | 0 |
| 520×300 | Battery + Lamp | 31,027 | 62,227 | 640 | 504 | 0 | 4 | 1 |
| 520×300 | Combined | 31,027 | 62,227 | 640 | 8,304 | 1 | 4 | 1 |

The ordinary-Spark fixture measures 3.60 ms more step time than the particle
baseline at 260×150 and 19.05 ms more at 520×300. The Battery + Lamp fixture
measures 0.80 ms more at 260×150 and approximately the same median step time
at 520×300. Combined measures 5.50 ms and 17.40 ms more, respectively. These
are fixture-to-fixture differences, not isolated causal costs: electrical
scenes add conductor cells and circuit layout as well as the named component.

## Internal stage timings

These instrumentation-on measurements answer whether the reviewed functions
are visible in the profile. The hook run is separate from the external timing
table and includes profiling overhead. Each entry is median / p95.

### Electrical and traversal stages

| World | Scenario | `updateElectricalPower` | Ordinary Spark propagation | Battery load traversal |
|---|---|---:|---:|---:|
| 260×150 | Empty control | 1.20 / 1.70 | — | 0.10 / 0.20 |
| 260×150 | Particle baseline | 2.00 / 2.10 | — | 0.20 / 0.30 |
| 260×150 | Ordinary Spark | 3.20 / 3.30 | 0.60 / 0.70 | 0.20 / 0.30 |
| 260×150 | Battery + Lamp | 2.40 / 2.60 | — | 0.50 / 0.60 |
| 260×150 | Combined | 3.60 / 3.70 | 0.60 / 0.70 | 0.60 / 0.60 |
| 520×300 | Empty control | 4.40 / 4.50 | — | 0.40 / 0.50 |
| 520×300 | Particle baseline | 8.20 / 8.40 | — | 0.75 / 0.80 |
| 520×300 | Ordinary Spark | 12.70 / 13.00 | 2.40 / 2.70 | 0.70 / 0.80 |
| 520×300 | Battery + Lamp | 9.30 / 9.50 | — | 1.70 / 1.80 |
| 520×300 | Combined | 14.90 / 15.30 | 2.50 / 2.70 | 1.80 / 1.90 |

The Spark network fixture touched 1,950 conductor cells at 260×150 and 7,800
at 520×300. Its reported `allocatedCells` counter was 42,900 and 171,600,
respectively. This counter is a scratch-array cell-slot proxy (world-sized
distance storage plus queue/touched index slots), not allocated bytes or GC
volume. Battery traversal covered four Battery cells, 244 / 504 conductor
cells, and one load machine.

### Renderer stages

| World | Scenario | `drawWorld` | Machine overlay rebuild | Illumination layer |
|---|---|---:|---:|---:|
| 260×150 | Empty control | 0.70 / 0.90 | 0.10 / 0.20 | 0.25 / 0.30 |
| 260×150 | Particle baseline | 3.40 / 3.60 | 0.20 / 0.30 | 2.30 / 2.50 |
| 260×150 | Ordinary Spark | 5.30 / 5.70 | 1.20 / 1.50 | 2.35 / 2.50 |
| 260×150 | Battery + Lamp | 4.10 / 4.30 | 0.50 / 0.50 | 2.60 / 2.80 |
| 260×150 | Combined | 5.70 / 6.10 | 1.30 / 1.60 | 2.60 / 2.80 |
| 520×300 | Empty control | 2.40 / 2.40 | 0.40 / 0.50 | 0.80 / 0.90 |
| 520×300 | Particle baseline | 13.30 / 13.60 | 0.70 / 0.80 | 9.50 / 9.70 |
| 520×300 | Ordinary Spark | 15.90 / 16.90 | 2.30 / 2.90 | 9.60 / 9.70 |
| 520×300 | Battery + Lamp | 14.60 / 14.90 | 1.20 / 1.30 | 10.00 / 10.10 |
| 520×300 | Combined | 17.40 / 18.50 | 2.65 / 3.40 | 10.20 / 10.40 |

For the combined case, machine-overlay counter distributions reported
278 / 362 Spark paths and 291 / 375 SVG elements at 260×150; at 520×300 they
reported 425 / 616 Spark paths and 438 / 629 SVG elements. These are median /
p95 counts across measured overlay rebuild events, not counts from the first
event alone.

## Reading the results

- Whole-step time grows sharply with world area in every fixture. The
  empty-control medians move from 5.65 ms to 22.10 ms as cells increase from
  39,000 to 156,000, showing the cost of unconditional world-wide work.
- The ordinary-Spark network and its connected conductors coincide with higher
  electrical update, step, render, and overlay timings, especially at 520×300.
  This supports measuring the reviewed Spark path and overlay work further; it
  does not isolate Spark propagation from the added network or prove it is the
  sole cause of an observed FPS drop.
- Battery traversal is measurable but small beside full-tick cost in these
  fixtures. The Battery + Lamp median does not exceed the particle baseline
  at 520×300. This run does not support attributing the large-world tick cost
  to Battery accounting alone.
- The illumination layer costs about 2.3–2.8 ms per instrumented render at
  260×150 and 9.5–10.4 ms at 520×300 for these lit/particle scenes. This stage
  merits follow-up optimization if real-browser profiling confirms it matters.
- The run does not measure plant-rich scenes or ambient geometry rebuilds, and
  its SwiftShader renderer is a major limit for drawing conclusions about GPU
  performance. Results are diagnostic for this host/build, not FPS guarantees.

## Next priorities

1. Profile a hardware-accelerated browser on the user's representative worlds
   to establish real frame pacing and separate CPU, SVG, canvas, and GPU time.
2. Compare ordinary Spark pulses on the same fixed conductor network, varying
   only Spark frequency, and include a Spark-free electrical control.
3. Add isolated Battery circuit profiles that vary Battery groups and load
   count while preserving identical world dimensions and conductor geometry.
4. If profiles confirm the render hotspots, evaluate reuse of static machine
   artwork and direct sampling of the illumination arrays; compare median and
   p95 against these fixture-matched baselines before changing simulation
   semantics.

The raw artifacts are local ignored outputs and are not committed. Keep the
host and commit metadata with any retained comparison; run this suite only for
an explicitly requested performance investigation.
