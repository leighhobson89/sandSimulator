import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'accessibility');
});

test('menu and workspace controls expose names, states, and keyboard activation', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();

    await expect(page.getByRole('heading', { name: 'Elemental Foundry' })).toHaveCount(1);
    for (const name of ['New Game', 'Import Game']) {
        const button = page.getByRole('button', { name });
        await expect(button).toBeVisible();
        await expect(button).toBeEnabled();
    }
    await page.getByRole('button', { name: 'New Game' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#canvas')).toBeVisible();

    const tools = page.getByRole('tab', { name: 'Tools' });
    const blueprints = page.getByRole('tab', { name: 'Blueprints' });
    await expect(tools).toHaveAttribute('aria-selected', 'true');
    await expect(blueprints).toHaveAttribute('aria-controls', 'blueprintsWorkspace');
    await blueprints.focus();
    await page.keyboard.press('Enter');
    await expect(blueprints).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#blueprintsWorkspace')).toBeVisible();
    await tools.focus();
    await page.keyboard.press('Enter');
    await expect(tools).toHaveAttribute('aria-selected', 'true');
});

test('dialogs expose modal semantics and move focus to their primary controls', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const saveDialog = page.locator('#saveDialog');
    await expect(saveDialog).toHaveAttribute('role', 'dialog');
    await expect(saveDialog).toHaveAttribute('aria-modal', 'true');
    await expect(saveDialog).toHaveAttribute('aria-labelledby', 'saveDialogTitle');
    await expect(page.locator('#saveString')).toBeFocused();
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    const clearDialog = page.locator('#clearDialog');
    await expect(clearDialog).toHaveAttribute('role', 'dialog');
    await expect(clearDialog).toHaveAttribute('aria-modal', 'true');
    await expect(clearDialog).toHaveAttribute('aria-labelledby', 'clearDialogTitle');
    await expect(page.getByRole('button', { name: 'Clear World', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(clearDialog).toBeHidden();
});

test('material and tool descriptions are available by hover and keyboard focus', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const sand = page.getByRole('button', { name: 'Sand', exact: true });
    await expect(sand).toHaveAttribute('aria-describedby', 'toolTooltip');
    await sand.hover();
    const tooltip = page.locator('#toolTooltip');
    await expect(tooltip).toHaveAttribute('role', 'tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Sand');
    await sand.focus();
    await expect(tooltip).toBeVisible();

    const eraser = page.getByRole('button', { name: 'Eraser', exact: true });
    await eraser.focus();
    await page.keyboard.press('e');
    await expect(eraser).toHaveClass(/active-toggle/);
    await page.keyboard.press('e');
    await expect(eraser).not.toHaveClass(/active-toggle/);
});
