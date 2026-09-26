import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { canvasPoint } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'electrical');
});

async function installElectricalFixture(page, {
    batteries = [],
    conductors = [],
    spark,
    machine,
    batteryCharge = null
} = {}) {
    await page.evaluate(async fixture => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const world = physics.getWorld();

        physics.clearWorld();
        for (const [x, y] of fixture.batteries || []) physics.setCell(x, y, id('Battery'));
        for (const [x, y, material = 'Copper'] of fixture.conductors || []) {
            physics.setCell(x, y, id(material));
        }
        if (fixture.machine) physics.setCell(
            fixture.machine[0], fixture.machine[1], id(fixture.machine[2]));
        if (fixture.spark) physics.setCell(fixture.spark[0], fixture.spark[1], id('Spark'));

        if (fixture.batteryCharge !== null) {
            for (const [x, y] of fixture.batteries || []) {
                world.charge[physics.index(x, y)] = fixture.batteryCharge;
            }
        }
    }, {
        batteries,
        conductors,
        spark,
        machine,
        batteryCharge
    });
}

async function electricalState(page, cells = []) {
    return page.evaluate(async cells => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        return {
            cells: cells.map(({ x, y }) => {
                const i = physics.index(x, y);
                return {
                    x,
                    y,
                    type: world.type[i],
                    power: world.power[i],
                    powerDelay: world.powerDelay[i],
                    charge: world.charge[i],
                    powered: physics.isPowered(x, y),
                    logicallyPowered: physics.isLogicallyPowered(x, y),
                    machinePowered: physics.isMachinePoweredAt(x, y)
                };
            }),
            anyPower: world.power.some(value => value > 0),
            anyPowerDelay: world.powerDelay.some(value => value > 0)
        };
    }, cells);
}

test('Spark is absorbed, traverses both wire extremes, and its pulse expires at the glow boundary', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await game.seed(101);
    await installElectricalFixture(page, {
        conductors: Array.from({ length: 41 }, (_, offset) => [30 + offset, 35]),
        spark: [50, 34]
    });

    const definitions = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const find = name => physics.getDefinitions().find(definition => definition?.name === name)?.id;
        return { copper: find('Copper'), spark: find('Spark') };
    });

    await game.step(1);
    const absorbed = await electricalState(page, [
        { x: 50, y: 34 },
        { x: 50, y: 35 },
        { x: 30, y: 35 },
        { x: 70, y: 35 }
    ]);
    expect(absorbed.cells[0].type).toBe(0);
    expect(absorbed.cells[1].type).toBe(definitions.copper);
    expect(absorbed.cells[1].powered).toBe(true);
    expect(absorbed.cells[2].powered).toBe(false);
    expect(absorbed.cells[3].powered).toBe(false);
    expect(absorbed.cells[2].powerDelay).toBe(19);
    expect(absorbed.cells[3].powerDelay).toBe(19);

    await game.step(18);
    const beforeArrival = await electricalState(page, [
        { x: 30, y: 35 },
        { x: 70, y: 35 }
    ]);
    expect(beforeArrival.cells[0].powered).toBe(false);
    expect(beforeArrival.cells[1].powered).toBe(false);
    expect(beforeArrival.cells[0].powerDelay).toBe(1);
    expect(beforeArrival.cells[1].powerDelay).toBe(1);

    await game.step(1);
    const arrival = await electricalState(page, [
        { x: 30, y: 35 },
        { x: 70, y: 35 }
    ]);
    expect(arrival.cells[0].powered).toBe(true);
    expect(arrival.cells[1].powered).toBe(true);
    expect(arrival.cells[0].power).toBe(7);
    expect(arrival.cells[1].power).toBe(7);

    await game.step(7);
    const expired = await electricalState(page, [
        { x: 30, y: 35 },
        { x: 70, y: 35 }
    ]);
    expect(expired.cells[0].powered).toBe(false);
    expect(expired.cells[1].powered).toBe(false);
    expect(expired.anyPower).toBe(false);
    expect(expired.anyPowerDelay).toBe(false);
});

test('connected Batteries share one Spark charge while an isolated Battery keeps its own capacity', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await game.seed(202);
    await installElectricalFixture(page, {
        batteries: [[20, 35], [21, 35], [22, 35], [40, 35]],
        spark: [21, 34],
        batteryCharge: 0
    });

    await game.step(1);
    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const connected = physics.getConnectedBatteryCharge(20, 35);
        const connectedFromLastCell = physics.getConnectedBatteryCharge(22, 35);
        const isolated = physics.getConnectedBatteryCharge(40, 35);
        const battery = physics.getDefinitions().find(definition => definition?.name === 'Battery');
        return {
            connected,
            connectedFromLastCell,
            isolated,
            batteryCapacity: battery.chargeCapacity,
            batteryChargePerSpark: battery.chargePerSpark,
            connectedCellCharges: [20, 21, 22].map(x => world.charge[physics.index(x, 35)]),
            spark: world.type[physics.index(21, 34)]
        };
    });

    expect(result.spark).toBe(0);
    expect(result.connected.capacity).toBe(result.batteryCapacity * 3);
    expect(result.isolated.capacity).toBe(result.batteryCapacity);
    expect(result.connected.charge).toBeCloseTo(result.batteryChargePerSpark, 4);
    expect(result.connectedFromLastCell).toEqual(result.connected);
    expect(result.connected.charge).toBeGreaterThan(0);
    expect(result.connected.charge).toBeLessThan(result.connected.capacity);
    expect(result.connectedCellCharges[0]).toBeCloseTo(result.connectedCellCharges[1], 4);
    expect(result.connectedCellCharges[1]).toBeCloseTo(result.connectedCellCharges[2], 4);
    expect(result.isolated.charge).toBe(0);
});

test('Copper and Iron power a Fan through its protruding input contact', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    for (const [material, expectedWireLoad] of [['Copper', 1], ['Iron', 0.5]]) {
        await game.seed(material === 'Copper' ? 303 : 404);
        await installElectricalFixture(page, {
            batteries: [[20, 35]],
            conductors: [[21, 35, material]],
            machine: [23, 35, 'Fan'],
            batteryCharge: 2
        });

        const before = await page.evaluate(async () => {
            const physics = await import('/physics.js');
            return physics.getStoredCharge(20, 35);
        });
        await game.step(1);
        const active = await page.evaluate(async () => {
            const physics = await import('/physics.js');
            const fan = physics.getDefinitions().find(definition => definition?.name === 'Fan');
            return {
                remaining: physics.getStoredCharge(20, 35),
                powered: physics.isMachinePoweredAt(23, 35),
                load: fan.powerConsumption
            };
        });
        expect(active.powered).toBe(true);
        expect(active.remaining).toBeLessThan(before);
        expect(before - active.remaining).toBeCloseTo((expectedWireLoad + active.load) / 100, 3);

        await game.step(1);
        const visiblePower = await page.evaluate(async () => {
            const physics = await import('/physics.js');
            return {
                wireLogicalPower: physics.isLogicallyPowered(21, 35),
                machinePowered: physics.isMachinePoweredAt(23, 35),
                transientPulse: physics.isPowered(23, 35)
            };
        });
        expect(visiblePower.wireLogicalPower).toBe(true);
        expect(visiblePower.machinePowered).toBe(true);
        expect(visiblePower.transientPulse,
            'Battery supply powers the machine without creating a Spark pulse').toBe(false);

        await game.step(8);
        const drained = await page.evaluate(async () => {
            const physics = await import('/physics.js');
            return {
                charge: physics.getStoredCharge(20, 35),
                powered: physics.isMachinePoweredAt(23, 35)
            };
        });
        expect(drained.charge).toBe(0);
        expect(drained.powered).toBe(false);
    }
});

test('Electrical wires cannot carry Battery power across one empty cell', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    for (const [material, expectedWireLoad] of [['Copper', 1], ['Iron', 0.5]]) {
        await game.seed(material === 'Copper' ? 505 : 606);
        await installElectricalFixture(page, {
            batteries: [[20, 35]],
            conductors: [[21, 35, material], [23, 35, material]],
            batteryCharge: 1
        });
        const before = await page.evaluate(async () => {
            const physics = await import('/physics.js');
            return physics.getStoredCharge(20, 35);
        });
        await game.step(1);
        const state = await page.evaluate(async () => {
            const physics = await import('/physics.js');
            return {
                sourceWirePowered: physics.isLogicallyPowered(21, 35),
                isolatedWirePowered: physics.isLogicallyPowered(23, 35),
                remaining: physics.getStoredCharge(20, 35)
            };
        });
        expect(state.sourceWirePowered).toBe(true);
        expect(state.isolatedWirePowered).toBe(false);
        expect(before - state.remaining).toBeCloseTo(expectedWireLoad / 100, 3);
    }
});

test('Simple Switch and Lamp ports accept Copper, Iron, Elec, and Stainless Steel wire', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const ports = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        physics.clearWorld();
        physics.setCell(35, 35, id('Simple Switch'));
        physics.setCell(55, 35, id('Lamp'));
        return Object.fromEntries(['Simple Switch', 'Lamp'].map(name => {
            const x = name === 'Simple Switch' ? 35 : 55;
            return [name, physics.getMachinePorts(x, 35).map(port => ({
                id: port.id,
                role: port.role,
                material: port.material,
                accepts: Object.fromEntries(
                    ['Copper', 'Iron', 'Elec', 'Stainless Steel', 'Tubing'].map(material => [
                        material, physics.isMachinePortMaterialCompatible(x, 35, port.id, material)
                    ])
                )
            }))];
        }));
    });

    expect(ports['Simple Switch'].map(port => port.role)).toEqual(['input', 'output']);
    expect(ports.Lamp.map(port => port.role)).toEqual(['input']);
    for (const port of [...ports['Simple Switch'], ...ports.Lamp]) {
        expect(port.material).toBe('Elec');
        expect(port.accepts).toEqual({
            Copper: true,
            Iron: true,
            Elec: true,
            'Stainless Steel': true,
            Tubing: false
        });
    }
});

