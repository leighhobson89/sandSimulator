# Plant Growers Handbook

This guide explains how to set up humidity and soil moisture, how growing
plants change local humidity, and the conditions checked for each seed. The
numeric thresholds come from `particles.json` and the seed and plant rules in
`physics.js`.

## Set humidity and prepare a planting site

Use the **Humidity** slider in Environment to set **Base Humidity** from `0%`
to `100%` (default `50%`). It is the slow return target for exposed outside air;
it does not set every cell to that value. Humidity diffuses between nearby air
cells, so a sheltered room retains local conditions longer. Choose the Humidity
visualization in Visualizations to inspect the actual local values around a
seed.

For germination, the local humidity at the seed must reach its species'
minimum. Setting Base Humidity at or above that threshold gives exposed air a
suitable starting target, but nearby sources and sinks can shift the local
reading. Water above freezing, Steam, Cloud, and living plants add moisture to
neighboring air. Sand and Dry Mud remove some. Several plants together create a
stronger humid pocket than one isolated plant. A Cloud heated above `100 C`
evaporates and restores up to `12` humidity points to nearby air. Since local
humidity is capped at `100%`, the actual increase can be smaller when the air is
already humid.

Air humidity and root moisture are separate checks. A high Humidity setting
does not make dry Sand into Wet Sand or give a seed a wet substrate. Use the
listed wet ground or water, then make sure the air around it reaches the
humidity threshold. Water Grass / Lily Seeds also need nearby open water.

## Seed requirements

Temperature is checked on the seed cell. The temperature and humidity values
below are **minimums**; seed definitions do not set a maximum germination
temperature. Local humidity is checked near the seed. The substrate and any
extra water depth are separate requirements. Germination is probabilistic, so
meeting every condition can still take time. Seeds ignite above `130 C` and
become Fire for `20` frames.

| Seed | Minimum temperature | Minimum local humidity | Substrate and additional conditions |
| --- | ---: | ---: | --- |
| Grass Seeds | `5 C` | `25%` | Wet Mud, Wet Sand, or Wet Ash. Wet Mud gives the resulting Grass a richer-soil growth bonus. |
| Moss Spores | `0 C` | `78%` | Wood, Stone, Wet Sand, Wet Mud, or Wet Ash close to the spores; the nearby substrate must also be moist enough. |
| Daffodil Seeds | `2 C` | `35%` | Wet Mud or Wet Sand. |
| Red Tulip Seeds | `4 C` | `38%` | Wet Mud or Wet Sand. |
| Geranium Seeds | `8 C` | `28%` | Wet Mud or Wet Sand. |
| Blue Flower Seeds | `3 C` | `30%` | Wet Sand or Wet Ash. |
| Banana Seeds | `18 C` | `75%` | Wet Mud or Water. |
| Water Grass / Lily Seeds | `8 C` | `65%` | Wet Mud and nearby open water. At three or more water cells of depth, growth takes the submerged aquatic form. |

## Help plants raise local humidity

Plants add moisture as the humidity field updates. The configured
`humidityContribution` is a relative source strength, not an immediate
percentage-point jump; the humidity field applies it gradually to adjacent air
and diffuses that moisture. Larger values give the species a stronger local
effect.

| Growing species | Humidity contribution strength |
| --- | ---: |
| Grass | `0.25` |
| Moss | `0.8` |
| Daffodil | `0.2` |
| Red Tulip | `0.2` |
| Geranium | `0.24` |
| Blue Flower | `0.22` |
| Banana Plant | `0.55` |
| Water Grass | `0.75` |

To build a humid planting area, start with a Base Humidity near the seed's
minimum, provide its required damp ground or water, and plant clusters of
moisture-producing species nearby. Water and Steam also supply humidity. If a
patch stays too dry, check the Humidity visualization for dry Sand or Dry Mud
nearby, add a suitable moisture source, or raise Base Humidity. Keep the soil
wet even when the air looks humid.

## Conditions for established plants

After sprouting, each plant species has a thriving temperature and humidity
range plus a root-zone moisture need. The plant must meet all three to grow and
recover well. A plant can survive in a wider climate band, but growth slows or
stops; prolonged unsuitable conditions can wither it into Dry Mud. These are
plant health ranges, not upper germination limits for seeds.

| Plant | Thriving temperature | Thriving humidity | Growing note |
| --- | ---: | ---: | --- |
| Grass | `5-34 C` | `25-95%` | Wet Mud is richer and improves growth and health. |
| Moss | `0-30 C` | `68-100%` | Damp Wood, Stone, Wet Sand, Wet Mud, or Wet Ash supports it. |
| Daffodil | `2-30 C` | `35-92%` | Grows on damp soil and flowers at maturity. |
| Red Tulip | `4-28 C` | `38-92%` | Grows on damp soil and flowers at maturity. |
| Geranium | `10-38 C` | `28-88%` | Grows on damp soil and branches into flower clusters. |
| Blue Flower | `3-29 C` | `30-96%` | Grows on Wet Sand or Wet Ash. |
| Banana Plant | `18-42 C` | `76-100%` | Needs wet roots; nearby Water can satisfy the root moisture check. Mature height is `14-32` cells. |
| Water Grass | `8-36 C` | `65-100%` | Needs nearby open water and forms a submerged stem, surface pads, and blooms. |

The plant's health reflects how well it is doing. Only thriving, sufficiently
healthy plants reproduce. For exact reaction rules and humidity/weather
behavior, see the [Game Mechanics reference](GAME_MECHANICS.md#7-seeds-plants-humidity-dewpoint-weather-and-corrosion).
