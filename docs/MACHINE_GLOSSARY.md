# Machine Glossary

Current reference for machine behavior and user-facing options. Update this
file whenever a machine, control, capacity, connection rule, or machine test
changes.

## Powered Machines

### Fan

An eight-direction powered airflow machine with a widening 28-cell cone.

- Wind speed: 1-20, default 7.
- Power load: 50.
- Produces airflow only while powered and leaves decaying residual air.

### Heater

An eight-direction powered machine that drives a 28-cell cone toward its target
temperature and launches Heat Rays along the centreline.

- Temperature: 0-4000 C, default 2000 C.
- Power load: 100.
- Remains inactive without power.

### Cooler

The cold counterpart to Heater, driving a 28-cell cone toward its target and
launching Cold Rays along the centreline.

- Temperature: -60 to 20 C, default -60 C.
- Power load: 100.
- Remains inactive without power.

## Storage Machines

All storage bins are always active, hold one material type, accept material
through their rear intake, and hold up to 500 particles. Purge clears a bin so
it can accept another material.

### Powder Storage Bin

Accepts powder-category materials and feeds compatible connected Tubing.

### Liquid Storage Bin

Accepts liquid-category materials, including molten metals, and feeds Tubing.

### Gas Storage Bin

Accepts non-flaming gases and feeds Tubing.

## Transfer Machines

### Vent

Receives one material through Tubing and releases it below into the canvas.

- Release rate: 1-100 particles/s, default 10 particles/s.
- Release switch: enabled by default; disabled mode retains up to 100 particles.
- Connected Tubing flow caps the effective release rate.

### Mixer

Has two independent 500-particle inputs and a 1000-particle output.

- Input rate: 5 particles/s per input, 10 particles/s combined maximum.
- Output rate: 8 particles/s while release is enabled.
- Release switch: disabled mode retains output up to 1000 particles.
- Purge input A and input B independently.
- Documented recipes become one full-width result stream immediately.
- Non-mixing materials remain separate columns and release alternately.
- A mixed result owns output until drained; unmatched source material remains in
  its input bin instead of appearing beside the result.
- Tubing anywhere touching the invisible 64px icon footprint is accepted. Left
  contacts map to input A and right contacts map to input B.
- The icon is symmetric, includes matching tubing connections, and is rotated
  90 degrees counterclockwise.

See [`MIXER_MIXTURES.md`](../MIXER_MIXTURES.md) for recipes and lifecycle rules.

## Connection Material

### Tubing

Dense non-conductive material carrying stored contents between compatible bins,
Vents, and Mixer inputs. Ordinary storage tubing capacity is 10 particles/s per
cell of narrowest cross-section; Mixer inputs are capped at 5 particles/s each.

## Shared Rules

- Directional machines are aimed by dragging during placement; previews show the
  facing direction and effects.
- Clicking a machine opens its settings or inventory dialog.
- Machine state persists in local Resume Game saves and portable LZString saves.
