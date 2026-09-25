import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { canvasPoint, machineArtworkCellPoint, scrollCanvasToCell } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page);
});

const machineLayout = [
    { name: 'Fan', key: 'fan', x: 28, y: 20, ports: [{ role: 'input', material: 'Copper', marker: [6.667, 32.471] }] },
    { name: 'Heater', key: 'heater', x: 58, y: 20, ports: [{ role: 'input', material: 'Copper', marker: [6.585, 31.138] }] },
    { name: 'Cooler', key: 'cooler', x: 88, y: 20, ports: [{ role: 'input', material: 'Copper', marker: [7.043, 32.457] }] },
    { name: 'Powder Storage Bin', key: 'storagePowder', x: 28, y: 48, ports: [
        { role: 'input', material: 'Tubing', marker: [31.786, 9.130] },
        { role: 'output', material: 'Tubing', marker: [31.786, 51.023] }
    ] },
    { name: 'Liquid Storage Bin', key: 'storageLiquid', x: 58, y: 48, ports: [
        { role: 'input', material: 'Tubing', marker: [32.119, 9.458] },
        { role: 'output', material: 'Tubing', marker: [32.119, 50.983] }
    ] },
    { name: 'Gas Storage Bin', key: 'storageGas', x: 88, y: 48, ports: [
        { role: 'input', material: 'Tubing', marker: [31.657, 10.400] },
        { role: 'output', material: 'Tubing', marker: [31.657, 50.400] }
    ] },
    { name: 'Sprinkler', key: 'sprinkler', x: 118, y: 48, ports: [
        { role: 'input', material: 'Tubing', marker: [31.636, 19.091] }
    ] },
    { name: 'Mixer', key: 'mixer', x: 148, y: 48, ports: [
        { role: 'input', material: 'Tubing', marker: [7.630, 29.321] },
        { role: 'input', material: 'Tubing', marker: [56.716, 29.321] }
    ] },
    { name: 'Splitter', key: 'splitter', x: 178, y: 48, ports: [
        { role: 'input', material: 'Tubing', marker: [32, 13.130] },
        { role: 'output', material: 'Tubing', marker: [12.116, 43.565] },
        { role: 'output', material: 'Tubing', marker: [51.884, 43.565] }
    ] },
    { name: 'Collector', key: 'collector', x: 208, y: 48, customSvg: true, ports: [
        { role: 'output', material: 'Tubing', marker: [50.6, 32] }
    ] }
];

async function prepareMachines(page, machines = machineLayout) {
    await page.evaluate(async entries => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        physics.clearWorld();
        for (const machine of entries) {
            const id = definitions.findIndex(definition => definition?.name === machine.name);
            physics.setCell(machine.x, machine.y, id);
        }
    }, machines);
}

function isRed(fill) {
    const values = fill.match(/[\d.]+/g)?.map(Number) || [];
    return values.length >= 3 && values[0] > values[1] * 1.5 && values[0] > values[2] * 1.2;
}

function isGreen(fill) {
    const values = fill.match(/[\d.]+/g)?.map(Number) || [];
    return values.length >= 3 && values[1] > values[0] * 1.25 && values[1] > values[2] * 1.1;
}

test('a port lead stays idle until an external connector joins it, including after save and blueprint copy', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const machine = { x: 80, y: 60 };
    await prepareMachines(page, [{ name: 'Fan', key: 'fan', ...machine }]);
    await game.step(0);

    const portCircle = page.locator('#machineOverlay .machine-fan circle.machine-port[data-port-id]');
    const portBox = await portCircle.boundingBox();
    expect(portBox).not.toBeNull();
    const marker = { x: portBox.x + portBox.width / 2, y: portBox.y + portBox.height / 2 };
    const port = await page.evaluate(async machine =>
        (await import('/physics.js')).getMachinePorts(machine.x, machine.y)[0], machine);
    const endpoint = { x: marker.x + port.directionX * 16, y: marker.y + port.directionY * 16 };
    await page.mouse.move(marker.x, marker.y);
    await page.mouse.down();
    await page.mouse.move(endpoint.x, endpoint.y, { steps: 4 });
    await page.mouse.up();
    await game.step(0);

    const lead = await page.evaluate(async ({ machine, port }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const copper = physics.getDefinitions().findIndex(definition => definition?.name === 'Copper');
        const cells = [];
        for (let y = machine.y - 12; y <= machine.y + 12; y++) {
            for (let x = machine.x - 12; x <= machine.x + 12; x++) {
                if (world.type[physics.index(x, y)] === copper) cells.push({ x, y });
            }
        }
        const farthest = cells.sort((a, b) =>
            Math.hypot(b.x - port.connectionCell.x, b.y - port.connectionCell.y) -
            Math.hypot(a.x - port.connectionCell.x, a.y - port.connectionCell.y))[0];
        return { cells, farthest, copper };
    }, { machine, port });
    expect(lead.cells.length, 'the port drag paints a Copper lead').toBeGreaterThan(1);
    expect(isRed(await portCircle.evaluate(node => getComputedStyle(node).fill)),
        'the port does not count its own lead as external power').toBe(true);

    const copied = await page.evaluate(async ({ machine }) => {
        const gameModule = await import('/game.js');
        const physics = await import('/physics.js');
        const blueprint = gameModule.captureBlueprint(machine.x - 12, machine.y - 12,
            machine.x + 12, machine.y + 12);
        const saveModule = await import('/saveLoadGame.js');
        const save = saveModule.createSaveString();
        physics.clearWorld();
        saveModule.loadSaveString(save);
        const afterSave = physics.getMachinePorts(machine.x, machine.y)[0]?.connected;
        physics.clearWorld();
        gameModule.stampBlueprintAt(blueprint, machine.x - 12, machine.y - 12);
        const afterBlueprint = physics.getMachinePorts(machine.x, machine.y)[0]?.connected;
        return { afterSave, afterBlueprint };
    }, { machine });
    expect(copied.afterSave, 'a saved lead retains its ownership').toBe(false);
    expect(copied.afterBlueprint, 'a copied lead retains its ownership').toBe(false);

    const joined = await page.evaluate(async ({ machine, port, cells, copper }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const farthest = cells.sort((a, b) =>
            Math.hypot(b.x - port.connectionCell.x, b.y - port.connectionCell.y) -
            Math.hypot(a.x - port.connectionCell.x, a.y - port.connectionCell.y))[0];
        const dx = Math.sign(port.directionX);
        const dy = Math.sign(port.directionY);
        // Connector networks join by an edge, so extend the tip along one
        // cardinal axis even when the artwork direction has a small tilt.
        const external = Math.abs(port.directionX) >= Math.abs(port.directionY)
            ? { x: farthest.x + dx, y: farthest.y }
            : { x: farthest.x, y: farthest.y + dy };
        if (world.type[physics.index(external.x, external.y)] !== 0) {
            throw new Error('Expected an empty cell past the lead tip.');
        }
        physics.setCell(external.x, external.y, copper);
        return { external, connected: physics.getMachinePorts(machine.x, machine.y)[0].connected };
    }, { machine, port, cells: lead.cells, copper: lead.copper });
    expect(joined.connected, 'external Copper joins the tagged lead').toBe(true);
    await game.step(0);
    expect(isGreen(await portCircle.evaluate(node => getComputedStyle(node).fill))).toBe(true);
});

