import { test, expect } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { clickCanvasCell } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await attachGameDiagnostics(testInfo, page, 'export-import');
});

test('Save and Load round-trip restores world and tool settings', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await page.getByRole('button', { name: 'Water', exact: true }).click();
    await page.locator('#brushSize').fill('9'); await clickCanvasCell(page, { x: 18, y: 18 });
    const before = await game.state();
    await page.getByRole('button', { name: 'Save' }).click();
    const save = await page.locator('#saveString').inputValue();
    expect(save.length).toBeGreaterThan(20);
    await page.locator('#closeSaveDialog').click();
    await page.getByRole('button', { name: 'Clear' }).click();
    await page.getByRole('button', { name: 'Clear World' }).click();
    await page.getByRole('button', { name: 'Load' }).click();
    await page.locator('#saveString').fill(save); await page.getByRole('button', { name: 'Load Game' }).click();
    if (await page.locator('#autosaveChoiceDialog').isVisible()) {
        await page.getByRole('button', { name: 'Yes, replace it' }).click();
    }
    const after = await game.state();
    const water = after.definitions.find(def => def.name === 'Water').id;
    expect(after.typeCounts[String(water)]).toBeGreaterThan(0);
    expect(after.cols).toBe(before.cols);
    expect(after.rows).toBe(before.rows);
    expect(after.arrays.type).toEqual(before.arrays.type);
    expect(after.arrays.temp).toEqual(before.arrays.temp);
    await expect(page.locator('#brushSize')).toHaveValue('9');
});

