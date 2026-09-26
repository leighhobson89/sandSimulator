import { assertValidWorldDimensions } from './worldConfig.js';

// physics.js
// -----------------------------------------------------------------------------
// The whole simulation lives here. Nothing in this file touches the DOM, so it
// can also be run headless (see tools/simTest.mjs) for testing.
//
// The world is a set of flat typed arrays, one entry per cell. Flat arrays are
// used instead of grid[x][y] because they are much faster to read and cheap to
// copy. Use index(x, y) to get from a coordinate to an array slot.
//
//   type    which particle is in the cell (0 = empty air)
//   temp    temperature of the cell in degrees C
//   life    frames left before the particle decays (0 = it never decays)
//   lifeMax starting lifetime for per-pixel late-life transitions
//   residue what the cell leaves behind when its life runs out (0 = use the
//           particle's own decaysInto). This is how burning wood leaves ash.
//   moved   set to 1 once a particle has moved this frame, so that no particle
//           can move twice in the same frame
//   shade   a fixed random number per cell used to vary the colour slightly, so
//           sand looks grainy instead of flat, and to give cooling speeds a
//           stable per-particle variation where a material asks for it
//   heat    how much heat has built up towards the next state change (see the
//           latent heat note further down)
//   surface for liquids, the top of the body of liquid this cell is joined to
//   data    a spare number per cell that a few particles use for their own
//           purposes: the fuse on a lit bomb, how much growing a plant has
//           left in it, or a machine's facing direction. Ray particles use the
//           lower three bits for their projectile direction; hand-painted rays
//           use cardinal values 0-3, while emitted machine rays may use all
//           eight directions and additionally use bit 3 as a marker.
//   power   frames of visible electrical power left in a conductive cell
//   powerDelay  frames until an electrical pulse reaches a conductive cell
//   charge  persistent stored charge for materials that can retain it; this is
//           floating point so a large connected mass can share one small input
//   wind    how recently moving air passed through the cell, 0 to 255, fading a
//           little every frame. It is the visible haze, not air momentum
//   airflowX/Y and airflowNextX/Y  decaying air momentum used by powered Fans;
//           it carries loose particles beyond the visible cone before fading
// -----------------------------------------------------------------------------

export const EMPTY = 0;
const OUT_OF_BOUNDS = -1;
const STORAGE_VIRTUAL_WALL = -2;
const NO_SURFACE = 32000;
const MAX_WATER_INFILTRATION_DEPTH = 50;
const CORROSION_POWDER_EXPOSURE_REQUIRED = 360;
const POWER_GLOW_FRAMES = 7;
const BATTERY_DISCHARGE_SCALE = 100;
const ELECTRICAL_NEIGHBOURS = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],           [1, 0],
    [-1, 1],  [0, 1],  [1, 1]
];

let COLS = 0;
let ROWS = 0;
let world = null;
// The flood mask borrows the movement flags before they are cleared for the
// current tick. Queue views borrow the two temperature buffers, which are
// overwritten by diffuseHeat immediately after the flood fill completes.
let tempFloodQueue = null;
let tempNextFloodQueue = null;

// DEFS[id] is the definition for that particle. DEFS[0] is air.
let DEFS = [];
const AIR_SPACE_BY_TYPE = new Uint8Array(256);
let AMBIENT = 8;
let ambientTarget = 8;
let ambientHumidityTarget = 50;
let dewpointTarget = 10;
let frameCount = 0;
let humidityCursor = 0;
let cloudCursor = 0;
const PREVAILING_WIND_CYCLE_TICKS = 108_000;
let prevailingWindDirection = 1;
let prevailingWindTicksRemaining = PREVAILING_WIND_CYCLE_TICKS;
let prevailingWindHasStarted = false;
let generalWindStrength = 7;
let gustWindStrength = 7;

// Randomness is deliberately kept behind one tiny boundary. The browser uses
// its usual source, while tests (and future replays) can supply a seed or a
// custom source without patching global state.
let randomSource = Math.random;
let randomSeed = null;

export function setRandomSource(source) {
    if (typeof source !== 'function') throw new TypeError('Random source must be a function');
    randomSource = source;
    randomSeed = null;
}

export function setRandomSeed(seed) {
    randomSeed = Number(seed) >>> 0;
    let state = randomSeed;
    randomSource = () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

export function getRandomSeed() { return randomSeed; }

export function resetRandomSource() {
    randomSource = Math.random;
    randomSeed = null;
}

function random() { return randomSource(); }

// The plant that wet mud grows, worked out from the sprout rules when the
// definitions are prepared. A plant rooted in both wet mud and wet sand grows
// as this one, wet mud being the richer of the two soils.
let WET_MUD_PLANT = EMPTY;

// The air is not perfectly even. Each cell settles towards an air temperature a
// degree or two either side of the dial, giving a spread of up to AIR_VARIANCE
// degrees between one particle and the next. It keeps large flat areas from
// looking like one dead flat block of colour in heat view, and means a pond
// sitting right on freezing point ices over in patches rather than all at once.
//
// The offset comes from the cell's shade number, which is a fixed random value
// that travels with the particle, so a given particle keeps its own quirk
// rather than flickering about as it moves.
const AIR_VARIANCE = 4;
const airOffset = new Float32Array(256);
for (let s = 0; s < 256; s++) airOffset[s] = (s / 255 - 0.5) * AIR_VARIANCE;

// Open-air temperature follows a smooth, fixed atmospheric profile centered on
// the Air Temperature setting: the surface is 7.5 C warmer and the top is
// 7.5 C cooler. Enclosed air keeps its own temperature as before.
const ATMOSPHERE_HALF_RANGE = 7.5;

// The outside-air temperature at a given row, before per-particle variance.
export function getAirTempAt(y) {
    if (ROWS <= 1) return AMBIENT;
    const heightFraction = Math.max(0, Math.min(1, y / (ROWS - 1)));
    return AMBIENT + (heightFraction - 0.5) * ATMOSPHERE_HALF_RANGE * 2;
}

// ---------------------------------------------------------------- definitions

// Turns the raw particles.json into an array indexed by id, with every "name"
// reference (meltsInto: "Water") resolved to a numeric id up front so the
// simulation never has to compare strings while it is running.
export function prepareDefinitions(json) {
    const raw = json.particles;
    const nameToId = {};
    Object.keys(raw).forEach(id => { nameToId[raw[id].name.toLowerCase()] = parseInt(id); });
    // Particle ID 52 is now named Sprinkler. Keep the former display name as
    // an input alias while resolving names embedded in legacy particle rules.
    if (nameToId.sprinkler !== undefined) nameToId.vent = nameToId.sprinkler;

    const toId = name => (name ? (nameToId[String(name).toLowerCase()] || EMPTY) : EMPTY);

    AMBIENT = json.ambientTemp !== undefined ? json.ambientTemp : 8;
    // The dial starts where the air actually is, so nothing drifts on load.
    ambientTarget = AMBIENT;

    // Air. Air is never drawn and never moves, but it does carry heat.
    const defs = [{
        id: EMPTY,
        name: 'Air',
        category: 'air',
        density: 0,
        conductivity: json.airConductivity !== undefined ? json.airConductivity : 0.06,
        thermalNetworkRate: 0,
        cooling: json.airCooling !== undefined ? json.airCooling : 0.012,
        bulkInsulation: 0,
        defaultTemp: AMBIENT,
        emit: 0,
        emitRate: 0,
        conductive: false,
        electricalConductivity: 0,
        tubing: false,
        energizesConductors: false,
        chargeCapacity: 0,
        chargePerSpark: 0,
        chargeSparkChance: 0,
        dischargeBattery: false,
        powerConsumption: 0,
        sparkEmitterChance: 0,
        // Air is built here by hand rather than from particles.json, so every
        // field the per-frame code reads has to be spelled out. Leaving one off
        // does not read as zero: a test like "radiates <= 0" is false for
        // undefined, so air would start radiating undefined degrees and turn
        // the temperature of the whole world into NaN.
        coolsBy: 0,
        radiates: 0,
        clings: 0,
        glowTemp: 0,
        glowStartTemp: null,
        glowRgb: null,
        alpha: 1,
        projectile: false,
        projectileSpeed: 0,
        rgb: [0, 0, 0],
        rgb2: [0, 0, 0]
    }];

    Object.keys(raw).map(k => parseInt(k)).sort((a, b) => a - b).forEach(id => {
        const p = raw[id];
        if (typeof p.description !== 'string' || !p.description.trim()) {
            throw new Error(`Particle ${p.name || id} is missing its glossary description`);
        }
        const def = {
            id: id,
            name: p.name,
            description: p.description.trim(),
            alpha: p.alpha === undefined ? 1 : Math.max(0, Math.min(1, p.alpha)),
            group: p.group || 'Other',
            category: p.category,
            density: p.density || 0,

            fallSpeed: p.fallSpeed || 0,
            // Fractional gravity cadence for exceptionally light powders.
            // fallSpeed cannot go below one cell, so Ash uses this to fall on
            // only some frames and genuinely drift down more slowly than Snow.
            fallChance: p.fallChance === undefined ? 1 : p.fallChance,
            slide: p.slide || 0,
            repose: p.repose || 1,
            spread: p.spread || 0,
            flowSteps: p.flowSteps || 1,
            moveChance: p.moveChance === undefined ? 1 : p.moveChance,
            drift: p.drift || 0,
            // Some liquids (lava) rest on occupied cells and rely on heat or
            // reactions to consume them instead of swapping underneath them.
            displacesMaterials: p.displacesMaterials !== false,

            conductivity: p.conductivity === undefined ? 0.06 : p.conductivity,
            // Direct per-substep exchange rate for the fast local conductor
            // network. Materials outside that network leave this at zero.
            thermalNetworkRate: p.thermalNetworkRate === undefined
                ? 0
                : Math.max(0, p.thermalNetworkRate),
            ambientCooling: p.ambientCooling !== false,
            cooling: p.cooling === undefined ? 0.004 : p.cooling,
            // A stable per-particle +/- fraction of the normal cooling rate.
            // The shade value supplies the variation without making it flicker
            // from frame to frame.
            coolingVariance: p.coolingVariance === undefined ? 0 : p.coolingVariance,
            // Electrical conduction is separate from heat conduction. Every
            // ordinary material receives false/zero defaults; metals opt in
            // and use the numeric value to set pulse speed.
            conductive: !!p.conductive,
            electricalConductivity: p.conductive
                ? Math.max(0.01, p.electricalConductivity || 1)
                : 0,
            tubing: !!p.tubing,
            machine: p.machine || null,
            storageCategory: p.storageCategory || null,
            storageCapacity: p.storageCapacity || 0,
            machineWindSpeed: p.machineWindSpeed,
            machineTemp: p.machineTemp,
            machineRange: p.machineRange || 0,
            machineRate: p.machineRate || 0,
            machineEmits: toId(p.machineEmits),
            wireReach: p.wireReach || 0,
            energizesConductors: !!p.energizesConductors,
            chargeCapacity: p.chargeCapacity || 0,
            chargePerSpark: p.chargePerSpark || 0,
            chargeSparkChance: p.chargeSparkChance || 0,
            dischargeBattery: !!p.dischargeBattery,
            // Power draw is summed across every conductive cell in a battery's
            // connected grid once per simulation tick. This leaves room for
            // machines to draw hundreds of units while a wire draws very little.
            powerConsumption: p.powerConsumption || 0,
            sparkEmitterChance: p.sparkEmitterChance || 0,
            // How strongly a cell is protected when it is buried inside more
            // of the same material. Exposed faces keep most of their normal
            // response; fully surrounded cells retain heat or cold longer.
            bulkInsulation: p.bulkInsulation === undefined
                ? defaultBulkInsulation(p.category)
                : p.bulkInsulation,
            // Degrees given up per frame on its own account, whatever the air
            // is doing. This is how something that starts white hot cools: at
            // its own pace, evenly through the whole of it, and never below the
            // temperature of its surroundings.
            coolsBy: p.coolsBy || 0,
            // A crust over the top of it holds the heat in. Name the things
            // that count as a crust, and how much of its own cooling is left
            // while one is lying on it: lava under its own scoria gives up its
            // heat a tenth as fast, which is what lets a flow stay molten
            // underneath long after the top of it has gone hard.
            insulatedBy: (p.insulatedBy || []).map(toId),
            insulatedCooling: p.insulatedCooling === undefined ? 1 : p.insulatedCooling,
            // The floor of the world is the heat the world sits on. Anything
            // resting right on it never sets by cooling alone - only water can
            // put it out - so a lava lake on the bedrock stays a lava lake.
            bedrockKeepsMolten: !!p.bedrockKeepsMolten,
            // Degrees per frame thrown at everything around it, in all eight
            // directions rather than only the four that conduction uses. This
            // is how a fire spreads sideways: a flame rises away from what lit
            // it far too quickly to warm its neighbours by touch alone, and
            // without it a pool of oil or a row of plants would only ever burn
            // from underneath.
            radiates: p.radiates || 0,
            // Chance per frame that a flame stays where it is rather than
            // rising, for as long as there is fuel beside it.
            clings: p.clings || 0,
            defaultTemp: p.defaultTemp === undefined ? AMBIENT : p.defaultTemp,
            emit: p.emit || 0,
            emitRate: p.emitRate || 0,
            // The temperature the colour fade treats as fully hot. A heat
            // source glows up to its own emit, so that is the default; anything
            // that only glows on its way down - cooling scoria - names the
            // temperature it was last properly hot at instead.
            glowTemp: p.glowTemp !== undefined ? p.glowTemp : (p.emit || 0),
            glowStartTemp: p.glowStartTemp === undefined ? null : p.glowStartTemp,
            forceTemp: p.forceTemp,
            forceRate: p.forceRate || 0,
            projectile: !!p.projectile,
            projectileSpeed: p.projectile ? Math.max(1, p.projectileSpeed || 1) : 0,

            blastRadius: p.blastRadius || 0,
            fuse: p.fuse || 0,
            blastProof: !!p.blastProof,

            growHeight: p.growHeight || 0,
            growHeightMin: p.growHeightMin || p.growHeight || 0,
            flowerInto: toId(p.flowerInto),
            growChance: p.growChance || 0,
            // How this one grows. Left out, it climbs as an ordinary stem.
            // "netting" weaves its way up through water as a mesh, "surface"
            // creeps sideways along the top of the water as a lily pad.
            growStyle: p.growStyle || null,
            isSeed: !!p.isSeed,
            plantSpecies: p.plantSpecies || null,
            plantMinTemp: p.plantMinTemp === undefined ? -273 : p.plantMinTemp,
            plantMaxTemp: p.plantMaxTemp === undefined ? 1000 : p.plantMaxTemp,
            plantIdealTemp: p.plantIdealTemp === undefined ? 20 : p.plantIdealTemp,
            plantMinHumidity: p.plantMinHumidity === undefined ? 0 : p.plantMinHumidity,
            plantMaxHumidity: p.plantMaxHumidity === undefined ? 100 : p.plantMaxHumidity,
            plantIdealHumidity: p.plantIdealHumidity === undefined ? 50 : p.plantIdealHumidity,
            germinationMinHumidity: p.germinationMinHumidity === undefined ? 0 : p.germinationMinHumidity,
            germinationMinTemp: p.germinationMinTemp === undefined ? -273 : p.germinationMinTemp,
            moistureNeed: p.moistureNeed || 0,
            humidityContribution: p.humidityContribution || 0,
            richSoilGrowthBonus: p.richSoilGrowthBonus || 0,
            richSoilGrowthMultiplier: p.richSoilGrowthMultiplier || 1,
            poorSoilHealthCap: p.poorSoilHealthCap === undefined ? 1 : p.poorSoilHealthCap,
            surfacePad: toId(p.surfacePad),
            surfacePadGrowth: p.surfacePadGrowth || 6,
            seedLimit: p.seedLimit || 0,
            dewpointCondensation: !!p.dewpointCondensation,
            precipitationChance: p.precipitationChance || 0,
            metal: !!p.metal,
            seedChance: p.seedChance || 0,
            seedWaterRange: p.seedWaterRange || 0,
            seedInto: toId(p.seedInto),
            // What a seed can come up on, and what it becomes there. Good
            // ground gives a taller plant than poor ground, and submergedInto
            // is what it comes up as instead when the ground it landed on is at
            // the bottom of open water.
            sprouts: (p.sprouts || []).map(rule => ({
                on: toId(rule.on),
                into: toId(rule.into),
                submergedInto: toId(rule.submergedInto),
                chance: rule.chance === undefined ? 0.04 : rule.chance
            })),
            sproutMinTemp: p.sproutMinTemp === undefined ? -273 : p.sproutMinTemp,
            // How deep the water overhead has to be before a seed counts as
            // germinating underwater rather than in a puddle.
            submergedDepth: p.submergedDepth || 4,

            // Some of what a plant sets comes up buoyant and some does not, and
            // which it is, is settled the moment the seed exists rather than
            // being worked out later. A buoyant one weighs floatDensity instead
            // of its own density, so it rides on top of water; the rest sink
            // straight to the bottom.
            floatChance: p.floatChance || 0,
            floatDensity: p.floatDensity === undefined ? p.density || 0 : p.floatDensity,

            meltPoint: p.meltPoint,
            meltsInto: toId(p.meltsInto),
            freezePoint: p.freezePoint,
            freezesInto: toId(p.freezesInto),
            // Set on anything that has to come to rest before it can set solid.
            // Lava uses it, so that a falling stream goes on falling until it
            // lands rather than turning to stone on the way down.
            freezeNeedsGround: !!p.freezeNeedsGround,
            boilPoint: p.boilPoint,
            boilsInto: toId(p.boilsInto),
            boilEmits: toId(p.boilEmits),
            depositPoint: p.depositPoint,
            depositsInto: toId(p.depositsInto),
            evaporatesAbove: p.evaporatesAbove,
            evaporationHumidity: p.evaporationHumidity || 0,
            // Some gases can escape instead of becoming a liquid or deposit.
            // This is checked only once the gas has actually reached its
            // condensation point, so placement and production do not decide
            // its fate early.
            condenseLossChance: p.condenseLossChance === undefined ? 0 : p.condenseLossChance,
            // What this turns into when it comes to rest against something
            // else: snow melting the moment it lands in water, or packing down
            // into ice where it settles on ice.
            contacts: (p.contacts || []).map(rule => ({
                on: toId(rule.on),
                into: toId(rule.into),
                chance: rule.chance === undefined ? 1 : rule.chance,
                temp: rule.temp
            })),
            // A slow contact reaction applied to the cell immediately below
            // this one. Lava uses it to bake loose mud into compact scoria
            // without replacing or sinking through the mud.
            convertsBelow: (p.convertsBelow || []).map(rule => ({
                on: toId(rule.on),
                into: toId(rule.into),
                chance: rule.chance === undefined ? 1 : rule.chance,
                temp: rule.temp
            })),
            ignitePoint: p.ignitePoint,
            burnsInto: toId(p.burnsInto),
            burnLife: p.burnLife || 0,
            emberInto: toId(p.emberInto),
            latent: p.latent || 0,

            life: p.life || 0,
            lifeVariance: p.lifeVariance || 0,
            decaysInto: toId(p.decaysInto),
            // A long-lived material can turn into a shorter-lived material
            // while it is wearing out, rather than jumping straight to its
            // final residue. Spark Block uses this to become Spark Dust in
            // the last tenth of its life.
            lifeTransitionAt: p.lifeTransitionAt || 0,
            lifeTransitionInto: toId(p.lifeTransitionInto),
            // Most particles that expire leave their by-product every time;
            // a material such as toxic gas can instead have a diminishing
            // conversion rate so its cycle cannot feed itself forever.
            decayChance: p.decayChance === undefined ? 1 : p.decayChance,
            smokeChance: p.smokeChance || 0,

            // wetsInto/wetChance describe how readily this dry powder soaks up
            // a drop filtering down onto it. Dry ground is 1, meaning the
            // moment water reaches it, it becomes the wet form.
            wetsInto: toId(p.wetsInto),
            wetChance: p.wetChance || 0,
            // Wet powders let water keep filtering down through them. A drop
            // stores how many powder cells it has crossed, so it can be stopped
            // at the shared infiltration depth instead of draining arbitrarily
            // deep ground.
            waterPermeability: p.waterPermeability || 0,
            // A supported column keeps this many cells of its loose form. Any
            // deeper cells compact from the bottom upwards into compactsInto.
            compactsInto: toId(p.compactsInto),
            compactDepth: p.compactDepth || 0,
            soaks: !!p.soaks,
            quenchedInto: toId(p.quenchedInto),
            douses: !!p.douses,
            corrodible: !!p.corrodible,
            // Weathering is accumulated as sustained exposure. A higher
            // resistance stretches the interval before a metal becomes powder.
            corrosionResistance: Math.max(1, p.corrosionResistance || 1),
            corrosion: p.corrosion || 0,
            // The fumes given off where it eats something away. They are left
            // in the hole rather than puffed out at random, so a bank being
            // dissolved gives off gas along the face of it.
            corrodeEmits: toId(p.corrodeEmits),
            // What this turns living things it touches into. The gas doing it
            // is not used up in the process - it kills what it drifts through
            // and carries on - and it works on anything that grows, so a new
            // plant in particles.json is covered without a change in here.
            withersPlants: toId(p.withersPlants),
            witherChance: p.witherChance === undefined ? 0.3 : p.witherChance,
            // How readily the wind picks it up. Left out, it follows from what
            // sort of thing it is: gases go wherever the wind does, loose
            // powders skitter along, liquids barely ripple and nothing fixed
            // moves at all. Anything that does not fit that - wet ground, ice,
            // snow - says so for itself.
            windLift: p.windLift !== undefined ? p.windLift : defaultWindLift(p.category),
            tool: p.tool || null,

            rgb: parseColor(p.color),
            rgb2: parseColor(p.color2 || p.color),
            gradient: !!p.color2,
            glowRgb: p.glowColor ? parseColor(p.glowColor) : null,
            // Flowers come out a different colour each time. Each cell keeps a
            // fixed random number in its shade slot, which picks one of these.
            palette: p.rainbow ? rainbowPalette() : null
        };

        // Worked out once here so the per-frame loop can skip particles that
        // have nothing to do instead of testing a dozen properties every frame.
        def.hasStateChange = def.meltPoint !== undefined || def.freezePoint !== undefined ||
            def.boilPoint !== undefined || def.ignitePoint !== undefined ||
            def.evaporatesAbove !== undefined;
        def.hasReaction = def.life > 0 || def.soaks || def.corrosion > 0 || def.metal ||
            def.growChance > 0 || def.emit > 0 || def.quenchedInto !== EMPTY ||
            def.blastRadius > 0 || def.sprouts.length > 0 || def.seedChance > 0 ||
            def.dewpointCondensation || def.precipitationChance > 0 || def.isSeed ||
            def.douses || def.contacts.length > 0 || def.withersPlants !== EMPTY ||
            def.compactsInto !== EMPTY || def.convertsBelow.length > 0 ||
            def.energizesConductors || def.chargeCapacity > 0 ||
            def.sparkEmitterChance > 0;
        def.moves = def.category !== 'static';

        // A second, lighter copy of anything that can come up buoyant. The
        // movement code picks whichever of the two matches the cell it is
        // looking at, so buoyancy costs nothing at all for everything else.
        def.buoyant = def.floatChance > 0
            ? Object.assign({}, def, { density: def.floatDensity, buoyant: null })
            : null;

        defs[id] = def;
    });

    DEFS = defs;
    AIR_SPACE_BY_TYPE.fill(0);
    AIR_SPACE_BY_TYPE[EMPTY] = 1;
    for (let id = 1; id < defs.length; id++) {
        if (defs[id]?.category === 'gas') AIR_SPACE_BY_TYPE[id] = 1;
    }
    for (const name in nameCache) delete nameCache[name];

    // Which plant counts as the wet mud one. Worked out from the sprout rules
    // rather than named in code, so that renaming or retuning the plants in
    // particles.json does not need a change in here.
    // What the wind cannot get past. Solid drawn materials - wall, stone,
    // glass, wood - shelter whatever is behind them; growing things do not,
    // because wind goes through a plant rather than round it.
    //
    // Which things count as growing is worked out from the definitions rather
    // than listed here, so a plant added to particles.json is covered without
    // anything in this file changing: anything that grows, anything growing
    // opens into, and anything a seed comes up as.
    const growing = new Set();
    for (const def of defs) {
        if (!def) continue;
        if (def.growHeight > 0) {
            growing.add(def.id);
            if (def.flowerInto !== EMPTY) growing.add(def.flowerInto);
        }
        for (const rule of def.sprouts || []) {
            if (rule.into !== EMPTY) growing.add(rule.into);
            if (rule.submergedInto !== EMPTY) growing.add(rule.submergedInto);
        }
    }
    for (const def of defs) {
        if (!def) continue;
        def.isPlant = growing.has(def.id);
        def.blocksWind = def.category === 'static' && !def.isPlant;
    }

    WET_MUD_PLANT = EMPTY;
    const wetMud = nameToId['wet mud'];
    for (const def of defs) {
        if (!def || !def.sprouts || def.plantSpecies) continue;
        for (const rule of def.sprouts) {
            if (rule.on !== wetMud) continue;
            if (DEFS[rule.into] && DEFS[rule.into].growHeight > 0) WET_MUD_PLANT = rule.into;
        }
    }

    return defs;
}

function defaultWindLift(category) {
    if (category === 'gas') return 1;
    if (category === 'powder') return 0.5;
    if (category === 'liquid') return 0.1;
    return 0;
}

function parseColor(str) {
    const m = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(str || '');
    return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : [255, 0, 255];
}

// Twelve colours evenly spaced round the colour wheel, bright enough to read
// against a dark background.
function rainbowPalette() {
    const colours = [];
    for (let step = 0; step < 12; step++) {
        const hue = step / 12;
        colours.push([
            channelFromHue(hue + 1 / 3),
            channelFromHue(hue),
            channelFromHue(hue - 1 / 3)
        ]);
    }
    return colours;
}

// One channel of a fully saturated colour at the given point on the wheel.
function channelFromHue(hue) {
    hue = ((hue % 1) + 1) % 1;
    let value;
    if (hue < 1 / 6) value = 6 * hue;
    else if (hue < 1 / 2) value = 1;
    else if (hue < 2 / 3) value = 4 - 6 * hue;
    else value = 0;
    return Math.round(70 + value * 185);
}

export function getDefinitions() { return DEFS; }
export function getAmbientTemp() { return AMBIENT; }

// The air temperature the world is heading towards. Setting it does not snap
// the world to that temperature: stepSimulation eases the actual ambient
// towards it a little each frame, so turning the dial down feels like a cold
// front rolling in rather than a switch being thrown.
export function setAmbientTarget(value) { ambientTarget = value; }
export function getAmbientTarget() { return ambientTarget; }
export function setAmbientHumidityTarget(value) {
    if (!Number.isFinite(Number(value))) return;
    ambientHumidityTarget = Math.max(0, Math.min(100, Number(value)));
}
export function getAmbientHumidityTarget() { return ambientHumidityTarget; }
export function getHumidityAt(x, y) {
    if (!world || !inBounds(x, y)) return ambientHumidityTarget;
    return humidityNearCell(x, y);
}
export function setDewpointTarget(value) {
    if (!Number.isFinite(Number(value))) return;
    dewpointTarget = Math.max(0, Math.min(100, Number(value)));
}
export function getDewpointTarget() { return dewpointTarget; }

export function getPlantHealth(x, y) {
    if (!world || !inBounds(x, y)) return null;
    const i = index(x, y);
    const def = DEFS[world.type[i]];
    if (!def?.isPlant || !def.plantSpecies) return null;
    return plantHealthStateAt(x, y, def);
}

function plantHealthStateAt(x, y, def) {
    const i = index(x, y);
    const temperature = world.temp[i];
    const humidity = humidityNearCell(x, y);
    const moisture = plantMoistureAt(x, y, def);
    const substrate = plantSubstrateNearby(x, y, def, moisture);
    const thrives = temperature >= def.plantMinTemp && temperature <= def.plantMaxTemp &&
        humidity >= def.plantMinHumidity && humidity <= def.plantMaxHumidity && substrate;
    if (thrives) return 'thriving';
    const survives = temperature >= def.plantMinTemp - 12 && temperature <= def.plantMaxTemp + 12 &&
        humidity >= Math.max(0, def.plantMinHumidity - 28) &&
        humidity <= Math.min(100, def.plantMaxHumidity + 18) &&
        substrate;
    return survives ? 'surviving' : 'dying';
}

function plantSubstrateNearby(x, y, def, moisture = plantSubstrateMoisture(x, y, def)) {
    return moisture > 0 && moisture >= (def.moistureNeed || 0);
}

function plantMoistureAt(x, y, def) {
    return plantSubstrateMoisture(x, y, def);
}

function plantSubstrateMoisture(x, y, def) {
    if (def.growStyle === 'moss' || def.plantSpecies === 'moss') {
        let moisture = 0;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
            const name = DEFS[typeAt(x + dx, y + dy)]?.name;
            if (name === 'Wet Mud') moisture = Math.max(moisture, 100);
            else if (name === 'Wet Sand' || name === 'Wet Ash') moisture = Math.max(moisture, 70);
            else if (name === 'Wood' || name === 'Stone') moisture = Math.max(moisture, 60);
        }
        return moisture;
    }
    if (def.plantSpecies === 'water grass') return waterWithin(x, y, 6) ? 100 : 0;
    const root = rootedIn(x, y);
    if (root === ROOT_RICH) return 100;
    if (root === ROOT_POOR) return 70;
    if (def.plantSpecies === 'banana' && waterWithin(x, y, 6)) return 100;
    return 0;
}

function germinationMoistureAt(x, y, def, substrateId) {
    if (def.plantSpecies === 'moss') {
        const name = DEFS[substrateId]?.name;
        if (name === 'Wet Mud') return 100;
        if (name === 'Wet Sand' || name === 'Wet Ash') return 70;
        if (name === 'Wood' || name === 'Stone') return 60;
        return 0;
    }
    if (def.plantSpecies === 'water grass') return waterWithin(x, y, 6) ? 100 : 0;
    if (substrateId === idOf('Wet Mud')) return 100;
    if (substrateId === idOf('Wet Sand') || substrateId === idOf('Wet Ash')) return 70;
    if (def.plantSpecies === 'banana' && substrateId === idOf('Water')) return 100;
    return 0;
}

function plantIdealFitness(value, ideal, min, max) {
    const span = value < ideal ? ideal - min : max - ideal;
    if (span <= 0) return value === ideal ? 1 : 0;
    return Math.max(0, Math.min(1, 1 - Math.abs(value - ideal) / span));
}

function plantVigorAt(x, y, def) {
    const i = index(x, y);
    const temperatureFitness = plantIdealFitness(
        world.temp[i], def.plantIdealTemp, def.plantMinTemp, def.plantMaxTemp);
    const humidityFitness = plantIdealFitness(
        humidityNearCell(x, y), def.plantIdealHumidity, def.plantMinHumidity, def.plantMaxHumidity);
    const moisture = plantMoistureAt(x, y, def);
    const moistureFitness = def.moistureNeed > 0
        ? Math.max(0, Math.min(1, moisture / (def.moistureNeed * 1.25)))
        : 1;
    return Math.min(temperatureFitness, humidityFitness, moistureFitness);
}

function mossSubstrateWithin(x, y, radius) {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        const id = typeAt(x + dx, y + dy);
        if (id <= 0) continue;
        const name = DEFS[id].name;
        if (name === 'Wood' || name === 'Stone' || name === 'Wet Sand' ||
            name === 'Wet Mud' || name === 'Wet Ash') return true;
    }
    return false;
}

function updatePlantHealth(x, y, i, def) {
    const state = plantHealthStateAt(x, y, def);
    const grassOnPoorSoil = def.plantSpecies === 'grass' && rootedIn(x, y) === ROOT_POOR;
    const target = state === 'thriving'
        ? Math.min(0.55 + 0.45 * plantVigorAt(x, y, def),
            grassOnPoorSoil ? def.poorSoilHealthCap : 1)
        : state === 'surviving' ? 0.55 : 0;
    const value = world.plantHealth[i];
    world.plantHealth[i] = target > value
        ? Math.min(target, value + 0.012)
        : Math.max(target, value - 0.01);
    if (world.plantCooldown[i] > 0) world.plantCooldown[i]--;
    if (world.plantHealth[i] <= 0 && state === 'dying') {
        transform(i, idOf('Dry Mud'));
        return true;
    }
    return false;
}

function spreadMoss(x, y, i, def) {
    const budget = world.data[i];
    if (budget <= 1 || random() >= def.growChance) return false;
    const direction = random() < 0.5 ? -1 : 1;
    for (const dx of [direction, -direction]) {
        const nx = x + dx;
        if (typeAt(nx, y) !== EMPTY || !mossSubstrateWithin(nx, y, 3)) continue;
        const ni = index(nx, y);
        transform(ni, def.id);
        world.data[ni] = budget - 1;
        world.plantHealth[ni] = world.plantHealth[i];
        world.data[i] = 1;
        return false;
    }
    return false;
}

// Banana plants keep a narrow upright trunk. Every few levels it sends out
// paired, gently raised fronds so the crown reads as a broad tropical plant.
function growBananaFronds(x, y, health) {
    const leaf = idOf('Banana Leaf');
    if (leaf === EMPTY) return;
    for (const direction of [-1, 1]) {
        for (let step = 1; step <= 4; step++) {
            const nx = x + direction * step;
            const ny = y - (step >= 3 ? 1 : 0);
            if (!inBounds(nx, ny) || typeAt(nx, ny) !== EMPTY) continue;
            const ni = index(nx, ny);
            transform(ni, leaf);
            world.data[ni] = 1;
            world.plantHealth[ni] = health;
        }
    }
}

function countNearbySeedType(x, y, seedId) {
    if (seedId === EMPTY) return 0;
    let total = 0;
    for (let dy = -7; dy <= 4; dy++) for (let dx = -7; dx <= 7; dx++) {
        if (typeAt(x + dx, y + dy) === seedId) total++;
    }
    return total;
}

function hasAirNeighbour(x, y) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const id = typeAt(x + dx, y + dy);
        if (id >= 0 && AIR_SPACE_BY_TYPE[id]) return true;
    }
    return false;
}

function hasCardinalWaterNeighbour(x, y) {
    const water = idOf('Water');
    return typeAt(x, y - 1) === water || typeAt(x + 1, y) === water ||
        typeAt(x, y + 1) === water || typeAt(x - 1, y) === water;
}

const HUMIDITY_NEIGHBOURS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

function humidityNearCell(x, y) {
    const i = index(x, y);
    if (AIR_SPACE_BY_TYPE[world.type[i]]) return world.humidity[i];
    let total = 0;
    let count = 0;
    for (const [dx, dy] of HUMIDITY_NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        const ni = index(nx, ny);
        if (!AIR_SPACE_BY_TYPE[world.type[ni]]) continue;
        total += world.humidity[ni];
        count++;
    }
    return count > 0 ? total / count : world.humidity[i];
}

