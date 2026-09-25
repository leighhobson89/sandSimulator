// Portable saves and the single local resume slot. Typed arrays are base64
// encoded inside JSON, then compressed with LZString's URI-safe codec.
import {
    getParticleTypeIdSelected, setParticleTypeIdSelected, getBrushSize, setBrushSize,
    getDrawMode, setDrawMode, getGrabberSize, setGrabberSize,
    setGeneralWindStrength, setGustWindStrength,
    getEraserOn, setEraserOn, getGrabberOn, setGrabberOn,
    getVisualizationMode, setVisualizationMode, VISUALIZATION_MODES,
    getHeatViewOn, getSimulationPaused, setSimulationPaused
} from './constantsAndGlobalVars.js';
import {
    captureSimulationState, restoreSimulationState,
    getGeneralWindStrength as getPhysicsGeneralWindStrength,
    getGustWindStrength as getPhysicsGustWindStrength,
    setGeneralWindStrength as setPhysicsGeneralWindStrength,
    setGustWindStrength as setPhysicsGustWindStrength
} from './physics.js';
import { BLUEPRINT_FIELDS, BLUEPRINT_SLOT_COUNT } from './game.js';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from './lzString.js';

export const AUTOSAVE_STORAGE_KEY = 'elemental-foundry.autosave.v1';
const SAVE_VERSION = 2;
const AUTOSAVE_INTERVAL_MS = 5 * 60_000;
const MAX_WORLD_CELLS = 2_000_000;
const ARRAY_TYPES = { Uint8Array, Uint16Array, Uint32Array, Int16Array, Float32Array };
const BLUEPRINT_FIELD_TYPES = {
    type: Uint8Array, temp: Float32Array, life: Int16Array, lifeMax: Int16Array,
    residue: Uint8Array, shade: Uint8Array, heat: Float32Array, surface: Int16Array,
    data: Uint8Array, machineSetting: Float32Array, storageType: Uint8Array, storageCount: Uint16Array,
    storageFlowRemainder: Float32Array,
    machinePortEndpointRemap: Uint8Array, machinePortEndpointSlot: Uint8Array,
    machinePortLeadRemap: Uint32Array, machinePortLeadSlot: Uint8Array,
    sprinklerLaunchDirection: Uint8Array, sprinklerLaunchAge: Uint8Array,
    splitterOutputFlowA: Float32Array, splitterOutputFlowB: Float32Array,
    sprinklerSprayFlow9: Float32Array, sprinklerSprayFlow8: Float32Array,
    sprinklerSprayFlow7: Float32Array, sprinklerSprayFlow6: Float32Array,
    sprinklerSprayFlow5: Float32Array, sprinklerSprayFlow4: Float32Array,
    sprinklerSprayFlow3: Float32Array,
    mixerInputTypeA: Uint8Array, mixerInputCountA: Uint16Array, mixerInputFlowA: Float32Array,
    mixerInputTypeB: Uint8Array, mixerInputCountB: Uint16Array, mixerInputFlowB: Float32Array,
    mixerOutputCountA: Uint16Array, mixerOutputCountB: Uint16Array,
    mixerOutputTypeA: Uint8Array, mixerOutputTypeB: Uint8Array, mixerOutputMixed: Uint8Array,
    mixerOutputFlow: Float32Array, mixerNextInput: Uint8Array,
    mixerOutputNext: Uint8Array,
    power: Uint8Array,
    powerDelay: Uint16Array, charge: Float32Array,
    wind: Uint8Array, airflowX: Float32Array, airflowY: Float32Array,
    airflowNextX: Float32Array, airflowNextY: Float32Array
};

let autosaveTimer = null;
let autosaveEnabled = false;
let autosaveWriting = false;
let autosaveGeneration = 0;
let savingListener = () => {};
let autosaveErrorListener = () => {};
let blueprintStateProvider = () => null;
let blueprintStateRestorer = () => {};

