// Campaign rules are data driven so later story missions can be added without
// changing the simulation loop or the sandbox's material catalogue.
import {
    getDefinitions, getWorld,
    setMaterialTransitionListener, setPlantGrowthCompletionListener, setSimulationStepListener
} from './physics.js';

// BEGIN GENERATED MISSION DATA
const MISSION_DEFINITIONS = Object.freeze([
    {
        "id": "first-thaw",
        "number": 1,
        "title": "The First Daffodil",
        "briefing": "Turn the sandy basin into a living habitat. Place the dry mud, use the field water, and grow a daffodil from one of the supplied seeds.",
        "world": { "cols": 260, "rows": 150 },
        "startingLayout": { "type": "floor", "material": "Sand", "rows": 5 },
        "resourceBudgets": { "materials": { "Dry Mud": 100, "Water": 1000, "Daffodil Seeds": 5 }, "machines": {} },
        "environment": {
            "temperature": 14, "humidity": 68, "illumination": 65, "dewpoint": 10,
            "ambientWindOn": false, "windStrength": 0, "gustWindStrength": 0
        },
        "lockedControls": ["temperature", "humidity", "illumination", "dewpoint", "wind"],
        "startSelection": { "material": "Water", "drawMode": "brush" },
        "unlockedTools": ["brush"],
        "visualizationModes": ["normal", "heat", "humidity", "wind"],
        "objectives": [{
            "id": "grow-daffodil", "type": "transformation", "from": "Daffodil Seeds", "to": "Daffodil",
            "target": 1, "label": "Grow one Daffodil from seed."
        }],
        "events": [{
            "id": "daffodil-grown",
            "when": { "type": "objective-complete", "objectiveId": "grow-daffodil" },
            "message": "The first daffodil has taken root."
        }]
    },
    {
        "id": "ice-banana",
        "number": 2,
        "title": "The Icebound Grove",
        "briefing": "Thaw the frozen ground, prepare a warm and humid growing climate, and bring a Banana Plant to life.",
        "guidance": "Use the Temperature slider in World Parameters to warm the five-layer Ice bed until it melts into Water. Banana grows best at 30°C and 95% humidity; set those with the Temperature and Humidity sliders, then use the Ambient Light slider to reach the mission target of 85%. Add up to 500 Dry Mud to the Water to make Wet Mud, then plant a Banana Seed in the wet soil.",
        "world": { "cols": 260, "rows": 150 },
        "startingLayout": { "type": "floor", "material": "Ice", "rows": 5 },
        "resourceBudgets": { "materials": { "Dry Mud": 500, "Banana Seeds": 5 }, "machines": {} },
        "environment": {
            "temperature": -10, "humidity": 35, "illumination": 10, "dewpoint": -15,
            "ambientWindOn": false, "windStrength": 0, "gustWindStrength": 0
        },
        "environmentTargets": { "temperature": 30, "humidity": 95, "illumination": 85 },
        "controlLimits": { "temperature": { "max": 30 } },
        "lockedControls": ["dewpoint", "wind"],
        "startSelection": { "material": "Dry Mud", "drawMode": "brush" },
        "unlockedTools": ["brush"],
        "visualizationModes": ["normal", "heat", "humidity", "wind"],
        "objectives": [
            { "id": "melt-ice", "type": "transformation", "from": "Ice", "to": "Water", "target": 1, "label": "Melt Ice into Water." },
            { "id": "warm-grove", "type": "environment-target", "target": 1, "label": "Reach 30°C, 95% humidity, and 85% illumination." },
            { "id": "wet-mud", "type": "transformation", "from": "Dry Mud", "to": "Wet Mud", "target": 1, "label": "Turn Dry Mud into Wet Mud." },
            { "id": "grow-banana", "type": "transformation", "from": "Banana Seeds", "to": "Banana Plant", "target": 1, "label": "Grow one Banana Plant from seed." }
        ],
        "events": [
            { "id": "ice-melted", "when": { "type": "objective-complete", "objectiveId": "melt-ice" }, "message": "The ice is melting into water." },
            { "id": "grove-warmed", "when": { "type": "objective-complete", "objectiveId": "warm-grove" }, "message": "The grove has reached its growing climate." },
            { "id": "mud-wetted", "when": { "type": "objective-complete", "objectiveId": "wet-mud" }, "message": "The soil is ready for planting." },
            { "id": "banana-grown", "when": { "type": "objective-complete", "objectiveId": "grow-banana" }, "message": "The Icebound Grove is alive with a Banana Plant." }
        ]
    },
    {
        "id": "three-states",
        "number": 3,
        "title": "The Basin in Three States",
        "briefing": "Start with a blank basin. Build dry Sand, Dry Mud, and Ash piles, bring in Cloud, and make rain. Dry 150 cells of each pile in any order, then use 350 \u00B0C to turn Sand into 200 Glass. That unlocks 2,000 \u00B0C for the Lava stage, where 150 Glass, Dry Mud, and Ash cells become Lava.",
        "guidance": "Place at least 500 cells each of Sand, Dry Mud, and Ash. Cloud becomes available when all three piles are placed. Place 500 Cloud, then set Humidity to 95% and Dewpoint to 20 \u00B0C. The humid air will form rain from Cloud. Let 150 cells of each pile get wet, then raise Temperature to 150 \u00B0C and dry 150 Sand, Dry Mud, and Ash cells in any order. Drying 150 Ash cells unlocks a 350 \u00B0C limit; any remaining drying can continue in any order. Raise Temperature to 350 \u00B0C and form 200 Glass from Sand; this unlocks the 2,000 \u00B0C limit. Then heat to 2,000 \u00B0C to turn 150 Glass, Dry Mud, and Ash cells into Lava.",
        "world": { "cols": 260, "rows": 150 },
        "startingLayout": { "type": "blank" },
        "resourceBudgets": { "materials": { "Sand": 5000, "Dry Mud": 5000, "Ash": 5000, "Cloud": 8000 }, "machines": {} },
        "initiallyAvailableMaterials": ["Sand", "Dry Mud", "Ash"],
        "environment": {
            "temperature": 25, "humidity": 40, "illumination": 50, "dewpoint": 10,
            "ambientWindOn": false, "windStrength": 0, "gustWindStrength": 0
        },
        "controlLimits": { "temperature": { "min": -60, "max": 150 } },
        "lockedControls": ["humidity", "dewpoint", "illumination", "wind"],
        "startSelection": { "material": "Sand", "drawMode": "brush" },
        "unlockedTools": ["brush"],
        "visualizationModes": ["normal", "heat", "humidity"],
        "objectives": [
            { "id": "place-sand", "type": "material-placement", "material": "Sand", "target": 500, "label": "Place 500 Sand cells to build the first dry pile." },
            { "id": "place-dry-mud", "type": "material-placement", "material": "Dry Mud", "target": 500, "label": "Place 500 Dry Mud cells to build the second dry pile." },
            { "id": "place-ash", "type": "material-placement", "material": "Ash", "target": 500, "label": "Place 500 Ash cells to build the third dry pile." },
            { "id": "place-steam", "type": "material-placement", "material": "Cloud", "target": 500, "requires": ["place-sand", "place-dry-mud", "place-ash"], "unlocks": { "controls": ["humidity", "dewpoint"] }, "label": "Place Cloud above the piles to add moisture to the air." },
            { "id": "make-rain", "type": "environment-target", "target": 1, "targetValues": { "humidity": 95, "dewpoint": 20 }, "requires": ["place-steam"], "label": "Set Humidity to 95% and Dewpoint to 20 °C to make rain." },
            { "id": "wet-sand", "type": "transformation", "from": "Sand", "to": "Wet Sand", "target": 150, "requires": ["make-rain"], "label": "Let rain wet 150 Sand cells." },
            { "id": "wet-mud", "type": "transformation", "from": "Dry Mud", "to": "Wet Mud", "target": 150, "requires": ["make-rain"], "label": "Let rain wet 150 Dry Mud cells." },
            { "id": "wet-ash", "type": "transformation", "from": "Ash", "to": "Wet Ash", "target": 150, "requires": ["make-rain"], "label": "Let rain wet 150 Ash cells." },
            { "id": "set-drying-temperature", "type": "environment-target", "target": 1, "targetValues": { "temperature": 150 }, "requires": ["wet-sand", "wet-mud", "wet-ash"], "label": "Raise Temperature to the 150 °C limit to dry the piles." },
            { "id": "dry-sand", "type": "transformation", "from": "Wet Sand", "to": "Sand", "target": 150, "requires": ["wet-sand", "set-drying-temperature"], "label": "Dry 150 Wet Sand cells back into Sand." },
            { "id": "dry-mud", "type": "transformation", "from": "Wet Mud", "to": "Dry Mud", "target": 150, "requires": ["wet-mud", "set-drying-temperature"], "label": "Dry 150 Wet Mud cells back into Dry Mud." },
            { "id": "dry-ash", "type": "transformation", "from": "Wet Ash", "to": "Ash", "target": 150, "requires": ["wet-ash", "set-drying-temperature"], "unlocks": { "controlLimits": { "temperature": { "max": 350 } } }, "label": "Dry 150 Wet Ash cells; this unlocks the 350 °C glass stage." },
            { "id": "set-glass-temperature", "type": "environment-target", "target": 1, "targetValues": { "temperature": 350 }, "requires": ["dry-ash"], "label": "Raise Temperature to 350 °C to melt Sand into Glass." },
            { "id": "melt-sand-to-glass", "type": "transformation", "from": "Sand", "to": "Glass", "target": 200, "requires": ["set-glass-temperature"], "unlocks": { "controlLimits": { "temperature": { "max": 2000 } } }, "label": "Form 200 Glass from Sand; this unlocks the 2,000 °C Lava stage." },
            { "id": "set-lava-temperature", "type": "environment-target", "target": 1, "targetValues": { "temperature": 2000 }, "requires": ["melt-sand-to-glass"], "label": "Raise Temperature to 2,000 °C." },
            { "id": "melt-glass-to-lava", "type": "transformation", "from": "Glass", "to": "Lava", "target": 150, "requires": ["set-lava-temperature", "melt-sand-to-glass"], "label": "Heat 150 Glass cells until they melt into Lava." },
            { "id": "melt-dry-mud-to-lava", "type": "transformation", "from": "Dry Mud", "to": "Lava", "target": 150, "requires": ["set-lava-temperature", "dry-mud"], "label": "Melt 150 Dry Mud cells into Lava." },
            { "id": "melt-ash-to-lava", "type": "transformation", "from": "Ash", "to": "Lava", "target": 150, "requires": ["set-lava-temperature", "dry-ash"], "label": "Melt 150 Ash cells into Lava." }
        ],
        "events": [
            { "id": "steam-placed", "when": { "type": "objective-complete", "objectiveId": "place-steam" }, "message": "Cloud has opened the Humidity and Dewpoint controls. Set Humidity to 95% and Dewpoint to 20 °C to make rain." },
            { "id": "rain-started", "when": { "type": "objective-complete", "objectiveId": "make-rain" }, "message": "At 95% Humidity and a 20 °C Dewpoint, the humid air forms rain from Cloud." },
            { "id": "drying-temperature-ready", "when": { "type": "objective-complete", "objectiveId": "set-drying-temperature" }, "message": "At the 150 °C limit, the wet piles can now dry out." },
            { "id": "glass-heat-unlocked", "when": { "type": "objective-complete", "objectiveId": "dry-ash" }, "message": "Ash is dry, unlocking the 350 °C limit for Glass. Dry any remaining Sand or Mud in either order." },
            { "id": "glass-formed", "when": { "type": "objective-complete", "objectiveId": "melt-sand-to-glass" }, "message": "You formed 200 Glass. The Temperature control now reaches 2,000 °C for the Lava stage." },
            { "id": "lava-temperature-ready", "when": { "type": "objective-complete", "objectiveId": "set-lava-temperature" }, "message": "At 2,000 °C, Glass, Dry Mud, and Ash can become Lava. Dry Mud melts above 1,200 °C." }
        ]
    },
    {
        "id": "meltwater-garden",
        "number": 4,
        "title": "The Meltwater Garden",
        "briefing": "A dry Mud basin has no Water supply, but Snow and Red Tulip Seeds are available. Recover the garden by turning Snow into soil moisture.",
        "guidance": "Place Snow above the Dry Mud and let it thaw into Water. Give the meltwater time to wet at least 100 Dry Mud cells, then plant a Red Tulip Seed in the damp ground. Temperature is the only climate control you can change.",
        "world": {
            "cols": 260,
            "rows": 150
        },
        "startingLayout": {
            "type": "floor",
            "material": "Dry Mud",
            "rows": 5
        },
        "resourceBudgets": {
            "materials": {
                "Snow": 500,
                "Red Tulip Seeds": 5
            },
            "machines": {}
        },
        "initiallyAvailableMaterials": [
            "Snow",
            "Red Tulip Seeds"
        ],
        "environment": {
            "temperature": -10,
            "humidity": 72,
            "illumination": 70,
            "dewpoint": 10,
            "ambientWindOn": false,
            "windStrength": 0,
            "gustWindStrength": 0
        },
        "controlLimits": {
            "temperature": {
                "max": 8
            }
        },
        "lockedControls": [
            "humidity",
            "illumination",
            "dewpoint",
            "wind"
        ],
        "startSelection": {
            "material": "Snow",
            "drawMode": "brush"
        },
        "unlockedTools": [
            "brush"
        ],
        "visualizationModes": [
            "normal",
            "heat",
            "humidity"
        ],
        "objectives": [
            {
                "id": "melt-snow",
                "type": "transformation",
                "from": "Snow",
                "to": "Water",
                "target": 150,
                "label": "Melt 150 Snow cells into Water."
            },
            {
                "id": "wet-garden",
                "type": "transformation",
                "from": "Dry Mud",
                "to": "Wet Mud",
                "target": 100,
                "label": "Let the meltwater wet 100 Dry Mud cells."
            },
            {
                "id": "grow-tulip",
                "type": "transformation",
                "from": "Red Tulip Seeds",
                "to": "Red Tulip",
                "target": 1,
                "label": "Grow one Red Tulip from the supplied seed."
            }
        ],
        "events": [
            {
                "id": "snow-melted",
                "when": {
                    "type": "objective-complete",
                    "objectiveId": "melt-snow"
                },
                "message": "The Snow is now a source of Water. Give it time to soak into the Dry Mud."
            },
            {
                "id": "garden-wet",
                "when": {
                    "type": "objective-complete",
                    "objectiveId": "wet-garden"
                },
                "message": "The planting ground is damp. The Red Tulip Seed can now take root."
            },
            {
                "id": "tulip-grown",
                "when": {
                    "type": "objective-complete",
                    "objectiveId": "grow-tulip"
                },
                "message": "The meltwater has brought the garden back to life."
            }
        ]
    },
    {
        "id": "moisture-in-motion",
        "number": 5,
        "title": "Moisture in Motion",
        "briefing": "The upper soil holds the last usable moisture while Sand beneath it is dry. Move that stored water through the atmosphere, recover it as snowfall, and return it to the soil.",
        "guidance": "The exposed Wet Sand strip sits above the Sand catch bed. Heat the air to 150 degrees C to dry the strip and release its stored moisture into the air. Once drying is complete, Dewpoint unlocks. Keep Humidity at 95%, set Dewpoint to 20 degrees C, then cool the air to -10 degrees C. Cloud forms naturally in the humid upper air and precipitates as Snow while the atmosphere cools; no Cloud supply or budget is needed. Then warm the air to 8 degrees C so the Snow melts and wets the Sand below. The authored Wet Sand is the only placed moisture source; no Water, Steam, Snow, or Cloud is in the loadout.",
        "world": {
            "cols": 260,
            "rows": 150
        },
        "startingSave": "N4IgZg9gTgtghgFxALhAUwDZpmgdguDAWkgFdcATKATxABoQA3NKAZwEsJcUBmB1uMwoBBJKgBMABnEA2IpICcRHpIAqARnXIArJJ3iAdABZx6gFr0QMCBTQoQAygCMIAD0sBjODAAOcdgDm3Mi4pBgY-OwwYYicwaDMbHEo6vw+UOy4ANZYUACyNmgAaiwcXCjiDPAeABaZaAAK0AgAMnDUEKQIJUnlyJXgcLgA6pkUAMpeWCi6DB4QGKwVMpIMUBAA7kvI6rMg3k7seGIAHAwHR-iqcFABaGLi2ucwh8cAEqQw7BTsCLTICie+xelwQAElwp9MrE+ntbBsfBBMghrrd7ilVsDXvhRpQAPLBMCEVhoBgbMYAEXYhBQmLuuBYhFxEwQUDwAQQNVpDACpFYCGZ41Z7M53JA6TQjH8GEyAWZVLZHgQyR2DAlUvYMtwcrGqnYHiyrAASth-LhZRiTpJrQwwFBvGgAMKdfBim726jbUB-Hx2ZDe6i++wAVWRJ2EUA9lgoiDg9mECcTSeTKdTafTGczWezOdzefzBcLReLJdLZfLFcrVerNdrdfrDcbTebLdbbfbHc7Xe7Pd7ff7A8HQ+HI9HY-HE8nU+nM9nc-nC8XS+XK9Xa-XG83W+3O93e-3B8PR+PJ9PZ-PF8vV+vN9vd-vD8fT+fL9fb-fH8-X+-P9-f--AGAUBwEgaBYHgRBkFQdBMGwXB8EIYhSHIShqFoehGGYVh2E4bheH4QRhFEcRJGkWR5EUZRVHUTRtF0fRDGMUxzEsaxbHsRxnFcdxPG8Xx-ECYJQnCSJolieJEmSVJ0kybJcnyQpilKcpKmqWp6kaZpWnaTpul6fpBmGUZxkmaZZnmRZllWdZNm2XZ9kOY5TnOS5rlue5HmeV53k+b5fn+QFgVBcFIWhWF4URZFUXRTFsVxfFCWJUlyUpalaXpRlmVZdlOW5Xl+UFYVRXFSVpVleVFWVVV1U1bVdX1Q1jVNc1LWtW17UdZ1XXdT1vV9f1A2DUNw0jaNY3jRNk1TTFACiRpzQt81LYtK3LWtq0betW2bTt217btB37Udh0ncdZ2nYtG4zQAQsIACKN33Y9D23S9T2vc9n0fd972-W9-1fX9gMAz9INA6DwOQxD0Pg7DYPw1DcOIwjMMo0jqPI5jGPY+juNo-jWN44TBM4yTROk8TlMU9T5O02T9NU3TjMMzTLNM6zzOcxz3Ps7zbP81zfOCwLPMi0LovC5LEvS+Lsti-LUty4rIMgAAvgwCDYD4KABkGqAAGIYBAiA8OIEZRgwMYEPGwgUmCd13Qm1AzTNCZ5DUt22-bjvCM7rvCO7nt2w7Tsu27HsJsHPt++HQfe6H-uB5H8e+2HAcR17Iep4nGdRwnsfJ1nMfp3HRdp0nmfR+Xucp8XFd59nBeV-nJeF1XOel+3TcN3XNdlx3bct-XtfV53Q9913rfN43U896Pg8z8P-fdyPA-T73Y+LxP4+bxvC97+v8+H2vc8n6vK-L7P59X5fS+T3fO-70fp8X-f29b7vz-Xw-H9P2ft-vwPi-G+b9P7-1AX-V+j9j5QN-jAkB0DgE-yAd-QBX8AFgNgSgjBkCEFwKQWg8BiDUGYLwdgiB8DkHoIoQQ0hVCiH4JIbg+hWDqHEJwZQwhrCGHkPYTQphnC6FcLIWwxhHDaHMOESwkRPDRG8LEfw8RAiJGCMkUI9RajNGqO0So3Ryj9FKMMYo4xfDTEKLMfIyxcjrGyNsdw+xMiHHSOcVI1xGidEGJMeY7xVi7GOP8S49xeijEWJsU4txWjgleN8eEoJnjQl+MCZE+JPiwkBIiR4kJqTEkZKiQk2JySskxPSXEopaSkmZOieU3JKTikVLydkgplT8klMKVUnJpT2lNIaXUmpZSOltJafU2p1TOlDL6V01pzTGlTJ6aMwZMzhn9O6SMgZ0zeljMWRM8ZmyNkLL2es+Zhy1lzJOaslZyzZnnKuZcpZky7k7P2Uc05Fz7nbK2bs551yHkfKeWc257yDkvJuW8z5-zQV-NeY845ULfkwpBdC4FPygXfMBV8gFYLYUooxZChFcKkVovBYi1FmK8XYohfC5F6KKUEtJVSol+KSW4vpVi6lxKcWUsJayhl5L2U0qZZyulXKyVssZRy2lzLhUspFTy0VvKxX8vFQKiVgrJVCvVWqzVqrtUqt1cq-VSrDWKuNXy01CqzXystXK61srbXcvtTKh10rnVStdRqnVBqTXmu9Vau1jr-UuvdXqo1FqbVOrdVq4NXrfXhqDZ60NfrA2RvjT6sNAaI0epDamxNGao0JtjcmrNMb01xqLWmpNmbo3ltzSm4tFa83ZoLZW-NJbC1VpzaW9tTaG11prWWjtbaW31trdWztQ6+1dtbc2xtU6e2jsHTO4d-bu0joHdO3tY7F0TvHZujdC693rvnYetdc6T2rpXcu2d56r2XqXZOu9O791HtPRe+926t27ufdeh9H6n1ntve+g9L6b1vs-f+0Df7X2PuPVB39MGQPQeAz+oD37ANfoA2B2DKGMOQYQ3BpDaHwOIdQ5hvD2GIPweQ+hijBHSNUaI-hkjuH6NYeo8RnDlHCOsYY+R9jNGmOcbo1xsjbHGMcdo8x4TLGRM8dE7xsT-HxMCYk4JyTQn1Nqc06p7TKndPKf00pwzinjN8dMwpsz8nLNyes7J2z3H7MyYc9J5zUnXMaZ0wZkz5nvNWbs45-zLn3N6aMxZmzTm3NaeC153z4WguedC35wLkX4s+bCwFiLHmQupcSxlqLCXYvJayzF9LcWitpaS5l6L5XcspeKxVvL2WCuVfyyVwrVWculfa01hrdWatlY621lr9XavVc60NvrXXWvNca1Nnro3BszeG-17rI2BvTd62NxbE3xubY2wtvb635uHbW3Nk7q2VvLdm+dq7l2luTbuzt-bR3TsXfu9trbu3nvXYex9p7Z3bvvYOy9m7b3Pv-dB3917j3jtQ9+zDkH0Pgc-aB99wHX2Adg9hyjjHkOEdw6R2j8HiPUeY7x9jiH8Pkfo4pwT0nVOif45J7j+nWPqfE5x5TwnrOGfk-ZzTpnnO6dc7J2zxnHPafM+FyzkXPPRe87F-z8XAuJeC8l0L9XavNeq+1yr3Xyv9dK8N4r43fPTcK7N-Ly3cvrey9t9z+3MuHfS+d1L13GudcG5N+b73Vu7eO-9y793eujcW5t07t3Wvg9e99+HoPnvQ9+8D5H+PPuw8B4jx7kPqfE8Z6jwn2Pyes8x-T3Hovaek+Z+j+X3PKfi8V7z9ngvlf88l8L1XnPpf29N4b3XmvZeO9t5b-X2v1fO9D77131vzfG9T576PwfM-h-9+7yPgf0-e9j8XxP8fm+N8L73+v+fh+19z5P6vlfy-Z-n6v5fpfk+787-30f0-F-7-b637v5-1+H8f6f2f2-7+B+L+N+b+n+-+oBf+r+j+x+UBv+MBIB0BwBP+QB3+gBX+ABYBsBKBGBkBCBcBSBaB4BiBqBmBeB2BEB8ByB6BFBBBpBVBRB+BJBuB9BWB1BxBOBlBhBrBDB5B7BNBTBnBdBXBZBbBjBHBtBzBwhLBIhPBohvBYh-B4hAhEhghkhQh6hahmhqh2hKhuhyh+hShhhihxhfBphChZh8hlhch1hshth3B9hMhDh0hzhUhrhGhOhBhJh5h3hVhdhjh-hLh7hehRhFhNhThbhWhwRXhvh4RQRnhoRfhgRkR8RPhYRARERHhIRqRiRGRURCRsRyRWRMR6RcRRRaRSRmR0R5RuRKRxRFReR2RBRlR+RJRhRVRORpR7RTRDRdRNRZRHRbRLR9RtR1RnRQxfRXRrRzRjRUxPRoxgxMxwx-R3RIxAx0xvRYxixEx4xmxGxCxex6x8xhxaxcxJxqxKxyxsx5xVxlxSxkxdxOx+xRxpxFx9x2xWxuxzx1xDxHxTxZxtx7xBxLxNxbxnx-xoJfxrxjxxxUJvxMJIJ0JwJPxQJ3xgJXxAJYJsJKJGJkJCJcJSJaJ4JiJqJmJeJ2JEJ8JyJ6JFJBJpJVJRJ+JJJuJ9JWJ1JxJOJlJhJrJDJ5J7JNJTJnJdJXJZJbJjJHJtJzJwpLJIpPJopvJYp-J4pApEpgpkpQp6papmpqp2pKpupyp+pSphpipxpfJppCpZp8plpcp1psptp3J9pMpDp0pzpUprpGpOpBpJp5p3pVpdpjp-pLp7pepRpFpNpTpbpWpwZXpvp4ZQZnpoZfpgZkZ8ZPpYZAZEZHpIZqZiZGZUZCZsZyZWZMZ6ZcZRZaZSZmZ0Z5ZuZKZxZFZeZ2ZBZlZ+ZJZhZVZOZpZ7ZTZDZdZNZZZHZbZLZ9ZtZ1ZnZQ5fZXZrZzZjZU5PZo5g5M5w5-Z3ZI5A505vZY5i5E545m5G5C5e56585h5a5c5J5q5K5y5s555V5l5S5k5d5O5+5R5p5F59525W5u5z515D5H5T5Z5t575B5L5N5b5n5-5oFf5r5j5x5UFv5MFIF0FwFP5QF35gFX5AFYFsFKFGFkFCFcFSFaF4FiFqFmFeF2FEF8FyF6FFFBFpFVFRF+FJFuF9FWF1FxFOFlFhFrFDF5F7FNFTFnFdFXFZFbFjFHFtFzFwlLFIlPFolvFYl-F4lAlElglklQl6lalmlql2lKlulyl+lSlhlilxlfFplClZl8lllcl1lsltl3F9lMlDl0lzlUlrlGlOlBlJl5l3lVldljl-lLl7lelRlFlNlTlblWlwVXlvl4VQVnloVflgVkV8VPlYVAVEVHlIVqViVGVUVCVsVyVWVMV6VcVRVaVSVmV0V5VuVKVxVFVeV2VBVlV+VJVhVVVOVpV7VTVDVdVNVZVHVbVLV9VtV1VnVQ1fVXVrVzVjVU1PVo1g1M1w1-V3VI1A101vVY1i1E141m1G1C1e16181h1a1c1J1q1K1y1s151V1l1S1k1d1O1+1R1p1F19121W1u1z111D1H1T1Z1t171B1L1N1b1n1-1oNf1r1j1x1UNv1MNIN0NwNP1QN31gNX1ANYNsNKNGNkNCNcNSNaN4NiNqNmNeN2NEN8NyN6NFNBNpNVNRN+NJNuN9NWN1NxNONlNhNrNDN5N7NNNTNnNdNXNZNbNjNHNtNzNwtLNItPNotvNYt-N4tAtEtgtktQt6tatmtqt2tKtutyt+tSthtitxtfNptCtZt8tltct1tsttt3N9tMtDt0tztUtrtGtOtBtJt5t3tVtdtjt-tLt7tetRtFtNtTtbtWtwdXtvt4dQdntodftgdkd8dPtYdAdEdHtIdqdidGdUdCdsdydWdMd6dcdRdadSdmd0d5dudKdxdFded2dBdld+dJdhdVdOdpd7dTdDdddNdZdHdbdLd9dtd1dndQ9fdXdrdzdjdU9Pdo9g9M9w9-d3dI9A909vdY9i9E949m9G9C9e96989h9a9c9J9q9K9y9s959V9l9S9k9d9O9+9R9p9F99929W9u9z919D9H9T9Z9t979B9L9N9b9n9-9oDf9r9j9x9UDv9MDID0DwDP9QD39gDX9ADYDsDKDGDkDCDcDSDaD4DiDqDmDeD2DED8DyD6DFDBDpDVDRD+DJDuD9DWD1DxDODlDhDrDDD5D7DNDTDnDdDXDZDbDjDHDtDzDwjLDIjPDojvDYj-D4jAjEjgjkjQj6jajmjqj2jKjujyj+jSjhjijxjfDpjCjZj8jljcj1jsjtj3D9jMjDj0jzjUjrjGjOjBjJj5j3jVjdjjj-jLj7jejRjFjNjTjbjWjwTXjvj4TQTnjoTfjgTkT8TPjYTATETHjITqTiTGTUTCTsTyTWTMT6TcTRTaTSTmT0T5TuTKTxTFTeT2TBTlT+TJThTVTOTpT7TTTDTdTNTZTHTbTLT9TtT1TnTQzfTXTrTzTjTUzPTozgzMzwz-T3TIzAz0zvTYzizEz4zmzGzCzez6z8zhzazczJzqzKzyzsz5zVzlzSzkzdzOz+zRzpzFz9z2zWzuzzz1zDzHzTzZztz7zBzLzNzbznz-zoLfzrzjzxzULvzMLIL0LwLPzQL3zgLXzALYLsLKLGLkLCLcLSLaL4LiLqLmLeL2LEL8LyL6LFLBLpLVLRL+LJLuL9LWL1LxLOLlLhLrLDL5L7LNLTLnLdLXLZLbLjLHLtLzLwrFeCYWcwgacwg10nsMrPscr-sCrSr90Kr8rirSYsr2rGrerarOriYhriYxryriY+rurWrRrBr-L4rArwO6r1rlrtrLrCYVrJrNrZrdrrrPr7rqr-rXrfrCY5rmrIbzrwbHrbrgrkrQr8bcbibsbybErKbjr6bDrmb9r2bfLubYrOb+bebvLhbJbxbZbor5bPLFb1bVbtb3L9bJeasDAMoYAfousfoIAYI+A6gMg5s7Q0YsYNs00w7I7o7Y747E7k7U707M7s7c787C7i7S7y7K7q7a767G7m7W727O7u7e7+7B7h7R7x7J7p7Z757F7l7V717N7t7d797D7j7T7z7L7r7b777H7n7X737P7v7f7-7AHgHQHwHIHoHYH4HEHkHUH0HMHsHcH8HCHiHSHyHKHqHaH6HGHmHWH2HOHuHeH+HBHhHRHxHJHpHZH5HFHlHVH1HNHtHdH9HDHjHTHzHLHrHbH7HHHnHXH3HPHvHfH-HAngnQnwnInonYn4nEnknUn0nMnsncn8nCninSnynKnqnan6nGnmnWn2nOnunen+nBnhnRnxnJnpnZn5nFnlnVn1nNntndn9nDnjnTnznLnrnbn7nHnnnXn3nPnvnfn-nAXgXQXwXIXoXYX4XEXkXUX0XMXsXcX8XCXiXSXyXKXqXaX6XGXmXWX2XOXuXeX+XBXhXRXxXJXpXZX5XFXlXVX1XNXtXdX9XR7TbIALbaAeQcA7g-oIAPoHbXbCAPbfbtAlsg7qADXo3Y343E3k3U303M3s3c383C3i3S3y3K3q3a363G3m3W323O3u3e3+3B3h3R3x3J3p3Z353F3l3V313N3t3d393D3j3T3z3L3r3b373H3n3X333P3v3f3-3APgPQPwPIPoPYP4PEPkPUP0PMPsPcP8PCPiPSPyPKPqPaP6PGPmPWP2POPuPeP+PBPhPRPxPJPpPZP5PFPlPVP1PNPtPdP9PDPjPTPzPLPrPbP7PHPnPXP3PPPvPfP-PAvgvQvwvIvovYv4vEvkvUv0vMvsvcv8vCvivSvyvKvqvav6vGvmvWv2vOvuvev+vBvhvRvxvJvpvZvi7TXbIHAFApAbbXXgYHboY+A4YkY-bQ31sI35vXv3vPvvvfv-vAfgfQfwfIfofYf4fEfkfUf0fMfsfcf8fCfifSfyfKfqfaf6fGfmfWf2fOfufef+fBfhfRfxfJfpfZf5fFflfVf1fNftfdf9fDfjfTfzfLfrfbf7fHfnfXf3fPfvfv4TXrANQcAtgOs9vesIATvCALvFsIAVscYqAAQYIjowgi-y-q-K-S-G-a-m-6-u-O-+-2-h-W-x-e-R-p-J-B-F-Z-l-5-t-N-9-1-j-V-z-d-T-r-L-D-H-b-n-7-v-P---3-QAV-2AF-8gBoAkAQAIgFgDIB4A2ATAPgHQDEBUA5AXAKQGoCUBCAjAWgMwHoDcBOA-AdgMIFYDiBeAogaQJIEECKBZAygeQNoE0D6B1AxgVQOYF0CmBrAlgQwI4FsDOB7A3gTwP4HcDBBXA4QXwKEGiCRBAgiQWIMkHiDZBMg+QdIMUFSDlBcgpQaoJUEKCNBagzQeoN0E6D9B2gwwVoOMF6CjBpgkwQYIsFmDLB5g2wTYPsHWDHBVg5wXYKcGuCXBDgjwW4M8HuDfBPg-wd4MCFeDghfgoIaEJCEBCIhYQyIeENiExD4h0QxIVEOSFxCkhqQlIQkIyFpDMh6Q3ITkPyHZDChWQ4oXkKKGlCShBQioWUMqHlDahNQ+odUMaFVDmhdQpoa0JaENCOhbQzoe0N6E9D+h3QwYV0OGF9ChhowkYQMImFjDJh4w2YTMPmHTDFhUw5YXMKWGrCVhCwjYWsM2HrDdhOw-YdsMOFbDjhewo4acJOEHCLhZwy4ecNuE3D7h1wx4VcOeF3Cnhrwl4Q8I+FvDPh7w34T8P+HfDARXw4EX8KBGgiQRAIiEWCMhHgjYRMI+EdCMRFQjkRcIpEaiJREIiMRaIzEeiNxE4j8R2IwkViOJF4iiRpIkkQSIpFkjKR5I2kTSPpHUjGRVI5kXSKZGsiWRDIjkWyM5HsjeRPI-kdyMFFcjhRfIoUaKJFECiJRYoyUeKNlEyj5R0oxUVKOVFyilRqolUQqI1FqjNR6o3UTqP1HajDRWo40XqKNGmiTRBoi0WaMtHmjbRNo+0daMdFWjnRdop0a6JdEOiPRboz0e6N9E+j-R3owMV6ODF+igxoYkMQGIjFhjIx4Y2MTGPjHRjExUY5MXGKTGpiUxCYjMWmMzHpjcxOY-MdmMLFZjixeYosaWJLEFiKxZYyseWNrE1j6x1YxsVWObF1imxrYlsQ2I7FtjOx7Y3sT2P7HdjBxXY4cX2KHGjiRxA4icWOMnHjjZxM4+cdOMXFTjlxc4pcauJXELiNxa4zceuN3E7j9x24w8VuOPF7ijxp4k8QeIvFnjLx5428TePvHXjHxV458XeKfGviXxD4j8W+M-HvjfxP4-8d+MAlfjgJf4oCaBJAkASIJYEyCeBNgkwT4J0ExCVBOQlwSkJqElCQhIwloTMJ6E3CThPwnYTCJWE4iXhKImkSSJBEiiWRMonkTaJNE+idRMYlUTmJdEpiaxJYkMSOJbEziexN4k8T+J3EwSVxOEl8ShJokkSZKIADSEABAPrDugQAjQAAKx8AAApYMHAACAAA5R0KwCgD6w0AwgCAB4ACDsBFJeQYMPrGGDagfAJwCANuOEBOA8QwwIoBQDxAzQIAMkikGwA8AwBtARQYQC0B4AnBWAeIYMBsAQB5AKQwYIwD4AoBvBxJCUgSRJLElJTEpKU9KcQKa41A0AiAUft13sCGxjYCAU2ANwHYe8QAffSqVVOqk1TapdU+qQ1MalNTmpLU1qW1PakdTOpXU7qT1N6l9T+pA0waUNOGkjTRpY08aRNMmlTTppM02aXNPmkLTFpS05aStNWlrT1pG0zaVtO2k7Tdpe0-aQdMOlHTjpJ006WdPOkXTLpV066TdNul3T7pD0x6U9OekvTXpb096R9M+lfTvpP036X9P+kAzAZQM4GSDNBlgzwZEMyGVDOhkwzYZcM+GQjMRlIzkZKM1GWjPRkYzMZWM7GTjNxl4z8ZBMwmUTOJkkzSZZM8mRTMplUzqZNM2mXTPpkMzGZTM5mSzNZlsz2ZHMzmVzO5k8zeZfM-mQLMFlCzhZIs0WWLPFkSzJZUs6WTLNllyz5ZCsxWUrOVkqzVZas9WRrM1laztZOs3WXrP1kGzDZRs42SbNNlmzzZFsy2VbOtk2zbZds+2Q7MdlOznZLs12W7PdkezPZXs72T7N9l+z-ZAcwOUHODkhzQ5Yc8ORHMjlRzo5Mc2ORTya5z88pDvEMGGFKnu95+FUuOVnOzk5zc5ec-OQXMLlFzi5Jc0uWXPLkVzK5Vc6uTXNrl1z65DcxuU3ObktzW5bc9uR3M7ldzu5Pc3uX3P7kDzB5Q84eSPNHljzx5E8yec7KylQgfgfwJOeP0KkmwzYrvQbrP2G6ZzHQAAajugBAEwjALIGCATAtBtAy-YQNvN3n7zD5x80+QmAvl7zhAB8o+QFNvnnyd5D8p+TfLPn3yr5z8k+d-Pfm-yv5d8wBY-OvkvyAFl8sBX-Nfk-zoFwCt+VAs-kQKQFSC8Bf-NQUfz0FsC0BcgowWIKsFMCyBYQoQVwK8FOCtBUQswVAKUFBCmhfgrIXYLiF9CihSQtoWMKqFdC+BewtwVMLqF3Chhbws4UcLSFQi0RZQvEVsLBFEinhTIukVSLWFLC5hQIsUUqLlF5C9RXwq4UaL+FOi7RVopEWyKFFmi4RWIqMVKLdFBisxfIosX6LTFci1RXosMU2K1Fli+xcYrcWSLbFzixxVYocUmKvFriuxYEqcXWLfF7i7xWEoCXmKglPi6JS4tCX+LPFMSxJR4uCUpK-FaSuJckoSWZLIlSS9JbkoiWxKolOS8JSEryUlKCl2SwpeUoyXFLUl+SrJaUtqXxK6lRSipQ0sqWNKqlzS6pS0pqWDKBlwy-paMr6XjKmlky3pVMp6WzLul8yrpYss6XLL6lKyjpaso2XrKtl7SnZW0r2VlL9lrSg5ccqOWnKhlYymZQsrWW7KTl5yiZdMoeVzKllmym5WcpGX3Knl1yw5XcsuXPLtl3y95b8q+W3LAVjyq5S8oBUXKwVfy15T8uhXAq3lUKz5RCpBVIrwV-y1FR8vRWwrQVyKjFYiqxUwrIVhKhFXCrxU4q0VRKzFUCpRUEqaV+KsldiuJX0qKVJK2lYyqpV0r4V7K3FUyupXcqGVvKzlRytJVCrRVlK8VWysFUSqeVMq6VVKtZUsrmVAqxVSquVXkr1VfKrlRqv5U6rtVWqkVbKoVWarhVYqo1Uqt1UGqzV8qi1fqtNVyrVVeqw1TarVWWr7Vxqt1ZKttXOrHVVqh1Saq9Wuq7Vgap1dat9XurvVYagNeaqDU+ro1Lq0Nf6s9UxrE1Hq4NSmr9Vpq41yahNZmsjVJr01uaiNbGqjU5rw1IavNSWoLXZrC15ajNcWtTX5qs1pa2tfGrrVFqK1DaytY2qrXNrq1LamtYOoHXDr+1o6vteOqbWTre1U6ntbOu7Xzqu1i6ztcuvrUrqO1q6jdeuq3Xtqd1bavdWWv3WtqD1x6o9aeqHVjqZ1C6tdbupPXnqJ106h9XOqXWbqb1Z6kdfeqfXXrD1d6y9c+u3Xfr31v6r9besA2Pqr1L6gDRerA1-rX1P66DcBrfVQbP1EGkDUhvA3-rUNH69DbBtA3IaMNiGrDTBsg2EaENcGvDThrQ1EbMNQGlDQRpo34ayN2G4jfRoo0kbaNjGqjXRvg3sbcNTG6jdxoY28bONHG0jUJtE2UbxNbGwTRJp40ybpNUm1jSxuY0CbFNKm5TeRvU18auNGm-jTpu01aaRNsmhTZpuE1iajNSm3TQZrM3yaLN+m0zXJtU16bDNNmtTZZvs3Ga3Nkm2zc5sc1WaHNJmrza5rs2BanN1m3ze5u81haAt5moLT5ui0ubQt-mzzTFsS0ebgtKWvzWlri3JaEtmWyLUlvS25aItsWqLTlvC0ha8tJWgrdlsK3laMtxW1Lflqy2lbat8WurUVoq0NbKtjWqrc1uq0taatg2gbcNv62ja+t42prZNt61Taets27rfNq62LbOty2+rSto62raNt62rbe1p21ta9tZW-ba1oO3Hajtp2obWNpm0La1tu2k7edom3TaHtc2pbZtpu1naRt92p7ddsO13bLtz27bd9ve2-avtt2wHY9qu0vaAdF2sHX9te0-bodwOt7VDs+0Q6QdSO8Hf9tR0fb0dsO0Hcjox2I6sdMOyHYToR1w68dOOtHUTsx1A6UdBOmnfjrJ3Y7id9OinSTtp2M6qddO+Heztx1M7qd3Ohnbzs50c7SdQu0XZTvF1s7BdEunnTLul1S7WdLO5nQLsV0q7ld5O9XXzq50a7+dOu7XVrpF2y6Fdmu4XWLqN1K7ddBus3fLot367Tdcu1XXrsN0261dlu+3cbrd2S7bdzux3Vbod0m6vdruu3YHqd3W7fd7u73WHoD3m6g9Pu6PS7tD3+7PdMexPR7uD0p6-daeuPcnoT2Z7I9Se9Pbnoj2x6o9Oe8PSHrz0l6C92ewveXoz3F7U9+erPaXtr3x669ReivQ3sr2N6q9ze6vS3pr2D6B9w+-vaPr73j6m9k+3vVPp72z7u98+rvYvs73L769K+jvavo33r6t97enfW3r31l799reg-cfqP2n6h9Y+mfQvrX276T95+ifdPof1z6l9m+m-WfpH336n91+w-Xfsv3P7t93+9-b-q-237ADj+q-S-oAMX6wDf+1-T-ugPAG39UBz-RAZANIHwD-+1Ax-vQOwHQDyBjA4gawMwHIDhBhA3AbwM4G0DRBzA0AZQMEGaD+Bsg9geIP0GKDJB2g4waoN0H4D7B3A0weoPcGGDvBzgxwdINCHRDlB8Q2wcEMSGeDMh6Q1IdYMsHmDAhxQyoeUPkH1DfBrgxof4M6HtDWhkQ7IYUOaHhDYhow0od0MGGzD8hiw-odMNyHVDehwwzYbUOWH7Dxhtw5IdsPOHHDVhhwyYa8OuG7DgRpw9Yd8PuHvDYRgI+YaCM+HojLh0I-4c8MxHEjHh4Iykb8NpG4jyRhI5kciNJH0juRiI7EaiM5HwjIRvIyUYKPZHCj5RjI8UdSP5GsjpR2o-EbqNFGKjDRyo40aqPNHqjLRmo4MYGPDH+joxvo+MaaOTHejUxno7Me6PzGujixzo8sfqMrGOjqxjY+sa2PtGdjbRvY2Uf2OtGDjxxo46caGNjGZjCxtY7sZOPnGJj0xh43MaWObGbjZxkY-caePXHDjdxy488e2PfH3jvxr47ccBOPGrjLxgExcbBN-HXjPx6E8CbeNQnPjEJkE0ifBP-HUTHx9E7CdBPImMTiJrEzCchOEmETcJvEzibRNEnMTQJlEwSZpP4myT2J4k-SYpMknaTjJqk3SfhPsncTTJ6k9yYZO8nOTHJ0k0KdFOUnxTbJwUxKZ5MynpTUp1kyyeZMCnFTKp5U+SfVN8muTGp-kzqe1NamRTsphU5qeFNimjTSp3UwabNPymLT+p003KdVN6nDTNptU5aftPGm3Tkp2086cdNWmHTJpr066btOBmnT1p30+6e9NhmAz5poMz6ejMunQz-pz0zGcTMengzKZv02mbjPJmEzmZyM0mfTO5mIzsZqMzmfDMhm8zJZgs9mcLPlmMzxZ1M-mazOlnaz8Zus0WYrMNnKzjZqs82erMtmazg5gc8Of7Ojm+z45ps5Od7NTmezs57s-Oa7OLnOzy5+syuY7OrmNz65rc+2Z3Ntm9zZZ-c62YPPHmjzp5oc2OZnMLm1zu5k8+eYnPTmHzc5pc5uZvNnmRz95p89ecPN3nLzz57c9+ffO-mvzt5wC4+avMvmALF5sC3+dfM-noLwFt81Bc-MQWQLSF8C-+dQsfn0LsF0C8hYwuIWsLMFyC4RYQtwW8LOFtC0RcwtAWULBFmi-hbIvYXiL9FiiyRdouMWqLdF+C+xdwtMXqL3Fhi7xc4scXSLQl0S5RfEtsXBLElnizJektSXWLLF5iwJcUsqXlL5F9S3xa4saX+LOl7S1pZEuyWFLml4S2JaMtKXdLBlsy-JYsv6XTLcl1S3pcMs2W1Lll+y8ZbcuSXbLzlxy1ZYcsmWvLrluy4FacvWXfL7l7y2FYCvmWgrPl6Ky5dCv+XPLMVxKx5eCspW-LaVuK8lYSuZXIrSV9K7lYiuxWorOV8KyFbyslWCr2Vwq+VYyvFXUr+VrK6VdqvxW6rRViqw1cquNWqrzV6qy1ZquDWBrw1-q6Nb6vjWmrk13q1NZ6uzXur81rq4tc6vLX6rK1jq6tY2vrWtr7Vna21b2tlX9rrVg68daOunWhrY1mawtbWu7WTr51ia9NYetzWlrm1m62dZGv3Wnr11w63dcuvPXtr319679a+u3XAbj1q6y9YBsXWwbf116z9ehvA23rUNz6xDZBtI3wb-11Gx9fRuw3QbyNjG4jaxsw3IbhNhG3Dbxs420bRNzG0DZRsE2ab+Nsm9jeJv02KbJN2m4zapt034b7N3G0zepvc2GbvNzmxzdJtC3RblN8W2zcFsS2ebMt6W1LdZss3mbAtxWyreVvk31bfNrmxrf5s63tbWtkW7LYVua3hbYto20rd1sG2zb8ti2-rdNty3Vbetw2zbbVuW37bxtt25LdtvO3HbVth2yba9uu27bgdp29bd9vu3vbYdgO+baDs+3o7Lt0O-7c9sx3E7Ht4Oynb9tp247ydhO5ncjtJ307udiO7Hajs53w7IdvOyXYLvZ3C75djO8XdTv52s7pd2u-HbrtF2K7Ddyu43arvN3q7Ldmu4PYHvD3+7o9vu+PabuT3e7U9nu7Pe7vz2u7i9zu8vfrsr2O7q9je+va3vt2d7bdve2Xf3ut2D7x9o+6faHtj2Z7C9te7vZPvn2J709h+3PaXub2b7Z9ke-fafvX3D7d9y+8-e3vf337v9r+7fcAeP2r7L9gBxfbAd-3X7P96B8A7ftQPP7EDkB0g-Af-3UHH99B7A9AfIOMHiDrBzA8geEOEHcDvBzg7QdEPMHQDlBwQ5of4OyH2D4h-Q4ockPaHjDqh3Q-gfsPcHTD6h9w4Ye8POHHD0h0I9EeUPxHbDwRxI54cyPpHUj1hyw+YcCPFHKj5R+Q-Ud8OuHGj-hzo+0daORHsjhR5o+EdiOjHSj3RwY7MfyOLH+j0x3I9Ud6PDHNjtR5Y-sfGO3Hkj2x848cdWOHHJjrx647seBOnH1j3x+4+8dhOAn5joJz4+icuPQn-jzxzE8ScePgnKTvx2k7ifJOEnmTyJ0k-Se5OInsTqJzk-CchO8nJTgp9k8KflOMnxT1J-k6yelPan8Tup0U4qcNPKnjTqp80+qctOangzgZ8M-6ejO+n4zpp5M96dTOensz7p-M66eLPOnyz+pys46erONn6zrZ+052dtO9nZT-Z604OfHOjnpzoZ2M5mcLO1nuzk5+c4mfTOHnczpZ5s5udnORn9zp59c8Od3PLnzz7Z98-ee-OvntzwF486ucvOAXFzsF389ec-PoXwLt51C8+cQuQXSL8F-89RcfP0XsL0F8i4xeIusXMLyF4S4Rdwu8XOLtF0S8xdAuUXBLml-i7JfYviX9LilyS9peMuqXdL+F+y9xdMvqX3Lhl7y85ccvSXQr0V5S-FdsvBXErnlzK+ldSvWXLL5lwK8VcqvlX5L9V3y65cav+XOr7V1q5FeyuFXmr4V2K6NdKvdXBrs1-K4tf6vTXcr1V3q8Nc2u1Xlr+18a7deSvbXzrx11a4dcmuvXrru14G6dfWvfX7r712G4Dfmug3Pr6Ny69Df+vPXMbxNx6+Dcpu-XabuN8m4TeZvI3Sb9N7m4jexuo3Ob8NyG7zcluC32bwt+W4zfFvU3+brN6W9rfxu63Rbitw28reNuq3zb6ty25reDuB3w7-t6O77fjum3k73t1O57ezvu387rt4u87fLv63K7jt6u43frut37bnd2273dlu9nTXHwBgCGAIA3gOUjAKKE675SDYRsZeWnPXnlSp5z7l96+7ffvuP3n7r99+5-e-u-3-7gD4B6A-AeQPoHsD+B4g+QeoP0HmD7B7g-weEPiHpD8h5Q+oe0P6HjD5h6w-YecPuHvD-h4I+EeiPxHkj6R7I-keKPlHqj9R5o+0e6P9Hhj4x6Y-MeWPrHtj+x44+ceuP3Hnj7x74-8eBPgnoT8J5E+iexP4niT5J6k-SeZPsnuT-J4U+KelPynlT6p7U-qeNPmnrT9p50+6e9P+ngz4Z6M-GeTPpnsz+Z4s+WerP1nmz7Z7s-2eHPjnpz855c+ue3P7njz5568-eefPvnvz-54C+BegvwXkL6F7C-heIvkXqL9F5i+xe4v8XhL4l6S-JeUvqXtL+l4y+Zesv2XnL7l7y-5eCvhXor8V5K+leMwTXeYJGAgBlBcAM0VwIiFYCkA2QC8x3siH66ryypGcsr9156+9e+v-Xgb4N6G-DeRvo3sb+N4m+Tepv03mb7N7m-zeFvi3pb8t5W+re1v63jb5t62-bedvu3vb-t4O+Hejvx3k76d7O-neLvl3q79d5u+3e7v93h7496e-PeXvr3t7+94++fevv33n7797+--eAfgPoH8D5B+g+wf4PiH5D4U9HuT3+AZ0AsAoCbB4gY-Vr9217Ydf05Q7KH9j5x+4+8f+Pgn4T6J-E+SfpPsn+T4p+U+qf1Pmn7T7p-0+GfjPpn8z5Z+s+2f7Pjn5z65-c+efvPvn-z4F+C+hfwvkX6L7F-i+JfkvqX9L5l+y+5f8vhX4r6V-K+VfqvtX+r41+a+tf2vnX7r71-6+Dfhvo38b5N+m+P2TXaoHUAZDjB7gyobUC14Kl3vipK8mfonM95m+Pfnvr39759+++-f-vgP4H6D-B+Q-ofsP+H4j+R+o-0fmP7H7j-x+E-ifpP8n5T+p+0-6fjP5n6z-Z+c-ufvP-n4L+F+i-xfkv6X7L-l+K-lfqv9X5r+1+6-9fhv436b-N+W-rftv+347+d+u-3fnv7377-9+B-g-of8P5H+j+x-4-if5P6n-T+Z-s-uf-P4X+L+l-y-lf6v7X-r+N-m-rf9v53+7+9-+-g-4f6P-H+T-p-s-+f4v+X+r-1-m-7f7v-3+H-j-p-8-5f+v+3-7-j-5-6--f+f-v-v---4ADAAoAOADhOC3zgBageoBt9cAVgGgAjQMIDt4b3CflTkMfR9y68QA9AIwDMArAOwCcA3ALwD8AggMICiA4gJIDSAsgPICKAygKoDqAmgNoC6A+gIYDGApgOYCWA1gLYDauMAIgDrfPABgCoAVQBqAreGoAR8HfW9yKkZAIwAfc3fTOXYCZA2QLkD5AhQMUClA5QJUDVAtQPUCNAzQK0DtAnQN0C9A-QIMDDAowOMCTA0wLMDzAiwMsCrA6wJsDbAuwPsCHAxwKcDnAlwNcC3A9wI8DPArwO8CfA3wL8D-AgIMCCgg4IJCDQgsIPCCIgyIKiDogmINiC4g+IISDEgpIOSCUg1ILSD0gjIMyCsg7IJyDcgvIPyCCgwoKKDigkoNKCyg8oIqDKgqoOqCag2oLqD6ghoMaCmg5oJaDWgtoPaCOgzoK6DugnoN6C+g-oIGDBgoYOGCRg0YLGDxgiYMmCpg6YJmDZguYPmCFgxYKWDlglYNWC1g9YI2DNgrYO2Cdg3YL2D9gg4MOCjg44JODTgs4POCLgy4KuDrgm4NuC7g+4IeDHgp4OeCXg14LeD3gj4M+Cvg74J+Dfgv4P+CAQwEKBDgQkENBCwQ8EIhDIQqEOhCYQ2ELhD4QhEMRCkQ5EJRDUQtEPRCMQzEKxDsQnENxC8Q-EIJDCQokOJCSQ0kLJDyQikMpCqQ6kJpDaQukPpCGQxkKZDmQlkNZC2Q9kI5DOQrkO5CeQ3kL5DmQgfgQBoADSTQBVAZOWvdxQpAOd5JAjeX5C5Q+UIVDFQpUOVCVQ1ULVD1QjUM1CtQ7UJ1DdQvUP1CDQw0KNDjQk0NNCzQ80ItD6eQUOFC7gZ0HIAxAdthTk0fGUKfdLQt0PdCPQz0K9DvQn0N9C-Q-0IDDAwoMODCQw0MLDDwwiMMjCow6MJjDYwuMPjCEwxMKTDkwlMNTC0w9MIzDMwrMOzCcw3MLzD8wgsMLCiw4sJLDSwssPLCKwysKrDqw-6WtD7QO4EKkNgE0HgAxgFgBECQAJeWd8XQtAJrDewvsP7CBwwcKHDhwkcNHCxw8cInDJwqcOnCZw2cLnD5whcMXClw5cJXDVwtcPXCNwzcK3DtwncN3C9w-cIPDDwo8OPCTw08LPDzwi8MvCrw68JvDbwu8PvCHwx8KfDnwl8NfC3w98I-DPwr8O-Cfw38L-D-wgCMAigI4CJAjQIsCPAiIIyCKgjoImCNgi4I+CIQjEIpCOQiUI1CLQj0IjCMwisI7CJwjcIvCPwiCIwiKIjiIkiNIiTeTgKt9GgZoBmhKAREGRBmwuAG1gJQ8fkn5p+N3lQCsfMiK4juIniN4i+I-iIEjBIoSOEiRI0SLEjxIiSMkipI6SJkjZIuSPkiFIxSJ78KI+oCaAoABABoiKAOiPwBxgI2AdCUfJ0Kn5uwziKUjTIsyPMiLIyyKsjrImyNsi7I+yIcjHIpyOciXI1yLcj3IjyM8ivI7yJ8ijpFSIZA1I1oBykKABiKYjHQ1AEn4SpFAKkDfI2KLij4ohKMSiko5KJSjUotKPSiMozKKyjsonKNyi8o-KIKjCooqOKiSo0qLKjyoiqMqiqo6qJqjaouqPqiGoxqKajmolqNai2o9qI6jOorqO6ieo3qL6j+ogaMGiho4aJGjRosaPGiJoyaKmjpomaNmi5o+aIWjFopaOWiVo1aLWj1ojaM2ito7aJ2jdovaP2iDow6KOjjok6NOizo86IujLoq6Ouibo26Lb9-IqiPUiWgYKN0iZJdsNYjjI93zujvon6N+i-o-6IBjAYoGOBiQY0GLBjwYiGMhioY6GJhjYYuGPhiEYtaIH50gTIByAWANoHIBagBUDQAlQFUHCipQoyOijZQxGJJjSYsmPJiKYymKpjqYmmNpi6Y+mIZjGYpmOZiWY1mLZj2YjmM5jLA5GIyBsgXIAxjcAWoBX4EAyUI+iiY10K5jJYqWOliZY2WLlj5YhWMVilY5WJVjVYtWPViNYzWK1jtYnWN1i9Yn92RiZQBAE1goAPEC6AfALoEbDhAdsM7Coo132Jj9Yx2KdjnYl2Ndi3Y92I9jPYr2O9ifY32L9j-YgOMDig44OJDjQ4sOPDiI4yOKjjo4mONji44+OITjE4pOOTiU41OLTj04jOMzis47OJzjc4vOPziC4wuKLji4kuNLiy48uIrjK4quOria42uLrj64huMbim45uJbjW4tuPbiO4zuK7ju4nuN7i+4-uIHjB4oeOHiR40eLHjx4ieMnip40n0NjfgE2LNiEAC2NkkjYDYGugbYp3ztj2ImKOnid43eL3j94g+MPij44+JPjT4s+PPiL4y+Kvjr4m+Nvi74++IfjH4p+OfiX41+Lfj34j+M-iv47+J-jf4v+P-iAEwBKATgEkBNASwE8BIgTIEqBOgSYE2BLgT4EhBMQSkE5BJQTUEtBPQSMEzBKwTsEnBNwS8E-BIITCEohOISSE0hLITyEihMoSqE6hJoTaEuhPoSGExhKYTCoC33YBXAFgC7Yl4sUN9BrY5iNR9CY+2IljmE4RJETREsRPESJEyRKkTpEmRNkS5E+RIUTFEpROUSVE1RLUS9vVhPYSoAThK6A7Q-AF4T8Yyfna9BEnsPUSzE8xIsTLEqxOsSbE2xLsT7EhxMcSnE5xJcTXEtxPcSPEzxK8TvEnxN8S-E-xICTAkoJOCSQk0JLCTwkiJMiSok6JJiTYkuJJK9NEjhNwAl4q2PXiipTeLXlt4+JOySck3JLyT8kgpMKSik4pJKTSkspPKSKkypKqTqkmpNqS6k+pIaTGkppOaSWk1pLaT2kjpM6Suk7pJ6TekvpP6SBkwZKGThkkZNGSxk8ZImTJkqZOmSZk2ZLmT5khZMWSlk5ZJWTVktZPWSNkzZK2TtknZN2S9k-ZIOTDko5OOSTk05LOTzki5MuSrk65O7jEk7ROSSugbhLQA14vhMMi2IzJIdibkr5O+Sfk35L+T-kgFMBSgU4FJBTQUsFPBSIUyFKhToUmFJ6k7knRIQA9EhABeTDEtr3R8TEkyNhSsU7FJxTcUvFPxSCUwlKJTiUklNJSyU8lIpTKUqlOpSaU2lLpT6UhlMZSmU5lJZTWUtlPZSOUzlK5TuUnlN5S+U-lIFTiOeFIeTl4zYBRSDI0QPvdxY0xMFTZUuVPlSFUxVKVTlUlVNVS1U9VI1TNUrVO1SdU3VL1T9Ug1MNSjU41JNTTUs1PNSLUy1KtTrUm1NtS7U+1IdTHUp1OdSXU11LdT3Uj1M9SvU71J9TfUv1P9SA0wNKDTg0kNNDSw08NIjTI0qNOjSY02NLjT40hNMTSk05NJTTU0tNPTSM0zNKD87kheKXikUgxIlSCY4xK3jPkrNLLTy0itMrSq06tJrTa0utPrSG0xtKbTm0ltNbS209tI7TO0rtO7Se03tL7T+0gdMHSh04dJHTR0sdPHSJ0ydKnTRPHNPNjdEl0GRT3otFM+jpA6dLXT10jdM3St07dJ3Td0vdP3SD0w9KPTj0k9NPSz089IvTL0q9OvSb029LvT70h9MfSn059JfTX0t9PfSP0z9OyTZ0xeMeSHeAtMQCxYjFK+iv00DLAzwMiDMgyoM6DJgzYMuDPgyEMxDKQzkMlDNQy+on9K4SHecVMAzkA4DNXS0MgjMIyiM4jJIzSMsjPIyKMyjKozqMmjNoy6M+jIYycQjDK6A8gNhLQAKAJdOlDpUzFMYzeMvjP4yBMwTKEzhMkTNEyxM8TIkzJMqTOkyZM2TPr9mM0VI2A0kqVLwy5MtTPUyNMzTK0ztMnTN0y9M-TIMzDMozOMyTM0zLMzzMizMsyrM6zJszbMuzPsyHMxzKcznMlzNcy3M9zI8zPMrzO8yfM3zL8z-MgLMCygs4LJCzQssLPCyIsyLKizosmLNiy4s+LISzEspLOSyUs1LLSz0sjLMyyss7LJyy1Uu5M0k0AVwHBARUzjIESS0oRNyzKsqrOqyas2rLqz6shrMayms5rJazWstrPayOsq9IUyCsorNKz3kzrx4zOsobOGyRs0bLGzxsibMmyps6bJmzZsubPmyFsxbMCSeY1GNyBxgdIHaBGwhQGUyuw7jJAylsg7MOyjs47JOzTss7POyLsy7Kuzrsm7Nuy7s+7IezHsp7OeyXs17Lez3sj7M+yvs77J+zfsv7P+yAcwHKBzgckHNBywc8HIhzIcqHOhyYc2HLhz4chHMRykc5HJRzUctHPRyMczHKxzscnHNxy8c-HIJzCconOJySc-WRWy+YlgHWyPQRsJOAdsjJIGz9s0nKZzmclnNZy2c9nI5zOcrnO5yec3nL5z+cgXMFyhc4XJFzRcsXPFyJcyXKlzpcmXNly5c+XIVzFcpXOVyVc1XLVz1cjXM1ytc7XJ1zdcvXP1yDcw3KNzjck3NNyzc83ItzLcq3Otybc23Ltz7ch3Mdync53Jdz6Y8nLRioAKnM2yV4gAHY6cl33KyZU13ODyQ80PLDzw8iPMjyo86PJjzY8uPPjyE8xPKTzk8lPNTy089PIzzM8rPOzyc83PLzz88gvMLyi84vJLzS8svPLyK8yvKrzq8mvNry68+vIbzG8pvObyW81vLbz28jvM7yu87vJ7ze8vvP7yB8wfKHzh8kfKV53ctbI2zqARsJkB-cldNHz58hfMXyl85fJXzV8tfPXyN8zfK3zt8nfN3y98-fIPzD8o-OPyT80-LPzz8i-Mvyr86-Jvzb8u-PvyH8x-Kfzn8l-Nfy389-I-zP8r-O-yf83-L-z-8gAsAKgC4ApALQCsAvAKICyAqgLoCmAtgK4C9lPHzKcyfMbDtAWfL2z8M+AswKsC7ApwLcCvAvwKCCwgqILiCkgtIKyC8gooLKCqguoKaC2groL6ChgsYKmC5gpYLWCtgvYKOCzgq4LuCngt4K+C-goELBCoQuEKRC0QrELxCiQskKpC6QpkLZCuQvkKFCxQqULlClQtUK1C9Qr8DECz3OQKV4owDQLVMjQsMKjC4wpMLTCswvMKLCywqsLrCmwtsK7C+wocLHCpwucKXC1wrcL3Cjws8KvC7wp8LfCvwv8KAiwIqCLgikItCKwi8IoiLIiqIuiKYi2IriL4ihIsSKki5IpSLUitIvSKMizIqyLsinItyK8im6S0KvcqfJXieAfQsDzBs-IsqKqi6opqLaiuovqKGixoqaLmilotaK2i9oo6LOirou6Kei3or6L+igYsGKhi4YpGLRisYvGKJiyYqmLpimYtmK5i+YoWLFipYuWKVi1YrWL1ijYs2Kti7Yp2LdivYv2KDiw4qOLjik4tOKkoI902A2w15IijcM8osZyzih4seKni54peLXit4veKPiz4q+Lvin4t+K5PC4o2AWACkEwB+2a4qLT0Uu4owK-i6EphLYSuEvhKESxEqRLkSlEtRK0S9EoxLMSrEuxKcS3ErxL8SgksJKiS4kpJLSSskvJKUgiryH40QMoo+SKsikoZLGSpkuZKWS1krZL2Sjks5KuS7kp5LeSvkv5KBSwUqFLhSkUtFKxS8UolLJSqUulKZS2UrlL5ShUsVKlS5UpVLVStUvVKNSzUq1LtSnUt1K9S-UoNLDSo0uNKTS00rNLzSi0stKrSt7ia5yQSgD6y5860qdLnSl0tdK3S90o9LPSr0u9KfS30r9L88prn8AoAMABXiAADVpKGcqEv9LoymMtjK4y+MoTLEypMuTKUy1MrTL0yjMszKsy7MpzLcyvMvzKCywsqLLiykstLKyy8sorLKyqsurKay2srrL6yhssbKmy5spbLWytsvbKOyzsq7Luynst7K+y-soHLByocuHLPCwMvYBgyleIABNCMsx97ikcvnKFyxcqXLlylctXK1y9co3LNyrcu3Kdy3cr3L9yg8sPKjy48pPLTys8vPKLyy8qvLrym8tvK7y+8ofLHyp8ufKXy18rfL3yj8s-Kvy78p-Lfyv8v-KAKwCqArgKkCtAqwKqsrHKJyzYB6yEAcMrBLbYgPLpKg88CpQrUKtCvQqMKzCqwrsKnCtwq8K-CoIrCKoiuIqSK0irIryKiisoqqK6iporaKuivoqGKxiqYrmKlitYq2K9io4rOKriu4qeK3ir4r+KgSsEqhK4SpErRKsSvEqJKySqkrpKmqEgqQy6CsKyEAacvgqN4xCsjKZKjSs0qtK7Sp0rdKvSv0qDKwyqMrjKkytMqzK8yosrLKqyusqbK2yrsr7KhyscqnK5ypcrXKtyvcqPKzyq8rvKnyt8q-K-yoCrAqoKuCqQq0KrCrwqiKsiqoq6KpirYquKvr41YVWHVguuDyUWBR+PwHUj9QLADBAOM1UBAAnAKAD5AagcYHYAAALz9A+AWfntANgAoBH5UAAqqKrLAAIHtAnAJwEpyyqv0F2AeQPAEZAMAQUGFBtQK9zpA+QAUDGAhQNkEGquQZAExBGQEkFNjCQYkFJAQAZqrgBWqlgAJAUAIkEWAlqxgHYBGvQgDKqYQXAFqqO2XAGgB4ADAEsBspRACKAjgDYA2rkALapJA1QOAD5B2MzasWqkqoAA",
        "resourceBudgets": {
            "materials": {},
            "machines": {}
        },
        "initiallyAvailableMaterials": [],
        "environment": {
            "temperature": 25,
            "humidity": 95,
            "illumination": 50,
            "dewpoint": 10,
            "ambientWindOn": false,
            "windStrength": 0,
            "gustWindStrength": 0
        },
        "controlLimits": {
            "temperature": {
                "min": -10,
                "max": 150
            }
        },
        "lockedControls": [
            "humidity",
            "illumination",
            "dewpoint",
            "wind"
        ],
        "startSelection": {
            "material": "Sand",
            "drawMode": "brush"
        },
        "unlockedTools": [
            "brush"
        ],
        "visualizationModes": [
            "normal",
            "heat",
            "humidity"
        ],
        "objectives": [
            {
                "id": "heat-drying",
                "type": "environment-target",
                "target": 1,
                "targetValues": {
                    "temperature": 150
                },
                "label": "Set Temperature to 150 degrees C to dry the Wet Sand."
            },
            {
                "id": "dry-wet-sand",
                "type": "transformation",
                "from": "Wet Sand",
                "to": "Sand",
                "target": 100,
                "requires": [
                    "heat-drying"
                ],
                "unlocks": {
                    "controls": [
                        "dewpoint"
                    ]
                },
                "label": "Dry 100 Wet Sand cells into Sand to release stored moisture into the air."
            },
            {
                "id": "set-cold-dewpoint",
                "type": "environment-target",
                "target": 1,
                "targetValues": {
                    "temperature": -10,
                    "humidity": 95,
                    "dewpoint": 20
                },
                "requires": [
                    "dry-wet-sand"
                ],
                "label": "Set Temperature to -10 degrees C and Dewpoint to 20 degrees C while keeping Humidity at 95%."
            },
            {
                "id": "condense-snow",
                "type": "transformation",
                "from": "Cloud",
                "to": "Snow",
                "target": 75,
                "requires": [
                    "set-cold-dewpoint"
                ],
                "label": "Recover 75 naturally formed Cloud cells as Snow."
            },
            {
                "id": "set-thaw-temperature",
                "type": "environment-target",
                "target": 1,
                "targetValues": {
                    "temperature": 8
                },
                "requires": [
                    "condense-snow"
                ],
                "label": "Warm the air to 8 degrees C."
            },
            {
                "id": "melt-snow",
                "type": "transformation",
                "from": "Snow",
                "to": "Water",
                "target": 60,
                "requires": [
                    "set-thaw-temperature"
                ],
                "label": "Melt 60 Snow cells into Water."
            },
            {
                "id": "wet-catch-bed",
                "type": "transformation",
                "from": "Sand",
                "to": "Wet Sand",
                "target": 50,
                "requires": [
                    "melt-snow"
                ],
                "label": "Return the recovered Water to the Sand catch bed."
            }
        ],
        "events": [
            {
                "id": "steam-released",
                "when": {
                    "type": "objective-complete",
                    "objectiveId": "dry-wet-sand"
                },
                "message": "Drying released stored moisture into the air. Dewpoint is now available, and humid upper air can form Cloud."
            },
            {
                "id": "snow-recovered",
                "when": {
                    "type": "objective-complete",
                    "objectiveId": "condense-snow"
                },
                "message": "Cloud has precipitated as Snow. Warm the air so the recovered water can return to the ground."
            },
            {
                "id": "moisture-recovered",
                "when": {
                    "type": "objective-complete",
                    "objectiveId": "wet-catch-bed"
                },
                "message": "The water cycle is complete: moisture has moved from the soil, through the air, and back into the Sand."
            }
        ]
    },
    {
        "id": "controlled-burn",
        "number": 6,
        "title": "A Controlled Burn",
        "briefing": "A substantial Wood bridge rises above a five-row Sand floor, with a clear bay beneath its span. Ignite the exposed top of the bridge, then wait one second of active simulation for Water to unlock. Pour the unlimited Water over the burning structure, leaving some Wood intact and no active Fire.",
        "guidance": "Place Fire on the exposed upper surface of the overhead Wood span. The burn will begin to spread, and Water unlocks after 60 active simulation steps; paused time does not count. When Water is ready, the largest Brush will be selected. Pour Water over the burning structure and quench at least one Fire cell into Smoke. Finish with surviving Wood and no active Fire.",
        "world": {
            "cols": 260,
            "rows": 150
        },
        "startingSave": "N4IgZg9gTgtghgFxALhAUwDZpmgdguDAWkgFdcATKATxABoQA3NKAZwEsJcUBmB1uMwoBBJKgBMABnEA2IpICcRHpIAqARgAsydQHZkPABwA6dTMkAteiBgQKaFCAGUARhAAe1gMZwYABzh2AHNuZFxSDAx+dhgIxE5Q0GY2BJR1fj8odlwAaywoAFk7NAA1Fg4uFHEGeC8AC2y0AAVoBAAZOGoIUgQylMrkavA4XAB1bIoAZR8sFABWSQYvCAxWKvMGKAgAdzWdBYZfF3Y8MXE5w5hj09U4KCC0M4uQI5P8AAlSGHYKdgRaZCaRYvK5vBAASUiX2y8QGBxA9m2fgg2QQt3ujzSwNep3GlAA8qEwIRWGgGNsJgARdiEFDAh64FiEPFTBBQPBBBB1OkMIKkVgIFmTNkcrk8kCZNCMQIYbJBFnU9leBCpHQMSXS9iy3DyiaqdheHKsABK2ECuDlWMMkhtDDAUF8aAAwt18OK7g7qHtQP8-A5kD7qH7HABVVGGYRQT3WCiIOCOYSJpPJlOptPpjOZrPZnO5vP5guFovFkulsvliuVqvVmu1uv1huNpvNluttvtjudrvdnu9vv9geDofDkejsfjieTqfTmezufzheLpfLlertfrjebrfbne7vf7g+Ho-Hk+ns-ni+Xq-Xm+3u-3h+Pp-Pl+vt-vj+fr-fn+-v--gDAKA4CQNAsDwIgyCoOgmDYLg+CEMQpDkJQ1C0PQjDMKw7CcNwvD8IIwiiOIkjSLI8iKMoqjqJo2i6PohjGKY5iWNYtj2I4ziuO4njeL4-iBMEoThJE0SxPEiTJKk6SZNkuT5IUxSlOUlTVLU9SNM0rTtJ03S9P0gzDKM4yTNMszzIsyyrOsmzbLs+yHMcpznJc1y3PcjzPK899WDaJ1dj8gL-N84LApCoKIvCqKwpi0K4si2KEvi6LksSlKkoy9KsradTUryiKfLSorgvU4rMpyt98uy-z1OqzL3zK7LcvK-LCqqtLSva1L3y6jLasajq3wG7q1N69K2payLOsm6KepmxL+rGsKGqW0Lmrq8a3w2wbVOGhK5u2+LFvmkqhtWgL1r28KJsO3Zptu3yDquwLjoelaTou0aPuurbntO3bzseyrvpetSHuWs6Qcu86bqu+7nqemGwb+u7IfB6GPthsb4aWxHMeRwH3vRr7wZq37CbUlGgdfQHQdU0nUdfKmKtU2mydfBnWBx+a8du164bRhGSZRrGZu57beb2-nscF3HhaRjmqfFgbJd66Wxdlnn5fxxWKYBqHgYZ9WNqJoXWZB9mX055X2tVybjca025fNo3ye+m3yrtuqHaqp2tZdkW3beynaa9sqffqzWJe1vmg4F-XiZpi3tgjrK-ejgOFatpWQ4NpPXfpnOmdDmOpbjmWE7Nl82ZTgn3ajlXS7V8uNcr53q+T1OdpfZmMdj3X67b-2O4LlTrYb22m-tluTafAAhYQAEUAFEF5XtfV6Xzf163je993g+d6P7eT-34+z9Pw-L-Pq+L7v2+H5vp-r5f+-n7f1-H8-9+v4-v-f4AT-IB38QH-2AWA0BgDIHgKgRAuBsCEEwKQdAlB8DkFoNQYgzB6CsEYLwbgghOCiHYJIfg4hZDSGEMoeQqhFC6G0IYTQph1CWH0OYWw1hjDOHsK4RwvhvCBE8KEdw0hIAAC+DAEDYD8CgQMwZUAADEMAQEQDwcQkZowMFjAQBMwhKTgkXovRM1Bl7L0TAUOoC89EGKMcIExZjhAWKsfowxxjTHmMsYmFxtj7EeOcTYtxDinFeICXY9xjjPHWNcWEoJkTvGBL8SE6JviIn+OSeE4JUSfEZLiaElJmT4kxMSVkhJqSknZNiWkipxTCn5Nyekyp5TSkFLyTkqpzT6nVLKSUop3TaltKab0lpDSamtMaT0up7ShmdI6VMyZgz5kTIGUs8Z-TVljNGSMvpGztlbOGV0-ZsyFnLLWZsg5MzplzJOTsw5lzjnrL2RcxZpzdnnKuQ8t59yzlHJWd8u5vzXk-Jebc55NynnXMee8v5oLIVfMBf84F4KPlArBVC+FMLPkApBRCzFiK0XYuRQi1FcKCXQpxSi2FWKkVksJRiiluLiVUvxdS9F5KiWUrxSSllpLWW0rZXS9lDKOWMs5UyrlzKJXiqlWKmVoq5UioVcKpVQqVX0rVYK9VAqtX8p1XyvVNKDW8sNTyk13KzWStlYq1VGqbXav1Uah1pqLXyuVZq3VxrzXSpddau1HrnVWrdfap1XqA22vdY6z1lrXVhqDZG71ga-Uhujb6iN-rk3huDVGn1Ga42hpTZm+NMbE1ZoTampN2bY1porcWwt+bc3psreW0tBa805qrc2+t1ay0lqLd22tbam29pbQ2mtrbG09rre2odnaO1TsnYO+dE6B1LvHf21dY7R0jr7Ru7dW7h1dv3bOhdy612boPTO6dc6T07sPZe496690XsXae3d56r0Prffes9R6V3frvb+19P6X23ufTep917H3vr-aByDX7AP-uA+Bj9QGwNQfgzBz9AGQMQcw4htD2HkMIdQ3Bgj0GcModg1hpDZHCMYYo7h4jVH8PUfQ+RojlG8MkZY6R1jtG2N0fYwxjjjHONMa48xiT4mpNiZk6JuTImFPCaU0JlT9G1OCfUwJrT-GdN8b0zRgzvHDM8ZM9xszknZOKdUxpmz2n9NGYc6Ziz8nlOad08Z8z0mXPWbsx55zVm3P2ac15gLtn3OOc85Z1zYWguRe84FvzIXou+Yi-55L4XgtRZ8xluLoWUuZfizFxLWWEupaS9l2LaWKvFcK-l3L6XKvldKwVvLOWqvNfq9VsrJWivddq21prvWWsNZq61xrPW6vtaG51jrU3JuDfmxNgbS3xv9dW2N0bI2+sbe21t4bXX9uzYW8ttbm2Dszem3Nk7O3DuXeO+tvbF3Fund2+dq7D23v3bO0dlb327u-dez9l7t3ns3ae9dx772-ug8h19wH-3gfg4+0DsHUP4cw8+wDkHEPMeI7R9j5HCPUdw4J9DnHKPYdY6R2TwnGOKe4+J1T-H1P0fk6J5TvHJOWek9Z7TtndP2cM454zznTOufM4l+LqXYuZei7lyLhXwuldC5V-TtXgv1cC61-znXfO9c04N7zw3POTfc7N5L2XivVca5t9r-XRuHem4t-L5XmvdfG-N9Ll31u7ce+d1bt39unde4D7b93jvPeW9d2HoPkfveB79yH6PvuI-++T+H4PUefcZ7j6HlPmf48x8T1nhPqek-Z9j2nivxfC-59z+nyv5fS8F7zznqvzf6-V7LyXov3fa9t6b73lvDea+t8bz3uv7eh+d471Pyfg-58T4H0v8f-fV9j9HyPvvG-t9b+H13-fs+F-L7X5vg-M-p9z5Pzvw-l-j-r73xfxfp-d-n6vw-t-9+z9H5X9-u-v-X8f8X9b9n8b8n9r9H938-9QDICv9AD-9gDwCP8gCwCoD4CYDP8ACQCIDMDEC0DsDkCEDUC4CCDoCcCUDYCsCkCyDCCMCKDcDiCqD8DqD0DyCiDKC8CSCWDSDWDaC2C6D2CGCODGDOCmCuDmCJDxCpCxCZDRC5CRCFDhClChCVD6C1DBD1CBCtD+CdC+C9CaCDDeDDCeCTDuCzDJDZDFDVCNCbDtD9CjCHDTCLD5DlDNDdDjDzDpCXDrC7CPDnCrC3D7CnCvCAjbD3DHDPDLDXCwigjIjvDAi-CQjojfCIj-DkjwjgioifCMi4jQiUjMj4iYjEisiEjUikjsjYi0iKjijCj8jcj0jKjyjSiCi8iciqjmj6jqiyiSiijujai2imjeiWiGiajWjGiei6j2ihjOiOipjJjBj5iJiBiljxj+jVixjRiRi+iNjtitjhiuj9jZiFjli1jNiDiZjpi5iTidjDjLjjj1i9iLjFjTjdjziriHi3j7izijiVjvi7jfjXifiXjbjnibinjrjHj3i-jQTISvjAT-jgTwSPigSwSoT4SYTPiASQSITMTES0TsTkSETUS4SCToScSUTYSsSkSyTCSMSKTcTiSqT8TqT0TySiTKS8SSSWTSTWTaS2S6T2SGSOTGTOSmSuTmSJTxSpSxSZTRS5SRSFThSlShSVT6S1TBT1SBStT+SdS+S9SaSDTeTDSeSTTuSzTJTZTFTVSNSbTtT9SjSHTTSLT5TlTNTdTjTzTpSXTrS7SPTnSrS3T7SnSvSAzbT3THTPTLTXSwygzIzvTAy-SQzozfSIz-TkzwzgyoyfSMy4zQyUzMz4yYzEysyEzUykzszYy0yKzizCz8zcz0zKzyzSyCy8ycyqzmz6zqyyySyizuzay2ymzeyWyGyazWzGyey6z2yhzOyOypzJzBz5yJyBylzxz+zVyxzRyRy+yNztytzhyuz9zZyFzly1zNyDyZzpy5yTydzDzLzjz1y9yLzFzTzdzzyryHy3z7yzyjyVzvy7zfzXyfyXzbznybynzrzHz3y-zQLIKvzAL-zgLwKPygKwKoL4KYLPyAKQKILMLEK0LsLkKELUK4KCLoKcKULYKsKkKyLCKMKKLcLiKqL8LqL0LyKiLKK8KSKWLSLWLaK2K6L2KGKOLGLOKmKuLmKJLxKpKxKZLRK5KRKFLhKlKhKVL6K1LBL1KBKtL+KdK+K9KaKDLeLDKeKTLuKzLJLZLFLVKNKbLtL9KjKHLTKLL5LlLNLdLjLzLpKXLrK7KPLnKrK3L7KnKvKArbL3LHLPLLLXKwqgrIrvLAq-KQrorfKIr-LkrwrgqoqfKMq4rQqUrMr4qYrEqsqErUqkrsrYq0qKrirCr8rcr0rKryrSqCq8qcqqrmr6rqqyqSqiruraq2qmreqWqGqarWrGqeq6r2qhrOqOqprJrBr5qJqBqlrxr+rVqxrRqRq+qNrtqtrhqur9rZqFrlq1rNqDqZrpq5qTqdrDrLrjr1q9qLrFrTrdrzqrqHq3r7qzqjqVrvq7rfrXqfqXrbrnqbqnrrrHr3q-rQbIavrAb-rgbwaPqgawaob4aYbPqAaQaIbMbEa0bsbkaEbUa4aCboacaUbYasakaybCaMaKbcbiaqb8bqb0byaibKa8aSaWbSbWbaa2a6b2aGaObGbOamaubmaJbxapaxaZbRa5aRaFbhalahaVb6a1bBb1aBatb+ada+a9aaaDbebDaeaTbuazbJbZbFbVaNabbtb9ajaHbTaLb5blbNbdbjbzbpaXbra7aPbnara3b7anavaA7bb3bHbPbLbXaw6g7I7vbA6-aQ7o7faI7-bk7w7g6o6faM647Q6U7M746Y7E6s6E7U6k7s7Y606K7i7C787c707CDhBwlhA54rFExokm6HEW626l5bFO6kxW7kwO7m7B6kxh6u7R726+6R6e7x6B7Z7p6J6F6kwZ6h7F75616V6l7N7ExV6x717ExJ7e6t6N796T7D7l7d7t6z6r7T6p7z7u6d7+6L6n69777b6X6b7n7H6v637j6P6f737v6j657P6gG-7QHAH-7gHL6YHX7r7wGEHoGIGD6oHIGQHUGMGH7R7a6c6q7S6C687lzEG77kGkH0HYGUHsHL6678Gi74C4Hf7yHMHKHmHqH4Ga6iHK7y6CH66uy0GWGOGwGyHSGKGhGf7cHuGS7-8SHhGxGmHRHBGFG5Hq6y7pHaGeH6HbzGHZGBH2HlG9GAGsGP7CGG7OGt9DGdGRGVH9HdHjHGHJHzHVHTHnG+Gfi7HWHFHbHrHLGqGtG3H-Gp8rH5GPHxH7G-Hn6XHeG6GNH1G8G4TfG2GjHPGbHkmwmYn4m4nx9QmDHwmkngmlH37YnHG1GSmonAnBiCnvGQmfG8mvGTGAnimuHDdEn6mqm0ncmUmJHmnSmenymmmzHuicnhnamum6nUmBnXGMnCd2nZmIn5n8nMmynGmlm+mVn7DWnUm5nFmdnT7lnpmnGfsRmamTnCnRmd7JnonNHLmKmsm-9tm2mFnHndnenBn+nw9NnPnxmvmxmDnXmpnrnVm3nIjjmznTnqmwWAW7n-n1cHmtmnn4WXn3mpH9nAWUW1m0Cfn0nsXOmcXUXoXkXitQWIWSWOniXbn8XKWMW0XDmbc4WsXcXGXZHCWYWKWdsGXyX6XvmcHqWCX1naWbnBXltOWEWOXzmb6hX0XgWpsuXfmcWRWpWoWqXpWaXWWU8xXwWyXxWcnlWlXeXRMFXnmjXEX6nJWBWgW9WVW+WZXRXuW5WmXrGWWnX+WHMNXIXSXZXVXnW-nvWvWXXMtDWTWg23WrnrW-WbWXmQ2tXNXIn-W42fX43w2k2AMo3PWHX5HdXQ3M3-1A3U3bWaGLWs39Xi2rXs2BM03c27WhHfWw3a2X083I2q3GWy3C22XS2S3LXMNK37Xu2LnW2zW1W2MK3tWR2Y3+3x3FWi323p2usG3jW53P6W3J222u3R33Xo3132mB2a2l3zXl3t2Llh2x3G2Umd2O2p2u0F2r2m3d3B392J293H3u1e303N2-GD2E3P3B0j232T3q3E263z2V2L2QPe1r2e2139Hb2z2Z2fkX34PIPgOkOP3k3oOAPCkf2PX83-2v3APYOwOm2EPj29mgOUO8PO3QOyOiPf353jGyO0PcOMPsPX2sOkX0PSOH272n2YOulwP5XEOHGOP73hPi1qPWPaOC2ROuPpOePKPOPblMON3xOg3ZPkP5OWU+OWOlOOmGPUOhPuP2OrWxPtPFP6P9OZPD3mPjO4XVOzP8O7OKP6HNPrO97dPyO5PxkXO-2tOHOPODPGPzPynFPguEXbP1OAutlnOBPmO3PYvAvDPHPFqvOJP+P7Pwu9Po0QvvPA2wupPcv-OMvVGoviPg2eW0u8uEu4PovsvqvTX0v3O1OKuIvHOsuUutPY3mu-OLO0ViuaPSvOvGuCuGvfPbnkv+vUvEv6u4uSvevlP8vuvCuuv5uebZuTOYv4uBuqPavxv2v32puNvFvBuFvpHWuducvKujv5vVvTvunyuhvpvJumvpaxvVuRu3vW2bvCPtvluLv3unvhvwrrurPxWHuluAOXuvvNW-v7uDuAf-vCrPuIOSufvNvOOgeauM3YfQfLvfv9vKKIekf13ofjvs3EeJu5vcf4esfqe7uHL0e2udWafHuhuCfyftPieUfDuOfKe-iyfdu2PUeqfaf6ezuQemewfBeYfafMrWf+e6uhfmeSfQk+exvOe4epfFe1eXyRfNPsfueLbZfjP9eue8fNeef4KVftvNmtfxenPIe+vdfbfjf1elfpfIzDere6PTeJfDvLeZvxmbe3fJfXeze0Kdf7eoOnfvfRvPfCflPDHne9fo-E+o+Zngf-e4+Gng-A+iuI+1uMelGk+FefeXec-3HY+2fTPk-q-l2-eHeA-zey+cfs-G+WTw-M-BOg+Tf-uPeM++3i-m-u+NeS+Ef0-6+O+a-h+jv2-K-XPU+p+U+u-S+QWK+5fRel+i-aW6-4+G+W+9+h+Q+R+dyZ+1-bvQ+D+a3e-x-++F-J-D-B-l+pzt-8-jWm-F+uqT+X3N-7-3+j+N-GCr+O-STrfwH43Nn+p3N-nf0gGgCoBLOT-qv2-7QDiqgAl-hM1gH79H+F-VvlMXAFj9z6SAn-uHXgF99MBpAxAdgKwEWEUBVfGAbQK354DUBC7AgcwIoFkD5+rrPPrgOvrkCMBotagQwN-4P8eBlAkQT3i4EM9HWrA4QQDWIHX82B--BQef3kGYl+BBfP-koNJ4MDxBhAugToJAH6CHSsgoAaIOkF8DV+KAwQZYPQEmD2Bt6bQUwKkG2CWaRgxgWVw0FODeBHgmwZTlUESDFB6g0DvYM4HWDlBpVFwUEIn5qDXBkQvwXIN8Hr84h5gpISQPiHhCtB6QqIRENn6ZCMhsQ4waf2CE5CiheQ6IdkJKFZCChMQhIfkNSGFDyhuQ6oaUMqFlDGhFQ2oVULSHFDWhDQzofUK6G9Duh-QuoYML6GjCRh4wgYZMOGFTCOh0wuYbMIWEtCZhSw+YSsMWHNCNh7QtYdsM2HJDEhKQvYTUMOFNCthuwg4ecP2GXCjhFw64VcJOHHC2hDwnoasLOF3DHhNw+4R8PeFvDnh6w04f8KeFDC-hgIsYcsNeG3CIRnwn4UCJ2EAivhvw2ESCImEvC4R0I0ESiKRFgjURkI74TiIRHgioReImEQSNxGEiyRpIikfiOxHkiqRmIjEfCOJHUjKRjIukcCIZHz1xEDAWUGAH9ByJ-QIAcEPgDMAaJOgMYOMLom8iSipR0omUbKLlHyiFRiopUcqJVGqi1R6ojUZqK1HaidRuovUfqINGGijRxok0aaLNHmiLRloq0daJtG2i7R9oh0Y6KdHOiXRrot0e6I9GeivR3on0b6L9H+iAxgYoMcGJDGhiwx4YiMZGKjHRiYxsYuMfGITGJikxyYlMamLTHpiMxmYrMdmJzG5i8x+YgsYWKLHFiSxpYsseWIrGViqx1YmsbWLrH1iGxjYpsc2JbGti2x7YjsZ2K7HdiexvYvsf2IHGDihxw4kcaOLHHjiJxk4qcdOJnGzi5x84hcYuKXHLiVxq4tceuI3Gbitx24ncbuL3H7iDxh4o8ceJPGnizx54i8ZeKvHXibxt4u8feIfGPinxz4l8a+LfHviPxn4r8d+J-G-i-x-4gCYBKAnASQJoEsCeBIgmQSoJ0EmCbBLgnwSEJiEpCchJQmoS0J6EjCZhKwnYScJuEvCfhIImESiJxEkiaRLInkSKJlEqidRJom0S6J9EhiYxKYnMSWJrEtiexI4mcSuJ3EnibxL4n8SBJgkoScJJEmiSxJ4kiSZJKknSSZJskuSfJIUmKSlJyklSapLUnqSNJmkrSdpJ0k3jORIAbkWgAKBwBPAAYEAL6H5GCiEAwoqMKKK0TijUAukpyc5JcmuS3J7kjyZ5K8neSfJvkvyf5ICmBSgpwUkKaFLCnhSIpkUqKdFJimxS4p8UhKYlKSnJSUpqUtKelIymZSsp2UnKblLyn5SCphUoqcVJKmlSyp5UiqZVKqnVSaptUuqfVIamNSmpzUlqa1LantSOpnUrqd1J6m9S+p-UgaYNKGnDSRpo0saeNImmTSpp00mabNLmnzSFpi0pactJWmrS1p60jaZtK2nbSdpu0vaftIOmHSjpx0k6adLOnnSLpl0q6ddJum3S7p90h6Y9KenPSXpr0t6e9I+mfSvp30n6b9L+n-SAZgMoGcDJBmgywZ4MiGZDKhnQyYZsMuGfDIRmIykZyMlGajLRnoyMZmMrGdjJxm4zFx+k9kBwAoCkBeR5koMPyLDD4AIwtk2gPZJ0SOS8ZjMpmczJZmsy2Z7MjmZzK5ncyeZvMvmfzIFmCyhZwskWaLLFniyJZksqWdLJlmyy5Z8shWYrKVnKyVZqstWerI1maytZ2snWbrL1n6yDZhso2cbJNmmyzZ5si2ZbKtnWybZtsu2fbIdmOynZzsl2a7Ldnuyhw+k1gHUDgD2BZEZM+RCAEpkIBqZmiBEA5JAC4BtgToAAOIABqRgBYHeC4A2gFAVgAAHoAAGsaEMDghxAAATXTkAApHgNsGNAWACgAAOXBAFBhAfgVgKsHaCVyAA0mgDaDbBVAMcngF4EMCqAFATQLwMvFwAhgYAOQYubAEmDghl4BQAoPgG2CGB05qcmALcAABe1AGQLoEpAABHdQPiE0AUAnQ1ktoJoHBBtB+Q1ALeawEMCTB3gcwZuaMAKAUALAGAZuTqHzleBVAK8hABgAUTNyQwPAAAFaTBgFMAABQonBBoAi5c8BRAUCgDNz85FAIIPnJDDiBqAOQSkIYEMAKBJAwgNoEEDAAyASgbQMAF4AUQrz05FAL0DkE0AxynQFgFEDkFwB1BVAccsAG4DgAQBdAyCoEIvDjlqJm5CiReKoCdBeBfgTQdgNnNUCkB8QMclwHAAUCZyWgACp0NQCCDbB1AKiReO8BQU8A0AfgEoAQBgCLwmgWQCwE6AAXvB3A7wJoEXLaAlAY5EASQFvLaC6A544ILwG0GbmSA2gdQGAJSBjmLx3AmcuOXHOMUuB3gMc-EHADqCjBm56gcEDkAAXiBcA+ciAM3ObkWBMFRcmQPiBcCt1l47wCwFvOoAwB15kwKAAoGECZyKAMgIIC4EmDsB85CgMADHPcCjBSAmc7YPiDngALm5ugFwGAFYAFBF4FgFwKwBXlGAvA+ctoIUHBArymgxoEoDIErnBAKAcwOoIwErlOhVAjAPwMIFID5zZQXgXANaBDCUgwAGAJoJoAgDvAIAwgCAIvAAXgg45TocQBgE0AWA4AJQCwHMGoCLxqAlcuYAAu2AuAmlzc-ECssMA0KAFLgY0CvJdAFAQwYAYQF4AAWRKFE8cp0JSFYCVzVAaAOYCMpkCsAcgfgAoFvLsDuBlEMgTOW4HTnIgugfgalXMHUA8AIAlId4M8uECaA546gNBboHxBzBxA2wRgAAsOVgAFAcAOAJSDQBIgYABQfOdsCLkAKMAcAJoPiEmCVyY5qgHIFvKCAYBjQxoXpYYEgWVz3grAOeEXJKBbySgccm1S4DqAxyKAAC5eEUowBgBtgdQJoAojgDvBdA1KxgMQsXglA54ugYQO4HznqAKACAHINsE1VgA2gi8TQAgFwA8BSAIi9QJMCCDuARAJQHgEmosB5qi5FgTOS3MXjiBKQACgBXABcCaA6gkwdQM3O2CZz85c8HgCUHqXUA45dQY+ZMDqAYAAFW80YDHPeCZy2gqgPwIwDqDMLgF1Ad4JSGNBFzbgIYNAFvPxB8hcAACpoLgHlW4BqAIYDwM3IkXLx8Q6czQAokzlzxNA6cxgJnMkC4A54W8yuXHMmCbzKQ6ckoCcoKBzwIAcwGeWutICaBl4pAAoNQHzmLxSAQQKAAgBXlQAgNmAXACUGECVyV5yigDZID8AnKEAmgLNXUDQCVzRgXQfOQUBjl4bwQ6cueKoHZXCAV5JQaOewH7lBAZA1AcEJIFPVBBNAlG8QJnNUBbzl4fgFwF4BgAxzRgaAFwOIHcAIBF4cwdwHAHECJzxlLgSQAgDjmQa45wgXNUXLmCaBF496wwGAA-UKIFETC1FcaDgDpzF4eAXAAoDLltAV57wABfiCLk5Ai5XgYtc3JgCMASgmgUYIoGrW4BGAugOYKoE0AFA-AtqrwDwEYAyA54lIETeIEeVwAeAUm-BTAD8iMBxA4Ie4J3JXmsBBlcwOADkEy24BM56gABX4EMCsBGA7AcQMvEeWVyHVeq3AJSBkDLwt5kwHgG0BcCbqygmc7lfKosDGhqAYAOoHMBjk5B7lGAAVQgBcCUg95bQBRAgG6CZbqAJQRgPqEFBNAmgc8JoCGAUQhhTN424xeoFIC3BSAcc1QC4CaAVa54kwXAMaHeANA45Z6iAIYDqCVzcA8ygoJnIgAhgmgkgcEHPHxAlB3gW8ybXPAwB1AwAjAQwKMDaAIB056gJ0AoBjlbzcAkwVgO4Dk0WB+QK8-baMAu2kBRVIGxgHPGbkrzDACAIxVvPcAKIwAqgJoMMtIBQAg19S0YHABXlGaFE4gSuS4AKA8AXljAfwAUAwCLwwwRcoIA2vzlzA-AfgLAFnMpAlz8tSIBAAApgAyAKAW8qAF4EpD-zxAkwAoJoBjXjrtgvwEoJMFIDCqt5c8GAJoGJX4gUNaAOeDHONAYAt5CgCAJfIURzARAhgZeXxv21eBQdIYSua7tIBFzjQcwXAAogUBxyY5uAJheIAgAxzM5PAT1XUCLkTKQwwgJ0CvMpBOhM5aATQF4C6ChK+lc8E4MIHxB+AddowczWgC5VOgMAfgdQLtoAUKA2gImuoNsFIDLwHlYATgDYpnltKggMciwAAsIUIASZCAJoJMEYAUA54lcyQBrvCXCAdtcquOTID0UVrRgza6UJoC3mUhNVRcyQLoBKDNzjQW8uoJSETW4BdAUASkAoigBxzJAAC0Na5pyB6LJAowJ0JMGa3DqV5EARxZMDaCWL9dcwUNZ2pDBeAF9OQcTaoAAUQA6gkgIuZSBcCjAcgTQNoJMFGBbzDQcwe5c6FEW4A6VcwY0PiEIVQBJA+IRRQCpMlzw6dAyh+UBqCAwAV5888QBKv-mFyXA2wOOQUG2AeK45hm1QIvskAwAbQNiwwMnuXjNzwQ7ASYDIBfmQLbVPAZeDyMrmkAZATQDTSTMMD4gEAbip0E0HMBFzSAK8jADAAUBQBtg3+3ABYEkDUBVAEAJoHAAAXeK45MAd4HHMrkKrF44S5uevKdCjy45CgKPZXLUNR7hA7AReHUHeAIB85OQIIIvFjnpzqAuAYQFvJkAKJ2A7ASdRYDaDgglEEAIubgDmBgAmg1AJoAgF0BuqEAFATOVsFEUwBjQUAFeaQEyV1BqV+IdwM-vqCTBDAmc2A+xvcCbzGAkgOoHHJcDUAC55RiwJXIQAKIYAIYZeHHIK0uA5g1mmOc3OXiUhtgfy5eE6GNCTBPDfgNoO-LZ0KBwQMATOQArpWEhqAMcrwM3IUCwLUDowXQE0DQDeGZFRiS5ewHTkkKYAMARMDvo7lQAKA8x94F0DrVeBRgHWlee6sYAQAvAXgbYLoC3lgBjQqgagIYFd0erxAc8OOaKpKCGBSAW8goGgH6UWB2AZG3NXPHEAUAwA+c9gB+rJXbAeA+6xgO4C3k0rl4owMAJnKLkSKi5fgdeYsu2AyALAMcvwHMAQCVyy1FCt9YnM1UUBJAEABQOAcJDiaXAugVQKLq8C6BwQzc0gBQEpARB3AbQTBZIDmCTALAc8UzcaHYBFyAdi8MAIvCLlNBYg+IQwNQAUQRLxABWuoAKuSMrwudHCouYusOOhbcArAReJMHTl1AcgoG9QOdosDLx8t4gd4M3O6AyA5g5KvwCvOblzA9DEAGABGBjkLbxgMgReEEErlybcA6geZYvAUAwBNNLgdQJnLADvA-Ac8OACGC3npzEju69eZrosDpzpltukMO4HxAUB3g+IajQApDCqAjTEABRIYDDBBAmgYmkpZ3MpCSAr5wGmQG1upUz78Q1AS42juRAKAvAmJ9OaQGblyb7tcc0YLUpPmjBWAPAGAFsraCsAvA7gN7ZyHUCLwuT7AZucIHeAYAiFlISkMIBcBOhq9fgb1QgGXiJGVAnynLeXoQC6LxAPIjALEotWGABFEq0gMaC8AFALAjARgHEqoC6BA9im41RKpcDLGFErAW7WcfUDuBgDGa1gLVpK0lBdAIKiAG0DmACaIAn82zaQEXijBfFUyzOaif5WTAFF6cgjfiDqDNzIlqgItSGCdDqBl4ugQbeIBjnqA89eC0gJFoAVFztgy8KRHorjkIAQwim9gNQCjW4A45jCpoMIGND7a6gJQTVXHLMQR7SQ3+toF+buUQA54bQSkHHMjVzAnQmgTQDADnjpzwQugOwIPPTkKJ854IfUO8BbpwAhDxoCgCUCgCXqoANKzQJnIOPHznLowQUaMC2VoApTBQVgBYAUAWBhAhgbYOnOWDsAT5EYZuTkCou6BWAfgY0DduoBwB85CAc-ZXLsUlBEzYAFeXMDPnELdAAC3AMCaaCqAEAk8iwEED5BDKvA9c8QIPLgBzH3tlIZBboBKOjBKQHi-TY-MMB+B05rAEMPnIt2sAkQMgBAAoFYCkB3AQQVBe8EkBxyMAhW1QPiFP0P6gjaiPyJIHcAWAZAK8goMvC4OR7iQl8oIDwAJWZz3g7AXHTHM0CkB2Ay8auTACaCLw4AkwTOU5YUSVy4Ai8FvQfJZNrbQtK8iVWtcyvLweACgZC7AAsD5zdFPAFLbgHE0xzWA9+vhdQZkDiAnQIYZnbgEXjw6e5zOgoBnu2Csa6gToUYC4EznKaSgxoReGSpcCLwoNfgReBACCPPz8QToOOSvPzmH74V2J9OcaBJm-b8tkgZuUXLADhAcg1xngPBd0BI6mgMczzcadwDghhAcwGADxfFvCBgVrAfOQAraMtnhAySwa1vOTukBW6sBhAOcqgD4hD9KwGRYargDbBm5c8fOdssmAKJqAFgXAKoHwVM6tbwgMAAoj40IBhAkwe0KoCQOZza7Mc3I66ZjlQAmgcR0w9QGWAWALA2wAoCUBDDwq0APAFoHHNavDLjQfgIIMic0DCB1A-2lwKQD8CZyLA6ga3cIAwBzBBjCgLeZoBkD9yFEToKAIYCdBtB3A2wDANQGI1f2wAFgOoCvNUDerVz7gR1cvEoP0nJADwYDVcs0DNyvAMcmOUEDaBoB5lJNkMAoAwBeAtrlIYBXAAhsKISgTQdwOoG2Ahh-LlgZnSvN0AfaSLFgSAIop1vvAV5W8rkyvPqCbKYHUByJXPAUCaBZtTQVdTWrZAbL2A7wBQIWfUDGgsjmawhQLcMCenKtjZqu7mbnghhsz7AOOawC811nfg+IJRIwHuXkm-Aedz86oBKAFAEA+IQa5oAAU8qmH4IU00XIgAyAXzEAUYCnN20ryKAhtgoAojnjLwMA4a9oypr8U8AuzYAXE-GveC6LWAzcykBgHzmdH1jTocEAoBKDuANjzuyIFDrYDuAYAQQHIOKvznvW0ACidOQYbmCjBtgkwfOTHKX1OmPdFAb1enqgD5zYAxoMAEEErVAnjQ4Id4HPEpN7aFAWy3QAgBjkhgAFtwSQF5bAAxq5gTQJ+VU7+BlnLbJQVgC4BKDtLSA16igMlevUcLCTKOiwCUuoCN66gMpmAGzvxDiAygMAMAHMHBAWAvAdm9OUEEpCtWKAy8dgPiFYuZz05BJ3QPIZP1xODldl8QJY+XglAwAQF3ANEvYA2meAbakhenPXP8W5glcuYzwBjl3nk7MgFOWtdYC9LdACN6gJU9qsxyurwGqS06HmMBPlLjAGOUPIKXpyt5a1lpczuURcnM5Pq5ufKBEPHyiTS11QOIGyVzxwTnSyQJoGaXvBDAFgZEG0HJfQ60AXzpBWOtPuwbqAdd7GyleZV+ABTowQwBAEFMG3M5rACO5SDqB1Kf5bQcQGgHzniBANJQBQBYrqDtPHVSKyuWPZR2VzGAv1zIxgEC0LygLCZ0gHersVjA8As9-c6UoQB-Xm5qcqzeUfEBQBwQVT1LX4DqCkAs97gCVeXI4UFAYA3V40EnZcB7Kt5f2kXSTZe0fbWAlIHILoDQBguKn31zQOwE+tSBdg-itQyvJkBgA-FVx3QBXJDAWAmgLaueHMDQDpnG9owEMIKC8CSBtgK80YDEeNCUgSgFAZuSUHXlwBJAc7+mxhspCZynQW8kMB3J4DpyeAmcmQB1rQV+Ab5K8mABgAUAhgTXdQJhTwH1d1HUbMc0QLsAgD4gvACgdlTKdrs8O6gD9kTQuo72GAWVLbm2yGFtOkBwQxocQGprnisBSnoihQGgDAAbvVjiYF1-iERXsAHLEAdOTHJXmLwFE2a+5WtvxBUW3Fl6oILstHXqBxA6cvC5mbxXhPl41AUoBADdM9B3ApAUgJSEYCkBJgW8uYCsDjnpyLAaAdQG0EXVtA54hgBRDgs0D5yYA+c0YGspjkq6JnENtgOs+zuZyQ3Cx-J4mvoMKI9A6gcPTyMqMQAcgcc55YYF-XqBsTsB3QIwHUCr654vzwFeCAE1Tym1FACFV4CgCdycglc7YOIB5uYKmtjAbYG0HxCLxK5OQHIE6CdDDax9wgHgHPFv0Wb3Alcz693uNBdaAd1S4QGsqXdYn85JoMZce9acrb8b-l0eeCDM3TytlV2toLvNwAoH1AdbikJoF0DvAi5Mc3QEgsYBRO0nB7mAOoDQDoPhAjClJ0XJvv5yNAkwPwPiHmfUBdAMc-OT-YVW9WXAqgSYMvGtMuAfXKuoufKZcArycgy8dOSvPxA5Ga7p+ht+JrlPx6k5cc9wDWZUdN7yt-S0YG-cJtq2vALgRW9ofBCMAvA4gNM3PHCVSX3A1AbByoHbmg7Z1oX581vJI3pzVAY5yjQt7qDiAAFCn3AJoGMNzAeAwgRu6SaKU9n29+O2UyBqLkYBwQh8tEIwEpAKBZd1Ab+UEEmAjAoAACnIPnL007BydmcykLJuF3pyO52xlZRQBcAKAp1owdHe3JU3qAMAihk58aHVNOg+QTOhRPzsrmQbvn2wBQOnJO9Fy11KX0YKMBgdJGYAKVnx4vBuM4Lm5PtqxeCBKDH7bXowc7wAq8CsAZAuX40Mk6OfiawLQZyYH4betpHhAFPtAPdvyNehRg+Id4CDpDV+mmgkGyHYgpjnUBtgzm0wx0A4tH2i5BQSYACraA5AFAi8OeIvHYAbzxnugZ95MH-tOhfl2wT5awF63ghZFk93yLD7aU0AV5lcp5Q+5P1fbWAgNgl055DD4goAXwBRPar0QA28lvB8QDK8FsPLUFZGzbTkHeBwAmP+IDAJnJXlCfY14ITI2N5SVRW6g6gQIEme7vUBSAbQNQOokkDvyL-YAOOVvJfG5OhgDvABQGAAXycbtsAQgQSkEDWK1Jsk7uAlao1Zra5ym4CZeW8iqDPm4gAyaxG1AC3RQA3funKWGdHmACy2qXqMDvAG8nMD4gYAE6Bzw1fk6CcA3JnUB86aADICW2mgIhoYAjGhCbUgcchT4laRcnUA8AW3nKowAhxvLZ7mvNiiDbWqpsaCVyUCowDIKMgHuaTAACjyIhgOQCGBmqtpviDbA1qrPoKAOQIhrPWBWiFpBA7Vm0DrWBQAoChOIYB8aMAOQFqAWmlcjABDyBQG-YlAJQFl4EACgAEaLwg6j4ZLuTQO17n2n8hAD9GowEED9+Y7kEp+A+cpnJ+A4IPnK6AdQEJ4N2FALHrSKpKkXIuAvOkSr4g4IAArL2aTsfrqAXgJXJ3Kjfmb6Mgeup2rFyhgNzZluJQD-5gAg5gvoQA61gA75yxoFzoxyRchQDiB+6goALwRcgGYQAqPpnJvWKeroDDaGAJSC56zerIoR6lcq57EaMhnPCC+57jIDggbzhYrLwdQNBqZykwC4CEKYLqQDv+LgJXLCAjABgBtAnmhUBbmpAAohbywgJ0Z+AshuwC0KxlhYDh6BKgApBKIWkr7tWpAJHrSajAFhrN+MXl4BV+ehuCBBAy8EEBrqOQJIBjufBokqU6imkECKKQQP5YC2Fri4Cly6CiUA7G6qluZ22hrrE5AgACqQDjAmgFCrAWcAOoAWAkdhBrPu+Xin4i67wF4DRBy8IkHvAWVhQC6A1AFFp+G1IO4Dx6MTqjbsAzelwr1afhj-adaCVlp5zw5AJ36yAVlhU7LwsZiqA8AoznUAQAPAO4r1amgCvKbe+csVqMODLpMD+Wa2uCDVmxkqQChGLgKEpxyupjkDVGzQD4aFBACoYBwACgXR7uAguhuruAOHmMAuAhgDkC8qFAI05hqW8qup+AuKggDWm6bioqaA0wIUCY6kwKoBLuqSjkDZudQFvLhKiHhgAZ6aqrgDuAYliqrvA2wIUBw6wuoiEvewSnCYKIQQFl4uALwXUCueIWhQDGW7gADZ-AUwe4Cu2HmsgY0gfgDCqpeACpnIFAjAOCBQqm6kAqWA4IJvZ7aACmzrhWfBk6Bh6iKm0AQAmZoH7LwZZjAAUAxBtyHOamBsH4cAdQFOZgKMAOCrvAT9uwCWmSrpID6qOuic7L2Uehepgu5BnMBGgSev3bCAcAM3IYBbQNcGqAy8BVaWGSKjvI8Wy8ITbLw6gL-I2GCgLoDY2MAJnYY6cAJXpUWGAIwBOgrFuoCGARgPnLYhhug6BjKccoRacWuqtJqqh1WpQ6HqP+nPAyA7AE-pFyrAKoDWumgKCoAa6gPnJwAEeg972hn8nMBfO4yi3IuK6co8AhgFPnMAKI5dlAC1WcCpKZxy7AE6DuAMto4pjq+IJICTAlylRaUgmOgkE8AqgJIA8Ae1hQDgg6gCD4NqQyl+YB2UVpRbuA7Xq2Gi6l8hT74gPAAojfWOQIpq3BqRspY0Bbepgp+ANhuwAWIW8jwDsA2wNcbCaJQOoBz+UXk6CwOlcmv7sAZPnABOghgAUDiR37unIKGFPnAD8aRhoF7qOIYAFpmm5dhxZSgAoPE79qBQOnJ8mjqjnKV6m9saaTA4OhYDNycAE1H86s5mRHNyjftQAIm5jtsAxmAagGYUAK8uoC1OuDgoiWI7gIbqtq4ipMBF+HYcEBQACavE5zwsYIYDvWjACwaJe4INq4G6lGob6ZqzWqWYrK55p1oKIFgKeHqAnAO8CxAEweLouARcvnJby4ILbp4qvsh9q-WE4c3IhyQQD2aMAutmpqUg1AEJ7eKlcgUDiAugIh572jANoHSKvYX4C+qTygnKkAugJIAuAzcpWpOgkgIwBbytYaQDbuI2q-Zu6iYDWr-GkgAib4gInscohuQFscDpy0FrwYryTWnCYce0xqCFNAh6muaaGQQNB6SmOQC04vqMcqJ4tao+sIB3qEyoYDj6wgGU6qOnchF7UALbgUDGgyBpfo5AcetupdRTyuwDCAjzmgCPAmcrLYhg45s5onA7AJYEDBwocaCO+xoMIBoAIYKHY3B7gOs6TAFViboxycwN7qKGtOmiYQAJ8lpFnWMALgCD2Y2uEq2B7wGu7LwTGqQCva-wEib9yMgGJ4xyPSkog1GowFRYlAcAMe72hGAHUZ+hy8DUp7K7qk87cBs5mZbGg6gOZpqACgBQCkObQC0b3qEAGRqg6wWglbfq6gEYGZyvcjWYxyCSn4AjGcwBFrbKbAQEEFA2QJIAaRYcb2FXGuAO8CZqK8sIBx6LBnJE0ByiJnIYAhgLirggEGo4Z6RS-rsb4+oTgGbeeSDrHJGgqgPPrqAK-qoCQAYAOCBFyQGjIAAKMRv2rUGhQYKquOtdqkGtuqCvGHsaUmmOrcOHuubGmqmcvAoQ6J-hAD5yvat5G4AnQau6UgndmgCrmJfpWH4gmdlACJgapmAB+AToLgpbWtzlt7yKKyhFF3OPXsBq4AfgNtarwmkRYCsAkgL-Ln2XUdQCqhyJl4DmxMeu+4QAB9unrkG2wHMqaaTQGB4kxt8hwZbyCiEXLuAlIOIqheC3vnIDKFcdEEeq+IDAAWAZ3kjGQWxBs3JOgX8QXICaMgAIbrmi8Mh4Qa05tsDuA7AAKYKAQQH751uSZg6AzKFAIvAxRagIvCYx5qpoBVOXgO8BOgFAMYEty4XlioIuW8uoi8qCgBfrVqMyowAYqXwAQ5iaVHgh6Q+BPlAlROqKqQDiATQHMCbmSWp-6EmMgGHqAqHelDo2qpJqIpra6LpMCtylINHYZebsbiEyR8xvojsATQAoAJGwOtsAlAXupMDCuswd0rQ6TUX9Y26F6uoB1GSau4Cy6MgOyApKkjs0aVyfyqUqqKHCfFqBxp-jOZKqTjm0DWWGjur5wAIBnEYZ+w1lADhRIoTABUevOpoBOg6cqlEQAMntaa4A+IG0AbWE0dFGi6aAJ9aMAc9vDYrhkquYbvAUxpMBL+5gOzYUBLanSrvAPHpOoyAfgH7YpRO6mW49KqgBdqMazuroC6AxxovBZWmcgDbkeMtil43qOSmRawmqIXR5nyyViXLbAeipp6OqfgMvA5QnjnhZsJA8aoBeAttkn7UAbQAUBRBJRhK7NyM0e4DNy7wCMrcqcwNsCQa59pMEp+GATwkqKT-hwllOkwPMlqmACobp6edQBQDEKK8hvasAcwM+oHK45hKqMaI2n-bNy+irjqKAg2j8CGAJcuCAZ+PALoAAGDzqub5Gzctyk8ifjpraLwIfrNaUBRxpgqPmfSqMDiA3+qxovWiWo+oypGACipYWAasYkwxeUcvaYOW2i7YtargftrI6RcmgB-mW2qoCHu-kT44QA2OqoBTWToAKHOGW8txF-WceqKlGmugAvKQW1hi0peAjAKLbUmCgF7qLw6cil69BugBQAqqeKW0BHWaHgW5b2WQE8m3GJ7tFHbAw2gAqrO3MTkBTKq8C4BoAZduIDYmCgLXp5B7gIiFha6gBooAurZuPqimCchyrGgpcmkHrhFjqMCiqPAJkHY6GAI2auRACg3F+AP0bWpGAs1poAYAbij16WRc9jwlgAljp0GcKsQEJHc2DMVlZzAickm75hugAEEIaQoXPAIAU3hX7rOTyqOpXqrYX4CaA4gM3I8A6OtUpYZsVuoGH2TdGADaai8KlqFyAtkjFS6fUTDFfGosTBYUAZFiGrGqI8lt6k+n0cUEraC8apZ9K5LnspbGqwetHIRQhjwAyA+cqt79hLgJn4vJ-fjwAr+edtQAiBGAJXLxqMKq8rNyQvroCjAFgIWajRcAEnGGAouoQo5AUKgKkn+v1tT78+JEYlpxyK-tSqLmMgAnJrJV6sIAtWu6fglry0cS9YdyT8jAAGmc8bAaZq2wECpMmLxqMAKIgGd+ptAx9gAF++cFgohw+7yZNZxyrTlRY7+IQQUBxyRxjIBYKl8k-4xhwuooleA7ngUAg2OQCdpoA5kQsHzBv6pSAVW1KiVrm238nvLhA6xr6o2gX8u6qZyySSy4K6NuioqFB7ACG4KA1Tnok5A2BsaCJyImsi7tmdtlOq-KCDjHJmWiGZWFQA1TjtZlOmuuICZWCABgFkZkwE0CMAPFnvITOIYHPAlAjSjkDGgqxv8qqAcwC1YXO1irb6cKGOk0BuOjdgCYmIkWuUYBBlVsik1uL3jADM6zDi4qWqHMU45vqZzg0qk2Nrgrr6RIYCSY1+CmZMCDBjyjeG0mdQLT5wKXclAC8RXujkCk6vgBUrieFAH4ByRCiLRZmZdQLoDqASBmCnXG+IFWlNRvdpXJlZYxhAD5uruuzrAGvqofEUAmgOkbGgXtugY8ACNoB5ZquaqMAAe1igArZ6Q7hXGUgOAKMpOh2wFCa+qm3u8B3OuLpKpcRPQSoFVKzWddY02CGi74Jqoym6oWAj+tqrF6kSsaDiKGAPfq9RUAPlpJyKsdQCjaOKserLAzOknG6JnaoYCiKhIU0AvWgkWiotAhoLEqWKCcfnJxyjjmkYNyQQIOoqBkgCPZeAWzgvDsA-2qnI-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-l62XGiUBzAiUZlF3BXvt-KrGKaunIOGsnpnKLwGADpYjqFDWQoQ2bclIlRBBMc-IQhuOuID3aaOrgahKVXiM5Ie6ygYZfRmypI5I6S6S0ZnatYb94xJBQOZFQA9qpoATqNirVmLwJ+rw7LRwxc8qB5YjSUCUVTihApru7xm0AyA7To3HqIYAXPY1p0OpXJb5znhSaSAx-goDP2auqoBfh+CSXKfmvsTwA4RZRtznMKHqoA0DusSiUYLAEuhTqSAUJpmqqA3Vj0kWAuSsvD1As9iVakAM+u3Y2pscshbqquyrs08AQtU1XsmfRZVUPatOgN45Azhr3qZymsYYAF2App3afWxgcIDtK1KjYaPeL8QpnXWT9fvo+RF9svCy2JkkXEJOEnn3KzqW8nQGk+N5l0VRWh1UppfBPiuF6Nq-SsIBe+uDXD7Qarmt24A6PACvK++Xtk6AlA6cunlyWS1nkBfxXLixrpytyrjY8umcly7na2vpcbYO+EZlUfNi2gsYrySqjPrvpHFrVZ6mjwDwV3y2cWgCxKrKWnIsBPgKlbINx9Wapdl-5rdqJKWqhvaf+7wMaBpBinqvrWON5nADq6NPvTrNy-Br7m3pulhTG6Olch-IuAL8jyr4OLGo9nHGlYU6BJa9crIVwA23rmZPq0miM6SmbKtu72q2qXer2K7Okc0JB4xcnIZyBQL1FxysWQursA3+gog9mLbkEBAlJQKoDEGLyRkXwh5pTL4DBY2pvqiagdfCF6W1AIjqABUdWBqH6SqiVbbq3OkvCjARcoB6BAdhZAAlKTSou4Fq+DvFYg2uAKjpzhhoOiU0BWhqDoKZBegJq6AfgCfaBxlpjG4fx3QNxpF6MAHHI7+foFvakGKPhKWqAxoMvBGmbdjVpgAUQQ5rZAlagRoTqs0ermLwHQBBl7l46t+qSADNjPVO6Y6gCkKA0On7aipXyUECS5YCg25yeUABHYNAacvurH6RRXMD5yapk1UQAWGR1aaAg2tUYrlBQGYYwqMuXGAIAX8VTawGPFZ8CdaMcsUWIAGBo-qBBUiRwZcwpAFN646mVoOY6gDdowCTABipUEdOLikDqOJJiewlrxUpTs5xyc8DepOg2APJkAK2mR2YCpc8AWYkyZGpq3re6tTPJV+gNiUAPKSqnMDKJW8lp7UAhIULXqR+Ku4Di6LykBavNI9iZkFAI6vnLemE6tOYLyx7rMWCguNmAAXNUds4kUAhgHfoWAlIJkDPGZptgm6AfgawBWSprmZroKLgD0aCqTUTEpzw7gLOVBa2VoR6nyAoB83U2b4dqqD5cmtRWjA3DtAWygEAMGpU5McrF7Da47q-YYAxwDE7GgEdtnoNyxZZ-bdyTQFwox6r0RSD0duJtb6FhAproDNGMpvBU8WzNUOqZ2H3oMqDqJQKQCmxtruuaJ2C+m0AFG6DkMo96JwdOmlawgMfqIxNATNm8KCgCd69JplXN7WJxoIkHwGfCob5OgliJnJMtySWR7eyGKtsoPKMXWgB620cTYH6xnycV6MAK8noVOlXSh7XeuKNhYCAaaLZ5q4ALcuPrLwUAXJpKqK2kiBQu82s-Y3ZWunyAqACRQ9oJFqWhF62B16svCZq+Tmdq15rppECRpcOhkWEF1OvhqWxDflCoauXQDyln5cwO8AQh1zpdamgg9pMDMdHDShYU1yelA08A3rida+h1+owEvevwaUlrm2cXPA5AVAG-ZY5DObc51m4kXZamN+IHHKD5DQH+UgdUVQnHJuDtvrll2DiZvGlxGAKiGfKBdvZb+llUUHWZqNoXAC8Oalk6BVa7xpkBFx6clfmnq3pu1YuAKBVoEehhgPPYcxe5uoBzArDlABWqtAdPlLwFAByaOGzOhhrF5NjrHK4AP8imaaAHpgi4imhgFGl6mS3gznc53VpZlpKEGvr1EOK8PuGSqSRlvJpyugH+X8gaEZe7mAIitMq9Wk+pJqUFHuSXJfOuPv0HaxADusqZKIxo4nDa5atWoc6dQGR6r68csvBsBZffFp5Z1CuJ7yJXZjU4lOhQFyBSKmKfAo2G5JfaUkJk1ljkkaBoW6mFRkriM4WhAajBoYAE+cvBwAcwBTF5KMpk0Dpej0Wcbk2jGuKr2GiWaLYXNlOg6CbFL5p06ohMgCGDaBCgIn2kVjjrw50KWLgcbY9rpvSEuuDWZXJBh+cuKlSAvzpgZS5KcUQVsJScdwHua+uvmFMtMylvm56tPk3pKJDLnzr4Vg+bxGiWxQZIDb5lnZXLVyaDkq5kJEsWc7refSmi0jWadl0Xip1Bsg03qn+S07n6Zjj7aMKDhiRmi21PiiZqILgOnKCxZmc978+E4UZZIOykQUYmmVAHn4PJXLloUHV3RqvCL6HVgE5OKiCr3I21Humarl20ljHJrJTft-Jw+IgMvAjBrkdsVoASCgAGWAmKaTbvqMCutbSq3Zj-U4KRajKnxq8BgXkUam+nUB12Emnqa6KEsawCZBhclAEKlW5hTryebQADn6+2ivR2vK3JvXJgAKBWyqjq+qh235yu3mRaTxeShpkbKfht8305MgAaGZ2GagXrFBYcaNa9aDmemYJORmusZpOU1r0BoA3OSWFzKjACUaUeTlmd4fZttkSVoAEFpGHOqqrcRnbAWViXJBm3GUlbGg9weIrgB0ihLqGgXOpIDX6UERs7sAuUUdWJqaXlc601BQE-EQATDidqcg3zQmY8ALusNExAcJkXIIAJrqbEDqOQDl0nK+crcFJ2bykQ4yel2uk47Z6YRMGfyDOVvJ+hOhRQB9qRYYkp6AYesOFpO38Qu6t5AWvZbd1Pjf46fZe4ZTbsFqxv-lBAXzubZtKa8c-6cBWVllmEKig8TkYAwesLbpReZrtq4OJQJnIulYjccH-5CiGMba5rAOqokWlRXfLV6hoe3aT5IQPnHJ2xHQojoK-DkQqbKRJobZt1soE3qaA3uqcPYKJDraYnu1AM7ErKTFribOWugPm402I1XPB-K-7qo4oh6qp0615-AS6kUes+ehG1ulYQ-oXqoHbAORgEOkYgaeUYEc4JB8huwC4aeo9sAwq9XToXGgbOaGEAKvyo04z60llrZwuGxv-YMxQ2pXKzakaTNE6Fe9io69ROiTKZxRJQPqpnyp2QRo5hIGr8Eo2eGuwAe5GZSOrUK9mlXq42NoXHKOKOiWwbsAW6fbaOBlcvEmVytFrRpNAYWnTZw1zelyCOqKuT1F86dhl5qkAE+fnLLwhVipqOOc3jKW62oDhk0ymjiJnLE5p6WgDKJCzZXJkxwappoTKzVtxFzw0cr0oZWRoL1pQ9zfkZkv6lgAzGttC2hQA-5kWrIaohDhvqoUAJadho5AMgKlG+O59uzkjyLgPrEaF24cR2POIYBBohubgAIVOhJQMjaoj4ahabkAjpjyqNmR1YtrKW92lcE8A2uTU6ytH5jIoWO4QIrZzGVOTl3HKoyvubCJvw2J7pyK6T+ZfqqIQoDu6ege07llrIyhrkdU4yGAtDxllf50lmOt7WrqSvXqoCWbxcN7vDxEf-UrjvvuOZXO2wDhHMdz1qoAwAuTjy6o6TqVM5cuKKgAkeuZpgjZZebBenJ32Y8u7HXWYMXgoKItqv6WpZy1gspgA5Jl8EdOXSpYgkmEWoiriGhyXG6-FzhUvYlpKVlkbLwAyumGSAJQFGH7mrsTU5by7wG0DsetVkjW+9s+pROdBXnimrH2B+pB1tWYnYyU-2Sxfdr3adQDirvAj+iyGONUgDtoauT1scrbqZJhYC0aHWS+qqAGAEloM6lEx2HxjHiowAihTtWcq16+ri7bBdWCs8aYpzLqY6jATQKKqvTnQLUqqAiE8gnTynal2YpuiyUPWnRjhVao3J9gV4C9qoNpeFJeotlapVKo1Zb4k6d3vroYq+ur90lqCAMF1AqnxkAq2u8vrikxutYzIBUFGNXJ4u2H2e+aMA2mkHZ-KXzroBxymciMGVWd3r0EmtgqWVoYdKikKqHqUDep0SOCRmOam2ZxfnKsOq6u2rSq1CvOF1AmgFFoA1d2loZQaeKnDUTGyoIWGo+KsajqwB7yhAB8h6coepwJjAMvCiq4Ne+6XuT6gJFFy1TrfaqAJfj0MlAqBoBoqOP6eOrLGGulvL8glvuIAuh8QZ1rpR6cvwbjKqgCRH0KP8npbydVE4w4IAy2dSYCad2l2log1ajm0AKPUUzHhqoal+kq6s+Rg53OXKiurvGfpu3klyLgEEBFyJSm85cKmRvwE8GxhrnpVGEwaCPzlTGjepkm+AFWqdGKQYZP+RWKlV6iAbym9oxyXZea5gApAeZW1lTQIKbzJ8MWipFy9+iDbJyMudHMUxoszykkZIcnfr1djhZHbQGD5iZ3PWVvSvJBACMZ3KDzkHdqoKA7wBmUbqaui64Q+KbRqltAYNk3XBdwicUZEZ4TnMAcxJdR8qERqNo0EChX+kXIzhBiA96YJ1qgAr-Vl8sKpJZuOmtYu+liMmGhab2uh5+O3PsfalyUAHWobOxlpZ3RyA5WB4yA+oKGMPeK-h4BnOJbqQDKgrVuyqUFXgL9HYmA1uID423zYZOsqViu-532Xdo-oKB6RmU74qlyn4CMmD5t3q5mKBRibrKaNXqMl1KBXoGQai5myAYA2sWWYlak1vy1xRTQDwC6qr+fz75yaABClF6RhnTqoKOUG71P1xwL7GneRcufYg6E6ngCz5BaWSotuLATHZIGaADGHOKVaTcrIGnwNn1KaAahzFeBMqTFGhjeKXOYVOsWgs1W6RiCuPQ6D+tPKrG9djqrRGihrWldWIqrvK9ARKdzbYh6jtY7uqqgB1a7e9JixaNFyxtTO9qpwe9asArZoI4-5MWvApZDkEaa4bWQQCGpP61wUaEWAV+X5PxKIWs4FOgBhUM64hpmhA0ApVelmWrakue6oBtNWjpOGAQYfyqKJu2ixrRWFABKbaKxMjE2Ia-Ov4Cspy8P9VnW1iXPHExNyqjYZuMbiKohgRckdWQu3kcmEwAsppY4uAMABN7-lXQO5q7AwFtwGSpCiOPrducpqMol1vfkUUpubILfJvVBSRwaIO1CkFVOBeNmgaaR8QdsbV+OYdxlbyi8Ku5sGUwUH75xruib7uKb4yQ35yTGu065GD+VbpFWKcQvAwANPpP5k9otiGAUABQPiA2O7ul2bU2pAWuaDmhIWtpY2P8riU+AMrYA0DxLdqwYRqxWi94m2stmv3MFQWjtabFdFd1YbK8ehf5qB+Rk-FgpJ-q3ZWKyFqw7F9wgUn6fmdak8nXGlPirorum7i4DggqXctYtDU5ml6SAW1li712M0dB6aAzOpT76pgLdoWcWFCpB1VyKDTLY76B0TlohWhgJcOf23U1-qjARxkIFOpTgboDpeRsx3nbF-5SoG7552hT4VahgLxqELaqqZrb5LgDHLoOxfSl6gWT2lRMhgHGmgYUAiemI3XBPiohofKczjyoXqJXUuakxG8sSojBP8brYB2s0Y64cAcSspEUdlFmp2SaJQNQalA11oKVya66UZlIm3tiIFsN+lRKYS2XgI+6WK5pQB4aZs8vYrYmmGcWsvp5AAYop6OiZOtOgugCb6DyPZhaoruLiQgAomsBjIDrO9eh2Ht59oRvoNxrai-Gtal1kFOVaUubCrbA3QCTZ2ZT-qY61mDcbhr8pCgJBFgAMYVJYwA4gL9qXdWNlACeaikcR33eaAJUZcKVxW8WLuNiiC0CAgtoZPdmCIV30GayOv4D86klqIqzqiai4C4KfcgAqUgQriTZfxvNokqf5WnhVrFGDszVo3Bj8lKaRWPGg+YZyTyfYAe1HQAg7LyiyhBqdKT7VVrNJi5mM7k5CpdJZRd9IUjF9RfgBBobxEdnUoMNbHSbaVqd2s-r8GLxtKORRyHjJ4VaXgPgZom4gL4rpyaLinCGh7OkQVqq2vjGoaqG8uiU3aFionaBJPeoal0BrpgYjVqHrpXKI+mSrwr9qaSuCWTWAIXO1ZlX+nSoz98Qdvmh2JaawAz9TlhLqWdZgMvBZWZmgZGUgFgQY1ZGXEdm7CANTgUAAGTQKw5TmFMbQo0m+ZSe4GhTQO6quNN3hNFuViWq6aU6PVZ1afRhcXQM66AoaZm5dFto9lDVuAHBYVawfhI6aARgGibFydlmkElK+zVAC4GFgH4ZFyucmQYGKRRXiUQ2j2TvkhgHeegom6aCfebFetpvioHuE+XMoMzWVqwAsu3ui4A+K8npSDiANbmh5ztEKmvIhl+Ec2pNawgP5Y1G2qmyDCgCiD0ALAeKpbaA1yHrZ6ultRa3Ya993bfII7o2Wpp5KCGyrrs58xlF2pZi8CID3hVekuniAfOgHbweToDposaMUaMBTNUPa-pmhSGmYhHzN9Wqru+CAEEY1yBdh+bmuJrc+4nyc8I6vDKyyr8GMAOHhhojq7PtBp1y5HrNrPBxiYBpkmkRUdVHpjrrYDB+GmdKp4xlIHYru+jwCW4WWzwQja5qurv23qKYYDGvjAFji0asAG+gIWdAFipPLvJvuZMAkqbhn4D8mY5lU7uqdOkgYsKLeuZrs5kFhADvalitdZpq0Cgg5VdDyQg6Q25uqaplGhgK5ZqB2VUEBPOQJTwBV+yvqF7Rxilr8q2BmgFpH9qPxY1sYKWhjirtGScZ8q++Mcl+qSmzKvHZDxBQOgrmRdhviDzmowOUEry6Gl8EQ9p5WI7bA0FtxqjRCwNI0a9yFsDry2dwEbOiqDNtKDdeRYR4DCJvy63sKlQ2gkVy2bdu426Ahlkc5byT7bArHAJCVEqAKKxXNHeeyJmJ2wDbDTh74gCTkul7es4VRYHe1OhR5YeugPvoKAu8tqGpy8DiYkGKjAP8qAaDy4ZZBFyiuqaYpcADUalx60dBa-NYWhU4sAxXob5bmKcBgDlKfgDYr6uG6sh4UAuyjqDqKVcs7otqjes3KyeM2mRHHGYCulr4+AyaXKiq8nRBZJytittGsAdAZC5j65doQUKA9rqiVguJDknpgeRJXurweCCocnQesclzpGzBeQEqT5yiAiFbyRoBLbmaTgaZqER+FV4C-O2wCZ1B9qViEDn77yek36IgpTLbMFz9kxvfAfcriY6xGNZoE6mJdf3vnKhacuof6WQCvJ+AJGX4aiAAkf-KFa2eX4A-+fasm4zyj6kEqv58y+wBQTiygXZo1c8OgYXdXGmnmf5+8UiEhgQatPJu6NYSvIJyJIUu4vKn+TL6omEKnKbXZLJootBqzCsLaZAK8GABbtSHcIC+OWzqQAxqTI3a65Ganb+Z8gdmeO61mPIm4YY6G7jBqH2V-io7FWcZv0ZvhMOuoDyqzmr7GZyECt-pgA5yqaAeuhlk3Q5AEyh7o0KR22b6D5oqXk4QW1mmQm3+CAK0fMqpAeao9G7ww7YFtzW8Ioim5OSF2cKiYfg6iaOnp6YqaD8ZAckNXii8suuENkra7ph48aAIAsJ10uttWOX6HduvjvMtwDXSgWoap1ABwkomzqloH7WYxq3sRqxgYAajZmgQdt2uxhqJr7Na1Q0aT2M2n5BbyyHnomEHUALiWJy9asxrfxxBurmKJ3svfJN+cTbVbwplRoOaaAynshYgd9lgIrgTT6f9vuAwai0ohgLrkQWaAzQItpNqGckYif+hCv66NpMzmpZW+CEWC75WRQKN6JaR9l4CV7uqsWvQZGan7XqA8oC3L8q8gdLWJhOptPLsb9ln97gmYpyUBTy+YUzF9N9+YVY-2CkV8rym6csPJ+G7dtlU8T8PtZJeJ4iUSMwq+rpKrumi8MKHu7XyvOY3ZJWm6mEh3mvm4y5Va5XrLHIzgsAuKTqb94RagNZC7qJkgE-ZxWR0Z-6kqG8noB7bLclQVtzVzqQCQdUYZmapd5saoDNydtiiajAcwCGBZduKvc71bqCrgAjnmi0UnDJfygzMhGBDtUtWq+vm0A82DcW-YMpKiPA4U1jia3F6pZTQgBIKO8ie5xys5l44JKowDiX6gfXjwCaO-HUiOjOFOlQWgdFdlsZuOWM4PabtBoWIYfOeHfwFrmVWugrFqHABK5BghOtrVWB7AC6OZK-JhECUGSZoQq9dbykyEj24gEQXGWMgMDZLuPABmXNy80+ohe2tnqZ4PZK8iFqYGxA-xYAKf5QHF8glJkQ68GJ+zfYRhu+eQaTA+kT7bDulBcIXOayCUEBs563jyp+Bswf4qEm+fcarDJRXWkc1KsKug3i20oAnLiatpnACT5LY3kqrGwfoYDwpqIZR7LwgsSvJieEKl3poKt9hGCK9CLpp48l+lrmolAfgEYCAGZWmraZ2aeX4plenxtbGqKlcvr7fWzWmRr8605v+a3y6cnfpI2TVbzWQAcmpo4JOTg5YhdhJwH964AelrHJwWMvnvZIG9WpfbRK67s95SWs8yVmjA8SZnIlAqXqxVOqgiqo5IhcwCyFVOjg0dFfpK+d34vxkgMj09RpJeoEK6NtuIF7q01eDVZWKiiuq3uQdrsE6JFuoePxah8z54EqGJu4C2OxwPnK4Kd1tTZmGB8V2k5AFJhQDDqlcsdqXDK8nUBYeyDhTq4ugwbqrDRxcv5m7GPCaZqcWApVBF45n2XGZhxaNbgopzHR8wDtAMJ5CDMh3dc-YL6EocUZPai05iWsa6By0GxGxMfgDfWmlrqav2VWoJHuNN4R7NzAGet9ZIp-mTaqvZeQD6mxmhpniqjV7am0AKKNADsCdWCCgoEj2RDopn2ad8vXZRBR4YYCUgtcgDbFqEdi8l66eloYCPz8AMbPgKfickE0axkT6YdXmGUkGWGI9s45fmlLSoM-WKagBpWTz5+wDBdBkW2rVyWciyEnOEqY1ljAvpq5GPR5-gDuuWd3kOqC2TStcpZm+VgE6-quKkkYKIZVTKnnKyiIVFgxg6eXpXOvwfdoTOGSiPrggRgHNHw+HtR-J4WdyiPOVWyTvaZ12rsZICo2eSuR5m7oCleq4xVa-Comj3+jgAPZMkSAF2IGK-eFmqN5npbiAW8hYA7K1OgsAz9XYabG2APAEWu4j52Re6tmscrsCkFW5pDa+mx9X5NdB80wNqaA9gVKbQeHNQE6qqdrhdqt7eQJ2psqq+tNVBud1kt6D5UCjeGax4IIQU-WpsZ8ly1h88Bo7+PgCCocq88iDZ1Wuto46-NmchtZEFPncJqDqEYXOYu+-Zi9ljVAqZg7BAF8v8reRHgZe4LBPlriMy6-QZACSeT6VktymDlZUauW+ETrb8qMUdyE3KKBtsbTy7CQbbOmTnifZkZcACjqKGKBtiGmFkWhl7jnkRdQboKgDT0l+gT9aBFlZZoVomC612Tib4akwPqUYAmhk+0fZnlvXmSuqnlMEjFlvu6bc24iRzUlFPKj4BNAhvuoqpOCiH8k3GUehA5gpAqTUoGgfBl5bDh-pb0CXW1kletP+qCvEn1XyCfVYjyK8lWPuKjgxIUTpc3uZGW2R4XZlgK9LY0WdaHDT64sFKVkV6dKSB3QtKxgSk1WR6JamwkuVF7t7VTWUVdQavR7yT+aMO6jrXb5xnCzgDKKv6hGbz6rluzr5Oy8O3Z1Ay8Po-mlicg5WRqBF2V5-ABaZl0ZW+er05K9Q6ovDWr9gPpvd7HBmJ6kO9hm8WJRf3oHXyq0Y0oF1AEC2h6mx1-cX6q+rAAWneJPjuXYzRaK5oBv75NpfIkmoDqQG82fyerlMm7gD5Vqdi0z5ZfBEPsYk-blNsBYM68WhYCLXjNhlYXKq7lbOvRrAJwHNyKw1VpKJ9LrurpyJNkSnueHbcRFrWEikV51ecABGb06QQNsYB3jiVDsPRjAKMAvJSKonZOqX8f22DJpV-hNCm8qngrNrZEeUYnh7djea7e6WruOnlWkYKksBbsT0FYuEIQoUA2zhkZln6qI5kZ+dHzzPXxaL8b0BHmXOk0AwWK88MnOelpjKHPhKiGtoneL6igYvrLiZQsLAhs3nVoOsuu+ZM6CgNQAZWIwcIDV5dpqaaDWoptpoStQSvEr2lbzrANtA3zQd6np4xQNY7yh8jwCKZ9pa2nyd+DivBLKIchQG5emVsVrjKVvRNZrbONbJokh+eiPORR+6fd4JG5ld4kFus6qUrI625xKlQmZ5lKWTx2z+wUupiakm5Z6Mdv5bdJ2QGkbUKuqngH5GcctYruxmfm6ZEjUnk6AfJz59glQa+iOvKjxPFce5W+Zaj0PTWmgEUXjqmVqyNIeJRio6v6WHpPWHBuUWR7W+dg4G8AK2AHSWU2SxTvKI+WsfgCrO+ce0aPq6irl34+T6bikzhHbU5Yz6zcpq1-JVBqLMqKD+e6UAuDdlPJKVd1g9mJvKJrsClaUAFkbX57b6YXcO+iqUpRqCJh93xB+cmb7qA7nRBZu63Gj1WqONuoA0rBwiX3kU2wjyBE-qvbmpYsmPPmg7dTuBrYBMW3kdbrR2Rmk1VOgitj6kh13cvIlRe9Sax7XmsW-sqYRtWqlEPAYNssDUgPACmqeO+o+WVjaW8tRE5xtY+wCS7hpvJ4Xq4tuZppeA6TWrA9xNv9a6KRBZk3DqB8qSZZ6mQWWoXPm2tylqIwU1toRg+m-5dTyC6v5Axqb4+IDWuwhueMLwISV4A9u0xobqEAFRi3lcg2E8f6LKAu3A4+KgGtLXpKgokdUxq8xgCGi+kFe-I2BRAZWpaA8xjIABxuKhuprO4Cv3XThL9iHVL23OWFrSq-gPd6G2u+f-nGSBec0aXzNJnn4IxcUdgk2up6vr3Nt8uvEF5yumQhe4+fgK3v+h9W9X3zm78UCrqAEYVV5ZWOAMQ5JymRhLEb2bdb0FHbqt2SoogspVvnGpJGnEoTV9iSo7omdtmYZEu1mRgCfyG8rbYlpKmvecJFL8RnJyamzRaDHAqzpq19q2UZJ5pXCiU+4x7OpRkX1+NIMD13AutmXYAKLyni3bPZd3cDheuxpgYeBo1jErq5sWgO7ZqdHvZZoKlWa2qk+tY36GAB6gO9qkVWVggqy6hZnZom22PUJZ2FCQ+AYJnWJwgDiJPW0KEw+ZcwCa3HbQLarXmg-k7rCKxklu3MaAoYtfyguQBa6TrowCeEyAXafiA7TsWqQDMFHBhSA0FkYZGd9RXtje9xy2mUXJGz93jYq2FhQFM4QO+ii4BFKwDrQ59y6Xhvo0VrDtWoZGToGHXbAhSeCUdaEpsgb05K6hzZ5mW2nmbfRE6hgCheUE8XLU+FiV2k83n9tRXjaxs08oeNiZTr49NMvmR6QKlFXBb+u7XtucEqmsSBpF6nWuqr7xRgOaXezV+nogcJQvk0q1lELuPHNTwJiIcHZh8gzZEKfpzvll37yRXKaRP2va4B16Dn04sBz1tRH4gNyhaYA1LBvpU41FaYqoCmRF6ip7hnebj40+AQfrrtq4rRa5fyi8CDGYRb2vEnGKOP+uHExa8XfrvymnuXIRmt99mYCA+B+eohldJYXtVV9WRCaxmwqj0kIA7wGwGeaiqodWGTEALlrS6YeqlVFeHZlWtYz5RgoDn+HZrE6gBvKgJZ2u1Zm6bbaNRiXVqmKbWb7gg-wMIlqVj+k-Hn2zcjqZeaLzhZYUA2SlJP97GWgUpIqPwKoDynxxtXKLbowAWbkWeiwsCVWRf0KbUxM9Gif8IekK0mjgLsEKVZG5Vza0EfiF8dHmDmRfkKMeNnHUvzW-UVBQtcABwRGBwQp8ZPmeCG9jJ03gQKAXgH8s4Bg+y0oDrMjKyRieezOM1TjPcQYGDKxfg3UXuhIiA5m7UMuWw80o1U8zbUyqayQsSCITWcsAAOUqNjYUJIR58ZbyiCxxgWCMOkn8W3yDUAuwEMc8UXgIUG72nqhuUfIHh0K8nnKAIQdU9Nnnc8wVS8XgCq8+1maMuRl20+OluCUClFcfygs0u3h6AMUTAAp+hvCZkVvUclhAmEajY8YKTIBxSgBsZ3iHilmVrWZOiRCq8W1yA5VNA0H1NsS3nrSiYCh0MTn8s3UzymnWh6eoWiWMJJmyisVnjs11gfcBZkpU-gBeUMZnxAA3jmc7ajAAGhkNM0FkoCOrx6KEJQk8n9hE8aCke8Flgw6i2xG8L6RNibBgfk1ii5APShMyQzngU9V3Mqgpgj8BKWQ8uDlee0+kDSQdWzU0rnPM9+m20gvigiMrjBSFDXNcm2i-kmbnzKq6nBUKvjLkzUyL01S240MuRNiUmgXgGb20ydQEKACcRc2Ncnz0tzjLUlkXVydQDMUinmyUFNSICPemaUMujKAs+XoMENko0BiBrStcSyybHh40hgDIMvQVM0TmigCk+hnCm8hcBmhxH0L2g0WPTnNUTMzBSjxnoUZBnMcONUJsUCkqcz7zy+4JUL0LyxEO+lng8dQF+iD6jcsk+XtaIZQ6y21iRU52liMvQGe+WJ1islcnryFCkMADn1wKyYUny1rlZuzQBasd9kacINg0KHqi+UXlhXS28jbs6x3x0cqnK0OwAXq5angU3PiOc2BieMtij6aOPx8qJGjssSERPyjxngUdCwJKc7lfkfSgcSTo1cMeOUmAgcUPGfRWVAjniDM8jUGsptgEKgxiwU1wzC0FQQwcbgGtUFgDtsk3RrSQdX8AqSgXqO2mdyLvmD6KIS9yFgGXkLAQcMq6ntaNtXysMGky85BmIG3dmzyDllUARLgJSTpWWi7dnvOd1iEUjJki04rSsChQG-im8V1mvGnOyZSWg0cyigAHHkaS0xg+0aukEU85hNGWqlxyvVl7k6CgoAnQWPctqjJC+gQga4bSrSf1maA+llp8HpkTA6WlFcbdgLUMTWP8KPm8y71iwAgNTdCLo1YaYzlSeSKnu6JCSSiB23YC8BmiC5JVHkAOyNskphZS6DxhOKGRDUHAH30n41+G3pgJSHmnA0YdTA8XOm8ibmyvUaCR8iGvQScI6SJMr032sjfgJMHsWbUQ2nRMD+lO8URi6WwEUR04EXEeaAGT0Ms2d0Nil-sl8hD0AOTLU+W2msb6m4CnZlMMMAwl03NlPsdSiiMGchjsBpkPs2xl48m+QaUbCi+iLCjKsW8lt81y3xsMugZyouj8UIqnU0XqkvmxETX8c8DisDNjLm-l2tiwGVxSahk1MWURP0DzlnsGbkKAMezx+TzlWcp8ie0neRhc-xlnC2AFta-mkzksVkNUOJnMc09jkUWVjv0s5gEaKsRrsZRlScFHVocuZR6iB8Qp2-Sge8GSjvk-T0e8UJhX8pAFuWm3juUwDjG0-d0EW+vV-sJXXFsr+T8SKxXEAE6icsLfmiKQhhdUiMU4A4rRrUfIRpez6lsmmXWX8gtn9KF+lG85imz06YRusxhwp26lkkcXqlwaYvm9UhHkUWt-gjMAxjgAb8XJU1KkC8D2XRWXVmJANyhrU4zjk0gSih2+ih6aoGgNUST2GiErjpK+6lJAi10qKoNgwUjiENUZvjA8Jkl+WDRS0AyXljUi12CAxkgxGplzEaW6ns0NjjNMZRnaU4qiRsntgcULTg+0kuxCac9iic2cVp+UBmPiBxwyKPSVe0mXQ+eiYVM0jqjxGqanDWEqUxi0GkP0ACiuK-9W6Ac4WKUZYKvkwrid0uiQGC1TiRAsUQJSqlkHsI1hPKv8ld6vwxWUVyW6+Pf1M0RmR8shmmsU3bgxGiRkF+zy0y6m3neMHZg0eHuQ0UiXghSPFVhUrORJmESl98-zwHkWBii80ihtM3dRe0ayWB6HKmEedmS6KlQUVsyynF8x7ln0XYUnWO2kJAteXNU1PxaWQB1K2OliQOBaTxi6Sl060+nc0Lunk8faRnsbjjLsSvSt80ZRkAi2XWUiawyUDbk8ULYL0Um8gos9gVRK1ujk0hNnwSzcneUEmgUKrTliARiExcVflPypw1GAuxXQ0kYFeCwWllsnlkp0dyjz8NSiSURSiUCCiCOMDOQ-kELkKCTdRWU-jRvCVehB8CIUCALCkkcjm3fUIXSk0vCkg0wOgAUYDULCJpRoUi2QhCmgHw0krheMhoEJi9+Ur0E3nZU86mmMxRQbcRin0e7clSMbHRfSWWWdUVaTa08SVs04gQpMRekISyHgcMWhna8AmmbMwgX1UKBS9A7AXici5jMiVSjymtqhNc-5SgAxoBHslQRNizpjDAaqjKa3zR50zckhBSIyPcRoAd8oAW6sOUH2a5ZS863skKUrAGmMZoWue-AU2aHSnPGhqjAAydhDqtwAbssXgdOCiH10lIA0yHyW1SoDgwA7yXVyO6RjCWgQpMyenjGYOTL6IZScuBSky8yBm-kaJn5yjpwfkXmgA8VaVxi3zV-MJMw6hJ1ggyrBijs+FWamdihG8Y+lV8TJndUGkVeh4EUQRtGRd8QgRz0ZRjfiQllP8q-wMM7AAdO1rmPkSB3MU4zkEUSUJ+syalUA1ilwAybklyRgU0AvbjwUjNnGARin-MBxmfsZJmlqvGmfOYykpUUuRnqupyU+cfT20pT2xse4WQcs5UF0uZgOqttnXkNoEYAmLhCs1chyAkqhc2P5gfUUXj+8Mzk-mP+nKCrNw0RKeiwMWqkzUiniTkGnmP8gDRKBHVkgiu6UTC6lnDUzcjz8wGmbCJ6gritampB1BkquW+W6UgaVBUn22BMrLksUs9kXgeZVcsmpTIO3U0ocMpnm0IfSss+iGqcNICZm4GjWU5-ixygbXo0DORVUNrgVKGUxnyeHQkU56n28HQG6h7ujnCpSib0tYwyaPckpAjRXtCgpRKcU6nryJH2bkpIAbcQB3T01TlXi3ELIUq6iWKMkX2UZkVVavzlIAx1wIijVnnkJWQYm1Nlii5uj6KJbic8MrnTCtZR5KJ8gdA4Xls8WQGsUUYUn0N9XfsYAHk68yn-Kh80c0ialiULSQDmGZwW0SNVqUnZlsCBQDkUDOlACknl0SCSnnOiHkE0kQF8UuClb20MXKuSKResg9nIA7ARXKJNlUAGGw6yRXjiU-oKU0f5gAUZvlHSrSlveXilby9WTyyQCknOzlzcqXllIKOQCh6Henns0dkhm2hk1aodiIuy3Sdc7IAjAXjhk+MbnT+4gC08T+ho0LpR9Us6lmsAZjx+v6hOcEJjdiHSnp0lC3GULYxhUbAEOMagKyMO9igaYDVY0W8mLyMpSAU7yRfk1IJ8A6TiSidVRHBb1R2UMYW+UxlzQU+CUn2sukcSJNhvKFQRQs5LkWiJfnoMJNhgASyhUGJsUIs7jSJs1zzsKpwUWMcJmba9dhk8HQBrSbSll0JaT+8uqmfs6D0jCCwHEiUk1ysyamLM7Pj80aX2i8bgWMMaZlrsBMT0y5OlOMeenucgXguU04S8A1iTEMAqShcbWg7kRfkRCoGifstNXdWGhmvOFgABcySRZufqhLsgvjd686m+As8N50xlxLuUACHcf2hy6kwBoC1AB4a0ZSmU-YxEhpjShac9h8c3ITG88pnXMvBwOiEuiAs-ak30jzkWM8YzDASIGL8MnyMKxWg5qIdW6SthUJsZoQ8a7mnaAeWRAClAX8iMClac8Fj7kMA1qciYLdSSnxvqNdmDU7z3VqVigNMV6xrk0ll9kk+kh08ZjoCS9ivUBmluUW1gaA7AB8i+vjK8TxiQ6T6RiU1wUrkXxkgO9CmdGuPm3cVvlucqGWOe4kSgA4qQ5Mmh2aUS-nmcA6ieUEwQUQp4X3MO+RwUCBnFaqp0cS7-igAA7itmxRQJSwSSCmE0QCUSEQZi7wEoqfJkqKqPlCMZjmcM+MWr0WxzqMAe21U1F2tAaplK0WQ1I8Uuit69BgEAnAA+cOQDX8z6nMUk-k+SnzklKfp2cSOckcUtAS0RTOlw2Mhg40seWlApARG6ruw2UkAGWy7AGtUZiG1UxHkV+wQG7SCgEPsbylsA0+i5c3aXrs8ISlyPW39cUJhSedwSdC+F2Ys2z1KUrYU+U66JZuA3nhijqjScCiHaUvkXeAFViiMNPjqArAyyGIympA27k3amEP6CT-lNCYdSzuvEWGiSGlgUA1XDaZMWl0uDSE8iiVxcOqjEayCRlKIgVOy6jlFsC3npMpBhA0pW1t03SURiZGnpaNRx5RQWkQm6p3YAwij88yiA4MWgVpCZ8li0RKmGsJkkSMrRkv0SQX4S3RnCijIHqMNIBACHMSkAdOgSsg2nJMVlSCKPQB86k+jdCPLWB+Ae2lG6Kwya+fUosK7lBGOhX-cUw0M0oSktsX6SaUyChaAhcWv6h4ztc7nn1GMahiA78hJ8ilhI0f3h8MhiBqcOel+aAZnjMOoFP+P6igMqcmTcT8XvyK6VaqQuT9qZiEsUneQw0FAWUUcbmw8xikUW-ZiXcSKXz8Vag5UyFhwivbX5UeMUp0LiWSMnqxDK1AQBU4ug-si2kjWHxiKs3fl1c2dnQBqPhnyuUXCsPIlVMUikCSbukqU3zlgMbHjSUUenOA+hWncRmkUyIgU+SdanNGtDmFAQqgsSDOUWM8cjUC1uiKCuikgsDs2pMkETEsx6mv0GnnFslFW3UQSmYcC3mWMi1z9OuWmEC+8kUiE-mmagASws7QBjk4TkGSiY2OUlhg-ibHmr0mnm7stZUxKKwHNUX5j86LTnzkrYVuOJ+n-KZ3mG09OVMqeUXsc-jkwW8CjpycPmMsKehf0Rmm8yBQG1s4AxH08Ohu6VVV+0mwWDU7VjMy7gPSare1xsSBxKsrGj1MgkVs0FmmEA4iQ+UqikjO6rRGqWejvkyRweWUpVLMkgF90cclOeGgHGcVWkFimQG4iI3VS8Pyg4sXcTlsMChgUO7lJ8uqLM6goiTsre3LU0Vkwh3dTYA1xij0gOhfiJDmnCRck8MoDmZWUiCY8rdnsA64S76rzgcUHR3DWL1j3CHOjJiULTZ0geUyivXUTUhQV0S9fh1UEylCK76lYAnpgu0thURKFhjdUP2jQ8WBkGMB8UoM3SlYAP6lasboWzUp-2QqNqkIcHikyAU5iwy3MTAqsOiOR04XSaRml5yYhiLU61mZcV6xLkJ4RR05QROchcLO82ABcSEXk20plT7UjmzARoYzNM2igosnQE+AmC1eUkxnkU7CSai0TUwhXLn0es+XqUMTVKckrg+elNhPxj-3Eq9WzsMp43AseXzjcLiTEcuGgFALlUPsmiyfiw3it8C9RaCEDg4MLTkHSgw3nxwZQXgdmR0KjrhdKCQ13GplSJMjxlAUHxiRSUw2SMig3-kXEQqCxuROchxm1Uz7mCAGRihcRegwApl3IMWOWBU17xtcI3gey0ljnM8nx5KiYTZ8n-l9M04Xv0PsjuAzWgEaXGnp0EBQzU3milUfIUTkJnXwMw8gsCyYUlSoI1SCuLkVqBeRg0lBggU+8XF8M+UQsEQEf+XQCkUtnl0SKIF567-i+ARNkRKqni8CMrSaAFNU+siOn72JrhMQauhHmlIHdSXij6cqhiCMUEV3U9im5CsJLn0mqkQRhaUYSMoXT0CLntsHTjw+xOXpsB2X58qXVoU89gaAbyh62-dwxsq5WFAHln-kX0Tema1SHkMOgz0+Om-x5pW5MMegRseLWaUuJVYA9mlq0hMQgRxBTxU9WlGqjhX7qqXiCUY3lae9BmK0iQWj05Hhk+81jPcPIiuK66KOMDNiSKrykPWLeRa0TgUVq9pUWyeiy6md9TE0jTnnkpW2g8F3U80IwGI0xoEr2Kr078v8nGCFkR6cTqgu0bsW6AEyWD8TpSU0zDhXGfIT+8ulmcM7mVZ2pDTKA8BjlM7WlPKjCiXs2hnfMiAAAc16LjaFYWjm1pm4hEpWIGo+jbCenn1SA8Sc0PKOfONAD6ikxhK0upWwMa2n8yIwSjSagPYKjgIEarI3wJzUQYaUiHsaPAEPUp6JbGgijVU04Q60bIAecoEWlGw+0giK6RJUengBOaNWOA5lWL6J9gwCTCy76j7XmMH2Uu07NjJ6u3SvU65mP0n-1rWzywh8ncgLkxw33SUiGEARXVgK+6T0U0ABtMfThBsZd1bshEVeiBcigAAOx9kUaRwUB2zJ0bBXI8dfmiUpNy2+jSi7seeVvU3ewbMUYTHMDExMkb2K2syCh-sFahEAISmPkgqTGCGZyjqX+iNMM8imMVy1+i2uW3UCmWU0TikUG81mjKeuj3Cr1h1KeLSOsWhnZsWOTOUhA0gs15w1sEqi5ciJVgap5Se0MnmC0IwxwioHVlAGqTfimQFp0L6QFK+cnHi6+NO+CJiJKrwJbMWXhpswrk8sNaijUsBjzUJ4T+8mSy-Ml6KRiCQwBSPpke8-Rgw2JM1baRzRVuW2nmc97jlqFVwU866Is0CtSd0KwD3sxwRKBrRgmUEWVUUa1goATSj9MuGzNCAQD4Uybl5uphno6e5ib0RcjKcn-ml8Y9j2UUGV4MqhmWUvDiIyihnZUL6hRC+U1NCchkp0wCiK8oriuSPRn-sKgXKUqaj0W7cQ6yzJhboHinNc4mg1M9aTqUGtX5UE6LYMXiix6ddkQMYGk3sNIQlU3biZGb00R8G6he8r+lgAgKhq0fSgum2Ch62gLUOMYvmI8xoH-qoanCiRThMUsZlP8xawg078gc+z9hXGhiEh8wr1UAb1jQcAtisW+ZQGCvQT9CjhX506SjpUBTnXMI+nasGCkYeWlST8oygOiZbmksFVyZiJGhnCH7gZm7AVPRZcnrkuZURidwVMMJkhQaLy3G8K7gk8O8jpsxZX0MEoSTsGG2NmQnj6a+WxMy+BgZszG1DCxqVOe+bg+yxl3jsp5UFEpRi0RBaWBUV6VKUeWRL6hINYiang0WYhk1inUzHkMzjOss4WLqjSjcqaBjmy3zmAcT8iJSx7ibq60X8iwigo6YGkBsu3mium2jUMzNVwKQQF+sMEwJMMiijsSWmb6AkQPkQlkQs9SnXCdwQsx0URECp4SEseOQ9iXoG5CCF3GMPhlzKTtQ7qvuRR0M3VDCtX2SK3pmYAp8gum-Sl48SAx101jnpyIYGIiT8lxSLigvkvziWUNpkTC7+SMkjqlKMURmNMOcnkMjJ2U05BVbh9wRkJD+Xti8iVFU4kTS+6OjC0P+hpMRSgvk-TjpUR21YGkdiboNphYAgGVc8SHSWMBrkHSNCRHmlBQBSsrgh85rlLkM-XeMsQAQM4zjQMMKhLmpwX1yr9mTUf7mvkb5JMUsRkIArz1Mqe9nLsig1aWQriyAUmhAimZhxKKbgSU01k1iPTklc5agB2-AQhMgHkJC+eh0sucjF8bwUYaJ+jZ061mL6cphoAMn3L+sOgxUJc1Oe7qyDM2Vny0Pbn0q-DlhUrhjj6Og0Q08qjBSIegfkRDiZWIoR4mIigzeZfRKABJmSUjrm6s4IBSe59lmC4+n+UoTnqMCAHF0cVjoUDRnzcYpUSOoDm7yn-nm8AijzsECiUST2VocpOhkAv+nE0xXjfCjamcSZAJVUrzxaM46iKAYwWIUT8hYA+8Oyq8Vj-+KsVosLBWUi1yh-MBoDZ8uZmbu0jVGA0wMHSTzjQc5BSO2EYG5xJ-kYcFzjk03yhIS5o0b8QuX8gTyjps5qjk0sAG88oqQEslUUf++kTAaL3kQcKymlARa0oU8elVqUdiTaemjz2dJSYSayQXkTqkW0yDmnk7OhTc4nh1AXaQ0hPphV8nyhISXgBaCJNgeAjW0iqXWhAMEQG72czyxyHFg+eZijdiJ+iz2qPgBsmnmtW32gjMahSm83kRhil6iq8UwUWcgxhWuNoBZULwU4spoHvkQB0dcEJlac85kK0UEWTsBSQhcywFaO5mnjUpHkNsxhnyshh3pMUyi6aaHh-8dvXnkeZSrGPxWFUyG0BsP8kL2hyIlSU6lCMmdhaeNVmr6XvndWcABO0jyjGU3nlp8gqnZU9VO58lSmVAegXBAWZXXc47iaReiACC-mXzKUSnGAEKQ0WzLyb832lQZmLllM1yw7kheiLcANk3U57gfM20XcA8uW2AvDnmsVeWR66ShsMYAFY0aZQv0t7wAUTlh30B0wPc3QE3i+j1Y8vsmIho0XR0D7h1sM5ia0UYDSU3ply0qVi6A7Gzv0QQFUcKxiNCFTk3adbjOMXEXQ0lW1nMZkLH0itgFSxWlf05th9sKcznMui3Y8mC3eGgSUIiErjE06iEf+I8xR02AEYS+AE6U9mnPUJbkSOiZnJ0ZCRNiwdWHcupWyq7hXyMugF560Xn8UVciqqJPmWMQIFS0NsMwMjpTw6RtkNcZVSYskahMUMcgnm5sQOOeJUnU2xQCMO9hfWZRjACk-nZ0Frie0BeRh81CiShSlTkikWkTWSHSShzLhu0jhRAiWqnVq-dxQMmTSByjKljkK12B6q9i90PRXvCxMiJ6V8h0KI3QRZ-jlS68gX7upsUW2P0UwheoQfMSbVxsqGWTUqT2WimY1wKBxyocZEyPm6nSIUV2hEUqtznCSrgv8oKiPc8ZnvOr+XWii2hgcgmma0zRlu0rzWqcxWXfMLciqU5ZUpAx2lIaCG1i2lxj-s9Wj8Um8nzcKchM6ILJ6AASn4hhh3a0MWm-k5Hi6aDLlDUsDKucDRlYGQlXfkkAPYCp8mXMDoOTUe6ny2vgBmUxa0XU0RijSZAzZAxami84SOt05cnoUKmWMSfhngM9zmDarnhhU3aSgGGygA0Hhk4AdXREMKTwu6xkn7GgqUyqYlmzMN5l2Ml-htq2bhCMvZieRaESlK7phdSKPhKUi+kI8oFjncbfRTMyyiICmXgG8anXncDmia0+gSJU68iLMWRl3slGmWAVxm2ULgLbB88hYA-amTsyBjhageUlqvsLAACNhISW1iccb9gEUg2nq0QYDb0X2n3iRzXc8mugxWL8nCGydlVC0em6Ud5iYWiJTUQrRjngPIQ2sb41kaneR2CC9iNM3dRtsb+UwSFO2p8RTiZi8alVUZGWaON9iJ6ANLfijDgsQeel0BFHzQiOTPn0CNnsSjwAnRVDhAMsimkAqSkcQdcOY2xWXY0MhiispJkaSqYUi0J7nc6R1mbSwrizMd9imaCIVyc2KiuWAc3VMbARrUqJixsF2hrkSIwUi04VFMrOXGMqekT+ulk0uaEW207+STUfRUUSNoRq0KmS7kE4UXUwoyNstWWOCoSSQ6Y9hgUy9iz04qihC55zOsnViDuFiW2e6YVcUAJjy5+j1GANTijsgqmCh6cl1m1sVsKFiWC6hCzvUWWWM6nagUKVfl3s2xQk8K-kXK6ch9UnwE0W3gR6AekTQACBkV+5wDW0-pVxGEynucwSngq3IPK0HVjusMuhLqVqidUA1m6+M+THUcujr8VySL8jcXJKFcIWAI9jsK8ighOtChTaIdiGxIVkp0IYHQ063m5MQWKgGMdk6AaqhcAT8g4SKOhamaBjD0l8iMA21gQubQH7MAhUyie3grkh8zTy4mggyy5m6+TI23yJ+l5Ufvlm05OkaKbgRIyM8mOuLm3wmvXUDq+dWqU12y5MlHj3C0UTPMJbh+iihmysSrg2U+iBdKp4Sv0czmaSi12aUmzIUK96g0M0BnkUO00XMBqkM0V+RxKmzJFMLwTus7G0WUR1wUQx8goaPFzQ8+EVWCTCTtcLvnVUdbktsKIGKCyymLWkDlLMGRRncU5hyiV42sSAR2P0o1RlUfSmz62clbhtIWvkzAF-sMPn3y8yTVinVXvOSml4cJ8ih2plUjArgWqMEIBWAXqmEeNujn8SJmwM4bW1W5sX7a83iFUM2jH05OUT06gWKUsgCvhCuhWAYaltcwKk9UbvUZWLdHVyM5n8cLWixOQKUyMhBR8ArngJKuwSCAOYWJykdnrKkRRYUJtl0s7KiNm55x+iDy3bpWijTyoRWQsuthiAiem6AXwBXZWmmlGEVwgA9rW-UPpntaaClIqaLmc8etnxcKuQ7kfXjtsGkR38pMRzCS6RYMZgH6sFDNOMZbiQ6iYPuU6DzLe42lEUfBLcCrIxVh5lUiAedR1slVVzkSxlSMcABpsAmiUCz3yGaPQxBZQIFCZfqgQi5CmsUimR708rkHM7CW7qikTzsmlykUDUytm-ZkQR8AFaeVq1+WI-zGc5V1Va2sROC65kTeoFhc2OqmVUEjIm8xWPXkepm-kkwCyGIcm-cMiibieKmuMUQQlUz+n0Kv3RkUkBy4A9amrU1Wh8sgiws5ZpjcqlICj02VQMBbShh8aVw0UbK3j0BFgKWv+KLk0bUdZtkiNckpU10W7VYGMgzkcalUrsBoS0U0cWcuF8y2ObyjIUfGmAsq3mQqCxkN0v8gG0Hzkh0Zc0-kgWOiCidh5cIKlLCQllNUrcIe0wxR5MA1if0iYJ+0IgQbMvHlrW4lPp0c7SUCwDmSMjagKSAhVJGdpk9MgkVV8CESaR07gZ0D0Xz0HgRLmsoTPc7pXx8A5X7G2CjyABum1SIOm+iLE1+srGRQ2tdn18YChx+Izhk0A5QQcVBmEAX5j4J0OjJil-kKMW+V8UsOj0Q32LlsZTiicOHhCSIbgzRB0XUSuBl7O9zjis86nxACgBKM1JnzK01SICXGjQiLQ0wi6BkoqQdUmiBWMHMWKkOqISUkAxNjBiftjd6geRA0ZgGjKvTn1S9ijG0jyiLMNwSMcbWiy830wHKqqle0G9mOM78hd02uhaMoqW6ArtgP0R1U6cFJg3kW6hlsLC1sUbjhCU-hygAJo3fcMhQtA1wWyxphSYc5kRfkWkUYUWzinkV8mF0S9lLkApS2U5SjNMTphjMLyy9UKBkxiWAHsUEti3aNPllmJozksrRw0R5hgLMy8mC616KKS+chaAuiy7alGnjGrjgDm4xXz6KxTIStO1BCxID9Gpz3YSEqmbaMXWhZ0yjVsXOhRAiQo30P6XGKoeIRsM8nlcAIt4cBwWfMxklS0wqi+8q5RP0c7hE0AAWyxDnzNOiMUDS5lTHk3GWk0sNgo8l7nB0XJheMRajZyehloc3UKUxPTxXkeikHm-Fn0KmdjOcp6g-kMSSamizXw0Jf0dZEDh4uRamDm0ZWp+wv1d0n8nmWP8kjSRTkkhwNjMUGXkdWDwv+AeeSSeZPTvxqnggso0WRS+rkkha7i3SVijh0qViB0pDQoxSmJKyozklKbYKE8aCgPsbzixMzng0cQuXTcVgR2m7Gky0cZQ1s+SRNSTJjzyJ3J7MYFkaCgi0wSCMRF0p9gUSp+XicSUTlUEYV+6ZRh20VOSCRj9n+0SFgWMt8iT8seT0UaiDyikYEUGwHJG6UETqA9qmO2BeixskIDF8zykIAstJlmq1XA0J3jz8XbVNARagXUWRgl0Q7hAMIBmGS5tjLmGSiyAZkOJkT+k2Z-mlPkpTl0UVwVSy8PjeUCCmGSUPROs+WwjAzJh9UtayQh2Vg+CBxw60HQDlqvzQc0gHkAysCjR0hcktBZKjE6D+hiUOFhkM1lgUiSA3o0vSS9s52WQ0MzjMcvoRR0P5keMSZkT0UkxP2KmSCR-cgMihkwOmpBUkA6xznUttlnkAIuLKsgDIGJSipaYmj2inSgMaUwSSMIrxYAxfSfcgviIcPRSuyxhl1KrsRJ8BGhjco0X+MrDieyNtXI8SCXEqg+0qq6Rn-Msame+d9hk04j0EAGnjOMu6Wn+63i4UlWzkU2eRN23XwPsHWnsU1AFsUz3nbM+8kXK4bRi2WunCMxRVLhDSmM68Kkh0orj9slVSkA98j10X0WdA4vn-ytY1d6P0Sj2f7jxGlKgCOIwG7cHBlr0EOkhmiiw-kreUq2hFlrc9dlgClvj-kD+l3GgNhlMEQUfh6Dww6F9gpqLcShcBiBsihhw3sta0DaYAUBah7keAbi328uOm9cpqhYs38iEsIqlgGLoV66L+h2qRPWkUMGkHSXJl-xZlgg0VixOUXyifSaQwf0mMVvcRciUxm6ni0dd0UUu8h8qQoRE8lciIUz33LURcnHOe7IKMvwQQclNgu6OryJKWuj4UrVhO8h6mNmKw1Js63iBMvYU8F8zlr0MnjeKy8A9MoqTZ8CLNrG26W+mAbQ3USZnUUC8hVesKjJM9oBjc6qWissqRBJI1Wuek3T1SZwqQORcU2KWiJwUpgO7JZbzOKiGhaerBjzqE7jzMN5UY0ZCTtMSvQjsei2M6oWm+co8UuMvVkjOi1gL0jt2b6QWieRvwxVSkUXlsMRlbyMhJoKqliSUoIXcAfoQoAKuV7kxGhRCLpQwUhBxqcwdyxyv+OdA3OQUJwtgLaD2iU0DyyG0cCjvkmhlHUi0QyaTJj+UitRvstkVyCJpiu0YhgQUT6UJMoNnK0Uym5M3ZlA0SnPMA7fhdGUwGIiMnn-hc+gSGv0Uc2OvgxGq2h-sstPVGgGglie2ny8I1hncwlkcGMSlE026jAaDJlSc-pRl00cRaCITI7acSjSMlBSY0qISc871nsUN9n0cd9V8AxoA80f0vIUM9VJKJLioA5LmzymEUoWDwDfUEhVvUu1z-suszs5LQx4AdwSc8NAAFM3GlacJrhk8fpmzUxHhwsFyni0BMW+ceThT0hgGV88eih2VShhCyYRgG0CmAUvZx40yDQdszxn0crJ3+qJ3j6iBZXwqJflcacbn2UMFnwMsPmcsWZQ7yEoTRq55nsUU4yV6IcWQ2DykIA0LM9KA2jM6gvn78WP3ziH2UF8SiCC0tCnnOzKh-a+l0P0oRQv8EOm9MkgETU4zhbiFOjsys1gds2qlOi8ViQi+71-xDhkGSjugSCEIG28p8iFMQpXgRErUq01Pw8smXh2CFZjwUn8nqyhRg+e-gGo0SXkdZiCNR8D+muJhe29kIKiiWqxiXMKHi8cNAFA0Ma37aoERp8mRkS8eei0Ri8DE6XJkJAFkWjUPijQi6o3msblnAUs2m8Sv9gA05o2nCKcV8iKgQLKPKO7q8cnJlodn0C7eSxyn41F8v+N7UQmhlUGTRKlrCt-0Zcy2+9Cm08+dMVquWjyCQ6gXckB3Ay0TX9caQ3acLoU3ilhhlaWP008PwCgCh8wMQUE2JkWFjXU77ll0I9irU1hhRMGAWhZDdhYAFqg80jCiIRXKn+MBZkdMASmJySEX0qbehHB+jgo+lPSFUReiQipAVvcYdUBsD+Qr6vTmmARHNtUjWVca6Hiw8b5Ns0EIHTy6jk+UH41iiHzmucpFkr0GvQbiOQFlMI52U8hQRPc3ZKnUSJgD2MFjgUhk0UsLoTUAXcTdUjq3d8lpxZ5eX2vsKSiPc1ckhBihissLlX1SrzURURhhXkBMXFaJplKMPKJNs1P0zMwxUj0mqnLkUXVwcEwWOss5mF0MySQ80VhiUfijfaPpnEMpAR7cVShsclATXkFNnNsA1VA092xnkttjAs3dSkUpIAMU66VvS-9Ut85-R2sI1hWM-YK7sp4T2p9XQKMtqSP5AdRKcpnj2U2ShJlAqXd0kuQYygGlnCY3g90GDhfM6jgUAb9kn0QRnIs3MRtsP6W5ypRVFcUPTBSGIzmio-300nVnoC1KhwMT+hKsVaRl8GhlHi1M0wy6kUsMgOmS2MIQ9UFzivWDimI0rYRRU6iTy86Dm8yhYTw6i7n+Mv3W-iDQFAUbqlJGoihG8YFXs0T7i-ifgFSsAjQxGsagvseahbuV+nsCRbhRUv5hNaKIFt8-KkYSkSlZUA8kTW87g2aNSgPkr7kJMKTzLUPGJ807vjHcjdhdKrzijCj7VyM251blqqh4MiCJlsqUSk05OgTVfkCgmhphdS+W2ZUbCQvc9rj9ASAwdOV8l5uSHSbkIum0sMahCMR8zmiyxgsU-BjccpBhAMTSkus0HkB0Euku6aymDBykXZs+qQ+eKBUdUXwAhcPHnF0bgVsKPaJWMjCSAUj0SXcKrLUQhBhKsMAGjmqoWeivOmLWCNiNMu2mfOC6iLi93VT0VY1R0BaSDCydl7ctdimUA1RZijIF0F-dVVupQGKZ55iLyCQ18ArVla08oCU+Kw3B028jvx0oA6hcTkcMJGgpqkLglsZoSd0zejes37U+ywBhwup4X7uI8iZGjRVJ0KBWZWmyjh0wyxT0xpl7awCm5BYYCn6snlZuT7knOI-0qq-DlqsJ3PWsf9ggZCIQN0NRilU+bidqTtVGccmk30rGkTs+NQ082tiLCvPS7GaSlJM1ERYMbViuAk+SJG+6lA0NRgZik8UiqhqgdAnfi2M5-W0sLbly0xhWD8fkDhqF9lbhfhjmAST0qinaixsW3xic45lCSkakfskB0KMUdRGGivWKKEIF1UIh3WsmqioKRjhm6Wxlh8dOm-cyYStUupUIOUmUdUdw0TCW8gGs-+RTa-8WjscAFy0RkkjS+ym5CFACPSuynKCxVgKMFTmxs9rVRMn9Rbi5mjPUBxwJMVSjRa8ckQy4JgcM6ilP+tmjp0thKe042kHS8oF4KvBlCShP0jCjvgtCYdUN8ikT6adNn15-TnTcT3h6aPSTMchhwICvQVgsiWhBs5qjasT8hUQgoiRAvKuaSoajvsH-jQUwBhn6l1nWcazn-hVXlm0JiBiS6xhBsEYWd0XynFS4BklSq9gu0J6jlsU4y7k9gVv0PT0XkuKN3kgGiPMiSkH2N4UV+TMSlAd9XbsZfWLWNdlfyqNk0srZgoUmEPPUhZkIKrclIKcVPIsmyv-qKTiFJBtgzcMMV9CLNw5R+jidqR8pD0ndlyCGJkxKBJSnUM8m5C2tjyykYXcaSQSpsdhl-Mb2ijiV+moqz5gsSxqv46vfn5yjw2QcWJwEa3ZmDq4miEC5vOysp9nmM26jWUrYXwSEwTkc8rixcRclvkckXXRAjRt0CsKt8FQKssHBg30xqQJpbzi50wSSEs6zgqMoWnO8pDUomT2nc8ZE2HcTWkgicAFgaulng8+ABhO5Fhoh1vVA6Vyk9MopmmUG7iR0bck1UxBVzyWymoqYxlMQsAH1KfXlgaqMWU0-xkgA2AEaSZlgZSithF8NthC0yFhgK+l0F8BhgUKBSm4iDGXBU0VlPRle0nsZktS6QBRdKSKh8qstLuA6xy90DeNS060UnW1niAhKmSwMTinnOs6oICZGWzMEzmiCa7hfy6gXu8iQXMMiAQRCxhRXCr1kny84RAmDxjPybcgDiANmpcZ8Jb8i1xps4RnG0ZTRNsDeOO0v9igawPwymnan3kmWhbkKNi8p4nmzs0qLnUsBhTMKTgJSs4S0ADRnCpuDUOCs5S7spDloUp5RSU7yhicgviOMm7h5EjtytVQPOlMZzgsCIoSwsRlhEuZujy+8dmba8Y25iVBj9C4ETTs4vh0x82kcUj7mp07umXMvigQuadjxUbTNIsVNmeUPjVVaWzmz0jw272rvXPsaZg8segSB0YMSS085nRVEKQDaTquwAL6zvsEwXECXzlGUqSkgi3SRYMOvgNC5ClS8DdgEanAWNy6mhlsxWmV8Lmnfyo6VzU4NX-h7OUSUAQBFMLrmoAEXmOecCV0BCmQPic8Xnkz3x-UWew4AFDQEsMyliivTlrBKihLSB9jBs30TZyBiii+ziikm6Dl20mcluSm8iRA+uTXUY3lFS+fQ9FZGTxA2eXsxRBRtcB8hNcToCHxgNRjULagwcGcrY2g3WPsZPiSKjplxRgfnJlG6n4So1VwaIE10FfGjrcbdRwilJx2MTmi0qoHS4i5yRWKtnWp5+o04US9grC+CiyG2djHpXOj6cnQWQ80c3AMXOmAij+nHiz3l+iegX+sFjiSe2sX8uQIF-xkelXUuix2s8YXmc7alh0XGl8iC2MUshiq0RGhhVea8Qzk7uhtqRSnnk6uWfMrFlQZWZVuAQyh-sILIBMLmz8UV+kbUEAWYxmSkksXyPKU4JU3UB7gZsUiUZWs5VIcC+h9k-wAHiXSlci0XlIsyPSzKvDJ10J4VesjM2HOmgTsMtY2WiFiQo0Tjgb8l8myUylgL0UBjRalDk1q-9gCU1AoeW5rjgSQmnQcaiHk6CGw7Mj7mCuz4RvsBiCs0-oUu6A6WOCk2kUsiZl18Xzh4uNsP7qlFg80s+XUU5dKw8vQG9cjAUPiJu0R0-xic0xfjbqboT2p98Q7Mq1TY80RRbcv3iMC5SRbkp3mxMPnlX09RjsURknYiJ+1JsvBhbcIwDdUfqlUMdOjO0hpnHiQLLwaoWi6iwQEH88CM41uG3jU6uvXk+Gg9ywSXZUMIUf+8Y3fkHejlU65ka2fJj0AxuUZ2x+k6AY2lSiMIXlcmBh68RhiRARBVkK5JmFArynaMylmLWWRnpMf1n0QoqUyxtcjYCViwkxERs1a+4VE00MTTsLyJyM5sRny2nkiqfhiQNUaWasIRh2cqJQyKQQv28Yzm8UxKgtsJ8h+U3pniW--ia1zljkMi+kTBehRcANtX0KEdkQASvWB+CcR2Ao1jmUqOhKBAAVPCIFueuZblIy+SPyRJPhYUFzSjAK7hUANL2eiPUUPmrljoqDJpS8qTmEe7hQoarBiwGhyXK0JF10ylwwTVclkcSRGiICpcWvMuiX8sx9XycT9UgUPW1nVHbSZGO2ToOKnic0gGUeiJAxV82VnOU+BL9s1PljKkPmBs8Shi0FgHzizXTUUs0UsUT-jjKvgHsCbyjnM2tgsCfk2U8l9ioAk+nv0mJVsAn8vzq5ajx0XdlQMzDXRuyYSTkX+lP0rFgBUPUVDs04Q3kI-35SAGhzCAdQBMsnlu5X0TY24xVfc1LnFU-IAZmJTnfMXIB0sEOhdG0Xj5BlIFSeNihcAjJ37GlnSV0D0XPGYxhZUMtj3sBymZ0UYF709Ri9yd2hMy9lm3Cu129qaijh0FxNKey3UOCO8hhOUkzLsF+hny+ejmevERkZiHgxUYnSPMT-iMc9BjjMLLiWsIYFgUv3UVsxlwnCKxgj8vBnAsetj1shmk-J2HlnMXzn0C76nAMMFk6CCITSCiyV8c9CjXkCVgQcbfTJ8itz-s85niCDF0C05K3YAcTh1KYdX8ubgGNmhOmJWSWhO0UQWt8vwG1ichndK32JXSXRSa0+KnXRHKgc0sclAi0ylJ0JnWzkpOqvGn43vMXspk03tW+sOORyiErhGUDM1vSuG3gMkuW+5gaWkULyUeNp+QAcimgScBvm6MFMRyO1mVMBYHmdyhQHmCSOnySlOh4adC1eauJhb04NTjupIF3kRzSeMzwRE8HtXD8lJU+SFulw2E3h-aG2QG8pmUPmBaibFmTRmUHGh4K9yjKMWRksQRhj7UAWkeSCQQaUqpwRZN2K582tTsKzWVucrlmqUxaky8WCnPOyGkvmaLRN8vBhU0tZSwswUN60klg60ugCfUD8jsUuJUmsIAU3UPQBHcvwQ+MZnRgGZriMQmqJtcgfhRF8sIxKdgDk0MehKyUEUiA59wqsv+MhA4ihTayVi5JWyOcseynoUWyXby0Fk6F2Vkn2PJVuUqzTjM+m2AsSbV-xNNgiCeLXeGFAV1mCnnEeF6hbGcPhN2RawxWbgAVKnRmKMzlg4a7XhncAmkJ0E6QZSb5I6hsBRnsucng808gW81SgbMRAT7U-jkSUIpkpMWBjY2-bTxsomhD85h2b8fXimAehWMOPgCw8WHm0UOtg0A2AVucBKh5ERDlPsgQAwU1+myADyVYaM6LRa9wHIAgvjkc4ryh6gIsasFTmYcs4Rc83zRuCf-L4q8thXCBZXucfIJJCbkoFSBwVuSR7leC20U6CrEUCAbHVvqBSQZs1zgeAFgEK0EZhvqYGh8UsUVhJ77hb0XvhdS+zTIsOJRIaW+WLMi2jIi08grSiWgT51eX58y0QBsegUd2Zlhnyh9hGMMuXo66vlYiuGk6mkBxaG3hic0PTxaMC7iP5b43hUGNXoCoulh0R1gTiiYFyAphiNsp3kTCp2QgZs4TdUr+lV024Qhcj6iLifqncAyLQTVb8Rv+BjVt0QYBZ5PFVVFtgEgs84SIK8KRE2u4yRSE4Tn8AdRza6oKcUPJnAMbCi0MXJh5UosSxaz4UHspPmyArTx8A-PmQsE7lKMemimAb2iz8PjWdMwYI-iEjKdCdRhPsPWyHk+3jSGmGTwCQGm3cYnmRsqum4c3hh58rFQzlNwXfSS8GgK5QQEAQrjmyacmEele1D8nmhZRy9kDtVejB2SdghCZvnTk8SQ3s+SS4i9oG5ybamt0qtyGaWih38lthhCvSjI0NGsIssrjYCr2iSCEmJEUZFlaqe5k4UjhVxcbxRO0j4QA0NPnJy-CWA0O+ifaamjg2hQCNCz6moFW7VX00MXfUzflwa8ADHUg5lAcVdliMnqL5BGkQnCyNmMihtmaUt72YcvZjJi12WMMm8TTsdNl981umn0UE1KULfNzMsniJBP2kOJlBVUq8xlzJbCVNGaansAVDkTCZPUn2Xhn9Kh1QeSsGjISWckx0KIu4cX2jxKuDhn6P0VocTyWeWJJjAacfUL0FoVzKIoVdip6WjmuXQLS+PUYilHkosGqkolifVPkuLihmmzMTkS1j-+mcXnKimQp2ZfUS8IMQiCh8VZl1JiGaiRwFF+CSFq7dkysjrjQixsxO59XR9SBxxGUCav8AqqjOMjShCsl+lyMW7Tu0QGit01AUOm7nkWUNTTdMExgwckgBcBpAGsULvkns1kUi0SNW0CFzS2K-4VMQc+hZuktT1CpcVd6Aim-i+blWcGWgCC+em+a8KhTifgRvKZMLAqsplmi7vluU7yiVidFWWOTRuEKggFo0hiAoCKxgBCnTnLqRjn5UVkyDAQvgvpvy0mq4Kn+UyllaMLUwXkljgMQDeTj02gTfsidnIMZzqxcGvXWiMclpS4wCw8jyhACr2gItg8O7qW7RCAvpkNca7kJiPhph8mXh+UNGh2MINi5ccKiCtTChxFsTmbUvxWBMLPNVuvQWaaOwREM5JRx+A3nli37lxUIfm7y4lLDiNZl8Uomhg0VVN0cCGyhaxNhP2nIEjCxiwfcrThYuIwBkJfRV6AXACocJrhTUaOlVu3GkRCitXWcCTkh0ZdkHM6TlR8VHmjKlXVbMlJjucrgojCRXVZ2emnYSJMUeyk3QMKGgCmsWPTRUM1RWuKcwy8Lal40UJho0AThn0lW0hGN9lyUyVlp2qduFCISuWAmwQc038RUUwv3ncTDn8uhoBpAvTlJMkLjvkucnFarynCiMj1bCmcTvkVgTLMzWw1sU6gsSlXVBCoSg-syoBfsaShoUHekcMC1X9CpI3MMRFxCsvwWAsjAULCgkSy8LcST8rOXoM9C2o07JW6MgfmqcKg3dW0RnycTun28Q6gWaO2XqyCpSC0ZFnXSwxVBU9flsBRhm78FzQRioOli0oOgZyJa03yZmRHBZiEn0xWMpKD7l+AdpjkiQJSrpEIU7yrKUgU8RkOCLzrMAO+jEaxlko8AjXMqLy3yVl2lUMi6krSWhgW00ynsSaZkXKsxV4i6Nw0M4xq8ceQVC0KykvRTngPkn4xJCW3x48vyydML5nV838moCfwDQMbACz8q5RTgfyWx6wJlkUf5hZurdBRsZqmMsc7nCsjDz68qWgrSDinKCQvm10tWjcCM8mUSFcTZ0sUSM0oHToC1ATZA8RmPiH8X3eRCg1SbG2JJeygrUheiCMkMwjs5BnO86BkRshh0p06Th4sQLMJA42gFCdBylyL2Vpq7Zgne3fn0ixMhhijSifS0bWwCRehES93SdM3+Ljk48REs2zzCJBZh2CAihKyOunDcMeyGqDiAgstkUwhZyjU0WlW0y+6lYau9gmUfBMYUEqSRGPZi76KXndUToTb0DePScvESSMfZhCdtulcipnicsEPgWMkmjfRCLJsc+o0VikPl2uGKg+eBLjcWLJly1tZQO2geVx0JtgqshFjF8ScUosGRmbMU4KuKWXhtMkakZmCikbeZTjIG-WNWcczzwsL31nmmTSzl3cknyIMUEARBUkhseTSUPTTK8nmmWMTlxK6+lhRMiQS7i9V0e8EVnQ0mgSQ8l6gK0Y8hsUHWh0x-PgBye9gh6c-j28RJmucFkQCA45nAiQqUyiEtl7aWcjbsswNP+1eVMM78iDCoAS8MIvWSSGmRechBWucKSlXUbQUQ05MrkUpciq0htkksNbjoql3kLSEtiXM37XxAx6ll0+NViy+Wm28o6hMCe3jc2nzizKySgUyupqmaSuunsmgHO0bEySKnwESitakc2+miPmhZkRKf7hcBahktiPlgiUrti7av3S3sOKmGifkCtUIdmP8jRW+UkIGxs4vm-0lWnG8Lfh9SIzk+2hEV+UlNhcBYFS6+CO2YUKjkZAoHVl0DNiORfBMjsAwQl8Wcp00xAxtMetnbyfIOl0EmIXqv6ieMuzXysgGU-yeXm3O8Ywo6n+U3iJITXUgej2M2Dl5sEplNMojh8qlerg2eauKCt8mqWlxih2kPmJUdajG072knWk1LEc9DzSUrtiSifBNVCdbksMvu1sKChmGUnikG0zpsSMd3irsBZR+2kVQ70vuW4iHFgiyiAEGC3tN50pDRZCZfR2M2fRz0faV9M52T-+LqSiCV8nx8CcmU8jSjw0IEteeSylMa66Q-M8stnmIl2tc6Tk42GziMs+YQDmgxi90QGOtW+PmRMPEOo0RlhCUFVjaMfjmGUMzhp8DfgEsd9UK0kmmg+M8n2lrOSW8M5mja2Dm+mAhiJscCQ-s9BlaWhFkQMgumyU1KiPc-dW7UemQbc2imQ2tSi7alTmt8MFn+evVkS8JIra0npXHO-ditUn-glS2JiIU6UTncfoQ-0ZcyfsILJEucMXySiRyXsDxjI0mbkZK8oF8g3dSZmrjUsMS+gUUDlW+A+1zdUMhRtsL6yy6PU0zUjjRqUHzy6iGnkEAsTmNAe5V8sUwR4KXRRNGHZmUUIxQqc1PkHmDigaA+4UYC3ZkBUd9TQ8NADF8pwwUKa5j8C1y0tcKgRscHyVWqxai2OTNhiU0bWh0XilY03KjeUvSmECsYFDsD3g4aVym4ckZ1YiObV7Cy8AGMQpVeaj820CXRWWyKOieUOpRHSQtXGM7qngAPNj-MrMpmcnjhLuoRU1itwQU8uZix6lekwM0YxnsRliZaCChB0yXlM0wQDHM-GhOc5TpLUCIx2yvNxXyEQUXU-SgQc5OiNCdBwOU8Dge8PAF9M+MVMKnRlrcvQRXZ86l50JrlrW7wBD0MLmh+kpmL8TgWq0GIxu8L2RLqSp1zk6RjYKJc2xMOAGKsvSQUiSp3VMtihNiXbS00D3hdCtgRcSalUd8KcDUM8QXhUM7nlUIxnP8F-kWuWAHnkDijwCTJJat1ckNAe6ir0+STfGMoUW2VBjOMUAUwiLVl6c++mlAAanJKZQFc8VLU8cJbiwsb0zQMZbl2K6mnwJ7Gx9UiBl2u59NfcpHmKs68n+q0rQiyLm1KeNIQ6yqRuvsZJkTSmlnyMeAZXCzl1ca1JlWCSXglcOel5uXbR4svbhIy9alxK9p14UGrnJ03pg0Aa20acsXjRaTqg+SOIUustFiKKdwRmik1m5M+rn+eqy34czfWsS8KSUQt4Sq5WGgQUMMWqWMhPtcOckksTqWSUKOjruwr25yPGLiMOWqk8IWlD8n5gb8mQCccGLV5q2JhCCWcmgDA2oNsMzilAdcPca-pR3sG6nBUsbWB+3KigUNhghsvYWZCi0SgmxGQnSDFwEUpI1-UU4wgWGci80WVnY88FnnOhoVQySGiQca-mJy3SWpMXYSssJ7kTSE0X-ybcmOAftQJKP6Um0lmQMqitnwq-5SFU2bl40sOgxM0TSKC8rgPc+btT0shQOyF7k2C1llgUkRWsUjhkwSGhTWsdmntizynWOVSnPMA8R+0o8kh0WkQB0ss1jM-GjYAERzcAUoFJKnGufcJvi8sodjpKZfUIA6unn0BZV9UTOQricPjs5nChGKmfgq0wHVgUphmKMd9jminGsIWZkWsyvBUa+2uRdcWcoj8X0QyMhZVp+2eROs1ukq29pUsA7cjWWZgBvqHAAFUhP1ZlALkGCHuX9cjdgzeV-kdMtNSPS7p2+ixnVZUgdQrC7nh08jnlV04FmdASiCLkIYEQsB20o8BAVX0Q+MvsZ5h00QUt+azjl6CpNlrMuGgGM2DhO9OWmR0IclYUGWjTkDs0ISMvhKBSiDp00wFMy-lwr+2uR6Az-hiMTHlfsOiRe0JGXVDY+QVUECkQAyEQQU43nrsSMWB0k3SLkqqnaUoRR2qXZULMfTkY0xhzoqchg0UQlXU69gUSCf5noecZQdOvwCcsmzUKsZwb+AtO1lcgxh4S6mlGiEVzg2ONRpAbhWuW33KCRvkF58-HWLyeoWNSUwDSSKVlZ296iY00bUn8PIRiUAKl26Mvj68LumWU21kwUPvriiLamu2IlhTcoulwKwUIaUStQei8tn0e1fhwU4xhRstimn0VY2JilLXMAPQAu68tkNAleqEMLtnxsP2j9UQMJ88EGm0KgGR2AmRi2UJWh1AUgBTUR1kvkqXTYUzGMm6cCtJiP+kISbHU+S9LnCM3njYmF8zhqDcXHOu2lM0shV0JxSInmV2mqM2+TM0++mjmXYVUqxseksImm-xlkQ08mcrz0vQSKAsKK3UdAUA0ehmOe5elRsT3hx+-9lis9GlGiXcgBSN2lVOsqX3qJ4RjWRPSIl9oWEeJEQM1s73wiRbn0KVxkduzqNUsTKxGMidlLiBSgp8GvV7cYFh1sL6lnKjqxvs0CkoqzZgbO8Y3tyDeMU0hoAjsyymZqtP2HUgqku5alWXakQI-iXtkiiqRnVMzW218eilY826RgGB1UbUDOmai57jb6hxi98B8Xvl26QJDx9nNia1lgaptmaMWJj2pPTTv0TLTvcEni4iO1iLMREurMuI1OGatkUSaeRECw6jMy66QgRDJhmi6cL9qhqglC1M3L2zuV3S50vx8Ezk1a5o2OMHhnQiuAYRsWPRD8vNkZKjgOdJp8iMMYLhbiZkLSO1LgFAzSVY0LJl-0A5Sk0JKhBZ0rTWqOESjkJzl9AAdQnR56zYAGWkN8xDiK8s1JeUXYZiM3OhdKQuS7srwQlUJ+Wue15g1S0+nlc+5ju+1vV+Cp41FiChhp0vlknyzek5AOSkACWgWjk7XjYUmkQIU7nVve1kn8ZgWLRqfph5FkHRYsnCj8J7mXHUBti1ABLnwOtigNCb1VDCruhG66WmFsxqnECjlodBdSl7COlhDs-CXUc3WqT0CQ3zd3UzISS8FVuk53yMkOj00BbnACJo1lMcVgW+6cPm8xnUV+DLhBi9QHf8vBVPS5tiw8OlgAKYhliM9WSKKD5jgcJynCMYjhCSW3lSeLAQqBAQNi82Smz0iQTTk0gDvsiFkCAE8wSC4j2B60Onmc2xUA8DqlccaR3scxilu0kCiDs9Bk2Zvu23cIWnHieyRuMmC3SiSmlNU4EW789jnvMVgZV0FzQBUD9p5UFzUosongrUxRwsikpU-GqrUuGVEyJ63Rn+0ZllwKBKS4AsYFMyV6xGJ9IXVDgSk+2uinU6afU2KJvl7OsTq5A8wVc07jXz6xai8SrwNQZiZjiMGTS0UPEwICuKOuBsCm4iKgG15pZkf+UYVRUL8gh8Y1gwCsDJfsjUtaMlxn6MhSmlU-FnA0rBknyyKlOCxxnmCee2GSvDhh8utlgs6umC0TSilK2oaHiz5lMugqWpA9ShdGa7i2ACVg0i-PhAmpOnA0UnlOG6NyecPtis0BACTUGG2O0rHjW0VvhlleugxM2hRhtl3QOmbOi3sTdArs5Vx7kYGnO0PGLRaGXiPS6UQw2MTmFUDnyKKb5OqW6YWRsumWgMjq2PDqRmiK-PK-VG1n4CXykYlFrhIuVchXcjamYcuMXaAGWgdA+iiTFsmi00SEVD94NRQa-QTzMpjVGefBz5CAcU0OomhyMDzlCSAljOcmWjeUtnmAitlvYiQgWvUnhh4mKyiJF+1zYaepj4UX5lRC1OmIKs8lVM5MsvUj7Nt0l-g4SDiTmAfng0WtCmC6T7mj03tIEALQVp2wuke1hEU0OxRk7yj4XB0dFXxioDlycKg3NiVuktiCJlKU12zvMYwAUMxgXkSO0wiuain9K4vgsCx7k9RVilp8sWzO02igMUVunXMVHlZy63gJc3s35SBoQtA6kR-sYUImCXaRmOEC1Gc4XXdKP8hfsvenF0fp0bUVXnZy48RNG0tRTMTM1LMQGVh0-oXmcR83ddtal5s8nTcCrdgnyE3noM1xl60-KRHmkgCfUVBudU8oCY80lkyaSUOzkU5m+sKVjA8ToT1MuMXFa76lLubHhl88zgM+v2ihUmzT98p2UNML3hZUMGjYmUOw6hayh9c1antAXmrd0z7gDiJznwqAwQ70wQFY0B8QiCqjgz0+YWr04VK+0Vk0hGPQ1d07gHu8SJg+yyQRrS2cnpcD7mcSTplZuNYX+2jO2nkmCz0KctSoAT7Rb0xa02a6x1WGk8XuUmVVSc7BSi8PqjdiiKn8coiimGGRjgAxyhamP6VSqqum2MiSg9CFIGMUPmjc2UiFSqiYF+6lcl2uH6hGCpER0mxGV3sRIxcUzJjicaABNMIwH-cexmQUVTnasfoDUB+Xlm0v0TfCoWhs5iCj5AU0K10m8nVUAO0Ssm8mR6fIQRG9pmTcZzgos2thLmdVSLkLylIqrKSbUBwSiqp+ghS5rmy6O2g7k1WeDqW3iEUOxma2m8j6akaWJyLPMqi6vlaqKcCU5QRT-58wXKuVXnQeR1xdSPBju8VvTy6EKjGMapifk7b3nkcZn46kFkzs5tmn+iADYaOiTjKEpW5yegTdUfiismv1i2MxZQHksxXC8bVifUBKUcau8kDyl0bRqxxuA0e1LEMyyjn9R0R88k+XPMndgfyoun31dOhfksighip5WY2BKRT0emSXStYQPivViwMPlkiWx6Q802oWOzqwHXC45jkMwGgY8nxjx+BchsUM4Vbsj0UTD3Ziw0EQV-UHAGve6iWisonlEcDM2+au6njGdbj5A6EUnWXUzGqN9kSUAlhzapZlDG+7wis9+hDkTOKY02AV78M0TksdQxj00cwBC8qerUHugfMrcnH0R5itW3eQUSinjQUESgLsxQSIKnQWOAKXmWsVujb0GpjQ86pjuetdmu1ednmh3IQqcWqie5Qai+cHegJSM33t0oyiOqM4Q+ezOjOFZMUWyw0REUiVv6cCF0BqBSht2u6jvxGSgB0Y6koqP0WiU6ph3ctwQmCUcjLkPUVMc5miZyIyhdGX8WMitWi+U0xnAM0-xJMazjJ8+SuNAzmlV8n8mEK92e-ybClV0rKXUsFjlkRaySDsXJk10TWmMS2egnS9llnmW6khGk6jbq1wSaN6Siz845gS6sKNHUKoANsaZkzsR1UD07flGiFiCuSK-jx+HuhncmC3QNBEUjUsPkbGWakV+211A6srRUCbEwW8ZzJH+BMXvOOYTC0z6lCptNRlCFfia0yOgtz6iQAcCcRPKZPXIAFukL21NlYsIAW72iaSDCUChmy+bm0CpNlQmfoxCsx9mQScPgiyhRmg8zpiwUwalaep9kA8E7gJKM9T0AR10-srjjSMo1mfMlLKfidbgvmupVyAzai+crguoCAhhYC7RlnyxnTGxDLi7S3ZITU5GnJ0O01tsfXjus5+n2U301Juy9g6AXUxZ5fygVUK+Xms6tW-yQ2jvdQYTZUM9UFU1ShGUiKgmcqGXXxKFiAW4tifahoTm+lnUK0BGh9sbgXiMYcV-MKSiAUNbhQjZ5kL08BKXgyKSjq0Oj0Rs72AU95y268FktspWhxqRNMVsQ6lJsyDjBpAalKcn0XHMWoD5AMIYLay2TWsk8QIc8CP3q4IEjyXoCLiQzVJAnClJKi0U-GaX1MBgbX6CTugvU+BhGUnSlUqXgADm4vgs0IelucpU1DGF-lxULlVPGiqi6KObTv0vURJi9HRT8hxkmT9eTMsd60EWBrWMC0gCTMTqX40+B3UCiRj3MqchINQKhMQhhyQO4agx0VciYWZlktU2VS2RVRnFackRfkLdBBJ33JKycyjuqXZlgc7bxHJeyhvKimR7MiAVvk4UVx8Gyj1CbhQbOfJlg0rlwPcpTjPy6phfUvxWWOdlk1UyXUTMs7zjMz6iIyTihpMeGlMQmSjwsVvlnMSbjisJwHJs6ChcS1KkTeOFw70Vij7iAbW7Sm5kOCGtUfh6Sn8Uts0EWj6l+AVvVlp4a3bMGAAy0Kr1Fibi2qWySmii8PnL+s5S2s4UT+8XTRDkNTnyMQRgkZ+kRlUPBhnFdml8AG62kl9rlKlzAEsM8SXq6CJjaUFcVt8sPgamLejUMcqmlGpHgaMl-iWUkGlq0npVoCPQBicLGhm01SgZmUVVA08y3XkTSMFKoSUkcw7lx0twDHkc-jHsvpilKiVjKMtvkeLAZUcQitkJ+rABfMSHVK5f5i8MXijtTSSuEALcRIyPOl0y0ClMBwXRasikSRiCRohcHAAv8cZS50cCugNALkrU0aht0L2UaCgNUhA1GgkKnzjGsiVj2UeGj20s0RnqXlgecvxMO2pcQU8HwT9AMMO-cREvzdO+caCZGgfcqOlIsYjkWikOmuChSl8iDoFMaFckgiwSUjOK8A6hB1T0MEGckh3sTK8r9m3Shxhvkl3S3a6TV8gcOndWYfh+UKBRHSp5Q1SF5JxKLoDz0lC0Sxbc2iL-bU-kKT0wMkSh-klGkacJ8meUVDoDU8bpLu5qkYSfagWCLcTWSHinGMfIB4moCkXKbHk7NLeTW2Yk0wAbyn6C92hLUtigj8CGy-SELl78ViGkA6o0ISF6kF02NgqBeIybqpGWdMg-XfijrLPk4UQQml7gEM+lkNSfXkwUH2WjsF82F05hjm8IqcU8rWmCeZOkjhS5k60Vml3yIqlXKHOj88+qRjU7fkXMD8hDk37RCMKJjls-ThN8lVSvkFDTQUTVWqWDZzgLyPVbSAoQ7yjJRGAz6j1UYajoyzQGkUPqjccKKj4qATgyme1iUCQql+WVckUhuPiKccPm+0Y1jnUcSj-c0MTLm3cm1ceai6U5aWvy0bXyV0AZoUDvgZyLCla0plw3k+F0p0CwHpMApSMc8SWRMKNii80VjY8iMXuz7RlPGBFuIMQdnT06gA80e4SrsLdFDG-hyOitZlkskVmb8HoZsiLgM31reXwi-kQEaObUyqFIFfNvyya0o+lLMBhhPC-ciXgtanP0JXUEUz9ggaBhUSMINiBZ7jVPSEDl8sK8HP85JjHc2ZgW0zVnZylPU0zJDhZuzZjWqemSsUxwSDMTxl9hth0IA1yjLMJ2nicoun8iGWnP6r1iAWF6nxs0em0MUljMQPQWb8yPXdiXKgms0mioAmhiu0a1lX0sgAg0-1Vd2pJT+SUuSU+UiW9UsoDf2aRyaUCI11mJcyvUQiQNACZkFMAlioAPhmouiijN0nqm08eACLcQB0UWglzycIRiQ6IBg9iq9ylKixpUC170PcjmktOp6VYiHzmNAfeWFCthRaGwj0LMv1igaRlksc6iR7knGtvcxeWeCQpTKaLtgWAGhXpcN8j3CGBgsUiBczsSOk6mdgGLMXoF7U2nnGKIw2mUUEVsCcCT2i7qzxaiViosyRiqcRZkEW5ShTa3ehBirVU6mXGMnWDKSbFKml7aUiGL8IVjoWWnm88IJIBF9dhdGlvj3M7pk7UegGxMl+kyqJoFMMmjnXxqIXHiFli50kVRczo8SecqSlesdpik80WhGq4alJuIvgGNAy3gRV8m-ixiR1s6zigMVq1aMBKWpsydgP04mlZUqJUu6ksb9UhZn9C3sWYOv+P8AZAxnqAdjLU-ICJKLblPChNgg0OqkjsPNgcs0ZTaUk+VW0BCULCy2UvWYDWsUl6OEeANjucAqkIi3DiMkwjXaMJ+lbC98k96WGQXLzbQFU2vkKSf-MfU+Kup8OyiMmw1n7a9D0aCuZRN8vZlXMouhlSMFpS8xZTq6i2XFaA8mLUYhkxcWyO9iCF0yi5rjvselieUP1nfiGTUn248w70ELmIiyoHCUxaiK89bjj047lHUZVk2URgARi55m6s7nVGcvwT4q+DhpAMKk6s9oDUAjPrgLwGj1U93S6s30TuqHAHPGPimScrcRNMw3iZWI3UFpwajTUUmn10bvRpsqoQLa-KXJyss27UOXRLqhoG7qNfin6k1lGctqlC8xDhWLhIF8sX8SaAoNiZawen70Y7kQArzSkhhPy2AUendSdhjj0Nhm58tTg7C2sQGsJ9gFUtmk4CFRnaU+Cms8hRgKMfTg9UGpjUKaXhUUfhjxSFgTLsHV0lqLyWouvNXE9BxlaUTaQDM6o3GMG1lwKh4xmUOXUl2jKhoU0oGJUNdlsASOjM6xWM2aifTZ8HUJ20IylSyre2Rs3+MTCSfhU081hvUSVmj0JIT0WTUUusC9SPmjWydCkQC76XAFAsBwSrGj62cSk1RScWextcjymayX6SRijahRMWoHPGnznkycJlbcXLm80RGjkiuxiXqSB0YSV8lv1WXjqUsSiecoClZGjJSXgvBVLM+0yEUf2iFJHmiai0tWlMIYHZ8mAB70BJhuMekRE0ZAM+2vYXwUyQUMsgiyjid+m3kBelFMlqmgKmkW+AQSlU85iiYcUcWTUDcQLaL9mDCP+m9iJqXx0yymXrd9kc2cqJSeOoBcBdATsQqClkR+YUY0blXPcjWzvq2PVW+zDjGU02j2s0qjcKqGoSaljpBKM9lKUEXh6c2VluMXRQSsimiOMS1h9UgoiT020y80MrXyxM8sG6UaV0y3rl3Rh9gBMBEW2i+6mm0QdRlmfFRcSFiGV81mXfqmCzH0eezOsVujyywgQlqx1yPsM7k6AcplerWPRcqAplNAbYJd8RZkw+4xi7kyFm8SDvmuMc7hiMGZwo+T6SRACERuMgxik8EynZ8jgRxFkMJ9M+m1PRo3idCUThNKPJTPhagAmMMayPMc5ijyt6hA2svJ50EjgjAPnSEUMnjoO9+lR8fGirUGgClA6UTasxhWvRjziP5Z6mgMCG3tCKcHmWrG32ajJWS8LKVbUdrvOpe9hTmTimgsDRX0ilHncabzjym+kUW2MPn1Uzfky8eR33SSKk78D5lO8-bSjsgmiVskYWB0lwzBSL1jksKBWIcBmyMssBXFa7SjMAs1if0GmQmcBGh9MMXTj0coIEM78j4OWGknOtgHD0mWlPRhTxWUhqWoFBhn-iXQFSMsJizrOxi2UEjkmxq+luAi0TLugSkUyDcVTU4CgwMuDiKKS8FLiVOQAclVhXUraTUCQdRlKxymhZsDKSC8BndSx2iZyLvltcRTi4iiGRLU+2ih0JRg5MYpwfkkSmr0BjSfUlhmny7ujcqBATRMfIJ4qgvkKNZmQG8ftSmCAZX1mlPX8iqTi0iRShtMTritciFg4VaQxNGJ2j-clAWuBEKSfcmymVUST0B0kVkh0uilhRftULMrdDHUF5MxSspljUMgA80C+kE02CiAWiDnzqXIADMm+myiuHVY7cvqQis1OKxxjm2KWMy4MCik+seHR+2F9khAhIVK0rmg6U0QVg0PtkjCPnWGU46l3y2DnF8A6eWAwv3wJzOmnsUDRXSWcuas-CR7kc7W10NqW-U8xjYMcjl1KekT2sKIVDG-+QrkzKwNCn82HO6YSaRmETWUAdSgU7b0gigM2OetSijun8oqcyJnz6zllRMvkESmM7gNC92mjKFssdMP5hO0HDU-M2SmfcIbgiuRbiCMmdJTiA6RfMPciu0jakCxV2muWlHmaAveiFcZQE3MQ8Uk8F2jYKEQRXku+TQ8xeS0AikVgc1eR38raVVaEWTksoIRtc0RhesRiE-mr9g0RrLcZK+3iic1iWgA5wGnk66OKCgKheCOa2WM2ln1SeXlBGpxgnRblkkhPinP6UoG082dhHWySkcK3OiFh73VwUuQDdSoz2ECXgU9UQBxwigWOrMJuk6Kjt0p6zLgbOD8mo05GjJ8bqlnCh7hbMxkQQ08Yxvq9IR-0MRnfcUJmJiTSn+s1sX3Cj6lhOzBQ3sHViRAfgQrMZBkV+1Thx+TIXQMjdgIA9sRp0BeQUUMWj750o170mjiaNZdkGsOJS-keSlg01wKspa5m6UZWmv6PpgLBbCmT09nXD0geRZulevvCFlnZAMmkOq+7ymMeiO4yMinG0IQU3kL8XySEOlOCsTgW8kqj6aLy1S01WaNsFuTLk8Vk1aLvlLmLulraulkJqQRhTkjDkj02ylSs9+g8AWcgD27SmM6hDify+j2B+oSixs9pVYcpJjKyeAX5JfzyRqh8UFsN4TR0lBnWMpOlk8rdDxGkBxZMV+lb2tY0pKvbnH1aSgMiXCUGsgonTCLflVMVVVycEQSnUwrnkMn-xiad9jZ0LASVsvqj6adzhYUz9jQME0UctCNTcAagEGDQzgsSuXTBsraRtcWAGcsCvqKchOhQsUVjRUvvgaUXiR+UdcOoqftTD0psS4qPimY0BoH309ARIGWcmAsl2hXUIMTFO1mmu1qqi-MDy1oC6DyZyrzjs53NkhBbCk41WXPJMT9fjCRAXfy3GkyArwVXuYp1KM6N1y6Uanfi2AERCkOmJyLQG6MDJn-8v+Oz6ftkIWSCU12emnwAVax4xhADLcOKiaqBoToCEg7UKPCTNUyFUjOwymqcOtieRrTwmCHejcWAkQW078VWckWiVUi6g-0rumZcLzn-yeylMKaCT8ALvgU80ZV9kn0X5AQpNrOUhiNmkRV7pJ3lUMzuQXUm+V7aosWmUpQDO86mgoCM4SGcfZhtMTIU00jlvJK2uQ6A61ihUbsWPiTM0m6IGhSsO+RnC+dRJ0mDiX0lagfiWZQ0MXfWg+YjlxcaRiG0mxUQ8vijEaj8jgVCGzKyJtkatvWg5MCiSqMrYvyRyVnwSY6hnCMARh0n1hjM85UJAEKRXcDZnH0C3nMAf-yXStgEXK9WzLu0gChU7ainM+kRD0KHgXgCNjJMgoFuU0ihD0QgWks7NgS5BATYKAAWw8CBm+cLRnaUtP1divSVCKM-QU8I1V+U64UQsqKhjW3e0JqKQRQ0Cik+A9QAiU0CismLQFTt6N1hURs26Ot1kWUBCiVcVqzHkjxhgGlVk2aAgBo0rTnesi2y+MKGysuN4Sx+Y5ne68p2lRfeTfy0Wnm0qlRXCOznNsgsU-sQJi2M+ygumbXoB0pCj22Gco0rl6kU0T6X8AbIBjUxswjr+ERvM0+n6x4EVOMSmjRc1ahx+DcS3kMGgF2z5x5Mhhw8MTWgzeD+VJMUSnz1stmzC2KnV8tPyx6Nal2MhqT22RGQkmfz0EAvgBHSe23JyxEXEpMTTgSbaZpq9vkqMyxiCm0pjvs-cgsUHcKku-1R9kvzkfkLihsMFtmKxPKUSUJ-jaLlBRR0GejsQGIzISsAB58o3jRMPTJVe-WJ0srkQnRoI3Ucv6lxsIGzbU3dmuMmQVaOiyRaGc4Q-itPzHcDym7Scln-Ka2kHsxqgGCf8hHc4enqykHwe0eHQBMbujgcifRicFNSryNKn8U7CRKBPqlWM5OnBUIh0cUlJQPcIr2Ou6tRTkieOvemcYdAtOm-kt+laqRJZUy12vzKWqnqU7HmccN-N8iyen1m9uhvqcfWC5zpPeGGA6NeBchvqb1m9momiTaRTgEU6ekeiFiTh0mjhL8MOV7UJ1nc64ryA0j838aoEVcsQCzWUBiDMsHZn0cl-msk3QGwR8Dn1UQykH8GQ5+AvoQfsIBjucbBmr8ndlPCnxkQCXVinGcql2HOnifc9QHFSKFiuKsxSFqJnU9UXthL69Nl6sQijesLcV3Uu6RecZc18UQ2h5stgHgqlXV1M5FgFA1ckaNeumKCuine0cCt90SRUUWBxzcsq9g4RVinS0dJQI0vBUTMNvdO8geh8iTl2aeLyxwMZ7YschHicU0ugKUh1TM6zZgz6CIV983ejCSaaikm3bjTUnmhDkQrfF0mURzaqWjUAPQDPaqWVMKbGZHk4zhmSFTkUSH-mjKmqgdUwDQu68Bni0Q2niUXzgaKY5mA5KG3JL5LiQ6q9n+2+li4ipWlCS9jlHkWkXZAPQFaOWXggyE3gncUwCcUiDnZyGbhBZH-ta0HelFsx7neMMkVzDe2x38tyQvcKbVnVteiQcS8Fv0Bx3wSBPWc8UOmH2MDmvb6mnH0EtgHc4lMLktySeUwkelMKBRSUFWhyivkTDqxDkg63gVp+kLghsnanT0DOkhhyalBGsZ0KC5diY00UWjSuOjJtayxe8rDULs3+OwCLemscseQl0BoAEKERzA0vVh-8ayQtAa8kvsh8V26RimN2FjkRss7xQ2ynmGMtbhNiWHnU0p2vmSF6gjCIw1MQZMVXMm6nyRepgnUMrRBsDbm6MuQF5skrg4suwFHSiRhPkiUwdOaCgoZ+Vnhsy-X6czNS5UWAHxs-fkvm2Mse82cm-kOvk+SSWWMS6oa4ifDWuWIgCyALQANjqWmiiZhklqJWiK8AIXbyt6gBMh6jemgNWjsz9hoCGXnP2MGmzm-2330DNgdszuguco6jHrurJ6GWihps7w1Icwim6sJmSbUiOijRMQClU1KngMadl2MIcprsY0fcyU9ZfWnfhboPDVPU9eWDM9ult87BVtMAjX8svBg1Geel3ygqpuM+W0ACjvj4JGCnY0Imi9yzxm8zFZlCKkxiLU3kXLUyXiuK17zlsX+iztaHmnsYAAcsLLiGxsunLsjICfcJThuU-RnIMfFTR0u3gNAC51ZyAHiZmfIBLk+KpKc+2mx6a20oAlmTqMPVSicMDmLkf2h6K6mgCJ5LjL6n1lrMGOniUvSi6As1g09pwWayPFwUi0wBWu9wENCfpyL8Vs1X06SgWAb4x18u3lqcv+OXhX4sjC8+h00RZlRUMSmcSNIQXiz0WOM2UWt6XijUMSiF6j4Q6O2j+kpevXSB5jJ12M2CQamo-vk8IniW8GqQGMT+QUMafWm0z-jA0PlS20umVKui203czl0JMtgTRAKjjGMLPeV8hiFwMBFvMq1ehlUr0LN0Ihyh0he1DUaV1gZV7k9KFHy0Mq5h9STdGe8LU0MO-mlyiOhTbUvvmEUeAFRiAnpUcrq19kodmwMHeiYJtnn7ugSVWC1AQKMPQRVUL4Vsz+pRdGLKlXgZhkIV0o04ii7goZhHiCAY1XO0Ppg3ceNjGc9dlHkIHRaC5BnvCWFknszABaCWVg58PKmryp3i0KvuilUl3Np++qWHOVulKKi1ny8SnJhtilkwM6cLJUDZlncOektUKGy8p1IH-kP0SCmNkV7srdAoCtTj2i6nVvkXYS2MynnZALAFJGzBQ5M3EXeUMfxJ0bCSFCsZim8K10JC5ynHOds1F8z1gBFIahPkjJRP0ydnllmXhBUbCkwU3gSu04Ci-kDqk0WLeXllP20AaY7lvUVRkER9gU3MIdhD6lxhfsJMU-stwXhC7ZhN85mIlSVwS6mGeiTB99pFMYmmDKxRnx8yOnJrJSm9imJiwst-gXUbEwW0lNg-irdl3ymWgvmt6TXUM2W58voTRUrcNRsFpgKMDJivktajbBLejAa3IJkMVwC+2vPl87AQVC8oDmGizOiHiYym8yragOMd+nYKXcQAOk+y764+sschNm6+V630Ch6nsOkdj5CTOXZygGQymvGkfcZTgqBTSMv0j3gy0chntaUXlvUP6hcM0xnKM4nj2siLSIcedm3k-4VZHt6kqq48UeM8yWUUTGgeyKoFkRlRmfCrKQxqfpiYdN9QIc7VmfsKqgjCrgRUCtZiVU37WI6c3nisKVniss+g0UGikH8JoCS8GOn1K7CVdeoHUdWGeiGUiCgc+O1S00zUSCUqdrRM1ljrUB2xam451qyPjV-xKYaZC9Wm2sLeWD0JoEFSkenhJCDmf8o+kyqMailMp1Xq2X8kec-jizl7pVO5mCSWzWZXtsqpzpsTLXfMoFmAW8th0x9ily8oD1Xg93jTK51cfUE1nH0woBSUGchgGd1QTlHmidiZ6kss+YTJ8QFgu6u6hPs+mlGcI7kUyO8O5ido-nOFViIC8ChtAH8hcBWecUMQIE6mqBicurLYDM7s9qy88iM0Dah7MX+kfk+DlLuDthUAPIUeMvTioc+qkKNSNgtbfBl7ceKRGcgHmGiSXmp5VciR04+nBU5QUWiG8UjOKQTvxoSh00lJXQ82ADs5v1jXW3ER2+gkVYsSqkKssJNuUEdcBFzEXtUdhmyM9ri4UHBgCCGiJ6G1BiEqXSkR8KcWsMMMXL9C+g-UAQSUS1kVp8FZgNcSGgqcSB2vs3dhDqaZhPcm-LEaq5QkxV2SdCY+gbOjCmm0qnkDawtj9sHMQwLbiwj0LyWh+m5huC+Wk9RphkAy12UaKDhkctBJleC-TjTMuUWeUwhVIM9rgg0bWmUirtv7uNIWj+hAb+03hlRMOeiRqlJgyHiIUGC8swmdn2SZiImiHqhUQrsd9mucLoRdCaqkgU5wFqctTh1s1fQ7CxSiicvGjCZ+ZUNsprkDydXjM6hMOR6ECLsyZiCuCfnhLuj8ydcwEXkCxpkGUEYDAqkM2l0-PhNSNOj5KpOlNrJmRiilvhboFhhSBHsx48oIX55d9R+0LtifiNBUt8HQH18KwC-SORRI01AOL0a1lZl4em5yKuRIsz1jAC1hmYc-LT08njk3a0+gj0KGnf8CzWOJagAxMHxhdBIwAkZD3jyixIAo6xRmh0cpuFezy3m8eql580XlUsqIT98EOi+i2PUn8yYQ2s3dhmSd3hj2trgFMA4wFsnU2KKNfmC0Or2zs3Uzh+ywHvMGnmuWUiG8M41e40Ac37Cd9SQMqyS0RJCM2CeV3GAj9mnsKClPRXKhxq0UTXMh4y0qs6pHcLQS60a2lKK7nYXsa2gZ+bPzIXNxkQU3fg7kJDiRzsGg8UechgUGgB5MXjjcrLVnHipNg0W9+ex6KfiQUXiUh8m3kp6aciiC8KhsUVxVT0imlOyCOwEiVguG0cuy8c1fg2slEwzO1en7qkoM8soIyMC1RkJCCIUKANLyTktmiY8UljIiXcma0fiV6APE12aVa2xs6gS86cA1KUpxnWO7Xjj0znhjhmJnbUzA3dWsijBiraW8ygbUpZjhUCU0ck+MtxwKc5MpaAl3SmM67lPSW31TUFHUW2qwFR0snmJkUwVzDp-j9OaQ3y0GbkxcY1RbyQKnxVFHje0rbgD2uMRmiw0WvkBhlCKqcmh+PIWU0mmm-iRtkQ8wtnMMRxjK7cxkTU4iTWUQmlK7S+lveWRhPcfgWccqnjdUM3VF0PFl3ywQX3S5BggZp5SRUqngeSUqksh+qTI0nln2aXTWfM3Ritmq3n0e7ZhRZm8RkUqtyuUbCQUUImiKKOnnKMRfnJKQhl3yRllb2sDmESPlW0UwthgGw2sUAp9gwchcj0WhRj+8Val0sIwUHmpQHesqoSmGSsUS043hhUsZn1mCDgzkXtir8XoGB6din1ym5l6c-mRPc22ixU6D3o0QYXE0pgNf03pg80fwB2szCiGzPJRbM2GnSMSah+AJTaTczajM28YzjKplfQcjASKSK6WamRcWeWZbmamhRhQ0aeUwSiv27JAc0bix6gcSF01Otgix6qvu0J0t5n-MNyhCS1mg9U3XxT0W9lA0dB0HkgtkssXZRCs8dliiPT11Umbl7xBSztcumzQ8mGRsC16JQ2JJjyO0FmQ8LtlLCachmS97gOmwEUuGLhln0JNkR8QFndMLJkn2UWkt8F8mPUpCcGsigAhMaQR58BiiQcGigVKeAEC8+vkQCnxh8sXvlhnPwG9iYLjMiM9k7M9W0PuWZXiUaOizkr8jvsuOhNaQMc9UXSkatXikZAAkSOKs2jxUi5WjaYC9rSdZgGS6Zj82oRhb6R-JKUsXms8AwXO8zITIOq-3TpyxytWiYIlMlpmF0wdW3Cklm-xOhQFK6kXRGe8i+UxSnEibum6StVlgsJERtAd9hBiFcgci9LjgUl6PQ8PTXmmA1UAU6TmZWIRipaNikhAVqlKAmlgCA4Kl92Q2OfWuiTOc5-W00-NOKMCMSy8sGnrynr3uzy8hbkhNXg889m802eirGPeijkLIQbsiYcMmXwWFeNIBZRz8mdAwZQtc1vlwUVxg7MhCwIcV+mYcgQFcB8hkLSGBmCSWMxwsUpXCph+n0CwmlOGntkRKbYJ3sXYRSeI1Vs0hyk4UaZluOxxn0soRg6qTyUN066X5AQLIBsGbjUCLY1uS0rnbkiHbfJY2OZUEZiZyPbg6chRgJMb1Wvy7qTXMChTdUPCVS8UJnwtJdzX8BaSa0GkVgM7enuCXcTA0GOhNSb+QzeQ8Uly7mUu6Q9VzS1qhmSQyk6CyICPcT6XXRa2kn2MGmR62BmssZ6mMkxqnThMhRA60emQi0UTSOJwXoU7qX4czahbopoUYAHuUS8SGlOiuphtAGQ7r+l6P8uiYR7kYoePUckVKAPSid0TniBjDcgFKPGijA+Ex8MdFVyMA1iX8uGjtM47sOs48RbkTORm6U-X0u1ciVsrtleemTRApPXnpCZoSTMPKJUrcLjmyXmhUUGIzlqltiMQ7anvkljjZyyFjk8jVQxGCd2KCt1iVskERZcjIDIsvsQ3sWGm-0IST0CDFzd0KfkLk2VW9MJy-kU9ljIUwFklcQRTIMMdkC83emHcoHQ4sfpxF3PPko8rsRk+EqVLms71-sHViZaTi9caVeQzkSiAaMLhjX87ymlRXGnqy5yicCTujM0T6gZmH2RkKeOXMbUaXgcuOmP0NgVA6hmn0Kmai2c+NjAa-1hv+DiRsUPGIfy7eiOiiITw+6qieUYMXUsSfl9kVZe8KLQXjMbE3UiGRXM05AP6swehJmc-giyQgR2yOmm8iMkP2s8q6vUwoUEO3DpSavXTem7mMy0ZcyRAJd36MyGZCsM8kJsRbm+siIRX1+owUCsDKoA0Px1UwkXhU+1kl2Lyjo8HGkQRR6QmMZnS7klLJk0IVkZW5o0WsxqVd6U5n3e6HhPk8AH4CdmkR0CBhYAeH1bij-2wUQ9Vj0EKTSupNUcUfp2Pk1ckisFGko02mX-qQKhI+1yjucpT0yqqGSEMJqUXUxlhvkyVnas0ylMcikWeiAoTBsj-ZR2LywLyPqQCOtGnqudscAM9fmQ0UelyR3ISXM4lLGsJDi6shiCucQGWCaMoQpqc3iX09ARNs8yRXgkILMcCSky0RizrkF31ldEGjIGneRtU-cnlMrTwAcv9gyNKDX-+A1gtsmXm+5s8lcvj+mc08DnryyChXcWHtesgXkXcEFgF53ygItttjImJUVOSxgSJc8Cb8CtIVWC-WN58-ZlJ0d8lH+1BjhUr1lW03OltcXS1K2-ORHsJalKUEoRicYNgo+byiMQuShmiyagBCKezgLUuiCl2ITBuVu8usyLXt0LVgUlL6hmiY1QLUW3mW6klmI9VYxVeoLUozvClWCxRlr0lP2KK68kCx57kaSbI23ObgBfklBggRsRk-7xMT2p5Ln-kMNpHsgokvk57mjGLOvfsPBSgiQOgnCxLl+ADdn58pHgOyFNSNC7Wj3MNwW3SFVxkKTyQn8kCkM0HjWSCIgR5coSh4uIwVea3VkocC8DYMJoD+9Ceaboprhd0TRr5CrtlcUI6iMCshUWC-dQ3kLt1IAtNSzKhZURCBKluAyEUcaKPhX8ELm-kcuyAszhgIilFjymi5l-UK6WTcGb0XKeQGODPlWKK93VcCr7l+Ae5SDA-CS6AXyiFK+Kqji7+QR0GEcPS+VhlcVfk8UrRmkA4FvI0oGm+UpJX1mIJJL6E6UM0odj40p-0GCfnVJiJqRCFWlT9qXiVC0xNjaMtFgNA9Q-YKx9UJed+KlAtOhPUIEVJ0EGhYMrRknUhoXPsbygyHoWkwhLTj8M1Bh0mUGi1UlXeSs+yxoKEfgyM71k5Ax9hW0VmK3vMnxeWSIzWcpTyiCmVUWMXZToULlQEU+un3MsoGg+2zxDUO+igKhHisWegWyMraQvsg2m3ywz1MKw3gMUwSSi6jgXl8SBzS+sChNA8rk6C5V18suVmfczpLHcWyN0W+1yDq+DlbClmW4iYei1sVqz-+mxS+M9jmF0-7iUS8CIJMJ5RKyXmhXCv+g9c4kSRzPqWf00lmeNaDiLUAdlNLdnOLL9aX2a7Xgqs3+m6UX8VrUsmjRMvF70MO1WMUrcX48C2nac+kVdsPRgWUgSXhCr+hesmmnNsPE1UsLoB9yp9nKCKTl+GkVXM0fhmOzeNmU0PqmtqSxkpMuSi3MDeQfK4wBd0DDXkCSmnGAAJiomqWn78yoAPcC9lyAUShzk9bhTM6N2vRvjiznfSi2+s7wj0xfn3ik1Q6O4ei6UT8Sqc2CUu5fBmcM+1mMSqVUQ018miCVaWc868kJqA3iGUZynLso-zAU19irUjfm0KfBJtM0yhl0iUw9CQkUCxVvQ9mbah8aiAVLiHOhWKTRsLCLen3Ms1T20KajUUbNzn0mSi2AaDlgcH8koUZTlFSfUWkUY9moUpFiY0MniqU+MSJU2tRmi3mgfs2z2E0vPQz6DLlK03sQTkdRkjsMOSSKaLTUMnPrUqIJO4dugOW6CcgSMsVQtCuOhxUe886KyFky65MvRu4Kmjsg6n8AxehlSXWnTCzLh1KR0XEMpng6s4wBwsWBhUyBJVMQf-3D0mEW9p80zIsEFh8M7nmv0d9k9UDYV60cKjqGE0QwUylkpsrBiiUj9nllLCmOUR21rMEuj1epcxkJtxww0qWRiUpI1Xc3mhrUEyptqBLnnC0-xz00Fjw0-eyOMeAFeCyThFeFhgnd4xm6MTqjGxKsTRcOiSoKvNzyL8VnoCSlTy8tY1Ku2+X9KiYO4c3NjpUJ8ixM-jRMQ2tj5h3ewCOwUwdmggGfkRPyyMJLmCazsUSOibwiswcxV02DndUafwNCegDj8E6PbsFzV-kiHgl0kVuoiJ8gZsOKgbkTgWNmnAQ7MIwHXc6DkSiubuE0PNj0Qjw2PU+o2807AUF8dOl-x5f29M1YXmsQHQJMVdjqUS5jRqm+QTi47nUxMTWkazQE6MJV6SiIyZTUvu2jsOKmncdnIDuONQA8jtzVsy8kbUHKgWCBeilUrZk3ar0x1iFVkJ+6ejvx-kBHBD6m1qTEogW9cjwA2mnHck+me8AkWTU4un7krDnE0wDQDqvYRKsLiSpyeGivydHkoFRejeKmGUeUk8Us6hwVEFHBkBayOlXsv5hx6D2VdMKGyz0shh1sU0-zKTfkx06JReUx1150scnpM6oy9DQIFBUi9sMQWJjIsaV3R0FWjMy11lAsfeVy0AKRACHySuKqDJam6NzYMdBXfsWoGCSodhi0DOTyixBhNiIZT4pDUyMkQJluAPOmpBP1i7agaXEeC8QsUH8gNM0MTzssnhKsgqR1UpJQqUXLgW0E4x5jaywIUXS0-M7eoHMJGmR6k8VeBK7lDisVmaM5jafq7+T4qD5gz83aXAi5oynahqXXSYlmXU2fT8S6iXfs9thFCXwFXuw5yUSeeUNSRYRwMivRgGD8S8pVRjgUeiGv63iilUwUL6eKbnlc12rrhkmlasOel9X89mOeuZVDUB8Ufh++kPmF5MTUSxRHseFh4qaumP82Bh8aTCg+02eRD8oTij0o2lhOENol0Yta2RU42l8eUzeC90I-UiWncUJGklSw535Mz4Srk6kTDq-OnZ0MLjEaf7h6G-mTImRcn0kuGkQA-sgskjgCKMqiHUQNMjFE9MhAAHskm-U3+m-M39m-c3-m-C38W-S3+W-K39W-a3-W-G382-W3+2-O392-e3-2-B38O-R3+O-J39O-Z3-O-F38u-V3+u-N39u-d3-u-D38e-T3+e-L39e-b3-e-H38+-X3++-P39+-f3-+-AP8B-QP+B-IP9B-YP-B-EP8h-UP+h-MP9h-cP-h-CP8R-SP+R-KP9R-aP-R-GP8x-WP+x-OP9x-eP-x-BP8J-RP+J-JP9J-ZP-J-FP8p-VP+p-NP9p-dP-p-DP8Z-TP+Z-LP9Z-bP-Z-HP85-XP+5-PP95-fP-5-Av8F-Qv+F-Iv9F-Yv-F-Ev8l-Uv+l-Mv9l-cv-l-Cv8V-Sv+V-Kv9V-av-V-Gv81-Wv+1-Ov91-ev-1-Bv8N-Rv+N-Jv9N-Zv-N-Fv8t-Vv+t-Nv9t-dv-t-Dv8d-Tv+d-Lv9d-bv-d-Hv89-Xv+9-Pv99-fv-9-Af8D-Qf+D-If9D-Yf-D-Ef8j-Uf+j-Mf9j-cf-j-Cf8T-Sf+T-Kf9T-af-T-Gf8z-Wf+z-Of9z-ef-z-Bf8L-Rf+L-Jf9L-Zf-L-Ff8r-Vf+r-Nf9r-df-r-Df8b-Tf+b-Lf4PE+km0Q8YDMkA39QAwclDkdknDk439b-Q-+H-I-9H-Y--H-E-8n-U-+n-M-9n-c--n-C-8X-S-+X-K-9X-a--X-G-83-W-+3-O-93-e--3-B-8P-R-+P-J-9P-Z--P-F-8v-V-+v-N-9v-d--v-D-8f-T--3-PX+hAvwH+A-X-Jkg3+UQw35FEtMgH-nf4Tfi3QBiCUVF3YoHS70C3YwAE1mImAZ3jF0gcEKyZuKNABYAFwAZABiAGgAbABEAEIASABMAHgAU3QqAHYAcgBmAGH0AQBGAF4AVgBSAGkAfABxAEUAbgBVAFQAegBtAH4ATQBKAHkAQwBLAHUAWwBRAH0ATgB7AHcAYQBZAEcATwBXAFoAUIBAgF8AZQBTAGcAWIBIgH8AXQBMgESAawBogFyASQBjAGKAbIBkgFKARoB6gFqAQoBggHaAXoBugHiAaoBBgHGAUYBvAHyAaYBFgHmASoB1gHMAcIBNgH2AXYB0gEOAc4BTgHKAW4BWgGGAVYBjgFSAe4BvgGeAZYBLgF+AZoBOgGBAR4BoQG2Af4BEQE+ASEBJgGRAbEBZgExAfoBiQGuAVEBcQFJAV4BQQEBAfEByQHeAakBCQF5AcEBuQFZAdEB+QHFAeEB6QFlAZkBFQEpAUUB1QFpAbUB2QEZAWEBDQGFAU0BVQEtAQUBJQGVAXUBnQHlAa0B3QGNAaUBvQE5AfUBXQE1AW0BwwHtASMBzQGjAX0BYwH9AeMBAwETAYMBkwE9AdMBGwFTAVsB6wHbAUMBOwH7AXsBhwFrAUcBqwGnASsB5wHLAZcBSwHXAYsBtwELAfcB8wGPAXMBzwGzAa8BHQEvAe8BbwEzAZ8BPwHfAX8BmwEHAccBQIFnAVcBdwFPAV8BAIEnARcBNwEPAR8B-wG7AcCB0IFggXCBkIGIgaCBsIEQgQiBIIEwgeCBvwGogdiByIGYgYCBBIEYgXiBWIFIgaSB8IHEgRSBuIFUgVCB6IG0gfiBNIEogeSBDIEsgdSBbIFEgfSBOIHsgdyBhIFkgRyBPIFcgWiBQoECgXyBlIFMgZyBYoEigfyBdIEygRKBrIGigXKBJIGMgYqBsoGSgUqBGoHqgWqBCoGCgdqBeoG6geKBqoEGgcaBRoG8gfKBpoEWgeaBKoHWgcyBwoE2gfaBdoHSgQ6BzoFOgcqBboFagYaBVoGOgVKB7oG+gZ6BloEugX6BmoE6gYGBHoGhgbaB-oERgT6BIYEmgZGBsYFmgTGB+oGJga6BUYFxgUmBXoFBgQGB8YHJgd6BqYEJgXmBwYG5gVmB0YH5gcWB4YHpgWWBmYEVgSmBRYHVgWmBtYHZgRmBYYENgYWBTYFVgS2BBYElgZWBdYGdgeWBrYHdgY2BpYG9gTmB9YFdgTWBbYHDge2BI4HNgaOBfYFjgf2B44EDgROBg4GTgT2B04EbgVOBW4HrgduBQ4E7gfuBe4GHgWuBR4GrgaeBK4HngcuBl4FLgdeBi4G3gQuB94HzgY+Bc4HPgbOBr4EdgS+B74FvgTOBn4E-gd+Bf4GbgQeBx4FAQWeBV4F3gU+BX4EAQSeBF4E3gQ+BH4H-gbuBwEHQQWBBcEGQQYhBoEGwQRBBCEEgQTBB4EG-gahB2EHIQZhBgEEEQRhBeEFYQUhBpEHwQcRBFEG4QVRBUEHoQbRB+EE0QShB5EEMQSxB1EFsQURB9EE4QexB3EGEQWRBHEE8QVxBaEFCQQJBfEGUQUxBnEFiQSJB-EF0QTJBEkGsQaJBckEkQYxBikGyQZJBSkEaQepBakEKQYJB2kF6QbpB4kGqQQZBxkFGQbxB8kGmQRZB5kEqQdZBzEHCQTZB9kF2QdJBDkHOQU5BykFuQVpBhkFWQY5BUkHuQb5BnkGWQS5BfkGaQTpBgUEeQaFBtkH+QRFBPkEhQSZBkUGxQWZBMUH6QYlBrkFRQXFBSUFeQUFBAUHxQclB3kGpQQlBeUHBQblBWUHRQflBxUHhQelBZUGZQRVBKUFFQdVBaUG1QdlBGUFhQQ1BhUFNQVVBLUEFQSVBlUF1QZ1B5UGtQd1BjUGlQb1BOUH1QV1BNUFtQcNB7UEjQc1Bo0F9QWNB-UHjQQNBE0GDQZNBPUHTQRtBU0FbQetB20FDQTtB+0F7QYdBa0FHQatBp0ErQedBy0GXQUtB10GLQbdBC0H3QfNBj0FzQc9Bs0GvQR1BL0HvQW9BM0GfQT9B30F-QZtBB0HHQUDBZ0FXQXdBT0FfQQDBJ0EXQTdBD0EfQf9Bu0HAwdDBYMFwwZDBiMGgwbDBEMEIwSDBMMHgwb9BqMHYwcjBmMGAwQTBGMF4wVjBSMGkwfDBxMEUwbjBVMFQwejBtMH4wTTBKMHkwQzBLMHUwWzBRMH0wTjB7MHcwYTBZMEcwTzBXMFowULBAsF8wZTBTMGcwWLBIsH8wXTBMsESwazBosFywSTBjMGKwbLBksFKwRrB6sFqwQrBgsHawXrBusHiwarBBsHGwUbBvMHywabBFsHmwSrB1sHMwcLBNsH2wXbB0sEOwc7BTsHKwW7BWsGGwVbBjsFSwe7BvsGewZbBLsF+wZrBOsGBwR7BocG2wf7BEcE+wSHBJsGRwbHBZsExwfrBicGuwVHBccFJwV7BQcEBwfHBycHewanBCcF5wcHBucFZwdHB+cHFweHB6cFlwZnBFcEpwUXB1cFpwbXB2cEZwWHBDcGFwU3BVcEtwQXBJcGVwXXBncHlwa3B3cGNwaXBvcE5wfXBXcE1wW3Bw8HtwSPBzcGjwX3BY8H9wePBA8ETwYPBk8E9wdPBG8FTwVvB68HbwUPBO8H7wXvBh8FrwUfBq8GnwSvB58HLwZfBS8HXwYvBt8ELwffB88GPwXPBz8Gzwa-BHcEvwe-Bb8EzwZ-BP8HfwX-Bm8EHwcfBQCFnwVfBd8FPwV-BACEnwRfBN8EPwR-B-8G7wcAh0CFgIXAhkCGIIaAhsCEQIQghICEwIeAhv8GoIdghyCGYIYAhBCEYIXghWCFIIaQh8CHEIRQhuCFUIVAh6CG0IfghNCEoIeQhDCEsIdQhbCFEIfQhOCHsIdwhhCFkIRwhPCFcIWghQiECIXwhlCFMIZwhYiEiIfwhdCEyIRIhrCGiIXIhJCGMIYohsiGSIUohGiHqIWohCiGCIdoheiG6IeIhqiEGIcYhRiG8IfIhpiEWIeYhKiHWIcwhwiE2IfYhdiHSIQ4hziFOIcohbiFaIYYhViGOIVIh7iG+IZ4hliEuIX4hmiE6IYEhHiGhIbYh-iERIT4hISEmIZEhsSFmITEh+iGJIa4hUSFxIUkhXiFBIQEh8SHJId4hqSEJIXkhwSG5IVkh0SH5IcUh4SHpIWUhmSEVISkhRSHVIWkhtSHZIRkhYSENIYUhTSFVIS0hBSElIZUhdSGdIeUhrSHdIY0hpSG9ITkh9SFdITUhbSHDIe0hIyHNIaMhfSFjIf0h4yEDIRMhgyGTIT0h0yEbIVMhWyHrIdshQyE7IfsheyGHIWshRyGrIachKyHnIcshlyFLIdchiyG3IQsh9yHzIY8hcyHPIbMhryEdIS8h7yFvITMhnyE-Id8hfyGbIQchxyFAoWchVyF3IU8hXyEAoSchFyE3IQ8hHyH-IbshwKHQoWChcKGQoYihoKGwoRChCKEgoTCh4KG-Iaih2KHIoZihgKEEoRiheKFYoUihpKHwocShFKG4oVShUKHoobSh+KE0oSih5KEMoSyh1KFsoUSh9KE4oeyh3KGEoWShHKE8oVyhaKFCoQKhfKGUoUyhnKFioSKh-KF0oTKhEqGsoaKhcqEkoYyhiqGyoZKhSqEaoeqhaqEKoYKh2qF6obqh4qGqoQahxqFGobyh8qGmoRah5qEqodahzKHCoTah9qF2odKhDqHOoU6hyqFuoVqhhqFWoY6hUqHuob6hnqGWoS6hfqGaoTqhgaEeoaGhtqH+oRGhPqEhoSahkaGxoWahMaH6oYmhrqFRoXGhSaFeoUGhAaHxocmh3qGpoQmheaHBobmhWaHRofmhxaHhoemhZaGZoRWhKaFFodWhaaG1odmhGaFhoQ2hhaFNoVWhLaEFoSWhlaF1oZ2h5aGtod2hjaGlob2hOaH1oV2hNaFtocOh7aEjoc2ho6F9oWOh-aHjoQOhE6GDoZOhPaHToRuhU6Fboeuh26FDoTuh+6F7oYeha6FHoauhp6Eroeehy6GXoUuh16GLobehC6H3ofOhj6Fzoc+hs6GvoR2hL6HvoW+hM6GfoT+h36F-oZuhB6HHoUBhZ6FXoXehT6FfoQBhJ6EXoTehD6Efof+hu6HAYdBhYGFwYZBhiGGgYbBhEGEIYSBhMGHgYb+hqGHYYchhmGGAYQRhGGF4YVhhSGGkYfBhxGEUYbhhVGFQYehhtGH4YTRhKGHkYQxhLGHUYWxhRGH0YThh7GHcYYRhZGEcYTxhXGFoYUJhAmF8YZRhTGGcYWJhImH8YXRhMmESYaxhomFyYSRhjGGKYbJhkmFKYRph6mFqYQphgmHaYXphumHiYaphBmHGYUZhvGHyYaZhFmHmYSph1mHMYcJhNmH2YXZh0mEOYc5hTmHKYW5hWmGGYVZhjmFSYe5hvmGeYZZhLmF+YZphOmGBYR5hoWG2Yf5hEWE+YSFhJmGRYbFhZmExYfphiWGuYVFhcWFJYV5hQWEBYfFhyWHeYalhCWF5YcFhuWFZYdFh+WHFYeFh6WFlYZlhFWEpYUVh1WFpYbVh2WEZYWFhDWGFYU1hVWEtYQVhJWGVYXVhnWHlYa1h3WGNYaVhvWE5YfVhXWE1YW1hw2HtYSNhzWGjYX1hY2H9YeNhA2ETYYNhk2E9YdNhG2FTYVth62HbYUNhO2H7YXthh2FrYUdhq2GnYSth52HLYZdhS2HXYYtht2ELYfdh82GPYXNhz2GzYa9hHWEvYe9hb2EzYZ9hP2HfYX9hm2EHYcdhQOFnYVdhd2FPYV9hAOEnYRdhN2EPYR9h-2G7YcDh0OFg4XDhkOGI4aDhsOEQ4QjhIOEw4eDhv2Go4djhyOGY4YDhBOEY4XjhWOFI4aTh8OHE4RThuOFU4VDh6OG04fjhNOEo4eThDOEs4dThbOFE4fThOOHs4dzhhOFk4RzhPOFc4WjhQuEC4XzhlOFM4ZzhYuEi4fzhdOEy4RLhrOGi4XLhJOGM4YrhsuGS4UrhGuHq4WrhCuGC4drheuG64eLhquEG4cbhRuG84fLhpuEW4ebhKuHW4czhwuE24fbhduHS4Q7hzuFO4crhbuFa4YbhVuGO4VLh7uG+4Z7hluEu4X7hmuE64YHhHuGh4bbh-uER4T7hIeEm4ZHhseFm4THh+uGJ4a7hUeFx4UnhXuFB4QHh8eHJ4d7hqeEJ4XnhweG54Vnh0eH54cXh4eHp4WXhmeEV4SnhReHV4WnhteHZ4RnhYeEN4YXhTeFV4S3hBeEl4ZXhdeGd4eXhreHd4Y3hpeG94Tnh9eFd4TXhbeHD4e3hI+HN4aPhfeFj4f3h4+ED4RPhg+GT4T3h0+Eb4VPhW+Hr4dvhQ+E74fvhe+GH4WvhR+Gr4afhK+Hn4cvhl+FL4dfhi+G34Qvh9+Hz4Y-hc+HP4bPhr+Ed4S-h7+Fv4TPhn+E-4d-hf+Gb4Qfhx+FAEWfhV+F34U-hX+EAESfhF+E34Q-hH+H-4bvhwBHQEWARcBGQEYgRoBGwERARCBEgETAR4BG-4agR2BHIEZgRgBEEERgReBFYEUgRpBHwEcQRFBG4EVQRUBHoEbQR+BE0ESgR5BEMESwR1BFsEUQR9BE4EewR3BGEEWQRHBE8EVwRaBFCEQIRfBGUEUwRnBFiESIR-BF0ETIREhGsEaIRchEkEYwRihGyEZIRShEaEeoRahEKEYIR2hF6EboR4hGqEQYRxhFGEbwR8hGmERYR5hEqEdYRzBHCETYR9hF2EdIRDhHOEU4RyhFuEVoRhhFWEY4RUhHuEb4RnhGWES4RfhGaEToRgREeEaERthH+ERERPhEhESYRkRGxEWYRMRH6EYkRrhFREXERSRFeEUERARHxEckR3hGpEQkReRHBEbkRWRHREfkRxRHhEekRZRGZERURKRFFEdURaRG1EdkRGRFhEQ0RhRFNEVURLREFESURlRF1EZ0R5RGtEd0RjRGlEb0RORH1EV0RNRFtEcMR7REjEc0RoxF9EWMR-RHjEQMRExGDEZMRPRHTERsRUxFbEesR2xFDETsR+xF7EYcRaxFHEasRpxErEecRyxGXEUsR1xGLEbcRCxH3EfMRjxFzEc8RsxGvER0RLxHvEW8RMxGfET8R3xF-EZsRBxHHEUCRZxFXEXcRTxFfEQCRJxEXETcRDxEfEf8RuxHAkdCRYJFwkZCRiJGgkbCREJEIkSCRMJHgkb8RqJHYkciRmJGAkQSRGJF4kViRSJGkkfCRxJEUkbiRVJFQkeiRtJH4kTSRKJHkkQyRLJHUkWyRRJH0kTiR7JHckYSRZJEckTyRXJFokUKRApF8kZSRTJGckWKRIpH8kXSRMpESkayRopFykSSRjJGKkbKRkpFKkRqR6pFqkQqRgpHakXqRupHikaqRBpHGkUaRvJHykaaRFpHmkSqR1pHMkcKRNpH2kXaR0pEOkc6RTpHKkW6RWpGGkVaRjpFSke6RvpGekZaRLpF+kZqROpGBkR6RoZG2kf6REZE+kSGRJpGRkbGRZpExkfqRiZGukVGRcZFJkV6RQZEBkfGRyZHekamRCZF5kcGRuZFZkdGR+ZHFkeGR6ZFlkZmRFZEpkUWR1ZFpkbWR2ZEZkWGRDZGFkU2RVZEtkQWRJZGVkXWRnZHlka2R3ZGNkaWRvZE5kfWRXZE1kW2Rw5HtkSORzZGjkX2RY5H9keORA5ETkYORk5E9kdORG5FTkVuR65HbkUORO5H7kXuRh5FrkUeRq5GnkSuR55HLkZeRS5HXkYuRt5ELkfeR85GPkXORz5Gzka+RHZEvke+RmAH6SHwGHwDbpKXE3IBd-l-+iiA--lhYI35hyB3+EojP-lBR0FEwUbBRcFHwUQhRiFFIUchRKFGoUWhR6FEYUZhRWFHYUThRuFF4UfhRBFGEUURRxFEkUaRRZFHkURRRlFFUUdRRNFG0UXRR9FEMUYxRTFHMUSxRrFFsUexRHFGcUVxR3FE8UbxRfFH8UQJRglFCUcJRIlGiUWJR4lESUZJRUlHSUTJRslFyUfJRClGKUUpRylEqUapRalHqURpRmlFaUdpROlG6UXpR+lEGUYZRRlHGUSZRplFmUeZRFlGWUVZR1lE2UbZRdlH2UQ5RjlFOUc5RLlGuUW5R7lEeUZ5RXlHeUT5RvlF+Uf5RAVGBUUFRwVEhUaFRYVHhURFRkVFRUdFRMVGxUXFR8VEJUYlRSVHJUSlRqVFpUelRGVGZUVlR2VE5UblReVH5UQVRhVFFUcVRJVGlUWVR5VEVUZVRVVHVUTVRtVF1UfVRDVGNUU1RzVEtUa1RbVHtUR1RnVFdUd1RPVG9UX1R-VE-gPpIoeRbABUAaVzzJNP88WKf-oHIwcg2SOBREcgDUQtRi1FLUctRK1GrUWtR61EbUZtRW1HbUTtRu1F7UftRB1GHUUdRx1EnUadRZ1HnURdRl1FXUddRN1G3UXdR91EPUY9RT1HPUS9Rr1FvUe9RH1GfUV9R31E-Ub9Rf1H-UQDRgNFA0cDRINGg0WDR4NEQ0ZDRUNHQ0TDRsNFw0fDRCNGI0UjRyNEo0ajRaNHo0RjRmNFY0djRONG40XjR+NHw0d+RKqj4AC6AKwAjghNEU1EUyKiAs1H9-hBRDMgE0QzRjNFM0czRLNGs0WzR7NEc0ZzRXNHc0TzRvNF80fzRAtGC0ULRwtEi0aLRYtHi0RLRktFS0dLRMtGy0XLR8tEK0YrRStHK0SrRqtFq0erRGtGa0VrR2tE60brRetH60QbRhtFG0cbRJtGm0WbR5tEW0ZbRVtHW0TbRttF20fbRDtGO0U7RztEu0a7RbtHu0R7RntFe0d7Rzoj6SLUADQCKameUloCAUYHIQ36gUX-+Y36AAT7R0dEx0bHRcdHx0QnRidFJ0cnRKdGp0WnR6dEZ0ZnRWdHZ0TnRudF50fnRBdGF0UXRxdEl0aXRZdHl0RXRldFV0dXRNdG10XXR9dEN0Y3RTdHN0S3RrdFt0e3RHdGd0V3R3dE90b3RfdH90QPRg9FD0cPRI9Gj0WPR49ET0ZPRU9HT0TPRs9Fz0fPRC9GL0UvRy9Er0avRa9Hr0RvRm9Fb0dvRO9G70XvR+9EH0YfRR9HH0SfRp9Fn0efRF9GX0VfR19E30bfRd9H30Q-Rj9FP0c-RL9Gv0W-R79Ef0Z-RX9Hf0T-Rv9F-0f-RADGAMUAxwDEgMaAxYDHgMRAxkDFQMdAxMDGwMXAx8DEIMYgxSDHIMSgxqDFoMegxsVF+0UtmAdF6LHgAMhJnwhEApMjd-kHI4YAR0XTIUdEYMZQxVDHUMTQxtDF0MfQxDDGMMUwxzDEsMawxbDHsMRwxnDFcMdwxPDG8MXwx-DECMYIxQjHCMSIxojFiMeIxEjHQUVgx9QCNALoKMZjQAL3YhMgGhIr8lNHf-iog-HQ72KN+5DGQUZIxujF6MfoxBjGGMUYxxjEmMaYxZjHmMRYxljFWMdYxNjG2MXYx9jEOMY4xTjHOMS4xrjFuMe4xHjGeMV4x3jE+Mb4xfjH+MQExgTFBMcExITGhMWEx4TERMZExUTHRMTExsTFxMfExCTGJMUkxyTEpMakxaTHpMRkxmTFZMdkxOTG5MXkx+TEFMYUxRTHFMSUxpTFlMeUxFTGVMVUx1TE1MbUxdTH1MQ0xjTFNMc0xLTGtMW0x7TEdMZ0xXTHdMT0xvTF9Mf0xAzGDMUMxwzEjMaMxYzHjMRMxkzFTMdMxMzGzMXMx8zELMYsxSzHLMSsxqzFrMesxGzGbMVsx2zE7MbsxezH7MQcxhzFHMccxJzGnMWcx5zEXMZcxVzHXMTcxtzF3MfcxDzGPMU8xzzEvMa8xbzHvMR8xnzFfMd8xPzG-MX8x-zEAsYCxQLHAsSCxoLFgseCxELGQsVCx0LEwsbCxcLHwsQixiLFIscixKLGosWix6LEYsZixWLHYsTixuLF4sfixBLGEsUSxxLEksaSxZLHksRSxlLFUsdSxNLG0sXSx9LEMsYyxTLHMsSyxrLFsseyxHLGcsVyx3LE8sbyxfLH8sQKxgrFCscKxIrGisWKx4rESsZKxUrHSsTKxsrFysfKxCrGKsUqx-YBeyItoDoAPANiY8iB8iKGApDFaMQABOjHKsYaxRrHGsSaxprFmseaxFrGWsVax1rE2sbaxdrH2sQ6xjrFOsc6xLrGusW6x7rEesZ6xXrHesc3+qrHQAKf4zoCugGIA2rE9-tTRYfh6sXTRQAE+sdGxMbGxsXGx8bEJsYmxSbHJsSmxqbFpsemxGbGZsVmx2bE5sbmxebH5sQWxhbFFscWxJbGlsWWx5bEVsZWxVbHVsTWxtbF1sfWxDbGNsU2xzbEtsa2xbbHtsR2xnbFdsd2xPbG9sX2x-bEDsbQxfrHqsSU4yiBlyGaAEwAsAKoxwFHqMWogZDH6sfTRg7FLscuxK7GrsWux67EbsZuxW7HbsTuxu7F7sfuxB7GHsUexx7EnsaexZ7HnsRexl7FXsdexN7G3sXex97EPsY+xT7HPsS+xr7Fvse+xH7GfsV+x37E-sb+xf7H-sQBxgHFAccBxIHGgcWBx4HEQcZBxUHHQcTBxsHFwcfBxCHGIcUhxyHEocahxaHHocRhxmHFYcdhxOHG4cXhx+HEEcYRxRHHEcSRxpHFkceRxFHGUcVRx1HE0cbRxdHH0cQxxjHFMccxxLHGscWxx7HEccZxxXHEMcdIxODEtAFBoQ8j05GGK0cxmgDIgIdFU0VTI87GRsdxxMnGycXJx8nEKcYpxSnHKcSpxqnFqcepxGnGacVpx2nE6cbpxenH6cQZxhnFGccZxTLG8cY0A-HHIWJQAyICogAZEzHTTsSQxknERsfNRJnEuca5xbnHucR5xnnFecd5xPnG+cX5x-nEBcYFxQXHBcSFxoXFhceFxEXGRcVFx0XGOUWZxjIAWcUg4vsimgPAAYnEhsQ5x4dFOcYP+MXHZcTlxuXF5cflxBXGFcUVxxXElcaVxZXHlcRVxlXFVcdVxNXG1cXVx9XENcY1xTXHNcS1xrXFtce1xHXGdcV1x3XE9cb1xfXH9cQNxg3FDccNxI3GjcWNx43ETcZNxU3HTcTNxs3FzcfNxC3GLcUtxy3Ercatxa3HrcRtxm3FbcdtxO3G7cXtx+3EHcYdxR3HHcSdxp3FncedxF3GXcVdx13E3cbdxd3H3cQ9xj3FPcc9xL3GvcW9x73EfcZ9xX3HfcT9x0khxcc0ArQCJcVMAyiDBsQHIEnEhyFJxznG-cdDxMPGw8XDx8PEI8YjxSPHI8SjxqPFo8ejxGPGY8Vjx2PE48bjxePH48QTxhPGWQF7ImQDZAHkALAAdAOQA9QCKgIWkKoADAGlxvf6Q8VlxRPEs8azxbPHs8RzxnPFc8dzxPPG88Xzx-PEC8YLxQvHC8SLxovFi8eLxEvGS8d6xJPFZALkA+QCU8SfkxOQPAPZxjPGZcRQxUvEa8ZrxWvHa8TrxuvF68frxBvGG8UbxxvEm8abxZvHm8RbxlvFW8dbxNvG28bjRJPGygLCcLABMxJ0UPQBFGCnA9nFh0XOxavEGsXbxfvH+8QHxgfFB8cHxIfGh8WHx4fER8ZHxUfHR8THxsfFx8fHxCfGJ8UnxyfEp8anxafHp8RnxmfFZ8dnxOfG58Xnx+fEF8YXxRfHF8SXxpfFl8eXxFfGV8VXx1fE18bXxdfH18Q3xjfFN8c3xLfGt8W3x7fEd8Z3xXfHd8T3xvfF98f3xA-GD8UPxw-Ej8aPxY-Hj8RPxk-FT8dPxM-Gz8XPx8-EL8YvxS-HL8Svxq-Fr8evxGfEO8YQezvE9APpsCxhjsXPAnvEgUd7xc1HM8Rvx5-EX8ZfxV-HX8Tfxt-F38ffxD-GP8U-xz-Ev8a-xb-Hv8R-xn-Ff8d-xP-G-8X-x--EACYAJQAnACSAJoAlgCeAJEAmQCVAJ0AkwCbAJcAnwCQgJiAlICcgJKAmoCWgJ6AkYCZgJWAnYCTgJuAl4CfgJBAmECUQJxAkkCaQJZAnkCRQJlAlUCdQJNAm0CXQJ9AkMCYwJTAnMCSwJrAlsCewJHAmcCVwJ3Ak8CbwJrlF+0SpqybiMJD0AmrH16CrxurGn8erxfAnSCTIJsglyCfIJCgmKCUoJygkqCaoJagnqCRoJmglaCdoJOgm6CXoJL9ECCXLUQgl78S6A5ACd2OIJQojhsZIJvvH6CbYJdgn2CQ4JjglOCc4JLgmuCW4J7gkeCZ4JXgneCT4Jvgl+Cf4JAQmBCUEJwQkhCaEJYQnhCREJkQlRCdEJMQmxCXEJ8QkJCYkJSQnJCSkJqQn9MYYJLACCiHvx7vHCAEfxs7FgUbTRUPFpCcUJJQmlCWUJ5QkVCZUJVQnVCTUJtQl1CfUJDQmNCU0JzQktCa0JbQntCR0JnQldCd0JPQm9CX0J-QkDCYMJQwnDCSMJowljCeMJEwmTCVMJ0wkzCbMJcwnzCQsJiwlLCcsJKwmrCWsJ6wkbCZsJWwnbCTsJuwl7CfsJBwmHCUcJxwknCacJZwnnCRcJlwlXCdcJNwm3CXcJ9wkPCY8JTwnPCS8JLUgZCcYJIgnkyIfx4nE6sY5x1gmLsa8JgIlAicCJIImgiWCJ4IkQiZCJUInQiTCJsIlwifCJCImIiUiJyIk1-u8JWQk9AKYJ+ADfCQzxYbFM8VIJKIkEiYSJRInEiSSJpIlkieSJFImUiVSJ1Ik0ibSJdIn0iQyJjIlMicyJLImsiWyJ7IkciZyJXInciTyJvIl8ifyJAomCiUKJwokiiaKJYolbfmiJwgn78TsA2Ilg8Woxv-4+8QCJ4onKiSqJqolqieqJGomaiVqJ2ok6ibqJeon6iQaJholGicaJJommiWaJ5okWiZaJVonWiTaJtol2ifaJDomOiU6Jzokuia6JbonuiR6Jnoleid6JPom+iX6J-okBiYGJQYnBiSGJoYlhieGJEYmRiVGJ0YkxibGJcYnxiQmJiYlJicmJKYmpiWmJ6YkZiZmJWYnZiTmJuYl5ifmJu3HvCS7xJglBsbkJPwmhsZYJeIk2CQWJNYm1iXWJ9YkNiY2JTYnNiS2JrYltie2JHYmdiV2J3Yk9ib2JfYn9iQOJg4lDicOJI4mjiWOJ44kTiZOJU4nTiTOJs4lzifOJC4n30UWJu-EYiUGxsonEMTNRVgmFCWfxi4m7iXuJ+4kHiYeJR4nHiSeJp4lnieeJF4mXiVeJ14k3ibeJd4n3iQ+Jj4lPic+JL4mviW+J74kfiZ+JX4nfiT+Jv4l-if+JAEmASX2Ay4mu8WiA5MhliTiJfwnbifiJQEmwSXBJ8EkISYhJSEnISShJqEloSehJGEmYSVhJ2Ek4SbhJhfEgSXvxognriUBR6XF9-v-+0nF4SZRJVEnUSTRJtEl0SfRJDEmMSUxJzEksSaxJbEnsSRxJnElfsQRJPQBzxL1mFgkQ8YqJUbFcSSJJokliSeJJEkmSSVJJ0kkySbJJcknySQpJiklKScpJKkmRMTxJ0onbAHkJCon-CcJJqkl6SfpJBkmGSUZJxkkmSaZJZknmSRZJlklWSdZJNkm2SXZJ9kkOSY5JTknOSS5JrkluSe5JHkmeSV5J3kk+Sb5Jfkn+SQFJgUlBScFJIUmhSWFJ4UkRSZFJUUnRSTFJsUlxSfFJCUmJSUlJyUkpSalJaUnpSRlJmUlZSdlJOUm5SXlJ+UkFSYVJRUnFSSVJpUnJiO8JPGISaOiJoPEbiRIJ0EnViWVJjUlNSc1JLUmtSW1J7UkdSZ1JXUndST1JvUl9Sf1JA0mJSepJlUk1SSRJqvE6SYNJk0lTSdNJM0mzSXNJ80kLSYtJS0nLSStJq0lrSetJG0nMiTLxZPH5AJt4noDu8QoAWkkZcRNJm0mnSWdJ50kXSZdJV0nXSTdJt0l3SfdJD0mPSU9Jz0kvSa9Jb0nvSR9Jn0lfSd9JP0m-SX9J-0kAyYDJQMnAySDJoMlgyeDJEMmQyVDJ0MkwybDJcMnwyQjJiMlIycjJKMmoyWjJ6MkYyZjJWMnYyTjJuMl4yfjJBMmEyUTJxMkkyaTJZMnkyRTJlMkb0dtJcvEsAHtJnQDu8YYAR0kn8fVJSolUyezJHMmcyVzJ3Mk8ybzJfMn8yQLJgslCycLJIsmiyWLJ4skSyZLJUsnSyTLJsslyyfLJCsmKyUrJyskqyarJasnqyRrJmslaydrJOsm6yXrJ+skGyYbJRsnGySbJpslmyebJFsmWyVbJ1sk2ybbJdsn2yQ7JjslOyc7JLsmuyW7J7skeyZ7JqYk0yeTxB2Qp9L6YY7G6AMzJBQnkSUUJXsnhyRHJkclRydHJMcmxyXHJ8ckJyYnJScnJySnJqclpyenJGcmZyVnJ2ck5ybnJecn5yQXJhclFycXJJcmlyWXJ5ckVyZXJVcnVyTXJtcl1yfXJDcmNyU3Jzcktya3JbcntyR3Jncldyd3JPcm9yX3J-ckDyYPJQ8nDySPJo8ljyePJE8nBUT7Ju0n+ye7xMgDByVWJbMmTycvJK8mryWvJ68kbyZvJW8nbyTvJu8l7yfvJB8mHyUfJx8knyafJZ8nnyRfJl8lXydfJN8m3yXfJ98kPyY-JT8nPyS-Jr8lvye-JH8mfyV-J38k-yb-Jf8n-yQApgClAKcApICmgKWAp4CkQKZApUCnQKTApsClwKfApCCmIKUgpLsnTyXTJs8ljsXMAC8lCScgpOCm4KXgp+CkEKYQpRCnEKSQppClkKeQpFCmUKVQp1Ck0KbQpdCn0KQwpjClMKcwpLCmsKWwp7CkcKZwpXCncKTwpvCl8KfwpAimCKUIpwikiKaIpYiniKRIpkilSKdIpMimyKXIp8ikKKYopSinKKSopqilqKeopGimaKVop3XGoKX7J+0ljsZoAWCknSdopJimmKWYp5ikWKZYpVinWKTYptil2KfYpDimOKU4pzikuKa4pbinuKR4pnileKd4pPim+KX4p-ikBKYEpQSnBKSEpoSlhKeEpESmRKVEp0SkxKbEpcSnxKQkpiSlJKckpKSmpKWkp6SkZKZkpWSnZKTkpuSl5KfkpBSmFKUjRuin0yQHJOwA8AEYprMm6SUUpNSm1KXUp9SkNKY0pTSnNKS0prSltKe0pHSmdKV0p3Sk9Kb0pfSn9KQMpgylDKcMpIymjKWMp4ykTKZMpUynTKTMpsylzKfMpCymLKUspyykrKaspaynrKRspmylbKdspOym7KXsp+ykHKYcpRynHKScppylnKecpFyk8yN+ROwBTseWJpEmLydUplylPKc8pLymvKW8p7ykfKZ8pXynfKT8pvyl-Kf8pz1HXKSfa0qgqqACAkEnWSFuJock7iQCpMKmwqXCp8KkIqYipSKnIqSipqKloqeipGKmYqVip2Kk4qbipeKn4qQSphKlEqcSpJKmkqWSp5KkUqUWxQ1E+yBiAlSlQqTBJlKmMqUypzKksqaypbKnsqRypnKlcqdypPKm8qXyp-KkCqYKpQqnCqSKpoqliqeKpEqmSqVKp0qkyqbKpcqnyqQqpiqlKqcqpKqmqqWqp6qkaqZqpWqnaqTqpuql6qfqpBqmGqUapxqkmqaapZqnmqRaplqlWqdape-76SBSAlAACSWRJkdENSTaprqluqe6pHqmeqV6p3qk+qb6pfqn+qQGpgakwKfpIgQDaFGOxmch0qc6pS8lBqTGpsalxqfGpCamJqUmpyakpqampaanpqRmpmalZqdmpOam5qXmp+akFqYWpRanFqSWppallqeWpFamVqVWp1ak1qbWpdan1qQ2pjalNqc2pLamtqW2p7akdqZ2pXandqT2pval9qf2pA6mDqUOpw6kjqaOpaEAhqexEFyg7APnIkanaMdGpY6kLqYupS6nLqSupq6lrqeupG6mbqVup26k7qbupe6n7qQeph6lHqcepJ6mnqWep56kXqZepV6nXqTept6l3qfepD6mPqU+pz6kvqa+pb6nvqR+pn6lfqd+pP6m-qX+p-6kAaYBpQGnAaSBpoGlgaeBpEGkmiBOpYak7ACNJEal3KV7xIclRqY8pkGmoaWhp6GkYaZhpWGnYaThpuGl4afhpBGmEaURpxGkkaaRpZGnkaRRplGlUadRpNGm0aXRp9GkMaYxpTGnMaSxprGlsaexpHGmcaVxp3Gk8abxpfGn8aQJpgmlCacJpImmiaWJp4mkSaZJpUmnSaTJpVUjQaVOpsajbpjOpCGnH8Uhpc6koabJpmmlaadppOmm6aXpp+mkGaYZpRmnGaSZppmlmaeZpFmmWaVZp1mk2abZpdmn2aQ5pjmlOac5pLmmuaW5p7mkeaZ5pXmneaT5pvml+af5pAWmBaUFpwWkhaaFpYWnhaRFpkWlRadFpMWmxaXFp8WlP-uIgYiASIOZIgBirAP7IAQBQaAaAWAD2OLwADAC01PyAdaj42P6AfAAIgA6As9jFAI4ABWneyNYAkGjVqFukB2TFaWkAzwAMgEyAeFgTAMKASyScgABR9ID8gIKAHWkigDqAYoDIAMCATICkgAXYRIAkgGSAIAB1aXkEzvGTaasA02lVaH9YhAD42LCA26iVaagAaCSwALSADAC9fr0AJwBdKAtppIDqgJsypIAUACgAxICLaclpQAA",
        "resourceBudgets": {
            "materials": {
                "Fire": 10
            },
            "machines": {}
        },
        "initiallyAvailableMaterials": [
            "Fire"
        ],
        "unlimitedMaterials": [
            "Water"
        ],
        "environment": {
            "temperature": 25,
            "humidity": 40,
            "illumination": 50,
            "dewpoint": 10,
            "ambientWindOn": false,
            "windStrength": 0,
            "gustWindStrength": 0
        },
        "lockedControls": [
            "temperature",
            "humidity",
            "illumination",
            "dewpoint",
            "wind"
        ],
        "startSelection": {
            "material": "Fire",
            "drawMode": "brush"
        },
        "unlockedTools": [
            "brush"
        ],
        "visualizationModes": [
            "normal",
            "heat"
        ],
        "objectives": [
            {
                "id": "start-fire",
                "type": "material-placement",
                "material": "Fire",
                "target": 1,
                "label": "Ignite the exposed top of the Wood bridge."
            },
            {
                "id": "water-unlock-delay",
                "type": "active-simulation-steps",
                "target": 60,
                "requires": [
                    "start-fire"
                ],
                "unlocks": {
                    "materials": [
                        "Water"
                    ]
                },
                "label": "Wait 60 active simulation steps for unlimited Water."
            },
            {
                "id": "quench-with-water",
                "type": "transformation",
                "from": "Fire",
                "to": "Smoke",
                "target": 1,
                "requires": [
                    "water-unlock-delay"
                ],
                "cause": "water",
                "label": "Quench a Fire cell into Smoke with Water."
            },
            {
                "id": "confirm-fire-out",
                "type": "world-state",
                "target": 1,
                "requires": [
                    "quench-with-water"
                ],
                "worldState": {
                    "materialCounts": {
                        "Wood": { "min": 1 },
                        "Fire": { "max": 0 }
                    }
                },
                "label": "Finish with Wood remaining and no active Fire."
            }
        ],
        "events": [
            {
                "id": "burn-started",
                "when": {
                    "type": "objective-complete",
                    "objectiveId": "start-fire"
                },
                "message": "The burn has started. Let the fire establish a front through the Wood."
            },
            {
                "id": "water-unlocked",
                "when": {
                    "type": "objective-complete",
                    "objectiveId": "water-unlock-delay"
                },
                "message": "Unlimited Water is ready, and the largest Brush is selected. Pour Water over the burning Wood bridge."
            },
            {
                "id": "burn-contained",
                "when": {
                    "type": "objective-complete",
                    "objectiveId": "quench-with-water"
                },
                "message": "The Water quench is counted. Let the remaining Fire go out while keeping some Wood intact."
            },
            {
                "id": "fire-out-confirmed",
                "when": {
                    "type": "objective-complete",
                    "objectiveId": "confirm-fire-out"
                },
                "message": "The fire is out, and some Wood remains."
            }
        ]
    }
]);
// END GENERATED MISSION DATA

