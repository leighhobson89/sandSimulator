# 1040×600 world scaling and physics refactor audit

## Goal and scope

Support an opt-in **1040×600** simulation world while retaining the current
workspace-fit New Game default, the v1 save format, and existing deterministic
physics rules. The requested dimensions are **624,000 cells**, not one million;
profile a separate 1,000,000-cell case as a capacity reference. The existing
2,000,000-cell save/import ceiling remains the hard product cap in this tranche.

This is a staged capability, not a 60-fps promise for 624,000 or 1,000,000
cells. The core's 8 ms assertion is currently measured at 260×150 (39,000 cells).
The large-world work will preserve that baseline, add bounded allocation and
viewport rendering improvements, and record large-world measurements. Physics
still has whole-world passes; if measurements exceed a usable frame budget,
reaching higher simulation throughput is a follow-up investment after the audit.

Do not move simulation to a Worker, rewrite it in WASM, add WebGL/WebGPU, alter
physics rules/order, add sparse/chunked simulation, raise the 2M import ceiling,
or migrate autosaves to IndexedDB in this tranche. A Worker would not by itself
reduce simulation cost, and `getWorld()` plus direct UI/game state access make
ownership transfer a compatibility project. Keep the large-world option
explicitly opt-in and do not label it as meeting 60 fps.

## Findings that constrain the change

- `constantsAndGlobalVars.js` starts at 200×150. `game.js::fitGridToWorkspace()`
  chooses columns from available width and current rows on the first new game;
  zoom is a view preference, not world dimensions. A selected 1040×600 world
  must bypass workspace fitting, while the existing default continues to fit.
- `game.js::fitCanvasToScreen()` never scales a cell below one CSS pixel. The
  canvas and `ImageData` are world-sized. At zoom level 1, `#canvasArea` hides
  overflow; current scrollbars, arrow-key scrolling, and optional edge pan are
  enabled only above zoom 1 (`styles.css`, `ui.js`). A larger natural-size world
  therefore needs scrollability at level 1 as well as at zoomed levels.
- `cellFromEvent()` and the Playwright canvas helper map against the rendered
  canvas rectangle. Keep that mapping model; scrolling and zoom must not change
  the world cell represented by a pointer coordinate.
- `physics.js::createWorld()` allocates 37 typed-array planes totaling about
  **85 bytes/cell**. The renderer also holds about 4 bytes/cell in `ImageData`
  and the canvas backing store (about 8 bytes/cell combined). Approximate
  steady-state lower bounds are therefore ~58 MB decimal (55 MiB) at 624k,
  ~93 MB (89 MiB) at 1M, and ~186 MB (177 MiB) at 2M, before temporary arrays,
  browser overhead, SVG/DOM, save serialization, or GC. Persisted planes alone
  are about 78 bytes/cell; base64 staging can add roughly one third before
  compression, so large exports/imports can have much higher peaks.
- `saveLoadGame.js` accepts up to 2M cells and save v1 already serializes world
  dimensions. `restoreSimulationState()` recreates typed arrays and copies the
  save planes. Do not change the save version or reject currently valid
  1–2M-cell saves as part of adding the 624k preset. Local storage can reject a
  large autosave; preserve the live world and any previous resume save on
  failure, and communicate that autosave did not complete.
- `stepSimulation()` has whole-grid work in heat, liquid-surface, moved-flag,
  electrical, airflow, machine and particle passes. `drawWorld()` scans all
  cells, and `drawMachineOverlays()` also scans all cells and rebuilds SVG each
  frame. At 624k cells there are 16× as many cells as the existing 260×150
  benchmark; 1M is ~25.6×. Do not infer that either target meets the existing
  8 ms budget from the smaller grid.
- Blueprint capture/save can copy or encode many per-cell planes too. Keep its
  current behavior and format, but include large selection/save cost in the
  risk notes; do not make a full-world blueprint a performance acceptance gate.

## Implementation tasks

1. **Lock regression coverage before source changes.** The test-engineer adds
   focused failing tests for selecting 1040×600, keeping the normal default,
   base-level and zoomed scrolling/panning, pointer mapping and painting at both
   distant corners, resize, and persistence restoration of dimensions. Add
   invalid-allocation and failed-autosave safety cases without allocating a
   2M-cell fixture.
