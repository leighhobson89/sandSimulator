import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { clickCanvasCell } from '../helpers/canvas.mjs';

test('resume slot is offered on startup and restores the saved snapshot', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await page.getByRole('button', { name: 'Sand', exact: true }).click(); await clickCanvasCell(page, { x: 12, y: 12 });
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
