import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { clickCanvasCell } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page);
});

test('selected material paints its catalog ID into the mapped canvas cell', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await game.seed(3107);

    await page.getByRole('button', { name: 'Water', exact: true }).click();
    await clickCanvasCell(page, { x: 24, y: 18 });

    const state = await game.state();
    const waterId = state.definitions.find(definition => definition?.name === 'Water').id;
    expect(state.arrays.type[18 * state.cols + 24]).toBe(waterId);
});

test('canvas rendering uses the prepared material color at a painted cell', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const sand = physics.getDefinitions().findIndex(definition => definition?.name === 'Sand');
        physics.setCell(24, 18, sand);
    });
    await game.step(0);
    const state = await game.state();
    expect(state.arrays.type[18 * state.cols + 24]).toBe(
        state.definitions.find(definition => definition?.name === 'Sand').id
    );
    const pixel = await page.evaluate(() => {
        const canvas = document.querySelector('#canvas');
        return Array.from(canvas.getContext('2d').getImageData(24, 18, 1, 1).data);
    });
    const expected = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const sand = physics.getDefinitions().find(definition => definition?.name === 'Sand');
        return [...sand.rgb, 255];
    });
    expect(pixel[3]).toBe(255);
    expect(pixel.slice(0, 3).every((value, index) => Math.abs(value - expected[index]) <= 32)).toBe(true);
});

test('material buttons expose their rendered colors and selected state', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    for (const name of ['Sand', 'Water', 'Glass', 'Insulation', 'Fan', 'Wind']) {
        const button = page.getByRole('button', { name, exact: true });
        await expect(button).toHaveCSS('background-color', /rgb\(/);
        await button.click();
        await expect(button).toHaveClass(/selected/);
    }
});

test('selecting a material exits eraser, grabber, and blueprint modes', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    await page.getByRole('button', { name: 'Eraser', exact: true }).click();
    await expect(page.locator('#eraserButton')).toHaveClass(/active-toggle/);
    await page.getByRole('button', { name: 'Grabber', exact: true }).click();
    await expect(page.locator('#grabberButton')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await expect(page.locator('#eraserButton')).not.toHaveClass(/active-toggle/);
    await expect(page.locator('#grabberButton')).toHaveAttribute('aria-pressed', 'false');

    await page.getByRole('tab', { name: 'Blueprints' }).click();
    await page.getByRole('button', { name: /Marquee/ }).click();
    await expect(page.getByRole('button', { name: /Marquee/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Water', exact: true }).click();
    await expect(page.getByRole('button', { name: /Marquee/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#marqueeOverlay')).toBeHidden();
    await expect(game.state()).resolves.toMatchObject({ cols: expect.any(Number) });
});
