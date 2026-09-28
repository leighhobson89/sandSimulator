# Campaign Editor and First Daffodil Mission Plan

Date: 28 September 2026  
Status: Executed; implementation and review complete; Campaign E2E passed 6/6; deterministic `npm test` pending separate approval  
Owner: Development handoff

## Goal

Add a Campaign Editor entry as a yellow button directly in the main menu. It
opens an editor workspace with a live unrestricted canvas and a side editor
panel, so the developer can paint and place in the scenario while editing its
mission data. The editor captures the current world as a compressed initial
mission snapshot, keeps local drafts, validates and reviews the candidate,
then installs it into `campaign.js` through a guarded file-picker workflow.

Use the editor to author Mission 1, **The First Daffodil**. Keep the installed
mission definitions data-driven so later missions can use the same editor,
validation, event, save, and runtime paths.

## Mission 1 definition

The default mission draft has:

- Mission number `1`, title **The First Daffodil**, a required player-facing
  briefing, and a stable mission ID.
- A 260×150 starting world with a Sand bed spanning the full width and no
  pre-placed Dry Mud or Daffodil Seed. Built-in Mission 1 may describe the floor
  with a declarative full-width Sand layout. Missions authored in the editor
  capture their live scene in a compressed `startingSave`.
- Player-placement budgets of 1,000 Water, 100 Dry Mud, and one Daffodil Seed;
  no Sprinkler budget. The captured initial scene contains the Sand bed. These
  three counted materials are available for placement during the mission.
- Initial selection of Water and Brush. The Brush is the campaign drawing mode;
  material limits enforce the three finite budgets. Visualization modes remain
  available so players can inspect the world without changing the climate.
- A fixed Daffodil ideal environment: air temperature `14 C`, base humidity
  `68%`, ambient illumination `65%`, Dewpoint `10 C`, ambient wind off, General
  Wind `0`, and Gust Strength `0`. Temperature, humidity, illumination,
  Dewpoint, and wind controls are locked during play, with an accessible lock
  indication. Mission entry reapplies the profile even when the captured editor
  snapshot contains different environment values.
- Objective **Grow one Daffodil from seed**. Count one actual
  `Daffodil Seeds → Daffodil` germination transition. Do not count manually
  painted or stamped Daffodil cells. Completion fires its configured trigger
  once and persists progress and fired event IDs.

The climate values come from the existing Daffodil ideal data in
`particles.json`: 14 C plant ideal temperature, 68% plant ideal humidity, and
65% Daffodil illumination ideal. Dewpoint and zero wind are fixed mission
weather settings. Keep these fields editable for later scenarios while the
player-facing mission controls remain locked.

## Editor access and behavior

Place a yellow **Campaign Editor** button in the main menu, identified by
`#openCampaignEditor`. Clicking it starts an unrestricted Sandbox authoring
session and shows `#campaignEditorWorkspace`: a docked side panel beside the
visible, drawable simulation canvas. Do not open a blocking modal for the main
editor. Normal materials, machines, tools, visualizations, and climate controls
work without mission budgets or campaign locks. Leaving the editor does not
turn that session into a campaign. Draft data stays in the editor's separate
local draft store.

The editor has a mission list and an edit form for:

- mission ID, number, title, briefing, and authored dimensions;
- Water, Dry Mud, Daffodil Seed, and any future material or machine budgets;
- environmental profile values and which player controls are locked;
- initial selected material, drawing mode, and available visualization modes;
- objective IDs, labels, conditions, targets, and completion events/triggers;
- the captured compressed initial world snapshot.

`#campaignMissionList` selects installed missions and local drafts.
`#campaignEditorNewBlank` creates a blank draft;
`#campaignEditorLoadMission` loads the selected mission into an editable draft;
`#campaignEditorSaveDraft` saves the current draft. Draft changes also autosave
to localStorage key `elemental-foundry.campaign-editor.drafts.v1`, separate
from the active game, named save library, and regular autosave. When starting a
new mission, suggest the lowest positive mission number not already assigned.
Keep mission ID and number unique. A collision requires a replacement
confirmation naming the existing mission; show `#campaignEditorConfirmReplace`
and `#campaignEditorCancelReplace` only when there is a collision.

### Scenario capture

