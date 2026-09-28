import { test, expect } from '@playwright/test';
import { dragCanvasCells } from '../helpers/canvas.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

const DRAFTS_KEY = 'elemental-foundry.campaign-editor.drafts.v1';
const SOURCE_BACKUP_KEY = 'elemental-foundry.campaign-editor-source-backup.v1';
const BEGIN_MARKER = '// BEGIN GENERATED MISSION DATA';
const END_MARKER = '// END GENERATED MISSION DATA';

test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus) await attachGameDiagnostics(info, page, 'campaign-editor');
});

async function openEditor(page) {
    await page.goto('/?e2e');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('#openCampaignEditor').click();
    await expect(page.locator('#campaignEditorWorkspace')).toBeVisible();
    await expect(page.locator('#canvasContainer')).toBeVisible();
}

async function selectMission(page, containsText) {
    const value = await page.locator('#campaignMissionList').evaluate((select, text) => {
        const option = [...select.options].find(candidate => candidate.textContent.includes(text));
        return option?.value ?? null;
    }, containsText);
    expect(value, `mission list contains ${containsText}`).toBeTruthy();
    await page.locator('#campaignMissionList').selectOption(value);
    await page.locator('#campaignEditorLoadMission').click();
}

async function paintSandFloor(page) {
    await page.getByRole('button', { name: 'Sand', exact: true }).click();
    await page.locator('#rectangleModeButton').click();
    const { cols, rows } = await page.evaluate(async () => {
        const world = (await import('/physics.js')).getWorld();
        return { cols: world.cols, rows: world.rows };
    });
    await dragCanvasCells(page, { x: 0, y: rows - 10 }, { x: cols - 1, y: rows - 1 });
}

async function populateDraft(page) {
    await page.locator('#campaignEditorNewBlank').click();
    await expect(page.locator('#campaignEditorNumber')).toHaveValue('3');
    await page.locator('[data-mission-field="id"]').fill('editor-flower-test');
    await page.locator('#campaignEditorNumber').fill('3');
    await page.locator('#campaignEditorTitle').fill('Editor Flower Test');
    await page.locator('#campaignEditorBriefing').fill('A captured sand bed for a draft persistence check.');
    await page.locator('#campaignObjectiveFrom').selectOption({ label: 'Daffodil Seeds' });
    await page.locator('#campaignObjectiveTo').selectOption({ label: 'Daffodil' });
    await page.locator('#campaignObjectiveTarget').fill('1');
    await page.locator('#campaignObjectiveLabel').fill('Grow one Daffodil from seed.');
    await page.locator('#campaignEventMessage').fill('The test flower has opened.');
    await page.locator('[data-mission-field="cols"]').fill('300');
    await page.locator('[data-mission-field="rows"]').fill('170');
    await page.locator('#campaignEditorApplyDimensions').click();
    await expect(page.locator('#campaignEditorStatus')).toContainText('300 × 170');
    await paintSandFloor(page);
    await page.locator('#campaignEditorCaptureScenario').click();
}

