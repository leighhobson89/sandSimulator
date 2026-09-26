import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { machineArtworkCellPoint } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'logic gates');
});

const gates = [
    { name: 'NOT', signalInputs: 1, evaluate: ([a]) => !a, vectors: [[false], [true]] },
    { name: 'AND', signalInputs: 2, evaluate: ([a, b]) => a && b, vectors: [[false, false], [false, true], [true, false], [true, true]] },
    { name: 'OR', signalInputs: 2, evaluate: ([a, b]) => a || b, vectors: [[false, false], [false, true], [true, false], [true, true]] },
    { name: 'NAND', signalInputs: 2, evaluate: ([a, b]) => !(a && b), vectors: [[false, false], [false, true], [true, false], [true, true]] },
    { name: 'XOR', signalInputs: 2, evaluate: ([a, b]) => a !== b, vectors: [[false, false], [false, true], [true, false], [true, true]] }
];

async function runGateVector(page, { gate, values, supply = true }) {
    return page.evaluate(async ({ gate, values, supply }) => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const gateDefinition = definitions.find(definition =>
            definition?.name === gate || definition?.name === `${gate} Gate`);
        if (!gateDefinition) throw new Error(`Missing catalog definition for ${gate} gate`);

        physics.clearWorld();
        const machine = { x: 90, y: 45 };
        physics.setCell(machine.x, machine.y, gateDefinition.id);
        const ports = physics.getMachinePorts(machine.x, machine.y);
        const supplyPort = ports.find(port => port.role === 'input' && /power|supply/i.test(port.id));
        const signalPorts = ports.filter(port => port.role === 'input' && port !== supplyPort);
        const output = ports.find(port => port.role === 'output');
        if (!supplyPort || !output || signalPorts.length !== values.length) {
            throw new Error(`${gate} gate port contract mismatch: ${JSON.stringify(ports)}`);
        }

        const world = physics.getWorld();
        const battery = definitions.find(definition => definition?.name === 'Battery');
        const elec = definitions.findIndex(definition => definition?.name === 'Elec');
        function connect(port, powered) {
            const dx = Math.sign(port.directionX);
            const dy = Math.sign(port.directionY);
            const length = 4;
            for (let offset = 0; offset <= length; offset++) {
                const x = port.connectionCell.x + dx * offset;
                const y = port.connectionCell.y + dy * offset;
                physics.setCell(x, y, elec);
            }
            if (!powered) return;
            const x = port.connectionCell.x + dx * (length + 1);
            const y = port.connectionCell.y + dy * (length + 1);
            physics.setCell(x, y, battery.id);
            world.charge[physics.index(x, y)] = battery.chargeCapacity;
        }

        connect(supplyPort, supply);
        signalPorts.forEach((port, index) => connect(port, values[index]));
        connect(output, false);
        physics.stepSimulation();
        const outputCell = output.connectionCell;
        return {
            gate,
            values,
            supply,
            output: world.logicalPower[physics.index(outputCell.x, outputCell.y)] > 0,
            ports: ports.map(port => ({
                id: port.id,
                role: port.role,
                family: port.family,
                connectorMaterial: port.connectorMaterial,
                connectorBrushWidth: port.connectorBrushWidth,
                connectionCell: port.connectionCell,
                directionX: port.directionX,
                directionY: port.directionY
            }))
        };
    }, { gate, values, supply });
}

