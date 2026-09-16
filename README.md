# Sand Simulator

A falling sand sandbox: 27 materials and tools on a 200 x 150 grid, with heat
that spreads from cell to cell so that things melt, boil, freeze and catch fire
on their own.

## Running it

```
npm start            # then open http://localhost:8080
```

It has to be served over http rather than opened as a file, because the page
uses ES modules and fetches `particles.json`. The server is 40 lines of node
with no dependencies.

```
npm test                   # physics checks, no browser needed
node tools/smokeTest.mjs   # runs the real UI against a stand-in browser
```

Two probes help with tuning awkward numbers. Both take an optional patch to
`particles.json` on the command line, so settings can be compared without
editing the file:

```
node tools/tuneFire.mjs '{"3":{"drift":0.15}}'     # does a flame reliably light wood
node tools/tuneIce.mjs                             # ice: lasts at room temperature, melts on a flame
```

## Controls

| | |
|---|---|
| Left click / drag | pour the selected material |
| Right click | erase |
| Space | pause |
| E | eraser |
| H | heat view (shows temperature instead of materials) |
| `[` `]` | brush size |

The **air temperature** runs from -60C to 600C. Drag the slider for a rough
setting, or type an exact number in the box beside it and press Enter - each one
fills in the other. The world drifts towards whatever is set slowly rather than
snapping to it, and it is deliberately a weak effect next to a flame or a block
of ice: turn it down to -40 and ponds ice over in the end, but a fire held
against wood still lights it.

The air is not perfectly even, in two ways. Each particle settles at a
temperature a degree or two either side of the dial, up to four degrees apart
from its neighbours, so a pond sitting right on freezing ices over in patches
rather than all at once. On top of that the air comes in **layers**: the world
is split into five bands by height and each one is colder than the one below it,
by however many degrees the Layers slider says. The middle band sits exactly on
the dial, so what it reads stays true. Turn Layers up and the top of the world
becomes a different climate from the bottom; turn it to zero and the air is one
even temperature throughout.

**Heat Ray** and **Cold Ray** are brushes rather than materials. They burn out
after a few frames instead of collecting on the floor, and while they last they
hold their cell at 900C or -120C, so you can paint heat and cold onto anything.

**Wind** is a brush too. Drag it and it shoves along whatever is light enough to
pick up - flame, steam, smoke, dry sand, dry mud, ash, snow - while wet ground,
rock and anything growing stay where they are. It also stirs the air it passes
through towards its own average temperature, so dragging up and down mixes the
cold layers at the top into the warm ones at the bottom. The Wind slider sets
how hard it blows.


## How it works

Four files, and only one of them contains any physics.

| File | What is in it |
|---|---|
| `particles.json` | every material and every number that describes it |
| `physics.js` | movement, heat, reactions. No DOM, so it can be run headless |
| `game.js` | canvas, drawing, the main loop, screen states |
| `ui.js` | buttons, the material picker, mouse and keyboard |

### The world

One entry per cell in a set of flat typed arrays: what is in it, how hot it is,
how long it has left to live, and so on. Flat arrays rather than `grid[x][y]`
because they are quicker to read and cheap to clear.

Each frame does three things: spread the heat, work out the top of each body of
liquid, then walk the grid from the bottom row upwards and give every particle
one move. A `moved` flag makes sure nothing moves twice in a frame, and the
left-to-right scan order flips every frame so piles do not drift sideways.

### Heat

Every cell has a temperature in degrees C. It pulls towards the average of its
four neighbours at a rate set by the material, and leaks towards the ambient air
temperature of 20C. Fire and lava hold themselves at their own temperature,
which is what makes them heat sources.

Nearly all of the interesting behaviour falls out of that one number rather than
being special-cased:

- ice above 0C becomes water; water below 0C becomes ice
- water above 100C becomes steam; steam below 95C condenses back to water, so
  steam rises, cools and rains
- wood, oil and plants above their ignition point catch fire
- sand next to lava melts into glass
- lava below 700C sets into stone

A state change does not happen the moment a cell crosses its threshold. It banks
heat every frame it is past the threshold, by how far past, and only changes
once it has banked its `latent` amount. That is why ice floats in a puddle for a
few seconds rather than vanishing, but melts almost at once against a flame.

Three things are handled directly rather than through heat, because heat alone
gives the wrong answer: water puts out fire on contact, lava sets into stone the
moment water touches it (otherwise the water boils off before it can chill it),
and water soaks into sand to make mud.

### Movement

Density decides everything. A particle sinks into anything lighter than itself
and rises through anything heavier, which is all it takes to get sand sinking
through water, ice and oil floating on top, and bubbles of steam rising out of a
pond. Powders also slide diagonally, liquids also flow sideways, and gases do
the same in reverse.

### Wet and dry ground

