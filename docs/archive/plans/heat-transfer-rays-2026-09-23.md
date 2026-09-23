# Heat transfer and ray tuning plan

## Context

- Heat Ray and Cold Ray currently use force rates near `1`, making their own
  temperature converge too abruptly.
- Ordinary heat diffusion uses only the receiving material's conductivity and
  a four-neighbour average, so the source material cannot influence contact
  transfer.
- Existing bulk insulation, ambient cooling, radiation, latent heat, and state
  transitions must remain intact.

## Decisions

- Replace the receiving-only conduction step with symmetric per-edge transfer.
- Derive each edge's rate from both materials using the geometric mean of their
  non-negative conductivities, multiplied by a modest tuning scale and capped
  per edge so four neighbours cannot overshoot.
- Apply the existing bulk-insulation multiplier to the receiving cell's total
  contact response. Ambient cooling and source retention remain separate.
- Tune Heat Ray and Cold Ray force rates down to a several-frame convergence;
  retain `2000 C` and `-120 C` targets, short lifetimes, and existing ray
  movement/radiation semantics.
- Keep the JSON conductivity fields as the material tuning surface and update
  their glossary/documentation wording to describe pairwise contact transfer.

## Implementation

1. Add a small symmetric contact-rate helper in `physics.js` and rewrite
   `diffuseHeat()` to accumulate bounded neighbour deltas from the current
   temperature snapshot.
2. Tune ray `forceRate` values in `particles.json` and update their descriptions.
3. Extend `tools/simTest.mjs` with deterministic checks for gradual heating and
   cooling, target convergence, and source-material-dependent transfer.
4. Update `docs/GAME_MECHANICS.md` and the relevant user-facing heat notes.
5. Record the workflow and tuning decisions in project memory for future work.

## Validation

- Run syntax checks for edited JavaScript.
- Run the focused headless simulation checks, then the approved full headless
  suite and smoke/browser areas as appropriate.
- Confirm existing phase changes, lava insulation, ray lifetime, and powered
  machine behavior remain passing.

## Risks

- Increasing contact transfer can accelerate phase changes. Existing latent
  heat and transition tests are the guardrail; adjust only the transfer scale or
  material values if a regression demonstrates a tuning issue.
- Pairwise transfer must remain bounded and symmetric so temperatures do not
  overshoot and isolated edge cells do not gain an artificial cold neighbour.
