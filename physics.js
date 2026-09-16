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
//           sand looks grainy instead of flat
//   heat    how much heat has built up towards the next state change (see the
//           latent heat note further down)
//   surface for liquids, the top of the body of liquid this cell is joined to
//   data    a spare number per cell that a few particles use for their own
//           purposes: the fuse on a lit bomb, and how much growing a plant has
//           left in it
// -----------------------------------------------------------------------------

export const EMPTY = 0;
const OUT_OF_BOUNDS = -1;
const NO_SURFACE = 32000;

let COLS = 0;
let ROWS = 0;
let world = null;

// DEFS[id] is the definition for that particle. DEFS[0] is air.
let DEFS = [];
let AMBIENT = 20;
let ambientTarget = 20;
let frameCount = 0;

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

export function setLayerLapse(value) { layerLapse = value; }
export function getLayerLapse() { return layerLapse; }

// The air temperature at a given row, before the per-particle variance.
export function getAirTempAt(y) {
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

    AMBIENT = json.ambientTemp !== undefined ? json.ambientTemp : 20;

    // Air. Air is never drawn and never moves, but it does carry heat.
    const defs = [{
        id: EMPTY,
        name: 'Air',
        category: 'air',
        density: 0,
        conductivity: json.airConductivity !== undefined ? json.airConductivity : 0.06,
        cooling: json.airCooling !== undefined ? json.airCooling : 0.012,
        defaultTemp: AMBIENT,
        emit: 0,
        emitRate: 0,
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
            slide: p.slide || 0,
            repose: p.repose || 1,
            spread: p.spread || 0,
            flowSteps: p.flowSteps || 1,
            moveChance: p.moveChance === undefined ? 1 : p.moveChance,
            drift: p.drift || 0,

            conductivity: p.conductivity === undefined ? 0.06 : p.conductivity,
            cooling: p.cooling === undefined ? 0.004 : p.cooling,
            defaultTemp: p.defaultTemp === undefined ? AMBIENT : p.defaultTemp,
            emit: p.emit || 0,
            emitRate: p.emitRate || 0,
            forceTemp: p.forceTemp,
            forceRate: p.forceRate || 0,

            blastRadius: p.blastRadius || 0,
            fuse: p.fuse || 0,
            blastProof: !!p.blastProof,

            growHeight: p.growHeight || 0,
            growHeightMin: p.growHeightMin || p.growHeight || 0,
            flowerInto: toId(p.flowerInto),
            growChance: p.growChance || 0,
            seedChance: p.seedChance || 0,
            seedWaterRange: p.seedWaterRange || 0,
            seedInto: toId(p.seedInto),
            // What a seed can come up on, and what it becomes there. Good
            // ground gives a taller plant than poor ground.
            sprouts: (p.sprouts || []).map(rule => ({
                on: toId(rule.on),
                into: toId(rule.into),
                chance: rule.chance === undefined ? 0.04 : rule.chance
            })),
            sproutMinTemp: p.sproutMinTemp === undefined ? -273 : p.sproutMinTemp,

            meltPoint: p.meltPoint,
            meltsInto: toId(p.meltsInto),
            freezePoint: p.freezePoint,
            freezesInto: toId(p.freezesInto),
            boilPoint: p.boilPoint,
            boilsInto: toId(p.boilsInto),
            boilEmits: toId(p.boilEmits),
            depositPoint: p.depositPoint,
            depositsInto: toId(p.depositsInto),
            // What this turns into when it comes to rest against something
            // else: snow melting the moment it lands in water, or packing down
            // into ice where it settles on ice.
            contacts: (p.contacts || []).map(rule => ({
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
            smokeChance: p.smokeChance || 0,

            // wetsInto/wetChance describe how readily THIS material soaks up
            // water that touches it. Dry ground is 1, meaning the moment water
            // reaches it, it is wet.
            wetsInto: toId(p.wetsInto),
            wetChance: p.wetChance || 0,
            soaks: !!p.soaks,
            soakConsumeChance: p.soakConsumeChance === undefined ? 0.5 : p.soakConsumeChance,
            quenchedInto: toId(p.quenchedInto),
            douses: !!p.douses,
            corrodible: !!p.corrodible,
            corrosion: p.corrosion || 0,
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
            def.douses || def.contacts.length > 0;
        def.moves = def.category !== 'static';

        defs[id] = def;
    });

    DEFS = defs;
    for (const name in nameCache) delete nameCache[name];
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
        data: new Uint8Array(n)
    };
    world.temp.fill(AMBIENT);
    for (let i = 0; i < n; i++) world.shade[i] = Math.random() * 255;
    return world;
}

export function getWorld() { return world; }

export function clearWorld() {
    world.type.fill(EMPTY);
    world.life.fill(0);
    world.residue.fill(0);
    world.temp.fill(AMBIENT);
    world.heat.fill(0);
    world.data.fill(0);
}

// What a freshly placed particle starts with in its data slot. A plant gets a
// growing budget somewhere in its own range, so a row of them comes up at
// different heights instead of looking like a fence.
function startingData(def) {
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
    world.shade[i] = Math.random() * 255;
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
    world.moved[i1] = 1;
    world.moved[i2] = 1;
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
    computeLiquidSurfaces();
    world.moved.fill(0);

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
            if (def.moveChance < 1 && Math.random() > def.moveChance) continue;

            if (def.category === 'powder') movePowder(x, y, i, def);
            else if (def.category === 'liquid') moveLiquid(x, y, i, def);
            else if (def.category === 'gas') moveGas(x, y, i, def);
        }
    }
}

