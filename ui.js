import { setCurrentSandColor, getGridCols, getGridRows, getLanguage, setElements, getElements, setBeginGameStatus, getGameInProgress, setGameInProgress, getGameVisiblePaused, getBeginGameStatus, getGameVisibleActive, getMenuState, getLanguageSelected, setLanguageSelected, setLanguage, getCurrentSandColor } from './constantsAndGlobalVars.js';
import { incrementHueInRgb, setStateOfCell, initializeSandGrid, setGameState, startGame, gameLoop } from './game.js';
import { initLocalization, localize } from './localization.js';

let isMouseDown = false;
let colorChangeTimer = null;
let increment = 20;

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
    });

    getElements().button2.addEventListener('click', () => {
        //BUTTON 2 CODE
    });

    setGameState(getMenuState());
    handleLanguageChange(getLanguageSelected());
    
    const canvas = getElements().canvas;
    
    canvas.addEventListener('mousedown', (event) => {
        if (!isMouseDown) {
            isMouseDown = true;
            handleMouseClick(event);
            startColorChangeInterval();
        }
    });

    canvas.addEventListener('mousemove', (event) => {
        if (isMouseDown) {
            handleMouseClick(event);
        }
    });

    canvas.addEventListener('mouseup', () => {
        if (isMouseDown) {
            isMouseDown = false;
            clearInterval(colorChangeTimer);
            colorChangeTimer = null;
        }
    });


    function startColorChangeInterval() {
        if (!colorChangeTimer) {
            colorChangeTimer = setInterval(() => {
                setCurrentSandColor(incrementHueInRgb(getCurrentSandColor(), increment));
                console.log(getCurrentSandColor());
            }, 1000);
        }
    }

    // Handle mouse click to paint on the grid
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
        setStateOfCell(col, row);
    
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
