import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { GamePage } from '../e2e/helpers/gamePage.mjs';
import { expectCanvasVisible } from '../e2e/helpers/canvas.mjs';

const sizes = [
    { cols: 260, rows: 150, label: '260 × 150' },
    { cols: 520, rows: 300, label: '520 × 300' }
];
const scenarios = [
    'empty-control',
    'particle-baseline',
    'ordinary-spark',
    'battery-lamp',
    'combined'
];
const warmupSamples = 10;
const measuredSamples = 60;
const seed = 0;
const hookNames = [
    'stepSimulation',
    'updateElectricalPower',
    'ordinarySparkPropagation',
    'batteryLoadTraversal',
    'drawWorld',
    'machineOverlayRebuild',
    'illuminationLayer'
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
            test.info().setTimeout(120_000);
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
        const world = physics.getWorld();
        if (!world || world.cols !== cols || world.rows !== rows) {
            throw new Error(`Expected ${cols}x${rows} world; found ${world?.cols}x${world?.rows}`);
        }
        const ids = Object.fromEntries(['Sand', 'Water', 'Fire', 'Elec', 'Spark', 'Battery', 'Lamp']
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
        physics.clearWorld();
        physics.setRandomSeed(seed);

        const countScale = scenario !== 'empty-control';
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
        const wantsBattery = scenario === 'battery-lamp' || scenario === 'combined';
        let sparkSeed = null;
        let battery = null;
        let batteryCells = [];
        let lamp = null;
        let expectedLoad = null;
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
        } else {
            physics.stepSimulation();
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
            sparkSeed,
            battery,
            batteryCells,
            lamp,
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
            return { stepMs, windMs, renderMs };
        };
        for (let index = 0; index < warmupSamples; index++) sampleOnce();
        sink.reset();
        const samples = [];
        for (let index = 0; index < measuredSamples; index++) samples.push(sampleOnce());
        sink.enabled = false;
        return {
            samples,
            events: sink.snapshot(),
            finalLampActive: fixture.lamp
                ? Boolean(physics.getMachineLiveStatus(fixture.lamp.x, fixture.lamp.y)?.active)
                : null,
            finalBatteryLoad: fixture.battery
                ? physics.getBatteryCircuitMetrics(fixture.battery.x, fixture.battery.y)?.load ?? null
                : null
        };
    }, { fixture, instrumented, warmupSamples, measuredSamples });
}

test('opt-in P0 browser benchmark records deterministic scene and stage timings', async ({ page, browser }) => {
    test.setTimeout(15 * 60 * 1000);
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
            const fixture = await prepareFixture(page, scenario, size);
            expect(fixture.cols).toBe(size.cols);
            expect(fixture.rows).toBe(size.rows);
            if (fixture.battery) {
                expect(fixture.expectedLoad).toBeGreaterThan(0);
            }

            const external = await measurePass(page, fixture, { instrumented: false });
            const internal = await measurePass(page, fixture, { instrumented: true });
            if (fixture.lamp) {
                expect(external.finalLampActive, `${scenario}: Lamp active after external pass`).toBe(true);
                expect(internal.finalLampActive, `${scenario}: Lamp active after internal pass`).toBe(true);
                expect(external.finalBatteryLoad, `${scenario}: Battery has connected load`).toBeGreaterThan(0);
            }

            const externalSummary = {
                stepSimulation: summarize(external.samples.map(sample => sample.stepMs)),
                decayWindTrails: summarize(external.samples.map(sample => sample.windMs)),
                renderWorld: summarize(external.samples.map(sample => sample.renderMs))
            };
            const instrumentedSummary = {
                stepSimulation: summarize(internal.samples.map(sample => sample.stepMs)),
                decayWindTrails: summarize(internal.samples.map(sample => sample.windMs)),
                renderWorld: summarize(internal.samples.map(sample => sample.renderMs))
            };
            const hookEvents = internal.events;
            const setupHookNames = [...new Set(fixture.setupEvents.map(event => event.name))];
            const hookSummary = summarizeHooks(hookEvents);
            const requiredForScenario = hookNames.filter(name => {
                if (name === 'ordinarySparkPropagation') return Boolean(fixture.sparkSeed);
                if (name === 'batteryLoadTraversal') return Boolean(fixture.battery);
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
                const traversedLoads = hookEvents.filter(event => event.name === 'batteryLoadTraversal')
                    .reduce((sum, event) => sum + Number(event.counters?.loadMachines || 0), 0);
                if (!(traversedLoads > 0)) missingHooks.push('batteryLoadTraversal.loadMachines counter');
            }

            results.push({
                size: { cols: size.cols, rows: size.rows },
                browser: browserInfo,
                fixture: {
                    ...fixture,
                    setupEvents: undefined,
                    setupHookNames,
                    missingHooks,
                    hookEventCounts: Object.fromEntries(hookNames.map(name => [
                        name,
                        hookEvents.filter(event => event.name === name).length
                    ]))
                },
                externalSummary,
                instrumentedSummary,
                hookSummary,
                hookEvents
            });
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
        'spark', 'battery', 'lamp', 'stepMedianMs', 'stepP95Ms', 'windMedianMs', 'windP95Ms',
        'renderMedianMs', 'renderP95Ms', 'missingHooks',
        ...hookNames.flatMap(name => [`${name}Count`, `${name}MedianMs`, `${name}P95Ms`])
    ];
    const csvRows = [csvColumns.join(',')];
    for (const result of results) {
        const { fixture, size } = result;
        const values = [
            size.cols, size.rows, fixture.scenario, fixture.worldCells, fixture.nonEmptyCells,
            fixture.countsByName.Sand, fixture.countsByName.Water, fixture.countsByName.Fire,
            fixture.countsByName.Elec, fixture.countsByName.Spark, fixture.countsByName.Battery,
            fixture.countsByName.Lamp,
            result.externalSummary.stepSimulation.medianMs,
            result.externalSummary.stepSimulation.p95Ms,
            result.externalSummary.decayWindTrails.medianMs,
            result.externalSummary.decayWindTrails.p95Ms,
            result.externalSummary.renderWorld.medianMs,
            result.externalSummary.renderWorld.p95Ms,
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
    console.table(results.map(result => ({
        world: `${result.size.cols}×${result.size.rows}`,
        scenario: result.fixture.scenario,
        stepMedianMs: result.externalSummary.stepSimulation.medianMs.toFixed(3),
        stepP95Ms: result.externalSummary.stepSimulation.p95Ms.toFixed(3),
        renderMedianMs: result.externalSummary.renderWorld.medianMs.toFixed(3),
        missingHooks: result.fixture.missingHooks.join(', ') || 'none'
    })));
    expect(missing, 'Frontend instrumentation hooks required by performance/README.md').toEqual([]);
});
