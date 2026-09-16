// ui.js
// -----------------------------------------------------------------------------
// Buttons, the particle picker and mouse handling.
//
// The particle buttons are built from particles.json at startup, so adding a new
// particle to that file is all it takes to get a button for it.
// -----------------------------------------------------------------------------

import {
    setParticleTypeIdSelected, getParticleTypeIdSelected, getGameVisibleActive,
    getGridCols, getGridRows, getLanguage, setElements, getElements,
    setBeginGameStatus, getGameInProgress, setGameInProgress, getMenuState,
    getLanguageSelected, setLanguageSelected, setLanguage,
    getBrushSize, setBrushSize, getEraserOn, setEraserOn,
    getHeatViewOn, setHeatViewOn, getSimulationPaused, setSimulationPaused,
    getWindStrength, setWindStrength
} from './constantsAndGlobalVars.js';
import {
    loadParticleDefinitions, initializeWorld, setGameState, startGame,
    paintLine, paintCell, clearCanvasWorld, setHoverCell
} from './game.js';
import {
    getDefinitions, setAmbientTarget, getAmbientTarget, setLayerLapse, getLayerLapse
} from './physics.js';
import { initLocalization, localize } from './localization.js';

let isPainting = false;
let lastCell = null;
let paintTimer = null;
let currentCell = { x: 0, y: 0 };

document.addEventListener('DOMContentLoaded', async () => {
    await loadParticleDefinitions();
    initializeWorld();
    setElements();
    buildParticleButtons();

    const elements = getElements();

    elements.newGameMenuButton.addEventListener('click', async () => {
        setBeginGameStatus(true);
        if (!getGameInProgress()) {
            setGameInProgress(true);
        }
        setGameState(getGameVisibleActive());
        startGame();
    });

    elements.returnToMenuButton.addEventListener('click', () => {
        setGameState(getMenuState());
    });

    elements.pauseButton.addEventListener('click', () => {
        setSimulationPaused(!getSimulationPaused());
        elements.pauseButton.textContent = getSimulationPaused() ? 'Play' : 'Pause';
    });

    elements.clearButton.addEventListener('click', () => {
        clearCanvasWorld();
    });

    elements.heatViewButton.addEventListener('click', () => {
        setHeatViewOn(!getHeatViewOn());
        elements.heatViewButton.classList.toggle('active-toggle', getHeatViewOn());
    });

    elements.eraserButton.addEventListener('click', () => {
        setEraserOn(!getEraserOn());
        elements.eraserButton.classList.toggle('active-toggle', getEraserOn());
    });

    elements.brushSizeInput.addEventListener('input', event => {
        setBrushSize(parseInt(event.target.value));
        elements.brushSizeLabel.textContent = `Brush ${getBrushSize()}`;
    });

    setGameState(getMenuState());
    // Awaited: the menu button labels are looked up as soon as the game starts,
    // so clicking New Game before this finished used to throw.
    await handleLanguageChange(getLanguageSelected());
    setUpAirTemperature();
    setUpAirLayers();
    setUpWindStrength();
    setUpCanvasInput();
    setUpKeyboardShortcuts();
});

// Builds one button per particle, coloured to match the particle itself and
// filed under the heading it names in particles.json. Adding a material to that
// file is all it takes to get a button for it.
function buildParticleButtons() {
    const container = getElements().particleButtons;
    const defs = getDefinitions();
    container.innerHTML = '';

    const order = ['Powders', 'Liquids', 'Gases', 'Solids', 'Tools', 'Other'];
    const groups = {};
    for (let id = 1; id < defs.length; id++) {
        if (!defs[id]) continue;
        (groups[defs[id].group] ||= []).push(id);
    }

    const headings = Object.keys(groups).sort(
        (a, b) => order.indexOf(a) - order.indexOf(b)
    );

    for (const heading of headings) {
        const title = document.createElement('h3');
        title.className = 'panel-heading';
        title.textContent = heading;
        container.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'particle-grid';
        groups[heading].forEach(id => grid.appendChild(makeParticleButton(defs[id], id)));
        container.appendChild(grid);
    }

    highlightSelectedParticle();
}

function makeParticleButton(def, id) {
    const button = document.createElement('button');
    button.className = 'particle-button';
    button.textContent = def.name;
    button.style.backgroundColor = `rgb(${def.rgb[0]}, ${def.rgb[1]}, ${def.rgb[2]})`;
    button.style.color = isLightColour(def.rgb) ? '#111' : '#fff';
    button.dataset.particleId = String(id);

    button.addEventListener('click', () => {
        setParticleTypeIdSelected(id);
        setEraserOn(false);
        getElements().eraserButton.classList.remove('active-toggle');
        highlightSelectedParticle();
    });

    return button;
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
const MAX_AIR_TEMP = 600;

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

    // The box only takes effect on Enter, so half typed numbers do not send the
    // weather somewhere strange on the way to the one that was meant.
    box.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        commitAirTemperature(apply, box);
        box.blur();
    });

    // Clicking away commits it too, rather than silently throwing the number
    // the person just typed away.
    box.addEventListener('blur', () => commitAirTemperature(apply, box));
}

