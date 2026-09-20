// ui.js
// -----------------------------------------------------------------------------
// Buttons, the particle picker and mouse handling.
//
// The particle buttons are built from particles.json at startup, so adding a new
// particle to that file is all it takes to get a button for it.
// -----------------------------------------------------------------------------

import {
    setParticleTypeIdSelected, getParticleTypeIdSelected, getGameVisibleActive,
    getGridCols, setGridCols, getGridRows, setGridRows, setElements, getElements,
    setBeginGameStatus, getGameInProgress, setGameInProgress, getMenuState,
    getBrushSize, setBrushSize, getDrawMode, setDrawMode, getEraserOn, setEraserOn,
    getHeatViewOn, setHeatViewOn, getSimulationPaused, setSimulationPaused,
    getWindStrength, setWindStrength, getGrabberSize, setGrabberSize,
    getGrabberOn, setGrabberOn
} from './constantsAndGlobalVars.js';
import {
    loadParticleDefinitions, initializeWorld, setGameState, startGame,
    paintLine, paintCell, clearCanvasWorld, setHoverCell,
    canPlaceMachine, placeMachine, setMachinePlacementPreview, clearMachinePlacementPreview,
    beginGrab, dropGrab, cancelGrab, setLinePreview, clearLinePreview,
    captureBlueprint, stampBlueprint, BLUEPRINT_SLOT_COUNT
} from './game.js';
import {
    getDefinitions, setAmbientTarget, getAmbientTarget, setLayerLapse, getLayerLapse,
    setAmbientWindOn, getAmbientWindOn, setAirLayersOn, getAirLayersOn,
    setWindDial
} from './physics.js';
import { loadSavedTheme, buildThemeSwatches, buildThemeSelect } from './themes.js';
import {
    hasAutosave, createSaveString, parseSaveString, restoreSavePayload, restoreAutosave,
    stopAutosave, replaceAutosaveWithCurrentGame, setSavingListener, setBlueprintSaveHandlers,
    writeAutosave
} from './saveLoadGame.js';

let isPainting = false;
let isGrabbing = false;
let lastCell = null;
let paintTimer = null;
let currentCell = { x: 0, y: 0 };
let lineStart = null;
let machinePlacement = null;
let autosaveChoiceResolver = null;
let marqueeMode = false;
let isMarqueeDrawing = false;
let marqueeStart = null;
let marqueeSelection = null;
let blueprints = Array(BLUEPRINT_SLOT_COUNT).fill(null);
let nextBlueprintSlot = 0;
let activeBlueprintSlot = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadParticleDefinitions();
    initializeWorld();
    setElements();
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
    elements.resumeGameButton.addEventListener('click', () => { void resumeGame(); });
    elements.importGameMenuButton.addEventListener('click', openImportDialog);
    elements.exportGameButton.addEventListener('click', openExportDialog);
    elements.importGameButton.addEventListener('click', openImportDialog);
    setUpSaveDialogs();
    elements.clearDialogConfirm.addEventListener('click', confirmClearWorld);
    elements.clearDialogCancel.addEventListener('click', closeClearDialog);
    setSavingListener(saving => { elements.autosaveStatus.hidden = !saving; });
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

    elements.clearButton.addEventListener('click', () => {
        openClearDialog();
    });

    elements.heatViewButton.addEventListener('click', () => {
        setHeatViewOn(!getHeatViewOn());
        elements.heatViewButton.classList.toggle('active-toggle', getHeatViewOn());
        elements.heatViewButton.setAttribute('aria-pressed', String(getHeatViewOn()));
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
    setUpAirLayers();
    setUpWindStrength();
    setUpAmbientWind();
    setUpTooltips();
    setUpCanvasInput();
    setUpKeyboardShortcuts();
});

// ---------------------------------------------------------------- save/load

async function startNewGame() {
    const replacingExisting = hasAutosave();
    const useAsResumeGame = replacingExisting
        ? await askToReplaceResume('Starting a new game will replace the saved resume game on this device.')
        : true;

    if (useAsResumeGame === null) return;
    if (replacingExisting && !useAsResumeGame) stopAutosave();
    resetBlueprintLibrary();
    setBeginGameStatus(true);
    if (!getGameInProgress()) setGameInProgress(true);
    setGameState(getGameVisibleActive());
    startGame();

    if (useAsResumeGame) {
        try { await replaceAutosaveWithCurrentGame(); updateResumeButton(); }
        catch { /* The simulation remains playable when storage is blocked. */ }
    }
}