Developers construct the scenario by painting and placing materials in the
live canvas beside the side panel. `#campaignEditorCaptureScenario` creates a
compressed portable save snapshot using the existing save serializer. This is
a simulation snapshot of the graphical world (typed particle and environment
state), not a screenshot or image asset. Store the compressed string as the
mission's `startingSave` field. The built-in Mission 1 can instead use a
declarative full-width Sand floor layout.

The captured snapshot is a Sandbox editor snapshot. Loading a draft with a
`startingSave` resizes and clears the canvas to the captured dimensions before
restoring its saved simulation and editor selection. On mission start, restore
its world state, then apply the mission's climate profile, mode, budgets,
selected Water/Brush state, and visualization access. Do not carry the editor's
unrestricted session, autosave identity, or campaign state into the mission.
Changing dimensions clears the world and invalidates its previous capture.
Capture again after drawing, clearing, or resuming simulation; show the
last-captured time and a stale marker when the editor world changes after
capture.

### Draft persistence

Autosave editor drafts locally after changes and scenario capture under the
separate versioned key `elemental-foundry.campaign-editor.drafts.v1`. Keep
drafts independent from the active game, named save library, and regular
autosave. The editor suspends periodic autosave writes and disables save,
import, export, and autosave controls while open, preserving the current resume
record. Closing the editor restores the prior autosave timer without an
immediate write; explicitly enabling autosave after the editor session releases
the write guard. Reloading the page restores the editor draft list and captured
snapshots. Handle malformed draft data and unavailable/quota-limited storage
without mutating installed mission data; show an accessible save-status error
while leaving the editor usable.

## Validation and review contract

Provide a validation step before install. It should reject a mission unless:

- ID, title, briefing, number, and required mission data are present; IDs and
  numbers do not conflict with another mission unless replacement is confirmed.
- The initial world is either a supported declarative layout or a valid
  compressed `startingSave` from an unrestricted Sandbox authoring session.
  Captured saves parse and have permitted dimensions. For Mission 1, every
  world column has Sand in the configured floor band. The starting floor is
  validated; Dry Mud and seed cells are not required in the initial world
  because their counts are player supplies.
- Budget amounts and objective targets are finite non-negative integers;
  Mission 1 has exactly the declared 1,000 Water, 100 Dry Mud, and one-seed
  allowances, and no Sprinkler allotment.
- The objective references known materials and a supported transition;
  Mission 1's objective listens for the actual Daffodil Seeds-to-Daffodil
  transition with target one.
- Trigger IDs are unique, trigger conditions refer to defined objective IDs,
  climate values are within existing control bounds, and locked controls are
  consistent with the mission environment.
- The player start selection names Water and Brush, and visualization modes are
  valid and enabled.

Use a declarative, typed trigger format. Support the mission requirements with
conditions such as `material-transition` and `objective-complete`; do not store
or execute arbitrary JavaScript from a mission draft. Render all user text with
`textContent`. Present validation errors in the side panel and keep Validate,
Review, and Install unavailable until the draft passes. Review is mandatory
before Install. `#campaignEditorReviewDialog` shows the mission summary,
starting resource limits, environment locks, objective/trigger description,
snapshot freshness, and the generated mission data. `#campaignEditorApproveReview`
records approval of that draft revision. Any later edit invalidates approval
and requires validation and review again.

## Marker-bounded file installation

Keep generated mission definitions inside exactly one pair of markers in
`campaign.js`:

```js
// BEGIN GENERATED MISSION DATA
// ...serialized mission definitions...
// END GENERATED MISSION DATA
```

Review the draft before Install. Only after the developer approves the review
does `#campaignEditorInstall` call `window.showOpenFilePicker` to select
`campaign.js`. Use one picker for the install flow; do not request another
picker to save the backup. Do not fall back to an unrestricted text export or
silently choose a different file. Require the selected name to be `campaign.js`
and verify exactly one correctly ordered marker pair. If the picker API is
unavailable, permission is denied, the marker pair is missing/duplicated, or
the source is unreadable, report the failure and leave the file unchanged.

Build the candidate by preserving the exact source prefix through the begin
marker and suffix from the end marker onward, replacing only the interior
generated mission-data block. Check the selected source for mission ID and
number conflicts. If there is a conflict, show `#campaignEditorConfirmReplace`
/ `#campaignEditorCancelReplace` and identify the mission being replaced. Do
not show this confirmation when there is no conflict: the approved review plus
Install authorizes adding the new mission. Before any source write, store the
original source text and metadata `{ fileName, originalSource, createdAt,
sourceHash }` in the recoverable localStorage key
`elemental-foundry.campaign-editor-source-backup.v1`; read it back to verify
that it is available.