test('Simple Switch relays steady input power while ON and blocks it while OFF', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    async function setSwitchCurrent(enabled) {
        await page.evaluate(async enabled => {
            const physics = await import('/physics.js');
            const definitions = physics.getDefinitions();
            const id = name => definitions.findIndex(definition => definition?.name === name);
            const x = 45;
            const y = 35;
            const batteryX = x - 5;
            physics.clearWorld();
            physics.setCell(x, y, id('Simple Switch'));
            const world = physics.getWorld();
            const machineIndex = physics.index(x, y);
            const ports = physics.getMachinePorts(x, y);
            const input = ports.find(port => port.role === 'input');
            const output = ports.find(port => port.role === 'output');
            physics.setCell(batteryX, y, id('Battery'));
            for (let wireX = batteryX + 1; wireX <= input.connectionCell.x; wireX++) {
                physics.setCell(wireX, y, id('Elec'));
            }
            physics.setCell(input.connectionCell.x, input.connectionCell.y, id('Elec'));
            physics.setCell(output.connectionCell.x, output.connectionCell.y, id('Elec'));
            world.charge[physics.index(batteryX, y)] = physics.getDefinitions()[id('Battery')].chargeCapacity;
            world.machineSetting[machineIndex] = enabled ? 1 : 0;
        }, enabled);
        await game.step(1);
        return page.evaluate(async () => {
            const physics = await import('/physics.js');
            const ports = physics.getMachinePorts(45, 35);
            const input = ports.find(port => port.role === 'input').connectionCell;
            const output = ports.find(port => port.role === 'output').connectionCell;
            return {
                inputCurrent: physics.isLogicallyPowered(input.x, input.y),
                outputCurrent: physics.isLogicallyPowered(output.x, output.y),
                setting: physics.getMachineSetting(45, 35)
            };
        });
    }

    const on = await setSwitchCurrent(true);
    expect(on.setting).toBe(1);
    expect(on.inputCurrent).toBe(true);
    expect(on.outputCurrent).toBe(true);

    const off = await setSwitchCurrent(false);
    expect(off.setting).toBe(0);
    expect(off.inputCurrent).toBe(true);
    expect(off.outputCurrent).toBe(false);
});

test('Simple Switch and Lamp expose accessible ON/OFF controls that start ON', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    for (const [x, name] of [[38, 'Simple Switch'], [62, 'Lamp']]) {
        await page.evaluate(async ({ x, name }) => {
            const physics = await import('/physics.js');
            const id = physics.getDefinitions().findIndex(definition => definition?.name === name);
            physics.clearWorld();
            physics.setCell(x, 35, id);
        }, { x, name });
        await game.step(0);

        const marker = page.locator(
            `#machineOverlay .machine-overlay-icon[data-machine-x="${x}"][data-machine-y="35"] .machine-port`
        ).first();
        const markerBox = await marker.boundingBox();
        expect(markerBox).not.toBeNull();
        await page.mouse.click(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2);

        const dialog = page.getByRole('dialog', { name: `${name} settings` });
        const toggle = page.getByRole('switch', { name, exact: true });
        await expect(dialog).toBeVisible();
        await expect(toggle).toBeChecked();
        await toggle.click();
        await expect(toggle).not.toBeChecked();
        const offSetting = await page.evaluate(async ({ x }) =>
            (await import('/physics.js')).getMachineSetting(x, 35), { x });
        await toggle.click();
        await expect(toggle).toBeChecked();
        const onSetting = await page.evaluate(async ({ x }) =>
            (await import('/physics.js')).getMachineSetting(x, 35), { x });
        expect(onSetting).not.toBe(offSetting);
        await page.getByRole('button', { name: 'Close', exact: true }).click();
    }
});

test('Temperature and Humidity Switches expose electrical ports, an air-facing marker, and accessible comparison controls', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const sensors = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const world = physics.getWorld();
        physics.clearWorld();
        const fixtures = [
            { name: 'Temperature Switch', x: 55, y: 35, input: 'Temperature', value: '37.5' },
            { name: 'Humidity Switch', x: 85, y: 35, input: 'Humidity', value: '61.25' }
        ];
        return fixtures.map(fixture => {
            const definition = definitions.find(item => item?.name === fixture.name);
            const machineId = definitions.findIndex(item => item?.name === fixture.name);
            physics.setCell(fixture.x, fixture.y, machineId);
            const ports = physics.getMachinePorts(fixture.x, fixture.y);
            const layout = physics.getMachineArtworkLayout(definition.machine);
            return { ...fixture, machine: definition.machine, layout, ports };
        });
    });

    await game.step(0);
    const optionLabels = [
        'Less than', 'Less than or equal to', 'Equal to',
        'Greater than or equal to', 'Greater than'
    ];
    for (const sensor of sensors) {
        expect(sensor.ports.map(port => port.role), sensor.name).toEqual(['input', 'output']);
        expect(sensor.ports.every(port => port.family === 'electrical' &&
            port.material === 'Elec' && port.connectorBrushWidth === 2), sensor.name).toBe(true);

        const icon = page.locator(
            `#machineOverlay .machine-overlay-icon.machine-${sensor.machine}[data-machine-x="${sensor.x}"][data-machine-y="${sensor.y}"]`
        );
        const marker = icon.locator('[data-sensor-marker]');
        await expect(marker).toHaveCount(1);
        const geometry = await icon.evaluate(element => {
            const sensor = element.querySelector('[data-sensor-marker]');
            const port = element.querySelector('.machine-port');
            return {
                cx: Number(sensor.getAttribute('cx')),
                cy: Number(sensor.getAttribute('cy')),
                radius: Number(sensor.getAttribute('r')),
                portRadius: Number(port.getAttribute('r')),
                fill: getComputedStyle(sensor).fill,
                housingBounds: { x: 9, y: 14, width: 46, height: 40 }
            };
        });
        expect(geometry.radius, `${sensor.name} sensor and connector markers share a radius`)
            .toBeCloseTo(geometry.portRadius, 1);
        expect(geometry.cy, `${sensor.name} sensor is inset about ten viewBox pixels from the old edge position`)
            .toBeCloseTo(14, 0);
        expect(geometry.cx).toBeCloseTo(32, 0);
        expect(geometry.cx).toBeGreaterThan(geometry.housingBounds.x);
        expect(geometry.cx).toBeLessThan(geometry.housingBounds.x + geometry.housingBounds.width);
        expect(geometry.cy - geometry.radius,
            `${sensor.name} marker extends past the exposed housing edge`).toBeLessThan(geometry.housingBounds.y);
        expect(geometry.cy + geometry.radius,
            `${sensor.name} marker overlaps the sensor face`).toBeGreaterThan(geometry.housingBounds.y);
        const fill = geometry.fill.match(/[\d.]+/g)?.slice(0, 3).map(Number);
        expect(fill, `${sensor.name} marker is visibly yellow`).not.toBeNull();
        expect(fill[0]).toBeGreaterThan(200);
        expect(fill[1]).toBeGreaterThan(140);
        expect(fill[2]).toBeLessThan(130);

        const point = await canvasPoint(page, { x: sensor.x, y: sensor.y });
        await page.mouse.click(point.x, point.y);
        const dialog = page.getByRole('dialog', { name: `${sensor.name} settings` });
        await expect(dialog).toBeVisible();
        const comparison = dialog.getByLabel('Comparison');
        await expect(comparison.locator('option')).toHaveText(optionLabels);
        await comparison.selectOption({ label: 'Greater than or equal to' });
        const threshold = dialog.getByRole('spinbutton', { name: sensor.input, exact: true });
        await threshold.fill(sensor.value);
        await expect(threshold).toHaveValue(sensor.value);

        const settings = await page.evaluate(async ({ sensor }) => {
            const physics = await import('/physics.js');
            return {
                rule: physics.getMachineSensorRule(sensor.x, sensor.y),
                threshold: physics.getMachineSensorThreshold(sensor.x, sensor.y)
            };
        }, { sensor });
        expect(settings).toEqual({ rule: 3, threshold: Number(sensor.value) });

        await page.locator('#machineDialogCancel').click();
        await page.mouse.click(point.x, point.y);
        await expect(comparison).toHaveValue('3');
        await expect(threshold).toHaveValue(sensor.value);
        await page.locator('#machineDialogCancel').click();
    }
});

