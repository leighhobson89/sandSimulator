import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'environment');
});

async function refreshReadout(page) {
    await page.evaluate(async () => {
        const { gameLoop } = await import('/game.js');
        gameLoop(performance.now() + 1000);
    });
}

async function openVisualizations(page) {
    const dialog = page.locator('#visualizationsDialog');
    await page.locator('#visualizationsOptionsButton').click();
    await expect(dialog).toBeVisible();
    return dialog;
}

async function sampleCanvas(page, { x, y, width = 1, height = 1 }) {
    return page.locator('#canvas').evaluate((canvas, rect) => {
        const image = canvas.getContext('2d').getImageData(rect.x, rect.y, rect.width, rect.height);
        return Array.from(image.data);
    }, { x, y, width, height });
}

function meanRgb(pixels) {
    const total = [0, 0, 0];
    for (let index = 0; index < pixels.length; index += 4) {
        total[0] += pixels[index];
        total[1] += pixels[index + 1];
        total[2] += pixels[index + 2];
    }
    const count = pixels.length / 4;
    return total.map(value => value / count);
}

test('visualizations precede Environment and environment controls follow the requested order', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    const visualizationsHeading = page.getByRole('heading', { name: 'Visualizations', exact: true });
    const environmentHeading = page.getByRole('heading', { name: 'Environment', exact: true });
    await expect(visualizationsHeading).toBeVisible();
    await expect(environmentHeading).toBeVisible();
    await expect(page.locator('#visualizationsNormalButton')).toHaveText('Normal');
    await expect(page.locator('#visualizationsOptionsButton')).toHaveText('Options');
    const sectionOrder = await page.locator('h3').evaluateAll(headings =>
        headings.map(heading => heading.textContent.trim()));
    expect(sectionOrder.indexOf('Visualizations')).toBeLessThan(sectionOrder.indexOf('Environment'));

    const environment = page.locator('#environmentSection');
    const controlOrder = await environment.evaluate(section => {
        const selectors = ['#airLayers', '#ambientWind', '#layerLapse', '#windStrength', '#airTemp', '#baseHumidity', '#dewpoint'];
        return selectors.map(selector => {
            const control = section.querySelector(selector);
            return control ? [...section.querySelectorAll('*')].indexOf(control) : -1;
        });
    });
    expect(controlOrder.every(index => index >= 0)).toBe(true);
    expect(controlOrder).toEqual([...controlOrder].sort((left, right) => left - right));
    await expect(environment.getByText('Layers', { exact: true })).toBeVisible();
    await expect(environment.getByText('Breeze', { exact: true })).toBeVisible();
    await expect(environment.getByRole('button', { name: /heat/i })).toHaveCount(0);

    const rowLayout = await environment.evaluate(section => {
        const box = element => {
            const rect = element.getBoundingClientRect();
            return { top: rect.top, left: rect.left, width: rect.width, right: rect.right };
        };
        return {
            layers: box(section.querySelector('#airLayers').closest('label')),
            breeze: box(section.querySelector('#ambientWind').closest('label')),
            layerStrength: box(section.querySelector('#layerLapse').closest('.tool-slider-row')),
            windStrength: box(section.querySelector('#windStrength').closest('.tool-slider-row')),
            airTemperature: box(section.querySelector('#airTemp').closest('.tool-slider-row')),
            humidity: box(section.querySelector('#baseHumidity').closest('.tool-slider-row')),
            dewpoint: box(section.querySelector('#dewpoint').closest('.tool-slider-row'))
        };
    });
    expect(Math.abs(rowLayout.layers.top - rowLayout.breeze.top)).toBeLessThan(1);
    expect(Math.abs(rowLayout.layers.width - rowLayout.breeze.width)).toBeLessThan(2);
    const orderedRows = ['layerStrength', 'windStrength', 'airTemperature', 'humidity', 'dewpoint']
        .map(name => rowLayout[name].top);
    expect(orderedRows).toEqual([...orderedRows].sort((left, right) => left - right));
    expect(rowLayout.layers.top).toBeLessThan(orderedRows[0]);

    const visualizationButtons = await Promise.all([
        page.locator('#visualizationsNormalButton').boundingBox(),
        page.locator('#visualizationsOptionsButton').boundingBox()
    ]);
    expect(visualizationButtons.every(Boolean)).toBe(true);
    expect(Math.abs(visualizationButtons[0].width - visualizationButtons[1].width)).toBeLessThan(2);
    expect(Math.abs(visualizationButtons[0].y - visualizationButtons[1].y)).toBeLessThan(1);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(environment).toBeVisible();
    const sidebarMetrics = await environment.evaluate(section => {
        const sectionRect = section.getBoundingClientRect();
        const overflows = [...section.querySelectorAll('*')]
            .map(element => ({
                selector: element.id ? `#${element.id}` : element.className?.toString().split(' ')[0],
                right: Math.round(element.getBoundingClientRect().right),
                scrollWidth: element.scrollWidth,
                clientWidth: element.clientWidth
            }))
            .filter(element => element.right > sectionRect.right + 1 || element.scrollWidth > element.clientWidth + 1)
            .slice(0, 8);
        return {
            sectionWidth: section.clientWidth,
            sectionScrollWidth: section.scrollWidth,
            right: Math.round(sectionRect.right),
            overflows
        };
    });
    expect(sidebarMetrics.sectionScrollWidth, JSON.stringify(sidebarMetrics)).toBeLessThanOrEqual(sidebarMetrics.sectionWidth + 1);
    await expect(game.state()).resolves.toMatchObject({ cols: expect.any(Number), rows: expect.any(Number) });
});

