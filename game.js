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

import {
    getGridCols, setGridCols, getGridRows, getElements, gameState,
    setBeginGameStatus, setGameStateVariable, getBeginGameStatus,
    getMenuState, getGameVisiblePaused, getGameVisibleActive,
    getParticleTypeIdSelected, setParticleDefinitions,
    getBrushSize, getDrawMode, getEraserOn, getHeatViewOn, getSimulationPaused, getWindStrength,
    getGrabberOn, getGrabberSize
} from './constantsAndGlobalVars.js';
import {
    prepareDefinitions, createWorld, getWorld, clearWorld, stepSimulation,
    setCell, inBounds, index, getDefinitions, getAmbientTemp, getAirTempAt,
    getAmbientTarget, getTemperature, getFrameCount, applyWind, decayWindTrails,
    getConnectedAluminumCharge, EMPTY
} from './physics.js';

let context = null;
let imageData = null;
let pixels = null;
let frames = 0;
let lastFpsCheck = 0;
let fps = 0;
let loopRunning = false;
let gridFittedToWorkspace = false;
let grabbedPixels = null;
let linePreview = null;

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

// Keep the original cell size and spend the horizontal room between the
// material picker and tools panel on simulation columns.
function fitGridToWorkspace() {
    const canvas = getElements().canvas;
    const area = getElements().canvasArea;
    const rows = getGridRows();
    const availableHeight = Math.max(1, area.clientHeight - 32);
    const targetWidth = Math.max(1, area.clientWidth - 32);
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
    const area = getElements().canvasArea;
    const cols = getGridCols();
    const rows = getGridRows();

    const availableWidth = area.clientWidth - 32;
    const availableHeight = area.clientHeight - 32;
    const scale = Math.max(1, Math.min(availableWidth / cols, availableHeight / rows));

    canvas.style.width = Math.floor(cols * scale) + 'px';
    canvas.style.height = Math.floor(rows * scale) + 'px';
    const stage = getElements().canvasStage || canvas.parentElement;
    if (stage) {
        stage.style.width = canvas.style.width;
        stage.style.height = canvas.style.height;
    }
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
    const power = world.power;
    const charge = world.charge;
    const wind = world.wind;
    const total = type.length;
    const heatView = getHeatViewOn();
    const airTint = airTintForTemperature(getAmbientTarget());
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
            // The whole air mass takes a subtle tint from the air-temperature
            // dial, never from a nearby flame or ice cell. The curve is quiet
            // around ordinary weather and increasingly strong near the two
            // extremes. Wind adds its pale haze on top.
            const blown = wind[i];
            const f = blown / 255;
            pixels[p] = clampByte(airTint[0] + 24 * f);
            pixels[p + 1] = clampByte(airTint[1] + 38 * f);
            pixels[p + 2] = clampByte(airTint[2] + 56 * f);
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

        // Stored charge gives aluminum a persistent yellow tint. A live power
        // pulse is brighter, producing the moving yellow dots/line along any
        // connected conductor.
        if (def.chargeCapacity > 0 && charge[i] > 0) {
            const f = (charge[i] / def.chargeCapacity) * 0.65;
            r += (255 - r) * f;
            g += (214 - g) * f;
            b += (42 - b) * f;
        }
        if (def.conductive && power[i] > 0) {
            const f = 0.68 + (power[i] / 7) * 0.25;
            r += (255 - r) * f;
            g += (232 - g) * f;
            b += (48 - b) * f;
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

    drawGrabberPreview();
    context.putImageData(imageData, 0, 0);
    drawFanOverlays();
    drawGrabberOutline();
    drawLinePreview();
}

const FAN_ICON_SVG_NS = 'http://www.w3.org/2000/svg';

// Fans are still one simulation cell, but their machine face is a fixed-size
// screen icon so it remains readable when the pixel canvas is scaled up.
function drawFanOverlays() {
    const overlay = getElements().fanOverlay;
    if (!overlay) return;
    if (typeof overlay.replaceChildren === 'function') overlay.replaceChildren();
    else overlay.innerHTML = '';

    const world = getWorld();
    const fan = getDefinitions().findIndex(def => def && def.machine === 'fan');
    if (fan < 0) return;

    const canvas = getElements().canvas;
    const cellWidth = canvas.clientWidth / world.cols;
    const cellHeight = canvas.clientHeight / world.rows;
    const rotations = [0, 180, -90, 90, -45, -135, 135, 45];
    const iconMarkup = '<circle cx="11" cy="15" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
        '<circle cx="11" cy="15" r="2.2" fill="currentColor"/>' +
        '<path d="M11 12.8C7 10 6.5 6 9.4 5.1c3.2-1 4.3 2.7 2.1 7.7Z" fill="currentColor"/>' +
        '<path d="M13.2 15c2.8-4 6.8-4.5 7.7-1.6 1 3.2-2.7 4.3-7.7 2.1Z" fill="currentColor"/>' +
        '<path d="M11 17.2c4 2.8 4.5 6.8 1.6 7.7-3.2 1-4.3-2.7-2.1-7.7Z" fill="currentColor"/>' +
        '<path d="M17 10h7M18 15h9M17 20h7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>';

    for (let i = 0; i < world.type.length; i++) {
        if (world.type[i] !== fan) continue;
        const x = i % world.cols;
        const y = Math.floor(i / world.cols);
        const icon = document.createElementNS(FAN_ICON_SVG_NS, 'svg');
        icon.setAttribute('class', 'fan-overlay-icon');
        icon.setAttribute('viewBox', '0 0 30 30');
        icon.setAttribute('width', '30');
        icon.setAttribute('height', '30');
        icon.setAttribute('aria-hidden', 'true');
        icon.style.left = `${(x + 0.5) * cellWidth - 15}px`;
        icon.style.top = `${(y + 0.5) * cellHeight - 15}px`;
        icon.style.transform = `rotate(${rotations[world.data[i] & 7]}deg)`;
        icon.innerHTML = iconMarkup;
        overlay.appendChild(icon);
    }
}

function clampByte(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

// Non-linear on purpose: a few degrees of ordinary weather barely alter the
// black air, while the far ends of the slider develop a clear icy blue or hot
// orange-red glow. Local particle temperatures never enter this calculation.
export function airTintForTemperature(t) {
    const cold = Math.pow(Math.max(0, Math.min(1, (15 - t) / 75)), 1.7);
    const hot = Math.pow(Math.max(0, Math.min(1, (t - 35) / 565)), 1.7);
    return [
        clampByte(8 * cold + 96 * hot),
        clampByte(28 * cold + 26 * hot),
        clampByte(72 * cold + 6 * hot)
    ];
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

export function setLinePreview(x0, y0, x1, y1) {
    linePreview = { x0, y0, x1, y1 };
}

export function clearLinePreview() {
    linePreview = null;
}

function drawLinePreview() {
    if (!linePreview || !context) return;
    context.beginPath();
    context.strokeStyle = '#8bdcff';
    context.lineWidth = Math.max(1, getBrushSize());
    context.lineCap = 'round';
    context.moveTo(linePreview.x0 + 0.5, linePreview.y0 + 0.5);
    context.lineTo(linePreview.x1 + 0.5, linePreview.y1 + 0.5);
    context.stroke();
}

function drawGrabberOutline() {
    if (!getGrabberOn() || !inBounds(hoverX, hoverY)) return;
    const size = getGrabberSize();
    const left = hoverX - Math.floor(size / 2);
    const top = hoverY - Math.floor(size / 2);
    context.strokeStyle = grabbedPixels ? '#ffd166' : '#8bdcff';
    context.lineWidth = 1;
    context.strokeRect(left + 0.5, top + 0.5, size, size);
}

// Held cells are drawn into the frame buffer at the exact positions where a
// release would put them, but are not restored to the simulation until the
// mouse button comes up. The world therefore keeps evolving underneath a clear
// visual copy of the shape being carried.
function drawGrabberPreview() {
    if (!grabbedPixels || !inBounds(hoverX, hoverY)) return;
    const centre = safeGrabCentre(hoverX, hoverY, grabbedPixels.cells);
    for (const cell of grabbedPixels.cells) {
        const x = centre.x + cell.dx;
        const y = centre.y + cell.dy;
        const p = index(x, y) * 4;
        pixels[p] = cell.previewR;
        pixels[p + 1] = cell.previewG;
        pixels[p + 2] = cell.previewB;
        pixels[p + 3] = 255;
    }
}

function updateReadout() {
    const readout = getElements().readout;
    if (!readout) return;

    const type = getWorld().type;
    let count = 0;
    for (let i = 0; i < type.length; i++) if (type[i] !== EMPTY) count++;

    const defs = getDefinitions();
    const selected = getGrabberOn() ? `Claw ${getGrabberSize()}px`
        : (getEraserOn() ? 'Eraser' : defs[getParticleTypeIdSelected()].name);
    const drawing = getDrawMode() === 'line' ? 'Line' : 'Brush';

    let under = '';
    if (inBounds(hoverX, hoverY)) {
        const id = type[index(hoverX, hoverY)];
        under = `   ${defs[id].name} ${Math.round(getTemperature(hoverX, hoverY))}°C`;
    }

    readout.textContent = `${fps} fps   ${count} particles   air ` +
        `${Math.round(getAmbientTemp())}°C   ${drawing} ${selected} ${getBrushSize()}px${under}`;
    updateChargeIndicator(getElements());
}

function updateChargeIndicator(elements) {
    const indicator = elements.chargeIndicator;
    if (!indicator) return;

    const charge = inBounds(hoverX, hoverY)
        ? getConnectedAluminumCharge(hoverX, hoverY)
        : null;
    if (!charge) {
        indicator.hidden = true;
        return;
    }

    const ratio = charge.ratio;
    const percent = Math.round(ratio * 100);
    const state = ratio <= 0.25 ? 'red' : ratio < 0.75 ? 'orange' : 'green';
    indicator.hidden = false;
    indicator.classList.remove('charge-green', 'charge-orange', 'charge-red');
    indicator.classList.add(`charge-${state}`);
    indicator.setAttribute('aria-label', `Aluminum charge ${percent}%`);
    indicator.title = `Aluminum charge: ${percent}%`;
    elements.chargeIndicatorFill.setAttribute('width', String(ratio * 17));
    elements.chargeIndicatorValue.textContent = `${percent}%`;
}

//---------------------------------------------------------------------- brush

// Paints a blob of the selected particle. A material can only be added to air;
// cells already occupied by any material are left untouched. The eraser is the
// explicit exception and can clear any cell.
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
                world.lifeMax[i] = 0;
                world.residue[i] = EMPTY;
                world.temp[i] = getAirTempAt(y);
                world.power[i] = 0;
                world.powerDelay[i] = 0;
                world.charge[i] = 0;
                continue;
            }

            if (world.type[i] !== EMPTY) continue;

            // Sprinkle rather than fill for loose materials, which looks better
            // and stops the brush dumping a solid block of sand.
            const def = getDefinitions()[id];
            const loose = def.category === 'powder' || def.category === 'gas';
            if (loose && size > 1 && Math.random() < 0.45) continue;

            setCell(x, y, id);
        }
    }
}

