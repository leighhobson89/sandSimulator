import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import {
    canvasPoint, canvasViewportMetrics, clickCanvasCell, scrollCanvasToCell
} from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'zoom');
});

async function start(page) {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await game.seed(1001);
    return game;
}

async function wheel(page, deltaY) {
    const box = await page.locator('#canvasArea').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, deltaY);
}

async function zoom(page, levels) {
    const delta = levels > 0 ? -120 : 120;
    for (let i = 0; i < Math.abs(levels); i++) await wheel(page, delta);
}

async function expectZoom(page, level) {
    await expect(page.locator('#canvasArea')).toHaveAttribute('data-zoom-level', String(level));
}

function typeAt(state, { x, y }) {
    return state.arrays.type[y * state.cols + x];
}

test('wheel zoom exposes levels 1 through 4 and clamps at both ends', async ({ page }) => {
    await start(page);
    await expectZoom(page, 1);
    await zoom(page, 3);
    await expectZoom(page, 4);
    await wheel(page, -120);
    await expectZoom(page, 4);
    await zoom(page, -3);
    await expectZoom(page, 1);
    await wheel(page, 120);
    await expectZoom(page, 1);
});

test('vertical wheel is zoom-only and shows a fading zoom level overlay', async ({ page }) => {
    await start(page);
    const area = page.locator('#canvasArea');
    const status = page.locator('#zoomStatus');

    await zoom(page, 1);
    await expectZoom(page, 2);
    await expect(status).toHaveText('Zoom: 2/4');
    await expect(status).toBeVisible();
    await expect(status).toHaveClass(/zoom-status-fade/);
    const areaBox = await area.boundingBox();
    const statusBox = await status.boundingBox();
    expect(areaBox).not.toBeNull();
    expect(statusBox).not.toBeNull();
    expect(statusBox.x + statusBox.width).toBeGreaterThan(areaBox.x + areaBox.width - 24);
    expect(statusBox.y).toBeLessThan(areaBox.y + areaBox.height * 0.25);
    await expect(status).toBeHidden({ timeout: 1500 });

    await zoom(page, 2);
    await expectZoom(page, 4);
    await area.evaluate(element => {
        element.scrollTop = Math.floor((element.scrollHeight - element.clientHeight) / 2);
    });
    const before = await canvasViewportMetrics(page);
    await wheel(page, -120);
    const after = await canvasViewportMetrics(page);
    expect(after.scrollTop).toBe(before.scrollTop);
    await expect(status).toHaveText('Zoom: 4/4');
});

test('level one fits while higher levels expose scrollbars and themed thin state', async ({ page }) => {
    await start(page);
    let metrics = await canvasViewportMetrics(page);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);

    await zoom(page, 1);
    await expectZoom(page, 2);
    metrics = await canvasViewportMetrics(page);
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
    expect(metrics.overflowX).toBe('auto');
    expect(metrics.overflowY).toBe('auto');

    for (const theme of ['workshop', 'paper', 'terminal']) {
        await page.locator('#themeSelect').selectOption(theme);
        expect(await page.locator('body').getAttribute('data-theme')).toBe(theme);
        const styles = await page.locator('#canvasArea').evaluate(area => {
            const computed = getComputedStyle(area);
            return { scrollbarWidth: computed.scrollbarWidth, scrollbarColor: computed.scrollbarColor };
        });
        expect(styles.scrollbarWidth).toBe('thin');
        expect(styles.scrollbarColor).not.toBe('auto');
    }
});

test('arrow keys scroll only above level one and never hijack focused controls', async ({ page }) => {
    await start(page);
    await page.evaluate(() => document.activeElement?.blur());
    let before = await canvasViewportMetrics(page);
    await page.keyboard.press('ArrowRight');
    let after = await canvasViewportMetrics(page);
    expect(after.scrollLeft).toBe(before.scrollLeft);

    await zoom(page, 1);
    await expectZoom(page, 2);
    await page.evaluate(() => {
        const area = document.querySelector('#canvasArea');
        area.scrollTo(0, 0);
        document.activeElement?.blur();
    });
    await page.keyboard.press('ArrowRight');
    after = await canvasViewportMetrics(page);
    expect(after.scrollLeft).toBeGreaterThan(0);
    await page.keyboard.press('ArrowDown');
    after = await canvasViewportMetrics(page);
    expect(after.scrollTop).toBeGreaterThan(0);

    const slider = page.locator('#brushSize');
    const value = Number(await slider.inputValue());
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    expect(Number(await slider.inputValue())).toBeGreaterThan(value);
    after = await canvasViewportMetrics(page);
    expect(after.scrollLeft).toBeGreaterThan(0);
    expect(after.scrollTop).toBeGreaterThan(0);
});

