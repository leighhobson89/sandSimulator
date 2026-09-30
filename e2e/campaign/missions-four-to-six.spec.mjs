import { test, expect } from '@playwright/test';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';
import { clickCanvasCell } from '../helpers/canvas.mjs';

test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus) await attachGameDiagnostics(info, page, 'campaign-missions-four-to-six');
});

async function loadMission(page, number) {
    await page.goto('/?e2e');
    await page.evaluate(() => localStorage.clear());
    await page.getByRole('button', { name: 'New Campaign', exact: true }).click();
    await expect(page.locator('#missionIntroDialog')).toBeVisible();
    if (number === 4) {
        await page.evaluate(async () => {
            const physics = await import('/physics.js');
            physics.setAmbientTargetImmediately(2000);
            physics.getWorld().temp.fill(2000);
        });
    }

    const missionId = await page.evaluate(async missionNumber => {
        const mission = (await import('/campaign.js')).getMissionDefinitions()
            .find(item => item.number === missionNumber);
        if (!mission) throw new Error(`Campaign mission ${missionNumber} is not defined.`);
        return mission.id;
    }, number);
    await page.keyboard.press('NumpadSubtract');
    await expect(page.locator('#debugMenu')).toBeVisible();
    await page.locator('#debugMissionSelect').selectOption(missionId);
    await expect(page.locator('#missionIntroDialog')).toBeVisible();
    await expect(page.locator('#missionIntroNumber')).toHaveText(String(number));
}

