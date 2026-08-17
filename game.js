// game.js - Updated Main Controller, UI, and Game Logic (Match End Auto-Redirect, Who vs Who, Ongoing Servers in Lobby)
import { db, ref, set, get, update, remove, onValue, push, setupUserPresence, markUserOffline } from './network.js';

// Global Game State
let currentUser = null;
let currentServerId = null;
let currentMatchId = null;
let playerTeam = null; // 'blue' or 'red'
let localTeam = 'blue'; // Used for board flipping controller
let selectedUnit = null;
let animationFrameId = null;
let matchEndTimeout = null;

// Preset Accounts for validation
const validAccounts = {
    "player1": "123", "player2": "123", "player3": "123", "player4": "123",
    "player5": "123", "player6": "123", "player7": "123", "player8": "123",
    "player9": "123", "player10": "123"
};

// Console logger helper
function logToConsole(msg) {
    const logs = document.getElementById('console-logs');
    if (!logs) return;
    const time = new Date().toLocaleTimeString();
    logs.innerHTML += `[${time}] ${msg}<br>`;
    logs.scrollTop = logs.scrollHeight;
}

window.addEventListener('DOMContentLoaded', () => {
    logToConsole("DOM fully loaded. Initializing application...");
    initEventListeners();
    checkCachedSession();
    listenToActivePlayers();
    listenToGlobalChat();

    document.getElementById('clearConsole').addEventListener('click', () => {
        document.getElementById('console-logs').innerHTML = '';
    });
});

// --- LOCAL STORAGE CACHE & AUTO-LOGIN ---
function checkCachedSession() {
    const savedUser = localStorage.getItem('chess_current_user');
    if (savedUser && validAccounts[savedUser]) {
        currentUser = savedUser;
        logToConsole(`Auto-logged in via cache as: ${currentUser}`);
        setupUserPresence(currentUser);
        showScreen('lobby-screen');
        document.getElementById('welcomeUser').innerText = `Logged in as: ${currentUser}`;
        loadServerList();
    } else {
        logToConsole("No active session in cache. Showing login screen.");
        showScreen('login-screen');
    }
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
    logToConsole(`Switched active screen to: ${screenId}`);
}

// --- EVENT LISTENERS SETUP ---
function initEventListeners() {
    // Login Button
    document.getElementById('loginBtn').addEventListener('click', () => {
        const u = document.getElementById('userInput').value.trim();
        const p = document.getElementById('passInput').value.trim();
        const err = document.getElementById('loginError');

        if (!validAccounts[u] || validAccounts[u] !== p) {
            err.innerText = "Invalid username or password!";
            logToConsole(`Login failed for username: ${u}`);
            return;
        }
        err.innerText = "";
        currentUser = u;

        localStorage.setItem('chess_current_user', currentUser);
        setupUserPresence(currentUser);

        showScreen('lobby-screen');
        document.getElementById('welcomeUser').innerText = `Logged in as: ${currentUser}`;
        loadServerList();
        logToConsole(`User ${currentUser} logged in successfully.`);
    });

    // Logout Button
    document.getElementById('logoutBtn').addEventListener('click', () => {
        markUserOffline(currentUser);
        localStorage.removeItem('chess_current_user');
        logToConsole(`User ${currentUser} logged out.`);
        currentUser = null;
        showScreen('login-screen');
    });

    // Create Server Button
    document.getElementById('createServerBtn').addEventListener('click', createNewServer);

    // Cancel Waiting Room Button
    document.getElementById('cancelRoomBtn').addEventListener('click', () => {
        if (currentServerId) {
            remove(ref(db, `servers/${currentServerId}`));
            currentServerId = null;
        }
        showScreen('lobby-screen');
        logToConsole("Server creation canceled. Returned to lobby.");
    });

    // Global Lobby Chat Send
    document.getElementById('globalChatSend').addEventListener('click', sendGlobalMessage);
    document.getElementById('globalChatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendGlobalMessage();
    });

    // Match Surrender Button
    document.getElementById('surrenderBtn').addEventListener('click', () => {
        if (confirm("Are you sure you want to surrender and leave the match?")) {
            leaveMatch();
        }
    });

    // Admin Clear Button
    document.getElementById('adminClearBtn').addEventListener('click', () => {
        if (confirm("Admin: Clear all active servers and matches?")) {
            remove(ref(db, 'servers'));
            remove(ref(db, 'matches'));
            logToConsole("Admin cleared all servers and matches.");
        }
    });
}

