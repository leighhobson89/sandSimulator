import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { GamePage } from '../e2e/helpers/gamePage.mjs';
import { canvasPoint, expectCanvasVisible } from '../e2e/helpers/canvas.mjs';

const fullScaleRun = process.env.P0_PERFORMANCE_SCOPE === 'all';
const sizes = [
    { cols: 260, rows: 150, label: '260 × 150' },
    { cols: 520, rows: 300, label: '520 × 300' }
].filter(size => fullScaleRun || size.cols === 260);
const scenarios = [
    'empty-control',
    'particle-baseline',
    'ordinary-spark',
    'battery-lamp',
    'combined',
    'gate-chain',
    'battery-hover',
    'ambient-visibility-edit',
    'ambient-open',
    'ambient-occlusion-dense',
    'air-calm',
    'air-driven'
];
const warmupSamples = 10;
const measuredSamples = 60;
const seed = 0;
const hookNames = [
    'stepSimulation',
    'updateElectricalPower',
    'electricalTopologyRefresh',
    'ordinarySparkPropagation',
    'batteryLoadTraversal',
    'logicalGateSolve',
    'ambientIlluminationFullBuild',
    'ambientIlluminationIncrementalUpdate',
    'ambientIlluminationSliderRemap',
    'hoverHitTest',
    'updateFeedback',
    'drawWorld',
    'machineOverlayRebuild',
    'machineOverlayReuse',
    'electricalStatusOverlay',
    'illuminationLayer',
    'airScalarTransport'
];

function summarize(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return {
        samples: values.length,
        medianMs: sorted.length % 2 === 0
            ? (sorted[middle - 1] + sorted[middle]) / 2
            : sorted[middle],
        p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
        meanMs: values.reduce((sum, value) => sum + value, 0) / values.length
    };
}

function summarizeHooks(events) {
    const grouped = Object.fromEntries(hookNames.map(name => [name, []]));
    for (const event of events) {
        if (grouped[event.name] && Number.isFinite(event.durationMs)) {
            grouped[event.name].push(event.durationMs);
        }
    }
    return Object.fromEntries(Object.entries(grouped).map(([name, durations]) => [
        name,
        durations.length ? summarize(durations) : null
    ]));
}

function summarizeHookCounters(events) {
    const grouped = {};
    for (const event of events) {
        for (const [name, value] of Object.entries(event.counters || {})) {
            if (!Number.isFinite(value)) continue;
            const values = grouped[event.name] ||= {};
            (values[name] ||= []).push(value);
        }
    }
    return Object.fromEntries(Object.entries(grouped).map(([hook, counters]) => [
        hook,
        Object.fromEntries(Object.entries(counters).map(([name, values]) => [name, summarize(values)]))
    ]));
}

function sumHookCounter(events, hookName, counterName) {
    return events.filter(event => event.name === hookName).reduce((sum, event) =>
        sum + Number(event.counters?.[counterName] || 0), 0);
}

function summarizeAirCadence(events) {
    const airEvents = events.filter(event => event.name === 'airScalarTransport');
    const flags = airEvents.map(event => event.counters?.ran);
    const runIndices = flags.flatMap((ran, index) => ran === 1 ? [index] : []);
    const intervals = [...new Set(airEvents.map(event => event.counters?.intervalTicks)
        .filter(Number.isFinite))];
    const runCount = flags.filter(ran => ran === 1).length;
    const skipCount = flags.filter(ran => ran === 0).length;
    return {
        runs: runCount,
        skips: skipCount,
        eventCount: airEvents.length,
        intervalTicks: intervals.length === 1 ? intervals[0] : 0,
        alternates: flags.length === airEvents.length && flags.every((ran, index) =>
            index === 0 || ran !== flags[index - 1]),
        runEventsTwoCallsApart: runIndices.every((eventIndex, index) =>
            index === 0 || eventIndex - runIndices[index - 1] === 2)
    };
}

