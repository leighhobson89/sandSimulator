# Enclosed Air and Insulation Plan

Finalized and implemented: 24 September 2026

## Goal

Add a high-performance thermal barrier and thermal bridge, and make air with no
route to the world perimeter retain a local temperature. Open air must continue
to follow the existing shared ambient setting and altitude lapse. This supports
hot chambers, including Steam that remains hot while the outside air is cold.

## Architecture

- Add material 54, **Insulation**, to the Solids picker. It is static, pink-red,
  has zero ordinary contact thermal conductivity, very slow cooling, and melts
  at `5000 C` into Lava. Radiation can warm it. Its dedicated, fast thermal
  network transfers heat between face-connected Insulation cells and adjacent
  enclosed air cells; it excludes open air and other materials. An Insulation
  bridge can therefore exchange heat between chamber interiors without
  leaking to open-air faces or neighboring ordinary materials.
- Recompute air-space reachability from the perimeter each simulation frame
  using an eight-way flood fill over empty and gas cells. Diagonal openings
  count as air routes. Derive the classification per frame so breaching or
  resealing a chamber takes effect without adding persisted world state.
- Keep open air on the existing global ambient and height-lapse behavior.
  Enclosed empty air and gas cells keep local temperatures and continue to
  respond to nearby matter and local sources such as rays, fire, and Lava.
  Opening a route returns the area to gradual open-air ambient behavior.
- Keep material-specific conductivity, cooling, and bulk-insulation effects
  distinct. Enclosure can be made from other solids; Insulation should be the
  most effective barrier, not the only usable one.
- For a solid face touching both chamber and open air, calculate its cooling
  target from all adjacent air-space faces. Enclosed faces contribute their
  live local temperatures; open faces contribute height-adjusted outside
  ambient. If no air-space face is adjacent, retain the row-ambient fallback.
  Preserve per-material variance and cooling scale. This corrects the mixed
  Wall boundary case so its outdoor-facing side can leak heat while its
  chamber-facing side remains coupled to local air.
- Preserve existing save formats and browser workflows. Keep deterministic
  physics coverage in `tools/` and visible behavior in the owning Playwright
  specs under `e2e/`; run tests through documented npm commands only.

## Acceptance checklist

- [x] Insulation is selectable and rendered as a pink-red Solid, with zero
  conductivity, very slow cooling, and the `5000 C` to Lava transition.
- [x] Insulation itself can warm, while its zero contact conductivity prevents
  standard contact transfer to open air or other materials.
- [x] A fast, local thermal network transfers heat through connected
  Insulation and into adjacent enclosed air. A bridge warms a second chamber
  while open exterior air and a neighboring ordinary solid remain near baseline.
- [x] Open air retains the existing ambient and altitude-lapse response.
- [x] Eight-way perimeter-connected empty and gas cells are open; enclosed air
  keeps local heat, responds to sources, and switches behavior after a breach.
- [x] Sealed Steam remains warmer than exposed Steam in a cold ambient setting.
- [x] Other materials can retain chamber heat according to their own thermal
  properties. A matched Wall chamber remains above ambient after 120 frames,
  while being at least `40 C` cooler than its Insulation counterpart.
- [x] A one-frame mixed-boundary check passes: an adjacent Wall uses both the
  local temperatures of enclosed air faces and the height-adjusted ambient of
  open air faces.
- [x] No world-save schema change is required; existing per-material thermal
  variation and bulk insulation remain active.
- [x] Physics E2E specs cover chamber and Insulation bridge behavior; catalog
  E2E specs cover the Insulation category, color, and glossary description.
  Focused browser coverage runs through the npm wrapper.

## Verification record

- `thermal-contracts`: **4/4 passed** (Insulation bridge and catalog contracts).
- `thermal-chamber`: **16/16 passed**.
- `thermal-regressions`: **52/52 passed**.
- Full `npm test`: **306 passed, 0 failed**; core timing diagnostic **7.98
  ms/frame**.
- Smoke checks: **passed**.
- Scale-profile checks: **passed**.
- `npm run profile:scale` average step: **7.174 ms** at `260x150`, **31.849 ms**
  at `520x300`, and **147.581 ms** at the synthetic `1040x600` size.
- The focused catalog browser wrapper discovered **4 tests**, but its
  configured test context could not start, so no assertions ran.

Focused browser command form:

```text
npm run test:browser -- e2e/physics --workers=1 --trace=off
```
