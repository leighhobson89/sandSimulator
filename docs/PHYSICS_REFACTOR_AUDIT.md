# Physics core size and incremental refactor audit

**Purpose:** source-backed planning for a possible future `physics.js` refactor.
This is an audit, not permission to refactor, rewrite, or change simulation
behavior. The supported world choices are 260×150 and 520×300; do not infer
that the profile's synthetic 1040×600 workload is a playable-world requirement.
Worker, WASM, WebGL, and WebGPU work for sizes beyond the current 520×300 option
remains deferred in [`FUTURE_IDEAS.md`](FUTURE_IDEAS.md).

**Snapshot note:** the line map and terms such as `Vent` and
`tubing-vents.spec.mjs` below describe the older source snapshot audited here.
The current machine name is Sprinkler, with browser coverage in
`e2e/machines/sprinkler.spec.mjs`; recheck all line references before using this
historical map for future refactor work.

## Audit baseline and boundaries

The inspected `physics.js` is 4,691 lines. Line references below describe this
source snapshot and will need to be rechecked immediately before implementation.
The file imports only `assertValidWorldDimensions` from `worldConfig.js`; it has
no DOM dependency and remains usable by both browser code and Node headless
tests. `createWorld()` validates dimensions at line 649 before it writes global
dimensions or allocates the replacement arrays. Its 2,000,000-cell allocation
limit does not define a product-facing size choice.

The main architectural constraint is not file length by itself: nearly every
subsystem reads or mutates the same module-global `world`, `DEFS`, dimensions,
random stream, or frame state. `getWorld()` and `getDefinitions()` expose their
actual mutable objects. Line ranges therefore identify topics, not independent
module boundaries.

## Subsystem and function map

