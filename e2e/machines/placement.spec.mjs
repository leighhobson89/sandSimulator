import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { canvasPoint, dragCanvasCells, machineArtworkCellPoint } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page);
});

test('places and aims a Fan, then edits its settings through the machine dialog', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await game.seed(771);

    await page.getByRole('button', { name: 'Fan', exact: true }).click();
    await dragCanvasCells(page, { x: 25, y: 20 }, { x: 29, y: 20 });
    await commitPlacementLead(page);
    let state = await game.state();
    let captured = await page.evaluate(() => window.__GAME_INSTANCE__.captureState());
    const fanId = state.definitions.find(definition => definition?.name === 'Fan').id;
    const fanIndex = 20 * state.cols + 25;
    expect(state.arrays.type[fanIndex]).toBe(fanId);
    expect(state.arrays.data[fanIndex]).toBe(0);
    expect(captured.arrays.machineSetting[fanIndex]).toBe(7);

    const point = await canvasPoint(page, { x: 25, y: 20 });
    await page.mouse.click(point.x, point.y);
    const dialog = page.getByRole('dialog', { name: 'Fan settings' });
    await expect(dialog).toBeVisible();
    const input = page.locator('#machineDialogInput');
    await expect(input).toHaveAttribute('min', '1');
    await expect(input).toHaveAttribute('max', '50');
    await expect(input).toHaveValue('7');
    await input.fill('50');
    await page.locator('#machineDialogOk').click();
    await expect(dialog).toBeHidden();
    captured = await page.evaluate(() => window.__GAME_INSTANCE__.captureState());
    expect(captured.arrays.machineSetting[fanIndex]).toBe(50);

    await page.mouse.click(point.x, point.y);
    await expect(input).toHaveValue('50');
    await page.locator('#machineDialogCancel').click();
    state = await game.state();
    expect(state.arrays.type[fanIndex]).toBe(fanId);
});

test('places every machine family with a real catalog selection and icon overlay', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const placements = [
        ['Fan', { x: 20, y: 20 }, { x: 22, y: 20 }],
        ['Heater', { x: 50, y: 20 }, { x: 52, y: 20 }],
        ['Cooler', { x: 80, y: 20 }, { x: 82, y: 20 }],
        ['Powder Storage Bin', { x: 110, y: 20 }, { x: 110, y: 23 }],
        ['Liquid Storage Bin', { x: 140, y: 20 }, { x: 140, y: 23 }],
        ['Gas Storage Bin', { x: 170, y: 20 }, { x: 170, y: 23 }],
        ['Sprinkler', { x: 200, y: 20 }, { x: 200, y: 23 }],
        ['Mixer', { x: 230, y: 20 }, { x: 230, y: 23 }],
        ['Splitter', { x: 20, y: 60 }, { x: 22, y: 60 }],
        ['Collector', { x: 50, y: 60 }, { x: 52, y: 60 }]
    ];

    for (const [name, from, to] of placements) {
        await page.getByRole('button', { name, exact: true }).click();
        await dragCanvasCells(page, from, to);
        await commitPlacementLead(page, name);
        if (await page.locator('#mixerDialog').isVisible()) {
            await page.locator('#mixerDialogCancel').click();
        }
        if (await page.locator('#machineDialog').isVisible()) {
            await page.locator('#machineDialogCancel').click();
        }
    }

    const state = await game.state();
    for (const [name, cell] of placements) {
        const id = state.definitions.find(definition => definition?.name === name).id;
        expect(state.arrays.type[cell.y * state.cols + cell.x], name).toBe(id);
    }
    const portRoles = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        return {
            sprinkler: physics.getMachinePorts(200, 20).map(port => port.role),
            mixer: physics.getMachinePorts(230, 20).map(port => port.role)
        };
    });
    expect(portRoles.sprinkler).toEqual(['input']);
    expect(portRoles.mixer).toEqual(['input', 'input']);
    await game.step(0);
    await expect(page.locator('#machineOverlay .machine-overlay-icon')).toHaveCount(10);
});