let campaignState = null;

export function getMissionDefinitions() {
    return MISSION_DEFINITIONS.map(mission => structuredClone(mission));
}

export function getCurrentMission() {
    if (!campaignState) return null;
    return MISSION_DEFINITIONS.find(mission => mission.id === campaignState.missionId) || null;
}

export function getNextMission() {
    if (!campaignState) return null;
    const index = MISSION_DEFINITIONS.findIndex(mission => mission.id === campaignState.missionId);
    return index >= 0 ? MISSION_DEFINITIONS[index + 1] || null : null;
}

export function getPendingMission() {
    return MISSION_DEFINITIONS.find(mission => mission.id === campaignState?.pendingMissionId) || null;
}

export function queueNextMission() {
    if (!campaignState?.missionCompleted || !campaignState.recapDismissed || campaignState.campaignComplete) return null;
    const mission = getNextMission();
    if (!mission) return null;
    campaignState.pendingMissionId = mission.id;
    announceCampaignChange();
    return mission;
}

export function beginPendingMission() {
    const pending = getPendingMission();
    return pending ? startCampaign(pending.id) : null;
}

export function getCampaignState() { return campaignState; }
export function isCampaignActive() { return !!campaignState; }

export function isCampaignObjectiveUnlocked(objectiveOrId) {
    if (!campaignState) return true;
    const mission = getCurrentMission();
    const objective = typeof objectiveOrId === 'string'
        ? mission?.objectives.find(item => item.id === objectiveOrId)
        : objectiveOrId;
    if (!objective) return false;
    return (objective.requires || []).every(id => {
        const prerequisite = mission.objectives.find(item => item.id === id);
        return !!prerequisite && (campaignState.objectiveProgress[id] || 0) >= prerequisite.target;
    });
}

