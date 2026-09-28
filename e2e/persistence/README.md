# Persistence E2E Coverage

Persistence specs cover portable Save/Load, autosave and Resume, malformed save
validation, replacement and clear choices, named local saves, campaign/sandbox
isolation, and migration of the legacy single-slot autosave.
The save library keeps each named record's snapshot and type separate, while an
active record ID controls Resume and autosave. Legacy v1/v2 saves remain
loadable as Sandbox; the v1 local autosave slot migrates into an active named
record without changing its compressed snapshot.

Campaign records are mission-number checkpoints. New Campaign creates no record;
the first record is written on **ADVANCE** after Mission 1 completion and recap
dismissal, and contains only the successor `missionNumber` in its campaign
payload. Resume reconstructs a pristine authored scenario and does not change
the checkpoint's `saveString` or `updatedAt`. Campaign has no timed autosave or
mid-mission Save/export. Legacy full-state v3 Campaign records normalize to a
number-only checkpoint. Starting a fresh Campaign must preserve existing
Campaign records until its first ADVANCE creates its own record.

Autosave coverage checks the live toolbar checkbox across New Game, Resume,
Load, and failed writes. Turning Autosave off preserves the current saved
record while stopping future automatic writes; re-enabling it starts a fresh
five-minute interval without an immediate write. Portable copy/paste remains
available alongside the local save list and its Load actions.

The final focused persistence selection passed **5/5 tests** on 28 September
2026. The exact selected run was:

```text
npm.cmd run test:browser -- e2e/persistence --grep "resume slot is offered|clear cancel and confirm|New Game autosave choices|Load Cancel leaves|legacy single-slot" --workers=1 --trace=off
```

After a separate fresh-Sandbox save regression was added, the three registry
tests passed **3/3**:

```text
npm.cmd run test:browser -- e2e/persistence/multi-save-registry.spec.mjs --workers=1 --trace=off
```

The final targeted Campaign and persistence selection passed **15/15 tests**
on 28 September 2026. It covered `campaign-checkpoints.spec.mjs` and
`multi-save-registry.spec.mjs` alongside the Campaign mission, progression,
restart, and catalog specs. Two separate focused Sandbox persistence
regressions also passed **1/1** each: clear cancel/confirm and portable Save/Load
round-trip. Exact commands and scope are recorded in
[`../../docs/E2E_TEST_PLAN.md`](../../docs/E2E_TEST_PLAN.md).

An earlier broad Campaign-plus-persistence run was exploratory and exposed
stale expectations; those were corrected before the targeted final runs. The
exploratory run is not reported as clean, and the full persistence area was not
rerun. Keep persistence assertions aligned with the current architecture,
commands, and maintenance contract in
[`../../docs/E2E_TEST_PLAN.md`](../../docs/E2E_TEST_PLAN.md).
