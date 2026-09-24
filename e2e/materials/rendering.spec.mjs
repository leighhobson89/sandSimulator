import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { clickCanvasCell } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page);
});

test('selected material paints its catalog ID into the mapped canvas cell', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await game.seed(3107);

    await page.getByRole('button', { name: 'Water', exact: true }).click();
    await clickCanvasCell(page, { x: 24, y: 18 });

    const state = await game.state();
    const waterId = state.definitions.find(definition => definition?.name === 'Water').id;
    expect(state.arrays.type[18 * state.cols + 24]).toBe(waterId);
});

test('canvas rendering uses the prepared material color at a painted cell', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const sand = physics.getDefinitions().findIndex(definition => definition?.name === 'Sand');
        physics.setCell(24, 18, sand);
    });
    await game.step(0);
    const state = await game.state();
    expect(state.arrays.type[18 * state.cols + 24]).toBe(
        state.definitions.find(definition => definition?.name === 'Sand').id
    );
    const pixel = await page.evaluate(() => {
        const canvas = document.querySelector('#canvas');
        return Array.from(canvas.getContext('2d').getImageData(24, 18, 1, 1).data);
    });
    const expected = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const sand = physics.getDefinitions().find(definition => definition?.name === 'Sand');
        return [...sand.rgb, 255];
    });
    expect(pixel[3]).toBe(255);
    expect(pixel.slice(0, 3).every((value, index) => Math.abs(value - expected[index]) <= 32)).toBe(true);
});

