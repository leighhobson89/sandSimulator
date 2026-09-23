import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';

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
