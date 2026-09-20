// tools/simTest.mjs
// -----------------------------------------------------------------------------
// Headless checks for the simulation. physics.js does not touch the DOM, so the
// whole thing can be run from the command line:
//
//     node tools/simTest.mjs
//
// Each check sets up a small world, runs it for a number of frames, and reports
// what happened. Handy for tuning particles.json without reloading a browser.
// -----------------------------------------------------------------------------

import { readFileSync } from 'fs';
import {
    prepareDefinitions, createWorld, getWorld, clearWorld, stepSimulation,
    setCell, index, getDefinitions, setAmbientTarget, getAmbientTemp,
    setLayerLapse, getLayerLapse, getAirTempAt, setAirLayersOn,
    applyWind, getWindTrails, decayWindTrails,
    setAmbientWindOn, isBreezeBlowing, isPowered, getStoredCharge,
    getConnectedAluminumCharge, EMPTY
} from '../physics.js';

const json = JSON.parse(readFileSync(new URL('../particles.json', import.meta.url), 'utf8'));
const defs = prepareDefinitions(json);

const ID = {};
defs.forEach((d, i) => { if (d && i > 0) ID[d.name] = i; });

const COLS = 60;
const ROWS = 45;
createWorld(COLS, ROWS);

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
    if (condition) {
        passed++;
        console.log(`  PASS  ${label}`);
    } else {
        failed++;
        console.log(`  FAIL  ${label}${detail ? '  ->  ' + detail : ''}`);
    }
}

function run(frames) {
    for (let f = 0; f < frames; f++) stepSimulation();
}

function typeAt(x, y) { return getWorld().type[index(x, y)]; }
function tempAt(x, y) { return getWorld().temp[index(x, y)]; }

function countOf(id) {
    const type = getWorld().type;
    let n = 0;
    for (let i = 0; i < type.length; i++) if (type[i] === id) n++;
    return n;
}

function fillRect(x0, y0, w, h, id) {
    for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) setCell(x, y, id);
    }
}

// The height of the highest filled cell in a column, or -1 when it is empty.
function surfaceOf(x, id) {
    for (let y = 0; y < ROWS; y++) if (typeAt(x, y) === id) return y;
    return -1;
}

function section(name) {
    console.log(`\n${name}`);
    clearWorld();
}

// ---------------------------------------------------------------------------

section('Sand falls, piles up and is never lost or duplicated');
fillRect(28, 2, 4, 4, ID.Sand);
const sandStart = countOf(ID.Sand);
run(120);
check('sand is conserved', countOf(ID.Sand) === sandStart, `${sandStart} -> ${countOf(ID.Sand)}`);
check('sand reached the floor', typeAt(29, ROWS - 1) === ID.Sand || typeAt(30, ROWS - 1) === ID.Sand);
check('sand spread into a pile', surfaceOf(29, ID.Sand) > ROWS - 6);

// ---------------------------------------------------------------------------

section('Ash falls much more slowly than snow');
for (let x = 5; x < 55; x += 2) {
    setCell(x, 2, ID.Ash);
    setCell(x + 1, 2, ID.Snow);
}
run(20);
const ashHeight = meanHeightOf(ID.Ash);
const snowHeight = meanHeightOf(ID.Snow);
check('ash descends at less than half the speed of snow',
    ashHeight !== null && snowHeight !== null && ashHeight < snowHeight * 0.5,
    `ash row ${ashHeight?.toFixed(1)}, snow row ${snowHeight?.toFixed(1)}`);

// ---------------------------------------------------------------------------

section('Water finds its own level');
fillRect(10, 10, 6, 14, ID.Water);
const waterStart = countOf(ID.Water);
run(200);
check('water is conserved', countOf(ID.Water) === waterStart, `${waterStart} -> ${countOf(ID.Water)}`);

let minSurface = ROWS;
let maxSurface = -1;
let wetColumns = 0;
for (let x = 0; x < COLS; x++) {
    const s = surfaceOf(x, ID.Water);
    if (s >= 0) {
        wetColumns++;
        if (s < minSurface) minSurface = s;
        if (s > maxSurface) maxSurface = s;
    }
}
check('water spread out sideways', wetColumns > 30, `${wetColumns} columns wet`);
check('surface is level within 2 cells', maxSurface - minSurface <= 2,
    `top ${minSurface}, bottom ${maxSurface}`);

// ---------------------------------------------------------------------------

section('A deep water cliff collapses and levels out');
// This is deliberately deeper than FLOW_STILL_DEPTH. The old deep-water
// shortcut froze the exposed side of this block, leaving a vertical cliff.
fillRect(4, 5, 12, ROWS - 5, ID.Water);
const cliffWater = countOf(ID.Water);
run(700);
let cliffMinSurface = ROWS;
let cliffMaxSurface = -1;
let cliffWetColumns = 0;
for (let x = 0; x < COLS; x++) {
    const s = surfaceOf(x, ID.Water);
    if (s < 0) continue;
    cliffWetColumns++;
    cliffMinSurface = Math.min(cliffMinSurface, s);
    cliffMaxSurface = Math.max(cliffMaxSurface, s);
}
check('the exposed face drained instead of remaining a cliff', cliffWetColumns > 45,
    `${cliffWetColumns} columns wet`);
check('the deep pool found its level', cliffMaxSurface - cliffMinSurface <= 2,
    `top ${cliffMinSurface}, bottom ${cliffMaxSurface}`);
check('levelling conserved the water', countOf(ID.Water) === cliffWater,
    `${cliffWater} -> ${countOf(ID.Water)}`);

// ---------------------------------------------------------------------------

section('Water levels itself in connected vessels (a U-bend)');
// Two chambers joined only by a gap along the bottom, with all the water poured
// into the left one. It has to travel under the divider and climb the far side.
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(30, 10, 1, ROWS - 13, ID.Wall);       // divider, stopping 2 rows short
fillRect(5, 20, 20, 22, ID.Water);              // all the water starts on the left
// Squeezing through a two cell channel takes a while, as it would in reality.
run(1500);
let leftDepth = 0;
let rightDepth = 0;
for (let y = 0; y < ROWS; y++) {
    if (typeAt(15, y) === ID.Water) leftDepth++;
    if (typeAt(45, y) === ID.Water) rightDepth++;
}
check('water travelled under the divider and up the other side', rightDepth > 0,
    `left ${leftDepth}, right ${rightDepth}`);
check('both sides settled at the same level (within 3 cells)',
    Math.abs(leftDepth - rightDepth) <= 3, `left ${leftDepth}, right ${rightDepth}`);

section('Water does not fountain out of a sealed container');
for (let x = 20; x <= 40; x++) setCell(x, 40, ID.Wall);
for (let y = 20; y <= 40; y++) { setCell(20, y, ID.Wall); setCell(40, y, ID.Wall); }
fillRect(21, 30, 19, 10, ID.Water);            // filled to row 30, open at the top
run(400);
let highestWater = ROWS;
for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
        if (typeAt(x, y) === ID.Water && y < highestWater) highestWater = y;
    }
}
check('the water level did not rise above where it started', highestWater >= 29,
    `highest water row ${highestWater}, started at 30`);

// ---------------------------------------------------------------------------

section('Ice floats on water, oil floats on water, sand sinks');
fillRect(0, 20, COLS, 25, ID.Water);
fillRect(20, 30, 6, 2, ID.Ice);       // ice started deep under the surface
fillRect(35, 34, 4, 2, ID.Oil);       // oil started deep under the surface
fillRect(48, 21, 3, 2, ID.Sand);      // sand started at the top
run(150);

let iceDepth = 0, iceCount = 0;
let oilDepth = 0, oilCount = 0;
let sandDepth = 0, sandCount = 0;
for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
        const t = typeAt(x, y);
        if (t === ID.Ice) { iceDepth += y; iceCount++; }
        if (t === ID.Oil) { oilDepth += y; oilCount++; }
        // Sand dropped in water soaks as it goes, so it is followed in
        // whichever form it has reached by the time it lands.
        if (t === ID.Sand || t === ID['Wet Sand'] || t === ID['Wet Mud']) {
            sandDepth += y;
            sandCount++;
        }
    }
}
const waterTop = surfaceOf(25, ID.Water);
check('ice rose to the surface', iceCount > 0 && (iceDepth / iceCount) < 26,
    `average ice row ${(iceDepth / iceCount).toFixed(1)}, water surface ${waterTop}`);
check('oil rose to the surface', oilCount > 0 && (oilDepth / oilCount) < 26,
    `average oil row ${(oilDepth / oilCount).toFixed(1)}`);
check('sand sank to the bottom', sandCount > 0 && (sandDepth / sandCount) > 38,
    `average sand row ${(sandDepth / sandCount).toFixed(1)}`);

// ---------------------------------------------------------------------------

section('Fire rises, burns wood and leaves ash behind');
fillRect(20, 20, 10, 8, ID.Wood);
const woodStart = countOf(ID.Wood);
fillRect(24, 28, 2, 1, ID.Fire);       // lit from underneath
run(90);
check('the fire spread into the wood', countOf(ID.Wood) < woodStart,
    `${woodStart} -> ${countOf(ID.Wood)}`);
check('there are flames', countOf(ID.Fire) > 0);
run(600);
// Cells at the edge of the block can lose their neighbours and cool down before
// they catch, which is fair enough, so this asks for most of it rather than all.
check('most of the wood burned away', countOf(ID.Wood) <= 16, `${countOf(ID.Wood)} of 80 left`);
check('ash was left behind', countOf(ID.Ash) > 0, `${countOf(ID.Ash)} ash`);
check('the fire went out once the fuel was gone', countOf(ID.Fire) === 0,
    `${countOf(ID.Fire)} still burning`);

// ---------------------------------------------------------------------------

section('Water puts fire out');
// Measured against the same fire with no water on it, so this is testing that
// water kills the flames rather than that flames eventually burn out. The fire
// sits on the floor, so the water pools on it the way a bucket thrown over a
// bonfire would, rather than falling straight past it.
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(20, ROWS - 5, 8, 4, ID.Fire);
run(40);
const fireLeftAlone = countOf(ID.Fire);

clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(20, ROWS - 5, 8, 4, ID.Fire);
fillRect(18, ROWS - 12, 12, 5, ID.Water);
run(40);
const fireUnderWater = countOf(ID.Fire);
check('water killed the flames far faster than they burn out',
    fireUnderWater * 4 < fireLeftAlone,
    `${fireUnderWater} left with water, ${fireLeftAlone} left without`);

// ---------------------------------------------------------------------------

section('Lava rests on materials instead of displacing them');
for (let x = 20; x <= 40; x++) {
    setCell(x, 20, ID.Sand);
    setCell(x, 21, ID.Wall);
}
setCell(30, 19, ID.Lava);
run(1);
let lavaBelowSurface = false;
let sandPushedUp = false;
for (let x = 20; x <= 40; x++) {
    if (typeAt(x, 20) === ID.Lava) lavaBelowSurface = true;
    if (typeAt(x, 19) === ID.Sand) sandPushedUp = true;
}
check('lava did not sink into the sand', !lavaBelowSurface);
check('the sand was not pushed up above the lava', !sandPushedUp);

// ---------------------------------------------------------------------------

section('Resting lava melts insulated glass and bakes mud into scoria');
fillRect(15, 39, 30, 4, ID.Glass);
fillRect(25, 38, 10, 1, ID.Lava);
const glassBeforeLava = countOf(ID.Glass);
run(500);
check('lava resting on a thick glass slab melted some of it back into lava',
    countOf(ID.Glass) < glassBeforeLava,
    `${glassBeforeLava - countOf(ID.Glass)} glass cells melted`);

