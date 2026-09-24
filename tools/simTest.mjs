// tools/simTest.mjs
// -----------------------------------------------------------------------------
// Headless checks for the simulation. physics.js does not touch the DOM, so the
// whole thing can be run from the command line:
//
//     node tools/simTest.mjs
//
// Each check sets up a small world, runs it for a number of frames, and reports
// what happened. Handy for tuning particles.json without reloading a browser.
// -----------------------------------------------------------------------------

import { readFileSync } from 'fs';
import {
    prepareDefinitions, createWorld, getWorld, clearWorld, stepSimulation,
    setCell, index, getDefinitions, setAmbientTarget, getAmbientTemp,
    setLayerLapse, getLayerLapse, getAirTempAt, setAirLayersOn,
    captureSimulationState, restoreSimulationState,
    applyWind, getWindTrails, decayWindTrails,
    setAmbientWindOn, isBreezeBlowing, isPowered, getStoredCharge,
    getConnectedBatteryCharge, getStorageInventory, getVentInventory, getVentReleaseRate,
    getVentTubingRate,
    getTubingFlows, setVentReleaseEnabled, setVentReleaseRate, setRandomSeed,
    getMixerInventory, setMixerReleaseEnabled, purgeMixerBin,
    getRandomSeed, EMPTY
} from '../physics.js';
import * as physics from '../physics.js';

const json = JSON.parse(readFileSync(new URL('../particles.json', import.meta.url), 'utf8'));
const defs = prepareDefinitions(json);

const ID = {};
defs.forEach((d, i) => { if (d && i > 0) ID[d.name] = i; });
// ID 19 remains stable so old saves containing generic Seeds load as Grass Seeds.

const COLS = 60;
const ROWS = 45;
const seedArgument = process.argv.find(argument => argument.startsWith('--seed='));
const requestedSeed = seedArgument?.slice('--seed='.length) ?? process.env.SIM_TEST_SEED ?? '0';
const TEST_SEED = Number(requestedSeed);
if (!Number.isInteger(TEST_SEED) || TEST_SEED < 0 || TEST_SEED > 0xFFFFFFFF) {
    throw new Error(`Invalid simulation test seed: ${requestedSeed}`);
}

setRandomSeed(TEST_SEED);
createWorld(COLS, ROWS);
console.log(`Simulation test seed: ${getRandomSeed()}`);

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
    if (condition) {
        passed++;
        console.log(`  PASS  ${label}`);
    } else {
        failed++;
        console.log(`  FAIL  ${label}${detail ? '  ->  ' + detail : ''}  [seed: ${getRandomSeed()}]`);
    }
}

function run(frames) {
    for (let f = 0; f < frames; f++) stepSimulation();
}

function typeAt(x, y) { return getWorld().type[index(x, y)]; }
function tempAt(x, y) { return getWorld().temp[index(x, y)]; }

function countOf(id) {
    const type = getWorld().type;
    let n = 0;
    for (let i = 0; i < type.length; i++) if (type[i] === id) n++;
    return n;
}

function fillRect(x0, y0, w, h, id) {
    for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) setCell(x, y, id);
    }
}

// The height of the highest filled cell in a column, or -1 when it is empty.
function surfaceOf(x, id) {
    for (let y = 0; y < ROWS; y++) if (typeAt(x, y) === id) return y;
    return -1;
}

function section(name) {
    console.log(`\n${name}`);
    clearWorld();
}

function resetThermalContractFixture(ambient = 20) {
    physics.resetRandomSource();
    setRandomSeed(0);
    createWorld(COLS, ROWS);
    const state = captureSimulationState();
    state.ambient = ambient;
    state.ambientTarget = ambient;
    state.layerLapse = 0;
    state.airLayersOn = false;
    state.ambientWindOn = false;
    state.ambientHumidity = 50;
    state.dewpointTarget = 10;
    state.arrays.temp.fill(ambient);
    state.arrays.humidity.fill(50);
    restoreSimulationState(state);
    physics.setAmbientTarget(ambient);
    physics.setAmbientHumidityTarget(50);
    physics.setDewpointTarget(10);
    getWorld().temp.fill(ambient);
    getWorld().tempNext.fill(ambient);
}

function snapshotSimulationState() {
    const state = captureSimulationState();
    const arrays = {};
    for (const [field, values] of Object.entries(state.arrays)) arrays[field] = values.slice();
    return { ...state, arrays };
}

function restoreSimulationCheckpoint(state, seed) {
    restoreSimulationState(state);
    physics.resetRandomSource();
    if (seed !== null) setRandomSeed(seed);
}

function setExactAirConditions(temperature) {
    const state = captureSimulationState();
    state.ambient = temperature;
    state.ambientTarget = temperature;
    state.layerLapse = 0;
    state.airLayersOn = false;
    state.ambientWindOn = false;
    state.arrays.temp.fill(temperature);
    restoreSimulationState(state);
    getWorld().temp.fill(temperature);
    getWorld().tempNext.fill(temperature);
}

function runCorrosionSourceConversionRegression() {
    console.log('\nSaturated exposure converts its source metal into falling Corrosion');
    const corrosionId = ID.Corrosion;
    const sourceX = 4;
    const sourceY = 5;

    createWorld(9, 8);
    physics.setAmbientTarget(25);
    physics.setAmbientHumidityTarget(100);
    physics.setDewpointTarget(10);
    for (let x = 3; x <= 5; x++) setCell(x, 6, ID.Wall);
    setCell(sourceX, sourceY, ID.Iron);
    getWorld().temp.fill(25);
    getWorld().tempNext.fill(25);
    getWorld().humidity.fill(100);
    physics.setRandomSource(() => 0);

    let sourceConverted = false;
    for (let frame = 0; frame < 1600; frame++) {
        run(1);
        if (typeAt(sourceX, sourceY) === corrosionId) {
            sourceConverted = true;
            break;
        }
    }
    check('saturated exposure converts the source metal pixel into Corrosion', sourceConverted,
        `${defs[typeAt(sourceX, sourceY)]?.name || 'air'} remains at source after saturated exposure`);

    if (sourceConverted) {
        setCell(sourceX, sourceY + 1, EMPTY);
        run(4);
        let fallenRow = -1;
        for (let y = sourceY + 1; y < 8; y++) {
            if (typeAt(sourceX, y) === corrosionId) fallenRow = y;
        }
        check('newly converted unsupported Corrosion falls from the source', fallenRow > sourceY,
            `Corrosion row=${fallenRow}`);
    } else {
        check('newly converted unsupported Corrosion falls from the source', false,
            'the source metal never converted into Corrosion');
    }

    physics.resetRandomSource();
    setRandomSeed(TEST_SEED);
    physics.setAmbientTarget(20);
    physics.setAmbientHumidityTarget(50);
    physics.setDewpointTarget(10);
}

function runThermalNetworkBridgeContract() {
    console.log('\nMetal thermal network bridge and Insulation isolation contract');
    const baseline = 20;
    const roomA = { left: 10, right: 16, top: 16, bottom: 24 };
    const roomB = { left: 22, right: 28, top: 16, bottom: 24 };

    function buildBridgeFixture(bridgeId) {
        resetThermalContractFixture(baseline);
        for (const room of [roomA, roomB]) {
            for (let x = room.left; x <= room.right; x++) {
                setCell(x, room.top, ID.Wall);
                setCell(x, room.bottom, ID.Wall);
            }
            for (let y = room.top + 1; y < room.bottom; y++) {
                setCell(room.left, y, ID.Wall);
                setCell(room.right, y, ID.Wall);
            }
        }
        const path = [];
        for (let x = roomA.right; x <= roomB.left; x++) {
            setCell(x, 20, bridgeId);
            path.push(index(x, 20));
        }
        setCell(19, 21, ID.Wall); // Ordinary solid touches, but is not part of, the bridge.
        const world = getWorld();
        for (let y = roomA.top + 1; y < roomA.bottom; y++) {
            for (let x = roomA.left + 1; x < roomA.right; x++) world.temp[index(x, y)] = 600;
            for (let x = roomB.left + 1; x < roomB.right; x++) world.temp[index(x, y)] = baseline;
        }
        for (const i of path) world.temp[i] = baseline;
        world.temp[index(19, 21)] = baseline;
        return { path, world };
    }

    function bridgeSample(bridgeId, frames = 4) {
        const { path, world } = buildBridgeFixture(bridgeId);
        run(frames);
        return {
            pathMean: path.reduce((sum, i) => sum + world.temp[i], 0) / path.length,
            receiverAir: tempAt(23, 20),
            chamberInterior: tempAt(25, 20),
            exteriorAir: tempAt(19, 14),
            adjacentWall: tempAt(19, 21)
        };
    }

    const insulation = defs[ID.Insulation];
    const copper = defs[ID.Copper];
    const battery = defs[ID.Battery];
    const iron = defs[ID.Iron];
    const wood = defs[ID.Wood];
    const stone = defs[ID.Stone];
    const wall = defs[ID.Wall];
    const tubing = defs[ID.Tubing];
    const moltenCopper = defs[ID['Molten Copper']];
    const moltenAluminum = defs[ID['Molten Aluminum']];
    const moltenIron = defs[ID['Molten Iron']];
    const fan = defs[ID.Fan];
    const heater = defs[ID.Heater];
    const cooler = defs[ID.Cooler];
    const fastConductorMaterials = [copper, moltenCopper, battery, moltenAluminum, iron, moltenIron, tubing, fan, heater, cooler];
    const excludedMaterials = [insulation, wood, stone, wall];
    const rates = definition => Number(definition?.thermalNetworkRate) || 0;

    check('metal conductor materials opt into the fast thermal network',
        fastConductorMaterials.every(definition => rates(definition) > 0),
        fastConductorMaterials.map(definition => `${definition?.name}: ${definition?.thermalNetworkRate ?? 'missing'}`).join(', '));
    check('Copper carries heat faster than Battery, which carries heat faster than Iron',
        rates(copper) > rates(battery) && rates(battery) > rates(iron),
        `Copper ${rates(copper)}, Battery ${rates(battery)}, Iron ${rates(iron)}`);
    check('Insulation, Wood, Stone, and Wall stay outside the fast network',
        excludedMaterials.every(definition => rates(definition) === 0),
        excludedMaterials.map(definition => `${definition?.name}: ${definition?.thermalNetworkRate ?? 'missing'}`).join(', '));
    check('Wood, Stone, and Wall retain slow ordinary contact conductivity',
        [wood, stone, wall].every(definition => definition?.conductivity > 0 && definition.conductivity < iron?.conductivity) &&
        insulation?.conductivity === 0 && tubing?.conductivity === 0 && tubing?.conductive !== true,
        `Wood ${wood?.conductivity}, Stone ${stone?.conductivity}, Wall ${wall?.conductivity}; Insulation ${insulation?.conductivity}, Tubing ${tubing?.conductivity}/${tubing?.conductive}`);
    check('Insulation glossary describes heat retention without a fast bridge',
        /heat/i.test(insulation?.description || '') &&
        /retain|hold|preserv|slow|insulat/i.test(insulation?.description || '') &&
        /no contact|non-conductive|zero conductivity/i.test(insulation?.description || '') &&
        !/fast thermal network|connected insulation/i.test(insulation?.description || ''),
        insulation?.description || 'missing Insulation definition');

    const copperResult = bridgeSample(ID.Copper);
    const batteryResult = bridgeSample(ID.Battery);
    const ironResult = bridgeSample(ID.Iron);
    const tubingResult = bridgeSample(ID.Tubing);
    check('non-electrical Tubing transfers heat through the fast thermal network',
        tubingResult.receiverAir > baseline + 10 && tubingResult.pathMean > baseline + 20 &&
        tubing?.conductivity === 0 && tubing?.conductive !== true,
        `Tubing bridge ${tubingResult.pathMean.toFixed(1)}C, receiver ${tubingResult.receiverAir.toFixed(1)}C, rate ${rates(tubing)}`);
    check('fast bridge transfer follows the material rates at a fixed early frame',
        copperResult.receiverAir > batteryResult.receiverAir &&
        batteryResult.receiverAir > ironResult.receiverAir &&
        ironResult.receiverAir > baseline,
        `Copper ${copperResult.receiverAir.toFixed(1)}C, Battery ${batteryResult.receiverAir.toFixed(1)}C, Iron ${ironResult.receiverAir.toFixed(1)}C after 4 frames`);
    check('metal bridge heat stays enclosed and does not quickly warm the exterior or ordinary Wall',
        copperResult.receiverAir > baseline + 10 &&
        Math.abs(copperResult.exteriorAir - baseline) < 3 &&
        copperResult.adjacentWall < copperResult.receiverAir,
        `receiver ${copperResult.receiverAir.toFixed(1)}C, exterior ${copperResult.exteriorAir.toFixed(1)}C, Wall ${copperResult.adjacentWall.toFixed(1)}C`);
    const insulationResult = bridgeSample(ID.Insulation, 12);
    check('Insulation does not bridge heat between the sealed chambers',
        insulationResult.receiverAir < baseline + 2 && insulationResult.chamberInterior < baseline + 2 &&
        insulationResult.pathMean < baseline + 2,
        `bridge ${insulationResult.pathMean.toFixed(1)}C, receiver ${insulationResult.receiverAir.toFixed(1)}C, baseline ${baseline}C`);
}

function runThermalAirFaceFallbackRegression() {
    const callerState = captureSimulationState();
    const callerSeed = getRandomSeed();
    try {
        function buildWaterRoom(breached = false) {
            resetThermalContractFixture(-60);
            const room = { left: 20, right: 40, top: 10, bottom: 34 };
            for (let x = room.left; x <= room.right; x++) {
                setCell(x, room.top, ID.Wall);
                setCell(x, room.bottom, ID.Wall);
            }
            for (let y = room.top + 1; y < room.bottom; y++) {
                setCell(room.left, y, ID.Wall);
                setCell(room.right, y, ID.Wall);
            }
            // Keep a broad Water body in a fixed basin, with its sampled center
            // several cells from both the warm chamber air and the cold shell.
            for (let y = 26; y <= 33; y++) {
                setCell(23, y, ID.Wall);
                setCell(36, y, ID.Wall);
            }
            fillRect(24, 26, 12, 8, ID.Water);
            const world = getWorld();
            for (let x = room.left; x <= room.right; x++) {
                world.temp[index(x, room.top)] = 40;
                world.temp[index(x, room.bottom)] = 40;
            }
            for (let y = room.top + 1; y < room.bottom; y++) {
                world.temp[index(room.left, y)] = 40;
                world.temp[index(room.right, y)] = 40;
            }
            for (let y = room.top + 1; y <= 25; y++) {
                for (let x = room.left + 1; x < room.right; x++) world.temp[index(x, y)] = 40;
            }
            for (let y = 26; y <= 33; y++) {
                world.temp[index(23, y)] = 40;
                world.temp[index(36, y)] = 40;
                for (let x = 24; x <= 35; x++) world.temp[index(x, y)] = 40;
            }

            // A one-cell open basin provides an exposed-water control under the
            // same -60C outdoor ambient.
            for (let y = 29; y <= 32; y++) {
                setCell(6, y, ID.Wall);
                setCell(8, y, ID.Wall);
            }
            for (let x = 6; x <= 8; x++) setCell(x, 32, ID.Wall);
            for (let y = 29; y <= 32; y++) {
                world.temp[index(6, y)] = -60;
                world.temp[index(8, y)] = -60;
            }
            for (let x = 6; x <= 8; x++) world.temp[index(x, 32)] = -60;
            setCell(7, 31, ID.Water);
            world.temp[index(7, 31)] = 40;

            if (breached) setCell(room.left, 18, EMPTY);
            return { room, waterX: 29, waterY: 29, airX: 30, airY: 20 };
        }

        console.log('\nAir-face ambient fallback, sealed water and breach contract');
        const sealedFixture = buildWaterRoom();
        const sampleNeighbors = [
            [sealedFixture.waterX - 1, sealedFixture.waterY],
            [sealedFixture.waterX + 1, sealedFixture.waterY],
            [sealedFixture.waterX, sealedFixture.waterY - 1],
            [sealedFixture.waterX, sealedFixture.waterY + 1]
        ];
        check('the deep-water sample has no cardinal air-space faces',
            sampleNeighbors.every(([x, y]) => defs[typeAt(x, y)]?.category !== 'air' &&
                defs[typeAt(x, y)]?.category !== 'gas'),
            sampleNeighbors.map(([x, y]) => defs[typeAt(x, y)]?.name).join(', '));
        run(360);
        const sealedWaterType = typeAt(sealedFixture.waterX, sealedFixture.waterY);
        const sealedWaterTemp = tempAt(sealedFixture.waterX, sealedFixture.waterY);
        const sealedAirTemp = tempAt(sealedFixture.airX, sealedFixture.airY);
        const exposedWaterType = typeAt(7, 31);
        const exposedWaterTemp = tempAt(7, 31);
        check('water deep in a sealed warm chamber stays liquid above freezing',
            sealedWaterType === ID.Water && sealedWaterTemp > 0,
            `${defs[sealedWaterType]?.name} at ${sealedWaterTemp.toFixed(1)}C`);
        check('the sealed chamber air remains warm above cold outdoor ambient',
            sealedAirTemp > 10 && sealedAirTemp > getAmbientTemp() + 40,
            `${sealedAirTemp.toFixed(1)}C chamber, ${getAmbientTemp().toFixed(1)}C outdoors`);
        check('exposed control water trends to ambient and freezes',
            exposedWaterType === ID.Ice && exposedWaterTemp < 0,
            `${defs[exposedWaterType]?.name} at ${exposedWaterTemp.toFixed(1)}C`);

        const breachedFixture = buildWaterRoom(true);
        run(360);
        const breachedAirTemp = tempAt(breachedFixture.airX, breachedFixture.airY);
        const breachedWaterTemp = tempAt(breachedFixture.waterX, breachedFixture.waterY);
        check('opening a Wall breach reconnects chamber air to the cold ambient',
            breachedAirTemp < sealedAirTemp - 20,
            `${breachedAirTemp.toFixed(1)}C breached vs ${sealedAirTemp.toFixed(1)}C sealed`);
        check('the breached Water body begins cooling through its exposed surface',
            breachedWaterTemp < sealedWaterTemp - 2 || typeAt(breachedFixture.waterX, breachedFixture.waterY) === ID.Ice,
            `${defs[typeAt(breachedFixture.waterX, breachedFixture.waterY)]?.name} at ${breachedWaterTemp.toFixed(1)}C`);

        resetThermalContractFixture(-60);
        const lavaX = 30;
        const lavaY = 20;
        setCell(lavaX, lavaY, ID.Lava);
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                setCell(lavaX + dx, lavaY + dy, ID.Insulation);
                getWorld().temp[index(lavaX + dx, lavaY + dy)] = 1000;
            }
        }
        getWorld().temp[index(lavaX, lavaY)] = 1000;
        run(120);
        check('Lava with no cardinal air face avoids ambient fallback and coolsBy clamping',
            typeAt(lavaX, lavaY) === ID.Lava && tempAt(lavaX, lavaY) > 990,
            `${defs[typeAt(lavaX, lavaY)]?.name} at ${tempAt(lavaX, lavaY).toFixed(1)}C`);
    } finally {
        restoreSimulationState(callerState);
        if (callerSeed !== null) setRandomSeed(callerSeed);
    }
}

