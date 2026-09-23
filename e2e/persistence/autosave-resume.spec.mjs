import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { clickCanvasCell } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'autosave');
});

test('resume slot is offered on startup and restores the saved snapshot', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await page.locator('#brushSize').fill('1');
    await clickCanvasCell(page, { x: 12, y: 12 });
    await page.getByRole('button', { name: 'Export' }).click();
    const save = await page.locator('#saveString').inputValue();
    await page.evaluate(value => localStorage.setItem('elemental-foundry.autosave.v1', value), save);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Resume Game' })).toBeVisible();
    await page.getByRole('button', { name: 'Resume Game' }).click();
    await expect(page.locator('#canvasContainer')).toBeVisible();
    const state = await game.state(); const sand = state.definitions.find(def => def.name === 'Sand').id;
    expect(state.typeCounts[String(sand)]).toBeGreaterThan(0);
});

test('New Game replacement choices preserve, discard, or replace the saved resume boundary', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await clickCanvasCell(page, { x: 14, y: 14 });
    await page.getByRole('button', { name: 'Export' }).click();
    const originalResume = await page.evaluate(() => localStorage.getItem('elemental-foundry.autosave.v1'));
    await page.locator('#closeSaveDialog').click();
    await page.reload();

    await page.getByRole('button', { name: 'New Game' }).click();
    await expect(page.locator('#autosaveChoiceDialog')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.evaluate(() => localStorage.getItem('elemental-foundry.autosave.v1'))).resolves.toBe(originalResume);

    await page.getByRole('button', { name: 'New Game' }).click();
    await page.getByRole('button', { name: 'No, play without autosave' }).click();
    await expect(page.locator('#canvasContainer')).toBeVisible();
    await expect(page.evaluate(() => localStorage.getItem('elemental-foundry.autosave.v1'))).resolves.toBe(originalResume);
    await page.reload();

    await page.getByRole('button', { name: 'New Game' }).click();
    await page.getByRole('button', { name: 'Yes, replace it' }).click();
    await expect(page.locator('#canvasContainer')).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('elemental-foundry.autosave.v1')))
        .not.toBe(originalResume);
});

test('clear cancel and confirm keep the prior autosave available to Resume Game', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await page.getByRole('button', { name: 'Water', exact: true }).click();
    await clickCanvasCell(page, { x: 20, y: 20 });
    await page.getByRole('button', { name: 'Export' }).click();
    const saved = await page.locator('#saveString').inputValue();
    await page.locator('#closeSaveDialog').click();
    await page.evaluate(value => localStorage.setItem('elemental-foundry.autosave.v1', value), saved);
    const before = await game.state();
    const water = before.definitions.find(definition => definition?.name === 'Water').id;

    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.locator('#clearDialog')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect((await game.state()).typeCounts[String(water)]).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Clear' }).click();
    await page.getByRole('button', { name: 'Clear World' }).click();
    expect((await game.state()).typeCounts[String(water)] || 0).toBe(0);
    await expect(page.evaluate(() => localStorage.getItem('elemental-foundry.autosave.v1'))).resolves.toBe(saved);

    await page.reload();
    await page.getByRole('button', { name: 'Resume Game' }).click();
    const resumed = await game.state();
    expect(resumed.typeCounts[String(water)]).toBeGreaterThan(0);
});
