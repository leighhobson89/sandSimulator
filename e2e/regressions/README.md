# E2E Regression Coverage

This folder is the ongoing home for focused end-to-end regression coverage for
repaired defects. Whenever a bug is found and fixed, add a focused regression
test to the appropriate spec here. A relevant functional-area spec may own the
test instead when that is the established ownership; keep the regression
scenario discoverable there.

This folder currently has no regression-only specs because repaired defects are
owned by their functional-area specs. New regression specs should use the
existing helpers and follow the coverage and determinism requirements in
[`../../docs/E2E_TEST_PLAN.md`](../../docs/E2E_TEST_PLAN.md).