| Lines | Subsystem | Important functions and boundary notes |
|---|---|---|
| 42–142 | Constants, core globals, RNG, environment | `setRandomSource`, `setRandomSeed`, `resetRandomSource` (71–96); fixed atmospheric profile, per-particle air offsets, and `getAirTempAt` (119–140). `random()` is the shared draw boundary. |
| 143–553 | Definition compilation | `prepareDefinitions` (148–512) resolves names, fills defaults, derives `hasStateChange`, `hasReaction`, `moves`, buoyancy and plant/wind metadata; `defaultWindLift`, `parseColor`, `rainbowPalette`, `channelFromHue` (514–550). Also mutates `AMBIENT`, `ambientTarget`, `DEFS`, `nameCache`, and `WET_MUD_PLANT`. |
| 562–701 | Save-state contract and world lifecycle | `PERSISTED_WORLD_FIELDS` (565–575); `captureSimulationState` / `restoreSimulationState` (578–644); `createWorld` (648–701). Restore includes compatibility defaults for older machine/storage/mixer fields and rebuilds `hasMixerMachine`. |
| 705–1014 | Machine and state queries | Default/range helpers (705–717); storage, Vent, Mixer inventory and controls (719–964); electrical queries and connected battery traversal (965–1014). |
| 1016–1207 | Reset and cell mutation | `clearWorld` (1016–1051); `startingData`, indexing and bounds (1053–1092); `setCell`, `transform`, `removeParticle`, `swapCells` (1094–1207). Mutation helpers deliberately reset different field subsets. |
| 1209–1431 | Electrical network and battery state | `energizeConnectedMetal`, neighbor traversal and connected load (1213–1340); charge balancing (1346–1404); `updateElectricalPower` (1406–1431). |
| 1433–1512 | Ordered frame driver | `stepSimulation` (1435–1510) calls environment, thermal, liquid-surface, electric, machine, wind, reaction and movement phases in a behaviorally significant order. |
| 1514–1698 | Thermal transfer | `thermalContactRate`, `diffuseHeat` (1532–1643), `radiateHeat` (1661–1694), `getTemperature` (1696–1698). Diffusion swaps the `temp` and `tempNext` references; radiation mutates temperatures in scan order. |
| 1700–1853 | Temperature-driven transitions and local helpers | `applyStateChange` (1712–1810), ground and neighbor lookup helpers (1817–1853). Includes latent heat, ignition/boiling/melting/freezing, condensation and random placement decisions. |
| 1855–2220 | Reactions, lifetimes, material interactions, plant growth entry | `applyReactions` (1861–2220): electricity, lifetimes, explosions, extinguishing, quenching, soaking, corrosion, contacts, sprouting, growing, and seeds. It calls multiple later helper groups and mutation primitives. |
| 2222–2304 | Plant rooting | `rootedIn` (2255–2304), a bounded graph traversal over connected plant cells with reusable stamp/stack arrays. |
| 2306–2552 | Lily growth and seed-water lookup | `openWaterDepth`, `crowdedBy`, `weaveThroughWater`, `creepAcrossSurface`, and related helpers; relies on `typeAt`, `DEFS`, `world.data`, `transform`, and randomness. |
| 2554–2623 | Explosions and name cache | `explode` (2560–2609), `idOf` (2614–2622). Explosion directly resets arrays and invokes `transform`; `nameCache` is derived from definitions. |
| 2624–2745 | Shared movement rules and storage collision geometry | Density comparisons, virtual storage walls, `storageFunnelMachines` and `storageBarrierMask`, funnel geometry, diagonal collision checks. |
| 2747–2984 | Powder, liquid, and ground movement | `movePowder`, liquid-depth/settling rules, `moveLiquid`, `fallDown`, saturation and compaction. Directly uses `swapCells`, random draw order, `surface`, and virtual intake walls. |
| 2986–3240 | Wind trails, Fan airflow, projectiles, machine intake | Reusable wind scratch (3035–3042), `decayWindTrails` (3055–3068), Fan airflow (3128–3171), projectile movement (3191–3210), machine power checks (3212–3224), storage suction (3234–3267). |
| 3269–3900 | Tubing, storage transfer, Mixer and Vent simulation | Tubing cache/fast-path flag (3273–3274); graph/path/capacity logic (3280–3427); endpoint and Mixer state helpers (3429–3710); transfer flow (3711–3808); Vents (3813–3842); storage funnel refresh (3844–3877); machine ray creation (3879–3900). |
| 3902–4056 | Machine output and Fan/Heater/Cooler effects | `isMachinePoweredAt`, temperature cone, Fan cone/airflow, particle push, and `updateActiveMachines`. Shares wind barriers, RNG, `world.moved`, and projectile state. |
| 4058–4428 | Wind tool and ambient breeze | Gust scratch and shelter computation (4077–4129), `applyWind` (4138–4242), breeze globals/settings and update (4251–4428). `decayWindTrails` is also called by the game loop outside a simulation tick. |
| 4430–4615 | Liquid body surfaces and flow | `takeOneFlowStep`, sideways and pressure movement, gap closure, and `computeLiquidSurfaces`. Surface preparation runs before movement each step. |
| 4617–4691 | Gas movement and fuel lookup | `nextToFuel` and `moveGas`; depends on common movement, random source, type lookup, and shared mutation. |

## Module-global state and cache inventory

