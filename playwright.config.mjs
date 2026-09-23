import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: '.',
    testMatch: ['e2e/**/*.spec.mjs', 'tests/**/*.spec.mjs'],
    testIgnore: ['.kilo/**', 'node_modules/**', 'test-results/**'],
    timeout: 30_000,
    expect: { timeout: 8_000 },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI ? [['line'], ['html', { outputFolder: 'playwright-report', open: 'never' }]] : 'list',
    outputDir: 'test-results/playwright',
    use: {
        baseURL: 'http://127.0.0.1:4173',
        browserName: 'chromium',
        headless: true,
        viewport: { width: 1440, height: 900 },
        colorScheme: 'dark',
        actionTimeout: 10_000,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure'
    },
    webServer: {
        command: 'node tools/serve.mjs',
        url: 'http://127.0.0.1:4173',
        env: { PORT: '4173' },
        reuseExistingServer: false,
        timeout: 15_000
    }
});
