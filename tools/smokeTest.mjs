// tools/smokeTest.mjs
// -----------------------------------------------------------------------------
// Runs the real ui.js and game.js against a stand-in for the browser, so that
// wiring mistakes (a button id that does not exist, a function that was
// renamed, a canvas call that is not supported) turn up here instead of as a
// blank page with an error in the console.
//
//     node tools/smokeTest.mjs
// -----------------------------------------------------------------------------

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url));

let failures = 0;
function fail(message) { failures++; console.log(`  FAIL  ${message}`); }
function pass(message) { console.log(`  PASS  ${message}`); }

// ------------------------------------------------------------ browser stand-in

function makeElement(id) {
    const classes = new Set(['d-none']);
    return {
        id,
        style: {},
        dataset: {},
        value: '',
        textContent: '',
        innerHTML: '',
        children: [],
        listeners: {},
        classList: {
            add: (...c) => c.forEach(n => classes.add(n)),
            remove: (...c) => c.forEach(n => classes.delete(n)),
            contains: c => classes.has(c),
            toggle: (c, on) => { if (on === undefined) { classes.has(c) ? classes.delete(c) : classes.add(c); } else if (on) { classes.add(c); } else { classes.delete(c); } }
        },
        tagName: 'DIV',
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = String(value); },
        getAttribute(name) { return this.attributes[name]; },
        blur() { this.fire('blur', {}); },
        focus() {},
        addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
        fire(type, event = {}) {
            event.preventDefault ||= () => {};
            event.target ||= this;
            (this.listeners[type] || []).forEach(h => h(event));
        },
        click() { this.fire('click', { button: 0 }); },
        appendChild(child) { this.children.push(child); },
        // Good enough for ".particle-button": walks the tree and matches on
        // class name, since the panel nests buttons inside group grids.
        querySelectorAll(selector) {
            const wanted = String(selector).replace('.', '');
            const found = [];
            const visit = node => node.children.forEach(child => {
                if (String(child.className).split(' ').includes(wanted)) found.push(child);
                visit(child);
            });
            visit(this);
            return found;
        },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
        get clientWidth() { return 1200; },
        get clientHeight() { return 800; },
        get parentElement() { return elements.canvasArea; },
        getContext() {
            return {
                imageSmoothingEnabled: true,
                createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
                putImageData(data) { putCount++; lastImageData = data; },
                strokeRect() { strokeCount++; }
            };
        }
    };
}

let putCount = 0;
let strokeCount = 0;
let lastImageData = null;
const elements = {};
function byId(id) {
    if (!elements[id]) elements[id] = makeElement(id);
    return elements[id];
}
elements.canvasArea = makeElement('canvasArea');

const documentListeners = {};
let frameCallbacks = [];

globalThis.document = {
    getElementById: byId,
    createElement: () => makeElement('created'),
    addEventListener: (type, handler) => { (documentListeners[type] ||= []).push(handler); },
    querySelector: () => makeElement('q'),
    // The theme is applied by setting an attribute on the body.
    body: makeElement('body')
};
const windowListeners = {};
globalThis.window = {
    addEventListener(type, handler) { (windowListeners[type] ||= []).push(handler); },
    fire(type, event = {}) { (windowListeners[type] || []).forEach(handler => handler(event)); }
};
// Nowhere to remember the chosen theme, which is one of the cases themes.js has
// to cope with - a page opened straight off disk gets the same treatment.
globalThis.localStorage = {
    getItem() { throw new Error('localStorage is not available'); },
    setItem() { throw new Error('localStorage is not available'); }
};
globalThis.performance = { now: () => Date.now() };
globalThis.requestAnimationFrame = cb => { frameCallbacks.push(cb); return frameCallbacks.length; };
globalThis.fetch = async url => {
    const name = String(url).replace('./', '');
    const text = await readFile(root + name, 'utf8');
    return { json: async () => JSON.parse(text), text: async () => text };
};

function runFrames(count) {
    for (let f = 0; f < count; f++) {
        const due = frameCallbacks;
        frameCallbacks = [];
        due.forEach(cb => cb(performance.now()));
    }
}