Re-read the selected source before writing and abort if it changed since review.
Only after the recoverable backup is stored and the source is unchanged may
`createWritable()` write the candidate. Re-read the result and verify both
out-of-marker regions are unchanged and the generated mission block validates.
Keep the backup until a later verified backup replaces it. Provide a way to
download the stored source backup and a recovery path that reselects
`campaign.js`, then explicitly confirms restoring the saved source. Report the
backup status and installed filename. Ask to reload the app so the browser
module loads the installed mission definitions.

If localStorage cannot retain the source backup, abort without replacing
`campaign.js`. Cancel at the file picker, review, or conflict confirmation
leaves the source untouched. Write failures preserve both the draft and stored
backup for recovery/retry.

## Editor UI/API contracts

The yellow main-menu **Campaign Editor** action opens an authoring workspace,
not a blocking editor modal. Keep the canvas live and drawable while the side
panel is open. Use these stable selectors for focused browser coverage:

- `#openCampaignEditor` is the main-menu entry; it opens
  `#campaignEditorWorkspace`.
- `#campaignMissionList` chooses an installed mission or local draft.
- `#campaignEditorNewBlank`, `#campaignEditorLoadMission`, and
  `#campaignEditorSaveDraft` create, load, and persist a local draft.
- `#campaignEditorNumber`, `#campaignEditorTitle`,
  `#campaignEditorBriefing`, and `#campaignEditorStatus` expose mission metadata
  and live status.
- Objective inputs expose `From`, `To`, `Target`, and `Label`, with stable IDs
  `#campaignObjectiveFrom`, `#campaignObjectiveTo`,
  `#campaignObjectiveTarget`, and `#campaignObjectiveLabel`. The event message
  uses `#campaignEventMessage`.
- `#campaignEditorCaptureScenario` captures the live scene;
  `#campaignEditorValidate` validates the draft;
  `#campaignEditorReviewDialog` presents the required review;
  `#campaignEditorApproveReview` approves the current revision;
  `#campaignEditorInstall` runs the single `campaign.js` picker/install flow.
- `#campaignEditorConfirmReplace` and `#campaignEditorCancelReplace` appear
  only when the selected mission ID or number conflicts with an installed
  mission. Keep a status/backup recovery affordance in the workspace.
Keep the existing `campaign.js` runtime API stable. Add pure helpers for
mission validation, draft serialization, and marker-bounded candidate
generation as needed. The helpers should be testable without DOM or file picker;
only the explicit install flow can write to the selected file.

## Implementation and verification results

- `e2e/campaign/mission.spec.mjs` covers Mission 1's definition, Sand-only
  initial habitat, climate profile, player budgets and locks, placement from
  supplies, and objective/event progress firing once.
- `e2e/campaign/editor.spec.mjs` covers unrestricted main-menu editor entry,
  300×170 canvas resizing, blank/edit/load/draft and captured-save restoration,
  validation and mandatory review, autosave suspension, marker-bounded
  installation, replacement cancel/confirm, and localStorage source-backup
  metadata. Canvas edits, clearing, or resuming simulation invalidate the
  captured snapshot until it is recaptured.
- `tools/simTest.mjs` adds a deterministic regression for actual
  Daffodil Seeds-to-Daffodil germination under Mission 1 climate and
  one-time objective/event progress.

The focused Campaign browser area passed **6/6 tests** after implementation
and review, using the documented npm wrapper:

```sh
npm run test:browser -- e2e/campaign --workers=1 --trace=off
```

The deterministic simulation regression is part of the complete harness;
there is no `simTest` focus option. Its documented command is:

```sh
npm test
```

`npm test` runs the full deterministic simulation harness and remains pending
separate user approval. No full deterministic or full browser suite result is
claimed for this handoff.

## Decisions captured from the user

- Select `campaign.js` using `window.showOpenFilePicker`.
- Suggest the next unused mission number for a new draft.
- Require explicit confirmation when the draft duplicates an installed mission
  ID or number; don't add a redundant replacement confirmation for a new
  mission after the mandatory review.
- Back up the selected source in recoverable localStorage before writing. Use
  only the selected-source picker; don't open a second picker to save a backup.
- Preserve all source outside the generated marker block.
