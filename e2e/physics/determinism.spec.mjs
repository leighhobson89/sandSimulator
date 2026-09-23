import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';
import { setupPhysics } from './fixtures.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'determinism');
});

async function scenario(game) {
    await setupPhysics(game.page, {
        seed: 98765,
        fills: [{ material: 'Sand', x: 30, y: 4, width: 8, height: 3 }, { material: 'Water', x: 60, y: 10, width: 8, height: 5 }],
        cells: [{ x: 44, y: 8, material: 'Fire' }, { x: 44, y: 9, material: 'Wood' }]
    });
    return game.step(120);
}

test('same seed and source fixture produce byte-identical semantic snapshots', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    const baseline = await page.evaluate(() => window.__GAME_INSTANCE__.captureState());
    const first = await scenario(game);
    await page.evaluate(state => window.__GAME_INSTANCE__.restoreState(state), baseline);
    const second = await scenario(game);
    expect(second.frameCount).toBe(first.frameCount);
    expect(second.arrays.type).toEqual(first.arrays.type);
    expect(second.arrays.temp).toEqual(first.arrays.temp);
    expect(second.arrays.life).toEqual(first.arrays.life);
});

test('snapshot restore rewinds frame, seed-visible state, and subsequent evolution', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame(); await game.seed(2468);
    await setupPhysics(page, { seed: 2468, cells: [{ x: 25, y: 5, material: 'Sand' }, { x: 26, y: 5, material: 'Water' }] });
    const snapshot = await page.evaluate(() => window.__GAME_INSTANCE__.captureState());
    const snapshotSeed = await page.evaluate(() => window.__GAME_INSTANCE__.getRandomSeed());
    const advanced = await game.step(40);
    const advancedSeed = await page.evaluate(() => window.__GAME_INSTANCE__.getRandomSeed());
    expect(advanced.frameCount).toBe(snapshot.frameCount + 40);
    const restored = await page.evaluate(state => window.__GAME_INSTANCE__.restoreState(state), snapshot);
    expect(restored.frameCount).toBe(snapshot.frameCount);
    expect(await page.evaluate(() => window.__GAME_INSTANCE__.getRandomSeed())).toBe(snapshotSeed);
    expect(restored.arrays.type).toEqual(snapshot.arrays.type);
    expect(restored.arrays.temp).toEqual(snapshot.arrays.temp);
    expect(restored.arrays.life).toEqual(snapshot.arrays.life);
    expect(restored.arrays.data).toEqual(snapshot.arrays.data);
    expect(restored.arrays.power).toEqual(snapshot.arrays.power);
    expect(restored.arrays.charge).toEqual(snapshot.arrays.charge);
    await setupPhysics(page, { seed: 2468, cells: [{ x: 25, y: 5, material: 'Sand' }, { x: 26, y: 5, material: 'Water' }] });
    const replayed = await game.step(40);
    expect(replayed.frameCount).toBe(advanced.frameCount);
    expect(await page.evaluate(() => window.__GAME_INSTANCE__.getRandomSeed())).toBe(advancedSeed);
    expect(replayed.arrays.type).toEqual(advanced.arrays.type);
    expect(replayed.arrays.temp).toEqual(advanced.arrays.temp);
    expect(replayed.arrays.life).toEqual(advanced.arrays.life);
    expect(replayed.arrays.data).toEqual(advanced.arrays.data);
    expect(replayed.arrays.power).toEqual(advanced.arrays.power);
    expect(replayed.arrays.charge).toEqual(advanced.arrays.charge);
});

test('seed hook reports the active seed and rejects no uncontrolled stepping', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await game.seed(0xFFFFFFFF);
    expect((await game.state()).randomSeed).toBe(0xFFFFFFFF);
    const frame = (await game.state()).frameCount;
    await game.step(0);
    expect((await game.state()).frameCount).toBe(frame);
});

test('representative electrical pulse and battery charge remain deterministic in the physics boundary', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await setupPhysics(page, { cells: [
        { x: 40, y: 25, material: 'Battery' }, { x: 41, y: 25, material: 'Copper' },
        { x: 42, y: 25, material: 'Copper' }, { x: 40, y: 24, material: 'Spark' }
    ], seed: 1111 });
    await game.step(1);
    const state = await page.evaluate(async () => { const p = await import('/physics.js'); return { charge: p.getStoredCharge(40, 25), powered: p.isPowered(41, 25), spark: p.getWorld().type[p.index(40, 24)] }; });
    expect(state.charge).toBeGreaterThan(0); expect(state.powered).toBe(true); expect(state.spark).toBe(0);
});
