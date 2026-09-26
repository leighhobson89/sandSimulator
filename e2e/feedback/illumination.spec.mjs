import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { canvasPoint, machineArtworkCellPoint } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'illumination');
});

async function seedPoweredLamp(page, { lamp, target }) {
    return page.evaluate(async ({ lamp, target }) => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        physics.clearWorld();
        physics.setCell(lamp.x, lamp.y, id('Lamp'));
        const world = physics.getWorld();
        const lampIndex = physics.index(lamp.x, lamp.y);
        const rayX = target.x - lamp.x;
        const rayY = target.y - lamp.y;
        let best = null;
        for (let direction = 0; direction < 8; direction++) {
            world.data[lampIndex] = direction;
            const input = physics.getMachinePorts(lamp.x, lamp.y).find(port => port.role === 'input');
            const dx = input.connectionCell.x - lamp.x;
            const dy = input.connectionCell.y - lamp.y;
            const score = Math.abs(dx * rayY - dy * rayX) /
                (Math.hypot(dx, dy) * Math.hypot(rayX, rayY));
            if (!best || score > best.score) best = { direction, score };
        }
        world.data[lampIndex] = best.direction;
        const input = physics.getMachinePorts(lamp.x, lamp.y).find(port => port.role === 'input');
        const directionX = Math.sign(input.connectionCell.x - lamp.x) || Math.sign(input.directionX);
        const directionY = Math.sign(input.connectionCell.y - lamp.y) || Math.sign(input.directionY);
        const wireCells = [];
        for (let offset = 0; offset <= 4; offset++) {
            const cell = { x: input.connectionCell.x + directionX * offset,
                y: input.connectionCell.y + directionY * offset };
            physics.setCell(cell.x, cell.y, id('Elec'));
            wireCells.push(cell);
        }
        const battery = { x: input.connectionCell.x + directionX * 5,
            y: input.connectionCell.y + directionY * 5 };
        physics.setCell(battery.x, battery.y, id('Battery'));
        world.charge[physics.index(battery.x, battery.y)] = definitions[id('Battery')].chargeCapacity;
        physics.setMachineSetting(lamp.x, lamp.y, 1);
        physics.stepSimulation();
        return { lamp, target, battery, wireCells };
    }, { lamp, target });
}

async function hoverCell(page, cell) {
    await page.mouse.move(...Object.values(await canvasPoint(page, cell)));
}

async function sampleOverlayPixel(page, cell) {
    return page.locator('#illuminationOverlay').evaluate((canvas, point) =>
        Array.from(canvas.getContext('2d').getImageData(point.x, point.y, 1, 1).data), cell);
}

test('powered Lamp light follows a 15-cell Euclidean falloff independent of canvas zoom', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const lamp = { x: 70, y: 55 };
    const target = { x: 85, y: 55 };
    const fixture = await seedPoweredLamp(page, { lamp, target });
    const readings = await page.evaluate(async ({ lamp }) => {
        const physics = await import('/physics.js');
        return {
            status: physics.getMachineLiveStatus(lamp.x, lamp.y).active,
            center: physics.getIlluminationAt(lamp.x, lamp.y),
            distanceFive: physics.getIlluminationAt(lamp.x + 3, lamp.y + 4),
            distanceFourteen: physics.getIlluminationAt(lamp.x + 14, lamp.y),
            radius: physics.getIlluminationAt(lamp.x + 15, lamp.y),
            outside: physics.getIlluminationAt(lamp.x + 16, lamp.y)
        };
    }, { lamp });
    expect(readings.status).toBe(true);
    expect(readings.center).toBe(100);
    expect(readings.distanceFive).toBeCloseTo(100 * (1 - 5 / 15), 1);
    expect(readings.distanceFourteen).toBeCloseTo(100 * (1 - 14 / 15), 1);
    expect(readings.radius).toBeCloseTo(100 / 15, 5);
    expect(readings.outside).toBe(0);

    await page.evaluate(async () => (await import('/game.js')).setCanvasZoomLevel(2));
    const zoomed = await page.evaluate(async ({ lamp }) => {
        const physics = await import('/physics.js');
        return physics.getIlluminationAt(lamp.x + 3, lamp.y + 4);
    }, { lamp });
    expect(zoomed).toBeCloseTo(readings.distanceFive, 5);

    const offState = await page.evaluate(async ({ lamp }) => {
        const physics = await import('/physics.js');
        physics.setMachineSetting(lamp.x, lamp.y, 0);
        return {
            active: physics.getMachineLiveStatus(lamp.x, lamp.y).active,
            intensity: physics.getIlluminationAt(lamp.x + 3, lamp.y + 4)
        };
    }, { lamp });
    expect(offState.active).toBe(false);
    expect(offState.intensity).toBe(0);

    const noInput = await page.evaluate(async ({ lamp, fixture }) => {
        const physics = await import('/physics.js');
        physics.setMachineSetting(lamp.x, lamp.y, 1);
        for (const cell of fixture.wireCells) physics.setCell(cell.x, cell.y, 0);
        physics.setCell(fixture.battery.x, fixture.battery.y, 0);
        return {
            active: physics.getMachineLiveStatus(lamp.x, lamp.y).active,
            intensity: physics.getIlluminationAt(lamp.x + 3, lamp.y + 4)
        };
    }, { lamp, fixture });
    expect(noInput.active).toBe(false);
    expect(noInput.intensity).toBe(0);
});