clearWorld();
for (let x = 8; x < 22; x++) {
    setCell(x, 29, ID['Wet Mud']);
    setCell(x, 30, ID.Wall);
    setCell(x, 28, ID.Lava);
}
for (let x = 38; x < 52; x++) {
    setCell(x, 29, ID['Dry Mud']);
    setCell(x, 30, ID.Wall);
    setCell(x, 28, ID.Lava);
}
run(180);
let wetMudScoria = 0;
let dryMudScoria = 0;
for (let x = 8; x < 22; x++) if (typeAt(x, 29) === ID.Scoria) wetMudScoria++;
for (let x = 38; x < 52; x++) if (typeAt(x, 29) === ID.Scoria) dryMudScoria++;
check('lava compacted wet mud beneath it into scoria', wetMudScoria > 0,
    `${wetMudScoria} contacted cells became scoria`);
check('lava compacted dry mud beneath it into scoria', dryMudScoria > 0,
    `${dryMudScoria} contacted cells became scoria`);

// ---------------------------------------------------------------------------

section('Lava is quenched by water into scoria and steam, and sets later');
// Lava does not go straight to stone. It chills into scoria - the dark red
// first stage, loose enough to be a powder - which sinks to the bottom and only
// hardens into stone once it has landed and cooled right down.
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(20, 38, 12, 4, ID.Lava);
run(30);
check('lava stays molten on its own', countOf(ID.Lava) > 40, `${countOf(ID.Lava)} lava`);
fillRect(20, 26, 12, 8, ID.Water);
run(120);
check('the lava chilled into scoria rather than straight into stone',
    countOf(ID.Scoria) > 10, `${countOf(ID.Scoria)} scoria, ${countOf(ID.Stone)} stone`);
check('steam was given off', countOf(ID.Steam) > 0, `${countOf(ID.Steam)} steam`);

section('A lump of lava dropped in water sinks as scoria before it sets');
// The whole chain, with little enough lava that all of it quenches rather than
// keeping a molten core under its own crust the way a pool of it does.
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(14, 18, 32, ROWS - 19, ID.Water);
run(300);
fillRect(28, 3, 3, 2, ID.Lava);

// Follow it down, watching what it is and where it is on the way.
let sawScoria = 0;
let sankAsScoria = false;
let setInMidWater = false;
let deepest = 0;
for (let f = 0; f < 400; f++) {
    stepSimulation();
    let scoriaLow = -1;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (typeAt(x, y) === ID.Scoria) scoriaLow = Math.max(scoriaLow, y);
            // Stone with water under it would be a slab hanging in the pond.
            if (typeAt(x, y) === ID.Stone && typeAt(x, y + 1) === ID.Water) setInMidWater = true;
        }
    }
    if (scoriaLow >= 0) {
        sawScoria++;
        if (scoriaLow > deepest) deepest = scoriaLow;
        if (deepest > 24) sankAsScoria = true;
    }
}

// Scoria buried under more scoria holds its heat, so give the heap time to
// finish setting before asking what it turned into.
run(1500);

check('it spent a good while as scoria rather than flashing straight to stone',
    sawScoria > 40, `it was scoria for ${sawScoria} frames`);
check('and it sank through the water while it was still scoria', sankAsScoria,
    `the lowest scoria reached row ${deepest} of ${ROWS - 1}`);
check('no stone was left hanging in the middle of the pond', !setInMidWater);
check('it finished as stone on the bottom', countOf(ID.Stone) >= 5 && countOf(ID.Scoria) === 0,
    `${countOf(ID.Stone)} stone, ${countOf(ID.Scoria)} scoria, ${countOf(ID.Lava)} lava`);
check('and it is sitting on the floor', (() => {
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (typeAt(x, y) !== ID.Stone) continue;
            const below = typeAt(x, y + 1);
            if (below !== ID.Wall && below !== ID.Stone) return false;
        }
    }
    return true;
})());

section('A lava flow in the open air cools slowly and all of a piece');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(18, ROWS - 5, 14, 4, ID.Lava);
const pouredLava = countOf(ID.Lava);

// Slowly: a flow does not set the moment it is poured. Nor does the air
// temperature drive it - it starts far hotter than anything around it and gives
// up its heat at its own rate.
run(300);
check('it is still molten five seconds later', countOf(ID.Lava) > pouredLava * 0.8,
    `${countOf(ID.Lava)} of ${pouredLava} still lava`);

run(900);
check('and then chills into scoria', countOf(ID.Scoria) > 0,
    `${countOf(ID.Scoria)} scoria, ${countOf(ID.Lava)} lava`);

// All of a piece: the middle of a flow should not stay molten under a crust
// while the edges have already set.
run(4000);
check('and given long enough the whole flow is stone',
    countOf(ID.Lava) === 0 && countOf(ID.Scoria) === 0 && countOf(ID.Stone) > pouredLava * 0.8,
    `${countOf(ID.Stone)} stone, ${countOf(ID.Scoria)} scoria, ${countOf(ID.Lava)} lava`);

section('A lava flow cools at its own rate, not the weather\'s');
// The same flow in bitterly cold air should take about as long as it did in
// mild air, because lava at 1150C does not care what the weather is doing.
setLayerLapse(0);
setAmbientTarget(20);
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(18, ROWS - 5, 14, 4, ID.Lava);
run(600);
const mildLeft = countOf(ID.Lava);

setAmbientTarget(-60);
run(1500);
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(18, ROWS - 5, 14, 4, ID.Lava);
run(600);
const coldLeft = countOf(ID.Lava);
// Not identical - the air still conducts a little heat away, and eighty degrees
// colder air conducts a little more - but nothing like the difference it would
// make if the weather were what drove the cooling.
check('freezing air did not come close to halving the time it takes',
    coldLeft > mildLeft * 0.5,
    `${mildLeft} lava left at 20C, ${coldLeft} left at -60C`);

// Put the weather back. The air drifts towards the dial rather than jumping to
// it, so it has to be given the time to get there - otherwise every check after
// this one would be run in a world that is still freezing, and the next pond
// along would quietly turn to ice.
clearWorld();
setAmbientTarget(20);
run(2500);

section('Stone reheats through scoria and back into lava');
setLayerLapse(0);
fillRect(0, 0, COLS, ROWS, ID.Stone);
getWorld().temp.fill(200);
run(100);
check('warm stone becomes scoria first', countOf(ID.Scoria) > 0 && countOf(ID.Lava) === 0,
    `${countOf(ID.Scoria)} scoria, ${countOf(ID.Lava)} lava`);

clearWorld();
fillRect(0, 0, COLS, ROWS, ID.Scoria);
getWorld().temp.fill(1000);
run(30);
check('continued heating melts scoria into lava', countOf(ID.Lava) > 0,
    `${countOf(ID.Lava)} lava`);
setLayerLapse(2);

section('Thick insulating materials keep their interior temperature');
setLayerLapse(0);
fillRect(20, 14, 21, 17, ID.Glass);
const insulatedWorld = getWorld();
insulatedWorld.temp.fill(-40);
for (let y = 14; y < 31; y++) {
    for (let x = 20; x < 41; x++) insulatedWorld.temp[index(x, y)] = 300;
}
run(70);
let glassShell = 0;
let shellCells = 0;
let glassCore = 0;
let coreCells = 0;
for (let y = 14; y < 31; y++) {
    for (let x = 20; x < 41; x++) {
        const t = tempAt(x, y);
        if (x === 20 || x === 40 || y === 14 || y === 30) {
            glassShell += t;
            shellCells++;
        } else if (x >= 27 && x <= 33 && y >= 19 && y <= 25) {
            glassCore += t;
            coreCells++;
        }
    }
}
glassShell /= shellCells;
glassCore /= coreCells;
check('the exposed glass cooled while its layered interior retained heat',
    glassShell < 250 && glassCore > glassShell + 25,
    `shell ${glassShell.toFixed(1)}C, core ${glassCore.toFixed(1)}C`);
check('dense solids insulate more strongly than fluids and powders',
    defs[ID.Glass].bulkInsulation > defs[ID.Water].bulkInsulation &&
    defs[ID.Stone].bulkInsulation > defs[ID.Sand].bulkInsulation,
    `glass ${defs[ID.Glass].bulkInsulation}, water ${defs[ID.Water].bulkInsulation}`);
setLayerLapse(2);

// ---------------------------------------------------------------------------

section('Lava sets fire to what it touches and melts sand into glass');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, 40, 12, 4, ID.Wood);
fillRect(10, 36, 12, 3, ID.Lava);
fillRect(34, 40, 10, 4, ID.Sand);
fillRect(34, 36, 10, 3, ID.Lava);
run(120);
check('the wood caught light', countOf(ID.Wood) < 48, `${countOf(ID.Wood)} wood left`);
check('sand melted into glass', countOf(ID.Glass) > 0, `${countOf(ID.Glass)} glass`);

// ---------------------------------------------------------------------------

section('Ice melts at 0C, and not before');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(25, ROWS - 7, 6, 6, ID.Ice);
check('ice starts below freezing', tempAt(27, ROWS - 4) < 0, `${tempAt(27, ROWS - 4).toFixed(1)}C`);
run(200);
check('ice did not melt straight away at room temperature', countOf(ID.Ice) > 20,
    `${countOf(ID.Ice)} of 36 left after 200 frames`);
fillRect(23, ROWS - 4, 2, 3, ID.Fire);       // flames held against both sides
fillRect(31, ROWS - 4, 2, 3, ID.Fire);
run(200);
check('a flame melted the ice into water', countOf(ID.Water) > 0,
    `${countOf(ID.Water)} water, ${countOf(ID.Ice)} ice left`);

section('Water boils into steam at 100C');
// A pan of water on a hot plate: lava on the floor, a stone plate over it so
// that the lava is not quenched on contact, and the water sitting on top.
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Lava);
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 2, ID.Stone);
fillRect(20, ROWS - 6, 14, 4, ID.Water);
check('water starts at 30C', Math.abs(tempAt(25, ROWS - 4) - 30) < 0.001,
    `${tempAt(25, ROWS - 4).toFixed(1)}C`);
run(200);
check('the water boiled into steam', countOf(ID.Steam) > 0, `${countOf(ID.Steam)} steam`);

section('Steam hangs about for a good while before it condenses');
fillRect(20, 20, 14, 6, ID.Steam);           // steam on its own, no heat source
const steamStart = countOf(ID.Steam);
run(400);
check('it is still steam several seconds later', countOf(ID.Steam) === steamStart,
    `${steamStart} -> ${countOf(ID.Steam)}`);
let coolestSteam = Infinity;
let warmestSteam = -Infinity;
for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
        if (typeAt(x, y) !== ID.Steam) continue;
        const temperature = tempAt(x, y);
        coolestSteam = Math.min(coolestSteam, temperature);
        warmestSteam = Math.max(warmestSteam, temperature);
    }
}
check('steam cools at different rates', warmestSteam - coolestSteam > 4,
    `${(warmestSteam - coolestSteam).toFixed(1)}C spread`);
run(1400);
check('but it does condense in the end', countOf(ID.Steam) < steamStart / 2,
    `${steamStart} -> ${countOf(ID.Steam)}`);
check('some steam came back as water', countOf(ID.Water) > 0, `${countOf(ID.Water)} water`);
run(1800); // let the remaining steam reach its condensation point too
const steamWater = countOf(ID.Water);
check('some steam escaped instead of returning as water',
    steamWater < steamStart * 0.9,
    `${steamWater} water from ${steamStart} steam`);

section('Steam cools at the same rate at the edges as in the middle');
setLayerLapse(0);
fillRect(0, 0, COLS, ROWS, ID.Steam);
run(400);
let edgeHeat = 0;
let middleHeat = 0;
let heatSamples = 0;
for (let y = 8; y < ROWS - 8; y++) {
    for (let dx = 0; dx < 3; dx++) {
        edgeHeat += tempAt(dx, y) + tempAt(COLS - 1 - dx, y);
        middleHeat += tempAt(COLS / 2 - 1 + dx, y) * 2;
        heatSamples += 2;
    }
}
edgeHeat /= heatSamples;
middleHeat /= heatSamples;
check('the boundary does not act like an extra cold wall', Math.abs(edgeHeat - middleHeat) < 2,
    `edge ${edgeHeat.toFixed(1)}C, middle ${middleHeat.toFixed(1)}C`);
setLayerLapse(2);