test('Temperature and Humidity Switch comparison boundaries block false signals and relay true signals', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const results = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        physics.clearWorld();

        const fixtures = [
            { name: 'Temperature Switch', x: 55, y: 50, sample: 30 },
            { name: 'Humidity Switch', x: 105, y: 50, sample: 64 }
        ];
        for (const fixture of fixtures) {
            physics.setCell(fixture.x, fixture.y, id(fixture.name));
            const ports = physics.getMachinePorts(fixture.x, fixture.y);
            fixture.input = ports.find(port => port.role === 'input').connectionCell;
            fixture.output = ports.find(port => port.role === 'output').connectionCell;
            fixture.battery = { x: fixture.x - 5, y: fixture.y };
            physics.setCell(fixture.battery.x, fixture.battery.y, id('Battery'));
            physics.setCell(fixture.input.x, fixture.input.y, id('Elec'));
            physics.setCell(fixture.output.x, fixture.output.y, id('Elec'));

            // Seal a small, uniform air pocket so its value is deterministic
            // during the electrical tick, while the sensor's adjacent air
            // cells all carry the same expected reading.
            for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
                const x = fixture.x + dx;
                const y = fixture.y + dy;
                if (Math.abs(dx) === 4 || Math.abs(dy) === 4) physics.setCell(x, y, id('Wall'));
                const cell = physics.index(x, y);
                world.temp[cell] = fixture.name === 'Temperature Switch' ? fixture.sample : 8;
                world.humidity[cell] = fixture.name === 'Humidity Switch' ? fixture.sample : 50;
            }
            // Reassert the machine and connector cells inside the sealed pocket.
            physics.setCell(fixture.x, fixture.y, id(fixture.name));
            physics.setCell(fixture.battery.x, fixture.battery.y, id('Battery'));
            for (let x = fixture.battery.x + 1; x <= fixture.input.x; x++) {
                physics.setCell(x, fixture.input.y, id('Elec'));
            }
            physics.setCell(fixture.input.x, fixture.input.y, id('Elec'));
            physics.setCell(fixture.output.x, fixture.output.y, id('Elec'));
            world.charge[physics.index(fixture.battery.x, fixture.battery.y)] =
                definitions[id('Battery')].chargeCapacity;
            for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
                const cell = physics.index(fixture.x + dx, fixture.y + dy);
                world.temp[cell] = fixture.name === 'Temperature Switch' ? fixture.sample : 8;
                world.humidity[cell] = fixture.name === 'Humidity Switch' ? fixture.sample : 50;
            }
        }

        const rules = [
            {
                code: 0, name: 'less than',
                boundaryCases: [[1, true], [0, false]],
                thresholdFor: (reading, truth) => reading + (truth ? 10 : -10)
            },
            {
                code: 1, name: 'less than or equal to',
                boundaryCases: [[0, true], [-1, false]],
                thresholdFor: (reading, truth) => reading + (truth ? 10 : -10)
            },
            {
                code: 2, name: 'equal to',
                boundaryCases: [[0, true], [1, false]],
                thresholdFor: (reading, truth) => reading + (truth ? 0 : 10)
            },
            {
                code: 3, name: 'greater than or equal to',
                boundaryCases: [[0, true], [1, false]],
                thresholdFor: (reading, truth) => reading + (truth ? -10 : 10)
            },
            {
                code: 4, name: 'greater than',
                boundaryCases: [[-1, true], [0, false]],
                thresholdFor: (reading, truth) => reading + (truth ? -10 : 10)
            }
        ];
        const observations = [];
        const boundaryChecks = [];
        for (const fixture of fixtures) {
            const initialReading = physics.getMachineSensorReading(fixture.x, fixture.y);
            for (const rule of rules) for (const [offset, expected] of rule.boundaryCases) {
                physics.setMachineSensorRule(fixture.x, fixture.y, rule.code);
                physics.setMachineSensorThreshold(fixture.x, fixture.y, initialReading + offset);
                boundaryChecks.push({
                    sensor: fixture.name,
                    rule: rule.name,
                    expected,
                    actual: physics.getMachineSensorStatus(fixture.x, fixture.y).conditionMet
                });
            }
            for (const rule of rules) for (const shouldRelay of [true, false]) {
                // Open-air temperature is actively coupled to ambient each
                // frame, so an exact temperature-equality relay cannot stay
                // on its boundary through the heat update. Its exact rule
                // semantics are covered by the synchronous status checks
                // above; the humidity fixture stays stable for the relay case.
                if (fixture.name === 'Temperature Switch' && rule.code === 2 && shouldRelay) continue;
                const reading = physics.getMachineSensorReading(fixture.x, fixture.y);
                physics.setMachineSensorRule(fixture.x, fixture.y, rule.code);
                // Heat diffuses before electrical propagation. Keep the relay
                // cases away from the comparator boundary so a changing air
                // sample cannot obscure whether the signal was gated.
                const threshold = rule.thresholdFor(reading, shouldRelay);
                physics.setMachineSensorThreshold(fixture.x, fixture.y, threshold);
                physics.stepSimulation();
                const status = physics.getMachineSensorStatus(fixture.x, fixture.y);
                observations.push({
                    sensor: fixture.name,
                    rule: rule.name,
                    expected: shouldRelay,
                    reading,
                    threshold,
                    inputCurrent: status.inputActive,
                    passing: status.passing,
                    outputCurrent: physics.isLogicallyPowered(fixture.output.x, fixture.output.y)
                });
            }
        }

        const dryFixture = { name: 'Temperature Switch', x: 155, y: 50 };
        physics.setCell(dryFixture.x, dryFixture.y, id(dryFixture.name));
        const dryPorts = physics.getMachinePorts(dryFixture.x, dryFixture.y);
        dryFixture.input = dryPorts.find(port => port.role === 'input').connectionCell;
        dryFixture.output = dryPorts.find(port => port.role === 'output').connectionCell;
        dryFixture.battery = { x: dryFixture.x - 5, y: dryFixture.y };
        physics.setCell(dryFixture.battery.x, dryFixture.battery.y, id('Battery'));
        physics.setCell(dryFixture.input.x, dryFixture.input.y, id('Elec'));
        physics.setCell(dryFixture.output.x, dryFixture.output.y, id('Elec'));
        // Block the exposed upper probe cells as well as cells immediately
        // beside the anchor; with no air at the sensor face, it cannot relay.
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
            if (dx === 0 && dy === 0) continue;
            physics.setCell(dryFixture.x + dx, dryFixture.y + dy, id('Wall'));
        }
        physics.setCell(dryFixture.battery.x, dryFixture.battery.y, id('Battery'));
        for (let x = dryFixture.battery.x + 1; x <= dryFixture.input.x; x++) {
            physics.setCell(x, dryFixture.input.y, id('Elec'));
        }
        physics.setCell(dryFixture.input.x, dryFixture.input.y, id('Elec'));
        physics.setCell(dryFixture.output.x, dryFixture.output.y, id('Elec'));
        world.charge[physics.index(dryFixture.battery.x, dryFixture.battery.y)] =
            definitions[id('Battery')].chargeCapacity;
        physics.setMachineSensorRule(dryFixture.x, dryFixture.y, 4);
        physics.setMachineSensorThreshold(dryFixture.x, dryFixture.y, -100);
        const noAirReading = physics.getMachineSensorReading(dryFixture.x, dryFixture.y);
        physics.stepSimulation();
        const noAirStatus = physics.getMachineSensorStatus(dryFixture.x, dryFixture.y);

        return {
            observations,
            boundaryChecks,
            noAirReading,
            noAirStatus,
            noAirOutputCurrent: physics.isLogicallyPowered(dryFixture.output.x, dryFixture.output.y)
        };
    });

    for (const check of results.boundaryChecks) {
        expect(check.actual, `${check.sensor} ${check.rule} boundary`).toBe(check.expected);
    }
    for (const observation of results.observations) {
        expect(observation.inputCurrent,
            `${observation.sensor} ${observation.rule} keeps Battery input current active`).toBe(true);
        expect(observation.passing).toBe(observation.expected);
        expect(observation.outputCurrent,
            `${observation.sensor} ${observation.rule}, reading ${observation.reading}, threshold ${observation.threshold}`)
            .toBe(observation.expected);
    }
    expect(results.noAirReading).toBeNull();
    expect(results.noAirStatus).toMatchObject({ inputActive: true, passing: false, state: 'no-air' });
    expect(results.noAirOutputCurrent).toBe(false);
});

test('Temperature and Humidity Switches average the five exposed air probe cells', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const readings = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        physics.clearWorld();
        const fixtures = [
            { name: 'Temperature Switch', x: 55, y: 50, samples: [10, 21, 32, 43, 55], backdrop: 100 },
            { name: 'Humidity Switch', x: 105, y: 50, samples: [11, 29, 52, 77, 98], backdrop: 5 }
        ];

        for (const fixture of fixtures) {
            physics.setCell(fixture.x, fixture.y, id(fixture.name));
            for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
                const x = fixture.x + dx;
                const y = fixture.y + dy;
                if (Math.abs(dx) === 4 || Math.abs(dy) === 4) physics.setCell(x, y, id('Wall'));
                const cell = physics.index(x, y);
                world.temp[cell] = fixture.name === 'Temperature Switch' ? fixture.backdrop : 8;
                world.humidity[cell] = fixture.name === 'Humidity Switch' ? fixture.backdrop : 50;
            }
            // At direction 0, the five air probes run across the exposed top
            // edge, just outside the sensor's 5x5 solid collision body.
            for (let offset = -2; offset <= 2; offset++) {
                const cell = physics.index(fixture.x + offset, fixture.y - 3);
                if (fixture.name === 'Temperature Switch') world.temp[cell] = fixture.samples[offset + 2];
                else world.humidity[cell] = fixture.samples[offset + 2];
            }
        }

        return fixtures.map(fixture => ({
            sensor: fixture.name,
            actual: physics.getMachineSensorReading(fixture.x, fixture.y),
            expected: fixture.samples.reduce((total, value) => total + value, 0) / fixture.samples.length
        }));
    });

    expect(readings).toEqual([
        { sensor: 'Temperature Switch', actual: expect.any(Number), expected: 32.2 },
        { sensor: 'Humidity Switch', actual: expect.any(Number), expected: 53.4 }
    ]);
    for (const reading of readings) {
        expect(reading.actual, `${reading.sensor} returns the arithmetic mean of its five probes`)
            .toBeCloseTo(reading.expected, 5);
    }
});