test('Lamp falloff stays bounded and its light layer aligns with the canvas at the world edge', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const lamp = { x: 0, y: 40 };
    const target = { x: 5, y: 40 };
    const fixture = await seedPoweredLamp(page, { lamp, target });
    const edge = await page.evaluate(async ({ lamp, target, fixture }) => {
        const physics = await import('/physics.js');
        const game = await import('/game.js');
        const view = await import('/constantsAndGlobalVars.js');
        view.setVisualizationMode('normal');
        game.renderWorld();
        const world = physics.getWorld();
        const canvas = document.querySelector('#canvas');
        const light = document.querySelector('#illuminationOverlay');
        const machine = document.querySelector('#machineOverlay');
        const follows = (first, second) =>
            !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
        const measureLayer = () => {
            const canvasRect = canvas.getBoundingClientRect();
            const lightRect = light.getBoundingClientRect();
            const cellWidth = canvasRect.width / canvas.width;
            const cellHeight = canvasRect.height / canvas.height;
            const edgePixel = light.getContext('2d').getImageData(lamp.x, lamp.y, 1, 1).data;
            const radiusPixel = light.getContext('2d').getImageData(lamp.x + 15, lamp.y, 1, 1).data;
            return {
                layerOrder: follows(canvas, light) && follows(light, machine),
                canvasBounds: { left: canvasRect.left, top: canvasRect.top, right: canvasRect.right, bottom: canvasRect.bottom },
                lightBounds: { left: lightRect.left, top: lightRect.top, right: lightRect.right, bottom: lightRect.bottom },
                cellWidth,
                cellHeight,
                displayRadiusX: 15 * cellWidth,
                displayRadiusY: 15 * cellHeight,
                edgeAlpha: edgePixel[3],
                radiusAlpha: radiusPixel[3]
            };
        };
        const zoomOne = measureLayer();
        const fieldsAtZoomOne = {
            active: physics.getMachineLiveStatus(lamp.x, lamp.y).active,
            center: physics.getIlluminationAt(lamp.x, lamp.y),
            edgeFalloff: physics.getIlluminationAt(target.x, target.y),
            radius: physics.getIlluminationAt(lamp.x + 15, lamp.y),
            outside: physics.getIlluminationAt(lamp.x + 16, lamp.y),
            outsideWorld: physics.getIlluminationAt(-1, lamp.y)
        };
        game.setCanvasZoomLevel(2);
        game.renderWorld();
        const zoomTwo = measureLayer();
        const fieldsAtZoomTwo = {
            center: physics.getIlluminationAt(lamp.x, lamp.y),
            edgeFalloff: physics.getIlluminationAt(target.x, target.y),
            radius: physics.getIlluminationAt(lamp.x + 15, lamp.y),
            outside: physics.getIlluminationAt(lamp.x + 16, lamp.y)
        };
        return {
            routeInBounds: [...fixture.wireCells, fixture.battery].every(cell =>
                cell.x >= 0 && cell.y >= 0 && cell.x < world.cols && cell.y < world.rows),
            fieldsAtZoomOne,
            fieldsAtZoomTwo,
            zoomOne,
            zoomTwo
        };
    }, { lamp, target, fixture });
    expect(edge.routeInBounds).toBe(true);
    expect(edge.fieldsAtZoomOne.active).toBe(true);
    expect(edge.fieldsAtZoomOne.center).toBe(100);
    expect(edge.fieldsAtZoomOne.edgeFalloff).toBeCloseTo(100 * (1 - 5 / 15), 1);
    expect(edge.fieldsAtZoomOne.radius).toBeCloseTo(100 / 15, 5);
    expect(edge.fieldsAtZoomOne.outside).toBe(0);
    expect(edge.fieldsAtZoomOne.outsideWorld).toBe(0);
    expect(edge.fieldsAtZoomTwo).toEqual({
        center: edge.fieldsAtZoomOne.center,
        edgeFalloff: edge.fieldsAtZoomOne.edgeFalloff,
        radius: edge.fieldsAtZoomOne.radius,
        outside: edge.fieldsAtZoomOne.outside
    });
    for (const zoom of [edge.zoomOne, edge.zoomTwo]) {
        expect(zoom.layerOrder).toBe(true);
        expect(Math.abs(zoom.lightBounds.left - zoom.canvasBounds.left)).toBeLessThan(1);
        expect(Math.abs(zoom.lightBounds.top - zoom.canvasBounds.top)).toBeLessThan(1);
        expect(Math.abs(zoom.lightBounds.right - zoom.canvasBounds.right)).toBeLessThan(1);
        expect(Math.abs(zoom.lightBounds.bottom - zoom.canvasBounds.bottom)).toBeLessThan(1);
        expect(zoom.edgeAlpha).toBeGreaterThan(0);
        expect(zoom.radiusAlpha).toBe(Math.round(255 / 15));
    }
    expect(edge.zoomTwo.edgeAlpha).toBe(edge.zoomOne.edgeAlpha);
    expect(edge.zoomTwo.radiusAlpha).toBe(edge.zoomOne.radiusAlpha);
    expect(edge.zoomTwo.displayRadiusX).toBeGreaterThan(edge.zoomOne.displayRadiusX);
    expect(edge.zoomTwo.displayRadiusY).toBeGreaterThan(edge.zoomOne.displayRadiusY);
});