section('Steam spreads out sideways and fills the room it is in');
// A sealed stone room with a puff of steam let go in the middle of the floor.
for (let x = 10; x < COLS - 10; x++) { setCell(x, 8, ID.Wall); setCell(x, ROWS - 4, ID.Wall); }
for (let y = 8; y <= ROWS - 4; y++) { setCell(10, y, ID.Wall); setCell(COLS - 11, y, ID.Wall); }
fillRect(28, ROWS - 7, 4, 2, ID.Steam);
run(300);
let steamLeft = COLS;
let steamRight = -1;
for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
        if (typeAt(x, y) !== ID.Steam) continue;
        steamLeft = Math.min(steamLeft, x);
        steamRight = Math.max(steamRight, x);
    }
}
const roomWidth = (COLS - 11) - 10 - 1;
check('it spread right out across the room rather than stacking in a column',
    steamRight - steamLeft + 1 > roomWidth / 2,
    `steam spans ${steamRight - steamLeft + 1} of a ${roomWidth} wide room`);

// ---------------------------------------------------------------------------

section('Acid eats through stone but not through glass');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, 30, 10, 6, ID.Stone);
fillRect(10, 24, 10, 3, ID.Acid);
fillRect(35, 30, 10, 6, ID.Glass);
fillRect(35, 24, 10, 3, ID.Acid);
run(200);
check('stone was dissolved', countOf(ID.Stone) < 60, `${countOf(ID.Stone)} stone left`);
check('glass survived', countOf(ID.Glass) === 60, `${countOf(ID.Glass)} glass left`);

// ---------------------------------------------------------------------------

section('Nothing escapes the edges of the world');
// Sand and ash only, so nothing can react and change the count.
fillRect(0, 0, COLS, 3, ID.Sand);
fillRect(0, 10, COLS, 3, ID.Ash);
const edgeStart = countOf(ID.Sand) + countOf(ID.Ash);
run(300);
check('nothing fell off the edge of the grid',
    countOf(ID.Sand) + countOf(ID.Ash) === edgeStart,
    `${edgeStart} -> ${countOf(ID.Sand) + countOf(ID.Ash)}`);

section('Sand gets wet, and that is as far as it goes');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(25, 30, 8, 5, ID.Sand);
fillRect(22, 20, 14, 9, ID.Water);       // far more water than the sand can hold
run(600);
check('dry sand soaked up water and became wet sand', countOf(ID['Wet Sand']) > 0,
    `${countOf(ID['Wet Sand'])} wet sand`);
check('however much water it sits in, wet sand never becomes mud',
    countOf(ID['Wet Mud']) === 0, `${countOf(ID['Wet Mud'])} wet mud`);

section('Wet ground dries out when heated');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(20, ROWS - 4, 16, 3, ID['Wet Mud']);
// Holding the heat ray on it, the way the brush does. The ray is meant to burn
// out in a few frames, so a single burst would just float away.
for (let f = 0; f < 250; f++) {
    for (let x = 20; x < 36; x++) setCell(x, ROWS - 5, ID['Heat Ray']);
    stepSimulation();
}
check('wet mud baked into dry mud', countOf(ID['Dry Mud']) > 0,
    `${countOf(ID['Dry Mud'])} dry mud, ${countOf(ID['Wet Mud'])} still wet`);

section('Wet mud holds a steeper pile than dry sand');
// Both start as the same tall narrow column. Dry sand should collapse into a
// wide shallow cone; wet mud should stay standing in a heap.
function pileHeight(id) {
    let tallest = 0;
    for (let x = 0; x < COLS; x++) {
        const top = surfaceOf(x, id);
        if (top >= 0 && ROWS - 1 - top > tallest) tallest = ROWS - 1 - top;
    }
    return tallest;
}
fillRect(38, ROWS - 17, 3, 16, ID.Sand);
run(500);
const sandPile = pileHeight(ID.Sand);
clearWorld();
fillRect(38, ROWS - 17, 3, 16, ID['Wet Mud']);
run(500);
const mudPile = pileHeight(ID['Wet Mud']);
check('wet mud stayed in a taller heap than dry sand', mudPile > sandPile + 1,
    `sand ${sandPile} cells high, wet mud ${mudPile} cells high`);

// ---------------------------------------------------------------------------

section('The heat ray sets wood alight and the cold ray freezes water');
fillRect(10, 20, 10, 8, ID.Wood);
fillRect(12, 28, 6, 2, ID['Heat Ray']);
run(150);
check('the heat ray set the wood alight', countOf(ID.Wood) < 80,
    `${countOf(ID.Wood)} of 80 wood left`);

clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(20, ROWS - 5, 16, 4, ID.Water);
run(20);
fillRect(20, ROWS - 9, 16, 3, ID['Cold Ray']);
run(250);
check('the cold ray froze the water into ice', countOf(ID.Ice) > 0,
    `${countOf(ID.Ice)} ice, ${countOf(ID.Water)} water`);

section('The ray tools do not pile up');
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
for (let f = 0; f < 120; f++) {
    for (let x = 25; x < 31; x++) setCell(x, 5, ID['Cold Ray']);
    for (let x = 40; x < 46; x++) setCell(x, 5, ID['Heat Ray']);
    stepSimulation();
}
run(120);
check('they burn out instead of collecting on the floor',
    countOf(ID['Cold Ray']) === 0 && countOf(ID['Heat Ray']) === 0,
    `${countOf(ID['Cold Ray'])} cold, ${countOf(ID['Heat Ray'])} heat left`);

section('The air temperature dial shifts gradually and can freeze a pond');
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 6, 40, 5, ID.Water);
setAmbientTarget(-40);
run(3);
check('the air does not snap to the new temperature', getAmbientTemp() > 15,
    `air is ${getAmbientTemp().toFixed(1)}C after 3 frames`);
run(900);
check('the air worked its way down to the new temperature', getAmbientTemp() < -30,
    `air is ${getAmbientTemp().toFixed(1)}C`);
check('the pond froze over', countOf(ID.Ice) > 0, `${countOf(ID.Ice)} ice`);

section('The air is not perfectly even from particle to particle');
setAmbientTarget(20);
setLayerLapse(0);       // layers off, so this measures the variance on its own
fillRect(10, 20, 40, 10, ID.Sand);
run(1500);                                  // long enough to settle at air temperature
let coldest = 1000;
let warmest = -1000;
for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
        if (typeAt(x, y) !== ID.Sand) continue;
        const t = tempAt(x, y);
        if (t < coldest) coldest = t;
        if (t > warmest) warmest = t;
    }
}
check('particles settle at slightly different temperatures', warmest - coldest > 0.5,
    `coldest ${coldest.toFixed(2)}C, warmest ${warmest.toFixed(2)}C`);
check('but the spread stays small', warmest - coldest <= 4.01,
    `spread is ${(warmest - coldest).toFixed(2)} degrees`);
check('and it stays centred on the air temperature',
    Math.abs((warmest + coldest) / 2 - 20) < 1.5,
    `middle of the spread is ${((warmest + coldest) / 2).toFixed(2)}C`);

section('The air is colder the higher up you go');
setLayerLapse(2);
setAmbientTarget(20);
// A column of stone from top to bottom, left to sit until it matches the air.
for (let y = 2; y < ROWS - 2; y++) setCell(30, y, ID.Stone);
run(2500);
const highUp = tempAt(30, 3);
const downLow = tempAt(30, ROWS - 3);
check('the top of the world is colder than the bottom', highUp < downLow - 4,
    `${highUp.toFixed(1)}C at the top, ${downLow.toFixed(1)}C at the bottom`);
check('about two degrees per fifth of the height', Math.abs((downLow - highUp) - 8) < 3,
    `${(downLow - highUp).toFixed(1)} degrees from top to bottom, expected about 8`);
check('and the middle still reads what the dial says',
    Math.abs(tempAt(30, Math.floor(ROWS / 2)) - 20) < 2.5,
    `${tempAt(30, Math.floor(ROWS / 2)).toFixed(1)}C halfway up`);

section('The layer slider makes the layering stronger or weaker');
setLayerLapse(6);
for (let y = 2; y < ROWS - 2; y++) setCell(30, y, ID.Stone);
run(2500);
const steepGap = tempAt(30, ROWS - 3) - tempAt(30, 3);
check('turning it up spreads the layers further apart', steepGap > 18,
    `${steepGap.toFixed(1)} degrees from top to bottom at 6 per fifth`);

setLayerLapse(0);
for (let y = 2; y < ROWS - 2; y++) setCell(30, y, ID.Stone);
run(2500);
const flatGap = Math.abs(tempAt(30, ROWS - 3) - tempAt(30, 3));
check('turning it off makes the air one even temperature', flatGap < 3,
    `${flatGap.toFixed(1)} degrees from top to bottom at 0 per fifth`);
setLayerLapse(2);

section('A flame still beats the weather');
// The air is set to freezing, but a fire held against wood should win: a
// particle next to you matters far more than the air temperature.
setAmbientTarget(-40);
fillRect(20, 20, 10, 8, ID.Wood);
fillRect(22, 28, 6, 2, ID.Fire);          // a fire held under it, as the brush would
run(200);
check('wood caught light in freezing air', countOf(ID.Wood) < 80,
    `${countOf(ID.Wood)} of 80 wood left, air ${getAmbientTemp().toFixed(0)}C`);
setAmbientTarget(20);
run(1);

// ---------------------------------------------------------------------------

section('Gunpowder flashes through itself and clears solid ground');
setAmbientTarget(20);
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 6, 40, 5, ID.Stone);
fillRect(10, ROWS - 9, 40, 3, ID.Gunpowder);
const stoneBefore = countOf(ID.Stone);
fillRect(12, ROWS - 8, 2, 1, ID.Fire);        // a spark dropped into one end of the trail
run(12);
const powderLeft = countOf(ID.Gunpowder);
check('the flash tore through the trail in a fraction of a second',
    powderLeft < 60, `${powderLeft} of 120 grains left after 12 frames`);
run(60);
// Give or take the odd grain at the far end of the trail, which can be left
// sitting there once the flame that would have reached it has burned out.
check('all the gunpowder went up', countOf(ID.Gunpowder) <= 6,
    `${countOf(ID.Gunpowder)} of 120 left`);
check('it blew a hole in the stone', countOf(ID.Stone) < stoneBefore - 40,
    `${stoneBefore} -> ${countOf(ID.Stone)} stone`);
check('it threw off sparks', countOf(ID.Spark) + countOf(ID.Fire) > 0,
    `${countOf(ID.Spark)} sparks, ${countOf(ID.Fire)} fire`);

section('An explosion cannot break through a wall');
clearWorld();
for (let y = 20; y < 40; y++) setCell(30, y, ID.Wall);
fillRect(24, 28, 5, 5, ID.Gunpowder);
fillRect(33, 28, 5, 5, ID.Wood);
fillRect(24, 33, 2, 1, ID.Fire);
run(80);
let wallLeft = 0;
for (let y = 20; y < 40; y++) if (typeAt(30, y) === ID.Wall) wallLeft++;
check('the wall survived the blast', wallLeft === 20, `${wallLeft} of 20 wall cells left`);
check('glass and ceramic use the same blast protection',
    defs[ID.Glass].blastProof && defs[ID.Ceramic].blastProof);

// ---------------------------------------------------------------------------

section('Metals melt into their own liquid forms and solidify again');
const metalPairs = [
    ['Copper', 'Molten Copper'],
    ['Aluminum', 'Molten Aluminum'],
    ['Iron', 'Molten Iron']
];
check('the three solid metals have distinct electrical conductivities',
    new Set(metalPairs.map(([solid]) => defs[ID[solid]].electricalConductivity)).size === 3);
check('ordinary materials are explicitly non-conductive',
    defs[ID.Stone].conductive === false && defs[ID.Water].conductive === false);
check('wire cells draw their configured grid load',
    defs[ID.Copper].powerConsumption === 1 &&
    defs[ID['Molten Copper']].powerConsumption === 1 &&
    defs[ID.Iron].powerConsumption === 0.5 &&
    defs[ID['Molten Iron']].powerConsumption === 0.5);
