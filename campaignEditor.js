import { getMissionDefinitions } from './campaign.js';
import { getDefinitions, getWorld, setCell } from './physics.js';
import {
    setParticleTypeIdSelected, getParticleTypeIdSelected, setDrawMode, getDrawMode,
    setBrushSize, getBrushSize, setVisualizationMode, VISUALIZATION_MODES
} from './constantsAndGlobalVars.js';
import { createSaveString, parseSaveString, restoreSavePayload } from './saveLoadGame.js';
import { renderWorld } from './game.js';

export const CAMPAIGN_EDITOR_DRAFTS_KEY = 'elemental-foundry.campaign-editor.drafts.v1';
export const CAMPAIGN_EDITOR_SOURCE_BACKUP_KEY = 'elemental-foundry.campaign-editor-source-backup.v1';
export const GENERATED_MISSIONS_BEGIN = '// BEGIN GENERATED MISSION DATA';
export const GENERATED_MISSIONS_END = '// END GENERATED MISSION DATA';

let root = null;
let draft = null;
let draftId = null;
let revision = 0;
let approvedRevision = -1;
let snapshotStale = false;
let pendingInstall = null;
let pendingRestore = null;
let suppressInputs = false;
let editorSessionStart = () => {};
let editorSessionClose = () => {};

export function initCampaignEditor({ startSession, closeSession } = {}) {
    root = document.getElementById('campaignEditorWorkspace');
    editorSessionStart = startSession || (() => {});
    editorSessionClose = closeSession || (() => {});
    if (!root) return;
    populateMaterialChoices();
    loadDraftStore();
    renderMissionList();
    bindEditorEvents();
    renderBackupStatus();
    window.addEventListener('campaign-editor-world-edited', markScenarioStale);
}

export function openCampaignEditor() {
    if (!root) return;
    editorSessionStart();
    root.hidden = false;
    renderMissionList();
    if (!draft) createBlankDraft(false);
    root.querySelector('[data-mission-field="id"]')?.focus();
}

export function markScenarioStale() {
    if (!root || root.hidden || !draft?.startingSave) return;
    snapshotStale = true;
    draft.snapshotStale = true;
    revision++;
    approvedRevision = -1;
    updateReviewAvailability();
    const status = document.getElementById('campaignEditorSnapshotStatus');
    if (status) status.textContent = 'Scenario snapshot is stale. Capture again before validation.';
    setStatus('Scenario snapshot is stale. Capture the live scene again before review.');
    persistDraftQuietly();
}

export function createCampaignSourceCandidate(source, mission, { replace = false } = {}) {
    const markers = validateMarkers(source);
    const missions = readMissionsFromSource(source);
    const conflicts = missions.filter(item => item.id === mission.id || item.number === mission.number);
    if (conflicts.length && !replace) {
        return { source: null, missions, conflicts };
    }
    const nextMissions = missions.filter(item => item.id !== mission.id && item.number !== mission.number);
    nextMissions.push(structuredClone(mission));
    nextMissions.sort((a, b) => a.number - b.number);
    const data = `\nconst MISSION_DEFINITIONS = Object.freeze(${JSON.stringify(nextMissions, null, 4)});\n`;
    const candidate = `${source.slice(0, markers.beginEnd)}${data}${source.slice(markers.endStart)}`;
    const check = readMissionsFromSource(candidate);
    if (JSON.stringify(check) !== JSON.stringify(nextMissions)) throw new Error('Generated mission data did not round-trip.');
    return { source: candidate, missions: nextMissions, conflicts };
}

