import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { canvasPoint, clickCanvasCell, dragCanvasCells } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'painting');
});

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

test('brush size changes the circular footprint and keyboard bounds', async ({ page }) => {
    const game = await start(page);
    await page.getByRole('button', { name: 'Water', exact: true }).click();
    await page.locator('#brushSize').fill('5');
    await expect(page.locator('#brushSizeValue')).toHaveText('5');
    await clickCanvasCell(page, { x: 50, y: 50 });

    const state = await game.state();
    const water = state.definitions.find(definition => definition?.name === 'Water').id;
    const footprint = [];
    for (let y = 47; y <= 53; y++) {
        for (let x = 47; x <= 53; x++) {
            if (state.arrays.type[y * state.cols + x] === water) footprint.push({ x, y });
        }
    }
    expect(footprint).toHaveLength(13);

    await page.keyboard.press('[');
    await expect(page.locator('#brushSize')).toHaveValue('3');
    await page.locator('#brushSize').fill('1');
    await page.keyboard.press('[');
    await expect(page.locator('#brushSize')).toHaveValue('1');
    await page.locator('#brushSize').fill('31');
    await page.keyboard.press(']');
    await expect(page.locator('#brushSize')).toHaveValue('31');
});

test('holding a real brush gesture repeats paint until release', async ({ page }) => {
    const game = await start(page);
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await page.locator('#brushSize').fill('3');
    const point = await canvasPoint(page, { x: 64, y: 50 });
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    const initial = await game.state();
    const sand = initial.definitions.find(definition => definition?.name === 'Sand').id;
    const initiallyPainted = initial.typeCounts[String(sand)] || 0;
    await expect.poll(async () => (await game.state()).typeCounts[String(sand)] || 0)
        .toBeGreaterThan(initiallyPainted);
    await page.mouse.up();
    await expect(game.state()).resolves.toMatchObject({ frameCount: expect.any(Number) });
});

function dataAt(state, { x, y }) {
    return state.arrays.data[y * state.cols + x];
}

function typeAt(state, { x, y }) {
    return state.arrays.type[y * state.cols + x];
}

test('hand-painted rays choose, retain, reset, and move with stroke direction', async ({ page }) => {
    const game = await start(page);
    await page.locator('#brushSize').fill('1');

    for (const ray of [
        { name: 'Heat Ray', defaultDirection: 2, stepY: -2 },
        { name: 'Cold Ray', defaultDirection: 3, stepY: 2 }
    ]) {
        await game.setFixture([]);
        await page.getByRole('button', { name: ray.name, exact: true }).click();
        const rayId = (await game.state()).definitions.find(definition => definition?.name === ray.name).id;
        const origin = await canvasPoint(page, { x: 40, y: 50 });
        const right = await canvasPoint(page, { x: 44, y: 50 });
        const left = await canvasPoint(page, { x: 36, y: 50 });
        const nextStroke = { x: 60, y: 50 };
        const nextPoint = await canvasPoint(page, nextStroke);

        await page.mouse.move(origin.x, origin.y);
        await page.mouse.down();
        let state = await game.state();
        expect(typeAt(state, { x: 40, y: 50 })).toBe(rayId);
        expect(dataAt(state, { x: 40, y: 50 })).toBe(ray.defaultDirection);

        await page.mouse.move(right.x, right.y);
        state = await game.state();
        expect(dataAt(state, { x: 44, y: 50 })).toBe(0);

        // Timer painting while the pointer is stationary must not reset the
        // heading selected by the preceding movement.
        await page.waitForTimeout(70);
        state = await game.state();
        expect(dataAt(state, { x: 44, y: 50 })).toBe(0);

        await page.mouse.move(left.x, left.y);
        state = await game.state();
        expect(dataAt(state, { x: 36, y: 50 })).toBe(1);
        await page.mouse.up();

        // A fresh left-button stroke returns to the tool-specific default.
        await page.mouse.move(nextPoint.x, nextPoint.y);
        await page.mouse.down();
        state = await game.state();
        expect(dataAt(state, nextStroke)).toBe(ray.defaultDirection);
        await page.mouse.up();

        // The stored heading is also used by the simulation projectile pass.
        await game.step(1);
        state = await game.state();
        expect(typeAt(state, nextStroke)).toBe(0);
        expect(typeAt(state, { x: nextStroke.x, y: nextStroke.y + ray.stepY })).toBe(rayId);
    }
});