function runThermalChamberRegressions() {
    // Start the contact-barrier fixture at its ambient baseline so its
    // far-side temperature only reflects heat crossing the barrier.
    setAmbientTarget(0);
    run(1600);
    section('Insulation material and thermal response');
    const insulationId = ID.Insulation;
    const insulation = defs[insulationId];
    const glass = defs[ID.Glass];
    const stone = defs[ID.Stone];
    const water = defs[ID.Water];
    const sand = defs[ID.Sand];
    check('Insulation is material 54 in the static Solids group',
        insulationId === 54 && insulation?.category === 'static' && insulation?.group === 'Solids',
        `id ${insulationId}, ${insulation?.category}/${insulation?.group}`);
    check('Insulation is pink-red and melts into Lava at 5000C',
        !!insulation && insulation.rgb[0] > insulation.rgb[1] && insulation.rgb[0] > insulation.rgb[2] &&
        insulation.meltPoint === 5000 && insulation.meltsInto === ID.Lava,
        insulation ? `rgb ${insulation.rgb}, melt ${insulation.meltPoint} -> ${defs[insulation.meltsInto]?.name}` : 'missing material');
    check('Insulation has zero conductivity, very high bulk insulation and slow cooling',
        !!insulation && insulation.conductivity === 0 &&
        insulation.bulkInsulation > Math.max(glass.bulkInsulation, stone.bulkInsulation, water.bulkInsulation, sand.bulkInsulation) &&
        insulation.cooling < Math.min(glass.cooling, stone.cooling),
        insulation ? `conductivity ${insulation.conductivity}, bulk ${insulation.bulkInsulation}, cooling ${insulation.cooling}` : 'missing material');

    if (insulationId > 0) {
        const world = getWorld();
        setCell(30, 20, insulationId);
        const initial = tempAt(30, 20);
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if ((dx === 0 && dy === 0) || (dx === 1 && dy === 0)) continue;
                setCell(29 + dx, 20 + dy, ID.Wall);
            }
        }
        setCell(29, 20, ID.Fire);
        run(10);
        check('radiant heat warms Insulation below its melt point',
            tempAt(30, 20) > initial && tempAt(30, 20) < 5000 && typeAt(30, 20) === insulationId,
            `${tempAt(30, 20).toFixed(1)}C`);

        clearWorld();
        setCell(20, 20, ID.Stone);
        setCell(21, 20, insulationId);
        setCell(22, 20, insulationId);
        setCell(23, 20, ID.Stone);
        world.temp[index(20, 20)] = 1000;
        world.temp[index(21, 20)] = 0;
        world.temp[index(22, 20)] = 0;
        world.temp[index(23, 20)] = 0;
        stepSimulation();
        check('heat does not conduct through an Insulation barrier', tempAt(23, 20) < 1,
            `${tempAt(23, 20).toFixed(3)}C`);
        world.temp[index(21, 20)] = 4999;
        world.heat[index(21, 20)] = 0;
        stepSimulation();
        check('Insulation remains solid below 5000C', typeAt(21, 20) === insulationId,
            `material ${typeAt(21, 20)}`);
        // Make the melt threshold a material contract rather than a test of
        // how a connected cold network shares heat before phase changes run.
        setCell(22, 20, ID.Stone);
        world.temp[index(22, 20)] = getAmbientTemp();
        world.temp[index(21, 20)] = 5001;
        world.heat[index(21, 20)] = 1e9;
        stepSimulation();
        check('Insulation melts into Lava above 5000C', typeAt(21, 20) === ID.Lava,
            `material ${typeAt(21, 20)}`);
    }

    section('Enclosed air, heat sources and gas temperature');
    setLayerLapse(0);
    setAmbientTarget(-40);
    run(1600);
    const ambient = getAmbientTemp();
    const shell = insulationId > 0 ? insulationId : ID.Stone;
    function buildRoom() {
        for (let x = 24; x <= 36; x++) {
            setCell(x, 15, shell);
            setCell(x, 27, shell);
        }
        for (let y = 16; y < 27; y++) {
            setCell(24, y, shell);
            setCell(36, y, shell);
        }
    }

    buildRoom();
    const air = getWorld();
    for (let y = 16; y < 27; y++) {
        for (let x = 25; x < 36; x++) air.temp[index(x, y)] = 200;
    }
    air.temp[index(45, 21)] = 200;
    run(100);
    const sealed = tempAt(30, 21);
    const exposed = tempAt(45, 21);
    check('sealed air keeps its heat while open air follows the ambient setting',
        sealed > exposed + 100 && sealed > ambient + 100 && Math.abs(exposed - ambient) < 10,
        `sealed ${sealed.toFixed(1)}C, open ${exposed.toFixed(1)}C, ambient ${ambient.toFixed(1)}C`);
    setCell(24, 21, EMPTY);
    stepSimulation();
    const justOpened = tempAt(30, 21);
    run(120);
    const opened = tempAt(30, 21);
    check('a breach resumes gradual ambient cooling without a temperature snap',
        justOpened > sealed - 25 && opened < sealed - 40,
        `${sealed.toFixed(1)}C sealed, ${justOpened.toFixed(1)}C after 1 frame, ${opened.toFixed(1)}C after 121`);

    function hotRoomCenterAfterCooling(shellId, frames) {
        clearWorld();
        for (let x = 26; x <= 34; x++) {
            setCell(x, 17, shellId);
            setCell(x, 25, shellId);
        }
        for (let y = 18; y < 25; y++) {
            setCell(26, y, shellId);
            setCell(34, y, shellId);
        }
        const chamber = getWorld();
        // Give each shell and chamber the same hot start. Only the shell's
        // heat transfer and cooling behavior can change the chamber center.
        for (let x = 26; x <= 34; x++) {
            chamber.temp[index(x, 17)] = 200;
            chamber.temp[index(x, 25)] = 200;
        }
        for (let y = 18; y < 25; y++) {
            chamber.temp[index(26, y)] = 200;
            chamber.temp[index(34, y)] = 200;
            for (let x = 27; x < 34; x++) chamber.temp[index(x, y)] = 200;
        }
        run(frames);
        return tempAt(30, 21);
    }

    if (insulationId > 0) {
        const wallRoomCenter = hotRoomCenterAfterCooling(ID.Wall, 120);
        const insulationRoomCenter = hotRoomCenterAfterCooling(insulationId, 120);
        check('Wall and Insulation chambers retain warmth, with Insulation retaining more',
            wallRoomCenter > ambient + 30 && insulationRoomCenter > ambient + 100 &&
            wallRoomCenter < insulationRoomCenter - 40,
            `Wall center ${wallRoomCenter.toFixed(1)}C, Insulation center ${insulationRoomCenter.toFixed(1)}C`);
    }

    clearWorld();
    for (let x = 24; x <= 36; x++) {
        setCell(x, 15, ID.Wall);
        setCell(x, 27, ID.Wall);
    }
    for (let y = 16; y < 27; y++) {
        setCell(24, y, ID.Wall);
        setCell(36, y, ID.Wall);
    }
    const mixedBoundaryWorld = getWorld();
    for (let x = 24; x <= 36; x++) {
        mixedBoundaryWorld.temp[index(x, 15)] = 200;
        mixedBoundaryWorld.temp[index(x, 27)] = 200;
    }
    for (let y = 16; y < 27; y++) {
        mixedBoundaryWorld.temp[index(24, y)] = 200;
        mixedBoundaryWorld.temp[index(36, y)] = 200;
        for (let x = 25; x < 36; x++) mixedBoundaryWorld.temp[index(x, y)] = 200;
    }
    // Keep the open-side air equally hot for this one tick, so a temperature
    // drop at the Wall cell can only come from its exposed ambient face.
    mixedBoundaryWorld.temp[index(23, 21)] = 200;
    stepSimulation();
    const mixedBoundaryWall = tempAt(24, 21);
    check('a Wall cell touching enclosed and open air still cools toward outside air',
        mixedBoundaryWall < 199.9,
        `${mixedBoundaryWall.toFixed(3)}C from a 200C start`);

    function airResponse(sourceName, targetX, targetY, sourceX, sourceY, startTemp, frames, repaint = false) {
        clearWorld();
        buildRoom();
        const chamber = getWorld();
        chamber.temp[index(targetX, targetY)] = startTemp;
        for (let frame = 0; frame < frames; frame++) {
            if (frame === 0 || repaint) setCell(sourceX, sourceY, ID[sourceName]);
            stepSimulation();
        }
        return tempAt(targetX, targetY);
    }
    const heatRayAir = airResponse('Heat Ray', 30, 20, 29, 20, 20, 1);
    const coldRayAir = airResponse('Cold Ray', 30, 20, 29, 20, 200, 12, true);
    const fireAir = airResponse('Fire', 30, 20, 30, 21, 20, 3);
    const lavaAir = airResponse('Lava', 30, 20, 30, 21, 20, 1);
    check('Heat Ray warms enclosed air', heatRayAir > 100, `${heatRayAir.toFixed(1)}C`);
    check('Cold Ray cools enclosed air', coldRayAir < 180, `${coldRayAir.toFixed(1)}C`);
    check('Fire warms enclosed air', fireAir > 25, `${fireAir.toFixed(1)}C`);
    check('Lava warms enclosed air', lavaAir > 20.5, `${lavaAir.toFixed(1)}C`);

    clearWorld();
    const gasWorld = getWorld();
    const steamX = 30;
    const steamY = 21;
    // A single gas cell sealed on all eight sides cannot drift into the open
    // control area, so its temperature directly checks gas-cell chamber state.
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            setCell(steamX + dx, steamY + dy, shell);
            gasWorld.temp[index(steamX + dx, steamY + dy)] = 200;
        }
    }
    setCell(steamX, steamY, ID.Steam);
    gasWorld.temp[index(steamX, steamY)] = 200;
    const exposedSteamStart = 30;
    for (let y = 20; y < 25; y++) {
        for (let x = 5; x < 12; x++) {
            setCell(x, y, ID.Steam);
            gasWorld.temp[index(x, y)] = 200;
        }
    }
    run(100);
    let openSteam = 0;
    let openSteamTemp = 0;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (typeAt(x, y) === ID.Steam && x <= 15) {
                openSteam++;
                openSteamTemp += tempAt(x, y);
            }
        }
    }
    openSteamTemp = openSteam ? openSteamTemp / openSteam : -Infinity;
    check('sealed Steam stays warmer and lasts longer than exposed Steam',
        typeAt(steamX, steamY) === ID.Steam && tempAt(steamX, steamY) > 190 && openSteam < exposedSteamStart,
        `${typeAt(steamX, steamY) === ID.Steam ? tempAt(steamX, steamY).toFixed(1) + 'C' : 'condensed'} sealed; ${openSteam} of ${exposedSteamStart} exposed`);
    setLayerLapse(2);
}

// Reuse the same legacy fixtures that run in the normal simulation suite, but
// expose their thermal subset as a fast, focused regression target.
if (process.argv.includes('--focus=thermal-contracts')) {
    const callerState = captureSimulationState();
    const callerSeed = getRandomSeed();
    try {
        runThermalNetworkBridgeContract();
    } finally {
        restoreSimulationState(callerState);
        if (callerSeed !== null) setRandomSeed(callerSeed);
    }
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
}

if (process.argv.includes('--focus=thermal-air-faces')) {
    runThermalAirFaceFallbackRegression();
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
}

if (process.argv.includes('--focus=thermal-regressions')) {
    setAmbientTarget(20);
    setLayerLapse(2);
    run(1400);
    runLavaContactAndCoolingRegressions();
    runLavaAmbientCoolingRegression();
    runLavaSandMeltRegression();
    runWaterAndSteamRegressions();
    runRayRampRegressions();
    runMetalMeltRegressions();
    runClayAndCeramicRegressions();
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
}

if (process.argv.includes('--focus=thermal-chamber')) {
    runThermalChamberRegressions();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
}

if (process.argv.includes('--focus=wind-overhaul')) {
    runWindOverhaulRegressions();
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------

section('Sand falls, piles up and is never lost or duplicated');
fillRect(28, 2, 4, 4, ID.Sand);
const sandStart = countOf(ID.Sand);
run(120);
check('sand is conserved', countOf(ID.Sand) === sandStart, `${sandStart} -> ${countOf(ID.Sand)}`);
check('sand reached the floor', typeAt(29, ROWS - 1) === ID.Sand || typeAt(30, ROWS - 1) === ID.Sand);
check('sand spread into a pile', surfaceOf(29, ID.Sand) > ROWS - 6);

// ---------------------------------------------------------------------------

section('Ash falls much more slowly than snow');
for (let x = 5; x < 55; x += 2) {
    setCell(x, 2, ID.Ash);
    setCell(x + 1, 2, ID.Snow);
}
run(20);
const ashHeight = meanHeightOf(ID.Ash);
const snowHeight = meanHeightOf(ID.Snow);
check('ash descends at less than half the speed of snow',
    ashHeight !== null && snowHeight !== null && ashHeight < snowHeight * 0.5,
    `ash row ${ashHeight?.toFixed(1)}, snow row ${snowHeight?.toFixed(1)}`);

// ---------------------------------------------------------------------------

section('Water finds its own level');
fillRect(10, 10, 6, 14, ID.Water);
const waterStart = countOf(ID.Water);
run(200);
check('water is conserved', countOf(ID.Water) === waterStart, `${waterStart} -> ${countOf(ID.Water)}`);

let minSurface = ROWS;
let maxSurface = -1;
let wetColumns = 0;
for (let x = 0; x < COLS; x++) {
    const s = surfaceOf(x, ID.Water);
    if (s >= 0) {
        wetColumns++;
        if (s < minSurface) minSurface = s;
        if (s > maxSurface) maxSurface = s;
    }
}
check('water spread out sideways', wetColumns > 30, `${wetColumns} columns wet`);
check('surface is level within 2 cells', maxSurface - minSurface <= 2,
    `top ${minSurface}, bottom ${maxSurface}`);

// ---------------------------------------------------------------------------

section('A deep water cliff collapses and levels out');
// This is deliberately deeper than FLOW_STILL_DEPTH. The old deep-water
// shortcut froze the exposed side of this block, leaving a vertical cliff.
fillRect(4, 5, 12, ROWS - 5, ID.Water);
const cliffWater = countOf(ID.Water);
run(700);
let cliffMinSurface = ROWS;
let cliffMaxSurface = -1;
let cliffWetColumns = 0;
for (let x = 0; x < COLS; x++) {
    const s = surfaceOf(x, ID.Water);
    if (s < 0) continue;
    cliffWetColumns++;
    cliffMinSurface = Math.min(cliffMinSurface, s);
    cliffMaxSurface = Math.max(cliffMaxSurface, s);
}
check('the exposed face drained instead of remaining a cliff', cliffWetColumns > 45,
    `${cliffWetColumns} columns wet`);
check('the deep pool found its level', cliffMaxSurface - cliffMinSurface <= 2,
    `top ${cliffMinSurface}, bottom ${cliffMaxSurface}`);
check('levelling conserved the water', countOf(ID.Water) === cliffWater,
    `${cliffWater} -> ${countOf(ID.Water)}`);

// ---------------------------------------------------------------------------

section('Water levels itself in connected vessels (a U-bend)');
// Two chambers joined only by a gap along the bottom, with all the water poured
// into the left one. It has to travel under the divider and climb the far side.
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(30, 10, 1, ROWS - 13, ID.Wall);       // divider, stopping 2 rows short
fillRect(5, 20, 20, 22, ID.Water);              // all the water starts on the left
// Squeezing through a two cell channel takes a while, as it would in reality.
run(1500);
let leftDepth = 0;
let rightDepth = 0;
for (let y = 0; y < ROWS; y++) {
    if (typeAt(15, y) === ID.Water) leftDepth++;
    if (typeAt(45, y) === ID.Water) rightDepth++;
}
check('water travelled under the divider and up the other side', rightDepth > 0,
    `left ${leftDepth}, right ${rightDepth}`);
check('both sides settled at the same level (within 3 cells)',
    Math.abs(leftDepth - rightDepth) <= 3, `left ${leftDepth}, right ${rightDepth}`);

section('Water does not fountain out of a sealed container');
for (let x = 20; x <= 40; x++) setCell(x, 40, ID.Wall);
for (let y = 20; y <= 40; y++) { setCell(20, y, ID.Wall); setCell(40, y, ID.Wall); }
fillRect(21, 30, 19, 10, ID.Water);            // filled to row 30, open at the top
run(400);
let highestWater = ROWS;
for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
        if (typeAt(x, y) === ID.Water && y < highestWater) highestWater = y;
    }
}
check('the water level did not rise above where it started', highestWater >= 29,
    `highest water row ${highestWater}, started at 30`);

// ---------------------------------------------------------------------------

section('Ice floats on water, oil floats on water, sand sinks');
fillRect(0, 20, COLS, 25, ID.Water);
fillRect(20, 30, 6, 2, ID.Ice);       // ice started deep under the surface
fillRect(35, 34, 4, 2, ID.Oil);       // oil started deep under the surface
fillRect(48, 21, 3, 2, ID.Sand);      // sand started at the top
run(150);

let iceDepth = 0, iceCount = 0;
let oilDepth = 0, oilCount = 0;
let sandDepth = 0, sandCount = 0;
for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
        const t = typeAt(x, y);
        if (t === ID.Ice) { iceDepth += y; iceCount++; }
        if (t === ID.Oil) { oilDepth += y; oilCount++; }
        // Sand dropped in water soaks as it goes, so it is followed in
        // whichever form it has reached by the time it lands.
        if (t === ID.Sand || t === ID['Wet Sand'] || t === ID['Wet Mud']) {
            sandDepth += y;
            sandCount++;
        }
    }
}
const waterTop = surfaceOf(25, ID.Water);
check('ice rose to the surface', iceCount > 0 && (iceDepth / iceCount) < 26,
    `average ice row ${(iceDepth / iceCount).toFixed(1)}, water surface ${waterTop}`);
check('oil rose to the surface', oilCount > 0 && (oilDepth / oilCount) < 26,
    `average oil row ${(oilDepth / oilCount).toFixed(1)}`);
check('sand sank to the bottom', sandCount > 0 && (sandDepth / sandCount) > 38,
    `average sand row ${(sandDepth / sandCount).toFixed(1)}`);

// ---------------------------------------------------------------------------

section('Fire rises, burns wood and leaves ash behind');
fillRect(20, 20, 10, 8, ID.Wood);
const woodStart = countOf(ID.Wood);
fillRect(24, 28, 2, 1, ID.Fire);       // lit from underneath
run(90);
check('the fire spread into the wood', countOf(ID.Wood) < woodStart,
    `${woodStart} -> ${countOf(ID.Wood)}`);
check('there are flames', countOf(ID.Fire) > 0);
run(600);
// Cells at the edge of the block can lose their neighbours and cool down before
// they catch, which is fair enough, so this asks for most of it rather than all.
check('most of the wood burned away', countOf(ID.Wood) <= 16, `${countOf(ID.Wood)} of 80 left`);
check('ash was left behind', countOf(ID.Ash) > 0, `${countOf(ID.Ash)} ash`);
check('the fire went out once the fuel was gone', countOf(ID.Fire) === 0,
    `${countOf(ID.Fire)} still burning`);

// ---------------------------------------------------------------------------

section('Water puts fire out');
// Measured against the same fire with no water on it, so this is testing that
// water kills the flames rather than that flames eventually burn out. The fire
// sits on the floor, so the water pools on it the way a bucket thrown over a
// bonfire would, rather than falling straight past it.
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(20, ROWS - 5, 8, 4, ID.Fire);
run(40);
const fireLeftAlone = countOf(ID.Fire);

clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(20, ROWS - 5, 8, 4, ID.Fire);
fillRect(18, ROWS - 12, 12, 5, ID.Water);
run(40);
const fireUnderWater = countOf(ID.Fire);
check('water killed the flames far faster than they burn out',
    fireUnderWater * 4 < fireLeftAlone,
    `${fireUnderWater} left with water, ${fireLeftAlone} left without`);

// ---------------------------------------------------------------------------

function runLavaContactAndCoolingRegressions() {
section('Lava rests on materials instead of displacing them');
for (let x = 20; x <= 40; x++) {
    setCell(x, 20, ID.Sand);
    setCell(x, 21, ID.Wall);
}
setCell(30, 19, ID.Lava);
run(1);
let lavaBelowSurface = false;
let sandPushedUp = false;
for (let x = 20; x <= 40; x++) {
    if (typeAt(x, 20) === ID.Lava) lavaBelowSurface = true;
    if (typeAt(x, 19) === ID.Sand) sandPushedUp = true;
}
check('lava did not sink into the sand', !lavaBelowSurface);
check('the sand was not pushed up above the lava', !sandPushedUp);

// ---------------------------------------------------------------------------

section('Lava transfers contact heat into glass and bakes mud into scoria');
clearWorld();
fillRect(15, 39, 30, 4, ID.Glass);
fillRect(25, 38, 10, 1, ID.Lava);
const glassStartTemp = tempAt(30, 39);
const lavaStartTemp = tempAt(30, 38);
stepSimulation();
check('glass warms where it touches lava without an arbitrary melt deadline',
    tempAt(30, 39) > glassStartTemp && tempAt(30, 39) < lavaStartTemp,
    `glass ${tempAt(30, 39).toFixed(1)}C from ${glassStartTemp.toFixed(1)}C; lava ${lavaStartTemp.toFixed(1)}C`);

clearWorld();
for (let x = 8; x < 22; x++) {
    setCell(x, 29, ID['Wet Mud']);
    setCell(x, 30, ID.Wall);
    setCell(x, 28, ID.Lava);
}
for (let x = 38; x < 52; x++) {
    setCell(x, 29, ID['Dry Mud']);
    setCell(x, 30, ID.Wall);
    setCell(x, 28, ID.Lava);
}
run(180);
let wetMudScoria = 0;
let dryMudScoria = 0;
for (let x = 8; x < 22; x++) if (typeAt(x, 29) === ID.Scoria) wetMudScoria++;
for (let x = 38; x < 52; x++) if (typeAt(x, 29) === ID.Scoria) dryMudScoria++;
check('lava compacted wet mud beneath it into scoria', wetMudScoria > 0,
    `${wetMudScoria} contacted cells became scoria`);
check('lava compacted dry mud beneath it into scoria', dryMudScoria > 0,
    `${dryMudScoria} contacted cells became scoria`);

// ---------------------------------------------------------------------------

section('Lava is quenched by water into scoria and steam, and sets later');
// Lava does not go straight to stone. It chills into scoria - the dark red
// first stage, loose enough to be a powder - which sinks to the bottom and only
// hardens into stone once it has landed and cooled right down.
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(20, 38, 12, 4, ID.Lava);
run(30);
check('lava stays molten on its own', countOf(ID.Lava) > 40, `${countOf(ID.Lava)} lava`);
fillRect(20, 26, 12, 8, ID.Water);
run(120);
check('the lava chilled into scoria rather than straight into stone',
    countOf(ID.Scoria) > 10, `${countOf(ID.Scoria)} scoria, ${countOf(ID.Stone)} stone`);
check('steam was given off', countOf(ID.Steam) > 0, `${countOf(ID.Steam)} steam`);

section('A lump of lava dropped in water sinks as scoria before it sets');
// The whole chain, with little enough lava that all of it quenches rather than
// keeping a molten core under its own crust the way a pool of it does.
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(14, 18, 32, ROWS - 19, ID.Water);
run(300);
fillRect(28, 3, 3, 2, ID.Lava);

// Follow it down, watching what it is and where it is on the way.
let sawScoria = 0;
let sankAsScoria = false;
let setInMidWater = false;
let deepest = 0;
for (let f = 0; f < 400; f++) {
    stepSimulation();
    let scoriaLow = -1;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (typeAt(x, y) === ID.Scoria) scoriaLow = Math.max(scoriaLow, y);
            // Stone with water under it would be a slab hanging in the pond.
            if (typeAt(x, y) === ID.Stone && typeAt(x, y + 1) === ID.Water) setInMidWater = true;
        }
    }
    if (scoriaLow >= 0) {
        sawScoria++;
        if (scoriaLow > deepest) deepest = scoriaLow;
        if (deepest > 24) sankAsScoria = true;
    }
}

// Scoria buried under more scoria holds its heat, so give the heap time to
// finish setting before asking what it turned into.
run(1500);

check('Scoria appears and descends before setting into Stone',
    sawScoria > 0, `it was Scoria for ${sawScoria} frames`);
check('and it sank through the water while it was still scoria', sankAsScoria,
    `the lowest scoria reached row ${deepest} of ${ROWS - 1}`);
check('no stone was left hanging in the middle of the pond', !setInMidWater);
check('it finished as stone on the bottom', countOf(ID.Stone) >= 5 && countOf(ID.Scoria) === 0,
    `${countOf(ID.Stone)} stone, ${countOf(ID.Scoria)} scoria, ${countOf(ID.Lava)} lava`);
check('and it is sitting on the floor', (() => {
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (typeAt(x, y) !== ID.Stone) continue;
            const below = typeAt(x, y + 1);
            if (below !== ID.Wall && below !== ID.Stone) return false;
        }
    }
    return true;
})());

section('A lava flow in the open air cools slowly and all of a piece');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(18, ROWS - 5, 14, 4, ID.Lava);
const pouredLava = countOf(ID.Lava);

// Slowly: a flow does not set the moment it is poured. Nor does the air
// temperature drive it - it starts far hotter than anything around it and gives
// up its heat at its own rate.
run(300);
check('open Lava has begun cooling into solid phases',
    countOf(ID.Lava) < pouredLava && countOf(ID.Scoria) + countOf(ID.Stone) > 0,
    `${countOf(ID.Lava)} Lava, ${countOf(ID.Scoria)} Scoria, ${countOf(ID.Stone)} Stone`);

run(900);
check('the open flow continues toward Stone as it cools',
    countOf(ID.Lava) === 0 && countOf(ID.Stone) > 0,
    `${countOf(ID.Scoria)} Scoria, ${countOf(ID.Lava)} Lava, ${countOf(ID.Stone)} Stone`);

// All of a piece: the middle of a flow should not stay molten under a crust
// while the edges have already set.
run(4000);
check('and given long enough the whole flow is stone',
    countOf(ID.Lava) === 0 && countOf(ID.Scoria) === 0 && countOf(ID.Stone) > pouredLava * 0.8,
    `${countOf(ID.Stone)} stone, ${countOf(ID.Scoria)} scoria, ${countOf(ID.Lava)} lava`);
}
runLavaContactAndCoolingRegressions();

function runLavaAmbientCoolingRegression() {
section('A lava flow cools at its own rate, not the weather\'s');
// Compare the same seeded flow at a fixed elapsed time. The ambient setting
// nudges open Lava's temperature, while its source cooling remains dominant.
function meanFlowTemperature() {
    const world = getWorld();
    let total = 0;
    let cells = 0;
    for (let y = ROWS - 5; y < ROWS - 1; y++) {
        for (let x = 18; x < 32; x++) {
            total += world.temp[index(x, y)];
            cells++;
        }
    }
    return total / cells;
}

setLayerLapse(0);
setAmbientTarget(20);
run(1400);
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(18, ROWS - 5, 14, 4, ID.Lava);
run(120);
const mildTemperature = meanFlowTemperature();

setAmbientTarget(-60);
run(1600);
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(18, ROWS - 5, 14, 4, ID.Lava);
run(120);
const coldTemperature = meanFlowTemperature();
check('colder ambient air cools an otherwise identical exposed Lava flow further',
    coldTemperature < mildTemperature,
    `${coldTemperature.toFixed(1)}C at -60C ambient; ${mildTemperature.toFixed(1)}C at 20C ambient`);

// Put the weather back. The air drifts towards the dial rather than jumping to
// it, so it has to be given the time to get there - otherwise every check after
// this one would be run in a world that is still freezing, and the next pond
// along would quietly turn to ice.
clearWorld();
setAmbientTarget(20);
run(1400);
}
runLavaAmbientCoolingRegression();

section('Stone reheats through scoria and back into lava');
setLayerLapse(0);
fillRect(0, 0, COLS, ROWS, ID.Stone);
getWorld().temp.fill(200);
run(100);
check('warm stone becomes scoria first', countOf(ID.Scoria) > 0 && countOf(ID.Lava) === 0,
    `${countOf(ID.Scoria)} scoria, ${countOf(ID.Lava)} lava`);

