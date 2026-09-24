import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import {
    canvasPoint, canvasViewportMetrics, clickCanvasCell, scrollCanvasToCell
} from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'zoom');
});

async function start(page, worldSize = '260 × 150') {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame({ worldSize });
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

async function canvasCellScale(page) {
    return page.locator('#canvas').evaluate(canvas => {
        const rect = canvas.getBoundingClientRect();
        return { x: rect.width / canvas.width, y: rect.height / canvas.height };
    });
}

async function fitSnapshot(page) {
    return page.locator('#canvasArea').evaluate(area => {
        const canvas = area.querySelector('#canvas');
        const stage = area.querySelector('#canvasStage');
        const bottomEdge = area.querySelector('[data-edge="bottom"]');
        const leftEdge = area.querySelector('[data-edge="left"]');
        const rightEdge = area.querySelector('[data-edge="right"]');
        const areaRect = area.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const stageRect = stage.getBoundingClientRect();
        const styles = getComputedStyle(area);
        const paddingLeft = parseFloat(styles.paddingLeft);
        const paddingRight = parseFloat(styles.paddingRight);
        const paddingTop = parseFloat(styles.paddingTop);
        const paddingBottom = parseFloat(styles.paddingBottom);
        const contentLeft = areaRect.left + area.clientLeft + paddingLeft;
        const contentTop = areaRect.top + area.clientTop + paddingTop;
        const usableWidth = area.clientWidth - paddingLeft - paddingRight;
        const usableHeight = area.clientHeight - paddingTop - paddingBottom;
        return {
            usableWidth,
            usableHeight,
            cols: canvas.width,
            rows: canvas.height,
            scaleX: canvasRect.width / canvas.width,
            scaleY: canvasRect.height / canvas.height,
            canvasRect: { left: canvasRect.left, top: canvasRect.top, right: canvasRect.right, bottom: canvasRect.bottom },
            stageRect: { left: stageRect.left, top: stageRect.top, right: stageRect.right, bottom: stageRect.bottom },
            contentRect: {
                left: contentLeft,
                top: contentTop,
                right: contentLeft + usableWidth,
                bottom: contentTop + usableHeight
            },
            edgeRects: [leftEdge, rightEdge, bottomEdge].map(edge => {
                const rect = edge.getBoundingClientRect();
                return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
            }),
            scrollWidth: area.scrollWidth,
            scrollHeight: area.scrollHeight,
            clientWidth: area.clientWidth,
            clientHeight: area.clientHeight
        };
    });
}

async function expectWorldFit(page, { cols, rows }) {
    await expectZoom(page, 1);
    const fit = await fitSnapshot(page);
    const expectedScale = Math.min(
        (fit.usableWidth - 2) / cols,
        (fit.usableHeight - 2) / (rows + 12)
    );
    expect(Math.abs(fit.scaleX - expectedScale)).toBeLessThan(0.02);
    expect(Math.abs(fit.scaleY - expectedScale)).toBeLessThan(0.02);
    expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth + 1);
    expect(fit.scrollHeight).toBeLessThanOrEqual(fit.clientHeight + 1);
    expect(fit.stageRect.left).toBeGreaterThanOrEqual(fit.contentRect.left - 1);
    expect(fit.stageRect.right).toBeLessThanOrEqual(fit.contentRect.right + 1);
    expect(fit.stageRect.bottom).toBeLessThanOrEqual(fit.contentRect.bottom + 1);
    expect(Math.abs(fit.stageRect.bottom - fit.contentRect.bottom)).toBeLessThanOrEqual(2);
    for (const edge of fit.edgeRects) {
        expect(edge.left).toBeGreaterThanOrEqual(fit.contentRect.left - 1);
        expect(edge.right).toBeLessThanOrEqual(fit.contentRect.right + 1);
        expect(edge.top).toBeGreaterThanOrEqual(fit.contentRect.top - 1);
        expect(edge.bottom).toBeLessThanOrEqual(fit.contentRect.bottom + 1);
    }
    expect(fit.edgeRects[2].bottom).toBeGreaterThanOrEqual(fit.canvasRect.bottom);
    return fit;
}

test('standard worlds keep the original four zoom levels from level one', async ({ page }) => {
    await start(page);
    await expectZoom(page, 1);
    const baseScale = await canvasCellScale(page);
    await zoom(page, 1);
    await expectZoom(page, 2);
    let scale = await canvasCellScale(page);
    expect(scale.x).toBeCloseTo(baseScale.x * 1.5, 1);
    expect(scale.y).toBeCloseTo(baseScale.y * 1.5, 1);
    await zoom(page, 1);
    await expectZoom(page, 3);
    scale = await canvasCellScale(page);
    expect(scale.x).toBeCloseTo(baseScale.x * 2, 1);
    expect(scale.y).toBeCloseTo(baseScale.y * 2, 1);
    await zoom(page, 1);
    await expectZoom(page, 4);
    scale = await canvasCellScale(page);
    expect(scale.x).toBeCloseTo(baseScale.x * 3, 1);
    expect(scale.y).toBeCloseTo(baseScale.y * 3, 1);
    await expect(page.locator('#zoomStatus')).toHaveText('Zoom: 4/4');
    await wheel(page, -120);
    await expectZoom(page, 4);
    await zoom(page, -3);
    await expectZoom(page, 1);
    await wheel(page, 120);
    await expectZoom(page, 1);
});

