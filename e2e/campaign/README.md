# Campaign E2E Coverage

Mission 1, **The First Daffodil**, starts with a full-width Sand floor and
player supplies of 100 Dry Mud, 1,000 Water, and five Daffodil Seeds for
retries. Its fixed
ideal climate is 14 °C, 68% humidity, 65% illumination, 10 °C dewpoint, and no
wind. Its objective counts one Daffodil Seeds-to-Daffodil plant after it uses
half its initial growth budget, then fires the configured event once.

`mission.spec.mjs` verifies the mission definition, Sand-only starting habitat,
climate, budgets and locks, placement from supplies, and one successful growth
objective/event idempotence. `editor.spec.mjs` verifies main-menu entry to an unrestricted
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
and limit unlocks. It also checks that the built-in Mission 1 five-seed budget
passes validation, a new blank draft suggests Mission 7, and its fixture uses
unused Mission number 88.

`mission-progression.spec.mjs` verifies Mission 1's automatic completion recap
and used/total/remaining resource counts, **OK** dismissal, the transient
bottom-right notification, and floating **ADVANCE** into the Mission 2
briefing and Ice scenario. `mission.spec.mjs` checks the shared toast's
five-second duration and updated position 50 px higher than its prior baseline,
confirms the replaced full-width passed bar is hidden, and verifies that
the top-right `#missionAdvance` remains enabled after the toast fades. The
specs check the Mission 2 climate target, starting world and budgets,
campaign-only disabled-control marker, reduced opacity and bold red
`DISABLED` tooltip, usable system-action exceptions, Sandbox isolation, and
pristine reconstruction of checkpointed missions on Resume. The briefing guides
the player to the Temperature, Humidity, and Ambient Light sliders, explains
that 30°C and 95% match Banana's ideals, and labels 85% illumination as the
mission target. Mission 2 supplies five Banana Seeds for retries while its
objective still requires one successful plant growth.

Mission 2 caps Air Temperature at 30 C on both the slider and numeric input;
values above the cap clamp to 30 C. Leaving Campaign restores Sandbox's normal
4,000 C maximum. Mission 3, **The Basin in Three States**, starts from a blank
world with Sand, Dry Mud, and Ash placement stages, then unlocks a finite
8,000-Cloud budget after all three piles. Placing 500 Cloud unlocks Humidity
and Dewpoint; 95% Humidity / 20 C Dewpoint gates rain, drying, and the Lava phase.
Each wet and dry milestone is 150 transitions, and Sand, Mud, and Ash can dry
in any order. Completing the Ash-drying objective raises the cap to 350 C for
the Sand-to-Glass stage; forming 200 Glass then raises it to 2,000 C for Lava,
where 150 Glass, 150 Dry Mud, and 150 Ash cells must melt.

`missions-four-to-six.spec.mjs` covers the Mission 4–6 definitions, layouts,
budgets, and objective outcomes, including Mission 4's five Red Tulip Seeds,
150 Snow-to-Water target, 100 Dry-Mud-to-Wet-Mud target, Dry Mud planting bed,
climate cap, and absence of a Water supply. Mission 4 also verifies that its
world starts at the authored −10 C temperature. The test parses and restores
Mission 5's captured 260×150 save with the 150-cell Wet Sand row at
x=55..204,y=145 above Sand rows y=146..149, checks 95% local and Base Humidity,
and protects the 75 Cloud-to-Snow, 60 Snow-to-Water, and 50 Sand-to-Wet-Sand
targets. Mission 5 has no preplaced Cloud or player Cloud supply: the open-air
weather system must naturally form Cloud and precipitate Snow after cooldown
at −10 C and 20 C Dewpoint. At 8 C, its open-air profile is above freezing.
Mission 6 restores a two-leg Wood bridge with a five-cell-thick overhead span and open space
beneath it. Fire starts against the exposed top of the span; there is no
preplaced Fire or Water, and the Fire budget is 10. After 60 active simulation
steps Water unlocks without a finite supply limit, and the largest Brush is
selected for pouring Water over the structure. The spec checks that paused
frames do not advance the timer, natural Fire expiry does not count as a Water
quench, one direct Water-caused Fire-to-Smoke conversion does count, and the
mission completes only with some Wood remaining and no active Fire.
The spec verifies the campaign intro remains visible when selecting a mission,
parses the unrestricted 260×150 Sandbox `startingSave` snapshots for Missions
5 and 6, and restores them through the UI path. The checks cover M5's local and
base Humidity values, authored Wet Sand row, and objective gating, plus M6's
bridge shape, Fire budget and availability, 59/60-step timing with paused
frames, unlimited-Water and max-Brush selection, quench cause, and final
world-state requirements. This also protects decoding of encoded `startingSave`
arrays before physics restore while preserving the active Campaign state.

