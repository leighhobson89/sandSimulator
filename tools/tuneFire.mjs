// Measures how reliably a small flame sets a block of wood alight.
import { readFileSync } from 'fs';
import { prepareDefinitions, createWorld, getWorld, clearWorld, stepSimulation, setCell } from '../physics.js';

const json = JSON.parse(readFileSync(new URL('../particles.json', import.meta.url), 'utf8'));

const tweaks = JSON.parse(process.argv[2] || '{}');
for (const name in tweaks) Object.assign(json.particles[name], tweaks[name]);

const defs = prepareDefinitions(json);
const ID = {};
defs.forEach((d, i) => { if (d && i > 0) ID[d.name] = i; });

createWorld(60, 45);
const count = id => { let n = 0; const t = getWorld().type; for (let i = 0; i < t.length; i++) if (t[i] === id) n++; return n; };

let lit = 0;
const trials = 40;
for (let trial = 0; trial < trials; trial++) {
    clearWorld();
    for (let y = 20; y < 28; y++) for (let x = 20; x < 30; x++) setCell(x, y, ID.Wood);
    for (let x = 24; x < 26; x++) setCell(x, 28, ID.Fire);
    for (let f = 0; f < 120; f++) stepSimulation();
    if (count(ID.Wood) < 80) lit++;
}
console.log(`caught alight in ${lit} of ${trials} trials  ${JSON.stringify(tweaks)}`);
