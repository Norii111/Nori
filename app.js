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

let offlineDatabase = JSON.parse(localStorage.getItem('mangaOfflineDB')) || {
    githubToken: "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", // Must be hardcoded to survive app refreshes!
    githubOwner: "Norii111",                            // Matches your exact account layout
    githubRepo: "Nori",                                 // Capital 'N' to exactly match your repository name
    mainGasLink: "https://tinyurl.com/Noro11",
    primaryGAS: "// Workspace",
    bottomSnippets: []                                  // Your notes collect cleanly here
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
        renderPredictionCards(); 
    } catch (error) {
        addSystemLog(`Cloud link error: ${error.message}`);
        showToast("Error pulling cloud sheets registry.");
    }
}

// FIXED: Robust CSV parser ensuring multi-line fields inside Column F don't get truncated
function parseCsvStrictAB(text) {
    googleSheetData = [];
    let lines = [];
    let row = [""];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        let c = text[i];
        let next = text[i+1];

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
        // Must ensure there are enough entries processed to parse out Column E and F safely
        if (cols.length >= 2) {
            let colA = cols[0] ? cols[0].trim() : "";
            let colB = cols[1] ? cols[1].trim() : ""; 
            let colE = cols[4] ? cols[4].trim() : "";
            let colF = cols[5] ? cols[5].trim() : "";
            
            if (colA || colE || colF) {
                googleSheetData.push({ 
                    key: colA, 
                    payload: colB, 
                    predTitle: colE, 
                    predContent: colF 
                });
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
    
    const filteredMatches = googleSheetData.filter(row => row.key && row.key.toUpperCase().includes(searchKey));
    
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

    saveToSearchHistory(match.key);
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
            if (searchInput) {
                searchInput.value = "";
            }
            clearAndHideSearch();
        });
}