export function isCampaignMaterialAvailable(name) {
    if (!campaignState) return true;
    const resource = campaignState.resources.materials[name];
    if (!resource || (resource.unlimited ? !resource.unlocked : resource.remaining <= 0)) return false;
    const mission = getCurrentMission();
    const hasExplicitLoadout = Array.isArray(mission.initiallyAvailableMaterials);
    const explicitlyAvailable = !hasExplicitLoadout || mission.initiallyAvailableMaterials.includes(name) ||
        mission.objectives.some(objective =>
            (campaignState.objectiveProgress[objective.id] || 0) >= objective.target &&
            (objective.unlocks?.materials || []).includes(name));
    const placementObjectives = mission.objectives.filter(objective =>
        objective.type === 'material-placement' && objective.material === name);
    return explicitlyAvailable || placementObjectives.some(objective => isCampaignObjectiveUnlocked(objective));
}

export function isCampaignClimateControlAllowed(control) {
    if (!campaignState) return true;
    const mission = getCurrentMission();
    if (!(mission.lockedControls || []).includes(control)) return true;
    return mission.objectives.some(objective =>
        (campaignState.objectiveProgress[objective.id] || 0) >= objective.target &&
        (objective.unlocks?.controls || []).includes(control));
}

export function getCampaignControlLimits(control) {
    if (!campaignState) return null;
    const mission = getCurrentMission();
    let limits = { ...(mission.controlLimits?.[control] || {}) };
    for (const objective of mission.objectives) {
        if ((campaignState.objectiveProgress[objective.id] || 0) < objective.target) continue;
        const unlocked = objective.unlocks?.controlLimits?.[control];
        if (unlocked) limits = { ...limits, ...unlocked };
    }
    return Object.keys(limits).length ? limits : null;
}

