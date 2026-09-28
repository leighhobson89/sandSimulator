# Campaign, Main Menu, and Multi-Save Framework Plan

Date: 28 September 2026  
Status: Executed, reviewed, and verified; archived  
Owner: Development handoff

## Goal

Add a story-campaign entry point and a reusable mission framework while preserving the current sandbox simulation and freeform startup. Campaign missions provide authored starting worlds, finite player-placement resources, machine caps, objective progress and event-triggered notices. Add named local save slots for sandbox and campaign sessions while retaining portable save-string import/export and migrating the existing resume save.

Refresh the main menu with a more distinctive, animated presentation. Stack New Campaign above Sandbox, place Resume Game when a record exists and Load Game after them, and keep the theme panel at the bottom. Keep the Sandbox label aligned with the freeform mode it starts and center the menu in Terminal. Add a mission briefing modal that identifies the mission and objectives, and an in-game mission HUD for objectives and remaining resources.

## Initial mission configuration

The user chose sensible values. The configurable first mission sample is 100 authored/seeded Dry Mud, 100 Water in the player's placement budget, a target of 100 cumulative `Dry Mud → Wet Mud` transitions, and a cap of 1 Sprinkler. This is coherent with the existing one-Water-per-Dry-Mud conversion. Keep the values in mission data so later levels can change them without editing the tracker or UI. The sample is the initial playable mission unless the user revises it.

## Current integration points

- `index.html` contains the current menu, world-size modal, portable save dialog, and autosave-choice dialogs.
- `ui.js` wires menu and modal actions, opens the world-size chooser, controls sandbox startup, and offers portable Load/Save flows.
- `game.js` owns simulation lifecycle and menu/workspace transitions; `physics.js` owns particle updates and material transitions.
- `constantsAndGlobalVars.js` provides DOM element references and shared game/tool state.
- `saveLoadGame.js` writes version-3 compressed snapshots, maintains the named local save library and active record, and migrates the single `elemental-foundry.autosave.v1` resume slot. Version-1, version-2, and version-3 payloads are accepted.
- `styles.css` owns the themed menu and existing dialog styling.
- Existing regression coverage is grouped under `e2e/navigation/`, `e2e/persistence/`, and the deterministic `tools/` harnesses. The current game mechanics guide describes sandbox behavior and needs to remain accurate.

## Architecture

### Mode and mission runtime

Introduce a small campaign module that owns mission definitions, active campaign state, resource accounting, objective counters, and event state. Keep mission data separate from sandbox startup and from presentation code. A mission definition should declare:

- stable mission ID, displayed number, title, and briefing;
- initial world dimensions and authored setup;
- player-placement budgets by material and machine limits by machine type;
- one or more objective definitions with stable IDs and clear progress/complete predicates;
- event definitions with stable IDs and conditions, such as objective completion.

Campaign runtime state should include the mission ID, remaining placement budgets, machine counts, cumulative objective counters, and fired event IDs. Dispatch typed simulation events at the actual material-transition and machine-placement commit points. For conversion objectives, count the specific `Dry Mud → Wet Mud` transition cumulatively; do not infer progress from current world totals, which can decrease as particles move, are erased, or transition again. Event IDs must be idempotent so reloads cannot announce the same event repeatedly.

The initial mission can use a declarative rule such as `countTransition(from, to, target)` and an event such as `objectiveCompleted(objectiveId)`. Avoid arbitrary executable predicates in serialized data. Keep the core tracker callable from deterministic tests without DOM dependencies.

### Resource and machine enforcement

Treat mission material budgets as quotas for player-created placements. Charge budgets only after a valid placement commits; rejected or cancelled drawing does not consume inventory. Enforce at every user-created-material path: brush, line, rectangle, ellipse, and blueprint stamping (including any other creation tool discovered during implementation). Machine caps count successfully placed machines of each declared type and must be checked at the machine placement commit point, not only by hiding palette entries. Failed placements do not spend a cap.

Physics-generated particles and authored initial-world content are distinct from the player’s remaining placement quota. Preserve resource and machine usage across saves. Update the resource HUD from runtime state and prevent disallowed actions with accessible feedback. Verify actual transition locations and all particle/machine creation paths in `physics.js`, `game.js`, and `ui.js` before choosing the final hooks.