// The persistence layer owns the wire format, while physics owns which parts
// of a world are durable. Keeping this boundary here means a restored world is
// always built with the same typed arrays as a newly-created one.
const PERSISTED_WORLD_FIELDS = [
    'type', 'temp', 'life', 'lifeMax', 'residue', 'shade', 'heat', 'data',
    'humidity', 'plantHealth', 'corrosionExposure', 'plantCooldown',
    'machineSetting', 'storageType', 'storageCount', 'storageFlowRemainder',
    'machinePortEndpointRemap', 'machinePortEndpointSlot',
    'machinePortLeadRemap', 'machinePortLeadSlot',
    'sprinklerLaunchDirection', 'sprinklerLaunchAge',
    'splitterOutputFlowA', 'splitterOutputFlowB',
    'mixerInputTypeA', 'mixerInputCountA', 'mixerInputFlowA',
    'mixerInputTypeB', 'mixerInputCountB', 'mixerInputFlowB',
    'mixerOutputCountA', 'mixerOutputCountB', 'mixerOutputTypeA', 'mixerOutputTypeB', 'mixerOutputMixed',
    'mixerOutputFlow', 'mixerNextInput',
    'mixerOutputNext',
    'sprinklerSprayFlow9', 'sprinklerSprayFlow8', 'sprinklerSprayFlow7', 'sprinklerSprayFlow6',
    'sprinklerSprayFlow5', 'sprinklerSprayFlow4', 'sprinklerSprayFlow3',
    'power', 'powerDelay', 'charge', 'wind', 'airflowX', 'airflowY',
    'airflowNextX', 'airflowNextY'
];
const LEGACY_SPRINKLER_SPRAY_FIELD = field =>
    field.startsWith('sprinklerSprayFlow')
        ? field.replace('sprinklerSprayFlow', 'ventSprayFlow')
        : null;
const TUBING_NEIGHBOURS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// Fan settings share Breeze's current 0-50 scale. Fan output formulas retain
// their original 0-15 calibration internally.
export const FAN_WIND_SCALE = 50;

export function migrateLegacyFanWindSettings(typeIds, machineSettings) {
    if (!typeIds || !machineSettings || typeIds.length !== machineSettings.length) return;
    for (let i = 0; i < typeIds.length; i++) {
        const definition = DEFS[typeIds[i]];
        if (definition?.machine !== 'fan') continue;
        const legacyStrength = Number(machineSettings[i]);
        if (!Number.isFinite(legacyStrength) || legacyStrength <= 0) {
            // Blueprints created before configurable machine settings have an
            // empty plane; restore the Fan's current definition default.
            machineSettings[i] = definition.machineWindSpeed ?? 7;
            continue;
        }
        const clampedLegacyStrength = Math.max(0, Math.min(15, legacyStrength));
        machineSettings[i] = Math.round(clampedLegacyStrength * FAN_WIND_SCALE / 15);
    }
}

export function captureSimulationState() {
    if (!world) throw new Error('There is no world to save.');
    const arrays = {};
    for (const field of PERSISTED_WORLD_FIELDS) arrays[field] = world[field];
    return {
        version: 1,
        sprinklerModeVersion: 2,
        machinePortLayoutVersion: 2,
        fanWindScale: FAN_WIND_SCALE,
        cols: COLS,
        rows: ROWS,
        ambient: AMBIENT,
        ambientTarget,
        ambientHumidity: ambientHumidityTarget,
        dewpointTarget,
        ambientWindOn,
        windDial: windStrengthToLegacyScale(gustWindStrength),
        generalWindStrength,
        gustWindStrength,
        prevailingWindDirection,
        prevailingWindTicksRemaining,
        frameCount,
        arrays
    };
}

export function restoreSimulationState(state) {
    if (!state || !Number.isInteger(state.cols) || !Number.isInteger(state.rows) ||
        state.cols < 1 || state.rows < 1 || !state.arrays) {
        throw new Error('This save does not contain a valid world.');
    }

    const cells = state.cols * state.rows;
    createWorld(state.cols, state.rows);
    const hasSavedMachineSettings = !!state.arrays.machineSetting;
    for (const field of PERSISTED_WORLD_FIELDS) {
        const source = state.arrays[field] ||
            (LEGACY_SPRINKLER_SPRAY_FIELD(field)
                ? state.arrays[LEGACY_SPRINKLER_SPRAY_FIELD(field)] : null);
        // Environment and plant fields were added after the first save format.
        // Older version-1 saves restore with current defaults and empty biology.
        if (['humidity', 'plantHealth', 'corrosionExposure', 'plantCooldown'].includes(field) && !source) {
            if (field === 'humidity') world.humidity.fill(50);
            if (field === 'plantHealth') {
                for (let i = 0; i < cells; i++) {
                    if (DEFS[world.type[i]]?.isPlant) world.plantHealth[i] = 0.5;
                }
            }
            continue;
        }
        // machineSetting was added after the first version of the save format.
        // Older saves use each machine's definition default.
        if (field === 'machineSetting' && !source) {
            for (let i = 0; i < cells; i++) {
                const def = DEFS[world.type[i]];
                world.machineSetting[i] = def?.machine ? defaultMachineSetting(def) : 0;
            }
            continue;
        }
        // Storage inventory was added after the original machine state. Old
        // saves simply have empty inventories because newly-created arrays are
        // already zero-filled.
        if ((field === 'storageType' || field === 'storageCount' || field === 'storageFlowRemainder' ||
            field.startsWith('machinePortEndpoint') || field.startsWith('machinePortLead') ||
            field.startsWith('mixer') || field.startsWith('sprinklerSpray') ||
            field.startsWith('splitter') || field.startsWith('sprinklerLaunch')) && !source) continue;
        if (!source || source.length !== cells) {
            throw new Error(`This save has invalid ${field} data.`);
        }
        world[field].set(source);
    }

    // Version 1 used bit 1 for Sprinkler mode. Version 2 uses the same bit for
    // Drain Mode, so only legacy, explicitly stored settings need inversion.
    // When old saves omit the setting array, createWorld's current defaults
    // already provide Release + Drain Mode on (value 3).
    if (hasSavedMachineSettings && state.sprinklerModeVersion !== 2) {
        for (let i = 0; i < cells; i++) {
            if (DEFS[world.type[i]]?.machine !== 'sprinkler') continue;
            const oldSetting = Math.round(world.machineSetting[i]);
            world.machineSetting[i] = (oldSetting & 1) | ((oldSetting & 2) ? 0 : 2);
        }
    }

    // Saves without this marker stored Fan speeds on the old 1-20 scale,
    // whose physical formulas used 15 as the Breeze-equivalent maximum.
    if (hasSavedMachineSettings && state.fanWindScale !== FAN_WIND_SCALE) {
        migrateLegacyFanWindSettings(world.type, world.machineSetting);
    }

    // Old layouts attached tube cells anywhere in the broad port target area.
    // Preserve those existing physical endpoints as explicit per-cell remaps;
    // all newly created connections attach only at their exact anchor.
    if (state.machinePortLayoutVersion !== 2) {
        migrateLegacyMachinePortEndpointRemap(world.type, world.machinePortEndpointRemap,
            COLS, ROWS, world.data, world.machinePortEndpointSlot);
    }

    // Mixer state is restored by copying typed arrays directly, so rebuild
    // this derived fast-path flag that normally gets set by setCell().
    hasMixerMachine = false;
    for (let i = 0; i < cells; i++) {
        if (isMixerMachine(DEFS[world.type[i]])) {
            hasMixerMachine = true;
            break;
        }
    }

    AMBIENT = Number.isFinite(state.ambient) ? state.ambient : AMBIENT;
    ambientTarget = Number.isFinite(state.ambientTarget) ? state.ambientTarget : AMBIENT;
    ambientHumidityTarget = Number.isFinite(state.ambientHumidity)
        ? Math.max(0, Math.min(100, state.ambientHumidity)) : 50;
    dewpointTarget = Number.isFinite(state.dewpointTarget)
        ? Math.max(0, Math.min(100, state.dewpointTarget)) : 10;
    if (!state.arrays.humidity) world.humidity.fill(ambientHumidityTarget);
    // Legacy layer settings are intentionally ignored. Outside air now always
    // follows the natural height profile, including saves that disabled it.
    frameCount = Number.isSafeInteger(state.frameCount) ? state.frameCount : 0;
    const legacyWind = Number.isFinite(state.windDial)
        ? Math.round(Math.max(0, Math.min(15, state.windDial)) * (50 / 15)) : null;
    const restoredGeneralWind = Number.isFinite(state.generalWindStrength)
        ? clampWindSetting(state.generalWindStrength) : legacyWind;
    const restoredGustWind = Number.isFinite(state.gustWindStrength)
        ? clampWindSetting(state.gustWindStrength) : legacyWind;
    if (restoredGeneralWind !== null) generalWindStrength = restoredGeneralWind;
    if (restoredGustWind !== null) gustWindStrength = restoredGustWind;
    if (restoredGeneralWind !== null && restoredGustWind === null) gustWindStrength = generalWindStrength;
    gustWindStrength = Math.max(generalWindStrength, gustWindStrength);
    prevailingWindDirection = state.prevailingWindDirection === -1 || state.prevailingWindDirection === 1
        ? state.prevailingWindDirection : 1;
    prevailingWindHasStarted = state.prevailingWindDirection === -1 || state.prevailingWindDirection === 1;
    prevailingWindTicksRemaining = Number.isSafeInteger(state.prevailingWindTicksRemaining) &&
        state.prevailingWindTicksRemaining >= 0 &&
        state.prevailingWindTicksRemaining <= PREVAILING_WIND_CYCLE_TICKS
        ? state.prevailingWindTicksRemaining : PREVAILING_WIND_CYCLE_TICKS;
    activeGust = null;
    gustWait = 0;
    generalWindCacheFrame = -1;
    windShelterFrame = -1;
    setAmbientWindOn(!!state.ambientWindOn);
}

// --------------------------------------------------------------------- world

export function createWorld(cols, rows) {
    assertValidWorldDimensions(cols, rows);
    COLS = cols;
    ROWS = rows;
    const n = cols * rows;
    world = {
        cols: cols,
        rows: rows,
        type: new Uint8Array(n),
        temp: new Float32Array(n),
        tempNext: new Float32Array(n),
        life: new Int16Array(n),
        lifeMax: new Int16Array(n),
        residue: new Uint8Array(n),
        moved: new Uint8Array(n),
        shade: new Uint8Array(n),
        heat: new Float32Array(n),
        humidity: new Float32Array(n),
        plantHealth: new Float32Array(n),
        corrosionExposure: new Uint16Array(n),
        plantCooldown: new Uint16Array(n),
        surface: new Int16Array(n),
        data: new Uint8Array(n),
        machineSetting: new Float32Array(n),
        storageType: new Uint8Array(n),
        storageCount: new Uint16Array(n),
        storageFlowRemainder: new Float32Array(n),
        machinePortEndpointRemap: new Uint8Array(n),
        machinePortEndpointSlot: new Uint8Array(n),
        machinePortLeadRemap: new Uint32Array(n),
        machinePortLeadSlot: new Uint8Array(n),
        sprinklerLaunchDirection: new Uint8Array(n),
        sprinklerLaunchAge: new Uint8Array(n),
        splitterOutputFlowA: new Float32Array(n),
        splitterOutputFlowB: new Float32Array(n),
        mixerInputTypeA: new Uint8Array(n),
        mixerInputCountA: new Uint16Array(n),
        mixerInputFlowA: new Float32Array(n),
        mixerInputTypeB: new Uint8Array(n),
        mixerInputCountB: new Uint16Array(n),
        mixerInputFlowB: new Float32Array(n),
        mixerOutputCountA: new Uint16Array(n),
        mixerOutputCountB: new Uint16Array(n),
        mixerOutputTypeA: new Uint8Array(n),
        mixerOutputTypeB: new Uint8Array(n),
        mixerOutputMixed: new Uint8Array(n),
        mixerOutputFlow: new Float32Array(n),
        mixerNextInput: new Uint8Array(n),
        mixerOutputNext: new Uint8Array(n),
        sprinklerSprayFlow9: new Float32Array(n),
        sprinklerSprayFlow8: new Float32Array(n),
        sprinklerSprayFlow7: new Float32Array(n),
        sprinklerSprayFlow6: new Float32Array(n),
        sprinklerSprayFlow5: new Float32Array(n),
        sprinklerSprayFlow4: new Float32Array(n),
        sprinklerSprayFlow3: new Float32Array(n),
        power: new Uint8Array(n),
        powerDelay: new Uint16Array(n),
        charge: new Float32Array(n),
        wind: new Uint8Array(n),
        airflowX: new Float32Array(n),
        airflowY: new Float32Array(n),
        airflowNextX: new Float32Array(n),
        airflowNextY: new Float32Array(n),
        // Natural-flow layers are rebuilt from current weather settings and
        // obstacles. They stay transient; Fan momentum above remains durable.
        generalWindX: new Float32Array(n),
        generalWindY: new Float32Array(n),
        gustWindX: new Float32Array(n),
        gustWindY: new Float32Array(n),
        // Display-only vectors for wind-tool trails. Natural generated flow is
        // rendered from the layers above and Fan air from airflowX/Y.
        displayWindX: new Float32Array(n),
        displayWindY: new Float32Array(n)
    };
    tempFloodQueue = new Int32Array(world.temp.buffer);
    tempNextFloodQueue = new Int32Array(world.tempNext.buffer);
    world.temp.fill(AMBIENT);
    world.humidity.fill(ambientHumidityTarget);
    for (let i = 0; i < n; i++) world.shade[i] = random() * 255;
    storageFunnelMachines = [];
    storageBarrierMask = null;
    collectorSealMask = null;
    collectorRimMask = null;
    collectorMasksDirty = true;
    tubingFlows = [];
    hasMixerMachine = false;
    windTrailsAlive = 0;
    generalWindCacheFrame = -1;
    windShelterFrame = -1;
    activeGust = null;
    gustWait = ambientWindOn ? 60 : 0;
    prevailingWindDirection = 1;
    prevailingWindTicksRemaining = PREVAILING_WIND_CYCLE_TICKS;
    prevailingWindHasStarted = false;
    if (ambientWindOn) initializePrevailingWind();
    gustFieldCells.length = 0;
    return world;
}

export function getWorld() { return world; }

function defaultMachineSetting(def) {
    if (def?.machine === 'fan') return def.machineWindSpeed ?? 7;
    if (def?.machine === 'sprinkler') return 3;
    if (def?.machine === 'mixer') return 1;
    if (def?.machine === 'simpleSwitch' || def?.machine === 'lamp') return 1;
    return def?.machineTemp ?? 0;
}

function sprinklerReleaseSetting(i) {
    return (Math.round(world.machineSetting[i]) & 1) !== 0;
}

function sprinklerDrainModeSetting(i) {
    return (Math.round(world.machineSetting[i]) & 2) !== 0;
}

function machineSettingBounds(def) {
    if (def?.machine === 'fan') return { min: 1, max: FAN_WIND_SCALE };
    if (def?.machine === 'heater') return { min: 0, max: 4000 };
    if (def?.machine === 'cooler') return { min: -60, max: 20 };
    if (def?.machine === 'simpleSwitch' || def?.machine === 'lamp') return { min: 0, max: 1 };
    return null;
}

const STORAGE_CAPACITY = 500;
const COLLECTOR_CAPACITY = 100;
const COLLECTOR_OUTPUT_RATE = 30;
const SPRINKLER_CAPACITY = 100;
const MIXER_INPUT_CAPACITY = 500;
const MIXER_OUTPUT_SIDE_CAPACITY = 500;
const MIXER_OUTPUT_CAPACITY = 1000;
const MIXER_INPUT_RATE = 5;
const MIXER_RELEASE_RATE = 8;
const SPLITTER_OUTPUT_COUNT = 2;
const DEFAULT_SPRINKLER_RELEASE_RATE = 10;
const MAX_SPRINKLER_RELEASE_RATE = 100;
const SIMULATION_STEPS_PER_SECOND = 60;
const SPRINKLER_LAUNCH_FRAMES = 12;
const SPRINKLER_LAUNCH_PROFILES = Object.freeze({
    3: { x: 1, y: 0, initialGravity: 0 },
    4: { x: Math.sqrt(3) / 2, y: 0.5, initialGravity: 0.05 },
    5: { x: 0.5, y: Math.sqrt(3) / 2, initialGravity: 0.25 },
    7: { x: -0.5, y: Math.sqrt(3) / 2, initialGravity: 0.25 },
    8: { x: -Math.sqrt(3) / 2, y: 0.5, initialGravity: 0.05 },
    9: { x: -1, y: 0, initialGravity: 0 }
});
const SPRINKLER_SPRAY_FIELDS = [
    'sprinklerSprayFlow9', 'sprinklerSprayFlow8', 'sprinklerSprayFlow7', 'sprinklerSprayFlow6',
    'sprinklerSprayFlow5', 'sprinklerSprayFlow4', 'sprinklerSprayFlow3'
];
const SPRINKLER_SPRAY_CLOCK_POSITIONS = [9, 8, 7, 6, 5, 4, 3];
const SPRINKLER_SPRAY_OFFSETS = [
    [-3, 0], [-3, 1], [-2, 3], [0, 3], [2, 3], [3, 1], [3, 0]
];
const MACHINE_DIRECTION_ROTATIONS = [0, 180, -90, 90, -45, -135, 135, 45];
export function getSprinklerLaunchGravityMultiplier(clockPosition, age) {
    const profile = SPRINKLER_LAUNCH_PROFILES[clockPosition];
    if (!profile) return 1;
    const progress = Math.max(0, Math.min(1,
        (Number.isFinite(age) ? age : 0) / SPRINKLER_LAUNCH_FRAMES));
    return profile.initialGravity + (1 - profile.initialGravity) * progress;
}

export function getSprinklerLaunchState(x, y) {
    if (!world || !inBounds(x, y)) return null;
    const i = index(x, y);
    const direction = world.sprinklerLaunchDirection[i];
    const age = world.sprinklerLaunchAge[i];
    return {
        direction,
        age,
        gravityMultiplier: direction
            ? getSprinklerLaunchGravityMultiplier(direction, age) : 1
    };
}

// Port geometry is stored in logical cell offsets from the machine anchor.
// targetRadius describes the usable circular connection area, including the
// short adjacent stub cells painted by the user.
const MACHINE_PORT_DEFINITIONS = Object.freeze({
    fan: [{ id: 'power', role: 'input', material: 'Copper', family: 'copper', sourceX: 138, sourceY: 196, x: -3, y: 0, targetRadius: 1.6, stubLength: 6 }],
    heater: [{ id: 'power', role: 'input', material: 'Copper', family: 'copper', sourceX: 76, sourceY: 196, x: -3, y: 0, targetRadius: 1.6, stubLength: 6 }],
    cooler: [{ id: 'power', role: 'input', material: 'Copper', family: 'copper', sourceX: 41, sourceY: 196, x: -3, y: 0, targetRadius: 1.6, stubLength: 6 }],
    storagePowder: [
        { id: 'material', role: 'input', material: 'Tubing', family: 'storage', sourceX: 298, sourceY: 55, x: 0, y: -3, targetRadius: 1.6, stubLength: 6 },
        { id: 'tubing-out', role: 'output', material: 'Tubing', family: 'tubing', sourceX: 298, sourceY: 251, x: 0, y: 3, targetRadius: 1.6, stubLength: 6 }
    ],
    storageLiquid: [
        { id: 'material', role: 'input', material: 'Tubing', family: 'storage', sourceX: 256, sourceY: 55, x: 0, y: -3, targetRadius: 1.6, stubLength: 6 },
        { id: 'tubing-out', role: 'output', material: 'Tubing', family: 'tubing', sourceX: 256, sourceY: 230, x: 0, y: 3, targetRadius: 1.6, stubLength: 6 }
    ],
    storageGas: [
        { id: 'material', role: 'input', material: 'Tubing', family: 'storage', sourceX: 215, sourceY: 55, x: 0, y: -3, targetRadius: 1.6, stubLength: 6 },
        { id: 'tubing-out', role: 'output', material: 'Tubing', family: 'tubing', sourceX: 215, sourceY: 230, x: 0, y: 3, targetRadius: 1.6, stubLength: 6 }
    ],
    sprinkler: [
        { id: 'tubing-in', role: 'input', material: 'Tubing', family: 'tubing', sourceX: 298, sourceY: 46, x: 0, y: -3, targetRadius: 1.6, stubLength: 6 }
    ],
    mixer: [
        { id: 'input-a', role: 'input', material: 'Tubing', family: 'tubing', sourceX: 75, sourceY: 135, x: -4, y: -3, targetRadius: 1.5, stubLength: 6 },
        { id: 'input-b', role: 'input', material: 'Tubing', family: 'tubing', sourceX: 359, sourceY: 135, x: 4, y: -3, targetRadius: 1.5, stubLength: 6 }
    ],
    splitter: [
        { id: 'input', role: 'input', material: 'Tubing', family: 'tubing', sourceX: 256, sourceY: 38, x: 0, y: -3, targetRadius: 1.5, stubLength: 6 },
        { id: 'output-a', role: 'output', material: 'Tubing', family: 'tubing', sourceX: 158, sourceY: 188, x: -2, y: 3, targetRadius: 1.5, stubLength: 6 },
        { id: 'output-b', role: 'output', material: 'Tubing', family: 'tubing', sourceX: 354, sourceY: 188, x: 2, y: 3, targetRadius: 1.5, stubLength: 6 }
    ],
    collector: [
        { id: 'tubing-out', role: 'output', material: 'Tubing', family: 'tubing',
            // The default down-facing outlet puts the circle on the icon's
            // horizontal centerline, five viewBox pixels above the outer row.
            // Keep the logical connection offset unchanged.
            sourceX: 50.6, sourceY: 32, x: 3, y: 0,
            targetRadius: 1.5, stubLength: 6, visualRadius: 4 }
    ],
    simpleSwitch: [
        { id: 'input', role: 'input', material: 'Elec', family: 'electrical',
            sourceX: 0, sourceY: 18, x: -3, y: 0, targetRadius: 1.6, stubLength: 6, visualRadius: 2.8 },
        { id: 'output', role: 'output', material: 'Elec', family: 'electrical',
            sourceX: 48, sourceY: 18, x: 3, y: 0, targetRadius: 1.6, stubLength: 6, visualRadius: 2.8 }
    ],
    lamp: [
        { id: 'input', role: 'input', material: 'Elec', family: 'electrical',
            sourceX: 0, sourceY: 24, x: -3, y: 0, targetRadius: 1.6, stubLength: 6, visualRadius: 2.8 }
    ]
});

// Source-space alpha bounds are the same rectangles returned by trimming each
// cell of resources/icons.png. Port marker centers come from the companion
// iconsInputsOutputs.png sheet, while port hit and physical target geometry
// stay independent of the fixed-size artwork.
const MACHINE_ARTWORK_LAYOUTS = Object.freeze({
    fan: { tileX: 0, tileY: 0, trimX: 121, trimY: 89, trimWidth: 357, trimHeight: 208 },
    heater: { tileX: 512, tileY: 0, trimX: 58, trimY: 106, trimWidth: 390, trimHeight: 192 },
    cooler: { tileX: 1024, tileY: 0, trimX: 21, trimY: 88, trimWidth: 368, trimHeight: 210 },
    storagePowder: { tileX: 0, tileY: 341, trimX: 168, trimY: 42, trimWidth: 262, trimHeight: 240 },
    storageLiquid: { tileX: 512, tileY: 341, trimX: 139, trimY: 32, trimWidth: 233, trimHeight: 236 },
    storageGas: { tileX: 1024, tileY: 341, trimX: 94, trimY: 33, trimWidth: 245, trimHeight: 233 },
    sprinkler: { tileX: 0, tileY: 683, trimX: 146, trimY: 27, trimWidth: 308, trimHeight: 178 },
    splitter: { tileX: 512, tileY: 683, trimX: 118, trimY: 19, trimWidth: 276, trimHeight: 222 },
    mixer: { tileX: 1024, tileY: 683, trimX: 54, trimY: 39, trimWidth: 324, trimHeight: 221 },
    simpleSwitch: { tileX: 0, tileY: 0, trimX: 0, trimY: 0, trimWidth: 48, trimHeight: 36 },
    lamp: { tileX: 0, tileY: 0, trimX: 0, trimY: 0, trimWidth: 48, trimHeight: 48 }
});
const MACHINE_ARTWORK_FACE_SIZE = 64;
const MACHINE_ARTWORK_MAX_SIZE = 56;
// The Collector's directional intake uses a short rotated barrier spanning
// the visible funnel mouth. Diagonal barriers use a supercover staircase.
const COLLECTOR_CARDINAL_BARRIER_DEPTH = 7;
const COLLECTOR_CARDINAL_HALF_WIDTH = 5;
const COLLECTOR_DIAGONAL_BARRIER_DEPTH = 5;
const COLLECTOR_DIAGONAL_HALF_WIDTH = 3;
const STORAGE_SUCTION_DEPTH = 2;

function clearMixerState(i) {
    world.mixerInputTypeA[i] = EMPTY;
    world.mixerInputCountA[i] = 0;
    world.mixerInputFlowA[i] = 0;
    world.mixerInputTypeB[i] = EMPTY;
    world.mixerInputCountB[i] = 0;
    world.mixerInputFlowB[i] = 0;
    world.mixerOutputCountA[i] = 0;
    world.mixerOutputCountB[i] = 0;
    world.mixerOutputTypeA[i] = EMPTY;
    world.mixerOutputTypeB[i] = EMPTY;
    world.mixerOutputMixed[i] = 0;
    world.mixerOutputFlow[i] = 0;
    world.mixerNextInput[i] = 0;
    world.mixerOutputNext[i] = 0;
    world.splitterOutputFlowA[i] = 0;
    world.splitterOutputFlowB[i] = 0;
}

function clearSprinklerSprayState(i) {
    for (const field of SPRINKLER_SPRAY_FIELDS) world[field][i] = 0;
}

function clearSprinklerLaunchState(i) {
    world.sprinklerLaunchDirection[i] = 0;
    world.sprinklerLaunchAge[i] = 0;
}

function resetEmptyMixer(i) {
    if (world.mixerInputCountA[i] === 0) {
        world.mixerInputTypeA[i] = EMPTY;
        world.mixerNextInput[i] = 0;
    }
    if (world.mixerInputCountB[i] === 0) {
        world.mixerInputTypeB[i] = EMPTY;
        world.mixerNextInput[i] = 1;
    }
    if (world.mixerOutputCountA[i] === 0) {
        world.mixerOutputTypeA[i] = EMPTY;
        world.mixerOutputMixed[i] = 0;
    }
    if (world.mixerOutputCountB[i] === 0) {
        world.mixerOutputTypeB[i] = EMPTY;
    }
    if (world.mixerOutputCountA[i] + world.mixerOutputCountB[i] === 0 &&
        world.mixerInputCountA[i] + world.mixerInputCountB[i] === 0) {
        world.mixerNextInput[i] = 0;
        world.mixerOutputNext[i] = 0;
    }
}

function isStorageMachine(def) {
    return !!def?.storageCategory && def.storageCapacity > 0;
}

function isStorageInventoryMachine(def) {
    return isStorageMachine(def) || isSplitterMachine(def) || isCollectorMachine(def);
}

function isSprinklerMachine(def) {
    return def?.machine === 'sprinkler';
}

function isMixerMachine(def) {
    return def?.machine === 'mixer';
}

function isSplitterMachine(def) {
    return def?.machine === 'splitter';
}

function isCollectorMachine(def) {
    return def?.machine === 'collector';
}

function isTubingEndpoint(def) {
    return !!MACHINE_PORT_DEFINITIONS[def?.machine]?.some(port =>
        port.family === 'tubing' || port.family === 'storage');
}

function storageAccepts(def, particle) {
    if (!isStorageMachine(def) || !particle) return false;
    if (def.storageCategory === 'powder') return particle.category === 'powder';
    if (def.storageCategory === 'liquid') return particle.category === 'liquid';
    if (def.storageCategory === 'gas') return particle.category === 'gas' && particle.emit <= 0;
    return false;
}

function collectorAccepts(particle) {
    return !!particle && !particle.tool && !particle.machine && !particle.tubing &&
        ['powder', 'liquid', 'gas'].includes(particle.category);
}

function portAcceptsMaterial(port, material) {
    const particle = typeof material === 'string'
        ? DEFS.find(def => def?.name?.toLowerCase() === material.toLowerCase())
        : DEFS[material];
    if (!port || !particle) return false;
    if (port.family === 'tubing') return !!particle.tubing;
    if (port.family === 'copper') return particle.name === 'Copper';
    if (port.family === 'electrical') return isElectricalWire(particle);
    if (port.family === 'sprinkler-output') return !particle.tool && !particle.machine && !particle.tubing;
    if (port.family === 'storage') {
        // Storage connectors always use Tubing. Payload category is a separate
        // transfer check in storageAccepts(); raw particles beside a bin are
        // never treated as a connected port or snap target.
        return !!particle.tubing;
    }
    return false;
}

function isElectricalWire(particle) {
    return !!particle && particle.category === 'static' && particle.conductive &&
        particle.wireReach > 0 && !particle.machine;
}

function rotatedPortOffset(machine, localX, localY) {
    const def = DEFS[world.type[machine]];
    const direction = isSprinklerMachine(def) ? 0 : (world.data[machine] & 7);
    const angle = (MACHINE_DIRECTION_ROTATIONS[direction] || 0) * Math.PI / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return { x: localX * cosine - localY * sine, y: localX * sine + localY * cosine };
}

function machineArtworkGeometry(machineType) {
    if (machineType === 'collector') {
        return { tileX: 0, tileY: 0, trimX: 0, trimY: 0, trimWidth: 64, trimHeight: 64,
            sourceX: 0, sourceY: 0, scale: 1, faceSize: MACHINE_ARTWORK_FACE_SIZE,
            x: 0, y: 0, width: 64, height: 64 };
    }
    const layout = MACHINE_ARTWORK_LAYOUTS[machineType];
    if (!layout) return null;
    const scale = Math.min(MACHINE_ARTWORK_MAX_SIZE / layout.trimWidth,
        MACHINE_ARTWORK_MAX_SIZE / layout.trimHeight);
    const width = layout.trimWidth * scale;
    const height = layout.trimHeight * scale;
    return {
        ...layout,
        sourceX: layout.tileX + layout.trimX,
        sourceY: layout.tileY + layout.trimY,
        scale,
        faceSize: MACHINE_ARTWORK_FACE_SIZE,
        x: (MACHINE_ARTWORK_FACE_SIZE - width) / 2,
        y: (MACHINE_ARTWORK_FACE_SIZE - height) / 2,
        width,
        height
    };
}

export function getMachineArtworkLayout(machineType) {
    const geometry = machineArtworkGeometry(machineType);
    return geometry ? { ...geometry } : null;
}

function transformedPortVisual(spec, machineType) {
    const geometry = machineArtworkGeometry(machineType);
    if (!geometry) return null;
    const markerX = geometry.x + (spec.sourceX - geometry.trimX) * geometry.scale;
    const markerY = geometry.y + (spec.sourceY - geometry.trimY) * geometry.scale;
    const centerX = geometry.x + geometry.width / 2;
    const centerY = geometry.y + geometry.height / 2;
    const length = Math.hypot(spec.sourceX - (geometry.trimX + geometry.trimWidth / 2),
        spec.sourceY - (geometry.trimY + geometry.trimHeight / 2)) || 1;
    return {
        x: markerX,
        y: markerY,
        radius: spec.visualRadius || 14.5 * geometry.scale,
        directionX: (spec.sourceX - (geometry.trimX + geometry.trimWidth / 2)) / length,
        directionY: (spec.sourceY - (geometry.trimY + geometry.trimHeight / 2)) / length
    };
}

function machinePortDescriptors(machine) {
    if (!Number.isInteger(machine) || machine < 0 || machine >= world.type.length) return [];
    const machineDef = DEFS[world.type[machine]];
    const specs = MACHINE_PORT_DEFINITIONS[machineDef?.machine];
    if (!specs) return [];
    const anchorX = machine % COLS;
    const anchorY = Math.floor(machine / COLS);
    return specs.map((spec, order) => {
        const offset = rotatedPortOffset(machine, spec.x, spec.y);
        const centerX = anchorX + offset.x;
        const centerY = anchorY + offset.y;
        const visual = transformedPortVisual(spec, machineDef.machine);
        const direction = rotatedPortOffset(machine,
            visual?.directionX ?? 0, visual?.directionY ?? -1);
        const directionLength = Math.hypot(direction.x, direction.y) || 1;
        const radius = spec.targetRadius;
        const cells = [];
        const extent = Math.ceil(radius + 0.5);
        for (let dy = -extent; dy <= extent; dy++) for (let dx = -extent; dx <= extent; dx++) {
            const x = Math.round(centerX + dx);
            const y = Math.round(centerY + dy);
            if (!inBounds(x, y) || (x === anchorX && y === anchorY)) continue;
            if ((x - centerX) ** 2 + (y - centerY) ** 2 > radius ** 2 + 0.12) continue;
            if (cells.some(cell => cell.x === x && cell.y === y)) continue;
            cells.push({ x, y });
        }
        cells.sort((a, b) => ((a.x - centerX) ** 2 + (a.y - centerY) ** 2) -
            ((b.x - centerX) ** 2 + (b.y - centerY) ** 2) || a.y - b.y || a.x - b.x);
        const connectionCell = { x: Math.round(centerX), y: Math.round(centerY) };
        return {
            id: spec.id,
            slot: order,
            order,
            role: spec.role,
            material: spec.material,
            family: spec.family,
            machine: machineDef.machine,
            machineIndex: machine,
            x: centerX,
            y: centerY,
            centerX,
            centerY,
            connectionCell,
            localX: spec.x,
            localY: spec.y,
            worldOffsetX: offset.x,
            worldOffsetY: offset.y,
            rotationDegrees: isSprinklerMachine(machineDef) ? 0 : MACHINE_DIRECTION_ROTATIONS[world.data[machine] & 7],
            visualX: visual?.x ?? 32,
            visualY: visual?.y ?? 32,
            visualRadius: visual?.radius ?? 2.5,
            hitRadiusCss: 20,
            localDirectionX: visual?.directionX ?? 0,
            localDirectionY: visual?.directionY ?? -1,
            directionX: direction.x / directionLength,
            directionY: direction.y / directionLength,
            targetRadius: radius,
            connectorMaterial: spec.family === 'electrical' ? 'Elec'
                : spec.family === 'copper' ? 'Copper' : 'Tubing',
            connectorBrushWidth: spec.family === 'electrical' ? 2 : 3,
            connected: machinePortHasConnection({ ...spec, slot: order, machineIndex: machine,
                connectionCell, targetCells: cells }),
            stubLength: spec.stubLength,
            targetCells: cells
        };
    });
}

function encodeLegacyPortMachineOffset(machineX, machineY, cellX, cellY) {
    const dx = machineX - cellX;
    const dy = machineY - cellY;
    if (dx < -8 || dx > 7 || dy < -8 || dy > 7) return 0;
    const encoded = ((dx + 8) << 4) | (dy + 8);
    // Zero is reserved for cells without a legacy remap. This offset cannot
    // occur for the legacy machine port areas currently in the world.
    return encoded || 0;
}

function remappedMachineAtCell(x, y, remapPlane = world?.machinePortEndpointRemap,
    cols = COLS, rows = ROWS) {
    if (!remapPlane || x < 0 || y < 0 || x >= cols || y >= rows) return -1;
    const code = remapPlane[y * cols + x];
    if (!code) return -1;
    const machineX = x + ((code >> 4) - 8);
    const machineY = y + ((code & 15) - 8);
    if (machineX < 0 || machineY < 0 || machineX >= cols || machineY >= rows) return -1;
    return machineY * cols + machineX;
}

