import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { canvasPoint, scrollCanvasToCell } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page);
});

async function clickCell(page, cell) {
    const point = await canvasPoint(page, cell);
    await page.mouse.click(point.x, point.y);
}

async function seedStorage(page, { machine, material, count = 3, cell = { x: 30, y: 30 } }) {
    return page.evaluate(async ({ machine, material, count, cell }) => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        physics.clearWorld();
        physics.setCell(cell.x, cell.y, id(machine));
        const inventory = physics.getWorld();
        const at = physics.index(cell.x, cell.y);
        inventory.storageType[at] = id(material);
        inventory.storageCount[at] = count;
        return { id: id(machine), material: id(material), cell };
    }, { machine, material, count, cell });
}

test('storage dialogs show inventory, capacity, category, and purge behavior', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    for (const [machine, material, category] of [
        ['Powder Storage Bin', 'Sand', 'powder'],
        ['Liquid Storage Bin', 'Water', 'liquid'],
        ['Gas Storage Bin', 'Steam', 'gas']
    ]) {
        const cell = machine === 'Powder Storage Bin'
            ? { x: 14, y: 18 }
            : machine === 'Liquid Storage Bin' ? { x: 24, y: 18 } : { x: 34, y: 18 };
        await seedStorage(page, { machine, material, cell });
        await game.step(0);
        await clickCell(page, cell);
        const dialog = page.locator('#machineDialog');
        await expect(dialog).toBeVisible();
        await expect(page.locator('#machineDialogTitle')).toHaveText(`${machine} contents`);
        await expect(page.locator('#machineDialogDescription')).toContainText(`one ${category} type`);
        await expect(page.locator('#machineDialogStorageSummary')).toContainText(`3/500 ${material}`);
        await expect(page.locator('#machineDialogPurge')).toBeVisible();
        await page.locator('#machineDialogPurge').click();
        await expect(page.locator('#purgeDialog')).toBeVisible();
        await page.locator('#purgeDialogCancel').click();
        await expect(page.locator('#purgeDialog')).toBeHidden();
        await page.locator('#machineDialogPurge').click();
        await page.locator('#purgeDialogConfirm').click();
        await expect(dialog).toBeHidden();
        await clickCell(page, cell);
        await expect(page.locator('#machineDialogStorageSummary')).toContainText(/0\/500 empty/i);
        await page.locator('#machineDialogCancel').click();
    }
});

test('storage bins reject loose world intake and only accept compatible Tubing payloads', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const looseWorld = [];
        for (const [machine, material] of [
            ['Powder Storage Bin', 'Sand'], ['Liquid Storage Bin', 'Water'], ['Gas Storage Bin', 'Steam']
        ]) {
            physics.clearWorld();
            const bin = { x: 30, y: 30 };
            physics.setCell(bin.x, bin.y, id(machine));
            physics.getWorld().data[physics.index(bin.x, bin.y)] = 3;
            physics.setCell(bin.x, bin.y - 2, id(material));
            physics.setCell(bin.x, bin.y - 3, id(material));
            physics.stepSimulation();
            looseWorld.push({ machine, inventory: physics.getStorageInventory(bin.x, bin.y) });
        }

        const tubingRoutes = [];
        const cases = [
            ['Powder Storage Bin', 'Powder Storage Bin', 'Sand', true],
            ['Liquid Storage Bin', 'Liquid Storage Bin', 'Water', true],
            ['Gas Storage Bin', 'Gas Storage Bin', 'Steam', true],
            ['Powder Storage Bin', 'Liquid Storage Bin', 'Sand', false],
            ['Liquid Storage Bin', 'Powder Storage Bin', 'Water', false],
            ['Gas Storage Bin', 'Powder Storage Bin', 'Steam', false]
        ];
        for (const [sourceName, receiverName, materialName, expected] of cases) {
            physics.clearWorld();
            const source = { x: 20, y: 30 };
            const receiver = { x: 40, y: 30 };
            physics.setCell(source.x, source.y, id(sourceName));
            physics.setCell(receiver.x, receiver.y, id(receiverName));
            const out = physics.getMachinePorts(source.x, source.y).find(port => port.role === 'output');
            const input = physics.getMachinePorts(receiver.x, receiver.y).find(port => port.role === 'input');
            const start = out.connectionCell;
            const end = input.connectionCell;
            const turnX = end.x - 2;
            for (let x = start.x; x <= turnX; x++) physics.setCell(x, start.y, id('Tubing'));
            for (let y = start.y - 1; y >= end.y; y--) physics.setCell(turnX, y, id('Tubing'));
            for (let x = turnX + 1; x <= end.x; x++) physics.setCell(x, end.y, id('Tubing'));
            const sourceIndex = physics.index(source.x, source.y);
            physics.getWorld().storageType[sourceIndex] = id(materialName);
            physics.getWorld().storageCount[sourceIndex] = 20;
            for (let frame = 0; frame < 60; frame++) physics.stepSimulation();
            tubingRoutes.push({ sourceName, receiverName, materialName, expected,
                received: physics.getStorageInventory(receiver.x, receiver.y).count,
                retained: physics.getStorageInventory(source.x, source.y).count });
        }
        return { looseWorld, tubingRoutes };
    });
    expect(result.looseWorld.every(item => item.inventory.count === 0),
        'no Storage Bin collects loose world material').toBe(true);
    expect(result.tubingRoutes.filter(item => item.expected).every(item => item.received > 0),
        'each Storage Bin accepts compatible Tubing payloads').toBe(true);
    expect(result.tubingRoutes.filter(item => !item.expected).every(item => item.received === 0),
        'each Storage Bin rejects incompatible Tubing payloads').toBe(true);
    await game.step(0);
});

