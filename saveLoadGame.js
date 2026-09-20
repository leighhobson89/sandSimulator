// Portable saves and the single local resume slot. Typed arrays are base64
// encoded inside JSON, then compressed with LZString's URI-safe codec.
import {
    getParticleTypeIdSelected, setParticleTypeIdSelected, getBrushSize, setBrushSize,
    getDrawMode, setDrawMode, getGrabberSize, setGrabberSize, getWindStrength,
    setWindStrength, getEraserOn, setEraserOn, getGrabberOn, setGrabberOn,
    getHeatViewOn, setHeatViewOn, getSimulationPaused, setSimulationPaused
} from './constantsAndGlobalVars.js';
import { captureSimulationState, restoreSimulationState } from './physics.js';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from './lzString.js';

export const AUTOSAVE_STORAGE_KEY = 'elemental-foundry.autosave.v1';
const SAVE_VERSION = 1;
const AUTOSAVE_INTERVAL_MS = 60_000;
const MAX_WORLD_CELLS = 2_000_000;
const ARRAY_TYPES = { Uint8Array, Uint16Array, Int16Array, Float32Array };

let autosaveTimer = null;
let autosaveEnabled = false;
let autosaveWriting = false;
let savingListener = () => {};

export function setSavingListener(listener) { savingListener = typeof listener === 'function' ? listener : () => {}; }

export function hasAutosave() {
    try { return !!localStorage.getItem(AUTOSAVE_STORAGE_KEY); } catch { return false; }
}

export function createSaveString() {
    const payload = {
        format: 'elemental-foundry', version: SAVE_VERSION, savedAt: new Date().toISOString(),
        simulation: encodeSimulation(captureSimulationState()),
        tools: {
            particleId: getParticleTypeIdSelected(), brushSize: getBrushSize(), drawMode: getDrawMode(),
            grabberSize: getGrabberSize(), windStrength: getWindStrength(), eraserOn: getEraserOn(),
            grabberOn: getGrabberOn(), heatViewOn: getHeatViewOn(), paused: getSimulationPaused()
        }
    };
    return compressToEncodedURIComponent(JSON.stringify(payload));
}

export function loadSaveString(compressed) {
    if (typeof compressed !== 'string' || !compressed.trim()) throw new Error('Paste a save string first.');
    let payload;
    try {
        const json = decompressFromEncodedURIComponent(compressed.trim().replace(/\s/g, ''));
        if (!json) throw new Error('Cannot decompress');
        payload = JSON.parse(json);
    } catch { throw new Error('That is not a valid Elemental Foundry save string.'); }
    if (payload?.format !== 'elemental-foundry' || payload.version !== SAVE_VERSION) {
        throw new Error('This save was made by an unsupported version of Elemental Foundry.');
    }
    restoreSimulationState(decodeSimulation(payload.simulation));
    restoreTools(payload.tools);
    return payload;
}

export async function restoreAutosave() {
    let compressed;
    try { compressed = localStorage.getItem(AUTOSAVE_STORAGE_KEY); }
    catch { throw new Error('Local storage is not available in this browser.'); }
    if (!compressed) throw new Error('There is no resume game saved on this device.');
    const payload = loadSaveString(compressed);
    startAutosave();
    return payload;
}

// The regular autosave always runs once per minute. saveNow is only used when
// a player explicitly chooses a new resume target, so that choice is durable.
export function startAutosave({ saveNow = false } = {}) {
    if (!storageWorks()) return false;
    autosaveEnabled = true;
    if (autosaveTimer) clearInterval(autosaveTimer);
    autosaveTimer = setInterval(() => { void writeAutosave(); }, AUTOSAVE_INTERVAL_MS);
    if (saveNow) void writeAutosave();
    return true;
}

export function stopAutosave() {
    autosaveEnabled = false;
    if (autosaveTimer) clearInterval(autosaveTimer);
    autosaveTimer = null;
}

export function clearAutosave() {
    try { localStorage.removeItem(AUTOSAVE_STORAGE_KEY); } catch { /* unavailable storage */ }
}

export function isAutosaveEnabled() { return autosaveEnabled; }

export async function replaceAutosaveWithCurrentGame() {
    clearAutosave();
    if (!startAutosave()) throw new Error('Local storage is not available in this browser.');
    await writeAutosave();
}

export async function writeAutosave() {
    if (!autosaveEnabled || autosaveWriting || !storageWorks()) return false;
    autosaveWriting = true;
    savingListener(true);
    await nextPaint();
    try {
        localStorage.setItem(AUTOSAVE_STORAGE_KEY, createSaveString());
        return true;
    } catch (error) {
        console.warn('Could not autosave Elemental Foundry game:', error);
        stopAutosave();
        return false;
    } finally {
        autosaveWriting = false;
        savingListener(false);
    }
}

function storageWorks() {
    try {
        const probe = `${AUTOSAVE_STORAGE_KEY}.probe`;
        localStorage.setItem(probe, '1'); localStorage.removeItem(probe);
        return true;
    } catch { return false; }
}

function nextPaint() {
    return new Promise(resolve => {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(resolve);
        else setTimeout(resolve, 0);
    });
}

function encodeSimulation(simulation) {
    const arrays = {};
    for (const [name, value] of Object.entries(simulation.arrays)) {
        arrays[name] = { type: value.constructor.name, data: arrayToBase64(value) };
    }
    return { ...simulation, arrays };
}

function decodeSimulation(simulation) {
    if (!simulation || !Number.isInteger(simulation.cols) || !Number.isInteger(simulation.rows) ||
        simulation.cols < 1 || simulation.rows < 1 || simulation.cols * simulation.rows > MAX_WORLD_CELLS) {
        throw new Error('This save has invalid world dimensions.');
    }
    const arrays = {};
    for (const [name, encoded] of Object.entries(simulation.arrays || {})) {
        const Type = ARRAY_TYPES[encoded?.type];
        if (!Type || typeof encoded.data !== 'string') throw new Error(`This save has invalid ${name} data.`);
        arrays[name] = base64ToArray(encoded.data, Type);
    }
    return { ...simulation, arrays };
}

function arrayToBase64(array) {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
}

function base64ToArray(value, Type) {
    let binary;
    try { binary = atob(value); } catch { throw new Error('This save contains malformed binary data.'); }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (bytes.byteLength % Type.BYTES_PER_ELEMENT !== 0) throw new Error('This save contains malformed binary data.');
    return new Type(bytes.buffer);
}

function restoreTools(tools = {}) {
    if (Number.isInteger(tools.particleId)) setParticleTypeIdSelected(tools.particleId);
    if (Number.isFinite(tools.brushSize)) setBrushSize(tools.brushSize);
    setDrawMode(tools.drawMode);
    if (Number.isFinite(tools.grabberSize)) setGrabberSize(tools.grabberSize);
    if (Number.isFinite(tools.windStrength)) setWindStrength(tools.windStrength);
    setEraserOn(!!tools.eraserOn); setGrabberOn(!!tools.grabberOn);
    setHeatViewOn(!!tools.heatViewOn); setSimulationPaused(!!tools.paused);
}
