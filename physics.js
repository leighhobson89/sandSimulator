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
//           purposes: the fuse on a lit bomb, and how much growing a plant has
//           left in it
//   power   frames of visible electrical power left in a conductive cell
//   powerDelay  frames until an electrical pulse reaches a conductive cell
//   charge  persistent stored charge for materials that can retain it; this is
//           floating point so a large connected mass can share one small input
//   wind    how recently moving air passed through the cell, 0 to 255, fading a
//           little every frame. Nothing in the simulation reads it back - it is
//           there only so that the wind can be seen as well as felt
// -----------------------------------------------------------------------------

export const EMPTY = 0;
const OUT_OF_BOUNDS = -1;
const NO_SURFACE = 32000;
const MAX_WATER_INFILTRATION_DEPTH = 50;
const POWER_GLOW_FRAMES = 7;
const ELECTRICAL_NEIGHBOURS = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],           [1, 0],
    [-1, 1],  [0, 1],  [1, 1]
];

let COLS = 0;
let ROWS = 0;
let world = null;

// DEFS[id] is the definition for that particle. DEFS[0] is air.
let DEFS = [];
let AMBIENT = 8;
let ambientTarget = 8;
let frameCount = 0;

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

// The air also comes in layers. The world is split into five bands by height
// and each one up is colder than the one below it by layerLapse degrees, the
// way real air is colder the higher you go. The middle band sits exactly on
// whatever the air temperature is set to, so the dial still reads true, and the
// top and bottom bands are two steps either side of it.
const AIR_BANDS = 5;
let layerLapse = 2;

// Layering can be switched off altogether, which makes the air one even
// temperature from the floor to the ceiling. It is a different thing from
// turning the lapse rate down to zero: this leaves whatever the slider was set
// to untouched, so switching it back on picks up where it left off.
let airLayersOn = true;

export function setLayerLapse(value) { layerLapse = value; }
export function getLayerLapse() { return layerLapse; }

export function setAirLayersOn(value) { airLayersOn = !!value; }
export function getAirLayersOn() { return airLayersOn; }

// The air temperature at a given row, before the per-particle variance.
export function getAirTempAt(y) {
    if (!airLayersOn) return AMBIENT;
    const band = Math.floor((y * AIR_BANDS) / ROWS);
    return AMBIENT + (band - (AIR_BANDS - 1) / 2) * layerLapse;
}

// ---------------------------------------------------------------- definitions

