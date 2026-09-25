import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { canvasPoint, clickCanvasCell } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

async function connectTubingRoute(page, source, destination, width = 1) {
    return page.evaluate(async ({ source, destination, width }) => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const tubingId = definitions.findIndex(definition => definition?.name === 'Tubing');
        const sourcePort = physics.getMachinePorts(source.x, source.y).find(port => port.role === 'output');
        const destinationPort = physics.getMachinePorts(destination.x, destination.y).find(port => port.role === 'input');
        if (!sourcePort || !destinationPort) throw new Error('Machine route requires one output and one input port');
        const from = sourcePort.connectionCell;
        const to = destinationPort.connectionCell;
        const waypointX = Math.max(from.x, to.x) + 4;
        const path = [{ ...from }];
        const appendSegment = (targetX, targetY) => {
            let current = path[path.length - 1];
            while (current.x !== targetX || current.y !== targetY) {
                current = {
                    x: current.x + Math.sign(targetX - current.x),
                    y: current.y + Math.sign(targetY - current.y)
                };
                path.push(current);
            }
        };
        appendSegment(waypointX, from.y);
        appendSegment(waypointX, to.y);
        appendSegment(to.x, to.y);

        const machineCenters = new Set([`${source.x},${source.y}`, `${destination.x},${destination.y}`]);
        const selectedAnchors = new Set([`${from.x},${from.y}`, `${to.x},${to.y}`]);
        const otherPortAnchors = new Set([
            ...physics.getMachinePorts(source.x, source.y),
            ...physics.getMachinePorts(destination.x, destination.y)
        ].filter(port => !selectedAnchors.has(`${port.connectionCell.x},${port.connectionCell.y}`))
            .map(port => `${port.connectionCell.x},${port.connectionCell.y}`));
        const radiusStart = width >= 3 ? -1 : 0;
        const radiusEnd = width >= 3 ? 1 : width - 1;
        for (const cell of path) {
            for (let dy = radiusStart; dy <= radiusEnd; dy++) {
                for (let dx = radiusStart; dx <= radiusEnd; dx++) {
                    const x = cell.x + dx;
                    const y = cell.y + dy;
                    const key = `${x},${y}`;
                    if (machineCenters.has(key) || otherPortAnchors.has(key)) continue;
                    physics.setCell(x, y, tubingId);
                }
            }
        }
        return { from, to, path };
    }, { source, destination, width });
}

async function prepareSprinkler(page, game) {
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const defs = physics.getDefinitions();
        const id = name => defs.findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        physics.clearWorld();
        physics.setCell(30, 30, id('Sprinkler'));
        physics.setCell(30, 29, id('Tubing'));
        physics.setCell(30, 28, id('Tubing'));
        const sprinkler = physics.index(30, 30);
        world.storageType[sprinkler] = id('Water');
        world.storageCount[sprinkler] = 20;
        physics.setSprinklerReleaseRate(30, 30, 60);
    });
    await game.step(0);
    await clickCanvasCell(page, { x: 30, y: 30 });
    await expect(page.locator('#machineDialog')).toBeVisible();
}

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page);
});

test('Sprinkler controls toggle retained inventory and release it below the outlet', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await game.seed(991);
    await prepareSprinkler(page, game);

    const toggle = page.getByRole('switch', { name: 'Release Sprinkler contents into the canvas' });
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await page.locator('#machineDialogCancel').click();
    await game.step(20);
    let state = await game.state();
    const waterId = state.definitions.find(definition => definition?.name === 'Water').id;
    const sprinklerIndex = 30 + 30 * state.cols;
    expect(state.arrays.type[32 * state.cols + 30]).not.toBe(waterId);

    await clickCanvasCell(page, { x: 30, y: 30 });
    await toggle.check();
    await page.locator('#machineDialogCancel').click();
    await game.step(40);
    state = await game.state();
    expect(state.arrays.type).toContain(waterId);
    expect(state.arrays.type[sprinklerIndex]).toBe(state.definitions.find(definition => definition?.name === 'Sprinkler').id);
});