test('sensor live readings and signal status update in settings dialogs and hover tooltips', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const sensors = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        physics.clearWorld();
        const fixtures = [
            { name: 'Temperature Switch', x: 55, y: 50, unit: '°C', inputLabel: 'Temperature' },
            { name: 'Humidity Switch', x: 105, y: 50, unit: '%', inputLabel: 'Humidity' }
        ];
        for (const fixture of fixtures) {
            fixture.battery = { x: fixture.x - 4, y: fixture.y };
            physics.setCell(fixture.x, fixture.y, id(fixture.name));
            const ports = physics.getMachinePorts(fixture.x, fixture.y);
            fixture.input = ports.find(port => port.role === 'input').connectionCell;
            fixture.output = ports.find(port => port.role === 'output').connectionCell;
            physics.setCell(fixture.input.x, fixture.input.y, id('Elec'));
            physics.setCell(fixture.output.x, fixture.output.y, id('Elec'));
            for (let offset = -2; offset <= 2; offset++) {
                const cell = physics.index(fixture.x + offset, fixture.y - 3);
                if (fixture.name === 'Temperature Switch') world.temp[cell] = 20;
                else world.humidity[cell] = 60;
            }
        }
        return fixtures;
    });
    await game.step(0);

    async function assertLiveSurface(surface, { state, stateLabel, reading, comparison, input, green }) {
        await expect(surface).toBeVisible();
        await expect(surface).toHaveAttribute('data-signal-state', state);
        await expect(surface.locator('[data-sensor-live-state]')).toContainText(stateLabel);
        await expect(surface.locator('[data-sensor-live-reading]')).toHaveCount(1);
        if (reading !== null) {
            await expect(surface.locator('[data-sensor-live-reading]')).toContainText(reading);
        }
        await expect(surface.locator('[data-sensor-live-comparison]')).toContainText(comparison);
        await expect(surface.locator('[data-sensor-live-input]')).toContainText(input);
        const hasColor = await surface.evaluate((element, wantsGreen) => {
            const nodes = [element, ...element.querySelectorAll('*')];
            return nodes.some(node => ['color', 'backgroundColor', 'borderTopColor'].some(property => {
                const value = getComputedStyle(node)[property];
                const channels = value.match(/[\d.]+/g)?.map(Number);
                if (!channels || channels.length < 3) return false;
                const [red, greenChannel, blue, alpha = 1] = channels;
                if (alpha === 0) return false;
                return wantsGreen
                    ? greenChannel >= 110 && greenChannel > red * 1.15 && greenChannel > blue * 1.1
                    : red >= 110 && red > greenChannel * 1.15 && red > blue * 1.15;
            }));
        }, green);
        expect(hasColor, `${state} status has the requested ${green ? 'green' : 'red'} signal color`).toBe(true);
    }

    const formatLiveReading = (value, unit) => {
        const formatted = Number.isInteger(value) ? String(value)
            : Number(value).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
        return `${formatted}${unit === '°C' ? ' °C' : '%'}`;
    };

    const sampleState = (fixture, values, block = false) => page.evaluate(async ({ fixture, values, block }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        for (let offset = -2; offset <= 2; offset++) {
            const x = fixture.x + offset;
            const y = fixture.y - 3;
            const cell = physics.index(x, y);
            if (block) physics.setCell(x, y, physics.getDefinitions().findIndex(def => def?.name === 'Wall'));
            else {
                physics.setCell(x, y, 0);
                if (fixture.name === 'Temperature Switch') world.temp[cell] = values[offset + 2];
                else world.humidity[cell] = values[offset + 2];
            }
        }
        return physics.getMachineSensorStatus(fixture.x, fixture.y);
    }, { fixture, values, block });

    for (const sensor of sensors) {
        const point = await canvasPoint(page, { x: sensor.x, y: sensor.y });
        await page.mouse.click(point.x, point.y);
        const dialog = page.getByRole('dialog', { name: `${sensor.name} settings` });
        await expect(dialog).toBeVisible();
        await dialog.getByLabel('Comparison').selectOption({ label: 'Greater than' });
        await dialog.getByRole('spinbutton', { name: sensor.inputLabel, exact: true }).fill('10');

        const dialogStatus = page.locator('#machineDialogSensorStatus');
        const unit = sensor.unit;
        const firstStatus = await page.evaluate(async ({ sensor }) =>
            (await import('/physics.js')).getMachineSensorStatus(sensor.x, sensor.y), { sensor });
        expect(firstStatus).toMatchObject({
            rule: 4,
            threshold: 10,
            conditionMet: true,
            inputActive: false,
            passing: false
        });
        const firstReading = formatLiveReading(firstStatus.reading, unit);
        await assertLiveSurface(dialogStatus, {
            state: 'ready', stateLabel: 'RULE TRUE · NO INPUT CURRENT',
            reading: firstReading,
            comparison: `Greater than 10${unit === '°C' ? ' °C' : '%'}`,
            input: 'Input power: OFF', green: false
        });

        const nextReading = 40;
        const sampled = await sampleState(sensor, Array(5).fill(nextReading));
        const sampledReading = formatLiveReading(sampled.reading, unit);
        await assertLiveSurface(dialogStatus, {
            state: 'ready', stateLabel: 'RULE TRUE · NO INPUT CURRENT',
            reading: sampledReading,
            comparison: `Greater than 10${unit === '°C' ? ' °C' : '%'}`,
            input: 'Input power: OFF', green: false
        });

        await page.evaluate(async ({ sensor }) => {
            const physics = await import('/physics.js');
            const world = physics.getWorld();
            const definitions = physics.getDefinitions();
            const batteryId = definitions.findIndex(definition => definition?.name === 'Battery');
            physics.setCell(sensor.battery.x, sensor.battery.y, batteryId);
            world.charge[physics.index(sensor.battery.x, sensor.battery.y)] = definitions[batteryId].chargeCapacity;
        }, { sensor });
        await game.step(1);
        await game.step(0);
        const passing = await page.evaluate(async ({ sensor }) =>
            (await import('/physics.js')).getMachineSensorStatus(sensor.x, sensor.y), { sensor });
        expect(passing).toMatchObject({ conditionMet: true,
            inputActive: true, passing: true });
        const passingReading = formatLiveReading(passing.reading, unit);
        await assertLiveSurface(dialogStatus, {
            state: 'passing', stateLabel: /passing/i,
            reading: passingReading,
            comparison: `Greater than 10${unit === '°C' ? ' °C' : '%'}`,
            input: 'Input power: ON', green: true
        });

        await dialog.getByRole('spinbutton', { name: sensor.inputLabel, exact: true }).fill('50');
        const blocked = await page.evaluate(async ({ sensor }) =>
            (await import('/physics.js')).getMachineSensorStatus(sensor.x, sensor.y), { sensor });
        expect(blocked).toMatchObject({ rule: 4, threshold: 50,
            conditionMet: false, inputActive: true, passing: false });
        const blockedReading = formatLiveReading(blocked.reading, unit);
        await assertLiveSurface(dialogStatus, {
            state: 'blocked', stateLabel: /blocked/i,
            reading: blockedReading,
            comparison: `Greater than 50${unit === '°C' ? ' °C' : '%'}`,
            input: 'Input power: ON', green: false
        });

        const noAir = await sampleState(sensor, [], true);
        expect(noAir).toMatchObject({ reading: null, conditionMet: false,
            inputActive: true, passing: false });
        await assertLiveSurface(dialogStatus, {
            state: 'no-air', stateLabel: /no air/i,
            reading: null,
            comparison: `Greater than 50${unit === '°C' ? ' °C' : '%'}`,
            input: 'Input power: ON', green: false
        });

        await page.locator('#machineDialogCancel').click();
        await page.mouse.move(point.x, point.y);
        const tooltip = page.locator('.machine-sensor-tooltip');
        await assertLiveSurface(tooltip, {
            state: 'no-air', stateLabel: /no air/i,
            reading: null,
            comparison: `Greater than 50${unit === '°C' ? ' °C' : '%'}`,
            input: 'Input power: ON', green: false
        });

        const tooltipSample = await sampleState(sensor, Array(5).fill(nextReading));
        const tooltipSampleReading = formatLiveReading(tooltipSample.reading, unit);
        await assertLiveSurface(tooltip, {
            state: 'blocked', stateLabel: /blocked/i,
            reading: tooltipSampleReading,
            comparison: `Greater than 50${unit === '°C' ? ' °C' : '%'}`,
            input: 'Input power: ON', green: false
        });
        await page.evaluate(async ({ sensor }) =>
            (await import('/physics.js')).setMachineSensorThreshold(sensor.x, sensor.y, 0), { sensor });
        await assertLiveSurface(tooltip, {
            state: 'passing', stateLabel: /passing/i,
            reading: tooltipSampleReading,
            comparison: `Greater than 0${unit === '°C' ? ' °C' : '%'}`,
            input: 'Input power: ON', green: true
        });
    }
});

test('sensor collision footprint stops falling particles before they pass behind the artwork', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const cell = { x: 65, y: 45 };
    const ids = await page.evaluate(async cell => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const sensor = definitions.findIndex(definition => definition?.name === 'Temperature Switch');
        const sand = definitions.findIndex(definition => definition?.name === 'Sand');
        physics.clearWorld();
        physics.setCell(cell.x, cell.y, sensor);
        physics.setCell(cell.x, cell.y - 5, sand);
        return { sensor, sand };
    }, cell);
    await game.step(12);
    const state = await game.state();
    expect(state.arrays.type[cell.y * state.cols + cell.x]).toBe(ids.sensor);
    // The sensor's declared 5x5 collision body ends two cells above its anchor.
    expect(state.arrays.type[(cell.y - 3) * state.cols + cell.x]).toBe(ids.sand);
    expect(state.arrays.type[(cell.y - 2) * state.cols + cell.x]).toBe(0);
});