| State | Current owner and lifecycle | Refactor concern |
|---|---|---|
| `COLS`, `ROWS`, `world` (55–57) | Current dimensions and one live mutable world object. Set by `createWorld`; getters expose the object and its arrays. | The coordinate/index contract and direct consumers make replacing this with an encapsulated world object a separate compatibility step. |
| `DEFS`, `AMBIENT`, `ambientTarget`, `frameCount` (60–63) | Compiled material definitions, current and target air temperature, and simulation tick. | `prepareDefinitions` and `restoreSimulationState` update these; the step loop consumes them globally. |
| `randomSource`, `randomSeed` (68–69) | Shared RNG function and requested seed metadata; seed installs a stateful closure. | `getRandomSeed()` reports the configured seed, not the closure's current PRNG position. Draw count/order is not serialized. |
| `WET_MUD_PLANT` / `nameCache` (101; 2613–2622) | Definition-derived plant identity and lazily populated material-name lookup. Name cache is cleared after definition preparation. | Must be invalidated/rebuilt with the exact definition generation. |
| `ATMOSPHERE_HALF_RANGE`, `airOffset` (119–140) | Fixed smooth open-air temperature profile, centered on Air Temperature with a `15 C` surface-to-top span, plus a 256-entry shade-to-temperature offset table. | The profile is derived from row and ambient temperature and is not saved as a separate setting; `ATMOSPHERE_HALF_RANGE` and `airOffset` are immutable model data. |
| `rootStack`, `rootStamp`, `rootVisit` (2244–2246) | Reused graph-search work buffers, resized when the world cell count changes; stamp avoids clearing the full visited array per search. | Search limit is 512 cells. Keep buffers private to the same world dimensions and preserve traversal semantics. |
| `storageFunnelMachines`, `storageBarrierMask` (2665–2666) | Derived from live storage-machine cells and orientation by `refreshStorageFunnelMachines`; reset on world creation/clear. | Shared by intake, movement collision, and Fan/wind obstruction. Any split must keep the collision map and visible geometry in sync. |
| `tubingFlows`, `hasMixerMachine` (3273–3274) | `tubingFlows` is a per-update display/transfer summary; `hasMixerMachine` avoids scanning Mixer state when none exist. | The former is exposed to game/UI rendering; the latter is maintained on placement/restore. Both depend on cell mutations and transfers. |
| `rowShelter`, `rowLift`, `gustShelter`, `gustLift`, `windTrailsAlive` (3035–3042, 4077–4085) | Reusable wind-tool/breeze scratch and an alive-count fast path for `world.wind`. | `world.wind` is persisted visual state; scratch buffers and the fast-path counter are not. Rebuild or invalidate after world replacement/restore as needed. |
| `ambientWindOn`, `breeze`, `breezeWait`, `windDial` (4251–4257) | Environment setting plus transient current gust and timing. | `ambientWindOn` and `windDial` are included in captured simulation settings; `breeze` phase and `breezeWait` are not. Restore calls `setAmbientWindOn`: disabling cancels an active breeze; enabling schedules a random initial wait only when no breeze is active, so an existing breeze can survive restore. |

Immutable constants and lookup tables also belong to the module today: bounds and
sentinels (43–48), electrical/tubing neighbor offsets (49–53, 576), world and
machine capacities/rates (719–744), heat/movement coefficients (1529 onward,
2836 onward), and wind/Fan coefficients (2998 onward, 3118 onward). These should
move only with the rules that own them, not into a generic shared constants bag.

## Direct dependency and coupling map

```text
particles.json ──> game.js / headless tools ──> prepareDefinitions() ──> DEFS
worldConfig.js ──────────────────────────────> physics.js
constantsAndGlobalVars.js ──> game.js ───────> physics.js API
ui.js ──> game.js and physics.js API
saveLoadGame.js ──> physics capture/restore and game blueprint schema
e2eHooks.js ──> physics state/step API and game rendering
tools/simTest.mjs, scaleProfile.mjs, tuning scripts ──> physics API
Playwright E2E specs ──> game/UI plus direct physics fixtures and inspections
```

