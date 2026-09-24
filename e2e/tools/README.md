# Tools E2E Coverage

The six specs contain 41 tests covering brush painting and erasing, repeated
paint timing, keyboard tools, brush sizing, line/rectangle/ellipse gestures,
preview cancellation and clipping, middle-click material sampling and its mode
guards, pending Line/Rectangle/Ellipse cancellation, zoomed/scrolled picking
without viewport movement, grabber movement and restore, and all environment
controls and boundaries. Environment coverage also checks the Visualizations
toolbar and dialog, local Humidity colors, Wind speed and direction marks,
exclusive visualization switching, Normal View restoration, and narrow sidebar
fit. Keep their user-visible workflows aligned with the current architecture,
commands, and maintenance contract in
[`../../docs/E2E_TEST_PLAN.md`](../../docs/E2E_TEST_PLAN.md).
