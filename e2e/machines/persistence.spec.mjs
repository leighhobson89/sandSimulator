import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { canvasPoint, dragCanvasCells } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page);
});

async function seedMachineState(page) {
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const defs = physics.getDefinitions();
        const id = name => defs.findIndex(definition => definition?.name === name);
        const world = physics.getWorld();
        physics.clearWorld();
        physics.setCell(15, 20, id('Fan'));
        world.data[physics.index(15, 20)] = 4;
        world.machineSetting[physics.index(15, 20)] = 12;
        physics.setCell(25, 20, id('Powder Storage Bin'));
        world.storageType[physics.index(25, 20)] = id('Sand');
        world.storageCount[physics.index(25, 20)] = 7;
        physics.setCell(35, 20, id('Sprinkler'));
        world.data[physics.index(35, 20)] = 40;
        world.machineSetting[physics.index(35, 20)] = 0;
        world.storageType[physics.index(35, 20)] = id('Water');
        world.storageCount[physics.index(35, 20)] = 3;
        const sprinkler = physics.index(35, 20);
        physics.setSprinklerReleaseEnabled(35, 20, true);
        physics.setDrainModeEnabled(35, 20, false);
        for (const field of [
            'sprinklerSprayFlow9', 'sprinklerSprayFlow8', 'sprinklerSprayFlow7', 'sprinklerSprayFlow6',
            'sprinklerSprayFlow5', 'sprinklerSprayFlow4', 'sprinklerSprayFlow3'
        ]) world[field][sprinkler] = 0.375;
        physics.setCell(39, 32, id('Sand'));
        const launchedParticle = physics.index(39, 32);
        world.sprinklerLaunchDirection[launchedParticle] = 7;
        world.sprinklerLaunchAge[launchedParticle] = 5;
        physics.setCell(45, 20, id('Mixer'));
        const mixer = physics.index(45, 20);
        world.machineSetting[mixer] = 0;
        world.mixerInputTypeA[mixer] = id('Water');
        world.mixerInputCountA[mixer] = 6;
        world.mixerInputTypeB[mixer] = id('Dry Mud');
        world.mixerInputCountB[mixer] = 4;
        for (let x = 26; x < 35; x++) physics.setCell(x, 20, id('Tubing'));
        world.machinePortEndpointRemap[physics.index(26, 20)] = 120;
        world.machinePortEndpointRemap[physics.index(34, 20)] = 152;
        physics.setCell(55, 20, id('Collector'));
        const collector = physics.index(55, 20);
        world.data[collector] = 3;
        world.storageType[collector] = id('Fire');
        world.storageCount[collector] = 5;
        physics.setCell(65, 20, id('Simple Switch'));
        world.machineSetting[physics.index(65, 20)] = 0;
        physics.setCell(70, 20, id('Lamp'));
        world.machineSetting[physics.index(70, 20)] = 1;
    });
}