export function validateCampaignMission(mission, { missions = getMissionDefinitions(), skipConflict = false } = {}) {
    const errors = [];
    const definitions = getDefinitions() || [];
    const knownMaterials = new Set(definitions.filter(definition => definition && !definition.machine && !definition.tool).map(definition => definition.name));
    const knownMachines = new Set(definitions.filter(definition => definition?.machine).map(definition => definition.machine));
    const validId = typeof mission?.id === 'string' && /^[a-z0-9][a-z0-9-]{1,63}$/i.test(mission.id.trim());
    if (!validId) errors.push('Mission ID is required and may contain letters, numbers, and hyphens.');
    if (!Number.isInteger(mission?.number) || mission.number < 1) errors.push('Mission number must be a positive integer.');
    if (!mission?.title?.trim()) errors.push('Mission title is required.');
    if (!mission?.briefing?.trim()) errors.push('Mission briefing is required.');
    const conflicts = (missions || []).filter(item => item.id === mission?.id || item.number === mission?.number);
    const world = mission?.world;
    if (!world || !Number.isInteger(world.cols) || !Number.isInteger(world.rows) ||
        world.cols < 200 || world.rows < 1 || world.cols * world.rows > 2_000_000) {
        errors.push('World dimensions are missing or outside the supported range.');
    }
    let capturedPayload = null;
    if (mission?.startingSave) {
        try {
            capturedPayload = parseSaveString(mission.startingSave);
            if (capturedPayload.mode !== 'sandbox' || capturedPayload.campaign) {
                errors.push('Captured scenarios must come from an unrestricted Sandbox session.');
            }
            if (capturedPayload.simulation.cols !== world.cols || capturedPayload.simulation.rows !== world.rows) {
                errors.push('Captured scenario dimensions do not match the mission dimensions.');
            }
        } catch { errors.push('The captured scenario is not a valid portable save.'); }
    } else if (!isSupportedLayout(mission?.startingLayout, world)) {
        errors.push('Capture a valid Sandbox scenario or choose a supported starting layout.');
    }
    const budgets = mission?.resourceBudgets?.materials;
    const machines = mission?.resourceBudgets?.machines;
    for (const [label, value] of Object.entries(budgets || {})) {
        if (!Number.isInteger(value) || value < 0) errors.push(`${label} budget must be a non-negative whole number.`);
        if (!knownMaterials.has(label)) errors.push(`${label} is not a known material.`);
    }
    for (const [label, value] of Object.entries(machines || {})) {
        if (!knownMachines.has(label)) errors.push(`${label} is not a known machine type.`);
        if (!Number.isInteger(value) || value < 0) errors.push(`${label} machine budget must be a non-negative whole number.`);
    }
    if (!Array.isArray(mission?.objectives) || mission.objectives.length === 0) errors.push('At least one objective is required.');
    const hasEnvironmentObjective = (mission?.objectives || []).some(item => item.type === 'environment-target');
    if (hasEnvironmentObjective) {
        const targets = mission?.environmentTargets;
        const targetBounds = { temperature: [-60, 4000], humidity: [0, 100], illumination: [0, 100] };
        for (const [key, [min, max]] of Object.entries(targetBounds)) {
            if (!Number.isFinite(targets?.[key]) || targets[key] < min || targets[key] > max) {
                errors.push(`Environment target ${key} must be between ${min} and ${max}.`);
            }
        }
    }
    const objectiveIds = new Set();
    for (const objective of mission?.objectives || []) {
        if (!objective.id || objectiveIds.has(objective.id)) errors.push('Objective IDs must be present and unique.');
        objectiveIds.add(objective.id);
        if (objective.type === 'transformation' && (!knownMaterials.has(objective.from) || !knownMaterials.has(objective.to) || objective.from === objective.to)) {
            errors.push(`Objective “${objective.label || objective.id}” must use a supported material transition.`);
        } else if (objective.type !== 'transformation' && objective.type !== 'environment-target') {
            errors.push(`Objective “${objective.label || objective.id}” has an unsupported condition.`);
        } else if (objective.type === 'environment-target' && !hasEnvironmentObjective) {
            errors.push(`Objective “${objective.label || objective.id}” needs environment target values.`);
        }
        if (!Number.isInteger(objective.target) || objective.target < 1) errors.push(`Objective “${objective.label || objective.id}” needs a positive whole-number target.`);
        if (!objective.label?.trim()) errors.push(`Objective “${objective.id}” needs a player-facing label.`);
    }
    const eventIds = new Set();
    for (const event of mission?.events || []) {
        if (!event.id || eventIds.has(event.id)) errors.push('Event IDs must be present and unique.');
        eventIds.add(event.id);
        if (event.when?.type !== 'objective-complete' || !objectiveIds.has(event.when.objectiveId)) {
            errors.push(`Event “${event.id || 'unnamed'}” must reference a defined objective completion.`);
        }
        if (!event.message?.trim()) errors.push(`Event “${event.id}” needs a message.`);
    }
    const environmentBounds = { temperature: [-60, 4000], humidity: [0, 100], illumination: [0, 100], dewpoint: [-60, 100], windStrength: [0, 50], gustWindStrength: [0, 50] };
    for (const [key, [min, max]] of Object.entries(environmentBounds)) {
        const value = mission?.environment?.[key];
        if (!Number.isFinite(value) || value < min || value > max) errors.push(`Environment value ${key} must be between ${min} and ${max}.`);
    }
    if (typeof mission?.environment?.ambientWindOn !== 'boolean') errors.push('Ambient wind setting is required.');
    if (!Array.isArray(mission?.lockedControls)) errors.push('Locked climate controls must be listed.');
    if (!mission?.startSelection || !knownMaterials.has(mission.startSelection.material) ||
        !['brush', 'line', 'rectangle', 'ellipse'].includes(mission.startSelection.drawMode)) {
        errors.push('Initial material and drawing mode must be valid.');
    }
    if (!Array.isArray(mission?.visualizationModes) || mission.visualizationModes.length === 0 ||
        mission.visualizationModes.some(mode => !VISUALIZATION_MODES.includes(mode))) errors.push('Choose valid visualization modes.');
    if ((mission.id === 'first-daffodil' || mission.number === 1) &&
        (mission.resourceBudgets?.materials?.Water !== 1000 || mission.resourceBudgets?.materials?.['Dry Mud'] !== 100 ||
            mission.resourceBudgets?.materials?.['Daffodil Seeds'] !== 1 || Object.keys(budgets || {}).length !== 3 ||
            !['Water', 'Dry Mud', 'Daffodil Seeds'].every(name => Object.hasOwn(budgets || {}, name)) ||
            Object.keys(machines || {}).length > 0)) {
        errors.push('Mission 1 must have 1,000 Water, 100 Dry Mud, one Daffodil Seed, and no machine allotment.');
    }
    if (mission.id === 'first-daffodil' || mission.number === 1) {
        const ideal = { temperature: 14, humidity: 68, illumination: 65, dewpoint: 10, ambientWindOn: false, windStrength: 0, gustWindStrength: 0 };
        if (Object.entries(ideal).some(([key, value]) => mission.environment?.[key] !== value)) {
            errors.push('Mission 1 climate must stay at the Daffodil ideal profile: 14 °C, 68% humidity, 65% light, 10 °C dewpoint, and calm wind.');
        }
        const flower = mission.objectives?.some(item => item.from === 'Daffodil Seeds' && item.to === 'Daffodil' && item.target === 1);
        if (!flower) errors.push('Mission 1 must count one Daffodil Seeds-to-Daffodil germination.');
        if (!mission.lockedControls?.includes('temperature') || !mission.lockedControls?.includes('humidity') ||
            !mission.lockedControls?.includes('illumination') || !mission.lockedControls?.includes('dewpoint') ||
            !mission.lockedControls?.includes('wind')) errors.push('Mission 1 must lock its climate and wind controls.');
        if (mission.startSelection?.material !== 'Water' || mission.startSelection?.drawMode !== 'brush') errors.push('Mission 1 must start with Water selected in Brush mode.');
        if (!mission.startingSave && mission.startingLayout?.material !== 'Sand') errors.push('Mission 1 needs a full-width Sand starting floor.');
        if (capturedPayload && !capturedSaveHasSandFloor(capturedPayload, world.cols)) errors.push('Mission 1 captured scenario needs Sand across every floor column.');
    }
    return { valid: errors.length === 0, errors, conflicts };
}