`tools/simTest.mjs --focus=campaign-germination` checks Missions 1, 2, and 4:
each seed-growth objective completes once its plant has used half its initial
growth budget. Mission 1 and Mission 2 have five seed attempts in their
loadouts; each objective counts one successful plant.

The snapshot-restore subset passed **3/3** on 30 September 2026:

```text
npm.cmd run test:browser -- e2e/campaign/missions-four-to-six.spec.mjs --workers=1 --trace=off
```

No full suite was run for that earlier snapshot restore check. The later
Mission 6 timed-burn extension passed **7 tests** in 23.1 seconds using the
same focused spec command:

```text
npm.cmd run test:browser -- e2e/campaign/missions-four-to-six.spec.mjs --workers=1 --trace=off
```

`objective-carousel.spec.mjs` covers the single selected objective row and
1-based `N / total` counter, bounded previous/next buttons, completion status
without auto-advance, and locked items remaining in the count. It verifies
Mission 1's 1/1 boundaries, Mission 2's four-step navigation and selection
stability, Mission 3's 18-item sequence and locked Cloud objective with the
stable `place-steam` ID, and
selection reset after restart, reload/resume, and advance. Selection is
transient and resets to the first item for each new or resumed mission.
At desktop and narrow viewport widths, it also checks the single-row layout,
left-side counter, centered objective copy, and bounded overflow.

The shared tooltip regressions in `e2e/materials/catalog.spec.mjs`,
`mission-progression.spec.mjs`, and `checkpoint-controls.spec.mjs` verify that
catalog, tool, and disabled-category tooltips hide after pointer exit; explicit
`[hidden]` styling overrides the disabled-tooltip display rule. The
machine-owned hover tooltip remains visible through the separate machine-hover
path.

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
`#missionObjectiveCheck`, and the floating `#missionToast`. Completion uses
`#missionCompleteDialog`, `#missionCompleteStats`, and `#missionCompleteOk`;
the top-right canvas action is `#missionAdvance` inside
`#missionAdvanceFloat`. Debug mission selection uses `#debugMissionSelect`, and
briefing instructions use `#missionIntroGuidance`.
Editor drafts use localStorage key
`elemental-foundry.campaign-editor.drafts.v1`.

Run this functional area through the project wrapper:

```text
npm.cmd run test:browser -- e2e/campaign --workers=1 --trace=off
```

The focused Campaign browser area previously passed **21/21** tests on 29 September 2026;
the editor-only rerun passed **6/6**. The latest full browser run completed
**297/299**; the two failed cases were subsequently corrected and each passed
its focused rerun, but the full browser suite was not rerun. The recorded full
browser result is therefore still 297/299. The deterministic simulator
completed **436/436**, including the 67/67 air-circulation focus. An earlier
targeted combined selection passed **15 tests** across Campaign and persistence
on 28 September 2026, including `checkpoint-controls.spec.mjs`,
`mission-progression.spec.mjs`, and `mission.spec.mjs`. Exact commands and
results are recorded in
[`../../docs/E2E_TEST_PLAN.md`](../../docs/E2E_TEST_PLAN.md). Keep coverage and
commands aligned with that plan.

Latest focused particle-loss/headroom verification passed on 30 September
2026: the Campaign browser area passed 26 tests, the germination simulation
focus passed 9 tests, and the Materials catalog spec passed 15 tests. The
shared `showMissionToast` behavior applies to campaign objective, save/load,
autosave, checkpoint, and other notifications. No full suite was run.

```text
npm.cmd run test:browser -- e2e/campaign --workers=1 --trace=off
npm.cmd test -- --focus=campaign-germination
npm.cmd run test:browser -- e2e/materials/catalog.spec.mjs --workers=1 --trace=off
```

The later focused Cloud weather correction also passed on 30 September 2026:
`mission-three-staged-progression.spec.mjs` **2 passed**,
`objective-carousel.spec.mjs` **5 passed**,
`missions-four-to-six.spec.mjs` **3 passed**, and `dewpoint-climate` **5
passed**. Coverage verifies M3's legacy Steam-budget migration and finite Cloud
stage, M5's natural snowfall after full cooldown with no Water, and its 8 C
above-freezing profile. Mission 8's Water-to-Steam quench remains a separate
non-weather byproduct. No full suite was run.

```text
npm.cmd run test:browser -- e2e/campaign/mission-three-staged-progression.spec.mjs --workers=1 --trace=off
npm.cmd run test:browser -- e2e/campaign/objective-carousel.spec.mjs --workers=1 --trace=off
npm.cmd run test:browser -- e2e/campaign/missions-four-to-six.spec.mjs --workers=1 --trace=off
npm.cmd test -- --focus=dewpoint-climate
```
