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
    await tools.click();
    await expect(page.locator('#toolsWorkspace')).toBeVisible();
});
