// ui.js
// -----------------------------------------------------------------------------
// Buttons, the particle picker and mouse/stroke handling.
//
// The particle buttons are built from particles.json at startup, so adding a new
// particle to that file is all it takes to get a button for it.
// -----------------------------------------------------------------------------

import {
    setParticleTypeIdSelected, getParticleTypeIdSelected, getGameVisibleActive,
    getGridCols, setGridCols, getGridRows, setGridRows, setElements, getElements,
    setBeginGameStatus, getGameInProgress, setGameInProgress, getMenuState,
    getBrushSize, setBrushSize, getDrawMode, setDrawMode, getEraserOn, setEraserOn,
    getVisualizationMode, setVisualizationMode, getHeatViewOn, setHeatViewOn,
    getSimulationPaused, setSimulationPaused,
    getWindStrength, setWindStrength, getGeneralWindStrength, setGeneralWindStrength,
    getGrabberSize, setGrabberSize,
    getGrabberOn, setGrabberOn
} from './constantsAndGlobalVars.js';
import {
    loadParticleDefinitions, initializeWorld, setGameState, startGame,
    getCanvasZoomLevel, setCanvasZoomLevel, isExpandedWorldProfileAvailable,
    paintLine, paintCell, clearCanvasWorld, setHoverCell,
    canPlaceMachine, placeMachineWithLead, setMachinePlacementPreview, clearMachinePlacementPreview,
    getMachinePlacementLeadPort,
    beginGrab, dropGrab, cancelGrab, setLinePreview, clearLinePreview,
    setShapePreview, clearShapePreview, paintShape,
    getMachinePortAtClientPoint, paintMachinePortConnector, setMachinePortConnectorPreview,
    getMachineArtworkAtClientPoint, preloadMachineArtworkAlpha,
    captureBlueprint, stampBlueprint, stampBlueprintAt, BLUEPRINT_SLOT_COUNT
} from './game.js';
import {
    getDefinitions, setAmbientTarget, getAmbientTarget,
    setAmbientHumidityTarget, getAmbientHumidityTarget, setDewpointTarget, getDewpointTarget,
    setAmbientWindOn, getAmbientWindOn,
    setGeneralWindStrength as setPhysicsGeneralWindStrength,
    setGustWindStrength as setPhysicsGustWindStrength,
    getWorld, index, getMachineSetting, setMachineSetting,
    FAN_WIND_SCALE, migrateLegacyFanWindSettings,
    getStorageInventory, purgeStorageBin, getSprinklerInventory, getSprinklerReleaseRate,
    setSprinklerReleaseRate, isSprinklerReleaseEnabled, setSprinklerReleaseEnabled,
    isDrainModeEnabled, setDrainModeEnabled,
    getMachineSensorRule, setMachineSensorRule, getMachineSensorThreshold,
    setMachineSensorThreshold, getMachineSensorStatus, getIlluminationAt,
    getTubingFlows, getSprinklerTubingRate, getMixerInventory, purgeMixerBin,
    isMixerReleaseEnabled, setMixerReleaseEnabled, isMachinePoweredAt,
    migrateLegacyMachinePortEndpointRemap
} from './physics.js';
import { loadSavedTheme, buildThemeSwatches, buildThemeSelect } from './themes.js';
import {
    hasAutosave, createSaveString, parseSaveString, restoreSavePayload, restoreAutosave,
    stopAutosave, replaceAutosaveWithCurrentGame, setSavingListener, setBlueprintSaveHandlers,
    setAutosaveErrorListener, writeAutosave, isAutosaveEnabled, startAutosave
} from './saveLoadGame.js';

let isPainting = false;
let isGrabbing = false;
let lastCell = null;
let paintTimer = null;
// Hand-painted rays carry their direction in the cell data. A stroke starts at
// the tool's default heading, then adopts the heading of the first non-zero
// pointer movement and keeps it until movement selects another heading.
let strokeRayDirection = null;
let lastStrokePointer = null;
let currentCell = { x: 0, y: 0 };
let lineStart = null;
let shapeStart = null;
let shapeMode = null;
let machinePlacement = null;
let deferredMachinePortGesture = null;
let activeMachinePortGesture = null;
let lastPointerEvent = null;
let autosaveChoiceResolver = null;
let worldSizeResolver = null;
let marqueeMode = false;
let isMarqueeDrawing = false;
let marqueeStart = null;
let marqueeSelection = null;
let blueprints = Array(BLUEPRINT_SLOT_COUNT).fill(null);
let nextBlueprintSlot = 0;
let activeBlueprintSlot = null;
const STAMP_HISTORY_LIMIT = 10;
let stampUndoHistory = [];
let stampRedoHistory = [];
let editingMachine = null;
let machineTooltipTimer = null;
let machineTooltipTarget = null;
let machineTooltipAnchor = null;
let machineDialogTimer = null;
let mixerPurgeSlot = null;
let visualizationsDialogInvoker = null;
let edgePanPointer = null;
let edgePanFrame = null;
let edgePanLastTime = 0;
const EDGE_PAN_MAX_SPEED = 180;
const CANVAS_SCROLL_STEP = 80;

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadParticleDefinitions(), preloadMachineArtworkAlpha()]);
    initializeWorld();
    setElements();
    if (window.__E2E_MODE__) await import('./e2eHooks.js');
    buildParticleButtons();

    const elements = getElements();
    setBlueprintSaveHandlers({
        capture: captureBlueprintLibrary,
        restore: restoreBlueprintLibrary
    });

    // The look comes first, before anything is on screen, so the page never
    // shows a flash of the default theme on its way to the saved one.
    loadSavedTheme();
    buildThemeSwatches(elements.themeSwatches);
    buildThemeSelect(elements.themeSelect);

    elements.newGameMenuButton.addEventListener('click', () => { void startNewGame(); });
    elements.autosaveToggle.checked = isAutosaveEnabled();
    elements.autosaveToggle.addEventListener('change', handleAutosaveToggle);
    elements.worldSizeStart.addEventListener('click', () => settleWorldSizeChoice(
        elements.worldSizeDialog.querySelector('input[name="worldSize"]:checked')?.value || null
    ));
    elements.worldSizeCancel.addEventListener('click', () => settleWorldSizeChoice(null));
    elements.worldSizeDialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            settleWorldSizeChoice(null);
        }
    });
    elements.resumeGameButton.addEventListener('click', () => { void resumeGame(); });
    elements.importGameMenuButton.addEventListener('click', openImportDialog);
    elements.exportGameButton.addEventListener('click', openExportDialog);
    elements.importGameButton.addEventListener('click', openImportDialog);
    setUpSaveDialogs();
    setUpVisualizationsDialog();
    window.addEventListener('resize', refreshWorldSizeChoices);
    elements.clearDialogConfirm.addEventListener('click', confirmClearWorld);
    elements.clearDialogCancel.addEventListener('click', closeClearDialog);
    elements.machineDialogOk.addEventListener('click', confirmMachineDialog);
    elements.machineDialogPurge.addEventListener('click', openPurgeDialog);
    elements.machineDialogCancel.addEventListener('click', closeMachineDialog);
    elements.purgeDialogConfirm.addEventListener('click', confirmPurgeDialog);
    elements.purgeDialogCancel.addEventListener('click', closePurgeDialog);
    elements.machineDialogInput.addEventListener('input', validateMachineInput);
    elements.machineDialogComparison.addEventListener('change', updateMachineSensorRule);
    elements.machineDialogSprinklerReleaseToggle.addEventListener('change', updateSprinklerReleaseToggle);
    elements.machineDialogDrainModeToggle.addEventListener('change', updateDrainModeToggle);
    document.getElementById('machineDialogElectricalToggle').addEventListener('change', updateElectricalMachineToggle);
    elements.mixerDialogCancel.addEventListener('click', closeMixerDialog);
    elements.mixerDialogToggle.addEventListener('change', updateMixerReleaseToggle);
    elements.mixerDialogBinPurge0.addEventListener('click', () => purgeMixerDialogBin(0));
    elements.mixerDialogBinPurge1.addEventListener('click', () => purgeMixerDialogBin(1));
    elements.machineDialogInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            confirmMachineDialog();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            closeMachineDialog();
        }
    });
    setSavingListener(saving => {
        if (saving) {
            elements.autosaveStatus.classList.remove('autosave-status-error');
            elements.autosaveStatus.hidden = false;
            elements.autosaveStatusMessage.textContent = 'Autosaving';
        } else if (!elements.autosaveStatus.classList.contains('autosave-status-error')) {
            elements.autosaveStatus.hidden = true;
            elements.autosaveStatusMessage.textContent = '';
        }
    });
    setAutosaveErrorListener(showAutosaveFailure);
    updateResumeButton();

    elements.pauseButton.addEventListener('click', () => {
        setSimulationPaused(!getSimulationPaused());
        elements.pauseButton.textContent = getSimulationPaused() ? 'Play' : 'Pause';
    });

    elements.toolsTabButton.addEventListener('click', () => {
        cancelBlueprintModes();
        setWorkspace('tools');
    });
    elements.blueprintsTabButton.addEventListener('click', () => setWorkspace('blueprints'));
    elements.marqueeButton.addEventListener('click', beginMarqueeMode);
    elements.copyBlueprintButton.addEventListener('click', copyMarqueeSelection);
    elements.blueprintSlots.querySelectorAll('.blueprint-slot').forEach(slot => {
        slot.addEventListener('click', () => selectBlueprintForStamp(parseInt(slot.dataset.blueprintSlot)));
    });
    elements.undoBlueprintButton.addEventListener('click', undoBlueprintStamp);
    elements.redoBlueprintButton.addEventListener('click', redoBlueprintStamp);

    elements.clearButton.addEventListener('click', () => {
        openClearDialog();
    });

    elements.eraserButton.addEventListener('click', () => {
        cancelBlueprintModes();
        if (!getEraserOn()) setGrabberMode(false);
        setEraserOn(!getEraserOn());
        elements.eraserButton.classList.toggle('active-toggle', getEraserOn());
    });

    elements.brushSizeInput.addEventListener('input', event => {
        setBrushSize(parseInt(event.target.value));
        elements.brushSizeValue.textContent = String(getBrushSize());
    });

    elements.brushModeButton.addEventListener('click', () => selectDrawingMode('brush'));
    elements.lineModeButton.addEventListener('click', () => selectDrawingMode('line'));
    elements.rectangleModeButton.addEventListener('click', () => selectDrawingMode('rectangle'));
    elements.ellipseModeButton.addEventListener('click', () => selectDrawingMode('ellipse'));
    selectDrawingMode(getDrawMode());

    elements.grabberButton.addEventListener('click', () => {
        cancelBlueprintModes();
        setGrabberMode(!getGrabberOn());
    });

    elements.grabberSizeInput.addEventListener('input', event => {
        const size = Math.max(1, Math.min(60, parseInt(event.target.value)));
        setGrabberSize(size);
        elements.grabberSizeValue.textContent = String(size);
    });

    setGameState(getMenuState());
    setUpAirTemperature();
    setUpBaseHumidity();
    setUpDewpoint();
    setUpWindStrength();
    setUpAmbientWind();
    setUpTooltips();
    setUpCanvasInput();
    setUpCanvasViewportInput();
    setUpKeyboardShortcuts();
});

// ---------------------------------------------------------------- save/load

async function startNewGame() {
    const worldSize = await askWorldSize();
    if (!worldSize) return;

    const replacingExisting = hasAutosave();
    const useAsResumeGame = replacingExisting
        ? await askToReplaceResume('Starting a new game will replace the saved resume game on this device.')
        : true;

    if (useAsResumeGame === null) return;
    if (!useAsResumeGame) {
        stopAutosave();
        syncAutosaveToggle();
    }
    resetBlueprintLibrary();
    setBeginGameStatus(true);
    if (!getGameInProgress()) setGameInProgress(true);
    const [cols, rows] = worldSize.split('x').map(Number);
    // The current world may be close to the cell cap with a very narrow shape.
    // Reduce both dimensions to a safe intermediate size before setting the
    // preset so it is not rejected against the dimensions being replaced.
    setGridCols(200);
    setGridRows(150);
    setGridCols(cols);
    setGridRows(rows);
    startGame({ newWorld: true, alignAtGround: true });
    collapseVegetationCatalogGroup();

    if (useAsResumeGame) {
        try {
            await replaceAutosaveWithCurrentGame();
            updateResumeButton();
            clearAutosaveFailure();
            syncAutosaveToggle();
        }
        catch (error) { showAutosaveFailure(error); }
    }
}

function handleAutosaveToggle() {
    const toggle = getElements().autosaveToggle;
    if (!toggle.checked) {
        stopAutosave();
        syncAutosaveToggle();
        return;
    }

    if (!startAutosave({ saveNow: false })) {
        toggle.checked = false;
        showAutosaveFailure(new Error('Local storage is not available in this browser.'));
        return;
    }
    clearAutosaveFailure();
    syncAutosaveToggle();
}

function syncAutosaveToggle() {
    const toggle = getElements()?.autosaveToggle;
    if (toggle) toggle.checked = isAutosaveEnabled();
}

function askWorldSize() {
    const elements = getElements();
    refreshWorldSizeChoices();
    elements.worldSizeStandard.checked = true;
    elements.worldSizeDialog.hidden = false;
    elements.worldSizeStandard.focus();
    return new Promise(resolve => { worldSizeResolver = resolve; });
}

function refreshWorldSizeChoices() {
    const elements = getElements();
    if (!elements?.worldSizeDialog) return;
    const fixedSizesAvailable = isExpandedWorldProfileAvailable();
    for (const option of elements.worldSizeLargeOptions) option.hidden = !fixedSizesAvailable;
    const selected = elements.worldSizeDialog.querySelector('input[name="worldSize"]:checked')?.closest('[data-large-world-size]');
    if (!fixedSizesAvailable && selected) {
        elements.worldSizeStandard.checked = true;
    }
}

function settleWorldSizeChoice(choice) {
    const elements = getElements();
    elements.worldSizeDialog.hidden = true;
    const resolve = worldSizeResolver;
    worldSizeResolver = null;
    if (resolve) resolve(choice);
    elements.newGameMenuButton.focus();
}

function showAutosaveFailure(error) {
    const status = getElements().autosaveStatus;
    getElements().autosaveStatusMessage.textContent = `Autosave unavailable. This game is still playable; save a copy to keep it. ${error?.message || ''}`.trim();
    status.classList.add('autosave-status-error');
    status.hidden = false;
    syncAutosaveToggle();
}

function clearAutosaveFailure() {
    const status = getElements().autosaveStatus;
    if (!status.classList.contains('autosave-status-error')) return;
    status.classList.remove('autosave-status-error');
    status.hidden = true;
    getElements().autosaveStatusMessage.textContent = '';
}

async function resumeGame() {
    try {
        const payload = await restoreAutosave();
        beginLoadedGame(payload);
        if (isAutosaveEnabled()) clearAutosaveFailure();
        else showAutosaveFailure(new Error('Local storage is not available in this browser.'));
        syncAutosaveToggle();
    } catch (error) {
        syncAutosaveToggle();
        updateResumeButton();
        openImportDialog();
        showSaveError(error.message || 'The saved game could not be loaded.');
    }
}

function beginLoadedGame(payload) {
    setGridCols(payload.simulation.cols);
    setGridRows(payload.simulation.rows);
    setBeginGameStatus(false);
    setGameInProgress(true);
    synchroniseRestoredControls();
    setGameState(getGameVisibleActive());
    startGame();
}

