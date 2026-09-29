# Plan: staged materials and environmental objectives for Mission 3

## Goal and scope

Replace outline Missions 3–5 with one staged materials mission, **The Basin in
Three States**, and renumber every later outline entry. The campaign outline will
contain 23 missions and no replacement missions. Mission 3 starts on a blank
world, teaches placement and material reactions in stages, and ends with the
three starting materials becoming Lava.

Keep Missions 1 and 2 intact. Add campaign support for prerequisite-gated
objectives, counting player-placed material units, objective-driven material
and control unlocks, temperature control limits, and environment targets that
can check humidity and dewpoint without requiring unrelated fields. Add the
Dry Mud-to-Lava reaction at a reachable high temperature. Set Mission 2's
per-mission Temperature maximum to 30 C while preserving the Sandbox fallback
maximum of 4,000 C. This plan does not authorize test execution.

## Current architecture

- `campaign.js` holds the generated mission data and owns material and machine
  budgets, objective progress, material-transition callbacks, environment
  targets, state validation, completion events, and save restoration. Today it
  supports `transformation` and `environment-target` objectives. Objective
  progress is initialized from mission definitions and persisted in the
  campaign state.
- `game.js` enforces material budgets while committing brush, shape, and
  connector cells. `consumeCampaignMaterial` is called after a player cell is
  written, so it is the suitable shared point to count committed material
  placement. Physics-driven transformations already report through the
  campaign transition listener.
- `ui.js` gates catalog visibility from remaining resource budgets, applies
  `lockedControls`, checks environment objectives, and owns the Air Temperature
  range and number inputs. Temperature currently uses the global `-60..4000 C`
  bounds. A campaign-state change refreshes the campaign HUD and available
  controls. The HUD currently stacks objectives; replace that list with a
  single-objective carousel whose selection is transient UI state. Mission-
  specific Temperature bounds must override the global range only during that
  mission, then return to the 4,000 C Sandbox maximum.
- `campaignEditor.js` validates only transformation and environment objectives,
  requires all three current environment-target values, and accepts a
  declarative floor layout or captured Sandbox save. Its form reconstruction
  must preserve and validate the new objective fields. A blank world is
  currently not an accepted declarative layout.
- `particles.json` contains generic melt and wetting fields consumed by the
  physics loop. Dry Mud currently has no melt target. `GAME_MECHANICS.md`
  documents current material reactions; `e2e/campaign/README.md` describes the
  installed campaign and editor coverage.

## Mission 3 outline

Use an explicit blank starting layout and no captured scenario. Give the
mission 5,000 each of Sand, Dry Mud, and Ash, plus 8,000 Steam; no machine
budget is needed. Make the opening material kit Sand, Dry Mud, and Ash, with
Temperature control capped at 150 C. Keep Humidity, Dewpoint, Ambient Light,
and Wind locked initially.

Order the objective chain as follows:

1. **Build the dry piles:** keep three `material-placement` objectives active
   together. Count 500 committed units each of Sand, Dry Mud, and Ash, with
   5,000-unit budgets for each material.
2. **Introduce Steam:** the Steam `material-placement` objective requires all
   three dry-pile objectives. Steam becomes visible and available while this
   objective is active. Count 500 committed Steam units from its 8,000-unit
   budget; completion unlocks Humidity and Dewpoint.
3. **Make rain:** add a humidity/dewpoint `environment-target` objective with
   `targetValues` of 100 Humidity and 100 Dewpoint, requiring the Steam
   objective. It gates three 500-count transformations: Sand to Wet Sand, Dry
   Mud to Wet Mud, and Ash to Wet Ash.
