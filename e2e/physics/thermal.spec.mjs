import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';
import { setupPhysics, count, cell } from './fixtures.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'thermal');
});

test('temperature integrates gradually, then crosses ice and water phase boundaries', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame(); await game.seed(303);
    await setupPhysics(page, { cells: [{ x: 50, y: 35, material: 'Ice' }, { x: 50, y: 36, material: 'Wall' }] });
    const initial = await cell(page, 50, 35);
    await game.step(3);
    const early = await cell(page, 50, 35);
    expect(early.type).toBe(initial.type);
    expect(early.temp).toBeGreaterThan(initial.temp);
    await setupPhysics(page, { cells: [{ x: 50, y: 35, material: 'Ice' }, { x: 50, y: 36, material: 'Wall' }], temperatures: [{ x: 50, y: 35, value: 100, heat: 2001 }] });
    await game.step(1);
    expect((await cell(page, 50, 35)).type).toBe((await game.state()).definitions.find(d => d?.name === 'Water').id);
    await setupPhysics(page, { cells: [{ x: 50, y: 35, material: 'Water' }, { x: 50, y: 36, material: 'Wall' }], temperatures: [{ x: 50, y: 35, value: 200, heat: 401 }] });
    await game.step(1);
    expect((await cell(page, 50, 35)).type).toBe((await game.state()).definitions.find(d => d?.name === 'Steam').id);
});

test('fire rises, radiates into fuel, and water extinguishes it', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await setupPhysics(page, {
        fills: [{ material: 'Wood', x: 35, y: 25, width: 8, height: 5 }],
        cells: [{ x: 38, y: 30, material: 'Fire' }, { x: 37, y: 24, material: 'Water' }]
    });
    const woodBefore = await count(page, 'Wood');
    await game.step(220);
    expect(await count(page, 'Wood')).toBeLessThan(woodBefore);
    expect(await count(page, 'Ash')).toBeGreaterThan(0);
    await setupPhysics(page, { cells: [
        { x: 100, y: 35, material: 'Fire' }, { x: 100, y: 36, material: 'Water' }, { x: 100, y: 37, material: 'Wall' }
    ] });
    await game.step(10);
    expect(await count(page, 'Fire')).toBe(0);
});

test('hot and cold edge fixtures do not create uncontrolled RAF ticks while paused', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    const before = await game.state();
    await setupPhysics(page, { cells: [{ x: 0, y: 0, material: 'Lava' }, { x: before.cols - 1, y: before.rows - 1, material: 'Ice' }] });
    const paused = await game.state();
    expect(paused.frameCount).toBe(before.frameCount);
    await game.step(0);
    expect((await game.state()).frameCount).toBe(paused.frameCount);
});

test('lava cools through scoria into stone and reheating reverses both transitions', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await setupPhysics(page, { fills: [{ material: 'Wall', x: 70, y: 42, width: 21, height: 1 }, { material: 'Lava', x: 78, y: 40, width: 5, height: 2 }] });
    await game.step(2600);
    expect(await page.evaluate(async () => { const p = await import('/physics.js'); const w = p.getWorld(); const stone = p.getDefinitions().findIndex(d => d?.name === 'Stone'); return [...w.type].filter(value => value === stone).length; })).toBeGreaterThan(0);
    await page.evaluate(async () => {
        const p = await import('/physics.js'); const lava = p.getDefinitions().findIndex(d => d?.name === 'Lava');
        const i = [...p.getWorld().type].findIndex(value => value === p.getDefinitions().findIndex(d => d?.name === 'Stone'));
        p.getWorld().type[i] = lava; p.getWorld().temp[i] = 1200; p.getWorld().heat[i] = 1000;
    });
    await game.step(80);
    expect(await countType(page, 'Lava')).toBeGreaterThan(0);
});

test('heat conducts and radiates locally while thick glass insulates its interior', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await setupPhysics(page, {
        fills: [{ material: 'Glass', x: 80, y: 20, width: 9, height: 9 }]
    });
    await page.evaluate(async () => {
        const p = await import('/physics.js');
        p.setAmbientTarget(-40);
        const w = p.getWorld();
        for (let y = 20; y < 29; y++) for (let x = 80; x < 89; x++) w.temp[p.index(x, y)] = 300;
    });
    await game.step(100);
    expect((await cell(page, 84, 24)).temp).toBeGreaterThan((await cell(page, 80, 24)).temp);
    expect((await cell(page, 84, 24)).temp).toBeGreaterThan(50);
});

async function countType(page, material) {
    return page.evaluate(async material => { const p = await import('/physics.js'); const id = p.getDefinitions().findIndex(d => d?.name === material); return [...p.getWorld().type].filter(value => value === id).length; }, material);
}

test('ambient target eases and altitude layers produce a colder upper world', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await setupPhysics(page, { cells: [{ x: 100, y: 4, material: 'Stone' }, { x: 100, y: 70, material: 'Stone' }] });
    const values = await page.evaluate(async () => {
        const p = await import('/physics.js'); p.setLayerLapse(6); p.setAmbientTarget(20); return { top: p.getAirTempAt(4), bottom: p.getAirTempAt(70), ambient: p.getAmbientTemp() };
    });
    expect(values.top).toBeLessThan(values.bottom);
    expect(values.ambient).not.toBe(20);
    await game.step(900);
    expect(await page.evaluate(async () => (await import('/physics.js')).getAmbientTemp())).toBeGreaterThan(15);
});
