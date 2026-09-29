// Campaign rules are data driven so later story missions can be added without
// changing the simulation loop or the sandbox's material catalogue.
import { getDefinitions, setMaterialTransitionListener, setPlantGrowthCompletionListener } from './physics.js';

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
        "controlLimits": { "temperature": { "max": 30 } },
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
    },
    {
        "id": "three-states",
        "number": 3,
        "title": "The Basin in Three States",
        "briefing": "Start with a blank basin. Build dry Sand, Dry Mud, and Ash piles, bring in Steam, and use moderate humidity and dewpoint settings to make rain. Wet 150 cells of each pile to unlock the drying stage, then let all three piles get fully wet before drying them at the 150 \u00B0C limit. Drying Ash unlocks extreme heat so you can transform each material into Lava.",
        "guidance": "Place at least 500 cells each of Sand, Dry Mud, and Ash. Steam becomes available when all three piles are placed. Place 500 Steam, then set Humidity to 95% and Dewpoint to 20 \u00B0C. Steam will rise and condense in cooler air, making rain. Wetting 150 cells of each pile unlocks the next stage; keep the rain going until all 500 cells in each pile are wet before heating to 150 \u00B0C and drying them in order. Drying the Ash pile unlocks a 2,000 \u00B0C temperature limit; reach that temperature, then melt Sand through Glass, and melt Dry Mud and Ash into Lava.",
        "world": { "cols": 260, "rows": 150 },
        "startingLayout": { "type": "blank" },
        "resourceBudgets": { "materials": { "Sand": 5000, "Dry Mud": 5000, "Ash": 5000, "Steam": 8000 }, "machines": {} },
        "initiallyAvailableMaterials": ["Sand", "Dry Mud", "Ash"],
        "environment": {
            "temperature": 25, "humidity": 40, "illumination": 50, "dewpoint": 10,
            "ambientWindOn": false, "windStrength": 0, "gustWindStrength": 0
        },
        "controlLimits": { "temperature": { "min": -60, "max": 150 } },
        "lockedControls": ["humidity", "dewpoint", "illumination", "wind"],
        "startSelection": { "material": "Sand", "drawMode": "brush" },
        "unlockedTools": ["brush"],
        "visualizationModes": ["normal", "heat", "humidity"],
        "objectives": [
            { "id": "place-sand", "type": "material-placement", "material": "Sand", "target": 500, "label": "Place 500 Sand cells to build the first dry pile." },
            { "id": "place-dry-mud", "type": "material-placement", "material": "Dry Mud", "target": 500, "label": "Place 500 Dry Mud cells to build the second dry pile." },
            { "id": "place-ash", "type": "material-placement", "material": "Ash", "target": 500, "label": "Place 500 Ash cells to build the third dry pile." },
            { "id": "place-steam", "type": "material-placement", "material": "Steam", "target": 500, "requires": ["place-sand", "place-dry-mud", "place-ash"], "unlocks": { "controls": ["humidity", "dewpoint"] }, "label": "Place Steam above the piles to add moisture to the air." },
            { "id": "make-rain", "type": "environment-target", "target": 1, "targetValues": { "humidity": 95, "dewpoint": 20 }, "requires": ["place-steam"], "label": "Set Humidity to 95% and Dewpoint to 20 °C to make rain." },
            { "id": "wet-sand", "type": "transformation", "from": "Sand", "to": "Wet Sand", "target": 150, "requires": ["make-rain"], "label": "Let rain wet 150 Sand cells." },
            { "id": "wet-mud", "type": "transformation", "from": "Dry Mud", "to": "Wet Mud", "target": 150, "requires": ["make-rain"], "label": "Let rain wet 150 Dry Mud cells." },
            { "id": "wet-ash", "type": "transformation", "from": "Ash", "to": "Wet Ash", "target": 150, "requires": ["make-rain"], "label": "Let rain wet 150 Ash cells." },
            { "id": "set-drying-temperature", "type": "environment-target", "target": 1, "targetValues": { "temperature": 150 }, "requires": ["wet-sand", "wet-mud", "wet-ash"], "label": "Raise Temperature to the 150 °C limit to dry the piles." },
            { "id": "dry-sand", "type": "transformation", "from": "Wet Sand", "to": "Sand", "target": 500, "requires": ["wet-sand", "set-drying-temperature"], "label": "Heat Wet Sand until it dries back into Sand." },
            { "id": "dry-mud", "type": "transformation", "from": "Wet Mud", "to": "Dry Mud", "target": 500, "requires": ["wet-mud", "set-drying-temperature", "dry-sand"], "label": "Heat Wet Mud until it dries back into Dry Mud." },
            { "id": "dry-ash", "type": "transformation", "from": "Wet Ash", "to": "Ash", "target": 500, "requires": ["wet-ash", "set-drying-temperature", "dry-sand", "dry-mud"], "unlocks": { "controlLimits": { "temperature": { "max": 2000 } } }, "label": "Dry the Ash pile; this unlocks the 2,000 °C temperature limit." },
            { "id": "set-lava-temperature", "type": "environment-target", "target": 1, "targetValues": { "temperature": 2000 }, "requires": ["dry-ash"], "label": "Raise Temperature to 2,000 °C." },
            { "id": "melt-sand-to-glass", "type": "transformation", "from": "Sand", "to": "Glass", "target": 500, "requires": ["set-lava-temperature"], "label": "Melt Sand into Glass." },
            { "id": "melt-glass-to-lava", "type": "transformation", "from": "Glass", "to": "Lava", "target": 500, "requires": ["set-lava-temperature", "melt-sand-to-glass"], "label": "Heat Glass until it melts into Lava." },
            { "id": "melt-dry-mud-to-lava", "type": "transformation", "from": "Dry Mud", "to": "Lava", "target": 500, "requires": ["set-lava-temperature", "dry-mud"], "label": "Melt Dry Mud into Lava." },
            { "id": "melt-ash-to-lava", "type": "transformation", "from": "Ash", "to": "Lava", "target": 500, "requires": ["set-lava-temperature", "dry-ash"], "label": "Melt Ash into Lava." }
        ],
        "events": [
            { "id": "steam-placed", "when": { "type": "objective-complete", "objectiveId": "place-steam" }, "message": "Steam has opened the Humidity and Dewpoint controls. Set Humidity to 95% and Dewpoint to 20 °C so Steam can rise before condensing into rain." },
            { "id": "rain-started", "when": { "type": "objective-complete", "objectiveId": "make-rain" }, "message": "At 95% Humidity and a 20 °C Dewpoint, rising Steam can condense in cooler air and fall as rain." },
            { "id": "drying-temperature-ready", "when": { "type": "objective-complete", "objectiveId": "set-drying-temperature" }, "message": "At the 150 °C limit, the wet piles can now dry out." },
            { "id": "extreme-heat-unlocked", "when": { "type": "objective-complete", "objectiveId": "dry-ash" }, "message": "All three materials are dry. The Temperature control now reaches 2,000 °C." },
            { "id": "lava-temperature-ready", "when": { "type": "objective-complete", "objectiveId": "set-lava-temperature" }, "message": "At 2,000 °C, Sand, Dry Mud, and Ash can become Lava." }
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

export function isCampaignObjectiveUnlocked(objectiveOrId) {
    if (!campaignState) return true;
    const mission = getCurrentMission();
    const objective = typeof objectiveOrId === 'string'
        ? mission?.objectives.find(item => item.id === objectiveOrId)
        : objectiveOrId;
    if (!objective) return false;
    return (objective.requires || []).every(id => {
        const prerequisite = mission.objectives.find(item => item.id === id);
        return !!prerequisite && (campaignState.objectiveProgress[id] || 0) >= prerequisite.target;
    });
}

export function isCampaignMaterialAvailable(name) {
    if (!campaignState) return true;
    const resource = campaignState.resources.materials[name];
    if (!resource || resource.remaining <= 0) return false;
    const mission = getCurrentMission();
    const hasExplicitLoadout = Array.isArray(mission.initiallyAvailableMaterials);
    const explicitlyAvailable = !hasExplicitLoadout || mission.initiallyAvailableMaterials.includes(name) ||
        mission.objectives.some(objective =>
            (campaignState.objectiveProgress[objective.id] || 0) >= objective.target &&
            (objective.unlocks?.materials || []).includes(name));
    const placementObjectives = mission.objectives.filter(objective =>
        objective.type === 'material-placement' && objective.material === name);
    return explicitlyAvailable || placementObjectives.some(objective => isCampaignObjectiveUnlocked(objective));
}

export function isCampaignClimateControlAllowed(control) {
    if (!campaignState) return true;
    const mission = getCurrentMission();
    if (!(mission.lockedControls || []).includes(control)) return true;
    return mission.objectives.some(objective =>
        (campaignState.objectiveProgress[objective.id] || 0) >= objective.target &&
        (objective.unlocks?.controls || []).includes(control));
}

export function getCampaignControlLimits(control) {
    if (!campaignState) return null;
    const mission = getCurrentMission();
    let limits = { ...(mission.controlLimits?.[control] || {}) };
    for (const objective of mission.objectives) {
        if ((campaignState.objectiveProgress[objective.id] || 0) < objective.target) continue;
        const unlocked = objective.unlocks?.controlLimits?.[control];
        if (unlocked) limits = { ...limits, ...unlocked };
    }
    return Object.keys(limits).length ? limits : null;
}

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
        if (progress > 0 && (objective.requires || []).some(id => {
            const prerequisite = mission.objectives.find(item => item.id === id);
            return !prerequisite || (state.objectiveProgress[id] || 0) < prerequisite.target;
        })) return false;
    }
    if (Object.keys(state.objectiveProgress).some(id => !mission.objectives.some(objective => objective.id === id))) return false;
    return true;
}

