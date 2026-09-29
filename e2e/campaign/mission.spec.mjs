import { test, expect } from '@playwright/test';
import { clickCanvasCell, dragCanvasCells } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus) await attachGameDiagnostics(info, page, 'campaign');
});

async function startCampaign(page) {
    await page.goto('/?e2e');
    await page.evaluate(() => localStorage.clear());
    await page.getByRole('button', { name: 'New Campaign', exact: true }).click();
    await expect(page.locator('#missionIntroDialog')).toBeVisible();
    await page.locator('#missionIntroOk').click();
    await expect(page.locator('#canvasContainer')).toBeVisible();
    await expect(page.locator('#missionHud')).toBeVisible();
}

async function commitMachineLead(page, label) {
    const preview = page.locator('#machineOverlay .machine-placement-preview');
    await expect(preview).toHaveCount(1);
    const target = await preview.evaluate(icon => {
        const port = icon.querySelector('circle[data-port-id]');
        if (!port) throw new Error('Machine placement preview has no declared port.');
        const stub = [...icon.querySelectorAll('[data-port-stub]')]
            .find(candidate => candidate.getAttribute('data-port-stub') === port.getAttribute('data-port-id'));
        if (!stub) throw new Error(`Machine port ${port.getAttribute('data-port-id')} has no visible stub.`);
        const bounds = port.getBoundingClientRect();
        const center = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
        const end = stub.getPointAtLength(stub.getTotalLength()).matrixTransform(stub.getScreenCTM());
        const dx = end.x - center.x;
        const dy = end.y - center.y;
        const length = Math.hypot(dx, dy);
        return length < 0.5 ? { x: center.x, y: center.y + 12 }
            : { x: center.x + dx / length * 12, y: center.y + dy / length * 12 };
    });
    await page.mouse.move(target.x, target.y);
    await page.mouse.click(target.x, target.y);
    await expect(preview, `${label} commits after its lead click`).toHaveCount(0);
}

test('Mission 1 counts Daffodil seed germination and fires its completion event once', async ({ page }) => {
    await startCampaign(page);
    const target = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        return campaign.getCurrentMission().objectives[0].target;
    });
    expect(target).toBeGreaterThan(0);

    const completed = await page.evaluate(async conversionCount => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const objective = campaign.getCurrentMission().objectives[0];
        const definitions = physics.getDefinitions();
        const fromId = definitions.findIndex(definition => definition?.name === objective.from);
        const toId = definitions.findIndex(definition => definition?.name === objective.to);
        if (fromId < 0 || toId < 0) throw new Error('Mission objective references an unknown material.');

        for (let count = 0; count < conversionCount; count++) {
            campaign.recordMaterialTransition(fromId, toId);
        }
        const state = campaign.getCampaignState();
        const progress = state.objectiveProgress[objective.id];
        const firedAfterCompletion = [...state.firedEventIds];
        for (let count = 0; count < conversionCount; count++) {
            campaign.recordMaterialTransition(fromId, toId);
        }
        return {
            progress,
            firedAfterCompletion,
            firedAfterRepeat: campaign.getCampaignState().firedEventIds
        };
    }, target);

    expect(completed.progress).toBe(target);
    expect(completed.firedAfterCompletion.length).toBeGreaterThan(0);
    expect(completed.firedAfterRepeat).toEqual(completed.firedAfterCompletion);
    await expect(page.locator('#missionEventNotice')).toBeVisible();
    await expect(page.locator('#missionEventNotice')).toContainText(/objective complete/i);
});

