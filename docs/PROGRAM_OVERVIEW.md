# Elemental Foundry: program overview

Reviewed: 24 September 2026

Elemental Foundry is a browser-based **falling-sand / cellular-automata
sandbox**. The player paints materials into a pixel grid, then watches simple
local rules produce larger-scale behaviour: sand piles, water levels, steam
rises, heat moves, fuel burns, plants grow, and powered machines move air.
It is a creative simulation, not an engineering-grade fluid, electrical, or
thermodynamics solver.

## What runs where

`particles.json` defines the materials and their tunable properties.
`physics.js` turns those definitions into a headless simulation. `game.js`
renders that state to a single pixelated canvas and drives the animation loop.
`ui.js` connects controls and pointer input; `themes.js` owns presentation
themes; `saveLoadGame.js` owns portable saves and the local resume slot. A
150-row world is stored as flat typed arrays for material, temperature,
lifetime, state-change progress, movement, visual shade, liquid surface,
charge, power and wind/airflow state.

Each active frame broadly does this:

```text
ambient temperature eases toward its setting
  -> heat diffuses and radiates
  -> connected liquid surfaces are calculated
  -> electricity and powered machine effects update
  -> ambient breeze moves material
  -> particles react, change state, and move bottom-to-top
  -> canvas draws the resulting world
```

## View and input ownership

The canvas viewport is a view layer around the same simulation canvas, not part
of the saved world state:

- `game.js` keeps the fitted canvas dimensions, applies four transient zoom
  levels (level 1 fits the full view; levels 2-4 enlarge it), sizes the scroll
  stage, and displays the top-right `Zoom: N/4` status for one second after a
  change. Entering the workspace and reloading reset the level and scroll
  offsets; no zoom state is serialized.
- `ui.js` owns viewport gestures. An unmodified vertical mouse wheel is
  exclusively zoom input and is prevented from vertically scrolling. Horizontal
  or Shift + wheel remains available to the browser for native horizontal
  scrolling where supported. Above level 1, thin theme-responsive scrollbars
  and unmodified arrow keys scroll the viewport; arrow keys continue to belong
  to focused controls instead of the canvas.
- The optional, unchecked **Edge pan** checkbox beside Import enables slow
  pointer-hover panning only inside the outer 5% of the viewport, and only
  above level 1. There is no application-owned drag-pan gesture. Middle-click
  samples a non-empty material only in Brush, Line, Rectangle, or Ellipse mode;
  other active tools are unchanged. Its browser default is prevented, so it
  cannot trigger native autoscroll or pan the viewport.
- `cellFromEvent()` continues to map pointer coordinates through the rendered
  canvas rectangle. Painting, erasing, material sampling, touch input, and
  machine overlay hit testing therefore retain their existing coordinate
  behavior at every zoom and scroll position. Scrolling changes only what is
  visible; the simulation loop continues running.

The scan direction alternates, and a per-cell moved flag prevents a particle
from moving twice in one frame. This is a pragmatic, fast cellular model rather
than continuous mechanics: “water pressure,” for example, is an equalising
rule based on the surface of connected liquid, not a Navier–Stokes solution.

## What it does particularly well

- It has a coherent, connected material loop rather than isolated effects:
  heat drives ice/water/steam, sand/glass/lava, and lava/scoria/stone; water
  changes ground; ground supports plant life; fire and acid reshape it.
- Thermal behaviour is unusually legible for a browser sand game. Pairwise
  four-way contact transfer uses both materials' conductivity; ambient cooling,
  eight-way radiation, latent-heat accumulation, and bulk insulation remain
  distinct effects that make thick material and heat sources feel different.
- The electrical system is more than a colour change. Sparks launch visible
  pulses through conductive networks; Battery stores shared charge; Copper,
  Iron and machines consume it; a Fan converts power into directional airflow,
  while Heater and Cooler convert it into directional temperature forces and
  matching centreline Heat Ray/Cold Ray projectiles.
- The simulator is testable outside the browser. The physics core has no DOM
  dependency, and the headless suite checks 284 assertions with default seed
  `0`, plus a 260x150 performance budget. A second smoke suite covers startup,
  input and autosave decisions. The last recorded full Playwright execution
  covered 121 browser tests and passed headlessly. Separately, the current test
  inventory discovers 137 tests in 34 spec files; that inventory count is not a
  claim that a 137-test full run has passed. The focused middle-click picker
  specs passed 21/21 headlessly. Headed runs are optional diagnostics and never
  an acceptance or release prerequisite.
