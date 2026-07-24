const gifs = [
    "https://miro.medium.com/v2/resize:fit:1200/1*cwSxR2y-yvMNOyvOKfdC6g.gif",
    "https://miro.medium.com/v2/resize:fit:640/format:webp/1*7HghG6fedxWaJZT42Fsz9Q.gif",
    "https://miro.medium.com/v2/resize:fit:640/format:webp/1*wY7I14m4_31XD77H_4U8fw.gif",
    "https://miro.medium.com/v2/resize:fit:640/format:webp/1*UWZuqTZldYmuG10TXaxVkg.gif",
    "https://miro.medium.com/v2/resize:fit:640/format:webp/1*5JgGT7LZzKLhoDpb0nvQIQ.gif",
    "https://miro.medium.com/v2/resize:fit:640/format:webp/1*ZOzmUKD2sLRaId-nL0koKA.gif",
    "https://miro.medium.com/v2/resize:fit:640/format:webp/1*qbftZl4cP_al1oB2dn01ZA.gif"
];
 
const sheetCsvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTHGQy-jlVIqKK8eNY5KAyKmalHnluD0Dbznly-mCn_e3loE9poQD46AkqKOAZYH5BcZ4Rs50Q9pZzJ/pub?output=csv";
const gasWebAppUrl = "https://script.google.com/macros/s/AKfycbyfYCRLFSQmWBH40psZiZUA7bK9VjibZu5UgAwI8OXqRzZB1bfeo2ieLJiP9KVx3HfMrQ/exec";


let userScripts = [];
const driveNoteContentCache = new Map();
const driveNoteFetchedAt = new Map();

let isLoadingUserScripts = false;
let hasLoadedUserScriptsThisPage = false;
let userScriptLoadPromise = null;
let isPreloadingDriveNotes = false;
let lastDriveSyncAt = 0;

const DRIVE_NOTE_PRELOAD_CONCURRENCY = 5;

const DRIVE_NOTE_CACHE_TTL = 60000; // 60 seconds
let currentSicilianGridLayout = null; // For second chess puzzle

let userScriptBeingEdited = null; // Drive note currently unlocked for editing
let userScriptBeingViewed = null; // Drive note currently loaded in Swap View
let isDriveNoteEditMode = false; // false = view-only, true = editable

let currentSnippetBeingEdited = null; // Track which local note is loaded in the workspace
const OFFLINE_DATABASE_STORAGE_KEY = 'mangaOfflineDatabase';

let devToolsUnlocked = false;
let devToolsRows = [];
let chessLockContext = { type: null, payload: null };
// =================================
// CHESS LOCK — LOCAL ANTI-SPAM
// =================================

const CHESS_LOCK_STORAGE_KEY = 'mangaChessLockSecurity';
const CHESS_LOCK_MAX_FAILURES = 3;
const CHESS_LOCK_DURATION_MS = 24 * 60 * 60 * 1000;

function getChessLockState() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(CHESS_LOCK_STORAGE_KEY)
        );

        return {
            failedAttempts: Number(saved?.failedAttempts) || 0,
            lockedUntil: Number(saved?.lockedUntil) || 0
        };
    } catch (error) {
        return {
            failedAttempts: 0,
            lockedUntil: 0
        };
    }
}

function saveChessLockState(state) {
    localStorage.setItem(
        CHESS_LOCK_STORAGE_KEY,
        JSON.stringify(state)
    );
}

function formatChessLockTime(milliseconds) {
    const totalMinutes = Math.max(
        1,
        Math.ceil(milliseconds / 60000)
    );

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours && minutes) {
        return `${hours}h ${minutes}m`;
    }

    if (hours) {
        return `${hours}h`;
    }

    return `${minutes}m`;
}

function getChessLockoutStatus() {
    const state = getChessLockState();
    const now = Date.now();

    if (state.lockedUntil > now) {
        return {
            locked: true,
            remainingMs: state.lockedUntil - now
        };
    }

    // Remove expired lock and failed attempts.
    if (state.lockedUntil > 0) {
        localStorage.removeItem(CHESS_LOCK_STORAGE_KEY);
    }

    return {
        locked: false,
        remainingMs: 0
    };
}

function canOpenChessLock() {
    const status = getChessLockoutStatus();

    if (!status.locked) {
        return true;
    }

    showToast(
        `Forbidden for ${formatChessLockTime(status.remainingMs)}.`
    );

    return false;
}

function registerWrongChessMove() {
    const status = getChessLockoutStatus();

    if (status.locked) {
        return {
            locked: true,
            remainingAttempts: 0
        };
    }

    const state = getChessLockState();
    const failedAttempts = state.failedAttempts + 1;

    if (failedAttempts >= CHESS_LOCK_MAX_FAILURES) {
        saveChessLockState({
            failedAttempts,
            lockedUntil: Date.now() + CHESS_LOCK_DURATION_MS
        });

        return {
            locked: true,
            remainingAttempts: 0
        };
    }

    saveChessLockState({
        failedAttempts,
        lockedUntil: 0
    });

    return {
        locked: false,
        remainingAttempts:
            CHESS_LOCK_MAX_FAILURES - failedAttempts
    };
}

function resetChessLockFailures() {
    localStorage.removeItem(CHESS_LOCK_STORAGE_KEY);
}

function handleWrongChessMove(resetBoardFunction) {
    const result = registerWrongChessMove();

    currentLondonStep = 0;
    selectedPieceCoord = null;

    if (typeof resetBoardFunction === 'function') {
        resetBoardFunction();
    }

    if (result.locked) {
        const indicator =
            document.getElementById('chessStepIndicator');

        if (indicator) {
            indicator.innerText =
                'DEFENSE MATRIX LOCKED: 24 HOURS';
        }

        showToast(
            '3 wrong moves detected. Chess access is locked for 24 hours.'
        );

        closeChessModal();
        changeToRandomGif();
        return;
    }

    const indicator =
        document.getElementById('chessStepIndicator');

    if (indicator) {
        indicator.innerText =
            `SECURITY RESET · ${result.remainingAttempts} ATTEMPT${
                result.remainingAttempts === 1 ? '' : 'S'
            } LEFT`;
    }

    showToast(
        `BLUNDER! ${result.remainingAttempts} attempt${
            result.remainingAttempts === 1 ? '' : 's'
        } left.`
    );

    changeToRandomGif();
}

let googleSheetData = []; 
let predictionCards = [];
let predictionTimeConfig = {};
let predictionTimeDraftConfig = {};
let predictionTimeEditMode = false;

const PREDICTION_DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
let focusedSuggestionIndex = -1; 
let isArchiveOpen = false;

function launchImgNoteGAS() {
    window.open(
        "https://script.google.com/macros/s/AKfycbzsPGwL-uDIwOQ84ytcHVOm2wMZjR5fj_51EVsjKNn7lvyM_Z0KNK4rKigPs58CAqmPkA/exec",
        "_blank"
    );
}
let offlineDatabase = {
    mainGasLink: "https://tinyurl.com/Noro11",
    primaryGAS: "",
    bottomSnippets: [
        {
            id: "local-sticky-note",
            title: "LOCAL STICKY NOTE",
            content: "",
            isSticky: true
        }
    ]
};

function ensureLocalStickyNote() {
    if (!offlineDatabase.bottomSnippets) {
        offlineDatabase.bottomSnippets = [];
    }

    const exists = offlineDatabase.bottomSnippets.some(
        item => item.id === "local-sticky-note"
    );

    if (!exists) {
        offlineDatabase.bottomSnippets.unshift({
            id: "local-sticky-note",
            title: "LOCAL STICKY NOTE",
            content: "",
            isSticky: true
        });

        persistOfflineDatabase();
    }
}

const softMangaColors = [
    '#f4f3ef', '#e3ebd9', '#e5e1d5', '#ebdccb', '#d6e2e6', '#ebd8da'
];

let activeDeleteTargetId = null;
let currentLondonStep = 0; 
let selectedPieceCoord = null; 
let chessBoardState = {};
let stickyNoteAutosaveTimer = null;

function getActiveStickyNote() {
    if (!currentSnippetBeingEdited || userScriptBeingViewed) return null;

    return offlineDatabase.bottomSnippets.find(item =>
        String(item.id) === String(currentSnippetBeingEdited) &&
        (item.isSticky || item.id === "local-sticky-note")
    );
}        

function handleStickyNoteAutosave() {
    const textarea = document.getElementById('primaryGasArea');
    const stickyNote = getActiveStickyNote();

    if (!textarea || !stickyNote) return;

    stickyNote.content = textarea.value;

    clearTimeout(stickyNoteAutosaveTimer);

    stickyNoteAutosaveTimer = setTimeout(() => {
        persistOfflineDatabase();
    }, 250);
}

function resetChessBoardState() {
    chessBoardState = {
        'c4': '',    'd4': '',    'e4': '',
        'c3': '',    'd3': '♙',  'e3': '',    
        'c1': '♗',  'd1': '',    'f1': '♘'    
    };
}

function getRandomizedGridLayout() {
    const baseLayout = [
        { coord: 'c4', isDark: false }, { coord: 'd4', isDark: true },  { coord: 'e4', isDark: false },
        { coord: 'c3', isDark: true },  { coord: 'd3', isDark: false }, { coord: 'e3', isDark: true },
        { coord: 'c1', isDark: false }, { coord: 'd1', isDark: true },  { coord: 'f1', isDark: false }
    ];
    
    // Fisher-Yates shuffle
    for (let i = baseLayout.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [baseLayout[i], baseLayout[j]] = [baseLayout[j], baseLayout[i]];
    }
    
    return baseLayout;
}

function getRandomizedSicilianLayout() {
    const baseLayout = [
        { coord: 'e2', isDark: false }, { coord: 'e4', isDark: true },  { coord: 'd4', isDark: false },
        { coord: 'c7', isDark: true },  { coord: 'c5', isDark: false }, { coord: 'd5', isDark: true },
        { coord: 'b8', isDark: false }, { coord: 'c6', isDark: true },  { coord: 'b6', isDark: false }
    ];

    for (let i = baseLayout.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [baseLayout[i], baseLayout[j]] = [baseLayout[j], baseLayout[i]];
    }

    return baseLayout;
}

function resetSicilianBoardState() {
    chessBoardState = {
        'e2': '♙',
        'e4': '',
        'c7': '♟',
        'c5': '',
        'b8': '♞',
        'c6': '',
        'd4': '',
        'd5': '',
        'b6': ''
    };
}

function openUserScriptChessLock(context, promptText) {
    if (!canOpenChessLock()) return;

    chessLockContext = context;
    currentLondonStep = 0;
    selectedPieceCoord = null;
    resetSicilianBoardState();
    currentSicilianGridLayout = getRandomizedSicilianLayout(); // Shuffle once
    renderSicilianChessBoard();
    document.getElementById('chessStepIndicator').innerText = "INITIATE MOVE 1";
    const promptEl = document.getElementById('chessLockPrompt');
    if (promptEl) promptEl.innerText = promptText;
    document.getElementById('chessAuthModal').classList.add('open');
}

function renderSicilianChessBoard() {
    const boardContainer = document.getElementById('mangaChessBoard');
    if (!boardContainer) return;
    boardContainer.innerHTML = '';
    
    const gridLayout = currentSicilianGridLayout;
    
    gridLayout.forEach(tile => {
        const square = document.createElement('div');
        const piece = chessBoardState[tile.coord] || '';
        let squareClass = `chess-square ${tile.isDark ? 'dark-tile' : ''}`;
        if (selectedPieceCoord === tile.coord) squareClass += ' selected-piece-highlight'; 
        
        square.className = squareClass;
        square.innerHTML = `${piece} <span class="square-coord">${tile.coord}</span>`;
        square.onclick = () => handleSicilianSquareClick(tile.coord);
        boardContainer.appendChild(square);
    });
}

function handleSicilianSquareClick(clickedCoord) {
        if (!canOpenChessLock()) {
        closeChessModal();
        return;
    }
    const clickedPiece = chessBoardState[clickedCoord];

    if (selectedPieceCoord === clickedCoord) {
        selectedPieceCoord = null;
        renderSicilianChessBoard();
        return;
    }

    if (clickedPiece !== '') {
        selectedPieceCoord = clickedCoord;
        renderSicilianChessBoard();
        return;
    }

    if (selectedPieceCoord) {
        const movingPiece = chessBoardState[selectedPieceCoord];

        if (
            currentLondonStep === 0 &&
            movingPiece === '♙' &&
            selectedPieceCoord === 'e2' &&
            clickedCoord === 'e4'
        ) {
            executeMove(selectedPieceCoord, clickedCoord);
            currentLondonStep = 1;
document.getElementById('chessStepIndicator').innerText =
    "SEQUENCE LOCK: STAGE 2 ACTIVE";
showToast("Stage 1 accepted...");
        }

        else if (
            currentLondonStep === 1 &&
            movingPiece === '♟' &&
            selectedPieceCoord === 'c7' &&
            clickedCoord === 'c5'
        ) {
            executeMove(selectedPieceCoord, clickedCoord);
            currentLondonStep = 2;
            document.getElementById('chessStepIndicator').innerText =
    "SEQUENCE LOCK: STAGE 3 ACTIVE";
showToast("Stage 2 accepted...");
        }

        else if (
            currentLondonStep === 2 &&
            movingPiece === '♞' &&
            selectedPieceCoord === 'b8' &&
            clickedCoord === 'c6'
        ) {
            executeMove(selectedPieceCoord, clickedCoord);
            executeChessSuccess();
        }

        else {
    handleWrongChessMove(() => {
        resetSicilianBoardState();
        renderSicilianChessBoard();
    });
}
    }
}

async function syncGoogleSheetData() {
    addSystemLog("Connecting to Google Sheets cloud matrix...");
    try {
        const cacheBuster = `&_cb=${Date.now()}`;
        const response = await fetch(sheetCsvUrl + cacheBuster);
        if (!response.ok) throw new Error("Cloud stream fetch rejected.");
        const rawCsvText = await response.text();
        
        parseCsvStrictAB(rawCsvText);
        addSystemLog(`Sync completed. Loaded ${googleSheetData.length} records into lookup index.`);
        showToast(`Sync finished! Loaded ${googleSheetData.length} records.`);
        
if (isArchiveOpen) renderArchiveContainer();
renderPredictionCards(getVisiblePredictionCards());
    } catch (error) {
        addSystemLog(`Cloud link error: ${error.message}`);
        showToast("Error pulling cloud sheets registry.");
    }
}

function parseCsvStrictAB(text) {
    googleSheetData = [];
    predictionCards = [];

    let lines = [];
    let row = [""];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        let c = text[i];
        let next = text[i + 1];

        if (c === '"') {
            if (inQuotes && next === '"') {
                row[row.length - 1] += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            row.push("");
        } else if ((c === '\r' || c === '\n') && !inQuotes) {
            if (c === '\r' && next === '\n') i++;
            lines.push(row);
            row = [""];
        } else {
            row[row.length - 1] += c;
        }
    }

    if (row.length > 1 || row[0] !== "") {
        lines.push(row);
    }

    // Search Engine: A2:B
    for (let i = 1; i < lines.length; i++) {
        let cols = lines[i];

        if (cols.length >= 2) {
            let colA = (cols[0] || '').trim();
            let colB = (cols[1] || '').trim();

            if (colA) {
                googleSheetData.push({
                    key: colA,
                    payload: colB
                });
            }
        }
    }

    // Prediction Cards: E3:F
    for (let i = 2; i < lines.length; i++) {
        let cols = lines[i];

        let title = (cols[4] || '').trim();
        let content = (cols[5] || '').trim();

        if (title || content) {
            predictionCards.push({
                id: `prediction-${i}`,
                title: title || 'Untitled Prediction',
                content: content || 'No prediction content provided.'
            });
        }
    }
}