clearWorld();
fillRect(0, 0, COLS, ROWS, ID.Scoria);
getWorld().temp.fill(1000);
run(30);
check('continued heating melts scoria into lava', countOf(ID.Lava) > 0,
    `${countOf(ID.Lava)} lava`);

setLayerLapse(2);

section('Thick insulating materials keep their interior temperature');
setLayerLapse(0);
fillRect(20, 14, 21, 17, ID.Glass);
const insulatedWorld = getWorld();
insulatedWorld.temp.fill(-40);
for (let y = 14; y < 31; y++) {
    for (let x = 20; x < 41; x++) insulatedWorld.temp[index(x, y)] = 300;
}
run(70);
let glassShell = 0;
let shellCells = 0;
let glassCore = 0;
let coreCells = 0;
for (let y = 14; y < 31; y++) {
    for (let x = 20; x < 41; x++) {
        const t = tempAt(x, y);
        if (x === 20 || x === 40 || y === 14 || y === 30) {
            glassShell += t;
            shellCells++;
        } else if (x >= 27 && x <= 33 && y >= 19 && y <= 25) {
            glassCore += t;
            coreCells++;
        }
    }
}
glassShell /= shellCells;
glassCore /= coreCells;
check('the exposed glass cooled while its layered interior retained heat',
    glassShell < 250 && glassCore > glassShell + 25,
    `shell ${glassShell.toFixed(1)}C, core ${glassCore.toFixed(1)}C`);
check('dense solids insulate more strongly than fluids and powders',
    defs[ID.Glass].bulkInsulation > defs[ID.Water].bulkInsulation &&
    defs[ID.Stone].bulkInsulation > defs[ID.Sand].bulkInsulation,
    `glass ${defs[ID.Glass].bulkInsulation}, water ${defs[ID.Water].bulkInsulation}`);
setLayerLapse(2);

// ---------------------------------------------------------------------------

function runLavaSandMeltRegression() {
section('Lava transfers heat into Sand, and direct heat reaches its phase threshold');
clearWorld();
setCell(30, 19, ID.Lava);
setCell(30, 20, ID.Sand);
const touchingSandStart = tempAt(30, 20);
stepSimulation();
check('touching Sand warms during Lava contact', tempAt(30, 20) > touchingSandStart,
    `${touchingSandStart.toFixed(1)}C -> ${tempAt(30, 20).toFixed(1)}C`);

clearWorld();
setCell(30, 20, ID.Sand);
const sandIndex = index(30, 20);
getWorld().temp[sandIndex] = defs[ID.Sand].meltPoint + 100;
getWorld().heat[sandIndex] = defs[ID.Sand].latent;
stepSimulation();
check('Sand above its melt threshold becomes Glass', typeAt(30, 20) === ID.Glass,
    `material ${defs[typeAt(30, 20)]?.name}`);

clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, 40, 12, 4, ID.Wood);
fillRect(10, 36, 12, 3, ID.Lava);
run(120);
check('the wood caught light', countOf(ID.Wood) < 48, `${countOf(ID.Wood)} wood left`);
}
runLavaSandMeltRegression();

// ---------------------------------------------------------------------------

section('Ice melts at 0C, and not before');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(25, ROWS - 7, 6, 6, ID.Ice);
check('ice starts below freezing', tempAt(27, ROWS - 4) < 0, `${tempAt(27, ROWS - 4).toFixed(1)}C`);
run(200);
check('ice did not melt straight away at room temperature', countOf(ID.Ice) > 20,
    `${countOf(ID.Ice)} of 36 left after 200 frames`);
fillRect(23, ROWS - 4, 2, 3, ID.Fire);       // flames held against both sides
fillRect(31, ROWS - 4, 2, 3, ID.Fire);
run(200);
check('a flame melted the ice into water', countOf(ID.Water) > 0,
    `${countOf(ID.Water)} water, ${countOf(ID.Ice)} ice left`);

function runWaterAndSteamRegressions() {
section('Water boils into steam at 100C');
// A pan of water on a hot plate: lava on the floor, a stone plate over it so
// that the lava is not quenched on contact, and the water sitting on top.
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Lava);
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 2, ID.Stone);
fillRect(20, ROWS - 6, 14, 4, ID.Water);
check('water starts at 30C', Math.abs(tempAt(25, ROWS - 4) - 30) < 0.001,
    `${tempAt(25, ROWS - 4).toFixed(1)}C`);
run(200);
check('the water boiled into steam', countOf(ID.Steam) > 0, `${countOf(ID.Steam)} steam`);

section('Steam condenses only when humidity and dewpoint conditions are met');
const steamWeatherState = snapshotSimulationState();
const steamWeatherSeed = getRandomSeed();
try {
    function steamWeatherFixture({ airTemp, humidity, dewpoint }) {
        resetThermalContractFixture(airTemp);
        physics.setAmbientHumidityTarget(humidity);
        physics.setDewpointTarget(dewpoint);
        getWorld().humidity.fill(humidity);
        setRandomSeed(904);
        setCell(28, 20, ID.Steam);
        getWorld().temp[index(28, 20)] = airTemp;
    }

    steamWeatherFixture({ airTemp: 25, humidity: 10, dewpoint: 10 });
    const drySteamStart = countOf(ID.Steam);
    run(1800);
    check('warm dry Steam remains suspended without an age timer',
        countOf(ID.Steam) === drySteamStart && countOf(ID.Water) === 0 && countOf(ID.Snow) === 0,
        `${drySteamStart} -> ${countOf(ID.Steam)} Steam`);

    steamWeatherFixture({ airTemp: 12, humidity: 95, dewpoint: 10 });
    run(120);
    check('humid Steam above dewpoint remains uncondensed',
        countOf(ID.Steam) > 0 && countOf(ID.Water) === 0 && countOf(ID.Snow) === 0,
        `${countOf(ID.Steam)} Steam remains`);

    steamWeatherFixture({ airTemp: 5, humidity: 95, dewpoint: 10 });
    run(120);
    check('humid Steam below dewpoint condenses as rain above freezing',
        countOf(ID.Water) > 0 && countOf(ID.Snow) === 0,
        `${countOf(ID.Water)} Water, ${countOf(ID.Snow)} Snow`);

    steamWeatherFixture({ airTemp: 0, humidity: 95, dewpoint: 10 });
    run(120);
    check('humid Steam at zero degrees condenses as Snow',
        countOf(ID.Snow) > 0 && countOf(ID.Water) === 0,
        `${countOf(ID.Snow)} Snow, ${countOf(ID.Water)} Water`);
} finally {
    restoreSimulationCheckpoint(steamWeatherState, steamWeatherSeed);
}

section('Steam cools at the same rate at the edges as in the middle');
const steamEdgeState = snapshotSimulationState();
const steamEdgeSeed = getRandomSeed();
try {
resetThermalContractFixture(20);
setLayerLapse(0);
setRandomSeed(0);
fillRect(0, 0, COLS, ROWS, ID.Steam);
getWorld().temp.fill(300);
getWorld().tempNext.fill(300);
run(400);
let edgeHeat = 0;
let middleHeat = 0;
let heatSamples = 0;
for (let y = 8; y < ROWS - 8; y++) {
    for (let dx = 0; dx < 3; dx++) {
        edgeHeat += tempAt(dx, y) + tempAt(COLS - 1 - dx, y);
        middleHeat += tempAt(COLS / 2 - 1 + dx, y) * 2;
        heatSamples += 2;
    }
}
edgeHeat /= heatSamples;
middleHeat /= heatSamples;
check('the boundary does not act like an extra cold wall', Math.abs(edgeHeat - middleHeat) < 2,
    `edge ${edgeHeat.toFixed(1)}C, middle ${middleHeat.toFixed(1)}C`);
} finally {
    restoreSimulationCheckpoint(steamEdgeState, steamEdgeSeed);
}

section('Steam spreads out sideways and fills the room it is in');
// Characterize spreading before condensation in a seeded, sealed room, then
// confirm its Steam and condensate remain inside the boundary.
const savedRoomState = captureSimulationState();
const savedRoomSeed = getRandomSeed();
try {
    const isolatedRoomState = captureSimulationState();
    isolatedRoomState.ambient = 20;
    isolatedRoomState.ambientTarget = 20;
    isolatedRoomState.layerLapse = 0;
    isolatedRoomState.airLayersOn = false;
    isolatedRoomState.ambientWindOn = false;
    restoreSimulationState(isolatedRoomState);
    setRandomSeed(0);
    setAmbientWindOn(false);
    clearWorld();
    const roomLeft = 10;
    const roomRight = COLS - 11;
    const roomTop = 8;
    const roomBottom = ROWS - 4;
    for (let x = roomLeft; x <= roomRight; x++) {
        setCell(x, roomTop, ID.Wall);
        setCell(x, roomBottom, ID.Wall);
    }
    for (let y = roomTop; y <= roomBottom; y++) {
        setCell(roomLeft, y, ID.Wall);
        setCell(roomRight, y, ID.Wall);
    }
    fillRect(28, ROWS - 7, 4, 2, ID.Steam);
    const steamWorld = getWorld();
    for (let y = ROWS - 7; y < ROWS - 5; y++) {
        for (let x = 28; x < 32; x++) steamWorld.temp[index(x, y)] = 300;
    }
    run(12);
    let steamLeft = COLS;
    let steamRight = -1;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (typeAt(x, y) !== ID.Steam) continue;
            steamLeft = Math.min(steamLeft, x);
            steamRight = Math.max(steamRight, x);
        }
    }
    check('Steam spreads beyond its seeded starting footprint before condensing',
        steamRight - steamLeft + 1 > 4,
        `steam spans ${steamRight - steamLeft + 1} cells after 12 frames`);
    run(240);
    let insideCondensate = 0;
    let escapedSteamOrWater = 0;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const id = typeAt(x, y);
            if (id !== ID.Steam && id !== ID.Water) continue;
            if (x > roomLeft && x < roomRight && y > roomTop && y < roomBottom) {
                insideCondensate++;
            } else {
                escapedSteamOrWater++;
            }
        }
    }
    check('the sealed room contains Steam or Water without leaking either outside',
        insideCondensate > 0 && escapedSteamOrWater === 0,
        `${insideCondensate} contained particles, ${escapedSteamOrWater} outside`);
} finally {
    restoreSimulationState(savedRoomState);
    if (savedRoomSeed !== null) setRandomSeed(savedRoomSeed);
}
}
runWaterAndSteamRegressions();

// ---------------------------------------------------------------------------

section('Acid eats through stone but not through glass');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, 30, 10, 6, ID.Stone);
fillRect(10, 24, 10, 3, ID.Acid);
fillRect(35, 30, 10, 6, ID.Glass);
fillRect(35, 24, 10, 3, ID.Acid);
run(200);
check('stone was dissolved', countOf(ID.Stone) < 60, `${countOf(ID.Stone)} stone left`);
check('glass survived', countOf(ID.Glass) === 60, `${countOf(ID.Glass)} glass left`);

// ---------------------------------------------------------------------------

section('Nothing escapes the edges of the world');
// Sand and ash only, so nothing can react and change the count.
fillRect(0, 0, COLS, 3, ID.Sand);
fillRect(0, 10, COLS, 3, ID.Ash);
const edgeStart = countOf(ID.Sand) + countOf(ID.Ash);
run(300);
check('nothing fell off the edge of the grid',
    countOf(ID.Sand) + countOf(ID.Ash) === edgeStart,
    `${edgeStart} -> ${countOf(ID.Sand) + countOf(ID.Ash)}`);

section('Sand gets wet, and that is as far as it goes');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(25, 30, 8, 5, ID.Sand);
fillRect(22, 20, 14, 9, ID.Water);       // far more water than the sand can hold
run(600);
check('dry sand soaked up water and became wet sand', countOf(ID['Wet Sand']) > 0,
    `${countOf(ID['Wet Sand'])} wet sand`);
check('however much water it sits in, wet sand never becomes mud',
    countOf(ID['Wet Mud']) === 0, `${countOf(ID['Wet Mud'])} wet mud`);

section('Wet ground dries out when heated');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(20, ROWS - 4, 16, 3, ID['Wet Mud']);
// Holding the heat ray on it, the way the brush does. The ray is meant to burn
// out in a few frames, so a single burst would just float away.
for (let f = 0; f < 250; f++) {
    for (let x = 20; x < 36; x++) setCell(x, ROWS - 5, ID['Heat Ray']);
    stepSimulation();
}
check('wet mud baked into dry mud', countOf(ID['Dry Mud']) > 0,
    `${countOf(ID['Dry Mud'])} dry mud, ${countOf(ID['Wet Mud'])} still wet`);

section('Wet mud holds a steeper pile than dry sand');
// Both start as the same tall narrow column. Dry sand should collapse into a
// wide shallow cone; wet mud should stay standing in a heap.
function pileHeight(id) {
    let tallest = 0;
    for (let x = 0; x < COLS; x++) {
        const top = surfaceOf(x, id);
        if (top >= 0 && ROWS - 1 - top > tallest) tallest = ROWS - 1 - top;
    }
    return tallest;
}
fillRect(38, ROWS - 17, 3, 16, ID.Sand);
run(500);
const sandPile = pileHeight(ID.Sand);
clearWorld();
fillRect(38, ROWS - 17, 3, 16, ID['Wet Mud']);
run(500);
const mudPile = pileHeight(ID['Wet Mud']);
check('wet mud stayed in a taller heap than dry sand', mudPile > sandPile + 1,
    `sand ${sandPile} cells high, wet mud ${mudPile} cells high`);

// ---------------------------------------------------------------------------

section('The heat ray sets wood alight and the cold ray freezes water');
fillRect(10, 20, 10, 8, ID.Wood);
fillRect(12, 28, 6, 2, ID['Heat Ray']);
run(150);
check('the heat ray set the wood alight', countOf(ID.Wood) < 80,
    `${countOf(ID.Wood)} of 80 wood left`);

clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(20, ROWS - 5, 16, 4, ID.Water);
run(20);
fillRect(20, ROWS - 9, 16, 3, ID['Cold Ray']);
run(250);
check('the cold ray froze the water into ice', countOf(ID.Ice) > 0,
    `${countOf(ID.Ice)} ice, ${countOf(ID.Water)} water`);

function runRayRampRegressions() {
section('Ray temperature ramps are gradual and contact transfer uses both materials');
// Surround a ray on all sides except its target so the test measures sustained
// contact rather than a moving particle that happens to pass by once.
function surroundRay(x, y, targetId) {
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (dx === 1 && dy === 0) continue;
            setCell(x + dx, y + dy, ID.Wall);
        }
    }
    setCell(x + 1, y, targetId);
}

const rayX = 20;
const rayY = 20;
surroundRay(rayX, rayY, ID.Wall);
setCell(rayX, rayY, ID['Heat Ray']);
const heatContactStart = tempAt(rayX + 1, rayY);
stepSimulation();
const heatRayFirst = tempAt(rayX, rayY);
const heatContactFirst = tempAt(rayX + 1, rayY);
for (let f = 0; f < 9; f++) {
    setCell(rayX, rayY, ID['Heat Ray']);
    stepSimulation();
}
const heatRayLater = tempAt(rayX, rayY);
const heatContactLater = tempAt(rayX + 1, rayY);
check('Heat Ray does not arrive at its target temperature instantly',
    heatRayFirst > heatContactStart && heatRayFirst < defs[ID['Heat Ray']].forceTemp &&
    heatContactFirst > heatContactStart && heatContactFirst < defs[ID['Heat Ray']].forceTemp,
    `ray ${heatRayFirst.toFixed(1)}C, contact ${heatContactFirst.toFixed(1)}C`);
check('Heat Ray ramps its own cell and the touched material toward target',
    heatRayLater > heatRayFirst + 500 && heatContactLater > heatContactFirst + 500 &&
    heatRayLater < defs[ID['Heat Ray']].forceTemp &&
    heatContactLater < defs[ID['Heat Ray']].forceTemp,
    `ray ${heatRayLater.toFixed(1)}C, contact ${heatContactLater.toFixed(1)}C`);

clearWorld();
surroundRay(rayX, rayY, ID.Wall);
setCell(rayX, rayY, ID['Cold Ray']);
const coldContactStart = tempAt(rayX + 1, rayY);
stepSimulation();
const coldRayFirst = tempAt(rayX, rayY);
const coldContactFirst = tempAt(rayX + 1, rayY);
for (let f = 0; f < 9; f++) {
    setCell(rayX, rayY, ID['Cold Ray']);
    stepSimulation();
}
const coldRayLater = tempAt(rayX, rayY);
const coldContactLater = tempAt(rayX + 1, rayY);
check('Cold Ray does not arrive at its target temperature instantly',
    coldRayFirst > defs[ID['Cold Ray']].forceTemp && coldRayFirst < coldContactStart &&
    coldContactFirst > defs[ID['Cold Ray']].forceTemp,
    `ray ${coldRayFirst.toFixed(1)}C, contact ${coldContactFirst.toFixed(1)}C`);
check('Cold Ray ramps its own cell and the touched material toward target',
    coldRayLater < coldRayFirst - 30 && coldContactLater < coldContactFirst - 10 &&
    coldRayLater > defs[ID['Cold Ray']].forceTemp &&
    coldContactLater > defs[ID['Cold Ray']].forceTemp,
    `ray ${coldRayLater.toFixed(1)}C, contact ${coldContactLater.toFixed(1)}C`);

clearWorld();
setCell(18, 20, ID.Copper);
setCell(19, 20, ID.Stone);
setCell(18, 30, ID.Wall);
setCell(19, 30, ID.Stone);
getWorld().temp[index(18, 20)] = 1000;
getWorld().temp[index(19, 20)] = 0;
getWorld().temp[index(18, 30)] = 1000;
getWorld().temp[index(19, 30)] = 0;
stepSimulation();
const copperToStone = tempAt(19, 20);
const wallToStone = tempAt(19, 30);
check('contact heat transfer responds to both source and target materials',
    copperToStone > wallToStone + 100 && copperToStone < 1000,
    `copper source ${copperToStone.toFixed(1)}C, wall source ${wallToStone.toFixed(1)}C`);
}
runRayRampRegressions();

section('The ray tools do not pile up');
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
for (let f = 0; f < 120; f++) {
    for (let x = 25; x < 31; x++) setCell(x, 5, ID['Cold Ray']);
    for (let x = 40; x < 46; x++) setCell(x, 5, ID['Heat Ray']);
    stepSimulation();
}
run(120);
check('they burn out instead of collecting on the floor',
    countOf(ID['Cold Ray']) === 0 && countOf(ID['Heat Ray']) === 0,
    `${countOf(ID['Cold Ray'])} cold, ${countOf(ID['Heat Ray'])} heat left`);

section('The air temperature dial shifts gradually and can freeze a pond');
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 6, 40, 5, ID.Water);
setAmbientTarget(-40);
run(3);
check('the air does not snap to the new temperature', getAmbientTemp() > 15,
    `air is ${getAmbientTemp().toFixed(1)}C after 3 frames`);
run(900);
check('the air worked its way down to the new temperature', getAmbientTemp() < -30,
    `air is ${getAmbientTemp().toFixed(1)}C`);
check('the pond froze over', countOf(ID.Ice) > 0, `${countOf(ID.Ice)} ice`);

section('The air is not perfectly even from particle to particle');
resetThermalContractFixture(20);
setLayerLapse(0);       // layers off, so this measures the variance on its own
setRandomSeed(0);
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
for (let x = 2; x < COLS - 2; x += 2) setCell(x, ROWS - 2, ID.Sand);
getWorld().temp.fill(20);
run(1500);                                  // exposed grains settle independently toward ambient air
let coldest = 1000;
let warmest = -1000;
for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
        if (typeAt(x, y) !== ID.Sand) continue;
        const t = tempAt(x, y);
        if (t < coldest) coldest = t;
        if (t > warmest) warmest = t;
    }
}
check('particles settle at slightly different temperatures', warmest - coldest > 0.5,
    `coldest ${coldest.toFixed(2)}C, warmest ${warmest.toFixed(2)}C`);
check('but the spread stays small', warmest - coldest <= 4.01,
    `spread is ${(warmest - coldest).toFixed(2)} degrees`);
check('and it stays centred on the air temperature',
    Math.abs((warmest + coldest) / 2 - 20) < 1.5,
    `middle of the spread is ${((warmest + coldest) / 2).toFixed(2)}C`);
setAirLayersOn(true);
setRandomSeed(TEST_SEED);

section('The air is colder the higher up you go');
setLayerLapse(2);
setAmbientTarget(20);
// A column of stone from top to bottom, left to sit until it matches the air.
for (let y = 2; y < ROWS - 2; y++) setCell(30, y, ID.Stone);
run(2500);
const highUp = tempAt(30, 3);
const downLow = tempAt(30, ROWS - 3);
check('the top of the world is colder than the bottom', highUp < downLow - 4,
    `${highUp.toFixed(1)}C at the top, ${downLow.toFixed(1)}C at the bottom`);
check('about two degrees per fifth of the height', Math.abs((downLow - highUp) - 8) < 3,
    `${(downLow - highUp).toFixed(1)} degrees from top to bottom, expected about 8`);
check('and the middle still reads what the dial says',
    Math.abs(tempAt(30, Math.floor(ROWS / 2)) - 20) < 2.5,
    `${tempAt(30, Math.floor(ROWS / 2)).toFixed(1)}C halfway up`);

section('The layer slider makes the layering stronger or weaker');
setLayerLapse(6);
for (let y = 2; y < ROWS - 2; y++) setCell(30, y, ID.Stone);
run(2500);
const steepGap = tempAt(30, ROWS - 3) - tempAt(30, 3);
check('turning it up spreads the layers further apart', steepGap > 18,
    `${steepGap.toFixed(1)} degrees from top to bottom at 6 per fifth`);

setLayerLapse(0);
for (let y = 2; y < ROWS - 2; y++) setCell(30, y, ID.Stone);
run(2500);
const flatGap = Math.abs(tempAt(30, ROWS - 3) - tempAt(30, 3));
check('turning it off makes the air one even temperature', flatGap < 3,
    `${flatGap.toFixed(1)} degrees from top to bottom at 0 per fifth`);
setLayerLapse(2);

section('A flame still beats the weather');
// The air is set to freezing, but a fire held against wood should win: a
// particle next to you matters far more than the air temperature.
setAmbientTarget(-40);
fillRect(20, 20, 10, 8, ID.Wood);
fillRect(22, 28, 6, 2, ID.Fire);          // a fire held under it, as the brush would
run(200);
check('wood caught light in freezing air', countOf(ID.Wood) < 80,
    `${countOf(ID.Wood)} of 80 wood left, air ${getAmbientTemp().toFixed(0)}C`);
setAmbientTarget(20);
run(1);

// ---------------------------------------------------------------------------

section('Gunpowder flashes through itself and clears solid ground');
setAmbientTarget(20);
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 6, 40, 5, ID.Stone);
fillRect(10, ROWS - 9, 40, 3, ID.Gunpowder);
const stoneBefore = countOf(ID.Stone);
fillRect(12, ROWS - 8, 2, 1, ID.Fire);        // a spark dropped into one end of the trail
run(12);
const powderLeft = countOf(ID.Gunpowder);
check('the flash tore through the trail in a fraction of a second',
    powderLeft < 60, `${powderLeft} of 120 grains left after 12 frames`);
run(60);
// Give or take the odd grain at the far end of the trail, which can be left
// sitting there once the flame that would have reached it has burned out.
check('all the gunpowder went up', countOf(ID.Gunpowder) <= 6,
    `${countOf(ID.Gunpowder)} of 120 left`);
check('it blew a hole in the stone', countOf(ID.Stone) < stoneBefore - 40,
    `${stoneBefore} -> ${countOf(ID.Stone)} stone`);
check('it threw off sparks', countOf(ID.Spark) + countOf(ID.Fire) > 0,
    `${countOf(ID.Spark)} sparks, ${countOf(ID.Fire)} fire`);

