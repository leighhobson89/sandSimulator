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
        physics.setAmbientIlluminationTarget(0);
        physics.setCell(lamp.x, lamp.y, id('Lamp'));
        const world = physics.getWorld();
        const lampIndex = physics.index(lamp.x, lamp.y);
        const rayX = target.x - lamp.x;
        const rayY = target.y - lamp.y;
        let best = null;
        const inBounds = (x, y) => x >= 0 && y >= 0 && x < world.cols && y < world.rows;
        for (let direction = 0; direction < 8; direction++) {
            world.data[lampIndex] = direction;
            const input = physics.getMachinePorts(lamp.x, lamp.y).find(port => port.role === 'input');
            const dx = input.connectionCell.x - lamp.x;
            const dy = input.connectionCell.y - lamp.y;
            const routeX = Math.sign(dx) || Math.sign(input.directionX);
            const routeY = Math.sign(dy) || Math.sign(input.directionY);
            const routeIsInBounds = Array.from({ length: 6 }, (_, offset) =>
                inBounds(input.connectionCell.x + routeX * offset, input.connectionCell.y + routeY * offset))
                .every(Boolean);
            if (!routeIsInBounds) continue;
            const score = Math.abs(dx * rayY - dy * rayX) /
                (Math.hypot(dx, dy) * Math.hypot(rayX, rayY));
            if (!best || score > best.score) best = { direction, score };
        }
        if (!best) throw new Error('No in-bounds Battery route is available for the Lamp fixture.');
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

test('powered Lamp light follows a 25-cell Euclidean falloff independent of canvas zoom', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const lamp = { x: 70, y: 55 };
    const target = { x: 85, y: 55 };
    const fixture = await seedPoweredLamp(page, { lamp, target });
    const readings = await page.evaluate(async ({ lamp }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const sample = physics.index(lamp.x + 3, lamp.y + 4);
        return {
            status: physics.getMachineLiveStatus(lamp.x, lamp.y).active,
            center: physics.getIlluminationAt(lamp.x, lamp.y),
            worldGridAligned: world.illumination.length === world.type.length &&
                world.illumination[sample] === physics.getIlluminationAt(lamp.x + 3, lamp.y + 4),
            distanceFive: physics.getIlluminationAt(lamp.x + 3, lamp.y + 4),
            distanceFiveCardinal: physics.getIlluminationAt(lamp.x + 5, lamp.y),
            distanceTwentyFour: physics.getIlluminationAt(lamp.x + 24, lamp.y),
            radius: physics.getIlluminationAt(lamp.x + 25, lamp.y),
            radiusDiagonal: physics.getIlluminationAt(lamp.x + 15, lamp.y + 20),
            outside: physics.getIlluminationAt(lamp.x + 26, lamp.y)
        };
    }, { lamp });
    expect(readings.status).toBe(true);
    expect(readings.worldGridAligned).toBe(true);
    expect(readings.center).toBe(100);
    expect(readings.distanceFive).toBeCloseTo(100 * (26 - 5) / 25, 1);
    expect(readings.distanceFiveCardinal).toBeCloseTo(readings.distanceFive, 5);
    expect(readings.distanceTwentyFour).toBeCloseTo(100 * (26 - 24) / 25, 1);
    expect(readings.radius).toBeCloseTo(100 / 25, 5);
    expect(readings.radiusDiagonal).toBeCloseTo(readings.radius, 5);
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

test('Fire, Lava, and Scoria emit at their configured strengths over five cells', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const readings = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const source = { x: 90, y: 60 };
        const result = {};
        for (const name of ['Fire', 'Lava', 'Scoria']) {
            physics.clearWorld();
            physics.setAmbientIlluminationTarget(0);
            physics.setCell(source.x, source.y, id(name));
            result[name] = {
                atSource: physics.getIlluminationAt(source.x, source.y),
                atRadius: physics.getIlluminationAt(source.x + 5, source.y),
                outsideRadius: physics.getIlluminationAt(source.x + 6, source.y)
            };
        }
        return result;
    });
    for (const [name, intensity] of [['Fire', 50], ['Lava', 50], ['Scoria', 30]]) {
        expect(readings[name].atSource, `${name} has its configured peak illumination`).toBe(intensity);
        expect(readings[name].atRadius, `${name} reaches distance five`).toBeGreaterThan(0);
        expect(readings[name].atRadius).toBeLessThan(intensity);
        expect(readings[name].outsideRadius, `${name} is dark at distance six`).toBe(0);
    }
});

test('Fire, Lava, and Scoria light renders orange', async ({ page }) => {
    const gamePage = new GamePage(page);
    await gamePage.openMenu();
    await gamePage.newGame();

    const colors = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const game = await import('/game.js');
        const view = await import('/constantsAndGlobalVars.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const source = { x: 90, y: 60 };
        const result = {};
        view.setVisualizationMode('normal');
        for (const name of ['Fire', 'Lava', 'Scoria']) {
            physics.clearWorld();
            physics.setAmbientIlluminationTarget(0);
            physics.setCell(source.x, source.y, id(name));
            game.renderWorld();
            result[name] = Array.from(document.querySelector('#illuminationOverlay')
                .getContext('2d').getImageData(source.x + 1, source.y, 1, 1).data);
        }
        return result;
    });
    for (const name of ['Fire', 'Lava', 'Scoria']) {
        // Canvas unpremultiplication rounds low-alpha pixels, especially dim Scoria.
        expect(colors[name][0], `${name} glow is orange`).toBe(255);
        expect(colors[name][1], `${name} glow is orange`).toBeGreaterThanOrEqual(120);
        expect(colors[name][1], `${name} glow is orange`).toBeLessThanOrEqual(135);
        expect(colors[name][1], `${name} glow is orange`).toBeGreaterThan(colors[name][2]);
        expect(colors[name][2], `${name} glow is orange`).toBeLessThan(48);
        expect(colors[name][3], `${name} emits visible light`).toBeGreaterThan(0);
    }
});

