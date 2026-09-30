# Implementation Plan: Campaign Missions 4–6

## Goal and scope

Add Missions 4–6 to the generated `MISSION_DEFINITIONS` data in `campaign.js`, using the approved designs in `docs/CAMPAIGN_MISSIONS.md`. Preserve Missions 1–3, their order, IDs, and behavior. Keep the change data-only except for the specific snapshot-decoding fix below; the existing campaign runtime already handles `material-placement`, `transformation`, and `environment-target` objectives, `requires` gates, material/control unlocks, temperature limits, and captured `startingSave` scenarios.

Do not modify Missions 1–3, simulation rules, broader campaign runtime behavior, or the campaign authoring UI. The only non-data implementation change allowed is the narrow UI/save-boundary snapshot-decoding fix described below.

## Mission data

Append three numbered definitions inside the existing generated mission-data markers, with stable IDs `meltwater-garden`, `moisture-in-motion`, and `controlled-burn`.

### Mission 4 — The Meltwater Garden

- Use a declarative 260×150 world with a five-row Sand floor; no captured snapshot is needed.
- Set the environment to −10 °C, 72% Humidity, 70% Ambient Light, 10 °C Dewpoint, and no Wind. Leave Temperature available with a maximum of 8 °C; lock Humidity, Ambient Light, Dewpoint, and Wind.
- Budget 500 Snow and one Red Tulip Seed. Do not include Water, Steam, Cloud, or Wet Sand in the loadout.
- Add the three documented transformation objectives: 100 Snow → Water, 100 Sand → Wet Sand, and one Red Tulip Seeds → Red Tulip. Give each objective a unique ID, positive target, and player-facing label; use the exact material names from `particles.json`.

### Mission 5 — Moisture in Motion

- Author a captured, unrestricted Sandbox scenario and store it as `startingSave`. The capture must be 260×150, with a four-row Sand floor at y=146..149 and a 100-cell exposed Wet Sand strip at x=80..179, y=145, directly above it. No Water, Steam, Snow, or Cloud supply may be available.
- Capture both local Humidity and Base Humidity at 95%, and set the mission environment to 25 °C, 95% Humidity, 50% Ambient Light, 10 °C Dewpoint, and no Wind. Verify the values remain correct after `prepareCampaignMissionWorld` restores the save and applies the mission environment.
- Set Temperature limits to −10…150 °C and leave Temperature available. Lock Humidity, Ambient Light, Dewpoint, and Wind; unlock Dewpoint when `dry-wet-sand` completes.
- Implement the ordered seven-objective chain with unique IDs and `requires`: reach 150 °C (`heat-drying`); dry 100 Wet Sand → Sand (`dry-wet-sand`); set −10 °C and 20 °C Dewpoint (`set-cold-dewpoint`); condense 50 Steam → Snow (`condense-snow`); set 8 °C (`set-thaw-temperature`); melt 50 Snow → Water (`melt-snow`); wet 50 Sand → Wet Sand (`wet-catch-bed`). Use `environment-target` with exact `targetValues` for the climate stages and `transformation` for material changes.
- Give no additional Water or other water-cycle material budget; these materials arise from the authored moisture and simulation transitions.

### Mission 6 — A Controlled Burn

- Author a captured, unrestricted Sandbox scenario and store it as `startingSave`. The capture must be 260×150, include the full-width five-row Sand floor, a compact contiguous 40×50 block of 2,000 Wood at x=105..144, y=95..144, and a clear Air Fire cell at (104,120) bordering the block, with no Fire or Water preplaced.
- Keep Temperature fixed at 25 °C and lock every climate control. Budget one Fire and 500 Water; do not budget the preplaced Wood. Set `initiallyAvailableMaterials` to Fire only so Water remains unavailable until its objective unlocks it.
- Add `start-fire` as a one-Fire `material-placement` objective. Require it for `ignite-wood-front`, a 1,000 Wood → Fire `transformation` objective that unlocks Water. Require `ignite-wood-front` for `quench-front`, a 50 Fire → Smoke `transformation` objective.
- Put the block shape and notch instructions in briefing/guidance because objective counters cannot verify coordinates, dimensions, or contiguity. Explain the 150-frame Fire lifetime, cumulative ignition count, remaining unignited Wood at Water unlock, and the need to quench along active edges while the remaining Wood sustains spread. Do not claim that the 1,000-transition target guarantees 1,000 live Fire cells.

## Integration details

- Keep all new definitions valid for the existing mission validator: unique mission/objective IDs, positive objective targets, supported materials and controls, valid prerequisite references, and complete environment, resource-budget, starting-selection, tool, and visualization fields.
- For Missions 5–6, embed valid portable Sandbox saves with no campaign state and matching 260×150 dimensions. Avoid trying to encode these custom terrain/humidity layouts with new declarative layout types. The mission environment is applied after restoring `startingSave`, so keep saved local simulation state and mission-level climate values aligned.
- At the `startingSave` UI/save boundary, decode the encoded simulation arrays before passing the simulation state to `restoreSimulationState`. The implemented UI/save-boundary fix decodes the snapshot payload before physics restore, restores only the scenario simulation, and preserves active Campaign state, objectives, and resource budgets. It does not route an unrestricted Sandbox payload through campaign-state restoration or clearing logic.
- Use `targetValues.illumination` for Ambient Light targets and the existing `unlocks` schema for material/control availability and slider limits.

## Handoff clarification

`MDESIGN` activates only when it appears in the current user prompt and applies only to design edits in `docs/CAMPAIGN_MISSIONS.md`. Campaign implementation always follows the standard development workflow and uses focused regression tests. `AGENTS.md` and `.kilo/agents/mission-designer.md` were corrected to make this boundary clear and prevent future false test skips.

## Progression update

Missions 1–6 are now established campaign content. Future mission design starts at Mission 7; earlier outline entries for Missions 7–23 are legacy drafts, not guidance or checklists. The campaign outline and `.kilo/agents/mission-designer.md` now use this same progression boundary.

## Focused verification

The focused campaign coverage is in `e2e/campaign/missions-four-to-six.spec.mjs`. It checks the mission definitions, layouts, and budgets; mission-intro visibility; parsed unrestricted 260×150 Sandbox snapshots and restored Missions 5–6 scenarios; restored humidity; objective gating; and the 1,000 Wood-to-Fire Water unlock. The scenario-restore regression covers decoding encoded snapshot arrays before physics restore while preserving active Campaign state.

```text
npm.cmd run test:browser -- e2e/campaign/missions-four-to-six.spec.mjs --workers=1 --trace=off
```

The focused spec passed **3/3** on 30 September 2026. No full suite was run. Manual review confirmed Missions 1–3 remain unchanged, Missions 4–6 appear in order, the Mission 5 and 6 saves are unrestricted 260×150 Sandbox snapshots, the snapshots restore without changing active Campaign state, and objective gates and unlocks reference defined objectives, materials, and controls.