test('moving a Lamp or blocker invalidates the previous light field', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const lamp = { x: 70, y: 55 };
    const target = { x: 80, y: 55 };
    const fixture = await seedPoweredLamp(page, { lamp, target });
    const moved = await page.evaluate(async ({ lamp, target, fixture }) => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        const expected = 100 * (1 - (target.x - lamp.x) / 15);

        const blocker = { x: lamp.x + 5, y: lamp.y };
        const solid = definitions.find(definition => definition?.group === 'Solids' && !definition.isPlant);
        physics.setCell(blocker.x, blocker.y, solid.id);
        const blocked = physics.getIlluminationAt(target.x, target.y);
        physics.setCell(blocker.x, blocker.y, 0);
        physics.setCell(blocker.x, blocker.y + 5, solid.id);
        const afterBlockerMove = physics.getIlluminationAt(target.x, target.y);

        for (const cell of fixture.wireCells) physics.setCell(cell.x, cell.y, 0);
        physics.setCell(fixture.battery.x, fixture.battery.y, 0);
        physics.setCell(lamp.x, lamp.y, 0);
        const oldSourceAfterMove = physics.getIlluminationAt(target.x, target.y);

        const newLamp = { x: lamp.x + 25, y: lamp.y };
        const newTarget = { x: target.x + 25, y: target.y };
        physics.setCell(newLamp.x, newLamp.y, id('Lamp'));
        const newLampIndex = physics.index(newLamp.x, newLamp.y);
        let best = null;
        for (let direction = 0; direction < 8; direction++) {
            world.data[newLampIndex] = direction;
            const port = physics.getMachinePorts(newLamp.x, newLamp.y).find(candidate => candidate.role === 'input');
            const dx = port.connectionCell.x - newLamp.x;
            const dy = port.connectionCell.y - newLamp.y;
            const rayX = newTarget.x - newLamp.x;
            const rayY = newTarget.y - newLamp.y;
            const score = Math.abs(dx * rayY - dy * rayX) /
                (Math.hypot(dx, dy) * Math.hypot(rayX, rayY));
            if (!best || score > best.score) best = { direction, score };
        }
        world.data[newLampIndex] = best.direction;
        const input = physics.getMachinePorts(newLamp.x, newLamp.y).find(candidate => candidate.role === 'input');
        const dx = Math.sign(input.connectionCell.x - newLamp.x) || Math.sign(input.directionX);
        const dy = Math.sign(input.connectionCell.y - newLamp.y) || Math.sign(input.directionY);
        const newWires = [];
        for (let offset = 0; offset <= 4; offset++) {
            const cell = { x: input.connectionCell.x + dx * offset, y: input.connectionCell.y + dy * offset };
            physics.setCell(cell.x, cell.y, id('Elec'));
            newWires.push(cell);
        }
        const newBattery = { x: input.connectionCell.x + dx * 5, y: input.connectionCell.y + dy * 5 };
        physics.setCell(newBattery.x, newBattery.y, id('Battery'));
        world.charge[physics.index(newBattery.x, newBattery.y)] = definitions[id('Battery')].chargeCapacity;
        physics.setMachineSetting(newLamp.x, newLamp.y, 1);
        physics.stepSimulation();
        const oldAreaAfterMove = physics.getIlluminationAt(target.x, target.y);
        const newAreaAfterMove = physics.getIlluminationAt(newTarget.x, newTarget.y);

        physics.setCell(newLamp.x, newLamp.y, 0);
        for (const cell of newWires) physics.setCell(cell.x, cell.y, 0);
        physics.setCell(newBattery.x, newBattery.y, 0);
        const afterSourceRemoval = physics.getIlluminationAt(newTarget.x, newTarget.y);
        return { expected, blocked, afterBlockerMove, oldSourceAfterMove, oldAreaAfterMove,
            newAreaAfterMove, afterSourceRemoval };
    }, { lamp, target, fixture });

    expect(moved.blocked).toBe(0);
    expect(moved.afterBlockerMove).toBeCloseTo(moved.expected, 1);
    expect(moved.oldSourceAfterMove).toBe(0);
    expect(moved.oldAreaAfterMove).toBe(0);
    expect(moved.newAreaAfterMove).toBeCloseTo(moved.expected, 1);
    expect(moved.afterSourceRemoval).toBe(0);
});

