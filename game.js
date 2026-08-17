// game.js - Main Controller, UI, and Game Logic
import { db, ref, set, get, update, remove, onValue, push, setupUserPresence, markUserOffline } from './network.js';

// Global Game State
let currentUser = null;
let currentServerId = null;
let currentMatchId = null;
let playerTeam = null; // 'white' (red) or 'black' (blue)
let gameInterval = null;

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

        // Save to Local Storage cache
        localStorage.setItem('chess_current_user', currentUser);

        // Activate Firebase Presence
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

// --- ACTIVE PLAYERS LIST (Excludes offline/closed tabs) ---
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
            // Only list users whose status is explicitly online: true
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

        if (onlineCount === 0) {
            container.innerHTML = `<div style="color:var(--text-muted); font-size:0.75rem; text-align:center;">No players online</div>`;
        } else {
            container.innerHTML = htmlContent;
        }

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
        // Keep last 30 messages
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

// --- LOBBY & SERVER CREATION ---
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

    // Listen to changes on this specific server to detect when a guest joins
    onValue(newServerRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        if (data.status === 'playing' && data.matchId) {
            currentMatchId = data.matchId;
            playerTeam = 'white'; // Host is White/Red team
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

        let activeServersCount = 0;
        for (let sId in data) {
            const server = data[sId];
            if (server.status === 'waiting') {
                activeServersCount++;
                const item = document.createElement('div');
                item.className = 'server-item';
                item.innerHTML = `
                    <span>Host: <strong>${server.host}</strong></span>
                    <button class="btn btn-secondary" onclick="window.joinServer('${sId}')">Join Match</button>
                `;
                listEl.appendChild(item);
            }
        }

        if (activeServersCount === 0) {
            listEl.innerHTML = `<div style="color:var(--text-muted); font-size:0.8rem; text-align:center; margin-top:20px;">No servers active. Create one!</div>`;
        }
    });
}

// Expose joinServer to global window scope so buttons generated via HTML string can trigger it
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

        // Create match node
        const matchesRef = ref(db, 'matches');
        const newMatchRef = push(matchesRef);
        currentMatchId = newMatchRef.key;

        set(newMatchRef, {
            white: server.host,
            black: currentUser,
            turn: 'white',
            status: 'active',
            board: getInitialBoardState()
        });

        // Update server status
        update(serverRef, {
            guest: currentUser,
            status: 'playing',
            matchId: currentMatchId
        });

        playerTeam = 'black'; // Guest is Black/Blue team
        logToConsole(`Joined server ${sId}. Match ID: ${currentMatchId}`);
        startGameSession();
    });
};

// --- GAME SESSION & RENDERER ---
function startGameSession() {
    showScreen('game-screen');
    document.getElementById('playerTeamBadge').innerText = `Team: ${playerTeam.toUpperCase()}`;
    document.getElementById('statusBanner').innerText = "Match started! Good luck.";
    logToConsole(`Starting game session as team: ${playerTeam}`);

    initCanvasGame();
    listenToMatchUpdates();
    listenToMatchChat();
}

let selectedPiece = null;
let boardState = getInitialBoardState();

function getInitialBoardState() {
    // Simplified checker/chess initial setup or standard grid reference
    return [
        ['bR','bN','bB','bQ','bK','bB','bN','bR'],
        ['bP','bP','bP','bP','bP','bP','bP','bP'],
        ['','','','','','','',''],
        ['','','','','','','',''],
        ['','','','','','','',''],
        ['','','','','','','',''],
        ['wP','wP','wP','wP','wP','wP','wP','wP'],
        ['wR','wN','wB','wQ','wK','wB','wN','wR']
    ];
}

