import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus) await attachGameDiagnostics(info, page, 'campaign-progression');
});

async function startFirstMission(page) {
    await page.goto('/?e2e');
    await page.evaluate(() => localStorage.clear());
    await page.getByRole('button', { name: 'New Campaign', exact: true }).click();
    await expect(page.locator('#missionIntroDialog')).toBeVisible();
    await page.locator('#missionIntroOk').click();
}

async function completeFirstMission(page) {
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
}

async function openMissionTwoBriefing(page) {
    await startFirstMission(page);
    await completeFirstMission(page);
    await page.locator('#missionCompleteOk').click();
    await expect(page.locator('#missionCompleteDialog')).toBeHidden();
    await page.locator('#missionAdvance').click();
    await expect(page.locator('#missionIntroDialog')).toBeVisible();
    await expect(page.locator('#missionIntroNumber')).toHaveText('2');
}

async function expectDisabledTooltip(page, triggerOrSelector, expectedCopy) {
    const trigger = typeof triggerOrSelector === 'string' ? page.locator(triggerOrSelector) : triggerOrSelector;
    await trigger.hover();
    const tooltip = page.locator('#toolTooltip');
    await expect(tooltip).toBeVisible();
    const disabled = tooltip.locator('.tool-tooltip-disabled');
    await expect(disabled).toHaveText('DISABLED');
    await expect(tooltip).toContainText(expectedCopy);
    const style = await disabled.evaluate(element => {
        const computed = getComputedStyle(element);
        const rgb = computed.color.match(/[\d.]+/g)?.map(Number) || [];
        return { weight: Number(computed.fontWeight), rgb };
    });
    expect(style.weight).toBeGreaterThanOrEqual(600);
    expect(style.rgb.length).toBeGreaterThanOrEqual(3);
    expect(style.rgb[0]).toBeGreaterThan(style.rgb[1]);
    expect(style.rgb[0]).toBeGreaterThan(style.rgb[2]);

    await trigger.evaluate(element => element.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
    await expect(tooltip.locator('.tool-tooltip-disabled')).toHaveText('DISABLED');
    await expect(tooltip).toContainText(expectedCopy);
    await expect(tooltip).toBeVisible();
}

async function expectNoDisabledTooltip(page, selector) {
    const control = page.locator(selector);
    await control.evaluate(element => element.dispatchEvent(new MouseEvent('mouseenter')));
    await expect(page.locator('#toolTooltip')).toBeVisible();
    await expect(page.locator('#toolTooltip .tool-tooltip-disabled')).toHaveCount(0);
}

test('Mission 1 recap reports objective and supplies; ADVANCE opens Mission 2 with its Ice scenario', async ({ page }) => {
    await startFirstMission(page);
    const firstObjective = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        return campaign.getCurrentMission().objectives[0];
    });
    await completeFirstMission(page);
    await expect(page.locator('#missionCompleteStats')).toContainText(firstObjective.label);
    await expect(page.locator('#missionCompleteStats')).toContainText('Dry Mud');
    await expect(page.locator('#missionCompleteStats')).toContainText(/0\s*\/\s*100/);
    const recapText = (await page.locator('#missionCompleteStats').innerText()).replace(/\s+/g, ' ');
    expect(recapText).toMatch(/used/i);
    expect(recapText).toMatch(/total/i);
    expect(recapText).toMatch(/remaining/i);

    await page.locator('#missionCompleteOk').click();
    await expect(page.locator('#missionCompleteDialog')).toBeHidden();
    await page.locator('#missionAdvance').click();
    await expect(page.locator('#missionIntroDialog')).toBeVisible();
    await expect(page.locator('#missionIntroNumber')).toHaveText('2');
    await expect(page.locator('#missionIntroGuidance')).toContainText(/ice/i);
    await expect(page.locator('#missionIntroGuidance')).toContainText(/banana/i);
    await expect(page.locator('#missionIntroGuidance')).toContainText(/30/);
    await expect(page.locator('#missionIntroGuidance')).toContainText(/95/);
    await expect(page.locator('#missionIntroGuidance')).toContainText(/85/);
    await expect(page.locator('#missionIntroGuidance')).toContainText(/Temperature slider/i);
    await expect(page.locator('#missionIntroGuidance')).toContainText(/Humidity slider/i);
    await expect(page.locator('#missionIntroGuidance')).toContainText(/Ambient Light slider/i);
    await expect(page.locator('#missionIntroGuidance')).toContainText(/mission target/i);
    await expect(page.locator('#missionIntroResources')).toContainText('500');
    await expect(page.locator('#missionIntroResources')).toContainText('Banana Seeds');
    await expect(page.locator('#missionIntroObjectives')).toContainText(/Ice/i);
    await expect(page.locator('#missionIntroObjectives')).toContainText(/Wet Mud/i);
    await expect(page.locator('#missionIntroObjectives')).toContainText(/Banana/i);
    const missionDefinition = await page.evaluate(async () => (await import('/campaign.js')).getPendingMission());
    expect(missionDefinition.number).toBe(2);
    expect(missionDefinition.id).toBe('ice-banana');
    expect(missionDefinition.environmentTargets).toEqual({ temperature: 30, humidity: 95, illumination: 85 });
    expect(missionDefinition.controlLimits).toMatchObject({ temperature: { max: 30 } });
    await page.locator('#missionIntroOk').click();

    const scenario = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const mission = campaign.getCurrentMission();
        const world = physics.getWorld();
        const definitions = physics.getDefinitions();
        const ids = Object.fromEntries(['Ice', 'Dry Mud', 'Banana Seeds'].map(name =>
            [name, definitions.findIndex(definition => definition?.name === name)]));
        const counts = Object.fromEntries(Object.entries(ids).map(([name, id]) =>
            [name, world.type.reduce((count, value) => count + (value === id ? 1 : 0), 0)]));
        const iceFloor = Array.from({ length: 5 }, (_, offset) => {
            const y = world.rows - 5 + offset;
            return Array.from({ length: world.cols }, (_, x) => world.type[y * world.cols + x] === ids.Ice).every(Boolean);
        });
        const iceOutsideFloor = world.type.reduce((count, value, index) =>
            count + (value === ids.Ice && Math.floor(index / world.cols) < world.rows - 5 ? 1 : 0), 0);
        const simulation = physics.captureSimulationState();
        return { mission, counts, cols: world.cols, rows: world.rows, iceFloor, iceOutsideFloor, simulation };
    });

    expect(scenario.mission.number).toBe(2);
    expect(scenario.mission.world).toEqual({ cols: 260, rows: 150 });
    expect(scenario.mission.startingLayout).toMatchObject({ type: 'floor', material: 'Ice', rows: 5 });
    expect(scenario.mission.resourceBudgets.materials).toEqual({ 'Dry Mud': 500, 'Banana Seeds': 5 });
    expect(scenario.mission.environment).toMatchObject({
        temperature: -10, humidity: 35, illumination: 10, dewpoint: -15,
        ambientWindOn: false, windStrength: 0, gustWindStrength: 0
    });
    expect(scenario.mission.environmentTargets).toEqual({ temperature: 30, humidity: 95, illumination: 85 });
    expect(scenario.mission.controlLimits).toMatchObject({ temperature: { max: 30 } });
    expect(scenario.mission.objectives).toContainEqual(expect.objectContaining({
        type: 'transformation', from: 'Ice', to: 'Water', target: 1
    }));
    expect(scenario.mission.objectives).toContainEqual(expect.objectContaining({
        type: 'transformation', from: 'Dry Mud', to: 'Wet Mud', target: 1
    }));
    expect(scenario.mission.objectives).toContainEqual(expect.objectContaining({
        type: 'transformation', from: 'Banana Seeds', to: 'Banana Plant', target: 1
    }));
    expect(scenario.mission.objectives.some(objective => objective.type === 'environment-target')).toBe(true);
    expect(scenario.counts.Ice).toBe(260 * 5);
    expect(scenario.counts['Dry Mud'] || 0).toBe(0);
    expect(scenario.counts['Banana Seeds'] || 0).toBe(0);
    expect(scenario.cols).toBe(260);
    expect(scenario.rows).toBe(150);
    expect(scenario.iceFloor).toEqual([true, true, true, true, true]);
    expect(scenario.iceOutsideFloor).toBe(0);
    expect(scenario.simulation.ambientTarget).toBe(-10);
    expect(scenario.simulation.ambientHumidity).toBe(35);
    expect(scenario.simulation.ambientIllumination).toBe(10);
    await expect(page.locator('#missionIntroGuidance')).toContainText(/30/);
    await expect(page.locator('#missionIntroGuidance')).toContainText(/95/);
    await expect(page.locator('#missionIntroGuidance')).toContainText(/85/);
});