test('Collector placement defaults to upward suction with its rotated Tubing output', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.getByRole('button', { name: 'Collector', exact: true }).click();
    const target = await canvasPoint(page, { x: 60, y: 35 });
    await page.mouse.move(target.x, target.y);
    await page.mouse.down();
    await game.step(0);
    await page.mouse.up();
    await commitPlacementLead(page);

    const collector = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const cell = { x: 60, y: 35 };
        const world = physics.getWorld();
        const machineIndex = physics.index(cell.x, cell.y);
        return {
            machineId: world.type[machineIndex],
            direction: world.data[machineIndex] & 7,
            ports: physics.getMachinePorts(cell.x, cell.y)
        };
    });
    const collectorId = (await game.state()).definitions.find(definition => definition?.name === 'Collector').id;
    expect(collector.machineId).toBe(collectorId);
    expect(collector.direction, 'the default front points down, so the suction mouth faces up').toBe(3);
    expect(collector.ports).toHaveLength(1);
    expect(collector.ports[0]).toMatchObject({ role: 'output', material: 'Tubing' });
    expect(collector.ports[0].connectionCell).toEqual({ x: 60, y: 38 });
    await game.step(0);
    await expect(page.locator('#machineOverlay .machine-overlay-icon.machine-collector'))
        .toHaveCount(1);
});

test('Heater and Cooler dialogs enforce their target temperature ranges', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    for (const [name, cell, value, min, max] of [
        ['Heater', { x: 18, y: 18 }, '3500', '0', '4000'],
        ['Cooler', { x: 26, y: 18 }, '-20', '-60', '20']
    ]) {
        await page.evaluate(async ({ name, cell }) => {
            const physics = await import('/physics.js');
            const id = physics.getDefinitions().findIndex(definition => definition?.name === name);
            physics.clearWorld();
            physics.setCell(cell.x, cell.y, id);
        }, { name, cell });
        await game.step(0);
        await clickMachineArtwork(page, cell);
        const dialog = page.locator('#machineDialog');
        await expect(dialog).toBeVisible();
        await expect(page.locator('#machineDialogTitle')).toHaveText(`${name} settings`);
        const input = page.locator('#machineDialogInput');
        await expect(input).toHaveAttribute('min', min);
        await expect(input).toHaveAttribute('max', max);
        await input.fill(value);
        await page.locator('#machineDialogOk').click();
        await expect(dialog).toBeHidden();

        await clickMachineArtwork(page, cell);
        await expect(input).toHaveValue(value);
        await page.locator('#machineDialogCancel').click();
    }
});

test('machine previews stay visual until the second click and occupied cells reject placement', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const stone = physics.getDefinitions().findIndex(definition => definition?.name === 'Stone');
        physics.setCell(20, 20, stone);
    });

    await page.getByRole('button', { name: 'Heater', exact: true }).click();
    const blocked = await canvasPoint(page, { x: 20, y: 20 });
    await page.mouse.move(blocked.x, blocked.y);
    await page.mouse.down();
    await page.mouse.move(...Object.values(await canvasPoint(page, { x: 24, y: 20 })));
    await expect(page.locator('#machineOverlay .machine-placement-preview')).toHaveCount(0);
    await page.mouse.up();
    const blockedState = await game.state();
    expect(blockedState.arrays.type[20 + 20 * blockedState.cols]).toBe(
        blockedState.definitions.find(definition => definition?.name === 'Stone').id
    );

    const target = await canvasPoint(page, { x: 30, y: 20 });
    await page.mouse.move(target.x, target.y);
    await page.mouse.down();
    await page.mouse.move(...Object.values(await canvasPoint(page, { x: 34, y: 20 })));
    await game.step(0);
    await expect(page.locator('#machineOverlay .machine-placement-preview')).toHaveCount(1);
    await expect(page.locator('#machineOverlay .machine-cone-preview')).toHaveCount(1);
    const beforeRelease = await game.state();
    expect(beforeRelease.arrays.type[20 * beforeRelease.cols + 30]).toBe(0);
    await page.mouse.up();
    const afterPose = await game.state();
    expect(afterPose.arrays.type[20 * afterPose.cols + 30]).toBe(0);
    await commitPlacementLead(page);
    const placed = await game.state();
    expect(placed.arrays.type[20 * placed.cols + 30]).toBe(
        placed.definitions.find(definition => definition?.name === 'Heater').id
    );
});

