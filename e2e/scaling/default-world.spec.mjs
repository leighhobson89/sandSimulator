import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

const FIXED_SIZES = [
    { label: '260 × 150', cols: 260, rows: 150 },
    { label: '520 × 300', cols: 520, rows: 300 }
];

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
        await attachGameDiagnostics(testInfo, page, 'default-world');
    }
});

async function openSizeChooser(page) {
    await page.goto('/?e2e');
    await page.getByRole('button', { name: 'New Game', exact: true }).click();
    const dialog = page.locator('#worldSizeDialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveRole('dialog');
    return dialog;
}

async function startChosenWorld(page, label) {
    if (label.includes('520')) {
        test.info().setTimeout(120_000);
        page.setDefaultTimeout(120_000);
    }
    const dialog = page.locator('#worldSizeDialog');
    await dialog.getByRole('radio', { name: label, exact: true }).check();
    await dialog.getByRole('button', { name: 'Start Game', exact: true }).click();
}

test('the standard 260 × 150 world is selected by default', async ({ page }) => {
    const dialog = await openSizeChooser(page);
    const standardSize = dialog.getByRole('radio', { name: '260 × 150', exact: true });
    await expect(standardSize).toBeChecked();
    await expect(dialog.getByRole('radio')).toHaveCount(2);
    await expect(dialog.getByRole('radio', { name: '260 × 150', exact: true })).toBeVisible();
    await expect(dialog.getByRole('radio', { name: '520 × 300', exact: true })).toBeVisible();
    await expect(dialog.getByRole('radio', { name: '780 × 450', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('radio', { name: '1040 × 600', exact: true })).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Start Game', exact: true }).click();
    const game = new GamePage(page);
    const state = await game.state();
    const canvas = await page.locator('#canvas').evaluate(element => ({
        width: element.width,
        height: element.height
    }));
    expect(state).toMatchObject({ cols: 260, rows: 150 });
    expect(canvas).toEqual({ width: state.cols, height: state.rows });
});

for (const size of FIXED_SIZES) {
    test(`new game can select the fixed ${size.label} world`, async ({ page }) => {
        await openSizeChooser(page);
        await startChosenWorld(page, size.label);
        const state = await new GamePage(page).state();
        expect({ cols: state.cols, rows: state.rows }).toEqual({ cols: size.cols, rows: size.rows });
    });
}

for (const sizeCase of [
    { width: 259, height: 150, largeChoicesAvailable: false, name: 'one pixel below the width threshold' },
    { width: 260, height: 149, largeChoicesAvailable: false, name: 'one pixel below the height threshold' },
    { width: 260, height: 150, largeChoicesAvailable: true, name: 'exactly at the threshold' },
    { width: 261, height: 151, largeChoicesAvailable: true, name: 'one pixel above both thresholds' }
]) {
    test(`fixed world choices are gated ${sizeCase.name}`, async ({ page }) => {
        const dialog = await openSizeChooser(page);
        await page.addStyleTag({ content: `#canvasArea { flex: 0 0 auto !important; width: ${sizeCase.width}px !important; height: ${sizeCase.height}px !important; padding: 0 !important; }` });
        await page.evaluate(() => window.dispatchEvent(new Event('resize')));
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('radio', { name: '260 × 150', exact: true })).toBeVisible();
        const largeChoice = dialog.locator('[data-large-world-size]');
        await expect(largeChoice).toHaveCount(1);
        if (sizeCase.largeChoicesAvailable) await expect(largeChoice).toBeVisible();
        else await expect(largeChoice).toBeHidden();
        await expect(dialog.getByRole('radio', { name: '780 × 450', exact: true })).toHaveCount(0);
        await expect(dialog.getByRole('radio', { name: '1040 × 600', exact: true })).toHaveCount(0);
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(dialog).toBeHidden();
        await expect(page.locator('#menu')).toBeVisible();
        await expect(page.locator('#canvasContainer')).toBeHidden();
    });
}

test('chooser and replacement cancellation preserve the saved game until a new size is confirmed', async ({ page }) => {
    const game = new GamePage(page);
    const chooser = await openSizeChooser(page);
    await chooser.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#canvasContainer')).toBeHidden();
    const storageKey = 'elemental-foundry.autosave.v1';
    await expect(page.evaluate(key => localStorage.getItem(key), storageKey)).resolves.toBeNull();

    await page.getByRole('button', { name: 'New Game', exact: true }).click();
    await expect(page.locator('#worldSizeDialog')).toBeVisible();
    await startChosenWorld(page, '520 × 300');
    await expect(page.locator('#canvas')).toBeVisible();
    expect(await game.state()).toMatchObject({ cols: 520, rows: 300 });
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), storageKey)).not.toBeNull();
    const previousResume = await page.evaluate(key => localStorage.getItem(key), storageKey);

    await page.reload();
    await page.getByRole('button', { name: 'New Game', exact: true }).click();
    await expect(page.locator('#worldSizeDialog')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.evaluate(key => localStorage.getItem(key), storageKey)).resolves.toBe(previousResume);

    await page.getByRole('button', { name: 'New Game', exact: true }).click();
    await startChosenWorld(page, '260 × 150');
    const replacement = page.locator('#autosaveChoiceDialog');
    await expect(replacement).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.evaluate(key => localStorage.getItem(key), storageKey)).resolves.toBe(previousResume);

    await page.getByRole('button', { name: 'New Game', exact: true }).click();
    await startChosenWorld(page, '260 × 150');
    await expect(replacement).toBeVisible();
    await page.getByRole('button', { name: 'Yes, replace it', exact: true }).click();
    await expect(page.locator('#canvas')).toBeVisible();
    expect(await game.state()).toMatchObject({ cols: 260, rows: 150 });
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), storageKey)).not.toBe(previousResume);
});
