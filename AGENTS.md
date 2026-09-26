# Project Instructions

## Development Handoff Workflow

Every development prompt must pass through this ordered agent handoff process:

1. The `architect` agent plans the change and defines the implementation and
   verification scope.
2. The `docs-specialist` agent writes up the plan in the docs/plans folder from the architect.
3. The `test-engineer` agent writes focused failing regression tests from that
   plan before implementation begins. This runs in parallel with #2.
4. The `docs-specialist` agent updates the plan with the created test plan.
5. The `frontend-specialist` agent implements the plan, preserving existing behavior outside the requested scope. This runs in parallel with #4.
6. The focussed tests are run and we iterate until they all pass.
7. The `docs-specialist` agent updates the relevant project documentation after
   implementation, review, and verification are complete, and makes sure the docs/plans folder is empty and plans are moved to the archived plans folder.

Agents may use `write`, but should prefer `apply_patch` and other patch-based
editing over `write` or `edit` because patch operations are more reliable for
small, reviewable changes.

### Quick Mode

When a user includes the exact code word `QMODE` in a development prompt, including if it is in a steering prompt, ie one that is sent during activity from a previous prompt, the main agent may make the requested minor change directly without handing it through the specialist workflow and without running tests. The main agent must decide whether the change is minor enough for Quick Mode and whether any documentation needs updating; if it is not clearly minor, use the normal handoff workflow instead.

## Documentation Memory

Maintain the relevant project documentation whenever code changes alter
behavior, data formats, recipes, UI presentation, persistence, or tests.

For mixer changes, always update `docs/GAME_MECHANICS.md` in the same change.
Keep the recipe table, output behavior, bin reset rules, release behavior, and
any new persistence fields accurate. Add or update regression tests when
behavior changes.

For any machine addition or change, follow
`docs/MACHINE_CONSTRUCTION_STANDARDS.md`. Check declared port roles and
anchors, interaction and settings, exposed sensor markers when applicable,
Tubing/Elec connector materials and electrical lead width, collision and
intentional openings, persistence lifecycle, and the focused regression
coverage. Update the relevant mechanics and E2E documentation with the change.

## Plan Archiving

After implementation, archive every executed or finalized plan in
`docs/archive/plans/`, preserving its content in a dated, descriptive filename.

## Test Execution Approval

Always ask the user for approval before running a full test suite. Focused test
runs for specific functional areas may be run without prior approval, up to
three areas per request.

## Project Test Harness Preference

Use the project's documented npm test commands as the only test entry points.
Keep deterministic simulation regressions in the existing `tools/` harnesses
(`simTest.mjs`, `smokeTest.mjs`, `scaleProfileTest.mjs`, and
`worldAllocationTest.mjs`). Keep browser-visible regression coverage as
Playwright specs under the owning `e2e/` functional area. Run focused browser
coverage only through the npm wrapper with an area or spec path, for example:
`npm run test:browser -- e2e/physics --workers=1 --trace=off`.
Run browser tests with the repository's Playwright configuration through that
npm wrapper. Do not add temporary configs, override browser launch settings,
or switch to another browser to work around a missing local test runtime.
If startup fails, distinguish missing dependencies from denied access, perform
authorized setup or request command-level permission, and retry the same npm
wrapper. If permission is rejected or unavailable, report the exact blocker;
do not bypass the rejection.

### Browser E2E setup memory

- Install locked packages with `npm ci`, then install the Playwright-matched
  Chromium binary with `npx playwright install chromium`. Reinstall Chromium
  after changing the locked Playwright version.
- `playwright.config.mjs` starts the local server automatically; browser specs
  must run through the documented npm wrapper. In PowerShell, use `npm.cmd` or
  `npx.cmd` if script execution blocks the `.ps1` shims.
- Windows agent commands can run as `codexsandboxoffline` while profile
  variables still point to Leigh. Playwright can report an existing browser as
  missing when that account cannot read the cache. Check `whoami` and preserve
  errors with `Get-Item -LiteralPath <reported-executable> -ErrorAction Stop`;
  `EPERM`/access denied is not evidence that installation is needed.
- For authorized browser tests in this Windows agent environment, invoke the
  unchanged npm wrapper from the repository root with the execution tool's
  `sandbox_permissions: "require_escalated"` and a justification explaining
  browser-cache access. This supported command-level approval successfully ran
  all six navigation tests on 2026-09-25. Follow the active approval policy;
  test scope/full-suite authorization remains a separate requirement.
- Do not repeatedly install browsers into an inaccessible cache. Install only
  when the matching browser is genuinely absent in an accessible context.
  An installer interrupted by an agent is an interrupted attempt, not proof of
  an installation failure. See `docs/E2E_TEST_PLAN.md` for the diagnosis.
