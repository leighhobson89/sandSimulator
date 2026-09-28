# Campaign mission checkpoint and catalog availability plan

Date: 28 September 2026  
Status: Implemented; targeted browser verification passed  
Owner: Development handoff

## Goal

Make campaign Resume return to a clean start of the last checkpointed mission.
The campaign checkpoint stores only the mission number. Campaign runtime state,
world state, resource use, and objective progress are never saved. Do not run a
timed campaign autosave or allow a mid-mission Save/export. Restart the current
mission from its authored start without changing the saved checkpoint.

In the campaign material catalog, show only materials, machines, and tools that
the active mission currently makes available. Keep categories with available
items usable. Automatically collapse and lock categories with no available
items, while leaving a keyboard-focusable arrow tooltip that explains why the
category is unavailable. Preserve the existing Sandbox catalog and save flow.

## Campaign checkpoint contract

- Starting a new campaign creates no Campaign record and writes no checkpoint.
  Do not offer Resume for that run until its first ADVANCE checkpoint exists.
- The persisted campaign-specific data is exactly `{ missionNumber: N }`.
  Keep only the outer format/version and `mode: "campaign"` metadata required
  to recognize the save. Do not include `campaignId`, `missionId`, simulation
  arrays/world dimensions, selected tools, blueprints, objective counters,
  resource use, event IDs/notices, completion/recap state, or pending mission.
- Use the currently installed mission definition with matching `number` to
  reconstruct the run. Treat a missing or unknown number as an invalid campaign
  checkpoint; do not silently load it as a Sandbox world.
- The first checkpoint write occurs only when the player presses **ADVANCE**
  after a completed mission's recap has been dismissed and a successor exists.
  Write the successor's number at that click. Mission completion and recap
  dismissal do not write anything. Later **ADVANCE** actions replace the number
  with the next mission number. Pausing, drawing, changing climate, and
  restarting never write or change it. At the final mission, no successor
  exists: do not write. Leave the last checkpoint from the preceding ADVANCE
  untouched; if the campaign ends before any ADVANCE, no checkpoint is created.
- Keep the active Campaign record in the existing local save library and retain
  its record type and active-record ownership. Store no campaign simulation
  snapshot in that record. An older full-state Campaign save may be normalized
  once by resolving its known `missionId` to a mission number and discarding its
  world/progress fields; invalid legacy Campaign data must fail without
  replacing the live world. Sandbox v1/v2 migration and full-state saves remain
  unchanged.

## Resume, restart, and save controls

Resume reads the checkpoint's `missionNumber`, resolves the installed mission,
creates a fresh campaign runtime, and builds that mission's authored scenario.
For every Resume, start with the configured world size and starting layout,
opening climate, full material/machine budgets, zero objective progress, and no
fired campaign events. This applies even when the previous session had already
completed the mission or dismissed its recap but had not advanced.

Add a **Restart Mission** action at `#restartMissionButton`. It opens
`#missionRestartDialog`, where `#confirmRestartMission` confirms and
`#cancelRestartMission` cancels. Confirming rebuilds the current mission from
its authored data and resets its resources, objectives, events, and completion
UI. It must not alter or rewrite the stored `missionNumber`; Resume after
Restart must start that same mission pristine.

While a Campaign mission is active, stop and guard the timed Autosave path.
Do not expose usable Save/export controls or allow the Save dialog, portable
serialization, save-library writes, or background timers to capture the
in-progress Campaign. The only Campaign writes are mission-number checkpoints
on **ADVANCE** after a mission recap. Keep regular Sandbox autosave,
Save/export, import/load, and library behavior intact.

## Mission catalog filtering

Recompute the visible catalog from the active mission's remaining material and
machine budgets and unlocked tools. Hide unavailable palette entries from the
expanded category grid rather than leaving disabled item buttons behind. A
resource reaching zero hides its item. Restart restores the authored budgets
and makes the mission's available entries visible again.