test('machine sprite sheet, 64px artwork, and visible ports match the declared layout', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await prepareMachines(page);
    await game.step(0);

    const result = await page.evaluate(async machines => {
        const physics = await import('/physics.js');
        const assetCandidates = ['/resources/icons.png', '/resources/iconsInputsOutputs.png'];
        const assets = [];
        for (const url of assetCandidates) {
            const response = await fetch(url);
            if (!response.ok) continue;
            const bitmap = await createImageBitmap(await response.blob());
            assets.push({ url, width: bitmap.width, height: bitmap.height });
            bitmap.close();
        }
        const descriptors = Object.fromEntries(machines.map(machine => {
            const ports = physics.getMachinePorts(machine.x, machine.y) || [];
            return [machine.key, ports.map(port => ({
                id: port.id, role: port.role, material: port.material,
                connectionCell: port.connectionCell, x: port.x, y: port.y
            }))];
        }));
        const canvas = document.querySelector('#canvas');
        const canvasRect = canvas.getBoundingClientRect();
        const icons = [...document.querySelectorAll('#machineOverlay .machine-overlay-icon')]
            .map(icon => ({
                classes: [...icon.classList], width: icon.getAttribute('width'),
                height: icon.getAttribute('height'), viewBox: icon.getAttribute('viewBox'),
                ports: [...icon.querySelectorAll('circle[data-port-id]')].map(circle => ({
                    id: circle.dataset.portId, role: circle.dataset.portRole,
                    family: circle.dataset.portFamily,
                    cx: Number(circle.getAttribute('cx')), cy: Number(circle.getAttribute('cy')),
                    r: Number(circle.getAttribute('r')), fill: getComputedStyle(circle).fill,
                    screenX: circle.getBoundingClientRect().left + circle.getBoundingClientRect().width / 2,
                    screenY: circle.getBoundingClientRect().top + circle.getBoundingClientRect().height / 2
                })),
                stubs: [...icon.querySelectorAll('[data-port-stub]')].map(stub => {
                    const point = stub.getPointAtLength(stub.getTotalLength())
                        .matrixTransform(stub.getScreenCTM());
                    return {
                        id: stub.getAttribute('data-port-stub'),
                        endX: point.x, endY: point.y,
                        strokeWidth: Number(stub.getAttribute('stroke-width'))
                    };
                }),
                hitTargets: [...icon.querySelectorAll('[data-port-hit-target]')].map(target => {
                    const bounds = target.getBoundingClientRect();
                    return { id: target.getAttribute('data-port-hit-target'), width: bounds.width, height: bounds.height };
                }),
                imageSources: [...icon.querySelectorAll('image')].map(image =>
                    image.getAttribute('href') || image.getAttributeNS('http://www.w3.org/1999/xlink', 'href')),
                background: getComputedStyle(icon).backgroundImage
            }));
        return {
            assets, descriptors, icons,
            canvas: { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width,
                height: canvasRect.height, cols: canvas.width, rows: canvas.height }
        };
    }, machineLayout);

    expect(result.assets.some(asset => asset.width === 1536 && asset.height === 1024),
        'one of the two authored 3×3 sprite sheets is served at 1536×1024').toBe(true);
    expect(result.icons).toHaveLength(machineLayout.length);

    for (const expected of machineLayout) {
        const icon = result.icons.find(candidate => candidate.classes.includes(`machine-${expected.key}`));
        const descriptors = result.descriptors[expected.key] || [];
        expect(icon, `${expected.name} icon`).toBeTruthy();
        expect(icon.width, `${expected.name} width`).toBe('64');
        expect(icon.height, `${expected.name} height`).toBe('64');
        expect(icon.viewBox, `${expected.name} port geometry viewBox`).toBe('0 0 64 64');
        expect(descriptors, `${expected.name} descriptor count`).toHaveLength(expected.ports.length);
        expect(icon.ports, `${expected.name} rendered port count`).toHaveLength(expected.ports.length);
        expect(icon.hitTargets, `${expected.name} screen-space hit target count`).toHaveLength(expected.ports.length);
        if (expected.customSvg) {
            expect(icon.imageSources, `${expected.name} uses its custom SVG artwork`).toHaveLength(0);
        } else {
            expect(icon.imageSources.concat(icon.background).some(source =>
                /icons(?:InputsOutputs)?\.png/i.test(source || '')),
            `${expected.name} uses the provided sprite sheet`).toBe(true);
        }

        const connectionKeys = descriptors.map(port => port.connectionCell &&
            `${port.connectionCell.x},${port.connectionCell.y}`);
        expect(connectionKeys.every(Boolean), `${expected.name} declares every connection anchor`).toBe(true);
        expect(new Set(connectionKeys).size, `${expected.name} anchors do not overlap`).toBe(connectionKeys.length);
        for (let i = 0; i < descriptors.length; i++) {
            const descriptor = descriptors[i];
            const spec = expected.ports[i];
            const circle = icon.ports.find(port => port.id === descriptor.id);
            expect(descriptor.role, `${expected.name} port ${i} role`).toBe(spec.role);
            expect(String(descriptor.material).toLowerCase(), `${expected.name} port ${i} material`)
                .toBe(spec.material.toLowerCase());
            expect(descriptor.connectionCell, `${expected.name} port ${i} has a stable physical anchor`).toBeTruthy();
            expect(descriptor.connectionCell.x === expected.x && descriptor.connectionCell.y === expected.y,
                `${expected.name} connection anchor is outside the machine center`).toBe(false);
            expect(circle, `${expected.name} rendered port ${descriptor.id}`).toBeTruthy();
            const hitTarget = icon.hitTargets.find(target => target.id === descriptor.id);
            expect(hitTarget, `${expected.name} separate port hit target`).toBeTruthy();
            expect(hitTarget.width, `${expected.name} hit target diameter stays 40 CSS px`).toBeCloseTo(40, 0);
            expect(hitTarget.height, `${expected.name} hit target diameter stays 40 CSS px`).toBeCloseTo(40, 0);
            expect(Math.abs(circle.cx - spec.marker[0]), `${expected.name} marker x`).toBeLessThan(0.4);
            expect(Math.abs(circle.cy - spec.marker[1]), `${expected.name} marker y`).toBeLessThan(0.4);
            const anchorScreen = {
                x: result.canvas.left + ((descriptor.connectionCell.x + 0.5) / result.canvas.cols) * result.canvas.width,
                y: result.canvas.top + ((descriptor.connectionCell.y + 0.5) / result.canvas.rows) * result.canvas.height
            };
            const stubLength = Math.hypot(circle.screenX - anchorScreen.x, circle.screenY - anchorScreen.y);
            expect(stubLength, `${expected.name} visible marker maps to its logical connection anchor`)
                .toBeGreaterThan(0.5);
            expect(stubLength, `${expected.name} marker-to-anchor stub is usable at screen scale`).toBeLessThanOrEqual(20);
            const renderedStub = icon.stubs.find(stub => stub.id === descriptor.id);
            expect(renderedStub, `${expected.name} port stub is rendered`).toBeTruthy();
            expect(renderedStub.strokeWidth, `${expected.name} stub keeps the specified connector stroke`).toBe(2);
            expect(Math.hypot(renderedStub.endX - anchorScreen.x, renderedStub.endY - anchorScreen.y),
                `${expected.name} stub ends on its physical connection cell, including Collector output`)
                .toBeLessThanOrEqual(0.75);
            expect(circle.r, `${expected.name} visible circle radius`).toBeGreaterThanOrEqual(2);
            expect(circle.r, `${expected.name} visible circle radius`)
                .toBeLessThanOrEqual(expected.customSvg ? 4.5 : 3.5);
            expect(isRed(circle.fill), `${expected.name} idle port is red`).toBe(true);
        }
    }
});