test('Fan placement preview uses the visible directional cone alongside Heater and Cooler', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const previews = [];
    for (const [index, machine] of ['Fan', 'Heater', 'Cooler'].entries()) {
        if (index > 0) {
            await page.evaluate(async () => (await import('/physics.js')).clearWorld());
        }
        await page.getByRole('button', { name: machine, exact: true }).click();
        const from = { x: 30, y: 20 };
        const to = { x: from.x + 4, y: from.y };
        const fromPoint = await canvasPoint(page, from);
        const toPoint = await canvasPoint(page, to);
        await page.mouse.move(fromPoint.x, fromPoint.y);
        await page.mouse.down();
        await page.mouse.move(toPoint.x, toPoint.y);
        await game.step(0);
        await expect(page.locator('#machineOverlay .machine-placement-preview')).toHaveCount(1);
        await expect(page.locator('#machineOverlay .machine-cone-preview')).toHaveCount(1);
        previews.push(await page.locator('#machineOverlay .machine-cone-preview').evaluateAll(nodes =>
            nodes.map(node => ({
                className: node.getAttribute('class'),
                path: node.getAttribute('d')
            }))));
        await page.mouse.up();
        await expect(page.locator('#machineOverlay .machine-placement-preview')).toHaveCount(1);
        await commitPlacementLead(page);
        if (await page.locator('#machineDialog').isVisible()) {
            await page.locator('#machineDialogCancel').click();
        }
    }

    for (const [index, machine] of ['fan', 'heater', 'cooler'].entries()) {
        expect(previews[index], `${machine} preview cone`).toHaveLength(1);
        expect(previews[index][0].className).toContain(`machine-cone-${machine}`);
        expect(previews[index][0].path?.length).toBeGreaterThan(0);
    }
    expect(previews[0][0].path).toBe(previews[1][0].path);
    expect(previews[0][0].path).toBe(previews[2][0].path);
});

test('Fan input clamps out-of-range values and rounds fractional speeds', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const fan = physics.getDefinitions().findIndex(definition => definition?.name === 'Fan');
        physics.setCell(25, 20, fan);
    });
    await game.step(0);
    await clickMachineArtwork(page, { x: 25, y: 20 });
    const input = page.locator('#machineDialogInput');
    await expect(input).toHaveAttribute('min', '1');
    await expect(input).toHaveAttribute('max', '50');
    await input.fill('999');
    await page.locator('#machineDialogOk').click();
    await clickMachineArtwork(page, { x: 25, y: 20 });
    await expect(input).toHaveValue('50');
    const state = await game.state();
    const captured = await page.evaluate(() => window.__GAME_INSTANCE__.captureState());
    expect(captured.arrays.machineSetting[20 * state.cols + 25]).toBe(50);
    await input.fill('-4');
    await page.locator('#machineDialogOk').click();
    await clickMachineArtwork(page, { x: 25, y: 20 });
    await expect(input).toHaveValue('1');
    await input.fill('12.6');
    await page.locator('#machineDialogOk').click();
    await clickMachineArtwork(page, { x: 25, y: 20 });
    await expect(input).toHaveValue('13');
    await page.locator('#machineDialogCancel').click();
    await game.step(0);
});

