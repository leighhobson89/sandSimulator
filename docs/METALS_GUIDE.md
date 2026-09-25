# Metals Guide

This guide explains what metal materials do, how to use them for heat and
electrical systems, and how to keep them from rusting away.

## Heat and electricity are separate

The simulator tracks heat transfer and electrical power with different
properties. `conductivity` controls ordinary heat exchange between touching
materials. `electricalConductivity` controls participation in electrical
networks. A material can transfer heat without carrying power, or take part in
a special heat network without ordinary heat conductivity.

| Material | Heat behavior | Electrical behavior | Useful role |
| --- | --- | --- | --- |
| Copper | Transfers heat; joins the fast thermal network. | Conducts power and can draw charge from a touching Battery. | A strong wire for carrying power from a Battery to a machine. Copper has a higher per-cell power load than Iron, so long Copper runs drain the Battery faster. |
| Iron | Transfers heat; joins the fast thermal network. | Conducts power and can draw charge from a touching Battery. | A lower-load wire for powered devices and mixed Copper/Iron/Stainless Steel networks. |
| Stainless Steel | Transfers heat more slowly than Iron through ordinary contact. | Carries power pulses more slowly than Iron and can draw from a touching Battery. | A slower, rust-resistant wire with Iron's per-cell load. |
| Battery | Transfers heat; joins the fast thermal network. | Stores charge shared across connected Battery cells. | Apply Sparks to charge it, then connect it to Copper, Iron, or Stainless Steel to feed the power network. |
| Tubing | Has zero ordinary conductivity, but its `thermalNetworkRate` lets it move heat through the fast thermal network. | Does not conduct electrical power. | Carries stored materials between compatible storage, Mixer, and Vent connections; it is not a wire. |

The Copper, Iron, Stainless Steel, and Battery heat and electrical values are
independent; neither property can be inferred from the other. Stainless Steel
has lower nonzero heat and electrical conductivity than Iron and does not join
the fast thermal network. Tubing is a useful example of the distinction: it
has no ordinary thermal conductivity and no electrical conductivity, but it
still moves heat through the separate fast thermal network. The network can
carry heat between connected conductors or into enclosed air.

## Build a powered setup

Battery is the charge reservoir. Each Spark applied to connected Battery adds
charge shared across the Battery mass. Newly placed Battery touching charged
Battery equalizes its charge with that connected store. A visible Spark from a
charged Battery is only an effect; it does not refill or drain the reservoir.

Connect Copper, Iron, or Stainless Steel from the Battery to a powered machine.
A Spark touching the connected metal is absorbed and sends a visible power
pulse through the connected network. Copper, Iron, and Stainless Steel can
draw charge from Battery and keep carrying pulses until the reservoir empties.
Copper uses `1` power per cell; Iron and Stainless Steel use `0.5` per cell.
Stainless Steel's lower electrical conductivity makes its pulses travel more
slowly than Iron's. Its two-cell wire reach lets it bridge the same short empty
gaps as Copper and Iron. The load of every connected device is drawn from the
shared Battery store.

Fan, Heater, and Cooler are metal-bodied powered machines. The Fan blows a
directional cone of air; Heater and Cooler affect a directional cone and launch
Heat Rays or Cold Rays while they have power. Connect them to a charged Battery
through Copper, Iron, or Stainless Steel. Machines and storage bins do not rust
from water contact or saturated air; their metal bodies still retain their heat and electrical
behavior where applicable. Stainless Steel also does not rust from Water or
humid air, while still carrying heat and electrical pulses more slowly than
Iron.

Tubing has a different job. Join its cells edge to edge between a compatible
storage bin or Mixer and a Vent to transport stored materials. Tubing does not
carry electrical pulses, so it cannot replace Copper, Iron, or Stainless Steel
in a power grid. It does conduct heat along the fast thermal network despite
its zero ordinary conductivity.

## Melting and cooling back to solids

Heat-driven changes bank latent heat after a material passes its threshold, so
crossing a melting temperature does not always transform it immediately.
Cooling back into a solid also requires support beneath the molten material.

| Solid | Melts into | Melting point | Supported return path |
| --- | --- | ---: | --- |
| Copper | Molten Copper | `1085 C` | Molten Copper becomes Copper at `1085 C` when supported. |
| Battery | Molten Aluminum | `660 C` | Molten Aluminum becomes Battery at `660 C` when supported. |
| Iron | Molten Iron | `1538 C` | Molten Iron becomes Iron at `1538 C` when supported. |
| Tubing | Molten Iron | `1538 C` | It cools as Iron, not back into Tubing. |
| Fan and Cooler | Molten Iron | `1538 C` | They cool as Iron, not back into a machine. |
| Heater | Molten Iron | `10000 C` | It cools as Iron, not back into a machine. |

Molten metal flows as a liquid until it cools to its configured freeze point
and has support. For the individual heat and phase-change rules, see the
[Game Mechanics heat and phase-change reference](GAME_MECHANICS.md#2-material-behavior-quick-reference).

## Water contact and saturated-air rust

Non-machine solid metal materials rust after sustained exposure to either:

- Water touching one of the metal cell's four cardinal sides; or
- adjacent air with local humidity of at least `98%`.

Direct Water contact can rust a metal even inside a sealed, otherwise dry
space; diagonal Water contact does not count. Each metal cell checks exposure
once every four simulation frames. A qualifying check adds `1` to its exposure
counter, while a check without either exposure condition removes `2`. Once the
counter reaches `120`, the original metal cell turns into Corrosion powder.
The powder falls if unsupported, so rust can leave a gap in a wire or other
metal structure instead of forming a coating. This rule includes Copper,
Battery, Iron, and Tubing. Stainless Steel does not rust from Water or humid air.
All machine bodies, including storage bins, and molten forms are excluded from
this metal-exposure counter.

To protect a metal structure, keep Water from touching it and prevent nearby
air from staying saturated. Use the Humidity visualization to inspect local
air; the Base Humidity setting is a slow outside-air target and does not
directly replace local humidity. For the exact exposure rule and persistence
details, see [Game Mechanics: Corrosion and persistence](GAME_MECHANICS.md#7-seeds-plants-humidity-dewpoint-weather-and-corrosion).