function leadOwnerAtCell(x, y) {
    if (!inBounds(x, y)) return -1;
    const code = world.machinePortLeadRemap[index(x, y)];
    if (!code) return -1;
    const machineX = x + (code >>> 16) - 32768;
    const machineY = y + (code & 0xffff) - 32768;
    return inBounds(machineX, machineY) ? index(machineX, machineY) : -1;
}

export function getMachinePortLeadOwner(x, y) {
    return leadOwnerAtCell(x, y);
}

export function registerMachinePortLead(machineX, machineY, slot, cells) {
    if (!inBounds(machineX, machineY)) return;
    for (const cell of cells) {
        const x = cell % COLS;
        const y = Math.floor(cell / COLS);
        const dx = machineX - x;
        const dy = machineY - y;
        if (Math.abs(dx) >= 32768 || Math.abs(dy) >= 32768) continue;
        world.machinePortLeadRemap[cell] = (((dx + 32768) << 16) | (dy + 32768)) >>> 0;
        world.machinePortLeadSlot[cell] = slot + 1;
    }
}

export function migrateLegacyMachinePortEndpointRemap(typePlane, remapPlane,
    cols, rows, dataPlane = null, slotPlane = null) {
    if (!typePlane || !remapPlane || !slotPlane || typePlane.length !== cols * rows ||
        remapPlane.length !== cols * rows || slotPlane.length !== cols * rows) return;
    remapPlane.fill(0);
    slotPlane.fill(0);
    const tubingId = DEFS.findIndex(def => !!def?.tubing);
    const copperId = DEFS.findIndex(def => def?.name === 'Copper');
    const candidates = new Map();
    const addCandidate = (machine, slot, cellX, cellY) => {
        if (cellX < 0 || cellY < 0 || cellX >= cols || cellY >= rows) return;
        const cell = cellY * cols + cellX;
        const material = typePlane[cell];
        if (material !== tubingId && material !== copperId) return;
        const machineX = machine % cols;
        const machineY = Math.floor(machine / cols);
        const code = encodeLegacyPortMachineOffset(machineX, machineY, cellX, cellY);
        if (!code) return;
        const distance = (cellX - machineX) ** 2 + (cellY - machineY) ** 2;
        const previous = candidates.get(cell);
        if (!previous || distance < previous.distance ||
            (distance === previous.distance && machine < previous.machine)) {
            candidates.set(cell, { code, slot, distance, machine });
        }
    };
    for (let machine = 0; machine < typePlane.length; machine++) {
        const machineType = DEFS[typePlane[machine]]?.machine;
        if (!MACHINE_PORT_DEFINITIONS[machineType]) continue;
        const machineX = machine % cols;
        const machineY = Math.floor(machine / cols);
        if (machineType === 'fan' || machineType === 'heater' || machineType === 'cooler' ||
            machineType === 'sprinkler' || machineType.startsWith('storage')) {
            const expected = (machineType === 'fan' || machineType === 'heater' || machineType === 'cooler')
                ? copperId : tubingId;
            for (const [dx, dy] of TUBING_NEIGHBOURS) {
                const cellX = machineX + dx;
                const cellY = machineY + dy;
                if (cellX < 0 || cellY < 0 || cellX >= cols || cellY >= rows ||
                    typePlane[cellY * cols + cellX] !== expected) continue;
                // Old Storage Bin attachments were bidirectional. A special
                // slot value preserves that existing endpoint in both roles.
                addCandidate(machine, machineType.startsWith('storage') ? 255 : 1, cellX, cellY);
            }
            continue;
        }
        if (machineType !== 'mixer') continue;
        // Preserve only the two legacy Mixer inlet locations (and a one-cell
        // connector join around each). The old broad output footprint is not
        // migrated, so existing output Tubing remains ordinary Tubing.
        for (let slot = 0; slot < 2; slot++) {
            const portX = machineX + (slot === 0 ? -4 : 4);
            const portY = machineY - 3;
            for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const cellX = portX + dx;
                const cellY = portY + dy;
                if (cellX < 0 || cellY < 0 || cellX >= cols || cellY >= rows ||
                    typePlane[cellY * cols + cellX] !== tubingId) continue;
                addCandidate(machine, slot + 1, cellX, cellY);
            }
        }
    }
    for (const [cell, candidate] of candidates) {
        if (!remapPlane[cell]) {
            remapPlane[cell] = candidate.code;
            slotPlane[cell] = candidate.slot;
        }
    }
}

function isLegacyPortContact(port, x, y) {
    const machine = remappedMachineAtCell(x, y);
    if (machine !== port.machineIndex || !world.machinePortEndpointSlot) return false;
    const slot = world.machinePortEndpointSlot[index(x, y)];
    const machineDef = DEFS[world.type[machine]];
    return slot === port.slot + 1 || (slot === 255 && isStorageMachine(machineDef));
}

function legacyPortCells(machine, port) {
    const machineType = DEFS[world.type[machine]]?.machine;
    if (port.family === 'electrical') return [];
    const machineX = machine % COLS;
    const machineY = Math.floor(machine / COLS);
    let candidates = [];
    if (machineType === 'mixer') {
        const portX = machineX + (port.slot === 0 ? -4 : 4);
        const portY = machineY - 3;
        candidates = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]
            .map(([dx, dy]) => ({ x: portX + dx, y: portY + dy }));
    } else {
        candidates = TUBING_NEIGHBOURS.map(([dx, dy]) => ({ x: machineX + dx, y: machineY + dy }));
    }
    return candidates.filter(cell => inBounds(cell.x, cell.y) &&
        isLegacyPortContact(port, cell.x, cell.y));
}

export function getMachinePortTemplates(machineType, direction = 0) {
    const specs = MACHINE_PORT_DEFINITIONS[machineType];
    if (!specs) return [];
    const rotation = ((Math.round(direction) % 8) + 8) % 8;
    const angle = machineType === 'sprinkler' ? 0 : MACHINE_DIRECTION_ROTATIONS[rotation];
    const radians = angle * Math.PI / 180;
    return specs.map((spec, order) => ({
        ...transformedPortVisual(spec, machineType),
        visualX: transformedPortVisual(spec, machineType)?.x ?? 32,
        visualY: transformedPortVisual(spec, machineType)?.y ?? 32,
        visualRadius: transformedPortVisual(spec, machineType)?.radius ?? 2.5,
        id: spec.id,
        slot: order,
        role: spec.role,
        material: spec.material,
        family: spec.family,
        hitRadiusCss: 20,
        localDirectionX: transformedPortVisual(spec, machineType)?.directionX ?? 0,
        localDirectionY: transformedPortVisual(spec, machineType)?.directionY ?? -1,
        directionX: ((transformedPortVisual(spec, machineType)?.directionX ?? 0) * Math.cos(radians) -
            (transformedPortVisual(spec, machineType)?.directionY ?? -1) * Math.sin(radians)),
        directionY: ((transformedPortVisual(spec, machineType)?.directionX ?? 0) * Math.sin(radians) +
            (transformedPortVisual(spec, machineType)?.directionY ?? -1) * Math.cos(radians)),
        connectorMaterial: spec.family === 'electrical' ? 'Elec'
            : spec.family === 'copper' ? 'Copper' : 'Tubing',
        connectorBrushWidth: spec.family === 'electrical' ? 2 : 3,
        connected: false,
        stubLength: spec.stubLength,
        connectionOffset: { x: spec.x, y: spec.y },
        worldOffsetX: spec.x * Math.cos(radians) - spec.y * Math.sin(radians),
        worldOffsetY: spec.x * Math.sin(radians) + spec.y * Math.cos(radians),
        rotationDegrees: angle
    }));
}

export function getMachinePorts(x, y) {
    if (!inBounds(x, y)) return [];
    return machinePortDescriptors(index(x, y));
}

export function isMachinePortMaterialCompatible(x, y, portId, material) {
    if (!inBounds(x, y)) return false;
    const port = machinePortDescriptors(index(x, y)).find(candidate => candidate.id === portId);
    return !!port && portAcceptsMaterial(port, material);
}

export function getMachinePortAt(x, y, material) {
    if (!world || !inBounds(x, y)) return null;
    const candidates = [];
    for (let machineY = Math.max(0, y - 12); machineY <= Math.min(ROWS - 1, y + 12); machineY++) {
        for (let machineX = Math.max(0, x - 12); machineX <= Math.min(COLS - 1, x + 12); machineX++) {
            const machine = index(machineX, machineY);
            if (!MACHINE_PORT_DEFINITIONS[DEFS[world.type[machine]]?.machine]) continue;
            for (const port of machinePortDescriptors(machine)) {
                if (!portAcceptsMaterial(port, material) ||
                    port.connectionCell.x !== x || port.connectionCell.y !== y) continue;
                const distance = (x - port.centerX) ** 2 + (y - port.centerY) ** 2;
                candidates.push({ port, distance });
            }
        }
    }
    candidates.sort((a, b) => a.distance - b.distance || a.port.order - b.port.order ||
        a.port.machineIndex - b.port.machineIndex);
    return candidates[0]?.port || null;
}

function machinePortHasConnection(port) {
    if (!world || !port?.connectionCell) return false;
    const { x, y } = port.connectionCell;
    if (inBounds(x, y)) {
        const material = world.type[index(x, y)];
        if (material !== EMPTY && portAcceptsMaterial(port, material)) {
            if (leadOwnerAtCell(x, y) !== port.machineIndex) return true;
            // A committed lead is only a socket extension. It is connected
            // once compatible, independently placed material touches it.
            const radius = 24;
            const machineX = port.machineIndex % COLS;
            const machineY = Math.floor(port.machineIndex / COLS);
            for (let cy = Math.max(0, machineY - radius); cy <= Math.min(ROWS - 1, machineY + radius); cy++) {
                for (let cx = Math.max(0, machineX - radius); cx <= Math.min(COLS - 1, machineX + radius); cx++) {
                    const ci = index(cx, cy);
                    if (leadOwnerAtCell(cx, cy) !== port.machineIndex ||
                        world.machinePortLeadSlot[ci] !== port.slot + 1) continue;
                    for (const [ox, oy] of TUBING_NEIGHBOURS) {
                        const nx = cx + ox;
                        const ny = cy + oy;
                        if (!inBounds(nx, ny) || !portAcceptsMaterial(port, world.type[index(nx, ny)])) continue;
                        if (leadOwnerAtCell(nx, ny) !== port.machineIndex) return true;
                    }
                }
            }
        }
    }
    return legacyPortCells(port.machineIndex, port).some(cell =>
        portAcceptsMaterial(port, world.type[index(cell.x, cell.y)]));
}

export function getMachinePortSnapTarget(x, y, material) {
    if (!world || !inBounds(x, y)) return null;
    const particle = typeof material === 'string'
        ? DEFS.find(def => def?.name?.toLowerCase() === material.toLowerCase())
        : DEFS[material];
    if (!particle || (!particle.tubing && particle.name !== 'Copper' && !isElectricalWire(particle))) return null;
    const candidates = [];
    const machineRadius = 12;
    for (let machineY = Math.max(0, y - machineRadius); machineY <= Math.min(ROWS - 1, y + machineRadius); machineY++) {
        for (let machineX = Math.max(0, x - machineRadius); machineX <= Math.min(COLS - 1, x + machineRadius); machineX++) {
            const machine = index(machineX, machineY);
            if (!MACHINE_PORT_DEFINITIONS[DEFS[world.type[machine]]?.machine]) continue;
            for (const port of machinePortDescriptors(machine)) {
                const compatiblePortFamily = particle.tubing
                    ? (port.family === 'tubing' || port.family === 'storage')
                    : port.family === 'copper'
                        ? particle.name === 'Copper'
                        : port.family === 'electrical' && isElectricalWire(particle);
                if (!compatiblePortFamily || !portAcceptsMaterial(port, particle.id) ||
                    machinePortHasConnection(port)) continue;
                const cell = port.connectionCell;
                if (world.type[index(cell.x, cell.y)] !== EMPTY) continue;
                const distance = (x - cell.x) ** 2 + (y - cell.y) ** 2;
                if (distance > 2.25) continue;
                candidates.push({ ...port, portId: port.id, x: cell.x, y: cell.y, snapX: cell.x, snapY: cell.y, distance });
            }
        }
    }
    candidates.sort((a, b) => a.distance - b.distance || a.order - b.order ||
        a.machineIndex - b.machineIndex || a.y - b.y || a.x - b.x);
    return candidates[0] || null;
}

export function getStorageInventory(x, y) {
    if (!inBounds(x, y)) return null;
    const i = index(x, y);
    const def = DEFS[world.type[i]];
    if (!isStorageInventoryMachine(def)) return null;
    return {
        type: world.storageType[i],
        count: world.storageCount[i],
        capacity: def.storageCapacity || (isCollectorMachine(def) ? COLLECTOR_CAPACITY : STORAGE_CAPACITY),
        category: def.storageCategory || (isCollectorMachine(def) ? 'any' : 'mixed')
    };
}

export function purgeStorageBin(x, y) {
    if (!inBounds(x, y)) return false;
    const i = index(x, y);
    if (!isStorageInventoryMachine(DEFS[world.type[i]])) return false;
    world.storageType[i] = EMPTY;
    world.storageCount[i] = 0;
    world.storageFlowRemainder[i] = 0;
    world.splitterOutputFlowA[i] = 0;
    world.splitterOutputFlowB[i] = 0;
    return true;
}

export function getSprinklerInventory(x, y) {
    if (!inBounds(x, y)) return null;
    const i = index(x, y);
    if (!isSprinklerMachine(DEFS[world.type[i]])) return null;
    return {
        type: world.storageType[i],
        count: world.storageCount[i],
        capacity: SPRINKLER_CAPACITY,
        releaseEnabled: sprinklerReleaseSetting(i),
        drainModeEnabled: sprinklerDrainModeSetting(i),
        releaseRate: getSprinklerReleaseRate(x, y)
    };
}

export function getMixerInventory(x, y) {
    if (!inBounds(x, y)) return null;
    const i = index(x, y);
    if (!isMixerMachine(DEFS[world.type[i]])) return null;
    return {
        bins: [
            { type: world.mixerInputTypeA[i], count: world.mixerInputCountA[i], capacity: MIXER_INPUT_CAPACITY },
            { type: world.mixerInputTypeB[i], count: world.mixerInputCountB[i], capacity: MIXER_INPUT_CAPACITY }
        ],
        output: {
            counts: [world.mixerOutputCountA[i], world.mixerOutputCountB[i]],
            types: [
                world.mixerOutputCountA[i] > 0 ? world.mixerOutputTypeA[i] : EMPTY,
                world.mixerOutputCountB[i] > 0 ? world.mixerOutputTypeB[i] : EMPTY
            ],
            mixed: world.mixerOutputMixed[i] !== 0,
            capacity: MIXER_OUTPUT_CAPACITY
        },
        releaseEnabled: world.machineSetting[i] !== 0
    };
}

export function purgeMixerBin(x, y, slot) {
    if (!inBounds(x, y) || !Number.isInteger(slot) || slot < 0 || slot > 1) return false;
    const i = index(x, y);
    if (!isMixerMachine(DEFS[world.type[i]])) return false;
    if (slot === 0) {
        world.mixerInputCountA[i] = 0;
        world.mixerInputFlowA[i] = 0;
        if (world.mixerInputCountA[i] === 0) world.mixerInputTypeA[i] = EMPTY;
    } else {
        world.mixerInputCountB[i] = 0;
        world.mixerInputFlowB[i] = 0;
        if (world.mixerInputCountB[i] === 0) world.mixerInputTypeB[i] = EMPTY;
    }
    resetEmptyMixer(i);
    return true;
}

export function setMixerReleaseEnabled(x, y, enabled) {
    if (!inBounds(x, y)) return false;
    const i = index(x, y);
    if (!isMixerMachine(DEFS[world.type[i]])) return false;
    world.machineSetting[i] = enabled ? 1 : 0;
    if (!enabled) world.mixerOutputFlow[i] = 0;
    return true;
}

export function isMixerReleaseEnabled(x, y) {
    if (!inBounds(x, y)) return false;
    const i = index(x, y);
    return isMixerMachine(DEFS[world.type[i]]) && world.machineSetting[i] !== 0;
}

export function getSprinklerReleaseRate(x, y) {
    if (!inBounds(x, y)) return null;
    const i = index(x, y);
    if (!isSprinklerMachine(DEFS[world.type[i]])) return null;
    return Math.max(1, Math.min(MAX_SPRINKLER_RELEASE_RATE,
        Math.round(world.data[i] || DEFAULT_SPRINKLER_RELEASE_RATE)));
}

export function getSprinklerTubingRate(x, y) {
    if (!inBounds(x, y)) return null;
    const sprinkler = index(x, y);
    if (!isSprinklerMachine(DEFS[world.type[sprinkler]])) return null;
    let maxRate = 0;
    const components = buildTubingComponents();
    const routeRateTo = (component, destination, visiting = new Set()) => {
        if (component.attachments.size !== 2 || !component.attachments.has(destination)) return 0;
        const source = [...component.attachments.keys()].find(machine => machine !== destination);
        if (source === undefined) return 0;
        const sourceDef = DEFS[world.type[source]];
        if (!(isStorageMachine(sourceDef) || isSplitterMachine(sourceDef) || isCollectorMachine(sourceDef))) return 0;
        const sourcePort = componentPortConnection(component, source, 'output');
        const destinationPort = componentPortConnection(component, destination, 'input');
        if (!sourcePort || !destinationPort) return 0;
        const path = shortestTubingPath(component.cellSet, sourcePort.contacts, destinationPort.contacts);
        if (!path) return 0;
        const lineRate = tubingPathCapacity(path, component.cellSet, source, destination) * 10;
        let rate = isCollectorMachine(sourceDef) ? Math.min(lineRate, COLLECTOR_OUTPUT_RATE) : lineRate;
        if (isSplitterMachine(sourceDef)) {
            if (visiting.has(source)) return Math.min(rate, lineRate / SPLITTER_OUTPUT_COUNT);
            const nextVisiting = new Set(visiting);
            nextVisiting.add(source);
            let incomingRate = 0;
            for (const incoming of components) {
                if (!incoming.attachments.has(source) || incoming === component) continue;
                incomingRate = Math.max(incomingRate, routeRateTo(incoming, source, nextVisiting));
            }
            // A prefilled splitter without a connected inlet still divides
            // its nominal outlet capacity in half, matching the flow scheduler.
            rate = Math.min(rate, (incomingRate || lineRate) / SPLITTER_OUTPUT_COUNT);
        }
        return rate;
    };
    for (const component of components) {
        if (component.attachments.size !== 2 || !component.attachments.has(sprinkler)) continue;
        maxRate = Math.max(maxRate, routeRateTo(component, sprinkler));
    }
    return maxRate;
}

export function setSprinklerReleaseRate(x, y, value) {
    if (!inBounds(x, y) || !Number.isFinite(value)) return false;
    const i = index(x, y);
    if (!isSprinklerMachine(DEFS[world.type[i]])) return false;
    world.data[i] = Math.max(1, Math.min(MAX_SPRINKLER_RELEASE_RATE, Math.round(value)));
    return true;
}

export function isSprinklerReleaseEnabled(x, y) {
    if (!inBounds(x, y)) return false;
    const i = index(x, y);
    return isSprinklerMachine(DEFS[world.type[i]]) && sprinklerReleaseSetting(i);
}

export function setSprinklerReleaseEnabled(x, y, enabled) {
    if (!inBounds(x, y)) return false;
    const i = index(x, y);
    if (!isSprinklerMachine(DEFS[world.type[i]])) return false;
    const current = Math.round(world.machineSetting[i]) & 2;
    world.machineSetting[i] = current | (enabled ? 1 : 0);
    if (!enabled) world.storageFlowRemainder[i] = 0;
    return true;
}

export function isDrainModeEnabled(x, y) {
    if (!inBounds(x, y)) return false;
    const i = index(x, y);
    return isSprinklerMachine(DEFS[world.type[i]]) && sprinklerDrainModeSetting(i);
}

export function setDrainModeEnabled(x, y, enabled) {
    if (!inBounds(x, y)) return false;
    const i = index(x, y);
    if (!isSprinklerMachine(DEFS[world.type[i]])) return false;
    const current = Math.round(world.machineSetting[i]) & 1;
    world.machineSetting[i] = current | (enabled ? 2 : 0);
    return true;
}

export function getMachineSetting(x, y) {
    if (!inBounds(x, y)) return null;
    const i = index(x, y);
    const def = DEFS[world.type[i]];
    return def?.machine ? world.machineSetting[i] : null;
}

export function setMachineSetting(x, y, value) {
    if (!inBounds(x, y)) return false;
    const i = index(x, y);
    const def = DEFS[world.type[i]];
    const bounds = machineSettingBounds(def);
    if (!bounds || !Number.isFinite(value)) return false;
    world.machineSetting[i] = Math.max(bounds.min, Math.min(bounds.max, Math.round(value)));
    return true;
}

// Public electrical state for later devices as well as the current renderer.
export function isPowered(x, y) {
    return inBounds(x, y) && world.power[index(x, y)] > 0;
}

export function getStoredCharge(x, y) {
    return inBounds(x, y) ? world.charge[index(x, y)] : 0;
}

// Returns the shared charge level for the connected Battery entity under the
// cursor. The UI needs the whole reservoir rather than just one cell, since
// adding or discharging charge affects every connected Battery cell equally.
export function getConnectedBatteryCharge(x, y) {
    if (!inBounds(x, y)) return null;

    const start = index(x, y);
    const battery = DEFS[world.type[start]];
    if (!battery || battery.name !== 'Battery') return null;

    const visited = new Uint8Array(world.type.length);
    const queue = [start];
    visited[start] = 1;
    let totalCharge = 0;
    let totalCapacity = 0;

    for (let head = 0; head < queue.length; head++) {
        const i = queue[head];
        const def = DEFS[world.type[i]];
        totalCharge += world.charge[i];
        totalCapacity += def.chargeCapacity;

        const cellX = i % COLS;
        const cellY = Math.floor(i / COLS);
        for (const [dx, dy] of ELECTRICAL_NEIGHBOURS) {
            const nx = cellX + dx;
            const ny = cellY + dy;
            if (!inBounds(nx, ny)) continue;
            const ni = ny * COLS + nx;
            if (visited[ni] || world.type[ni] !== world.type[start]) continue;
            visited[ni] = 1;
            queue.push(ni);
        }
    }

    return {
        charge: totalCharge,
        capacity: totalCapacity,
        ratio: totalCapacity > 0 ? Math.min(1, Math.max(0, totalCharge / totalCapacity)) : 0
    };
}

export function clearWorld() {
    world.type.fill(EMPTY);
    world.life.fill(0);
    world.lifeMax.fill(0);
    world.residue.fill(0);
    world.temp.fill(AMBIENT);
    world.heat.fill(0);
    world.humidity.fill(ambientHumidityTarget);
    world.plantHealth.fill(0);
    world.corrosionExposure.fill(0);
    world.plantCooldown.fill(0);
    world.data.fill(0);
    world.machineSetting.fill(0);
    world.storageType.fill(0);
    world.storageCount.fill(0);
    world.storageFlowRemainder.fill(0);
    world.machinePortEndpointRemap.fill(0);
    world.machinePortEndpointSlot.fill(0);
    world.machinePortLeadRemap.fill(0);
    world.machinePortLeadSlot.fill(0);
    world.sprinklerLaunchDirection.fill(0);
    world.sprinklerLaunchAge.fill(0);
    world.splitterOutputFlowA.fill(0);
    world.splitterOutputFlowB.fill(0);
    world.mixerInputTypeA.fill(0);
    world.mixerInputCountA.fill(0);
    world.mixerInputFlowA.fill(0);
    world.mixerInputTypeB.fill(0);
    world.mixerInputCountB.fill(0);
    world.mixerInputFlowB.fill(0);
    world.mixerOutputCountA.fill(0);
    world.mixerOutputCountB.fill(0);
    world.mixerOutputFlow.fill(0);
    world.mixerNextInput.fill(0);
    world.mixerOutputNext.fill(0);
    for (const field of SPRINKLER_SPRAY_FIELDS) world[field].fill(0);
    world.power.fill(0);
    world.powerDelay.fill(0);
    world.charge.fill(0);
    world.wind.fill(0);
    world.airflowX.fill(0);
    world.airflowY.fill(0);
    world.airflowNextX.fill(0);
    world.airflowNextY.fill(0);
    world.generalWindX.fill(0);
    world.generalWindY.fill(0);
    world.gustWindX.fill(0);
    world.gustWindY.fill(0);
    world.displayWindX.fill(0);
    world.displayWindY.fill(0);
    storageFunnelMachines = [];
    if (storageBarrierMask) storageBarrierMask.fill(0);
    if (collectorSealMask) collectorSealMask.fill(0);
    if (collectorRimMask) collectorRimMask.fill(0);
    collectorMasksDirty = false;
    tubingFlows = [];
    hasMixerMachine = false;
    windTrailsAlive = 0;
    activeGust = null;
    gustWait = ambientWindOn ? 60 : 0;
    generalWindCacheFrame = -1;
    windShelterFrame = -1;
    gustFieldCells.length = 0;
}

// What a freshly placed particle starts with in its data slot. A plant gets a
// growing budget somewhere in its own range, so a row of them comes up at
// different heights instead of looking like a fence. A seed instead gets the
// one thing it has to settle at the moment it exists: whether it is buoyant.
// That is decided here, once, and never revisited, so a seed that came up a
// floater is a floater for as long as it lasts.
function startingData(def) {
    if (def?.machine === 'sprinkler') return DEFAULT_SPRINKLER_RELEASE_RATE;
    // Hand-painted rays start with the tool's direction before the UI sees its
    // first drag. Machine emissions overwrite this with their marked direction.
    if (def?.name === 'Heat Ray') return 2; // up
    if (def?.name === 'Cold Ray') return 3; // down
    if (def.floatChance > 0) return random() < def.floatChance ? 1 : 0;
    if (def.growHeight <= 0) return 0;
    const spread = def.growHeight - def.growHeightMin;
    return def.growHeightMin + Math.floor(random() * (spread + 1));
}

export function index(x, y) { return y * COLS + x; }
export function inBounds(x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS; }

// Returns the particle at a coordinate, or -1 when the coordinate is off the
// grid. Giving off-grid its own value means the edges behave like solid walls
// without needing a separate bounds check at every call site.
function typeAt(x, y) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return OUT_OF_BOUNDS;
    return world.type[y * COLS + x];
}

function storageIntakeIsWall(x, y) {
    ensureCollectorMasks();
    return inBounds(x, y) && !!storageBarrierMask?.[index(x, y)];
}

function collectorSealIsWall(x, y) {
    ensureCollectorMasks();
    return inBounds(x, y) && !!collectorSealMask?.[index(x, y)];
}

function typeAtForMovement(def, x, y) {
    const id = typeAt(x, y);
    if (id !== EMPTY || (!storageIntakeIsWall(x, y) && !collectorSealIsWall(x, y))) return id;
    return STORAGE_VIRTUAL_WALL;
}

// Puts a particle into a cell, giving it its starting temperature and lifetime.
// This is what the brush uses.
export function setCell(x, y, id, keepTemp) {
    if (!inBounds(x, y)) return;
    const i = y * COLS + x;
    const def = DEFS[id];
    const previousType = world.type[i];
    if (isCollectorMachine(DEFS[previousType]) || isCollectorMachine(def)) collectorMasksDirty = true;
    const wasSameRay = previousType === id && def?.forceRate > 0;
    world.type[i] = id;
    if (def?.machine === 'mixer') hasMixerMachine = true;
    world.residue[i] = EMPTY;
    const lifetime = def.life > 0
        ? def.life + Math.floor((random() - 0.5) * def.lifeVariance)
        : 0;
    world.life[i] = lifetime;
    world.lifeMax[i] = lifetime;
    if (!keepTemp) {
        // Ray tools ramp from the local air temperature instead of arriving as
        // a fully hot or cold cell on the first painted frame.
        world.temp[i] = wasSameRay ? world.temp[i]
            : (def.forceRate > 0 ? getAirTempAt(y) : def.defaultTemp);
    }
    world.heat[i] = 0;
    world.plantHealth[i] = def?.isPlant ? 0.5 : 0;
    world.corrosionExposure[i] = 0;
    world.plantCooldown[i] = 0;
    world.data[i] = startingData(def);
    world.machineSetting[i] = def.machine ? defaultMachineSetting(def) : 0;
    world.storageType[i] = 0;
    world.storageCount[i] = 0;
    world.storageFlowRemainder[i] = 0;
    if (previousType !== id) {
        world.machinePortEndpointRemap[i] = 0;
        world.machinePortEndpointSlot[i] = 0;
        world.machinePortLeadRemap[i] = 0;
        world.machinePortLeadSlot[i] = 0;
    }
    clearSprinklerLaunchState(i);
    clearMixerState(i);
    clearSprinklerSprayState(i);
    world.power[i] = 0;
    world.powerDelay[i] = 0;
    world.charge[i] = 0;
    world.shade[i] = random() * 255;
    world.moved[i] = 1;
}

// Replaces what is in a cell but leaves the cell temperature alone. Every state
// change (melting, freezing, burning) goes through here, because a material
// changing state does not change how hot that spot is.
function transform(i, id, life, residue) {
    const def = DEFS[id];
    if (isCollectorMachine(DEFS[world.type[i]]) || isCollectorMachine(def)) collectorMasksDirty = true;
    world.type[i] = id;
    const lifetime = life !== undefined ? life
        : (def.life > 0 ? def.life + Math.floor((random() - 0.5) * def.lifeVariance) : 0);
    world.life[i] = lifetime;
    world.lifeMax[i] = lifetime;
    world.residue[i] = residue || EMPTY;
    world.heat[i] = 0;
    world.plantHealth[i] = def?.isPlant ? 0.5 : 0;
    world.corrosionExposure[i] = 0;
    world.plantCooldown[i] = 0;
    world.data[i] = startingData(def);
    world.machineSetting[i] = def.machine ? defaultMachineSetting(def) : 0;
    world.storageType[i] = 0;
    world.storageCount[i] = 0;
    world.storageFlowRemainder[i] = 0;
    world.machinePortEndpointRemap[i] = 0;
    world.machinePortEndpointSlot[i] = 0;
    world.machinePortLeadRemap[i] = 0;
    world.machinePortLeadSlot[i] = 0;
    clearSprinklerLaunchState(i);
    clearMixerState(i);
    clearSprinklerSprayState(i);
    world.power[i] = 0;
    world.powerDelay[i] = 0;
    world.charge[i] = 0;
    world.shade[i] = random() * 255;
    world.moved[i] = 1;
}

function defaultBulkInsulation(category) {
    if (category === 'static') return 0.3;
    if (category === 'powder') return 0.12;
    if (category === 'liquid') return 0.05;
    return 0;
}

function removeParticle(i) {
    if (isCollectorMachine(DEFS[world.type[i]])) collectorMasksDirty = true;
    world.type[i] = EMPTY;
    world.life[i] = 0;
    world.lifeMax[i] = 0;
    world.residue[i] = EMPTY;
    world.heat[i] = 0;
    world.plantHealth[i] = 0;
    world.corrosionExposure[i] = 0;
    world.plantCooldown[i] = 0;
    world.data[i] = 0;
    world.machineSetting[i] = 0;
    world.storageType[i] = 0;
    world.storageCount[i] = 0;
    world.storageFlowRemainder[i] = 0;
    world.machinePortEndpointRemap[i] = 0;
    world.machinePortEndpointSlot[i] = 0;
    world.machinePortLeadRemap[i] = 0;
    world.machinePortLeadSlot[i] = 0;
    clearSprinklerLaunchState(i);
    clearMixerState(i);
    clearSprinklerSprayState(i);
    world.power[i] = 0;
    world.powerDelay[i] = 0;
    world.charge[i] = 0;
    world.moved[i] = 1;
}

function swapCells(i1, i2) {
    if (isCollectorMachine(DEFS[world.type[i1]]) || isCollectorMachine(DEFS[world.type[i2]])) {
        collectorMasksDirty = true;
    }
    let t = world.type[i1]; world.type[i1] = world.type[i2]; world.type[i2] = t;
    let h = world.temp[i1]; world.temp[i1] = world.temp[i2]; world.temp[i2] = h;
    let l = world.life[i1]; world.life[i1] = world.life[i2]; world.life[i2] = l;
    let lm = world.lifeMax[i1]; world.lifeMax[i1] = world.lifeMax[i2]; world.lifeMax[i2] = lm;
    let r = world.residue[i1]; world.residue[i1] = world.residue[i2]; world.residue[i2] = r;
    let s = world.shade[i1]; world.shade[i1] = world.shade[i2]; world.shade[i2] = s;
    let q = world.heat[i1]; world.heat[i1] = world.heat[i2]; world.heat[i2] = q;
    let plantHealth = world.plantHealth[i1]; world.plantHealth[i1] = world.plantHealth[i2]; world.plantHealth[i2] = plantHealth;
    let corrosion = world.corrosionExposure[i1]; world.corrosionExposure[i1] = world.corrosionExposure[i2]; world.corrosionExposure[i2] = corrosion;
    let plantCooldown = world.plantCooldown[i1]; world.plantCooldown[i1] = world.plantCooldown[i2]; world.plantCooldown[i2] = plantCooldown;
    let f = world.surface[i1]; world.surface[i1] = world.surface[i2]; world.surface[i2] = f;
    let d = world.data[i1]; world.data[i1] = world.data[i2]; world.data[i2] = d;
    let ms = world.machineSetting[i1]; world.machineSetting[i1] = world.machineSetting[i2]; world.machineSetting[i2] = ms;
    let st = world.storageType[i1]; world.storageType[i1] = world.storageType[i2]; world.storageType[i2] = st;
    let sc = world.storageCount[i1]; world.storageCount[i1] = world.storageCount[i2]; world.storageCount[i2] = sc;
    let sfr = world.storageFlowRemainder[i1]; world.storageFlowRemainder[i1] = world.storageFlowRemainder[i2]; world.storageFlowRemainder[i2] = sfr;
    let endpointRemap = world.machinePortEndpointRemap[i1]; world.machinePortEndpointRemap[i1] = world.machinePortEndpointRemap[i2]; world.machinePortEndpointRemap[i2] = endpointRemap;
    let endpointSlot = world.machinePortEndpointSlot[i1]; world.machinePortEndpointSlot[i1] = world.machinePortEndpointSlot[i2]; world.machinePortEndpointSlot[i2] = endpointSlot;
    let leadRemap = world.machinePortLeadRemap[i1]; world.machinePortLeadRemap[i1] = world.machinePortLeadRemap[i2]; world.machinePortLeadRemap[i2] = leadRemap;
    let leadSlot = world.machinePortLeadSlot[i1]; world.machinePortLeadSlot[i1] = world.machinePortLeadSlot[i2]; world.machinePortLeadSlot[i2] = leadSlot;
    let sprinklerDirection = world.sprinklerLaunchDirection[i1]; world.sprinklerLaunchDirection[i1] = world.sprinklerLaunchDirection[i2]; world.sprinklerLaunchDirection[i2] = sprinklerDirection;
    let sprinklerAge = world.sprinklerLaunchAge[i1]; world.sprinklerLaunchAge[i1] = world.sprinklerLaunchAge[i2]; world.sprinklerLaunchAge[i2] = sprinklerAge;
    let splitterFlowA = world.splitterOutputFlowA[i1]; world.splitterOutputFlowA[i1] = world.splitterOutputFlowA[i2]; world.splitterOutputFlowA[i2] = splitterFlowA;
    let splitterFlowB = world.splitterOutputFlowB[i1]; world.splitterOutputFlowB[i1] = world.splitterOutputFlowB[i2]; world.splitterOutputFlowB[i2] = splitterFlowB;
    if (isMixerMachine(DEFS[world.type[i1]]) || isMixerMachine(DEFS[world.type[i2]]) ||
        isSprinklerMachine(DEFS[world.type[i1]]) || isSprinklerMachine(DEFS[world.type[i2]])) {
        for (const field of [
            'mixerInputTypeA', 'mixerInputCountA', 'mixerInputFlowA',
            'mixerInputTypeB', 'mixerInputCountB', 'mixerInputFlowB',
            'mixerOutputCountA', 'mixerOutputCountB', 'mixerOutputTypeA', 'mixerOutputTypeB', 'mixerOutputMixed',
            'mixerOutputFlow',
            'mixerNextInput', 'mixerOutputNext', ...SPRINKLER_SPRAY_FIELDS
        ]) {
            const value = world[field][i1]; world[field][i1] = world[field][i2]; world[field][i2] = value;
        }
    }
    let p = world.power[i1]; world.power[i1] = world.power[i2]; world.power[i2] = p;
    let pd = world.powerDelay[i1]; world.powerDelay[i1] = world.powerDelay[i2]; world.powerDelay[i2] = pd;
    let c = world.charge[i1]; world.charge[i1] = world.charge[i2]; world.charge[i2] = c;
    world.moved[i1] = 1;
    world.moved[i2] = 1;
}

