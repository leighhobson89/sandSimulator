import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { clickCanvasCell } from '../helpers/canvas.mjs';

test('export and import round-trip restores world and tool settings', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await page.getByRole('button', { name: 'Water', exact: true }).click();
    await page.locator('#brushSize').fill('9'); await clickCanvasCell(page, { x: 18, y: 18 });
    const before = await game.state();
    await page.getByRole('button', { name: 'Export' }).click();
    const save = await page.locator('#saveString').inputValue();
    expect(save.length).toBeGreaterThan(20);
    await page.locator('#closeSaveDialog').click();
    await page.getByRole('button', { name: 'Clear' }).click();
    await page.getByRole('button', { name: 'Clear World' }).click();
    await page.getByRole('button', { name: 'Import' }).click();
    await page.locator('#saveString').fill(save); await page.getByRole('button', { name: 'Load Game' }).click();
    if (await page.locator('#autosaveChoiceDialog').isVisible()) {
        await page.getByRole('button', { name: 'Yes, replace it' }).click();
    }
    const after = await game.state();
    const water = after.definitions.find(def => def.name === 'Water').id;
    expect(after.typeCounts[String(water)]).toBeGreaterThan(0);
    await expect(page.locator('#brushSize')).toHaveValue('9');
});
