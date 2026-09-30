import { expect, test } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';
import { setupPhysics } from './fixtures.mjs';

const WORLD_CELLS = 260 * 150;
const STAGES = [
    'simulationStage:environmentOpenAir',
    'simulationStage:thermalSurfaces',
    'simulationStage:machinesPower',
    'simulationStage:airTransport',
    'simulationStage:particleScan',
    'simulationStage:postProcessing'
];
const POST_PROCESSING_STAGES = [
    'simulationStage:postProcessing:flushAmbientPendingChanges',
    'simulationStage:postProcessing:processAmbientIlluminationWork',
    'simulationStage:postProcessing:processMaturePlantGrowthCandidates',
    'simulationStage:postProcessing:simulationStepListener'
];
const AMBIENT_FLUSH_STAGES = [
    'simulationStage:postProcessing:ambientFlush:pendingClassificationFilter',
    'simulationStage:postProcessing:ambientFlush:columnRefresh',
    'simulationStage:postProcessing:ambientFlush:rowRefresh',
    'simulationStage:postProcessing:ambientFlush:shadowWedgeEnqueueFallback'
];

test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus) await attachGameDiagnostics(info, page, 'performance-telemetry');
});

test('simulation telemetry follows the six-stage order without changing seeded state', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await setupPhysics(page, {
        seed: 20260930,
        cells: [
            { x: 30, y: 20, material: 'Glass' },
            { x: 50, y: 20, material: 'Glass' },
            { x: 70, y: 20, material: 'Glass' },
            { x: 71, y: 20, material: 'Insulation' }
        ]
    });

    const result = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const recorder = window.__P0_PERF__ = {
            enabled: false,
            events: [],
            record(name, durationMs, counters = {}) {
                if (this.enabled) this.events.push({ name, durationMs, counters });
            },
            reset() { this.events.length = 0; },
            snapshot() { return this.events.slice(); }
        };
        const startingState = structuredClone(physics.captureSimulationState());
        const randomSeed = 0x5eed1234;
        const run = enabled => {
            physics.restoreSimulationState(structuredClone(startingState));
            physics.setRandomSeed(randomSeed);
            recorder.enabled = enabled;
            recorder.reset();
            for (let tick = 0; tick < 4; tick++) physics.stepSimulation();
            return {
                state: structuredClone(physics.captureSimulationState()),
                events: recorder.snapshot()
            };
        };
        const uninstrumented = run(false);
        const instrumented = run(true);
        const sameSimulationState = (left, right) => {
            const leftScalars = Object.fromEntries(Object.entries(left).filter(([key]) => key !== 'arrays'));
            const rightScalars = Object.fromEntries(Object.entries(right).filter(([key]) => key !== 'arrays'));
            if (JSON.stringify(leftScalars) !== JSON.stringify(rightScalars)) return false;
            const fields = Object.keys(left.arrays);
            if (JSON.stringify(fields) !== JSON.stringify(Object.keys(right.arrays))) return false;
            return fields.every(field => {
                const a = left.arrays[field];
                const b = right.arrays[field];
                if (a.length !== b.length) return false;
                for (let index = 0; index < a.length; index++) {
                    if (!Object.is(a[index], b[index])) return false;
                }
                return true;
            });
        };
        return {
            stateParity: sameSimulationState(uninstrumented.state, instrumented.state),
            offEvents: uninstrumented.events,
            events: instrumented.events
        };
    });

    expect(result.stateParity).toBe(true);
    expect(result.offEvents).toEqual([]);
    const stageEvents = result.events.filter(event => STAGES.includes(event.name));
    expect(stageEvents.map(event => event.name)).toEqual(Array.from({ length: 4 }, () => STAGES).flat());
    expect(stageEvents.every(event => event.counters?.worldCells === WORLD_CELLS)).toBe(true);
    const postProcessingEvents = result.events.filter(event => POST_PROCESSING_STAGES.includes(event.name));
    expect(postProcessingEvents.map(event => event.name)).toEqual(
        Array.from({ length: 4 }, () => POST_PROCESSING_STAGES).flat());
    expect(postProcessingEvents.every(event => Object.keys(event.counters || {}).length > 0 &&
        Object.values(event.counters).every(Number.isFinite))).toBe(true);
    const ambientFlushEvents = result.events.filter(event => AMBIENT_FLUSH_STAGES.includes(event.name));
    expect(ambientFlushEvents.map(event => event.name)).toEqual(
        Array.from({ length: 4 }, () => AMBIENT_FLUSH_STAGES).flat());
    expect(ambientFlushEvents.every(event => Object.keys(event.counters || {}).length > 0 &&
        Object.values(event.counters).every(Number.isFinite) &&
        Object.values(event.counters).some(value => value === 0))).toBe(true);
    const postProcessingParentEvents = result.events.filter(event =>
        event.name === 'simulationStage:postProcessing');
    expect(postProcessingParentEvents).toHaveLength(4);
    for (let tick = 0; tick < 4; tick++) {
        const parentIndex = result.events.indexOf(postProcessingParentEvents[tick]);
        const previousStepIndex = tick === 0 ? -1 : result.events.indexOf(
            result.events.filter(event => event.name === 'stepSimulation')[tick - 1]);
        const postSubstageNames = result.events.slice(previousStepIndex + 1, parentIndex)
            .filter(event => POST_PROCESSING_STAGES.includes(event.name))
            .map(event => event.name);
        expect(postSubstageNames).toEqual(POST_PROCESSING_STAGES);
        const tickEvents = result.events.slice(previousStepIndex + 1, parentIndex);
        expect(tickEvents.filter(event => AMBIENT_FLUSH_STAGES.includes(event.name))
            .map(event => event.name)).toEqual(AMBIENT_FLUSH_STAGES);
    }
    expect(result.events.filter(event => event.name === 'stepSimulation')).toHaveLength(4);
    expect(result.events.filter(event => event.name === 'airScalarTransport')).toHaveLength(4);
    for (const event of result.events) {
        expect(event.durationMs).toEqual(expect.any(Number));
        expect(event.durationMs).toBeGreaterThanOrEqual(0);
        expect(Object.values(event.counters).every(Number.isFinite)).toBe(true);
    }
});