2. **Establish the profile baseline before optimization.** Add a repeatable
   scale benchmark for 260×150, 1040×600 (624k), and 1000×1000 (1M), each with
   sparse and representative dense fixtures. The Node benchmark reports
   warm-up plus per-step average, p50, and p95 for physics; the focused browser
   spec reports synchronous render/overlay cost separately. Keep the current
   `<8 ms` 260×150 assertion. Record larger results; do not impose an unmeasured
   machine-specific 60-fps threshold.
3. **Centralize dimension validation and allocation limits.** Add a shared
   world-configuration module for the 1040×600 preset, positive integer
   dimensions, and the unchanged 2M total-cell cap. Validate before typed-array
   allocation in `createWorld()` and before save restoration. Reject invalid
   input with a useful message without changing the live world. Check that the
   canvas accepted its requested intrinsic width/height and fail gracefully if
   browser allocation fails. Do not introduce a new axis cap or lower the
   existing import ceiling without separate compatibility evidence.
4. **Expose a large-world choice without changing the default.** Add an
   accessible world-size selector in the New Game menu with the existing
   workspace-fit option selected by default and a named 1040×600 option. Pass
   explicit dimensions into new-world initialization so `fitGridToWorkspace()`
   cannot overwrite the large choice. Resume/import retain saved dimensions via
   the existing preserve-world-size path; viewport resize must not recreate or
   resize the simulation world.
5. **Make large canvases navigable at natural scale.** Enable scroll overflow
   whenever the natural-size canvas exceeds the viewport, including zoom level
   1; keep current fit behavior for worlds that fit. Enable keyboard and
   optional edge-pan navigation whenever there is actual scroll extent, while
   retaining focused-control behavior, wheel-zoom semantics, zoom anchoring,
   and scroll clamping. Keep canvas and overlay stage dimensions aligned.
6. **Bound rendering work to the visible world rectangle.** Compute visible
   cell bounds from canvas/viewport rectangles and scroll offsets; write and
   `putImageData` only that dirty rectangle. Cull machine icons/cones and tubing
   overlay work outside the same bounds. Offscreen simulation state remains
   fully live; when scrolled into view it must render current state. Do not
   change physics traversal or suspend offscreen simulation. Keep the existing
   one-pixel-per-cell backing canvas and pixelated display.
7. **Keep persistence safe and compatible.** Preserve v1 field mappings and
   support export/import and resume of a sparse 1040×600 world. Make autosave
   replacement atomic: serialize/write the new value before replacing the old
   resume entry, and report quota/serialization failure without corrupting the
   live game or prior save. Do not promise autosave for every dense 1M/2M world;
   test quota failure explicitly. No save schema or blueprint format change.
8. **Document the result and archive only completed roadmap work.** Update the
   current overview and E2E guide with dimensions, natural-scale scrolling,
   memory caveat, profile command, and coverage. Split the roadmap's completed
   profiling/large-canvas tranche from deferred architecture proposals. Archive
   only the completed item and measured result, not a claim that Worker/WASM/GPU
   work shipped. Add the archive entry to its index. Create the separate
   physics refactor audit below; it is a design document only, not extraction.

## Exact planned files

### Runtime, tests, and current documentation

- Add `worldConfig.js` — shared preset and world-size/cell-budget validation.
- Update `index.html` — accessible New Game world-size selector.
- Update `ui.js` — selected dimensions, dimension-preserving imports/resume,
  scrolling eligibility, and visible autosave failure state.
- Update `constantsAndGlobalVars.js` — retain current default and route setters
  through shared validated dimensions where appropriate.
- Update `game.js` — selected-world initialization, intrinsic-canvas allocation
  checks, natural-size scroll state, visible-bounds renderer and overlay culling.
- Update `physics.js` — validate `createWorld()` before allocation only; no
  physics rule or step-order changes.
- Update `saveLoadGame.js` — use shared cell limit, preserve v1 compatibility,
  and make replacement autosave failure-safe.
- Update `styles.css` — scrollable natural-size large-world viewport.
- Update `package.json`; add `tools/scaleBenchmark.mjs` — repeatable Node physics
  benchmark command with the documented cell fixtures and timing output.