test('Mission 2 keeps required climate controls available and explains disabled mission controls', async ({ page }) => {
    await openMissionTwoBriefing(page);
    await page.locator('#missionIntroOk').click();
    await expect(page.locator('#missionHud')).toBeVisible();

    const seedRetries = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        return {
            fiveAvailable: campaign.canUseMaterial('Banana Seeds', 5),
            sixthUnavailable: !campaign.canUseMaterial('Banana Seeds', 6)
        };
    });
    expect(seedRetries).toEqual({ fiveAvailable: true, sixthUnavailable: true });

    for (const selector of ['#airTemp', '#baseHumidity', '#ambientIllumination']) {
        await expect(page.locator(selector), `${selector} remains available to reach the Banana targets`).toBeEnabled();
        await expect(page.locator(selector)).not.toHaveAttribute('data-campaign-disabled', 'true');
    }
    await expect(page.locator('#airTemp')).toHaveAttribute('max', '30');
    await expect(page.locator('#airTempValue')).toHaveAttribute('max', '30');
    await page.locator('#airTemp').evaluate(input => {
        input.value = '4000';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.locator('#airTemp')).toHaveValue('30');
    await expect(page.locator('#airTempValue')).toHaveValue('30');
    await page.locator('#airTempValue').fill('45');
    await page.locator('#airTempValue').press('Enter');
    const cappedTemperature = await page.evaluate(async () => ({
        target: (await import('/physics.js')).getAmbientTarget(),
        slider: document.querySelector('#airTemp').value,
        number: document.querySelector('#airTempValue').value
    }));
    expect(cappedTemperature).toEqual({ target: 30, slider: '30', number: '30' });

    for (const name of ['Dry Mud', 'Banana Seeds']) {
        const material = page.getByRole('button', { name, exact: true });
        await expect(material).toBeEnabled();
        await expect(material).not.toHaveAttribute('data-campaign-disabled', 'true');
    }
    // Mission catalogs contain only materials budgeted for this level. Empty
    // categories stay focusable so their disabled reason can still be read.
    await expect(page.getByRole('button', { name: 'Water', exact: true })).toHaveCount(0);
    const liquidsToggle = page.locator('#particleButtons .panel-heading-toggle[aria-controls="particleGroup-liquids"]');
    await expect(liquidsToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(liquidsToggle).toHaveAttribute('aria-disabled', 'true');
    await expect(liquidsToggle).toHaveAttribute('data-campaign-disabled', 'true');
    await expect(liquidsToggle).toHaveAttribute('tabindex', '0');
    await expect(page.locator('#particleGroup-liquids')).toBeHidden();
    await expectDisabledTooltip(page, liquidsToggle, 'No items available in this mission.');

    const dewpoint = page.locator('#dewpoint');
    await expect(dewpoint).toBeDisabled();
    await expect(dewpoint).toHaveAttribute('aria-description', 'Locked by the current mission.');
    await expect(dewpoint).toHaveAttribute('data-campaign-disabled', 'true');
    const dewpointOpacity = await dewpoint.evaluate(element => Number(getComputedStyle(element).opacity));
    expect(dewpointOpacity).toBeLessThan(1);
    const lineTool = page.locator('#lineModeButton');
    await expect(lineTool).toHaveAttribute('data-campaign-disabled', 'true');
    await expectDisabledTooltip(page, lineTool, 'Not available in this mission.');
    await page.locator('#canvas').hover({ position: { x: 10, y: 10 } });
    await expect(page.locator('#toolTooltip')).toBeHidden();
    expect(await page.locator('#toolTooltip').evaluate(element => getComputedStyle(element).display)).toBe('none');

    await expect(page.locator('#exportGame')).toBeDisabled();
    const saveToLibrary = page.locator('#saveToLibraryButton, #saveToLibrary').first();
    await expect(saveToLibrary).toBeDisabled();

    for (const selector of ['#pauseButton', '#importGame']) {
        const systemAction = page.locator(selector);
        await expect(systemAction, `${selector} remains usable in Campaign`).toBeEnabled();
        await expect(systemAction).not.toHaveAttribute('data-campaign-disabled', 'true');
        await expect(systemAction).not.toHaveClass(/campaign-locked-control/);
        expect(await systemAction.evaluate(element => Number(getComputedStyle(element).opacity)))
            .toBeGreaterThanOrEqual(0.99);
        await expectNoDisabledTooltip(page, selector);
    }
});

