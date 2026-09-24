import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';
import { setupPhysics, count, cell } from './fixtures.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'thermal');
});

test('temperature integrates gradually, then crosses ice and water phase boundaries', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame(); await game.seed(303);
    await setupPhysics(page, { cells: [{ x: 50, y: 35, material: 'Ice' }, { x: 50, y: 36, material: 'Wall' }] });
    const initial = await cell(page, 50, 35);
    await game.step(3);
    const early = await cell(page, 50, 35);
    expect(early.type).toBe(initial.type);
    expect(early.temp).toBeGreaterThan(initial.temp);
    await setupPhysics(page, { cells: [{ x: 50, y: 35, material: 'Ice' }, { x: 50, y: 36, material: 'Wall' }], temperatures: [{ x: 50, y: 35, value: 100, heat: 2001 }] });
    await game.step(1);
    expect((await cell(page, 50, 35)).type).toBe((await game.state()).definitions.find(d => d?.name === 'Water').id);
    await setupPhysics(page, { cells: [{ x: 50, y: 35, material: 'Water' }, { x: 50, y: 36, material: 'Wall' }], temperatures: [{ x: 50, y: 35, value: 200, heat: 401 }] });
    await game.step(1);
    expect((await cell(page, 50, 35)).type).toBe((await game.state()).definitions.find(d => d?.name === 'Steam').id);
});

test('fire rises, radiates into fuel, and water extinguishes it', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await setupPhysics(page, {
        fills: [{ material: 'Wood', x: 35, y: 25, width: 8, height: 5 }],
        cells: [{ x: 38, y: 30, material: 'Fire' }, { x: 37, y: 24, material: 'Water' }]
    });
    const woodBefore = await count(page, 'Wood');
    await game.step(220);
    expect(await count(page, 'Wood')).toBeLessThan(woodBefore);
    expect(await count(page, 'Ash')).toBeGreaterThan(0);
    await setupPhysics(page, { cells: [
        { x: 100, y: 35, material: 'Fire' }, { x: 100, y: 36, material: 'Water' }, { x: 100, y: 37, material: 'Wall' }
    ] });
    await game.step(10);
    expect(await count(page, 'Fire')).toBe(0);
});

test('hot and cold edge fixtures do not create uncontrolled RAF ticks while paused', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    const before = await game.state();
    await setupPhysics(page, { cells: [{ x: 0, y: 0, material: 'Lava' }, { x: before.cols - 1, y: before.rows - 1, material: 'Ice' }] });
    const paused = await game.state();
    expect(paused.frameCount).toBe(before.frameCount);
    await game.step(0);
    expect((await game.state()).frameCount).toBe(paused.frameCount);
});

test('lava cools through scoria into stone and reheating reverses both transitions', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await setupPhysics(page, { fills: [{ material: 'Wall', x: 70, y: 42, width: 21, height: 1 }, { material: 'Lava', x: 78, y: 40, width: 5, height: 2 }] });
    await game.step(2600);
    expect(await page.evaluate(async () => { const p = await import('/physics.js'); const w = p.getWorld(); const stone = p.getDefinitions().findIndex(d => d?.name === 'Stone'); return [...w.type].filter(value => value === stone).length; })).toBeGreaterThan(0);
    await page.evaluate(async () => {
        const p = await import('/physics.js'); const lava = p.getDefinitions().findIndex(d => d?.name === 'Lava');
        const i = [...p.getWorld().type].findIndex(value => value === p.getDefinitions().findIndex(d => d?.name === 'Stone'));
        p.getWorld().type[i] = lava; p.getWorld().temp[i] = 1200; p.getWorld().heat[i] = 1000;
    });
    await game.step(80);
    expect(await countType(page, 'Lava')).toBeGreaterThan(0);
});

test('heat conducts and radiates locally while thick glass insulates its interior', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await setupPhysics(page, {
        fills: [{ material: 'Glass', x: 80, y: 20, width: 9, height: 9 }]
    });
    await page.evaluate(async () => {
        const p = await import('/physics.js');
        p.setAmbientTarget(-40);
        const w = p.getWorld();
        for (let y = 20; y < 29; y++) for (let x = 80; x < 89; x++) w.temp[p.index(x, y)] = 300;
    });
    await game.step(100);
    expect((await cell(page, 84, 24)).temp).toBeGreaterThan((await cell(page, 80, 24)).temp);
    expect((await cell(page, 84, 24)).temp).toBeGreaterThan(50);
});

