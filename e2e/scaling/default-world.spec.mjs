import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
        await attachGameDiagnostics(testInfo, page, 'default-world');
    }
});

test('new worlds keep the fitted 150-row default without a size control', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await expect(page.locator('#worldSize')).toHaveCount(0);

    await game.newGame();
    const state = await game.state();
    const canvas = await page.locator('#canvas').evaluate(element => ({
        width: element.width,
        height: element.height
    }));
    const expectedCols = await page.locator('#canvasArea').evaluate(area => {
        const availableHeight = Math.max(1, area.clientHeight - 32);
        const targetWidth = Math.max(1, area.clientWidth - 32);
        const cellSize = Math.max(1, availableHeight / 150);
        return Math.max(200, Math.floor(targetWidth / cellSize));
    });

    expect(state.rows).toBe(150);
    expect(state.cols).toBe(expectedCols);
    expect(canvas).toEqual({ width: state.cols, height: state.rows });
});