async function inspectCurrentMission(page) {
    return page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const saves = await import('/saveLoadGame.js');
        const mission = campaign.getCurrentMission();
        const world = physics.getWorld();
        const definitions = physics.getDefinitions();
        const floorMaterials = ['Sand', 'Dry Mud'];
        const floorIds = Object.fromEntries(floorMaterials.map(material =>
            [material, definitions.findIndex(definition => definition?.name === material)]));
        const counts = {};
        const woodId = definitions.findIndex(definition => definition?.name === 'Wood');
        const woodCells = [];
        const woodRowCounts = {};
        const woodColumnCounts = {};
        const wetSandXs = [];
        const wetSandRows = new Set();
        const floorCounts = Object.fromEntries(floorMaterials.map(material =>
            [material, Array.from({ length: 5 }, () => 0)]));
        const outsideFloorCounts = Object.fromEntries(floorMaterials.map(material => [material, 0]));
        for (let offset = 0; offset < 5; offset++) {
            const y = world.rows - 5 + offset;
            for (let x = 0; x < world.cols; x++) {
                const type = world.type[y * world.cols + x];
                for (const material of floorMaterials) {
                    if (type === floorIds[material]) floorCounts[material][offset]++;
                }
            }
        }
        for (let index = 0; index < world.type.length; index++) {
            const name = definitions[world.type[index]]?.name;
            if (!name) continue;
            counts[name] = (counts[name] || 0) + 1;
            const x = index % world.cols;
            const y = Math.floor(index / world.cols);
            if (name === 'Wood') {
                woodCells.push({ x, y });
                woodRowCounts[y] = (woodRowCounts[y] || 0) + 1;
                woodColumnCounts[x] = (woodColumnCounts[x] || 0) + 1;
            }
            if (name === 'Wet Sand') {
                wetSandXs.push(x);
                wetSandRows.add(y);
            }
            if (floorMaterials.includes(name) && y < world.rows - 5) outsideFloorCounts[name]++;
        }
        const minX = Math.min(...woodCells.map(cell => cell.x));
        const maxX = Math.max(...woodCells.map(cell => cell.x));
        const minY = Math.min(...woodCells.map(cell => cell.y));
        const maxY = Math.max(...woodCells.map(cell => cell.y));
        const fireX = Math.floor((minX + maxX) / 2);
        const fireY = minY - 1;
        const fireCellIndex = fireY * world.cols + fireX;
        const fireCellWoodNeighbors = [
            [fireX - 1, fireY], [fireX + 1, fireY], [fireX, fireY - 1], [fireX, fireY + 1]
        ].filter(([x, y]) => world.type[y * world.cols + x] === woodId).length;
        const woodTopSpanCount = woodRowCounts[minY] || 0;
        const cavityCellIndex = (minY + 1) * world.cols + fireX;
        const snapshot = mission.startingSave ? saves.parseSaveString(mission.startingSave) : null;
        const snapshotHumidity = snapshot?.simulation?.arrays?.humidity;
        let snapshotHumiditySample = null;
        if (snapshotHumidity?.type === 'Float32Array' && typeof snapshotHumidity.data === 'string') {
            const bytes = atob(snapshotHumidity.data);
            const sampleIndex = 140 * 260 + 129;
            const sampleBytes = Uint8Array.from({ length: 4 }, (_, offset) =>
                bytes.charCodeAt(sampleIndex * Float32Array.BYTES_PER_ELEMENT + offset));
            snapshotHumiditySample = new DataView(sampleBytes.buffer).getFloat32(0, true);
        }
        return {
            mission: {
                id: mission.id,
                number: mission.number,
                title: mission.title,
                briefing: mission.briefing,
                guidance: mission.guidance,
                world: mission.world,
                startingLayout: mission.startingLayout,
                hasStartingSave: Boolean(mission.startingSave),
                resourceBudgets: mission.resourceBudgets,
                environment: mission.environment,
                controlLimits: mission.controlLimits,
                lockedControls: mission.lockedControls,
                initiallyAvailableMaterials: mission.initiallyAvailableMaterials,
                unlimitedMaterials: mission.unlimitedMaterials,
                objectives: mission.objectives
            },
            cols: world.cols,
            rows: world.rows,
            counts,
            floorCounts,
            outsideFloorCounts,
            wetSandXs: wetSandXs.sort((left, right) => left - right),
            wetSandRows: [...wetSandRows],
            woodBounds: {
                minX, maxX, minY, maxY,
                width: maxX - minX + 1,
                height: maxY - minY + 1,
                count: woodCells.length
            },
            woodStructure: {
                topSpanCount: woodTopSpanCount,
                leftLegCell: definitions[world.type[(minY + 1) * world.cols + minX]]?.name || 'Empty',
                rightLegCell: definitions[world.type[(minY + 1) * world.cols + maxX]]?.name || 'Empty',
                cavityCell: definitions[world.type[cavityCellIndex]]?.name || 'Empty',
                cavityWidth: maxX - minX - 1,
                mostPopulatedRow: Math.max(...Object.values(woodRowCounts)),
                mostPopulatedColumn: Math.max(...Object.values(woodColumnCounts))
            },
            firePlacementCell: {
                x: fireX,
                y: fireY,
                material: definitions[world.type[fireCellIndex]]?.name || 'Empty',
                woodNeighbors: fireCellWoodNeighbors
            },
            humiditySample: world.humidity[140 * world.cols + 129],
            initialAirCellMaterial: definitions[world.type[0]]?.name || 'Unknown',
            initialAirTemperature: world.temp[0],
            environmentState: {
                temperature: physics.getAmbientTarget(),
                humidity: physics.getAmbientHumidityTarget(),
                illumination: physics.getAmbientIlluminationTarget(),
                dewpoint: physics.getDewpointTarget(),
                ambientWindOn: physics.getAmbientWindOn(),
                windStrength: physics.getGeneralWindStrength(),
                gustWindStrength: physics.getGustWindStrength()
            },
            snapshot: snapshot && {
                mode: snapshot.mode,
                campaign: snapshot.campaign,
                cols: snapshot.simulation.cols,
                rows: snapshot.simulation.rows,
                ...(mission.number === 5 ? {
                    ambientHumidity: snapshot.simulation.ambientHumidity,
                    humidityArrayType: snapshotHumidity?.type,
                    humiditySample: snapshotHumiditySample
                } : {})
            },
        };
    });
}

