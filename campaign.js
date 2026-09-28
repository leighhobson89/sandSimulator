// Campaign rules are data driven so later story missions can be added without
// changing the simulation loop or the sandbox's material catalogue.
import { getDefinitions, setMaterialTransitionListener } from './physics.js';

// BEGIN GENERATED MISSION DATA
const MISSION_DEFINITIONS = Object.freeze([
    {
        "id": "first-thaw",
        "number": 1,
        "title": "The First Daffodil",
        "briefing": "Turn the sandy basin into a living habitat. Place the dry mud, use the field water, and grow a daffodil from the single seed.",
        "world": { "cols": 260, "rows": 150 },
        "startingLayout": { "type": "floor", "material": "Sand", "rows": 5 },
        "resourceBudgets": { "materials": { "Dry Mud": 100, "Water": 1000, "Daffodil Seeds": 1 }, "machines": {} },
        "environment": {
            "temperature": 14, "humidity": 68, "illumination": 65, "dewpoint": 10,
            "ambientWindOn": false, "windStrength": 0, "gustWindStrength": 0
        },
        "lockedControls": ["temperature", "humidity", "illumination", "dewpoint", "wind"],
        "startSelection": { "material": "Water", "drawMode": "brush" },
        "unlockedTools": ["brush"],
        "visualizationModes": ["normal", "heat", "humidity", "wind"],
        "objectives": [{
            "id": "grow-daffodil", "type": "transformation", "from": "Daffodil Seeds", "to": "Daffodil",
            "target": 1, "label": "Grow one Daffodil from seed."
        }],
        "events": [{
            "id": "daffodil-grown",
            "when": { "type": "objective-complete", "objectiveId": "grow-daffodil" },
            "message": "The first daffodil has taken root."
        }]
    },
    {
        "id": "ice-banana",
        "number": 2,
        "title": "The Icebound Grove",
        "briefing": "Thaw the frozen ground, prepare a warm and humid growing climate, and bring a Banana Plant to life.",
        "guidance": "Use the Temperature slider in World Parameters to warm the five-layer Ice bed until it melts into Water. Banana grows best at 30°C and 95% humidity; set those with the Temperature and Humidity sliders, then use the Ambient Light slider to reach the mission target of 85%. Add up to 500 Dry Mud to the Water to make Wet Mud, then plant your single Banana Seed in the wet soil.",
        "world": { "cols": 260, "rows": 150 },
        "startingLayout": { "type": "floor", "material": "Ice", "rows": 5 },
        "resourceBudgets": { "materials": { "Dry Mud": 500, "Banana Seeds": 1 }, "machines": {} },
        "environment": {
            "temperature": -10, "humidity": 35, "illumination": 10, "dewpoint": -15,
            "ambientWindOn": false, "windStrength": 0, "gustWindStrength": 0
        },
        "environmentTargets": { "temperature": 30, "humidity": 95, "illumination": 85 },
        "lockedControls": ["dewpoint", "wind"],
        "startSelection": { "material": "Dry Mud", "drawMode": "brush" },
        "unlockedTools": ["brush"],
        "visualizationModes": ["normal", "heat", "humidity", "wind"],
        "objectives": [
            { "id": "melt-ice", "type": "transformation", "from": "Ice", "to": "Water", "target": 1, "label": "Melt Ice into Water." },
            { "id": "warm-grove", "type": "environment-target", "target": 1, "label": "Reach 30°C, 95% humidity, and 85% illumination." },
            { "id": "wet-mud", "type": "transformation", "from": "Dry Mud", "to": "Wet Mud", "target": 1, "label": "Turn Dry Mud into Wet Mud." },
            { "id": "grow-banana", "type": "transformation", "from": "Banana Seeds", "to": "Banana Plant", "target": 1, "label": "Grow one Banana Plant from seed." }
        ],
        "events": [
            { "id": "ice-melted", "when": { "type": "objective-complete", "objectiveId": "melt-ice" }, "message": "The ice is melting into water." },
            { "id": "grove-warmed", "when": { "type": "objective-complete", "objectiveId": "warm-grove" }, "message": "The grove has reached its growing climate." },
            { "id": "mud-wetted", "when": { "type": "objective-complete", "objectiveId": "wet-mud" }, "message": "The soil is ready for planting." },
            { "id": "banana-grown", "when": { "type": "objective-complete", "objectiveId": "grow-banana" }, "message": "The Icebound Grove is alive with a Banana Plant." }
        ]
    }
]);
// END GENERATED MISSION DATA