check('only non-aluminum metals can discharge a battery',
    defs[ID.Copper].dischargeBattery && defs[ID['Molten Copper']].dischargeBattery &&
    defs[ID.Iron].dischargeBattery && defs[ID['Molten Iron']].dischargeBattery &&
    !defs[ID.Aluminum].dischargeBattery && !defs[ID.Stone].dischargeBattery);

for (let n = 0; n < metalPairs.length; n++) {
    const [solid, liquid] = metalPairs[n];
    const x = 15 + n * 15;
    setCell(x, 15, ID[solid]);
    const i = index(x, 15);
    getWorld().temp[i] = defs[ID[solid]].meltPoint + 1000;
    getWorld().heat[i] = defs[ID[solid]].latent - 1;
    stepSimulation();
    check(`${solid} melts into ${liquid}`, typeAt(x, 15) === ID[liquid]);
}

clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, 30, ID.Wall);
for (let n = 0; n < metalPairs.length; n++) {
    const [solid, liquid] = metalPairs[n];
    const x = 15 + n * 15;
    setCell(x, 29, ID[liquid]);
    const i = index(x, 29);
    getWorld().temp[i] = defs[ID[liquid]].freezePoint - 100;
    getWorld().heat[i] = defs[ID[liquid]].latent - 1;
    stepSimulation();
    check(`${liquid} cools back into ${solid}`, typeAt(x, 29) === ID[solid]);
}

clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, 30, ID.Wall);
const rayMelted = new Set();
for (let n = 0; n < metalPairs.length; n++) {
    const [solid] = metalPairs[n];
    setCell(15 + n * 15, 29, ID[solid]);
}
for (let f = 0; f < 30; f++) {
    for (let n = 0; n < metalPairs.length; n++) {
        const [solid] = metalPairs[n];
        const liquid = `Molten ${solid}`;
        setCell(15 + n * 15, 28, ID['Heat Ray']);
        if (countOf(ID[liquid]) > 0) rayMelted.add(solid);
    }
    stepSimulation();
    for (const [solid, liquid] of metalPairs) {
        if (countOf(ID[liquid]) > 0) rayMelted.add(solid);
    }
}
check('the stronger Heat Ray can melt Aluminum, Copper and Iron',
    metalPairs.every(([solid]) => rayMelted.has(solid)));

// ---------------------------------------------------------------------------

section('A Spark sends a temporary power pulse to both ends of a metal wire');
check('Spark does not produce smoke when it expires', defs[ID.Spark].smokeChance === 0);
for (let x = 10; x <= 50; x++) setCell(x, 20, ID.Copper);
setCell(30, 19, ID.Spark);
stepSimulation();
check('the Spark is absorbed when it touches the wire', typeAt(30, 19) === EMPTY);
check('the contact point registers as powered', isPowered(30, 20));
let reachedLeft = false;
let reachedRight = false;
for (let f = 0; f < 35; f++) {
    stepSimulation();
    reachedLeft ||= isPowered(10, 20);
    reachedRight ||= isPowered(50, 20);
}
check('the pulse travelled away from the contact to both extremes', reachedLeft && reachedRight);
check('the power disappears after the pulse reaches the ends',
    !getWorld().power.some(value => value > 0) &&
    !getWorld().powerDelay.some(value => value > 0));

// ---------------------------------------------------------------------------

section('Aluminum stores and shares repeated Spark charge');
clearWorld();
for (let x = 10; x < 20; x++) setCell(x, 20, ID.Aluminum);
for (let n = 0; n < 5; n++) {
    setCell(15, 19, ID.Spark);
    stepSimulation();
}
const storedCharge = getStoredCharge(10, 20);
const expectedCharge = defs[ID.Aluminum].chargePerSpark * 5 / 10;
const connectedBattery = getConnectedAluminumCharge(10, 20);
check('the charge indicator reads the whole connected aluminum entity',
    connectedBattery && connectedBattery.capacity === defs[ID.Aluminum].chargeCapacity * 10 &&
    Math.abs(connectedBattery.charge - storedCharge * 10) < 0.001);
setCell(25, 20, ID.Aluminum);
const separateBattery = getConnectedAluminumCharge(25, 20);
check('a disconnected aluminum entity has its own battery reservoir',
    separateBattery && separateBattery.capacity === defs[ID.Aluminum].chargeCapacity &&
    separateBattery.charge === 0);
check('each Spark adds a fixed total charge shared across connected aluminum',
    Math.abs(storedCharge - expectedCharge) < 0.001,
    `${storedCharge.toFixed(2)} charge per cell`);
check('a larger aluminum mass has proportionally more total capacity',
    defs[ID.Aluminum].chargeCapacity * 10 ===
        defs[ID.Aluminum].chargeCapacity * 2 * 5);

setCell(20, 20, ID.Aluminum);
stepSimulation();
const balancedCharge = defs[ID.Aluminum].chargePerSpark * 5 / 11;
check('new aluminum draws from touching charged aluminum until charge is balanced',
    Math.abs(getStoredCharge(10, 20) - balancedCharge) < 0.001 &&
    Math.abs(getStoredCharge(20, 20) - balancedCharge) < 0.001,
    `${getStoredCharge(10, 20).toFixed(2)} old, ${getStoredCharge(20, 20).toFixed(2)} new`);
let emittedChargeSpark = false;
clearWorld();
for (let x = 10; x < 20; x++) {
    setCell(x, 20, ID.Aluminum);
    getWorld().charge[index(x, 20)] = defs[ID.Aluminum].chargeCapacity;
}
for (let f = 0; f < 1200; f++) {
    stepSimulation();
    emittedChargeSpark ||= countOf(ID.Spark) > 0;
}
check('charged aluminum occasionally emits visual sparks', emittedChargeSpark);
check('stored charge persists when no discharge metal is attached',
    Math.abs(getStoredCharge(10, 20) - defs[ID.Aluminum].chargeCapacity) < 0.001);
check('visual charge Sparks do not create smoke', countOf(ID.Smoke) === 0);

// ---------------------------------------------------------------------------

section('Copper and Iron draw power from touching charged Aluminum');
clearWorld();
setCell(10, 20, ID.Aluminum);
setCell(11, 20, ID.Copper);
setCell(12, 20, ID.Iron);
getWorld().charge[index(10, 20)] = 10;
stepSimulation();
check('the grid discharges its total copper-plus-iron load every tick',
    Math.abs(getStoredCharge(10, 20) - 9.985) < 0.001,
    `${getStoredCharge(10, 20).toFixed(3)} charge remains after a scaled 1.5-unit tick`);

clearWorld();
for (let x = 10; x < 15; x++) setCell(x, 20, ID.Aluminum);
for (let x = 15; x <= 30; x++) setCell(x, 20, ID.Copper);
for (let x = 10; x < 15; x++) getWorld().charge[index(x, 20)] = 4;
const batteryChargeBefore = Array.from({ length: 5 }, (_, n) =>
    getStoredCharge(10 + n, 20)).reduce((sum, value) => sum + value, 0);
let batteryPoweredFarEnd = false;
for (let f = 0; f < 160; f++) {
    stepSimulation();
    batteryPoweredFarEnd ||= isPowered(30, 20);
}
const batteryChargeAfter = Array.from({ length: 5 }, (_, n) =>
    getStoredCharge(10 + n, 20)).reduce((sum, value) => sum + value, 0);
check('touching Copper slowly drains the Aluminum reservoir',
    batteryChargeAfter < batteryChargeBefore && batteryChargeAfter === 0,
    `${batteryChargeBefore.toFixed(1)} -> ${batteryChargeAfter.toFixed(1)} total charge`);
check('battery power repeatedly reaches the far end of attached metal', batteryPoweredFarEnd);
run(50);
check('the attached metal stops receiving power once Aluminum is empty',
    !getWorld().power.some(value => value > 0) &&
    !getWorld().powerDelay.some(value => value > 0));

section('Spark Dust emits around itself and wears out pixel by pixel');
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
const sparkDust = defs[ID['Spark Dust']];
const savedSparkDustSettings = {
    sparkEmitterChance: sparkDust.sparkEmitterChance,
    life: sparkDust.life,
    lifeVariance: sparkDust.lifeVariance
};
sparkDust.sparkEmitterChance = 1;
sparkDust.life = 4;
sparkDust.lifeVariance = 0;
setCell(30, ROWS - 2, ID['Spark Dust']);
stepSimulation();
check('Spark Dust emits real Sparks around itself', countOf(ID.Spark) > 0);
run(8);
check('each Spark Dust pixel expires into Ash',
    countOf(ID['Spark Dust']) === 0 && countOf(ID.Ash) > 0);
Object.assign(sparkDust, savedSparkDustSettings);

section('Spark Block emits around itself and water suppresses it');
clearWorld();
const sparkBlock = defs[ID['Spark Block']];
const savedSparkBlockEmitterChance = sparkBlock.sparkEmitterChance;
const savedSparkBlockLifetime = {
    life: sparkBlock.life,
    lifeVariance: sparkBlock.lifeVariance,
    lifeTransitionAt: sparkBlock.lifeTransitionAt
};
sparkBlock.sparkEmitterChance = 1;
const blockX = 30;
const blockY = 20;
setCell(blockX, blockY, ID['Spark Block']);
setCell(blockX, blockY - 1, ID.Water);
for (const [x, y] of [
    [blockX - 1, blockY - 2], [blockX, blockY - 2], [blockX + 1, blockY - 2],
    [blockX - 1, blockY - 1], [blockX + 1, blockY - 1],
    [blockX - 1, blockY], [blockX + 1, blockY]
]) setCell(x, y, ID.Wall);
stepSimulation();
check('water touching a Spark Block suppresses its Sparks', countOf(ID.Spark) === 0);

getWorld().type[index(blockX, blockY - 1)] = EMPTY;
getWorld().life[index(blockX, blockY - 1)] = 0;
stepSimulation();
check('the Spark Block resumes when the water is cleared', countOf(ID.Spark) > 0);
check('the Spark Block lasts five times longer than Spark Dust',
    sparkBlock.life === sparkDust.life * 5 &&
    sparkBlock.lifeVariance === sparkDust.lifeVariance * 5);

clearWorld();
sparkBlock.sparkEmitterChance = 0;
sparkBlock.life = 20;
sparkBlock.lifeVariance = 0;
sparkBlock.lifeTransitionAt = 0.1;
setCell(blockX, blockY, ID['Spark Block']);
run(18);
check('a Spark Block becomes Spark Dust in its final tenth',
    typeAt(blockX, blockY) === ID['Spark Dust']);
sparkBlock.sparkEmitterChance = savedSparkBlockEmitterChance;
Object.assign(sparkBlock, savedSparkBlockLifetime);
sparkBlock.sparkEmitterChance = savedSparkBlockEmitterChance;

// ---------------------------------------------------------------------------

section('Plants grow, set seed, and the seed sprouts on wet mud');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(5, ROWS - 3, 50, 2, ID['Wet Mud']);
// A pool sunk into the mud beside it, held in by the mud on either side, so the
// plant has water at its roots and can set seed.
fillRect(26, ROWS - 3, 4, 2, ID.Water);
setCell(31, ROWS - 4, ID.Plant);
run(700);
check('the plant grew upwards', countOf(ID.Plant) + countOf(ID.Flower) > 3,
    `${countOf(ID.Plant)} stem cells, ${countOf(ID.Flower)} flowers`);

let tallest = ROWS;
for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) if (typeAt(x, y) === ID.Plant && y < tallest) tallest = y;
}
check('it stopped growing at a sensible height', tallest > ROWS - 25,
    `top of the plant is ${ROWS - 1 - tallest} cells above the ground`);

check('it flowered when it topped out', countOf(ID.Flower) > 0,
    `${countOf(ID.Flower)} flowers`);

run(2500);
check('a fully grown plant dropped seed that took root',
    countOf(ID.Plant) > 10, `${countOf(ID.Plant)} plant cells, ${countOf(ID.Seed)} loose seeds`);

