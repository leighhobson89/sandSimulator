import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'accessibility');
});

test('save and clear dialogs expose labelled modal state and keyboard-focusable controls', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();

    await page.getByRole('button', { name: 'Save' }).click();
    const saveDialog = page.locator('#saveDialog');
    await expect(saveDialog).toHaveRole('dialog');
    await expect(page.locator('#saveDialogTitle')).toHaveText('Save Game');
    await expect(saveDialog).toHaveAttribute('aria-modal', 'true');
    await expect(saveDialog).toHaveAttribute('aria-labelledby', 'saveDialogTitle');
    await expect(page.locator('#saveString')).toBeFocused();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(saveDialog).toBeHidden();

    await page.getByRole('button', { name: 'Load' }).click();
    await expect(page.locator('#saveDialog')).toHaveRole('dialog');
    await expect(page.locator('#saveDialogTitle')).toHaveText('Load Game');
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
    const sizeDialog = page.locator('#worldSizeDialog');
    await expect(sizeDialog).toBeVisible();
    await sizeDialog.getByRole('radio', { name: '260 × 150', exact: true }).check();
    await sizeDialog.getByRole('button', { name: 'Start Game', exact: true }).click();
    const choice = page.locator('#autosaveChoiceDialog');
    await expect(choice).toHaveRole('dialog');
    await expect(choice).toHaveAttribute('aria-modal', 'true');
    await expect(choice).toHaveAttribute('aria-labelledby', 'autosaveChoiceTitle');
    await page.getByRole('button', { name: 'Cancel' }).focus();
    await page.keyboard.press('Enter');
    await expect(choice).toBeHidden();
    await expect(page.locator('#menu')).toBeVisible();
});

test('visualizations window exposes six keyboard-accessible modes and restores focus on close', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await page.setViewportSize({ width: 390, height: 844 });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    const options = page.locator('#visualizationsOptionsButton');
    await options.click();
    const dialog = page.locator('#visualizationsDialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveRole('dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute('aria-labelledby', 'visualizationsDialogTitle');
    await expect(page.locator('#visualizationsDialogTitle')).toHaveText('Visualizations');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);

    const modeButtons = dialog.locator('button:not(#closeVisualizationsDialog)');
    await expect(modeButtons).toHaveCount(6);
    await expect(dialog.locator('#visualizationHeatButton')).toBeVisible();
    await expect(dialog.locator('#visualizationHumidityButton')).toBeVisible();
    await expect(dialog.locator('#visualizationWindButton')).toBeVisible();
    const placeholders = dialog.getByRole('button', { name: 'Button', exact: true });
    await expect(placeholders).toHaveCount(3);
    await expect(page.locator('#closeVisualizationsDialog')).toBeVisible();
    await expect(dialog.getByRole('button')).toHaveCount(7);

    const rowPositions = await modeButtons.evaluateAll(buttons => buttons.map(button => {
        const rect = button.getBoundingClientRect();
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
    }));
    expect(Math.abs(rowPositions[0].y - rowPositions[1].y)).toBeLessThan(1);
    expect(Math.abs(rowPositions[2].y - rowPositions[3].y)).toBeLessThan(1);
    expect(Math.abs(rowPositions[4].y - rowPositions[5].y)).toBeLessThan(1);
    expect(rowPositions[0].y).toBeLessThan(rowPositions[2].y);
    expect(rowPositions[2].y).toBeLessThan(rowPositions[4].y);
    for (const [left, right] of [[0, 1], [2, 3], [4, 5]]) {
        expect(rowPositions[left].x).toBeLessThan(rowPositions[right].x);
        expect(rowPositions[left].right).toBeLessThanOrEqual(rowPositions[right].x + 1);
    }
    expect(rowPositions.every(rect => rect.x >= 0 && rect.right <= 390 && rect.y >= 0 && rect.bottom <= 844)).toBe(true);

    const placeholderCount = await placeholders.count();
    for (let index = 0; index < placeholderCount; index++) {
        const placeholder = placeholders.nth(index);
        if (await placeholder.isEnabled()) await placeholder.click();
        await expect(dialog).toBeVisible();
    }
    expect(pageErrors).toEqual([]);

    await page.locator('#closeVisualizationsDialog').click();
    await expect(dialog).toBeHidden();
    await expect(options).toBeFocused();
    await options.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(options).toBeFocused();
    await expect(game.state()).resolves.toMatchObject({ cols: expect.any(Number), rows: expect.any(Number) });
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
    await page.locator('#visualizationsOptionsButton').click();
    await page.keyboard.press('h');
    await expect(page.locator('#visualizationHeatButton')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('h');
    await expect(page.locator('#visualizationHeatButton')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#closeVisualizationsDialog').click();
    await page.keyboard.press('[');
    await expect(page.locator('#brushSizeValue')).toHaveText('1');
    await page.keyboard.press(']');
    await expect(page.locator('#brushSizeValue')).toHaveText('3');
    await page.keyboard.press('Tab');
    await expect(page.locator('#toolTooltip')).toBeVisible();
    await expect(game.state()).resolves.toMatchObject({ frameCount: expect.any(Number) });
});