export function canUseMaterial(name, amount = 1) {
    if (!campaignState) return true;
    const resource = campaignState.resources.materials[name];
    return isCampaignMaterialAvailable(name) && Number.isInteger(amount) && amount >= 0 && resource.remaining >= amount;
}

export function consumeCampaignMaterial(name, amount = 1) {
    if (!campaignState) return true;
    if (!canUseMaterial(name, amount)) return false;
    const resource = campaignState.resources.materials[name];
    resource.used += amount;
    resource.remaining = Math.max(0, resource.limit - resource.used);
    recordMaterialPlacement(name, amount);
    return true;
}

export function recordMaterialPlacement(name, amount = 1) {
    if (!campaignState || !Number.isInteger(amount) || amount <= 0) return campaignState;
    const mission = getCurrentMission();
    for (const objective of mission.objectives) {
        if (objective.type !== 'material-placement' || objective.material !== name ||
            !isCampaignObjectiveUnlocked(objective)) continue;
        incrementObjective(objective, amount, false);
    }
    updateMissionCompletion();
    announceCampaignChange();
    return campaignState;
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

export function recordMaterialTransition(fromId, toId, context = {}) {
    if (!campaignState) return null;
    const definitions = getDefinitions();
    const from = definitions[fromId]?.name;
    const to = definitions[toId]?.name;
    if (!from || !to) return campaignState;
    const seedDefinition = definitions[fromId];
    const plantDefinition = definitions[toId];

    const mission = getCurrentMission();
    for (const objective of mission.objectives) {
        if (objective.type !== 'transformation' || objective.from !== from || objective.to !== to) continue;
        if (context.plantGrowthPending && seedDefinition?.isSeed &&
            plantDefinition?.isPlant && plantDefinition.growHeight > 0) continue;
        incrementObjective(objective);
    }
    updateMissionCompletion();
    return campaignState;
}

export function recordPlantGrowthCompletion(seedId, plantId) {
    if (!campaignState) return null;
    const definitions = getDefinitions();
    const seed = definitions[seedId];
    const plant = definitions[plantId];
    if (!seed?.isSeed || !plant?.isPlant || plant.growHeight <= 0) return campaignState;

    const mission = getCurrentMission();
    for (const objective of mission.objectives) {
        if (objective.type !== 'transformation' || objective.from !== seed.name || objective.to !== plant.name) continue;
        incrementObjective(objective);
    }
    updateMissionCompletion();
    return campaignState;
}

export function recordEnvironmentChange({ temperature, humidity, illumination, dewpoint, windStrength, gustWindStrength } = {}) {
    if (!campaignState) return null;
    const mission = getCurrentMission();
    for (const objective of mission.objectives) {
        if (objective.type !== 'environment-target' || !isCampaignObjectiveUnlocked(objective)) continue;
        const targets = objective.targetValues || mission.environmentTargets;
        if (!targets || Object.keys(targets).length === 0) continue;
        const values = { temperature, humidity, illumination, dewpoint, windStrength, gustWindStrength };
        if (Object.entries(targets).every(([key, target]) => Number.isFinite(values[key]) && values[key] === target)) {
            incrementObjective(objective);
        }
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

function incrementObjective(objective, amount = 1, announce = true) {
    if (campaignState.missionCompleted || !isCampaignObjectiveUnlocked(objective)) return;
    const current = campaignState.objectiveProgress[objective.id] || 0;
    if (current >= objective.target) return;
    const next = Math.min(objective.target, current + amount);
    campaignState.objectiveProgress[objective.id] = next;
    if (next === objective.target) {
        const eventId = `objective:${objective.id}:complete`;
        if (!campaignState.firedEventIds.includes(eventId)) {
            campaignState.firedEventIds.push(eventId);
            announceObjectiveComplete(objective);
            triggerCampaignEvent('objective-complete', { objectiveId: objective.id });
        }
    }
    if (announce) announceCampaignChange();
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
setPlantGrowthCompletionListener(recordPlantGrowthCompletion);
