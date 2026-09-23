import { test, expect } from '@playwright/test';
import { GamePage } from './gamePage.mjs';
import { canvasMetrics, canvasPoint } from './canvas.mjs';
import { attachGameDiagnostics } from './diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page);
});

test('canvas helper maps CSS points to exact game cells', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const metrics = await canvasMetrics(page);
    const point = await canvasPoint(page, { x: 12, y: 9 });
    const mapped = await page.evaluate(({ x, y }) => window.__GAME_INSTANCE__.canvasToCell({ x, y }), point);

    expect(mapped).toEqual({ x: 12, y: 9 });
    expect(metrics.width).toBeGreaterThan(12);
    expect(metrics.height).toBeGreaterThan(9);
});

test('canvas helper rejects invalid cells and maps both canvas corners', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const metrics = await canvasMetrics(page);

    for (const cell of [
        { x: -1, y: 0 }, { x: 0, y: -1 },
        { x: metrics.width, y: 0 }, { x: 0, y: metrics.height },
        { x: 1.5, y: 0 }
    ]) {
        await expect(canvasPoint(page, cell)).rejects.toThrow(/outside the viewport/);
    }

    await expect(canvasPoint(page, { x: 0, y: 0 })).resolves.toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    await expect(canvasPoint(page, { x: metrics.width - 1, y: metrics.height - 1 }))
        .resolves.toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));

    const edgeMapping = await page.locator('#canvas').evaluate(canvas => {
        const rect = canvas.getBoundingClientRect();
        return {
            rightBottom: window.__GAME_INSTANCE__.canvasToCell({ x: rect.right - 0.01, y: rect.bottom - 0.01 }),
            outside: window.__GAME_INSTANCE__.canvasToCell({ x: rect.left - 1, y: rect.top - 1 })
        };
    });
    expect(edgeMapping.rightBottom).toEqual({ x: metrics.width - 1, y: metrics.height - 1 });
    expect(edgeMapping.outside).toEqual({ x: -1, y: -1 });
});

test('canvas keeps one pixel per cell, square CSS scaling, and pixelated rendering after resize', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const initial = await game.state();
    const first = await canvasMetrics(page);
    expect(first.width).toBe(initial.cols);
    expect(first.height).toBe(initial.rows);
    await expect(page.locator('#canvas')).toHaveCSS('image-rendering', /pixelated|crisp-edges/);
    expect(first.rect.width / first.rect.height).toBeCloseTo(initial.cols / initial.rows, 2);

    await page.setViewportSize({ width: 700, height: 700 });
    const resized = await canvasMetrics(page);
    expect(resized.width).toBe(initial.cols);
    expect(resized.height).toBe(initial.rows);
    expect(resized.rect.width / resized.rect.height).toBeCloseTo(initial.cols / initial.rows, 2);
    const mapped = await page.evaluate(({ x, y }) => window.__GAME_INSTANCE__.canvasToCell({ x, y }),
        { x: resized.rect.x + resized.rect.width - 0.01, y: resized.rect.y + resized.rect.height - 0.01 });
    expect(mapped).toEqual({ x: resized.width - 1, y: resized.height - 1 });
});

test('canvas mapping remains correct at a narrow mobile viewport and fractional CSS scale', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const initial = await game.state();

    await page.setViewportSize({ width: 390, height: 844 });
    const metrics = await canvasMetrics(page);
    expect(metrics.width).toBe(initial.cols);
    expect(metrics.height).toBe(initial.rows);
    expect(metrics.rect.width).toBeGreaterThan(0);
    expect(metrics.rect.height).toBeGreaterThan(0);
    expect(metrics.rect.width / metrics.rect.height).toBeCloseTo(initial.cols / initial.rows, 2);

    for (const cell of [
        { x: 0, y: 0 },
        { x: Math.floor(initial.cols / 2), y: Math.floor(initial.rows / 2) },
        { x: initial.cols - 1, y: initial.rows - 1 }
    ]) {
        const point = await canvasPoint(page, cell);
        await expect(page.evaluate(value => window.__GAME_INSTANCE__.canvasToCell(value), point))
            .resolves.toEqual(cell);
    }
});

test('game helper controls deterministic stepping and copied snapshots', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await game.seed(4242);

    const initial = await game.state();
    const snapshot = await page.evaluate(() => window.__GAME_INSTANCE__.captureState());
    const stepped = await game.step(5);

    expect(stepped.frameCount).toBe(initial.frameCount + 5);
    expect(stepped.randomSeed).toBe(4242);
    expect(snapshot.arrays.type).not.toBe(stepped.arrays.type);

    const restored = await page.evaluate(state => window.__GAME_INSTANCE__.restoreState(state), snapshot);
    expect(restored.frameCount).toBe(snapshot.frameCount);
    expect(restored.arrays.type).toEqual(snapshot.arrays.type);
    expect(restored.arrays.temp).toEqual(snapshot.arrays.temp);
});

test('game helper handles edge stepping and cell inspection', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const initial = await game.state();

    for (const count of [0, -2, 1.9, '2']) {
        const before = await game.state();
        const after = await game.step(count);
        const expected = Math.max(0, Math.floor(Number(count)));
        expect(after.frameCount).toBe(before.frameCount + expected);
    }

    await expect(game.step(Number.NaN)).resolves.toMatchObject({ frameCount: expect.any(Number) });
    await expect(page.evaluate(() => window.__GAME_INSTANCE__.cell(0, 0)))
        .resolves.toMatchObject({ x: 0, y: 0, index: 0 });
    await expect(page.evaluate(() => window.__GAME_INSTANCE__.cell(-1, 0))).resolves.toBeNull();
    await expect(page.evaluate(({ cols, rows }) => window.__GAME_INSTANCE__.cell(cols, rows), initial))
        .resolves.toBeNull();
});