test('Drain Mode defaults on; off selects Sprinkler output and on drains downward', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await game.seed(992);
    await prepareSprinkler(page, game);

    const release = page.getByRole('switch', { name: 'Release Sprinkler contents into the canvas' });
    const drainMode = page.getByRole('switch', { name: 'Drain Mode' });
    await expect(release).toBeChecked();
    await expect(drainMode).toBeChecked();
    await expect(page.locator('#machineDialogInput')).toBeDisabled();
    await drainMode.uncheck();
    await expect(release).toBeChecked();
    await expect(drainMode).not.toBeChecked();
    await page.locator('#machineDialogCancel').click();
    await game.step(10);
    let state = await game.state();
    const waterId = state.definitions.find(definition => definition?.name === 'Water').id;
    const sprayCount = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const waterId = physics.getDefinitions().find(definition => definition?.name === 'Water').id;
        const world = physics.getWorld();
        return [3, 4, 5, 7, 8, 9].reduce((sum, clock) =>
            sum + [...world.sprinklerLaunchDirection].filter((direction, i) =>
                direction === clock && world.type[i] === waterId).length, 0);
    });
    expect(sprayCount).toBeGreaterThan(0);

    await clickCanvasCell(page, { x: 30, y: 30 });
    await expect(drainMode).not.toBeChecked();
    await expect(release).toBeChecked();
    await drainMode.check();
    await expect(release).toBeChecked();
    await page.locator('#machineDialogCancel').click();
    await game.step(1);
    state = await game.state();
    expect(state.arrays.type[32 * state.cols + 30]).toBe(waterId);
});

test('Tubing transfers stored material at the narrowest cross-section rate', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await game.seed(234);

    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const defs = physics.getDefinitions();
        const id = name => defs.findIndex(definition => definition?.name === name);
        physics.clearWorld();
        physics.setCell(10, 20, id('Powder Storage Bin'));
        physics.setCell(30, 26, id('Sprinkler'));
        physics.setSprinklerReleaseEnabled(30, 26, false);
    });
    const route = await connectTubingRoute(page, { x: 10, y: 20 }, { x: 30, y: 26 });
    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const id = name => physics.getDefinitions().findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        const source = physics.index(10, 20);
        world.storageType[source] = id('Ash');
        world.storageCount[source] = 60;
        for (let frame = 0; frame < 60; frame++) physics.stepSimulation();
        return {
            source: physics.getStorageInventory(10, 20),
            sprinkler: physics.getSprinklerInventory(30, 26),
            flow: physics.getTubingFlows()[0]
        };
    });
    expect(result.source.count).toBe(50);
    expect(result.sprinkler.count).toBe(10);
    expect(result.flow.rate).toBe(10);
    expect(result.flow.path.every(cell => Number.isInteger(cell))).toBe(true);
    await game.step(0);
    const hoverCell = route.path[Math.floor(route.path.length / 2)];
    await page.mouse.move(...Object.values(await canvasPoint(page, hoverCell)));
    await expect(page.locator('#toolTooltip')).toContainText('Flow');
    await expect(page.locator('#machineOverlay .tubing-flow-route')).toHaveCount(1);
});

test('unconnected and full disabled Sprinklers stop tubing flow and expose the state in the dialog', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const defs = physics.getDefinitions();
        const id = name => defs.findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        physics.clearWorld();
        physics.setCell(30, 20, id('Sprinkler'));
        const sprinkler = physics.index(30, 20);
        world.storageType[sprinkler] = id('Water');
        world.storageCount[sprinkler] = 100;
        physics.setSprinklerReleaseEnabled(30, 20, false);
    });
    await game.step(0);
    await clickCanvasCell(page, { x: 30, y: 20 });
    await expect(page.locator('#machineDialogInput')).toBeDisabled();
    await expect(page.locator('#machineDialogInput')).toHaveAttribute('placeholder', 'Not Connected');
    await expect(page.locator('#machineDialogStorageSummary')).toContainText('100/100 Water');
    await page.locator('#machineDialogCancel').click();

    const flowCount = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        return physics.getTubingFlows().length;
    });
    expect(flowCount).toBe(0);
    await game.step(0);
});

