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
        "startingSave": "N4IgZg9gTgtghgFxALhAUwDZpmgdguDAWkgFdcATKATxABoQA3NKAZwEsJcUBmB1uMwoBBJKgBMABnEA2IpICcRHpIAqARgXJJPbZIB0ADnHqAWvRAwIFNChADKAIwgAPCwGM4MAA5x2Ac25kXFIMDH52GFDETiDQZjZYlHV+byh2XABrLCgAWWs0ADUWDi4UcQZ4dwALDLQABWgEABk4aghSBGLEsuQK8DhcAHUMigBlTywUAFZJBncIDFZymTmQKAgAd2XkdVmGL0d2PDFxaYOYI5PVOCh-NFPzkEPj-AAJUhh2CnYEWmQACxrF4nACSYU+GRivX2IBsm28EAyCBudweyWBl1eCBGlAA8kEwIRWGgGJtRgARdiEFBre64FiEXHjBBQPD+BDVWkMfykVg40ZjVnsznckBpNCMPwYDL+ZlUtnuBBJXYMCVS9gy3By0aqdjuTKsABK2D8uFlGMMkmtDDAUC8aAAwh18GLbvbqDtQH9vLZkN7qL67ABVZGGYRQD0WCiIOB2YQJxNJ5Mp1Np9MZzNZ7M53N5-MFwtF4sl0tl8sVytV6s12t1+sNxtN5st1tt9sdztd7s93t9-sDwdD4cj0dj8cTydT6cz2dz+cLxdL5cr1dr9cbzdb7c73d7-cHw9H48n09n88Xy9X683293+8Px9P58v19v98fz9f78-39--8AYBQHASBoFgeBEGQVB0EwbBcHwQhiFIchKGoWh6EYZhWHYThuF4fhBGEURxEkaRZHkRRlFUdRNG0XR9EMYxTHMSxrFsexHGcVx3E8bxfH8QJglCcJImiWJ4kSZJUnSTJslyfJCmKUpykqapanqRpmladpOm6Xp+kGYZRnGSZplmeZFmWVZ1k2bZdn2Q5jlOc5LmuW57keZ5b6sM0jrbL5-l+T5QUBcFgXhWFkWhdFIWxRFMXxXFUVJQlyWJelaWZc0akpblGWpQVeVZUVhX5SV5VlZVrBqaVxVVbVDUVXVzWNfVTUBWpLXtd1bW9V1fWtf1Pk5QNPVDYNE1jZNo3bDVU1vlNfmddN1Wvit2WqYtmzeStc0DQtM3LWNb7rSN41La+52zapp2vltR19Sd82bYdl27Tdz0vvdqlXatL63Sp30vr9e3jQdV0PUNT37S9ENvcdH0w19r0qSDa2fcpQPPmjKkA8+WNKTjz540pBOPkTSkk4+ZMKRTj5UwpNP3nTCkM-eTNySz95s3JHO3lzck87efMyQLt5CzJIvXmLMkS9eUtSTL15y1JCuXkrUkq5easSRrl5axJOvnnrEkG+eRtiSb55m2JFunlbYk26edsiQ7p5OyJLvHm7Ike8eXtCT7x5+0JAeHkHQkh4eYcCRHh5RwJMf7nHAkJ-uSd8Sn+5p3xGe7lnfE57uec8QXu5FzxJfbmXPEV9uVdcTX2511xDebk3XEt5ubccR3m5dxxPfrn3K4AELCAAigAouP0+zzPk8L3Pi-z6vK-r8vm9L9va9b7vO8bwfe+H-vp8n+fx+X0f19n1ft83xfD934-9+vy-7-P5-T-f2-X+-z-H8AF-0Af-UBIDwHAMgUA6BYCoGwJgRAhBcDEHwNQSg9ByDMFIOwWgrBuCcEYIIXgwh+DSEkPIcQyhRDqFkKobQmhFCGF0MYfQ1hLD2HMM4UwnBIAAC+DAEDYG8CgAMQZUAADEMAQEQDwcQEYowMBjAQeMwgKSggnhPBM1Ap5TwTLkao49VHqM0cIbRujhD6MMWojRWidF6IMQmaxJizH2KscY2x5jLGOPcaYuxFiHFGJsb4zxASnEeNcd4oJLj-FuKiX4rxgTnHxNCT46JCSwnBIiYk8JMTIlJJCbE-JWSMlpJSXEgpeScnpNSckwpVSylFNydkzJTSSm1MqS06p5Tik1Iqc00pdTOkNPqYMgZHSxn9PaZMvpbSZm9J6d01p8ylmLK6Y0tZIzxlTNmQs9ZwyhmjO2csjZBytlzNWfsiZOyVl7MOec25ZzdmbOmU805LybnPOuScq5xzLlHIuXc15PyAWPI+W8r5fz7mfN+YCsFwKHnvO+f8hFELYVIqheCmFoL0VAuRdCkFiLIW4oxfC-FKKsWErRUSuFeLMUEtRdi6lOKaUktpaSul5L6UUoZZSxlVL+V8sFby4VPLRXcvFVyyVnLpVktlRyuV7LFVsuVay1VxL1Uso1cy7VTLdUCpFRKmV8rjVKrVZq81Or9ViqlQqlVWq9VCutUa019qrWGttWay1jr3UmrtRah1BqbW+s9QGp1HrXXeqDS6-1bqo1+q9YG518bQ0+ujQmsNwaI2JvDTGyNSaQ2xvzVmjNaaU1xoLXmnN6bU3JsLVWstRbc3ZszU2kttbK0tureW4tNaK3NtLXWztDb62DoHR2sd-b22Tr7W2mdvae3dtbfOpdi6u2NrXSO8dU7Z0LvXcOodo7t3Lo3Qerdc7V37onTulde7D3ntvWe3dm7p1PtPS+m9z7r0nqvcey9R6L13tfT+gDj6P1vq-X++9n7f2AbA8Bh977v3-oQxB2DSGoPgZg6B9DQHkPQZA4hyDuGMPwfwyhrDhG0NEbg3hzDBHUPYeozhmjJHaOkbo+R+jFGGOUcY1R-jfHBO8eEzx0T3HxNcck5x6TZHZMcbk+xxTbHlOsdU8R9TLGNPMe00x3TAmRMSZk-J4zSm1OafMzp-TYmpMKZU1pvTQnrNGdM-ZqzhnbNmcs459zJm7MWYcwZmzvnPMBacx51z3mgsuf825qLfmvOBec-F0LPnosJbC8FiLiXwsxci0lkLsX8tZYy2llLcWCt5Zy+l1LyXCtVbK0V3L2XMtNZK7VyrLXqvleKzVirzXSt1c6w1+rg2BsdbG-19rk2+ttZm71nr3XWvzaW4trrjW1sjfG1N2bC31vDaG6N7by2NsHa23N1b+2Js7ZW3tw753btnd25t6bT3TsvZu8967J2rvHcu0di7d3Xs-YB49j7b2vt-fu5937gOwfA4e+977-2EcQ9h0jqH4OYeg-R0D5H0OQeI8h7jjH8P8co6x4TtHRO4d48xwT1H2Pqc45pyT2npO6fk-pxThnlPGdU-53zwXvPhc89F9z8XXPJec+l2T2XHO5fs8V2z5XrPVfE-VyzjXzPtdM91wLkXEuZfy+N0rtXmvzc6-12LqXCuVda710L63RvTf26t4b23ZvLeO-dybu3FuHcG5t77z3Aence9d97oPLv-du6j37r3gfnfx9Dz76PCew-B4j4n8PMfI9J5D7H-PWeM9p5T3Hgveec-p9T8nwvVey9F9z9nzPTeS+18ry36v5fi814r830vdfO8N-r4PgfHex-9-b5PvvbeZ+957931v8+l+L6743tfI-x9T9nwv9fw+h+j+38vjfB+t9z9X-vifO+V978P+f2-Z-d+b+n0-0-L+b-P+vyfq-x-L9H4v3fq-j-gAY-h-m-l-n-vfp-r-oAWAcAQ-u-t-v-ggRAbAUgVAeATAaAegUAcgdASAYgZAbgRgfAfgSgVgYQWgUQXAXgZgQQagdgdQTgTQSQbQaQXQeQfQRQQwZQYwVQfwXwYIbwcITwaIdweIVwZIZwdIWQbIRwXIewYoWwcoawaocQeoSwRocwdoUwboQISIRITIfIcYUoWoZoeYTofoWIVIQoSoVoXoUIdYUYaYfYVYYYbYWYZYY4e4SYXYRYQ4QYTYb4Z4QEU4R4a4d4UES4f4W4VEX4V4YEc4fEaET4dEQkWEcEREYkeETEZEUkSEbEfkVkRkWkSkXEQUXkTkekakckYUVUWUUUbkdkZkU0SUbUZUS0dUeUcUTURUc0aUXUZ0Q0fUYMQMR0WMf0e0ZMX0W0TMb0T0d0a0fMUsYsV0Y0WsSMeMVMbMQsescMUMaMdscsRsQcVsXMasfsRMTsSsXsYcecbcWcbsZsdMU8acS8Tcc8dcScVcccZcUcRcXca8T8QCY8R8W8V8X8fcZ8b8YCWCcCQ8e8d8f8QiRCbCUiVCeCTCaCeiUCcidCSCYiZCbiRifCfiSiViYSWiUSXCXiZiQSaididSTiTSSSbSaSXSeSfSRSQyZSYyVSfyXyYKbycKTyaKdyeKVyZKZydKWSbKRyXKeyYqWycqayaqcSeqSyRqcydqUybqQKSKRKTKfKcaUqWqZqeaTqfqWKVKQqSqVqXqUKdaUaaafaVaYabaWaZaY6e6SaXaRaQ6QaTab6Z6QGU6R6a6d6UGS6f6W6VGX6V6YGc6fGaGT6dGQmWGcGRGYmeGTGZGUmSGbGfmVmRmWmSmXGQWXmTmemamcmYWVWWWUWbmdmZmU2SWbWZWS2dWeWcWTWRWc2aWXWZ2Q2fWYOQOR2WOf2e2ZOX2W2TOb2T2d2a2fOUuYuV2Y2WuSOeOVObOQueucOUOaOducuRuQeVuXOaufuROTuSuXuYeeebeWebuZudOU+aeS+Tec+deSeVeceZeUeReXea+T+QBY+R+W+V+X+feZ+b+YBWBcBQ+e+d+f+QhRBbBUhVBeBTBaBehUBchdBSBYhZBbhRhfBfhShVhYRWhURXBXhZhQRahdhdRThTRSRbRaRXReRfRRRQxZRYxVRfxXxYJbxcJTxaJdxeJVxZJZxdJWRbJRxXJexYpWxcpaxapcRepSxRpcxdpUxbpQJSJRJTJfJcZUpWpZpeZTpfpWJVJQpSpVpXpUJdZUZaZfZVZYZbZWZZZY5e5SZXZRZQ5QZTZb5Z5QFU5R5a5d5UFS5f5W5VFX5V5YFc5fFaFT5dFQlWFcFRFYleFTFZFUlSFbFflVlRlWlSlXFQVXlTlelalclYVVVWVUVbldlZlU1SVbVZVS1dVeVcVTVRVc1aVXVZ1Q1fVYNQNR1WNf1e1ZNX1W1TNb1T1d1a1fNUtYtV1Y1WtSNeNVNbNQtetcNUNaNdtctRtQdVtXNatftRNTtStXtYdedbdWdbtZtdNU9adS9Tdc9ddSdVdcdZdUdRdXda9T9QDY9R9W9V9X9fdZ9b9YDWDcDQ9e9d9f9QjRDbDUjVDeDTDaDejUDcjdDSDYjZDbjRjfDfjSjVjYTWjUTXDXjZjQTajdjdTTjTTSTbTaTXTeTfTRTQzZTYzVTfzXzYLbzcLTzaLdzeLVzZLZzdLWTbLRzXLezYrWzcrazarcTerSzRrczdrUzbrQLSLRLTLfLcbUrWrZrebTrfrWLVLQrSrVrXrULdbUbabfbVbYbbbWbZbY7e7SbXbRbQ7QbTbb7Z7QHU7R7a7d7UHS7f7W7VHX7V7YHc7fHaHT7dHQnWHcHRHYneHTHZHUnSHbHfnVnRnWnSnXHRgcIH4sIKPIYgmEEpXeYtXbXZPCYg3YmDXUmPXVXR3YmF3Y3T3XXa3d3c3X3e3SPUPf3ePYmMPZ3RPWPbPdPZPQvQmDPb3XPQmAPS3YvfPWvdvRvVPSvUvbvYfTvYPXvU3cvW3fvZfavWfSfdfcfVfRfY-bfVvffc-XfU-ZvaPQ-Z-a-T-R-W-V-QfcAzfUfX-eA0A--evYAwA9-TA-A+fT3SXcnYXTnenanVORA6fVA5A3AyA9A0gwfaXWg5nWAaAy-XgwgwQ1Q0Q2A8XZgwXXneg2XY2bA9Q-Q7-bgzg-g5w8-Sg0w9nW-tg1w7w5Qzwxw+I6I0XbnUIyQ8w2QyeRQyI+w3Q1I6o+-Yg-fRg+XQw4vho8o9w9I2oyo1oxQwI3ozIzo1Y6w88aYzQxIyY0YwY4Q4o7Y244PoY2I-Y3w2Y641fdYyw6Q-I3I6g6CS47Q5ow48Y1E748E2E6E33j4+o345E145I3fSExY7I9k4Ex4x0ek0494846k449o+41k4wxrhE2U4U7Eyk9E-w1Uzk803k5U7o00ck10yU406UzE+0zY-ExjnUyM-42M2kwk7kxU5M609M2YTUzE6MxM8szvVM0M5Y89t08U9sxkz08vQM0Ewowc-k4k6-ks7U+Mxcysy0x02037gsw8304870+szc4M0czM7cwEVs7szs0U78+86c283Luc4s5c2C9c3c4I2sx89C7M7Ac83E0iw08izC0C1C1lj8-89i-U1iyc2iwS-C7Cxs8bqC4iyixSyIxi8C-i8tuS3i2S088g0S+i3MyS8cxy1Ngy+C-S3s8fZy3C184Noyy88i9y4K4C4S0K8SzS9Hry387i3y8k1K5KyyzxuK1c5qxC2UwK+y586q9K6y8Kzy0y6K5S0Y9S5a2y+ZvKwCziyKzK1a6806469awlhq9q567a4c0a668a9c964qwqwE266G862G365G++oGw6+a2Iyqz6wm2+h6zGya8Q-q4m2q1m4a0m+xrGym6a5wy676yW9eqmwG4WxS7mxm7Szm9mwawhgW2a02-szW7q7K7Rvm0q928G2232xK5m3W0O41uW1q6Ow-dWwO7W42z23a0G3O3U+28W5O3q1O0u-sl272xW9E8u-W4O42uO4e5Wyux22u-26uxe02i23Gwu64+u+Gw+x2pu7e9u0WxG6W3u9O-u9+y2ke827O2oye7u8O88te2BwB1+5B-e1G0B++xks+-a2m2+4+x+yB7+5W+B1u6s5+9B6hw2z+7h5hy+2O1o7h7Byh-B0hze4h5C3Bzh+e6e5e8B40n+2KxB+Y-R2e1x1mkRzRyR+m9x4x0J8xwRwxycgh-O3x56yJ1B2J9Sqx9R5J-U+RzB5x0x3R4a7x0pxJ2R2p8Jxu1R1p6CzJ7p2h6Z-h2Qwp0Z6vSp3h6J30tZ6+4p+Z-Z+pxR3p3kxJ15+CyZ3J+54slZ+x1R7ZyFx5xpxZxNY5-x2x2Z356p0Gt505x6754Jyl25-FzI4F1h168y7F6l+F6B0F0l0Vzq3F3Z7J-l-5xZ4l9F4pyG1V65-p7Cll8Rzlw1xV+l+Vy5yc1F21zFxF2V6F9ly11J2l01xl412N8zSN9p8F2F+14RyV313V3e4N-NxNx1+N0IzV8t8lwV5t2NzNzt003l510NwN5V0Lb1zN917dzW8dxh0t1N-t3d5d1135Ud4Z3y+d5N++9d49wq692d+t+929xlQ9-+9l89wtwx598V-GyDz9wdy92twRf95D3O0D1t0mxD-16Nyj2D4j0T6d+ZXD7V8q8Txd51+j3j0p1j9Dxt-TwT68bjyt7RzD4TyT2T7t995T79xz8DyTwlTT2z6V5z1T9jz4qz71wz6D4LxL7L9edzwp0j0z-rSL1p2r4z6jwr8z2BdL0tws4r3z5ZwD61yryb1r3L5L0LwGRr4b6Rzr-zxtwb8N308b7bwLzb7r7Bcr2b4B5b07z1w7xj1Jxo1b6r0HxH4H8M19276H+U17x75l-77N-D5I5H+L879b8n3YyH7Tzp1H0X1O67+b+73r7n8j0nxX9SX7wnxx579r29-b-H621n1X03-L9n+D3H2X-X8X135t3XwXzZzH4P9H43zn98-n6Lzz5P5nyS6X2H+X9X6v5397938ucP7Pydz7+v8Wy33323+PwPxvx31P4OUv2n1q5XxP41dv9ewv2f3f5v-PxQYf8vwJyf+38c1fzt7f6fwAE-9AB1OB-jPyf5ACsqH-a-v0xAFr8L++-GvoMT-69896kA5-n7TAGt8EBOAiAUgMQH6FoBhfYASQMX6oCYB47dAVQPwG4Cx+NrVPigKPp4D4BPNIgeQJf7n9mBBA7gc3kYHk8LWNArge9SwFH9aBb-cQXvzEEIk2B6fV-pIJx7kC+BGA0gcoO-5qDzSIgz-jwKEGsCZ+0AjgQYLgHaC6BJ6JQZQMEEmDqamgigbl3kGWCWB9g4wQThkH8CJBcgn9mYIYFGCpBOVawZ4P76yCbBAQ1waIJcFz9QhegyIdgLCF+DFBcQwIf4JH4JD4hIQrQTvy8HJDMhqQoIUkOyGJD0hwQ8IWkJiEZC8hKQooTkIKG5CKh+QkoYUNiFZCah5QhoWUMaEtCmhbQ0oR0NaE9DuhfQ9oQMK6GDD6hQw0YSMPGHVDhhkwsYdMImFVD5hdQ2YUsIWFRCIh0Q1YcUI2GVDFhKw9YXsLWEHDNh+wo4YcO2FbDah5w5oTMN2GnCLhxws4fcLuG3CrhcwnYW8MuGdDXhHw3oVMJuEnD-hDw54Z8OWHvDHhLwkEd8P6HXDQRQIn4dCMhG-CYRAIp4ciPBF-DARqI4EeiJREYjcROI-EWiKRF4jCRCI+EWCKxFEiCRFI0kV8PJFj0+EDAGUGAD9CiI-QIAUEPgHUAyB5EbQaMLGBUReRBRQo4USKNFFijxREoyUVKOlEyjZRco+UQqMVFKjlRKo1UWqPVEajNRWo7UTqN1F6j9RBow0UaONEmjTRZo80RaMtFWjrRNo20XaPtEOjHRTo50S6NdFuj3RHoz0V6O9E+jfRfo-0QGMDFBjgxIY0MWGPDERjIxUY6MTGNjFxj4xCYxMUmOTEpjUxaY9MRmMzFZjsxOY3MXmPzEFjCxRY4sSWNLFljyxFYysVWOrE1jaxdY+sQ2MbFNjmxLY1sW2PbEdjOxXY7sT2N7F9j+xA4wcUOOHEjjRxY48cROMnFTjpxM42cXOPnELjFxS45cSuNXFrj1xG4zcVuO3E7jdxe4-cQeMPFHjjxJ408WePPEXjLxV468TeNvF3j7xD4x8U+OfEvjXxb498R+M-FfjvxP438X+P-EATAJQE4CSBNAlgTwJEEyCVBOgkwTYJcE+CQhMQlITkJKE1CWhPQkYTMJWE7CThNwl4T8JBEwiUROIkkTSJZE8iRRMolUTqJNE2iXRPokMTGJTE5iSxNYlsT2JHEziVxO4k8TeJfE-iQJMElCThJIk0SWJPEkSTJJUk6STJNklyT5JCkxSUpOUkqSTxDIkAEyLQC5A4Abgf0CAB9BsiORCALkTyNoCKJ+RqAVSVZOsk2TbJdk+yQ5MclOTnJLk1yW5PckeTPJXk7yT5N8l+T-JAUwKUFOCkhTQpYU8KRFMilRTopMU2KXFPikJTEpSU5KSlNSlpT0pGUzKVlOyk5TcpeU-KQVMKlFTipJU0qWVPKkVTKpVU6qTVNql1T6pDUxqU1OaktTWpbU9qR1M6ldTupPU3qX1P6kDTBpQ04aSNNGljTxpE0yaVNOmkzTZpc0+aQtMWlLTlpK01aWtPWkbTNpW07aTtN2l7T9pB0w6UdOOknTTpZ086RdMulXTrpN026XdPukPTHpT056S9NelvT3pH0z6V9O+k-Tfpf0-6QDMBlAzgZIM0GWDPBkQzIZUM6GTDNhlwz4ZCMxGUjORkozUZk49SWyA4AUBSALI-SYGDZGhh8A4YSMLyPMnKJLJaMymVTOpk0zaZdM+mQzMZlMzmZLM1mWzPZkczOZXM7mTzN5l8z+ZAswWULOFkizRZYs8WRLMllSzpZMs2WXLPlkKzFZSs5WSrNVlqz1ZGszWVrO1k6zdZes-WQbMNlGzjZJs02WbPNkWzLZVs62TbNtl2z7Zg4dSawGqBwAbAIiPGWIhACEyEAxMhRHCAskgBcAmwR0AAHEAA1IwFMBvBcAzQCgKwAAD0AADSNCGBQQ4gAAJrxyAAUjwE2BGhTAuQAAHKghcgwgbwKwCWAtBC5AAaTQDNBNgqgEOTwHcCGBVACgeoO4Cni4BgwMATINnNgBjBQQU8XILkHwCbBDA8c2OTABuAAAvagDIAADsFIAAI7qA8QAICgI6GMnNAAQoIZoHyGoDLzWAhgMYG8GmDVyhguQCgKYAwDVztQ6c9wKoBnkIAMA4iaucGB4AAArMYD-JgCfzxEoINAFnNHjiJcgUAauenIoD+B05wYcQNQEyAUhDAhgBQJIGEDNB-AYAGQIUGaBgB3A4iGefHIoCehMgAIEOY6FMBIhMguAaoKoDDlgBnAcACAAvJgVAgJ4Yc2RNXPEQTxVAjodwD8HqDsBk5qgUgHiBDmOA4ACgROY0E-mOhqA-gTYOoGkQTw3gsCngGgG8CFACAMACePUHSCmBHQn8t4C4DeD1As5zQQoCHIgCSBl5zQBeaPFBDuBmg1cyQM0GqAwAKQIcieC4ETlhyw5OixwG8BDl4g4A1QIYNXPUCghMgn88QLgHTkQBq51c0wEgqzkyA8QjgGulPDeCmBl51AGAPPLGBQAFAwgRORQBkD+BHAYwdgOnIUBgAQ5LgIYKQETmbA8Qo8T+dXIXmOAwArAXIBPFMCOBWAM8ngIYHcDpzmgeQUEDPPqBGhCgMgQuQEAoDTBqgjAQuY6FUCMBvAwgUgOnJlDuBcAVoYMBSDAAYB6gAICAG8AgDCAIAE8T+aCDDmOhxAGAAEKYDgCFBTA0wagBPGoCFzpgn8zYI4GqXVy8QcywwKQs-mOAjQM850LkGDBgBhA7gT+UEvEThzHQFIVgIXNUBoBpgvSmQKwEyDeBcgy86wC4CkQyBE5zgeOYiHaDeBSV0wdQDwAgAUg3gty4QACFHjqB4FC8vENMHECbBGAn87ZWAAUBwA4AFINAAiBgC5B05mwLOZ-IwBwB6geIMYIXJDmqBMgy8-wBgCNBGg2lhgIBYXLeCsBR4WcwoMvMKBhyzVjgaoCHIoCfyp42SjAGAE2DVB6g4iOAG8AXmkrGAOCieIUFHgLzhALgdOeoAoAIBMgmwZVWAGaATwAQCAXADwFIC8L1AYwfwC4BECFAeAMa0wBmqzmmBE5NcieOIApCfzP5cARwACGqBjB1A1czYInPTmjweAhQCpdQDDnVAd5YwaoBgE-nLyhgIct4InOaCqBvAjAaoDQp-nUA3gFII0FnJuDBg0Ay8vELyFwCfz6guASVbgGoDBhXA1cwRVPDxDxyAQ4iROaPABDxzGAicyQLgFHjLzC5YcsYEvIpDxzCgey3IKPAgDTAR5C60gACCnikBcg1AdORPFID+AoACAGeVAB-WYBcAhQYQIXJnkyKv1kgbwHsoQAAgU11QNAIXKGDtB05uQEORhtBDxzR4qgRlcIBnmFBg57Aduf4BkDUBQQkgfdf4ABDEbxAic1QMvKnjeBHA7gGACHKGBoBHA4gFwAgAnjTAXAcAcQJHIGWOBJACAMOcBrDnCB01Wc6YACAniXrDAYAJ9eInETUL4VRoOAPHInh4BcACgPOc0BnlvBP5eILOZkCznuBc11cmAIwEKAAghgigUtbgEYALzpgqgAELkG8Dmr3APARgDIFHgUg+N4ga5XAB4AiaMFMAXyIwHECgg7gjcmeawC6XTA4AmQZLbgETnqBP53gQwKwEYDsBxAU8a5YXKtUarcAFIGQFPGXljAeAzQRwMuuKCJzWVkq0wEaGoBgBqg0wEOZkEuUYAuVCARwBSHXnNBxECADoMluoCFBGAeoHEPUHqCjx6gwYcRMGH02DadF6gUgDcFIBhzVAjgeoEVtHhjBcARoN4LUDDkHqIAhgaoIXNwCTLcgiciAMGHqCSBQQo8PEIUDeDLzhto8DANUDACMBDAQwZoAgHjnqBHQCgEOcvNwBjBWALgCTaYD5AzzNtQwI7aQH5V-rGAo8auTPMMAIBtFy8lwOIjACqB6gPS0gFAB9UVKhgcAGeTpvETiBC5jgXIDwDuWMAfAuQDABPFDBZz-AVa9OdMG8DeAsAScikDnMy0IgEAn8mADIAoDLyoA7gCkB-PEBjBcgAIMNYOs2A-BCgYwUgLyuXmjwYAAIXFXiDg1oBR4Ico0BgGXkKAIAR88RNMBECGBp5HGzbe4H+3BhC59u0gFnKNDTBcA4iBQGHJDm4BqF4gCACHMTk8BnV1QLOYMuDDCBHQM8ikI6ETloAAQ7gdoH4vaWjxjgwgPEN4DV1DBDNaAFlY6AwDeB1A62z+QoGaB8bqgmwUgFPCuVgBOApikefUv8AhzTAn8rBQgBxkIB6gYwRgBQFHiFzJASugJcIDW0Sqw5MgdRUWqGC1qpQAIZeRSGVVZzJAC8woNXKNDLzqgFIaNbgAXlQAKQ4iKAGHMkCfz-V9mzIOoskBDBHQYwWrb2pnkQArFYwZoEYs13TB-Vza4MO4Cn2ZBBNqgT+RAGqCSAs5FIRwEMEyD1BmgYwIYMvINDTBLlToPhbgApXTAjQeILBVAEkB4gpFXynSaPAp2dLL5P6-wDABnnjzxAQqj+ZnMcCbAw5uQTYI4rDnabVA0+yQDAGtCmLDAseqeNXNBDsAxgMgW+UAvNU8Ap4zIwuaQBkD1AlNOMwwHiAQD2LHQ9QVYFnNIAzyMAMABQFAE2Cv7cApgSQNQFUAQB6gcAT+S4rDkwA3gYcwuVKongBLq588x0L3LDkKAQ9hchQyHuEDsAJ41QN4AgHTmZB-AE8UOfHOoC4BhAy8mQOInYDsBh1pgZoKCEkQQAs5uAaYGAHqDUB6gCABeQ6oQAUBE5GwPhTACNBQAZ5pAJJdUFJV4gXAt+moGMEMCJzwDjGlwEvMYCSBqgYcxwNQAzmFHTAhchAOIhgDBgp4YcrLY4GmCmaQ51cqeBSE2AfKp4joI0GMGcPeBmgD8hnQoFBAwBE5n8ilQSGoAhz3A1chQGAvgNDAF59QNAK4dEWaJjl7AeObgpgAwAEwa+huVAAoCTG3g7QCte4CGBNaZ5jqxgBAHcDuBNgC85eWACNCqBqAhge3U6vECjww5-KwoIYFIDLzcgaADpaYHYAEb01o8cQBQDADpz2AT6glZsB4CbrGALgZeWSqnhDAwAicrOYIqzneB550yzYDIFMAhzvA0wBAIXILWEKH1kc5VRQEkAQAFAgBgkIJscALzVA-O9wAvNBDVzSAFACkKEBcDNAkFkgaYGMFMCjx9NRodgFnK+0TwwAE8LOfUCiB4hDA1AcRIEvEBZbqgXK2I9PBZ2MKs5067Y-5twCsAJ4YweOdUEyD-r1Ah20wFPEy3iA3g1cjoDIGmCErvAM86udMA0MQAYA4YEOVNpGAyAJ4-gQuRJtwDqBJlE8BQDAGU2OB1AicsAG8G8Cjw4AwYZefHOiPrr55yu0wPHNGXm7gwLgPEBQDeB4hSNn84MKoB1MQBxEhgUMP4HqACbcljcikJIGPm-qZADW0lWPrxDUBjjCOxEAoHcDIn45pAauRJsu1hyhgZS3eUMFYA8AYAKy5oKwHcAuAHtHIdQBPBZPsBq5wgN4BgGwUUgKQwgRwI6FL3eBXVCAKeNEZUDPK0thehAGovEDMiMAYSo1YYE4VCrSARodwLkFMCMBGA4SqgAvO93SbdVQqxwLMfESsBztBx9QC4F-1JrWA5WvLYUAXl-KIAzQaYFxogBPzzNpACeEMDcUjLE58JzlWMEkXxysNeIaoNXKCWqAc1wYR0OoCngLzut4gEOeoAz3oLSAwWz+VnM2BTxBE6isOQgGDDSb2A1AENbgDDlUL6gwgI0JtuqCFBlVYc3REHpJCv7mgL5i5RAFHjNAKQYc4NdMEdAAgAQMAUePHNBALzrAnc+OeInTmgg9QbwaunAB4NGgKAhQKAMeqgBkqAQicrYzvNstDAORQwFZWgBFO5BWApgBQKYGECGBNg8chYOwF3nhhq5mQEiwvNYDeAjQZ26gHAHTkIBD9hc8xYUGjNgAZ50wfeTgoXmfzcAvx+oKoAQCDzTA-gXkN0vcDlzxAncuABMce0UgYFC8vI0MApCOLNNV8wwN4HjmsBgw6co3awARAyAEACgVgKQBcD+A4FbwSQGHIwDZbVAeIffVfp8OyJfIkgFwKYBkAzzcgU8Fg8HqJBHz-APALFYnLeDsB0dIcgEKQHYBTxi5MAeoBPDgBjBE5Nl8RIXLgATw69m8ukwtv80zyhVC15K1PB4AKBYLsAUwOnLUU8A4tuAQTSHNYCX72FpBmQOIEdDBhaduACeJDpbm07cgSezYPRuqCOghgjgRObJsKBGgJ4BKxwBPBA3eAJ4EAHwzfLxCOgw5M89OdvshWon45RoHGe9sy2SBq5WcsACEEyCnGeAkFheTDvqAhznNup3AKCGEDTAYAbFwW8IF+WsB05n8ho3WeEAxLury82O6QBrrgGEAhyqAHiG32LBRF2quAJsGrmjx05qysYOImoCmBcAqgDBTTpVvCAwA4iDjQgGEBjA7QqgGA4nPLshz0j9pkOVAHqARH9D1ABYKYFMCbBcghQYMJCrQA8BGgYc+qz0qNDeB-AsJgEMIHUCfbHApAbwInNMDqBTdwgDANMG6MKBl5AIGQO3PESOgoAhgR0M0BcCbAMA1AXDS-bACmBqgM81QK6vnMuBrVU8Yg5SckD3Bf1JygENXPcAhyQ5-gZoGgEmV43gwCgDAO4BWsUgf5cAIG+IkKD1AXA6gTYMGE8uSBTAtOmeQvKe14XTAkAKRWrbeAzzl5LJmeTUGWVgOQDQS0eAoABDjb6g86stayCWXsA3gCgbM+oCNApHk1WCrm4YGdPFbqzJd9M6PGDCpn2AYc1gC5orM-A8QkiRgJcsJPeAM7z51QIUFyAIA8Q3VgEJ-LZW0PQQ+prORABkB3mIAQwGOetpnkUBtbuQcRKPCngYBA1jRuTe4p4AtmwA6JyNW8DUWsBq5FIDAOnOaOLHHQoIBQIUBcBLHbdYQEHWwBcAwB-AmQQVenMetoBxE8crQ9MCGCbAxg6ckOTPptNO6KArqxPVAHTmwAjQYAfwMWp+NGhQQbwUeMSY20KAVlC8hACHODCfybgkgFy2ADDXTB6g180p78ALPG3CgrARwIUAaWkBT1FAWK6esYXYm4dpgXJdQGr3VAxTMABnXiHEDFAYAYAaYKCFMDuALN8c-wBSHqsUAp47APEPRcTnxysTC8yQ3vsidbKLL4gEx1PEKBgAfzuAEJewDNM8AG1uC+OYuc4vTBC5ExngCHIvOx2ZAMcha6wDaULyob1AEp+VZDktXf1Ilx0JMe8eyXGAIcruZkvjnLyFrtS2nVIhZOJy3V1cuUHwZ3k4mZrqgcQCktHiAmmlkgAEDUreCGBTAiIZoES9B1oBXn0CgdfvfA3UAK7qNuK7Su8BcmhghgCANya1uJzWAQdikNUHKWvzmg4gNAOnPEDfrCgCgQxdUCafWqYVhcge3DsLmMB3ryRjAN5onk-mozpAC9eYuGB4Bx7m5vJQgA+vVzY5Jmwo+ICgCghSn8W7wNUFIAp6XAQq-OYwtyAwBWrRoGO44A2XLyPtfOvG3dqe2sAKQmQBeWgEBfFPXrAIdgM9akDbAPFChmeTIDADuKTjC8gucGFMD1A61o8aYGgETPV6hgwYHEO4EkCbAZ5QwMI0aApCFAKA1cwoPPLgCSBJ3lNpDRSETmOhl5wYBuTwHjk8BE5MgJrfAu8CnyZ5MADAAoGDD6vqg1CngFq4qPw2Q5ogbYBADxDuAFAjKsU+XfYfVAr7fGqdU3sMB0r63Zt4MOadICggjQ4gBTaPFYAFO+FCgNAGAGXfzGEw9rvENCvYBWWIA8ckOTPInjiJU1lyhbXiBIv2Lj1-gdZf2vUDiB45GF5MxiqCdTxqARQCAA6c6AuBSApACkIwFIBjBl50wRYGHPjmmA0A6gZoNOuaCjxDA4iVBQCHTkwB05QwBZSHLl3DOgbbAJZ6ncTn+upjWT6NZQfETqAF56gQPcyOKMQBMgYc25YYHfXqBUT4BheYwHUDz7R4Hz75aCC41Dya1FAIFe4CgCNzMghczYOIDZtIKatjATYM0DxATxC5mQTII6EdC9aB9wgHgKPHP1GaXAhc5663qNAtavtJS4QAstncon05xofpXu4adzbMbnl3uaCAM3DyVlJ25oGvNwBwH1Alb8kACAXlvAs5IchedAsYChPEn27mAOoDQCIPhAVC+J1nLPvpyNAYwbwHiCmfUAF5Ic9OW-alXtXHAqgMYFPFNOOB3XcurOZKccAzzMgU8eOTPLxBpGy7++6t4JolOR6o5YclwGWfkc17CtHSoYA-exsK33AjgaW6odBCMB3A4gBM6PACUiWXA1AVByoHrn-bx1gX288vLw3xzVAA54jTN+qDiBP50n3AACF0PTAeAwgau-ieyVtnG9mO8U3+qzkYBQQW8lEIwApAKBxd1AF+f4DGCDAoAn8zIOnI01bBCdicikOJt53xyG5qxuZRQEcAKAR1QwRHfXLk3qAMA0h-Z0aEVOOheQNO8RJzsLnAa3nmwBQPHIO9ZyF1CXoYEMDAcxGYAcV9xxPDOOoLq5bt4xaCEKC76LXQwY75-PcCsBuRPAI0HE92eCaALPpsYB4YesJHhAJPtAJdsyOeghgeIN4H9r9Uen6gwG4HVApDnUBNgtm-Q60CYs72s5uQMYF8uaCZAFAE8UeBPHYCLyhnC8u92ME-uOh3lmwZ5awHa2ggxFw9nyJD-qU0AZ5hcm5de730vbWA317F3Z+DB4goAnwcRJatURfX0l7B8QOK+5tXK4FBG5bZkDeBwBaPeIDAInJnm8fw1oIZI0N9iUhXqg6gPwDGdbvUBSAzQNQHIkkAPyT-YAMOcvJeOE6MAbwLkBgAh8pG6bACAKCDeK-gCYqkmcTi4DFq1VgtqHKzgKl7LyyoLebiAVJuEbUA1dFADt+8csYaUeYAOLaJeQwG8CLy0wHiBgAjoKPDl+joJwCsm1QBzpoAMgMbYAg0GhgDUaQJlSBhyJPnlpZy1QDwBreEqjADbGkthubs2SIKtbymRoIXLAKjADAoyAG5mMCfyzIsGCZAwYAarmmeIJsCmq4+goCZA0GrdZZafmv4CNWzQIta5ACgAE7BgTxowCZAmoEaaFyMAF3K5AD9oUCFAaXgQAKAXhhPDdqbhrO71AzXofZPyEAJ0ZDA-gN36Du3it4Dpyict4Cgg6cgvLVAvHlXYUA4eiIr4qWco4Ds6OKniCggn8rPaJOu+uoDuAhchcq1+RvgyAa6zatnKGArNoW6FAH-mADdmU+hACLWX9unJGgLOiHJZyFACIGbqCgOPBZyXphACI+icg9Zx6C8r1oYAFIOnq16YikHqFyjnrhpiGo8Lz5HuMgKCCPOhilPDVAoGonJjAjgFgqAupAM-6OAhcsICMAGAM0DOapQCuakA4iMvLCAzRt4DiG7AGQq6WpgIHpYqn8t4p+acvo1akAweqJqMAKGvX4Re7gGX4aGoIP4BTw-gAuqZAkgIO4cGUSsTrSa-gFIr+AnllzbGujgLnIIKhQGsaKqK5hbY6uETkCCfypACMAAgIKr+ZwAZgMHZAad7tl4J+fOm8DuAEQVPBxBbwClYUAC8tQAhaHhlSAuAkeuE7w27ALXrMKlWh4Zv2zWlFaqeo8OQCt+sgCZbFOU8OGbKgPAAM7VAEADwAOKlWgCAzyq3unK5aNDtS5jAnlgtqggpZtpKkA-ho4B+KYcuqaZApRg0BuGeQZ-KGAcALIGUeLgNzpLqLgOh7DAjgIYCZA7KhQA1OAasvLzq3gOioIAppkm6yKAIBMB5AyOmMCqAs7nEqZAabtUDLyASjB4YASegqq4ALgAJZyqbwJsB5AEOrzpwhD3j4oQm4iP4BpejgI8HVAjnn5oUAuli4BfWvwOMEuA9tk5qwG1IN4BgqiXp-KJyuQIwCggIKsurfyhDqCDL2G2p-IM6gVhwaOgAetCrNAEAMma++U8AWYwAFALgbshtmsgb++HANUAjm-8jACAqbwDfbsAxprK6SAmqmrr7Os9iHpHqgLoQbTAhoDHqd2wgHADVyqAc0AXBqgFPBFWxhjCqrybFlPDY2U8OoBvyZhgoALyqNjADJ2SOnADF6JFhgCMAjoPRbqAhgEMrpyGIdrr2g-SmHLYWzFuqqiaioaVokO26m-qjwMgOwA36WcqwCqAZrgCD-KX6uoDpycAEHo3e1oU-LTArzgMo1ytivHIPAwYCT7TA4iIXZQA5VuArCmYcuwCOgLgGLZWKA6niCSAYwMcokWFIMjqxBPAKoA6AG1hQCgg6gAD5Vq3Si+Ze2IVsRYuAzXo2H86R8iT54gPAOIivWmQNJpXB8RrJaUBDekgreAZhuwD6Iy8jwDsAmwKca8ahQOoBT+YXo6DgOhckv7sARPnACOghgLkDCRb7vHJSGJPnACcaOhr55KOwYF5oGmhdkxaSg-IFE6dquQPHIcm1qinLF6y9rqZjAgOqYDVycALVGc645kRHVytftQBQmRjpsBhmXql6YUAM8uoAVO6DuIgGILgNrr1qAimMB5+LYQEBQAUalE6jwMYIYCPWjAHQaxeoIGq5a6xGrr7JqtWvmZzKh5s1riIpgIeHqAnAG8BRAowYLqOAWcunLLyoIOboYqrsk9rvWI4dXI+y-gG2aMA6tgpoUg1ALx4uKhcrkDiAC8jB4b2jABoEiKnYd4DuqNyhHKkAC8pICOA1csWqOgkgIwDLylYaQBrufWvfYO6CYGWqfGkgFCZ4g-Hrsr+uP5kcDxyoFuwYzyNWhCbMeoxkCH1A26gubKG-gGB7CmmQPU53qIcgJ51a-esIAXqgyoYCD6wgIU4KOjciF7UA9brkBGgsBsfqZAEequqtRNyuwDCANzmgAPAicuLbBgg5rZrHA7AGYG9B-IUaC2+RoMIBoAwYP7aXBLgEs5jARVnrohy0wK7rSG5OgiYQAu8mpEHWMALgDd2A2gEpWBbwIu5TwNGqQD3afwDCbtyMgIJ4hyrSpIhlGQwCRaFAcAHu7WhGABUZehU8KUobKjqrc4cB45gZZGg6gIZpqACgBQD4OzQHUaXqEAARr-avmlFavqmgJkCJyrcmWYhykSt4B9G0wEFqrKzAb4G5AGQJIAqRgcZ2EnGuAG8DJqM8sIAR6dBlJGUBUiInIYAhgOiqggQGtYZaRc-usbY+ATl6bueMDqHKGgqgJPrqAC-qoCQAYAKCBZyP6jICfyYRp2qkGeQdyoOO5dkkENucCtGGMaImgOpsOTukbH6qichApA6B-hADpy7am5G4AbQQu4UgzdmgDzmBfqWF4gydlAAJgCpmADeAjoGgorWFzmt4SKcysFGXOHXr+q4A3gKtYzwqkaYCsAkgG-KH2rUdQCKhsJu4BGxYek+4QAW9onqEGmwBMrKa9QIB74xZ8kwbLy4iFnIuAFIAIqBeM3unKdKxcREFOqeIDACmAR3rDHAWuBtXKOgr8RnJcaMgFwaLmE8HB5Aao5psAuA7AFyYKA-gF76VuMZvaBjKFABPDhRagBPAoxhqgCClO7gG8COgFAAYE1ywXiirQuy8nIjsqCgEfqlqYyowBIqnwFg4CapHtB6g+OPqAmhO8KqQDiA9QNMDLmMWq-7YmMgAHrfKTeiDpmq+JnwoLaSLmMC1yFIKHYpejsViESRkxmojsA9QAoBRGv2psCFALumMB8uUwS0qg6tUR9Zm6R6uoAVGMai4Di6MgGyCxKIjrUaFyHynkpyKzCZFo+xh-mOYyqtjs0CmWyjsr5wAf+hEYp+vVlABBRAoTACke7OgCCOg8cglEQA4nqaa4AeIM0BLWw0WFH86aAM9aMAE9pDYLhwqoYZvAIxmMBz+qwIzakBdahSpvA7HsOoyA3gB7bxRa6oW6tKqgEdrUatugvILyuxhPApWicl9ZEeYtgl5nqqSgRbgmSIZR77ysVjnKbA6iip7Wq3gFPDZQLjhhaMJmgKoDuA5tnH7UAzQLkDhBeRsK7Vy40S4DVybwL0qsq0wJsDAah9mMEJ+qAewmyKd-swmFOYwFMkKmn8trqae1QBQA4KM8kvasA0wLepbKg5kKrUafWh-bVyGiujqKA3Wt8CGAOcqCAp+PAAvJf61zvOaZG1cmynMinjsrYTwAfuNZkBOxkgrXm7SkMDiAr+vRp3W0WteripGAHCooWXqnongxmUbPbIOK2nbZ1aTgZtqw6WcmgAfmK2qoA7uXke44QAqOqoAjWjoDyG2Gy8uxEfWEegKk6mC8hPLAWphrUruAjAPzakmCgC7oTw8cgl5dBC8hQByqmKc0A7WiHtm4r26QLcnnG+7mFGbAvWp-ILObMZkAjKM8I4BoABduIComCgOXrZBLgHCEBa6gIorfO9ZoPr8mEckypGgucskHLhxjkMD8qPAGkGo6GANWYORn8tXHeA70eWpDK41gCAYA9ih148ABciu6UGJjm0FMKUQHxGs21MSlbTAkcrG7ZhC8r4FQafIaPAIAY3iX5LONyv2onqjYd4AAg4gNXI8AiOiUqoZ4VioHb2ldGACqaE8PFqZyXNrDEi6nUeDEvGAsWBYUABFn6q6qPcmt6E+L0QUFza08fJbtKRLhsorGSwUtHwRPBjwAyA6cot7dhjgKn73J3fjwAL+GdtQCCBGAIXKRqYKvcrVyfPgvJDApgNmYDRcALHGGA-OlgqZAIKtykH+71uT7c+BEdFphyC-qSrTmMgBHKLJJ6sIB1WG6VglzyYcXdYNy18jABamk8eAbJqmwD8o0mdxkMDiIP6a+rNAu9j-5e+EFuIhQ+TycNZhyDTiRYb+gQbkBhyOxjIDIKR8nf4RhvOjInuAznrkB-WmQHtpoAxkbMEzB76hSBFWpKnlqG2L8uvIhAixu6rWgz8o6qJycSfS5S6ZurIp5B7AP64KAZTpomZAqBkaCRyfGnC6NmFtiOrvKUDiHIGWMGaWFQAZTmtaFOyuuIDJWCAKgGEZYwPUCMAbFuvLDOwYKPCFAVSpkBGg8xp8qqA0wHVbHOJipb5MKSOvUCOO1dl8baIwWoUa+BxVnCnluD3jAC06dDrYrGqzMbY4PqhzpUr425rlLraRwYHiYV+0mWMB9B1yheHkm1QJT7gKTclACcRLupkD46XgIUpCeFAN4BSR4iORaGZ1QBZ4wGgKacZ4gpabVHt2hcoVkDGEAFm726jOr-ruqO8RQAAgiRkaAu2iBjwBQ2P7imrpqQwN+4mKn8qnq9uxcRSA4AfSnaGbAIJu6qrebwJc4YuwqmxGdBigcUp1Zp1mTZQaDvlGp9KDqqYDX6qqrnpBKRoAIoYAl+h1FQAmWlHLyx1AP1poqu6gsC06scRonNqwyvL6z2d1rxEIqjQAaBhKRitHHpyYcjY4JGFcv4DdqigZIB927gKs7jw7AJ9qxyb2kh5QKnQbkAyAqxonIaOicsIBQB8qoLqSA6gFKAKAMgM0A9a1ABeEjKrAKeZ4KaADqHc+SUY0HuA2ViHKGArzuoDeA7gLMYGInBk7FbALWtXJsB3aSOaQAC8vHLBg1AInLMK7itN45J4noe64A7gHiCqWjGmpZQAPAEXL9pBdtQCfybEYwAgaZhmgATwhgAnkYAn3qCD1AXckRHqATwTlFGWRmi7o1+fqqZZoAnvt1oKA9WmMBwqiAJkopaAIPhEIA2lnBpra9ih9YIgtatlAUgx6tO7UBEAOoD1AUMYUDfy4iNvrpyAIG6rpyd8hQ5gxgBjfLFOhcsGDfhpgOIDZhM3lCmQucAOIjF646vUAcB+xqQBxmciaYa4GYAGIakO-DqPAzylpuwaJyt6WBqSZk4TGphyLct4Cu2QwFABgAlgc0DsAmQHuq3p6gJQAuAPSk6rkgQNpk4Fy6iJsATwpObF5ZyrKhjZbhrhi4DuAeHm67EGbSunmH2HkWynJmGKVABvuSqoUDGGiXlo7iIgQWgCOaZ6gUEDK-gGZ4QAjAF8YlySUQcpGgk4VYpxec2s8ohR62c3Kx21ABgBCmM8s-JA6rhp-LYyNusMaPOPGuE6FyUAMpqV5Vdkr7hBU4eVYIA3gCFG5Aw6bgCmmtyZD5+KcAKCDT6I3qwDexF7oyYOhTsf4BDuTgVGquKIcl76FyHDtfpemwsXiDgOzQG2ZhyH2q-rh6sqvn7LuT4SoELyAESiZbe-gNd4OhF3rs7OWVthyHvW9rjMab5Icg3ooakcsJEia0wDIB0upvi4YTGkgOX4J5mOlZq5A0ChWZxq2QJjonaUJmF4bqLgL5pe+ehTAC5hEAP4BGgqHqdkYA8coXJahoIKJ5gA7arO5QAJirkD9uRoEnLlOCGRoqggFodSaFyeQURpfBkiI8ZWO-hn3qZ6a+o6DAKWQbvrpypgAgBa6muUg7Lh2JYUDpybwJTqbAIclH7AlhgCmrueQoARGqeT8YQ5H6k8KyCiqMgDIAyJWcmOEMgkCqyEwArURQG4ADdg77ym2NvWroG1SpkBvmMdjIB+hIcgBFmRmQNPDeASplfKqG0Co7FhyeIGLlBKkgI6DpKCahIodm9hv05vAEmrIlTw9SmEE0aZOl45VKeGsGByWmQOIbBgKxU1aSAMgOoBgAo8Fmq4ApKlXE3R8cv+EmZE5lpJ8R9QEh7RK5QapZAOwVlDFWKeFvobZOWjjADDRp2falEl52RgAUOk0WCoLA2SQpYTK2crAo1xLqpE5QAmgOIDXemQAYj0WYchSB8J-XkZFF2NyRfqxRX1psCPBHQKxF8+atjAB4gDwE0W5xxwP1Z2gYwH8oPeBHhcrgW4Wr+lSAvPuC6vy8ltsDEG1pQmq-AzQMvKxBb8XUG-pvwWFouAMmjq5PuF+jmUL+5dskYhyi8g3qdAWclWpvuY7mJoU+xjv5pAm+oJPGKquQGZnFaT6uiYS2hcuaaqltnv4Ble4gDB71OFACgocidQdIEGBdodXLfK-asLlzaKgGrZhy4pp-KCIUMRq7UArzmEpAgHphSBK67QJoaTZSIZio9JrcatY2KUAMqptAwYHABXqGiaUYQASJdSZ7l5ICHLoag2p0AcgdFqQA6u1AGba32gYZsrf6POZW4xgjAOfIa+JalnLOghgFCZQOd7m6Z3ajoMlZGKpWsI5xJBdne4OFVmiD7T5JmWHLBgKNtep1mW8ZwW+QXjr0rJqk5gvIAWJQW-rVykPhAAFuQcmL5t64McpkjAWjo9oWGqgJPGv+joHACOODhbk6JyMRgOpvK9QJoDDa9QHx62qQWr56Il+QWHIdeomnXKMAGjrkA3KLgMGAQBE6gnJ9Ghcq8ENybQbIpyVvmgAHOgtvmMCOgcIb0WUmfWo9bpyMUS+6UBCgOwALy56iYo3ZU5acHPBAmtmUBJOhsZbiIZypGpx+BQU-mJl92S4CmKEwH3pIRW6eh4YVRyowD1A4gERV4WdcuqFO5aAKyawKGiA4qhWpCmgD3Z6gAYikA1QBVknq+NhgCs2eICMBeZmuawAVykIWHJ7aM8m0CzuwajKAXuVdqYBmx6NndWGAjgAVYu6VxiEBtKaAIoD5uXVlBrTAY5T1pD2ewZ-JFyCToH6OmbwPf4IGFoVoZhGL-lACWZy8sVV6pLgGglllQwMIAwhDioRr46-gNQBKqrRhPBaR+-ofbSIdFu25cAK2mp4MpkQCi46RrnjpEJeU8O3aB6XhuLVQGuQJjERZqwI-GPy-gBhGcARoBgpsA-gEx6GAo8G8BDAM8msa5Aaumh6o6oIBrbYBwyvgqF68lRumgK4StgWjOUwZHowRbRjUkyZtBQmoUg1clUUiOxcTuasAsUQN6h6wyiaqGaEocXKNAfciQrhWpaoUDspr0enkTwXBlYURhkyqCCEGeXtAXiIe5WfZoAqcnyZw6gam4bUp-2lmUHeuACioaaCRqCBT+lPnNXDAFijX6s5UarnLFpOGhqYWleDv4AE+NNVIpQANzvc4vOV5gpYzuZwJSGjwCltMCaq0Rq9EuAU-mSrZm2ksf6BJuAGPp+QvVSe5ROLgO8XLyWMQIFJyDwNUCSFwgH1XqAAjgZZoAd1msG-JiZUQHiACAPopby0SvRpSgN9jEaYpqgELZ36bmpIgmhqXpkCqAr1r+qbAeDm4qcKuqgMXwALVjwDsqDThhE7JE8DPKWKMgIf4h1VhdXIuAEYFDb1ATqu264BY+XS4AgLhsAFlqiNYwAJ58ntMVP5YcQPHy6nirSo4pCURX5O5BwV3kpWl+jnpllVztUD86cAWHbVKrAIC40Kl8jb4tWUAW54xFOOnQGNhPAOt4M5PJmMDVxMgLkAOKQqiU5vA45n1afysAEqDRxmQABnoemDuL7X5GtixqFA0wDFEpR1wW74vy8xnGrxyVhhJ6JyE8BgBqWfaoQ34KQNnXKiJ4QdjE3yoIejriAl2gjroGfimV79OsHospaGr0csoiOMOrOl1GB2pWGfe4SbkDGRUAJaoAgQ6qYoVZE8HvocOc0T0W3K3ufw2FARFdYqAKi7o8bNAMgE041xciEAET25aaDqFyy+fZ5EmkgPv4KAt9grqqAb4Vgk5yz5h7E8AGEQUas5NCk6pf13bmEp5GswELpE6kgCCbJqqgK1btJpgGkpTwNQOPZ5WpAGPqN25qaHKwWiqusprNPANzXVVjJu0VFVV2uTo9emQLYbt6icirGGAWdlybN2z1gYHCADSqSpmGt3vfHSZp1tfWb67kUfZTw4tjpK5x0TsJ5ty46svLUBhPmebNFIVptUya7wa4rBe1ah0rCAbvmg1Q+oGvZptuX2jwAzynvi7aOghQPHIJ5EljNbZAr8ay50a8cucro27LonKsuh2ur7HGqDthFJVjzdNpTGM8jKpj6T6UxblWGpg8CsF58mnFoAYSgylxyjAZ4DxWMDTvUGqzZZ+bnaUSiqpL2r-m8BGgyQTJ7z6ZjmeZwAiuhT6U61cpwbu5F6epbExGjoXKPyjgLfJsqmDnRo3ZuxqWGOgMWuXJiFcAOt7pmN6qJr9OwpgyprulqmqkXqFiozrbNsQQMXRyCcrkAdRYchFlTq7AK-riIbZvW7+A3xYUCqAuBvcmJFMIQaUS+vQQNrL6-Gl7UwhGltQDQ6v-sHUAa2+jKp5Wq6qzqTwQwFnI-ufgOYWQAuStUozuWapg6RWf1rgDw6U4QaAIllASob-a0mVnpcaC8t4B72Pscabhuz8R0CsaOejABhyG-r6Ar2+Bgj6ClqgEaBTwOpg3ZlaYAOEFWaGQMWpYaQ6hNGK5E8K0BgA2geIiDqr6pIBU2o9TboDq3yQoCg6HtgKmvJ-gMLn-y1bpJ5QAQdrUBxym6rvrZF0wOnIKm1VRACoZTVgCDdapRrOW5ABhmCpi5sYAgCvxJNuAasVHwM1ohyORYgBIG1+n4GiJTBtVCkAY3ujrJW3ZtqBV2jAGMCaKZQc062KP2jYn6JTCYvHCl6zmHKjwZ6o6DYAUmZ-JqZTZtymjwWZjjIEaSrct4K1I8mX7fWhQFcoyq0wHInLyqntQB4h3NcpGYqLgILp3KP5nc192+mbkB9q6cq6ZDqo5hPJ7uYxTiDo2YAIc0h2diRQCGAF+qYAUgaQLcYGmaCQvLeBrAEZIGuBmggqOAbRtyq1RoSqPAuAY5T5qpWOHnvL8gjzaTZPhqql3kSaJFUMBsOIBTKAQAvqqTkhykXr1pDu99hgBHA4TkaBB2qehXI5lz9s3L1AzCmHoPR5IJR3om5vrmFcmC8rUZimEFWxY01PasnYveXSt2qFApAAbEWui5tHZT6zQFkaIO3Sm3qHBY6flrCAu+jDGUB42WwoKAB3h0l6VU3mYlGgcQZAbsKuvo6AGIictS1xJhHs7JIqqylcphdaABrZhxlgVrEvJ+XowAzy6hdaXNKjtW65w2pgN+rwtzmrgA1yg+lPBgBEmjKpzaCIKC6Tat9udkq6vICoCRFV2pEXxaIXlYGnqU8MmpZOB2mXn2mYQCGkQ6iRVgWk6mGibE1+IKsq7tA7KfvnTAbwKCFnOx1iaDd2YwLR2MNcFoTWx6wDTwBuue1p6Gn6dAQ95fBBSQuZpxo8JkBUAD9qjnU5FzhWbCRFlno14gYcl3m1A75b+3BV0cXG5W2muQXbWJK8QXEYASIc8pZ2llh6UlR3tcmoWhcABw4KWjoCVqPGaQLnHxyx+fuqumjVo4CwF6gS6GGAk9szEbmewAw5QAJqlQEj5k8BQBMm1hrTpIaOeeY6hyuAK-JxmAIE6bQufJsYCY6miHipz+jzZ4Dt6upijaFyODtPDbhwqjEbLyccgvLvlfIEhEnuqwLwqjK7VsPrCaRBU7k5yrzpj49BasV-aLKSSn0Y2JvWoWqlqTOtUCEe8+uHJTwzAfn2RamWSQpCeUiS2blO+TnkCcgwiiikQKZhgSUWl+CcNao5eGjqGOpOUSK79OJoV6pgaGAIPlTwcANMDEx6SmKb1AyXjdEHGhNtRqCqlhjFn82hzcTr2gSxXeYtOSITIDBgGgQoDR9eFTY4cO5Cqi5bGqPfaY0h9rtVm998gUKlSAHzsgYi58cdgWMJscRwGOamutmHUtYysvnp6lPjXqyJ1LhzoYVXeZxH8WBQZIAr5xnYXLFyCDrK6EJwsYc7Le7SvC19WCds0VCppBjA1nqT+fU6H6hjm7ZUKVhvhn825PnCayIjgPHI8xhmfd7c+I4TpYwO8kVkZ6mVAFn7XJrLsoUbVrRjPDT6TVt47WKUCq3Km1TugaqF2oliHKLJdfi-JQ+IgFPCDBDkSsVoA0Cj-6EOKKfjaPqoCotaiqrZq-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-pZyE4eog3eKCaaqfy71UfK8qsWejoLWDvgYjxh-mg9pIenjuz672uclAAVqyzrpbGdwcp2WAeMgHqC+jN3gv6uAhzvm6kASoPVaMqRBe4AfRqJl1biAmNi82aT9KsYrP+F9i3bX6sgYkaFOmKscreA1Jleat66ZrAVImiyvDVqjudbAXaBwGtOasgGAGrEFmeWsNYctkUfUA8A6qnfnc+6cmgDApOejoYU6cCtlAO919UcAexh3lnKH2f2kOp4AY+dmkEq9bowFh2MBmgARhNiqWlnKsBh8Cp9Mml6rMx7geKnhRvo5ikTmxTuFqTNJupogzjoOlfrDy8xpXZqqoRtIYVpLVnypryXQLims2GIUo5mOjqqoBNWm3pSZ0WVRbMYkz7akcGPWrAPWY8Or+WFoQKSQ6BEGuS1v4B+qN+hcF6hRDrnL0hH0ZPHeOjoJoW9OWIfpqAN3ySXrJl82sLmOqnrWVoqThgH6GcqMietp0aoVhQBCmKitjKhN0Gpzo+ADKVPDvVB1mYmTxeMWcrw2ybuG58qwYFnJbVILm5HxhMAOKYmOjgDAAjeH5e0COa2wL+YcBIqeIiD6bbhKZ9KudZ37ZF8bqyBnyd1dklMG0DiQreV9gRjYIGqkTEGrG5fhmFsZy8hPALuDBuMF++WcfboG+DineO4N6cjRpNO6Rpfkm6OVvHHjwMABT6j+BPfzbBgFALkB4g5jo7otmpNkQELm3ZniELaKNq-JolngKK1f1mgHXb0GQarloPeetuLbz9NBT5prWSxeRWtWSypHon+ygZka3xgKQf712xirBYMOewAIFx+z5hWq3JpxqT5y687iu6OAoIPF2zWNQyOZJekgCtaoulduNFgeAILTqk+WqV80qFzFoQpAdRcrA1i2a+ttFpafloYCHDz9s1Mv6QwDsb8BtqfYELyyXtrON5KxR+WKBa+Ydok+RWoYDsaWCwqr6aK+Y4AhyiDnsAJe-5jdpETwYExoIGFANHr8NFwa4rQaTypM5sqR6nl0zmBMYvK4qgwe-Hq2XthNE2uHAOEryRRHcRYKdwmoUCkGRQKdZclEmkum6ZMJq7aCB9DRpVCmQtu4A3uRigaXfuymaPIWKqJihk5r96eQCaKceuolDrjoAvIG+ncm2ZGq87vYkIAcJuAYyASzpXothDedaFL61cfWr3x9WsdZeTxWiLngqmwB0B42lmXf4GO5ZtXHoaXKQoCgRYABGEiWMAOIDvax3SjZQAzmrJG4d13mgDFGzCscX3FM7qYq-NAgNzaaTrZrCHGAWmrDo+AnOsJZ8K46tGqOAaCm3KfyFILy542r8ezZRKT+ap5FauRpbNlalwVfIimwVmxpXmCcrck2Ajta0BQO08tMpAaTSte0ladSdOaDOROZKWiWIXTSGwxnUd4BAay8UHblKlDQx162xahdq36nBncbCjIUXB7ieRWu4CYGCJuIBuK8coi7bQuoYzrYFCqur5hqSqovIIlZ2oYrR2PiW3o6p1AfabqIpas66FysPkkpsKnavEoAlw1r8HjtyZS-oUqo-TEEr5-tvmmsAo-TZZC6xnVyJTwKVgZo6RFIKYGaNKRmxFpuwgOU65AX+vUAMOI5sTFkKZJhmX7uOofUCOqdjRd7DR9ldFr2mxOq1XNWL0TnHkDaujyEGZ6XUbY3Z3VbgAQWRWv77COAIEMoIm2chZbJBuShs1QA6BqYAeGWcqnIEGmitkXolQNjdmr5wYI3kIKeuogmXm+XuaaYq27oPkTKlMylasA9Lq7qOArilJ4Ug4gOW6Ie47UCpzyvpdhG1qNWsICeWZRqqqsgQoOIidAswBirG2n1XB6WedpWUX12SvZd1nykOwNkKa6SpBty6ENZMYhdCWRPAiA14SXqzp4gBzpe2UHo6BqadGuFFDAwzSD336RoTBq6I286fUKqzvggA+GJclnZPmRrrq13uu8qPBWrPSrMpfBjAOh5Iafasz6gaZckR7jaDwXonfqBJkEVbVu6Ta5WA-vspmiqmMRSDmKzvg8D5uRlg8FQ26ahq4dtCiqGChrIwMY51GrAEvqcFbQIYqDyTye7ljAeKg4beAnJgOalOjqhTowGtCnXqGaENcBYQAj2kYqnWCaiApQOJXdclQOwNobr6qBRoYD2WygSlX+Atzt8UojV8o4CBeYcdJbvKVgQCBqRnaq8VVbiCioZoqjRrHHPKnviHIvqwprSqR2vcbkAIKxkRYZ4gk5kMAlBM8ohrvBQPXuWCOmwKBasaA0bMAiNSvbBa-aktrcDaz-KlTZSg7XnmGuAfCW8t17kpT1qRFEtg3YONC8tpa7Oy8te1gKRwPgnBKX8rMWTR7nrCYCdYA-Q3oeeINE6zpW3pOEkWO3qTrEeqHgvKb6CgGvLqhscpA76JmiowCfK36pcvaW3hTIqKmKKXABlGBcUtGgWbzQFrFOLAPl66+K5ttAYABSt4CmKWrkupweFAOsragCikXK26datXrVyEnmNpERuxv-KJa2Pt0m5y-KpJ1AWUcmYprRrANQEguA+oXZYFCgFa5wlgLng4x6gHtiUbqUHpAo7JYHqHIs62s5nmeKQ+VIiwhy8oaBC2hmvYH6auERhXuAHzpsB6dPvfFaBAB+08kJNaiFyVi2NBbfbUbXwG3Lom6sYjVqBaprnUd7hyjmmzqT+ukAzy3gPhkeGogDxEfy2WinneAH-h2pxuI8tereKd+RMvsAQE9MpZ28NaPCIGR3Sxrx5T+VvHwhwYD6rDyDuhWEzyEcoSGzudyk-kS+8JkCoSmZ2XSZSLPqjQq82aQNPBgAy7dB3CAHjqs6kAYalSOWu6Rgp3vmvIJZlDu5ZsyIOGSOsu5ga29mf7yOuVhGadGT4WDrqAkqrZoexicoAqv6YAIcomgzrtpaV0mQIMpO6pCtttG+XeQKmZOQFqZqEJl-ggB1HtKkQGGqbRvcNW2mbTVs8KfJkTl+dTCrGGYO-Gup7OmcmtfFAHuDc4q3L9rkDYy2G6ZuNGgCAGCdEOdbajlehbbh44TL4A80pZqyqdQDMJcJrarqBm1gMZ17QagYHf6A2WoGbblrrob8aGzXNVVGw9mNq+Qy8nB6aJWB1ABolkcpWq0ab8bgaK5Mic7IXydfuE3lWUKcUbdmAIHJ6wWv7ZZacK-47ekfbLgL6q1KwYPa7YFAIA0DTaNagnKaIr-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-RqEQ9pRJOiqj-LheMYvEX6D8ip75yQZifepmAgBgeHqvpeSUojxVVVlAm4ZryrtJCAG8DMBzmtKqbVmkxADpaougHpxVeXk2bFryM4UYKAx-k2YROgAeypcWlrqWYOmq2mUa51CprG1G+oIH8B8J8ldfq3xh9tXJqmLmvc5GWFACkpCTHe0lqZKMKt8CqAEp7sbFyU20MBZmhFuoumBpWXfqxtyJpRp3+P3TZaFRxZ2YFK0jfK4NaEPx8+Sjw+zPPzZGDGyDqN5qvqYgrGuT-YQjXYIk+InwPBJewE6DwK5AdwCeWQAzPZKUAVmKlawxdPYHGMpyHuQMA+lfPxLqF3QERLsytqMXJoeYUYKeGtpJVRZLGJWEKLOWABbKeGz0KQkIc+XN7hBXYyzBMHSj+Zb4+qTnZcGSeITwYKAt7Z1RnKXkCQ6GeQTlX4JWqSmxTuGYKJedwBleTay1GdIzraTHRXBYBQCuD5RGaTbydAcKJgAffQXhIyLnqCSw-jINSMeQFL4AnJRfWI7y9xEzJlrAnTwhBeKq5TsomgID762ObxVpBMAg6cJyeWZqZpTZrTNPfzQzGPExpRcKyR2U6zXuLMzEqHwB3KMMx4gHryTORtRgAJQzamUCxkBZV6tFQErCeZ+z8eeBS3eIyxIdKbYDee9L6xBgyXyExScgVpT6ZXpwQKcq4GVbkwh+bFJwedBw3PUfQ+pb2qpqMVyHmS-SraXnxgRcVyApQhpGuZbTPyFNwZledSAqBXx5yaqY56EpasaMXL6xETTjweN5qZaoB5AaOK2bEuSZ6C5wFqADKK5aoD6KGTwpKQmr4BNvQ1KMXTFAMfKUGIGzEadRDlpCuKpZRjxsaQwAEGLoL6aGzRgBYfQThJeS2ApQ596O7SKLdpyGqamaApa4wUKAgxGOVGrY2YBQlOK95pfAErZ6W5a8HTSxQeaoAfRK9QOWIfIWtX0rNZVawwqQ7ThGLoA3fZE7hWQuQV5QhSGACz5oFeMJD5M1y03BoB1WC+w1OP6yKFJ1QvKFyzzpFeQN2BY6Y6CVSFaLYCT1QtQQKdny7OVAw3GMxTtNVH6uVPDQWWOCK75a4wQKchaYlSdx3ydpTWJK0b2GTHJjAH2KbjdopKgWzw+mCRrdWfWycFbozIKY4YBaUoJIOZwCmqUwAW2Ybrlpb2o+AOJST1NbS25B3y+9REIu5UwDTyRgJWGedQWtU2qZWMDSpeQgw4DVuwp5KyyqAXFzYpa0pzRRuwXnC6zcKakzBaAVrmBPIBvxFeJqzdjRHZQpKgaCZRQAZjw1JUYxPaBXRcKScw6jFVQY5dqytyBBQUANoJ7uc1TEhHQKANANqlpD6wNATSyU+J0wJgRLQCuBuxZqUJr7+BHxuZR6xYAT6pOhG0Z0NQZwxPGFSXdfBKxRTbYsBSAwRBAkq9yT7Y62YUz0pOB6gneDJ+qDgCb6R8avDV0zYpJzSAaf2qAeFnRuRezYnqRBLuRJXrROftI4mO6abWWvxYmZ2K1qHrSImK-SHeEIxEOf8LQ6YCJ8PNACx6UWa26UxTv2I+R+6b7IFqDLajWB9QcBZsz6GUAZC6Vmz72cpQhGBORh2LUzb2VYwceJfKVKehSvRWhQFWZeSW+E5aY2MXTU5fnTuKPlSKaF1RHzfCJL+UeARWKmz5zdy5mxP9IYpBQzKmVKJ76a5zj2ZNx5AUPbo-W5wLOPeQ3aJvLguT4yThbABmtTzSJycKzaqNExGOUeziKFKwX6ccycNeWJl2AowJOIjoUONMrtRbeKE7DpQ3eRJTnyNp63eEEwL+UgBnLVbwXKX+wDaNu5cLTXrv2PLqC2O-KeJWYriAIdQ2WBvwhFHgx2qGGKcAAVplqLkLEvW9SmTZLrz+bmwelI-SDeAxSp6ZMJnWHQ6E7RSwiOF1RoNIXyuqHDxSLS-xBmLoxwAR+KEqUlS+ea7IIrFqxEgM5RlqIZwSaLxTA7DRStNf9RaqSJ59RYVzklTdQkgSa5FFf6yIKCxDaqI3yAeHSRvLSoqmfeLzhqSa4BAbSTB+XS78NFdSWacxwGmAowNKQVQw2Z2yWKepxPaIXa+NCeyhONOJk-EAx7xTY6JFdpL3aZLr3PWML6aa1RojeNQBrYVIoxUDTb6T+THFD+odAKcI5KfMHHyPlw26DRK9BMpwIgCKLYpeSzd2Pqy7lN+T29V4ZzKU5ItfVv76aXTJuWbTQmKNtzB+aIxc-G5bJdVbyPGJszyPJ3KKKWLzApVirgqBnK4zQJSe+N54dyFAxheERRmmFup3aRZK-dJlRcPSzLNFMoLS2WZTC+Pdzj6NsJDrNbQEgMvKGqEn61Lb-Z5bNSzQHbNKYxBJTqdUfSOaO3RSeTtJj2RxwF2GXpm+EMoyAGbKLKKNaJKatxOKWsHqKJeREWGwJwlU3QSabGxYJauSPKITSSFBpxRATRAouMvx75XYZDANYqIaCMBPBXzTi2ZyzE6C5RZ+UpTRKbJTyBcRA7GanKPyYFx5BaupzKDxoXhEvQA+WEJ+AWhQiOKzaPqPzoiaNhTAaX7Sfyf+q5hXUqkKGbKghMz62+TSb4AxMrGdRXLA2B5wTqLSw5FatzaKNR71yeIwMde9KpZW1SlpBrRRJczQiBIkw56HBJweKwwqGZrxcaWswCBTVSwFT0AsBKJzTmIyLFKNKbmqfVwflKABGgPuxlBfWK2mUMAKqfJovNNnTVyIEFQjXdyGgG3yABVqzZQDZoFlFzrOyLJSsAUYxGhI548BJZqNKfcbaqMACx2X2o3AKuyReS07iITXQUgZTLPJNVL-2DABPJRXLrpCMLqBIkyx6cMaA5fPq+lKy6ZKVLywGF+QImTnJWnS+Quab9ylpDGIvNd8y4zRqF7WWDr0GEOwYVaqbmKAbwD6RXw0mR1QqRO6HARSBEUZB3z8BNPQFGR+I8WQ-xz-LQzsAS05muHeTQHAxRDOLhTRQt6yxqVQAmKXABxuYXL6BAEAdudBTU2EYDaKT8xbGW+wEmEWrsaG879KYlQi5UepqnST4R9DbQ5PVGxbhWBxjlbnTpmDarm2eeTWgRgAouPyzFyTIDCqWzZvmK9RheL7zjOJ+Zv6EoK03BRFx6FAwqqZNQyeKOTKeffxf1XIFNWUCIbpWMKKWQNTVyLPy-qesJ7qYuLlqEkGkGQq7L5FpQ+pf5RPbX4wMuIxTj2CeDpleyxKlfA7NTEhximSbR+9EyxqIMpzUgamaAaBZTH+VHJetSjTU5OVTmuSUoJTUfIYdQRSHqbbytAFqGO6KcJ5KGvSljRJotyCkBVFa0JclfJwjqCvLYfauQkgatzf7RPRlOBeIsQ-BTzqaYoSRTZRGROVofOKGoYdAzpj2B-JFeGbJk2UpzkALGJwpciI49U7LsHZeb2gYLyWedIAmKMMLD6U+qP2MACSdSZQflLebWaaNRhKepKezRM5TaaGplKZsxWBXIDiKKnSABETwaJSJQTnGDzcaMIBuKNBR17MGL5XWFJ3WbuzkAFgKzlPGyqARDbNZPLzhKD0EyaD8yfyI3wDpOpQnvZxR15KrKZZb+RDnay72VFyx4FHuI2KOna0FYLKnZNUbqjNxFIGHLoeNbupleODwQ6VGqsAbcKqeG-RkaW0puqcdTjWL0zo-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-DJIIYuKWqZ5MDTEGQBRbxYXyj5aCyhAK-7tAYRSWeDRJIgdnrP+T4A42KEoKedwKiteoCE1Z6zQ6Dvb6ubRAK6XuYUgJ1LOKTpzyGHwxgRddQWKdkKgkifTKqSBE5pGhIShRPTQuS2zNOVD545SmzbZbnzxdMhST2WoAPKVrZt3JGxzlIUBOWD+SvRe6ZzVLuRg6JPSY6Z-EGlVkxh6KGzotGpRolVgCWacrQ4xABE4FDFSVaPqpWFDuqJebxRDeGp6UGXLRxBUPREeYT6TWQ9zMiY4pzonYxU2aIr3KLda15OrT2BKWoWlGbLqLJqbn1ATQ1OceR5bMDxHdZzSDAXDRGgIvbSvVvxvyEYI6Adpw2qI7SOxDoDDJf3zWlGTR0OGcZchL7zqWWwxOZOnZ4NYoCQGCUyNaPcpUKGeyqGR8yIAL+xHo8NolhEOammFiGClHAb96JsKaeLVKaAGzTMom840ATqLDGPLRqlVAwLaLzKDBUNLyAhgpWAzhq0jdAl1RShqCICxo8AbdQ7omsZcKBVTjhJrSsga5yARYUY97UCLzpPFSaeT47w1I4AGVPYB72VALULYwBXtSYzPZY7SM2AnrrdE9SLmXfRP-MtY3LEHyNyDOTbDLdKCIYQA5dMApbpdRTQAM0ydOP6y53euy4RB6IZyKACfbF2ShpVBSbbAnT0FIjxV+EJS43Zb5VKFuzp5c9Qt7KsxhhAcwUTHSR3YlawwKN+xFqEQC+KHeQ8pYYKJnYOov6HUwjyEYzHLD6Kq5VdTSZWTTWKSQaTWEMoa6LcL3WVUrotHawqGRmyo5A5RYDYCwnnJWxCqVlxQlMBp7lG7TieXzQ9DDCJ-tGUDKpR+JpAcnT3pTkrpyIeLz4vb5QmbEp3AusxpeMmx8uZyxlqENTgGDNQHhL7xJLF8wHo2GIRDb5JumW7ydGRDa4zOtrbNGW4raKZxXucWoFXaTxzoozSS1G3SLADewHBXIH1GQZTBZORQLWCgDVKD0xobI0K+AdhRxuVm76GSjobmGvRZyQpyv+cXwD2DZSgZdgzyGWZQcOXDLSGRlR3qRELpTQ0ISGYnQ-yPLwCuU5JtGT+yKBApTxqdRZNxZrK0mauiOKI1yCaJUxVpcpSK1TlT9ohgzOKFHoV2aAwAaZeyUhIVRtuKkb3TWHxLqB7z36WADfKMrTtKQ6YoKVrZfNbYxC+PDxGgD+r+qIKK5OXRThmQ-w5rIDQPyCz632GcYaIUHxcvVQAPWBBxc2YxYZlXoJdBL0JWFTnQJKClTZORcx96RqyIKCh7KVOPx9KbaKFuUSwFXWmJ4aCcLPuSmYsBHdF5ycuRplGGLXBfQw6SWBq3LYbzzuYTyryCmw5lTQwihGOyIbHWa8edpoZbfTKYGKmw0bQMJ6pHZ5ZuZ7LaXSOx7lDkT5GJRHZpX5SnpPJSZZaYC6teI6MRRTyKLAQwqxRqZ9ycZwHWScI51KpT2VBAyTZN5y-2a+S4pPdzV1JaJeRHhREdADTfWTbzBXZbQKGGmpoFfwDvWECZYmURQh2GLQ19HiKbyHizQWCpTLha4L6YsKKCBQ8I8WTHLOxT0DshSC6DGNwxpla2qN1d3Jw6MbqBhUr4xFV0zMAPeSHTDpQceaAZq6MxxU5YMD4Ra+QYpWxSHyD5wzKM0yxhB-JaSa1T5GEIy6mFOSSGKk6yaAgpmfG4LKoy-JWxKRL8qYSJxfRHQBaN-RkmbJSHyLpwUqbbb9Y4OyV0M0wsAH9KOeaDozGbVw9pchK9zIgrfJCVwg+I1y5yUfqPGKIBQGIZwIGMFS5zI4Ka5e+yxqT9wnyO8m6KcIyEAG556VDeyF2SQZ1LXlzpAETQARZMyoleNyRKUawqxdpwiuQtSfbHgJAmH9x4hTPRqWVORC+Z4JUNPfQM6Rax7ACUw0AYT4F-cHRIqXOY7PB1Y+mVKyZadtwaVLhzgqewwR9FQbQaSVSApP3SXyHBzUrAUIsTXhTxvfPqFALEwxKG1ytWUEDRPQ+xTBQfSfKAJyVGSQlNha5K5qPIB-yTkxRHf+wt5V-zTeThQZ2QBSyJW7IUOfHQyAd-SCafLxPhatR2JfAFyqG551GQdT5AYYI4Ka+QsAdeEpVSKzv-eWLkWWgryRU5RvmfUBM+dMxV3ERpDAEYE9pW5wIOAgrbbcMDM4g-w0OY5wSaV5T4JfUa1+HnJ+QG5QU2Q1QSaWADueAVJcWEqJX-bSL-1B7zQOOZRSgbNZEKSPRy1EOzRtDTTp7ckq0JRZITyG1TTaWBzDyRnTxuITzagVtKKQt0wK+Z5T4JdwCNBPGz3AKrZBVFrR-6UIAt7UZ6o5Jiz3PfRSOxPfTJ7RHxfWFTwmrV7RBmeQpjeNyLgxY9RlecYIzObowzXa0B0qR4LMWE0AXyb-Y2uIEwNOSczZaMCKx2bJLAuBYB1HQzSRqAjza2XQyZWLQ6UmEZTNNRDwf+C3rjydMpFjV4q8qGDbfWV+QojTZHCpEdT+GZOzVPMqwl9N3wOrOAB7aa5T9KdzyU+blSMqcqns+IpRKgbQKggZMpLuIdxVI1RC+BLzIZlYJQjAYFKKLKl51+V7SSElFzimE5YNybPS5uL6zLqI9xXmNaIuASXKbADhyTWYvKw9BJRmGMAD0aeMpH6E96fyGyxr6TabbuDoArxNR4MeV2Q4QgaKI6a9xq2Mcw1aSMDxKV0zpaeKztABjYX6fwAKOOYx6hYpxLtStwHGNiKIaIrbjmfSED6aWzcpXLT36Q2xu2WOYTmNRZMeJBb3DHxK4RYVwCaORBX-XuZw6bAA0JfABNKSzSHqfNxRHaMyE6QhL6xH2p9uNUopVBwqZGBeTs9cLweKIuTFVAnyzGIEDxaU2HIGK0oYdHWw6ufKo0WYNS6KEOSDzI2KbHdErDqFYpeGNey3rAoxABUfyM6Y1w3aTPIQ+EhTRQ6SpSRYLRRraDrRQulxnaKwoARFVQK1Nu5wGJJq-ZalShyGa6-deewu6VorXhbGQ49Y+SqFPrqQsrxzxdGQJt3A2JTbd6JIQrUJXmaNro2BDKxqGJ5zRRMZoFTY6kOPCbbzRTrYKE7S8KWW5ThWVwn+f5S7uSMwXnO-JLRabRgObjS1aWoznaO5plOPLKPmGuTFKAsoUgXbR4NSDZhbY4wf2SrTuKJeRZuGOR6dX5mdATxQcQrQ6NaMLQvyIjzNNalz+qMBmnOKoz9Y7ioPyIAEsBPeSzmS0GxqDdQZbLwBjKHNbTqUIyhpfAasgXNThefxGm6fOQUKeTJ6JDwyQGK5w+tRzxgqNtLADJZRfqJwycACrp8GaJ5HdbSTtjHlJJVASypmM8zrGU-ym1NNx+GdsxXIgbwamW0wA+ZVwvmEgyTxcBzCuGCpL6JZoiBNSzdWFi6ljAkDrGZIzvwkvKvFNgrOeC6ytxEQL3xC-Q5FXVT1g4tQ97PlKyKRmqJlB1RQ2fBIrWWxwP2ThTdaSrSBgBvQvaLeLbNZzzK6RFa3yfwax2RUKh6FpQXmahZQlWRD1GUeAchJax3jMRpN5TYJT2HUwt1M2z35FBKE7cny5OWmKRqeVSEZGo5n2HHofUx+I0OfRAZ6NQH4fJCKpMyfRQ2KxIPAftGkOP-RiKaQBxKCxDlwmjZ5ZRjRiGEKz4mGpKJhYLT7uRzo7WOtJ8uFMwX2YZqwhDJyoqY5aezRUzMBMtTwmFGxHaEuRQjGSLjhfkwM5QYzx6KP7qWRS5IRVbQP5GNTtFGRIWhMrTyZJuQjhadTcjHWwVZA4IBJaDoD2UBSz2FPSCqcEIHnA6zNWT27GJJZ7JhOxRfGNLlqPIYDlOEOzcqHyHxyNWZmxMwrGJXzpYLC9SpZXTrNqSQpl+dewrFYTwL+KcrxyN1QfAJRYeBToBaRNABQGKX5nABbQelVEaDKK5w+KCCosgwrRNWC6xi6XOomqG1RdWFr6j5AdQS6KvynJPPw1xAkqFw2YB92cwoSKQE5kKWNp+2LrF+WYnTBgRDTLeVkyeY4AZh2NoAKqHPaWGJFSmqLyINKRbxPmVuTKgcRDNATsycFFKJbeAuRbzePKCaWDqzmFr5UjFfJ76dlRe+cbSE6KorOBfDIjyba62bdCbtdL2oZ1EpQnbFkwkeLcJhRA8z5ud6LSGVKyyuJZRqIW0qHhE-STOOpKTXGpRLMyQqXqJQygGCRSrTacxaqbTTH5VEpLMvkyPBC6wMbaZRbXNnk+JUpxIhCuTLKG6ylpcAkt1N3bxWZ0ApRKTLKqOxJoAL7qJFcdwjmdKJHjMxKeHXfR9VMVTtKVPrJyMz5UhE+TMAd+wQ+DfJTJRWJNVC84yaDhy7yYHZ6VCMBOBUozgBRYAuqLh5m6KfwwmVAwBtFVZGxDtrTeHlRjaAfRE5aPQqBHJSyAI+FS6RYABqC1y-KZ1QO9KlbV0FuHPODXzsea0AORZIxYFTwCOeTEpbBfwAZhPHLB2CspBFWhR62dSyMqbWYHnd6KXLBunKKePJ+FWCzq2SIDR6DoCfAWdkqaYUYBXCAAWtV9RumC1rwKPCqIuezwa2LFxy5BuRdeC2wqRDfwExDMKzpOgxciTqyEM-YyFuaDpRgy5RwPXN6DaPhRsE5wK0jWWEGVMIDp1NWxFVVOQzGeIxwAMmxcaeQI3fbpotDX5lAgPxkeqGCIEKExQyZNvRSubsxMJFuqyRDOyKXYRQVTY2admSBHwAGp7GrN5a9-QZz5XOVpqxQ4KLmCN7-mWzZqqWVSCMkbxZY+eQamF+RjAJIY+yN9yiKWuIYqU4zhBIVS36DQrvdURRAHLgCVqUtSlaNyxcLAzkGmeyoUgEPQpVTQH1KCHxxXRRT0rSPRYWTJav4rOQhtK1kkyXVxClZXTLtfrEiDSRzyVYuw6hZRRhxay6HzZY4PKfBQcaX8yLeGCpTGbXRvyLrTPOYHT5zJ+QeYiILR2dlx-KQsI8WfVRmfK7Q9FNkxdWG-RRgt7SCBKswceMtb8UynTjtWgaeKBKIReZbRROLYnOmXiKK+GCJVIsdxU6a6KZ6VwK5zSULQueFQDxaAChhPrGf2Zskp+eZbr5Kfzkaepxd5Vire5O3Tq+NuRspHVwV44YCFyNjIOrEd7p5c-QnKMQzjyIWr62caL2JDkwl5KYxnHdtwTyNgpjaNHmizbNb0aFFRrKPxQwmaDoUqOlR4hO9QduCcLI6YSwC1U7LH2Y-IVGPLptmTsL5GINRHrF9pobPVFciEModOLVIWKAbTXKHMyXBXRwNaNLwvTTsryqe7RL2XYwPyO3Sq6OowCpDoD22LfRbVFpxEmReQrqMWy0LMxSOOXxQeHKAA6jJ9yiFc0AXBJLF6FWhzGRW+RqRKhSrOIeTHyXnQz2XOSclFZQFKA0w2mMMy3LF1RwGFGJYACxRC2ZdoU+MWY6jCSx1HBRGGGLMzTyXzpHo3JLpyRoBqLZtrEacMYOOT2YDFTPqzFQhJk7IEJEgG9xspZqZZyQJSBgKoxXaMLp3aWywiAehT96d-QZnJKLXXbmxThRhTzyLa5GqEVwtaR8wDZTxKl3JywZ6bIKdhfvQ55cLzZ1D+yOzIM5dOGxLVVFaxyIfcZGKZcLxWDS7w2ZgJpjPjSSeDgID6Y0D1mduwcAOdFc2GCLfaF9RimPxJtKKJwzZWAy53dS7wefPycFKtKE6YlTtYnclCQ36z6KFLxWrVRAuhZE7UuHTQXBceQemJ+weHTIBauISGLuVdLGKCHTxWH7R4NfDGSY-LIDOIUr1g3jzwKLeyPOFEz2eZRw85JNzmBVaaMaZLThlJWxZJfVI0mdPI7ctswAWOoJcLFBLQxPnT72aRJ75KJyxRCVQhhd7oFGNbSk5LxHX2T7QwWKYxnyOPxRY9RSyITKIRgSQY-svrpgRaoCWqfAKFKXYJYjOCUxGBlRVePLSzqA7R6JfDJOlDA7u5NtIfbZRTbqHomaecsxYJGLRClMvy-Mp-SZ9aAwRBbRT5C+pSuqa0It1QYDGAJZp4KVEr62M+IpqTuz9KASra6d2qE1Q94N6flRsmDeqEhNezYBf8z8zEOx5WT9xqssPQ9yIyKUAQ1Qw6DpIu2I7KwacZyGOT0Jw6N8zXGGMzR6ISa77eTJeI9uQ6RTSabTPAqSABY4Tqc2yjyPED+GMWwX2WRTS8gTSbRJpSaNcYIxGbl4sAPYC3uXnw4OVoqnZXQxqlB2IE+LDThuAaKfGBhy3ZU2pEeWBICVLvZFVRIyfmcNQ3fC+xiaPh6CAZTwHGDdIj-ZbzMKIrbiKFPK67Fr5b2JrQWKagBmKe7yNmDeRTlANqhbFXSBGHIp5wypS6dSFT4qSjJx+DFTpaPRq0OMTa3AdPT-lKmza+RTpuJRsIp5KRB0OO-SBJWhwqResxmxaloHZWmK2+LjwqKYHSLwpXq6GfAEWtaAou5H2KkaEow4gePTMKIZThGUOKxhPEy3xCFQ9nELriaW9SDzedRR+UwK3OGIJ1GTDQ8hfIIReUgDoox9SxWTFROpOk6+hV-EGWIDTGLPZQvKW9JxDK-QoxC9xZySTHLqSLSl3KRRryVyp8hfjyFybBQ3fQtRZyAc7rsrIxfBKBzE2I7rKvbEoq6dhT1WA7zbqHWYzDfGzLeH4ydhRwVTOcvTiee4pTwJ0wCpJnyQs0sZrpF6aetJdQxmBRQTyaV7gqAkx2gcNxKpUKwSpH4m9VI57DdTVLCAeAD7FNYFKI1BR6A5sm5vfYrQaap70GdOrDuDMynlajSEJC0yvaRJRdOLAr-qLXQkgLPwxpGrS32MuScadWKCIIYxK6cuRDDBREWIKk6qaPoxsE1-Tpaa4wF2DMwZDKWJ76X0b1lGgIXeCtSUaK-SRZfpQggyQwwAabR-qeBoAlSQo2WTxynlRuwmqZRzPOMOJt6YaKxKKbym9RDwUPXZRU2SeRE00bSV6brQ7eNSJ76dbSm9StQP5O6wChVa7FyHPTn1U9zTKcXYbWRBzFrOCxsi67JhmanItAPixRmPjSg+fRAmxcipmqEvRIaaYqSAXxmNtcJQJGIgo0aJEJ2eR6wWKM+xaOc+peAI0BOaUFwDlUep4lfFxUAIlwp5VCJELe4APqQQrnqVa4f2NWZmcmoY8Aa4J2eGgBcmVjQNOfVzieD0ypqPDxoWI5SRabGJvOTJxx6QwDy+SPTA7YpSQheMKgDEBQ-yNs5saGBpW2W4xaOOk7vVA7ydRTMoYVAvx2NSNybKMCyYGSHy2WZMqN5EULw1Q8wWKIcYy9f2IwbK5SEAEFlOlLrQGdXnzd+ZH5ZxZ7K8+SRA+aMhQTnWlSvtdS7b6Pwon+IHSumSQDRqIZz1xInSWZcaxW2VVQHRSKxwRNd6v4qww9Ja3SxBcALrePeQ8mbkrgIwVrFaEn5OWVLybBIszoKJ+RVZbIz3PHwCkaOLxWsyBGI+K-THElEbOyP5TBLeYwzmeDyuOGgD-qUNYdtQCIU+ZIyxeDPRKIieACdFkwEgHQChqVxRIReUaTWBywAKcbRuJd+xfqfUbjheOIeRRQKZlZlEt1cOS4y-2w6BBvKo5R8aC+V-HtqHjRiqRJrZSqhXv6fObLfChRqeDOlS1dLTZBHtTTuIA7sJTTTn1XSVNOB0IrxYwyitZH4qeb4BgBLebqIICbYyFCwLqJ9zi6PuwlqUwxwmVAIgsquwsAI1ROaKhRYIllSfGLMzWmTxR45OCIaVBvS9grRz4fYno8qHPRwRIgIXuf2rfWS-KF9DpwTAbDnmqGrJ2NJDyoeO8nmacAIJ5JRzPKB8YRRZ5xnOfCzF6JXrVxTIDimXs5yePIL7uZskjqGEye7MCzgKTSbSWB0JqAVuIOqK1bO+I0457NL6n2WJS7uYuRAg6QwmWWypapO5rQqHQwzybGICtPUz5GZlF62En7JmHorB6ZVT5yH6U2GQMB6Nccy86cZKweUKyhKdxT3tN0yCGIgLtuYpTmOMgJzyImyG2Tqr-qC7Yjyc2wAWFurCKEkCaKJdIXpD+qm+A-prWPqxzGDsEt2Q8JrUyrpZGC1Jb8z2r5OAzwbKFJRYy7lKO6YXLUZb9SThIbxO6JBx3mJRwKAB+zD6HwyEWNmJm2d9Ks5PIoCuEHqApYPyTRPv6aaZqw0BUlRoGG-R5WUtIS+JQwDxEmYoZZSLGGZsXe3YyxuKTOaWKXDSNhOFRKJLLyIONzK5hDDozuT4zvdN+K1AP+QOqXEZ8KAbz-lSzS3uV+LeAeKycNYPzhqI+wZqau4n6GwK5uOFTvmXVpIgS3ycqGhJBKelQdyKNZTuRZqlKTeQPubEzRPAtTMYtzTO+QdzV2W0oPOMMJXtdIwrnGkxDWNA6QIsWwJRETSE6UNW+QICbame1IZbWlSMJY9xWuX0DQDS07HyVm7QdKuR86VSxhqPwzbzSaKzGQxScGRxz4GP-TVKY6xgeb7RC6Y7oLKH0HyRRmxape56wFa1SfAYFzseQXTOBMwrNouYw0Jb+Q3RWdyys2RDYGPKz5ygaw8FTca4aUNXTTd+QG+Y0BZyXOKXdePRFjeHTZpP0Kx2Dtzl2EZSdVemIMgVQUd1WW5FAHJmHmbPIRDLwD1WerRygST4zDQHQryM-FSgRqGROawx4aQmoguIWxGhG3S16B6wvtF7K-6EwCHhNu49yKkZVFfHSwFGlbLKCHQ9LOPTd9bSJKqcYJJY9ZxpdSwK4DInT+JeVTdqe1Ix2ahRkaT6rDyfrxyqWm4SqYMb9OProhaGmrh5DGrKeVWx5hdnpNjeJT4mciJ0GBqyXAIfJYjTdT-qMozUxEeJBVbVT2gVvwrGA-qqWetzpaHQr++XyBg1I+xmfDwzTASJ4lRZtQo2Zb7hOQcwBJYNTX2IA7ZGYOo9DaXo5FcALqqXg6LWZVTEFXRxjdFYyQ+CnRvueMImqNUpYHUTLWqM4axhZeRdWD-KxtL+Kh2OADpaLSQhpTZTshCgC7pdZQlBXKxZGYpyo2C1rwmJ+r1xQzQHqTY5YmYpTwtcOQwZQExWGBRR7-czQU6Uwk3aQbQ9pOUBsFdgwBJLH6hhW3wmhf2q6+WSLtNCmzq8rpxJuO7ytNdpKGOLQ64BLoLgWaLR-WQ1QNWa+TSIDkQIgJlV1Jf1QX2F-zwKX-Sj9Y6xLORZzvwsrzjabRDhJRYx-WEMK26F5RCpQAwipeexHaPdQS2IcZNyGwLn6Zp6TyFFFryb9Q7mKJRd7C8JS-WmKSgc+qN2fPo5rMux35eGzKWesyEKJCGHqbMxYFWuR4FMKmEWOZUf1eJxckrWzJucGKehGm70orRzW1fjQE9AuKPdRwBImJEqYlEdQjydkKq2TLKhhBxrxBEmwWGd8wPaUOIn6Eiq3mYxIaqzjqd+TnKXDWBzInThqtmH2qCafgL681Kz72SYyrqBZSNhLBKjBSRxSuVFyuiwc4WGJ4yRRZMLDqM3yFAkyxMGJfR6pDGmPOFnR+JHixLOIoz+aY7x4NQiY3aZzx4TPtw1aUCJwAMBrqWKDz4AUE6EWUiGm9P9onKZ0z8mUZTLuGHR1yZVQ4FNPIrKEioDGHRCwADUpdeMBoIxWTSfGSADYAGpIGWalLS2AXxm2PzSwWUArqXXnxaGSQqZKdiLUZQFShWHdFF7YeyhKNCxfyDUq2lGFSuVMWm3ABY4u6CvHxaJaJDrMzzfg+TIoGaxQTnQdW4BQjKpmYZwRBRdy35FQLXeOIKGGOAKwhHQoLhe6xD5acI-jK4z75OuTexL6xkuPeEN+Sa5k2QIyDafJp62CvG7ad+zANH74JTZtQbyZLQ1yOGxOUoTyp2HuITqcAxxmeJzYpScKmfKoz+UtBp7BMcot2fBxkKPcqxKR5ThOXnw7GFdzMieDr6qr7mimQ5ymBAUIoWHSw8XA3RpfSOw1tcMZsxEgxehYCIJ2YXzKYybRWKG9yk6R3SzmNxSQXBOwYqepn4WEmy3KVxpytVZyp6S4Yt7e3qH2BMxOWbQI-aQGIxaScwwq4FKetc1XYAW9YX2UYIiBV5x9KOJSgRNpJ0GDXw6hAhSJeKuycNNgK65RTRi2XLTy+OzQP5AdLpqf6rvwiGpRKXwB8me1zUAELxbPSBJqA6TLbxSeLjyG75vqZPYcAQhpcWMZQRRDpxlg2RT5pLewA2N6IWeTRRBfGxRCTGeWHqC5JLyBECa5BdRDeAVKZ9O0WEZXEAp5F5HYFc1ybyfVyOgLvGfVMNR1qJBxNfejbddXexE+aIrWmFFG++XGVLqLhJ9VNBo-jVQUcaStz11DCJEnNYw2aZSp-tNiJHJWYrmdYnnqjJhQz2EsIYKJIap2fuks6TpxtBODwhzQAws6f8LX6IeL3eD6LaBT6zGOSJ5qxdy5AgV-HB6edRqLNazRhKZyNqcHQsaDyITY6SxqKpRFKGaV6LxBOSO6U2rZKceSK5W8z0WSQnJlG4DdKN+y-Mr4y2bdxQn6atQgBKjFJKYSwRRH+R5AFpzEvVlw6KC8JUAOvS6dSrSIAcdqmaVoyMPfCyw9ZMpsMtXQHhe6xUzHs5qBCwyljOaLGJIjS2OGvxHyFJSyWLPQgGeFokOJWqf2TxTECy5ZGuSBI8aRByyISTqQbJsw3uby73hM+zqIEzTehY7rdpA4LDaaSzRmTXyvOFi6mwjurEWJzRj5BRQF01DxdAN1x0BHeK67aHSfGGzT5+eupOhNalXxJsyzVRjwhFetyfefQJFJGuSHeVEweeefSVGcxRaSZiK77fGzsGetyDAB1QeqeQwU6A7TamIeLfM9Br+aVqIBAXvzgI-OVobSNRS6+eSYaJ3J+JRlSQhK-7hjB+RN6CVSLmKrYcmczy65Kna76NoADaBKKQhKVzIGDrw6GBEDYFMQqEmIUD3KRoyyWHNYpGSkwfWNRACpBLGlyZgLGLfjG+GpVrbhfjRgxBOw4RWVzHAdRQjKQOHpHMmqptUNK1WPwzrOOEqJFLwXbeQZwuKXFRG2XeRvKV0wRLb-yla2ywSGafRRg9QqOAU2oaFIOyIAGXo-faOJbAfqwTKeHS5An-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-kKeKhYBrBKzRvxWRQ8-Kdy0Ody4GgakAdOfEwguc+SpyAVr3KIKLCPRsIpxc+TmBAsw1bJWwjqYxLFdIEJ+KJ+xKgO+zxKUhRN6awwTVb0K4jQwxYXPyxfBX8x0BXMK8RNLz1xOPwM5SgwULUjQMlVoy++MpwyDB1ahGLJw26bbw9qSZrrZKrKSlHzQEWJdI9Ff5TV+MwE6GdvyHNaGL-acLT-aanK5rJfKGZXsG6IYfRZYokrXuH4AWmKSLfFYumghJvIMpIBSRGPYI3OrkRr6fhq6WEjycNAyq3LFJXHaeQzTqEtIqGKbSjKKxIJmKcpjFTiLw3JQw9G1xzZBfzRzKA9F2eTeSPjQkLLfdjxvLG0x3mZXwvyCgK-ABAxsANPxzlbaCfJVHq-GMRQfmGm410OGwGqXSyTuQKwUPLrzxaYtKWKEoJ8+VXTlaZwIjyORLFxBnQRRHTR-tagIUBVkCRGPeLPxNd7YKZVL0bbEkbKItTZ6HwxAzIOyEGY7yIGaGxaHYnRJONizfMgkCDaHkLkHEXL3ZMmqNmft7t+bSLYycGJVKW9IhtDAI56fhKXdG0zP4sORDxPixLPPwlZmTYKcKfLJq6INyh7bqrmIICwWRJCEHKBTTKVNTKbqOhrr2QZRsEqhTCpKEZtmYwAJeR1R2hBvQV4pJycRGIwdmHx3m6ByIGeGywg+G4WOmCIaQs8xzqjGWKg+Va5Iqe57YuexZ0mBLVllTbbe5dHR62IqzYWIXyxxYixJGWszDg44ppeM0zBqKmaSKCt6FOfAbtYhZyjPDCy3fMeZJNCgAQmFuT-mAgDueFbQ6GQ7kZ1cFSneSezO-PLqaWOExxBVuLlXW7xBWRDRqBWDzHqLLR9yUxRNaZTHc+b7Ib2IHpT+Lbw4mM5w6AXwCDmYCK8pFKJC2NtpJyBuxjAvf4l5fQwPyP0KABFwx89OJLKZe5xYFM5yxKedTNBaDS4y8RS5yErTa2YSzluciqneHNJC2GcwvtPEC7qcXQY1CLKZadbz9qQwJbeezYvOZMoxKaTKKm4Zqi60ewAgQ7R0TaIofAGKLlqKzaaabebZmKEqfuWwEKGE2JuWQJT22ZtrvdFexoqPqK+QE1R+2ffxVFV5TggVGzC+GOVUub5wl5TMHhualp6pD5SNQ3FzP4xJqQ7GhTyOBkB-tcXRU2LZFsE4Oy9BEXwF+tTQ4DM0wa2BvLsg0XT8YyervqG4xrNTKw-pJ-JZeFc7hjIjpP5FeKEhBdTe6DYyoOdmxCmfUwCOVyqui8DbJqgoJnyEpbHGYHag+XFQVqAbSPaIdaDUwRxkPeJT22WKJsExUKVuYwxu7MwpSGHpROKbrTmm6IxXeEuyZlV7ZBVJvTu5diJMWYLKIAPoIu09nR4Naab59NYyp9NPSdpd0xHZd-72pcILHybHwRyOTxVKDDQ-im54zKPRpLpJ8yiyseY8XM1xJOJjbLOHSzZhT2bdGF3Sfok1bY+WEysQ0jQ6WXxRFWBoyeOHpTjOCnw1+Lizn1bLTCaID4jyT9ycgf1SaFJdz+1dMKQTI06NKN2HjKupbYWaAzc6FJSkqXdwd1VtSaZatwqKGDZlKZtolOc3xgWN57tWWLxYihrROlAc6d2E1Sv+YVKombBRJRSdxehJ-T5zG+y-Mni6QxLJJRHGexXGAjQpuKkpygHyAt1amZ2NYwwz6SRSWVL4DrXB1SiFM2y3rFLotTZNRWNUpT3PVqLKeQQAROI0DrldyzjBVgrNFHUZNmGRS9FYpzk+LuaWKWoDbhOgKtmb5Tn1RDw0AIXy7DSQoLmbwInLE1yKBcxzPJWaq5qZY402UJQhtUHTOKejSsqB5RtKAQIxgf2w3eRhonKNhxZioib3pdSxdGbkp3NK+YaBZopzZOHQ3KVUr9pbmqDGR1TwANmwfmamXjOFxzZ3PwoqxK4LSedMwo9YvTIGYMZj2HSzUtSBR-aeLz6aAIADmTjT7OfJ15qCEbrZVm6z5UILTqDpRQOQnR6hcg5bKSBw3eHgDumLGJ6FZowVuLoKzsydTs6fVxlrN4B+6cFwg-YUz5+ewKlaYPwXee7K51aU6pyRIz0FXOaomHAC5WDpIyRaU6KmMxT6xZtoqaG7wOhKwL2JeSq2+baAKGGIKQqcdySqPozH+E-yTXLADjySxTYBKkkO64uQGgDdQl6LJJ3jCUJTbEgwHGMAKoROqwdOTfRSgL1QElYoCOeYlouOfNwoWe6YIGQtxrFRTToEhjZuqaAyrXA+kPuAjy5WeeTvVEVrBZWzY5PSkLNZKI2n2AkwxpZSyZGNAMLhay52NUkxLBOLzCuNPSs3ZtpsWDtz4ZStRolC05sKZVyE6V0waAebY1OSLzwtG1TPJTELHWcizZFa4LjRYaysmLVxvPOZZcOGvpmJKFKSIS8JFclDSQKcGIlLZVFWuFOTCWW1IxKOHSl3Ll6s5ZjERGaOysVQOK1WU9z+FNIC2ORFps1VEyBBJOTAB5rVa2cZySgcuEOND0pr2JdSAqMNo-fVlTAKMwxA2TsJmAGaJATPDLDpCi6cKXEbvqIcaALBOQuaFKxMeSCwTnXUIIZGDQwOJfx45NpKkmNsImWfdwxpYaIf5OuRHAd2qYld9LDaEzKaVaWwYVD8o8qNNzsacHRImEJr5BKVzbuKGXx6MQrbZY9xrBUyxgKIIomKawwoJRQoLWCzRWxW5QLHYpSHmTQBvaXuTA6NSJfaMWbhmTjRsAQI7OASUB4lfOV3uA3wuWf2zklfPqEARXST6TMruqWnLFxKHxmcphS9FVPxFaH9pgKfQy5GC+yTRfOVYLIyJmZNgqVfVXL2uAv0h+V6JJGLMpk-FPJ7WU3RFbC0qEOeuTzLLkSn1DgBcqLH7Uy75x9BJ3JeuauzxvM-zWmMmq7pB05vRXTr0qL2olhZzzqeWzzy6QCxOgSRBZyYMDQWTbYkeXALz6LvHH2A8xqaTyVvNOxxdBfGzlmdDRdGVBw7etLSw6H2R0KJLRxyS2Y4JCXy5AyRAU6CYAGZdy6F-VXKdAe-xhGWjz32dRJ3afDJTwYZS5uIRJrpYyQFvYbyV2WGK-aYbrsa77I+Q1Tx+FadzCpNYK6m8ioSGRRTcVRTo2BOIIfmMh7hlS04-AGyxLNbKx7B34Bk7CVzdGdhKKaAaIBXcDao1akD2FE5bPcrxE+QTnycdHPJahPVLjARJJxWOnaXqGjQhtUfwchUJRfKdboS+Lrx26WZSrWJBQ3CyKJ1qE7Z8WeNz86NAo+QypTS1a6KS2NR7l+VBSDGOGxmKUfRFjPGJEtVYCdAI7qS2A0Cuingx22TGxvaD1TfQjzxAaFQo-pLYDJGFZR5abUBSAONQ7WI+TxdehRUY4brAKgmJv6HBIMdF5JUuQIzueOiaHzMGrVxAc7rafTRiFVQnZIweYnaUowr5AzSb6EOZthOSqax0Sx8aZ-EAZZTxehfUzbGUBRceL5oodb9QaGLZ6F6eGx3eVH6f2cKyUaAaJNyb5JnaOU4SpDeoHhUNY49LCXWhLh4ERFTUjvbCK5uDQonGeDpWo+SzUrKOXbKWCzRyMkYduACxq2O9RjlK1Zn2EBREVWsyVncMaW5CvHSaA0BB2WZQ01Mn69qblSHc+SoztIIHPxF2whReIyKmGrbq+dRQMeNdKgDDarVqKnR1RI9z19bYxu+beInytdIYh3exGxBaxgNfWy1GFExrU1poX6alqXuYTxsRNaw5mLCWlmVEa7DBWwyJePKCBXtSGZJdIAIqkzjRBOHu1bVQihEmYF7W3IbpIHTuAbHzDOJVr6jXYxOGZCKoBqGwo9APzs2KkpWA60l7yHQyAueuL6Q+I5kufkB1JejR0md-SdlETR4qX5kitOaoYRIOT7OH0Ce1ftEHrNgBJaXXy4OPLyjUu5SNhsIys6W0o85FuxPBIVS75I56nmZVKj6KVybmc76m9L4K7jAWJSGMnTuWIfK16DkCpKX-zqBYOTNeehSqRTBSOdE97GSDxkeY+GoemJkVAdOixMKNwlOZQdRa2TUDYuDA5mKHUJ3VQML26GLWReAWLYAchTK+XJKUqtSx+2LhJKOOrUx6CIZQy5qaEJSeCy3Ic6ZGYHQaabNzABHUbimCKyTfBOHTeXTpS-alz-RGoDP+Ljkj5WsxOgD-LyxAQzhGKrLZFK8wQOPZSBGQRz+JNbwxPRgKFAzwGReFJSp6OIJxyaQAX2aCx+AQeaxBPh6-dUHRTOFYo-uK1QOOeI5WOHRTnaIBQ+2SgxLMt3ZruPzRDxTZJnGJBZJRGTT6qYCLt+KxyXmIwNy6Q5pfKc+1sqQ5rEWATxFqHI46AIUqPjOVqHDIiY49VoyfaAyxoFbFJcAGMAGZY9Y9EmkLkxrxRPbNRSKdBPpLFA3xtnUJ2cgGYL2aBxqZ9XNSuJO4GSE6MwRGRJrKKFia4BFFEnAsBTsRFQDK8-MxX-MMLwqW+Qg+AayoBMBl32CqX1GY4ydGLJSiqTiyAaegxD5WFRHBXYwzBdPZ9JDhwQ+dWzgWRXS+aapTClJUO9xW8y6XHlJUgCpQ2jRdwbAKKwqRbnw-jfHSAaUTy7DeG63ON2wmaAgAxqRDa7aBjwLaM3xCyjXRImFQpA247qbTBnQr2SuhF2fK4tyADSHaZjHwtFLy7pJKKIbcJy8qCz7ZFO8klLZMKw2DTKgGK1Zbh+IwhFdnl3qpaw8BF5TNtL1r3PRgLuXdOo6BQTz9OM1zJafKJmqS+TiaFTRwRX33-VWBo9BDMx6NHp7sHLkLexJQ78aNIzXOAJJcWQ5zJaB5SWef8LGW5iL8BU9TOGFiZzKDEXrXehoamdhTkcq9R3VKGKUAWAweOXN5VKc3Sn+ZhLWJJzFSKFFyqRZdrraW9yxRF5TSAEeRS-UZ5PbGFpmKcdR5WKX4oKVC38Yl8zMYudReeCcoduDdRvFcgDK+U2Emqa6KitEbzsGe-aSlbJSdmWW7pWPgyKhCN6o5asGLmUjwM5ZbzYuF2ZcpHULmgZSJv2fyGjBVtKjHQBYDOQLoOlV+R32dvSC6d07VqMrwQ1IeI6jEWpxmamb5mX9Lg6b0JTObeYOu8tTs2STrOBeuyD5EbyUGU4ztaLlK9zSQA3qfA22qOUC0eUSxJNaKHJyEcyvWOKyAeO0IamDGICtR9Q53RjwS+KZzqfd7QgqJZpe+A7LamB7x0qMDR0TYHaNQhZTuuUtR2gOzUO6O9zexfZwYVXoJN6AID0abeKhBBRxJ6bMKl6fykvaIyaAjFob26FwDXeGEzPZBILlpZORUua9x2JG0y03CsIfbKnbDyJBbqFcWpUAa9p16HNZLNBY6zDEeKXKJKoJOBgpheN1SOxaFReOPhRDDJIxwAXZQ1Td9JxVeXSrGKJQuhckA6KNzT2bQRBxVBMDvdXYXTFEzT1qbaIqTPDLr2LEa2KWkyROWPkxgJ5Lwmf9T7uc0xlyO-KGqGrR5BIEBSLay6xuKBS8gYaEq6JeSKqT7bRWJeSw9LkIQjS0xxuQ5xEWVWy5zcqo-XMlxHeeuTFWC8LqG4FJGuVLpraBuQFZn2prebhRrGGrZLydpohpPHI57EqLK+OqrbQMACVdSxSYAbdzQaUUNbXe1JsGK7wm9DLpAqAYwKma+R1vceQRmTjrAWZOyG2Ef6IAehrqJcMqClVnLaBB1TuKIybvWFYw5lDuRjFYLwNWG9TYpKxpryb3IHR+GrrG39RrUgQyzKMf27RDzxD5Q8zN2S-L86ZfUU6W+RiKYGJ7lGjbYpOPSaZWdKVhbeLtWFAxuWIJZ7pJzTqhXYVLAZcKDmCQy-qajzPGdH4ZyUxQTheuw3RCMOtmFDShBd9QcAI95KJUKwCeARyUzF5rrqcMaVuXkDIRIdZNTCAJn2KJRcWVNr5mX0ZrvIKyX6H2RU4mjQYBTvzjRCSxlDMPQhzX4Iip0tRO6K8y1yQfQ7mY1Yt5aRIyeeBSBKLOwFBbAptBI4AJeWawm6BvRKmRDyKmU57l2PbUZ2CaHshYpwqqK7k+qV5xN6bFKjfS3R9KLaoThe5606fWWExGbJ9RXhThW7MUs6WELRxaoXYBQuzTTIKzV2JIzNeHUIoKVtJSIBIyENfOTupUVokeBDK25Qib0bXdKMy0YyAGEf54mRZxE+FJVGgWzSK+J+Q8FWPkv5ehTy6BlKKWYxyiIxZI+2FkzK6GrR6JVPTDpSyxjzFdSAjYdT11C4LlGhJRp+QcxRdEFH9qZUBa2BMzJ2Lare6ZvwDRfRCnJBfzo-J3TjuJBYwGnCLBqSHyVjFNRS-Za5-tMVqKBOiYzefZm9-bGIXnDMIBaW9S+UsmoShEvw1aWHQ65pRJf2aOK7lAnrkAI3QojUmz0WAAIt7GNJ+hYBTjZLNwaBfGywTN0Z+WXexwJKHzBZbIxgeW0zIKX1Q1Pfew-uYdyYlUermeLa7P2BxwJGfqy3mIlm3xStyHzNUpZAWtSvOWwUUBLgyMBRoxj5XTp9Y6lytpZslRqQjSE6Vabm2LrwXWQ-SbKF6a43WeytAJqY57D5RSqWfKTWBWov5HrRnuv0IMqUercqEpS9KaFTDOBDLz4uCzfzQWzXtXULjfYzrZaLDRu2ZwKRGQOLvmKAmI6U-Qk-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-Walq+6TvSDuRAB3NYSFY-DYAh6J1IWGCPRmGdnwVOFsJqxLqx72LlTmaNgJFGBpQYKMzzZGLIydOJ1RKmeQpJeWRQeGTFKmBAuwNXIWr3JYi5s1fj1bGOpS1pL0zyjQYxLWNAqbjMZRpdIXbUqUhRSgXFRl2KwAw6AzpZYpZrR9JnyNQtbS9KBLJ17WGzP42MJx+OTSTWM9QxWUPSEhdRa1RY6yT1beZVbO0JhAYwBcAf8y7BIsZXrOxILu+JzJ7c1zXKOrKvpWGLVqOEyagfcYvOKTIQmBtysuVzQ4aKSLrGaerQHGhLHyQ-VpecpRhKW5x-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-T26Olz3OD-IbKPQqIJbwAO+aTwhlV2QvRPkBckss4iGbWZBFNukHeeQy25KdRL5NtoCxUZRFAI7yKaUgIThXpwdmM0z0hZTTmWgkqq5VoCLWEFSOxPeLUzYbp-qOKyr5CcIZ1PHTIOGfTFqa+LJlJQzGAID6CODFwJGHrRLFGDxuKfhpXyYBWQbQrJ62cq3taJkzSJEoycWf8xRYluqOLAEXlVMHTPWMMwTlAkDApedxVmQfQzeVYDv-WdJWAKcoVbXO7SAEFSNqEczaRP3TweceBQ2Akw4gc5QiKP3T8BUSyM2CLm4Bego-+NDxQGN5x1GRnmMAB2IdJPwqj9aTy9Vd5TLhaCzwqUNYt7LGqJBODSSKD4A1AQJQgKIyaNAGO3w3cFTazFo7nWaZSYKWVzGrPuTXGUAbFWJZoCAMjQNOR6xTbF4ywbIy4XhZH4DmR7oSnHuLt5e-KhaSbRyVBcLrOQ2w8xZ+w-GFYybKQ6Z1er7R4KdbZNfaSvHqaTS3pHwCsgMNQ6zI0AB8s8yj6drHARfYwyaRFylqVH7VxZeRgaTnY3nNkxaHJww1aeN6X5fEzBKZPXi2dMKoqZXxk-FHplqdYw6pdba4ZASavPQQBeAftLrbInL4RfimhNSBLVp0mrW+YoyzGLyaimC+ztyQxR3GVXRpxd6ouyD5xXyWxRmGI2xZY9lJRKA-yVFogpw6JPSmIYPyEJWAAc+QbwImVpnSvdrFqWByL9o34ZKOd9To2X9YNqVuynGNIJ1HGZI1DKcLPxMn6DuK5RtpCSwflBbTd2XVS9Bd+T9uQPRVZAD5XaDDpfGB3QQOaPrhOQmrF5MlQeKJhK5At1TzGQnSAqXg5WKIkrbubl7bXBWoxySPFHveOP2gcnQvyI4UtHNEzyZPbUZlFVQVKJjx2OE-keRWPQazS3Sn1CPrec60n3DKAeavDOSn1B6wuzfjTRtXJycKRPQ3RYxKKo8jQe2bbIE+PxkXKOrQv+TtTgKeHTitBZTqIAyxNmLRyn+YyQdAZBGQOTVTdKXvxRD74CehK+x-6S5wMGcvzN2Q8LPGOAItWIcYSqeYfqeW9w1AIVJwWY4pjFbmp6dZ1Qu2ImmU2dqzcKB6z1xddQbpe5z5zNxQ9aNmxWACCrFddUyEWfkDFyMo0a6AoJqKR7TAK93TRFKRabHByzz2BhHGKRLTklLDRsFaMx69w7ze6dyJWXKp63LNAwbt4xw4eaxSi6TJSbVAzq1mJPqwhT3yt6QJIJqISZtuBNTOaH2TaWRQrCjGRTPmV-zCKWNQ2KXFIsdGjMzGInwIAYpwyJF-whlZVRWqH+pHdSAyRaHrQRKV5yVFAcw-s2DbYlolzQdeewfbTSxsRfLQBJKxy9yNSJsgToB1HNLywdEbzDucYDWKaBwQ1ZNy-Mh-31aJvT82PdyPGCSIph9bYb+C5LHuWNqDq8vQwOSeDn6TY5YJLHr2eEHQ97MBy7txTSD6IWzdufimZyC5I3KPzQDFXRwxKYXzsHBTxvt3BxAdDwJk-EFxA2ZtSJ6KnRAw2NS-DMM55BQuw0aMKJhpdHQ42+ZYPeOhrZ2Z-EYBOvRmOKLFC6fUCcFQI4Aadqwf+RZLmgOeTH2HeLrdbRQ67YxzQ2Ed6wbOTy9GCtz6xVDyKaDbVTJI9QhhHoY6IQmLzmZdTpIjUxDqUVp-WatytGLIDs2EVxMWbYADpaIy7ySKaWneBSEMzKyQ2GfpdOGmosqLACY2bvxHzFkyeWJOSgnMICN5EPRgOOar9R9honLEQDpARoBqx+LRhRAwxC1PLR5eX4IN5c9RfGbdT3TT6qh2W+yUBFLwH7MDQpzD7ab6KmxW2W3THOftRd1tVktDZRSPImBSHaG5JamEpx5aWRSaFSIAiqUlSQGBOzrGY4ySGABRUlJzJ9129at+auisNfdQV5X0yW6S3wMFc0ycNTyzsGBUYZ6NfJsqs4wZbX-y2+NgmIKRjR8aF3K3GBzNFmPwrDGHNRuRQtTxeY4pHvCWwv6RO2IeUexgAKyz0uLrHi6QuwMgW9z5OM5SdGQgzsVBHSbefUCTnBnLfuama8gHOQoq-JybaVHrzbSgAmZCoytVUJxgObOQfaVoqKaDwlEufPrPWcsxI6CJRtKdoDjWBT1HBOrIsXGSITAGa53AXULunPPzGzefQJKWYB3jDXybeCpyv46eFPi0MKT6NTQ5meFShKOxKUhaeJ3RXYxpRU3rOKBQySIFqOeD7bbX6Al7tdL7lUndYxoJCqa9+qTz8eObzKpLozX5KQwJ9UbT3+ADSuVFbQaZXK5TbFdzWXbExWBFEDyOAYxk9+XwaIdAyoWgyql6MVR3Qg3S8HEHQojf1RxXMBmnuJ0r4fFQzzmd1KV0e7w1TLQ6eaDKKqFBtSe+HhR4ABGIce+Rx2rV2T+2VAxN6KgmWeNu4+JJYIUBLIydBOVQPhIzMalG0Z0qGeAGGNBXCjViIzuQhk4efwAQBQ7RumZdwY2QZyV2XuS-tRoKEGa8IoWYezMARoIpWFnxsqcgOoGG+zwAB9S5GCfQDqQCKiFKExiFZklA26SzIGBOEEqKswTuNPTGqWDZOUqkAfyd6JeTcyLt2GuikBCpybRRTpnyNsIrGOTxsgFgC4jGgpMmdiKPKUP546RhJ8hcMxjeGa54hQ5QDnc2aC+e26DBT-a9RvfSx2UWWpeP5T0KJBQeBE7QAKZ+RWqJRa15UWWvbL+qDuc9QlGThE2BZcx+2P3rHGO+z4xZ+xXBGEKNmA3x6Y4VLnBJqZJ6aMFn2vkwCaH0q5GbHyw6VMzl2byadKCa2X+KdR0TKbTE2Z+L12NfLJaQ+YXpBdTjZdnyehBFRmfeGxGmLIxUmY+TlqesF16f+osgsQyXAZ7ac+ezu+BQLz-2PqK06XuL9KNzL1qLYwX6BgqtxT-ZD7YwDd6kxzY2Fr7HrHQLbqCw7B2LkK05CGo-pBKbsaG9yFOQoFVI4-S3eJLQSGC1phec9RvqOwyjGQoxCeDaxQtHBwZ2FeTfhckfnqIqpDxa4xTJGRQ0aa7LKgURHFGe8IMpRGoemSh2n1LByNWW+xyqEMJOBRQLlmGVQvtXDpTeSKxxWSKzj6RRSKKXvzGgOLxI6DUpMJG15-tK1ZJ6bpRQKCz4rVFTR1RbxQx2hEymWCtSbbGqYDnCrKuNV-HRh+kKVaVay15X3TGgHlLB6cElQOe-z96JKphqEUy7VCrbPyG5xeOAv0OlXbkoJcbPJlS2xynCmzUtR8z-mH+aS2ZTEWKTLw-3GeDXeeMrbV69RDWQfRCgWJQJyUAZnVSWzUZLzS+jA9TGWbMJE+H8xHdddR72TTQDOftwyZFeFsxA0cTnIqz4BCBTWgR+S2AuPPSGIECNTeAxWXFetemK2cVZBcVVmebsv6K+SYOHO5W2FQAcha4wdOUhyaqNI0w2TVscGDtyYpfpw-uPqJxeYnlFyGHSD6QFQlBGaLLxIM6JBM-F+KNTRElJDzYAMznvWedbsRVb68ReiwyqbKygk85QqjpB30RS1QWGVIxWuZhRMGXwIKIloakGbirNKWHzxxUwzgxfP1T6J9S+BWRJmRSnxFmbVwwaYpzQHU+yt2X2oJmfdx1aFWITqaADMWOqoNWBwxC1fAAhhBOECBLJzZudOqaeexZB6e5Ig-ZcyXBTLQOo-Qw-pM7JVFKwzmWrExPBLpwJmDKK3KHgr4GK1xAaBrTyRG21t3SkIh-TAMfaVwzwmNPTQ1YkxRDuEJ9BCWYDOl7JHSo2ITyGpKMRXg6NqYYxrFPcrDBfrTp5F-Q57Uu6PBcdRKLYFw-z5EzyA9dSUddg4sAcXSw9ABGWZXRDnBdDM2KG9wIImQK6mLpThgf8pAzUXTc+fVJk6dkr46TWv6ZcKKm+aui-FmxSOzdjxAhdnnn1N7R22W+KkFU3ytAbXyLAV9KpFPDQkA3PQLWamWB6VnJy5PCy3WIAKmGOhwctTTwuOJdqj6IPRwaZ-yTNbYlqAJExPGW0GDAQRk3eTKJEgIjr+L2WLEvLl43LabwaqTnzheeSxIhL3xA6V6Ko9UfzxhJayt2cZJXeUPYWuLkwdjLmyNTHIoV+XzTKvVOzNTcH4LAS8zKeE5aCIVwzdV1jSezbsLn1GAwLJJRE4ItYJpXEYDX2UeywKHdEsqVGphRBcybjZSqDq-tyNBFrQLaPIqWdqewLaSn70-LBdnGKBTt+BuR4OH67gaRxRpyUBQaANkyuOSyt1WIeL42RRbrqUjQwOVx6uJUHyreYnpxycIKQqUxTHFePTSaA7KQ7HiJGC3rTi7Vxzl+JayETRM6l6DupCg5yy-DfQKlGPEKwhPIDEvKOTmaWjwiWIiJNyWrSeJLoAsTNZrFrVGwqBFzrgDPJT7GBY7NeCPT2eUOHImRtS99B1ZiKQGINpNzIDp45aRy4OTPGM47ZOXGWNAY7ojGJdwHpZb7xqIjpTbJYDw6CTzYycYIphw-zunOIaZaZNwouCAK15H5Qoq4jwPaBtye7DGLjRPqInyLQx+FWOQg-DkKyaZTRvxHWwweXmyGGHYwZdiYzRqIRILKHjTpdmfQnvFIz7ubwJ2OBTwOqMbr86Nixr5AIJbpQgyAMvcowqBTzXJEVRGQrVIEaZywbNZpq3mVozGzRbxqPRsywsleKiKWW4nKRhKSKPjTZFdTyFGPPwElHgxr5HSx17cBx8JVyoqKXmygDNrWKAfexIOTOTqLbIxfeEtTqWQYJdzIoCPWRUJDDWWLRaYbxgqcMwazKBwJyF2xl+T0C-dcxSa5ZcwdOLzL7uVbQoqOB6UaP0KCaPQH36V0xOaX4BrWGhTtZ1kp1mVDSJGGNTfAeoCvtAqxKJa5ThjcMoaVxBx0BXJLzpaqa5xG5aFuaqbZGODTx5FBJS-ZsmezGuK7qaxKHTba1cLVqpu7bHTnmT8xnKfxKmaJ1QtfOPQr2f9TkHTuTc2YyzNlPyyR2CKLNPdVQpuVvGZLS1xqbRDwoZSwJHo2DZ4mdI6gWODx22QsJxycZJXuTab-hQ4Z2GcfR42WHw-mR0x0mIfYhaU3yHyXdRYJ7qyKAIEzJBDnyaKGByKKSUp4AXzza+OALPGNyxu+AGffAN2KAuIyJj2ZswVbDe7JlCJQI6JOR3yC+zo6XVqfR51TNKcq3OKBkA8RbYrjaDFRTlENpfzitIVmbpKJmdzb+GWvpb83JSReMzy9BY7xmAfA5z-BOkzHY1ZRgoUzGmXnQ+1dcLCWZ-GqFTkrKReEbryF5Q5KYSIO6NpLlWcCwERa0AX2f6IFyayJUucBQHopDytNcaadVL+RJOGlZ+GYlqmKcEAmqIoDKWXwCAqN3ZdYm9YaJQ5wH9VTQc03IzQxNLzgaCvIOvWPnTyGuRY1KDyT2VzSp6IsZt6IOTTTKuwRhzSbvBLl7UgalE3yJ0A+lY1zm+NBQnGJsxYLLBwn6Ohx+AOwGSGHNJIGPxLIzNCzClfynb6HQK8aXYbO2KEr1gtexthaJ69VczTbKJhQJmM467GTSz+GRqq3JbXRLpPkDfMr6zJuZQI1jC5JiueuTAdu8l9Y2lRBmWnLtuZpzZGLEx3VE-JOpBcySFB1TsJRLwgmFC3Z3JfzZpGrQqRcAyN6G4KtxADRI6fVL35eN69xYXJOZY7rd1DNKmqcZLdKNoKIgXdy3pOdELaIfZgaWHqoGUywHqbSS6qBOGiFX9qh6eCJhReI6HBChROpLhy1qauiGhUEdnZbaDFyOKzGRRDTIMt-RAqJeyWMvkO7qKSJFAVpQ26OzyfRiuSclNjSRgdCZuGcirpGLqxz+dDQWmft3bWIeI1yWnJjdYfrqXYuQy2e2w3PJJo-kjrw0hI0IxmZlE0JWoBLGRTrXJNTKjUtBJU7RTRCFkxwWeWCySeKqrB+cO4FBc6wy2UCL0uBkAEWD2JL2FDSv6fxLaBCi4O6BPyZyFKqumNZcSKSyz4KX8wiubwoEGMOy+eVvR9uP9pMWd05s7jnwkeB2LCfYVJ5zEd7v2JqzUtMxd2NYvIJySRBVGOwxL+R5Q9xFjRVZQ5T2BG3QGaG9SUzZ7KiFTHJaN0NKQOdHS76SwJ-tbTQaFZNSrOTGz-1T6yn-axKmKZjGX5RvS7ROEKofRVQ3KQGKKWOPyuyPMsuFRoKRmOibKRRIqGaAgGdWX3S4zKfzBZfgLrZNTRuRUSGbWQVcnqfkJcHJh2xNdrr3TBUwRKKor5+Tw4NaDKJS-PywjybGy5uV6xwhCfXqjWQJgMqgAg-NVT8RSFSbWIXZ3KSjxMaSBG7pIYwGdJuREssTR+WKlb6jaax6pe3ojmNd5IeXeTwAHgIWaaHRQGFgCofBuJX-FBTd1cPTApOK541KxTunHeTFyYKxEaYjRqZD+o-KbD6nKS5w5PJKoIZHgz6padS6WU+SxWRqyjKAxyyRO6I8hAGzH92Ha3LTPLupTw7kacq4mx7-TV+WDQh6VJHshGcz8Ugax4OFqwaIU5y-pHxoShQmpTeGfQ0BPWxTJaeBAgwxyRKZLTaLMuSHfUV1AafAZN5M1TtySUw1PL+zv2WI2wND-5dWI2ypeZ7mjycy-X6WzSQOCvIwKedxIe+6y+eGdxAWDnmvKVC3m2PCb5RA5IGBXFwgJ7wJUhJYLtYznydmfHTnyPv6kGCFT3WebSs6C1xEOPLac5Pux5qPJQihcJwA2fD4PKTRBpKcaKxqX4Kx7QAsi6TyUYhP646746wwtS3R1WcMBwJftKivLNRreWbrCWbD1FjaV5-NAwIIrVwzauamUazC7w5FeeQeYo9w1JOkYrnZwC3yYgwAI8IzX9vGJrUolwfyIG192DkRHyI9zBjcnWP2VgpgRH7QjhPFw-AKuzc+AjzbZQmp6hRrQbmS4JrpAq6iFW5Ij+IBTaaRxoJBQQLsuPxQsXQYJ3NVqwkOceAMGY0BvekPOV0A1x26co1che2x2KPtT6BMQpzBDuqLyQ5QUPMmrJlLMpwhLFQ3AeCJWNBHwL+YFwvycXY-mWww4RYixpTaczvqedJxueN5TlbIDbB1yo5FS7pOBB9w-AdcqBgLhLtAF5TclFFWhxQeXOeUz47pTKziuMvxOKeozSADwx0nSc2vKPEoazH4lE04dLaaf2wcaPf59BDzoExfVI+C5Sru1VxL+aXGwNGciz6gQocMFHeoYvM-GSgcnR7qACL46IDR0GeozDqXUKH2B5RRD-zRIQ+pweGUgwqTEDQqqbLuxWDZakFEPxJGR6wcgXexzaQzGz34T63LKEaLOHJ7hBJKrTGZsrkKWyqcKTXSbmGUBAfJZ5+qNfTAFHDzGLODqbVdEz4GDdQqxVoxa6ffRXrdf12BaXzQHOL5gKY0BSuNoL5XdyzpWO9zWkwdxLItRbrXb2qYORsImZdiIB6FWzGrd-5LFF4xWOXnRfuWRLgIrEy7lfLIuaBcLv6Z1zCRH67upW-SiWc40IOHNRe2TUtmc9MtVpDZrNeIqyv6FpSvxctTiaBEx0XjQwrVHRQNxLjxTaJpzaRe2xtGKZQ+JGEL36O6zKaQ2wsTeSzOgN3L72EoLxOV4ZBVQzQeGXYUY2WTRuqE2ozGYkxpKFcyV5S8ojAO3SUNGQIyaEYBfGIibxabvxKgbdxT2LIDBKFORVuOMzw3I9EeOOOftKZb4jvIPT5+LeILuxo6B6ZpS3xUpxoJQ7kcGWwybWPRJxVaDQnyCIKlpezzhi+kKGgaFTrGYVJfc0PTJ2KmyzgtglmmUZRi6SKYuhPiIeYk3qOzBtSuNOAIFxJnSzFco25hOvSbmUaobaONTyKOm4T6JJQbABBzgOR+REKQpwCpTqIiKAewkKfCw0acTzFKLGI4qFWrjRVzRX2JZ68adnpJ9alz5aN2IRyCozB2cHLRFeFoKGRn3yVH4lMOtQGzdCORRGMKomhdHRoqJedNFWCzJdXGXw3QFSh2btQ+AXPTipFrTJhOlyqlXaKCGAzxNWEYBoWFAzyZTEo6Id-6B6VCIu08aYEWICxuGbjlVIxXxU6eGrtaCFRlDYaKIKWSzE2egzBKa+yiy2hS7KbbblmIXSqvPObKos45IaBLKhKXEYLuVzRlqXpWm1bFzThEf5p6UCwYaDvY7GPABPBOJzcvIwwDuwYytGG1R9Y+WKIudRLEFVm6JFyKw0BaSpZeUsa5XFfIelKMFsOVmwUqXeQomDxraIVWzswlvaeHbyaWzQQA3ybH4pGfFw+NO2JRHCN5n5onT0bVuyilcaY6hczxR+ftGN2Q5pvyGDxC6fy3kRXeRU2NFQVyewI6zNgJNmQYBLuRBwxRfeW8aNmyqIS4a7qdUauaFgK8+CnSv4gv6umcsKTWb9pYmEuzlKGczw1JfLRxIdxyY0JoiNBoDNGNK+xRXmzJ7QjIZ3tFRjuMzkzTVGrfuS27oEns6a5LYIY9tdKq5Frd3TdWJFWLH6J6M-F+QXsFXqFWomgGVTrKEkAk+ETQPAAwy5AkaxdeMWk1bKHyfmQ9ye1TsJ5WexKk5DDTH5SjyECnPT3FFDLXKEeLGdPYK8CpgxfNWHTz2d8xo9a7L2mWDYp6cQxq2XqcZlOvzI6BEp3Kba7s6UOSUmeUaOhoED-KSe0aIFEwEWOK6I6IrSGZU6z-mdvLpab5IABZ5LHFSQk1TeG4MGcgqP2TUB+Jf2xhaanKZRXAz6xX0psUiqZaSH4w3ANnQkgt6zNtH1J8PaeKGKR+RamMGIZ2CTx5WHlJqqPEqFKVlxTaAcbsa+ZaYKZpbuKW3JdmPDSw9EeJ3A+dwBxcKy1GLRvX1B-LsVK8wp+NtLARfUbDtHVJLpASyzqVPqeJJRKP2S2wChT4Az3Hs6yJdPI6pPMJoGaXqgDa+JOUkozgKVRAn9FxQiqHyGtPeNxSuPbXlw4TT1WNPT2ryexbPNMr+qbeKXwzfRbzA8nRqaYp92DCysVBXT7+VAyuNahRPaFPIB+AJwh6frRgnP61C6LmtLIocbi+NKbPBC6FPqaLQOKPDQipHs4oM7lI3qEKKQI9cfgufhqfuFoZeZPCZZydSToaRADuyAyR2AHIwyIORAkyMyT+ycmQgAB2Rdf7r89f3r99f-r8Dfwb9Df4b8jf0b9jf8b8Tfyb9Tf6b8zf2b9zf+b8Lfxb9Lf5b8rf1b9rf9b8bfzb9bf7b87f3b97f-b8Hfw79Hf478nf079nf878Xfy79Xf6783f2793f+78Pfx79Pf578vf179vf978ffz79ff778-f379-f-78A-wH9A-4H8g-0H9g-8H8Q-yH9Q-6H8w-2H9w-+H8I-xH9I-5H8o-1H9o-9H8Y-zH9Y-7H84-3H94--H8E-wn9E-4n8k-0n9k-8n8U-yn9U-6n80-2n90-+n8M-xn9M-5n8s-1n9s-9n8c-zn9c-7n88-3n98--n8C-wX9C-4X8i-0X9i-8X8S-yX9S-6X8y-2X9y-+X8K-xX9K-5X8q-1X9q-9X8a-zX9a-7X86-3X96--X8G-w39G-438m-039m-838W-y39W-6382-2392-+38O-x39O-538u-139u-938e-z39e-738+-339+--38B-wP9B-4P8h-0P9h-8P8R-yP9R-6P8x-2P9x-+P8J-xP9J-5P8p-1P9p-9P8Z-zP9Z-7P85-3P95--P8F-wv9F-4v8l-0v8bidSRKIOMB6SBr+oAb2S+yUmTtfqv+dfsv8t-1v9t-9v8d-zv9d-7v89-3v99--v8D-wf9D-4f8j-0f9j-8f8T-yf9T-6f8z-2f9z-+f8L-xf9L-5f8r-1f9r-9f8b-zf9b-7f87-3f97--f8H-w-9H-4-8n-hf81fyEA-AP4D1f-GSNfqRDNf0yR8iDr8b0dRBEVFux-tFeh12augv-hMBHeHOm7BSZP2KGWYP-7v-pXQn-6AAa-+v-4f-gAB3-5v-n-+YAEwAZABoAHQAUABsAFQAc-+KAGIAf-+6AEQASABWAFf-hgBuAHwAQQBcAHIATgBJAHYAcAB5AH4AWQBaAHUAZQBtAHgAfQBSAEUAagBzAF0AawBeAGMARwBRAE0AWwBXAGYATwBTAGcAQgBhAGkAUIBggHcAWIBkgEsAQIBUgGyATIBogEKAVQB-AGKAewB8gFqAaoBKgHKASIB2gHEAQwBOgH6AXoBfAEGAcYBRgHCAWYBEgHqAVoBhgG8AeYBtgGWAZoBJgF2AeIBcgGOARYBrgG6AfYBHgE2AS4BSgE+AdIBGgGeAb4BgQH+AVYBTgEOAUEBAQHWAaYBXgF+ATEBwQHRAc4BUQHhAd4B8QHJAe4BcQFJAWEBGQEhAWkB2QGxAbkBWQFuAQUBiQERAaEBxQEJASkBmQFlAXkBFQHpASUBVQGFATUBRQGRAfkBlQE5AaUBqQEtAeUBrQF1AW0B9QHtAQ0BHQGNAZ0B1QFdAc0BEwHjAVMBYwEzAU0B0wFzAbMBowELAcsBSwGrASMB6wHDAZsBQwHbAYMBuwEDAfsB-QGHAX0BxwG9AacBPQHnAbUBZwGXARcB3QHXAXcBtwEPAZMBiwEbATsBBwEnATcBTwErAS8BewFHAVcBjwHzAWsBWwE-Ae8B9wGfAYCBrwG-AR8BAIHfAW8BfwFggTCBkIGggdCBQIGwgVCBzwEogYiB-wHogRCBIIFYgV8BGIG4gfCBBIFwgciBOIEkgdiBwIHkgfiBZIFogdSBlIG0geCB9IFIgRSBqIHMgXSBrIF4gYyBHIFEgTSBbIFcgZiBPIFMgZyBCIGEgaSBQoGCgdyBYoGSgSyBAoFSgbKBMoGigQqBVIH8gYqB7IHygWqBqoEqgcqBIoHagcSBDIE6gfqBeoF8gQaBxoFGgcKBZoESgeqBWoGGgbyB5oG2gZaBmoEmgXaB4oFygY6BFoGugbqB9oEegTaBLoFKgT6B0oEagZ6BvoGBgf6BVoFOgQ6BQYEBgdaBpoFegX6BMYHBgdGBzoFRgeGB3oHxgcmB7oFxgUmBYYEZgSGBaYHZgbGBuYFZgW6BBYGJgRGBoYHFgQmBKYGZgWWBeYEVgemBJYFVgYWBNYFFgZGB+YGVgTmBpYGpgS2B5YGtgXWBbYH1ge2BDYEdgY2BnYHVgV2BzYETgeOBU4FjgTOBTYHTgXOBs4GjgQuBy4FLgauBI4HrgcOBm4FDgduBg4G7gQOB+4H9gYeBfYHHgb2Bp4E9geeBtYFngZeBF4HdgdeBd4G3gQ+Bk4GLgRuBO4EHgSeBN4FPgSuBL4F7gUeBV4GPgfOBa4FbgT+B74H3gZ+BgEGvgb+BH4EAQd+Bb4F-gWBBMEGQQaBB0EFAQbBBUEHPgShBiEH-gehBEEEgQVhBX4EYQbhB8EEEQXBByEE4QSRB2EHAQeRB+EFkQWhB1EGUQbRB4EH0QUhBFEGoQcxBdEGsQXhBjEEcQURBNEFsQVxBmEE8QUxBnEEIQYRBpEFCQYJB3EFiQZJBLEECQVJBskEyQaJBCkFUQfxBikHsQfJBakGqQSpBykEiQdpBxEEMQTpB+kF6QXxBBkHGQUZBwkFmQRJB6kFaQYZBvEHmQbZBlkGaQSZBdkHiQXJBjkEWQa5BukH2QR5BNkEuQUpBPkHSQRpBnkG+QYFB-kFWQU5BDkFBQQFB1kGmQV5BfkExQcFB0UHOQVFB4UHeQfFByUHuQXFBSUFhQRlBIUFpQdlBsUG5QVlBbkEFQYlBEUGhQcVBCUEpQZlBZUF5QRVB6UElQVVBhUE1QUVBkUH5QZVBOUGlQalBLUHlQa1BdUFtQfVB7UENQR1BjUGdQdVBXUHNQRNB40FTQWNBM0FNQdNBc0GzQaNBC0HLQUtBq0EjQetBw0GbQUNB20GDQbtBA0H7Qf1Bh0F9QcdBvUGnQT1B50G1QWdBl0EXQd1B10F3QbdBD0GTQYtBG0E7QQdBJ0E3QU9BK0EvQXtBR0FXQY9B80FrQVtBP0HvQfdBn0GAwa9Bv0EfQQDB30FvQX9BYMEwwZDBoMHQwUDBsMFQwc9BKMGIwf9B6MEQwSDBWMFfQRjBuMHwwQTBcMHIwTjBJMHYwcDB5MH4wWTBaMHUwZTBtMHgwfTBSMEUwajBzMF0wazBeMGMwRzBRME0wWzBXMGYwTzBTMGcwQjBhMGkwULBgsHcwWLBksEswQLBUsGywTLBosEKwVTB-MGKwezB8sFqwarBKsHKwSLB2sHEwQzBOsH6wXrBfMEGwcbBRsHCwWbBEsHqwVrBhsG8webBtsGWwZrBJsF2weLBcsGOwRbBrsG6wfbBHsE2wS7BSsE+wdLBGsGewb7BgcH+wVbBTsEOwUHBAcHWwabBXsF+wTHBwcHRwc7BUcHhwd7B8cHJwe7BccFJwWHBGcEhwWnB2cGxwbnBWcFuwQXBicERwaHBxcEJwSnBmcFlwXnBFcHpwSXBVcGFwTXBRcGRwfnBlcE5waXBqcEtweXBrcF1wW3B9cHtwQ3BHcGNwZ3B1cFdwc3BE8HjwVPBY8EzwU3B08FzwbPBo8ELwcvBS8GrwSPB68HDwZvBQ8HbwYPBu8EDwfvB-cGHwX3Bx8G9wafBPcHnwbXBZ8GXwRfB3cHXwXfBt8EPwZPBi8EbwTvBB8EnwTfBT8ErwS-Be8FHwVfBj8HzwWvBW8E-we-B98GfwYAhr8G-wR-BACHfwW-Bf8FgITAhkCGgIdAhQCGwIVAhz8EoIYgh-8HoIRAhICFYIV-BGCG4IfAhBCFwIcghOCEkIdghwCHkIfghZCFoIdQhlCG0IeAh9CFIIRQhqCHMIXQhrCF4IYwhHCFEITQhbCFcIZghPCFMIZwhCCGEIaQhQiGCIdwhYiGSISwhAiFSIbIhMiGiIQohVCH8IYoh7CHyIWohqiEqIcohIiHaIcQhDCE6IfoheiF8IQYhxiFGIcIhZiESIeohWiGGIbwh5iG2IZYhmiEmIXYh4iFyIY4hFiGuIboh9iEeITYhLiFKIT4h0iEaIZ4hviGBIf4hViFOIQ4hQSEBIdYhpiFeIX4hMSHBIdEhziFRIeEh3iHxIckh7iFxIUkhYSEZISEhaSHZIbEhuSFZIW4hBSGJIREhoSHFIQkhKSGZIWUheSEVIekhJSFVIYUhNSFFIZEh+SGVITkhpSGpIS0h5SGtIXUhbSH1Ie0hDSEdIY0hnSHVIV0hzSETIeMhUyFjITMhTSHTIXMhsyGjIQshyyFLIashIyHrIcMhmyFDIdshgyG7IQMh+yH9IYchfSHHIb0hpyE9IechtSFnIZchFyHdIdchdyG3IQ8hkyGLIRshOyEHISchNyFPISshLyF7IUchVyGPIfMhayFbIT8h7yH3IZ8hgKGvIb8hHyEAod8hbyF-IWChMKGQoaCh0KFAobChUKHPISihiKH-IeihEKEgoVihXyEYobih8KEEoXChyKE4oSSh2KHAoeSh+KFkoWih1KGUobSh4KH0oUihFKGoocyhdKGsoXihjKEcoUShNKFsoVyhmKE8oUyhnKEIoYShpKFCoYKh3KFioZKhLKECoVKhsqEyoaKhCqFUofyhiqHsofKhaqGqoSqhyqEiodqhxKEMoTqh+qF6oXyhBqHGoUahwqFmoRKh6qFaoYahvKHmobahlqGaoSahdqHioXKhjqEWoa6huqH2oR6hNqEuoUqhPqHSoRqhnqG+oYGh-qFWoU6hDqFBoQGh1qGmoV6hfqExocGh0aHOoVGh4aHeofGhyaHuoXGhSaFhoRmhIaFpodmhsaG5oVmhbqEFoYmhEaGhocWhCaEpoZmhZaF5oRWh6aEloVWhhaE1oUWhkaH5oZWhOaGloamhLaHloa2hdaFtofWh7aENoR2hjaGdodWhXaHNoROh46FToWOhM6FNodOhc6GzoaOhC6HLoUuhq6Ejoeuhw6GboUOh26GDobuhA6H7of2hh6F9ocehvaGnoT2h56G1oWehl6EXod2h16F3obehD6GToYuhG6E7oQehJ6E3oU+hK6EvoXuhR6FXoY+h86FroVuhP6Hvofehn6GAYa+hv6EfoQBh36FvoX+hYGEwYZBhoGHQYUBhsGFQYc+hKGGIYf+h6GEQYSBhWGFfoRhhuGHwYQRhcGHIYThhJGHYYcBh5GH4YWRhaGHUYZRhtGHgYfRhSGEUYahhzGF0YaxheGGMYRxhRGE0YWxhXGGYYTxhTGGcYQhhhGGkYUJhgmHcYWJhkmEsYQJhUmGyYTJhomEKYVRh-GGKYexh8mFqYaphKmHKYSJh2mHEYQxhOmH6YXphfGEGYcZhRmHCYWZhEmHqYVphhmG8YeZhtmGWYZphJmF2YeJhcmGOYRZhrmG6YfZhHmE2YS5hSmE+YdJhGmGeYb5hgWH+YVZhTmEOYUFhAWHWYaZhXmF+YTFhwWHRYc5hUWHhYd5h8WHJYe5hcWFJYWFhGWEhYWlh2WGxYblhWWFuYQVhiWERYaFhxWEJYSlhmWFlYXlhFWHpYSVhVWGFYTVhRWGRYflhlWE5YaVhqWEtYeVhrWF1YW1h9WHtYQ1hHWGNYZ1h1WFdYc1hE2HjYVNhY2EzYU1h02FzYbNho2ELYcthS2GrYSNh62HDYZthQ2HbYYNhu2EDYfth-WGHYX1hx2G9YadhPWHnYbVhZ2GXYRdh3WHXYXdht2EPYZNhi2EbYTthB2EnYTdhT2ErYS9he2FHYVdhj2HzYWthW2E-Ye9h92GfYYDhr2G-YR9hAOHfYW9hf2Fg4TDhkOGg4dDhQOGw4VDhz2Eo4Yjh-2Ho4RDhIOFY4V9hGOG44fDhBOFw4cjhOOEk4djhwOHk4fjhZOFo4dThlOG04eDh9OFI4RThqOHM4XThrOF44YzhHOFE4TThbOFc4ZjhPOFM4ZzhCOGE4aThQuGC4dzhYuGS4SzhAuFS4bLhMuGi4QrhVOH84Yrh7OHy4WrhquEq4crhIuHa4cThDOE64frheuF84QbhxuFG4cLhZuES4erhWuGG4bzh5uG24ZbhmuEm4Xbh4uFy4Y7hFuGu4brh9uEe4TbhLuFK4T7h0uEa4Z7hvuGB4f7hVuFO4Q7hQeEB4dbhpuFe4X7hMeHB4dHhzuFR4eHh3uHx4cnh7uFx4UnhYeEZ4SHhaeHZ4bHhueFZ4W7hBeGJ4RHhoeHF4QnhKeGZ4WXheeEV4enhJeFV4YXhNeFF4ZHh+eGV4TnhpeGp4S3h5eGt4XXhbeH14e3hDeEd4Y3hneHV4V3hzeET4ePhU+Fj4TPhTeHT4XPhs+Gj4Qvhy+FL4avhI+Hr4cPhm+FD4dvhg+G74QPh++H94YfhfeHH4b3hp+E94efhteFn4ZfhF+Hd4dfhd+G34Q-hk+GL4RvhO+EH4SfhN+FP4SvhL+F74UfhV+GP4fPha+Fb4T-h7+H34Z-hgBGv4b-hH+EAEd-hb+F-4WARMBGQEaAR0BFAEbARUBHP4SgRiBH-4egREBEgEVgRX+EYEbgR8BEEEXARyBE4ESQR2BHAEeQR+BFkEWgR1BGUEbQR4BH0EUgRFBGoEcwRdBGsEXgRjBEcEUQRNBFsEVwRmBE8EUwRnBEIEYQRpBFCEYIR3BFiEZIRLBECEVIRshEyEaIRChFUEfwRihHsEfIRahGqESoRyhEiEdoRxBEMEToR+hF6EXwRBhHGEUYRwhFmERIR6hFaEYYRvBHmEbYRlhGaESYRdhHiEXIRjhEWEa4RuhH2ER4RNhEuEUoRPhHSERoRnhG+EYER-hFWEU4RDhFBEQER1hGmEV4RfhExEcER0RHOEVER4RHeEfERyRHuEXERSRFhERkRIRFpEdkRsRG5EVkRbhEFEYkRERGhEcURCREpEZkRZRF5ERUR6RElEVURhRE1EUURkRH5EZURORGlEakRLRHlEa0RdRFtEfUR7RENER0RjRGdEdURXRHNERMR4xFTEWMRMxFNEdMRcxGzEaMRCxHLEUsRqxEjEesRwxGbEUMR2xGDEbsRAxH7Ef0RhxF9EccRvRGnET0R5xG1EWcRlxEXEd0R1xF3EbcRDxGTEYsRGxE7EQcRJxE3EU8RKxEvEXsRRxFXEY8R8xFrEVsRPxHvEfcRnxGAka8RvxEfEQCR3xFvEX8RYJEwkZCRoJHQkUCRsJFQkc8RKJGIkf8R6JEQkSCRWJFfERiRuJHwkQSRcJHIkTiRJJHYkcCR5JH4kWSRaJHUkZSRtJHgkfSRSJEUkaiRzJF0kayReJGMkRyRRJE0kWyRXJGYkTyRTJGckQiRhJGkkUKRgpHckWKRkpEskQKRUpGykTKRopEKkVSR-JGKkeyR8pFqkaqRKpHKkSKR2pHEkQyROpH6kXqRfJEGkcaRRpHCkWaREpHqkVqRhpG8keaRtpGWkZqRJpF2keKRcpGOkRaRrpG6kfaRHpE2kS6RSpE+kdKRGpGekb6RgZH+kVaRTpEOkUGRAZHWkaaRXpF+kTGRwZHRkc6RUZHhkd6R8ZHJke6RcZFJkWGRGZEhkWmR2ZGxkbmRWZFukQWRiZERkaGRxZEJkSmRmZFlkXmRFZHpkSWRVZGFkTWRRZGRkfmRlZE5kaWRqZEtkeWRrZF1kW2R9ZHtkQ2RHZGNkZ2R1ZFdkc2RE5HjkVORY5EzkU2R05FzkbORo5ELkcuRS5GrkSOR65HDkZuRQ5HbkYORu5EDkfuR-ZGHkX2Rx5G9kaeRPZHnkbWRJAHqSGwG7wBrpAXEXIDV-jf+EiB3-ihYLX5+yJX+Aoin-l+R35E-kb+Rf5H-kQBRgFFAUcBRIFGgUWBR4FEQUZBRUFHQUTBRsFFwUfBRCFGIUUhRyFEoUahRaFHoURhRmFFYUdhROFG4UXhR+FEEUYRRRFHEUSRRpFFkUeRRFFGUUVRR1FE0UbRRdFH0UQxRjFFMUcxRLFGsUWxR7FEcUZxRXFHcUTxRvFF8UfxRAlGCUUJRwlEiUaJRYlHiURJRklFSUdJRMlGyUXJR8lEKUYpRSlHKUSpRqlFqUepRGlGaUVpR2lE6UbpRelH6UQZRhlFGUcZRJlGmUWZR5lEWUZZRVlHWUTZRtlF2UfZRDlGOUU5RzlEuUa5RblHuUR5RnlFeUd5RPlG+UX5R-lEBUYFRQVHBUSFRoVFhUeFREVGRUVFR0VExUbFRcVHxUQlRiVFJUclRKVGpUWlR6VEZUZlRWVHZUTlRuVF5UflRBVGFUUVRxVElUaVRZVHlURVRlVFVUdVRNVG1UXVR9VHfgOpI-uQbAKUAcVxTJCP8YWLX-p7I3sgmSK1+j-5N-g1Rg1FDUcNRI1GjUWNR41ETUZNRU1HTUTNRs1FzUfNRC1GLUUtRy1ErUatRa1HrURtRm1FbUdtRO1G7UXtR+1EHUYdRR1HHUSdRp1FnUedRF1GXUVdR11E3UbdRd1H3UQ9Rj1FPUc9RL1GvUW9R71EfUZ9RX1HfUT9Rv1F-Uf9RANGA0UDRwNEg0aDRYNHg0RDRkNFQ0dDRMNGw0XDR8NEI0QDR15FyqPgAzoCLAL2Cw0RdUQTIyIC9Ue+RAciI0QTRhNFE0cTRJNGk0WTR5NEU0ZTRVNHU0TTRtNF00fTRDNGM0UzRzNEs0azRbNHs0RzRnNFc0dzRPNG80XzR-NEC0YLRQtHC0SLRotFi0eLREtGS0VLR0tEy0bLRctHy0QrRitFK0crRKtGq0WrR6tEa0ZrRWtHa0TrRutF60frRBtGG0UbRxtEm0abRZtHm0RbRltFW0dbRtojqSFUAtQCiavuUFoCPkZ7ITX6vkQ-+ZMgDUTbR3tE+0b7RftH+0QHRgdFB0cHRIdGh0WHR4dER0ZHRUdHR0THRsdFx0fHRCdGJ0UnRydEp0anRadHp0RnRmdFZ0dnROdG50XnR+dEF0YXRRdHF0SXRpdFl0eXRFdGV0VXR1dE10bXRddH10Q3RjdFN0c3RLdGt0W3R7dEd0Z3RXdHd0T3RvdF90f3RA9GD0UPRw9Ej0aPRY9Hj0RPRk9FT0dPRM9Gz0XPR89EL0YvRS9HL0SvRq9Fr0evRG9Gb0VvR29E70bvRe9H70QfRh9FH0cfRJ9Gn0WfR59EX0ZfRV9HX0TfRt9F30ffRD9GP0U-Rz9Ev0a-Rb9Hv0R-Rn9Ff0d-RP9G-0X-R-9EAMYAxQDHAMSAxoDFgMeAxPlF20eNmDtHqLHgAyqJ7wqEAuMg1-l7IYYAe0Y3+n5EQMZgxWDHYMTgxuDF4MfgxBDGEMUQxxDEkMaQxZDHkMRQxlDFUMdQxNDG0MXQx9DEMMYwxTDHMMSwxrDFsMewxHDEn-lAxNQB1AKoKYZjQAO3YmMg6hFL8WNG3-tIgnHRr2H1RntEYMZwxsjFyMfIxCjGKMUoxyjEqMaoxajHqMRoxmjFaMdoxOjG6MXox+jEGMYYxRjHGMSYxpjFmMeYxFjGWMVYx1jE2MbYxdjH2MQ4xjjFOMc4xLjGuMW4x7jEeMZ4xXjHeMT4xvjF+Mf4xATGBMUExwTEhMaExYTHhMRExkTFRMdExMTGxMXEx8TEJMYkxSTHJMSkxqTFpMekxGTGZMVkx2TE5MbkxeTH5MQUxhTFFMcUxJTGlMWUx5TEVMZUxVTHVMTUxtTF1MfUxDTGNMU0xzTEtMa0xbTHtMR0xnTFdMd0xPTG9MX0x-TEDMYMxQzHDMSMxozFjMeMxEzGTMVMx0zEzMbMxczHzMQsxizFLMcsxKzGrMWsx6zEbMZsxWzHbMTsxuzF7MfsxBzGHMUcxxzEnMacxZzHnMRcxlzFXMdcxNzG3MXcx9zEPMY8xTzHPMS8xrzFvMe8xHzGfMV8x3zE-Mb8xfzH-MQCxgLFAscCxILGgsWCx4LEQsZCxULHQsTCxsLFwsfCxCLGIsUixyLEosaixaLHosRixmLFYsdixOLG4sXix+LEEsYSxRLHEsSSxpLFkseSxFLGUsVSx1LE0sbSxdLH0sQyxjLFMscyxLLGssWyx7LEcsZyxXLHcsTyxvLF8sfyxArGCsUKxvYBOyNNo9oD3AKiYYiCsiCGAqDFSMegxFMjCsYqxSrHKsSqxqrFqseqxGrGasVqx2rE6sbqxerH6sQaxhrFGscaxJrGmsWax5rEWsZaxVrHWsS3+orHQAIf4ToAugGIA0rG1-jjR3IhysR+RCrE2sd6xPrG+sX6x-rEBsYGxQbHBsSGxobFhseGxEbGRsVGx0bExsbGxcbHxsQmxibFJscmxKbGpsWmx6bEZsZmxWbHZsTmxubF5sfmxBbGFsUWxxbElsaWxZbHlsRWxlbFVsdWxNbG1sXWx9bENsTgxdrHisfk4UiB5yKaAowAsAKIxz5HiMbIgaDGesc3+jbFDscOxI7GjsWOx47ETsZOxU7HTsTOxs7FzsfOxC7GLsUuxy7Ersauxa7HrsRuxm7FbsduxO7G7sXux+7EHsYexR7HHsSexp7FnseexF7GXsVex17E3sbexd7H3sQ+xj7FPsc+xL7GvsW+x77EfsZ+xX7HfsT+xv7F-sf+xAHGAcUBxwHEgcaBxYHHgcRBxkHFQcdBxMHGwcXBx8HEIcYhxSHHIcShxqHFocehxGHGYcVhx2HE4cbhxeHH4cQRxhHFEccRxJHGkcWRx5HEUcZRxVHGEcdwxMDGNACBoXchU5EiA-eqmgMIgLtHY0UTI-bH40dRxPHG8cXxx-HECcYJxQnHCcSJxonFiceJxEnGScVJx0nEycbJxcnHycQpxinFKccpxhLG0cXUA9HGwWJQAiIDIgDpEtHTdsSgxnHEesdxxKnEmcaZxZnHmcRZxlnFWcdZxNnG2cXZx9nEOcY5xTnHOcS5xrnFuce5xHnGecV5x3nEGUWpxDIAacTA4rsgmgPAAbHEusQZx7tFGcU-+PnHRcTFxsXFxcfFxCXGJcUlxyXEpcalxaXHpcRlxmXFZcdlxOXG5cXlx+XEFcYVxRXHFcSVxpXFlceVxFXGVcVVx1XE1cbVxdXH1cQ1xjXFNcc1xLXGtcW1x7XEdcZ1xXXHdcT1xvXF9cf1xA3GDcUNxw3EjcaNxY3HjcRNxk3FTcdNxM3GzcXNx83ELcYtxS3HLcStxq3FrcetxG3GbcVtx23E7cbtxe3H7cQdxh3FHccdxJ3GncWdx53EXcZdxV3HXcTdxwkh+cQ0ATQCBceMAUiDOsR7IHHE+yFxxUXG3cd9xP3G-cX9x-3EA8YDxQPHA8SDxoPFg8eDxEPGQ8VDx0PEw8bDxcPHw8QjxiPEWQE7IaQAZANkALACtAOQANQAKgDmkyoC9AGFxdf6fcV7RSPEk8aTxZPHk8RTxlPFU8dTxNPG08XTx9PEM8YzxTPHM8SzxrPFs8ezxHPGc8daxKPHpAFkAOQCY8bvkeOT3APpxhPGRccTxXPES8ZLxUvHS8TLxsvFy8fLxCvGK8UrxyvEq8arxavHq8RrxmvFa8drxOvG68bDRKPEygGCcLAC0xE0UnQA5GNtA+nFu0X2xYvEyMXrxdvH28Q7xjvFO8c7xLvGu8W7x7vEe8Z7xXvHe8T7xvvF+8f7xAfGB8UHxwfEh8aHxYfHh8RHxkfFR8dHxMfGx8XHx8fEJ8YnxSfHJ8SnxqfFp8enxGfGZ8Vnx2fE58bnxefH58QXxhfFF8cXxJfGl8WXx5fEV8ZXxVfHV8TXxtfF18fXxDfGN8U3xzfEt8a3xbfHt8R3xnfFd8d3xPfG98X3x-fED8YPxQ-HD8SPxo-Fj8ePxEfEG8UgexvGdABpsUxhtsaPAlvEvkdbxeNFfcRPx6-Eb8ZvxW-Hb8Tvxu-F78fvxB-GH8Ufxx-En8afxZ-Hn8Rfxl-FX8dfxN-G38Xfx9-EP8Y-xT-HP8S-xr-Fv8e-xH-Gf8V-x3-E-8b-xf-H-8QAJgAlACcAJIAmgCWAJ4AkQCZAJUAnQCTAJsAlwCfAJCAmICUgJyAkoCagJaAnoCRgJmAlYCdgJOAm4CXgJ+AkECYQJRAnECSQJpAlkCeQJFAmUCVQJ1Ak0CbQJplF20RJqcbg0JJ0AkrGV6CLxsrGr8eLxdAncCTwJvAl8CfwJAgmCCUIJwgkiCaIJYgniCRIJkglSCdIJMgmyCXIJx9EMCeLUTAlz8c6A5ADN2OwJnIjusZwJtvHyCboJegn6CQYJhglGCcYJJgmmCWYJ5gkWCZYJVgnWCTYJtgl2CfYJDgmOCU4JzgkuCa4JbgnuCR4JngleCd4JPgm+CX4J-gkBCYEJQQnBCSEJoQn1MYoJLAAciHPx5vHCAEvxvbFvkQ3+A7FhCckJKQmpCWkJ6QkZCZkJWQnZCTkJuQl5CfkJBQmFCUUJxQklCaUJZQnlCRUJlQlVCdUJNQm1CXUJ9QkNCY0JTQnNCS0JrQltCe0JHQmdCV0J3Qk9Cb0JfQn9CQMJgwlDCcMJIwmjCWMJ4wkTCZMJUwnTCTMJswlzCfMJCwmLCUsJywkrCasJawnrCRsJmwlbCdsJOwm7CXsJ+wkHCYcJRwnHCScJ9UgRCcoJLAn4yIvx7HEysYZx2glesacJjwlPCc8JLwmvCW8J7wkfCZ8JXwnfCT8Jvwl-Cf8JAImAiUCJwIm5-ucJUQmdAKoJ+ADXCQTxbrFE8ToJIIkIiYiJSInIiSiJqIloieiJGImYiViJ2Ik4ibiJeIn4iQSJhIlEicSJJImkiWSJ5IkUiZSJVInUiTSJtIl0ifSJDImMiUyJzIksiayJbInjfmCJzAnz8VsA0IlvcWIx9-428Q8J7InCiSKJooliieKJEomSiVKJ0okyibKJconyiQqJiolKicqJKomqiWqJ6okaiZqJWonaiTqJuol6ifqJBomGiUaJxokmiaaJZonmiRaJlolWidaJNom2iXaJ9okOiY6JTonOiS6Jroluie6JHomeiV6J3ok+ib6Jfon+iQGJgYlBicGJIYmhiWGJ4YkRiZGJUYnRiTGJsYlxifGJs3HnCSbxKglOsbEJNwmusZoJcIlCiQmJOYm5iXmJ+YkFiYWJRYnFiSWJpYllieWJFYmViVWJ1Yk1ibWJdYn1iQ2JjYlNic2JLYmtiW2J7YkdiZ2JXYndiT2JvYl9if2JA4mH0UmJs-EQiU6xvInIMT1RWgmJCcZxg4mziXOJ84kLiYuJS4nLiSuJq4lrieuJG4mbiVuJ24k7ibuJe4n7iQeJh4lHiceJJ4mniWeJ54kXiZeJV4nXiTeJt4l3ifeJD4mPiX2Aw4mm8SiA+MhpiTCJdwnTiWvxT4m-iX+J-4kASYBJQEnASSBJoElgSeBJEEmQSVBJ0EkwSbBJSfEviXPxrAnjiU+R4XH1-m1+SQlwSZhJWEnYSThJuEl4SfhJBEmESURJxEkkSaRJZEnkSRRJlElXsQhJnQCTxE1mGgkfcYKJg7FUSSxJrElsSexJHEmcSVxJ3Ek8SbxJfEn8SQJJgklCScJJIkmeMTRJ3ImbAHEJAon3CcxJoklySfJJCkmKSUpJykkqSapJaknqSRpJmklaSdpJOkm6SXpJ+kkGSYZJRknGSSZJpklmSeZJFkmWSVZJ1kk2SbZJdkn2SQ5JjklOSc5JLkmuSW5J7kkeSZ5JXkneST5Jvkl+Sf5JAUmBSUFJwUkhSaFJYUnhSRFJkUlRSdFJMUmxSXFJ8UkJSYlJSUnJSSlJqUnRiOcJzGJCaOCJr3ETiRwJ34lcCWlJhUlFScVJJUmlSWVJ5UkVSZVJVUnVSTVJtUl1SfVJDUmhSeJJmUk5SShJovEySY1JnUldSd1JPUm9SX1J-UkDSYNJQ0nDSSNJo0ljSeNJE0nEiTzxaPE5AKt4HoDm8QoAUkkRcR1Jk0mrSWtJ60kbSZtJW0nbSTtJu0l7SftJB0mHSUdJx0knSadJZ0nnSRdJl0lXSddJN0m3SXdJ90kPSY9JT0nPSS9Jr0lvSe9JH0mfSV9J30k-Sb9Jf0n-SQDJgMlAycDJIMmgyWDJ4MkQyZDJUMnQyTDJsMlwyfDJCMmIyUjJyMkoyajJaMnoyRjJmMkT0dNJfPEsAHNJbQDm8YYAS0kr8flJ8IlYyeTJFMmUyVTJ1Mk0ybTJdMn0yQzJjMlMyczJLMmsyWzJ7MkcyZzJXMncyTzJvMl8yfzJAsmCyULJwskiyaLJYsniyRLJkslSydLJMsmyyXLJ8skKyYrJSsnKySrJqslqyerJGsmayVrJ2sk6ybrJesn6yQbJhslGycbJJsmmyWbJ5skWyZbJQYk4yejx22Rx9O6YbbELyMTJCQnoSTOJVsnuyR7Jnsleyd7JPsm+yX7J-skByYHJQcnBySHJoclhyeHJEcmRyVHJ0ckxybHJccnxyQnJiclJycnJKcmpyWnJ6ckZyZnJWcnZyTnJucl5yfnJBcmFyUXJxcklyaXJZcnlyRXJlclVydXJNcm1yXXJ9ckNyY3JTcnNyS3Jrcltye3JHcnOUTbJs0n2yebxMgDOyVmJskmdycPJI8mjyWPJ48kTyZPJU8nTyTPJs8lzyfPJC8mLyUvJy8kryavJa8nryRvJm8lbydvJO8m7yXvJ+8kHyYfJR8nHySfJp8lnyefJF8mXyVfJ18k3ybfJd8n3yQ-Jj8lPyc-JL8mvyW-J78kfyZ-JX8nfyT-Jv8l-yf-JACmAKUApZsndyXjJvcltsdMAA8lMScApMCmwKXAp8CkIKYgpSCnIKSgpqCloKegpGCmYKVgp2Ck4KbgpeCn4KQQphClEKcQpJCmkKWQp5CkUKZQpVCnUKTQptCl0KfQpDCmMKUwpzCksKawpbCnsKRwpnClcKdwpPCm8KXwp-CkCKYIpQinCKSIpoiliKeIpEimSKVIp1XGgKXbJ80ltsQCAUCkrSdIpKimqKWop6ikaKZopWinaKTopuil6KfopBimGKUYpxikmKaYpZinmKRYplilWKdYpNim2KXYp9ikOKY4pTinOKS4priluKe4pHimeKV4p3ik+Kb4pfin+KQEpgSlBKcEpISmhKWEp4SkRKZEpUSnRKTEpsSlxKfEpCSmJKcDRsin4yQ7JWwA8AEoppMnZiUkpOSm5KXkp+SkFKYUpRSnFKSUppSllKeUpFSmVKVUp1Sk1KbUpdSn1KQ0pjSlNKc0pLSmtKW0p7SkdKZ0pXSndKT0pvSl9Kf0pAymDKUMpwykjKaMpYynjKRMpkylTKdMpMymzKXMp8ykLKYspSynLKSspqylrKespGylMyNeRWwBdsemJqEmDyZsphylHKccpJymnKWcp5ykXKZcpVynXKTcptyl3KVdR2yk72qKocqj-AJ+JxkhTia7JP4n3Kd8pPym-KX8p-ykAqYCpQKnAqSCpoKlgqeCpEKmQqVCp0KkwqbCpcKnwqQipiKlIqcipKKmoqWip6KlJsU1RLshogJkpnykFSRipBKmEqUSpxKkkqaSpZKnkqRSplKlUqdSpNKm0qXSp9KkMqYypTKnMqSyprKlsqeypHKmcqVyp3Kk8qbypfKn8qQKpgqlCqcKpIqmiqWKp4qkSqZKpUqnSqTKpsqlyqfKpCqmKqUqpyqkqqaqpaqnqqRqpmqlaqWf+-CAgAOSAlAAMSWhJ-VFkydqppqlmqeapFqmWqVap1qk2qbapdqn2qQ6pjqk-yepIfgAqFG2xici4qcap2SlOqT6pvql+qf6pAamBqUGpwakhqaGpYanhqRGpkalRqdGpMamxqXGp8akJqYmpSanJqSmpqalpqempGamZqVmp2ak5qbmpean5qQWphalFqcWpJamlqWWp5akVqZWpVanVqTWptal1qfWpDamNqU2pzaktqa2pqEAuqcxENtz3DJ6p0jHeqW2p-akDqYOpQ6nDqSOpo6ljqeOpE6mTqVOp06kzqbOpc6nzqQupi6lLqcupK6mrqWup66kbqZupW6nbqTupu6l7qfupB6mHqUepx6knqaepZ6nnqRepl6lXqdepN6m3qXep96kPqY+pT6nPqS+pr6lvqe+pOogdqW6pWwAtSR6peylW8S7JXqlDyR+pIGmgaWBp4GkQaZBpUGnQaTBpsGlwafBpCGmIaUhpyGkoaahpaGnoaRhpmGlYadhpOGm4aXhp+GkEaYRpRGnEaSRppGlkaeRpFGmUaVRp1Gk0abRpdGn0aQxpjGlMacxpLGmsaWxp7GkcaZxpXGncacVIX6ldqS1J6cg9qfKxwGk8aaJpYmniaRJpkmlSadJpMmmyaXJp8mkKaYppSmnKaSppqmlqaeppGmmaaVpp2mk6abppemn6aQZphmlGacZpJmmmaWZp5mkWaZZpVmnWaTZptml2afZpDmmOaU5pzmkuaa5pbmnuaR5pnmlead5pp-58ILwguqnTaK3i7si+ACBo+oBYAFY4yQAMAGTUfIAZysbavACKIPaA49gFAHYA0WnOyBYAwGilqKuk22SY2H6AewA8gHgAjIAYWIKAwoDagKKA2gA8gHyAAoCUAEKAsyQcgA+RawCMgCSAWdiEgMSApIAgABlp2QTG8S1pSwBtaSVoH1iEAJjY0ICrqMlpqACIJLAANIAMALV+XQDHAM0o3WkkgGqASzIkgBQAKACOiiSA-mlAAA",
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
let materialPlacementBatchDepth = 0;
let materialPlacementBatchNeedsWorldStateUpdate = false;
let materialPlacementBatchNeedsCompletionUpdate = false;
let materialPlacementBatchNeedsAnnouncement = false;