4. **Dry the piles:** after all three wetting objectives complete, require a
   `Temperature=150` environment objective before drying. Count 500 each of
   Wet Sand to Sand, Wet Mud to Dry Mud, and Wet Ash to Ash. Keep the
   Temperature maximum at 150 C until all three drying objectives complete.
   Order drying as Sand, Dry Mud, then Ash. The final Ash-drying objective
   requires the Sand and Dry Mud drying objectives, its Wet Ash/rain
   prerequisites, and the Temperature=150 objective; it unlocks a Temperature
   maximum of 2,000 C.
5. **Make Lava:** require the final Ash-drying objective for a
   `Temperature=2000` environment objective. Gate the Lava transformations
   behind that objective: Sand to Glass and then Glass to Lava, Dry Mud to Lava,
   and Ash to Lava. Count 500 for each transition; the Sand-to-Glass step gates
   Sand-to-Lava.

Represent objective dependencies with `requires`, a list of objective IDs.
An objective remains visible in the HUD while gated, but cannot gain progress
until every prerequisite is complete. Derive a material's availability from
its active `material-placement` objective: this lets Steam appear as soon as
the dry-pile prerequisites are satisfied, before its 500 placements are
complete. `canUseMaterial` and catalog availability must both enforce this
stage gate while still applying the declared budget.

Represent progression rewards with an objective `unlocks` object. Its
`controls` list can add controls, and its `controlLimits` object can change a
control's bounds. Keep unlock state derived from saved objective progress so
saves do not need a separate, potentially stale unlock snapshot.

Count `material-placement` progress only after a player placement successfully
writes a cell and consumes one unit from the matching material budget. Brush,
line, rectangle, ellipse, and valid port-cell placement must share this
counting path. Failed, blocked, skipped, erased, or simulation-generated
material does not count as a newly placed unit. Transformations continue to
count through the existing material-transition callback, subject to
prerequisites.

An `environment-target` objective may define its own `targetValues` subset.
Compare only the keys supplied by that objective; Mission 3 uses
Humidity+Dewpoint and separate Temperature-only targets for 150 C and 2,000 C.
Preserve Mission 2's existing three-key `environmentTargets` behavior for
backward compatibility. Include Dewpoint in the values reported to campaign
objective logic.

Set the mission's initial `controlLimits.temperature.max` to 150 C. The final
Ash-drying objective's `unlocks.controlLimits.temperature.max` raises it to
2,000 C. A Temperature=2,000 environment objective then gates the final
reaction phase. Add Dry Mud's generic melt fields with Lava as its melt result
and a threshold reachable within that unlocked maximum, but above the initial
cap. Keep the threshold in the material definition so tooltips, physics, and
catalogue documentation use one source of truth.

## Implementation steps

1. **Extend objective evaluation in `campaign.js`.** Add generic
   `material-placement` progress, prerequisite checks, objective reward
   derivation, and flexible subset environment-target matching. Apply the same
   prerequisite rules when restoring state and validating progress. Preserve
   missions without the new fields, existing campaign checkpoint compatibility,
   one-shot objective events, and campaign completion behavior.
2. **Connect successful placement in `game.js`.** Count placed units only after
   an accepted material write and budget consumption. Keep all paint modes on
   the same accounting path and keep simulation reactions separate from player
   placement.
3. **Apply progressive catalog and control access in `ui.js`.** Derive
   available material/control access from objective completion, refresh the
   picker and HUD when an objective completes, and apply the current effective
   temperature maximum to both Air Temperature inputs. Replace the stacked
   objective list with one bottom-right selected row, previous/next arrow
   controls, and a 1-based current/total counter. Include locked objectives in
   the sequence, show completed objectives with green/check status, and do not
   auto-advance when progress changes. Keep selection stable across HUD
   rerenders; reset transient selection to the first objective on mission
   start, restart, advance, or reload. Ensure the controls and status are
   keyboard and screen-reader accessible and remain usable at narrow viewport
   sizes. Restore the normal 4,000 C Sandbox maximum outside a campaign. Give
   Mission 2 a 30 C maximum; prevent typed, slider, restored, or mission-start
   values from exceeding the active mission's limit.
