# Completed features

Reviewed against the current source on 23 September 2026. “Completed” means
implemented and exposed in the current simulator; it does not imply a perfect
real-world model.

## Materials and motion

The material picker is generated from 53 `particles.json` entries in eight
groups: Powders, Liquids, Gases, Solids, Metals, Machines, Storage and Tools. Materials
have category, density, colour, fall/slide/spread behaviour, lifespan and
optional reaction properties.

- Powders fall and form piles; liquids fall, spread and equalise across
  connected containers; gases rise, drift and spread under ceilings.
- Density determines sinking and floating across categories: sand sinks in
  water, while ice and oil float. Powders deliberately do not sort through
  other powders.
- Heat Ray, Cold Ray and Wind are transient tools, so they do not accumulate
  like ordinary painted material.
- Gunpowder has a fuse and blasts nearby breakable material, while wall, glass
  and ceramic resist blasts.
- Every picker entry has a concise implementation-based description. Hovering
  or focusing a material shows its glossary tooltip with live properties,
  temperatures, conversions and reaction targets; see the current
  [`GAME_MECHANICS.md`](../GAME_MECHANICS.md) for the maintenance contract.

## Temperature, conduction and insulation

Each cell carries a temperature. Every frame it exchanges heat with four
neighbours, cools or warms toward the ambient air, and can receive eight-way
radiation from heat sources. The air temperature is adjustable from -60C to
4000C, eases toward the requested value, has stable cell-to-cell variation and
can be divided into five altitude layers.

- State transitions accumulate latent heat rather than flipping instantly.
- Ice melts to water; water freezes to ice, boils to steam and steam condenses
  as water or snow depending on conditions.
- Fire, lava and rays are strong local heat sources. Fire also clings to fuel
  and radiates, so it can propagate through wood, plants and oil.
- Bulk insulation reduces exchange inside large same-material blocks. Glass,
  stone, ceramic, clay and wood retain heat more strongly than loose material.
- Sand melts to glass; sustained heating can return glass to lava. Lava cools
  to scoria then stone, can be reheated back through that path, and is quenched
  by water into scoria and steam.

## Water, soil, weather and living systems

- Water wets sand, mud and ash; it infiltrates wet powder to a 50-cell limit.
  Deep wet mud compacts into impermeable clay, which fires into ceramic.
- Ash melts into Lava at high heat. Steam, Smoke and Toxic Gas evaporate into
  nothing when their temperature exceeds 3000 C.
- Steam can produce rain or snow. Snow melts in warmth, melts on water and
  gradually packs into ice when it settles on ice.
- Plants sprout only from viable wet ground at suitable temperatures; grass,
  taller plants, flowers, seeds, roots, wet-ash grass and pond lilies each use
  specialised rules. Plants can burn, freeze or be killed by acid fumes.
- A manual Wind tool shifts light materials, leaves fading visual trails and
  mixes warm/cold air layers. Solid barriers shelter wind; plants do not.
- The optional Breeze applies intermittent world-scale gusts using the Wind
  strength setting.

## Chemistry and destructive effects

- Water extinguishes fire on contact.
- Acid corrodes eligible materials but not glass, and creates long-lived toxic
  gas along the corroded face.
- Toxic gas rises, spreads and withers vegetation; it later settles as acid.
  Smoke similarly persists then settles as ash.
- Spark Dust and Spark Block emit less frequent, half-opacity sparks until their
  lifetimes expire; a liquid neighbour suppresses their spark output. Spark
  Block transitions into Dust near the end of its life.

## Electricity and machines

Thermal conductivity and electrical conductivity are separate fields. Copper,
Battery and Iron have distinct electrical behaviour and corresponding molten
forms.

- A Spark adjacent to conductive material is absorbed and sends a visible
  temporary power wave through connected conductive cells and branches.
- Battery is a storage material: Sparks add a fixed total charge shared across
  its connected mass. The interface shows the connected reservoir's charge.
- Copper and Iron connected to charged Battery draw charge by their configured
  grid load and repeatedly energise the reachable non-Battery grid. Their
  wiring can bridge up to two empty cells in a straight grid direction.
