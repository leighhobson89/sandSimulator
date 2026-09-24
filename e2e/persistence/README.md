# Persistence E2E Coverage

The four specs contain 13 tests covering Save/Load round trips, autosave
resume, malformed/empty/unsupported save validation, New Game and Load
replacement choices, clear confirmation, cancellation, and saved-state
boundaries. Autosave coverage checks the live toolbar checkbox across New Game,
Resume, Load, and failed writes. Turning it off preserves the existing resume
save while stopping future automatic writes; re-enabling it restarts the
five-minute interval without an immediate write. The focused persistence
Playwright area passed 13/13 headlessly. The latest tooltip-only QMODE visual
edit was not separately tested. Keep persistence assertions aligned with the
current architecture, commands, and maintenance contract in
[`../../docs/E2E_TEST_PLAN.md`](../../docs/E2E_TEST_PLAN.md).
