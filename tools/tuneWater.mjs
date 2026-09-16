// How long water takes to settle. Measures the frames needed for a poured
// blob to flatten out, which is what "settles too slowly" is about.
import { readFileSync } from 'fs';
import { prepareDefinitions, createWorld, getWorld, clearWorld, stepSimulation, setCell, index } from '../physics.js';

const json = JSON.parse(readFileSync(new URL('../particles.json', import.meta.url), 'utf8'));
const tweaks = JSON.parse(process.argv[2] || '{}');
for (const name in tweaks) Object.assign(json.particles[name], tweaks[name]);

const defs = prepareDefinitions(json);
const ID = {};
defs.forEach((d, i) => { if (d && i > 0) ID[d.name] = i; });

const COLS = 120, ROWS = 90;
createWorld(COLS, ROWS);
const typeAt = (x, y) => getWorld().type[index(x, y)];

function surfaceSpread() {
    let lowest = ROWS, highest = -1;
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            if (typeAt(x, y) === ID.Water) {
                if (y < lowest) lowest = y;
                if (y > highest) highest = y;
                break;
            }
        }
    }
    return highest - lowest;
}

function framesToSettle(label, build) {
    clearWorld();
    for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
    build();
    for (let f = 1; f <= 2000; f++) {
        stepSimulation();
        if (f > 20 && surfaceSpread() <= 1) {
            console.log(`  ${label}: level after ${f} frames (${(f / 60).toFixed(1)}s)`);
            return f;
        }
    }
    console.log(`  ${label}: still not level after 2000 frames (spread ${surfaceSpread()})`);
    return 2000;
}

console.log(JSON.stringify(tweaks));
framesToSettle('tall narrow column collapsing', () => {
    for (let y = 30; y < ROWS - 1; y++) for (let x = 58; x < 64; x++) setCell(x, y, ID.Water);
});
framesToSettle('blob dropped to one side', () => {
    for (let y = 20; y < 50; y++) for (let x = 10; x < 40; x++) setCell(x, y, ID.Water);
});
