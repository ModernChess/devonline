// ==========================================
// MODERN CHESS ONLINE - app.js (v2.4)
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getDatabase, ref, set, get, update, remove, onValue, push, child, runTransaction 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Firebase Configuration
const firebaseConfig = {
    databaseURL: "https://chess-online-devonline-default-rtdb.firebaseio.com/"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Global App State
let currentUser = null;
let currentRoomId = null;
let userTeam = null; // 'white' or 'black'
let boardState = null;
let selectedSquare = null;
let localTurn = 'white';
let gameActive = false;

// DOM Elements
const screens = {
    login: document.getElementById('login-screen'),
    reconnect: document.getElementById('reconnect-screen'),
    lobby: document.getElementById('lobby-screen'),
    wait: document.getElementById('wait-screen'),
    game: document.getElementById('game-screen')
};

// Logger utility for in-page console drawer
function logMessage(msg) {
    const logsContainer = document.getElementById('console-logs');
    if (!logsContainer) return;
    const timeStr = new Date().toLocaleTimeString();
    logsContainer.innerHTML += `[${timeStr}] ${msg}<br>`;
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

// Switch Active Screen Helper
function showScreen(screenKey) {
    Object.keys(screens).forEach(key => {
        if (screens[key]) {
            screens[key].classList.toggle('active', key === screenKey);
        }
    });
    logMessage(`Switched view to screen: ${screenKey}`);
}

// ------------------------------------------
// 1. AUTHENTICATION SYSTEM
// ------------------------------------------
const userInput = document.getElementById('userInput');
const passInput = document.getElementById('passInput');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const welcomeUser = document.getElementById('welcomeUser');

loginBtn.addEventListener('click', async () => {
    const username = userInput.value.trim().toLowerCase();
    const password = passInput.value.trim();

    if (!username || !password) {
        loginError.textContent = "Please enter username and password.";
        return;
    }

    // Preset accounts validator (player1 to player10 with pass '123')
    if (/^player([1-9]|10)$/.test(username) && password === '123') {
        currentUser = username;
        loginError.textContent = "";
        logMessage(`User authenticated: ${currentUser}`);
        
        // Register online presence
        setupUserPresence(currentUser);
        checkActiveSession(currentUser);
    } else {
        loginError.textContent = "Invalid username or password (try player1 / 123)";
    }
});

logoutBtn.addEventListener('click', () => {
    if (currentUser) {
        // Remove presence
        set(ref(db, `presence/${currentUser}`), null);
    }
    currentUser = null;
    currentRoomId = null;
    userTeam = null;
    showScreen('login');
    logMessage("User logged out.");
});

// ------------------------------------------
// 2. USER PRESENCE & ACTIVE PLAYERS SIDEBAR
// ------------------------------------------
function setupUserPresence(username) {
    const userRef = ref(db, `presence/${username}`);
    set(userRef, { online: true, lastSeen: Date.now() });

    // Listen to all online users
    const presenceRef = ref(db, 'presence');
    onValue(presenceRef, (snapshot) => {
        const data = snapshot.val() || {};
        const activePlayers = Object.keys(data).filter(user => data[user].online);
        
        const countText = document.getElementById('onlineCountText');
        const statusDot = document.getElementById('statusDot');
        const container = document.getElementById('playersListContainer');

        if (countText) countText.textContent = `Active Players (${activePlayers.length})`;
        if (statusDot) {
            statusDot.classList.toggle('active-multiple', activePlayers.length > 1);
        }

        if (container) {
            if (activePlayers.length === 0) {
                container.innerHTML = `<div style="color:var(--text-muted); font-size:0.75rem; text-align:center;">No players online</div>`;
            } else {
                container.innerHTML = activePlayers.map(p => `
                    <div class="player-card">
                        <span>${p} ${p === currentUser ? '(You)' : ''}</span>
                        <div class="player-badge-online"></div>
                    </div>
                `).join('');
            }
        }
    });
}

// ------------------------------------------
// 3. RECONNECTION & SESSION HANDLER
// ------------------------------------------
async function checkActiveSession(username) {
    welcomeUser.textContent = `Logged in as: ${username}`;
    
    // Check if user is already inside an active room match
    const roomsRef = ref(db, 'rooms');
    const snapshot = await get(roomsRef);
    
    let foundRoomId = null;
    if (snapshot.exists()) {
        const rooms = snapshot.val();
        for (const [roomId, roomData] of Object.entries(rooms)) {
            if ((roomData.host === username || roomData.guest === username) && roomData.status === 'playing') {
                foundRoomId = roomId;
                break;
            }
        }
    }

    if (foundRoomId) {
        currentRoomId = foundRoomId;
        showScreen('reconnect');
    } else {
        showScreen('lobby');
        initLobbySystem();
    }
}

document.getElementById('rejoinYesBtn').addEventListener('click', () => {
    logMessage(`Rejoining active room session: ${currentRoomId}`);
    joinRoomSession(currentRoomId);
});

document.getElementById('rejoinNoBtn').addEventListener('click', async () => {
    if (currentRoomId) {
        await remove(ref(db, `rooms/${currentRoomId}`));
        logMessage(`Terminated prior room session: ${currentRoomId}`);
    }
    currentRoomId = null;
    showScreen('lobby');
    initLobbySystem();
});

// ------------------------------------------
// 4. LOBBY & SERVER MANAGEMENT
// ------------------------------------------
const serverListContainer = document.getElementById('serverList');
const createServerBtn = document.getElementById('createServerBtn');
const adminClearBtn = document.getElementById('adminClearBtn');

function initLobbySystem() {
    // Listen to open servers/rooms
    const roomsRef = ref(db, 'rooms');
    onValue(roomsRef, (snapshot) => {
        const data = snapshot.val() || {};
        const openRooms = Object.entries(data).filter(([id, room]) => room.status === 'waiting');

        if (openRooms.length === 0) {
            serverListContainer.innerHTML = `<div style="color:var(--text-muted); font-size:0.8rem; text-align:center; margin-top:20px;">No servers active. Create one!</div>`;
        } else {
            serverListContainer.innerHTML = openRooms.map(([roomId, room]) => `
                <div class="server-item">
                    <span>Host: <b>${room.host}</b></span>
                    <button class="btn btn-secondary" onclick="window.joinGameServer('${roomId}')">Join</button>
                </div>
            `).join('');
        }
    });

    initGlobalChat();
}

createServerBtn.addEventListener('click', async () => {
    const newRoomRef = push(ref(db, 'rooms'));
    currentRoomId = newRoomRef.key;
    userTeam = 'white'; // Host is White

    const roomData = {
        host: currentUser,
        guest: null,
        status: 'waiting',
        turn: 'white',
        board: getInitialBoardState()
    };

    await set(newRoomRef, roomData);
    logMessage(`Created new match server: ${currentRoomId}`);
    
    document.getElementById('roomCodeDisplay').textContent = `Room ID: ${currentRoomId}`;
    showScreen('wait');

    // Listen for guest joining
    onValue(ref(db, `rooms/${currentRoomId}`), (snapshot) => {
        const room = snapshot.val();
        if (room && room.guest && room.status === 'playing') {
            joinRoomSession(currentRoomId);
        }
    });
});

window.joinGameServer = async (roomId) => {
    const roomRef = ref(db, `rooms/${roomId}`);
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) {
        alert("Server no longer exists!");
        return;
    }

    const room = snapshot.val();
    if (room.host === currentUser) {
        currentRoomId = roomId;
        userTeam = 'white';
        joinRoomSession(roomId);
        return;
    }

    // Join as guest (Black team)
    await update(roomRef, {
        guest: currentUser,
        status: 'playing'
    });

    currentRoomId = roomId;
    userTeam = 'black';
    logMessage(`Joined server ${roomId} as Guest (Black Team)`);
    joinRoomSession(roomId);
};

document.getElementById('cancelRoomBtn').addEventListener('click', async () => {
    if (currentRoomId) {
        await remove(ref(db, `rooms/${currentRoomId}`));
    }
    currentRoomId = null;
    showScreen('lobby');
});

adminClearBtn.addEventListener('click', async () => {
    if (confirm("Are you sure you want to purge all active rooms and match caches?")) {
        await remove(ref(db, 'rooms'));
        logMessage("Admin purged all active servers.");
        alert("All matches cleared.");
    }
});

// ------------------------------------------
// 5. UNIVERSAL GLOBAL CHAT SYSTEM
// ------------------------------------------
function initGlobalChat() {
    const chatMsgContainer = document.getElementById('globalChatMessages');
    const chatInput = document.getElementById('globalChatInput');
    const chatSend = document.getElementById('globalChatSend');

    const globalChatRef = ref(db, 'globalChat');
    
    // Listen to global chat messages
    onValue(globalChatRef, (snapshot) => {
        const msgs = snapshot.val() || {};
        chatMsgContainer.innerHTML = Object.values(msgs).map(m => `
            <div class="global-chat-msg"><b>${m.sender}:</b> ${m.text}</div>
        `).join('');
        chatMsgContainer.scrollTop = chatMsgContainer.scrollHeight;
    });

    const sendHandler = () => {
        const text = chatInput.value.trim();
        if (!text) return;
        push(globalChatRef, {
            sender: currentUser,
            text: text,
            timestamp: Date.now()
        });
        chatInput.value = '';
    };

    chatSend.onclick = sendHandler;
    chatInput.onkeypress = (e) => { if (e.key === 'Enter') sendHandler(); };
}

// ------------------------------------------
// 6. GAME BOARD LOGIC & RENDERING
// ------------------------------------------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const SQ_SIZE = 40; // 8x8 grid on 320x320 canvas

function getInitialBoardState() {
    // Standard Chess setup: r=rook, n=knight, b=bishop, q=queen, k=king, p=pawn
    // Uppercase = White, Lowercase = Black
    return [
        ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
        ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
        ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
    ];
}

function joinRoomSession(roomId) {
    currentRoomId = roomId;
    const roomRef = ref(db, `rooms/${roomId}`);

    get(roomRef).then((snapshot) => {
        if (!snapshot.exists()) return;
        const room = snapshot.val();
        
        if (room.host === currentUser) userTeam = 'white';
        else if (room.guest === currentUser) userTeam = 'black';

        document.getElementById('playerTeamBadge').textContent = `Team: ${userTeam.toUpperCase()} (${currentUser})`;
        showScreen('game');
        gameActive = true;

        // Listen for board & turn updates
        onValue(roomRef, (snap) => {
            const updatedRoom = snap.val();
            if (!updatedRoom) return;
            boardState = updatedRoom.board;
            localTurn = updatedRoom.turn;
            
            updateStatusBanner();
            renderBoard();
        });

        initMatchChat(roomId);
    });
}

function updateStatusBanner() {
    const banner = document.getElementById('statusBanner');
    if (localTurn === userTeam) {
        banner.textContent = "Your Turn to Move!";
        banner.style.color = "#4CAF50";
    } else {
        banner.textContent = `Opponent's Turn (${localTurn.toUpperCase()})...`;
        banner.style.color = "#ffeb3b";
    }
}

function renderBoard() {
    if (!boardState) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            // Draw square color
            const isLight = (row + col) % 2 === 0;
            ctx.fillStyle = isLight ? '#2a2a2a' : '#1a1a1a';
            
            // Highlight selected square
            if (selectedSquare && selectedSquare.row === row && selectedSquare.col === col) {
                ctx.fillStyle = '#2196F3';
            }

            ctx.fillRect(col * SQ_SIZE, row * SQ_SIZE, SQ_SIZE, SQ_SIZE);

            // Draw chess piece character
            const piece = boardState[row][col];
            if (piece) {
                ctx.font = '24px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                // White pieces colored whitish, Black pieces colored reddish/grey
                ctx.fillStyle = piece === piece.toUpperCase() ? '#ffffff' : '#ff5252';
                ctx.fillText(getPieceSymbol(piece), col * SQ_SIZE + SQ_SIZE / 2, row * SQ_SIZE + SQ_SIZE / 2);
            }
        }
    }
}

