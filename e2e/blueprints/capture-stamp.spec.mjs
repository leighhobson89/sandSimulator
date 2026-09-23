import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { canvasPoint, dragCanvasCells } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

async function seedPattern(page) {
    return page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        physics.clearWorld();
        physics.setCell(10, 10, id('Sand'));
        physics.setCell(11, 10, id('Water'));
        physics.setCell(10, 11, id('Oil'));
        return { sand: id('Sand'), water: id('Water'), oil: id('Oil') };
    });
}

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page);
});

test('captures a real canvas selection and stamps it from the blueprint library', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await seedPattern(page);

    await page.getByRole('tab', { name: 'Blueprints' }).click();
    const marquee = page.getByRole('button', { name: /Marquee/ });
    await expect(marquee).toHaveAttribute('aria-pressed', 'false');
    await marquee.click();
    await expect(marquee).toHaveAttribute('aria-pressed', 'true');
    await dragCanvasCells(page, { x: 10, y: 10 }, { x: 11, y: 11 });
    await expect(page.getByRole('button', { name: 'Copy selection' })).toBeEnabled();
    await page.getByRole('button', { name: 'Copy selection' }).click();

    const slot = page.getByRole('button', { name: 'Blueprint 1', exact: true });
    await expect(slot).toBeVisible();
});

test('stamps the copied cells at a new location and exposes a preview', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const ids = await seedPattern(page);

    await page.getByRole('tab', { name: 'Blueprints' }).click();
    await page.getByRole('button', { name: /Marquee/ }).click();
    await dragCanvasCells(page, { x: 10, y: 10 }, { x: 11, y: 11 });
    await page.getByRole('button', { name: 'Copy selection' }).click();
    await page.getByRole('button', { name: 'Blueprint 1', exact: true }).click();

    await expect(page.locator('#blueprintStampPreview')).toBeVisible();
    const target = await canvasPoint(page, { x: 20, y: 20 });
    await page.mouse.click(target.x, target.y);

    const state = await game.state();
    expect(state.arrays.type[20 + 20 * state.cols]).toBe(ids.sand);
    expect(state.arrays.type[21 + 20 * state.cols]).toBe(ids.water);
    expect(state.arrays.type[20 + 21 * state.cols]).toBe(ids.oil);
});
