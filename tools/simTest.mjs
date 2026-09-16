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
    setLayerLapse, applyWind, EMPTY
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

section('Lava is quenched by water into stone and steam');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(20, 38, 12, 4, ID.Lava);
run(30);
check('lava stays molten on its own', countOf(ID.Lava) > 40, `${countOf(ID.Lava)} lava`);
fillRect(20, 26, 12, 8, ID.Water);
run(120);
check('the lava turned to stone', countOf(ID.Stone) > 10, `${countOf(ID.Stone)} stone`);
check('steam was given off', countOf(ID.Steam) > 0, `${countOf(ID.Steam)} steam`);

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

section('Steam cools as it rises and condenses back into water');
fillRect(20, 20, 14, 6, ID.Steam);           // steam on its own, no heat source
const steamStart = countOf(ID.Steam);
run(600);
check('the steam condensed', countOf(ID.Steam) < steamStart / 2,
    `${steamStart} -> ${countOf(ID.Steam)}`);
check('it came back as water', countOf(ID.Water) > 0, `${countOf(ID.Water)} water`);

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
check('all the gunpowder went up', countOf(ID.Gunpowder) <= 3,
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
const cold = ventSteam(700);
check('it came down as snow', cold.snow > 20, `${cold.snow} snow at its heaviest`);

section('And as rain when the air is warm');
setAmbientTarget(25);
run(900);
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
const warm = ventSteam(700);
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

section('Water is used up as it soaks in, about half the time');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(5, ROWS - 3, 50, 2, ID['Dry Mud']);
fillRect(10, ROWS - 10, 40, 4, ID.Water);
const pouredOn = countOf(ID.Water);
run(300);
const soakedAway = pouredOn - countOf(ID.Water);
check('some of the water was soaked up', soakedAway > 0,
    `${pouredOn} -> ${countOf(ID.Water)} water`);
check('but not all of it', countOf(ID.Water) > 0,
    `${countOf(ID.Water)} water left`);
check('the dry mud it reached turned wet', countOf(ID['Wet Mud']) > 0,
    `${countOf(ID['Wet Mud'])} wet mud`);

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
check('turning the wind up moves things further', strongMove > gentleMove * 1.5,
    `moved ${gentleMove.toFixed(1)} cells at strength 1, ${strongMove.toFixed(1)} at strength 8`);
setLayerLapse(2);

// ---------------------------------------------------------------------------

console.log('\nSpeed (200 x 150 grid, the size the game runs at)');
createWorld(200, 150);
for (let y = 60; y < 150; y++) {
    for (let x = 0; x < 200; x++) {
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