export function withCampaignMaterialPlacementBatch(callback) {
    materialPlacementBatchDepth++;
    try {
        return callback();
    } finally {
        materialPlacementBatchDepth--;
        if (materialPlacementBatchDepth === 0) flushCampaignMaterialPlacementBatch();
    }
}

function flushCampaignMaterialPlacementBatch() {
    if (!materialPlacementBatchNeedsWorldStateUpdate &&
        !materialPlacementBatchNeedsCompletionUpdate && !materialPlacementBatchNeedsAnnouncement) return;

    const updateWorldState = materialPlacementBatchNeedsWorldStateUpdate;
    const updateCompletion = materialPlacementBatchNeedsCompletionUpdate;
    const announce = materialPlacementBatchNeedsAnnouncement;
    materialPlacementBatchNeedsWorldStateUpdate = false;
    materialPlacementBatchNeedsCompletionUpdate = false;
    materialPlacementBatchNeedsAnnouncement = false;

    if (updateWorldState) updateWorldStateObjectives();
    if (updateCompletion) updateMissionCompletion({ announce: false });
    if (announce) announceCampaignChange();
}

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
    if (materialPlacementBatchDepth > 0) {
        materialPlacementBatchNeedsWorldStateUpdate = true;
        materialPlacementBatchNeedsCompletionUpdate = true;
        materialPlacementBatchNeedsAnnouncement = true;
    } else {
        updateWorldStateObjectives();
        updateMissionCompletion();
        announceCampaignChange();
    }
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
    const recorder = typeof window !== 'undefined' ? window.__P0_PERF__ : null;
    const profiling = !!recorder?.enabled && typeof recorder.record === 'function';
    const startedAt = profiling ? performance.now() : 0;
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
    if (profiling) recorder.record('campaignWorldStateObjectiveScan', performance.now() - startedAt, {
        worldCells: type.length,
        pendingObjectives: pendingObjectives.length
    });
}

function updateMissionCompletion({ announce = true } = {}) {
    if (!campaignState || campaignState.missionCompleted) return;
    const mission = getCurrentMission();
    if (!mission.objectives.every(objective => (campaignState.objectiveProgress[objective.id] || 0) >= objective.target)) return;
    campaignState.missionCompleted = true;
    campaignState.campaignComplete = !getNextMission();
    campaignState.recapDismissed = false;
    campaignState.firedEventIds.push('mission:complete');
    if (announce) announceCampaignChange();
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
