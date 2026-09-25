import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { canvasPoint, dragCanvasCells } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page);
});

test('places and aims a Fan, then edits its settings through the machine dialog', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await game.seed(771);

    await page.getByRole('button', { name: 'Fan', exact: true }).click();
    await dragCanvasCells(page, { x: 25, y: 20 }, { x: 29, y: 20 });
    let state = await game.state();
    let captured = await page.evaluate(() => window.__GAME_INSTANCE__.captureState());
    const fanId = state.definitions.find(definition => definition?.name === 'Fan').id;
    const fanIndex = 20 * state.cols + 25;
    expect(state.arrays.type[fanIndex]).toBe(fanId);
    expect(state.arrays.data[fanIndex]).toBe(0);
    expect(captured.arrays.machineSetting[fanIndex]).toBe(7);

    const point = await canvasPoint(page, { x: 25, y: 20 });
    await page.mouse.click(point.x, point.y);
    const dialog = page.getByRole('dialog', { name: 'Fan settings' });
    await expect(dialog).toBeVisible();
    const input = page.locator('#machineDialogInput');
    await expect(input).toHaveAttribute('min', '1');
    await expect(input).toHaveAttribute('max', '50');
    await expect(input).toHaveValue('7');
    await input.fill('50');
    await page.locator('#machineDialogOk').click();
    await expect(dialog).toBeHidden();
    captured = await page.evaluate(() => window.__GAME_INSTANCE__.captureState());
    expect(captured.arrays.machineSetting[fanIndex]).toBe(50);

    await page.mouse.click(point.x, point.y);
    await expect(input).toHaveValue('50');
    await page.locator('#machineDialogCancel').click();
    state = await game.state();
    expect(state.arrays.type[fanIndex]).toBe(fanId);
});

test('places every machine family with a real catalog selection and icon overlay', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const placements = [
        ['Fan', { x: 12, y: 12 }, { x: 14, y: 12 }],
        ['Heater', { x: 20, y: 12 }, { x: 22, y: 12 }],
        ['Cooler', { x: 28, y: 12 }, { x: 30, y: 12 }],
        ['Powder Storage Bin', { x: 12, y: 25 }, { x: 12, y: 22 }],
        ['Liquid Storage Bin', { x: 20, y: 25 }, { x: 20, y: 22 }],
        ['Gas Storage Bin', { x: 28, y: 25 }, { x: 28, y: 22 }],
        ['Vent', { x: 36, y: 25 }, { x: 36, y: 22 }],
        ['Mixer', { x: 44, y: 25 }, { x: 44, y: 22 }]
    ];

    for (const [name, from, to] of placements) {
        await page.getByRole('button', { name, exact: true }).click();
        await dragCanvasCells(page, from, to);
    }

    const state = await game.state();
    for (const [name, cell] of placements) {
        const id = state.definitions.find(definition => definition?.name === name).id;
        expect(state.arrays.type[cell.y * state.cols + cell.x], name).toBe(id);
    }
    const tubingId = state.definitions.find(definition => definition?.name === 'Tubing').id;
    expect(state.arrays.type[22 * state.cols + 43]).toBe(tubingId);
    expect(state.arrays.type[22 * state.cols + 45]).toBe(tubingId);
    await game.step(0);
    await expect(page.locator('#machineOverlay .machine-overlay-icon')).toHaveCount(8);
});

test('Heater and Cooler dialogs enforce their target temperature ranges', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    for (const [name, cell, value, min, max] of [
        ['Heater', { x: 18, y: 18 }, '3500', '0', '4000'],
        ['Cooler', { x: 26, y: 18 }, '-20', '-60', '20']
    ]) {
        await page.evaluate(async ({ name, cell }) => {
            const physics = await import('/physics.js');
            const id = physics.getDefinitions().findIndex(definition => definition?.name === name);
            physics.clearWorld();
            physics.setCell(cell.x, cell.y, id);
        }, { name, cell });
        await clickCell(page, cell);
        const dialog = page.locator('#machineDialog');
        await expect(dialog).toBeVisible();
        await expect(page.locator('#machineDialogTitle')).toHaveText(`${name} settings`);
        const input = page.locator('#machineDialogInput');
        await expect(input).toHaveAttribute('min', min);
        await expect(input).toHaveAttribute('max', max);
        await input.fill(value);
        await page.locator('#machineDialogOk').click();
        await expect(dialog).toBeHidden();

        await clickCell(page, cell);
        await expect(input).toHaveValue(value);
        await page.locator('#machineDialogCancel').click();
    }
});