export function setSavingListener(listener) { savingListener = typeof listener === 'function' ? listener : () => {}; }
export function setAutosaveErrorListener(listener) {
    autosaveErrorListener = typeof listener === 'function' ? listener : () => {};
}

// The blueprint library belongs to the UI, whereas this module owns the save
// wire format. These hooks keep that boundary clean while including the same
// library in both the local resume slot and portable save strings.
export function setBlueprintSaveHandlers({ capture, restore } = {}) {
    blueprintStateProvider = typeof capture === 'function' ? capture : () => null;
    blueprintStateRestorer = typeof restore === 'function' ? restore : () => {};
}

export function hasAutosave() {
    try { return !!localStorage.getItem(AUTOSAVE_STORAGE_KEY); } catch { return false; }
}

export function createSaveString() {
    const blueprints = encodeBlueprintState(blueprintStateProvider());
    const payload = {
        format: 'elemental-foundry', version: SAVE_VERSION, savedAt: new Date().toISOString(),
        simulation: encodeSimulation(captureSimulationState()),
        tools: {
            particleId: getParticleTypeIdSelected(), brushSize: getBrushSize(), drawMode: getDrawMode(),
            grabberSize: getGrabberSize(),
            generalWindStrength: getPhysicsGeneralWindStrength(),
            gustWindStrength: getPhysicsGustWindStrength(),
            eraserOn: getEraserOn(),
            grabberOn: getGrabberOn(), visualizationMode: getVisualizationMode(),
            heatViewOn: getHeatViewOn(), paused: getSimulationPaused()
        }
    };
    if (blueprints) payload.blueprints = blueprints;
    return compressToEncodedURIComponent(JSON.stringify(payload));
}

// Parsing is separate from restoration so callers can ask for confirmation
// before an imported world replaces the one currently on screen.
export function parseSaveString(compressed) {
    if (typeof compressed !== 'string' || !compressed.trim()) throw new Error('Paste a save string first.');
    let payload;
    try {
        const json = decompressFromEncodedURIComponent(compressed.trim().replace(/\s/g, ''));
        if (!json) throw new Error('Cannot decompress');
        payload = JSON.parse(json);
    } catch { throw new Error('That is not a valid Elemental Foundry save string.'); }
    if (payload?.format !== 'elemental-foundry' ||
        ![1, SAVE_VERSION].includes(payload.version)) {
        throw new Error('This save was made by an unsupported version of Elemental Foundry.');
    }
    // Validate the simulation now, while no live state has been changed.
    decodeSimulation(payload.simulation);
    decodeBlueprintState(payload.blueprints, payload.version);
    return payload;
}

export function restoreSavePayload(payload) {
    const simulation = decodeSimulation(payload.simulation);
    if (payload.version === 1) simulation.sprinklerModeVersion = 1;
    restoreSimulationState(simulation);
    restoreTools(payload.tools);
    blueprintStateRestorer(decodeBlueprintState(payload.blueprints, payload.version));
    return payload;
}

