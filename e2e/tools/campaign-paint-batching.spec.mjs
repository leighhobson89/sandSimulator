import { expect, test } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus) await attachGameDiagnostics(info, page, 'campaign-paint-batching');
});

async function startSandbox(page) {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    return game;
}

test('a large Mission 6 brush defers world-state scanning and campaign refresh until the paint finishes', async ({ page }) => {
    await startSandbox(page);
    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const campaign = await import('/campaign.js');
        const globals = await import('/constantsAndGlobalVars.js');
        const game = await import('/game.js');

        physics.clearWorld();
        const definitions = physics.getDefinitions();
        const idFor = name => definitions.findIndex(definition => definition?.name === name);
        const woodId = idFor('Wood');
        const fireId = idFor('Fire');
        const smokeId = idFor('Smoke');
        const waterId = idFor('Water');
        campaign.startCampaign('controlled-burn');
        campaign.consumeCampaignMaterial('Fire');
        for (let frame = 0; frame < 60; frame++) campaign.recordCampaignSimulationStep();
        campaign.recordMaterialTransition(fireId, smokeId, { cause: 'water' });
        physics.setCell(2, 2, woodId);
        physics.setCell(3, 2, fireId);
        globals.setParticleTypeIdSelected(waterId);
        globals.setBrushSize(31);

        let stateNotifications = 0;
        window.addEventListener('campaign-state-change', () => stateNotifications++);
        window.__P0_PERF__ = {
            enabled: true,
            events: [],
            record(name, durationMs, counters = {}) { this.events.push({ name, durationMs, counters }); },
            reset() { this.events.length = 0; },
            snapshot() { return this.events.slice(); }
        };

        const scansBefore = window.__P0_PERF__.events.length;
        game.paintCell(40, 40);
        const scanEvents = window.__P0_PERF__.events.slice(scansBefore)
            .filter(event => event.name === 'campaignWorldStateObjectiveScan');
        const waterCells = physics.getWorld().type.reduce((count, id) => count + (id === waterId ? 1 : 0), 0);
        const state = campaign.getCampaignState();
        return {
            stateNotifications,
            scanEvents,
            waterCells,
            waterUsed: state.resources.materials.Water.used,
            quenchProgress: state.objectiveProgress['quench-with-water'],
            worldStateProgress: state.objectiveProgress['confirm-fire-out'],
            pendingWorldStateObjectives: campaign.getCurrentMission().objectives
                .filter(objective => objective.type === 'world-state' &&
                    state.objectiveProgress[objective.id] < objective.target).length
        };
    });

    expect(result.pendingWorldStateObjectives).toBe(1);
    expect(result.worldStateProgress).toBe(0);
    expect(result.waterCells).toBe(709);
    expect(result.waterUsed).toBe(709);
    expect(result.quenchProgress).toBe(1);
    expect(result.stateNotifications).toBe(1);
    expect(result.scanEvents).toHaveLength(1);
    expect(result.scanEvents[0].counters).toMatchObject({ worldCells: 260 * 150, pendingObjectives: 1 });
});

test('a large campaign brush stops exactly at its finite material budget', async ({ page }) => {
    await startSandbox(page);
    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const campaign = await import('/campaign.js');
        const globals = await import('/constantsAndGlobalVars.js');
        const game = await import('/game.js');

        physics.clearWorld();
        campaign.startCampaign('first-thaw');
        const dryMudId = physics.getDefinitions().findIndex(definition => definition?.name === 'Dry Mud');
        globals.setParticleTypeIdSelected(dryMudId);
        globals.setBrushSize(31);
        game.paintCell(50, 50);
        const state = campaign.getCampaignState();
        const resource = state.resources.materials['Dry Mud'];
        const world = physics.getWorld();
        return {
            placed: world.type.reduce((count, id) => count + (id === dryMudId ? 1 : 0), 0),
            used: resource.used,
            remaining: resource.remaining,
            limit: resource.limit
        };
    });

    expect(result.limit).toBe(100);
    expect(result.placed).toBe(100);
    expect(result.used).toBe(100);
    expect(result.remaining).toBe(0);
});

test('Campaign line and filled-shape operations each finalize one shared placement batch', async ({ page }) => {
    await startSandbox(page);
    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const campaign = await import('/campaign.js');
        const globals = await import('/constantsAndGlobalVars.js');
        const game = await import('/game.js');

        physics.clearWorld();
        campaign.startCampaign('three-states');
        const sandId = physics.getDefinitions().findIndex(definition => definition?.name === 'Sand');
        globals.setParticleTypeIdSelected(sandId);
        globals.setBrushSize(1);

        let stateNotifications = 0;
        const onCampaignChange = () => stateNotifications++;
        window.addEventListener('campaign-state-change', onCampaignChange);
        game.paintLine(20, 20, 27, 20);
        const lineNotifications = stateNotifications;
        stateNotifications = 0;
        game.paintShape('rectangle', 40, 30, 49, 39);
        window.removeEventListener('campaign-state-change', onCampaignChange);

        const state = campaign.getCampaignState();
        return {
            lineNotifications,
            shapeNotifications: stateNotifications,
            objectiveProgress: state.objectiveProgress['place-sand'],
            sandUsed: state.resources.materials.Sand.used,
            sandCells: physics.getWorld().type.reduce((count, id) => count + (id === sandId ? 1 : 0), 0)
        };
    });

    expect(result.lineNotifications).toBe(1);
    expect(result.shapeNotifications).toBe(1);
    expect(result.objectiveProgress).toBe(108);
    expect(result.sandUsed).toBe(108);
    expect(result.sandCells).toBe(108);
});
