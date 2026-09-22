export let stateLoading = false;

//ELEMENTS
let elements;

//CONSTANTS
export let gameState;
export const MENU_STATE = 'menuState';
export const GAME_VISIBLE_ACTIVE = 'gameVisibleActive';
export const GAME_VISIBLE_PAUSED = 'gameVisiblePaused';
// The world starts at the original width, then game.js adds columns on first
// launch to use the available workspace without changing the displayed cell
// size. Rows stay fixed so the extra room is genuinely extra world.
export let GRID_COLS = 200;
export let GRID_ROWS = 150;

//GLOBAL VARIABLES
let particleDefinitions = null;
let particleTypeIdSelected = 1; //starting particle sand
let brushSize = 3;
let drawMode = 'brush';
let grabberSize = 15;
let windStrength = 2;
let eraserOn = false;
let grabberOn = false;
let heatViewOn = false;
let simulationPaused = false;

//FLAGS
let beginGameState = true;
let gameInProgress = false;

//GETTER SETTER METHODS
export function setElements() {
    elements = {
        menu: document.getElementById('menu'),
        menuTitle: document.getElementById('menuTitle'),
        newGameMenuButton: document.getElementById('newGame'),
        resumeGameButton: document.getElementById('resumeGame'),
        importGameMenuButton: document.getElementById('importGameMenu'),
        canvas: document.getElementById('canvas'),
        canvasArea: document.getElementById('canvasArea'),
        canvasStage: document.getElementById('canvasStage'),
        machineOverlay: document.getElementById('machineOverlay'),
        canvasContainer: document.getElementById('canvasContainer'),
        buttonRow: document.getElementById('buttonRow'),
        overlay: document.getElementById('overlay'),
        pauseButton: document.getElementById('pauseButton'),
        clearButton: document.getElementById('clearButton'),
        heatViewButton: document.getElementById('heatViewButton'),
        eraserButton: document.getElementById('eraserButton'),
        exportGameButton: document.getElementById('exportGame'),
        importGameButton: document.getElementById('importGame'),
        grabberButton: document.getElementById('grabberButton'),
        brushModeButton: document.getElementById('brushModeButton'),
        lineModeButton: document.getElementById('lineModeButton'),
        rectangleModeButton: document.getElementById('rectangleModeButton'),
        ellipseModeButton: document.getElementById('ellipseModeButton'),
        brushSizeInput: document.getElementById('brushSize'),
        brushSizeLabel: document.getElementById('brushSizeLabel'),
        brushSizeValue: document.getElementById('brushSizeValue'),
        grabberSizeInput: document.getElementById('grabberSize'),
        grabberSizeLabel: document.getElementById('grabberSizeLabel'),
        grabberSizeValue: document.getElementById('grabberSizeValue'),
        airTempInput: document.getElementById('airTemp'),
        airTempValue: document.getElementById('airTempValue'),
        airTempLabel: document.getElementById('airTempLabel'),
        layerLapseInput: document.getElementById('layerLapse'),
        layerLapseLabel: document.getElementById('layerLapseLabel'),
        layerLapseValue: document.getElementById('layerLapseValue'),
        airLayersCheckbox: document.getElementById('airLayers'),
        windStrengthInput: document.getElementById('windStrength'),
        windStrengthLabel: document.getElementById('windStrengthLabel'),
        windStrengthValue: document.getElementById('windStrengthValue'),
        ambientWindCheckbox: document.getElementById('ambientWind'),
        floatingContainer: document.getElementById('floatingContainer'),
        toolsPanel: document.getElementById('toolsPanel'),
        toolsTabButton: document.getElementById('toolsTabButton'),
        blueprintsTabButton: document.getElementById('blueprintsTabButton'),
        toolsWorkspace: document.getElementById('toolsWorkspace'),
        blueprintsWorkspace: document.getElementById('blueprintsWorkspace'),
        marqueeButton: document.getElementById('marqueeButton'),
        copyBlueprintButton: document.getElementById('copyBlueprintButton'),
        blueprintSlots: document.getElementById('blueprintSlots'),
        undoBlueprintButton: document.getElementById('undoBlueprintButton'),
        redoBlueprintButton: document.getElementById('redoBlueprintButton'),
        marqueeOverlay: document.getElementById('marqueeOverlay'),
        blueprintStampPreview: document.getElementById('blueprintStampPreview'),
        particleButtons: document.getElementById('particleButtons'),
        readout: document.getElementById('readout'),
        chargeIndicator: document.getElementById('chargeIndicator'),
        chargeIndicatorFill: document.getElementById('chargeIndicatorFill'),
        chargeIndicatorValue: document.getElementById('chargeIndicatorValue'),
        themeSwatches: document.getElementById('themeSwatches'),
        themeSelect: document.getElementById('themeSelect'),
        autosaveStatus: document.getElementById('autosaveStatus'),
        saveDialog: document.getElementById('saveDialog'),
        saveDialogTitle: document.getElementById('saveDialogTitle'),
        saveDialogDescription: document.getElementById('saveDialogDescription'),
        saveString: document.getElementById('saveString'),
        saveDialogError: document.getElementById('saveDialogError'),
        closeSaveDialog: document.getElementById('closeSaveDialog'),
        copySaveString: document.getElementById('copySaveString'),
        loadSaveString: document.getElementById('loadSaveString'),
        autosaveChoiceDialog: document.getElementById('autosaveChoiceDialog'),
        autosaveChoiceDescription: document.getElementById('autosaveChoiceDescription'),
        autosaveChoiceYes: document.getElementById('autosaveChoiceYes'),
        autosaveChoiceNo: document.getElementById('autosaveChoiceNo'),
        autosaveChoiceCancel: document.getElementById('autosaveChoiceCancel'),
        clearDialog: document.getElementById('clearDialog'),
        clearDialogConfirm: document.getElementById('clearDialogConfirm'),
        clearDialogCancel: document.getElementById('clearDialogCancel'),
        machineDialog: document.getElementById('machineDialog'),
        machineDialogTitle: document.getElementById('machineDialogTitle'),
        machineDialogDescription: document.getElementById('machineDialogDescription'),
        machineDialogStorageSummary: document.getElementById('machineDialogStorageSummary'),
        machineDialogLabel: document.getElementById('machineDialogLabel'),
        machineDialogInputWrap: document.getElementById('machineDialogInputWrap'),
        machineDialogInput: document.getElementById('machineDialogInput'),
        machineDialogUnit: document.getElementById('machineDialogUnit'),
        machineDialogVentToggleWrap: document.getElementById('machineDialogVentToggleWrap'),
        machineDialogVentToggle: document.getElementById('machineDialogVentToggle'),
        machineDialogError: document.getElementById('machineDialogError'),
        machineDialogOk: document.getElementById('machineDialogOk'),
        machineDialogPurge: document.getElementById('machineDialogPurge'),
        machineDialogCancel: document.getElementById('machineDialogCancel'),
        mixerDialog: document.getElementById('mixerDialog'),
        mixerDialogTitle: document.getElementById('mixerDialogTitle'),
        mixerDialogDescription: document.getElementById('mixerDialogDescription'),
        mixerDialogBinSummary0: document.getElementById('mixerDialogBinSummary0'),
        mixerDialogBinSummary1: document.getElementById('mixerDialogBinSummary1'),
        mixerDialogBinSummary2: document.getElementById('mixerDialogBinSummary2'),
        mixerDialogBinFill0: document.getElementById('mixerDialogBinFill0'),
        mixerDialogBinFill1: document.getElementById('mixerDialogBinFill1'),
        mixerDialogBinFill2: document.getElementById('mixerDialogBinFill2'),
        mixerDialogBinPurge0: document.getElementById('mixerDialogBinPurge0'),
        mixerDialogBinPurge1: document.getElementById('mixerDialogBinPurge1'),
        mixerDialogToggle: document.getElementById('mixerDialogToggle'),
        mixerDialogCancel: document.getElementById('mixerDialogCancel'),
        purgeDialog: document.getElementById('purgeDialog'),
        purgeDialogDescription: document.getElementById('purgeDialogDescription'),
        purgeDialogConfirm: document.getElementById('purgeDialogConfirm'),
        purgeDialogCancel: document.getElementById('purgeDialogCancel')
    };
}

