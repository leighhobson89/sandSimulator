import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
    prepareDefinitions, createWorld, setRandomSeed, setCell, stepSimulation
} from '../physics.js';
import { estimateWorldMemoryBytes } from '../worldConfig.js';

export const PROFILE_SIZES = Object.freeze([
    Object.freeze({ cols: 260, rows: 150 }),
    Object.freeze({ cols: 520, rows: 300 }),
    Object.freeze({ cols: 1040, rows: 600 })
]);

const WARMUP_FRAMES = 20;
const SAMPLED_FRAMES = 200;
const SEED = 0;

export function summarizeSamples(samples) {
    if (!Array.isArray(samples) || samples.length === 0 || !samples.every(value =>
        Number.isFinite(value) && value >= 0)) {
        throw new RangeError('Timing samples must be a non-empty array of non-negative finite numbers.');
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const medianMs = sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
    const p95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1];

    return {
        averageMs: samples.reduce((total, value) => total + value, 0) / samples.length,
        medianMs,
        p95Ms
    };
}

function createFixture(cols, rows, ids) {
    const firstFilledRow = Math.floor(rows * 0.4);
    for (let y = firstFilledRow; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            setCell(x, y, (x + y) % 3 === 0 ? ids.sand : ids.water);
        }
    }

    const fireX = Math.floor(cols * (80 / 260));
    const fireY = Math.floor(rows * (40 / 150));
    const fireWidth = Math.max(1, Math.round(cols * (20 / 260)));
    const fireHeight = Math.max(1, Math.round(rows * (8 / 150)));
    for (let y = fireY; y < Math.min(rows, fireY + fireHeight); y++) {
        for (let x = fireX; x < Math.min(cols, fireX + fireWidth); x++) {
            setCell(x, y, ids.fire);
        }
    }
}

function profileWorld({ cols, rows }, ids) {
    setRandomSeed(SEED);
    const allocationStarted = process.hrtime.bigint();
    createWorld(cols, rows);
    const allocationMs = Number(process.hrtime.bigint() - allocationStarted) / 1e6;

    createFixture(cols, rows, ids);
    for (let frame = 0; frame < WARMUP_FRAMES; frame++) stepSimulation();

    const samples = [];
    for (let frame = 0; frame < SAMPLED_FRAMES; frame++) {
        const started = process.hrtime.bigint();
        stepSimulation();
        samples.push(Number(process.hrtime.bigint() - started) / 1e6);
    }

    const cells = cols * rows;
    const timings = summarizeSamples(samples);
    return {
        cols,
        rows,
        cells,
        allocationMs,
        ...timings,
        msPerCell: timings.averageMs / cells,
        estimatedMemoryBytes: estimateWorldMemoryBytes(cells)
    };
}

export function runScaleProfile() {
    const particles = JSON.parse(readFileSync(new URL('../particles.json', import.meta.url), 'utf8'));
    const definitions = prepareDefinitions(particles);
    const ids = {
        sand: definitions.findIndex(definition => definition?.name === 'Sand'),
        water: definitions.findIndex(definition => definition?.name === 'Water'),
        fire: definitions.findIndex(definition => definition?.name === 'Fire')
    };
    if (Object.values(ids).some(id => id <= 0)) throw new Error('Scale profile materials are missing.');

    console.log('Scale profile: deterministic physics-only workload; informational, not a performance gate.');
    console.log(`Node ${process.version}; warm-up ${WARMUP_FRAMES} frames; samples ${SAMPLED_FRAMES} frames per size.`);
    console.log('Rendering and SVG overlays are not measured. Memory is an estimate, not process RSS.');

    for (const size of PROFILE_SIZES) {
        const result = profileWorld(size, ids);
        const memoryMiB = result.estimatedMemoryBytes / (1024 * 1024);
        console.log(
            `${result.cols}x${result.rows} (${result.cells.toLocaleString()} cells): ` +
            `create ${result.allocationMs.toFixed(2)} ms; ` +
            `step avg ${result.averageMs.toFixed(3)} ms, ` +
            `median ${result.medianMs.toFixed(3)} ms, ` +
            `p95 ${result.p95Ms.toFixed(3)} ms, ` +
            `${result.msPerCell.toExponential(3)} ms/cell; ` +
            `modelled world+render memory ${memoryMiB.toFixed(2)} MiB`
        );
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    if (process.argv.length > 2) {
        throw new Error('Scale profile has no CLI options; its dimensions are fixed in the tool.');
    }
    runScaleProfile();
}