export function startCampaign(missionId = MISSION_DEFINITIONS[0]?.id) {
    const mission = MISSION_DEFINITIONS.find(item => item.id === missionId);
    if (!mission) throw new Error(`Unknown campaign mission: ${missionId}`);
    campaignState = createCampaignState(mission);
    announceCampaignChange();
    return campaignState;
}

export function clearCampaign() {
    campaignState = null;
    announceCampaignChange();
}

function normalizeLegacyMissionThreeResources(state) {
    if (state?.missionId !== 'three-states') return state;
    const materials = state.resources?.materials;
    if (!materials || Object.hasOwn(materials, 'Cloud') || materials.Steam?.limit !== 8000) return state;
    const { Steam: cloudResource, ...remainingMaterials } = materials;
    return {
        ...state,
        resources: {
            ...state.resources,
            materials: { ...remainingMaterials, Cloud: cloudResource }
        }
    };
}

function normalizeLegacyMissionSixState(state) {
    if (state?.missionId !== 'controlled-burn') return state;
    const materials = state.resources?.materials;
    const oldWater = materials?.Water;
    const oldFire = materials?.Fire;
    const progress = state.objectiveProgress;
    const isLegacy = progress && Object.hasOwn(progress, 'ignite-wood-front') &&
        oldWater?.unlimited !== true;
    if (!isLegacy) return state;

    const fireUsed = Number.isInteger(oldFire?.used) ? Math.max(0, Math.min(10, oldFire.used)) : 0;
    const waterUnlocked = Number.isInteger(progress['ignite-wood-front']) &&
        progress['ignite-wood-front'] >= 1000;
    const firedEventIds = Array.isArray(state.firedEventIds)
        ? state.firedEventIds.filter(id => id !== 'objective:ignite-wood-front:complete') : [];
    if (waterUnlocked && !firedEventIds.includes('objective:water-unlock-delay:complete')) {
        firedEventIds.push('objective:water-unlock-delay:complete');
    }
    return {
        ...state,
        resources: {
            ...state.resources,
            materials: {
                Fire: { limit: 10, used: fireUsed, remaining: 10 - fireUsed },
                Water: {
                    unlimited: true,
                    unlocked: waterUnlocked,
                    limit: null,
                    used: Number.isInteger(oldWater?.used) ? Math.max(0, oldWater.used) : 0,
                    remaining: null
                }
            }
        },
        objectiveProgress: {
            'start-fire': Number.isInteger(progress['start-fire'])
                ? Math.max(0, Math.min(1, progress['start-fire'])) : 0,
            'water-unlock-delay': waterUnlocked ? 60 : 0,
            'quench-with-water': 0,
            'confirm-fire-out': 0
        },
        firedEventIds,
        missionCompleted: false,
        recapDismissed: false,
        campaignComplete: false,
        pendingMissionId: null
    };
}

