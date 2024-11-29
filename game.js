import { localize } from './localization.js';
import { getMainStateGrid, setMainStateGrid, getParticleTypeIdSelected, setParticleDefinitions, getGridCols, getGridRows, setBeginGameStatus, setGameStateVariable, getBeginGameStatus, getMenuState, getGameVisiblePaused, getGameVisibleActive, getElements, getLanguage, gameState, getParticleDefinitions } from './constantsAndGlobalVars.js';

//--------------------------------------------------------------------------------------------------------

export function startGame() {
    const ctx = getElements().canvas.getContext('2d');
    const container = getElements().canvasContainer;

    function updateCanvasSize() {
        const canvasWidth = container.clientWidth * 0.8;
        const canvasHeight = container.clientHeight * 0.8;

        getElements().canvas.style.width = `${canvasWidth}px`;
        getElements().canvas.style.height = `${canvasHeight}px`;

        getElements().canvas.width = canvasWidth;
        getElements().canvas.height = canvasHeight;

        ctx.scale(1, 1);
    }

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

    if (getBeginGameStatus()) {
        setBeginGameStatus(false);
    }
    setGameState(getGameVisibleActive());

    gameLoop();
}

export async function gameLoop() {
    const ctx = getElements().canvas.getContext('2d');
    const cols = getGridCols();
    const rows = getGridRows();

    if (gameState === getGameVisibleActive() || gameState === getGameVisiblePaused()) {
        ctx.clearRect(0, 0, getElements().canvas.width, getElements().canvas.height);

        if (gameState === getGameVisibleActive()) {
            drawParticles(ctx);
        }

        applyParticleBehaviors();

        requestAnimationFrame(gameLoop);
    }
}

export function drawParticles(ctx) {
    const particleIds = getParticleDefinitions().particles.id;
    const canvasWidth = getElements().canvas.width;
    const canvasHeight = getElements().canvas.height;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (particleIds) {

        Object.keys(particleIds).forEach(particleId => {
            const id = parseInt(particleId);
            paintCellsWithParticleType(ctx, id);
        });
    }
}

function paintCellsWithParticleType(ctx, particleId) {
    const canvasWidth = getElements().canvas.width;
    const canvasHeight = getElements().canvas.height;
    const cols = getGridCols();
    const rows = getGridRows();

    const particleDefinitions = getParticleDefinitions().particles.id;
    const particleData = particleDefinitions[particleId];

    const mainStateGrid = getMainStateGrid();

    const particleColor = particleData.color;

    const cellWidth = canvasWidth / cols;
    const cellHeight = canvasHeight / rows;

    for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
            const cellState = mainStateGrid[x][y];

            if (cellState === particleId) {
                ctx.fillStyle = particleColor;
                ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
            } else {
                ctx.fillStyle = 'rgba(0, 0, 0, 0)';
                ctx.fillRect(Math.floor(x * cellWidth), Math.floor(y * cellHeight), Math.floor(cellWidth), Math.floor(cellHeight));
            }
        }
    }
}

function applyParticleBehaviors() {
    const cols = getGridCols();
    const rows = getGridRows();
    const particleIds = getParticleDefinitions().particles.id;
    let mainStateGrid = getMainStateGrid();

    Object.keys(particleIds).forEach((particleId) => {
        const id = parseInt(particleId);
        const particleData = particleIds[id];
        const { group, sticky } = particleData;

        for (let x = 0; x < cols; x++) {
            for (let y = rows - 2; y >= 0; y--) {                
                if (mainStateGrid[x][y] === id) {
                    switch (group) {
                        case "solid":
                            if (sticky) {
                                mainStateGrid = applyStickySolidBehavior(x, y);
                            } else {
                                mainStateGrid = applyNonStickySolidBehavior(x, y);
                            }
                            break;

                        case "liquid":
                            if (sticky) {
                                mainStateGrid = applyStickyLiquidBehavior(x, y);
                            } else {
                                mainStateGrid = applyNonStickyLiquidBehavior(x, y);
                            }
                            break;

                        case "gas":
                            if (sticky) {
                                mainStateGrid = applyStickyGasBehavior(x, y);
                            } else {
                                mainStateGrid = applyNonStickyGasBehavior(x, y);
                            }
                            break;

                        default:
                            console.warn(`Unknown group type: ${group}`);
                    }
                }
            }
        }

        setMainStateGrid(mainStateGrid);
    });

    // Perform additional logic (e.g., handling particles swapping based on density/viscosity)
    let tempStateGrid = JSON.parse(JSON.stringify(mainStateGrid));

    for (let x = 0; x < cols; x++) {
        for (let y = rows - 2; y >= 0; y--) {
            const currentParticle = mainStateGrid[x][y];
            const belowParticle = y + 1 < rows ? mainStateGrid[x][y + 1] : 0;

            if (currentParticle !== 0 && belowParticle !== 0 && currentParticle !== belowParticle) {
                const currentParticleData = particleIds[currentParticle];
                const belowParticleData = particleIds[belowParticle];

                if (
                    currentParticleData.density > belowParticleData.density &&
                    currentParticleData.viscosity < belowParticleData.viscosity
                ) {
                    tempStateGrid[x][y] = belowParticle;
                    tempStateGrid[x][y + 1] = currentParticle;
                }
            }
        }
    }

    setMainStateGrid(tempStateGrid);
}


