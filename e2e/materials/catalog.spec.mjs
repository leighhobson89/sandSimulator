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

test('Insulation catalog describes heat retention and exposes metal network rates', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const insulation = page.getByRole('button', { name: 'Insulation', exact: true });
    await expect(insulation).toBeVisible();
    await expect(insulation).toHaveAttribute('data-particle-id', '54');
    await expect(insulation).toHaveAttribute('aria-describedby', 'toolTooltip');
    await expect(page.locator('#particleButtons')).toContainText('Solids');
    const definitions = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        return physics.getDefinitions().map(item => item ? {
            id: item.id,
            name: item.name,
            description: item.description,
            conductivity: item.conductivity,
            thermalNetworkRate: item.thermalNetworkRate,
            conductive: item.conductive,
            rgb: item.rgb
        } : null);
    });
    const definition = definitions.find(item => item?.name === 'Insulation');
    expect(definition.id).toBe(54);
    expect(definition.description).toMatch(/heat/i);
    expect(definition.description).toMatch(/retain|hold|preserv|slow|insulat/i);
    expect(definition.description).toMatch(/no contact|non-conductive|zero conductivity/i);
    expect(definition.description).not.toMatch(/fast thermal network|connected insulation/i);
    const byName = Object.fromEntries(definitions.filter(Boolean).map(item => [item.name, item]));
    for (const name of [
        'Copper', 'Molten Copper', 'Battery', 'Molten Aluminum', 'Iron', 'Molten Iron',
        'Fan', 'Heater', 'Cooler', 'Tubing'
    ]) {
        expect(byName[name].thermalNetworkRate, `${name} network rate`).toBeGreaterThan(0);
    }
    expect(byName.Copper.thermalNetworkRate).toBeGreaterThan(byName.Battery.thermalNetworkRate);
    expect(byName.Battery.thermalNetworkRate).toBeGreaterThan(byName.Iron.thermalNetworkRate);
    for (const name of ['Insulation', 'Wood', 'Stone', 'Wall']) {
        expect(byName[name].thermalNetworkRate ?? 0, `${name} should not join the fast network`).toBe(0);
    }
    for (const name of ['Wood', 'Stone', 'Wall']) {
        expect(byName[name].conductivity, `${name} retains ordinary conductivity`).toBeGreaterThan(0);
        expect(byName[name].conductivity).toBeLessThan(byName.Iron.conductivity);
    }
    expect(definition.conductivity).toBe(0);
    expect(byName.Tubing.conductivity).toBe(0);
    expect(byName.Tubing.conductive).not.toBe(true);
    const swatch = await insulation.evaluate(button => getComputedStyle(button).backgroundColor);
    expect(swatch).toBe(`rgb(${definition.rgb.join(', ')})`);
    expect(definition.rgb[0]).toBeGreaterThan(definition.rgb[1]);
    expect(definition.rgb[2]).toBeGreaterThan(definition.rgb[1]);
    await insulation.click();
    await expect(insulation).toHaveClass(/selected/);
    await insulation.hover();
    const tooltip = page.locator('#toolTooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Insulation');
    await expect(tooltip).toContainText('Reactions');
    await expect(tooltip).toContainText('Lava');
    await expect(tooltip).toContainText(/heat/i);
    await expect(tooltip).toContainText(/contact|conduct/i);
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

test('seed species and Cloud appear under dedicated catalog headings', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const seedNames = [
        'Grass Seeds', 'Moss Spores', 'Daffodil Seeds', 'Red Tulip Seeds',
        'Geranium Seeds', 'Blue Flower Seeds', 'Banana Seeds', 'Water Grass / Lily Seeds'
    ];
    const seedsHeading = page.locator('#particleButtons .panel-heading').filter({ hasText: 'Seeds' });
    const seedGrid = seedsHeading.locator('xpath=following-sibling::div[1]');
    await expect(seedsHeading).toBeVisible();
    for (const name of seedNames) {
        await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
        await expect(seedGrid.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Seed', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cloud', exact: true })).toBeVisible();
    const gasesHeading = page.locator('#particleButtons .panel-heading').filter({ hasText: 'Gases' });
    await expect(gasesHeading).toBeVisible();
    await expect(gasesHeading.locator('xpath=following-sibling::div[1]')
        .getByRole('button', { name: 'Cloud', exact: true })).toBeVisible();
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
