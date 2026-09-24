import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page);
});

async function seedMachineState(page) {
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const defs = physics.getDefinitions();
        const id = name => defs.findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        physics.clearWorld();
        physics.setCell(15, 20, id('Fan'));
        world.data[physics.index(15, 20)] = 4;
        world.machineSetting[physics.index(15, 20)] = 12;
        physics.setCell(25, 20, id('Powder Storage Bin'));
        world.storageType[physics.index(25, 20)] = id('Sand');
        world.storageCount[physics.index(25, 20)] = 7;
        physics.setCell(35, 20, id('Vent'));
        world.data[physics.index(35, 20)] = 40;
        world.machineSetting[physics.index(35, 20)] = 0;
        world.storageType[physics.index(35, 20)] = id('Water');
        world.storageCount[physics.index(35, 20)] = 3;
        physics.setCell(45, 20, id('Mixer'));
        const mixer = physics.index(45, 20);
        world.machineSetting[mixer] = 0;
        world.mixerInputTypeA[mixer] = id('Water');
        world.mixerInputCountA[mixer] = 6;
        world.mixerInputTypeB[mixer] = id('Dry Mud');
        world.mixerInputCountB[mixer] = 4;
        for (let x = 26; x < 35; x++) physics.setCell(x, 20, id('Tubing'));
    });
}

test('machine settings, inventories, tubing, and mixer inputs survive portable Save/Load', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await seedMachineState(page);
    await game.step(0);
    const before = await page.evaluate(() => window.__GAME_INSTANCE__.captureState());

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const saveString = await page.locator('#saveString').inputValue();
    expect(saveString.length).toBeGreaterThan(20);
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        physics.clearWorld();
    });
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.locator('#saveString').fill(saveString);
    await page.getByRole('button', { name: 'Load Game', exact: true }).click();
    await expect(page.locator('#autosaveChoiceDialog')).toBeVisible();
    await page.getByRole('button', { name: 'Yes, replace it', exact: true }).click();
    const after = await page.evaluate(() => window.__GAME_INSTANCE__.captureState());

    for (const field of [
        'type', 'data', 'machineSetting', 'storageType', 'storageCount',
        'mixerInputTypeA', 'mixerInputCountA', 'mixerInputTypeB', 'mixerInputCountB'
    ]) {
        expect(after.arrays[field], field).toEqual(before.arrays[field]);
    }
    await expect(page.locator('#canvas')).toBeVisible();
    await expect(game.state()).resolves.toMatchObject({ cols: before.cols, rows: before.rows });
});