test('painting and erasing remain mapped after scroll and middle click is inert', async ({ page }) => {
    const game = await start(page);
    await zoom(page, 1);
    await expectZoom(page, 2);
    const initial = await game.state();
    const cell = { x: initial.cols - 8, y: 24 };
    await scrollCanvasToCell(page, cell);
    await page.getByRole('button', { name: 'Sand', exact: true }).click();

    const before = await canvasViewportMetrics(page);
    await clickCanvasCell(page, cell, { button: 'middle' });
    let state = await game.state();
    expect(typeAt(state, cell)).toBe(0);
    const middle = await canvasViewportMetrics(page);
    expect(middle.scrollLeft).toBe(before.scrollLeft);
    expect(middle.scrollTop).toBe(before.scrollTop);
    await page.keyboard.press('Escape');

    await clickCanvasCell(page, cell);
    state = await game.state();
    const sand = state.definitions.find(definition => definition?.name === 'Sand').id;
    expect(typeAt(state, cell)).toBe(sand);
    await clickCanvasCell(page, cell, { button: 'right' });
    state = await game.state();
    expect(typeAt(state, cell)).toBe(0);
});

test('simulation continues while zoomed and scrolled', async ({ page }) => {
    const game = await start(page);
    await zoom(page, 2);
    await expectZoom(page, 3);
    const state = await game.state();
    await scrollCanvasToCell(page, { x: state.cols - 12, y: 40 });
    const before = await game.state();
    const after = await game.step(3);
    expect(after.frameCount).toBe(before.frameCount + 3);
});

test('re-entering the workspace resets zoom and scroll offsets', async ({ page }) => {
    await start(page);
    await zoom(page, 2);
    await expectZoom(page, 3);
    const scrolled = await canvasViewportMetrics(page);
    expect(scrolled.scrollLeft + scrolled.scrollTop).toBeGreaterThan(0);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Resume Game' })).toBeVisible();
    await page.getByRole('button', { name: 'Resume Game' }).click();
    await expect(page.locator('#canvas')).toBeVisible();
    await expectZoom(page, 1);
    const reset = await canvasViewportMetrics(page);
    expect(reset.scrollLeft).toBe(0);
    expect(reset.scrollTop).toBe(0);
});

test('machine overlay stays aligned for hit testing after zoom and scroll', async ({ page }) => {
    const game = await start(page);
    await zoom(page, 1);
    await expectZoom(page, 2);
    const state = await game.state();
    const cell = { x: state.cols - 24, y: 20 };
    await game.setFixture([{ x: cell.x, y: cell.y, type: 'Fan' }]);
    await scrollCanvasToCell(page, cell);
    await game.step(0);

    const icon = page.locator('#machineOverlay .machine-overlay-icon');
    await expect(icon).toHaveCount(1);
    const box = await icon.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('#machineDialog')).toBeVisible();
    await expect(page.locator('#machineDialogTitle')).toHaveText('Fan settings');
    await page.locator('#machineDialogCancel').click();
});

test('edge pan is disabled by default, only moves near the outer five percent, and stops promptly', async ({ page }) => {
    await start(page);
    await zoom(page, 1);
    await expectZoom(page, 2);
    const toggle = page.locator('#edgePanToggle');
    await expect(toggle).toHaveAttribute('type', 'checkbox');
    const area = page.locator('#canvasArea');
    const box = await area.boundingBox();

    await toggle.uncheck();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const centre = await canvasViewportMetrics(page);
    await page.waitForTimeout(250);
    expect((await canvasViewportMetrics(page)).scrollLeft).toBe(centre.scrollLeft);

    await toggle.check();
    await page.evaluate(() => {
        const canvasArea = document.querySelector('#canvasArea');
        canvasArea.scrollLeft = Math.floor((canvasArea.scrollWidth - canvasArea.clientWidth) / 2);
        canvasArea.scrollTop = Math.floor((canvasArea.scrollHeight - canvasArea.clientHeight) / 2);
    });
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    const edgeBefore = await canvasViewportMetrics(page);
    await page.waitForTimeout(350);
    const edgeAfter = await canvasViewportMetrics(page);
    expect(edgeAfter.scrollLeft).toBeLessThan(edgeBefore.scrollLeft);

    await page.mouse.move(2, 2);
    const left = await canvasViewportMetrics(page);
    await page.waitForTimeout(250);
    expect((await canvasViewportMetrics(page)).scrollLeft).toBe(left.scrollLeft);

    await toggle.uncheck();
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    const disabled = await canvasViewportMetrics(page);
    await page.waitForTimeout(250);
    expect((await canvasViewportMetrics(page)).scrollLeft).toBe(disabled.scrollLeft);
});