test('port hit areas and snapping honor role, material, and physical contact', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await prepareMachines(page);

    const result = await page.evaluate(async machines => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const checks = [];
        for (const machine of machines) {
            const ports = physics.getMachinePorts(machine.x, machine.y) || [];
            for (const port of ports) {
                const accepted = port.material === 'Copper' ? 'Copper' : 'Tubing';
                const rejected = accepted === 'Copper' ? 'Tubing' : 'Copper';
                const cell = port.connectionCell;
                const rawStorageInput = machine.name.endsWith('Storage Bin') && port.role === 'input'
                    ? ['Sand', 'Water', 'Steam'].map(name => ({
                        name,
                        accepted: physics.isMachinePortMaterialCompatible(
                            machine.x, machine.y, port.id, id(name)),
                        resolved: physics.getMachinePortAt(cell.x, cell.y, id(name))?.id || null,
                        snap: physics.getMachinePortSnapTarget(cell.x, cell.y, id(name))
                    })) : [];
                checks.push({
                    machine: machine.name, id: port.id, role: port.role,
                    connectionCell: cell,
                    accepted,
                    acceptedAt: physics.getMachinePortAt(cell.x, cell.y, id(accepted))?.id || null,
                    rejected,
                    rejectedAt: physics.getMachinePortAt(cell.x, cell.y, id(rejected))?.id || null,
                    rawStorageInput,
                    snap: physics.getMachinePortSnapTarget(cell.x, cell.y, id(accepted)),
                    anchorLookup: physics.getMachinePortAt(machine.x, machine.y, id(accepted))?.id || null,
                    legacyAdjacentLookup: physics.getMachinePortAt(machine.x + 1,
                        machine.y, id(accepted))?.id || null
                });
            }
        }

        const mixer = machines.find(machine => machine.name === 'Mixer');
        const mixerPort = physics.getMachinePorts(mixer.x, mixer.y)[0];
        const near = { x: mixerPort.connectionCell.x + 1, y: mixerPort.connectionCell.y };
        const before = near ? physics.getWorld().type[physics.index(near.x, near.y)] : null;
        const snap = near ? physics.getMachinePortSnapTarget(near.x, near.y, id('Tubing')) : null;
        const copperSnap = near ? physics.getMachinePortSnapTarget(near.x, near.y, id('Copper')) : null;
        const after = near ? physics.getWorld().type[physics.index(near.x, near.y)] : null;
        if (near) physics.setCell(near.x, near.y, id('Tubing'));
        const nearTubeResolves = near
            ? physics.getMachinePortAt(near.x, near.y, id('Tubing'))?.id || null : null;

        return {
            checks, near, snap, copperSnap, before, after, nearTubeResolves,
            tubeId: id('Tubing'), copperId: id('Copper'), selectedCell: mixerPort.connectionCell,
            allPorts: physics.getMachinePorts(mixer.x, mixer.y).map(port => port.id)
        };
    }, machineLayout);

    for (const check of result.checks) {
        expect(check.connectionCell, `${check.machine}.${check.id} connection anchor`).toBeTruthy();
        expect(check.connectionCell.x === machineLayout.find(item => item.name === check.machine).x &&
            check.connectionCell.y === machineLayout.find(item => item.name === check.machine).y,
        `${check.machine}.${check.id} anchor is external to the machine center`).toBe(false);
        expect(check.acceptedAt, `${check.machine}.${check.id} accepts ${check.accepted}`).toBe(check.id);
        expect(check.rejectedAt, `${check.machine}.${check.id} rejects ${check.rejected}`).toBeNull();
        for (const raw of check.rawStorageInput) {
            expect(raw.accepted, `${check.machine}.${check.id} rejects loose ${raw.name}`).toBe(false);
            expect(raw.resolved, `${check.machine}.${check.id} does not attach loose ${raw.name}`).toBeNull();
            expect(raw.snap, `${check.machine}.${check.id} does not snap loose ${raw.name}`).toBeNull();
        }
        expect(check.anchorLookup, `${check.machine}.${check.id} does not hit at the logical anchor`).toBeNull();
        expect(check.legacyAdjacentLookup,
            `${check.machine}.${check.id} does not claim an adjacent legacy-style contact in a modern layout`).toBeNull();
    }
    expect(result.snap?.portId).toBeTruthy();
    expect(result.copperSnap).toBeNull();
    expect(result.before).toBe(0);
    expect(result.after).toBe(result.before);
    expect(result.nearTubeResolves,
        'a nearby compatible Tube does not resolve until it occupies the exact connection cell').toBeNull();
    await game.step(0);
    let circles = await page.locator('#machineOverlay .machine-overlay-icon.machine-mixer circle[data-port-id]')
        .evaluateAll(nodes => nodes.map(node => ({
            id: node.dataset.portId, fill: getComputedStyle(node).fill
        })));
    expect(circles.every(port => isRed(port.fill)),
        'a successful proximity suggestion does not connect or recolor an idle port').toBe(true);

    await page.evaluate(async ({ cell, tubeId }) => {
        const physics = await import('/physics.js');
        physics.setCell(cell.x, cell.y, tubeId);
    }, { cell: result.selectedCell, tubeId: result.tubeId });
    await game.step(0);
    const physicalCheck = await page.evaluate(async ({ cell, mixer, tubeId, copperId }) => {
        const physics = await import('/physics.js');
        return {
            cellType: physics.getWorld().type[physics.index(cell.x, cell.y)],
            resolved: physics.getMachinePortAt(cell.x, cell.y, tubeId)?.id || null,
            incompatible: physics.getMachinePortAt(cell.x, cell.y, copperId)?.id || null,
            ports: physics.getMachinePorts(mixer.x, mixer.y).map(port => port.id)
        };
    }, {
        cell: result.selectedCell,
        mixer: { x: 148, y: 48 },
        tubeId: result.tubeId,
        copperId: result.copperId
    });
    expect(physicalCheck.cellType).toBe(result.tubeId);
    expect(physicalCheck.resolved).toBe(physicalCheck.ports[0]);
    expect(physicalCheck.incompatible).toBeNull();
    circles = await page.locator('#machineOverlay .machine-overlay-icon.machine-mixer circle[data-port-id]')
        .evaluateAll(nodes => nodes.map(node => ({
            id: node.dataset.portId, fill: getComputedStyle(node).fill
        })));
    expect(isGreen(circles.find(port => port.id === result.allPorts[0])?.fill || ''),
        'a single physically touching Tubing cell turns its port green').toBe(true);
    expect(circles.filter(port => port.id !== result.allPorts[0]).every(port => isRed(port.fill)),
        'every other Mixer port stays idle red when only one external Tube cell touches a port').toBe(true);
});

test('port hit radius is 20 CSS px, and incompatible UI connectors leave no partial stroke', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const machine = { name: 'Mixer', key: 'mixer', x: 80, y: 60 };
    await prepareMachines(page, [machine]);
    await game.step(0);

    const port = page.locator('#machineOverlay .machine-overlay-icon.machine-mixer circle[data-port-id]').first();
    const marker = await port.boundingBox();
    expect(marker).not.toBeNull();
    const center = { x: marker.x + marker.width / 2, y: marker.y + marker.height / 2 };
    const hitResults = await page.evaluate(async ({ center, machine }) => {
        const physics = await import('/physics.js');
        const game = await import('/game.js');
        const tubeId = physics.getDefinitions().findIndex(definition => definition?.name === 'Tubing');
        const mixerPort = physics.getMachinePorts(machine.x, machine.y)[0];
        return {
            portId: mixerPort.id,
            anchor: mixerPort.connectionCell,
            atNineteen: game.getMachinePortAtClientPoint(center.x + 19, center.y, tubeId)?.id || null,
            beyondTwenty: game.getMachinePortAtClientPoint(center.x + 20.5, center.y, tubeId)?.id || null,
            tubeId,
            copperId: physics.getDefinitions().findIndex(definition => definition?.name === 'Copper')
        };
    }, { center, machine });
    expect(hitResults.atNineteen, 'the screen hit pad includes the 19px edge').toBe(hitResults.portId);
    expect(hitResults.beyondTwenty, 'screen-space proximity beyond 20px does not select the port').toBeNull();

    const before = Array.from((await game.state()).arrays.type);
    await page.mouse.move(center.x + 19, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 12, center.y, { steps: 2 });
    const preview = page.locator('[data-port-connector-preview]');
    await expect(preview).toHaveCount(1);
    const previewDetails = await preview.evaluate(node => ({
        startX: Number(node.getAttribute('data-start-client-x')),
        startY: Number(node.getAttribute('data-start-client-y')),
        endX: Number(node.getAttribute('data-end-client-x')),
        endY: Number(node.getAttribute('data-end-client-y')),
        width: Number(node.getAttribute('stroke-width'))
    }));
    expect(previewDetails.startX).toBeCloseTo(center.x, 0);
    expect(previewDetails.startY).toBeCloseTo(center.y, 0);
    const cellWidth = await page.locator('#canvas').evaluate(canvas =>
        canvas.getBoundingClientRect().width / canvas.width);
    expect(previewDetails.width).toBeCloseTo(cellWidth * 3, 0);
    await page.mouse.up();
    const attached = await game.state();
    expect(attached.arrays.type[hitResults.anchor.y * attached.cols + hitResults.anchor.x])
        .toBe(hitResults.tubeId);
    for (const cell of [
        hitResults.anchor,
        { x: hitResults.anchor.x - 1, y: hitResults.anchor.y },
        { x: hitResults.anchor.x + 1, y: hitResults.anchor.y },
        { x: hitResults.anchor.x, y: hitResults.anchor.y - 1 },
        { x: hitResults.anchor.x, y: hitResults.anchor.y + 1 }
    ]) {
        expect(attached.arrays.type[cell.y * attached.cols + cell.x],
            `forced size-3 port footprint includes ${cell.x},${cell.y}`).toBe(hitResults.tubeId);
    }
    expect(attached.arrays.type.flatMap((type, index) =>
        type !== before[index] && type !== hitResults.tubeId ? [type] : []),
    'Tubing port drag never paints another material').toEqual([]);

    await prepareMachines(page, [machine]);
    await page.evaluate(async ({ anchor, copperId }) => {
        const physics = await import('/physics.js');
        physics.setCell(anchor.x, anchor.y, copperId);
    }, { anchor: hitResults.anchor, copperId: hitResults.copperId });
    await game.step(0);
    const incompatibleBefore = Array.from((await game.state()).arrays.type);
    const incompatiblePort = page.locator(`#machineOverlay .machine-overlay-icon.machine-mixer circle[data-port-id="${hitResults.portId}"]`);
    const incompatibleBox = await incompatiblePort.boundingBox();
    const incompatibleStart = {
        x: incompatibleBox.x + incompatibleBox.width / 2,
        y: incompatibleBox.y + incompatibleBox.height / 2
    };
    await page.mouse.move(incompatibleStart.x, incompatibleStart.y);
    await page.mouse.down();
    await page.mouse.move(incompatibleStart.x + 9, incompatibleStart.y, { steps: 2 });
    await page.mouse.up();
    const incompatibleAfter = await game.state();
    expect(Array.from(incompatibleAfter.arrays.type),
        'a blocked Tubing-to-Copper port stroke is rejected atomically').toEqual(incompatibleBefore);
    expect(isRed(await incompatiblePort.evaluate(node => getComputedStyle(node).fill)),
        'an incompatible physical connector does not activate the Mixer input').toBe(true);
});

