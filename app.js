// ==========================================
// MODERN CHESS ONLINE - app.js (v2.5 - 18x18 Scaling)
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getDatabase, ref, set, get, update, remove, onValue, push, child, runTransaction 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Firebase Configuration
const firebaseConfig = {
    databaseURL: "https://chess-online-devonline-default-rtdb.firebaseio.com/"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let currentUser = null;
let currentRoomId = null;
let userTeam = null; 
let boardState = null;
let selectedSquare = null;
let localTurn = 'white';
let gameActive = false;

const screens = {
    login: document.getElementById('login-screen'),
    reconnect: document.getElementById('reconnect-screen'),
    lobby: document.getElementById('lobby-screen'),
    wait: document.getElementById('wait-screen'),
    game: document.getElementById('game-screen')
};

function logMessage(msg) {
    const logsContainer = document.getElementById('console-logs');
    if (!logsContainer) return;
    const timeStr = new Date().toLocaleTimeString();
    logsContainer.innerHTML += `[${timeStr}] ${msg}<br>`;
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

function showScreen(screenKey) {
    Object.keys(screens).forEach(key => {
        if (screens[key]) {
            screens[key].classList.toggle('active', key === screenKey);
        }
    });
    logMessage(`Switched view to screen: ${screenKey}`);
}

// ------------------------------------------
// AUTHENTICATION & PRESENCE (Kept intact)
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

    if (/^player([1-9]|10)$/.test(username) && password === '123') {
        currentUser = username;
        loginError.textContent = "";
        setupUserPresence(currentUser);
        checkActiveSession(currentUser);
    } else {
        loginError.textContent = "Invalid username or password (try player1 / 123)";
    }
});

logoutBtn.addEventListener('click', () => {
    if (currentUser) {
        set(ref(db, `presence/${currentUser}`), null);
    }
    currentUser = null;
    currentRoomId = null;
    userTeam = null;
    showScreen('login');
});

function setupUserPresence(username) {
    const userRef = ref(db, `presence/${username}`);
    set(userRef, { online: true, lastSeen: Date.now() });

    onValue(ref(db, 'presence'), (snapshot) => {
        const data = snapshot.val() || {};
        const activePlayers = Object.keys(data).filter(user => data[user].online);
        
        const countText = document.getElementById('onlineCountText');
        const statusDot = document.getElementById('statusDot');
        const container = document.getElementById('playersListContainer');

        if (countText) countText.textContent = `Active Players (${activePlayers.length})`;
        if (statusDot) statusDot.classList.toggle('active-multiple', activePlayers.length > 1);

        if (container) {
            container.innerHTML = activePlayers.length === 0 
                ? `<div style="color:var(--text-muted); font-size:0.75rem; text-align:center;">No players online</div>`
                : activePlayers.map(p => `
                    <div class="player-card">
                        <span>${p} ${p === currentUser ? '(You)' : ''}</span>
                        <div class="player-badge-online"></div>
                    </div>
                  `).join('');
        }
    });
}