export function setGameStateVariable(value) {
    gameState = value;
}

export function getGameStateVariable() {
    return gameState;
}

export function getElements() {
    return elements;
}

export function resetAllVariables() {
    // GLOBAL VARIABLES

    // FLAGS
}

export function getMenuState() {
    return MENU_STATE;
}

export function getGameVisiblePaused() {
    return GAME_VISIBLE_PAUSED;
}

export function getGameVisibleActive() {
    return GAME_VISIBLE_ACTIVE;
}

export function getBeginGameStatus() {
    return beginGameState;
}

export function setBeginGameStatus(value) {
    beginGameState = value;
}

export function getGameInProgress() {
    return gameInProgress;
}

export function setGameInProgress(value) {
    gameInProgress = value;
}

export function getGridCols() {
    return GRID_COLS;
}

export function setGridCols(value) {
    GRID_COLS = Math.max(200, Math.floor(value));
}

export function getGridRows() {
    return GRID_ROWS;
}

export function setGridRows(value) {
    GRID_ROWS = Math.max(1, Math.floor(value));
}

export function getParticleDefinitions() {
    return particleDefinitions;
}

export function setParticleDefinitions(value) {
    particleDefinitions = value;
}

export function getParticleTypeIdSelected() {
    return particleTypeIdSelected;
}

export function setParticleTypeIdSelected(value) {
    particleTypeIdSelected = value;
}

export function getBrushSize() {
    return brushSize;
}

export function setBrushSize(value) {
    brushSize = value;
}

export function getDrawMode() {
    return drawMode;
}

export function setDrawMode(value) {
    drawMode = ['line', 'rectangle', 'ellipse'].includes(value) ? value : 'brush';
}

export function getGrabberSize() {
    return grabberSize;
}

export function setGrabberSize(value) {
    grabberSize = value;
}

export function getGrabberOn() {
    return grabberOn;
}

export function setGrabberOn(value) {
    grabberOn = !!value;
}

export function getWindStrength() {
    return windStrength;
}

export function setWindStrength(value) {
    windStrength = value;
}

export function getEraserOn() {
    return eraserOn;
}

export function setEraserOn(value) {
    eraserOn = value;
}

export function getHeatViewOn() {
    return heatViewOn;
}

export function setHeatViewOn(value) {
    heatViewOn = value;
}

export function getSimulationPaused() {
    return simulationPaused;
}

export function setSimulationPaused(value) {
    simulationPaused = value;
}