export function getFrameCount() { return frameCount; }

// ------------------------------------------------------------------ heat flow
//
// Every cell pulls its temperature towards the average of its four neighbours,
// at a rate set by the material it contains, and separately leaks towards the
// ambient air temperature. Off-grid neighbours count as ambient, so the edges
// of the world act like cold walls.
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

            const up = y > 0 ? temp[i - COLS] : rowAir;
            const down = y < ROWS - 1 ? temp[i + COLS] : rowAir;
            const left = x > 0 ? temp[i - 1] : rowAir;
            const right = x < COLS - 1 ? temp[i + 1] : rowAir;

            const average = (up + down + left + right) * 0.25;

            let result = t + (average - t) * def.conductivity;
            result += (rowAir + airOffset[shade[i]] - result) * def.cooling;

            // Heat sources (fire, lava) push themselves back up towards their
            // own temperature. emitRate decides how hard that is to fight:
            // a low rate means enough water can quench it.
            if (def.emit > result) result += (def.emit - result) * def.emitRate;

            // The heat and cold ray tools drag their cell towards a set
            // temperature in both directions, so they can chill as well as
            // heat. They burn out after a few frames, which is what stops them
            // piling up like a normal material.
            if (def.forceRate > 0) result += (def.forceTemp - result) * def.forceRate;

            next[i] = result;
        }
    }

    world.temp = next;
    world.tempNext = temp;
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
    } else if (def.freezePoint !== undefined && t < def.freezePoint) {
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

// ------------------------------------------------------------------ reactions
//
// The things temperature alone cannot express: lifetimes, water soaking into
// sand, acid eating through matter, plants growing. Returns true when the cell
// stopped being what it was.

function applyReactions(x, y, i, def) {
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
            const leftover = world.residue[i] || def.decaysInto;
            if (leftover !== EMPTY) {
                transform(i, leftover);
            } else if (def.smokeChance > 0 && Math.random() < def.smokeChance) {
                transform(i, idOf('Smoke'));
            } else {
                world.type[i] = EMPTY;
                world.life[i] = 0;
                world.residue[i] = EMPTY;
            }
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

    // Water soaking into the ground. Dry ground has a wetChance of 1, so water
    // never sits against it: the instant they touch, the dry cell is wet. Half
    // the time the water is soaked up and gone in the process, and the rest of
    // the time it carries on, which is what lets a stream wet a long stretch of
    // ground rather than one cell per drop.
    //
    // Note that only water wets anything. Wet ground does not wet what is under
    // it, so wet sand happily sits on top of dry sand the way it really does.
    if (def.soaks) {
        let soaked = false;
        for (let d = 0; d < 4; d++) {
            const nx = x + (d === 0 ? -1 : d === 1 ? 1 : 0);
            const ny = y + (d === 2 ? -1 : d === 3 ? 1 : 0);
            const n = typeAt(nx, ny);
            if (n <= 0) continue;
            const ground = DEFS[n];
            if (ground.wetsInto === EMPTY) continue;
            if (Math.random() >= ground.wetChance) continue;
            transform(ny * COLS + nx, ground.wetsInto);
            soaked = true;
            break;
        }
        if (soaked && Math.random() < def.soakConsumeChance) {
            world.type[i] = EMPTY;
            world.life[i] = 0;
            world.data[i] = 0;
            return true;
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
                world.type[ni] = EMPTY;
                world.life[ni] = 0;
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
    if (def.sprouts.length > 0 && world.temp[i] > def.sproutMinTemp) {
        const under = typeAt(x, y + 1);
        for (const rule of def.sprouts) {
            if (under !== rule.on) continue;
            if (Math.random() >= rule.chance) break;
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
        const budget = world.data[i];
        if (budget > 1 && Math.random() < def.growChance) {
            // Straight up most of the time, off to one side now and then, which
            // is enough to make it look like a plant rather than a pole.
            const sideways = Math.random() < 0.25 ? randomSign() : 0;
            for (const dx of [sideways, 0]) {
                const above = typeAt(x + dx, y - 1);
                if (above !== EMPTY && above !== idOf('Water')) continue;
                const ni = (y - 1) * COLS + (x + dx);
                transform(ni, def.id);
                world.data[ni] = budget - 1;
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
    world.type[source] = EMPTY;
    world.life[source] = 0;
    world.residue[source] = EMPTY;
    world.data[source] = 0;

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

function canSinkInto(def, other) {
    if (other === OUT_OF_BOUNDS) return false;
    if (other === EMPTY) return true;
    const o = DEFS[other];
    if (o.category === 'static') return false;
    return o.density < def.density;
}

function canRiseInto(def, other) {
    if (other === OUT_OF_BOUNDS) return false;
    if (other === EMPTY) return true;
    const o = DEFS[other];
    if (o.category === 'static') return false;
    return o.density > def.density;
}

function randomSign() { return Math.random() < 0.5 ? -1 : 1; }

// Powders: straight down, then diagonally down, and they push through any
// lighter fluid on the way.
function movePowder(x, y, i, def) {
    let cy = y;
    let ci = i;

    for (let step = 0; step < def.fallSpeed; step++) {
        const below = typeAt(x, cy + 1);
        if (!canSinkInto(def, below)) break;
        const ni = ci + COLS;
        swapCells(ci, ni);
        ci = ni;
        cy++;
        // Sinking through a fluid is slow going, so only one cell of that per
        // frame. Falling through open air can use the full fall speed.
        if (below !== EMPTY) break;
    }

    if (cy !== y) return;

    if (def.slide > 0 && Math.random() < def.slide) {
        const dir = randomSign();
        for (const d of [dir, -dir]) {
            if (!canSinkInto(def, typeAt(x + d, y + 1))) continue;
            if (!groundFallsAway(def, x + d, y)) continue;
            swapCells(i, i + COLS + d);
            return;
        }
    }
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
function moveLiquid(x, y, i, def) {
    // Gravity gets one go per frame. Only the sideways flow repeats: falling
    // fallSpeed cells several times over would have water dropping the height
    // of the screen between frames, which is both wrong and too fast for
    // anything it passes through to react to it.
    const landed = fallDown(x, y, i, def);
    if (landed !== i) return;

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

// ----------------------------------------------------------------- the wind
//
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
    const cells = [];
    let total = 0;

    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            if (dx * dx + dy * dy > reach) continue;
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
                const ny = y + stepY;
                if (!inBounds(nx, ny)) continue;

                const target = world.type[ny * COLS + nx];
                if (target !== EMPTY) {
                    const blocking = DEFS[target];
                    if (blocking.category === 'static') continue;
                    if (blocking.density >= def.density) continue;
                }
                swapCells(i, ny * COLS + nx);
            }
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
function moveGas(x, y, i, def) {
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

    if (def.drift > 0 && Math.random() < def.drift) {
        for (const d of [dir, -dir]) {
            if (canRiseInto(def, typeAt(x + d, y))) {
                swapCells(i, i + d);
                return;
            }
        }
    }
}