function renderPredictionCards(cardsToRender = predictionCards) {
    
    const grid = document.getElementById('predictionCardGrid');
    if (!grid) return;

    grid.innerHTML = '';

    if (!cardsToRender.length) {
        grid.innerHTML = `
            <div class="prediction-empty-state">
                No prediction cards found. Pull fresh data or change your filter.
            </div>
        `;
        return;
    }
    cardsToRender = sortPredictionCardsByTime(cardsToRender);

    cardsToRender.forEach((card, index) => {
        const cardEl = document.createElement('div');
        const randomBg = softMangaColors[index % softMangaColors.length] || '#f4f3ef';
        const randomTilt = (Math.random() * 3 - 1.5).toFixed(2);
        const isActive = isPredictionCardActive(card);

        cardEl.className = `prediction-card ${isActive ? 'prediction-card-active' : 'prediction-card-expired'} ${predictionTimeEditMode ? 'prediction-card-editing' : ''}`;
        cardEl.style.background = randomBg;
        cardEl.style.setProperty('--card-tilt', `${randomTilt}deg`);
        cardEl.style.transform = `rotate(${randomTilt}deg)`;

        cardEl.innerHTML = `
            <div class="prediction-card-pin">●</div>

            <div class="prediction-card-timer ${isActive ? 'timer-live' : 'timer-dead'}">
                ${isActive ? 'LIVE' : 'BURNT OUT'} · ${escapeHtml(getPredictionTimerLabel(card))}
            </div>

            ${renderPredictionTimerEditor(card)}

            <div class="prediction-card-topline">
                <h4 class="prediction-card-title">${escapeHtml(card.title)}</h4>
                <button
                    class="manga-btn prediction-copy-btn"
                    onclick='copyPredictionCardContent(${JSON.stringify(card.id)})'
                    ${isActive ? '' : 'disabled'}
                >
                    Copy
                </button>
            </div>

            <div class="prediction-card-content">${escapeHtml(card.content)}</div>
        `;

        grid.appendChild(cardEl);
    });
}


function getVisiblePredictionCards() {
    const input = document.getElementById('predictionSearchInput');
    const query = input ? input.value.trim().toLowerCase() : '';

    if (!query) return predictionCards;

    return predictionCards.filter(card => {
        const title = String(card.title || '').toLowerCase();
        const content = String(card.content || '').toLowerCase();

        return title.includes(query) || content.includes(query);
    });
}

function queryPredictionCards() {
    const matches = getVisiblePredictionCards();
    renderPredictionCards(matches);
}

function copyPredictionCardContent(cardId) {
    const card = predictionCards.find(item => item.id === cardId);

    if (!card) {
        showToast('Prediction card not found.');
        return;
    }

    if (!isPredictionCardActive(card)) {
        showToast('This card is burnt out.');
        return;
    }

    navigator.clipboard.writeText(card.content || '')
        .then(() => showToast(`"${card.title}" copied.`))
        .catch(() => showToast('Copy failed.'));
}

function copyVisiblePredictionCards() {
    const visibleCards = getVisiblePredictionCards()
        .filter(card => isPredictionCardActive(card));

    if (!visibleCards.length) {
        showToast('No live prediction cards to copy.');
        return;
    }

    const text = visibleCards
        .map(card => card.content || '')
        .join('\n\n---\n\n');

    navigator.clipboard.writeText(text)
        .then(() => showToast(`Copied ${visibleCards.length} live cards.`))
        .catch(() => showToast('Copy failed.'));
}

function clearPredictionSearch() {
    const input = document.getElementById('predictionSearchInput');

    if (input) input.value = '';

    renderPredictionCards(predictionCards);
}


function clonePredictionTimeConfig(config) {
    return JSON.parse(JSON.stringify(config || {}));
}

async function loadPredictionTimeConfig() {
    try {
        const response = await fetch(`${gasWebAppUrl}?api=predictionTimes&t=${Date.now()}`, {
            cache: 'no-store'
        });

        const result = await response.json();

        if (!result.ok) {
            throw new Error(result.message || 'Could not load prediction timer config.');
        }

        predictionTimeConfig = result.config && typeof result.config === 'object'
            ? result.config
            : {};

        predictionTimeDraftConfig = clonePredictionTimeConfig(predictionTimeConfig);

        renderPredictionCards(getVisiblePredictionCards());

        addSystemLog('Prediction timer config loaded.');

    } catch (err) {
        predictionTimeConfig = {};
        predictionTimeDraftConfig = {};
        addSystemLog(`Prediction timer load error: ${err.message}`);
        showToast('Could not load prediction timers.');
    }
}

async function savePredictionTimeConfigToDrive() {
    try {
        const response = await fetch(gasWebAppUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'savePredictionTimes',
                config: predictionTimeDraftConfig
            })
        });

        const result = await response.json();

        if (!result.ok) {
            throw new Error(result.message || 'Could not save prediction timers.');
        }

        predictionTimeConfig = clonePredictionTimeConfig(predictionTimeDraftConfig);
        predictionTimeEditMode = false;

        updatePredictionTimeToolbar();
        renderPredictionCards(getVisiblePredictionCards());

        showToast('Prediction timers saved.');
        addSystemLog('Prediction timers saved to Drive.');

    } catch (err) {
        showToast('Timer save failed.');
        addSystemLog(`Prediction timer save error: ${err.message}`);
    }
}

function requestPredictionTimeAccess() {
    openUserScriptChessLock(
        { type: 'predictionTimeEdit' },
        ''
    );
}

function enablePredictionTimeEditMode() {
    predictionTimeDraftConfig = clonePredictionTimeConfig(predictionTimeConfig);
    predictionTimeEditMode = true;

    updatePredictionTimeToolbar();
    renderPredictionCards(getVisiblePredictionCards());

    showToast('Prediction timer edit mode enabled.');
}

function cancelPredictionTimeEdit() {
    predictionTimeDraftConfig = clonePredictionTimeConfig(predictionTimeConfig);
    predictionTimeEditMode = false;

    updatePredictionTimeToolbar();
    renderPredictionCards(getVisiblePredictionCards());

    showToast('Prediction timer edit cancelled.');
}

function updatePredictionTimeToolbar() {
    const setButton = document.getElementById('predictionSetTimeButton');
    const saveButton = document.getElementById('predictionSaveTimeButton');
    const cancelButton = document.getElementById('predictionCancelTimeButton');

    if (setButton) setButton.style.display = predictionTimeEditMode ? 'none' : 'inline-block';
    if (saveButton) saveButton.style.display = predictionTimeEditMode ? 'inline-block' : 'none';
    if (cancelButton) cancelButton.style.display = predictionTimeEditMode ? 'inline-block' : 'none';
}


function querySheetMatrix() {
    const searchInput = document.getElementById('sheetKeySearch');
    const searchKey = searchInput.value.trim().toUpperCase();
    const payloadOutput = document.getElementById('sheetPayloadArea');
    const suggestionsBox = document.getElementById('searchSuggestions');
    const actionsHeader = document.getElementById('searchActionsHeader');
    
    if (isArchiveOpen) {
        document.getElementById('sheetArchiveArea').style.display = "none";
        isArchiveOpen = false;
    }

    focusedSuggestionIndex = -1; 

    if (!searchKey) {
        clearAndHideSearch();
        return;
    }
    
    const filteredMatches = googleSheetData.filter(row => row.key.toUpperCase().includes(searchKey));
    
    if (filteredMatches.length > 0) {
        suggestionsBox.innerHTML = "";
        suggestionsBox.style.display = "block";
        
        filteredMatches.slice(0, 10).forEach((match, idx) => {
            const rowOption = document.createElement('div');
            rowOption.className = "suggestion-item";
            rowOption.setAttribute("data-index", idx);
            rowOption.style.padding = "8px 12px";
            rowOption.style.cursor = "pointer";
            rowOption.style.borderBottom = "1px solid var(--ink-black)";
            rowOption.style.fontSize = "13px";
            rowOption.style.fontWeight = "bold";
            rowOption.style.background = "var(--bg-paper)";
            rowOption.innerText = match.key;
            
            rowOption.onmouseover = () => { highlightSuggestion(idx); };
            rowOption.onclick = () => { selectFinalMatch(match); };
            suggestionsBox.appendChild(rowOption);
        });
    } else {
        suggestionsBox.style.display = "none";
        payloadOutput.style.display = "block";
        actionsHeader.style.display = "flex";
        document.getElementById('searchButtonGroup').style.display = "none";
        payloadOutput.value = "❌ No matching data profiles located inside live sheet arrays.";
    }
}

function highlightSuggestion(index) {
    const suggestionsBox = document.getElementById('searchSuggestions');
    const items = suggestionsBox.querySelectorAll('.suggestion-item');
    
    items.forEach(item => {
        item.style.background = "var(--bg-paper)";
        item.style.color = "var(--ink-black)";
    });

    focusedSuggestionIndex = index;
    if (index >= 0 && index < items.length) {
        items[index].style.background = "var(--ink-black)";
        items[index].style.color = "var(--bg-paper)";
        items[index].scrollIntoView({ block: 'nearest' });
    }
}

function selectFinalMatch(match) {
    const searchInput = document.getElementById('sheetKeySearch');
    const payloadOutput = document.getElementById('sheetPayloadArea');
    const suggestionsBox = document.getElementById('searchSuggestions');
    const actionsHeader = document.getElementById('searchActionsHeader');
    const buttonGroup = document.getElementById('searchButtonGroup');

    searchInput.value = match.key;
    payloadOutput.value = match.payload;
    
    suggestionsBox.style.display = "none";
    payloadOutput.style.display = "block"; 
    actionsHeader.style.display = "flex";    
    buttonGroup.style.display = "flex";    

    saveToSearchHistory(match.key); // 🌟 ADD THIS LINE HERE to save manual selections
}

function clearAndHideSearch() {
    document.getElementById('sheetPayloadArea').value = "";
    document.getElementById('sheetPayloadArea').style.display = "none";
    document.getElementById('searchActionsHeader').style.display = "none";
    document.getElementById('searchSuggestions').style.display = "none";
    document.getElementById('searchSuggestions').innerHTML = "";
}

function copySearchPayload() {
    const payloadOutput = document.getElementById('sheetPayloadArea');
    const searchInput = document.getElementById('sheetKeySearch');

    if (
        !payloadOutput ||
        !payloadOutput.value ||
        payloadOutput.value.startsWith('❌')
    ) {
        showToast('Error: No valid content loaded to copy.');
        return;
    }

    const textToCopy = payloadOutput.value;

    navigator.clipboard.writeText(textToCopy)
        .then(() => {
            const title = searchInput?.value?.trim() || 'Grimoire entry';

            showToast(`"${title}" copied.`);
            playSearchCopyDisappear(payloadOutput, searchInput);
        })
        .catch(() => {
            showToast('Copy failed.');
        });
}

function playSearchCopyDisappear(payloadOutput, searchInput) {
    if (!payloadOutput) return;

    payloadOutput.classList.remove('search-copy-disappear');

    clearTimeout(payloadOutput._searchCopyFallbackTimer);

    // Force the browser to restart the animation.
    void payloadOutput.offsetWidth;

    let hasFinished = false;

    const finishAnimation = () => {
        if (hasFinished) return;

        hasFinished = true;

        payloadOutput.classList.remove('search-copy-disappear');

        if (searchInput) {
            searchInput.value = '';
        }

        clearAndHideSearch();
    };

    payloadOutput.addEventListener(
        'animationend',
        finishAnimation,
        { once: true }
    );

    payloadOutput.classList.add('search-copy-disappear');

    // Safety fallback in case animationend does not fire.
    payloadOutput._searchCopyFallbackTimer = setTimeout(
        finishAnimation,
        600
    );
}

function injectPayloadToWorkspace() {
    const activePayload = document.getElementById('sheetPayloadArea').value;
    if (!activePayload || activePayload.startsWith("❌")) {
        showToast("Error: No data loaded to pull.");
        return;
    }
    offlineDatabase.primaryGAS = activePayload;
    document.getElementById('primaryGasArea').value = activePayload;
    showToast("Loaded description payload data to dashboard workspace console!");
    switchTab('dashboard');
}

// --- ARCHIVE VERTICAL COLUMN LIST BUILDER ---
function toggleArchiveView() {
    const archiveBox = document.getElementById('sheetArchiveArea');
    const searchInput = document.getElementById('sheetKeySearch');
    
    if (isArchiveOpen) {
        if (archiveBox) archiveBox.style.display = "none";
        isArchiveOpen = false;
    } else {
        if (searchInput) searchInput.value = ""; 
        
        // Run your layout hide logic safely
        if (typeof clearAndHideSearch === "function") {
            clearAndHideSearch();
        }
        
        renderArchiveContainer();
        if (archiveBox) {
            archiveBox.style.setProperty('display', 'flex', 'important');
        }
        isArchiveOpen = true;
    }
}

