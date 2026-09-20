import { test, expect } from '@playwright/test';

const themes = ['workshop', 'ember', 'paper', 'terminal', 'lagoon', 'dune'];

async function startSandbox(page) {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Elemental Foundry' })).toBeVisible();
    await page.getByRole('button', { name: 'New Game' }).click();
    await expect(page.locator('#canvas')).toBeVisible();
}

test('all themes render and retain an accessible selected control', async ({ page }) => {
    await page.goto('/');

    for (const theme of themes) {
        const swatch = page.getByRole('button', { name: `${theme[0].toUpperCase()}${theme.slice(1)} theme` });
        await swatch.click();
        await expect(page.locator('body')).toHaveAttribute('data-theme', theme);
        await expect(swatch).toHaveClass(/selected/);
        await expect(page).toHaveScreenshot(`menu-${theme}.png`, {
            animations: 'disabled',
            fullPage: true
        });
    }
});

test('mouse drawing and keyboard controls work in the browser', async ({ page }) => {
    await startSandbox(page);
    const canvas = page.locator('#canvas');
    const canvasBox = await canvas.boundingBox();
    if (!canvasBox) throw new Error('Canvas has no visible bounds');

    await page.getByRole('button', { name: 'Pause' }).click();
    const before = await canvas.screenshot();
    await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    await expect.poll(async () => Buffer.compare(before, await canvas.screenshot())).not.toBe(0);

    const eraser = page.getByRole('button', { name: 'Eraser' });
    await eraser.focus();
    await expect(eraser).toBeFocused();
    await page.keyboard.press('e');
    await expect(eraser).toHaveClass(/active-toggle/);
});

test('material buttons expose glossary tooltips on hover and focus', async ({ page }) => {
    await page.goto('/');
    const sand = page.getByRole('button', { name: 'Sand', exact: true });
    await expect(sand).toBeVisible();
    await expect(sand).toHaveAttribute('aria-describedby', 'toolTooltip');

    await sand.hover();
    const tooltip = page.locator('#toolTooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Sand');
    await expect(tooltip).toContainText('Glass');
    await expect(tooltip).toContainText('Reactions');

    await sand.focus();
    await expect(tooltip).toBeVisible();
});

test('clear requires confirmation and supports cancel', async ({ page }) => {
    await startSandbox(page);
    const clear = page.getByRole('button', { name: 'Clear', exact: true });
    await clear.click();
    const dialog = page.locator('#clearDialog');
    await expect(dialog).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();

    await clear.click();
    await page.getByRole('button', { name: 'Clear World', exact: true }).click();
    await expect(dialog).toBeHidden();
});

test.describe('touch and narrow screens', () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

    test('touch drawing and narrow layout stay usable', async ({ page }) => {
        await startSandbox(page);
        const canvas = page.locator('#canvas');
        const canvasBox = await canvas.boundingBox();
        if (!canvasBox) throw new Error('Canvas has no visible bounds');

        await page.getByRole('button', { name: 'Pause' }).click();
        const before = await canvas.screenshot();
        await page.touchscreen.tap(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
        await expect.poll(async () => Buffer.compare(before, await canvas.screenshot())).not.toBe(0);

        await expect(page.locator('#toolsPanel')).toBeVisible();
        await expect(page.locator('#floatingContainer')).toBeVisible();
        await expect(page).toHaveScreenshot('narrow-workspace.png', {
            animations: 'disabled',
            mask: [canvas]
        });
    });
});