export function loadSaveString(compressed) {
    return restoreSavePayload(parseSaveString(compressed));
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

// The regular autosave always runs every five minutes. saveNow is only used when
// a player explicitly chooses a new resume target, so that choice is durable.
export function startAutosave({ saveNow = false, checkStorage = true } = {}) {
    if (checkStorage && !storageWorks()) {
        stopAutosave();
        return false;
    }
    autosaveEnabled = true;
    autosaveGeneration++;
    if (autosaveTimer) clearInterval(autosaveTimer);
    autosaveTimer = setInterval(() => { void writeAutosave(); }, AUTOSAVE_INTERVAL_MS);
    if (saveNow) void writeAutosave();
    return true;
}

export function stopAutosave() {
    autosaveEnabled = false;
    autosaveGeneration++;
    if (autosaveTimer) clearInterval(autosaveTimer);
    autosaveTimer = null;
}

export function clearAutosave() {
    try { localStorage.removeItem(AUTOSAVE_STORAGE_KEY); } catch { /* unavailable storage */ }
}

export function isAutosaveEnabled() { return autosaveEnabled; }

export async function replaceAutosaveWithCurrentGame() {
    // Serialize before touching the resume slot. localStorage.setItem is atomic:
    // a quota failure leaves the previous string in place.
    try {
        const replacement = createSaveString();
        localStorage.setItem(AUTOSAVE_STORAGE_KEY, replacement);
    } catch (error) {
        stopAutosave();
        throw new Error(`The resume game could not be saved (${error?.message || 'local storage rejected the save'}).`);
    }
    startAutosave({ checkStorage: false });
}

export async function writeAutosave() {
    if (!autosaveEnabled || autosaveWriting) return false;
    if (!storageWorks()) {
        const error = new Error('Local storage is not available in this browser.');
        stopAutosave();
        autosaveErrorListener(error);
        return false;
    }
    const generation = autosaveGeneration;
    autosaveWriting = true;
    savingListener(true);
    try {
        await nextPaint();
        if (!autosaveEnabled || generation !== autosaveGeneration) return false;
        localStorage.setItem(AUTOSAVE_STORAGE_KEY, createSaveString());
        return true;
    } catch (error) {
        console.warn('Could not autosave Elemental Foundry game:', error);
        stopAutosave();
        autosaveErrorListener(error);
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

function encodeBlueprintState(state) {
    if (!state?.slots) return null;
    const slots = Array.from({ length: BLUEPRINT_SLOT_COUNT }, (_, slot) => {
        const blueprint = state.slots[slot];
        if (!blueprint) return null;
        const cells = {};
        for (const field of BLUEPRINT_FIELDS) {
            const array = blueprint.cells?.[field];
            if (!(array instanceof BLUEPRINT_FIELD_TYPES[field])) {
                throw new Error(`Blueprint ${slot + 1} has invalid ${field} data.`);
            }
            cells[field] = { type: array.constructor.name, data: arrayToBase64(array) };
        }
        return { width: blueprint.width, height: blueprint.height, sprinklerModeVersion: 2,
            machinePortLayoutVersion: 2, cells };
    });
    return {
        sprinklerModeVersion: 2,
        machinePortLayoutVersion: 2,
        fanWindScale: state.fanWindScale,
        nextSlot: Number.isInteger(state.nextSlot) ? state.nextSlot : 0,
        slots
    };
}

// Blueprint data was added as an optional part of version 1 saves, so older
// strings restore to an empty library rather than becoming incompatible.
function decodeBlueprintState(state, saveVersion = SAVE_VERSION) {
    if (state === undefined || state === null) {
        return {
            sprinklerModeVersion: 2,
            machinePortLayoutVersion: 2,
            fanWindScale: undefined,
            nextSlot: 0,
            slots: Array(BLUEPRINT_SLOT_COUNT).fill(null)
        };
    }
    if (!Array.isArray(state.slots) || state.slots.length > BLUEPRINT_SLOT_COUNT ||
        !Number.isInteger(state.nextSlot) || state.nextSlot < 0 || state.nextSlot >= BLUEPRINT_SLOT_COUNT) {
        throw new Error('This save has invalid blueprint data.');
    }
    const slots = Array(BLUEPRINT_SLOT_COUNT).fill(null);
    for (let slot = 0; slot < state.slots.length; slot++) {
        const blueprint = state.slots[slot];
        if (blueprint === null) continue;
        if (!blueprint || !Number.isInteger(blueprint.width) || !Number.isInteger(blueprint.height) ||
            blueprint.width < 1 || blueprint.height < 1 || blueprint.width * blueprint.height > MAX_WORLD_CELLS) {
            throw new Error('This save has invalid blueprint dimensions.');
        }
        const cells = {};
        const hasMachineSettings = !!blueprint.cells?.machineSetting;
        for (const field of BLUEPRINT_FIELDS) {
            const oldField = field.startsWith('sprinklerSprayFlow')
                ? field.replace('sprinklerSprayFlow', 'ventSprayFlow') : null;
            const encoded = blueprint.cells?.[field] ||
                (oldField ? blueprint.cells?.[oldField] : null);
            const Type = BLUEPRINT_FIELD_TYPES[field];
            // New machine state planes did not exist in older blueprint saves;
            // their zero-filled defaults preserve the prior machine behavior.
            if ((field === 'machineSetting' || field === 'storageType' || field === 'storageCount' ||
                field === 'storageFlowRemainder' || field.startsWith('machinePortEndpoint') ||
                field.startsWith('machinePortLead') || field.startsWith('mixer') ||
                field.startsWith('splitter') || field.startsWith('sprinkler')) && !encoded) {
                cells[field] = new Type(blueprint.width * blueprint.height);
                if (field === 'machineSetting') {
                    for (let cell = 0; cell < cells.type.length; cell++) {
                        if (cells.type[cell] === 52) cells.machineSetting[cell] = 3;
                    }
                }
                continue;
            }
            if (encoded?.type !== Type.name || typeof encoded.data !== 'string') {
                throw new Error(`This save has invalid blueprint ${field} data.`);
            }
            const array = base64ToArray(encoded.data, Type);
            if (array.length !== blueprint.width * blueprint.height) {
                throw new Error(`This save has invalid blueprint ${field} data.`);
            }
            cells[field] = array;
        }
        const blueprintModeVersion = saveVersion === 1 ? 1
            : (blueprint.sprinklerModeVersion ?? state.sprinklerModeVersion);
        if (hasMachineSettings && blueprintModeVersion !== 2) {
            migrateLegacySprinklerSettings(cells.type, cells.machineSetting);
        }
        const blueprintLayoutVersion = saveVersion === 1 ? 1
            : (blueprint.machinePortLayoutVersion ?? 1);
        slots[slot] = { width: blueprint.width, height: blueprint.height,
            sprinklerModeVersion: 2, machinePortLayoutVersion: blueprintLayoutVersion, cells };
    }
    return {
        sprinklerModeVersion: 2,
        machinePortLayoutVersion: 2,
        fanWindScale: state.fanWindScale,
        nextSlot: state.nextSlot,
        slots
    };
}

function migrateLegacySprinklerSettings(typeIds, machineSettings) {
    if (!typeIds || !machineSettings || typeIds.length !== machineSettings.length) return;
    for (let i = 0; i < typeIds.length; i++) {
        if (typeIds[i] !== 52) continue;
        const oldSetting = Math.round(machineSettings[i]);
        machineSettings[i] = (oldSetting & 1) | ((oldSetting & 2) ? 0 : 2);
    }
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
    let generalWindStrength = null;
    let gustWindStrength = null;
    if (Number.isFinite(tools.generalWindStrength) && Number.isFinite(tools.gustWindStrength)) {
        generalWindStrength = clampWindStrength(tools.generalWindStrength);
        gustWindStrength = clampWindStrength(tools.gustWindStrength);
        gustWindStrength = Math.max(generalWindStrength, gustWindStrength);
    } else if (Number.isFinite(tools.windStrength)) {
        const migrated = Math.round(Math.max(0, Math.min(15, tools.windStrength)) * 50 / 15);
        generalWindStrength = migrated;
        gustWindStrength = migrated;
    }
    if (generalWindStrength !== null) {
        setGeneralWindStrength(generalWindStrength);
        setGustWindStrength(gustWindStrength);
        setPhysicsGeneralWindStrength(generalWindStrength);
        setPhysicsGustWindStrength(gustWindStrength);
    }
    setEraserOn(!!tools.eraserOn); setGrabberOn(!!tools.grabberOn);
    const savedVisualizationMode = VISUALIZATION_MODES.includes(tools.visualizationMode)
        ? tools.visualizationMode
        : tools.heatViewOn ? 'heat' : 'normal';
    setVisualizationMode(savedVisualizationMode);
    setSimulationPaused(!!tools.paused);
}

function clampWindStrength(value) {
    return Math.max(0, Math.min(50, Math.round(value)));
}
