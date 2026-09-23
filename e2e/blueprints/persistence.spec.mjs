import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { canvasPoint, dragCanvasCells } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

async function capture(page, from, to) {
    await page.getByRole('tab', { name: 'Blueprints' }).click();
    await page.getByRole('button', { name: /Marquee/ }).click();
    await dragCanvasCells(page, from, to);
    await page.getByRole('button', { name: 'Copy selection' }).click();
}

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page);
});

test('captures multiple library slots and wraps after the final slot', async ({ page }) => {
    test.setTimeout(60_000);
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        physics.clearWorld();
        physics.setCell(5, 5, physics.getDefinitions().findIndex(def => def?.name === 'Sand'));
    });
    for (let slot = 1; slot <= 24; slot++) {
        await capture(page, { x: 5, y: 5 }, { x: 5, y: 5 });
        await expect(page.getByRole('button', { name: `Blueprint ${slot}`, exact: true })).toBeVisible();
        await page.getByRole('button', { name: /Marquee/ }).click();
    }
    await capture(page, { x: 5, y: 5 }, { x: 5, y: 5 });
    await expect(page.getByRole('button', { name: 'Blueprint 1', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Blueprint 25', exact: true })).toHaveCount(0);
    await expect(game.state()).resolves.toMatchObject({ cols: expect.any(Number) });
});

test('portable export and import restores the blueprint library and stamp result', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        physics.clearWorld();
        const sand = physics.getDefinitions().findIndex(def => def?.name === 'Sand');
        const water = physics.getDefinitions().findIndex(def => def?.name === 'Water');
        physics.setCell(8, 8, sand);
        physics.setCell(9, 8, water);
    });
    await capture(page, { x: 8, y: 8 }, { x: 9, y: 8 });
    await page.getByRole('tab', { name: 'Tools' }).click();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const save = page.locator('#saveString');
    await expect(save).toHaveValue(/.+/);
    const portable = await save.inputValue();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await save.fill(portable);
    await page.getByRole('button', { name: 'Load Game', exact: true }).click();
    await expect(page.locator('#autosaveChoiceDialog')).toBeVisible();
    await page.getByRole('button', { name: 'Yes, replace it', exact: true }).click();
    await page.getByRole('tab', { name: 'Blueprints' }).click();
    await expect(page.getByRole('button', { name: 'Blueprint 1', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Blueprint 1', exact: true }).click();
    await page.mouse.click(...Object.values(await canvasPoint(page, { x: 20, y: 20 })));
    const state = await game.state();
    expect(state.arrays.type[20 + 20 * state.cols]).toBeGreaterThan(0);
    expect(state.arrays.type[21 + 20 * state.cols]).toBeGreaterThan(0);
});