test('machine hit testing and tooltip work across the visible icon edge', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const fan = physics.getDefinitions().findIndex(definition => definition?.name === 'Fan');
        physics.setCell(25, 20, fan);
    });
    await game.step(0);
    const point = await page.locator('#canvas').evaluate((canvas, cell) => {
        const rect = canvas.getBoundingClientRect();
        const x = rect.left + ((cell.x + 0.5) / canvas.width) * rect.width;
        const y = rect.top + ((cell.y + 0.5) / canvas.height) * rect.height;
        return { x: x + 12, y };
    }, { x: 25, y: 20 });
    await page.mouse.move(point.x, point.y);
    await expect(page.locator('#toolTooltip')).toBeVisible();
    await expect(page.locator('#toolTooltip')).toContainText('Fan');
    await expect(page.locator('#toolTooltip')).toContainText('Wind speed');
    await page.mouse.click(point.x, point.y);
    await expect(page.locator('#machineDialog')).toBeVisible();
    await page.locator('#machineDialogCancel').click();
});

test('machine placement previews a connector first and commits machine plus lead on the second click', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.getByRole('button', { name: 'Collector', exact: true }).click();

    const machine = { x: 60, y: 35 };
    const anchorPoint = await canvasPoint(page, machine);
    await page.mouse.move(anchorPoint.x, anchorPoint.y);
    await page.mouse.down();
    await page.mouse.up();

    let beforeCommit = await game.state();
    const collectorId = beforeCommit.definitions.find(definition => definition?.name === 'Collector').id;
    const machineIndex = machine.y * beforeCommit.cols + machine.x;
    expect(beforeCommit.arrays.type[machineIndex], 'the first click keeps the Collector out of the world').toBe(0);
    await expect(page.locator('#machineOverlay .machine-placement-preview.machine-collector')).toHaveCount(1);
    const outputPort = page.locator(
        '#machineOverlay .machine-placement-preview.machine-collector .machine-port[data-port-id="tubing-out"]'
    );
    await expect(outputPort, 'Collector selects its output-only port for the lead preview').toHaveCount(1);

    const outputBox = await outputPort.boundingBox();
    expect(outputBox).not.toBeNull();
    const portCenter = { x: outputBox.x + outputBox.width / 2, y: outputBox.y + outputBox.height / 2 };
    const direction = { x: 0, y: 1 };
    const leadEnd = { x: portCenter.x + direction.x * 12, y: portCenter.y + direction.y * 12 };
    await page.mouse.move(leadEnd.x, leadEnd.y);
    const leadPreview = page.locator('[data-port-connector-preview]');
    await expect(leadPreview, 'cursor movement previews the protruding tubing').toHaveCount(1);
    const previewWidth = Number(await leadPreview.getAttribute('stroke-width'));
    const cellWidth = await page.locator('#canvas').evaluate(canvas =>
        canvas.getBoundingClientRect().width / canvas.width);
    expect(previewWidth).toBeCloseTo(cellWidth * 3, 0);
    const betweenClicks = await game.state();
    expect(betweenClicks.arrays.type[machineIndex], 'preview movement still does not commit the Collector').toBe(0);

    await page.mouse.click(leadEnd.x, leadEnd.y);
    const committed = await game.state();
    expect(committed.arrays.type[machineIndex]).toBe(collectorId);
    const collector = await page.evaluate(async ({ machine }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const index = physics.index(machine.x, machine.y);
        return {
            direction: world.data[index] & 7,
            port: physics.getMachinePorts(machine.x, machine.y).find(candidate => candidate.id === 'tubing-out'),
            tubingId: physics.getDefinitions().findIndex(definition => definition?.name === 'Tubing')
        };
    }, { machine });
    expect(collector.direction, 'default Collector facing remains downward').toBe(3);
    expect(committed.arrays.type[collector.port.connectionCell.y * committed.cols +
        collector.port.connectionCell.x]).toBe(collector.tubingId);
    const portCircle = page.locator(
        '#machineOverlay .machine-collector .machine-port[data-port-id="tubing-out"]'
    );
    await expect(portCircle).toHaveAttribute('data-connected', 'false');

    await page.evaluate(async () => (await import('/physics.js')).clearWorld());
    await page.getByRole('button', { name: 'Collector', exact: true }).click();
    await page.mouse.click(anchorPoint.x, anchorPoint.y);
    const beforeCancel = await game.state();
    expect(beforeCancel.arrays.type[machineIndex], 'the first placement stage is still only a ghost').toBe(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('.machine-placement-preview')).toHaveCount(0);
    const afterCancel = await game.state();
    expect(afterCancel.arrays.type[machineIndex], 'Escape cancels without committing the machine').toBe(0);
});