// A Spark schedules a travelling wave over the whole connected conductor. The
// delay is the weighted distance from the contact point, so the visible yellow
// front moves away in both directions and reaches every branch and endpoint.
// Each cell is only visibly powered while the front passes over it.
function energizeConnectedMetal(seeds, chargeStorage = true) {
    if (seeds.length === 0) return;

    const distance = new Int32Array(world.type.length);
    distance.fill(-1);
    const queue = [];
    const touched = [];

    for (const seed of seeds) {
        if (distance[seed] !== -1) continue;
        distance[seed] = 0;
        queue.push(seed);
        touched.push(seed);
    }

    for (let head = 0; head < queue.length; head++) {
        const i = queue[head];
        forEachConductiveConnection(i, ni => {
            const nextDef = DEFS[world.type[ni]];
            if (!chargeStorage && nextDef.chargeCapacity > 0) return;

            const travelFrames = Math.max(1,
                Math.ceil(1 / Math.max(0.01, nextDef.electricalConductivity)));
            const nextDistance = distance[i] + travelFrames;
            if (distance[ni] !== -1 && distance[ni] <= nextDistance) return;
            if (distance[ni] === -1) touched.push(ni);
            distance[ni] = nextDistance;
            queue.push(ni);
        });
    }

    const storageCells = [];
    let stored = 0;
    let storageCapacity = 0;
    let chargePerSpark = 0;

    for (const i of touched) {
        const delay = Math.min(65535, distance[i]);
        if (delay === 0) {
            world.power[i] = POWER_GLOW_FRAMES;
        } else if (world.powerDelay[i] === 0 || delay < world.powerDelay[i]) {
            world.powerDelay[i] = delay;
        }

        const def = DEFS[world.type[i]];
        if (def.chargeCapacity > 0 && def.chargePerSpark > 0) {
            storageCells.push(i);
            stored += world.charge[i];
            storageCapacity += def.chargeCapacity;
            chargePerSpark = Math.max(chargePerSpark, def.chargePerSpark);
        }
    }

    // A Spark carries a fixed amount of energy. Sharing it across every
    // storage cell means a larger Battery mass has proportionally more total
    // capacity, but needs proportionally more Sparks (or a Spark brush held on
    // it for longer) to reach the same yellow charge level.
    if (chargeStorage && storageCells.length > 0 && storageCapacity > 0) {
        const fullness = Math.min(1, (stored + chargePerSpark) / storageCapacity);
        for (const i of storageCells) {
            world.charge[i] = DEFS[world.type[i]].chargeCapacity * fullness;
        }
    }
}

function conductiveNeighbours(x, y) {
    const neighbours = [];
    const source = index(x, y);
    forEachConductiveConnection(source, ni => neighbours.push(ni));
    return neighbours;
}

// Solid Copper and Iron wires can reach two cells beyond their physical end.
// Empty cells may form that short electrical jump, but any material in the gap
// stops it. The reach is directional along the eight neighbouring grid lines,
// matching the simulator's existing eight-way wire connectivity.
function forEachConductiveConnection(i, callback) {
    const source = DEFS[world.type[i]];
    const reach = Math.max(1, source?.wireReach || 0);
    const x = i % COLS;
    const y = Math.floor(i / COLS);

    for (const [dx, dy] of ELECTRICAL_NEIGHBOURS) {
        for (let distance = 1; distance <= reach; distance++) {
            const nx = x + dx * distance;
            const ny = y + dy * distance;
            if (!inBounds(nx, ny)) break;
            const ni = ny * COLS + nx;
            const nextDef = DEFS[world.type[ni]];
            if (nextDef && nextDef.conductive) callback(ni);
            if (world.type[ni] !== EMPTY) break;
        }
    }
}

// Returns the total load of the conductive grid reached from a Battery
// source. Battery cells are deliberately not traversed here: two separate
// batteries may touch the same wire grid, but neither battery should become a
// bridge into the other battery's reservoir.
function electricalPortWireCells(port) {
    if (!world || !port?.connectionCell || port.family !== 'electrical') return [];
    const candidates = new Set();
    const add = cell => {
        if (!cell || !inBounds(cell.x, cell.y)) return;
        const i = index(cell.x, cell.y);
        if (portAcceptsMaterial(port, world.type[i]) && DEFS[world.type[i]]?.conductive) candidates.add(i);
    };
    add(port.connectionCell);
    const machineX = port.machineIndex % COLS;
    const machineY = Math.floor(port.machineIndex / COLS);
    for (let y = Math.max(0, machineY - 24); y <= Math.min(ROWS - 1, machineY + 24); y++) {
        for (let x = Math.max(0, machineX - 24); x <= Math.min(COLS - 1, machineX + 24); x++) {
            const i = index(x, y);
            if (leadOwnerAtCell(x, y) !== port.machineIndex ||
                world.machinePortLeadSlot[i] !== port.slot + 1) continue;
            add({ x, y });
        }
    }
    return [...candidates];
}

function buildElectricalMachineLoads() {
    const loadsByWire = new Map();
    for (let machine = 0; machine < world.type.length; machine++) {
        const def = DEFS[world.type[machine]];
        if (def?.machine !== 'lamp' || (Math.round(world.machineSetting[machine]) & 1) === 0 ||
            !(def.powerConsumption > 0)) continue;
        const input = machinePortDescriptors(machine).find(port => port.family === 'electrical' &&
            port.role === 'input');
        for (const wire of electricalPortWireCells(input)) {
            let loads = loadsByWire.get(wire);
            if (!loads) loadsByWire.set(wire, loads = []);
            loads.push(machine);
        }
    }
    return loadsByWire;
}

function connectedGridConsumption(seeds, electricalLoadsByWire = null) {
    if (seeds.length === 0) return 0;

    const visited = new Uint8Array(world.type.length);
    const queue = [];
    const countedMachineLoads = new Set();
    let consumption = 0;

    for (const seed of seeds) {
        if (visited[seed]) continue;
        visited[seed] = 1;
        queue.push(seed);
    }

    for (let head = 0; head < queue.length; head++) {
        const i = queue[head];
        const def = DEFS[world.type[i]];
        if (!def || !def.conductive) continue;
        consumption += def.powerConsumption;
        for (const machine of electricalLoadsByWire?.get(i) || []) {
            if (countedMachineLoads.has(machine)) continue;
            countedMachineLoads.add(machine);
            consumption += DEFS[world.type[machine]]?.powerConsumption || 0;
        }

        forEachConductiveConnection(i, ni => {
            const nextDef = DEFS[world.type[ni]];
            if (visited[ni] || nextDef.chargeCapacity > 0) return;
            visited[ni] = 1;
            queue.push(ni);
        });
    }

    return consumption;
}

// Directly touching storage metals behave as one reservoir. This conserves
// their total charge while equalising fullness, so fresh Battery painted onto
// a charged piece draws charge from the old cells immediately on the next
// simulation frame. Eight-way contact matches electrical wire connectivity.
function balanceStoredCharge() {
    const visited = new Uint8Array(world.type.length);
    let electricalLoadsByWire = null;

    for (let start = 0; start < world.type.length; start++) {
        const startDef = DEFS[world.type[start]];
        if (visited[start] || !startDef || !(startDef.chargeCapacity > 0)) continue;

        const cells = [start];
        const queue = [start];
        visited[start] = 1;
        let totalCharge = 0;
        let totalCapacity = 0;
        const dischargeContacts = [];
        const seenContacts = new Set();

        for (let head = 0; head < queue.length; head++) {
            const i = queue[head];
            const def = DEFS[world.type[i]];
            totalCharge += world.charge[i];
            totalCapacity += def.chargeCapacity;

            const x = i % COLS;
            const y = Math.floor(i / COLS);
            for (const [dx, dy] of ELECTRICAL_NEIGHBOURS) {
                const nx = x + dx;
                const ny = y + dy;
                if (!inBounds(nx, ny)) continue;
                const ni = ny * COLS + nx;
                if (visited[ni]) continue;
                const nextDef = DEFS[world.type[ni]];
                if (nextDef && nextDef.conductive && nextDef.chargeCapacity <= 0 &&
                    !seenContacts.has(ni)) {
                    seenContacts.add(ni);
                    dischargeContacts.push(ni);
                }
                if (!nextDef || !(nextDef.chargeCapacity > 0)) continue;
                visited[ni] = 1;
                cells.push(ni);
                queue.push(ni);
            }
        }

        // Every conductive cell in the connected grid draws its configured
        // amount on every simulation tick. A bare copper wire therefore drains
        // very slowly, while powered machines can make the same grid consume
        // hundreds of charge units per tick.
        if (!electricalLoadsByWire) electricalLoadsByWire = buildElectricalMachineLoads();
        const gridConsumption = connectedGridConsumption(dischargeContacts, electricalLoadsByWire) /
            BATTERY_DISCHARGE_SCALE;
        if (totalCharge > 0 && gridConsumption > 0) {
            totalCharge = Math.max(0, totalCharge - gridConsumption);
            energizeConnectedMetal(dischargeContacts, false);
        }

        const fullness = totalCapacity > 0 ? Math.min(1, totalCharge / totalCapacity) : 0;
        for (const i of cells) {
            world.charge[i] = DEFS[world.type[i]].chargeCapacity * fullness;
        }
    }
}

function updateElectricalPower() {
    for (let i = 0; i < world.type.length; i++) {
        const id = world.type[i];
        if (id === EMPTY) {
            world.power[i] = 0;
            world.powerDelay[i] = 0;
            world.charge[i] = 0;
            continue;
        }

        const def = DEFS[id];
        if (!def.conductive) {
            world.power[i] = 0;
            world.powerDelay[i] = 0;
        }
        if (def.chargeCapacity <= 0) world.charge[i] = 0;

        if (world.power[i] > 0) world.power[i]--;
        if (world.powerDelay[i] > 0) {
            world.powerDelay[i]--;
            if (world.powerDelay[i] === 0) world.power[i] = POWER_GLOW_FRAMES;
        }
    }

    balanceStoredCharge();
    relayElectricalSwitches();
}

function relayElectricalSwitches() {
    for (let machine = 0; machine < world.type.length; machine++) {
        if (DEFS[world.type[machine]]?.machine !== 'simpleSwitch' ||
            (Math.round(world.machineSetting[machine]) & 1) === 0) continue;
        const ports = machinePortDescriptors(machine);
        const input = ports.find(port => port.family === 'electrical' && port.role === 'input');
        const output = ports.find(port => port.family === 'electrical' && port.role === 'output');
        if (!electricalPortWireCells(input).some(wire => world.power[wire] > 0)) continue;
        const outputWires = electricalPortWireCells(output);
        if (outputWires.length) energizeConnectedMetal(outputWires, false);
    }
}

// ------------------------------------------------------------------ main step

function isAirSpace(id) {
    return AIR_SPACE_BY_TYPE[id] === 1;
}

// Mark every airspace cell that can reach the canvas edge. The eight-way
// flood matches gas movement: diagonal openings connect rooms too.
function markOpenAirCells() {
    const type = world.type;
    const open = world.moved;
    const queue = tempNextFloodQueue;
    open.fill(0);
    let head = 0;
    let tail = 0;
    const cellCount = type.length;
    const lastRowStart = (ROWS - 1) * COLS;

    // Keep horizontal edge flags in the already-reused mask so neighbour
    // expansion never needs to divide or modulo an index by the world width.
    for (let y = 0; y < ROWS; y++) {
        const rowStart = y * COLS;
        open[rowStart] = 2;
        open[rowStart + COLS - 1] |= 4;
    }

    for (let x = 0; x < COLS; x++) {
        let i = x;
        if (AIR_SPACE_BY_TYPE[type[i]] && !(open[i] & 1)) {
            open[i] |= 1;
            queue[tail++] = i;
        }
        i = lastRowStart + x;
        if (AIR_SPACE_BY_TYPE[type[i]] && !(open[i] & 1)) {
            open[i] |= 1;
            queue[tail++] = i;
        }
    }
    for (let y = 1; y < ROWS - 1; y++) {
        let i = y * COLS;
        if (AIR_SPACE_BY_TYPE[type[i]] && !(open[i] & 1)) {
            open[i] |= 1;
            queue[tail++] = i;
        }
        i += COLS - 1;
        if (AIR_SPACE_BY_TYPE[type[i]] && !(open[i] & 1)) {
            open[i] |= 1;
            queue[tail++] = i;
        }
    }

    while (head < tail) {
        const i = queue[head++];
        const edgeFlags = open[i];
        if (i >= COLS) {
            const neighbour = i - COLS;
            if (!(open[neighbour] & 1) && AIR_SPACE_BY_TYPE[type[neighbour]]) {
                open[neighbour] |= 1;
                queue[tail++] = neighbour;
            }
        }
        if (i < cellCount - COLS) {
            const neighbour = i + COLS;
            if (!(open[neighbour] & 1) && AIR_SPACE_BY_TYPE[type[neighbour]]) {
                open[neighbour] |= 1;
                queue[tail++] = neighbour;
            }
        }
        if (!(edgeFlags & 2)) {
            const neighbour = i - 1;
            if (!(open[neighbour] & 1) && AIR_SPACE_BY_TYPE[type[neighbour]]) {
                open[neighbour] |= 1;
                queue[tail++] = neighbour;
            }
            if (i >= COLS) {
                const diagonal = i - COLS - 1;
                if (!(open[diagonal] & 1) && AIR_SPACE_BY_TYPE[type[diagonal]]) {
                    open[diagonal] |= 1;
                    queue[tail++] = diagonal;
                }
            }
            if (i < cellCount - COLS) {
                const diagonal = i + COLS - 1;
                if (!(open[diagonal] & 1) && AIR_SPACE_BY_TYPE[type[diagonal]]) {
                    open[diagonal] |= 1;
                    queue[tail++] = diagonal;
                }
            }
        }
        if (!(edgeFlags & 4)) {
            const neighbour = i + 1;
            if (!(open[neighbour] & 1) && AIR_SPACE_BY_TYPE[type[neighbour]]) {
                open[neighbour] |= 1;
                queue[tail++] = neighbour;
            }
            if (i >= COLS) {
                const diagonal = i - COLS + 1;
                if (!(open[diagonal] & 1) && AIR_SPACE_BY_TYPE[type[diagonal]]) {
                    open[diagonal] |= 1;
                    queue[tail++] = diagonal;
                }
            }
            if (i < cellCount - COLS) {
                const diagonal = i + COLS + 1;
                if (!(open[diagonal] & 1) && AIR_SPACE_BY_TYPE[type[diagonal]]) {
                    open[diagonal] |= 1;
                    queue[tail++] = diagonal;
                }
            }
        }
    }
}

// Humidity belongs to the location in the room, not to a particle. Updating
// one quarter of the field each frame keeps the extra air simulation bounded
// while every cell still gets fresh diffusion and source/sink input every four
// ticks. The existing open-air flood mask distinguishes outside air from rooms.
function updateHumidityField() {
    const count = world.type.length;
    const phase = humidityCursor & 3;
    humidityCursor = (humidityCursor + 1) & 3;
    const water = idOf('Water');
    const steam = idOf('Steam');
    const cloud = idOf('Cloud');
    for (let i = phase; i < count; i += 4) {
        if (!AIR_SPACE_BY_TYPE[world.type[i]]) continue;
        const x = i % COLS;
        const y = Math.floor(i / COLS);
        const current = world.humidity[i];
        const localAirTemp = getAirTempAt(y);
        let neighbourTotal = 0;
        let neighbourCount = 0;
        let source = 0;
        let sink = 0;
        for (const [dx, dy] of HUMIDITY_NEIGHBOURS) {
            const nx = x + dx;
            const ny = y + dy;
            if (!inBounds(nx, ny)) continue;
            const ni = index(nx, ny);
            const id = world.type[ni];
            if (AIR_SPACE_BY_TYPE[id]) {
                neighbourTotal += world.humidity[ni];
                neighbourCount++;
                if (id === steam) source += 0.8;
                if (id === cloud) source += 0.04;
                continue;
            }
            const def = DEFS[id];
            if (id === water && world.temp[ni] > 0) source += 0.42;
            if (def?.isPlant) source += Math.max(0.12, def.humidityContribution * 0.8);
            if (def?.name === 'Sand' || def?.name === 'Dry Mud') sink += 0.26;
        }

        let humidity = current;
        if (neighbourCount > 0) {
            const exchange = world.moved[i] & 1 ? 0.055 : 0.025;
            humidity += (neighbourTotal / neighbourCount - humidity) * exchange;
        }
        if (world.moved[i] & 1) humidity += (ambientHumidityTarget - humidity) * 0.006;
        humidity += source * 0.6 - sink * 0.04;
        world.humidity[i] = Math.max(0, Math.min(100, humidity));

        // Clouds nucleate sparsely in exposed high air at saturation when that
        // air reaches the configured dewpoint. Enclosed chambers cannot spawn
        // weather, though their local humidity is still retained and shared.
        if (cloud > 0 && world.type[i] === EMPTY && (world.moved[i] & 1) &&
            y < ROWS * 0.42 && world.humidity[i] >= 88 &&
            localAirTemp <= dewpointTarget && random() < 0.00012 && !nearbyClouds(x, y, 3)) {
            transform(i, cloud);
            world.temp[i] = localAirTemp;
            world.humidity[i] = Math.max(0, world.humidity[i] - 12);
        }
    }
}

function nearbyClouds(x, y, radius) {
    const cloud = idOf('Cloud');
    if (cloud === EMPTY) return false;
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (inBounds(nx, ny) && world.type[index(nx, ny)] === cloud) return true;
        }
    }
    return false;
}

export function stepSimulation() {
    frameCount++;
    advancePrevailingWindCycle();
    // Ease the air temperature towards whatever the slider is set to. This is
    // deliberately slow, and each material's own "cooling" figure is small, so
    // a flame or a block of ice next to a cell always has far more say over its
    // temperature than the weather does.
    if (AMBIENT !== ambientTarget) {
        AMBIENT += (ambientTarget - AMBIENT) * 0.004;
        if (Math.abs(ambientTarget - AMBIENT) < 0.05) AMBIENT = ambientTarget;
    }
    markOpenAirCells();
    updateHumidityField();
    diffuseHeat();
    radiateHeat();
    computeLiquidSurfaces();
    world.moved.fill(0);
    refreshStorageFunnelMachines();
    updateElectricalPower();
    decayAndAdvectFanAir();
    updateActiveMachines();
    applyFanAirflowToParticles();
    updateStorageBins();
    updateSprinklers();
    updateTubingFlows();
    updateMixers();
    // A newly delivered item can use release credit accumulated earlier in
    // this frame, but the rate is accrued only once per frame.
    updateSprinklers(false);

    // Natural wind applies on freshly cleared moved flags, before gravity and
    // particle motion, so a carried item still moves at most once this tick.
    updateAmbientWind();

    // Bottom row upwards, so a falling particle is not processed again after it
    // lands. The left/right scan order flips every frame, otherwise piles drift
    // steadily to one side.
    for (let y = ROWS - 1; y >= 0; y--) {
        const leftToRight = ((frameCount + y) & 1) === 0;
        for (let step = 0; step < COLS; step++) {
            const x = leftToRight ? step : COLS - 1 - step;
            const i = y * COLS + x;
            const id = world.type[i];
            if (id === EMPTY) continue;
            if (world.moved[i]) continue;

            const def = DEFS[id];

            // A particle that changed into something else this frame is done.
            if (def.hasStateChange && applyStateChange(x, y, i, def)) continue;
            if (def.hasReaction && applyReactions(x, y, i, def)) continue;

            // Both hand-painted and machine-emitted Heat Ray/Cold Ray cells are
            // projectiles. Their cell data stores the eight-way direction; only
            // machine emissions carry bit 3, which is reserved for their
            // separate one-way temperature behavior.
            if (def.projectile) {
                moveProjectile(x, y, i, def);
                continue;
            }

            if (!def.moves) {
                if (world.sprinklerLaunchDirection[i]) clearSprinklerLaunchState(i);
                continue;
            }
            if (moveSprinklerLaunchedParticle(x, y, i, def)) continue;

            // moveChance is how readily something shifts about of its own
            // accord. Gravity is not a matter of choice: everything falls at
            // its own fall speed whatever this says, and a low moveChance only
            // makes it slow to creep, slide and settle. That is what lets lava
            // crawl along the ground at the pace of treacle while still
            // dropping through open air like the heavy stuff it is, and what
            // stops wet ground looking like it is floating down.
            const sluggish = def.moveChance < 1 && random() > def.moveChance;

            if (def.category === 'powder') movePowder(x, y, i, def, sluggish);
            else if (def.category === 'liquid') moveLiquid(x, y, i, def, sluggish);
            else if (def.category === 'gas' && !sluggish) moveGas(x, y, i, def);
        }
    }
}

export function getFrameCount() { return frameCount; }

// ------------------------------------------------------------------ heat flow
//
// Every cell exchanges heat with each of its four neighbours using a symmetric
// contact rate derived from both materials, then separately leaks towards the
// ambient air temperature. At the boundary the missing neighbour is the cell
// itself: ambient cooling already applies evenly everywhere, so treating an
// off-grid neighbour as extra air would cool edges and corners faster and make
// steam rain there disproportionately.
//
// This single pass is what drives melting, boiling, freezing and ignition, so
// there are no special "is there a fire next to me" checks anywhere.

// Four contacts can contribute in one frame, so keep the per-edge rate below a
// quarter. The geometric mean makes a high-conductivity source matter while a
// very insulating material still limits the shared interface.
const THERMAL_TRANSFER_SCALE = 1.35;
const MAX_CONTACT_TRANSFER = 0.24;
const OPEN_AIR_CONTACT_CONDUCTIVITY = 0.001;
const THERMAL_NETWORK_SUBSTEPS = 32;
const thermalNetworkCells = [];

function thermalNetworkPairRate(first, second, firstOpenAir, secondOpenAir) {
    const firstRate = first.thermalNetworkRate;
    const secondRate = second.thermalNetworkRate;
    if (firstRate > 0 && secondRate > 0) {
        return Math.min(MAX_CONTACT_TRANSFER, Math.sqrt(firstRate * secondRate));
    }
    if (firstRate > 0 && isAirSpace(second.id) && !(secondOpenAir & 1)) {
        return Math.min(MAX_CONTACT_TRANSFER, firstRate);
    }
    if (secondRate > 0 && isAirSpace(first.id) && !(firstOpenAir & 1)) {
        return Math.min(MAX_CONTACT_TRANSFER, secondRate);
    }
    return 0;
}

function thermalContactRate(first, second, firstOpenAir, secondOpenAir) {
    // Eligible conductor and enclosed-air pairs use the dedicated local
    // network below so their configured rate is not double-counted here.
    if (thermalNetworkPairRate(first, second, firstOpenAir, secondOpenAir) > 0) return 0;
    // Open air cells remain coupled to each other so the ambient profile
    // settles at the existing pace. A material exchanging heat with open air
    // uses the weaker air-to-material interface; enclosed air keeps the full
    // contact rate and can hold or receive chamber heat.
    let firstConductivity = first.conductivity;
    let secondConductivity = second.conductivity;
    if (first.id === EMPTY && firstOpenAir && second.id !== EMPTY) {
        firstConductivity = OPEN_AIR_CONTACT_CONDUCTIVITY;
    }
    if (second.id === EMPTY && secondOpenAir && first.id !== EMPTY) {
        secondConductivity = OPEN_AIR_CONTACT_CONDUCTIVITY;
    }
    firstConductivity = Math.max(0, firstConductivity);
    secondConductivity = Math.max(0, secondConductivity);
    if (firstConductivity === 0 || secondConductivity === 0) return 0;
    return Math.min(MAX_CONTACT_TRANSFER,
        Math.sqrt(firstConductivity * secondConductivity) * THERMAL_TRANSFER_SCALE);
}

function diffuseHeat() {
    const type = world.type;
    const temp = world.temp;
    const next = world.tempNext;
    const shade = world.shade;
    const openAir = world.moved;
    thermalNetworkCells.length = 0;

    for (let y = 0; y < ROWS; y++) {
        const rowStart = y * COLS;
        const rowAir = getAirTempAt(y);
        for (let x = 0; x < COLS; x++) {
            const i = rowStart + x;
            const def = DEFS[type[i]];
            const t = temp[i];
            const id = type[i];
            const airCell = isAirSpace(type[i]);
            const enclosedAirCell = airCell && !openAir[i];
            if (def.thermalNetworkRate > 0) {
                thermalNetworkCells.push(i);
            } else if (airCell && !(openAir[i] & 1) && (
                (y > 0 && DEFS[type[i - COLS]].thermalNetworkRate > 0) ||
                (y < ROWS - 1 && DEFS[type[i + COLS]].thermalNetworkRate > 0) ||
                (x > 0 && DEFS[type[i - 1]].thermalNetworkRate > 0) ||
                (x < COLS - 1 && DEFS[type[i + 1]].thermalNetworkRate > 0))) {
                thermalNetworkCells.push(i);
            }

            // A surface still responds almost normally, but heat has a harder
            // time reaching a cell buried behind several layers of the same
            // material. Four matching neighbours is a true interior cell;
            // three is a shallow subsurface cell and receives half the effect.
            let sameNeighbours = 0;
            if (y > 0 && type[i - COLS] === id) sameNeighbours++;
            if (y < ROWS - 1 && type[i + COLS] === id) sameNeighbours++;
            if (x > 0 && type[i - 1] === id) sameNeighbours++;
            if (x < COLS - 1 && type[i + 1] === id) sameNeighbours++;
            const buried = Math.max(0, (sameNeighbours - 2) * 0.5);
            const conductionScale = 1 - def.bulkInsulation * buried;
            const coolingScale = 1 - def.bulkInsulation * buried * 0.7;

            let result = t;
            if (y > 0) {
                const neighbour = i - COLS;
                result += (temp[neighbour] - t) * thermalContactRate(
                    def, DEFS[type[neighbour]], openAir[i], openAir[neighbour]);
            }
            if (y < ROWS - 1) {
                const neighbour = i + COLS;
                result += (temp[neighbour] - t) * thermalContactRate(
                    def, DEFS[type[neighbour]], openAir[i], openAir[neighbour]);
            }
            if (x > 0) {
                const neighbour = i - 1;
                result += (temp[neighbour] - t) * thermalContactRate(
                    def, DEFS[type[neighbour]], openAir[i], openAir[neighbour]);
            }
            if (x < COLS - 1) {
                const neighbour = i + 1;
                result += (temp[neighbour] - t) * thermalContactRate(
                    def, DEFS[type[neighbour]], openAir[i], openAir[neighbour]);
            }
            result = t + (result - t) * conductionScale;

            // Open air keeps following the ambient dial and height profile.
            // Enclosed airspace has its own temperature and changes only via
            // contact conduction, radiant heat, or explicit source forces.
            // Other contents exchange their slow ambient response with the
            // air at every adjacent face. Open faces use the outside air's
            // height-dependent temperature; enclosed faces use that cell's
            // current temperature.
            let coolingAir = rowAir;
            let hasCoolingAir = airCell && !enclosedAirCell;
            if (!airCell) {
                let adjacentAirTotal = 0;
                let adjacentAirCount = 0;
                if (y > 0) {
                    const neighbour = i - COLS;
                    if (isAirSpace(type[neighbour])) {
                        adjacentAirTotal += openAir[neighbour]
                            ? getAirTempAt(y - 1)
                            : temp[neighbour];
                        adjacentAirCount++;
                    }
                }
                if (y < ROWS - 1) {
                    const neighbour = i + COLS;
                    if (isAirSpace(type[neighbour])) {
                        adjacentAirTotal += openAir[neighbour]
                            ? getAirTempAt(y + 1)
                            : temp[neighbour];
                        adjacentAirCount++;
                    }
                }
                if (x > 0) {
                    const neighbour = i - 1;
                    if (isAirSpace(type[neighbour])) {
                        adjacentAirTotal += openAir[neighbour]
                            ? rowAir
                            : temp[neighbour];
                        adjacentAirCount++;
                    }
                }
                if (x < COLS - 1) {
                    const neighbour = i + 1;
                    if (isAirSpace(type[neighbour])) {
                        adjacentAirTotal += openAir[neighbour]
                            ? rowAir
                            : temp[neighbour];
                        adjacentAirCount++;
                    }
                }
                if (adjacentAirCount > 0) {
                    coolingAir = adjacentAirTotal / adjacentAirCount;
                    hasCoolingAir = def.ambientCooling;
                }
            }

            let coolingRate = def.cooling;
            if (def.coolingVariance > 0) {
                const variation = (shade[i] / 255 - 0.5) * 2;
                coolingRate *= 1 + variation * def.coolingVariance;
            }
            if (hasCoolingAir) {
                result += (coolingAir + airOffset[shade[i]] - result) * coolingRate * coolingScale;
            }

            // Heat sources (fire, lava) push themselves back up towards their
            // own temperature. emitRate decides how hard that is to fight:
            // a low rate means enough water can quench it.
            if (def.emit > result) result += (def.emit - result) * def.emitRate;

            // The heat and cold ray tools drag their cell towards a set
            // temperature in both directions, so they can chill as well as
            // heat. They burn out after a few frames, which is what stops them
            // piling up like a normal material.
            if (def.forceRate > 0) {
                let forceTemp = def.forceTemp;
                // Rays emitted by a configured machine inherit that machine's
                // target. Hand-painted rays keep their original two-way tool
                // behaviour.
                if (def.projectile && (world.data[i] & 8) &&
                    Number.isFinite(world.machineSetting[i])) {
                    forceTemp = world.machineSetting[i];
                    const delta = forceTemp - result;
                    forceTemp = def.name === 'Heat Ray'
                        ? result + Math.max(0, delta)
                        : result + Math.min(0, delta);
                }
                if (forceTemp !== undefined) result += (forceTemp - result) * def.forceRate;
            }

            // Something that starts far hotter than anything around it loses
            // heat at its own steady rate rather than in proportion to how cold
            // the air happens to be. Lava at 1150C does not cool twice as fast
            // because the weather turned, and the middle of a flow gives up its
            // heat at the same rate as the edges, so the whole of it stiffens
            // together instead of setting from the outside in. It stops at the
            // temperature of the air, never running colder than its
            // surroundings.
            if (hasCoolingAir && def.coolsBy > 0 && result > coolingAir) {
                let rate = def.coolsBy;
                // Something lying on top of it holds the heat in. Only the cell
                // directly above is looked at, which is all a crust is.
                if (def.insulatedCooling !== 1 && y > 0 &&
                    def.insulatedBy.includes(type[i - COLS])) {
                    rate *= def.insulatedCooling;
                }
                result = Math.max(coolingAir, result - rate);
            }

            next[i] = result;
        }
    }

    world.temp = next;
    world.tempNext = temp;
    const queueSwap = tempFloodQueue;
    tempFloodQueue = tempNextFloodQueue;
    tempNextFloodQueue = queueSwap;

    diffuseThermalNetwork();
}

function diffuseThermalNetwork() {
    const type = world.type;
    const openAir = world.moved;
    const current = world.temp;
    const next = world.tempNext;
    const width = COLS;
    const length = type.length;

    // Several stable contact substeps move heat through connected conductors
    // and their enclosed air while keeping every exchange local and symmetric.
    for (let step = 0; step < THERMAL_NETWORK_SUBSTEPS; step++) {
        for (let n = 0; n < thermalNetworkCells.length; n++) {
            const i = thermalNetworkCells[n];
            const id = type[i];
            const t = current[i];
            let transfer = 0;
            if (i >= width) {
                const neighbour = i - width;
                transfer += (current[neighbour] - t) * thermalNetworkPairRate(
                    DEFS[id], DEFS[type[neighbour]], openAir[i], openAir[neighbour]);
            }
            if (i < length - width) {
                const neighbour = i + width;
                transfer += (current[neighbour] - t) * thermalNetworkPairRate(
                    DEFS[id], DEFS[type[neighbour]], openAir[i], openAir[neighbour]);
            }
            if (i % width !== 0) {
                const neighbour = i - 1;
                transfer += (current[neighbour] - t) * thermalNetworkPairRate(
                    DEFS[id], DEFS[type[neighbour]], openAir[i], openAir[neighbour]);
            }
            if (i % width !== width - 1) {
                const neighbour = i + 1;
                transfer += (current[neighbour] - t) * thermalNetworkPairRate(
                    DEFS[id], DEFS[type[neighbour]], openAir[i], openAir[neighbour]);
            }
            next[i] = t + transfer;
        }
        for (let n = 0; n < thermalNetworkCells.length; n++) {
            const i = thermalNetworkCells[n];
            current[i] = next[i];
        }
    }
}

// A diagonal neighbour is further away than a square one, so it catches less.
const RADIANT_DIAGONAL = 0.55;

// Radiant heat: what a flame throws at everything around it, as opposed to what
// it passes on by touch.
//
// Conduction alone cannot spread a fire sideways. A flame is a gas, so the
// instant a cell catches light the flame rises off it, and it is next to the
// thing beside it for only a frame or two - nowhere near long enough to average
// it up to its ignition point. That is why a pool of oil would sit there with a
// fire on top of it and never light, and why a row of plants only ever caught
// from below. Radiating outward in all eight directions fixes both, and is what
// fire actually does.
//
// Nothing is ever heated past the temperature of what is heating it, so this
// can warm a room but never run away.
function radiateHeat() {
    const type = world.type;
    const temp = world.temp;

    for (let y = 0; y < ROWS; y++) {
        const rowStart = y * COLS;
        for (let x = 0; x < COLS; x++) {
            const i = rowStart + x;
            const def = DEFS[type[i]];
            // Written the positive way round on purpose: "<= 0" would be false
            // for a definition that never set the field at all, and every cell
            // in the world would start radiating undefined degrees.
            if (!(def.radiates > 0)) continue;

            const source = temp[i];
            for (let dy = -1; dy <= 1; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= ROWS) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = x + dx;
                    if (nx < 0 || nx >= COLS) continue;

                    const ni = ny * COLS + nx;
                    if (temp[ni] >= source) continue;
                    const amount = dx === 0 || dy === 0
                        ? def.radiates
                        : def.radiates * RADIANT_DIAGONAL;
                    temp[ni] = Math.min(source, temp[ni] + amount);
                }
            }
        }
    }
}