function applyStickySolidBehavior(x, y) {
    let mainStateGrid = getMainStateGrid();
    const particleData = getParticleDefinitions().particles.id[mainStateGrid[x][y]];
    const gravity = particleData.gravity;
    const density = particleData.density;
    const viscosity = particleData.viscosity; // how much a particle wants to flow, higher is less likely to flow, max 1 (solid), min 0 (gas)

    const cols = getGridCols();
    const rows = getGridRows();

    // Gravity-based Movement
    if (gravity > 0) {
        // Try to move the particle down if the space below is empty
        if (y + gravity < rows && mainStateGrid[x][y + gravity] === 0) {
            mainStateGrid[x][y + gravity] = mainStateGrid[x][y];
            mainStateGrid[x][y] = 0;
        } else if (mainStateGrid[x][y + 1] === 0) {
            mainStateGrid[x][y + 1] = mainStateGrid[x][y];
            mainStateGrid[x][y] = 0;
        } else {
            const below = y + 1 < rows ? mainStateGrid[x][y + 1] : 0;
            const belowParticleData = below ? getParticleDefinitions().particles.id[below] : null;

            // Density-based Behavior: Solid vs. Liquid/Gas
            if (below !== 0 && belowParticleData && belowParticleData.viscosity < viscosity) {
                const belowDensity = belowParticleData.density;

                // Move denser particles down and displace less dense ones
                if (density > belowDensity) {
                    mainStateGrid[x][y + 1] = mainStateGrid[x][y];
                    mainStateGrid[x][y] = 0;
                    // Move the displaced less dense particle randomly (left or right)
                    if (y + 8 < rows) {
                        const moveDirection = Math.random() < 0.5 ? -1 : 1;
                        const newX = x + moveDirection * 4;

                        // Out-of-bounds check for newX (left or right movement)
                        if (newX >= 0 && newX < cols) {
                            mainStateGrid[newX][y + 1] = below;
                        }
                    }
                }
            }
        }
    }

    return mainStateGrid;
}


function applyNonStickySolidBehavior(x, y) {
    let mainStateGrid = getMainStateGrid();
    const particleData = getParticleDefinitions().particles.id[mainStateGrid[x][y]];
    const gravity = particleData.gravity;
    const density = particleData.density;
    const viscosity = particleData.viscosity; // Get viscosity of the current particle

    const cols = getGridCols();
    const rows = getGridRows();

    if (y + gravity < rows && mainStateGrid[x][y + gravity] === 0) {
        mainStateGrid[x][y + gravity] = mainStateGrid[x][y];
        mainStateGrid[x][y] = 0;
    } else if (mainStateGrid[x][y + 1] === 0) {
        mainStateGrid[x][y + 1] = mainStateGrid[x][y];
        mainStateGrid[x][y] = 0;
    } else {
        const below = y + 1 < rows ? mainStateGrid[x][y + 1] : 0;
        const belowParticleData = below ? getParticleDefinitions().particles.id[below] : null;

        // Viscosity-based Behavior: Solid vs. Liquid/Gas
        if (below !== 0 && belowParticleData && belowParticleData.viscosity < viscosity) {
            const belowDensity = belowParticleData.density;

            // Move denser particles down and displace less dense ones
            if (density > belowDensity) {
                // Move the solid down
                mainStateGrid[x][y + 1] = mainStateGrid[x][y];
                mainStateGrid[x][y] = 0;
                // Move the displaced less dense particle randomly to the side
                if (y + 8 < rows) {
                    const moveDirection = Math.random() < 0.5 ? -1 : 1;
                    const newX = x + moveDirection * 4;

                    // Out-of-bounds check for newX
                    if (newX >= 0 && newX < cols) {
                        mainStateGrid[newX][y + 1] = below;
                    }
                }
            }

            return mainStateGrid;
        } else if (below !== 0 && belowParticleData) {
            const left = x - 1 >= 0 ? mainStateGrid[x - 1][y + 1] : 0;
            const right = x + 1 < cols ? mainStateGrid[x + 1][y + 1] : 0;

            if (left === 0 && right !== 0) {
                // Out-of-bounds check for left movement
                if (x - 1 >= 0) {
                    // Move left if the space is available
                    mainStateGrid[x - 1][y] = mainStateGrid[x][y];
                    mainStateGrid[x][y] = 0;
                }
            } else if (right === 0 && left !== 0) {
                // Out-of-bounds check for right movement
                if (x + 1 < cols) {
                    // Move right if the space is available
                    mainStateGrid[x + 1][y] = mainStateGrid[x][y];
                    mainStateGrid[x][y] = 0;
                }
            } else if (left === 0 && right === 0) {
                // Randomly choose a direction if both sides are free
                const moveDirection = Math.random() < 0.5 ? -1 : 1;
                const newX = x + moveDirection;

                // Out-of-bounds check for random side movement
                if (newX >= 0 && newX < cols) {
                    if (moveDirection < 0) {
                        mainStateGrid[newX][y] = mainStateGrid[x][y];
                    } else {
                        mainStateGrid[newX][y] = mainStateGrid[x][y];
                    }
                }
                mainStateGrid[x][y] = 0;
            }
        }
    }
    return mainStateGrid;
}


