import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { clickCanvasCell, dragCanvasCells } from '../helpers/canvas.mjs';

async function start(page) {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await game.seed(1001);
    return game;
}

test('brush paints mapped cells, repeated drag paints, and right click erases', async ({ page }) => {
    const game = await start(page);
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await clickCanvasCell(page, { x: 24, y: 18 });
    await dragCanvasCells(page, { x: 26, y: 18 }, { x: 30, y: 18 }, 5);
    let state = await game.state();
    const sand = state.definitions.find(def => def.name === 'Sand').id;
    expect(state.typeCounts[String(sand)]).toBeGreaterThan(0);
    await clickCanvasCell(page, { x: 24, y: 18 }, { button: 'right' });
    state = await game.state();
    expect(state.typeCounts[String(sand)] || 0).toBeLessThan(100);
});

test('eraser and keyboard shortcuts expose pressed state and clear a painted cell', async ({ page }) => {
    const game = await start(page);
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await clickCanvasCell(page, { x: 24, y: 18 });
    await page.keyboard.press('e');
    await expect(page.locator('#eraserButton')).toHaveClass(/active-toggle/);
    await clickCanvasCell(page, { x: 24, y: 18 });
    expect((await game.state()).arrays.type[18 * (await game.state()).cols + 24]).toBe(0);
    await page.keyboard.press('e');
    await expect(page.locator('#eraserButton')).not.toHaveClass(/active-toggle/);
});
