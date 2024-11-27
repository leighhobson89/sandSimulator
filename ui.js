import { getGridCols, getGridRows, getLanguage, setElements, getElements, setBeginGameStatus, getGameInProgress, setGameInProgress, getGameVisiblePaused, getMenuState, getLanguageSelected, setLanguageSelected, setLanguage, getParticleTypeIdSelected } from './constantsAndGlobalVars.js';
import { loadParticleDefinitions, setStateOfCell, initializeParticleGrids, setGameState, startGame } from './game.js';
import { initLocalization, localize } from './localization.js';

let isMouseDown = false;
let clickTimer = null;
let mouseLocation = {};

document.addEventListener('DOMContentLoaded', async () => {
    await loadParticleDefinitions();
    initializeParticleGrids();
    setElements();
    
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
            mouseLocation = event;
            isMouseDown = true;
            handleMouseClick();
            startLongPressInterval();
        }
    });

    canvas.addEventListener('mousemove', (event) => {
        if (isMouseDown) {
            handleMouseClick(event);
            mouseLocation = event;
        }
    });

    canvas.addEventListener('mouseup', () => {
        if (isMouseDown) {
            isMouseDown = false;
            clickTimer = null;
        }
    });

    function startLongPressInterval() {
        if (!clickTimer) {
            clickTimer = setInterval(() => {
                if (isMouseDown) {
                    handleMouseClick(mouseLocation);
                }
            }, 30);
        }
    }

    function handleMouseClick() {
        const canvas = getElements().canvas;
        const rect = canvas.getBoundingClientRect();
        const x = mouseLocation.clientX - rect.left;
        const y = mouseLocation.clientY - rect.top;
    
        const cols = getGridCols();
        const rows = getGridRows();
        const cellWidth = canvas.width / cols;
        const cellHeight = canvas.height / rows;
    
        const col = Math.floor(x / cellWidth);
        const row = Math.floor(y / cellHeight);    
        setStateOfCell(col, row, getParticleTypeIdSelected());
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