function applyNonStickyLiquidBehavior(x, y) {
    let mainStateGrid = getMainStateGrid();
    const particleDefinitions = getParticleDefinitions().particles.id;
    const particleData = particleDefinitions[mainStateGrid[x][y]];
    const gravity = particleData.gravity;
    const density = particleData.density;
    const viscosity = particleData.viscosity;

    const cols = getGridCols();
    const rows = getGridRows();

    if (gravity > 0) {
        if (y + gravity < rows && mainStateGrid[x][y + gravity] === 0) { //move down normally
            mainStateGrid[x][y + gravity] = mainStateGrid[x][y];
            mainStateGrid[x][y] = 0;
        } else if (mainStateGrid[x][y + 1] === 0) { // Move down by 1 if near bottom
            mainStateGrid[x][y + 1] = mainStateGrid[x][y];
            mainStateGrid[x][y] = 0;
        } else { //
            const below = y + 1 < rows ? mainStateGrid[x][y + 1] : 0;
            const belowParticleData = below ? particleDefinitions[below] : null;

            // Move down if can absorb under another particle
            if (below !== 0 && belowParticleData && belowParticleData.density < density && belowParticleData.viscosity < viscosity) {
                [mainStateGrid[x][y], mainStateGrid[x][y + 1]] = [mainStateGrid[x][y + 1], mainStateGrid[x][y]];

                return mainStateGrid;
            }

            // Check for lateral movement if sitting on top of a particle
            const result = checkForEdge(x, y, mainStateGrid, cols, rows);
            const direction = result.direction;
            mainStateGrid = result.mainStateGrid;

            if (direction !== null) {
                if (direction !== 0) {
                    const newX = x + direction;
                    const newY = y - 1;
                    mainStateGrid[newX][y] = mainStateGrid[x][y];
                    mainStateGrid[x][y] = 0;
                } else {
                    // Move particle to the closest empty space if no edge found to flow towards
                    mainStateGrid = moveParticleToClosestEmptySpace(x, y, mainStateGrid, cols, rows);
                }
            }
        }
    }

    return mainStateGrid;
}


function moveParticleToClosestEmptySpace(x, y, mainStateGrid, cols, rows) {
    const directions = [
        { dx: 0, dy: -1 }, // up
        { dx: 0, dy: 1 },  // down
        { dx: -1, dy: 0 }, // left
        { dx: 1, dy: 0 }   // right
    ];

    for (let distance = 1; distance < Math.max(cols, rows); distance++) {
        for (let direction of directions) {
            const newX = x + direction.dx * distance;
            const newY = y + direction.dy * distance;

            if (newX >= 0 && newX < cols && newY >= 0 && newY < rows) {
                if (mainStateGrid[newX][newY] === 0) {
                    mainStateGrid[newX][newY] = mainStateGrid[x][y];
                    mainStateGrid[x][y] = 0;

                    return mainStateGrid;
                }
            }
        }
    }
}