test('Fire produced by burning Oil and Wood keeps emitting its persistent dim light', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const fuels = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const source = { x: 80, y: 60 };
        const results = {};
        physics.setRandomSource(() => 0.99999);
        for (const fuel of ['Oil', 'Wood']) {
            physics.clearWorld();
            physics.setAmbientIlluminationTarget(0);
            physics.setCell(source.x, source.y, id(fuel));
            physics.setCell(source.x - 1, source.y, id('Wall'));
            physics.setCell(source.x + 1, source.y, id('Wall'));
            physics.setCell(source.x, source.y + 1, id('Wall'));
            const world = physics.getWorld();
            const index = physics.index(source.x, source.y);
            world.temp[index] = 1000;
            world.heat[index] = definitions[id(fuel)].latent + 2000;
            physics.stepSimulation();
            const becameFire = world.type[index] === id('Fire') ||
                world.type.some(type => type === id('Fire'));
            for (let tick = 0; tick < 4; tick++) physics.stepSimulation();
            const fireId = id('Fire');
            let fireIndex = -1;
            let closestDistance = Infinity;
            for (let candidate = 0; candidate < world.type.length; candidate++) {
                if (world.type[candidate] !== fireId || world.life[candidate] <= 0) continue;
                const x = candidate % world.cols;
                const y = Math.floor(candidate / world.cols);
                const distance = Math.abs(x - source.x) + Math.abs(y - source.y);
                if (distance < closestDistance) {
                    fireIndex = candidate;
                    closestDistance = distance;
                }
            }
            if (fireIndex < 0) throw new Error(`${fuel} did not leave persistent Fire in the fixture.`);
            const fire = { x: fireIndex % world.cols, y: Math.floor(fireIndex / world.cols) };
            const directions = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
            const ray = directions.find(direction => {
                for (let distance = 1; distance <= 6; distance++) {
                    const x = fire.x + direction.x * distance;
                    const y = fire.y + direction.y * distance;
                    if (x < 0 || y < 0 || x >= world.cols || y >= world.rows) return false;
                    const blocker = definitions[world.type[physics.index(x, y)]];
                    if (blocker && (blocker.group === 'Solids' || blocker.category === 'powder' ||
                        blocker.isPlant || blocker.machine)) return false;
                }
                return true;
            });
            if (!ray) throw new Error(`${fuel}-derived Fire has no unblocked radius-six sample ray.`);
            results[fuel] = {
                becameFire,
                fire,
                remainsFire: world.type[fireIndex] === fireId,
                life: world.life[fireIndex],
                sourceLight: physics.getIlluminationAt(fire.x, fire.y),
                radiusFive: physics.getIlluminationAt(fire.x + ray.x * 5, fire.y + ray.y * 5),
                distanceSix: physics.getIlluminationAt(fire.x + ray.x * 6, fire.y + ray.y * 6)
            };
        }
        return results;
    });

    for (const fuel of ['Oil', 'Wood']) {
        expect(fuels[fuel].becameFire, `${fuel} burns into Fire`).toBe(true);
        expect(fuels[fuel].remainsFire, `${fuel}-derived Fire survives several ticks`).toBe(true);
        expect(fuels[fuel].life).toBeGreaterThan(0);
        expect(fuels[fuel].sourceLight).toBe(50);
        expect(fuels[fuel].radiusFive).toBeGreaterThan(0);
        expect(fuels[fuel].distanceSix).toBe(0);
    }
});

test('Gunpowder stays dark during its fuse, then leaves a four-tick bright explosion flash', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const blast = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const center = { x: 90, y: 60 };
        const world = physics.getWorld();
        const centerIndex = physics.index(center.x, center.y);
        physics.clearWorld();
        physics.setAmbientIlluminationTarget(0);
        physics.setRandomSource(() => 0.99999);
        physics.setCell(center.x, center.y, id('Gunpowder'));
        physics.setCell(center.x, center.y + 1, id('Wall'));
        world.data[centerIndex] = 2;
        const beforeFuse = physics.getIlluminationAt(center.x, center.y);
        physics.stepSimulation();
        const duringFuse = {
            type: world.type[centerIndex],
            fuse: world.data[centerIndex],
            light: physics.getIlluminationAt(center.x, center.y)
        };
        physics.stepSimulation();
        const flash = [];
        for (let tick = 0; tick <= 4; tick++) {
            if (tick > 0) physics.stepSimulation();
            flash.push({
                centerLight: physics.getIlluminationAt(center.x, center.y),
                radiusTen: physics.getIlluminationAt(center.x + 10, center.y),
                outsideRadius: physics.getIlluminationAt(center.x + 11, center.y),
                centerType: world.type[centerIndex]
            });
        }
        physics.setCell(center.x + 4, center.y, id('Fire'));
        physics.stepSimulation();
        const fireOnly = {
            centerLight: physics.getIlluminationAt(center.x, center.y),
            fireSourceLight: physics.getIlluminationAt(center.x + 4, center.y),
            flashRadius: physics.getIlluminationAt(center.x + 10, center.y),
            fireType: world.type[physics.index(center.x + 4, center.y)]
        };
        return { center, gunpowder: id('Gunpowder'), empty: 0, beforeFuse, duringFuse, flash, fireOnly };
    });

    expect(blast.beforeFuse).toBe(0);
    expect(blast.duringFuse.type).toBe(blast.gunpowder);
    expect(blast.duringFuse.fuse).toBeGreaterThan(0);
    expect(blast.duringFuse.light).toBe(0);
    expect(blast.flash[0].centerType).toBe(blast.empty);
    expect(blast.flash[0].centerLight).toBe(100);
    expect(blast.flash[0].radiusTen).toBeGreaterThan(0);
    expect(blast.flash[0].outsideRadius).toBe(0);
    for (const sample of blast.flash) expect(sample.centerType).toBe(blast.empty);
    for (let tick = 1; tick < blast.flash.length; tick++) {
        expect(blast.flash[tick].centerLight, `flash fades on tick ${tick}`)
            .toBeLessThan(blast.flash[tick - 1].centerLight);
        expect(blast.flash[tick].radiusTen, `radius-ten flash fades on tick ${tick}`)
            .toBeLessThan(blast.flash[tick - 1].radiusTen);
    }
    expect(blast.flash.at(-1).centerLight).toBe(0);
    expect(blast.flash.at(-1).radiusTen).toBe(0);
    expect(blast.fireOnly.fireType).toBeGreaterThan(0);
    expect(blast.fireOnly.fireSourceLight).toBe(50);
    expect(blast.fireOnly.centerLight).toBeGreaterThan(0);
    expect(blast.fireOnly.centerLight).toBeLessThanOrEqual(100);
    expect(blast.fireOnly.flashRadius).toBe(0);
});

test('overlapping Fire and Lava light adds contributions and clamps to 100', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const overlap = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const target = { x: 90, y: 70 };
        physics.clearWorld();
        physics.setAmbientIlluminationTarget(0);
        physics.setCell(target.x - 1, target.y, id('Fire'));
        const oneSource = physics.getIlluminationAt(target.x, target.y);
        physics.clearWorld();
        physics.setAmbientIlluminationTarget(0);
        const emitters = [
            { x: target.x - 1, y: target.y, name: 'Fire' },
            { x: target.x + 1, y: target.y, name: 'Lava' },
            { x: target.x, y: target.y - 1, name: 'Fire' },
            { x: target.x, y: target.y + 1, name: 'Lava' },
            { x: target.x - 1, y: target.y - 1, name: 'Fire' }
        ];
        for (const emitter of emitters) physics.setCell(emitter.x, emitter.y, id(emitter.name));
        return { oneSource, overlap: physics.getIlluminationAt(target.x, target.y) };
    });
    expect(overlap.oneSource).toBeGreaterThan(0);
    expect(overlap.oneSource).toBeLessThan(100);
    expect(overlap.overlap).toBe(100);
});