test('environment controls update values, disable dependent controls, and toggle heat view', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await page.locator('#airTemp').fill('120');
    await expect(page.locator('#airTempValue')).toHaveValue('120');
    await page.locator('label.tool-icon-toggle').filter({ hasText: 'Layers' }).click({ force: true });
    await expect(page.locator('#layerLapse')).toBeDisabled();
    await page.locator('label.tool-icon-toggle').filter({ hasText: 'Breeze' }).click({ force: true });
    await page.locator('label.tool-icon-toggle').filter({ hasText: 'Layers' }).click({ force: true });
    await page.locator('#layerLapse').fill('4.5');
    await expect(page.locator('#layerLapseValue')).toHaveText('4.5');
    const visualizations = await openVisualizations(page);
    await visualizations.locator('#visualizationHeatButton').click();
    await expect(page.locator('#visualizationHeatButton')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#closeVisualizationsDialog').click();
    await game.step(1);
    await expect(page.locator('#readout')).toBeVisible();
});

test('temperature, lapse, wind, breeze, and heat controls cover bounds and reset state', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await page.locator('#airTemp').fill('-60');
    await expect(page.locator('#airTempValue')).toHaveValue('-60');
    await page.locator('#airTemp').fill('4000');
    await expect(page.locator('#airTempValue')).toHaveValue('4000');
    await page.locator('#airTempValue').fill('5000');
    await page.locator('#airTempValue').press('Enter');
    await expect(page.locator('#airTempValue')).toHaveValue('4000');
    await page.locator('#airTempValue').fill('-100');
    await page.locator('#airTempValue').press('Enter');
    await expect(page.locator('#airTempValue')).toHaveValue('-60');

    await page.locator('#layerLapse').fill('0');
    await expect(page.locator('#layerLapseValue')).toHaveText('0.0');
    await page.locator('#layerLapse').fill('10');
    await expect(page.locator('#layerLapseValue')).toHaveText('10.0');
    await page.locator('label.tool-icon-toggle').filter({ hasText: 'Layers' }).click({ force: true });
    await expect(page.locator('#layerLapse')).toBeDisabled();
    await page.locator('label.tool-icon-toggle').filter({ hasText: 'Layers' }).click({ force: true });
    await expect(page.locator('#layerLapse')).toBeEnabled();
    await expect(page.locator('#layerLapseValue')).toHaveText('10.0');

    await page.locator('#generalWindStrength').fill('0');
    await page.locator('#windStrength').fill('1');
    await expect(page.locator('#windStrengthValue')).toHaveText('1');
    await page.locator('#windStrength').fill('8');
    await expect(page.locator('#windStrengthValue')).toHaveText('8');
    await page.locator('label.tool-icon-toggle').filter({ hasText: 'Breeze' }).click({ force: true });
    await expect(page.locator('#ambientWind')).toBeChecked();
    await page.locator('label.tool-icon-toggle').filter({ hasText: 'Breeze' }).click({ force: true });
    await expect(page.locator('#ambientWind')).not.toBeChecked();

    const visualizations = await openVisualizations(page);
    await visualizations.locator('#visualizationHeatButton').click();
    await page.keyboard.press('h');
    await expect(page.locator('#visualizationHeatButton')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('h');
    await expect(page.locator('#visualizationHeatButton')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#closeVisualizationsDialog').click();
    await expect(game.state()).resolves.toMatchObject({ cols: expect.any(Number), rows: expect.any(Number) });
});

test('General Wind and Gust Strength sliders stay ordered and support keyboard adjustment', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    const general = page.locator('#generalWindStrength');
    const gust = page.locator('#windStrength');
    await expect(general).toHaveAttribute('type', 'range');
    await expect(gust).toHaveAttribute('type', 'range');
    await expect(general).toHaveAttribute('min', '0');
    await expect(general).toHaveAttribute('max', '50');
    await expect(gust).toHaveAttribute('min', '0');
    await expect(gust).toHaveAttribute('max', '50');
    await expect(page.getByRole('slider', { name: 'General Wind' })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Gust Strength' })).toBeVisible();

    await gust.evaluate(input => { input.value = '10'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await general.evaluate(input => { input.value = '10'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await general.focus();
    await page.keyboard.press('ArrowRight');
    await expect(general).toHaveValue('11');
    await expect(gust).toHaveValue('11');

    await general.evaluate(input => { input.value = '8'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await gust.evaluate(input => { input.value = '20'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await gust.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(general).toHaveValue('8');
    await expect(gust).toHaveValue('19');
    await gust.evaluate(input => { input.value = '0'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await expect(general).toHaveValue('8');
    await expect(gust).toHaveValue('8');

    const track = page.locator('#windStrengthControls');
    const dragTo = async (from, to) => {
        const box = await track.boundingBox();
        const y = box.y + box.height / 2;
        await page.mouse.move(box.x + box.width * from / 50, y);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * to / 50, y, { steps: 5 });
        await page.mouse.up();
    };
    await dragTo(8, 16);
    await expect(general).toHaveValue('16');
    await expect(gust).toHaveValue('16');
    await dragTo(16, 11);
    await expect(general).toHaveValue('11');
    await expect(gust).toHaveValue('16');
    await dragTo(16, 4);
    await expect(general).toHaveValue('11');
    await expect(gust).toHaveValue('11');
    await expect(game.state()).resolves.toMatchObject({ cols: expect.any(Number), rows: expect.any(Number) });
});

test('Base Humidity and Dewpoint sliders expose their ranges and update the environment', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    const humidity = page.getByRole('slider', { name: /base humidity/i });
    const dewpoint = page.getByRole('slider', { name: /dewpoint/i });
    await expect(humidity).toBeVisible();
    await expect(humidity).toHaveAttribute('min', '0');
    await expect(humidity).toHaveAttribute('max', '100');
    await expect(humidity).toHaveValue('50');
    await expect(dewpoint).toBeVisible();
    await expect(dewpoint).toHaveAttribute('min', '0');
    await expect(dewpoint).toHaveAttribute('max', '100');
    await expect(dewpoint).toHaveValue('10');

    await humidity.evaluate(input => { input.value = '73'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await dewpoint.evaluate(input => { input.value = '14'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    const targets = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        return {
            humidity: physics.getAmbientHumidityTarget(),
            dewpoint: physics.getDewpointTarget()
        };
    });
    expect(targets).toEqual({ humidity: 73, dewpoint: 14 });
});

test('wind gestures, heat rendering, and readouts expose deterministic environment state', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await game.setFixture([{ x: 50, y: 50, type: 'Stone' }]);
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        physics.getWorld().temp[physics.index(50, 50)] = 500;
    });
    await game.step(0);
    const normalPixel = await page.locator('#canvas').evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(50, 50, 1, 1).data));
    const visualizations = await openVisualizations(page);
    await visualizations.locator('#visualizationHeatButton').click();
    await game.step(0);
    const heatPixel = await page.locator('#canvas').evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(50, 50, 1, 1).data));
    expect(heatPixel.slice(0, 3)).not.toEqual(normalPixel.slice(0, 3));

    await visualizations.locator('#visualizationWindButton').click();
    await expect(page.locator('#visualizationHeatButton')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#visualizationWindButton')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#closeVisualizationsDialog').click();
    await page.getByRole('button', { name: 'Wind', exact: true }).click();
    await page.locator('#windStrength').fill('8');
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        physics.getWorld().wind.fill(0);
    });
    const from = await page.locator('#canvas').evaluate(canvas => {
        const rect = canvas.getBoundingClientRect();
        return { x: rect.left + ((50.5 / canvas.width) * rect.width), y: rect.top + ((50.5 / canvas.height) * rect.height) };
    });
    const to = await page.locator('#canvas').evaluate(canvas => {
        const rect = canvas.getBoundingClientRect();
        return { x: rect.left + ((56.5 / canvas.width) * rect.width), y: rect.top + ((50.5 / canvas.height) * rect.height) };
    });
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 3 }); await page.mouse.up();
    await expect.poll(() => page.evaluate(async () => {
        const physics = await import('/physics.js');
        return Math.max(...physics.getWindTrails());
    })).toBeGreaterThan(0);

    await page.mouse.move(from.x, from.y);
    await refreshReadout(page);
    await expect(page.locator('#readout')).toContainText(/air .*°C/);
    await expect(page.locator('#readout')).toContainText('Brush Wind 3px');
    const temperature = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        return Math.round(physics.getTemperature(50, 50));
    });
    await expect(page.locator('#readout')).toContainText(`Stone ${temperature}°C`);
});