function checkForEdge(x, y, mainStateGrid, cols, rows) {
    let neighboringX = x;
    let neighboringY = y;
    const searchRange = cols;
    let edgeFoundRight = null;
    let edgeFoundLeft = null;

    // Get the particle and viscosity of the current cell (A)
    const actualParticle = mainStateGrid[x][y];
    const actualParticleViscosity = actualParticle ? getParticleDefinitions().particles.id[actualParticle].viscosity : 0;

    for (let dir of [1, -1]) {
        neighboringX = x;

        for (let i = 1; i <= searchRange; i++) {
            neighboringX += dir;

            if (neighboringX < 0 || neighboringX >= cols) {
                console.log(`Out of bounds at (${neighboringX}, ${neighboringY}), direction: ${dir}`);
                break;
            }

            const neighboringParticle = mainStateGrid[neighboringX][neighboringY];
            const neighboringParticleViscosity = neighboringParticle ? getParticleDefinitions().particles.id[neighboringParticle].viscosity : 0;
            const belowNeighboringParticle = neighboringY + 1 < rows ? mainStateGrid[neighboringX][neighboringY + 1] : null;
            const canMoveIntoNeighbor = neighboringParticle === 0 || neighboringParticleViscosity < actualParticleViscosity;
            const belowNeighborIsEmptyOrOutOfBounds =
                neighboringY + 1 >= rows || belowNeighboringParticle === 0;

            if (canMoveIntoNeighbor && belowNeighborIsEmptyOrOutOfBounds) {
                console.log(`Edge found at (${neighboringX}, ${neighboringY}), direction: ${dir}`);
                if (dir === 1) edgeFoundRight = dir;
                if (dir === -1) edgeFoundLeft = dir;
                break;
            }

            if (neighboringParticleViscosity >= actualParticleViscosity) {
                console.log(`Blocked by higher viscosity at (${neighboringX}, ${neighboringY}), direction: ${dir}`);
                break;
            }
        }
    }

    let chosenDirection = 0;
    if (edgeFoundRight && edgeFoundLeft) {
        chosenDirection = Math.random() < 0.5 ? edgeFoundRight : edgeFoundLeft;
        console.log(`Both edges found; chosen direction: ${chosenDirection}`);
    } else if (edgeFoundRight) {
        chosenDirection = edgeFoundRight;
        console.log(`Edge found in positive direction: ${chosenDirection}`);
    } else if (edgeFoundLeft) {
        chosenDirection = edgeFoundLeft;
        console.log(`Edge found in negative direction: ${chosenDirection}`);
    } else {
        chosenDirection = null;
        console.log(`No edge found in either direction`);
    }

    return {
        direction: chosenDirection,
        mainStateGrid: mainStateGrid,
    };
}




function applyStickyLiquidBehavior(x, y) {
    let mainStateGrid = getMainStateGrid();

    return mainStateGrid;
}

function applyNonStickyGasBehavior(x, y) {
    let mainStateGrid = getMainStateGrid();

    return mainStateGrid;
}

function applyStickyGasBehavior(x, y) {
    let mainStateGrid = getMainStateGrid();

    return mainStateGrid;
}

export function initializeParticleGrids() {
    const cols = getGridCols();
    const rows = getGridRows();

    const particleIds = getParticleDefinitions().particles.id;

    Object.keys(particleIds).forEach((particleId) => {
        const newGrid = [];

        for (let x = 0; x < cols; x++) {
            newGrid[x] = [];
            for (let y = 0; y < rows; y++) {
                newGrid[x][y] = 0;
            }
        }

        setMainStateGrid(newGrid);
    });
}

export function setStateOfCell(x, y) {
    const particleTypeSelected = getParticleTypeIdSelected();
    const particleData = getParticleDefinitions().particles.id[particleTypeSelected];
    const gravity = particleData.gravity;
    
    const cols = getGridCols();
    const rows = getGridRows();
    
    const mainStateGrid = getMainStateGrid();
    
    if (!particleTypeSelected) {
        console.warn(`Unknown particle type: ${particleTypeSelected}`);
        return;
    }

    function selectOffsetCellsToPaintWhenClicking(i, j) { //to 'spray' particles
        if (gravity > 0) { //only one brush size for paintable non moving particles, no 'spray'
            if (i >= 0 && i < cols && j >= 0 && j < rows) {
                if (Math.random() < 0.1) { //0.1
                    mainStateGrid[i][j] = particleTypeSelected;
                }
            }
        }
    }

    if (x >= 0 && x < cols && y >= 0 && y < rows) {
        mainStateGrid[x][y] = particleTypeSelected;
    }

    const surroundingOffsets = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], /*[0, 0],*/ [0, 1],
        [1, -1], [1, 0], [1, 1]
    ];

    surroundingOffsets.forEach(([dx, dy]) => {
        selectOffsetCellsToPaintWhenClicking(x + dx, y + dy);
    });

    setMainStateGrid(mainStateGrid);
}