for (const size of [
    { label: '260 × 150', cols: 260, rows: 150, factors: [1, 1.5, 2, 3] },
    { label: '520 × 300', cols: 520, rows: 300, factors: [1, 2, 3, 4, 6] }
]) {
    test(`${size.label} fits the world and boundary at level one, with its complete zoom profile`, async ({ page }) => {
        const game = await start(page, size.label);
        await expect(game.state()).resolves.toMatchObject({ cols: size.cols, rows: size.rows });
        const fit = await expectWorldFit(page, size);
        const baseScale = { x: fit.scaleX, y: fit.scaleY };

        for (let index = 1; index < size.factors.length; index++) {
            await zoom(page, 1);
            const level = index + 1;
            await expectZoom(page, level);
            await expect(page.locator('#zoomStatus')).toHaveText(`Zoom: ${level}/${size.factors.length}`);
            const scale = await canvasCellScale(page);
            expect(scale.x).toBeCloseTo(baseScale.x * size.factors[index], 1);
            expect(scale.y).toBeCloseTo(baseScale.y * size.factors[index], 1);
        }

        await wheel(page, -120);
        await expectZoom(page, size.factors.length);
        await zoom(page, -(size.factors.length - 1));
        await expectWorldFit(page, size);
        await expect(page.locator('#zoomStatus')).toHaveText(`Zoom: 1/${size.factors.length}`);
        await wheel(page, 120);
        await expectZoom(page, 1);
    });
}

test('screens below the canvas-area threshold retain four zoom levels and status', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await page.addStyleTag({ content: '#canvasArea { flex: 0 0 auto !important; width: 259px !important; height: 150px !important; padding: 0 !important; }' });
    await game.newGame();
    await expectZoom(page, 1);
    await zoom(page, 3);
    await expectZoom(page, 4);
    await expect(page.locator('#zoomStatus')).toHaveText('Zoom: 4/4');
    await wheel(page, -120);
    await expectZoom(page, 4);
});

test('world fit recalculates to the smaller available dimension after viewport resize', async ({ page }) => {
    const game = await start(page, '520 × 300');
    await expect(game.state()).resolves.toMatchObject({ cols: 520, rows: 300 });

    for (const viewport of [
        { width: 900, height: 800 },
        { width: 1600, height: 500 }
    ]) {
        await page.setViewportSize(viewport);
        await expect.poll(async () => {
            const fit = await fitSnapshot(page);
            const expected = Math.min(
                (fit.usableWidth - 2) / 520,
                (fit.usableHeight - 2) / 312
            );
            return Math.abs(fit.scaleX - expected);
        }).toBeLessThan(0.02);
        const fit = await expectWorldFit(page, { cols: 520, rows: 300 });
        const widthLimited = (fit.usableWidth - 2) / 520 < (fit.usableHeight - 2) / 312;
        expect(widthLimited).toBe(viewport.width < 1200);
    }
});

test('expanded-world edges and camera clamps remain correct after zooming in from fitted view', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 500 });
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame({ worldSize: '520 × 300' });
    const area = page.locator('#canvasArea');
    await expect(game.state()).resolves.toMatchObject({ cols: 520, rows: 300 });
    await expectWorldFit(page, { cols: 520, rows: 300 });

    await zoom(page, 1);
    await expectZoom(page, 2);
    const zoomed = await canvasViewportMetrics(page);
    const maxLeft = zoomed.scrollWidth - zoomed.clientWidth;
    const maxTop = zoomed.scrollHeight - zoomed.clientHeight;
    expect(maxLeft).toBeGreaterThan(0);
    expect(maxTop).toBeGreaterThan(0);

    const overlay = page.locator('svg#worldBoundaryOverlay');
    await expect(overlay).toHaveAttribute('aria-hidden', 'true');
    for (const edge of ['left', 'right', 'bottom']) {
        const group = overlay.locator(`[data-edge="${edge}"]`);
        await expect(group).toHaveCount(1);
        const strokes = await group.locator('path').evaluateAll(paths => paths.map(path => {
            const style = getComputedStyle(path);
            const match = style.stroke.match(/\d+(?:\.\d+)?/g) || [];
            return { color: match.slice(0, 3).map(Number), width: parseFloat(style.strokeWidth) };
        }));
        expect(strokes).toHaveLength(1);
        expect(strokes[0].color).toEqual([117, 69, 33]);
        expect(strokes[0].width).toBe(4);
    }
    const bottomEdge = await overlay.locator('[data-edge="bottom"]').evaluate(group =>
        Math.min(...[...group.querySelectorAll('path')].map(path => path.getBBox().y))
    );
    const canvasHeight = await page.locator('#canvas').evaluate(canvas => canvas.height);
    expect(bottomEdge).toBeGreaterThanOrEqual(canvasHeight);

    await area.evaluate((element, extents) => element.scrollTo(extents.maxLeft / 2, extents.maxTop / 2), {
        maxLeft,
        maxTop
    });
    const centered = await canvasViewportMetrics(page);
    expect(Math.abs(centered.scrollLeft - maxLeft / 2)).toBeLessThanOrEqual(2);
    expect(Math.abs(centered.scrollTop - maxTop / 2)).toBeLessThanOrEqual(2);
    await area.evaluate(element => element.scrollTo(-100, -100));
    await expect.poll(async () => {
        const metrics = await canvasViewportMetrics(page);
        return [metrics.scrollLeft, metrics.scrollTop];
    }).toEqual([0, 0]);
    await area.evaluate(element => element.scrollTo(element.scrollWidth + 1000, element.scrollHeight + 1000));
    const atFarEdge = await canvasViewportMetrics(page);
    expect(atFarEdge.scrollLeft).toBe(atFarEdge.scrollWidth - atFarEdge.clientWidth);
    expect(atFarEdge.scrollTop).toBe(atFarEdge.scrollHeight - atFarEdge.clientHeight);
    await area.focus();
    await page.keyboard.press('ArrowDown');
    const afterBoundaryInput = await canvasViewportMetrics(page);
    expect(afterBoundaryInput.scrollTop).toBe(atFarEdge.scrollTop);
    await page.keyboard.press('ArrowUp');
    const afterOppositeInput = await canvasViewportMetrics(page);
    expect(afterOppositeInput.scrollTop).toBeLessThan(atFarEdge.scrollTop);
});