| Consumer | Observed dependency | Coupling / migration consequence |
|---|---|---|
| `game.js` (imports at 20–25) | World lifecycle, definitions, frame stepping, cell placement, temperatures, wind, power/battery queries, tubing flow, and `getWorld()`/`getDefinitions()`. It also directly reads and mutates world fields for rendering, machine direction/placement, and tool behavior (for example lines 282–296, 764–876, 889–920). | This is the tightest production boundary. Extracting internals can leave the public API stable, but changing raw world access requires coordinated renderer and tool changes. |
| `ui.js` (imports at 28–35) | Environment controls, machine and inventory queries/mutations, world/definition reads, and tubing data. | User-facing machine UI depends on physics-level queries, but UI itself is not imported by physics. |
| `saveLoadGame.js` (line 9) | `captureSimulationState` and `restoreSimulationState`; also imports `BLUEPRINT_FIELDS` from `game.js`. | Physics owns simulation persistence, while the save codec owns serialization and tool settings. Avoid moving save-format ownership into a behavior module. |
| `e2eHooks.js` (lines 1–6) | Capture/restore, world/definition reads, frame and seed access, stepping, indexing; calls game rendering after mutation. | Tests receive copied snapshots, but the hook and specs also have direct module access. Keep deterministic step and snapshot contracts stable. |
| `tools/simTest.mjs` (lines 12–24) | Direct headless imports covering definition prep, arrays, random seed, stepping, wind, electrical, storage, tubing, and Mixer APIs. | Existing large regression suite is broad behavioral coverage but its direct imports make API changes visible. |
| Scale/allocation/tuning tools | `scaleProfile.mjs`, `worldAllocationTest.mjs`, `scaleProfileTest.mjs`, `tuneWater.mjs`, `tuneIce.mjs`, and `tuneFire.mjs` use the same public physics boundary. | Keep benchmark-only synthetic sizes distinct from product defaults; profiling is not an equivalence oracle. |
| Browser specs | `e2e/physics/` and `e2e/machines/` use deterministic fixtures and often dynamically import `/physics.js`; material, persistence, and scaling specs inspect physics state too. | A module split affects browser URL imports and may affect test setup even if visual controls appear unchanged. |

`physics.js` currently imports no application module, so the dependency graph is
one-way. Preserve that property: importing `game.js`, `ui.js`, or persistence
code back into a physics subsystem would create cycles or reverse the headless
boundary.

## Contracts to preserve

### World layout and mutation

- The flat cell index is `y * COLS + x` (`index` at 1071); arrays have exactly
  `cols * rows` entries. `inBounds` is the coordinate guard. Out-of-bounds and
  storage virtual walls have separate sentinel values.
- `createWorld()` constructs the typed-array layout at lines 648–701 and now
  validates dimensions before any global dimension mutation or allocation. It
  fills temperature from current ambient and shades from the active RNG. The
  scale guard is not authorization to expand beyond the supported 260×150 and
  520×300 playable worlds.
- Preserve each typed-array constructor, initialization behavior, and field
  reset semantics. `setCell`, `transform`, and `removeParticle` reset different
  subsets. `swapCells` transfers particle-associated values and marks both cells
  moved; airflow and wind-trail fields are spatial fields, not ordinary cell
  payload. Do not replace these helpers with a generic “reset all fields” rule
  without characterization tests.
- `clearWorld()` explicitly clears simulation and machine data but does not
  directly clear `moved`, `surface`, or `tempNext`; `stepSimulation()` resets or
  recomputes frame-derived state before it is consumed. Preserve observable
  clear-while-paused and next-step behavior.

### Persistent, derived, and transient state

`PERSISTED_WORLD_FIELDS` at 565–575 is the authoritative physics snapshot array
list. It includes `type`, `temp`, `life`, `lifeMax`, `residue`, `shade`, `heat`,
`data`, `machineSetting`; storage type/count/flow remainder; all Mixer input and
output type/count/flow/mixed/turn fields; `power`, `powerDelay`, `charge`,
`wind`, and `airflowX`, `airflowY`, `airflowNextX`, `airflowNextY`. Preserve each
array's typed-array type and length. `createWorld()` has the full field layout
at 653–692.

`tempNext` and `moved` are frame-work buffers and are not serialized.
`surface` (computed by `computeLiquidSurfaces` at 4556–4615) is derived and is
also omitted from simulation saves. It is included in `game.js`'s separate
`BLUEPRINT_FIELDS` list (51–61), so blueprint behavior is a distinct contract.
Other caches/scratch buffers in the inventory above are derived or transient,
not saved world arrays.