test('wind strengths round-trip and legacy saves migrate to an ordered calibrated pair', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await page.locator('#windStrength').evaluate(input => { input.value = '37'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.locator('#generalWindStrength').evaluate(input => { input.value = '12'; input.dispatchEvent(new Event('input', { bubbles: true })); });

    const windSave = await page.evaluate(async () => {
        const save = await import('/saveLoadGame.js');
        const encoded = save.createSaveString();
        const payload = save.parseSaveString(encoded);
        const savedPair = {
            general: payload.tools.generalWindStrength,
            gust: payload.tools.gustWindStrength
        };
        const physics = await import('/physics.js');
        const codec = await import('/lzString.js');
        save.restoreSavePayload(payload);
        const restoredPair = {
            general: physics.getGeneralWindStrength(),
            gust: physics.getGustWindStrength()
        };

        payload.tools.windStrength = 15;
        delete payload.tools.generalWindStrength;
        delete payload.tools.gustWindStrength;
        const legacyEncoded = codec.compressToEncodedURIComponent(JSON.stringify(payload));
        save.restoreSavePayload(payload);
        const migratedPair = {
            general: physics.getGeneralWindStrength(),
            gust: physics.getGustWindStrength()
        };
        return { savedPair, restoredPair, migratedPair, legacyEncoded };
    });

    expect(windSave).toEqual({
        savedPair: { general: 12, gust: 37 },
        restoredPair: { general: 12, gust: 37 },
        migratedPair: { general: 50, gust: 50 },
        legacyEncoded: expect.any(String)
    });
    await expect(game.state()).resolves.toMatchObject({ cols: expect.any(Number), rows: expect.any(Number) });

    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.locator('#saveString').fill(windSave.legacyEncoded);
    await page.getByRole('button', { name: 'Load Game', exact: true }).click();
    if (await page.locator('#autosaveChoiceDialog').isVisible()) {
        await page.getByRole('button', { name: 'Yes, replace it', exact: true }).click();
    }
    await expect(page.locator('#generalWindStrength')).toHaveValue('50');
    await expect(page.locator('#windStrength')).toHaveValue('50');
});

test('portable simulation state restores Base Humidity, Dewpoint and local humidity', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await page.getByRole('slider', { name: /base humidity/i }).evaluate(input => { input.value = '73'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.getByRole('slider', { name: /dewpoint/i }).evaluate(input => { input.value = '14'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    const saved = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const world = physics.getWorld();
        const humidityIndex = physics.index(30, 30);
        world.humidity[humidityIndex] = 87;
        physics.setCell(20, 20, definitions.findIndex(definition => definition?.name === 'Banana Seeds'));
        physics.setCell(22, 20, definitions.findIndex(definition => definition?.name === 'Daffodil'));
        const save = await import('/saveLoadGame.js');
        return { encoded: save.createSaveString(), humidityIndex };
    });
    const wire = await page.evaluate(async ({ encoded, humidityIndex }) => {
        const save = await import('/saveLoadGame.js');
        const payload = save.parseSaveString(encoded);
        const encodedHumidity = payload.simulation.arrays.humidity;
        const binary = atob(encodedHumidity.data);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
        const humidity = new Float32Array(bytes.buffer);
        return {
            ambientHumidity: payload.simulation.ambientHumidity,
            dewpointTarget: payload.simulation.dewpointTarget,
            humidityType: encodedHumidity.type,
            localHumidity: humidity[humidityIndex]
        };
    }, saved);
    expect(wire).toEqual({ ambientHumidity: 73, dewpointTarget: 14, humidityType: 'Float32Array', localHumidity: 87 });

    await page.evaluate(async encoded => {
        const physics = await import('/physics.js');
        physics.clearWorld();
        (await import('/saveLoadGame.js')).loadSaveString(encoded);
    }, saved.encoded);
    const restored = await page.evaluate(async ({ humidityIndex }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const definitions = physics.getDefinitions();
        return {
            ambientHumidity: physics.getAmbientHumidityTarget(),
            dewpointTarget: physics.getDewpointTarget(),
            localHumidity: world.humidity[humidityIndex],
            seed: definitions[world.type[physics.index(20, 20)]]?.name,
            plant: definitions[world.type[physics.index(22, 20)]]?.name
        };
    }, saved);
    expect(restored).toEqual({
        ambientHumidity: 73, dewpointTarget: 14, localHumidity: 87,
        seed: 'Banana Seeds', plant: 'Daffodil'
    });
});

test('a selected 520 × 300 world keeps its dimensions in version 2 Save/Load', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame({ worldSize: '520 × 300' });
    expect(await game.state()).toMatchObject({ cols: 520, rows: 300 });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const save = await page.locator('#saveString').inputValue();
    const wireFormat = await page.evaluate(async value => {
        const payload = (await import('/saveLoadGame.js')).parseSaveString(value);
        return {
            format: payload.format,
            version: payload.version,
            cols: payload.simulation.cols,
            rows: payload.simulation.rows
        };
    }, save);
    expect(wireFormat).toEqual({ format: 'elemental-foundry', version: 2, cols: 520, rows: 300 });
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await page.getByRole('button', { name: 'Clear World', exact: true }).click();
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.locator('#saveString').fill(save);
    await page.getByRole('button', { name: 'Load Game', exact: true }).click();
    if (await page.locator('#autosaveChoiceDialog').isVisible()) {
        await page.getByRole('button', { name: 'Yes, replace it', exact: true }).click();
    }
    expect(await game.state()).toMatchObject({ cols: 520, rows: 300 });
});

test('Save dialog exposes a selected save and Load restores all visible tool state', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await page.getByRole('button', { name: 'Water', exact: true }).click();
    await page.locator('#brushSize').fill('7');
    await page.getByRole('button', { name: 'Ellipse mode' }).click();
    await page.locator('#visualizationsOptionsButton').click();
    await page.locator('#visualizationHeatButton').click();
    await page.locator('#closeVisualizationsDialog').click();
    await page.getByRole('button', { name: 'Save' }).click();
    const save = await page.locator('#saveString').inputValue();
    await expect(page.locator('#saveDialog')).toHaveAttribute('aria-labelledby', 'saveDialogTitle');
    await expect(page.locator('#saveString')).toHaveAttribute('readonly', '');
    await expect(page.locator('#copySaveString')).toBeVisible();
    await page.locator('#closeSaveDialog').click();

    await page.getByRole('button', { name: 'Load' }).click();
    await page.locator('#saveString').fill(save);
    await page.getByRole('button', { name: 'Load Game' }).click();
    if (await page.locator('#autosaveChoiceDialog').isVisible()) await page.getByRole('button', { name: 'Yes, replace it' }).click();
    await expect(page.locator('#brushSize')).toHaveValue('7');
    await expect(page.getByRole('button', { name: 'Ellipse mode' })).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#visualizationsOptionsButton').click();
    await expect(page.locator('#visualizationHeatButton')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#closeVisualizationsDialog').click();
    await expect(page.locator('#saveDialog')).toBeHidden();
    await expect(game.state()).resolves.toMatchObject({ cols: expect.any(Number) });
});

test('visualization mode saves round-trip and legacy Heat saves still restore', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await page.locator('#visualizationsOptionsButton').click();
    await page.locator('#visualizationHumidityButton').click();
    await page.locator('#closeVisualizationsDialog').click();

    const modes = await page.evaluate(async () => {
        const save = await import('/saveLoadGame.js');
        const codec = await import('/lzString.js');
        const state = await import('/constantsAndGlobalVars.js');
        const encoded = save.createSaveString();
        const payload = JSON.parse(codec.decompressFromEncodedURIComponent(encoded));
        const savedMode = payload.tools.visualizationMode;

        state.setVisualizationMode('wind');
        save.restoreSavePayload(payload);
        const restoredMode = state.getVisualizationMode();

        delete payload.tools.visualizationMode;
        payload.tools.heatViewOn = true;
        state.setVisualizationMode('normal');
        save.restoreSavePayload(payload);
        return { savedMode, restoredMode, legacyMode: state.getVisualizationMode() };
    });

    expect(modes).toEqual({ savedMode: 'humidity', restoredMode: 'humidity', legacyMode: 'heat' });
    await expect(game.state()).resolves.toMatchObject({ cols: expect.any(Number), rows: expect.any(Number) });
});