test('sealed air retains heat until a breach reconnects it to ambient', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    const samples = await page.evaluate(async () => {
        const p = await import('/physics.js');
        const insulation = p.getDefinitions().findIndex(definition => definition?.name === 'Insulation');
        if (insulation < 1) return null;
        p.setLayerLapse(0);
        p.setAmbientTarget(-40);
        for (let frame = 0; frame < 1300; frame++) p.stepSimulation();
        p.clearWorld();
        const world = p.getWorld();
        for (let x = 24; x <= 36; x++) {
            p.setCell(x, 15, insulation);
            p.setCell(x, 27, insulation);
        }
        for (let y = 16; y < 27; y++) {
            p.setCell(24, y, insulation);
            p.setCell(36, y, insulation);
        }
        for (let y = 16; y < 27; y++) {
            for (let x = 25; x < 36; x++) world.temp[p.index(x, y)] = 200;
        }
        world.temp[p.index(45, 21)] = 200;
        for (let frame = 0; frame < 100; frame++) p.stepSimulation();
        const sealed = world.temp[p.index(30, 21)];
        const open = world.temp[p.index(45, 21)];
        p.setCell(24, 21, 0);
        p.stepSimulation();
        const oneFrameAfterBreach = world.temp[p.index(30, 21)];
        for (let frame = 0; frame < 120; frame++) p.stepSimulation();
        return {
            ambient: p.getAmbientTemp(), sealed, open, oneFrameAfterBreach,
            afterBreach: world.temp[p.index(30, 21)]
        };
    });
    expect(samples).not.toBeNull();
    expect(samples.sealed).toBeGreaterThan(samples.open + 100);
    expect(samples.sealed).toBeGreaterThan(samples.ambient + 100);
    expect(samples.oneFrameAfterBreach).toBeGreaterThan(samples.sealed - 25);
    expect(samples.afterBreach).toBeLessThan(samples.sealed - 40);
});

test('Insulation has the specified definition and melts into Lava above 5000C', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    const result = await page.evaluate(async () => {
        const p = await import('/physics.js');
        const definitions = p.getDefinitions();
        const insulation = definitions.findIndex(definition => definition?.name === 'Insulation');
        if (insulation < 1) return null;
        const definition = definitions[insulation];
        p.clearWorld();
        const world = p.getWorld();
        p.setCell(30, 21, definitions.findIndex(item => item?.name === 'Wall'));
        p.setCell(30, 20, insulation);
        const cellIndex = p.index(30, 20);
        world.temp[cellIndex] = 4999;
        world.heat[cellIndex] = 0;
        p.stepSimulation();
        const remainsSolid = world.type[cellIndex] === insulation;
        world.temp[cellIndex] = 6000;
        world.heat[cellIndex] = definition.latent + 1;
        p.stepSimulation();
        return {
            id: definition.id,
            category: definition.category,
            group: definition.group,
            conductivity: definition.conductivity,
            meltPoint: definition.meltPoint,
            meltsInto: definitions[definition.meltsInto]?.name,
            remainsSolid,
            meltedIntoLava: world.type[cellIndex] === definitions.findIndex(item => item?.name === 'Lava')
        };
    });
    expect(result).not.toBeNull();
    expect(result).toMatchObject({
        id: 54, category: 'static', group: 'Solids', conductivity: 0,
        meltPoint: 5000, meltsInto: 'Lava', remainsSolid: true, meltedIntoLava: true
    });
});