function expectFullFloor(snapshot, rows, material = 'Sand') {
    expect(snapshot.cols).toBe(260);
    expect(snapshot.rows).toBe(150);
    expect(snapshot.floorCounts[material]).toEqual([
        ...Array(5 - rows).fill(0),
        ...Array(rows).fill(260)
    ]);
    expect(snapshot.outsideFloorCounts[material]).toBe(0);
}

test('Mission 4 resets a hotter world, uses Snow as the only water source, and caps thawing at 8 C', async ({ page }) => {
    await loadMission(page, 4);
    const authored = await inspectCurrentMission(page);
    const mission = authored.mission;

    expect(mission).toMatchObject({
        id: 'meltwater-garden', number: 4,
        world: { cols: 260, rows: 150 },
        startingLayout: { type: 'floor', material: 'Dry Mud', rows: 5 },
        environment: {
            temperature: -10, humidity: 72, illumination: 70, dewpoint: 10,
            ambientWindOn: false, windStrength: 0, gustWindStrength: 0
        },
        controlLimits: { temperature: { max: 8 } },
        resourceBudgets: { materials: { Snow: 500, 'Red Tulip Seeds': 5 }, machines: {} }
    });
    expect(mission.objectives).toHaveLength(3);
    expect(mission.objectives.map(({ id, type, from, to, target }) => ({ id, type, from, to, target }))).toEqual([
        { id: expect.any(String), type: 'transformation', from: 'Snow', to: 'Water', target: 150 },
        { id: expect.any(String), type: 'transformation', from: 'Dry Mud', to: 'Wet Mud', target: 100 },
        { id: 'grow-tulip', type: 'transformation', from: 'Red Tulip Seeds', to: 'Red Tulip', target: 1 }
    ]);
    expect(new Set(mission.objectives.map(objective => objective.id)).size).toBe(3);
    expect(mission.objectives.every(objective => objective.target > 0 && objective.label)).toBe(true);
    expect(mission.lockedControls).toEqual(expect.arrayContaining(['humidity', 'illumination', 'dewpoint', 'wind']));
    expectFullFloor(authored, 5, 'Dry Mud');
    expect(authored.environmentState).toEqual({
        temperature: -10, humidity: 72, illumination: 70, dewpoint: 10,
        ambientWindOn: false, windStrength: 0, gustWindStrength: 0
    });
    expect(authored.initialAirTemperature).toBe(-10);
    expect(authored.initialAirCellMaterial).toBe('Air');
    for (const material of ['Water', 'Steam', 'Cloud', 'Sand', 'Wet Sand', 'Wet Mud']) {
        expect(authored.counts[material] || 0, `${material} is absent from the starting world`).toBe(0);
        expect(mission.resourceBudgets.materials[material] || 0, `${material} is absent from the loadout`).toBe(0);
    }

    const runtime = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        campaign.startCampaign('meltwater-garden');
        return {
            snow: campaign.canUseMaterial('Snow', 500),
            seeds: campaign.canUseMaterial('Red Tulip Seeds', 5),
            sixthSeed: campaign.canUseMaterial('Red Tulip Seeds', 6),
            water: campaign.canUseMaterial('Water'),
            temperature: campaign.isCampaignClimateControlAllowed('temperature'),
            humidity: campaign.isCampaignClimateControlAllowed('humidity'),
            limits: campaign.getCampaignControlLimits('temperature')
        };
    });
    expect(runtime).toEqual({
        snow: true, seeds: true, sixthSeed: false, water: false,
        temperature: true, humidity: false, limits: { max: 8 }
    });
});

