import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus) await attachGameDiagnostics(info, page, 'campaign-checkpoint-controls');
});

async function enterMissionTwo(page) {
    await page.goto('/?e2e');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: 'New Campaign', exact: true }).click();
    await expect(page.locator('#missionIntroDialog')).toBeVisible();
    await page.locator('#missionIntroOk').click();
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
    await page.locator('#missionCompleteOk').click();
    await page.locator('#missionAdvance').click();
    await expect(page.locator('#missionIntroDialog')).toBeVisible();
    await expect(page.locator('#missionIntroNumber')).toHaveText('2');
    await page.locator('#missionIntroOk').click();
    await expect(page.locator('#missionHud')).toBeVisible();
}

async function readCheckpoint(page) {
    return page.evaluate(async () => {
        const saves = await import('/saveLoadGame.js');
        const record = saves.listSavedGames().find(item => item.type === 'campaign');
        return record ? { record, payload: saves.parseSaveString(record.saveString) } : null;
    });
}

test('Mission 2 restart restores its authored world without changing the ADVANCE checkpoint', async ({ page }) => {
    await enterMissionTwo(page);
    const checkpoint = await readCheckpoint(page);
    expect(checkpoint?.payload).toMatchObject({ mode: 'campaign', missionNumber: 2 });

    await page.locator('#pauseButton').click();
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const campaign = await import('/campaign.js');
        const definitions = physics.getDefinitions();
        const idFor = name => definitions.findIndex(definition => definition?.name === name);
        physics.setCell(20, 20, idFor('Banana Plant'));
        campaign.consumeCampaignMaterial('Dry Mud', 7);
        campaign.recordMaterialTransition(idFor('Dry Mud'), idFor('Wet Mud'));
        for (const [selector, value] of [['#airTemp', '30'], ['#baseHumidity', '95'], ['#ambientIllumination', '85']]) {
            const input = document.querySelector(selector);
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });

    await page.locator('#restartMissionButton').click();
    await expect(page.locator('#missionRestartDialog')).toBeVisible();
    await expect(page.locator('#missionRestartDialog')).toHaveRole('dialog');
    await page.locator('#cancelRestartMission').click();
    await expect(page.locator('#missionRestartDialog')).toBeHidden();
    const afterCancel = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const bananaPlantId = definitions.findIndex(definition => definition?.name === 'Banana Plant');
        return {
            mission: campaign.getCurrentMission().id,
            resources: campaign.getCampaignState().resources.materials['Dry Mud'],
            progress: campaign.getCampaignState().objectiveProgress['wet-mud'],
            world: physics.getWorld().type.reduce((count, id) => count + (id === bananaPlantId ? 1 : 0), 0),
            checkpoint: (await import('/saveLoadGame.js')).listSavedGames().find(item => item.type === 'campaign').saveString
        };
    });
    expect(afterCancel.mission).toBe('ice-banana');
    expect(afterCancel.resources.used).toBe(7);
    expect(afterCancel.progress).toBe(1);
    expect(afterCancel.world).toBeGreaterThan(0);
    expect(afterCancel.checkpoint).toBe(checkpoint.record.saveString);

    await page.locator('#restartMissionButton').click();
    await page.locator('#confirmRestartMission').click();
    await expect(page.locator('#missionRestartDialog')).toBeHidden();
    const restarted = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const mission = campaign.getCurrentMission();
        const state = campaign.getCampaignState();
        const world = physics.getWorld();
        const definitions = physics.getDefinitions();
        const iceId = definitions.findIndex(definition => definition?.name === 'Ice');
        const iceCount = world.type.reduce((count, id) => count + (id === iceId ? 1 : 0), 0);
        const simulation = physics.captureSimulationState();
        const record = (await import('/saveLoadGame.js')).listSavedGames().find(item => item.type === 'campaign');
        return { mission, state, cols: world.cols, rows: world.rows, iceCount, simulation, record };
    });
    expect(restarted.mission.id).toBe('ice-banana');
    expect(restarted.cols).toBe(260);
    expect(restarted.rows).toBe(150);
    expect(restarted.iceCount).toBe(260 * 5);
    expect(restarted.simulation.ambientTarget).toBe(-10);
    expect(restarted.simulation.ambientHumidity).toBe(35);
    expect(restarted.simulation.ambientIllumination).toBe(10);
    expect(restarted.state.resources.materials['Dry Mud']).toEqual({ limit: 500, used: 0, remaining: 500 });
    expect(restarted.state.resources.materials['Banana Seeds']).toEqual({ limit: 5, used: 0, remaining: 5 });
    expect(Object.values(restarted.state.objectiveProgress)).toEqual([0, 0, 0, 0]);
    expect(restarted.state.firedEventIds).toEqual([]);
    expect(restarted.state.missionCompleted).not.toBe(true);
    expect(restarted.record.saveString).toBe(checkpoint.record.saveString);
    expect((await readCheckpoint(page)).payload.missionNumber).toBe(2);
});

