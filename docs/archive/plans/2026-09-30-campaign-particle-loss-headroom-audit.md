# Implementation Plan: Campaign Particle Loss and Headroom Audit

## Goal and scope

Review campaign material supplies and transformation targets where particles may be consumed, transformed, or lost before a mission objective is satisfied. Apply the reviewed target set to implemented Missions 1–6 in `campaign.js`, preserving objectives and progression except where targets below explicitly change. Update the Mission 7–15 outline in `docs/CAMPAIGN_MISSIONS.md`; those missions remain outline-only and must not be added to `MISSION_DEFINITIONS` in this task.

Keep the changes limited to mission data, captured scenario data where specified, the corresponding campaign documentation, the editor compatibility fix below, and the explicitly scoped UI/progression fixes. Do not change general resource accounting or plant growth semantics. The only permitted physics-side exception is a narrow pending/completion callback correction if the deterministic Mission 4 maturity regression proves that objective completion is not reported. Any other implementation defect found during the audit needs a separate scoped plan.

## Scoped UI and objective fixes

- **Mission 4 Red Tulip objective:** The Red Tulip grows visibly, but the `grow-tulip` objective does not count full plant growth. Mechanics documentation defines the goal as mature plant growth. Preserve the seed→plant mapping and growth semantics; use the deterministic germination regression to take an actual Red Tulip through maturity. Only if that spec proves the completion callback is not reported may a narrow physics pending/completion callback correction be made.
- **Disabled material/tool tooltip:** Hide the disabled-entry tooltip when the pointer leaves its material or tool trigger. The existing `.tool-tooltip:has(.tool-tooltip-disabled)` rule overrides the browser's default hidden display; add an explicit `.tool-tooltip[hidden] { display: none; }` rule with sufficient specificity/order. Preserve keyboard focus behavior and do not hide a machine-owned tooltip through the control-tooltip cleanup path.
- **Shared toast:** `showMissionToast` is used for campaign objective/completion notices, save/load notices, autosave notices, checkpoint notices, and other messages. Apply the timing and position change to every message rendered through this shared toast: halve its current 10,000 ms display duration to 5,000 ms and move it upward by 50 px by adjusting the bottom offset. Preserve the safe-area inset and responsive layout.

## Campaign Editor compatibility

- `campaignEditor.js` currently hard-codes Mission 1's Daffodil Seeds budget as 1 in its built-in-mission validation, so the approved budget of 5 makes the official Mission 1 definition fail editor validation. Update the invariant and its error text to accept the canonical 5-seed budget while preserving Mission 1's other budget, climate, and objective requirements.
- The campaign now has Missions 1–6, so the next blank editor draft must suggest Mission 7. Update `e2e/campaign/editor.spec.mjs` assertions that assume the blank number is 4, and change its custom fixture draft number from 4 to unused number 88 so it does not collide with Mission 4.

## Documentation follow-through

At the final documentation stage, update living docs to reflect the five-seed retry budgets and current objective counts. In particular, remove stale “one Daffodil Seed” or “one Banana Seed” supply statements from [GAME_MECHANICS.md](../GAME_MECHANICS.md), [PROGRAM_OVERVIEW.md](../PROGRAM_OVERVIEW.md), [E2E_TEST_PLAN.md](../E2E_TEST_PLAN.md), and the [Campaign E2E README](../../e2e/campaign/README.md); update Mission 1's “lone Daffodil seed” wording and equipment count in [CAMPAIGN_MISSIONS.md](../CAMPAIGN_MISSIONS.md). Preserve objective semantics that one successful plant growth completes the goal. Update Mission 5's docs to match its 150-cell authored source and the 75 Steam→Snow / 60 Snow→Water targets.

## Existing working-tree fixes to preserve

- **Mission 3:** Retain the current 150-cell wetting, drying, and Lava-stage targets and the current any-order drying progression. Keep its existing material budgets unchanged; this audit does not reduce its headroom.
- **Mission 4:** Retain the current Dry Mud starting floor, immediate −10 °C initialization when entering from a hotter mission, and exclusion of Sand, Water, Steam, Cloud, and Wet Mud from the starting world/loadout. Use meltwater to wet the Dry Mud into Wet Mud.
- **Mission 5:** Retain the unrestricted captured 260×150 Sandbox snapshot, four-row Sand floor, 95% local and Base Humidity, and snapshot-based restore. Update the authored Wet Sand source from 100 to 150 cells and keep its coordinates and encoded state aligned with that new count.

## Implemented Missions 1–6

Update generated definitions within the existing mission-data markers. Preserve mission IDs, objective order, labels, gates, unlocks, and environment settings unless the approved target set requires a change. Seed budgets are supplies for retries; keep growth objectives at their existing successful-growth targets.

| Mission | Approved supply and objective targets |
| --- | --- |
| 1 — The First Daffodil | Raise Daffodil Seeds budget from 1 to 5. Keep the one-Daffodil growth objective. |
| 2 — The Icebound Grove | Raise Banana Seeds budget from 1 to 5. Keep the one-Banana-Plant growth objective. |
| 3 — The Basin in Three States | No target or budget changes. Preserve 5,000 each of Sand, Dry Mud, and Ash; 8,000 Steam; the existing 150-cell wet/dry targets; the current any-order drying gates; and the 150-cell Lava-stage targets. |
| 4 — The Meltwater Garden | Set Snow→Water to 150 and Dry Mud→Wet Mud to 100. Raise Red Tulip Seeds budget from 1 to 5; keep the successful-growth target at one Red Tulip. Preserve the Dry Mud floor and no-Water-supply setup. |
| 5 — Moisture in Motion | Author 150 exposed Wet Sand cells in the captured snapshot. Keep Wet Sand→Sand at 100; set Steam→Snow to 75, Snow→Water to 60, and Sand→Wet Sand to 50. Keep all other objective stages, order, and environment values unchanged. |
| 6 — A Controlled Burn | No changes to supplies, scenario, objective targets, or progression. |