On Campaign entry, automatically expand every category with an available item.
If no entries are available, collapse its grid, prevent expansion, and mark the
heading as locked. Recompute category availability as resources change;
restarting restores budgets and expands the categories that have available
items. Keep the heading
visible so the catalog structure remains understandable. Its arrow must remain
keyboard focusable and open an accessible tooltip such as “No items available
in this mission.” Do not put a focusable tooltip trigger inside a button; retain
valid button semantics for the category toggle. Suggested test hooks are
`[data-campaign-category-locked="true"]` for the locked heading and
`[data-campaign-category-arrow]` for the focusable arrow trigger.

When campaign mode ends, restore the full catalog, ordinary heading interaction,
and the Sandbox heading state captured before Campaign entry. Do not filter
materials from the catalog definitions or change painting, simulation, or
Sandbox rules to achieve the visual filter.

## Regression coverage and verification

Focused browser coverage was added in the following files:

- `e2e/campaign/checkpoint-controls.spec.mjs` checks Restart Mission through
  `#restartMissionButton`, `#missionRestartDialog`,
  `#confirmRestartMission`, and `#cancelRestartMission`; pristine mission reset
  without checkpoint changes; campaign catalog filtering; unavailable Water
  hidden from the expanded category; the collapsed/locked empty-category state
  and focusable arrow tooltip; and Sandbox catalog and save behavior.
- `e2e/campaign/mission.spec.mjs` checks that mission supplies disappear from
  the catalog when exhausted, alongside mission configuration, authored world,
  and objective/event behavior.
- `e2e/persistence/campaign-checkpoints.spec.mjs` checks that no Campaign
  checkpoint is created at campaign start or Mission 1 completion/dismissal,
  that the first **ADVANCE** writes a checkpoint containing only
  `missionNumber: 2`, that campaign Save/export is disabled, that Resume builds
  a pristine scenario for the checkpointed mission without changing its
  `saveString` or `updatedAt`, and that a legacy version-3 full-state Campaign
  autosave migrates to a mission-number-only checkpoint.
- `e2e/campaign/mission-progression.spec.mjs` updates assertions so unavailable
  Water is hidden rather than shown disabled and climate state is reconstructed
  from the mission-number checkpoint on Resume.
- `e2e/persistence/multi-save-registry.spec.mjs` checks Campaign checkpoint
  record ownership and isolation, including that starting a fresh Campaign
  preserves an existing Campaign record and creates no new record before its
  own first ADVANCE.

Implementation keeps checkpoint writes on successor **ADVANCE** only,
reconstructs pristine missions on Resume and Restart, and filters the
Campaign catalog while restoring the prior Sandbox catalog state on exit.
Campaign autosave, Save, Save to Library, and export are unavailable. Legacy
full-state Campaign records normalize to a mission-number checkpoint.

The final targeted combined Campaign and persistence selection passed **15/15
tests in 1.4 minutes** on 28 September 2026:

```text
npm.cmd run test:browser -- e2e/campaign/checkpoint-controls.spec.mjs e2e/campaign/mission-progression.spec.mjs e2e/campaign/mission.spec.mjs e2e/persistence/campaign-checkpoints.spec.mjs e2e/persistence/multi-save-registry.spec.mjs --workers=1 --trace=off
```

Two focused Sandbox persistence regressions also passed **1/1** each:

```text
npm.cmd run test:browser -- e2e/persistence/autosave-resume.spec.mjs --grep "clear cancel and confirm" --workers=1 --trace=off
npm.cmd run test:browser -- e2e/persistence/export-import.spec.mjs --grep "Save and Load round-trip" --workers=1 --trace=off
```

The initial broad Campaign-plus-persistence run was exploratory and found
stale expectations; those were corrected before the targeted final runs. The
exploratory run is not reported as passing. The full Campaign and persistence
areas were not rerun, and the deterministic `npm test` harness was not run.
Full-suite execution remains subject to separate user approval.
