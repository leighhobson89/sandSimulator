# Storage-bin intake and collision

The storage-bin intake is an invisible collision barrier at the outside edge
of the funnel drawn in the 32px machine icon. It is not the machine's one-cell
centre and it is not a solid 32px square.

## Geometry

`physics.js` rebuilds the barrier for every storage bin at the start of each
simulation step:

- `STORAGE_OPENING_HALF_WIDTH` gives the intake its approximately 32px span.
- Barriers sit one grid step behind the machine centre, at the funnel-to-bin
  join. This keeps material against the icon without a visible air gap in any
  orientation.
- Diagonal barriers use the same one-step depth and a one-cell staircase
  supercover. The connector cells prevent a particle travelling at 45 degrees
  from passing through corner-to-corner gaps.
- `storageBarrierMask` contains the resulting cells. Every powder, liquid, gas,
  ambient-wind and Fan movement check sees those cells as
  `STORAGE_VIRTUAL_WALL`.

`buildStorageBarrierCells()` is the single source of barrier geometry.
`updateStorageBins()` iterates those same cells when looking for particles to
store, so collision and collection cannot use different entrance positions.

## Acceptance rules

A two-cell suction zone extends directly outward from every barrier cell. The
zone is scanned from nearest to farthest, so packed liquid can enter even when
it has no free row to move into and therefore has not moved during that frame.

If the particle has the bin's accepted category, matches the type already in
the bin, and capacity remains, it is removed from the world and the stored
count increases. Empty suction cells are skipped. A wrong particle, a different
stored type, or a full bin stops that suction ray; the intake does not pull a
valid particle through an invalid one. The barrier remains solid, so refused
matter falls, flows or continues responding to wind without crossing it.

The storage pass runs immediately after powered Fan movement. This lets a
particle delivered to the barrier during that frame be collected before normal
gravity runs.

## Regression coverage

`tools/simTest.mjs` includes these storage checks:

- a sealed upright liquid funnel fills its bin and retains overflow;
- a Fan below and left of a diagonal powder bin fires three Ash particles
  up-right at 45 degrees, and all three enter the bin;
- a particle arriving from the front of an upside-down bin is refused.
- two stationary packed Water cells are pulled into a liquid bin;
- a wrong particle blocks suction from reaching valid material behind it.

Run `npm test` after changing the machine icon size, direction mapping, barrier
distance, movement order or Fan physics. If the SVG funnel is moved, update the
barrier constants and these regressions together.