`captureSimulationState()` includes `cols`, `rows`, ambient/target, humidity and
dewpoint targets, ambient-wind enablement, wind settings, frame count, and the
persisted arrays. The natural atmospheric profile is derived from the ambient
temperature and row, so it is not saved as a setting. Restore ignores legacy
version-1 `layerLapse` and `airLayersOn` fields and uses the natural profile
without a save-version bump. Capture returns references to the live typed
arrays rather than copies; `saveLoadGame.js` encodes them, while `e2eHooks.js`
explicitly copies them for test snapshots. Preserve or deliberately version this aliasing contract
before changing it. `restoreSimulationState()` validates shape, creates fresh
arrays, copies persisted fields, applies backward-compatible machine-setting
and storage/Mixer defaults, rebuilds `hasMixerMachine`, and restores environment
settings. Its call to `setAmbientWindOn(true)` can consume a random value when
there is no active breeze, and restore does not rewind the shared RNG. RNG
seed/PRNG progress, current breeze position, root traversal stamps, and display
flow summaries are not part of this save state. Tests that require replay
reseed explicitly; a saved world alone is not an RNG rewind point.

The v1 save stores the selected world dimensions through `simulation.cols` and
`simulation.rows`. Resume and Load therefore restore either supported size;
camera zoom and scroll position remain transient view state.

### Tick ordering and determinism

The order in `stepSimulation()` (1435–1510) is an invariant: increment frame and
ease ambient; diffuse then radiate heat; compute liquid surfaces; clear `moved`;
refresh storage geometry; update electricity and Fan air; update active
machines, particle airflow, storage bins, Vents, Tubing, and Mixers; run the
second non-accruing Vent release pass; apply ambient breeze; then scan particles
bottom-to-top. The left/right order alternates from `(frameCount + y) & 1`.
`moved` prevents an already-processed or already-shifted particle acting twice.

Preserve this phase sequence, scan direction, and early-return meaning in each
reaction/movement branch. The temperature-transfer pass uses a separate buffer;
radiation, effects, and many reactions update arrays in place. Reordering these
passes changes which values later work sees even if each extracted function is
individually equivalent.

All probabilistic behavior shares `random()` (96). Seeded runs must preserve the
number and order of random draws, including draws used for orientation,
neighbor choice, chance checks, life/shade initialization, breeze timing,
growth, reactions, and movement. Do not move chance checks earlier or evaluate
them for new cells merely as a refactoring convenience. `getRandomSeed()` is
seed metadata, not the internal PRNG continuation state.

The module must remain headless and free of UI/rendering imports. Game-visible
contracts include getters and setters for ambient, humidity, dewpoint, and wind
controls, plus `getAirTempAt()` for the natural altitude profile, machine state,
inventory and flow overlays, wind trails, temperature, power, and frame count.
`getWorld()` and `getDefinitions()` expose mutable references today;
encapsulation is a separate migration, not an incidental refactor benefit.

## Prioritized incremental extraction seams

Each stage is a future implementation step, not part of this audit. Keep public
exports stable initially and pass one explicit state/context object containing
the same world arrays, dimensions, definitions, and narrowly required callbacks
where a module needs shared mutation. Do not create a second copy of world state
or let an extracted module import its caller.