let campaignState = null;

export function getMissionDefinitions() {
    return MISSION_DEFINITIONS.map(mission => structuredClone(mission));
}

export function getCurrentMission() {
    if (!campaignState) return null;
    return MISSION_DEFINITIONS.find(mission => mission.id === campaignState.missionId) || null;
}

export function getNextMission() {
    if (!campaignState) return null;
    const index = MISSION_DEFINITIONS.findIndex(mission => mission.id === campaignState.missionId);
    return index >= 0 ? MISSION_DEFINITIONS[index + 1] || null : null;
}

export function getPendingMission() {
    return MISSION_DEFINITIONS.find(mission => mission.id === campaignState?.pendingMissionId) || null;
}

export function queueNextMission() {
    if (!campaignState?.missionCompleted || !campaignState.recapDismissed || campaignState.campaignComplete) return null;
    const mission = getNextMission();
    if (!mission) return null;
    campaignState.pendingMissionId = mission.id;
    announceCampaignChange();
    return mission;
}

export function beginPendingMission() {
    const pending = getPendingMission();
    return pending ? startCampaign(pending.id) : null;
}

export function getCampaignState() { return campaignState; }
export function isCampaignActive() { return !!campaignState; }

export function startCampaign(missionId = MISSION_DEFINITIONS[0]?.id) {
    const mission = MISSION_DEFINITIONS.find(item => item.id === missionId);
    if (!mission) throw new Error(`Unknown campaign mission: ${missionId}`);
    campaignState = createCampaignState(mission);
    announceCampaignChange();
    return campaignState;
}

export function clearCampaign() {
    campaignState = null;
    announceCampaignChange();
}

export function restoreCampaignState(state) {
    if (!validateCampaignState(state)) {
        campaignState = null;
        announceCampaignChange();
        return null;
    }
    const mission = MISSION_DEFINITIONS.find(item => item.id === state.missionId);
    const initial = createCampaignState(mission);
    const resources = { materials: {}, machines: {} };
    for (const category of ['materials', 'machines']) {
        for (const [name, limit] of Object.entries(mission.resourceBudgets[category] || {})) {
            const saved = state.resources?.[category]?.[name];
            const used = Number.isInteger(saved?.used) ? Math.max(0, Math.min(limit, saved.used)) : 0;
            resources[category][name] = { limit, used, remaining: limit - used };
        }
    }
    const objectiveProgress = {};
    for (const objective of mission.objectives) {
        const saved = state.objectiveProgress?.[objective.id];
        objectiveProgress[objective.id] = Number.isFinite(saved)
            ? Math.max(0, Math.min(objective.target, Math.floor(saved))) : 0;
    }
    campaignState = {
        ...initial,
        resources,
        objectiveProgress,
        firedEventIds: Array.isArray(state.firedEventIds)
            ? [...new Set(state.firedEventIds.filter(id => typeof id === 'string'))] : [],
        missionCompleted: state.missionCompleted === true || mission.objectives.every(objective =>
            (objectiveProgress[objective.id] || 0) >= objective.target),
        recapDismissed: state.recapDismissed === true,
        campaignComplete: state.campaignComplete === true || (state.missionCompleted === true &&
            !MISSION_DEFINITIONS[MISSION_DEFINITIONS.findIndex(item => item.id === mission.id) + 1]),
        pendingMissionId: MISSION_DEFINITIONS.some(item => item.id === state.pendingMissionId)
            ? state.pendingMissionId : null
    };
    if (campaignState.missionCompleted && !getNextMission()) campaignState.campaignComplete = true;
    announceCampaignChange();
    return campaignState;
}