test('overlapping Lamp fields add and clamp at 100', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        physics.clearWorld();
        const target = { x: 55, y: 75 };
        const lamps = [{ x: 50, y: 70 }, { x: 60, y: 70 }];
        const connect = lamp => {
            physics.setCell(lamp.x, lamp.y, id('Lamp'));
            const world = physics.getWorld();
            const lampIndex = physics.index(lamp.x, lamp.y);
            const rayX = target.x - lamp.x;
            const rayY = target.y - lamp.y;
            let best = null;
            for (let direction = 0; direction < 8; direction++) {
                world.data[lampIndex] = direction;
                const port = physics.getMachinePorts(lamp.x, lamp.y).find(candidate => candidate.role === 'input');
                const dx = port.connectionCell.x - lamp.x;
                const dy = port.connectionCell.y - lamp.y;
                const score = Math.abs(dx * rayY - dy * rayX) / (Math.hypot(dx, dy) * Math.hypot(rayX, rayY));
                if (!best || score > best.score) best = { direction, score };
            }
            world.data[lampIndex] = best.direction;
            const port = physics.getMachinePorts(lamp.x, lamp.y).find(candidate => candidate.role === 'input');
            const dx = Math.sign(port.connectionCell.x - lamp.x) || Math.sign(port.directionX);
            const dy = Math.sign(port.connectionCell.y - lamp.y) || Math.sign(port.directionY);
            for (let offset = 0; offset <= 4; offset++) {
                physics.setCell(port.connectionCell.x + dx * offset, port.connectionCell.y + dy * offset, id('Elec'));
            }
            const battery = { x: port.connectionCell.x + dx * 5, y: port.connectionCell.y + dy * 5 };
            physics.setCell(battery.x, battery.y, id('Battery'));
            world.charge[physics.index(battery.x, battery.y)] = definitions[id('Battery')].chargeCapacity;
            physics.setMachineSetting(lamp.x, lamp.y, 1);
        };
        lamps.forEach(connect);
        physics.stepSimulation();
        const bothNear = physics.getIlluminationAt(target.x, target.y);
        physics.setMachineSetting(lamps[1].x, lamps[1].y, 0);
        const oneNear = physics.getIlluminationAt(target.x, target.y);
        physics.setMachineSetting(lamps[1].x, lamps[1].y, 1);
        const bothFarther = physics.getIlluminationAt(target.x, target.y + 3);
        return { bothNear, oneNear, bothFarther };
    });
    const nearDistance = Math.sqrt(5 ** 2 + 5 ** 2);
    const fartherDistance = Math.sqrt(5 ** 2 + 8 ** 2);
    expect(result.oneNear).toBeCloseTo(100 * (1 - nearDistance / 15), 1);
    expect(result.bothNear).toBe(100);
    expect(result.bothFarther).toBeCloseTo(2 * 100 * (1 - fartherDistance / 15), 1);
});