function fanId() {
    return getDefinitions().findIndex(def => def && def.machine === 'fan');
}

function normaliseFanDirection(direction) {
    return ((Math.round(direction) % 8) + 8) % 8;
}

// Machines are placed as one cell, independently of brush size. Their
// orientation lives in the cell's data byte so it travels with the Fan when
// the grabber moves it and survives the normal world-state operations.
export function placeFan(x, y, direction = 0) {
    const id = fanId();
    if (id <= 0 || !inBounds(x, y)) return false;
    const i = index(x, y);
    if (getWorld().type[i] !== EMPTY) return false;
    setCell(x, y, id);
    getWorld().data[i] = normaliseFanDirection(direction);
    return true;
}

export function faceFan(x, y, direction = 0) {
    const i = inBounds(x, y) ? index(x, y) : -1;
    if (i < 0 || getWorld().type[i] !== fanId()) return false;
    getWorld().data[i] = normaliseFanDirection(direction);
    return true;
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

// Removes every cell matching the single material directly under the cursor,
// but only inside the square shown by the Grabber. Full particle state is kept
// so hot, burning or ageing material remains exactly what it was while moved.
export function beginGrab(centreX, centreY, size = getGrabberSize()) {
    if (grabbedPixels || !inBounds(centreX, centreY)) return 0;
    const world = getWorld();
    const grabbedId = world.type[index(centreX, centreY)];
    if (grabbedId === EMPTY) return 0;

    const left = centreX - Math.floor(size / 2);
    const top = centreY - Math.floor(size / 2);
    const cells = [];
    for (let oy = 0; oy < size; oy++) {
        for (let ox = 0; ox < size; ox++) {
            const x = left + ox;
            const y = top + oy;
            if (!inBounds(x, y)) continue;
            const i = index(x, y);
            if (world.type[i] !== grabbedId) continue;
            const p = i * 4;
            const def = getDefinitions()[grabbedId];
            cells.push({
                dx: x - centreX, dy: y - centreY,
                x, y,
                type: world.type[i], temp: world.temp[i], life: world.life[i], lifeMax: world.lifeMax[i],
                residue: world.residue[i], shade: world.shade[i],
                heat: world.heat[i], data: world.data[i],
                power: world.power[i], powerDelay: world.powerDelay[i],
                charge: world.charge[i], wind: world.wind[i],
                previewR: pixels ? pixels[p] : def.rgb[0],
                previewG: pixels ? pixels[p + 1] : def.rgb[1],
                previewB: pixels ? pixels[p + 2] : def.rgb[2]
            });
            clearGrabbedCell(world, i, y);
        }
    }
    grabbedPixels = { centreX, centreY, cells };
    return cells.length;
}

export function dropGrab(centreX, centreY) {
    if (!grabbedPixels) return 0;
    const held = grabbedPixels;
    grabbedPixels = null;
    if (held.cells.length === 0) return 0;

    const centre = safeGrabCentre(centreX, centreY, held.cells);
    const world = getWorld();
    for (const cell of held.cells) restoreGrabbedCell(world,
        index(centre.x + cell.dx, centre.y + cell.dy), cell);
    return held.cells.length;
}

function safeGrabCentre(centreX, centreY, cells) {
    let minDx = 0, maxDx = 0, minDy = 0, maxDy = 0;
    for (const cell of cells) {
        minDx = Math.min(minDx, cell.dx); maxDx = Math.max(maxDx, cell.dx);
        minDy = Math.min(minDy, cell.dy); maxDy = Math.max(maxDy, cell.dy);
    }
    return {
        x: Math.max(-minDx, Math.min(getGridCols() - 1 - maxDx, centreX)),
        y: Math.max(-minDy, Math.min(getGridRows() - 1 - maxDy, centreY))
    };
}

export function cancelGrab() {
    if (!grabbedPixels) return 0;
    const held = grabbedPixels;
    grabbedPixels = null;
    const world = getWorld();
    for (const cell of held.cells) restoreGrabbedCell(world, index(cell.x, cell.y), cell);
    return held.cells.length;
}

export function hasGrabbedPixels() {
    return !!grabbedPixels;
}

function clearGrabbedCell(world, i, y) {
    world.type[i] = EMPTY;
    world.temp[i] = getAirTempAt(y);
    world.life[i] = 0;
    world.lifeMax[i] = 0;
    world.residue[i] = EMPTY;
    world.heat[i] = 0;
    world.data[i] = 0;
    world.power[i] = 0;
    world.powerDelay[i] = 0;
    world.charge[i] = 0;
    world.wind[i] = 0;
    world.moved[i] = 1;
}

function restoreGrabbedCell(world, i, cell) {
    world.type[i] = cell.type;
    world.temp[i] = cell.temp;
    world.life[i] = cell.life;
    world.lifeMax[i] = cell.lifeMax;
    world.residue[i] = cell.residue;
    world.shade[i] = cell.shade;
    world.heat[i] = cell.heat;
    world.data[i] = cell.data;
    world.power[i] = cell.power;
    world.powerDelay[i] = cell.powerDelay;
    world.charge[i] = cell.charge;
    world.wind[i] = cell.wind;
    world.moved[i] = 1;
}

export function clearCanvasWorld() {
    grabbedPixels = null;
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
            elements.floatingContainer.classList.remove('d-none');
            break;
    }
}