function renderArchiveContainer() {
    const archiveBox = document.getElementById('sheetArchiveArea');
    if (!archiveBox) return;

    if (googleSheetData.length === 0) {
        archiveBox.innerHTML = "<p style='font-size:14px; font-weight:bold; text-align:center; font-family:inherit;'>Archive empty. Pull fresh matrix.</p>";
        return;
    }

    // Force a wrapping horizontal flex grid that looks like comic panels
    archiveBox.style.setProperty('display', 'flex', 'important');
    archiveBox.style.setProperty('flex-direction', 'row', 'important');
    archiveBox.style.setProperty('flex-wrap', 'wrap', 'important');
    archiveBox.style.setProperty('gap', '16px', 'important');
    archiveBox.style.setProperty('padding', '20px 10px', 'important');
    archiveBox.style.setProperty('justify-content', 'flex-start', 'important');
    
    archiveBox.innerHTML = "";
    const totalItems = googleSheetData.length;

    googleSheetData.forEach((row, idx) => {
        const rowDiv = document.createElement('div');
        
        // 1. Structural Sizing (Uniform but spacious cards)
        rowDiv.style.boxSizing = "border-box";
        rowDiv.style.width = "calc(20% - 13px)"; // Exactly 5 cards per row (accounting for gaps)
        rowDiv.style.minWidth = "180px";        // Prevents them from getting too skinny on small screens
        rowDiv.style.height = "220px";          // Fixed matching height for all cards
        
        // 2. Manga Styling
        rowDiv.style.border = "4px solid var(--ink-black, #111)";
        rowDiv.style.background = softMangaColors[idx % softMangaColors.length] || "#fff";
        rowDiv.style.padding = "14px";
        rowDiv.style.cursor = "pointer";
        rowDiv.style.display = "flex";
        rowDiv.style.flexDirection = "column";
        rowDiv.style.position = "relative";
        rowDiv.style.transition = "transform 0.1s ease, box-shadow 0.1s ease";
        
        // Heavy, offset manga shadow
        rowDiv.style.boxShadow = "6px 6px 0px var(--ink-black, #111)";

        // 3. The "Beautifully Messy" Secret Sauce: Random micro-rotation!
        // This tilts each card randomly between -2.5 and +2.5 degrees so they look hand-placed
        const randomTilt = (Math.random() * 5 - 2.5).toFixed(2);
        rowDiv.style.transform = `rotate(${randomTilt}deg)`;

        // Highlight tags
        let timelineTag = "";
        if (idx === totalItems - 1) {
            timelineTag = "<span style='background:#f39c12; color:#000; font-size:9px; padding:2px 4px; border:2px solid #111; margin-bottom:4px; display:inline-block; font-weight:900;'>NEW</span>";
        }

        // 4. Content Mapping (Title -> Line -> Preserved Content)
        rowDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
                <div style="max-width: 75%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${timelineTag}
                    <strong style="font-size:15px; font-family:inherit; text-transform:uppercase; letter-spacing:-0.5px; display:block;">${row.key}</strong>
                </div>
                <span style="font-size:10px; font-weight:bold; opacity:0.6; font-family:inherit;">#${idx + 2}</span>
            </div>
            
            <!-- Manga separator line -->
            <hr style="border: none; border-top: 3px solid var(--ink-black, #111); margin: 4px 0 8px 0; padding:0;">
            
            <!-- Cell B Content: Preserves line breaks/formatting safely but hides massive overflows -->
            <div style="font-size:12px; font-family:inherit; color:#111; line-height:1.4; flex-grow:1; overflow:hidden; display:-webkit-box; -webkit-line-clamp:7; -webkit-box-orient:vertical; white-space:pre-wrap; word-break:break-word;">${row.payload}</div>
        `;

        // Interactive pop effect on hover
        rowDiv.onmouseenter = () => {
            rowDiv.style.transform = `rotate(${randomTilt}deg) translate(-2px, -2px)`;
            rowDiv.style.boxShadow = "8px 8px 0px var(--ink-black, #111)";
        };
        rowDiv.onmouseleave = () => {
            rowDiv.style.transform = `rotate(${randomTilt}deg)`;
            rowDiv.style.boxShadow = "6px 6px 0px var(--ink-black, #111)";
        };

// 5. Clean Action Interface (Brute-forces data display and completely kills suggestion items)
        rowDiv.onclick = (e) => {
            e.stopPropagation();
            
            // 1. Force the input value matching Cell A
            const searchInput = document.getElementById('sheetKeySearch');
            if (searchInput) {
                searchInput.value = row.key;
            }
            
            // 2. Direct DOM override: Force fill the text field and open the container panels instantly
            const payloadOutput = document.getElementById('sheetPayloadArea');
            const actionsHeader = document.getElementById('searchActionsHeader');
            const buttonGroup = document.getElementById('searchButtonGroup');

            if (payloadOutput && actionsHeader && buttonGroup) {
                payloadOutput.value = row.payload;       // Dumps cell B description text directly here
                payloadOutput.style.display = "block";    // Reveals the content panel
                actionsHeader.style.display = "flex";     // Reveals copy buttons container header
                buttonGroup.style.display = "flex";       // Reveals action items
            }
            
            // 3. Absolute execution kill on the dropdown box AND all its suggestion-items
            const suggestionsBox = document.getElementById('searchSuggestions');
            if (suggestionsBox) {
                suggestionsBox.innerHTML = "";            // Deletes all .suggestion-item nodes instantly
                suggestionsBox.style.setProperty('display', 'none', 'important'); // Blasts container out of sight
            }

            // 4. Wipe archive UI out of frame cleanly
            archiveBox.style.display = "none";
            isArchiveOpen = false;
            saveToSearchHistory(row.key);
        };

        archiveBox.appendChild(rowDiv);
    });
}

// --- ARROW KEY, ENTER & ALT+C KEYBIND MATRIX LISTENERS ---
document.addEventListener('keydown', function(e) {
if (e.altKey && (e.key === 'c' || e.key === 'C')) {
    e.preventDefault();

    const dashboardTab = document.getElementById('dashboardTab');
    const searchTab = document.getElementById('searchMenuTab');

    const dashboardVisible =
        dashboardTab &&
        window.getComputedStyle(dashboardTab).display !== 'none';

    const searchVisible =
        searchTab &&
        window.getComputedStyle(searchTab).display !== 'none';

    if (dashboardVisible) {
        copyTextAreaContent();
    } else if (searchVisible) {
        copySearchPayload();
    }

    return;
}

    const suggestionsBox = document.getElementById('searchSuggestions');
    if (!suggestionsBox || suggestionsBox.style.display === "none") return;

    const items = suggestionsBox.querySelectorAll('.suggestion-item');
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
        e.preventDefault();
        let nextIdx = focusedSuggestionIndex + 1;
        if (nextIdx >= items.length) nextIdx = 0;
        highlightSuggestion(nextIdx);
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        let prevIdx = focusedSuggestionIndex - 1;
        if (prevIdx < 0) prevIdx = items.length - 1;
        highlightSuggestion(prevIdx);
    } else if (e.key === "Enter" || e.key === "Tab") {
        if (focusedSuggestionIndex >= 0 && focusedSuggestionIndex < items.length) {
            e.preventDefault();
            const selectedText = items[focusedSuggestionIndex].innerText;
            const fullMatch = googleSheetData.find(row => row.key === selectedText);
            if (fullMatch) selectFinalMatch(fullMatch);
        }
    }
});

function handleDevToolsClick() {
    if (devToolsUnlocked) {
        switchTab('devTools');
    } else {
        requestDevToolsAccess();
    }
}

function requestDevToolsAccess() {
    openChessLock({ type: 'devtools' }, " ");
}

function deleteSnippet(id) {
    if (id === "local-sticky-note") {
        showToast("Local sticky note cannot be deleted.");
        return;
    }

    openChessLock({ type: 'delete', payload: id }, "Execute London Line to Authorize Deletion");
}

let currentChessGridLayout = null; // Add this as a global variable near the top with other chess vars

function openChessLock(context, promptText) {
    if (!canOpenChessLock()) return;

    chessLockContext = context;
    currentLondonStep = 0;
    selectedPieceCoord = null;
    resetChessBoardState();
    currentChessGridLayout = getRandomizedGridLayout(); // SHUFFLE ONCE HERE
    renderChessBoard();
    document.getElementById('chessStepIndicator').innerText = "INITIATE MOVE 1";
    const promptEl = document.getElementById('chessLockPrompt');
    if (promptEl) promptEl.innerText = promptText;
    document.getElementById('chessAuthModal').classList.add('open');
}

function renderChessBoard() {
    const boardContainer = document.getElementById('mangaChessBoard');
    if (!boardContainer) return;
    boardContainer.innerHTML = '';
    
const gridLayout = currentChessGridLayout;
    
    gridLayout.forEach(tile => {
        const square = document.createElement('div');
        const piece = chessBoardState[tile.coord] || '';
        let squareClass = `chess-square ${tile.isDark ? 'dark-tile' : ''}`;
        if (selectedPieceCoord === tile.coord) squareClass += ' selected-piece-highlight'; 
        
        square.className = squareClass;
        square.innerHTML = `${piece} <span class="square-coord">${tile.coord}</span>`;
        square.onclick = () => handleSquareClick(tile.coord);
        boardContainer.appendChild(square);
    });
}

function handleSquareClick(clickedCoord) {
    if (!canOpenChessLock()) {
        closeChessModal();
        return;
    }
    const clickedPiece = chessBoardState[clickedCoord];
    if (selectedPieceCoord === clickedCoord) { selectedPieceCoord = null; renderChessBoard(); return; }
    if (clickedPiece !== '') { selectedPieceCoord = clickedCoord; renderChessBoard(); return; }
    
    if (selectedPieceCoord) {
        const movingPiece = chessBoardState[selectedPieceCoord];
        if (currentLondonStep === 0 && movingPiece === '♙' && selectedPieceCoord === 'd3' && clickedCoord === 'd4') {
            executeMove(selectedPieceCoord, clickedCoord);
            currentLondonStep = 1;
            document.getElementById('chessStepIndicator').innerText = "LOCK STAGE 1 BREACHED: INITIATE MOVE 2";
            showToast("Move 1 accepted...");
        } 
        else if (currentLondonStep === 1 && movingPiece === '♗' && selectedPieceCoord === 'c1' && clickedCoord === 'e4') {
            executeMove(selectedPieceCoord, clickedCoord);
            currentLondonStep = 2;
            document.getElementById('chessStepIndicator').innerText = "LOCK STAGE 2 BREACHED: INITIATE MOVE 3";
            showToast("Move 2 accepted...");
        } 
        else if (currentLondonStep === 2 && movingPiece === '♘' && selectedPieceCoord === 'f1' && clickedCoord === 'e3') {
            executeMove(selectedPieceCoord, clickedCoord);
            executeChessSuccess();
        } 
        else {
    handleWrongChessMove(() => {
        resetChessBoardState();
        renderChessBoard();
    });
}
    }
}

function executeMove(fromCoord, toCoord) {
    chessBoardState[toCoord] = chessBoardState[fromCoord];
    chessBoardState[fromCoord] = '';
    selectedPieceCoord = null;

    if (
    chessLockContext.type === 'userScriptEdit' ||
    chessLockContext.type === 'userScriptDelete' ||
    chessLockContext.type === 'predictionTimeEdit'
) {
    renderSicilianChessBoard();
} else {
    renderChessBoard();
}
}

function executeChessSuccess() {
        if (!canOpenChessLock()) {
        closeChessModal();
        return;
    }
    resetChessLockFailures();

    if (chessLockContext.type === 'delete') {
        const targetItem = offlineDatabase.bottomSnippets.find(x => x.id === chessLockContext.payload);
        offlineDatabase.bottomSnippets = offlineDatabase.bottomSnippets.filter(x => x.id !== chessLockContext.payload);
        persistOfflineDatabase();
        renderPortal();
        showToast(`DESTRUCTION SUCCESS: Removed "${targetItem ? targetItem.title : 'Item'}"`);
    } else if (chessLockContext.type === 'devtools') {
        devToolsUnlocked = true;
        showToast("ACCESS GRANTED: Dev Tools unlocked.");
        switchTab('devTools');
        loadDevToolsData();
    } else if (chessLockContext.type === 'devRowDelete') {
        performDevRowDeletion(chessLockContext.payload);
    } else if (chessLockContext.type === 'userScriptEdit') {
        openUserScriptEditForm(chessLockContext.payload);
    } else if (chessLockContext.type === 'userScriptDelete') {
        performUserScriptDeletion(chessLockContext.payload);
    } else if (chessLockContext.type === 'predictionTimeEdit') {
    enablePredictionTimeEditMode();
}
    closeChessModal();
    changeToRandomGif();
}

async function loadUserScripts(options = {}) {
    const { silent = true, force = false } = options;

    // Pull once per page load.
    // Browser refresh resets this variable, so refresh still pulls again.
    if (hasLoadedUserScriptsThisPage && !force) {
        addSystemLog('Skipped userscript pull; already loaded this page.');
        return userScriptLoadPromise || Promise.resolve();
    }

    if (isLoadingUserScripts) {
        return userScriptLoadPromise || Promise.resolve();
    }

    isLoadingUserScripts = true;

    userScriptLoadPromise = (async () => {
        try {
            const response = await fetch(`${gasWebAppUrl}?api=userscripts&t=${Date.now()}`, {
                cache: 'no-store'
            });

            const result = await response.json();
            if (!result.ok) throw new Error(result.message);

            userScripts = Array.isArray(result.scripts) ? result.scripts : [];

            const liveIDs = new Set(userScripts.map(s => s.driveFileID));

            for (const cachedID of Array.from(driveNoteContentCache.keys())) {
                if (!liveIDs.has(cachedID)) {
                    driveNoteContentCache.delete(cachedID);
                }
            }

            if (userScriptBeingViewed && !liveIDs.has(userScriptBeingViewed)) {
                clearDriveNoteWorkspaceState();
                document.getElementById('primaryGasArea').value = offlineDatabase.primaryGAS;
                showToast('The opened Drive note no longer exists.');
            }

            renderPortal({ resetWorkspace: false });
            preloadDriveNoteContents({ silent: true });

            if (!silent) {
                showToast(`Synced ${userScripts.length} Drive notes.`);
            }

            addSystemLog(`Loaded ${userScripts.length} userscripts.`);
        } catch (err) {
            addSystemLog(`Error loading userscripts: ${err.message}`);

            if (!silent) {
                showToast("Error loading Drive notes");
            }
        } finally {
            hasLoadedUserScriptsThisPage = true;
            isLoadingUserScripts = false;
            userScriptLoadPromise = null;
        }
    })();

    return userScriptLoadPromise;
}


function ensureDriveNoteToolbar() {
    const textarea = document.getElementById('primaryGasArea');
    if (!textarea || !textarea.parentNode) return {};

    let toolbar = document.getElementById('driveNoteToolbar');

    if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.id = 'driveNoteToolbar';
        toolbar.style.cssText = 'display:none; gap:8px; align-items:center; margin-bottom:8px;';

        toolbar.innerHTML = `
            <input id="driveNoteTitleInput" type="text" readonly
                placeholder="Drive note title"
                style="flex:1; min-width:0; padding:8px 10px; border-radius:10px; border:1px solid #bdb7a8; font-family:inherit; font-weight:bold; background:#f8f6ef;" />
<button id="driveNoteEditButton" class="manga-btn" type="button" onclick="requestDriveNoteEditLock()">Edit</button>
`;

        textarea.parentNode.insertBefore(toolbar, textarea);
    }

    return {
        toolbar,
        titleInput: document.getElementById('driveNoteTitleInput'),
        editButton: document.getElementById('driveNoteEditButton')
    };
}

function setDriveNoteViewMode({ title = '', editable = false } = {}) {
    const textarea = document.getElementById('primaryGasArea');
    const { toolbar, titleInput, editButton } = ensureDriveNoteToolbar();

    if (toolbar) toolbar.style.display = userScriptBeingViewed ? 'flex' : 'none';

    if (titleInput) {
        titleInput.value = title;
        titleInput.readOnly = !editable;
        titleInput.style.opacity = editable ? '1' : '0.75';
    }

    if (textarea) {
        textarea.readOnly = !editable;
        textarea.style.opacity = editable ? '1' : '0.82';
    }

    if (editButton) {
        editButton.disabled = editable;
        editButton.innerText = editable ? 'Editing' : 'Edit';
    }

    isDriveNoteEditMode = editable;
    userScriptBeingEdited = editable ? userScriptBeingViewed : null;
}

function clearDriveNoteWorkspaceState() {
    const textarea = document.getElementById('primaryGasArea');
    const { toolbar, titleInput, editButton } = ensureDriveNoteToolbar();

    userScriptBeingViewed = null;
    userScriptBeingEdited = null;
    isDriveNoteEditMode = false;

    if (toolbar) toolbar.style.display = 'none';

    if (titleInput) {
        titleInput.value = '';
        titleInput.readOnly = true;
    }

    if (textarea) {
        textarea.readOnly = false;
        textarea.style.opacity = '1';
    }

    if (editButton) {
        editButton.disabled = false;
        editButton.innerText = 'Edit';
    }
}

function requestDriveNoteEditLock() {
    if (!userScriptBeingViewed) {
        showToast('Swap View a Drive note first.');
        return;
    }

    openUserScriptEditChess(userScriptBeingViewed);
}

function enableDriveNoteEdit() {
    if (!userScriptBeingViewed) {
        showToast('Swap View a Drive note first.');
        return;
    }

    const script = userScripts.find(s => s.driveFileID === userScriptBeingViewed);
    setDriveNoteViewMode({
        title: script ? script.title : '',
        editable: true
    });

    showToast('Edit mode enabled. Title and content are unlocked.');
}


function isMissingDriveFileError(err) {
    const msg = String(err.message || '').toLowerCase();

    return (
        msg.includes('not found') ||
        msg.includes('no such file') ||
        msg.includes('deleted') ||
        msg.includes('trashed') ||
        msg.includes('permission')
    );
}

async function fetchDriveNoteContent(fileID) {
    const response = await fetch(
        `${gasWebAppUrl}?api=userscripts&action=getContent&fileID=${encodeURIComponent(fileID)}&t=${Date.now()}`,
        { cache: 'no-store' }
    );

    const result = await response.json();

    if (!result.ok) {
        throw new Error(result.message || 'Could not load Drive note');
    }

    return result.content || '';
}

async function preloadDriveNoteContents(options = {}) {
    const { silent = true } = options;

    if (isPreloadingDriveNotes) return;

    const scriptsToPreload = userScripts.filter(script => {
        return script.driveFileID && !driveNoteContentCache.has(script.driveFileID);
    });

    if (!scriptsToPreload.length) return;

    isPreloadingDriveNotes = true;

    if (!silent) {
        showToast(`Preloading ${scriptsToPreload.length} Drive notes...`);
    }

    let index = 0;

    async function worker() {
        while (index < scriptsToPreload.length) {
            const script = scriptsToPreload[index++];
            const fileID = script.driveFileID;

            try {
                const content = await fetchDriveNoteContent(fileID);

                driveNoteContentCache.set(fileID, content);
                driveNoteFetchedAt.set(fileID, Date.now());

            } catch (err) {
                if (isMissingDriveFileError(err)) {
                    removeStaleDriveNote(fileID, 'A Drive note was removed because the file no longer exists.');
                } else {
                    addSystemLog(`Preload failed for "${script.title}": ${err.message}`);
                }
            }
        }
    }

    try {
        const workerCount = Math.min(DRIVE_NOTE_PRELOAD_CONCURRENCY, scriptsToPreload.length);
        await Promise.all(Array.from({ length: workerCount }, worker));

        if (!silent) {
            showToast('Drive notes preloaded.');
        }

        addSystemLog(`Preloaded ${scriptsToPreload.length} Drive notes.`);

    } finally {
        isPreloadingDriveNotes = false;
    }
}

function triggerWorkspaceFlip(textarea) {
    if (!textarea) return;

    clearTimeout(textarea._workspaceSwapTimer);

    if (textarea._workspaceSwapEndHandler) {
        textarea.removeEventListener(
            'animationend',
            textarea._workspaceSwapEndHandler
        );
    }

    textarea.classList.remove(
        'page-turn',
        'workspace-swap'
    );

    // Restart the animation reliably.
    void textarea.offsetWidth;

    let finished = false;

    const finishSwap = () => {
        if (finished) return;

        finished = true;

        textarea.classList.remove(
            'page-turn',
            'workspace-swap'
        );

        textarea.style.removeProperty('filter');

        if (textarea._workspaceSwapEndHandler) {
            textarea.removeEventListener(
                'animationend',
                textarea._workspaceSwapEndHandler
            );

            textarea._workspaceSwapEndHandler = null;
        }
    };

    textarea._workspaceSwapEndHandler =
        finishSwap;

    textarea.addEventListener(
        'animationend',
        finishSwap
    );

    textarea.classList.add(
        'workspace-swap'
    );

    // Safety fallback: it can never remain stuck.
    textarea._workspaceSwapTimer =
        setTimeout(finishSwap, 500);
}

function removeStaleDriveNote(fileID, message = 'Drive note no longer exists.') {
    userScripts = userScripts.filter(s => s.driveFileID !== fileID);
    driveNoteContentCache.delete(fileID);
    driveNoteFetchedAt.delete(fileID);

    if (userScriptBeingViewed === fileID) {
        clearDriveNoteWorkspaceState();
        document.getElementById('primaryGasArea').value = offlineDatabase.primaryGAS;
    }

    renderPortal({ resetWorkspace: false });
    showToast(message);
    addSystemLog(message);
}

function showDriveNoteInWorkspace(script, content, showMessage = true) {
    const textarea = document.getElementById('primaryGasArea');

    currentSnippetBeingEdited = null;
userScriptBeingViewed = script.driveFileID;

switchTab('dashboard');
renderPortal({ resetWorkspace: false });

textarea.value = content || '';

    setDriveNoteViewMode({
        title: script.title,
        editable: false
    });

    triggerWorkspaceFlip(textarea);

    if (showMessage) {
        showToast(`Viewing Drive note: "${script.title}". Press Edit to modify it.`);
    }

    changeToRandomGif();
}



function updateDriveNoteContentSilently(fileID, script, freshContent) {
    driveNoteContentCache.set(fileID, freshContent);
    driveNoteFetchedAt.set(fileID, Date.now());

    if (userScriptBeingViewed !== fileID) return;
    if (isDriveNoteEditMode) return; // Never overwrite while user is editing.

    const textarea = document.getElementById('primaryGasArea');
    if (!textarea) return;

    if (textarea.value !== freshContent) {
        textarea.value = freshContent || '';
    }

    setDriveNoteViewMode({
        title: script.title,
        editable: false
    });
}

async function swapUserScriptView(fileID) {
    const script = userScripts.find(s => s.driveFileID === fileID);

    if (!script) {
        showToast('Drive note not found. Syncing Drive notes...');
        await loadUserScripts({ silent: true, force: true });
        return;
    }

    if (driveNoteContentCache.has(fileID)) {
        showDriveNoteInWorkspace(script, driveNoteContentCache.get(fileID), true);
        return;
    }

    const textarea = document.getElementById('primaryGasArea');

    currentSnippetBeingEdited = null;
    userScriptBeingViewed = fileID;

    switchTab('dashboard');

    textarea.readOnly = true;
    textarea.value = 'Loading Drive note...';

    setDriveNoteViewMode({
        title: script.title,
        editable: false
    });

    triggerWorkspaceFlip(textarea);

    try {
        const freshContent = await fetchDriveNoteContent(fileID);

        driveNoteContentCache.set(fileID, freshContent);
        driveNoteFetchedAt.set(fileID, Date.now());

        showDriveNoteInWorkspace(script, freshContent, true);

    } catch (err) {
        if (isMissingDriveFileError(err)) {
            removeStaleDriveNote(fileID, 'This Drive note was deleted or is no longer available.');
            return;
        }

        showToast('Error loading Drive note: ' + err.message);
    }
}

function renderUserScriptCards() {
    const bottomGrid = document.getElementById('bottomGrid');
    if (!bottomGrid) return;

    userScripts.forEach(script => {
        const randomBg = getRandomMangaColor();
        const card = document.createElement('div');

        const isActiveDriveCard =
            userScriptBeingViewed === script.driveFileID;

        card.className = `snippet-card ${isActiveDriveCard ? 'active-card' : ''} ${isActiveDriveCard && isDriveNoteEditMode ? 'editing-card' : ''}`;
        card.style.backgroundColor = randomBg;

        card.innerHTML = `
            <div style="overflow: hidden;">
                <strong style="display:block; margin-bottom:4px; font-size:14px;">${escapeHtml(script.title)}</strong>
                <p style="font-size:11px; color:#55555d; margin:0; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">📄 Drive note</p>
            </div>

            <div style="display: flex; gap: 6px; justify-content: flex-end; margin-top: 8px;">
                <button class="manga-btn danger" style="font-size:11px; padding:3px 8px;" onclick='openUserScriptDeleteChess(${JSON.stringify(script.driveFileID)})'>Delete</button>
                <button class="manga-btn" style="font-size:11px; padding:3px 8px;" onclick='swapUserScriptView(${JSON.stringify(script.driveFileID)})'>Swap View</button>
            </div>
        `;

        bottomGrid.appendChild(card);
    });
}

function openUserScriptEditChess(fileID) {
    openUserScriptChessLock({ type: 'userScriptEdit', payload: fileID }, " ");
}

function openUserScriptDeleteChess(fileID) {
    openUserScriptChessLock({ type: 'userScriptDelete', payload: fileID }, " ");
}

async function openUserScriptEditForm(fileID) {
    if (userScriptBeingViewed === fileID) {
        enableDriveNoteEdit();
        return;
    }

    await swapUserScriptView(fileID);

    setTimeout(() => {
        if (userScriptBeingViewed === fileID) {
            enableDriveNoteEdit();
        }
    }, 260);
}
    
async function saveEditedUserScript() {
    if (!userScriptBeingEdited) {
        showToast('Press Edit before saving this Drive note.');
        return false;
    }

    const titleInput = document.getElementById('driveNoteTitleInput');
    const title = titleInput ? titleInput.value.trim() : '';
    const content = document.getElementById('primaryGasArea').value;
    const fileID = userScriptBeingEdited;

    if (!title) {
        showToast('Title cannot be blank');
        return false;
    }

    try {
        const response = await fetch(gasWebAppUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'updateUserScript',
                fileID,
                title,
                content
            })
        });

        const result = await response.json();
        if (!result.ok) throw new Error(result.message);

        const localScript = userScripts.find(s => s.driveFileID === fileID);
if (localScript) localScript.title = title;

driveNoteContentCache.set(fileID, content);
driveNoteFetchedAt.set(fileID, Date.now());

showToast('Drive note saved!');
addSystemLog('Drive note updated');

userScriptBeingViewed = fileID;

setDriveNoteViewMode({
    title,
    editable: false
});

renderPortal({ resetWorkspace: false });

return true;

    } catch (err) {
        showToast('Error saving Drive note: ' + err.message);
        return false;
    }
}

async function performUserScriptDeletion(fileID) {
    try {
        const response = await fetch(gasWebAppUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'deleteUserScript', fileID })
        });
        const result = await response.json();
        if (!result.ok) throw new Error(result.message);
        
        showToast("Script unlinked");
addSystemLog("Userscript unlinked");

driveNoteContentCache.delete(fileID);
        driveNoteFetchedAt.delete(fileID);
userScripts = userScripts.filter(s => s.driveFileID !== fileID);

if (userScriptBeingViewed === fileID) {
    clearDriveNoteWorkspaceState();
    document.getElementById('primaryGasArea').value = offlineDatabase.primaryGAS;
}

renderPortal({ resetWorkspace: false });
loadUserScripts({ silent: true, force: true });
    } catch (err) {
        showToast("Error deleting script: " + err.message);
    }
}

async function copyUserScript(fileID) {
    try {
        const response = await fetch(`${gasWebAppUrl}?api=userscripts&action=getContent&fileID=${fileID}`);
        const result = await response.json();
        if (!result.ok) throw new Error(result.message);
        
        navigator.clipboard.writeText(result.content)
            .then(() => showToast("Userscript copied to clipboard!"))
            .catch(() => showToast("Failed to copy"));
    } catch (err) {
        showToast("Error: " + err.message);
    }
}

async function submitNewUserScript() {
    const title = document.getElementById('modalInput').value.trim();
    const content = document.getElementById('primaryGasArea').value.trim();
    
    if (!title) { showToast("Title cannot be blank"); return; }
    if (!content) { showToast("Content cannot be blank"); return; }
    
    try {
        const response = await fetch(gasWebAppUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'addUserScript', title, content })
        });
        const result = await response.json();
        if (!result.ok) throw new Error(result.message);
        
        showToast("Userscript added to Drive!");
        addSystemLog("New userscript created");
        document.getElementById('modalInput').value = '';
        document.getElementById('primaryGasArea').value = offlineDatabase.primaryGAS;
        loadUserScripts({ force: true, silent: false });
    } catch (err) {
        showToast("Error adding script: " + err.message);
    }
}

function closeChessModal() {
    document.getElementById('chessAuthModal').classList.remove('open');
    chessLockContext = { type: null, payload: null };
    currentLondonStep = 0;
    selectedPieceCoord = null;
}

async function performDevRowDeletion(rowNum) {
    try {
        const response = await fetch(gasWebAppUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'delete', row: rowNum })
        });
        const result = await response.json();
        if (!result.ok) throw new Error(result.message);
        showToast(`Row ${rowNum} deleted.`);
        addSystemLog(`Dev Tools: row ${rowNum} deleted.`);
        loadDevToolsData();
    } catch (err) {
        showToast("Error deleting row: " + err.message);
    }
}

function loadOfflineDatabaseFromStorage() {
    try {
        const saved = JSON.parse(localStorage.getItem(OFFLINE_DATABASE_STORAGE_KEY));
        if (!saved || typeof saved !== 'object') return;

        offlineDatabase = {
            ...offlineDatabase,
            ...saved,
            bottomSnippets: Array.isArray(saved.bottomSnippets)
                ? saved.bottomSnippets
                : offlineDatabase.bottomSnippets
        };
    } catch (err) {
        console.warn('Could not load local notes:', err);
        showToast("Could not load saved local notes.");
    }
}

function persistOfflineDatabase() {
    try {
        localStorage.setItem(OFFLINE_DATABASE_STORAGE_KEY, JSON.stringify(offlineDatabase));
    } catch (err) {
        console.warn('Could not save local notes:', err);
        showToast("Could not save local notes in this browser.");
    }
}

function getRandomMangaColor() { return softMangaColors[Math.floor(Math.random() * softMangaColors.length)]; }
function triggerGifFlip() { const frame = document.querySelector('.blank-character-frame'); if (frame) frame.classList.toggle('flipped'); }

function changeToRandomGif() {
    const frame = document.querySelector('.blank-character-frame');
    if (frame) {
        const randomIndex = Math.floor(Math.random() * gifs.length);
        frame.style.backgroundImage = `url('${gifs[randomIndex]}')`;
    }
}

function renderPortal(options = {}) {
    const { resetWorkspace = true } = options;
    const textarea = document.getElementById('primaryGasArea');
    const bottomGrid = document.getElementById('bottomGrid');

    if (!textarea || !bottomGrid) return;

    if (resetWorkspace) {
        currentSnippetBeingEdited = null;
        clearDriveNoteWorkspaceState();
        textarea.value = offlineDatabase.primaryGAS;
    }

    bottomGrid.innerHTML = '';

    offlineDatabase.bottomSnippets.forEach(item => {
        const randomBg = getRandomMangaColor();
        const card = document.createElement('div');

        const isActiveLocalCard =
            currentSnippetBeingEdited === item.id &&
            !userScriptBeingViewed;

        const isStickyCard =
            item.isSticky || item.id === "local-sticky-note";

        card.className = `snippet-card ${isActiveLocalCard ? 'active-card editing-card' : ''} ${isStickyCard ? 'sticky-note-card' : ''}`;
        card.style.backgroundColor = randomBg;

        card.innerHTML = `
            <div style="overflow: hidden;">
                <strong style="display:block; margin-bottom:4px; font-size:14px;">${escapeHtml(item.title)}</strong>
                <p style="font-size:11px; color:#55555d; margin:0; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHtml(item.content)}</p>
            </div>

            <div style="display: flex; gap: 6px; justify-content: flex-end; margin-top: 8px;">
                <button class="manga-btn danger" style="font-size:11px; padding:3px 8px;" onclick='deleteSnippet(${JSON.stringify(item.id)})'>Delete</button>
                <button class="manga-btn" style="font-size:11px; padding:3px 8px;" onclick='viewSnippet(${JSON.stringify(item.id)})'>Swap View</button>
            </div>
        `;

        bottomGrid.appendChild(card);
    });

    renderUserScriptCards();
}

function viewSnippet(id) {
    const textarea =
        document.getElementById('primaryGasArea');

    const item =
        offlineDatabase.bottomSnippets.find(
            entry =>
                String(entry.id) === String(id)
        );

    if (!textarea || !item) return;

    clearDriveNoteWorkspaceState();

    currentSnippetBeingEdited = id;

    renderPortal({
        resetWorkspace: false
    });

    textarea.value = item.content || '';

    triggerWorkspaceFlip(textarea);

    clearTimeout(textarea._localCaretTimer);

    textarea._localCaretTimer =
        setTimeout(() => {
            textarea.classList.remove(
                'page-turn',
                'workspace-swap'
            );

            textarea.focus({
                preventScroll: true
            });

            const caretPosition =
                textarea.value.length;

            textarea.setSelectionRange(
                caretPosition,
                caretPosition
            );
        }, 440);

    showToast(
        `Loaded local note: "${item.title}". Press Save to update this note.`
    );

    changeToRandomGif();
}

function saveCurrentSnippet() {
    if (!currentSnippetBeingEdited) return false;

    const item = offlineDatabase.bottomSnippets.find(x => x.id === currentSnippetBeingEdited);
    if (!item) {
        currentSnippetBeingEdited = null;
        showToast("Selected note no longer exists.");
        return false;
    }

    item.content = document.getElementById('primaryGasArea').value;
    persistOfflineDatabase();
    renderPortal({ resetWorkspace: false });
    showToast(`Saved note: "${item.title}"`);
    return true;
}

function copyTextAreaContent() {
    const textarea = document.getElementById('primaryGasArea');
    textarea.select();
    navigator.clipboard.writeText(textarea.value)
        .then(() => showToast("Copied workspace script to clipboard!"))
        .catch(() => showToast("Error executing clipboard pipeline."));
}


function animatePageTitle(tabElement) {
    if (!tabElement) return;

    // Only animate the first/main header of the opened page.
    const title = tabElement.querySelector(
        '.panel-header h3 .bilingual-label'
    );

    if (!title) return;

    title.classList.remove('page-title-enter');

    // Force the browser to restart the animation.
    void title.offsetWidth;

    title.classList.add('page-title-enter');

    clearTimeout(title._pageTitleAnimationTimer);

    title._pageTitleAnimationTimer = setTimeout(() => {
        title.classList.remove('page-title-enter');
    }, 750);
}

function animatePageTitle(tabElement) {
    if (!tabElement) return;

    const title = tabElement.querySelector(
        '.panel-header h3 .bilingual-label'
    );

    if (!title) return;

    title.classList.remove('page-title-enter');

    // Force animation restart
    void title.offsetWidth;

    title.classList.add('page-title-enter');

    clearTimeout(title._pageTitleAnimationTimer);

    title._pageTitleAnimationTimer = setTimeout(() => {
        title.classList.remove('page-title-enter');
    }, 750);
}

function switchTab(tabName) {
    const dashTab = document.getElementById('dashboardTab');
    const searchTab = document.getElementById('searchMenuTab');
    const predictionTab = document.getElementById('predictionTab');
    const logsTab = document.getElementById('logsTab');
    const devTab = document.getElementById('devToolsTab');
    const navLinks = document.querySelectorAll('.nav-links a');

    let openedTab = null;

    navLinks.forEach(link => link.classList.remove('active'));

    if (dashTab) dashTab.style.display = 'none';
    if (searchTab) searchTab.style.display = 'none';
    if (predictionTab) predictionTab.style.display = 'none';
    if (logsTab) logsTab.style.display = 'none';
    if (devTab) devTab.style.display = 'none';

    const suggestions = document.getElementById('searchSuggestions');
    if (suggestions) suggestions.style.display = 'none';

    const archive = document.getElementById('sheetArchiveArea');
    if (archive) archive.style.display = 'none';

    isArchiveOpen = false;

    if (tabName === 'dashboard') {
        if (dashTab) {
            dashTab.style.display = 'flex';
            openedTab = dashTab;
        }

        if (navLinks[0]) {
            navLinks[0].classList.add('active');
        }

        showToast('Switched to Main Command Dashboard');

    } else if (tabName === 'searchTab') {
        if (searchTab) {
            searchTab.style.display = 'flex';
            openedTab = searchTab;
        }

        if (navLinks[1]) {
            navLinks[1].classList.add('active');
        }

        showToast('Opened the Grimoire');

        const searchInput =
            document.getElementById('sheetKeySearch');

        if (searchInput) {
            searchInput.value = '';
        }

        clearAndHideSearch();

    } else if (tabName === 'prediction') {
        if (predictionTab) {
            predictionTab.style.display = 'flex';
            openedTab = predictionTab;
        }

        if (navLinks[2]) {
            navLinks[2].classList.add('active');
        }

        clearPredictionSearch();
        renderPredictionCards();

        showToast('Viewing Prophecy Cards');

    } else if (tabName === 'logs') {
        if (logsTab) {
            logsTab.style.display = 'flex';
            openedTab = logsTab;
        }

        if (navLinks[3]) {
            navLinks[3].classList.add('active');
        }

        showToast('Opening the Chronicles');

    } else if (tabName === 'devTools') {
        if (devTab) {
            devTab.style.display = 'flex';
            openedTab = devTab;
        }

        if (navLinks[4]) {
            navLinks[4].classList.add('active');
        }

        showToast('Workshop access granted');
    }

    // Wait one frame so the newly displayed panel is rendered.
    requestAnimationFrame(() => {
        animatePageTitle(openedTab);
    });

    changeToRandomGif();
}

function openModal() {
    document.getElementById('mangaModal').classList.add('open');
    document.getElementById('modalInput').value = '';
    document.getElementById('modalInput').focus();
}
var closeModal = () => document.getElementById('mangaModal').classList.remove('open');

function submitNewNote() {
    const name = document.getElementById('modalInput').value.trim();
    if (name) {
        offlineDatabase.bottomSnippets.push({
            id: Date.now(),
            title: name,
            content: "// Empty markdown or script entry"
        });
        persistOfflineDatabase();
        renderPortal();
        closeModal();
        changeToRandomGif();
        showToast(`Created note: "${name}"`);
    } else {
        showToast("Error: Name cannot be blank!");
    }
}

function launchMainGAS() { window.open(offlineDatabase.mainGasLink, '_blank'); showToast("Launching main script portal via tinyurl..."); }
async function savePrimaryGAS() {
    if (userScriptBeingViewed && !isDriveNoteEditMode) {
        showToast('This Drive note is in view-only mode. Press Edit before saving changes.');
        return;
    }

    if (userScriptBeingEdited) {
        await saveEditedUserScript();
        return;
    }

    if (saveCurrentSnippet()) return;

    clearDriveNoteWorkspaceState();

    offlineDatabase.primaryGAS = document.getElementById('primaryGasArea').value;
    persistOfflineDatabase();

    showToast("Changes synced to local workspace memory!");
}

/* =================================
   JRPG CHARACTER TOAST SYSTEM
================================= */

const jrpgToastQueue = [];

let jrpgToastIsTyping = false;
let jrpgToastIsVisible = false;

let jrpgToastHideTimer = null;
let jrpgToastClearTimer = null;
let jrpgToastWasManuallyDismissed = false;

/*
  All existing showToast("message") calls
  continue working.
*/
function showToast(message) {
  const cleanMessage = String(message || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanMessage) return;

  const layer =
    document.getElementById("toastContainer");

  const lines =
    document.getElementById("jrpgNotificationLines");

  if (!layer || !lines) return;

  jrpgToastQueue.push(cleanMessage);

  clearTimeout(jrpgToastHideTimer);
  clearTimeout(jrpgToastClearTimer);

  /*
    Beginning a completely new appearance:
    clear messages from the previous visit.
  */
if (!jrpgToastIsVisible) {
  jrpgToastIsVisible = true;

  /*
    Clear old lines after a normal completed visit,
    but preserve them when the user manually hid Eren.
    Typing may still be running in the background.
  */
  if (!jrpgToastWasManuallyDismissed) {
    lines.replaceChildren();
  }

  jrpgToastWasManuallyDismissed = false;
  layer.classList.add("is-visible");
}

  processJrpgToastQueue();
}

async function processJrpgToastQueue() {
  if (jrpgToastIsTyping) return;

  jrpgToastIsTyping = true;

  while (jrpgToastQueue.length > 0) {
    const message =
      jrpgToastQueue.shift();

    const lines =
      document.getElementById(
        "jrpgNotificationLines"
      );

    /*
      Bounce only when a previous message
      already exists in the bubble.
    */
    if (lines?.children.length) {
      bounceJrpgToastCharacter();
    }

    await typeJrpgNotificationLine(message);

    /*
      Keep the newest six messages while
      the character remains on screen.
    */
    while (lines?.children.length > 6) {
      lines.firstElementChild?.remove();
    }

    await waitForJrpgToast(140);
  }

  jrpgToastIsTyping = false;

  scheduleJrpgToastExit();
}



function dismissJrpgToast() {
  const layer =
    document.getElementById("toastContainer");

  if (!layer || !jrpgToastIsVisible) return;

  /*
    Stop pending automatic cleanup from interfering,
    but do not stop typing or empty the queue.
  */
  clearTimeout(jrpgToastHideTimer);
  clearTimeout(jrpgToastClearTimer);

  jrpgToastWasManuallyDismissed = true;
  jrpgToastIsVisible = false;

  layer.classList.remove("is-visible");
}

function typeJrpgNotificationLine(message) {
  return new Promise((resolve) => {
    const lines =
      document.getElementById(
        "jrpgNotificationLines"
      );

    if (!lines) {
      resolve();
      return;
    }

    const line =
      document.createElement("div");

    line.className =
      "jrpg-notification-line is-typing";

    line.textContent = "「";

    lines.appendChild(line);

    const characters =
      Array.from(message);

    let characterIndex = 0;

    function typeNextCharacter() {
      if (characterIndex >= characters.length) {
        line.textContent += "」";

        line.classList.remove("is-typing");

        scrollJrpgToastToBottom();

        setTimeout(resolve, 180);
        return;
      }

      const character =
        characters[characterIndex];

      line.textContent += character;

      characterIndex += 1;

      scrollJrpgToastToBottom();

      const typingDelay =
        /[.,!?。！？:;]/.test(character)
          ? 95
          : 24;

      setTimeout(
        typeNextCharacter,
        typingDelay
      );
    }

    typeNextCharacter();
  });
}

function bounceJrpgToastCharacter() {
  const character =
    document.getElementById(
      "jrpgToastCharacter"
    );

  if (!character) return;

  character.classList.remove(
    "notification-bounce"
  );

  void character.offsetWidth;

  character.classList.add(
    "notification-bounce"
  );
}

function scrollJrpgToastToBottom() {
  const lines =
    document.getElementById(
      "jrpgNotificationLines"
    );

  if (!lines) return;

  lines.scrollTop =
    lines.scrollHeight;
}

function scheduleJrpgToastExit() {
  clearTimeout(jrpgToastHideTimer);

  /*
    Character stays visible for four seconds
    after the final message finishes typing.
  */
  jrpgToastHideTimer = setTimeout(() => {
    const layer =
      document.getElementById(
        "toastContainer"
      );

    if (!layer) return;

    jrpgToastIsVisible = false;

    layer.classList.remove("is-visible");

    /*
      Clear after the slide-out animation,
      not while the user can still see it.
    */
    jrpgToastClearTimer = setTimeout(() => {
      const lines =
        document.getElementById(
          "jrpgNotificationLines"
        );

      lines?.replaceChildren();
    }, 500);
  }, 4000);
}

function waitForJrpgToast(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}


const MAX_HISTORY = 13;
const SEARCH_HISTORY_STORAGE_KEY = 'mangaSearchHistory';

// Converts old string history into the new object format:
// old: ["GEMI", "CLAUDE"]
// new: [{ key: "GEMI", pinned: false }, { key: "CLAUDE", pinned: true }]
function getSearchHistory() {
    const raw = JSON.parse(localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY)) || [];
    const seen = new Set();

    return raw
        .map(item => {
            if (typeof item === 'string') {
                return { key: item, pinned: false };
            }

            return {
                key: item.key,
                pinned: !!item.pinned
            };
        })
        .filter(item => {
            if (!item.key) return false;

            const normalized = item.key.toUpperCase();
            if (seen.has(normalized)) return false;

            seen.add(normalized);
            return true;
        });
}

function setSearchHistory(history) {
    localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(history));
}

function normalizePinnedHistory(history) {
    const pinned = history.filter(item => item.pinned);
    const unpinned = history.filter(item => !item.pinned);

    const availableUnpinnedSlots = Math.max(0, MAX_HISTORY - pinned.length);

    return [
        ...pinned.slice(0, MAX_HISTORY),
        ...unpinned.slice(0, availableUnpinnedSlots)
    ];
}

// Saves unique entries, keeps pinned entries safe, maxes total recents at 10.
function saveToSearchHistory(key) {
    key = String(key || '').trim();
    if (!key) return;

    let history = getSearchHistory();

    const existingIndex = history.findIndex(item => item.key.toUpperCase() === key.toUpperCase());

    if (existingIndex !== -1) {
        const existingItem = history[existingIndex];

        // If pinned, do not move it.
        if (existingItem.pinned) {
            renderSearchHistory();
            return;
        }

        // If unpinned, move it to top of unpinned recents.
        history.splice(existingIndex, 1);
    }

    const pinned = history.filter(item => item.pinned);
    let unpinned = history.filter(item => !item.pinned);

    if (pinned.length >= MAX_HISTORY) {
        showToast('All 10 recent slots are pinned. Unpin or delete one first.');
        return;
    }

    unpinned.unshift({
        key,
        pinned: false
    });

    history = normalizePinnedHistory([...pinned, ...unpinned]);

    setSearchHistory(history);
    renderSearchHistory();
}

function deleteSingleHistoryItem(key, event) {
    event.stopPropagation();

    let history = getSearchHistory();
    history = history.filter(item => item.key.toUpperCase() !== key.toUpperCase());

    setSearchHistory(history);
    renderSearchHistory();
}

function toggleSearchHistoryPin(key, event) {
    event.stopPropagation();

    let history = getSearchHistory();
    const item = history.find(item => item.key.toUpperCase() === key.toUpperCase());

    if (!item) return;

    item.pinned = !item.pinned;

    history = normalizePinnedHistory(history);

    setSearchHistory(history);
    renderSearchHistory();

    showToast(item.pinned ? `Pinned: ${item.key}` : `Unpinned: ${item.key}`);
}

function clearAllSearchHistory() {
    localStorage.removeItem(SEARCH_HISTORY_STORAGE_KEY);
    renderSearchHistory();
    showToast("Cleared search history memory index.");
}

let draggedItemIndex = null;

function renderSearchHistory() {
    const container = document.getElementById('searchHistoryContainer');
    if (!container) return;

    let history = normalizePinnedHistory(getSearchHistory());
    setSearchHistory(history);

    if (history.length === 0) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 4px;">
            <span style="font-size: 11px; font-weight: 900; opacity: 0.5;">TEKAN PION UNTUK PIN</span>
            <button onclick="clearAllSearchHistory()" style="background: none; border: none; font-size: 10px; font-weight: 900; color: #cc0000; cursor: pointer; text-transform: uppercase; text-decoration: underline; padding: 0;">[ Clear All ]</button>
        </div>
    `;

    history.forEach((item, idx) => {
        const key = item.key;

        const pillWrapper = document.createElement('div');
        const randomBg = softMangaColors[idx % softMangaColors.length] || "#fff";
        const randomTilt = item.pinned ? "0" : (Math.random() * 4 - 2).toFixed(2);

        pillWrapper.setAttribute("draggable", "true");
        pillWrapper.setAttribute("data-index", idx);
        pillWrapper.className = `search-history-pill ${item.pinned ? 'is-pinned' : ''}`;
pillWrapper.style.setProperty('--pill-tilt', `${randomTilt}deg`);

        pillWrapper.style.display = "inline-flex";
        pillWrapper.style.alignItems = "center";
        pillWrapper.style.gap = "6px";
        pillWrapper.style.background = item.pinned ? "#fff3b0" : randomBg;
        pillWrapper.style.border = item.pinned ? "3px solid var(--ink-black, #111)" : "2px solid var(--ink-black, #111)";
        pillWrapper.style.boxShadow = item.pinned ? "3px 3px 0px var(--ink-black, #111)" : "2px 2px 0px var(--ink-black, #111)";
        pillWrapper.style.padding = "4px 8px";
        pillWrapper.style.fontSize = "15px";
        pillWrapper.style.fontWeight = "bold";
        pillWrapper.style.cursor = "grab";
        pillWrapper.style.textTransform = "uppercase";
        pillWrapper.style.transform = "";
        pillWrapper.style.transition = "";

        pillWrapper.ondragstart = (e) => {
            draggedItemIndex = idx;
            pillWrapper.style.opacity = "0.4";
            e.dataTransfer.effectAllowed = "move";
        };

        pillWrapper.ondragend = () => {
            pillWrapper.style.opacity = "1";
            draggedItemIndex = null;

            document.querySelectorAll('#searchHistoryContainer > div').forEach(el => {
                if (el.style.borderStyle === "dashed") el.style.borderStyle = "solid";
            });
        };

        pillWrapper.ondragover = (e) => {
            e.preventDefault();
            return false;
        };

        pillWrapper.ondragenter = () => {
            if (idx !== draggedItemIndex) {
                pillWrapper.style.borderStyle = "dashed";
            }
        };

        pillWrapper.ondragleave = () => {
            pillWrapper.style.borderStyle = "solid";
        };

        pillWrapper.ondrop = (e) => {
            e.preventDefault();

            if (draggedItemIndex !== null && draggedItemIndex !== idx) {
                let updatedHistory = getSearchHistory();

                const [reorderedItem] = updatedHistory.splice(draggedItemIndex, 1);
                updatedHistory.splice(idx, 0, reorderedItem);

                updatedHistory = normalizePinnedHistory(updatedHistory);

                setSearchHistory(updatedHistory);
                renderSearchHistory();
            }
        };

        pillWrapper.onclick = () => {
            const match = googleSheetData.find(row => row.key.toUpperCase() === key.toUpperCase());

            if (match) {
                const searchInput = document.getElementById('sheetKeySearch');
                if (searchInput) searchInput.value = match.key;

                const payloadOutput = document.getElementById('sheetPayloadArea');
                const actionsHeader = document.getElementById('searchActionsHeader');
                const buttonGroup = document.getElementById('searchButtonGroup');
                const suggestionsBox = document.getElementById('searchSuggestions');

                if (payloadOutput && actionsHeader && buttonGroup) {
                    payloadOutput.value = match.payload;
                    payloadOutput.style.display = "block";
                    actionsHeader.style.display = "flex";
                    buttonGroup.style.display = "flex";
                }

                if (suggestionsBox) {
                    suggestionsBox.innerHTML = "";
                    suggestionsBox.style.setProperty('display', 'none', 'important');
                }
            }
        };

        const pinButton = document.createElement('span');
        pinButton.textContent = item.pinned ? '♝' : '♖';
        pinButton.title = item.pinned ? 'Unpin recent search' : 'Pin recent search';
        pinButton.style.cursor = "pointer";
        pinButton.style.fontSize = "13px";
        pinButton.onclick = (event) => toggleSearchHistoryPin(key, event);

        const label = document.createElement('span');
        label.textContent = key;

        const deleteButton = document.createElement('span');
        deleteButton.textContent = '×';
        deleteButton.style.marginLeft = "4px";
        deleteButton.style.padding = "0 2px";
        deleteButton.style.color = "#888";
        deleteButton.style.fontWeight = "900";
        deleteButton.style.cursor = "pointer";
        deleteButton.style.transition = "color 0.1s";
        deleteButton.onmouseover = () => { deleteButton.style.color = "#111"; };
        deleteButton.onmouseout = () => { deleteButton.style.color = "#888"; };
        deleteButton.onclick = (event) => deleteSingleHistoryItem(key, event);

        pillWrapper.appendChild(pinButton);
        pillWrapper.appendChild(label);
        pillWrapper.appendChild(deleteButton);

        container.appendChild(pillWrapper);
    });
}


async function loadDevToolsData() {
    const table = document.getElementById('devToolsTable');
    table.innerHTML = "<tr><td style='padding:10px;'>Loading live rows...</td></tr>";
    try {
        const response = await fetch(`${gasWebAppUrl}?api=devtools`);
        const result = await response.json();
        if (!result.ok) throw new Error(result.message || "Unknown error");
        devToolsRows = result.rows;
        renderDevToolsTable();
        addSystemLog(`Dev Tools: loaded ${devToolsRows.length} live rows.`);
    } catch (err) {
        table.innerHTML = `<tr><td style='padding:10px; color:#cc0000; font-weight:bold;'>Error loading data: ${err.message}</td></tr>`;
        addSystemLog(`Dev Tools load error: ${err.message}`);
    }
}

function renderDevToolsTable() {
    const table = document.getElementById('devToolsTable');
    if (devToolsRows.length === 0) {
        table.innerHTML = "<tr><td style='padding:10px;'>No rows found.</td></tr>";
        return;
    }

    let html = `
        <tr style="text-align:left; border-bottom:3px solid var(--ink-black);">
            <th style="padding:8px;">Keyword</th>
            <th style="padding:8px;">Description</th>
            <th style="padding:8px; width:140px;">Actions</th>
        </tr>
    `;

    devToolsRows.forEach(row => {
        html += `
            <tr data-row="${row._row}" style="border-bottom:1px solid var(--ink-black);">
                <td style="padding:8px; vertical-align:top;">
                    <input type="text" value="${escapeHtml(row.key)}" data-field="key" style="width:100%; border:2px solid var(--ink-black); padding:4px; font-family:inherit; font-weight:bold; box-sizing:border-box;">
                </td>
                <td style="padding:8px; vertical-align:top;">
<textarea
    data-field="description"
    class="workshop-description-editor"
    aria-label="Edit description for ${escapeHtml(row.key)}"
>${escapeHtml(row.description)}</textarea>
</td>
                <td style="padding:8px; vertical-align:top;">
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <button class="manga-btn" style="font-size:10px; padding:3px 6px;" onclick="saveDevRow(${row._row}, this)">💾 Save</button>
                        <button class="manga-btn danger" style="font-size:10px; padding:3px 6px;" onclick="deleteDevRow(${row._row})">🗑 Delete</button>
                    </div>
                </td>
            </tr>
        `;
    });

    table.innerHTML = html;
}


let activeWorkshopEditor = null;
let workshopEditorBackdrop = null;
let workshopEditorPlaceholder = null;
let workshopOriginalStyle = null;

let workshopOpenAnimation = null;
let workshopBackdropOpenAnimation = null;
let workshopIsClosing = false;

function openWorkshopEditor(editor) {
    if (
        !editor ||
        activeWorkshopEditor === editor ||
        workshopIsClosing
    ) {
        return;
    }

    if (activeWorkshopEditor) {
        return;
    }

    const startRect = editor.getBoundingClientRect();

    workshopEditorPlaceholder = document.createElement('div');
    workshopEditorPlaceholder.className = 'workshop-editor-placeholder';
    workshopEditorPlaceholder.style.width = `${startRect.width}px`;
    workshopEditorPlaceholder.style.height = `${startRect.height}px`;

    editor.parentNode.insertBefore(
        workshopEditorPlaceholder,
        editor
    );

    workshopOriginalStyle = editor.getAttribute('style');

    activeWorkshopEditor = editor;

    workshopEditorBackdrop = document.createElement('div');
    workshopEditorBackdrop.className = 'workshop-editor-backdrop';
    document.body.appendChild(workshopEditorBackdrop);

    document.body.classList.add('workshop-editor-open');

        editor.classList.add('is-expanded');
    document.body.appendChild(editor);

    /*
     * Force a complete layout calculation after moving the
     * textarea from the table into the document body.
     */
    void editor.offsetWidth;

    const endRect = editor.getBoundingClientRect();

    const deltaX = startRect.left - endRect.left;
    const deltaY = startRect.top - endRect.top;
    const scaleX = startRect.width / endRect.width;
    const scaleY = startRect.height / endRect.height;

    workshopOpenAnimation = editor.animate(
    [
        {
            transform:
                `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px)) scale(${scaleX}, ${scaleY})`,
            opacity: 0.75
        },
        {
            transform:
                'translate(-50%, -50%) scale(1)',
            opacity: 1
        }
    ],
    {
        duration: 260,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'forwards'
    }
);

workshopOpenAnimation.addEventListener(
    'finish',
    () => {
        if (!workshopOpenAnimation) return;

        workshopOpenAnimation.cancel();
        workshopOpenAnimation = null;

        editor.style.removeProperty('transform');
        editor.style.removeProperty('opacity');
    },
    { once: true }
);

workshopBackdropOpenAnimation =
    workshopEditorBackdrop.animate(
        [
            { opacity: 0 },
            { opacity: 1 }
        ],
        {
            duration: 220,
            easing: 'ease',
            fill: 'forwards'
        }
    );

workshopBackdropOpenAnimation.addEventListener(
    'finish',
    () => {
        if (!workshopBackdropOpenAnimation) return;

        workshopBackdropOpenAnimation.cancel();
        workshopBackdropOpenAnimation = null;

        if (
            workshopEditorBackdrop &&
            !workshopIsClosing
        ) {
            workshopEditorBackdrop.style.opacity = '1';
        }
    },
    { once: true }
);

    workshopEditorBackdrop.addEventListener(
        'click',
        closeWorkshopEditor,
        { once: true }
    );

    requestAnimationFrame(() => {
        editor.focus();
    });
}

function closeWorkshopEditor() {
    if (!activeWorkshopEditor || workshopIsClosing) return;

    workshopIsClosing = true;

    workshopOpenAnimation?.cancel();
    workshopBackdropOpenAnimation?.cancel();

    workshopOpenAnimation = null;
    workshopBackdropOpenAnimation = null;

    const editor = activeWorkshopEditor;
    const placeholder = workshopEditorPlaceholder;

    const startRect = editor.getBoundingClientRect();
    const endRect = placeholder
        ? placeholder.getBoundingClientRect()
        : startRect;

    const deltaX = endRect.left - startRect.left;
    const deltaY = endRect.top - startRect.top;
    const scaleX = endRect.width / startRect.width;
    const scaleY = endRect.height / startRect.height;

    const closingAnimation = editor.animate(
        [
            {
                transform:
                    'translate(-50%, -50%) scale(1)',
                opacity: 1
            },
            {
                transform:
                    `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px)) scale(${scaleX}, ${scaleY})`,
                opacity: 0.65
            }
        ],
        {
            duration: 190,
            easing: 'cubic-bezier(0.4, 0, 1, 1)',
            fill: 'both'
        }
    );

    if (workshopEditorBackdrop) {
        workshopEditorBackdrop.animate(
            [
                { opacity: 1 },
                { opacity: 0 }
            ],
            {
                duration: 170,
                easing: 'ease',
                fill: 'both'
            }
        );
    }

    closingAnimation.onfinish = () => {
        editor.classList.remove('is-expanded');
        editor.getAnimations().forEach(animation => animation.cancel());

        if (placeholder?.parentNode) {
            placeholder.parentNode.insertBefore(
                editor,
                placeholder
            );

            placeholder.remove();
        }

        if (workshopOriginalStyle === null) {
            editor.removeAttribute('style');
        } else {
            editor.setAttribute(
                'style',
                workshopOriginalStyle
            );
        }

        workshopEditorBackdrop?.remove();
        document.body.classList.remove('workshop-editor-open');

        activeWorkshopEditor = null;
workshopEditorBackdrop = null;
workshopEditorPlaceholder = null;
workshopOriginalStyle = null;

workshopOpenAnimation = null;
workshopBackdropOpenAnimation = null;
workshopIsClosing = false;
    };
}

document.addEventListener('click', event => {
    const editor = event.target.closest(
        '.workshop-description-editor'
    );

    if (!editor) return;
    if (editor.classList.contains('is-expanded')) return;

    openWorkshopEditor(editor);
});

document.addEventListener('keydown', event => {
    if (
        event.key === 'Escape' &&
        activeWorkshopEditor
    ) {
        closeWorkshopEditor();
    }
});

function escapeHtml(str) {
    if (str === undefined || str === null) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

async function saveDevRow(rowNum, btnEl) {
    const tr = btnEl.closest('tr');
    const key = tr.querySelector('[data-field="key"]').value;
    const description = tr.querySelector('[data-field="description"]').value;

    try {
        const response = await fetch(gasWebAppUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'edit', row: rowNum, key, description })
        });
        const result = await response.json();
        if (!result.ok) throw new Error(result.message);
        showToast(`Row ${rowNum} updated.`);
        addSystemLog(`Dev Tools: row ${rowNum} updated.`);
    } catch (err) {
        showToast("Error saving row: " + err.message);
    }
}

