import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { canvasPoint } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'feedback');
});

async function hoverCell(page, cell) {
    await page.mouse.move(...Object.values(await canvasPoint(page, cell)));
}

async function footerMetrics(page) {
    return page.locator('#feedbackPanel').evaluate(panel => {
        const panelRect = panel.getBoundingClientRect();
        const columnRect = panel.parentElement.getBoundingClientRect();
        const canvasRect = document.querySelector('#canvasArea').getBoundingClientRect();
        const style = getComputedStyle(panel);
        const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
        return {
            height: panelRect.height,
            expectedDesktopHeight: rootFontSize * 3.4 + 10,
            columnHeight: columnRect.height,
            columnBottom: columnRect.bottom,
            canvasHeight: canvasRect.height,
            canvasBottom: canvasRect.bottom,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            scrollHeight: panel.scrollHeight,
            clientHeight: panel.clientHeight,
            scrollWidth: panel.scrollWidth,
            clientWidth: panel.clientWidth
        };
    });
}

async function refreshTopReadout(page) {
    // E2E mode disables the autonomous animation-frame loop, so drive one
    // game frame past the FPS sample boundary explicitly.
    await page.evaluate(async () => {
        const game = await import('/game.js');
        game.gameLoop(performance.now() + 1000);
    });
}

async function advanceBatteryTrendWindow(page) {
    await page.clock.runFor(5000);
    await page.evaluate(async () => {
        const game = await import('/game.js');
        game.gameLoop(performance.now());
    });
}

async function seedSimpleSwitch(page) {
    return page.evaluate(async machine => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        physics.clearWorld();
        physics.setCell(machine.x, machine.y, id('Simple Switch'));
        const ports = physics.getMachinePorts(machine.x, machine.y);
        const input = ports.find(port => port.role === 'input');
        const output = ports.find(port => port.role === 'output');
        physics.setCell(input.connectionCell.x, input.connectionCell.y, id('Elec'));
        physics.setCell(output.connectionCell.x, output.connectionCell.y, id('Elec'));
        physics.getWorld().charge[physics.index(machine.x - 4, machine.y)] = 0;
        return { machine, input, output };
    }, { x: 80, y: 45 });
}

test('feedback footer has a fixed non-scrolling height, top readout keeps FPS and count, and outside hover clears', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const panel = page.locator('#feedbackPanel');
    const feedback = page.locator('#hoverFeedback');
    await expect(panel).toBeVisible();
    await expect(feedback).toHaveAttribute('role', 'status');
    await expect(feedback).toHaveAttribute('aria-live', 'polite');
    await expect(panel.locator('#chargeIndicator')).toHaveCount(1);
    await expect(page.locator('#buttonRow #chargeIndicator')).toHaveCount(0);
    await page.mouse.move(5, 5);
    await expect(feedback).toHaveText('');
    const blankFooter = await footerMetrics(page);
    expect(blankFooter.height).toBeCloseTo(blankFooter.expectedDesktopHeight, 1);
    expect(blankFooter.columnHeight - blankFooter.canvasHeight - blankFooter.height).toBeCloseTo(0, 1);
    expect(blankFooter.columnBottom).toBeCloseTo(blankFooter.canvasBottom + blankFooter.height, 1);
    expect(`${blankFooter.overflowX} ${blankFooter.overflowY}`).not.toMatch(/auto|scroll/);
    expect(blankFooter.scrollHeight).toBeLessThanOrEqual(blankFooter.clientHeight + 2);
    expect(blankFooter.scrollWidth).toBeLessThanOrEqual(blankFooter.clientWidth + 2);

    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        physics.clearWorld();
        physics.setCell(40, 30, physics.getDefinitions().findIndex(definition => definition?.name === 'Sand'));
        window.__GAME_INSTANCE__.step(0);
    });
    await hoverCell(page, { x: 40, y: 30 });

    await refreshTopReadout(page);
    const readout = page.locator('#readout');
    await expect.poll(() => readout.innerText()).toMatch(/\d+\s*fps\s+\d+\s+particles/i);
    await expect(readout).not.toContainText('Sand');
    await expect(readout).not.toContainText(/brush/i);
    await expect(feedback).not.toContainText(/brush/i);
    await expect(feedback).toContainText('Sand');

    const richFooter = await footerMetrics(page);
    expect(richFooter.height).toBeCloseTo(blankFooter.height, 1);
    expect(richFooter.columnHeight - richFooter.canvasHeight - richFooter.height).toBeCloseTo(0, 1);
    expect(`${richFooter.overflowX} ${richFooter.overflowY}`).not.toMatch(/auto|scroll/);
    expect(richFooter.scrollHeight).toBeLessThanOrEqual(richFooter.clientHeight + 2);
    expect(richFooter.scrollWidth).toBeLessThanOrEqual(richFooter.clientWidth + 2);

    await page.mouse.move(5, 5);
    await expect(feedback).toHaveText('');

    await page.setViewportSize({ width: 720, height: 760 });
    await game.step(0);
    const narrowBlank = await footerMetrics(page);
    expect(narrowBlank.height).toBeGreaterThan(0);
    expect(`${narrowBlank.overflowX} ${narrowBlank.overflowY}`).not.toMatch(/auto|scroll/);
    await hoverCell(page, { x: 40, y: 30 });
    const narrowRich = await footerMetrics(page);
    expect(narrowRich.height).toBeCloseTo(narrowBlank.height, 1);
    expect(`${narrowRich.overflowX} ${narrowRich.overflowY}`).not.toMatch(/auto|scroll/);
    expect(narrowRich.scrollHeight).toBeLessThanOrEqual(narrowRich.clientHeight + 2);
    expect(narrowRich.scrollWidth).toBeLessThanOrEqual(narrowRich.clientWidth + 2);
});