test('standard-world zoom status reports four levels and fades', async ({ page }) => {
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

test('standard level one fits while zoomed-in levels expose themed scrollbars', async ({ page }) => {
    await start(page);
    await expectZoom(page, 1);
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

test('arrow keys scroll above level one and never hijack focused controls', async ({ page }) => {
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

test('middle click samples after viewport scroll without panning the zoomed canvas', async ({ page }) => {
    const game = await start(page);
    // Keep this one-cell paint assertion deterministic: loose particles are
    // intentionally sprinkled across brushes larger than one cell.
    await page.locator('#brushSize').fill('1');
    await zoom(page, 1);
    await expectZoom(page, 2);
    const initial = await game.state();
    const cell = { x: initial.cols - 8, y: 24 };
    await game.setFixture([{ ...cell, type: 'Water' }]);
    await scrollCanvasToCell(page, cell);
    await page.getByRole('button', { name: 'Sand', exact: true }).click();

    await page.evaluate(() => {
        window.__middleDefaults = [];
        const canvas = document.querySelector('#canvas');
        for (const type of ['mousedown', 'auxclick']) {
            canvas.addEventListener(type, event => {
                if (event.button === 1) window.__middleDefaults.push({ type, prevented: event.defaultPrevented });
            });
        }
    });
    const before = await canvasViewportMetrics(page);
    await clickCanvasCell(page, cell, { button: 'middle' });
    const state = await game.state();
    const water = state.definitions.find(definition => definition?.name === 'Water').id;
    expect(typeAt(state, cell)).toBe(water);
    await expect(page.locator(`#particleButtons [data-particle-id="${water}"]`)).toHaveClass(/selected/);
    expect(await page.evaluate(() => window.__middleDefaults)).toEqual([
        { type: 'mousedown', prevented: true },
        { type: 'auxclick', prevented: true }
    ]);
    const middle = await canvasViewportMetrics(page);
    expect(middle.scrollLeft).toBe(before.scrollLeft);
    expect(middle.scrollTop).toBe(before.scrollTop);

    await game.setFixture([]);
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await clickCanvasCell(page, cell);
    const painted = await game.state();
    const sand = state.definitions.find(definition => definition?.name === 'Sand').id;
    expect(typeAt(painted, cell)).toBe(sand);
    await clickCanvasCell(page, cell, { button: 'right' });
    const erased = await game.state();
    expect(typeAt(erased, cell)).toBe(0);
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
    await start(page, '520 × 300');
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
        window.__edgePanPointerProbe = null;
        canvasArea.addEventListener('pointermove', event => {
            const rect = canvasArea.getBoundingClientRect();
            window.__edgePanPointerProbe = {
                pointerType: event.pointerType,
                insideArea: event.clientX >= rect.left && event.clientX <= rect.right &&
                    event.clientY >= rect.top && event.clientY <= rect.bottom,
                enabled: document.querySelector('#edgePanToggle').checked,
                canScrollX: canvasArea.scrollWidth > canvasArea.clientWidth + 1
            };
        }, true);
        canvasArea.scrollLeft = Math.floor((canvasArea.scrollWidth - canvasArea.clientWidth) / 2);
        canvasArea.scrollTop = Math.floor((canvasArea.scrollHeight - canvasArea.clientHeight) / 2);
    });
    await area.hover({ position: { x: 1, y: box.height / 2 } });
    await expect.poll(() => page.evaluate(() => window.__edgePanPointerProbe))
        .toMatchObject({ pointerType: 'mouse', insideArea: true, enabled: true, canScrollX: true });
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