async function deleteDevRow(rowNum) {
    openChessLock({ type: 'devRowDelete', payload: rowNum }, "Execute London Line to Authorize Row Deletion");
}

function openDevAddForm() {
    document.getElementById('devToolsAddForm').style.display = 'flex';
    document.getElementById('devAddKey').value = '';
    document.getElementById('devAddDesc').value = '';
}
function closeDevAddForm() {
    document.getElementById('devToolsAddForm').style.display = 'none';
}
async function submitDevAdd() {
    const key = document.getElementById('devAddKey').value.trim();
    const description = document.getElementById('devAddDesc').value.trim();
    if (!key) { showToast("Error: Keyword cannot be blank!"); return; }

    try {
        const response = await fetch(gasWebAppUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'add', key, description })
        });
        const result = await response.json();
        if (!result.ok) throw new Error(result.message);
        showToast("New row added to live sheet!");
        addSystemLog("Dev Tools: new row added.");
        closeDevAddForm();
        loadDevToolsData();
    } catch (err) {
        showToast("Error adding row: " + err.message);
    }
}



function addSystemLog(message) {
    const timestamp = new Date().toLocaleString();
    const formattedMessage = `[${timestamp}] ${message}`;

    console.log(formattedMessage);

    const logsArea = document.getElementById('systemLogsArea');
    if (!logsArea) return;

    const oldLogContainer = document.getElementById('systemLogContainer');
    if (oldLogContainer) oldLogContainer.remove();

    const currentLogs = logsArea.value.trim();

    logsArea.value = currentLogs
        ? `${currentLogs}\n${formattedMessage}`
        : formattedMessage;

    logsArea.scrollTop = logsArea.scrollHeight;
}



