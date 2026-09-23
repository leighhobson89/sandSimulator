import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';
import { setupPhysics, count, cellsOf } from './fixtures.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'reactions');
});

test('lava and water follow the quench path and leave steam and scoria residue', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await setupPhysics(page, {
        fills: [{ material: 'Wall', x: 0, y: 44, width: 200, height: 1 }, { material: 'Lava', x: 70, y: 38, width: 10, height: 4 }, { material: 'Water', x: 70, y: 26, width: 10, height: 8 }]
    });
    await game.step(180);
    expect(await count(page, 'Scoria')).toBeGreaterThan(0);
    expect(await count(page, 'Steam')).toBeGreaterThan(0);
});

test('growth succeeds on wet ground but dry and invalid paths are rejected', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame(); await game.seed(404);
    await setupPhysics(page, {
        fills: [{ material: 'Wet Mud', x: 15, y: 36, width: 12, height: 2 }, { material: 'Dry Mud', x: 45, y: 36, width: 12, height: 2 }],
        cells: [{ x: 20, y: 35, material: 'Seed' }, { x: 50, y: 35, material: 'Seed' }, { x: -1, y: 0, material: 'Seed' }]
    });
    await game.step(700);
    expect(await count(page, 'Plant')).toBeGreaterThan(0);
    const dryPlantCount = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const ids = new Set(['Plant', 'Grass', 'Ash Grass'].map(name => physics.getDefinitions().findIndex(definition => definition?.name === name)));
        const world = physics.getWorld();
        return [...world.type].filter((type, index) => index % world.cols >= 40 && ids.has(type)).length;
    });
    expect(dryPlantCount).toBe(0);
});

test('burning wood decays to residue and a reset cancels all reactions', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await setupPhysics(page, { fills: [{ material: 'Wood', x: 30, y: 30, width: 6, height: 5 }], cells: [{ x: 32, y: 35, material: 'Fire' }] });
    await game.step(500);
    expect(await count(page, 'Ash')).toBeGreaterThan(0);
    await page.evaluate(async () => (await import('/physics.js')).clearWorld());
    expect(await count(page, 'Ash')).toBe(0);
    expect(await count(page, 'Fire')).toBe(0);
});

test('heat dries wet ground back to dry mud without changing the fixed cell boundary', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await setupPhysics(page, {
        fills: [{ material: 'Wall', x: 60, y: 42, width: 20, height: 1 }, { material: 'Wet Mud', x: 66, y: 35, width: 8, height: 5 }]
    });
    const wetMudBefore = await count(page, 'Wet Mud');
    expect(await count(page, 'Wet Mud')).toBe(wetMudBefore);
    await page.evaluate(async () => {
        const p = await import('/physics.js'); const ray = p.getDefinitions().findIndex(d => d?.name === 'Heat Ray');
        for (let frame = 0; frame < 300; frame++) {
            for (let x = 66; x < 74; x++) p.setCell(x, 34, ray);
            p.stepSimulation();
        }
    });
    expect(await count(page, 'Wet Mud')).toBeLessThan(wetMudBefore);
    expect(await count(page, 'Dry Mud')).toBeGreaterThan(0);
    expect((await cellAt(page, 60, 42)).name).toBe('Wall');
});

async function cellAt(page, x, y) {
    return page.evaluate(async ({ x, y }) => {
        const p = await import('/physics.js'); const w = p.getWorld(); const id = w.type[p.index(x, y)];
        return { name: p.getDefinitions()[id]?.name, type: id };
    }, { x, y });
}

test('acid corrodes stone but preserves glass and produces toxic gas', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await setupPhysics(page, { fills: [
        { material: 'Stone', x: 25, y: 28, width: 8, height: 6 }, { material: 'Glass', x: 45, y: 28, width: 8, height: 6 },
        { material: 'Acid', x: 25, y: 22, width: 8, height: 4 }, { material: 'Acid', x: 45, y: 22, width: 8, height: 4 }
    ]});
    const glassBefore = await count(page, 'Glass'); await game.step(260);
    expect(await count(page, 'Stone')).toBeLessThan(48);
    expect(await count(page, 'Glass')).toBe(glassBefore);
    expect(await count(page, 'Toxic Gas')).toBeGreaterThan(0);
});

