import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { canvasPoint, dragCanvasCells } from '../helpers/canvas.mjs';
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

test('legacy saves migrate Fan speeds in the world and blueprints exactly once', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const fan = physics.getDefinitions().findIndex(definition => definition?.name === 'Fan');
        physics.clearWorld();
        physics.setCell(15, 20, fan);
        physics.getWorld().machineSetting[physics.index(15, 20)] = 7;
    });

    await page.getByRole('tab', { name: 'Blueprints' }).click();
    await page.getByRole('button', { name: /Marquee/ }).click();
    await dragCanvasCells(page, { x: 15, y: 20 }, { x: 15, y: 20 });
    await page.getByRole('button', { name: 'Copy selection' }).click();
    await page.getByRole('tab', { name: 'Tools' }).click();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const currentSave = await page.locator('#saveString').inputValue();
    const legacySave = await page.evaluate(async encoded => {
        const save = await import('/saveLoadGame.js');
        const codec = await import('/lzString.js');
        const payload = save.parseSaveString(encoded);
        const setFloat = (wireArray, offset, value) => {
            const binary = atob(wireArray.data);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
            new Float32Array(bytes.buffer)[offset] = value;
            let output = '';
            for (let start = 0; start < bytes.length; start += 0x8000) {
                output += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
            }
            wireArray.data = btoa(output);
        };

        setFloat(payload.simulation.arrays.machineSetting, 20 * payload.simulation.cols + 15, 7);
        setFloat(payload.blueprints.slots[0].cells.machineSetting, 0, 9);
        delete payload.simulation.fanWindScale;
        delete payload.blueprints.fanWindScale;
        return codec.compressToEncodedURIComponent(JSON.stringify(payload));
    }, currentSave);
    await page.locator('#closeSaveDialog').click();

    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.locator('#saveString').fill(legacySave);
    await page.getByRole('button', { name: 'Load Game', exact: true }).click();
    if (await page.locator('#autosaveChoiceDialog').isVisible()) {
        await page.getByRole('button', { name: 'Yes, replace it', exact: true }).click();
    }

    let state = await page.evaluate(() => window.__GAME_INSTANCE__.captureState());
    expect(state.arrays.machineSetting[20 * state.cols + 15]).toBe(23);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const migratedSave = await page.locator('#saveString').inputValue();
    const migratedWire = await page.evaluate(async encoded => {
        const save = await import('/saveLoadGame.js');
        const payload = save.parseSaveString(encoded);
        const readFloat = (wireArray, offset) => {
            const binary = atob(wireArray.data);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
            return new Float32Array(bytes.buffer)[offset];
        };
        return {
            simulationMarker: payload.simulation.fanWindScale,
            worldFanSpeed: readFloat(payload.simulation.arrays.machineSetting, 20 * payload.simulation.cols + 15),
            blueprintMarker: payload.blueprints.fanWindScale,
            blueprintFanSpeed: readFloat(payload.blueprints.slots[0].cells.machineSetting, 0)
        };
    }, migratedSave);
    expect(migratedWire).toEqual({
        simulationMarker: 50,
        worldFanSpeed: 23,
        blueprintMarker: 50,
        blueprintFanSpeed: 30
    });
    await page.locator('#closeSaveDialog').click();

    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.locator('#saveString').fill(migratedSave);
    await page.getByRole('button', { name: 'Load Game', exact: true }).click();
    if (await page.locator('#autosaveChoiceDialog').isVisible()) {
        await page.getByRole('button', { name: 'Yes, replace it', exact: true }).click();
    }
    state = await page.evaluate(() => window.__GAME_INSTANCE__.captureState());
    expect(state.arrays.machineSetting[20 * state.cols + 15]).toBe(23);

    await page.getByRole('tab', { name: 'Blueprints' }).click();
    await page.getByRole('button', { name: 'Blueprint 1', exact: true }).click();
    await page.mouse.click(...Object.values(await canvasPoint(page, { x: 25, y: 20 })));
    state = await page.evaluate(() => window.__GAME_INSTANCE__.captureState());
    expect(state.arrays.machineSetting[20 * state.cols + 25]).toBe(30);
});