function bindEditorEvents() {
    const byId = id => document.getElementById(id);
    byId('openCampaignEditor')?.addEventListener('click', openCampaignEditor);
    byId('campaignEditorClose')?.addEventListener('click', () => {
        root.hidden = true;
        editorSessionClose();
    });
    byId('campaignEditorNewBlank')?.addEventListener('click', () => createBlankDraft(true));
    byId('campaignEditorLoadMission')?.addEventListener('click', () => { void loadSelectedMission(); });
    byId('campaignEditorSaveDraft')?.addEventListener('click', saveCurrentDraft);
    byId('campaignEditorCaptureScenario')?.addEventListener('click', captureScenario);
    byId('campaignEditorApplyDimensions')?.addEventListener('click', applyEditorDimensions);
    byId('campaignEditorAddMaterialBudget')?.addEventListener('click', () => addBudgetRow('material'));
    byId('campaignEditorAddMachineBudget')?.addEventListener('click', () => addBudgetRow('machine'));
    byId('campaignEditorAddObjective')?.addEventListener('click', addObjectiveRow);
    byId('campaignEditorAddEvent')?.addEventListener('click', addEventRow);
    byId('campaignEditorValidate')?.addEventListener('click', validateAndReview);
    byId('campaignEditorApproveReview')?.addEventListener('click', approveReview);
    byId('campaignEditorCancelReview')?.addEventListener('click', () => {
        document.getElementById('campaignEditorReviewDialog').hidden = true;
        approvedRevision = -1;
        setStatus('Review cancelled. campaign.js is unchanged.');
        updateReviewAvailability();
    });
    byId('campaignEditorInstall')?.addEventListener('click', () => { void beginInstall(); });
    byId('campaignEditorConfirmReplace')?.addEventListener('click', () => { void completePendingInstall(); });
    byId('campaignEditorCancelReplace')?.addEventListener('click', cancelPendingInstall);
    byId('campaignEditorDownloadBackup')?.addEventListener('click', downloadBackup);
    byId('campaignEditorRestoreBackup')?.addEventListener('click', () => { void chooseBackupRestore(); });
    byId('campaignEditorConfirmRestoreButton')?.addEventListener('click', () => { void restoreBackup(); });
    byId('campaignEditorCancelRestore')?.addEventListener('click', () => { byId('campaignEditorConfirmRestore').hidden = true; pendingRestore = null; });
    root.addEventListener('input', event => {
        if (event.target.id !== 'campaignMissionList' && event.target.matches('input, textarea, select')) {
            handleDraftInput(event);
        }
    });
    root.addEventListener('change', event => {
        if (event.target.id !== 'campaignMissionList' && event.target.matches('input, textarea, select')) {
            handleDraftInput(event);
        }
    });
    root.addEventListener('click', event => {
        const removeObjective = event.target.closest('[data-remove-objective]');
        const removeEvent = event.target.closest('[data-remove-event]');
        const removeBudget = event.target.closest('[data-remove-budget]');
        if (removeObjective) { removeObjective.closest('[data-objective-row]')?.remove(); renumberRows('objective'); syncEventObjectiveChoices(); handleDraftInput(); }
        if (removeEvent) { removeEvent.closest('[data-event-row]')?.remove(); renumberRows('event'); handleDraftInput(); }
        if (removeBudget) { removeBudget.closest('[data-budget-row]')?.remove(); handleDraftInput(); }
    });
    const canvas = document.getElementById('canvasArea');
    let canvasGesture = false;
    canvas?.addEventListener('pointerdown', () => { canvasGesture = !root.hidden; });
    canvas?.addEventListener('pointerup', () => {
        if (canvasGesture) window.dispatchEvent(new Event('campaign-editor-world-edited'));
        canvasGesture = false;
    });
    canvas?.addEventListener('pointercancel', () => { canvasGesture = false; });
}

function populateMaterialChoices() {
    const names = getDefinitions().filter(definition => definition && !definition.machine && !definition.tool).map(definition => definition.name);
    for (const id of ['campaignObjectiveFrom', 'campaignObjectiveTo']) {
        const select = document.getElementById(id);
        select.replaceChildren(...names.map(name => new Option(name, name)));
    }
    const select = root.querySelector('[data-mission-field="startMaterial"]');
    select.replaceChildren(...names.map(name => new Option(name, name)));
    const firstFrom = root.querySelector('[data-objective-from]');
    const firstTo = root.querySelector('[data-objective-to]');
    firstFrom.replaceChildren(...names.map(name => new Option(name, name)));
    firstTo.replaceChildren(...names.map(name => new Option(name, name)));
    const machines = [...new Set(getDefinitions().filter(definition => definition?.machine).map(definition => definition.machine))];
    const machineNames = new Map(getDefinitions().filter(definition => definition?.machine).map(definition => [definition.machine, definition.name]));
    root.dataset.machineNames = JSON.stringify(Object.fromEntries(machineNames));
    root.dataset.machineValues = JSON.stringify(machines);
}

function createBlankDraft(resetWorld) {
    const missions = [...getMissionDefinitions(), ...readDraftStore().drafts];
    let number = 1;
    const used = new Set(missions.map(item => item.number));
    while (used.has(number)) number++;
    const world = getWorld();
    draft = {
        id: `mission-${number}`, number, title: `New Mission ${number}`, briefing: '',
        world: { cols: world.cols, rows: world.rows }, resourceBudgets: { materials: { Water: 0, 'Dry Mud': 0, 'Daffodil Seeds': 0 }, machines: {} },
        environment: { temperature: 14, humidity: 68, illumination: 65, dewpoint: 10, ambientWindOn: false, windStrength: 0, gustWindStrength: 0 },
        lockedControls: [], startSelection: { material: 'Water', drawMode: 'brush' }, visualizationModes: [...VISUALIZATION_MODES],
        unlockedTools: ['brush', 'line', 'rectangle', 'ellipse', 'grabber', 'eraser'],
        objectives: [{ id: 'objective-1', type: 'transformation', from: 'Daffodil Seeds', to: 'Daffodil', target: 1, label: '' }],
        events: [{ id: 'event-1', when: { type: 'objective-complete', objectiveId: 'objective-1' }, message: '' }],
        startingLayout: null, startingSave: null
    };
    draftId = `draft:${draft.id}`;
    revision++;
    approvedRevision = -1;
    snapshotStale = !!draft.snapshotStale;
    fillForm(draft);
    if (resetWorld) editorSessionStart({ clear: true, cols: draft.world.cols, rows: draft.world.rows });
    setValidation('');
    setStatus(`Blank draft created. Suggested mission number: ${number}.`);
    renderMissionList(draftId);
    updateReviewAvailability();
}

function fillBudgetRows(budgets) {
    const materialHost = document.getElementById('campaignEditorMaterialBudgets');
    const machineHost = document.getElementById('campaignEditorMachineBudgets');
    materialHost.replaceChildren();
    machineHost.replaceChildren();
    const materialEntries = Object.entries(budgets.materials || {});
    const machineEntries = Object.entries(budgets.machines || {});
    if (!materialEntries.length) addBudgetRow('material');
    else materialEntries.forEach(([name, amount]) => addBudgetRow('material', name, amount));
    if (!machineEntries.length) addBudgetRow('machine');
    else machineEntries.forEach(([name, amount]) => addBudgetRow('machine', name, amount));
}