export function getTemperature(x, y) {
    return inBounds(x, y) ? world.temp[y * COLS + x] : AMBIENT;
}

// -------------------------------------------------------------- state changes
//
// Purely temperature driven. Returns true when the cell became something else,
// in which case the caller stops working on it for this frame.
//
// Latent heat: a state change does not happen the instant a cell crosses its
// threshold. Instead the cell banks heat every frame it is past the threshold,
// by how far past it is, and only changes once it has banked its "latent"
// amount. That is why a block of ice sits in a puddle for a while instead of
// vanishing, but disappears almost at once when a flame is held against it -
// and it stops materials flickering back and forth across their threshold.

function applyStateChange(x, y, i, def) {
    const t = world.temp[i];

    let change = null;
    let over = 0;

    if (def.evaporatesAbove !== undefined && t > def.evaporatesAbove) {
        if (def.evaporationHumidity > 0) {
            world.humidity[i] = Math.min(100, world.humidity[i] + def.evaporationHumidity);
        }
        removeParticle(i);
        return true;
    }

    if (def.ignitePoint !== undefined && t > def.ignitePoint) {
        change = 'ignite';
        over = t - def.ignitePoint;
    } else if (def.boilPoint !== undefined && t > def.boilPoint) {
        change = 'boil';
        over = t - def.boilPoint;
    } else if (def.meltPoint !== undefined && t > def.meltPoint) {
        change = 'melt';
        over = t - def.meltPoint;
    } else if (def.freezePoint !== undefined && t < def.freezePoint &&
               !(def.bedrockKeepsMolten && y === ROWS - 1)) {
        // Something that has to land before it can set - lava, which should
        // never hang in the air as a stone - goes on cooling while it falls and
        // only turns solid once there is something underneath it. The banked
        // heat is left alone rather than bled off, so a cooled drop sets the
        // moment it arrives instead of having to cool all over again.
        if (def.freezeNeedsGround && !hasGroundUnder(x, y)) return false;
        change = 'freeze';
        over = def.freezePoint - t;
    }

    if (change === null) {
        // Back below the threshold again, so the banked heat bleeds away.
        if (world.heat[i] > 0) world.heat[i] *= 0.95;
        return false;
    }

    world.heat[i] += over;
    if (world.heat[i] < def.latent) return false;
    world.heat[i] = 0;

    if (change === 'ignite') {
        // Something explosive does not burn, it lights its fuse and keeps
        // falling until the fuse runs out.
        if (def.blastRadius > 0) {
            if (world.data[i] === 0) world.data[i] = def.fuse;
            return false;
        }
        // Catching fire: the cell becomes flame for burnLife frames and
        // remembers what it should leave behind once the flame dies out.
        transform(i, def.burnsInto, def.burnLife || undefined, def.emberInto);
        return true;
    }

    if (change === 'boil') {
        // Puff the by-product (mud gives off steam as it dries out) into a free
        // neighbouring cell if there is one.
        if (def.boilEmits !== EMPTY) {
            const spot = findEmptyNeighbour(x, y);
            if (spot >= 0) {
                transform(spot, def.boilEmits);
                world.temp[spot] = Math.max(world.temp[spot], DEFS[def.boilEmits].defaultTemp);
            }
        }
        transform(i, def.boilsInto);
        world.temp[i] = Math.max(world.temp[i], DEFS[def.boilsInto].defaultTemp);
        return true;
    }

    if (change === 'melt') {
        transform(i, def.meltsInto);
        return true;
    }

    // Make the escape decision at the actual condensation point, rather than
    // when the steam is placed or produced. This applies before either liquid
    // rain or solid snow is chosen.
    if (def.condenseLossChance > 0 && random() < def.condenseLossChance) {
        removeParticle(i);
        return true;
    }

    // Freezing. A gas that would normally condense to a liquid turns straight
    // into a solid instead when the air around it is cold enough - which is
    // steam falling as snow rather than as rain.
    const air = getAirTempAt(y);
    if (def.depositsInto !== EMPTY && air < def.depositPoint) {
        transform(i, def.depositsInto);
        // A snowflake comes out at the temperature of the air that made it, not
        // at the temperature the steam was. Leaving it hot would have the snow
        // melt the instant it formed.
        world.temp[i] = Math.min(world.temp[i], air);
        return true;
    }

    transform(i, def.freezesInto);
    return true;
}

// Has this cell come to rest on something? The bottom of the world counts as
// ground, and so does anything solid or loose; open air does not, and neither
// does water, which a sinking lump is still on its way down through. This is
// what keeps cooling scoria from setting into stone halfway down a pond and
// leaving a slab of it hanging there with nothing underneath.
function hasGroundUnder(x, y) {
    const below = typeAt(x, y + 1);
    if (below === OUT_OF_BOUNDS) return true;
    if (below === EMPTY) return false;
    const under = DEFS[below].category;
    return under !== 'liquid' && under !== 'gas';
}

function findEmptyNeighbour(x, y) {
    const start = Math.floor(random() * 4);
    for (let n = 0; n < 4; n++) {
        const d = (start + n) % 4;
        const nx = x + (d === 0 ? -1 : d === 1 ? 1 : 0);
        const ny = y + (d === 2 ? -1 : d === 3 ? 1 : 0);
        if (typeAt(nx, ny) === EMPTY) return ny * COLS + nx;
    }
    return -1;
}

// Spark sources throw sparks into any empty neighboring cell. That lets a
// source charge Battery above, below, or beside it rather than making its
// placement direction matter.
function findEmptySparkSpace(x, y) {
    const start = Math.floor(random() * ELECTRICAL_NEIGHBOURS.length);
    for (let n = 0; n < ELECTRICAL_NEIGHBOURS.length; n++) {
        const [dx, dy] = ELECTRICAL_NEIGHBOURS[(start + n) % ELECTRICAL_NEIGHBOURS.length];
        if (typeAt(x + dx, y + dy) === EMPTY) return (y + dy) * COLS + x + dx;
    }
    return -1;
}

function hasLiquidNeighbour(x, y) {
    for (const [dx, dy] of ELECTRICAL_NEIGHBOURS) {
        if (DEFS[typeAt(x + dx, y + dy)]?.category === 'liquid') return true;
    }
    return false;
}

// ------------------------------------------------------------------ reactions
//
// The things temperature alone cannot express: lifetimes, water soaking into
// sand, acid eating through matter, plants growing. Returns true when the cell
// stopped being what it was.

function applyReactions(x, y, i, def) {
    if (def.plantSpecies && def.isPlant && ((frameCount + i) & 3) === 0 &&
        updatePlantHealth(x, y, i, def)) return true;

    // Steam and Cloud share one dewpoint rule. Local humidity determines
    // saturation; the air temperature determines whether condensation occurs
    // and whether it settles as liquid rain or solid snow.
    if (def.dewpointCondensation) {
        const localAirTemp = getAirTempAt(y);
        const humidity = humidityNearCell(x, y);
        const requiredHumidity = def.precipitationChance > 0 ? 88 : 82;
        const reachesDewpoint = localAirTemp <= dewpointTarget;
        const precipitates = def.precipitationChance > 0 && reachesDewpoint &&
            humidity >= requiredHumidity && random() < def.precipitationChance;
        const steamCondenses = def.precipitationChance === 0 && reachesDewpoint && humidity >= requiredHumidity;
        if (precipitates || steamCondenses) {
            const precipitationTemp = def.precipitationChance > 0
                ? Math.min(localAirTemp, ambientTarget) : localAirTemp;
            const precipitation = precipitationTemp <= 0 ? idOf('Snow') : idOf('Water');
            if (precipitation !== EMPTY) {
                transform(i, precipitation);
                world.temp[i] = precipitationTemp <= 0 ? Math.min(world.temp[i], precipitationTemp) : precipitationTemp;
                world.humidity[i] = Math.max(0, world.humidity[i] - 18);
                return true;
            }
        }
    }

    // Non-machine metal needs sustained water or humidity exposure before
    // the source cell rusts. Machines and storage bins are not part of this
    // weathering mechanic. Replacing the source lets corrosion powder fall
    // away and leave gaps instead of coating intact metal with cosmetic rust.
    if (def.metal && !def.machine && ((frameCount + i) & 3) === 0) {
        const humidity = humidityNearCell(x, y);
        const exposedToAir = hasAirNeighbour(x, y);
        if (hasCardinalWaterNeighbour(x, y) || (exposedToAir && humidity >= 98)) {
            world.corrosionExposure[i] = Math.min(65535, world.corrosionExposure[i] + 1);
        } else {
            world.corrosionExposure[i] = Math.max(0, world.corrosionExposure[i] - 2);
        }
        if (world.corrosionExposure[i] >= CORROSION_POWDER_EXPOSURE_REQUIRED *
            def.corrosionResistance) {
            transform(i, idOf('Corrosion'));
            return true;
        }
    }

    if (def.plantSpecies && def.isSeed && ((frameCount + i) & 3) === 0 &&
        world.temp[i] >= def.germinationMinTemp &&
        humidityNearCell(x, y) >= def.germinationMinHumidity) {
        if (def.plantSpecies === 'moss') {
            const rule = def.sprouts[0];
            const grownDef = rule ? DEFS[rule.into] : null;
            const substrateMoisture = grownDef
                ? plantSubstrateMoisture(x, y, grownDef) : 0;
            if (!rule || !mossSubstrateWithin(x, y, 1) ||
                substrateMoisture < (grownDef?.moistureNeed || 0) || random() >= rule.chance) return false;
            transform(i, rule.into);
            world.data[i] = startingData(DEFS[rule.into]);
            return true;
        }
        const under = typeAt(x, y + 1);
        for (const rule of def.sprouts) {
            if (under !== rule.on) continue;
            const depth = rule.submergedInto !== EMPTY ? openWaterDepth(x, y) : 0;
            const grown = depth >= def.submergedDepth && rule.submergedInto !== EMPTY
                ? rule.submergedInto : rule.into;
            const grownDef = DEFS[grown];
            const substrateMoisture = grownDef
                ? germinationMoistureAt(x, y, grownDef, under) : 0;
            if (substrateMoisture < (grownDef?.moistureNeed || 0) || random() >= rule.chance) continue;
            if (depth >= def.submergedDepth && crowdedBy(x, y, rule.submergedInto)) return false;
            transform(i, grown);
            world.data[i] = depth >= def.submergedDepth ? Math.min(255, depth + 10) : startingData(DEFS[grown]);
            if (grown === idOf('Grass') && under === idOf('Wet Mud')) {
                world.data[i] = Math.min(255, world.data[i] + DEFS[grown].richSoilGrowthBonus);
            }
            return true;
        }
    }

    // An ordinary Spark touching any conductor becomes a travelling power
    // pulse. Sparks emitted by stored charge carry data=1 and are visual only,
    // which prevents charged Battery from feeding itself forever.
    if (def.energizesConductors && world.data[i] === 0) {
        const conductors = conductiveNeighbours(x, y);
        if (conductors.length > 0) {
            energizeConnectedMetal(conductors);
            removeParticle(i);
            return true;
        }
    }

    // Battery keeps the charge added by each pulse. At higher charge it gives
    // off occasional decorative sparks without spending or reapplying charge;
    // a future device can read the stored value and discharge it deliberately.
    if (def.chargeCapacity > 0 && world.charge[i] > 0 && def.chargeSparkChance > 0) {
        const fullness = world.charge[i] / def.chargeCapacity;
        if (random() < def.chargeSparkChance * fullness) {
            const spot = findEmptyNeighbour(x, y);
            if (spot >= 0) {
                const spark = idOf('Spark');
                transform(spot, spark);
                world.data[spot] = 1;
                world.temp[spot] = Math.max(world.temp[spot], DEFS[spark].defaultTemp);
            }
        }
    }

    // Spark sources spend their own lifetime producing ordinary Sparks around
    // themselves. Any touching liquid suppresses the source until it clears.
    // The Sparks are real particles, so they can charge Battery and conduct
    // its pulse normally before the source pixel eventually wears out.
    if (def.sparkEmitterChance > 0 && !hasLiquidNeighbour(x, y) &&
        random() < def.sparkEmitterChance) {
        const spot = findEmptySparkSpace(x, y);
        if (spot >= 0) {
            const spark = idOf('Spark');
            transform(spot, spark);
            world.temp[spot] = Math.max(world.temp[spot], DEFS[spark].defaultTemp);
        }
    }

    // A lit grain of gunpowder, a frame or two from going off. It keeps
    // behaving normally in the meantime, so a lit heap still slumps and falls.
    if (def.blastRadius > 0 && world.data[i] > 0) {
        world.data[i]--;
        world.temp[i] = Math.max(world.temp[i], 300);   // it glows as it catches
        if (world.data[i] === 0) {
            explode(x, y, def);
            return true;
        }
    }

    // Lifetime. Fire and smoke burn out; a burning cell leaves its residue.
    if (def.life > 0) {
        world.life[i]--;
        if (def.lifeTransitionInto !== EMPTY && def.lifeTransitionAt > 0 &&
            world.life[i] > 0 && world.life[i] <= world.lifeMax[i] * def.lifeTransitionAt) {
            transform(i, def.lifeTransitionInto);
            return true;
        }
        if (world.life[i] <= 0) {
            const residue = world.residue[i];
            if (residue !== EMPTY) {
                transform(i, residue);
            } else if (def.decaysInto !== EMPTY && random() < def.decayChance) {
                transform(i, def.decaysInto);
            } else if (def.smokeChance > 0 && random() < def.smokeChance) {
                transform(i, idOf('Smoke'));
            } else removeParticle(i);
            return true;
        }
    }

    // Fire is put out by water or steam touching it, which is quicker and more
    // predictable than waiting for the heat to bleed away.
    if (def.emit > 0 && def.category === 'gas') {
        const water = idOf('Water');
        const steam = idOf('Steam');
        for (let d = 0; d < 4; d++) {
            const nx = x + (d === 0 ? -1 : d === 1 ? 1 : 0);
            const ny = y + (d === 2 ? -1 : d === 3 ? 1 : 0);
            const n = typeAt(nx, ny);
            if (n === water || n === steam) {
                transform(i, idOf('Smoke'));
                world.temp[i] = Math.min(world.temp[i], 120);
                return true;
            }
        }
    }

    // And from the other side: water puts out any flame it touches. Checking it
    // both ways matters, because whichever of the two has already moved this
    // frame gets skipped, and a bucket of water thrown over a fire should not
    // depend on which one the grid happened to reach first.
    if (def.douses) {
        for (let d = 0; d < 4; d++) {
            const nx = x + (d === 0 ? -1 : d === 1 ? 1 : 0);
            const ny = y + (d === 2 ? -1 : d === 3 ? 1 : 0);
            const n = typeAt(nx, ny);
            if (n > 0 && DEFS[n].emit > 0 && DEFS[n].category === 'gas') {
                const ni = ny * COLS + nx;
                transform(ni, idOf('Smoke'));
                world.temp[ni] = Math.min(world.temp[ni], 120);
            }
        }
    }

    // Molten rock hitting water. Heat alone does not quite manage this: the
    // water boils off faster than it can chill the lava, so the moment they
    // touch is handled directly. The lava sets into stone and the water it
    // touched flashes to steam.
    if (def.quenchedInto !== EMPTY) {
        const water = idOf('Water');
        for (let d = 0; d < 4; d++) {
            const nx = x + (d === 0 ? -1 : d === 1 ? 1 : 0);
            const ny = y + (d === 2 ? -1 : d === 3 ? 1 : 0);
            if (typeAt(nx, ny) !== water) continue;
            const ni = ny * COLS + nx;
            transform(ni, idOf('Steam'));
            world.temp[ni] = Math.max(world.temp[ni], 160);
            transform(i, def.quenchedInto);
            world.temp[i] = Math.min(world.temp[i], 400);
            return true;
        }
    }

    // Some hot materials alter only what they are resting on. This is kept
    // separate from ordinary temperature changes because it is the sustained
    // weight and contact of the lava that compacts mud into scoria; a warm mud
    // cell elsewhere should remain mud.
    if (def.convertsBelow.length > 0) {
        const under = typeAt(x, y + 1);
        if (under > 0) {
            for (const rule of def.convertsBelow) {
                if (under !== rule.on || random() >= rule.chance) continue;
                const below = i + COLS;
                transform(below, rule.into);
                if (rule.temp !== undefined) {
                    world.temp[below] = Math.max(world.temp[below], rule.temp);
                }
                break;
            }
        }
    }

    // The weight of a deep, supported wet-mud column compacts its lowest cells
    // into clay. Fifty cells remain loose; everything below that line changes
    // from the bottom upwards. Requiring support stops a falling ribbon of mud
    // turning solid in mid-air.
    if (def.compactsInto !== EMPTY && canCompactColumn(x, y, def)) {
        transform(i, def.compactsInto);
        return true;
    }

    // Water filters down into loose ground instead of perching on its surface.
    // A dry grain consumes the drop and becomes its wet form. Already-wet
    // powder lets the drop trade places with it and continue down. Before a
    // fresh drop enters, the wet column is inspected: a supported, completely
    // wet column or fifty wet cells is saturated, so surplus water stays on
    // top and remains available to level out sideways.
    if (def.soaks) {
        const below = typeAt(x, y + 1);
        if (below > 0) {
            const ground = DEFS[below];
            if (ground.wetsInto !== EMPTY && random() < ground.wetChance) {
                if (world.data[i] >= MAX_WATER_INFILTRATION_DEPTH) {
                    removeParticle(i);
                    return true;
                }
                transform(i + COLS, ground.wetsInto);
                removeParticle(i);
                return true;
            }
            const saturated = world.data[i] === 0 && ground.waterPermeability > 0 &&
                saturatedPowderBelow(x, y + 1);
            if (!saturated && ground.waterPermeability > 0 &&
                (world.data[i] > 0 || random() < ground.waterPermeability)) {
                if (world.data[i] >= MAX_WATER_INFILTRATION_DEPTH) {
                    removeParticle(i);
                    return true;
                }
                swapCells(i, i + COLS);
                world.data[i + COLS] = world.data[i + COLS] + 1;
                return true;
            }
        }
        if (world.data[i] > 0 && below !== EMPTY) {
            removeParticle(i);
            return true;
        }
    }

    // Fumes killing off whatever green thing they drift through. The gas is not
    // taken up in doing it - it withers what it touches and carries straight
    // on - so a cloud of it works its way right across a bank of plants and
    // leaves bare sand behind it.
    if (def.withersPlants !== EMPTY) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const n = typeAt(x + dx, y + dy);
                if (n <= 0 || !DEFS[n].isPlant) continue;
                if (random() >= def.witherChance) continue;
                transform((y + dy) * COLS + (x + dx), def.withersPlants);
            }
        }
    }

    // Acid dissolving whatever it is resting against.
    if (def.corrosion > 0) {
        for (let d = 0; d < 4; d++) {
            const nx = x + (d === 0 ? -1 : d === 1 ? 1 : 0);
            const ny = y + (d === 2 ? -1 : d === 3 ? 1 : 0);
            const n = typeAt(nx, ny);
            if (n > 0 && DEFS[n].corrodible && random() < def.corrosion) {
                const ni = ny * COLS + nx;
                if (def.corrodeEmits !== EMPTY) {
                    transform(ni, def.corrodeEmits);
                } else removeParticle(ni);
                // The acid is used up as it eats, otherwise one drop dissolves
                // the whole world.
                if (random() < 0.5) {
                    transform(i, idOf('Smoke'));
                    return true;
                }
                break;
            }
        }
    }

    // What it has come to rest ON changes it: snow landing in water melts into
    // it on the spot, snow settling on ice packs down into ice over time.
    //
    // Only what is directly underneath counts. Checking all round would mean a
    // single drop of meltwater at the foot of a snowbank ran away sideways and
    // turned the whole bank to water at once.
    if (def.contacts.length > 0) {
        const under = typeAt(x, y + 1);
        if (under > 0) {
            for (const rule of def.contacts) {
                if (under !== rule.on) continue;
                if (random() >= rule.chance) continue;
                transform(i, rule.into);
                if (rule.temp !== undefined) world.temp[i] = rule.temp;
                return true;
            }
        }
    }

    // A seed landing on wet ground sprouts. Dry ground will not do - it is the
    // water in the ground that starts it off - and nor will cold ground, since
    // nothing germinates in the frost.
    //
    // A seed that comes up on the bed of open water is a different plant
    // altogether: it climbs as a net through the water and opens out into a
    // lily on the surface. That is settled here, on the one frame the seed
    // germinates, from the water standing over it at that moment. Nothing
    // afterwards re-checks it, so draining the pond leaves the lily growing.
    if (!def.isSeed && def.sprouts.length > 0 && world.temp[i] > def.sproutMinTemp) {
        const under = typeAt(x, y + 1);
        for (const rule of def.sprouts) {
            if (under !== rule.on) continue;
            if (random() >= rule.chance) break;

            const depth = rule.submergedInto !== EMPTY ? openWaterDepth(x, y) : 0;
            if (depth >= def.submergedDepth) {
                // Under water it is a lily or it is nothing. One that has
                // landed too close to a lily already growing simply does not
                // come up, and lies there until it rots - it does not settle
                // for being pondweed instead.
                if (crowdedBy(x, y, rule.submergedInto)) return false;
                transform(i, rule.submergedInto);
                // Enough climbing to reach the surface with some to spare,
                // measured from the water that is actually standing over it.
                // The spare matters: a net weaves as it climbs and strands that
                // cross each other have to find a way round.
                world.data[i] = Math.min(255, depth + 10);
                return true;
            }

            transform(i, rule.into);
            world.data[i] = startingData(DEFS[rule.into]);
            return true;
        }
    }

    // Growing. A plant puts out one new cell above itself, hands down all but
    // one of its remaining growth to it, and is then spent. Passing the budget
    // along like this is what makes a plant climb as a stem and stop at a
    // sensible height - and because a spent cell never grows again, a plant
    // that is burnt or dissolved stays gone instead of creeping back.
    if (def.growHeight > 0) {
        if (((frameCount + i) & 3) !== 0 ||
            (def.plantSpecies && plantHealthStateAt(x, y, def) !== 'thriving')) return false;
        let soil = ROOT_NONE;
        if (def.plantSpecies === 'moss') {
            if (!mossSubstrateWithin(x, y, 3)) return false;
        } else if (def.plantSpecies === 'water grass') {
            if (!waterWithin(x, y, 6)) return false;
            soil = ROOT_POOR;
        } else {
            soil = rootedIn(x, y);
            if (def.plantSpecies === 'banana' && soil === ROOT_NONE && waterWithin(x, y, 6)) {
                soil = ROOT_POOR;
            }
            if (def.plantSpecies && soil === ROOT_NONE) return false;
        }
        if (def.growStyle === 'moss') return spreadMoss(x, y, i, def);
        if (def.growStyle === 'surface') return creepAcrossSurface(x, y, i, def);

        const budget = world.data[i];
        const growthChance = def.plantSpecies === 'grass' && soil === ROOT_RICH
            ? def.growChance * def.richSoilGrowthMultiplier
            : def.growChance;
        if (budget > 1 && random() < growthChance) {
            // Nothing grows out of dry ground. A plant only puts on another
            // cell while some part of it - anywhere in the plant, not just the
            // cell doing the growing - is still touching wet mud or wet sand,
            // so a patch that dries out stops where it is instead of carrying
            // on regardless.
            if (!def.plantSpecies) soil = rootedIn(x, y);
            if (soil === ROOT_NONE) return false;

            if (def.growStyle === 'netting') return weaveThroughWater(x, y, i, def, budget);

            // Wet mud is the richer of the two soils. A plant with any part of
            // itself against wet mud grows on as the wet mud plant even if the
            // rest of it is standing in wet sand, and takes that plant's height
            // with it rather than staying stunted.
            const grows = soil === ROOT_RICH && WET_MUD_PLANT !== EMPTY && def.growStyle === null
                ? WET_MUD_PLANT
                : def.id;

            // Straight up most of the time, off to one side now and then, which
            // is enough to make it look like a plant rather than a pole.
            const sidewaysChance = def.growStyle === 'upright' ? 0.06
                : def.growStyle === 'banana' ? 0.025
                : def.growStyle === 'spindly' ? 0.72
                    : def.growStyle === 'branching' ? 0.34 : 0.25;
            const sideways = random() < sidewaysChance ? randomSign() : 0;
            for (const dx of [sideways, 0]) {
                const above = typeAt(x + dx, y - 1);
                if (above !== EMPTY && above !== idOf('Water')) continue;
                const ni = (y - 1) * COLS + (x + dx);
                transform(ni, grows);
                world.data[ni] = grows === def.id
                    ? budget - 1
                    : Math.max(budget - 1, world.data[ni]);
                if (def.growStyle === 'branching' && budget > 4 && random() < 0.28) {
                    const branchX = x - dx;
                    if (typeAt(branchX, y - 1) === EMPTY) {
                        const branch = (y - 1) * COLS + branchX;
                        transform(branch, grows);
                        world.data[branch] = Math.max(2, (budget - 1) >> 1);
                        world.plantHealth[branch] = world.plantHealth[ni];
                    }
                }
                if (def.growStyle === 'banana' && budget > 3 && budget % 4 === 0) {
                    growBananaFronds(x, y, world.plantHealth[i]);
                }
                world.data[i] = 1;
                return false;
            }
        }

        // Out of growth: the tip opens into a flower, which caps the stem off.
        // The flower picks its own colour from its shade number, so no two are
        // quite the same. Only a real tip flowers - nothing of the same plant
        // above it or to either side of that - otherwise a stem that put out a
        // side shoot would flower halfway up its own length.
        if (budget <= 1 && def.flowerInto !== EMPTY &&
            typeAt(x, y - 1) === EMPTY &&
            typeAt(x - 1, y - 1) !== def.id && typeAt(x + 1, y - 1) !== def.id) {
            transform(i, def.flowerInto);
            return true;
        }
    }

    // Setting seed. Only within reach of water - a plant somewhere dry lives
    // out its life but never reproduces. The seed is dropped to one side so it
    // falls clear of the plant below rather than landing back on top of it.
    if (def.seedChance > 0 && random() < def.seedChance) {
        if (def.plantSpecies) {
            if (plantHealthStateAt(x, y, def) !== 'thriving' || world.plantHealth[i] < 0.65 ||
                world.plantCooldown[i] > 0 || (def.seedLimit > 0 && countNearbySeedType(x, y, def.seedInto) >= def.seedLimit)) return false;
            world.plantCooldown[i] = 300;
        }
        if (def.seedWaterRange > 0 && !waterWithin(x, y, def.seedWaterRange)) return false;
        const side = randomSign();
        for (const dx of [side, -side]) {
            if (typeAt(x + dx, y - 1) !== EMPTY) continue;
            transform((y - 1) * COLS + (x + dx), def.seedInto);
            return false;
        }
    }

    return false;
}

// ------------------------------------------------------------------- rooting
//
// A plant is only as alive as its roots. Before any plant puts on another cell
// it has to be able to find wet ground somewhere along itself, which is what
// makes a patch stop growing when its soil dries out or when the ground is dug
// out from under it.

const ROOT_NONE = 0;   // nothing wet anywhere against it
const ROOT_POOR = 1;   // wet sand or wet ash
const ROOT_RICH = 2;   // wet mud, which beats wet sand wherever both are found

// How much of one plant is walked before the search gives up. The cap is what
// keeps the cost of the search off the frame time when a whole bank has grown
// into one connected mat of grass, or a pond is full of lilies tangled into
// each other. It is generous, because the walk only ever runs on the rare frame
// a plant is actually about to put on a cell, and because a lily that gave up
// looking would stop climbing halfway to the surface.
const ROOT_SEARCH_LIMIT = 512;

// Walking the plant needs somewhere to remember where it has already been. A
// stamp that counts up is used instead of a flag that has to be cleared, so no
// part of this ever has to sweep the whole grid.
let rootStack = null;
let rootStamp = null;
let rootVisit = 0;

// Walks every cell of one plant - the whole of it, side shoots included - and
// reports the best soil any part of it is touching.
//
// The walk crosses between kinds of plant rather than following one kind only,
// because a plant is not always made of one thing: grass that has found wet mud
// carries on upwards as a plant, and a lily is a stem with pads on top. Either
// way what is standing there is one plant with one set of roots.
function rootedIn(x, y) {
    const n = world.type.length;
    if (!rootStamp || rootStamp.length !== n) {
        rootStamp = new Int32Array(n);
        rootStack = new Int32Array(ROOT_SEARCH_LIMIT);
        rootVisit = 0;
    }

    const wetMud = idOf('Wet Mud');
    const wetSand = idOf('Wet Sand');
    const wetAsh = idOf('Wet Ash');

    rootVisit++;
    let top = 0;
    const start = y * COLS + x;
    rootStamp[start] = rootVisit;
    rootStack[top++] = start;

    let best = ROOT_NONE;
    let examined = 0;

    while (top > 0 && examined < ROOT_SEARCH_LIMIT) {
        const i = rootStack[--top];
        examined++;
        const cx = i % COLS;
        const cy = (i - cx) / COLS;

        for (let dy = -1; dy <= 1; dy++) {
            const ny = cy + dy;
            if (ny < 0 || ny >= ROWS) continue;
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = cx + dx;
                if (nx < 0 || nx >= COLS) continue;

                const ni = ny * COLS + nx;
                const found = world.type[ni];
                // Wet mud is the best there is, so there is nothing to gain by
                // carrying on once it turns up.
                if (found === wetMud) return ROOT_RICH;
                if (found === wetSand || found === wetAsh) best = ROOT_POOR;
                if (found === EMPTY || DEFS[found].growHeight <= 0) continue;
                if (rootStamp[ni] === rootVisit) continue;
                rootStamp[ni] = rootVisit;
                if (top < rootStack.length) rootStack[top++] = ni;
            }
        }
    }
    return best;
}

// ------------------------------------------------------------------- lilies
//
// A seed that germinates on the bed of a pond comes up as something else
// entirely. It climbs through the water as a loose net rather than as a stem,
// opens out into a pad when it reaches the surface, creeps sideways across the
// top of the water, and finishes with a broad white bloom in the middle.

// How deep the open water standing over this spot is, or 0 when it is not under
// open water at all - meaning there is no water directly above it, or none to
// either side of that, or the column is capped by something other than air.
//
// This is the one question a germinating seed asks. Whether the answer is big
// enough decides what kind of plant it becomes, for good; how big it is decides
// how much climbing the stem is given, so a lily that starts in deep water has
// the reach to make it up to the surface and one in the shallows does not waste
// its growth overshooting.
function openWaterDepth(x, y) {
    const water = idOf('Water');
    let depth = 0;
    let inOpenWater = false;
    let lookedSideways = false;

    for (let ny = y - 1; ny >= 0; ny--) {
        const found = typeAt(x, ny);
        if (found === water) {
            depth++;
            // The test for a pond rather than a crack is made at the first
            // water the column reaches, not down at the seed. A brushful lands
            // as a heap, and a seed in the middle of one has nothing but other
            // seeds to either side of it however wide the pond it is lying in.
            if (!lookedSideways) {
                lookedSideways = true;
                inOpenWater = waterBeside(x, ny);
            }
            continue;
        }
        // Open air over the water is the surface, which is what a lily needs to
        // reach.
        if (found === EMPTY) break;
        // Anything solid and fixed capping the column means this is not open
        // water at all - a flooded cellar, say, rather than a pond.
        if (capsWater(found)) return 0;
        // Everything else in the column is looked straight through without
        // being counted: the other seeds a brushful dropped in alongside this
        // one, and any lily already growing there. A seed at the bottom of a
        // pond is at the bottom of a pond whatever else happens to be floating
        // between it and the sky, and it was mistaking its own neighbours for a
        // lid that had it coming up as pondweed.
    }
    return inOpenWater ? depth : 0;
}

// How much elbow room a lily wants along the bed before another one takes root
// beside it. A brushful of seeds lands as a solid row, and without this every
// one of them would send up its own stem and the pond would come up as a green
// wall rather than as a few plants with water between them.
const LILY_SPACING = 3;

function crowdedBy(x, y, id) {
    for (let dx = -LILY_SPACING; dx <= LILY_SPACING; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (typeAt(x + dx, y + dy) === id) return true;
        }
    }
    return false;
}

// Something fixed and solid, which water cannot be open underneath.
//
// Growing things are see-through for this purpose, and that has to mean the
// whole plant and not only the parts that are still growing: a flower has no
// growth left in it, and counting it as a lid had a pond quietly stop producing
// lilies as soon as the first few plants in it came into flower.
function capsWater(id) {
    const def = DEFS[id];
    return def.category === 'static' && !def.isPlant;
}

// Is there water to one side of here as well, rather than only overhead? This
// is what tells a pond from a water filled crack in the rock. It steps past
// anything loose that happens to be floating alongside, and gives up at a wall.
function waterBeside(x, y) {
    const water = idOf('Water');
    for (const dir of [-1, 1]) {
        for (let n = 1; n <= 4; n++) {
            const found = typeAt(x + dir * n, y);
            if (found === OUT_OF_BOUNDS || found === EMPTY) break;
            if (found === water) return true;
            if (capsWater(found)) break;
        }
    }
    return false;
}

// The netted climb. Rather than stacking one cell on the next, the growing tip
// leans alternately left and right as it rises and forks off to the other side
// now and then, so what comes up through the water is an open mesh instead of a
// stalk. Only water is climbed through: the moment there is air overhead, the
// tip has reached the surface and opens out into a pad.
function weaveThroughWater(x, y, i, def, budget) {
    const water = idOf('Water');
    const above = typeAt(x, y - 1);

    if (above === EMPTY) {
        if (def.surfacePad !== EMPTY) {
            const health = world.plantHealth[i];
            transform(i, def.surfacePad);
            world.data[i] = def.surfacePadGrowth;
            world.plantHealth[i] = health;
            return true;
        }
        if (def.flowerInto === EMPTY) return false;
        transform(i, def.flowerInto);
        return true;
    }

    // No check on what is directly overhead beyond that: a tip with one of its
    // own strands sitting on top of it can still climb up and around to either
    // side, which is what keeps a net that has crossed itself from stalling
    // halfway up the pond.
    //
    // Which way this row leans. Tying it to the row rather than to chance is
    // what makes the mesh read as a weave rather than as a random scribble.
    const lean = (y & 1) === 0 ? 1 : -1;

    // A net is mostly holes. Somewhere with water to either side of it is
    // always taken in preference to somewhere wedged up against the strand
    // next door, and only now and then, when there is nowhere open left, does
    // a strand squeeze in alongside another. That is what keeps the mesh open
    // enough to see the pond through rather than filling in as a solid wall of
    // green - without ever letting a strand stall short of the surface.
    const squeeze = random() < 0.15;

    let grew = false;
    for (const dx of [lean, 0, -lean]) {
        const nx = x + dx;
        if (typeAt(nx, y - 1) !== water) continue;
        if (!squeeze && strandBeside(nx, y - 1, def.id)) continue;
        const ni = (y - 1) * COLS + nx;
        transform(ni, def.id);
        // Never less than enough to carry on climbing. A lily reaches the
        // surface however deep the water is: what stops it is running out of
        // water, not running out of growth, so the budget it was given only
        // governs how freely it forks on the way up.
        world.data[ni] = Math.max(2, budget - 1);
        grew = true;
        break;
    }
    if (!grew) return false;

    // The fork: a second strand off the other side, carrying half of what is
    // left. Strands that cross and rejoin are what turn a line into a net, and
    // it forks sparingly so that the net stays a net.
    if (budget > 4 && random() < 0.12) {
        const nx = x - lean;
        if (typeAt(nx, y - 1) === water && !strandBeside(nx, y - 1, def.id)) {
            const ni = (y - 1) * COLS + nx;
            transform(ni, def.id);
            world.data[ni] = (budget - 1) >> 1;
        }
    }

    world.data[i] = 1;
    return false;
}