function toggleArchiveView() {
    const archiveBox = document.getElementById('sheetArchiveArea');
    const searchInput = document.getElementById('sheetKeySearch');
    
    if (isArchiveOpen) {
        if (archiveBox) archiveBox.style.display = "none";
        isArchiveOpen = false;
    } else {
        if (searchInput) searchInput.value = ""; 
        clearAndHideSearch();
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

    archiveBox.style.setProperty('display', 'flex', 'important');
    archiveBox.style.setProperty('flex-direction', 'row', 'important');
    archiveBox.style.setProperty('flex-wrap', 'wrap', 'important');
    archiveBox.style.setProperty('gap', '16px', 'important');
    archiveBox.style.setProperty('padding', '20px 10px', 'important');
    archiveBox.style.setProperty('justify-content', 'flex-start', 'important');
    
    archiveBox.innerHTML = "";
    const totalItems = googleSheetData.length;

    googleSheetData.forEach((row, idx) => {
        if (!row.key) return; // Skip rows lacking search titles
        const rowDiv = document.createElement('div');
        rowDiv.style.boxSizing = "border-box";
        rowDiv.style.width = "calc(20% - 13px)"; 
        rowDiv.style.minWidth = "180px";        
        rowDiv.style.height = "220px";          
        
        rowDiv.style.border = "4px solid var(--ink-black, #111)";
        rowDiv.style.background = softMangaColors[idx % softMangaColors.length] || "#fff";
        rowDiv.style.padding = "14px";
        rowDiv.style.cursor = "pointer";
        rowDiv.style.display = "flex";
        rowDiv.style.flexDirection = "column";
        rowDiv.style.position = "relative";
        rowDiv.style.transition = "transform 0.1s ease, box-shadow 0.1s ease";
        rowDiv.style.boxShadow = "6px 6px 0px var(--ink-black, #111)";

        const randomTilt = (Math.random() * 5 - 2.5).toFixed(2);
        rowDiv.style.transform = `rotate(${randomTilt}deg)`;

        let timelineTag = "";
        if (idx === totalItems - 1) {
            timelineTag = "<span style='background:#f39c12; color:#000; font-size:9px; padding:2px 4px; border:2px solid #111; margin-bottom:4px; display:inline-block; font-weight:900;'>NEW</span>";
        }

        rowDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
                <div style="max-width: 75%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${timelineTag}
                    <strong style="font-size:15px; font-family:inherit; text-transform:uppercase; letter-spacing:-0.5px; display:block;">${row.key}</strong>
                </div>
                <span style="font-size:10px; font-weight:bold; opacity:0.6; font-family:inherit;">#${idx + 2}</span>
            </div>
            <hr style="border: none; border-top: 3px solid var(--ink-black, #111); margin: 4px 0 8px 0; padding:0;">
            <div style="font-size:12px; font-family:inherit; color:#111; line-height:1.4; flex-grow:1; overflow:hidden; display:-webkit-box; -webkit-line-clamp:7; -webkit-box-orient:vertical; white-space:pre-wrap; word-break:break-word;">${row.payload}</div>
        `;

        rowDiv.onmouseenter = () => {
            rowDiv.style.transform = `rotate(${randomTilt}deg) translate(-2px, -2px)`;
            rowDiv.style.boxShadow = "8px 8px 0px var(--ink-black, #111)";
        };
        rowDiv.onmouseleave = () => {
            rowDiv.style.transform = `rotate(${randomTilt}deg)`;
            rowDiv.style.boxShadow = "6px 6px 0px var(--ink-black, #111)";
        };

        rowDiv.onclick = (e) => {
            e.stopPropagation();
            const searchInput = document.getElementById('sheetKeySearch');
            if (searchInput) searchInput.value = row.key;
            
            const payloadOutput = document.getElementById('sheetPayloadArea');
            const actionsHeader = document.getElementById('searchActionsHeader');
            const buttonGroup = document.getElementById('searchButtonGroup');

            if (payloadOutput && actionsHeader && buttonGroup) {
                payloadOutput.value = row.payload;
                payloadOutput.style.display = "block";
                actionsHeader.style.display = "flex";
                buttonGroup.style.display = "flex";
            }
            
            const suggestionsBox = document.getElementById('searchSuggestions');
            if (suggestionsBox) {
                suggestionsBox.innerHTML = "";
                suggestionsBox.style.setProperty('display', 'none', 'important');
            }

            archiveBox.style.display = "none";
            isArchiveOpen = false;
            saveToSearchHistory(row.key);
        };

        archiveBox.appendChild(rowDiv);
    });
}

// FIXED: Comprehensive prediction element renderer with min-height overrides to keep raw Column F entries text full 
function renderPredictionCards() {
    const container = document.getElementById('predictionCardGrid');
    if (!container) return;
    container.innerHTML = "";

    const validPreds = googleSheetData.filter(row => row.predTitle || row.predContent);

    if (validPreds.length === 0) {
        container.innerHTML = "<p style='font-weight:bold; font-size:13px; text-align:center; width:100%; margin-top:20px;'>Matrix registries empty inside Columns E/F ranges.</p>";
        return;
    }

    // Force the wrapper layout to abandon uniform row heights completely
    container.style.setProperty('display', 'flex', 'important');
    container.style.setProperty('flex-wrap', 'wrap', 'important');
    container.style.setProperty('gap', '20px', 'important');
    container.style.setProperty('align-items', 'flex-start', 'important'); // Crucial for variable card heights

    validPreds.forEach((row, idx) => {
        const card = document.createElement('div');
        const randomBg = softMangaColors[idx % softMangaColors.length] || "#fff";

        card.className = "prediction-item-card";
        card.style.boxSizing = "border-box";
        card.style.width = "calc(25% - 15px)"; 
        card.style.minWidth = "240px";
        card.style.height = "auto"; // Prevents stretching completely
        card.style.alignSelf = "flex-start"; 
        card.style.border = "3px solid var(--ink-black, #111)";
        card.style.background = randomBg;
        card.style.padding = "14px";
        card.style.display = "flex";
        card.style.flexDirection = "column";
        card.style.boxShadow = "5px 5px 0px var(--ink-black, #111)";
        card.style.transition = "transform 0.1s ease, box-shadow 0.1s ease";
        card.style.margin = "0 0 10px 0";

        // Card Content Structure
        card.innerHTML = `
            <strong style="font-size:14px; display:block; text-transform:uppercase; margin-bottom:2px; word-break:break-word;">${row.predTitle || 'UNTITLED MATRIX'}</strong>
            <hr style="border:none; border-top:2px solid var(--ink-black, #111); margin:6px 0;">
            <div style="font-size:12px; line-height:1.4; color:#111; white-space:pre-wrap; word-break:break-word; margin-bottom: 14px;">${row.predContent || 'No descriptor registers linked.'}</div>
        `;

        // Action Row Footer
        const actionRow = document.createElement('div');
        actionRow.style.display = "flex";
        actionRow.style.justifyContent = "flex-end";
        actionRow.style.borderTop = "2px dashed #111";
        actionRow.style.paddingTop = "8px";
        actionRow.style.marginTop = "auto";

        // Explicitly styled copy button so it displays cleanly regardless of your outer CSS structure
        const copyBtn = document.createElement('button');
        copyBtn.innerText = "📋 COPY CARD";
        copyBtn.style.background = "var(--ink-black, #111)";
        copyBtn.style.color = "var(--bg-paper, #fff)";
        copyBtn.style.border = "2px solid #111";
        copyBtn.style.fontSize = "10px";
        copyBtn.style.fontWeight = "bold";
        copyBtn.style.padding = "4px 8px";
        copyBtn.style.cursor = "pointer";
        copyBtn.style.boxShadow = "2px 2px 0px #111";

        copyBtn.onclick = (e) => {
            e.stopPropagation();
            const textToCopy = row.predContent || '';
            navigator.clipboard.writeText(textToCopy).then(() => {
                showToast("Card text sent to your clipboard!");
            });
        };

        actionRow.appendChild(copyBtn);
        card.appendChild(actionRow);

        card.onmouseenter = () => {
            card.style.transform = "translate(-2px, -2px)";
            card.style.boxShadow = "7px 7px 0px var(--ink-black, #111)";
        };
        card.onmouseleave = () => {
            card.style.transform = "none";
            card.style.boxShadow = "5px 5px 0px var(--ink-black, #111)";
        };

        container.appendChild(card);
    });
}

function filterPredictionCards() {
    const searchVal = document.getElementById('predictionSearch').value.trim().toUpperCase();
    const cards = document.querySelectorAll('#predictionCardGrid > div');
    
    cards.forEach(card => {
        // Targets text contents excluding the button text profile explicitly
        const titleText = card.querySelector('strong') ? card.querySelector('strong').innerText.toUpperCase() : '';
        const bodyText = card.querySelector('div') ? card.querySelector('div').innerText.toUpperCase() : '';
        
        if (titleText.includes(searchVal) || bodyText.includes(searchVal)) {
            card.style.display = "flex";
        } else {
            card.style.display = "none";
        }
    });
}

function switchTab(tabName) {
    const dashTab = document.getElementById('dashboardTab');
    const searchTab = document.getElementById('searchMenuTab');
    const predictionsTab = document.getElementById('predictionsTab');
    const logsTab = document.getElementById('logsTab');
    const navLinks = document.querySelectorAll('.nav-links a');

    navLinks.forEach(link => link.classList.remove('active'));
    
    dashTab.style.display = 'none';
    searchTab.style.display = 'none';
    predictionsTab.style.display = 'none';
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
    } else if (tabName === 'predictions') {
        predictionsTab.style.display = 'grid';
        navLinks[2].classList.add('active'); 
        showToast("Switched to Prediction Registry Deck");
        renderPredictionCards();
    } else if (tabName === 'logs') {
        logsTab.style.display = 'grid';
        navLinks[3].classList.add('active'); 
        showToast("Viewing Core System Performance Records");
    }
    changeToRandomGif();
}

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
    if (!bottomGrid) return;
    bottomGrid.innerHTML = '';

    offlineDatabase.bottomSnippets.forEach(item => {
        const randomBg = getRandomMangaColor();
        const card = document.createElement('div');
        card.className = 'snippet-card';
        card.style.backgroundColor = randomBg;
        card.innerHTML = `
    <div style="overflow: hidden;">
        <strong style="display:block; margin-bottom:4px; font-size:14px;">${item.title}</strong>
        <p style="font-size:11px; color:#55555d; margin:0; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">
            🌐 Auto-sync enabled
        </p>
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

function openModal() {
    document.getElementById('mangaModal').classList.add('open');
    document.getElementById('modalInput').value = '';
    document.getElementById('modalInput').focus();
}
var closeModal = () => document.getElementById('mangaModal').classList.remove('open');

function submitNewNote() {
    const name = document.getElementById('modalInput').value.trim();
    if (name) {
        // Create a safe-string filename for GitHub (lowercase, dashes instead of spaces)
        const safeFileName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const filePath = `scripts/${safeFileName}.user.js`;

        const newSnippet = { 
            id: Date.now(), 
            title: name, 
            filePath: filePath,
            content: "// Paste your massive userscript here\n" 
        };

        offlineDatabase.bottomSnippets.push(newSnippet);
        localStorage.setItem('mangaOfflineDB', JSON.stringify(offlineDatabase));
        
        renderPortal(); 
        closeModal(); 
        
        // Instantly activate this new note in your workspace view for editing
        viewSnippet(newSnippet.id);
        showToast(`Created slot: "${name}"`);
    } else {
        showToast("Error: Name cannot be blank!");
    }
}

function launchMainGAS() { window.open(offlineDatabase.mainGasLink, '_blank'); showToast("Launching main script portal via tinyurl..."); }
async function savePrimaryGAS() { 
    const mainTextarea = document.getElementById('primaryGasArea');
    if (!mainTextarea) return;

    const currentTextValue = mainTextarea.value;

    if (offlineDatabase.activeSnippetId) {
        // Find the note we are currently looking at
        const activeItem = offlineDatabase.bottomSnippets.find(x => x.id === offlineDatabase.activeSnippetId);
        if (activeItem) {
            // Step A: Save it locally immediately so you never lose it
            activeItem.content = currentTextValue;
            localStorage.setItem('mangaOfflineDB', JSON.stringify(offlineDatabase));
            showToast("Saved locally! Syncing to GitHub cloud...");

            // Step B: Fire it directly to GitHub without making you click anything else
            await pushSnippetToGitHub(activeItem.id);
        }
    } else {
        // Fallback for your centerpiece default workspace
        offlineDatabase.primaryGAS = currentTextValue;
        localStorage.setItem('mangaOfflineDB', JSON.stringify(offlineDatabase));
        showToast("Changes synced to baseline dashboard!");
    }
}

async function pushSnippetToGitHub(id) {
    const item = offlineDatabase.bottomSnippets.find(x => x.id === id);
    if (!item) return;

    const token = offlineDatabase.githubToken;
    const owner = offlineDatabase.githubOwner;
    const repo = offlineDatabase.githubRepo;

    if (!token || !owner || !repo) {
        showToast("⚠️ Local save OK, but missing GitHub credentials to push to cloud.");
        return;
    }

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${item.filePath}`;
    let currentSha = null;

    // Check for existing file SHA signature
    try {
        const checkResponse = await fetch(apiUrl, {
            headers: { "Authorization": `token ${token}` }
        });
        if (checkResponse.ok) {
            const fileData = await checkResponse.json();
            currentSha = fileData.sha;
        }
    } catch (e) { /* New file path */ }

    // Convert massive script safely to Base64
    const utf8Bytes = new TextEncoder().encode(item.content);
    const base64Content = btoa(String.fromCharCode(...utf8Bytes));

    const payload = {
        message: `Command Center Auto-Sync: ${item.title}`,
        content: base64Content
    };
    if (currentSha) payload.sha = currentSha;

    try {
        const response = await fetch(apiUrl, {
            method: "PUT",
            headers: {
                "Authorization": `token ${token}`,
                "Accept": "application/vnd.github.v3+json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("GitHub rejected upload pipeline.");
        showToast(`🚀 Cloud sync complete! Verified on GitHub.`);
    } catch (error) {
        showToast(`GitHub error: ${error.message}`);
    }
}

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
    toast.className = 'toast-banner'; 
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

const MAX_HISTORY = 20; 

function saveToSearchHistory(key) {
    let history = JSON.parse(localStorage.getItem('mangaSearchHistory')) || [];
    const exists = history.some(item => item.toUpperCase() === key.toUpperCase());
    
    if (!exists) {
        history.unshift(key);
        if (history.length > MAX_HISTORY) history.pop();
        localStorage.setItem('mangaSearchHistory', JSON.stringify(history));
        renderSearchHistory();
    }
}

function deleteSingleHistoryItem(key, event) {
    event.stopPropagation(); 
    let history = JSON.parse(localStorage.getItem('mangaSearchHistory')) || [];
    history = history.filter(item => item.toUpperCase() !== key.toUpperCase());
    localStorage.setItem('mangaSearchHistory', JSON.stringify(history));
    renderSearchHistory();
}

function clearAllSearchHistory() {
    localStorage.removeItem('mangaSearchHistory');
    renderSearchHistory();
    showToast("Cleared search history memory index.");
}

let draggedItemIndex = null;

function renderSearchHistory() {
    const container = document.getElementById('searchHistoryContainer');
    if (!container) return;
    
    const history = JSON.parse(localStorage.getItem('mangaSearchHistory')) || [];
    
    if (history.length === 0) {
        container.innerHTML = "";
        return;
    }
    
    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 4px;">
            <span style="font-size: 11px; font-weight: 900; opacity: 0.5;">RECENTS (DRAG TO REARRANGE):</span>
            <button onclick="clearAllSearchHistory()" style="background: none; border: none; font-size: 10px; font-weight: 900; color: #cc0000; cursor: pointer; text-transform: uppercase; text-decoration: underline; padding: 0;">[ Clear All ]</button>
        </div>
    `;
    
    history.forEach((key, idx) => {
        const pillWrapper = document.createElement('div');
        const randomBg = softMangaColors[idx % softMangaColors.length] || "#fff";
        const randomTilt = (Math.random() * 4 - 2).toFixed(2);
        
        pillWrapper.setAttribute("draggable", "true");
        pillWrapper.setAttribute("data-index", idx);
        
        pillWrapper.style.display = "inline-flex";
        pillWrapper.style.alignItems = "center";
        pillWrapper.style.gap = "6px";
        pillWrapper.style.background = randomBg;
        pillWrapper.style.border = "2px solid var(--ink-black, #111)";
        pillWrapper.style.boxShadow = "2px 2px 0px var(--ink-black, #111)";
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
                if(el.style.borderStyle === "dashed") el.style.borderStyle = "solid";
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
                let updatedHistory = JSON.parse(localStorage.getItem('mangaSearchHistory')) || [];
                const [reorderedItem] = updatedHistory.splice(draggedItemIndex, 1);
                updatedHistory.splice(idx, 0, reorderedItem);
                localStorage.setItem('mangaSearchHistory', JSON.stringify(updatedHistory));
                renderSearchHistory();
            }
        };
        
        pillWrapper.onclick = () => {
            const match = googleSheetData.find(row => row.key && row.key.toUpperCase() === key.toUpperCase());
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
        
        pillWrapper.innerHTML = `
            <span>${key}</span>
            <span onclick="deleteSingleHistoryItem('${key}', event)" style="margin-left: 4px; padding: 0 2px; color: #888; font-weight: 900; cursor: pointer; transition: color 0.1s;" onmouseover="this.style.color='#111'" onmouseout="this.style.color='#888'">×</span>
        `;
        
        container.appendChild(pillWrapper);
    });
}

// 1. UPDATED: Automatically scan and pull down your files from GitHub on boot
window.onload = async function() {
    renderPortal();
    changeToRandomGif();
    renderSearchHistory();
    syncGoogleSheetData();
    
    // Cloud Core: Download your userscripts folder straight from GitHub to build cards
    await syncSnippetsFromGitHub();

    const gifFrame = document.querySelector('.blank-character-frame');
    if (gifFrame) {
        gifFrame.addEventListener('click', () => {
            changeToRandomGif(); triggerGifFlip(); showToast("Shifting avatar transmission matrix...");
        });
    }
    setInterval(triggerGifFlip, 12000); 
};

// 2. NEW: The automated file scanner engine
async function syncSnippetsFromGitHub() {
    const token = offlineDatabase.githubToken;
    const owner = offlineDatabase.githubOwner;
    const repo = offlineDatabase.githubRepo;

    if (!token || !owner || !repo) return; // Silent skip if keys aren't set yet

    try {
        // Fetch the list of everything inside your scripts directory on GitHub
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/scripts`, {
            headers: { "Authorization": `token ${token}` }
        });

        if (!response.ok) {
            if (response.status === 404) console.log("Scripts directory does not exist on GitHub yet.");
            return;
        }

        const files = await response.json();
        
        // Clear old temporary local entries and rebuild from the cloud truth
        offlineDatabase.bottomSnippets = [];

        // Loop through every file found on GitHub and create a card for it
        for (let file of files) {
            if (file.type === "file" && file.name.endsWith(".user.js")) {
                // Format file name back into a readable title (e.g., "manga-refresher" -> "Manga Refresher")
                const cleanTitle = file.name
                    .replace(".user.js", "")
                    .replace(/-/g, " ")
                    .replace(/\b\w/g, c => c.toUpperCase());

                // Fetch the actual raw text content of this script from GitHub
                const contentResponse = await fetch(`${file.download_url}?cb=${Date.now()}`);
                const rawCode = contentResponse.ok ? await contentResponse.text() : "// Error loading stream";

                offlineDatabase.bottomSnippets.push({
                    id: Date.now() + Math.random(), // Unique temporary ID
                    title: cleanTitle,
                    filePath: file.path,
                    content: rawCode
                });
            }
        }

        // Lock it to current session and refresh the UI layout matrix
        localStorage.setItem('mangaOfflineDB', JSON.stringify(offlineDatabase));
        renderPortal();
        console.log(`Synced ${offlineDatabase.bottomSnippets.length} scripts seamlessly from GitHub.`);
    } catch (error) {
        console.error("GitHub directory sync failed:", error);
    }
}