test('Mission 5 restores the authored moisture snapshot and gates the seven-stage water cycle', async ({ page }) => {
    await loadMission(page, 5);
    const authored = await inspectCurrentMission(page);
    const mission = authored.mission;

    expect(mission).toMatchObject({
        id: 'moisture-in-motion', number: 5,
        world: { cols: 260, rows: 150 },
        environment: {
            temperature: 25, humidity: 95, illumination: 50, dewpoint: 10,
            ambientWindOn: false, windStrength: 0, gustWindStrength: 0
        },
        controlLimits: { temperature: { min: -10, max: 150 } },
        lockedControls: expect.arrayContaining(['humidity', 'illumination', 'dewpoint', 'wind'])
    });
    expect(mission.startingLayout).toBeUndefined();
    expect(authored.snapshot).toEqual({
        mode: 'sandbox', campaign: null, cols: 260, rows: 150,
        ambientHumidity: 95, humidityArrayType: 'Float32Array', humiditySample: 95
    });
    expectFullFloor(authored, 4);
    expect(authored.counts['Wet Sand']).toBe(150);
    expect(authored.wetSandRows).toEqual([145]);
    expect(authored.wetSandXs).toEqual(Array.from({ length: 150 }, (_, index) => 55 + index));
    expect(authored.environmentState).toEqual({
        temperature: 25, humidity: 95, illumination: 50, dewpoint: 10,
        ambientWindOn: false, windStrength: 0, gustWindStrength: 0
    });
    expect(authored.humiditySample).toBe(95);
    for (const material of ['Water', 'Steam', 'Snow', 'Cloud']) {
        expect(authored.counts[material] || 0).toBe(0);
        expect(mission.resourceBudgets.materials[material] || 0).toBe(0);
    }

    const objectives = mission.objectives;
    expect(objectives.map(({ id, type, from, to, target, targetValues, requires }) => ({
        id, type, from, to, target, targetValues, requires
    }))).toEqual([
        { id: 'heat-drying', type: 'environment-target', from: undefined, to: undefined, target: 1,
            targetValues: { temperature: 150 }, requires: undefined },
        { id: 'dry-wet-sand', type: 'transformation', from: 'Wet Sand', to: 'Sand', target: 100,
            targetValues: undefined, requires: ['heat-drying'] },
        { id: 'set-cold-dewpoint', type: 'environment-target', from: undefined, to: undefined, target: 1,
            targetValues: { temperature: -10, humidity: 95, dewpoint: 20 }, requires: ['dry-wet-sand'] },
        { id: 'condense-snow', type: 'transformation', from: 'Cloud', to: 'Snow', target: 75,
            targetValues: undefined, requires: ['set-cold-dewpoint'] },
        { id: 'set-thaw-temperature', type: 'environment-target', from: undefined, to: undefined, target: 1,
            targetValues: { temperature: 8 }, requires: ['condense-snow'] },
        { id: 'melt-snow', type: 'transformation', from: 'Snow', to: 'Water', target: 60,
            targetValues: undefined, requires: ['set-thaw-temperature'] },
        { id: 'wet-catch-bed', type: 'transformation', from: 'Sand', to: 'Wet Sand', target: 50,
            targetValues: undefined, requires: ['melt-snow'] }
    ]);
    expect(Object.keys(mission.resourceBudgets.materials)).toEqual([]);
    expect(mission.objectives.some(objective => objective.type === 'transformation' &&
        objective.from === 'Cloud' && objective.to === 'Water')).toBe(false);

    const progress = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        campaign.startCampaign('moisture-in-motion');
        const definitions = physics.getDefinitions();
        const transitions = (from, to, count) => {
            const fromId = definitions.findIndex(definition => definition?.name === from);
            const toId = definitions.findIndex(definition => definition?.name === to);
            for (let i = 0; i < count; i++) campaign.recordMaterialTransition(fromId, toId);
        };
        transitions('Wet Sand', 'Sand', 100);
        const dryBeforeHeat = campaign.getCampaignState().objectiveProgress['dry-wet-sand'];
        campaign.recordEnvironmentChange({ temperature: 150 });
        transitions('Wet Sand', 'Sand', 100);
        const dewpointUnlockedAfterDrying = campaign.isCampaignClimateControlAllowed('dewpoint');
        campaign.recordEnvironmentChange({ temperature: -10, humidity: 95, dewpoint: 20 });
        transitions('Cloud', 'Snow', 75);
        campaign.recordEnvironmentChange({ temperature: 8 });
        transitions('Snow', 'Water', 60);
        transitions('Sand', 'Wet Sand', 50);
        return {
            dryBeforeHeat,
            dewpointUnlockedAfterDrying,
            progress: campaign.getCampaignState().objectiveProgress
        };
    });
    expect(progress.dryBeforeHeat).toBe(0);
    expect(progress.dewpointUnlockedAfterDrying).toBe(true);
    expect(progress.progress).toMatchObject({
        'heat-drying': 1, 'dry-wet-sand': 100, 'set-cold-dewpoint': 1,
        'condense-snow': 75, 'set-thaw-temperature': 1, 'melt-snow': 60, 'wet-catch-bed': 50
    });
});