test('empty-air feedback reports local temperature, humidity, and wind speed', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const air = await page.evaluate(async cell => {
        const physics = await import('/physics.js');
        physics.clearWorld();
        const world = physics.getWorld();
        const i = physics.index(cell.x, cell.y);
        world.temp[i] = 18.6;
        world.humidity[i] = 46.2;
        world.generalWindX[i] = 3;
        world.generalWindY[i] = 4;
        return {
            cell,
            temperature: Math.round(world.temp[i] * 10) / 10,
            humidity: Math.round(world.humidity[i]),
            windSpeed: 5
        };
    }, { x: 40, y: 30 });

    await hoverCell(page, air.cell);
    const feedback = page.locator('#hoverFeedback');
    await expect(feedback).toContainText(`Air temperature: ${air.temperature}°C`);
    await expect(feedback).toContainText(`Humidity: ${air.humidity}%`);
    await expect(feedback).toContainText(`Wind speed: ${air.windSpeed}`);
});

test('particle feedback reports its catalog section, temperature, humidity, and source-defined transition', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const source = await page.evaluate(async cell => {
        const physics = await import('/physics.js');
        physics.clearWorld();
        const definitions = physics.getDefinitions();
        const water = definitions.find(definition => definition?.name === 'Water');
        physics.setCell(cell.x, cell.y, water.id);
        const world = physics.getWorld();
        const i = physics.index(cell.x, cell.y);
        world.temp[i] = 126;
        world.humidity[i] = 43.4;
        window.__GAME_INSTANCE__.step(0);
        return {
            cell,
            section: water.group,
            temperature: Math.round(world.temp[i]),
            humidity: Math.round(world.humidity[i]),
            threshold: water.boilPoint,
            target: definitions[water.boilsInto].name
        };
    }, { x: 40, y: 30 });

    await hoverCell(page, source.cell);
    const feedback = page.locator('#hoverFeedback');
    await expect(feedback).toContainText('Water');
    await expect(feedback).toContainText(source.section);
    await expect(feedback).toContainText(`${source.temperature}°C`);
    await expect(feedback).toContainText(`${source.humidity}%`);
    await expect(feedback).toContainText(new RegExp(`>\\s*${source.threshold}\\s*°C.*Water.*->.*${source.target}`, 'i'));
});

