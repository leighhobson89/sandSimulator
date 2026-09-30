import { expect, test } from '@playwright/test';
import { GamePage } from '../e2e/helpers/gamePage.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const WARMUP_SAMPLES = 2;
const MEASURED_SAMPLES = 8;
const scenarios = [
    { id: 'sandbox', missionId: null, material: 'Sand' },
    { id: 'campaign-placement', missionId: 'three-states', material: 'Sand' },
    { id: 'campaign-world-state', missionId: 'controlled-burn', material: 'Water' }
];

function summarize(samples) {
    const sorted = [...samples].sort((a, b) => a - b);
    return {
        medianMs: sorted.length % 2
            ? sorted[Math.floor(sorted.length / 2)]
            : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
        p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
        meanMs: samples.reduce((sum, value) => sum + value, 0) / samples.length
    };
}

test('paused brush placement benchmark compares Sandbox, campaign, and pending world-state objectives', async ({ page }) => {
    test.setTimeout(5 * 60 * 1000);
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();

    const results = [];
    for (const scenario of scenarios) {
        for (const brushSize of [1, 31]) {
            const result = await page.evaluate(async ({ scenario, brushSize, warmupSamples, measuredSamples }) => {
                const physics = await import('/physics.js');
                const campaign = await import('/campaign.js');
                const globals = await import('/constantsAndGlobalVars.js');
                const game = await import('/game.js');
                const recorder = window.__P0_PERF__ ||= {
                    enabled: false,
                    events: [],
                    record(name, durationMs, counters = {}) { this.events.push({ name, durationMs, counters }); },
                    reset() { this.events.length = 0; },
                    snapshot() { return this.events.slice(); }
                };
                const idFor = name => physics.getDefinitions()
                    .findIndex(definition => definition?.name === name);
                const setup = () => {
                    physics.clearWorld();
                    if (scenario.missionId) campaign.startCampaign(scenario.missionId);
                    else campaign.clearCampaign();

                    if (scenario.missionId === 'controlled-burn') {
                        const fireId = idFor('Fire');
                        const smokeId = idFor('Smoke');
                        physics.setCell(2, 2, idFor('Wood'));
                        physics.setCell(3, 2, fireId);
                        campaign.consumeCampaignMaterial('Fire');
                        for (let frame = 0; frame < 60; frame++) campaign.recordCampaignSimulationStep();
                        campaign.recordMaterialTransition(fireId, smokeId, { cause: 'water' });
                    }

                    globals.setBrushSize(brushSize);
                    globals.setParticleTypeIdSelected(idFor(scenario.material));
                };
                let stateChanges = 0;
                const onCampaignChange = () => stateChanges++;
                window.addEventListener('campaign-state-change', onCampaignChange);

                const durations = [];
                const acceptedCells = [];
                let placementNotifications = [];
                recorder.enabled = false;
                for (let sample = 0; sample < warmupSamples + measuredSamples; sample++) {
                    setup();
                    stateChanges = 0;
                    const materialId = idFor(scenario.material);
                    const before = physics.getWorld().type.reduce((count, id) => count + (id === materialId ? 1 : 0), 0);
                    const originalRandom = Math.random;
                    Math.random = () => 0.99;
                    const startedAt = performance.now();
                    try {
                        game.paintCell(40, 40);
                    } finally {
                        Math.random = originalRandom;
                    }
                    const durationMs = performance.now() - startedAt;
                    const after = physics.getWorld().type.reduce((count, id) => count + (id === materialId ? 1 : 0), 0);
                    if (sample >= warmupSamples) {
                        durations.push(durationMs);
                        acceptedCells.push(after - before);
                        placementNotifications.push(stateChanges);
                    }
                }

                setup();
                stateChanges = 0;
                recorder.reset();
                recorder.enabled = true;
                game.paintCell(40, 40);
                recorder.enabled = false;
                const measuredScanEvents = recorder.snapshot()
                    .filter(event => event.name === 'campaignWorldStateObjectiveScan');
                window.removeEventListener('campaign-state-change', onCampaignChange);
                const scanHookAvailable = scenario.id !== 'campaign-world-state' || measuredScanEvents.length > 0;

                return {
                    durations,
                    acceptedCells,
                    placementNotifications,
                    measuredScanEvents,
                    scanHookAvailable,
                    scanCount: scanHookAvailable ? measuredScanEvents.length : null,
                    worldCellsScanned: scanHookAvailable ? measuredScanEvents.reduce((sum, event) =>
                        sum + Number(event.counters?.worldCells || 0), 0) : null,
                    pendingObjectives: scanHookAvailable ? Math.max(0, ...measuredScanEvents.map(event =>
                        Number(event.counters?.pendingObjectives || 0))) : null
                };
            }, { scenario, brushSize, warmupSamples: WARMUP_SAMPLES, measuredSamples: MEASURED_SAMPLES });

            expect(result.durations).toHaveLength(MEASURED_SAMPLES);
            expect(result.acceptedCells).toHaveLength(MEASURED_SAMPLES);
            const timing = summarize(result.durations);
            const accepted = summarize(result.acceptedCells);
            const notifications = summarize(result.placementNotifications);
            results.push({
                scenario: scenario.id,
                brushSize,
                ...timing,
                acceptedCellsMedian: accepted.medianMs,
                acceptedCellsP95: accepted.p95Ms,
                campaignNotificationsMedian: notifications.medianMs,
                campaignNotificationsP95: notifications.p95Ms,
                scanHookAvailable: result.scanHookAvailable,
                objectiveScansPerPaint: result.scanCount,
                worldCellsScannedPerPaint: result.worldCellsScanned,
                pendingObjectives: result.pendingObjectives
            });
        }
    }

    const browser = page.context().browser();
    const metadata = {
        capturedAt: new Date().toISOString(),
        browserName: browser?.browserType().name() || 'unavailable',
        browserVersion: browser?.version() || 'unavailable',
        userAgent: await page.evaluate(() => navigator.userAgent),
        platform: os.platform(),
        platformRelease: os.release(),
        architecture: os.arch(),
        cpu: os.cpus()[0]?.model || 'unavailable',
        logicalCpuCount: os.cpus().length,
        nodeVersion: process.version,
        world: '260x150',
        warmupSamples: WARMUP_SAMPLES,
        measuredSamples: MEASURED_SAMPLES
    };
    const artifactDir = path.resolve('test-results/performance');
    await mkdir(artifactDir, { recursive: true });
    const artifactPath = path.join(artifactDir, 'campaign-brush.json');
    await writeFile(artifactPath, `${JSON.stringify({ metadata, results }, null, 2)}\n`);

    console.log(`Brush benchmark (warm-up ${WARMUP_SAMPLES}, measured ${MEASURED_SAMPLES} samples):`);
    console.table(results);
    console.log(`Campaign brush artifact: ${artifactPath}`);
    expect(results).toHaveLength(scenarios.length * 2);
});
