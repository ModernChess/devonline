import { db, ref, set, onValue, push, remove, update, get, onDisconnect, serverTimestamp } from './firebase-service.js';

// =========================================================================
// MODERN CHESS: CONSOLE TRACKING & INTERCEPTOR
// =========================================================================
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

console.log("Initializing DevOnline Firebase App with 18x18 Map Framework...");

// =========================================================================
// 18x18 MAP CONSTANTS & ASSET MANIFEST SETUP
// =========================================================================
const COLS = 18;
const ROWS = 18;
const GH_BASE = 'https://cdn.jsdelivr.net/gh/ModernChess/assets-images@main/';

const assetManifest = [
    GH_BASE + 'map2.png',
    GH_BASE + 'blue_tank.jpg',
    GH_BASE + 'blue_infantry.jpg',
    GH_BASE + 'blue_artillery.jpg',
    GH_BASE + 'blue_ship.jpg',
    GH_BASE + 'red_tank.jpg',
    GH_BASE + 'red_infantry.jpg',
    GH_BASE + 'red_artillery.jpg',
    GH_BASE + 'red_ship.jpg'
];

let assetsLoadedCount = 0;
const totalAssets = assetManifest.length;

const mapImg = new Image(); let mapLoaded = false;
const blueTankImg = new Image(); let blueTankLoaded = false;
const blueInfantryImg = new Image(); let blueInfantryLoaded = false;
const blueArtilleryImg = new Image(); let blueArtilleryLoaded = false;
const blueShipImg = new Image(); let blueShipLoaded = false;
const redTankImg = new Image(); let redTankLoaded = false;
const redInfantryImg = new Image(); let redInfantryLoaded = false;
const redArtilleryImg = new Image(); let redArtilleryLoaded = false;
const redShipImg = new Image(); let redShipLoaded = false;

function updateAssetProgress() {
    assetsLoadedCount++;
    console.log(`Loading Assets: ${assetsLoadedCount}/${totalAssets} completed.`);
}

function fetchAndLoadAsset(url, imgObj, setFlag) {
    fetch(url)
        .then(res => {
            if (!res.ok) throw new Error('Network response failure');
            return res.blob();
        })
        .then(blob => {
            imgObj.src = URL.createObjectURL(blob);
            imgObj.onload = () => { setFlag(true); updateAssetProgress(); };
        })
        .catch(() => {
            imgObj.src = url;
            imgObj.onload = () => { setFlag(true); updateAssetProgress(); };
            imgObj.onerror = () => { updateAssetProgress(); };
        });
}

// Trigger asset pipeline loading
fetchAndLoadAsset(assetManifest[0], mapImg, (v) => mapLoaded = v);
fetchAndLoadAsset(assetManifest[1], blueTankImg, (v) => blueTankLoaded = v);
fetchAndLoadAsset(assetManifest[2], blueInfantryImg, (v) => blueInfantryLoaded = v);
fetchAndLoadAsset(assetManifest[3], blueArtilleryImg, (v) => blueArtilleryLoaded = v);
fetchAndLoadAsset(assetManifest[4], blueShipImg, (v) => blueShipLoaded = v);
fetchAndLoadAsset(assetManifest[5], redTankImg, (v) => redTankLoaded = v);
fetchAndLoadAsset(assetManifest[6], redInfantryImg, (v) => redInfantryLoaded = v);
fetchAndLoadAsset(assetManifest[7], redArtilleryImg, (v) => redArtilleryLoaded = v);
fetchAndLoadAsset(assetManifest[8], redShipImg, (v) => redShipLoaded = v);

// 18x18 Terrain Analysis Function
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
    if (['A11', 'B11', 'B12', 'A13', 'B13'].includes(coord)) return 'blue_base';
    if (coord === 'L1') return 'red_core';
    if (['K1', 'M1', 'K2', 'L2', 'M2'].includes(coord)) return 'red_base';
    return 'land';
}

function getBaseSquares(team) {
    let list = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let t = getTerrain(c, r);
            if (team === 'blue' && (t === 'blue_base' || t === 'blue_core')) list.push({c, r});
            if (team === 'red' && (t === 'red_base' || t === 'red_core')) list.push({c, r});
        }
    }
    return list;
}

function getPortSquare(team) {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let t = getTerrain(c, r);
            if (team === 'blue' && t === 'blue_navy') return {c, r};
            if (team === 'red' && t === 'red_navy') return {c, r};
        }
    }
    return {c: 0, r: 0};
}

