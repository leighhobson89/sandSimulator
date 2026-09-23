export async function setupPhysics(page, { cells = [], fills = [], temperatures = [], seed } = {}) {
    return page.evaluate(async ({ cells, fills, temperatures, seed }) => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        const id = name => {
            const value = definitions.findIndex(definition => definition?.name === name);
            if (value < 1) throw new Error(`Unknown particle: ${name}`);
            return value;
        };
        if (seed !== undefined) physics.setRandomSeed(seed);
        physics.clearWorld();
        for (const fill of fills) {
            for (let y = fill.y; y < fill.y + fill.height; y++) {
                for (let x = fill.x; x < fill.x + fill.width; x++) physics.setCell(x, y, id(fill.material));
            }
        }
        for (const cell of cells) physics.setCell(cell.x, cell.y, id(cell.material));
        for (const item of temperatures) {
            const index = physics.index(item.x, item.y);
            physics.getWorld().temp[index] = item.value;
            if (item.heat !== undefined) physics.getWorld().heat[index] = item.heat;
        }
        return { cols: physics.getWorld().cols, rows: physics.getWorld().rows };
    }, { cells, fills, temperatures, seed });
}

export async function ids(page, names) {
    return page.evaluate(async names => {
        const physics = await import('/physics.js');
        const definitions = physics.getDefinitions();
        return Object.fromEntries(names.map(name => [name, definitions.findIndex(definition => definition?.name === name)]));
    }, names);
}

export async function count(page, material) {
    return page.evaluate(async material => {
        const physics = await import('/physics.js');
        const id = physics.getDefinitions().findIndex(definition => definition?.name === material);
        return [...physics.getWorld().type].filter(value => value === id).length;
    }, material);
}

export async function cell(page, x, y) {
    return page.evaluate(async ({ x, y }) => {
        const physics = await import('/physics.js');
        const world = physics.getWorld();
        if (!physics.inBounds(x, y)) return null;
        const index = physics.index(x, y);
        return { type: world.type[index], temp: world.temp[index], life: world.life[index] };
    }, { x, y });
}

export async function cellsOf(page, material) {
    return page.evaluate(async material => {
        const physics = await import('/physics.js');
        const id = physics.getDefinitions().findIndex(definition => definition?.name === material);
        const world = physics.getWorld();
        return [...world.type].flatMap((value, index) => value === id
            ? [{ x: index % world.cols, y: Math.floor(index / world.cols) }]
            : []);
    }, material);
}
