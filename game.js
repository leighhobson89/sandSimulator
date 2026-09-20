// game.js
// -----------------------------------------------------------------------------
// Canvas setup, drawing, the main loop and the screen states. All of the actual
// simulation lives in physics.js.
//
// Drawing note: the canvas is exactly one pixel per cell and is stretched to
// fit the screen by CSS with image-rendering: pixelated. That means a frame is
// one putImageData call instead of tens of thousands of fillRect calls, which
// is the single biggest speed win over the old version.
// -----------------------------------------------------------------------------

import { localize } from './localization.js';
import {
    getGridCols, setGridCols, getGridRows, getElements, getLanguage, gameState,
    setBeginGameStatus, setGameStateVariable, getBeginGameStatus,
    getMenuState, getGameVisiblePaused, getGameVisibleActive,
    getParticleTypeIdSelected, setParticleDefinitions,
    getBrushSize, getEraserOn, getHeatViewOn, getSimulationPaused, getWindStrength
} from './constantsAndGlobalVars.js';
import {
    prepareDefinitions, createWorld, getWorld, clearWorld, stepSimulation,
    setCell, inBounds, index, getDefinitions, getAmbientTemp, getAirTempAt,
    getTemperature, getFrameCount, applyWind, decayWindTrails, EMPTY
} from './physics.js';

let context = null;
let imageData = null;
let pixels = null;
let frames = 0;
let lastFpsCheck = 0;
let fps = 0;
let loopRunning = false;
let gridFittedToWorkspace = false;

//--------------------------------------------------------------------------------------------------------

export function startGame() {
    const canvas = getElements().canvas;
    if (!gridFittedToWorkspace) fitGridToWorkspace();
    const cols = getGridCols();
    const rows = getGridRows();

    // One canvas pixel per simulation cell. CSS does the scaling.
    canvas.width = cols;
    canvas.height = rows;

    context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    imageData = context.createImageData(cols, rows);
    pixels = imageData.data;

    fitCanvasToScreen();
    window.addEventListener('resize', fitCanvasToScreen);

    if (getBeginGameStatus()) {
        setBeginGameStatus(false);
    }
    setGameState(getGameVisibleActive());

    // Going back to the menu stops the loop, so coming back in has to start it
    // again - but only ever one loop at a time.
    if (loopRunning) return;
    loopRunning = true;
    lastFpsCheck = performance.now();
    requestAnimationFrame(gameLoop);
}

// Keep the original cell size and spend the extra horizontal room on more
// simulation columns. The canvas area already excludes the material picker,
// so ninety percent here means ninety percent of the usable workspace.
function fitGridToWorkspace() {
    const canvas = getElements().canvas;
    const area = canvas.parentElement;
    const rows = getGridRows();
    const availableHeight = Math.max(1, area.clientHeight - 32);
    const targetWidth = Math.max(1, (area.clientWidth - 32) * 0.9);
    const cellSize = Math.max(1, availableHeight / rows);
    const cols = Math.max(200, Math.floor(targetWidth / cellSize));

    setGridCols(cols);
    const current = getWorld();
    if (!current || current.cols !== cols || current.rows !== rows) createWorld(cols, rows);
    gridFittedToWorkspace = true;
}

// Makes the canvas as big as it fits in the work area while keeping cells
// square. The canvas itself stays at one pixel per cell; this only stretches it.
function fitCanvasToScreen() {
    const canvas = getElements().canvas;
    const area = canvas.parentElement;
    const cols = getGridCols();
    const rows = getGridRows();

    const availableWidth = (area.clientWidth - 32) * 0.9;
    const availableHeight = area.clientHeight - 32;
    const scale = Math.max(1, Math.min(availableWidth / cols, availableHeight / rows));

    canvas.style.width = Math.floor(cols * scale) + 'px';
    canvas.style.height = Math.floor(rows * scale) + 'px';
}

export function gameLoop(now) {
    if (gameState !== getGameVisibleActive() && gameState !== getGameVisiblePaused()) {
        loopRunning = false;
        return;
    }

    if (!getSimulationPaused()) {
        stepSimulation();
    }
    // Wind trails fade on their own clock rather than the simulation's, so a
    // gust blown while the simulation is paused still dies away instead of
    // hanging on the screen.
    decayWindTrails();
    drawWorld();

    frames++;
    if (now - lastFpsCheck >= 250) {
        fps = Math.round((frames * 1000) / (now - lastFpsCheck));
        frames = 0;
        lastFpsCheck = now;
        updateReadout();
    }

    requestAnimationFrame(gameLoop);
}

//------------------------------------------------------------------- rendering