function synchroniseRestoredControls() {
    const elements = getElements();
    elements.pauseButton.textContent = getSimulationPaused() ? 'Play' : 'Pause';
    elements.eraserButton.classList.toggle('active-toggle', getEraserOn());
    elements.grabberButton.classList.toggle('active-toggle', getGrabberOn());
    elements.grabberButton.setAttribute('aria-pressed', String(getGrabberOn()));
    synchroniseVisualizationButtons();
    elements.brushSizeInput.value = String(getBrushSize());
    elements.brushSizeValue.textContent = String(getBrushSize());
    elements.grabberSizeInput.value = String(getGrabberSize());
    elements.grabberSizeValue.textContent = String(getGrabberSize());
    elements.airTempInput.value = String(Math.round(getAmbientTarget()));
    elements.airTempValue.value = String(Math.round(getAmbientTarget()));
    elements.baseHumidityInput.value = String(Math.round(getAmbientHumidityTarget()));
    elements.baseHumidityValue.textContent = `${Math.round(getAmbientHumidityTarget())}%`;
    elements.dewpointInput.value = String(Math.round(getDewpointTarget()));
    elements.dewpointValue.textContent = `${Math.round(getDewpointTarget())} °C`;
    elements.generalWindStrengthInput.value = String(getGeneralWindStrength());
    elements.generalWindStrengthValue.textContent = String(getGeneralWindStrength());
    elements.windStrengthInput.value = String(getWindStrength());
    elements.windStrengthValue.textContent = String(getWindStrength());
    getElements().windStrengthControls.style.setProperty('--general-wind-position', `${getGeneralWindStrength() * 2}%`);
    getElements().windStrengthControls.style.setProperty('--gust-wind-position', `${getWindStrength() * 2}%`);
    elements.ambientWindCheckbox.checked = getAmbientWindOn();
    syncDrawingModeButtons(getDrawMode());
    highlightSelectedParticle();
}

function updateResumeButton() {
    getElements().resumeGameButton.classList.toggle('d-none', !hasAutosave());
}

function setUpSaveDialogs() {
    const elements = getElements();
    elements.closeSaveDialog.addEventListener('click', closeSaveDialog);
    elements.copySaveString.addEventListener('click', () => { void copySaveString(); });
    elements.loadSaveString.addEventListener('click', () => { void importFromDialog(); });
    elements.autosaveChoiceYes.addEventListener('click', () => settleAutosaveChoice(true));
    elements.autosaveChoiceNo.addEventListener('click', () => settleAutosaveChoice(false));
    elements.autosaveChoiceCancel.addEventListener('click', () => settleAutosaveChoice(null));
}

function setUpVisualizationsDialog() {
    const elements = getElements();
    elements.visualizationsNormalButton.addEventListener('click', () => {
        setVisualizationModeAndSync('normal');
    });
    elements.visualizationsOptionsButton.addEventListener('click', openVisualizationsDialog);
    elements.visualizationModeButtons.forEach(button => {
        button.addEventListener('click', () => {
            setVisualizationModeAndSync(button.dataset.visualizationMode);
        });
    });
    elements.closeVisualizationsDialog.addEventListener('click', closeVisualizationsDialog);
    elements.visualizationsDialog.addEventListener('click', event => {
        if (event.target === elements.visualizationsDialog) closeVisualizationsDialog();
    });
    elements.visualizationsDialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeVisualizationsDialog();
            return;
        }
        if (event.key !== 'Tab') return;

        const focusable = [...elements.visualizationsDialog.querySelectorAll(
            'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        )].filter(item => !item.hidden && item.getClientRects().length > 0);
        if (!focusable.length) {
            event.preventDefault();
            elements.visualizationsDialog.focus();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !elements.visualizationsDialog.contains(document.activeElement))) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !elements.visualizationsDialog.contains(document.activeElement))) {
            event.preventDefault();
            first.focus();
        }
    });
    synchroniseVisualizationButtons();
}

function openVisualizationsDialog() {
    const elements = getElements();
    visualizationsDialogInvoker = document.activeElement;
    elements.visualizationsDialog.hidden = false;
    elements.visualizationHeatButton.focus();
}

function closeVisualizationsDialog() {
    const elements = getElements();
    if (elements.visualizationsDialog.hidden) return;
    elements.visualizationsDialog.hidden = true;
    if (visualizationsDialogInvoker?.isConnected) visualizationsDialogInvoker.focus();
    visualizationsDialogInvoker = null;
}

function setVisualizationModeAndSync(mode) {
    setVisualizationMode(mode);
    synchroniseVisualizationButtons();
}

function synchroniseVisualizationButtons() {
    const elements = getElements();
    const mode = getVisualizationMode();
    elements.visualizationsNormalButton.classList.toggle('active-toggle', mode === 'normal');
    elements.visualizationsNormalButton.setAttribute('aria-pressed', String(mode === 'normal'));
    elements.visualizationModeButtons.forEach(button => {
        const active = button.dataset.visualizationMode === mode;
        button.classList.toggle('active-toggle', active);
        button.setAttribute('aria-pressed', String(active));
    });
}

function openExportDialog() {
    const elements = getElements();
    try {
        elements.saveDialogTitle.textContent = 'Save Game';
        elements.saveDialogDescription.textContent = 'Copy this LZString save to keep or share a portable snapshot of this world.';
        elements.saveString.value = createSaveString();
        elements.saveString.readOnly = true;
        elements.copySaveString.classList.remove('d-none');
        elements.loadSaveString.classList.add('d-none');
        clearSaveError();
        elements.saveDialog.hidden = false;
        elements.saveString.focus();
        elements.saveString.select();
    } catch (error) { showSaveError(error.message || 'Unable to save this game.'); }
}

function openImportDialog() {
    const elements = getElements();
    elements.saveDialogTitle.textContent = 'Load Game';
    elements.saveDialogDescription.textContent = 'Paste an Elemental Foundry LZString save here to load it.';
    elements.saveString.value = '';
    elements.saveString.readOnly = false;
    elements.copySaveString.classList.add('d-none');
    elements.loadSaveString.classList.remove('d-none');
    clearSaveError();
    elements.saveDialog.hidden = false;
    elements.saveString.focus();
}

function closeSaveDialog() { getElements().saveDialog.hidden = true; }

async function copySaveString() {
    const { saveString, saveDialogDescription } = getElements();
    try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(saveString.value);
        else {
            saveString.select();
            if (!document.execCommand || !document.execCommand('copy')) throw new Error('Clipboard access was denied.');
        }
        saveDialogDescription.textContent = 'Save string copied. Keep it somewhere safe before sharing it.';
    } catch { showSaveError('Could not copy automatically. Select the string and copy it manually.'); }
}

async function importFromDialog() {
    const elements = getElements();
    let payload;
    try { payload = parseSaveString(elements.saveString.value); }
    catch (error) { showSaveError(error.message || 'Unable to load this save.'); return; }

    const replacingExisting = hasAutosave();
    const useAsResumeGame = replacingExisting
        ? await askToReplaceResume('This loaded game will replace the saved resume game on this device.')
        : true;

    // Cancel leaves both the current session and its existing autosave alone.
    // The import dialog remains open so the pasted save can be reconsidered.
    if (useAsResumeGame === null) return;

    restoreSavePayload(payload);
    beginLoadedGame(payload);
    closeSaveDialog();
    if (useAsResumeGame) {
        try {
            await replaceAutosaveWithCurrentGame();
            updateResumeButton();
            clearAutosaveFailure();
            syncAutosaveToggle();
        }
        catch (error) { showAutosaveFailure(error); }
    } else {
        stopAutosave();
        syncAutosaveToggle();
    }
}

function askToReplaceResume(description) {
    const elements = getElements();
    elements.autosaveChoiceDescription.textContent = description + ' Choose No to keep the existing resume game and play this session without autosave, or Cancel to leave everything unchanged.';
    elements.autosaveChoiceDialog.hidden = false;
    return new Promise(resolve => { autosaveChoiceResolver = resolve; });
}

function settleAutosaveChoice(choice) {
    getElements().autosaveChoiceDialog.hidden = true;
    const resolve = autosaveChoiceResolver;
    autosaveChoiceResolver = null;
    if (resolve) resolve(choice);
}

function openClearDialog() {
    const elements = getElements();
    elements.clearDialog.hidden = false;
    elements.clearDialogConfirm.focus();
}

function closeClearDialog() {
    getElements().clearDialog.hidden = true;
}

function confirmClearWorld() {
    // Stop any deferred stroke or Grabber operation before clearing the arrays,
    // so no input state can write material back into the freshly empty world.
    cancelPainting();
    cancelBlueprintModes();
    setGrabberMode(false);
    clearCanvasWorld();
    closeClearDialog();
}

const MACHINE_CONTROL_SPECS = {
    fan: { label: 'Wind speed', min: 1, max: FAN_WIND_SCALE, unit: '', defaultValue: 7 },
    heater: { label: 'Temperature', min: 0, max: 4000, unit: '°C' },
    cooler: { label: 'Temperature', min: -60, max: 20, unit: '°C' },
    sprinkler: { label: 'Release rate', min: 1, max: 100, unit: 'particles/s', defaultValue: 10 },
    temperatureSwitch: { label: 'Temperature', unit: '°C' },
    humiditySwitch: { label: 'Humidity', min: 0, max: 100, unit: '%' }
};

function isElectricalMachine(machine) {
    return machine === 'simpleSwitch' || machine === 'lamp';
}

function isStorageMachineDefinition(def) {
    return !!def?.storageCategory || def?.machine === 'splitter' || def?.machine === 'collector';
}

function storageContentsText(inventory) {
    if (!inventory) return 'empty';
    const stored = inventory.type > 0 ? getDefinitions()[inventory.type]?.name : null;
    return `${inventory.count}/${inventory.capacity} ${stored || 'empty'}`;
}

function machineAtCell(cell) {
    const world = getWorld();
    if (!world || cell.x < 0 || cell.y < 0 || cell.x >= world.cols || cell.y >= world.rows) return null;
    const id = world.type[index(cell.x, cell.y)];
    const def = getDefinitions()[id];
    return def?.machine ? { id, def, x: cell.x, y: cell.y, tubing: false } : null;
}

function tubingAtCell(cell) {
    const world = getWorld();
    if (!world || cell.x < 0 || cell.y < 0 || cell.x >= world.cols || cell.y >= world.rows) return null;
    const id = world.type[index(cell.x, cell.y)];
    const def = getDefinitions()[id];
    return def?.tubing ? { id, def, x: cell.x, y: cell.y, tubing: true } : null;
}

// The SVG machine face is 64 CSS pixels wide, while the simulation machine is
// only one cell. Hit-test against that visible face so a pointer near its edge
// still gets the hand cursor and can open the machine controls.
function machineAtPointer(event) {
    if (!event) return null;
    // Paint is resolved to a world cell, so dialogs and paint must agree on
    // the same cell-center alpha sample even when the browser rounds a
    // fractional CSS pointer coordinate to a neighboring screen pixel.
    const canvas = getElements().canvas;
    const world = getWorld();
    if (!canvas || !world) return null;
    const rect = canvas.getBoundingClientRect();
    const cell = cellFromEvent(event);
    if (cell.x < 0 || cell.y < 0 || cell.x >= world.cols || cell.y >= world.rows) return null;
    return getMachineArtworkAtClientPoint(
        rect.left + (cell.x + 0.5) * rect.width / world.cols,
        rect.top + (cell.y + 0.5) * rect.height / world.rows);
}

function updateMachinePortGesture(event) {
    if (deferredMachinePortGesture && event) {
        const moved = Math.hypot(event.clientX - deferredMachinePortGesture.startClientX,
            event.clientY - deferredMachinePortGesture.startClientY);
        const connectorMaterialId = getDefinitions().findIndex(definition =>
            definition?.name === deferredMachinePortGesture.port.connectorMaterial);
        const nearestCompatiblePort = getMachinePortAtClientPoint(
            event.clientX, event.clientY, connectorMaterialId, 20);
        const movedToAnotherPort = nearestCompatiblePort &&
            (nearestCompatiblePort.machineX !== deferredMachinePortGesture.port.machineX ||
                nearestCompatiblePort.machineY !== deferredMachinePortGesture.port.machineY ||
                nearestCompatiblePort.id !== deferredMachinePortGesture.port.id);
        // Paired ports can be only a few CSS pixels apart while their logical
        // cells remain distinct. Reaching the other compatible port is an
        // unambiguous drag even when it falls below the ordinary jitter guard.
        if (moved >= 4 || movedToAnotherPort) {
            activeMachinePortGesture = deferredMachinePortGesture;
            deferredMachinePortGesture = null;
            updateMachinePortConnectorPreview(activeMachinePortGesture, event);
            return true;
        }
    }
    if (activeMachinePortGesture && event) {
        updateMachinePortConnectorPreview(activeMachinePortGesture, event);
        return true;
    }
    return false;
}

function machinePortMarkerAtPointer(port, event) {
    const overlay = getElements().machineOverlay;
    const icon = overlay?.querySelector(`.machine-overlay-icon[data-machine-x="${port.machineX}"][data-machine-y="${port.machineY}"]`);
    const marker = [...(icon?.querySelectorAll('.machine-port') || [])]
        .find(circle => circle.getAttribute('data-port-id') === port.id);
    const rect = marker?.getBoundingClientRect();
    if (!rect) return false;
    const distance = Math.hypot(event.clientX - (rect.left + rect.width / 2),
        event.clientY - (rect.top + rect.height / 2));
    return distance <= Math.max(rect.width, rect.height) / 2 + 2;
}

function finishDeferredMachinePortClick(port, event) {
    const selectedPort = getMachinePortAtClientPoint(event.clientX, event.clientY,
        getParticleTypeIdSelected(), 20);
    const selectedPortMatches = selectedPort && selectedPort.machineX === port.machineX &&
        selectedPort.machineY === port.machineY && selectedPort.id === port.id;
    if (selectedPortMatches || machinePortMarkerAtPointer(port, event)) {
        openMachineDialog(port.machineX, port.machineY);
        return;
    }

    const machine = machineAtPointer(event);
    if (machine && openMachineDialog(machine.x, machine.y, machine)) return;

    currentCell = cellFromEvent(event);
    lastPointerEvent = event;
    paintCell(currentCell.x, currentCell.y, 0, 0, strokeRayDirection);
}

function updateMachinePortConnectorPreview(gesture, event) {
    setMachinePortConnectorPreview({
        startClientX: gesture.port.markerClientX,
        startClientY: gesture.port.markerClientY,
        endClientX: event.clientX,
        endClientY: event.clientY,
        material: gesture.port.connectorMaterial,
        connectorBrushWidth: gesture.port.connectorBrushWidth
    });
}

function clearMachinePortGesture() {
    deferredMachinePortGesture = null;
    activeMachinePortGesture = null;
    setMachinePortConnectorPreview(null);
}

function previewMachinePlacementLead(event = null) {
    const port = getMachinePlacementLeadPort();
    if (!port) return;
    const pointerX = event?.clientX ?? port.markerClientX + port.directionX * 12;
    const pointerY = event?.clientY ?? port.markerClientY + port.directionY * 12;
    setMachinePortConnectorPreview({
        startClientX: port.markerClientX,
        startClientY: port.markerClientY,
        endClientX: pointerX,
        endClientY: pointerY,
        material: port.connectorMaterial,
        connectorBrushWidth: port.connectorBrushWidth
    });
}