test('empty Normal-view illumination stays fully transparent', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const overlay = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const view = await import('/constantsAndGlobalVars.js');
        const game = await import('/game.js');
        physics.clearWorld();
        physics.setAmbientIlluminationTarget(80);
        view.setVisualizationMode('normal');
        game.renderWorld();
        const light = document.querySelector('#illuminationOverlay');
        const pixels = light.getContext('2d').getImageData(0, 0, light.width, light.height).data;
        let nonTransparent = 0;
        for (let alpha = 3; alpha < pixels.length; alpha += 4) if (pixels[alpha] !== 0) nonTransparent++;
        return {
            nonTransparent,
            cssBackground: getComputedStyle(light).backgroundColor,
            litWorldCells: [...physics.getWorld().illumination].filter(value => value > 0).length
        };
    });
    expect(overlay.nonTransparent).toBe(0);
    expect(overlay.cssBackground).toBe('rgba(0, 0, 0, 0)');
    expect(overlay.litWorldCells).toBe(0);
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
            const radiusPixel = light.getContext('2d').getImageData(lamp.x + 25, lamp.y, 1, 1).data;
            return {
                layerOrder: follows(canvas, light) && follows(light, machine),
                layerBackground: getComputedStyle(light).backgroundColor,
                canvasBounds: { left: canvasRect.left, top: canvasRect.top, right: canvasRect.right, bottom: canvasRect.bottom },
                lightBounds: { left: lightRect.left, top: lightRect.top, right: lightRect.right, bottom: lightRect.bottom },
                cellWidth,
                cellHeight,
                displayRadiusX: 25 * cellWidth,
                displayRadiusY: 25 * cellHeight,
                edgeAlpha: edgePixel[3],
                radiusAlpha: radiusPixel[3]
            };
        };
        const zoomOne = measureLayer();
        const fieldsAtZoomOne = {
            active: physics.getMachineLiveStatus(lamp.x, lamp.y).active,
            center: physics.getIlluminationAt(lamp.x, lamp.y),
            edgeFalloff: physics.getIlluminationAt(target.x, target.y),
            radius: physics.getIlluminationAt(lamp.x + 25, lamp.y),
            outside: physics.getIlluminationAt(lamp.x + 26, lamp.y),
            outsideWorld: physics.getIlluminationAt(-1, lamp.y)
        };
        game.setCanvasZoomLevel(2);
        game.renderWorld();
        const zoomTwo = measureLayer();
        const fieldsAtZoomTwo = {
            center: physics.getIlluminationAt(lamp.x, lamp.y),
            edgeFalloff: physics.getIlluminationAt(target.x, target.y),
            radius: physics.getIlluminationAt(lamp.x + 25, lamp.y),
            outside: physics.getIlluminationAt(lamp.x + 26, lamp.y)
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
    expect(edge.fieldsAtZoomOne.edgeFalloff).toBeCloseTo(100 * (26 - 5) / 25, 1);
    expect(edge.fieldsAtZoomOne.radius).toBeCloseTo(100 / 25, 5);
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
        expect(zoom.layerBackground).toBe('rgba(0, 0, 0, 0)');
        expect(Math.abs(zoom.lightBounds.left - zoom.canvasBounds.left)).toBeLessThan(1);
        expect(Math.abs(zoom.lightBounds.top - zoom.canvasBounds.top)).toBeLessThan(1);
        expect(Math.abs(zoom.lightBounds.right - zoom.canvasBounds.right)).toBeLessThan(1);
        expect(Math.abs(zoom.lightBounds.bottom - zoom.canvasBounds.bottom)).toBeLessThan(1);
        expect(zoom.edgeAlpha).toBeGreaterThan(0);
        expect(zoom.edgeAlpha).toBe(Math.round(255 * 0.5));
        expect(zoom.radiusAlpha).toBe(Math.round(255 * 0.5 / 25));
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
        const expected = 100 * (26 - (target.x - lamp.x)) / 25;

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

        const newLamp = { x: lamp.x + 40, y: lamp.y };
        const newTarget = { x: target.x + 40, y: target.y };
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
        physics.setAmbientIlluminationTarget(0);
        const target = { x: 55, y: 70 };
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
        const farther = { x: target.x, y: target.y + 14 };
        const bothFarther = physics.getIlluminationAt(farther.x, farther.y);
        return { bothNear, oneNear, bothFarther };
    });
    const nearDistance = 5;
    const fartherDistance = Math.sqrt(5 ** 2 + 14 ** 2);
    expect(result.oneNear).toBeCloseTo(100 * (26 - nearDistance) / 25, 1);
    expect(result.bothNear).toBe(100);
    expect(result.bothFarther).toBeCloseTo(2 * 100 * (26 - fartherDistance) / 25, 1);
    expect(result.bothFarther).toBeLessThan(100);
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
        const gas = definitions.find(definition => definition?.name === 'Steam' &&
            definition.category === 'gas' && !definition.machine);
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
            physics.setAmbientIlluminationTarget(0);
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
        expect(observations[key], key).toBeCloseTo(100 * (26 - 12) / 25, 1);
    }
});

test('normal view receives yellow Lamp tint while diagnostic palettes and world fields stay unchanged', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const lamp = { x: 70, y: 55 };
    const target = { x: 80, y: 55 };
    const fixture = await seedPoweredLamp(page, { lamp, target });
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
    expect(normalLit[0]).toBe(255);
    expect(normalLit[1]).toBeGreaterThanOrEqual(219);
    expect(normalLit[1]).toBeLessThanOrEqual(221);
    expect(normalLit[2]).toBeGreaterThanOrEqual(64);
    expect(normalLit[2]).toBeLessThanOrEqual(65);
    expect(normalLit[3]).toBeGreaterThan(normalDark[3]);

    const paletteSamples = await page.evaluate(async ({ lamp, target, fixture }) => {
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
        const captured = physics.captureSimulationState();
        const snapshot = {
            ...captured,
            arrays: Object.fromEntries(Object.entries(captured.arrays)
                .map(([field, values]) => [field, values.slice()]))
        };
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
                illumination: physics.getIlluminationAt(target.x, target.y),
                lampStatus: physics.getMachineLiveStatus(lamp.x, lamp.y),
                lampSetting: restoredWorld.machineSetting[physics.index(lamp.x, lamp.y)],
                batteryCharge: physics.getStoredCharge(fixture.battery.x, fixture.battery.y)
            }
        };
        view.setVisualizationMode('normal');
        game.renderWorld();
        return samples;
    }, { lamp, target, fixture });

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

    expect(persistence.illumination).toBeCloseTo(100 * (26 - 10) / 25, 5);
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
    await game.step(0);
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
    await expect(feedback).toContainText(/25\s*cells/i);
    await expect(feedback).toContainText(/100(?:\.0)?/);

    await page.getByRole('button', { name: 'Lamp', exact: true }).hover();
    const tooltip = page.locator('#toolTooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(/light|illumination/i);
    await expect(tooltip).toContainText(/25\s*cells/i);

    await page.evaluate(async ({ lamp }) => {
        const physics = await import('/physics.js');
        physics.setMachineSetting(lamp.x, lamp.y, 0);
        window.__GAME_INSTANCE__.step(0);
    }, { lamp, fixture });
    await page.mouse.move(...Object.values(await machineArtworkCellPoint(page, lamp)));
    await expect(feedback).toContainText(/emission.*OFF|OFF.*emission/i);
});

