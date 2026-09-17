# Sand Simulator

A falling sand sandbox: 32 materials and tools on a 200 x 150 grid, with heat
that spreads from cell to cell so that things melt, boil, freeze and catch fire
on their own, weather that blows across the world of its own accord, and six
themes to look at it all through.

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

The toolbar also carries the brush size, the air temperature, the air layering,
the wind strength, the natural breeze and the theme. All of them are described
below.

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
even temperature throughout. The checkbox beside the slider switches layering
off altogether, which greys the slider out and makes the air even everywhere.
Unlike dragging the slider to zero it leaves the setting alone, so switching
layers back on brings back whatever was there before.

**Heat Ray** and **Cold Ray** are brushes rather than materials. They burn out
after a few frames instead of collecting on the floor, and while they last they
hold their cell at 900C or -120C, so you can paint heat and cold onto anything.

**Wind** is a brush too. Drag it and it shoves along whatever is light enough to
pick up - flame, steam, smoke, dry sand, dry mud, ash, snow, seeds - while wet
ground, rock and anything growing stay where they are. It also stirs the air it
passes through towards its own average temperature, so dragging up and down
mixes the cold layers at the top into the warm ones at the bottom. The Wind
slider sets how hard it blows.

A gust covers twice the width the brush is set to: air spills out around
whatever it is aimed at rather than stopping dead at the edge of the brush.
While it blows it leaves a faint pale haze behind it, streaked along the way it
is going, which fades over the next few frames. Nothing in the simulation reads
that haze back - it is there so that moving air can be seen rather than only
guessed at from whatever it happens to be pushing about.

Wind stops dead at anything solid. Where it meets wall, stone, glass or wood it
goes no further along that line: everything behind the obstacle is still air,
and the wind gets past only by way of the rows above and below it. A drawn box
is genuinely windproof, and a wall puts a long calm streak in its own lee.
Plants are not an obstacle - wind goes through a plant rather than round it - so
a hedge sways without sheltering anything.

**Breeze**, the checkbox on the toolbar, is the same idea left to itself. Every
few seconds a soft gust crosses the whole world from one side to the other,
fading in and out as it goes, carrying seeds, dry powders, smoke and steam with
it and leaving anything wet or heavy exactly where it is. It takes its strength
from the Wind slider, at double what the tool blows with, being weather rather
than a nudge from the mouse - so one dial covers both, and turning it up gives
weather to match. It is off to start with, since a world that blows itself about
is not what someone laying out a scene wants.

## Themes

Six of them - Workshop, Ember, Paper, Terminal, Lagoon and Dune - picked from
the row of swatches on the menu or the dropdown in the toolbar, and remembered
between visits. They differ in more than colour: corner rounding, border weight,
shadow, spacing, panel width and the font the chrome is set in all change with
them, so Terminal is square and monospace where Lagoon is round and glassy and
Dune has no borders at all.

A theme is a value on `<body data-theme="...">` and nothing more. Every rule in
`styles.css` reads its colours and measurements from custom properties declared
once on `:root`, and each theme is a block that overrides the handful it cares
about. Adding a seventh is a new block at the bottom of that file and a line in
`themes.js`; nothing in between has to change.


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
temperature of 20C. Fire holds itself at its own temperature and throws heat at
everything around it, which is what makes it a heat source. Lava does not hold
itself up: it starts white hot and gives its heat up slowly, at its own rate.

Nearly all of the interesting behaviour falls out of that one number rather than
being special-cased:

- ice above 0C becomes water; water below 0C becomes ice
- water above 100C becomes steam; steam below 95C condenses back to water, so
  steam rises, cools and rains
- wood, oil and plants above their ignition point catch fire
- sand next to lava melts into glass, and glass that lava has got right around
  melts in its turn and becomes lava itself
- lava below 700C chills into scoria, and scoria below 100C hardens into stone