test('solids, plants, and machines block Lamp light while gas, Elec, and Tubing transmit it', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const observations = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const solid = definitions.find(definition => definition?.group === 'Solids' && !definition.isPlant);
        const plant = definitions.find(definition => definition?.isPlant);
        const gas = definitions.find(definition => definition?.category === 'gas' && !definition.machine);
        const cases = [
            { key: 'solid', id: solid?.id, kind: 'block' },
            { key: 'plant', id: plant?.id, kind: 'block' },
            { key: 'machine', id: id('Fan'), kind: 'block' },
            { key: 'gas', id: gas?.id, kind: 'transmit' },
            { key: 'Elec', id: id('Elec'), kind: 'transmit' },
            { key: 'Tubing', id: id('Tubing'), kind: 'transmit' }
        ];
        const source = { x: 40, y: 70 };
        const target = { x: 52, y: 70 };
        const result = {};
        for (const fixture of cases) {
            if (!(fixture.id > 0)) throw new Error('Missing illumination fixture: ' + fixture.key);
            physics.clearWorld();
            physics.setCell(source.x, source.y, id('Lamp'));
            const world = physics.getWorld();
            const lampIndex = physics.index(source.x, source.y);
            let bestInputDirection = null;
            for (let direction = 0; direction < 8; direction++) {
                world.data[lampIndex] = direction;
                const port = physics.getMachinePorts(source.x, source.y).find(candidate => candidate.role === 'input');
                const dx = port.connectionCell.x - source.x;
                const dy = port.connectionCell.y - source.y;
                const score = Math.abs(dx * (target.y - source.y) - dy * (target.x - source.x)) /
                    (Math.hypot(dx, dy) * Math.hypot(target.x - source.x, target.y - source.y));
                if (!bestInputDirection || score > bestInputDirection.score) {
                    bestInputDirection = { direction, score };
                }
            }
            world.data[lampIndex] = bestInputDirection.direction;
            const input = physics.getMachinePorts(source.x, source.y).find(port => port.role === 'input');
            const dx = Math.sign(input.connectionCell.x - source.x) || Math.sign(input.directionX);
            const dy = Math.sign(input.connectionCell.y - source.y) || Math.sign(input.directionY);
            for (let offset = 0; offset <= 4; offset++) {
                physics.setCell(input.connectionCell.x + dx * offset, input.connectionCell.y + dy * offset, id('Elec'));
            }
            const battery = { x: input.connectionCell.x + dx * 5, y: input.connectionCell.y + dy * 5 };
            physics.setCell(battery.x, battery.y, id('Battery'));
            world.charge[physics.index(battery.x, battery.y)] = definitions[id('Battery')].chargeCapacity;
            physics.setMachineSetting(source.x, source.y, 1);
            physics.stepSimulation();

            if (fixture.kind === 'block') {
                physics.setCell(source.x + 6, source.y, fixture.id);
            } else {
                for (let x = source.x + 6; x < target.x; x++) physics.setCell(x, source.y, fixture.id);
            }
            result[fixture.key] = physics.getIlluminationAt(target.x, target.y);
        }
        return result;
    });
    for (const key of ['solid', 'plant', 'machine']) expect(observations[key], key).toBe(0);
    for (const key of ['gas', 'Elec', 'Tubing']) {
        expect(observations[key], key).toBeCloseTo(100 * (1 - 12 / 15), 1);
    }
});