test('blocked machine lead retries atomically and right click cancels without saving a ghost', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.getByRole('button', { name: 'Collector', exact: true }).click();
    const machine = { x: 100, y: 40 };
    const point = await canvasPoint(page, machine);
    await page.mouse.click(point.x, point.y);
    const preview = page.locator('#machineOverlay .machine-placement-preview.machine-collector');
    await expect(preview).toHaveCount(1);

    const before = await page.evaluate(async machine => {
        const physics = await import('/physics.js');
        const gameModule = await import('/game.js');
        const captured = window.__GAME_INSTANCE__.captureState();
        const blueprint = gameModule.captureBlueprint(machine.x - 6, machine.y - 6,
            machine.x + 6, machine.y + 9);
        return {
            collector: captured.arrays.type[physics.index(machine.x, machine.y)],
            savedCells: captured.arrays.type.filter(type => type !== 0).length,
            blueprintCells: Array.from(blueprint.cells.type).filter(type => type !== 0).length,
            stone: physics.getDefinitions().findIndex(definition => definition?.name === 'Stone')
        };
    }, machine);
    expect(before.collector).toBe(0);
    expect(before.savedCells, 'a pending placement does not enter the saved world').toBe(0);
    expect(before.blueprintCells, 'a pending placement does not enter a blueprint').toBe(0);

    const port = preview.locator('circle[data-port-id="tubing-out"]');
    const box = await port.boundingBox();
    expect(box).not.toBeNull();
    const end = { x: box.x + box.width / 2, y: box.y + box.height / 2 + 12 };
    const blocker = { x: machine.x, y: machine.y + 4 };
    await page.evaluate(async ({ blocker, stone }) => {
        (await import('/physics.js')).setCell(blocker.x, blocker.y, stone);
    }, { blocker, stone: before.stone });
    await page.mouse.move(end.x, end.y);
    await page.mouse.click(end.x, end.y);
    await expect(preview, 'blocked lead keeps the second stage available for retry').toHaveCount(1);
    const failed = await game.state();
    expect(failed.arrays.type[machine.y * failed.cols + machine.x]).toBe(0);
    expect(failed.arrays.type[blocker.y * failed.cols + blocker.x]).toBe(before.stone);
    expect(failed.arrays.type.filter(type => type !== 0).length,
        'a rejected commit leaves no partial tubing').toBe(1);

    await page.evaluate(async blocker => {
        (await import('/physics.js')).setCell(blocker.x, blocker.y, 0);
    }, blocker);
    await page.mouse.click(end.x, end.y);
    await expect(preview).toHaveCount(0);
    const committed = await game.state();
    const collector = committed.definitions.find(definition => definition?.name === 'Collector').id;
    const tubing = committed.definitions.find(definition => definition?.name === 'Tubing').id;
    expect(committed.arrays.type[machine.y * committed.cols + machine.x]).toBe(collector);
    expect(committed.arrays.type.filter(type => type === tubing).length,
        'the corrected second click commits the lead').toBeGreaterThan(0);

    const secondMachine = { x: 130, y: 40 };
    const secondPoint = await canvasPoint(page, secondMachine);
    await page.mouse.click(secondPoint.x, secondPoint.y);
    await expect(preview).toHaveCount(1);
    await page.mouse.click(secondPoint.x, secondPoint.y, { button: 'right' });
    await expect(preview).toHaveCount(0);
    const canceled = await game.state();
    expect(canceled.arrays.type[secondMachine.y * canceled.cols + secondMachine.x]).toBe(0);
});