- Fan stores one of eight directions and only produces airflow when powered;
  it applies a widening 28-cell cone and leaves decaying residual airflow so
  movement does not stop abruptly at the cone edge.
- Heater and Cooler are directional powered machines with the same eight-way
  placement and 28-cell cone. Each draws 100 load (twice the Fan's 50), stays
  off without power, and drives its cone toward 2000 C or -60 C respectively.
  While powered they launch matching Heat Ray or Cold Ray particles along the
  cone centreline. Machine placement previews the facing icon and cone while
  dragging, but commits the machine and its effects only on mouse-up.
- Tubing is an edge-connected, non-conductive material that moves a storage
  bin's contents to a compatible bin or Vent. Its narrowest painted
  cross-section sets the rate at 10 particles/second per cell.
- Vent is always active and releases stored material below itself. Its
  default-on Release switch can retain one material type up to 100 particles;
  a full switched-off Vent cuts the connected Tubing flow to 0.
- Mixer accepts two independent 500-particle inputs at 5 particles/second each,
  stores up to 1000 output particles, and releases at 8 particles/second.
  Documented recipes become exclusive full-width mixed output; non-mixing
  materials remain separate alternating columns. Its invisible 64px footprint
  accepts tubing anywhere touching the mixer icon.

## Reliability, discovery and project quality

- The physics core accepts an injectable random source. `tools/simTest.mjs`
  runs with a reproducible default seed, accepts `--seed=` or
  `SIM_TEST_SEED`, and includes the seed in failures.
- The migrated Playwright suite under `e2e/` covers the six themes, mouse and
  touch drawing, keyboard focus, material glossary tooltips, canvas mapping,
  machine and Mixer workflows, persistence, blueprints, physics, and
  accessibility. The stand-in smoke test remains useful for fast startup and
  persistence checks.
- Unused audio/debug state was removed, `package-lock.json` matches
  `package.json`, and generated dependencies/test output are excluded by
  `.gitignore`.

## User experience and project quality

- Paint with a brush or deferred line; right-click erase; use Space to pause,
  E for eraser, H for heat view and brackets for brush size.
- The right workspace panel has Tools and Blueprints tabs. Blueprints captures
  a paused rectangular marquee, stores up to 24 numbered previews and stamps a
  selected design over existing material with a half-transparent cursor
  preview. The oldest slot is replaced after the library is full. Right-click
  or choosing another tool/material cancels selection or stamping and resumes
  play.
- Blueprint stamps have a session-only, ten-step history. Undo and Redo are
  available beneath the Blueprint slots and through Ctrl+Z and Ctrl+Shift+Z
  (Cmd on macOS). This temporary history is intentionally not included in
  autosaves or portable game strings.
- Grabber lifts and moves only one material type in an adjustable square, with
  an on-canvas preview and safe cancel/restore.
- Air temperature, thermal layers, wind, breeze, heat view and machine controls
  are available in the UI. Fan, Heater, Cooler and Vent placement ignores brush size
  and can be aimed by dragging.
- Clear is a confirmation-first destructive action: Cancel preserves the active
  world, while Clear World wipes it without directly changing the saved Resume
  Game.
- Six responsive visual themes are remembered with local storage.
- The complete world, environment, tool state and 24-slot Blueprint library
  can be exported as a portable LZString and imported from a pasted string.
  One local Resume Game autosaves every minute; New Game and Import protect an
  existing resume slot with an explicit replace-or-play-without-autosave
  choice, plus Cancel to leave the current world and saved resume unchanged.
- The source is separated into data, headless physics, rendering and UI.
  Automated coverage includes 284/284 headless assertions with default seed
  `0`, a 260x150 speed check, syntax/JSON validation, a passing stand-in-browser
  UI smoke test, and 121 Playwright real-browser tests across all fifteen
  functional areas. The full browser suite passes in both modes with
  `npx playwright test --workers=1 --trace=off` and
  `npx playwright test --headed --workers=1 --trace=off`.