async function checkActiveSession(username) {
    welcomeUser.textContent = `Logged in as: ${username}`;
    const snapshot = await get(ref(db, 'rooms'));
    
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

document.getElementById('rejoinYesBtn').addEventListener('click', () => joinRoomSession(currentRoomId));
document.getElementById('rejoinNoBtn').addEventListener('click', async () => {
    if (currentRoomId) await remove(ref(db, `rooms/${currentRoomId}`));
    currentRoomId = null;
    showScreen('lobby');
    initLobbySystem();
});

// ------------------------------------------
// LOBBY & GLOBAL CHAT
// ------------------------------------------
const serverListContainer = document.getElementById('serverList');
const createServerBtn = document.getElementById('createServerBtn');
const adminClearBtn = document.getElementById('adminClearBtn');

function initLobbySystem() {
    onValue(ref(db, 'rooms'), (snapshot) => {
        const data = snapshot.val() || {};
        const openRooms = Object.entries(data).filter(([id, room]) => room.status === 'waiting');

        serverListContainer.innerHTML = openRooms.length === 0 
            ? `<div style="color:var(--text-muted); font-size:0.8rem; text-align:center; margin-top:20px;">No servers active. Create one!</div>`
            : openRooms.map(([roomId, room]) => `
                <div class="server-item">
                    <span>Host: <b>${room.host}</b></span>
                    <button class="btn btn-secondary" onclick="window.joinGameServer('${roomId}')">Join</button>
                </div>
              `).join('');
    });
    initGlobalChat();
}

createServerBtn.addEventListener('click', async () => {
    const newRoomRef = push(ref(db, 'rooms'));
    currentRoomId = newRoomRef.key;
    userTeam = 'white';

    const roomData = {
        host: currentUser,
        guest: null,
        status: 'waiting',
        turn: 'white',
        board: getInitialBoardState()
    };

    await set(newRoomRef, roomData);
    document.getElementById('roomCodeDisplay').textContent = `Room ID: ${currentRoomId}`;
    showScreen('wait');

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
    if (!snapshot.exists()) { alert("Server no longer exists!"); return; }

    const room = snapshot.val();
    if (room.host === currentUser) {
        currentRoomId = roomId;
        userTeam = 'white';
        joinRoomSession(roomId);
        return;
    }

    await update(roomRef, { guest: currentUser, status: 'playing' });
    currentRoomId = roomId;
    userTeam = 'black';
    joinRoomSession(roomId);
};

document.getElementById('cancelRoomBtn').addEventListener('click', async () => {
    if (currentRoomId) await remove(ref(db, `rooms/${currentRoomId}`));
    currentRoomId = null;
    showScreen('lobby');
});

adminClearBtn.addEventListener('click', async () => {
    if (confirm("Purge all active rooms and match caches?")) {
        await remove(ref(db, 'rooms'));
        alert("All matches cleared.");
    }
});

function initGlobalChat() {
    const chatMsgContainer = document.getElementById('globalChatMessages');
    const chatInput = document.getElementById('globalChatInput');
    const chatSend = document.getElementById('globalChatSend');

    onValue(ref(db, 'globalChat'), (snapshot) => {
        const msgs = snapshot.val() || {};
        chatMsgContainer.innerHTML = Object.values(msgs).map(m => `
            <div class="global-chat-msg"><b>${m.sender}:</b> ${m.text}</div>
        `).join('');
        chatMsgContainer.scrollTop = chatMsgContainer.scrollHeight;
    });

    const sendHandler = () => {
        const text = chatInput.value.trim();
        if (!text) return;
        push(ref(db, 'globalChat'), { sender: currentUser, text, timestamp: Date.now() });
        chatInput.value = '';
    };

    chatSend.onclick = sendHandler;
    chatInput.onkeypress = (e) => { if (e.key === 'Enter') sendHandler(); };
}

// ------------------------------------------
// 18x18 BOARD LOGIC & SCALED RENDERING
// ------------------------------------------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const BOARD_SIZE = 18; // Updated to 18x18 grid

function getInitialBoardState() {
    let board = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        let row = [];
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (r === 0) {
                // Example top row pieces configuration or blank layout filling 18 columns
                row.push(c % 2 === 0 ? 'r' : 'n');
            } else if (r === 1) {
                row.push('p');
            } else if (r === BOARD_SIZE - 2) {
                row.push('P');
            } else if (r === BOARD_SIZE - 1) {
                row.push(c % 2 === 0 ? 'R' : 'N');
            } else {
                row.push('');
            }
        }
        board.push(row);
    }
    return board;
}

