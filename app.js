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
let googleSheetData = []; 
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
    } catch (error) {
        addSystemLog(`Cloud link error: ${error.message}`);
        showToast("Error pulling cloud sheets registry.");
    }
}

function parseCsvStrictAB(text) {
    googleSheetData = [];
    let lines = [];
    let row = [""];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        let c = text[i];
        let next = text[i+1];

        if (c === '"') {
            if (inQuotes && next === '"') { row[row.length - 1] += '"'; i++; }
            else { inQuotes = !inQuotes; }
        } else if (c === ',' && !inQuotes) {
            row.push("");
        } else if ((c === '\r' || c === '\n') && !inQuotes) {
            if (c === '\r' && next === '\n') { i++; }
            lines.push(row);
            row = [""];
        } else {
            row[row.length - 1] += c;
        }
    }
    if (row.length > 1 || row[0] !== "") lines.push(row);

    for (let i = 1; i < lines.length; i++) {
        let cols = lines[i];
        if (cols.length >= 2) {
            let colA = cols[0].trim();
            let colB = cols[1].trim(); 
            if (colA) {
                googleSheetData.push({ key: colA, payload: colB });
            }
        }
    }
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

function deleteSnippet(id) {
    activeDeleteTargetId = id; currentLondonStep = 0; selectedPieceCoord = null;
    resetChessBoardState(); renderChessBoard();
    document.getElementById('chessStepIndicator').innerText = "SEQUENCE LOCK: INITIATE MOVE 1";
    document.getElementById('chessAuthModal').classList.add('open');
}

function renderChessBoard() {
    const boardContainer = document.getElementById('mangaChessBoard');
    if (!boardContainer) return;
    boardContainer.innerHTML = '';
    
    const gridLayout = [
        { coord: 'c4', isDark: false }, { coord: 'd4', isDark: true },  { coord: 'e4', isDark: false },
        { coord: 'c3', isDark: true },  { coord: 'd3', isDark: false }, { coord: 'e3', isDark: true },
        { coord: 'c1', isDark: false }, { coord: 'd1', isDark: true },  { coord: 'f1', isDark: false }
    ];
    
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
            executeFinalDestruction();
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
    renderChessBoard();
}

function executeFinalDestruction() {
    const targetItem = offlineDatabase.bottomSnippets.find(x => x.id === activeDeleteTargetId);
    offlineDatabase.bottomSnippets = offlineDatabase.bottomSnippets.filter(x => x.id !== activeDeleteTargetId);
    renderPortal(); closeChessModal(); changeToRandomGif();
    showToast(`DESTRUCTION SUCCESS: Removed "${targetItem ? targetItem.title : 'Item'}"`);
}

function closeChessModal() {
    document.getElementById('chessAuthModal').classList.remove('open');
    activeDeleteTargetId = null; currentLondonStep = 0; selectedPieceCoord = null;
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

function renderPortal() {
    document.getElementById('primaryGasArea').value = offlineDatabase.primaryGAS;
    const bottomGrid = document.getElementById('bottomGrid');
    bottomGrid.innerHTML = '';

    offlineDatabase.bottomSnippets.forEach(item => {
        const randomBg = getRandomMangaColor();
        const card = document.createElement('div');
        card.className = 'snippet-card';
        card.style.backgroundColor = randomBg;
        card.innerHTML = `
            <div style="overflow: hidden;">
                <strong style="display:block; margin-bottom:4px; font-size:14px;">${item.title}</strong>
                <p style="font-size:11px; color:#55555d; margin:0; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${item.content}</p>
            </div>
            <div style="display: flex; gap: 6px; justify-content: flex-end; margin-top: 8px;">
                <button class="manga-btn danger" style="font-size:11px; padding:3px 8px;" onclick="deleteSnippet(${item.id})">Delete</button>
                <button class="manga-btn" style="font-size:11px; padding:3px 8px;" onclick="viewSnippet(${item.id})">Swap View</button>
            </div>
        `;
        bottomGrid.appendChild(card);
    });
}

function viewSnippet(id) {
    const textarea = document.getElementById('primaryGasArea');
    const item = offlineDatabase.bottomSnippets.find(x => x.id === id);
    if (item) {
        textarea.classList.add('page-turn');
        setTimeout(() => {
            textarea.value = item.content;
            textarea.classList.remove('page-turn');
            showToast(`Loaded: "${item.title}"`);
            changeToRandomGif();
        }, 220);
    }
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
    const logsTab = document.getElementById('logsTab');
    const navLinks = document.querySelectorAll('.nav-links a');

    navLinks.forEach(link => link.classList.remove('active'));
    dashTab.style.display = 'none';
    searchTab.style.display = 'none';
    logsTab.style.display = 'none';

    document.getElementById('searchSuggestions').style.display = "none";
    document.getElementById('sheetArchiveArea').style.display = "none";
    isArchiveOpen = false;

    if (tabName === 'dashboard') {
        dashTab.style.display = 'grid';
        navLinks[0].classList.add('active');
        showToast("Switched to Main Command Dashboard");
    } else if (tabName === 'searchTab') {
        searchTab.style.display = 'grid';
        navLinks[1].classList.add('active');
        showToast("Switched to Sheet Search Engine");
        document.getElementById('sheetKeySearch').value = ""; 
        clearAndHideSearch();
    } else if (tabName === 'logs') {
        logsTab.style.display = 'grid';
        navLinks[2].classList.add('active');
        showToast("Viewing Core System Performance Records");
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
        offlineDatabase.bottomSnippets.push({ id: Date.now(), title: name, content: "// Empty markdown or script entry" });
        renderPortal(); closeModal(); changeToRandomGif();
        showToast(`Created block: "${name}"`);
    } else {
        showToast("Error: Name cannot be blank!");
    }
}

function launchMainGAS() { window.open(offlineDatabase.mainGasLink, '_blank'); showToast("Launching main script portal via tinyurl..."); }
function savePrimaryGAS() { offlineDatabase.primaryGAS = document.getElementById('primaryGasArea').value; showToast("Changes synced to local workspace memory!"); }

function addSystemLog(text) {
    const area = document.getElementById('systemLogsArea');
    if (area) area.value += `\n[${new Date().toLocaleTimeString()}] ${text}`;
}

document.addEventListener('click', function(e) {
    const box = document.getElementById('searchSuggestions');
    const input = document.getElementById('sheetKeySearch');
    if (box && e.target !== box && e.target !== input) {
        box.style.display = "none";
    }
});

function showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = 'toast-banner'; // Ensure this matches your style.css rules
    toast.style.background = 'var(--ink-black, #111)';
    toast.style.color = 'var(--bg-paper, #fff)';
    toast.style.border = '2px solid var(--ink-black)';
    toast.style.padding = '10px 16px';
    toast.style.marginBottom = '8px';
    toast.style.fontWeight = 'bold';
    toast.style.fontSize = '12px';
    toast.style.boxShadow = '4px 4px 0px var(--ink-black)';
    toast.innerText = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}


