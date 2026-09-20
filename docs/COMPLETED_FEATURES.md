# Completed features

Reviewed against the current source on 20 September 2026. “Completed” means
implemented and exposed in the current simulator; it does not imply a perfect
real-world model.

## Materials and motion

The material picker is generated from 45 `particles.json` entries in seven
groups: Powders, Liquids, Gases, Solids, Metals, Machines and Tools. Materials
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
  temperatures, conversions and reaction targets; see
  [`MATERIAL_GLOSSARY.md`](MATERIAL_GLOSSARY.md) for the maintenance contract.

## Temperature, conduction and insulation

Each cell carries a temperature. Every frame it exchanges heat with four
neighbours, cools or warms toward the ambient air, and can receive eight-way
radiation from heat sources. The air temperature is adjustable from -60C to
2000C, eases toward the requested value, has stable cell-to-cell variation and
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
- Spark Dust and Spark Block emit sparks until their lifetimes expire; a liquid
  neighbour suppresses their spark output. Spark Block transitions into Dust
  near the end of its life.

## Electricity and machines

Thermal conductivity and electrical conductivity are separate fields. Copper,
Aluminum and Iron have distinct electrical behaviour and corresponding molten
forms.

- A Spark adjacent to conductive material is absorbed and sends a visible
  temporary power wave through connected conductive cells and branches.
- Aluminum is a storage material: Sparks add a fixed total charge shared across
  its connected mass. The interface shows the connected reservoir's charge.
- Copper and Iron connected to charged Aluminum draw charge by their configured
  grid load and repeatedly energise the reachable non-Aluminum grid. Their
  wiring can bridge up to two empty cells in a straight grid direction.
- Fan is the first powered machine. It stores one of eight directions, only
  produces airflow when powered, applies a widening 28-cell cone, and leaves
  decaying residual airflow so movement does not stop abruptly at the cone edge.

## Reliability, discovery and project quality

- The physics core accepts an injectable random source. `tools/simTest.mjs`
  runs with a reproducible default seed, accepts `--seed=` or
  `SIM_TEST_SEED`, and includes the seed in failures.
- `tests/browser.spec.mjs` covers the six themes, mouse and touch drawing,
  keyboard focus, material glossary tooltips and narrow layouts. The stand-in
  smoke test remains useful for fast startup and persistence checks.
- Unused audio/debug state was removed, `package-lock.json` matches
  `package.json`, and generated dependencies/test output are excluded by
  `.gitignore`.

## User experience and project quality

- Paint with a brush or deferred line; right-click erase; use Space to pause,
  E for eraser, H for heat view and brackets for brush size.
- Grabber lifts and moves only one material type in an adjustable square, with
  an on-canvas preview and safe cancel/restore.
- Air temperature, thermal layers, wind, breeze, heat view and brush/fan
  controls are available in the UI. Fan placement ignores brush size and can be
  aimed by dragging.
- Six responsive visual themes are remembered with local storage.
- The complete world, environment and tool state can be exported as a portable
  LZString and imported from a pasted string. One local Resume Game autosaves
  every minute; New Game and Import protect an existing resume slot with an
  explicit replace-or-play-without-autosave choice, plus Cancel to leave the
  current world and saved resume unchanged.
- The source is separated into data, headless physics, rendering and UI.
  Automated coverage includes 244 seeded physics assertions, a 260x150 speed
  check, syntax/JSON validation, a stand-in-browser UI smoke test and a
  Playwright real-browser suite for themes, pointer/touch input, focus and
  narrow layouts.
