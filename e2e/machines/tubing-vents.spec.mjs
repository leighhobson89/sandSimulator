import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { canvasPoint, clickCanvasCell } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

async function prepareVent(page) {
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const defs = physics.getDefinitions();
        const id = name => defs.findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        physics.clearWorld();
        physics.setCell(30, 30, id('Vent'));
        physics.setCell(30, 29, id('Tubing'));
        physics.setCell(30, 28, id('Tubing'));
        const vent = physics.index(30, 30);
        world.storageType[vent] = id('Water');
        world.storageCount[vent] = 20;
        physics.setVentReleaseRate(30, 30, 60);
    });
    await clickCanvasCell(page, { x: 30, y: 30 });
    await expect(page.locator('#machineDialog')).toBeVisible();
}

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page);
});

test('Vent controls toggle retained inventory and release it below the outlet', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await game.seed(991);
    await prepareVent(page);

    const toggle = page.getByRole('switch', { name: 'Release vent contents into the canvas' });
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await page.locator('#machineDialogCancel').click();
    await game.step(20);
    let state = await game.state();
    const waterId = state.definitions.find(definition => definition?.name === 'Water').id;
    const ventIndex = 30 + 30 * state.cols;
    expect(state.arrays.type[32 * state.cols + 30]).not.toBe(waterId);

    await clickCanvasCell(page, { x: 30, y: 30 });
    await toggle.check();
    await page.locator('#machineDialogCancel').click();
    await game.step(40);
    state = await game.state();
    expect(state.arrays.type).toContain(waterId);
    expect(state.arrays.type[ventIndex]).toBe(state.definitions.find(definition => definition?.name === 'Vent').id);
});

test('Tubing transfers stored material at the narrowest cross-section rate', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await game.seed(234);

    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const defs = physics.getDefinitions();
        const id = name => defs.findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        physics.clearWorld();
        physics.setCell(10, 20, id('Powder Storage Bin'));
        physics.setCell(30, 20, id('Vent'));
        physics.setVentReleaseEnabled(30, 20, false);
        for (let x = 11; x < 30; x++) physics.setCell(x, 20, id('Tubing'));
        const source = physics.index(10, 20);
        world.storageType[source] = id('Ash');
        world.storageCount[source] = 60;
        for (let frame = 0; frame < 60; frame++) physics.stepSimulation();
        return {
            source: physics.getStorageInventory(10, 20),
            vent: physics.getVentInventory(30, 20),
            flow: physics.getTubingFlows()[0]
        };
    });
    expect(result.source.count).toBe(50);
    expect(result.vent.count).toBe(10);
    expect(result.flow.rate).toBe(10);
    expect(result.flow.path.every(cell => Number.isInteger(cell))).toBe(true);
    await game.step(0);
    await page.mouse.move(...Object.values(await canvasPoint(page, { x: 20, y: 20 })));
    await expect(page.locator('#toolTooltip')).toContainText('Flow');
    await expect(page.locator('#machineOverlay .tubing-flow-route')).toHaveCount(1);
});

test('unconnected and full disabled Vents stop tubing flow and expose the state in the dialog', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const defs = physics.getDefinitions();
        const id = name => defs.findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        physics.clearWorld();
        physics.setCell(30, 20, id('Vent'));
        const vent = physics.index(30, 20);
        world.storageType[vent] = id('Water');
        world.storageCount[vent] = 100;
        physics.setVentReleaseEnabled(30, 20, false);
    });
    await clickCanvasCell(page, { x: 30, y: 20 });
    await expect(page.locator('#machineDialogInput')).toBeDisabled();
    await expect(page.locator('#machineDialogInput')).toHaveAttribute('placeholder', 'Not Connected');
    await expect(page.locator('#machineDialogStorageSummary')).toContainText('100/100 Water');
    await page.locator('#machineDialogCancel').click();

    const flowCount = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        return physics.getTubingFlows().length;
    });
    expect(flowCount).toBe(0);
    await game.step(0);
});