test('Collector suction feeds a compatible Storage Bin through its exact Tubing output', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        physics.clearWorld();
        const collector = { x: 20, y: 30 };
        const receiver = { x: 50, y: 30 };
        physics.setCell(collector.x, collector.y, id('Collector'));
        physics.getWorld().data[physics.index(collector.x, collector.y)] = 3;
        const front = [0, 1];
        const collectorBoundary = { x: collector.x - front[0] * 7, y: collector.y - front[1] * 7 };
        const upstreamWater = { x: collectorBoundary.x - front[0], y: collectorBoundary.y - front[1] };
        physics.setCell(upstreamWater.x, upstreamWater.y, id('Sand'));
        physics.setCell(receiver.x, receiver.y, id('Powder Storage Bin'));
        const collectorIndex = physics.index(collector.x, collector.y);
        const receiverIndex = physics.index(receiver.x, receiver.y);
        physics.stepSimulation();
        const collectedBeforeRoute = physics.getStorageInventory(collector.x, collector.y);
        const looseAfterCollection = physics.getWorld().type[physics.index(upstreamWater.x, upstreamWater.y)];

        const output = physics.getMachinePorts(collector.x, collector.y).find(port => port.role === 'output');
        const input = physics.getMachinePorts(receiver.x, receiver.y).find(port => port.role === 'input');
        const from = output.connectionCell;
        const to = input.connectionCell;
        const waypointX = to.x + 4;
        let x = from.x;
        let y = from.y;
        const paint = (nextX, nextY) => {
            while (x !== nextX || y !== nextY) {
                x += Math.sign(nextX - x);
                y += Math.sign(nextY - y);
                physics.setCell(x, y, id('Tubing'));
            }
        };
        physics.setCell(from.x, from.y, id('Tubing'));
        paint(waypointX, from.y);
        paint(waypointX, to.y);
        paint(to.x, to.y);
        physics.stepSimulation();
        const routeExists = physics.getTubingFlows().some(flow =>
            flow.source === collectorIndex && flow.destination === receiverIndex && flow.material === id('Sand'));
        for (let frame = 0; frame < 59; frame++) physics.stepSimulation();

        const collectorAfter = physics.getStorageInventory(collector.x, collector.y);
        const receiverAfter = physics.getStorageInventory(receiver.x, receiver.y);
        const looseSand = physics.getWorld().type.reduce((total, type) => total + (type === id('Sand') ? 1 : 0), 0);
        return {
            collectedBeforeRoute, looseAfterCollection, routeExists,
            collectorAfter, receiverAfter, looseSand,
            conserved: collectorAfter.count + receiverAfter.count + looseSand
        };
    });
    expect(result.collectedBeforeRoute.type).toBeGreaterThan(0);
    expect(result.collectedBeforeRoute.count).toBe(1);
    expect(result.looseAfterCollection).toBe(0);
    expect(result.routeExists, 'Collector output attaches at its declared rotated anchor').toBe(true);
    expect(result.receiverAfter.type).toBeGreaterThan(0);
    expect(result.receiverAfter.count).toBe(1);
    expect(result.collectorAfter.count).toBe(0);
    expect(result.looseSand).toBe(0);
    expect(result.conserved, 'Collector and Storage Bin conserve collected material').toBe(1);
    await game.step(0);
});