// --- ACTIVE PLAYERS LIST ---
function listenToActivePlayers() {
    const playersRef = ref(db, 'players');
    onValue(playersRef, (snapshot) => {
        const data = snapshot.val() || {};
        const container = document.getElementById('playersListContainer');
        container.innerHTML = '';

        let onlineCount = 0;
        let htmlContent = '';

        for (let username in data) {
            const info = data[username];
            if (info && info.online === true) {
                onlineCount++;
                const isYou = username === currentUser ? ' (You)' : '';
                htmlContent += `
                    <div class="player-card">
                        <span>${username}${isYou}</span>
                        <div class="player-badge-online"></div>
                    </div>
                `;
            }
        }

        container.innerHTML = onlineCount === 0 ? `<div style="color:var(--text-muted); font-size:0.75rem; text-align:center;">No players online</div>` : htmlContent;
        document.getElementById('onlineCountText').innerText = `Active Players (${onlineCount})`;
        
        const dot = document.getElementById('statusDot');
        if (onlineCount > 1) {
            dot.classList.add('active-multiple');
        } else {
            dot.classList.remove('active-multiple');
        }
    });
}

// --- GLOBAL LOBBY CHAT ---
function sendGlobalMessage() {
    const input = document.getElementById('globalChatInput');
    const text = input.value.trim();
    if (!text || !currentUser) return;

    const chatRef = ref(db, 'globalChat');
    push(chatRef, {
        sender: currentUser,
        text: text,
        timestamp: Date.now()
    });
    input.value = '';
}

function listenToGlobalChat() {
    const chatRef = ref(db, 'globalChat');
    onValue(chatRef, (snapshot) => {
        const data = snapshot.val() || {};
        const container = document.getElementById('globalChatMessages');
        container.innerHTML = '';

        const messages = Object.values(data).sort((a, b) => a.timestamp - b.timestamp);
        const recent = messages.slice(-30);

        recent.forEach(msg => {
            const div = document.createElement('div');
            div.className = 'global-chat-msg';
            div.innerHTML = `<strong>${msg.sender}:</strong> ${escapeHtml(msg.text)}`;
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    });
}

// --- LOBBY & SERVER CREATION WITH ONGOING MATCH DISPLAY ---
function createNewServer() {
    if (!currentUser) return;
    const serversRef = ref(db, 'servers');
    const newServerRef = push(serversRef);
    currentServerId = newServerRef.key;

    set(newServerRef, {
        host: currentUser,
        guest: null,
        status: 'waiting',
        createdAt: Date.now()
    });

    logToConsole(`Created server ID: ${currentServerId} by host ${currentUser}`);
    document.getElementById('roomCodeDisplay').innerText = `Server ID: ${currentServerId}`;
    showScreen('wait-screen');

    onValue(newServerRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        if (data.status === 'playing' && data.matchId) {
            currentMatchId = data.matchId;
            playerTeam = 'blue'; // Host is Blue team
            localTeam = 'blue';
            startGameSession();
        }
    });
}

function loadServerList() {
    const serversRef = ref(db, 'servers');
    onValue(serversRef, (snapshot) => {
        const data = snapshot.val() || {};
        const listEl = document.getElementById('serverList');
        listEl.innerHTML = '';

        let totalServersCount = 0;
        for (let sId in data) {
            const server = data[sId];
            totalServersCount++;
            const item = document.createElement('div');
            item.className = 'server-item';

            if (server.status === 'waiting') {
                item.innerHTML = `
                    <span>Host: <strong>${server.host}</strong> (Waiting for opponent)</span>
                    <button class="btn btn-secondary" onclick="window.joinServer('${sId}')">Join Match</button>
                `;
            } else if (server.status === 'playing') {
                item.innerHTML = `
                    <span>Server [${server.host} vs ${server.guest}]: <strong style="color: #e74c3c;">Match Ongoing</strong></span>
                    <button class="btn btn-secondary" disabled style="opacity: 0.6; cursor: not-allowed;">In Progress</button>
                `;
            }
            listEl.appendChild(item);
        }

        if (totalServersCount === 0) {
            listEl.innerHTML = `<div style="color:var(--text-muted); font-size:0.8rem; text-align:center; margin-top:20px;">No servers active. Create one!</div>`;
        }
    });
}

window.joinServer = function(sId) {
    if (!currentUser) return;
    currentServerId = sId;
    const serverRef = ref(db, `servers/${sId}`);

    get(serverRef).then((snapshot) => {
        const server = snapshot.val();
        if (!server || server.status !== 'waiting') {
            alert("This server is no longer available.");
            return;
        }

        const matchesRef = ref(db, 'matches');
        const newMatchRef = push(matchesRef);
        currentMatchId = newMatchRef.key;

        set(newMatchRef, {
            blueUser: server.host,
            redUser: currentUser,
            turn: 'blue',
            status: 'active',
            units: getInitialUnitsState()
        });

        update(serverRef, {
            guest: currentUser,
            status: 'playing',
            matchId: currentMatchId
        });

        playerTeam = 'red'; // Guest is Red team
        localTeam = 'red'; // Flip board view for guest perspective
        logToConsole(`Joined server ${sId}. Match ID: ${currentMatchId}`);
        startGameSession();
    });
};

// --- MAP & ASSET INITIALIZATION CONTROLLER CONFIGURATION ---
const cols = 18;
const rows = 18;
const ghBase = 'https://cdn.jsdelivr.net/gh/ModernChess/assets-images@main/';

// Asset References & Preloading
let blueTankImg = new Image(), blueTankLoaded = false;
let blueInfantryImg = new Image(), blueInfantryLoaded = false;
let blueArtilleryImg = new Image(), blueArtilleryLoaded = false;
let blueShipImg = new Image(), blueShipLoaded = false;

let redTankImg = new Image(), redTankLoaded = false;
let redInfantryImg = new Image(), redInfantryLoaded = false;
let redArtilleryImg = new Image(), redArtilleryLoaded = false;
let redShipImg = new Image(), redShipLoaded = false;

const assetUrls = [
    ghBase + 'blue_tank.jpg', ghBase + 'blue_infantry.jpg', ghBase + 'blue_artillery.jpg', ghBase + 'blue_ship.jpg',
    ghBase + 'red_tank.jpg', ghBase + 'red_infantry.jpg', ghBase + 'red_artillery.jpg', ghBase + 'red_ship.jpg'
];

function loadAssetWithProgress(url, imgObj, setLoadedFlag) {
    fetch(url)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.blob();
        })
        .then(blob => {
            let objectURL = URL.createObjectURL(blob);
            imgObj.src = objectURL;
            imgObj.onload = () => { setLoadedFlag(true); };
        })
        .catch(() => {
            imgObj.src = url;
            imgObj.onload = () => { setLoadedFlag(true); };
        });
}