test('machine previews stay visual until release and occupied cells reject placement', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const stone = physics.getDefinitions().findIndex(definition => definition?.name === 'Stone');
        physics.setCell(20, 20, stone);
    });

    await page.getByRole('button', { name: 'Heater', exact: true }).click();
    const blocked = await canvasPoint(page, { x: 20, y: 20 });
    await page.mouse.move(blocked.x, blocked.y);
    await page.mouse.down();
    await page.mouse.move(...Object.values(await canvasPoint(page, { x: 24, y: 20 })));
    await expect(page.locator('#machineOverlay .machine-placement-preview')).toHaveCount(0);
    await page.mouse.up();
    const blockedState = await game.state();
    expect(blockedState.arrays.type[20 + 20 * blockedState.cols]).toBe(
        blockedState.definitions.find(definition => definition?.name === 'Stone').id
    );

    const target = await canvasPoint(page, { x: 30, y: 20 });
    await page.mouse.move(target.x, target.y);
    await page.mouse.down();
    await page.mouse.move(...Object.values(await canvasPoint(page, { x: 34, y: 20 })));
    await game.step(0);
    await expect(page.locator('#machineOverlay .machine-placement-preview')).toHaveCount(1);
    await expect(page.locator('#machineOverlay .machine-cone-preview')).toHaveCount(1);
    const beforeRelease = await game.state();
    expect(beforeRelease.arrays.type[20 * beforeRelease.cols + 30]).toBe(0);
    await page.mouse.up();
    const placed = await game.state();
    expect(placed.arrays.type[20 * placed.cols + 30]).toBe(
        placed.definitions.find(definition => definition?.name === 'Heater').id
    );
});

test('Fan input clamps out-of-range values and rounds fractional speeds', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const fan = physics.getDefinitions().findIndex(definition => definition?.name === 'Fan');
        physics.setCell(25, 20, fan);
    });
    await clickCell(page, { x: 25, y: 20 });
    const input = page.locator('#machineDialogInput');
    await expect(input).toHaveAttribute('min', '1');
    await expect(input).toHaveAttribute('max', '50');
    await input.fill('999');
    await page.locator('#machineDialogOk').click();
    await clickCell(page, { x: 25, y: 20 });
    await expect(input).toHaveValue('50');
    const state = await game.state();
    const captured = await page.evaluate(() => window.__GAME_INSTANCE__.captureState());
    expect(captured.arrays.machineSetting[20 * state.cols + 25]).toBe(50);
    await input.fill('-4');
    await page.locator('#machineDialogOk').click();
    await clickCell(page, { x: 25, y: 20 });
    await expect(input).toHaveValue('1');
    await input.fill('12.6');
    await page.locator('#machineDialogOk').click();
    await clickCell(page, { x: 25, y: 20 });
    await expect(input).toHaveValue('13');
    await page.locator('#machineDialogCancel').click();
    await game.step(0);
});

test('machine hit testing and tooltip work across the visible icon edge', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const fan = physics.getDefinitions().findIndex(definition => definition?.name === 'Fan');
        physics.setCell(25, 20, fan);
    });
    await game.step(0);
    const point = await page.locator('#canvas').evaluate((canvas, cell) => {
        const rect = canvas.getBoundingClientRect();
        const x = rect.left + ((cell.x + 0.5) / canvas.width) * rect.width;
        const y = rect.top + ((cell.y + 0.5) / canvas.height) * rect.height;
        return { x: x + 12, y };
    }, { x: 25, y: 20 });
    await page.mouse.move(point.x, point.y);
    await expect(page.locator('#toolTooltip')).toBeVisible();
    await expect(page.locator('#toolTooltip')).toContainText('Fan');
    await expect(page.locator('#toolTooltip')).toContainText('Wind speed');
    await page.mouse.click(point.x, point.y);
    await expect(page.locator('#machineDialog')).toBeVisible();
    await page.locator('#machineDialogCancel').click();
});

test('Fan placement maps all eight drag directions into persistent orientation data', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.getByRole('button', { name: 'Fan', exact: true }).click();
    const directions = [
        [{ x: 40, y: 20 }, { x: 44, y: 20 }, 0],
        [{ x: 40, y: 20 }, { x: 36, y: 20 }, 1],
        [{ x: 40, y: 20 }, { x: 40, y: 16 }, 2],
        [{ x: 40, y: 20 }, { x: 40, y: 24 }, 3],
        [{ x: 40, y: 20 }, { x: 44, y: 16 }, 4],
        [{ x: 40, y: 20 }, { x: 36, y: 16 }, 5],
        [{ x: 40, y: 20 }, { x: 36, y: 24 }, 6],
        [{ x: 40, y: 20 }, { x: 44, y: 24 }, 7]
    ];
    for (const [from, to, expected] of directions) {
        await page.evaluate(async () => (await import('/physics.js')).clearWorld());
        await dragCanvasCells(page, from, to);
        const state = await game.state();
        expect(state.arrays.data[from.y * state.cols + from.x], `${from.x},${from.y}`).toBe(expected);
    }
});

async function clickCell(page, cell) {
    const point = await canvasPoint(page, cell);
    await page.mouse.click(point.x, point.y);
}
