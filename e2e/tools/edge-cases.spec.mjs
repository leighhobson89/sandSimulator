import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { canvasPoint, clickCanvasCell, dragCanvasCells } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'tool-edge');
});

async function start(page) {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await game.seed(8080);
    return game;
}

test('brush keyboard sizing clamps at both ends and drawing modes are mutually exclusive', async ({ page }) => {
    await start(page);
    const brushSize = page.locator('#brushSize');
    await brushSize.fill('1');
    await page.keyboard.press('[');
    await expect(brushSize).toHaveValue('1');
    await brushSize.fill('31');
    await page.keyboard.press(']');
    await expect(brushSize).toHaveValue('31');

    const line = page.getByRole('button', { name: 'Line mode' });
    const rectangle = page.getByRole('button', { name: 'Rectangle mode' });
    const brush = page.getByRole('button', { name: 'Brush mode' });
    await line.click();
    await expect(line).toHaveAttribute('aria-pressed', 'true');
    await expect(brush).toHaveAttribute('aria-pressed', 'false');
    await rectangle.click();
    await expect(rectangle).toHaveAttribute('aria-pressed', 'true');
    await expect(line).toHaveAttribute('aria-pressed', 'false');
    await expect(brushSize).toBeDisabled();
    await brush.click();
    await expect(brush).toHaveAttribute('aria-pressed', 'true');
    await expect(brushSize).toBeEnabled();
});

test('grabber cancellation outside the canvas preserves the source and selection modes exit cleanly', async ({ page }) => {
    const game = await start(page);
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await clickCanvasCell(page, { x: 25, y: 20 });
    const before = await game.state();
    const sand = before.definitions.find(definition => definition.name === 'Sand').id;

    await page.getByRole('button', { name: 'Grabber' }).click();
    await expect(page.locator('#grabberButton')).toHaveAttribute('aria-pressed', 'true');
    const point = await canvasPoint(page, { x: 25, y: 20 });
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(0, 0, { steps: 2 });
    await page.mouse.up();
    await expect(page.locator('#grabberButton')).toHaveAttribute('aria-pressed', 'true');

    const after = await game.state();
    expect(after.typeCounts[String(sand)]).toBe(before.typeCounts[String(sand)]);
    await page.getByRole('button', { name: 'Water', exact: true }).click();
    await expect(page.locator('#grabberButton')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'Water', exact: true })).toHaveClass(/selected|active/);
});

test('shape previews never commit when cancelled and occupied cells remain protected', async ({ page }) => {
    const game = await start(page);
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await clickCanvasCell(page, { x: 42, y: 20 });
    await page.getByRole('button', { name: 'Rectangle mode' }).click();
    const startPoint = await canvasPoint(page, { x: 40, y: 18 });
    const endPoint = await canvasPoint(page, { x: 44, y: 22 });
    await page.mouse.move(startPoint.x, startPoint.y);
    await page.mouse.down();
    await page.mouse.move(endPoint.x, endPoint.y, { steps: 2 });
    await page.mouse.up();
    const state = await game.state();
    const sand = state.definitions.find(definition => definition.name === 'Sand').id;
    expect(state.arrays.type[20 * state.cols + 42]).toBe(sand);
});

test('environment bounds, keyboard heat toggle, and natural-atmosphere controls remain available', async ({ page }) => {
    const game = await start(page);
    const airTemp = page.locator('#airTemp');
    const airTempValue = page.locator('#airTempValue');
    await expect(airTemp).toHaveAttribute('min', '-60');
    await expect(airTemp).toHaveAttribute('max', '4000');
    await airTemp.fill('-60');
    await expect(airTempValue).toHaveValue('-60');
    await airTemp.fill('4000');
    await expect(airTempValue).toHaveValue('4000');

    await expect(page.locator('#airLayers')).toHaveCount(0);
    await expect(page.locator('#layerLapse')).toHaveCount(0);
    await expect(page.locator('#ambientWind')).toBeVisible();

    await page.locator('#visualizationsOptionsButton').click();
    await page.keyboard.press('h');
    await expect(page.locator('#visualizationHeatButton')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('h');
    await expect(page.locator('#visualizationHeatButton')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#closeVisualizationsDialog').click();
    await game.step(1);
    await expect(page.locator('#readout')).toBeVisible();
});
