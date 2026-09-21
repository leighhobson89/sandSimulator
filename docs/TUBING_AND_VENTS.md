# Tubing and Vents

`Tubing` is a non-conductive, static material used to move a stored particle
type between machines. It connects only through shared cell edges, so diagonal
corner contact is not a connection.

## Connecting a run

Paint one continuous tube between a storage bin and either a compatible storage
bin or a Vent. A working run has exactly two attached machines. The source bin
must contain material, and the destination must have room and accept that
material. Only then the bin is connected, it empties, and moving dots appear in
the tube from the source to the destination.

The rate is controlled by the narrowest painted cross-section anywhere along
the route:

- 3 cells wide: 30 particles/second
- 2 cells wide: 20 particles/second
- 1 cell wide: 10 particles/second

The dots and flow stop immediately when the source is empty, the route is
incomplete, the destination rejects the material, or the destination is full.

## Vent behavior

A Vent is always active and releases its stored material into the canvas cell
directly below it. Its click dialog contains a Release switch, on by default.
With Release off, it buffers one material type up to 100 particles; a full vent
stops the connected tube at 0/s. Hovering a Vent shows its stored amount and
current switch state.

The source inventory, vent inventory, Release switch, and fractional flow
remainder are saved with worlds and Blueprints. Headless regression coverage in
`tools/simTest.mjs` checks the 30/s and 20/s bottlenecks, material transfer,
non-conductive tubing, vent release, and full-vent flow cut-off.
