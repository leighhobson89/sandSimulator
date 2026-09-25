# Plan: Clarify Playwright browser setup and troubleshooting

## Goal

Make `docs/E2E_TEST_PLAN.md` sufficient for a fresh checkout to install the
locked browser-test dependencies, run the configured Chromium tests, and find
failure artifacts.

## Source findings

- `package-lock.json` pins `@playwright/test`, `playwright`, and
  `playwright-core` to `1.63.0`; their declared Node.js engine floor is `20`.
  Recommend a currently supported Node.js line (`22.x`, `24.x`, or `26.x`) for
  fresh setup. The project does not pin a separate npm version and uses lockfile
  version 3.
- `playwright.config.mjs` selects headless Chromium and automatically starts
  `node tools/serve.mjs` at `http://127.0.0.1:4173`. `PLAYWRIGHT_PORT` changes
  that port, and `reuseExistingServer: false` means the configured server is
  started by the test runner rather than attached to an existing server.
- The configuration keeps failure traces, screenshots, and videos under
  `test-results/playwright`. Local runs use the list reporter. With `CI` set,
  the line and HTML reporters run, with HTML output under `playwright-report`
  and automatic opening disabled. Both output directories are ignored by Git;
  the repository has no workflow that uploads them as CI artifacts.
- The existing `test:browser` npm wrapper, full-suite command, focused area and
  spec commands, and one-worker settings are already documented and should
  remain the only browser-test entry points.

## Scope

- Add fresh-checkout prerequisites and setup: recommend a current supported
  Node.js line (`22.x`, `24.x`, or `26.x`) while recording the locked
  dependency's Node.js `20` engine floor, then use `npm ci` and
  `npx playwright install chromium` for the only configured browser.
- Document `npx playwright install-deps chromium` for Linux system libraries,
  and `.cmd` forms (`npm.cmd`, `npx.cmd`) when PowerShell blocks the `.ps1`
  shims.
- Explain that the test wrapper starts its own server, the default and
  override port, and that Playwright browser binaries must be reinstalled with
  `npx playwright install chromium` after a Playwright version upgrade.
- Add missing-browser and Linux dependency troubleshooting, local versus CI
  reporter/artifact locations, and an explicit note that CI artifact upload is
  not configured in this repository.
- Keep the existing full and focused npm wrapper commands and their functional
  ownership guidance intact. Do not alter application code, test specs, or
  runtime configuration.

## Doc-validation scope

- Manually compare setup prerequisites, server behavior, reporter settings,
  artifact paths, and commands against `package-lock.json`, `package.json`,
  `playwright.config.mjs`, and `.gitignore`.
- Check that every new command uses the configured Chromium browser and that
  all focused and full browser commands go through the existing npm wrapper.
- Verify local and CI reporter/artifact descriptions match the config and
  repository ignore rules, including the lack of a CI artifact upload workflow.
- Read the edited setup section and existing command sections in context, and
  ensure the root `AGENTS.md` memory matches the documented setup. This is a
  documentation-only change; do not run tests.

## Outcome

The setup guidance and root browser-setup memory were updated and manually
checked against the locked dependencies, Playwright configuration, and Git
ignore rules. Existing full and focused npm wrapper commands remain in place.
No tests were run.