test('Mission 2 reload reconstructs the clean authored state from its mission-number checkpoint', async ({ page }) => {
    await openMissionTwoBriefing(page);
    await page.locator('#missionIntroOk').click();

    await page.evaluate(() => {
        for (const [selector, value] of [['#airTemp', '24'], ['#baseHumidity', '76'], ['#ambientIllumination', '63']]) {
            const input = document.querySelector(selector);
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Resume Game', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Resume Game', exact: true }).click();
    await expect(page.locator('#missionHud')).toBeVisible();
    const restoredClimate = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const campaign = await import('/campaign.js');
        const definitions = physics.getDefinitions();
        const iceId = definitions.findIndex(definition => definition?.name === 'Ice');
        const world = physics.getWorld();
        const state = campaign.getCampaignState();
        return {
            temperature: physics.getAmbientTarget(),
            humidity: physics.getAmbientHumidityTarget(),
            illumination: physics.getAmbientIlluminationTarget(),
            mission: campaign.getCurrentMission().id,
            iceCount: world.type.reduce((count, value) => count + (value === iceId ? 1 : 0), 0),
            dryMud: state.resources.materials['Dry Mud'],
            seeds: state.resources.materials['Banana Seeds'],
            progress: state.objectiveProgress,
            firedEventIds: state.firedEventIds
        };
    });
    expect(restoredClimate).toMatchObject({
        temperature: -10, humidity: 35, illumination: 10, mission: 'ice-banana', iceCount: 260 * 5,
        dryMud: { limit: 500, used: 0, remaining: 500 },
        seeds: { limit: 5, used: 0, remaining: 5 }, firedEventIds: []
    });
    expect(Object.values(restoredClimate.progress)).toEqual([0, 0, 0, 0]);
});

