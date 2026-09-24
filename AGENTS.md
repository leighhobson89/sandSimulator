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
or switch to another browser to work around a missing local test runtime. If
the documented command cannot start, report that the local test runner is
blocked and stop there; do not suggest alternate browsers or launch configs.