section('An explosion cannot break through a wall');
clearWorld();
for (let y = 20; y < 40; y++) setCell(30, y, ID.Wall);
fillRect(24, 28, 5, 5, ID.Gunpowder);
fillRect(33, 28, 5, 5, ID.Wood);
fillRect(24, 33, 2, 1, ID.Fire);
run(80);
let wallLeft = 0;
for (let y = 20; y < 40; y++) if (typeAt(30, y) === ID.Wall) wallLeft++;
check('the wall survived the blast', wallLeft === 20, `${wallLeft} of 20 wall cells left`);
check('glass and ceramic use the same blast protection',
    defs[ID.Glass].blastProof && defs[ID.Ceramic].blastProof);

// ---------------------------------------------------------------------------

function runMetalMeltRegressions() {
section('Metals melt into their own liquid forms and solidify again');
const metalPairs = [
    ['Copper', 'Molten Copper'],
    ['Battery', 'Molten Aluminum'],
    ['Iron', 'Molten Iron']
];
check('the three solid metals have distinct electrical conductivities',
    new Set(metalPairs.map(([solid]) => defs[ID[solid]].electricalConductivity)).size === 3);
check('ordinary materials are explicitly non-conductive',
    defs[ID.Stone].conductive === false && defs[ID.Water].conductive === false);
check('wire cells draw their configured grid load',
    defs[ID.Copper].powerConsumption === 1 &&
    defs[ID['Molten Copper']].powerConsumption === 1 &&
    defs[ID.Iron].powerConsumption === 0.5 &&
    defs[ID['Molten Iron']].powerConsumption === 0.5);
check('only non-Battery metals can discharge a battery',
    defs[ID.Copper].dischargeBattery && defs[ID['Molten Copper']].dischargeBattery &&
    defs[ID.Iron].dischargeBattery && defs[ID['Molten Iron']].dischargeBattery &&
    !defs[ID.Battery].dischargeBattery && !defs[ID.Stone].dischargeBattery);

for (let n = 0; n < metalPairs.length; n++) {
    const [solid, liquid] = metalPairs[n];
    const x = 15 + n * 15;
    setCell(x, 15, ID[solid]);
    const i = index(x, 15);
    getWorld().temp[i] = defs[ID[solid]].meltPoint + 1000;
    getWorld().heat[i] = defs[ID[solid]].latent - 1;
    stepSimulation();
    check(`${solid} melts into ${liquid}`, typeAt(x, 15) === ID[liquid]);
}

clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, 30, ID.Wall);
for (let n = 0; n < metalPairs.length; n++) {
    const [solid, liquid] = metalPairs[n];
    const x = 15 + n * 15;
    setCell(x, 29, ID[liquid]);
    const i = index(x, 29);
    getWorld().temp[i] = defs[ID[liquid]].freezePoint - 100;
    getWorld().heat[i] = defs[ID[liquid]].latent - 1;
    stepSimulation();
    check(`${liquid} cools back into ${solid}`, typeAt(x, 29) === ID[solid]);
}

clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, 30, ID.Wall);
const metalTemperaturesBeforeRay = new Map();
for (let n = 0; n < metalPairs.length; n++) {
    const [solid] = metalPairs[n];
    const x = 15 + n * 15;
    setCell(x, 29, ID[solid]);
    metalTemperaturesBeforeRay.set(solid, tempAt(x, 29));
}
for (let f = 0; f < 30; f++) {
    for (let n = 0; n < metalPairs.length; n++) {
        setCell(15 + n * 15, 28, ID['Heat Ray']);
    }
    stepSimulation();
}
const metalTemperaturesAfterRay = metalPairs.map(([solid], n) => {
    const x = 15 + n * 15;
    return `${solid} ${tempAt(x, 29).toFixed(1)}C`;
});
check('repeated Heat Ray contact warms Battery, Copper and Iron',
    metalPairs.every(([solid], n) =>
        tempAt(15 + n * 15, 29) > metalTemperaturesBeforeRay.get(solid)),
    metalTemperaturesAfterRay.join(', '));
}
runMetalMeltRegressions();

// ---------------------------------------------------------------------------

section('A Spark sends a temporary power pulse to both ends of a metal wire');
check('Spark does not produce smoke when it expires', defs[ID.Spark].smokeChance === 0);
for (let x = 10; x <= 50; x++) setCell(x, 20, ID.Copper);
setCell(30, 19, ID.Spark);
stepSimulation();
check('the Spark is absorbed when it touches the wire', typeAt(30, 19) === EMPTY);
check('the contact point registers as powered', isPowered(30, 20));
let reachedLeft = false;
let reachedRight = false;
for (let f = 0; f < 35; f++) {
    stepSimulation();
    reachedLeft ||= isPowered(10, 20);
    reachedRight ||= isPowered(50, 20);
}
check('the pulse travelled away from the contact to both extremes', reachedLeft && reachedRight);
check('the power disappears after the pulse reaches the ends',
    !getWorld().power.some(value => value > 0) &&
    !getWorld().powerDelay.some(value => value > 0));

// ---------------------------------------------------------------------------

section('Battery stores and shares repeated Spark charge');
clearWorld();
for (let x = 10; x < 20; x++) setCell(x, 20, ID.Battery);
for (let n = 0; n < 5; n++) {
    setCell(15, 19, ID.Spark);
    stepSimulation();
}
const storedCharge = getStoredCharge(10, 20);
const expectedCharge = defs[ID.Battery].chargePerSpark * 5 / 10;
const connectedBattery = getConnectedBatteryCharge(10, 20);
check('the charge indicator reads the whole connected Battery entity',
    connectedBattery && connectedBattery.capacity === defs[ID.Battery].chargeCapacity * 10 &&
    Math.abs(connectedBattery.charge - storedCharge * 10) < 0.001);
setCell(25, 20, ID.Battery);
const separateBattery = getConnectedBatteryCharge(25, 20);
check('a disconnected Battery entity has its own battery reservoir',
    separateBattery && separateBattery.capacity === defs[ID.Battery].chargeCapacity &&
    separateBattery.charge === 0);
check('each Spark adds a fixed total charge shared across connected Battery',
    Math.abs(storedCharge - expectedCharge) < 0.001,
    `${storedCharge.toFixed(2)} charge per cell`);
check('a larger Battery mass has proportionally more total capacity',
    defs[ID.Battery].chargeCapacity * 10 ===
        defs[ID.Battery].chargeCapacity * 2 * 5);

setCell(20, 20, ID.Battery);
stepSimulation();
const balancedCharge = defs[ID.Battery].chargePerSpark * 5 / 11;
check('new Battery draws from touching charged Battery until charge is balanced',
    Math.abs(getStoredCharge(10, 20) - balancedCharge) < 0.001 &&
    Math.abs(getStoredCharge(20, 20) - balancedCharge) < 0.001,
    `${getStoredCharge(10, 20).toFixed(2)} old, ${getStoredCharge(20, 20).toFixed(2)} new`);
const savedBatterySparkChance = defs[ID.Battery].sparkEmitterChance;
const savedBatterySparkSeed = getRandomSeed();
let emittedChargeSpark = false;
try {
    // Force the eligible emission path for this behavior check instead of
    // relying on a rare random event during a long simulation window.
    defs[ID.Battery].sparkEmitterChance = 1;
    clearWorld();
    for (let x = 10; x < 20; x++) {
        setCell(x, 20, ID.Battery);
        getWorld().charge[index(x, 20)] = defs[ID.Battery].chargeCapacity;
    }
    stepSimulation();
    emittedChargeSpark = countOf(ID.Spark) > 0;
} finally {
    defs[ID.Battery].sparkEmitterChance = savedBatterySparkChance;
    if (savedBatterySparkSeed !== null) setRandomSeed(savedBatterySparkSeed);
}
check('a charged Battery emits a visual Spark when emission is eligible', emittedChargeSpark);
check('stored charge persists when no discharge metal is attached',
    Math.abs(getStoredCharge(10, 20) - defs[ID.Battery].chargeCapacity) < 0.001);
check('visual charge Sparks do not create smoke', countOf(ID.Smoke) === 0);

// ---------------------------------------------------------------------------

section('Copper and Iron draw power from touching charged Battery');
clearWorld();
setCell(10, 20, ID.Battery);
setCell(11, 20, ID.Copper);
setCell(12, 20, ID.Iron);
getWorld().charge[index(10, 20)] = 10;
stepSimulation();
check('the grid discharges its total copper-plus-iron load every tick',
    Math.abs(getStoredCharge(10, 20) - 9.985) < 0.001,
    `${getStoredCharge(10, 20).toFixed(3)} charge remains after a scaled 1.5-unit tick`);

clearWorld();
for (let x = 10; x < 15; x++) setCell(x, 20, ID.Battery);
for (let x = 15; x <= 30; x++) setCell(x, 20, ID.Copper);
for (let x = 10; x < 15; x++) getWorld().charge[index(x, 20)] = 4;
const batteryChargeBefore = Array.from({ length: 5 }, (_, n) =>
    getStoredCharge(10 + n, 20)).reduce((sum, value) => sum + value, 0);
let batteryPoweredFarEnd = false;
for (let f = 0; f < 160; f++) {
    stepSimulation();
    batteryPoweredFarEnd ||= isPowered(30, 20);
}
const batteryChargeAfter = Array.from({ length: 5 }, (_, n) =>
    getStoredCharge(10 + n, 20)).reduce((sum, value) => sum + value, 0);
check('touching Copper slowly drains the Battery reservoir',
    batteryChargeAfter < batteryChargeBefore && batteryChargeAfter === 0,
    `${batteryChargeBefore.toFixed(1)} -> ${batteryChargeAfter.toFixed(1)} total charge`);
check('battery power repeatedly reaches the far end of attached metal', batteryPoweredFarEnd);
run(50);
check('the attached metal stops receiving power once Battery is empty',
    !getWorld().power.some(value => value > 0) &&
    !getWorld().powerDelay.some(value => value > 0));

for (const [wireId, wireName] of [[ID.Copper, 'Copper'], [ID.Iron, 'Iron']]) {
    clearWorld();
    setCell(10, 20, ID.Battery);
    setCell(11, 20, wireId);
    setCell(13, 20, ID.Fan);
    getWorld().charge[index(10, 20)] = defs[ID.Battery].chargeCapacity;
    stepSimulation();
    const machine = index(13, 20);
    check(`${wireName} can power a machine two cells beyond its end`,
        getWorld().powerDelay[machine] > 0 || getWorld().power[machine] > 0,
        `${wireName} wire reach is ${defs[wireId].wireReach}`);
}

section('Spark Dust emits around itself and wears out pixel by pixel');
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
const sparkDust = defs[ID['Spark Dust']];
const sparkBlockDefinition = defs[ID['Spark Block']];
check('spark sources use the quieter half-opacity settings',
    sparkDust.sparkEmitterChance === 0.02 &&
    sparkBlockDefinition.sparkEmitterChance === 0.02 && defs[ID.Spark].alpha === 0.5);
const savedSparkDustSettings = {
    sparkEmitterChance: sparkDust.sparkEmitterChance,
    life: sparkDust.life,
    lifeVariance: sparkDust.lifeVariance
};
sparkDust.sparkEmitterChance = 1;
sparkDust.life = 4;
sparkDust.lifeVariance = 0;
setCell(30, ROWS - 2, ID['Spark Dust']);
stepSimulation();
check('Spark Dust emits real Sparks around itself', countOf(ID.Spark) > 0);
run(8);
check('each Spark Dust pixel expires into Ash',
    countOf(ID['Spark Dust']) === 0 && countOf(ID.Ash) > 0);
Object.assign(sparkDust, savedSparkDustSettings);

section('Spark Block emits around itself and water suppresses it');
clearWorld();
const sparkBlock = defs[ID['Spark Block']];
const savedSparkBlockEmitterChance = sparkBlock.sparkEmitterChance;
const savedSparkBlockLifetime = {
    life: sparkBlock.life,
    lifeVariance: sparkBlock.lifeVariance,
    lifeTransitionAt: sparkBlock.lifeTransitionAt
};
sparkBlock.sparkEmitterChance = 1;
const blockX = 30;
const blockY = 20;
setCell(blockX, blockY, ID['Spark Block']);
setCell(blockX, blockY - 1, ID.Water);
for (const [x, y] of [
    [blockX - 1, blockY - 2], [blockX, blockY - 2], [blockX + 1, blockY - 2],
    [blockX - 1, blockY - 1], [blockX + 1, blockY - 1],
    [blockX - 1, blockY], [blockX + 1, blockY]
]) setCell(x, y, ID.Wall);
stepSimulation();
check('water touching a Spark Block suppresses its Sparks', countOf(ID.Spark) === 0);

getWorld().type[index(blockX, blockY - 1)] = EMPTY;
getWorld().life[index(blockX, blockY - 1)] = 0;
stepSimulation();
check('the Spark Block resumes when the water is cleared', countOf(ID.Spark) > 0);
check('the Spark Block lasts five times longer than Spark Dust',
    sparkBlock.life === sparkDust.life * 5 &&
    sparkBlock.lifeVariance === sparkDust.lifeVariance * 5);

clearWorld();
sparkBlock.sparkEmitterChance = 0;
sparkBlock.life = 20;
sparkBlock.lifeVariance = 0;
sparkBlock.lifeTransitionAt = 0.1;
setCell(blockX, blockY, ID['Spark Block']);
run(18);
check('a Spark Block becomes Spark Dust in its final tenth',
    typeAt(blockX, blockY) === ID['Spark Dust']);
sparkBlock.sparkEmitterChance = savedSparkBlockEmitterChance;
Object.assign(sparkBlock, savedSparkBlockLifetime);
sparkBlock.sparkEmitterChance = savedSparkBlockEmitterChance;

// ---------------------------------------------------------------------------

section('Fans activate from power and blow a directional cone');
const fan = defs[ID.Fan];
check('Fan is a 50-load conductive machine',
    fan.machine === 'fan' && fan.conductive &&
    fan.electricalConductivity === 50 && fan.powerConsumption === 50);

const fanX = 30;
const fanY = 20;
clearWorld();
setCell(fanX, fanY, ID.Fan);
setCell(fanX - 1, fanY, ID.Battery);
getWorld().charge[index(fanX - 1, fanY)] = defs[ID.Battery].chargeCapacity;
stepSimulation();
const fanWind = getWorld().wind;
check('a charged Battery contact powers the Fan', isPowered(fanX, fanY));
check('an active Fan marks its forward cone',
    fanWind[index(fanX + 1, fanY)] > 0 && fanWind[index(fanX + 3, fanY)] > 0);
check('the Fan cone widens away from the housing',
    fanWind[index(fanX + 3, fanY - 1)] > 0 && fanWind[index(fanX + 3, fanY + 1)] > 0);

const savedAshWindLift = defs[ID.Ash].windLift;
clearWorld();
const floorFanX = 20;
const floorFanY = ROWS - 1;
setCell(floorFanX, floorFanY, ID.Fan);
setCell(floorFanX - 1, floorFanY, ID.Battery);
getWorld().charge[index(floorFanX - 1, floorFanY)] = defs[ID.Battery].chargeCapacity;
setCell(floorFanX + 28, floorFanY, ID.Ash);
defs[ID.Ash].windLift = 100;
stepSimulation();
check('the Fan reaches particles four times farther away',
    typeAt(floorFanX + 29, floorFanY) === ID.Ash &&
    getWorld().wind[index(floorFanX + 28, floorFanY)] > 0 &&
    getWorld().wind[index(floorFanX + 29, floorFanY)] === 0);
stepSimulation();
check('Fan air decelerates beyond the cone instead of stopping abruptly',
    typeAt(floorFanX + 30, floorFanY) === ID.Ash &&
    getWorld().airflowX[index(floorFanX + 29, floorFanY)] > 0 &&
    getWorld().airflowX[index(floorFanX + 29, floorFanY)] <
        getWorld().airflowX[index(floorFanX + 28, floorFanY)]);
defs[ID.Ash].windLift = savedAshWindLift;

clearWorld();
setCell(fanX, fanY, ID.Fan);
stepSimulation();
check('an unpowered Fan is still', !getWorld().wind.some(value => value > 0));

clearWorld();
setCell(fanX, fanY, ID.Fan);
getWorld().data[index(fanX, fanY)] = 1; // left
setCell(fanX + 1, fanY, ID.Spark);
stepSimulation();
check('a touching Spark activates a Fan facing left',
    getWorld().wind[index(fanX - 1, fanY)] > 0 &&
    getWorld().wind[index(fanX + 1, fanY)] === 0);

clearWorld();
setCell(fanX, fanY, ID.Fan);
getWorld().data[index(fanX, fanY)] = 4; // up-right
setCell(fanX - 1, fanY, ID.Battery);
getWorld().charge[index(fanX - 1, fanY)] = defs[ID.Battery].chargeCapacity;
stepSimulation();
check('a Fan can blow diagonally',
    getWorld().wind[index(fanX + 1, fanY - 1)] > 0 &&
    getWorld().wind[index(fanX + 1, fanY + 1)] === 0);

clearWorld();
setCell(fanX, fanY, ID.Fan);
setCell(fanX - 1, fanY, ID.Battery);
getWorld().charge[index(fanX - 1, fanY)] = defs[ID.Battery].chargeCapacity;
setCell(fanX + 3, fanY, ID.Glass);
stepSimulation();
check('a solid in front of a Fan blocks only the downwind cone',
    getWorld().wind[index(fanX + 2, fanY)] > 0 &&
    getWorld().wind[index(fanX + 4, fanY)] === 0);

// ---------------------------------------------------------------------------

section('Heater and Cooler launch directional ray particles when powered');
const heater = defs[ID.Heater];
const cooler = defs[ID.Cooler];
check('Heater and Cooler are configured to emit the matching rays',
    heater.machineEmits === ID['Heat Ray'] && cooler.machineEmits === ID['Cold Ray'] &&
    defs[ID['Heat Ray']].projectile && defs[ID['Cold Ray']].projectile);

const machineX = 30;
const machineY = 20;
clearWorld();
setCell(machineX, machineY, ID.Heater);
setCell(machineX - 1, machineY, ID.Battery);
getWorld().charge[index(machineX - 1, machineY)] = defs[ID.Battery].chargeCapacity;
stepSimulation();
const firstHeatRay = index(machineX + 1, machineY);
check('a powered Heater launches a right-facing Heat Ray',
    typeAt(machineX + 1, machineY) === ID['Heat Ray'] &&
    (getWorld().data[firstHeatRay] & 8) !== 0 &&
    (getWorld().data[firstHeatRay] & 7) === 0);
stepSimulation();
check('the emitted Heat Ray advances along the cone centreline',
    typeAt(machineX + 3, machineY) === ID['Heat Ray']);

clearWorld();
setCell(machineX, machineY, ID.Cooler);
setCell(machineX - 1, machineY, ID.Battery);
getWorld().charge[index(machineX - 1, machineY)] = defs[ID.Battery].chargeCapacity;
stepSimulation();
const firstColdRay = index(machineX + 1, machineY);
check('a powered Cooler launches a right-facing Cold Ray',
    typeAt(machineX + 1, machineY) === ID['Cold Ray'] &&
    (getWorld().data[firstColdRay] & 8) !== 0 &&
    (getWorld().data[firstColdRay] & 7) === 0);

clearWorld();
setCell(machineX, machineY, ID.Heater);
stepSimulation();
check('an unpowered Heater launches no Heat Ray', countOf(ID['Heat Ray']) === 0);

// ---------------------------------------------------------------------------

section('A sealed storage funnel fills the bin before retaining overflow');
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 2, ID.Glass);
const storageX = Math.floor(COLS / 2);
const storageY = ROWS - 3;
setCell(storageX, storageY, ID['Liquid Storage Bin']);
getWorld().data[index(storageX, storageY)] = 3; // entrance points upward
for (let y = 0; y < storageY; y++) {
    const progress = y / (storageY - 1);
    const leftWing = Math.round(4 + (storageX - 1 - 4) * progress);
    const rightWing = Math.round((COLS - 5) + ((storageX + 1) - (COLS - 5)) * progress);
    setCell(leftWing, y, ID.Glass);
    setCell(rightWing, y, ID.Glass);
    for (let x = leftWing + 1; x < rightWing; x++) {
        if (y >= 6 && y < 30) setCell(x, y, ID.Water);
    }
}
run(1400);
const storage = getStorageInventory(storageX, storageY);
check('the funnel stores water as it reaches the entrance',
    storage?.type === ID.Water && storage.count === storage.capacity,
    `${storage?.count ?? 0}/${storage?.capacity ?? 0} stored`);
check('water remains above a full storage bin', countOf(ID.Water) > 0,
    `${countOf(ID.Water)} water remains above the full bin`);

// ---------------------------------------------------------------------------

section('Water still wets ash into wet ash');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(8, ROWS - 5, 44, 4, ID.Ash);
fillRect(14, ROWS - 8, 32, 2, ID.Water);
run(80);
check('water turns dry ash into wet ash', countOf(ID['Wet Ash']) > 0,
    `${countOf(ID['Wet Ash'])} wet ash`);

// ---------------------------------------------------------------------------

// Runs a steam vent for a while and reports the most snow and water seen at any
// one moment, since both go on to freeze or melt as the scene plays out.
function ventSteam(frames) {
    let peakSnow = 0;
    let peakWater = 0;
    for (let f = 0; f < frames; f++) {
        if (f < 200) fillRect(26, ROWS - 4, 8, 2, ID.Steam);
        stepSimulation();
        peakSnow = Math.max(peakSnow, countOf(ID.Snow));
        peakWater = Math.max(peakWater, countOf(ID.Water));
    }
    return { snow: peakSnow, water: peakWater };
}

section('Steam falls as snow when the air is below freezing');
physics.setAmbientHumidityTarget(95);
physics.setDewpointTarget(10);
getWorld().humidity?.fill(95);
setAmbientTarget(-15);
run(600);                                    // let the cold set in
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
const cold = ventSteam(1800);
check('it came down as snow', cold.snow > 20, `${cold.snow} snow at its heaviest`);

section('And as rain when the air is warm');
setAmbientTarget(25);
physics.setDewpointTarget(30);
run(900);
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
const warm = ventSteam(1800);
check('no snow in warm air', warm.snow === 0, `${warm.snow} snow`);
check('it condensed as water instead', warm.water > 0, `${warm.water} water`);
setAmbientTarget(20);
physics.setDewpointTarget(10);
physics.setAmbientHumidityTarget(50);
getWorld().humidity?.fill(50);
run(1);

section('Snow lies where it falls while the air stays below freezing');
setAmbientTarget(-15);
run(600);
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 3, 30, 2, ID.Stone);
fillRect(14, ROWS - 8, 20, 3, ID.Snow);
const fell = countOf(ID.Snow);
run(900);
check('it is still snow a quarter of a minute later', countOf(ID.Snow) > fell * 0.8,
    `${fell} -> ${countOf(ID.Snow)} snow`);

// Same snow, same scene - just turn the weather up. No clearWorld here.
console.log('\nSnow melts once the air warms up');
setAmbientTarget(25);
run(2500);
check('the snow melted away', countOf(ID.Snow) === 0, `${countOf(ID.Snow)} snow left`);
check('and left water behind', countOf(ID.Water) > 0, `${countOf(ID.Water)} water`);
setAmbientTarget(20);
run(1);

section('Snow lands on water and melts into it at once');
setAmbientTarget(-10);
run(500);
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 4, 30, 3, ID.Water);
getWorld().temp.fill(-10);
for (let x = 14; x < 36; x++) setCell(x, ROWS - 6, ID.Snow);
const snowfall = countOf(ID.Snow);
run(30);
check('the snow that hit the water is gone', countOf(ID.Snow) < snowfall / 2,
    `${snowfall} -> ${countOf(ID.Snow)} snow`);
