import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { canvasPoint } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'shapes');
});

async function gesture(page, from, to) {
    const a = await canvasPoint(page, from); const b = await canvasPoint(page, to);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 3 }); await page.mouse.up();
}

test('line, rectangle, and ellipse preview then commit through real drags', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame(); await game.seed(22);
    await page.getByRole('button', { name: 'Water', exact: true }).click();
    const state0 = await game.state(); const water = state0.definitions.find(def => def.name === 'Water').id;
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
    expect(state.arrays.type[10 * state.cols + 30]).toBe(water);
    expect(state.arrays.type[11 * state.cols + 41]).toBe(water);
    expect(state.arrays.type[12 * state.cols + 52]).toBe(water);
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

test('line uses brush size, shapes preserve occupied cells, and footprints clip at edges', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame(); await game.seed(23);
    await game.setFixture([{ x: 42, y: 42, type: 'Stone' }]);
    await page.getByRole('button', { name: 'Water', exact: true }).click();

    await page.locator('#brushSize').fill('5');
    await page.getByRole('button', { name: 'Line mode' }).click();
    await gesture(page, { x: 30, y: 30 }, { x: 34, y: 30 });
    const lineState = await game.state();
    const water = lineState.definitions.find(definition => definition?.name === 'Water').id;
    expect([28, 29, 30, 31, 32].every(y => lineState.arrays.type[y * lineState.cols + 32] === water)).toBe(true);

    await page.getByRole('button', { name: 'Rectangle mode' }).click();
    await expect(page.locator('#brushSize')).toBeDisabled();
    await gesture(page, { x: 40, y: 40 }, { x: 44, y: 44 });
    await page.getByRole('button', { name: 'Rectangle mode' }).click();
    await gesture(page, { x: 0, y: 0 }, { x: 3, y: 3 });

    const state = await game.state();
    const stone = state.definitions.find(definition => definition?.name === 'Stone').id;
    expect(state.arrays.type[42 * state.cols + 42]).toBe(stone);
    expect(state.arrays.type[0]).toBe(water);
    expect(state.arrays.type[3 * state.cols + 3]).toBe(water);
    expect(state.typeCounts[String(water)]).toBeGreaterThan(20);
});

test('right-release cancels an in-progress shape preview without committing it', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await page.getByRole('button', { name: 'Water', exact: true }).click();
    await page.getByRole('button', { name: 'Ellipse mode' }).click();
    const from = await canvasPoint(page, { x: 70, y: 70 });
    const to = await canvasPoint(page, { x: 80, y: 78 });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 2 });
    await page.mouse.up({ button: 'right' });
    await expect(page.locator('#toolTooltip')).toBeHidden();
    const state = await game.state();
    const water = state.definitions.find(definition => definition?.name === 'Water').id;
    expect(state.typeCounts[String(water)] || 0).toBe(0);
});
