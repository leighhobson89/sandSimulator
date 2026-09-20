# Elemental Foundry: program overview

Reviewed: 20 September 2026

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

The scan direction alternates, and a per-cell moved flag prevents a particle
from moving twice in one frame. This is a pragmatic, fast cellular model rather
than continuous mechanics: “water pressure,” for example, is an equalising
rule based on the surface of connected liquid, not a Navier–Stokes solution.

## What it does particularly well

- It has a coherent, connected material loop rather than isolated effects:
  heat drives ice/water/steam, sand/glass/lava, and lava/scoria/stone; water
  changes ground; ground supports plant life; fire and acid reshape it.
- Thermal behaviour is unusually legible for a browser sand game. Four-way
  conduction, ambient cooling, eight-way radiation, latent-heat accumulation,
  and bulk insulation make thick material and heat sources feel distinct.
- The electrical system is more than a colour change. Sparks launch visible
  pulses through conductive networks; Aluminum stores shared charge; Copper,
  Iron and machines consume it; a Fan converts power into directional airflow,
  while Heater and Cooler convert it into directional temperature forces and
  matching centreline Heat Ray/Cold Ray projectiles.
- The simulator is testable outside the browser. The physics core has no DOM
  dependency, and the headless suite checks 250 reproducibly seeded behavioural
  assertions plus a 260x150 performance budget. A second smoke suite covers
  startup, input and autosave decisions, while Playwright covers real-browser
  themes, pointer/touch input, focus and narrow layouts.
- The interaction design is polished for a small sandbox: brush and line
  modes, right-click erase, heat view, a move-only-one-material Grabber,
  environmental controls, keyboard shortcuts and six persistent themes are all
  present. The material picker doubles as a glossary: every entry has a
  keyboard-accessible tooltip built from its live properties and reactions.
- Full worlds can be exported as an LZString and imported by pasting it back.
  The current game also autosaves locally once per minute and can be resumed
  from the menu.

## What it intentionally does less well

- It favours readable, game-like rules over physical accuracy. There is no
  continuous pressure field, momentum-conserving liquid solver, real chemical
  stoichiometry, voltage/current/resistance calculation, or rigid-body physics.
- It is currently a focused 47-entry material set with three powered machines.
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
| [The Powder Toy](https://powdertoy.co.uk/) | More focused presentation; a clear material-to-ecosystem loop; a bespoke Aluminum battery and Fan system that are easy to understand. | A much broader long-running sandbox: its official description includes air pressure/velocity, heat, gravity, many interactions, complex electronics, community saves and Lua custom elements. |
| [Sandspiel](https://github.com/MaxBittker/sandspiel) | More explicit thermal insulation, ground-water lifecycle, electrical charge model, machine power consumption and environmental controls. | Rust/WASM + WebGL implementation, a sharing/forking-oriented platform, and a stated ambition for programmable user elements. |
| [DAN-BALL Powder Game](https://dan-ball.jp/en/m/dustviewer/) | Stronger current emphasis on temperature transitions, material-defined properties, battery-style charge and test coverage. | A long-established toybox with a large interaction catalogue including pumps, copy/paste, clouds, gears, controllable characters, upload/view modes and more. |

This is a scope comparison, not a quality ranking. Elemental Foundry is best
understood as a well-crafted, inspectable browser sandbox with a deep core set
of systems. The other three are better references when the goal is scale,
community content, modding, advanced circuitry, or broader toybox variety.

## Verification basis

The review read the source, data definitions, UI and tools; validated JavaScript
syntax and JSON; and ran the seeded headless and smoke suites. A failing
headless assertion now reports the seed needed to reproduce it. Real-browser
checks are available through `npm run test:browser`; the remaining testing
follow-up is broader manual device and assistive-technology coverage.