check('it turned into water rather than piling up', countOf(ID.Water) > 90,
    `${countOf(ID.Water)} water`);

section('Snow settles on ice and packs down into it');
setAmbientTarget(-10);
clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 4, 30, 3, ID.Ice);
for (let x = 14; x < 36; x++) setCell(x, ROWS - 5, ID.Snow);
const iceBefore = countOf(ID.Ice);
run(40);
check('the snow sits on top of the ice at first', countOf(ID.Snow) > 10,
    `${countOf(ID.Snow)} snow still lying on it`);
run(3000);
check('over time it packs down into ice', countOf(ID.Ice) > iceBefore,
    `${iceBefore} -> ${countOf(ID.Ice)} ice, ${countOf(ID.Snow)} snow left`);
setAmbientTarget(20);
run(1);

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

section('Water wets dry ground the instant it touches it');
setAmbientTarget(20);
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 4, 40, 3, ID.Sand);
fillRect(20, ROWS - 6, 6, 1, ID.Water);      // a few drops straight onto the sand
run(4);
check('the sand it landed on was wet at once', countOf(ID['Wet Sand']) > 0,
    `${countOf(ID['Wet Sand'])} wet sand after 4 frames`);

section('Water is used up as it filters into dry and wet ground');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(5, ROWS - 3, 50, 2, ID['Dry Mud']);
fillRect(10, ROWS - 10, 40, 4, ID.Water);
const pouredOn = countOf(ID.Water);
run(300);
const soakedAway = pouredOn - countOf(ID.Water);
check('some of the water was soaked up', soakedAway > 0,
    `${pouredOn} -> ${countOf(ID.Water)} water`);
check('the dry mud it reached turned wet', countOf(ID['Wet Mud']) > 0,
    `${countOf(ID['Wet Mud'])} wet mud`);

clearWorld();
for (let y = ROWS - 12; y < ROWS; y++) {
    setCell(28, y, ID.Wall);
    setCell(32, y, ID.Wall);
}
setCell(29, ROWS - 1, ID.Wall);
setCell(30, ROWS - 1, ID.Wall);
setCell(31, ROWS - 1, ID.Wall);
fillRect(29, ROWS - 9, 3, 8, ID['Wet Sand']);
setCell(30, ROWS - 10, ID.Water);
const wetColumn = countOf(ID['Wet Sand']);
run(1600);
check('water remains above a fully wet, supported column', countOf(ID.Water) === 1,
    `${countOf(ID.Water)} water left above the column`);
check('the wet powder was displaced rather than erased', countOf(ID['Wet Sand']) === wetColumn,
    `${wetColumn} -> ${countOf(ID['Wet Sand'])} wet sand`);

section('Water infiltration stops after 50 powder cells');
const normalPermeability = defs[ID['Wet Sand']].waterPermeability;
defs[ID['Wet Sand']].waterPermeability = 1;

// A one-cell shaft keeps the powder column upright while a drop travels down
// through exactly fifty wet cells. The dry 51st cell must never be touched.
createWorld(5, 53);
for (let y = 0; y < 53; y++) {
    setCell(1, y, ID.Wall);
    setCell(3, y, ID.Wall);
}
for (let x = 1; x <= 3; x++) setCell(x, 52, ID.Wall);
fillRect(2, 1, 1, 50, ID['Wet Sand']);
setCell(2, 51, ID.Sand);
setCell(2, 0, ID.Water);
run(80);
check('the 51st powder cell remains dry', typeAt(2, 51) === ID.Sand,
    `cell 51 became ${defs[typeAt(2, 51)]?.name || 'air'}`);
check('water stays above the saturated 50-cell column', countOf(ID.Water) === 1,
    `${countOf(ID.Water)} water left`);

// The bottom edge supports the material like a floor. Once all fifty cells are
// wet, surplus water is retained above them rather than escaping off-screen.
createWorld(5, 51);
for (let y = 0; y < 51; y++) {
    setCell(1, y, ID.Wall);
    setCell(3, y, ID.Wall);
}
fillRect(2, 1, 1, 50, ID['Wet Sand']);
setCell(2, 0, ID.Water);
run(80);
check('the bottom does not drain a saturated 50-cell layer', countOf(ID.Water) === 1,
    `${countOf(ID.Water)} water left`);
check('the complete 50-cell layer stays wet', countOf(ID['Wet Sand']) === 50,
    `${countOf(ID['Wet Sand'])} wet cells`);

defs[ID['Wet Sand']].waterPermeability = normalPermeability;
createWorld(COLS, ROWS);

function runClayAndCeramicRegressions() {
section('Deep wet mud compacts into impermeable clay');
createWorld(5, 51);
fillRect(2, 1, 1, 50, ID['Wet Mud']);
run(2);
check('a 50-layer wet-mud column remains loose', countOf(ID.Clay) === 0,
    `${countOf(ID.Clay)} clay cells`);

createWorld(5, 52);
fillRect(2, 1, 1, 51, ID['Wet Mud']);
run(2);
check('the 51st supported layer compacts into clay', countOf(ID.Clay) === 1,
    `${countOf(ID.Clay)} clay cells`);
check('the upper fifty layers remain wet mud', countOf(ID['Wet Mud']) === 50,
    `${countOf(ID['Wet Mud'])} wet-mud cells`);

createWorld(5, 12);
for (let y = 0; y < 12; y++) {
    setCell(1, y, ID.Wall);
    setCell(3, y, ID.Wall);
}
setCell(2, 10, ID.Clay);
setCell(2, 9, ID.Water);
run(200);
check('water cannot penetrate clay', typeAt(2, 10) === ID.Clay && countOf(ID.Water) === 1,
    `${countOf(ID.Water)} water, ${countOf(ID.Clay)} clay`);

section('Firing turns clay into ceramic, then extreme heat melts it');
createWorld(5, 5);
setCell(2, 4, ID.Clay);
for (let frame = 0; frame < 80 && typeAt(2, 4) === ID.Clay; frame++) {
    getWorld().temp[index(2, 4)] = 700;
    stepSimulation();
}
check('clay fires into ceramic above 600C', typeAt(2, 4) === ID.Ceramic,
    `became ${defs[typeAt(2, 4)]?.name || 'air'}`);
for (let frame = 0; frame < 80 && typeAt(2, 4) === ID.Ceramic; frame++) {
    getWorld().temp[index(2, 4)] = 1000;
    stepSimulation();
}
check('ceramic behaves like glass and melts into lava above 800C', typeAt(2, 4) === ID.Lava,
    `became ${defs[typeAt(2, 4)]?.name || 'air'}`);

createWorld(COLS, ROWS);
}
runClayAndCeramicRegressions();

section('Wet sand never turns into mud - mud only comes from dry mud');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 4, 30, 3, ID['Wet Sand']);
fillRect(10, ROWS - 10, 30, 5, ID.Water);
run(900);
check('soaking wet sand does not make mud', countOf(ID['Wet Mud']) === 0,
    `${countOf(ID['Wet Mud'])} wet mud appeared`);

clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 4, 30, 3, ID['Dry Mud']);
fillRect(10, ROWS - 10, 30, 5, ID.Water);
run(300);
check('dry mud does', countOf(ID['Wet Mud']) > 0, `${countOf(ID['Wet Mud'])} wet mud`);

// ---------------------------------------------------------------------------

section('Wet ground sits on dry ground without soaking into it');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 4, 30, 3, ID.Sand);          // dry sand underneath
fillRect(10, ROWS - 7, 30, 3, ID['Wet Sand']);   // wet sand resting on top
const dryUnderneath = countOf(ID.Sand);
run(400);
check('the dry sand underneath stayed dry', countOf(ID.Sand) >= dryUnderneath - 2,
    `${dryUnderneath} -> ${countOf(ID.Sand)} dry sand`);

// ---------------------------------------------------------------------------

section('The wind blows loose things along and leaves fixed things alone');
setLayerLapse(0);
setAmbientTarget(20);
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(20, 20, 3, 3, ID.Sand);
fillRect(20, 26, 3, 3, ID['Wet Mud']);
fillRect(20, 32, 3, 3, ID.Stone);
fillRect(20, 12, 3, 3, ID.Steam);

function centreOf(id) {
    let total = 0;
    let count = 0;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (typeAt(x, y) === id) { total += x; count++; }
        }
    }
    return count === 0 ? null : total / count;
}

const before = {
    sand: centreOf(ID.Sand),
    mud: centreOf(ID['Wet Mud']),
    stone: centreOf(ID.Stone),
    steam: centreOf(ID.Steam)
};

// A gust dragged to the right, the way the mouse would.
for (let gust = 0; gust < 40; gust++) {
    for (const row of [13, 21, 27, 33]) applyWind(21, row, 1, 0, 5, 3);
    stepSimulation();
}

check('dry sand was blown downwind', centreOf(ID.Sand) > before.sand + 1,
    `sand moved from ${before.sand.toFixed(1)} to ${centreOf(ID.Sand).toFixed(1)}`);
check('steam was blown downwind', centreOf(ID.Steam) === null || centreOf(ID.Steam) > before.steam,
    `steam moved from ${before.steam.toFixed(1)}`);
check('wet mud stayed put', Math.abs(centreOf(ID['Wet Mud']) - before.mud) < 1,
    `wet mud moved from ${before.mud.toFixed(1)} to ${centreOf(ID['Wet Mud']).toFixed(1)}`);
check('stone did not budge', centreOf(ID.Stone) === before.stone,
    `stone moved from ${before.stone.toFixed(1)} to ${centreOf(ID.Stone).toFixed(1)}`);

section('The wind mixes the warm air at the bottom with the cold at the top');
setLayerLapse(6);
setAmbientTarget(20);
for (let y = 2; y < ROWS - 2; y++) setCell(30, y, ID.Stone);
run(2500);
const gapBefore = tempAt(30, ROWS - 4) - tempAt(30, 4);
// Drag the wind up and down the column, stirring as it goes.
for (let sweep = 0; sweep < 60; sweep++) {
    for (let y = 4; y < ROWS - 4; y += 3) applyWind(30, y, 0, sweep % 2 === 0 ? 1 : -1, 6, 4);
    stepSimulation();
}
const gapAfter = tempAt(30, ROWS - 4) - tempAt(30, 4);
check('the layers were stirred together', gapAfter < gapBefore * 0.8,
    `${gapBefore.toFixed(1)} degrees top to bottom before, ${gapAfter.toFixed(1)} after`);
setLayerLapse(2);

section('A stronger wind blows things further');
setLayerLapse(0);
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(20, ROWS - 6, 3, 3, ID.Sand);
const gentleStart = centreOf(ID.Sand);
for (let gust = 0; gust < 20; gust++) {
    applyWind(21, ROWS - 5, 1, 0, 5, 1);
    stepSimulation();
}
const gentleMove = centreOf(ID.Sand) - gentleStart;

clearWorld();
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(20, ROWS - 6, 3, 3, ID.Sand);
const strongStart = centreOf(ID.Sand);
for (let gust = 0; gust < 20; gust++) {
    applyWind(21, ROWS - 5, 1, 0, 5, 8);
    stepSimulation();
}
const strongMove = centreOf(ID.Sand) - strongStart;
check('turning the wind up moves things further', strongMove > gentleMove * 1.15,
    `moved ${gentleMove.toFixed(1)} cells at strength 1, ${strongMove.toFixed(1)} at strength 8`);
setLayerLapse(2);

section('The wind tool blows seeds about and shows where it has been');
setLayerLapse(0);
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
for (let n = 0; n < 12; n++) setCell(18 + n, ROWS - 2, ID['Grass Seeds']);
const seedStart = centreOf(ID['Grass Seeds']);
for (let gust = 0; gust < 60; gust++) {
    applyWind(24, ROWS - 2, 1, 0, 8, 4);
    stepSimulation();
}
check('grass seeds were blown downwind', centreOf(ID['Grass Seeds']) > seedStart + 1,
    `seeds moved from ${seedStart.toFixed(1)} to ${centreOf(ID['Grass Seeds']).toFixed(1)}`);

const trails = getWindTrails();
let litCells = 0;
for (let i = 0; i < trails.length; i++) if (trails[i] > 0) litCells++;
check('the gust left a visible trail behind it', litCells > 20, `${litCells} cells lit`);
for (let f = 0; f < 60; f++) decayWindTrails();
let stillLit = 0;
for (let i = 0; i < trails.length; i++) if (trails[i] > 0) stillLit++;
check('and the trail fades away again', stillLit === 0, `${stillLit} cells still lit`);

// The same heap of sand blown by the same gust three times over: once in the
// open, once with a pane of glass standing in front of it, and once with a
// plant there instead. Each gets a world to itself, because the wind is stopped
// along a whole row and two scenes sharing rows would shelter each other.
function blownSandMoves(putSomethingInTheWay) {
    for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
    fillRect(24, ROWS - 3, 4, 2, ID.Sand);
    if (putSomethingInTheWay) putSomethingInTheWay();
    for (let gust = 0; gust < 60; gust++) {
        applyWind(14, ROWS - 3, 1, 0, 22, 6);
        stepSimulation();
    }
    return centreOf(ID.Sand) - 25.5;
}

section('Solid things stop the wind; plants let it through');
setLayerLapse(0);
const inTheOpen = blownSandMoves(null);

section('Solid things stop the wind (behind glass)');
const behindGlass = blownSandMoves(() => {
    for (let y = ROWS - 6; y < ROWS - 1; y++) setCell(20, y, ID.Glass);
});

section('Solid things stop the wind (behind a plant)');
const behindPlant = blownSandMoves(() => {
    for (let y = ROWS - 6; y < ROWS - 1; y++) setCell(20, y, ID['Banana Plant']);
});

check('sand out in the open was blown along', inTheOpen > 1,
    `it moved ${inTheOpen.toFixed(1)} cells`);
check('a pane of glass in the way stopped the wind dead', behindGlass < 0.5,
    `it moved ${behindGlass.toFixed(1)} cells behind the glass`);
check('a plant in the way let the wind straight through', behindPlant > inTheOpen * 0.5,
    `${behindPlant.toFixed(1)} cells behind the plant against ${inTheOpen.toFixed(1)} in the open`);

section('A sealed box keeps the breeze out');
setLayerLapse(0);
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
// A glass box with loose sand inside it, and the same sand out in the open.
for (let x = 24; x <= 34; x++) { setCell(x, ROWS - 9, ID.Glass); setCell(x, ROWS - 2, ID.Glass); }
for (let y = ROWS - 9; y <= ROWS - 2; y++) { setCell(24, y, ID.Glass); setCell(34, y, ID.Glass); }
fillRect(26, ROWS - 4, 7, 2, ID.Sand);
fillRect(44, ROWS - 3, 7, 2, ID.Sand);

function spilledFrom(fromX, toX) {
    let n = 0;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (typeAt(x, y) === ID.Sand && (x < fromX || x > toX)) n++;
        }
    }
    return n;
}
const boxedBefore = spilledFrom(26, 32);
setAmbientWindOn(true);
run(5000);
setAmbientWindOn(false);

let insideTheBox = 0;
for (let y = ROWS - 8; y <= ROWS - 3; y++) {
    for (let x = 25; x <= 33; x++) if (typeAt(x, y) === ID.Sand) insideTheBox++;
}
check('the sand in the box is all still in the box', insideTheBox === 14,
    `${insideTheBox} of 14 grains still inside`);
check('while the sand in the open got blown about',
    spilledFrom(44, 50) > 0,
    `${spilledFrom(44, 50)} grains left the open heap`);
check('and nothing escaped the box', spilledFrom(26, 32) - boxedBefore >= 0);

section('The natural breeze carries the loose and leaves the wet alone');
setLayerLapse(0);
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
// Two banks side by side on the floor, so that each is only ever answering for
// itself. Stacking one on the other would have the top bank slide as the breeze
// ate the bank underneath it, which says nothing about whether the breeze can
// pick it up.
fillRect(26, ROWS - 3, 8, 2, ID.Sand);
fillRect(44, ROWS - 3, 8, 2, ID['Wet Mud']);
const breezeMudStart = centreOf(ID['Wet Mud']);

// Gusts come from either side as the mood takes them, so over a long enough
// stretch the middle of a sand bank ends up roughly where it started. What
// shows the breeze has been at work is the bank spreading out past the edges it
// was laid down between.
function spilledOutside(id, fromX, toX) {
    let n = 0;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (typeAt(x, y) === id && (x < fromX || x > toX)) n++;
        }
    }
    return n;
}
setAmbientWindOn(true);
let gustFrames = 0;
for (let f = 0; f < 5000; f++) {
    stepSimulation();
    if (isBreezeBlowing()) gustFrames++;
}
setAmbientWindOn(false);
check('gusts came and went rather than blowing without a break',
    gustFrames > 200 && gustFrames < 4000, `${gustFrames} of 5000 frames were gusting`);
check('the breeze carried dry sand off its bank',
    spilledOutside(ID.Sand, 26, 33) > 0,
    `${spilledOutside(ID.Sand, 26, 33)} grains ended up outside the bank`);
check('the breeze left the wet mud where it was',
    Math.abs(centreOf(ID['Wet Mud']) - breezeMudStart) < 0.5,
    `wet mud moved from ${breezeMudStart.toFixed(1)} to ${centreOf(ID['Wet Mud']).toFixed(1)}`);
check('and switching it off stops it', !isBreezeBlowing());

function runWindOverhaulRegressions() {
    section('Persistent wind and travelling gusts share one prevailing direction');
    const windOverhaulApi = typeof physics.setGeneralWindStrength === 'function' &&
        typeof physics.getGeneralWindStrength === 'function' &&
        typeof physics.setGustWindStrength === 'function' &&
        typeof physics.getGustWindStrength === 'function' &&
        typeof physics.getPrevailingWindDirection === 'function' &&
        typeof physics.getPrevailingWindTicksRemaining === 'function' &&
        typeof physics.getActiveGustState === 'function' &&
        typeof physics.windStrengthToLegacyScale === 'function';
    check('the wind overhaul exposes separate strengths, cycle state, gust state, and legacy calibration', windOverhaulApi);

    if (windOverhaulApi) {
        const previousWindState = captureSimulationState();
        const previousWindSeed = getRandomSeed();
        const setWindTestSettings = (general, gust, enabled, seed = 8402) => {
            setAmbientWindOn(false);
            physics.resetRandomSource();
            setRandomSeed(seed);
            physics.setGeneralWindStrength(general);
            physics.setGustWindStrength(gust);
            setAmbientWindOn(enabled);
        };
        const vectorStats = fieldName => {
            const current = getWorld();
            const xs = current?.[`${fieldName}X`];
            const ys = current?.[`${fieldName}Y`];
            if (!xs || !ys || xs.length !== ys.length) return null;
            let total = 0;
            let maximum = 0;
            let active = 0;
            const variations = new Set();
            for (let i = 0; i < xs.length; i++) {
                const magnitude = Math.hypot(xs[i], ys[i]);
                total += magnitude;
                maximum = Math.max(maximum, magnitude);
                if (magnitude > 0.001) {
                    active++;
                    variations.add(magnitude.toFixed(2));
                }
            }
            return { mean: total / xs.length, maximum, active, variations: variations.size };
        };

        try {
            clearWorld();
            setWindTestSettings(0, 0, true);
            run(240);
            const zeroWind = vectorStats('generalWind');
            check('zero General Wind produces no persistent airflow', !!zeroWind && zeroWind.maximum === 0,
                zeroWind ? `maximum ${zeroWind.maximum}` : 'general wind vectors are missing');
            check('zero Gust Strength creates no gust event', physics.getActiveGustState() === null);

            setWindTestSettings(5, 5, true);
            run(120);
            const gentleWind = vectorStats('generalWind');
            const direction = physics.getPrevailingWindDirection();
            const ticksRemaining = physics.getPrevailingWindTicksRemaining();
            check('General Wind has a stable left or right direction', direction === -1 || direction === 1,
                `direction ${direction}`);
            check('the direction cycle lasts approximately thirty minutes', ticksRemaining >= 90000 && ticksRemaining <= 126000,
                `${ticksRemaining} ticks remaining`);
            check('General Wind varies spatially and stays below its configured maximum',
                !!gentleWind && gentleWind.active > 0 && gentleWind.variations > 1 && gentleWind.maximum <= 5.01,
                gentleWind ? `active ${gentleWind.active}, variation buckets ${gentleWind.variations}, maximum ${gentleWind.maximum.toFixed(2)}` : 'general wind vectors are missing');
            run(120);
            check('the prevailing direction stays stable while its timer counts down',
                physics.getPrevailingWindDirection() === direction &&
                physics.getPrevailingWindTicksRemaining() < ticksRemaining);

            setWindTestSettings(20, 20, true);
            run(120);
            const strongerWind = vectorStats('generalWind');
            check('higher General Wind increases average airflow', !!gentleWind && !!strongerWind && strongerWind.mean > gentleWind.mean,
                `mean magnitude ${gentleWind?.mean.toFixed(3)} at 5, ${strongerWind?.mean.toFixed(3)} at 20`);
            check('new strength 50 maps to legacy strength 15', physics.windStrengthToLegacyScale(50) === 15,
                `mapped value ${physics.windStrengthToLegacyScale(50)}`);
            check('combined wind strength above 50 stays linear on the legacy scale',
                physics.windStrengthToLegacyScale(80) === 24,
                `mapped value ${physics.windStrengthToLegacyScale(80)}`);

            clearWorld();
            setWindTestSettings(0, 30, true, 9091);
            let firstGust = null;
            let gustStarts = 0;
            let wasActive = false;
            let travelsWithDirection = false;
            let swirls = false;
            let traverses = false;
            for (let frame = 0; frame < 5000; frame++) {
                stepSimulation();
                const gust = physics.getActiveGustState();
                if (gust && !wasActive) {
                    gustStarts++;
                    if (!firstGust) firstGust = { ...gust };
                }
                if (firstGust && gust) {
                    travelsWithDirection ||= gust.direction === physics.getPrevailingWindDirection();
                    traverses ||= (gust.x - firstGust.x) * gust.direction > 0;
                    swirls ||= getWorld().displayWindY.some(value => Math.abs(value) > 0.01);
                }
                wasActive = !!gust;
            }
            check('gust events arrive more often than the old long-gap schedule', gustStarts >= 12,
                `${gustStarts} gusts started in 5000 ticks`);
            check('gusts travel with the prevailing direction', !!firstGust && travelsWithDirection);
            check('gusts cross the world instead of appearing everywhere at once', !!firstGust && traverses);
            check('gust turbulence produces visible vertical airflow marks', swirls);

            clearWorld();
            createWorld(200, 8);
            setWindTestSettings(0, 30, true, 9091);
            let normalWorldGust = null;
            for (let frame = 0; frame < 1200 && !normalWorldGust; frame++) {
                stepSimulation();
                normalWorldGust = physics.getActiveGustState();
            }
            check('a typical full-width gust takes about three seconds to cross',
                !!normalWorldGust && normalWorldGust.duration >= 120 && normalWorldGust.duration <= 240,
                `${normalWorldGust?.duration ?? 'no gust'} ticks`);

            const cycleEnd = captureSimulationState();
            cycleEnd.prevailingWindTicksRemaining = 1;
            restoreSimulationState(cycleEnd);
            stepSimulation();
            check('the prevailing direction timer is renewed at cycle end',
                physics.getPrevailingWindTicksRemaining() > 1000,
                `${physics.getPrevailingWindTicksRemaining()} ticks after expiry`);

            setWindTestSettings(20, 20, false);
            run(120);
            check('the master Breeze toggle stops new General Wind and gust activity',
                vectorStats('generalWind')?.maximum === 0 && physics.getActiveGustState() === null,
                `general maximum ${vectorStats('generalWind')?.maximum}, active gust ${!!physics.getActiveGustState()}`);
        } finally {
            restoreSimulationState(previousWindState);
            if (previousWindSeed !== null) setRandomSeed(previousWindSeed);
        }
    }
}