// Load Assets
loadAssetWithProgress(assetUrls[0], blueTankImg, (val) => { blueTankLoaded = val; });
loadAssetWithProgress(assetUrls[1], blueInfantryImg, (val) => { blueInfantryLoaded = val; });
loadAssetWithProgress(assetUrls[2], blueArtilleryImg, (val) => { blueArtilleryLoaded = val; });
loadAssetWithProgress(assetUrls[3], blueShipImg, (val) => { blueShipLoaded = val; });
loadAssetWithProgress(assetUrls[4], redTankImg, (val) => { redTankLoaded = val; });
loadAssetWithProgress(assetUrls[5], redInfantryImg, (val) => { redInfantryLoaded = val; });
loadAssetWithProgress(assetUrls[6], redArtilleryImg, (val) => { redArtilleryLoaded = val; });
loadAssetWithProgress(assetUrls[7], redShipImg, (val) => { redShipLoaded = val; });

function getTerrain(c, r) {
    const colChar = String.fromCharCode(65 + c);
    const rowNum = r + 1;
    const coord = colChar + rowNum;

    const waterList = [
        'I5', 'J5', 'I6', 'J6', 'K6', 'H7', 'I7', 'J7', 'K7', 'G8', 'H8', 'I8', 'J8', 'K8', 
        'E9', 'F9', 'G9', 'H9', 'I9', 'J9', 'K9', 'L9', 'E10', 'F10', 'G10', 'H10', 'I10', 
        'J10', 'K10', 'L10', 'F11', 'G11', 'H11', 'I11', 'J11', 'K11', 'L11', 'M11', 'I12', 
        'J12', 'K12', 'L12', 'M12', 'N12', 'K13', 'L13', 'M13', 'N13', 'L14', 'M14', 'N14'
    ];
    if (waterList.includes(coord)) return 'water';
    if (coord === 'F12') return 'blue_navy';
    if (coord === 'L6') return 'red_navy';
    if (coord === 'A12') return 'blue_core';
    if (coord === 'R7') return 'red_core';
    return 'land';
}

