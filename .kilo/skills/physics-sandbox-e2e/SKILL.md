---
name: physics-sandbox-e2e
description: Test and refactor browser-based physics sandboxes with deterministic timing, simulated input, and state-based assertions.
---

# Physics Sandbox E2E & Refactor Expert

* **Codebase Analysis:** Prioritize locating the core loop (`requestAnimationFrame`), input event listeners (`click`, `mousedown`, `mousemove`), and the global state array (e.g., `entities`, `particles`).
* **Determinism Guardrails:** Ensure all physics updates rely strictly on a fixed delta time (`dt`) or a mockable timer during test execution to prevent frame-rate variance from breaking tests.
* **Deterministic Input Injection:** Implement programmatic user actions (clicking buttons, dragging on canvas) that bypass physical mouse moves, using precise coordinates and simulated events.
* **Snapshot Assertions:** Test success by comparing the state array (positions, velocities) against expected mathematical baselines after a fixed number of ticks.