test('ambient illumination follows the low-light floor, top/bottom visibility, and one-time gas attenuation', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const field = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        // Keep the test gas fixed while the budgeted visibility field catches
        // up across multiple simulation ticks.
        definitions[id('Steam')].moves = false;
        const chunkSize = physics.AMBIENT_ILLUMINATION_CHUNK_SIZE;
        const center = (start, extent) => start + Math.floor((extent - 1) / 2);
        const cols = chunkSize * 3;
        const rows = chunkSize * 3;
        physics.createWorld(cols, rows);
        const world = physics.getWorld();
        // Ambient geometry is sampled once per configured tile at its center.
        const sample = { x: center(chunkSize, chunkSize), y: center(chunkSize, chunkSize) };
        const setRow = (y, material) => {
            for (let x = 0; x < world.cols; x++) physics.setCell(x, y, material);
        };

        physics.setAmbientIlluminationTarget(10);
        const lowOpenTop = physics.getIlluminationAt(center(0, chunkSize), sample.y);
        const lowOpenBottom = physics.getIlluminationAt(center(chunkSize, chunkSize), center(chunkSize * 2, chunkSize));
        setRow(sample.y - 1, id('Wall'));
        setRow(sample.y + 1, id('Wall'));
        const lowEnclosed = physics.getIlluminationAt(sample.x, sample.y);
        physics.setAmbientIlluminationTarget(0);
        const zeroEnclosed = physics.getIlluminationAt(sample.x, sample.y);

        physics.setAmbientIlluminationTarget(80);
        setRow(sample.y - 1, 0);
        setRow(sample.y + 1, 0);
        for (let tick = 0; tick < 120; tick++) physics.stepSimulation();
        const topAndBottomVisible = physics.getIlluminationAt(sample.x, sample.y);
        setRow(sample.y - 1, id('Wall'));
        for (let tick = 0; tick < 120; tick++) physics.stepSimulation();
        setRow(sample.y + 1, 0);
        for (let tick = 0; tick < 120; tick++) physics.stepSimulation();
        const bottomOnly = physics.getIlluminationAt(sample.x, sample.y);
        setRow(sample.y + 1, id('Wall'));
        for (let tick = 0; tick < 120; tick++) physics.stepSimulation();
        const neitherBoundaryVisible = physics.getIlluminationAt(sample.x, sample.y);
        setRow(sample.y - 1, 0);
        for (let tick = 0; tick < 120; tick++) physics.stepSimulation();
        const topOnly = physics.getIlluminationAt(sample.x, sample.y);

        setRow(sample.y - 1, 0);
        setRow(sample.y + 1, 0);
        physics.setCell(sample.x, sample.y - Math.floor(chunkSize / 3), id('Steam'));
        physics.setCell(sample.x, sample.y - 2, id('Steam'));
        for (let tick = 0; tick < 120; tick++) physics.stepSimulation();
        const twoGasCellsOnRay = physics.getIlluminationAt(sample.x, sample.y);
        const steamIsGas = definitions[id('Steam')]?.category === 'gas';
        return {
            lowOpenTop, lowOpenBottom, lowEnclosed, zeroEnclosed,
            topAndBottomVisible, bottomOnly, neitherBoundaryVisible, topOnly,
            twoGasCellsOnRay, steamIsGas
        };
    });

    expect(field.lowOpenTop).toBe(10);
    expect(field.lowOpenBottom).toBe(10);
    expect(field.lowEnclosed).toBe(10);
    expect(field.zeroEnclosed).toBe(0);
    expect(field.topAndBottomVisible, 'top visibility takes precedence over the bottom half-strength').toBe(80);
    expect(field.bottomOnly).toBe(40);
    expect(field.neitherBoundaryVisible).toBe(10);
    expect(field.topOnly).toBe(80);
    expect(field.steamIsGas).toBe(true);
    expect(field.twoGasCellsOnRay, 'multiple gas cells attenuate the chosen ambient ray only once').toBe(60);
});

test('ambient values in a mixed chunk use its center sample across the former wall split', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const chunkSize = physics.AMBIENT_ILLUMINATION_CHUNK_SIZE;
        if (!Number.isInteger(chunkSize) || chunkSize < 3) {
            throw new Error(`Expected a configurable chunk size of at least 3 cells, found ${chunkSize}.`);
        }
        const center = Math.floor((chunkSize - 1) / 2);
        physics.createWorld(chunkSize, chunkSize);
        const grid = physics.getWorld();
        const wall = id('Wall');
        const steam = id('Steam');
        definitions[steam].moves = false;
        grid.type.fill(wall);

        // Leave one straight channel above the left target and one below the
        // right target, separated by a solid vertical wall at the center.
        const left = { x: center - 1, y: center };
        const right = { x: center + 1, y: center };
        for (let y = 0; y <= center; y++) grid.type[physics.index(left.x, y)] = 0;
        for (let y = center; y < chunkSize; y++) grid.type[physics.index(right.x, y)] = 0;
        grid.type[physics.index(left.x, Math.floor(center / 2))] = steam;
        grid.type[physics.index(right.x, center + Math.floor((chunkSize - 1 - center) / 2))] = steam;
        physics.setAmbientIlluminationTarget(80);
        const centerValue = physics.getIlluminationAt(center, center);
        let nonUniformCells = 0;
        for (let y = 0; y < chunkSize; y++) {
            for (let x = 0; x < chunkSize; x++) {
                const actual = physics.getIlluminationAt(x, y);
                if (actual !== centerValue) nonUniformCells++;
            }
        }
        return {
            chunkSize,
            center: { x: center, y: center },
            left,
            right,
            solidDivider: grid.type[physics.index(center, center)] === wall,
            centerValue,
            leftValue: physics.getIlluminationAt(left.x, left.y),
            rightValue: physics.getIlluminationAt(right.x, right.y),
            nonUniformCells
        };
    });

    expect(result.solidDivider).toBe(true);
    expect(result.centerValue).toBe(10);
    expect(result.leftValue).toBe(result.centerValue);
    expect(result.rightValue).toBe(result.centerValue);
    expect(result.nonUniformCells, JSON.stringify(result)).toBe(0);
});