function getInitialUnitsState() {
    return [
        { id: 'b_inf_1', name: 'Infantry', type: 'land', range: 2, gridX: 2, gridY: 2, team: 'blue' },
        { id: 'r_inf_1', name: 'Infantry', type: 'land', range: 2, gridX: cols - 3, gridY: rows - 3, team: 'red' }
    ];
}

let units = getInitialUnitsState();

function getRenderCoordinates(gridX, gridY, canvasWidth) {
    let cellSize = canvasWidth / cols;
    let renderX = gridX;
    let renderY = gridY;

    if (localTeam === 'red') {
        renderX = cols - 1 - gridX;
        renderY = rows - 1 - gridY;
    }

    return {
        x: renderX * cellSize,
        y: renderY * cellSize,
        cellSize: cellSize
    };
}

// --- GAME SESSION & RENDERER INTEGRATION ---
function startGameSession() {
    if (matchEndTimeout) {
        clearTimeout(matchEndTimeout);
        matchEndTimeout = null;
    }
    showScreen('game-screen');
    document.getElementById('playerTeamBadge').innerText = `Team: ${playerTeam.toUpperCase()}`;
    document.getElementById('statusBanner').innerText = "Match started! 18x18 Flipped Map initialized.";
    logToConsole(`Starting 18x18 game session as team: ${playerTeam}`);

    initCanvasGame();
    listenToMatchUpdates();
    listenToMatchChat();
}

function initCanvasGame() {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    // Scale canvas properly for 18x18 responsive container
    const parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 540;
    canvas.width = parentWidth > 0 ? parentWidth : 540;
    canvas.height = canvas.width;

    function renderGameLoop() {
        if (!ctx || !canvas) return;
        let cellSize = canvas.width / cols;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1. Draw 18x18 Grid & Terrain Tiles
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                let renderPos = getRenderCoordinates(c, r, canvas.width);
                let terrain = getTerrain(c, r);

                if (terrain === 'water') {
                    ctx.fillStyle = '#1e3d59';
                } else if (terrain.includes('core')) {
                    ctx.fillStyle = '#4a2e2b';
                } else {
                    ctx.fillStyle = (c + r) % 2 === 0 ? '#262626' : '#1e1e1e';
                }

                ctx.fillRect(renderPos.x, renderPos.y, renderPos.cellSize, renderPos.cellSize);
                ctx.strokeStyle = '#333333';
                ctx.strokeRect(renderPos.x, renderPos.y, renderPos.cellSize, renderPos.cellSize);
            }
        }

        // 2. Draw Units with Asset Textures
        units.forEach(unit => {
            let renderPos = getRenderCoordinates(unit.gridX, unit.gridY, canvas.width);

            ctx.save();
            if (selectedUnit && selectedUnit.id === unit.id) {
                ctx.strokeStyle = '#f1c40f';
                ctx.lineWidth = 3;
                ctx.strokeRect(renderPos.x + 2, renderPos.y + 2, renderPos.cellSize - 4, renderPos.cellSize - 4);
            }

            let unitImg = null;
            let isLoaded = false;
            if (unit.team === 'blue') {
                if (unit.name === 'Infantry') { unitImg = blueInfantryImg; isLoaded = blueInfantryLoaded; }
            } else {
                if (unit.name === 'Infantry') { unitImg = redInfantryImg; isLoaded = redInfantryLoaded; }
            }

            if (isLoaded && unitImg && unitImg.complete) {
                ctx.drawImage(unitImg, renderPos.x + 4, renderPos.y + 4, renderPos.cellSize - 8, renderPos.cellSize - 8);
            } else {
                ctx.fillStyle = unit.team === 'blue' ? '#2196F3' : '#ff5252';
                ctx.beginPath();
                ctx.arc(renderPos.x + renderPos.cellSize / 2, renderPos.y + renderPos.cellSize / 2, renderPos.cellSize / 3, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        });

        animationFrameId = requestAnimationFrame(renderGameLoop);
    }

    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    renderGameLoop();

    // Canvas click event handler for 18x18 board movement
    canvas.onclick = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        let cellSize = canvas.width / cols;
        let clickedCol = Math.floor(clickX / cellSize);
        let clickedRow = Math.floor(clickY / cellSize);

        if (localTeam === 'red') {
            clickedCol = cols - 1 - clickedCol;
            clickedRow = rows - 1 - clickedRow;
        }

        const clickedUnit = units.find(u => u.gridX === clickedCol && u.gridY === clickedRow);

        if (clickedUnit) {
            if (clickedUnit.team === playerTeam) {
                selectedUnit = clickedUnit;
                logToConsole(`Selected unit: ${selectedUnit.name} (${selectedUnit.team}) at [${clickedCol}, ${clickedRow}]`);
            } else {
                logToConsole(`Clicked enemy unit: ${clickedUnit.name}`);
            }
        } else if (selectedUnit) {
            let dist = Math.abs(selectedUnit.gridX - clickedCol) + Math.abs(selectedUnit.gridY - clickedRow);
            if (dist <= selectedUnit.range) {
                selectedUnit.gridX = clickedCol;
                selectedUnit.gridY = clickedRow;
                logToConsole(`Moved unit to [${clickedCol}, ${clickedRow}]`);
                
                // Sync updated units list to Firebase match node
                if (currentMatchId) {
                    update(ref(db, `matches/${currentMatchId}`), {
                        units: units,
                        turn: playerTeam === 'blue' ? 'red' : 'blue'
                    });
                }
                selectedUnit = null;
            } else {
                logToConsole(`Destination out of range! Range is ${selectedUnit.range}.`);
            }
        }
    };
}

