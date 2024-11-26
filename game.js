import { localize } from './localization.js';
import { getSandState, setSandState, getSandGrid, setSandGrid, getGridCols, getGridRows, getShouldDrawGrid, setShouldDrawGrid, setBeginGameStatus, setGameStateVariable, getBeginGameStatus, getMenuState, getGameVisiblePaused, getGameVisibleActive, getElements, getLanguage, gameState } from './constantsAndGlobalVars.js';

//--------------------------------------------------------------------------------------------------------
let shouldDrawGrid = false; // Add this at the top of game.js

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
            draw(ctx);
        }

        applyGravity();

        setTimeout(() => {
            gameLoop();
        }, 40);
    }
}


export function draw(ctx) {
    const canvasWidth = getElements().canvas.width;
    const canvasHeight = getElements().canvas.height;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (getShouldDrawGrid()) {
        drawGrid(ctx);
    }

    paintCellsWithSand(ctx);
}

export function paintCellsWithSand(ctx) {
    const canvasWidth = getElements().canvas.width;
    const canvasHeight = getElements().canvas.height;
    const cols = getGridCols();
    const rows = getGridRows();

    const cellWidth = canvasWidth / cols;
    const cellHeight = canvasHeight / rows;

    for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
            const cellState = getSandState()[x][y];
            if (cellState === 1) {
                ctx.fillStyle = 'rgb(255, 255, 255)'; //sand
            } else {
                ctx.fillStyle = 'rgb(0, 0, 0)'; // empty
            }

            ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
        }
    }
}

export function applyGravity() {
    const cols = getGridCols();
    const rows = getGridRows();
    const sandState = getSandState();

    for (let x = 0; x < cols; x++) {
        for (let y = rows - 2; y >= 0; y--) {
            if (sandState[x][y] === 1 && sandState[x][y + 1] === 0) {
                sandState[x][y] = 0;
                sandState[x][y + 1] = 1;
            }
        }
    }

    setSandState(sandState); // Update the global state after applying gravity
}

export function initializeSandGrid() {
    const cols = getGridCols();
    const rows = getGridRows();
    const sandState = []; // Local state array

    for (let x = 0; x < cols; x++) {
        sandState[x] = [];
        for (let y = 0; y < rows; y++) {
            sandState[x][y] = 0; // Set initial state as empty (0)
        }
    }

    setSandState(sandState); // Save to global state
}

export function setStateOfCell(x, y) {
    const sandState = getSandState();

    if (x >= 0 && x < getGridCols() && y >= 0 && y < getGridRows()) {
        sandState[x][y] = 1; // Set the state to 1 when sand is painted
    }

    setSandState(sandState); // Update global state
}

export function drawGrid(ctx) {
    const canvasWidth = getElements().canvas.width;
    const canvasHeight = getElements().canvas.height;
    const cols = getGridCols();
    const rows = getGridRows();

    const cellWidth = canvasWidth / cols;
    const cellHeight = canvasHeight / rows;

    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1;

    // Draw vertical lines
    for (let x = 0; x <= canvasWidth; x += cellWidth) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
    }

    // Draw horizontal lines
    for (let y = 0; y <= canvasHeight; y += cellHeight) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
    }
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
