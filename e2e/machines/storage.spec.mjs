import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { canvasPoint } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page);
});

async function clickCell(page, cell) {
    const point = await canvasPoint(page, cell);
    await page.mouse.click(point.x, point.y);
}

async function seedStorage(page, { machine, material, count = 3, cell = { x: 30, y: 30 } }) {
    return page.evaluate(async ({ machine, material, count, cell }) => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        physics.clearWorld();
        physics.setCell(cell.x, cell.y, id(machine));
        const inventory = physics.getWorld();
        const at = physics.index(cell.x, cell.y);
        inventory.storageType[at] = id(material);
        inventory.storageCount[at] = count;
        return { id: id(machine), material: id(material), cell };
    }, { machine, material, count, cell });
}

test('storage dialogs show inventory, capacity, category, and purge behavior', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    for (const [machine, material, category] of [
        ['Powder Storage Bin', 'Sand', 'powder'],
        ['Liquid Storage Bin', 'Water', 'liquid'],
        ['Gas Storage Bin', 'Steam', 'gas']
    ]) {
        const cell = machine === 'Powder Storage Bin'
            ? { x: 14, y: 18 }
            : machine === 'Liquid Storage Bin' ? { x: 24, y: 18 } : { x: 34, y: 18 };
        await seedStorage(page, { machine, material, cell });
        await clickCell(page, cell);
        const dialog = page.locator('#machineDialog');
        await expect(dialog).toBeVisible();
        await expect(page.locator('#machineDialogTitle')).toHaveText(`${machine} contents`);
        await expect(page.locator('#machineDialogDescription')).toContainText(`one ${category} type`);
        await expect(page.locator('#machineDialogStorageSummary')).toContainText(`3/500 ${material}`);
        await expect(page.locator('#machineDialogPurge')).toBeVisible();
        await page.locator('#machineDialogPurge').click();
        await expect(page.locator('#purgeDialog')).toBeVisible();
        await page.locator('#purgeDialogCancel').click();
        await expect(page.locator('#purgeDialog')).toBeHidden();
        await page.locator('#machineDialogPurge').click();
        await page.locator('#purgeDialogConfirm').click();
        await expect(dialog).toBeHidden();
        await clickCell(page, cell);
        await expect(page.locator('#machineDialogStorageSummary')).toContainText(/0\/500 empty/i);
        await page.locator('#machineDialogCancel').click();
    }
});

test('storage intakes accept matching categories and reject incompatible material', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        const bin = { x: 30, y: 30 };
        physics.clearWorld();
        physics.setCell(bin.x, bin.y, id('Powder Storage Bin'));
        world.data[physics.index(bin.x, bin.y)] = 3;
        physics.setCell(30, 28, id('Water'));
        physics.stepSimulation();
        const rejected = physics.getStorageInventory(bin.x, bin.y).count;
        physics.clearWorld();
        physics.setCell(bin.x, bin.y, id('Powder Storage Bin'));
        world.data[physics.index(bin.x, bin.y)] = 3;
        physics.setCell(30, 28, id('Sand'));
        physics.stepSimulation();
        return {
            rejected,
            accepted: physics.getStorageInventory(bin.x, bin.y),
            sand: id('Sand')
        };
    });
    expect(result.rejected).toBe(0);
    expect(result.accepted.type).toBe(result.sand);
    expect(result.accepted.count).toBeGreaterThan(0);
    await game.step(0);
});

test('storage bins retain one type, cap at 500, and refuse overflow until purged', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const defs = physics.getDefinitions();
        const id = name => defs.findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        physics.clearWorld();
        physics.setCell(30, 30, id('Powder Storage Bin'));
        const bin = physics.index(30, 30);
        world.storageType[bin] = id('Sand');
        world.storageCount[bin] = 500;
        physics.setCell(30, 28, id('Water'));
        for (let frame = 0; frame < 10; frame++) physics.stepSimulation();
        const full = physics.getStorageInventory(30, 30);
        physics.purgeStorageBin(30, 30);
        return {
            full,
            purged: physics.getStorageInventory(30, 30)
        };
    });
    expect(result.full.count).toBe(500);
    expect(result.full.type).toBeGreaterThan(0);
    expect(result.purged.count).toBe(0);
    expect(result.purged.type).toBe(0);
    await game.step(0);
});
