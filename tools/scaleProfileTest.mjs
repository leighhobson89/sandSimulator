import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MAX_WORLD_CELLS } from '../worldConfig.js';
import { PROFILE_SIZES, summarizeSamples } from './scaleProfile.mjs';

assert.deepEqual(PROFILE_SIZES, [
    { cols: 260, rows: 150 },
    { cols: 520, rows: 300 },
    { cols: 1040, rows: 600 }
]);
assert.equal(PROFILE_SIZES[0].cols * PROFILE_SIZES[0].rows, 39_000);
assert.equal(PROFILE_SIZES[1].cols * PROFILE_SIZES[1].rows, 156_000);
assert.equal(PROFILE_SIZES[2].cols * PROFILE_SIZES[2].rows, 624_000);
assert.ok(PROFILE_SIZES.every(({ cols, rows }) => cols * rows <= MAX_WORLD_CELLS));

assert.deepEqual(summarizeSamples([4, 1, 3, 2]), {
    averageMs: 2.5,
    medianMs: 2.5,
    p95Ms: 4
});
assert.deepEqual(summarizeSamples([7]), {
    averageMs: 7,
    medianMs: 7,
    p95Ms: 7
});
assert.throws(() => summarizeSamples([]), RangeError);
assert.throws(() => summarizeSamples([1, Number.NaN]), RangeError);

const customSize = spawnSync(process.execPath, [
    fileURLToPath(new URL('./scaleProfile.mjs', import.meta.url)),
    '--sizes=1x1'
], { encoding: 'utf8' });
assert.notEqual(customSize.status, 0);
assert.match(customSize.stderr, /no CLI options/);

console.log('Scale profile checks passed');
