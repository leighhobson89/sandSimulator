# Live autosave and toolbar tooltips

## Finalized behavior

- Place the Autosave checkbox beside Edge pan in the top bar. Keep its checked
  state synchronized with autosave activity across New Game, Resume, Import,
  and save failures.
- Turning Autosave off stops future periodic writes while preserving the
  current resume save. Re-enabling starts a fresh five-minute interval and
  does not write immediately.
- Use the shared theme-styled tooltip for toolbar buttons, checkboxes, and the
  theme selector. The Ember tooltip background is opaque.

## Verification record

- Focused persistence Playwright area: 13/13 passed headlessly.
- No full suite was run for this handoff.
- The newest tooltip-only QMODE visual adjustment, including the opaque Ember
  background, was not separately tested.
