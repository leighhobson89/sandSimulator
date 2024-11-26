import { getGridCols, getGridRows, getShouldDrawGrid, setShouldDrawGrid, getLanguage, setElements, getElements, setBeginGameStatus, getGameInProgress, setGameInProgress, getGameVisiblePaused, getBeginGameStatus, getGameVisibleActive, getMenuState, getLanguageSelected, setLanguageSelected, setLanguage } from './constantsAndGlobalVars.js';
import { setStateOfCell, initializeSandGrid, setGameState, startGame, gameLoop } from './game.js';
import { initLocalization, localize } from './localization.js';

let isMouseDown = false;
let intervalId = null;

document.addEventListener('DOMContentLoaded', async () => {
    initializeSandGrid();
    setElements();
    // Event listeners
    getElements().newGameMenuButton.addEventListener('click', async () => {
        setBeginGameStatus(true);
        if (!getGameInProgress()) {
            setGameInProgress(true);
        }
        setGameState(getGameVisiblePaused());
        startGame();
    });

    getElements().returnToMenuButton.addEventListener('click', () => {
        setGameState(getMenuState());
    });

    getElements().button1.addEventListener('click', () => {
        setShouldDrawGrid(!getShouldDrawGrid()) // Toggle the grid drawing state
        console.log(`Grid drawing is now ${getShouldDrawGrid() ? 'enabled' : 'disabled'}.`);
    });

    getElements().button2.addEventListener('click', () => {
        //BUTTON 2 CODE
    });

    setGameState(getMenuState());
    handleLanguageChange(getLanguageSelected());
    
    canvas.addEventListener('mousedown', (event) => {
        if (!isMouseDown) {
            isMouseDown = true;
            handleMouseClick(event);
            intervalId = setInterval(() => handleMouseClick(event), 30);
        }
    });

    canvas.addEventListener('mouseup', () => {
        isMouseDown = false;
        clearInterval(intervalId);
    });

    canvas.addEventListener('mousemove', (event) => {
        if (isMouseDown) {
            handleMouseClick(event); 
        }
    });
    
    function handleMouseClick(event) {
        const canvas = getElements().canvas;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
    
        const cols = getGridCols();
        const rows = getGridRows();
        const cellWidth = canvas.width / cols;
        const cellHeight = canvas.height / rows;
    
        const col = Math.floor(x / cellWidth);
        const row = Math.floor(y / cellHeight);
    
        setStateOfCell(col, row, 1);
        
        event.preventDefault();
    }
    
});

async function setElementsLanguageText() {
    getElements().menuTitle.innerHTML = `<h2>${localize('menuTitle', getLanguage())}</h2>`;
    getElements().newGameMenuButton.innerHTML = `${localize('newGame', getLanguage())}`;
}

export async function handleLanguageChange(languageCode) {
    setLanguageSelected(languageCode);
    await setupLanguageAndLocalization();
    setElementsLanguageText();
}

async function setupLanguageAndLocalization() {
    setLanguage(getLanguageSelected());
    await initLocalization(getLanguage());
}

export function disableActivateButton(button, action, activeClass) {
    switch (action) {
        case 'active':
            button.classList.remove('disabled');
            button.classList.add(activeClass);
            break;
        case 'disable':
            button.classList.remove(activeClass);
            button.classList.add('disabled');
            break;
    }
}

