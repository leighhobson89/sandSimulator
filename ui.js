import { getShouldDrawGrid, setShouldDrawGrid, getLanguage, setElements, getElements, setBeginGameStatus, getGameInProgress, setGameInProgress, getGameVisiblePaused, getBeginGameStatus, getGameVisibleActive, getMenuState, getLanguageSelected, setLanguageSelected, setLanguage } from './constantsAndGlobalVars.js';
import { initializeSandGrid, setGameState, startGame, gameLoop } from './game.js';
import { initLocalization, localize } from './localization.js';


document.addEventListener('DOMContentLoaded', async () => {
    setElements();
    // Event listeners
    getElements().newGameMenuButton.addEventListener('click', async () => {
        setBeginGameStatus(true);
        if (!getGameInProgress()) {
            setGameInProgress(true);
        }
        setGameState(getGameVisiblePaused());
        initializeSandGrid();
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