Water never sits against dry ground. The instant it touches Sand or Dry Mud
those turn into Wet Sand and Wet Mud, and about half the time the drop of water
is soaked up and gone in the process - so a stream wets a stretch of bank as it
runs over it, and gets shorter as it goes. Wet Sand is as far as sand goes: no
amount of water turns it into mud. Heat drives all of it back the other way,
giving off steam.

Mud only ever comes from Dry Mud getting wet, and Dry Mud comes from Wet Mud
baking dry or from a seed that failed to come up, which closes the loop.

Only water wets things. Wet ground does not soak into what is under it, so wet
sand sits on top of dry sand exactly as it would in reality.

What makes the wet and dry versions feel different underfoot is `repose`, the
angle a powder will sit at without slipping. Dry sand only needs one cell of
drop beside it before it slides, so it always collapses into a flat cone. Wet
mud needs the ground to fall right away beneath it, so it stands in a steep
heap.

### Plants

A seed sprouts on wet ground - and only wet, that is the point of it - and only
above 5C, since nothing germinates in the frost. What it becomes depends on what
it landed on:

| Ground | Result |
|---|---|
| Wet Mud | a full plant, 6 to 18 cells, finished with a flower |
| Wet Sand | short grass, 3 to 9 cells, no flower |
| anything dry | nothing; the seed sits and waits |

A seed that lands somewhere it cannot use keeps for thirty seconds and then
rots down into Dry Mud - which is the one thing that can be wetted back into the
Wet Mud the next seed needs.

Each plant picks its height at random from its own range, so a row of them comes
up ragged rather than level. It grows one cell at a time, handing its remaining
budget up to the new cell and keeping none for itself, which is what makes it
climb as a stem and then stop. A plant on good ground finishes by opening into a
flower, which takes one of twelve rainbow colours at random. Grass on poor
ground just runs out and stops.

A flower only sets seed if there is water within reach - six cells to the sides
and above, four times that below, since the flower is up on a stem while the
water it lives on is down at its roots. A plant somewhere dry lives out its life
and never reproduces.

Because a cell that has grown is spent, a plant that is burnt or dissolved stays
gone instead of creeping back.

### Snow

Steam condensing where the air is below freezing comes down as snow instead of
rain, at the temperature of the air that made it rather than the temperature the
steam was. Snow lies where it falls while the air stays cold, melts into water
once it warms up, packs slowly down into ice where it settles on ice, and melts
straight into water the moment it lands on water - chilling that water to 1C as
it goes.

Only what is directly underneath a snowflake counts for those last two. Checking
all round would mean one drop of meltwater at the foot of a snowbank ran away
sideways and turned the whole bank to water at once.

### Gunpowder

Gunpowder catches at 80C - it is meant to be touchy - and each grain clears only
a small patch when it goes. What makes it worth having is that the blast lights
every grain it touches one frame later, so a trail or a heap tears through
itself in a flash and the combined explosion is as big as the pile was. The
blast leaves fire and sparks behind, sets light to anything flammable nearby,
and goes through everything except Wall.

### Water finding its level

Gravity acts once per frame. The sideways flow then runs `flowSteps` times -
four for water - which is the main dial for how quickly a poured puddle settles.
It is the difference between a blob taking thirteen seconds to flatten out and
taking five. Gravity deliberately does *not* repeat: water falling its full
speed four times over would drop most of the height of the screen between
frames, too fast for anything it passes to react to it.

Each flow step tries three things in order:

1. fall diagonally, which flattens the surface of a pool
2. run along the surface looking for somewhere to fall from, crossing only empty
   cells so water can never teleport through anything
3. pressure: each frame every body of liquid works out where its own surface is,
   and a cell that is stuck may climb into an empty space above it *as long as
   that space is still below that surface*

Rule 3 is what makes water rise up the far side of a U-bend or through a hole in
the bottom of a tank, and because a cell may never climb above the surface of
the water pushing it, it stops dead once the two sides are level instead of
fountaining. Squeezing through a narrow submerged channel is gradual - a two
cell wide channel takes several seconds of simulated time to equalise, which is
about right.

## Changing things

Everything is in `particles.json`, including a description of what each field
does. Adding a material there is enough to get a button for it in the UI. Some
things worth knowing:

- Heat spreads by averaging with four neighbours, so a cell next to a single
  flame settles at roughly a quarter of the flame's temperature. That is why
  wood ignites at 160 rather than a realistic 300 - 160 is a temperature a cell
  next to a fire can actually reach.
- `ambientTemp` at the top of the file is room temperature. Set it below zero
  and ice stops melting on its own.
- `npm test` is the quickest way to see whether a change to those numbers broke
  something: it checks conservation, levelling, floating, burning, melting,
  boiling and speed, in about ten seconds and without a browser.