function normalizeLegacyCampaignState(state) {
    return normalizeLegacyMissionSixState(normalizeLegacyMissionThreeResources(state));
}

export function restoreCampaignState(state) {
    state = normalizeLegacyCampaignState(state);
    if (!validateCampaignState(state)) {
        campaignState = null;
        announceCampaignChange();
        return null;
    }
    const mission = MISSION_DEFINITIONS.find(item => item.id === state.missionId);
    const initial = createCampaignState(mission);
    const objectiveProgress = {};
    for (const objective of mission.objectives) {
        const saved = state.objectiveProgress?.[objective.id];
        objectiveProgress[objective.id] = Number.isFinite(saved)
            ? Math.max(0, Math.min(objective.target, Math.floor(saved))) : 0;
    }
    const resources = { materials: {}, machines: {} };
    for (const category of ['materials', 'machines']) {
        for (const [name, limit] of Object.entries(mission.resourceBudgets[category] || {})) {
            const saved = state.resources?.[category]?.[name];
            const used = Number.isInteger(saved?.used) ? Math.max(0, Math.min(limit, saved.used)) : 0;
            resources[category][name] = { limit, used, remaining: limit - used };
        }
    }
    for (const name of mission.unlimitedMaterials || []) {
        const saved = state.resources.materials[name];
        resources.materials[name] = {
            unlimited: true,
            unlocked: saved.unlocked,
            limit: null,
            used: saved.used,
            remaining: null
        };
    }
    campaignState = {
        ...initial,
        resources,
        objectiveProgress,
        firedEventIds: Array.isArray(state.firedEventIds)
            ? [...new Set(state.firedEventIds.filter(id => typeof id === 'string'))] : [],
        missionCompleted: state.missionCompleted === true || mission.objectives.every(objective =>
            (objectiveProgress[objective.id] || 0) >= objective.target),
        recapDismissed: state.recapDismissed === true,
        campaignComplete: state.campaignComplete === true || (state.missionCompleted === true &&
            !MISSION_DEFINITIONS[MISSION_DEFINITIONS.findIndex(item => item.id === mission.id) + 1]),
        pendingMissionId: MISSION_DEFINITIONS.some(item => item.id === state.pendingMissionId)
            ? state.pendingMissionId : null
    };
    if (campaignState.missionCompleted && !getNextMission()) campaignState.campaignComplete = true;
    announceCampaignChange();
    return campaignState;
}