function commitMachinePlacementLead(event) {
    if (!machinePlacement || machinePlacement.stage !== 'extensionPreview') return false;
    const placement = machinePlacement;
    if (!placeMachineWithLead(placement.x, placement.y, placement.machine,
        placement.direction, event.clientX, event.clientY)) {
        previewMachinePlacementLead(event);
        return false;
    }
    machinePlacement = null;
    clearMachinePlacementPreview();
    setMachinePortConnectorPreview(null);
    return true;
}

function updateMachineCursor(cell, event) {
    const machine = event ? machineAtPointer(event) : machineAtCell(cell);
    const hit = machine || tubingAtCell(cell);
    getElements().canvas.classList.toggle('machine-hover', !!machine);
    getElements().canvas.classList.toggle('tubing-hover', !!hit?.tubing);
    if (hit && event) showMachineTooltip(hit, event);
    else if (!hit) hideMachineTooltip();
}

function openMachineDialog(x, y, machine = machineAtCell({ x, y })) {
    if (!machine) return false;
    const spec = MACHINE_CONTROL_SPECS[machine.def.machine];
    const storage = isStorageMachineDefinition(machine.def);
    const sprinkler = machine.def.machine === 'sprinkler';
    const electrical = isElectricalMachine(machine.def.machine);
    const sensor = machine.def.machine === 'temperatureSwitch' || machine.def.machine === 'humiditySwitch';
    if (machine.def.machine === 'mixer') return openMixerDialog(x, y);
    if (!spec && !storage && !sprinkler && !electrical && !sensor) return false;

    const elements = getElements();
    hideMachineTooltip();
    const current = sprinkler ? getSprinklerReleaseRate(x, y) : getMachineSetting(x, y);
    editingMachine = { x, y, machine: machine.def.machine, fallback: current, storage, sprinkler, electrical, sensor };
    elements.machineDialogTitle.textContent = storage ? `${machine.def.name} contents` : `${machine.def.name} settings`;
    elements.machineDialogDescription.textContent = sensor
        ? `Measures the ${machine.def.machine === 'temperatureSwitch' ? 'temperature' : 'humidity'} of air along its exposed sensor face. A steady electrical level reaches the output only when the selected comparison is true.`
        : electrical
        ? machine.def.machine === 'simpleSwitch'
            ? 'ON relays steady electrical current from the input port to the output port. OFF blocks the signal.'
            : 'ON lights the Lamp when its input receives electrical power. OFF blocks the input and keeps the Lamp dark.'
        : storage
        ? machine.def.machine === 'splitter'
            ? 'Receives one compatible Tubing material and buffers it while dividing flow evenly between its two outputs. Purge the buffer to accept a different material.'
            : machine.def.machine === 'collector'
                ? 'Suction collects powder, liquid, or gas into a one-material buffer of up to 100 particles. A connected Tubing output sends compatible material at up to 30 particles per second, limited by line capacity; otherwise contents stay buffered.'
                : `Receives one ${machine.def.storageCategory} type through connected Tubing and stores up to ${machine.def.storageCapacity || 500} particles. World particles pass by without entering. Wrong types are refused until the buffer is emptied. Purge the bin to empty it and accept a new type.`
        : sprinkler
            ? 'Always active. Set the release rate in particles per second. Release controls whether stored material leaves the 100-particle buffer. Drain Mode on uses the downward outlet; off sprays the stored material in seven directions.'
        : machine.def.machine === 'fan'
            ? 'Fan speed uses the 1 to 50 Breeze scale. Speed 50 matches the old Fan speed 15.'
            : `${machine.def.name} will only ${machine.def.machine === 'heater' ? 'raise' : 'lower'} temperatures toward this target in its facing direction.`;
    const storageSummary = elements.machineDialogStorageSummary;
    if (storage) {
        renderInventorySummary(storageSummary, getStorageInventory(x, y));
    } else if (sprinkler) {
        renderInventorySummary(storageSummary, getSprinklerInventory(x, y));
    } else {
        storageSummary.textContent = '';
    }
    storageSummary.hidden = !storage && !sprinkler;
    elements.machineDialogLabel.textContent = spec?.label || 'Contents';
    elements.machineDialogComparisonWrap.hidden = !sensor;
    elements.machineDialogComparison.hidden = !sensor;
    elements.machineDialogComparison.value = String(sensor ? getMachineSensorRule(x, y) : 0);
    elements.machineDialogSensorStatus.hidden = !sensor;
    elements.machineDialogLabel.hidden = storage || electrical;
    elements.machineDialogInputWrap.hidden = storage || electrical;
    elements.machineDialogInput.hidden = storage || electrical;
    elements.machineDialogInput.disabled = storage || electrical;
    elements.machineDialogSprinklerReleaseToggleWrap.hidden = !sprinkler;
    elements.machineDialogSprinklerReleaseToggle.checked = sprinkler && isSprinklerReleaseEnabled(x, y);
    elements.machineDialogDrainModeToggleWrap.hidden = !sprinkler;
    elements.machineDialogDrainModeToggle.checked = sprinkler && isDrainModeEnabled(x, y);
    const electricalToggleWrap = document.getElementById('machineDialogElectricalToggleWrap');
    const electricalToggle = document.getElementById('machineDialogElectricalToggle');
    const electricalToggleState = document.getElementById('machineDialogElectricalToggleState');
    electricalToggleWrap.hidden = !electrical;
    electricalToggle.checked = electrical && (Math.round(current) & 1) !== 0;
    electricalToggle.setAttribute('aria-label', machine.def.name);
    electricalToggleState.textContent = electricalToggle.checked ? 'ON' : 'OFF';
    const status = document.getElementById('machineDialogStatus');
    status.hidden = !electrical;
    elements.machineDialogInput.setAttribute('aria-label', spec?.label || 'Contents');
    if (spec) {
        const humiditySwitch = machine.def.machine === 'humiditySwitch';
        elements.machineDialogInput.min = sensor && !humiditySwitch ? '' : String(spec.min ?? '');
        const sprinklerRate = sprinkler ? getSprinklerTubingRate(x, y) : null;
        const inputMax = sprinkler ? sprinklerRate : spec.max;
        elements.machineDialogInput.max = sensor && !humiditySwitch ? '' : String(inputMax || spec.max || '');
        elements.machineDialogInput.step = sensor ? 'any' : '1';
        elements.machineDialogInput.placeholder = sprinkler && !sprinklerRate ? 'Not Connected' : '';
        elements.machineDialogInput.disabled = storage || (sprinkler && !sprinklerRate);
        const sensorThreshold = sensor ? getMachineSensorThreshold(x, y) : null;
        elements.machineDialogInput.value = sprinkler && !sprinklerRate
            ? ''
            : sensor
                ? formatMachineSensorThreshold(sensorThreshold)
                : String(Number.isFinite(current) ? Math.min(current, inputMax) : (spec.defaultValue ?? spec.min));
    }
    elements.machineDialogUnit.textContent = spec?.unit || '';
    elements.machineDialogUnit.hidden = !spec?.unit;
    elements.machineDialogError.hidden = true;
    elements.machineDialogOk.hidden = storage || sprinkler || electrical || sensor;
    elements.machineDialogPurge.hidden = !storage;
    elements.machineDialogCancel.textContent = storage || sprinkler || electrical || sensor ? 'Close' : 'Cancel';
    elements.machineDialog.hidden = false;
    if (machineDialogTimer) clearInterval(machineDialogTimer);
    refreshMachineDialog();
    machineDialogTimer = setInterval(refreshMachineDialog, 150);
    if (electrical) electricalToggle.focus();
    else if (sensor) elements.machineDialogComparison.focus();
    else if (!storage) elements.machineDialogInput.focus();
    else elements.machineDialogCancel.focus();
    return true;
}

function materialDisplay(type) {
    if (!type) return { name: 'Empty', color: 'transparent' };
    const def = getDefinitions()[type];
    const rgb = def?.rgb;
    const color = Array.isArray(rgb) && rgb.length >= 3
        ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
        : 'transparent';
    return { name: def?.name || 'Empty', color };
}

function openMixerDialog(x, y) {
    const elements = getElements();
    editingMachine = { x, y, mixer: true };
    elements.mixerDialog.hidden = false;
    elements.mixerDialogToggle.checked = isMixerReleaseEnabled(x, y);
    refreshMixerDialog();
    if (machineDialogTimer) clearInterval(machineDialogTimer);
    machineDialogTimer = setInterval(refreshMixerDialog, 150);
    elements.mixerDialogCancel.focus();
    return true;
}

function refreshMixerDialog() {
    if (!editingMachine?.mixer || getElements().mixerDialog.hidden) return;
    const inventory = getMixerInventory(editingMachine.x, editingMachine.y);
    if (!inventory) return closeMixerDialog();
    const bins = [inventory.bins[0], inventory.bins[1], {
        counts: inventory.output.counts,
        count: inventory.output.counts[0] + inventory.output.counts[1],
        capacity: inventory.output.capacity,
        type: inventory.output.types[0]
    }];
    for (let slot = 0; slot < 3; slot++) {
        const bin = bins[slot];
        const elements = getElements();
        const count = bin.count;
        const fill = elements[`mixerDialogBinFill${slot}`];
        const summary = elements[`mixerDialogBinSummary${slot}`];
        fill.replaceChildren();
        fill.style.height = slot === 2 ? '100%' : `${Math.min(100, count / bin.capacity * 100)}%`;
        const types = slot === 2
            ? inventory.output.types.map((type, index) => inventory.output.counts[index] > 0
                ? materialDisplay(type).name : null).filter(Boolean).join(' + ') || 'Empty'
            : materialDisplay(bin.type).name;
        const outputIsMixed = slot === 2 && inventory.output.mixed;
        if (slot === 2) {
            elements.mixerDialogOutputLabel.textContent = `output: ${types}`;
        }
        if (slot === 2) {
            for (let side = 0; side < 2; side++) {
                const segment = document.createElement('div');
                const segmentCount = inventory.output.counts[side];
                segment.className = 'mixer-bin-segment';
                segment.style.width = outputIsMixed ? '100%' : '50%';
                segment.style.height = `${Math.min(100, segmentCount / 500 * 100)}%`;
                segment.style.background = materialDisplay(inventory.output.types[side]).color;
                fill.appendChild(segment);
                if (outputIsMixed) break;
            }
        } else {
            const segment = document.createElement('div');
            segment.className = 'mixer-bin-segment';
            segment.style.width = '100%';
            segment.style.height = '100%';
            segment.style.background = materialDisplay(bin.type).color;
            fill.appendChild(segment);
        }
        summary.textContent = `${count}/${bin.capacity} ${types}`;
    }
}

function updateMixerReleaseToggle() {
    if (!editingMachine?.mixer) return;
    setMixerReleaseEnabled(editingMachine.x, editingMachine.y, getElements().mixerDialogToggle.checked);
}

function purgeMixerDialogBin(slot) {
    if (!editingMachine?.mixer) return;
    mixerPurgeSlot = slot;
    const inventory = getMixerInventory(editingMachine.x, editingMachine.y);
    const bin = inventory?.bins[slot];
    const elements = getElements();
    elements.purgeDialogDescription.textContent =
        `Purge ${storageContentsText(bin)} from Mixer input ${slot + 1}? The input will accept a new material type.`;
    elements.purgeDialog.hidden = false;
    elements.purgeDialogConfirm.focus();
}

function closeMixerDialog() {
    if (machineDialogTimer) clearInterval(machineDialogTimer);
    machineDialogTimer = null;
    getElements().mixerDialog.hidden = true;
    mixerPurgeSlot = null;
    editingMachine = null;
}

function renderInventorySummary(summary, inventory) {
    summary.textContent = '';
    const summaryPrefix = document.createElement('span');
    summaryPrefix.textContent = 'Current contents: ';
    summary.appendChild(summaryPrefix);
    const summaryStrong = document.createElement('strong');
    summaryStrong.textContent = storageContentsText(inventory);
    summary.appendChild(summaryStrong);
}

function refreshMachineDialog() {
    if (!editingMachine) return;
    const elements = getElements();
    if (elements.machineDialog.hidden) return;
    if (editingMachine.storage) {
        renderInventorySummary(elements.machineDialogStorageSummary,
            getStorageInventory(editingMachine.x, editingMachine.y));
    } else if (editingMachine.sprinkler) {
        renderInventorySummary(elements.machineDialogStorageSummary,
            getSprinklerInventory(editingMachine.x, editingMachine.y));
        updateSprinklerReleaseInput();
    } else if (editingMachine.electrical) {
        const enabled = (Math.round(getMachineSetting(editingMachine.x, editingMachine.y)) & 1) !== 0;
        const toggle = document.getElementById('machineDialogElectricalToggle');
        const state = document.getElementById('machineDialogElectricalToggleState');
        const status = document.getElementById('machineDialogStatus');
        if (toggle) toggle.checked = enabled;
        if (state) state.textContent = enabled ? 'ON' : 'OFF';
        if (status) status.textContent = isMachinePoweredAt(editingMachine.x, editingMachine.y)
            ? 'Status: Powered' : 'Status: No signal at input';
    }
    if (editingMachine.sensor) {
        renderMachineSensorStatus(elements.machineDialogSensorStatus,
            getMachineSensorStatus(editingMachine.x, editingMachine.y), editingMachine.machine);
    }
}

function updateElectricalMachineToggle() {
    if (!editingMachine?.electrical) return;
    const enabled = document.getElementById('machineDialogElectricalToggle').checked;
    setMachineSetting(editingMachine.x, editingMachine.y, enabled ? 1 : 0);
    refreshMachineDialog();
}

function formatMachineSensorThreshold(value) {
    return Number.isFinite(value) ? String(value) : '';
}

function updateMachineSensorRule() {
    if (!editingMachine?.sensor) return;
    setMachineSensorRule(editingMachine.x, editingMachine.y,
        Number.parseInt(getElements().machineDialogComparison.value, 10));
    refreshMachineDialog();
}

const MACHINE_SENSOR_STATE_LABELS = Object.freeze({
    'no-air': 'No air detected',
    blocked: 'Comparison blocked signal',
    ready: 'RULE TRUE · NO INPUT CURRENT',
    passing: 'Signal passing'
});

function machineSensorUnit(machineType) {
    return machineType === 'temperatureSwitch' ? ' °C' : '%';
}

function renderMachineSensorStatus(surface, status, machineType) {
    if (!surface || !status) return;
    const unit = machineSensorUnit(machineType);
    const reading = status.reading === null
        ? 'No air detected' : `${formatNumber(status.reading)}${unit}`;
    surface.dataset.signalState = status.state;
    const stateLabel = surface.querySelector('[data-sensor-live-state]');
    const readingLabel = surface.querySelector('[data-sensor-live-reading]');
    const comparisonLabel = surface.querySelector('[data-sensor-live-comparison]');
    const inputLabel = surface.querySelector('[data-sensor-live-input]');
    const signalLabel = surface.querySelector('[data-sensor-live-signal]');
    if (stateLabel) stateLabel.textContent = MACHINE_SENSOR_STATE_LABELS[status.state] || 'Signal blocked';
    if (readingLabel) readingLabel.textContent = `Current reading: ${reading}`;
    if (comparisonLabel) comparisonLabel.textContent =
        `Comparison: ${status.ruleLabel} ${formatMachineSensorThreshold(status.threshold)}${unit}`;
    if (inputLabel) inputLabel.textContent = `Input power: ${status.inputActive ? 'ON' : 'OFF'}`;
    if (signalLabel) signalLabel.textContent = `Signal: ${status.passing ? 'Passing' : 'Not passing'}`;
}