test('normal view receives yellow Lamp tint while diagnostic palettes and world fields stay unchanged', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const lamp = { x: 70, y: 55 };
    const target = { x: 80, y: 55 };
    await seedPoweredLamp(page, { lamp, target });
    await page.evaluate(async ({ lamp, target }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const index = physics.index(target.x, target.y);
        world.temp[index] = 24.6;
        world.humidity[index] = 67.7;
        physics.setMachineSetting(lamp.x, lamp.y, 0);
        (await import('/game.js')).renderWorld();
    }, { lamp, target });
    const normalDark = await sampleOverlayPixel(page, target);

    await page.evaluate(async ({ lamp }) => {
        const physics = await import('/physics.js');
        const view = await import('/constantsAndGlobalVars.js');
        physics.setMachineSetting(lamp.x, lamp.y, 1);
        view.setVisualizationMode('normal');
        (await import('/game.js')).renderWorld();
    }, { lamp });
    const normalLit = await sampleOverlayPixel(page, target);
    expect(normalDark[3]).toBe(0);
    expect(normalLit.slice(0, 3)).toEqual([255, 220, 64]);
    expect(normalLit[3]).toBeGreaterThan(normalDark[3]);

    const paletteSamples = await page.evaluate(async ({ lamp, target }) => {
        const physics = await import('/physics.js');
        const view = await import('/constantsAndGlobalVars.js');
        const game = await import('/game.js');
        const overlay = document.querySelector('#illuminationOverlay');
        const pixel = () => Array.from(overlay.getContext('2d').getImageData(target.x, target.y, 1, 1).data);
        const samples = {};
        for (const mode of ['heat', 'humidity', 'wind']) {
            view.setVisualizationMode(mode);
            physics.setMachineSetting(lamp.x, lamp.y, 0);
            game.renderWorld();
            samples[mode] = { dark: pixel() };
            physics.setMachineSetting(lamp.x, lamp.y, 1);
            game.renderWorld();
            samples[mode].lit = pixel();
        }
        const world = physics.getWorld();
        const targetIndex = physics.index(target.x, target.y);
        const beforeSave = {
            temperature: world.temp[targetIndex],
            humidity: world.humidity[targetIndex],
            illumination: physics.getIlluminationAt(target.x, target.y)
        };
        const snapshot = physics.captureSimulationState();
        physics.setMachineSetting(lamp.x, lamp.y, 0);
        physics.restoreSimulationState(snapshot);
        const restoredWorld = physics.getWorld();
        const restoredIndex = physics.index(target.x, target.y);
        samples.persistence = {
            savedIlluminationPlane: Object.prototype.hasOwnProperty.call(snapshot.arrays, 'illumination'),
            beforeSave,
            afterRestore: {
                temperature: restoredWorld.temp[restoredIndex],
                humidity: restoredWorld.humidity[restoredIndex],
                illumination: physics.getIlluminationAt(target.x, target.y)
            }
        };
        view.setVisualizationMode('normal');
        game.renderWorld();
        return samples;
    }, { lamp, target });

    for (const mode of ['heat', 'humidity', 'wind']) {
        expect(paletteSamples[mode].lit, mode + ' palette ignores Lamp tint').toEqual(paletteSamples[mode].dark);
    }
    const persistence = paletteSamples.persistence;
    expect(persistence.savedIlluminationPlane).toBe(false);
    expect(persistence.afterRestore.temperature).toBe(persistence.beforeSave.temperature);
    expect(persistence.afterRestore.humidity).toBe(persistence.beforeSave.humidity);
    expect(persistence.afterRestore.illumination).toBeCloseTo(persistence.beforeSave.illumination, 5);
});