async function runAndLampCircuit(page, signalValues) {
    return page.evaluate(async signalValues => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        physics.clearWorld();
        const gate = { x: 90, y: 45 };
        const lamp = { x: 130, y: 45 };
        physics.setCell(gate.x, gate.y, id('AND'));
        physics.setCell(lamp.x, lamp.y, id('Lamp'));
        const world = physics.getWorld();
        const lampIndex = physics.index(lamp.x, lamp.y);
        let lampFacing = 0;
        let lampInput = null;
        for (let direction = 0; direction < 8; direction++) {
            world.data[lampIndex] = direction;
            const candidate = physics.getMachinePorts(lamp.x, lamp.y).find(port => port.role === 'input');
            const dx = candidate.connectionCell.x - lamp.x;
            const dy = candidate.connectionCell.y - lamp.y;
            const score = (Math.abs(dy) * 100) + (dx < 0 ? 0 : 1000) + Math.abs(dx);
            if (!lampInput || score < lampInput.score) lampInput = { ...candidate, score, direction };
        }
        world.data[lampIndex] = lampInput.direction;
        physics.setMachineSetting(lamp.x, lamp.y, 1);

        const ports = physics.getMachinePorts(gate.x, gate.y);
        const supply = ports.find(port => port.role === 'input' && /^(?:supply|power)$/i.test(port.id));
        const signalA = ports.find(port => port.id === 'signal-a');
        const signalB = ports.find(port => port.id === 'signal-b');
        const output = ports.find(port => port.role === 'output');
        const batteryDefinition = definitions[id('Battery')];
        const elecId = id('Elec');
        const drawRoute = (machine, port, powered) => {
            const dx = Math.sign(port.directionX);
            const dy = Math.sign(port.directionY);
            const cells = [];
            for (let offset = 0; offset <= 4; offset++) {
                const cell = { x: port.connectionCell.x + dx * offset,
                    y: port.connectionCell.y + dy * offset };
                physics.setCell(cell.x, cell.y, elecId);
                cells.push(cell);
            }
            const battery = powered ? { x: port.connectionCell.x + dx * 5,
                y: port.connectionCell.y + dy * 5 } : null;
            if (battery) {
                physics.setCell(battery.x, battery.y, batteryDefinition.id);
                world.charge[physics.index(battery.x, battery.y)] = batteryDefinition.chargeCapacity;
            }
            return { cells, battery };
        };

        const supplyRoute = drawRoute(gate, supply, true);
        const signalARoute = drawRoute(gate, signalA, signalValues[0]);
        const signalBRoute = drawRoute(gate, signalB, signalValues[1]);
        if (output.connectionCell.y !== lampInput.connectionCell.y) {
            throw new Error('AND output and Lamp input must share a row in this circuit fixture');
        }
        const outputCells = [];
        for (let x = Math.min(output.connectionCell.x, lampInput.connectionCell.x);
            x <= Math.max(output.connectionCell.x, lampInput.connectionCell.x); x++) {
            const cell = { x, y: output.connectionCell.y };
            physics.setCell(cell.x, cell.y, elecId);
            outputCells.push(cell);
        }
        physics.stepSimulation();

        const cellCurrent = cell => world.logicalPower[physics.index(cell.x, cell.y)] > 0;
        const supplyMetrics = physics.getBatteryCircuitMetrics(supplyRoute.battery.x, supplyRoute.battery.y);
        const signalAMetrics = signalARoute.battery
            ? physics.getBatteryCircuitMetrics(signalARoute.battery.x, signalARoute.battery.y) : null;
        const signalBMetrics = signalBRoute.battery
            ? physics.getBatteryCircuitMetrics(signalBRoute.battery.x, signalBRoute.battery.y) : null;
        const liveGate = physics.getMachineLiveStatus(gate.x, gate.y);
        const liveLamp = physics.getMachineLiveStatus(lamp.x, lamp.y);
        return {
            gate,
            lamp,
            outputCell: output.connectionCell,
            supplyBattery: supplyRoute.battery,
            supplyActive: liveGate.ports.find(port => port.id === supply.id)?.active,
            signalAActive: liveGate.ports.find(port => port.id === signalA.id)?.active,
            signalBActive: liveGate.ports.find(port => port.id === signalB.id)?.active,
            outputActive: cellCurrent(output.connectionCell),
            lampActive: liveLamp.active,
            supplyLoad: supplyMetrics?.load ?? null,
            signalALoad: signalAMetrics?.load ?? null,
            signalBLoad: signalBMetrics?.load ?? null,
            outputCellCount: outputCells.length,
            wireRouteOverlap: [supplyRoute.cells, signalARoute.cells, signalBRoute.cells]
                .some((route, index, routes) => routes.slice(index + 1)
                    .some(other => route.some(cell => other.some(candidate =>
                        candidate.x === cell.x && candidate.y === cell.y))))
        };
    }, signalValues);
}

