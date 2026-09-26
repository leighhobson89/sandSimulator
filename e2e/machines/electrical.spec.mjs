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

test('Copper and Iron discharge a Battery and reach a Fan across the documented two-cell gap', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    for (const [material, expectedWireLoad] of [['Copper', 1], ['Iron', 0.5]]) {
        await game.seed(material === 'Copper' ? 303 : 404);
        await installElectricalFixture(page, {
            batteries: [[20, 35]],
            conductors: [[21, 35, material]],
            machine: [23, 35, 'Fan'],
            batteryCharge: 1
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
            return physics.isPowered(23, 35);
        });
        expect(visiblePower).toBe(true);

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

test('Simple Switch relays an input pulse while ON and blocks it while OFF', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    async function setSwitchPulse(enabled) {
        await page.evaluate(async enabled => {
            const physics = await import('/physics.js');
            const definitions = physics.getDefinitions();
            const id = name => definitions.findIndex(definition => definition?.name === name);
            const x = 45;
            const y = 35;
            physics.clearWorld();
            physics.setCell(x, y, id('Simple Switch'));
            const world = physics.getWorld();
            const machineIndex = physics.index(x, y);
            const ports = physics.getMachinePorts(x, y);
            const input = ports.find(port => port.role === 'input');
            const output = ports.find(port => port.role === 'output');
            physics.setCell(input.connectionCell.x, input.connectionCell.y, id('Elec'));
            physics.setCell(output.connectionCell.x, output.connectionCell.y, id('Elec'));
            world.power[physics.index(input.connectionCell.x, input.connectionCell.y)] = 7;
            world.machineSetting[machineIndex] = enabled ? 1 : 0;
        }, enabled);
        await game.step(1);
        return page.evaluate(async () => {
            const physics = await import('/physics.js');
            const ports = physics.getMachinePorts(45, 35);
            const input = ports.find(port => port.role === 'input').connectionCell;
            const output = ports.find(port => port.role === 'output').connectionCell;
            return {
                inputPowered: physics.isPowered(input.x, input.y),
                outputPowered: physics.isPowered(output.x, output.y),
                setting: physics.getMachineSetting(45, 35)
            };
        });
    }

    const on = await setSwitchPulse(true);
    expect(on.setting).toBe(1);
    expect(on.inputPowered).toBe(true);
    expect(on.outputPowered).toBe(true);

    const off = await setSwitchPulse(false);
    expect(off.setting).toBe(0);
    expect(off.inputPowered).toBe(true);
    expect(off.outputPowered).toBe(false);
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

test('Fan power state is false without a source and true only after a connected Battery pulse', async ({ page }) => {
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
        machine: [30, 35, 'Fan'],
        batteryCharge: 2
    });
    await game.step(1);
    const poweredImmediately = await electricalState(page, [{ x: 30, y: 35 }]);
    expect(poweredImmediately.cells[0].machinePowered).toBe(true);
    expect(poweredImmediately.cells[0].powered).toBe(true);
    expect(poweredImmediately.cells[0].powerDelay).toBe(0);
    expect(poweredImmediately.cells[0].power).toBe(7);

    await game.step(1);
    const powered = await electricalState(page, [{ x: 30, y: 35 }]);
    expect(powered.cells[0].machinePowered).toBe(true);
    expect(powered.cells[0].powered).toBe(true);
    expect(powered.cells[0].power).toBe(7);
});

test('a Copper lead outside the visible machine port rejects connection and invalid electrical queries stay inert', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await installElectricalFixture(page, {
        batteries: [[20, 35]],
        conductors: [[21, 35, 'Copper']],
        machine: [25, 35, 'Fan'],
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

    const before = await electricalState(page, [
        { x: 20, y: 35 },
        { x: 21, y: 35 },
        { x: 23, y: 35 }
    ]);
    expect(before.cells[0].charge).toBeGreaterThan(0);
    expect(before.cells[1].power).toBeGreaterThan(0);
    expect(before.cells[2].machinePowered).toBe(true);

    const after = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        physics.clearWorld();
        const world = physics.getWorld();
        return {
            typesEmpty: world.type.every(value => value === 0),
            chargesEmpty: world.charge.every(value => value === 0),
            powerEmpty: world.power.every(value => value === 0),
            delaysEmpty: world.powerDelay.every(value => value === 0),
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
    expect(after.battery).toBeNull();
    expect(after.charge).toBe(0);
    expect(after.powered).toBe(false);
    expect(after.machinePowered).toBe(false);
});