test('material feedback reports illumination received from a powered Lamp', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const fixture = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        physics.clearWorld();
        const lamp = { x: 40, y: 30 };
        const target = { x: 40, y: 40 };
        physics.setCell(lamp.x, lamp.y, id('Lamp'));
        const world = physics.getWorld();
        const lampIndex = physics.index(lamp.x, lamp.y);
        const ray = { x: target.x - lamp.x, y: target.y - lamp.y };
        let best = null;
        for (let direction = 0; direction < 8; direction++) {
            world.data[lampIndex] = direction;
            const input = physics.getMachinePorts(lamp.x, lamp.y).find(port => port.role === 'input');
            const dx = input.connectionCell.x - lamp.x;
            const dy = input.connectionCell.y - lamp.y;
            const score = Math.abs(dx * ray.y - dy * ray.x) /
                (Math.hypot(dx, dy) * Math.hypot(ray.x, ray.y));
            if (!best || score > best.score) best = { direction, input, score };
        }
        world.data[lampIndex] = best.direction;
        const input = physics.getMachinePorts(lamp.x, lamp.y).find(port => port.role === 'input');
        const directionX = Math.sign(input.connectionCell.x - lamp.x) || Math.sign(input.directionX);
        const directionY = Math.sign(input.connectionCell.y - lamp.y) || Math.sign(input.directionY);
        for (let offset = 0; offset <= 4; offset++) {
            physics.setCell(input.connectionCell.x + directionX * offset,
                input.connectionCell.y + directionY * offset, id('Elec'));
        }
        const battery = {
            x: input.connectionCell.x + directionX * 5,
            y: input.connectionCell.y + directionY * 5
        };
        physics.setCell(battery.x, battery.y, id('Battery'));
        world.charge[physics.index(battery.x, battery.y)] = definitions[id('Battery')].chargeCapacity;
        physics.setMachineSetting(lamp.x, lamp.y, 1);
        physics.stepSimulation();

        const gas = definitions.find(definition => definition?.category === 'gas' && !definition.machine);
        physics.setCell(target.x, target.y, gas.id);
        const targetIndex = physics.index(target.x, target.y);
        world.temp[targetIndex] = 21.5;
        world.humidity[targetIndex] = 63;
        window.__GAME_INSTANCE__.step(0);
        return {
            target,
            name: gas.name,
            illumination: physics.getIlluminationAt(target.x, target.y),
            temperature: 21.5,
            humidity: 63
        };
    });
    expect(fixture.illumination).toBeGreaterThan(0);
    await hoverCell(page, fixture.target);
    const feedback = page.locator('#hoverFeedback');
    await expect(feedback).toContainText(fixture.name);
    await expect(feedback).toContainText(`${fixture.temperature}°C`);
    await expect(feedback).toContainText(`${fixture.humidity}%`);
    const displayed = Number((await feedback.innerText()).match(/Illumination\s*:\s*([\d.]+)/i)?.[1]);
    expect(displayed).toBeCloseTo(fixture.illumination, 1);
});

test('machine feedback shows temperature and live input/output signal changes', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const fixture = await seedSimpleSwitch(page);
    await game.step(1);
    const feedback = page.locator('#hoverFeedback');
    await page.mouse.move(...Object.values(await (await import('../helpers/canvas.mjs'))
        .machineArtworkCellPoint(page, fixture.machine)));
    await expect(feedback).toContainText('Simple Switch');
    await expect(feedback).toContainText(/temperature/i);
    await expect(feedback).toContainText(/input.*inactive/i);
    await expect(feedback).toContainText(/output.*inactive/i);

    await page.evaluate(async ({ machine, input }) => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const battery = definitions.find(definition => definition?.name === 'Battery');
        const batteryX = input.connectionCell.x - 1;
        const batteryY = input.connectionCell.y;
        physics.setCell(batteryX, batteryY, battery.id);
        physics.getWorld().charge[physics.index(batteryX, batteryY)] = battery.chargeCapacity;
        physics.setMachineSetting(machine.x, machine.y, 1);
        physics.stepSimulation();
    }, fixture);
    await page.mouse.move(...Object.values(await (await import('../helpers/canvas.mjs'))
        .machineArtworkCellPoint(page, fixture.machine)));
    await expect(feedback).toContainText(/input.*active/i);
    await expect(feedback).toContainText(/output.*active/i);
});