export function validateCampaignState(state) {
    if (!state || state.mode !== 'campaign' || typeof state.campaignId !== 'string') return false;
    const mission = MISSION_DEFINITIONS.find(item => item.id === state.missionId);
    if (!mission || !state.resources || !state.objectiveProgress || !Array.isArray(state.firedEventIds) ||
        (state.missionCompleted !== undefined && typeof state.missionCompleted !== 'boolean') ||
        (state.recapDismissed !== undefined && typeof state.recapDismissed !== 'boolean') ||
        (state.campaignComplete !== undefined && typeof state.campaignComplete !== 'boolean') ||
        (state.pendingMissionId !== undefined && state.pendingMissionId !== null &&
            !MISSION_DEFINITIONS.some(item => item.id === state.pendingMissionId)) ||
        state.firedEventIds.some(id => typeof id !== 'string')) return false;
    // Prior releases used this mission ID with a smaller Water/Sprinkler loadout
    // and a floodplain objective. Accept those saves, then normalize them to the
    // current flower mission in restoreCampaignState below.
    if (mission.id === 'first-thaw' && state.resources.materials?.Water?.limit === 100 &&
        state.resources.machines?.sprinkler?.limit === 1 && state.objectiveProgress['restore-floodplain'] !== undefined) {
        const water = state.resources.materials.Water;
        return Number.isInteger(water.used) && water.used >= 0 && water.used <= 100 &&
            water.remaining === 100 - water.used;
    }
    for (const category of ['materials', 'machines']) {
        const savedResources = state.resources[category];
        if (!savedResources || typeof savedResources !== 'object') return false;
        const limits = mission.resourceBudgets[category] || {};
        for (const [name, limit] of Object.entries(limits)) {
            const resource = savedResources[name];
            if (!resource || resource.limit !== limit || !Number.isInteger(resource.used) ||
                resource.used < 0 || resource.used > limit || resource.remaining !== limit - resource.used) return false;
        }
        if (Object.keys(savedResources).some(name => !Object.hasOwn(limits, name))) return false;
    }
    for (const objective of mission.objectives) {
        const progress = state.objectiveProgress[objective.id];
        if (!Number.isInteger(progress) || progress < 0 || progress > objective.target) return false;
    }
    if (Object.keys(state.objectiveProgress).some(id => !mission.objectives.some(objective => objective.id === id))) return false;
    return true;
}

export function canUseMaterial(name, amount = 1) {
    if (!campaignState) return true;
    const resource = campaignState.resources.materials[name];
    return !!resource && Number.isInteger(amount) && amount >= 0 && resource.remaining >= amount;
}

export function consumeCampaignMaterial(name, amount = 1) {
    if (!campaignState) return true;
    if (!canUseMaterial(name, amount)) return false;
    const resource = campaignState.resources.materials[name];
    resource.used += amount;
    resource.remaining = Math.max(0, resource.limit - resource.used);
    announceCampaignChange();
    return true;
}

export function canPlaceMissionMachine(name) {
    if (!campaignState) return true;
    return (campaignState.resources.machines[name]?.remaining || 0) > 0;
}

export function consumeCampaignMachine(name) {
    if (!campaignState) return true;
    if (!canPlaceMissionMachine(name)) return false;
    const resource = campaignState.resources.machines[name];
    resource.used++;
    resource.remaining = Math.max(0, resource.limit - resource.used);
    announceCampaignChange();
    return true;
}

export function recordMaterialTransition(fromId, toId) {
    if (!campaignState) return null;
    const definitions = getDefinitions();
    const from = definitions[fromId]?.name;
    const to = definitions[toId]?.name;
    if (!from || !to) return campaignState;

    const mission = getCurrentMission();
    for (const objective of mission.objectives) {
        if (objective.type !== 'transformation' || objective.from !== from || objective.to !== to) continue;
        incrementObjective(objective);
    }
    updateMissionCompletion();
    return campaignState;
}