4. **Extend Campaign Editor schema and validation in `campaignEditor.js` and
   `index.html`.** Preserve `requires`, `targetValues`, `unlocks`, and other
   objective-specific fields while reading and saving drafts. Provide editor
   support for the new objective type and the fields authors need to configure
   prerequisites and unlocks. Validate material names, control names and limits,
   prerequisite references, and prerequisite cycles. Allow an explicit
   `{ "type": "blank" }` starting layout as well as existing floor layouts
   and captured Sandbox saves; retain
   its value through review and generated-source install. Runtime mission start
   already initializes a fresh world before applying layouts, so blank layout
   support should leave that initialized world empty.
5. **Add the reaction and authored mission data.** Set Mission 2's
   `controlLimits.temperature.max` to 30 C. Set Dry Mud's melt target to Lava
   at a high reachable threshold in `particles.json`; add the 23-mission
   definitions and new Mission 3 staged data in `campaign.js`. Update
   `docs/CAMPAIGN_MISSIONS.md` by merging its existing Missions 3–5 into this
   mission and renumbering the remaining outline without adding replacements.
6. **Update documentation after implementation and review.** Record Dry Mud's
   new phase change, staged objective/unlock behavior, objective-carousel
   navigation and status, Mission 2 and Mission 3 temperature limits, and
   campaign progression in `docs/GAME_MECHANICS.md`,
   `docs/CAMPAIGN_MISSIONS.md`, and `docs/E2E_TEST_PLAN.md`. Update
   `e2e/campaign/README.md` with carousel behavior and coverage, both missions'
   temperature limits, Mission 3's staged access and blank world, and editor
   coverage. Archive this finalized plan in `docs/archive/plans/` using a dated
   descriptive filename.

## Acceptance criteria

- The outline has 23 missions. Its new Mission 3 combines the old outline
  lessons on Sand wetting, Dry Mud wetting/drying, and Ash wetting; all later
  outline entries are renumbered without replacement missions.
- Mission 3 starts with no floor material or captured save, offers 5,000 each
  of Sand, Dry Mud, and Ash, and offers 8,000 Steam. The three 500-unit pile
  objectives are active together; Steam becomes available only when its
  500-unit placement objective is active after all three piles.
- Completing Steam placement unlocks Humidity and Dewpoint. Objective
  prerequisites prevent out-of-order progress.
- Mission 2 declares `controlLimits.temperature.max` as 30 C. Both the Air
  Temperature range and numeric inputs enforce the per-mission cap, and leaving
  campaign mode restores the Sandbox maximum of 4,000 C.
- Humidity/dewpoint rain can complete the three 500-unit wetting objectives.
  Temperature cannot exceed 150 C during the drying stage; all three 500-unit
  drying objectives must finish before the control maximum rises to 2,000 C.
- Final objectives require 500 units each for Sand-to-Glass-to-Lava,
  Dry-Mud-to-Lava, and Ash-to-Lava. Dry Mud's melt reaction is governed by the
  normal material definition and is reachable at the unlocked cap.
- Mission 2's existing environment target still validates and completes;
  Mission 3 `targetValues` containing only Humidity and Dewpoint also validate
  and complete when both values match without Temperature or Ambient Light.
- Mission 2's Temperature maximum is 30 C on both inputs; attempts to select or
  type a higher value clamp to 30 C. Outside campaign mode both inputs return
  to the 4,000 C Sandbox maximum.
- The Campaign Editor's mission slider-limit JSON field,
  `#campaignEditorControlLimits`, validates and round-trips Mission 2's
  mission-level `controlLimits.temperature.max` value of 30 C.
- The mission HUD shows one selected objective row at the bottom right, with
  previous/next arrow controls and a 1-based current/total counter. Every
  objective, including locked ones, occupies one position in the sequence.
- A completed selected objective has green/check status. Completing an
  objective does not change the selected position automatically, and ordinary
  HUD rerenders preserve the selection.
