import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { dragCanvasCells, canvasPoint } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

async function prepareBlueprint(page) {
    return page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const sand = definitions.findIndex(definition => definition?.name === 'Sand');
        physics.clearWorld();
        physics.setCell(8, 8, sand);
        physics.setCell(9, 8, sand);
        return sand;
    });
}

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page);
});

test('undo and redo restore the exact stamped patch', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const sand = await prepareBlueprint(page);

    await page.getByRole('tab', { name: 'Blueprints' }).click();
    await page.getByRole('button', { name: /Marquee/ }).click();
    await dragCanvasCells(page, { x: 8, y: 8 }, { x: 9, y: 8 });
    await page.getByRole('button', { name: 'Copy selection' }).click();
    await page.getByRole('button', { name: 'Blueprint 1', exact: true }).click();
    const target = await canvasPoint(page, { x: 18, y: 18 });
    await page.mouse.click(target.x, target.y);

    const stamped = await game.state();
    expect(stamped.arrays.type[18 + 18 * stamped.cols]).toBe(sand);
    expect(stamped.arrays.type[19 + 18 * stamped.cols]).toBe(sand);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();

    const undone = await game.state();
    expect(undone.arrays.type[18 + 18 * undone.cols]).not.toBe(sand);
    expect(undone.arrays.type[19 + 18 * undone.cols]).not.toBe(sand);
    await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Redo', exact: true }).click();

    const redone = await game.state();
    expect(redone.arrays.type[18 + 18 * redone.cols]).toBe(sand);
    expect(redone.arrays.type[19 + 18 * redone.cols]).toBe(sand);
});