// Generate Full 18x18 Unit Roster for Server Creation
function generateInitial18x18Units() {
    let units = [];
    
    // Blue Team Units Setup
    let blueBases = getBaseSquares('blue');
    let bluePort = getPortSquare('blue');
    if (blueBases.length >= 3) {
        units.push({ id: 'b_tank', team: 'blue', type: 'tank', x: blueBases[0].c, y: blueBases[0].r });
        units.push({ id: 'b_inf', team: 'blue', type: 'infantry', x: blueBases[1].c, y: blueBases[1].r });
        units.push({ id: 'b_art', team: 'blue', type: 'artillery', x: blueBases[2].c, y: blueBases[2].r });
    }
    units.push({ id: 'b_shp', team: 'blue', type: 'ship', x: bluePort.c, y: bluePort.r });

    // Red Team Units Setup
    let redBases = getBaseSquares('red');
    let redPort = getPortSquare('red');
    if (redBases.length >= 3) {
        units.push({ id: 'r_tank', team: 'red', type: 'tank', x: redBases[0].c, y: redBases[0].r });
        units.push({ id: 'r_inf', team: 'red', type: 'infantry', x: redBases[1].c, y: redBases[1].r });
        units.push({ id: 'r_art', team: 'red', type: 'artillery', x: redBases[2].c, y: redBases[2].r });
    }
    units.push({ id: 'r_shp', team: 'red', type: 'ship', x: redPort.c, y: redPort.r });

    return units;
}

// =========================================================================
// SESSION TOKEN & AUTHENTICATION
// =========================================================================
let sessionToken = localStorage.getItem('devOnlineSessionToken');
if (!sessionToken) {
    sessionToken = 'sess_' + Math.random().toString(36.2) + Date.now().toString(36);
    localStorage.setItem('devOnlineSessionToken', sessionToken);
}

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

window.addEventListener('beforeunload', (e) => {
    if (currentServerId) {
        e.preventDefault();
        e.returnValue = "You are currently in an active match! Reloading or leaving may interrupt your game session.";
        return e.returnValue;
    }
});

// =========================================================================
// PRESENCE & CONCURRENT LOGIN TRACKER
// =========================================================================
function initPresenceSystem() {
    if (!currentUser) return;
    presenceRef = ref(db, `presence/${currentUser}`);
    
    set(presenceRef, {
        online: true,
        sessionToken: sessionToken,
        lastSeen: serverTimestamp()
    });
    onDisconnect(presenceRef).remove();

    const heartbeatInterval = setInterval(() => {
        if(currentUser) {
            set(presenceRef, { online: true, sessionToken: sessionToken, lastSeen: serverTimestamp() });
        } else {
            clearInterval(heartbeatInterval);
        }
    }, 10000);

    if (sessionUnsubscribe) sessionUnsubscribe();
    sessionUnsubscribe = onValue(presenceRef, (snapshot) => {
        const data = snapshot.val();
        if (data && data.sessionToken && data.sessionToken !== sessionToken) {
            console.warn(`Concurrent login detected for user ${currentUser}! Signing out.`);
            forceSignOutDueToConcurrentLogin("Your account was logged in from another device.");
        }
    });

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
    if (presenceRef) remove(presenceRef);
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

// =========================================================================
// LOGIN & LOBBY ROUTINES
// =========================================================================
document.getElementById('loginBtn').addEventListener('click', () => {
    const u = document.getElementById('userInput').value.trim();
    const p = document.getElementById('passInput').value.trim();
    const err = document.getElementById('loginError');

    console.log(`Login attempt for username: "${u}"`);

    if(validUsers[u] && validUsers[u] === p) {
        const targetPresenceRef = ref(db, `presence/${u}`);
        get(targetPresenceRef).then(snapshot => {
            const existingPresence = snapshot.val();
            if (existingPresence && existingPresence.online) {
                err.textContent = "Error: Account is already logged in on another device!";
                return;
            }

            currentUser = u;
            localStorage.setItem('devOnlineUser', u);
            err.textContent = '';
            console.log(`Login successful: ${currentUser}`);
            initPresenceSystem();
            checkExistingMatchReconnection();
        }).catch(err => {
            console.error("Presence check error:", err);
            err.textContent = "Login verification failed.";
        });
    } else {
        err.textContent = "Invalid credentials!";
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    handleLogoutCleanExit();
});

function handleLogoutCleanExit() {
    if (presenceRef) remove(presenceRef);
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

    get(ref(db, `servers/${currentServerId}`)).then(snapshot => {
        const srv = snapshot.val();
        if (srv && srv.status === 'playing' && (srv.host === currentUser || srv.guest === currentUser)) {
            switchScreen('reconnect');
        } else {
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
    switchScreen('game');
    startCanvasGame();
});

document.getElementById('rejoinNoBtn').addEventListener('click', () => {
    if (currentServerId) {
        update(ref(db, `servers/${currentServerId}`), {
            status: 'ended',
            reason: `${currentUser} declined to rejoin.`
        }).finally(() => {
            remove(ref(db, `servers/${currentServerId}`));
        });
        currentServerId = null;
        localStorage.removeItem('devOnlineServer');
        localStorage.removeItem('devOnlineTeam');
    }
    initLobby();
});

if(currentUser) {
    initPresenceSystem();
    checkExistingMatchReconnection();
}

function initLobby() {
    document.getElementById('welcomeUser').textContent = `User: ${currentUser}`;
    switchScreen('lobby');
    console.log("Loading lobby server stream...");

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
                item.innerHTML = `<span>Host: <b>${srv.host}</b> vs <b>${srv.guest || 'Guest'}</b></span><span style="color:#ffeb3b; font-size:0.75rem;">Ongoing</span>`;
            } else {
                return;
            }
            listEl.appendChild(item);
        });
    });

    initGlobalChat();
}