### Save format and local registry

Upgrade compressed portable save payloads to version 3 with explicit mode metadata (`sandbox` or `campaign`) and campaign runtime metadata when applicable. Version-1 and version-2 payloads migrate to sandbox defaults. Validation must reject malformed or unsupported campaign metadata before restoring any simulation or changing the active session.

Store the save library as a JSON array under `elemental-foundry.saves.v1`, with records `{ id, name, type, saveString, updatedAt }`; store the active-save ID under `elemental-foundry.active-save.v1`. `saveString` is the existing compressed snapshot. The active record drives autosave updates; saving a named game creates or updates only that record, and switching sessions updates the active ID. New autosaved Sandbox sessions create a fresh uniquely named Sandbox record so a Campaign record is preserved; campaign startup creates a mission-named Campaign record. Migrate the existing `elemental-foundry.autosave.v1` snapshot once into a named record, preserving its exact compressed contents and making it the active record. Remove the legacy key only after the new record is successfully written. Handle malformed registry data, missing active IDs, unavailable storage, and quota errors without losing the last valid snapshot.

Add menu Load Game management for listing, naming, and loading local slots. Keep portable save-string export/import available. Label records automatically by game type while allowing a player-provided name. Retain existing resume/autosave behavior, including its five-minute cadence and failure feedback, but route writes to the active record. A user-created campaign or sandbox should not silently overwrite a different named save.

### User interface and visual design

Redesign the menu as a responsive, theme-aware landing screen with vertical actions ordered New Campaign then Sandbox, subtle motion/ambient decoration, clear hierarchy, and the existing Resume, Load, and theme controls. Put the theme panel below the action stack and keep Terminal centered. Preserve keyboard access, visible focus, reduced-motion preferences, small-screen layout, and contrast in all six existing themes. Do not make animation a prerequisite to seeing or activating controls.

Add a campaign mission chooser/entry flow as needed for mission selection. Before the workspace opens, show a modal with mission number/title, briefing, objectives, and available starting resources; an explicit OK/Start action dismisses it and enters the mission. In the workspace, show compact objective progress, completion/event notices, and remaining resource/machine budgets. Campaign controls should not obscure or intercept the canvas unexpectedly. Preserve the current sandbox New Game chooser and startup semantics.

## Sandbox preservation requirements

- The Sandbox menu entry remains the freeform mode and follows the existing world-size selection and autosave-choice behavior.
- Existing particle behavior, tools, machine behavior, keyboard controls, world dimensions, and workspace interactions do not change for sandbox sessions.
- Sandbox placement has no campaign quota checks; sandbox saves remain marked as sandbox.
- Existing portable v1/v2 saves remain loadable and are interpreted as sandbox saves.
- Resume continues to restore the previous session, including its mode, without accidentally starting a fresh campaign or sandbox.
- Existing menu actions and theme selection remain available; their revised styling must not alter their behavior.

## Implementation sequence

1. Add mission definitions and a DOM-independent campaign runtime for state initialization, budget/cap checks, transition counting, and idempotent event dispatch.
2. Add hooks at real simulation transition and successful player placement commit points. Guard all material-placement and machine-placement paths while leaving sandbox checks bypassed.
3. Add save-v3 mode/campaign metadata, backward migration, a versioned local save registry, legacy autosave migration, active-record autosaving, and named-slot operations.
4. Extend menu UI for the campaign entry, mission introduction, mission HUD, completion notices, and local save management; maintain the sandbox path and portable string dialogs.
5. Apply responsive, theme-aware menu styling, motion, and reduced-motion handling.
6. Update project mechanics, persistence, navigation, and E2E documentation. Archive this plan after implementation and verification; leave `docs/plans/` empty at handoff.

## Focused verification areas

Run focused tests only through the project’s documented npm entry points. No full test suite is authorized by this plan; ask the user before any full-suite run.

