import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { canvasPoint, expectCanvasVisible } from '../e2e/helpers/canvas.mjs';

const WARMUP_FRAMES = 10;
const MEASURED_FRAMES = 60;
const SEED = 0x6a09e667;
const WORLD_CELLS = 260 * 150;
const STAGES = [
    'simulationStage:environmentOpenAir',
    'simulationStage:thermalSurfaces',
    'simulationStage:machinesPower',
    'simulationStage:airTransport',
    'simulationStage:particleScan',
    'simulationStage:postProcessing'
];

function summarize(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return {
        samples: values.length,
        p50Ms: sorted.length % 2
            ? sorted[Math.floor(sorted.length / 2)]
            : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
        p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
        maxMs: sorted[sorted.length - 1]
    };
}

function summarizeStages(events) {
    return Object.fromEntries(STAGES.map(name => [name, summarize(events
        .filter(event => event.name === name)
        .map(event => event.durationMs))]));
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

async function captureBrowserEnvironment(page) {
    return page.evaluate(() => {
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
}

async function captureFixtureState(page, simulationPaused) {
    return page.evaluate(async ({ simulationPaused }) => {
        const physics = await import('/physics.js');
        const campaign = await import('/campaign.js');
        const world = physics.getWorld();
        const definitions = physics.getDefinitions();
        const count = name => {
            const id = definitions.findIndex(definition => definition?.name === name);
            return world.type.reduce((total, type) => total + (type === id ? 1 : 0), 0);
        };
        const state = campaign.getCampaignState();
        return {
            simulationPaused,
            worldSize: { cols: world.cols, rows: world.rows, cells: world.type.length },
            particles: Object.fromEntries(['Fire', 'Water', 'Wood', 'Wall'].map(name => [name, count(name)])),
            powerState: {
                poweredCells: world.power.reduce((total, value) => total + (value > 0 ? 1 : 0), 0),
                transientDelayCells: world.powerDelay.reduce((total, value) => total + (value > 0 ? 1 : 0), 0)
            },
            campaign: state ? {
                missionId: state.missionId,
                objectiveProgress: { ...state.objectiveProgress },
                waterResource: { ...state.resources.materials.Water }
            } : null
        };
    }, { simulationPaused });
}

async function startLiveSandbox(page) {
    await page.goto('/');
    expect(await page.evaluate(() => window.__E2E_MODE__)).toBe(false);
    await page.locator('#newGame').click();
    await page.locator('#worldSizeStandard').check();
    await page.locator('#worldSizeStart').click();
    const autosaveChoice = page.locator('#autosaveChoiceDialog');
    if (await autosaveChoice.isVisible()) {
        await page.getByRole('button', { name: 'No, play without autosave', exact: true }).click();
    }
    await expectCanvasVisible(page);
    await expect(page.locator('#pauseButton')).toHaveText('Pause');
}

async function installRecorder(page) {
    await page.evaluate(() => {
        window.__P0_PERF__ = {
            enabled: true,
            events: [],
            record(name, durationMs, counters = {}) {
                if (this.enabled) this.events.push({ name, durationMs, counters });
            },
            reset() { this.events.length = 0; },
            snapshot() { return this.events.slice(); }
        };
    });
}

async function collectLiveFrameSamples(page) {
    await page.evaluate(() => window.__P0_PERF__.reset());
    await page.waitForFunction(minimum => window.__P0_PERF__?.events
        .filter(event => event.name === 'animationFrame').length >= minimum,
    WARMUP_FRAMES);
    await page.evaluate(() => window.__P0_PERF__.reset());
    await page.waitForFunction(minimum => window.__P0_PERF__?.events
        .filter(event => event.name === 'animationFrame').length >= minimum,
    MEASURED_FRAMES);
    return page.evaluate(() => window.__P0_PERF__.snapshot());
}

async function stageMissionSix(page) {
    const staged = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const campaign = await import('/campaign.js');
        physics.clearWorld();
        const idFor = name => physics.getDefinitions().findIndex(definition => definition?.name === name);
        const woodId = idFor('Wood');
        const fireId = idFor('Fire');
        const smokeId = idFor('Smoke');
        const wallId = idFor('Wall');
        campaign.startCampaign('controlled-burn');
        physics.setCell(220, 120, woodId);
        for (let y = -1; y <= 1; y++) {
            for (let x = -1; x <= 1; x++) {
                if (x === 0 && y === 0) continue;
                physics.setCell(200 + x, 20 + y, wallId);
            }
        }
        physics.setCell(200, 20, fireId);
        const fireIndex = physics.index(200, 20);
        // life and lifeMax are Int16Array planes; 30,000 is safely above the
        // measured window and does not wrap negative like 100,000 did.
        physics.getWorld().life[fireIndex] = 30_000;
        physics.getWorld().lifeMax[fireIndex] = 30_000;
        physics.setRandomSeed(0x6a09e667);
        campaign.consumeCampaignMaterial('Fire');
        for (let step = 0; step < 60; step++) campaign.recordCampaignSimulationStep();
        campaign.recordMaterialTransition(fireId, smokeId, { cause: 'water' });
        window.dispatchEvent(new Event('campaign-state-change'));
        const state = campaign.getCampaignState();
        const mission = campaign.getCurrentMission();
        return {
            missionId: state.missionId,
            confirmFireOutProgress: state.objectiveProgress['confirm-fire-out'],
            quenchProgress: state.objectiveProgress['quench-with-water'],
            pendingWorldStateObjectives: mission.objectives.filter(objective =>
                objective.type === 'world-state' &&
                (state.objectiveProgress[objective.id] || 0) < objective.target).length,
            waterUnlocked: campaign.canUseMaterial('Water'),
            fireCount: physics.getWorld().type.reduce((count, id) => count + (id === fireId ? 1 : 0), 0),
            woodCount: physics.getWorld().type.reduce((count, id) => count + (id === woodId ? 1 : 0), 0),
            wallCount: physics.getWorld().type.reduce((count, id) => count + (id === wallId ? 1 : 0), 0),
            fireLife: physics.getWorld().life[fireIndex]
        };
    });
    await expect(page.locator('#missionHud')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Water', exact: true })).toBeVisible();
    expect(staged).toMatchObject({
        missionId: 'controlled-burn',
        confirmFireOutProgress: 0,
        quenchProgress: 1,
        pendingWorldStateObjectives: 1,
        waterUnlocked: true
    });
    expect(staged.fireCount).toBeGreaterThan(0);
    expect(staged.woodCount).toBeGreaterThan(0);
    expect(staged.wallCount).toBe(8);
    expect(staged.fireLife).toBeGreaterThan(MEASURED_FRAMES + WARMUP_FRAMES);
}

function expectNumericEvent(event) {
    expect(event.durationMs).toEqual(expect.any(Number));
    expect(event.durationMs).toBeGreaterThanOrEqual(0);
    expect(Object.values(event.counters || {}).every(Number.isFinite)).toBe(true);
}

test('live frame telemetry preserves stage order and attributes a Mission 6 brush input through draw completion', async ({ page }) => {
    test.setTimeout(5 * 60 * 1000);
    await startLiveSandbox(page);
    await page.evaluate(async seed => (await import('/physics.js')).setRandomSeed(seed), SEED);
    await installRecorder(page);

    const sandboxEvents = await collectLiveFrameSamples(page);
    const sandboxFrames = sandboxEvents.filter(event => event.name === 'animationFrame').slice(0, MEASURED_FRAMES);
    expect(sandboxFrames).toHaveLength(MEASURED_FRAMES);
    for (const frame of sandboxFrames) {
        expectNumericEvent(frame);
        expect(frame.counters).toMatchObject({ frameIndex: expect.any(Number), rafTimestampMs: expect.any(Number) });
    }

    const sandboxDurations = sandboxFrames.map(event => event.durationMs);
    const sandboxStepEvents = sandboxEvents.filter(event => event.name === 'stepSimulation');
    const sandboxStageEvents = sandboxEvents.filter(event => STAGES.includes(event.name));
    expect(sandboxStepEvents.length).toBeGreaterThanOrEqual(MEASURED_FRAMES);
    expect(sandboxStepEvents.every(event => event.counters?.worldCells === WORLD_CELLS)).toBe(true);
    expect(sandboxStageEvents.slice(0, STAGES.length * MEASURED_FRAMES).map(event => event.name))
        .toEqual(Array.from({ length: MEASURED_FRAMES }, () => STAGES).flat());
    for (const event of sandboxStageEvents.slice(0, STAGES.length * MEASURED_FRAMES)) {
        expectNumericEvent(event);
        expect(event.counters).toMatchObject({ worldCells: WORLD_CELLS });
    }
    const sandboxMeasuredStages = sandboxStageEvents.slice(0, STAGES.length * MEASURED_FRAMES);
    const sandboxFixture = await captureFixtureState(page, false);

    await page.getByRole('button', { name: 'Water', exact: true }).click();
    await page.locator('#brushSize').fill('31');
    const sandboxPoint = await canvasPoint(page, { x: 40, y: 40 });
    const sandboxBeforeClick = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const waterId = physics.getDefinitions().findIndex(definition => definition?.name === 'Water');
        window.__P0_PERF__.reset();
        return physics.getWorld().type.reduce((count, id) => count + (id === waterId ? 1 : 0), 0);
    });
    await page.mouse.click(sandboxPoint.x, sandboxPoint.y);
    await page.waitForFunction(() => window.__P0_PERF__?.events.some(event =>
        event.name === 'inputToNextDrawCompleteMs'));
    const sandboxClick = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const waterId = physics.getDefinitions().findIndex(definition => definition?.name === 'Water');
        const events = window.__P0_PERF__.snapshot();
        return {
            waterCells: physics.getWorld().type.reduce((count, id) => count + (id === waterId ? 1 : 0), 0),
            paintEvents: events.filter(event => event.name === 'inputToNextDrawCompleteMs'),
            stepEvents: events.filter(event => event.name === 'stepSimulation').length,
            scans: events.filter(event => event.name === 'campaignWorldStateObjectiveScan')
        };
    });
    expect(sandboxClick.waterCells - sandboxBeforeClick).toBe(709);
    expect(sandboxClick.paintEvents).toHaveLength(1);
    expectNumericEvent(sandboxClick.paintEvents[0]);
    expect(sandboxClick.paintEvents[0].counters).toMatchObject({ inputCount: 1, brushSize: 31 });
    expect(sandboxClick.scans).toHaveLength(0);

    await stageMissionSix(page);
    const missionEvents = await collectLiveFrameSamples(page);
    const missionFrames = missionEvents.filter(event => event.name === 'animationFrame').slice(0, MEASURED_FRAMES);
    expect(missionFrames).toHaveLength(MEASURED_FRAMES);
    const missionSteps = missionEvents.filter(event => event.name === 'stepSimulation');
    const missionScans = missionEvents.filter(event => event.name === 'campaignWorldStateObjectiveScan');
    expect(missionSteps.length).toBeGreaterThanOrEqual(MEASURED_FRAMES);
    expect(missionScans).toHaveLength(missionSteps.length);
    for (const event of missionScans) {
        expectNumericEvent(event);
        expect(event.counters).toEqual({ worldCells: WORLD_CELLS, pendingObjectives: 1 });
    }
    expect(missionEvents.filter(event => STAGES.includes(event.name))
        .slice(0, STAGES.length * MEASURED_FRAMES).map(event => event.name))
        .toEqual(Array.from({ length: MEASURED_FRAMES }, () => STAGES).flat());
    const missionWorld = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const campaign = await import('/campaign.js');
        const definitions = physics.getDefinitions();
        const world = physics.getWorld();
        const count = name => {
            const id = definitions.findIndex(definition => definition?.name === name);
            return world.type.reduce((total, type) => total + (type === id ? 1 : 0), 0);
        };
        return {
            missionId: campaign.getCampaignState().missionId,
            worldStateProgress: campaign.getCampaignState().objectiveProgress['confirm-fire-out'],
            quenchProgress: campaign.getCampaignState().objectiveProgress['quench-with-water'],
            wood: count('Wood'),
            fire: count('Fire'),
            wall: count('Wall'),
            fireLife: (() => {
                const fireId = definitions.findIndex(definition => definition?.name === 'Fire');
                const fireIndex = world.type.findIndex(id => id === fireId);
                return fireIndex < 0 ? 0 : world.life[fireIndex];
            })(),
            water: count('Water'),
            poweredCells: world.power.reduce((total, value) => total + (value > 0 ? 1 : 0), 0),
            transientDelayCells: world.powerDelay.reduce((total, value) => total + (value > 0 ? 1 : 0), 0),
            waterUnlocked: campaign.getCampaignState().resources.materials.Water.unlocked,
            pendingWorldStateObjectives: campaign.getCurrentMission().objectives.filter(objective =>
                objective.type === 'world-state' &&
                (campaign.getCampaignState().objectiveProgress[objective.id] || 0) < objective.target).length
        };
    });
    expect(missionWorld).toMatchObject({
        missionId: 'controlled-burn', worldStateProgress: 0, quenchProgress: 1,
        water: 0, waterUnlocked: true, pendingWorldStateObjectives: 1
    });
    expect(missionWorld.wood).toBeGreaterThan(0);
    expect(missionWorld.fire).toBeGreaterThan(0);
    expect(missionWorld.wall).toBe(8);
    expect(missionWorld.fireLife).toBeGreaterThan(0);
    const missionFixture = await captureFixtureState(page, false);

    await page.getByRole('button', { name: 'Water', exact: true }).click();
    await page.locator('#brushSize').fill('31');
    const point = await canvasPoint(page, { x: 40, y: 40 });
    const beforeClick = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const waterId = physics.getDefinitions().findIndex(definition => definition?.name === 'Water');
        window.__LIVE_PAINT_STATE_CHANGES__ = 0;
        window.__LIVE_PAINT_STATE_CHANGE_LISTENER__ = () => window.__LIVE_PAINT_STATE_CHANGES__++;
        window.addEventListener('campaign-state-change', window.__LIVE_PAINT_STATE_CHANGE_LISTENER__);
        window.__P0_PERF__.reset();
        return physics.getWorld().type.reduce((total, type) => total + (type === waterId ? 1 : 0), 0);
    });
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => window.__P0_PERF__?.events.some(event =>
        event.name === 'inputToNextDrawCompleteMs'));
    const clickResult = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const campaign = await import('/campaign.js');
        const definitions = physics.getDefinitions();
        const waterId = definitions.findIndex(definition => definition?.name === 'Water');
        const events = window.__P0_PERF__.snapshot();
        const result = {
            waterCells: physics.getWorld().type.reduce((total, type) => total + (type === waterId ? 1 : 0), 0),
            waterUsed: campaign.getCampaignState().resources.materials.Water.used,
            worldStateProgress: campaign.getCampaignState().objectiveProgress['confirm-fire-out'],
            stateChanges: window.__LIVE_PAINT_STATE_CHANGES__,
            paintEvents: events.filter(event => event.name === 'inputToNextDrawCompleteMs'),
            scans: events.filter(event => event.name === 'campaignWorldStateObjectiveScan'),
            stepEvents: events.filter(event => event.name === 'stepSimulation')
        };
        window.removeEventListener('campaign-state-change', window.__LIVE_PAINT_STATE_CHANGE_LISTENER__);
        return result;
    });
    expect(clickResult.waterCells - beforeClick).toBe(709);
    expect(clickResult.waterUsed).toBe(709);
    expect(clickResult.worldStateProgress).toBe(0);
    expect(clickResult.stateChanges).toBe(1);
    expect(clickResult.paintEvents).toHaveLength(1);
    expectNumericEvent(clickResult.paintEvents[0]);
    expect(clickResult.paintEvents[0].counters).toMatchObject({ inputCount: 1, brushSize: 31 });
    expect(clickResult.scans).toHaveLength(clickResult.stepEvents.length + 1);
    expect(clickResult.scans.every(event => event.counters.worldCells === WORLD_CELLS &&
        event.counters.pendingObjectives === 1)).toBe(true);

    const missionIntervals = missionFrames.map(event => event.durationMs);
    const missionMeasuredStages = missionEvents.filter(event => STAGES.includes(event.name))
        .slice(0, STAGES.length * MEASURED_FRAMES);
    const browser = page.context().browser();
    const browserEnvironment = await captureBrowserEnvironment(page);
    const results = {
        metadata: {
            recordedAt: new Date().toISOString(),
            commit: commitId(),
            workingTree: workingTreeStatus(),
            nodeVersion: process.version,
            host: {
                platform: os.platform(),
                release: os.release(),
                version: os.version(),
                architecture: os.arch(),
                cpuModel: os.cpus()[0]?.model || 'unavailable',
                logicalCores: os.cpus().length,
                totalMemoryBytes: os.totalmem()
            },
            browserVersion: browser?.version() || 'unavailable',
            browserEnvironment,
            warmupSamples: WARMUP_FRAMES,
            measuredSamples: MEASURED_FRAMES,
            sampleIntervalMetric: 'animationFrame durationMs is the observed requestAnimationFrame callback interval.',
            scope: 'live-normal-game-loop',
            seed: SEED,
            worldSize: { cols: 260, rows: 150, cells: WORLD_CELLS },
            instrumentationContract: [
                ...STAGES, 'stepSimulation', 'airScalarTransport', 'campaignWorldStateObjectiveScan',
                'animationFrame', 'inputToNextDrawCompleteMs'
            ]
        },
        sandbox: {
            fixture: sandboxFixture,
            rafIntervalsMs: sandboxDurations,
            rafInterval: summarize(sandboxDurations),
            stepEvents: sandboxStepEvents.length,
            stageEvents: sandboxStageEvents.length,
            sampleCounts: {
                rafIntervals: sandboxFrames.length,
                simulationSteps: sandboxStepEvents.length,
                stageEvents: sandboxMeasuredStages.length,
                stageEventsPerStage: Object.fromEntries(STAGES.map(name => [name,
                    sandboxMeasuredStages.filter(event => event.name === name).length]))
            },
            stageDurations: summarizeStages(sandboxMeasuredStages),
            click: {
                simulationPaused: false,
                placedCells: sandboxClick.waterCells - sandboxBeforeClick,
                inputToDrawMs: sandboxClick.paintEvents.map(event => event.durationMs),
                inputEvents: sandboxClick.paintEvents.length,
                concurrentSimulationSteps: sandboxClick.stepEvents,
                campaignScans: sandboxClick.scans.length
            }
        },
        missionSix: {
            fixture: missionFixture,
            rafIntervalsMs: missionIntervals,
            rafInterval: summarize(missionIntervals),
            stepEvents: missionSteps.length,
            worldStateScans: missionScans.length,
            sampleCounts: {
                rafIntervals: missionFrames.length,
                simulationSteps: missionSteps.length,
                stageEvents: missionMeasuredStages.length,
                stageEventsPerStage: Object.fromEntries(STAGES.map(name => [name,
                    missionMeasuredStages.filter(event => event.name === name).length])),
                worldStateScans: missionScans.length
            },
            stageDurations: summarizeStages(missionMeasuredStages),
            clickPaintCells: clickResult.waterCells - beforeClick,
            clickNotifications: clickResult.stateChanges,
            clickWorldStateScans: clickResult.scans.length,
            clickSimulationPaused: false,
            clickSimulationSteps: clickResult.stepEvents.length,
            inputToDraw: clickResult.paintEvents.map(event => event.durationMs)
        }
    };
    const artifactDir = path.resolve('test-results/performance');
    await mkdir(artifactDir, { recursive: true });
    const artifactPath = path.join(artifactDir, 'live-frame.json');
    await writeFile(artifactPath, `${JSON.stringify(results, null, 2)}\n`);
    console.log('Live frame telemetry:');
    console.table([
        { scenario: 'Sandbox', ...results.sandbox.rafInterval, stepEvents: results.sandbox.stepEvents,
            clickInputMs: results.sandbox.click.inputToDrawMs[0], clickScans: results.sandbox.click.campaignScans },
        { scenario: 'Mission 6', ...results.missionSix.rafInterval, stepEvents: results.missionSix.stepEvents,
            scans: results.missionSix.worldStateScans, clickInputMs: results.missionSix.inputToDraw[0],
            clickScans: results.missionSix.clickWorldStateScans }
    ]);
    console.log('Per-stage duration distributions (instrumented live frames):');
    console.table(['sandbox', 'missionSix'].flatMap(scenario => STAGES.map(name => ({
        scenario,
        stage: name,
        ...results[scenario].stageDurations[name]
    }))));
    console.log(`Live frame telemetry artifact: ${artifactPath}`);
});
