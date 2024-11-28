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

    Object.keys(particleIds).forEach((particleId) => {
        const id = parseInt(particleId);
        const particleData = particleIds[id];
        let mainStateGrid = getMainStateGrid();

        const { group, sticky } = particleData;

        for (let x = 0; x < cols; x++) {
            for (let y = rows - 2; y >= 0; y--) {
                // Skip empty cells
                if (mainStateGrid[x][y] === 0) {
                    continue;
                } else {
                    if (mainStateGrid[x][y] === id) {
                        switch (group) {
                            case "solid":
                                if (sticky) {
                                    mainStateGrid = applyStickySolidBehavior(x, y, mainStateGrid);
                                } else {
                                    mainStateGrid = applyNonStickySolidBehavior(x, y, mainStateGrid);
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
        }

        setMainStateGrid(mainStateGrid);
    });
}

function applyStickySolidBehavior(x, y) {
    let mainStateGrid = getMainStateGrid();
    const particleData = getParticleDefinitions().particles.id[mainStateGrid[x][y]];
    const gravity = particleData.gravity;
    const density = particleData.density;

    const cols = getGridCols();
    const rows = getGridRows();

    // Gravity-based Movement
    if (gravity > 0) {
        // Try to move the particle down if the space below is empty
        if (y + 1 < rows && mainStateGrid[x][y + 1] === 0) {
            mainStateGrid[x][y + 1] = mainStateGrid[x][y];
            mainStateGrid[x][y] = 0;
        } else {
            const below = y + 1 < rows ? mainStateGrid[x][y + 1] : 0;
            const belowParticleData = below ? getParticleDefinitions().particles.id[below] : null;

            // Density-based Behavior: Solid vs. Liquid/Gas
            if (below !== 0 && belowParticleData && (belowParticleData.group === "liquid" || belowParticleData.group === "gas")) {
                const belowDensity = belowParticleData.density;

                // Move denser particles down and displace less dense ones
                if (density > belowDensity) {
                    mainStateGrid[x][y + 1] = mainStateGrid[x][y];
                    mainStateGrid[x][y] = 0;

                    // Move the displaced less dense particle randomly (left or right)
                    if (y + 8 < rows) {
                        const moveDirection = Math.random() < 0.5 ? -1 : 1;
                        const newX = x + moveDirection * 4;

                        if (newX >= 0 && newX < cols) {
                            mainStateGrid[newX][y + 1] = below;
                        }
                    }
                }
            } 

            // Prevent less dense solids from replacing liquids
            else if (below !== 0 && belowParticleData && belowParticleData.group === "liquid" && density < belowParticleData.density) {
                return mainStateGrid;
            }
        }
    }

    // Final check: Move the particle up if there's a denser particle above or on either side
    const above = y - 1 >= 0 ? mainStateGrid[x][y - 1] : 0;
    const left = x - 1 >= 0 ? mainStateGrid[x - 1][y] : 0;
    const right = x + 1 < cols ? mainStateGrid[x + 1][y] : 0;

    const aboveParticleData = above ? getParticleDefinitions().particles.id[above] : null;
    const leftParticleData = left ? getParticleDefinitions().particles.id[left] : null;
    const rightParticleData = right ? getParticleDefinitions().particles.id[right] : null;

    // Check if there's a denser particle above or on either side (excluding solids)
    if (
        (aboveParticleData && aboveParticleData.density > density && aboveParticleData.group !== "solid") ||
        (leftParticleData && leftParticleData.density > density && leftParticleData.group !== "solid") ||
        (rightParticleData && rightParticleData.density > density && rightParticleData.group !== "solid")
    ) {
        // Move the current particle up by 1, and move the particle above down by 1
        const temp = mainStateGrid[x][y - 1];  // Temporary storage for the particle above

        // Move the current particle up
        mainStateGrid[x][y - 1] = mainStateGrid[x][y];
        mainStateGrid[x][y] = 0;

        // Move the particle above down
        mainStateGrid[x][y] = temp;
    }

    return mainStateGrid;
}


function applyNonStickySolidBehavior(x, y) {
    let mainStateGrid = getMainStateGrid();
    const particleData = getParticleDefinitions().particles.id[mainStateGrid[x][y]];
    const gravity = particleData.gravity;
    const density = particleData.density;

    const cols = getGridCols();
    const rows = getGridRows();

    // Gravity-based Movement
    if (gravity > 0) {
        // Try to move the particle down if the space below is empty
        if (y + 1 < rows && mainStateGrid[x][y + 1] === 0) {
            mainStateGrid[x][y + 1] = mainStateGrid[x][y];
            mainStateGrid[x][y] = 0;
        } else {
            const below = y + 1 < rows ? mainStateGrid[x][y + 1] : 0;
            const belowParticleData = below ? getParticleDefinitions().particles.id[below] : null;

            // Density-based Behavior: Solid vs. Liquid/Gas
            if (below !== 0 && belowParticleData && (belowParticleData.group === "liquid" || belowParticleData.group === "gas")) {
                const belowDensity = belowParticleData.density;

                // Move denser particles down and displace less dense ones
                if (density > belowDensity) {
                    mainStateGrid[x][y + 1] = mainStateGrid[x][y];
                    mainStateGrid[x][y] = 0;

                    // Move the displaced less dense particle randomly
                    if (y + 8 < rows) {
                        const moveDirection = Math.random() < 0.5 ? -1 : 1;
                        const newX = x + moveDirection * 4;

                        if (newX >= 0 && newX < cols) {
                            mainStateGrid[newX][y + 1] = below;
                        }
                    }
                }
            } 

            // Prevent less dense solids from replacing liquids
            else if (below !== 0 && belowParticleData && belowParticleData.group === "liquid" && density < belowParticleData.density) {
                return mainStateGrid;
            } 
            
            // Side-to-side Flow Behavior
            else {
                const left = x - 1 >= 0 ? mainStateGrid[x - 1][y + 1] : 1;
                const right = x + 1 < cols ? mainStateGrid[x + 1][y + 1] : 1;

                if (left === 0 && right !== 0) {
                    mainStateGrid[x - 1][y] = mainStateGrid[x][y];
                    mainStateGrid[x][y] = 0;
                } else if (right === 0 && left !== 0) {
                    mainStateGrid[x + 1][y] = mainStateGrid[x][y];
                    mainStateGrid[x][y] = 0;
                } else if (left === 0 && right === 0) {
                    if (Math.random() < 0.5) {
                        mainStateGrid[x - 1][y] = mainStateGrid[x][y];
                    } else {
                        mainStateGrid[x + 1][y] = mainStateGrid[x][y];
                    }
                    mainStateGrid[x][y] = 0;
                }
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
    const density = particleData.density;  // Get density of the particle

    const cols = getGridCols();
    const rows = getGridRows();

    if (gravity > 0) {
        if (y + 1 < rows && mainStateGrid[x][y + 1] === 0) {
            mainStateGrid[x][y + 1] = mainStateGrid[x][y];
            mainStateGrid[x][y] = 0;
        } else {
            // Check surrounding cells for less dense particles
            const below = y + 1 < rows ? mainStateGrid[x][y + 1] : 0;
            const left = x - 1 >= 0 ? mainStateGrid[x - 1][y] : 0;
            const right = x + 1 < cols ? mainStateGrid[x + 1][y] : 0;

            const belowParticleData = below ? particleDefinitions[below] : null;
            const leftParticleData = left ? particleDefinitions[left] : null;
            const rightParticleData = right ? particleDefinitions[right] : null;

            // Displace less dense particles (liquid, gas, solid)
            if (below !== 0 && belowParticleData && belowParticleData.density < density) {
                // Move the less dense particle up 8 units and randomly left or right by 4
                if (y + 8 < rows) {
                    mainStateGrid[x][y - 4] = below;
                    mainStateGrid[x][y + 1] = 0; // Clear the space below
                    const moveDirection = Math.random() < 0.5 ? -1 : 1;
                    const newX = x + moveDirection * 4;
                    if (newX >= 0 && newX < cols) {
                        mainStateGrid[newX][y + 8] = below;
                    }
                }
            }

            if (left !== 0 && leftParticleData && leftParticleData.density < density) {
                // Move the less dense particle up 8 units and randomly left or right by 4
                if (y + 8 < rows) {
                    mainStateGrid[x - 1][y + 8] = left;
                    mainStateGrid[x - 1][y] = 0; // Clear the space to the left
                    const moveDirection = Math.random() < 0.5 ? -1 : 1;
                    const newX = x + moveDirection * 4;
                    if (newX >= 0 && newX < cols) {
                        mainStateGrid[newX][y + 8] = left;
                    }
                }
            }

            if (right !== 0 && rightParticleData && rightParticleData.density < density) {
                // Move the less dense particle up 8 units and randomly left or right by 4
                if (y + 8 < rows) {
                    mainStateGrid[x + 1][y + 8] = right;
                    mainStateGrid[x + 1][y] = 0; // Clear the space to the right
                    const moveDirection = Math.random() < 0.5 ? -1 : 1;
                    const newX = x + moveDirection * 4;
                    if (newX >= 0 && newX < cols) {
                        mainStateGrid[newX][y + 8] = right;
                    }
                }
            }

            // Default movement logic for liquid if no displacement occurred
            const canFlowLeft = checkForEdge(x, y, -1, mainStateGrid, cols, rows);
            const canFlowRight = checkForEdge(x, y, 1, mainStateGrid, cols, rows);

            if (canFlowLeft && canFlowRight) {
                if (Math.random() < 0.5) {
                    mainStateGrid[x - 1][y] = mainStateGrid[x][y];
                } else {
                    mainStateGrid[x + 1][y] = mainStateGrid[x][y];
                }
                mainStateGrid[x][y] = 0;
            } else if (canFlowLeft) {
                mainStateGrid[x - 1][y] = mainStateGrid[x][y];
                mainStateGrid[x][y] = 0;
            } else if (canFlowRight) {
                mainStateGrid[x + 1][y] = mainStateGrid[x][y];
                mainStateGrid[x][y] = 0;
            } else {
                // If it cannot move left or right, randomize movement
                const right = x + 1 < cols ? mainStateGrid[x + 1][y] : 1;
                const left = x - 1 >= 0 ? mainStateGrid[x - 1][y] : 1;

                if (left === 0 && right === 0) {
                    if (Math.random() < 0.5) {
                        mainStateGrid[x - 1][y] = mainStateGrid[x][y];
                    } else {
                        mainStateGrid[x + 1][y] = mainStateGrid[x][y];
                    }
                    mainStateGrid[x][y] = 0;
                } else if (left === 0) {
                    mainStateGrid[x - 1][y] = mainStateGrid[x][y];
                    mainStateGrid[x][y] = 0;
                } else if (right === 0) {
                    mainStateGrid[x + 1][y] = mainStateGrid[x][y];
                    mainStateGrid[x][y] = 0;
                }
            }
        }
    }

    const above = y - 1 >= 0 ? mainStateGrid[x][y - 1] : 0;
    const aboveParticleData = above ? particleDefinitions[above] : null;

    if (above !== 0 && aboveParticleData && aboveParticleData.group === "liquid" && aboveParticleData.density > density) {
        const temp = mainStateGrid[x][y - 1];

        mainStateGrid[x][y - 1] = mainStateGrid[x][y];
        mainStateGrid[x][y] = 0;

        mainStateGrid[x][y] = temp;
    }

    return mainStateGrid;
}



// Helper function to check for edges
function checkForEdge(x, y, direction, mainStateGrid, cols, rows) {
    let currentX = x;
    let currentY = y;

    // Check up to 3 spaces in the given direction
    for (let i = 1; i <= 3; i++) {
        currentX += direction;
        if (currentX < 0 || currentX >= cols) return false; // Out of bounds

        // Check if current cell is empty and below it is also empty
        if (mainStateGrid[currentX][currentY] === 0 && 
            (currentY + 1 >= rows || mainStateGrid[currentX][currentY + 1] === 0)) {
            return true; // Found an edge
        }

        // Stop checking if we hit a solid
        const currentParticle = mainStateGrid[currentX][currentY];
        const particleGroup = currentParticle ? getParticleDefinitions().particles.id[currentParticle].group : "empty";
        if (particleGroup === "solid") return false;
    }

    return false; // No edge found
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
