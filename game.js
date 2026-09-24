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
    getGridCols, getGridRows, getElements, gameState,
    setBeginGameStatus, setGameStateVariable, getBeginGameStatus,
    getMenuState, getGameVisiblePaused, getGameVisibleActive,
    getParticleTypeIdSelected, setParticleDefinitions,
    getBrushSize, getDrawMode, getEraserOn, getVisualizationMode, getSimulationPaused, getWindStrength,
    getGrabberOn, getGrabberSize
} from './constantsAndGlobalVars.js';
import {
    prepareDefinitions, createWorld, getWorld, clearWorld, stepSimulation,
    setCell, inBounds, index, getDefinitions, getAmbientTemp, getAirTempAt,
    getAmbientTarget, getTemperature, getHumidityAt, getFrameCount, applyWind, decayWindTrails,
    getConnectedBatteryCharge, getTubingFlows, isMachinePoweredAt, EMPTY
} from './physics.js';

let context = null;
let imageData = null;
let pixels = null;
let frames = 0;
let lastFpsCheck = 0;
let fps = 0;
let loopRunning = false;
let resizeListenerAttached = false;
let scrollRenderAttached = false;
let grabbedPixels = null;
let linePreview = null;
let shapePreview = null;
let machinePlacementPreview = null;
const STANDARD_ZOOM_FACTORS = [1, 1.5, 2, 3];
const LARGE_WORLD_ZOOM_FACTORS = [1, 2, 3, 4, 6];
const WORLD_BOUNDARY_DEPTH = 12;
const STANDARD_WORLD_COLS = 260;
const STANDARD_WORLD_ROWS = 150;
let canvasZoomLevel = 1;
let fittedCanvasWidth = 0;
let fittedCanvasHeight = 0;
let canvasBaseScale = 1;
let expandedZoomProfile = false;
let zoomStatusTimer = null;

// A blueprint is a compact, rectangular copy of the persistent cell state.
// Transient frame bookkeeping (moved and tempNext) is intentionally excluded:
// it belongs to the current simulation tick, not to the material being copied.
export const BLUEPRINT_SLOT_COUNT = 24;

export const BLUEPRINT_FIELDS = [
    'type', 'temp', 'life', 'lifeMax', 'residue', 'shade', 'heat', 'surface',
    'data', 'machineSetting', 'storageType', 'storageCount', 'storageFlowRemainder',
    'mixerInputTypeA', 'mixerInputCountA', 'mixerInputFlowA',
    'mixerInputTypeB', 'mixerInputCountB', 'mixerInputFlowB',
    'mixerOutputCountA', 'mixerOutputCountB', 'mixerOutputTypeA', 'mixerOutputTypeB', 'mixerOutputMixed',
    'mixerOutputFlow', 'mixerNextInput',
    'mixerOutputNext',
    'power', 'powerDelay', 'charge', 'wind', 'airflowX', 'airflowY',
    'airflowNextX', 'airflowNextY'
];

//--------------------------------------------------------------------------------------------------------

export function startGame({ newWorld = false, alignAtGround = false } = {}) {
    // Make the viewport measurable before sizing a new workspace.
    setGameState(getGameVisibleActive());
    const canvas = getElements().canvas;
    const cols = getGridCols();
    const rows = getGridRows();
    if (newWorld) createWorld(cols, rows);

    expandedZoomProfile = hasLargeZoomProfile(cols, rows);
    canvasBaseScale = fitCellScaleForWorld(cols, rows);
    canvasZoomLevel = 1;

    // One canvas pixel per simulation cell. CSS does the scaling.
    canvas.width = cols;
    canvas.height = rows;

    context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    imageData = context.createImageData(cols, rows);
    pixels = imageData.data;

    fitCanvasToScreen({ preserveAnchor: false });
    if (alignAtGround) alignWorldAtGround();
    if (!resizeListenerAttached) {
        window.addEventListener('resize', fitCanvasToScreen);
        resizeListenerAttached = true;
    }
    if (!scrollRenderAttached) {
        getElements().canvasArea.addEventListener('scroll', () => {
            if (context && imageData) drawWorld();
        }, { passive: true });
        scrollRenderAttached = true;
    }

    if (getBeginGameStatus()) {
        setBeginGameStatus(false);
    }
    drawWorld();
    // Going back to the menu stops the loop, so coming back in has to start it
    // again - but only ever one loop at a time.
    if (loopRunning) return;
    loopRunning = true;
    lastFpsCheck = performance.now();
    if (!window.__E2E_MODE__) requestAnimationFrame(gameLoop);
}

function measureCanvasArea() {
    const elements = getElements();
    const area = elements?.canvasArea;
    if (!area) return { clientWidth: 0, clientHeight: 0, paddingX: 0, paddingY: 0 };
    const container = elements.canvasContainer;
    const hiddenForMenu = container?.classList.contains('d-none');
    const oldClass = hiddenForMenu ? container.className : '';
    const oldStyle = hiddenForMenu ? container.getAttribute('style') : null;
    const oldOverflow = area.style.overflow;
    if (hiddenForMenu) {
        container.classList.remove('d-none');
        container.classList.add('d-flex');
        Object.assign(container.style, {
            position: 'fixed', left: '0', top: '0', visibility: 'hidden',
            pointerEvents: 'none', zIndex: '-1'
        });
    }
    // Existing world scrollbars must not affect the usable viewport measurement.
    area.style.overflow = 'hidden';
    const style = getComputedStyle(area);
    const metrics = {
        clientWidth: area.clientWidth,
        clientHeight: area.clientHeight,
        paddingX: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
        paddingY: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
    };
    area.style.overflow = oldOverflow;
    if (hiddenForMenu) {
        container.className = oldClass;
        if (oldStyle === null) container.removeAttribute('style');
        else container.setAttribute('style', oldStyle);
    }
    return metrics;
}

function usableCanvasAreaSize() {
    const { clientWidth, clientHeight, paddingX, paddingY } = measureCanvasArea();
    return {
        width: Math.max(0, clientWidth - paddingX),
        height: Math.max(0, clientHeight - paddingY)
    };
}

export function isExpandedWorldProfileAvailable() {
    const { width, height } = usableCanvasAreaSize();
    return width >= 260 && height >= 150;
}

function zoomFactors() {
    return expandedZoomProfile ? LARGE_WORLD_ZOOM_FACTORS : STANDARD_ZOOM_FACTORS;
}

function hasLargeZoomProfile(cols = getGridCols(), rows = getGridRows()) {
    return cols > STANDARD_WORLD_COLS || rows > STANDARD_WORLD_ROWS;
}

function fitCellScaleForWorld(cols = getGridCols(), rows = getGridRows()) {
    const { width, height } = usableCanvasAreaSize();
    const scaleToWidth = (width - 2) / Math.max(1, cols);
    const scaleToHeight = (height - 2) / Math.max(1, rows + WORLD_BOUNDARY_DEPTH);
    return Math.max(0.01, Math.min(scaleToWidth, scaleToHeight));
}