test('snow follows cold condensation and warm melting paths, while gunpowder blasts breakable material only', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await setupPhysics(page, { cells: [{ x: 90, y: 25, material: 'Snow' }, { x: 90, y: 26, material: 'Wall' }] });
    await page.evaluate(async () => { const p = await import('/physics.js'); p.setAmbientTarget(-40); }); await game.step(20);
    expect(await count(page, 'Snow')).toBeGreaterThan(0);
    await setupPhysics(page, { cells: [{ x: 90, y: 25, material: 'Snow' }, { x: 90, y: 26, material: 'Wall' }] });
    await page.evaluate(async () => (await import('/physics.js')).setAmbientTarget(40)); await game.step(500);
    expect(await count(page, 'Snow')).toBe(0); expect(await count(page, 'Water')).toBeGreaterThan(0);
    await setupPhysics(page, { fills: [
        { material: 'Stone', x: 100, y: 35, width: 8, height: 4 },
        { material: 'Wall', x: 100, y: 40, width: 8, height: 1 },
        { material: 'Gunpowder', x: 102, y: 32, width: 3, height: 2 },
        { material: 'Glass', x: 110, y: 31, width: 3, height: 3 },
        { material: 'Ceramic', x: 115, y: 31, width: 3, height: 3 },
        { material: 'Wall', x: 120, y: 31, width: 3, height: 3 }
    ], cells: [{ x: 103, y: 33, material: 'Fire' }] });
    const protectedBefore = await page.evaluate(async () => {
        const p = await import('/physics.js');
        return Object.fromEntries(['Glass', 'Ceramic', 'Wall'].map(name => [name, [...p.getWorld().type].filter(value => value === p.getDefinitions().findIndex(d => d?.name === name)).length]));
    });
    await game.step(160);
    expect(await count(page, 'Stone')).toBeLessThan(32);
    for (const name of ['Glass', 'Ceramic', 'Wall']) expect(await count(page, name)).toBe(protectedBefore[name]);
});

test('seed rejection, plant growth and cold decay follow distinct material rules', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame(); await game.seed(808);
    await setupPhysics(page, { fills: [{ material: 'Wet Mud', x: 10, y: 38, width: 12, height: 2 }, { material: 'Dry Mud', x: 35, y: 38, width: 12, height: 2 }], cells: [{ x: 15, y: 37, material: 'Seed' }, { x: 40, y: 37, material: 'Seed' }, { x: -1, y: 37, material: 'Seed' }] });
    expect(await count(page, 'Seed')).toBe(2);
    await game.step(750);
    expect(await count(page, 'Plant')).toBeGreaterThan(0);
    const dryPlant = await page.evaluate(async () => { const p = await import('/physics.js'); const w = p.getWorld(); const ids = new Set(['Plant', 'Grass', 'Ash Grass'].map(n => p.getDefinitions().findIndex(d => d?.name === n))); return [...w.type].filter((id, i) => i % w.cols >= 30 && ids.has(id)).length; });
    expect(dryPlant).toBe(0);
    await setupPhysics(page, { cells: [{ x: 70, y: 20, material: 'Plant' }, { x: 70, y: 21, material: 'Wall' }], temperatures: [{ x: 70, y: 20, value: -20 }] }); await game.step(10);
    expect(await count(page, 'Sand')).toBeGreaterThan(0);
});

test('wind moves light ash, leaves trails, and a wall shelters downwind cells', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await setupPhysics(page, { cells: [{ x: 70, y: 25, material: 'Ash' }, { x: 72, y: 25, material: 'Wall' }, { x: 74, y: 25, material: 'Ash' }], seed: 909 });
    await page.evaluate(async () => (await import('/physics.js')).applyWind(70, 25, 1, 0, 5, 3));
    await game.step(0);
    const ashAfterWind = await cellsOf(page, 'Ash');
    expect(ashAfterWind.some(({ x }) => x > 70 && x < 72)).toBe(true);
    expect(ashAfterWind.some(({ x }) => x === 74)).toBe(true);
    expect(ashAfterWind.some(({ x }) => x > 74)).toBe(false);
    const wind = await page.evaluate(async () => { const p = await import('/physics.js'); return [...p.getWindTrails()].some(value => value > 0); });
    expect(wind).toBe(true);
});