test('all five electrical gates implement their full truth tables while powered by a Battery', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    for (const gate of gates) {
        for (const values of gate.vectors) {
            const result = await runGateVector(page, { gate: gate.name, values, supply: true });
            expect(result.output, `${gate.name}(${values.map(Number).join(', ')})`).toBe(gate.evaluate(values));
        }
    }
});

// Isolated pending product decision: if gates share their logic supply with
// the signal inputs, this single setup can be changed without rewriting tables.
test('gate output remains off when a charged input signal has no Battery-backed supply pin', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const result = await runGateVector(page, { gate: 'AND', values: [true, true], supply: false });
    expect(result.output).toBe(false);
});

test('AND supply and independent signal Batteries drive a separate output wire to a Lamp', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const supplyOnly = await runAndLampCircuit(page, [false, false]);
    await game.step(0);
    const lampGlow = page.locator('#machineOverlay .machine-overlay-icon.machine-lamp[data-machine-x="130"][data-machine-y="45"] .machine-lamp-glow');
    await expect(lampGlow).toHaveAttribute('data-lit', 'false');
    expect(supplyOnly.supplyActive).toBe(true);
    expect(supplyOnly.signalAActive).toBe(false);
    expect(supplyOnly.signalBActive).toBe(false);
    expect(supplyOnly.outputActive, 'the supply pin does not energize the distinct output route').toBe(false);
    expect(supplyOnly.lampActive).toBe(false);
    expect(supplyOnly.outputCellCount).toBeGreaterThan(10);
    expect(supplyOnly.wireRouteOverlap, 'supply and input runs remain physically separate').toBe(false);
    expect(supplyOnly.supplyLoad).toBeGreaterThan(0);

    const oneSignal = await runAndLampCircuit(page, [true, false]);
    await game.step(0);
    await expect(lampGlow).toHaveAttribute('data-lit', 'false');
    expect(oneSignal.supplyActive).toBe(true);
    expect(oneSignal.signalAActive).toBe(true);
    expect(oneSignal.signalBActive).toBe(false);
    expect(oneSignal.outputActive).toBe(false);
    expect(oneSignal.lampActive).toBe(false);

    const bothSignals = await runAndLampCircuit(page, [true, true]);
    await game.step(0);
    await expect(lampGlow).toHaveAttribute('data-lit', 'true');
    expect(bothSignals.signalAActive).toBe(true);
    expect(bothSignals.signalBActive).toBe(true);
    expect(bothSignals.outputActive).toBe(true);
    expect(bothSignals.lampActive).toBe(true);
    expect(bothSignals.supplyLoad, 'the gate supply accounts for the enabled output network and Lamp load')
        .toBeGreaterThan(oneSignal.supplyLoad);
    expect(bothSignals.signalALoad, 'the input-A Battery does not absorb output loads')
        .toBeCloseTo(oneSignal.signalALoad, 5);
    expect(bothSignals.signalBLoad).toBeGreaterThan(0);

    const depletedSupply = await page.evaluate(async battery => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        world.charge[physics.index(battery.x, battery.y)] = 0;
        physics.invalidateLogicalCurrent();
        const output = physics.getMachinePorts(90, 45).find(port => port.role === 'output');
        const lamp = physics.getMachineLiveStatus(130, 45);
        return {
            outputActive: world.logicalPower[physics.index(output.connectionCell.x, output.connectionCell.y)] > 0,
            lampActive: lamp.active,
            supplyLoad: physics.getBatteryCircuitMetrics(battery.x, battery.y)?.load ?? null
        };
    }, bothSignals.supplyBattery);
    await game.step(0);
    await expect(lampGlow).toHaveAttribute('data-lit', 'false');
    expect(depletedSupply.outputActive).toBe(false);
    expect(depletedSupply.lampActive).toBe(false);
    expect(depletedSupply.supplyLoad).toBeLessThan(bothSignals.supplyLoad);
});