// Is there already a strand of this plant immediately to one side of here?
// Refusing those spots is what leaves a cell of water between one strand of the
// netting and the next.
function strandBeside(x, y, id) {
    return typeAt(x - 1, y) === id || typeAt(x + 1, y) === id;
}

// A pad creeps outwards along the top of the water, one cell at a time to
// either side, until its share of the growth runs out. Once it has spread and
// has a pad on either side of it, the middle one - the one sitting on top of
// the stem that brought it up - opens into the bloom, taking its two
// neighbours with it so that the flower is broader than the pads around it.
function creepAcrossSurface(x, y, i, def) {
    const budget = world.data[i];

    if (budget > 1 && random() < def.growChance) {
        // Both ways at once. The side it came from is already a pad and so is
        // never a candidate, which is what keeps it spreading outwards.
        for (const dx of [-1, 1]) {
            if (!floatsOnSurface(x + dx, y)) continue;
            const ni = y * COLS + (x + dx);
            transform(ni, def.id);
            world.data[ni] = budget - 1;
        }
        world.data[i] = 1;
        return false;
    }

    if (budget <= 1 && def.flowerInto !== EMPTY &&
        typeAt(x - 1, y) === def.id && typeAt(x + 1, y) === def.id &&
        standsOnItsOwnStem(x, y)) {
        transform(i - 1, def.flowerInto);
        transform(i + 1, def.flowerInto);
        transform(i, def.flowerInto);
        return true;
    }
    return false;
}

// Only the pad that the stem itself came up under blooms, so a lily has one
// flower in the middle of it rather than one at each end. The stem is looked
// for across the three cells underneath, because a netted stem leans as it
// climbs and rarely finishes exactly under its own tip.
function standsOnItsOwnStem(x, y) {
    for (let dx = -1; dx <= 1; dx++) {
        const below = typeAt(x + dx, y + 1);
        if (below <= 0) continue;
        if (DEFS[below].growStyle === 'netting') return true;
    }
    return false;
}

// Is this a spot a pad can sit in - open air directly overhead, nothing already
// in the way, and either water or the lily's own netting directly underneath.
// The netting counts because a stem that leaned as it climbed can easily finish
// up under the cell next to the one it came out of, and a pad ought to be able
// to spread straight over the top of it.
function floatsOnSurface(x, y) {
    const here = typeAt(x, y);
    if (here !== EMPTY && here !== idOf('Water')) return false;
    if (typeAt(x, y - 1) !== EMPTY) return false;

    const below = typeAt(x, y + 1);
    if (below === idOf('Water')) return true;
    return below > 0 && DEFS[below].growStyle === 'netting';
}

// Is there any water within reach? The search reaches much further down than it
// does up or sideways, because the flower doing the asking is sitting on top of
// a stem and the water it lives on is down at the roots.
//
// Only ever called on the rare frame a plant is about to set seed, so the
// little search here costs nothing worth worrying about.
function waterWithin(x, y, range) {
    const water = idOf('Water');
    const fromY = Math.max(0, y - range);
    const toY = Math.min(ROWS - 1, y + range * 4);
    const fromX = Math.max(0, x - range);
    const toX = Math.min(COLS - 1, x + range);

    for (let ny = fromY; ny <= toY; ny++) {
        const row = ny * COLS;
        for (let nx = fromX; nx <= toX; nx++) {
            if (world.type[row + nx] === water) return true;
        }
    }
    return false;
}

// A grain of gunpowder going off. Each grain only clears a small patch, but it
// lights every other grain it touches on the very next frame, so a trail or a
// pile tears through itself in a flash and the combined blast is as big as the
// heap was. Everything inside is cleared out apart from walls, the hole is
// dressed with fire and sparks, and what is left is left hot enough to set
// light to nearby wood.
function explode(x, y, def) {
    const radius = def.blastRadius;
    const furthest = radius * radius;
    const fire = idOf('Fire');
    const spark = idOf('Spark');

    // The grain that is going off has to be cleared first. If it is left in
    // place the loop below finds it, treats it as more gunpowder to light, and
    // it re-lights itself over and over.
    const source = y * COLS + x;
    removeParticle(source);

    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            const distance = dx * dx + dy * dy;
            if (distance > furthest) continue;

            const nx = x + dx;
            const ny = y + dy;
            if (!inBounds(nx, ny)) continue;

            const ni = ny * COLS + nx;
            const id = world.type[ni];
            if (id !== EMPTY && DEFS[id].blastProof) continue;

            // More gunpowder: light it rather than destroying it. One frame of
            // delay is what turns a heap into a racing flash instead of one
            // instant bang.
            if (id !== EMPTY && DEFS[id].blastRadius > 0) {
                if (world.data[ni] === 0) world.data[ni] = 1 + Math.floor(random() * 2);
                continue;
            }

            world.type[ni] = EMPTY;
            world.life[ni] = 0;
            world.lifeMax[ni] = 0;
            world.residue[ni] = EMPTY;
            clearSprinklerLaunchState(ni);
            world.data[ni] = 0;
            world.heat[ni] = 0;
            world.power[ni] = 0;
            world.powerDelay[ni] = 0;
            world.charge[ni] = 0;
            world.temp[ni] = Math.max(world.temp[ni], 650);

            const onTheEdge = distance > furthest * 0.4;
            if (onTheEdge && random() < 0.55) transform(ni, spark);
            else if (random() < 0.3) transform(ni, fire);
        }
    }
}

// Small name lookup cache so reactions can refer to particles by name without
// paying for a string search every time.
const nameCache = {};
function idOf(name) {
    if (nameCache[name] === undefined) {
        nameCache[name] = 0;
        for (let i = 1; i < DEFS.length; i++) {
            if (DEFS[i] && DEFS[i].name === name) { nameCache[name] = i; break; }
        }
    }
    return nameCache[name];
}

// ------------------------------------------------------------------- movement
//
// Two rules cover almost everything:
//   canSinkInto  - I am heavier than that, so I can push down through it
//   canRiseInto  - I am lighter than that, so I can push up through it
// Because both sides of a swap are checked by whichever particle gets its turn
// first, these two rules alone give sand sinking through water, ice floating up
// through water and bubbles of steam rising out of a pond.

// One powder never works its way down through another, wet or dry. Weighing
// them against each other is what had a poured heap slowly sort itself into
// neat bands - sand sinking under dry mud, dry mud under wet - which is not
// what loose ground does. Grains that land on top of other grains stay on top
// of them, and only fluids are pushed out of the way.
function powdersTogether(def, other) {
    return def.category === 'powder' && other.category === 'powder';
}

function canSinkInto(def, other) {
    if (other === OUT_OF_BOUNDS || other === STORAGE_VIRTUAL_WALL) return false;
    if (other === EMPTY) return true;
    if (!def.displacesMaterials) return false;
    const o = DEFS[other];
    if (o.category === 'static') return false;
    if (powdersTogether(def, o)) return false;
    return o.density < def.density;
}

function canRiseInto(def, other) {
    if (other === OUT_OF_BOUNDS || other === STORAGE_VIRTUAL_WALL) return false;
    if (other === EMPTY) return true;
    const o = DEFS[other];
    if (o.category === 'static') return false;
    if (powdersTogether(def, o)) return false;
    return o.density > def.density;
}

function isSolidBarrier(id) {
    return id === STORAGE_VIRTUAL_WALL || (id > 0 && DEFS[id]?.category === 'static');
}

let storageFunnelMachines = [];
let storageBarrierMask = null;
let collectorSealMask = null;
let collectorRimMask = null;
let collectorMasksDirty = true;

const COLLECTOR_LOCAL_ROTATION = [0, 180, -90, 90, -45, -135, 135, 45];

function rotateCollectorOffset(x, y, direction) {
    const angle = COLLECTOR_LOCAL_ROTATION[direction & 7] * Math.PI / 180;
    return {
        x: Math.round(x * Math.cos(angle) - y * Math.sin(angle)),
        y: Math.round(x * Math.sin(angle) + y * Math.cos(angle))
    };
}

function collectorFunnelGeometry(frontX, frontY) {
    const diagonal = frontX !== 0 && frontY !== 0;
    return {
        diagonal,
        barrierDepth: diagonal
            ? COLLECTOR_DIAGONAL_BARRIER_DEPTH
            : COLLECTOR_CARDINAL_BARRIER_DEPTH,
        halfWidth: diagonal
            ? COLLECTOR_DIAGONAL_HALF_WIDTH
            : COLLECTOR_CARDINAL_HALF_WIDTH,
        projectionScale: diagonal ? 2 : 1
    };
}

function collectorSegmentCells(x0, y0, x1, y1) {
    const cells = [];
    const seen = new Set();
    const add = (x, y) => {
        const key = `${x},${y}`;
        if (seen.has(key)) return;
        seen.add(key);
        cells.push({ x, y });
    };
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let ix = 0;
    let iy = 0;
    add(x, y);
    while (ix < dx || iy < dy) {
        const decision = (1 + 2 * ix) * dy - (1 + 2 * iy) * dx;
        if (decision === 0) {
            add(x + sx, y);
            add(x, y + sy);
            x += sx;
            y += sy;
            ix++;
            iy++;
        } else if (decision < 0) {
            x += sx;
            ix++;
        } else {
            y += sy;
            iy++;
        }
        add(x, y);
    }
    return cells;
}

function buildCollectorShellCells(x, y, frontX, frontY) {
    const cells = new Map();
    const tangentX = -frontY;
    const tangentY = frontX;
    const { halfWidth, barrierDepth } = collectorFunnelGeometry(frontX, frontY);
    const mouthX = x - frontX * barrierDepth;
    const mouthY = y - frontY * barrierDepth;
    const outputOffset = rotatedPortOffset(index(x, y), 3, 0);
    const outputX = x + Math.round(outputOffset.x);
    const outputY = y + Math.round(outputOffset.y);
    const add = (cellX, cellY, rim = false) => {
        if (!inBounds(cellX, cellY) || (cellX === outputX && cellY === outputY)) return;
        const key = `${cellX},${cellY}`;
        const prior = cells.get(key);
        cells.set(key, { x: cellX, y: cellY, i: index(cellX, cellY), rim: rim || !!prior?.rim });
    };

    // Each rim endpoint follows a sealed supercover rail down to one side of
    // the body. The middle of the mouth remains reserved for suction.
    for (const side of [-1, 1]) {
        const startX = mouthX + tangentX * halfWidth * side;
        const startY = mouthY + tangentY * halfWidth * side;
        const shoulderX = x + frontX * 2 + tangentX * 2 * side;
        const shoulderY = y + frontY * 2 + tangentY * 2 * side;
        const rail = collectorSegmentCells(startX, startY, shoulderX, shoulderY);
        for (const cell of rail) add(cell.x, cell.y, true);
        // A short shell around the body flanks closes the black-space gaps,
        // while remaining short of the outward Tubing anchor.
        const flankStartX = x + frontX + tangentX * side * 2;
        const flankStartY = y + frontY + tangentY * side * 2;
        const flankEndX = x + frontX * 2 + tangentX * side * 2;
        const flankEndY = y + frontY * 2 + tangentY * side * 2;
        for (const cell of collectorSegmentCells(flankStartX, flankStartY, flankEndX, flankEndY)) {
            add(cell.x, cell.y);
        }
    }
    const baseA = { x: x + frontX * 2 - tangentX * 2, y: y + frontY * 2 - tangentY * 2 };
    const baseB = { x: x + frontX * 2 + tangentX * 2, y: y + frontY * 2 + tangentY * 2 };
    for (const cell of collectorSegmentCells(baseA.x, baseA.y, baseB.x, baseB.y)) add(cell.x, cell.y);
    return [...cells.values()];
}

function ensureCollectorMasks() {
    if (collectorMasksDirty && world) refreshStorageFunnelMachines();
}

export function isCollectorRimCell(x, y) {
    if (!inBounds(x, y)) return false;
    ensureCollectorMasks();
    return !!collectorRimMask?.[index(x, y)];
}

function buildCollectorBarrierCells(x, y, frontX, frontY) {
    const { diagonal, barrierDepth: depthSteps, halfWidth: halfSteps } =
        collectorFunnelGeometry(frontX, frontY);
    const tangentX = -frontY;
    const tangentY = frontX;
    const centreX = x - frontX * depthSteps;
    const centreY = y - frontY * depthSteps;
    const cells = [];
    const seen = new Set();
    const add = (cellX, cellY) => {
        if (!inBounds(cellX, cellY)) return;
        const cell = index(cellX, cellY);
        if (seen.has(cell)) return;
        seen.add(cell);
        cells.push({ x: cellX, y: cellY, i: cell });
    };

    let previous = null;
    for (let offset = -halfSteps; offset <= halfSteps; offset++) {
        const cellX = centreX + tangentX * offset;
        const cellY = centreY + tangentY * offset;

        // A plain 45-degree row only touches at cell corners. Fan particles
        // also travel diagonally, so they could tunnel through those corners.
        // Adding the horizontal connector produces a one-cell staircase: a
        // continuous supercover line without turning the whole icon square
        // into a solid block.
        if (diagonal && previous) add(previous.x + tangentX, previous.y);
        add(cellX, cellY);
        previous = { x: cellX, y: cellY };
    }
    return cells;
}

function isStorageFunnelArea(x, y) {
    for (const funnel of storageFunnelMachines) {
        const relativeX = x - funnel.x;
        const relativeY = y - funnel.y;
        const depth = (relativeX * -funnel.frontX + relativeY * -funnel.frontY) /
            funnel.projectionScale;
        if (depth < 0) continue;
        const tangent = (relativeX * -funnel.frontY + relativeY * funnel.frontX) /
            funnel.projectionScale;
        // Keep collision corner checks aligned with the drawn funnel mouth:
        // seven cells deep and five half-width for cardinal fronts; diagonal
        // depth/width are measured in paired-axis steps so the 45-degree
        // projections match their per-axis raster geometry.
        const width = funnel.halfWidth + Math.max(0, depth - funnel.barrierDepth);
        if (Math.abs(tangent) <= width) return true;
    }
    return false;
}

// A fluid must not squeeze diagonally through the corner where two cells of a
// solid wall meet. Without this corner check, a staircase made from glass (the
// usual shape of a storage-bin funnel wing) has one-cell diagonal gaps that let
// liquid leak through even though the drawn wall is continuous.
function canSinkDiagonally(def, x, y, nx, ny) {
    if (!canSinkInto(def, typeAtForMovement(def, nx, ny))) return false;
    if (nx === x || ny === y) return true;
    if (!isStorageFunnelArea(x, y) && !isStorageFunnelArea(nx, ny)) return true;
    return !isSolidBarrier(typeAtForMovement(def, nx, y)) &&
        !isSolidBarrier(typeAtForMovement(def, x, ny));
}

function canRiseDiagonally(def, x, y, nx, ny) {
    if (typeAtForMovement(def, nx, ny) !== EMPTY) return false;
    if (nx === x || ny === y) return true;
    if (!isStorageFunnelArea(x, y) && !isStorageFunnelArea(nx, ny)) return true;
    return !isSolidBarrier(typeAtForMovement(def, nx, y)) &&
        !isSolidBarrier(typeAtForMovement(def, x, ny));
}

function randomSign() { return random() < 0.5 ? -1 : 1; }

function sprinklerGravityDisplacement(clockPosition, age) {
	let displacement = 0;
	for (let frame = 0; frame < age; frame++) {
		// Native gravity advances a cell per frame in this simulation. Summing
		// the ramped multiplier gives a deterministic fractional-cell fall rate;
		// deriving it from age means save/restore needs no extra movement credit.
		displacement += getSprinklerLaunchGravityMultiplier(clockPosition, frame);
	}
	return displacement;
}

function sprinklerLaunchOffset(clockPosition, age) {
    const profile = SPRINKLER_LAUNCH_PROFILES[clockPosition];
    if (!profile) return { x: 0, y: 0 };
    const horizontalMajor = Math.abs(profile.x) >= Math.abs(profile.y);
    const majorX = Math.sign(profile.x);
    const majorY = Math.sign(profile.y);
    const minorRatio = horizontalMajor
        ? Math.abs(profile.y / profile.x)
        : Math.abs(profile.x / profile.y);
    const x = horizontalMajor
        ? majorX * age
        : majorX * Math.floor(age * minorRatio + 1e-8);
    const y = horizontalMajor
        ? majorY * Math.floor(age * minorRatio + 1e-8)
        : majorY * age;
    return {
        x,
        y: y + Math.floor(sprinklerGravityDisplacement(clockPosition, age) + 1e-8)
    };
}

function canSprinklerLaunchEnter(def, x, y, nx, ny) {
    if (!inBounds(nx, ny)) return false;
    if (nx !== x && ny > y) return canSinkDiagonally(def, x, y, nx, ny);
    return canSinkInto(def, typeAtForMovement(def, nx, ny));
}

// Sprinkler output particles get a short, deterministic ballistic projection.
// Their clock-position tag and age travel with the particle in swapCells;
// colliding with an obstacle ends the launch and returns them to their native
// material movement on the same frame.
function moveSprinklerLaunchedParticle(x, y, i, def) {
    const clockPosition = world.sprinklerLaunchDirection[i];
    if (!clockPosition) return false;
    const age = world.sprinklerLaunchAge[i];
    if (!SPRINKLER_LAUNCH_PROFILES[clockPosition] || age >= SPRINKLER_LAUNCH_FRAMES) {
        clearSprinklerLaunchState(i);
        return false;
    }

    const start = sprinklerLaunchOffset(clockPosition, age);
    const finish = sprinklerLaunchOffset(clockPosition, age + 1);
    let remainingX = Math.abs(finish.x - start.x);
    let remainingY = Math.abs(finish.y - start.y);
    const stepX = Math.sign(finish.x - start.x);
    let cx = x;
    let cy = y;
    let current = i;
    let moved = false;

    while (remainingX > 0 || remainingY > 0) {
        const diagonal = remainingX > 0 && remainingY > 0;
        const nx = cx + (remainingX > 0 ? stepX : 0);
        const ny = cy + (remainingY > 0 ? 1 : 0);
        if (!canSprinklerLaunchEnter(def, cx, cy, nx, ny)) {
            clearSprinklerLaunchState(current);
            return moved;
        }
        const next = index(nx, ny);
        swapCells(current, next);
        current = next;
        cx = nx;
        cy = ny;
        moved = true;
        if (remainingX > 0) remainingX--;
        if (remainingY > 0) remainingY--;
        // The vertical and horizontal parts of an angle share a diagonal step
        // when both are due on the same frame.
        if (!diagonal && remainingY > 0 && remainingX === 0) continue;
    }

    world.sprinklerLaunchAge[current] = age + 1;
    if (age + 1 >= SPRINKLER_LAUNCH_FRAMES) clearSprinklerLaunchState(current);
    return moved;
}

// How often a floating seed shifts one cell along the surface. Low on purpose:
// it should wander to one side over a while, not scoot across the pond.
const FLOAT_DRIFT_CHANCE = 0.03;

// Powders: straight down, then diagonally down, and they push through any
// lighter fluid on the way.
function movePowder(x, y, i, def, sluggish) {
    // A buoyant one weighs less than water for as long as it is in the water,
    // so it uses its lighter twin for every weight comparison below. Nothing
    // else about it changes.
    const body = def.buoyant !== null && world.data[i] === 1 ? def.buoyant : def;

    if (body !== def) {
        // Found itself under water: up it comes. Only ever through a liquid,
        // never through another powder - partly because a floating seed has no
        // business burrowing up through a bank of sand, and partly because two
        // buoyant seeds resting on one another each look heavier than the other
        // one does and would swap places for ever without falling.
        const above = typeAtForMovement(body, x, y - 1);
        if (above > 0 && DEFS[above].category === 'liquid' && canRiseInto(body, above)) {
            swapCells(i, i - COLS);
            return;
        }
    }

    if (body.fallChance < 1 && random() > body.fallChance) return;

    let cy = y;
    let ci = i;

    for (let step = 0; step < body.fallSpeed; step++) {
        const below = typeAtForMovement(body, x, cy + 1);
        if (!canSinkInto(body, below)) break;
        const ni = ci + COLS;
        swapCells(ci, ni);
        ci = ni;
        cy++;
        // Sinking through a fluid is slow going, so only one cell of that per
        // frame. Falling through open air can use the full fall speed.
        if (below !== EMPTY) break;
    }

    if (cy !== y) return;
    // It fell as fast as it was ever going to; what is left is settling, and
    // that is what a low moveChance is meant to slow down.
    if (sluggish) return;

    if (body.slide > 0 && random() < body.slide) {
        const dir = randomSign();
        for (const d of [dir, -dir]) {
            if (!canSinkDiagonally(body, x, y, x + d, y + 1)) continue;
            if (!groundFallsAway(body, x + d, y)) continue;
            swapCells(i, i + COLS + d);
            return;
        }
    }

    if (body !== def) driftOnSurface(x, y, i, body);
}

// Anything floating on open water works its way to one side over time, the way
// anything adrift does, until it fetches up against a bank or something else in
// the water. It only ever steps to another spot on the same surface, so it
// cannot drift out over dry land.
function driftOnSurface(x, y, i, def) {
    if (random() > FLOAT_DRIFT_CHANCE) return;
    if (!isFloatingOn(x, y, def)) return;

    const dir = randomSign();
    for (const d of [dir, -dir]) {
        if (typeAtForMovement(def, x + d, y) !== EMPTY) continue;
        if (!isFloatingOn(x + d, y, def)) continue;
        swapCells(i, i + d);
        return;
    }
}

// Is this cell sitting directly on top of a liquid?
function isFloatingOn(x, y, def) {
    const below = typeAtForMovement(def, x, y + 1);
    if (below <= EMPTY) return false;
    return DEFS[below].category === 'liquid';
}

// How far down a body of liquid is still lively. Everything in the top
// FLOW_FREE_DEPTH cells flows as freely as it ever did, which is where a pond
// finds its level and where waves and ripples happen. Below that the chance of
// a cell shuffling sideways falls away, and by FLOW_STILL_DEPTH it has stopped
// altogether: the water down there is packed under the weight of everything
// above it and simply sits.
//
// The depths are generous enough that ordinary ponds behave exactly as they did
// before, and it is only genuinely deep water that goes quiet.
const FLOW_FREE_DEPTH = 8;
const FLOW_STILL_DEPTH = 18;

// Should this cell of liquid stay where it is this frame, rather than joining in
// with the flow? computeLiquidSurfaces has already worked out the top of the
// body of liquid each cell belongs to, so its depth costs one subtraction.
function settledByDepth(y, i) {
    const top = world.surface[i];
    if (top === NO_SURFACE) return false;

    const depth = y - top;
    if (depth <= FLOW_FREE_DEPTH) return false;
    if (depth >= FLOW_STILL_DEPTH) return true;

    // In between, it gets slower the deeper it is rather than stopping dead at
    // one particular row, so there is no visible line across the water where
    // the lively part ends.
    const settled = (depth - FLOW_FREE_DEPTH) / (FLOW_STILL_DEPTH - FLOW_FREE_DEPTH);
    return random() < settled;
}

// A deep liquid interior can sleep, but a cell on a free vertical face cannot:
// it is precisely the cell that must spill into the space beside it to erode a
// water cliff and let the body find its level.
function hasOpenSide(x, y, def) {
    return typeAtForMovement(def, x - 1, y) === EMPTY ||
        typeAtForMovement(def, x + 1, y) === EMPTY;
}

// How steep a slope a powder will sit on without slipping - its angle of
// repose. Dry sand needs only a single cell of drop beside it before it slides,
// so it always ends up as a flat cone. Wet mud needs the ground to fall right
// away before it will budge, so it stays in a heap. This is the difference
// between wet and dry that you can actually see.
function groundFallsAway(def, nx, y) {
    for (let n = 1; n <= def.repose; n++) {
        if (!canSinkInto(def, typeAtForMovement(def, nx, y + n))) return false;
    }
    return true;
}

// Liquids: down, then diagonally down, then sideways along the surface, and
// finally squeezed upwards by the weight of the liquid above them. The last two
// steps are what make water find its own level.
//
// The whole sequence is repeated flowSteps times per frame. One move per frame
// is what made water take an age to settle: a pool levels out by shuffling
// cells sideways one at a time, so letting each cell shuffle a few times per
// frame is what makes a poured blob spread out at a believable speed.
function moveLiquid(x, y, i, def, sluggish) {
    // Gravity gets one go per frame. Only the sideways flow repeats: falling
    // fallSpeed cells several times over would have water dropping the height
    // of the screen between frames, which is both wrong and too fast for
    // anything it passes through to react to it.
    const landed = fallDown(x, y, i, def);
    if (landed !== i) return;
    // Gravity has had its turn. Creeping sideways is the part a thick, sticky
    // liquid is slow at, so that is the part moveChance holds back.
    if (sluggish) return;

    // Deep water is packed down by everything lying on top of it and has
    // nowhere to go, so it lies still while the surface is still finding its
    // level. Gravity above has already had its turn, so a hole opened at the
    // bottom of a pond still fills; what stops is the endless sideways
    // shuffling that had the whole body of it churning at once.
    if (settledByDepth(y, i) && !hasOpenSide(x, y, def)) return;

    for (let step = 0; step < def.flowSteps; step++) {
        const before = i;
        i = takeOneFlowStep(x, y, i, def);
        if (i === before) return;

        const wasRow = y;
        x = i % COLS;
        y = (i - x) / COLS;

        // If that step was water being pushed upwards under pressure, stop
        // here. Carrying on would only have it fall straight back down again,
        // undoing the climb in the same frame.
        if (y < wasRow) return;
    }
}

// Straight down, up to fallSpeed cells. Returns where it ended up.
function fallDown(x, y, i, def) {
    let cy = y;
    let ci = i;

    for (let step = 0; step < def.fallSpeed; step++) {
        const below = typeAtForMovement(def, x, cy + 1);

        // Water landing on a flame puts it out there and then, instead of
        // dropping straight through it.
        if (def.douses && isFlame(below)) {
            transform(ci + COLS, idOf('Smoke'));
            world.temp[ci + COLS] = Math.min(world.temp[ci + COLS], 120);
            break;
        }

        if (!canSinkInto(def, below)) break;
        const ni = ci + COLS;
        swapCells(ci, ni);
        ci = ni;
        cy++;
        // Sinking through a fluid is slower going than falling through air.
        if (below !== EMPTY) break;
    }
    return ci;
}

// True when the wet powder immediately below a surface drop has no remaining
// capacity within the 50-cell infiltration limit. An opening beneath the wet
// material is still drainage, while dry powder is still capacity. Everything
// else is a supporting, impermeable base and therefore makes the wet column
// saturated even when it is shallower than the limit.
function saturatedPowderBelow(x, startY) {
    for (let depth = 0; depth < MAX_WATER_INFILTRATION_DEPTH; depth++) {
        const id = typeAt(x, startY + depth);
        if (id === EMPTY) return false;
        if (id === OUT_OF_BOUNDS) return depth > 0;

        const def = DEFS[id];
        if (def.waterPermeability > 0) continue;
        if (def.wetsInto !== EMPTY) return false;
        if (def.category === 'liquid' || def.category === 'gas') return false;
        return depth > 0;
    }
    return true;
}

// This cell is below the retained loose layer only when it has compactDepth
// identical wet-mud cells immediately above it and something non-fluid below
// supporting the column. Once the bottom cell becomes clay, it supports the
// next one on the following row of the same bottom-up simulation pass.
function canCompactColumn(x, y, def) {
    if (def.compactDepth <= 0 || y < def.compactDepth) return false;

    const below = typeAt(x, y + 1);
    if (below === def.id || below === EMPTY) return false;
    if (below !== OUT_OF_BOUNDS) {
        const support = DEFS[below];
        if (support.category === 'liquid' || support.category === 'gas') return false;
    }

    for (let depth = 1; depth <= def.compactDepth; depth++) {
        if (typeAt(x, y - depth) !== def.id) return false;
    }
    return true;
}

// ----------------------------------------------------------------- the wind
//
// Two things blow in here. The wind tool blows wherever it is dragged, and the
// ambient breeze - switched on from the toolbar - sends a soft gust across the
// whole world of its own accord every few seconds.
//
// All wind leaves a trail in world.wind: a per-cell number that fades away over
// the following frames and that game.js draws as a faint pale haze. Powered
// Fans also write real air momentum into airflowX/Y. That field is advected and
// decelerated after the cone ends, so a particle carried to the edge does not
// suddenly lose all sideways motion and fall straight down.

// How much of a wind trail is left after a frame.
const WIND_TRAIL_FADE = 0.86;

// A breeze is a gentle thing: it lifts dry powders, seeds, ash, snow and smoke,
// but anything at or below this lift - standing water, wet sand, wet mud, ice -
// is too heavy or too stuck together for it to shift. The wind tool, being a
// deliberate shove rather than a draught, is not held to this.
const BREEZE_MIN_LIFT = 0.15;

// Wind stops dead at anything solid. Where it meets wall, stone, glass or wood
// it goes no further along that line: the rest of the row behind the obstacle
// is still air, and the wind gets past only by way of the rows above and below
// it. That is what makes a drawn box genuinely windproof, and what puts a long
// calm streak in the lee of a wall rather than a small pocket.

// Loose material stops it too, only not straight away. How many cells of buried
// powder or liquid the wind works its way into before it is turned aside.
//
// Only buried cells count - ones with something sitting on top of them. The
// exposed surface of a drift or a pool is always in the wind, which is what
// lets a gust drive a thin sheet of sand along the ground for as long as it
// likes. Get in under that surface, though, and the wind is into the body of
// the pile: it works the first few layers and the rest of the line beyond them
// is sheltered exactly as it would be behind glass. Without this a gust blows
// clean through a bank of sand and stirs whatever is sitting on the far side.
const WIND_PENETRATION = 3;

// Air that has been through something it could shift does not carry straight
// on: it is turned upwards by whatever it went through, and it keeps that kick
// for this many cells before it levels out again. That is what makes a gust
// curl over a drift rather than tunnel along it.
const WIND_DEFLECT_RUN = 10;

// Scratch space for the wind tool's local obstruction and lift maps. The
// ambient system uses its world-sized cached shelter mask below.
let gustShelter = null;
let gustLift = null;

// Non-zero while there is any trail left to fade, so that the fade pass can be
// skipped entirely on the many frames where nothing is blowing.
let windTrailsAlive = 0;

export function getWindTrails() { return world ? world.wind : null; }

function markWind(i, amount, dirX = 0, dirY = 0) {
    if (amount <= 0) return;
    const v = world.wind[i] + amount;
    world.wind[i] = v > 255 ? 255 : v;
    const directionLength = Math.hypot(dirX, dirY);
    if (directionLength > 0) {
        // Reuse the trail's local intensity as a relative display speed. The
        // values are separate from all forces applied to particles and heat.
        const sampleStrength = Math.max(0.2, Math.min(8, amount / 4));
        let vx = world.displayWindX[i] + (dirX / directionLength) * sampleStrength;
        let vy = world.displayWindY[i] + (dirY / directionLength) * sampleStrength;
        const magnitude = Math.hypot(vx, vy);
        if (magnitude > 12) {
            vx *= 12 / magnitude;
            vy *= 12 / magnitude;
        }
        world.displayWindX[i] = vx;
        world.displayWindY[i] = vy;
    }
    windTrailsAlive = 1;
}

// Called every frame from the game loop, whether or not the simulation is
// running, so a gust blown while paused still fades instead of hanging there.
export function decayWindTrails() {
    if (!world || windTrailsAlive === 0) return;
    const wind = world.wind;
    let alive = 0;
    for (let i = 0; i < wind.length; i++) {
        let vx = world.displayWindX[i] * WIND_TRAIL_FADE;
        let vy = world.displayWindY[i] * WIND_TRAIL_FADE;
        if (Math.hypot(vx, vy) < 0.015) { vx = 0; vy = 0; }
        world.displayWindX[i] = vx;
        world.displayWindY[i] = vy;

        const v = wind[i];
        if (v > 0) {
            const next = v * WIND_TRAIL_FADE - 1;
            wind[i] = next <= 0 ? 0 : next;
        }
        if (wind[i] > 0 || vx !== 0 || vy !== 0) alive++;
    }
    windTrailsAlive = alive;
}