test('objective completion toast times out while the final advance status persists', async ({ page }) => {
    await startCampaign(page);
    await page.clock.install();

    await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const definitions = (await import('/physics.js')).getDefinitions();
        campaign.recordMaterialTransition(
            definitions.findIndex(definition => definition?.name === 'Daffodil Seeds'),
            definitions.findIndex(definition => definition?.name === 'Daffodil')
        );
    });
    await expect(page.locator('#missionCompleteDialog')).toBeVisible();
    await page.locator('#missionCompleteOk').click();
    await expect(page.locator('#missionCompleteDialog')).toBeHidden();

    const toast = page.locator('#missionCompleteToast');
    await expect(toast).toBeVisible();
    await expect(toast).toHaveAttribute('role', 'status');
    await expect(toast).toHaveAttribute('aria-live', 'polite');
    await expect(toast).toHaveAttribute('aria-atomic', 'true');
    await expect(toast).toContainText(/objective complete/i);
    const toastBounds = await toast.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return {
            rightOffset: window.innerWidth - rect.right,
            bottomOffset: window.innerHeight - rect.bottom,
            left: rect.left,
            top: rect.top,
            position: getComputedStyle(element).position,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight
        };
    });
    expect(toastBounds.position).toBe('fixed');
    expect(toastBounds.rightOffset).toBeLessThanOrEqual(32);
    expect(toastBounds.bottomOffset).toBeLessThanOrEqual(160);
    expect(toastBounds.left).toBeGreaterThan(0.5 * toastBounds.viewportWidth);
    expect(toastBounds.top).toBeGreaterThan(0.5 * toastBounds.viewportHeight);

    await expect(page.locator('#missionPassedBar')).toBeHidden();
    await expect(page.locator('#missionAdvance')).toBeVisible();
    await expect(page.locator('#missionAdvance')).toBeEnabled();
    await expect(page.locator('#missionAdvance')).toHaveText('ADVANCE');
    await page.clock.fastForward(9000);
    await expect(toast).toBeVisible();
    await page.clock.fastForward(2000);
    await expect(toast).toBeHidden();
    await expect(page.locator('#missionPassedBar')).toBeHidden();
    await expect(page.locator('#missionAdvance')).toBeVisible();
    await expect(page.locator('#missionAdvance')).toBeEnabled();
    await expect(page.locator('#missionAdvance')).toHaveText('ADVANCE');
});

