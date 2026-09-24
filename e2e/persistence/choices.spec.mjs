import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { clickCanvasCell } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'persistence-choices');
});

async function createSave(page) {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await clickCanvasCell(page, { x: 18, y: 18 });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const save = await page.locator('#saveString').inputValue();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    return save;
}

async function chooseStandardWorld(page) {
    const dialog = page.locator('#worldSizeDialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: '260 × 150', exact: true }).check();
    await dialog.getByRole('button', { name: 'Start Game', exact: true }).click();
}

test('New Game autosave choices support Cancel and No without losing the existing resume slot', async ({ page }) => {
    await page.goto('/?e2e');
    await page.evaluate(() => localStorage.clear());
    const save = await createSave(page);
    await page.evaluate(value => localStorage.setItem('elemental-foundry.autosave.v1', value), save);
    await page.reload();

    await page.getByRole('button', { name: 'New Game' }).click();
    await chooseStandardWorld(page);
    const choice = page.locator('#autosaveChoiceDialog');
    await expect(choice).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(choice).toBeHidden();
    await expect(page.getByRole('button', { name: 'Resume Game' })).toBeVisible();

    await page.getByRole('button', { name: 'New Game' }).click();
    await chooseStandardWorld(page);
    await expect(choice).toBeVisible();
    await page.getByRole('button', { name: 'No, play without autosave', exact: true }).click();
    await expect(page.locator('#canvas')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('elemental-foundry.autosave.v1'))).toBe(save);
});

test('Load Cancel leaves both the live world and existing resume save unchanged', async ({ page }) => {
    const game = new GamePage(page);
    await page.goto('/?e2e');
    await page.evaluate(() => localStorage.clear());
    await game.newGame();
    await page.getByRole('button', { name: 'Water', exact: true }).click();
    await clickCanvasCell(page, { x: 22, y: 22 });
    const before = await game.state();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const save = await page.locator('#saveString').inputValue();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.evaluate(value => localStorage.setItem('elemental-foundry.autosave.v1', value), save);

    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.locator('#saveString').fill(save);
    await page.getByRole('button', { name: 'Load Game', exact: true }).click();
    await expect(page.locator('#autosaveChoiceDialog')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('#autosaveChoiceDialog')).toBeHidden();
    await expect(page.locator('#saveDialog')).toBeVisible();
    expect((await game.state()).arrays.type).toEqual(before.arrays.type);
    expect(await page.evaluate(() => localStorage.getItem('elemental-foundry.autosave.v1'))).toBe(save);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
});

test('Clear confirmation removes the live world without deleting the resume snapshot', async ({ page }) => {
    const game = new GamePage(page);
    await page.goto('/?e2e');
    await page.evaluate(() => localStorage.clear());
    const save = await createSave(page);
    await page.evaluate(value => localStorage.setItem('elemental-foundry.autosave.v1', value), save);
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await page.getByRole('button', { name: 'Clear World', exact: true }).click();
    expect((await game.state()).typeCounts).toEqual({ '0': (await game.state()).cols * (await game.state()).rows });
    expect(await page.evaluate(() => localStorage.getItem('elemental-foundry.autosave.v1'))).toBe(save);
});
