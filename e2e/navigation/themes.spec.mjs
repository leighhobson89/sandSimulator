import { test, expect } from '@playwright/test';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

const themes = ['workshop', 'ember', 'paper', 'terminal', 'lagoon', 'dune'];

test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus) await attachGameDiagnostics(info, page);
});

test('menu theme swatches apply, persist, and expose selected state', async ({ page }) => {
    await page.goto('/?e2e');
    for (const theme of themes) {
        const swatch = page.getByRole('button', { name: `${theme[0].toUpperCase()}${theme.slice(1)} theme` });
        await swatch.click();
        await expect(page.locator('body')).toHaveAttribute('data-theme', theme);
        await expect(swatch).toHaveClass(/selected/);
        await expect(page.evaluate(() => localStorage.getItem('elementalFoundry.theme'))).resolves.toBe(theme);
    }
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'dune');
    await expect(page.getByRole('button', { name: 'Dune theme' })).toHaveClass(/selected/);
});

test('toolbar theme select stays synchronized with the menu theme', async ({ page }) => {
    await page.goto('/?e2e');
    await page.getByRole('button', { name: 'New Game' }).click();
    const sizeDialog = page.locator('#worldSizeDialog');
    await expect(sizeDialog).toBeVisible();
    await sizeDialog.getByRole('radio', { name: '260 × 150', exact: true }).check();
    await sizeDialog.getByRole('button', { name: 'Start Game', exact: true }).click();
    const select = page.locator('#themeSelect');
    for (const theme of themes) {
        await select.selectOption(theme);
        await expect(page.locator('body')).toHaveAttribute('data-theme', theme);
        await expect(select).toHaveValue(theme);
        // The menu remains in the DOM while the workspace is active, but its
        // hidden swatches are not exposed through the accessibility tree.
        await expect(page.locator(`#themeSwatches .theme-swatch[data-theme-id="${theme}"]`))
            .toHaveClass(/selected/);
        await expect(page.evaluate(() => localStorage.getItem('elementalFoundry.theme'))).resolves.toBe(theme);
    }
});

test('invalid saved theme falls back to Workshop and keeps the picker accessible', async ({ page }) => {
    await page.goto('/?e2e');
    await page.evaluate(() => localStorage.setItem('elementalFoundry.theme', 'not-a-theme'));
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'workshop');
    const workshop = page.getByRole('button', { name: 'Workshop theme' });
    await expect(workshop).toHaveClass(/selected/);
    await expect(workshop).toHaveAttribute('title', /Near black/);
    await expect(workshop).toHaveAttribute('aria-label', 'Workshop theme');
    await expect(page.locator('#themeSwatches .theme-swatch')).toHaveCount(themes.length);
});
