import { test, expect } from '@playwright/test';
import { GamePage } from './helpers/gamePage.mjs';
import { canvasMetrics } from './helpers/canvas.mjs';
import { attachGameDiagnostics } from './helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page);
});

test('real app exposes deterministic E2E baseline contract', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const metrics = await canvasMetrics(page);
    expect(metrics.width).toBeGreaterThan(0);
    expect(metrics.height).toBeGreaterThan(0);

    await game.seed(12345);
    const initial = await game.state();
    expect(initial.randomSeed).toBe(12345);
    expect(initial.version).toBe(1);

    const before = initial.frameCount;
    const after = await game.step(7);
    expect(after.frameCount).toBe(before + 7);
    expect(after.randomSeed).toBe(12345);

    const mapped = await page.evaluate(() => {
        const canvas = document.querySelector('#canvas');
        const rect = canvas.getBoundingClientRect();
        return window.__GAME_INSTANCE__.canvasToCell({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    });
    expect(mapped.x).toBe(Math.floor(after.cols / 2));
    expect(mapped.y).toBe(Math.floor(after.rows / 2));
});
