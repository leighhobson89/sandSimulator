import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page);
});

async function setupWorld(page, scenario) {
    return page.evaluate(async scenario => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        physics.clearWorld();
        if (scenario.kind === 'settling') {
            physics.setCell(20, 4, id('Sand'));
            physics.setCell(20, 5, id('Sand'));
            physics.setCell(20, 40, id('Wall'));
        } else if (scenario.kind === 'phase') {
            const cell = physics.index(20, 20);
            physics.setCell(20, 20, id(scenario.material));
            physics.getWorld().temp[cell] = scenario.temperature;
            physics.getWorld().heat[cell] = definitions[id(scenario.material)].latent + 1;
        } else if (scenario.kind === 'wet-fire') {
            for (let x = 18; x <= 22; x++) {
                for (let y = 33; y <= 35; y++) physics.setCell(x, y, id('Sand'));
                physics.setCell(x, 36, id('Wall'));
            }
            for (let x = 19; x <= 21; x++) physics.setCell(x, 31, id('Water'));
        } else if (scenario.kind === 'douse') {
            physics.setCell(25, 35, id('Fire'));
            physics.setCell(25, 34, id('Water'));
            physics.setCell(25, 36, id('Wall'));
        } else if (scenario.kind === 'growth') {
            physics.setAmbientTarget(22);
            physics.setAmbientHumidityTarget(65);
            physics.getWorld().temp.fill(22);
            physics.getWorld().humidity.fill(65);
            for (let x = 10; x <= 30; x++) {
                physics.setCell(x, 35, id('Wet Mud'));
                physics.setCell(x, 36, id('Wall'));
            }
            physics.setCell(18, 34, id('Grass Seeds'));
            physics.setCell(40, 35, id('Dry Mud'));
            physics.setCell(40, 36, id('Wall'));
            physics.setCell(40, 34, id('Grass Seeds'));
        }
        return { cols: physics.getWorld().cols, rows: physics.getWorld().rows };
    }, scenario);
}

test('powder settling preserves material count and moves it down the world', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await setupWorld(page, { kind: 'settling' });
    const before = await game.state();
    const sand = before.definitions.find(definition => definition?.name === 'Sand').id;
    const countBefore = before.arrays.type.filter(value => value === sand).length;
    await game.step(20);
    const after = await game.state();
    const sandCells = after.arrays.type
        .map((value, index) => value === sand ? index : -1)
        .filter(index => index >= 0);
    expect(sandCells).toHaveLength(countBefore);
    expect(sandCells.some(index => Math.floor(index / after.cols) > 5)).toBe(true);
});

test('phase thresholds convert Ice to Water and Water to Steam', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await setupWorld(page, { kind: 'phase', material: 'Ice', temperature: 100 });
    await game.step(1);
    let state = await game.state();
    expect(state.arrays.type[20 + 20 * state.cols]).toBe(state.definitions.find(definition => definition?.name === 'Water').id);

    await setupWorld(page, { kind: 'phase', material: 'Water', temperature: 200 });
    await game.step(1);
    state = await game.state();
    expect(state.arrays.type[20 + 20 * state.cols]).toBe(state.definitions.find(definition => definition?.name === 'Steam').id);
});

test('Water wets Sand and extinguishes Fire through real simulation ticks', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await setupWorld(page, { kind: 'wet-fire' });
    await game.step(6);
    let state = await game.state();
    expect(state.arrays.type).toContain(state.definitions.find(definition => definition?.name === 'Wet Sand').id);

    await setupWorld(page, { kind: 'douse' });
    await game.step(10);
    state = await game.state();
    expect(state.arrays.type).not.toContain(state.definitions.find(definition => definition?.name === 'Fire').id);
});

test('Grass Seeds germinate on Wet Mud and remain dormant on Dry Mud', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await setupWorld(page, { kind: 'growth' });
    await game.step(2600);
    const state = await game.state();
    const grass = state.definitions.find(definition => definition?.name === 'Grass').id;
    const drySeed = state.definitions.find(definition => definition?.name === 'Grass Seeds').id;
    expect(state.arrays.type).toContain(grass);
    const plantTypes = new Set(['Grass', 'Moss', 'Daffodil', 'Red Tulip', 'Geranium', 'Blue Flower', 'Banana Plant', 'Water Grass']
        .map(name => state.definitions.find(definition => definition?.name === name)?.id).filter(id => id > 0));
    const drySideGrowth = state.arrays.type.some((type, index) =>
        index % state.cols >= 35 && plantTypes.has(type));
    expect(drySideGrowth).toBe(false);
    const drySideSeeds = Array.from(state.arrays.type, (type, index) =>
        index % state.cols >= 35 && type === drySeed ? index : -1).filter(index => index >= 0);
    expect(drySideSeeds.length).toBeGreaterThan(0);
    expect(drySideSeeds.some(index => Math.floor(index / state.cols) > 34)).toBe(true);
});