test('logic gate ports have stable anchors, correct input/output roles, Elec material, and two-cell leads', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    for (const gate of gates) {
        const result = await runGateVector(page, {
            gate: gate.name,
            values: Array(gate.signalInputs).fill(false),
            supply: false
        });
        await game.step(0);
        const icon = page.locator('#machineOverlay .machine-overlay-icon[data-machine-x="90"][data-machine-y="45"]');
        await expect(icon, `${gate.name} artwork`).toHaveCount(1);
        await expect(icon.locator('svg')).toHaveCount(1);
        expect(await icon.locator('svg').evaluate(svg =>
            !!svg.querySelector('image, path, polygon, circle, rect')),
        `${gate.name} displays gate artwork`).toBe(true);
        await expect(icon.locator('circle.machine-port')).toHaveCount(result.ports.length);
        const stubGeometry = await icon.locator('path.machine-port-protruding').evaluateAll(paths => paths.map(path => {
            const length = path.getTotalLength();
            const matrix = path.getScreenCTM();
            const start = new DOMPoint(path.getPointAtLength(0).x, path.getPointAtLength(0).y)
                .matrixTransform(matrix);
            const end = new DOMPoint(path.getPointAtLength(length).x, path.getPointAtLength(length).y)
                .matrixTransform(matrix);
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const magnitude = Math.hypot(dx, dy) || 1;
            return { id: path.dataset.portProtrusion, directionX: dx / magnitude, directionY: dy / magnitude };
        }));
        const hitTargets = await icon.locator('[data-port-hit-target]').evaluateAll(nodes =>
            nodes.map(node => node.getAttribute('data-port-hit-target')));
        const anchorLinks = await icon.locator('path.machine-port-anchor-link').evaluateAll(paths =>
            paths.map(path => path.getAttribute('data-port-stub')));
        expect(stubGeometry, `${gate.name} has one protrusion per declared port`)
            .toHaveLength(result.ports.length);
        expect(hitTargets, `${gate.name} has one hit target per declared port`)
            .toHaveLength(result.ports.length);
        expect(anchorLinks.sort(), `${gate.name} has no signal-input anchor-link strokes`)
            .toEqual(['output', 'supply']);
        expect(new Set(stubGeometry.map(stub => stub.id)).size, `${gate.name} has no duplicate protrusion IDs`)
            .toBe(result.ports.length);
        expect(new Set(hitTargets).size, `${gate.name} has no duplicate hit targets`)
            .toBe(result.ports.length);
        expect(new Set(anchorLinks).size, `${gate.name} has no duplicate supply/output anchor links`)
            .toBe(2);
        const stubById = Object.fromEntries(stubGeometry.map(stub => [stub.id, stub]));
        expect(Math.abs(stubById.supply.directionX), `${gate.name} supply stub stays vertical`).toBeLessThan(0.1);
        expect(stubById.supply.directionY, `${gate.name} supply stub points down`).toBeGreaterThan(0.95);
        expect(stubById.output.directionX, `${gate.name} output stub points right`).toBeGreaterThan(0.95);
        expect(Math.abs(stubById.output.directionY), `${gate.name} output stub stays horizontal`).toBeLessThan(0.1);
        for (const inputId of Array.from({ length: gate.signalInputs }, (_, index) =>
            `signal-${String.fromCharCode(97 + index)}`)) {
            const signalLead = icon.locator(`path.machine-port-protruding[data-port-protrusion="${inputId}"]`);
            await expect(signalLead, `${gate.name} ${inputId} has exactly one terminal lead`).toHaveCount(1);
            await expect(signalLead, `${gate.name} ${inputId} terminal lead is visible`).toBeVisible();
            await expect(icon.locator(`path.machine-port-anchor-link[data-port-stub="${inputId}"]`),
                `${gate.name} ${inputId} has no extra diagonal anchor-link stroke`).toHaveCount(0);
            expect(stubById[inputId].directionX, `${gate.name} ${inputId} stub points left`).toBeLessThan(-0.95);
            expect(Math.abs(stubById[inputId].directionY), `${gate.name} ${inputId} stub stays horizontal`)
                .toBeLessThan(0.1);
        }
        await expect(icon.locator('path.machine-port-protruding[data-port-protrusion="supply"]'),
            `${gate.name} has a single supply lead`).toHaveCount(1);
        await expect(icon.locator('path.machine-port-protruding[data-port-protrusion="output"]'),
            `${gate.name} has a single output lead`).toHaveCount(1);
        const supply = result.ports.filter(port => port.role === 'input' && /power|supply/i.test(port.id));
        const signalInputs = result.ports.filter(port => port.role === 'input' && !/power|supply/i.test(port.id));
        const outputs = result.ports.filter(port => port.role === 'output');
        expect(supply, `${gate.name} dedicated supply input`).toHaveLength(1);
        expect(signalInputs, `${gate.name} signal inputs`).toHaveLength(gate.signalInputs);
        expect(outputs, `${gate.name} signal outputs`).toHaveLength(1);
        const supplyMarker = icon.locator('circle.machine-port[data-port-id="supply"]');
        const supplyStub = icon.locator('path.machine-port-stub[data-port-stub="supply"]');
        await expect(supplyMarker).toHaveAttribute('fill', '#4fa6ff');
        await expect(supplyStub).toHaveAttribute('stroke', '#4fa6ff');
        await expect(icon.locator('path.machine-port-protruding[data-port-protrusion="supply"]'))
            .toHaveAttribute('stroke', '#4fa6ff');
        expect(result.ports.every(port => port.family === 'electrical' &&
            port.connectorMaterial === 'Elec' && port.connectorBrushWidth === 2), gate.name).toBe(true);
        const anchors = result.ports.map(port => `${port.connectionCell.x},${port.connectionCell.y}`);
        expect(new Set(anchors).size, `${gate.name} port anchors are unique`).toBe(anchors.length);
        expect(result.ports.every(port => Number.isInteger(port.connectionCell.x) &&
            Number.isInteger(port.connectionCell.y)), `${gate.name} uses cell anchors`).toBe(true);
        const byId = Object.fromEntries(result.ports.map(port => [port.id, port]));
        expect(byId.supply.directionY, `${gate.name} supply points down`).toBeGreaterThan(0.5);
        expect(byId['signal-a'].directionX, `${gate.name} input A points left`).toBeLessThan(-0.5);
        if (gate.signalInputs === 2) {
            expect(byId['signal-b'].directionX, `${gate.name} input B points left`).toBeLessThan(-0.5);
        }
        expect(byId.output.directionX, `${gate.name} output points right`).toBeGreaterThan(0.5);
    }
});