test('solid metals blend from their cold color toward glow color without a halo', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const fixture = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const names = ['Copper', 'Battery', 'Iron', 'Fan', 'Cooler', 'Tubing', 'Heater'];
        const materials = [];
        physics.clearWorld();
        const world = physics.getWorld();

        for (let materialIndex = 0; materialIndex < names.length; materialIndex++) {
            const name = names[materialIndex];
            const id = definitions.findIndex(definition => definition?.name === name);
            const definition = definitions[id];
            const start = definition?.glowStartTemp;
            const end = definition?.glowTemp;
            const base = definition?.rgb;
            const glow = definition?.glowRgb;
            const hasGlowContract = id > 0 && Number.isFinite(start) && Number.isFinite(end) &&
                start < end && end === definition.meltPoint &&
                Array.isArray(base) && base.length === 3 && Array.isArray(glow) && glow.length === 3;
            const safeStart = Number.isFinite(start) ? start : 500;
            const safeEnd = Number.isFinite(end) && end > safeStart ? end : safeStart + 1000;
            const xPositions = [20, 23, 26, 29];
            const y = 20 + materialIndex * 3;
            const sampleTemps = [Math.min(20, safeStart - 1), safeStart, (safeStart + safeEnd) / 2, safeEnd - 1];
            const positions = xPositions.map((x, sampleIndex) => ({ x, y, temperature: sampleTemps[sampleIndex] }));

            for (const { x, y: row, temperature } of positions) {
                physics.setCell(x, row, id);
                world.temp[physics.index(x, row)] = temperature;
            }
            materials.push({
                name, id, hasGlowContract,
                meltPoint: definition?.meltPoint,
                glowTemp: definition?.glowTemp,
                base: Array.isArray(base) ? base : null,
                glow: Array.isArray(glow) ? glow : null,
                positions,
                haloProbe: { x: 30, y }
            });
        }

        const moltenId = definitions.findIndex(definition => definition?.name === 'Molten Copper');
        const molten = definitions[moltenId];
        const moltenPositions = [
            { x: 40, y: 44, temperature: molten?.freezePoint },
            { x: 42, y: 44, temperature: molten?.glowTemp }
        ];
        for (const { x, y, temperature } of moltenPositions) {
            physics.setCell(x, y, moltenId);
            world.temp[physics.index(x, y)] = temperature;
        }
        return {
            materials,
            background: { x: 5, y: 5 },
            molten: {
                id: moltenId,
                gradient: molten?.gradient,
                low: { ...moltenPositions[0], expected: molten?.rgb2 },
                high: { ...moltenPositions[1], expected: molten?.rgb }
            }
        };
    });
    await game.step(0);

    const rendered = await page.evaluate(fixture => {
        const canvas = document.querySelector('#canvas');
        const context = canvas.getContext('2d');
        const physics = window.__GAME_INSTANCE__;
        const pixel = (x, y) => Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3);
        const state = physics.inspect();
        const read = ({ x, y }) => ({
            rgb: pixel(x, y),
            type: state.arrays.type[y * state.cols + x],
            temperature: state.arrays.temp[y * state.cols + x]
        });
        return {
            materials: fixture.materials.map(material => ({
                ...material,
                samples: material.positions.map(position => read(position)),
                haloPixel: pixel(material.haloProbe.x, material.haloProbe.y)
            })),
            background: pixel(fixture.background.x, fixture.background.y),
            molten: {
                ...fixture.molten,
                low: { ...fixture.molten.low, ...read(fixture.molten.low) },
                high: { ...fixture.molten.high, ...read(fixture.molten.high) }
            }
        };
    }, fixture);

    const rgbDistance = (first, second) => Math.sqrt(first.reduce((sum, value, channel) =>
        sum + (value - second[channel]) ** 2, 0));
    const expectRgbNear = (actual, expected, tolerance = 3) => {
        expect(actual.every((value, channel) => Math.abs(value - expected[channel]) <= tolerance)).toBe(true);
    };

    for (const material of rendered.materials) {
        expect(material.hasGlowContract, `${material.name} has glowStartTemp/glowTemp/glowRgb`).toBe(true);
        const [cold, start, middle, nearMelt] = material.samples;
        expect(material.glowTemp).toBe(material.meltPoint);
        expect(material.samples.every(sample => sample.type === material.id), `${material.name} remains solid`).toBe(true);
        expectRgbNear(cold.rgb, material.base);
        expectRgbNear(start.rgb, material.base);
        expect(rgbDistance(middle.rgb, material.glow)).toBeLessThan(rgbDistance(start.rgb, material.glow));
        expect(rgbDistance(nearMelt.rgb, material.glow)).toBeLessThan(rgbDistance(middle.rgb, material.glow));
        expectRgbNear(nearMelt.rgb, material.glow, 4);
        for (let channel = 0; channel < 3; channel++) {
            const direction = Math.sign(material.glow[channel] - material.base[channel]);
            if (direction > 0) {
                expect(middle.rgb[channel] + 2).toBeGreaterThanOrEqual(start.rgb[channel]);
                expect(nearMelt.rgb[channel] + 2).toBeGreaterThanOrEqual(middle.rgb[channel]);
            } else if (direction < 0) {
                expect(middle.rgb[channel] - 2).toBeLessThanOrEqual(start.rgb[channel]);
                expect(nearMelt.rgb[channel] - 2).toBeLessThanOrEqual(middle.rgb[channel]);
            }
        }
        expect(material.haloPixel).toEqual(rendered.background);
    }

    expect(rendered.molten.gradient).toBe(true);
    expect(rendered.molten.low.type).toBe(rendered.molten.id);
    expect(rendered.molten.high.type).toBe(rendered.molten.id);
    expectRgbNear(rendered.molten.low.rgb, rendered.molten.low.expected);
    expectRgbNear(rendered.molten.high.rgb, rendered.molten.high.expected);
});

test('material buttons expose their rendered colors and selected state', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    for (const name of ['Sand', 'Water', 'Glass', 'Insulation', 'Fan', 'Wind']) {
        const button = page.getByRole('button', { name, exact: true });
        await expect(button).toHaveCSS('background-color', /rgb\(/);
        await button.click();
        await expect(button).toHaveClass(/selected/);
    }
});

test('selecting a material exits eraser, grabber, and blueprint modes', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    await page.getByRole('button', { name: 'Eraser', exact: true }).click();
    await expect(page.locator('#eraserButton')).toHaveClass(/active-toggle/);
    await page.getByRole('button', { name: 'Grabber', exact: true }).click();
    await expect(page.locator('#grabberButton')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await expect(page.locator('#eraserButton')).not.toHaveClass(/active-toggle/);
    await expect(page.locator('#grabberButton')).toHaveAttribute('aria-pressed', 'false');

    await page.getByRole('tab', { name: 'Blueprints' }).click();
    await page.getByRole('button', { name: /Marquee/ }).click();
    await expect(page.getByRole('button', { name: /Marquee/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Water', exact: true }).click();
    await expect(page.getByRole('button', { name: /Marquee/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#marqueeOverlay')).toBeHidden();
    await expect(game.state()).resolves.toMatchObject({ cols: expect.any(Number) });
});
