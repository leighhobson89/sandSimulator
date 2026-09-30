# Implementation Plan: Campaign Cloud-to-Snow Weather Correction

## Goal

Align Missions 3 and 5 with the implemented weather cycle by using Cloud for
weather formation and snowfall. Replace weather-related Steam only in those
two missions. Preserve Steam where it is a deliberate material or reaction
product, including Mission 8's Water-to-Steam quench byproduct.

## Scope

### Mission 3 — The Basin in Three States

- Replace the finite 8,000-cell Steam player kit and budget with a finite
  8,000-cell Cloud kit and budget.
- Preserve the staged placement objective: after the Sand, Dry Mud, and Ash
  piles are placed, unlock Cloud and require placement of 500 Cloud cells.
- Keep the authored weather target at 95% Humidity and 20 °C Dewpoint, plus the
  existing 150-cell wet and dry milestones, temperature limits, glass stage,
  Lava stage, other material budgets, and any-order drying progression.
- Preserve objective id `place-steam` if practical so saved Mission 3 progress
  remains compatible, while changing its material, label, kit, and runtime
  behavior to Cloud. Do not change the other mission stages or add natural
  Cloud nucleation as a new game feature; this stage uses the finite Cloud kit
  already exposed by the mission catalog.
- Migrate a legacy saved Mission 3 resource allowance keyed as 8,000 Steam to
  the equivalent Cloud allowance when restoring/validating that mission. Keep
  the migration scoped to Mission 3 so Steam in other missions and saved
  material data is untouched. Preserve any associated used/remaining counts
  consistently, so a pre-change campaign state remains resumable and valid.

### Mission 5 — Moisture in Motion

- Remove Steam from the weather objective. After the cold/dewpoint target,
  count 75 `Cloud → Snow` transitions; retain 60 `Snow → Water` and 50
  `Water → Wet Sand` transitions.
- Keep Humidity fixed at 95%, set Dewpoint to 20 °C for the cold-weather stage,
  and preserve the authored Temperature target sequence of −10 °C followed by
  8 °C unless the exact-profile regression demonstrates that a target needs
  tuning for reliable natural snowfall or thaw.
- Clouds must come from the existing natural nucleation/weather behavior under
  the mission's captured humid open-air conditions. Do not add a Cloud player
  supply, a new unlimited-resource option, or a new Cloud-spawning feature.
  The captured Sandbox snapshot should contain no preplaced Cloud and no
  Water, Steam, or Snow supply. Preserve the 150-cell Wet Sand source,
  four-row Sand catch bed, 95% local and Base Humidity, unrestricted snapshot
  restore, and active Campaign state.
- During the −10 °C objective, check the configured profile while the
  atmosphere cools. Once exposed air reaches Dewpoint, natural Cloud
  nucleation and precipitation should produce Snow, not rain/Water. At the
  8 °C target, the documented open-air profile is above freezing and Snow
  should melt to Water.

### Out of scope

- Leave Mission 8's Water-to-Steam transformation and all other Steam
  definitions, material rules, and missions unchanged.
- Do not alter the general humidity, dewpoint, cloud nucleation, condensation,
  or precipitation systems unless the focused exact-profile test proves a
  narrow existing behavior prevents Mission 5 from completing. Any broader
  physics change requires a separate plan.
- Do not alter objectives, budgets, layouts, or progression outside the
  specified Mission 3 and Mission 5 weather stages.

## Documentation

After implementation and verification, update the weather and campaign
descriptions in:

- `docs/CAMPAIGN_MISSIONS.md`: M3's finite 500-Cloud placement stage and
  budget; M5's 75 Cloud-to-Snow objective, natural Cloud source, 20 °C
  Dewpoint, −10 °C cold stage, 8 °C thaw stage, and no Cloud supply.
- `docs/GAME_MECHANICS.md`: M3/M5 mission summaries and the distinction
  between naturally nucleated atmospheric Cloud and finite player-placed
  Cloud. Keep general Steam behavior accurate.
- `docs/PROGRAM_OVERVIEW.md`: campaign mission progression and M5's
  captured-scenario weather loop.
- `docs/E2E_TEST_PLAN.md`: focused M3 placement, M5 scenario/profile and
  objective coverage, and the deterministic snowfall check.