test('connected Insulation carries heat between enclosed chambers without leaking into open air', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame(); await game.seed(0);
    const baseline = await page.evaluate(async () => {
        const p = await import('/physics.js');
        const definitions = p.getDefinitions();
        const insulation = definitions.findIndex(definition => definition?.name === 'Insulation');
        const wall = definitions.findIndex(definition => definition?.name === 'Wall');
        const baseline = p.getAmbientTemp();
        p.setAmbientTarget(baseline);
        p.setLayerLapse(0);
        p.setAirLayersOn(false);
        p.setAmbientWindOn(false);
        p.clearWorld();
        const world = p.getWorld();
        const rooms = [
            { left: 10, right: 16, top: 16, bottom: 24 },
            { left: 22, right: 28, top: 16, bottom: 24 }
        ];
        for (const room of rooms) {
            for (let x = room.left; x <= room.right; x++) {
                p.setCell(x, room.top, wall);
                p.setCell(x, room.bottom, wall);
            }
            for (let y = room.top + 1; y < room.bottom; y++) {
                p.setCell(room.left, y, wall);
                p.setCell(room.right, y, wall);
            }
        }
        for (let x = rooms[0].right; x <= rooms[1].left; x++) p.setCell(x, 20, insulation);
        p.setCell(19, 21, wall);
        for (let y = 17; y < 24; y++) {
            for (let x = 11; x < 16; x++) world.temp[p.index(x, y)] = 600;
            for (let x = 23; x < 28; x++) world.temp[p.index(x, y)] = baseline;
        }
        for (let x = 16; x <= 22; x++) world.temp[p.index(x, 20)] = baseline;
        world.temp[p.index(19, 21)] = baseline;
        return baseline;
    });
    await game.step(12);
    const early = await page.evaluate(async () => {
        const p = await import('/physics.js');
        const world = p.getWorld();
        const path = Array.from({ length: 7 }, (_, n) => world.temp[p.index(16 + n, 20)]);
        return {
            pathMean: path.reduce((sum, value) => sum + value, 0) / path.length,
            receiverAir: world.temp[p.index(23, 20)],
            exterior: world.temp[p.index(19, 18)],
            wall: world.temp[p.index(19, 21)]
        };
    });
    expect(early.pathMean).toBeGreaterThan(baseline + 20);
    expect(early.receiverAir).toBeGreaterThan(baseline + 100);
    expect(Math.abs(early.exterior - baseline)).toBeLessThan(1);
    expect(Math.abs(early.wall - baseline)).toBeLessThan(1);
    await game.step(36);
    const chamberInterior = await page.evaluate(async () => {
        const p = await import('/physics.js');
        return p.getWorld().temp[p.index(25, 20)];
    });
    expect(chamberInterior).toBeGreaterThan(baseline + 20);
});

test('Steam in a sealed warm gas cell stays hot while exposed Steam cools', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    const result = await page.evaluate(async () => {
        const p = await import('/physics.js');
        const definitions = p.getDefinitions();
        const insulation = definitions.findIndex(definition => definition?.name === 'Insulation');
        if (insulation < 1) return null;
        const steam = definitions.findIndex(definition => definition?.name === 'Steam');
        p.setLayerLapse(0);
        p.setAmbientTarget(-40);
        for (let frame = 0; frame < 1300; frame++) p.stepSimulation();
        p.clearWorld();
        const world = p.getWorld();
        const steamX = 30;
        const steamY = 21;
        // Solid cells on all eight sides seal this gas cell from perimeter air.
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                p.setCell(steamX + dx, steamY + dy, insulation);
                world.temp[p.index(steamX + dx, steamY + dy)] = 200;
            }
        }
        p.setCell(steamX, steamY, steam);
        world.temp[p.index(steamX, steamY)] = 200;
        const exposedSteamStart = 30;
        for (let y = 20; y < 25; y++) {
            for (let x = 5; x < 11; x++) {
                p.setCell(x, y, steam);
                world.temp[p.index(x, y)] = 200;
            }
        }
        for (let frame = 0; frame < 100; frame++) p.stepSimulation();
        let exposedSteam = 0;
        for (let y = 0; y < world.rows; y++) {
            for (let x = 0; x <= 15; x++) {
                if (world.type[p.index(x, y)] === steam) exposedSteam++;
            }
        }
        return {
            sealedType: world.type[p.index(steamX, steamY)],
            sealedTemp: world.temp[p.index(steamX, steamY)],
            steamId: steam,
            exposedSteam,
            exposedSteamStart
        };
    });
    expect(result).not.toBeNull();
    expect(result.sealedType).toBe(result.steamId);
    expect(result.sealedTemp).toBeGreaterThan(190);
    expect(result.exposedSteam).toBeLessThan(result.exposedSteamStart);
});

async function countType(page, material) {
    return page.evaluate(async material => { const p = await import('/physics.js'); const id = p.getDefinitions().findIndex(d => d?.name === material); return [...p.getWorld().type].filter(value => value === id).length; }, material);
}

test('ambient target eases and altitude layers produce a colder upper world', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await setupPhysics(page, { cells: [{ x: 100, y: 4, material: 'Stone' }, { x: 100, y: 70, material: 'Stone' }] });
    const values = await page.evaluate(async () => {
        const p = await import('/physics.js'); p.setLayerLapse(6); p.setAmbientTarget(20); return { top: p.getAirTempAt(4), bottom: p.getAirTempAt(70), ambient: p.getAmbientTemp() };
    });
    expect(values.top).toBeLessThan(values.bottom);
    expect(values.ambient).not.toBe(20);
    await game.step(900);
    expect(await page.evaluate(async () => (await import('/physics.js')).getAmbientTemp())).toBeGreaterThan(15);
});
