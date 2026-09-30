# Campaign large-brush painting performance

## Goal and scope

Reduce the synchronous cost of a large paint gesture in Campaign mode while
preserving the cells painted, campaign resource limits, material-placement
progress, and the brush's existing random sequence. Sandbox behavior should
remain unchanged.

`paintCell` currently commits each successful cell through
`consumeCampaignMaterial`. In Campaign mode each commit calls
`recordMaterialPlacement`, which updates placement objectives, scans the full
world for pending world-state objectives, checks mission completion, and
dispatches a campaign-state notification. A large brush or shape repeats that
work for every placed cell. `paintLine` compounds it by calling `paintCell`
once per interpolated point. This explains why the same gesture costs more in
Campaign mode, especially on missions with a pending world-state objective.

## Implementation plan

- Add a campaign mutation batch boundary and use it at the public paint-action
  boundary in `paintCell`, `paintLine`, and `paintShape`. Nested calls, such as
  `paintLine` calling `paintCell`, must join the same batch and finalize once.
- Keep the per-cell availability check and resource consumption in their
  current traversal order. Keep cell writes, campaign material placement
  progress, loose-material random checks, and ray-direction assignment in the
  existing order. Coalesce repeated whole-world objective evaluation, mission
  completion checks, and campaign-state notifications; complete the batch
  before returning from the public paint action.
- Finalization must evaluate pending world-state objectives against the final
  world, check mission completion, and publish the resulting campaign state.
  Preserve objective prerequisites and unlock/event behavior. Keep erasing,
  wind, port snapping, and non-Campaign painting behavior unchanged.
- Add an opt-in browser benchmark for paused `paintCell` calls in a 260×150
  world. Its six cases compare brush sizes 1 and 31 in Sandbox, Mission 3
  (placement objective), and Mission 6 (pending world-state objective). Report
  gesture timings, accepted cells, campaign notifications, and instrumented
  world-state scans/cells scanned separately; do not make host-sensitive
  timing a normal-suite pass/fail threshold.

## Focused verification

- `e2e/tools/campaign-paint-batching.spec.mjs` covers a large Mission 6 paint
  with a pending world-state objective (one world scan and campaign refresh
  after the action) and a Mission 3 finite budget that runs out partway through
  a size-31 brush (exactly 100 placed and charged cells).
- `performance/brush-painting.spec.mjs` provides the six paused size-1/31
  Sandbox/Mission 3/Mission 6 cases described above. Run it and the focused
  behavior spec through the documented npm wrappers; compare performance
  results on the same host and browser.

### Pre-fix baseline

The initial size-31 `paintCell` measurements show the campaign overhead grows
with the mission's pending world-state work:

| Scenario | Median paint time | Instrumented evidence |
| --- | ---: | --- |
| Sandbox | 2.5 ms | — |
| Mission 3 placement objective | 426.45 ms | 387.5 campaign notifications median |
| Mission 6 pending world-state objective | 1,167.2 ms | 709 scans and 27,651,000 world cells scanned per paint |

Use these values as same-machine pre-fix reference points, not portable timing
thresholds. The focused regression expects batching to reduce repeated
world-state scans and campaign refreshes while preserving placed-cell and
budget results.

## Risk and boundary

Batching defers world-state objective recognition until the gesture completes.
Verify that objective prerequisites, completion events, and resource unlocks
remain correct when a large action crosses a target. Never defer budget checks
or per-cell material-placement accounting, which could permit overspending or
change the amount credited.

Campaign also calls `updateWorldStateObjectives` from each active simulation
step. That full-world scan remains after paint batching and may still cost
frames while a mission has pending world-state objectives. Keep it separate in
the benchmark and follow up with a dirty-state or cadence design only if
measurements show it remains a material source of lag; this plan does not alter
active-tick objective semantics.