// Turns the raw particles.json into an array indexed by id, with every "name"
// reference (meltsInto: "Water") resolved to a numeric id up front so the
// simulation never has to compare strings while it is running.
export function prepareDefinitions(json) {
    const raw = json.particles;
    const nameToId = {};
    Object.keys(raw).forEach(id => { nameToId[raw[id].name.toLowerCase()] = parseInt(id); });

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
        cooling: json.airCooling !== undefined ? json.airCooling : 0.012,
        bulkInsulation: 0,
        defaultTemp: AMBIENT,
        emit: 0,
        emitRate: 0,
        conductive: false,
        electricalConductivity: 0,
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
        rgb: [0, 0, 0],
        rgb2: [0, 0, 0]
    }];

    Object.keys(raw).map(k => parseInt(k)).sort((a, b) => a - b).forEach(id => {
        const p = raw[id];
        const def = {
            id: id,
            name: p.name,
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
            forceTemp: p.forceTemp,
            forceRate: p.forceRate || 0,

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
            // Flowers come out a different colour each time. Each cell keeps a
            // fixed random number in its shade slot, which picks one of these.
            palette: p.rainbow ? rainbowPalette() : null
        };

        // Worked out once here so the per-frame loop can skip particles that
        // have nothing to do instead of testing a dozen properties every frame.
        def.hasStateChange = def.meltPoint !== undefined || def.freezePoint !== undefined ||
            def.boilPoint !== undefined || def.ignitePoint !== undefined;
        def.hasReaction = def.life > 0 || def.soaks || def.corrosion > 0 ||
            def.growChance > 0 || def.emit > 0 || def.quenchedInto !== EMPTY ||
            def.blastRadius > 0 || def.sprouts.length > 0 || def.seedChance > 0 ||
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
        if (!def || !def.sprouts) continue;
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

// --------------------------------------------------------------------- world

export function createWorld(cols, rows) {
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
        residue: new Uint8Array(n),
        moved: new Uint8Array(n),
        shade: new Uint8Array(n),
        heat: new Float32Array(n),
        surface: new Int16Array(n),
        data: new Uint8Array(n),
        power: new Uint8Array(n),
        powerDelay: new Uint16Array(n),
        charge: new Float32Array(n),
        wind: new Uint8Array(n)
    };
    world.temp.fill(AMBIENT);
    for (let i = 0; i < n; i++) world.shade[i] = Math.random() * 255;
    return world;
}

export function getWorld() { return world; }

// Public electrical state for later devices as well as the current renderer.
export function isPowered(x, y) {
    return inBounds(x, y) && world.power[index(x, y)] > 0;
}

export function getStoredCharge(x, y) {
    return inBounds(x, y) ? world.charge[index(x, y)] : 0;
}

// Returns the shared charge level for the connected aluminum entity under the
// cursor. The UI needs the whole reservoir rather than just one cell, since
// adding or discharging charge affects every connected aluminum cell equally.
export function getConnectedAluminumCharge(x, y) {
    if (!inBounds(x, y)) return null;

    const start = index(x, y);
    const aluminum = DEFS[world.type[start]];
    if (!aluminum || aluminum.name !== 'Aluminum') return null;

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
    world.residue.fill(0);
    world.temp.fill(AMBIENT);
    world.heat.fill(0);
    world.data.fill(0);
    world.power.fill(0);
    world.powerDelay.fill(0);
    world.charge.fill(0);
    world.wind.fill(0);
}

// What a freshly placed particle starts with in its data slot. A plant gets a
// growing budget somewhere in its own range, so a row of them comes up at
// different heights instead of looking like a fence. A seed instead gets the
// one thing it has to settle at the moment it exists: whether it is buoyant.
// That is decided here, once, and never revisited, so a seed that came up a
// floater is a floater for as long as it lasts.
function startingData(def) {
    if (def.floatChance > 0) return Math.random() < def.floatChance ? 1 : 0;
    if (def.growHeight <= 0) return 0;
    const spread = def.growHeight - def.growHeightMin;
    return def.growHeightMin + Math.floor(Math.random() * (spread + 1));
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

// Puts a particle into a cell, giving it its starting temperature and lifetime.
// This is what the brush uses.
export function setCell(x, y, id, keepTemp) {
    if (!inBounds(x, y)) return;
    const i = y * COLS + x;
    const def = DEFS[id];
    world.type[i] = id;
    world.residue[i] = EMPTY;
    world.life[i] = def.life > 0
        ? def.life + Math.floor((Math.random() - 0.5) * def.lifeVariance)
        : 0;
    if (!keepTemp) world.temp[i] = def.defaultTemp;
    world.heat[i] = 0;
    world.data[i] = startingData(def);
    world.power[i] = 0;
    world.powerDelay[i] = 0;
    world.charge[i] = 0;
    world.shade[i] = Math.random() * 255;
    world.moved[i] = 1;
}

// Replaces what is in a cell but leaves the cell temperature alone. Every state
// change (melting, freezing, burning) goes through here, because a material
// changing state does not change how hot that spot is.
function transform(i, id, life, residue) {
    const def = DEFS[id];
    world.type[i] = id;
    world.life[i] = life !== undefined ? life
        : (def.life > 0 ? def.life + Math.floor((Math.random() - 0.5) * def.lifeVariance) : 0);
    world.residue[i] = residue || EMPTY;
    world.heat[i] = 0;
    world.data[i] = startingData(def);
    world.power[i] = 0;
    world.powerDelay[i] = 0;
    world.charge[i] = 0;
    world.shade[i] = Math.random() * 255;
    world.moved[i] = 1;
}

function defaultBulkInsulation(category) {
    if (category === 'static') return 0.3;
    if (category === 'powder') return 0.12;
    if (category === 'liquid') return 0.05;
    return 0;
}

function removeParticle(i) {
    world.type[i] = EMPTY;
    world.life[i] = 0;
    world.residue[i] = EMPTY;
    world.heat[i] = 0;
    world.data[i] = 0;
    world.power[i] = 0;
    world.powerDelay[i] = 0;
    world.charge[i] = 0;
    world.moved[i] = 1;
}

function swapCells(i1, i2) {
    let t = world.type[i1]; world.type[i1] = world.type[i2]; world.type[i2] = t;
    let h = world.temp[i1]; world.temp[i1] = world.temp[i2]; world.temp[i2] = h;
    let l = world.life[i1]; world.life[i1] = world.life[i2]; world.life[i2] = l;
    let r = world.residue[i1]; world.residue[i1] = world.residue[i2]; world.residue[i2] = r;
    let s = world.shade[i1]; world.shade[i1] = world.shade[i2]; world.shade[i2] = s;
    let q = world.heat[i1]; world.heat[i1] = world.heat[i2]; world.heat[i2] = q;
    let f = world.surface[i1]; world.surface[i1] = world.surface[i2]; world.surface[i2] = f;
    let d = world.data[i1]; world.data[i1] = world.data[i2]; world.data[i2] = d;
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
        const x = i % COLS;
        const y = Math.floor(i / COLS);

        for (const [dx, dy] of ELECTRICAL_NEIGHBOURS) {
            const nx = x + dx;
            const ny = y + dy;
            if (!inBounds(nx, ny)) continue;
            const ni = ny * COLS + nx;
            const nextDef = DEFS[world.type[ni]];
            if (!nextDef || !nextDef.conductive) continue;
            if (!chargeStorage && nextDef.chargeCapacity > 0) continue;

            const travelFrames = Math.max(1,
                Math.ceil(1 / Math.max(0.01, nextDef.electricalConductivity)));
            const nextDistance = distance[i] + travelFrames;
            if (distance[ni] !== -1 && distance[ni] <= nextDistance) continue;
            if (distance[ni] === -1) touched.push(ni);
            distance[ni] = nextDistance;
            queue.push(ni);
        }
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
    // storage cell means a larger aluminum mass has proportionally more total
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
    for (const [dx, dy] of ELECTRICAL_NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        const ni = ny * COLS + nx;
        const def = DEFS[world.type[ni]];
        if (def && def.conductive) neighbours.push(ni);
    }
    return neighbours;
}

// Returns the total load of the conductive grid reached from an aluminum
// battery. Aluminum cells are deliberately not traversed here: two separate
// batteries may touch the same wire grid, but neither battery should become a
// bridge into the other battery's reservoir.
function connectedGridConsumption(seeds) {
    if (seeds.length === 0) return 0;

    const visited = new Uint8Array(world.type.length);
    const queue = [];
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

        const x = i % COLS;
        const y = Math.floor(i / COLS);
        for (const [dx, dy] of ELECTRICAL_NEIGHBOURS) {
            const nx = x + dx;
            const ny = y + dy;
            if (!inBounds(nx, ny)) continue;
            const ni = ny * COLS + nx;
            const nextDef = DEFS[world.type[ni]];
            if (visited[ni] || !nextDef || !nextDef.conductive ||
                nextDef.chargeCapacity > 0) continue;
            visited[ni] = 1;
            queue.push(ni);
        }
    }

    return consumption;
}

// Directly touching storage metals behave as one reservoir. This conserves
// their total charge while equalising fullness, so fresh aluminum painted onto
// a charged piece draws charge from the old cells immediately on the next
// simulation frame. Eight-way contact matches electrical wire connectivity.
function balanceStoredCharge() {
    const visited = new Uint8Array(world.type.length);

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
        // very slowly, while a future machine can make the same grid consume
        // hundreds of charge units per tick.
        const gridConsumption = connectedGridConsumption(dischargeContacts);
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
}

// ------------------------------------------------------------------ main step

export function stepSimulation() {
    frameCount++;
    // Ease the air temperature towards whatever the slider is set to. This is
    // deliberately slow, and each material's own "cooling" figure is small, so
    // a flame or a block of ice next to a cell always has far more say over its
    // temperature than the weather does.
    if (AMBIENT !== ambientTarget) {
        AMBIENT += (ambientTarget - AMBIENT) * 0.004;
        if (Math.abs(ambientTarget - AMBIENT) < 0.05) AMBIENT = ambientTarget;
    }
    diffuseHeat();
    radiateHeat();
    computeLiquidSurfaces();
    world.moved.fill(0);
    updateElectricalPower();

    // The breeze blows first, on the freshly cleared moved flags, so that
    // anything it shifts counts as having had its move for the frame and is
    // not then blown and dropped in the same tick.
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

            if (!def.moves) continue;

            // moveChance is how readily something shifts about of its own
            // accord. Gravity is not a matter of choice: everything falls at
            // its own fall speed whatever this says, and a low moveChance only
            // makes it slow to creep, slide and settle. That is what lets lava
            // crawl along the ground at the pace of treacle while still
            // dropping through open air like the heavy stuff it is, and what
            // stops wet ground looking like it is floating down.
            const sluggish = def.moveChance < 1 && Math.random() > def.moveChance;

            if (def.category === 'powder') movePowder(x, y, i, def, sluggish);
            else if (def.category === 'liquid') moveLiquid(x, y, i, def, sluggish);
            else if (def.category === 'gas' && !sluggish) moveGas(x, y, i, def);
        }
    }
}