runWindOverhaulRegressions();

section('Seeds use powder gravity without a generic buoyancy timer');
clearWorld();
fillRect(0, ROWS - 1, COLS, 1, ID.Wall);
if (ID['Grass Seeds'] !== undefined) {
    for (let y = 3; y < 7; y++) {
        for (let x = 24; x < 33; x++) setCell(x, y, ID['Grass Seeds']);
    }
    run(250);
}
let hangingSeeds = 0;
for (let y = 0; y < ROWS - 1; y++) {
    for (let x = 0; x < COLS; x++) {
        if (typeAt(x, y) === ID['Grass Seeds'] && typeAt(x, y + 1) === EMPTY) hangingSeeds++;
    }
}
check('grass seeds settle instead of remaining suspended', ID['Grass Seeds'] !== undefined && hangingSeeds === 0,
    `${hangingSeeds} seed cells remain unsupported`);

section('Water Grass / Lily requires water and grows its own species');
clearWorld();
fillRect(0, ROWS - 4, COLS, 4, ID['Wet Mud']);
fillRect(4, ROWS - 22, COLS - 8, 18, ID.Water);
if (typeof physics.setAmbientHumidityTarget === 'function' && getWorld().humidity &&
    ID['Water Grass / Lily Seeds'] !== undefined && ID['Water Grass'] !== undefined) {
    physics.setAmbientTarget(22);
    physics.setAmbientHumidityTarget(95);
    getWorld().temp.fill(22);
    getWorld().humidity.fill(95);
    setRandomSeed(6401);
    physics.setRandomSource(() => 0);
    for (const x of [12, 20, 28, 36, 44]) {
        const y = ROWS - 5;
        setCell(x, y, ID['Water Grass / Lily Seeds']);
        // Override placement's default temperature so the first staggered
        // germination check sees the pond's intended warm conditions.
        getWorld().temp[index(x, y)] = 22;
        getWorld().humidity[index(x, y)] = 95;
        // Start the basin regression with sinkers so it exercises submerged
        // germination rather than the independent seed-buoyancy variation.
        getWorld().data[index(x, y)] = 0;
    }
    const aquaticSeedDef = defs[ID['Water Grass / Lily Seeds']];
    check('aquatic sinker seeds are denser than the pond water',
        aquaticSeedDef.density > defs[ID.Water].density,
        `seed density=${aquaticSeedDef.density}, water density=${defs[ID.Water].density}`);
    let peakPadCount = 0;
    let widestPadSpan = 0;
    for (let frame = 0; frame < 2500; frame++) {
        stepSimulation();
        const pads = [];
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
            if (typeAt(x, y) === ID['Water Grass Pad']) pads.push(x);
        }
        peakPadCount = Math.max(peakPadCount, pads.length);
        if (pads.length > 1) widestPadSpan = Math.max(widestPadSpan, Math.max(...pads) - Math.min(...pads));
    }
    check('aquatic seeds germinate into Water Grass over the wet-mud bed', countOf(ID['Water Grass']) > 0,
        `${countOf(ID['Water Grass'])} Water Grass cells from ${countOf(ID['Water Grass / Lily Seeds'])} seeds`);
    check('Water Grass reaches the surface and spreads into floating pads',
        peakPadCount >= 3 && widestPadSpan >= 2,
        `peak pads=${peakPadCount}, span=${widestPadSpan}`);
    check('mature Water Grass pads open into a surface bloom', countOf(ID['Water Grass Bloom']) > 0,
        `${countOf(ID['Water Grass Bloom'])} Water Grass Bloom cells`);
    physics.resetRandomSource();
    setRandomSeed(TEST_SEED);
} else {
    check('aquatic seeds germinate into Water Grass over the wet-mud bed', false,
        'Water Grass seed, plant, or humidity support is missing');
}

section('Acid gives off toxic fumes as it eats');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(18, ROWS - 9, 22, 8, ID.Wood);
fillRect(20, ROWS - 13, 18, 3, ID.Acid);
let peakFumes = 0;
for (let f = 0; f < 400; f++) { stepSimulation(); peakFumes = Math.max(peakFumes, countOf(ID['Toxic Gas'])); }
check('fumes came off the dissolving wood', peakFumes > 10, `${peakFumes} at its thickest`);

section('Toxic fumes rise and spread the way a gas should');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(28, ROWS - 4, 4, 3, ID['Toxic Gas']);
run(150);
let fumeTop = ROWS;
let fumeLeft = COLS;
let fumeRight = -1;
for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
        if (typeAt(x, y) !== ID['Toxic Gas']) continue;
        fumeTop = Math.min(fumeTop, y);
        fumeLeft = Math.min(fumeLeft, x);
        fumeRight = Math.max(fumeRight, x);
    }
}
check('it rose', fumeTop < ROWS - 10, `the top of it reached row ${fumeTop}`);
check('and it spread out sideways as it went', fumeRight - fumeLeft > 8,
    `it spans ${fumeRight - fumeLeft + 1} cells`);

section('Toxic fumes wither plant growth into bare sand');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(0, ROWS - 3, COLS, 2, ID['Wet Mud']);
for (const [x, material] of [[14, 'Grass'], [22, 'Moss'], [30, 'Daffodil'], [38, 'Banana Plant']]) {
    if (ID[material] !== undefined) setCell(x, ROWS - 4, ID[material]);
}
const greenBefore = ['Grass', 'Moss', 'Daffodil', 'Banana Plant']
    .reduce((sum, material) => sum + countOf(ID[material]), 0);
const sandBefore = countOf(ID.Sand);
let fumesReleased = 0;
for (let x = 10; x < 46; x++) {
    for (let y = ROWS - 5; y < ROWS - 3; y++) {
        if (typeAt(x, y) !== EMPTY) continue;
        setCell(x, y, ID['Toxic Gas']);
        fumesReleased++;
    }
}
run(250);
const withered = countOf(ID.Sand) - sandBefore;
check('the fumes killed species plant pixels off', withered > 0 && greenBefore > 0,
    `${withered} cells of green turned to sand, out of ${greenBefore}`);
const greenAfter = ['Grass', 'Moss', 'Daffodil', 'Banana Plant']
    .reduce((sum, material) => sum + countOf(ID[material]), 0);
check('the plant materials are eligible for withering', greenAfter < greenBefore,
    `${greenBefore} -> ${greenAfter} plant pixels`);

section('Named plant material still burns and dissolves in acid');
const plantDamageState = snapshotSimulationState();
const plantDamageSeed = getRandomSeed();
try {
    function plantDamageFixture() {
        createWorld(16, 12);
        setExactAirConditions(22);
        physics.setAmbientHumidityTarget(75);
        physics.setDewpointTarget(10);
        getWorld().humidity.fill(75);
        for (let x = 0; x < 16; x++) setCell(x, 11, ID.Wall);
        fillRect(3, 10, 10, 1, ID['Wet Mud']);
        fillRect(6, 6, 5, 4, ID.Daffodil);
        getWorld().temp.fill(22);
        for (let y = 6; y < 10; y++) for (let x = 6; x < 11; x++) {
            getWorld().data[index(x, y)] = 0;
            getWorld().plantHealth[index(x, y)] = 0.8;
        }
    }

    physics.setRandomSource(() => 0);
    plantDamageFixture();
    const plantBeforeFire = countOf(ID.Daffodil);
    setCell(8, 8, ID.Fire);
    run(120);
    check('fire burns back Daffodil pixels', plantBeforeFire > countOf(ID.Daffodil),
        `${plantBeforeFire} -> ${countOf(ID.Daffodil)} Daffodil cells`);

    plantDamageFixture();
    const plantBeforeAcid = countOf(ID.Daffodil);
    fillRect(6, 4, 5, 2, ID.Acid);
    run(100);
    check('acid dissolves Daffodil pixels', countOf(ID.Daffodil) < plantBeforeAcid,
        `${plantBeforeAcid} -> ${countOf(ID.Daffodil)} Daffodil cells`);
} finally {
    restoreSimulationCheckpoint(plantDamageState, plantDamageSeed);
}

section('Toxic fumes are not used up by what they kill');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(0, ROWS - 3, COLS, 2, ID['Wet Mud']);
for (let x = 12; x < 44; x += 2) {
    if (ID['Banana Plant'] !== undefined) setCell(x, ROWS - 4, ID['Banana Plant']);
}
let released = 0;
for (let x = 12; x < 20; x++) {
    for (let y = ROWS - 5; y < ROWS - 3; y++) {
        if (typeAt(x, y) !== EMPTY) continue;
        setCell(x, y, ID['Toxic Gas']);
        released++;
    }
}
const sandWas = countOf(ID.Sand);
run(120);
check('the gas is still there after doing its work',
    countOf(ID['Toxic Gas']) >= released * 0.5 && countOf(ID.Sand) > sandWas,
    `${released} released, ${countOf(ID['Toxic Gas'])} left, ` +
    `${countOf(ID.Sand) - sandWas} cells withered`);

section('Smoke lingers and eventually settles as ash');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(24, ROWS - 7, 12, 5, ID.Smoke);
const smokeReleased = countOf(ID.Smoke);
run(600);
check('smoke lasts far longer than it used to', countOf(ID.Smoke) === smokeReleased,
    `${smokeReleased} -> ${countOf(ID.Smoke)} smoke after ten seconds`);
run(1800);
check('old smoke leaves ash instead of vanishing', countOf(ID.Ash) > 0,
    `${countOf(ID.Ash)} ash left behind`);

section('Toxic gas lingers and eventually settles as acid');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(24, ROWS - 7, 12, 5, ID['Toxic Gas']);
const toxicReleased = countOf(ID['Toxic Gas']);
run(600);
check('toxic gas remains after ten seconds', countOf(ID['Toxic Gas']) === toxicReleased,
    `${toxicReleased} -> ${countOf(ID['Toxic Gas'])} toxic gas`);
run(2400);
const acidFromGas = countOf(ID.Acid);
check('old toxic gas leaves some acid instead of vanishing', acidFromGas > 0,
    `${acidFromGas} acid left behind`);
check('only a minority of toxic gas becomes acid', acidFromGas < toxicReleased * 0.5,
    `${acidFromGas} acid from ${toxicReleased} toxic gas`);

section('Loose ground does not sort itself into bands');
// Powders weighed against each other used to trade places until they lay in
// order of weight. Poured on top of one another they should simply stay in the
// order they landed in.
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(24, ROWS - 4, 12, 3, ID['Wet Mud']);
fillRect(24, ROWS - 7, 12, 3, ID.Sand);
fillRect(24, ROWS - 10, 12, 3, ID['Dry Mud']);
run(600);

function meanHeightOf(id) {
    let total = 0;
    let count = 0;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) if (typeAt(x, y) === id) { total += y; count++; }
    }
    return count === 0 ? null : total / count;
}
check('the heaviest did not sink to the bottom',
    meanHeightOf(ID['Wet Mud']) > meanHeightOf(ID.Sand) &&
    meanHeightOf(ID.Sand) > meanHeightOf(ID['Dry Mud']),
    `wet mud ${meanHeightOf(ID['Wet Mud']).toFixed(1)}, sand ` +
    `${meanHeightOf(ID.Sand).toFixed(1)}, dry mud ${meanHeightOf(ID['Dry Mud']).toFixed(1)}`);

section('Powders still sink through water, which is a fluid and not a powder');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
fillRect(10, ROWS - 14, 20, 12, ID.Water);
run(150);
fillRect(14, ROWS - 18, 6, 3, ID.Sand);
run(300);
const settledSand = meanHeightOf(ID.Sand) ?? meanHeightOf(ID['Wet Sand']);
check('sand poured into water settled underneath it',
    settledSand !== null && settledSand > meanHeightOf(ID.Water),
    `sand ${settledSand === null ? 'gone' : settledSand.toFixed(1)}, ` +
    `water ${meanHeightOf(ID.Water).toFixed(1)}`);

