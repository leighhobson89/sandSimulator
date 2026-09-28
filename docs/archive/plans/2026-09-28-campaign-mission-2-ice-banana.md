# Mission 2: Ice and Banana Campaign Plan

Date: 28 September 2026  
Status: Implemented and verified with focused Campaign E2E; deterministic simulation pending approval  
Owner: Development handoff

## Goal

Add Mission 2, an Ice and Banana scenario, and the campaign completion flow that
lets the player advance from a completed mission into the next mission briefing
and world. Keep Sandbox behavior unchanged. Make controls that are unavailable
under campaign rules visually clear: visibly reduced opacity, a bold red
`DISABLED` tooltip on hover and keyboard focus, and disabled semantics that
cannot be bypassed by pointer or keyboard.

Mission 2 teaches the player to thaw a frozen starting habitat, set the climate
to a Banana growing target, and germinate one seed using the finite Dry Mud and
seed supplies. Campaign rules remain data-driven; do not embed mission-specific
branches in general sandbox placement or physics paths.

## Mission 2 definition

Mission data should define:

- ID `ice-banana`, number `2`, title **The Icebound Grove**,
  briefing, and guidance describing the thaw, climate, and Banana steps.
- A `260 × 150` world with a five-row Ice floor spanning all 260 columns. Start
  environment values are temperature `-10 °C`, humidity `35%`, illumination
  `10%`, dewpoint `-15 °C`, ambient wind off, wind strength `0`, and gust
  strength `0`. Do not seed Dry Mud or Banana Seeds in the initial world; they
  are player supplies.
- Exactly 500 Dry Mud placements and one Banana Seeds placement. Do not add a
  Water or machine budget; there is no Sprinkler allowance. Melted Ice supplies
  Water through simulation, and any unbudgeted campaign material remains
  unavailable to the player.
- Banana plant ideal temperature `30 °C` and ideal humidity `95%`, matching
  `plantIdealTemp` and `plantIdealHumidity` in `particles.json`. Store the
  separate authored objective targets under `environmentTargets` as temperature
  `30 °C`, humidity `95%`, and illumination `85%`. `environmentTargets` is
  distinct from the starting `environment` values. `particles.json` has no
  Banana-specific illumination ideal, so document 85% as a mission target,
  never as a material property.
- Brief the player to use the Temperature and Humidity sliders in World
  Parameters and the Ambient Light slider. State that 30 °C and 95% humidity
  are Banana's ideals and that 85% illumination is the authored mission target.
- A fixed five-row Ice floor, player supplies, `environment` start values,
  `environmentTargets`, allowed controls, objective definitions, and
  `objective-complete` events in the mission data. Never inherit environment
  values from whichever Sandbox session ran previously.

The authored Mission 2 climate blocks are:

```js
environment: {
  temperature: -10, humidity: 35, illumination: 10, dewpoint: -15,
  ambientWindOn: false, windStrength: 0, gustWindStrength: 0
},
environmentTargets: { temperature: 30, humidity: 95, illumination: 85 }
```

The installed briefing guidance is: “Use the Temperature slider in World
Parameters to warm the five-layer Ice bed until it melts into Water. Banana
grows best at 30°C and 95% humidity; set those with the Temperature and
Humidity sliders, then use the Ambient Light slider to reach the mission target
of 85%. Add up to 500 Dry Mud to the Water to make Wet Mud, then plant your
single Banana Seed in the wet soil.”

### Objective conditions

The campaign runtime and editor support typed `transformation` and
`environment-target` objectives plus `objective-complete` events. The editor
stores the three `environmentTargets` values with environment-target missions;
validation requires valid target values without storing or executing arbitrary
JavaScript. Use ordered player guidance for the four objectives below. Each has
target `1` and an `objective-complete` event.

- **Thaw the basin:** count one actual `Ice → Water` material transition.
  Progress is cumulative and does not count a painted or stamped Water cell.
- **Restore a tropical climate:** complete one climate objective when the
  mission's current climate settings simultaneously equal `environmentTargets`:
  `30 °C`, `95%` humidity, and `85%` illumination. Temperature, humidity, and
  illumination controls needed to achieve the objective remain enabled. Check
  after a relevant setting change and latch completion once true; persist it.
- **Prepare wet soil:** count one actual `Dry Mud → Wet Mud` transition.
  Progress is cumulative and does not count painted or stamped Wet Mud.
- **Grow one Banana:** count one actual `Banana Seeds → Banana Plant`
  germination transition. Do not count manually placed or blueprint-stamped
  Banana Plant cells. The seed may use Ice-melt Water or resulting Wet Mud,
  subject to existing seed rules.

Mission completion occurs when all four objectives complete. Objective
counters and event IDs remain cumulative, fire once, and persist in the
campaign save. Mission events should give a short player-facing message for
each objective and a completion event for the mission.

