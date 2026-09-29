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
The editor spec also checks that Mission 2's climate-target values, typed
environment objective, and mission-level `controlLimits` persist in a draft.
The `#campaignEditorControlLimits` JSON field round-trips the mission slider
limits; the editor tests also cover a blank starting layout, objective
prerequisites, partial `targetValues` including Dewpoint, and objective control
and limit unlocks.

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

Mission 2 caps Air Temperature at 30 C on both the slider and numeric input;
values above the cap clamp to 30 C. Leaving Campaign restores Sandbox's normal
4,000 C maximum. Mission 3, **The Basin in Three States**, starts from a blank
world with Sand, Dry Mud, and Ash placement stages, then gates Steam, Humidity,
Dewpoint, rain, drying, and the Lava phase. Its Temperature limit is 150 C
until all three piles dry; completing the Ash-drying objective raises the cap
to 2,000 C.

`objective-carousel.spec.mjs` covers the single selected objective row and
1-based `N / total` counter, bounded previous/next buttons, completion status
without auto-advance, and locked items remaining in the count. It verifies
Mission 1's 1/1 boundaries, Mission 2's four-step navigation and selection
stability, Mission 3's 17-item sequence and locked Steam objective, and
selection reset after restart, reload/resume, and advance. Selection is
transient and resets to the first item for each new or resumed mission.

`checkpoint-controls.spec.mjs` covers Restart Mission confirmation and cancel,
pristine scenario reset without checkpoint changes, hiding exhausted or
unavailable entries, auto-expanding available categories, the collapsed and
locked empty-category heading with its focusable tooltip, and restoration of
the Sandbox catalog and heading state. Campaign checkpoint and record
isolation coverage is shared with the persistence specs.

Mission UI selectors include `#missionIntroDialog`, `#missionIntroOk`,
`#missionHud`, `#missionResourceList`, `#missionObjectiveCarousel`,
`#missionObjectivePrevious`, `#missionObjectiveNext`,
`#missionObjectivePosition`, `#missionObjectiveCurrent`,
`#missionObjectiveCheck`, and `#missionEventNotice`. Completion uses `#missionCompleteDialog`,
`#missionCompleteStats`, and `#missionCompleteOk`; the passed-objective bar
uses `#missionAdvance`, and briefing instructions use `#missionIntroGuidance`.
Editor drafts use localStorage key
`elemental-foundry.campaign-editor.drafts.v1`.

Run this functional area through the project wrapper:

```text
npm.cmd run test:browser -- e2e/campaign --workers=1 --trace=off
```

The focused Campaign browser area passed **21/21** tests on 29 September 2026;
the editor-only rerun passed **6/6**. The deterministic `npm.cmd test` run
completed with 408 passing checks and 24 failures in unrelated seed, electrical,
Fan, Dewpoint, and illumination checks; the Mission 2 cap, Mission 3 staged
progression, and physical Dry Mud-to-Lava checks passed. Earlier, the final
targeted combined selection passed **15 tests** across Campaign and persistence
on 28 September 2026, including `checkpoint-controls.spec.mjs`,
`mission-progression.spec.mjs`, and `mission.spec.mjs`. Exact commands and
results are recorded in
[`../../docs/E2E_TEST_PLAN.md`](../../docs/E2E_TEST_PLAN.md). Keep coverage and
commands aligned with that plan.