export function validateCampaignState(state) {
    state = normalizeLegacyCampaignState(state);
    if (!state || state.mode !== 'campaign' || typeof state.campaignId !== 'string') return false;
    const mission = MISSION_DEFINITIONS.find(item => item.id === state.missionId);
    if (!mission || !state.resources || !state.objectiveProgress || !Array.isArray(state.firedEventIds) ||
        (state.missionCompleted !== undefined && typeof state.missionCompleted !== 'boolean') ||
        (state.recapDismissed !== undefined && typeof state.recapDismissed !== 'boolean') ||
        (state.campaignComplete !== undefined && typeof state.campaignComplete !== 'boolean') ||
        (state.pendingMissionId !== undefined && state.pendingMissionId !== null &&
            !MISSION_DEFINITIONS.some(item => item.id === state.pendingMissionId)) ||
        state.firedEventIds.some(id => typeof id !== 'string')) return false;
    // Prior releases used this mission ID with a smaller Water/Sprinkler loadout
    // and a floodplain objective. Accept those saves, then normalize them to the
    // current flower mission in restoreCampaignState below.
    if (mission.id === 'first-thaw' && state.resources.materials?.Water?.limit === 100 &&
        state.resources.machines?.sprinkler?.limit === 1 && state.objectiveProgress['restore-floodplain'] !== undefined) {
        const water = state.resources.materials.Water;
        return Number.isInteger(water.used) && water.used >= 0 && water.used <= 100 &&
            water.remaining === 100 - water.used;
    }
    for (const category of ['materials', 'machines']) {
        const savedResources = state.resources[category];
        if (!savedResources || typeof savedResources !== 'object') return false;
        const limits = mission.resourceBudgets[category] || {};
        const unlimitedNames = category === 'materials' ? mission.unlimitedMaterials || [] : [];
        for (const [name, limit] of Object.entries(limits)) {
            const resource = savedResources[name];
            if (!resource || resource.limit !== limit || !Number.isInteger(resource.used) ||
                resource.unlimited === true || resource.used < 0 || resource.used > limit ||
                resource.remaining !== limit - resource.used) return false;
        }
        for (const name of unlimitedNames) {
            const resource = savedResources[name];
            const unlockingObjective = mission.objectives.find(objective =>
                (objective.unlocks?.materials || []).includes(name));
            const shouldBeUnlocked = !!unlockingObjective &&
                state.objectiveProgress[unlockingObjective.id] >= unlockingObjective.target;
            if (!resource || resource.unlimited !== true || resource.limit !== null ||
                !Number.isInteger(resource.used) || resource.used < 0 || resource.remaining !== null ||
                typeof resource.unlocked !== 'boolean' || resource.unlocked !== shouldBeUnlocked) return false;
        }
        const allowedNames = new Set([...Object.keys(limits), ...unlimitedNames]);
        if (Object.keys(savedResources).some(name => !allowedNames.has(name))) return false;
    }
    for (const objective of mission.objectives) {
        const progress = state.objectiveProgress[objective.id];
        if (!Number.isInteger(progress) || progress < 0 || progress > objective.target) return false;
        if (progress > 0 && (objective.requires || []).some(id => {
            const prerequisite = mission.objectives.find(item => item.id === id);
            return !prerequisite || (state.objectiveProgress[id] || 0) < prerequisite.target;
        })) return false;
    }
    if (Object.keys(state.objectiveProgress).some(id => !mission.objectives.some(objective => objective.id === id))) return false;
    return true;
}