function createMachineSensorTooltip(machine, status) {
    const root = document.createElement('div');
    root.className = 'machine-sensor-tooltip machine-sensor-live-status';
    const title = document.createElement('strong');
    title.className = 'machine-sensor-tooltip-title';
    title.textContent = machine.def.name;
    root.appendChild(title);
    const children = [
        ['strong', 'state', 'No air detected'],
        ['span', 'reading', 'Current reading: No air detected'],
        ['span', 'comparison', 'Comparison: —'],
        ['span', 'input', 'Input power: OFF'],
        ['strong', 'signal', 'Signal: Not passing']
    ];
    for (const [tag, selector, initialText] of children) {
        const line = document.createElement(tag);
        line.setAttribute(`data-sensor-live-${selector}`, '');
        line.textContent = initialText;
        root.appendChild(line);
    }
    renderMachineSensorStatus(root, status, machine.def.machine);
    return root;
}

function updateSprinklerReleaseInput() {
    if (!editingMachine?.sprinkler) return;
    const input = getElements().machineDialogInput;
    const tubingRate = getSprinklerTubingRate(editingMachine.x, editingMachine.y);
    input.max = String(tubingRate || 100);
    input.placeholder = tubingRate ? '' : 'Not Connected';
    input.disabled = !tubingRate;
    if (!tubingRate) {
        input.value = '';
        return;
    }
    const current = getSprinklerReleaseRate(editingMachine.x, editingMachine.y);
    const value = Math.min(current, tubingRate);
    if (current !== value) setSprinklerReleaseRate(editingMachine.x, editingMachine.y, value);
    input.value = String(value);
}

function updateSprinklerReleaseToggle() {
    if (!editingMachine?.sprinkler) return;
    const elements = getElements();
    setSprinklerReleaseEnabled(editingMachine.x, editingMachine.y,
        elements.machineDialogSprinklerReleaseToggle.checked);
    renderInventorySummary(elements.machineDialogStorageSummary,
        getSprinklerInventory(editingMachine.x, editingMachine.y));
}

function updateDrainModeToggle() {
    if (!editingMachine?.sprinkler) return;
    const elements = getElements();
    setDrainModeEnabled(editingMachine.x, editingMachine.y,
        elements.machineDialogDrainModeToggle.checked);
}

function validateMachineInput() {
    if (!editingMachine) return null;
    const input = getElements().machineDialogInput;
    const spec = MACHINE_CONTROL_SPECS[editingMachine.machine];
    if (!spec) return null;
    const raw = String(input.value ?? '').trim();
    if (!raw) return null;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return null;
    if (editingMachine.sensor) {
        const value = editingMachine.machine === 'humiditySwitch'
            ? Math.max(0, Math.min(100, numeric)) : numeric;
        if (String(value) !== raw) input.value = String(value);
        setMachineSensorThreshold(editingMachine.x, editingMachine.y, value);
        getElements().machineDialogError.hidden = true;
        refreshMachineDialog();
        return value;
    }
    const max = editingMachine.sprinkler
        ? getSprinklerTubingRate(editingMachine.x, editingMachine.y)
        : spec.max;
    if (!max) return null;
    const value = Math.max(spec.min, Math.min(max, Math.round(numeric)));
    if (String(value) !== raw) input.value = String(value);
    if (editingMachine.sprinkler) setSprinklerReleaseRate(editingMachine.x, editingMachine.y, value);
    getElements().machineDialogError.hidden = true;
    return value;
}

function closeMachineDialog() {
    const elements = getElements();
    if (machineDialogTimer) clearInterval(machineDialogTimer);
    machineDialogTimer = null;
    elements.machineDialog.hidden = true;
    elements.machineDialogError.hidden = true;
    elements.machineDialogStorageSummary.hidden = true;
    elements.machineDialogStorageSummary.textContent = '';
    elements.machineDialogLabel.hidden = false;
    elements.machineDialogComparisonWrap.hidden = true;
    elements.machineDialogComparison.hidden = true;
    elements.machineDialogComparison.value = '0';
    elements.machineDialogSensorStatus.hidden = true;
    elements.machineDialogSensorStatus.dataset.signalState = 'no-air';
    renderMachineSensorStatus(elements.machineDialogSensorStatus, {
        reading: null, ruleLabel: 'Less than', threshold: 0,
        inputActive: false, passing: false, state: 'no-air'
    }, 'temperatureSwitch');
    elements.machineDialogInput.disabled = false;
    elements.machineDialogInput.hidden = false;
    elements.machineDialogInputWrap.hidden = false;
    elements.machineDialogSprinklerReleaseToggleWrap.hidden = true;
    elements.machineDialogSprinklerReleaseToggle.checked = false;
    elements.machineDialogDrainModeToggleWrap.hidden = true;
    elements.machineDialogDrainModeToggle.checked = false;
    document.getElementById('machineDialogElectricalToggleWrap').hidden = true;
    document.getElementById('machineDialogElectricalToggle').checked = false;
    document.getElementById('machineDialogStatus').hidden = true;
    document.getElementById('machineDialogStatus').textContent = '';
    elements.machineDialogOk.hidden = false;
    elements.machineDialogPurge.hidden = true;
    elements.machineDialogCancel.textContent = 'Cancel';
    editingMachine = null;
}

function openPurgeDialog() {
    if (!editingMachine?.storage) return;
    const elements = getElements();
    const inventory = getStorageInventory(editingMachine.x, editingMachine.y);
    elements.purgeDialogDescription.textContent =
        `Purge ${storageContentsText(inventory)} from this bin? The bin will then accept a new material type.`;
    elements.purgeDialog.hidden = false;
    elements.purgeDialogConfirm.focus();
}

function closePurgeDialog() {
    mixerPurgeSlot = null;
    getElements().purgeDialog.hidden = true;
}

function confirmPurgeDialog() {
    if (editingMachine?.mixer && mixerPurgeSlot !== null) {
        purgeMixerBin(editingMachine.x, editingMachine.y, mixerPurgeSlot);
        mixerPurgeSlot = null;
        closePurgeDialog();
        refreshMixerDialog();
        return;
    }
    if (!editingMachine?.storage) return;
    purgeStorageBin(editingMachine.x, editingMachine.y);
    closePurgeDialog();
    closeMachineDialog();
}

function confirmMachineDialog() {
    if (!editingMachine || editingMachine.storage || editingMachine.sprinkler) return;
    const value = validateMachineInput();
    const finalValue = value === null ? editingMachine.fallback : value;
    if (Number.isFinite(finalValue)) {
        setMachineSetting(editingMachine.x, editingMachine.y, finalValue);
    }
    closeMachineDialog();
}

function showSaveError(message) {
    const error = getElements().saveDialogError;
    error.textContent = message;
    error.hidden = false;
}

function clearSaveError() {
    const error = getElements().saveDialogError;
    error.textContent = '';
    error.hidden = true;
}