test('Lamp glows yellow only when ON and powered, and draws a small Battery load', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const lampCell = { x: 48, y: 35 };
    await page.evaluate(async lampCell => {
        const physics = await import('/physics.js');
        const lamp = physics.getDefinitions().findIndex(definition => definition?.name === 'Lamp');
        physics.clearWorld();
        physics.setCell(lampCell.x, lampCell.y, lamp);
    }, lampCell);
    await game.step(0);
    await game.step(1);
    await game.step(0);

    const glow = page.locator('#machineOverlay .machine-overlay-icon.machine-lamp .machine-lamp-glow');
    await expect(glow).toHaveCount(1);
    await expect(glow).toHaveAttribute('data-lit', 'false');

    const source = await page.evaluate(async ({ lampCell }) => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        const ports = physics.getMachinePorts(lampCell.x, lampCell.y);
        const input = ports.find(port => port.role === 'input');
        const directionX = Math.sign(input.directionX);
        const directionY = Math.sign(input.directionY);
        const contact = input.connectionCell;
        const wire = { x: contact.x + directionX, y: contact.y + directionY };
        const battery = { x: contact.x + 2 * directionX, y: contact.y + 2 * directionY };
        physics.setCell(contact.x, contact.y, id('Elec'));
        physics.setCell(wire.x, wire.y, id('Elec'));
        physics.setCell(battery.x, battery.y, id('Battery'));
        world.charge[physics.index(battery.x, battery.y)] = 10;
        return { battery, startingCharge: 10 };
    }, { lampCell });
    await game.step(1);
    await game.step(0);

    const active = await page.evaluate(async ({ lampCell, battery }) => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        return {
            powered: physics.isMachinePoweredAt(lampCell.x, lampCell.y),
            charge: physics.getStoredCharge(battery.x, battery.y),
            lampLoad: definitions.find(definition => definition?.name === 'Lamp').powerConsumption,
            heaterLoad: definitions.find(definition => definition?.name === 'Heater').powerConsumption
        };
    }, { lampCell, battery: source.battery });
    expect(active.powered).toBe(true);
    expect(active.charge).toBeLessThan(source.startingCharge);
    expect(active.lampLoad).toBeGreaterThan(0);
    expect(active.lampLoad).toBeLessThan(active.heaterLoad / 10);
    await expect(glow).toHaveAttribute('data-lit', 'true');
    const glowRgb = await glow.evaluate(element => {
        const match = getComputedStyle(element).fill.match(/[\d.]+/g);
        return match ? match.slice(0, 3).map(Number) : null;
    });
    expect(glowRgb).not.toBeNull();
    expect(glowRgb[0]).toBeGreaterThan(190);
    expect(glowRgb[1]).toBeGreaterThan(140);
    expect(glowRgb[2]).toBeLessThan(130);

    await page.mouse.click(...Object.values(await canvasPoint(page, lampCell)));
    const dialog = page.getByRole('dialog', { name: 'Lamp settings' });
    const toggle = page.getByRole('switch', { name: 'Lamp', exact: true });
    await expect(dialog).toBeVisible();
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await game.step(1);
    await game.step(0);
    await expect(glow).toHaveAttribute('data-lit', 'false');
    const off = await page.evaluate(async ({ battery }) => {
        const physics = await import('/physics.js');
        return physics.getStoredCharge(battery.x, battery.y);
    }, { battery: source.battery });
    expect(active.charge - off).toBeLessThan(source.startingCharge - active.charge);
});

test('Battery-backed long Elec runs keep a Temperature Switch and Lamp active until charge is depleted', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const fixture = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        const battery = { x: 30, y: 70 };
        const sensor = { x: 100, y: 70 };
        const lamp = { x: 180, y: 70 };
        physics.clearWorld();
        physics.setCell(sensor.x, sensor.y, id('Temperature Switch'));
        physics.setCell(lamp.x, lamp.y, id('Lamp'));

        const sensorPorts = physics.getMachinePorts(sensor.x, sensor.y);
        const lampInput = physics.getMachinePorts(lamp.x, lamp.y)
            .find(port => port.role === 'input').connectionCell;
        const input = sensorPorts.find(port => port.role === 'input').connectionCell;
        const output = sensorPorts.find(port => port.role === 'output').connectionCell;
        for (let x = battery.x + 1; x <= input.x; x++) physics.setCell(x, battery.y, id('Elec'));
        for (let x = output.x; x <= lampInput.x; x++) physics.setCell(x, output.y, id('Elec'));
        physics.setCell(battery.x, battery.y, id('Battery'));
        const batteryIndex = physics.index(battery.x, battery.y);
        const batteryCapacity = definitions[id('Battery')].chargeCapacity;
        world.charge[batteryIndex] = batteryCapacity;
        physics.setMachineSensorRule(sensor.x, sensor.y, 4);
        physics.setMachineSensorThreshold(sensor.x, sensor.y, 1);
        for (let dx = -2; dx <= 2; dx++) {
            const probe = physics.index(sensor.x + dx, sensor.y - 3);
            world.temp[probe] = 30;
        }

        const inputCells = [];
        for (let x = battery.x + 1; x <= input.x; x++) inputCells.push(physics.index(x, battery.y));
        const outputCells = [];
        for (let x = output.x; x <= lampInput.x; x++) outputCells.push(physics.index(x, output.y));
        return {
            battery, batteryCapacity, batteryIndex, startingCharge: world.charge[batteryIndex], sensor, lamp,
            input, output, lampInput, inputCells, outputCells
        };
    });
    expect(fixture.startingCharge).toBe(fixture.batteryCapacity);

    // A steady Battery supply is logical state, separate from transient Spark pulses.
    await game.step(1);
    const steadyPowerWithoutPulse = await page.evaluate(async ({ inputCells, outputCells }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        return [...inputCells, ...outputCells].every(cell =>
            physics.isLogicallyPowered(cell % world.cols, Math.floor(cell / world.cols)) &&
            world.power[cell] === 0 && world.powerDelay[cell] === 0);
    }, fixture);
    expect(steadyPowerWithoutPulse,
        'steady Battery current keeps the route logically powered without Spark pulse fields').toBe(true);

    await game.step(150);
    await game.step(0);
    const sampleFrames = async count => page.evaluate(async ({ fixture, count }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const frames = [];
        const isCurrent = cell => physics.isLogicallyPowered(
            cell % world.cols, Math.floor(cell / world.cols));
        for (let frame = 0; frame < count; frame++) {
            physics.stepSimulation();
            const status = physics.getMachineSensorStatus(fixture.sensor.x, fixture.sensor.y);
            frames.push({
                inputActive: status.inputActive,
                passing: status.passing,
                inputRouteCurrent: fixture.inputCells.every(isCurrent),
                outputRouteCurrent: fixture.outputCells.every(isCurrent),
                lampPowered: physics.isMachinePoweredAt(fixture.lamp.x, fixture.lamp.y)
            });
        }
        return frames;
    }, { fixture, count });

    const sustained = await sampleFrames(45);
    expect(sustained).toHaveLength(45);
    for (const [offset, frame] of sustained.entries()) {
        expect(frame.inputActive, `active Battery input at sample frame ${offset}`).toBe(true);
        expect(frame.passing, `true comparison passes at sample frame ${offset}`).toBe(true);
        expect(frame.inputRouteCurrent,
            `every input Elec cell has logical current at sample frame ${offset}`).toBe(true);
        expect(frame.outputRouteCurrent,
            `every output Elec cell has logical current at sample frame ${offset}`).toBe(true);
        expect(frame.lampPowered, `Lamp remains powered at sample frame ${offset}`).toBe(true);
    }
    await game.step(0);
    const lampGlow = page.locator(
        `#machineOverlay .machine-overlay-icon.machine-lamp[data-machine-x="${fixture.lamp.x}"][data-machine-y="${fixture.lamp.y}"] .machine-lamp-glow`
    );
    await expect(lampGlow).toHaveAttribute('data-lit', 'true');

    await page.evaluate(async ({ sensor }) =>
        (await import('/physics.js')).setMachineSensorThreshold(sensor.x, sensor.y, 100), fixture);
    const blockedTransition = await page.evaluate(async ({ fixture }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        physics.stepSimulation();
        const isCurrent = cell => physics.isLogicallyPowered(
            cell % world.cols, Math.floor(cell / world.cols));
        const status = physics.getMachineSensorStatus(fixture.sensor.x, fixture.sensor.y);
        return {
            inputActive: status.inputActive,
            passing: status.passing,
            outputRouteCurrent: fixture.outputCells.some(isCurrent),
            lampPowered: physics.isMachinePoweredAt(fixture.lamp.x, fixture.lamp.y),
            outputSparkPulse: fixture.outputCells.some(cell =>
                world.power[cell] > 0 || world.powerDelay[cell] > 0)
        };
    }, { fixture });
    expect(blockedTransition.inputActive).toBe(true);
    expect(blockedTransition.passing).toBe(false);
    expect(blockedTransition.outputRouteCurrent).toBe(false);
    expect(blockedTransition.lampPowered).toBe(false);
    expect(blockedTransition.outputSparkPulse,
        'gating off Battery current does not create a transient Spark pulse').toBe(false);

    const blockedFrames = await page.evaluate(async ({ fixture, count }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const isCurrent = cell => physics.isLogicallyPowered(
            cell % world.cols, Math.floor(cell / world.cols));
        const frames = [];
        for (let frame = 0; frame < count; frame++) {
            physics.stepSimulation();
            const status = physics.getMachineSensorStatus(fixture.sensor.x, fixture.sensor.y);
            frames.push({
                inputActive: status.inputActive,
                conditionMet: status.conditionMet,
                passing: status.passing,
                lampPowered: physics.isMachinePoweredAt(fixture.lamp.x, fixture.lamp.y),
                inputRouteCurrent: fixture.inputCells.every(isCurrent),
                outputRouteCurrent: fixture.outputCells.every(isCurrent)
            });
        }
        return frames;
    }, { fixture, count: 89 });
    for (const [offset, frame] of blockedFrames.entries()) {
        expect(frame.inputActive, `Battery input remains active while blocked at frame ${offset}`).toBe(true);
        expect(frame.conditionMet, `false comparison remains false at frame ${offset}`).toBe(false);
        expect(frame.passing, `false comparison blocks relay at frame ${offset}`).toBe(false);
        expect(frame.inputRouteCurrent,
            `Battery-fed input route remains current while blocked at frame ${offset}`).toBe(true);
        expect(frame.outputRouteCurrent,
            `false comparison removes logical output current at frame ${offset}`).toBe(false);
        expect(frame.lampPowered, `false comparison removes Lamp current at frame ${offset}`).toBe(false);
    }
    await game.step(0);
    await expect(lampGlow).toHaveAttribute('data-lit', 'false');

    await page.evaluate(async ({ sensor }) => {
        const physics = await import('/physics.js');
        physics.setMachineSensorThreshold(sensor.x, sensor.y, 1);
    }, { sensor: fixture.sensor });
    await game.step(150);
    const resumed = await sampleFrames(35);
    for (const [offset, frame] of resumed.entries()) {
        expect(frame.inputActive, `input resumes at frame ${offset}`).toBe(true);
        expect(frame.passing, `true comparison resumes at frame ${offset}`).toBe(true);
        expect(frame.inputRouteCurrent,
            `input route remains logical current at frame ${offset}`).toBe(true);
        expect(frame.outputRouteCurrent,
            `output route remains logical current at frame ${offset}`).toBe(true);
        expect(frame.lampPowered, `Lamp resumes at frame ${offset}`).toBe(true);
    }
    await game.step(0);
    await expect(lampGlow).toHaveAttribute('data-lit', 'true');

    await page.evaluate(async ({ batteryIndex }) => {
        const world = (await import('/physics.js')).getWorld();
        world.charge[batteryIndex] = 0.001;
    }, { batteryIndex: fixture.batteryIndex });
    await game.step(1);
    const immediateDepletion = await page.evaluate(async ({ fixture }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const status = physics.getMachineSensorStatus(fixture.sensor.x, fixture.sensor.y);
        const isCurrent = cell => physics.isLogicallyPowered(
            cell % world.cols, Math.floor(cell / world.cols));
        return {
            charge: physics.getStoredCharge(fixture.battery.x, fixture.battery.y),
            inputActive: status.inputActive,
            inputRouteCurrent: fixture.inputCells.some(isCurrent),
            outputRouteCurrent: fixture.outputCells.some(isCurrent),
            lampPowered: physics.isMachinePoweredAt(fixture.lamp.x, fixture.lamp.y),
            sparkPulse: [...fixture.inputCells, ...fixture.outputCells].some(cell =>
                world.power[cell] > 0 || world.powerDelay[cell] > 0)
        };
    }, { fixture });
    expect(immediateDepletion).toEqual({
        charge: 0,
        inputActive: false,
        inputRouteCurrent: false,
        outputRouteCurrent: false,
        lampPowered: false,
        sparkPulse: false
    });

    await game.step(179);
    const depleted = await page.evaluate(async ({ fixture }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const status = physics.getMachineSensorStatus(fixture.sensor.x, fixture.sensor.y);
        const isCurrent = cell => physics.isLogicallyPowered(
            cell % world.cols, Math.floor(cell / world.cols));
        return {
            charge: physics.getStoredCharge(fixture.battery.x, fixture.battery.y),
            inputActive: status.inputActive,
            inputRouteCurrent: fixture.inputCells.some(isCurrent),
            outputRouteCurrent: fixture.outputCells.some(isCurrent),
            lampPowered: physics.isMachinePoweredAt(fixture.lamp.x, fixture.lamp.y)
        };
    }, { fixture });
    expect(depleted.charge).toBe(0);
    expect(depleted.inputActive).toBe(false);
    expect(depleted.inputRouteCurrent).toBe(false);
    expect(depleted.outputRouteCurrent).toBe(false);
    expect(depleted.lampPowered).toBe(false);
    await game.step(0);
    await expect(lampGlow).toHaveAttribute('data-lit', 'false');
});

