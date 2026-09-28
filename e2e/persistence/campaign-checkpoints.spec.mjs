import { test, expect } from '@playwright/test';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

const AUTOSAVE_KEY = 'elemental-foundry.autosave.v1';

test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus) await attachGameDiagnostics(info, page, 'campaign-checkpoints');
});

async function startFirstMission(page) {
    await page.goto('/?e2e');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: 'New Campaign', exact: true }).click();
    await expect(page.locator('#missionIntroDialog')).toBeVisible();
    await page.locator('#missionIntroOk').click();
    await expect(page.locator('#missionHud')).toBeVisible();
}

async function completeMissionOne(page) {
    await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const objective = campaign.getCurrentMission().objectives[0];
        const definitions = physics.getDefinitions();
        const fromId = definitions.findIndex(definition => definition?.name === objective.from);
        const toId = definitions.findIndex(definition => definition?.name === objective.to);
        for (let count = 0; count < objective.target; count++) campaign.recordMaterialTransition(fromId, toId);
    });
    await expect(page.locator('#missionCompleteDialog')).toBeVisible();
}

async function campaignRecords(page) {
    return page.evaluate(async () => (await import('/saveLoadGame.js')).listSavedGames()
        .filter(record => record.type === 'campaign'));
}

test('Campaign writes its first minimal checkpoint only on ADVANCE and blocks in-mission saves', async ({ page }) => {
    await startFirstMission(page);

    const initial = await page.evaluate(async () => {
        const saves = await import('/saveLoadGame.js');
        return {
            records: saves.listSavedGames(),
            activeId: saves.getActiveSaveId(),
            autosaveEnabled: saves.isAutosaveEnabled(),
            autosaveWrite: await saves.writeAutosave(),
            legacySlot: localStorage.getItem('elemental-foundry.autosave.v1')
        };
    });
    expect(initial.records.filter(record => record.type === 'campaign')).toHaveLength(0);
    expect(initial.activeId).toBeFalsy();
    expect(initial.autosaveEnabled).toBe(false);
    expect(initial.autosaveWrite).toBe(false);
    expect(initial.legacySlot).toBeNull();
    await expect(page.locator('#resumeGame')).toBeHidden();
    await expect(page.locator('#exportGame')).toBeDisabled();
    await expect(page.locator('#saveToLibraryButton, #saveToLibrary').first()).toBeDisabled();

    await completeMissionOne(page);
    expect(await campaignRecords(page)).toHaveLength(0);
    await page.locator('#missionCompleteOk').click();
    expect(await campaignRecords(page)).toHaveLength(0);

    await page.locator('#missionAdvance').click();
    await expect(page.locator('#missionIntroDialog')).toBeVisible();
    const firstCheckpoint = await page.evaluate(async () => {
        const saves = await import('/saveLoadGame.js');
        const record = saves.listSavedGames().find(item => item.type === 'campaign');
        return record ? { record, payload: saves.parseSaveString(record.saveString) } : null;
    });
    expect(firstCheckpoint).toBeTruthy();
    expect(firstCheckpoint.payload).toMatchObject({ mode: 'campaign', missionNumber: 2 });
    for (const property of [
        'simulation', 'tools', 'blueprints', 'campaign', 'campaignId', 'missionId',
        'objectiveProgress', 'objectives', 'resources', 'firedEventIds', 'missionCompleted',
        'recapDismissed', 'pendingMissionId'
    ]) expect(firstCheckpoint.payload).not.toHaveProperty(property);

    await page.locator('#missionIntroOk').click();
    await expect(page.locator('#missionHud')).toBeVisible();
    const afterMissionStart = await page.evaluate(async () => {
        const saves = await import('/saveLoadGame.js');
        const result = await saves.writeAutosave();
        const record = saves.listSavedGames().find(item => item.type === 'campaign');
        return {
            enabled: saves.isAutosaveEnabled(),
            result,
            record,
            activeId: saves.getActiveSaveId()
        };
    });
    expect(afterMissionStart.enabled).toBe(false);
    expect(afterMissionStart.result).toBe(false);
    expect(afterMissionStart.record.saveString).toBe(firstCheckpoint.record.saveString);
    expect(afterMissionStart.record.updatedAt).toBe(firstCheckpoint.record.updatedAt);
    expect(afterMissionStart.activeId).toBe(firstCheckpoint.record.id);
    await expect(page.locator('#exportGame')).toBeDisabled();
    await expect(page.locator('#saveToLibraryButton, #saveToLibrary').first()).toBeDisabled();
    await expect(page.locator('#pauseButton')).toBeEnabled();
    await expect(page.locator('#importGame')).toBeEnabled();

    await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const idFor = name => definitions.findIndex(definition => definition?.name === name);
        physics.setCell(20, 20, idFor('Banana Plant'));
        campaign.consumeCampaignMaterial('Dry Mud', 12);
        campaign.recordMaterialTransition(idFor('Dry Mud'), idFor('Wet Mud'));
        for (const [selector, value] of [['#airTemp', '30'], ['#baseHumidity', '95'], ['#ambientIllumination', '85']]) {
            const input = document.querySelector(selector);
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Resume Game', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Resume Game', exact: true }).click();
    await expect(page.locator('#canvasContainer')).toBeVisible();
    await expect(page.locator('#missionHud')).toBeVisible();
    const recordAfterResume = await page.evaluate(async () =>
        (await import('/saveLoadGame.js')).listSavedGames().find(record => record.type === 'campaign'));
    expect(recordAfterResume.saveString).toBe(firstCheckpoint.record.saveString);
    expect(recordAfterResume.updatedAt).toBe(firstCheckpoint.record.updatedAt);
    const resumed = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const state = campaign.getCampaignState();
        const world = physics.getWorld();
        const definitions = physics.getDefinitions();
        const idFor = name => definitions.findIndex(definition => definition?.name === name);
        const iceId = idFor('Ice');
        return {
            mission: campaign.getCurrentMission().id,
            iceCount: world.type.reduce((count, id) => count + (id === iceId ? 1 : 0), 0),
            cols: world.cols,
            rows: world.rows,
            resources: state.resources,
            objectiveProgress: state.objectiveProgress,
            firedEventIds: state.firedEventIds,
            simulation: physics.captureSimulationState()
        };
    });
    expect(resumed.mission).toBe('ice-banana');
    expect(resumed.cols).toBe(260);
    expect(resumed.rows).toBe(150);
    expect(resumed.iceCount).toBe(260 * 5);
    expect(resumed.resources.materials['Dry Mud']).toEqual({ limit: 500, used: 0, remaining: 500 });
    expect(resumed.resources.materials['Banana Seeds']).toEqual({ limit: 1, used: 0, remaining: 1 });
    expect(Object.values(resumed.objectiveProgress)).toEqual([0, 0, 0, 0]);
    expect(resumed.firedEventIds).toEqual([]);
    expect(resumed.simulation.ambientTarget).toBe(-10);
    expect(resumed.simulation.ambientHumidity).toBe(35);
    expect(resumed.simulation.ambientIllumination).toBe(10);
});