test('Tubing topology requires shared edges and exactly two attached machines', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const runTopology = async kind => {
        await page.evaluate(async kind => {
            const physics = await import('/physics.js');
            const id = name => physics.getDefinitions().findIndex(definition => definition?.name === name);
            const world = physics.getWorld();
            physics.clearWorld();
            physics.setCell(10, 20, id('Powder Storage Bin'));
            physics.setCell(30, 26, id('Sprinkler'));
            physics.setSprinklerReleaseEnabled(30, 26, false);
            const source = physics.index(10, 20);
            world.storageType[source] = id('Ash');
            world.storageCount[source] = 30;
            if (kind === 'three') {
                physics.setCell(20, 26, id('Powder Storage Bin'));
                world.storageType[physics.index(20, 26)] = id('Ash');
                world.storageCount[physics.index(20, 26)] = 30;
            }
        }, kind);
        if (kind === 'diagonal') {
            await page.evaluate(async () => {
                const physics = await import('/physics.js');
                const tubing = physics.getDefinitions().findIndex(definition => definition?.name === 'Tubing');
                const from = physics.getMachinePorts(10, 20).find(port => port.role === 'output').connectionCell;
                const to = physics.getMachinePorts(30, 26).find(port => port.role === 'input').connectionCell;
                const horizontalSteps = to.x - from.x;
                const upwardSteps = Math.round((horizontalSteps + from.y - to.y) / 2);
                let y = from.y;
                physics.setCell(from.x, y, tubing);
                for (let offset = 1; offset <= horizontalSteps; offset++) {
                    y += offset <= upwardSteps ? -1 : 1;
                    physics.setCell(from.x + offset, y, tubing);
                }
            });
        } else {
            await connectTubingRoute(page, { x: 10, y: 20 }, { x: 30, y: 26 });
        }
        return page.evaluate(async () => {
            const physics = await import('/physics.js');
            for (let frame = 0; frame < 60; frame++) physics.stepSimulation();
            return { flowCount: physics.getTubingFlows().length, source: physics.getStorageInventory(10, 20).count };
        });
    };
    const results = {
        edge: await runTopology('edge'),
        diagonal: await runTopology('diagonal'),
        threeMachines: await runTopology('three')
    };
    expect(results.edge.flowCount).toBeGreaterThan(0);
    expect(results.edge.source).toBeLessThan(30);
    expect(results.diagonal.flowCount).toBe(0);
    expect(results.diagonal.source).toBe(30);
    expect(results.threeMachines.flowCount).toBe(0);
    expect(results.threeMachines.source).toBe(30);
    await game.step(0);
});

test('Tubing bottlenecks report 20/s and 30/s for wider painted sections', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const rates = {};
    for (const width of [2, 3]) {
        await page.evaluate(async () => {
            const physics = await import('/physics.js');
            const id = name => physics.getDefinitions().findIndex(definition => definition?.name === name);
            physics.clearWorld();
            physics.setCell(10, 20, id('Powder Storage Bin'));
            physics.setCell(30, 26, id('Sprinkler'));
            physics.setSprinklerReleaseEnabled(30, 26, false);
        });
        await connectTubingRoute(page, { x: 10, y: 20 }, { x: 30, y: 26 }, width);
        rates[width === 2 ? 'two' : 'three'] = await page.evaluate(async () => {
            const physics = await import('/physics.js');
            const id = name => physics.getDefinitions().findIndex(definition => definition?.name === name);
            const source = physics.index(10, 20);
            physics.getWorld().storageType[source] = id('Ash');
            physics.getWorld().storageCount[source] = 120;
            for (let frame = 0; frame < 60; frame++) physics.stepSimulation();
            return physics.getTubingFlows()[0]?.rate || 0;
        });
    }
    expect(rates.two).toBe(20);
    expect(rates.three).toBe(30);
    await game.step(0);
});

test('connected Sprinkler rate input is capped by tubing capacity', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const id = name => physics.getDefinitions().findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        physics.clearWorld();
        physics.setCell(10, 20, id('Powder Storage Bin'));
        physics.setCell(30, 26, id('Sprinkler'));
    });
    await connectTubingRoute(page, { x: 10, y: 20 }, { x: 30, y: 26 });
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const id = name => physics.getDefinitions().findIndex(definition => definition?.name === name);
        const source = physics.index(10, 20);
        physics.getWorld().storageType[source] = id('Ash');
        physics.getWorld().storageCount[source] = 20;
    });
    await game.step(0);
    await clickCanvasCell(page, { x: 30, y: 26 });
    const input = page.locator('#machineDialogInput');
    await expect(input).toBeEnabled();
    await expect(input).toHaveAttribute('max', '10');
    await input.fill('50');
    await expect(input).toHaveValue('10');
    await page.locator('#machineDialogCancel').click();
    await clickCanvasCell(page, { x: 30, y: 26 });
    await expect(input).toHaveValue('10');
    await page.locator('#machineDialogCancel').click();
    await game.step(0);
});

test('Tubing transfers stored material between compatible storage bins', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const id = name => physics.getDefinitions().findIndex(definition => definition?.name === name);
        physics.clearWorld();
        physics.setCell(10, 20, id('Powder Storage Bin'));
        physics.setCell(30, 26, id('Powder Storage Bin'));
    });
    await connectTubingRoute(page, { x: 10, y: 20 }, { x: 30, y: 26 });
    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const id = name => physics.getDefinitions().findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        const source = physics.index(10, 20);
        world.storageType[source] = id('Sand');
        world.storageCount[source] = 30;
        for (let frame = 0; frame < 60; frame++) physics.stepSimulation();
        return {
            source: physics.getStorageInventory(10, 20),
            destination: physics.getStorageInventory(30, 26)
        };
    });
    expect(result.source.count).toBeLessThan(30);
    expect(result.destination.type).toBeGreaterThan(0);
    expect(result.destination.count).toBeGreaterThan(0);
    await game.step(0);
});