test('gate hover describes supply and each signal connector by role and direction', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    await runGateVector(page, { gate: 'AND', values: [false, false], supply: false });
    await game.step(0);
    const machine = { x: 90, y: 45 };
    await page.mouse.move(...Object.values(await machineArtworkCellPoint(page, machine)));

    const feedback = page.locator('#hoverFeedback');
    const rows = await feedback.locator('div').allTextContents();
    const hasPortRow = (name, direction) => rows.some(row => name.test(row) && direction.test(row));
    expect(hasPortRow(/battery supply input/i, /(bottom|south|down)/i), 'supply is named as a downward input')
        .toBe(true);
    expect(hasPortRow(/signal input A/i, /(left|west)/i), 'signal A is named as a left-side input').toBe(true);
    expect(hasPortRow(/signal input B/i, /(left|west)/i), 'signal B is named as a left-side input').toBe(true);
    expect(hasPortRow(/signal output/i, /(right|east)/i), 'output is named as a right-side output').toBe(true);
    const portRows = rows.filter(row => /battery supply input|signal input [AB]|signal output/i.test(row));
    expect(portRows).toHaveLength(4);
    expect(portRows.every(row => /inactive/i.test(row)), 'all disconnected ports show their live state').toBe(true);
});

test('two-input gate connectors have clear vertical spacing', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    for (const gate of gates.filter(candidate => candidate.signalInputs === 2)) {
        await runGateVector(page, { gate: gate.name, values: [false, false], supply: false });
        await game.step(0);
        const icon = page.locator('#machineOverlay .machine-overlay-icon[data-machine-x="90"][data-machine-y="45"]');
        const inputMarkers = await icon.locator('circle.machine-port[data-port-id^="signal-"]').evaluateAll(circles =>
            circles.map(circle => ({ id: circle.dataset.portId, y: Number(circle.getAttribute('cy')) })));
        const markerA = inputMarkers.find(marker => marker.id === 'signal-a');
        const markerB = inputMarkers.find(marker => marker.id === 'signal-b');
        expect(markerA, `${gate.name} has input A artwork`).toBeTruthy();
        expect(markerB, `${gate.name} has input B artwork`).toBeTruthy();
        expect(Math.abs(markerA.y - markerB.y), `${gate.name} signal input markers do not crowd vertically`)
            .toBeGreaterThanOrEqual(16);

        const spacing = await page.evaluate(async () => {
            const physics = await import('/physics.js');
            const ports = physics.getMachinePorts(90, 45);
            const a = ports.find(port => port.id === 'signal-a');
            const b = ports.find(port => port.id === 'signal-b');
            return Math.abs(a.connectionCell.y - b.connectionCell.y);
        });
        expect(spacing, `${gate.name} physical signal anchors are vertically separated`).toBeGreaterThanOrEqual(4);
    }
});