test('legacy full Campaign v3 autosave migrates to a mission-number checkpoint and resumes pristine', async ({ page }) => {
    await page.goto('/?e2e');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
    await page.locator('#worldSizeStart').click();
    await expect(page.locator('#canvasContainer')).toBeVisible();

    const legacyCampaignSave = await page.evaluate(async () => {
        const saves = await import('/saveLoadGame.js');
        const codec = await import('/lzString.js');
        const physics = await import('/physics.js');
        const campaign = await import('/campaign.js');
        const definitions = physics.getDefinitions();
        const idFor = name => definitions.findIndex(definition => definition?.name === name);
        physics.setCell(18, 18, idFor('Banana Plant'));
        const payload = saves.parseSaveString(saves.createSaveString());
        campaign.startCampaign('ice-banana');
        campaign.consumeCampaignMaterial('Dry Mud', 23);
        campaign.recordMaterialTransition(idFor('Ice'), idFor('Water'));
        campaign.recordEnvironmentChange({ temperature: 30, humidity: 95, illumination: 85 });
        payload.mode = 'campaign';
        payload.campaign = structuredClone(campaign.getCampaignState());
        return codec.compressToEncodedURIComponent(JSON.stringify(payload));
    });
    const legacyFixture = await page.evaluate(async value => {
        const saves = await import('/saveLoadGame.js');
        const payload = saves.parseSaveString(value);
        return {
            version: payload.version,
            mode: payload.mode,
            missionId: payload.campaign.missionId,
            objectiveProgress: payload.campaign.objectiveProgress,
            dryMudUsed: payload.campaign.resources.materials['Dry Mud'].used,
            simulationHasWorld: !!payload.simulation.arrays.type
        };
    }, legacyCampaignSave);
    expect(legacyFixture).toMatchObject({ version: 3, mode: 'campaign', missionId: 'ice-banana', dryMudUsed: 23, simulationHasWorld: true });
    expect(Object.values(legacyFixture.objectiveProgress).some(value => value > 0)).toBe(true);

    await page.evaluate(({ key, save }) => {
        localStorage.clear();
        localStorage.setItem(key, save);
    }, { key: AUTOSAVE_KEY, save: legacyCampaignSave });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Resume Game', exact: true })).toBeVisible();

    const migrated = await page.evaluate(async () => {
        const saves = await import('/saveLoadGame.js');
        const record = saves.listSavedGames().find(item => item.type === 'campaign');
        return {
            record,
            payload: record ? saves.parseSaveString(record.saveString) : null,
            autosave: localStorage.getItem('elemental-foundry.autosave.v1')
        };
    });
    expect(migrated.record).toBeTruthy();
    expect(migrated.payload).toMatchObject({ mode: 'campaign', missionNumber: 2 });
    for (const property of ['simulation', 'tools', 'campaign', 'objectiveProgress', 'resources', 'firedEventIds']) {
        expect(migrated.payload).not.toHaveProperty(property);
    }
    if (migrated.autosave) {
        const autosavePayload = await page.evaluate(async value =>
            (await import('/saveLoadGame.js')).parseSaveString(value), migrated.autosave);
        expect(autosavePayload).toMatchObject({ mode: 'campaign', missionNumber: 2 });
        for (const property of ['simulation', 'tools', 'campaign', 'objectiveProgress', 'resources']) {
            expect(autosavePayload).not.toHaveProperty(property);
        }
    }

    await page.getByRole('button', { name: 'Resume Game', exact: true }).click();
    await expect(page.locator('#canvasContainer')).toBeVisible();
    await expect(page.locator('#missionHud')).toBeVisible();
    const resumed = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const mission = campaign.getCurrentMission();
        const state = campaign.getCampaignState();
        const world = physics.getWorld();
        const definitions = physics.getDefinitions();
        const idFor = name => definitions.findIndex(definition => definition?.name === name);
        const iceId = idFor('Ice');
        const bananaPlantId = idFor('Banana Plant');
        const iceFloor = Array.from({ length: 5 }, (_, offset) => {
            const y = world.rows - 5 + offset;
            return Array.from({ length: world.cols }, (_, x) => world.type[y * world.cols + x] === iceId).every(Boolean);
        });
        return {
            mission: mission.id,
            world: { cols: world.cols, rows: world.rows },
            iceCount: world.type.reduce((count, id) => count + (id === iceId ? 1 : 0), 0),
            bananaPlantCount: world.type.reduce((count, id) => count + (id === bananaPlantId ? 1 : 0), 0),
            iceFloor,
            resources: state.resources,
            objectiveProgress: state.objectiveProgress,
            firedEventIds: state.firedEventIds,
            missionCompleted: state.missionCompleted,
            simulation: physics.captureSimulationState()
        };
    });
    expect(resumed.mission).toBe('ice-banana');
    expect(resumed.world).toEqual({ cols: 260, rows: 150 });
    expect(resumed.iceCount).toBe(260 * 5);
    expect(resumed.bananaPlantCount).toBe(0);
    expect(resumed.iceFloor).toEqual([true, true, true, true, true]);
    expect(resumed.resources.materials['Dry Mud']).toEqual({ limit: 500, used: 0, remaining: 500 });
    expect(resumed.resources.materials['Banana Seeds']).toEqual({ limit: 1, used: 0, remaining: 1 });
    expect(Object.values(resumed.objectiveProgress)).toEqual([0, 0, 0, 0]);
    expect(resumed.firedEventIds).toEqual([]);
    expect(resumed.missionCompleted).not.toBe(true);
    expect(resumed.simulation.ambientTarget).toBe(-10);
    expect(resumed.simulation.ambientHumidity).toBe(35);
    expect(resumed.simulation.ambientIllumination).toBe(10);
});