export function getFrameCount() { return frameCount; }

// ------------------------------------------------------------------ heat flow
//
// Every cell pulls its temperature towards the average of its four neighbours,
// at a rate set by the material it contains, and separately leaks towards the
// ambient air temperature. At the boundary the missing neighbour is the cell
// itself: ambient cooling already applies evenly everywhere, so treating an
// off-grid neighbour as extra air would cool edges and corners faster and make
// steam rain there disproportionately.
//
// This single pass is what drives melting, boiling, freezing and ignition, so
// there are no special "is there a fire next to me" checks anywhere.

function diffuseHeat() {
    const type = world.type;
    const temp = world.temp;
    const next = world.tempNext;
    const shade = world.shade;

    for (let y = 0; y < ROWS; y++) {
        const rowStart = y * COLS;
        const rowAir = getAirTempAt(y);
        for (let x = 0; x < COLS; x++) {
            const i = rowStart + x;
            const def = DEFS[type[i]];
            const t = temp[i];

            const up = y > 0 ? temp[i - COLS] : t;
            const down = y < ROWS - 1 ? temp[i + COLS] : t;
            const left = x > 0 ? temp[i - 1] : t;
            const right = x < COLS - 1 ? temp[i + 1] : t;

            const average = (up + down + left + right) * 0.25;

            // A surface still responds almost normally, but heat has a harder
            // time reaching a cell buried behind several layers of the same
            // material. Four matching neighbours is a true interior cell;
            // three is a shallow subsurface cell and receives half the effect.
            let sameNeighbours = 0;
            const id = type[i];
            if (y > 0 && type[i - COLS] === id) sameNeighbours++;
            if (y < ROWS - 1 && type[i + COLS] === id) sameNeighbours++;
            if (x > 0 && type[i - 1] === id) sameNeighbours++;
            if (x < COLS - 1 && type[i + 1] === id) sameNeighbours++;
            const buried = Math.max(0, (sameNeighbours - 2) * 0.5);
            const conductionScale = 1 - def.bulkInsulation * buried;
            const coolingScale = 1 - def.bulkInsulation * buried * 0.7;

            let result = t + (average - t) * def.conductivity * conductionScale;
            let coolingRate = def.cooling;
            if (def.coolingVariance > 0) {
                const variation = (shade[i] / 255 - 0.5) * 2;
                coolingRate *= 1 + variation * def.coolingVariance;
            }
            result += (rowAir + airOffset[shade[i]] - result) * coolingRate * coolingScale;

            // Heat sources (fire, lava) push themselves back up towards their
            // own temperature. emitRate decides how hard that is to fight:
            // a low rate means enough water can quench it.
            if (def.emit > result) result += (def.emit - result) * def.emitRate;

            // The heat and cold ray tools drag their cell towards a set
            // temperature in both directions, so they can chill as well as
            // heat. They burn out after a few frames, which is what stops them
            // piling up like a normal material.
            if (def.forceRate > 0) result += (def.forceTemp - result) * def.forceRate;

            // Something that starts far hotter than anything around it loses
            // heat at its own steady rate rather than in proportion to how cold
            // the air happens to be. Lava at 1150C does not cool twice as fast
            // because the weather turned, and the middle of a flow gives up its
            // heat at the same rate as the edges, so the whole of it stiffens
            // together instead of setting from the outside in. It stops at the
            // temperature of the air, never running colder than its
            // surroundings.
            if (def.coolsBy > 0 && result > rowAir) {
                let rate = def.coolsBy;
                // Something lying on top of it holds the heat in. Only the cell
                // directly above is looked at, which is all a crust is.
                if (def.insulatedCooling !== 1 && y > 0 &&
                    def.insulatedBy.includes(type[i - COLS])) {
                    rate *= def.insulatedCooling;
                }
                result = Math.max(rowAir, result - rate);
            }

            next[i] = result;
        }
    }

    world.temp = next;
    world.tempNext = temp;
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
    if (def.condenseLossChance > 0 && Math.random() < def.condenseLossChance) {
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
    const start = Math.floor(Math.random() * 4);
    for (let n = 0; n < 4; n++) {
        const d = (start + n) % 4;
        const nx = x + (d === 0 ? -1 : d === 1 ? 1 : 0);
        const ny = y + (d === 2 ? -1 : d === 3 ? 1 : 0);
        if (typeAt(nx, ny) === EMPTY) return ny * COLS + nx;
    }
    return -1;
}

// Spark Dust throws sparks into the air above itself. The wider upper cone
// lets a dust cell tucked directly beneath a solid Aluminum block still find
// a little space at the block's edge for the Spark to rise through.
function findEmptyAbove(x, y) {
    const spots = [
        [0, -1], [-1, -1], [1, -1], [-2, -1], [2, -1],
        [0, -2], [-1, -2], [1, -2]
    ];
    const start = Math.floor(Math.random() * spots.length);
    for (let n = 0; n < spots.length; n++) {
        const [dx, dy] = spots[(start + n) % spots.length];
        if (typeAt(x + dx, y + dy) === EMPTY) return (y + dy) * COLS + x + dx;
    }
    return -1;
}

// ------------------------------------------------------------------ reactions
//
// The things temperature alone cannot express: lifetimes, water soaking into
// sand, acid eating through matter, plants growing. Returns true when the cell
// stopped being what it was.

function applyReactions(x, y, i, def) {
    // An ordinary Spark touching any conductor becomes a travelling power
    // pulse. Sparks emitted by stored charge carry data=1 and are visual only,
    // which prevents charged aluminum from feeding itself forever.
    if (def.energizesConductors && world.data[i] === 0) {
        const conductors = conductiveNeighbours(x, y);
        if (conductors.length > 0) {
            energizeConnectedMetal(conductors);
            removeParticle(i);
            return true;
        }
    }

    // Aluminum keeps the charge added by each pulse. At higher charge it gives
    // off occasional decorative sparks without spending or reapplying charge;
    // a future device can read the stored value and discharge it deliberately.
    if (def.chargeCapacity > 0 && world.charge[i] > 0 && def.chargeSparkChance > 0) {
        const fullness = world.charge[i] / def.chargeCapacity;
        if (Math.random() < def.chargeSparkChance * fullness) {
            const spot = findEmptyNeighbour(x, y);
            if (spot >= 0) {
                const spark = idOf('Spark');
                transform(spot, spark);
                world.data[spot] = 1;
                world.temp[spot] = Math.max(world.temp[spot], DEFS[spark].defaultTemp);
            }
        }
    }

    // Spark Dust spends its own lifetime producing ordinary Sparks above it.
    // The Sparks are real particles, so they can charge Aluminum and conduct
    // its pulse normally before the dust pixel eventually wears out.
    if (def.sparkEmitterChance > 0 && Math.random() < def.sparkEmitterChance) {
        const spot = findEmptyAbove(x, y);
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
        if (world.life[i] <= 0) {
            const residue = world.residue[i];
            if (residue !== EMPTY) {
                transform(i, residue);
            } else if (def.decaysInto !== EMPTY && Math.random() < def.decayChance) {
                transform(i, def.decaysInto);
            } else if (def.smokeChance > 0 && Math.random() < def.smokeChance) {
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
                if (under !== rule.on || Math.random() >= rule.chance) continue;
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
            if (ground.wetsInto !== EMPTY && Math.random() < ground.wetChance) {
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
                (world.data[i] > 0 || Math.random() < ground.waterPermeability)) {
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
                if (Math.random() >= def.witherChance) continue;
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
            if (n > 0 && DEFS[n].corrodible && Math.random() < def.corrosion) {
                const ni = ny * COLS + nx;
                if (def.corrodeEmits !== EMPTY) {
                    transform(ni, def.corrodeEmits);
                } else removeParticle(ni);
                // The acid is used up as it eats, otherwise one drop dissolves
                // the whole world.
                if (Math.random() < 0.5) {
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
                if (Math.random() >= rule.chance) continue;
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
    if (def.sprouts.length > 0 && world.temp[i] > def.sproutMinTemp) {
        const under = typeAt(x, y + 1);
        for (const rule of def.sprouts) {
            if (under !== rule.on) continue;
            if (Math.random() >= rule.chance) break;

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
        if (def.growStyle === 'surface') return creepAcrossSurface(x, y, i, def);

        const budget = world.data[i];
        if (budget > 1 && Math.random() < def.growChance) {
            // Nothing grows out of dry ground. A plant only puts on another
            // cell while some part of it - anywhere in the plant, not just the
            // cell doing the growing - is still touching wet mud or wet sand,
            // so a patch that dries out stops where it is instead of carrying
            // on regardless.
            const soil = rootedIn(x, y);
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
            const sideways = Math.random() < 0.25 ? randomSign() : 0;
            for (const dx of [sideways, 0]) {
                const above = typeAt(x + dx, y - 1);
                if (above !== EMPTY && above !== idOf('Water')) continue;
                const ni = (y - 1) * COLS + (x + dx);
                transform(ni, grows);
                world.data[ni] = grows === def.id
                    ? budget - 1
                    : Math.max(budget - 1, world.data[ni]);
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
    if (def.seedChance > 0 && Math.random() < def.seedChance) {
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
    const squeeze = Math.random() < 0.15;

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
    if (budget > 4 && Math.random() < 0.12) {
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

    if (budget > 1 && Math.random() < def.growChance) {
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
                if (world.data[ni] === 0) world.data[ni] = 1 + Math.floor(Math.random() * 2);
                continue;
            }

            world.type[ni] = EMPTY;
            world.life[ni] = 0;
            world.residue[ni] = EMPTY;
            world.data[ni] = 0;
            world.heat[ni] = 0;
            world.power[ni] = 0;
            world.powerDelay[ni] = 0;
            world.charge[ni] = 0;
            world.temp[ni] = Math.max(world.temp[ni], 650);

            const onTheEdge = distance > furthest * 0.4;
            if (onTheEdge && Math.random() < 0.55) transform(ni, spark);
            else if (Math.random() < 0.3) transform(ni, fire);
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
    if (other === OUT_OF_BOUNDS) return false;
    if (other === EMPTY) return true;
    if (!def.displacesMaterials) return false;
    const o = DEFS[other];
    if (o.category === 'static') return false;
    if (powdersTogether(def, o)) return false;
    return o.density < def.density;
}

function canRiseInto(def, other) {
    if (other === OUT_OF_BOUNDS) return false;
    if (other === EMPTY) return true;
    const o = DEFS[other];
    if (o.category === 'static') return false;
    if (powdersTogether(def, o)) return false;
    return o.density > def.density;
}

function randomSign() { return Math.random() < 0.5 ? -1 : 1; }

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
        const above = typeAt(x, y - 1);
        if (above > 0 && DEFS[above].category === 'liquid' && canRiseInto(body, above)) {
            swapCells(i, i - COLS);
            return;
        }
    }

    if (body.fallChance < 1 && Math.random() > body.fallChance) return;

    let cy = y;
    let ci = i;

    for (let step = 0; step < body.fallSpeed; step++) {
        const below = typeAt(x, cy + 1);
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

    if (body.slide > 0 && Math.random() < body.slide) {
        const dir = randomSign();
        for (const d of [dir, -dir]) {
            if (!canSinkInto(body, typeAt(x + d, y + 1))) continue;
            if (!groundFallsAway(body, x + d, y)) continue;
            swapCells(i, i + COLS + d);
            return;
        }
    }

    if (body !== def) driftOnSurface(x, y, i);
}

// Anything floating on open water works its way to one side over time, the way
// anything adrift does, until it fetches up against a bank or something else in
// the water. It only ever steps to another spot on the same surface, so it
// cannot drift out over dry land.
function driftOnSurface(x, y, i) {
    if (Math.random() > FLOAT_DRIFT_CHANCE) return;
    if (!isFloatingOn(x, y)) return;

    const dir = randomSign();
    for (const d of [dir, -dir]) {
        if (typeAt(x + d, y) !== EMPTY) continue;
        if (!isFloatingOn(x + d, y)) continue;
        swapCells(i, i + d);
        return;
    }
}

// Is this cell sitting directly on top of a liquid?
function isFloatingOn(x, y) {
    const below = typeAt(x, y + 1);
    if (below === OUT_OF_BOUNDS || below === EMPTY) return false;
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
    return Math.random() < settled;
}

// A deep liquid interior can sleep, but a cell on a free vertical face cannot:
// it is precisely the cell that must spill into the space beside it to erode a
// water cliff and let the body find its level.
function hasOpenSide(x, y) {
    return typeAt(x - 1, y) === EMPTY || typeAt(x + 1, y) === EMPTY;
}

// How steep a slope a powder will sit on without slipping - its angle of
// repose. Dry sand needs only a single cell of drop beside it before it slides,
// so it always ends up as a flat cone. Wet mud needs the ground to fall right
// away before it will budge, so it stays in a heap. This is the difference
// between wet and dry that you can actually see.
function groundFallsAway(def, nx, y) {
    for (let n = 1; n <= def.repose; n++) {
        if (!canSinkInto(def, typeAt(nx, y + n))) return false;
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
    if (settledByDepth(y, i) && !hasOpenSide(x, y)) return;

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
        const below = typeAt(x, cy + 1);

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
// Both leave a trail in world.wind: a per-cell number that fades away over the
// following frames and that game.js draws as a faint pale haze. Nothing in the
// simulation ever reads it back. It exists purely so that moving air can be
// seen, rather than only being guessed at from whatever it happens to be
// pushing about at the time.

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

// Scratch space for working out where the wind reaches, reused between gusts so
// that nothing is allocated per frame. The breeze shelters a row at a time; the
// tool shelters the square its gust covers. The lift maps run alongside them,
// marking where the flow has been deflected upwards.
let rowShelter = null;
let rowLift = null;
let gustShelter = null;
let gustLift = null;

// Non-zero while there is any trail left to fade, so that the fade pass can be
// skipped entirely on the many frames where nothing is blowing.
let windTrailsAlive = 0;

export function getWindTrails() { return world ? world.wind : null; }

function markWind(i, amount) {
    if (amount <= 0) return;
    const v = world.wind[i] + amount;
    world.wind[i] = v > 255 ? 255 : v;
    windTrailsAlive = 1;
}

// Called every frame from the game loop, whether or not the simulation is
// running, so a gust blown while paused still fades instead of hanging there.
export function decayWindTrails() {
    if (!world || windTrailsAlive === 0) return;
    const wind = world.wind;
    let alive = 0;
    for (let i = 0; i < wind.length; i++) {
        const v = wind[i];
        if (v === 0) continue;
        const next = v * WIND_TRAIL_FADE - 1;
        if (next <= 0) { wind[i] = 0; continue; }
        wind[i] = next;
        alive++;
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
    const blocking = DEFS[target];
    if (blocking.category === 'static') return false;
    return blocking.density < def.density;
}

// The wind only climbs over things it could otherwise have moved. A wall turns
// it back; a bank of sand turns it upwards, because the air has to go
// somewhere and over the top is the way that is open.
function deflectsUpward(target) {
    return target !== EMPTY && DEFS[target].category !== 'static';
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
// through the layered air mixes the cold at the top into the warm at the
// bottom, exactly as a real draught would.
export function applyWind(centreX, centreY, dirX, dirY, radius, strength) {
    if (!world) return;

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
            markWind((y - rise) * COLS + x, weight * brightness);
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
                if (Math.random() > def.windLift) continue;

                const nx = x + stepX;
                // The tool is a deliberate shove and drives straight along the
                // drag. It is the breeze, not the tool, that curls up over what
                // it has been through: a gust of weather has to go round a
                // drift, whereas the tool is the person deciding where the air
                // goes. The haze above still shows the deflection.
                const ny = y + stepY;
                if (!inBounds(nx, ny)) continue;

                const ni = ny * COLS + nx;
                if (!windCanEnter(def, world.type[ni])) continue;
                swapCells(i, ni);
            }
        }
    }
}

// ------------------------------------------------------------ ambient breeze
//
// A gust is a soft band that crosses the world from one side to the other over
// a few seconds and then dies away, leaving a quiet gap of several seconds
// before the next one. It fades in and out over its crossing, and is strongest
// down its middle, so there is no moment where the air snaps on or off.

let ambientWindOn = false;
let breeze = null;
let breezeWait = 0;

// Whatever the Wind dial on the toolbar is set to. The tool is handed its
// strength per gust, but the breeze blows on its own and has to look it up.
let windDial = 2;

export function setWindDial(value) { windDial = value; }
export function getWindDial() { return windDial; }

export function setAmbientWindOn(value) {
    ambientWindOn = !!value;
    if (!ambientWindOn) {
        breeze = null;
        return;
    }
    // A short wait first, so switching it on does not immediately blow
    // everything the person has just finished arranging across the screen.
    if (!breeze) breezeWait = 60 + Math.floor(Math.random() * 180);
}

export function getAmbientWindOn() { return ambientWindOn; }

// True while a gust is actually crossing, which the readout uses to say so.
export function isBreezeBlowing() { return breeze !== null; }

function updateAmbientWind() {
    if (!ambientWindOn || !world) return;
    if (!breeze) {
        if (breezeWait > 0) { breezeWait--; return; }
        startBreeze();
    }
    blowBreeze();

    breeze.age++;
    breeze.x += breeze.dir * breeze.speed;
    if (breeze.age >= breeze.span) {
        breeze = null;
        breezeWait = 240 + Math.floor(Math.random() * 700);
    }
}

function startBreeze() {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const reach = Math.max(8, Math.round(COLS * (0.16 + Math.random() * 0.2)));
    const speed = 0.7 + Math.random() * 1.1;
    breeze = {
        dir: dir,
        reach: reach,
        speed: speed,
        // Where the middle of the band is. It starts wholly off one edge so the
        // gust arrives rather than appearing.
        x: dir > 0 ? -reach : COLS - 1 + reach,
        // How hard it blows at its very strongest. It takes this from the Wind
        // dial, at double what the tool blows with, so that turning the dial up
        // gives weather to match - and no gust is quite as hard as the one
        // before it.
        peak: Math.min(0.9, (0.025 + Math.random() * 0.07) * windDial * 2),
        span: (COLS + reach * 2) / speed,
        age: 0,
        seed: (Math.random() * 4096) | 0
    };
}

function blowBreeze() {
    const b = breeze;
    // Fades in over the first half of the crossing and out over the second.
    const life = Math.sin(Math.PI * Math.min(1, b.age / b.span));
    const centre = Math.round(b.x);
    const from = Math.max(0, centre - b.reach);
    const to = Math.min(COLS - 1, centre + b.reach);
    if (from > to) return;

    if (!rowShelter || rowShelter.length !== COLS) {
        rowShelter = new Uint8Array(COLS);
        rowLift = new Uint8Array(COLS);
    }

    // The rows the haze picks out are shuffled every so often, so the streaks
    // drift through the gust instead of standing as fixed bands.
    const streakSeed = b.seed + ((b.age / 15) | 0);
    const upwind = b.dir > 0 ? from : to;
    const downwind = b.dir > 0 ? to : from;

    for (let y = 0; y < ROWS; y++) {
        const rowStart = y * COLS;

        // First pass, walking with the wind: work out how far along the row the
        // air actually reaches. The first solid thing in the way stops it, and
        // everything behind that is still air for as long as the obstacle is
        // there - the gust gets past only along the rows above and below it.
        // A pile of powder or a body of water stops it in the same way, only
        // WIND_PENETRATION cells later, so the wind works the surface of a
        // drift and is turned aside by the depth of it.
        //
        // The walk starts at the edge of the world rather than at the edge of
        // the band, because a wall shelters what is behind it whether or not
        // the gust has reached the wall yet.
        const start = b.dir > 0 ? 0 : COLS - 1;
        let blocked = false;
        // How deep into the current run of loose material the wind has got, and
        // how much upward kick is left from the last thing it went through.
        let depth = 0;
        let liftLeft = 0;
        for (let x = start; x >= 0 && x < COLS; x += b.dir) {
            rowShelter[x] = blocked ? 1 : 0;
            rowLift[x] = !blocked && liftLeft > 0 ? 1 : 0;

            const id = world.type[rowStart + x];
            if (stopsWind(id)) { blocked = true; continue; }
            if (slowsWind(id)) {
                liftLeft = WIND_DEFLECT_RUN;
                if (isBuried(rowStart + x, y) && ++depth >= WIND_PENETRATION) blocked = true;
            } else if (id === EMPTY) {
                // Clear air: the run of material is over, and the kick the wind
                // took from it levels out over the next few cells.
                depth = 0;
                if (liftLeft > 0) liftLeft--;
            }
        }

        // Second pass, walking against it: downwind cells are dealt with first,
        // so a grain is shoved one cell and left there rather than being
        // carried the whole width of the gust in a single frame.
        for (let x = downwind; b.dir > 0 ? x >= upwind : x <= upwind; x -= b.dir) {
            if (rowShelter[x]) continue;

            const offset = (x - centre) / b.reach;
            const force = (0.5 + 0.5 * Math.cos(Math.PI * offset)) * life * b.peak;
            if (force <= 0.002) continue;

            const i = rowStart + x;

            // A few rows of faint haze, so the gust can be seen crossing even
            // over a stretch where there is nothing loose for it to pick up.
            // Kept dim and sparse: it is there to be noticed out of the corner
            // of the eye rather than looked at. Where the flow has been turned
            // up it is drawn a row higher, so the gust is seen riding over the
            // drift that deflected it.
            const rise = rowLift[x] && y > 0 ? 1 : 0;
            if (windStreak(y, streakSeed) > 0.93) markWind(i - rise * COLS, force * 75);

            const id = world.type[i];
            if (id === EMPTY) continue;

            const def = DEFS[id];
            if (def.windLift < BREEZE_MIN_LIFT) continue;
            if (Math.random() > force * def.windLift) continue;

            // The very lightest things - smoke, snow, ash, seeds - get lifted a
            // little as well as pushed along, which is what stops a gust
            // looking like a conveyor belt.
            let lift = def.windLift > 0.7 && Math.random() < 0.25 ? -1 : 0;
            // Air that has just come through something it could move is still
            // rising, and takes a little of what it carries up with it.
            if (lift === 0 && rowLift[x] && Math.random() < 0.2) lift = -1;
            const nx = x + b.dir;
            let ny = y + lift;
            if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;

            let ni = ny * COLS + nx;
            const ahead = world.type[ni];
            if (!windCanEnter(def, ahead)) {
                // Blocked. If what is in the way is loose - the next grain
                // along in the pile rather than a wall - the air is turned up
                // and over it and the grain goes up with it. A wall just stops
                // it dead, which is what keeps drawn boxes windproof.
                if (!deflectsUpward(ahead) || ny < 1) continue;
                ny -= 1;
                ni = ny * COLS + nx;
                if (!windCanEnter(def, world.type[ni])) continue;
            }
            swapCells(i, ni);
            markWind(ni, force * 75);
        }
    }
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
        if (canSinkInto(def, typeAt(x + d, y + 1))) {
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
            if (typeAt(nx, y) !== EMPTY) break;
            run = n;
            // Found a gap to drop through: go straight there.
            if (canSinkInto(def, typeAt(nx, y + 1))) {
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
    if (Math.random() > 0.5) return i;

    if (typeAt(x, y - 1) === EMPTY) {
        swapCells(i, i - COLS);
        closeGapBehind(x, y, i, def.id);
        return i - COLS;
    }
    for (const d of [preferred, -preferred]) {
        if (typeAt(x + d, y - 1) === EMPTY) {
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
    if (def.clings > 0 && Math.random() < def.clings && nextToFuel(x, y)) return;

    // A gas does not go straight up in a line. Some of the time it slides off to
    // one side instead of climbing, which is what makes a plume billow out as
    // it rises rather than going up as a thin column, and what lets a cloud of
    // steam fill a room instead of hugging the ceiling above where it was made.
    if (def.drift > 0 && Math.random() < def.drift) {
        const d = randomSign();
        if (canRiseInto(def, typeAt(x + d, y - 1))) {
            swapCells(i, i - COLS + d);
            return;
        }
        if (canRiseInto(def, typeAt(x + d, y))) {
            swapCells(i, i + d);
            return;
        }
    }

    let cy = y;
    let ci = i;

    for (let step = 0; step < def.fallSpeed; step++) {
        const above = typeAt(x, cy - 1);
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
        if (canRiseInto(def, typeAt(x + d, y - 1))) {
            swapCells(i, i - COLS + d);
            return;
        }
    }

    // Nothing doing upwards at all, so it is under a ceiling or under more of
    // its own kind. It spreads out along whatever is stopping it rather than
    // stacking up underneath it - gas fills the room it is in.
    for (const d of [dir, -dir]) {
        if (canRiseInto(def, typeAt(x + d, y))) {
            swapCells(i, i + d);
            return;
        }
    }
}
