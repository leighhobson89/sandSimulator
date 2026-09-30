import { test, expect } from '@playwright/test';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';

test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus) await attachGameDiagnostics(info, page, 'campaign-objective-carousel');
});

const previousButton = '#missionObjectivePrevious';
const nextButton = '#missionObjectiveNext';
const currentCard = '#missionObjectiveCurrent';
const positionLabel = '#missionObjectivePosition';

async function startMissionOne(page) {
    await page.goto('/?e2e');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: 'New Campaign', exact: true }).click();
    await expect(page.locator('#missionIntroDialog')).toBeVisible();
    await page.locator('#missionIntroOk').click();
    await expect(page.locator('#missionHud')).toBeVisible();
}

async function recordMissionCompletion(page) {
    await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const mission = campaign.getCurrentMission();
        const definitions = physics.getDefinitions();
        for (const objective of mission.objectives) {
            if (objective.type === 'environment-target') {
                const targets = objective.targetValues || mission.environmentTargets;
                campaign.recordEnvironmentChange({
                    temperature: targets.temperature,
                    humidity: targets.humidity,
                    illumination: targets.illumination,
                    dewpoint: targets.dewpoint
                });
                continue;
            }
            if (objective.type !== 'transformation') continue;
            const fromId = definitions.findIndex(definition => definition?.name === objective.from);
            const toId = definitions.findIndex(definition => definition?.name === objective.to);
            if (fromId <= 0 || toId <= 0) throw new Error(`Unknown objective transition: ${objective.from} to ${objective.to}`);
            const from = definitions[fromId];
            const to = definitions[toId];
            for (let count = 0; count < objective.target; count++) {
                if (from?.isSeed && to?.isPlant && to.growHeight > 0) campaign.recordPlantGrowthCompletion(fromId, toId);
                else campaign.recordMaterialTransition(fromId, toId);
            }
        }
    });
}

async function advanceFromMissionRecap(page, nextNumber) {
    await expect(page.locator('#missionCompleteDialog')).toBeVisible();
    await page.locator('#missionCompleteOk').click();
    await expect(page.locator('#missionCompleteDialog')).toBeHidden();
    await page.locator('#missionAdvance').click();
    await expect(page.locator('#missionIntroDialog')).toBeVisible();
    await expect(page.locator('#missionIntroNumber')).toHaveText(String(nextNumber));
}

async function startMissionTwo(page) {
    await startMissionOne(page);
    await recordMissionCompletion(page);
    await advanceFromMissionRecap(page, 2);
    await page.locator('#missionIntroOk').click();
    await expect(page.locator('#missionHud')).toBeVisible();
}

async function startMissionThree(page) {
    await startMissionTwo(page);
    await recordMissionCompletion(page);
    await advanceFromMissionRecap(page, 3);
    await page.locator('#missionIntroOk').click();
    await expect(page.locator('#missionHud')).toBeVisible();
}

async function expectCompletedCard(page, objectiveId, position) {
    const card = page.locator(currentCard);
    await expect(card).toHaveAttribute('data-objective-id', objectiveId);
    await expect(card).toHaveAttribute('data-objective-complete', 'true');
    await expect(card).toHaveClass(/is-complete/);
    await expect(card).toContainText(/completed/i);
    await expect(page.locator('#missionObjectiveCheck')).toBeVisible();
    await expect(page.locator(positionLabel)).toHaveText(position);
}

test('Mission 1 carousel has one objective, stays selected at completion, and stops at both boundaries', async ({ page }) => {
    await startMissionOne(page);

    const objectiveId = await page.evaluate(async () => (await import('/campaign.js')).getCurrentMission().objectives[0].id);
    await expect(page.locator('#missionObjectiveCarousel')).toBeVisible();
    await expect(page.locator(positionLabel)).toHaveText('1 / 1');
    await expect(page.locator(currentCard)).toHaveAttribute('data-objective-id', objectiveId);
    await expect(page.locator(currentCard)).toHaveAttribute('data-objective-locked', 'false');
    await expect(page.locator(previousButton)).toBeDisabled();
    await expect(page.locator(nextButton)).toBeDisabled();

    await recordMissionCompletion(page);
    await expectCompletedCard(page, objectiveId, '1 / 1');
    await expect(page.locator('#missionCompleteDialog')).toBeVisible();
    await expect(page.locator(previousButton)).toBeDisabled();
    await expect(page.locator(nextButton)).toBeDisabled();
});