section('Plants come up at different heights and flower in different colours');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(5, ROWS - 3, 50, 2, ID['Wet Mud']);
for (let x = 8; x < 52; x += 4) setCell(x, ROWS - 4, ID.Plant);
run(1200);

// Measured at the flowers, since a flower is what a finished plant ends in.
// Anything still growing, or a seedling that has just come up, is not done yet.
const heights = [];
for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
        if (typeAt(x, y) === ID.Flower) heights.push(ROWS - 3 - y);
    }
}
const tallestPlant = Math.max(...heights);
const shortestPlant = Math.min(...heights);
check('they grew to a range of heights', tallestPlant - shortestPlant >= 3,
    `${heights.length} finished plants, shortest ${shortestPlant}, tallest ${tallestPlant} cells`);
check('every height is in a sensible range', shortestPlant >= 4 && tallestPlant <= 20,
    `shortest ${shortestPlant}, tallest ${tallestPlant}`);

const flowerShades = new Set();
for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
        if (typeAt(x, y) === ID.Flower) {
            flowerShades.add(getWorld().shade[index(x, y)] % 12);
        }
    }
}
check('the flowers came out in a mix of colours', flowerShades.size >= 3,
    `${flowerShades.size} different colours across ${countOf(ID.Flower)} flowers`);

section('Seed on wet sand gives short grass with no flower');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(5, ROWS - 3, 50, 2, ID['Wet Sand']);
for (let x = 10; x < 46; x += 5) setCell(x, ROWS - 4, ID.Seed);
run(1200);
check('the seed came up as grass', countOf(ID.Grass) > 0,
    `${countOf(ID.Grass)} grass cells`);
check('grass does not flower', countOf(ID.Flower) === 0,
    `${countOf(ID.Flower)} flowers on sand`);

let tallestGrass = 0;
for (let x = 0; x < COLS; x++) {
    const top = surfaceOf(x, ID.Grass);
    if (top >= 0 && ROWS - 3 - top > tallestGrass) tallestGrass = ROWS - 3 - top;
}
check('grass tops out at about half the height of a plant', tallestGrass <= 10,
    `tallest grass ${tallestGrass} cells, a plant can reach 18`);

section('Grass never sets seed - only a proper plant does');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(5, ROWS - 3, 50, 2, ID['Wet Sand']);
fillRect(20, ROWS - 4, 6, 1, ID.Water);      // water right there, so it is not the reason
for (let x = 12; x < 40; x += 4) setCell(x, ROWS - 4, ID.Grass);
run(1500);
check('grass beside water still sets no seed', countOf(ID.Seed) === 0,
    `${countOf(ID.Seed)} seeds from ${countOf(ID.Grass)} grass cells`);

section('Ash wets into soil for short yellow grass');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(8, ROWS - 5, 44, 4, ID.Ash);
fillRect(14, ROWS - 8, 32, 2, ID.Water);
run(80);
check('water turns dry ash into wet ash', countOf(ID['Wet Ash']) > 0,
    `${countOf(ID['Wet Ash'])} wet ash`);

clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(5, ROWS - 3, 50, 2, ID['Wet Ash']);
for (let x = 10; x < 50; x += 3) setCell(x, ROWS - 4, ID.Seed);
run(1200);
check('seed on wet ash comes up as ash grass', countOf(ID['Ash Grass']) > 0,
    `${countOf(ID['Ash Grass'])} ash-grass cells`);
check('ash grass is yellower and at most half as tall as sand grass',
    defs[ID['Ash Grass']].rgb[0] > defs[ID.Grass].rgb[0] &&
    defs[ID['Ash Grass']].growHeight <= Math.ceil(defs[ID.Grass].growHeight / 2),
    `heights ${defs[ID['Ash Grass']].growHeight} and ${defs[ID.Grass].growHeight}`);

section('Plants and flowers die below zero; grass lasts to minus five');
setLayerLapse(0);
setAmbientTarget(-2);
run(1600);
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 5, 5, 4, ID.Plant);
fillRect(20, ROWS - 5, 5, 4, ID.Flower);
fillRect(30, ROWS - 5, 5, 4, ID.Grass);
getWorld().temp.fill(-2);
run(180);
check('plants died into dry sand below zero', countOf(ID.Plant) === 0,
    `${countOf(ID.Plant)} plant cells left`);
check('flowers died into dry sand below zero', countOf(ID.Flower) === 0,
    `${countOf(ID.Flower)} flower cells left`);
check('grass survived at minus two', countOf(ID.Grass) > 0,
    `${countOf(ID.Grass)} grass cells left`);

setAmbientTarget(-10);
run(1600);
getWorld().temp.fill(-10);
run(180);
check('grass died into dry sand below minus five', countOf(ID.Grass) === 0,
    `${countOf(ID.Grass)} grass cells left`);
check('cold-killed growth became dry sand', countOf(ID.Sand) > 0,
    `${countOf(ID.Sand)} sand cells`);
setAmbientTarget(20);
setLayerLapse(2);
run(1);

// ---------------------------------------------------------------------------

// Runs a steam vent for a while and reports the most snow and water seen at any
// one moment, since both go on to freeze or melt as the scene plays out.
function ventSteam(frames) {
    let peakSnow = 0;
    let peakWater = 0;
    for (let f = 0; f < frames; f++) {
        if (f < 200) fillRect(26, ROWS - 4, 8, 2, ID.Steam);
        stepSimulation();
        peakSnow = Math.max(peakSnow, countOf(ID.Snow));
        peakWater = Math.max(peakWater, countOf(ID.Water));
    }
    return { snow: peakSnow, water: peakWater };
}

section('Steam falls as snow when the air is below freezing');
setAmbientTarget(-15);
run(600);                                    // let the cold set in
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
const cold = ventSteam(1800);
check('it came down as snow', cold.snow > 20, `${cold.snow} snow at its heaviest`);

section('And as rain when the air is warm');
setAmbientTarget(25);
run(900);
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
const warm = ventSteam(1800);
check('no snow in warm air', warm.snow === 0, `${warm.snow} snow`);
check('it condensed as water instead', warm.water > 0, `${warm.water} water`);
setAmbientTarget(20);
run(1);

section('Snow lies where it falls while the air stays below freezing');
setAmbientTarget(-15);
run(600);
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 3, 30, 2, ID.Stone);
fillRect(14, ROWS - 8, 20, 3, ID.Snow);
const fell = countOf(ID.Snow);
run(900);
check('it is still snow a quarter of a minute later', countOf(ID.Snow) > fell * 0.8,
    `${fell} -> ${countOf(ID.Snow)} snow`);

// Same snow, same scene - just turn the weather up. No clearWorld here.
console.log('\nSnow melts once the air warms up');
setAmbientTarget(25);
run(2500);
check('the snow melted away', countOf(ID.Snow) === 0, `${countOf(ID.Snow)} snow left`);
check('and left water behind', countOf(ID.Water) > 0, `${countOf(ID.Water)} water`);
setAmbientTarget(20);
run(1);

section('Snow lands on water and melts into it at once');
setAmbientTarget(-10);
run(500);
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 4, 30, 3, ID.Water);
getWorld().temp.fill(-10);
for (let x = 14; x < 36; x++) setCell(x, ROWS - 6, ID.Snow);
const snowfall = countOf(ID.Snow);
run(30);
check('the snow that hit the water is gone', countOf(ID.Snow) < snowfall / 2,
    `${snowfall} -> ${countOf(ID.Snow)} snow`);
check('it turned into water rather than piling up', countOf(ID.Water) > 90,
    `${countOf(ID.Water)} water`);

section('Snow settles on ice and packs down into it');
setAmbientTarget(-10);
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 4, 30, 3, ID.Ice);
for (let x = 14; x < 36; x++) setCell(x, ROWS - 5, ID.Snow);
const iceBefore = countOf(ID.Ice);
run(40);
check('the snow sits on top of the ice at first', countOf(ID.Snow) > 10,
    `${countOf(ID.Snow)} snow still lying on it`);
run(3000);
check('over time it packs down into ice', countOf(ID.Ice) > iceBefore,
    `${iceBefore} -> ${countOf(ID.Ice)} ice, ${countOf(ID.Snow)} snow left`);
setAmbientTarget(20);
run(1);

// ---------------------------------------------------------------------------

section('Seed only sprouts on wet ground, not dry');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(5, ROWS - 3, 45, 2, ID['Dry Mud']);
for (let x = 10; x < 40; x += 3) setCell(x, ROWS - 4, ID.Seed);
run(600);
check('seed on dry mud stayed a seed', countOf(ID.Plant) + countOf(ID.Grass) === 0,
    `${countOf(ID.Plant) + countOf(ID.Grass)} sprouted on dry ground`);

section('Seed will not germinate in the cold');
// Turn the weather down and give the air a moment to follow, then start the
// whole scene off frozen. Sowing into ground that is still warm would prove
// nothing, since it would be fair enough for those seeds to come up.
setAmbientTarget(-20);
run(400);
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(5, ROWS - 3, 50, 2, ID['Wet Mud']);
for (let x = 10; x < 46; x += 5) setCell(x, ROWS - 4, ID.Seed);
getWorld().temp.fill(-20);
const sown = countOf(ID.Seed);
// Well short of the 30 seconds a seed keeps for, so anything that fails to
// come up here failed because of the cold and not because it had rotted.
run(700);
check('nothing came up in frozen ground', countOf(ID.Plant) === 0,
    `${countOf(ID.Plant)} plants at ${getAmbientTemp().toFixed(0)}C`);
check('the seed is still sitting there waiting', countOf(ID.Seed) === sown,
    `${countOf(ID.Seed)} of ${sown} seeds`);

// Warm it back up and the same seed should get going.
setAmbientTarget(25);
run(800);
check('the same seed germinated once the ground warmed up', countOf(ID.Plant) > 0,
    `${countOf(ID.Plant)} plants at ${getAmbientTemp().toFixed(0)}C`);
setAmbientTarget(20);

// ---------------------------------------------------------------------------

section('Water wets dry ground the instant it touches it');
setAmbientTarget(20);
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 4, 40, 3, ID.Sand);
fillRect(20, ROWS - 6, 6, 1, ID.Water);      // a few drops straight onto the sand
run(4);
check('the sand it landed on was wet at once', countOf(ID['Wet Sand']) > 0,
    `${countOf(ID['Wet Sand'])} wet sand after 4 frames`);

section('Water is used up as it filters into dry and wet ground');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(5, ROWS - 3, 50, 2, ID['Dry Mud']);
fillRect(10, ROWS - 10, 40, 4, ID.Water);
const pouredOn = countOf(ID.Water);
run(300);
const soakedAway = pouredOn - countOf(ID.Water);
check('some of the water was soaked up', soakedAway > 0,
    `${pouredOn} -> ${countOf(ID.Water)} water`);
check('the dry mud it reached turned wet', countOf(ID['Wet Mud']) > 0,
    `${countOf(ID['Wet Mud'])} wet mud`);

clearWorld();
for (let y = ROWS - 12; y < ROWS; y++) {
    setCell(28, y, ID.Wall);
    setCell(32, y, ID.Wall);
}
setCell(29, ROWS - 1, ID.Wall);
setCell(30, ROWS - 1, ID.Wall);
setCell(31, ROWS - 1, ID.Wall);
fillRect(29, ROWS - 9, 3, 8, ID['Wet Sand']);
setCell(30, ROWS - 10, ID.Water);
const wetColumn = countOf(ID['Wet Sand']);
run(1600);
check('water remains above a fully wet, supported column', countOf(ID.Water) === 1,
    `${countOf(ID.Water)} water left above the column`);
check('the wet powder was displaced rather than erased', countOf(ID['Wet Sand']) === wetColumn,
    `${wetColumn} -> ${countOf(ID['Wet Sand'])} wet sand`);

section('Water infiltration stops after 50 powder cells');
const normalPermeability = defs[ID['Wet Sand']].waterPermeability;
defs[ID['Wet Sand']].waterPermeability = 1;