function maybeSyncDriveNotes() {
    // Manual-only refresh helper.
    // Do not auto-pull on focus or visibility change.
    lastDriveSyncAt = Date.now();
    return loadUserScripts({ silent: true, force: true });
}


function getPredictionTimerSource() {
    return predictionTimeEditMode ? predictionTimeDraftConfig : predictionTimeConfig;
}

function getPredictionTimer(cardTitle) {
    const source = getPredictionTimerSource();
    return source[cardTitle] || null;
}

function timeStringToMinutes(timeString) {
    if (!timeString) return null;

    const clean = String(timeString).trim().toUpperCase();

    // Supports: 03:46, 3:46, 23:10
    let match24 = clean.match(/^(\d{1,2}):(\d{2})$/);
    if (match24) {
        const hours = Number(match24[1]);
        const minutes = Number(match24[2]);

        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

        return hours * 60 + minutes;
    }

    // Supports: 3:46 AM, 03:46 PM
    let match12 = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
    if (match12) {
        let hours = Number(match12[1]);
        const minutes = Number(match12[2]);
        const meridiem = match12[3];

        if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;

        if (meridiem === 'AM' && hours === 12) hours = 0;
        if (meridiem === 'PM' && hours !== 12) hours += 12;

        return hours * 60 + minutes;
    }

    return null;
}

