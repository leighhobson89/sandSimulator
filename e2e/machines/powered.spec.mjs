import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page);
});

async function preparePoweredMachine(page, machine) {
    return page.evaluate(async machine => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        physics.clearWorld();
        physics.setCell(30, 20, id(machine));
        physics.setCell(29, 20, id('Battery'));
        world.charge[physics.index(29, 20)] = definitions[id('Battery')].chargeCapacity;
        return { machine: id(machine), ray: id(machine === 'Heater' ? 'Heat Ray' : 'Cold Ray') };
    }, machine);
}

test('powered Fan produces directional airflow while an unpowered Fan stays inactive', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    await preparePoweredMachine(page, 'Fan');
    await game.step(1);
    const powered = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        return {
            forward: world.wind[physics.index(31, 20)],
            cone: world.wind[physics.index(33, 19)],
            powered: physics.isMachinePoweredAt(30, 20)
        };
    });
    expect(powered.powered).toBe(true);
    expect(powered.forward).toBeGreaterThan(0);
    expect(powered.cone).toBeGreaterThan(0);

    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        physics.clearWorld();
        const fan = physics.getDefinitions().findIndex(definition => definition?.name === 'Fan');
        physics.setCell(30, 20, fan);
    });
    await game.step(1);
    const inactive = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        return physics.getWorld().wind.some(value => value > 0);
    });
    expect(inactive).toBe(false);
});

test('powered Heater and Cooler emit directional rays and update their cone', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    for (const machine of ['Heater', 'Cooler']) {
        const expected = await preparePoweredMachine(page, machine);
        await game.step(1);
        const state = await game.state();
        expect(state.arrays.type[20 * state.cols + 31], machine).toBe(expected.ray);
        await expect(page.locator(`#machineOverlay .machine-cone-${machine.toLowerCase()}`)).toBeVisible();
    }

    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        physics.clearWorld();
        const heater = physics.getDefinitions().findIndex(definition => definition?.name === 'Heater');
        physics.setCell(30, 20, heater);
    });
    await game.step(1);
    await expect(page.locator('#machineOverlay .machine-cone-heater')).toHaveCount(0);
});