- Add `e2e/scaling/large-world.spec.mjs` — size selection, boundary interaction,
  pan/zoom/resize, visible rendering regression, and browser render/overlay
  timing report.
- Update `tools/simTest.mjs` — retain the existing 260×150 `<8 ms` assertion and
  add a no-allocation test for invalid dimensions.
- Update `e2e/persistence/export-import.spec.mjs` and
  `e2e/persistence/validation.spec.mjs` — large-world v1 round-trip, validation,
  and failed replacement safety.
- Update `docs/PROGRAM_OVERVIEW.md` and `docs/E2E_TEST_PLAN.md` — current
  scaling/persistence behavior and focused verification guidance.

### Audit and archive documentation

- Add `docs/PHYSICS_REFACTOR_AUDIT.md` and index it in `docs/README.md`.
- Update `docs/FUTURE_IDEAS.md` — remove/split the completed baseline and
  1040×600 tranche; retain Worker/WASM/GPU as conditional future work, with the
  measured bottleneck as the decision input. Keep the unrelated material
  validator proposal active.
- Add `docs/archive/LARGE_CANVAS_SCALING-2026-09-23.md` with the completed
  roadmap excerpt, exact 624k/1M profile results, what shipped, and explicit
  deferred work; link it from `docs/archive/README.md`. Do not fabricate results
  during planning.
- After implementation, archive this executed plan under
  `docs/archive/plans/large-canvas-scaling-physics-audit-2026-09-23.md` and add
  it to `docs/archive/README.md`, per `AGENTS.md`.
- No `docs/GAME_MECHANICS.md` change is needed unless implementation changes
  mixer behavior (out of scope).

## Physics refactor audit document outline

`docs/PHYSICS_REFACTOR_AUDIT.md` must map the current module without changing
it, using current `physics.js` line ranges as landmarks (line numbers should be
refreshed when the audit is written):

1. **Module inventory and cohesive boundaries:** definitions/environment and
   serialization/world allocation (146–731); machine inventory/world APIs
   (702–1013); cell mutation/electrical state and tick orchestration
   (1013–1509); thermal diffusion/radiation and phase changes (1511–1851);
   reactions, ecology, rooting, and blasts (1852–2620); collision/movement,
   liquid flow, and storage barriers (2621–2982); wind/fan/ambient airflow
   (2983–3139 and 4037–4425); powered machines, storage, tubing, vents, and
   mixers (3115–4058); liquid surface propagation and gas movement
   (4431–4688). Note deliberate cross-boundaries rather than pretending these
   regions are already independent.
2. **Dependency and global-state hotspots:** singleton `world`, `COLS`, `ROWS`,
   `DEFS`, ambient settings, frame count and random source; derived IDs and
   name cache; root-search stamps; storage barrier mask/funnel list; tubing
   paths/flow state; breeze and wind scratch buffers; mixer fast-path flag;
   direct typed-array access through `getWorld()` by game, UI, save/load, and
   test hooks. Map cell helpers (`setCell`, `transform`, `removeParticle`,
   `swapCells`) as cross-plane mutation choke points.
3. **Behavior contracts and risks:** exact `stepSimulation()` phase order;
   alternating row scan and movement-once flags; RNG call order and seeded
   replay; temperature/state/reaction/movement contracts; world edges and
   storage virtual walls; machine/tubing inventories; which planes persist,
   which are transient, and derived-state rebuilding; no DOM dependency;
   v1 save and direct synchronous API assumptions. Identify save field/type
   duplication with `saveLoadGame.js` and blueprint field lists in `game.js`.
4. **Incremental extraction proposal (future task only):** first freeze
   full-state deterministic snapshots and define a simulation context/world
   lifecycle API; then extract cohesive domains behind explicit context/helper
   dependencies in small behavior-preserving commits (definitions/world,
   thermal/phase, reactions/ecology, movement/liquid surfaces, electricity,
   wind/airflow, machines/networks, orchestrator/persistence boundary). Do not
   prescribe or perform an all-at-once rewrite. Record a dependency graph and
   decide module interface before moves.