function initCanvasGame() {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    // Set explicit canvas dimensions for crisp rendering
    canvas.width = 400;
    canvas.height = 400;

    const tileSize = canvas.width / 8;

    function drawBoard() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const isLight = (r + c) % 2 === 0;
                ctx.fillStyle = isLight ? '#2a2a2a' : '#1a1a1a';
                if (selectedPiece && selectedPiece.row === r && selectedPiece.col === c) {
                    ctx.fillStyle = '#4CAF50'; // Highlight selected tile
                }
                ctx.fillRect(c * tileSize, r * tileSize, tileSize, tileSize);

                const piece = boardState[r][c];
                if (piece) {
                    drawPiece(ctx, piece, c * tileSize, r * tileSize, tileSize);
                }
            }
        }
    }

    drawBoard();

    // Handle clicks on canvas for piece movement
    canvas.onclick = (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const c = Math.floor((x / rect.width) * 8);
        const r = Math.floor((y / rect.height) * 8);

        handleSquareClick(r, c);
        drawBoard();
    };
}

function drawPiece(ctx, pieceCode, x, y, size) {
    ctx.font = `${size * 0.6}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const isWhite = pieceCode.startsWith('w');
    ctx.fillStyle = isWhite ? '#ff5252' : '#2196F3'; // Red vs Blue teams

    let symbol = '';
    const type = pieceCode[1];
    if (type === 'P') symbol = '♟';
    if (type === 'R') symbol = '♜';
    if (type === 'N') symbol = '♞';
    if (type === 'B') symbol = '♝';
    if (type === 'Q') symbol = '♛';
    if (type === 'K') symbol = '♚';

    ctx.fillText(symbol, x + size / 2, y + size / 2);
}

function handleSquareClick(r, c) {
    const piece = boardState[r][c];
    const isMyPiece = piece && ((playerTeam === 'white' && piece.startsWith('w')) || (playerTeam === 'black' && piece.startsWith('b')));

    if (isMyPiece) {
        selectedPiece = { row: r, col: c };
        logToConsole(`Selected piece ${piece} at (${r}, ${c})`);
    } else if (selectedPiece) {
        // Move piece
        boardState[r][c] = boardState[selectedPiece.row][selectedPiece.col];
        boardState[selectedPiece.row][selectedPiece.col] = '';
        selectedPiece = null;

        // Sync with Firebase
        if (currentMatchId) {
            update(ref(db, `matches/${currentMatchId}`), {
                board: boardState,
                turn: playerTeam === 'white' ? 'black' : 'white'
            });
            logToConsole("Board state updated and synced to Firebase.");
        }
    }
}

function listenToMatchUpdates() {
    if (!currentMatchId) return;
    const matchRef = ref(db, `matches/${currentMatchId}`);
    onValue(matchRef, (snapshot) => {
        const match = snapshot.val();
        if (!match) return;
        boardState = match.board || boardState;
        
        const banner = document.getElementById('statusBanner');
        if (match.status === 'ended') {
            banner.innerText = `Match Ended! Winner: ${match.winner || 'Draw'}`;
        } else {
            banner.innerText = `Turn: ${match.turn.toUpperCase()} (${match.turn === playerTeam ? 'Your Turn' : "Opponent's Turn"})`;
        }
        
        // Redraw canvas with updated board
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            const tileSize = canvas.width / 8;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    ctx.fillStyle = (r + c) % 2 === 0 ? '#2a2a2a' : '#1a1a1a';
                    ctx.fillRect(c * tileSize, r * tileSize, tileSize, tileSize);
                    const p = boardState[r][c];
                    if (p) drawPiece(ctx, p, c * tileSize, r * tileSize, tileSize);
                }
            }
        }
    });
}

function leaveMatch() {
    if (currentMatchId) {
        update(ref(db, `matches/${currentMatchId}`), { status: 'ended', winner: playerTeam === 'white' ? 'black' : 'white' });
    }
    if (currentServerId) {
        remove(ref(db, `servers/${currentServerId}`));
    }
    currentMatchId = null;
    currentServerId = null;
    showScreen('lobby-screen');
    logToConsole("Left match and returned to lobby.");
}

function listenToMatchChat() {
    if (!currentMatchId) return;
    const chatRef = ref(db, `matches/${currentMatchId}/chat`);
    
    // Setup send listener once
    const sendBtn = document.getElementById('chatSend');
    const inputEl = document.getElementById('chatInput');
    
    // Replace element with clone to clear old event listeners
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