test('campaign briefing, guidance, objectives, and event messages avoid grid coordinates', async ({ page }) => {
    await page.goto('/?e2e');
    const copy = await page.evaluate(async () => {
        const missions = (await import('/campaign.js')).getMissionDefinitions();
        const playerCopy = missions.flatMap(mission => [
            mission.briefing,
            mission.guidance,
            ...(mission.objectives || []).map(objective => objective.label),
            ...(mission.events || []).map(event => event.message)
        ]).filter(Boolean);
        return {
            playerCopy,
            missionFiveGuidance: missions.find(mission => mission.number === 5)?.guidance || ''
        };
    });
    const gridCoordinate = /\b[xy]\s*=\s*-?\d+(?:\s*-\s*-?\d+)?\b|\(\s*-?\d+\s*,\s*-?\d+\s*\)|\b(?:row|column)\s+-?\d+\b/i;

    expect(copy.playerCopy.length).toBeGreaterThan(0);
    for (const text of copy.playerCopy) expect(text).not.toMatch(gridCoordinate);
    expect(copy.missionFiveGuidance).not.toMatch(gridCoordinate);
});

test('Mission 6 authors a top-fed open Wood burn with a 60-frame Water delay', async ({ page }) => {
    await loadMission(page, 6);
    const authored = await inspectCurrentMission(page);
    const mission = authored.mission;

    expect(mission).toMatchObject({
        id: 'controlled-burn', number: 6,
        world: { cols: 260, rows: 150 },
        environment: {
            temperature: 25, humidity: 40, illumination: 50, dewpoint: 10,
            ambientWindOn: false, windStrength: 0, gustWindStrength: 0
        },
        resourceBudgets: { materials: { Fire: 10 }, machines: {} },
        initiallyAvailableMaterials: ['Fire']
    });
    expect(mission.unlimitedMaterials).toContain('Water');
    expectFullFloor(authored, 5);
    expect(authored.counts.Wood).toBeGreaterThan(2000);
    expect(authored.counts.Fire || 0).toBe(0);
    expect(authored.counts.Water || 0).toBe(0);
    expect(authored.woodStructure.topSpanCount).toBe(authored.woodBounds.width);
    expect(authored.woodStructure.leftLegCell).toBe('Wood');
    expect(authored.woodStructure.rightLegCell).toBe('Wood');
    expect(authored.woodStructure.cavityWidth).toBeGreaterThan(0);
    expect(authored.woodStructure.cavityCell).toBe('Air');
    expect(authored.firePlacementCell).toMatchObject({ material: 'Air', woodNeighbors: 1 });
    expect(authored.firePlacementCell.y).toBe(authored.woodBounds.minY - 1);
    expect(authored.firePlacementCell.x).toBeGreaterThan(authored.woodBounds.minX);
    expect(authored.firePlacementCell.x).toBeLessThan(authored.woodBounds.maxX);
    expect(authored.snapshot).toEqual({ mode: 'sandbox', campaign: null, cols: 260, rows: 150 });
    expect(authored.environmentState).toEqual({
        temperature: 25, humidity: 40, illumination: 50, dewpoint: 10,
        ambientWindOn: false, windStrength: 0, gustWindStrength: 0
    });
    expect(mission.lockedControls).toEqual(expect.arrayContaining(['temperature', 'humidity', 'illumination', 'dewpoint', 'wind']));
    const objectives = Object.fromEntries(mission.objectives.map(objective => [objective.id, objective]));
    expect(Object.keys(objectives)).toEqual([
        'start-fire', 'water-unlock-delay', 'quench-with-water', 'confirm-fire-out'
    ]);
    expect(objectives['start-fire']).toMatchObject({ type: 'material-placement', material: 'Fire', target: 1 });
    expect(objectives['water-unlock-delay']).toMatchObject({
        id: 'water-unlock-delay', target: 60, requires: ['start-fire'], unlocks: { materials: ['Water'] }
    });
    expect(objectives['quench-with-water']).toMatchObject({
        type: 'transformation', from: 'Fire', to: 'Smoke', requires: ['water-unlock-delay']
    });
    expect(objectives['quench-with-water'].target).toBe(1);
    expect(objectives['confirm-fire-out']).toMatchObject({ id: 'confirm-fire-out', requires: ['quench-with-water'] });
});