function drawWorld() {
    const world = getWorld();
    const defs = getDefinitions();
    const type = world.type;
    const temp = world.temp;
    const life = world.life;
    const shade = world.shade;
    const data = world.data;
    const wind = world.wind;
    const total = type.length;
    const heatView = getHeatViewOn();
    // Lit gunpowder flickers between its two colours while it catches.
    const flicker = (getFrameCount() & 2) === 0;

    for (let i = 0; i < total; i++) {
        const p = i * 4;
        const id = type[i];

        if (heatView) {
            writeHeatColour(pixels, p, temp[i], id);
            continue;
        }

        if (id === EMPTY) {
            // Empty air is black unless the wind has just been through it, in
            // which case it carries a faint cool haze that fades over the next
            // few frames. It is deliberately dim: enough to see which way the
            // air is moving, not enough to read as a material.
            const blown = wind[i];
            if (blown > 0) {
                const f = blown / 255;
                pixels[p] = clampByte(24 * f);
                pixels[p + 1] = clampByte(38 * f);
                pixels[p + 2] = clampByte(56 * f);
            } else {
                pixels[p] = 0;
                pixels[p + 1] = 0;
                pixels[p + 2] = 0;
            }
            pixels[p + 3] = 255;
            continue;
        }

        const def = defs[id];
        let r = def.rgb[0];
        let g = def.rgb[1];
        let b = def.rgb[2];

        if (def.palette) {
            // Flowers: each one keeps a fixed random number, which picks its
            // colour out of the rainbow and keeps it for as long as it lives.
            const colour = def.palette[shade[i] % def.palette.length];
            r = colour[0];
            g = colour[1];
            b = colour[2];
        } else if (def.blastRadius > 0) {
            // Gunpowder: dark until it catches, then glowing.
            if (data[i] > 0 && flicker) {
                r = def.rgb2[0];
                g = def.rgb2[1];
                b = def.rgb2[2];
            }
        } else if (def.gradient) {
            // Fire and lava fade from their bright colour to their dark one:
            // fire as it burns out, lava as it cools towards solid.
            let mix;
            if (def.life > 0) {
                mix = life[i] / def.life;
            } else {
                const floor = def.freezePoint !== undefined ? def.freezePoint : 0;
                mix = (temp[i] - floor) / Math.max(1, def.glowTemp - floor);
            }
            if (mix < 0) mix = 0;
            if (mix > 1) mix = 1;
            r = def.rgb2[0] + (def.rgb[0] - def.rgb2[0]) * mix;
            g = def.rgb2[1] + (def.rgb[1] - def.rgb2[1]) * mix;
            b = def.rgb2[2] + (def.rgb[2] - def.rgb2[2]) * mix;
        }

        // Anything the wind is passing over catches a little of its pale light,
        // so a gust shows up across a sand bank as well as in the open air.
        const blown = wind[i];
        if (blown > 0) {
            const f = (blown / 255) * 0.3;
            r += (226 - r) * f;
            g += (238 - g) * f;
            b += (255 - b) * f;
        }

        // A fixed per-cell wobble in brightness so materials look grainy.
        const wobble = (shade[i] - 128) * 0.14;
        pixels[p] = clampByte(r + wobble);
        pixels[p + 1] = clampByte(g + wobble);
        pixels[p + 2] = clampByte(b + wobble);
        pixels[p + 3] = 255;
    }

    context.putImageData(imageData, 0, 0);
}

