import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page);
});

test('catalog groups materials, selects them accessibly, and describes their behavior', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const sand = page.getByRole('button', { name: 'Sand', exact: true });
    const water = page.getByRole('button', { name: 'Water', exact: true });
    await expect(sand).toBeVisible();
    await expect(sand).toHaveAttribute('aria-describedby', 'toolTooltip');
    await expect(page.locator('#particleButtons')).toContainText('Powders');
    await expect(page.locator('#particleButtons')).toContainText('Liquids');

    await sand.click();
    await expect(sand).toHaveClass(/selected/);
    await sand.hover();
    const tooltip = page.locator('#toolTooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Sand');
    await expect(tooltip).toContainText('density');
    await expect(tooltip).toContainText('Reactions');

    await water.focus();
    await expect(water).toBeFocused();
    await expect(tooltip).toBeVisible();
    await water.click();
    await expect(water).toHaveClass(/selected/);
    await expect(sand).not.toHaveClass(/selected/);

    const state = await game.state();
    expect(state.definitions.some(definition => definition?.name === 'Sand')).toBe(true);
    expect(state.definitions.some(definition => definition?.name === 'Water')).toBe(true);
});

test('every prepared definition has a catalog button and generated glossary text', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const definitions = (await game.state()).definitions.filter(Boolean).filter(definition => definition.id > 0);
    const buttons = page.locator('.particle-button');
    await expect(buttons).toHaveCount(definitions.length);

    for (const definition of definitions) {
        const button = page.getByRole('button', { name: definition.name, exact: true });
        await expect(button).toHaveAttribute('data-particle-id', String(definition.id));
        await expect(button).toHaveAttribute('data-tooltip', new RegExp(`^${definition.name}\\n`));
        await button.hover();
        await expect(page.locator('#toolTooltip')).toContainText(definition.name);
        await button.focus();
        await expect(page.locator('#toolTooltip')).toContainText(definition.name);
    }
});

test('catalog definitions render representative powder and gas cells', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        physics.setCell(24, 18, definitions.findIndex(definition => definition?.name === 'Sand'));
        physics.setCell(30, 18, definitions.findIndex(definition => definition?.name === 'Smoke'));
    });
    const state = await game.state();
    expect(state.arrays.type[18 * state.cols + 24]).toBe(
        state.definitions.find(definition => definition?.name === 'Sand').id
    );
    expect(state.arrays.type[18 * state.cols + 30]).toBe(
        state.definitions.find(definition => definition?.name === 'Smoke').id
    );
});