test('ambient light remaps center samples without rays and converges after edits', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const chunkSize = physics.AMBIENT_ILLUMINATION_CHUNK_SIZE;
        if (!Number.isInteger(chunkSize) || chunkSize < 3) {
            throw new Error('physics.AMBIENT_ILLUMINATION_CHUNK_SIZE must be an integer of at least 3.');
        }
        const cols = chunkSize * 3 + 5;
        const rows = chunkSize * 2 + 1;
        const worldCells = cols * rows;
        const center = (start, extent) => start + Math.floor((extent - 1) / 2);
        const topSample = { x: center(0, chunkSize), y: center(0, chunkSize) };
        const groundSample = { x: center(chunkSize, chunkSize), y: topSample.y };
        const gasSample = { x: topSample.x, y: center(chunkSize, chunkSize) };
        const fallbackSample = { x: center(chunkSize * 2, chunkSize), y: gasSample.y };
        const edgeSample = { x: center(chunkSize * 3, 5), y: center(chunkSize * 2, 1) };
        const gasY = chunkSize + Math.floor((gasSample.y - chunkSize) / 2);
        const mutation = { x: gasSample.x, y: gasY };
        const chunkCols = Math.ceil(cols / chunkSize);
        const editedChunkId = Math.floor(mutation.y / chunkSize) * chunkCols +
            Math.floor(mutation.x / chunkSize);
        definitions[id('Steam')].moves = false;

        const recorder = {
            enabled: true,
            events: [],
            record(name, durationMs, counters = {}) {
                if (this.enabled) this.events.push({ name, durationMs, counters });
            },
            reset() { this.events.length = 0; },
            snapshot() { return this.events.slice(); }
        };
        window.__P0_PERF__ = recorder;

        physics.createWorld(cols, rows);
        let world = physics.getWorld();
        world.type.fill(id('Wall'));
        const clearVertical = (x, firstY, lastY) => {
            for (let y = firstY; y <= lastY; y++) world.type[physics.index(x, y)] = 0;
        };
        // The final 5x1 tile uses the center of its actual partial extent.
        clearVertical(topSample.x, 0, rows - 1);
        world.type[physics.index(gasSample.x, gasY)] = id('Steam');
        clearVertical(groundSample.x, topSample.y, rows - 1);
        clearVertical(edgeSample.x, 0, edgeSample.y);
        physics.setAmbientIlluminationTarget(80);

        const getField = () => physics.getWorld().ambientIllumination;
        const read = (x, y) => physics.getIlluminationAt(x, y);
        const tileSummaries = () => {
            const field = getField();
            const tiles = [];
            for (let y0 = 0; y0 < rows; y0 += chunkSize) {
                for (let x0 = 0; x0 < cols; x0 += chunkSize) {
                    const width = Math.min(chunkSize, cols - x0);
                    const height = Math.min(chunkSize, rows - y0);
                    const centerX = x0 + Math.floor((width - 1) / 2);
                    const centerY = y0 + Math.floor((height - 1) / 2);
                    const value = field[physics.index(centerX, centerY)];
                    let uniform = true;
                    for (let y = y0; y < y0 + height; y++) {
                        for (let x = x0; x < x0 + width; x++) {
                            if (Math.abs(field[physics.index(x, y)] - value) > 1e-5) uniform = false;
                        }
                    }
                    tiles.push({ x0, y0, width, height,
                        centerValue: value, uniform });
                }
            }
            return tiles;
        };

        const initialValues = [
            read(topSample.x, topSample.y),
            read(groundSample.x, groundSample.y),
            read(gasSample.x, gasSample.y),
            read(fallbackSample.x, fallbackSample.y),
            read(edgeSample.x, edgeSample.y)
        ];
        const initialTiles = tileSummaries();
        const initialFullEvent = recorder.snapshot().find(event =>
            event.name === 'ambientIlluminationFullBuild');

        recorder.reset();
        for (let tick = 0; tick < 4; tick++) {
            read(topSample.x, topSample.y);
            read(groundSample.x, groundSample.y);
            physics.stepSimulation();
        }
        const stableEvents = recorder.snapshot().filter(event =>
            /^ambientIllumination(?:FullBuild|IncrementalUpdate)$/.test(event.name));

        recorder.reset();
        physics.setAmbientIlluminationTarget(60);
        const remappedValues = [
            read(topSample.x, topSample.y), read(groundSample.x, groundSample.y),
            read(gasSample.x, gasSample.y), read(fallbackSample.x, fallbackSample.y),
            read(edgeSample.x, edgeSample.y)
        ];
        const remapEvents = recorder.snapshot().filter(event =>
            event.name === 'ambientIlluminationSliderRemap');
        const remapFullBuilds = recorder.snapshot().filter(event =>
            event.name === 'ambientIlluminationFullBuild').length;
        const remapIncrementalUpdates = recorder.snapshot().filter(event =>
            event.name === 'ambientIlluminationIncrementalUpdate').length;

        physics.setAmbientIlluminationTarget(10);
        const lowTargetUniform = getField().every(value => value === 10);
        physics.setAmbientIlluminationTarget(0);
        const zeroTargetUniform = getField().every(value => value === 0);
        physics.setAmbientIlluminationTarget(80);
        physics.setDebugFeatureEnabled('worldIllumination', false);
        // With the feature disabled, public reads use the slider target directly;
        // the derived backing plane is intentionally not rewritten.
        const debugOffValues = [
            read(topSample.x, topSample.y), read(groundSample.x, groundSample.y),
            read(gasSample.x, gasSample.y), read(fallbackSample.x, fallbackSample.y),
            read(edgeSample.x, edgeSample.y)
        ];
        const debugOffUniform = debugOffValues.every(value => value === 80);
        physics.setDebugFeatureEnabled('worldIllumination', true);
        // Re-enable and drain any refresh before measuring isolated mutations.
        for (let tick = 0; tick < 120; tick++) {
            physics.stepSimulation();
            read(topSample.x, topSample.y);
        }
        const reenabledValues = [
            read(topSample.x, topSample.y), read(groundSample.x, groundSample.y),
            read(gasSample.x, gasSample.y), read(fallbackSample.x, fallbackSample.y),
            read(edgeSample.x, edgeSample.y)
        ];
        let fallbackCountBaseline = recorder.snapshot()
            .filter(event => event.name === 'ambientIlluminationIncrementalUpdate')
            .reduce((count, event) => Math.max(count, Number(event.counters?.fallbackCount || 0)), 0);

        const settleAndCompare = () => {
            const beforeImmediateRead = recorder.snapshot().length;
            read(gasSample.x, gasSample.y);
            const immediateEvents = recorder.snapshot().slice(beforeImmediateRead).filter(event =>
                event.name === 'ambientIlluminationFullBuild' ||
                event.name === 'ambientIlluminationIncrementalUpdate');
            const immediateFullBuilds = immediateEvents.filter(event =>
                event.name === 'ambientIlluminationFullBuild').length;
            const immediateChunksSampled = immediateEvents.reduce((sum, event) =>
                sum + Number(event.counters?.chunksSampled || 0), 0);
            for (let tick = 0; tick < 120; tick++) {
                physics.stepSimulation();
                read(gasSample.x, gasSample.y);
            }
            const incremental = getField().slice();
            const types = physics.getWorld().type.slice();
            const events = recorder.snapshot().filter(event =>
                event.name === 'ambientIlluminationIncrementalUpdate');
            const observedFallbackCount = events.reduce((count, event) =>
                Math.max(count, Number(event.counters?.fallbackCount || 0)), fallbackCountBaseline);
            const counters = events.reduce((summary, event) => ({
                chunksSampled: summary.chunksSampled + Number(event.counters?.chunksSampled || 0),
                cellsWritten: summary.cellsWritten + Number(event.counters?.cellsWritten || 0),
                maxChunksSampled: Math.max(summary.maxChunksSampled,
                    Number(event.counters?.chunksSampled || 0)),
                sampledChunkIds: [...summary.sampledChunkIds,
                    ...(Array.isArray(event.counters?.sampledChunkIds) ? event.counters.sampledChunkIds : [])],
                pendingChunks: event.counters?.pendingChunks ?? summary.pendingChunks
            }), { chunksSampled: 0, cellsWritten: 0, fallbackCount: 0, maxChunksSampled: 0,
                sampledChunkIds: [], pendingChunks: null });
            counters.fallbackCount = observedFallbackCount - fallbackCountBaseline;
            fallbackCountBaseline = observedFallbackCount;

            recorder.enabled = false;
            physics.createWorld(cols, rows);
            // The fresh-build differential starts a new world and resets its
            // fallback counter, so the next edit stage starts from zero too.
            fallbackCountBaseline = 0;
            world = physics.getWorld();
            world.type.set(types);
            physics.setAmbientIlluminationTarget(80);
            read(gasSample.x, gasSample.y);
            const reference = getField().slice();
            recorder.enabled = true;
            let mismatches = 0;
            let maxError = 0;
            for (let cell = 0; cell < worldCells; cell++) {
                const error = Math.abs(incremental[cell] - reference[cell]);
                if (error > 1e-5) mismatches++;
                maxError = Math.max(maxError, error);
            }
            const uniform = tileSummaries().every(tile => tile.uniform);
            return {
                value: read(gasSample.x, gasSample.y), counters, mismatches, maxError, uniform,
                immediateFullBuilds, immediateChunksSampled
            };
        };

        recorder.reset();
        physics.setCell(mutation.x, mutation.y, id('Wall'));
        const afterBlocker = settleAndCompare();
        recorder.reset();
        physics.setCell(mutation.x, mutation.y, id('Steam'));
        const afterGas = settleAndCompare();
        recorder.reset();
        physics.setCell(mutation.x, mutation.y, 0);
        const afterRemoval = settleAndCompare();

        // Plants query the same effective chunk field that material feedback uses.
        // Put the plant on the known open center ray so its environment reads
        // the uniform value sampled for that chunk.
        const plantCell = { x: topSample.x, y: topSample.y };
        physics.setCell(plantCell.x, plantCell.y, id('Daffodil'));
        physics.setCell(plantCell.x, plantCell.y + 1, id('Wet Mud'));
        physics.setCell(plantCell.x, plantCell.y + 2, id('Wall'));
        const plantEnvironment = physics.getPlantEnvironment(plantCell.x, plantCell.y);
        const plantCellValue = physics.getIlluminationAt(plantCell.x, plantCell.y);

        return {
            chunkSize, cols, rows, worldCells, edgeSample, plantCell, editedChunkId, initialValues, initialTiles,
            initialCounters: initialFullEvent?.counters ?? null,
            stableEventCount: stableEvents.length,
            remappedValues,
            remapEventCount: remapEvents.length,
            remapRayTraces: remapEvents[0]?.counters?.rayTraces ?? null,
            remapFullBuilds, remapIncrementalUpdates,
            lowTargetUniform, zeroTargetUniform, debugOffUniform, debugOffValues, reenabledValues,
            afterBlocker, afterGas, afterRemoval,
            plantValue: plantEnvironment?.illumination ?? null,
            plantCellValue
        };
    });

    expect(result.initialValues).toEqual([80, 40, 60, 10, 80]);
    expect(result.initialTiles).toHaveLength(12);
    expect(result.initialTiles.every(tile => tile.uniform),
        'all cells in each tile use its in-bounds center sample, including partial edges').toBe(true);
    const partialEdge = result.initialTiles.find(tile =>
        tile.x0 === result.chunkSize * 3 && tile.y0 === result.chunkSize * 2);
    expect(partialEdge).toMatchObject({ width: 5, height: 1 });
    expect(result.initialCounters?.chunksSampled).toBe(12);
    expect(result.initialCounters?.cellsWritten).toBe(result.worldCells);
    expect(result.initialCounters?.pendingChunks).toBe(0);
    expect(result.stableEventCount, 'stable reads and ticks do not resample chunks').toBe(0);
    expect(result.remappedValues).toEqual([60, 30, 45, 10, 60]);
    expect(result.remapEventCount, 'slider changes report a no-ray remap').toBe(1);
    expect(result.remapRayTraces).toBe(0);
    expect(result.remapFullBuilds).toBe(0);
    expect(result.remapIncrementalUpdates).toBe(0);
    expect(result.lowTargetUniform).toBe(true);
    expect(result.zeroTargetUniform).toBe(true);
    expect(result.debugOffUniform, 'debug-off mode is exactly uniform at the target').toBe(true);
    expect(result.reenabledValues).toEqual([80, 40, 60, 10, 80]);

    for (const [label, stage, expected] of [
        ['solid blocker', result.afterBlocker, 40],
        ['gas on selected witness', result.afterGas, 60],
        ['removed gas', result.afterRemoval, 80]
    ]) {
        expect(stage.value, `${label}: updated chunk sample`).toBe(expected);
        expect(stage.counters.chunksSampled, `${label}: incremental update samples chunks`).toBeGreaterThan(0);
        expect(stage.counters.sampledChunkIds, `${label}: the edited cell's tile is recomputed`)
            .toContain(result.editedChunkId);
        expect(stage.counters.maxChunksSampled, `${label}: one edit stays below a full 12-chunk rebuild`)
            .toBeLessThan(12);
        if (stage.counters.fallbackCount > 0) {
            expect(stage.counters.fallbackCount, `${label}: broad invalidation records its full-refresh fallback`)
                .toBeGreaterThan(0);
            expect(stage.counters.pendingChunks, `${label}: fallback queue drains within 120 ticks`).toBe(0);
        } else {
            expect(stage.counters.cellsWritten, `${label}: incremental path rewrites fewer than all world cells`)
                .toBeLessThan(result.worldCells);
        }
        expect(stage.counters.pendingChunks, `${label}: converges within 120 ticks`).toBe(0);
        expect(stage.immediateFullBuilds, `${label}: a cached getter never starts a synchronous full rebuild`).toBe(0);
        expect(stage.immediateChunksSampled, `${label}: cached getters do not synchronously sample dirty chunks`).toBe(0);
        expect(stage.mismatches, `${label}: incremental field matches a fresh chunk build`).toBe(0);
        expect(stage.maxError).toBeLessThanOrEqual(1e-5);
        expect(stage.uniform, `${label}: recomputed chunks remain center-sampled and uniform`).toBe(true);
    }
    expect(result.plantValue).toBe(80);
    expect(result.plantCellValue).toBe(80);

    await page.evaluate(async ({ plantCell }) => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        physics.createWorld(260, 150);
        physics.setAmbientIlluminationTarget(80);
        physics.setCell(plantCell.x, plantCell.y, id('Daffodil'));
        physics.setCell(plantCell.x, plantCell.y + 1, id('Wet Mud'));
        physics.setCell(plantCell.x, plantCell.y + 2, id('Wall'));

        const game = await import('/game.js');
        window.__GAME_INSTANCE__.step(0);
        game.renderWorld();
    }, { plantCell: result.plantCell });
    await hoverCell(page, result.plantCell);
    await expect(page.locator('#hoverFeedback')).toContainText('Daffodil');
    await expect(page.locator('#hoverFeedback')).toContainText(/Illumination\s*:\s*80/i);

    const standardSizes = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const recorder = window.__P0_PERF__;
        const sizes = [];
        for (const [cols, rows] of [[260, 150], [520, 300]]) {
            recorder.reset();
            physics.createWorld(cols, rows);
            physics.setAmbientIlluminationTarget(80);
            physics.getIlluminationAt(0, 0);
            const event = recorder.snapshot().find(item => item.name === 'ambientIlluminationFullBuild');
            sizes.push({
                cols, rows,
                chunksSampled: event?.counters?.chunksSampled ?? null,
                cellsWritten: event?.counters?.cellsWritten ?? null
            });
        }
        return sizes;
    });
    expect(standardSizes).toEqual([
        {
            cols: 260, rows: 150,
            chunksSampled: Math.ceil(260 / result.chunkSize) * Math.ceil(150 / result.chunkSize),
            cellsWritten: 260 * 150
        },
        {
            cols: 520, rows: 300,
            chunksSampled: Math.ceil(520 / result.chunkSize) * Math.ceil(300 / result.chunkSize),
            cellsWritten: 520 * 300
        }
    ]);
});