test('port and machine clicks open settings; port drags draw only a capped size-3 compatible connector', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const machines = [
        { name: 'Powder Storage Bin', key: 'storagePowder', x: 30, y: 30 },
        { name: 'Sprinkler', key: 'sprinkler', x: 30, y: 38 }
    ];
    await prepareMachines(page, machines);
    await game.step(0);

    const inputPort = page.locator('#machineOverlay .machine-overlay-icon.machine-sprinkler circle[data-port-id]');
    await expect(inputPort).toHaveCount(1);
    const portBox = await inputPort.boundingBox();
    expect(portBox).not.toBeNull();
    // A point slightly off the center still falls in the usable visible-port hit pad.
    await page.mouse.click(portBox.x + portBox.width / 2 + 1.5, portBox.y + portBox.height / 2);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('Sprinkler');
    await page.locator('#machineDialogCancel').click();

    const beforeBodyClick = Array.from((await game.state()).arrays.type);
    const body = await machineArtworkCellPoint(page, machines[1]);
    await page.mouse.click(body.x, body.y);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('#machineDialogCancel').click();
    expect(Array.from((await game.state()).arrays.type), 'clicking the face opens settings without painting').toEqual(beforeBodyClick);

    const setup = await page.evaluate(async machines => {
        const physics = await import('/physics.js');
        const ids = Object.fromEntries(physics.getDefinitions().map(definition =>
            [definition?.name, definition?.id]).filter(([name, id]) => name && Number.isInteger(id)));
        const source = machines[0];
        const destination = machines[1];
        const sourceOut = physics.getMachinePorts(source.x, source.y).find(port => port.role === 'output');
        const destIn = physics.getMachinePorts(destination.x, destination.y).find(port => port.role === 'input');
        const outCell = sourceOut.connectionCell;
        const inCell = destIn.connectionCell;
        physics.setCell(outCell.x, outCell.y, ids.Tubing);
        const sourceIndex = physics.index(source.x, source.y);
        const destinationIndex = physics.index(destination.x, destination.y);
        physics.getWorld().storageType[sourceIndex] = ids.Ash;
        physics.getWorld().storageCount[sourceIndex] = 200;
        physics.setSprinklerReleaseEnabled(destination.x, destination.y, false);
        const existingTube = { x: outCell.x, y: outCell.y };
        const machineAnchors = machines.map(machine => ({ x: machine.x, y: machine.y }));
        return {
            sourceOut: sourceOut.id, destIn: destIn.id, outCell, inCell, existingTube,
            machineAnchors, sourceIndex, destinationIndex, ids
        };
    }, machines);
    await game.step(0);

    const output = page.locator('#machineOverlay .machine-overlay-icon.machine-storagePowder circle.machine-port[data-port-role="output"]');
    const input = page.locator('#machineOverlay .machine-overlay-icon.machine-sprinkler circle.machine-port[data-port-role="input"]');
    const outputBox = await output.boundingBox();
    const inputBox = await input.boundingBox();
    expect(outputBox).not.toBeNull();
    expect(inputBox).not.toBeNull();
    const sourcePoint = { x: outputBox.x + outputBox.width / 2, y: outputBox.y + outputBox.height / 2 };
    const targetPoint = { x: inputBox.x + inputBox.width / 2, y: inputBox.y + inputBox.height / 2 };
    const connectorLength = Math.hypot(targetPoint.x - sourcePoint.x, targetPoint.y - sourcePoint.y);
    expect(connectorLength, 'paired visual port centers fit the 20 CSS px extension limit').toBeLessThanOrEqual(20);

    const beforeStroke = Array.from((await game.state()).arrays.type);

    await page.locator('#brushSize').evaluate(inputElement => {
        inputElement.value = '9';
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'Copper', exact: true }).click();
    await expect(page.locator('#brushSize')).toHaveValue('9');
    const selectionBefore = await page.locator('#particleButtons .particle-button.selected').textContent();

    await page.mouse.move(sourcePoint.x, sourcePoint.y);
    await page.mouse.down();
    await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 3 });
    await page.mouse.up();
    await expect(page.locator('#brushSize')).toHaveValue('9');
    await expect(page.locator('#particleButtons .particle-button.selected')).toHaveText(selectionBefore);

    await game.step(1);
    const after = await game.state();
    expect(after.arrays.type[setup.machineAnchors[0].y * after.cols + setup.machineAnchors[0].x])
        .toBe(after.definitions.find(definition => definition?.name === machines[0].name).id);
    expect(after.arrays.type[setup.machineAnchors[1].y * after.cols + setup.machineAnchors[1].x])
        .toBe(after.definitions.find(definition => definition?.name === machines[1].name).id);
    expect(after.arrays.type[setup.inCell.y * after.cols + setup.inCell.x],
        'the forced port stroke reaches the Sprinkler logical anchor').toBe(setup.ids.Tubing);
    const flows = await page.evaluate(async () => (await import('/physics.js')).getTubingFlows());
    expect(flows.some(flow => flow.source === setup.sourceIndex &&
        flow.destination === setup.destinationIndex && flow.material === setup.ids.Ash),
    'the port stroke joins a real storage-to-Sprinkler Tubing network').toBe(true);
    const changedNonTube = after.arrays.type.flatMap((type, i) =>
        type !== beforeStroke[i] && type !== setup.ids.Tubing ? [{ i, type }] : []);
    expect(changedNonTube, 'a port stroke paints only its compatible Tubing family').toEqual([]);
    const finalState = await game.state();
    const tubeCells = [];
    for (let i = 0; i < finalState.arrays.type.length; i++) {
        if (finalState.arrays.type[i] === setup.ids.Tubing) tubeCells.push(i);
    }
    expect(tubeCells.length).toBeGreaterThan(1);
    expect(finalState.arrays.type[setup.outCell.y * finalState.cols + setup.outCell.x])
        .toBe(setup.ids.Tubing);
    expect(finalState.arrays.type[setup.inCell.y * finalState.cols + setup.inCell.x])
        .toBe(setup.ids.Tubing);
    for (const { x, y } of setup.machineAnchors) {
        expect(finalState.arrays.type[y * finalState.cols + x]).not.toBe(setup.ids.Tubing);
    }
});