test('Mission 6 starts with 10 Fire, pauses the Water timer, then unlocks unlimited Water at max brush size', async ({ page }) => {
    await loadMission(page, 6);
    const authored = await inspectCurrentMission(page);
    await page.locator('#missionIntroOk').click();

    const before = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const state = campaign.getCampaignState();
        return {
            fireAvailable: campaign.canUseMaterial('Fire', 10),
            fireResource: state.resources.materials.Fire,
            waterAvailable: campaign.canUseMaterial('Water'),
            fireCount: state.resources.materials.Fire.remaining
        };
    });
    expect(before.fireAvailable).toBe(true);
    expect(before.fireCount).toBe(10);
    expect(before.fireResource.limit).toBe(10);
    expect(before.waterAvailable).toBe(false);

    await clickCanvasCell(page, authored.firePlacementCell);
    await expect(page.locator('#pauseButton')).toHaveText('Pause');
    const started = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        return {
            fireCount: Array.from(physics.getWorld().type).filter(id =>
                physics.getDefinitions()[id]?.name === 'Fire').length,
            ignitionProgress: campaign.getCampaignState().objectiveProgress['start-fire'],
            waitingProgress: campaign.getCampaignState().objectiveProgress['water-unlock-delay'],
            waterAvailable: campaign.canUseMaterial('Water')
        };
    });
    expect(started.fireCount).toBeGreaterThan(0);
    expect(started.fireCount).toBeLessThanOrEqual(10);
    expect(started.ignitionProgress).toBe(1);
    expect(started.waitingProgress).toBe(0);
    expect(started.waterAvailable).toBe(false);

    await page.locator('#pauseButton').click();
    await expect(page.locator('#pauseButton')).toHaveText('Play');
    const paused = await page.evaluate(async () => {
        const before = (await import('/physics.js')).getFrameCount();
        const game = await import('/game.js');
        for (let frame = 0; frame < 60; frame++) game.gameLoop(performance.now() + frame * 16.67);
        const campaign = await import('/campaign.js');
        return {
            before,
            after: (await import('/physics.js')).getFrameCount(),
            waitingProgress: campaign.getCampaignState().objectiveProgress['water-unlock-delay'],
            waterAvailable: campaign.canUseMaterial('Water')
        };
    });
    expect(paused.after).toBe(paused.before);
    expect(paused).toMatchObject({ waitingProgress: 0, waterAvailable: false });

    await page.locator('#pauseButton').click();
    await page.evaluate(() => window.__GAME_INSTANCE__.step(59));
    const beforeUnlock = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        return {
            progress: campaign.getCampaignState().objectiveProgress['water-unlock-delay'],
            waterAvailable: campaign.canUseMaterial('Water')
        };
    });
    expect(beforeUnlock).toEqual({ progress: 59, waterAvailable: false });

    await page.evaluate(() => window.__GAME_INSTANCE__.step(1));
    const unlocked = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const definitions = physics.getDefinitions();
        const counts = {};
        for (const id of world.type) {
            const name = definitions[id]?.name;
            if (name) counts[name] = (counts[name] || 0) + 1;
        }
        const resource = campaign.getCampaignState().resources.materials.Water;
        return {
            progress: campaign.getCampaignState().objectiveProgress['water-unlock-delay'],
            waterAvailable: campaign.canUseMaterial('Water', 10000),
            waterResource: resource,
            counts
        };
    });
    expect(unlocked.progress).toBe(60);
    expect(unlocked.waterAvailable).toBe(true);
    expect(unlocked.waterResource).toMatchObject({ unlimited: true, limit: null, remaining: null });
    expect(unlocked.counts.Wood).toBeGreaterThan(0);
    expect(unlocked.counts.Fire).toBeGreaterThan(0);
    await expect(page.locator('#brushSizeValue')).toHaveValue('31');
    await expect(page.locator('#brushSize')).toHaveValue('31');
    await expect(page.locator('#particleButtons .particle-button.selected')).toHaveText('Water');
    await expect(page.locator('#particleButtons .particle-button.selected'))
        .toHaveAttribute('data-tooltip', /unlimited/i);
    await expect(page.locator('#missionHud')).toContainText(/unlimited/i);

    const liveFire = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const definitions = physics.getDefinitions();
        const fireId = definitions.findIndex(definition => definition?.name === 'Fire');
        const woodId = definitions.findIndex(definition => definition?.name === 'Wood');
        const woodYs = [];
        const fireCells = [];
        for (let index = 0; index < world.type.length; index++) {
            if (world.type[index] === woodId) woodYs.push(Math.floor(index / world.cols));
            if (world.type[index] === fireId) fireCells.push({ x: index % world.cols, y: Math.floor(index / world.cols) });
        }
        fireCells.sort((left, right) => left.y - right.y);
        return {
            topWoodY: Math.min(...woodYs),
            fireCell: fireCells[0],
            fireCount: fireCells.length
        };
    });
    expect(liveFire.fireCount).toBeGreaterThan(0);
    expect(liveFire.fireCell.y).toBeLessThanOrEqual(liveFire.topWoodY);
    await clickCanvasCell(page, liveFire.fireCell);
    await page.evaluate(() => window.__GAME_INSTANCE__.step(10));
    const quenched = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const definitions = physics.getDefinitions();
        const counts = {};
        for (const id of world.type) {
            const name = definitions[id]?.name;
            if (name) counts[name] = (counts[name] || 0) + 1;
        }
        return {
            counts,
            quenchProgress: campaign.getCampaignState().objectiveProgress['quench-with-water'],
            waterResource: campaign.getCampaignState().resources.materials.Water
        };
    });
    expect(quenched.quenchProgress).toBeGreaterThan(0);
    expect(quenched.counts.Wood).toBeGreaterThan(0);
    expect(quenched.waterResource.used).toBeGreaterThan(0);
    expect(quenched.waterResource.remaining).toBeNull();
});

