# Persistence E2E Coverage

The four specs contain 11 tests covering export/import round trips, autosave
resume, malformed/empty/unsupported save validation, New Game and Import
replacement choices, clear confirmation, cancellation, and saved-state
boundaries. Keep persistence assertions aligned with the current architecture,
commands, and maintenance contract in
[`../../docs/E2E_TEST_PLAN.md`](../../docs/E2E_TEST_PLAN.md).