test('a Copper port drag stays Copper at size 3 and activates its powered machine', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const machine = { name: 'Fan', key: 'fan', x: 95, y: 58 };
    await prepareMachines(page, [machine]);
    await game.step(0);
    const fanIcon = page.locator('#machineOverlay .machine-overlay-icon.machine-fan');
    const fanIconBox = await fanIcon.boundingBox();
    const gridSize = await page.locator('#canvas').evaluate(element => ({
        width: element.getBoundingClientRect().width / element.width,
        height: element.getBoundingClientRect().height / element.height
    }));
    expect(fanIconBox).not.toBeNull();
    await page.locator('#brushSize').fill('31');
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    const spillPoint = {
        x: fanIconBox.x + fanIconBox.width / 2,
        y: fanIconBox.y + fanIconBox.height + gridSize.height
    };
    await page.mouse.click(spillPoint.x, spillPoint.y);
    const protectedFace = await game.state();
    const faceCells = await page.evaluate(async ({ icon, machine }) => {
        const canvas = document.querySelector('#canvas');
        const rect = canvas.getBoundingClientRect();
        const renderedIcon = document.querySelector(
            `#machineOverlay .machine-overlay-icon[data-machine-x="${machine.x}"][data-machine-y="${machine.y}"]`);
        const frame = renderedIcon?.querySelector(':scope > svg');
        const artwork = frame?.querySelector('image');
        if (!frame || !artwork) throw new Error('Expected the Fan artwork image frame.');
        const response = await fetch('/resources/icons.png');
        const bitmap = await createImageBitmap(await response.blob());
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = bitmap.width;
        sampleCanvas.height = bitmap.height;
        const context = sampleCanvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
        bitmap.close();
        const opaque = [];
        const transparent = [];
        const inverse = frame.getScreenCTM().inverse();
        const viewBox = frame.viewBox.baseVal;
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
            const screenX = rect.left + ((x + 0.5) / canvas.width) * rect.width;
            const screenY = rect.top + ((y + 0.5) / canvas.height) * rect.height;
            if (screenX >= icon.x && screenX < icon.x + icon.width &&
                screenY >= icon.y && screenY < icon.y + icon.height &&
                (x !== machine.x || y !== machine.y)) {
                const local = new DOMPoint(screenX, screenY).matrixTransform(inverse);
                if (local.x < viewBox.x || local.y < viewBox.y ||
                    local.x >= viewBox.x + viewBox.width || local.y >= viewBox.y + viewBox.height) continue;
                const px = Math.floor(local.x);
                const py = Math.floor(local.y);
                const pixel = { x, y };
                if (pixels[(py * sampleCanvas.width + px) * 4 + 3] > 0) opaque.push(pixel);
                else transparent.push(pixel);
            }
        }
        return { opaque, transparent };
    }, { icon: fanIconBox, machine });
    const paintedUnderFace = [...faceCells.opaque, ...faceCells.transparent].filter(({ x, y }) =>
        protectedFace.arrays.type[y * protectedFace.cols + x] !== 0);
    const paintedOverArtwork = faceCells.opaque.filter(({ x, y }) =>
        protectedFace.arrays.type[y * protectedFace.cols + x] !== 0);
    const paintedThroughTransparent = faceCells.transparent.filter(({ x, y }) =>
        protectedFace.arrays.type[y * protectedFace.cols + x] !== 0);
    expect(paintedUnderFace.length, 'the large brush reaches pixels within the 64px face').toBeGreaterThan(0);
    expect(paintedThroughTransparent.length, 'transparent pixels within the artwork face remain paintable').toBeGreaterThan(0);
    expect(paintedOverArtwork, 'a large ordinary brush cannot paint opaque machine artwork pixels').toEqual([]);

    await page.locator('#grabberButton').click();
    const grabStart = await canvasPoint(page, { x: machine.x, y: machine.y });
    const grabEnd = await canvasPoint(page, { x: machine.x + 16, y: machine.y });
    await page.mouse.move(grabStart.x, grabStart.y);
    await page.mouse.down();
    await page.mouse.move(grabEnd.x, grabEnd.y, { steps: 4 });
    await page.mouse.up();
    const grabbedState = await game.state();
    expect(grabbedState.arrays.type[machine.y * grabbedState.cols + machine.x + 16],
        'Grabber can still move a machine through its visible face').toBe(
        grabbedState.definitions.find(definition => definition?.name === 'Fan').id);
    await page.locator('#grabberButton').click();
    const endpoint = await page.evaluate(async machine => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        physics.clearWorld();
        physics.setCell(machine.x, machine.y, id('Fan'));
        const port = physics.getMachinePorts(machine.x, machine.y)[0];
        const targetKeys = new Set([`${port.connectionCell.x},${port.connectionCell.y}`]);
        let cell = null;
        for (let distance = 2; distance <= 7 && !cell; distance++) {
            const x = Math.round(port.connectionCell.x + port.directionX * distance);
            const y = Math.round(port.connectionCell.y + port.directionY * distance);
            if (!targetKeys.has(`${x},${y}`) && physics.getWorld().type[physics.index(x, y)] === 0) {
                cell = { x, y };
            }
        }
        if (!cell) return null;
        const directionX = Math.sign(port.directionX);
        const directionY = Math.sign(port.directionY);
        const battery = { x: cell.x + directionX, y: cell.y + directionY };
        physics.setCell(cell.x, cell.y, id('Copper'));
        physics.setCell(battery.x, battery.y, id('Battery'));
        physics.getWorld().charge[physics.index(battery.x, battery.y)] =
            definitions[id('Battery')].chargeCapacity;
        physics.stepSimulation();
        return {
            cell, battery, port: port.id, portTarget: port.connectionCell,
            poweredBefore: physics.isPowered(machine.x, machine.y),
            copperId: id('Copper'), tubingId: id('Tubing'), fanId: id('Fan')
        };
    }, machine);
    expect(endpoint).not.toBeNull();
    expect(endpoint.poweredBefore).toBe(false);
    await game.step(0);

    const portCircle = page.locator('#machineOverlay .machine-overlay-icon.machine-fan circle.machine-port[data-port-id]');
    await expect(portCircle).toHaveCount(1);
    const portBox = await portCircle.boundingBox();
    expect(portBox).not.toBeNull();
    const start = { x: portBox.x + portBox.width / 2, y: portBox.y + portBox.height / 2 };
    const target = await canvasPoint(page, endpoint.cell);
    expect(Math.hypot(target.x - start.x, target.y - start.y),
        'the existing Copper cable endpoint is within the 20 CSS px extension limit').toBeLessThanOrEqual(20);
    const before = Array.from((await game.state()).arrays.type);
    await page.locator('#brushSize').evaluate(input => {
        input.value = '9';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'Tubing', exact: true }).click();
    const selectedMaterial = await page.locator('#particleButtons .particle-button.selected').textContent();
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 3 });
    await page.mouse.up();
    await expect(page.locator('#brushSize')).toHaveValue('9');
    await expect(page.locator('#particleButtons .particle-button.selected')).toHaveText(selectedMaterial);
    await game.step(1);

    const state = await game.state();
    const changed = state.arrays.type.flatMap((type, i) =>
        type !== before[i] ? [{ i, type }] : []);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every(cell => cell.type === endpoint.copperId),
        'a powered-machine connector is Copper even if Tubing was selected').toBe(true);
    expect(state.arrays.type[endpoint.cell.y * state.cols + endpoint.cell.x]).toBe(endpoint.copperId);
    expect(state.arrays.type[endpoint.portTarget.y * state.cols + endpoint.portTarget.x]).toBe(endpoint.copperId);
    expect(await page.evaluate(async ({ machine }) =>
        (await import('/physics.js')).isMachinePoweredAt(machine.x, machine.y), { machine })).toBe(true);
    expect(state.arrays.type[machine.y * state.cols + machine.x]).toBe(endpoint.fanId);
});