function addBudgetRow(kind, selectedName = '', amount = '') {
    const machine = kind === 'machine';
    const host = document.getElementById(machine ? 'campaignEditorMachineBudgets' : 'campaignEditorMaterialBudgets');
    const row = document.createElement('div');
    row.className = 'campaign-editor-budget-row';
    row.dataset.budgetRow = kind;
    const label = document.createElement('label');
    label.textContent = machine ? 'Machine' : 'Material';
    const select = document.createElement('select');
    select.className = 'select-input';
    select.dataset.budgetName = '';
    const options = machine
        ? JSON.parse(root.dataset.machineValues || '[]').map(value => new Option(JSON.parse(root.dataset.machineNames || '{}')[value] || value, value))
        : getDefinitions().filter(definition => definition && !definition.machine && !definition.tool).map(definition => new Option(definition.name, definition.name));
    select.replaceChildren(new Option(machine ? 'Choose machine…' : 'Choose material…', ''), ...options);
    select.value = selectedName;
    label.appendChild(select);
    const amountLabel = document.createElement('label');
    amountLabel.textContent = 'Limit';
    const input = document.createElement('input');
    input.type = 'number'; input.min = '0'; input.step = '1'; input.value = amount === '' ? '' : String(amount);
    input.dataset.budgetValue = '';
    amountLabel.appendChild(input);
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'btn btn-ghost campaign-editor-remove';
    remove.dataset.removeBudget = ''; remove.textContent = 'Remove';
    row.append(label, amountLabel, remove);
    host.appendChild(row);
}

function fillObjectiveRows(objectives) {
    const host = document.getElementById('campaignEditorObjectives');
    const first = host.querySelector('[data-objective-row]');
    host.replaceChildren(first);
    const items = objectives.length ? objectives : [{}];
    items.forEach((objective, index) => {
        const row = index === 0 ? first : cloneObjectiveRow(first);
        if (index > 0) host.appendChild(row);
        row.dataset.objectiveId = objective.id || `objective-${index + 1}`;
        row.querySelector('[data-objective-label]').value = objective.label || '';
        row.querySelector('[data-objective-type]').value = objective.type || 'transformation';
        row.querySelector('[data-objective-from]').value = objective.from || 'Daffodil Seeds';
        row.querySelector('[data-objective-to]').value = objective.to || 'Daffodil';
        row.querySelector('[data-objective-target]').value = String(objective.target ?? 1);
    });
    renumberRows('objective');
    syncEventObjectiveChoices();
}

function cloneObjectiveRow(source) {
    const row = source.cloneNode(true);
    row.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    row.querySelector('[data-remove-objective]').hidden = false;
    row.dataset.objectiveId = `objective-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return row;
}

function addObjectiveRow() {
    const first = document.querySelector('#campaignEditorObjectives [data-objective-row]');
    const row = cloneObjectiveRow(first);
    row.dataset.objectiveId = `objective-${document.querySelectorAll('#campaignEditorObjectives [data-objective-row]').length + 1}`;
    row.querySelector('[data-objective-label]').value = '';
    row.querySelector('[data-objective-target]').value = '1';
    document.getElementById('campaignEditorObjectives').appendChild(row);
    renumberRows('objective');
    syncEventObjectiveChoices();
    handleDraftInput();
}

function fillEventRows(events, objectives) {
    const host = document.getElementById('campaignEditorEvents');
    const first = host.querySelector('[data-event-row]');
    host.replaceChildren(first);
    const items = events.length ? events : [{}];
    items.forEach((event, index) => {
        const row = index === 0 ? first : cloneEventRow(first);
        if (index > 0) host.appendChild(row);
        row.dataset.eventId = event.id || `event-${index + 1}`;
        row.querySelector('[data-trigger-condition]').value = event.when?.type || 'objective-complete';
        row.querySelector('[data-event-message]').value = event.message || '';
    });
    syncEventObjectiveChoices(objectives);
    for (const row of host.querySelectorAll('[data-event-row]')) {
        const event = items[[...host.children].indexOf(row)];
        const select = row.querySelector('[data-trigger-objective]');
        select.value = event?.when?.objectiveId || objectives[0]?.id || '';
    }
    renumberRows('event');
}

function cloneEventRow(source) {
    const row = source.cloneNode(true);
    row.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    row.querySelector('[data-remove-event]').hidden = false;
    row.dataset.eventId = `event-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return row;
}

function addEventRow() {
    const first = document.querySelector('#campaignEditorEvents [data-event-row]');
    const row = cloneEventRow(first);
    row.dataset.eventId = `event-${document.querySelectorAll('#campaignEditorEvents [data-event-row]').length + 1}`;
    row.querySelector('[data-event-message]').value = '';
    document.getElementById('campaignEditorEvents').appendChild(row);
    syncEventObjectiveChoices();
    renumberRows('event');
    handleDraftInput();
}

function syncEventObjectiveChoices(objectives = null) {
    const source = objectives || [...document.querySelectorAll('#campaignEditorObjectives [data-objective-row]')].map((row, index) => ({
        id: row.dataset.objectiveId || `objective-${index + 1}`,
        label: row.querySelector('[data-objective-label]').value || `Objective ${index + 1}`
    }));
    for (const row of document.querySelectorAll('#campaignEditorEvents [data-event-row]')) {
        const select = row.querySelector('[data-trigger-objective]');
        const previous = select.value;
        select.replaceChildren(...source.map(objective => new Option(objective.label || objective.id, objective.id)));
        select.value = source.some(item => item.id === previous) ? previous : (source[0]?.id || '');
    }
}

function renumberRows(kind) {
    const rows = kind === 'objective'
        ? [...document.querySelectorAll('#campaignEditorObjectives [data-objective-row]')]
        : [...document.querySelectorAll('#campaignEditorEvents [data-event-row]')];
    rows.forEach((row, index) => {
        const remove = row.querySelector(kind === 'objective' ? '[data-remove-objective]' : '[data-remove-event]');
        if (remove) remove.hidden = rows.length <= 1;
    });
}