async function resumeGame() {
    try {
        const payload = await restoreAutosave();
        beginLoadedGame(payload);
    } catch (error) {
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
    startGame({ preserveWorldSize: true });
}

function synchroniseRestoredControls() {
    const elements = getElements();
    elements.pauseButton.textContent = getSimulationPaused() ? 'Play' : 'Pause';
    elements.eraserButton.classList.toggle('active-toggle', getEraserOn());
    elements.grabberButton.classList.toggle('active-toggle', getGrabberOn());
    elements.grabberButton.setAttribute('aria-pressed', String(getGrabberOn()));
    elements.heatViewButton.classList.toggle('active-toggle', getHeatViewOn());
    elements.heatViewButton.setAttribute('aria-pressed', String(getHeatViewOn()));
    elements.brushSizeInput.value = String(getBrushSize());
    elements.brushSizeValue.textContent = String(getBrushSize());
    elements.grabberSizeInput.value = String(getGrabberSize());
    elements.grabberSizeValue.textContent = String(getGrabberSize());
    elements.airTempInput.value = String(Math.round(getAmbientTarget()));
    elements.airTempValue.value = String(Math.round(getAmbientTarget()));
    elements.layerLapseInput.value = String(getLayerLapse());
    elements.layerLapseValue.textContent = getLayerLapse().toFixed(1);
    elements.airLayersCheckbox.checked = getAirLayersOn();
    elements.layerLapseInput.disabled = !getAirLayersOn();
    elements.layerLapseInput.classList.toggle('disabled-control', !getAirLayersOn());
    elements.layerLapseLabel.classList.toggle('disabled-control', !getAirLayersOn());
    elements.windStrengthInput.value = String(getWindStrength());
    elements.windStrengthValue.textContent = String(getWindStrength());
    elements.ambientWindCheckbox.checked = getAmbientWindOn();
    setWindDial(getWindStrength());
    const brushOn = getDrawMode() === 'brush';
    elements.brushModeButton.classList.toggle('active-toggle', brushOn);
    elements.lineModeButton.classList.toggle('active-toggle', !brushOn);
    elements.brushModeButton.setAttribute('aria-pressed', String(brushOn));
    elements.lineModeButton.setAttribute('aria-pressed', String(!brushOn));
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

function openExportDialog() {
    const elements = getElements();
    try {
        elements.saveDialogTitle.textContent = 'Export Game';
        elements.saveDialogDescription.textContent = 'Copy this LZString save to keep or share a portable snapshot of this world.';
        elements.saveString.value = createSaveString();
        elements.saveString.readOnly = true;
        elements.copySaveString.classList.remove('d-none');
        elements.loadSaveString.classList.add('d-none');
        clearSaveError();
        elements.saveDialog.hidden = false;
        elements.saveString.focus();
        elements.saveString.select();
    } catch (error) { showSaveError(error.message || 'Unable to export this game.'); }
}

function openImportDialog() {
    const elements = getElements();
    elements.saveDialogTitle.textContent = 'Import Game';
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
        ? await askToReplaceResume('This imported game will replace the saved resume game on this device.')
        : true;

    // Cancel leaves both the current session and its existing autosave alone.
    // The import dialog remains open so the pasted save can be reconsidered.
    if (useAsResumeGame === null) return;

    restoreSavePayload(payload);
    beginLoadedGame(payload);
    closeSaveDialog();
    if (useAsResumeGame) {
        try { await replaceAutosaveWithCurrentGame(); updateResumeButton(); }
        catch { /* The imported game is still loaded even if storage is unavailable. */ }
    } else stopAutosave();
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

    const order = ['Powders', 'Liquids', 'Gases', 'Solids', 'Metals', 'Machines', 'Tools', 'Other'];
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
    button.className = 'particle-button tooltip-control';
    button.textContent = def.name;
    button.style.backgroundColor = `rgb(${def.rgb[0]}, ${def.rgb[1]}, ${def.rgb[2]})`;
    button.style.color = isLightColour(def.rgb) ? '#111' : '#fff';
    button.dataset.particleId = String(id);
    button.dataset.tooltip = formatMaterialTooltip(def);

    button.addEventListener('click', () => {
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
    });

    return button;
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
    if (def.dischargeBattery) properties.push('discharges connected Aluminum');
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
    const panels = [getElements().toolsPanel, getElements().particleButtons];
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
    window.addEventListener('resize', hide);
}

function selectDrawingMode(mode) {
    const next = mode === 'line' ? 'line' : 'brush';
    cancelBlueprintModes();
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
    // The regular minute-by-minute autosave also carries blueprints, but a
    // newly captured design is important enough to save immediately when this
    // playthrough has a local resume slot.
    void writeAutosave();
}

function captureBlueprintLibrary() {
    return { slots: blueprints, nextSlot: nextBlueprintSlot };
}

function restoreBlueprintLibrary(state) {
    blueprints = Array.from({ length: BLUEPRINT_SLOT_COUNT }, (_, slot) => state.slots[slot] || null);
    nextBlueprintSlot = state.nextSlot;
    marqueeMode = false;
    isMarqueeDrawing = false;
    marqueeStart = null;
    marqueeSelection = null;
    activeBlueprintSlot = null;
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

function setUpCanvasInput() {
    const canvas = getElements().canvas;

    canvas.addEventListener('contextmenu', event => event.preventDefault());

    canvas.addEventListener('mousedown', event => {
        currentCell = cellFromEvent(event);
        setHoverCell(currentCell.x, currentCell.y);

        // Blueprint modes have first claim on a click. A right click always
        // exits them, without performing the normal temporary eraser action.
        if (event.button === 2 && hasBlueprintMode()) {
            cancelBlueprintModes();
            return;
        }
        if (event.button === 0 && activeBlueprintSlot !== null) {
            updateStampPreview(currentCell);
            stampBlueprint(blueprints[activeBlueprintSlot], currentCell.x, currentCell.y);
            return;
        }
        if (marqueeMode) {
            if (event.button === 0) beginMarqueeAt(currentCell);
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
        // Right button erases without having to switch tool.
        if (event.button === 2) setEraserOn(true);
        lastCell = null;
        const machine = selectedMachine();
        if (event.button === 0 && machine) {
            machinePlacement = canPlaceMachine(currentCell.x, currentCell.y, machine)
                ? { x: currentCell.x, y: currentCell.y, machine, direction: 0 }
                : null;
            isPainting = !!machinePlacement;
            if (machinePlacement) setMachinePlacementPreview(
                machinePlacement.x, machinePlacement.y, machinePlacement.machine, 0);
            return;
        }
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
        if (activeBlueprintSlot !== null) updateStampPreview(currentCell);
        if (isMarqueeDrawing) {
            updateMarqueeAt(currentCell);
            return;
        }
        if (isGrabbing) return;
        if (!isPainting) return;
        if (machinePlacement || selectedMachine()) {
            if (machinePlacement) {
                machinePlacement.direction = fanDirection(
                    currentCell.x - machinePlacement.x, currentCell.y - machinePlacement.y);
                setMachinePlacementPreview(machinePlacement.x, machinePlacement.y,
                    machinePlacement.machine, machinePlacement.direction);
            }
            return;
        }
        if (getDrawMode() === 'line' && lineStart) {
            setLinePreview(lineStart.x, lineStart.y, currentCell.x, currentCell.y);
        } else {
            paintAtCurrentCell();
        }
    });

    window.addEventListener('mouseup', event => {
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
        hideStampPreview();
    });

    // Touch support, so it works on a tablet as well.
    canvas.addEventListener('touchstart', event => {
        event.preventDefault();
        currentCell = cellFromEvent(event.touches[0]);
        setHoverCell(currentCell.x, currentCell.y);
        if (activeBlueprintSlot !== null) {
            stampBlueprint(blueprints[activeBlueprintSlot], currentCell.x, currentCell.y);
            return;
        }
        if (marqueeMode) {
            beginMarqueeAt(currentCell);
            return;
        }
        if (getGrabberOn()) {
            isGrabbing = beginGrab(currentCell.x, currentCell.y, getGrabberSize()) > 0;
            return;
        }
        isPainting = true;
        lastCell = null;
        const machine = selectedMachine();
        if (machine) {
            machinePlacement = canPlaceMachine(currentCell.x, currentCell.y, machine)
                ? { x: currentCell.x, y: currentCell.y, machine, direction: 0 }
                : null;
            isPainting = !!machinePlacement;
            if (machinePlacement) setMachinePlacementPreview(
                machinePlacement.x, machinePlacement.y, machinePlacement.machine, 0);
            return;
        }
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
        if (isMarqueeDrawing) {
            updateMarqueeAt(currentCell);
            return;
        }
        if (isGrabbing) return;
        if (machinePlacement || selectedMachine()) {
            if (machinePlacement) {
                machinePlacement.direction = fanDirection(
                    currentCell.x - machinePlacement.x, currentCell.y - machinePlacement.y);
                setMachinePlacementPreview(machinePlacement.x, machinePlacement.y,
                    machinePlacement.machine, machinePlacement.direction);
            }
            return;
        }
        if (getDrawMode() === 'line' && lineStart) {
            setLinePreview(lineStart.x, lineStart.y, currentCell.x, currentCell.y);
        } else {
            paintAtCurrentCell();
        }
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
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
        const placement = machinePlacement;
        machinePlacement = null;
        clearMachinePlacementPreview();
        isPainting = false;
        lastCell = null;
        stopPaintTimer();
        if (button === 0) placeMachine(placement.x, placement.y,
            placement.machine, placement.direction);
        if (button === 2) setEraserOn(false);
        return;
    }
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
    machinePlacement = null;
    clearMachinePlacementPreview();
    lineStart = null;
    lastCell = null;
    stopPaintTimer();
    clearLinePreview();
}

function selectedMachine() {
    const selected = getParticleTypeIdSelected();
    const def = getDefinitions()[selected];
    return def?.machine || null;
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
