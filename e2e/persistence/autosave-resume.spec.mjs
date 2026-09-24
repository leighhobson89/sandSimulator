import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { clickCanvasCell } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'autosave');
});

async function chooseStandardWorld(page) {
    const dialog = page.locator('#worldSizeDialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: '260 × 150', exact: true }).check();
    await dialog.getByRole('button', { name: 'Start Game', exact: true }).click();
}

test('resume slot is offered on startup and restores the saved snapshot', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await page.locator('#brushSize').fill('1');
    await clickCanvasCell(page, { x: 12, y: 12 });
    await page.getByRole('button', { name: 'Save' }).click();
    const save = await page.locator('#saveString').inputValue();
    await page.evaluate(value => localStorage.setItem('elemental-foundry.autosave.v1', value), save);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Resume Game' })).toBeVisible();
    await page.getByRole('button', { name: 'Resume Game' }).click();
    await expect(page.locator('#canvasContainer')).toBeVisible();
    await expect(page.locator('#autosaveToggle')).toBeChecked();
    const state = await game.state(); const sand = state.definitions.find(def => def.name === 'Sand').id;
    expect(state.typeCounts[String(sand)]).toBeGreaterThan(0);
});

test('autosave sits beside Edge pan, preserves the resume slot while off, and restarts a fresh five-minute timer', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const autosave = page.locator('#autosaveToggle');
    await expect(page.getByRole('checkbox', { name: 'Autosave', exact: true })).toBeVisible();
    await expect(autosave).toBeChecked();
    const adjacentToEdgePan = await page.evaluate(() => {
        const edgePanLabel = document.querySelector('#edgePanToggle')?.closest('label');
        const autosaveLabel = document.querySelector('#autosaveToggle')?.closest('label');
        return !!edgePanLabel && !!autosaveLabel &&
            edgePanLabel.parentElement === autosaveLabel.parentElement &&
            edgePanLabel.nextElementSibling === autosaveLabel;
    });
    expect(adjacentToEdgePan).toBe(true);

    const key = 'elemental-foundry.autosave.v1';
    const originalResume = await page.evaluate(storageKey => localStorage.getItem(storageKey), key);
    expect(originalResume).not.toBeNull();
    await page.clock.runFor(4 * 60_000);

    await autosave.uncheck();
    await expect(autosave).not.toBeChecked();
    await expect(page.evaluate(storageKey => localStorage.getItem(storageKey), key)).resolves.toBe(originalResume);
    await game.setFixture([{ x: 12, y: 12, type: 'Water' }]);
    await autosave.check();
    await expect(autosave).toBeChecked();
    await expect(page.evaluate(storageKey => localStorage.getItem(storageKey), key)).resolves.toBe(originalResume);

    // Crossing the old timer's five-minute deadline must not write. Re-enabling
    // starts a new full interval and does not save immediately.
    await page.clock.runFor(60_000);
    await expect(page.evaluate(storageKey => localStorage.getItem(storageKey), key)).resolves.toBe(originalResume);
    await page.clock.runFor(5 * 60_000 - 60_001);
    await expect(page.evaluate(storageKey => localStorage.getItem(storageKey), key)).resolves.toBe(originalResume);
    await page.clock.runFor(1);
    await page.clock.runFor(20);
    await expect.poll(() => page.evaluate(storageKey => localStorage.getItem(storageKey), key))
        .not.toBe(originalResume);

    await page.evaluate(storageKey => {
        const setItem = localStorage.setItem.bind(localStorage);
        localStorage.setItem = (keyName, value) => {
            if (keyName === storageKey) throw new DOMException('Quota exceeded', 'QuotaExceededError');
            setItem(keyName, value);
        };
    }, key);
    await page.clock.runFor(5 * 60_000);
    await page.clock.runFor(20);
    await expect(page.locator('#autosaveStatus')).toContainText(/autosave/i);
    await expect(autosave).not.toBeChecked();
});

test('a selected 520 × 300 world keeps its dimensions through resume', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame({ worldSize: '520 × 300' });
    expect(await game.state()).toMatchObject({ cols: 520, rows: 300 });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const save = await page.locator('#saveString').inputValue();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.evaluate(value => localStorage.setItem('elemental-foundry.autosave.v1', value), save);
    await page.reload();

    await page.getByRole('button', { name: 'Resume Game', exact: true }).click();
    expect(await game.state()).toMatchObject({ cols: 520, rows: 300 });
});

test('New Game replacement choices preserve, discard, or replace the saved resume boundary', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await clickCanvasCell(page, { x: 14, y: 14 });
    await page.getByRole('button', { name: 'Save' }).click();
    const originalResume = await page.evaluate(() => localStorage.getItem('elemental-foundry.autosave.v1'));
    await page.locator('#closeSaveDialog').click();
    await page.reload();

    await page.getByRole('button', { name: 'New Game' }).click();
    await chooseStandardWorld(page);
    await expect(page.locator('#autosaveChoiceDialog')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.evaluate(() => localStorage.getItem('elemental-foundry.autosave.v1'))).resolves.toBe(originalResume);

    await page.getByRole('button', { name: 'New Game' }).click();
    await chooseStandardWorld(page);
    await page.getByRole('button', { name: 'No, play without autosave' }).click();
    await expect(page.locator('#canvasContainer')).toBeVisible();
    await expect(page.locator('#autosaveToggle')).not.toBeChecked();
    await expect(page.evaluate(() => localStorage.getItem('elemental-foundry.autosave.v1'))).resolves.toBe(originalResume);
    await page.reload();

    await page.getByRole('button', { name: 'New Game' }).click();
    await chooseStandardWorld(page);
    await page.getByRole('button', { name: 'Yes, replace it' }).click();
    await expect(page.locator('#canvasContainer')).toBeVisible();
    await expect(page.locator('#autosaveToggle')).toBeChecked();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('elemental-foundry.autosave.v1')))
        .not.toBe(originalResume);
});

test('clear cancel and confirm keep the prior autosave available to Resume Game', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await page.getByRole('button', { name: 'Water', exact: true }).click();
    await clickCanvasCell(page, { x: 20, y: 20 });
    await page.getByRole('button', { name: 'Save' }).click();
    const saved = await page.locator('#saveString').inputValue();
    await page.locator('#closeSaveDialog').click();
    await page.evaluate(value => localStorage.setItem('elemental-foundry.autosave.v1', value), saved);
    const before = await game.state();
    const water = before.definitions.find(definition => definition?.name === 'Water').id;

    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.locator('#clearDialog')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect((await game.state()).typeCounts[String(water)]).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Clear' }).click();
    await page.getByRole('button', { name: 'Clear World' }).click();
    expect((await game.state()).typeCounts[String(water)] || 0).toBe(0);
    await expect(page.evaluate(() => localStorage.getItem('elemental-foundry.autosave.v1'))).resolves.toBe(saved);

    await page.reload();
    await page.getByRole('button', { name: 'Resume Game' }).click();
    const resumed = await game.state();
    expect(resumed.typeCounts[String(water)]).toBeGreaterThan(0);
});