test('Mission 2 selection survives progress rerenders and resets after restart, reload, and advance', async ({ page }) => {
    await startMissionTwo(page);
    await expect(page.locator('#missionObjectiveCarousel')).toBeVisible();
    const objectiveIds = await page.evaluate(async () => (await import('/campaign.js')).getCurrentMission()
        .objectives.map(objective => objective.id));
    expect(objectiveIds).toEqual(['melt-ice', 'warm-grove', 'wet-mud', 'grow-banana']);

    await expect(page.locator(positionLabel)).toHaveText('1 / 4');
    await expect(page.locator(currentCard)).toHaveAttribute('data-objective-id', objectiveIds[0]);
    await expect(page.locator(previousButton)).toBeDisabled();
    await expect(page.locator(nextButton)).toBeEnabled();
    await page.locator(nextButton).click();
    await expect(page.locator(positionLabel)).toHaveText('2 / 4');
    await expect(page.locator(currentCard)).toHaveAttribute('data-objective-id', objectiveIds[1]);

    await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const fromId = definitions.findIndex(definition => definition?.name === 'Ice');
        const toId = definitions.findIndex(definition => definition?.name === 'Water');
        campaign.recordMaterialTransition(fromId, toId);
    });
    await expect(page.locator(positionLabel)).toHaveText('2 / 4');
    await expect(page.locator(currentCard)).toHaveAttribute('data-objective-id', objectiveIds[1]);
    await expect(page.locator(currentCard)).toHaveAttribute('data-objective-complete', 'false');

    await page.evaluate(async () => (await import('/campaign.js')).recordEnvironmentChange({
        temperature: 30, humidity: 95, illumination: 85
    }));
    await expectCompletedCard(page, objectiveIds[1], '2 / 4');

    await page.locator(nextButton).click();
    await expect(page.locator(positionLabel)).toHaveText('3 / 4');
    await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        campaign.recordMaterialTransition(
            definitions.findIndex(definition => definition?.name === 'Dry Mud'),
            definitions.findIndex(definition => definition?.name === 'Wet Mud')
        );
    });
    await expectCompletedCard(page, objectiveIds[2], '3 / 4');
    await page.locator(nextButton).click();
    await expect(page.locator(positionLabel)).toHaveText('4 / 4');
    await expect(page.locator(currentCard)).toHaveAttribute('data-objective-id', objectiveIds[3]);
    await expect(page.locator(previousButton)).toBeEnabled();
    await expect(page.locator(nextButton)).toBeDisabled();

    await page.locator('#restartMissionButton').click();
    await expect(page.locator('#missionRestartDialog')).toBeVisible();
    await page.locator('#confirmRestartMission').click();
    await expect(page.locator('#missionRestartDialog')).toBeHidden();
    await expect(page.locator(positionLabel)).toHaveText('1 / 4');
    await expect(page.locator(currentCard)).toHaveAttribute('data-objective-id', objectiveIds[0]);
    await expect(page.locator(currentCard)).toHaveAttribute('data-objective-complete', 'false');
    await expect(page.locator(previousButton)).toBeDisabled();

    for (let count = 0; count < 3; count++) await page.locator(nextButton).click();
    await expect(page.locator(positionLabel)).toHaveText('4 / 4');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Resume Game', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Resume Game', exact: true }).click();
    await expect(page.locator('#missionHud')).toBeVisible();
    await expect(page.locator(positionLabel)).toHaveText('1 / 4');
    await expect(page.locator(currentCard)).toHaveAttribute('data-objective-id', objectiveIds[0]);
    await expect(page.locator(previousButton)).toBeDisabled();

    for (let count = 0; count < 3; count++) await page.locator(nextButton).click();
    await expect(page.locator(positionLabel)).toHaveText('4 / 4');
    await recordMissionCompletion(page);
    await expect(page.locator('#missionCompleteDialog')).toBeVisible();
    await expect(page.locator(positionLabel)).toHaveText('4 / 4');
    await expect(page.locator(currentCard)).toHaveAttribute('data-objective-id', objectiveIds[3]);

    await advanceFromMissionRecap(page, 3);
    await page.locator('#missionIntroOk').click();
    await expect(page.locator('#missionHud')).toBeVisible();
    await expect(page.locator(positionLabel)).toHaveText('1 / 18');
    await expect(page.locator(currentCard)).toHaveAttribute('data-objective-id', 'place-sand');
    await expect(page.locator(previousButton)).toBeDisabled();
});