const ecologyCheckpoint = snapshotSimulationState();
const ecologySeed = getRandomSeed();
try {
section('Eight seed species have distinct picker identities and plant outputs');
const seedNames = [
    'Grass Seeds', 'Moss Spores', 'Daffodil Seeds', 'Red Tulip Seeds',
    'Geranium Seeds', 'Blue Flower Seeds', 'Banana Seeds', 'Water Grass / Lily Seeds'
];
const plantNames = ['Grass', 'Moss', 'Daffodil', 'Red Tulip', 'Geranium', 'Blue Flower', 'Banana Plant', 'Water Grass'];
check('all eight named seeds are registered', seedNames.every(name => ID[name] > 0),
    seedNames.filter(name => !(ID[name] > 0)).join(', ') || '');
check('all seed buttons use the Seeds group and retain powder physics', seedNames.every(name => {
    const definition = defs[ID[name]];
    return definition?.group === 'Seeds' && definition.category === 'powder';
}), seedNames.filter(name => {
    const definition = defs[ID[name]];
    return definition?.group !== 'Seeds' || definition.category !== 'powder';
}).join(', ') || '');
check('the obsolete generic Seed material is absent', !defs.some(definition => definition?.name === 'Seed'));
check('legacy material ID 19 is Grass Seeds', defs[19]?.name === 'Grass Seeds', defs[19]?.name || 'missing ID 19');
check('every requested species has its own plant material', plantNames.every(name => ID[name] > 0),
    plantNames.filter(name => !(ID[name] > 0)).join(', ') || '');
const expectedSeedOutputs = [
    ['Grass Seeds', 'Grass'], ['Moss Spores', 'Moss'], ['Daffodil Seeds', 'Daffodil'],
    ['Red Tulip Seeds', 'Red Tulip'], ['Geranium Seeds', 'Geranium'],
    ['Blue Flower Seeds', 'Blue Flower'], ['Banana Seeds', 'Banana Plant'],
    ['Water Grass / Lily Seeds', 'Water Grass']
];
check('each seed definition targets its matching species plant', expectedSeedOutputs.every(([seed, plant]) => {
    const definition = defs[ID[seed]];
    return definition?.plantSpecies === defs[ID[plant]]?.plantSpecies &&
        definition.sprouts.some(rule => rule.into === ID[plant] || rule.submergedInto === ID[plant]);
}), expectedSeedOutputs.filter(([seed, plant]) => {
    const definition = defs[ID[seed]];
    return !definition?.sprouts.some(rule => rule.into === ID[plant] || rule.submergedInto === ID[plant]);
}).map(([seed]) => seed).join(', ') || '');
check('species definitions retain distinct growth strategies',
    defs[ID.Moss]?.growStyle === 'moss' && defs[ID['Red Tulip']]?.growStyle === 'upright' &&
    defs[ID['Blue Flower']]?.growStyle === 'spindly' && defs[ID['Water Grass']]?.growStyle === 'netting',
    ['Moss', 'Red Tulip', 'Blue Flower', 'Water Grass']
        .map(name => `${name}=${defs[ID[name]]?.growStyle}`).join(', '));

section('Seeds wait for appropriate substrate, temperature and humidity');
const hasHumidityApi = typeof physics.setAmbientHumidityTarget === 'function' &&
    typeof physics.getAmbientHumidityTarget === 'function' && typeof physics.getHumidityAt === 'function';
const hasPlantApi = typeof physics.getPlantHealth === 'function';
check('humidity and plant health query APIs are exposed', hasHumidityApi && hasPlantApi);
check('plant health returns null for a non-plant cell', hasPlantApi && physics.getPlantHealth(0, 0) === null);
if (hasHumidityApi) {
    physics.setAmbientHumidityTarget(-1);
    const lowHumidityClamp = physics.getAmbientHumidityTarget();
    physics.setAmbientHumidityTarget(101);
    const highHumidityClamp = physics.getAmbientHumidityTarget();
    check('base humidity is clamped to the 0–100 percent range', lowHumidityClamp === 0 && highHumidityClamp === 100,
        `${lowHumidityClamp}, ${highHumidityClamp}`);
    physics.setAmbientHumidityTarget(50);
}
if (hasHumidityApi && seedNames.every(name => ID[name] > 0) && plantNames.every(name => ID[name] > 0) &&
    ID['Wet Mud'] && ID['Dry Mud'] && ID['Wet Sand'] && ID['Wet Ash']) {
    function ecologyFixture({ substrate = 'Wet Mud', temp = 22, humidity = 50, seed = 'Grass Seeds' } = {}) {
        createWorld(12, 10);
        physics.setAmbientTarget(temp);
        physics.setAmbientHumidityTarget(humidity);
        const w = getWorld();
        w.temp.fill(temp);
        w.humidity?.fill(humidity);
        for (let x = 0; x < w.cols; x++) setCell(x, w.rows - 1, ID.Wall);
        setCell(5, w.rows - 2, ID[substrate]);
        setCell(5, w.rows - 3, ID[seed]);
        w.temp[index(5, w.rows - 3)] = temp;
        w.humidity[index(5, w.rows - 3)] = humidity;
        return w;
    }
    function placeEcologySeed(x, y, name, temp, humidity) {
        setCell(x, y, ID[name]);
        getWorld().temp[index(x, y)] = temp;
        getWorld().humidity[index(x, y)] = humidity;
    }
    ecologyFixture({ substrate: 'Dry Mud' });
    run(800);
    check('grass seed stays dormant on dry mud', countOf(ID['Grass Seeds']) > 0 && countOf(ID.Grass) === 0,
        `${countOf(ID['Grass Seeds'])} seeds, ${countOf(ID.Grass)} Grass cells`);

    ecologyFixture({ substrate: 'Wet Mud', temp: -20, humidity: 65 });
    for (const x of [4, 5, 6]) placeEcologySeed(x, 7, 'Grass Seeds', -20, 65);
    run(800);
    const dormantColdSeeds = countOf(ID['Grass Seeds']);
    check('cold grass seeds stay viable and dormant', dormantColdSeeds > 0 && countOf(ID.Grass) === 0,
        `${dormantColdSeeds} seeds, ${countOf(ID.Grass)} Grass cells`);
    physics.setAmbientTarget(22);
    physics.setAmbientHumidityTarget(65);
    getWorld().temp.fill(22);
    getWorld().humidity?.fill(65);
    setRandomSeed(7123);
    run(2600);
    check('the same dormant seeds germinate after conditions improve', countOf(ID.Grass) > 0,
        `${countOf(ID.Grass)} Grass cells from ${dormantColdSeeds} dormant seeds`);

    ecologyFixture({ substrate: 'Wet Mud', temp: 30, humidity: 0, seed: 'Banana Seeds' });
    run(1200);
    check('low humidity prevents banana germination', countOf(ID['Banana Plant']) === 0,
        `${countOf(ID['Banana Plant'])} Banana Plant cells`);

    ecologyFixture({ substrate: 'Wet Mud', temp: 22, humidity: 65 });
    for (const x of [4, 5, 6]) placeEcologySeed(x, 7, 'Grass Seeds', 22, 65);
    run(2600);
    check('grass germinates on wet mud in a suitable climate', countOf(ID.Grass) > 0,
        `${countOf(ID.Grass)} Grass cells`);

    const speciesGerminationCases = [
        { seed: 'Daffodil Seeds', plant: 'Daffodil', substrate: 'Wet Mud', temp: 14, humidity: 75 },
        { seed: 'Red Tulip Seeds', plant: 'Red Tulip', substrate: 'Wet Mud', temp: 15, humidity: 78 },
        { seed: 'Geranium Seeds', plant: 'Geranium', substrate: 'Wet Mud', temp: 23, humidity: 60 },
        { seed: 'Blue Flower Seeds', plant: 'Blue Flower', substrate: 'Wet Sand', temp: 16, humidity: 78 },
        { seed: 'Banana Seeds', plant: 'Banana Plant', substrate: 'Wet Mud', temp: 30, humidity: 95 }
    ];
    for (const fixture of speciesGerminationCases) {
        createWorld(16, 12);
        setExactAirConditions(fixture.temp);
        physics.setAmbientHumidityTarget(fixture.humidity);
        physics.setDewpointTarget(10);
        getWorld().humidity.fill(fixture.humidity);
        for (let x = 0; x < 16; x++) setCell(x, 11, ID.Wall);
        setCell(8, 10, ID[fixture.substrate]);
        setCell(8, 9, ID[fixture.seed]);
        getWorld().temp[index(8, 9)] = fixture.temp;
        getWorld().humidity[index(8, 9)] = fixture.humidity;
        setRandomSeed(7100 + ID[fixture.seed]);
        physics.setRandomSource(() => 0);
        let speciesAppeared = false;
        for (let frame = 0; frame < 20; frame++) {
            stepSimulation();
            speciesAppeared ||= countOf(ID[fixture.plant]) > 0;
        }
        check(`${fixture.seed} germinates into ${fixture.plant} in its suitable niche`,
            speciesAppeared,
            `${speciesAppeared ? 'appeared during fixture' : 'not observed'}; final ${countOf(ID[fixture.plant])} ${fixture.plant} cells`);
        setRandomSeed(TEST_SEED);
    }

    createWorld(12, 10);
    setExactAirConditions(16);
    physics.setAmbientTarget(16);
    physics.setAmbientHumidityTarget(20);
    getWorld().humidity.fill(20);
    for (let x = 0; x < 12; x++) setCell(x, 9, ID.Wall);
    setCell(5, 8, ID.Wood);
    placeEcologySeed(4, 8, 'Moss Spores', 16, 20);
    setRandomSeed(7017);
    physics.setRandomSource(() => 0);
    run(40);
    check('Moss Spores wait on wood while local air is too dry',
        countOf(ID['Moss Spores']) > 0 && countOf(ID.Moss) === 0,
        `${countOf(ID['Moss Spores'])} spores, ${countOf(ID.Moss)} Moss`);
    physics.setAmbientHumidityTarget(95);
    getWorld().humidity.fill(95);
    run(40);
    check('damp humid wood lets the same Moss Spores colonize', countOf(ID.Moss) > 0,
        `${countOf(ID.Moss)} Moss cells`);
    setRandomSeed(TEST_SEED);

    createWorld(18, 14);
    setExactAirConditions(30);
    physics.setAmbientTarget(30);
    physics.setAmbientHumidityTarget(95);
    getWorld().humidity.fill(95);
    for (let x = 0; x < 18; x++) setCell(x, 13, ID.Wall);
    fillRect(4, 12, 10, 1, ID['Wet Mud']);
    setCell(9, 11, ID['Banana Plant']);
    getWorld().temp.fill(30);
    setRandomSeed(7022);
    physics.setRandomSource(() => 0);
    run(900);
    let frondLeft = getWorld().cols;
    let frondRight = -1;
    for (let y = 0; y < getWorld().rows; y++) for (let x = 0; x < getWorld().cols; x++) {
        if (typeAt(x, y) !== ID['Banana Plant']) continue;
        frondLeft = Math.min(frondLeft, x);
        frondRight = Math.max(frondRight, x);
    }
    check('thriving Banana Plants grow lateral fronds in warm humid soil',
        countOf(ID['Banana Plant']) > 1 && frondRight > frondLeft,
        `${countOf(ID['Banana Plant'])} cells across ${frondRight - frondLeft + 1} columns`);
    setRandomSeed(TEST_SEED);

    createWorld(42, 16);
    physics.setAmbientTarget(22);
    physics.setAmbientHumidityTarget(80);
    getWorld().temp.fill(22);
    getWorld().humidity?.fill(80);
    for (let x = 0; x < 42; x++) setCell(x, 15, ID.Wall);
    for (const [left, substrate] of [[2, 'Wet Sand'], [15, 'Wet Mud'], [28, 'Wet Ash']]) {
        fillRect(left, 13, 11, 2, ID[substrate]);
        for (const x of [left + 2, left + 5, left + 8]) placeEcologySeed(x, 12, 'Grass Seeds', 22, 80);
    }
    setRandomSeed(6532);
    physics.setRandomSource(() => 0);
    run(3200);
    const grassIn = (left, right) => {
        let total = 0;
        for (let y = 0; y < getWorld().rows; y++) for (let x = left; x < right; x++) {
            if (typeAt(x, y) === ID.Grass) total++;
        }
        return total;
    };
    const sandGrass = grassIn(0, 13);
    const mudGrass = grassIn(13, 27);
    const ashGrass = grassIn(27, 42);
    check('grass grows on wet sand, wet mud and wet ash', sandGrass > 0 && mudGrass > 0 && ashGrass > 0,
        `wet sand=${sandGrass}, wet mud=${mudGrass}, wet ash=${ashGrass}`);
    check('wet mud supports denser grass growth than wet sand', mudGrass > sandGrass,
        `wet mud=${mudGrass}, wet sand=${sandGrass}`);

    createWorld(22, 12);
    physics.setAmbientTarget(15);
    physics.setAmbientHumidityTarget(95);
    getWorld().temp.fill(15);
    getWorld().humidity?.fill(95);
    for (let x = 0; x < 22; x++) setCell(x, 11, ID.Wall);
    for (let y = 5; y <= 9; y++) {
        setCell(5, y, ID.Wood);
        setCell(16, y, ID.Stone);
    }
    for (let y = 5; y <= 8; y += 2) {
        placeEcologySeed(4, y, 'Moss Spores', 15, 95);
        placeEcologySeed(15, y, 'Moss Spores', 15, 95);
    }
    setRandomSeed(8877);
    physics.setRandomSource(() => 0);
    run(3000);
    let woodMoss = 0;
    let stoneMoss = 0;
    for (let y = 0; y < 11; y++) for (let x = 0; x < 22; x++) {
        if (typeAt(x, y) !== ID.Moss) continue;
        if (x <= 10) woodMoss++;
        if (x >= 11) stoneMoss++;
    }
    check('moss colonizes both wood and stone in a cool humid habitat', woodMoss > 0 && stoneMoss > 0,
        `wood=${woodMoss}, stone=${stoneMoss}`);
    setRandomSeed(TEST_SEED);
} else {
    check('grass seed remains viable on dry mud until suitable conditions arrive', false, 'biology API/material definitions are missing');
    check('temperature and humidity gate germination', false, 'biology API/material definitions are missing');
    check('suitable grass conditions allow germination', false, 'biology API/material definitions are missing');
}

section('Plant health responds to species-specific environmental ranges');
if (hasHumidityApi && hasPlantApi && ID.Grass && ID['Banana Plant'] && ID['Wet Mud']) {
    function plantHealthFixture(material, temp, humidity) {
        createWorld(10, 8);
        setExactAirConditions(temp);
        physics.setAmbientTarget(temp);
        physics.setAmbientHumidityTarget(humidity);
        const w = getWorld();
        w.humidity.fill(humidity);
        setCell(4, 7, ID.Wall);
        setCell(4, 6, ID['Wet Mud']);
        setCell(4, 5, ID[material]);
        w.temp.fill(temp);
        return physics.getPlantHealth(4, 5);
    }
    const grassAtTemperate = plantHealthFixture('Grass', 22, 55);
    const bananaAtTemperate = plantHealthFixture('Banana Plant', 22, 55);
    const bananaAtTropical = plantHealthFixture('Banana Plant', 30, 95);
    check('ideal hardy grass reports thriving', grassAtTemperate === 'thriving', grassAtTemperate);
    check('banana is more demanding than grass in temperate ambient air',
        bananaAtTemperate !== 'thriving' && grassAtTemperate !== 'dying',
        `grass=${grassAtTemperate}, banana=${bananaAtTemperate}`);
    check('warm humid conditions improve banana health',
        bananaAtTropical === 'thriving' && bananaAtTropical !== bananaAtTemperate,
        `temperate=${bananaAtTemperate}, tropical=${bananaAtTropical}`);

    const bananaAtNicheBoundary = plantHealthFixture('Banana Plant', 18, 76);
    const bananaAtMargin = plantHealthFixture('Banana Plant', 17.9, 76);
    const bananaAtHostileBoundary = plantHealthFixture('Banana Plant', 5.9, 95);
    check('Banana Plant is thriving at its stated minimum temperature and humidity',
        bananaAtNicheBoundary === 'thriving', bananaAtNicheBoundary);
    check('a small temperature drop moves a Banana Plant into surviving health',
        bananaAtMargin === 'surviving', bananaAtMargin);
    check('temperature below the survival range makes a Banana Plant dying',
        bananaAtHostileBoundary === 'dying', bananaAtHostileBoundary);
    check('plant health queries expose thriving, surviving and dying states',
        new Set([grassAtTemperate, bananaAtMargin, bananaAtHostileBoundary, bananaAtTropical]).size === 3,
        [grassAtTemperate, bananaAtMargin, bananaAtHostileBoundary, bananaAtTropical].join(', '));

    createWorld(12, 10);
    setExactAirConditions(22);
    physics.setAmbientTarget(22);
    physics.setAmbientHumidityTarget(65);
    for (let x = 0; x < 12; x++) setCell(x, 9, ID.Wall);
    setCell(5, 8, ID['Dry Mud']);
    setCell(5, 7, ID.Grass);
    getWorld().temp.fill(22);
    getWorld().humidity.fill(65);
    const grassIndex = index(5, 7);
    getWorld().data[grassIndex] = 1; // Isolate the seed-setting gate from vertical growth.
    getWorld().plantHealth[grassIndex] = 1;
    physics.setRandomSource(() => 0);
    const drySoilHealth = physics.getPlantHealth(5, 7);
    run(40);
    const drySoilSeeds = countOf(ID['Grass Seeds']);
    const drySoilStoredHealth = getWorld().plantHealth[grassIndex];
    check('a Grass Plant below its moistureNeed is unhealthy and cannot reproduce on dry soil',
        defs[ID.Grass]?.moistureNeed > 0 && drySoilHealth === 'dying' &&
        typeAt(5, 7) === ID.Grass && drySoilSeeds === 0,
        `moistureNeed=${defs[ID.Grass]?.moistureNeed}, health=${drySoilHealth}, seeds=${drySoilSeeds}`);

    setCell(5, 8, ID['Wet Mud']);
    getWorld().temp.fill(22);
    getWorld().humidity.fill(65);
    const wetSoilHealth = physics.getPlantHealth(5, 7);
    run(80);
    const wetSoilSeeds = countOf(ID['Grass Seeds']);
    check('wet soil and ideal climate restore Grass health and seed reproduction',
        wetSoilHealth === 'thriving' && getWorld().plantHealth[grassIndex] > drySoilStoredHealth &&
        wetSoilSeeds > drySoilSeeds,
        `health=${drySoilHealth} -> ${wetSoilHealth}, stored=${drySoilStoredHealth.toFixed(2)} -> ${getWorld().plantHealth[grassIndex].toFixed(2)}, seeds=${drySoilSeeds} -> ${wetSoilSeeds}`);
    setRandomSeed(TEST_SEED);

    plantHealthFixture('Banana Plant', 20, 60);
    const initialSeedCount = seedNames.reduce((sum, name) => sum + countOf(ID[name]), 0);
    setRandomSeed(781);
    physics.setRandomSource(() => 0);
    run(2400);
    const afterSeedCount = seedNames.reduce((sum, name) => sum + countOf(ID[name]), 0);
    check('surviving Banana Plants do not reproduce',
        physics.getPlantHealth(4, 5) === 'surviving' && afterSeedCount === initialSeedCount,
        `health=${physics.getPlantHealth(4, 5)}, seeds=${initialSeedCount} -> ${afterSeedCount}`);
    setRandomSeed(TEST_SEED);

    createWorld(10, 8);
    setExactAirConditions(14);
    physics.setAmbientTarget(14);
    physics.setAmbientHumidityTarget(0);
    getWorld().humidity.fill(0);
    setCell(4, 7, ID.Wall);
    setCell(4, 6, ID['Wet Mud']);
    setCell(4, 5, ID.Daffodil);
    getWorld().temp.fill(14);
    getWorld().humidity.fill(0);
    getWorld().plantHealth[index(4, 5)] = 0.5;
    check('an established Daffodil reports dying in dry air',
        physics.getPlantHealth(4, 5) === 'dying', physics.getPlantHealth(4, 5));
    run(260);
    check('sustained dying health removes the plant into dry soil',
        countOf(ID['Dry Mud']) > 0 && countOf(ID.Daffodil) === 0,
        `${countOf(ID['Dry Mud'])} Dry Mud, ${countOf(ID.Daffodil)} Daffodil cells`);

    createWorld(14, 10);
    setExactAirConditions(22);
    physics.setAmbientTarget(22);
    physics.setAmbientHumidityTarget(75);
    getWorld().humidity.fill(75);
    for (let x = 0; x < 14; x++) setCell(x, 9, ID.Wall);
    fillRect(2, 8, 10, 1, ID['Wet Mud']);
    setCell(7, 7, ID.Grass);
    getWorld().temp[index(7, 7)] = 22;
    getWorld().humidity[index(7, 7)] = 75;
    getWorld().plantHealth[index(7, 7)] = 1;
    getWorld().data[index(7, 7)] = 1;
    physics.setRandomSource(() => 0);
    const thrivingGrassExists = physics.getPlantHealth(7, 7) === 'thriving';
    const seedsAtStart = countOf(ID['Grass Seeds']);
    run(100);
    const seedsAfterReproduction = countOf(ID['Grass Seeds']);
    check('thriving grass can reproduce in its preferred habitat',
        thrivingGrassExists && seedsAfterReproduction > seedsAtStart,
        `thriving=${thrivingGrassExists}, seeds=${seedsAtStart} -> ${seedsAfterReproduction}`);
    setRandomSeed(TEST_SEED);
} else {
    check('species health differentiates hardy and tropical niches', false, 'biology API/material definitions are missing');
    check('surviving plants do not reproduce', false, 'biology API/material definitions are missing');
    check('thriving plants can reproduce', false, 'biology API/material definitions are missing');
}

section('Humidity diffuses in open air and remains localized in enclosed chambers');
if (hasHumidityApi && getWorld().humidity) {
    createWorld(28, 14);
    physics.setAmbientHumidityTarget(50);
    getWorld().humidity.fill(50);
    // The left patch is open. The equal-sized right patch is enclosed by Wall.
    for (let y = 2; y <= 8; y++) {
        setCell(16, y, ID.Wall);
        setCell(22, y, ID.Wall);
    }
    for (let x = 16; x <= 22; x++) {
        setCell(x, 2, ID.Wall);
        setCell(x, 8, ID.Wall);
    }
    for (let y = 3; y <= 7; y++) for (let x = 17; x <= 21; x++) getWorld().humidity[index(x, y)] = 90;
    for (let y = 3; y <= 7; y++) for (let x = 3; x <= 7; x++) getWorld().humidity[index(x, y)] = 90;
    const openStart = physics.getHumidityAt(5, 5);
    const closedStart = physics.getHumidityAt(19, 5);
    run(500);
    const openEnd = physics.getHumidityAt(5, 5);
    const closedEnd = physics.getHumidityAt(19, 5);
    check('open humidity drifts back toward the 50 percent baseline', openEnd < openStart && openEnd >= 50,
        `${openStart} -> ${openEnd}`);
    check('closed chamber retains a stronger humidity difference', closedEnd > openEnd,
        `open=${openEnd}, enclosed=${closedEnd}`);

    function humiditySourceSample(material, x) {
        createWorld(18, 12);
        physics.setAmbientHumidityTarget(50);
        getWorld().humidity.fill(50);
        for (let groundX = 0; groundX < 18; groundX++) setCell(groundX, 11, ID.Wall);
        setCell(x, 10, ID[material]);
        run(450);
        return physics.getHumidityAt(x + 1, 10);
    }
    const nearWater = humiditySourceSample('Water', 3);
    const nearSteam = humiditySourceSample('Steam', 3);
    const nearSand = humiditySourceSample('Sand', 3);
    const nearDryMud = humiditySourceSample('Dry Mud', 3);
    check('water and steam add local humidity', nearWater > 50 && nearSteam > 50,
        `water=${nearWater}, steam=${nearSteam}`);
    check('dry sand and dry mud remove local humidity', nearSand < 50 && nearDryMud < 50,
        `sand=${nearSand}, dry mud=${nearDryMud}`);
} else {
    check('humidity diffusion and source/sink behavior are available', false, 'humidity field/API is missing');
}

section('Dewpoint forms sparse upper-air clouds and selects rain or snow');
const hasDewpointApi = typeof physics.setDewpointTarget === 'function' && typeof physics.getDewpointTarget === 'function';
check('dewpoint control exposes a readable target', hasDewpointApi);
if (hasHumidityApi && hasDewpointApi && ID.Cloud !== undefined) {
    physics.setDewpointTarget(-1);
    const lowDewpointClamp = physics.getDewpointTarget();
    physics.setDewpointTarget(101);
    const highDewpointClamp = physics.getDewpointTarget();
    check('dewpoint is clamped to the 0–100 degree range', lowDewpointClamp === 0 && highDewpointClamp === 100,
        `${lowDewpointClamp}, ${highDewpointClamp}`);
    function weatherRun({ airTemp, dewpoint, humidity = 95 }) {
        createWorld(28, 18);
        setExactAirConditions(airTemp);
        physics.setAmbientTarget(airTemp);
        physics.setAmbientHumidityTarget(humidity);
        physics.setDewpointTarget(dewpoint);
        const w = getWorld();
        w.temp.fill(airTemp);
        w.humidity.fill(humidity);
        setRandomSeed(4401);
        let cloudPeak = 0;
        for (let frame = 0; frame < 2400; frame++) {
            stepSimulation();
            cloudPeak = Math.max(cloudPeak, countOf(ID.Cloud));
        }
        return { cloudPeak, rain: countOf(ID.Water), snow: countOf(ID.Snow) };
    }
    const aboveDewpoint = weatherRun({ airTemp: 12, dewpoint: 10 });
    const atDewpoint = weatherRun({ airTemp: 10, dewpoint: 10 });
    const dryAtDewpoint = weatherRun({ airTemp: 8, dewpoint: 10, humidity: 60 });
    const rainy = weatherRun({ airTemp: 8, dewpoint: 10 });
    const freezingBoundary = weatherRun({ airTemp: 0, dewpoint: 10 });
    const snowy = weatherRun({ airTemp: -4, dewpoint: 10 });
    check('air warmer than dewpoint does not form clouds', aboveDewpoint.cloudPeak === 0,
        `${aboveDewpoint.cloudPeak} clouds`);
    check('air exactly at dewpoint forms clouds', atDewpoint.cloudPeak > 0,
        `${atDewpoint.cloudPeak} clouds`);
    check('humid open upper air below dewpoint forms clouds', rainy.cloudPeak > 0 && snowy.cloudPeak > 0,
        `rain climate=${rainy.cloudPeak}, snow climate=${snowy.cloudPeak}`);
    check('dry air below dewpoint does not form clouds', dryAtDewpoint.cloudPeak === 0,
        `${dryAtDewpoint.cloudPeak} clouds`);
    check('cloud precipitation is rain above freezing', rainy.rain > 0,
        `${rainy.rain} Water cells`);
    check('cloud precipitation is snow at/below freezing', snowy.snow > 0,
        `${snowy.snow} Snow cells`);
    check('cloud precipitation at exactly zero degrees is Snow',
        freezingBoundary.snow > 0 && freezingBoundary.rain === 0,
        `${freezingBoundary.snow} Snow, ${freezingBoundary.rain} Water`);

    createWorld(28, 18);
    setExactAirConditions(8);
    physics.setAmbientTarget(8);
    physics.setAmbientHumidityTarget(95);
    physics.setDewpointTarget(10);
    getWorld().temp.fill(8);
    getWorld().humidity.fill(95);
    // Make one enclosed upper-air pocket saturated while leaving the upper sky
    // outside it open and at baseline humidity.
    for (let x = 4; x <= 12; x++) { setCell(x, 1, ID.Wall); setCell(x, 8, ID.Wall); }
    for (let y = 1; y <= 8; y++) { setCell(4, y, ID.Wall); setCell(12, y, ID.Wall); }
    for (let y = 2; y <= 7; y++) for (let x = 5; x <= 11; x++) getWorld().humidity[index(x, y)] = 100;
    setRandomSeed(4401);
    let openClouds = 0;
    let closedClouds = 0;
    for (let frame = 0; frame < 2400; frame++) {
        stepSimulation();
        for (let y = 0; y < 9; y++) for (let x = 0; x < 28; x++) {
            if (typeAt(x, y) !== ID.Cloud) continue;
            if (x >= 5 && x <= 11 && y >= 2 && y <= 7) closedClouds++;
            else openClouds++;
        }
    }
    check('clouds form in open upper air but not enclosed chambers', openClouds > 0 && closedClouds === 0,
        `open=${openClouds}, enclosed=${closedClouds}`);
    setRandomSeed(TEST_SEED);
} else {
    check('dewpoint weather forms clouds and precipitation', false, 'dewpoint API or Cloud material is missing');
}

section('Steam boils from Water, humidifies air, and condenses by weather rather than age');
if (hasHumidityApi && hasDewpointApi && ID.Steam !== undefined && ID.Water !== undefined) {
    createWorld(12, 10);
    physics.setAmbientTarget(120);
    physics.setAmbientHumidityTarget(50);
    physics.setDewpointTarget(10);
    getWorld().temp.fill(120);
    getWorld().humidity.fill(50);
    setCell(5, 5, ID.Water);
    const waterDef = defs[ID.Water];
    getWorld().temp[index(5, 5)] = Math.max(120, waterDef.boilPoint ?? 120);
    getWorld().heat[index(5, 5)] = (waterDef.latent || 0) + 1;
    run(12);
    check('boiling Water still emits Steam', countOf(ID.Steam) > 0, `${countOf(ID.Steam)} Steam cells`);

    createWorld(12, 10);
    physics.setAmbientTarget(20);
    physics.setAmbientHumidityTarget(95);
    physics.setDewpointTarget(20);
    getWorld().temp.fill(20);
    getWorld().humidity.fill(95);
    setCell(5, 5, ID.Steam);
    run(500);
    check('Steam condenses at humid air reaching dewpoint', countOf(ID.Steam) === 0 && countOf(ID.Water) + countOf(ID.Cloud) > 0,
        `steam=${countOf(ID.Steam)}, water=${countOf(ID.Water)}, clouds=${countOf(ID.Cloud)}`);

    createWorld(10, 8);
    physics.setAmbientTarget(25);
    physics.setAmbientHumidityTarget(5);
    physics.setDewpointTarget(0);
    getWorld().temp.fill(25);
    getWorld().humidity.fill(5);
    for (let x = 3; x <= 7; x++) { setCell(x, 2, ID.Wall); setCell(x, 6, ID.Wall); }
    for (let y = 2; y <= 6; y++) { setCell(3, y, ID.Wall); setCell(7, y, ID.Wall); }
    setCell(5, 4, ID.Steam);
    const isolatedSteamCount = countOf(ID.Steam);
    run(1600);
    check('warm dry trapped Steam does not disappear on an age timer', countOf(ID.Steam) === isolatedSteamCount,
        `${isolatedSteamCount} -> ${countOf(ID.Steam)} Steam cells`);
    setRandomSeed(TEST_SEED);
} else {
    check('steam and dewpoint humidity interactions are implemented', false, 'humidity/dewpoint/steam material is missing');
}

section('Corrosion is falling powder, resists ordinary humidity, and melts to Lava');
const corrosionId = ID.Corrosion;
const corrosionDef = defs[corrosionId];
check('Corrosion is registered as powder and melts to Lava',
    corrosionDef?.category === 'powder' && corrosionDef.meltsInto === ID.Lava,
    `category=${corrosionDef?.category}, endpoint=${defs[corrosionDef?.meltsInto]?.name}`);
const taggedCorrodibleMetals = ['Copper', 'Iron', 'Battery', 'Fan', 'Heater', 'Cooler', 'Tubing'];
const untaggedMoltenMetalOutputs = ['Molten Copper', 'Molten Aluminum', 'Molten Iron'];
check('solid corrodible metals are tagged while molten outputs are not',
    taggedCorrodibleMetals.every(name => defs[ID[name]]?.metal === true) &&
    untaggedMoltenMetalOutputs.every(name => defs[ID[name]]?.metal !== true),
    `tagged=${taggedCorrodibleMetals.filter(name => defs[ID[name]]?.metal === true).join(',')}; molten=${untaggedMoltenMetalOutputs.filter(name => defs[ID[name]]?.metal === true).join(',')}`);
if (corrosionId > 0 && hasHumidityApi) {
    createWorld(9, 8);
    setCell(4, 1, corrosionId);
    run(3);
    const fellFrom = (() => { for (let y = 0; y < 8; y++) if (typeAt(4, y) === corrosionId) return y; return -1; })();
    check('unsupported Corrosion falls under powder gravity', fellFrom > 1, `row=${fellFrom}`);

    createWorld(9, 8);
    for (let x = 3; x <= 5; x++) setCell(x, 6, ID.Wall);
    setCell(4, 5, corrosionId);
    run(20);
    check('supported Corrosion stays in place', typeAt(4, 5) === corrosionId,
        defs[typeAt(4, 5)]?.name || 'air');

    function corrosionFixture(humidity) {
        createWorld(9, 8);
        physics.setAmbientHumidityTarget(humidity);
        getWorld().humidity?.fill(humidity);
        getWorld().temp.fill(25);
        setCell(4, 5, ID.Iron);
    }
    physics.setRandomSource(() => 0);
    corrosionFixture(50);
    run(800);
    const ordinaryHumidityCorrosion = countOf(corrosionId);
    corrosionFixture(100);
    run(1600);
    check('ordinary humidity does not rapidly corrode metal', ordinaryHumidityCorrosion === 0,
        `${ordinaryHumidityCorrosion} Corrosion cells`);
    check('persistent saturation can corrode exposed metal', countOf(corrosionId) > 0,
        `${countOf(corrosionId)} Corrosion cells`);
    physics.setRandomSeed(TEST_SEED);
    runCorrosionSourceConversionRegression();

    createWorld(9, 8);
    for (let x = 3; x <= 5; x++) setCell(x, 6, ID.Wall);
    setCell(4, 5, corrosionId);
    const corrosionIndex = index(4, 5);
    if (corrosionDef?.meltPoint !== undefined) {
        getWorld().temp[corrosionIndex] = corrosionDef.meltPoint + 200;
        getWorld().heat[corrosionIndex] = (corrosionDef.latent || 0) + 200;
        run(1);
    }
    check('high-temperature Corrosion becomes Lava', typeAt(4, 5) === ID.Lava || countOf(ID.Lava) > 0,
        `${defs[typeAt(4, 5)]?.name || 'air'} at source cell`);
} else {
    check('corrosion gravity, humidity response and heat conversion are available', false, 'Corrosion or humidity API is missing');
}

section('Humidity, Dewpoint and plant state survive capture and restore');
if (hasHumidityApi && hasDewpointApi && getWorld().humidity) {
    createWorld(10, 8);
    physics.setAmbientHumidityTarget(72);
    physics.setDewpointTarget(14);
    getWorld().humidity.fill(50);
    getWorld().humidity[index(3, 3)] = 87;
    if (ID['Banana Seeds'] !== undefined) setCell(3, 4, ID['Banana Seeds']);
    const saved = snapshotSimulationState();
    check('captured state contains base settings and a typed local humidity field',
        saved.ambientHumidity === 72 && saved.dewpointTarget === 14 &&
        saved.arrays.humidity instanceof Float32Array && saved.arrays.humidity[index(3, 3)] === 87,
        `humidity=${saved.ambientHumidity}, dewpoint=${saved.dewpointTarget}, local=${saved.arrays.humidity?.[index(3, 3)]}`);
    physics.setAmbientHumidityTarget(5);
    physics.setDewpointTarget(0);
    getWorld().humidity[index(3, 3)] = 5;
    restoreSimulationState(saved);
    check('restore preserves humidity targets and cell values',
        physics.getAmbientHumidityTarget() === 72 && physics.getDewpointTarget() === 14 && getWorld().humidity[index(3, 3)] === 87);

    const legacyState = captureSimulationState();
    legacyState.arrays.type[index(3, 4)] = 19;
    delete legacyState.ambientHumidity;
    delete legacyState.dewpointTarget;
    delete legacyState.arrays.humidity;
    restoreSimulationState(legacyState);
    check('legacy saves default missing humidity and dewpoint fields',
        physics.getAmbientHumidityTarget() === 50 && physics.getDewpointTarget() === 10 &&
        getWorld().humidity.every(value => value === 50),
        `base=${physics.getAmbientHumidityTarget()}, dewpoint=${physics.getDewpointTarget()}`);
    check('legacy generic seed ID 19 restores as Grass Seeds',
        ID['Grass Seeds'] === 19 && defs[getWorld().type[index(3, 4)]]?.name === 'Grass Seeds',
        `material at migration fixture is ${defs[getWorld().type[index(3, 4)]]?.name}`);
} else {
    check('environment capture/restore includes local and base humidity', false, 'humidity/dewpoint persistence API is missing');
    check('legacy save fields use documented defaults and seed migration', false, 'humidity/dewpoint persistence API is missing');
}
} finally {
    restoreSimulationCheckpoint(ecologyCheckpoint, ecologySeed);
    setExactAirConditions(20);
    physics.setAmbientTarget(20);
    physics.setAmbientHumidityTarget(50);
    physics.setDewpointTarget(10);
    setLayerLapse(2);
    setAirLayersOn(true);
    setAmbientWindOn(false);
    setRandomSeed(TEST_SEED);
}

