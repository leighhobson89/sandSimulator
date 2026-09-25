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

export async function machineArtworkCellPoint(page, machineCell) {
    return page.evaluate(async machine => {
        const canvas = document.querySelector('#canvas');
        const rect = canvas.getBoundingClientRect();
        const icon = document.querySelector(`#machineOverlay .machine-overlay-icon[data-machine-x="${machine.x}"][data-machine-y="${machine.y}"]`);
        const frame = icon?.querySelector(':scope > svg');
        if (!frame) throw new Error(`No machine artwork frame at ${machine.x},${machine.y}.`);

        const image = frame.querySelector('image');
        let pixels = null;
        let imageWidth = 0;
        let imageHeight = 0;
        if (image) {
            const response = await fetch('/resources/icons.png');
            const bitmap = await createImageBitmap(await response.blob());
            const sample = document.createElement('canvas');
            sample.width = bitmap.width;
            sample.height = bitmap.height;
            const context = sample.getContext('2d', { willReadFrequently: true });
            context.drawImage(bitmap, 0, 0);
            pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
            imageWidth = bitmap.width;
            imageHeight = bitmap.height;
            bitmap.close();
        }

        const inverse = frame.getScreenCTM().inverse();
        const viewBox = frame.viewBox.baseVal;
        const iconRect = icon.getBoundingClientRect();
        const cellWidth = rect.width / canvas.width;
        const cellHeight = rect.height / canvas.height;
        const left = Math.max(0, Math.floor((iconRect.left - rect.left) / cellWidth));
        const right = Math.min(canvas.width - 1, Math.ceil((iconRect.right - rect.left) / cellWidth));
        const top = Math.max(0, Math.floor((iconRect.top - rect.top) / cellHeight));
        const bottom = Math.min(canvas.height - 1, Math.ceil((iconRect.bottom - rect.top) / cellHeight));
        const shapes = [...frame.querySelectorAll('*')];
        const isOpaque = (screenX, screenY) => {
            const local = new DOMPoint(screenX, screenY).matrixTransform(inverse);
            if (local.x < viewBox.x || local.y < viewBox.y ||
                local.x >= viewBox.x + viewBox.width || local.y >= viewBox.y + viewBox.height) return false;
            if (image) {
                const x = Math.floor(local.x);
                const y = Math.floor(local.y);
                return x >= 0 && y >= 0 && x < imageWidth && y < imageHeight &&
                    pixels[(y * imageWidth + x) * 4 + 3] > 0;
            }
            return shapes.some(shape => {
                const style = getComputedStyle(shape);
                if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0) return false;
                const matrix = shape.getScreenCTM();
                if (!matrix) return false;
                const point = new DOMPoint(screenX, screenY).matrixTransform(matrix.inverse());
                const fill = style.fill !== 'none' && style.fill !== 'transparent' &&
                    Number(style.fillOpacity) > 0 && shape.isPointInFill?.(point);
                const stroke = style.stroke !== 'none' && style.stroke !== 'transparent' &&
                    Number(style.strokeOpacity) > 0 && shape.isPointInStroke?.(point);
                return !!(fill || stroke);
            });
        };

        const candidates = [];
        for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
            const screenX = rect.left + (x + 0.5) * cellWidth;
            const screenY = rect.top + (y + 0.5) * cellHeight;
            if (isOpaque(screenX, screenY)) candidates.push({
                x: screenX, y: screenY, cellX: x, cellY: y,
                distance: (x - machine.x) ** 2 + (y - machine.y) ** 2
            });
        }
        candidates.sort((a, b) => a.distance - b.distance || a.cellY - b.cellY || a.cellX - b.cellX);
        if (!candidates.length) throw new Error(`No opaque artwork cell found for machine at ${machine.x},${machine.y}.`);
        const { distance, ...point } = candidates[0];
        return point;
    }, machineCell);
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
