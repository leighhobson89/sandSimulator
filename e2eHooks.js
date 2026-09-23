import {
    captureSimulationState, restoreSimulationState, getWorld, getDefinitions,
    getFrameCount, getRandomSeed, setRandomSeed, stepSimulation, index
} from './physics.js';
import { getGridCols, getGridRows, getElements } from './constantsAndGlobalVars.js';
import { renderWorld } from './game.js';

const HOOK_VERSION = 1;

function copyArray(value) {
    return Array.from(value || []);
}

function inspect() {
    const world = getWorld();
    if (!world) throw new Error('The game world is not initialized.');
    const typeCounts = {};
    for (const id of world.type) typeCounts[id] = (typeCounts[id] || 0) + 1;
    return {
        version: HOOK_VERSION,
        cols: world.cols,
        rows: world.rows,
        frameCount: getFrameCount(),
        randomSeed: getRandomSeed(),
        typeCounts,
        definitions: getDefinitions().map(def => def ? { id: def.id, name: def.name } : null),
        arrays: {
            type: copyArray(world.type),
            temp: copyArray(world.temp),
            life: copyArray(world.life),
            data: copyArray(world.data),
            power: copyArray(world.power),
            charge: copyArray(world.charge)
        }
    };
}

function canvasToCell({ x, y }) {
    const canvas = getElements().canvas;
    const rect = canvas.getBoundingClientRect();
    return {
        x: Math.floor(((x - rect.left) / rect.width) * getGridCols()),
        y: Math.floor(((y - rect.top) / rect.height) * getGridRows())
    };
}

function step(count = 1) {
    const frames = Math.max(0, Math.floor(Number(count)));
    for (let frame = 0; frame < frames; frame++) stepSimulation();
    renderWorld();
    return inspect();
}

function captureState() {
    const state = captureSimulationState();
    return {
        ...state,
        arrays: Object.fromEntries(Object.entries(state.arrays).map(([name, value]) => [name, copyArray(value)]))
    };
}

function restoreState(state) {
    restoreSimulationState(state);
    renderWorld();
    return inspect();
}

function cell(x, y) {
    const world = getWorld();
    if (x < 0 || y < 0 || x >= world.cols || y >= world.rows) return null;
    const at = index(x, y);
    return { x, y, index: at, type: world.type[at], temp: world.temp[at], life: world.life[at] };
}

window.__GAME_INSTANCE__ = Object.freeze({
    version: HOOK_VERSION,
    inspect,
    step,
    setRandomSeed,
    getRandomSeed,
    canvasToCell,
    cell,
    captureState,
    restoreState
});