test('Mission 3 carousel counts 18 objectives, marks gates, and keeps completed cards selected', async ({ page }) => {
    await startMissionThree(page);
    await expect(page.locator('#missionObjectiveCarousel')).toBeVisible();
    const missionData = await page.evaluate(async () => {
        const campaign = await import('/campaign.js');
        const weatherObjective = campaign.getCurrentMission().objectives.find(objective => objective.id === 'place-steam');
        return {
            count: campaign.getCurrentMission().objectives.length,
            firstId: campaign.getCurrentMission().objectives[0].id,
            weatherObjective: weatherObjective ? { id: weatherObjective.id, material: weatherObjective.material } : null
        };
    });
    expect(missionData.count).toBe(18);
    expect(missionData.firstId).toBe('place-sand');
    expect(missionData.weatherObjective).toEqual({ id: 'place-steam', material: 'Cloud' });
    await expect(page.locator(positionLabel)).toHaveText('1 / 18');
    await expect(page.locator(previousButton)).toBeDisabled();
    await expect(page.locator(nextButton)).toBeEnabled();

    await page.evaluate(async () => (await import('/campaign.js')).recordMaterialPlacement('Sand', 500));
    await expectCompletedCard(page, 'place-sand', '1 / 18');

    for (let count = 0; count < 3; count++) await page.locator(nextButton).click();
    await expect(page.locator(positionLabel)).toHaveText('4 / 18');
    await expect(page.locator(currentCard)).toHaveAttribute('data-objective-id', 'place-steam');
    await expect(page.locator(currentCard)).toHaveAttribute('data-objective-locked', 'true');
    await expect(page.locator(currentCard)).toContainText(/locked/i);

    for (let count = 4; count < 18; count++) await page.locator(nextButton).click();
    await expect(page.locator(positionLabel)).toHaveText('18 / 18');
    await expect(page.locator(nextButton)).toBeDisabled();
    await expect(page.locator(previousButton)).toBeEnabled();

    for (let count = 0; count < 17; count++) await page.locator(previousButton).click();
    await expect(page.locator(positionLabel)).toHaveText('1 / 18');
    await expect(page.locator(previousButton)).toBeDisabled();
    await expect(page.locator(currentCard)).toHaveAttribute('data-objective-id', 'place-sand');
    await expectCompletedCard(page, 'place-sand', '1 / 18');
});