function csvCell(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function commitId() {
    try {
        return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
    } catch {
        return 'unavailable';
    }
}

function workingTreeStatus() {
    try {
        const porcelain = execFileSync('git', ['status', '--porcelain=v1'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
        return {
            dirty: porcelain.length > 0,
            entries: porcelain ? porcelain.split(/\r?\n/) : []
        };
    } catch {
        return { dirty: null, entries: null };
    }
}

async function startBenchmarkWorld(page, worldSize) {
    const game = new GamePage(page);
    await game.openMenu();
    await page.getByRole('button', { name: 'New Game', exact: true }).click();
    const sizeDialog = page.locator('#worldSizeDialog');
    if (await sizeDialog.isVisible()) {
        if (worldSize.includes('520')) {
            page.setDefaultTimeout(120_000);
        }
        await sizeDialog.getByRole('radio', { name: worldSize, exact: true }).check();
        await sizeDialog.getByRole('button', { name: 'Start Game', exact: true }).click();
    }
    const autosaveChoice = page.locator('#autosaveChoiceDialog');
    if (await autosaveChoice.isVisible()) {
        await page.getByRole('button', { name: 'No, play without autosave', exact: true }).click();
    }
    await expectCanvasVisible(page);
    await page.getByRole('button', { name: 'Pause' }).click();
}

async function prepareFixture(page, scenario, size) {
    return page.evaluate(async ({ scenario, cols, rows, seed }) => {
        const physics = await import('/physics.js');
        const game = await import('/game.js');
        const definitions = physics.getDefinitions();
        const id = name => definitions.findIndex(definition => definition?.name === name);
        const initialWorld = physics.getWorld();
        if (!initialWorld || initialWorld.cols !== cols || initialWorld.rows !== rows) {
            throw new Error(`Expected ${cols}x${rows} world; found ${initialWorld?.cols}x${initialWorld?.rows}`);
        }
        const ids = Object.fromEntries(['Sand', 'Water', 'Fire', 'Elec', 'Copper', 'Spark', 'Battery', 'Lamp', 'Wall', 'Glass', 'Steam', 'Fan', 'Heater', 'Insulation']
            .map(name => [name, id(name)]));
        if (Object.values(ids).some(value => value <= 0)) {
            throw new Error(`Required benchmark material is missing: ${JSON.stringify(ids)}`);
        }

        window.__P0_PERF__ = {
            enabled: true,
            events: [],
            record(name, durationMs, counters = {}) {
                if (!this.enabled) return;
                this.events.push({ name, durationMs, counters });
            },
            reset() { this.events.length = 0; },
            snapshot() { return this.events.slice(); }
        };
        const hasAmbientProfile = scenario === 'ambient-open' || scenario === 'ambient-occlusion-dense';
        if (scenario === 'ambient-visibility-edit' || hasAmbientProfile) {
            // Start this fixture with an unbuilt ambient cache so setup captures
            // the one-time full-build cost before the repeated edit samples.
            physics.createWorld(cols, rows);
        }
        const world = physics.getWorld();
        physics.clearWorld();
        physics.setRandomSeed(seed);

        const countScale = !['empty-control', 'ambient-open', 'ambient-occlusion-dense', 'air-calm', 'air-driven'].includes(scenario);
        if (countScale) {
            const firstFilledRow = Math.floor(rows * 0.4);
            for (let y = firstFilledRow; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    physics.setCell(x, y, (x + y) % 3 === 0 ? ids.Sand : ids.Water);
                }
            }
            const fireX = Math.floor(cols * (80 / 260));
            const fireY = Math.floor(rows * (40 / 150));
            const fireWidth = Math.max(1, Math.round(cols * (20 / 260)));
            const fireHeight = Math.max(1, Math.round(rows * (8 / 150)));
            for (let y = fireY; y < Math.min(rows, fireY + fireHeight); y++) {
                for (let x = fireX; x < Math.min(cols, fireX + fireWidth); x++) {
                    physics.setCell(x, y, ids.Fire);
                }
            }
        }

        const wantsSpark = scenario === 'ordinary-spark' || scenario === 'combined';
        const wantsBattery = scenario === 'battery-lamp' || scenario === 'combined' ||
            scenario === 'battery-hover';
        let sparkSeed = null;
        let battery = null;
        let batteryCells = [];
        let lamp = null;
        let gates = [];
        let ambientEdit = null;
        let ambientProfile = null;
        let expectedLoad = null;
        let airFixture = null;

        if (scenario === 'air-calm') {
            physics.setAmbientTarget(20);
            physics.setAmbientHumidityTarget(50);
            physics.setDewpointTarget(10);
            physics.setAmbientWindOn(false);
            physics.setGeneralWindStrength(0);
            physics.setGustWindStrength(0);
            world.temp.fill(20);
            world.tempNext.fill(20);
            world.humidity.fill(50);
            const left = 3;
            const right = cols - 4;
            const top = 3;
            const bottom = rows - 4;
            for (let x = left; x <= right; x++) {
                physics.setCell(x, top, ids.Insulation);
                physics.setCell(x, bottom, ids.Insulation);
            }
            for (let y = top; y <= bottom; y++) {
                physics.setCell(left, y, ids.Insulation);
                physics.setCell(right, y, ids.Insulation);
            }
            const warm = { x: Math.floor(cols * 0.34), y: Math.floor(rows * 0.68) };
            const cool = { x: Math.floor(cols * 0.66), y: Math.floor(rows * 0.32) };
            for (let y = -3; y <= 3; y++) {
                for (let x = -3; x <= 3; x++) {
                    const warmIndex = physics.index(warm.x + x, warm.y + y);
                    const coolIndex = physics.index(cool.x + x, cool.y + y);
                    world.temp[warmIndex] = 80;
                    world.humidity[warmIndex] = 90;
                    world.temp[coolIndex] = 0;
                    world.humidity[coolIndex] = 10;
                }
            }
            airFixture = { kind: 'calm-sealed', warm, cool, shell: { left, right, top, bottom } };
        } else if (scenario === 'air-driven') {
            physics.setAmbientTarget(20);
            physics.setAmbientHumidityTarget(50);
            physics.setDewpointTarget(10);
            physics.setAmbientWindOn(true);
            physics.setGeneralWindStrength(45);
            physics.setGustWindStrength(12);
            world.temp.fill(20);
            world.tempNext.fill(20);
            world.humidity.fill(50);

            const shell = { left: 4, right: cols - 5, top: 6, bottom: rows - 7 };
            for (let x = shell.left; x <= shell.right; x++) {
                physics.setCell(x, shell.top, ids.Insulation);
                physics.setCell(x, shell.bottom, ids.Insulation);
            }
            for (let y = shell.top; y <= shell.bottom; y++) {
                physics.setCell(shell.left, y, ids.Insulation);
                physics.setCell(shell.right, y, ids.Insulation);
            }
            const opening = { x: Math.floor(cols * 0.72), y: shell.top };
            physics.setCell(opening.x, opening.y, 0);

            const machine = { x: Math.floor(cols * 0.2), y: Math.floor(rows * 0.5), type: 'Heater' };
            physics.setCell(machine.x, machine.y, ids.Heater);
            world.data[physics.index(machine.x, machine.y)] = 0;
            physics.setMachineSetting(machine.x, machine.y, 30);
            const batteryCapacity = definitions[ids.Battery].chargeCapacity;
            const input = physics.getMachinePorts(machine.x, machine.y)
                .find(port => port.role === 'input');
            if (!input?.connectionCell || input.material !== 'Copper') {
                throw new Error(`Air-jet Heater is missing its declared Copper input: ${JSON.stringify(input)}`);
            }
            physics.setCell(input.connectionCell.x, input.connectionCell.y, ids.Copper);
            const batteryX = input.connectionCell.x + Math.sign(input.directionX || -1);
            const batteryY = input.connectionCell.y + Math.sign(input.directionY || 0);
            const batteryStartY = machine.y - 16;
            batteryCells = Array.from({ length: 32 }, (_, offset) => ({
                x: batteryX,
                y: batteryStartY + offset + (batteryY - machine.y)
            }));
            for (const cell of batteryCells) {
                physics.setCell(cell.x, cell.y, ids.Battery);
                world.charge[physics.index(cell.x, cell.y)] = batteryCapacity;
            }
            battery = { x: batteryX, y: batteryY };
            const source = { x: machine.x + 12, y: machine.y };
            const obstacle = { x: machine.x + 16, y: machine.y };
            physics.setCell(obstacle.x, obstacle.y, ids.Glass);
            for (let y = -3; y <= 3; y++) {
                for (let x = -3; x <= 3; x++) {
                    const i = physics.index(source.x + x, source.y + y);
                    world.temp[i] = 80;
                    world.humidity[i] = 90;
                }
            }
            airFixture = { kind: 'wind-and-heater-jet', machine, source, obstacle, opening, shell };
        }
        if (wantsSpark) {
            const networkX = Math.floor(cols * 0.62);
            const networkY = Math.floor(rows * 0.2);
            const networkWidth = Math.max(8, Math.floor(cols * 0.25));
            const networkHeight = Math.max(8, Math.floor(rows * 0.2));
            for (let y = networkY; y < Math.min(rows, networkY + networkHeight); y++) {
                for (let x = networkX; x < Math.min(cols, networkX + networkWidth); x++) {
                    physics.setCell(x, y, ids.Elec);
                }
            }
            sparkSeed = { x: networkX - 1, y: networkY - 1 };
            physics.setCell(sparkSeed.x, sparkSeed.y, ids.Spark);
            world.data[physics.index(sparkSeed.x, sparkSeed.y)] = 0;
        }

        if (wantsBattery) {
            const y = 12;
            lamp = { x: cols - 8, y };
            physics.setCell(lamp.x, lamp.y, ids.Lamp);
            const lampIndex = physics.index(lamp.x, lamp.y);
            let input = null;
            for (let direction = 0; direction < 8; direction++) {
                world.data[lampIndex] = direction;
                const candidate = physics.getMachinePorts(lamp.x, lamp.y)
                    .find(port => port.role === 'input' && port.directionY === 0 && port.directionX < 0);
                if (candidate && candidate.connectionCell.y === y) {
                    input = candidate;
                    break;
                }
            }
            if (!input) throw new Error('Could not orient Lamp with a horizontal left-facing input port.');
            physics.setMachineSetting(lamp.x, lamp.y, 1);
            for (let x = 6; x <= input.connectionCell.x; x++) physics.setCell(x, y, ids.Elec);
            battery = { x: 5, y };
            batteryCells = Array.from({ length: 4 }, (_, offset) => ({ x: battery.x, y: y + offset }));
            const batteryDefinition = definitions[ids.Battery];
            for (const cell of batteryCells) {
                physics.setCell(cell.x, cell.y, ids.Battery);
                world.charge[physics.index(cell.x, cell.y)] = batteryDefinition.chargeCapacity;
            }
            expectedLoad = physics.getBatteryCircuitMetrics(battery.x, battery.y)?.load ?? 0;
            if (!(expectedLoad > 0)) throw new Error(`Battery circuit has no measured load: ${expectedLoad}`);

            // Establish and verify live machine state before capturing the fixture.
            physics.stepSimulation();
            const liveLamp = physics.getMachineLiveStatus(lamp.x, lamp.y);
            if (!liveLamp?.active) throw new Error('Battery-backed Lamp was not active in the fixture.');
            for (const cell of batteryCells) {
                world.charge[physics.index(cell.x, cell.y)] = batteryDefinition.chargeCapacity;
            }
        } else if (scenario !== 'gate-chain') {
            physics.stepSimulation();
        }

        if (scenario === 'gate-chain') {
            const andId = id('AND');
            const notId = id('NOT');
            if (andId <= 0 || notId <= 0) throw new Error('Logic gate materials are missing.');
            const first = { x: Math.floor(cols * 0.43), y: Math.floor(rows * 0.28) };
            const second = { x: first.x + 20, y: first.y };
            if (second.x + 8 >= cols || first.y + 10 >= rows) {
                throw new Error('Benchmark world is too small for the gate chain.');
            }
            physics.setCell(first.x, first.y, andId);
            physics.setCell(second.x, second.y, notId);
            const batteryDefinition = definitions[ids.Battery];
            batteryCells = [];
            const attachChargedBatteryToPort = (machine, portId) => {
                const port = physics.getMachinePorts(machine.x, machine.y)
                    .find(candidate => candidate.id === portId);
                if (!port) throw new Error(`Missing ${portId} port on gate at ${machine.x},${machine.y}.`);
                const wire = port.connectionCell;
                if (world.type[physics.index(wire.x, wire.y)] !== 0) {
                    throw new Error(`Gate port anchor is occupied: ${portId}.`);
                }
                physics.setCell(wire.x, wire.y, ids.Elec);
                const [dx, dy] = portId === 'supply' ? [0, 1] : [-1, 0];
                const cell = { x: wire.x + dx, y: wire.y + dy };
                if (world.type[physics.index(cell.x, cell.y)] !== 0) {
                    throw new Error(`Battery source cell is occupied: ${portId}.`);
                }
                physics.setCell(cell.x, cell.y, ids.Battery);
                world.charge[physics.index(cell.x, cell.y)] = batteryDefinition.chargeCapacity;
                batteryCells.push(cell);
                return cell;
            };
            attachChargedBatteryToPort(first, 'signal-a');
            attachChargedBatteryToPort(first, 'signal-b');
            battery = attachChargedBatteryToPort(first, 'supply');
            attachChargedBatteryToPort(second, 'supply');
            const firstOutput = physics.getMachinePorts(first.x, first.y)
                .find(port => port.id === 'output')?.connectionCell;
            const secondInput = physics.getMachinePorts(second.x, second.y)
                .find(port => port.id === 'signal-a')?.connectionCell;
            if (!firstOutput || !secondInput || firstOutput.y !== secondInput.y ||
                firstOutput.x >= secondInput.x) {
                throw new Error('Gate chain output and input anchors do not align.');
            }
            for (let x = firstOutput.x; x <= secondInput.x; x++) {
                const cell = world.type[physics.index(x, firstOutput.y)];
                if (cell !== 0 && cell !== ids.Elec) throw new Error('Gate chain route is blocked.');
                physics.setCell(x, firstOutput.y, ids.Elec);
            }
            gates = [first, second];
            physics.stepSimulation();
            const firstLive = physics.getMachineLiveStatus(first.x, first.y);
            const secondLive = physics.getMachineLiveStatus(second.x, second.y);
            if (!firstLive?.active || secondLive?.active) {
                throw new Error(`Gate chain did not settle to AND ON then NOT OFF: ${JSON.stringify([firstLive, secondLive])}`);
            }
            expectedLoad = physics.getBatteryCircuitMetrics(battery.x, battery.y)?.load ?? 0;
            if (!(expectedLoad > 0)) throw new Error(`Gate supply has no measured load: ${expectedLoad}`);
        }

        if (airFixture?.machine) {
            expectedLoad = physics.getBatteryCircuitMetrics(battery.x, battery.y)?.load ?? 0;
            if (!(expectedLoad > 0)) throw new Error(`Air-jet Heater has no connected Battery load: ${expectedLoad}`);
            if (!physics.isMachinePoweredAt(airFixture.machine.x, airFixture.machine.y)) {
                throw new Error('Air-jet Heater was not powered after fixture setup.');
            }
        }

        if (scenario === 'ambient-visibility-edit') {
            const occluderId = definitions.findIndex(definition => definition?.group === 'Solids' &&
                definition.category === 'static' && !definition.machine && !definition.isPlant);
            if (occluderId <= 0) throw new Error('No static non-machine solid is available for the ambient edit fixture.');
            physics.getIlluminationAt(0, 0);
            ambientEdit = {
                x: Math.floor(cols * 0.5),
                y: Math.floor(rows * 0.28),
                occluderId
            };
            physics.setCell(ambientEdit.x, ambientEdit.y, occluderId);
            physics.stepSimulation();
        }

        if (hasAmbientProfile) {
            const chunkSize = physics.AMBIENT_ILLUMINATION_CHUNK_SIZE;
            const chunkX = Math.floor(Math.floor(cols / 2) / chunkSize) * chunkSize;
            const chunkY = Math.floor(Math.floor(rows / 2) / chunkSize) * chunkSize;
            const probeX = chunkX + Math.floor((Math.min(chunkSize, cols - chunkX) - 1) / 2);
            const probeY = chunkY + Math.floor((Math.min(chunkSize, rows - chunkY) - 1) / 2);
            physics.setAmbientIlluminationTarget(80);
            if (scenario === 'ambient-occlusion-dense') {
                world.type.fill(ids.Wall);
                // A single open vertical shaft creates a dense, mixed field:
                // nearby cells have exact witnesses while the surrounding
                // solid cells mostly fall back to the low-light floor.
                for (let y = 0; y < rows; y++) {
                    world.type[physics.index(probeX, y)] = 0;
                }
                const diagonalSourceX = probeX + 5;
                const diagonalTarget = { x: probeX + 2, y: Math.floor(rows * 0.55) };
                let x = diagonalSourceX;
                let y = 0;
                const dx = Math.abs(diagonalTarget.x - x);
                const sx = x < diagonalTarget.x ? 1 : -1;
                const dy = -Math.abs(diagonalTarget.y - y);
                const sy = y < diagonalTarget.y ? 1 : -1;
                let error = dx + dy;
                while (true) {
                    world.type[physics.index(x, y)] = 0;
                    if (x === diagonalTarget.x && y === diagonalTarget.y) break;
                    const twiceError = 2 * error;
                    if (twiceError >= dy) { error += dy; x += sx; }
                    if (twiceError <= dx) { error += dx; y += sy; }
                }
            }
            const openProbe = physics.getIlluminationAt(probeX, probeY);
            const shadowProbe = physics.getIlluminationAt(Math.min(cols - 1, probeX + 10), probeY);
            const buildEvent = window.__P0_PERF__.snapshot()
                .filter(event => event.name === 'ambientIlluminationFullBuild').at(-1);
            ambientProfile = {
                kind: scenario,
                chunkSize,
                openProbe,
                shadowProbe,
                counters: buildEvent?.counters ?? null
            };
            if (scenario === 'ambient-open' && openProbe !== 80) {
                throw new Error(`Open ambient profile should read 80, found ${openProbe}.`);
            }
            if (scenario === 'ambient-occlusion-dense' &&
                (openProbe !== 80 || shadowProbe !== 80)) {
                throw new Error(`Dense ambient profile probes are unexpected: ${JSON.stringify(ambientProfile)}.`);
            }
        }

        for (let cellIndex = 0; cellIndex < world.type.length; cellIndex++) {
            if (world.type[cellIndex] === ids.Spark) {
                physics.setCell(cellIndex % cols, Math.floor(cellIndex / cols), 0);
            }
        }
        if (sparkSeed) {
            physics.setCell(sparkSeed.x, sparkSeed.y, ids.Spark);
            world.data[physics.index(sparkSeed.x, sparkSeed.y)] = 0;
        }
        if (battery) {
            for (const cell of batteryCells) {
                world.charge[physics.index(cell.x, cell.y)] = definitions[ids.Battery].chargeCapacity;
            }
        }

        game.renderWorld();
        const setupEvents = window.__P0_PERF__.snapshot();
        window.__P0_PERF__.enabled = false;
        window.__P0_PERF__.reset();
        const currentWorld = physics.getWorld();
        const typeCounts = {};
        for (const type of currentWorld.type) typeCounts[type] = (typeCounts[type] || 0) + 1;
        const countsByName = Object.fromEntries(Object.entries(ids).map(([name, type]) => [
            name,
            typeCounts[type] || 0
        ]));
        const fixture = {
            scenario,
            cols,
            rows,
            worldCells: cols * rows,
            nonEmptyCells: cols * rows - (typeCounts[0] || 0),
            countsByName,
            airFixture,
            sparkSeed,
            battery,
            batteryCells,
            lamp,
            gates,
            ambientEdit,
            ambientProfile,
            pointerCell: scenario === 'battery-hover' ? battery :
                scenario === 'gate-chain' ? gates[0] : lamp,
            expectedLoad,
            setupEvents
        };
        window.__P0_BENCHMARK_SNAPSHOTS__ ||= {};
        window.__P0_BENCHMARK_SNAPSHOTS__[`${cols}x${rows}:${scenario}`] = window.__GAME_INSTANCE__.captureState();
        return fixture;
    }, { scenario, cols: size.cols, rows: size.rows, seed });
}

async function measurePass(page, fixture, { instrumented }) {
    return page.evaluate(async ({ fixture, instrumented, warmupSamples, measuredSamples }) => {
        const physics = await import('/physics.js');
        const game = await import('/game.js');
        const sink = window.__P0_PERF__;
        const key = `${fixture.cols}x${fixture.rows}:${fixture.scenario}`;
        const snapshot = window.__P0_BENCHMARK_SNAPSHOTS__?.[key];
        if (!snapshot || !sink) throw new Error(`Missing captured fixture or P0 recorder for ${key}`);
        sink.enabled = false;
        sink.reset();
        window.__GAME_INSTANCE__.restoreState(snapshot);
        sink.enabled = instrumented;

        const world = physics.getWorld();
        const definitions = physics.getDefinitions();
        const sparkId = definitions.findIndex(definition => definition?.name === 'Spark');
        const batteryId = definitions.findIndex(definition => definition?.name === 'Battery');
        const batteryCapacity = definitions[batteryId]?.chargeCapacity || 0;
        const prepareSample = () => {
            if (fixture.sparkSeed) {
                physics.setCell(fixture.sparkSeed.x, fixture.sparkSeed.y, sparkId);
                world.data[physics.index(fixture.sparkSeed.x, fixture.sparkSeed.y)] = 0;
            }
            if (fixture.battery) {
                for (const cell of fixture.batteryCells) {
                    world.charge[physics.index(cell.x, cell.y)] = batteryCapacity;
                }
            }
            if (fixture.ambientEdit) {
                const { x, y, occluderId } = fixture.ambientEdit;
                const current = world.type[physics.index(x, y)];
                physics.setCell(x, y, current === occluderId ? 0 : occluderId);
                const currentTarget = physics.getAmbientIlluminationTarget();
                physics.setAmbientIlluminationTarget(currentTarget === 50 ? 55 : 50);
            }
        };
        const sampleOnce = () => {
            prepareSample();
            let started = performance.now();
            physics.stepSimulation();
            const stepMs = performance.now() - started;
            started = performance.now();
            physics.decayWindTrails();
            const windMs = performance.now() - started;
            started = performance.now();
            game.renderWorld();
            const renderMs = performance.now() - started;
            started = performance.now();
            game.gameLoop(performance.now());
            const feedbackFrameMs = performance.now() - started;
            const completeFrameMs = stepMs + windMs + renderMs + feedbackFrameMs;
            return {
                stepMs,
                windMs,
                renderMs,
                feedbackFrameMs,
                completeFrameMs,
                transientPowerCells: world.power.reduce((count, value) => count + (value > 0 ? 1 : 0), 0),
                transientDelayCells: world.powerDelay.reduce((count, value) => count + (value > 0 ? 1 : 0), 0)
            };
        };
        for (let index = 0; index < warmupSamples; index++) sampleOnce();
        const illuminationStart = physics.getIlluminationCacheStats();
        sink.reset();
        const samples = [];
        for (let index = 0; index < measuredSamples; index++) samples.push(sampleOnce());
        sink.enabled = false;
        const illuminationEnd = physics.getIlluminationCacheStats();
        return {
            samples,
            events: sink.snapshot(),
            illuminationLookups: illuminationEnd.lookups - illuminationStart.lookups,
            illuminationFieldRebuilds: illuminationEnd.rebuilds - illuminationStart.rebuilds,
            finalLampActive: fixture.lamp
                ? Boolean(physics.getMachineLiveStatus(fixture.lamp.x, fixture.lamp.y)?.active)
                : null,
            finalAirMachinePowered: fixture.airFixture?.machine
                ? Boolean(physics.isMachinePoweredAt(fixture.airFixture.machine.x, fixture.airFixture.machine.y))
                : null,
            finalBatteryLoad: fixture.battery
                ? physics.getBatteryCircuitMetrics(fixture.battery.x, fixture.battery.y)?.load ?? null
                : null,
            finalGateStates: fixture.gates?.map(gate =>
                Boolean(physics.getMachineLiveStatus(gate.x, gate.y)?.active)) || []
        };
    }, { fixture, instrumented, warmupSamples, measuredSamples });
}

test('opt-in P0 browser benchmark records deterministic scene and stage timings', async ({ page, browser }) => {
    test.setTimeout((fullScaleRun ? 60 : 15) * 60 * 1000);
    const results = [];
    const runMetadata = {
        recordedAt: new Date().toISOString(),
        commit: commitId(),
        workingTree: workingTreeStatus(),
        nodeVersion: process.version,
        host: {
            platform: os.platform(),
            release: os.release(),
            architecture: os.arch(),
            cpuModel: os.cpus()[0]?.model || 'unavailable',
            logicalCores: os.cpus().length,
            totalMemoryBytes: os.totalmem()
        },
        browserVersion: browser.version(),
        warmupSamples,
        measuredSamples,
        targetCompleteFrameP95Ms: 1000 / 24,
        targetFramesPerSecond: 24,
        feedbackFrameMetric: 'UI feedback only; excludes stepSimulation, decayWindTrails, and renderWorld, which are timed separately.',
        completeFrameMetric: 'Per-sample sum of stepSimulation, decayWindTrails, renderWorld, and UI feedback timings.',
        scope: fullScaleRun ? 'all-world-sizes' : 'small-worlds',
        seed,
        instrumentationContract: hookNames
    };

    for (const size of sizes) {
        await startBenchmarkWorld(page, size.label);
        const browserInfo = await page.evaluate(() => {
            const canvas = document.querySelector('#canvas');
            let gpu = { status: 'unavailable' };
            try {
                const gl = document.createElement('canvas').getContext('webgl');
                if (gl) {
                    const extension = gl.getExtension('WEBGL_debug_renderer_info');
                    gpu = {
                        status: 'available',
                        vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : 'masked',
                        renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'masked'
                    };
                }
            } catch (error) {
                gpu = { status: 'unavailable', reason: String(error) };
            }
            const rect = canvas?.getBoundingClientRect();
            return {
                userAgent: navigator.userAgent,
                hardwareConcurrency: navigator.hardwareConcurrency || null,
                deviceMemoryGiB: navigator.deviceMemory || null,
                visibilityState: document.visibilityState,
                viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
                canvas: canvas ? {
                    width: canvas.width,
                    height: canvas.height,
                    visible: Boolean(rect && rect.width > 0 && rect.height > 0 &&
                        rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight &&
                        getComputedStyle(canvas).visibility !== 'hidden' &&
                        getComputedStyle(canvas).display !== 'none' && document.visibilityState === 'visible'),
                    rect: rect ? { width: rect.width, height: rect.height } : null
                } : null,
                gpu
            };
        });
        expect(browserInfo.visibilityState, 'browser page must be visible while timing').toBe('visible');
        expect(browserInfo.canvas?.visible, 'rendered canvas must have a visible on-screen region').toBe(true);

        for (const scenario of scenarios) {
            console.log(`[performance] ${size.cols}x${size.rows} ${scenario}: preparing fixture`);
            const fixture = await prepareFixture(page, scenario, size);
            expect(fixture.cols).toBe(size.cols);
            expect(fixture.rows).toBe(size.rows);
            if (fixture.battery) {
                expect(fixture.expectedLoad).toBeGreaterThan(0);
            }
            const pointerCell = fixture.pointerCell || fixture.lamp ||
                { x: Math.floor(fixture.cols / 2), y: Math.floor(fixture.rows / 2) };
            await page.mouse.move(...Object.values(await canvasPoint(page, pointerCell)));

            console.log(`[performance] ${size.cols}x${size.rows} ${scenario}: external samples`);
            const external = await measurePass(page, fixture, { instrumented: false });
            console.log(`[performance] ${size.cols}x${size.rows} ${scenario}: instrumented samples`);
            const internal = await measurePass(page, fixture, { instrumented: true });
            if (fixture.lamp) {
                expect(external.finalLampActive, `${scenario}: Lamp active after external pass`).toBe(true);
                expect(internal.finalLampActive, `${scenario}: Lamp active after internal pass`).toBe(true);
                expect(external.finalBatteryLoad, `${scenario}: Battery has connected load`).toBeGreaterThan(0);
            }
            if (fixture.gates?.length) {
                expect(external.finalGateStates, `${scenario}: gates remain powered in sequence`)
                    .toEqual([true, false]);
                expect(internal.finalGateStates, `${scenario}: instrumented gate states match`)
                    .toEqual([true, false]);
                expect(external.finalBatteryLoad, `${scenario}: gate supply has connected load`).toBeGreaterThan(0);
            }
            if (fixture.airFixture?.machine) {
                expect(external.finalAirMachinePowered, `${scenario}: Heater stays powered after external pass`).toBe(true);
                expect(internal.finalAirMachinePowered, `${scenario}: Heater stays powered after instrumented pass`).toBe(true);
                expect(external.finalBatteryLoad, `${scenario}: Heater has connected load`).toBeGreaterThan(0);
            }

            const externalSummary = {
                stepSimulation: summarize(external.samples.map(sample => sample.stepMs)),
                decayWindTrails: summarize(external.samples.map(sample => sample.windMs)),
                renderWorld: summarize(external.samples.map(sample => sample.renderMs)),
                feedbackFrame: summarize(external.samples.map(sample => sample.feedbackFrameMs)),
                completeFrame: summarize(external.samples.map(sample => sample.completeFrameMs))
            };
            const instrumentedSummary = {
                stepSimulation: summarize(internal.samples.map(sample => sample.stepMs)),
                decayWindTrails: summarize(internal.samples.map(sample => sample.windMs)),
                renderWorld: summarize(internal.samples.map(sample => sample.renderMs)),
                feedbackFrame: summarize(internal.samples.map(sample => sample.feedbackFrameMs)),
                completeFrame: summarize(internal.samples.map(sample => sample.completeFrameMs))
            };
            const hookEvents = internal.events;
            const setupHookNames = [...new Set(fixture.setupEvents.map(event => event.name))];
            const hookSummary = summarizeHooks(hookEvents);
            const hookCounterSummary = summarizeHookCounters(hookEvents);
            const setupHookCounterSummary = summarizeHookCounters(fixture.setupEvents);
            const requiredForScenario = hookNames.filter(name => {
                if (name === 'machineOverlayRebuild' || name === 'machineOverlayReuse') return false;
                if (name === 'airScalarTransport') return Boolean(fixture.airFixture);
                if (name === 'ordinarySparkPropagation') return Boolean(fixture.sparkSeed);
                if (name === 'batteryLoadTraversal') return Boolean(fixture.battery);
                if (name === 'electricalStatusOverlay') return Boolean(fixture.battery);
                if (name === 'ambientIlluminationFullBuild') return Boolean(fixture.ambientEdit || fixture.ambientProfile);
                if (name === 'ambientIlluminationIncrementalUpdate') return Boolean(fixture.ambientEdit);
                if (name === 'ambientIlluminationSliderRemap') return false;
                return true;
            });
            const missingHooks = requiredForScenario.filter(name =>
                !hookSummary[name] && !setupHookNames.includes(name));
            if (fixture.sparkSeed) {
                const touched = hookEvents.filter(event => event.name === 'ordinarySparkPropagation')
                    .reduce((sum, event) => sum + Number(event.counters?.touchedCells || 0), 0);
                if (!(touched > 0)) missingHooks.push('ordinarySparkPropagation.touchedCells counter');
            }
            if (fixture.battery) {
                const allObservedEvents = [...fixture.setupEvents, ...hookEvents];
                const traversedLoads = sumHookCounter(allObservedEvents, 'batteryLoadTraversal', 'loadMachines');
                if (!(traversedLoads > 0)) missingHooks.push('batteryLoadTraversal.loadMachines counter');
                const refreshedLoads = sumHookCounter(allObservedEvents, 'electricalTopologyRefresh', 'loadMachines');
                if (!(refreshedLoads > 0)) missingHooks.push('electricalTopologyRefresh.loadMachines counter');
                const overlayGroups = sumHookCounter([...fixture.setupEvents, ...hookEvents],
                    'electricalStatusOverlay', 'batteryGroupsVisited');
                if (!(overlayGroups > 0)) missingHooks.push('electricalStatusOverlay.batteryGroupsVisited counter');
            }

            if (fixture.gates?.length) {
                const gateCount = sumHookCounter(hookEvents, 'logicalGateSolve', 'gateCount');
                if (!(gateCount > 0)) missingHooks.push('logicalGateSolve.gateCount counter');
            }
            if (fixture.ambientEdit) {
                const ambientChunks = sumHookCounter(hookEvents,
                    'ambientIlluminationIncrementalUpdate', 'chunksSampled');
                const ambientCells = sumHookCounter(hookEvents,
                    'ambientIlluminationIncrementalUpdate', 'cellsWritten');
                if (!(ambientChunks > 0 && ambientCells > 0)) {
                    missingHooks.push('ambientIlluminationIncrementalUpdate chunk counters');
                }
                const sliderEvents = hookEvents.filter(event => event.name === 'ambientIlluminationSliderRemap');
                const sliderRayTraces = sumHookCounter(hookEvents,
                    'ambientIlluminationSliderRemap', 'rayTraces');
                if (sliderEvents.length === 0 || sliderRayTraces !== 0) {
                    missingHooks.push('ambientIlluminationSliderRemap with zero rayTraces');
                }
            }

            if (fixture.ambientProfile) {
                const counters = fixture.ambientProfile.counters || {};
                for (const counter of ['visibilityCells', 'chunksSampled', 'cellsWritten']) {
                    if (!Number.isFinite(counters[counter])) {
                        missingHooks.push(`ambientIlluminationFullBuild.${counter} counter`);
                    }
                }
                const expectedChunks = Math.ceil(fixture.cols / fixture.ambientProfile.chunkSize) *
                    Math.ceil(fixture.rows / fixture.ambientProfile.chunkSize);
                if (counters.visibilityCells !== expectedChunks ||
                    counters.chunksSampled !== expectedChunks ||
                    counters.cellsWritten !== fixture.worldCells) {
                    missingHooks.push(`ambient profile chunk/fill counters (classified=${counters.visibilityCells}, chunks=${counters.chunksSampled}, cells=${counters.cellsWritten}; expected ${expectedChunks}/${expectedChunks}/${fixture.worldCells})`);
                }
            }

            if (fixture.airFixture) {
                const airEvents = hookEvents.filter(event => event.name === 'airScalarTransport');
                const counterNames = [
                    'ran', 'intervalTicks', 'airCellsVisited', 'horizontalFacesVisited',
                    'verticalFacesVisited', 'activeMachineCount', 'activeMaskCells',
                    'limiterPasses', 'activeJetCells', 'topologyMaskBuildMs',
                    'topologyMaskCells', 'uniformBackgroundEdgesSkipped'
                ];
                for (const name of counterNames) {
                    if (!airEvents.some(event => Number.isFinite(event.counters?.[name]))) {
                        missingHooks.push(`airScalarTransport.${name} numeric counter`);
                    }
                }
                const cadence = summarizeAirCadence(hookEvents);
                for (const name of ['airCellsVisited', 'horizontalFacesVisited', 'verticalFacesVisited']) {
                    if (!(sumHookCounter(hookEvents, 'airScalarTransport', name) > 0)) {
                        missingHooks.push(`airScalarTransport.${name} positive work/cadence total`);
                    }
                }
                if (!(cadence.runs > 0 && cadence.skips > 0)) {
                    missingHooks.push('airScalarTransport two-tick run/skip evidence');
                }
                if (cadence.intervalTicks !== 2 || airEvents.some(event => event.counters?.intervalTicks !== 2)) {
                    missingHooks.push('airScalarTransport.intervalTicks fixed at 2');
                }
                if (!cadence.alternates || !cadence.runEventsTwoCallsApart) {
                    missingHooks.push('airScalarTransport run/skip events alternate every two simulation calls');
                }
                if (cadence.runs + cadence.skips !== cadence.eventCount ||
                    Math.abs(cadence.runs - cadence.skips) > 1) {
                    missingHooks.push(`airScalarTransport two-tick run/skip counts (${cadence.runs}/${cadence.skips} across ${cadence.eventCount} events)`);
                }
                if (sumHookCounter(hookEvents, 'airScalarTransport', 'limiterPasses') !== cadence.runs) {
                    missingHooks.push(`airScalarTransport single limiter aggregation (passes=${sumHookCounter(hookEvents, 'airScalarTransport', 'limiterPasses')}, runs=${cadence.runs})`);
                }
                if (sumHookCounter(hookEvents, 'airScalarTransport', 'topologyMaskCells') !==
                    fixture.worldCells * cadence.runs) {
                    missingHooks.push('airScalarTransport topology mask rebuilt once per due tick');
                }
                if (fixture.airFixture.kind === 'wind-and-heater-jet') {
                    for (const name of ['activeMachineCount', 'activeMaskCells', 'activeJetCells']) {
                        if (!(sumHookCounter(hookEvents, 'airScalarTransport', name) > 0)) {
                            missingHooks.push(`airScalarTransport.${name} positive machine-work total`);
                        }
                    }
                }
            }

            if (fixture.lamp) {
                const overlayEvents = [...fixture.setupEvents, ...hookEvents].filter(event =>
                    event.name === 'machineOverlayRebuild' || event.name === 'machineOverlayReuse');
                if (overlayEvents.length === 0) {
                    missingHooks.push('machineOverlayRebuild or machineOverlayReuse for a machine fixture');
                }
                const machineCountEvents = overlayEvents.filter(event =>
                    Number.isFinite(event.counters?.machineCount));
                if (machineCountEvents.length > 0 &&
                    !machineCountEvents.some(event => event.counters.machineCount > 0)) {
                    missingHooks.push('machineOverlay machineCount counter');
                }
                const reuseEvents = overlayEvents.filter(event =>
                    event.name === 'machineOverlayReuse' &&
                    Number.isFinite(event.counters?.staticSvgReuse));
                if (reuseEvents.length > 0 &&
                    !reuseEvents.some(event => event.counters.staticSvgReuse > 0)) {
                    missingHooks.push('machineOverlayReuse.staticSvgReuse counter');
                }
            }

            const topologyRefreshes = hookEvents.filter(event => event.name === 'electricalTopologyRefresh');
            const scheduledRefreshes = sumHookCounter(hookEvents,
                'electricalTopologyRefresh', 'scheduledRefreshes');
            const forcedRefreshes = sumHookCounter(hookEvents,
                'electricalTopologyRefresh', 'forcedRefreshes');
            if (topologyRefreshes.length !== 2 || scheduledRefreshes !== 2 || forcedRefreshes !== 0) {
                missingHooks.push(`electricalTopologyRefresh cadence (events=${topologyRefreshes.length}, scheduled=${scheduledRefreshes}, forced=${forcedRefreshes}; expected 2 scheduled over ${measuredSamples} steady ticks)`);
            }

            if (fixture.sparkSeed || fixture.battery) {
                if (internal.samples.some(sample => sample.transientPowerCells !== 0 ||
                    sample.transientDelayCells !== 0)) {
                    missingHooks.push('steady electrical state has no transient power or delay cells');
                }
            }

            results.push({
                size: { cols: size.cols, rows: size.rows },
                browser: browserInfo,
                fixture: {
                    ...fixture,
                    setupEvents: undefined,
                    setupHookNames,
                    setupHookEventCounts: Object.fromEntries(hookNames.map(name => [
                        name,
                        fixture.setupEvents.filter(event => event.name === name).length
                    ])),
                    setupHookSummary: summarizeHooks(fixture.setupEvents),
                    setupHookCounterSummary,
                    missingHooks,
                    hookEventCounts: Object.fromEntries(hookNames.map(name => [
                        name,
                        hookEvents.filter(event => event.name === name).length
                    ]))
                },
                externalSummary,
                instrumentedSummary,
                illuminationLookups: internal.illuminationLookups,
                illuminationFieldRebuilds: internal.illuminationFieldRebuilds,
                hookSummary,
                hookCounterSummary,
                hookEvents
            });
            console.log(`[performance] ${size.cols}x${size.rows} ${scenario}: complete`);

        }
    }

    const missing = results.flatMap(result => result.fixture.missingHooks.map(name =>
        `${result.size.cols}x${result.size.rows}/${result.fixture.scenario}: ${name}`));
    const artifactDir = path.resolve('test-results/performance');
    await mkdir(artifactDir, { recursive: true });
    const jsonArtifact = path.join(artifactDir, 'p0-browser.json');
    const csvArtifact = path.join(artifactDir, 'p0-browser.csv');
    await writeFile(jsonArtifact, `${JSON.stringify({ metadata: runMetadata, results }, null, 2)}\n`);

    const csvColumns = [
        'cols', 'rows', 'scenario', 'worldCells', 'nonEmptyCells', 'sand', 'water', 'fire', 'elec',
        'spark', 'battery', 'lamp', 'logicGates', 'fan', 'heater',
        'electricalTopologyRefreshEvents', 'electricalTopologyScheduledRefreshes',
        'electricalTopologyForcedRefreshes', 'sparkTouchedCells', 'sparkAllocatedCells',
        'batteryTraversalLoadMachines', 'batteryRefreshLoadMachines',
        'overlayRebuilds', 'overlayStaticSvgReuse', 'batteryGroupsVisited', 'trendGlyphsCreated',
        'gateSolveEvents', 'gateCount', 'gateIterations',
        'ambientProfileChunksSampled', 'ambientProfileCellsWritten',
        'ambientFullChunksSampled', 'ambientFullCellsWritten', 'ambientFullRayTraces',
        'ambientIncrementalEvents', 'ambientChunksSampled', 'ambientCellsWritten',
        'ambientPendingChunks', 'ambientRayTraces',
        'ambientSliderRemapEvents', 'ambientSliderChunksRemapped', 'ambientSliderCellsWritten',
        'ambientSliderRayTraces',
        'hoverCacheHits', 'hoverExactSvgTests',
        'illuminationLookups', 'illuminationFieldRebuilds',
        'stepMedianMs', 'stepP95Ms', 'windMedianMs', 'windP95Ms',
        'renderMedianMs', 'renderP95Ms', 'uiFeedbackFrameMedianMs', 'uiFeedbackFrameP95Ms',
        'completeFrameMedianMs', 'completeFrameP95Ms', 'targetCompleteFrameP95Ms',
        'airTransportRuns', 'airCadenceSkips', 'airCellsVisited',
        'airHorizontalFacesVisited', 'airVerticalFacesVisited', 'airLimiterPasses',
        'airActiveMachineCount', 'airActiveMaskCells', 'airActiveJetCells',
        'airTopologyMaskBuildMs', 'airTopologyMaskCells',
        'airUniformBackgroundEdgesSkipped', 'missingHooks',
        ...hookNames.flatMap(name => [`${name}Count`, `${name}MedianMs`, `${name}P95Ms`])
    ];
    const csvRows = [csvColumns.join(',')];
    for (const result of results) {
        const { fixture, size } = result;
        const airCadence = summarizeAirCadence(result.hookEvents);
        const values = [
            size.cols, size.rows, fixture.scenario, fixture.worldCells, fixture.nonEmptyCells,
            fixture.countsByName.Sand, fixture.countsByName.Water, fixture.countsByName.Fire,
            fixture.countsByName.Elec, fixture.countsByName.Spark, fixture.countsByName.Battery,
            fixture.countsByName.Lamp, fixture.gates?.length || 0,
            fixture.countsByName.Fan, fixture.countsByName.Heater,
            result.fixture.hookEventCounts.electricalTopologyRefresh,
            sumHookCounter(result.hookEvents, 'electricalTopologyRefresh', 'scheduledRefreshes'),
            sumHookCounter(result.hookEvents, 'electricalTopologyRefresh', 'forcedRefreshes'),
            sumHookCounter(result.hookEvents, 'ordinarySparkPropagation', 'touchedCells'),
            sumHookCounter(result.hookEvents, 'ordinarySparkPropagation', 'allocatedCells'),
            sumHookCounter(result.hookEvents, 'batteryLoadTraversal', 'loadMachines'),
            sumHookCounter(result.hookEvents, 'electricalTopologyRefresh', 'loadMachines'),
            result.fixture.hookEventCounts.machineOverlayRebuild,
            sumHookCounter(result.hookEvents, 'machineOverlayReuse', 'staticSvgReuse'),
            sumHookCounter(result.hookEvents, 'electricalStatusOverlay', 'batteryGroupsVisited'),
            sumHookCounter(result.hookEvents, 'electricalStatusOverlay', 'trendGlyphsCreated'),
            result.fixture.hookEventCounts.logicalGateSolve,
            sumHookCounter(result.hookEvents, 'logicalGateSolve', 'gateCount'),
            sumHookCounter(result.hookEvents, 'logicalGateSolve', 'iterations'),
            fixture.ambientProfile?.counters?.chunksSampled ?? '',
            fixture.ambientProfile?.counters?.cellsWritten ?? '',
            sumHookCounter(result.hookEvents, 'ambientIlluminationFullBuild', 'chunksSampled'),
            sumHookCounter(result.hookEvents, 'ambientIlluminationFullBuild', 'cellsWritten'),
            sumHookCounter(result.hookEvents, 'ambientIlluminationFullBuild', 'rayTraces'),
            result.fixture.hookEventCounts.ambientIlluminationIncrementalUpdate,
            sumHookCounter(result.hookEvents, 'ambientIlluminationIncrementalUpdate', 'chunksSampled'),
            sumHookCounter(result.hookEvents, 'ambientIlluminationIncrementalUpdate', 'cellsWritten'),
            sumHookCounter(result.hookEvents, 'ambientIlluminationIncrementalUpdate', 'pendingChunks'),
            sumHookCounter(result.hookEvents, 'ambientIlluminationIncrementalUpdate', 'rayTraces'),
            result.fixture.hookEventCounts.ambientIlluminationSliderRemap,
            sumHookCounter(result.hookEvents, 'ambientIlluminationSliderRemap', 'chunksRemapped'),
            sumHookCounter(result.hookEvents, 'ambientIlluminationSliderRemap', 'cellsWritten'),
            sumHookCounter(result.hookEvents, 'ambientIlluminationSliderRemap', 'rayTraces'),
            sumHookCounter(result.hookEvents, 'hoverHitTest', 'cacheHits'),
            sumHookCounter(result.hookEvents, 'hoverHitTest', 'exactSvgTests'),
            result.illuminationLookups,
            result.illuminationFieldRebuilds,
            result.externalSummary.stepSimulation.medianMs,
            result.externalSummary.stepSimulation.p95Ms,
            result.externalSummary.decayWindTrails.medianMs,
            result.externalSummary.decayWindTrails.p95Ms,
            result.externalSummary.renderWorld.medianMs,
            result.externalSummary.renderWorld.p95Ms,
            result.externalSummary.feedbackFrame.medianMs,
            result.externalSummary.feedbackFrame.p95Ms,
            result.externalSummary.completeFrame.medianMs,
            result.externalSummary.completeFrame.p95Ms,
            runMetadata.targetCompleteFrameP95Ms,
            airCadence.runs,
            airCadence.skips,
            sumHookCounter(result.hookEvents, 'airScalarTransport', 'airCellsVisited'),
            sumHookCounter(result.hookEvents, 'airScalarTransport', 'horizontalFacesVisited'),
            sumHookCounter(result.hookEvents, 'airScalarTransport', 'verticalFacesVisited'),
            sumHookCounter(result.hookEvents, 'airScalarTransport', 'limiterPasses'),
            sumHookCounter(result.hookEvents, 'airScalarTransport', 'activeMachineCount'),
            sumHookCounter(result.hookEvents, 'airScalarTransport', 'activeMaskCells'),
            sumHookCounter(result.hookEvents, 'airScalarTransport', 'activeJetCells'),
            sumHookCounter(result.hookEvents, 'airScalarTransport', 'topologyMaskBuildMs'),
            sumHookCounter(result.hookEvents, 'airScalarTransport', 'topologyMaskCells'),
            sumHookCounter(result.hookEvents, 'airScalarTransport', 'uniformBackgroundEdgesSkipped'),
            fixture.missingHooks.join('; '),
            ...hookNames.flatMap(name => [
                result.hookSummary[name]?.samples || 0,
                result.hookSummary[name]?.medianMs ?? '',
                result.hookSummary[name]?.p95Ms ?? ''
            ])
        ];
        csvRows.push(values.map(csvCell).join(','));
    }
    await writeFile(csvArtifact, `${csvRows.join('\n')}\n`);
    console.log(`P0 performance artifacts: ${jsonArtifact} and ${csvArtifact}`);
    console.log(`P0 sampling: ${warmupSamples} warm-up and ${measuredSamples} measured samples per pass; commit ${runMetadata.commit}.`);
    console.log(`Complete frame = stepSimulation + decayWindTrails + renderWorld + UI feedback. Complete-frame p95 target: <=${runMetadata.targetCompleteFrameP95Ms.toFixed(1)} ms (${runMetadata.targetFramesPerSecond} FPS); timings are reported without a host-sensitive pass/fail threshold.`);
    console.log('UI feedback timing is reported separately and covers gameLoop feedback only.');
    console.table(results.map(result => ({
        world: `${result.size.cols}×${result.size.rows}`,
        scenario: result.fixture.scenario,
        stepMedianMs: result.externalSummary.stepSimulation.medianMs.toFixed(3),
        stepP95Ms: result.externalSummary.stepSimulation.p95Ms.toFixed(3),
        renderMedianMs: result.externalSummary.renderWorld.medianMs.toFixed(3),
        uiFeedbackFrameP95Ms: result.externalSummary.feedbackFrame.p95Ms.toFixed(3),
        completeFrameMedianMs: result.externalSummary.completeFrame.medianMs.toFixed(3),
        completeFrameP95Ms: result.externalSummary.completeFrame.p95Ms.toFixed(3),
        missingHooks: result.fixture.missingHooks.join(', ') || 'none'
    })));
    expect(missing, 'Frontend instrumentation hooks required by performance/README.md').toEqual([]);
});
