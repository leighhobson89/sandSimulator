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

test('powered Fan transports warm air past its particle cone and keeps its long scalar vector active', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const simulate = async powered => {
        await page.evaluate(async powered => {
            const physics = await import('/physics.js');
            physics.resetRandomSource();
            physics.setRandomSeed(7341);
            physics.setAmbientWindOn(false);
            physics.setGeneralWindStrength(0);
            physics.setGustWindStrength(0);
            physics.setAmbientHumidityTarget(50);
            physics.clearWorld();
            physics.createWorld(224, 64);
            const definitions = physics.getDefinitions();
            const id = name => definitions.findIndex(definition => definition?.name === name);
            const fanX = 3;
            const fanY = 22;
            const world = physics.getWorld();
            world.temp.fill(20);
            world.tempNext.fill(20);
            world.humidity.fill(50);
            physics.setCell(fanX, fanY, id('Fan'));
            if (powered) {
                // Keep the machine powered for the full 180-tick air transport probe.
                for (let y = fanY; y < fanY + 37; y++) {
                    physics.setCell(fanX - 1, y, id('Battery'));
                    world.charge[physics.index(fanX - 1, y)] = definitions[id('Battery')].chargeCapacity;
                }
            }
            physics.setMachineSetting(fanX, fanY, 50);
            for (let y = fanY - 1; y <= fanY + 1; y++) {
                for (let x = fanX + 10; x <= fanX + 12; x++) {
                    const cell = physics.index(x, y);
                    world.temp[cell] = 120;
                    world.humidity[cell] = 100;
                }
            }
        }, powered);

        await page.evaluate(async () => {
            const physics = await import('/physics.js');
            for (let frame = 0; frame < 180; frame++) physics.stepSimulation();
        });
        return page.evaluate(async () => {
            const physics = await import('/physics.js');
            const world = physics.getWorld();
            const x = 3 + 30;
            const y = 22;
            return {
                powered: physics.isMachinePoweredAt(3, 22),
                ambientTemperature: physics.getAirTempAt(y),
                temperature: world.temp[physics.index(x, y)],
                humidity: world.humidity[physics.index(x, y)],
                longReachVector: Math.hypot(world.airMixX[physics.index(3 + 198, y)],
                    world.airMixY[physics.index(3 + 198, y)])
            };
        });
    };

    const active = await simulate(true);
    const unpowered = await simulate(false);
    expect(active.powered).toBe(true);
    expect(unpowered.powered).toBe(false);
    expect(active.longReachVector).toBeGreaterThan(0);
    expect(active.temperature).toBeGreaterThan(unpowered.temperature + 0.01);
    expect(active.temperature).toBeGreaterThan(active.ambientTemperature + 0.05);
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