// A stable number between 0 and 1 for a given line across the flow, used to
// break the haze into streaks rather than painting it on as a flat wash. The
// seed shifts slowly so the streaks drift instead of standing still.
function windStreak(line, seed) {
    let h = Math.imul(line + 1, 374761393) + Math.imul(seed + 1, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Does this cell stop the wind? Wall, stone, glass and wood do; plants do not,
// because wind goes through a plant rather than round it, and nor does anything
// loose, which gets carried along instead of sheltering what is behind it.
function stopsWind(id) {
    return id > 0 && DEFS[id].blocksWind;
}

// Does this cell hold the wind up without stopping it outright? Powders and
// liquids do: the wind gets into the first few cells of a pile or a pool and is
// turned aside by the rest of it. Gases and plants do not - the wind goes
// straight through those - and a lone grain in mid-air is no obstruction
// either, since the count is only kept up while the material is continuous.
function slowsWind(id) {
    if (id === EMPTY) return false;
    const category = DEFS[id].category;
    return category === 'powder' || category === 'liquid';
}

// Is this cell buried - does it have something resting on top of it? Smoke and
// steam do not count as cover; they are blown away themselves. A cell open to
// the air is part of the surface of a pile, and the wind works the surface no
// matter how wide the pile is.
function isBuried(i, y) {
    if (y === 0) return false;
    const above = world.type[i - COLS];
    return above !== EMPTY && DEFS[above].category !== 'gas';
}

// Can the wind shove something of this definition into the cell holding
// `target`? Air always gives way, anything solid never does, and a fluid or a
// powder only gives way to something heavier than it is.
function windCanEnter(def, target) {
    if (target === EMPTY) return true;
    if (target === OUT_OF_BOUNDS || target === STORAGE_VIRTUAL_WALL) return false;
    const blocking = DEFS[target];
    if (blocking.category === 'static') return false;
    return blocking.density < def.density;
}

const FAN_WIND_STRENGTH = 7;
const FAN_WIND_RANGE = 28;
// This is the legacy physical reference strength. New Fan settings are mapped
// to this scale before calculating the trail, airflow, and particle forces.
const FAN_REFERENCE_STRENGTH = 8;
const FAN_AIR_DECAY = 0.84;
const FAN_AIR_ADVECT = 0.76;
const FAN_AIR_STAY = 1 - FAN_AIR_ADVECT;
const FAN_AIR_PUSH_THRESHOLD = 0.12;

function decayAndAdvectFanAir() {
    const currentX = world.airflowX;
    const currentY = world.airflowY;
    const nextX = world.airflowNextX;
    const nextY = world.airflowNextY;
    nextX.fill(0);
    nextY.fill(0);

    for (let i = 0; i < currentX.length; i++) {
        const vx = currentX[i];
        const vy = currentY[i];
        if (Math.abs(vx) + Math.abs(vy) < 0.01) continue;

        const x = i % COLS;
        const y = Math.floor(i / COLS);
        const dirX = Math.sign(vx);
        const dirY = Math.sign(vy);
        const nx = x + dirX;
        const ny = y + dirY;
        const decayedX = vx * FAN_AIR_DECAY;
        const decayedY = vy * FAN_AIR_DECAY;

        nextX[i] += decayedX * FAN_AIR_STAY;
        nextY[i] += decayedY * FAN_AIR_STAY;
        if (inBounds(nx, ny) && !stopsWind(world.type[ny * COLS + nx]) &&
            !storageIntakeIsWall(nx, ny)) {
            const ni = ny * COLS + nx;
            nextX[ni] += decayedX * FAN_AIR_ADVECT;
            nextY[ni] += decayedY * FAN_AIR_ADVECT;
        }
    }

    world.airflowX = nextX;
    world.airflowY = nextY;
    world.airflowNextX = currentX;
    world.airflowNextY = currentY;

    for (let i = 0; i < nextX.length; i++) {
        const amount = Math.abs(nextX[i]) + Math.abs(nextY[i]);
        if (amount > FAN_AIR_PUSH_THRESHOLD * 0.25) {
            markWind(i, Math.min(38, amount * 18));
        }
    }
}

function addFanAirflow(i, dirX, dirY, amount) {
    world.airflowX[i] += dirX * amount;
    world.airflowY[i] += dirY * amount;
}

function fanDirectionVector(direction) {
    switch (direction & 7) {
        case 1: return [-1, 0]; // left
        case 2: return [0, -1]; // up
        case 3: return [0, 1];  // down
        case 4: return [1, -1]; // up-right
        case 5: return [-1, -1]; // up-left
        case 6: return [-1, 1]; // down-left
        case 7: return [1, 1]; // down-right
        default: return [1, 0]; // right
    }
}

function moveProjectile(x, y, i, def) {
    const [dirX, dirY] = fanDirectionVector(world.data[i]);
    let nx = x;
    let ny = y;
    for (let step = 0; step < def.projectileSpeed; step++) {
        nx += dirX;
        ny += dirY;
        if (!inBounds(nx, ny)) {
            removeParticle(i);
            return;
        }
        if (world.type[index(nx, ny)] !== EMPTY) {
            // A ray heats or chills the occupied cell from its current spot;
            // leave it in place until it expires rather than replacing matter.
            world.moved[i] = 1;
            return;
        }
    }
    swapCells(i, index(nx, ny));
}

function machineIsPowered(x, y, i) {
    if (world.power[i] > 0 || world.powerDelay[i] > 0) return true;

    // Broad power-port targets can include copper cells that sit just outside
    // the ordinary two-cell wire reach. A live pulse on any declared copper
    // contact powers the machine through that port, while bare copper still
    // cannot activate it.
    const poweredCopperPort = machinePortDescriptors(i).some(port =>
        port.family === 'copper' && [port.connectionCell, ...legacyPortCells(i, port)]
            .some(cell => {
                if (!inBounds(cell.x, cell.y)) return false;
                const contact = index(cell.x, cell.y);
                const def = DEFS[world.type[contact]];
                return def?.name === 'Copper' &&
                    (world.power[contact] > 0 || world.powerDelay[contact] > 0);
            }));
    if (poweredCopperPort) return true;

    const poweredElectricalPort = machinePortDescriptors(i).some(port =>
        port.family === 'electrical' && port.role === 'input' &&
        electricalPortWireCells(port).some(wire => world.power[wire] > 0 || world.powerDelay[wire] > 0));
    if (poweredElectricalPort) return true;

    // A live Spark or a Spark source touching a machine is enough to start it.
    // The source check is deliberate: a source does not need an empty cell on
    // the machine-facing side in order to energize a machine it is touching.
    const spark = idOf('Spark');
    for (const [dx, dy] of ELECTRICAL_NEIGHBOURS) {
        const neighbour = typeAt(x + dx, y + dy);
        if (neighbour === spark || DEFS[neighbour]?.sparkEmitterChance > 0) return true;
    }
    return false;
}

// Storage bins are tubing-fed. World collection belongs to the rotating
// Collector, which keeps the established one-material suction behavior.
function updateStorageBins() {
    for (const funnel of storageFunnelMachines) {
        const i = funnel.i;
        if (!isCollectorMachine(DEFS[world.type[i]])) continue;
        for (const barrier of funnel.barrierCells) {
            if (world.storageCount[i] >= COLLECTOR_CAPACITY) break;
            for (let depth = 1; depth <= STORAGE_SUCTION_DEPTH; depth++) {
                const sourceX = barrier.x - funnel.frontX * depth;
                const sourceY = barrier.y - funnel.frontY * depth;
                if (!inBounds(sourceX, sourceY)) break;
                const source = index(sourceX, sourceY);
                const particle = DEFS[world.type[source]];
                if (!particle) continue;
                if (!collectorAccepts(particle) ||
                    (world.storageType[i] !== EMPTY && world.storageType[i] !== particle.id) ||
                    world.storageCount[i] >= COLLECTOR_CAPACITY) break;
                world.storageType[i] = particle.id;
                world.storageCount[i]++;
                removeParticle(source);
            }
        }
    }
}

// Tubing is deliberately a four-way physical network: pieces have to share a
// cell edge, rather than merely touching at a corner. That makes a painted
// three-cell-wide tube a three-cell-wide channel and stops diagonal near-misses
// from becoming invisible pipe connections.
let tubingFlows = [];
let hasMixerMachine = false;

export function getTubingFlows() {
    return tubingFlows;
}

function buildTubingComponents() {
    const visited = new Uint8Array(world.type.length);
    const components = [];
    // A route attaches only where a connector physically occupies the stable
    // logical anchor. Broad pointer targets and visible port markers are UI
    // affordances; neither creates a tubing connection by proximity.
    const portForTubeCell = new Map();
    for (let machine = 0; machine < world.type.length; machine++) {
        if (!isTubingEndpoint(DEFS[world.type[machine]])) continue;
        for (const port of machinePortDescriptors(machine)) {
                if (!portAcceptsMaterial(port, DEFS.findIndex(def => !!def?.tubing))) continue;
            const attach = cell => {
                const tubeCell = index(cell.x, cell.y);
                let matches = portForTubeCell.get(tubeCell);
                if (!matches) portForTubeCell.set(tubeCell, matches = []);
                if (!matches.some(match => match.machine === machine && match.port.id === port.id)) {
                    matches.push({ machine, port });
                }
            };
            attach(port.connectionCell);
            for (const cell of legacyPortCells(machine, port)) attach(cell);
        }
    }

    for (let start = 0; start < world.type.length; start++) {
        if (visited[start] || !DEFS[world.type[start]]?.tubing) continue;

        const cells = [start];
        const cellSet = new Set([start]);
        visited[start] = 1;
        for (let head = 0; head < cells.length; head++) {
            const i = cells[head];
            const x = i % COLS;
            const y = Math.floor(i / COLS);
            for (const [dx, dy] of TUBING_NEIGHBOURS) {
                const nx = x + dx;
                const ny = y + dy;
                if (!inBounds(nx, ny)) continue;
                const ni = index(nx, ny);
                if (visited[ni] || !DEFS[world.type[ni]]?.tubing) continue;
                visited[ni] = 1;
                cellSet.add(ni);
                cells.push(ni);
            }
        }

        const attachments = new Map();
        const portAttachments = new Map();
        for (const tube of cells) {
            for (const match of portForTubeCell.get(tube) || []) {
                const machineContacts = attachments.get(match.machine);
                if (machineContacts) machineContacts.push(tube);
                else attachments.set(match.machine, [tube]);
                let ports = portAttachments.get(match.machine);
                if (!ports) portAttachments.set(match.machine, ports = new Map());
                let connection = ports.get(match.port.id);
                if (!connection) ports.set(match.port.id, connection = { port: match.port, contacts: [] });
                connection.contacts.push(tube);
            }
        }
        if (attachments.size >= 2) components.push({ cells, cellSet, attachments, portAttachments });
    }
    return components;
}

function shortestTubingPath(cellSet, sourceContacts, destinationContacts) {
    const goals = new Set(destinationContacts);
    const queue = [];
    const parents = new Map();
    for (const contact of sourceContacts) {
        if (parents.has(contact)) continue;
        parents.set(contact, -1);
        queue.push(contact);
    }

    let end = -1;
    for (let head = 0; head < queue.length; head++) {
        const i = queue[head];
        if (goals.has(i)) {
            end = i;
            break;
        }
        const x = i % COLS;
        const y = Math.floor(i / COLS);
        for (const [dx, dy] of TUBING_NEIGHBOURS) {
            const nx = x + dx;
            const ny = y + dy;
            if (!inBounds(nx, ny)) continue;
            const ni = index(nx, ny);
            if (!cellSet.has(ni) || parents.has(ni)) continue;
            parents.set(ni, i);
            queue.push(ni);
        }
    }
    if (end < 0) return null;

    const path = [];
    for (let current = end; current >= 0; current = parents.get(current)) path.push(current);
    path.reverse();
    return path;
}

function componentPortConnection(component, machine, role) {
    const ports = component.portAttachments?.get(machine);
    if (!ports) return null;
    for (const connection of ports.values()) {
        if (connection.port.role === role) return connection;
    }
    return null;
}

function tubingRunWidth(cellSet, x, y, stepX, stepY) {
    let width = 1;
    for (const direction of [-1, 1]) {
        let nx = x + stepX * direction;
        let ny = y + stepY * direction;
        while (inBounds(nx, ny) && cellSet.has(index(nx, ny))) {
            width++;
            nx += stepX * direction;
            ny += stepY * direction;
        }
    }
    return width;
}

function tubingPathAxes(path, position, source, destination) {
    const cell = path[position];
    const x = cell % COLS;
    const y = Math.floor(cell / COLS);
    let horizontal = false;
    let vertical = false;
    for (const neighbour of [path[position - 1], path[position + 1]]) {
        if (neighbour === undefined) continue;
        if ((neighbour % COLS) !== x) horizontal = true;
        if (Math.floor(neighbour / COLS) !== y) vertical = true;
    }
    // A one-cell route can join machines directly. Use their relative
    // positions to retain the width of a short, thick connector.
    if (!horizontal && !vertical) {
        horizontal = (source % COLS) !== (destination % COLS);
        vertical = Math.floor(source / COLS) !== Math.floor(destination / COLS);
    }
    return { horizontal, vertical };
}

// Measure the painted width perpendicular to the route at every point. A
// three-cell brush stroke therefore carries 30/s, while a two-cell pinch in
// the middle limits the complete connection to 20/s.
function tubingPathCapacity(path, cellSet, source, destination) {
    let narrowest = Infinity;
    for (let position = 0; position < path.length; position++) {
        const cell = path[position];
        const x = cell % COLS;
        const y = Math.floor(cell / COLS);
        const { horizontal, vertical } = tubingPathAxes(path, position, source, destination);
        const horizontalWidth = horizontal ? tubingRunWidth(cellSet, x, y, 0, 1) : Infinity;
        const verticalWidth = vertical ? tubingRunWidth(cellSet, x, y, 1, 0) : Infinity;
        narrowest = Math.min(narrowest, horizontalWidth, verticalWidth);
    }
    return Number.isFinite(narrowest) ? Math.max(1, narrowest) : 1;
}

function destinationCanAccept(destination, material, port = null) {
    const def = DEFS[world.type[destination]];
    if (isStorageMachine(def)) {
        return (!port || port.role === 'input') && storageAccepts(def, DEFS[material]) &&
            world.storageCount[destination] < (def.storageCapacity || STORAGE_CAPACITY) &&
            (world.storageType[destination] === EMPTY || world.storageType[destination] === material);
    }
    if (isSprinklerMachine(def)) {
        if (port && port.id !== 'tubing-in') return false;
        const releaseEnabled = sprinklerReleaseSetting(destination);
        return (world.storageCount[destination] < SPRINKLER_CAPACITY || releaseEnabled) &&
            (world.storageType[destination] === EMPTY || world.storageType[destination] === material);
    }
    if (isMixerMachine(def)) {
        if (port?.id === 'input-a') return mixerInputCanAccept(destination, 0, material);
        if (port?.id === 'input-b') return mixerInputCanAccept(destination, 1, material);
        return !port && (mixerInputCanAccept(destination, 0, material) ||
            mixerInputCanAccept(destination, 1, material));
    }
    if (isSplitterMachine(def)) {
        if (port && port.id !== 'input') return false;
        const particle = DEFS[material];
        const supported = particle && (particle.category === 'powder' || particle.category === 'liquid' ||
            (particle.category === 'gas' && particle.emit <= 0));
        return !!supported && world.storageCount[destination] < STORAGE_CAPACITY &&
            (world.storageType[destination] === EMPTY || world.storageType[destination] === material);
    }
    return false;
}

function destinationSpace(destination) {
    const def = DEFS[world.type[destination]];
    const capacity = isStorageMachine(def) ? (def.storageCapacity || STORAGE_CAPACITY)
        : isCollectorMachine(def) ? COLLECTOR_CAPACITY
            : isSplitterMachine(def) ? STORAGE_CAPACITY : SPRINKLER_CAPACITY;
    return Math.max(0, capacity - world.storageCount[destination]);
}

function receiveTubingMaterial(destination, material) {
    world.storageType[destination] = material;
    world.storageCount[destination]++;
}

function mixerSlotState(machine, slot) {
    return slot === 0
        ? { type: world.mixerInputTypeA, count: world.mixerInputCountA, flow: world.mixerInputFlowA }
        : { type: world.mixerInputTypeB, count: world.mixerInputCountB, flow: world.mixerInputFlowB };
}

function mixerInputCanAccept(machine, slot, material) {
    const state = mixerSlotState(machine, slot);
    return state.count[machine] < MIXER_INPUT_CAPACITY &&
        (state.type[machine] === EMPTY || state.type[machine] === material);
}

function receiveMixerMaterial(machine, slot, material) {
    const state = mixerSlotState(machine, slot);
    state.type[machine] = material;
    state.count[machine]++;
}

function mixerOutputTotal(i) {
    return world.mixerOutputCountA[i] + world.mixerOutputCountB[i];
}

function receiveMixerOutput(i, slot) {
    if (slot === 0) world.mixerOutputCountA[i]++;
    else world.mixerOutputCountB[i]++;
}

function mixerOutputSlotForMaterial(i, material, mixed = false) {
    if (world.mixerOutputCountA[i] > 0 && world.mixerOutputTypeA[i] === material &&
        world.mixerOutputMixed[i] === (mixed ? 1 : 0)) return 0;
    if (world.mixerOutputCountB[i] > 0 && world.mixerOutputTypeB[i] === material &&
        world.mixerOutputMixed[i] === 0) return 1;
    if (world.mixerOutputCountA[i] === 0) return 0;
    if (world.mixerOutputCountB[i] === 0) return 1;
    return -1;
}

function addMixerOutput(i, material, mixed = false) {
    const slot = mixerOutputSlotForMaterial(i, material, mixed);
    if (slot < 0 || mixerOutputTotal(i) >= MIXER_OUTPUT_CAPACITY) return false;
    if (slot === 0) {
        world.mixerOutputTypeA[i] = material;
        world.mixerOutputMixed[i] = mixed ? 1 : 0;
    } else {
        world.mixerOutputTypeB[i] = material;
        world.mixerOutputMixed[i] = 0;
    }
    receiveMixerOutput(i, slot);
    if (world.mixerOutputCountB[i] > 0) world.mixerOutputMixed[i] = 0;
    return true;
}

function consumeMixerOutputMaterial(i, material) {
    if (world.mixerOutputCountA[i] > 0 && world.mixerOutputTypeA[i] === material &&
        world.mixerOutputMixed[i] === 0) {
        world.mixerOutputCountA[i]--;
        return true;
    }
    if (world.mixerOutputCountB[i] > 0 && world.mixerOutputTypeB[i] === material) {
        world.mixerOutputCountB[i]--;
        return true;
    }
    return false;
}

function mixerMixResult(first, second) {
    if (first === EMPTY || second === EMPTY) return EMPTY;
    const water = DEFS.findIndex(def => def?.name === 'Water');
    if (first === water) return DEFS[second]?.wetsInto || EMPTY;
    if (second === water) return DEFS[first]?.wetsInto || EMPTY;
    return EMPTY;
}

function normalizeMixerOutputs(i) {
    const typeA = world.mixerOutputTypeA[i];
    const typeB = world.mixerOutputTypeB[i];
    if (world.mixerOutputCountA[i] > 0 && world.mixerOutputCountB[i] > 0 &&
        typeA !== EMPTY && typeA === typeB) {
        world.mixerOutputCountA[i] += world.mixerOutputCountB[i];
        world.mixerOutputCountB[i] = 0;
        world.mixerOutputTypeB[i] = EMPTY;
        return;
    }
    const mixed = mixerMixResult(typeA, typeB);
    if (mixed === EMPTY || world.mixerOutputCountA[i] === 0 || world.mixerOutputCountB[i] === 0) {
        return;
    }

    const pairs = Math.min(world.mixerOutputCountA[i], world.mixerOutputCountB[i]);
    const remainderA = world.mixerOutputCountA[i] - pairs;
    const remainderB = world.mixerOutputCountB[i] - pairs;
    const remainderType = remainderA > 0 ? typeA : typeB;
    const remainderCount = Math.max(remainderA, remainderB);
    world.mixerOutputTypeA[i] = mixed;
    world.mixerOutputCountA[i] = pairs;
    world.mixerOutputMixed[i] = remainderCount === 0 ? 1 : 0;
    world.mixerOutputTypeB[i] = remainderCount > 0 ? remainderType : EMPTY;
    world.mixerOutputCountB[i] = remainderCount;
}

function mixerCanProduceMixed(i, result) {
    if (mixerOutputTotal(i) >= MIXER_OUTPUT_CAPACITY) return false;
    if (world.mixerOutputCountA[i] === 0) return true;
    return world.mixerOutputCountB[i] === 0 &&
        world.mixerOutputMixed[i] !== 0 && world.mixerOutputTypeA[i] === result;
}

function mixerProduceMixed(i, result) {
    if (!mixerCanProduceMixed(i, result)) return false;
    return addMixerOutput(i, result, true);
}

function mixerFeedOneInput(i, slot) {
    const type = slot === 0 ? world.mixerInputTypeA[i] : world.mixerInputTypeB[i];
    // A mixed result owns the output stream until it is drained. Do not append
    // an unmatched source material beside it; keep that material in its input
    // bin so the output remains one full-width mixed stream.
    if (world.mixerOutputMixed[i] !== 0) return false;
    const otherOutputType = world.mixerOutputCountA[i] > 0 && world.mixerOutputMixed[i] === 0
        ? world.mixerOutputTypeA[i]
        : world.mixerOutputCountB[i] > 0 ? world.mixerOutputTypeB[i] : EMPTY;
    const result = mixerMixResult(type, otherOutputType);

    if (result !== EMPTY && consumeMixerOutputMaterial(i, otherOutputType) &&
        mixerCanProduceMixed(i, result) && mixerProduceMixed(i, result)) {
        if (slot === 0) world.mixerInputCountA[i]--;
        else world.mixerInputCountB[i]--;
        return true;
    }
    if (!addMixerOutput(i, type, false)) return false;
    if (slot === 0) world.mixerInputCountA[i]--;
    else world.mixerInputCountB[i]--;
    return true;
}

function updateMixers() {
    if (!hasMixerMachine) return;
    for (let i = 0; i < world.type.length; i++) {
        if (!isMixerMachine(DEFS[world.type[i]])) continue;
        normalizeMixerOutputs(i);
        world.mixerInputFlowA[i] = Math.min(1, world.mixerInputFlowA[i] +
            MIXER_INPUT_RATE / SIMULATION_STEPS_PER_SECOND);
        world.mixerInputFlowB[i] = Math.min(1, world.mixerInputFlowB[i] +
            MIXER_INPUT_RATE / SIMULATION_STEPS_PER_SECOND);
        const readyA = world.mixerInputFlowA[i] >= 1 && world.mixerInputCountA[i] > 0;
        const readyB = world.mixerInputFlowB[i] >= 1 && world.mixerInputCountB[i] > 0;
        if (readyA && readyB) {
            const mixed = mixerMixResult(world.mixerInputTypeA[i], world.mixerInputTypeB[i]);
            if (mixed !== EMPTY && mixerCanProduceMixed(i, mixed) && mixerProduceMixed(i, mixed)) {
                world.mixerInputCountA[i]--;
                world.mixerInputCountB[i]--;
                world.mixerInputFlowA[i]--;
                world.mixerInputFlowB[i]--;
            } else {
                if (readyA && mixerFeedOneInput(i, 0)) world.mixerInputFlowA[i]--;
                if (readyB && mixerFeedOneInput(i, 1)) world.mixerInputFlowB[i]--;
            }
        } else {
            if (readyA && mixerFeedOneInput(i, 0)) world.mixerInputFlowA[i]--;
            if (readyB && mixerFeedOneInput(i, 1)) world.mixerInputFlowB[i]--;
        }
        resetEmptyMixer(i);
        if (!isMixerReleaseEnabled(i % COLS, Math.floor(i / COLS))) continue;
        world.mixerOutputFlow[i] = Math.min(1,
            world.mixerOutputFlow[i] + MIXER_RELEASE_RATE / SIMULATION_STEPS_PER_SECOND);
        if (world.mixerOutputFlow[i] < 1 || mixerOutputTotal(i) === 0) continue;
        // The Mixer face is twice the normal machine size. Its lower-center
        // outlet therefore starts two grid cells below the anchor cell.
        const outputY = Math.floor(i / COLS) + 2;
        const x = i % COLS;
        if (!inBounds(x, outputY) || storageIntakeIsWall(x, outputY)) continue;
        const output = index(x, outputY);
        if (world.type[output] !== EMPTY) continue;
        const countA = world.mixerOutputCountA[i];
        const countB = world.mixerOutputCountB[i];
        const preferredOutput = world.mixerOutputNext[i] & 1;
        const outputSlot = preferredOutput === 0
            ? (countA > 0 ? 0 : (countB > 0 ? 1 : -1))
            : (countB > 0 ? 1 : (countA > 0 ? 0 : -1));
        if (outputSlot < 0) continue;
        const outputMaterial = outputSlot === 0 ? world.mixerOutputTypeA[i] : world.mixerOutputTypeB[i];
        if (outputSlot === 0) world.mixerOutputCountA[i]--;
        else world.mixerOutputCountB[i]--;
        setCell(x, outputY, outputMaterial);
        world.mixerOutputFlow[i] -= 1;
        world.mixerOutputNext[i] = outputSlot ^ 1;
        resetEmptyMixer(i);
    }
}

function updateTubingFlows() {
    tubingFlows = [];
    const sourceMachines = [];
    const components = buildTubingComponents();
    const hasSourceInventory = machine =>
        (isStorageMachine(DEFS[world.type[machine]]) || isSplitterMachine(DEFS[world.type[machine]]) ||
            isCollectorMachine(DEFS[world.type[machine]])) && world.storageCount[machine] > 0;
    const sourceMaterial = machine => world.storageType[machine];
    const sourceCount = machine => world.storageCount[machine];
    for (let i = 0; i < world.type.length; i++) if (hasSourceInventory(i)) sourceMachines.push(i);

    const routes = [];
    for (const component of components) {
        if (component.attachments.size !== 2) continue;
        const endpoints = [...component.attachments.keys()];
        let route = null;
        for (const source of endpoints) {
            const destination = endpoints[0] === source ? endpoints[1] : endpoints[0];
            const sourcePort = componentPortConnection(component, source, 'output');
            const destinationPort = componentPortConnection(component, destination, 'input');
            if (sourcePort && destinationPort) {
                route = { component, source, destination, sourcePort, destinationPort };
                break;
            }
        }
        if (!route) continue;
        route.path = shortestTubingPath(component.cellSet, route.sourcePort.contacts,
            route.destinationPort.contacts);
        if (!route.path) continue;
        route.width = tubingPathCapacity(route.path, component.cellSet, route.source, route.destination);
        route.tubingRate = route.width * 10;
        routes.push(route);
    }

    // The splitter's nominal rate comes from its attached incoming line.
    // For a prefilled buffer with no active inlet route, use one output line's
    // capacity as the nominal total rather than multiplying by branch count.
    // Buffering keeps excess material safe if an output is slower or blocked.
    const splitterInputRate = new Map();
    const splitterMaterial = new Map();
    for (const route of routes) {
        if (!isSplitterMachine(DEFS[world.type[route.destination]]) ||
            !hasSourceInventory(route.source)) continue;
        const material = sourceMaterial(route.source);
        if (!destinationCanAccept(route.destination, material, route.destinationPort.port)) continue;
        splitterInputRate.set(route.destination, Math.max(
            splitterInputRate.get(route.destination) || 0, route.tubingRate));
        splitterMaterial.set(route.destination, material);
    }
    const activeSources = new Set();
    const claimedSources = new Set();
    for (const route of routes) {
        const { component, source, destination, sourcePort, destinationPort, path, width, tubingRate } = route;
        if (!hasSourceInventory(source)) continue;
        if (claimedSources.has(source) && !isSplitterMachine(DEFS[world.type[source]])) continue;
        const material = sourceMaterial(source);
        if (material === EMPTY || !destinationCanAccept(destination, material, destinationPort.port)) continue;
        const destinationDef = DEFS[world.type[destination]];
        const destinationX = destination % COLS;
        const destinationY = Math.floor(destination / COLS);
        const sprinklerBackpressure = isSprinklerMachine(destinationDef) &&
            isSprinklerReleaseEnabled(destinationX, destinationY) &&
            world.storageCount[destination] >= SPRINKLER_CAPACITY - 1;
        let rate = tubingRate;
        if (isMixerMachine(destinationDef)) rate = Math.min(rate, MIXER_INPUT_RATE);
        if (sprinklerBackpressure) rate = Math.min(rate,
            getSprinklerReleaseRate(destinationX, destinationY));
        if (isCollectorMachine(DEFS[world.type[source]])) rate = Math.min(rate, COLLECTOR_OUTPUT_RATE);
        if (isSplitterMachine(DEFS[world.type[source]])) {
            const incomingRate = splitterInputRate.get(source) || tubingRate;
            // The machine always divides by its two physical outlets. If one
            // route is absent or blocked, its half-rate remains buffered.
            rate = Math.min(rate, incomingRate / SPLITTER_OUTPUT_COUNT);
        }
        if (rate <= 0) continue;

        activeSources.add(source);
        claimedSources.add(source);
        let remainder;
        let flowField = null;
        if (isSplitterMachine(DEFS[world.type[source]])) {
            flowField = sourcePort.port.id === 'output-a' ? 'splitterOutputFlowA' : 'splitterOutputFlowB';
            world[flowField][source] = Math.min(1,
                world[flowField][source] + rate / SIMULATION_STEPS_PER_SECOND);
            remainder = world[flowField][source];
        } else {
            world.storageFlowRemainder[source] += rate / SIMULATION_STEPS_PER_SECOND;
            remainder = world.storageFlowRemainder[source];
        }
        const available = sourceCount(source);
        const destinationCapacity = isMixerMachine(destinationDef)
            ? MIXER_INPUT_CAPACITY - mixerSlotState(destination, destinationPort.port.id === 'input-a' ? 0 : 1).count[destination]
            : destinationSpace(destination);
        const transferred = Math.min(available, destinationCapacity, Math.floor(remainder));
        if (transferred > 0) {
            if (flowField) world[flowField][source] -= transferred;
            else world.storageFlowRemainder[source] -= transferred;
            world.storageCount[source] -= transferred;
            for (let item = 0; item < transferred; item++) {
                if (isMixerMachine(destinationDef)) {
                    receiveMixerMaterial(destination, destinationPort.port.id === 'input-a' ? 0 : 1, material);
                } else receiveTubingMaterial(destination, material);
            }
            if (world.storageCount[source] === 0) {
                world.storageType[source] = EMPTY;
                if (!isSplitterMachine(DEFS[world.type[source]])) {
                    world.storageFlowRemainder[source] = 0;
                }
            }
        }
        if (sourceCount(source, material) > 0 ||
            (isSplitterMachine(DEFS[world.type[source]]) && splitterMaterial.has(source))) {
            tubingFlows.push({ source, destination, material, rate, width,
                path, cells: component.cells });
        }
    }
    for (const source of sourceMachines) {
        if (!activeSources.has(source)) world.storageFlowRemainder[source] = 0;
    }
}

// A Sprinkler uses the same compact type/count inventory as a bin. With
// Release on and Drain Mode on, it uses the existing downward outlet; with
// Drain Mode off, it projects the stored material through seven spray rays.
function updateSprinklers(accrueRate = true) {
    for (let i = 0; i < world.type.length; i++) {
        if (!isSprinklerMachine(DEFS[world.type[i]]) || !sprinklerReleaseSetting(i) ||
            world.storageCount[i] === 0) continue;
        const x = i % COLS;
        const y = Math.floor(i / COLS);
        if (!sprinklerDrainModeSetting(i)) {
            const material = world.storageType[i];
            if (material === EMPTY) continue;
            if (accrueRate) {
                const sharePerFrame = (getSprinklerReleaseRate(x, y) / 6) * (6 / 7) /
                    SIMULATION_STEPS_PER_SECOND;
                for (const field of SPRINKLER_SPRAY_FIELDS) {
                    world[field][i] = Math.min(1, world[field][i] + sharePerFrame);
                }
            }
            for (let stream = 0; stream < SPRINKLER_SPRAY_FIELDS.length; stream++) {
                if (world.storageCount[i] === 0) break;
                const field = SPRINKLER_SPRAY_FIELDS[stream];
                if (world[field][i] < 1) continue;
                const clockPosition = SPRINKLER_SPRAY_CLOCK_POSITIONS[stream];
                const [offsetX, offsetY] = SPRINKLER_SPRAY_OFFSETS[stream];
                const target = { x: x + offsetX, y: y + offsetY };
                if (!inBounds(target.x, target.y) || storageIntakeIsWall(target.x, target.y)) continue;
                const output = index(target.x, target.y);
                if (world.type[output] !== EMPTY) continue;
                setCell(target.x, target.y, material);
                if (clockPosition !== 6) {
                    world.sprinklerLaunchDirection[output] = clockPosition;
                    world.sprinklerLaunchAge[output] = 0;
                }
                world[field][i] -= 1;
                world.storageCount[i]--;
                if (world.storageCount[i] === 0) world.storageType[i] = EMPTY;
            }
            continue;
        }
        if (accrueRate) {
            const releaseRate = getSprinklerReleaseRate(i % COLS, Math.floor(i / COLS));
            // Keep at most one ready particle buffered. This preserves the
            // requested average rate without releasing a burst after an output
            // cell has been blocked for a while.
            world.storageFlowRemainder[i] = Math.min(1,
                world.storageFlowRemainder[i] + releaseRate / SIMULATION_STEPS_PER_SECOND);
        }
        if (world.storageFlowRemainder[i] < 1) continue;
        // Release below the full 64px Sprinkler icon. The cell immediately below
        // the logical anchor is still covered by the drawn housing.
        const outputY = y + 2;
        if (!inBounds(x, outputY) || storageIntakeIsWall(x, outputY)) continue;
        const output = index(x, outputY);
        if (world.type[output] !== EMPTY) continue;

        const material = world.storageType[i];
        if (material === EMPTY) continue;
        setCell(x, outputY, material);
        world.storageFlowRemainder[i] -= 1;
        world.storageCount[i]--;
        if (world.storageCount[i] === 0) world.storageType[i] = EMPTY;
    }
}

function refreshStorageFunnelMachines() {
    storageFunnelMachines = [];
    if (!storageBarrierMask || storageBarrierMask.length !== world.type.length) {
        storageBarrierMask = new Uint8Array(world.type.length);
    } else {
        storageBarrierMask.fill(0);
    }
    if (!collectorSealMask || collectorSealMask.length !== world.type.length) {
        collectorSealMask = new Uint8Array(world.type.length);
    } else {
        collectorSealMask.fill(0);
    }
    if (!collectorRimMask || collectorRimMask.length !== world.type.length) {
        collectorRimMask = new Uint8Array(world.type.length);
    } else {
        collectorRimMask.fill(0);
    }
    for (let i = 0; i < world.type.length; i++) {
        if (!isCollectorMachine(DEFS[world.type[i]])) continue;
        const x = i % COLS;
        const y = Math.floor(i / COLS);
        const direction = world.data[i] & 7;
        const [frontX, frontY] = fanDirectionVector(direction);
        const geometry = collectorFunnelGeometry(frontX, frontY);
        const barrierCells = buildCollectorBarrierCells(x, y, frontX, frontY);
        for (const cell of barrierCells) storageBarrierMask[cell.i] = 1;
        for (const cell of buildCollectorShellCells(x, y, frontX, frontY)) {
            collectorSealMask[cell.i] = 1;
            if (cell.rim) collectorRimMask[cell.i] = 1;
        }
        storageFunnelMachines.push({ i, x, y, frontX, frontY, ...geometry, barrierCells });
    }
    collectorMasksDirty = false;
}

function emitMachineProjectile(x, y, direction, def, targetTemp) {
    if (def.machineEmits === EMPTY) return;
    const [dirX, dirY] = fanDirectionVector(direction);
    const nx = x + dirX;
    const ny = y + dirY;
    if (!inBounds(nx, ny)) return;
    const spot = index(nx, ny);
    if (world.type[spot] !== EMPTY) return;

    const projectile = DEFS[def.machineEmits];
    const airTemperature = world.temp[spot];
    transform(spot, def.machineEmits);
    // Keep bit 3 as the emitted-projectile marker; the lower three bits retain
    // the eight-way direction while hand-painted ray tools remain ordinary
    // falling/rising particles.
    world.data[spot] = (direction & 7) | 8;
    world.machineSetting[spot] = Number.isFinite(targetTemp) ? targetTemp : projectile.defaultTemp;
    // Do not inject the target temperature merely by creating a ray. The
    // emitted ray will apply its one-way force on later frames, so a Heater
    // set below the current air or a Cooler set above it remains a no-op.
    world.temp[spot] = airTemperature;
}

// Rendering uses the same power rule to show or hide a machine's active cone.
export function isMachinePoweredAt(x, y) {
    if (!world || !inBounds(x, y)) return false;
    const i = index(x, y);
    const def = DEFS[world.type[i]];
    if (isStorageMachine(def) || isSprinklerMachine(def) || isCollectorMachine(def)) return true;
    return !!def?.machine && machineIsPowered(x, y, i);
}

// Heater and Cooler use the same widening, directional cone as a Fan, but
// replace airflow with a temperature force. Near cells receive almost the
// complete Heat Ray/Cold Ray strength; the force fades gently at the edge so
// the full 28-cell range still has a visible effect.
function applyMachineTemperature(x, y, direction, targetTemp, range, machineRate, machine) {
    const [dirX, dirY] = fanDirectionVector(direction);
    const tangentX = -dirY;
    const tangentY = dirX;
    const reach = Math.max(1, Math.round(range));
    const blocked = new Set();

    for (let distance = 1; distance <= reach; distance++) {
        const halfWidth = Math.floor((distance - 1) * 0.5);
        const falloff = 1 - (distance - 1) / (reach + 1);
        for (let offset = -halfWidth; offset <= halfWidth; offset++) {
            if (blocked.has(offset)) continue;

            const nx = x + dirX * distance + tangentX * offset;
            const ny = y + dirY * distance + tangentY * offset;
            if (!inBounds(nx, ny)) continue;

            const ni = index(nx, ny);
            if (stopsWind(world.type[ni])) {
                blocked.add(offset);
                continue;
            }

            const rate = Math.max(0, Math.min(1,
                machineRate * (0.35 + 0.65 * falloff)));
            const delta = targetTemp - world.temp[ni];
            // A heater only raises temperatures and a cooler only lowers them.
            // Setting a machine on the already-correct side of a cell is a
            // no-op, rather than an instruction to reverse its job.
            if ((machine === 'heater' && delta <= 0) ||
                (machine === 'cooler' && delta >= 0)) continue;
            world.temp[ni] += delta * rate;
        }
    }
}

// A Fan's output is a widening 28-cell cone: power is 21, while reach is four
// times the original seven-cell cone. It marks the whole cone as a persistent
// wind trail, injects momentum into the air and gives each movable cell one
// downwind shove per simulation frame.
function applyFanWind(x, y, direction, strength = FAN_WIND_STRENGTH) {
    const [dirX, dirY] = fanDirectionVector(direction);
    const tangentX = -dirY;
    const tangentY = dirX;
    const range = Math.max(1, Math.round(FAN_WIND_RANGE));
    const legacyStrength = windStrengthToLegacyScale(strength);
    const powerScale = legacyStrength / FAN_REFERENCE_STRENGTH;
    const intensity = Math.min(1, powerScale);
    const blocked = new Set();

    // Walk from the fan outwards. A solid cell must shelter the downwind part
    // of its line, while the cells between the fan and that solid still need
    // to receive airflow. Walking the other way blocks the near side instead.
    for (let distance = 1; distance <= range; distance++) {
        const halfWidth = Math.floor((distance - 1) * 0.5);
        const falloff = 1 - (distance - 1) / (range + 1);
        for (let offset = -halfWidth; offset <= halfWidth; offset++) {
            if (blocked.has(offset)) continue;

            const nx = x + dirX * distance + tangentX * offset;
            const ny = y + dirY * distance + tangentY * offset;
            if (!inBounds(nx, ny)) continue;

            const ni = index(nx, ny);
            const id = world.type[ni];
            if (stopsWind(id) || storageIntakeIsWall(nx, ny)) {
                blocked.add(offset);
                continue;
            }

            const lateral = 1 - Math.abs(offset) / (halfWidth + 1) * 0.35;
            markWind(ni, 16 + 32 * intensity * falloff * lateral);
            // Keep enough momentum in the air to carry a gust beyond the
            // visible cone. The setting still scales this continuously, while
            // the extra transport factor prevents the new default of 7 from
            // stopping abruptly at the cone edge.
            addFanAirflow(ni, dirX, dirY, powerScale * 3.5 * falloff * lateral);

            if (id === EMPTY || world.moved[ni]) continue;
            const def = DEFS[id];
            const pushChance = Math.min(1, powerScale * falloff * def.windLift);
            if (def.windLift <= 0 || random() > pushChance) continue;

            const tx = nx + dirX;
            const ty = ny + dirY;
            if (!inBounds(tx, ty)) continue;
            const target = index(tx, ty);
            if (world.moved[target] || !windCanEnter(def,
                typeAtForMovement(def, tx, ty))) continue;
            swapCells(ni, target);
        }
    }
}

// Residual Fan air keeps nudging loose material after it leaves the visible
// cone. The field itself is spatial air, not particle data, so it decays and
// travels downwind even when the carried particle has moved to a new cell.
function applyFanAirflowToParticles() {
    for (let i = 0; i < world.type.length; i++) {
        if (world.moved[i] || world.type[i] === EMPTY) continue;

        const vx = world.airflowX[i];
        const vy = world.airflowY[i];
        const magnitude = Math.abs(vx) + Math.abs(vy);
        if (magnitude < FAN_AIR_PUSH_THRESHOLD) continue;

        const def = DEFS[world.type[i]];
        if (def.windLift <= 0) continue;
        const pushChance = Math.min(1, magnitude * 0.55 * def.windLift);
        if (random() > pushChance) continue;

        const dirX = Math.sign(vx);
        const dirY = Math.sign(vy);
        const x = i % COLS;
        const y = Math.floor(i / COLS);
        const nx = x + dirX;
        const ny = y + dirY;
        if (!inBounds(nx, ny)) continue;

        const target = index(nx, ny);
        if (world.moved[target] || !windCanEnter(def,
            typeAtForMovement(def, nx, ny))) continue;
        swapCells(i, target);
    }
}

function updateActiveMachines() {
    for (let i = 0; i < world.type.length; i++) {
        const def = DEFS[world.type[i]];
        if (!def?.machine) continue;
        const x = i % COLS;
        const y = Math.floor(i / COLS);
        if (!machineIsPowered(x, y, i)) continue;
        if (def.machine === 'fan') applyFanWind(x, y, world.data[i], world.machineSetting[i]);
        else if ((def.machine === 'heater' || def.machine === 'cooler') &&
            def.machineTemp !== undefined) {
            const targetTemp = world.machineSetting[i];
            applyMachineTemperature(x, y, world.data[i], targetTemp,
                def.machineRange, def.machineRate, def.machine);
            emitMachineProjectile(x, y, world.data[i], def, targetTemp);
        }
    }
}

// The wind only climbs over things it could otherwise have moved. A wall turns
// it back; a bank of sand turns it upwards, because the air has to go
// somewhere and over the top is the way that is open.
function deflectsUpward(target) {
    return target !== EMPTY && target !== STORAGE_VIRTUAL_WALL &&
        DEFS[target].category !== 'static';
}

// Works out which parts of a gust are in the lee of something solid.
//
// The wind is followed along its own flow lines - rows when it is blowing
// mostly sideways, columns when it is blowing mostly up or down. The first
// solid thing a line meets stops it, and nothing further along that line feels
// the wind at all; it gets past only along the lines either side. The obstacle
// itself is never counted as sheltered, only what is behind it, so a gust
// dragged along the face of a wall still stirs the air right against the wall.
//
// The result is indexed by the gust's own offsets, so a cell at (dx, dy) from
// the centre is at (dy + radius) * span + (dx + radius).
function shelterGust(centreX, centreY, dirX, dirY, radius) {
    const span = radius * 2 + 1;
    if (!gustShelter || gustShelter.length < span * span) {
        gustShelter = new Uint8Array(span * span);
        gustLift = new Uint8Array(span * span);
    }
    gustShelter.fill(0, 0, span * span);
    gustLift.fill(0, 0, span * span);

    // With no drag there is no direction for anything to shelter from: a gust
    // held still only stirs the air where it is.
    if (dirX === 0 && dirY === 0) return gustShelter;

    const alongRows = Math.abs(dirX) >= Math.abs(dirY);
    // Which way the air is travelling along each flow line.
    const step = alongRows ? (dirX > 0 ? 1 : -1) : (dirY > 0 ? 1 : -1);

    for (let line = -radius; line <= radius; line++) {
        let blocked = false;
        // How far into the loose material this line has got, and how much of
        // its upward kick is left over from the last thing it went through.
        let depth = 0;
        let liftLeft = 0;
        for (let n = 0; n < span; n++) {
            // Walk with the wind: start at the upwind edge and work downwind.
            const along = step > 0 ? n - radius : radius - n;
            const dx = alongRows ? along : line;
            const dy = alongRows ? line : along;
            const x = centreX + dx;
            const y = centreY + dy;

            const at = (dy + radius) * span + (dx + radius);
            if (blocked) gustShelter[at] = 1;
            // Only a sideways shove is deflected upwards. A gust driven down
            // into a pile is already going the other way, and lifting what it
            // meets would simply undo it.
            else if (liftLeft > 0 && alongRows) gustLift[at] = 1;

            if (!inBounds(x, y)) continue;
            const cell = y * COLS + x;
            const id = world.type[cell];
            if (stopsWind(id)) { blocked = true; continue; }
            if (slowsWind(id)) {
                liftLeft = WIND_DEFLECT_RUN;
                if (isBuried(cell, y) && ++depth >= WIND_PENETRATION) blocked = true;
            } else if (id === EMPTY) {
                depth = 0;
                if (liftLeft > 0) liftLeft--;
            }
        }
    }
    return gustShelter;
}

// The wind tool. Dragging it across the world shoves whatever is light enough
// to be picked up along with the drag, and stirs the air as it goes.
//
// The stirring is the interesting half: every cell in the gust is pulled part
// way towards the average temperature of the gust, so dragging up and down
// through the atmosphere mixes cold upper air into warmer lower air, exactly
// as a real draught would.
export function applyWind(centreX, centreY, dirX, dirY, radius, strength) {
    if (!world) return;
    if (strength <= 0) return;

    const reach = radius * radius;
    const span = radius * 2 + 1;
    const sheltered = shelterGust(centreX, centreY, dirX, dirY, radius);
    const lifted = gustLift;
    const shelteredAt = (dx, dy) => sheltered[(dy + radius) * span + (dx + radius)] === 1;
    const liftedAt = (dx, dy) => lifted[(dy + radius) * span + (dx + radius)] === 1;

    const cells = [];
    let total = 0;

    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            if (dx * dx + dy * dy > reach) continue;
            if (shelteredAt(dx, dy)) continue;
            const x = centreX + dx;
            const y = centreY + dy;
            if (!inBounds(x, y)) continue;
            const i = y * COLS + x;
            cells.push(i);
            total += world.temp[i];
        }
    }
    if (cells.length === 0) return;

    // Stir the air towards its own average.
    const average = total / cells.length;
    const mixing = Math.min(0.9, 0.12 * strength);
    for (const i of cells) {
        world.temp[i] += (average - world.temp[i]) * mixing;
    }

    // Show the gust. Streaks run along the way it is blowing, which is what
    // makes a drag read as a draught rather than as a glowing circle; with no
    // drag at all it is just a soft patch of stirred air.
    const sideways = Math.abs(dirX) >= Math.abs(dirY);
    const streakSeed = (frameCount / 6) | 0;
    const brightness = 13 + 2.5 * strength;
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            const spread = dx * dx + dy * dy;
            if (spread > reach) continue;
            if (shelteredAt(dx, dy)) continue;
            const x = centreX + dx;
            const y = centreY + dy;
            if (!inBounds(x, y)) continue;
            const falloff = 1 - Math.sqrt(spread) / radius;
            let weight = falloff * falloff;
            if (dirX !== 0 || dirY !== 0) {
                const line = sideways ? y : x;
                weight *= windStreak(line, streakSeed) < 0.5 ? 0.25 : 1;
            } else {
                weight *= 0.4;
            }
            // Where the flow has been turned up, the haze is drawn a row above
            // the cell it belongs to, so the gust visibly rides over whatever
            // deflected it instead of running flat through it.
            const rise = liftedAt(dx, dy) && y > 0 ? 1 : 0;
            markWind((y - rise) * COLS + x, weight * brightness, dirX, dirY);
        }
    }

    if (dirX === 0 && dirY === 0) return;

    // Push things along. Working from the downwind side back means each
    // particle is shoved once rather than being carried the whole way.
    const stepX = Math.sign(dirX);
    const stepY = Math.sign(dirY);
    const pushes = Math.max(1, Math.round(strength));

    for (let push = 0; push < pushes; push++) {
        for (let dy = stepY > 0 ? radius : -radius; stepY > 0 ? dy >= -radius : dy <= radius; dy += stepY > 0 ? -1 : 1) {
            for (let dx = stepX > 0 ? radius : -radius; stepX > 0 ? dx >= -radius : dx <= radius; dx += stepX > 0 ? -1 : 1) {
                if (dx * dx + dy * dy > reach) continue;
                if (shelteredAt(dx, dy)) continue;
                const x = centreX + dx;
                const y = centreY + dy;
                if (!inBounds(x, y)) continue;

                const i = y * COLS + x;
                const id = world.type[i];
                if (id === EMPTY) continue;

                const def = DEFS[id];
                if (def.windLift <= 0) continue;
                if (random() > def.windLift) continue;

                const nx = x + stepX;
                // The tool is a deliberate shove and drives straight along the
                // drag. It is the breeze, not the tool, that curls up over what
                // it has been through: a gust of weather has to go round a
                // drift, whereas the tool is the person deciding where the air
                // goes. The haze above still shows the deflection.
                const ny = y + stepY;
                if (!inBounds(nx, ny)) continue;

                const ni = ny * COLS + nx;
                if (!windCanEnter(def, typeAtForMovement(def, nx, ny))) continue;
                swapCells(i, ni);
            }
        }
    }
}