function applyEditorDimensions() {
    const candidate = collectForm();
    const { cols, rows } = candidate.world;
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 200 || rows < 1 || cols * rows > 2_000_000) {
        setStatus('Choose valid world dimensions within the supported two-million-cell limit.');
        return;
    }
    draft = {
        ...candidate,
        world: { cols, rows },
        startingSave: null,
        startingLayout: null,
        snapshotCapturedAt: null,
        snapshotStale: false
    };
    snapshotStale = false;
    revision++;
    approvedRevision = -1;
    editorSessionStart({ clear: true, cols, rows });
    document.getElementById('campaignEditorSnapshotStatus').textContent = 'Canvas resized and cleared. Draw the scenario, then capture it.';
    setValidation('');
    setStatus(`Canvas resized to ${cols} × ${rows} and cleared. Draw the scenario, then capture it.`);
    persistDraftQuietly();
    updateReviewAvailability();
}

async function loadSelectedMission() {
    const value = document.getElementById('campaignMissionList').value;
    let selected = null;
    if (value.startsWith('installed:')) selected = getMissionDefinitions().find(item => item.id === value.slice(10));
    else if (value.startsWith('draft:')) selected = readDraftStore().drafts.find(item => item.id === value.slice(6));
    if (!selected) { setStatus('Choose an installed mission or saved draft first.'); return; }
    draft = structuredClone(selected);
    draftId = `draft:${draft.id}`;
    revision++;
    approvedRevision = -1;
    snapshotStale = !!draft.snapshotStale;
    fillForm(draft);
    try {
        if (draft.startingSave) {
            const payload = parseSaveString(draft.startingSave);
            editorSessionStart({ clear: true, cols: payload.simulation.cols, rows: payload.simulation.rows });
            restoreSavePayload(payload);
            renderWorld();
        } else {
            editorSessionStart({ clear: true, cols: draft.world.cols, rows: draft.world.rows });
            applyStartingLayout(draft);
        }
        restoreEditorSelection(draft);
        const capturedAt = draft.snapshotCapturedAt;
        document.getElementById('campaignEditorSnapshotStatus').textContent = draft.startingSave
            ? `Captured ${capturedAt ? new Date(capturedAt).toLocaleString() : 'scenario'}${snapshotStale ? ' · stale' : ''}.`
            : 'No scenario captured; using the declarative starting layout.';
        setStatus(`Loaded ${draft.title} into an unrestricted authoring session.`);
    } catch (error) {
        setStatus(`Could not load the scenario: ${error.message}`);
    }
    renderMissionList(draftId);
    setValidation('');
    updateReviewAvailability();
}

function fillForm(mission) {
    suppressInputs = true;
    const field = name => root.querySelector(`[data-mission-field="${name}"]`);
    root.querySelector('[data-mission-field="id"]').value = mission.id || '';
    document.getElementById('campaignEditorNumber').value = String(mission.number ?? '');
    document.getElementById('campaignEditorTitle').value = mission.title || '';
    document.getElementById('campaignEditorBriefing').value = mission.briefing || '';
    field('cols').value = String(mission.world?.cols || 260);
    field('rows').value = String(mission.world?.rows || 150);
    fillBudgetRows(mission.resourceBudgets || {});
    for (const input of root.querySelectorAll('[data-environment]')) {
        const key = input.dataset.environment;
        input.checked = input.type === 'checkbox' ? !!mission.environment?.[key] : false;
        if (input.type !== 'checkbox') input.value = String(mission.environment?.[key] ?? 0);
    }
    for (const input of root.querySelectorAll('[data-environment-target]')) {
        input.value = String(mission.environmentTargets?.[input.dataset.environmentTarget] ?? 0);
    }
    for (const input of root.querySelectorAll('[data-lock]')) input.checked = (mission.lockedControls || []).includes(input.dataset.lock);
    field('startMaterial').value = mission.startSelection?.material || 'Water';
    field('drawMode').value = mission.startSelection?.drawMode || 'brush';
    for (const option of field('visualizations').options) option.selected = (mission.visualizationModes || []).includes(option.value);
    for (const option of field('tools').options) option.selected = (mission.unlockedTools || []).includes(option.value);
    fillObjectiveRows(mission.objectives || []);
    fillEventRows(mission.events || [], mission.objectives || []);
    const status = document.getElementById('campaignEditorSnapshotStatus');
    status.textContent = mission.startingSave
        ? `Captured ${mission.snapshotCapturedAt ? new Date(mission.snapshotCapturedAt).toLocaleString() : 'scenario'}${snapshotStale ? ' · stale' : ''}.`
        : mission.startingLayout ? 'Declarative starting layout ready.' : 'No scenario captured.';
    suppressInputs = false;
}

function collectForm() {
    const field = name => root.querySelector(`[data-mission-field="${name}"]`);
    const previous = draft || {};
    const materials = {};
    for (const row of root.querySelectorAll('[data-budget-row="material"]')) {
        const name = row.querySelector('[data-budget-name]').value;
        const value = row.querySelector('[data-budget-value]').value.trim();
        if (name && value !== '') materials[name] = Number(value);
    }
    const machines = {};
    for (const row of root.querySelectorAll('[data-budget-row="machine"]')) {
        const name = row.querySelector('[data-budget-name]').value;
        const value = row.querySelector('[data-budget-value]').value.trim();
        if (name && value !== '') machines[name] = Number(value);
    }
    const environment = {};
    for (const input of root.querySelectorAll('[data-environment]')) {
        environment[input.dataset.environment] = input.type === 'checkbox' ? input.checked : Number(input.value);
    }
    const environmentTargets = {};
    for (const input of root.querySelectorAll('[data-environment-target]')) {
        environmentTargets[input.dataset.environmentTarget] = Number(input.value);
    }
    const objectives = [...root.querySelectorAll('[data-objective-row]')].map((row, index) => {
        const previousObjective = previous.objectives?.find(item => item.id === row.dataset.objectiveId) || {};
        return {
            id: row.dataset.objectiveId || previousObjective.id || `objective-${index + 1}`,
            type: row.querySelector('[data-objective-type]')?.value || 'transformation',
            from: row.querySelector('[data-objective-from]').value,
            to: row.querySelector('[data-objective-to]').value,
            target: Number(row.querySelector('[data-objective-target]').value),
            label: row.querySelector('[data-objective-label]').value.trim()
        };
    });
    return {
        ...previous,
        id: root.querySelector('[data-mission-field="id"]').value.trim(),
        number: Number(document.getElementById('campaignEditorNumber').value),
        title: document.getElementById('campaignEditorTitle').value.trim(),
        briefing: document.getElementById('campaignEditorBriefing').value.trim(),
        world: { cols: Number(field('cols').value), rows: Number(field('rows').value) },
        resourceBudgets: { materials, machines },
        environment,
        environmentTargets: objectives.some(objective => objective.type === 'environment-target') ? environmentTargets : undefined,
        lockedControls: [...root.querySelectorAll('[data-lock]:checked')].map(input => input.dataset.lock),
        startSelection: { material: field('startMaterial').value, drawMode: field('drawMode').value },
        visualizationModes: [...field('visualizations').selectedOptions].map(option => option.value),
        unlockedTools: [...field('tools').selectedOptions].map(option => option.value),
        objectives,
        events: [...root.querySelectorAll('[data-event-row]')].map((row, index) => {
            const previousEvent = previous.events?.find(item => item.id === row.dataset.eventId) || {};
            return {
                id: row.dataset.eventId || previousEvent.id || `event-${index + 1}`,
                when: { type: row.querySelector('[data-trigger-condition]').value, objectiveId: row.querySelector('[data-trigger-objective]').value },
                message: row.querySelector('[data-event-message]').value.trim()
            };
        })
    };
}