For Mission 5, update the captured save itself rather than representing its custom terrain with a declarative layout. Expand the exposed Wet Sand row at y=145 from x=80..179 to the centered x=55..204 span (150 cells) above the Sand catch bed. Preserve 95% local/Base Humidity, and ensure the save remains unrestricted Sandbox data with no campaign state. Confirm the authored source count is exactly 150 after decoding and restore.

## Outline-only Missions 7–15

Update only the corresponding mission sections and resource/objective counts in `docs/CAMPAIGN_MISSIONS.md`. Do not implement these outline missions in `campaign.js`.

| Mission | Approved changes |
| --- | --- |
| 7 — The Warmth Bridge | Increase preplaced source Lava to 40 and Ice→Water thaw target to 10. Set Iron supply budget to 65 and Insulation supply budget to 120. Keep the bridge layout and staged construction objectives otherwise intact. |
| 8 — Quench the Flow | No changes. |
| 9 — The Deep Kiln | Set Wet Mud→Clay compaction target to 25 and Clay→Ceramic target to 20. |
| 10 — The Rusted Bath | Increase preplaced Iron and Stainless Steel rows to 16 cells each; keep Iron→Corrosion target at 12. Set Water budget to 65 while retaining the 50-Water placement objective. |
| 11 — The Glass Etcher | Increase Acid budget to 80 while retaining the 60-Acid placement objective and all transformation targets. |
| 12 — The Stone Garden | Set Water budget to 40 with the 30-Water placement objective. Set Moss Spores budget to 5 with the 3-Spore placement objective. |
| 13 — The Flooded Reach | Set Water Grass / Lily Seeds budget to 5 with the 4-seed placement objective. |
| 14 — A Lamp for the Ledge | Set Elec budget to 2 with the 1-cell placement objective. Set Moss Spores budget to 5 with the 4-spore placement objective. Keep other targets unchanged. |
| 15 — Conditions for Light | Set Elec budget to 4 with the 2-cell placement objective. Set Moss Spores budget to 5 with the 4-spore placement objective. |

## Verification plan

Focused verification uses the test engineer's current regressions:

- `e2e/campaign/mission.spec.mjs`: assert the Mission 1 five-seed budget and the shared toast's 5,000 ms lifetime, position 50 px above its previous baseline, and safe-area-aware placement. Since save/load, autosave, campaign, and other notices all call `showMissionToast`, the shared implementation applies the behavior to all of them.
- `e2e/campaign/editor.spec.mjs`: assert the built-in Mission 1 with five Daffodil Seeds passes the editor's fixed campaign validation, a new blank draft suggests Mission 7, and the test fixture uses unused draft number 88.
- `e2e/campaign/mission-progression.spec.mjs`: assert Mission 2's five Banana Seeds budget and verify a disabled tool tooltip becomes visually hidden after pointer exit.
- `e2e/campaign/checkpoint-controls.spec.mjs`: assert the checkpointed Mission 2 seed budget and verify a disabled material-category tooltip hides after pointer exit.
- `e2e/materials/catalog.spec.mjs`: use its existing pointer-leave coverage to verify material/tool tooltips hide after exit while machine-owned tooltip behavior remains intact.
- `e2e/campaign/missions-four-to-six.spec.mjs`: assert Missions 4–6 budgets, objective targets, Mission 4 climate initialization, and Mission 5 decoded/restored 150-cell Wet Sand snapshot.
- `tools/simTest.mjs --focus=campaign-germination`: deterministically grow an actual Mission 4 Red Tulip through its mature/growth-completion stage and verify `grow-tulip` progress/completion there, not merely when the seed first maps to a plant. Preserve the seed-to-plant mapping and growth behavior; only add a narrow pending/completion callback fix if this deterministic regression proves the completion is not reported.

Run the focused Campaign and Materials browser areas and deterministic germination focus through their npm wrappers:

```text
npm.cmd run test:browser -- e2e/campaign --workers=1 --trace=off
npm.cmd run test:browser -- e2e/materials/catalog.spec.mjs --workers=1 --trace=off
npm.cmd test -- --focus=campaign-germination
```

Cover outline-only Mission 7–15 counts with documentation review rather than runtime tests. The implementation-stage focused verification is complete; no full suite was run.

## Completed verification results (30 September 2026)

- `npm.cmd run test:browser -- e2e/campaign --workers=1 --trace=off` — **26 passed**.
- `npm.cmd test -- --focus=campaign-germination` — **9 passed**, including the Mission 4 Red Tulip maturity objective.
- `npm.cmd run test:browser -- e2e/materials/catalog.spec.mjs --workers=1 --trace=off` — **15 passed**.

The focused Campaign coverage includes the five-seed budgets with one-growth objectives, Mission 4–6 targets and captured snapshot restore, Mission 5 humidity and 150-cell Wet Sand row, M6's 1,000-ignition Water unlock, shared toast timing/placement, the editor's five-seed invariant and Mission 7 blank-draft number, and disabled tooltip hide behavior. The materials spec preserves machine-owned tooltip behavior. No full suite was run.