test('portable saves and stamped blueprints rebuild derived Lamp illumination', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const lamp = { x: 70, y: 55 };
    const target = { x: 80, y: 55 };
    const fixture = await seedPoweredLamp(page, { lamp, target });
    const persistence = await page.evaluate(async ({ lamp, target, fixture }) => {
        const physics = await import('/physics.js');
        const game = await import('/game.js');
        const saves = await import('/saveLoadGame.js');
        const left = Math.min(lamp.x, fixture.battery.x, ...fixture.wireCells.map(cell => cell.x));
        const right = Math.max(lamp.x, fixture.battery.x, ...fixture.wireCells.map(cell => cell.x));
        const top = Math.min(lamp.y, fixture.battery.y, ...fixture.wireCells.map(cell => cell.y));
        const bottom = Math.max(lamp.y, fixture.battery.y, ...fixture.wireCells.map(cell => cell.y));
        const blueprint = game.captureBlueprint(left, top, right, bottom);
        const portable = saves.createSaveString();
        const parsed = saves.parseSaveString(portable);
        const illumination = physics.getIlluminationAt(target.x, target.y);

        physics.clearWorld();
        saves.loadSaveString(portable);
        physics.stepSimulation();
        const afterPortableLoad = physics.getIlluminationAt(target.x, target.y);
        const loadedLampActive = physics.getMachineLiveStatus(lamp.x, lamp.y).active;

        const world = physics.getWorld();
        const nextLeft = left + 25 <= world.cols - blueprint.width ? left + 25 : Math.max(0, left - 25);
        physics.clearWorld();
        const stamped = game.stampBlueprintAt(blueprint, nextLeft, top);
        const stampedLamp = { x: nextLeft + lamp.x - left, y: lamp.y };
        const stampedTarget = { x: stampedLamp.x + target.x - lamp.x, y: target.y };
        physics.stepSimulation();
        const afterBlueprintStamp = physics.getIlluminationAt(stampedTarget.x, stampedTarget.y);
        const stampedLampActive = physics.getMachineLiveStatus(stampedLamp.x, stampedLamp.y).active;
        return {
            illumination,
            afterPortableLoad,
            loadedLampActive,
            afterBlueprintStamp,
            stampedLampActive,
            saveHasIlluminationArray: Object.hasOwn(parsed.simulation.arrays, 'illumination'),
            blueprintHasIlluminationPlane: Object.hasOwn(blueprint.cells, 'illumination'),
            stamped,
            expectedStamped: blueprint.width * blueprint.height
        };
    }, { lamp, target, fixture });

    expect(persistence.illumination).toBeCloseTo(100 / 3, 5);
    expect(persistence.saveHasIlluminationArray).toBe(false);
    expect(persistence.blueprintHasIlluminationPlane).toBe(false);
    expect(persistence.loadedLampActive).toBe(true);
    expect(persistence.afterPortableLoad).toBeCloseTo(persistence.illumination, 5);
    expect(persistence.stamped).toBe(persistence.expectedStamped);
    expect(persistence.stampedLampActive).toBe(true);
    expect(persistence.afterBlueprintStamp).toBeCloseTo(persistence.illumination, 5);
});

test('air and Lamp feedback report received light and emission state, range, and local intensity', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const lamp = { x: 55, y: 55 };
    const target = { x: 65, y: 55 };
    const fixture = await seedPoweredLamp(page, { lamp, target });
    const expected = await page.evaluate(async ({ target }) => {
        const physics = await import('/physics.js');
        return physics.getIlluminationAt(target.x, target.y);
    }, { target });
    await hoverCell(page, target);
    const feedback = page.locator('#hoverFeedback');
    await expect(feedback).toContainText(/Air temperature:/i);
    await expect(feedback).toContainText(/Humidity:/i);
    const airText = await feedback.innerText();
    const airValue = Number(airText.match(/Illumination\s*:\s*([\d.]+)/i)?.[1]);
    expect(airValue).toBeCloseTo(expected, 1);

    await page.mouse.move(...Object.values(await machineArtworkCellPoint(page, lamp)));
    await expect(feedback).toContainText('Lamp');
    await expect(feedback).toContainText(/emission/i);
    await expect(feedback).toContainText(/ON|active/i);
    await expect(feedback).toContainText(/15\s*cells/i);
    await expect(feedback).toContainText(/100(?:\.0)?/);

    await page.getByRole('button', { name: 'Lamp', exact: true }).hover();
    const tooltip = page.locator('#toolTooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(/light|illumination/i);
    await expect(tooltip).toContainText(/15\s*cells/i);

    await page.evaluate(async ({ lamp }) => {
        const physics = await import('/physics.js');
        physics.setMachineSetting(lamp.x, lamp.y, 0);
        window.__GAME_INSTANCE__.step(0);
    }, { lamp, fixture });
    await page.mouse.move(...Object.values(await machineArtworkCellPoint(page, lamp)));
    await expect(feedback).toContainText(/emission.*OFF|OFF.*emission/i);
});