function joinRoomSession(roomId) {
    currentRoomId = roomId;
    const roomRef = ref(db, `rooms/${roomId}`);

    get(roomRef).then((snapshot) => {
        if (!snapshot.exists()) return;
        const room = snapshot.val();
        
        userTeam = room.host === currentUser ? 'white' : 'black';
        document.getElementById('playerTeamBadge').textContent = `Team: ${userTeam.toUpperCase()} (${currentUser})`;
        showScreen('game');
        gameActive = true;

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

    // Dynamically match canvas internal size to its CSS display width for high fidelity
    const displayWidth = canvas.clientWidth || 360;
    if (canvas.width !== displayWidth || canvas.height !== displayWidth) {
        canvas.width = displayWidth;
        canvas.height = displayWidth;
    }

    const sqSize = canvas.width / BOARD_SIZE;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const isLight = (row + col) % 2 === 0;
            ctx.fillStyle = isLight ? '#2a2a2a' : '#1a1a1a';
            
            if (selectedSquare && selectedSquare.row === row && selectedSquare.col === col) {
                ctx.fillStyle = '#2196F3';
            }

            ctx.fillRect(col * sqSize, row * sqSize, sqSize, sqSize);

            const piece = boardState[row][col];
            if (piece) {
                // Dynamically scale font size relative to current square sizing
                const fontSize = Math.max(10, Math.floor(sqSize * 0.65));
                ctx.font = `${fontSize}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = piece === piece.toUpperCase() ? '#ffffff' : '#ff5252';
                ctx.fillText(getPieceSymbol(piece), col * sqSize + sqSize / 2, row * sqSize + sqSize / 2);
            }
        }
    }
}

function getPieceSymbol(p) {
    const symbols = {
        'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
        'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
    };
    return symbols[p] || p;
}

canvas.addEventListener('click', (e) => {
    if (!gameActive || localTurn !== userTeam) return;

    const rect = canvas.getBoundingClientRect();
    const sqSize = rect.width / BOARD_SIZE;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const col = Math.floor(x / sqSize);
    const row = Math.floor(y / sqSize);

    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return;

    const clickedPiece = boardState[row][col];
    const isMyPiece = clickedPiece && ((userTeam === 'white' && clickedPiece === clickedPiece.toUpperCase()) || 
                                       (userTeam === 'black' && clickedPiece === clickedPiece.toLowerCase()));

    if (isMyPiece) {
        selectedSquare = { row, col };
        renderBoard();
    } else if (selectedSquare) {
        executeMove(selectedSquare.row, selectedSquare.col, row, col);
        selectedSquare = null;
    }
});

async function executeMove(fromR, fromC, toR, toC) {
    const roomRef = ref(db, `rooms/${currentRoomId}`);
    await runTransaction(roomRef, (room) => {
        if (room && room.turn === userTeam) {
            const piece = room.board[fromR][fromC];
            room.board[fromR][fromC] = '';
            room.board[toR][toC] = piece;
            room.turn = room.turn === 'white' ? 'black' : 'white';
        }
        return room;
    });
}

function initMatchChat(roomId) {
    const chatMsgContainer = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const chatSend = document.getElementById('chatSend');

    onValue(ref(db, `rooms/${roomId}/chat`), (snapshot) => {
        const msgs = snapshot.val() || {};
        chatMsgContainer.innerHTML = Object.values(msgs).map(m => `
            <div class="chat-msg"><b>${m.sender}:</b> ${m.text}</div>
        `).join('');
        chatMsgContainer.scrollTop = chatMsgContainer.scrollHeight;
    });

    const sendHandler = () => {
        const text = chatInput.value.trim();
        if (!text) return;
        push(ref(db, `rooms/${roomId}/chat`), { sender: currentUser, text, timestamp: Date.now() });
        chatInput.value = '';
    };

    chatSend.onclick = sendHandler;
    chatInput.onkeypress = (e) => { if (e.key === 'Enter') sendHandler(); };
}

document.getElementById('surrenderBtn').addEventListener('click', async () => {
    if (confirm("Are you sure you want to surrender and leave the match?")) {
        if (currentRoomId) await remove(ref(db, `rooms/${currentRoomId}`));
        currentRoomId = null;
        gameActive = false;
        showScreen('lobby');
    }
});

document.getElementById('clearConsole').addEventListener('click', () => {
    document.getElementById('console-logs').innerHTML = '';
});

showScreen('login');
