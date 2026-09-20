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
    getBrushSize, setBrushSize, getDrawMode, setDrawMode, getEraserOn, setEraserOn,
    getHeatViewOn, setHeatViewOn, getSimulationPaused, setSimulationPaused,
    getWindStrength, setWindStrength, getGrabberSize, setGrabberSize,
    getGrabberOn, setGrabberOn
} from './constantsAndGlobalVars.js';
import {
    loadParticleDefinitions, initializeWorld, setGameState, startGame,
    paintLine, paintCell, clearCanvasWorld, setHoverCell,
    beginGrab, dropGrab, cancelGrab, setLinePreview, clearLinePreview
} from './game.js';
import {
    getDefinitions, setAmbientTarget, getAmbientTarget, setLayerLapse, getLayerLapse,
    setAmbientWindOn, getAmbientWindOn, setAirLayersOn, getAirLayersOn,
    setWindDial
} from './physics.js';
import { initLocalization, localize } from './localization.js';
import { loadSavedTheme, buildThemeSwatches, buildThemeSelect } from './themes.js';

let isPainting = false;
let isGrabbing = false;
let lastCell = null;
let paintTimer = null;
let currentCell = { x: 0, y: 0 };
let lineStart = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadParticleDefinitions();
    initializeWorld();
    setElements();
    buildParticleButtons();

    const elements = getElements();

    // The look comes first, before anything is on screen, so the page never
    // shows a flash of the default theme on its way to the saved one.
    loadSavedTheme();
    buildThemeSwatches(elements.themeSwatches);
    buildThemeSelect(elements.themeSelect);

    elements.newGameMenuButton.addEventListener('click', async () => {
        setBeginGameStatus(true);
        if (!getGameInProgress()) {
            setGameInProgress(true);
        }
        setGameState(getGameVisibleActive());
        startGame();
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
        elements.heatViewButton.setAttribute('aria-pressed', String(getHeatViewOn()));
    });

    elements.eraserButton.addEventListener('click', () => {
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
    selectDrawingMode(getDrawMode());

    elements.grabberButton.addEventListener('click', () => {
        setGrabberMode(!getGrabberOn());
    });

    elements.grabberSizeInput.addEventListener('input', event => {
        const size = Math.max(1, Math.min(60, parseInt(event.target.value)));
        setGrabberSize(size);
        elements.grabberSizeValue.textContent = String(size);
    });

    setGameState(getMenuState());
    // Awaited: the New Game label is looked up as soon as the page starts,
    // so clicking New Game before this finished used to throw.
    await handleLanguageChange(getLanguageSelected());
    setUpAirTemperature();
    setUpAirLayers();
    setUpWindStrength();
    setUpAmbientWind();
    setUpTooltips();
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

    const order = ['Powders', 'Liquids', 'Gases', 'Solids', 'Metals', 'Tools', 'Other'];
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
        // Choosing a material always leaves Grabber mode first. If the claw is
        // holding anything, setGrabberMode restores it before the new brush is
        // selected, so changing tools can never make lifted pixels disappear.
        setGrabberMode(false);
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
const MAX_AIR_TEMP = 2000;

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

// How pronounced the layering of the air is: the number of degrees colder each
// fifth of the height is than the one below it.
//
// The checkbox beside it turns layering off entirely, which makes the air one
// even temperature everywhere and greys the slider out. Unlike dragging the
// slider to zero it leaves the setting alone, so turning layers back on brings
// back whatever was there before.
function setUpAirLayers() {
    const slider = getElements().layerLapseInput;
    const label = getElements().layerLapseLabel;
    const valueReadout = getElements().layerLapseValue;
    const box = getElements().airLayersCheckbox;

    const apply = value => {
        setLayerLapse(value);
        valueReadout.textContent = value.toFixed(1);
    };

    const showEnabled = on => {
        slider.disabled = !on;
        slider.classList.toggle('disabled-control', !on);
        label.classList.toggle('disabled-control', !on);
    };

    slider.value = String(getLayerLapse());
    apply(getLayerLapse());
    slider.addEventListener('input', event => apply(parseFloat(event.target.value)));

    box.checked = getAirLayersOn();
    showEnabled(getAirLayersOn());
    box.addEventListener('change', () => {
        setAirLayersOn(box.checked);
        showEnabled(box.checked);
    });
}

// How hard the wind blows: how many cells the tool shoves things along, how
// vigorously it stirs the air, and how hard the natural breeze gusts. The
// breeze blows at double this, being weather rather than a nudge from the
// mouse, so the one dial covers both.
function setUpWindStrength() {
    const slider = getElements().windStrengthInput;
    const valueReadout = getElements().windStrengthValue;

    const apply = value => {
        setWindStrength(value);
        setWindDial(value);
        valueReadout.textContent = String(value);
    };

    slider.value = String(getWindStrength());
    apply(getWindStrength());
    slider.addEventListener('input', event => apply(parseInt(event.target.value)));
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
    const panel = getElements().toolsPanel;
    const tooltip = document.getElementById('toolTooltip');
    const controls = panel.querySelectorAll('.tooltip-control');

    const hide = () => { tooltip.hidden = true; };
    const show = control => {
        tooltip.textContent = control.dataset.tooltip || control.title || '';
        tooltip.hidden = false;

        const controlRect = control.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const gap = 10;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

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
    panel.addEventListener('scroll', hide);
    window.addEventListener('resize', hide);
}

function selectDrawingMode(mode) {
    const next = mode === 'line' ? 'line' : 'brush';
    setDrawMode(next);
    setGrabberMode(false);
    cancelPainting();

    const elements = getElements();
    const brushOn = next === 'brush';
    elements.brushModeButton.classList.toggle('active-toggle', brushOn);
    elements.lineModeButton.classList.toggle('active-toggle', !brushOn);
    elements.brushModeButton.setAttribute('aria-pressed', String(brushOn));
    elements.lineModeButton.setAttribute('aria-pressed', String(!brushOn));
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
        currentCell = cellFromEvent(event);
        setHoverCell(currentCell.x, currentCell.y);

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
        // Right button erases without having to switch tool.
        if (event.button === 2) setEraserOn(true);
        lastCell = null;
        if (getDrawMode() === 'line') {
            lineStart = { x: currentCell.x, y: currentCell.y };
            setLinePreview(lineStart.x, lineStart.y, currentCell.x, currentCell.y);
        } else {
            paintAtCurrentCell();
            startPaintTimer();
        }
    });

    canvas.addEventListener('mousemove', event => {
        currentCell = cellFromEvent(event);
        setHoverCell(currentCell.x, currentCell.y);
        if (isGrabbing) return;
        if (!isPainting) return;
        if (getDrawMode() === 'line' && lineStart) {
            setLinePreview(lineStart.x, lineStart.y, currentCell.x, currentCell.y);
        } else {
            paintAtCurrentCell();
        }
    });

    window.addEventListener('mouseup', event => {
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
    });

    // Touch support, so it works on a tablet as well.
    canvas.addEventListener('touchstart', event => {
        event.preventDefault();
        currentCell = cellFromEvent(event.touches[0]);
        setHoverCell(currentCell.x, currentCell.y);
        if (getGrabberOn()) {
            isGrabbing = beginGrab(currentCell.x, currentCell.y, getGrabberSize()) > 0;
            return;
        }
        isPainting = true;
        lastCell = null;
        if (getDrawMode() === 'line') {
            lineStart = { x: currentCell.x, y: currentCell.y };
            setLinePreview(lineStart.x, lineStart.y, currentCell.x, currentCell.y);
        } else {
            paintAtCurrentCell();
            startPaintTimer();
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', event => {
        event.preventDefault();
        currentCell = cellFromEvent(event.touches[0]);
        setHoverCell(currentCell.x, currentCell.y);
        if (isGrabbing) return;
        if (getDrawMode() === 'line' && lineStart) {
            setLinePreview(lineStart.x, lineStart.y, currentCell.x, currentCell.y);
        } else {
            paintAtCurrentCell();
        }
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
        if (isGrabbing) {
            dropGrab(currentCell.x, currentCell.y);
            isGrabbing = false;
            return;
        }
        if (isPainting) finishPainting(0);
    });
}

function finishPainting(button) {
    if (getDrawMode() === 'line' && lineStart) {
        clearLinePreview();
        paintLine(lineStart.x, lineStart.y, currentCell.x, currentCell.y);
    }
    isPainting = false;
    lineStart = null;
    lastCell = null;
    stopPaintTimer();
    if (button === 2) setEraserOn(false);
}

function cancelPainting() {
    isPainting = false;
    lineStart = null;
    lastCell = null;
    stopPaintTimer();
    clearLinePreview();
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
    getElements().brushSizeValue.textContent = String(size);
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