function handleDraftInput(event) {
    if (suppressInputs || !root || root.hidden) return;
    const priorId = draft?.id;
    draft = collectForm();
    if (draft.id !== priorId) draftId = `draft:${draft.id}`;
    revision++;
    approvedRevision = -1;
    setValidation('');
    updateReviewAvailability();
    persistDraftQuietly();
    renderMissionList(draftId);
}

function captureScenario() {
    try {
        draft = collectForm();
        draft.startingSave = createSaveString();
        draft.startingLayout = null;
        draft.snapshotCapturedAt = new Date().toISOString();
        snapshotStale = false;
        draft.snapshotStale = false;
        revision++;
        approvedRevision = -1;
        document.getElementById('campaignEditorSnapshotStatus').textContent = `Captured ${new Date(draft.snapshotCapturedAt).toLocaleString()}.`;
        setStatus('Live scenario captured as a compressed Sandbox save.');
        setValidation('');
        updateReviewAvailability();
        persistDraftQuietly();
        renderMissionList(draftId);
    } catch (error) { setStatus(`Scenario capture failed: ${error.message}`); }
}

function validateAndReview() {
    if (!draft) draft = collectForm();
    draft = collectForm();
    if (snapshotStale) {
        setValidation('Scenario changed after its last capture. Capture it again before review.');
        setStatus('Mission invalid: the captured scenario is stale.');
        return;
    }
    const result = validateCampaignMission(draft);
    if (!result.valid) {
        approvedRevision = -1;
        setValidation(result.errors);
        setStatus(`Mission invalid: ${result.errors.length} issue${result.errors.length === 1 ? '' : 's'} found.`);
        updateReviewAvailability();
        return;
    }
    setValidation('');
    const review = document.getElementById('campaignEditorReviewSummary');
    review.className = 'campaign-review-summary';
    review.replaceChildren(
        reviewLine(`Mission ${draft.number}: ${draft.title}`),
        reviewLine(draft.briefing),
        reviewLine(`Starting supplies: ${Object.entries(draft.resourceBudgets.materials).map(([name, count]) => `${count} ${name}`).join(' · ') || 'none'}`),
        reviewLine(`Environment: ${draft.environment.temperature} °C, ${draft.environment.humidity}% humidity, ${draft.environment.illumination}% light, dewpoint ${draft.environment.dewpoint} °C.`),
        reviewLine(`Locked controls: ${draft.lockedControls.join(', ') || 'none'}. Objective: ${draft.objectives[0].label} Trigger: ${draft.events[0].message}`),
        reviewLine(`Scenario snapshot: ${draft.startingSave ? `captured ${draft.snapshotCapturedAt || 'time unavailable'}` : 'declarative layout'}.`),
        reviewLine(result.conflicts.length
            ? `This draft matches installed mission(s): ${result.conflicts.map(item => `Mission ${item.number} · ${item.title}`).join(', ')}. Install will request replacement confirmation.`
            : 'This draft does not conflict with an installed mission.')
    );
    document.getElementById('campaignEditorReviewData').textContent = JSON.stringify(draft, null, 2);
    document.getElementById('campaignEditorReviewDialog').hidden = false;
    approvedRevision = -1;
    setStatus('Mission valid. Review the data and approve before installing.');
    updateReviewAvailability();
}

function reviewLine(text) { const line = document.createElement('div'); line.textContent = text; return line; }
function approveReview() {
    if (!draft || snapshotStale) return;
    approvedRevision = revision;
    document.getElementById('campaignEditorReviewDialog').hidden = true;
    setStatus('Review approved for this draft revision. Install is now available.');
    updateReviewAvailability();
}

async function beginInstall() {
    if (!draft || approvedRevision !== revision || snapshotStale) {
        setStatus('Validate and approve the current draft review before installing.'); return;
    }
    if (typeof window.showOpenFilePicker !== 'function') { setStatus('This browser does not support the campaign.js file picker.'); return; }
    try {
        const [handle] = await window.showOpenFilePicker({
            multiple: false, mode: 'readwrite',
            types: [{ description: 'Campaign source', accept: { 'text/javascript': ['.js'] } }]
        });
        if (!handle) return;
        if (handle.name !== 'campaign.js') { setStatus('Select the campaign.js file to install this mission.'); return; }
        let permission = await handle.queryPermission?.({ mode: 'readwrite' });
        if (permission !== 'granted') permission = await handle.requestPermission?.({ mode: 'readwrite' });
        if (permission !== 'granted') { setStatus('Write permission for campaign.js was not granted. The file is unchanged.'); return; }
        const source = await (await handle.getFile()).text();
        const result = createCampaignSourceCandidate(source, draft);
        if (result.conflicts.length) {
            pendingInstall = { handle, source, mission: structuredClone(draft), conflicts: result.conflicts };
            const conflict = result.conflicts[0];
            document.getElementById('campaignEditorReplaceMessage').textContent = `Mission ${conflict.number}, “${conflict.title}”, conflicts with this draft. Confirm to replace it.`;
            document.getElementById('campaignEditorConfirmReplaceWrap').hidden = false;
            setStatus('A matching mission is already installed; explicit replacement confirmation is required.');
            return;
        }
        await writeInstalledMission(handle, source, draft, false);
    } catch (error) {
        if (error?.name === 'AbortError') { setStatus('File selection cancelled; campaign.js was not changed.'); return; }
        setStatus(`Install failed: ${error.message || 'Unable to read campaign.js.'}`);
    }
}

