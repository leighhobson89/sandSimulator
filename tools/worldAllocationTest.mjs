import assert from 'node:assert/strict';
import { createWorld, getWorld } from '../physics.js';
import {
    assertValidWorldDimensions, estimateWorldMemoryBytes
} from '../worldConfig.js';

assert.deepEqual(assertValidWorldDimensions(260, 150), {
    cols: 260, rows: 150, cells: 39_000
});
assert.deepEqual(assertValidWorldDimensions(1040, 600), {
    cols: 1040, rows: 600, cells: 624_000
});
assert.equal(estimateWorldMemoryBytes(39_000), 3_627_000);
assert.equal(estimateWorldMemoryBytes(624_000), 58_032_000);
assert.equal(estimateWorldMemoryBytes(1_000_000), 93_000_000);

for (const [cols, rows] of [[0, 10], [10.5, 10], [Number.NaN, 10], [2000, 1001]]) {
    assert.throws(() => assertValidWorldDimensions(cols, rows), RangeError);
}

createWorld(20, 10);
const existing = getWorld();
assert.throws(() => createWorld(2000, 1001), RangeError);
assert.strictEqual(getWorld(), existing, 'invalid dimensions must not replace the live world');

console.log('World allocation checks passed');