test('machine settings, inventories, tubing, and mixer inputs survive portable Save/Load', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await seedMachineState(page);
    await game.step(0);
    const before = await page.evaluate(() => window.__GAME_INSTANCE__.captureState());
    const sprinklerSprayFields = [
        'sprinklerSprayFlow9', 'sprinklerSprayFlow8', 'sprinklerSprayFlow7', 'sprinklerSprayFlow6',
        'sprinklerSprayFlow5', 'sprinklerSprayFlow4', 'sprinklerSprayFlow3'
    ];
    const launchFields = ['sprinklerLaunchDirection', 'sprinklerLaunchAge'];

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const saveString = await page.locator('#saveString').inputValue();
    expect(saveString.length).toBeGreaterThan(20);
    const currentSaveVersions = await page.evaluate(async encoded => {
        const payload = (await import('/saveLoadGame.js')).parseSaveString(encoded);
        return {
            format: payload.version,
            simulation: payload.simulation.sprinklerModeVersion,
            blueprints: payload.blueprints?.sprinklerModeVersion,
            simulationPortLayout: payload.simulation.machinePortLayoutVersion,
            blueprintPortLayout: payload.blueprints?.machinePortLayoutVersion
        };
    }, saveString);
    expect(currentSaveVersions).toEqual({
        format: 2, simulation: 2, blueprints: 2,
        simulationPortLayout: 2, blueprintPortLayout: 2
    });
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        physics.clearWorld();
    });
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.locator('#saveString').fill(saveString);
    await page.getByRole('button', { name: 'Load Game', exact: true }).click();
    await expect(page.locator('#autosaveChoiceDialog')).toBeVisible();
    await page.getByRole('button', { name: 'Yes, replace it', exact: true }).click();
    const after = await page.evaluate(() => window.__GAME_INSTANCE__.captureState());
    const particleIds = await page.evaluate(async () => {
        const definitions = (await import('/physics.js')).getDefinitions();
        return Object.fromEntries(['Collector', 'Fire'].map(name => [
            name, definitions.findIndex(definition => definition?.name === name)
        ]));
    });

    for (const field of [
        'type', 'data', 'machineSetting', 'storageType', 'storageCount',
        'machinePortEndpointRemap', 'machinePortEndpointSlot',
        'mixerInputTypeA', 'mixerInputCountA', 'mixerInputTypeB', 'mixerInputCountB',
        ...sprinklerSprayFields, ...launchFields
    ]) {
        expect(after.arrays[field], field).toEqual(before.arrays[field]);
    }
    const sprinklerIndex = 35 + 20 * after.cols;
    expect(after.arrays.machineSetting[sprinklerIndex] & 1).toBe(1);
    expect(after.arrays.machineSetting[sprinklerIndex] & 2).toBe(0);
    expect(sprinklerSprayFields.every(field => after.arrays[field][sprinklerIndex] === 0.375)).toBe(true);
    const collectorIndex = 55 + 20 * after.cols;
    expect(after.arrays.type[collectorIndex]).toBe(particleIds.Collector);
    expect(after.arrays.data[collectorIndex] & 7).toBe(3);
    expect(after.arrays.storageType[collectorIndex]).toBe(
        particleIds.Fire);
    expect(after.arrays.storageCount[collectorIndex]).toBe(5);
    const launchedIndex = 39 + 32 * after.cols;
    expect(after.arrays.sprinklerLaunchDirection[launchedIndex]).toBe(7);
    expect(after.arrays.sprinklerLaunchAge[launchedIndex]).toBe(5);
    await expect(page.locator('#canvas')).toBeVisible();
    await expect(game.state()).resolves.toMatchObject({ cols: before.cols, rows: before.rows });

    const copiedLaunchState = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const game = await import('/game.js');
        const source = physics.index(39, 32);
        const blueprint = game.captureBlueprint(39, 32, 39, 32);
        game.stampBlueprintAt(blueprint, 44, 32);
        const stamped = physics.index(44, 32);
        const blueprintState = {
            direction: physics.getWorld().sprinklerLaunchDirection[stamped],
            age: physics.getWorld().sprinklerLaunchAge[stamped]
        };
        const grabbed = game.beginGrab(44, 32, 1);
        const dropped = game.dropGrab(48, 32);
        const droppedIndex = physics.index(48, 32);
        const electricalBlueprint = game.captureBlueprint(65, 20, 70, 20);
        game.stampBlueprintAt(electricalBlueprint, 65, 30);
        const stampedSwitch = physics.getMachineSetting(65, 30);
        const stampedLamp = physics.getMachineSetting(70, 30);
        return {
            sourceDirection: physics.getWorld().sprinklerLaunchDirection[source],
            sourceAge: physics.getWorld().sprinklerLaunchAge[source],
            stamped: blueprintState,
            grabbed,
            dropped,
            droppedDirection: physics.getWorld().sprinklerLaunchDirection[droppedIndex],
            droppedAge: physics.getWorld().sprinklerLaunchAge[droppedIndex],
            electricalBlueprint: { switch: stampedSwitch, lamp: stampedLamp }
        };
    });
    expect(copiedLaunchState).toEqual({
        sourceDirection: 7,
        sourceAge: 5,
        stamped: { direction: 7, age: 5 },
        grabbed: 1,
        dropped: 1,
        droppedDirection: 7,
        droppedAge: 5,
        electricalBlueprint: { switch: 0, lamp: 1 }
    });

    const legacySprinklerSave = await page.evaluate(async ({ encoded, sprinklerIndex, sprayFields, launchFields }) => {
        const save = await import('/saveLoadGame.js');
        const codec = await import('/lzString.js');
        const payload = save.parseSaveString(encoded);
        const wireArray = payload.simulation.arrays.machineSetting;
        const binary = atob(wireArray.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        new Float32Array(bytes.buffer)[sprinklerIndex] = 1; // v1 Release on, old Sprinkler off.
        let output = '';
        for (let start = 0; start < bytes.length; start += 0x8000) {
            output += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
        }
        wireArray.data = btoa(output);
        payload.version = 1;
        delete payload.simulation.sprinklerModeVersion;
        delete payload.simulation.machinePortLayoutVersion;
        delete payload.simulation.fanWindScale;
        delete payload.simulation.arrays.machinePortEndpointRemap;
        delete payload.simulation.arrays.machinePortEndpointSlot;
        delete payload.blueprints?.sprinklerModeVersion;
        delete payload.blueprints?.machinePortLayoutVersion;
        delete payload.blueprints?.fanWindScale;
        for (const field of sprayFields) {
            const legacyField = field.replace('sprinklerSprayFlow', 'ventSprayFlow');
            payload.simulation.arrays[legacyField] = payload.simulation.arrays[field];
            delete payload.simulation.arrays[field];
        }
        for (const field of launchFields) delete payload.simulation.arrays[field];
        for (const [field, Type] of [
            ['storageType', Uint8Array],
            ['storageCount', Uint16Array]
        ]) {
            const wireArray = payload.simulation.arrays[field];
            const binary = atob(wireArray.data);
            const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
            new Type(bytes.buffer)[sprinklerIndex] = 0;
            let output = '';
            for (let start = 0; start < bytes.length; start += 0x8000) {
                output += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
            }
            wireArray.data = btoa(output);
        }
        return codec.compressToEncodedURIComponent(JSON.stringify(payload));
    }, { encoded: saveString, sprinklerIndex, sprayFields: sprinklerSprayFields, launchFields });

    await page.evaluate(async () => (await import('/physics.js')).clearWorld());
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.locator('#saveString').fill(legacySprinklerSave);
    await page.getByRole('button', { name: 'Load Game', exact: true }).click();
    if (await page.locator('#autosaveChoiceDialog').isVisible()) {
        await page.getByRole('button', { name: 'Yes, replace it', exact: true }).click();
    }
    const legacySprinklerState = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const sprinkler = physics.index(35, 20);
        const source = physics.index(25, 20);
        physics.stepSimulation();
        const flows = physics.getTubingFlows();
        const describePorts = (x, y) => physics.getMachinePorts(x, y).map(port => ({
            id: port.id,
            role: port.role,
            family: port.family,
            connectionCell: port.connectionCell,
            connected: port.connected
        }));
        return {
            releaseEnabled: physics.isSprinklerReleaseEnabled(35, 20),
            drainModeEnabled: physics.isDrainModeEnabled(35, 20),
            inventory: physics.getSprinklerInventory(35, 20),
            credits: [
                'sprinklerSprayFlow9', 'sprinklerSprayFlow8', 'sprinklerSprayFlow7', 'sprinklerSprayFlow6',
                'sprinklerSprayFlow5', 'sprinklerSprayFlow4', 'sprinklerSprayFlow3'
            ].map(field => world[field][sprinkler]),
            launchState: [world.sprinklerLaunchDirection[39 + 32 * world.cols],
                world.sprinklerLaunchAge[39 + 32 * world.cols]],
            machineId: physics.getDefinitions()[world.type[sprinkler]]?.name === 'Sprinkler'
                ? world.type[sprinkler] : null,
            machineSetting: world.machineSetting[sprinkler],
            migratedTubeEndpoints: [world.machinePortEndpointRemap[20 * world.cols + 26],
                world.machinePortEndpointRemap[20 * world.cols + 34]],
            tubeCellsPreserved: [26, 34].every(x =>
                world.type[20 * world.cols + x] === physics.getDefinitions().findIndex(def => def?.name === 'Tubing')),
            storageToSprinklerRoute: flows.some(flow => flow.source === source &&
                flow.destination === sprinkler && flow.material === physics.getDefinitions().findIndex(def => def?.name === 'Sand')),
            ports: { source: describePorts(25, 20), destination: describePorts(35, 20) },
            sourceInventory: physics.getStorageInventory(25, 20),
            destinationInventory: physics.getSprinklerInventory(35, 20),
            tubing: Array.from({ length: 9 }, (_, offset) => {
                const cell = physics.index(26 + offset, 20);
                return {
                    x: 26 + offset,
                    y: 20,
                    type: world.type[cell],
                    endpointRemap: world.machinePortEndpointRemap[cell],
                    endpointSlot: world.machinePortEndpointSlot[cell]
                };
            }),
            flows: flows.map(flow => ({
                source: flow.source,
                destination: flow.destination,
                material: flow.material,
                rate: flow.rate,
                path: flow.path
            }))
        };
    });
    expect(legacySprinklerState.releaseEnabled).toBe(true);
    expect(legacySprinklerState.drainModeEnabled).toBe(true);
    expect(legacySprinklerState.inventory).toMatchObject({ type: 0, count: 0, releaseRate: 40 });
    expect(legacySprinklerState.credits).toEqual([0.375, 0.375, 0.375, 0.375, 0.375, 0.375, 0.375]);
    expect(legacySprinklerState.launchState).toEqual([0, 0]);
    expect(legacySprinklerState.machineId).toBe(52);
    expect(legacySprinklerState.machineSetting).toBe(3);
    expect(legacySprinklerState.migratedTubeEndpoints.every(value => value > 0)).toBe(true);
    expect(legacySprinklerState.tubeCellsPreserved).toBe(true);
    expect(legacySprinklerState.storageToSprinklerRoute,
        `a v1 save retains the old Storage-to-Sprinkler Tubing connection: ${JSON.stringify(legacySprinklerState, null, 2)}`).toBe(true);
});