test('ambient light uses the brighter local source and refreshes after slider, solid, gas, and tick changes', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const lamp = { x: 70, y: 55 };
    await seedPoweredLamp(page, { lamp, target: { x: 80, y: 55 } });
    const slider = page.getByRole('slider', { name: /ambient light/i });
    const ambientOnly = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const size = physics.AMBIENT_ILLUMINATION_CHUNK_SIZE;
        const center = (start, extent) => start + Math.floor((extent - 1) / 2);
        return { x: center(0, size), y: center(size * 2, size) };
    });
    await slider.fill('80');
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        for (let tick = 0; tick < 30; tick++) physics.stepSimulation();
    });

    const brighterLocalAndTransparentAmbient = await page.evaluate(async ({ lamp, ambientOnly }) => {
        const physics = await import('/physics.js');
        const game = await import('/game.js');
        game.renderWorld();
        const world = physics.getWorld();
        const overlay = document.querySelector('#illuminationOverlay');
        const pixel = cell => Array.from(overlay.getContext('2d').getImageData(cell.x, cell.y, 1, 1).data);
        const dimLocal = { x: lamp.x + 24, y: lamp.y };
        const brightLocal = { x: lamp.x + 2, y: lamp.y };
        return {
            ambientOnly: physics.getIlluminationAt(ambientOnly.x, ambientOnly.y),
            ambientOnlyLocal: world.illumination[physics.index(ambientOnly.x, ambientOnly.y)],
            ambientOnlyPixel: pixel(ambientOnly),
            dimLocal: physics.getIlluminationAt(dimLocal.x, dimLocal.y),
            dimLocalSource: world.illumination[physics.index(dimLocal.x, dimLocal.y)],
            brightLocal: physics.getIlluminationAt(brightLocal.x, brightLocal.y),
            brightLocalSource: world.illumination[physics.index(brightLocal.x, brightLocal.y)]
        };
    }, { lamp, ambientOnly });
    expect(brighterLocalAndTransparentAmbient.ambientOnly).toBe(80);
    expect(brighterLocalAndTransparentAmbient.ambientOnlyLocal).toBe(0);
    expect(brighterLocalAndTransparentAmbient.ambientOnlyPixel[3]).toBe(0);
    expect(brighterLocalAndTransparentAmbient.dimLocalSource).toBeLessThan(80);
    expect(brighterLocalAndTransparentAmbient.dimLocal).toBe(80);
    expect(brighterLocalAndTransparentAmbient.brightLocalSource).toBeGreaterThan(80);
    expect(brighterLocalAndTransparentAmbient.brightLocal).toBeCloseTo(
        brighterLocalAndTransparentAmbient.brightLocalSource, 4);

    const editedField = await page.evaluate(async ({ ambientOnly }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const wall = physics.getDefinitions().findIndex(definition => definition?.name === 'Wall');
        const steam = physics.getDefinitions().findIndex(definition => definition?.name === 'Steam');
        physics.getDefinitions()[steam].moves = false;
        const setRow = (y, material) => {
            for (let x = 0; x < world.cols; x++) physics.setCell(x, y, material);
        };
        const settle = () => {
            for (let tick = 0; tick < 120; tick++) physics.stepSimulation();
        };
        // Use the center of this tile so edits affect its representative ray.
        const target = { x: ambientOnly.x, y: ambientOnly.y };
        const openField = physics.getIlluminationAt(target.x, target.y);
        setRow(target.y - 1, wall);
        settle();
        const afterSolidEdit = physics.getIlluminationAt(target.x, target.y);
        physics.setCell(target.x, target.y + 2, steam);
        physics.setCell(target.x, target.y + 3, steam);
        settle();
        const afterGasEdit = physics.getIlluminationAt(target.x, target.y);
        physics.setCell(target.x, target.y + 2, 0);
        physics.setCell(target.x, target.y + 3, 0);
        settle();
        const afterTick = physics.getIlluminationAt(target.x, target.y);
        setRow(target.y - 1, 0);
        settle();
        const afterOpeningSolidBarrier = physics.getIlluminationAt(target.x, target.y);
        return { openField, afterSolidEdit, afterGasEdit, afterTick, afterOpeningSolidBarrier };
    }, { ambientOnly });

    expect(editedField.openField).toBe(80);
    expect(editedField.afterSolidEdit).toBe(40);
    expect(editedField.afterGasEdit).toBe(30);
    expect(editedField.afterTick).toBe(40);
    expect(editedField.afterOpeningSolidBarrier).toBe(80);
    await slider.fill('40');
    await expect.poll(async () => page.evaluate(async ({ ambientOnly }) =>
        (await import('/physics.js')).getIlluminationAt(ambientOnly.x, ambientOnly.y), { ambientOnly }))
        .toBe(40);
});

