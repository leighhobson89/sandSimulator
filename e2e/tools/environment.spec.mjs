import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';

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