function getPieceSymbol(p) {
    // Basic chess unicode mappings
    const symbols = {
        'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
        'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
    };
    return symbols[p] || p;
}

// Canvas click interaction for moving pieces
canvas.addEventListener('click', (e) => {
    if (!gameActive || localTurn !== userTeam) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const col = Math.floor(x / SQ_SIZE);
    const row = Math.floor(y / SQ_SIZE);

    const clickedPiece = boardState[row][col];
    const isMyPiece = clickedPiece && ((userTeam === 'white' && clickedPiece === clickedPiece.toUpperCase()) || 
                                       (userTeam === 'black' && clickedPiece === clickedPiece.toLowerCase()));

    if (isMyPiece) {
        selectedSquare = { row, col };
        renderBoard();
        logMessage(`Selected piece ${clickedPiece} at [${row}, ${col}]`);
    } else if (selectedSquare) {
        // Attempt move from selectedSquare to target row, col
        executeMove(selectedSquare.row, selectedSquare.col, row, col);
        selectedSquare = null;
    }
});

async function executeMove(fromR, fromC, toR, toC) {
    const roomRef = ref(db, `rooms/${currentRoomId}`);
    
    await runTransaction(roomRef, (room) => {
        if (room && room.turn === userTeam) {
            // Move piece in board array
            const piece = room.board[fromR][fromC];
            room.board[fromR][fromC] = '';
            room.board[toR][toC] = piece;
            // Switch turn
            room.turn = room.turn === 'white' ? 'black' : 'white';
        }
        return room;
    });

    logMessage(`Executed move from [${fromR},${fromC}] to [${toR},${toC}]`);
}