function listenToMatchUpdates() {
    if (!currentMatchId) return;
    const matchRef = ref(db, `matches/${currentMatchId}`);
    onValue(matchRef, (snapshot) => {
        const match = snapshot.val();
        if (!match) return;
        units = match.units || units;
        
        // Determine opponent username dynamically
        let opponentName = playerTeam === 'blue' ? (match.redUser || 'Opponent') : (match.blueUser || 'Opponent');

        const banner = document.getElementById('statusBanner');
        if (match.status === 'ended') {
            banner.innerText = `Match Ended! Winner: ${match.winner ? match.winner.toUpperCase() : 'Draw'}`;
            logToConsole(`Match ended. Winner: ${match.winner}. Returning to lobby in 4 seconds...`);
            
            if (!matchEndTimeout) {
                matchEndTimeout = setTimeout(() => {
                    leaveMatch();
                }, 4000);
            }
        } else {
            const isMyTurn = match.turn === playerTeam;
            banner.innerText = `VS ${opponentName} | Turn: ${match.turn.toUpperCase()} (${isMyTurn ? 'Your Turn' : `${opponentName}'s Turn`})`;
        }
    });
}

function leaveMatch() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (matchEndTimeout) {
        clearTimeout(matchEndTimeout);
        matchEndTimeout = null;
    }
    if (currentMatchId) {
        update(ref(db, `matches/${currentMatchId}`), { status: 'ended', winner: playerTeam === 'blue' ? 'red' : 'blue' });
    }
    if (currentServerId) {
        remove(ref(db, `servers/${currentServerId}`));
    }
    currentMatchId = null;
    currentServerId = null;
    showScreen('lobby-screen');
    loadServerList();
    logToConsole("Left match and returned to lobby.");
}

function listenToMatchChat() {
    if (!currentMatchId) return;
    const chatRef = ref(db, `matches/${currentMatchId}/chat`);
    
    const sendBtn = document.getElementById('chatSend');
    const inputEl = document.getElementById('chatInput');
    
    const newSendBtn = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);

    newSendBtn.addEventListener('click', () => {
        const text = inputEl.value.trim();
        if (!text) return;
        push(chatRef, { sender: currentUser, text: text, timestamp: Date.now() });
        inputEl.value = '';
    });

    onValue(chatRef, (snapshot) => {
        const data = snapshot.val() || {};
        const container = document.getElementById('chatMessages');
        container.innerHTML = '';
        Object.values(data).forEach(msg => {
            const div = document.createElement('div');
            div.className = 'chat-msg';
            div.innerHTML = `<strong>${msg.sender}:</strong> ${escapeHtml(msg.text)}`;
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    });
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