- `npm run profile:scale` is a fixed, no-CLI-option, headless physics-only
  synthetic profile of 260x150, 520x300, and 1040x600. The 1040x600 case is
  profiler-only: there is no world-size selector or larger playable world, and
  new worlds still default to 150 rows with workspace-fitted columns. Profiling
  does not measure canvas rendering or SVG overlays. World creation is checked
  against a 2,000,000-cell limit before dimensions change or arrays allocate;
  its memory figures estimate 85 bytes of primary physics arrays plus 8 bytes
  of render memory per cell, not process RSS. Timings are machine-specific and
  informational. `npm run test:scale-profile` runs the profile math/CLI checks
  and the world-allocation checks.
- The interaction design is polished for a small sandbox: brush and line
  modes, right-click erase, mode-gated middle-click material sampling, heat
  view, a move-only-one-material Grabber, environmental controls, keyboard
  shortcuts and six persistent themes are all present. Middle-click picks only
  in Brush, Line, Rectangle, and Ellipse modes; it leaves empty cells and other
  active tools untouched, and never pans or triggers browser autoscroll. The
  material picker doubles as a glossary: every entry has a keyboard-accessible
  tooltip built from its live properties and reactions.
- Full worlds can be exported as an LZString and imported by pasting it back.
  The current game also autosaves locally once per minute and can be resumed
  from the menu.

## What it intentionally does less well

- It favours readable, game-like rules over physical accuracy. There is no
  continuous pressure field, momentum-conserving liquid solver, real chemical
  stoichiometry, voltage/current/resistance calculation, or rigid-body physics.
- It is currently a focused 53-entry material set with three powered machines,
  three storage bins, an always-active Vent and a two-input Mixer.
  That makes it approachable, but limits complex construction compared with
  mature sandboxes.
- Saves are browser-local or copy/paste strings rather than an online gallery,
  replay system, or modding API.
- It is CPU JavaScript and updates the grid serially. It performs well at the
  tested grid size, but is not yet designed for very large worlds or highly
  parallel GPU simulation.

## Similar programs and how this compares

| Program | Where Elemental Foundry is stronger or distinctive | Where the comparator is stronger |
|---|---|---|
| [The Powder Toy](https://powdertoy.co.uk/) | More focused presentation; a clear material-to-ecosystem loop; a bespoke Battery, Tubing, Vent and Fan system that is easy to understand. | A much broader long-running sandbox: its official description includes air pressure/velocity, heat, gravity, many interactions, complex electronics, community saves and Lua custom elements. |
| [Sandspiel](https://github.com/MaxBittker/sandspiel) | More explicit thermal insulation, ground-water lifecycle, electrical charge model, machine power consumption and environmental controls. | Rust/WASM + WebGL implementation, a sharing/forking-oriented platform, and a stated ambition for programmable user elements. |
| [DAN-BALL Powder Game](https://dan-ball.jp/en/m/dustviewer/) | Stronger current emphasis on temperature transitions, material-defined properties, battery-style charge and test coverage. | A long-established toybox with a large interaction catalogue including pumps, copy/paste, clouds, gears, controllable characters, upload/view modes and more. |

This is a scope comparison, not a quality ranking. Elemental Foundry is best
understood as a well-crafted, inspectable browser sandbox with a deep core set
of systems. The other three are better references when the goal is scale,
community content, modding, advanced circuitry, or broader toybox variety.

## Verification basis

The recorded verification includes the seeded headless suite at 284/284
assertions with default seed `0`, the passing smoke suite, and a last full
Playwright run of 121 tests that passed headlessly. The current inventory
discovery is 137 tests in 34 files; it is an inventory count, not a full-suite
pass. Focused middle-click picker specs passed 21/21 headlessly. For the scale
profile change, both `test:scale-profile` checks passed, the focused headless
Playwright run passed 5/5, and the fixed profile completed with informational
timings; no full suite was run for that change:

```text
npm run test:scale-profile
npm run test:browser -- e2e/scaling/default-world.spec.mjs e2e/physics/determinism.spec.mjs --workers=1 --trace=off
npm run profile:scale
npm run test:browser -- --list
```

Headless Playwright is the required verification path. Headed runs may be used
to diagnose visual or input issues, but are never required for acceptance or
release.

A failing headless assertion reports the seed needed to reproduce it. The
project shortcut is `npm run test:browser`; dated superseded documentation is
kept in [`archive/`](archive/) and does not describe current coverage.