test('blocked port drags are atomic, open drags clamp to 20 CSS px, and zoom preserves hit geometry', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const machine = { name: 'Mixer', key: 'mixer', x: 80, y: 60 };
    await prepareMachines(page, [machine]);
    await game.step(0);

    const port = page.locator('#machineOverlay .machine-overlay-icon.machine-mixer circle[data-port-id]').first();
    const initialBox = await port.boundingBox();
    const marker = await port.evaluate(node => ({
        cx: Number(node.getAttribute('cx')), cy: Number(node.getAttribute('cy')),
        viewBox: node.ownerSVGElement.getAttribute('viewBox'),
        targetId: node.dataset.portId
    }));
    const originalConnectionCell = await page.evaluate(async ({ machine, portId }) => {
        const physics = await import('/physics.js');
        return physics.getMachinePorts(machine.x, machine.y)
            .find(candidate => candidate.id === portId).connectionCell;
    }, { machine, portId: marker.targetId });
    expect(initialBox).not.toBeNull();
    const start = { x: initialBox.x + initialBox.width / 2, y: initialBox.y + initialBox.height / 2 };
    const canvas = await page.locator('#canvas').evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height,
            cols: element.width, rows: element.height };
    });
    const blockerCell = {
        x: Math.max(1, Math.floor(((start.x - 12 - canvas.left) / canvas.width) * canvas.cols)),
        y: Math.max(1, Math.floor(((start.y - canvas.top) / canvas.height) * canvas.rows))
    };
    await page.evaluate(async ({ machine, blockerCell }) => {
        const physics = await import('/physics.js');
        physics.setCell(blockerCell.x, blockerCell.y,
            physics.getDefinitions().findIndex(d => d?.name === 'Stone'));
    }, { machine, blockerCell });
    await game.step(0);
    const obstructedBefore = (await game.state()).arrays.type;
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x - 12, start.y, { steps: 3 });
    await page.mouse.up();
    const obstructedAfter = await game.state();
    expect(Array.from(obstructedAfter.arrays.type)).toEqual(Array.from(obstructedBefore));

    await page.evaluate(async blockerCell => {
        const physics = await import('/physics.js');
        physics.setCell(blockerCell.x, blockerCell.y, 0);
    }, blockerCell);
    await game.step(0);

    const canvasArea = await page.locator('#canvasArea').boundingBox();
    await page.mouse.move(canvasArea.x + canvasArea.width / 2, canvasArea.y + canvasArea.height / 2);
    await page.mouse.wheel(0, -120);
    await expect(page.locator('#canvasArea')).toHaveAttribute('data-zoom-level', '2');
    await game.step(0);
    const zoomedPort = page.locator(`#machineOverlay .machine-overlay-icon.machine-mixer circle[data-port-id="${marker.targetId}"]`);
    const zoomedBox = await zoomedPort.boundingBox();
    expect(zoomedBox).not.toBeNull();
    const zoomedMarker = await zoomedPort.evaluate(node => ({
        cx: Number(node.getAttribute('cx')), cy: Number(node.getAttribute('cy')),
        viewBox: node.ownerSVGElement.getAttribute('viewBox')
    }));
    expect(zoomedMarker).toEqual({ cx: marker.cx, cy: marker.cy, viewBox: marker.viewBox });
    const zoomedConnectionCell = await page.evaluate(async ({ machine, portId }) => {
        const physics = await import('/physics.js');
        return physics.getMachinePorts(machine.x, machine.y)
            .find(candidate => candidate.id === portId).connectionCell;
    }, { machine, portId: marker.targetId });
    expect(zoomedConnectionCell, 'zoom changes only screen geometry, not the logical port anchor')
        .toEqual(originalConnectionCell);
    const hitTarget = page.locator(`#machineOverlay [data-port-hit-target="${marker.targetId}"]`);
    const hitBox = await hitTarget.boundingBox();
    expect(hitBox).not.toBeNull();
    expect(hitBox.width).toBeCloseTo(40, 0);
    expect(hitBox.height).toBeCloseTo(40, 0);
    await page.mouse.click(zoomedBox.x + zoomedBox.width / 2 + 1.5, zoomedBox.y + zoomedBox.height / 2);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('#mixerDialogCancel').click();

    const zoomedEndpoints = await page.evaluate(async machine => {
        const physics = await import('/physics.js');
        const circle = document.querySelector('#machineOverlay .machine-overlay-icon.machine-mixer circle[data-port-id]');
        const canvas = document.querySelector('#canvas');
        const circleRect = circle.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const center = { x: circleRect.left + circleRect.width / 2, y: circleRect.top + circleRect.height / 2 };
        const port = physics.getMachinePorts(machine.x, machine.y).find(item => item.id === circle.dataset.portId);
        const allTargetCells = new Set(physics.getMachinePorts(machine.x, machine.y)
            .map(item => `${item.connectionCell.x},${item.connectionCell.y}`));
        const cellWidth = canvasRect.width / canvas.width;
        const cellHeight = canvasRect.height / canvas.height;
        const anchorPoint = {
            x: canvasRect.left + ((port.connectionCell.x + 0.5) / canvas.width) * canvasRect.width,
            y: canvasRect.top + ((port.connectionCell.y + 0.5) / canvas.height) * canvasRect.height
        };
        const anchorOffset = Math.hypot(anchorPoint.x - center.x, anchorPoint.y - center.y);
        const brushClearance = Math.max(cellWidth, cellHeight);
        const candidates = [];
        for (let distance = 1; distance <= 18; distance++) {
            const x = Math.round(port.connectionCell.x + port.directionX * distance);
            const y = Math.round(port.connectionCell.y + port.directionY * distance);
            const key = `${x},${y}`;
            if (allTargetCells.has(key) || physics.getWorld().type[physics.index(x, y)] !== 0) continue;
            const point = {
                x: canvasRect.left + ((x + 0.5) / canvas.width) * canvasRect.width,
                y: canvasRect.top + ((y + 0.5) / canvas.height) * canvasRect.height
            };
            candidates.push({ x, y, point, distance: Math.hypot(point.x - center.x, point.y - center.y),
                strokeClearance: brushClearance });
        }
        return {
            portId: port.id,
            near: candidates.find(candidate => candidate.distance >= 12 && candidate.distance <= 19),
            far: candidates.find(candidate => candidate.distance > 20 + anchorOffset + candidate.strokeClearance &&
                candidate.distance <= 80),
            tubingId: physics.getDefinitions().findIndex(definition => definition?.name === 'Tubing')
        };
    }, machine);
    expect(zoomedEndpoints.near, 'zoomed fixture has a compatible point within 20 CSS px').toBeTruthy();
    expect(zoomedEndpoints.far, 'zoomed fixture has a compatible point beyond the 20 CSS px limit').toBeTruthy();

    await page.evaluate(async ({ cell, tubingId }) => {
        const physics = await import('/physics.js');
        physics.setCell(cell.x, cell.y, tubingId);
    }, { cell: zoomedEndpoints.far, tubingId: zoomedEndpoints.tubingId });
    await game.step(0);
    const farPort = page.locator(`#machineOverlay .machine-overlay-icon.machine-mixer circle[data-port-id="${zoomedEndpoints.portId}"]`);
    const farFill = await farPort.evaluate(node => getComputedStyle(node).fill);
    expect(isRed(farFill), 'a compatible-looking Tube beyond the screen-space extension is still idle').toBe(true);
    const beforeFarDrag = Array.from((await game.state()).arrays.type);
    const farBox = await farPort.boundingBox();
    await page.mouse.move(farBox.x + farBox.width / 2, farBox.y + farBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(zoomedEndpoints.far.point.x, zoomedEndpoints.far.point.y, { steps: 4 });
    const preview = page.locator('[data-port-connector-preview]');
    await expect(preview).toHaveCount(1);
    const previewGeometry = await preview.evaluate(node => ({
        startX: Number(node.getAttribute('data-start-client-x')),
        startY: Number(node.getAttribute('data-start-client-y')),
        endX: Number(node.getAttribute('data-end-client-x')),
        endY: Number(node.getAttribute('data-end-client-y')),
        width: Number(node.getAttribute('stroke-width'))
    }));
    expect(Math.hypot(previewGeometry.endX - previewGeometry.startX,
        previewGeometry.endY - previewGeometry.startY)).toBeCloseTo(20, 0);
    const zoomCellWidth = await page.locator('#canvas').evaluate(element =>
        element.getBoundingClientRect().width / element.width);
    expect(previewGeometry.width).toBeCloseTo(zoomCellWidth * 3, 0);
    await page.mouse.up();
    const cappedFarState = await game.state();
    const cappedChanges = cappedFarState.arrays.type.flatMap((type, i) =>
        type !== beforeFarDrag[i] ? [{ i, type }] : []);
    expect(cappedChanges.length, 'an overlength open connector commits a capped stroke').toBeGreaterThan(0);
    expect(cappedChanges.every(change => change.type === zoomedEndpoints.tubingId),
        'an open port connector paints only its compatible Tubing family').toBe(true);
    expect(cappedFarState.arrays.type[
        zoomedConnectionCell.y * cappedFarState.cols + zoomedConnectionCell.x]).toBe(zoomedEndpoints.tubingId);
    expect(isRed(await farPort.evaluate(node => getComputedStyle(node).fill)),
        'the port stays idle while its own tagged lead has no external Tubing contact').toBe(true);

    const openConnectorCells = cappedChanges.map(({ i }) => i);
    await page.evaluate(async ({ addedCells, far, near, tubingId }) => {
        const physics = await import('/physics.js');
        for (const i of addedCells) physics.setCell(i % physics.getWorld().cols,
            Math.floor(i / physics.getWorld().cols), 0);
        physics.setCell(far.x, far.y, 0);
        physics.setCell(near.x, near.y, tubingId);
    }, { addedCells: openConnectorCells, far: zoomedEndpoints.far, near: zoomedEndpoints.near,
        tubingId: zoomedEndpoints.tubingId });
    await game.step(0);
    const nearBox = await farPort.boundingBox();
    const nearStart = { x: nearBox.x + nearBox.width / 2, y: nearBox.y + nearBox.height / 2 };
    expect(Math.hypot(zoomedEndpoints.near.point.x - nearStart.x,
        zoomedEndpoints.near.point.y - nearStart.y)).toBeLessThanOrEqual(20);
    const idleBeforeNear = await farPort.evaluate(node => getComputedStyle(node).fill);
    expect(isRed(idleBeforeNear), 'nearby but unattached Tube does not connect through proximity alone').toBe(true);
    const hitBoxZoomed = await page.locator(`#machineOverlay [data-port-hit-target="${zoomedEndpoints.portId}"]`).boundingBox();
    expect(hitBoxZoomed.width).toBeCloseTo(40, 0);
    expect(hitBoxZoomed.height).toBeCloseTo(40, 0);
    const beforeNearDrag = Array.from((await game.state()).arrays.type);
    await page.locator('#brushSize').fill('9');
    await page.getByRole('button', { name: 'Copper', exact: true }).click();
    const selectionBeforeNearDrag = await page.locator('#particleButtons .particle-button.selected').textContent();
    await page.mouse.move(nearStart.x, nearStart.y);
    await page.mouse.down();
    const longTarget = {
        x: nearStart.x + ((zoomedEndpoints.near.point.x - nearStart.x) /
            Math.hypot(zoomedEndpoints.near.point.x - nearStart.x,
                zoomedEndpoints.near.point.y - nearStart.y)) * 80,
        y: nearStart.y + ((zoomedEndpoints.near.point.y - nearStart.y) /
            Math.hypot(zoomedEndpoints.near.point.x - nearStart.x,
                zoomedEndpoints.near.point.y - nearStart.y)) * 80
    };
    await page.mouse.move(longTarget.x, longTarget.y, { steps: 4 });
    await expect(preview).toHaveCount(1);
    const nearPreviewGeometry = await preview.evaluate(node => ({
        startX: Number(node.getAttribute('data-start-client-x')),
        startY: Number(node.getAttribute('data-start-client-y')),
        endX: Number(node.getAttribute('data-end-client-x')),
        endY: Number(node.getAttribute('data-end-client-y')),
        width: Number(node.getAttribute('stroke-width'))
    }));
    expect(Math.hypot(nearPreviewGeometry.endX - nearPreviewGeometry.startX,
        nearPreviewGeometry.endY - nearPreviewGeometry.startY)).toBeCloseTo(20, 0);
    expect(nearPreviewGeometry.width).toBeCloseTo(zoomCellWidth * 3, 0);
    await page.mouse.up();
    await expect(page.locator('#brushSize')).toHaveValue('9');
    await expect(page.locator('#particleButtons .particle-button.selected')).toHaveText(selectionBeforeNearDrag);
    await game.step(0);
    const connectedFill = await farPort.evaluate(node => getComputedStyle(node).fill);
    expect(isGreen(connectedFill), 'a size-3 connector within the zoomed 20px cap physically attaches').toBe(true);
    const connectedState = await game.state();
    expect(connectedState.arrays.type[zoomedConnectionCell.y * connectedState.cols + zoomedConnectionCell.x])
        .toBe(zoomedEndpoints.tubingId);
    const changedMaterials = connectedState.arrays.type.flatMap((type, i) =>
        type !== beforeNearDrag[i] ? [{ i, type }] : []);
    expect(changedMaterials.length).toBeGreaterThan(0);
    expect(changedMaterials.every(change => change.type === zoomedEndpoints.tubingId),
        'the capped port gesture adds only compatible Tubing').toBe(true);
    const capMetrics = await page.locator('#canvas').evaluate(canvas => {
        const rect = canvas.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height,
            cols: canvas.width, rows: canvas.height };
    });
    const ray = {
        x: (zoomedEndpoints.near.point.x - nearStart.x) /
            Math.hypot(zoomedEndpoints.near.point.x - nearStart.x,
                zoomedEndpoints.near.point.y - nearStart.y),
        y: (zoomedEndpoints.near.point.y - nearStart.y) /
            Math.hypot(zoomedEndpoints.near.point.x - nearStart.x,
                zoomedEndpoints.near.point.y - nearStart.y)
    };
    const maxStrokeProjection = Math.max(...changedMaterials.map(({ i }) => {
        const point = {
            x: capMetrics.left + (((i % capMetrics.cols) + 0.5) / capMetrics.cols) * capMetrics.width,
            y: capMetrics.top + ((Math.floor(i / capMetrics.cols) + 0.5) / capMetrics.rows) * capMetrics.height
        };
        return (point.x - nearStart.x) * ray.x + (point.y - nearStart.y) * ray.y;
    }));
    const brushRadius = 1.5 * Math.max(capMetrics.width / capMetrics.cols, capMetrics.height / capMetrics.rows);
    expect(maxStrokeProjection).toBeGreaterThan(10);
    expect(maxStrokeProjection).toBeLessThanOrEqual(20 + brushRadius);

    await page.mouse.click(nearStart.x, nearStart.y);
    await expect(page.locator('#mixerDialog')).toBeVisible();
    await page.locator('#mixerDialogCancel').click();
    const connectedBeforeExtension = Array.from((await game.state()).arrays.type);
    const extensionTarget = { x: nearStart.x - ray.y * 24, y: nearStart.y + ray.x * 24 };
    await page.mouse.move(nearStart.x, nearStart.y);
    await page.mouse.down();
    await page.mouse.move(extensionTarget.x, extensionTarget.y, { steps: 3 });
    await expect(preview).toHaveCount(1);
    const extensionGeometry = await preview.evaluate(node => ({
        startX: Number(node.getAttribute('data-start-client-x')),
        startY: Number(node.getAttribute('data-start-client-y')),
        endX: Number(node.getAttribute('data-end-client-x')),
        endY: Number(node.getAttribute('data-end-client-y')),
        width: Number(node.getAttribute('stroke-width'))
    }));
    const extensionPreviewLength = Math.hypot(extensionGeometry.endX - extensionGeometry.startX,
        extensionGeometry.endY - extensionGeometry.startY);
    expect(extensionPreviewLength).toBeCloseTo(20, 0);
    expect(extensionGeometry.width).toBeCloseTo(zoomCellWidth * 3, 0);
    await page.mouse.up();
    const connectedExtension = await game.state();
    const extensionChanges = connectedExtension.arrays.type.flatMap((type, i) =>
        type !== connectedBeforeExtension[i] ? [{ i, type }] : []);
    expect(extensionChanges.length, 'dragging from an already connected port extends its Tubing branch')
        .toBeGreaterThan(0);
    expect(extensionChanges.every(change => change.type === zoomedEndpoints.tubingId),
        'connected-port extension remains forced to Tubing').toBe(true);
    expect(connectedExtension.arrays.type[
        zoomedConnectionCell.y * connectedExtension.cols + zoomedConnectionCell.x])
        .toBe(zoomedEndpoints.tubingId);
    expect(await page.locator('#brushSize').inputValue()).toBe('9');
    expect(await page.locator('#particleButtons .particle-button.selected').textContent())
        .toBe(selectionBeforeNearDrag);

    await page.setViewportSize({ width: 1120, height: 760 });
    await game.step(0);
    const resizedBox = await zoomedPort.boundingBox();
    expect(resizedBox).not.toBeNull();
    const resizedHitBox = await page.locator(
        `#machineOverlay [data-port-hit-target="${zoomedEndpoints.portId}"]`).boundingBox();
    expect(resizedHitBox.width).toBeCloseTo(40, 0);
    expect(resizedHitBox.height).toBeCloseTo(40, 0);
    expect(resizedHitBox.x + resizedHitBox.width / 2)
        .toBeCloseTo(resizedBox.x + resizedBox.width / 2, 0);
    expect(resizedHitBox.y + resizedHitBox.height / 2)
        .toBeCloseTo(resizedBox.y + resizedBox.height / 2, 0);
    const resizedConnectionCell = await page.evaluate(async ({ machine, portId }) => {
        const physics = await import('/physics.js');
        return physics.getMachinePorts(machine.x, machine.y)
            .find(candidate => candidate.id === portId).connectionCell;
    }, { machine, portId: zoomedEndpoints.portId });
    expect(resizedConnectionCell).toEqual(originalConnectionCell);
    await page.mouse.click(resizedBox.x + resizedBox.width / 2, resizedBox.y + resizedBox.height / 2);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('#mixerDialogCancel').click();
});