// Builds one button per particle, coloured to match the particle itself and
// filed under the heading it names in particles.json. Adding a material to that
// file is all it takes to get a button for it.
function buildParticleButtons() {
    const container = getElements().particleButtons;
    const defs = getDefinitions();
    container.innerHTML = '';

    const order = ['Powders', 'Liquids', 'Gases', 'Solids', 'Seeds', 'Metals', 'Electricals', 'LOGIC', 'Machines', 'Storage', 'Tools', 'Other', 'Vegetation'];
    const groups = {};
    for (let id = 1; id < defs.length; id++) {
        if (!defs[id]) continue;
        (groups[defs[id].group] ||= []).push(id);
    }

    const headings = Object.keys(groups).sort(
        (a, b) => order.indexOf(a) - order.indexOf(b)
    );
    const logicIds = groups.Electricals?.filter(id => defs[id].catalogSubgroup === 'LOGIC') || [];
    if (logicIds.length) headings.splice(headings.indexOf('Electricals') + 1, 0, 'LOGIC');

    for (const heading of headings) {
        const title = document.createElement('h3');
        title.className = 'panel-heading';

        const gridId = `particleGroup-${heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'panel-heading-toggle';
        const label = document.createElement('span');
        label.textContent = heading;
        const arrow = document.createElement('span');
        arrow.className = 'panel-heading-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        toggle.appendChild(label);
        toggle.appendChild(arrow);
        const initiallyExpanded = heading !== 'Vegetation';
        toggle.setAttribute('aria-expanded', String(initiallyExpanded));
        toggle.setAttribute('aria-controls', gridId);
        title.appendChild(toggle);
        container.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'particle-grid';
        grid.id = gridId;
        grid.hidden = !initiallyExpanded;
        if (heading === 'LOGIC') {
            logicIds.forEach(id => grid.appendChild(makeParticleButton(defs[id], id)));
        } else if (heading === 'Electricals') {
            groups[heading].filter(id => !defs[id].catalogSubgroup)
                .forEach(id => grid.appendChild(makeParticleButton(defs[id], id)));
        } else {
            groups[heading].forEach(id => grid.appendChild(makeParticleButton(defs[id], id)));
        }
        container.appendChild(grid);

        toggle.addEventListener('click', () => {
            const expanded = toggle.getAttribute('aria-expanded') === 'true';
            toggle.setAttribute('aria-expanded', String(!expanded));
            grid.hidden = expanded;
        });
    }

    highlightSelectedParticle();
}

function collapseVegetationCatalogGroup() {
    const container = getElements().particleButtons;
    const toggle = Array.from(container.querySelectorAll('.panel-heading-toggle'))
        .find(button => button.textContent.trim() === 'Vegetation');
    if (!toggle) return;
    toggle.setAttribute('aria-expanded', 'false');
    const grid = document.getElementById(toggle.getAttribute('aria-controls'));
    if (grid) grid.hidden = true;
}

function makeParticleButton(def, id) {
    const button = document.createElement('button');
    button.className = 'particle-button tooltip-control';
    button.textContent = def.name;
    button.style.backgroundColor = `rgb(${def.rgb[0]}, ${def.rgb[1]}, ${def.rgb[2]})`;
    button.style.color = isLightColour(def.rgb) ? '#111' : '#fff';
    button.dataset.particleId = String(id);
    button.dataset.tooltip = formatMaterialTooltip(def);

    button.addEventListener('click', () => selectParticleType(id));

    return button;
}

function selectParticleType(id) {
    // Choosing a material always leaves Grabber mode first. If the claw is
    // holding anything, setGrabberMode restores it before the new brush is
    // selected, so changing tools can never make lifted pixels disappear.
    cancelPainting();
    cancelBlueprintModes();
    setGrabberMode(false);
    setParticleTypeIdSelected(id);
    setEraserOn(false);
    getElements().eraserButton.classList.remove('active-toggle');
    highlightSelectedParticle();
}

// Material buttons use the same fixed tooltip layer as the tools panel. The
// text is assembled from the prepared definition so thresholds and reaction
// targets cannot drift away from the rules that actually run the simulation.
function formatMaterialTooltip(def) {
    const lines = [def.name, def.description, '', `${titleCase(def.category)} | density ${formatNumber(def.density)}`];
    const properties = [];

    if (def.fallSpeed > 0) properties.push(`${def.category === 'gas' ? 'rise' : 'fall'} speed ${formatNumber(def.fallSpeed)} cells/frame`);
    if (def.fallChance < 1) properties.push(`gravity acts ${formatPercent(def.fallChance)} of frames`);
    if (def.slide > 0) properties.push(`slide chance ${formatPercent(def.slide)}`);
    if (def.repose !== 1 && def.repose > 0) properties.push(`pile steepness ${formatNumber(def.repose)}`);
    if (def.spread > 0) properties.push(`liquid spread ${formatNumber(def.spread)} cells`);
    if (def.flowSteps > 1) properties.push(`${formatNumber(def.flowSteps)} flow steps/frame`);
    if (def.moveChance < 1) properties.push(`settling chance ${formatPercent(def.moveChance)}`);
    if (def.drift > 0) properties.push(`drift chance ${formatPercent(def.drift)}`);
    if (def.windLift > 0) properties.push(`wind lift ${formatPercent(def.windLift)}`);
    if (def.floatChance > 0) properties.push(`${formatPercent(def.floatChance)} are buoyant`);
    if (def.floatChance > 0 && def.floatDensity !== def.density) properties.push(`buoyant density ${formatNumber(def.floatDensity)}`);
    if (def.defaultTemp !== 8) properties.push(`starts at ${formatTemperature(def.defaultTemp)}`);
    if (def.forceTemp !== undefined) properties.push(`forces ${formatTemperature(def.forceTemp)}`);
    if (def.forceRate > 0) properties.push(`force rate ${formatNumber(def.forceRate)}`);
    if (def.projectile) properties.push(`machine projectile speed ${formatNumber(def.projectileSpeed)} cells/frame`);
    if (def.coolsBy > 0) properties.push(`cools ${formatNumber(def.coolsBy)} C/frame`);
    if (def.conductivity !== undefined && def.conductivity !== 0.06) {
        properties.push(`heat conductivity ${formatNumber(def.conductivity)}`);
    }
    if (def.cooling !== 0.004) properties.push(`air cooling ${formatPercent(def.cooling)} of the temperature gap/frame`);
    if (def.coolingVariance > 0) properties.push(`cooling varies ±${formatPercent(def.coolingVariance)}`);
    if (def.bulkInsulation > 0) properties.push(`buried-cell insulation ${formatPercent(def.bulkInsulation)}`);
    if (def.insulatedBy?.length) properties.push(`insulated by ${def.insulatedBy.length} material type${def.insulatedBy.length === 1 ? '' : 's'}`);
    if (def.bedrockKeepsMolten) properties.push('stays molten on the floor');
    if (def.emit > 0) properties.push(`heat source at ${formatTemperature(def.emit)}`);
    if (def.emitRate > 0) properties.push(`heat retention ${formatPercent(def.emitRate)}`);
    if (def.radiates > 0) properties.push(`radiates ${formatNumber(def.radiates)} C/frame`);
    if (def.clings > 0) properties.push(`clings while fueled ${formatPercent(def.clings)}`);
    if (def.conductive) {
        properties.push(`electrical conductor (${formatNumber(def.electricalConductivity)}x)`);
    }
    if (def.energizesConductors) properties.push('energizes nearby conductors');
    if (def.wireReach > 0) properties.push(`wire reach ${formatNumber(def.wireReach)} cells`);
    if (def.chargeCapacity > 0) properties.push(`stores ${formatNumber(def.chargeCapacity)} charge`);
    if (def.chargePerSpark > 0) properties.push(`adds ${formatNumber(def.chargePerSpark)} charge per Spark`);
    if (def.chargeSparkChance > 0) properties.push(`full-charge spark chance ${formatPercent(def.chargeSparkChance)}`);
    if (def.powerConsumption > 0) properties.push(`draws ${formatNumber(def.powerConsumption)} power/tick`);
    if (def.machine) properties.push(`machine: ${titleCase(def.machine)}`);
    if (def.storageCategory) properties.push(`stores one ${def.storageCategory} type, up to ${formatNumber(def.storageCapacity)} particles`);
    if (def.machine === 'collector') properties.push('suction intake stores one powder, liquid or gas type, up to 100 particles; Tubing output is capped at 30/s and limited by line capacity');
    if (def.tubing) properties.push('tubing: carries stored material between connected machines');
    if (def.machineTemp !== undefined) properties.push(`outputs ${formatTemperature(def.machineTemp)} over ${formatNumber(def.machineRange)} cells`);
    if (def.machineRate > 0) properties.push(`output rate ${formatPercent(def.machineRate)}`);
    if (def.machineEmits > 0) {
        const emitted = getDefinitions()[def.machineEmits];
        if (emitted) properties.push(`launches ${emitted.name} along its facing direction while powered`);
    }
    if (def.alpha < 1) properties.push(`opacity ${formatPercent(def.alpha)}`);
    if (def.blastProof) properties.push('blast-proof');
    if (def.fuse > 0) properties.push(`fuse ${formatNumber(def.fuse)} frames`);
    if (def.life > 0) properties.push(`lifetime ${formatNumber(def.life)} frames`);
    if (def.lifeVariance > 0) properties.push(`lifetime variation ±${formatPercent(def.lifeVariance)}`);
    if (def.blastRadius > 0) properties.push(`blast radius ${formatNumber(def.blastRadius)}`);
    if (def.displacesMaterials === false) properties.push('does not displace occupied cells');
    if (def.growHeight > 0) properties.push(`grows ${formatNumber(def.growHeightMin)}-${formatNumber(def.growHeight)} cells`);
    if (def.growStyle) properties.push(`growth style: ${def.growStyle}`);
    if (def.growChance > 0) properties.push(`growth chance ${formatPercent(def.growChance)}`);
    if (def.seedChance > 0) properties.push(`seed chance ${formatPercent(def.seedChance)}`);
    if (def.seedWaterRange > 0) properties.push(`needs water within ${formatNumber(def.seedWaterRange)} cells`);
    if (def.sproutMinTemp > -273) properties.push(`sprouts above ${formatTemperature(def.sproutMinTemp)}`);
    if (def.submergedDepth !== 4 && def.submergedDepth > 0) properties.push(`submerged at ${formatNumber(def.submergedDepth)} water cells`);
    if (def.plantSpecies) properties.push(`species ${def.plantSpecies}`);
    if (def.plantMinTemp > -273 || def.plantMaxTemp < 1000) {
        properties.push(`temperature range ${formatTemperature(def.plantMinTemp)} to ${formatTemperature(def.plantMaxTemp)}`);
    }
    if (def.plantMinHumidity > 0 || def.plantMaxHumidity < 100) {
        properties.push(`humidity range ${formatNumber(def.plantMinHumidity)}-${formatNumber(def.plantMaxHumidity)}%`);
    }
    if (def.humidityContribution > 0) properties.push(`adds local humidity ${formatNumber(def.humidityContribution)} per update`);
    if (def.latent > 0) properties.push(`latent heat ${formatNumber(def.latent)}`);
    if (def.burnLife > 0) properties.push(`burns for ${formatNumber(def.burnLife)} frames`);
    if (def.wetChance > 0) properties.push(`wetting chance ${formatPercent(def.wetChance)}`);
    if (def.waterPermeability > 0) properties.push(`water permeability ${formatPercent(def.waterPermeability)}`);
    if (def.compactDepth > 0) properties.push(`compacts below ${formatNumber(def.compactDepth)} cells`);
    if (def.soaks) properties.push('soaks into powders');
    if (def.corrodible) properties.push(`corrosion rate ${formatPercent(def.corrosion)}`);
    if (def.witherChance > 0 && def.withersPlants !== 0) properties.push(`withers chance ${formatPercent(def.witherChance)}`);
    if (def.decayChance < 1) properties.push(`decay chance ${formatPercent(def.decayChance)}`);
    if (def.lifeTransitionAt > 0) properties.push(`changes at ${formatPercent(def.lifeTransitionAt)} of lifetime`);
    if (def.smokeChance > 0) properties.push(`smoke residue chance ${formatPercent(def.smokeChance)}`);
    if (def.condenseLossChance > 0) properties.push(`condensation loss chance ${formatPercent(def.condenseLossChance)}`);
    if (def.dischargeBattery) properties.push('discharges connected Battery');
    if (def.sparkEmitterChance > 0) properties.push(`Spark emission ${formatPercent(def.sparkEmitterChance)}`);
    if (def.tool) properties.push('brush tool');

    if (properties.length) lines.push('', 'Properties', ...properties.map(value => `- ${value}`));

    const reactions = [];
    const target = id => id > 0 && getDefinitions()[id] ? getDefinitions()[id].name : 'nothing';
    if (def.meltPoint !== undefined && def.meltsInto !== 0) reactions.push(`above ${formatTemperature(def.meltPoint)} -> ${target(def.meltsInto)}`);
    if (def.freezePoint !== undefined && def.freezesInto !== 0) {
        reactions.push(`below ${formatTemperature(def.freezePoint)} -> ${target(def.freezesInto)}${def.freezeNeedsGround ? ' when supported' : ''}`);
    }
    if (def.boilPoint !== undefined && def.boilsInto !== 0) {
        const emits = def.boilEmits !== 0 ? `, emits ${target(def.boilEmits)}` : '';
        reactions.push(`above ${formatTemperature(def.boilPoint)} -> ${target(def.boilsInto)}${emits}`);
    }
    if (def.depositPoint !== undefined && def.depositsInto !== 0) reactions.push(`when air is below ${formatTemperature(def.depositPoint)} -> ${target(def.depositsInto)}`);
    if (def.dewpointCondensation) reactions.push(`condenses at or below the ${formatTemperature(getDewpointTarget())} dewpoint in humid air`);
    if (def.precipitationChance > 0) reactions.push('saturated cloud -> Water above 0 C or Snow at/below 0 C');
    if (def.evaporatesAbove !== undefined) {
        const returnsHumidity = def.evaporationHumidity > 0
            ? `, returns ${formatNumber(def.evaporationHumidity)} local humidity points`
            : '';
        reactions.push(`above ${formatTemperature(def.evaporatesAbove)} -> evaporates${returnsHumidity}`);
    }
    if (def.ignitePoint !== undefined && def.burnsInto !== 0) reactions.push(`above ${formatTemperature(def.ignitePoint)} -> ${target(def.burnsInto)}${def.emberInto !== 0 ? `, leaves ${target(def.emberInto)}` : ''}`);
    if (def.wetsInto !== 0) reactions.push(`water contact -> ${target(def.wetsInto)}`);
    if (def.quenchedInto !== 0) reactions.push(`touching Water -> ${target(def.quenchedInto)}`);
    if (def.douses) reactions.push('touching hot gas -> Smoke');
    if (def.compactsInto !== 0) reactions.push(`deep supported column -> ${target(def.compactsInto)}`);
    if (def.corrodeEmits !== 0) reactions.push(`corrosion releases ${target(def.corrodeEmits)}`);
    if (def.withersPlants !== 0) reactions.push(`withers growing materials -> ${target(def.withersPlants)}`);
    if (def.flowerInto !== 0) reactions.push(`full growth -> ${target(def.flowerInto)}`);
    if (def.seedInto !== 0) reactions.push(`flowering -> ${target(def.seedInto)}`);
    if (def.lifeTransitionInto !== 0) reactions.push(`late life -> ${target(def.lifeTransitionInto)}`);
    if (def.decaysInto !== 0) reactions.push(`expires -> ${target(def.decaysInto)}`);
    for (const rule of def.contacts || []) {
        reactions.push(`on ${target(rule.on)} -> ${target(rule.into)}${rule.temp !== undefined ? ` at ${formatTemperature(rule.temp)}` : ''}`);
    }
    for (const rule of def.convertsBelow || []) {
        reactions.push(`resting on ${target(rule.on)} -> ${target(rule.into)}${rule.temp !== undefined ? `, heats it to ${formatTemperature(rule.temp)}` : ''}`);
    }
    for (const rule of def.sprouts || []) {
        const submerged = rule.submergedInto !== 0 ? `, underwater -> ${target(rule.submergedInto)}` : '';
        reactions.push(`on ${target(rule.on)} -> ${target(rule.into)}${submerged}`);
    }
    if (reactions.length) lines.push('', 'Reactions', ...reactions.map(value => `- ${value}`));

    return lines.join('\n');
}

function formatNumber(value) {
    return Number.isInteger(value) ? String(value) : Number(value).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function formatPercent(value) { return `${formatNumber(value * 100)}%`; }

function formatTemperature(value) { return `${formatNumber(value)} C`; }

function titleCase(value) {
    return String(value || '').replace(/\b\w/g, letter => letter.toUpperCase());
}

function isLightColour(rgb) {
    return (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) > 140;
}

function highlightSelectedParticle() {
    const selected = getParticleTypeIdSelected();
    getElements().particleButtons.querySelectorAll('.particle-button').forEach(button => {
        button.classList.toggle('selected', parseInt(button.dataset.particleId) === selected);
    });
}

// The air temperature dial: a slider for a rough setting and a box beside it for
// an exact one. Either can drive the other. The simulation drifts towards
// whatever is set rather than jumping to it, so turning it down feels like the
// weather changing.
const MIN_AIR_TEMP = -60;
const MAX_AIR_TEMP = 4000;

function setUpAirTemperature() {
    const slider = getElements().airTempInput;
    const box = getElements().airTempValue;

    const apply = value => {
        const clamped = Math.max(MIN_AIR_TEMP, Math.min(MAX_AIR_TEMP, Math.round(value)));
        setAmbientTarget(clamped);
        slider.value = String(clamped);
        box.value = String(clamped);
    };

    apply(getAmbientTarget());

    slider.addEventListener('input', event => apply(parseInt(event.target.value)));

    // Typed digits are held back until the number is finished, so half typed
    // ones do not send the weather somewhere strange on the way to the one that
    // was meant. Anything else that changes the box - the spinner buttons, the
    // arrow keys, the scroll wheel - is a finished number already, so it takes
    // effect on the spot.
    let typing = false;

    box.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            typing = false;
            commitAirTemperature(apply, box);
            box.blur();
            return;
        }
        // The arrow keys step the box the same way the spinner buttons do.
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') typing = true;
    });

    box.addEventListener('input', () => {
        if (typing) return;
        commitAirTemperature(apply, box);
    });

    // Clicking away commits what was typed, rather than silently throwing the
    // number the person just entered away.
    box.addEventListener('blur', () => {
        typing = false;
        commitAirTemperature(apply, box);
    });
}

function setUpBaseHumidity() {
    const slider = getElements().baseHumidityInput;
    const output = getElements().baseHumidityValue;
    const apply = next => {
        const value = Math.max(0, Math.min(100, Math.round(Number(next))));
        setAmbientHumidityTarget(value);
        slider.value = String(value);
        output.textContent = `${value}%`;
    };
    apply(getAmbientHumidityTarget());
    slider.addEventListener('input', event => apply(event.target.value));
}

function setUpDewpoint() {
    const slider = getElements().dewpointInput;
    const output = getElements().dewpointValue;
    const apply = next => {
        const value = Math.max(0, Math.min(100, Math.round(Number(next))));
        setDewpointTarget(value);
        slider.value = String(value);
        output.textContent = `${value} °C`;
    };
    apply(getDewpointTarget());
    slider.addEventListener('input', event => apply(event.target.value));
}

// Two native range inputs share one track. General Wind is the lower handle;
// pushing it through Gust Strength moves both values, while Gust Strength
// cannot be moved below the background setting.
function setUpWindStrength() {
    const elements = getElements();
    const general = elements.generalWindStrengthInput;
    const gust = elements.windStrengthInput;
    const controls = elements.windStrengthControls;

    const apply = source => {
        let generalValue = Math.max(0, Math.min(50, Math.round(Number(general.value))));
        let gustValue = Math.max(0, Math.min(50, Math.round(Number(gust.value))));
        if (source === 'general' && generalValue > gustValue) gustValue = generalValue;
        if (source === 'gust' && gustValue < generalValue) gustValue = generalValue;

        setGeneralWindStrength(generalValue);
        setWindStrength(gustValue);
        setPhysicsGeneralWindStrength(generalValue);
        setPhysicsGustWindStrength(gustValue);
        general.value = String(generalValue);
        gust.value = String(gustValue);
        elements.generalWindStrengthValue.textContent = String(generalValue);
        elements.windStrengthValue.textContent = String(gustValue);
        controls.style.setProperty('--general-wind-position', `${generalValue * 2}%`);
        controls.style.setProperty('--gust-wind-position', `${gustValue * 2}%`);
    };

    general.value = String(getGeneralWindStrength());
    gust.value = String(getWindStrength());
    apply('');
    general.addEventListener('input', () => apply('general'));
    gust.addEventListener('input', () => apply('gust'));

    // The transparent portions of the overlapping native inputs leave one
    // clean track. Clicking or dragging that track selects the nearest thumb,
    // while keyboard input and assistive technology continue to operate each
    // independent range control directly.
    let activeSlider = null;
    const setFromPointer = event => {
        if (!activeSlider) return;
        const rect = controls.getBoundingClientRect();
        const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        activeSlider.value = String(Math.round(fraction * 50));
        activeSlider.dispatchEvent(new Event('input', { bubbles: true }));
    };
    controls.addEventListener('pointerdown', event => {
        const rect = controls.getBoundingClientRect();
        const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const position = fraction * 50;
        // General wins an exact overlap; it can then push both handles apart.
        // Once they separate, the nearest-handle rule makes either one directly
        // selectable by pointer even though their native tracks share a row.
        activeSlider = Math.abs(position - Number(general.value)) <= Math.abs(position - Number(gust.value))
            ? general : gust;
        event.preventDefault();
        activeSlider.focus({ preventScroll: true });
        controls.setPointerCapture(event.pointerId);
        setFromPointer(event);
    });
    controls.addEventListener('pointermove', event => {
        if (activeSlider && event.buttons) setFromPointer(event);
    });
    const releasePointer = () => { activeSlider = null; };
    controls.addEventListener('pointerup', releasePointer);
    controls.addEventListener('pointercancel', releasePointer);
}

// The natural breeze. Left to itself it sends a soft gust across the whole
// world every few seconds, lifting seeds, dry powders and smoke but leaving
// anything wet or heavy where it is. It is off to start with, since a world
// that blows itself about is not what someone laying out a scene wants.
function setUpAmbientWind() {
    const box = getElements().ambientWindCheckbox;
    box.checked = getAmbientWindOn();
    box.addEventListener('change', () => setAmbientWindOn(box.checked));
}

// Tooltips live at document level instead of inside the scrolling tools panel.
// A high z-index alone cannot escape an ancestor's overflow clipping, whereas
// this fixed layer can sit over the canvas and every panel.
function setUpTooltips() {
    const panels = [getElements().buttonRow, getElements().toolsPanel, getElements().particleButtons, getElements().worldSizeDialog];
    const tooltip = document.getElementById('toolTooltip');
    const controls = panels.flatMap(panel => Array.from(panel.querySelectorAll('.tooltip-control')));

    const hide = () => { tooltip.hidden = true; };
    const show = control => {
        tooltip.textContent = control.dataset.tooltip || control.title || '';
        tooltip.hidden = false;

        const controlRect = control.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const gap = 10;
        const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 1024;
        const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 768;

        let left = controlRect.left - tooltipRect.width - gap;
        if (left < gap) left = Math.min(viewportWidth - tooltipRect.width - gap, controlRect.right + gap);
        let top = controlRect.top + (controlRect.height - tooltipRect.height) / 2;
        top = Math.max(gap, Math.min(viewportHeight - tooltipRect.height - gap, top));

        tooltip.style.left = `${Math.round(left)}px`;
        tooltip.style.top = `${Math.round(top)}px`;
    };

    controls.forEach(control => {
        control.setAttribute('aria-describedby', 'toolTooltip');
        control.addEventListener('mouseenter', () => show(control));
        control.addEventListener('mouseleave', hide);
        control.addEventListener('focusin', () => show(control));
        control.addEventListener('focusout', hide);
    });
    panels.forEach(panel => panel.addEventListener('scroll', hide));
    window.addEventListener('resize', () => { hide(); hideMachineTooltip(); });
}

function machineTooltipText(machine) {
    const def = machine.def;
    if (machine.tubing) {
        const tubeCell = index(machine.x, machine.y);
        const flow = getTubingFlows().find(candidate => candidate.cells?.includes(tubeCell));
        return [
            'Tubing',
            `Flow: ${formatNumber(flow?.rate || 0)}/s`,
            flow ? 'Status: Flowing' : 'Status: No active flow'
        ].join('\n');
    }
    const lines = [def.name];
    if (isStorageMachineDefinition(def)) {
        lines.push(`Contents: ${storageContentsText(getStorageInventory(machine.x, machine.y))}`);
        const flow = getTubingFlows().find(candidate => candidate.source === index(machine.x, machine.y));
        if (flow) lines.push(`Tubing: Connected (${formatNumber(flow.rate)}/s)`);
        lines.push('Status: Active (no power required)');
        return lines.join('\n');
    }
    if (def.machine === 'sprinkler') {
        lines.push(`Contents: ${storageContentsText(getSprinklerInventory(machine.x, machine.y))}`);
        lines.push(`Release rate: ${formatNumber(getSprinklerReleaseRate(machine.x, machine.y))}/s`);
        lines.push(`Release: ${isSprinklerReleaseEnabled(machine.x, machine.y) ? 'On' : 'Off'}`);
        lines.push(`Drain Mode: ${isDrainModeEnabled(machine.x, machine.y) ? 'On' : 'Off'}`);
        lines.push('Click to change Sprinkler settings');
        return lines.join('\n');
    }

    const setting = getMachineSetting(machine.x, machine.y);
    if (def.machine === 'fan') lines.push(`Wind speed: ${formatNumber(setting)}`);
    else if (def.machine === 'heater' || def.machine === 'cooler') {
        lines.push(`Temperature: ${formatNumber(setting)} \u00b0C`);
    } else if (def.machine === 'simpleSwitch') {
        const enabled = (Math.round(setting || 0) & 1) !== 0;
        lines.push(`Switch: ${enabled ? 'ON' : 'OFF'}`);
        lines.push(`Status: ${enabled && isMachinePoweredAt(machine.x, machine.y)
            ? 'Signal passing' : 'Signal blocked or no input'}`);
        lines.push('Click to change Simple Switch settings');
        return lines.join('\n');
    } else if (def.machine === 'lamp') {
        const enabled = (Math.round(setting || 0) & 1) !== 0;
        lines.push(`Switch: ${enabled ? 'ON' : 'OFF'}`);
        lines.push(`Status: ${enabled && isMachinePoweredAt(machine.x, machine.y)
            ? 'Lit' : enabled ? 'No signal at input' : 'Off'}`);
        lines.push(`Light emission: ${enabled && isMachinePoweredAt(machine.x, machine.y) ? 'ON' : 'OFF'}`);
        lines.push('Reach: 360° over 15 cells; distance 15 receives 1/15 intensity');
        lines.push(`Illumination received: ${formatNumber(getIlluminationAt(machine.x, machine.y))}%`);
        lines.push('Click to change Lamp settings');
        return lines.join('\n');
    }
    lines.push(`Status: ${isMachinePoweredAt(machine.x, machine.y) ? 'Powered / active' : 'Not powered'}`);
    return lines.join('\n');
}

function renderMachineTooltip(machine, event) {
    const tooltip = document.getElementById('toolTooltip');
    if (!tooltip) return;
    if (!machine.tubing && (machine.def.machine === 'temperatureSwitch' || machine.def.machine === 'humiditySwitch')) {
        tooltip.textContent = '';
        tooltip.appendChild(createMachineSensorTooltip(machine,
            getMachineSensorStatus(machine.x, machine.y)));
    } else {
        tooltip.textContent = machineTooltipText(machine);
    }
    tooltip.hidden = false;

    const viewportWidth = window.innerWidth || 1024;
    const viewportHeight = window.innerHeight || 768;
    const gap = 14;
    const tooltipRect = tooltip.getBoundingClientRect();
    let left = (event?.clientX || 0) + gap;
    let top = (event?.clientY || 0) + gap;
    if (left + tooltipRect.width > viewportWidth - gap) left = Math.max(gap, (event?.clientX || 0) - tooltipRect.width - gap);
    if (top + tooltipRect.height > viewportHeight - gap) top = Math.max(gap, (event?.clientY || 0) - tooltipRect.height - gap);
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
}

function showMachineTooltip(machine, event) {
    machineTooltipTarget = { x: machine.x, y: machine.y, id: machine.id, tubing: !!machine.tubing };
    machineTooltipAnchor = { clientX: event.clientX, clientY: event.clientY };
    renderMachineTooltip(machine, machineTooltipAnchor);
    if (!machineTooltipTimer) machineTooltipTimer = setInterval(refreshMachineTooltip, 150);
}

function refreshMachineTooltip() {
    if (!machineTooltipTarget) return;
    const machine = machineTooltipTarget.tubing
        ? tubingAtCell(machineTooltipTarget)
        : machineAtCell(machineTooltipTarget);
    if (!machine || machine.id !== machineTooltipTarget.id) {
        hideMachineTooltip();
        return;
    }
    renderMachineTooltip(machine, machineTooltipAnchor);
}

function hideMachineTooltip() {
    if (machineTooltipTimer) clearInterval(machineTooltipTimer);
    machineTooltipTimer = null;
    machineTooltipTarget = null;
    machineTooltipAnchor = null;
    const tooltip = document.getElementById('toolTooltip');
    if (tooltip) tooltip.hidden = true;
}

function selectDrawingMode(mode) {
    const next = ['line', 'rectangle', 'ellipse'].includes(mode) ? mode : 'brush';
    cancelBlueprintModes();
    setDrawMode(next);
    setGrabberMode(false);
    cancelPainting();

    syncDrawingModeButtons(next);
}

function syncDrawingModeButtons(mode) {
    const elements = getElements();
    const buttons = [
        ['brush', elements.brushModeButton],
        ['line', elements.lineModeButton],
        ['rectangle', elements.rectangleModeButton],
        ['ellipse', elements.ellipseModeButton]
    ];
    buttons.forEach(([buttonMode, button]) => {
        const active = buttonMode === mode;
        button.classList.toggle('active-toggle', active);
        button.setAttribute('aria-pressed', String(active));
    });

    const brushSizeEnabled = mode === 'brush' || mode === 'line';
    elements.brushSizeInput.disabled = !brushSizeEnabled;
    elements.brushSizeInput.classList.toggle('disabled-control', !brushSizeEnabled);
    elements.brushSizeLabel.classList.toggle('disabled-control', !brushSizeEnabled);
}

// --------------------------------------------------------------- blueprints

function setWorkspace(workspace) {
    const elements = getElements();
    const showingBlueprints = workspace === 'blueprints';
    elements.toolsWorkspace.hidden = showingBlueprints;
    elements.blueprintsWorkspace.hidden = !showingBlueprints;
    elements.toolsTabButton.classList.toggle('active-toggle', !showingBlueprints);
    elements.blueprintsTabButton.classList.toggle('active-toggle', showingBlueprints);
    elements.toolsTabButton.setAttribute('aria-selected', String(!showingBlueprints));
    elements.blueprintsTabButton.setAttribute('aria-selected', String(showingBlueprints));
}

function beginMarqueeMode() {
    // Clicking the active Marquee control is a cancellation just like using a
    // different tool, so it also resumes the world.
    if (marqueeMode) {
        cancelBlueprintModes();
        return;
    }
    // A marquee takes ownership of canvas input, so finish any ordinary stroke
    // and return a held Grabber payload before its first corner is placed.
    cancelPainting();
    setGrabberMode(false);
    setEraserOn(false);
    getElements().eraserButton.classList.remove('active-toggle');
    activeBlueprintSlot = null;
    marqueeMode = true;
    isMarqueeDrawing = false;
    marqueeStart = null;
    marqueeSelection = null;
    updateMarqueeOverlay();
    hideStampPreview();
    updateBlueprintControls();
}

function cancelBlueprintModes() {
    const wasMarqueeMode = marqueeMode;
    marqueeMode = false;
    isMarqueeDrawing = false;
    marqueeStart = null;
    marqueeSelection = null;
    activeBlueprintSlot = null;
    updateMarqueeOverlay();
    hideStampPreview();
    updateBlueprintControls();
    // A marquee pauses the world for capture. Every route that cancels that
    // marquee deliberately returns the simulation to play, including a
    // material/tool change and a right-click on the canvas.
    if (wasMarqueeMode && getSimulationPaused()) {
        setSimulationPaused(false);
        getElements().pauseButton.textContent = 'Pause';
    }
}

function hasBlueprintMode() {
    return marqueeMode || activeBlueprintSlot !== null;
}

function beginMarqueeAt(cell) {
    marqueeStart = clampCell(cell);
    marqueeSelection = rectangularSelection(marqueeStart, marqueeStart);
    isMarqueeDrawing = true;
    // Capturing a stable snapshot is important, and this only changes a
    // running simulation. A game the player already paused stays paused.
    if (!getSimulationPaused()) {
        setSimulationPaused(true);
        getElements().pauseButton.textContent = 'Play';
    }
    updateMarqueeOverlay();
    updateBlueprintControls();
}

function updateMarqueeAt(cell) {
    if (!marqueeStart) return;
    marqueeSelection = rectangularSelection(marqueeStart, clampCell(cell));
    updateMarqueeOverlay();
    updateBlueprintControls();
}

function rectangularSelection(start, end) {
    return {
        left: Math.min(start.x, end.x),
        right: Math.max(start.x, end.x),
        top: Math.min(start.y, end.y),
        bottom: Math.max(start.y, end.y)
    };
}

function clampCell(cell) {
    return {
        x: Math.max(0, Math.min(getGridCols() - 1, cell.x)),
        y: Math.max(0, Math.min(getGridRows() - 1, cell.y))
    };
}

function updateMarqueeOverlay() {
    const overlay = getElements().marqueeOverlay;
    if (!marqueeSelection || !marqueeMode) {
        overlay.hidden = true;
        return;
    }
    const { left, right, top, bottom } = marqueeSelection;
    overlay.style.left = `${(left / getGridCols()) * 100}%`;
    overlay.style.top = `${(top / getGridRows()) * 100}%`;
    overlay.style.width = `${((right - left + 1) / getGridCols()) * 100}%`;
    overlay.style.height = `${((bottom - top + 1) / getGridRows()) * 100}%`;
    overlay.hidden = false;
}

function copyMarqueeSelection() {
    if (!marqueeSelection) return;
    const { left, right, top, bottom } = marqueeSelection;
    const blueprint = captureBlueprint(left, top, right, bottom);
    if (!blueprint) return;

    const slot = nextBlueprintSlot;
    blueprints[slot] = blueprint;
    nextBlueprintSlot = (nextBlueprintSlot + 1) % blueprints.length;
    const button = getElements().blueprintSlots.querySelector(`[data-blueprint-slot="${slot}"]`);
    button.hidden = false;
    drawBlueprintPreview(button, blueprint);
    updateBlueprintControls();
    // The regular five-minute autosave also carries blueprints, but a
    // newly captured design is important enough to save immediately when this
    // playthrough has a local resume slot.
    void writeAutosave();
}

function captureBlueprintLibrary() {
    return {
        sprinklerModeVersion: 2,
        machinePortLayoutVersion: 2,
        fanWindScale: FAN_WIND_SCALE,
        slots: blueprints,
        nextSlot: nextBlueprintSlot
    };
}

function restoreBlueprintLibrary(state) {
    blueprints = Array.from({ length: BLUEPRINT_SLOT_COUNT }, (_, slot) => state.slots[slot] || null);
    for (const blueprint of blueprints) {
        if (!blueprint?.cells || blueprint.machinePortLayoutVersion === 2) continue;
        migrateLegacyMachinePortEndpointRemap(blueprint.cells.type,
            blueprint.cells.machinePortEndpointRemap, blueprint.width, blueprint.height,
            blueprint.cells.data, blueprint.cells.machinePortEndpointSlot);
        blueprint.machinePortLayoutVersion = 2;
    }
    if (state.fanWindScale !== FAN_WIND_SCALE) {
        for (const blueprint of blueprints) {
            if (blueprint?.cells) {
                migrateLegacyFanWindSettings(blueprint.cells.type, blueprint.cells.machineSetting);
            }
        }
    }
    nextBlueprintSlot = state.nextSlot;
    marqueeMode = false;
    isMarqueeDrawing = false;
    marqueeStart = null;
    marqueeSelection = null;
    activeBlueprintSlot = null;
    clearStampHistory();
    updateMarqueeOverlay();
    hideStampPreview();
    renderBlueprintLibrary();
    updateBlueprintControls();
}

function resetBlueprintLibrary() {
    restoreBlueprintLibrary({ slots: Array(BLUEPRINT_SLOT_COUNT).fill(null), nextSlot: 0 });
}

function renderBlueprintLibrary() {
    getElements().blueprintSlots.querySelectorAll('.blueprint-slot').forEach(button => {
        const slot = parseInt(button.dataset.blueprintSlot);
        const blueprint = blueprints[slot];
        button.hidden = !blueprint;
        if (blueprint) drawBlueprintPreview(button, blueprint);
    });
}

function stampActiveBlueprint() {
    const blueprint = blueprints[activeBlueprintSlot];
    if (!blueprint) return;
    const startX = Math.round(currentCell.x - (blueprint.width - 1) / 2);
    const startY = Math.round(currentCell.y - (blueprint.height - 1) / 2);
    const before = captureBlueprint(startX, startY,
        startX + blueprint.width - 1, startY + blueprint.height - 1);
    if (!before) return;
    stampBlueprint(blueprint, currentCell.x, currentCell.y);
    const after = captureBlueprint(before.left, before.top,
        before.left + before.width - 1, before.top + before.height - 1);
    if (!after) return;

    stampUndoHistory.push({ left: before.left, top: before.top, before, after });
    if (stampUndoHistory.length > STAMP_HISTORY_LIMIT) stampUndoHistory.shift();
    stampRedoHistory = [];
    updateStampHistoryControls();
}

function undoBlueprintStamp() {
    const entry = stampUndoHistory.pop();
    if (!entry) return;
    stampBlueprintAt(entry.before, entry.left, entry.top);
    stampRedoHistory.push(entry);
    updateStampHistoryControls();
}

function redoBlueprintStamp() {
    const entry = stampRedoHistory.pop();
    if (!entry) return;
    stampBlueprintAt(entry.after, entry.left, entry.top);
    stampUndoHistory.push(entry);
    updateStampHistoryControls();
}

function clearStampHistory() {
    stampUndoHistory = [];
    stampRedoHistory = [];
    updateStampHistoryControls();
}

function updateStampHistoryControls() {
    const elements = getElements();
    elements.undoBlueprintButton.disabled = stampUndoHistory.length === 0;
    elements.redoBlueprintButton.disabled = stampRedoHistory.length === 0;
}

function drawBlueprintPreview(button, blueprint) {
    const canvas = button.querySelector('canvas');
    const preview = canvas.getContext('2d');
    preview.clearRect(0, 0, canvas.width, canvas.height);
    const source = document.createElement('canvas');
    source.width = blueprint.width;
    source.height = blueprint.height;
    const sourceContext = source.getContext('2d');
    const image = sourceContext.createImageData(blueprint.width, blueprint.height);
    const defs = getDefinitions();
    for (let i = 0; i < blueprint.cells.type.length; i++) {
        const def = defs[blueprint.cells.type[i]];
        if (!def) continue;
        const p = i * 4;
        image.data[p] = def.rgb[0];
        image.data[p + 1] = def.rgb[1];
        image.data[p + 2] = def.rgb[2];
        image.data[p + 3] = Math.round(255 * (def.alpha === undefined ? 1 : def.alpha));
    }
    sourceContext.putImageData(image, 0, 0);
    preview.imageSmoothingEnabled = false;
    const scale = Math.min(canvas.width / blueprint.width, canvas.height / blueprint.height);
    const width = Math.max(1, Math.floor(blueprint.width * scale));
    const height = Math.max(1, Math.floor(blueprint.height * scale));
    preview.drawImage(source, Math.floor((canvas.width - width) / 2), Math.floor((canvas.height - height) / 2), width, height);
}

function selectBlueprintForStamp(slot) {
    if (!blueprints[slot]) return;
    marqueeMode = false;
    isMarqueeDrawing = false;
    marqueeStart = null;
    marqueeSelection = null;
    activeBlueprintSlot = slot;
    // Selecting a stored blueprint immediately returns the world to play, as
    // requested, so the stamped result rejoins the living simulation.
    if (getSimulationPaused()) {
        setSimulationPaused(false);
        getElements().pauseButton.textContent = 'Pause';
    }
    updateMarqueeOverlay();
    updateStampPreview(currentCell);
    updateBlueprintControls();
}

function updateStampPreview(cell) {
    const blueprint = blueprints[activeBlueprintSlot];
    const preview = getElements().blueprintStampPreview;
    if (!blueprint) {
        preview.hidden = true;
        return;
    }
    const target = clampCell(cell);
    const startX = Math.round(target.x - (blueprint.width - 1) / 2);
    const startY = Math.round(target.y - (blueprint.height - 1) / 2);
    preview.style.left = `${(startX / getGridCols()) * 100}%`;
    preview.style.top = `${(startY / getGridRows()) * 100}%`;
    preview.style.width = `${(blueprint.width / getGridCols()) * 100}%`;
    preview.style.height = `${(blueprint.height / getGridRows()) * 100}%`;

    const canvas = preview.querySelector('canvas');
    if (canvas.width !== blueprint.width || canvas.height !== blueprint.height ||
        canvas.dataset.blueprintSlot !== String(activeBlueprintSlot)) {
        canvas.width = blueprint.width;
        canvas.height = blueprint.height;
        const context = canvas.getContext('2d');
        const image = context.createImageData(blueprint.width, blueprint.height);
        const defs = getDefinitions();
        for (let i = 0; i < blueprint.cells.type.length; i++) {
            const def = defs[blueprint.cells.type[i]];
            if (!def) continue;
            const p = i * 4;
            image.data[p] = def.rgb[0];
            image.data[p + 1] = def.rgb[1];
            image.data[p + 2] = def.rgb[2];
            image.data[p + 3] = Math.round(255 * (def.alpha === undefined ? 1 : def.alpha));
        }
        context.putImageData(image, 0, 0);
        canvas.dataset.blueprintSlot = String(activeBlueprintSlot);
    }
    preview.hidden = false;
}

function hideStampPreview() {
    getElements().blueprintStampPreview.hidden = true;
}

function updateBlueprintControls() {
    const elements = getElements();
    elements.marqueeButton.classList.toggle('active-toggle', marqueeMode);
    elements.marqueeButton.setAttribute('aria-pressed', String(marqueeMode));
    elements.copyBlueprintButton.disabled = !marqueeSelection;
    elements.blueprintSlots.querySelectorAll('.blueprint-slot').forEach(button => {
        button.classList.toggle('active-toggle', parseInt(button.dataset.blueprintSlot) === activeBlueprintSlot);
    });
}

function commitAirTemperature(apply, box) {
    const typed = parseInt(box.value);
    if (Number.isNaN(typed)) {
        box.value = String(Math.round(getAmbientTarget()));
        return;
    }
    apply(typed);
}

//------------------------------------------------------------- canvas input

function setUpCanvasViewportInput() {
    const elements = getElements();
    const area = elements.canvasArea;
    if (!area) return;

    area.addEventListener('wheel', event => {
        // Vertical wheel input belongs exclusively to zoom. Modified and
        // horizontal-only gestures remain available to the browser/viewport.
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.deltaY === 0) return;
        event.preventDefault();
        const next = getCanvasZoomLevel() + (event.deltaY < 0 ? 1 : -1);
        const changed = setCanvasZoomLevel(next, {
            anchorX: event.clientX,
            anchorY: event.clientY
        });
        if (changed && !hasCanvasScrollExtent(area)) stopEdgePan();
    }, { passive: false });

    area.addEventListener('pointermove', event => {
        if (event.pointerType !== 'mouse') {
            stopEdgePan();
            return;
        }
        edgePanPointer = { x: event.clientX, y: event.clientY };
        if (canEdgePan()) startEdgePan();
        else stopEdgePanFrame();
    });
    area.addEventListener('pointerleave', () => stopEdgePan());
    window.addEventListener('blur', () => stopEdgePan());

    if (elements.edgePanToggle) {
        elements.edgePanToggle.checked = false;
        elements.edgePanToggle.addEventListener('change', () => {
            if (!elements.edgePanToggle.checked) stopEdgePan();
            else if (edgePanPointer) startEdgePan();
        });
    }
}

function canEdgePan() {
    const elements = getElements();
    return !!elements.edgePanToggle?.checked && hasCanvasScrollExtent(elements.canvasArea) &&
        !isPainting && !isGrabbing && !getGrabberOn() && !marqueeMode && !isMarqueeDrawing;
}

function hasCanvasScrollExtent(area = getElements().canvasArea) {
    return !!area && (area.scrollWidth > area.clientWidth + 1 || area.scrollHeight > area.clientHeight + 1);
}

function startEdgePan() {
    if (edgePanFrame !== null || !canEdgePan()) return;
    edgePanLastTime = performance.now();
    edgePanFrame = requestAnimationFrame(edgePanTick);
}

function stopEdgePanFrame() {
    if (edgePanFrame !== null) cancelAnimationFrame(edgePanFrame);
    edgePanFrame = null;
}

function stopEdgePan() {
    stopEdgePanFrame();
    edgePanPointer = null;
}

function edgePanTick(now) {
    edgePanFrame = null;
    if (!canEdgePan() || !edgePanPointer) return;
    const area = getElements().canvasArea;
    const rect = area.getBoundingClientRect();
    const edgeX = rect.width * 0.05;
    const edgeY = rect.height * 0.05;
    if (edgeX <= 0 || edgeY <= 0 ||
        edgePanPointer.x < rect.left || edgePanPointer.x > rect.right ||
        edgePanPointer.y < rect.top || edgePanPointer.y > rect.bottom) {
        stopEdgePan();
        return;
    }

    let directionX = 0;
    let directionY = 0;
    if (edgePanPointer.x < rect.left + edgeX) {
        directionX = -1 + (edgePanPointer.x - rect.left) / edgeX;
    } else if (edgePanPointer.x > rect.right - edgeX) {
        directionX = 1 - (rect.right - edgePanPointer.x) / edgeX;
    }
    if (edgePanPointer.y < rect.top + edgeY) {
        directionY = -1 + (edgePanPointer.y - rect.top) / edgeY;
    } else if (edgePanPointer.y > rect.bottom - edgeY) {
        directionY = 1 - (rect.bottom - edgePanPointer.y) / edgeY;
    }
    const canScrollX = area.scrollWidth > area.clientWidth + 1;
    const canScrollY = area.scrollHeight > area.clientHeight + 1;
    if (!canScrollX) directionX = 0;
    if (!canScrollY) directionY = 0;
    const maxScrollLeft = Math.max(0, area.scrollWidth - area.clientWidth);
    const maxScrollTop = Math.max(0, area.scrollHeight - area.clientHeight);
    const canMoveX = directionX < 0 ? area.scrollLeft > 0
        : directionX > 0 ? area.scrollLeft < maxScrollLeft : false;
    const canMoveY = directionY < 0 ? area.scrollTop > 0
        : directionY > 0 ? area.scrollTop < maxScrollTop : false;
    if (!canMoveX && !canMoveY) return;

    const elapsed = Math.min(50, Math.max(0, now - edgePanLastTime));
    edgePanLastTime = now;
    if (canMoveX) {
        area.scrollLeft = Math.max(0, Math.min(maxScrollLeft,
            area.scrollLeft + directionX * EDGE_PAN_MAX_SPEED * elapsed / 1000));
    }
    if (canMoveY) {
        area.scrollTop = Math.max(0, Math.min(maxScrollTop,
            area.scrollTop + directionY * EDGE_PAN_MAX_SPEED * elapsed / 1000));
    }
    const canContinueX = directionX < 0 ? area.scrollLeft > 0
        : directionX > 0 ? area.scrollLeft < maxScrollLeft : false;
    const canContinueY = directionY < 0 ? area.scrollTop > 0
        : directionY > 0 ? area.scrollTop < maxScrollTop : false;
    if (canEdgePan() && (canContinueX || canContinueY)) {
        edgePanFrame = requestAnimationFrame(edgePanTick);
    }
}

function setUpCanvasInput() {
    const canvas = getElements().canvas;

    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('auxclick', event => {
        if (event.button === 1) event.preventDefault();
    });

    canvas.addEventListener('mousedown', event => {
        if (event.button === 1) {
            event.preventDefault();
            stopEdgePan();
            if (!['brush', 'line', 'rectangle', 'ellipse'].includes(getDrawMode()) ||
                getGrabberOn() || getEraserOn() || hasBlueprintMode() || selectedMachine()) return;

            const cell = cellFromEvent(event);
            const world = getWorld();
            if (!world || cell.x < 0 || cell.y < 0 || cell.x >= world.cols || cell.y >= world.rows) return;
            const type = world.type[index(cell.x, cell.y)];
            if (type <= 0 || !getDefinitions()[type]) return;
            selectParticleType(type);
            return;
        }
        stopEdgePan();
        lastPointerEvent = event;
        currentCell = cellFromEvent(event);
        setHoverCell(currentCell.x, currentCell.y, event.clientX, event.clientY);
        const pointerMachine = machineAtPointer(event);
        updateMachineCursor(currentCell, event);

        // Blueprint modes have first claim on a click. A right click always
        // exits them, without performing the normal temporary eraser action.
        if (event.button === 2 && hasBlueprintMode()) {
            cancelBlueprintModes();
            return;
        }
        if (event.button === 0 && activeBlueprintSlot !== null) {
            updateStampPreview(currentCell);
            stampActiveBlueprint();
            return;
        }
        if (marqueeMode) {
            if (event.button === 0) beginMarqueeAt(currentCell);
            return;
        }

        if (machinePlacement?.stage === 'extensionPreview') {
            if (event.button === 2) cancelPainting();
            else if (event.button === 0) commitMachinePlacementLead(event);
            return;
        }

        // Defer a left-click on an idle visible port until pointer-up. A short
        // click opens the same controls as the machine body; a drag becomes a
        // forced Tubing/Copper connector stroke.
        if (event.button === 0 && !getGrabberOn() && !getEraserOn()) {
            const port = getMachinePortAtClientPoint(event.clientX, event.clientY, null, 20);
            if (port) {
                deferredMachinePortGesture = {
                    port,
                    startClientX: event.clientX,
                    startClientY: event.clientY
                };
                return;
            }
        }

        // A left click on an existing machine edits that machine instead of
        // starting a paint stroke. Grabber mode keeps priority so machines can
        // still be moved normally.
        if (event.button === 0 && !getGrabberOn() && !getEraserOn() && pointerMachine &&
            openMachineDialog(pointerMachine.x, pointerMachine.y, pointerMachine)) {
            cancelPainting();
            return;
        }

        if (getGrabberOn()) {
            // Right click is the quick way out of Grabber mode. If something
            // is currently held, cancelling safely restores it first.
            if (event.button === 2) {
                isGrabbing = false;
                setGrabberMode(false);
                return;
            }
            if (event.button !== 0) return;
            isGrabbing = beginGrab(currentCell.x, currentCell.y, getGrabberSize()) > 0;
            return;
        }

        isPainting = true;
        beginRayStroke(event, event.button === 0);
        // Right button erases without having to switch tool.
        if (event.button === 2) setEraserOn(true);
        lastCell = null;
        const machine = selectedMachine();
        if (event.button === 0 && machine) {
            const initialDirection = machine === 'collector' ? 3 : 0;
            machinePlacement = canPlaceMachine(currentCell.x, currentCell.y, machine)
                ? { x: currentCell.x, y: currentCell.y, machine,
                    direction: initialDirection, stage: 'poseSelecting' }
                : null;
            isPainting = !!machinePlacement;
            if (machinePlacement) setMachinePlacementPreview(
                machinePlacement.x, machinePlacement.y, machinePlacement.machine, machinePlacement.direction);
            return;
        }
        if (getDrawMode() === 'line') {
            lineStart = { x: currentCell.x, y: currentCell.y };
            setLinePreview(lineStart.x, lineStart.y, currentCell.x, currentCell.y);
        } else if (isShapeMode()) {
            shapeMode = getDrawMode();
            shapeStart = { x: currentCell.x, y: currentCell.y };
            setShapePreview(shapeMode, shapeStart.x, shapeStart.y,
                currentCell.x, currentCell.y);
        } else {
            paintAtCurrentCell();
            startPaintTimer();
        }
    });

    canvas.addEventListener('mousemove', event => {
        lastPointerEvent = event;
        currentCell = cellFromEvent(event);
        setHoverCell(currentCell.x, currentCell.y, event.clientX, event.clientY);
        updateMachineCursor(currentCell, event);
        if (deferredMachinePortGesture || activeMachinePortGesture) {
            updateMachinePortGesture(event);
            return;
        }
        if (activeBlueprintSlot !== null) updateStampPreview(currentCell);
        if (isMarqueeDrawing) {
            updateMarqueeAt(currentCell);
            return;
        }
        if (isGrabbing) return;
        if (machinePlacement?.stage === 'extensionPreview') {
            previewMachinePlacementLead(event);
            return;
        }
        if (!isPainting) return;
        updateRayStrokeDirection(event);
        if (machinePlacement || selectedMachine()) {
            if (machinePlacement) {
                const dx = currentCell.x - machinePlacement.x;
                const dy = currentCell.y - machinePlacement.y;
                if (dx !== 0 || dy !== 0) {
                    machinePlacement.direction = fanDirection(dx, dy);
                    setMachinePlacementPreview(machinePlacement.x, machinePlacement.y,
                        machinePlacement.machine, machinePlacement.direction);
                }
            }
            return;
        }
        if (getDrawMode() === 'line' && lineStart) {
            setLinePreview(lineStart.x, lineStart.y, currentCell.x, currentCell.y);
        } else if (shapeStart && isShapeMode(shapeMode)) {
            setShapePreview(shapeMode, shapeStart.x, shapeStart.y,
                currentCell.x, currentCell.y);
        } else {
            paintAtCurrentCell();
        }
    });

    window.addEventListener('mouseup', event => {
        if (event.button === 1) return;
        lastPointerEvent = event;
        if (deferredMachinePortGesture) {
            const port = deferredMachinePortGesture.port;
            deferredMachinePortGesture = null;
            if (event.button === 0) finishDeferredMachinePortClick(port, event);
            return;
        }
        if (activeMachinePortGesture) {
            const gesture = activeMachinePortGesture;
            updateMachinePortConnectorPreview(gesture, event);
            paintMachinePortConnector(gesture.port, event.clientX, event.clientY);
            clearMachinePortGesture();
            return;
        }
        if (isMarqueeDrawing) {
            if (event.button === 0) updateMarqueeAt(currentCell);
            isMarqueeDrawing = false;
            return;
        }
        if (isGrabbing) {
            if (event.button === 0) dropGrab(currentCell.x, currentCell.y);
            isGrabbing = false;
            return;
        }
        if (!isPainting) return;
        finishPainting(event.button);
    });

    canvas.addEventListener('mouseleave', () => {
        lastCell = null;
        setHoverCell(-1, -1);
        updateMachineCursor({ x: -1, y: -1 });
        hideStampPreview();
    });

    // Touch support, so it works on a tablet as well.
    canvas.addEventListener('touchstart', event => {
        stopEdgePan();
        event.preventDefault();
        lastPointerEvent = event.touches[0];
        currentCell = cellFromEvent(event.touches[0]);
        setHoverCell(currentCell.x, currentCell.y, event.touches[0].clientX, event.touches[0].clientY);
        const pointerMachine = machineAtPointer(event.touches[0]);
        updateMachineCursor(currentCell, event.touches[0]);
        if (activeBlueprintSlot !== null) {
            stampActiveBlueprint();
            return;
        }
        if (marqueeMode) {
            beginMarqueeAt(currentCell);
            return;
        }
        if (machinePlacement?.stage === 'extensionPreview') {
            commitMachinePlacementLead(event.touches[0]);
            return;
        }
        if (!getGrabberOn() && !getEraserOn()) {
            const port = getMachinePortAtClientPoint(event.touches[0].clientX,
                event.touches[0].clientY, null, 20);
            if (port) {
                deferredMachinePortGesture = {
                    port,
                    startClientX: event.touches[0].clientX,
                    startClientY: event.touches[0].clientY
                };
                return;
            }
        }
        if (!getGrabberOn() && !getEraserOn() && pointerMachine &&
            openMachineDialog(pointerMachine.x, pointerMachine.y, pointerMachine)) {
            cancelPainting();
            return;
        }
        if (getGrabberOn()) {
            isGrabbing = beginGrab(currentCell.x, currentCell.y, getGrabberSize()) > 0;
            return;
        }
        isPainting = true;
        beginRayStroke(event.touches[0], true);
        lastCell = null;
        const machine = selectedMachine();
        if (machine) {
            const initialDirection = machine === 'collector' ? 3 : 0;
            machinePlacement = canPlaceMachine(currentCell.x, currentCell.y, machine)
                ? { x: currentCell.x, y: currentCell.y, machine,
                    direction: initialDirection, stage: 'poseSelecting' }
                : null;
            isPainting = !!machinePlacement;
            if (machinePlacement) setMachinePlacementPreview(
                machinePlacement.x, machinePlacement.y, machinePlacement.machine, machinePlacement.direction);
            return;
        }
        if (getDrawMode() === 'line') {
            lineStart = { x: currentCell.x, y: currentCell.y };
            setLinePreview(lineStart.x, lineStart.y, currentCell.x, currentCell.y);
        } else if (isShapeMode()) {
            shapeMode = getDrawMode();
            shapeStart = { x: currentCell.x, y: currentCell.y };
            setShapePreview(shapeMode, shapeStart.x, shapeStart.y,
                currentCell.x, currentCell.y);
        } else {
            paintAtCurrentCell();
            startPaintTimer();
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', event => {
        event.preventDefault();
        lastPointerEvent = event.touches[0];
        currentCell = cellFromEvent(event.touches[0]);
        setHoverCell(currentCell.x, currentCell.y, event.touches[0].clientX, event.touches[0].clientY);
        if (deferredMachinePortGesture || activeMachinePortGesture) {
            updateMachinePortGesture(event.touches[0]);
            return;
        }
        if (isMarqueeDrawing) {
            updateMarqueeAt(currentCell);
            return;
        }
        if (isGrabbing) return;
        if (machinePlacement?.stage === 'extensionPreview') {
            previewMachinePlacementLead(event.touches[0]);
            return;
        }
        if (!isPainting) return;
        updateRayStrokeDirection(event.touches[0]);
        if (machinePlacement || selectedMachine()) {
            if (machinePlacement) {
                const dx = currentCell.x - machinePlacement.x;
                const dy = currentCell.y - machinePlacement.y;
                if (dx !== 0 || dy !== 0) {
                    machinePlacement.direction = fanDirection(dx, dy);
                    setMachinePlacementPreview(machinePlacement.x, machinePlacement.y,
                        machinePlacement.machine, machinePlacement.direction);
                }
            }
            return;
        }
        if (getDrawMode() === 'line' && lineStart) {
            setLinePreview(lineStart.x, lineStart.y, currentCell.x, currentCell.y);
        } else if (shapeStart && isShapeMode(shapeMode)) {
            setShapePreview(shapeMode, shapeStart.x, shapeStart.y,
                currentCell.x, currentCell.y);
        } else {
            paintAtCurrentCell();
        }
    }, { passive: false });

    canvas.addEventListener('touchend', event => {
        const touch = event.changedTouches?.[0] || lastPointerEvent;
        if (deferredMachinePortGesture) {
            const port = deferredMachinePortGesture.port;
            deferredMachinePortGesture = null;
            if (touch) finishDeferredMachinePortClick(port, touch);
            return;
        }
        if (activeMachinePortGesture) {
            const gesture = activeMachinePortGesture;
            if (touch) updateMachinePortConnectorPreview(gesture, touch);
            if (touch) paintMachinePortConnector(gesture.port, touch.clientX, touch.clientY);
            clearMachinePortGesture();
            return;
        }
        if (isMarqueeDrawing) {
            updateMarqueeAt(currentCell);
            isMarqueeDrawing = false;
            return;
        }
        if (isGrabbing) {
            dropGrab(currentCell.x, currentCell.y);
            isGrabbing = false;
            return;
        }
        if (isPainting) finishPainting(0);
    });
}

function finishPainting(button) {
    if (machinePlacement) {
        isPainting = false;
        lastCell = null;
        clearRayStrokeState();
        stopPaintTimer();
        if (button !== 0) {
            cancelPainting();
            if (button === 2) setEraserOn(false);
            return;
        }
        machinePlacement.stage = 'extensionPreview';
        previewMachinePlacementLead();
        return;
    }
    if (shapeStart && isShapeMode(shapeMode)) {
        const start = shapeStart;
        const shape = shapeMode;
        clearShapePreview();
        if (button === 0) paintShape(shape, start.x, start.y, currentCell.x, currentCell.y,
            strokeRayDirection);
    } else if (getDrawMode() === 'line' && lineStart) {
        clearLinePreview();
        paintLine(lineStart.x, lineStart.y, currentCell.x, currentCell.y, strokeRayDirection);
    }
    isPainting = false;
    lineStart = null;
    shapeStart = null;
    shapeMode = null;
    lastCell = null;
    clearRayStrokeState();
    stopPaintTimer();
    if (button === 2) setEraserOn(false);
}

function cancelPainting() {
    clearMachinePortGesture();
    isPainting = false;
    machinePlacement = null;
    clearMachinePlacementPreview();
    setMachinePortConnectorPreview(null);
    lineStart = null;
    shapeStart = null;
    shapeMode = null;
    lastCell = null;
    clearRayStrokeState();
    stopPaintTimer();
    clearLinePreview();
    clearShapePreview();
}

function isShapeMode(mode = getDrawMode()) {
    return mode === 'rectangle' || mode === 'ellipse';
}

function selectedMachine() {
    const selected = getParticleTypeIdSelected();
    const def = getDefinitions()[selected];
    return def?.machine || null;
}

function rayDirectionForDefinition(definition) {
    if (definition?.name === 'Heat Ray') return 2; // up
    if (definition?.name === 'Cold Ray') return 3; // down
    return null;
}

function beginRayStroke(pointer, isLeftButton) {
    lastStrokePointer = pointer && Number.isFinite(pointer.clientX) && Number.isFinite(pointer.clientY)
        ? { x: pointer.clientX, y: pointer.clientY }
        : null;
    const selected = getDefinitions()[getParticleTypeIdSelected()];
    strokeRayDirection = isLeftButton && !getEraserOn()
        ? rayDirectionForDefinition(selected)
        : null;
}

function updateRayStrokeDirection(pointer) {
    if (strokeRayDirection === null || !lastStrokePointer || !pointer) return;
    const dx = pointer.clientX - lastStrokePointer.x;
    const dy = pointer.clientY - lastStrokePointer.y;
    if (dx !== 0 || dy !== 0) strokeRayDirection = rayDirection(dx, dy);
    if (Number.isFinite(pointer.clientX) && Number.isFinite(pointer.clientY)) {
        lastStrokePointer = { x: pointer.clientX, y: pointer.clientY };
    }
}

function clearRayStrokeState() {
    strokeRayDirection = null;
    lastStrokePointer = null;
}

function fanDirection(dx, dy) {
    if (dx === 0 && dy === 0) return 0; // right
    const horizontal = Math.abs(dx);
    const vertical = Math.abs(dy);
    if (horizontal >= vertical * 2) return dx >= 0 ? 0 : 1;
    if (vertical >= horizontal * 2) return dy < 0 ? 2 : 3; // up, down
    if (dx >= 0 && dy < 0) return 4; // up-right
    if (dx < 0 && dy < 0) return 5; // up-left
    if (dx < 0 && dy >= 0) return 6; // down-left
    return 7; // down-right
}

function rayDirection(dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 0 : 1; // right, left
    return dy < 0 ? 2 : 3; // up, down
}

function setGrabberMode(on) {
    if (!on) {
        cancelGrab();
        isGrabbing = false;
    } else {
        setEraserOn(false);
        getElements().eraserButton.classList.remove('active-toggle');
    }
    setGrabberOn(on);
    getElements().grabberButton.classList.toggle('active-toggle', on);
    getElements().grabberButton.setAttribute('aria-pressed', String(on));
}

// The canvas is one pixel per cell but is stretched by CSS, so the on screen
// position has to be scaled back down to grid coordinates.
function cellFromEvent(event) {
    const canvas = getElements().canvas;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * getGridCols());
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * getGridRows());
    return { x: x, y: y };
}

function paintAtCurrentCell() {
    if (!getEraserOn() && lastPointerEvent) {
        const nearbyPort = getMachinePortAtClientPoint(lastPointerEvent.clientX,
            lastPointerEvent.clientY, getParticleTypeIdSelected(), 20);
        if (nearbyPort && !nearbyPort.connected) {
            if (lastCell) paintLine(lastCell.x, lastCell.y,
                nearbyPort.connectionCell.x, nearbyPort.connectionCell.y, strokeRayDirection);
            paintCell(currentCell.x, currentCell.y, 0, 0, strokeRayDirection, nearbyPort);
            lastCell = { ...nearbyPort.connectionCell };
            return;
        }
    }
    if (!getEraserOn() && lastPointerEvent && machineAtPointer(lastPointerEvent)) {
        // Only visible machine artwork blocks paint. Transparent overlay pixels
        // remain available for ordinary brush strokes and Collector rails.
        lastCell = { x: currentCell.x, y: currentCell.y };
        return;
    }
    if (lastCell) {
        paintLine(lastCell.x, lastCell.y, currentCell.x, currentCell.y, strokeRayDirection);
    } else {
        paintCell(currentCell.x, currentCell.y, 0, 0, strokeRayDirection);
    }
    lastCell = { x: currentCell.x, y: currentCell.y };
}

// Holding the mouse still should keep pouring particles out, so keep painting
// on a timer as well as on movement.
function startPaintTimer() {
    if (paintTimer) return;
    paintTimer = setInterval(() => {
        if (isPainting) paintAtCurrentCell();
    }, 30);
}

function stopPaintTimer() {
    clearInterval(paintTimer);
    paintTimer = null;
}

function setUpKeyboardShortcuts() {
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && machinePlacement) {
            event.preventDefault();
            cancelPainting();
            return;
        }
        const keyScrolls = {
            ArrowLeft: { left: -CANVAS_SCROLL_STEP, top: 0 },
            ArrowRight: { left: CANVAS_SCROLL_STEP, top: 0 },
            ArrowUp: { left: 0, top: -CANVAS_SCROLL_STEP },
            ArrowDown: { left: 0, top: CANVAS_SCROLL_STEP }
        };
        const scrollDelta = keyScrolls[event.key];
        const target = event.target;
        const controlFocused = target &&
            (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName) || target.isContentEditable);
        // Let focused controls keep their native Space behavior instead of
        // redirecting the key to the global play/pause shortcut.
        if (event.key === ' ' && controlFocused) return;
        const area = getElements().canvasArea;
        const axisCanScroll = scrollDelta && (scrollDelta.left
            ? area.scrollWidth > area.clientWidth + 1
            : area.scrollHeight > area.clientHeight + 1);
        if (scrollDelta && axisCanScroll && !controlFocused &&
            !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
            area.scrollLeft += scrollDelta.left;
            area.scrollTop += scrollDelta.top;
            event.preventDefault();
            return;
        }
        // Not while someone is typing a temperature into the box, or pressing
        // space would pause the game instead of going into the number.
        const typing = event.target && /^(INPUT|TEXTAREA)$/.test(event.target.tagName);
        if (typing) return;

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            if (event.shiftKey) redoBlueprintStamp();
            else undoBlueprintStamp();
        } else if (event.key === ' ') {
            event.preventDefault();
            getElements().pauseButton.click();
        } else if (event.key === 'e' || event.key === 'E') {
            getElements().eraserButton.click();
        } else if (event.key === 'h' || event.key === 'H') {
            setHeatViewOn(!getHeatViewOn());
            synchroniseVisualizationButtons();
        } else if (event.key === '[') {
            adjustBrush(-2);
        } else if (event.key === ']') {
            adjustBrush(2);
        }
    });
}

function adjustBrush(delta) {
    const size = Math.max(1, Math.min(31, getBrushSize() + delta));
    setBrushSize(size);
    getElements().brushSizeInput.value = String(size);
    getElements().brushSizeValue.textContent = String(size);
}

export function disableActivateButton(button, action, activeClass) {
    switch (action) {
        case 'active':
            button.classList.remove('disabled');
            button.classList.add(activeClass);
            break;
        case 'disable':
            button.classList.remove(activeClass);
            button.classList.add('disabled');
            break;
    }
}