function alignWorldAtGround() {
    const area = getElements().canvasArea;
    area.scrollLeft = Math.max(0, (area.scrollWidth - area.clientWidth) / 2);
    area.scrollTop = Math.max(0, area.scrollHeight - area.clientHeight);
}

// Makes the canvas as big as it fits in the work area while keeping cells
// square. The canvas itself stays at one pixel per cell; this only stretches it.
function fitCanvasToScreen({ preserveAnchor = true } = {}) {
    const area = getElements().canvasArea;
    const canvas = getElements().canvas;
    const cols = getGridCols();
    const rows = getGridRows();
    const oldCanvasRect = canvas.getBoundingClientRect();
    const oldAreaRect = area.getBoundingClientRect();
    const oldPointerX = oldAreaRect.left + area.clientLeft + area.clientWidth / 2;
    const oldPointerY = oldAreaRect.top + area.clientTop + area.clientHeight / 2;
    const oldFractionX = oldCanvasRect.width > 0
        ? Math.max(0, Math.min(1, (oldPointerX - oldCanvasRect.left) / oldCanvasRect.width)) : 0.5;
    const oldFractionY = oldCanvasRect.height > 0
        ? Math.max(0, Math.min(1, (oldPointerY - oldCanvasRect.top) / oldCanvasRect.height)) : 0.5;
    expandedZoomProfile = hasLargeZoomProfile(cols, rows);
    canvasBaseScale = fitCellScaleForWorld(cols, rows);

    fittedCanvasWidth = Math.max(1, cols * canvasBaseScale);
    fittedCanvasHeight = Math.max(1, rows * canvasBaseScale);
    applyCanvasZoom();

    // Level one is always the fitted view. At higher levels, preserve the
    // world point at the viewport center when a resize changes the base scale.
    if (!preserveAnchor || canvasZoomLevel === 1) {
        area.scrollLeft = 0;
        area.scrollTop = 0;
    } else {
        const nextCanvasRect = canvas.getBoundingClientRect();
        const nextAreaRect = area.getBoundingClientRect();
        const pointerX = nextAreaRect.left + area.clientLeft + area.clientWidth / 2;
        const pointerY = nextAreaRect.top + area.clientTop + area.clientHeight / 2;
        const contentX = nextCanvasRect.left - nextAreaRect.left + area.scrollLeft + oldFractionX * nextCanvasRect.width;
        const contentY = nextCanvasRect.top - nextAreaRect.top + area.scrollTop + oldFractionY * nextCanvasRect.height;
        const maxLeft = Math.max(0, area.scrollWidth - area.clientWidth);
        const maxTop = Math.max(0, area.scrollHeight - area.clientHeight);
        area.scrollLeft = Math.min(maxLeft, Math.max(0, contentX - (pointerX - nextAreaRect.left)));
        area.scrollTop = Math.min(maxTop, Math.max(0, contentY - (pointerY - nextAreaRect.top)));
    }

    // Keep all scroll positions within the resized world's actual extents.
    const maxLeft = Math.max(0, area.scrollWidth - area.clientWidth);
    const maxTop = Math.max(0, area.scrollHeight - area.clientHeight);
    area.scrollLeft = Math.min(maxLeft, Math.max(0, area.scrollLeft));
    area.scrollTop = Math.min(maxTop, Math.max(0, area.scrollTop));
    positionZoomStatus();
}

function applyCanvasZoom() {
    const canvas = getElements().canvas;
    const area = getElements().canvasArea;
    const stage = getElements().canvasStage || canvas.parentElement;
    if (!canvas || !area || !stage) return;

    const factor = zoomFactors()[canvasZoomLevel - 1] || 1;
    const width = Math.max(1, fittedCanvasWidth * factor);
    const height = Math.max(1, fittedCanvasHeight * factor);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    stage.style.width = `${width}px`;
    stage.style.height = `${height + WORLD_BOUNDARY_DEPTH * canvasBaseScale * factor}px`;
    const machineOverlay = getElements().machineOverlay;
    if (machineOverlay) {
        machineOverlay.style.width = `${width}px`;
        machineOverlay.style.height = `${height}px`;
    }
    drawWorldBoundaryOverlay(width, height, canvasBaseScale * factor);
    area.dataset.zoomLevel = String(canvasZoomLevel);
    const areaStyle = getComputedStyle(area);
    const innerWidth = area.clientWidth - parseFloat(areaStyle.paddingLeft) - parseFloat(areaStyle.paddingRight);
    const innerHeight = area.clientHeight - parseFloat(areaStyle.paddingTop) - parseFloat(areaStyle.paddingBottom);
    const stageHeight = height + WORLD_BOUNDARY_DEPTH * canvasBaseScale * factor;
    area.classList.toggle('zoomed', width > innerWidth || stageHeight > innerHeight);
}