test('rotated machine artwork, port projection, hit target, and painting follow canvas zoom', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const machine = { name: 'Liquid Storage Bin', key: 'storageLiquid', x: 80, y: 60 };
    await prepareMachines(page, [machine]);
    await page.evaluate(async machine => {
        const physics = await import('/physics.js');
        physics.getWorld().data[physics.index(machine.x, machine.y)] = 5;
    }, machine);
    await page.getByRole('button', { name: 'Glass', exact: true }).click();
    await game.step(0);

    const measure = async () => page.evaluate(async machine => {
        const physics = await import('/physics.js');
        const game = await import('/game.js');
        const canvas = document.querySelector('#canvas');
        const rect = canvas.getBoundingClientRect();
        const icon = document.querySelector('#machineOverlay .machine-storageLiquid');
        const matrix = icon.getScreenCTM();
        const center = new DOMPoint(32, 32).matrixTransform(matrix);
        const expectedCenter = {
            x: rect.left + (machine.x + 0.5) / canvas.width * rect.width,
            y: rect.top + (machine.y + 0.5) / canvas.height * rect.height
        };
        const tubingId = physics.getDefinitions().findIndex(definition => definition?.name === 'Tubing');
        const ports = physics.getMachinePorts(machine.x, machine.y).map(port => {
            const circle = icon.querySelector(`circle[data-port-id="${port.id}"]`);
            const marker = new DOMPoint(Number(circle.getAttribute('cx')), Number(circle.getAttribute('cy')))
                .matrixTransform(circle.getScreenCTM());
            const stub = [...icon.querySelectorAll('[data-port-stub]')]
                .find(path => path.getAttribute('data-port-stub') === port.id);
            const end = stub.getPointAtLength(stub.getTotalLength())
                .matrixTransform(stub.getScreenCTM());
            const anchor = {
                x: rect.left + (port.connectionCell.x + 0.5) / canvas.width * rect.width,
                y: rect.top + (port.connectionCell.y + 0.5) / canvas.height * rect.height
            };
            return {
                id: port.id,
                markerDelta: { x: marker.x - center.x, y: marker.y - center.y },
                stubError: Math.hypot(end.x - anchor.x, end.y - anchor.y),
                hitId: game.getMachinePortAtClientPoint(marker.x + 1.5, marker.y, tubingId)?.id || null,
                marker
            };
        });
        return {
            cellWidth: rect.width / canvas.width,
            cellHeight: rect.height / canvas.height,
            iconSize: 64 * Math.hypot(matrix.a, matrix.b),
            centerError: Math.hypot(center.x - expectedCenter.x, center.y - expectedCenter.y),
            ports
        };
    }, machine);

    await scrollCanvasToCell(page, machine);
    await game.step(0);
    const initial = await measure();
    const initialPort = page.locator(
        '#machineOverlay .machine-overlay-icon.machine-storageLiquid circle.machine-port[data-port-role="input"]');
    const initialPortId = await initialPort.getAttribute('data-port-id');
    const initialMarker = initial.ports.find(port => port.id === initialPortId)?.marker;
    await page.mouse.click(initialMarker.x + 1.5, initialMarker.y);
    await expect(page.locator('#machineDialog')).toBeVisible();
    await page.locator('#machineDialogCancel').click();

    const paintCell = { x: machine.x + 10, y: machine.y + 10 };
    let paintPoint = await canvasPoint(page, paintCell);
    await page.mouse.click(paintPoint.x, paintPoint.y);
    const glassId = (await game.state()).definitions.find(definition => definition?.name === 'Glass').id;
    const paintedAtDefault = await game.state();

    const canvasArea = await page.locator('#canvasArea').boundingBox();
    await page.mouse.move(canvasArea.x + canvasArea.width / 2, canvasArea.y + canvasArea.height / 2);
    await page.mouse.wheel(0, -120);
    await expect(page.locator('#canvasArea')).toHaveAttribute('data-zoom-level', '2');
    await game.step(0);
    await scrollCanvasToCell(page, machine);
    await game.step(0);
    const zoomed = await measure();
    const zoomedPort = page.locator(
        '#machineOverlay .machine-overlay-icon.machine-storageLiquid circle.machine-port[data-port-role="input"]');
    const zoomedPortId = await zoomedPort.getAttribute('data-port-id');
    const zoomedMarker = zoomed.ports.find(port => port.id === zoomedPortId)?.marker;
    await page.mouse.click(zoomedMarker.x + 1.5, zoomedMarker.y);
    await expect(page.locator('#machineDialog')).toBeVisible();
    await page.locator('#machineDialogCancel').click();

    paintPoint = await canvasPoint(page, paintCell);
    await page.mouse.click(paintPoint.x, paintPoint.y);
    const paintedAtZoom = await game.state();
    const zoomRatio = zoomed.cellWidth / initial.cellWidth;
    expect(initial.iconSize).toBeCloseTo(64, 0);
    expect(zoomed.iconSize, 'machine artwork scales by the canvas zoom factor').toBeCloseTo(
        initial.iconSize * zoomRatio, 0);
    expect(initial.centerError).toBeLessThanOrEqual(0.75);
    expect(zoomed.centerError, 'rotated artwork stays centered on its world cell at zoom').toBeLessThanOrEqual(0.75);
    expect(initial.cellWidth / initial.cellHeight).toBeCloseTo(1, 2);
    expect(zoomed.cellWidth / zoomed.cellHeight).toBeCloseTo(1, 2);
    for (const before of initial.ports) {
        const after = zoomed.ports.find(port => port.id === before.id);
        expect(after, `${before.id} remains rendered after zoom`).toBeTruthy();
        expect(after.markerDelta.x, `${before.id} marker x scales with the grid`)
            .toBeCloseTo(before.markerDelta.x * zoomRatio, 0);
        expect(after.markerDelta.y, `${before.id} marker y scales with the grid`)
            .toBeCloseTo(before.markerDelta.y * zoomRatio, 0);
        expect(before.stubError, `${before.id} default stub meets its connection cell`).toBeLessThanOrEqual(0.75);
        expect(after.stubError, `${before.id} zoomed stub meets its connection cell`).toBeLessThanOrEqual(0.75);
        expect(before.hitId, `${before.id} default marker remains hittable`).toBe(before.id);
        expect(after.hitId, `${before.id} zoomed marker remains hittable`).toBe(before.id);
    }
    const paintIndex = paintCell.y * paintedAtZoom.cols + paintCell.x;
    expect(paintedAtDefault.arrays.type[paintIndex], 'paint maps to the selected grid cell at default scale')
        .toBe(glassId);
    expect(paintedAtZoom.arrays.type[paintIndex], 'paint maps to the same grid cell after zoom')
        .toBe(glassId);
});
