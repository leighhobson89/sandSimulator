import { expect } from '@playwright/test';
import { expectCanvasVisible } from './canvas.mjs';

export class GamePage {
    constructor(page) { this.page = page; this.canvas = page.locator('#canvas'); }

    async openMenu() {
        await this.page.goto('/?e2e');
        await expect(this.page.getByRole('heading', { name: 'Elemental Foundry' })).toBeVisible();
    }

    async newGame() {
        await this.page.getByRole('button', { name: 'New Game' }).click();
        await expectCanvasVisible(this.page);
        await this.page.getByRole('button', { name: 'Pause' }).click();
    }

    async state() { return this.page.evaluate(() => window.__GAME_INSTANCE__.inspect()); }
    async step(frames = 1) { return this.page.evaluate(count => window.__GAME_INSTANCE__.step(count), frames); }
    async seed(seed = 0) { return this.page.evaluate(value => window.__GAME_INSTANCE__.setRandomSeed(value), seed); }
}