test('Battery hover moves the charge icon into feedback and shows circuit load, discharge state, and time estimate', async ({ page }) => {
    const game = new GamePage(page);
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await game.openMenu();
    await game.newGame();

    const batteryCell = { x: 30, y: 35 };
    await page.evaluate(async batteryCell => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        physics.clearWorld();
        physics.setCell(batteryCell.x, batteryCell.y, id('Battery'));
        const lamp = { x: batteryCell.x + 40, y: batteryCell.y };
        physics.setCell(lamp.x, lamp.y, id('Lamp'));
        const input = physics.getMachinePorts(lamp.x, lamp.y).find(port => port.role === 'input');
        for (let x = batteryCell.x + 1; x <= input.connectionCell.x; x++) {
            physics.setCell(x, batteryCell.y, id('Elec'));
        }
        const battery = definitions[id('Battery')];
        const world = physics.getWorld();
        world.charge[physics.index(batteryCell.x, batteryCell.y)] = battery.chargeCapacity / 2;
        physics.setMachineSetting(lamp.x, lamp.y, 1);
        return null;
    }, batteryCell);
    await page.mouse.move(5, 5);
    await expect(page.locator('#hoverFeedback')).toHaveText('');
    const blankFooter = await footerMetrics(page);
    await hoverCell(page, batteryCell);
    await game.step(300);
    await advanceBatteryTrendWindow(page);

    const panel = page.locator('#feedbackPanel');
    const indicator = panel.locator('#chargeIndicator');
    await expect(indicator).toBeVisible();
    await expect(page.locator('#buttonRow #chargeIndicator')).toHaveCount(0);
    await expect(page.locator('#hoverFeedback')).toContainText(/circuit load/i);
    await expect(page.locator('#hoverFeedback')).toContainText(/discharging/i);
    await expect(page.locator('#hoverFeedback')).toContainText(/(eta|to empty|remaining)/i);
    const discharge = page.getByText(/discharging/i).last();
    const colour = await discharge.evaluate(element => getComputedStyle(element).color);
    expect(isRed(colour)).toBe(true);
    const richFooter = await footerMetrics(page);
    expect(richFooter.height).toBeCloseTo(blankFooter.height, 1);
    expect(`${richFooter.overflowX} ${richFooter.overflowY}`).not.toMatch(/auto|scroll/);
    expect(richFooter.scrollHeight).toBeLessThanOrEqual(richFooter.clientHeight + 2);
    expect(richFooter.scrollWidth).toBeLessThanOrEqual(richFooter.clientWidth + 2);

    await page.mouse.move(5, 5);
    await expect(page.locator('#hoverFeedback')).toHaveText('');
    await page.evaluate(async batteryCell => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const battery = definitions.find(definition => definition?.name === 'Battery');
        physics.clearWorld();
        physics.setRandomSeed(202);
        physics.setCell(batteryCell.x, batteryCell.y, battery.id);
        const world = physics.getWorld();
        world.charge[physics.index(batteryCell.x, batteryCell.y)] =
            battery.chargeCapacity - battery.chargePerSpark / 2;
    }, batteryCell);
    await hoverCell(page, batteryCell);
    await page.evaluate(async batteryCell => {
        const physics = await import('/physics.js');
        const spark = physics.getDefinitions().findIndex(definition => definition?.name === 'Spark');
        physics.setCell(batteryCell.x, batteryCell.y - 1, spark);
    }, batteryCell);
    await game.step(1);
    await advanceBatteryTrendWindow(page);
    await expect(page.locator('#hoverFeedback')).toContainText(/charging/i);
    await expect(page.locator('#hoverFeedback')).toContainText(/(eta|to full|full in)/i);
    const charging = page.getByText(/charging/i).last();
    const chargingColour = await charging.evaluate(element => getComputedStyle(element).color);
    expect(isGreen(chargingColour)).toBe(true);
});

function isRed(colour) {
    const [red, green, blue] = colour.match(/[\d.]+/g)?.map(Number) || [];
    return red > green * 1.4 && red > blue * 1.2;
}

function isGreen(colour) {
    const [red, green, blue] = colour.match(/[\d.]+/g)?.map(Number) || [];
    return green > red * 1.2 && green > blue * 1.05;
}