test('natural Fire expiration does not satisfy Mission 6 Water quenching', async ({ page }) => {
    await loadMission(page, 6);
    await page.locator('#missionIntroOk').click();
    const naturalExpiry = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const fireId = definitions.findIndex(definition => definition?.name === 'Fire');
        const smokeId = definitions.findIndex(definition => definition?.name === 'Smoke');
        physics.clearWorld();
        physics.setCell(20, 20, fireId);
        campaign.recordMaterialPlacement('Fire', 1);
        for (let frame = 0; frame < 60; frame++) physics.stepSimulation();
        const waterUnlocked = campaign.canUseMaterial('Water', 10000);
        const delayProgress = campaign.getCampaignState().objectiveProgress['water-unlock-delay'];

        physics.clearWorld();
        physics.setCell(20, 20, fireId);
        const world = physics.getWorld();
        world.life[20 * world.cols + 20] = 1;
        physics.setRandomSource(() => 0);
        physics.stepSimulation();
        physics.resetRandomSource();
        return {
            waterUnlocked,
            delayProgress,
            fireCount: Array.from(world.type).filter(id => id === fireId).length,
            smokeCount: Array.from(world.type).filter(id => id === smokeId).length,
            quenchProgress: campaign.getCampaignState().objectiveProgress['quench-with-water']
        };
    });
    expect(naturalExpiry.waterUnlocked).toBe(true);
    expect(naturalExpiry.delayProgress).toBe(60);
    expect(naturalExpiry.fireCount).toBe(0);
    expect(naturalExpiry.smokeCount).toBeGreaterThan(0);
    expect(naturalExpiry.quenchProgress).toBe(0);
});