test('Load replacement choices support Cancel, No, and Yes without losing the live target', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    const originalResume = await page.evaluate(() => localStorage.getItem('elemental-foundry.autosave.v1'));
    await page.getByRole('button', { name: 'Water', exact: true }).click();
    await page.locator('#brushSize').fill('1');
    await clickCanvasCell(page, { x: 30, y: 30 });
    await page.getByRole('button', { name: 'Save' }).click();
    const imported = await page.locator('#saveString').inputValue();
    await page.locator('#closeSaveDialog').click();
    await page.getByRole('button', { name: 'Clear' }).click();
    await page.getByRole('button', { name: 'Clear World' }).click();

    await page.getByRole('button', { name: 'Load' }).click();
    await page.locator('#saveString').fill(imported);
    await page.getByRole('button', { name: 'Load Game' }).click();
    await expect(page.locator('#autosaveChoiceDialog')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect((await game.state()).typeCounts['0']).toBe((await game.state()).cols * (await game.state()).rows);
    await expect(page.locator('#saveDialog')).toBeVisible();
    await expect(page.locator('#autosaveToggle')).toBeChecked();
    await expect(page.evaluate(() => localStorage.getItem('elemental-foundry.autosave.v1'))).resolves.toBe(originalResume);

    await page.getByRole('button', { name: 'Load Game' }).click();
    await page.getByRole('button', { name: 'No, play without autosave' }).click();
    const loaded = await game.state();
    const water = loaded.definitions.find(definition => definition?.name === 'Water').id;
    expect(loaded.typeCounts[String(water)]).toBeGreaterThan(0);
    await expect(page.locator('#autosaveToggle')).not.toBeChecked();
    await expect(page.evaluate(() => localStorage.getItem('elemental-foundry.autosave.v1'))).resolves.toBe(originalResume);

    await page.getByRole('button', { name: 'Load' }).click();
    await page.locator('#saveString').fill(imported);
    await page.getByRole('button', { name: 'Load Game' }).click();
    await page.getByRole('button', { name: 'Yes, replace it' }).click();
    await expect(page.locator('#autosaveToggle')).toBeChecked();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('elemental-foundry.autosave.v1')))
        .not.toBe(originalResume);
});

test('failed autosave replacement preserves the previous resume game', async ({ page }) => {
    const game = new GamePage(page); await game.openMenu(); await game.newGame();
    await expect(page.locator('#autosaveToggle')).toBeChecked();
    const key = 'elemental-foundry.autosave.v1';
    await expect.poll(() => page.evaluate(storageKey => localStorage.getItem(storageKey), key))
        .not.toBeNull();
    const previousSave = await page.evaluate(storageKey => localStorage.getItem(storageKey), key);

    await page.getByRole('button', { name: 'Save' }).click();
    const save = await page.locator('#saveString').inputValue();
    await page.locator('#closeSaveDialog').click();
    await page.getByRole('button', { name: 'Clear' }).click();
    await page.getByRole('button', { name: 'Clear World' }).click();

    await page.evaluate(storageKey => {
        const setItem = localStorage.setItem.bind(localStorage);
        localStorage.setItem = (keyName, value) => {
            if (keyName === storageKey) throw new DOMException('Quota exceeded', 'QuotaExceededError');
            setItem(keyName, value);
        };
    }, key);
    await page.getByRole('button', { name: 'Load' }).click();
    await page.locator('#saveString').fill(save);
    await page.getByRole('button', { name: 'Load Game' }).click();
    await page.getByRole('button', { name: 'Yes, replace it' }).click();

    await expect(page.locator('#autosaveStatus')).toBeVisible();
    await expect(page.locator('#autosaveStatus')).toContainText(/autosave|resume/i);
    await expect(page.locator('#autosaveToggle')).not.toBeChecked();
    await expect(page.evaluate(storageKey => localStorage.getItem(storageKey), key))
        .resolves.toBe(previousSave);
    const loaded = await game.state();
    expect(loaded.cols).toBeGreaterThan(0);
});