function normalizeTimeString(timeString) {
    if (!timeString) return '';

    const clean = String(timeString).trim().toUpperCase();

    const match24 = clean.match(/^(\d{1,2}):(\d{2})$/);
    if (match24) {
        const hours = Number(match24[1]);
        const minutes = Number(match24[2]);

        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return '';

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    const match12 = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
    if (match12) {
        let hours = Number(match12[1]);
        const minutes = Number(match12[2]);
        const meridiem = match12[3];

        if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return '';

        if (meridiem === 'AM' && hours === 12) hours = 0;
        if (meridiem === 'PM' && hours !== 12) hours += 12;

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    return '';
}


function isPredictionDayAllowed(timer) {
    if (!timer || !Array.isArray(timer.days) || timer.days.length === 0) {
        return true;
    }

    if (timer.days.includes('EVERYDAY')) {
        return true;
    }

    const today = PREDICTION_DAYS[new Date().getDay()];
    return timer.days.includes(today);
}

function isPredictionCardActive(card) {
    const timer = getPredictionTimer(card.title);

    // No timer set = always live
    if (!timer) return true;

    const start = timeStringToMinutes(timer.start);
    const end = timeStringToMinutes(timer.end);

    // Incomplete timer = always live
    if (start === null || end === null) return true;

    if (!isPredictionDayAllowed(timer)) return false;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    if (start <= end) {
        return currentMinutes >= start && currentMinutes <= end;
    }

    // Overnight timer, example 23:30 → 01:00
    return currentMinutes >= start || currentMinutes <= end;
}

function getPredictionTimerLabel(card) {
    const timer = getPredictionTimer(card.title);

    if (!timer || !timer.start || !timer.end) {
        return 'ALWAYS ON';
    }

    const days = Array.isArray(timer.days) && timer.days.length
        ? timer.days.join(',')
        : 'EVERYDAY';

    return `${timer.start} → ${timer.end} · ${days}`;
}

function ensurePredictionTimerDraft(cardTitle) {
    if (!predictionTimeDraftConfig[cardTitle]) {
        predictionTimeDraftConfig[cardTitle] = {
            start: '',
            end: '',
            days: ['EVERYDAY']
        };
    }

    predictionTimeDraftConfig[cardTitle].start = normalizeTimeString(predictionTimeDraftConfig[cardTitle].start);
    predictionTimeDraftConfig[cardTitle].end = normalizeTimeString(predictionTimeDraftConfig[cardTitle].end);

    if (!Array.isArray(predictionTimeDraftConfig[cardTitle].days)) {
        predictionTimeDraftConfig[cardTitle].days = ['EVERYDAY'];
    }

    return predictionTimeDraftConfig[cardTitle];
}

function setPredictionTimerValue(cardTitle, field, value) {
    const timer = ensurePredictionTimerDraft(cardTitle);

    if (field === 'start' || field === 'end') {
        timer[field] = normalizeTimeString(value);
        renderPredictionCards(getVisiblePredictionCards());
    }
}

function togglePredictionDay(cardTitle, day, checked) {
    const timer = ensurePredictionTimerDraft(cardTitle);

    if (day === 'EVERYDAY') {
        timer.days = checked ? ['EVERYDAY'] : [];
        renderPredictionCards(getVisiblePredictionCards());
        return;
    }

    timer.days = timer.days.filter(item => item !== 'EVERYDAY');

    if (checked) {
        if (!timer.days.includes(day)) {
            timer.days.push(day);
        }
    } else {
        timer.days = timer.days.filter(item => item !== day);
    }

    renderPredictionCards(getVisiblePredictionCards());
}

function clearPredictionTimer(cardTitle) {
    delete predictionTimeDraftConfig[cardTitle];
    renderPredictionCards(getVisiblePredictionCards());
}

function renderPredictionTimerEditor(card) {
    if (!predictionTimeEditMode) return '';

    const timer = ensurePredictionTimerDraft(card.title);

    const days = Array.isArray(timer.days) ? timer.days : ['EVERYDAY'];
    const titleKey = JSON.stringify(card.title);

    const dayButtons = [
        'EVERYDAY',
        'SUN',
        'MON',
        'TUE',
        'WED',
        'THU',
        'FRI',
        'SAT'
    ].map(day => {
        const checked = days.includes(day);

        return `
            <label class="prediction-day-chip ${checked ? 'active' : ''}">
                <input
                    type="checkbox"
                    ${checked ? 'checked' : ''}
                    onchange='togglePredictionDay(${titleKey}, ${JSON.stringify(day)}, this.checked)'
                >
                ${day === 'EVERYDAY' ? 'EVERY' : day}
            </label>
        `;
    }).join('');

    return `
        <div class="prediction-time-editor" onclick="event.stopPropagation()">
            <div class="prediction-time-row">
                <label>
                    Start
                    <input
                        type="time"
                        value="${escapeHtml(timer.start || '')}"
                        onchange='setPredictionTimerValue(${titleKey}, "start", this.value)'
                    >
                </label>

                <label>
                    End
                    <input
                        type="time"
                        value="${escapeHtml(timer.end || '')}"
                        onchange='setPredictionTimerValue(${titleKey}, "end", this.value)'
                    >
                </label>
            </div>

            <div class="prediction-day-row">
                ${dayButtons}
            </div>

            <button class="manga-btn danger prediction-clear-time-btn" onclick='clearPredictionTimer(${titleKey})'>
                Clear Timer
            </button>
        </div>
    `;
}




function installCasualSourceGuard() {
    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        showToast('ちょっと何やってるの、バカ！');
    });

    document.addEventListener('keydown', function (e) {
        const key = e.key.toLowerCase();

        const blocked =
            key === 'f12' ||
            (e.ctrlKey && key === 'u') ||
            (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(key)) ||
            (e.metaKey && e.altKey && ['i', 'j', 'c'].includes(key));

        if (blocked) {
            e.preventDefault();
            showToast('ちょっと何やってるの、バカ！');
        }
    });
}