test('rotated gate protrusions still follow one declared terminal axis each', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    for (const gate of gates) {
        const declaredPorts = await page.evaluate(async gateName => {
            const physics = await import('/physics.js');
            const definitions = physics.getDefinitions();
            const definition = definitions.find(item => item?.name === gateName || item?.name === `${gateName} Gate`);
            physics.clearWorld();
            const machine = { x: 90, y: 45 };
            physics.setCell(machine.x, machine.y, definition.id);
            physics.getWorld().data[physics.index(machine.x, machine.y)] = 2;
            return physics.getMachinePorts(machine.x, machine.y).map(port => ({
                id: port.id,
                role: port.role,
                directionX: port.directionX,
                directionY: port.directionY
            }));
        }, gate.name);
        await game.step(0);
        const icon = page.locator('#machineOverlay .machine-overlay-icon[data-machine-x="90"][data-machine-y="45"]');
        const rendered = await icon.evaluate((node, machine) => {
            const canvas = document.querySelector('#canvas');
            const canvasRect = canvas.getBoundingClientRect();
            const cellWidth = canvasRect.width / canvas.width;
            const cellHeight = canvasRect.height / canvas.height;
            const protrusions = [...node.querySelectorAll('path.machine-port-protruding')].map(path => {
                const length = path.getTotalLength();
                const matrix = path.getScreenCTM();
                const start = new DOMPoint(path.getPointAtLength(0).x, path.getPointAtLength(0).y)
                    .matrixTransform(matrix);
                const end = new DOMPoint(path.getPointAtLength(length).x, path.getPointAtLength(length).y)
                    .matrixTransform(matrix);
                const dx = end.x - start.x;
                const dy = end.y - start.y;
                const magnitude = Math.hypot(dx, dy) || 1;
                return { id: path.dataset.portProtrusion, dx: dx / magnitude, dy: dy / magnitude };
            });
            return {
                protrusions,
                anchorLinks: [...node.querySelectorAll('path.machine-port-anchor-link')]
                    .map(path => path.getAttribute('data-port-stub')),
                hitTargets: [...node.querySelectorAll('[data-port-hit-target]')]
                    .map(node => node.getAttribute('data-port-hit-target')),
                expected: machine.ports.map(port => {
                    const dx = port.directionX * cellWidth;
                    const dy = port.directionY * cellHeight;
                    const magnitude = Math.hypot(dx, dy) || 1;
                    return { id: port.id, dx: dx / magnitude, dy: dy / magnitude };
                })
            };
        }, { ports: declaredPorts });

        expect(rendered.protrusions, `${gate.name} has one rotated protrusion per declared port`)
            .toHaveLength(declaredPorts.length);
        expect(rendered.anchorLinks, `${gate.name} has one rotated anchor link per declared port`)
            .toHaveLength(declaredPorts.length);
        expect(rendered.hitTargets, `${gate.name} has one rotated hit target per declared port`)
            .toHaveLength(declaredPorts.length);
        expect(new Set(rendered.protrusions.map(port => port.id)).size).toBe(declaredPorts.length);
        expect(new Set(rendered.anchorLinks).size).toBe(declaredPorts.length);
        expect(new Set(rendered.hitTargets).size).toBe(declaredPorts.length);
        const directionById = Object.fromEntries(declaredPorts.map(port => [port.id, port]));
        expect(directionById.supply.directionX, `${gate.name} rotated supply points right`).toBeGreaterThan(0.95);
        expect(Math.abs(directionById.supply.directionY)).toBeLessThan(0.1);
        expect(directionById.output.directionY, `${gate.name} rotated output points up`).toBeLessThan(-0.95);
        expect(Math.abs(directionById.output.directionX)).toBeLessThan(0.1);
        for (let inputIndex = 0; inputIndex < gate.signalInputs; inputIndex++) {
            const inputId = `signal-${String.fromCharCode(97 + inputIndex)}`;
            expect(Math.abs(directionById[inputId].directionX), `${gate.name} rotated ${inputId} is vertical`)
                .toBeLessThan(0.1);
            expect(directionById[inputId].directionY, `${gate.name} rotated ${inputId} points down`)
                .toBeGreaterThan(0.95);
        }
        for (const port of rendered.expected) {
            const stub = rendered.protrusions.find(candidate => candidate.id === port.id);
            const dot = stub.dx * port.dx + stub.dy * port.dy;
            expect(dot, `${gate.name} ${port.id} rotated stub follows its declared direction`).toBeGreaterThan(0.98);
        }
    }
});