function cancelPendingInstall() {
    pendingInstall = null;
    document.getElementById('campaignEditorConfirmReplaceWrap').hidden = true;
    setStatus('Replacement cancelled. campaign.js is unchanged.');
}

async function completePendingInstall() {
    if (!pendingInstall) return;
    const pending = pendingInstall;
    pendingInstall = null;
    document.getElementById('campaignEditorConfirmReplaceWrap').hidden = true;
    await writeInstalledMission(pending.handle, pending.source, pending.mission, true);
}

async function writeInstalledMission(handle, reviewedSource, mission, replace) {
    try {
        if (approvedRevision !== revision || snapshotStale) throw new Error('The approved review is no longer current. Validate and review again.');
        const candidateResult = createCampaignSourceCandidate(reviewedSource, mission, { replace });
        if (!candidateResult.source) throw new Error('A mission conflict requires replacement confirmation.');
        const freshSource = await (await handle.getFile()).text();
        if (freshSource !== reviewedSource) throw new Error('campaign.js changed after review. Reopen the editor review before installing.');
        const markers = validateMarkers(reviewedSource);
        const backup = {
            fileName: handle.name, originalSource: reviewedSource,
            createdAt: new Date().toISOString(), sourceHash: sourceHash(reviewedSource)
        };
        const encoded = JSON.stringify(backup);
        localStorage.setItem(CAMPAIGN_EDITOR_SOURCE_BACKUP_KEY, encoded);
        if (localStorage.getItem(CAMPAIGN_EDITOR_SOURCE_BACKUP_KEY) !== encoded) throw new Error('Local storage could not verify the recovery backup.');
        renderBackupStatus();
        const writable = await handle.createWritable();
        await writable.write(candidateResult.source);
        await writable.close();
        const written = await (await handle.getFile()).text();
        const writtenMarkers = validateMarkers(written);
        const verified = readMissionsFromSource(written);
        const expected = readMissionsFromSource(candidateResult.source);
        if (written.slice(0, writtenMarkers.beginStart) !== reviewedSource.slice(0, markers.beginStart) ||
            written.slice(writtenMarkers.endStart + GENERATED_MISSIONS_END.length) !== reviewedSource.slice(markers.endStart + GENERATED_MISSIONS_END.length) ||
            JSON.stringify(verified) !== JSON.stringify(expected)) {
            throw new Error('The installed source did not pass read-back verification. The stored backup is ready for recovery.');
        }
        renderBackupStatus();
        setStatus(`Installed ${mission.title} into ${handle.name}. Reload the app to load the new mission definitions.`);
    } catch (error) { setStatus(`Install failed: ${error.message}. The draft and any stored backup remain available.`); }
    renderBackupStatus();
}

async function chooseBackupRestore() {
    const backup = readBackup();
    if (!backup) { setStatus('There is no campaign.js source backup to restore.'); return; }
    if (typeof window.showOpenFilePicker !== 'function') { setStatus('This browser does not support the campaign.js file picker.'); return; }
    try {
        const [handle] = await window.showOpenFilePicker({ multiple: false, mode: 'readwrite', types: [{ description: 'Campaign source', accept: { 'text/javascript': ['.js'] } }] });
        if (!handle) return;
        if (handle.name !== 'campaign.js') { setStatus('Select campaign.js to restore the saved source.'); return; }
        let permission = await handle.queryPermission?.({ mode: 'readwrite' });
        if (permission !== 'granted') permission = await handle.requestPermission?.({ mode: 'readwrite' });
        if (permission !== 'granted') { setStatus('Write permission was not granted. The selected file is unchanged.'); return; }
        pendingRestore = { handle, backup };
        document.getElementById('campaignEditorConfirmRestore').hidden = false;
    } catch (error) { setStatus(error?.name === 'AbortError' ? 'Backup restore cancelled.' : `Backup restore could not start: ${error.message}`); }
}

async function restoreBackup() {
    const pending = pendingRestore;
    pendingRestore = null;
    document.getElementById('campaignEditorConfirmRestore').hidden = true;
    if (!pending) return;
    try {
        const writable = await pending.handle.createWritable();
        await writable.write(pending.backup.originalSource);
        await writable.close();
        const restored = await (await pending.handle.getFile()).text();
        if (restored !== pending.backup.originalSource) throw new Error('Read-back does not match the stored original source.');
        setStatus(`Restored the original source to ${pending.handle.name}.`);
    } catch (error) { setStatus(`Backup restore failed: ${error.message}`); }
}

function saveCurrentDraft() {
    draft = collectForm();
    if (!draft.id) { setStatus('Add a mission ID before saving this draft.'); return; }
    draftId = `draft:${draft.id}`;
    const store = readDraftStore();
    const index = store.drafts.findIndex(item => item.id === draft.id);
    if (index < 0) store.drafts.push(structuredClone(draft));
    else store.drafts[index] = structuredClone(draft);
    if (!writeDraftStore(store)) return;
    revision++;
    approvedRevision = -1;
    setStatus(`Draft saved: ${draft.title || draft.id}.`);
    renderMissionList(draftId);
    updateReviewAvailability();
}

function persistDraftQuietly() {
    if (!draft?.id) return;
    const store = readDraftStore();
    const index = store.drafts.findIndex(item => item.id === draft.id);
    if (index < 0) store.drafts.push(structuredClone(draft)); else store.drafts[index] = structuredClone(draft);
    writeDraftStore(store, true);
}

function readDraftStore() {
    try {
        const raw = localStorage.getItem(CAMPAIGN_EDITOR_DRAFTS_KEY);
        if (!raw) return { version: 1, drafts: [] };
        const parsed = JSON.parse(raw);
        if (parsed?.version !== 1 || !Array.isArray(parsed.drafts)) return { version: 1, drafts: [] };
        return { version: 1, drafts: parsed.drafts.filter(item => item && typeof item.id === 'string') };
    } catch { return { version: 1, drafts: [] }; }
}

function loadDraftStore() {
    try {
        const raw = localStorage.getItem(CAMPAIGN_EDITOR_DRAFTS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.version !== 1 || !Array.isArray(parsed.drafts)) throw new Error('Draft data is malformed.');
        }
    } catch (error) { setStatus(`Draft storage issue: ${error.message || 'Local storage is unavailable.'} The editor is still usable.`); }
}

