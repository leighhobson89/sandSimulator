import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 30_000,
    expect: { timeout: 8_000 },
    use: {
        baseURL: 'http://127.0.0.1:4173',
        browserName: 'chromium',
        headless: true,
        viewport: { width: 1440, height: 900 },
        colorScheme: 'dark'
    },
    webServer: {
        command: 'node tools/serve.mjs',
        url: 'http://127.0.0.1:4173',
        env: { PORT: '4173' },
        reuseExistingServer: false,
        timeout: 15_000
    }
});
