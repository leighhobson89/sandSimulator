# Visualization UI Rework Plan

## Objective

Move visualization controls out of Environment, introduce a dedicated Visualizations section and accessible options dialog, and add live humidity and wind views while preserving existing simulation controls and Heat rendering.

## Findings and design

- The sidebar controls are in `index.html`; current control wiring and dialog behavior are in `ui.js` and `constantsAndGlobalVars.js`. Existing dialogs use `.save-dialog` markup/styles and explicit open/close focus handling.
- `game.js` renders the world into the cell-sized canvas. Its Heat branch currently short-circuits normal material rendering. Local humidity already exists per cell in `world.humidity` and is exposed through `getHumidityAt()`.
- Fan airflow carries direction and magnitude in `world.airflowX/Y`. Wind-tool gusts and ambient Breeze currently only leave scalar `world.wind` trails, so their direction cannot be recovered from those trails. Preserve the existing physics and record suitable transient directional display data for those sources; combine it with actual Fan airflow for the Wind view.
- Heat-view state is currently a separate boolean and is included in save/load. Replace it with one mode (`normal`, `heat`, `humidity`, `wind`), keep only one active mode, and preserve compatibility with saved `heatViewOn` state so existing saves restore Heat correctly. Placeholder buttons remain inert and follow existing disabled-button conventions if available.

## Scope and implementation

1. **Environment and Visualizations UI - `index.html`, `styles.css`, `constantsAndGlobalVars.js`, `ui.js`**
   - Add the Visualizations section immediately before Environment with equal-width Normal and Options buttons.
   - Reorder Environment to Layers/Breeze, Layer Strength, Wind Strength, Air Temperature, Base Humidity, Dew Point. Use equal-width Layers and Breeze buttons. Remove the Heat button from this section without removing its behavior.
   - Add a responsive, two-column, three-row Visualizations dialog with Heat, Humidity, Wind and three inert placeholders, plus Close.
   - Reuse the existing dialog theme and conventions for modal semantics, Escape, initial focus, focus containment/restoration, close behavior, and z-index. Keep each real mode's selected state synchronized with `aria-pressed`.

2. **Visualization state, compatibility, and rendering — `constantsAndGlobalVars.js`, `saveLoadGame.js`, `game.js`, `physics.js`**
   - Introduce a single visualization mode as the source of truth; Normal clears it. Selecting any visualization replaces the previous mode and cannot leave stale overlays.
   - Keep Heat's current temperature coloring. Add a humidity palette that maps the per-cell humidity field from dry/warm to humid/cyan-blue and is recalculated during normal rendering, without writing simulation arrays.
   - Add a Wind renderer that communicates vector direction with readable arrows/stream marks and maps vector magnitude from blue (slow) to red (fast). Source vectors from Fan `airflowX/Y` and transient direction data associated with wind-tool and ambient Breeze trails; these data are display-only and must not alter particle motion or thermodynamics.
   - Save/load the selected mode while accepting legacy `heatViewOn` saves; normal mode is the default when neither field is present.

3. **Documentation — relevant project documentation**
   - After implementation and review, update documentation that describes the sidebar controls, visualization behavior, transient airflow data, save compatibility (if applicable), and regression coverage. Archive this executed plan in `docs/archive/plans/` with its dated descriptive filename; leave `docs/plans/` empty when the handoff workflow is complete.

## Regression coverage required by the feature request

- Verify sidebar order and visibility: Visualizations precedes Environment; its two buttons share the row; Environment order is Layers/Breeze, Layer Strength, Wind Strength, Air Temperature, Humidity, Dew Point; Heat is absent from Environment. Retain tests for all control ranges, event handling, and Breeze/Layer behavior.
- Verify Options opens the named modal with six visualization buttons in a 3x2 layout and Close; placeholders are inert; modal semantics, keyboard activation, Escape, initial focus, focus restoration, responsive sizing, and close behavior match existing conventions.
- Verify Heat activation from the dialog preserves existing temperature rendering. Verify humidity colors use distinct local field values, update live, and do not mutate humidity or other simulation arrays.
- Verify Wind uses directional airflow and speed-dependent blue-to-red colors for Fan, wind-tool, and Breeze data as applicable; it updates live and does not change physical simulation outcomes.
- Verify exclusive transitions Heat -> Humidity -> Wind -> Normal clear previous overlays, Normal does not open the dialog, and selected button ARIA states remain synchronized.
- Verify modern visualization modes round-trip through saves, legacy `heatViewOn` saves restore Heat, and existing Environment controls still work.