test('Tubing topology requires shared edges and exactly two attached machines', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const results = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const defs = physics.getDefinitions();
        const id = name => defs.findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        const run = async kind => {
            physics.clearWorld();
            physics.setCell(10, 20, id('Powder Storage Bin'));
            physics.setCell(30, 20, id('Vent'));
            physics.setVentReleaseEnabled(30, 20, false);
            const source = physics.index(10, 20);
            world.storageType[source] = id('Ash');
            world.storageCount[source] = 30;
            if (kind === 'edge') {
                for (let x = 11; x < 30; x++) physics.setCell(x, 20, id('Tubing'));
            } else if (kind === 'diagonal') {
                for (let x = 11; x < 30; x++) physics.setCell(x, 20 - ((x - 11) % 2), id('Tubing'));
            } else {
                physics.setCell(20, 19, id('Powder Storage Bin'));
                world.storageType[physics.index(20, 19)] = id('Ash');
                world.storageCount[physics.index(20, 19)] = 30;
                for (let x = 11; x < 30; x++) physics.setCell(x, 20, id('Tubing'));
            }
            for (let frame = 0; frame < 60; frame++) physics.stepSimulation();
            return { flowCount: physics.getTubingFlows().length, source: physics.getStorageInventory(10, 20).count };
        };
        return { edge: await run('edge'), diagonal: await run('diagonal'), threeMachines: await run('three') };
    });
    expect(results.edge.flowCount).toBeGreaterThan(0);
    expect(results.edge.source).toBeLessThan(30);
    expect(results.diagonal.flowCount).toBe(0);
    expect(results.diagonal.source).toBe(30);
    expect(results.threeMachines.flowCount).toBe(0);
    expect(results.threeMachines.source).toBe(30);
    await game.step(0);
});

test('Tubing bottlenecks report 20/s and 30/s for wider painted sections', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const rates = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const id = name => physics.getDefinitions().findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        const run = async width => {
            physics.clearWorld();
            physics.setCell(10, 20, id('Powder Storage Bin'));
            physics.setCell(30, 20, id('Vent'));
            physics.setVentReleaseEnabled(30, 20, false);
            const source = physics.index(10, 20);
            world.storageType[source] = id('Ash');
            world.storageCount[source] = 120;
            for (let x = 11; x < 30; x++) {
                for (let offset = 0; offset < width; offset++) physics.setCell(x, 20 + offset, id('Tubing'));
            }
            for (let frame = 0; frame < 60; frame++) physics.stepSimulation();
            return physics.getTubingFlows()[0]?.rate || 0;
        };
        return { two: await run(2), three: await run(3) };
    });
    expect(rates.two).toBe(20);
    expect(rates.three).toBe(30);
    await game.step(0);
});

test('connected Vent rate input is capped by tubing capacity', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const id = name => physics.getDefinitions().findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        physics.clearWorld();
        physics.setCell(10, 20, id('Powder Storage Bin'));
        physics.setCell(30, 20, id('Vent'));
        for (let x = 11; x < 30; x++) physics.setCell(x, 20, id('Tubing'));
        const source = physics.index(10, 20);
        world.storageType[source] = id('Ash');
        world.storageCount[source] = 20;
    });
    await clickCanvasCell(page, { x: 30, y: 20 });
    const input = page.locator('#machineDialogInput');
    await expect(input).toBeEnabled();
    await expect(input).toHaveAttribute('max', '10');
    await input.fill('50');
    await expect(input).toHaveValue('10');
    await page.locator('#machineDialogCancel').click();
    await clickCanvasCell(page, { x: 30, y: 20 });
    await expect(input).toHaveValue('10');
    await page.locator('#machineDialogCancel').click();
    await game.step(0);
});

test('Tubing transfers stored material between compatible storage bins', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const id = name => physics.getDefinitions().findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        physics.clearWorld();
        physics.setCell(10, 20, id('Powder Storage Bin'));
        physics.setCell(30, 20, id('Powder Storage Bin'));
        for (let x = 11; x < 30; x++) physics.setCell(x, 20, id('Tubing'));
        const source = physics.index(10, 20);
        world.storageType[source] = id('Sand');
        world.storageCount[source] = 30;
        for (let frame = 0; frame < 60; frame++) physics.stepSimulation();
        return {
            source: physics.getStorageInventory(10, 20),
            destination: physics.getStorageInventory(30, 20)
        };
    });
    expect(result.source.count).toBeLessThan(30);
    expect(result.destination.type).toBeGreaterThan(0);
    expect(result.destination.count).toBeGreaterThan(0);
    await game.step(0);
});