1. **Campaign runtime / deterministic simulation:** objective counts advance only on the intended conversion transition; counts saturate at the target; objective events fire once; water placement budget and Sprinkler cap reach their configured limits after player placement; HUD and palette state reflect exhaustion. Regression: `e2e/campaign/mission.spec.mjs` (2 tests). User blueprint stamps debit resources once; undo/redo restoration does not debit them again.
2. **Navigation and UI:** menu presents New Campaign before Sandbox, with vertical stacking and themes below the actions; Sandbox keeps the freeform startup; Campaign shows its briefing before entering, then exposes the mission HUD. Regression: `e2e/navigation/menu.spec.mjs`, alongside existing navigation and theme coverage.
3. **Persistence:** named Sandbox and Campaign records retain their type and independent snapshots; active IDs switch with loaded records; new autosaved Sandbox sessions receive a fresh record without replacing Campaign; the legacy v2 autosave migrates once to an active Sandbox record with the exact old snapshot and resumes in Sandbox. Regression: `e2e/persistence/multi-save-registry.spec.mjs` (3 tests). Portable v1/v2 saves remain loadable and default to Sandbox.

### Public contracts pinned by the created regressions

The regression files define these callable module contracts:

- `campaign.js`: `getCurrentMission()` returns a mission with `id`, `number`, `title`, `briefing`, `objectives` (including `id`, `label`, `from`, `to`, `target`), and `resourceBudgets.materials.Water` / `.machines.sprinkler`; `getCampaignState()` returns `null` in sandbox and mission runtime state in campaign; `recordMaterialTransition(fromId, toId)` accepts physics material IDs; `canUseMaterial(materialName)` reports placement availability; `canPlaceMissionMachine(machineType)` reports the machine cap. Objective state exposes `objectiveProgress[objectiveId]` and `firedEventIds`; material/machine resource state exposes `{ limit, used, remaining }` at `resources.materials.Water` and `resources.machines.sprinkler`.
- `saveLoadGame.js`: `saveGameToLibrary(name)` saves the current session and returns/resolves successfully; `listSavedGames()` returns records with `{ id, name, type, saveString }`; `getActiveSaveId()` returns the active record ID; `loadSavedGame(id)` restores that record, switches the active ID, and returns the parsed payload. Existing `createSaveString()` and `parseSaveString(string)` remain available for portable saves and the migration fixture.
- User-facing selectors exercised by these regressions: accessible menu buttons `New Campaign` and `Sandbox`; `#missionIntroDialog` (dialog role) and `#missionIntroOk`; `#missionHud`; resource counters `#missionResourceWater` and `#missionResourceSprinkler`; accessible Resume Game and Load Game buttons; and the Sprinkler palette button, which becomes disabled at its cap. Completion feedback includes visible text matching `Objective complete`.

The local registry uses the `elemental-foundry.saves.v1` storage key for its
record array and `elemental-foundry.active-save.v1` for the active ID. Its UI
uses `#savedGamesList`, `#librarySaveName`, and `#saveToLibrary`; each record row
has an accessible Load action. Players can name and load records; deletion is
not part of this implementation.

Focused npm wrapper commands for the created regression files:

```text
npm.cmd run test:browser -- e2e/navigation --workers=1 --trace=off
npm.cmd run test:browser -- e2e/campaign/mission.spec.mjs --workers=1 --trace=off
npm.cmd run test:browser -- e2e/persistence --grep "resume slot is offered|clear cancel and confirm|New Game autosave choices|Load Cancel leaves|legacy single-slot" --workers=1 --trace=off
npm.cmd run test:browser -- e2e/persistence/multi-save-registry.spec.mjs --workers=1 --trace=off
```

Final focused results on 28 September 2026: navigation **7/7**; campaign
mission **2/2**; selected persistence regressions **5/5**; the complete
multi-save registry spec **3/3** after a fresh-Sandbox isolation regression was
added. The initial broader persistence attempt exposed save-migration failures;
these were fixed before the focused runs. The entire persistence area was not
rerun after the fixes, so it is not reported as clean. No full browser or
project-wide suite was run.

## Final documentation handoff

- `docs/GAME_MECHANICS.md`, `docs/PROGRAM_OVERVIEW.md`, and `docs/E2E_TEST_PLAN.md` were updated for the shipped behavior.
- `e2e/navigation/README.md`, `e2e/campaign/README.md`, and `e2e/persistence/README.md` document the focused test ownership and commands.
- This executed plan is archived as `docs/archive/plans/2026-09-28-campaign-menu-missions-and-multi-save.md`; `docs/plans/` is left empty.