test('Mission 1 supplies an authored seed habitat, ideal climate, finite budgets, and campaign locks', async ({ page }) => {
    await page.goto('/?e2e');
    await page.evaluate(() => localStorage.clear());
    await page.getByRole('button', { name: 'New Campaign', exact: true }).click();
    await expect(page.locator('#missionIntroDialog')).toBeVisible();

    const authoredMission = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const mission = campaign.getCurrentMission();
        const simulation = physics.captureSimulationState();
        const world = physics.getWorld();
        const definitions = physics.getDefinitions();
        const counts = {};
        for (const id of world.type) counts[definitions[id]?.name] = (counts[definitions[id]?.name] || 0) + 1;
        const sandId = definitions.findIndex(definition => definition?.name === 'Sand');
        let sandNearFloor = 0;
        const sandFloorColumns = new Set();
        for (let y = Math.max(0, world.rows - 10); y < world.rows; y++) {
            for (let x = 0; x < world.cols; x++) if (world.type[y * world.cols + x] === sandId) {
                sandNearFloor++;
                sandFloorColumns.add(x);
            }
        }
        const shared = await import('/constantsAndGlobalVars.js');
        return {
            mission, simulation, counts, sandNearFloor, sandFloorColumns: sandFloorColumns.size,
            cols: world.cols,
            initialSelection: {
                material: definitions[shared.getParticleTypeIdSelected()]?.name,
                drawMode: shared.getDrawMode()
            }
        };
    });
    const mission = authoredMission.mission;
    expect(mission.number).toBe(1);
    expect(mission.objectives).toContainEqual(expect.objectContaining({
        type: 'transformation', from: 'Daffodil Seeds', to: 'Daffodil', target: 1
    }));
    expect(mission.resourceBudgets.materials).toEqual({
        'Dry Mud': 100, Water: 1000, 'Daffodil Seeds': 1
    });
    expect(mission.resourceBudgets.machines).toEqual({});
    expect(mission.environment).toEqual({
        temperature: 14, humidity: 68, illumination: 65, dewpoint: 10,
        ambientWindOn: false, windStrength: 0, gustWindStrength: 0
    });
    expect(authoredMission.counts['Daffodil Seeds'] || 0).toBe(0);
    expect(authoredMission.counts['Dry Mud'] || 0).toBe(0);
    expect(authoredMission.counts.Water || 0).toBe(0);
    expect(authoredMission.sandNearFloor).toBeGreaterThanOrEqual(authoredMission.cols);
    expect(authoredMission.sandFloorColumns).toBe(authoredMission.cols);
    expect(authoredMission.counts.Sand).toBe(authoredMission.sandNearFloor);
    expect(authoredMission.initialSelection).toEqual({ material: 'Water', drawMode: 'brush' });
    expect(authoredMission.simulation).toMatchObject({
        ambientTarget: mission.environment.temperature,
        ambientHumidity: mission.environment.humidity,
        ambientIllumination: mission.environment.illumination,
        dewpointTarget: mission.environment.dewpoint,
        ambientWindOn: mission.environment.ambientWindOn,
        generalWindStrength: mission.environment.windStrength,
        gustWindStrength: mission.environment.gustWindStrength
    });

    await page.locator('#missionIntroOk').click();
    await expect(page.locator('#canvasContainer')).toBeVisible();
    await expect(page.locator('#missionHud')).toBeVisible();
    await expect(page.locator('#missionHud')).toContainText('Water');
    await expect(page.locator('#missionHud')).toContainText('Daffodil Seeds');
    await expect(page.getByRole('button', { name: 'Water', exact: true })).toBeEnabled();
    await expect(page.locator('#missionHud')).toContainText('Dry Mud');
    await expect(page.getByRole('button', { name: 'Dry Mud', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Daffodil Seeds', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Sand', exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Sprinkler', exact: true })).toBeHidden();
    for (const control of ['#airTemp', '#baseHumidity', '#ambientIllumination', '#dewpoint',
        '#ambientWind', '#generalWindStrength', '#windStrength']) {
        await expect(page.locator(control), `${control} is locked by the mission climate`).toBeDisabled();
    }

    const pause = page.getByRole('button', { name: 'Pause', exact: true });
    if (await pause.isVisible()) await pause.click();
    const limits = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const mission = campaign.getCurrentMission();
        return {
            water: mission.resourceBudgets.materials.Water,
            seeds: mission.resourceBudgets.materials['Daffodil Seeds']
        };
    });
    const waterGuards = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const limit = campaign.getCurrentMission().resourceBudgets.materials.Water;
        return {
            atLimit: campaign.canUseMaterial('Water', limit),
            overLimit: campaign.canUseMaterial('Water', limit + 1)
        };
    });
    expect(waterGuards).toEqual({ atLimit: true, overLimit: false });

    await page.getByRole('button', { name: 'Daffodil Seeds', exact: true }).click();
    await page.locator('#brushSize').fill('1');
    const emptyCells = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const cells = [];
        for (let y = 8; y < world.rows - 12 && cells.length < 3; y++) {
            for (let x = 8; x < world.cols - 8 && cells.length < 3; x++) {
                if (world.type[y * world.cols + x] === 0) cells.push({ x, y });
            }
        }
        return cells;
    });
    expect(emptyCells).toHaveLength(3);
    await page.getByRole('button', { name: 'Dry Mud', exact: true }).click();
    await clickCanvasCell(page, emptyCells[0]);
    await page.getByRole('button', { name: 'Daffodil Seeds', exact: true }).click();
    await clickCanvasCell(page, emptyCells[1]);
    await clickCanvasCell(page, emptyCells[2]);

    const afterSeed = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const state = campaign.getCampaignState();
        const mission = campaign.getCurrentMission();
        const seed = mission.resourceBudgets.materials['Daffodil Seeds'];
        return {
            resource: state.resources.materials['Daffodil Seeds'],
            dryMudResource: state.resources.materials['Dry Mud'],
            canPlaceOneMore: campaign.canUseMaterial('Daffodil Seeds'),
            seedId: (await import('/physics.js')).getDefinitions()
                .findIndex(definition => definition?.name === 'Daffodil Seeds'),
            dryMudId: (await import('/physics.js')).getDefinitions()
                .findIndex(definition => definition?.name === 'Dry Mud'),
            seedBudget: seed
        };
    });
    expect(afterSeed.resource.limit).toBe(limits.seeds);
    expect(afterSeed.resource.used).toBe(limits.seeds);
    expect(afterSeed.resource.remaining).toBe(0);
    expect(afterSeed.canPlaceOneMore).toBe(false);
    expect(afterSeed.dryMudResource.used).toBe(1);
    expect(afterSeed.dryMudResource.remaining).toBe(99);
    expect(afterSeed.seedBudget).toBe(1);
    const live = await page.evaluate(async () => window.__GAME_INSTANCE__.inspect());
    expect(live.typeCounts[String(afterSeed.seedId)]).toBe(1);
    expect(live.typeCounts[String(afterSeed.dryMudId)]).toBe(1);
    await expect(page.getByRole('button', { name: 'Daffodil Seeds', exact: true })).toBeHidden();
    await expect(page.locator('#missionHud')).toContainText('1 / 100');
    await expect(page.locator('#missionHud')).toContainText('1 / 1');
    await expect(page.locator('#missionHud')).toContainText('0 / 1000');
});