test('Sandbox keeps its freeform materials and climate controls free of campaign locks', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const campaignState = await page.evaluate(async () => (await import('/campaign.js')).getCampaignState());
    expect(campaignState).toBeNull();
    await expect(page.locator('#missionHud')).toBeHidden();
    for (const selector of ['#airTemp', '#baseHumidity', '#ambientIllumination', '#dewpoint']) {
        await expect(page.locator(selector), `${selector} remains adjustable in Sandbox`).toBeEnabled();
        await expect(page.locator(selector)).not.toHaveClass(/campaign-locked-control/);
    }
    await expect(page.locator('#airTemp')).toHaveAttribute('max', '4000');
    await expect(page.locator('#airTempValue')).toHaveAttribute('max', '4000');
    await page.locator('#airTemp').evaluate(input => {
        input.value = '4000';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('#airTempValue').fill('4500');
    await page.locator('#airTempValue').press('Enter');
    const sandboxTemperature = await page.evaluate(async () => ({
        target: (await import('/physics.js')).getAmbientTarget(),
        slider: document.querySelector('#airTemp').value,
        number: document.querySelector('#airTempValue').value
    }));
    expect(sandboxTemperature).toEqual({ target: 4000, slider: '4000', number: '4000' });

    for (const name of ['Water', 'Sand', 'Dry Mud', 'Banana Seeds']) {
        const material = page.getByRole('button', { name, exact: true });
        await expect(material).toBeEnabled();
        const opacity = await material.evaluate(element => Number(getComputedStyle(element).opacity));
        expect(opacity).toBeGreaterThanOrEqual(0.99);
    }

    await page.locator('#airTempLabel').evaluate(element => element.dispatchEvent(new MouseEvent('mouseenter')));
    await expect(page.locator('#toolTooltip')).toBeVisible();
    await expect(page.locator('#toolTooltip .tool-tooltip-disabled')).toHaveCount(0);
    expect(await page.locator('.campaign-locked-control').count()).toBe(0);
    expect(await page.locator('[data-campaign-disabled="true"]').count()).toBe(0);
});

test('Mission 2 temperature range falls back to the Sandbox 4,000C limit after campaign clears', async ({ page }) => {
    await openMissionTwoBriefing(page);
    await page.locator('#missionIntroOk').click();
    await expect(page.locator('#airTemp')).toHaveAttribute('max', '30');
    await expect(page.locator('#airTempValue')).toHaveAttribute('max', '30');

    await page.evaluate(async () => (await import('/campaign.js')).clearCampaign());
    await expect(page.locator('#missionHud')).toBeHidden();
    await expect(page.locator('#airTemp')).toHaveAttribute('max', '4000');
    await expect(page.locator('#airTempValue')).toHaveAttribute('max', '4000');
    await expect(page.locator('#airTemp')).toBeEnabled();
    await expect(page.locator('#airTempValue')).toBeEnabled();
});