// -------------------------------------------------------- ambient wind system

const GENERAL_WIND_FIELD_INTERVAL = 8;
let ambientWindOn = false;
let activeGust = null;
let gustWait = 0;
let windShelter = null;
let windShelterFrame = -1;
let windShelterDirection = 0;
let generalWindCacheFrame = -1;
let gustFieldCells = [];

function clampWindSetting(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.min(50, Math.round(numeric))) : 0;
}

// The 0–50 controls are calibrated so 50 has the old scale's effect at 15.
// Combined General+Gust airflow can reach 100 before calibration, while each
// UI/tool strength still tops out at 50. Convert only where a physical formula
// still uses the legacy reference scale.
export function windStrengthToLegacyScale(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) * (15 / 50) : 0;
}

export function setGeneralWindStrength(value) {
    generalWindStrength = clampWindSetting(value);
    if (gustWindStrength < generalWindStrength) gustWindStrength = generalWindStrength;
    generalWindCacheFrame = -1;
}

export function getGeneralWindStrength() { return generalWindStrength; }

export function setGustWindStrength(value) {
    gustWindStrength = clampWindSetting(value);
    if (gustWindStrength < generalWindStrength) gustWindStrength = generalWindStrength;
    if (activeGust) activeGust.strength = gustWindStrength;
    if (gustWindStrength === 0) {
        activeGust = null;
        gustWait = 0;
        if (world) {
            clearGustWindField();
        }
    }
}

export function getGustWindStrength() { return gustWindStrength; }

// Compatibility for integrations that still use the old single dial API.
export function setWindDial(value) {
    const legacyValue = Number(value);
    setGustWindStrength(Number.isFinite(legacyValue)
        ? Math.round(Math.max(0, Math.min(15, legacyValue)) * (50 / 15)) : 0);
}
export function getWindDial() { return windStrengthToLegacyScale(gustWindStrength); }

function clearNaturalWindFields() {
    if (!world) return;
    world.generalWindX.fill(0);
    world.generalWindY.fill(0);
    world.gustWindX.fill(0);
    world.gustWindY.fill(0);
    gustFieldCells.length = 0;
    generalWindCacheFrame = -1;
}

function clearGustWindField() {
    if (world) {
        for (const i of gustFieldCells) {
            world.gustWindX[i] = 0;
            world.gustWindY[i] = 0;
        }
    }
    gustFieldCells.length = 0;
}

function initializePrevailingWind() {
    if (prevailingWindHasStarted) return;
    prevailingWindDirection = random() < 0.5 ? -1 : 1;
    prevailingWindTicksRemaining = PREVAILING_WIND_CYCLE_TICKS;
    prevailingWindHasStarted = true;
    windShelterFrame = -1;
    generalWindCacheFrame = -1;
}

export function setAmbientWindOn(value) {
    ambientWindOn = !!value;
    activeGust = null;
    if (!ambientWindOn) {
        gustWait = 0;
        clearNaturalWindFields();
        return;
    }
    initializePrevailingWind();
    // Delay the first event so enabling Breeze does not immediately disturb a scene.
    gustWait = 30 + Math.floor(random() * 90);
    generalWindCacheFrame = -1;
}

export function getAmbientWindOn() { return ambientWindOn; }
export function isBreezeBlowing() { return activeGust !== null; }
export function getPrevailingWindDirection() { return prevailingWindDirection; }
export function getPrevailingWindTicksRemaining() { return prevailingWindTicksRemaining; }

export function getActiveGustState() {
    if (!activeGust) return null;
    return {
        direction: activeGust.direction,
        x: activeGust.x,
        age: activeGust.age,
        duration: activeGust.duration
    };
}

function advancePrevailingWindCycle() {
    if (!prevailingWindHasStarted) return;
    prevailingWindTicksRemaining--;
    if (prevailingWindTicksRemaining > 0) return;
    prevailingWindDirection = random() < 0.5 ? -1 : 1;
    prevailingWindTicksRemaining = PREVAILING_WIND_CYCLE_TICKS;
    prevailingWindHasStarted = true;
    windShelterFrame = -1;
    generalWindCacheFrame = -1;
}

function refreshWindShelter() {
    if (!world) return;
    if (!windShelter || windShelter.length !== world.type.length) {
        windShelter = new Uint8Array(world.type.length);
        windShelterFrame = -1;
    }
    if (windShelterFrame >= 0 && windShelterDirection === prevailingWindDirection &&
        frameCount - windShelterFrame < GENERAL_WIND_FIELD_INTERVAL) return;

    const direction = prevailingWindDirection;
    for (let y = 0; y < ROWS; y++) {
        let blocked = false;
        let depth = 0;
        const rowStart = y * COLS;
        for (let x = direction > 0 ? 0 : COLS - 1;
            x >= 0 && x < COLS; x += direction) {
            const i = rowStart + x;
            const id = world.type[i];
            const storageWall = storageIntakeIsWall(x, y);
            windShelter[i] = blocked || storageWall ? 1 : 0;
            if (stopsWind(id) || storageWall) {
                windShelter[i] = 1;
                blocked = true;
                continue;
            }
            if (slowsWind(id)) {
                if (isBuried(i, y) && ++depth >= WIND_PENETRATION) blocked = true;
            } else if (id === EMPTY) {
                depth = 0;
            }
        }
    }
    windShelterFrame = frameCount;
    windShelterDirection = direction;
}

function updateGeneralWindField() {
    if (!world) return;
    const xField = world.generalWindX;
    const yField = world.generalWindY;
    if (!ambientWindOn || generalWindStrength <= 0) {
        if (generalWindCacheFrame < 0) {
            xField.fill(0);
            yField.fill(0);
        }
        generalWindCacheFrame = frameCount;
        return;
    }
    if (generalWindCacheFrame >= 0 &&
        frameCount - generalWindCacheFrame < GENERAL_WIND_FIELD_INTERVAL) return;

    refreshWindShelter();
    const phase = frameCount * 0.0032;
    const strength = generalWindStrength;
    const direction = prevailingWindDirection;
    for (let y = 0; y < ROWS; y++) {
        const rowStart = y * COLS;
        for (let x = 0; x < COLS; x++) {
            const i = rowStart + x;
            if (windShelter[i] || stopsWind(world.type[i])) {
                xField[i] = 0;
                yField[i] = 0;
                continue;
            }

            // Coherent waves leave calmer pockets and stronger streams without
            // per-cell randomness. This whole-world evaluation runs once per
            // eight simulation ticks and the field is reused between updates.
            const wave = 0.5 +
                0.23 * Math.sin(y * 0.105 + phase) +
                0.18 * Math.cos(x * 0.047 - phase * 0.7) +
                0.09 * Math.sin((x + y) * 0.064 + phase * 0.37);
            const intensity = Math.max(0, Math.min(1, (wave - 0.16) / 0.84));
            let vx = direction * strength * intensity;
            let vy = strength * intensity * 0.18 *
                Math.sin(x * 0.031 + y * 0.083 - phase * 0.6);
            const magnitude = Math.hypot(vx, vy);
            if (magnitude > strength) {
                const scale = strength / magnitude;
                vx *= scale;
                vy *= scale;
            }
            xField[i] = vx;
            yField[i] = vy;
        }
    }
    generalWindCacheFrame = frameCount;
}

function startTravellingGust() {
    const reachX = Math.max(5, Math.round(COLS * 0.08));
    const duration = Math.max(120, Math.min(240, Math.round(COLS * 0.9)));
    const direction = prevailingWindDirection;
    activeGust = {
        direction,
        x: direction > 0 ? -reachX : COLS - 1 + reachX,
        age: 0,
        duration,
        speed: (COLS - 1 + reachX * 2) / duration,
        reachX,
        reachY: Math.max(5, Math.round(ROWS * (0.12 + random() * 0.08))),
        centreY: Math.round(ROWS * (0.28 + random() * 0.44)),
        curve: Math.max(2, ROWS * (0.025 + random() * 0.025)),
        phase: random() * Math.PI * 2,
        strength: gustWindStrength
    };
}

function updateTravellingGustField() {
    if (!world) return;
    const xField = world.gustWindX;
    const yField = world.gustWindY;
    clearGustWindField();
    if (!ambientWindOn || gustWindStrength <= 0) {
        activeGust = null;
        return;
    }

    if (!activeGust) {
        if (gustWait > 0) gustWait--;
        else startTravellingGust();
    }
    const gust = activeGust;
    if (!gust) return;
    refreshWindShelter();

    const life = Math.sin(Math.PI * (gust.age + 1) / (gust.duration + 1));
    const xFrom = Math.max(0, Math.floor(gust.x - gust.reachX * 2.25));
    const xTo = Math.min(COLS - 1, Math.ceil(gust.x + gust.reachX * 2.25));
    for (let x = xFrom; x <= xTo; x++) {
        const dx = (x - gust.x) / gust.reachX;
        const xProfile = Math.exp(-2.2 * dx * dx);
        const curvedCentre = gust.centreY + Math.sin(
            (x / Math.max(1, COLS)) * Math.PI * 2 + gust.phase + gust.age * 0.018
        ) * gust.curve;
        const yFrom = Math.max(0, Math.floor(curvedCentre - gust.reachY * 2.1));
        const yTo = Math.min(ROWS - 1, Math.ceil(curvedCentre + gust.reachY * 2.1));
        for (let y = yFrom; y <= yTo; y++) {
            const i = y * COLS + x;
            if (windShelter[i] || stopsWind(world.type[i])) continue;
            const dy = (y - curvedCentre) / gust.reachY;
            const yProfile = Math.exp(-1.75 * dy * dy);
            const local = life * xProfile * yProfile *
                (0.88 + 0.12 * Math.sin(x * 0.12 + y * 0.19 + gust.phase + gust.age * 0.045));
            if (local < 0.015) continue;
            let vx = gust.direction * gust.strength * local;
            const swirl = 0.34 * Math.sin(dy * Math.PI + gust.phase + gust.age * 0.035) +
                0.12 * Math.sin((x + y * 0.8) * 0.09 + gust.phase + gust.age * 0.04);
            let vy = gust.strength * local * swirl;
            const magnitude = Math.hypot(vx, vy);
            if (magnitude > gust.strength) {
                const scale = gust.strength / magnitude;
                vx *= scale;
                vy *= scale;
            }
            xField[i] = vx;
            yField[i] = vy;
            gustFieldCells.push(i);
            // Sparse directional trails also show a gust crossing in Normal.
            if (((x + y * 31 + gust.age * 7) & 15) === 0) {
                markWind(i, windStrengthToLegacyScale(Math.hypot(vx, vy)) * 7, vx, vy);
            }
        }
    }

    gust.age++;
    gust.x += gust.direction * gust.speed;
    if (gust.age >= gust.duration) {
        activeGust = null;
        gustWait = 80 + Math.floor(random() * 100);
    }
}

function applyAmbientWindToParticles() {
    if (!world || !ambientWindOn ||
        (generalWindStrength <= 0 && gustFieldCells.length === 0)) return;
    const direction = prevailingWindDirection;
    const fromX = direction > 0 ? COLS - 1 : 0;
    const toX = direction > 0 ? -1 : COLS;
    const deltaX = -direction;
    for (let y = ROWS - 1; y >= 0; y--) {
        for (let x = fromX; x !== toX; x += deltaX) {
            const i = y * COLS + x;
            if (world.moved[i] || world.type[i] === EMPTY || windShelter?.[i]) continue;
            const def = DEFS[world.type[i]];
            if (def.windLift < BREEZE_MIN_LIFT) continue;
            const vx = world.generalWindX[i] + world.gustWindX[i];
            const vy = world.generalWindY[i] + world.gustWindY[i];
            const magnitude = Math.hypot(vx, vy);
            const legacyForce = windStrengthToLegacyScale(magnitude);
            if (legacyForce < 0.08 ||
                random() > Math.min(0.96, legacyForce * 0.06 * def.windLift)) continue;

            let lift = 0;
            if (Math.abs(vy) > magnitude * 0.42 && random() < 0.35 * def.windLift) lift = Math.sign(vy);
            else if (def.windLift > 0.7 && random() < 0.09) lift = -1;
            const nx = x + direction;
            let ny = y + lift;
            if (!inBounds(nx, ny)) continue;
            let target = index(nx, ny);
            const ahead = typeAtForMovement(def, nx, ny);
            if (!windCanEnter(def, ahead)) {
                if (!deflectsUpward(ahead) || ny < 1) continue;
                ny--;
                target = index(nx, ny);
                if (!windCanEnter(def, typeAtForMovement(def, nx, ny))) continue;
            }
            swapCells(i, target);
            markWind(target, legacyForce * 6, vx, vy);
        }
    }
}

function updateAmbientWind() {
    if (!world) return;
    updateGeneralWindField();
    updateTravellingGustField();
    applyAmbientWindToParticles();
}
function isFlame(id) {
    return id > 0 && DEFS[id].emit > 0 && DEFS[id].category === 'gas';
}

// One sideways move: diagonally down if it can, then along the surface, then
// squeezed up under pressure. Returns where it ended up.
function takeOneFlowStep(x, y, i, def) {
    // Diagonally down. This alone levels off the surface of a pool, because any
    // cell with a lower neighbouring column slides into it.
    const dir = randomSign();
    for (const d of [dir, -dir]) {
        if (canSinkDiagonally(def, x, y, x + d, y + 1)) {
            swapCells(i, i + COLS + d);
            return i + COLS + d;
        }
    }

    const sideways = flowSideways(x, y, i, def, dir);
    if (sideways !== i) return sideways;

    return pressureRise(x, y, i, def, dir);
}

// Runs along the surface looking for somewhere to fall from. Only empty cells
// are crossed, so a liquid can never teleport through anything. If there is no
// hole within reach it takes a single step towards the side with more room,
// which is what flattens a puddle out.
function flowSideways(x, y, i, def, preferred) {
    if (def.spread <= 0) return i;

    let bestRun = 0;
    let bestDir = 0;

    for (const d of [preferred, -preferred]) {
        let run = 0;
        for (let n = 1; n <= def.spread; n++) {
            const nx = x + d * n;
            if (typeAtForMovement(def, nx, y) !== EMPTY) break;
            run = n;
            // Found a gap to drop through: go straight there.
            if (canSinkInto(def, typeAtForMovement(def, nx, y + 1))) {
                swapCells(i, i + d * n);
                return i + d * n;
            }
        }
        if (run > bestRun) {
            bestRun = run;
            bestDir = d;
        }
    }

    if (bestRun > 0) {
        swapCells(i, i + bestDir);
        return i + bestDir;
    }
    return i;
}

// Pressure, and the reason water finds its own level.
//
// computeLiquidSurfaces has worked out, for every liquid cell, the height of
// the top of the whole connected body of that liquid. A cell that is stuck may
// climb into an empty space above it, but only while that space is still below
// that surface. Water therefore pushes up the far side of a U-bend, or up
// through a hole in the bottom of a tank, and stops dead once the two sides are
// level - it can never climb higher than the water pushing it.
function pressureRise(x, y, i, def, preferred) {
    const level = world.surface[i];
    if (level >= NO_SURFACE) return i;
    if (y - 1 <= level) return i;
    if (random() > 0.5) return i;

    if (typeAtForMovement(def, x, y - 1) === EMPTY) {
        swapCells(i, i - COLS);
        closeGapBehind(x, y, i, def.id);
        return i - COLS;
    }
    for (const d of [preferred, -preferred]) {
        if (canRiseDiagonally(def, x, y, x + d, y - 1)) {
            swapCells(i, i - COLS + d);
            closeGapBehind(x, y, i, def.id);
            return i - COLS + d;
        }
    }
    return i;
}

// When a cell has been pushed upwards it leaves a hole behind it. If that hole
// is left open the cell just drops straight back into it and nothing ever
// rises, so the liquid that did the pushing is pulled into the gap.
//
// The cell below is taken first on purpose. That sends the hole down through
// the body of liquid towards where the pressure is coming from, instead of
// leaving it wandering along the surface where the water that just rose would
// fall back into it.
function closeGapBehind(x, y, gap, id) {
    // Walk the hole straight down through the liquid to the bottom of the
    // column. Leaving it just under the surface is no good: the next cell along
    // simply falls into it and the rise is undone.
    let gy = y;
    let gi = gap;
    while (typeAt(x, gy + 1) === id) {
        const below = gi + COLS;
        swapCells(below, gi);
        gi = below;
        gy++;
    }
    if (gy !== y) return;

    for (const spot of [[x - 1, y], [x + 1, y]]) {
        const nx = spot[0];
        if (typeAt(nx, y) !== id) continue;
        swapCells(y * COLS + nx, gap);
        return;
    }
}

// Works out the top of each connected body of liquid, which is what the
// pressure rule above needs.
//
// Every liquid cell starts off thinking the surface is its own row, then four
// sweeps across the grid - down-right, down-left, up-right, up-left - spread
// the highest point through touching cells of the same liquid. Four sweeps is
// enough to carry the value round corners and through the bottom of a U-bend in
// a single frame, and because it is recomputed every frame anything it misses
// is picked up on the next one.
function computeLiquidSurfaces() {
    const type = world.type;
    const surface = world.surface;

    for (let y = 0; y < ROWS; y++) {
        const row = y * COLS;
        for (let x = 0; x < COLS; x++) {
            const i = row + x;
            surface[i] = DEFS[type[i]].category === 'liquid' ? y : NO_SURFACE;
        }
    }

    // Downwards, left to right: pulls the surface height down and to the right.
    for (let y = 1; y < ROWS; y++) {
        const row = y * COLS;
        for (let x = 0; x < COLS; x++) {
            const i = row + x;
            const id = type[i];
            if (id === EMPTY || DEFS[id].category !== 'liquid') continue;
            if (type[i - COLS] === id && surface[i - COLS] < surface[i]) surface[i] = surface[i - COLS];
            if (x > 0 && type[i - 1] === id && surface[i - 1] < surface[i]) surface[i] = surface[i - 1];
        }
    }

    // Downwards, right to left.
    for (let y = 1; y < ROWS; y++) {
        const row = y * COLS;
        for (let x = COLS - 1; x >= 0; x--) {
            const i = row + x;
            const id = type[i];
            if (id === EMPTY || DEFS[id].category !== 'liquid') continue;
            if (type[i - COLS] === id && surface[i - COLS] < surface[i]) surface[i] = surface[i - COLS];
            if (x < COLS - 1 && type[i + 1] === id && surface[i + 1] < surface[i]) surface[i] = surface[i + 1];
        }
    }

    // Upwards, left to right: carries it back up the far side of a U-bend.
    for (let y = ROWS - 2; y >= 0; y--) {
        const row = y * COLS;
        for (let x = 0; x < COLS; x++) {
            const i = row + x;
            const id = type[i];
            if (id === EMPTY || DEFS[id].category !== 'liquid') continue;
            if (type[i + COLS] === id && surface[i + COLS] < surface[i]) surface[i] = surface[i + COLS];
            if (x > 0 && type[i - 1] === id && surface[i - 1] < surface[i]) surface[i] = surface[i - 1];
        }
    }

    // Upwards, right to left.
    for (let y = ROWS - 2; y >= 0; y--) {
        const row = y * COLS;
        for (let x = COLS - 1; x >= 0; x--) {
            const i = row + x;
            const id = type[i];
            if (id === EMPTY || DEFS[id].category !== 'liquid') continue;
            if (type[i + COLS] === id && surface[i + COLS] < surface[i]) surface[i] = surface[i + COLS];
            if (x < COLS - 1 && type[i + 1] === id && surface[i + 1] < surface[i]) surface[i] = surface[i + 1];
        }
    }
}

// Gases: the mirror image of a liquid. Up, then diagonally up, then a sideways
// wander so that smoke and steam spread out under a ceiling instead of forming
// a single tight column.
// Is there anything alongside this cell that would burn? Flames themselves do
// not count - fire has no ignition point of its own - so a wall of flame is not
// mistaken for a wall of fuel.
function nextToFuel(x, y) {
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const id = typeAt(x + dx, y + dy);
            if (id <= 0) continue;
            if (DEFS[id].ignitePoint !== undefined) return true;
        }
    }
    return false;
}

function moveGas(x, y, i, def) {
    // Flame clings to what it is burning. Without this a fire rises off its
    // fuel the very frame it appears and is gone a cell later, which is why a
    // pool of oil could sit under one and never light, and why a bank of plants
    // only ever caught from underneath: nothing was ever next to anything for
    // long enough to heat it. A flame with fuel beside it mostly stays put and
    // works on it, and only wanders off once there is nothing left to burn.
    if (def.clings > 0 && random() < def.clings && nextToFuel(x, y)) return;

    // A gas does not go straight up in a line. Some of the time it slides off to
    // one side instead of climbing, which is what makes a plume billow out as
    // it rises rather than going up as a thin column, and what lets a cloud of
    // steam fill a room instead of hugging the ceiling above where it was made.
    if (def.drift > 0 && random() < def.drift) {
        const d = randomSign();
        if (canRiseInto(def, typeAtForMovement(def, x + d, y - 1))) {
            swapCells(i, i - COLS + d);
            return;
        }
        if (canRiseInto(def, typeAtForMovement(def, x + d, y))) {
            swapCells(i, i + d);
            return;
        }
    }

    let cy = y;
    let ci = i;

    for (let step = 0; step < def.fallSpeed; step++) {
        const above = typeAtForMovement(def, x, cy - 1);
        if (!canRiseInto(def, above)) break;
        const ni = ci - COLS;
        swapCells(ci, ni);
        ci = ni;
        cy--;
        if (above !== EMPTY) break;
    }
    if (cy !== y) return;

    const dir = randomSign();
    for (const d of [dir, -dir]) {
        if (canRiseInto(def, typeAtForMovement(def, x + d, y - 1))) {
            swapCells(i, i - COLS + d);
            return;
        }
    }

    // Nothing doing upwards at all, so it is under a ceiling or under more of
    // its own kind. It spreads out along whatever is stopping it rather than
    // stacking up underneath it - gas fills the room it is in.
    for (const d of [dir, -dir]) {
        if (canRiseInto(def, typeAtForMovement(def, x + d, y))) {
            swapCells(i, i + d);
            return;
        }
    }
}
