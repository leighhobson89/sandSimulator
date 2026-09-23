import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { clickCanvasCell, dragCanvasCells } from '../helpers/canvas.mjs';

test('grabber picks up a material, moves it, and drops it', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame(); await game.seed(7);
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await clickCanvasCell(page, { x: 24, y: 18 });
    await page.getByRole('button', { name: 'Grabber' }).click();
    await expect(page.locator('#grabberButton')).toHaveAttribute('aria-pressed', 'true');
    await dragCanvasCells(page, { x: 24, y: 18 }, { x: 30, y: 18 });
    const state = await game.state(); const sand = state.definitions.find(def => def.name === 'Sand').id;
    expect(state.typeCounts[String(sand)]).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Grabber' }).click();
    await expect(page.locator('#grabberButton')).toHaveAttribute('aria-pressed', 'false');
});