function drawWorldBoundaryOverlay(displayWidth, displayHeight, scale) {
    const canvas = getElements().canvas;
    const stage = getElements().canvasStage || canvas.parentElement;
    let overlay = stage.querySelector('#worldBoundaryOverlay');
    if (!overlay) {
        overlay = document.createElementNS(MACHINE_ICON_SVG_NS, 'svg');
        overlay.id = 'worldBoundaryOverlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.position = 'absolute';
        overlay.style.left = '0';
        overlay.style.top = '0';
        overlay.style.overflow = 'visible';
        overlay.style.pointerEvents = 'none';
        stage.appendChild(overlay);
    }

    const depth = WORLD_BOUNDARY_DEPTH;
    overlay.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height + depth}`);
    overlay.setAttribute('width', String(displayWidth));
    overlay.setAttribute('height', String(displayHeight + depth * scale));
    overlay.style.width = `${displayWidth}px`;
    overlay.style.height = `${displayHeight + depth * scale}px`;
    overlay.replaceChildren();

    const edges = [
        { name: 'left', d: `M 0 0 V ${canvas.height + 1}` },
        { name: 'right', d: `M ${canvas.width} 0 V ${canvas.height + 1}` },
        { name: 'bottom', d: `M 0 ${canvas.height} H ${canvas.width}` }
    ];
    for (const edge of edges) {
        const group = document.createElementNS(MACHINE_ICON_SVG_NS, 'g');
        group.setAttribute('data-edge', edge.name);
        const path = document.createElementNS(MACHINE_ICON_SVG_NS, 'path');
        path.setAttribute('d', edge.d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#754521');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-linecap', 'butt');
        group.appendChild(path);
        overlay.appendChild(group);
    }
}

function hideZoomStatus() {
    const status = getElements().zoomStatus;
    if (!status) return;
    clearTimeout(zoomStatusTimer);
    zoomStatusTimer = null;
    status.hidden = true;
    status.classList.remove('zoom-status-fade');
}

function positionZoomStatus() {
    const status = getElements().zoomStatus;
    const area = getElements().canvasArea;
    if (!status || !area) return;
    const rect = area.getBoundingClientRect();
    status.style.top = `${Math.max(8, rect.top + 12)}px`;
    status.style.right = `${Math.max(8, window.innerWidth - rect.right + 12)}px`;
}

function showZoomStatus() {
    const status = getElements().zoomStatus;
    if (!status) return;
    clearTimeout(zoomStatusTimer);
    status.textContent = `Zoom: ${canvasZoomLevel}/${zoomFactors().length}`;
    status.hidden = false;
    positionZoomStatus();
    status.classList.remove('zoom-status-fade');
    void status.offsetWidth;
    status.classList.add('zoom-status-fade');
    zoomStatusTimer = setTimeout(() => {
        status.hidden = true;
        status.classList.remove('zoom-status-fade');
        zoomStatusTimer = null;
    }, 1000);
}

export function getCanvasZoomLevel() {
    return canvasZoomLevel;
}

export function resetCanvasZoom() {
    expandedZoomProfile = hasLargeZoomProfile();
    canvasZoomLevel = 1;
    applyCanvasZoom();
    const area = getElements().canvasArea;
    area.scrollLeft = 0;
    area.scrollTop = 0;
    hideZoomStatus();
}

export function setCanvasZoomLevel(level, { anchorX, anchorY } = {}) {
    const nextLevel = Math.max(1, Math.min(zoomFactors().length, Math.round(level)));
    if (nextLevel === canvasZoomLevel) return false;

    const area = getElements().canvasArea;
    const canvas = getElements().canvas;
    const areaRect = area.getBoundingClientRect();
    const oldRect = canvas.getBoundingClientRect();
    const pointerX = Number.isFinite(anchorX) ? anchorX : areaRect.left + area.clientWidth / 2;
    const pointerY = Number.isFinite(anchorY) ? anchorY : areaRect.top + area.clientHeight / 2;
    const oldFractionX = oldRect.width > 0
        ? Math.max(0, Math.min(1, (pointerX - oldRect.left) / oldRect.width)) : 0.5;
    const oldFractionY = oldRect.height > 0
        ? Math.max(0, Math.min(1, (pointerY - oldRect.top) / oldRect.height)) : 0.5;

    canvasZoomLevel = nextLevel;
    applyCanvasZoom();
    showZoomStatus();
    if (context && imageData) drawWorld();
    // Keep the cell under the pointer under the pointer while changing level.
    // This also gives keyboard and test-driven zoom changes a useful centered
    // starting position without inventing a separate pan model.
    const nextRect = canvas.getBoundingClientRect();
    const nextAreaRect = area.getBoundingClientRect();
    const contentX = nextRect.left - nextAreaRect.left + area.scrollLeft + oldFractionX * nextRect.width;
    const contentY = nextRect.top - nextAreaRect.top + area.scrollTop + oldFractionY * nextRect.height;
    const maxLeft = Math.max(0, area.scrollWidth - area.clientWidth);
    const maxTop = Math.max(0, area.scrollHeight - area.clientHeight);
    area.scrollLeft = Math.min(maxLeft, Math.max(0, contentX - (pointerX - nextAreaRect.left)));
    area.scrollTop = Math.min(maxTop, Math.max(0, contentY - (pointerY - nextAreaRect.top)));
    return true;
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

    if (!window.__E2E_MODE__) requestAnimationFrame(gameLoop);
}

//------------------------------------------------------------------- rendering

export function renderWorld() {
    drawWorld();
}

function visibleCellBounds(margin = 0) {
    const { canvas, canvasArea: area } = getElements();
    const rect = canvas.getBoundingClientRect();
    const areaRect = area.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { left: 0, top: 0, right: 0, bottom: 0 };
    const viewLeft = areaRect.left + area.clientLeft;
    const viewTop = areaRect.top + area.clientTop;
    const viewRight = viewLeft + area.clientWidth;
    const viewBottom = viewTop + area.clientHeight;
    const left = Math.max(viewLeft, rect.left);
    const top = Math.max(viewTop, rect.top);
    const right = Math.min(viewRight, rect.right);
    const bottom = Math.min(viewBottom, rect.bottom);
    if (right <= left || bottom <= top) return { left: 0, top: 0, right: 0, bottom: 0 };

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        left: Math.max(0, Math.floor((left - rect.left) * scaleX) - margin),
        top: Math.max(0, Math.floor((top - rect.top) * scaleY) - margin),
        right: Math.min(canvas.width, Math.ceil((right - rect.left) * scaleX) + margin),
        bottom: Math.min(canvas.height, Math.ceil((bottom - rect.top) * scaleY) + margin)
    };
}

function drawWorld() {
    const world = getWorld();
    const defs = getDefinitions();
    const type = world.type;
    const temp = world.temp;
    const life = world.life;
    const shade = world.shade;
    const data = world.data;
    const plantHealth = world.plantHealth;
    const power = world.power;
    const charge = world.charge;
    const wind = world.wind;
    const visualizationMode = getVisualizationMode();
    const bounds = visibleCellBounds();
    const airTint = airTintForTemperature(getAmbientTarget());
    // Lit gunpowder flickers between its two colours while it catches.
    const flicker = (getFrameCount() & 2) === 0;

    for (let y = bounds.top; y < bounds.bottom; y++) {
        for (let x = bounds.left; x < bounds.right; x++) {
        const i = y * world.cols + x;
        const p = i * 4;
        const id = type[i];

        if (visualizationMode === 'heat') {
            writeHeatColour(pixels, p, temp[i], id, defs[id]?.alpha);
            continue;
        }
        if (visualizationMode === 'humidity') {
            writeHumidityColour(pixels, p, getHumidityAt(x, y), id, defs[id]?.alpha);
            continue;
        }
        if (visualizationMode === 'wind' && (id === EMPTY || defs[id]?.category === 'gas')) {
            const vx = world.airflowX[i] + world.displayWindX[i];
            const vy = world.airflowY[i] + world.displayWindY[i];
            writeWindColour(pixels, p, Math.hypot(vx, vy));
            continue;
        }

        if (id === EMPTY) {
            // The whole air mass takes a subtle tint from the air-temperature
            // dial, never from a nearby flame or ice cell. The curve is quiet
            // around ordinary weather and increasingly strong near the two
            // extremes. Wind adds its pale haze on top.
            const blown = wind[i];
            const f = blown / 255;
            // Keep machine cones visible without washing out the air behind them.
            pixels[p] = clampByte(airTint[0] + 12 * f);
            pixels[p + 1] = clampByte(airTint[1] + 19 * f);
            pixels[p + 2] = clampByte(airTint[2] + 28 * f);
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

        // Plant colour tracks condition: thriving plants keep their full colour,
        // while stressed plants fade toward a muted, dry green-brown.
        if (def.isPlant && plantHealth) {
            const health = Math.max(0, Math.min(1, plantHealth[i]));
            const wilt = (1 - health) * 0.5;
            r += (146 - r) * wilt;
            g += (126 - g) * wilt;
            b += (78 - b) * wilt;
        }

        // Solid metals glow locally as their temperature approaches melting.
        // This changes only the rendered particle colour; it does not radiate
        // extra heat or tint neighbouring cells.
        if (def.glowRgb && Number.isFinite(def.glowStartTemp) &&
            Number.isFinite(def.glowTemp) && def.glowTemp > def.glowStartTemp) {
            let mix = (temp[i] - def.glowStartTemp) / (def.glowTemp - def.glowStartTemp);
            if (mix < 0) mix = 0;
            if (mix > 1) mix = 1;
            r += (def.glowRgb[0] - r) * mix;
            g += (def.glowRgb[1] - g) * mix;
            b += (def.glowRgb[2] - b) * mix;
        }

        // Stored charge gives Battery a persistent yellow tint. A live power
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
            const f = (blown / 255) * 0.15;
            r += (226 - r) * f;
            g += (238 - g) * f;
            b += (255 - b) * f;
        }

        // A fixed per-cell wobble in brightness so materials look grainy.
        const wobble = (shade[i] - 128) * 0.14;
        pixels[p] = clampByte(r + wobble);
        pixels[p + 1] = clampByte(g + wobble);
        pixels[p + 2] = clampByte(b + wobble);
        pixels[p + 3] = Math.round(255 * (def.alpha === undefined ? 1 : def.alpha));
        }
    }

    drawGrabberPreview();
    if (bounds.right > bounds.left && bounds.bottom > bounds.top) {
        context.putImageData(imageData, 0, 0, bounds.left, bounds.top,
            bounds.right - bounds.left, bounds.bottom - bounds.top);
    }
    if (visualizationMode === 'wind') drawWindVisualization(world, bounds, defs);
    drawMachineOverlays();
    drawGrabberOutline();
    drawLinePreview();
    drawShapePreview();
}

// A pending machine is only a visual preview. It is deliberately kept outside
// the physics world until mouse-up commits the final facing direction.
export function setMachinePlacementPreview(x, y, machine, direction = 0) {
    machinePlacementPreview = { x, y, machine, direction: direction & 7 };
}

export function clearMachinePlacementPreview() {
    machinePlacementPreview = null;
}

const MACHINE_ICON_SVG_NS = 'http://www.w3.org/2000/svg';

// Machines are still one simulation cell, but their face is a fixed-size
// screen icon so it remains readable when the pixel canvas is scaled up. Every
// face includes a small right-pointing arrow in its base artwork; rotating the
// whole SVG makes the output direction obvious even for symmetric symbols such
// as the Cooler snowflake.
function drawMachineOverlays() {
    const overlay = getElements().machineOverlay;
    if (!overlay) return;
    if (typeof overlay.replaceChildren === 'function') overlay.replaceChildren();
    else overlay.innerHTML = '';

    const world = getWorld();
    const canvas = getElements().canvas;
    const cellWidth = canvas.clientWidth / world.cols;
    const cellHeight = canvas.clientHeight / world.rows;
    const iconMargin = Math.ceil(32 / Math.max(0.25, Math.min(cellWidth, cellHeight)));
    const viewport = visibleCellBounds();
    const visible = visibleCellBounds(Math.max(34, iconMargin) + 1);
    const defs = getDefinitions();
    const rotations = [0, 180, -90, 90, -45, -135, 135, 45];
    const coneLayer = document.createElementNS(MACHINE_ICON_SVG_NS, 'svg');
    coneLayer.setAttribute('class', 'machine-cone-overlay');
    coneLayer.setAttribute('viewBox', `0 0 ${canvas.clientWidth} ${canvas.clientHeight}`);
    coneLayer.setAttribute('width', '100%');
    coneLayer.setAttribute('height', '100%');
    coneLayer.setAttribute('aria-hidden', 'true');
    overlay.appendChild(coneLayer);
    const flowLayer = document.createElementNS(MACHINE_ICON_SVG_NS, 'svg');
    flowLayer.setAttribute('class', 'tubing-flow-overlay');
    flowLayer.setAttribute('viewBox', `0 0 ${canvas.clientWidth} ${canvas.clientHeight}`);
    flowLayer.setAttribute('width', '100%');
    flowLayer.setAttribute('height', '100%');
    flowLayer.setAttribute('aria-hidden', 'true');
    overlay.appendChild(flowLayer);
    const icons = {
        fan: '<circle cx="11" cy="15" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
        '<circle cx="11" cy="15" r="2.2" fill="currentColor"/>' +
        '<path d="M11 12.8C7 10 6.5 6 9.4 5.1c3.2-1 4.3 2.7 2.1 7.7Z" fill="currentColor"/>' +
        '<path d="M13.2 15c2.8-4 6.8-4.5 7.7-1.6 1 3.2-2.7 4.3-7.7 2.1Z" fill="currentColor"/>' +
        '<path d="M11 17.2c4 2.8 4.5 6.8 1.6 7.7-3.2 1-4.3-2.7-2.1-7.7Z" fill="currentColor"/>' +
        '<path d="M17 10h7M18 15h9M17 20h7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
        '<path d="M3 27h11m0 0-3-2.5m3 2.5-3 2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
        heater: '<path d="M15 26c-5.6 0-8.8-3.1-8.8-7.1 0-3.1 2-5.3 4.7-7.7-.2 2.7 1.2 3.9 2.4 4.8-.2-4.6 2.4-7.3 4.8-10 2.6 3.1 5.1 6.4 5.1 10.8C23.2 22.3 19.8 26 15 26Z" fill="currentColor"/>' +
            '<path d="M10.7 21.5c.3-2 1.6-3.1 3.6-4.7-.1 2.5.8 3.5 1.8 4.7" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>' +
            '<path d="M3 27h11m0 0-3-2.5m3 2.5-3 2.5" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
        cooler: '<path d="M15 4v22M6 9.5l18 11M6 20.5l18-11M15 4l-3 3M15 4l3 3M15 26l-3-3M15 26l3-3M6 9.5l.5 4M6 9.5l4 .6M24 20.5l-.5-4M24 20.5l-4-.6M6 20.5l4-.6M6 20.5l.5-4M24 9.5l-4 .6M24 9.5l-.5 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M3 27h11m0 0-3-2.5m3 2.5-3 2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
        storagePowder: '<rect x="11" y="6" width="15" height="19" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
            '<path d="M11 13 2 3M11 17 2 27" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.78"/>' +
            '<path d="M3 15h7m0 0-3-3m3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M15 11h8M15 15h8M15 19h8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
        storageLiquid: '<rect x="11" y="6" width="15" height="19" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
            '<path d="M11 13 2 3M11 17 2 27" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.78"/>' +
            '<path d="M3 15h7m0 0-3-3m3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M14 12c2-2 4 2 6 0s4 2 6 0M14 18c2-2 4 2 6 0s4 2 6 0" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
        storageGas: '<rect x="11" y="6" width="15" height="19" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
            '<path d="M11 13 2 3M11 17 2 27" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.78"/>' +
            '<path d="M3 15h7m0 0-3-3m3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<circle cx="16" cy="12" r="1.2" fill="currentColor"/><circle cx="21" cy="16" r="1.2" fill="currentColor"/><circle cx="16" cy="20" r="1.2" fill="currentColor"/>',
        vent: '<path d="M5 8h20l-2.2 4H7.2L5 8Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
            '<path d="M15 8V2M15 2l-2 2M15 2l2 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M8 14h14v8H8zM11 16v4M15 16v4M19 16v4M5 25h20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
        mixer: '<rect x="7" y="7" width="16" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
            '<path d="M0 9h7M30 9h-7M4 9l3 3M26 9l-3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<circle cx="15" cy="16" r="4.5" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
            '<path d="M15 11.5v9M10.5 16h9M11.8 12.8l6.4 6.4M18.2 12.8l-6.4 6.4" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round"/>' +
            '<path d="M7 23h16M11 25v2M19 25v2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'
    };

    drawTubingFlowOverlay(flowLayer, getTubingFlows(), cellWidth, cellHeight, viewport);

    for (let y = visible.top; y < visible.bottom; y++) {
      for (let x = visible.left; x < visible.right; x++) {
        const i = y * world.cols + x;
        const def = defs[world.type[i]];
        const machine = def?.machine;
        if (!machine || !icons[machine]) continue;
        if ((machine === 'heater' || machine === 'cooler') && isMachinePoweredAt(x, y)) {
            const cone = document.createElementNS(MACHINE_ICON_SVG_NS, 'path');
            cone.setAttribute('class', `machine-cone machine-cone-${machine}`);
            cone.setAttribute('d', machineConePath(x, y, world.data[i] & 7,
                cellWidth, cellHeight, def.machineRange || 28));
            coneLayer.appendChild(cone);
        }
        const icon = document.createElementNS(MACHINE_ICON_SVG_NS, 'svg');
        icon.setAttribute('class', `machine-overlay-icon machine-${machine}`);
        icon.setAttribute('viewBox', '0 0 30 30');
        const iconSize = machine === 'mixer' ? 64 : (machine.startsWith('storage') ? 32 : 30);
        icon.setAttribute('width', String(iconSize));
        icon.setAttribute('height', String(iconSize));
        icon.setAttribute('aria-hidden', 'true');
        icon.style.left = `${(x + 0.5) * cellWidth - iconSize / 2}px`;
        icon.style.top = `${(y + 0.5) * cellHeight - iconSize / 2}px`;
        const mixerRotation = machine === 'mixer' ? -90 : 0;
        icon.style.transform = `rotate(${machine === 'vent'
            ? 0 : rotations[world.data[i] & 7] + mixerRotation}deg)`;
        icon.innerHTML = icons[machine];
        overlay.appendChild(icon);
      }
    }

    if (machinePlacementPreview) {
        const preview = machinePlacementPreview;
        const def = getDefinitions().find(candidate => candidate?.machine === preview.machine);
        if (def && icons[preview.machine] && inBounds(preview.x, preview.y)) {
            if (preview.machine === 'heater' || preview.machine === 'cooler') {
                const cone = document.createElementNS(MACHINE_ICON_SVG_NS, 'path');
                cone.setAttribute('class', `machine-cone machine-cone-${preview.machine} machine-cone-preview`);
                cone.setAttribute('d', machineConePath(preview.x, preview.y, preview.direction,
                    cellWidth, cellHeight, def.machineRange || 28));
                coneLayer.appendChild(cone);
            }
            const icon = document.createElementNS(MACHINE_ICON_SVG_NS, 'svg');
            icon.setAttribute('class', `machine-overlay-icon machine-${preview.machine} machine-placement-preview`);
            icon.setAttribute('viewBox', '0 0 30 30');
            const iconSize = preview.machine === 'mixer'
                ? 64 : (preview.machine.startsWith('storage') ? 32 : 30);
            icon.setAttribute('width', String(iconSize));
            icon.setAttribute('height', String(iconSize));
            icon.setAttribute('aria-hidden', 'true');
            icon.style.left = `${(preview.x + 0.5) * cellWidth - iconSize / 2}px`;
            icon.style.top = `${(preview.y + 0.5) * cellHeight - iconSize / 2}px`;
            const mixerRotation = preview.machine === 'mixer' ? -90 : 0;
            icon.style.transform = `rotate(${preview.machine === 'vent'
                ? 0 : rotations[preview.direction] + mixerRotation}deg)`;
            icon.innerHTML = icons[preview.machine];
            overlay.appendChild(icon);
        }
    }
}

// Animate discrete bands along the same ordered tubing-cell route which moves
// the material. Unlike an SVG centreline, the bands stay in real cells at a
// bend, while their sequence makes the direction from Storage Bin to Vent (or
// another compatible bin) unambiguous.
function drawTubingFlowOverlay(layer, flows, cellWidth, cellHeight, visible) {
    const frame = getFrameCount();
    const world = getWorld();
    for (let flowIndex = 0; flowIndex < flows.length; flowIndex++) {
        const flow = flows[flowIndex];
        if (!flow.path?.length) continue;
        const route = document.createElementNS(MACHINE_ICON_SVG_NS, 'g');
        route.setAttribute('class', 'tubing-flow-route');
        const spacing = Math.max(6, Math.min(12, Math.ceil(flow.path.length / 2)));
        const bandWidth = 2.2;
        const progress = frame * Math.max(0.12, Math.min(0.7, flow.rate / 80));
        route.setAttribute('data-flow-progress', String(progress));
        for (let position = 0; position < flow.path.length; position++) {
            const phase = ((progress - position) % spacing + spacing) % spacing;
            if (phase > bandWidth) continue;
            const cell = flow.path[position];
            const x = cell % world.cols;
            const y = Math.floor(cell / world.cols);
            if (x < visible.left || x >= visible.right || y < visible.top || y >= visible.bottom) continue;
            const band = document.createElementNS(MACHINE_ICON_SVG_NS, 'rect');
            band.setAttribute('class', 'tubing-flow-band-cell');
            band.setAttribute('x', String(x * cellWidth));
            band.setAttribute('y', String(y * cellHeight));
            band.setAttribute('width', String(cellWidth));
            band.setAttribute('height', String(cellHeight));
            band.setAttribute('fill', '#59a8e0');
            band.setAttribute('opacity', String(0.35 + 0.65 * (1 - phase / bandWidth)));
            band.setAttribute('data-route-position', String(position));
            route.appendChild(band);
        }
        if (route.childElementCount) layer.appendChild(route);
    }
}

function machineDirectionVector(direction) {
    switch (direction & 7) {
        case 1: return [-1, 0];
        case 2: return [0, -1];
        case 3: return [0, 1];
        case 4: return [1, -1];
        case 5: return [-1, -1];
        case 6: return [-1, 1];
        case 7: return [1, 1];
        default: return [1, 0];
    }
}

// Draw the same expanding 28-cell cone used by Heater and Cooler. The visual
// is intentionally translucent: it shows the affected area without hiding the
// particles and temperature view underneath it.
function machineConePath(x, y, direction, cellWidth, cellHeight, range) {
    const [dirX, dirY] = machineDirectionVector(direction);
    const centreX = (x + 0.5) * cellWidth;
    const centreY = (y + 0.5) * cellHeight;
    const stepX = dirX * cellWidth;
    const stepY = dirY * cellHeight;
    const stepLength = Math.max(1, Math.hypot(stepX, stepY));
    const unitX = stepX / stepLength;
    const unitY = stepY / stepLength;
    const tangentX = -unitY;
    const tangentY = unitX;
    const reach = Math.max(1, Math.round(range));
    const cellSize = Math.min(cellWidth, cellHeight);
    const nearX = centreX + stepX * 0.5;
    const nearY = centreY + stepY * 0.5;
    const farX = centreX + stepX * reach;
    const farY = centreY + stepY * reach;
    const nearHalf = cellSize * 0.35;
    const farHalf = cellSize * (reach - 1) * 0.5;
    const points = [
        [nearX + tangentX * nearHalf, nearY + tangentY * nearHalf],
        [farX + tangentX * farHalf, farY + tangentY * farHalf],
        [farX - tangentX * farHalf, farY - tangentY * farHalf],
        [nearX - tangentX * nearHalf, nearY - tangentY * nearHalf]
    ];
    return `M ${points.map(([px, py]) => `${px.toFixed(2)} ${py.toFixed(2)}`).join(' L ')} Z`;
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
function writeHeatColour(out, p, t, id, alpha = 1) {
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
    out[p + 3] = Math.round(255 * (alpha === undefined ? 1 : alpha));
}

// Humidity is a location field, so the view colours each cell directly from
// its local value. This path only writes pixels and never feeds back into the
// humidity simulation array.
const HUMIDITY_DRY_RGB = [218, 91, 42];
const HUMIDITY_MIDDLE_RGB = [180, 170, 103];
const HUMIDITY_HUMID_RGB = [37, 190, 225];

function writeHumidityColour(out, p, humidity, id, alpha = 1) {
    const value = Math.max(0, Math.min(100, Number(humidity) || 0));
    const lower = value < 50 ? 0 : 1;
    const mix = value < 50 ? value / 50 : (value - 50) / 50;
    const from = lower === 0 ? HUMIDITY_DRY_RGB : HUMIDITY_MIDDLE_RGB;
    const to = lower === 0 ? HUMIDITY_MIDDLE_RGB : HUMIDITY_HUMID_RGB;
    const dim = id === EMPTY ? 0.72 : 1;
    out[p] = clampByte((from[0] + (to[0] - from[0]) * mix) * dim);
    out[p + 1] = clampByte((from[1] + (to[1] - from[1]) * mix) * dim);
    out[p + 2] = clampByte((from[2] + (to[2] - from[2]) * mix) * dim);
    out[p + 3] = Math.round(255 * (alpha === undefined ? 1 : alpha));
}

function writeWindColour(out, p, magnitude) {
    const speed = Math.max(0, Math.min(1, magnitude / 8));
    out[p] = clampByte(24 + (255 - 24) * speed);
    out[p + 1] = clampByte(130 + (45 - 130) * speed);
    out[p + 2] = clampByte(255 + (25 - 255) * speed);
    out[p + 3] = 255;
}

const WIND_MARK_SPACING = 20;
const WIND_TRAIL_MARK_SPACING = 4;

// Airflow samples are display-only. Powered Fans supply their actual advected
// vector field; wind-tool and Breeze trails provide short-lived directional
// samples alongside it. Sparse arrows keep the overlay legible at any world
// size and the work stays inside the visible part of the canvas.
function drawWindVisualization(world, bounds, defs) {
    if (!context || bounds.right <= bounds.left || bounds.bottom <= bounds.top) return;
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 1.45;
    context.beginPath();
    context.rect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    context.clip();

    const drawArrow = (x, y, vx, vy) => {
        const magnitude = Math.hypot(vx, vy);
        if (magnitude < 0.08) return;

        const dirX = vx / magnitude;
        const dirY = vy / magnitude;
        const speed = Math.max(0, Math.min(1, magnitude / 8));
        const red = 24 + (255 - 24) * speed;
        const green = 130 + (45 - 130) * speed;
        const blue = 255 + (25 - 255) * speed;
        const length = 5.5 + speed * 4;
        const fromX = x - dirX * length * 0.48;
        const fromY = y - dirY * length * 0.48;
        const toX = x + dirX * length * 0.48;
        const toY = y + dirY * length * 0.48;
        const angle = Math.atan2(dirY, dirX);
        const headLength = Math.min(3, length * 0.34);
        const leftAngle = angle + Math.PI * 0.78;
        const rightAngle = angle - Math.PI * 0.78;

        context.strokeStyle = `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`;
        context.beginPath();
        context.moveTo(fromX, fromY);
        context.lineTo(toX, toY);
        context.lineTo(toX + Math.cos(leftAngle) * headLength, toY + Math.sin(leftAngle) * headLength);
        context.moveTo(toX, toY);
        context.lineTo(toX + Math.cos(rightAngle) * headLength, toY + Math.sin(rightAngle) * headLength);
        context.stroke();
    };

    const startX = Math.floor((bounds.left - WIND_MARK_SPACING / 2) / WIND_MARK_SPACING) * WIND_MARK_SPACING + WIND_MARK_SPACING / 2;
    const startY = Math.floor((bounds.top - WIND_MARK_SPACING / 2) / WIND_MARK_SPACING) * WIND_MARK_SPACING + WIND_MARK_SPACING / 2;
    for (let y = startY; y < bounds.bottom; y += WIND_MARK_SPACING) {
        if (y < bounds.top) continue;
        for (let x = startX; x < bounds.right; x += WIND_MARK_SPACING) {
            if (x < bounds.left) continue;
            const i = y * world.cols + x;
            const id = world.type[i];
            if (id !== EMPTY && defs[id]?.category !== 'gas') continue;
            drawArrow(x, y, world.airflowX[i] + world.displayWindX[i],
                world.airflowY[i] + world.displayWindY[i]);
        }
    }

    // Small wind-tool strokes can occupy fewer than twenty cells. Sample their
    // transient directional marks more closely so every small gust can show
    // its direction without increasing the density of persistent Fan arrows.
    const trailStartX = Math.floor((bounds.left - WIND_TRAIL_MARK_SPACING / 2) / WIND_TRAIL_MARK_SPACING) * WIND_TRAIL_MARK_SPACING + WIND_TRAIL_MARK_SPACING / 2;
    const trailStartY = Math.floor((bounds.top - WIND_TRAIL_MARK_SPACING / 2) / WIND_TRAIL_MARK_SPACING) * WIND_TRAIL_MARK_SPACING + WIND_TRAIL_MARK_SPACING / 2;
    for (let y = trailStartY; y < bounds.bottom; y += WIND_TRAIL_MARK_SPACING) {
        if (y < bounds.top) continue;
        for (let x = trailStartX; x < bounds.right; x += WIND_TRAIL_MARK_SPACING) {
            if (x < bounds.left) continue;
            const i = y * world.cols + x;
            const id = world.type[i];
            if (id !== EMPTY && defs[id]?.category !== 'gas') continue;
            drawArrow(x, y, world.displayWindX[i], world.displayWindY[i]);
        }
    }
    context.restore();
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

export function setShapePreview(shape, x0, y0, x1, y1) {
    if (shape !== 'rectangle' && shape !== 'ellipse') return;
    shapePreview = { shape, x0, y0, x1, y1 };
}

export function clearShapePreview() {
    shapePreview = null;
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

function drawShapePreview() {
    if (!shapePreview || !context) return;

    const left = Math.min(shapePreview.x0, shapePreview.x1);
    const right = Math.max(shapePreview.x0, shapePreview.x1);
    const top = Math.min(shapePreview.y0, shapePreview.y1);
    const bottom = Math.max(shapePreview.y0, shapePreview.y1);
    const width = right - left + 1;
    const height = bottom - top + 1;

    context.strokeStyle = '#8bdcff';
    context.lineWidth = 1;
    if (shapePreview.shape === 'rectangle') {
        context.strokeRect(left + 0.5, top + 0.5, width, height);
        return;
    }

    // Use a small polygon so the preview works in the same lightweight canvas
    // contexts as the rest of the renderer, without relying on ellipse().
    const centreX = left + width / 2;
    const centreY = top + height / 2;
    const radiusX = Math.max(0.5, width / 2);
    const radiusY = Math.max(0.5, height / 2);
    const segments = Math.max(16, Math.ceil(Math.PI * Math.max(width, height)));
    context.beginPath();
    for (let segment = 0; segment <= segments; segment++) {
        const angle = (segment / segments) * Math.PI * 2;
        const x = centreX + Math.cos(angle) * radiusX;
        const y = centreY + Math.sin(angle) * radiusY;
        if (segment === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
    }
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
        pixels[p + 3] = cell.previewA === undefined ? 255 : cell.previewA;
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
    const drawing = getDrawMode() === 'line' ? 'Line'
        : getDrawMode() === 'rectangle' ? 'Rectangle'
            : getDrawMode() === 'ellipse' ? 'Ellipse' : 'Brush';

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
        ? getConnectedBatteryCharge(hoverX, hoverY)
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
    indicator.setAttribute('aria-label', `Battery charge ${percent}%`);
    indicator.title = `Battery charge: ${percent}%`;
    elements.chargeIndicatorFill.setAttribute('width', String(ratio * 17));
    elements.chargeIndicatorValue.textContent = `${percent}%`;
}

//---------------------------------------------------------------------- brush

// Paints a blob of the selected particle. A material can only be added to air;
// cells already occupied by any material are left untouched. The eraser is the
// explicit exception and can clear any cell.
//
// dragX and dragY are which way the mouse was moving, which only the wind tool
// cares about. rayDirection is the hand-painted ray's stored cardinal heading;
// machine-emitted ray markers are never created by this brush path.
export function paintCell(centreX, centreY, dragX, dragY, rayDirection = null) {
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
            setPaintedRayDirection(i, id, rayDirection);
        }
    }
}

function setPaintedRayDirection(i, id, direction) {
    if (direction === null || direction === undefined || !getDefinitions()[id]?.projectile) return;
    const normalised = ((Math.round(direction) % 8) + 8) % 8;
    // Keep the marker bit intact if a future caller paints through a marked ray;
    // ordinary hand-painted cells have no marker and retain only these 3 bits.
    getWorld().data[i] = (getWorld().data[i] & 8) | normalised;
}

function machineId(machine) {
    return getDefinitions().findIndex(def => def && def.machine === machine);
}

function normaliseMachineDirection(direction) {
    return ((Math.round(direction) % 8) + 8) % 8;
}

export function canPlaceMachine(x, y, machine) {
    const id = machineId(machine);
    return id > 0 && inBounds(x, y) && getWorld().type[index(x, y)] === EMPTY;
}

// Machines are placed as one cell, independently of brush size. Their
// orientation lives in the cell's data byte so it travels with the machine
// when the grabber moves it and survives normal world-state operations.
export function placeMachine(x, y, machine, direction = 0) {
    const id = machineId(machine);
    if (id <= 0 || !inBounds(x, y)) return false;
    const i = index(x, y);
    if (getWorld().type[i] !== EMPTY) return false;
    setCell(x, y, id);
    getWorld().data[i] = normaliseMachineDirection(direction);
    if (machine === 'mixer') {
        const stubId = getDefinitions().findIndex(def => def?.tubing);
        for (const side of [-1, 1]) {
            for (let distance = 1; distance <= 7; distance++) {
                const stubX = x + side * distance;
                const stubY = y - 3;
                if (inBounds(stubX, stubY) && getWorld().type[index(stubX, stubY)] === EMPTY) {
                    setCell(stubX, stubY, stubId);
                }
            }
        }
    }
    return true;
}

export function faceMachine(x, y, machine, direction = 0) {
    const i = inBounds(x, y) ? index(x, y) : -1;
    if (i < 0 || getWorld().type[i] !== machineId(machine)) return false;
    getWorld().data[i] = normaliseMachineDirection(direction);
    return true;
}

// Compatibility wrappers for callers that still refer to the original Fan
// helpers. New machines use the generic functions above.
export function placeFan(x, y, direction = 0) {
    return placeMachine(x, y, 'fan', direction);
}

export function faceFan(x, y, direction = 0) {
    return faceMachine(x, y, 'fan', direction);
}

// Draws along the line between two mouse positions so that a fast drag leaves a
// continuous stroke instead of a dotted one. The direction of the drag is
// handed on, since the wind tool blows whichever way the mouse is going.
export function paintLine(x0, y0, x1, y1, rayDirection = null) {
    const dragX = x1 - x0;
    const dragY = y1 - y0;
    const steps = Math.max(Math.abs(dragX), Math.abs(dragY));
    if (steps === 0) {
        paintCell(x1, y1, 0, 0, rayDirection);
        return;
    }
    for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        paintCell(Math.round(x0 + dragX * t), Math.round(y0 + dragY * t), dragX, dragY, rayDirection);
    }
}

// Filled shapes use one-cell placement so their footprint is exact and the
// material's air-only rule is preserved for every cell inside the shape.
export function paintShape(shape, x0, y0, x1, y1, rayDirection = null) {
    if (shape !== 'rectangle' && shape !== 'ellipse') return;

    const id = getEraserOn() ? EMPTY : getParticleTypeIdSelected();
    const left = Math.min(x0, x1);
    const right = Math.max(x0, x1);
    const top = Math.min(y0, y1);
    const bottom = Math.max(y0, y1);
    const width = right - left + 1;
    const height = bottom - top + 1;
    const centreX = left + width / 2;
    const centreY = top + height / 2;
    const radiusX = Math.max(0.5, width / 2);
    const radiusY = Math.max(0.5, height / 2);
    const isWind = id !== EMPTY && getDefinitions()[id]?.tool === 'wind';

    for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
            if (shape === 'ellipse') {
                const dx = (x + 0.5 - centreX) / radiusX;
                const dy = (y + 0.5 - centreY) / radiusY;
                if (dx * dx + dy * dy > 1) continue;
            }
            if (isWind) {
                applyWind(x, y, 0, 0, Math.max(3, getBrushSize()), getWindStrength());
            } else {
                paintSingleCell(x, y, id, true, rayDirection);
            }
        }
    }
}

function paintSingleCell(x, y, id, fillLooseMaterial = false, rayDirection = null) {
    if (!inBounds(x, y)) return;
    const world = getWorld();
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
        return;
    }
    if (world.type[i] !== EMPTY) return;

    const def = getDefinitions()[id];
    const loose = def.category === 'powder' || def.category === 'gas';
    if (!fillLooseMaterial && loose && getBrushSize() > 1 && Math.random() < 0.45) return;
    setCell(x, y, id);
    setPaintedRayDirection(i, id, rayDirection);
}

// --------------------------------------------------------------- blueprints

// Copying through every listed field lets a blueprint retain such details as a
// hot ember's remaining life, a charged conductor, and a machine's direction.
export function captureBlueprint(x0, y0, x1, y1) {
    const world = getWorld();
    const left = Math.max(0, Math.min(x0, x1));
    const right = Math.min(world.cols - 1, Math.max(x0, x1));
    const top = Math.max(0, Math.min(y0, y1));
    const bottom = Math.min(world.rows - 1, Math.max(y0, y1));
    if (left > right || top > bottom) return null;

    const width = right - left + 1;
    const height = bottom - top + 1;
    const cells = {};
    for (const field of BLUEPRINT_FIELDS) {
        const copy = new world[field].constructor(width * height);
        let target = 0;
        for (let y = top; y <= bottom; y++) {
            const source = index(left, y);
            copy.set(world[field].subarray(source, source + width), target);
            target += width;
        }
        cells[field] = copy;
    }
    return { left, top, width, height, cells };
}

// The copied area is centred on the click. Cells beyond an edge are clipped,
// while every reachable destination is replaced -- including air -- so a stamp
// always overrides the existing world rather than acting like the brush.
export function stampBlueprint(blueprint, centreX, centreY) {
    if (!blueprint?.cells || !Number.isInteger(blueprint.width) || !Number.isInteger(blueprint.height)) return 0;
    const startX = Math.round(centreX - (blueprint.width - 1) / 2);
    const startY = Math.round(centreY - (blueprint.height - 1) / 2);
    return stampBlueprintAt(blueprint, startX, startY);
}

// This top-left variant is used by the session-only stamp history. It restores
// an exact captured patch rather than centring it again, which is especially
// important for stamps that were clipped at a world edge.
export function stampBlueprintAt(blueprint, startX, startY) {
    if (!blueprint?.cells || !Number.isInteger(blueprint.width) || !Number.isInteger(blueprint.height)) return 0;
    const world = getWorld();
    let stamped = 0;
    for (let sy = 0; sy < blueprint.height; sy++) {
        const y = startY + sy;
        if (y < 0 || y >= world.rows) continue;
        for (let sx = 0; sx < blueprint.width; sx++) {
            const x = startX + sx;
            if (x < 0 || x >= world.cols) continue;
            const source = sy * blueprint.width + sx;
            const destination = index(x, y);
            for (const field of BLUEPRINT_FIELDS) world[field][destination] = blueprint.cells[field][source];
            world.tempNext[destination] = world.temp[destination];
            world.moved[destination] = 0;
            stamped++;
        }
    }
    return stamped;
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
                machineSetting: world.machineSetting[i],
                storageType: world.storageType[i], storageCount: world.storageCount[i],
                storageFlowRemainder: world.storageFlowRemainder[i],
                mixerInputTypeA: world.mixerInputTypeA[i], mixerInputCountA: world.mixerInputCountA[i],
                mixerInputFlowA: world.mixerInputFlowA[i], mixerInputTypeB: world.mixerInputTypeB[i],
                mixerInputCountB: world.mixerInputCountB[i], mixerInputFlowB: world.mixerInputFlowB[i],
                mixerOutputCountA: world.mixerOutputCountA[i], mixerOutputCountB: world.mixerOutputCountB[i],
                mixerOutputFlow: world.mixerOutputFlow[i], mixerNextInput: world.mixerNextInput[i],
                mixerOutputNext: world.mixerOutputNext[i],
                power: world.power[i], powerDelay: world.powerDelay[i],
                charge: world.charge[i], wind: world.wind[i],
                previewR: pixels ? pixels[p] : def.rgb[0],
                previewG: pixels ? pixels[p + 1] : def.rgb[1],
                previewB: pixels ? pixels[p + 2] : def.rgb[2],
                previewA: Math.round(255 * (def.alpha === undefined ? 1 : def.alpha))
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
    world.machineSetting[i] = 0;
    world.storageType[i] = 0;
    world.storageCount[i] = 0;
    world.storageFlowRemainder[i] = 0;
    world.mixerInputTypeA[i] = 0; world.mixerInputCountA[i] = 0; world.mixerInputFlowA[i] = 0;
    world.mixerInputTypeB[i] = 0; world.mixerInputCountB[i] = 0; world.mixerInputFlowB[i] = 0;
        world.mixerOutputCountA[i] = 0; world.mixerOutputCountB[i] = 0;
        world.mixerOutputTypeA[i] = 0; world.mixerOutputTypeB[i] = 0; world.mixerOutputMixed[i] = 0;
        world.mixerOutputFlow[i] = 0;
    world.mixerNextInput[i] = 0;
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
    world.machineSetting[i] = cell.machineSetting || 0;
    world.storageType[i] = cell.storageType || 0;
    world.storageCount[i] = cell.storageCount || 0;
    world.storageFlowRemainder[i] = cell.storageFlowRemainder || 0;
    world.mixerInputTypeA[i] = cell.mixerInputTypeA || 0; world.mixerInputCountA[i] = cell.mixerInputCountA || 0;
    world.mixerInputFlowA[i] = cell.mixerInputFlowA || 0; world.mixerInputTypeB[i] = cell.mixerInputTypeB || 0;
    world.mixerInputCountB[i] = cell.mixerInputCountB || 0; world.mixerInputFlowB[i] = cell.mixerInputFlowB || 0;
        world.mixerOutputCountA[i] = cell.mixerOutputCountA || 0; world.mixerOutputCountB[i] = cell.mixerOutputCountB || 0;
        world.mixerOutputTypeA[i] = cell.mixerOutputTypeA || 0; world.mixerOutputTypeB[i] = cell.mixerOutputTypeB || 0;
        world.mixerOutputMixed[i] = cell.mixerOutputMixed || 0;
    world.mixerOutputFlow[i] = cell.mixerOutputFlow || 0; world.mixerNextInput[i] = cell.mixerNextInput || 0;
    world.mixerOutputNext[i] = cell.mixerOutputNext || 0;
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
            resetCanvasZoom();
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
