import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { canvasPoint, dragCanvasCells } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

async function seed(page, { edge = false } = {}) {
    return page.evaluate(async ({ edge }) => {
        const physics = await import('/physics.js');
        const game = await import('/game.js');
        const defs = physics.getDefinitions();
        const id = name => defs.findIndex(def => def?.name === name);
        const world = physics.getWorld();
        physics.clearWorld();
        const x = edge ? 0 : 10;
        const y = edge ? 0 : 10;
        physics.setCell(x, y, id('Sand'));
        physics.setCell(x + 1, y, id('Water'));
        physics.setCell(x, y + 1, id('Oil'));
        if (!edge) physics.setCell(20, 20, id('Fire'));
        for (const [field, values] of Object.entries({
            temp: [321, 322, 323], life: [4, 5, 6], lifeMax: [7, 8, 9], residue: [1, 2, 3],
            shade: [3, 4, 5], heat: [11, 12, 13], surface: [1, 0, 1], data: [9, 8, 7],
            machineSetting: [12, 13, 14], storageType: [id('Water'), id('Oil'), id('Sand')], storageCount: [4, 5, 6],
            storageFlowRemainder: [0.2, 0.3, 0.4], mixerInputTypeA: [id('Water'), id('Oil'), id('Sand')],
            mixerInputCountA: [8, 9, 10], mixerInputFlowA: [0.1, 0.2, 0.3], mixerInputTypeB: [id('Oil'), id('Sand'), id('Water')],
            mixerInputCountB: [3, 4, 5], mixerInputFlowB: [0.4, 0.5, 0.6], mixerOutputCountA: [2, 3, 4],
            mixerOutputCountB: [5, 6, 7], mixerOutputTypeA: [id('Wet Mud'), id('Water'), id('Oil')],
            mixerOutputTypeB: [id('Ash'), id('Sand'), id('Water')], mixerOutputMixed: [1, 0, 1], mixerOutputFlow: [0.7, 0.8, 0.9],
            mixerNextInput: [1, 0, 1], mixerOutputNext: [0, 1, 0], power: [1, 2, 3], powerDelay: [4, 5, 6],
            charge: [0.2, 0.4, 0.6], wind: [1, 0, 1], airflowX: [0.1, 0.2, 0.3], airflowY: [0.4, 0.5, 0.6],
            airflowNextX: [0.7, 0.8, 0.9], airflowNextY: [1.1, 1.2, 1.3]
        })) {
            values.forEach((value, offset) => { world[field][physics.index(x + (offset % 2), y + Math.floor(offset / 2))] = value; });
        }
        physics.renderWorld?.();
        const captured = game.captureBlueprint(x, y, x + 1, y + 1);
        return { ids: { sand: id('Sand'), water: id('Water'), oil: id('Oil'), fire: id('Fire') }, fields: game.BLUEPRINT_FIELDS, source: Object.fromEntries(game.BLUEPRINT_FIELDS.map(field => [field, Array.from(captured.cells[field])])), x, y };
    }, { edge });
}

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page);
});