test('Collector accepts intake material and seals full-buffer side leaks in all rotations', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const sealResults = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const vectors = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [-1, 1], [1, 1]];
        const results = [];
        const suctionResults = [];
        for (let direction = 0; direction < vectors.length; direction++) {
            for (const materialName of ['Sand', 'Water', 'Steam']) {
                physics.clearWorld();
                const machine = { x: 60, y: 55 };
                physics.setCell(machine.x, machine.y, id('Collector'));
                const world = physics.getWorld();
                const machineIndex = physics.index(machine.x, machine.y);
                world.data[machineIndex] = direction;
                const [frontX, frontY] = vectors[direction];
                const barrierDistance = frontX !== 0 && frontY !== 0 ? 5 : 7;
                physics.setCell(machine.x - (barrierDistance + 1) * frontX,
                    machine.y - (barrierDistance + 1) * frontY, id(materialName));
                physics.setCell(machine.x - (barrierDistance + 2) * frontX,
                    machine.y - (barrierDistance + 2) * frontY, id(materialName));
                physics.stepSimulation();
                const inventory = physics.getStorageInventory(machine.x, machine.y);
                const output = physics.getMachinePorts(machine.x, machine.y)
                    .find(port => port.role === 'output');
                suctionResults.push({ direction, materialName, inventory,
                    output: output && { role: output.role, material: output.material,
                        connectionCell: output.connectionCell } });
            }
            for (const materialName of ['Sand', 'Water']) {
                physics.clearWorld();
                const machine = { x: 60, y: 55 };
                physics.setCell(machine.x, machine.y, id('Collector'));
                const world = physics.getWorld();
                const machineIndex = physics.index(machine.x, machine.y);
                world.data[machineIndex] = direction;
                world.storageType[machineIndex] = id('Ash');
                world.storageCount[machineIndex] = 100;
                const [frontX, frontY] = vectors[direction];
                const tangentX = -frontY;
                const tangentY = frontX;
                const barrierDistance = frontX !== 0 && frontY !== 0 ? 5 : 7;
                const halfWidth = frontX !== 0 && frontY !== 0 ? 3 : 5;
                const barrierX = machine.x - frontX * barrierDistance;
                const barrierY = machine.y - frontY * barrierDistance;
                const rimId = id('Glass');
                for (const side of [-1, 1]) {
                    const offset = side * halfWidth;
                    physics.setCell(barrierX + tangentX * offset, barrierY + tangentY * offset, rimId);
                    physics.setCell(barrierX - frontX + tangentX * offset,
                        barrierY - frontY + tangentY * offset, id(materialName));
                }
                for (let frame = 0; frame < 24; frame++) physics.stepSimulation();
                let materialCount = 0;
                let leakedToFrontSide = 0;
                const materialId = id(materialName);
                for (let i = 0; i < world.type.length; i++) {
                    if (world.type[i] === materialId) materialCount++;
                }
                for (let distance = 1; distance <= 4; distance++) {
                    for (let offset = -halfWidth - 1; offset <= halfWidth + 1; offset++) {
                        const x = machine.x + frontX * distance + tangentX * offset;
                        const y = machine.y + frontY * distance + tangentY * offset;
                        if (x < 0 || y < 0 || x >= world.cols || y >= world.rows) continue;
                        if (world.type[physics.index(x, y)] === materialId) leakedToFrontSide++;
                    }
                }
                results.push({ direction, materialName, materialCount,
                    buffered: world.storageCount[machineIndex], leakedToFrontSide });
            }
        }
        return { suctionResults, leakResults: results };
    });
    expect(sealResults.suctionResults.every(result => result.inventory.type > 0 &&
        result.inventory.count === 2 && result.output?.role === 'output' && result.output.material === 'Tubing'),
    'the open central intake and rotated output remain available for every facing').toBe(true);
    expect(sealResults.leakResults.every(result => result.materialCount === 2 && result.buffered === 100),
        'side probes remain present in the world while full storage prevents suction').toBe(true);
    expect(sealResults.leakResults.filter(result => result.leakedToFrontSide > 0),
        'powder and liquid must not emerge through either side, including diagonal facings').toEqual([]);
    await game.step(0);
});