| Priority / seam | Scope and expected boundary | Stop/go criteria |
|---|---|---|
| 0 — Characterize before moving code | Record seeded snapshots and existing invariants for the target subsystem; map every caller and every read/write to shared arrays. No source extraction yet. | **Go** only when each proposed slice has named behavioral tests and a rollback-sized diff. **Stop** if behavior is only described by timing or screenshots without state assertions. |
| 1 — Pure definition helpers | Start with helpers such as `parseColor`, `rainbowPalette`/`channelFromHue`, and default category-property helpers (514–550, plus `defaultBulkInsulation` at 1152–1157). Consider a later definition-compilation boundary only after isolating pure property normalization from `prepareDefinitions`. | **Go** if prepared definitions for every `particles.json` ID are deeply equal, missing glossary descriptions still fail identically, and derived flags/plant lookup remain exact. **Stop** if extraction moves ambient/definition/cache mutation or changes name-to-ID defaults, iteration order, or random draws. |
| 2 — World schema and state codec | First centralize a declarative typed-array schema corresponding exactly to `createWorld` and `PERSISTED_WORLD_FIELDS`; then separately consider moving world creation/capture/restore. Keep world ownership and save codec direction one-way. | **Go** if constructors, field names/order, zero/default initialization, all save fields, blueprint distinction, legacy defaults, array alias behavior, and round-trips match; invalid dimensions preserve prior globals and world identity. **Stop** on any changed save compatibility, buffer type, alias, or partial mutation. |
| 3 — Electrical subsystem | Move the connected-conductor traversal, pulse scheduling, battery charge balancing/consumption, and electrical update as one coherent seam (1213–1431), then migrate query helpers only if their caller map remains clear. | **Go** if seeded Spark/wire/Battery traces match every frame for `power`, `powerDelay`, `charge`, material types and frame count, and electrical browser tests pass. **Stop** if phase placement changes or traversal/RNG semantics need alteration. |
| 4 — Thermal transfer | Extract conduction and radiation as a phase pair first (1514–1694), leaving `applyStateChange`/`transform` in the core until a separate reaction boundary is designed. Preserve buffer swapping and in-place radiation order. | **Go** if exact seeded temperature arrays match after each tick for conduction, insulation, radiation, the fixed continuous `15 C` atmospheric profile, heat sources, and rays; phase transitions and total frame state remain unchanged. **Stop** if the extracted function requires an implicit reordered phase or changes boundary treatment. |
| 5 — State changes and reactions | Consider temperature-driven transitions (1712–1823) separately from interaction reactions (1861–2220), but keep common mutation helpers in a shared core. Plant traversal/growth and explosion helpers are sub-seams, not independent domain modules yet. | **Go** only with focused traces for latent thresholds, conversion outputs, lifetime/residue, quenching, water infiltration, acid, plants/lilies, seeds, and explosions, including exact RNG reseeding. **Stop** if a split duplicates `transform`, `idOf`, or world mutation ownership. |
| 6 — Movement and liquid surface | Keep `computeLiquidSurfaces` (4556–4615) and pressure/flow (4436–4545, 2885–2944) together initially; powder/gas movement and shared collision rules are dependent sub-seams. Preserve virtual-wall geometry. | **Go** if exact frame snapshots, mass counts, density ordering, liquid surface/pressure, edge clipping and intake barriers match. **Stop** if helper boundaries require circular calls between liquid, generic movement, storage, or reactions. |
| 7 — Machines, storage, tubing, and wind | Defer until earlier state/mutation boundaries exist. This is the broadest cross-cut: storage geometry affects collision, Fan wind, suction and renderer overlays; tubing transfers into storage/Vent/Mixer; machine work shares electricity and projectile/wind fields. | **Go** one machine family at a time only after state schema and movement ownership are stable and UI query/output contracts are covered. **Stop** rather than split interdependent arrays into duplicate caches or move rendering dependencies into physics. |

No stage prescribes a class hierarchy, complete ECS rewrite, Worker protocol,
or GPU/WASM architecture. After each accepted stage, retain the old public API
as an adapter until all direct consumers have migrated and the focused tests
pass. Revert that stage if equivalence fails; do not compensate by weakening
assertions or changing expected behavior under the guise of extraction.

## Behavior risks and containment

