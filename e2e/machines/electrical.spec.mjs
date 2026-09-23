import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
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

test('a three-cell gap rejects the machine connection and invalid electrical queries stay inert', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await installElectricalFixture(page, {
        batteries: [[20, 35]],
        conductors: [[21, 35, 'Copper']],
        machine: [24, 35, 'Fan'],
        batteryCharge: 2
    });

    await game.step(1);
    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        return {
            farMachine: physics.isMachinePoweredAt(24, 35),
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
