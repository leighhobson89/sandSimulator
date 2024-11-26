import {captureGameStatusForSaving, restoreGameStatus, getElements, getLanguage, setLanguageChangedFlag, getLanguageChangedFlag} from './constantsAndGlobalVars.js';
import {localize} from './localization.js';
import { handleLanguageChange } from './ui.js';

export function saveGame(isManualSave) {
    const gameState = captureGameStatusForSaving();
    const serializedGameState = JSON.stringify(gameState);
    let compressed = LZString.compressToEncodedURIComponent(serializedGameState);
    const blob = new Blob([compressed], {
        type: 'text/plain'
    });
    const url = URL.createObjectURL(blob);

    if (isManualSave) {
        document.querySelector('.save-load-header').innerHTML = `${localize('headerStringSave', getLanguage())}`;
        document.getElementById('copyButtonSavePopup').classList.remove('d-none');
        document.getElementById('loadStringButton').classList.add('d-none');
        getElements().saveLoadPopup.classList.remove('d-none');
        //document.getElementById('overlay').classList.remove('d-none');

        const reader = new FileReader();
        reader.onload = function(event) {
            getElements().loadSaveGameStringTextArea.value = `${event.target.result}`;
            getElements().loadSaveGameStringTextArea.readOnly = true;
        };
        reader.readAsText(blob);
    } else {
        const a = document.createElement('a');
        // Generate the filename with "AUTO_" prefix for auto save
        const timestamp = getCurrentTimestamp();
        const prefix = isManualSave ? "" : "AUTO_";
        a.href = url;
        a.download = `${prefix}ChipShopSave_${timestamp}.txt`;
        a.style.display = 'none';

        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        a.remove();
    }
}


function getCurrentTimestamp() {
    const now = new Date();
    return `${now.getFullYear()}_${padZero(now.getMonth() + 1)}_${padZero(now.getDate())}_${padZero(now.getHours())}_${padZero(now.getMinutes())}_${padZero(now.getSeconds())}`;
}

function padZero(num) {
    return num.toString().padStart(2, '0');
}

export function copySaveStringToClipBoard() {
    const textArea = getElements().loadSaveGameStringTextArea;
    textArea.select();
    textArea.setSelectionRange(0, 99999);

    try {
        navigator.clipboard.writeText(textArea.value)
            .then(() => {
                alert('Text copied to clipboard!');
            })
            .catch(err => {
                alert(err);
            })
            .finally(() => {
                textArea.setSelectionRange(0, 0);
            })
    } catch (err) {
        alert(err);
    }
}

export function loadGameOption() {
    getElements().loadSaveGameStringTextArea.readOnly = false;
    document.querySelector('.save-load-header').innerHTML = `${localize('headerStringLoad', getLanguage())}`;
    document.getElementById('loadStringButton').classList.remove('d-none');
    document.getElementById('copyButtonSavePopup').classList.add('d-none');
    getElements().saveLoadPopup.classList.remove('d-none');
    document.getElementById('overlay').classList.remove('d-none');
    getElements().loadSaveGameStringTextArea.value = "";
    getElements().loadSaveGameStringTextArea.placeholder = `${localize('textAreaLabel', getLanguage())}`;
}

export function loadGame(string) {
    if (!string) {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.txt';

            input.addEventListener('change', (event) => {
                handleFileSelectAndInitialiseLoadedGame(event, false, null)
                    .then(() => {
                        resolve();
                    })
                    .catch(reject);
            });

            input.click();
        });
    } else {
        const textArea = document.getElementById('loadSaveGameStringTextArea');
        if (textArea) {
            const string = {
                target: {
                    result: textArea.value
                }
            };
            return handleFileSelectAndInitialiseLoadedGame(null, true, string);
        } else {
            return Promise.reject("Text area not found.");
        }
    }
}

function handleFileSelectAndInitialiseLoadedGame(event, stringLoad, string) {
    return new Promise((resolve, reject) => {
        const processGameData = (compressed) => {
            try {
                // Validate the compressed string before processing
                if (!validateSaveString(compressed)) {
                    alert('Invalid game data string. Please check and try again.');
                    return reject('Invalid game data string');
                }

                let decompressedJson = LZString.decompressFromEncodedURIComponent(compressed);
                let gameState = JSON.parse(decompressedJson);

                getElements().overlay.classList.add('d-none');

                initialiseLoadedGame(gameState).then(() => {
                    setLanguageChangedFlag(true);
                    checkForLanguageChange();
                    alert('Game loaded successfully!');
                    resolve();
                }).catch(error => {
                    console.error('Error initializing game:', error);
                    alert('Error initializing game. Please make sure the data is correct.');
                    reject(error);
                });

            } catch (error) {
                console.error('Error loading game:', error);
                alert('Error loading game. Please make sure the file contains valid game data.');
                reject(error);
            }
        };

        if (stringLoad) {
            try {
                processGameData(string.target.result);
            } catch (error) {
                console.error('Error processing string:', error);
                alert('Error processing string. Please make sure the string is valid.');
                reject(error);
            }
        } else {
            const file = event.target.files[0];
            if (!file) {
                return reject('No file selected');
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    processGameData(e.target.result);
                } catch (error) {
                    console.error('Error reading file:', error);
                    alert('Error reading file. Please make sure the file contains valid game data.');
                    reject(error);
                }
            };

            reader.onerror = () => {
                reject('Error reading file');
            };

            reader.readAsText(file);
        }
    });
}

function validateSaveString(compressed) {
    let decompressedJson = LZString.decompressFromEncodedURIComponent(compressed);
    JSON.parse(decompressedJson);
    return decompressedJson !== null;
}

async function initialiseLoadedGame(gameState) {    
    await restoreGameStatus(gameState);
}

export function checkForLanguageChange() {
    if (getLanguageChangedFlag()) {
        handleLanguageChange(getLanguage());
    }
    setLanguageChangedFlag(false);
}