// themes.js
// -----------------------------------------------------------------------------
// The six looks the simulator can wear, and the controls for picking between
// them.
//
// A theme is nothing more than a value on <body data-theme="...">. Everything
// else - colour, corner rounding, borders, shadows, spacing, the font the
// chrome is set in, how the menu lays its panels out - is a block of custom
// properties in styles.css keyed off that one attribute. Nothing in here
// touches a colour directly, so a theme can be retuned or a seventh one added
// by writing CSS and adding a line to the list below.
//
// The choice is remembered in localStorage, which is wrapped in a try because
// a page opened straight off disk in some browsers refuses to give it up.
// -----------------------------------------------------------------------------

const STORAGE_KEY = 'sandSimulator.theme';

// The swatch colours are only for the three dots on each button in the picker.
// They are a summary of the theme, not its definition - the real values live in
// styles.css, and these are here so the picker can be drawn before any theme
// has been applied.
export const THEMES = [
    {
        id: 'workshop',
        name: 'Workshop',
        blurb: 'Near black, one blue accent, hard edges',
        swatch: ['#0b0d12', '#5b8cff', '#e6eaf2']
    },
    {
        id: 'ember',
        name: 'Ember',
        blurb: 'Warm charcoal and firelight, softly rounded',
        swatch: ['#17110d', '#ff8a3d', '#f6e8dc']
    },
    {
        id: 'paper',
        name: 'Paper',
        blurb: 'Light, printed, thin rules and no shadows',
        swatch: ['#f2efe7', '#1f6feb', '#23211c']
    },
    {
        id: 'terminal',
        name: 'Terminal',
        blurb: 'Phosphor green on black, square, all monospace',
        swatch: ['#04070a', '#3df07d', '#bff5d3']
    },
    {
        id: 'lagoon',
        name: 'Lagoon',
        blurb: 'Deep teal, glassy panels, very round',
        swatch: ['#06191e', '#2fd8c5', '#dcf4f1']
    },
    {
        id: 'dune',
        name: 'Dune',
        blurb: 'Warm sand and clay, borderless, soft shadows',
        swatch: ['#ece0cd', '#b4562a', '#3b2d21']
    }
];

const DEFAULT_THEME = THEMES[0].id;
let current = DEFAULT_THEME;

export function getTheme() { return current; }

export function applyTheme(id) {
    const theme = THEMES.find(t => t.id === id) || THEMES[0];
    current = theme.id;
    document.body.dataset.theme = theme.id;
    try {
        localStorage.setItem(STORAGE_KEY, theme.id);
    } catch (error) {
        // Nowhere to remember it. The theme still applies for this session.
    }
    refreshControls();
}

// The theme the page should come up in: whatever was picked last time, or the
// default when there is nothing to go on.
export function loadSavedTheme() {
    let saved = null;
    try {
        saved = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
        saved = null;
    }
    applyTheme(THEMES.some(t => t.id === saved) ? saved : DEFAULT_THEME);
}

// ---------------------------------------------------------------- the picker

let swatchHost = null;
let selectHost = null;

// The row of swatch buttons on the menu screen. Each is three dots - the
// background, the accent and the text colour - which says more about what a
// theme looks like than its name does.
export function buildThemeSwatches(container) {
    swatchHost = container;
    container.innerHTML = '';

    for (const theme of THEMES) {
        const button = document.createElement('button');
        button.className = 'theme-swatch';
        button.type = 'button';
        button.dataset.themeId = theme.id;
        button.title = theme.blurb;
        button.setAttribute('aria-label', `${theme.name} theme`);

        const dots = document.createElement('span');
        dots.className = 'theme-dots';
        for (const colour of theme.swatch) {
            const dot = document.createElement('span');
            dot.className = 'theme-dot';
            dot.style.backgroundColor = colour;
            dots.appendChild(dot);
        }

        const label = document.createElement('span');
        label.className = 'theme-swatch-name';
        label.textContent = theme.name;

        button.appendChild(dots);
        button.appendChild(label);
        button.addEventListener('click', () => applyTheme(theme.id));
        container.appendChild(button);
    }

    refreshControls();
}

// The same choice again as a plain dropdown in the toolbar, for changing it
// without going back out to the menu.
export function buildThemeSelect(select) {
    selectHost = select;
    select.innerHTML = '';

    for (const theme of THEMES) {
        const option = document.createElement('option');
        option.value = theme.id;
        option.textContent = theme.name;
        select.appendChild(option);
    }

    select.addEventListener('change', () => applyTheme(select.value));
    refreshControls();
}

// Both controls show the same thing, so whichever one was used, the other one
// has to be brought into line.
function refreshControls() {
    if (swatchHost) {
        swatchHost.querySelectorAll('.theme-swatch').forEach(button => {
            button.classList.toggle('selected', button.dataset.themeId === current);
        });
    }
    if (selectHost && selectHost.value !== current) selectHost.value = current;
}