test('workspace and marquee lifecycle supports reverse and edge selections', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.getByRole('tab', { name: 'Blueprints' }).click();
    await expect(page.getByRole('tab', { name: 'Blueprints' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#toolsWorkspace')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Copy selection' })).toBeDisabled();

    await page.getByRole('button', { name: /Marquee/ }).click();
    await dragCanvasCells(page, { x: 5, y: 5 }, { x: 3, y: 3 });
    await expect(page.locator('#marqueeOverlay')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy selection' })).toBeEnabled();
    await page.getByRole('button', { name: /Marquee/ }).click();
    await expect(page.locator('#marqueeOverlay')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Pause' })).toHaveText('Pause');

    await page.getByRole('button', { name: /Marquee/ }).click();
    await dragCanvasCells(page, { x: 0, y: 0 }, { x: 2, y: 1 });
    await page.getByRole('button', { name: 'Copy selection' }).click();
    await expect(page.getByRole('button', { name: 'Blueprint 1', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Tools' }).click();
    await expect(page.getByRole('tab', { name: 'Tools' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#blueprintsWorkspace')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Pause' })).toHaveText('Pause');
    await expect(game.state()).resolves.toMatchObject({ cols: expect.any(Number) });
});

test('stamping preserves every blueprint field and overwrites air', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const seeded = await seed(page);
    await page.getByRole('tab', { name: 'Blueprints' }).click();
    await page.getByRole('button', { name: /Marquee/ }).click();
    await dragCanvasCells(page, { x: 10, y: 10 }, { x: 11, y: 11 });
    await page.getByRole('button', { name: 'Copy selection' }).click();
    await page.getByRole('button', { name: 'Blueprint 1', exact: true }).click();
    await expect(page.locator('#blueprintStampPreview')).toBeVisible();
    await page.mouse.move(...Object.values(await canvasPoint(page, { x: 20, y: 20 })));
    await page.mouse.click(...Object.values(await canvasPoint(page, { x: 20, y: 20 })));
    const state = await game.state();
    const stamped = await page.evaluate(async () => {
        const game = await import('/game.js');
        const blueprint = game.captureBlueprint(20, 20, 21, 21);
        return Object.fromEntries(game.BLUEPRINT_FIELDS.map(field => [field, Array.from(blueprint.cells[field])]));
    });
    for (const field of seeded.fields) expect(stamped[field], field).toEqual(seeded.source[field]);
    expect(state.arrays.type[21 + 21 * state.cols]).toBe(0);
});

test('middle click is inert in marquee and blueprint-stamp modes', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await game.setFixture([{ x: 30, y: 20, type: 'Water' }]);
    const state = await game.state();
    const water = state.definitions.find(definition => definition?.name === 'Water').id;
    const sand = state.definitions.find(definition => definition?.name === 'Sand').id;
    const cell = { x: 30, y: 20 };

    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await page.getByRole('tab', { name: 'Blueprints' }).click();
    await page.getByRole('button', { name: /Marquee/ }).click();
    await dragCanvasCells(page, { x: 5, y: 5 }, { x: 7, y: 7 });
    const beforeMarqueeClick = await game.state();
    await page.mouse.click(...Object.values(await canvasPoint(page, cell)), { button: 'middle' });
    await expect(page.locator('#marqueeButton')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(`#particleButtons [data-particle-id="${sand}"]`)).toHaveClass(/selected/);
    expect((await game.state()).arrays.type).toEqual(beforeMarqueeClick.arrays.type);

    await page.getByRole('button', { name: 'Copy selection' }).click();
    await page.getByRole('button', { name: 'Blueprint 1', exact: true }).click();
    await expect(page.locator('#blueprintStampPreview')).toBeVisible();
    const beforeStampClick = await game.state();
    await page.mouse.click(...Object.values(await canvasPoint(page, cell)), { button: 'middle' });
    await expect(page.locator('#blueprintStampPreview')).toBeVisible();
    await expect(page.locator('#blueprintSlots .active-toggle')).toHaveCount(1);
    await expect(page.locator(`#particleButtons [data-particle-id="${sand}"]`)).toHaveClass(/selected/);
    const afterStampClick = await game.state();
    expect(afterStampClick.arrays.type).toEqual(beforeStampClick.arrays.type);
    expect(afterStampClick.arrays.type[cell.y * afterStampClick.cols + cell.x]).toBe(water);
});

test('edge clipping supports keyboard undo redo and clears redo after a new stamp', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await seed(page, { edge: true });
    await page.getByRole('tab', { name: 'Blueprints' }).click();
    await page.getByRole('button', { name: /Marquee/ }).click();
    await dragCanvasCells(page, { x: 0, y: 0 }, { x: 1, y: 1 });
    await page.getByRole('button', { name: 'Copy selection' }).click();
    await page.getByRole('button', { name: 'Blueprint 1', exact: true }).click();
    await page.mouse.click(...Object.values(await canvasPoint(page, { x: 1, y: 1 })));
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
    const stamped = await game.state();
    await page.keyboard.press('Control+z');
    await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled();
    await page.keyboard.press('Control+Shift+z');
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
    expect((await game.state()).arrays.type).toEqual(stamped.arrays.type);
    await page.mouse.click(...Object.values(await canvasPoint(page, { x: 4, y: 4 })));
    await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();
});
