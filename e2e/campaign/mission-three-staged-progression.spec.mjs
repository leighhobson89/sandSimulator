import { test, expect } from '@playwright/test';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus) await attachGameDiagnostics(info, page, 'campaign-mission-three-staged-progression');
});

async function startMissionThree(page) {
    await page.goto('/?e2e');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: 'New Campaign', exact: true }).click();
    await expect(page.locator('#missionIntroDialog')).toBeVisible();
    await page.locator('#missionIntroOk').click();

    await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const mission = campaign.getCurrentMission();
        for (const objective of mission.objectives) {
            if (objective.type !== 'transformation') continue;
            const fromId = definitions.findIndex(definition => definition?.name === objective.from);
            const toId = definitions.findIndex(definition => definition?.name === objective.to);
            for (let count = 0; count < objective.target; count++) campaign.recordMaterialTransition(fromId, toId);
        }
    });
    await expect(page.locator('#missionCompleteDialog')).toBeVisible();
    await page.locator('#missionCompleteOk').click();
    await page.locator('#missionAdvance').click();
    await expect(page.locator('#missionIntroNumber')).toHaveText('2');
    await page.locator('#missionIntroOk').click();

    await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const mission = campaign.getCurrentMission();
        const targets = mission.environmentTargets;
        campaign.recordEnvironmentChange({
            temperature: targets.temperature,
            humidity: targets.humidity,
            illumination: targets.illumination
        });
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        for (const objective of mission.objectives) {
            if (objective.type !== 'transformation') continue;
            const fromId = definitions.findIndex(definition => definition?.name === objective.from);
            const toId = definitions.findIndex(definition => definition?.name === objective.to);
            for (let count = 0; count < objective.target; count++) campaign.recordMaterialTransition(fromId, toId);
        }
    });
    await expect(page.locator('#missionCompleteDialog')).toBeVisible();
    await page.locator('#missionCompleteOk').click();
    await page.locator('#missionAdvance').click();
    await expect(page.locator('#missionIntroNumber')).toHaveText('3');
    await page.locator('#missionIntroOk').click();
    await expect(page.locator('#missionHud')).toBeVisible();
}

async function paintPlacementBlock(page, material, startX) {
    await page.evaluate(async ({ material, startX }) => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const game = await import('/game.js');
        const controls = await import('/constantsAndGlobalVars.js');
        const materialId = physics.getDefinitions().findIndex(definition => definition?.name === material);
        if (materialId <= 0) throw new Error(`Unknown mission material: ${material}`);
        controls.setParticleTypeIdSelected(materialId);
        controls.setBrushSize(1);

        const dispatch = window.dispatchEvent.bind(window);
        window.dispatchEvent = event => event.type === 'campaign-state-change' ? true : dispatch(event);
        try {
            for (let y = 25; y < 45; y++) {
                for (let x = startX; x < startX + 25; x++) game.paintCell(x, y, 0, 0);
            }
        } finally {
            window.dispatchEvent = dispatch;
            dispatch(new Event('campaign-state-change'));
        }
    }, { material, startX });
}

async function recordMissionTransitions(page, pairs, transitionCount = null) {
    await page.evaluate(async ({ pairs, transitionCount }) => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const mission = campaign.getCurrentMission();
        const dispatch = window.dispatchEvent.bind(window);
        window.dispatchEvent = event => event.type === 'campaign-state-change' ? true : dispatch(event);
        try {
            for (const [from, to] of pairs) {
                const objective = mission.objectives.find(item =>
                    item.type === 'transformation' && item.from === from && item.to === to);
                if (!objective) throw new Error(`Missing ${from} to ${to} mission objective.`);
                const fromId = definitions.findIndex(definition => definition?.name === from);
                const toId = definitions.findIndex(definition => definition?.name === to);
                const total = transitionCount ?? objective.target;
                for (let count = 0; count < total; count++) campaign.recordMaterialTransition(fromId, toId);
            }
        } finally {
            window.dispatchEvent = dispatch;
            dispatch(new Event('campaign-state-change'));
        }
    }, { pairs, transitionCount });
}

