export async function attachGameDiagnostics(testInfo, page, label = 'game-state') {
    await testInfo.attach(`${label}.png`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    const state = await page.evaluate(() => window.__GAME_INSTANCE__?.inspect?.() ?? null);
    await testInfo.attach(`${label}.json`, { body: Buffer.from(JSON.stringify(state, null, 2)), contentType: 'application/json' });
}
