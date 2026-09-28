# Campaign E2E Coverage

Mission 1, **The First Daffodil**, starts with a full-width Sand floor and
player supplies of 100 Dry Mud, 1,000 Water, and one Daffodil Seed. Its fixed
ideal climate is 14 °C, 68% humidity, 65% illumination, 10 °C dewpoint, and no
wind. Its objective counts one actual Daffodil Seeds-to-Daffodil germination
transition and fires its configured event once.

`mission.spec.mjs` verifies the mission definition, Sand-only starting habitat,
climate, budgets and locks, placement from supplies, and objective/event
idempotence. `editor.spec.mjs` verifies main-menu entry to an unrestricted
authoring Sandbox, live canvas beside the editor panel, 300×170 canvas sizing,
draft persistence, captured scenario save and restoration, validation/review
gating, autosave suspension without changing the resume save, and
marker-bounded source installation with backup and replacement confirmation.
Changing the captured world or resuming simulation marks the snapshot stale.
The editor spec also checks that Mission 2's climate-target values and typed
environment objective persist in a draft.

`mission-progression.spec.mjs` verifies Mission 1's automatic completion recap
and used/total/remaining resource counts, **OK** dismissal, the persistent
objective-passed HUD bar, and **ADVANCE** into the Mission 2 briefing and Ice
scenario. It checks the Mission 2 climate target, starting world and budgets,
campaign-only disabled-control marker, reduced opacity and bold red
`DISABLED` tooltip, usable system-action exceptions, Sandbox isolation, and
pristine reconstruction of checkpointed missions on Resume. The briefing guides
the player to the Temperature, Humidity, and Ambient Light sliders, explains
that 30°C and 95% match Banana's ideals, and labels 85% illumination as the
mission target.

`checkpoint-controls.spec.mjs` covers Restart Mission confirmation and cancel,
pristine scenario reset without checkpoint changes, hiding exhausted or
unavailable entries, auto-expanding available categories, the collapsed and
locked empty-category heading with its focusable tooltip, and restoration of
the Sandbox catalog and heading state. Campaign checkpoint and record
isolation coverage is shared with the persistence specs.

Mission UI selectors include `#missionIntroDialog`, `#missionIntroOk`,
`#missionHud`, `#missionResourceList`, `#missionObjectiveProgress`, and
`#missionEventNotice`. Completion uses `#missionCompleteDialog`,
`#missionCompleteStats`, and `#missionCompleteOk`; the passed-objective bar
uses `#missionAdvance`, and briefing instructions use `#missionIntroGuidance`.
Editor drafts use localStorage key
`elemental-foundry.campaign-editor.drafts.v1`.

Run this functional area through the project wrapper:

```text
npm.cmd run test:browser -- e2e/campaign --workers=1 --trace=off
```

The final targeted combined selection passed **15 tests** across Campaign and
persistence on 28 September 2026, including `checkpoint-controls.spec.mjs`,
`mission-progression.spec.mjs`, and `mission.spec.mjs`. The exact command is
recorded in [`../../docs/E2E_TEST_PLAN.md`](../../docs/E2E_TEST_PLAN.md). The
deterministic `npm test` harness was not run and remains pending separate user
approval. Keep coverage and commands aligned with
[`../../docs/E2E_TEST_PLAN.md`](../../docs/E2E_TEST_PLAN.md).