// ---------------------------------------------------------------------- run it

console.log('\nBrowser smoke test');

await import('../ui.js');

const ready = documentListeners['DOMContentLoaded'] || [];
if (ready.length === 0) fail('ui.js never registered a DOMContentLoaded handler');
for (const handler of ready) await handler();
pass('page start-up ran without throwing');

const indexMarkup = await readFile(root + 'index.html', 'utf8');
if (!indexMarkup.includes('id="returnToMenu"')) pass('the simulator toolbar no longer has a Menu button');
else fail('the Menu button is still present');
if (indexMarkup.includes('toolbar-line-secondary') && indexMarkup.includes('class="grabber-icon"')) {
    pass('the lower toolbar uses a claw icon for Grabber mode');
} else {
    fail('the Grabber claw is missing from the lower toolbar');
}

const panel = byId('particleButtons');
const materialButtons = panel.querySelectorAll('.particle-button');
const headings = panel.children.filter(child => child.className === 'panel-heading');
// One button per entry in particles.json, whatever that number happens to be.
const expectedButtons = Object.keys(
    JSON.parse(await readFile(root + 'particles.json', 'utf8')).particles
).length;
if (materialButtons.length === expectedButtons) {
    pass(`built ${materialButtons.length} material buttons from particles.json`);
} else {
    fail(`expected ${expectedButtons} material buttons, got ${materialButtons.length}`);
}
if (headings.length >= 4) pass(`grouped them under ${headings.length} headings`);
else fail(`expected the materials to be grouped, got ${headings.length} headings`);

byId('newGame').click();
pass('New Game started without throwing');

const startedCanvas = byId('canvas');
const canvasShare = parseInt(startedCanvas.style.width) / (elements.canvasArea.clientWidth - 32);
if (startedCanvas.width > 200) pass(`expanded the world to ${startedCanvas.width} columns`);
else fail(`expected more than 200 columns, got ${startedCanvas.width}`);
if (canvasShare >= 0.89 && canvasShare <= 0.9) {
    pass(`canvas fills ${(canvasShare * 100).toFixed(1)}% of the workspace width`);
} else {
    fail(`canvas fills ${(canvasShare * 100).toFixed(1)}% instead of 90%`);
}

runFrames(30);
if (putCount > 0) pass(`drew ${putCount} frames to the canvas`);
else fail('nothing was ever drawn to the canvas');

// Pick a material, then paint with the mouse.
materialButtons[1].fire('click', {});
const canvas = byId('canvas');
canvas.fire('mousedown', { button: 0, clientX: 400, clientY: 100 });
canvas.fire('mousemove', { button: 0, clientX: 420, clientY: 120 });
runFrames(20);

const { getWorld } = await import('../physics.js');
let painted = 0;
const type = getWorld().type;
for (let i = 0; i < type.length; i++) if (type[i] !== 0) painted++;
if (painted > 0) pass(`painting with the mouse put ${painted} particles into the world`);
else fail('clicking the canvas did not paint anything');

// The wind is a tool, not a material: dragging it must not leave Wind behind.
const { getDefinitions } = await import('../physics.js');
const windId = getDefinitions().findIndex(d => d && d.tool === 'wind');
const windButton = materialButtons.find(b => parseInt(b.dataset.particleId) === windId);
if (windButton) {
    windButton.fire('click', {});
    canvas.fire('mousedown', { button: 0, clientX: 300, clientY: 300 });
    canvas.fire('mousemove', { button: 0, clientX: 380, clientY: 300 });
    canvas.fire('mousemove', { button: 0, clientX: 300, clientY: 300 });
    runFrames(10);
    const worldType = (await import('../physics.js')).getWorld().type;
    let windPlaced = 0;
    for (let i = 0; i < worldType.length; i++) if (worldType[i] === windId) windPlaced++;
    if (windPlaced === 0) pass('dragging the wind tool blows without leaving anything behind');
    else fail(`the wind tool put ${windPlaced} cells of itself into the world`);
} else {
    fail('no wind tool button was built');
}
window.fire('mouseup', { button: 0 });