export async function loadParticleDefinitions() {
    let particleDefinitions;
    const response = await fetch('./particles.json');
    particleDefinitions = await response.json();
    console.log("Loaded particle definitions:", particleDefinitions);
    setParticleDefinitions(particleDefinitions);
}

//===============================================================================================================


export function setGameState(newState) {
    console.log("Setting game state to " + newState);
    setGameStateVariable(newState);

    switch (newState) {
        case getMenuState():
            getElements().menu.classList.remove('d-none');
            getElements().menu.classList.add('d-flex');
            getElements().buttonRow.classList.add('d-none');
            getElements().buttonRow.classList.remove('d-flex');
            getElements().canvasContainer.classList.remove('d-flex');
            getElements().canvasContainer.classList.add('d-none');
            getElements().returnToMenuButton.classList.remove('d-flex');
            getElements().returnToMenuButton.classList.add('d-none');
            getElements().button1.classList.add('d-none');
            getElements().button2.classList.add('d-none');
            getElements().floatingContainer.classList.add("d-none");
            break;
        case getGameVisibleActive():
            getElements().menu.classList.remove('d-flex');
            getElements().menu.classList.add('d-none');
            getElements().buttonRow.classList.remove('d-none');
            getElements().buttonRow.classList.add('d-flex');
            getElements().canvasContainer.classList.remove('d-none');
            getElements().canvasContainer.classList.add('d-flex');
            getElements().returnToMenuButton.classList.remove('d-none');
            getElements().returnToMenuButton.classList.add('d-flex');
            getElements().returnToMenuButton.innerHTML = `${localize('menuTitle', getLanguage())}`;
            getElements().button1.classList.remove('d-none');
            getElements().button2.classList.remove('d-none');
            getElements().floatingContainer.classList.remove("d-none");
            break;
    }
}


// function rgbToHsl(r, g, b) {
//     r /= 255;
//     g /= 255;
//     b /= 255;

//     const max = Math.max(r, g, b);
//     const min = Math.min(r, g, b);
//     const delta = max - min;
//     let h = 0, s = 0, l = (max + min) / 2;

//     if (delta !== 0) {
//         s = delta / (1 - Math.abs(2 * l - 1));

//         if (max === r) {
//             h = (g - b) / delta;
//         } else if (max === g) {
//             h = 2 + (b - r) / delta;
//         } else {
//             h = 4 + (r - g) / delta;
//         }

//         h *= 60;

//         if (h < 0) {
//             h += 360;
//         }
//     }

//     console.log(`HSL: h=${h}, s=${s}, l=${l}`);

//     return [h, s, l];
// }

// function hslToRgb(h, s, l) {
//     s = Math.max(0, Math.min(s, 1));
//     l = Math.max(0, Math.min(l, 1));

//     if (s === 0) {
//         const gray = Math.round(l * 255);
//         return `rgb(${gray}, ${gray}, ${gray})`;
//     }

//     const c = (1 - Math.abs(2 * l - 1)) * s;
//     const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
//     const m = l - c / 2;

//     let r = 0, g = 0, b = 0;

//     if (0 <= h && h < 60) {
//         r = c;
//         g = x;
//         b = 0;
//     } else if (60 <= h && h < 120) {
//         r = x;
//         g = c;
//         b = 0;
//     } else if (120 <= h && h < 180) {
//         r = 0;
//         g = c;
//         b = x;
//     } else if (180 <= h && h < 240) {
//         r = 0;
//         g = x;
//         b = c;
//     } else if (240 <= h && h < 300) {
//         r = x;
//         g = 0;
//         b = c;
//     } else {
//         r = c;
//         g = 0;
//         b = x;
//     }

//     r = Math.round((r + m) * 255);
//     g = Math.round((g + m) * 255);
//     b = Math.round((b + m) * 255);

//     console.log(`RGB: r=${r}, g=${g}, b=${b}`);

//     return `rgb(${r}, ${g}, ${b})`;
// }

// export function incrementHueInRgb(rgbString, increment) {
//     const regex = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/;
//     const match = rgbString.match(regex);

//     if (!match) {
//         console.error("Invalid RGB string format");
//         return rgbString;
//     }

//     let r = parseInt(match[1]);
//     let g = parseInt(match[2]);
//     let b = parseInt(match[3]);

//     let [h, s, l] = rgbToHsl(r, g, b);
//     h = (h + increment) % 360;

//     const newRgbString = hslToRgb(h, s, l);
//     return newRgbString;
// }