5. **Verification plan:** keep `npm test` and the current 260×150 performance
   assertion; add full typed-array semantic snapshot comparisons at fixed seed
   and frame boundaries before/after each extraction; target existing thermal,
   settling, reactions, determinism, electrical, machine, wind, tubing,
   persistence, and viewport E2E specs; profile only after correctness. Full
   Playwright suite requires user approval before execution under `AGENTS.md`.

## Acceptance criteria

- The current default New Game dimensions and first-entry workspace-fit behavior
  remain unchanged; the opt-in selection creates exactly 1040×600 (624,000
  cells) without fitting it back down.
- The 1040×600 world is reachable at zoom 1 with scrollbars; wheel zoom,
  anchored zoom, keyboard/edge pan, resize, and canvas cell mapping continue to
  work. Painting/erasing at (0,0) and (1039,599) changes the intended cells;
  a scrolled offscreen cell is current when brought into view.
- Import/resume retain world dimensions, save v1 remains compatible, and invalid
  dimensions over 2M cells are rejected before world allocation or live-world
  mutation. The new 1040×600 preset and the existing 2M import ceiling are not
  conflated.
- Large-world portable save/import restores dimensions and representative cell
  state. A simulated storage quota failure leaves the active world and prior
  autosave intact and exposes a nonfatal failure message.
- Allocation estimate in code comments/audit matches typed-array byte counts;
  tests never allocate a 2M-cell world merely to test rejection. Browser canvas
  allocation failure is handled without an uncaught UI exception.
- `drawWorld()` and machine overlays use visible bounds, but offscreen world
  simulation remains active and physics behavior/order is unchanged.
- `node tools/simTest.mjs` retains the 260×150 average step time `<8 ms` on the
  existing benchmark path. The Node scale benchmark emits reproducible average,
  p50, and p95 for 624k and 1M sparse/dense physics runs, and the focused browser
  spec separately reports render/overlay cost. Record both results in the dated
  archive without asserting 60 fps at large sizes. If large-world physics
  exceeds 16.7 ms/step, document that limitation and leave performance
  throughput as the next measured project after the physics audit; do not add
  an unapproved Worker/WASM/GPU path.
- Physics audit is a separate indexed document and makes no source-level
  extraction or behavior changes. Only completed scaling/profile work is moved
  from the roadmap into dated archive; deferred Worker/WASM/GPU and material
  validation ideas remain active future work.

## Risks and explicit non-goals

- Whole-world physics passes dominate at large dimensions; viewport culling
  reduces draw/overlay cost, not simulation complexity. The 1040×600 choice can
  be slower than the existing world and is explicitly opt-in. A 1M-cell world
  approaches ~93 MB steady-state before transient arrays; 2M save/load or full
  blueprint operations can require several times their steady-state memory.
- Large save strings may exceed browser local-storage quota or create large
  temporary strings. Failure must be recoverable; IndexedDB/binary streaming is
  deferred. Do not promise autosave for arbitrary dense 1M/2M worlds.
- CSS layout and browser canvas backing limits vary. Target dimensions are
  modest, but imports with extreme aspect ratios can satisfy the existing cell
  product cap and still fail a canvas axis allocation; handle this safely and
  document any dimension that cannot be displayed without silently changing
  existing accepted saves.
- No physics scheduling/delta-time change, offscreen freezing, chunking,
  algorithmic rule optimization, persistence schema migration, or gameplay
  behavior change.

## Focused headless verification commands (run only during implementation)

```text
npm test
npm run test:smoke
npm run benchmark:scale
npx playwright test e2e/scaling/large-world.spec.mjs e2e/tools/zoom.spec.mjs e2e/persistence/export-import.spec.mjs e2e/persistence/validation.spec.mjs --workers=1 --trace=off
```

The Playwright command covers three functional areas (scaling, tools/viewport,
and persistence) with default headless Chromium. Do not run the full Playwright
suite without user approval. No tests or benchmarks were run while preparing
this plan.

## Handoff sequence

Follow `AGENTS.md`: architect plan (this file) → test-engineer writes focused
failing tests → frontend-specialist implements the bounded scale work → run
focused checks and iterate → docs-specialist updates current docs, roadmap, and
dated archives. The physics refactor audit is an implementation deliverable for
the next physics task; source extraction remains explicitly out of scope here.