document.getElementById('adminClearBtn').addEventListener('click', () => {
    if(confirm("Clear all active servers and global chat?")) {
        update(ref(db), { 'servers': null, 'globalChat': null }).then(() => {
            currentServerId = null;
            localStorage.removeItem('devOnlineServer');
            localStorage.removeItem('devOnlineTeam');
            alert("Cleared successfully.");
            initLobby();
        });
    }
});

function initGlobalChat() {
    const globalChatMessagesEl = document.getElementById('globalChatMessages');
    const globalChatRef = ref(db, 'globalChat');

    onValue(globalChatRef, (snapshot) => {
        const data = snapshot.val();
        globalChatMessagesEl.innerHTML = '';
        if(!data) {
            globalChatMessagesEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.75rem; text-align:center; margin-top:30px;">No messages yet.</div>';
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

    push(ref(db, 'globalChat'), {
        sender: currentUser,
        text: msg,
        timestamp: serverTimestamp()
    });
    input.value = '';
}

// =========================================================================
// SERVER CREATION & JOINING ROUTINES (USING 18x18 UNITS)
// =========================================================================
document.getElementById('createServerBtn').addEventListener('click', () => {
    const newSrvRef = push(ref(db, 'servers'));
    currentServerId = newSrvRef.key;
    myTeam = 'blue';

    localStorage.setItem('devOnlineServer', currentServerId);
    localStorage.setItem('devOnlineTeam', myTeam);

    const initialUnits = generateInitial18x18Units();

    set(newSrvRef, {
        host: currentUser,
        guest: null,
        status: 'waiting',
        turn: 'blue',
        units: initialUnits
    }).then(() => {
        console.log(`Server created with ID: ${currentServerId} (18x18 Units Ready)`);
        document.getElementById('roomCodeDisplay').textContent = `Server ID: ${currentServerId}`;
        switchScreen('wait');
        listenToMatchState();
    });
});

document.getElementById('cancelRoomBtn').addEventListener('click', () => {
    if(currentServerId) {
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

    update(ref(db, `servers/${srvId}`), {
        guest: currentUser,
        status: 'playing'
    }).then(() => {
        switchScreen('game');
        startCanvasGame();
    });
}

function listenToMatchState() {
    onValue(ref(db, `servers/${currentServerId}`), (snapshot) => {
        const srv = snapshot.val();
        if(srv && srv.status === 'playing') {
            switchScreen('game');
            startCanvasGame();
        }
    });
}

document.getElementById('surrenderBtn').addEventListener('click', () => {
    triggerMatchEnd("You left or surrendered the match.");
});

function triggerMatchEnd(reason) {
    if (currentServerId) {
        update(ref(db, `servers/${currentServerId}`), {
            status: 'ended',
            reason: `${currentUser} left the match.`
        }).finally(() => {
            remove(ref(db, `servers/${currentServerId}`));
        });

        currentServerId = null;
        localStorage.removeItem('devOnlineServer');
        localStorage.removeItem('devOnlineTeam');
    }
    alert(reason);
    initLobby();
}

// =========================================================================
// 18x18 CANVAS GAME ENGINE & REALTIME RENDERING
// =========================================================================
function startCanvasGame() {
    console.log("Starting 18x18 Canvas Game Engine loop.");
    const canvas = document.getElementById('gameCanvas');
    
    // Scale canvas dimensions to 540x540 for 18x18 grid standard
    canvas.width = 540;
    canvas.height = 540;
    
    const ctx = canvas.getContext('2d');
    const cellSize = canvas.width / COLS; // Exactly 30px per cell
    let selectedUnit = null;

    const srvRef = ref(db, `servers/${currentServerId}`);
    
    onValue(srvRef, (snapshot) => {
        const match = snapshot.val();
        if(!match || match.status === 'ended') {
            alert(match?.reason || "Match ended or opponent left.");
            currentServerId = null;
            localStorage.removeItem('devOnlineServer');
            localStorage.removeItem('devOnlineTeam');
            initLobby();
            return;
        }

        renderBoardAndUnits(match);
    });

    if (typeof setupMatchChat === 'function') {
        setupMatchChat();
    }

    function renderBoardAndUnits(match) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw map background image
        if (mapLoaded) {
            ctx.drawImage(mapImg, 0, 0, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = '#16161c';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Highlight selected unit range overlay
        if(selectedUnit && match.turn === myTeam) {
            ctx.fillStyle = 'rgba(52, 152, 219, 0.35)';
            ctx.fillRect(selectedUnit.x * cellSize, selectedUnit.y * cellSize, cellSize, cellSize);
            
            for(let dr = -1; dr <= 1; dr++) {
                for(let dc = -1; dc <= 1; dc++) {
                    const nx = selectedUnit.x + dc;
                    const ny = selectedUnit.y + dr;
                    if(nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
                        ctx.strokeStyle = '#3498db';
                        ctx.lineWidth = 1.5;
                        ctx.strokeRect(nx * cellSize, ny * cellSize, cellSize, cellSize);
                    }
                }
            }
        }

        // Render all units on the 18x18 map
        if(match.units) {
            match.units.forEach(u => {
                let uImg = blueTankImg;
                let isLoaded = () => false;

                if (u.team === 'blue') {
                    if (u.type === 'tank') { uImg = blueTankImg; isLoaded = () => blueTankLoaded; }
                    else if (u.type === 'infantry') { uImg = blueInfantryImg; isLoaded = () => blueInfantryLoaded; }
                    else if (u.type === 'artillery') { uImg = blueArtilleryImg; isLoaded = () => blueArtilleryLoaded; }
                    else if (u.type === 'ship') { uImg = blueShipImg; isLoaded = () => blueShipLoaded; }
                } else {
                    if (u.type === 'tank') { uImg = redTankImg; isLoaded = () => redTankLoaded; }
                    else if (u.type === 'infantry') { uImg = redInfantryImg; isLoaded = () => redInfantryLoaded; }
                    else if (u.type === 'artillery') { uImg = redArtilleryImg; isLoaded = () => redArtilleryLoaded; }
                    else if (u.type === 'ship') { uImg = redShipImg; isLoaded = () => redShipLoaded; }
                }

                // Shadow effect under each unit
                ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                ctx.beginPath();
                ctx.arc((u.x * cellSize) + cellSize / 2, (u.y * cellSize) + cellSize - 6, cellSize * 0.32, 0, Math.PI * 2);
                ctx.fill();

                if (isLoaded()) {
                    ctx.drawImage(uImg, (u.x * cellSize) + 1, (u.y * cellSize) + 1, cellSize - 2, cellSize - 2);
                } else {
                    ctx.fillStyle = u.team === 'blue' ? '#3498db' : '#e74c3c';
                    ctx.fillRect(u.x * cellSize + 4, u.y * cellSize + 4, cellSize - 8, cellSize - 8);
                }
            });
        }
    }

    // Click handler for 18x18 cell selection & movement sync
    canvas.onclick = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        const gridX = Math.floor(clickX / cellSize);
        const gridY = Math.floor(clickY / cellSize);

        get(srvRef).then((snapshot) => {
            const match = snapshot.val();
            if (!match || match.turn !== myTeam) return;

            let units = match.units || [];
            let clickedUnit = units.find(u => u.x === gridX && u.y === gridY);

            if (selectedUnit) {
                if (clickedUnit && clickedUnit.team === myTeam) {
                    selectedUnit = clickedUnit;
                    return;
                }

                let dx = Math.abs(selectedUnit.x - gridX);
                let dy = Math.abs(selectedUnit.y - gridY);

                if (dx <= 1 && dy <= 1) {
                    let updatedUnits = units.map(u => {
                        if (u.id === selectedUnit.id) {
                            return { ...u, x: gridX, y: gridY };
                        }
                        if (clickedUnit && u.id === clickedUnit.id && u.team !== myTeam) {
                            return null; // Eliminate enemy unit hit
                        }
                        return u;
                    }).filter(Boolean);

                    let nextTurn = (myTeam === 'blue') ? 'red' : 'blue';

                    update(srvRef, {
                        units: updatedUnits,
                        turn: nextTurn
                    }).then(() => {
                        selectedUnit = null;
                    });
                } else {
                    selectedUnit = null;
                }
            } else {
                if (clickedUnit && clickedUnit.team === myTeam) {
                    selectedUnit = clickedUnit;
                }
            }
        });
    };
}
