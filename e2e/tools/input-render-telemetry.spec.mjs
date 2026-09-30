import { expect, test } from '@playwright/test';
import { GamePage } from '../helpers/gamePage.mjs';
import { attachGameDiagnostics } from '../helpers/diagnostics.mjs';
import { clickCanvasCell } from '../helpers/canvas.mjs';

test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus) await attachGameDiagnostics(info, page, 'input-render-telemetry');
});

test('a real brush press is recorded once through completion of the next draw', async ({ page }) => {
    const game = new GamePage(page);
    await game.openMenu();
    await game.newGame();
    await page.getByRole('button', { name: 'Water', exact: true }).click();
    await page.locator('#brushSize').fill('31');
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

    await clickCanvasCell(page, { x: 50, y: 50 });
    const result = await page.evaluate(async () => {
        const game = await import('/game.js');
        const physics = await import('/physics.js');
        game.gameLoop(performance.now());
        const waterId = physics.getDefinitions().findIndex(definition => definition?.name === 'Water');
        const events = window.__P0_PERF__.snapshot();
        return {
            waterCells: physics.getWorld().type.reduce((count, id) => count + (id === waterId ? 1 : 0), 0),
            inputEvents: events.filter(event => event.name === 'inputToNextDrawCompleteMs'),
            drawEvents: events.filter(event => event.name === 'drawWorld')
        };
    });

    expect(result.waterCells).toBe(709);
    expect(result.drawEvents.length).toBeGreaterThanOrEqual(1);
    expect(result.inputEvents).toHaveLength(1);
    expect(result.inputEvents[0].durationMs).toEqual(expect.any(Number));
    expect(result.inputEvents[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(result.inputEvents[0].counters).toMatchObject({ inputCount: 1, brushSize: 31 });
    expect(Object.values(result.inputEvents[0].counters).every(Number.isFinite)).toBe(true);
});
