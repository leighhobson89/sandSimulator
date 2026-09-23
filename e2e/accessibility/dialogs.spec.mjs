import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'accessibility');
});

test('save and clear dialogs expose labelled modal state and keyboard-focusable controls', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();

    await page.getByRole('button', { name: 'Export' }).click();
    const saveDialog = page.locator('#saveDialog');
    await expect(saveDialog).toHaveRole('dialog');
    await expect(saveDialog).toHaveAttribute('aria-modal', 'true');
    await expect(saveDialog).toHaveAttribute('aria-labelledby', 'saveDialogTitle');
    await expect(page.locator('#saveString')).toBeFocused();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(saveDialog).toBeHidden();

    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.locator('#saveDialog')).toHaveRole('dialog');
    await expect(page.locator('#saveString')).toBeFocused();
    await expect(page.locator('#saveString')).not.toHaveAttribute('readonly', '');
    await page.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'Clear' }).click();
    const clearDialog = page.locator('#clearDialog');
    await expect(clearDialog).toHaveRole('dialog');
    await expect(clearDialog).toHaveAttribute('aria-modal', 'true');
    await expect(clearDialog).toHaveAttribute('aria-labelledby', 'clearDialogTitle');
    await expect(page.getByRole('button', { name: 'Clear World' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(clearDialog).toBeHidden();
    await expect(game.state()).resolves.toMatchObject({ cols: expect.any(Number) });
});

test('autosave choice is a labelled modal and supports keyboard cancellation', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await page.reload();
    await page.getByRole('button', { name: 'New Game' }).click();
    const choice = page.locator('#autosaveChoiceDialog');
    await expect(choice).toHaveRole('dialog');
    await expect(choice).toHaveAttribute('aria-modal', 'true');
    await expect(choice).toHaveAttribute('aria-labelledby', 'autosaveChoiceTitle');
    await page.getByRole('button', { name: 'Cancel' }).focus();
    await page.keyboard.press('Enter');
    await expect(choice).toBeHidden();
    await expect(page.locator('#menu')).toBeVisible();
});

test('keyboard tools expose pressed state and focus tooltips through the shared tooltip layer', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    const brush = page.getByRole('button', { name: 'Brush mode' });
    await expect(brush).toHaveAttribute('aria-pressed', 'true');
    await expect(brush).toHaveAttribute('aria-describedby', 'toolTooltip');
    await brush.focus();
    await expect(page.locator('#toolTooltip')).toBeVisible();
    await expect(page.locator('#toolTooltip')).toContainText('Paint continuously');
    await page.keyboard.press('e');
    await expect(page.locator('#eraserButton')).toHaveClass(/active-toggle/);
    await page.keyboard.press('h');
    await expect(page.locator('#heatViewButton')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('[');
    await expect(page.locator('#brushSizeValue')).toHaveText('1');
    await page.keyboard.press(']');
    await expect(page.locator('#brushSizeValue')).toHaveText('3');
    await page.keyboard.press('Tab');
    await expect(page.locator('#toolTooltip')).toBeVisible();
    await expect(game.state()).resolves.toMatchObject({ frameCount: expect.any(Number) });
});