test('v1 saves migrate Drain Mode and legacy Sprinkler credits in worlds and blueprints', async ({ page }) => {
    test.setTimeout(60_000);
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        physics.clearWorld();
        const world = physics.getWorld();
        physics.setCell(14, 20, id('Fan'));
        world.machineSetting[physics.index(14, 20)] = 7;
        physics.setCell(15, 20, id('Sprinkler'));
        world.machineSetting[physics.index(15, 20)] = 2; // v1 release-off, Sprinkler-on.
        world.sprinklerSprayFlow9[physics.index(15, 20)] = 0.625;
        physics.setCell(16, 20, id('Sand'));
        world.sprinklerLaunchDirection[physics.index(16, 20)] = 7;
        world.sprinklerLaunchAge[physics.index(16, 20)] = 5;
        for (const [x, value] of [[20, 0], [30, 1], [40, 2], [50, 3]]) {
            physics.setCell(x, 20, id('Sprinkler'));
            world.machineSetting[physics.index(x, 20)] = value;
        }
        physics.setCell(60, 20, id('Collector'));
        world.data[physics.index(60, 20)] = 3;
        world.storageType[physics.index(60, 20)] = id('Fire');
        world.storageCount[physics.index(60, 20)] = 5;
    });

    await page.getByRole('tab', { name: 'Blueprints' }).click();
    await page.getByRole('button', { name: /Marquee/ }).click();
    await dragCanvasCells(page, { x: 15, y: 20 }, { x: 16, y: 20 });
    await page.getByRole('button', { name: 'Copy selection' }).click();
    await page.getByRole('tab', { name: 'Tools' }).click();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#saveString')).toBeVisible();
    await expect(page.locator('#saveString')).not.toHaveValue('');
    const currentSave = await page.locator('#saveString').inputValue();
    const legacySave = await page.evaluate(async encoded => {
        const save = await import('/saveLoadGame.js');
        const codec = await import('/lzString.js');
        const payload = save.parseSaveString(encoded);
        const setFloat = (wireArray, offset, value) => {
            const binary = atob(wireArray.data);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
            new Float32Array(bytes.buffer)[offset] = value;
            let output = '';
            for (let start = 0; start < bytes.length; start += 0x8000) {
                output += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
            }
            wireArray.data = btoa(output);
        };

        payload.version = 1;
        const cols = payload.simulation.cols;
        for (const [x, value] of [[20, 0], [30, 1], [40, 2], [50, 3]]) {
            setFloat(payload.simulation.arrays.machineSetting, 20 * cols + x, value);
        }
        setFloat(payload.simulation.arrays.machineSetting, 20 * cols + 15, 2);
        setFloat(payload.blueprints.slots[0].cells.machineSetting, 0, 2);

        const sprayFields = [
            'sprinklerSprayFlow9', 'sprinklerSprayFlow8', 'sprinklerSprayFlow7',
            'sprinklerSprayFlow6', 'sprinklerSprayFlow5', 'sprinklerSprayFlow4',
            'sprinklerSprayFlow3'
        ];
        const launchFields = ['sprinklerLaunchDirection', 'sprinklerLaunchAge'];
        for (const field of sprayFields) {
            const oldName = field.replace('sprinklerSprayFlow', 'ventSprayFlow');
            payload.simulation.arrays[oldName] = payload.simulation.arrays[field];
            delete payload.simulation.arrays[field];
            payload.blueprints.slots[0].cells[oldName] =
                payload.blueprints.slots[0].cells[field];
            delete payload.blueprints.slots[0].cells[field];
        }
        for (const field of launchFields) {
            delete payload.simulation.arrays[field];
            delete payload.blueprints.slots[0].cells[field];
        }
        delete payload.simulation.fanWindScale;
        delete payload.blueprints.fanWindScale;
        delete payload.simulation.sprinklerModeVersion;
        delete payload.blueprints.sprinklerModeVersion;
        return codec.compressToEncodedURIComponent(JSON.stringify(payload));
    }, currentSave);
    await page.locator('#closeSaveDialog').click();

    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.locator('#saveString').fill(legacySave);
    await page.getByRole('button', { name: 'Load Game', exact: true }).click();
    if (await page.locator('#autosaveChoiceDialog').isVisible()) {
        await page.getByRole('button', { name: 'Yes, replace it', exact: true }).click();
    }

    let state = await page.evaluate(() => window.__GAME_INSTANCE__.captureState());
    const sprinklerId = 52;
    expect(sprinklerId, 'Sprinkler retains particle ID 52').toBe(52);
    expect(state.arrays.type[20 * state.cols + 15]).toBe(sprinklerId);
    expect(state.arrays.machineSetting[20 * state.cols + 14]).toBe(23);
    expect([20, 30, 40, 50].map(x => state.arrays.machineSetting[20 * state.cols + x]))
        .toEqual([2, 3, 0, 1]);
    const migratedModes = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        return [20, 30, 40, 50].map(x => ({
            release: physics.isSprinklerReleaseEnabled(x, 20),
            drain: physics.isDrainModeEnabled(x, 20)
        }));
    });
    expect(migratedModes).toEqual([
        { release: false, drain: true },
        { release: true, drain: true },
        { release: false, drain: false },
        { release: true, drain: false }
    ]);
    expect(state.arrays.sprinklerSprayFlow9[20 * state.cols + 15]).toBe(0.625);
    expect(state.arrays.sprinklerLaunchDirection[20 * state.cols + 16]).toBe(0);
    expect(state.arrays.sprinklerLaunchAge[20 * state.cols + 16]).toBe(0);
    const legacyCollector = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        return {
            machineId: physics.getDefinitions().findIndex(definition => definition?.name === 'Collector'),
            fireId: physics.getDefinitions().findIndex(definition => definition?.name === 'Fire')
        };
    });
    const legacyCollectorIndex = 60 + 20 * state.cols;
    expect(state.arrays.type[legacyCollectorIndex]).toBe(legacyCollector.machineId);
    expect(state.arrays.data[legacyCollectorIndex] & 7).toBe(3);
    expect(state.arrays.storageType[legacyCollectorIndex]).toBe(legacyCollector.fireId);
    expect(state.arrays.storageCount[legacyCollectorIndex]).toBe(5);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const migratedSave = await page.locator('#saveString').inputValue();
    const migratedWire = await page.evaluate(async encoded => {
        const save = await import('/saveLoadGame.js');
        const payload = save.parseSaveString(encoded);
        const readFloat = (wireArray, offset) => {
            const binary = atob(wireArray.data);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
            return new Float32Array(bytes.buffer)[offset];
        };
        return {
            formatVersion: payload.version,
            simulationModeVersion: payload.simulation.sprinklerModeVersion,
            simulationMarker: payload.simulation.fanWindScale,
            worldFanSpeed: readFloat(payload.simulation.arrays.machineSetting, 20 * payload.simulation.cols + 14),
            blueprintModeVersion: payload.blueprints.sprinklerModeVersion,
            blueprintMarker: payload.blueprints.fanWindScale,
            blueprintMachineSetting: readFloat(payload.blueprints.slots[0].cells.machineSetting, 0),
            worldSprinklerCredit: readFloat(payload.simulation.arrays.sprinklerSprayFlow9,
                20 * payload.simulation.cols + 15),
            blueprintSprinklerCredit: readFloat(payload.blueprints.slots[0].cells.sprinklerSprayFlow9, 0),
            blueprintLaunchState: [
                payload.blueprints.slots[0].cells.sprinklerLaunchDirection.data,
                payload.blueprints.slots[0].cells.sprinklerLaunchAge.data
            ]
        };
    }, migratedSave);
    expect(migratedWire).toEqual({
        formatVersion: 2,
        simulationModeVersion: 2,
        simulationMarker: 50,
        worldFanSpeed: 23,
        blueprintModeVersion: 2,
        blueprintMarker: 50,
        blueprintMachineSetting: 0,
        worldSprinklerCredit: 0.625,
        blueprintSprinklerCredit: 0.625,
        blueprintLaunchState: ['AAA=', 'AAA=']
    });
    await page.locator('#closeSaveDialog').click();

    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.locator('#saveString').fill(migratedSave);
    await page.getByRole('button', { name: 'Load Game', exact: true }).click();
    if (await page.locator('#autosaveChoiceDialog').isVisible()) {
        await page.getByRole('button', { name: 'Yes, replace it', exact: true }).click();
    }
    state = await page.evaluate(() => window.__GAME_INSTANCE__.captureState());
    expect(state.arrays.machineSetting[20 * state.cols + 14]).toBe(23);

    await page.getByRole('tab', { name: 'Blueprints' }).click();
    await page.getByRole('button', { name: 'Blueprint 1', exact: true }).click();
    await page.mouse.click(...Object.values(await canvasPoint(page, { x: 25, y: 20 })));
    state = await page.evaluate(() => window.__GAME_INSTANCE__.captureState());
    expect(state.arrays.type[20 * state.cols + 25]).toBe(sprinklerId);
    expect(state.arrays.machineSetting[20 * state.cols + 25]).toBe(0);
    expect(state.arrays.sprinklerSprayFlow9[20 * state.cols + 25]).toBe(0.625);
    expect(state.arrays.sprinklerLaunchDirection[20 * state.cols + 26]).toBe(0);
});

