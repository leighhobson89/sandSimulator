//DEBUG
export let debugFlag = false;
export let debugOptionFlag = false;
export let stateLoading = false;

//ELEMENTS
let elements;
let localization = {};
let language = 'en';
let languageSelected = 'en';
let oldLanguage = 'en';

//CONSTANTS
export let gameState;
export const MENU_STATE = 'menuState';
export const GAME_VISIBLE_ACTIVE = 'gameVisibleActive';
export const GAME_VISIBLE_PAUSED = 'gameVisiblePaused';
// The world starts at the original width, then game.js adds columns on first
// launch to use the available workspace without changing the displayed cell
// size. Rows stay fixed so the extra room is genuinely extra world.
export let GRID_COLS = 200;
export const GRID_ROWS = 150;

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
let audioMuted;
let languageChangedFlag;
let beginGameState = true;
let gameInProgress = false;

let autoSaveOn = false;
export let pauseAutoSaveCountdown = true;

//GETTER SETTER METHODS
export function setElements() {
    elements = {
        menu: document.getElementById('menu'),
        menuTitle: document.getElementById('menuTitle'),
        newGameMenuButton: document.getElementById('newGame'),
        canvas: document.getElementById('canvas'),
        canvasContainer: document.getElementById('canvasContainer'),
        buttonRow: document.getElementById('buttonRow'),
        overlay: document.getElementById('overlay'),
        pauseButton: document.getElementById('pauseButton'),
        clearButton: document.getElementById('clearButton'),
        heatViewButton: document.getElementById('heatViewButton'),
        eraserButton: document.getElementById('eraserButton'),
        grabberButton: document.getElementById('grabberButton'),
        brushModeButton: document.getElementById('brushModeButton'),
        lineModeButton: document.getElementById('lineModeButton'),
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
        particleButtons: document.getElementById('particleButtons'),
        readout: document.getElementById('readout'),
        chargeIndicator: document.getElementById('chargeIndicator'),
        chargeIndicatorFill: document.getElementById('chargeIndicatorFill'),
        chargeIndicatorValue: document.getElementById('chargeIndicatorValue'),
        themeSwatches: document.getElementById('themeSwatches'),
        themeSelect: document.getElementById('themeSelect')
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

export function getLanguageChangedFlag() {
    return languageChangedFlag;
}

export function setLanguageChangedFlag(value) {
    languageChangedFlag = value;
}

export function resetAllVariables() {
    // GLOBAL VARIABLES

    // FLAGS
}

export function captureGameStatusForSaving() {
    let gameState = {};

    // Game variables

    // Flags

    // UI elements

    gameState.language = getLanguage();

    return gameState;
}

export function restoreGameStatus(gameState) {
    return new Promise((resolve, reject) => {
        try {
            // Game variables

            // Flags

            // UI elements

            setLanguage(gameState.language);

            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

export function setLocalization(value) {
    localization = value;
}

export function getLocalization() {
    return localization;
}

export function setLanguage(value) {
    language = value;
}

export function getLanguage() {
    return language;
}

export function setOldLanguage(value) {
    oldLanguage = value;
}

export function getOldLanguage() {
    return oldLanguage;
}

export function setAudioMuted(value) {
    audioMuted = value;
}

export function getAudioMuted() {
    return audioMuted;
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

export function getLanguageSelected() {
    return languageSelected;
}

export function setLanguageSelected(value) {
    languageSelected = value;
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
    drawMode = value === 'line' ? 'line' : 'brush';
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
