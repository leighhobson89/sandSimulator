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
    const select = page.locator('#themeSelect');
    await select.selectOption('terminal');
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'terminal');
    await expect(select).toHaveValue('terminal');
    await expect(page.evaluate(() => localStorage.getItem('elementalFoundry.theme'))).resolves.toBe('terminal');
});