test('ambient visibility builds once, stays idle in stable worlds, and incrementally converges after cell edits', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const chunkSize = physics.AMBIENT_ILLUMINATION_CHUNK_SIZE;
        const cols = chunkSize + 10;
        const rows = chunkSize;
        const target = { x: Math.floor((chunkSize - 1) / 2), y: Math.floor((chunkSize - 1) / 2) };
        const blockerY = Math.floor(target.y / 2);
        physics.createWorld(cols, rows);
        const world = physics.getWorld();
        world.type.fill(id('Wall'));
        // One clear cell-center ray from the top reaches the target. The rest
        // of the boundary is opaque, so a blocker or gas change has a stable,
        // deterministic expected value.
        for (let y = 0; y <= target.y; y++) world.type[physics.index(target.x, y)] = 0;
        definitions[id('Steam')].moves = false;
        physics.setAmbientIlluminationTarget(80);

        const recorder = {
            enabled: true,
            events: [],
            record(name, durationMs, counters = {}) {
                if (this.enabled) this.events.push({ name, durationMs, counters });
            },
            reset() { this.events.length = 0; },
            snapshot() { return this.events.slice(); }
        };
        window.__P0_PERF__ = recorder;
        const names = {
            full: 'ambientIlluminationFullBuild',
            incremental: 'ambientIlluminationIncrementalUpdate'
        };
        const isAmbientEvent = event => Object.values(names).includes(event.name);
        const settle = () => {
            // 120 simulation ticks bound convergence to two simulated seconds.
            for (let tick = 0; tick < 120; tick++) {
                physics.stepSimulation();
                physics.getIlluminationAt(target.x, target.y);
            }
            return physics.getIlluminationAt(target.x, target.y);
        };
        const compareAgainstFreshFullBuild = () => {
            const incrementalWorld = physics.getWorld();
            const incremental = incrementalWorld.ambientIllumination.slice();
            const types = incrementalWorld.type.slice();
            physics.createWorld(cols, rows);
            const referenceWorld = physics.getWorld();
            referenceWorld.type.set(types);
            physics.setAmbientIlluminationTarget(80);
            physics.getIlluminationAt(target.x, target.y);
            let mismatches = 0;
            let maxError = 0;
            for (let cell = 0; cell < worldCells; cell++) {
                const error = Math.abs(incremental[cell] - referenceWorld.ambientIllumination[cell]);
                if (error > 1e-5) mismatches++;
                maxError = Math.max(maxError, error);
            }
            return { mismatches, maxError };
        };
        const worldCells = cols * rows;

        const initial = physics.getIlluminationAt(target.x, target.y);
        const initialEvents = recorder.snapshot().filter(isAmbientEvent);
        recorder.reset();
        for (let tick = 0; tick < 8; tick++) {
            physics.getIlluminationAt(target.x, target.y);
            physics.stepSimulation();
            physics.getIlluminationAt(target.x, target.y);
        }
        const stableEvents = recorder.snapshot().filter(isAmbientEvent);

        recorder.reset();
        physics.setCell(target.x, blockerY, id('Wall'));
        const afterSolid = settle();
        const solidEvents = recorder.snapshot().filter(isAmbientEvent);
        const solidDifferential = compareAgainstFreshFullBuild();

        recorder.reset();
        physics.setCell(target.x, blockerY, id('Steam'));
        const afterSolidToGas = settle();
        const gasEvents = recorder.snapshot().filter(isAmbientEvent);
        const gasDifferential = compareAgainstFreshFullBuild();

        recorder.reset();
        physics.setCell(target.x, blockerY, 0);
        const afterGasRemoval = settle();
        const removalEvents = recorder.snapshot().filter(isAmbientEvent);
        const removalDifferential = compareAgainstFreshFullBuild();

        const eventStats = events => ({
            fullBuilds: events.filter(event => event.name === names.full).length,
            incrementalUpdates: events.filter(event => event.name === names.incremental).length,
            durationSamples: events.filter(event => Number.isFinite(event.durationMs)).length,
            chunksSampled: events.reduce((sum, event) => sum + Number(event.counters?.chunksSampled || 0), 0),
            cellsWritten: events.reduce((sum, event) => sum + Number(event.counters?.cellsWritten || 0), 0),
            maxChunksSampled: events.reduce((maximum, event) => Math.max(maximum,
                Number(event.counters?.chunksSampled || 0)), 0),
            lastPendingChunks: events.at(-1)?.counters?.pendingChunks ?? null
        });
        return {
            worldCells,
            initial,
            afterSolid,
            afterSolidToGas,
            afterGasRemoval,
            initialStats: eventStats(initialEvents),
            stableStats: eventStats(stableEvents),
            solidStats: eventStats(solidEvents),
            gasStats: eventStats(gasEvents),
            removalStats: eventStats(removalEvents),
            differentials: { solidDifferential, gasDifferential, removalDifferential }
        };
    });

    expect(result.initial).toBe(80);
    expect(result.initialStats.fullBuilds, 'the first ambient query performs one full field build').toBe(1);
    expect(result.initialStats.incrementalUpdates).toBe(0);
    expect(result.initialStats.durationSamples).toBe(1);
    expect(result.initialStats.chunksSampled, 'the first build samples both chunks').toBe(2);
    expect(result.initialStats.cellsWritten, 'the first build writes every cell in the world').toBe(result.worldCells);
    expect(result.stableStats.fullBuilds, 'stable ticks and repeated reads do not rebuild the field').toBe(0);
    expect(result.stableStats.incrementalUpdates).toBe(0);

    for (const [label, stats] of [
        ['solid insertion', result.solidStats],
        ['solid-to-gas change', result.gasStats],
        ['gas removal', result.removalStats]
    ]) {
        expect(stats.fullBuilds, `${label} uses incremental work rather than a whole-field rebuild`).toBe(0);
        expect(stats.incrementalUpdates, `${label} records incremental work`).toBeGreaterThan(0);
        expect(stats.durationSamples, `${label} work reports timings`).toBe(stats.incrementalUpdates);
        expect(stats.chunksSampled, `${label} resamples a nonempty chunk region`).toBeGreaterThan(0);
        expect(stats.maxChunksSampled, `${label} samples no more than the two chunks in this world`)
            .toBeLessThanOrEqual(2);
        expect(stats.lastPendingChunks, `${label} converges inside the 120-tick bound`).toBe(0);
    }
    expect(result.afterSolid).toBe(10);
    expect(result.afterSolidToGas).toBe(60);
    expect(result.afterGasRemoval).toBe(80);
    for (const [label, differential] of Object.entries(result.differentials)) {
        expect(differential.mismatches, `${label}: incremental values match a fresh full build`).toBe(0);
        expect(differential.maxError, `${label}: no per-cell value differs from a fresh full build`).toBeLessThanOrEqual(1e-5);
    }
});

