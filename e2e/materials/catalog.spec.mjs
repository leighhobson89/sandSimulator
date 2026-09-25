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

    const headingOrder = await page.locator('#particleButtons .panel-heading-toggle > span:first-child').allTextContents();
    expect(headingOrder).toEqual([
        'Powders', 'Liquids', 'Gases', 'Solids', 'Seeds', 'Vegetation',
        'Metals', 'Machines', 'Storage', 'Tools'
    ]);

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

test('Space on a focused catalog button selects it without toggling simulation pause', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const water = page.getByRole('button', { name: 'Water', exact: true });
    await water.focus();
    await expect(water).toBeFocused();
    await water.press('Space');

    await expect(water).toHaveClass(/selected/);
    await expect(page.locator('#pauseButton')).toHaveText('Play');
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

test('Stainless Steel is selectable in Metals and describes its conductive rust resistance', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const stainlessSteel = page.getByRole('button', { name: 'Stainless Steel', exact: true });
    await expect(stainlessSteel).toBeVisible();
    await expect(stainlessSteel).toHaveAttribute('data-particle-id', '79');
    await expect(stainlessSteel).toHaveAttribute('aria-describedby', 'toolTooltip');
    const metalsHeading = page.locator('#particleButtons .panel-heading').filter({ hasText: 'Metals' });
    await expect(metalsHeading.locator('xpath=following-sibling::div[1]')
        .getByRole('button', { name: 'Stainless Steel', exact: true })).toBeVisible();

    const material = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        return {
            stainless: definitions.find(definition => definition?.name === 'Stainless Steel'),
            iron: definitions.find(definition => definition?.name === 'Iron')
        };
    });
    expect(material.stainless.id).toBe(79);
    expect(material.stainless.category).toBe('static');
    expect(material.stainless.group).toBe('Metals');
    expect(material.stainless.conductivity).toBeGreaterThan(0);
    expect(material.stainless.conductivity).toBeLessThan(material.iron.conductivity);
    expect(material.stainless.conductive).toBe(true);
    expect(material.stainless.electricalConductivity).toBeGreaterThan(0);
    expect(material.stainless.electricalConductivity).toBeLessThan(material.iron.electricalConductivity);
    expect(material.stainless.dischargeBattery).toBe(true);
    expect(material.stainless.powerConsumption).toBe(0.5);
    expect(material.stainless.powerConsumption).toBe(material.iron.powerConsumption);
    expect(material.stainless.wireReach).toBe(2);
    expect(material.stainless.wireReach).toBe(material.iron.wireReach);
    expect(material.stainless.metal).not.toBe(true);
    expect(material.stainless.description).toMatch(/rust|water|humidity/i);

    await stainlessSteel.click();
    await expect(stainlessSteel).toHaveClass(/selected/);
    await stainlessSteel.hover();
    const tooltip = page.locator('#toolTooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Stainless Steel');
    await expect(tooltip).toContainText(/rust|water|humidity/i);
    await expect(tooltip).toContainText(/conduct/i);
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

test('seed and vegetation species and Cloud appear under dedicated catalog headings', async ({ page }) => {
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
    const vegetationNames = [
        'Plant', 'Grass', 'Flower', 'Lily Stem', 'Lily Pad', 'Lily Flower', 'Ash Grass',
        'Moss', 'Daffodil', 'Red Tulip', 'Geranium', 'Blue Flower', 'Banana Plant',
        'Water Grass', 'Daffodil Bloom', 'Tulip Bloom', 'Geranium Bloom', 'Blue Flower Bloom',
        'Banana Bunch', 'Water Grass Bloom', 'Water Grass Pad', 'Banana Leaf'
    ];
    const vegetationHeading = page.locator('#particleButtons .panel-heading')
        .filter({ hasText: /^Vegetation/ });
    const vegetationGrid = vegetationHeading.locator('xpath=following-sibling::div[1]');
    await expect(vegetationHeading).toBeVisible();
    for (const name of vegetationNames) {
        await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
        await expect(vegetationGrid.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Seed', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cloud', exact: true })).toBeVisible();
    const gasesHeading = page.locator('#particleButtons .panel-heading').filter({ hasText: 'Gases' });
    await expect(gasesHeading).toBeVisible();
    await expect(gasesHeading.locator('xpath=following-sibling::div[1]')
        .getByRole('button', { name: 'Cloud', exact: true })).toBeVisible();
});

test('every catalog group can be collapsed and expanded with its accessible toggle', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const headings = page.locator('#particleButtons .panel-heading');
    const headingCount = await headings.count();
    expect(headingCount).toBeGreaterThan(0);

    for (const heading of await headings.all()) {
        const toggle = heading.getByRole('button');
        const grid = heading.locator('xpath=following-sibling::div[1]');
        await expect(toggle).toHaveCount(1);
        await expect(toggle).toHaveAccessibleName(/\S+/);
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await expect(grid).toBeVisible();

        await toggle.focus();
        await toggle.press('Enter');
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(grid).toBeHidden();

        await toggle.press('Space');
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await expect(grid).toBeVisible();
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
