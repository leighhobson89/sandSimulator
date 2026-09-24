import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus) await attachGameDiagnostics(info, page);
});

test('startup exposes menu and New Game transitions to the paused workspace', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#canvasContainer')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Resume Game' })).toBeHidden();
    await game.newGame();
    await expect(page.locator('#menu')).toBeHidden();
    await expect(page.locator('#canvasContainer')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
});

test('menu Load Game keeps the menu visible and pause transitions are reversible by button and keyboard', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await page.getByRole('button', { name: 'Load Game' }).click();
    await expect(page.locator('#saveDialog')).toBeVisible();
    await expect(page.locator('#menu')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('#saveDialog')).toBeHidden();

    await game.newGame();
    const pause = page.getByRole('button', { name: 'Play' });
    await expect(pause).toBeVisible();
    await pause.click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await page.keyboard.press(' ');
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    await expect((await game.state()).frameCount).toBeGreaterThanOrEqual(0);
});

test('workspace tabs transition between tools and blueprints with accessible state', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const tools = page.getByRole('tab', { name: 'Tools' });
    const blueprints = page.getByRole('tab', { name: 'Blueprints' });
    await expect(tools).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#toolsWorkspace')).toBeVisible();
    await blueprints.click();
    await expect(blueprints).toHaveAttribute('aria-selected', 'true');
    await expect(tools).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('#blueprintsWorkspace')).toBeVisible();
    await expect(page.locator('#toolsWorkspace')).toBeHidden();
    await tools.click();
    await expect(page.locator('#toolsWorkspace')).toBeVisible();
    await expect(page.locator('#blueprintsWorkspace')).toBeHidden();
});