// A one-cell shaft keeps the powder column upright while a drop travels down
// through exactly fifty wet cells. The dry 51st cell must never be touched.
createWorld(5, 53);
for (let y = 0; y < 53; y++) {
    setCell(1, y, ID.Wall);
    setCell(3, y, ID.Wall);
}
for (let x = 1; x <= 3; x++) setCell(x, 52, ID.Wall);
fillRect(2, 1, 1, 50, ID['Wet Sand']);
setCell(2, 51, ID.Sand);
setCell(2, 0, ID.Water);
run(80);
check('the 51st powder cell remains dry', typeAt(2, 51) === ID.Sand,
    `cell 51 became ${defs[typeAt(2, 51)]?.name || 'air'}`);
check('water stays above the saturated 50-cell column', countOf(ID.Water) === 1,
    `${countOf(ID.Water)} water left`);

// The bottom edge supports the material like a floor. Once all fifty cells are
// wet, surplus water is retained above them rather than escaping off-screen.
createWorld(5, 51);
for (let y = 0; y < 51; y++) {
    setCell(1, y, ID.Wall);
    setCell(3, y, ID.Wall);
}
fillRect(2, 1, 1, 50, ID['Wet Sand']);
setCell(2, 0, ID.Water);
run(80);
check('the bottom does not drain a saturated 50-cell layer', countOf(ID.Water) === 1,
    `${countOf(ID.Water)} water left`);
check('the complete 50-cell layer stays wet', countOf(ID['Wet Sand']) === 50,
    `${countOf(ID['Wet Sand'])} wet cells`);

defs[ID['Wet Sand']].waterPermeability = normalPermeability;
createWorld(COLS, ROWS);

section('Deep wet mud compacts into impermeable clay');
createWorld(5, 51);
fillRect(2, 1, 1, 50, ID['Wet Mud']);
run(2);
check('a 50-layer wet-mud column remains loose', countOf(ID.Clay) === 0,
    `${countOf(ID.Clay)} clay cells`);

createWorld(5, 52);
fillRect(2, 1, 1, 51, ID['Wet Mud']);
run(2);
check('the 51st supported layer compacts into clay', countOf(ID.Clay) === 1,
    `${countOf(ID.Clay)} clay cells`);
check('the upper fifty layers remain wet mud', countOf(ID['Wet Mud']) === 50,
    `${countOf(ID['Wet Mud'])} wet-mud cells`);

createWorld(5, 12);
for (let y = 0; y < 12; y++) {
    setCell(1, y, ID.Wall);
    setCell(3, y, ID.Wall);
}
setCell(2, 10, ID.Clay);
setCell(2, 9, ID.Water);
run(200);
check('water cannot penetrate clay', typeAt(2, 10) === ID.Clay && countOf(ID.Water) === 1,
    `${countOf(ID.Water)} water, ${countOf(ID.Clay)} clay`);

section('Firing turns clay into ceramic, then extreme heat melts it');
createWorld(5, 5);
setCell(2, 4, ID.Clay);
for (let frame = 0; frame < 80 && typeAt(2, 4) === ID.Clay; frame++) {
    getWorld().temp[index(2, 4)] = 700;
    stepSimulation();
}
check('clay fires into ceramic above 600C', typeAt(2, 4) === ID.Ceramic,
    `became ${defs[typeAt(2, 4)]?.name || 'air'}`);
for (let frame = 0; frame < 80 && typeAt(2, 4) === ID.Ceramic; frame++) {
    getWorld().temp[index(2, 4)] = 1000;
    stepSimulation();
}
check('ceramic behaves like glass and melts into lava above 800C', typeAt(2, 4) === ID.Lava,
    `became ${defs[typeAt(2, 4)]?.name || 'air'}`);

createWorld(COLS, ROWS);

section('Wet sand never turns into mud - mud only comes from dry mud');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 4, 30, 3, ID['Wet Sand']);
fillRect(10, ROWS - 10, 30, 5, ID.Water);
run(900);
check('soaking wet sand does not make mud', countOf(ID['Wet Mud']) === 0,
    `${countOf(ID['Wet Mud'])} wet mud appeared`);

clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 4, 30, 3, ID['Dry Mud']);
fillRect(10, ROWS - 10, 30, 5, ID.Water);
run(300);
check('dry mud does', countOf(ID['Wet Mud']) > 0, `${countOf(ID['Wet Mud'])} wet mud`);

// ---------------------------------------------------------------------------

section('A seed that never germinates rots down into dry mud');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 3, 30, 2, ID.Stone);      // bare stone: nothing can sprout here
for (let x = 12; x < 38; x += 3) setCell(x, ROWS - 4, ID.Seed);
const sownOnStone = countOf(ID.Seed);
run(1500);                                     // 25 seconds
check('the seed is still there before its time is up', countOf(ID.Seed) > 0,
    `${countOf(ID.Seed)} of ${sownOnStone} seeds after 25s`);
run(900);                                      // now past 30 seconds
check('it rotted away by 30 seconds', countOf(ID.Seed) === 0,
    `${countOf(ID.Seed)} seeds left after 40s`);
check('and left dry mud behind', countOf(ID['Dry Mud']) >= sownOnStone - 2,
    `${countOf(ID['Dry Mud'])} dry mud from ${sownOnStone} seeds`);

section('A seed on good ground germinates before it can rot');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 3, 30, 2, ID['Wet Mud']);
for (let x = 12; x < 38; x += 3) setCell(x, ROWS - 4, ID.Seed);
run(600);
check('it came up well inside its 30 seconds', countOf(ID.Plant) > 0,
    `${countOf(ID.Plant)} plant cells after 10s`);

// ---------------------------------------------------------------------------

section('Plants only set seed within reach of water');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 2, 6, 1, ID.Water);        // a puddle right beside it
setCell(13, ROWS - 4, ID.Flower);
run(1200);
check('a flower near water sets seed', countOf(ID.Seed) > 0,
    `${countOf(ID.Seed)} seeds`);

clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
setCell(30, ROWS - 4, ID.Flower);              // the same flower, nowhere near water
run(1200);
check('a flower with no water nearby sets none', countOf(ID.Seed) === 0,
    `${countOf(ID.Seed)} seeds on dry ground`);

section('Wet ground sits on dry ground without soaking into it');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 4, 30, 3, ID.Sand);          // dry sand underneath
fillRect(10, ROWS - 7, 30, 3, ID['Wet Sand']);   // wet sand resting on top
const dryUnderneath = countOf(ID.Sand);
run(400);
check('the dry sand underneath stayed dry', countOf(ID.Sand) >= dryUnderneath - 2,
    `${dryUnderneath} -> ${countOf(ID.Sand)} dry sand`);

section('Plants burn and can be dissolved by acid');
// Plants keep growing, so both of these count the growth first and then check
// that it drops away once the fire or the acid gets to it.
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(20, ROWS - 10, 8, 9, ID.Plant);
run(200);
const grownPlant = countOf(ID.Plant);
fillRect(22, ROWS - 4, 2, 1, ID.Fire);
run(300);
check('fire burned the plant back', countOf(ID.Plant) < grownPlant / 2,
    `${grownPlant} -> ${countOf(ID.Plant)}`);

// Plants keep putting on growth, so acid is measured against the same plant
// left alone for the same length of time.
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(22, ROWS - 4, 4, 3, ID.Plant);
run(800);
const leftAlone = countOf(ID.Plant);

clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(22, ROWS - 4, 4, 3, ID.Plant);
run(400);
fillRect(16, 2, 16, 6, ID.Acid);           // a slab of acid poured over the top
run(400);
check('acid held the plant back', countOf(ID.Plant) < leftAlone * 0.7,
    `${countOf(ID.Plant)} with acid, ${leftAlone} left alone`);

// ---------------------------------------------------------------------------

section('The wind blows loose things along and leaves fixed things alone');
setLayerLapse(0);
setAmbientTarget(20);
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(20, 20, 3, 3, ID.Sand);
fillRect(20, 26, 3, 3, ID['Wet Mud']);
fillRect(20, 32, 3, 3, ID.Stone);
fillRect(20, 12, 3, 3, ID.Steam);

function centreOf(id) {
    let total = 0;
    let count = 0;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (typeAt(x, y) === id) { total += x; count++; }
        }
    }
    return count === 0 ? null : total / count;
}

const before = {
    sand: centreOf(ID.Sand),
    mud: centreOf(ID['Wet Mud']),
    stone: centreOf(ID.Stone),
    steam: centreOf(ID.Steam)
};

// A gust dragged to the right, the way the mouse would.
for (let gust = 0; gust < 40; gust++) {
    for (const row of [13, 21, 27, 33]) applyWind(21, row, 1, 0, 5, 3);
    stepSimulation();
}

check('dry sand was blown downwind', centreOf(ID.Sand) > before.sand + 1,
    `sand moved from ${before.sand.toFixed(1)} to ${centreOf(ID.Sand).toFixed(1)}`);
check('steam was blown downwind', centreOf(ID.Steam) === null || centreOf(ID.Steam) > before.steam,
    `steam moved from ${before.steam.toFixed(1)}`);
check('wet mud stayed put', Math.abs(centreOf(ID['Wet Mud']) - before.mud) < 1,
    `wet mud moved from ${before.mud.toFixed(1)} to ${centreOf(ID['Wet Mud']).toFixed(1)}`);
check('stone did not budge', centreOf(ID.Stone) === before.stone,
    `stone moved from ${before.stone.toFixed(1)} to ${centreOf(ID.Stone).toFixed(1)}`);

section('The wind mixes the warm air at the bottom with the cold at the top');
setLayerLapse(6);
setAmbientTarget(20);
for (let y = 2; y < ROWS - 2; y++) setCell(30, y, ID.Stone);
run(2500);
const gapBefore = tempAt(30, ROWS - 4) - tempAt(30, 4);
// Drag the wind up and down the column, stirring as it goes.
for (let sweep = 0; sweep < 60; sweep++) {
    for (let y = 4; y < ROWS - 4; y += 3) applyWind(30, y, 0, sweep % 2 === 0 ? 1 : -1, 6, 4);
    stepSimulation();
}
const gapAfter = tempAt(30, ROWS - 4) - tempAt(30, 4);
check('the layers were stirred together', gapAfter < gapBefore * 0.8,
    `${gapBefore.toFixed(1)} degrees top to bottom before, ${gapAfter.toFixed(1)} after`);
setLayerLapse(2);

section('A stronger wind blows things further');
setLayerLapse(0);
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(20, ROWS - 6, 3, 3, ID.Sand);
const gentleStart = centreOf(ID.Sand);
for (let gust = 0; gust < 20; gust++) {
    applyWind(21, ROWS - 5, 1, 0, 5, 1);
    stepSimulation();
}
const gentleMove = centreOf(ID.Sand) - gentleStart;

clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(20, ROWS - 6, 3, 3, ID.Sand);
const strongStart = centreOf(ID.Sand);
for (let gust = 0; gust < 20; gust++) {
    applyWind(21, ROWS - 5, 1, 0, 5, 8);
    stepSimulation();
}
const strongMove = centreOf(ID.Sand) - strongStart;
check('turning the wind up moves things further', strongMove > gentleMove * 1.15,
    `moved ${gentleMove.toFixed(1)} cells at strength 1, ${strongMove.toFixed(1)} at strength 8`);
setLayerLapse(2);

section('The wind tool blows seeds about and shows where it has been');
setLayerLapse(0);
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
for (let n = 0; n < 12; n++) setCell(18 + n, ROWS - 2, ID.Seed);
const seedStart = centreOf(ID.Seed);
for (let gust = 0; gust < 60; gust++) {
    applyWind(24, ROWS - 2, 1, 0, 8, 4);
    stepSimulation();
}
check('seeds were blown downwind', centreOf(ID.Seed) > seedStart + 1,
    `seeds moved from ${seedStart.toFixed(1)} to ${centreOf(ID.Seed).toFixed(1)}`);