export function canUseMaterial(name, amount = 1) {
    if (!campaignState) return true;
    const resource = campaignState.resources.materials[name];
    if (!isCampaignMaterialAvailable(name) || !Number.isInteger(amount) || amount < 0) return false;
    return resource.unlimited === true || resource.remaining >= amount;
}

export function consumeCampaignMaterial(name, amount = 1) {
    if (!campaignState) return true;
    if (!canUseMaterial(name, amount)) return false;
    const resource = campaignState.resources.materials[name];
    resource.used += amount;
    if (resource.unlimited !== true) resource.remaining = Math.max(0, resource.limit - resource.used);
    recordMaterialPlacement(name, amount);
    return true;
}

export function recordMaterialPlacement(name, amount = 1) {
    if (!campaignState || !Number.isInteger(amount) || amount <= 0) return campaignState;
    const mission = getCurrentMission();
    for (const objective of mission.objectives) {
        if (objective.type !== 'material-placement' || objective.material !== name ||
            !isCampaignObjectiveUnlocked(objective)) continue;
        incrementObjective(objective, amount, false);
    }
    updateWorldStateObjectives();
    updateMissionCompletion();
    announceCampaignChange();
    return campaignState;
}

export function canPlaceMissionMachine(name) {
    if (!campaignState) return true;
    return (campaignState.resources.machines[name]?.remaining || 0) > 0;
}

