import { localize } from './localization.js';
import { getParticleTypeIdSelected, setParticleState, getParticleState, setParticleDefinitions, setSandColors, getSandColors, getCurrentSandColor, getSandState, setSandState, getGridCols, getGridRows, setBeginGameStatus, setGameStateVariable, getBeginGameStatus, getMenuState, getGameVisiblePaused, getGameVisibleActive, getElements, getLanguage, gameState, getParticleDefinitions } from './constantsAndGlobalVars.js';

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

    const particleState = getParticleState(particleId);
    const particleColor = particleData.color;

    const cellWidth = canvasWidth / cols;
    const cellHeight = canvasHeight / rows;

    for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
            const cellState = particleState[x][y];

            if (cellState !== 0) {
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
        const particleData = particleIds[particleId];
        let particleStateGrid = getParticleState(id);

        const { group, sticky } = particleData;

        for (let x = 0; x < cols; x++) {
            for (let y = rows - 2; y >= 0; y--) {
                // Skip empty cells
                if (particleStateGrid[x][y] === 0) {
                    continue;
                }

                switch (group) {
                    case "solid":
                        if (sticky) {
                            particleStateGrid = applyStickySolidBehavior(x, y, particleStateGrid);
                        } else {
                            particleStateGrid = applyNonStickySolidBehavior(x, y, particleStateGrid);
                        }
                        break;

                    case "liquid":
                        if (sticky) {
                            particleStateGrid = applyStickyLiquidBehavior(x, y, particleStateGrid);
                        } else {
                            particleStateGrid = applyNonStickyLiquidBehavior(x, y, particleStateGrid);
                        }
                        break;

                    case "gas":
                        if (sticky) {
                            particleStateGrid = applyStickyGasBehavior(x, y, particleStateGrid);
                        } else {
                            particleStateGrid = applyNonStickyGasBehavior(x, y, particleStateGrid);
                        }
                        break;

                    default:
                        console.warn(`Unknown group type: ${group}`);
                }
            }
        }

        setParticleState(id, particleStateGrid);
    });
}

function applyStickySolidBehavior(x, y, particleStateGrid) {
    // Placeholder for sticky solid behavior
    return particleStateGrid;
}

function applyNonStickySolidBehavior(x, y, particleStateGrid) {
    const cols = getGridCols();
    const rows = getGridRows();

    if (y + 1 < rows && particleStateGrid[x][y + 1] === 0) {
        particleStateGrid[x][y + 1] = particleStateGrid[x][y];
        particleStateGrid[x][y] = 0;
    } else {
        const left = x - 1 >= 0 ? particleStateGrid[x - 1][y + 1] : 1;
        const right = x + 1 < cols ? particleStateGrid[x + 1][y + 1] : 1;

        if (left === 0 && right === 1) {
            particleStateGrid[x - 1][y] = particleStateGrid[x][y];
            particleStateGrid[x][y] = 0;
        } else if (right === 0 && left === 1) {
            particleStateGrid[x + 1][y] = particleStateGrid[x][y];
            particleStateGrid[x][y] = 0;
        } else if (left === 0 && right === 0) {
            if (Math.random() < 0.5) {
                particleStateGrid[x - 1][y] = particleStateGrid[x][y];
            } else {
                particleStateGrid[x + 1][y] = particleStateGrid[x][y];
            }
            particleStateGrid[x][y] = 0;
        }
    }

    return particleStateGrid;
}

function applyNonStickyLiquidBehavior(x, y, particleStateGrid) {
    // Placeholder for non-sticky liquid behavior
    return particleStateGrid;
}

function applyStickyLiquidBehavior(x, y, particleStateGrid) {
    // Placeholder for sticky liquid behavior
    return particleStateGrid;
}

function applyNonStickyGasBehavior(x, y, particleStateGrid) {
    // Placeholder for non-sticky gas behavior
    return particleStateGrid;
}

function applyStickyGasBehavior(x, y, particleStateGrid) {
    // Placeholder for sticky gas behavior
    return particleStateGrid;
}

export function initializeParticleGrids() {
    const cols = getGridCols();
    const rows = getGridRows();

    const particleIds = getParticleDefinitions().particles.id;

    Object.keys(particleIds).forEach((particleId) => {
        const id = parseInt(particleId);
        const particleState = [];

        for (let x = 0; x < cols; x++) {
            particleState[x] = [];
            for (let y = 0; y < rows; y++) {
                particleState[x][y] = 0;
            }
        }

        setParticleState(id, particleState);
    });
}

export function setStateOfCell(x, y, particleId) {
    const particleTypeSelected = getParticleTypeIdSelected();
    const cols = getGridCols();
    const rows = getGridRows();
    
    const particleState = getParticleState(particleId);
    
    if (!particleId) {
        console.warn(`Unknown particle type: ${particleId}`);
        return;
    }

    function selectOffsetCellsToPaintWhenClicking(i, j) {
        if (i >= 0 && i < cols && j >= 0 && j < rows) {
            if (Math.random() < 0.1) {
                particleState[i][j] = particleTypeSelected;
            }
        }
    }

    if (x >= 0 && x < cols && y >= 0 && y < rows) {
        particleState[x][y] = particleTypeSelected;
    }

    const surroundingOffsets = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], /*[0, 0],*/ [0, 1],
        [1, -1], [1, 0], [1, 1]
    ];

    surroundingOffsets.forEach(([dx, dy]) => {
        selectOffsetCellsToPaintWhenClicking(x + dx, y + dy);
    });

    setParticleState(particleId, particleState);
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

            console.log("Language is " + getLanguage());
            break;
        case getGameVisiblePaused():
            getElements().menu.classList.remove('d-flex');
            getElements().menu.classList.add('d-none');
            getElements().buttonRow.classList.remove('d-none');
            getElements().buttonRow.classList.add('d-flex');
            getElements().canvasContainer.classList.remove('d-none');
            getElements().canvasContainer.classList.add('d-flex');
            getElements().returnToMenuButton.classList.remove('d-none');
            getElements().returnToMenuButton.classList.add('d-flex');
            getElements().returnToMenuButton.innerHTML = `${localize('menuTitle', getLanguage())}`;
            getElements().button1.classList.add('d-none');
            getElements().button2.classList.add('d-none');
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