test('Campaign catalog expands only supplied categories and locks empty groups with a focusable reason', async ({ page }) => {
    await enterMissionTwo(page);

    for (const name of ['Dry Mud', 'Banana Seeds']) {
        await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name, exact: true })).not.toHaveAttribute('data-campaign-disabled', 'true');
    }
    for (const name of ['Water', 'Sand', 'Daffodil Seeds', 'Banana Plant']) {
        await expect(page.getByRole('button', { name, exact: true }), `${name} is not visible in Mission 2`).toBeHidden();
    }

    const toggles = page.locator('#particleButtons .panel-heading-toggle');
    const categories = await toggles.evaluateAll(elements => elements.map(toggle => {
        const grid = document.getElementById(toggle.getAttribute('aria-controls'));
        return {
            name: toggle.querySelector('span:first-child')?.textContent.trim(),
            expanded: toggle.getAttribute('aria-expanded'),
            locked: toggle.closest('.panel-heading')?.dataset.campaignCategoryLocked === 'true',
            gridHidden: grid?.hidden,
            buttonCount: grid?.querySelectorAll('.particle-button').length || 0
        };
    }));
    for (const available of ['Powders', 'Seeds']) {
        const category = categories.find(item => item.name === available);
        expect(category).toMatchObject({ expanded: 'true', locked: false, gridHidden: false });
        expect(category.buttonCount).toBeGreaterThan(0);
    }
    const emptyCategory = page.locator('#particleButtons .panel-heading[data-campaign-category-locked="true"]')
        .filter({ has: page.locator('.panel-heading-toggle[aria-controls="particleGroup-liquids"]') });
    await expect(emptyCategory).toHaveCount(1);
    const emptyToggle = emptyCategory.locator('.panel-heading-toggle');
    const arrow = emptyToggle.locator('[data-campaign-category-arrow]');
    await expect(emptyToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(emptyToggle).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#particleGroup-liquids')).toBeHidden();
    await expect(arrow).toHaveAttribute('aria-hidden', 'true');
    await expect(arrow).toHaveAttribute('data-campaign-category-arrow', '');
    await emptyToggle.hover();
    await expect(page.locator('#toolTooltip')).toBeVisible();
    await expect(page.locator('#toolTooltip')).toContainText('No items available in this mission.');
    await expect(page.locator('#toolTooltip .tool-tooltip-disabled')).toHaveText('DISABLED');
    await page.locator('#canvas').hover({ position: { x: 10, y: 10 } });
    await expect(page.locator('#toolTooltip')).toBeHidden();
    expect(await page.locator('#toolTooltip').evaluate(element => getComputedStyle(element).display)).toBe('none');
    await emptyToggle.focus();
    await expect(emptyToggle).toBeFocused();
    await expect(page.locator('#toolTooltip')).toBeVisible();
    await expect(page.locator('#toolTooltip')).toContainText('No items available in this mission.');
    await emptyToggle.dispatchEvent('click');
    await expect(page.locator('#particleGroup-liquids')).toBeHidden();
});

test('Sandbox restores the full catalog and normal Save to Library controls', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await game.newGame();

    for (const name of ['Water', 'Sand', 'Dry Mud', 'Daffodil Seeds', 'Banana Seeds']) {
        const material = page.getByRole('button', { name, exact: true });
        await expect(material).toBeAttached();
        await expect(material).not.toHaveAttribute('data-campaign-disabled', 'true');
    }
    expect(await page.locator('[data-campaign-category-locked="true"]').count()).toBe(0);
    await expect(page.locator('#particleGroup-liquids')).toBeVisible();
    await expect(page.locator('#particleGroup-powders')).toBeVisible();
    await expect(page.locator('#exportGame')).toBeEnabled();
    await expect(page.locator('#autosaveToggle')).toBeEnabled();

    await page.locator('#exportGame').click();
    await expect(page.locator('#saveDialog')).toBeVisible();
    const librarySave = page.locator('#saveToLibraryButton, #saveToLibrary').first();
    await expect(librarySave).toBeEnabled();
    await page.locator('#librarySaveName').fill('Sandbox checkpoint regression');
    await librarySave.click();
    const saved = await page.evaluate(async () =>
        (await import('/saveLoadGame.js')).listSavedGames().find(item => item.name === 'Sandbox checkpoint regression'));
    expect(saved).toMatchObject({ name: 'Sandbox checkpoint regression', type: 'sandbox' });
});
