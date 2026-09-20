# Full code review: 20 September 2026

## Overall assessment

Elemental Foundry has a sound architecture for its scope: `physics.js` stays
DOM-free, `game.js` owns canvas rendering, and `ui.js` connects controls. The
flat typed-array world and single `putImageData` renderer remain appropriate
performance choices.

The latest implementation closes the prior product-completeness gap around
persistence. Save/load is live in the UI, uses a versioned LZString format, and
round-trips the durable simulation buffers, environment settings and tools.

## Reviewed areas

| Area | Assessment | Evidence |
|---|---|---|
| Data-driven materials | Strong | `particles.json` provides 45 entries and `prepareDefinitions` resolves named references once at load time. |
| Simulation | Strong, but dense | Typed arrays retain per-cell state; heat, reactions, movement, wind and power are headless and covered by tests. |
| Rendering/UI | Good | Pixel canvas rendering, fitting, painting, Grabber, themed persistence dialogs and responsive panels are separated from physics. |
| Persistence | Healthy | Export/import uses copy/paste LZString saves. The local resume slot autosaves once per minute, and New Game/Import require an explicit replacement choice when one already exists. |
| Test infrastructure | Good coverage, reliability gap | The smoke suite now verifies a complete LZString typed-array round trip; `Math.random()` still makes physics outcomes non-reproducible. |

## Remaining findings

### High — tests can be flaky

The physics engine uses `Math.random()` throughout motion, reactions, weather,
growth and visual variation. Introduce a seeded injectable random-number
generator and retain failing seeds as regressions.

### Medium — package metadata is inconsistent

`package.json` has no dependencies and the server uses Node's `http` module,
but `package-lock.json` still has Express and transitive packages at its root.
Regenerate it to make installs, audit tools and provenance accurate.

### Medium — the physics module has reached a maintenance threshold

`physics.js` contains definitions, heat, reactions, plants, movement, wind,
Fans and power in one large module. Split by concern only after deterministic
tests are in place, with a narrow world-state interface.

### Low — browser QA is simulated, not visual

`tools/smokeTest.mjs` provides valuable startup, interaction and persistence
coverage but uses a stand-in DOM/canvas. Add a small real-browser suite and a
manual responsive checklist.

## Verification performed

- JavaScript syntax checks for persistence, physics, game and UI: passed.
- UI smoke test: passed, including LZString export/import restoration of typed
  world data.
- Headless physics test: 244 passed, 0 failed on the latest run.
- The passing performance assertion remained within its 8 ms/frame budget for
  the 260x150 stress scene.

This is a source-level and automated-behavior review, not a claim that every
material combination or browser/device has received manual QA.
