import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus) await attachGameDiagnostics(info, page);
});

test('startup exposes the refreshed menu and Sandbox transitions to the paused workspace', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#canvasContainer')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Sandbox', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resume Game' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Load Game', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Campaign', exact: true })).toBeVisible();
    await expect(page.locator('#newGame')).toHaveText('Sandbox');
    const actionLayout = await page.locator('.menu-actions').evaluate(actions => ({
        primaryLabels: [...actions.querySelectorAll('button')].slice(0, 2)
            .map(button => button.textContent.trim()),
        stacked: (() => {
            const [first, second] = [...actions.querySelectorAll('button')].slice(0, 2)
                .map(button => button.getBoundingClientRect());
            return Math.abs((first.left + first.right) - (second.left + second.right)) < 2 &&
                first.bottom <= second.top;
        })(),
        themeAtBottom: (() => {
            const theme = document.querySelector('#menu .theme-picker');
            const lastAction = [...actions.querySelectorAll('button')]
                .filter(button => getComputedStyle(button).display !== 'none')
                .at(-1)?.getBoundingClientRect();
            return !!theme && !!lastAction && theme.getBoundingClientRect().top > lastAction.bottom;
        })()
    }));
    expect(actionLayout.primaryLabels).toEqual(['New Campaign', 'Sandbox']);
    expect(actionLayout.stacked).toBe(true);
    expect(actionLayout.themeAtBottom).toBe(true);
    await expect(page.locator('#themeSwatches')).toBeVisible();
    await game.newGame();
    await expect(page.locator('#menu')).toBeHidden();
    await expect(page.locator('#canvasContainer')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
});

test('New Campaign presents the mission briefing before opening the workspace', async ({ page }) => {
    await page.goto('/?e2e');
    await page.evaluate(() => localStorage.clear());
    await page.getByRole('button', { name: 'New Campaign', exact: true }).click();

    const intro = page.locator('#missionIntroDialog');
    await expect(intro).toBeVisible();
    await expect(intro).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#canvasContainer')).toBeHidden();

    const mission = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        return campaign.getCurrentMission();
    });
    expect(mission.id).toBeTruthy();
    expect(mission.number).toBeGreaterThan(0);
    expect(mission.title).toBeTruthy();
    expect(mission.briefing).toBeTruthy();
    expect(mission.objectives.length).toBeGreaterThan(0);
    await expect(intro).toContainText(String(mission.number));
    await expect(intro).toContainText(mission.title);
    await expect(intro).toContainText(mission.objectives[0].label);

    await page.locator('#missionIntroOk').click();
    await expect(intro).toBeHidden();
    await expect(page.locator('#canvasContainer')).toBeVisible();
    await expect(page.locator('#missionHud')).toBeVisible();
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