// The feature fixtures above create small worlds and tune both climate dials.
// Return the caller to the ordinary simulation baseline before legacy checks.
setExactAirConditions(20);
physics.setAmbientTarget(20);
physics.setAmbientHumidityTarget(50);
physics.setDewpointTarget(10);
setLayerLapse(2);
setAirLayersOn(true);
setAmbientWindOn(false);
setRandomSeed(TEST_SEED);

section('Lava has to land before it can set');
setAmbientTarget(-60);
setLayerLapse(0);
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
// A drip let go from high up in freezing air. It passes the temperature it
// would set at long before it lands.
setCell(30, 2, ID.Lava);
let setInMidAir = false;
for (let f = 0; f < 400; f++) {
    stepSimulation();
    for (let y = 0; y < ROWS - 2; y++) {
        if (typeAt(30, y) === ID.Stone && typeAt(30, y + 1) === EMPTY) setInMidAir = true;
    }
    if (typeAt(30, ROWS - 2) !== EMPTY) break;
}
check('it never turned to stone with nothing underneath it', !setInMidAir);
run(900);
// It may have crept a cell or two along the floor before it set.
let stoneOnFloor = 0;
for (let x = 0; x < COLS; x++) if (typeAt(x, ROWS - 2) === ID.Stone) stoneOnFloor++;
check('and it set once it had landed', stoneOnFloor > 0 && countOf(ID.Lava) === 0,
    `${stoneOnFloor} stone on the floor, ${countOf(ID.Lava)} lava left`);
setAmbientTarget(20);
setLayerLapse(2);

section('Air layering can be switched off');
setLayerLapse(6);
setAmbientTarget(20);
run(1200);
const layeredGap = getAirTempAt(ROWS - 1) - getAirTempAt(0);
check('layered air is warmer at the bottom than the top', layeredGap > 10,
    `${layeredGap.toFixed(1)} degrees between floor and ceiling`);

setAirLayersOn(false);
check('switching layers off makes the air even everywhere',
    getAirTempAt(0) === getAirTempAt(ROWS - 1),
    `${getAirTempAt(0).toFixed(1)} at the top, ${getAirTempAt(ROWS - 1).toFixed(1)} at the bottom`);

setAirLayersOn(true);
check('and switching it back on leaves the slider setting where it was',
    getLayerLapse() === 6 && getAirTempAt(ROWS - 1) - getAirTempAt(0) === layeredGap);
setLayerLapse(2);

section('Grass remains a distinct species on its wet sand substrate');
for (let x = 0; x < COLS; x++) setCell(x, ROWS - 1, ID.Wall);
setCell(20, ROWS - 2, ID['Wet Sand']);
if (ID.Grass !== undefined) setCell(20, ROWS - 3, ID.Grass);
run(600);
check('grass can remain established on wet sand', ID.Grass !== undefined && countOf(ID.Grass) > 0,
    `${countOf(ID.Grass)} grass cells`);
check('grass does not transform into a different generic Plant material',
    ID['Banana Plant'] === undefined || countOf(ID['Banana Plant']) === 0,
    `${countOf(ID['Banana Plant'])} Banana Plant cells`);

// ---------------------------------------------------------------------------

section('A lower-left Fan feeds Ash into a diagonal Powder Storage Bin');
const fedBinX = 36;
const fedBinY = 12;
const fedDirection = 4; // up-right
setCell(fedBinX, fedBinY, ID['Powder Storage Bin']);
getWorld().data[index(fedBinX, fedBinY)] = fedDirection;
const fedFanX = 18;
const fedFanY = 30;
setCell(fedFanX, fedFanY, ID.Fan);
getWorld().data[index(fedFanX, fedFanY)] = fedDirection;
getWorld().power[index(fedFanX, fedFanY)] = 255;
getWorld().machineSetting[index(fedFanX, fedFanY)] = 20;
// These start outside the icon and its rear-edge barrier, on the Fan's exact
// lower-left to upper-right centreline. This reproduces the diagonal failure
// that a particle placed beside the machine cannot exercise.
for (const [x, y] of [[24, 24], [26, 22], [28, 20]]) setCell(x, y, ID.Ash);
run(20);
check('all Ash fired up-right at 45 degrees crosses the intake and is stored',
    getStorageInventory(fedBinX, fedBinY)?.type === ID.Ash &&
    getStorageInventory(fedBinX, fedBinY)?.count === 3,
    `${getStorageInventory(fedBinX, fedBinY)?.count ?? 0}/3 Ash stored`);

clearWorld();
const wrongSideBinX = 30;
const wrongSideBinY = 22;
setCell(wrongSideBinX, wrongSideBinY, ID['Powder Storage Bin']);
getWorld().data[index(wrongSideBinX, wrongSideBinY)] = 2; // entrance points up
setCell(wrongSideBinX, wrongSideBinY - 2, ID.Ash); // falls from the front
stepSimulation();
check('powder arriving from the front of an upside-down bin is refused',
    getStorageInventory(wrongSideBinX, wrongSideBinY)?.count === 0);

clearWorld();
const suctionBinX = 30;
const suctionBinY = 22;
setCell(suctionBinX, suctionBinY, ID['Liquid Storage Bin']);
getWorld().data[index(suctionBinX, suctionBinY)] = 3; // intake is above the bin
// The virtual barrier is one row above the bin. These two packed Water cells
// are in its two-cell suction zone and have no movement history or free row to
// drop into before the storage pass runs.
setCell(suctionBinX, suctionBinY - 2, ID.Water);
setCell(suctionBinX, suctionBinY - 3, ID.Water);
stepSimulation();
check('a storage intake pulls two rows of stationary packed Water into the bin',
    getStorageInventory(suctionBinX, suctionBinY)?.type === ID.Water &&
    getStorageInventory(suctionBinX, suctionBinY)?.count === 2,
    `${getStorageInventory(suctionBinX, suctionBinY)?.count ?? 0}/2 Water stored`);

clearWorld();
setCell(suctionBinX, suctionBinY, ID['Powder Storage Bin']);
getWorld().data[index(suctionBinX, suctionBinY)] = 3;
setCell(suctionBinX, suctionBinY - 2, ID.Water); // wrong type nearest the intake
setCell(suctionBinX, suctionBinY - 3, ID.Ash);   // valid type behind the blockage
stepSimulation();
check('storage suction neither accepts nor reaches through a wrong particle',
    getStorageInventory(suctionBinX, suctionBinY)?.count === 0);

// ---------------------------------------------------------------------------

section('Tubing transfers stored material through a measured bottleneck');
clearWorld();
const tubeSourceX = 10;
const tubeY = 20;
const ventX = 30;
setCell(tubeSourceX, tubeY, ID['Powder Storage Bin']);
setCell(ventX, tubeY, ID.Vent);
setVentReleaseEnabled(ventX, tubeY, false);
for (let x = tubeSourceX + 1; x < ventX; x++) {
    for (let y = tubeY - 1; y <= tubeY + 1; y++) setCell(x, y, ID.Tubing);
}
const tubeSource = index(tubeSourceX, tubeY);
getWorld().storageType[tubeSource] = ID.Ash;
getWorld().storageCount[tubeSource] = 120;
run(60);
check('three-cell-wide Tubing transfers 30 particles per second',
    getStorageInventory(tubeSourceX, tubeY)?.count === 90 &&
    getVentInventory(ventX, tubeY)?.type === ID.Ash &&
    getVentInventory(ventX, tubeY)?.count === 30 &&
    getTubingFlows()[0]?.rate === 30,
    `${getStorageInventory(tubeSourceX, tubeY)?.count ?? 0} source, ${getVentInventory(ventX, tubeY)?.count ?? 0} vent, ${getTubingFlows()[0]?.rate ?? 0}/s`);
check('Tubing flow bands are restricted to actual Tubing cells',
    getTubingFlows()[0]?.cells.length > 0 &&
    getTubingFlows()[0]?.path.length > 0 &&
    getTubingFlows()[0]?.path.every(cell => getWorld().type[cell] === ID.Tubing),
    JSON.stringify(getTubingFlows()[0]?.path ?? []));

// Pinch the lower row out of the three-cell-wide run. The remaining channel
// is still continuous but only two cells wide at that point, so it must cap
// the whole route at 20/s rather than using the wide end measurement.
getWorld().type[index(20, tubeY + 1)] = EMPTY;
run(60);
check('the narrowest two-cell Tubing section limits flow to 20 particles per second',
    getStorageInventory(tubeSourceX, tubeY)?.count === 70 &&
    getVentInventory(ventX, tubeY)?.count === 50 &&
    getTubingFlows()[0]?.rate === 20,
    `${getStorageInventory(tubeSourceX, tubeY)?.count ?? 0} source, ${getVentInventory(ventX, tubeY)?.count ?? 0} vent, ${getTubingFlows()[0]?.rate ?? 0}/s`);
check('Tubing flow bands update after a bottleneck changes',
    getTubingFlows()[0]?.path.every(cell => getWorld().type[cell] === ID.Tubing),
    JSON.stringify(getTubingFlows()[0]?.path ?? []));
check('Tubing is an explicitly non-conductive material',
    defs[ID.Tubing].tubing && !defs[ID.Tubing].conductive && defs[ID.Tubing].conductivity === 0);

clearWorld();
const bendSourceX = 10;
const bendSourceY = 19;
const bendTubeEndX = 20;
const bendVentY = 35;
setCell(bendSourceX, bendSourceY, ID['Powder Storage Bin']);
setCell(bendTubeEndX, bendVentY, ID.Vent);
setVentReleaseEnabled(bendTubeEndX, bendVentY, false);
for (let x = bendSourceX + 1; x <= bendTubeEndX; x++) {
    for (let y = bendSourceY; y <= bendSourceY + 2; y++) setCell(x, y, ID.Tubing);
}
for (let x = bendTubeEndX - 1; x <= bendTubeEndX + 1; x++) {
    for (let y = bendSourceY + 2; y < bendVentY; y++) setCell(x, y, ID.Tubing);
}
const bendSource = index(bendSourceX, bendSourceY);
getWorld().storageType[bendSource] = ID.Ash;
getWorld().storageCount[bendSource] = 60;
run(60);
const bendFlowPath = getTubingFlows()[0]?.path ?? [];
check('Tubing bands travel from source to destination through real bend cells',
    bendFlowPath.length > 0 && bendFlowPath.every(cell => getWorld().type[cell] === ID.Tubing),
    JSON.stringify(bendFlowPath));

clearWorld();
setCell(40, 20, ID.Vent);
const releasingVent = index(40, 20);
getWorld().storageType[releasingVent] = ID.Water;
getWorld().storageCount[releasingVent] = 20;
check('an unconnected Vent reports no Tubing rate', getVentTubingRate(40, 20) === 0,
    `${getVentTubingRate(40, 20)}/s`);
check('new Vents default to a release rate of 10 particles per second',
    getVentReleaseRate(40, 20) === 10 && getVentInventory(40, 20)?.releaseRate === 10);
run(60);
check('an enabled Vent releases at its configured rate',
    getVentInventory(40, 20)?.releaseEnabled && getVentInventory(40, 20)?.count === 10 &&
    countOf(ID.Water) === 10,
    `${getVentInventory(40, 20)?.count ?? 0} stored, ${countOf(ID.Water)} released`);

clearWorld();
const throttledSourceX = 10;
const throttledVentX = 30;
const throttledY = 20;
setCell(throttledSourceX, throttledY, ID['Powder Storage Bin']);
setCell(throttledVentX, throttledY, ID.Vent);
for (let x = throttledSourceX + 1; x < throttledVentX; x++) {
    for (let y = throttledY - 1; y <= throttledY + 1; y++) setCell(x, y, ID.Tubing);
}
check('a connected Vent reports its Tubing capacity', getVentTubingRate(throttledVentX, throttledY) === 30,
    `${getVentTubingRate(throttledVentX, throttledY)}/s`);
const throttledSource = index(throttledSourceX, throttledY);
getWorld().storageType[throttledSource] = ID.Ash;
getWorld().storageCount[throttledSource] = 400;
run(600);
check('a faster Tubing path fills an active Vent before its release rate throttles flow',
    getVentInventory(throttledVentX, throttledY)?.count >= 99 &&
    getTubingFlows()[0]?.rate === 10,
    `${getVentInventory(throttledVentX, throttledY)?.count ?? 0} stored, ${getTubingFlows()[0]?.rate ?? 0}/s`);

setVentReleaseRate(throttledVentX, throttledY, 40);
run(120);
check('a faster Vent release setting does not exceed the connected Tubing rate',
    getVentReleaseRate(throttledVentX, throttledY) === 40 &&
    getTubingFlows()[0]?.rate === 30,
    `${getVentReleaseRate(throttledVentX, throttledY)}/s setting, ${getTubingFlows()[0]?.rate ?? 0}/s tube`);

clearWorld();
setCell(tubeSourceX, tubeY, ID['Powder Storage Bin']);
setCell(ventX, tubeY, ID.Vent);
setVentReleaseEnabled(ventX, tubeY, false);
for (let x = tubeSourceX + 1; x < ventX; x++) setCell(x, tubeY, ID.Tubing);
getWorld().storageType[index(tubeSourceX, tubeY)] = ID.Ash;
getWorld().storageCount[index(tubeSourceX, tubeY)] = 10;
getWorld().storageType[index(ventX, tubeY)] = ID.Ash;
getWorld().storageCount[index(ventX, tubeY)] = 100;
stepSimulation();
check('a full switched-off Vent cuts connected Tubing flow to 0',
    getStorageInventory(tubeSourceX, tubeY)?.count === 10 && getTubingFlows().length === 0);

section('A Mixer accepts two independent Tubing inputs and alternates its output');
clearWorld();
const mixerX = 30;
const mixerY = 30;
const mixerIndex = index(mixerX, mixerY);
const leftSourceX = 20;
const rightSourceX = 40;
setCell(leftSourceX, mixerY, ID['Powder Storage Bin']);
    setCell(rightSourceX, mixerY, ID['Powder Storage Bin']);
setCell(mixerX, mixerY, ID.Mixer);
setMixerReleaseEnabled(mixerX, mixerY, false);
for (let x = leftSourceX + 1; x < mixerX; x++) setCell(x, mixerY, ID.Tubing);
for (let x = mixerX + 1; x < rightSourceX; x++) setCell(x, mixerY, ID.Tubing);
const leftSource = index(leftSourceX, mixerY);
const rightSource = index(rightSourceX, mixerY);
getWorld().storageType[leftSource] = ID.Sand;
getWorld().storageCount[leftSource] = 120;
    getWorld().storageType[rightSource] = ID.Ash;
getWorld().storageCount[rightSource] = 120;
run(60);
const mixer = getMixerInventory(mixerX, mixerY);
check('Mixer keeps its two disconnected Tubing inputs separate',
    mixer?.output.types[0] === ID.Sand && mixer?.output.types[1] === ID.Ash &&
    mixer.output.counts[0] > 0 && mixer.output.counts[1] > 0,
    JSON.stringify(mixer?.output));
check('Mixer accepts two Tubing entities touching the same machine',
    getTubingFlows().filter(flow => flow.destination === mixerIndex).length === 2,
    `${getTubingFlows().length} active flows`);
run(120);
const fullMixer = getMixerInventory(mixerX, mixerY);
check('Mixer output bin stores mixed material while release is off',
    fullMixer?.output.counts[0] > 0 && fullMixer?.output.counts[1] > 0 &&
    fullMixer.output.counts[0] + fullMixer.output.counts[1] <= 1000,
    JSON.stringify(fullMixer?.output));
purgeMixerBin(mixerX, mixerY, 0);
check('purging Mixer input one resets only that input',
    getMixerInventory(mixerX, mixerY)?.bins[0].count === 0 &&
    getMixerInventory(mixerX, mixerY)?.output.counts[1] > 0);
setMixerReleaseEnabled(mixerX, mixerY, true);
const releasedBefore = countOf(ID.Sand) + countOf(ID.Water);
run(600);
check('Mixer releases its mixed output at a fixed rate',
    countOf(ID.Sand) + countOf(ID.Water) > releasedBefore,
    JSON.stringify(getMixerInventory(mixerX, mixerY)?.output));

clearWorld();
setCell(30, 30, ID.Mixer);
setMixerReleaseEnabled(30, 30, true);
const sequenceMixer = index(30, 30);
getWorld().mixerInputTypeA[sequenceMixer] = ID.Sand;
getWorld().mixerInputCountA[sequenceMixer] = 6;
    getWorld().mixerInputTypeB[sequenceMixer] = ID.Ash;
getWorld().mixerInputCountB[sequenceMixer] = 6;
const emitted = [];
for (let frame = 0; frame < 720; frame++) {
    stepSimulation();
    const output = getWorld().type[index(30, 32)];
    if (output !== EMPTY) {
        emitted.push(output);
        getWorld().type[index(30, 32)] = EMPTY;
    }
}
check('Mixer emits strict alternating output from the third bin',
    emitted.length >= 4 && emitted.slice(0, 6).every((id, index) => id === (index & 1 ? ID.Ash : ID.Sand)),
    JSON.stringify(emitted.slice(0, 6)));

clearWorld();
setCell(30, 30, ID.Mixer);
setMixerReleaseEnabled(30, 30, false);
const mixedMixer = index(30, 30);
getWorld().mixerInputTypeA[mixedMixer] = ID.Sand;
getWorld().mixerInputCountA[mixedMixer] = 2;
getWorld().mixerInputTypeB[mixedMixer] = ID.Water;
getWorld().mixerInputCountB[mixedMixer] = 2;
run(15);
const mixedInventory = getMixerInventory(30, 30);
check('Mixer combines Sand and Water into Wet Sand',
    mixedInventory?.output.types[0] === ID['Wet Sand'] &&
    mixedInventory.output.counts[0] === 1 && mixedInventory.output.counts[1] === 0 &&
    mixedInventory.bins[0].count === 1 && mixedInventory.bins[1].count === 1,
    JSON.stringify(mixedInventory));

clearWorld();
setCell(30, 30, ID.Mixer);
setMixerReleaseEnabled(30, 30, false);
const mudMixer = index(30, 30);
getWorld().mixerInputTypeA[mudMixer] = ID.Water;
getWorld().mixerInputCountA[mudMixer] = 2;
getWorld().mixerInputTypeB[mudMixer] = ID['Dry Mud'];
getWorld().mixerInputCountB[mudMixer] = 2;
run(15);
const mudInventory = getMixerInventory(30, 30);
check('Mixer combines Water and Dry Mud into Wet Mud',
    mudInventory?.output.types[0] === ID['Wet Mud'] &&
    mudInventory.output.counts[0] === 1 && mudInventory.output.counts[1] === 0,
    JSON.stringify(mudInventory));

clearWorld();
setCell(30, 30, ID.Mixer);
setMixerReleaseEnabled(30, 30, false);
const sameMaterialMixer = index(30, 30);
getWorld().mixerInputTypeA[sameMaterialMixer] = ID.Water;
getWorld().mixerInputCountA[sameMaterialMixer] = 20;
getWorld().mixerInputTypeB[sameMaterialMixer] = ID.Water;
getWorld().mixerInputCountB[sameMaterialMixer] = 20;
stepSimulation();
const sameMaterialBefore = getMixerInventory(30, 30);
const sameMaterialCount = sameMaterialBefore.output.counts[0] + sameMaterialBefore.output.counts[1];
run(60);
const sameMaterialAfter = getMixerInventory(30, 30);
check('Mixer coalesces identical Water inputs while release is off',
    sameMaterialAfter?.output.types[0] === ID.Water &&
    sameMaterialAfter.output.types[1] === EMPTY &&
    sameMaterialAfter.output.counts[0] >= sameMaterialCount,
    JSON.stringify(sameMaterialAfter?.output));

clearWorld();
setCell(30, 30, ID.Mixer);
setMixerReleaseEnabled(30, 30, false);
const stagedMixer = index(30, 30);
getWorld().mixerInputTypeB[stagedMixer] = ID['Dry Mud'];
getWorld().mixerInputCountB[stagedMixer] = 3;
stepSimulation();
getWorld().mixerInputTypeA[stagedMixer] = ID.Water;
getWorld().mixerInputCountA[stagedMixer] = 3;
run(15);
const stagedInventory = getMixerInventory(30, 30);
check('Mixer preserves a lone Dry Mud output until Water can form Wet Mud',
    stagedInventory?.output.types[0] === ID['Wet Mud'] &&
    stagedInventory.output.types[1] === EMPTY &&
    stagedInventory.output.counts[0] > 0,
    JSON.stringify(stagedInventory));

section('Extreme heat evaporates gases and melts ash');
clearWorld();
fillRect(20, 20, 8, 4, ID.Ash);
getWorld().temp.fill(1000);
run(120);
check('high heat melts Ash into Lava', countOf(ID.Ash) === 0 && countOf(ID.Lava) > 0,
    `${countOf(ID.Ash)} ash, ${countOf(ID.Lava)} lava`);

for (const [name, label] of [[ID.Steam, 'steam'], [ID.Smoke, 'smoke'], [ID['Toxic Gas'], 'toxic gas']]) {
    clearWorld();
    fillRect(20, 20, 8, 4, name);
    getWorld().temp.fill(3200);
    run(10);
    check(`${label} evaporates above 3000C`, countOf(name) === 0, `${countOf(name)} ${label}`);
}

// ---------------------------------------------------------------------------

console.log('\nSpeed (260 x 150 wide grid)');
createWorld(260, 150);
for (let y = 60; y < 150; y++) {
    for (let x = 0; x < 260; x++) {
        setCell(x, y, (x + y) % 3 === 0 ? ID.Sand : ID.Water);
    }
}
fillRect(80, 40, 20, 8, ID.Fire);
const started = process.hrtime.bigint();
run(200);
const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
const perFrame = elapsedMs / 200;
console.log(`  ${perFrame.toFixed(2)} ms per frame  (diagnostic only; 60fps budget is 16.7 ms)`);

// Keep the thermal-chamber regressions in the normal project suite as well as
// the focused `npm test -- --focus=thermal-chamber` path. Run them last so
// their ambient settings and random draws cannot affect unrelated sections.
if (!process.argv.includes('--focus=thermal-chamber')) runThermalChamberRegressions();

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