test('ambient incremental fields match full builds for top/bottom visibility, overlapping wedges, and world edges', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const comparisons = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const wall = physics.getDefinitions().find(definition => definition?.name === 'Wall').id;
        const cases = [
            {
                name: 'top blocker leaves bottom witness', target: { x: 5, y: 5 },
                openColumns: [5], initialWalls: [], mutation: [{ x: 5, y: 3 }], expected: 40
            },
            {
                name: 'bottom blocker after top is already blocked', target: { x: 5, y: 5 },
                openColumns: [5], initialWalls: [{ x: 5, y: 3 }],
                mutation: [{ x: 5, y: 9 }], expected: 10
            },
            {
                name: 'overlapping top shadow wedges', target: { x: 5, y: 5 },
                openColumns: [5, 6], initialWalls: [{ x: 5, y: 3 }],
                mutation: [{ x: 6, y: 3 }], expected: 40
            },
            {
                name: 'left world boundary ray', target: { x: 5, y: 5 },
                openColumns: [], openDiagonalFromLeft: true, openBottom: true,
                initialWalls: [], mutation: [{ x: 2, y: 2 }], expected: 40
            }
        ];
        const cols = 12;
        const rows = 12;
        const results = [];
        for (const fixture of cases) {
            physics.createWorld(cols, rows);
            physics.getWorld().type.fill(wall);
            const world = physics.getWorld();
            for (const x of fixture.openColumns) {
                for (let y = 0; y < rows; y++) world.type[physics.index(x, y)] = 0;
            }
            if (fixture.openDiagonalFromLeft) {
                for (let offset = 0; offset <= fixture.target.x; offset++) {
                    world.type[physics.index(offset, offset)] = 0;
                }
            }
            if (fixture.openBottom) {
                for (let y = fixture.target.y; y < rows; y++) {
                    world.type[physics.index(fixture.target.x, y)] = 0;
                }
            }
            for (const cell of fixture.initialWalls) physics.setCell(cell.x, cell.y, wall);
            physics.setAmbientIlluminationTarget(80);
            physics.getIlluminationAt(fixture.target.x, fixture.target.y);
            for (const cell of fixture.mutation) physics.setCell(cell.x, cell.y, wall);
            for (let tick = 0; tick < 120; tick++) {
                physics.stepSimulation();
                physics.getIlluminationAt(fixture.target.x, fixture.target.y);
            }
            const settledValue = physics.getIlluminationAt(fixture.target.x, fixture.target.y);
            const incremental = world.ambientIllumination.slice();
            const types = world.type.slice();

            physics.createWorld(cols, rows);
            const referenceWorld = physics.getWorld();
            referenceWorld.type.set(types);
            physics.setAmbientIlluminationTarget(80);
            physics.getIlluminationAt(fixture.target.x, fixture.target.y);
            let mismatches = 0;
            let maxError = 0;
            for (let cell = 0; cell < cols * rows; cell++) {
                const error = Math.abs(incremental[cell] - referenceWorld.ambientIllumination[cell]);
                if (error > 1e-5) mismatches++;
                maxError = Math.max(maxError, error);
            }
            results.push({ name: fixture.name, expected: fixture.expected, settledValue, mismatches, maxError });
        }
        return results;
    });

    for (const result of comparisons) {
        expect(result.settledValue, `${result.name}: expected visibility value`).toBe(result.expected);
        expect(result.mismatches, `${result.name}: every incremental cell matches the full reference`).toBe(0);
        expect(result.maxError, `${result.name}: field values agree within floating-point tolerance`).toBeLessThanOrEqual(1e-5);
    }
});