installCasualSourceGuard();


function sortPredictionCardsByTime(cards) {
    return [...cards].sort((a, b) => {
        const timerA = getPredictionTimer(a.title);
        const timerB = getPredictionTimer(b.title);

        const startA = timerA ? timeStringToMinutes(timerA.start) : null;
        const startB = timerB ? timeStringToMinutes(timerB.start) : null;

        const endA = timerA ? timeStringToMinutes(timerA.end) : null;
        const endB = timerB ? timeStringToMinutes(timerB.end) : null;

        const activeA = isPredictionCardActive(a);
        const activeB = isPredictionCardActive(b);

        // 1. LIVE cards first, BURNT OUT cards later
        if (activeA !== activeB) {
            return activeA ? -1 : 1;
        }

        // 2. Cards with no valid timer go last
        if (startA === null && startB === null) return 0;
        if (startA === null) return 1;
        if (startB === null) return -1;

        // 3. Sort by start time
        if (startA !== startB) {
            return startA - startB;
        }

        // 4. If same start time, sort by end time
        if (endA === null && endB === null) return 0;
        if (endA === null) return 1;
        if (endB === null) return -1;

        return endA - endB;
    });
}

setInterval(() => {
    const predictionTab = document.getElementById('predictionTab');

    if (predictionTab && predictionTab.style.display !== 'none' && !predictionTimeEditMode) {
        renderPredictionCards(getVisiblePredictionCards());
    }
}, 30000);


function installHorizontalNoteScroll() {
    const grid = document.getElementById('bottomGrid');
    if (!grid) return;

    grid.addEventListener('wheel', function (e) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            e.preventDefault();
            grid.scrollLeft += e.deltaY;
        }
    }, { passive: false });
}

window.addEventListener('load', installHorizontalNoteScroll);

const WALLPAPER_STORAGE_KEY =
  'mangaDashboardWallpaperUrl';

const WALLPAPER_STRENGTH_STORAGE_KEY =
  'mangaDashboardWallpaperStrength';

const WALLPAPER_TONE_STORAGE_KEY =
  'mangaDashboardWallpaperTone';

const WALLPAPER_MODE_STORAGE_KEY =
  'mangaDashboardWallpaperMode';

const WALLPAPER_SHEET_KEY =
  'ALL IN ONE';

const WALLPAPER_ENTRY_SEPARATOR =
  '------------------------------------------------';

const LAST_RANDOM_WALLPAPER_KEY =
  'mangaLastRandomWallpaperUrl';

let wallpaperDraftUrl = null;
let wallpaperDraftTitle = '';

let wallpaperDraftStrength =
  getSavedWallpaperStrength();

let wallpaperDraftTone =
  localStorage.getItem(
    WALLPAPER_TONE_STORAGE_KEY
  ) || 'light';

let wallpaperGalleryCache = [];

const wallpaperVideoWarmCache =
  new Map();
    
function escapeWallpaperHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getSavedWallpaperUrl() {
    return localStorage.getItem(WALLPAPER_STORAGE_KEY) || '';
}

function getSavedWallpaperStrength() {
    return Number(localStorage.getItem(WALLPAPER_STRENGTH_STORAGE_KEY) || 0.32);
}

function escapeCssUrl(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function getWallpaperVideoErrorMessage(video) {
    const code = video && video.error ? video.error.code : 0;

    const messages = {
        1: 'MP4 loading aborted.',
        2: 'MP4 network error.',
        3: 'MP4 decode error. The file may be corrupted or unsupported.',
        4: 'MP4 source not supported or URL is broken.'
    };

    return messages[code] || 'MP4 failed to load.';
}

function setWallpaperCardStatus(card, text, state = 'loading') {
    if (!card) return;

    let status = card.querySelector('.wallpaper-card-status');

    if (!status) {
        status = document.createElement('div');
        status.className = 'wallpaper-card-status';
        card.appendChild(status);
    }

    status.className = `wallpaper-card-status ${state}`;
    status.textContent = text;
}

function attachWallpaperVideoDiagnostics(video, card, url) {
    if (!video) return;

    let slowTimer = null;

    const clearSlowTimer = () => {
        if (slowTimer) {
            clearTimeout(slowTimer);
            slowTimer = null;
        }
    };

    const markLoading = () => {
        setWallpaperCardStatus(card, 'MP4 loading…', 'loading');

        clearSlowTimer();
        slowTimer = setTimeout(() => {
            if (video.readyState < 2) {
                setWallpaperCardStatus(card, 'Slow MP4 / still loading', 'slow');
                addSystemLog(`Slow wallpaper MP4: ${url}`);
            }
        }, 5000);
    };

    video.addEventListener('loadstart', markLoading);

    video.addEventListener('loadedmetadata', () => {
        setWallpaperCardStatus(card, 'MP4 source OK', 'ok');
    });

    video.addEventListener('canplay', () => {
        clearSlowTimer();
        setWallpaperCardStatus(card, 'Ready', 'ok');
    });

    video.addEventListener('error', () => {
        clearSlowTimer();
        setWallpaperCardStatus(card, 'Broken / unsupported MP4', 'error');
        addSystemLog(`${getWallpaperVideoErrorMessage(video)} URL: ${url}`);
    });

    video.addEventListener('stalled', () => {
        setWallpaperCardStatus(card, 'MP4 stalled', 'slow');
    });

    video.addEventListener('waiting', () => {
        setWallpaperCardStatus(card, 'Buffering…', 'slow');
    });
}

function warmWallpaperVideo(url) {
    url = String(url || '').trim();

    if (!url || !isVideoWallpaperUrl(url) || wallpaperVideoWarmCache.has(url)) {
        return;
    }

    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;

    video.addEventListener('canplay', () => {
        addSystemLog(`Warmed wallpaper MP4: ${url}`);
    }, { once: true });

    video.addEventListener('error', () => {
        addSystemLog(`${getWallpaperVideoErrorMessage(video)} URL: ${url}`);
    }, { once: true });

    wallpaperVideoWarmCache.set(url, video);
    video.load();
}

function warmWallpaperPreviewVideos(wallpapers, limit = 6) {
    (wallpapers || [])
        .filter(item => item && (item.type === 'video' || isVideoWallpaperUrl(item.url)))
        .slice(0, limit)
        .forEach(item => warmWallpaperVideo(item.url));
}

function removeDynamicWallpaperVideo() {
    const existingVideo = document.getElementById('dynamicWallpaperVideo');

    if (existingVideo) {
        existingVideo.pause();
        existingVideo.removeAttribute('src');
        existingVideo.load();
        existingVideo.remove();
    }
}

function ensureDynamicWallpaperVideo(url) {
    let video = document.getElementById('dynamicWallpaperVideo');

    if (!video) {
        video = document.createElement('video');
        video.id = 'dynamicWallpaperVideo';
        video.muted = true;
        video.loop = true;
        video.autoplay = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.setAttribute('playsinline', '');
        video.setAttribute('muted', '');

        document.body.prepend(video);
    }

    if (video.dataset.src !== url) {
        if (video._wallpaperSlowTimer) clearTimeout(video._wallpaperSlowTimer);

        video.dataset.src = url;
        video.dataset.state = 'loading';
        video.preload = 'auto';

        video.onloadstart = () => {
            video.dataset.state = 'loading';
            addSystemLog(`Loading MP4 wallpaper: ${url}`);
        };

        video.oncanplay = () => {
            if (video._wallpaperSlowTimer) clearTimeout(video._wallpaperSlowTimer);
            video.dataset.state = 'ready';
            showToast('MP4 wallpaper ready.');
        };

        video.onerror = () => {
            if (video._wallpaperSlowTimer) clearTimeout(video._wallpaperSlowTimer);
            video.dataset.state = 'error';
            showToast(getWallpaperVideoErrorMessage(video));
            addSystemLog(`${getWallpaperVideoErrorMessage(video)} URL: ${url}`);
        };

        video.onstalled = video.onwaiting = () => {
            video.dataset.state = 'slow';
        };

        video.src = url;
        video.load();

        video._wallpaperSlowTimer = setTimeout(() => {
            if (video.dataset.state === 'loading' && video.readyState < 2) {
                video.dataset.state = 'slow';
                showToast('MP4 is still loading. Source may be slow, not broken yet.');
                addSystemLog(`Slow MP4 wallpaper: ${url}`);
            }
        }, 6000);
    }

    warmWallpaperVideo(url);
    video.play().catch(() => {});
}

function setDashboardWallpaper(
  url,
  strength = getSavedWallpaperStrength(),
  tone = wallpaperDraftTone
) {
    let styleTag = document.getElementById('dynamicWallpaperStyle');

    if (!url) {
        removeDynamicWallpaperVideo();

        if (styleTag) styleTag.remove();

        return;
    }

    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamicWallpaperStyle';
        document.head.appendChild(styleTag);
    }

    const safeUrl = escapeCssUrl(url);
    

const overlayStrength =
  Math.max(
    0,
    Math.min(
      0.75,
      Number(strength) || 0.32
    )
  );

let overlayColor;

if (tone === 'dark') {
  overlayColor =
    `rgba(0,0,0,${overlayStrength})`;
} else if (tone === 'neutral') {
  overlayColor =
    'rgba(0,0,0,0)';
} else {
  overlayColor =
    `rgba(244,243,239,${overlayStrength})`;
}

    if (isVideoWallpaperUrl(url)) {
        ensureDynamicWallpaperVideo(url);

        styleTag.textContent = `
            #dynamicWallpaperVideo {
                position: fixed;
                inset: 0;
                width: 100vw;
                height: 100vh;
                object-fit: cover;
                z-index: 0;
                pointer-events: none;
                background: #000;
            }

            .portal-container {
                position: relative;
                z-index: 1;
                background-color: rgba(244, 243, 239, 0.18) !important;
            }

            .sidebar-panel,
            .manga-panel {
                background:
  ${overlayColor} !important;
            }

            .sidebar-panel::before,
            .manga-panel::before {
                background-image: none !important;
            }
        `;

        return;
    }

    removeDynamicWallpaperVideo();

    styleTag.textContent = `
        body {
            background-image:
                radial-gradient(circle, transparent 40%, rgba(0,0,0,0.82) 100%),
                url("${safeUrl}") !important;
            background-size: cover !important;
            background-position: center !important;
            background-attachment: fixed !important;
            background-repeat: no-repeat !important;
        }

        .portal-container {
            background-color: rgba(244, 243, 239, 0.18) !important;
        }

        .sidebar-panel,
        .manga-panel {
            background:
linear-gradient(
  ${overlayColor},
  ${overlayColor}
),                url("${safeUrl}") center / cover no-repeat !important;
        }

        .sidebar-panel::before,
        .manga-panel::before {
            background-image: none !important;
        }
    `;
}

function loadSavedWallpaper() {
    const savedUrl = getSavedWallpaperUrl();
    const savedStrength = getSavedWallpaperStrength();

    wallpaperDraftUrl = savedUrl;
    wallpaperDraftStrength = savedStrength;

    if (savedUrl) {
        setDashboardWallpaper(savedUrl, savedStrength);
    }
}

function loadRandomWallpaper() {
    const wallpaperMode =
        localStorage.getItem(WALLPAPER_MODE_STORAGE_KEY) || 'random';

    const manuallySavedUrl = getSavedWallpaperUrl();

    // A manually selected and saved wallpaper always wins.
    if (wallpaperMode === 'manual' && manuallySavedUrl) {
        loadSavedWallpaper();
        addSystemLog('Manual wallpaper preserved.');
        return;
    }

    const wallpaperRow = getWallpaperSheetRow();

    if (!wallpaperRow) {
        loadSavedWallpaper();
        return;
    }

    const wallpapers = parseWallpaperPayload(wallpaperRow.payload);

    if (!wallpapers.length) {
        loadSavedWallpaper();
        return;
    }

    const previousRandomUrl =
        localStorage.getItem(LAST_RANDOM_WALLPAPER_KEY) || '';

    const availableWallpapers = wallpapers.length > 1
        ? wallpapers.filter(
            wallpaper => wallpaper.url !== previousRandomUrl
        )
        : wallpapers;

    const randomIndex = Math.floor(
        Math.random() * availableWallpapers.length
    );

    const selectedWallpaper =
        availableWallpapers[randomIndex];

    wallpaperGalleryCache = wallpapers;
    wallpaperDraftUrl = selectedWallpaper.url;
    wallpaperDraftTitle = selectedWallpaper.title;
    wallpaperDraftStrength = getSavedWallpaperStrength();

    setDashboardWallpaper(
        selectedWallpaper.url,
        wallpaperDraftStrength
    );

    localStorage.setItem(
        LAST_RANDOM_WALLPAPER_KEY,
        selectedWallpaper.url
    );

    addSystemLog(
        `Random wallpaper loaded: ${selectedWallpaper.title}`
    );
}

function handleWallpaperStrengthInput(value) {
    wallpaperDraftStrength = Math.max(
        0.08,
        Math.min(0.75, Number(value) || 0.32)
    );

    const label = document.getElementById('wallpaperStrengthValue');
    if (label) {
        label.innerText = `${Math.round(wallpaperDraftStrength * 100)}%`;
    }

    const activeUrl = wallpaperDraftUrl || getSavedWallpaperUrl();

    if (activeUrl) {
        setDashboardWallpaper(activeUrl, wallpaperDraftStrength);
    }
}

function getWallpaperSheetRow() {
    return googleSheetData.find(row =>
        String(row.key || '').trim().toUpperCase() === WALLPAPER_SHEET_KEY
    );
}

function isVideoWallpaperUrl(url) {
    return /\.(mp4|webm|mov)(\?.*)?$/i.test(String(url || '').trim());
}

function isImageWallpaperUrl(url) {
    return /\.(jpg|jpeg|png|webp|gif|avif|svg)(\?.*)?$/i.test(String(url || '').trim());
}

function getWallpaperMediaType(url) {
    return isVideoWallpaperUrl(url) ? 'video' : 'image';
}

