# Battery trend FPS drop investigation — 27 September 2026

## Symptom

The game begins near 60 FPS. Around the first five-second Battery charge trend update, when the Battery is first identified as charging or discharging, FPS falls to roughly 4–5 and remains there after the Battery and wires are removed. The cause is not proven. The five-second timing and the persistence after removal may have different causes.

## Findings

### 1. Trend glyph rendering matches the trigger, but not the persistence (medium confidence)

`drawElectricalSignalOverlay()` samples each visible Battery's stored charge and updates its trend state every 5,000 ms ([game.js](../../game.js#L1747), especially the sample at lines 1781–1808). Once the state is known, it creates a new SVG `+` or `−` text glyph for each Battery cell on every redraw. The glyph uses the `.battery-charge-trend` style, which has a drop shadow ([styles.css](../../styles.css#L1414)). The animation loop redraws the world and updates feedback on every animation frame ([game.js](../../game.js#L527)); `drawMachineOverlays()` clears and rebuilds its dynamic overlay contents during those draws ([game.js](../../game.js#L1331)).

This is a plausible load if the scene has a large Battery block: the glyph count grows with visible Battery cells. For one or a few cells, this is unlikely on its own to explain a fall from 60 FPS to 4–5 FPS. After Battery removal, the dynamic overlay is rebuilt without those glyphs and the trend sample map removes entries whose cells are no longer Batteries ([game.js](../../game.js#L1813)). Therefore this rendering path alone does not explain the sustained slowdown.

### 2. Battery hover feedback can repeat a component walk every frame (low to medium confidence)

While the pointer is over a Battery, `updateFeedback()` calls `getBatteryCircuitMetrics()` ([game.js](../../game.js#L2302), [game.js](../../game.js#L2404)). That query walks all touching Battery cells, allocates a cell list, sorts it, then reads cached circuit load data ([physics.js](../../physics.js#L3103), [physics.js](../../physics.js#L3163)). The walk runs before the trend reaches five seconds, so it does not explain the timing by itself. It could add significant work for a very large Battery bank if the pointer stays over it. Moving the pointer outside the canvas, or hovering empty air, removes this query.

### 3. Continuing Spark sources or other particles could explain persistence (low confidence, but consistent with removal)

Charged Battery cells can emit occasional Spark particles (`chargeSparkChance` 0.0004 at full charge in [particles.json](../../particles.json#L1039); emission is in [physics.js](../../physics.js#L5210)). Those particles can remain and continue simulation work after their Battery is deleted. More persistent sources are Spark Block and Spark Dust: both emit Sparks with 0.02 probability per tick; Spark Block can last up to 6,000 ticks and Spark Dust up to 1,200 ticks ([particles.json](../../particles.json#L1132), [particles.json](../../particles.json#L1147); source behavior in [physics.js](../../physics.js#L5227)). If either was present in the circuit area, removing Battery and wire cells would not remove it. Battery sparks are sparse, so this remains a possibility rather than a finding.

### 4. The existing P0 measurements do not cover the five-second transition

The P0 fixture uses four Battery cells. Before every timed sample it resets their charge to full, then runs simulation and render synchronously ([p0-browser.spec.mjs](../../performance/p0-browser.spec.mjs#L314), [p0-browser.spec.mjs](../../performance/p0-browser.spec.mjs#L325)). The 60 measured samples complete without waiting five seconds, so they do not observe the charge trend transition or sustained in-game RAF behavior. The report measured Battery load traversal as a small part of its tested fixture, but that result does not rule out a large Battery mass or costly SVG glyph count in the user's world ([P0 results](2026-09-26-p0-performance-results.md)).

The current `electricalWireAnimation` performance hook records powered conductor and bolt counts, not Battery trend sample count, glyph count, or `updateFeedback()` duration ([game.js](../../game.js#L1851)). A focused capture of those values would separate Battery scanning from the number of generated glyphs and hover work.

## Useful observations with the debug menu

- Compare fresh, otherwise identical runs with the pointer outside the canvas and over the Battery. If only the Battery-hover run drops, inspect the repeated Battery metrics query first.
- If possible, pause simulation before the five-second sample while leaving rendering active. A drop that still begins at the trend update points toward rendering or hover feedback; a drop that requires active simulation points toward ongoing simulation work.
- When FPS tanks, remove Batteries and wires, then observe whether the next frame clears their trend glyphs. If FPS stays low, count remaining Spark, Spark Dust, Spark Block, and Fire particles; inspect long-lived emitters as well as short-lived particles.
- Compare the electricity switch in separate fresh runs. If switching it off restores FPS, that implicates electricity-dependent work collectively (simulation and overlay), not a specific subroutine. The switch is intentionally broad and cannot distinguish those costs by itself. Light and humidity switches can show whether an unrelated field calculation dominates the base workload.

## Assessment

The five-second Battery trend is the clearest timing correlation. Per-Battery SVG glyph creation/recreation is the leading UI-side suspect, especially for many Battery cells, but by itself it should vanish on the next draw after removal. Battery hover metrics are a separate repeated cost and should be ruled out by moving the pointer. Persistent slowdown after deleting the circuit suggests continuing particles or a more general simulation/rendering bottleneck, but the available evidence cannot identify which one. No tests or performance benchmark were run for this investigation; the user is isolating feature costs in the debug menu.