## Automated test plan added before implementation

The focused regressions are in place before production code changes:

- `e2e/tools/environment.spec.mjs` checks the Visualizations/Environment order, all Environment control order, equal-width button rows, narrow sidebar fit, retained controls, Heat pixels, local humidity colors without humidity-array mutation, Wind vector speed colors and directional marks, and exclusive mode switching plus Normal pixel restoration.
- `e2e/accessibility/dialogs.spec.mjs` checks the six mode buttons in a 3x2 grid at a narrow viewport, modal labeling and semantics, three safe placeholders, dialog bounds, no page errors, close and Escape behavior, and focus restoration. It also updates the keyboard Heat shortcut assertion to target the dialog control.
- `e2e/tools/edge-cases.spec.mjs` keeps the Heat keyboard-toggle and layer dependency coverage against the relocated visualization button.
- `e2e/persistence/export-import.spec.mjs` verifies modern Humidity visualization mode survives save/load and that a legacy payload without `visualizationMode` but with `tools.heatViewOn=true` restores Heat.
- `tools/smokeTest.mjs` verifies opening Options, activating Heat, and clearing it through Normal without errors.

Focused entry points use the project npm wrappers:

```text
npm run test:browser -- e2e/tools/environment.spec.mjs e2e/tools/edge-cases.spec.mjs --workers=1 --trace=off
npm run test:browser -- e2e/accessibility/dialogs.spec.mjs --workers=1 --trace=off
npm run test:browser -- e2e/persistence/export-import.spec.mjs --workers=1 --trace=off
npm run test:smoke
```

The regressions were added before implementation and passed after the feature was implemented.

## Completed implementation and verification

- Added the Visualizations section above Environment and reordered the controls. Heat, Humidity, and Wind now share one visualization mode in the options dialog; Normal clears the mode. The modal follows existing focus and accessibility patterns, and its three placeholders are disabled.
- Kept Heat's renderer, added a local humidity field palette, and added a Wind view with speed-colored air and sparse arrows. Fan arrows read physical airflow vectors; the wind tool and Breeze use separate transient direction samples which do not affect particle movement or temperature mixing.
- Save/load stores the current visualization mode and restores legacy saves that have `tools.heatViewOn` without `tools.visualizationMode`.
- Updated `README.md`, `docs/README.md`, `docs/GAME_MECHANICS.md`, `docs/E2E_TEST_PLAN.md`, `docs/archive/README.md`, and `e2e/tools/README.md` to describe the feature, verification, and regression coverage.

Verification completed on the implementation:

| Entry point | Result |
| --- | --- |
| `npm.cmd test` | 336 passed, 0 failed |
| `npm.cmd run test:smoke` | Passed |
| `npm.cmd run test:scale-profile` | Scale profile checks passed; World allocation checks passed |
| Full browser suite | 167 passed, 0 failed in 12.8 minutes |
| Focused browser regressions | Tools, accessibility dialogs, and persistence passed, including the localized Wind trail direction case |

The full browser run used installed Chrome with video capture off because this
machine did not have Playwright's bundled Chromium and FFmpeg installed. It ran
through the npm wrapper with a temporary config and an already-started local
test server; no test configuration changes were retained in the project.

No known issues remain from this change. The final non-browser wrapper reruns
completed after the localized Wind trail sampling refinement; the simulation,
smoke, scale-profile, world-allocation, focused browser, and full browser
results above all apply to the final implementation.

## Risks and resolutions

- Existing slider IDs, ranges, label associations, and input wiring were preserved while controls moved; focused browser regressions confirm the resulting order and retained functionality.
- `world.wind` has intensity but no direction. Transient `displayWindX/Y` samples now supply wind-tool and Breeze directions while Fan momentum remains sourced from the existing airflow vectors.
- Wind marks are sampled at bounded spacings inside visible canvas bounds; the full scale and browser regressions passed after the localized trail sampling refinement.
- Current visualization modes save and restore; the added persistence regression confirms legacy saves with `tools.heatViewOn` and no mode field still restore Heat.
- Full and focused checks completed through the documented npm entry points, with no failures.