test('Campaign Editor starts an unrestricted authoring Sandbox and persists blank, edited, and captured drafts', async ({ page }) => {
    await openEditor(page);

    const sandboxMode = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const state = await import('/constantsAndGlobalVars.js');
        return {
            campaign: campaign.getCampaignState(),
            unrestricted: campaign.canUseMaterial('Sand') && campaign.canPlaceMissionMachine('sprinkler'),
            airTemp: physics.getAmbientTarget(),
            selected: physics.getDefinitions()[state.getParticleTypeIdSelected()]?.name
        };
    });
    expect(sandboxMode.campaign).toBeNull();
    expect(sandboxMode.unrestricted).toBe(true);
    await expect(page.locator('#airTemp')).toBeEnabled();
    await expect(page.locator('#baseHumidity')).toBeEnabled();

    const firstMission = await page.evaluate(async () =>
        (await import('/campaign.js')).getMissionDefinitions()[0]);
    await selectMission(page, firstMission.title);
    await expect(page.locator('#campaignEditorNumber')).toHaveValue(String(firstMission.number));
    await expect(page.locator('#campaignEditorTitle')).toHaveValue(firstMission.title);

    await populateDraft(page);
    await expect(page.locator('#campaignEditorStatus')).toContainText(/captur/i);
    await page.locator('#pauseButton').click();
    await expect(page.locator('#campaignEditorSnapshotStatus')).toContainText(/stale/i);
    await page.locator('#pauseButton').click();
    await page.locator('#campaignEditorCaptureScenario').click();
    await page.locator('#campaignEditorSaveDraft').click();
    await expect(page.locator('#campaignEditorStatus')).toContainText(/saved/i);
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), DRAFTS_KEY)).not.toBeNull();

    await page.reload();
    await page.locator('#openCampaignEditor').click();
    await expect(page.locator('#campaignEditorWorkspace')).toBeVisible();
    const draftValue = await page.locator('#campaignMissionList').evaluate(select => {
        const option = [...select.options].find(candidate => candidate.textContent.includes('Editor Flower Test'));
        return option?.value ?? null;
    });
    expect(draftValue).toBeTruthy();
    await page.locator('#campaignMissionList').selectOption(draftValue);
    await page.locator('#campaignEditorLoadMission').click();
    await expect(page.locator('#campaignEditorNumber')).toHaveValue('3');
    await expect(page.locator('#campaignEditorTitle')).toHaveValue('Editor Flower Test');
    await expect(page.locator('#campaignEditorBriefing')).toHaveValue(
        'A captured sand bed for a draft persistence check.'
    );
    await expect(page.locator('#campaignObjectiveFrom')).toHaveValue('Daffodil Seeds');
    await expect(page.locator('#campaignObjectiveTo')).toHaveValue('Daffodil');
    const capturedWorld = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        const sandId = physics.getDefinitions().findIndex(definition => definition?.name === 'Sand');
        return { cols: world.cols, rows: world.rows, sand: world.type.filter(type => type === sandId).length };
    });
    expect(capturedWorld).toMatchObject({ cols: 300, rows: 170 });
    expect(capturedWorld.sand).toBeGreaterThanOrEqual(300);
    expect(await page.evaluate(key => localStorage.getItem(key), SOURCE_BACKUP_KEY)).toBeNull();
});

test('Campaign Editor validation blocks incomplete drafts and review approval gates installation', async ({ page }) => {
    await openEditor(page);
    await page.locator('#campaignEditorNewBlank').click();
    await expect(page.locator('#campaignEditorNumber')).toHaveValue('3');
    await expect(page.locator('#campaignEditorInstall')).toBeDisabled();

    await page.locator('#campaignEditorValidate').click();
    await expect(page.locator('#campaignEditorStatus')).toContainText(/invalid|missing|required|error/i);
    await expect(page.locator('#campaignEditorInstall')).toBeDisabled();
    await expect(page.locator('#campaignEditorReviewDialog')).toBeHidden();

    const mission = await page.evaluate(async () => (await import('/campaign.js')).getMissionDefinitions()[0]);
    await selectMission(page, mission.title);
    await page.locator('#campaignEditorValidate').click();
    await expect(page.locator('#campaignEditorStatus')).toContainText(/^Mission valid\./i);
    await expect(page.locator('#campaignEditorInstall')).toBeDisabled();
    await expect(page.locator('#campaignEditorReviewDialog')).toBeVisible();
    await expect(page.locator('#campaignEditorReviewDialog')).toContainText(mission.title);
    await page.locator('#campaignEditorApproveReview').click();
    await expect(page.locator('#campaignEditorReviewDialog')).toBeHidden();
    await expect(page.locator('#campaignEditorInstall')).toBeEnabled();
});

