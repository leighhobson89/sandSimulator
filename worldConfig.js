export const MAX_WORLD_CELLS = 2_000_000;
export const WORLD_BYTES_PER_CELL = 85;
export const RENDER_BYTES_PER_CELL = 8;

export function assertValidWorldDimensions(cols, rows) {
    if (!Number.isSafeInteger(cols) || !Number.isSafeInteger(rows) || cols < 1 || rows < 1) {
        throw new RangeError('World dimensions must be positive whole numbers.');
    }
    const cells = cols * rows;
    if (!Number.isSafeInteger(cells) || cells > MAX_WORLD_CELLS) {
        throw new RangeError(`World size is limited to ${MAX_WORLD_CELLS.toLocaleString()} cells.`);
    }
    return { cols, rows, cells };
}

export function estimateWorldMemoryBytes(cells) {
    if (!Number.isSafeInteger(cells) || cells < 0) {
        throw new RangeError('Cell count must be a non-negative whole number.');
    }
    return cells * (WORLD_BYTES_PER_CELL + RENDER_BYTES_PER_CELL);
}
