import { expect } from '@playwright/test';

export async function canvasMetrics(page) {
    return page.locator('#canvas').evaluate(canvas => {
        const rect = canvas.getBoundingClientRect();
        return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, width: canvas.width, height: canvas.height };
    });
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