test('legacy Tubing endpoints migrate in portable worlds and blueprint stamps', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const id = name => physics.getDefinitions().findIndex(definition => definition?.name === name);
        physics.clearWorld();
        const world = physics.getWorld();
        physics.setCell(25, 25, id('Powder Storage Bin'));
        physics.setCell(35, 25, id('Sprinkler'));
        world.storageType[physics.index(25, 25)] = id('Ash');
        world.storageCount[physics.index(25, 25)] = 50;
        for (let x = 26; x < 35; x++) physics.setCell(x, 25, id('Tubing'));
    });
    await game.step(0);
    await page.getByRole('tab', { name: 'Blueprints' }).click();
    await page.getByRole('button', { name: /Marquee/ }).click();
    await dragCanvasCells(page, { x: 25, y: 25 }, { x: 35, y: 25 });
    await page.getByRole('button', { name: 'Copy selection' }).click();
    await page.getByRole('tab', { name: 'Tools' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const currentSave = await page.locator('#saveString').inputValue();
    const legacySave = await page.evaluate(async encoded => {
        const save = await import('/saveLoadGame.js');
        const codec = await import('/lzString.js');
        const payload = save.parseSaveString(encoded);
        payload.version = 1;
        delete payload.simulation.machinePortLayoutVersion;
        delete payload.simulation.arrays.machinePortEndpointRemap;
        delete payload.simulation.arrays.machinePortEndpointSlot;
        delete payload.blueprints.machinePortLayoutVersion;
        delete payload.blueprints.slots[0].machinePortLayoutVersion;
        delete payload.blueprints.slots[0].cells.machinePortEndpointRemap;
        delete payload.blueprints.slots[0].cells.machinePortEndpointSlot;
        return codec.compressToEncodedURIComponent(JSON.stringify(payload));
    }, currentSave);
    await page.locator('#closeSaveDialog').click();
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.locator('#saveString').fill(legacySave);
    await page.getByRole('button', { name: 'Load Game', exact: true }).click();
    if (await page.locator('#autosaveChoiceDialog').isVisible()) {
        await page.getByRole('button', { name: 'Yes, replace it', exact: true }).click();
    }

    const worldMigration = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const source = physics.index(25, 25);
        const destination = physics.index(35, 25);
        const tubing = physics.getDefinitions().findIndex(definition => definition?.name === 'Tubing');
        const ash = physics.getDefinitions().findIndex(definition => definition?.name === 'Ash');
        physics.stepSimulation();
        const flows = physics.getTubingFlows();
        const describePorts = (x, y) => physics.getMachinePorts(x, y).map(port => ({
            id: port.id,
            role: port.role,
            material: port.material,
            connectionCell: port.connectionCell,
            connected: port.connected
        }));
        return {
            endpoints: [world.machinePortEndpointRemap[physics.index(26, 25)],
                world.machinePortEndpointRemap[physics.index(34, 25)]],
            slots: [world.machinePortEndpointSlot[physics.index(26, 25)],
                world.machinePortEndpointSlot[physics.index(34, 25)]],
            linePreserved: Array.from({ length: 9 }, (_, offset) =>
                world.type[physics.index(26 + offset, 25)]).every(type => type === tubing),
            route: flows.some(flow =>
                flow.source === source && flow.destination === destination && flow.material === ash),
            ports: { source: describePorts(25, 25), destination: describePorts(35, 25) },
            inventories: {
                source: physics.getStorageInventory(25, 25),
                destination: physics.getSprinklerInventory(35, 25)
            },
            flows: flows.map(flow => ({
                source: flow.source,
                destination: flow.destination,
                material: flow.material,
                rate: flow.rate,
                path: flow.path
            })),
            tubingCells: Array.from({ length: 9 }, (_, offset) => {
                const cell = physics.index(26 + offset, 25);
                return {
                    x: 26 + offset,
                    y: 25,
                    type: world.type[cell],
                    endpointRemap: world.machinePortEndpointRemap[cell],
                    endpointSlot: world.machinePortEndpointSlot[cell]
                };
            })
        };
    });
    expect(worldMigration.endpoints.every(value => value > 0)).toBe(true);
    expect(worldMigration.slots).toEqual([255, 1]);
    expect(worldMigration.linePreserved).toBe(true);
    expect(worldMigration.route,
        `legacy world endpoints keep a real Tubing route: ${JSON.stringify(worldMigration, null, 2)}`).toBe(true);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const migratedSave = await page.locator('#saveString').inputValue();
    const migratedBlueprint = await page.evaluate(async encoded => {
        const save = await import('/saveLoadGame.js');
        const payload = save.parseSaveString(encoded);
        const array = payload.blueprints.slots[0].cells.machinePortEndpointRemap;
        const binary = atob(array.data);
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        const slotArray = payload.blueprints.slots[0].cells.machinePortEndpointSlot;
        const slotBinary = atob(slotArray.data);
        const slotBytes = Uint8Array.from(slotBinary, character => character.charCodeAt(0));
        return {
            worldLayout: payload.simulation.machinePortLayoutVersion,
            blueprintLayout: payload.blueprints.machinePortLayoutVersion,
            slotLayout: payload.blueprints.slots[0].machinePortLayoutVersion,
            markerBytes: [bytes[1], bytes[9]],
            slotBytes: [slotBytes[1], slotBytes[9]]
        };
    }, migratedSave);
    expect(migratedBlueprint.worldLayout).toBe(2);
    expect(migratedBlueprint.blueprintLayout).toBe(2);
    expect(migratedBlueprint.slotLayout).toBe(2);
    expect(migratedBlueprint.markerBytes.every(value => value > 0),
        'legacy endpoint links are encoded into the migrated blueprint remap plane').toBe(true);
    expect(migratedBlueprint.slotBytes).toEqual([255, 1]);
    await page.locator('#closeSaveDialog').click();

    await page.getByRole('tab', { name: 'Blueprints' }).click();
    await page.getByRole('button', { name: 'Blueprint 1', exact: true }).click();
    await page.mouse.click(...Object.values(await canvasPoint(page, { x: 60, y: 25 })));
    const stampedRoute = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const source = physics.index(55, 25);
        const destination = physics.index(65, 25);
        const tubing = physics.getDefinitions().findIndex(definition => definition?.name === 'Tubing');
        const ash = physics.getDefinitions().findIndex(definition => definition?.name === 'Ash');
        physics.stepSimulation();
        return {
            machines: [world.type[source], world.type[destination]],
            linePreserved: Array.from({ length: 9 }, (_, offset) =>
                world.type[physics.index(56 + offset, 25)]).every(type => type === tubing),
            remapped: [world.machinePortEndpointRemap[physics.index(56, 25)],
                world.machinePortEndpointRemap[physics.index(64, 25)]],
            route: physics.getTubingFlows().some(flow =>
                flow.source === source && flow.destination === destination && flow.material === ash)
        };
    });
    const state = await game.state();
    expect(stampedRoute.machines).toEqual([
        state.definitions.find(definition => definition?.name === 'Powder Storage Bin').id,
        state.definitions.find(definition => definition?.name === 'Sprinkler').id
    ]);
    expect(stampedRoute.linePreserved).toBe(true);
    expect(stampedRoute.remapped.every(value => value > 0)).toBe(true);
    expect(stampedRoute.route, 'a migrated blueprint stamp keeps its Storage-to-Sprinkler route').toBe(true);
});