const trails = getWindTrails();
let litCells = 0;
for (let i = 0; i < trails.length; i++) if (trails[i] > 0) litCells++;
check('the gust left a visible trail behind it', litCells > 20, `${litCells} cells lit`);
for (let f = 0; f < 60; f++) decayWindTrails();
let stillLit = 0;
for (let i = 0; i < trails.length; i++) if (trails[i] > 0) stillLit++;
check('and the trail fades away again', stillLit === 0, `${stillLit} cells still lit`);

// The same heap of sand blown by the same gust three times over: once in the
// open, once with a pane of glass standing in front of it, and once with a
// plant there instead. Each gets a world to itself, because the wind is stopped
// along a whole row and two scenes sharing rows would shelter each other.
function blownSandMoves(putSomethingInTheWay) {
    for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
    fillRect(24, ROWS - 3, 4, 2, ID.Sand);
    if (putSomethingInTheWay) putSomethingInTheWay();
    for (let gust = 0; gust < 60; gust++) {
        applyWind(14, ROWS - 3, 1, 0, 22, 6);
        stepSimulation();
    }
    return centreOf(ID.Sand) - 25.5;
}

section('Solid things stop the wind; plants let it through');
setLayerLapse(0);
const inTheOpen = blownSandMoves(null);

section('Solid things stop the wind (behind glass)');
const behindGlass = blownSandMoves(() => {
    for (let y = ROWS - 6; y < ROWS - 1; y++) setCell(20, y, ID.Glass);
});

section('Solid things stop the wind (behind a plant)');
const behindPlant = blownSandMoves(() => {
    for (let y = ROWS - 6; y < ROWS - 1; y++) setCell(20, y, ID.Plant);
});

check('sand out in the open was blown along', inTheOpen > 1,
    `it moved ${inTheOpen.toFixed(1)} cells`);
check('a pane of glass in the way stopped the wind dead', behindGlass < 0.5,
    `it moved ${behindGlass.toFixed(1)} cells behind the glass`);
check('a plant in the way let the wind straight through', behindPlant > inTheOpen * 0.5,
    `${behindPlant.toFixed(1)} cells behind the plant against ${inTheOpen.toFixed(1)} in the open`);

section('A sealed box keeps the breeze out');
setLayerLapse(0);
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
// A glass box with loose sand inside it, and the same sand out in the open.
for (let x = 24; x <= 34; x++) { setCell(x, ROWS - 9, ID.Glass); setCell(x, ROWS - 2, ID.Glass); }
for (let y = ROWS - 9; y <= ROWS - 2; y++) { setCell(24, y, ID.Glass); setCell(34, y, ID.Glass); }
fillRect(26, ROWS - 4, 7, 2, ID.Sand);
fillRect(44, ROWS - 3, 7, 2, ID.Sand);

function spilledFrom(fromX, toX) {
    let n = 0;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (typeAt(x, y) === ID.Sand && (x < fromX || x > toX)) n++;
        }
    }
    return n;
}
const boxedBefore = spilledFrom(26, 32);
setAmbientWindOn(true);
run(5000);
setAmbientWindOn(false);

let insideTheBox = 0;
for (let y = ROWS - 8; y <= ROWS - 3; y++) {
    for (let x = 25; x <= 33; x++) if (typeAt(x, y) === ID.Sand) insideTheBox++;
}
check('the sand in the box is all still in the box', insideTheBox === 14,
    `${insideTheBox} of 14 grains still inside`);
check('while the sand in the open got blown about',
    spilledFrom(44, 50) > 0,
    `${spilledFrom(44, 50)} grains left the open heap`);
check('and nothing escaped the box', spilledFrom(26, 32) - boxedBefore >= 0);

section('The natural breeze carries the loose and leaves the wet alone');
setLayerLapse(0);
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
// Two banks side by side on the floor, so that each is only ever answering for
// itself. Stacking one on the other would have the top bank slide as the breeze
// ate the bank underneath it, which says nothing about whether the breeze can
// pick it up.
fillRect(26, ROWS - 3, 8, 2, ID.Sand);
fillRect(44, ROWS - 3, 8, 2, ID['Wet Mud']);
const breezeMudStart = centreOf(ID['Wet Mud']);

// Gusts come from either side as the mood takes them, so over a long enough
// stretch the middle of a sand bank ends up roughly where it started. What
// shows the breeze has been at work is the bank spreading out past the edges it
// was laid down between.
function spilledOutside(id, fromX, toX) {
    let n = 0;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (typeAt(x, y) === id && (x < fromX || x > toX)) n++;
        }
    }
    return n;
}
setAmbientWindOn(true);
let gustFrames = 0;
for (let f = 0; f < 5000; f++) {
    stepSimulation();
    if (isBreezeBlowing()) gustFrames++;
}
setAmbientWindOn(false);
check('gusts came and went rather than blowing without a break',
    gustFrames > 200 && gustFrames < 4000, `${gustFrames} of 5000 frames were gusting`);
check('the breeze carried dry sand off its bank',
    spilledOutside(ID.Sand, 26, 33) > 0,
    `${spilledOutside(ID.Sand, 26, 33)} grains ended up outside the bank`);
check('the breeze left the wet mud where it was',
    Math.abs(centreOf(ID['Wet Mud']) - breezeMudStart) < 0.5,
    `wet mud moved from ${breezeMudStart.toFixed(1)} to ${centreOf(ID['Wet Mud']).toFixed(1)}`);
check('and switching it off stops it', !isBreezeBlowing());

section('Roughly one seed in ten is born buoyant');
// Counted at the moment each one is placed, in open air, so nothing has had a
// chance to move: this is the toss of the coin itself rather than where the
// seeds ended up. A big sample, because the whole point is the proportion, and
// generous bounds, because it is a random draw and this is not a test of luck.
clearWorld();
let bornBuoyant = 0;
for (let n = 0; n < 400; n++) {
    const x = 5 + (n % 50);
    setCell(x, 5, ID.Seed);
    if (getWorld().data[index(x, 5)] === 1) bornBuoyant++;
}
check('about a tenth of them came up buoyant', bornBuoyant > 15 && bornBuoyant < 70,
    `${bornBuoyant} of 400 were born buoyant`);

section('Seeds settle it at birth: some float, the rest sink');
clearWorld();
fillRect(0, ROWS - 2, COLS, 2, ID.Wall);
fillRect(6, ROWS - 18, COLS - 12, 16, ID.Water);
run(200);
for (let n = 0; n < 40; n++) setCell(10 + (n % 40), 3, ID.Seed);
let floaters = 0;
let sinkers = 0;
for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
        if (typeAt(x, y) !== ID.Seed) continue;
        if (getWorld().data[index(x, y)] === 1) floaters++; else sinkers++;
    }
}
// Buoyancy is a one in ten chance, so a batch this size is mostly sinkers and
// may happen to hold no floaters at all. That the two kinds exist is settled by
// the proportion check above; what matters here is that each kind ends up where
// it belongs, which the two checks below measure.
check('nearly all of them came up as sinkers', sinkers > 20,
    `${floaters} floaters, ${sinkers} sinkers`);

run(500);
let riding = 0;
let onTheBed = 0;
for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
        if (typeAt(x, y) !== ID.Seed) continue;
        if (typeAt(x, y + 1) === ID.Water && typeAt(x, y - 1) === EMPTY) riding++;
        else if (typeAt(x, y + 1) === ID.Wall) onTheBed++;
    }
}
// Not every last one, since a seed can fetch up in a corner or on a ledge, but
// the great majority should have found where they belong.
check('the floaters ended up riding on the surface', riding >= floaters * 0.7,
    `${riding} of ${floaters} floaters are on the surface`);
check('and the sinkers ended up on the bottom', onTheBed >= sinkers * 0.7,
    `${onTheBed} of ${sinkers} sinkers are on the bed`);

section('No seed is ever left hanging in the air');
// A blob of them dropped into open space, buoyant and not, the way a brushful
// lands. Buoyancy is about water: away from it every one of them falls, and two
// buoyant seeds resting on each other must not take turns swapping upwards
// instead of coming down.
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
for (let dy = 0; dy < 5; dy++) {
    for (let dx = 0; dx < 9; dx++) setCell(24 + dx, 4 + dy, ID.Seed);
}
run(250);
let hanging = 0;
for (let y = 0; y < ROWS - 1; y++) {
    for (let x = 0; x < COLS; x++) {
        if (typeAt(x, y) === ID.Seed && typeAt(x, y + 1) === EMPTY) hanging++;
    }
}
check('every one of them came to rest on something', hanging === 0,
    `${hanging} seeds are still in mid air`);

section('A seed on the bed of a pond comes up as a lily');
fillRect(0, ROWS - 4, COLS, 4, ID['Wet Mud']);
fillRect(4, ROWS - 22, COLS - 8, 18, ID.Water);
run(60);
// Keep trying until one of them comes up a sinker, since which it is, is the
// seed's own business.
// A handful of sinkers spread along the bed. One seed on its own is a coin
// toss - it may come up buoyant and float off, or simply never germinate in the
// time given - and none of that is what this section is about.
for (let spot = 0; spot < 5; spot++) {
    const x = 12 + spot * 8;
    for (let attempt = 0; attempt < 200; attempt++) {
        setCell(x, ROWS - 5, ID.Seed);
        if (getWorld().data[index(x, ROWS - 5)] === 0) break;
    }
}
run(2200);
check('it climbed as a netted stem rather than as an ordinary plant',
    countOf(ID['Lily Stem']) > 8,
    `${countOf(ID['Lily Stem'])} stem cells, ${countOf(ID.Plant)} plant cells`);
check('the stem weaves rather than going straight up like a stalk', (() => {
    let left = COLS;
    let right = -1;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (typeAt(x, y) !== ID['Lily Stem']) continue;
            left = Math.min(left, x);
            right = Math.max(right, x);
        }
    }
    return right - left >= 1;
})());
check('it reached the surface and opened out',
    countOf(ID['Lily Pad']) + countOf(ID['Lily Flower']) > 0,
    `${countOf(ID['Lily Pad'])} pads, ${countOf(ID['Lily Flower'])} flower cells`);
check('and finished with a bloom broader than one cell',
    countOf(ID['Lily Flower']) === 0 || countOf(ID['Lily Flower']) >= 3,
    `${countOf(ID['Lily Flower'])} flower cells`);

section('A brushful of seeds in a pond all come up as lilies, not pondweed');
// The scene as it actually gets built: a bed of wet mud, water over it, and a
// brushful of seeds dropped in together. Each seed lands with others packed
// around it, and used to mistake its own neighbours overhead for a lid and come
// up as an ordinary plant.
fillRect(0, ROWS - 6, COLS, 6, ID['Wet Mud']);
fillRect(3, ROWS - 26, COLS - 6, 20, ID.Water);
run(300);
// A generous scattering: around one in ten seeds come up buoyant and never
// reach the bed at all, and the ones that do sink want elbow room from each
// other, so a thin sprinkling makes for a flaky count.
for (let dy = 0; dy < 4; dy++) {
    for (let dx = 0; dx < 30; dx++) setCell(12 + dx, 2 + dy, ID.Seed);
}
run(3500);
check('lilies came up out of the bed', countOf(ID['Lily Stem']) > 8,
    `${countOf(ID['Lily Stem'])} lily stem cells against ${countOf(ID.Plant)} plant cells`);
check('the lilies reached the top of the water',
    countOf(ID['Lily Pad']) + countOf(ID['Lily Flower']) > 0,
    `${countOf(ID['Lily Pad'])} pads and ${countOf(ID['Lily Flower'])} flower cells`);
// A net is mostly holes. Measuring how much of the width it spans is actually
// filled in is the difference between a mesh and a solid green wall.
check('the netting is open enough to see the water through it', (() => {
    let cells = 0;
    let span = 0;
    for (let y = 0; y < ROWS; y++) {
        let first = -1;
        let last = -1;
        for (let x = 0; x < COLS; x++) {
            if (typeAt(x, y) !== ID['Lily Stem']) continue;
            if (first < 0) first = x;
            last = x;
            cells++;
        }
        if (first >= 0) span += last - first + 1;
    }
    return span === 0 || cells / span < 0.65;
})());

