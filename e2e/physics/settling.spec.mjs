import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { clickCanvasCell } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';
import { setupPhysics, count, cellsOf } from './fixtures.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'settling');
});

test('real brush input settles sand, preserves count, and blocks at a wall', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame(); await game.seed(101);
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await clickCanvasCell(page, { x: 40, y: 4 });
    await clickCanvasCell(page, { x: 40, y: 5 });
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const wall = physics.getDefinitions().findIndex(definition => definition?.name === 'Wall');
        physics.setCell(40, 40, wall);
    });
    await setupPhysics(page, {
        cells: [{ x: 40, y: 4, material: 'Sand' }, { x: 40, y: 5, material: 'Sand' }, { x: 40, y: 40, material: 'Wall' }],
        seed: 101
    });
    const sandBefore = await count(page, 'Sand');
    expect(sandBefore).toBe(2);
    await game.step(40);
    const sand = await cellsOf(page, 'Sand');
    expect(sand).toHaveLength(sandBefore);
    expect(Math.max(...sand.map(({ y }) => y))).toBeGreaterThan(5);
    expect((await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        return world.type[physics.index(40, 40)] === physics.getDefinitions().findIndex(definition => definition?.name === 'Wall');
    }))).toBe(true);
});

test('liquid flow spreads to a level and remains conserved in an empty edge world', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await setupPhysics(page, { seed: 202, fills: [{ material: 'Water', x: 20, y: 8, width: 6, height: 12 }] });
    const before = await count(page, 'Water');
    await game.step(260);
    const water = await cellsOf(page, 'Water');
    expect(water).toHaveLength(before);
    expect(new Set(water.map(({ x }) => x)).size).toBeGreaterThan(20);
    const tops = new Map();
    for (const { x, y } of water) tops.set(x, Math.min(tops.get(x) ?? y, y));
    const values = [...tops.values()];
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(2);
});

test('reset clears settled and liquid state, including an empty world boundary', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await setupPhysics(page, { cells: [{ x: 0, y: 0, material: 'Sand' }, { x: 1, y: 0, material: 'Water' }] });
    await game.step(20);
    await page.evaluate(async () => (await import('/physics.js')).clearWorld());
    const state = await game.step(0);
    expect(state.typeCounts).toEqual({ 0: state.cols * state.rows });
});

test('density orders ice and oil above water while sand sinks below it', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await setupPhysics(page, {
        seed: 505,
        fills: [
            { material: 'Wall', x: 25, y: 145, width: 40, height: 1 },
            { material: 'Wall', x: 29, y: 120, width: 18, height: 1 },
            { material: 'Wall', x: 29, y: 100, width: 1, height: 21 },
            { material: 'Wall', x: 46, y: 100, width: 1, height: 21 },
            { material: 'Water', x: 30, y: 100, width: 16, height: 20 }
        ],
        cells: [
            { x: 36, y: 99, material: 'Ice' }, { x: 44, y: 110, material: 'Oil' },
            { x: 52, y: 10, material: 'Sand' }
        ]
    });
    // Hold the water just above freezing so this measures buoyancy without
    // asking Ice to survive an unrelated warm-bath phase change.
    await page.evaluate(async () => {
        const p = await import('/physics.js');
        const world = p.getWorld();
        const water = p.getDefinitions().findIndex(definition => definition?.name === 'Water');
        p.setAmbientTarget(0);
        for (let i = 0; i < world.type.length; i++) {
            if (world.type[i] === water) world.temp[i] = 1;
        }
    });
    await game.step(60);
    const ice = await cellsOf(page, 'Ice'); const oil = await cellsOf(page, 'Oil');
    const sand = [...await cellsOf(page, 'Sand'), ...await cellsOf(page, 'Wet Sand'), ...await cellsOf(page, 'Wet Mud')];
    expect(ice.length).toBeGreaterThan(0); expect(oil.length).toBeGreaterThan(0); expect(sand.length).toBeGreaterThan(0);
    const density = await page.evaluate(async () => {
        const p = await import('/physics.js');
        return Object.fromEntries(['Ice', 'Oil', 'Water', 'Sand'].map(name => [name, p.getDefinitions().find(d => d?.name === name).density]));
    });
    expect(density.Ice).toBeLessThan(density.Water);
    expect(density.Oil).toBeLessThan(density.Water);
    expect(density.Sand).toBeGreaterThan(density.Water);
    expect(Math.min(...ice.map(cell => cell.y))).toBeLessThan(100);
    expect(Math.min(...oil.map(cell => cell.y))).toBeLessThanOrEqual(100);
    expect(Math.min(...sand.map(cell => cell.y))).toBeGreaterThan(120);
});

test('sealed liquid boundaries retain exact water cells without fountains or edge loss', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await setupPhysics(page, {
        fills: [
            { material: 'Wall', x: 25, y: 25, width: 25, height: 1 },
            { material: 'Wall', x: 25, y: 25, width: 1, height: 18 },
            { material: 'Wall', x: 49, y: 25, width: 1, height: 18 },
            { material: 'Wall', x: 25, y: 42, width: 25, height: 1 },
            { material: 'Water', x: 26, y: 34, width: 23, height: 8 }
        ], seed: 506
    });
    const before = await count(page, 'Water'); await game.step(300);
    const water = await cellsOf(page, 'Water');
    expect(water).toHaveLength(before);
    expect(water.every(({ x }) => x > 25 && x < 49)).toBe(true);
});

test('gas rises and spreads beneath a ceiling while static walls block movement', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await setupPhysics(page, {
        fills: [{ material: 'Wall', x: 30, y: 12, width: 30, height: 1 }],
        cells: [{ x: 44, y: 35, material: 'Steam' }, { x: 45, y: 35, material: 'Steam' }], seed: 507
    });
    await game.step(180);
    const steam = await cellsOf(page, 'Steam');
    expect(steam.length).toBeGreaterThan(0);
    expect(Math.min(...steam.map(({ y }) => y))).toBeLessThan(30);
    expect(steam.some(({ x }) => x !== 44 && x !== 45)).toBe(true);
    expect(steam.every(({ y }) => y !== 12)).toBe(true);
});
