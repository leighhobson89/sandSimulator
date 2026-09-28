# Navigation E2E Coverage

The two specs contain seven tests for startup, the refreshed menu, Sandbox and
Campaign entry, Resume Game, menu Load Game, workspace tabs, pause transitions,
all six theme swatches, theme persistence, invalid stored themes, and
menu/toolbar synchronization. The menu regression checks that New Campaign is
first, Sandbox is second, the actions are vertically stacked, the Sandbox
button has the mode-matching label, and the theme panel sits beneath the
actions. Terminal keeps the menu centered.

The New Campaign flow must show its accessible mission briefing before opening
the workspace. Sandbox continues into its existing freeform startup. Keep
navigation and theme workflows aligned with the current architecture, commands,
and maintenance contract in
[`../../docs/E2E_TEST_PLAN.md`](../../docs/E2E_TEST_PLAN.md).

Focused command:

```text
npm.cmd run test:browser -- e2e/navigation --workers=1 --trace=off
```

The final navigation run passed **7/7 tests** on 28 September 2026.