test('objective carousel has labelled controls, supports Enter, and truncates narrow labels accessibly', async ({ page }) => {
    await startMissionThree(page);
    await page.setViewportSize({ width: 390, height: 844 });

    const carousel = page.getByRole('group', { name: 'Mission objectives' });
    const previous = page.getByRole('button', { name: 'Previous objective' });
    const next = page.getByRole('button', { name: 'Next objective' });
    await expect(carousel).toBeVisible();
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();

    await next.focus();
    await expect(next).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator(positionLabel)).toHaveText('2 / 18');
    await next.click();
    await next.click();
    await expect(page.locator(positionLabel)).toHaveText('4 / 18');
    await expect(page.locator(currentCard)).toHaveAttribute('data-objective-id', 'place-steam');
    await expect(page.locator(currentCard)).toHaveAttribute('data-objective-locked', 'true');
    await expect(page.locator(currentCard)).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator(currentCard)).toHaveAttribute('aria-atomic', 'true');
    await expect(page.locator('#missionObjectiveLabel')).toHaveText(
        'Place Cloud above the piles to add moisture to the air.'
    );

    const layout = await page.evaluate(() => {
        const hud = document.querySelector('#missionHud');
        const carouselElement = document.querySelector('#missionObjectiveCarousel');
        const card = document.querySelector('#missionObjectiveCurrent');
        const label = document.querySelector('#missionObjectiveLabel');
        const hudRect = hud.getBoundingClientRect();
        const carouselRect = carouselElement.getBoundingClientRect();
        const labelStyle = getComputedStyle(label);
        return {
            carouselInsideHud: carouselRect.left >= hudRect.left - 1 && carouselRect.right <= hudRect.right + 1,
            carouselFits: carouselElement.scrollWidth <= carouselElement.clientWidth + 1,
            cardFits: card.scrollWidth <= card.clientWidth + 1,
            labelIsSingleLine: label.getBoundingClientRect().height <= parseFloat(labelStyle.lineHeight) + 1,
            labelEllipsized: labelStyle.whiteSpace === 'nowrap' && labelStyle.textOverflow === 'ellipsis' &&
                ['hidden', 'clip'].includes(labelStyle.overflowX) && label.scrollWidth > label.clientWidth + 1
        };
    });
    expect(layout.carouselInsideHud).toBe(true);
    expect(layout.carouselFits).toBe(true);
    expect(layout.cardFits).toBe(true);
    expect(layout.labelIsSingleLine).toBe(true);
    expect(layout.labelEllipsized).toBe(true);
});

test('objective carousel stays on one row with a left counter and centered copy at desktop and mobile widths', async ({ page }) => {
    await startMissionTwo(page);

    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        const layout = await page.evaluate(() => {
            const hud = document.querySelector('#missionHud');
            const carousel = document.querySelector('#missionObjectiveCarousel');
            const previous = document.querySelector('#missionObjectivePrevious');
            const current = document.querySelector('#missionObjectiveCurrent');
            const next = document.querySelector('#missionObjectiveNext');
            const position = document.querySelector('#missionObjectivePosition');
            const copy = document.querySelector('.mission-objective-copy');
            const label = document.querySelector('#missionObjectiveLabel');
            const rect = element => element.getBoundingClientRect();
            const hudRect = rect(hud);
            const carouselRect = rect(carousel);
            const currentRect = rect(current);
            const positionRect = rect(position);
            const copyRect = rect(copy);
            const labelRect = rect(label);
            const textRange = document.createRange();
            textRange.selectNodeContents(label);
            const textRects = [...textRange.getClientRects()];
            const textCenter = textRects.length
                ? textRects.reduce((sum, item) => sum + (item.left + item.right) / 2, 0) / textRects.length
                : NaN;
            const rowCenters = [previous, current, next].map(element => {
                const bounds = rect(element);
                return (bounds.top + bounds.bottom) / 2;
            });
            return {
                insideHud: carouselRect.left >= hudRect.left - 1 && carouselRect.right <= hudRect.right + 1,
                carouselFits: carousel.scrollWidth <= carousel.clientWidth + 1,
                oneControlRow: Math.max(...rowCenters) - Math.min(...rowCenters) <= 2,
                counterOnLeft: positionRect.right <= copyRect.left,
                labelCentered: getComputedStyle(label).textAlign === 'center' &&
                    Math.abs(textCenter - (currentRect.left + currentRect.right) / 2) <= 28,
                labelFits: label.scrollWidth <= label.clientWidth + 1,
                labelRectWidth: labelRect.width
            };
        });
        expect(layout.insideHud, `carousel fits inside HUD at ${viewport.width}px`).toBe(true);
        expect(layout.carouselFits, `carousel has no horizontal overflow at ${viewport.width}px`).toBe(true);
        expect(layout.oneControlRow, `arrows and objective share one row at ${viewport.width}px`).toBe(true);
        expect(layout.counterOnLeft, `counter stays left of the objective at ${viewport.width}px`).toBe(true);
        expect(layout.labelCentered, `objective copy stays centered at ${viewport.width}px`).toBe(true);
        expect(layout.labelFits, `objective copy has no horizontal overflow at ${viewport.width}px`).toBe(true);
        expect(layout.labelRectWidth).toBeGreaterThan(0);
    }
});