test('logic gate, ports, wiring, and Battery supply survive portable Save/Load and clear on reset', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await runGateVector(page, { gate: 'AND', values: [true, true], supply: true });

    const lifecycle = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const save = await import('/saveLoadGame.js');
        const definitions = physics.getDefinitions();
        const encoded = save.createSaveString();
        physics.clearWorld();
        save.loadSaveString(encoded);
        physics.stepSimulation();
        const gate = definitions.find(definition => definition?.name === 'AND' || definition?.name === 'AND Gate');
        const world = physics.getWorld();
        const gateIndex = world.type.findIndex(type => type === gate.id);
        const x = gateIndex % world.cols;
        const y = Math.floor(gateIndex / world.cols);
        const output = physics.getMachinePorts(x, y).find(port => port.role === 'output');
        const roundTrip = {
            gate: definitions[world.type[gateIndex]]?.name,
            outputActive: world.logicalPower[physics.index(output.connectionCell.x, output.connectionCell.y)] > 0,
            batteries: world.type.reduce((count, type) => count + (definitions[type]?.name === 'Battery' ? 1 : 0), 0),
            elec: world.type.reduce((count, type) => count + (definitions[type]?.name === 'Elec' ? 1 : 0), 0)
        };
        physics.clearWorld();
        const reset = {
            gateCount: world.type.reduce((count, type) => count + (definitions[type]?.name === 'AND' || definitions[type]?.name === 'AND Gate' ? 1 : 0), 0),
            activeSignals: world.logicalPower.reduce((count, value) => count + (value > 0 ? 1 : 0), 0)
        };
        return { roundTrip, reset };
    });

    expect(lifecycle.roundTrip.gate).toMatch(/^AND(?: Gate)?$/);
    expect(lifecycle.roundTrip.outputActive).toBe(true);
    expect(lifecycle.roundTrip.batteries).toBeGreaterThan(0);
    expect(lifecycle.roundTrip.elec).toBeGreaterThan(0);
    expect(lifecycle.reset).toEqual({ gateCount: 0, activeSignals: 0 });
});
