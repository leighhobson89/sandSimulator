import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { canvasPoint } from '../helpers/canvas.mjs';

async function gesture(page, from, to) {
    const a = await canvasPoint(page, from); const b = await canvasPoint(page, to);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 3 }); await page.mouse.up();
}

test('line, rectangle, and ellipse preview then commit through real drags', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame(); await game.seed(22);
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    const state0 = await game.state(); const sand = state0.definitions.find(def => def.name === 'Sand').id;
    for (const [name, from, to] of [
        ['Line mode', { x: 30, y: 10 }, { x: 34, y: 10 }],
        ['Rectangle mode', { x: 40, y: 10 }, { x: 43, y: 13 }],
        ['Ellipse mode', { x: 50, y: 10 }, { x: 54, y: 14 }]
    ]) {
        await page.getByRole('button', { name }).click();
        await expect(page.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
        await gesture(page, from, to);
    }
    const state = await game.state();
    expect(state.arrays.type[10 * state.cols + 30]).toBe(sand);
    expect(state.arrays.type[11 * state.cols + 41]).toBe(sand);
    expect(state.arrays.type[12 * state.cols + 52]).toBe(sand);
});

test('shape preview is cancelled when the pointer is released outside the canvas', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await page.getByRole('button', { name: 'Rectangle mode' }).click();
    const point = await canvasPoint(page, { x: 10, y: 10 });
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    await page.mouse.move(0, 0); await page.mouse.up();
    const state = await game.state();
    expect(state.typeCounts['0']).toBeGreaterThanOrEqual(state.cols * state.rows - 1);
});