A state change does not happen the moment a cell crosses its threshold. It banks
heat every frame it is past the threshold, by how far past, and only changes
once it has banked its `latent` amount. That is why ice floats in a puddle for a
few seconds rather than vanishing, but melts almost at once against a flame.

Three things are handled directly rather than through heat, because heat alone
gives the wrong answer: water puts out fire on contact, lava chills to scoria
the moment water touches it (otherwise the water boils off before it can chill
it), and water soaks into sand to make mud.

### Fire, and how it spreads

Conduction on its own cannot spread a fire sideways. Fire is a gas, so the
instant a cell catches light the flame rises off it and is next to the thing
beside it for a frame or two - nowhere near long enough to average it up to its
ignition point. A pool of oil would sit with a fire on top of it and never
light, and a bank of plants only ever caught from underneath.

Two things fix it, and both are what fire actually does. It **radiates**: a
flame throws heat at all eight cells around it, on top of whatever conduction
carries, and nothing is ever heated past the temperature of what is heating it.
And it **clings**: while there is anything flammable beside it a flame mostly
stays where it is and works on it, and only wanders off once there is nothing
left to burn. Between them, fire now runs the length of a puddle of oil, a bank
of plants or a plank of wood - and still goes out with nothing to burn, and
still will not jump a gap.

### Lava, scoria and stone

Lava does not go straight to stone. It chills first into **scoria**, the dark
red first stage, which is loose enough to be a powder: it sinks, piles and
slides, and only once it has landed and cooled right down does it harden into
stone. Drop lava in a pond and it chills on contact, sinks to the bottom as
glowing rock and sets there. Nothing ever sets while it is still on its way
down, so there is no stone left hanging in mid air or mid water.

A flow cools **slowly, and all of a piece**. Lava and scoria are both nearly
perfect insulators, so what governs them is not the weather but their own steady
rate of giving up heat: bitterly cold air barely hurries them along, and the
middle of a flow sets at much the same time as the edges rather than staying
molten under a crust for ever. A pool poured on the ground stays molten for
several seconds, glows as scoria for a good while longer, and is stone after
half a minute or so.

Two things make it last far longer than that:

- **A crust holds the heat in.** Buried scoria gives up heat a tenth as fast as
  bare scoria, and buried lava a tenth as fast again - a hundredth of the open
  rate - so a flow that has crusted over stays molten underneath, and only what
  is actually exposed to the sky sets at any speed.
- **The floor of the world is the heat the world sits on.** Lava lying right on
  the bottom row never sets by cooling at all. A lava lake on the bedrock stays
  a lava lake, and only water will put it out.

Lava is heavier than scoria, so scoria dropped on a pool of lava floats on top
of it and lava poured over scoria sinks underneath - the flow works its way back
down through its own crust.

### Toxic fumes

Acid gives off **toxic gas** where it eats something away, left in the hole
rather than puffed out at random, so a bank being dissolved fumes along the face
of it. It is a bright yellow-green, it rises and spreads like any other gas, and
anything growing that it drifts through - plant, grass, flower, stem or lily -
withers to bare sand.

The gas is not taken up in doing it. It kills what it touches and carries
straight on, so one cloud works its way right across a bank and leaves bare
ground behind it.

### Movement

Density decides everything, with one exception. A particle sinks into anything
lighter than itself and rises through anything heavier, which is all it takes to
get sand sinking through water, ice and oil floating on top, and bubbles of
steam rising out of a pond. Powders also slide diagonally, liquids also flow
sideways, and gases do the same in reverse.

The exception is that one powder is never weighed against another. Grains that
land on other grains stay on top of them, wet or dry, and only fluids are pushed
out of the way. Weighing powders against each other had a poured heap slowly
sort itself into neat bands by weight - sand working its way under dry mud, dry
mud under wet - which is not what loose ground does.

`moveChance` is how readily something shifts about of its own accord: creeping,
sliding, settling. Falling is not covered by it, because gravity is not a matter
of choice - everything drops at its own fall speed whatever it says. That is
what lets lava crawl along the ground at the pace of treacle while still falling
through open air like the heavy stuff it is, and what stops wet ground looking
as though it were floating down.