export function recordEnvironmentChange({ temperature, humidity, illumination } = {}) {
    if (!campaignState) return null;
    const mission = getCurrentMission();
    if (!mission?.environmentTargets) return campaignState;
    const targets = mission.environmentTargets;
    if (!Number.isFinite(temperature) || !Number.isFinite(humidity) || !Number.isFinite(illumination)) return campaignState;
    if (temperature !== targets.temperature || humidity !== targets.humidity || illumination !== targets.illumination) return campaignState;
    for (const objective of mission.objectives) {
        if (objective.type === 'environment-target') incrementObjective(objective);
    }
    updateMissionCompletion();
    return campaignState;
}

export function dismissMissionRecap() {
    if (!campaignState?.missionCompleted || campaignState.recapDismissed) return campaignState;
    campaignState.recapDismissed = true;
    announceCampaignChange();
    return campaignState;
}

function incrementObjective(objective) {
    if (campaignState.missionCompleted) return;
    const current = campaignState.objectiveProgress[objective.id] || 0;
    if (current >= objective.target) return;
    const next = Math.min(objective.target, current + 1);
    campaignState.objectiveProgress[objective.id] = next;
    if (next === objective.target) {
        const eventId = `objective:${objective.id}:complete`;
        if (!campaignState.firedEventIds.includes(eventId)) {
            campaignState.firedEventIds.push(eventId);
            announceObjectiveComplete(objective);
            triggerCampaignEvent('objective-complete', { objectiveId: objective.id });
        }
    }
    announceCampaignChange();
}

function updateMissionCompletion() {
    if (!campaignState || campaignState.missionCompleted) return;
    const mission = getCurrentMission();
    if (!mission.objectives.every(objective => (campaignState.objectiveProgress[objective.id] || 0) >= objective.target)) return;
    campaignState.missionCompleted = true;
    campaignState.campaignComplete = !getNextMission();
    campaignState.recapDismissed = false;
    campaignState.firedEventIds.push('mission:complete');
    announceCampaignChange();
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('campaign-mission-complete', {
        detail: { missionId: mission.id, campaignComplete: campaignState.campaignComplete }
    }));
}

export function triggerCampaignEvent(type, context = {}) {
    if (!campaignState) return [];
    const mission = getCurrentMission();
    const fired = [];
    for (const event of mission.events || []) {
        if (event.when?.type !== type) continue;
        if (event.when.objectiveId && event.when.objectiveId !== context.objectiveId) continue;
        if (campaignState.firedEventIds.includes(event.id)) continue;
        campaignState.firedEventIds.push(event.id);
        fired.push(event.id);
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('campaign-event', {
                detail: { id: event.id, type, ...context, message: event.message }
            }));
        }
    }
    return fired;
}

function createCampaignState(mission) {
    const makeResources = entries => Object.fromEntries(Object.entries(entries || {}).map(([name, limit]) =>
        [name, { limit, used: 0, remaining: limit }]));
    return {
        mode: 'campaign',
        campaignId: 'elemental-foundry-story',
        missionId: mission.id,
        resources: {
            materials: makeResources(mission.resourceBudgets.materials),
            machines: makeResources(mission.resourceBudgets.machines)
        },
        objectiveProgress: Object.fromEntries(mission.objectives.map(objective => [objective.id, 0])),
        firedEventIds: []
    };
}

function announceCampaignChange() {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('campaign-state-change'));
}

function announceObjectiveComplete(objective) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('campaign-objective-complete', {
        detail: { objectiveId: objective.id, label: objective.label }
    }));
}

// The physics layer reports committed state transformations here. This stays
// separate from setCell so player placement and world seeding do not count as
// story progress.
setMaterialTransitionListener(recordMaterialTransition);