test('electrical port leads use Elec and keep their forced two-cell width regardless of brush size', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    const machine = { x: 80, y: 35 };
    const port = await page.evaluate(async machine => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = definitions.findIndex(definition => definition?.name === 'Simple Switch');
        physics.clearWorld();
        physics.setCell(machine.x, machine.y, id);
        physics.getWorld().data[physics.index(machine.x, machine.y)] = 0;
        return physics.getMachinePorts(machine.x, machine.y).find(port => port.role === 'input');
    }, machine);
    expect(Math.abs(port.directionX), JSON.stringify(port)).toBeGreaterThan(0.9);
    await game.step(0);

    const marker = page.locator(
        `#machineOverlay .machine-overlay-icon[data-machine-x="${machine.x}"][data-machine-y="${machine.y}"] .machine-port-input`
    );
    await expect(marker).toHaveCount(1);
    const markerBox = await marker.boundingBox();
    expect(markerBox).not.toBeNull();
    const start = { x: markerBox.x + markerBox.width / 2, y: markerBox.y + markerBox.height / 2 };
    const end = { x: start.x + port.directionX * 16, y: start.y + port.directionY * 16 };
    await page.locator('#brushSize').evaluate(input => {
        input.value = '9';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 3 });
    await page.mouse.up();
    await game.step(0);

    const lead = await page.evaluate(async ({ machine, slot }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const elecId = physics.getDefinitions().findIndex(definition => definition?.name === 'Elec');
        const values = [];
        for (let i = 0; i < world.type.length; i++) {
            if (physics.getMachinePortLeadOwner(i % world.cols, Math.floor(i / world.cols)) ===
                physics.index(machine.x, machine.y) &&
                world.machinePortLeadSlot[i] === slot + 1) {
                values.push({
                    x: i % world.cols,
                    y: Math.floor(i / world.cols),
                    type: world.type[i]
                });
            }
        }
        return { cells: values, elecId };
    }, { machine, slot: port.slot });
    expect(lead.cells.length).toBeGreaterThan(2);
    expect(lead.cells.every(cell => cell.type === lead.elecId)).toBe(true);
    expect(new Set(lead.cells.map(cell => cell.y)).size).toBe(2);
    await expect(page.locator('#brushSize')).toHaveValue('9');
});

test('Fan power state is false without a source and true only on a charged Battery route', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    await installElectricalFixture(page, { machine: [30, 35, 'Fan'] });
    await game.step(1);
    const unpowered = await electricalState(page, [{ x: 30, y: 35 }]);
    expect(unpowered.cells[0].machinePowered).toBe(false);
    expect(unpowered.cells[0].powered).toBe(false);

    await installElectricalFixture(page, {
        batteries: [[29, 35]],
        conductors: [[28, 35, 'Elec']],
        machine: [30, 35, 'Fan'],
        batteryCharge: 2
    });
    await game.step(1);
    const poweredImmediately = await electricalState(page, [
        { x: 30, y: 35 },
        { x: 28, y: 35 }
    ]);
    expect(poweredImmediately.cells[0].machinePowered).toBe(true);
    expect(poweredImmediately.cells[0].powered).toBe(false);
    expect(poweredImmediately.cells[1].logicallyPowered).toBe(true);
    expect(poweredImmediately.cells[1].powered).toBe(false);
    expect(poweredImmediately.cells[1].powerDelay).toBe(0);
    expect(poweredImmediately.cells[1].power).toBe(0);

    await game.step(1);
    const powered = await electricalState(page, [
        { x: 30, y: 35 },
        { x: 28, y: 35 }
    ]);
    powered.diagnostics = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const definitions = physics.getDefinitions();
        const wireIndex = physics.index(28, 35);
        return {
            batteryCharge: physics.getStoredCharge(29, 35),
            wireLogicalPower: physics.isLogicallyPowered(28, 35),
            wireType: definitions[world.type[wireIndex]]?.name ?? world.type[wireIndex],
            machineLiveStatus: physics.getMachineLiveStatus(30, 35),
            fanInputPorts: physics.getMachinePorts(30, 35)
                .filter(port => port.role === 'input')
                .map(port => ({
                    ...port,
                    connectionCell: port.connectionCell ? { ...port.connectionCell } : null,
                    contactCells: (port.contactCells || []).map(cell => ({ ...cell }))
                }))
        };
    });
    expect(powered.cells[0].machinePowered, JSON.stringify(powered)).toBe(true);
    expect(powered.cells[1].logicallyPowered).toBe(true);
    expect(powered.cells[1].powered).toBe(false);
    expect(powered.cells[1].power).toBe(0);
});