function parseWallpaperPayload(payload) {
    const text = String(payload || '').replace(/\r\n/g, '\n').trim();

    if (!text) return [];

    const blocks = text
        .split(/\n\s*-{3,}\s*\n/g)
        .map(block => block.trim())
        .filter(Boolean);

    return blocks.map((block, index) => {
        const mediaMatch = block.match(
            /https?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif|avif|svg|mp4|webm|mov)(?:\?\S*)?/i
        );

        if (!mediaMatch) return null;

        const url = mediaMatch[0].trim();

        const title = block
            .replace(url, '')
            .replace(/^-+$/gm, '')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .join(' ')
            .trim();

        return {
            id: `wallpaper-${index}`,
            title: title || `Wallpaper ${index + 1}`,
            url,
            type: getWallpaperMediaType(url)
        };
    }).filter(Boolean);
}

function ensureWallpaperModal() {
    let modal = document.getElementById('wallpaperModal');

    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'wallpaperModal';
    modal.className = 'wallpaper-modal';

    modal.innerHTML = `
        <div class="wallpaper-panel">
            <div class="wallpaper-header">
                <h3>WALLPAPER GALLERY</h3>

 <div class="wallpaper-actions">
 <div class="wallpaper-strength-control">
  <span>TONE</span>

  <select
    id="wallpaperToneSelect"
    onchange="handleWallpaperToneChange(this.value)"
  >
    <option value="light">Light</option>
    <option value="neutral">Neutral</option>
    <option value="dark">Dark</option>
  </select>
</div>
    <div class="wallpaper-strength-control">
     <span>TONE POWER</span>
        <input
            id="wallpaperStrengthSlider"
            type="range"
            min="0.08"
            max="0.75"
            step="0.01"
            value="0.32"
            oninput="handleWallpaperStrengthInput(this.value)"
        >
        <strong id="wallpaperStrengthValue">32%</strong>
    </div>

    <button class="manga-btn primary-save" style="font-size: 11px; padding: 4px 10px;" onclick="saveWallpaperSelection()">
        Save
    </button>

    <button class="manga-btn" style="font-size: 11px; padding: 4px 10px;" onclick="cancelWallpaperSelection()">
        Cancel
    </button>
</div>
            </div>
<div class="wallpaper-add-row">
    <input
        id="wallpaperAddTitle"
        type="text"
        placeholder="Wallpaper title"
        autocomplete="off"
    >

    <input
        id="wallpaperAddUrl"
        type="url"
        placeholder="Image / MP4 URL"
        autocomplete="off"
    >

    <button
        id="wallpaperAddButton"
        class="manga-btn"
        type="button"
        onclick="addWallpaperToSheet()"
    >
        + Add
    </button>
</div>
            <div id="wallpaperGalleryStrip" class="wallpaper-gallery-strip"></div>
        </div>
    `;

    document.body.appendChild(modal);
    const addTitleInput = modal.querySelector('#wallpaperAddTitle');
const addUrlInput = modal.querySelector('#wallpaperAddUrl');

[addTitleInput, addUrlInput].forEach(input => {
    if (!input) return;

    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            addWallpaperToSheet();
        }
    });
});

    modal.addEventListener('click', event => {
        if (event.target === modal) {
            cancelWallpaperSelection();
        }
    });

    return modal;
}

async function openWallpaperGallery() {
    if (!Array.isArray(googleSheetData) || googleSheetData.length === 0) {
        showToast('Syncing wallpaper matrix...');
        await syncGoogleSheetData();
    }

    const row = getWallpaperSheetRow();

    if (!row) {
        showToast('Wallpaper row not found: ALL in ONE');
        return;
    }

    const wallpapers = parseWallpaperPayload(row.payload);
    wallpaperGalleryCache = wallpapers;

    const modal = ensureWallpaperModal();
    const strip = document.getElementById('wallpaperGalleryStrip');

    wallpaperDraftUrl = getSavedWallpaperUrl();
    wallpaperDraftTitle = '';
    wallpaperDraftTone =
  localStorage.getItem(
    WALLPAPER_TONE_STORAGE_KEY
  ) || 'light';

const toneSelect =
  document.getElementById(
    'wallpaperToneSelect'
  );

if (toneSelect) {
  toneSelect.value =
    wallpaperDraftTone;
}
    wallpaperDraftStrength = getSavedWallpaperStrength();
    const addTitleInput = document.getElementById('wallpaperAddTitle');
const addUrlInput = document.getElementById('wallpaperAddUrl');

if (addTitleInput) addTitleInput.value = '';
if (addUrlInput) addUrlInput.value = '';

const strengthSlider = document.getElementById('wallpaperStrengthSlider');
const strengthLabel = document.getElementById('wallpaperStrengthValue');

if (strengthSlider) strengthSlider.value = wallpaperDraftStrength;
if (strengthLabel) strengthLabel.innerText = `${Math.round(wallpaperDraftStrength * 100)}%`;

    modal.classList.add('open');

    if (!strip) return;

    if (!wallpapers.length) {
        strip.innerHTML = `
            <div class="wallpaper-empty">
                No wallpapers found. Check cell B for title/link blocks.
            </div>
        `;
        return;
    }

renderWallpaperGallery(wallpapers);
warmWallpaperPreviewVideos(wallpapers);
showToast('Wallpaper gallery opened.');
}

function renderWallpaperGallery(wallpapers) {
    const strip = document.getElementById('wallpaperGalleryStrip');
    if (!strip) return;

    const activeUrl = wallpaperDraftUrl || getSavedWallpaperUrl();

    strip.innerHTML = '';

    wallpapers.forEach((wallpaper, index) => {
        const isActive = wallpaper.url === activeUrl;
        const isVideo = wallpaper.type === 'video' || isVideoWallpaperUrl(wallpaper.url);

        const card = document.createElement('div');
        card.className = `wallpaper-card ${isActive ? 'is-active' : ''}`;
        card.style.transform = `rotate(${((index % 5) - 2) * 0.7}deg)`;

        card.innerHTML = `
            ${
                isVideo
                    ? `<video src="${escapeWallpaperHtml(wallpaper.url)}" muted loop playsinline preload="auto"></video>`
                    : `<img src="${escapeWallpaperHtml(wallpaper.url)}" alt="${escapeWallpaperHtml(wallpaper.title)}" loading="lazy">`
            }

            <div class="wallpaper-card-title">
                ${escapeWallpaperHtml(wallpaper.title)}
                ${isVideo ? '<span class="wallpaper-media-tag">MP4</span>' : ''}
            </div>
        `;

        card.addEventListener('click', () => {
            previewWallpaper(wallpaper.url, wallpaper.title);
        });

        if (isVideo) {
const video = card.querySelector('video');

if (video) {
    attachWallpaperVideoDiagnostics(video, card, wallpaper.url);
    warmWallpaperVideo(wallpaper.url);
}

card.addEventListener('mouseenter', () => {
    if (video) {
        video.preload = 'auto';
        video.play().catch(() => {});
    }
});

card.addEventListener('mouseleave', () => {
    if (video) {
        video.pause();
        video.currentTime = 0;
    }
});
        }

        strip.appendChild(card);
    });
}


function buildWallpaperSheetPayload(existingPayload, title, url) {
    const cleanedExisting = String(existingPayload || '')
        .replace(/\r\n/g, '\n')
        .trim()
        .replace(/\n?\s*-{3,}\s*$/, '')
        .trim();

    const newBlock = `${title}\n${url}`;

    if (!cleanedExisting) {
        return `${newBlock}\n${WALLPAPER_ENTRY_SEPARATOR}`;
    }

    return `${cleanedExisting}\n${WALLPAPER_ENTRY_SEPARATOR}\n${newBlock}\n${WALLPAPER_ENTRY_SEPARATOR}`;
}

async function getEditableWallpaperSheetRow() {
    const response = await fetch(
        `${gasWebAppUrl}?api=devtools&t=${Date.now()}`,
        {
            cache: 'no-store'
        }
    );

    const result = await response.json();

    if (!result.ok) {
        throw new Error(
            result.message || 'Could not load the editable wallpaper row.'
        );
    }

    const rows = Array.isArray(result.rows) ? result.rows : [];

    const wallpaperRow = rows.find(row =>
        String(row.key || '').trim().toUpperCase() === WALLPAPER_SHEET_KEY
    );

    if (!wallpaperRow || !wallpaperRow._row) {
        throw new Error(`Sheet row not found: ${WALLPAPER_SHEET_KEY}`);
    }

    return wallpaperRow;
}

async function addWallpaperToSheet() {
    const titleInput = document.getElementById('wallpaperAddTitle');
    const urlInput = document.getElementById('wallpaperAddUrl');
    const addButton = document.getElementById('wallpaperAddButton');

    const title = String(titleInput?.value || '').trim();
    const url = String(urlInput?.value || '').trim();

    if (!title) {
        showToast('Enter a wallpaper title.');
        titleInput?.focus();
        return;
    }

    if (!/^https?:\/\//i.test(url)) {
        showToast('Enter a valid http(s) wallpaper URL.');
        urlInput?.focus();
        return;
    }

    if (!isImageWallpaperUrl(url) && !isVideoWallpaperUrl(url)) {
        showToast('URL must be a supported image or MP4 URL.');
        urlInput?.focus();
        return;
    }

    if (wallpaperGalleryCache.some(item => item.url === url)) {
        showToast('That wallpaper URL is already in the gallery.');
        return;
    }

    const originalButtonText = addButton?.textContent || '+ Add';

    if (addButton) {
        addButton.disabled = true;
        addButton.textContent = 'Adding...';
    }

    try {
        const editableRow = await getEditableWallpaperSheetRow();

        const currentPayload = String(editableRow.description || '');

        const updatedPayload = buildWallpaperSheetPayload(
            currentPayload,
            title,
            url
        );

        const response = await fetch(gasWebAppUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify({
                action: 'edit',
                row: editableRow._row,
                key: editableRow.key || WALLPAPER_SHEET_KEY,
                description: updatedPayload
            })
        });

        const result = await response.json();

        if (!result.ok) {
            throw new Error(
                result.message || 'Wallpaper could not be added.'
            );
        }

        const publicRow = getWallpaperSheetRow();

        if (publicRow) {
            publicRow.payload = updatedPayload;
        }

        const cachedDevRow = Array.isArray(devToolsRows)
            ? devToolsRows.find(
                row => Number(row._row) === Number(editableRow._row)
            )
            : null;

        if (cachedDevRow) {
            cachedDevRow.description = updatedPayload;
        }

        wallpaperGalleryCache = parseWallpaperPayload(updatedPayload);

        renderWallpaperGallery(wallpaperGalleryCache);
        warmWallpaperPreviewVideos(wallpaperGalleryCache);

        if (titleInput) titleInput.value = '';
        if (urlInput) urlInput.value = '';

        const strip = document.getElementById('wallpaperGalleryStrip');

        if (strip) {
            requestAnimationFrame(() => {
                strip.scrollTo({
                    left: strip.scrollWidth,
                    behavior: 'smooth'
                });
            });
        }

        showToast(`Added wallpaper: ${title}`);
        addSystemLog(`Wallpaper added to ${WALLPAPER_SHEET_KEY}: ${title}`);
    } catch (error) {
        showToast(`Wallpaper add failed: ${error.message}`);
        addSystemLog(`Wallpaper add error: ${error.message}`);
    } finally {
        if (addButton) {
            addButton.disabled = false;
            addButton.textContent = originalButtonText;
        }
    }
}

function previewWallpaper(url, title) {
    wallpaperDraftUrl = String(url || '').trim();
    wallpaperDraftTitle = String(title || '').trim();

    if (!wallpaperDraftUrl) {
        showToast('Wallpaper URL missing.');
        return;
    }

    setDashboardWallpaper(wallpaperDraftUrl, wallpaperDraftStrength);
    renderWallpaperGallery(wallpaperGalleryCache);

    showToast(`Previewing wallpaper: ${wallpaperDraftTitle || 'Untitled'}`);
}

function saveWallpaperSelection() {
    const selectedUrl = String(wallpaperDraftUrl || '').trim();
    const selectedStrength = Math.max(
        0.08,
        Math.min(0.75, Number(wallpaperDraftStrength) || 0.32)
    );

    if (!selectedUrl) {
        showToast('No wallpaper selected.');
        return;
    }

    localStorage.setItem(WALLPAPER_STORAGE_KEY, selectedUrl);
    localStorage.setItem(WALLPAPER_STRENGTH_STORAGE_KEY, String(selectedStrength));
    localStorage.setItem(WALLPAPER_MODE_STORAGE_KEY,'manual');
    localStorage.setItem(
  WALLPAPER_TONE_STORAGE_KEY,
  wallpaperDraftTone
);

    wallpaperDraftStrength = selectedStrength;
    setDashboardWallpaper(
  selectedUrl,
  selectedStrength,
  wallpaperDraftTone
);

    const modal = document.getElementById('wallpaperModal');
    if (modal) modal.classList.remove('open');

    showToast(`Wallpaper saved locally · BG ${Math.round(selectedStrength * 100)}%`);
}

function cancelWallpaperSelection() {
  const savedUrl =
    getSavedWallpaperUrl();

  const savedStrength =
    getSavedWallpaperStrength();

  const savedTone =
    localStorage.getItem(
      WALLPAPER_TONE_STORAGE_KEY
    ) || 'light';

  wallpaperDraftUrl =
    savedUrl;

  wallpaperDraftTitle =
    '';

  wallpaperDraftStrength =
    savedStrength;

  wallpaperDraftTone =
    savedTone;

  if (savedUrl) {
    setDashboardWallpaper(
      savedUrl,
      savedStrength,
      savedTone
    );
  } else {
    setDashboardWallpaper('');
  }

  const modal =
    document.getElementById(
      'wallpaperModal'
    );

  if (modal) {
    modal.classList.remove('open');
  }

  showToast(
    'Wallpaper change cancelled.'
  );
}

let indonesiaClockTimer = null;

function updateIndonesiaClock() {
    const dateElement =
        document.getElementById('indonesiaDate');

    const timeElement =
        document.getElementById('indonesiaTime');

    if (!dateElement || !timeElement) {
        return;
    }

    const now = new Date();

    const dateFormatter =
        new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Jakarta',
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });

    const timeFormatter =
        new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Jakarta',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });

    dateElement.textContent =
        dateFormatter.format(now);

    timeElement.textContent =
        `${timeFormatter.format(now)} WIB`;
}

function startIndonesiaClock() {
    clearInterval(indonesiaClockTimer);

    updateIndonesiaClock();

    indonesiaClockTimer =
        setInterval(updateIndonesiaClock, 1000);
}


window.onload = function() {
    loadPredictionTimeConfig();
    loadSavedWallpaper();
    loadOfflineDatabaseFromStorage();
    ensureLocalStickyNote();
    renderPortal();
    changeToRandomGif();
    renderSearchHistory();
    syncGoogleSheetData().then(() => {
    loadRandomWallpaper();
});
    loadUserScripts({ silent: true });
    const gifFrame = document.querySelector('.blank-character-frame');
    if (gifFrame) {
        gifFrame.addEventListener('click', () => {
            changeToRandomGif(); triggerGifFlip(); showToast("Shifting avatar transmission matrix...");
        });
    }
    setInterval(triggerGifFlip, 12000); 

    const mainTextarea = document.getElementById('primaryGasArea');

if (mainTextarea) {
    mainTextarea.addEventListener('input', handleStickyNoteAutosave);

    mainTextarea.addEventListener('blur', () => {
        if (getActiveStickyNote()) {
            renderPortal({ resetWorkspace: false });
        }
    });
}
};


function initializeJrpgToastDismiss() {
  const character =
    document.getElementById("jrpgToastCharacter");

  if (
    !character ||
    character.dataset.dismissBound === "true"
  ) {
    return;
  }

  character.dataset.dismissBound = "true";

  character.addEventListener(
    "click",
    dismissJrpgToast
  );
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeJrpgToastDismiss
  );
} else {
  initializeJrpgToastDismiss();
}

function handleWallpaperToneChange(value) {
  wallpaperDraftTone =
    ['light', 'neutral', 'dark']
      .includes(value)
      ? value
      : 'light';

  const activeUrl =
    wallpaperDraftUrl ||
    getSavedWallpaperUrl();

  if (activeUrl) {
    setDashboardWallpaper(
      activeUrl,
      wallpaperDraftStrength,
      wallpaperDraftTone
    );
  }
}