| Risk | Why extraction can change behavior | Containment |
|---|---|---|
| Tick-phase or scan-order drift | `stepSimulation` mixes thermal, machine, wind, transfer and movement stages; bottom-up and alternating lateral scans prevent duplicate movement and directional bias. | Keep orchestration in the existing entry point at first; move one call target at a time and compare complete snapshots per tick. |
| RNG stream drift | Every subsystem draws from one seeded function; a moved branch or loop can consume a different number of values. | Seed explicitly, compare reproducible arrays and material outcomes, and audit every moved draw site. Do not claim a save captures PRNG progress. |
| Shared arrays and stale references | `getWorld()` exposes the world object, and `diffuseHeat()` swaps `world.temp`/`tempNext` references. Callers can cache an old field reference. | Preserve the same world object/API until all known readers are migrated; test held object and field references where the contract matters. |
| Reset/transform/swap asymmetry | These functions reset or move different array subsets, including machine, Mixer, electrical and movement metadata. | Characterize per-helper field effects before consolidating; keep shared helpers in one owner during extraction. |
| Save and blueprint schema drift | Simulation saves use `PERSISTED_WORLD_FIELDS`; blueprints have their own field list including `surface`; restore has backward defaults. | Test save and blueprint schemas independently, include old-shape fixtures, and avoid field-list deduplication until type/ownership parity is proven. |
| Cache lifetime / stale-derived data | Plant, storage, tubing, Mixer, and wind fast-path state is outside serialized arrays. | Define invalidation/rebuild on create, clear, restore, and cell mutation; assert overlays and first post-restore tick. |
| Cyclic imports or browser leakage | Physics must stay independent of UI/game modules to run headlessly. | Keep dependencies flowing from callers into physics APIs/context; add Node import and test commands to each extraction's verification. |
| Performance regression or allocation churn | Helpers can accidentally allocate per-cell/per-frame; scale results are workload-specific. | Compare existing 260×150 assertion and use `profile:scale` as diagnostic evidence only; do not use timing as behavioral equivalence. |

Rollback is stage-local: keep the public facade and unrelated rules untouched,
revert the last extraction as a unit if any focused state or persistence
contract fails, and do not combine behavior changes with module movement.

## Focused headless verification strategy

The existing verification surface is complementary:

- `npm test` runs `tools/simTest.mjs`, the seeded headless behavior suite (284
  assertions in the recorded baseline, with default seed `0` and the existing
  260×150 performance assertion). Use it after any simulation-core extraction.
- `npm run test:smoke` exercises real `game.js` and `ui.js` against a browser
  stand-in for startup and integration wiring.
- `npm run test:scale-profile` runs the profile math/CLI tests and world
  allocation tests, including rejection before replacement of a valid world.
- Focused Playwright specs are headless by default: `e2e/physics/determinism.spec.mjs`,
  `thermal.spec.mjs`, `settling.spec.mjs`, and `reactions.spec.mjs`; machine
  behavior is split among `electrical.spec.mjs`, `powered.spec.mjs`,
  `storage.spec.mjs`, `tubing-vents.spec.mjs`, `mixer.spec.mjs`, placement and
  persistence specs; `e2e/persistence/` guards saves/loads; and
  `e2e/scaling/default-world.spec.mjs` protects the fixed 260×150 and 520×300
  chooser options and large-choice canvas threshold. Select only the affected
  areas for each stage.
- `npm run profile:scale` covers a fixed physics-only synthetic matrix
  (260×150, 520×300, 1040×600). It excludes canvas rendering and SVG overlays;
  memory is estimated. The 520×300 measurement of 27.535 ms average and
  37.675 ms p95 is machine-specific diagnostic evidence, not a 60-fps guarantee.
  Treat profiles as neither equivalence tests nor product support for the
  synthetic 1040×600 case.

For each extraction, set the seed and fixtures explicitly, compare frame count
and all relevant persisted arrays after every fixed tick, and include transient
state when the extracted phase owns it (`moved`, `surface`, power delay, or
airflow buffers). Where the browser contract includes output, run the owning
headless Playwright functional areas with `--workers=1 --trace=off`; default
configuration is headless. Headed runs are optional visual/input diagnostics,
never acceptance requirements. A full suite requires user approval under
project policy. Do not treat a passing profile or discovery list as a full-suite
pass.