test('a Copper lead outside the visible machine port rejects connection and invalid electrical queries stay inert', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await installElectricalFixture(page, {
        batteries: [[20, 35]],
        conductors: [[21, 35, 'Copper']],
        machine: [29, 35, 'Fan'],
        batteryCharge: 2
    });

    await game.step(1);
    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        return {
            farMachine: physics.isMachinePoweredAt(25, 35),
            nonBattery: physics.getConnectedBatteryCharge(21, 35),
            outsideBattery: physics.getConnectedBatteryCharge(-1, 35),
            outsideCharge: physics.getStoredCharge(-1, 35),
            outsidePower: physics.isPowered(80, 35),
            outsideMachine: physics.isMachinePoweredAt(80, 35)
        };
    });
    expect(result.farMachine).toBe(false);
    expect(result.nonBattery).toBeNull();
    expect(result.outsideBattery).toBeNull();
    expect(result.outsideCharge).toBe(0);
    expect(result.outsidePower).toBe(false);
    expect(result.outsideMachine).toBe(false);
});

test('clearWorld resets electrical charge, pulse state, and machine power', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await installElectricalFixture(page, {
        batteries: [[20, 35]],
        conductors: [[21, 35, 'Copper']],
        machine: [23, 35, 'Fan'],
        batteryCharge: 2
    });
    await game.step(1);

    const steady = await electricalState(page, [
        { x: 20, y: 35 },
        { x: 21, y: 35 },
        { x: 23, y: 35 }
    ]);
    expect(steady.cells[0].charge).toBeGreaterThan(0);
    expect(steady.cells[1].logicallyPowered).toBe(true);
    expect(steady.cells[1].power).toBe(0);
    expect(steady.cells[1].powerDelay).toBe(0);
    expect(steady.cells[2].machinePowered).toBe(true);

    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        physics.setCell(21, 34, physics.getDefinitions().find(definition => definition?.name === 'Spark').id);
    });
    await game.step(1);
    const pulse = await electricalState(page, [{ x: 21, y: 35 }]);
    expect(pulse.cells[0].power, 'a real Spark still creates a transient visual pulse').toBeGreaterThan(0);

    const after = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        physics.clearWorld();
        const world = physics.getWorld();
        return {
            typesEmpty: world.type.every(value => value === 0),
            chargesEmpty: world.charge.every(value => value === 0),
            powerEmpty: world.power.every(value => value === 0),
            delaysEmpty: world.powerDelay.every(value => value === 0),
            logicalPowerEmpty: world.logicalPower.every(value => value === 0),
            battery: physics.getConnectedBatteryCharge(20, 35),
            charge: physics.getStoredCharge(20, 35),
            powered: physics.isPowered(21, 35),
            machinePowered: physics.isMachinePoweredAt(23, 35)
        };
    });
    expect(after.typesEmpty).toBe(true);
    expect(after.chargesEmpty).toBe(true);
    expect(after.powerEmpty).toBe(true);
    expect(after.delaysEmpty).toBe(true);
    expect(after.logicalPowerEmpty).toBe(true);
    expect(after.battery).toBeNull();
    expect(after.charge).toBe(0);
    expect(after.powered).toBe(false);
    expect(after.machinePowered).toBe(false);
});

test('wire spark toggle sits beside Edge pan and hides bolts while powered wires stay bright yellow', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const toggle = page.getByRole('checkbox', { name: 'No wire spark animation' });
    await expect(toggle).toHaveCount(1);
    await expect(toggle).not.toBeChecked();
    const adjacentToEdgePan = await page.evaluate(() => {
        const edgeLabel = document.querySelector('#edgePanToggle')?.closest('label');
        const sparkLabel = document.querySelector('#noWireSparksToggle')?.closest('label');
        return !!edgeLabel && !!sparkLabel && edgeLabel.parentElement === sparkLabel.parentElement &&
            edgeLabel.nextElementSibling === sparkLabel;
    });
    expect(adjacentToEdgePan, 'the opt-out checkbox immediately follows Edge pan').toBe(true);

    const wireCell = { x: 50, y: 35 };
    const steadyWire = await page.evaluate(async wireCell => {
        const physics = await import('/physics.js');
        const game = await import('/game.js');
        const world = physics.getWorld();
        const definitions = physics.getDefinitions();
        const elec = definitions.find(definition => definition?.name === 'Elec').id;
        const battery = definitions.find(definition => definition?.name === 'Battery');
        physics.clearWorld();
        physics.setCell(39, wireCell.y, battery.id);
        world.charge[physics.index(39, wireCell.y)] = battery.chargeCapacity;
        for (let x = 40; x <= 60; x++) {
            physics.setCell(x, wireCell.y, elec);
        }
        physics.stepSimulation();
        game.renderWorld();
        const at = physics.index(wireCell.x, wireCell.y);
        return {
            logicalPower: physics.isLogicallyPowered(wireCell.x, wireCell.y),
            pulsePower: world.power[at],
            pulseDelay: world.powerDelay[at]
        };
    }, wireCell);
    expect(steadyWire.logicalPower).toBe(true);
    expect(steadyWire.pulsePower, 'Battery current is not represented as a transient Spark pulse').toBe(0);
    expect(steadyWire.pulseDelay).toBe(0);
    expect(await page.locator('#machineOverlay .electrical-z-bolt').count()).toBeGreaterThan(0);

    const poweredWireView = await page.locator('#canvas').evaluate(({ width, height }, cell) => {
        const ctx = document.querySelector('#canvas').getContext('2d');
        const [red, green, blue] = ctx.getImageData(cell.x, cell.y, 1, 1).data;
        return { red, green, blue };
    }, wireCell);
    expect(poweredWireView.red).toBeGreaterThan(200);
    expect(poweredWireView.green).toBeGreaterThan(160);
    expect(poweredWireView.blue).toBeLessThan(110);

    await toggle.check();
    await page.evaluate(async () => (await import('/game.js')).renderWorld());
    await expect(page.locator('#noWireSparksToggle')).toBeChecked();
    await expect(page.locator('#machineOverlay .electrical-z-bolt')).toHaveCount(0);
});

test('expensive electrical solve refreshes every 30 ticks while cached power and per-tick Battery drain continue', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.find(definition => definition?.name === name).id;
        const world = physics.getWorld();
        const battery = { x: 20, y: 35 };
        const wire = { x: 21, y: 35 };
        const fan = { x: 23, y: 35 };
        physics.clearWorld();
        physics.setCell(battery.x, battery.y, id('Battery'));
        physics.setCell(wire.x, wire.y, id('Elec'));
        physics.setCell(fan.x, fan.y, id('Fan'));
        const batteryIndex = physics.index(battery.x, battery.y);
        const capacity = definitions[id('Battery')].chargeCapacity;
        world.charge[batteryIndex] = capacity;
        physics.stepSimulation();
        const initialCharge = world.charge[batteryIndex];
        const expectedLoadPerTick = physics.getBatteryCircuitMetrics(battery.x, battery.y)?.load ?? 0;
        const initialPower = physics.isMachinePoweredAt(fan.x, fan.y);

        const recorder = {
            enabled: true,
            events: [],
            record(name, durationMs, counters = {}) {
                if (this.enabled) this.events.push({ name, durationMs, counters });
            }
        };
        window.__P0_PERF__ = recorder;
        for (let tick = 0; tick < 61; tick++) physics.stepSimulation();
        recorder.enabled = false;
        const refreshCount = recorder.events.filter(event => event.name === 'electricalTopologyRefresh').length;
        return {
            refreshCount,
            initialPower,
            powerAfterInterval: physics.isMachinePoweredAt(fan.x, fan.y),
            expectedLoadPerTick,
            actualDrain: initialCharge - world.charge[batteryIndex],
            expectedDrain: expectedLoadPerTick * 61
        };
    });

    expect(result.initialPower).toBe(true);
    expect(result.powerAfterInterval, 'the last logical power result remains live between refreshes').toBe(true);
    expect(result.refreshCount, '61 steady ticks contain only the two 30-tick refreshes').toBe(2);
    expect(result.expectedLoadPerTick).toBeGreaterThan(0);
    expect(result.actualDrain).toBeGreaterThan(0);
    expect(result.actualDrain).toBeCloseTo(result.expectedDrain, 3);
});

