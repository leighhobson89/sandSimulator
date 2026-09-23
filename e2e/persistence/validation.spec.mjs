import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'validation');
});

test('malformed import is rejected without mutating the live world', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    const before = await game.state();
    await page.getByRole('button', { name: 'Import' }).click();
    await page.locator('#saveString').fill('not-a-save');
    await page.getByRole('button', { name: 'Load Game' }).click();
    await expect(page.locator('#saveDialogError')).toContainText('valid Elemental Foundry save');
    await expect(page.locator('#saveDialog')).toBeVisible();
    expect((await game.state()).arrays.type).toEqual(before.arrays.type);
    await page.locator('#closeSaveDialog').click();
});

test('empty, unsupported, and structurally invalid saves stay in the dialog and preserve state', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    const before = await game.state();
    const unsupported = await page.evaluate(async () => {
        const { compressToEncodedURIComponent } = await import('/lzString.js');
        return compressToEncodedURIComponent(JSON.stringify({ format: 'elemental-foundry', version: 99, simulation: {} }));
    });
    await page.getByRole('button', { name: 'Import' }).click();
    for (const value of ['', '   ', unsupported]) {
        await page.locator('#saveString').fill(value);
        await page.getByRole('button', { name: 'Load Game' }).click();
        await expect(page.locator('#saveDialogError')).toBeVisible();
        await expect(page.locator('#saveDialog')).toBeVisible();
        expect((await game.state()).arrays.type).toEqual(before.arrays.type);
    }
    await page.locator('#closeSaveDialog').click();
});