## Campaign control treatment

Separate mission locking from regular Sandbox controls. For a control that is
unavailable in Campaign:

- Keep the control semantically disabled (`disabled` and/or `aria-disabled` as
  appropriate) and guard its action handler as well as its appearance. For a
  native disabled input that cannot receive focus, put the focusable tooltip
  trigger and `data-campaign-disabled="true"` on its associated wrapper; use
  `aria-describedby` to associate the explanation.
- Apply a campaign-only reduced-opacity style and an accessible tooltip whose
  leading status is bold, red **DISABLED**, followed by a short reason.
- Show the tooltip on pointer hover and keyboard focus. Do not rely on color or
  hover alone to explain the unavailable action.
- Expose a stable test hook such as `[data-campaign-disabled="true"]` on each
  unavailable control. Keep the disabled marker and campaign styling off in
  Sandbox. The temperature, humidity, and illumination controls for Mission 2
  remain usable for its climate objective.

Apply this presentation only to controls actually unavailable under the active
mission rules: unbudgeted materials, locked climate sliders, unavailable tools,
and restricted debug controls. Pause, Save, Load, and other usable system
actions remain enabled and do not receive the disabled opacity or tooltip. The
tooltip must not capture input or obscure the canvas interaction target.
Preserve existing Sandbox control behavior and styles.

## Mission recap and progression

When every objective in the active mission completes, pause mission play and
automatically open a completion stats modal. It displays the mission
number/title, objective results, and a resource-use row for each finite budget
with used, total, and remaining counts. Do not count mission-seeded Ice or
reaction products as player placements. The final objective and mission-
complete events fire once. The modal has an explicit OK/dismiss action. After
it is dismissed, keep an objective-passed bar visible in the mission HUD; that
bar contains the ADVANCE button. The player advances only by clicking this HUD
button.

Use these stable browser selectors:

- `#missionCompleteDialog` for the automatically opened accessible completion
  stats modal.
- `#missionCompleteStats` for objective results and per-resource used/total/
  remaining counts.
- `#missionCompleteOk` for the modal's OK/dismiss action.
- `#missionAdvance` for **ADVANCE** on the persistent objective-passed HUD bar.
- `#missionIntroGuidance` for player-facing mission instructions in the next
  mission briefing.

For Mission 1 completion, the stats modal opens automatically. Clicking
`#missionCompleteOk` dismisses it and exposes the objective-passed HUD bar.
Clicking `#missionAdvance` on that bar resolves the next mission by number,
starts Mission 2, and presents its briefing, resources, objectives, and guidance
before the Mission 2 world is entered. Confirming that briefing initializes
  the 260 × 150 world, five-row Ice bed, `-10 °C` / `35%` / `10%` starting
  temperature, humidity, and illumination values, `-15 °C` dewpoint, Mission 2
  budgets, and objective state. It must not carry Mission 1's world or remaining
resources into Mission 2. Save the new active mission and run state before
transitioning so Resume restores the current mission, not the completed prior
world.

Apply the recap and next-mission resolver to any mission. When Mission 2 is the
last installed mission, keep the passed-objective bar visible with a disabled
**CAMPAIGN COMPLETE** action. Do not wrap to Mission 1 or attempt to load a
nonexistent mission.
When a later mission is added, the same ADVANCE resolver should open its
briefing without another Mission 2 code path.

## Save and runtime behavior

Keep Sandbox snapshots and its current save flow unchanged. Campaign save v3
must persist current mission ID, objective counters, fired event IDs, resource
usage, and progression/completion recap state needed to resume or advance.
Restore the recap if a completed mission is resumed before advancing; after
advancing, restore the next active mission world and briefing state. Validate
old v1/v2 saves as Sandbox as before. Campaign runtime changes must not alter
the multi-save registry's Sandbox/Campaign type assignment or active-record
ownership.

Record Ice-to-Water and Banana Seeds-to-Banana Plant transitions through the
actual committed physics transition hook. Climate progress is based on the
defined mission climate predicate, not a manually painted cell or a UI label.
Placement guards continue to charge only player-created material operations;
mission layout and simulation-generated Water do not consume the Dry Mud or
seed budgets. Existing blueprint stamp charging and undo/redo restoration rules
remain in force.

## Implementation outcome

`campaign.js` now defines Mission 2's Ice floor, start climate, supplies,
environment targets, four ordered objectives, and one-time objective events.
The campaign runtime evaluates environment-target objectives and persists
mission completion, recap dismissal, and pending progression. `campaignEditor.js`
supports validation, editing, and local-draft persistence for the typed
environment objective and all three climate target fields.