test('Campaign Editor saves Mission 2 climate targets and typed environment objectives', async ({ page }) => {
    await openEditor(page);
    await selectMission(page, 'The Icebound Grove');
    await expect(page.locator('[data-environment-target="temperature"]')).toHaveValue('30');
    await expect(page.locator('[data-environment-target="humidity"]')).toHaveValue('95');
    await expect(page.locator('[data-environment-target="illumination"]')).toHaveValue('85');
    const objectiveTypes = await page.locator('[data-objective-type]').evaluateAll(selects => selects.map(select => select.value));
    expect(objectiveTypes).toContain('environment-target');

    await page.locator('#campaignEditorSaveDraft').click();
    const savedMission = await page.evaluate(key => {
        const store = JSON.parse(localStorage.getItem(key));
        return store.drafts.find(item => item.id === 'ice-banana');
    }, DRAFTS_KEY);
    expect(savedMission.environmentTargets).toEqual({ temperature: 30, humidity: 95, illumination: 85 });
    expect(savedMission.objectives).toContainEqual(expect.objectContaining({ type: 'environment-target' }));
});

test('Campaign Editor suspends autosave without changing the Sandbox resume save', async ({ page }) => {
    await page.goto('/?e2e');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const original = await page.evaluate(async () => {
        const saves = await import('/saveLoadGame.js');
        const record = saves.saveGameToLibrary('Original Sandbox Resume');
        saves.startAutosave({ saveNow: false });
        return { id: record.id, saveString: record.saveString, activeId: saves.getActiveSaveId() };
    });
    expect(original.activeId).toBe(original.id);

    await page.locator('#openCampaignEditor').click();
    await expect(page.locator('#campaignEditorWorkspace')).toBeVisible();
    const whileEditing = await page.evaluate(async () => {
        const saves = await import('/saveLoadGame.js');
        return {
            enabled: saves.isAutosaveEnabled(),
            autosave: localStorage.getItem(saves.AUTOSAVE_STORAGE_KEY),
            activeId: saves.getActiveSaveId(),
            libraryRecord: saves.listSavedGames().find(record => record.id === saves.getActiveSaveId())
        };
    });
    expect(whileEditing.enabled).toBe(false);
    expect(whileEditing.autosave).toBe(original.saveString);
    expect(whileEditing.activeId).toBe(original.activeId);
    expect(whileEditing.libraryRecord.saveString).toBe(original.saveString);

    await page.locator('#campaignEditorClose').click();
    const afterClose = await page.evaluate(async () => {
        const saves = await import('/saveLoadGame.js');
        const wrote = await saves.writeAutosave();
        return {
            wrote,
            enabled: saves.isAutosaveEnabled(),
            autosave: localStorage.getItem(saves.AUTOSAVE_STORAGE_KEY),
            activeId: saves.getActiveSaveId(),
            libraryRecord: saves.listSavedGames().find(record => record.id === saves.getActiveSaveId())
        };
    });
    expect(afterClose.enabled).toBe(true);
    expect(afterClose.wrote).toBe(false);
    expect(afterClose.autosave).toBe(original.saveString);
    expect(afterClose.activeId).toBe(original.activeId);
    expect(afterClose.libraryRecord.saveString).toBe(original.saveString);
});

