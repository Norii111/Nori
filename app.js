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

// --- CLOUD SPREADSHEET DATA STREAM SYNC ---
async function syncGoogleSheetData() {
    addSystemLog("Connecting to Google Sheets cloud matrix...");
    try {
        const cacheBuster = `&_cb=${Date.now()}`;
        const response = await fetch(sheetCsvUrl + cacheBuster);
        if (!response.ok) throw new Error("Cloud stream fetch rejected.");
        const rawCsvText = await response.text();
        
        parseCsvToArray(rawCsvText);
        addSystemLog(`Sync completed. Loaded ${googleSheetData.length} records into lookup index.`);
    } catch (error) {
        addSystemLog(`Cloud link error: ${error.message}`);
        showToast("Error pulling cloud sheets registry.");
    }
}

function parseCsvToArray(text) {
    googleSheetData = [];
    let lines = text.split(/\r\n|\n/);
    
    // Starts at 1 to skip headers row cleanly
    for (let i = 1; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        
        let matches = line.split(',');
        if (matches.length >= 2) {
            let colA = matches[0].replace(/^"|"$/g, '').trim();
            let colB = matches.slice(1).join(',').replace(/^"|"$/g, '').trim();
            googleSheetData.push({ key: colA, payload: colB });
        }
    }
}

// --- DIRECT ENTRY SEARCH ROUTINE ---
function querySheetMatrix() {
    const searchKey = document.getElementById('sheetKeySearch').value.trim().toUpperCase();
    const payloadOutput = document.getElementById('sheetPayloadArea');
    
    if (!searchKey) {
        payloadOutput.value = "";
        return;
    }
    
    const matchedRow = googleSheetData.find(row => row.key.toUpperCase() === searchKey);
    
    if (matchedRow) {
        payloadOutput.value = matchedRow.payload;
    } else {
        payloadOutput.value = "❌ No matching data profiles located inside live sheet arrays.";
    }
}

function injectPayloadToWorkspace() {
    const activePayload = document.getElementById('sheetPayloadArea').value;
    if (!activePayload || activePayload.startsWith("❌") || activePayload.startsWith("Matching")) {
        showToast("Error: No data loaded to pull.");
        return;
    }
    offlineDatabase.primaryGAS = activePayload;
    document.getElementById('primaryGasArea').value = activePayload;
    showToast("Loaded description payload data to dashboard workspace console!");
    switchTab('dashboard');
}

function deleteSnippet(id) {
    activeDeleteTargetId = id;
    currentLondonStep = 0;
    selectedPieceCoord = null;
    resetChessBoardState();
    renderChessBoard();
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
        if (selectedPieceCoord === tile.coord) {
            squareClass += ' selected-piece-highlight'; 
        }
        
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

    if (tabName === 'dashboard') {
        dashTab.style.display = 'grid';
        navLinks[0].classList.add('active');
        showToast("Switched to Main Command Dashboard");
    } else if (tabName === 'searchTab') {
        searchTab.style.display = 'grid';
        navLinks[1].classList.add('active');
        showToast("Switched to Sheet Search Engine");
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

window.onload = function() {
    renderPortal();
    changeToRandomGif();
    syncGoogleSheetData();
    const gifFrame = document.querySelector('.blank-character-frame');
    if (gifFrame) {
        gifFrame.addEventListener('click', () => {
            changeToRandomGif(); triggerGifFlip(); showToast("Shifting avatar transmission matrix...");
        });
    }
    setInterval(triggerGifFlip, 12000); 
};