test('Glass paints transparent machine artwork pixels, protects opaque pixels, and seals Collector water in all facings', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.getByRole('button', { name: 'Glass', exact: true }).click();

    const machines = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        return physics.getDefinitions().flatMap((definition, id) => definition?.machine
            ? [{ name: definition.name, machine: definition.machine, id }]
            : []);
    });
    expect(machines.length, 'the alpha hit mask covers every registered machine artwork').toBeGreaterThan(0);

    const checkFacing = async (machine, direction) => {
        const cell = { x: 60, y: 55 };
        await page.evaluate(async ({ machine, direction, cell }) => {
            const physics = await import('/physics.js');
            physics.clearWorld();
            physics.setCell(cell.x, cell.y, machine.id);
            physics.getWorld().data[physics.index(cell.x, cell.y)] = direction;
        }, { machine, direction, cell });
        await game.step(0);

        const targets = await page.evaluate(async ({ machine, direction, cell }) => {
            const physics = await import('/physics.js');
            const game = await import('/game.js');
            const canvas = document.querySelector('#canvas');
            const rect = canvas.getBoundingClientRect();
            const cellWidth = rect.width / canvas.width;
            const cellHeight = rect.height / canvas.height;
            const icon = document.querySelector(`#machineOverlay .machine-${machine.machine}`);
            const frame = icon?.querySelector(':scope > svg');
            if (!frame) throw new Error(`No artwork frame for ${machine.name}`);

            const image = frame.querySelector('image');
            let alphaAt = null;
            if (image) {
                const response = await fetch('/resources/icons.png');
                const bitmap = await createImageBitmap(await response.blob());
                const sampleCanvas = document.createElement('canvas');
                sampleCanvas.width = bitmap.width;
                sampleCanvas.height = bitmap.height;
                const context = sampleCanvas.getContext('2d', { willReadFrequently: true });
                context.drawImage(bitmap, 0, 0);
                const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
                bitmap.close();
                alphaAt = (x, y) => {
                    const px = Math.floor(x);
                    const py = Math.floor(y);
                    if (px < 0 || py < 0 || px >= sampleCanvas.width || py >= sampleCanvas.height) return null;
                    return pixels.data[(py * sampleCanvas.width + px) * 4 + 3];
                };
            }
            const shapes = [...frame.querySelectorAll('*')];
            const isOpaque = (screenX, screenY) => {
                if (image) {
                    const local = new DOMPoint(screenX, screenY).matrixTransform(frame.getScreenCTM().inverse());
                    return (alphaAt(local.x, local.y) ?? 0) > 0;
                }
                return shapes.some(shape => {
                    const point = new DOMPoint(screenX, screenY).matrixTransform(shape.getScreenCTM().inverse());
                    const style = getComputedStyle(shape);
                    const fillVisible = style.fill !== 'none' && Number(style.fillOpacity) > 0 &&
                        Number(style.opacity) > 0 && shape.isPointInFill(point);
                    const strokeVisible = style.stroke !== 'none' && Number(style.strokeOpacity) > 0 &&
                        Number(style.opacity) > 0 && shape.isPointInStroke(point);
                    return fillVisible || strokeVisible;
                });
            };

            const directions = [[1, 0], [-1, 0], [0, -1], [0, 1],
                [1, -1], [-1, -1], [-1, 1], [1, 1]];
            const [frontX, frontY] = directions[direction];
            const tangentX = -frontY;
            const tangentY = frontX;
            const guardrailTarget = { x: cell.x + frontX * 2 + tangentX * 2,
                y: cell.y + frontY * 2 + tangentY * 2 };
            const viewBox = frame.viewBox.baseVal;
            const candidates = [];
            const radiusX = Math.ceil(32 / cellWidth) + 1;
            const radiusY = Math.ceil(32 / cellHeight) + 1;
            for (let y = Math.max(0, cell.y - radiusY); y <= Math.min(canvas.height - 1, cell.y + radiusY); y++) {
                for (let x = Math.max(0, cell.x - radiusX); x <= Math.min(canvas.width - 1, cell.x + radiusX); x++) {
                    if (x === cell.x && y === cell.y) continue;
                    const screenX = rect.left + (x + 0.5) * cellWidth;
                    const screenY = rect.top + (y + 0.5) * cellHeight;
                    const local = new DOMPoint(screenX, screenY).matrixTransform(frame.getScreenCTM().inverse());
                    if (local.x < viewBox.x || local.y < viewBox.y ||
                        local.x >= viewBox.x + viewBox.width || local.y >= viewBox.y + viewBox.height) continue;
                    const opaque = isOpaque(screenX, screenY);
                    const anchorDistance = Math.hypot(x - guardrailTarget.x, y - guardrailTarget.y);
                    candidates.push({ x, y, screenX, screenY, opaque,
                        centreDistance: Math.hypot(x - cell.x, y - cell.y), anchorDistance });
                }
            }
            const output = machine.machine === 'collector'
                ? physics.getMachinePorts(cell.x, cell.y).find(port => port.role === 'output')?.connectionCell
                : null;
            const intake = machine.machine === 'collector'
                ? { x: cell.x - frontX, y: cell.y - frontY } : null;
            const allowed = candidate => (!output || candidate.x !== output.x || candidate.y !== output.y) &&
                (!intake || candidate.x !== intake.x || candidate.y !== intake.y);
            const outsideMachineInteraction = candidate =>
                !game.getMachineArtworkAtClientPoint(candidate.screenX, candidate.screenY);
            const transparent = candidates.filter(candidate => !candidate.opaque && allowed(candidate) &&
                outsideMachineInteraction(candidate))
                .sort((a, b) => (machine.machine === 'collector' ? a.anchorDistance - b.anchorDistance :
                    a.centreDistance - b.centreDistance))[0];
            const guardedTransparent = machine.machine === 'collector'
                ? candidates.filter(candidate => !candidate.opaque && allowed(candidate) &&
                    !physics.isCollectorRimCell(candidate.x, candidate.y) && outsideMachineInteraction(candidate))
                    .sort((a, b) => a.anchorDistance - b.anchorDistance)[0]
                : transparent;
            const opaque = candidates.filter(candidate => candidate.opaque && allowed(candidate))
                .sort((a, b) => a.centreDistance - b.centreDistance)[0];
            if (!guardedTransparent || !opaque) throw new Error(`Could not find transparent and opaque pixels for ${machine.name}`);
            return { transparent: guardedTransparent, opaque, guardrailTarget, output, intake,
                glassId: physics.getDefinitions().findIndex(definition => definition?.name === 'Glass') };
        }, { machine, direction, cell });

        await page.mouse.click(targets.transparent.screenX, targets.transparent.screenY);
        await page.mouse.click(targets.opaque.screenX, targets.opaque.screenY);
        const painted = await page.evaluate(async ({ machine, targets }) => {
            const physics = await import('/physics.js');
            const world = physics.getWorld();
            return {
                transparent: world.type[physics.index(targets.transparent.x, targets.transparent.y)],
                opaque: world.type[physics.index(targets.opaque.x, targets.opaque.y)],
                intake: targets.intake && world.type[physics.index(targets.intake.x, targets.intake.y)],
                output: targets.output && world.type[physics.index(targets.output.x, targets.output.y)],
                collectorId: machine.id
            };
        }, { machine, targets });
        expect(painted.transparent, `${machine.name} direction ${direction}: transparent artwork pixel accepts Glass`)
            .toBe(targets.glassId);
        expect(painted.opaque, `${machine.name} direction ${direction}: opaque artwork pixel stays protected`)
            .not.toBe(targets.glassId);

        if (!await page.locator('#machineDialog').isHidden()) {
            await page.locator('#machineDialogCancel').click();
        }

        if (machine.machine === 'collector') {
            const water = await page.evaluate(async ({ cell, direction, guardrail }) => {
                const physics = await import('/physics.js');
                const world = physics.getWorld();
                const collector = cell.y * world.cols + cell.x;
                const directions = [[1, 0], [-1, 0], [0, -1], [0, 1],
                    [1, -1], [-1, -1], [-1, 1], [1, 1]];
                const [frontX, frontY] = directions[direction];
                const tangentX = -frontY;
                const tangentY = frontX;
                const waterId = physics.getDefinitions().findIndex(definition => definition?.name === 'Water');
                const ashId = physics.getDefinitions().findIndex(definition => definition?.name === 'Ash');
                world.storageType[collector] = ashId;
                world.storageCount[collector] = 100;
                let inside = null;
                for (let distance = 1; distance <= 4 && !inside; distance++) {
                    const x = guardrail.x - frontX * distance;
                    const y = guardrail.y - frontY * distance;
                    if (physics.getWorld().type[physics.index(x, y)] === 0) inside = { x, y };
                }
                if (!inside) throw new Error('No clear interior probe cell beside the painted Collector guardrail.');
                physics.setCell(inside.x, inside.y, waterId);
                for (let frame = 0; frame < 24; frame++) physics.stepSimulation();
                let count = 0;
                let escaped = 0;
                for (let i = 0; i < world.type.length; i++) if (world.type[i] === waterId) count++;
                for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) {
                    const x = guardrail.x + dx;
                    const y = guardrail.y + dy;
                    if (x < 0 || y < 0 || x >= world.cols || y >= world.rows) continue;
                    const relativeX = x - guardrail.x;
                    const relativeY = y - guardrail.y;
                    const depth = relativeX * frontX + relativeY * frontY;
                    const lateral = relativeX * tangentX + relativeY * tangentY;
                    if (depth > 0 && Math.abs(lateral) <= 4 &&
                        world.type[physics.index(x, y)] === waterId) escaped++;
                }
                return { count, escaped, buffer: world.storageCount[collector],
                    guardrail: world.type[physics.index(guardrail.x, guardrail.y)] };
            }, { cell, direction, guardrail: targets.transparent });
            expect(water.guardrail, `Collector direction ${direction} keeps the UI-painted guardrail in place`)
                .toBe(targets.glassId);
            expect(water.count, `Collector direction ${direction} conserves its water probe`).toBe(1);
            expect(water.escaped, `Collector direction ${direction} contains water behind the UI-painted transparent guardrail`)
                .toBe(0);
            expect(water.buffer, `Collector direction ${direction} remains full during the containment probe`).toBe(100);
            expect(painted.intake, `Collector direction ${direction} keeps its central intake open`).toBe(0);
            expect(painted.output, `Collector direction ${direction} keeps its Tubing output anchor open`).toBe(0);
        }
    };

    const collector = machines.find(entry => entry.machine === 'collector');
    expect(collector, 'Collector is a registered machine artwork').toBeTruthy();
    for (let direction = 0; direction < 8; direction++) await checkFacing(collector, direction);
    for (const machine of machines.filter(entry => entry.machine !== 'collector')) {
        await checkFacing(machine, 0);
    }
    await game.step(0);
});