test('Campaign Editor install replaces only generated mission data and preserves other missions', async ({ page }) => {
    await openEditor(page);
    const installed = await page.evaluate(async () =>
        (await import('/campaign.js')).getMissionDefinitions());
    const existingMission = installed[0];
    const preservedMission = {
        ...structuredClone(existingMission),
        id: 'future-mission-preserved',
        number: 2,
        title: 'Future Mission That Must Survive'
    };
    await selectMission(page, existingMission.title);
    await page.locator('#campaignEditorTitle').fill('The First Daffodil Revised');
    await page.locator('#campaignEditorValidate').click();
    await expect(page.locator('#campaignEditorStatus')).toContainText(/^Mission valid\./i);
    await expect(page.locator('#campaignEditorReviewDialog')).toBeVisible();
    await page.locator('#campaignEditorApproveReview').click();
    await expect(page.locator('#campaignEditorInstall')).toBeEnabled();

    const source = [
        'export const beforeGeneratedMissionData = "preserve this prefix";',
        BEGIN_MARKER,
        `const MISSION_DEFINITIONS = Object.freeze(${JSON.stringify([existingMission, preservedMission], null, 2)});`,
        END_MARKER,
        'export const afterGeneratedMissionData = "preserve this suffix";'
    ].join('\n');
    await page.evaluate(original => {
        let current = original;
        let backup = null;
        const handle = {
            name: 'campaign.js',
            async queryPermission() { return 'granted'; },
            async requestPermission() { return 'granted'; },
            async getFile() { return { name: this.name, text: async () => current }; },
            async createWritable() {
                return {
                    async write(value) { current = String(value); },
                    async close() {}
                };
            }
        };
        window.__campaignEditorFileState = () => ({ current, backup });
        window.showOpenFilePicker = async () => [handle];
    }, source);

    await page.locator('#campaignEditorInstall').click();
    await expect(page.locator('#campaignEditorConfirmReplace')).toBeVisible();
    await expect(page.locator('#campaignEditorConfirmReplace').locator('xpath=..'))
        .toContainText(existingMission.title);
    await page.locator('#campaignEditorCancelReplace').click();
    await expect.poll(() => page.evaluate(() => window.__campaignEditorFileState().current)).toBe(source);

    await page.locator('#campaignEditorInstall').click();
    await expect(page.locator('#campaignEditorConfirmReplace')).toBeVisible();
    await page.locator('#campaignEditorConfirmReplace').click();

    await expect.poll(() => page.evaluate(() => window.__campaignEditorFileState().current))
        .not.toBe(source);
    const result = await page.evaluate(({ begin, end }) => {
        const { current, backup } = window.__campaignEditorFileState();
        const beginEnd = current.indexOf(begin) + begin.length;
        const endStart = current.indexOf(end);
        const beforeStart = current.indexOf(begin);
        const afterEnd = endStart + end.length;
        const missionData = current.match(/const MISSION_DEFINITIONS = Object\.freeze\(([\s\S]*?)\);/);
        return {
            current,
            backup,
            prefix: current.slice(0, beforeStart),
            suffix: current.slice(afterEnd),
            markerCounts: {
                begin: current.split(begin).length - 1,
                end: current.split(end).length - 1
            },
            definitions: missionData ? JSON.parse(missionData[1]) : null,
            markersInOrder: beforeStart >= 0 && endStart > beginEnd
        };
    }, { begin: BEGIN_MARKER, end: END_MARKER });
    const originalParts = await page.evaluate(({ value, begin, end }) => {
        const beginStart = value.indexOf(begin);
        const endStart = value.indexOf(end);
        return {
            prefix: value.slice(0, beginStart),
            suffix: value.slice(endStart + end.length)
        };
    }, { value: source, begin: BEGIN_MARKER, end: END_MARKER });
    expect(result.markersInOrder).toBe(true);
    expect(result.markerCounts).toEqual({ begin: 1, end: 1 });
    expect(result.prefix).toBe(originalParts.prefix);
    expect(result.suffix).toBe(originalParts.suffix);
    expect(result.definitions).not.toBeNull();
    expect(result.definitions.find(candidate => candidate.id === existingMission.id).title)
        .toBe('The First Daffodil Revised');
    expect(result.definitions).toContainEqual(expect.objectContaining({
        id: preservedMission.id, title: preservedMission.title, number: preservedMission.number
    }));
    const storedBackup = await page.evaluate(key => {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : null;
    }, SOURCE_BACKUP_KEY);
    expect(storedBackup).toMatchObject({ fileName: 'campaign.js', originalSource: source });
    expect(storedBackup.createdAt).toBeTruthy();
    expect(storedBackup.sourceHash).toBeTruthy();
});