- Carousel navigation is bounded at the first and last positions. Mission 1
  displays its single objective as 1/1; Mission 2 exposes four objectives and
  Mission 3 exposes 17, including locked objectives.
- Carousel selection is transient and returns to the first objective when a
  mission starts, restarts, advances, or reloads. It does not alter saved
  objective progress.
- Carousel arrow controls and objective status expose accessible names/state,
  work by keyboard, and remain visible and operable at narrow viewport sizes.
- Campaign saves, objective events, editor drafts, mission review, generated
  mission source, blank starting layouts, and sandbox behavior preserve their
  existing contracts while round-tripping the new schema.

## Verification scope and test plan

Focused campaign coverage is in `tools/simTest.mjs`,
`e2e/campaign/mission-three-staged-progression.spec.mjs`,
`e2e/campaign/objective-carousel.spec.mjs`, and
`e2e/campaign/editor.spec.mjs`.

- `npm.cmd test` runs the deterministic `tools/simTest.mjs` harness. Its Mission
  3 section checks the blank layout and budgets; 500-unit placement objectives
  and Steam prerequisites; Steam visibility and Humidity/Dewpoint unlock;
  partial humidity/dewpoint targets; out-of-order transition blocking; the
  rain and wetting stage; Temperature=150 gating; the sequential Sand, Dry Mud,
  and Ash drying chain; the final Ash-drying Temperature-cap unlock;
  Temperature=2,000 gating; the four final material transitions; and Dry
  Mud's reachable Lava melt behavior. It also checks Mission 2's authored
  Temperature maximum of 30 C and Mission 3's initial maximum of 150 C.
- `npm.cmd run test:browser -- e2e/campaign --workers=1 --trace=off` covers the
  Campaign functional area. `objective-carousel.spec.mjs` checks Mission 1's
  1/1 counter, disabled navigation at both boundaries, and selected completion
  state; Mission 2's four ordered objectives, navigation, selection stability
  across progress rerenders, and reset on restart, reload/resume, and advance;
  and Mission 3's 17 objectives, locked Steam state, both navigation boundaries,
  and completion status without auto-advance. It confirms advancing from
  Mission 2 resets Mission 3 to 1/17, and covers accessible arrow labels,
  announced status, keyboard navigation, and narrow-viewport usability.
  Mission 2 progression coverage verifies both Air Temperature inputs expose
  a 30 C maximum, slider and typed values above 30 C clamp to 30 C, and leaving
  Campaign restores the 4,000 C Sandbox maximum. The staged progression spec
  enters Mission 3 through the campaign flow, checks the blank world, initial
  disabled controls and 150 C maximum, places the 500-unit piles and Steam
  through game paint, verifies staged palette and climate-control access,
  changes humidity/dewpoint and Temperature=150/2,000 targets, checks input
  clamping, and completes the mission. It drives material-phase progress
  through the campaign transition callback rather than simulating a full
  rainfall cycle. The editor spec validates and saves/reloads a blank layout
  with `requires`, partial `targetValues` including Dewpoint, `unlocks.controls`,
  `unlocks.controlLimits`, budgets, events, and Mission 2's
  `controlLimits.temperature.max` through `#campaignEditorControlLimits`.

The focused Campaign browser area passed **21/21** tests:

```text
npm.cmd run test:browser -- e2e/campaign --workers=1 --trace=off
```

The editor-only rerun passed **6/6**:

```text
npm.cmd run test:browser -- e2e/campaign/editor.spec.mjs --workers=1 --trace=off
```

The deterministic `npm.cmd test` harness completed with **408 passed and 24
failed**. The failures were in unrelated pre-existing seed, electrical, Fan,
Dewpoint, and illumination checks. Mission 2's cap, Mission 3's staged
progression, and the physical Dry Mud-to-Lava checks passed in that run; it is
not a clean full deterministic-suite pass.
