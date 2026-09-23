import { expect } from '@playwright/test';

export async function canvasMetrics(page) {
    return page.locator('#canvas').evaluate(canvas => {
        const rect = canvas.getBoundingClientRect();
        return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, width: canvas.width, height: canvas.height };
    });
}

export async function canvasViewportMetrics(page) {
    return page.locator('#canvasArea').evaluate(area => {
        const canvas = area.querySelector('#canvas');
        const stage = area.querySelector('#canvasStage');
        const areaRect = area.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const stageRect = stage.getBoundingClientRect();
        const styles = getComputedStyle(area);
        return {
            area: { x: areaRect.x, y: areaRect.y, width: areaRect.width, height: areaRect.height },
            canvas: { x: canvasRect.x, y: canvasRect.y, width: canvasRect.width, height: canvasRect.height },
            stage: { x: stageRect.x, y: stageRect.y, width: stageRect.width, height: stageRect.height },
            clientWidth: area.clientWidth,
            clientHeight: area.clientHeight,
            scrollWidth: area.scrollWidth,
            scrollHeight: area.scrollHeight,
            scrollLeft: area.scrollLeft,
            scrollTop: area.scrollTop,
            overflowX: styles.overflowX,
            overflowY: styles.overflowY
        };
    });
}

export async function scrollCanvasToCell(page, { x, y }) {
    return page.locator('#canvasArea').evaluate((area, cell) => {
        const canvas = area.querySelector('#canvas');
        if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y) ||
            cell.x < 0 || cell.y < 0 || cell.x >= canvas.width || cell.y >= canvas.height) {
            throw new RangeError(`Canvas cell is outside the viewport: ${cell.x},${cell.y}`);
        }
        const areaRect = area.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const targetX = area.scrollLeft + canvasRect.left - areaRect.left +
            ((cell.x + 0.5) / canvas.width) * canvasRect.width;
        const targetY = area.scrollTop + canvasRect.top - areaRect.top +
            ((cell.y + 0.5) / canvas.height) * canvasRect.height;
        const maxLeft = Math.max(0, area.scrollWidth - area.clientWidth);
        const maxTop = Math.max(0, area.scrollHeight - area.clientHeight);
        area.scrollLeft = Math.min(maxLeft, Math.max(0, targetX - area.clientWidth / 2));
        area.scrollTop = Math.min(maxTop, Math.max(0, targetY - area.clientHeight / 2));
    }, { x, y });
}

export async function canvasPoint(page, { x, y }) {
    const metrics = await canvasMetrics(page);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= metrics.width || y >= metrics.height) {
        throw new RangeError(`Canvas cell is outside the viewport: ${x},${y}`);
    }
    return {
        x: metrics.rect.x + ((x + 0.5) / metrics.width) * metrics.rect.width,
        y: metrics.rect.y + ((y + 0.5) / metrics.height) * metrics.rect.height
    };
}

export async function clickCanvasCell(page, cell, options) {
    const point = await canvasPoint(page, cell);
    await page.mouse.click(point.x, point.y, options);
}

export async function dragCanvasCells(page, from, to, steps = 5) {
    const start = await canvasPoint(page, from);
    const end = await canvasPoint(page, to);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps });
    await page.mouse.up();
}

export async function expectCanvasVisible(page) {
    await expect(page.locator('#canvas')).toBeVisible();
    await expect.poll(async () => (await canvasMetrics(page)).width).toBeGreaterThan(0);
}
