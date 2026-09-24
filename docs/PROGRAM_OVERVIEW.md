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
themes; `saveLoadGame.js` owns portable saves and the local resume slot. The
260×150 and 520×300 worlds are stored as flat typed arrays for material,
temperature, lifetime, state-change progress, movement, visual shade, liquid
surface, charge, power and wind/airflow state.

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

The New Game chooser offers exactly two fixed world sizes: **260×150** and
**520×300**. The larger choice carries a warning that it is performance-heavy
and autosaving will freeze the game. It stays hidden until the usable
`#canvasArea` content box is at least 260×150 CSS pixels. Both worlds start at a
fitted view with every edge visible and no scrolling. New worlds begin centered
horizontally; the stage is aligned to the bottom. When zoomed, scrolling is
clamped to the world's left, right, and bottom boundaries. World size is part of
the v1 save data, so Resume and the Load action restore the selected dimensions.

The canvas viewport is a view layer around the simulation canvas. Zoom and
scroll offsets are transient and are not serialized:

- `game.js` keeps the fitted canvas dimensions and sizes the scroll stage. Both
  world sizes start at fitted zoom level 1 with all edges visible. The 260×150
  zoom factors are `[1, 1.5, 2, 3]`; the 520×300 factors are `[1, 2, 3, 4, 6]`.
  A 2px brown boundary stroke is centered on the canvas's outer edge: its side
  paths are at x=0 and x=width, run from y=0 to y=height+1, matching the lower
  stroke edge of the bottom path centered at y=height. The top-right zoom status
  reports the active level count for one second after a
  change. Entering the workspace and reloading reset zoom and scroll.
- `ui.js` owns viewport gestures. An unmodified vertical mouse wheel is
  exclusively zoom input and is prevented from vertically scrolling. Horizontal
  or Shift + wheel remains available to the browser for native horizontal
  scrolling where supported. Above level 1, thin theme-responsive scrollbars
  and unmodified arrow keys scroll the viewport; arrow keys continue to belong
  to focused controls instead of the canvas.
- The optional, unchecked **Edge pan** checkbox beside Load enables slow
  pointer-hover panning only inside the outer 5% of the viewport, and only
  above level 1. There is no application-owned drag-pan gesture. Middle-click
  samples a non-empty material only in Brush, Line, Rectangle, or Ellipse mode;
  other active tools are unchanged. Its browser default is prevented, so it
  cannot trigger native autoscroll or pan the viewport.
- The adjacent **Autosave** checkbox reflects the live autosave state through
  New Game, Resume, Load, and save failures. Turning it off stops future
  periodic writes while preserving the current resume save. Turning it back on
  starts a fresh five-minute timer without an immediate write; a failed write
  turns the checkbox off and displays the unavailable status. The resume-save
  replacement dialog keeps its three actions in a single row. Toolbar buttons,
  checkboxes, and the theme selector use the shared theme-styled tooltip. Its
  Ember background is opaque.
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
  input and autosave decisions. An earlier full Playwright execution covered
  121 browser tests and passed headlessly. A prior test discovery
  snapshot listed 137 tests in 34 spec files; that inventory count is not a
  claim that a 137-test full run has passed. The focused middle-click picker
  specs passed 21/21 headlessly. Headed runs are optional diagnostics and never
  an acceptance or release prerequisite.
- `npm run profile:scale` is a fixed, no-CLI-option, headless physics-only
  synthetic profile of 260×150, 520×300, and 1040×600. The 1040×600 case is
  profiler-only; the two selectable worlds are 260×150 and 520×300. Profiling
  excludes canvas rendering and SVG overlays. The recorded 520×300 physics-only
  step averaged 27.535 ms with a 37.675 ms p95 on the profiling machine. These
  machine-specific measurements are diagnostic and do not guarantee 60 fps;
  browser rendering and interaction add work. A 780×450 option was tried and
  removed after a focused browser Start Game action exceeded 10 seconds. World
  creation is checked against a 2,000,000-cell limit before dimensions change
  or arrays allocate; memory figures estimate 85 bytes of primary physics
  arrays plus 8 bytes of render memory per cell, not process RSS. The
  `test:scale-profile` script runs profile math/CLI and world-allocation checks.
- The interaction design is polished for a small sandbox: brush and line
  modes, right-click erase, mode-gated middle-click material sampling, heat
  view, a move-only-one-material Grabber, environmental controls, keyboard
  shortcuts and six persistent themes are all present. Middle-click picks only
  in Brush, Line, Rectangle, and Ellipse modes; it leaves empty cells and other
  active tools untouched, and never pans or triggers browser autoscroll. The
  material picker doubles as a glossary: every entry has a keyboard-accessible
  tooltip built from its live properties and reactions.
- The **Save** action stores full worlds as LZString strings; use **Load** to
  restore one by pasting its save string.
  When Autosave is enabled, the game updates its local resume save every five
  minutes and can be resumed from the menu.

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
assertions with default seed `0`, the passing smoke suite, and an earlier full
Playwright run of 121 tests that passed headlessly. Focused middle-click picker
specs passed 21/21. For the fixed-world chooser and camera work, 38 unique cases
were confirmed across multiple headless Chrome-channel runs using a temporary
config because bundled Chromium was unavailable: the first run passed 35/38,
then five focused gate/edge cases passed after the visibility and edge-pan
fixes. This was not one 38-case run. Later focused results were 14/14 for the
zoom spec, 9/9 across accessibility and contract files, and passing scale-profile
and smoke checks (the smoke mock geometry was corrected first). One authorized
full run recorded `npm test` at 268 passed and 21 failed; the browser run was
144/151 before later focused fixes, with the remaining failures in physics.
There is no full-suite rerun recorded, and the latest QMODE boundary-position
edit was not intentionally retested. The autosave persistence
Playwright area passed 13/13 headlessly. No full suite was run for the autosave
and tooltip handoff;
the newest tooltip-only QMODE adjustment, including the opaque Ember
background, was not separately tested.

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