export function consumeCampaignMachine(name) {
    if (!campaignState) return true;
    if (!canPlaceMissionMachine(name)) return false;
    const resource = campaignState.resources.machines[name];
    resource.used++;
    resource.remaining = Math.max(0, resource.limit - resource.used);
    announceCampaignChange();
    return true;
}

export function recordMaterialTransition(fromId, toId, context = {}) {
    if (!campaignState) return null;
    const definitions = getDefinitions();
    const from = definitions[fromId]?.name;
    const to = definitions[toId]?.name;
    if (!from || !to) return campaignState;
    const seedDefinition = definitions[fromId];
    const plantDefinition = definitions[toId];

    const mission = getCurrentMission();
    for (const objective of mission.objectives) {
        if (objective.type !== 'transformation' || objective.from !== from || objective.to !== to) continue;
        if (objective.cause && context?.cause !== objective.cause) continue;
        if (context.plantGrowthPending && seedDefinition?.isSeed &&
            plantDefinition?.isPlant && plantDefinition.growHeight > 0) continue;
        incrementObjective(objective);
    }
    updateMissionCompletion();
    return campaignState;
}

export function recordCampaignSimulationStep() {
    if (!campaignState) return campaignState;
    const mission = getCurrentMission();
    for (const objective of mission.objectives) {
        if (objective.type !== 'active-simulation-steps' || !isCampaignObjectiveUnlocked(objective)) continue;
        incrementObjective(objective, 1, false);
    }
    updateWorldStateObjectives();
    updateMissionCompletion();
    return campaignState;
}

export function recordPlantGrowthCompletion(seedId, plantId) {
    if (!campaignState) return null;
    const definitions = getDefinitions();
    const seed = definitions[seedId];
    const plant = definitions[plantId];
    if (!seed?.isSeed || !plant?.isPlant || plant.growHeight <= 0) return campaignState;

    const mission = getCurrentMission();
    for (const objective of mission.objectives) {
        if (objective.type !== 'transformation' || objective.from !== seed.name || objective.to !== plant.name) continue;
        incrementObjective(objective);
    }
    updateMissionCompletion();
    return campaignState;
}

export function recordEnvironmentChange({ temperature, humidity, illumination, dewpoint, windStrength, gustWindStrength } = {}) {
    if (!campaignState) return null;
    const mission = getCurrentMission();
    for (const objective of mission.objectives) {
        if (objective.type !== 'environment-target' || !isCampaignObjectiveUnlocked(objective)) continue;
        const targets = objective.targetValues || mission.environmentTargets;
        if (!targets || Object.keys(targets).length === 0) continue;
        const values = { temperature, humidity, illumination, dewpoint, windStrength, gustWindStrength };
        if (Object.entries(targets).every(([key, target]) => Number.isFinite(values[key]) && values[key] === target)) {
            incrementObjective(objective);
        }
    }
    updateMissionCompletion();
    return campaignState;
}

export function dismissMissionRecap() {
    if (!campaignState?.missionCompleted || campaignState.recapDismissed) return campaignState;
    campaignState.recapDismissed = true;
    announceCampaignChange();
    return campaignState;
}

function incrementObjective(objective, amount = 1, announce = true) {
    if (campaignState.missionCompleted || !isCampaignObjectiveUnlocked(objective)) return;
    const current = campaignState.objectiveProgress[objective.id] || 0;
    if (current >= objective.target) return;
    const next = Math.min(objective.target, current + amount);
    campaignState.objectiveProgress[objective.id] = next;
    if (next === objective.target) {
        for (const name of objective.unlocks?.materials || []) {
            const resource = campaignState.resources.materials[name];
            if (resource?.unlimited) resource.unlocked = true;
        }
        const eventId = `objective:${objective.id}:complete`;
        if (!campaignState.firedEventIds.includes(eventId)) {
            campaignState.firedEventIds.push(eventId);
            announceObjectiveComplete(objective);
            triggerCampaignEvent('objective-complete', { objectiveId: objective.id });
        }
    }
    if (announce) announceCampaignChange();
}

function updateWorldStateObjectives() {
    if (!campaignState) return;
    const mission = getCurrentMission();
    const pendingObjectives = mission.objectives.filter(objective =>
        objective.type === 'world-state' && isCampaignObjectiveUnlocked(objective) &&
        (campaignState.objectiveProgress[objective.id] || 0) < objective.target);
    if (!pendingObjectives.length) return;
    const definitions = getDefinitions();
    const type = getWorld()?.type;
    if (!type) return;
    const counts = new Map();
    for (const id of type) {
        const name = definitions[id]?.name;
        if (name) counts.set(name, (counts.get(name) || 0) + 1);
    }
    for (const objective of pendingObjectives) {
        const requirements = objective.worldState?.materialCounts || {};
        const satisfied = Object.entries(requirements).every(([name, limits]) => {
            const count = counts.get(name) || 0;
            return (limits.min === undefined || count >= limits.min) &&
                (limits.max === undefined || count <= limits.max);
        });
        if (satisfied) incrementObjective(objective, 1, false);
    }
}

function updateMissionCompletion() {
    if (!campaignState || campaignState.missionCompleted) return;
    const mission = getCurrentMission();
    if (!mission.objectives.every(objective => (campaignState.objectiveProgress[objective.id] || 0) >= objective.target)) return;
    campaignState.missionCompleted = true;
    campaignState.campaignComplete = !getNextMission();
    campaignState.recapDismissed = false;
    campaignState.firedEventIds.push('mission:complete');
    announceCampaignChange();
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('campaign-mission-complete', {
        detail: { missionId: mission.id, campaignComplete: campaignState.campaignComplete }
    }));
}

export function triggerCampaignEvent(type, context = {}) {
    if (!campaignState) return [];
    const mission = getCurrentMission();
    const fired = [];
    for (const event of mission.events || []) {
        if (event.when?.type !== type) continue;
        if (event.when.objectiveId && event.when.objectiveId !== context.objectiveId) continue;
        if (campaignState.firedEventIds.includes(event.id)) continue;
        campaignState.firedEventIds.push(event.id);
        fired.push(event.id);
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('campaign-event', {
                detail: { id: event.id, type, ...context, message: event.message }
            }));
        }
    }
    return fired;
}

function createCampaignState(mission) {
    const makeResources = entries => Object.fromEntries(Object.entries(entries || {}).map(([name, limit]) =>
        [name, { limit, used: 0, remaining: limit }]));
    const resources = {
        materials: makeResources(mission.resourceBudgets.materials),
        machines: makeResources(mission.resourceBudgets.machines)
    };
    for (const name of mission.unlimitedMaterials || []) {
        resources.materials[name] = {
            unlimited: true,
            unlocked: false,
            limit: null,
            used: 0,
            remaining: null
        };
    }
    return {
        mode: 'campaign',
        campaignId: 'elemental-foundry-story',
        missionId: mission.id,
        resources,
        objectiveProgress: Object.fromEntries(mission.objectives.map(objective => [objective.id, 0])),
        firedEventIds: []
    };
}

function announceCampaignChange() {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('campaign-state-change'));
}

function announceObjectiveComplete(objective) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('campaign-objective-complete', {
        detail: { objectiveId: objective.id, label: objective.label }
    }));
}

// The physics layer reports committed state transformations here. This stays
// separate from setCell so player placement and world seeding do not count as
// story progress.
setMaterialTransitionListener(recordMaterialTransition);
setPlantGrowthCompletionListener(recordPlantGrowthCompletion);
setSimulationStepListener(recordCampaignSimulationStep);
