import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, push, remove, update, get, onDisconnect, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Console Tracking Interceptor
const consoleLogsEl = document.getElementById('console-logs');
function logToScreen(type, args) {
    const line = document.createElement('div');
    line.textContent = `[${new Date().toLocaleTimeString()}] [${type.toUpperCase()}] ` + Array.from(args).map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : arg
    ).join(' ');
    if(type === 'error') line.style.color = '#ff5252';
    if(type === 'warn') line.style.color = '#ffeb3b';
    consoleLogsEl.appendChild(line);
    consoleLogsEl.scrollTop = consoleLogsEl.scrollHeight;
}

const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = function(...args) {
    originalConsoleLog.apply(console, args);
    logToScreen('log', args);
};
console.error = function(...args) {
    originalConsoleError.apply(console, args);
    logToScreen('error', args);
};
console.warn = function(...args) {
    originalConsoleWarn.apply(console, args);
    logToScreen('warn', args);
};

document.getElementById('clearConsole').onclick = () => {
    consoleLogsEl.innerHTML = '';
};

console.log("Initializing DevOnline Firebase App...");

const firebaseConfig = {
    databaseURL: "https://mchess12333-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
console.log("Firebase connection established successfully.");

// Unique session token generated per browser instance to prevent simultaneous multi-device logins
let sessionToken = localStorage.getItem('devOnlineSessionToken');
if (!sessionToken) {
    sessionToken = 'sess_' + Math.random().toString(36.2) + Date.now().toString(36);
    localStorage.setItem('devOnlineSessionToken', sessionToken);
}

// 10 Preset Accounts
const validUsers = {};
for(let i=1; i<=10; i++) {
    validUsers[`player${i}`] = "123";
}

let currentUser = localStorage.getItem('devOnlineUser') || null;
let currentServerId = localStorage.getItem('devOnlineServer') || null;
let myTeam = localStorage.getItem('devOnlineTeam') || null;
let presenceRef = null;
let sessionUnsubscribe = null;

const screens = {
    login: document.getElementById('login-screen'),
    reconnect: document.getElementById('reconnect-screen'),
    lobby: document.getElementById('lobby-screen'),
    wait: document.getElementById('wait-screen'),
    game: document.getElementById('game-screen')
};

function switchScreen(name) {
    console.log(`Switching view to screen: ${name}`);
    Object.values(screens).forEach(el => el.classList.remove('active'));
    screens[name].classList.add('active');
}

// Browser Reload / Close Prevention Warning Hook
window.addEventListener('beforeunload', (e) => {
    if (currentServerId) {
        e.preventDefault();
        e.returnValue = "You are currently in an active match! Reloading or leaving may interrupt your game session.";
        return e.returnValue;
    }
});

// Active Player List & Presence System Tracker (with Multi-Device Session Conflict Detection)
function initPresenceSystem() {
    if (!currentUser) return;
    presenceRef = ref(db, `presence/${currentUser}`);
    
    // Write our active session token to Firebase presence node
    set(presenceRef, {
        online: true,
        sessionToken: sessionToken,
        lastSeen: serverTimestamp()
    });
    onDisconnect(presenceRef).remove();

    // Heartbeat update
    const heartbeatInterval = setInterval(() => {
        if(currentUser) {
            set(presenceRef, { online: true, sessionToken: sessionToken, lastSeen: serverTimestamp() });
        } else {
            clearInterval(heartbeatInterval);
        }
    }, 10000);

    // Listen to presence node changes to detect if another device logged in with the same account
    if (sessionUnsubscribe) sessionUnsubscribe();
    sessionUnsubscribe = onValue(presenceRef, (snapshot) => {
        const data = snapshot.val();
        if (data && data.sessionToken && data.sessionToken !== sessionToken) {
            console.warn(`Concurrent login detected for user ${currentUser} from another device! Signing out this session.`);
            forceSignOutDueToConcurrentLogin("Your account was logged in from another device. You have been signed out.");
        }
    });

    // Global presence list watcher for UI drawer
    onValue(ref(db, 'presence'), (snapshot) => {
        const data = snapshot.val() || {};
        const activeUsers = Object.keys(data);
        const count = activeUsers.length;

        const dotEl = document.getElementById('statusDot');
        const countTextEl = document.getElementById('onlineCountText');
        const listEl = document.getElementById('playersListContainer');

        countTextEl.textContent = `Active Players (${count})`;
        listEl.innerHTML = '';

        if (count === 0) {
            listEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.75rem; text-align:center;">No players online</div>';
        } else {
            activeUsers.forEach(uname => {
                const card = document.createElement('div');
                card.className = 'player-card';
                card.innerHTML = `<span>👤 <b>${uname}</b> ${uname === currentUser ? '(You)' : ''}</span><div class="player-badge-online"></div>`;
                listEl.appendChild(card);
            });
        }

        if (count > 1) {
            dotEl.classList.add('active-multiple');
        } else {
            dotEl.classList.remove('active-multiple');
        }
    });
}

function forceSignOutDueToConcurrentLogin(msg) {
    alert(msg);
    if (presenceRef) {
        remove(presenceRef);
    }
    if (currentServerId) {
        remove(ref(db, `servers/${currentServerId}`));
        currentServerId = null;
        localStorage.removeItem('devOnlineServer');
        localStorage.removeItem('devOnlineTeam');
    }
    localStorage.removeItem('devOnlineUser');
    currentUser = null;
    switchScreen('login');
}

// Login Logic
document.getElementById('loginBtn').addEventListener('click', () => {
    const u = document.getElementById('userInput').value.trim();
    const p = document.getElementById('passInput').value.trim();
    const err = document.getElementById('loginError');

    console.log(`Login attempt initiated for username: "${u}"`);

    if(validUsers[u] && validUsers[u] === p) {
        // Check if user is already actively online on another device before granting login
        const targetPresenceRef = ref(db, `presence/${u}`);
        get(targetPresenceRef).then(snapshot => {
            const existingPresence = snapshot.val();
            if (existingPresence && existingPresence.online) {
                console.warn(`Login rejected: User ${u} is already active on another device.`);
                err.textContent = "Error: Account is already logged in on another device!";
                return;
            }

            currentUser = u;
            localStorage.setItem('devOnlineUser', u);
            err.textContent = '';
            console.log(`Login successful. Welcome user: ${currentUser}`);
            initPresenceSystem();
            checkExistingMatchReconnection();
        }).catch(err => {
            console.error("Presence check error during login:", err);
            err.textContent = "Login verification failed. Try again.";
        });
    } else {
        err.textContent = "Invalid account credentials!";
        console.warn(`Login failed for username: "${u}"`);
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    handleLogoutCleanExit();
});

function handleLogoutCleanExit() {
    console.log(`User ${currentUser} logging out / exiting.`);
    if (presenceRef) {
        remove(presenceRef);
    }
    if (currentServerId) {
        remove(ref(db, `servers/${currentServerId}`));
        currentServerId = null;
        localStorage.removeItem('devOnlineServer');
        localStorage.removeItem('devOnlineTeam');
    }
    localStorage.removeItem('devOnlineUser');
    currentUser = null;
    switchScreen('login');
}

function checkExistingMatchReconnection() {
    if (!currentServerId) {
        initLobby();
        return;
    }

    console.log(`Checking if previous server room ${currentServerId} still exists for manual reconnection choice...`);
    get(ref(db, `servers/${currentServerId}`)).then(snapshot => {
        const srv = snapshot.val();
        if (srv && srv.status === 'playing' && (srv.host === currentUser || srv.guest === currentUser)) {
            console.log("Active saved match found. Prompting player to rejoin or decline.");
            switchScreen('reconnect');
        } else {
            console.log("Previous match no longer active. Entering lobby.");
            currentServerId = null;
            localStorage.removeItem('devOnlineServer');
            localStorage.removeItem('devOnlineTeam');
            initLobby();
        }
    }).catch(() => {
        initLobby();
    });
}

document.getElementById('rejoinYesBtn').addEventListener('click', () => {
    console.log(`Player opted to rejoin match ID: ${currentServerId}`);
    switchScreen('game');
    startCanvasGame();
});

document.getElementById('rejoinNoBtn').addEventListener('click', () => {
    console.log(`Player opted NOT to rejoin. Terminating match room: ${currentServerId}`);
    if (currentServerId) {
        update(ref(db, `servers/${currentServerId}`), {
            status: 'ended',
            reason: `${currentUser} declined to rejoin. Match terminated.`
        }).then(() => {
            remove(ref(db, `servers/${currentServerId}`));
        }).catch(() => {
            remove(ref(db, `servers/${currentServerId}`));
        });
        currentServerId = null;
        localStorage.removeItem('devOnlineServer');
        localStorage.removeItem('devOnlineTeam');
    }
    initLobby();
});

if(currentUser) {
    console.log(`Found active session in localStorage for user: ${currentUser}`);
    initPresenceSystem();
    checkExistingMatchReconnection();
}

function initLobby() {
    document.getElementById('welcomeUser').textContent = `User: ${currentUser}`;
    switchScreen('lobby');
    console.log("Loading server lobby data stream...");

    const serversRef = ref(db, 'servers');
    onValue(serversRef, (snapshot) => {
        const data = snapshot.val();
        const listEl = document.getElementById('serverList');
        listEl.innerHTML = '';

        if(!data) {
            listEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.8rem; text-align:center; margin-top:20px;">No servers active. Create one!</div>';
            return;
        }

        Object.keys(data).forEach(srvId => {
            const srv = data[srvId];
            const item = document.createElement('div');
            item.className = 'server-item';

            if(srv.status === 'waiting') {
                item.innerHTML = `<span>Host: <b>${srv.host}</b></span>`;
                const joinBtn = document.createElement('button');
                joinBtn.className = 'btn';
                joinBtn.textContent = 'Join Match';
                joinBtn.onclick = () => joinServer(srvId);
                item.appendChild(joinBtn);
            } else if(srv.status === 'playing') {
                item.innerHTML = `<span>Host: <b>${srv.host}</b> vs <b>${srv.guest || 'Guest'}</b></span><span style="color:#ffeb3b; font-size:0.75rem; font-weight:bold;">Ongoing / Online</span>`;
            } else {
                return;
            }
            listEl.appendChild(item);
        });
    });

    initGlobalChat();
}

// Administrative Clear Button Logic (Clears all matches & user-modified data in Firebase)
document.getElementById('adminClearBtn').addEventListener('click', () => {
    if(confirm("ADMIN ACTION: Are you sure you want to clear all active servers, match data, and universal chat logs from Firebase?")) {
        console.log("Admin clearing all servers and user data nodes in Firebase...");
        
        const updates = {};
        updates['servers'] = null;
        updates['globalChat'] = null;

        update(ref(db), updates).then(() => {
            console.log("All servers and global chat wiped successfully.");
            currentServerId = null;
            localStorage.removeItem('devOnlineServer');
            localStorage.removeItem('devOnlineTeam');
            alert("All matches and chat data have been cleared successfully.");
            initLobby();
        }).catch(err => {
            console.error("Failed to clear Firebase data:", err);
            alert("Error clearing data: " + err.message);
        });
    }
});

// Universal Global Chat System
function initGlobalChat() {
    const globalChatMessagesEl = document.getElementById('globalChatMessages');
    const globalChatRef = ref(db, 'globalChat');

    onValue(globalChatRef, (snapshot) => {
        const data = snapshot.val();
        globalChatMessagesEl.innerHTML = '';
        if(!data) {
            globalChatMessagesEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.75rem; text-align:center; margin-top:30px;">No messages in global chat yet. Say hi!</div>';
            return;
        }

        Object.values(data).forEach(msg => {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'global-chat-msg';
            msgDiv.innerHTML = `<b>${msg.sender}:</b> ${msg.text}`;
            globalChatMessagesEl.appendChild(msgDiv);
        });
        globalChatMessagesEl.scrollTop = globalChatMessagesEl.scrollHeight;
    });
}

document.getElementById('globalChatSend').addEventListener('click', sendGlobalChatMessage);
document.getElementById('globalChatInput').addEventListener('keypress', (e) => {
    if(e.key === 'Enter') sendGlobalChatMessage();
});

function sendGlobalChatMessage() {
    const input = document.getElementById('globalChatInput');
    const msg = input.value.trim();
    if(!msg || !currentUser) return;

    console.log(`Sending global chat message from ${currentUser}: "${msg}"`);
    const globalChatRef = ref(db, 'globalChat');
    push(globalChatRef, {
        sender: currentUser,
        text: msg,
        timestamp: serverTimestamp()
    });
    input.value = '';
}

// Create Server
document.getElementById('createServerBtn').addEventListener('click', () => {
    console.log(`User ${currentUser} is creating a new server instance...`);
    const newSrvRef = push(ref(db, 'servers'));
    currentServerId = newSrvRef.key;
    myTeam = 'blue';

    localStorage.setItem('devOnlineServer', currentServerId);
    localStorage.setItem('devOnlineTeam', myTeam);

    const initialUnits = [
        { id: 'b1', team: 'blue', type: 'tank', x: 1, y: 7 },
        { id: 'b2', team: 'blue', type: 'infantry', x: 3, y: 7 },
        { id: 'b3', team: 'blue', type: 'infantry', x: 6, y: 7 },
        { id: 'r1', team: 'red', type: 'infantry', x: 1, y: 0 },
        { id: 'r2', team: 'red', type: 'infantry', x: 4, y: 0 },
        { id: 'r3', team: 'red', type: 'tank', x: 6, y: 0 }
    ];

    set(newSrvRef, {
        host: currentUser,
        guest: null,
        status: 'waiting',
        turn: 'blue',
        units: initialUnits
    }).then(() => {
        console.log(`Server successfully created with ID: ${currentServerId} (Host assigned Blue Team)`);
        document.getElementById('roomCodeDisplay').textContent = `Server ID: ${currentServerId}`;
        switchScreen('wait');
        listenToMatchState();
    }).catch(err => {
        console.error("Error creating server:", err);
    });
});

document.getElementById('cancelRoomBtn').addEventListener('click', () => {
    if(currentServerId) {
        console.log(`Cancelling server room ${currentServerId}`);
        remove(ref(db, `servers/${currentServerId}`));
        currentServerId = null;
        localStorage.removeItem('devOnlineServer');
        localStorage.removeItem('devOnlineTeam');
    }
    switchScreen('lobby');
});

function joinServer(srvId) {
    currentServerId = srvId;
    myTeam = 'red';

    localStorage.setItem('devOnlineServer', currentServerId);
    localStorage.setItem('devOnlineTeam', myTeam);

    console.log(`User ${currentUser} joining server ${srvId} as Red Team guest.`);

    update(ref(db, `servers/${srvId}`), {
        guest: currentUser,
        status: 'playing'
    }).then(() => {
        console.log("Successfully joined match. Starting game canvas interface.");
        switchScreen('game');
        startCanvasGame();
    }).catch(err => {
        console.error("Error joining server:", err);
    });
}

function listenToMatchState() {
    const srvRef = ref(db, `servers/${currentServerId}`);
    onValue(srvRef, (snapshot) => {
        const srv = snapshot.val();
        if(srv && srv.status === 'playing') {
            console.log("Opponent joined! Match starting status triggered.");
            switchScreen('game');
            startCanvasGame();
        }
    });
}

// Absolute Surrender / Leave Match Handler
document.getElementById('surrenderBtn').addEventListener('click', () => {
    triggerMatchEnd("You surrendered or left the match.");
});

function triggerMatchEnd(reason) {
    console.log(`Match termination triggered: ${reason}`);
    if (currentServerId) {
        update(ref(db, `servers/${currentServerId}`), {
            status: 'ended',
            reason: `${currentUser} surrendered and left the match.`
        }).then(() => {
            remove(ref(db, `servers/${currentServerId}`));
        }).catch(() => {
            remove(ref(db, `servers/${currentServerId}`));
        });

        currentServerId = null;
        localStorage.removeItem('devOnlineServer');
        localStorage.removeItem('devOnlineTeam');
    }
    alert(reason);
    initLobby();
}

// Canvas Game Logic & Realtime Listeners
function startCanvasGame() {
    console.log("Canvas game loop initialized.");
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const tileSize = 40;
    let selectedUnit = null;

    const srvRef = ref(db, `servers/${currentServerId}`);
    
    onValue(srvRef, (snapshot) => {
        const match = snapshot.val();
        if(!match) {
            console.warn("Match data missing or room deleted.");
            alert("The match was ended or the opponent left.");
            currentServerId = null;
            localStorage.removeItem('devOnlineServer');
            localStorage.removeItem('devOnlineTeam');
            initLobby();
            return;
        }

        if(match.status === 'ended') {
            console.warn("Match ended by server notice.");
            alert(match.reason || "Match ended!");
            currentServerId = null;
            localStorage.removeItem('devOnlineServer');
            localStorage.removeItem('devOnlineTeam');
            initLobby();
            return;
        }

        renderBoard(match);
    });

    setupMatchChat();

    function boardToScreen(x, y) {
        if (myTeam === 'red') {
            return { x: 7 - x, y: 7 - y };
        }
        return { x: x, y: y };
    }

    function screenToboard(sx, sy) {
        if (myTeam === 'red') {
            return { x: 7 - sx, y: 7 - sy };
        }
        return { x: sx, y: sy };
    }

    function renderBoard(match) {
        ctx.clearRect(0, 0, 320, 320);

        for(let r=0; r<8; r++) {
            for(let c=0; c<8; c++) {
                ctx.fillStyle = (r + c) % 2 === 0 ? '#1e1e1e' : '#161616';
                ctx.fillRect(c * tileSize, r * tileSize, tileSize, tileSize);
                ctx.strokeStyle = '#282828';
                ctx.strokeRect(c * tileSize, r * tileSize, tileSize, tileSize);
            }
  