// How pronounced the layering of the air is: the number of degrees colder each
// fifth of the height is than the one below it. Zero makes the air one even
// temperature from top to bottom.
function setUpAirLayers() {
    const slider = getElements().layerLapseInput;
    const label = getElements().layerLapseLabel;

    const apply = value => {
        setLayerLapse(value);
        label.textContent = `Layers ${value.toFixed(1)}`;
    };

    slider.value = String(getLayerLapse());
    apply(getLayerLapse());
    slider.addEventListener('input', event => apply(parseFloat(event.target.value)));
}

// How hard the wind tool blows: how many cells it shoves things along, and how
// vigorously it stirs the air.
function setUpWindStrength() {
    const slider = getElements().windStrengthInput;
    const label = getElements().windStrengthLabel;

    const apply = value => {
        setWindStrength(value);
        label.textContent = `Wind ${value}`;
    };

    slider.value = String(getWindStrength());
    apply(getWindStrength());
    slider.addEventListener('input', event => apply(parseInt(event.target.value)));
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

function setUpCanvasInput() {
    const canvas = getElements().canvas;

    canvas.addEventListener('contextmenu', event => event.preventDefault());

    canvas.addEventListener('mousedown', event => {
        isPainting = true;
        // Right button erases without having to switch tool.
        if (event.button === 2) setEraserOn(true);
        currentCell = cellFromEvent(event);
        lastCell = null;
        paintAtCurrentCell();
        startPaintTimer();
    });

    canvas.addEventListener('mousemove', event => {
        currentCell = cellFromEvent(event);
        setHoverCell(currentCell.x, currentCell.y);
        if (isPainting) paintAtCurrentCell();
    });

    window.addEventListener('mouseup', event => {
        if (!isPainting) return;
        isPainting = false;
        lastCell = null;
        stopPaintTimer();
        if (event.button === 2) setEraserOn(false);
    });

    canvas.addEventListener('mouseleave', () => {
        lastCell = null;
        setHoverCell(-1, -1);
    });

    // Touch support, so it works on a tablet as well.
    canvas.addEventListener('touchstart', event => {
        event.preventDefault();
        isPainting = true;
        currentCell = cellFromEvent(event.touches[0]);
        lastCell = null;
        paintAtCurrentCell();
        startPaintTimer();
    }, { passive: false });

    canvas.addEventListener('touchmove', event => {
        event.preventDefault();
        currentCell = cellFromEvent(event.touches[0]);
        paintAtCurrentCell();
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
        isPainting = false;
        lastCell = null;
        stopPaintTimer();
    });
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
    if (lastCell) {
        paintLine(lastCell.x, lastCell.y, currentCell.x, currentCell.y);
    } else {
        paintCell(currentCell.x, currentCell.y);
    }
    lastCell = { x: currentCell.x, y: currentCell.y };
}

// Holding the mouse still should keep pouring particles out, so keep painting
// on a timer as well as on movement.
function startPaintTimer() {
    if (paintTimer) return;
    paintTimer = setInterval(() => {
        if (isPainting) paintCell(currentCell.x, currentCell.y);
    }, 30);
}

function stopPaintTimer() {
    clearInterval(paintTimer);
    paintTimer = null;
}

function setUpKeyboardShortcuts() {
    document.addEventListener('keydown', event => {
        // Not while someone is typing a temperature into the box, or pressing
        // space would pause the game instead of going into the number.
        const typing = event.target && /^(INPUT|TEXTAREA)$/.test(event.target.tagName);
        if (typing) return;

        if (event.key === ' ') {
            event.preventDefault();
            getElements().pauseButton.click();
        } else if (event.key === 'e' || event.key === 'E') {
            getElements().eraserButton.click();
        } else if (event.key === 'h' || event.key === 'H') {
            getElements().heatViewButton.click();
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
    getElements().brushSizeLabel.textContent = `Brush ${size}`;
}

//------------------------------------------------------------- localization

async function setElementsLanguageText() {
    // The big heading on the menu screen is the name of the game and stays put.
    // Only the labels that have a localized string get replaced.
    getElements().newGameMenuButton.innerHTML = `${localize('newGame', getLanguage())}`;
}

export async function handleLanguageChange(languageCode) {
    setLanguageSelected(languageCode);
    await setupLanguageAndLocalization();
    setElementsLanguageText();
}

async function setupLanguageAndLocalization() {
    setLanguage(getLanguageSelected());
    await initLocalization(getLanguage());
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
