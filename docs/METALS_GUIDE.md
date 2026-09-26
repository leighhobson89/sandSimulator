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
| Copper | Transfers heat; joins the fast thermal network. | Conducts logical current from a charged Battery route and draws charge from it. | A strong wire for carrying current from a Battery to a machine. Copper has a higher per-cell power load than Iron, so long Copper runs drain the Battery faster. |
| Elec | Copper-like solid wire with stronger heat transfer and a faster fast-network rate than Copper; melts into Molten Copper at `1085 C`. | High-purity copper wire with stronger electrical conductivity than Copper; reach `2`; load `0.35` per cell. | Electrical machine connector and a low-load conductor. Elec can rust into Corrosion powder, but its exposure threshold is four times Copper's. |
| Iron | Transfers heat; joins the fast thermal network. | Conducts logical current from a charged Battery route and draws charge from it. | A lower-load wire for powered devices and mixed Copper/Iron/Stainless Steel networks. |
| Stainless Steel | Transfers heat more slowly than Iron through ordinary contact. | Conducts logical current from a connected charged Battery and can draw from it. | A rust-resistant wire with Iron's per-cell load and two-cell reach. Traveling-spark animation does not affect logical power. |
| Battery | Transfers heat; joins the fast thermal network. | Stores charge shared across connected Battery cells. | Apply Sparks to charge it, then connect it to Copper, Iron, Stainless Steel, or Elec to provide continuous DC current to the route. |
| Tubing | Has zero ordinary conductivity, but its `thermalNetworkRate` lets it move heat through the fast thermal network. | Does not conduct electrical power. | Carries stored materials between compatible storage, Mixer, Sprinkler, Collector, and Splitter ports; it is not a wire. |

The Copper, Elec, Iron, Stainless Steel, and Battery heat and electrical values
are independent; neither property can be inferred from the other. Elec is a
copper-based wire with higher heat and electrical conductivity than ordinary
Copper. Its `thermalNetworkRate` is `0.3`, its electrical conductivity is `2`,
and its power load is `0.35` per cell. Stainless Steel
has lower nonzero heat and electrical conductivity than Iron and does not join
the fast thermal network. Tubing is a useful example of the distinction: it
has no ordinary thermal conductivity and no electrical conductivity, but it
still moves heat through the separate fast thermal network. The network can
carry heat between connected conductors or into enclosed air.

Picker grouping describes where a player finds a material, not its physical
category. Battery remains a conductive storage metal, but Battery, Spark,
Spark Dust, and Spark Block are listed in the Electricals picker group so the
charge reservoir and its Spark sources are together.

## Build a powered setup

Battery is the charge reservoir. Each Spark applied to connected Battery adds
charge shared across the Battery mass. Newly placed Battery touching charged
Battery equalizes its charge with that connected store. A visible Spark from a
charged Battery is only an effect; it does not refill or drain the reservoir.

Connect Copper, Iron, Stainless Steel, or Elec from a charged Battery to a
machine. A wire route that reaches a charged Battery is logically ON and
provides continuous DC current while the Battery retains charge and the route
remains connected. Copper, Iron, Stainless Steel, and Elec draw charge from the
shared Battery store; Copper uses `1` power per cell, Iron and Stainless Steel
use `0.5`, and Elec uses `0.35`. Stainless Steel's two-cell wire reach lets it
bridge the same short empty gaps as Copper and Iron. Traveling Sparks over a
wire route are a cosmetic animation only; they do not determine whether the
wire or connected machine is logically on. Battery depletion or a broken route
turns logical power off immediately even if a visible spark trail remains.

Fan, Heater, and Cooler are metal-bodied powered machines. The Fan blows a
directional cone of air; Heater and Cooler affect a directional cone and launch
Heat Rays or Cold Rays while they have logical current. Connect them to a
charged Battery through Copper, Iron, Stainless Steel, or Elec. Machines and storage bins do
not rust from water contact or saturated air; their metal bodies still retain
their heat and electrical behavior where applicable. Stainless Steel also does
not rust from Water or humid air, while remaining part of a Battery-backed
logical-current route.

## Electrical machines

Simple Switch and Lamp are in the Electricals picker group. Both have a
persisted ON/OFF setting that starts ON. Their electrical ports use Elec
connectors with a forced two-cell lead width and a 2px visible stub. The ports
accept Copper, Iron, Elec, Stainless Steel, and other compatible conductive
wires. The port markers remain red when disconnected and green when connected.

Simple Switch has one input and one output. When ON, it relays logical current
from the input to the output; when OFF, it blocks current immediately. It does
not generate current. Lamp has one input and emits a warm yellow glow only when
it is ON and its logical input is ON. OFF blocks the input and extinguishes the
glow. Its load is `1` per tick, less than one tenth of Heater's `100`. Traveling
yellow zig-zag Sparks are a visual layer only.

Temperature Switch and Humidity Switch also appear in Electricals. Each has an
electrical input and output and passes logical input current only when its
selected comparison is true. Each averages available air among five exposed
probes across the top sensor face; no air in any probe blocks the logical
output. Temperature uses degrees Celsius and Humidity uses the 0 to 100 percent
scale. Both settings dialogs offer `<`, `<=`, `==`, `>=`, and `>` comparisons
with fractional numeric thresholds. Defaults are `>= 20 C` and `>= 50%`. Their
settings and current reading/comparison/input-current/passing status are
available in the settings dialog and hover tooltip. Only true comparison plus
logical input current is green; every non-passing state is red. The ready state
uses `RULE TRUE · NO INPUT CURRENT`. Sensor settings persist in world saves and
blueprints. See
[Game Mechanics](GAME_MECHANICS.md#3-powered-storage-transfer-and-connection-machines)
and the [machine construction standard](MACHINE_CONSTRUCTION_STANDARDS.md).

Tubing has a different job. Join its cells edge to edge between compatible
machine ports to transport stored materials. Storage bins, Mixer, Sprinkler,
Collector, and Splitter use Tubing for their declared inputs and outputs.
Tubing does not carry electrical current, so it cannot replace Copper, Iron,
Stainless Steel, or Elec in a power grid. It does conduct heat along the fast
thermal network despite its zero ordinary conductivity.

## Melting and cooling back to solids

Heat-driven changes bank latent heat after a material passes its threshold, so
crossing a melting temperature does not always transform it immediately.
Cooling back into a solid also requires support beneath the molten material.

| Solid | Melts into | Melting point | Supported return path |
| --- | --- | ---: | --- |
| Copper | Molten Copper | `1085 C` | Molten Copper becomes Copper at `1085 C` when supported. |
| Elec | Molten Copper | `1085 C` | It cools back as Copper, not as Elec. |
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
counter reaches `360`, the original metal cell turns into Corrosion powder.
Elec's `corrosionResistance: 4` raises its threshold to `1440` exposure counts,
four times Copper's requirement.
The powder falls if unsupported, so rust can leave a gap in a wire or other
metal structure instead of forming a coating. This rule includes Copper, Elec,
Battery, Iron, and Tubing. Stainless Steel does not rust from Water or humid air.
All machine bodies, including storage bins, and molten forms are excluded from
this metal-exposure counter.

To protect a metal structure, keep Water from touching it and prevent nearby
air from staying saturated. Use the Humidity visualization to inspect local
air; the Base Humidity setting is a slow outside-air target and does not
directly replace local humidity. For the exact exposure rule and persistence
details, see [Game Mechanics: Corrosion and persistence](GAME_MECHANICS.md#7-seeds-plants-humidity-dewpoint-weather-and-corrosion).