test('humidity visualization renders different local humidity values without changing the field', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await game.setFixture([]);
    const initialValues = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        world.humidity[40 * world.cols + 40] = 8;
        world.humidity[40 * world.cols + 60] = 92;
        return [world.humidity[40 * world.cols + 40], world.humidity[40 * world.cols + 60]];
    });
    await page.locator('#baseHumidity').fill('50');
    const dialog = await openVisualizations(page);
    await dialog.locator('#visualizationHumidityButton').click();
    await game.step(0);

    const dryPixel = await sampleCanvas(page, { x: 40, y: 40 });
    const humidPixel = await sampleCanvas(page, { x: 60, y: 40 });
    expect(dryPixel.slice(0, 3)).not.toEqual(humidPixel.slice(0, 3));
    expect(dryPixel[0]).toBeGreaterThan(dryPixel[2]);
    expect(humidPixel[2]).toBeGreaterThan(humidPixel[0]);
    const preservedHumidity = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        return [world.humidity[40 * world.cols + 40], world.humidity[40 * world.cols + 60]];
    });
    expect(preservedHumidity).toEqual(initialValues);
});

test('wind visualization maps airflow speed to colour and direction to directional marks', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await game.setFixture([]);
    const dialog = await openVisualizations(page);
    await dialog.locator('#visualizationWindButton').click();

    const setUniformFlow = async (x, y) => page.evaluate(async ({ x, y }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        world.airflowX.fill(x);
        world.airflowY.fill(y);
        world.wind.fill(0);
    }, { x, y });
    await setUniformFlow(1, 0);
    await game.step(0);
    const slowEast = await sampleCanvas(page, { x: 80, y: 60, width: 24, height: 24 });
    const slowEastColour = meanRgb(slowEast);

    await setUniformFlow(8, 0);
    await game.step(0);
    const fastEast = await sampleCanvas(page, { x: 80, y: 60, width: 24, height: 24 });
    const fastEastColour = meanRgb(fastEast);
    expect(slowEastColour[2]).toBeGreaterThan(slowEastColour[0]);
    expect(fastEastColour[0]).toBeGreaterThan(fastEastColour[2]);

    const eastDirection = await sampleCanvas(page, { x: 100, y: 60, width: 24, height: 24 });
    await setUniformFlow(0, 8);
    await game.step(0);
    const southDirection = await sampleCanvas(page, { x: 100, y: 60, width: 24, height: 24 });
    expect(southDirection).not.toEqual(eastDirection);

    const fieldAfterVisualization = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        return { east: world.airflowX[0], south: world.airflowY[0], trail: world.wind[0] };
    });
    expect(fieldAfterVisualization).toEqual({ east: 0, south: 8, trail: 0 });
});