function writeDraftStore(store, quiet = false) {
    try {
        const encoded = JSON.stringify({ version: 1, drafts: store.drafts });
        localStorage.setItem(CAMPAIGN_EDITOR_DRAFTS_KEY, encoded);
        if (localStorage.getItem(CAMPAIGN_EDITOR_DRAFTS_KEY) !== encoded) throw new Error('Draft data could not be verified.');
        return true;
    } catch (error) {
        if (!quiet) setStatus(`Draft could not be saved: ${error.message || 'local storage is unavailable.'}`);
        else setStatus(`Draft autosave issue: ${error.message || 'local storage is unavailable.'} The editor remains usable.`);
        return false;
    }
}

function renderMissionList(selectedValue = null) {
    const select = document.getElementById('campaignMissionList');
    if (!select) return;
    const installed = getMissionDefinitions();
    const drafts = readDraftStore().drafts;
    const options = [new Option('Select mission or draft…', '')];
    installed.forEach(mission => options.push(new Option(`Mission ${mission.number} · ${mission.title}`, `installed:${mission.id}`)));
    drafts.forEach(item => options.push(new Option(`Draft ${item.number || '?'} · ${item.title || item.id}`, `draft:${item.id}`)));
    select.replaceChildren(...options);
    if (selectedValue && [...select.options].some(option => option.value === selectedValue)) select.value = selectedValue;
}

function restoreEditorSelection(mission) {
    const definitions = getDefinitions();
    const selected = definitions.findIndex(definition => definition?.name === mission.startSelection?.material);
    if (selected >= 0) setParticleTypeIdSelected(selected);
    setDrawMode(mission.startSelection?.drawMode || 'brush');
    window.dispatchEvent(new Event('campaign-editor-selection-restored'));
}

function applyStartingLayout(mission) {
    const layout = mission.startingLayout;
    if (!layout || layout.type !== 'floor') return;
    const id = getDefinitions().findIndex(definition => definition?.name === layout.material);
    if (id <= 0) return;
    const world = getWorld();
    const rows = Math.max(1, Math.min(world.rows, Math.floor(layout.rows || 1)));
    for (let y = world.rows - rows; y < world.rows; y++) for (let x = 0; x < world.cols; x++) setCell(x, y, id);
}

function isSupportedLayout(layout, world) {
    return layout?.type === 'floor' && typeof layout.material === 'string' && knownMaterial(layout.material) &&
        Number.isInteger(layout.rows) && layout.rows > 0 && layout.rows <= world?.rows;
}
function knownMaterial(name) { return getDefinitions().some(definition => definition?.name === name); }
function capturedSaveHasSandFloor(payload, cols) {
    const simulation = payload?.simulation;
    if (!simulation || simulation.cols !== cols) return false;
    const sandId = getDefinitions().findIndex(definition => definition?.name === 'Sand');
    const types = simulation.arrays?.type;
    if (!types || types.length !== simulation.cols * simulation.rows) return false;
    for (let x = 0; x < simulation.cols; x++) {
        let hasSand = false;
        for (let y = Math.max(0, simulation.rows - 10); y < simulation.rows; y++) {
            if (types[y * simulation.cols + x] === sandId) { hasSand = true; break; }
        }
        if (!hasSand) return false;
    }
    return true;
}

function validateMarkers(source) {
    if (typeof source !== 'string') throw new Error('campaign.js could not be read as text.');
    const beginCount = source.split(GENERATED_MISSIONS_BEGIN).length - 1;
    const endCount = source.split(GENERATED_MISSIONS_END).length - 1;
    const beginStart = source.indexOf(GENERATED_MISSIONS_BEGIN);
    const beginEnd = beginStart + GENERATED_MISSIONS_BEGIN.length;
    const endStart = source.indexOf(GENERATED_MISSIONS_END);
    if (beginCount !== 1 || endCount !== 1 || beginStart < 0 || endStart <= beginEnd) {
        throw new Error('campaign.js must contain exactly one correctly ordered generated mission marker pair.');
    }
    return { beginStart, beginEnd, endStart };
}

function readMissionsFromSource(source) {
    const markers = validateMarkers(source);
    const block = source.slice(markers.beginEnd, markers.endStart);
    const declaration = block.indexOf('const MISSION_DEFINITIONS = Object.freeze(');
    const payloadStart = declaration < 0 ? -1 : declaration + 'const MISSION_DEFINITIONS = Object.freeze('.length;
    const payloadEnd = block.lastIndexOf(');');
    if (declaration < 0 || payloadEnd <= payloadStart) throw new Error('Generated mission data declaration is missing.');
    let missions;
    try { missions = JSON.parse(block.slice(payloadStart, payloadEnd)); } catch { throw new Error('Generated mission data is not valid JSON.'); }
    if (!Array.isArray(missions)) throw new Error('Generated mission data must be a list.');
    return missions;
}

function sourceHash(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
function readBackup() {
    try {
        const value = localStorage.getItem(CAMPAIGN_EDITOR_SOURCE_BACKUP_KEY);
        const parsed = value ? JSON.parse(value) : null;
        return parsed && parsed.fileName === 'campaign.js' && typeof parsed.originalSource === 'string' ? parsed : null;
    } catch { return null; }
}
function renderBackupStatus() {
    const backup = readBackup();
    const status = document.getElementById('campaignEditorBackupStatus');
    const download = document.getElementById('campaignEditorDownloadBackup');
    const restore = document.getElementById('campaignEditorRestoreBackup');
    if (!status) return;
    status.textContent = backup ? `Recovery backup: ${backup.fileName}, ${new Date(backup.createdAt).toLocaleString()}.` : 'No source backup stored.';
    download.disabled = !backup;
    restore.disabled = !backup;
}
function downloadBackup() {
    const backup = readBackup();
    if (!backup) { setStatus('There is no stored source backup to download.'); return; }
    const url = URL.createObjectURL(new Blob([backup.originalSource], { type: 'text/javascript' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'campaign.js.backup'; anchor.click();
    URL.revokeObjectURL(url);
}

function setValidation(value) {
    const target = document.getElementById('campaignEditorValidation');
    target.replaceChildren();
    const messages = Array.isArray(value) ? value : value ? [value] : [];
    for (const message of messages) { const item = document.createElement('p'); item.textContent = message; target.appendChild(item); }
}
function setStatus(message) { const target = document.getElementById('campaignEditorStatus'); if (target) target.textContent = message; }
function updateReviewAvailability() {
    const install = document.getElementById('campaignEditorInstall');
    if (install) install.disabled = !draft || approvedRevision !== revision || snapshotStale;
}