section('Acid gives off toxic fumes as it eats');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(18, ROWS - 9, 22, 8, ID.Wood);
fillRect(20, ROWS - 13, 18, 3, ID.Acid);
let peakFumes = 0;
for (let f = 0; f < 400; f++) { stepSimulation(); peakFumes = Math.max(peakFumes, countOf(ID['Toxic Gas'])); }
check('fumes came off the dissolving wood', peakFumes > 10, `${peakFumes} at its thickest`);

section('Toxic fumes rise and spread the way a gas should');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(28, ROWS - 4, 4, 3, ID['Toxic Gas']);
run(150);
let fumeTop = ROWS;
let fumeLeft = COLS;
let fumeRight = -1;
for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
        if (typeAt(x, y) !== ID['Toxic Gas']) continue;
        fumeTop = Math.min(fumeTop, y);
        fumeLeft = Math.min(fumeLeft, x);
        fumeRight = Math.max(fumeRight, x);
    }
}
check('it rose', fumeTop < ROWS - 10, `the top of it reached row ${fumeTop}`);
check('and it spread out sideways as it went', fumeRight - fumeLeft > 8,
    `it spans ${fumeRight - fumeLeft + 1} cells`);

section('Toxic fumes wither anything growing into bare sand');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(0, ROWS - 3, COLS, 2, ID['Wet Mud']);
// One of each green thing, standing in a row with room for the gas between.
for (let x = 10; x < 46; x += 3) {
    for (let y = ROWS - 8; y < ROWS - 3; y++) setCell(x, y, ID.Plant);
    setCell(x, ROWS - 9, ID.Flower);
    setCell(x + 1, ROWS - 4, ID.Grass);
    setCell(x + 1, ROWS - 5, ID['Lily Pad']);
}
const greenBefore = countOf(ID.Plant) + countOf(ID.Flower) + countOf(ID.Grass) + countOf(ID['Lily Pad']);
const sandBefore = countOf(ID.Sand);
let fumesReleased = 0;
for (let x = 10; x < 46; x++) {
    for (let y = ROWS - 5; y < ROWS - 3; y++) {
        if (typeAt(x, y) !== EMPTY) continue;
        setCell(x, y, ID['Toxic Gas']);
        fumesReleased++;
    }
}
run(250);
const withered = countOf(ID.Sand) - sandBefore;
check('the fumes killed green things off', withered > 10,
    `${withered} cells of green turned to sand, out of ${greenBefore}`);
check('and they took plants, grass, flowers and lily alike', (() => {
    // Whatever is left of each kind, something of each must have gone.
    return countOf(ID.Flower) < greenBefore && countOf(ID['Lily Pad']) < 12;
})(), `${countOf(ID.Flower)} flowers and ${countOf(ID['Lily Pad'])} pads left`);

section('Toxic fumes are not used up by what they kill');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(0, ROWS - 3, COLS, 2, ID['Wet Mud']);
for (let x = 12; x < 44; x += 2) for (let y = ROWS - 7; y < ROWS - 3; y++) setCell(x, y, ID.Plant);
let released = 0;
for (let x = 12; x < 20; x++) {
    for (let y = ROWS - 5; y < ROWS - 3; y++) {
        if (typeAt(x, y) !== EMPTY) continue;
        setCell(x, y, ID['Toxic Gas']);
        released++;
    }
}
const sandWas = countOf(ID.Sand);
run(120);
check('the gas is still there after doing its work',
    countOf(ID['Toxic Gas']) >= released * 0.5 && countOf(ID.Sand) > sandWas,
    `${released} released, ${countOf(ID['Toxic Gas'])} left, ` +
    `${countOf(ID.Sand) - sandWas} cells withered`);

section('Smoke lingers and eventually settles as ash');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(24, ROWS - 7, 12, 5, ID.Smoke);
const smokeReleased = countOf(ID.Smoke);
run(600);
check('smoke lasts far longer than it used to', countOf(ID.Smoke) === smokeReleased,
    `${smokeReleased} -> ${countOf(ID.Smoke)} smoke after ten seconds`);
run(1800);
check('old smoke leaves ash instead of vanishing', countOf(ID.Ash) > 0,
    `${countOf(ID.Ash)} ash left behind`);

section('Toxic gas lingers and eventually settles as acid');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(24, ROWS - 7, 12, 5, ID['Toxic Gas']);
const toxicReleased = countOf(ID['Toxic Gas']);
run(600);
check('toxic gas remains after ten seconds', countOf(ID['Toxic Gas']) === toxicReleased,
    `${toxicReleased} -> ${countOf(ID['Toxic Gas'])} toxic gas`);
run(2400);
const acidFromGas = countOf(ID.Acid);
check('old toxic gas leaves some acid instead of vanishing', acidFromGas > 0,
    `${acidFromGas} acid left behind`);
check('only a minority of toxic gas becomes acid', acidFromGas < toxicReleased * 0.5,
    `${acidFromGas} acid from ${toxicReleased} toxic gas`);

section('Loose ground does not sort itself into bands');
// Powders weighed against each other used to trade places until they lay in
// order of weight. Poured on top of one another they should simply stay in the
// order they landed in.
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(24, ROWS - 4, 12, 3, ID['Wet Mud']);
fillRect(24, ROWS - 7, 12, 3, ID.Sand);
fillRect(24, ROWS - 10, 12, 3, ID['Dry Mud']);
run(600);

function meanHeightOf(id) {
    let total = 0;
    let count = 0;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) if (typeAt(x, y) === id) { total += y; count++; }
    }
    return count === 0 ? null : total / count;
}
check('the heaviest did not sink to the bottom',
    meanHeightOf(ID['Wet Mud']) > meanHeightOf(ID.Sand) &&
    meanHeightOf(ID.Sand) > meanHeightOf(ID['Dry Mud']),
    `wet mud ${meanHeightOf(ID['Wet Mud']).toFixed(1)}, sand ` +
    `${meanHeightOf(ID.Sand).toFixed(1)}, dry mud ${meanHeightOf(ID['Dry Mud']).toFixed(1)}`);

section('Powders still sink through water, which is a fluid and not a powder');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 14, 20, 12, ID.Water);
run(150);
fillRect(14, ROWS - 18, 6, 3, ID.Sand);
run(300);
const settledSand = meanHeightOf(ID.Sand) ?? meanHeightOf(ID['Wet Sand']);
check('sand poured into water settled underneath it',
    settledSand !== null && settledSand > meanHeightOf(ID.Water),
    `sand ${settledSand === null ? 'gone' : settledSand.toFixed(1)}, ` +
    `water ${meanHeightOf(ID.Water).toFixed(1)}`);

section('The same seed on the same mud out of the water is an ordinary plant');
fillRect(0, ROWS - 4, COLS, 4, ID['Wet Mud']);
run(20);
for (let attempt = 0; attempt < 400; attempt++) {
    setCell(30, ROWS - 5, ID.Seed);
    if (getWorld().data[index(30, ROWS - 5)] === 0) break;
}
run(900);
check('a dry bank grows a plant, not a lily',
    countOf(ID.Plant) > 0 && countOf(ID['Lily Stem']) === 0,
    `${countOf(ID.Plant)} plant cells, ${countOf(ID['Lily Stem'])} stem cells`);

section('A plant only grows while some part of it is in wet ground');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
setCell(12, ROWS - 2, ID['Dry Mud']);
setCell(12, ROWS - 3, ID.Plant);
getWorld().data[index(12, ROWS - 3)] = 14;
setCell(34, ROWS - 2, ID['Wet Mud']);
setCell(34, ROWS - 3, ID.Plant);
getWorld().data[index(34, ROWS - 3)] = 14;
run(1200);

function highestPlantIn(fromX, toX) {
    for (let y = 0; y < ROWS; y++) {
        for (let x = fromX; x <= toX; x++) {
            if (typeAt(x, y) === ID.Plant || typeAt(x, y) === ID.Flower) return y;
        }
    }
    return ROWS;
}
check('the one in dry ground never put on a cell',
    highestPlantIn(6, 20) === ROWS - 3, `it reached row ${highestPlantIn(6, 20)}`);
check('the one in wet ground climbed',
    highestPlantIn(28, 42) < ROWS - 6, `it reached row ${highestPlantIn(28, 42)}`);

section('Grass that reaches wet mud grows on as a wet mud plant');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
setCell(20, ROWS - 2, ID['Wet Sand']);
setCell(21, ROWS - 2, ID['Wet Mud']);
setCell(20, ROWS - 3, ID.Grass);
getWorld().data[index(20, ROWS - 3)] = 8;
run(1200);
check('the growth above it came up as the richer plant', countOf(ID.Plant) > 2,
    `${countOf(ID.Grass)} grass cells, ${countOf(ID.Plant)} plant cells`);

section('Lava has to land before it can set');
setAmbientTarget(-60);
setLayerLapse(0);
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
// A drip let go from high up in freezing air. It passes the temperature it
// would set at long before it lands.
setCell(30, 2, ID.Lava);
let setInMidAir = false;
for (let f = 0; f < 400; f++) {
    stepSimulation();
    for (let y = 0; y < ROWS - 2; y++) {
        if (typeAt(30, y) === ID.Stone && typeAt(30, y + 1) === EMPTY) setInMidAir = true;
    }
    if (typeAt(30, ROWS - 2) !== EMPTY) break;
}
check('it never turned to stone with nothing underneath it', !setInMidAir);
run(900);
// It may have crept a cell or two along the floor before it set.
let stoneOnFloor = 0;
for (let x = 0; x < COLS; x++) if (typeAt(x, ROWS - 2) === ID.Stone) stoneOnFloor++;
check('and it set once it had landed', stoneOnFloor > 0 && countOf(ID.Lava) === 0,
    `${stoneOnFloor} stone on the floor, ${countOf(ID.Lava)} lava left`);
setAmbientTarget(20);
setLayerLapse(2);

section('Air layering can be switched off');
setLayerLapse(6);
setAmbientTarget(20);
run(1200);
const layeredGap = getAirTempAt(ROWS - 1) - getAirTempAt(0);
check('layered air is warmer at the bottom than the top', layeredGap > 10,
    `${layeredGap.toFixed(1)} degrees between floor and ceiling`);

setAirLayersOn(false);
check('switching layers off makes the air even everywhere',
    getAirTempAt(0) === getAirTempAt(ROWS - 1),
    `${getAirTempAt(0).toFixed(1)} at the top, ${getAirTempAt(ROWS - 1).toFixed(1)} at the bottom`);

setAirLayersOn(true);
check('and switching it back on leaves the slider setting where it was',
    getLayerLapse() === 6 && getAirTempAt(ROWS - 1) - getAirTempAt(0) === layeredGap);
setLayerLapse(2);

section('Grass with only wet sand under it stays grass');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
setCell(20, ROWS - 2, ID['Wet Sand']);
setCell(20, ROWS - 3, ID.Grass);
getWorld().data[index(20, ROWS - 3)] = 8;
run(1200);
check('no wet mud nearby means no promotion',
    countOf(ID.Grass) > 2 && countOf(ID.Plant) === 0,
    `${countOf(ID.Grass)} grass cells, ${countOf(ID.Plant)} plant cells`);

// ---------------------------------------------------------------------------

console.log('\nSpeed (260 x 150 wide grid)');
createWorld(260, 150);
for (let y = 60; y < 150; y++) {
    for (let x = 0; x < 260; x++) {
        setCell(x, y, (x + y) % 3 === 0 ? ID.Sand : ID.Water);
    }
}
fillRect(80, 40, 20, 8, ID.Fire);
const started = process.hrtime.bigint();
run(200);
const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
const perFrame = elapsedMs / 200;
console.log(`  ${perFrame.toFixed(2)} ms per frame  (budget for 60fps is 16.7 ms)`);
check('a full world simulates comfortably inside a 60fps frame', perFrame < 8,
    `${perFrame.toFixed(2)} ms`);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