async function setControlValue(page, selector, value) {
    await page.locator(selector).evaluate((input, next) => {
        input.value = String(next);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
}

test('Mission 3 stages rain, drying, Glass, and the 2,000C Lava limit', async ({ page }) => {
    await startMissionThree(page);
    await page.locator('#pauseButton').click();

    const authoredMission = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const mission = campaign.getCurrentMission();
        const objectives = mission.objectives;
        return {
            mission,
            blank: physics.getWorld().type.every(type => type === 0),
            dryPlacements: ['Sand', 'Dry Mud', 'Ash'].map(material =>
                objectives.find(objective => objective.type === 'material-placement' && objective.material === material)),
            steamPlacement: objectives.find(objective =>
                objective.type === 'material-placement' && objective.material === 'Steam'),
            rainObjective: objectives.find(objective => objective.type === 'environment-target' &&
                Number.isFinite(objective.targetValues?.humidity) && Number.isFinite(objective.targetValues?.dewpoint)),
            wetObjectives: [['Sand', 'Wet Sand'], ['Dry Mud', 'Wet Mud'], ['Ash', 'Wet Ash']].map(([from, to]) =>
                objectives.find(objective => objective.type === 'transformation' && objective.from === from && objective.to === to)),
            dryObjectives: [['Wet Sand', 'Sand'], ['Wet Mud', 'Dry Mud'], ['Wet Ash', 'Ash']].map(([from, to]) =>
                objectives.find(objective => objective.type === 'transformation' && objective.from === from && objective.to === to)),
            dryingHeatObjective: objectives.find(objective => objective.type === 'environment-target' &&
                objective.targetValues?.temperature === 150),
            glassHeatObjective: objectives.find(objective => objective.type === 'environment-target' &&
                objective.targetValues?.temperature === 350),
            sandGlassObjective: objectives.find(objective => objective.type === 'transformation' &&
                objective.from === 'Sand' && objective.to === 'Glass'),
            highHeatObjective: objectives.find(objective => objective.type === 'environment-target' &&
                objective.targetValues?.temperature === 2000),
            dryMudDefinition: physics.getDefinitions().find(definition => definition?.name === 'Dry Mud'),
            definitions: physics.getDefinitions()
        };
    });

    expect(authoredMission.mission.number).toBe(3);
    expect(authoredMission.mission.startingLayout).toEqual({ type: 'blank' });
    expect(authoredMission.blank).toBe(true);
    expect(authoredMission.mission.resourceBudgets.materials).toEqual({
        Sand: 5000, 'Dry Mud': 5000, Ash: 5000, Steam: 8000
    });
    expect(authoredMission.dryPlacements.map(objective => objective?.target)).toEqual([500, 500, 500]);
    expect(authoredMission.steamPlacement?.target).toBe(500);
    expect(authoredMission.steamPlacement.requires).toEqual(expect.arrayContaining(
        authoredMission.dryPlacements.map(objective => objective.id)));
    expect(authoredMission.rainObjective?.targetValues).toEqual({ humidity: 95, dewpoint: 20 });
    expect(authoredMission.dryingHeatObjective?.targetValues).toEqual({ temperature: 150 });
    expect(authoredMission.wetObjectives.map(objective => objective?.target)).toEqual([150, 150, 150]);
    expect(authoredMission.dryObjectives.map(objective => objective?.target)).toEqual([150, 150, 150]);
    expect(authoredMission.mission.guidance).toMatch(/rain/i);
    expect(authoredMission.mission.guidance).toMatch(/150.*wet|wet.*150/i);
    expect(authoredMission.mission.guidance).toMatch(/dry|heat/i);
    expect(authoredMission.wetObjectives.every(objective => objective?.requires?.includes(authoredMission.rainObjective.id))).toBe(true);
    expect(authoredMission.dryObjectives.map(objective => objective?.from)).toEqual(['Wet Sand', 'Wet Mud', 'Wet Ash']);
    expect(authoredMission.dryObjectives[2].requires).toEqual(expect.arrayContaining([
        authoredMission.dryObjectives[0].id,
        authoredMission.dryObjectives[1].id,
        authoredMission.dryingHeatObjective.id
    ]));
    expect(authoredMission.dryObjectives[2].unlocks.controlLimits.temperature.max).toBe(350);
    expect(authoredMission.glassHeatObjective.targetValues).toEqual({ temperature: 350 });
    expect(authoredMission.sandGlassObjective.target).toBe(200);
    expect(authoredMission.sandGlassObjective.unlocks.controlLimits.temperature.max).toBe(2000);
    expect(authoredMission.highHeatObjective.requires).toContain(authoredMission.sandGlassObjective.id);
    expect(authoredMission.highHeatObjective?.targetValues).toEqual({ temperature: 2000 });
    expect(authoredMission.dryMudDefinition?.meltPoint).toBe(1200);
    expect(authoredMission.definitions[authoredMission.dryMudDefinition.meltsInto]?.name).toBe('Lava');

    await expect(page.locator('#airTemp')).toHaveAttribute('max', '150');
    await expect(page.locator('#airTempValue')).toHaveAttribute('max', '150');
    await expect(page.locator('#baseHumidity')).toBeDisabled();
    await expect(page.locator('#dewpoint')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Steam', exact: true })).toBeHidden();

    await paintPlacementBlock(page, 'Sand', 10);
    await paintPlacementBlock(page, 'Dry Mud', 40);
    await paintPlacementBlock(page, 'Ash', 70);
    const dryPileProgress = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const mission = campaign.getCurrentMission();
        const state = campaign.getCampaignState();
        return {
            objectives: mission.objectives.filter(objective =>
                objective.type === 'material-placement' && ['Sand', 'Dry Mud', 'Ash'].includes(objective.material))
                .map(objective => state.objectiveProgress[objective.id]),
            resources: Object.fromEntries(['Sand', 'Dry Mud', 'Ash'].map(name =>
                [name, state.resources.materials[name]])),
            canUseSteam: campaign.canUseMaterial('Steam')
        };
    });
    expect(dryPileProgress.objectives).toEqual([500, 500, 500]);
    for (const resource of Object.values(dryPileProgress.resources)) expect(resource.used).toBe(500);
    expect(dryPileProgress.canUseSteam).toBe(true);
    await expect(page.getByRole('button', { name: 'Steam', exact: true })).toBeVisible();
    await expect(page.locator('#baseHumidity')).toBeDisabled();
    await expect(page.locator('#dewpoint')).toBeDisabled();

    await paintPlacementBlock(page, 'Steam', 100);
    const afterSteam = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const mission = campaign.getCurrentMission();
        const state = campaign.getCampaignState();
        const objective = mission.objectives.find(item => item.type === 'material-placement' && item.material === 'Steam');
        return { progress: state.objectiveProgress[objective.id], target: objective.target };
    });
    expect(afterSteam.progress).toBe(afterSteam.target);
    await expect(page.locator('#baseHumidity')).toBeEnabled();
    await expect(page.locator('#dewpoint')).toBeEnabled();

    await setControlValue(page, '#baseHumidity', authoredMission.rainObjective.targetValues.humidity);
    await setControlValue(page, '#dewpoint', authoredMission.rainObjective.targetValues.dewpoint);
    const appliedRainClimate = await page.evaluate(async () => {
        const physics = await import('/physics.js');
        return {
            temperature: physics.getAmbientTarget(),
            humidity: physics.getAmbientHumidityTarget(),
            dewpoint: physics.getDewpointTarget()
        };
    });
    expect(appliedRainClimate).toEqual({ temperature: 25, humidity: 95, dewpoint: 20 });
    const rainProgress = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const mission = campaign.getCurrentMission();
        const objective = mission.objectives.find(item => item.type === 'environment-target' &&
            Number.isFinite(item.targetValues?.humidity) && Number.isFinite(item.targetValues?.dewpoint));
        return campaign.getCampaignState().objectiveProgress[objective.id];
    });
    expect(rainProgress).toBe(authoredMission.rainObjective.target);

    // The 150-cell wetting milestones match the following drying objectives.
    await recordMissionTransitions(page, [
        ['Sand', 'Wet Sand'], ['Dry Mud', 'Wet Mud'], ['Ash', 'Wet Ash']
    ], 150);
    const wetMilestoneProgress = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const state = campaign.getCampaignState();
        return ['wet-sand', 'wet-mud', 'wet-ash'].map(id => state.objectiveProgress[id]);
    });
    expect(wetMilestoneProgress).toEqual([150, 150, 150]);
    await setControlValue(page, '#airTemp', 150);
    const dryingHeatProgress = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const objective = campaign.getCurrentMission().objectives.find(item =>
            item.type === 'environment-target' && item.targetValues?.temperature === 150);
        return campaign.getCampaignState().objectiveProgress[objective.id];
    });
    expect(dryingHeatProgress).toBe(authoredMission.dryingHeatObjective.target);
    await recordMissionTransitions(page, [
        ['Wet Sand', 'Sand'], ['Wet Mud', 'Dry Mud'], ['Wet Ash', 'Ash']
    ]);
    await expect(page.locator('#airTemp')).toHaveAttribute('max', '350');
    await expect(page.locator('#airTempValue')).toHaveAttribute('max', '350');

    await setControlValue(page, '#airTemp', 350);
    await recordMissionTransitions(page, [['Sand', 'Glass']], 200);
    await expect(page.locator('#airTemp')).toHaveAttribute('max', '2000');
    await expect(page.locator('#airTempValue')).toHaveAttribute('max', '2000');

    await setControlValue(page, '#airTemp', 2000);
    const highHeatProgress = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const mission = campaign.getCurrentMission();
        const objective = mission.objectives.find(item => item.type === 'environment-target' &&
            item.targetValues?.temperature === 2000);
        return {
            target: objective.target,
            progress: campaign.getCampaignState().objectiveProgress[objective.id],
            temperature: (await import('/physics.js')).getAmbientTarget()
        };
    });
    expect(highHeatProgress).toMatchObject({ target: 1, progress: 1, temperature: 2000 });

    await page.locator('#airTempValue').fill('2500');
    await page.locator('#airTempValue').press('Enter');
    await expect(page.locator('#airTempValue')).toHaveValue('2000');
    await expect(page.locator('#airTemp')).toHaveValue('2000');

    await recordMissionTransitions(page, [
        ['Glass', 'Lava'], ['Dry Mud', 'Lava'], ['Ash', 'Lava']
    ]);
    const completion = await page.evaluate(async () => (await import('/campaign.js')).getCampaignState().missionCompleted);
    expect(completion).toBe(true);
    await expect(page.locator('#missionCompleteDialog')).toBeVisible();
});
