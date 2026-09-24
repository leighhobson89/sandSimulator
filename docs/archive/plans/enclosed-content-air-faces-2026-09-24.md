# Enclosed Content Air-Face Cooling Plan

Finalized and implemented: 24 September 2026

## Implementation scope

- Select the air-cooling target for ordinary non-air particles only from
  cardinally adjacent air-space faces. Enclosed faces contribute their live
  local air temperature; open faces contribute height-adjusted outdoor
  temperature. Average all qualifying faces for the particle's air target.
- If a particle has no cardinal air-space face, apply neither direct ambient
  cooling nor the `coolsBy` clamp. Preserve material-to-material conduction,
  source and ray heating/cooling, and the dedicated Insulation network. A solid
  shell can still conduct outside influence inward through its material cells.
- Do not change air flood-fill classification, save formats, or the Insulation
  network behavior.

## Acceptance and verification

- [x] Enclosed and open air faces use their respective local and outdoor
  temperatures when cooling adjacent contents.
- [x] Diagonal-only air contact does not count as a cooling face.
- [x] Contents with no cardinal air-space face get no direct ambient cooling or
  `coolsBy` clamp, while ordinary material conduction and heat sources remain.
- [x] Focused npm simulation runs passed:
  - `npm test -- --focus=thermal-air-faces`: **7/7**
  - `npm test -- --focus=thermal-chamber`: **16/16**
  - `npm test -- --focus=thermal-contracts`: **4/4**
- No full test suite was run for this fix.