test('moving Z bolts follow powered conductive cells and never appear on Battery cells', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const samples = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const game = await import('/game.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.find(definition => definition?.name === name).id;
        const world = physics.getWorld();
        const route = [
            ...Array.from({ length: 9 }, (_, offset) => ({ x: 40 + offset, y: 35 })),
            ...Array.from({ length: 6 }, (_, offset) => ({ x: 48, y: 36 + offset })),
            ...Array.from({ length: 8 }, (_, offset) => ({ x: 47 - offset, y: 41 }))
        ];
        const battery = { x: 39, y: 41 };
        physics.clearWorld();
        for (const cell of route) physics.setCell(cell.x, cell.y, id('Elec'));
        physics.setCell(battery.x, battery.y, id('Battery'));

        const frames = [];
        for (let sample = 0; sample < 4; sample++) {
            for (const cell of route) world.power[physics.index(cell.x, cell.y)] = 7;
            world.power[physics.index(battery.x, battery.y)] = 7;
            physics.stepSimulation();
            game.renderWorld();
            frames.push([...document.querySelectorAll('#machineOverlay .electrical-z-bolt')].map(bolt => ({
                x: Number(bolt.dataset.cellX),
                y: Number(bolt.dataset.cellY),
                path: bolt.getAttribute('d'),
                tag: bolt.tagName
            })));
        }

        const live = new Map([...route, battery].map(cell => {
            const at = physics.index(cell.x, cell.y);
            return [`${cell.x},${cell.y}`, {
                type: world.type[at],
                conductive: !!definitions[world.type[at]]?.conductive,
                power: world.power[at]
            }];
        }));
        return { frames, battery, live: Object.fromEntries(live), route };
    });

    const allBolts = samples.frames.flat();
    expect(allBolts.length).toBeGreaterThan(0);
    expect(new Set(samples.frames.map(frame => frame.map(bolt => `${bolt.x},${bolt.y}`).join('|'))).size)
        .toBeGreaterThan(1);
    const routeKeys = new Set(samples.route.map(cell => `${cell.x},${cell.y}`));
    const rowMajorRoute = [...samples.route].sort((a, b) => a.y - b.y || a.x - b.x);
    const rowMajorMaxJump = Math.max(...rowMajorRoute.slice(1).map((cell, position) => {
        const previous = rowMajorRoute[position];
        return Math.max(Math.abs(cell.x - previous.x), Math.abs(cell.y - previous.y));
    }));
    expect(rowMajorMaxJump).toBeGreaterThan(1);

    for (const [frameIndex, frame] of samples.frames.entries()) {
        expect(frame.length).toBeGreaterThanOrEqual(4);
        for (const [boltIndex, bolt] of frame.entries()) {
            expect(routeKeys.has(`${bolt.x},${bolt.y}`), 'each bolt occupies a cell on the U-shaped route')
                .toBe(true);
            if (boltIndex === 0) continue;
            const previous = frame[boltIndex - 1];
            const distance = Math.max(Math.abs(bolt.x - previous.x), Math.abs(bolt.y - previous.y));
            expect(distance, 'successive bolts traverse neighboring route cells without row-major jumps')
                .toBe(1);
        }
        if (frameIndex === 0) continue;
        const previousFrame = samples.frames[frameIndex - 1];
        expect(frame[0], 'the moving bolt train advances three connected route cells per frame')
            .toEqual(previousFrame[3]);
    }

    for (const bolt of allBolts) {
        expect(bolt.tag.toLowerCase()).toBe('path');
        const lineSegments = bolt.path.match(/\bL\s*[-\d.]+[ ,]+[-\d.]+/g) || [];
        expect(lineSegments.length, 'each bolt is a short Z-shaped polyline').toBeGreaterThanOrEqual(3);
        const cell = samples.live[`${bolt.x},${bolt.y}`];
        expect(cell?.conductive, 'each moving bolt is attached to a conductive cell').toBe(true);
        expect(cell?.power, 'each moving bolt is attached to a powered cell').toBeGreaterThan(0);
        expect(`${bolt.x},${bolt.y}`).not.toBe(`${samples.battery.x},${samples.battery.y}`);
    }
});

test('Battery charge direction glyph is centered, colored, and tracks net charge flow without wire bolts', async ({ page }) => {
    const game = new GamePage(page);
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await game.openMenu();
    await game.newGame();

    const batteryCell = { x: 50, y: 35 };
    await page.evaluate(async batteryCell => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.find(definition => definition?.name === name).id;
        const world = physics.getWorld();
        physics.clearWorld();
        physics.setCell(batteryCell.x, batteryCell.y, id('Battery'));
        const battery = definitions[id('Battery')];
        world.charge[physics.index(batteryCell.x, batteryCell.y)] = battery.chargeCapacity / 2;
        physics.stepSimulation();
    }, batteryCell);

    const point = await canvasPoint(page, batteryCell);
    await page.mouse.move(point.x, point.y);
    await page.evaluate(async () => (await import('/game.js')).gameLoop(performance.now()));
    await expect(page.locator('#machineOverlay .battery-charge-trend')).toHaveCount(0);
    await page.clock.runFor(5000);
    await page.evaluate(async () => (await import('/game.js')).gameLoop(performance.now()));
    await expect(page.locator('#machineOverlay .battery-charge-trend'),
        'an isolated Battery with unchanged charge stays directionless after the trend window').toHaveCount(0);

    await page.mouse.move(5, 5);
    await page.evaluate(async () => (await import('/game.js')).gameLoop(performance.now()));
    await page.evaluate(async batteryCell => {
        const physics = await import('/physics.js');
        physics.setCell(batteryCell.x + 1, batteryCell.y,
            physics.getDefinitions().find(definition => definition?.name === 'Fan').id);
    }, batteryCell);
    await page.mouse.move(point.x, point.y);
    await page.evaluate(async () => (await import('/game.js')).gameLoop(performance.now()));
    const lowChargeColor = await page.locator('#canvas').evaluate((canvas, cell) =>
        [...canvas.getContext('2d').getImageData(cell.x, cell.y, 1, 1).data].slice(0, 3), batteryCell);

    const startCharge = await page.evaluate(async batteryCell => {
        const physics = await import('/physics.js');
        const battery = physics.getDefinitions().find(definition => definition?.name === 'Battery');
        return physics.getWorld().charge[physics.index(batteryCell.x, batteryCell.y)] + battery.chargeCapacity / 8;
    }, batteryCell);
    await page.clock.runFor(5000);
    await page.evaluate(async ({ batteryCell, charge }) => {
        const physics = await import('/physics.js');
        const game = await import('/game.js');
        physics.getWorld().charge[physics.index(batteryCell.x, batteryCell.y)] = charge;
        game.gameLoop(performance.now());
        game.renderWorld();
    }, { batteryCell, charge: startCharge });

    const charging = page.locator('#machineOverlay .battery-charge-trend');
    await expect(charging).toHaveAttribute('data-state', 'charging');
    await expect(charging).toHaveText('+');
    const chargingVisual = await charging.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const canvasRect = document.querySelector('#canvas').getBoundingClientRect();
        const cellWidth = canvasRect.width / 260;
        const cellHeight = canvasRect.height / 150;
        const centerX = canvasRect.left + (50.5 * cellWidth);
        const centerY = canvasRect.top + (35.5 * cellHeight);
        return {
            color: style.fill || style.color,
            centerX: rect.left + rect.width / 2,
            centerY: rect.top + rect.height / 2,
            expectedX: centerX,
            expectedY: centerY
        };
    });
    const chargingRgb = (chargingVisual.color.match(/[\d.]+/g) || []).map(Number);
    expect(chargingRgb[1]).toBeGreaterThan(chargingRgb[0]);
    expect(chargingVisual.centerX).toBeCloseTo(chargingVisual.expectedX, 0);
    expect(chargingVisual.centerY).toBeCloseTo(chargingVisual.expectedY, 0);

    const highChargeColor = await page.locator('#canvas').evaluate((canvas, cell) =>
        [...canvas.getContext('2d').getImageData(cell.x, cell.y, 1, 1).data].slice(0, 3), batteryCell);
    expect(highChargeColor[1] - highChargeColor[2]).toBeGreaterThan(lowChargeColor[1] - lowChargeColor[2]);

    await page.mouse.move(5, 5);
    await page.evaluate(async () => (await import('/game.js')).gameLoop(performance.now()));
    await page.mouse.move(point.x, point.y);
    const fullCharge = await page.evaluate(async batteryCell => {
        const physics = await import('/physics.js');
        const battery = physics.getDefinitions().find(definition => definition?.name === 'Battery');
        return battery.chargeCapacity;
    }, batteryCell);
    await page.evaluate(async () => (await import('/game.js')).gameLoop(performance.now()));
    await page.clock.runFor(5000);
    await page.evaluate(async ({ batteryCell, charge }) => {
        const physics = await import('/physics.js');
        const game = await import('/game.js');
        physics.getWorld().charge[physics.index(batteryCell.x, batteryCell.y)] = charge;
        game.gameLoop(performance.now());
        game.renderWorld();
    }, { batteryCell, charge: fullCharge / 2 });
    const discharging = page.locator('#machineOverlay .battery-charge-trend');
    await expect(discharging).toHaveAttribute('data-state', 'discharging');
    await expect(discharging).toHaveText('−');
    const dischargeColor = await discharging.evaluate(element => getComputedStyle(element).fill || getComputedStyle(element).color);
    const dischargeRgb = (dischargeColor.match(/[\d.]+/g) || []).map(Number);
    expect(dischargeRgb[0]).toBeGreaterThan(dischargeRgb[1]);
    await expect(page.locator('#machineOverlay .electrical-z-bolt[data-cell-x="50"][data-cell-y="35"]'))
        .toHaveCount(0);
});

test('static machine artwork keeps its SVG node between rendered frames', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const lamp = { x: 50, y: 35 };
    const sameNodes = await page.evaluate(async lamp => {
        const physics = await import('/physics.js');
        const game = await import('/game.js');
        const id = physics.getDefinitions().find(definition => definition?.name === 'Lamp').id;
        physics.clearWorld();
        physics.setCell(lamp.x, lamp.y, id);
        game.renderWorld();
        const icon = document.querySelector(`#machineOverlay .machine-overlay-icon.machine-lamp[data-machine-x="${lamp.x}"][data-machine-y="${lamp.y}"]`);
        const artwork = icon?.querySelector('.machine-lamp-body, .machine-lamp-bulb, path, circle');
        game.renderWorld();
        const nextIcon = document.querySelector(`#machineOverlay .machine-overlay-icon.machine-lamp[data-machine-x="${lamp.x}"][data-machine-y="${lamp.y}"]`);
        const nextArtwork = nextIcon?.querySelector('.machine-lamp-body, .machine-lamp-bulb, path, circle');
        return { icon: icon?.isSameNode(nextIcon), artwork: artwork?.isSameNode(nextArtwork) };
    }, lamp);
    expect(sameNodes.icon, 'the renderer retains each static machine SVG').toBe(true);
    expect(sameNodes.artwork, 'the renderer retains static machine artwork children').toBe(true);
});