function clampByte(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

// Temperature overlay: deep blue when frozen, through green at room
// temperature, to white hot.
function writeHeatColour(out, p, t, id) {
    let r, g, b;
    if (t < 0) {
        const f = Math.max(0, (t + 60) / 60);
        r = 20 * f; g = 60 * f; b = 140 + 115 * f;
    } else if (t < 100) {
        const f = t / 100;
        r = 20 + 40 * f; g = 90 + 130 * f; b = 200 - 140 * f;
    } else if (t < 600) {
        const f = (t - 100) / 500;
        r = 60 + 195 * f; g = 220 - 60 * f; b = 60 - 60 * f;
    } else {
        const f = Math.min(1, (t - 600) / 600);
        r = 255; g = 160 + 95 * f; b = 30 + 225 * f;
    }
    if (id === EMPTY) { r *= 0.55; g *= 0.55; b *= 0.55; }
    out[p] = clampByte(r);
    out[p + 1] = clampByte(g);
    out[p + 2] = clampByte(b);
    out[p + 3] = 255;
}

// Where the mouse is, so the readout can show what is under it. Set from ui.js.
let hoverX = -1;
let hoverY = -1;

export function setHoverCell(x, y) {
    hoverX = x;
    hoverY = y;
}

function updateReadout() {
    const readout = getElements().readout;
    if (!readout) return;

    const type = getWorld().type;
    let count = 0;
    for (let i = 0; i < type.length; i++) if (type[i] !== EMPTY) count++;

    const defs = getDefinitions();
    const selected = getEraserOn() ? 'Eraser' : defs[getParticleTypeIdSelected()].name;

    let under = '';
    if (inBounds(hoverX, hoverY)) {
        const id = type[index(hoverX, hoverY)];
        under = `   ${defs[id].name} ${Math.round(getTemperature(hoverX, hoverY))}°C`;
    }

    readout.textContent = `${fps} fps   ${count} particles   air ` +
        `${Math.round(getAmbientTemp())}°C   ${selected} ${getBrushSize()}px${under}`;
}

//---------------------------------------------------------------------- brush

// Paints a blob of the selected particle. Existing particles are only painted
// over when the brush is a solid one, so that dropping water onto sand does not
// erase the sand.
//
// dragX and dragY are which way the mouse was moving, which only the wind tool
// cares about.
export function paintCell(centreX, centreY, dragX, dragY) {
    const id = getEraserOn() ? EMPTY : getParticleTypeIdSelected();

    // The wind is a tool rather than a material: it is not put into the world,
    // it pushes what is already there. A gust covers twice the width the brush
    // is set to - air spills out around whatever it is aimed at rather than
    // stopping dead at the edge of the brush - so the gust radius is the brush
    // size itself, the brush's own radius being half of that.
    if (id !== EMPTY && getDefinitions()[id].tool === 'wind') {
        applyWind(centreX, centreY, dragX || 0, dragY || 0,
            Math.max(3, getBrushSize()), getWindStrength());
        return;
    }

    const size = getBrushSize();
    const radius = (size - 1) / 2;
    const world = getWorld();

    for (let dy = -Math.floor(radius); dy <= Math.ceil(radius); dy++) {
        for (let dx = -Math.floor(radius); dx <= Math.ceil(radius); dx++) {
            const x = centreX + dx;
            const y = centreY + dy;
            if (!inBounds(x, y)) continue;
            if (radius > 0.5 && dx * dx + dy * dy > radius * radius + 0.5) continue;

            const i = index(x, y);
            if (id === EMPTY) {
                world.type[i] = EMPTY;
                world.life[i] = 0;
                world.residue[i] = EMPTY;
                world.temp[i] = getAirTempAt(y);
                continue;
            }

            // Sprinkle rather than fill for loose materials, which looks better
            // and stops the brush dumping a solid block of sand.
            const def = getDefinitions()[id];
            const loose = def.category === 'powder' || def.category === 'gas';
            if (loose && size > 1 && Math.random() < 0.45) continue;

            if (world.type[i] === EMPTY || def.category === 'static' || Math.random() < 0.3) {
                setCell(x, y, id);
            }
        }
    }
}

// Draws along the line between two mouse positions so that a fast drag leaves a
// continuous stroke instead of a dotted one. The direction of the drag is
// handed on, since the wind tool blows whichever way the mouse is going.
export function paintLine(x0, y0, x1, y1) {
    const dragX = x1 - x0;
    const dragY = y1 - y0;
    const steps = Math.max(Math.abs(dragX), Math.abs(dragY));
    if (steps === 0) {
        paintCell(x1, y1, 0, 0);
        return;
    }
    for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        paintCell(Math.round(x0 + dragX * t), Math.round(y0 + dragY * t), dragX, dragY);
    }
}

export function clearCanvasWorld() {
    clearWorld();
}

//---------------------------------------------------------------------- setup

export async function loadParticleDefinitions() {
    const response = await fetch('./particles.json');
    const json = await response.json();
    setParticleDefinitions(json);
    prepareDefinitions(json);
}

export function initializeWorld() {
    createWorld(getGridCols(), getGridRows());
}

//===============================================================================================================

export function setGameState(newState) {
    setGameStateVariable(newState);

    const elements = getElements();

    switch (newState) {
        case getMenuState():
            elements.menu.classList.remove('d-none');
            elements.menu.classList.add('d-flex');
            elements.buttonRow.classList.add('d-none');
            elements.buttonRow.classList.remove('d-flex');
            elements.canvasContainer.classList.remove('d-flex');
            elements.canvasContainer.classList.add('d-none');
            elements.floatingContainer.classList.add('d-none');
            break;
        case getGameVisibleActive():
            elements.menu.classList.remove('d-flex');
            elements.menu.classList.add('d-none');
            elements.buttonRow.classList.remove('d-none');
            elements.buttonRow.classList.add('d-flex');
            elements.canvasContainer.classList.remove('d-none');
            elements.canvasContainer.classList.add('d-flex');
            elements.returnToMenuButton.innerHTML = `${localize('menuTitle', getLanguage())}`;
            elements.floatingContainer.classList.remove('d-none');
            break;
    }
}