test('Mission 6 completion requires Water quenching, surviving Wood, and no live Fire', async ({ page }) => {
    await loadMission(page, 6);
    const outcomes = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const idFor = name => definitions.findIndex(definition => definition?.name === name);
        const woodId = idFor('Wood');
        const fireId = idFor('Fire');
        const mission = campaign.getMissionDefinitions().find(item => item.id === 'controlled-burn');
        const results = {};

        for (const scenario of ['fire-remains', 'wood-gone', 'wood-survives']) {
            campaign.startCampaign('controlled-burn');
            physics.clearWorld();
            physics.setCell(20, 20, fireId);
            campaign.consumeCampaignMaterial('Fire', 1);
            for (let frame = 0; frame < 60; frame++) physics.stepSimulation();

            physics.clearWorld();
            const quench = mission.objectives.find(objective => objective.id === 'quench-with-water');
            const waterId = idFor('Water');
            for (let count = 0; count < quench.target; count++) {
                const x = 10 + (count % 20) * 8;
                const y = 15 + Math.floor(count / 20) * 6;
                physics.setCell(x, y, fireId);
                physics.setCell(x, y - 1, waterId);
            }
            campaign.consumeCampaignMaterial('Water', quench.target);
            for (let frame = 0; frame < 10 &&
                campaign.getCampaignState().objectiveProgress['quench-with-water'] < quench.target; frame++) {
                physics.stepSimulation();
            }

            physics.clearWorld();
            if (scenario !== 'wood-gone') physics.setCell(30, 30, woodId);
            if (scenario === 'fire-remains') physics.setCell(31, 30, fireId);
            // A Water placement causes the ordinary campaign completion reevaluation.
            campaign.consumeCampaignMaterial('Water', 1);
            physics.stepSimulation();
            results[scenario] = {
                missionCompleted: campaign.getCampaignState().missionCompleted === true,
                quenchProgress: campaign.getCampaignState().objectiveProgress['quench-with-water'],
                safetyProgress: campaign.getCampaignState().objectiveProgress['confirm-fire-out'] || 0,
                counts: (() => {
                    const world = physics.getWorld();
                    return {
                        Wood: Array.from(world.type).filter(id => id === woodId).length,
                        Fire: Array.from(world.type).filter(id => id === fireId).length
                    };
                })()
            };
        }
        return results;
    });

    expect(outcomes['fire-remains'].missionCompleted).toBe(false);
    expect(outcomes['fire-remains'].counts.Fire).toBeGreaterThan(0);
    expect(outcomes['fire-remains'].quenchProgress).toBeGreaterThan(0);
    expect(outcomes['wood-gone'].missionCompleted).toBe(false);
    expect(outcomes['wood-gone'].counts.Wood).toBe(0);
    expect(outcomes['wood-survives'].counts.Wood).toBeGreaterThan(0);
    expect(outcomes['wood-survives'].counts.Fire).toBe(0);
    expect(outcomes['wood-survives'].missionCompleted).toBe(true);
    expect(outcomes['wood-survives'].safetyProgress).toBeGreaterThan(0);
});
