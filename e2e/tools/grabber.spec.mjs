import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { canvasPoint, clickCanvasCell, dragCanvasCells } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'grabber');
});

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

test('grabber moves the selected material footprint and preserves its exact source/destination cells', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    const fixture = [];
    for (let y = 59; y <= 61; y++) for (let x = 59; x <= 61; x++) fixture.push({ x, y, type: 'Stone' });
    await game.setFixture(fixture);
    await page.locator('#grabberSize').fill('3');
    await page.getByRole('button', { name: 'Grabber' }).click();
    await dragCanvasCells(page, { x: 60, y: 60 }, { x: 80, y: 60 });

    const state = await game.state();
    const stone = state.definitions.find(definition => definition?.name === 'Stone').id;
    for (let y = 59; y <= 61; y++) {
        for (let x = 59; x <= 61; x++) expect(state.arrays.type[y * state.cols + x]).toBe(0);
        for (let x = 79; x <= 81; x++) expect(state.arrays.type[y * state.cols + x]).toBe(stone);
    }
});

test('empty pickup is blocked, edge drops clamp, and grabber size controls the footprint', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    const fixture = [];
    for (let y = 48; y <= 52; y++) for (let x = 48; x <= 52; x++) fixture.push({ x, y, type: 'Stone' });
    await game.setFixture(fixture);
    await page.locator('#grabberSize').fill('5');
    await page.getByRole('button', { name: 'Grabber' }).click();
    await clickCanvasCell(page, { x: 40, y: 40 });
    expect((await game.state()).typeCounts['0']).toBeGreaterThan(0);

    await dragCanvasCells(page, { x: 50, y: 50 }, { x: 0, y: 0 });
    const state = await game.state();
    const stone = state.definitions.find(definition => definition?.name === 'Stone').id;
    expect(state.arrays.type[50 * state.cols + 50]).toBe(0);
    for (let y = 0; y <= 4; y++) for (let x = 0; x <= 4; x++) {
        expect(state.arrays.type[y * state.cols + x]).toBe(stone);
    }
});

test('turning Grabber off while holding restores the source and selecting a material exits the mode', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await game.setFixture([{ x: 50, y: 50, type: 'Stone' }]);
    await page.getByRole('button', { name: 'Grabber' }).click();
    const source = await canvasPoint(page, { x: 50, y: 50 });
    await page.mouse.move(source.x, source.y); await page.mouse.down();
    await page.getByRole('button', { name: 'Water', exact: true }).click();
    await page.mouse.up();
    await expect(page.locator('#grabberButton')).toHaveAttribute('aria-pressed', 'false');
    const state = await game.state();
    const stone = state.definitions.find(definition => definition?.name === 'Stone').id;
    expect(state.arrays.type[50 * state.cols + 50]).toBe(stone);
});