// The earlier open-reservoir baseline crossed the y=68 artwork boundary in frame 1
// at full capacity: Water (125,67) -> (125,68), inventory 100/100. Keep that
// observation as the historical comparison for this UI-sealed chamber case.
test('zoomed full Collector keeps UI-poured Water above its first drawn row', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await game.seed(31415);

    const collector = { x: 130, y: 75 };
    await page.evaluate(async collector => {
        const physics = await import('/physics.js');
        const id = physics.getDefinitions().findIndex(definition => definition?.name === 'Collector');
        physics.clearWorld();
        physics.setCell(collector.x, collector.y, id);
        physics.getWorld().data[physics.index(collector.x, collector.y)] = 3;
    }, collector);
    await game.step(0);

    const area = await page.locator('#canvasArea').boundingBox();
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
    await page.mouse.wheel(0, -120);
    await expect(page.locator('#canvasArea')).toHaveAttribute('data-zoom-level', '2');
    await scrollCanvasToCell(page, collector);
    await game.step(0);

    const boundary = await page.evaluate(async ({ collector }) => {
        const physics = await import('/physics.js');
        const game = await import('/game.js');
        const canvas = document.querySelector('#canvas');
        const rect = canvas.getBoundingClientRect();
        const cellWidth = rect.width / canvas.width;
        const cellHeight = rect.height / canvas.height;
        const frame = document.querySelector('#machineOverlay .machine-collector > svg');
        if (!frame) throw new Error('Collector artwork is not rendered at zoom level 2.');
        const matrix = frame.getScreenCTM();
        const viewBox = frame.viewBox.baseVal;
        const shapes = [...frame.querySelectorAll('*')];
        const pointAt = (x, y) => ({
            x: rect.left + (x + 0.5) * cellWidth,
            y: rect.top + (y + 0.5) * cellHeight
        });
        const artworkAt = (x, y) => {
            const screen = pointAt(x, y);
            const local = new DOMPoint(screen.x, screen.y).matrixTransform(matrix.inverse());
            const inside = local.x >= viewBox.x && local.y >= viewBox.y &&
                local.x < viewBox.x + viewBox.width && local.y < viewBox.y + viewBox.height;
            const opaque = inside && shapes.some(shape => {
                const style = getComputedStyle(shape);
                const point = new DOMPoint(screen.x, screen.y).matrixTransform(shape.getScreenCTM().inverse());
                const fill = style.fill !== 'none' && Number(style.fillOpacity || 1) > 0 &&
                    Number(style.opacity || 1) > 0 && shape.isPointInFill(point);
                const stroke = style.stroke !== 'none' && Number(style.strokeOpacity || 1) > 0 &&
                    Number(style.opacity || 1) > 0 && shape.isPointInStroke(point);
                return fill || stroke;
            });
            return { inside, opaque };
        };

        const frameRect = frame.getBoundingClientRect();
        const firstX = Math.max(0, Math.floor((frameRect.left - rect.left) / cellWidth) - 1);
        const lastX = Math.min(canvas.width - 1, Math.ceil((frameRect.right - rect.left) / cellWidth) + 1);
        const firstY = Math.max(0, Math.floor((frameRect.top - rect.top) / cellHeight) - 1);
        const lastY = Math.min(canvas.height - 1, Math.ceil((frameRect.bottom - rect.top) / cellHeight) + 1);
        const artworkCells = [];
        for (let y = firstY; y <= lastY; y++) for (let x = firstX; x <= lastX; x++) {
            if (artworkAt(x, y).opaque) artworkCells.push({ x, y });
        }
        if (!artworkCells.length) throw new Error('Could not map Collector artwork onto world cell centers.');
        const xBounds = {
            min: Math.min(...artworkCells.map(cell => cell.x)),
            max: Math.max(...artworkCells.map(cell => cell.x))
        };
        const firstDrawnRow = Math.min(...artworkCells.map(cell => cell.y));
        const gameInstance = game;
        const output = physics.getMachinePorts(collector.x, collector.y).find(port => port.role === 'output')?.connectionCell;
        const source = { x: collector.x, y: firstDrawnRow - 1 };
        const intake = { x: source.x, y: firstDrawnRow };
        const sourceScreen = pointAt(source.x, source.y);
        if (gameInstance.getMachineArtworkAtClientPoint(sourceScreen.x, sourceScreen.y)) {
            throw new Error('The upstream opening above the Collector first drawn row is not UI-paintable.');
        }
        const railTop = firstDrawnRow - 21;
        const railBottom = collector.y + 12;
        const rails = [
            { from: { x: xBounds.min - 1, y: railTop }, to: { x: xBounds.min - 1, y: railBottom } },
            { from: { x: xBounds.max + 1, y: railTop }, to: { x: xBounds.max + 1, y: railBottom } },
            { from: { x: xBounds.min - 1, y: firstDrawnRow - 1 },
                to: { x: source.x - 1, y: firstDrawnRow - 1 } },
            { from: { x: source.x + 1, y: firstDrawnRow - 1 },
                to: { x: xBounds.max + 1, y: firstDrawnRow - 1 } }
        ];
        const transparentOverlayRailCells = [];
        for (const rail of rails.slice(0, 2)) {
            for (let y = rail.from.y; y <= rail.to.y; y++) {
                const cell = { x: rail.from.x, y };
                if (artworkAt(cell.x, cell.y).inside && !artworkAt(cell.x, cell.y).opaque) {
                    transparentOverlayRailCells.push(cell);
                }
            }
        }
        return {
            artworkCells,
            xBounds,
            firstDrawnRow,
            source,
            sources: [source],
            intake,
            output,
            rails,
            transparentOverlayRailCells,
            waterId: physics.getDefinitions().findIndex(definition => definition?.name === 'Water')
        };
    }, { collector });

    await page.getByRole('button', { name: 'Glass', exact: true }).click();
    await page.getByRole('button', { name: 'Rectangle mode' }).click();
    for (const rail of boundary.rails) {
        const from = await canvasPoint(page, rail.from);
        const to = await canvasPoint(page, rail.to);
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 8 });
        await page.mouse.up();
    }
    const paintedSeal = await page.evaluate(async ({ boundary }) => {
        const physics = await import('/physics.js');
        const glassId = physics.getDefinitions().findIndex(definition => definition?.name === 'Glass');
        const world = physics.getWorld();
        const railCells = [];
        for (const rail of boundary.rails.slice(0, 2)) for (let y = rail.from.y; y <= rail.to.y; y++) {
            railCells.push({ x: rail.from.x, y });
        }
        for (const rail of boundary.rails.slice(2)) for (let x = rail.from.x; x <= rail.to.x; x++) {
            railCells.push({ x, y: rail.from.y });
        }
        return {
            glassId,
            misses: railCells.filter(cell => world.type[physics.index(cell.x, cell.y)] !== glassId),
            source: world.type[physics.index(boundary.source.x, boundary.source.y)],
            intake: world.type[physics.index(boundary.intake.x, boundary.intake.y)]
        };
    }, { boundary });
    expect(boundary.transparentOverlayRailCells.length,
        'the sealed chamber includes a UI-painted guardrail cell inside the transparent Collector overlay')
        .toBeGreaterThan(0);
    expect(paintedSeal.misses, 'the UI paints both chamber walls and split bottom segments through transparent pixels')
        .toEqual([]);
    expect(paintedSeal.source, 'the central source opening remains clear above the drawn top row').toBe(0);
    expect(paintedSeal.intake, 'the first drawn row stays open as the Collector intake boundary').toBe(0);

    const clearPorts = await page.evaluate(async ({ collector, boundary }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        return {
            intake: world.type[physics.index(boundary.intake.x, boundary.intake.y)],
            output: world.type[physics.index(boundary.output.x, boundary.output.y)],
            machine: world.type[physics.index(collector.x, collector.y)]
        };
    }, { collector, boundary });
    expect(clearPorts.machine).toBeGreaterThan(0);
    expect(clearPorts.intake, 'the central opening at the first drawn row remains clear').toBe(0);
    expect(clearPorts.output, 'the rotated Tubing output remains open').toBe(0);

    await page.getByRole('button', { name: 'Water', exact: true }).click();
    await clickCell(page, boundary.source);
    const topSeed = await page.evaluate(async ({ collector, boundary }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        return { placed: world.type[physics.index(boundary.source.x, boundary.source.y)] === boundary.waterId,
            inventory: physics.getStorageInventory(collector.x, collector.y) };
    }, { collector, boundary });
    expect(topSeed.placed, 'Water is placed by the UI immediately upstream of the drawn top row').toBe(true);
    await game.step(12);
    const topIntake = await page.evaluate(async collector => {
        const physics = await import('/physics.js');
        return physics.getStorageInventory(collector.x, collector.y);
    }, collector);
    expect(topIntake.count, 'a non-full Collector sucks Water entering through the top intake').toBe(1);

    await page.evaluate(async ({ collector, waterId }) => {
        const physics = await import('/physics.js');
        const index = physics.index(collector.x, collector.y);
        physics.getWorld().storageType[index] = waterId;
        physics.getWorld().storageCount[index] = 99;
    }, { collector, waterId: boundary.waterId });
    await clickCell(page, boundary.source);
    await game.step(12);
    const fullAfterTopIntake = await page.evaluate(async collector => {
        const physics = await import('/physics.js');
        return physics.getStorageInventory(collector.x, collector.y);
    }, collector);
    expect(fullAfterTopIntake.count, 'top-edge intake fills the final available capacity').toBe(100);
    expect(fullAfterTopIntake.type).toBe(boundary.waterId);

    const reservoir = {
        from: { x: boundary.xBounds.min, y: boundary.firstDrawnRow - 20 },
        to: { x: boundary.xBounds.max, y: boundary.firstDrawnRow - 2 }
    };
    await page.getByRole('button', { name: 'Rectangle mode' }).click();
    const from = await canvasPoint(page, reservoir.from);
    const to = await canvasPoint(page, reservoir.to);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();

    const initial = await page.evaluate(async ({ collector, boundary }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const waterCount = world.type.reduce((count, type) => count + (type === boundary.waterId ? 1 : 0), 0);
        const index = physics.index(collector.x, collector.y);
        return { waterCount, inventory: physics.getStorageInventory(collector.x, collector.y),
            total: waterCount + world.storageCount[index] };
    }, { collector, boundary });
    expect(initial.waterCount, 'the UI-poured reservoir contains overflow above the Collector').toBeGreaterThan(100);
    expect(initial.inventory.count).toBe(100);

    const overflow = await page.evaluate(async ({ collector, boundary }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const canvas = document.querySelector('#canvas');
        const rect = canvas.getBoundingClientRect();
        const cellWidth = rect.width / canvas.width;
        const cellHeight = rect.height / canvas.height;
        const screenPoint = cell => ({
            x: rect.left + (cell.x + 0.5) * cellWidth,
            y: rect.top + (cell.y + 0.5) * cellHeight
        });
        const waterCells = () => {
            const cells = [];
            for (let y = 0; y < world.rows; y++) for (let x = 0; x < world.cols; x++) {
                if (world.type[physics.index(x, y)] === boundary.waterId) cells.push({ x, y });
            }
            return cells;
        };
        const firstRowWater = boundary.artworkCells.filter(cell => cell.y === boundary.firstDrawnRow);
        let previous = waterCells();
        const firstCrossings = [];
        for (let frame = 1; frame <= 300; frame++) {
            physics.stepSimulation();
            const current = waterCells();
            const previousSet = new Set(previous.map(cell => `${cell.x},${cell.y}`));
            for (const after of current) {
                if (after.y < boundary.firstDrawnRow || after.y > collector.y + 12 ||
                    after.x < boundary.xBounds.min || after.x > boundary.xBounds.max ||
                    previousSet.has(`${after.x},${after.y}`)) continue;
                const before = previous
                    .filter(cell => Math.abs(cell.x - after.x) <= 1 && Math.abs(cell.y - after.y) <= 1)
                    .sort((a, b) => Math.hypot(a.x - after.x, a.y - after.y) -
                        Math.hypot(b.x - after.x, b.y - after.y))[0] ?? null;
                if (firstCrossings.length < 12) firstCrossings.push({
                    frame,
                    particleId: null,
                    particleIdNote: 'The public simulation API exposes cell occupancy but no stable particle IDs.',
                    type: physics.getDefinitions()[boundary.waterId]?.name,
                    before,
                    after,
                    move: before ? { dx: after.x - before.x, dy: after.y - before.y,
                        diagonal: after.x !== before.x && after.y !== before.y } : null,
                    screen: { before: before && screenPoint(before), after: screenPoint(after) },
                    artworkBoundary: {
                        firstDrawnRow: boundary.firstDrawnRow,
                        rowArtworkCells: firstRowWater,
                        collector: { ...collector, direction: world.data[physics.index(collector.x, collector.y)] & 7 }
                    },
                    inventory: physics.getStorageInventory(collector.x, collector.y),
                    virtualMaskApis: {
                        storageBarrier: typeof physics.isStorageBarrierCell === 'function',
                        collectorSeal: typeof physics.isCollectorSealCell === 'function',
                        collectorRim: typeof physics.isCollectorRimCell === 'function'
                    },
                    virtualMaskMembership: before ? {
                        storageBarrierBefore: typeof physics.isStorageBarrierCell === 'function'
                            ? physics.isStorageBarrierCell(before.x, before.y) : null,
                        storageBarrierAfter: typeof physics.isStorageBarrierCell === 'function'
                            ? physics.isStorageBarrierCell(after.x, after.y) : null,
                        collectorSealBefore: typeof physics.isCollectorSealCell === 'function'
                            ? physics.isCollectorSealCell(before.x, before.y) : null,
                        collectorSealAfter: typeof physics.isCollectorSealCell === 'function'
                            ? physics.isCollectorSealCell(after.x, after.y) : null
                    } : null
                });
            }
            previous = current;
        }
        const water = [];
        water.push(...waterCells());
        const machine = physics.index(collector.x, collector.y);
        const topRow = boundary.firstDrawnRow;
        const belowFirstDrawnRow = water.filter(cell => cell.y >= topRow && cell.y <= collector.y + 12 &&
            cell.x >= boundary.xBounds.min && cell.x <= boundary.xBounds.max);
        const behindFirstRow = water.filter(cell => cell.y >= topRow &&
            cell.x >= boundary.xBounds.min && cell.x <= boundary.xBounds.max);
        const waterOnArtwork = water.filter(cell => boundary.artworkCells.some(art =>
            art.x === cell.x && art.y === cell.y));
        const waterDownFlanks = water.filter(cell => cell.y >= topRow &&
            Math.abs(cell.x - collector.x) > 0 &&
            cell.x >= boundary.xBounds.min - 2 && cell.x <= boundary.xBounds.max + 2);
        const outputWater = world.type[physics.index(boundary.output.x, boundary.output.y)] === boundary.waterId;
        return {
            inventory: physics.getStorageInventory(collector.x, collector.y),
            worldWater: water.length,
            total: water.length + world.storageCount[machine],
            belowFirstDrawnRow,
            behindFirstRow,
            waterOnArtwork,
            waterDownFlanks,
            outputWater,
            waterPositions: water.slice(0, 30),
            firstCrossings: firstCrossings.slice(0, 12)
        };
    }, { collector, boundary });
    expect(overflow.inventory.type).toBe(boundary.waterId);
    expect(overflow.inventory.count, 'the Collector remains full after 300 overflow frames').toBe(100);
    expect(overflow.total, 'Water is conserved between the world and Collector inventory').toBe(initial.total);
    expect(overflow.belowFirstDrawnRow,
        `no Water crosses the Collector's first drawn top-funnel row at y=${boundary.firstDrawnRow}; ` +
            `crossings=${JSON.stringify(overflow.firstCrossings)}`)
        .toHaveLength(0);
    expect(overflow.behindFirstRow, `full-buffer Water stays above drawn row ${boundary.firstDrawnRow}`)
        .toHaveLength(0);
    expect(overflow.waterOnArtwork, 'no Water settles behind opaque Collector artwork cell centers').toEqual([]);
    expect(overflow.waterDownFlanks, 'overflow cannot settle halfway down either Collector flank').toHaveLength(0);
    expect(overflow.outputWater, 'overflow does not reach the clear Tubing output anchor').toBe(false);

    const waiting = await page.evaluate(async ({ collector, boundary }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        return boundary.sources.find(cell => world.type[physics.index(cell.x, cell.y)] === boundary.waterId) ||
            boundary.sources.find(cell => world.type[physics.index(cell.x, cell.y)] === 0) || null;
    }, { collector, boundary });
    expect(waiting, 'overflow leaves a waiting Water at the Collector top intake').toBeTruthy();
    const waitingType = await page.evaluate(async waiting => {
        const physics = await import('/physics.js');
        return physics.getWorld().type[physics.index(waiting.x, waiting.y)];
    }, waiting);
    if (waitingType === 0) {
        await page.getByRole('button', { name: 'Brush mode' }).click();
        await clickCell(page, waiting);
    }
    const waterBeforeResume = await page.evaluate(async ({ collector, boundary }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        return world.type.reduce((count, type) => count + (type === boundary.waterId ? 1 : 0), 0);
    }, { collector, boundary });
    await page.evaluate(async ({ collector }) => {
        const physics = await import('/physics.js');
        const index = physics.index(collector.x, collector.y);
        physics.getWorld().storageCount[index] = 99;
    }, { collector });
    await game.step(1);
    const resumed = await page.evaluate(async ({ collector, boundary }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const index = physics.index(collector.x, collector.y);
        const remainingWater = world.type.reduce((count, type) => count + (type === boundary.waterId ? 1 : 0), 0);
        return { inventory: physics.getStorageInventory(collector.x, collector.y), remainingWater };
    }, { collector, boundary });
    expect(resumed.inventory.count, 'the next waiting Water fills the deterministically freed slot').toBe(100);
    expect(resumed.remainingWater).toBe(waterBeforeResume - 1);
});

test('storage bins retain one type, cap at 500, and refuse overflow until purged', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const defs = physics.getDefinitions();
        const id = name => defs.findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        physics.clearWorld();
        physics.setCell(30, 30, id('Powder Storage Bin'));
        const bin = physics.index(30, 30);
        world.storageType[bin] = id('Sand');
        world.storageCount[bin] = 500;
        physics.setCell(30, 28, id('Water'));
        for (let frame = 0; frame < 10; frame++) physics.stepSimulation();
        const full = physics.getStorageInventory(30, 30);
        physics.purgeStorageBin(30, 30);
        return {
            full,
            purged: physics.getStorageInventory(30, 30)
        };
    });
    expect(result.full.count).toBe(500);
    expect(result.full.type).toBeGreaterThan(0);
    expect(result.purged.count).toBe(0);
    expect(result.purged.type).toBe(0);
    await game.step(0);
});
