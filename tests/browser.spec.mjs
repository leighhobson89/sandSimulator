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
    await startSandbox(page);
    await page.waitForFunction(() => document.querySelectorAll('.particle-button').length > 0);
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

async function openBrowserMixer(page, setup) {
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.evaluate(async setup => {
        const physics = await import('/physics.js');
        const defs = physics.getDefinitions();
        const id = name => defs.findIndex(def => def?.name === name);
        const world = physics.getWorld();
        physics.clearWorld();
        const mixer = 30 * world.cols + 30;
        physics.setCell(30, 30, id('Mixer'));
        setup(physics, mixer, id);
    }, setup);
    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas has no visible bounds');
    const cols = await page.evaluate(() => window.__mixerCols || 0);
    const rows = await page.evaluate(() => window.__mixerRows || 0);
    const worldSize = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        return { cols: world.cols, rows: world.rows };
    });
    await page.mouse.click(
        box.x + (30.5 / worldSize.cols) * box.width,
        box.y + (30.5 / worldSize.rows) * box.height
    );
    await expect(page.locator('#mixerDialog')).toBeVisible();
}

test('mixer browser scenarios preserve single, mixed, and non-mixed outputs', async ({ page }) => {
    await startSandbox(page);
    await page.getByRole('button', { name: 'Pause' }).click();
    const setup = async (config, waitFrames = 1) => {
        await page.evaluate(async ({ config, waitFrames }) => {
            const physics = await import('/physics.js');
            const defs = physics.getDefinitions();
            const id = name => defs.findIndex(def => def?.name === name);
            const world = physics.getWorld();
            const mixer = 30 * world.cols + 30;
            physics.clearWorld();
            physics.setCell(30, 30, id('Mixer'));
            const slot = (letter, type, count) => {
                world[`mixerInputType${letter}`][mixer] = id(type);
                world[`mixerInputCount${letter}`][mixer] = count;
            };
            if (config.a) slot('A', config.a.type, config.a.count);
            if (config.b) slot('B', config.b.type, config.b.count);
            physics.setMixerReleaseEnabled(30, 30, false);
            for (let frame = 0; frame < waitFrames; frame++) physics.stepSimulation();
        }, { config, waitFrames });
        const canvas = page.locator('#canvas');
        const box = await canvas.boundingBox();
        const size = await page.evaluate(async () => {
            const physics = await import('/physics.js');
            const world = physics.getWorld();
            return { cols: world.cols, rows: world.rows };
        });
        await page.mouse.click(box.x + 30.5 / size.cols * box.width, box.y + 30.5 / size.rows * box.height);
        await expect(page.locator('#mixerDialog')).toBeVisible();
    };

    await setup({ a: { type: 'Water', count: 20 }, release: true }, 60);
    await expect(page.locator('#mixerDialogOutputLabel')).toHaveText('output: Water');
    await expect(page.locator('#mixerDialogBinSummary2')).toContainText('Water');
    await expect(page.locator('#mixerDialogBinSummary2')).not.toContainText(' + ');
    const waterBefore = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const output = physics.getMixerInventory(30, 30).output;
        return output.counts[0] + output.counts[1];
    });
    await page.locator('#mixerDialogToggle').check();
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        for (let frame = 0; frame < 120; frame++) physics.stepSimulation();
    });
    await expect.poll(async () => page.evaluate(async () => {
        const physics = await import('/physics.js');
        const output = physics.getMixerInventory(30, 30).output;
        return output.counts[0] + output.counts[1];
    })).toBeLessThan(waterBefore);
    await page.locator('#mixerDialogCancel').click();

    await setup({ b: { type: 'Dry Mud', count: 20 }, release: true }, 60);
    await expect(page.locator('#mixerDialogOutputLabel')).toHaveText('output: Dry Mud');
    await expect(page.locator('#mixerDialogBinSummary2')).toContainText('Dry Mud');
    await page.locator('#mixerDialogCancel').click();

    await setup({ a: { type: 'Water', count: 20 }, b: { type: 'Dry Mud', count: 20 }, release: true }, 60);
    await expect(page.locator('#mixerDialogOutputLabel')).toHaveText('output: Wet Mud');
    await expect(page.locator('#mixerDialogBinSummary2')).toContainText('Wet Mud');
    await expect(page.locator('#mixerDialogBinFill2 .mixer-bin-segment')).toHaveAttribute('style', /width: 100%/);
    await page.locator('#mixerDialogCancel').click();

    await setup({ a: { type: 'Water', count: 20 }, b: { type: 'Dry Mud', count: 2 }, release: false }, 300);
    const retainedMixed = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const wetMud = physics.getDefinitions().findIndex(def => def?.name === 'Wet Mud');
        return physics.getMixerInventory(30, 30);
    });
    expect(retainedMixed.output.types[0]).toBe(await page.evaluate(async () => {
        const physics = await import('/physics.js');
        return physics.getDefinitions().findIndex(def => def?.name === 'Wet Mud');
    }));
    expect(retainedMixed.output.types[1]).toBe(0);
    expect(retainedMixed.output.mixed).toBe(true);
    await expect(page.locator('#mixerDialogOutputLabel')).toHaveText('output: Wet Mud');
    await expect(page.locator('#mixerDialogBinFill2 .mixer-bin-segment')).toHaveAttribute('style', /width: 100%/);
    await page.locator('#mixerDialogCancel').click();

    await setup({ a: { type: 'Water', count: 20 }, b: { type: 'Oil', count: 20 }, release: true }, 60);
    await expect(page.locator('#mixerDialogOutputLabel')).toHaveText('output: Water + Oil');
    await expect(page.locator('#mixerDialogBinSummary2')).toContainText(' + ');
    await page.locator('#mixerDialogCancel').click();

    await setup({ a: { type: 'Water', count: 20 }, release: false }, 60);
    await expect(page.locator('#mixerDialogOutputLabel')).toHaveText('output: Water');
    await page.locator('#mixerDialogCancel').click();
    await setup({ a: { type: 'Water', count: 20 }, b: { type: 'Ash', count: 20 }, release: false }, 60);
    await expect(page.locator('#mixerDialogOutputLabel')).toHaveText('output: Wet Ash');
});

test('vent browser connection uses the top tubing stub and releases below its icon', async ({ page }) => {
    await startSandbox(page);
    await page.getByRole('button', { name: 'Pause' }).click();
    const state = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const defs = physics.getDefinitions();
        const id = name => defs.findIndex(def => def?.name === name);
        const world = physics.getWorld();
        physics.clearWorld();
        physics.setCell(30, 30, id('Vent'));
        physics.setCell(30, 29, id('Tubing'));
        physics.setCell(30, 28, id('Tubing'));
        const vent = physics.index(30, 30);
        world.storageType[vent] = id('Water');
        world.storageCount[vent] = 3;
        physics.setVentReleaseEnabled(30, 30, true);
        for (let frame = 0; frame < 7; frame++) physics.stepSimulation();
        return {
            stub: world.type[physics.index(30, 29)],
            outlet: world.type[physics.index(30, 32)],
            tubing: id('Tubing'),
            water: id('Water'),
            remaining: world.storageCount[vent]
        };
    });
    expect(state.stub).toBe(state.tubing);
    expect(state.outlet).toBe(state.water);
    expect(state.remaining).toBeLessThan(3);
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
