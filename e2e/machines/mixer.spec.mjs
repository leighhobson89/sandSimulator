import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { clickCanvasCell } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

async function openMixer(page, game, inputs, release = false) {
    await page.evaluate(async ({ inputs, release }) => {
        const physics = await import('/physics.js');
        const defs = physics.getDefinitions();
        const id = name => defs.findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        physics.clearWorld();
        physics.setCell(30, 30, id('Mixer'));
        const mixer = physics.index(30, 30);
        for (const [letter, material, count] of inputs) {
            world[`mixerInputType${letter}`][mixer] = id(material);
            world[`mixerInputCount${letter}`][mixer] = count;
        }
        physics.setMixerReleaseEnabled(30, 30, release);
        for (let frame = 0; frame < 60; frame++) physics.stepSimulation();
    }, { inputs, release });
    await game.step(0);
    await clickCanvasCell(page, { x: 30, y: 30 });
    await expect(page.locator('#mixerDialog')).toBeVisible();
}

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page);
});

test('Mixer UI reports recipe output and preserves it when release is disabled', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await game.seed(424);

    await openMixer(page, game, [['A', 'Water', 20], ['B', 'Dry Mud', 20]]);
    await expect(page.locator('#mixerDialogOutputLabel')).toHaveText('output: Wet Mud');
    await expect(page.locator('#mixerDialogBinSummary2')).toContainText('Wet Mud');
    await expect(page.locator('#mixerDialogBinFill2 .mixer-bin-segment')).toHaveAttribute('style', /width: 100%/);

    const release = page.getByRole('switch', { name: 'Release mixed contents into the canvas' });
    await expect(release).not.toBeChecked();
    await page.locator('#mixerDialogCancel').click();
    await game.step(120);

    await clickCanvasCell(page, { x: 30, y: 30 });
    await expect(page.locator('#mixerDialogOutputLabel')).toHaveText('output: Wet Mud');
    await page.locator('#mixerDialogCancel').click();
});

test('Mixer keeps non-mixing inputs as separate output streams and supports independent purge', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await game.seed(5150);

    await openMixer(page, game, [['A', 'Sand', 12], ['B', 'Ash', 12]]);
    await expect(page.locator('#mixerDialogOutputLabel')).toHaveText('output: Sand + Ash');
    await expect(page.locator('#mixerDialogBinSummary0')).toContainText('Sand');
    await expect(page.locator('#mixerDialogBinSummary1')).toContainText('Ash');

    await page.locator('#mixerDialogBinPurge0').click();
    await expect(page.locator('#purgeDialog')).toBeVisible();
    await expect(page.locator('#purgeDialogDescription')).toContainText('Mixer input 1');
    await page.locator('#purgeDialogConfirm').click();
    await expect(page.locator('#mixerDialogBinSummary0')).toContainText('0/500 Empty');
    await expect(page.locator('#mixerDialogBinSummary1')).toContainText('Ash');
    await page.locator('#mixerDialogCancel').click();
});

test('Mixer releases retained output and alternates non-mixing materials into the canvas', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await game.seed(6161);

    await openMixer(page, game, [['A', 'Sand', 12], ['B', 'Ash', 12]]);
    await page.locator('#mixerDialogToggle').check();
    await page.locator('#mixerDialogCancel').click();
    await game.step(180);

    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const type = name => definitions.findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        return {
            sand: world.type.filter(value => value === type('Sand')).length,
            ash: world.type.filter(value => value === type('Ash')).length,
            output: physics.getMixerInventory(30, 30).output
        };
    });
    expect(result.sand).toBeGreaterThan(0);
    expect(result.ash).toBeGreaterThan(0);
    expect(result.output.counts[0] + result.output.counts[1]).toBeLessThan(24);
});

test('Mixer exposes every documented recipe in either input order', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    for (const [a, b, output] of [
        ['Sand', 'Water', 'Wet Sand'],
        ['Water', 'Dry Mud', 'Wet Mud'],
        ['Ash', 'Water', 'Wet Ash'],
        ['Water', 'Sand', 'Wet Sand']
    ]) {
        await openMixer(page, game, [['A', a, 20], ['B', b, 20]]);
        await expect(page.locator('#mixerDialogOutputLabel')).toHaveText(`output: ${output}`);
        await page.locator('#mixerDialogCancel').click();
    }
});