// Every toolbar control should be clickable without blowing up.
for (const id of ['pauseButton', 'clearButton', 'heatViewButton', 'eraserButton']) {
    byId(id).click();
    byId(id).click();
}
runFrames(5);
pass('pause, clear, heat view and eraser all work');

byId('brushSize').value = '9';
byId('brushSize').fire('input', { target: { value: '9' } });
pass('the brush size slider works');

// Grabber: only the material directly under the pointer moves, even when a
// different material is inside the same square.
const physicsForGrab = await import('../physics.js');
const defsForGrab = physicsForGrab.getDefinitions();
const stoneId = defsForGrab.findIndex(d => d && d.name === 'Stone');
const glassId = defsForGrab.findIndex(d => d && d.name === 'Glass');
physicsForGrab.clearWorld();
physicsForGrab.setCell(50, 50, stoneId);
physicsForGrab.setCell(52, 51, stoneId);
physicsForGrab.setCell(49, 50, glassId);
byId('grabberSize').fire('input', { target: { value: '9' } });
byId('grabberButton').click();
const toClient = (x, y) => ({
    clientX: ((x + 0.5) / startedCanvas.width) * 800,
    clientY: ((y + 0.5) / startedCanvas.height) * 600
});
canvas.fire('mousemove', toClient(50, 50));
runFrames(1);
if (strokeCount > 0) pass('grabber mode draws its square around the pointer');
else fail('grabber mode did not draw an outline');
canvas.fire('mousedown', { button: 0, ...toClient(50, 50) });
canvas.fire('mousemove', { button: 0, ...toClient(80, 70) });
runFrames(1);
const previewOffset = physicsForGrab.index(80, 70) * 4;
const previewVisible = physicsForGrab.getWorld().type[physicsForGrab.index(80, 70)] === 0 &&
    lastImageData && lastImageData.data[previewOffset] > 40;
if (previewVisible) pass('held pixels are previewed at their prospective drop position');
else fail('held pixels were invisible while the mouse was down');
window.fire('mouseup', { button: 0 });
const grabbedWorld = physicsForGrab.getWorld().type;
const movedOnlyStone = grabbedWorld[physicsForGrab.index(80, 70)] === stoneId &&
    grabbedWorld[physicsForGrab.index(82, 71)] === stoneId &&
    grabbedWorld[physicsForGrab.index(49, 50)] === glassId &&
    grabbedWorld[physicsForGrab.index(50, 50)] === 0;
if (movedOnlyStone) pass('grabber moved only the selected material type');
else fail('grabber moved the wrong cells or failed to drop them');
canvas.fire('mousedown', { button: 2, ...toClient(80, 70) });
if (!byId('grabberButton').classList.contains('active-toggle')) {
    pass('right click exits grabber mode');
} else {
    fail('right click left grabber mode active');
}
byId('grabberSize').fire('input', { target: { value: '60' } });
const { getGrabberSize } = await import('../constantsAndGlobalVars.js');
if (getGrabberSize() === 60 && byId('grabberSizeLabel').textContent === 'Grab 60') {
    pass('grabber size reaches the full 60-pixel square');
} else {
    fail(`grabber size stopped at ${getGrabberSize()}`);
}
byId('grabberButton').click();
byId('grabberButton').click();
if (!byId('grabberButton').classList.contains('active-toggle')) {
    pass('pressing the Grabber button again exits the mode');
} else {
    fail('the Grabber button could not exit its own mode');
}

const { airTintForTemperature } = await import('../game.js');
const coldTint = airTintForTemperature(-60);
const mildTint = airTintForTemperature(20);
const hotTint = airTintForTemperature(600);
if (coldTint[2] > coldTint[0] && hotTint[0] > hotTint[2] && mildTint.every(v => v <= 2)) {
    pass('air tint is blue when cold, subtle when mild and orange-red when hot');
} else {
    fail(`unexpected air tints: cold ${coldTint}, mild ${mildTint}, hot ${hotTint}`);
}

const { getAmbientTarget } = await import('../physics.js');
const airSlider = byId('airTemp');
const airBox = byId('airTempValue');