### Gases

A gas rises, but not in a straight line. Some of the time it slides off to one
side instead of climbing, which makes a plume billow as it goes up, and when
there is nothing doing upwards at all it works its way sideways along whatever
is stopping it rather than stacking up underneath. Between them, a gas fills the
room it is in instead of hugging the ceiling over the spot where it was made.

**Steam** in particular is meant to hang about. It is very nearly an insulator
and it has a great deal of heat to bank before it will condense, so a kettle's
worth spreads right across the sky and stays there for ten or fifteen seconds
before it comes down - as rain in warm air, as snow in freezing air. The breeze
carries it, as it carries any gas.

### Deep water

Water is packed down by everything lying on top of it. Everything in the top
eight cells of a body of liquid flows as freely as it ever did - that is where a
pond finds its level, and where the ripples are - and below that the chance of a
cell shuffling sideways falls away, until by eighteen cells down it has stopped
altogether and the water simply sits.

Gravity has already had its turn by then, so a hole opened at the bottom of a
pond still fills. What stops is the endless sideways shuffling that had a whole
body of water churning at once while only the surface had anything to settle.

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
| Wet Mud, under open water | a lily |
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

Nothing grows out of dry ground. Before a plant puts on another cell it has to
be able to find wet mud or wet sand somewhere along itself - anywhere in the
plant, not only against the cell doing the growing - so a patch whose soil dries
out, or that has the ground dug out from under it, stops where it is instead of
carrying on regardless. The search walks the whole of one plant, side shoots
included, and crosses between kinds of plant, because what is standing there is
one plant with one set of roots even where it is made of more than one thing.

Wet mud is the richer of the two soils. Grass with any part of itself against
wet mud grows on as a wet mud plant rather than as grass, and takes that plant's
height with it, so it carries on upward and finishes with a flower instead of
stopping short. It is never demoted the other way: a plant beside wet sand stays
a plant.

### Lilies

A seed that germinates on the bed of open water is a different plant
altogether. It climbs through the water as a loose net rather than as a stalk,
opens out into a pad when it reaches the surface, creeps sideways along the top
of the water, and finishes with a broad white bloom three cells across in the
middle of the pads.

Whether it is a lily is settled on the one frame the seed germinates, from the
water standing over it at that moment, and is never looked at again - so
draining the pond afterwards leaves the lily growing. What it asks is whether
there is a column of open water overhead at least four cells deep with air at
the top of it, and water to one side as well rather than a puddle caught in a
crack. The column is looked straight through: a seed does not mistake the other
seeds a brushful dropped in beside it, or a lily already growing there, for a
lid.

The stem reaches the surface however deep the water is. The growth it is given
is measured from that water when it germinates, and never falls below enough to
keep climbing, so what stops it is running out of water rather than running out
of growth. What the budget does govern is how freely it forks on the way up.

A net is mostly holes. Each strand leans alternately left and right as it rises
and forks off to the other side now and then, and always prefers somewhere with
water to either side of it over somewhere wedged against the strand next door.
Lilies also want a few cells of elbow room along the bed before another takes
root beside one, so a brushful of seeds comes up as a few plants with water
between them rather than as a wall of green. A seed that lands too close to a
lily already growing does not come up at all - under water it is a lily or it is
nothing - and lies there until it rots.

### Seeds, and which of them float

Whether a seed is buoyant is settled the moment it exists and never revisited.
About two in five come up floaters, which weigh less than water: dropped into a
pond they ride on the surface and work their way to one side over time, the way
anything adrift does, until they fetch up against a bank. The rest sink straight
to the bottom, which is where lilies come from. Away from water it makes no
difference - every seed falls and comes to rest on whatever is underneath it.

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
fountaining. All three are the sideways flow, so all three are what goes quiet
with depth (see **Deep water** above); gravity is untouched by it. Squeezing through a narrow submerged channel is gradual - a two
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
