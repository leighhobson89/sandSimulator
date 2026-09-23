import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'environment');
});

async function refreshReadout(page) {
    await page.evaluate(async () => {
        const { gameLoop } = await import('/game.js');
        gameLoop(performance.now() + 1000);
    });
}

test('environment controls update values, disable dependent controls, and toggle heat view', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await page.locator('#airTemp').fill('120');
    await expect(page.locator('#airTempValue')).toHaveValue('120');
    await page.locator('label.tool-icon-toggle').filter({ hasText: 'Layers' }).click({ force: true });
    await expect(page.locator('#layerLapse')).toBeDisabled();
    await page.locator('label.tool-icon-toggle').filter({ hasText: 'Breeze' }).click({ force: true });
    await page.locator('label.tool-icon-toggle').filter({ hasText: 'Layers' }).click({ force: true });
    await page.locator('#layerLapse').fill('4.5');
    await expect(page.locator('#layerLapseValue')).toHaveText('4.5');
    await page.getByRole('button', { name: 'Heat view' }).click();
    await expect(page.locator('#heatViewButton')).toHaveAttribute('aria-pressed', 'true');
    await game.step(1);
    await expect(page.locator('#readout')).toBeVisible();
});

test('temperature, lapse, wind, breeze, and heat controls cover bounds and reset state', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await page.locator('#airTemp').fill('-60');
    await expect(page.locator('#airTempValue')).toHaveValue('-60');
    await page.locator('#airTemp').fill('4000');
    await expect(page.locator('#airTempValue')).toHaveValue('4000');
    await page.locator('#airTempValue').fill('5000');
    await page.locator('#airTempValue').press('Enter');
    await expect(page.locator('#airTempValue')).toHaveValue('4000');
    await page.locator('#airTempValue').fill('-100');
    await page.locator('#airTempValue').press('Enter');
    await expect(page.locator('#airTempValue')).toHaveValue('-60');

    await page.locator('#layerLapse').fill('0');
    await expect(page.locator('#layerLapseValue')).toHaveText('0.0');
    await page.locator('#layerLapse').fill('10');
    await expect(page.locator('#layerLapseValue')).toHaveText('10.0');
    await page.locator('label.tool-icon-toggle').filter({ hasText: 'Layers' }).click({ force: true });
    await expect(page.locator('#layerLapse')).toBeDisabled();
    await page.locator('label.tool-icon-toggle').filter({ hasText: 'Layers' }).click({ force: true });
    await expect(page.locator('#layerLapse')).toBeEnabled();
    await expect(page.locator('#layerLapseValue')).toHaveText('10.0');

    await page.locator('#windStrength').fill('1');
    await expect(page.locator('#windStrengthValue')).toHaveText('1');
    await page.locator('#windStrength').fill('8');
    await expect(page.locator('#windStrengthValue')).toHaveText('8');
    await page.locator('label.tool-icon-toggle').filter({ hasText: 'Breeze' }).click({ force: true });
    await expect(page.locator('#ambientWind')).toBeChecked();
    await page.locator('label.tool-icon-toggle').filter({ hasText: 'Breeze' }).click({ force: true });
    await expect(page.locator('#ambientWind')).not.toBeChecked();

    await page.getByRole('button', { name: 'Heat view' }).click();
    await page.keyboard.press('h');
    await expect(page.locator('#heatViewButton')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('h');
    await expect(page.locator('#heatViewButton')).toHaveAttribute('aria-pressed', 'true');
    await expect(game.state()).resolves.toMatchObject({ cols: expect.any(Number), rows: expect.any(Number) });
});

test('wind gestures, heat rendering, and readouts expose deterministic environment state', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await game.setFixture([{ x: 50, y: 50, type: 'Stone' }]);
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        physics.getWorld().temp[physics.index(50, 50)] = 500;
    });
    await game.step(0);
    const normalPixel = await page.locator('#canvas').evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(50, 50, 1, 1).data));
    await page.getByRole('button', { name: 'Heat view' }).click();
    await game.step(0);
    const heatPixel = await page.locator('#canvas').evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(50, 50, 1, 1).data));
    expect(heatPixel.slice(0, 3)).not.toEqual(normalPixel.slice(0, 3));

    await page.getByRole('button', { name: 'Wind', exact: true }).click();
    await page.locator('#windStrength').fill('8');
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        physics.getWorld().wind.fill(0);
    });
    const from = await page.locator('#canvas').evaluate(canvas => {
        const rect = canvas.getBoundingClientRect();
        return { x: rect.left + ((50.5 / canvas.width) * rect.width), y: rect.top + ((50.5 / canvas.height) * rect.height) };
    });
    const to = await page.locator('#canvas').evaluate(canvas => {
        const rect = canvas.getBoundingClientRect();
        return { x: rect.left + ((56.5 / canvas.width) * rect.width), y: rect.top + ((50.5 / canvas.height) * rect.height) };
    });
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 3 }); await page.mouse.up();
    await expect.poll(() => page.evaluate(async () => {
        const physics = await import('/physics.js');
        return Math.max(...physics.getWindTrails());
    })).toBeGreaterThan(0);

    await page.mouse.move(from.x, from.y);
    await refreshReadout(page);
    await expect(page.locator('#readout')).toContainText(/air .*°C/);
    await expect(page.locator('#readout')).toContainText('Brush Wind 3px');
    const temperature = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        return Math.round(physics.getTemperature(50, 50));
    });
    await expect(page.locator('#readout')).toContainText(`Stone ${temperature}°C`);
});