// ------------------------------------------
// 7. MATCH CHAT & SURRENDER CONTROLS
// ------------------------------------------
function initMatchChat(roomId) {
    const chatMsgContainer = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const chatSend = document.getElementById('chatSend');
    const matchChatRef = ref(db, `rooms/${roomId}/chat`);

    onValue(matchChatRef, (snapshot) => {
        const msgs = snapshot.val() || {};
        chatMsgContainer.innerHTML = Object.values(msgs).map(m => `
            <div class="chat-msg"><b>${m.sender}:</b> ${m.text}</div>
        `).join('');
        chatMsgContainer.scrollTop = chatMsgContainer.scrollHeight;
    });

    const sendHandler = () => {
        const text = chatInput.value.trim();
        if (!text) return;
        push(matchChatRef, {
            sender: currentUser,
            text: text,
            timestamp: Date.now()
        });
        chatInput.value = '';
    };

    chatSend.onclick = sendHandler;
    chatInput.onkeypress = (e) => { if (e.key === 'Enter') sendHandler(); };
}

document.getElementById('surrenderBtn').addEventListener('click', async () => {
    if (confirm("Are you sure you want to surrender and leave the match?")) {
        if (currentRoomId) {
            await remove(ref(db, `rooms/${currentRoomId}`));
        }
        currentRoomId = null;
        gameActive = false;
        showScreen('lobby');
        logMessage("Player surrendered match session.");
    }
});

// Clear console log button
document.getElementById('clearConsole').addEventListener('click', () => {
    document.getElementById('console-logs').innerHTML = '';
});

// Initial startup state
showScreen('login');
logMessage("Modern Chess Online script initialized successfully.");