const MAX_HISTORY = 5; // Limits history to the last 5 unique searches

// 1. Core Logic: Save a selected title to localStorage
function saveToSearchHistory(key) {
    let history = JSON.parse(localStorage.getItem('mangaSearchHistory')) || [];
    
    // Remove if it already exists (so it bumps to the front of the list)
    history = history.filter(item => item !== key);
    
    // Add to the front of the array
    history.unshift(key);
    
    // Cap at maximum history limit
    if (history.length > MAX_HISTORY) {
        history.pop();
    }
    
    localStorage.setItem('mangaSearchHistory', JSON.stringify(history));
    renderSearchHistory();
}

// 2. UI Logic: Render the mini Neo-Brutalist history pills
function renderSearchHistory() {
    const container = document.getElementById('searchHistoryContainer');
    if (!container) return;
    
    const history = JSON.parse(localStorage.getItem('mangaSearchHistory')) || [];
    
    if (history.length === 0) {
        container.innerHTML = "";
        return;
    }
    
    // Build the layout header + pills
    container.innerHTML = `<span style="font-size: 11px; font-weight: 900; opacity: 0.5; display: block; width: 100%; margin-bottom: 2px;">RECENTS:</span>`;
    
    history.forEach(key => {
        const pill = document.createElement('div');
        pill.innerText = key;
        
        // Stylized Mini Neo-Brutalist Comic Badge Look
        pill.style.background = "#fff";
        pill.style.border = "2px solid #111";
        pill.style.boxShadow = "2px 2px 0px #111";
        pill.style.padding = "4px 8px";
        pill.style.fontSize = "11px";
        pill.style.fontWeight = "bold";
        pill.style.cursor = "pointer";
        pill.style.textTransform = "uppercase";
        pill.style.transition = "all 0.05s ease";
        
        // Hover dynamics
        pill.onmouseenter = () => { pill.style.transform = "translate(-1px, -1px)"; pill.style.boxShadow = "3px 3px 0px #111"; };
        pill.onmouseleave = () => { pill.style.transform = "none"; pill.style.boxShadow = "2px 2px 0px #111"; };
        
        // 3. Execution Click: Simulates an archive card click perfectly
        pill.onclick = () => {
            const match = googleSheetData.find(row => row.key.toUpperCase() === key.toUpperCase());
            if (match) {
                // Instantly force-fill input value
                const searchInput = document.getElementById('sheetKeySearch');
                if (searchInput) searchInput.value = match.key;
                
                // Directly bypass dropdown logic and show data views instantly
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
                
                // Bump this item to the front of history again
                saveToSearchHistory(match.key);
            }
        };
        
        container.appendChild(pill);
    });
}

window.onload = function() {
    renderPortal();
    changeToRandomGif();
    renderSearchHistory();
    syncGoogleSheetData();
    const gifFrame = document.querySelector('.blank-character-frame');
    if (gifFrame) {
        gifFrame.addEventListener('click', () => {
            changeToRandomGif(); triggerGifFlip(); showToast("Shifting avatar transmission matrix...");
        });
    }
    setInterval(triggerGifFlip, 12000); 
};
