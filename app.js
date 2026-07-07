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

let googleSheetData = []; 
let predictionCards = [];
let focusedSuggestionIndex = -1; 
let isArchiveOpen = false;

let offlineDatabase = {
    mainGasLink: "https://tinyurl.com/Noro11",
    primaryGAS: "// Your centerpiece code environment connected to your tinyurl script structure\nfunction coreAutomation() {\n  console.log('Running seamlessly from your custom dashboard centerpiece.');\n}",
    bottomSnippets: [
        { id: 1, title: "Tampermonkey Macro", content: "// userscript configurations..." },
        { id: 2, title: "Discord Webhook Text", content: "Random notation blocks saved locally." }
    ]
};

const softMangaColors = [
    '#f4f3ef', '#e3ebd9', '#e5e1d5', '#ebdccb', '#d6e2e6', '#ebd8da'
];

let activeDeleteTargetId = null;
let currentLondonStep = 0; 
let selectedPieceCoord = null; 
let chessBoardState = {};

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
    chessLockContext = context;
    currentLondonStep = 0;
    selectedPieceCoord = null;
    resetSicilianBoardState();
    currentSicilianGridLayout = getRandomizedSicilianLayout(); // Shuffle once
    renderSicilianChessBoard();
    document.getElementById('chessStepIndicator').innerText = "SEQUENCE LOCK: STAGE 1 ACTIVE";
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
            currentLondonStep = 0;
            selectedPieceCoord = null;
            resetSicilianBoardState();
            renderSicilianChessBoard();
            document.getElementById('chessStepIndicator').innerText =
                "SECURITY ALERT: SICILIAN RESET";
            showToast("BLUNDER! Access Denied.");
            changeToRandomGif();
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
        renderPredictionCards();
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

    cardsToRender.forEach((card, index) => {
        const cardEl = document.createElement('div');
        const randomBg = softMangaColors[index % softMangaColors.length] || '#f4f3ef';
        const randomTilt = (Math.random() * 3 - 1.5).toFixed(2);

        cardEl.className = 'prediction-card';
        cardEl.style.background = randomBg;
        cardEl.style.setProperty('--card-tilt', `${randomTilt}deg`);
        cardEl.style.transform = `rotate(${randomTilt}deg)`;

        cardEl.innerHTML = `
            <div class="prediction-card-pin">●</div>

            <div class="prediction-card-topline">
                <h4 class="prediction-card-title">${escapeHtml(card.title)}</h4>
                <button class="manga-btn prediction-copy-btn" onclick='copyPredictionCardContent(${JSON.stringify(card.id)})'>Copy</button>
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

    navigator.clipboard.writeText(card.content || '')
        .then(() => showToast('Prediction content copied.'))
        .catch(() => showToast('Copy failed.'));
}

function copyVisiblePredictionCards() {
    const visibleCards = getVisiblePredictionCards();

    if (!visibleCards.length) {
        showToast('No visible prediction cards to copy.');
        return;
    }

    const text = visibleCards
        .map(card => `${card.title}\n${card.content}`)
        .join('\n\n---\n\n');

    navigator.clipboard.writeText(text)
        .then(() => showToast(`Copied ${visibleCards.length} visible prediction cards.`))
        .catch(() => showToast('Copy failed.'));
}

function clearPredictionSearch() {
    const input = document.getElementById('predictionSearchInput');

    if (input) input.value = '';

    renderPredictionCards(predictionCards);
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
    
    if (!payloadOutput || !payloadOutput.value || payloadOutput.value.startsWith("❌")) {
        showToast("Error: No valid content loaded to copy.");
        return;
    }
    
    payloadOutput.select();
    navigator.clipboard.writeText(payloadOutput.value)
        .then(() => {
            showToast("Copied content! Resetting workspace matrix...");
        })
        .catch(() => {
            showToast("Clipboard fallback executed.");
        })
        .finally(() => {
            // 🌟 Executing in finally guarantees the box is cleared no matter what!
            if (searchInput) {
                searchInput.value = "";
            }
            clearAndHideSearch();
        });
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
        const searchTabVisible = document.getElementById('searchMenuTab').style.display !== 'none';
        if (searchTabVisible) {
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
    openChessLock({ type: 'devtools' }, "Execute London Line to Authorize Dev Access");
}

function deleteSnippet(id) {
    openChessLock({ type: 'delete', payload: id }, "Execute London Line to Authorize Deletion");
}

let currentChessGridLayout = null; // Add this as a global variable near the top with other chess vars

function openChessLock(context, promptText) {
    chessLockContext = context;
    currentLondonStep = 0;
    selectedPieceCoord = null;
    resetChessBoardState();
    currentChessGridLayout = getRandomizedGridLayout(); // SHUFFLE ONCE HERE
    renderChessBoard();
    document.getElementById('chessStepIndicator').innerText = "SEQUENCE LOCK: INITIATE MOVE 1";
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
            currentLondonStep = 0; selectedPieceCoord = null;
            resetChessBoardState(); renderChessBoard();
            document.getElementById('chessStepIndicator').innerText = "SECURITY ALERT: MATRIX RESET";
            showToast("BLUNDER! Access Denied.");
            changeToRandomGif();
        }
    }
}

function executeMove(fromCoord, toCoord) {
    chessBoardState[toCoord] = chessBoardState[fromCoord];
    chessBoardState[fromCoord] = '';
    selectedPieceCoord = null;

    if (
        chessLockContext.type === 'userScriptEdit' ||
        chessLockContext.type === 'userScriptDelete'
    ) {
        renderSicilianChessBoard();
    } else {
        renderChessBoard();
    }
}

function executeChessSuccess() {
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
    }
    closeChessModal();
    changeToRandomGif();
}

async function loadUserScripts(options = {}) {
    const { silent = true } = options;

    if (isLoadingUserScripts) return;
    isLoadingUserScripts = true;

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
        isLoadingUserScripts = false;
    }
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

    textarea.classList.remove('page-turn');

    // Force browser to restart the animation even if the class was just used.
    void textarea.offsetWidth;

    textarea.classList.add('page-turn');

    clearTimeout(textarea._pageTurnTimer);
    textarea._pageTurnTimer = setTimeout(() => {
        textarea.classList.remove('page-turn');
    }, 280);
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
        await loadUserScripts({ silent: true });
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

        card.className = 'snippet-card';
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
    openUserScriptChessLock({ type: 'userScriptEdit', payload: fileID }, "Execute Sicilian Defense to Authorize Edit");
}

function openUserScriptDeleteChess(fileID) {
    openUserScriptChessLock({ type: 'userScriptDelete', payload: fileID }, "Execute Sicilian Defense to Authorize Deletion");
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
loadUserScripts({ silent: true });
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
        loadUserScripts();
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
        card.className = 'snippet-card';
        card.style.backgroundColor = randomBg;
        card.innerHTML = `
            <div style="overflow: hidden;">
                <strong style="display:block; margin-bottom:4px; font-size:14px;">${escapeHtml(item.title)}</strong>
                <p style="font-size:11px; color:#55555d; margin:0; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHtml(item.content)}</p>
            </div>
            <div style="display: flex; gap: 6px; justify-content: flex-end; margin-top: 8px;">
                <button class="manga-btn danger" style="font-size:11px; padding:3px 8px;" onclick="deleteSnippet(${Number(item.id)})">Delete</button>
                <button class="manga-btn" style="font-size:11px; padding:3px 8px;" onclick="viewSnippet(${Number(item.id)})">Swap View</button>
            </div>
        `;
        bottomGrid.appendChild(card);
    });

    renderUserScriptCards();
}

function viewSnippet(id) {
    const textarea = document.getElementById('primaryGasArea');
    const item = offlineDatabase.bottomSnippets.find(x => x.id === id);

    if (item) {
        clearDriveNoteWorkspaceState();

        currentSnippetBeingEdited = id;
        textarea.classList.add('page-turn');

        setTimeout(() => {
            textarea.value = item.content;
            textarea.classList.remove('page-turn');
            showToast(`Loaded local note: "${item.title}". Press Save to update this note.`);
            changeToRandomGif();
        }, 220);
    }
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

function switchTab(tabName) {
    const dashTab = document.getElementById('dashboardTab');
    const searchTab = document.getElementById('searchMenuTab');
    const predictionTab = document.getElementById('predictionTab');
    const logsTab = document.getElementById('logsTab');
    const devTab = document.getElementById('devToolsTab');
    const navLinks = document.querySelectorAll('.nav-links a');

    navLinks.forEach(link => link.classList.remove('active'));

    if (dashTab) dashTab.style.display = 'none';
    if (searchTab) searchTab.style.display = 'none';
    if (predictionTab) predictionTab.style.display = 'none';
    if (logsTab) logsTab.style.display = 'none';
    if (devTab) devTab.style.display = 'none';

    const suggestions = document.getElementById('searchSuggestions');
    if (suggestions) suggestions.style.display = "none";

    const archive = document.getElementById('sheetArchiveArea');
    if (archive) archive.style.display = "none";

    isArchiveOpen = false;

    if (tabName === 'dashboard') {
        if (dashTab) dashTab.style.display = 'flex';
        if (navLinks[0]) navLinks[0].classList.add('active');
        showToast("Switched to Main Command Dashboard");

    } else if (tabName === 'searchTab') {
        if (searchTab) searchTab.style.display = 'flex';
        if (navLinks[1]) navLinks[1].classList.add('active');

        showToast("Switched to Sheet Search Engine");

        const searchInput = document.getElementById('sheetKeySearch');
        if (searchInput) searchInput.value = "";

        clearAndHideSearch();

} else if (tabName === 'prediction') {
    if (predictionTab) predictionTab.style.display = 'flex';
    if (navLinks[2]) navLinks[2].classList.add('active');

    clearPredictionSearch();
    renderPredictionCards();
    showToast("Viewing Prediction Cards");
} else if (tabName === 'logs') {
        if (logsTab) logsTab.style.display = 'flex';
        if (navLinks[3]) navLinks[3].classList.add('active');

        showToast("Viewing Core System Performance Records");

    } else if (tabName === 'devTools') {
        if (devTab) devTab.style.display = 'flex';
        if (navLinks[4]) navLinks[4].classList.add('active');

        showToast("DEV TOOLS ACCESS GRANTED");
    }

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

function showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    container.style.pointerEvents = 'none';
    
    const toast = document.createElement('div');
    toast.className = 'toast-banner';

    toast.style.background = 'var(--ink-black, #111)';
    toast.style.color = 'var(--bg-paper, #fff)';
    toast.style.border = '2px solid var(--ink-black)';
    toast.style.padding = '8px 12px';
    toast.style.marginBottom = '8px';
    toast.style.fontWeight = 'bold';
    toast.style.fontSize = '11px';
    toast.style.lineHeight = '1.25';
    toast.style.boxShadow = '4px 4px 0px var(--ink-black)';
    toast.style.maxWidth = '260px';
    toast.style.width = 'fit-content';
    toast.style.marginLeft = 'auto';
    toast.style.whiteSpace = 'normal';
    toast.style.overflowWrap = 'anywhere';
    toast.style.pointerEvents = 'none';

    toast.innerText = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2200);
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
        pillWrapper.style.transform = `rotate(${randomTilt}deg)`;
        pillWrapper.style.transition = "transform 0.05s ease, opacity 0.1s ease";

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
        pinButton.textContent = item.pinned ? '♝' : '♟';
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
                   <textarea data-field="description" style="width:100%; min-height:100px; max-height:200px; margin-top:0; box-sizing:border-box; font-size:12px; resize:vertical;">${escapeHtml(row.description)}</textarea>
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
    const now = Date.now();

    if (now - lastDriveSyncAt < 15000) return;

    lastDriveSyncAt = now;
    loadUserScripts({ silent: true });
}

window.addEventListener('focus', maybeSyncDriveNotes);

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        maybeSyncDriveNotes();
    }
});

function installCasualSourceGuard() {
    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        showToast('Source access disabled.');
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
            showToast('Inspector shortcut blocked.');
        }
    });
}

installCasualSourceGuard();




window.onload = function() {
    loadOfflineDatabaseFromStorage();
    renderPortal();
    changeToRandomGif();
    renderSearchHistory();
    syncGoogleSheetData();
    loadUserScripts();
    const gifFrame = document.querySelector('.blank-character-frame');
    if (gifFrame) {
        gifFrame.addEventListener('click', () => {
            changeToRandomGif(); triggerGifFlip(); showToast("Shifting avatar transmission matrix...");
        });
    }
    setInterval(triggerGifFlip, 12000); 
};
