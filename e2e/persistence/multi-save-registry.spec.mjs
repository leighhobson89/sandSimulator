import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { clickCanvasCell } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus) await attachGameDiagnostics(info, page, 'multi-save-registry');
});

async function enterCampaign(page) {
    await page.reload();
    await page.getByRole('button', { name: 'New Campaign', exact: true }).click();
    await expect(page.locator('#missionIntroDialog')).toBeVisible();
    await page.locator('#missionIntroOk').click();
    await expect(page.locator('#canvasContainer')).toBeVisible();
}

async function advancePastMissionOne(page) {
    await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const objective = campaign.getCurrentMission().objectives[0];
        const definitions = physics.getDefinitions();
        const fromId = definitions.findIndex(definition => definition?.name === objective.from);
        const toId = definitions.findIndex(definition => definition?.name === objective.to);
        if (fromId < 0 || toId < 0) throw new Error('Mission objective references an unknown material.');
        for (let count = 0; count < objective.target; count++) campaign.recordMaterialTransition(fromId, toId);
    });
    await expect(page.locator('#missionCompleteDialog')).toBeVisible();
    await page.locator('#missionCompleteOk').click();
    await page.locator('#missionAdvance').click();
    await expect(page.locator('#missionIntroDialog')).toBeVisible();
    await expect(page.locator('#missionIntroNumber')).toHaveText('2');
}

test('Sandbox save and Campaign ADVANCE checkpoint retain their type and active pointer', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await game.newGame();
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await clickCanvasCell(page, { x: 14, y: 14 });

    const sandbox = await page.evaluate(async () => {
        const saves = await import('/saveLoadGame.js');
        await saves.saveGameToLibrary('Sandbox Workshop');
        const record = saves.listSavedGames().find(entry => entry.name === 'Sandbox Workshop');
        const payload = saves.parseSaveString(record.saveString);
        return { record, activeId: saves.getActiveSaveId(), payload };
    });
    expect(sandbox.record).toMatchObject({ name: 'Sandbox Workshop', type: 'sandbox' });
    expect(sandbox.record.id).toBeTruthy();
    expect(sandbox.record.saveString.length).toBeGreaterThan(20);
    expect(sandbox.payload.mode).toBe('sandbox');
    expect(sandbox.activeId).toBe(sandbox.record.id);

    await enterCampaign(page);
    const campaignsBeforeAdvance = await page.evaluate(async () =>
        (await import('/saveLoadGame.js')).listSavedGames().filter(record => record.type === 'campaign').length);
    expect(campaignsBeforeAdvance).toBe(0);
    await advancePastMissionOne(page);
    const campaign = await page.evaluate(async () => {
        const saves = await import('/saveLoadGame.js');
        const record = saves.listSavedGames().find(entry => entry.type === 'campaign');
        const payload = saves.parseSaveString(record.saveString);
        return {
            record,
            activeId: saves.getActiveSaveId(),
            payload,
            all: saves.listSavedGames()
        };
    });
    expect(campaign.record).toMatchObject({ type: 'campaign' });
    expect(campaign.record.name).toMatch(/Campaign.*Mission 2/i);
    expect(campaign.record.id).toBeTruthy();
    expect(campaign.record.saveString).not.toBe(sandbox.record.saveString);
    expect(campaign.payload.mode).toBe('campaign');
    expect(campaign.payload.missionNumber).toBe(2);
    expect(campaign.payload).not.toHaveProperty('campaign');
    expect(campaign.payload).not.toHaveProperty('simulation');
    expect(campaign.payload).not.toHaveProperty('tools');
    expect(campaign.activeId).toBe(campaign.record.id);
    const namedRecords = campaign.all.filter(record =>
        [campaign.record.name, 'Sandbox Workshop'].includes(record.name));
    expect(namedRecords).toHaveLength(2);
    expect(namedRecords.map(record => record.name).sort()).toEqual([campaign.record.name, 'Sandbox Workshop'].sort());

    const switchedToSandbox = await page.evaluate(async id => {
        const saves = await import('/saveLoadGame.js');
        const payload = await saves.loadSavedGame(id);
        return {
            payload,
            activeId: saves.getActiveSaveId(),
            campaignState: (await import('/campaign.js')).getCampaignState()
        };
    }, sandbox.record.id);
    expect(switchedToSandbox.payload.mode).toBe('sandbox');
    expect(switchedToSandbox.activeId).toBe(sandbox.record.id);
    expect(switchedToSandbox.campaignState).toBeNull();

    const switchedToCampaign = await page.evaluate(async id => {
        const saves = await import('/saveLoadGame.js');
        const payload = await saves.loadSavedGame(id);
        const campaign = await import('/campaign.js');
        return {
            payload,
            activeId: saves.getActiveSaveId(),
            campaignState: campaign.getCampaignState()
        };
    }, campaign.record.id);
    expect(switchedToCampaign.payload.mode).toBe('campaign');
    expect(switchedToCampaign.payload.missionNumber).toBe(2);
    expect(switchedToCampaign.activeId).toBe(campaign.record.id);
    expect(switchedToCampaign.campaignState).toBeNull();

    await page.reload();
    await page.getByRole('button', { name: 'Resume Game', exact: true }).click();
    await expect(page.locator('#missionHud')).toBeVisible();
    expect(await page.evaluate(async () => (await import('/campaign.js')).getCurrentMission().id))
        .toBe('ice-banana');
});

