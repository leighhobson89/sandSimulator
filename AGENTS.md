# Project Instructions

## Development Handoff Workflow

Every development prompt must pass through this ordered agent handoff process:

1. The `architect` agent plans the change and defines the implementation and
   verification scope.
2. The `test-engineer` agent writes focused failing regression tests from that
   plan before implementation begins.
3. The `frontend-specialist` agent implements the plan, preserving existing behavior outside the requested scope.
4. The focussed tests are run and we iterate until they all pass.
5. The `docs-specialist` agent updates the relevant project documentation after
   implementation, review, and verification are complete.

Agents may use `write`, but should prefer `apply_patch` and other patch-based
editing over `write` or `edit` because patch operations are more reliable for
small, reviewable changes.

### Quick Mode

When a user includes the exact code word `QMODE` in a development prompt,
the main agent may make the requested minor change directly without handing it
through the specialist workflow and without running tests. The main agent must
decide whether the change is minor enough for Quick Mode and whether any
documentation needs updating; if it is not clearly minor, use the normal
handoff workflow instead.

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