test('wind visualization shows directions for localized wind trails', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await game.setFixture([]);
    const dialog = await openVisualizations(page);
    await dialog.locator('#visualizationWindButton').click();

    const renderTrailDirection = async (xDirection, yDirection) => {
        await page.evaluate(async ({ xDirection, yDirection }) => {
            const physics = await import('/physics.js');
            const world = physics.getWorld();
            world.airflowX.fill(0);
            world.airflowY.fill(0);
            world.displayWindX.fill(0);
            world.displayWindY.fill(0);
            world.wind.fill(0);
            for (let y = 54; y <= 58; y++) {
                for (let x = 54; x <= 58; x++) {
                    const i = physics.index(x, y);
                    world.displayWindX[i] = xDirection;
                    world.displayWindY[i] = yDirection;
                }
            }
        }, { xDirection, yDirection });
        await game.step(0);
        return sampleCanvas(page, { x: 51, y: 51, width: 11, height: 11 });
    };

    const eastArrows = await renderTrailDirection(2, 0);
    const southArrows = await renderTrailDirection(0, 2);
    expect(southArrows).not.toEqual(eastArrows);
});

test('switching visualization modes leaves one overlay active and Normal restores the base render', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await game.setFixture([{ x: 50, y: 50, type: 'Stone' }]);
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        world.temp[50 * world.cols + 50] = 500;
        world.humidity[50 * world.cols + 50] = 92;
    });
    await game.step(0);
    const ordinaryPixel = await sampleCanvas(page, { x: 50, y: 50 });

    const dialog = await openVisualizations(page);
    const modes = ['#visualizationHeatButton', '#visualizationHumidityButton', '#visualizationWindButton'];
    for (let index = 0; index < modes.length; index++) {
        await dialog.locator(modes[index]).click();
        for (let other = 0; other < modes.length; other++) {
            await expect(dialog.locator(modes[other])).toHaveAttribute('aria-pressed', String(other === index));
        }
    }
    await page.locator('#closeVisualizationsDialog').click();
    await page.locator('#visualizationsNormalButton').click();
    await expect(page.locator('#visualizationsDialog')).toBeHidden();
    for (const selector of modes) await expect(page.locator(selector)).toHaveAttribute('aria-pressed', 'false');
    await game.step(0);
    await expect.poll(() => sampleCanvas(page, { x: 50, y: 50 })).toEqual(ordinaryPixel);
});