test.describe('touch machine placement', () => {
    test.use({ hasTouch: true });

    test('uses the same ghost then connector commit stages as a mouse', async ({ page }) => {
        const game = new GamePage(page);
        await game.openMenu();
        await game.newGame();
        await page.getByRole('button', { name: 'Collector', exact: true }).click();
        const machine = { x: 100, y: 60 };
        const center = await canvasPoint(page, machine);
        await page.touchscreen.tap(center.x, center.y);
        const preview = page.locator('#machineOverlay .machine-placement-preview.machine-collector');
        await expect(preview).toHaveCount(1);
        let state = await game.state();
        expect(state.arrays.type[machine.y * state.cols + machine.x],
            'first touch selects only the ghost pose').toBe(0);

        const port = preview.locator('circle[data-port-id="tubing-out"]');
        const box = await port.boundingBox();
        expect(box).not.toBeNull();
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2 + 12);
        await expect(preview).toHaveCount(0);
        state = await game.state();
        const collector = state.definitions.find(definition => definition?.name === 'Collector').id;
        const tubing = state.definitions.find(definition => definition?.name === 'Tubing').id;
        expect(state.arrays.type[machine.y * state.cols + machine.x]).toBe(collector);
        expect(state.arrays.type.filter(type => type === tubing).length,
            'second touch commits the connector with the machine').toBeGreaterThan(0);
    });
});

test('Fan placement maps all eight drag directions into persistent orientation data', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.getByRole('button', { name: 'Fan', exact: true }).click();
    const directions = [
        [{ x: 40, y: 20 }, { x: 44, y: 20 }, 0],
        [{ x: 40, y: 20 }, { x: 36, y: 20 }, 1],
        [{ x: 40, y: 20 }, { x: 40, y: 16 }, 2],
        [{ x: 40, y: 20 }, { x: 40, y: 24 }, 3],
        [{ x: 40, y: 20 }, { x: 44, y: 16 }, 4],
        [{ x: 40, y: 20 }, { x: 36, y: 16 }, 5],
        [{ x: 40, y: 20 }, { x: 36, y: 24 }, 6],
        [{ x: 40, y: 20 }, { x: 44, y: 24 }, 7]
    ];
    for (const [from, to, expected] of directions) {
        await page.evaluate(async () => (await import('/physics.js')).clearWorld());
        await dragCanvasCells(page, from, to);
        await commitPlacementLead(page);
        const state = await game.state();
        expect(state.arrays.data[from.y * state.cols + from.x], `${from.x},${from.y}`).toBe(expected);
    }
});

async function clickCell(page, cell) {
    const point = await canvasPoint(page, cell);
    await page.mouse.click(point.x, point.y);
}

async function clickMachineArtwork(page, cell) {
    const point = await machineArtworkCellPoint(page, cell);
    await page.mouse.click(point.x, point.y);
}

async function commitPlacementLead(page, label = 'machine') {
    const preview = page.locator('#machineOverlay .machine-placement-preview');
    await expect(preview).toHaveCount(1);
    const target = await preview.evaluate(icon => {
        const port = icon.querySelector('circle[data-port-id]');
        if (!port) throw new Error('Machine placement preview has no declared port.');
        const stub = [...icon.querySelectorAll('[data-port-stub]')]
            .find(candidate => candidate.getAttribute('data-port-stub') === port.getAttribute('data-port-id'));
        if (!stub) throw new Error(`Machine port ${port.getAttribute('data-port-id')} has no visible stub.`);
        const bounds = port.getBoundingClientRect();
        const center = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
        const end = stub.getPointAtLength(stub.getTotalLength()).matrixTransform(stub.getScreenCTM());
        const dx = end.x - center.x;
        const dy = end.y - center.y;
        const length = Math.hypot(dx, dy);
        if (length < 0.5) return { x: center.x, y: center.y + 12 };
        return { x: center.x + dx / length * 12, y: center.y + dy / length * 12 };
    });
    await page.mouse.move(target.x, target.y);
    await page.mouse.click(target.x, target.y);
    await expect(preview, `${label} commits after its lead click`).toHaveCount(0);
}