test('starting a new Sandbox keeps an existing campaign save in its own slot', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: 'New Campaign', exact: true }).click();
    await page.locator('#missionIntroOk').click();
    await expect(page.locator('#canvasContainer')).toBeVisible();
    await advancePastMissionOne(page);
    const campaignBefore = await page.evaluate(async () => {
        const saves = await import('/saveLoadGame.js');
        return saves.listSavedGames().find(record => record.type === 'campaign');
    });

    await page.reload();
    await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
    const sizeDialog = page.locator('#worldSizeDialog');
    await expect(sizeDialog).toBeVisible();
    await sizeDialog.getByRole('button', { name: 'Start Game', exact: true }).click();
    await page.getByRole('button', { name: 'Yes, replace it' }).click();
    await expect(page.locator('#canvasContainer')).toBeVisible();

    const savedModes = await page.evaluate(async campaignId => {
        const saves = await import('/saveLoadGame.js');
        const records = saves.listSavedGames();
        return {
            campaign: records.find(record => record.id === campaignId),
            active: records.find(record => record.id === saves.getActiveSaveId()),
            sandboxRecords: records.filter(record => record.type === 'sandbox')
        };
    }, campaignBefore.id);
    expect(savedModes.campaign.saveString).toBe(campaignBefore.saveString);
    expect(savedModes.campaign.type).toBe('campaign');
    expect(savedModes.active.type).toBe('sandbox');
    expect(savedModes.sandboxRecords.length).toBeGreaterThan(0);
});

test('starting a fresh Campaign preserves an older Campaign checkpoint and creates a new record on ADVANCE', async ({ page }) => {
    await page.goto('/?e2e');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: 'New Campaign', exact: true }).click();
    await page.locator('#missionIntroOk').click();
    await advancePastMissionOne(page);

    const olderCheckpoint = await page.evaluate(async () =>
        (await import('/saveLoadGame.js')).listSavedGames().find(record => record.type === 'campaign'));
    expect(olderCheckpoint).toBeTruthy();
    const olderSnapshot = olderCheckpoint.saveString;
    const olderUpdatedAt = olderCheckpoint.updatedAt;

    await page.reload();
    await page.getByRole('button', { name: 'New Campaign', exact: true }).click();
    await expect(page.locator('#missionIntroDialog')).toBeVisible();
    await page.locator('#missionIntroOk').click();
    await expect(page.locator('#missionHud')).toBeVisible();
    const beforeSecondAdvance = await page.evaluate(async () => {
        const saves = await import('/saveLoadGame.js');
        return {
            records: saves.listSavedGames().filter(record => record.type === 'campaign'),
            activeId: saves.getActiveSaveId()
        };
    });
    expect(beforeSecondAdvance.records).toHaveLength(1);
    expect(beforeSecondAdvance.records[0]).toMatchObject({
        id: olderCheckpoint.id, saveString: olderSnapshot, updatedAt: olderUpdatedAt
    });

    await advancePastMissionOne(page);
    const afterSecondAdvance = await page.evaluate(async () => {
        const saves = await import('/saveLoadGame.js');
        return {
            records: saves.listSavedGames().filter(record => record.type === 'campaign'),
            activeId: saves.getActiveSaveId()
        };
    });
    expect(afterSecondAdvance.records).toHaveLength(2);
    const preserved = afterSecondAdvance.records.find(record => record.id === olderCheckpoint.id);
    const fresh = afterSecondAdvance.records.find(record => record.id !== olderCheckpoint.id);
    expect(preserved.saveString).toBe(olderSnapshot);
    expect(preserved.updatedAt).toBe(olderUpdatedAt);
    expect(fresh.type).toBe('campaign');
    expect((await page.evaluate(async id => {
        const saves = await import('/saveLoadGame.js');
        const record = saves.listSavedGames().find(item => item.id === id);
        return saves.parseSaveString(record.saveString);
    }, fresh.id)).missionNumber).toBe(2);
    expect(afterSecondAdvance.activeId).toBe(fresh.id);
});

test('legacy single-slot autosave migrates to an active sandbox record without changing its snapshot', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await game.newGame();

    const legacySave = await page.evaluate(async () => {
        const saves = await import('/saveLoadGame.js');
        const codec = await import('/lzString.js');
        const payload = saves.parseSaveString(saves.createSaveString());
        payload.version = 2;
        delete payload.mode;
        delete payload.campaign;
        return codec.compressToEncodedURIComponent(JSON.stringify(payload));
    });
    await page.locator('#autosaveToggle').uncheck();
    await page.evaluate(snapshot => {
        localStorage.clear();
        localStorage.setItem('elemental-foundry.autosave.v1', snapshot);
    }, legacySave);
    await page.reload();

    await expect(page.getByRole('button', { name: 'Resume Game', exact: true })).toBeVisible();
    const migrated = await page.evaluate(async () => {
        const saves = await import('/saveLoadGame.js');
        return {
            records: saves.listSavedGames(),
            activeId: saves.getActiveSaveId(),
            legacySlot: localStorage.getItem('elemental-foundry.autosave.v1')
        };
    });
    const sandbox = migrated.records.find(record => record.type === 'sandbox');
    expect(sandbox).toBeTruthy();
    expect(sandbox.saveString).toBe(legacySave);
    expect(migrated.activeId).toBe(sandbox.id);
    expect(migrated.legacySlot).toBeNull();

    await page.getByRole('button', { name: 'Resume Game', exact: true }).click();
    await expect(page.locator('#canvasContainer')).toBeVisible();
    expect(await page.evaluate(async () => (await import('/campaign.js')).getCampaignState())).toBeNull();
});
