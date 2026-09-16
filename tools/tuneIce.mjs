// Ice has to do two opposite things well: survive for a while at room
// temperature, and melt quickly against a flame. This measures both.
import { readFileSync } from 'fs';
import { prepareDefinitions, createWorld, getWorld, clearWorld, stepSimulation, setCell } from '../physics.js';

const json = JSON.parse(readFileSync(new URL('../particles.json', import.meta.url), 'utf8'));
const tweaks = JSON.parse(process.argv[2] || '{}');
for (const name in tweaks) Object.assign(json.particles[name], tweaks[name]);

const defs = prepareDefinitions(json);
const ID = {};
defs.forEach((d, i) => { if (d && i > 0) ID[d.name] = i; });

createWorld(60, 45);
const ROWS = 45, COLS = 60;
const count = id => { let n = 0; const t = getWorld().type; for (let i = 0; i < t.length; i++) if (t[i] === id) n++; return n; };
const fill = (x0, y0, w, h, id) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setCell(x, y, id); };

function setup() {
    clearWorld();
    for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
    fill(25, ROWS - 7, 6, 6, ID.Ice);
}

// How long a block of ice lasts on its own at room temperature.
setup();
let survived = 0;
for (let f = 0; f < 3000; f++) {
    stepSimulation();
    if (count(ID.Ice) > 18) survived = f;
}
console.log(`  room temperature: half the block still frozen after ${survived} frames (${(survived / 60).toFixed(1)}s)`);

// How often a single burst of flame melts it.
let melted = 0;
const trials = 30;
for (let trial = 0; trial < trials; trial++) {
    setup();
    fill(23, ROWS - 4, 2, 3, ID.Fire);
    fill(31, ROWS - 4, 2, 3, ID.Fire);
    for (let f = 0; f < 200; f++) stepSimulation();
    if (count(ID.Water) > 0) melted++;
}
console.log(`  one burst of flame melted it in ${melted} of ${trials} trials  ${JSON.stringify(tweaks)}`);