The main UI opens the completion recap automatically when objectives pass.
**OK** dismisses the recap, then **ADVANCE** on the persistent HUD bar opens the
next mission briefing and initializes its world. At the last installed mission
the bar reports **CAMPAIGN COMPLETE** and does not advance. Resume restores
Mission 2's saved player climate. Campaign-only unavailable controls show the
disabled marker, reduced opacity, and bold red `DISABLED` reason tooltip;
usable system actions and Sandbox remain free of that treatment.

## Focused verification scope

Focused browser coverage is in `e2e/campaign/`; deterministic simulation
coverage is in `tools/simTest.mjs`:

- Mission data and briefing: Mission 2 number/identity, Ice-only floor across
  the full width, dimensions, start values (`-10 °C`, `35%` humidity, `10%`
  illumination, `-15 °C` dewpoint, calm wind), 500 Dry Mud and one Banana Seed
  allowance, `environmentTargets` (`30 °C`, `95%`, `85%`), and guidance for all
  four objectives.
- Disabled control presentation: campaign-only controls cannot be activated,
  expose the disabled test marker, and show the bold red `DISABLED` tooltip on
  hover and keyboard focus with reduced opacity. Mission 2's three climate
  controls remain available. Sandbox has no campaign disabled styling and its
  regular controls continue to work.
- Mission flow: mission completion automatically opens the stats modal with
  used/total/remaining resources; `#missionCompleteOk` dismisses it and leaves
  the objective-passed HUD bar visible with `#missionAdvance`. Clicking
  ADVANCE opens the Mission 2 briefing with `#missionIntroGuidance`; accepting
  it initializes the Ice world and Mission 2 HUD/state.
- Editor authoring: editing and saving Mission 2 preserves all three
  `environmentTargets` values and the typed environment-target objective in the
  local draft.
- Runtime objectives: actual Ice-to-Water and Dry-Mud-to-Wet-Mud transitions
  count cumulatively; climate objective completes only when all three authored
  targets are met; actual seed germination completes the Banana objective.
  Painting Water, Wet Mud, or a Banana Plant does not count as a transition
  objective. Objective, mission-complete, and story event IDs fire at most once.
- Save/resume: used resources, objectives, completion recap, active mission,
  and progression survive campaign save/load or Resume. Mission 2 climate
  values changed during play survive Resume. Advancing saves the new mission
  state without changing Sandbox saves.
- Deterministic simulation: `tools/simTest.mjs` verifies the Ice melt hook,
  climate predicate thresholds, Banana seed germination under the Mission 2
  climate targets, cumulative progress, and one-time completion/event behavior.

Run focused browser coverage through the documented npm wrapper:

```text
npm.cmd run test:browser -- e2e/campaign --workers=1 --trace=off
```

The deterministic campaign regression lives in the complete `npm test`
simulation harness; it has no per-case focus option and needs separate user
approval before execution. Do not run a full test suite without that approval.

## Created regression coverage

The test-engineer handoff added:

- `e2e/campaign/mission-progression.spec.mjs` checks Mission 1's automatic
  recap and resource counts; OK dismissal; the persistent objective-passed HUD
  bar and ADVANCE into Mission 2's briefing/guidance/Ice scenario; Mission 2's
  climate controls and disabled-control marker, opacity, tooltip and reason; and
  the absence of campaign locks in Sandbox, plus restoration of changed Mission
  2 climate values on Resume.
- `e2e/campaign/editor.spec.mjs` verifies that Mission 2's climate target values
  and typed environment-target objective round-trip through a local draft.
- `tools/simTest.mjs` adds deterministic Mission 2 configuration, environment
  target and objective/event progression through `recordEnvironmentChange`,
  plus actual Banana seed germination and one-time objective/event behavior.

The focused Campaign-area command is:

```text
npm.cmd run test:browser -- e2e/campaign --workers=1 --trace=off
```

The updated focused Campaign area passed **11/11 tests** on 28 September 2026,
including the climate-target editor round-trip and climate save/resume
regressions. The deterministic simulation case is only reachable through the
complete `npm test` harness, which was not run and remains pending separate
user approval.

## Decisions and assumptions

- Banana ideal temperature and humidity are 30 °C and 95% from
  `particles.json`; 85% illumination is a mission-authored target only.
- Mission 2 starts at `-10 °C` with a full-width five-row Ice floor.
- The four guided objectives each have target `1`: Ice-to-Water, authored
  climate target, Dry-Mud-to-Wet-Mud, Banana Seeds-to-Banana Plant.
- Temperature, humidity, and illumination can be adjusted for the Mission 2
  climate objective. Other campaign-restricted controls use the visible
  disabled treatment.
- Mission 1 recap advances to Mission 2. Mission 2's last-mission fallback is a
  Campaign Complete state until a later mission is installed.