- `e2e/campaign/README.md`: current Mission 3 and Mission 5 weather
  objectives, supplies, and focused verification commands.

## Focused verification

Extend the existing regressions without broadening the test run beyond these
three functional areas:

- `e2e/campaign/mission-three-staged-progression.spec.mjs`: verify finite
  Cloud availability after the three pile stages, the 500-Cloud placement
  objective, Humidity 95% / Dewpoint 20 °C, and unchanged 150-cell wet/dry,
  glass, and Lava stages. Add a compatibility case that restores a legacy
  Mission 3 campaign record with the 8,000-cell Steam resource allowance and
  confirms it becomes the equivalent Cloud budget (`limit: 8000`, carrying
  forward `used: 125` and `remaining: 7875`) while retaining `place-steam`
  progress (125), its unlocked/available state, and a valid campaign state;
  Steam is removed from the restored resource map.
- `e2e/campaign/objective-carousel.spec.mjs`: preserve M3's 18-objective
  sequence and `place-steam` ID, assert that this objective now uses Cloud,
  remains locked until the preceding pile stages, and displays the Cloud
  placement briefing. This protects objective identity and player-facing copy.
- `e2e/campaign/missions-four-to-six.spec.mjs`: verify Mission 5's Cloud-to-
  Snow target of 75, Snow-to-Water target of 60, Water-to-Wet-Sand target of
  50, 95% Humidity and 20 °C Dewpoint, −10 °C then 8 °C temperature targets,
  absence of a Cloud player supply, and unchanged captured 150-cell Wet Sand
  snapshot with 95% local/Base Humidity. Its staged-progression assertions
  feed the campaign transition recorder directly; they validate objective
  definitions and gates, not the atmospheric particle reactions.
- `tools/simTest.mjs --focus=dewpoint-climate`: add the exact Mission 5
  atmosphere profile to the deterministic weather regression. In a 64×36
  world, set the air profile to 150 °C, ambient and local Humidity to 95%,
  move Dewpoint from 10 °C to 20 °C, then set the ambient Temperature target
  to −10 °C. With seed 5505, step for up to 6,000 frames until at least 75
  Snow forms naturally, then assert there is no Water/rain. Allow cooldown to
  complete: do not require snowfall while the upper air remains above 0 °C.
  The same tested profile reaches 141 Snow after cooling. Then set the exact
  air and ambient target to 8 °C and assert both the top and y=35 surface
  readings are above freezing. The browser definition test separately asserts
  no Cloud is preplaced or in the player budget. This harness case must not
  place Cloud or introduce a player Cloud supply; it does not assert actual
  Snow melting.

Run only the focused specs through the documented npm wrappers:

```text
npm.cmd run test:browser -- e2e/campaign/mission-three-staged-progression.spec.mjs --workers=1 --trace=off
npm.cmd run test:browser -- e2e/campaign/objective-carousel.spec.mjs --workers=1 --trace=off
npm.cmd run test:browser -- e2e/campaign/missions-four-to-six.spec.mjs --workers=1 --trace=off
npm.cmd test -- --focus=dewpoint-climate
```

## Completed verification results (30 September 2026)

- `npm.cmd test -- --focus=dewpoint-climate` — **5 passed**. The natural
  snowfall criterion allows cooldown to finish, reaches the 75-Snow target
  without Water, and preserves the above-freezing 8 °C profile check.
- `npm.cmd run test:browser -- e2e/campaign/mission-three-staged-progression.spec.mjs --workers=1 --trace=off` — **2 passed**, including the legacy Steam-budget migration to Cloud.
- `npm.cmd run test:browser -- e2e/campaign/missions-four-to-six.spec.mjs --workers=1 --trace=off` — **3 passed**, including Mission 5's Cloud/Snow stages, no Cloud supply, and unchanged temperature targets.
- `npm.cmd run test:browser -- e2e/campaign/objective-carousel.spec.mjs --workers=1 --trace=off` — **5 passed**, including the stable M3 `place-steam` ID with Cloud copy and gating.

Mission 8's Water-to-Steam quench remains unchanged and distinct from weather.
No full suite was run. The living documentation was updated, this executed plan
was archived here, and `docs/plans/` is empty.
