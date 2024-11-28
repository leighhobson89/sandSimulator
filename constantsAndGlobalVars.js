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
export const GRID_COLS = 120;
export const GRID_ROWS = 90;

//GLOBAL VARIABLES
let mainStateGrid = [];

let particleDefinitions = null;
let particleTypeIdSelected = 1; //starting particle sand

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
        returnToMenuButton: document.getElementById('returnToMenu'),
        canvas: document.getElementById('canvas'),
        canvasContainer: document.getElementById('canvasContainer'),
        buttonRow: document.getElementById('buttonRow'),
        overlay: document.getElementById('overlay'),
        button1: document.getElementById('button1'),
        button2: document.getElementById('button2'),
        floatingContainer: document.getElementById('floatingContainer'),
        particle1: document.getElementById('particle1'), // Sand
        particle2: document.getElementById('particle2'), // Water
        particle3: document.getElementById('particle3'), // Fire
        particle4: document.getElementById('particle4'), // Ice
        particle5: document.getElementById('particle5'), // Oil
        particle6: document.getElementById('particle6'), // Lava
        particle7: document.getElementById('particle7'), // Glass
        particle8: document.getElementById('particle8') // Mud
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

export function getNumberOfEnemySquares() {
    return NUMBER_OF_ENEMY_SQUARES;
}

export function getInitialSpeedPlayer() {
    return INITIAL_SPEED_PLAYER;
}

export function getInitialSpeedMovingEnemy() {
    return INITIAL_SPEED_MOVING_ENEMY;
}

export function getMaxAttemptsToDrawEnemies() {
    return MAX_ATTEMPTS_TO_DRAW_ENEMIES;
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

export function getGridRows() {
    return GRID_ROWS;
}

export function getParticleDefinitions() {
    return particleDefinitions;
}

export function setParticleDefinitions(value) {
    particleDefinitions = value;
}

export function getMainStateGrid() {
    return mainStateGrid;
}

export function setMainStateGrid(value) {
    mainStateGrid = value;
}

export function getParticleTypeIdSelected() {
    return particleTypeIdSelected;
}

export function setParticleTypeIdSelected(value) {
    particleTypeIdSelected = value;
}