// Sliding should fill in the box.
airSlider.fire('input', { target: { value: '-40' } });
if (getAmbientTarget() === -40) pass('the air temperature slider sets the temperature');
else fail(`air temperature slider did nothing (target is ${getAmbientTarget()})`);
if (airBox.value === '-40') pass('sliding fills in the number box');
else fail(`number box did not follow the slider (shows ${airBox.value})`);

// Typing a number and pressing Enter should move the slider.
airBox.value = '137';
airBox.fire('keydown', { key: 'Enter' });
if (getAmbientTarget() === 137) pass('typing a temperature and pressing Enter sets it');
else fail(`Enter in the number box did nothing (target is ${getAmbientTarget()})`);
if (airSlider.value === '137') pass('typing moves the slider');
else fail(`slider did not follow the number box (shows ${airSlider.value})`);

// Out of range typing should be pulled back into range, not accepted.
airBox.value = '9999';
airBox.fire('keydown', { key: 'Enter' });
if (getAmbientTarget() === 600) pass('a silly number is clamped to the top of the range');
else fail(`out of range value was not clamped (target is ${getAmbientTarget()})`);

airBox.value = '20';
airBox.fire('keydown', { key: 'Enter' });

// The breeze checkbox.
const { getAmbientWindOn, getAirLayersOn, getAirTempAt } = await import('../physics.js');
const breezeBox = byId('ambientWind');
breezeBox.checked = true;
breezeBox.fire('change');
if (getAmbientWindOn()) pass('the breeze checkbox turns the natural wind on');
else fail('the breeze checkbox did nothing');
breezeBox.checked = false;
breezeBox.fire('change');
if (!getAmbientWindOn()) pass('and turns it off again');
else fail('the breeze could not be turned off');

// The air layers checkbox, which also greys out the slider beside it.
const layersBox = byId('airLayers');
const lapseSlider = byId('layerLapse');
lapseSlider.fire('input', { target: { value: '6' } });
layersBox.checked = false;
layersBox.fire('change');
if (!getAirLayersOn() && getAirTempAt(0) === getAirTempAt(149)) {
    pass('unchecking air layers makes the air one even temperature');
} else {
    fail(`air is still layered (${getAirTempAt(0)} at the top, ${getAirTempAt(149)} at the bottom)`);
}
if (lapseSlider.disabled) pass('and greys the layers slider out');
else fail('the layers slider was left live with layering switched off');
layersBox.checked = true;
layersBox.fire('change');
if (getAirLayersOn() && !lapseSlider.disabled) pass('and checking it puts both back');
else fail('air layers could not be switched back on');

// The theme controls, built from the list in themes.js.
const { THEMES, getTheme } = await import('../themes.js');
const swatches = byId('themeSwatches').querySelectorAll('.theme-swatch');
if (swatches.length === THEMES.length) pass(`built ${swatches.length} theme swatches`);
else fail(`expected ${THEMES.length} theme swatches, built ${swatches.length}`);

const otherTheme = THEMES.find(t => t.id !== getTheme());
swatches.find(s => s.dataset.themeId === otherTheme.id).click();
if (getTheme() === otherTheme.id && document.body.dataset.theme === otherTheme.id) {
    pass(`picking a swatch switched the page to ${otherTheme.id}`);
} else {
    fail(`swatch did not switch the theme (page is on ${document.body.dataset.theme})`);
}

const themeSelect = byId('themeSelect');
if (themeSelect.value === otherTheme.id) pass('and the toolbar dropdown followed it');
else fail(`the dropdown still shows ${themeSelect.value}`);

themeSelect.value = THEMES[0].id;
themeSelect.fire('change');
if (getTheme() === THEMES[0].id) pass('and the dropdown switches it back');
else fail(`the dropdown did nothing (theme is ${getTheme()})`);

runFrames(5);
pass('the simulation keeps running without the old Menu control');

console.log(failures === 0 ? '\nSmoke test passed\n' : `\n${failures} smoke test failures\n`);
process.exit(failures > 0 ? 1 : 0);
