
import { db } from './firebase-config.js';
import { ref, set, onValue, push, remove, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getCurrentUser } from './auth-presence.js';

let currentServerId = localStorage.getItem('devOnlineServer') || null;
let myTeam = localStorage.getItem('devOnlineTeam') || null;

export function getCurrentServerId() {
    return currentServerId;
}

export function setCurrentServerId(id) {
    currentServerId = id;
    if (id) {
        localStorage.setItem('devOnlineServer', id);
    } else {
        localStorage.removeItem('devOnlineServer');
    }
}

export function getMyTeam() {
    return myTeam;
}

export function setMyTeam(team) {
    myTeam = team;
    if (team) {
        localStorage.setItem('devOnlineTeam', team);
    } else {
        localStorage.removeItem('devOnlineTeam');
    }
}

// Initialize server lobby and listeners
export function initLobby(onJoinServerCallback) {
    const currentUser = getCurrentUser();
    const welcomeUserEl = document.getElementById('welcomeUser');
    if (welcomeUserEl) {
        welcomeUserEl.textContent = `User: ${currentUser}`;
    }
    
    console.log("Loading server lobby data stream...");

    const serversRef = ref(db, 'servers');
    onValue(serversRef, (snapshot) => {
        const data = snapshot.val();
        const listEl = document.getElementById('serverList');
        if (!listEl) return;
        listEl.innerHTML = '';

        if (!data) {
            listEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.8rem; text-align:center; margin-top:20px;">No servers active. Create one!</div>';
            return;
        }

        Object.keys(data).forEach(srvId => {
            const srv = data[srvId];
            const item = document.createElement('div');
            item.className = 'server-item';

            if (srv.status === 'waiting') {
                item.innerHTML = `<span>Host: <b>${srv.host}</b></span>`;
                const joinBtn = document.createElement('button');
                joinBtn.className = 'btn';
                joinBtn.textContent = 'Join Match';
                joinBtn.onclick = () => {
                    joinServer(srvId, onJoinServerCallback);
                };
                item.appendChild(joinBtn);
            } else if (srv.status === 'playing') {
                item.innerHTML = `<span>Host: <b>${srv.host}</b> vs <b>${srv.guest || 'Guest'}</b></span><span style="color:#ffeb3b; font-size:0.75rem; font-weight:bold;">Ongoing / Online</span>`;
            } else {
                return;
            }
            listEl.appendChild(item);
        });
    });

    initGlobalChat();
}

// Universal Global Chat System
function initGlobalChat() {
    const globalChatMessagesEl = document.getElementById('globalChatMessages');
    const globalChatRef = ref(db, 'globalChat');

    onValue(globalChatRef, (snapshot) => {
        const data = snapshot.val();
        if (!globalChatMessagesEl) return;
        globalChatMessagesEl.innerHTML = '';
        
        if (!data) {
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

// Send Global Chat Message
export function sendGlobalChatMessage() {
    const input = document.getElementById('globalChatInput');
    const currentUser = getCurrentUser();
    if (!input) return;
    
    const msg = input.value.trim();
    if (!msg || !currentUser) return;

    console.log(`Sending global chat message from ${currentUser}: "${msg}"`);
    const globalChatRef = ref(db, 'globalChat');
    push(globalChatRef, {
        sender: currentUser,
        text: msg,
        timestamp: serverTimestamp()
    });
    input.value = '';
}

// Create New Server Room
export function createServer(onServerCreatedCallback) {
    const currentUser = getCurrentUser();
    console.log(`User ${currentUser} is creating a new server instance...`);
    const newSrvRef = push(ref(db, 'servers'));
    setCurrentServerId(newSrvRef.key);
    setMyTeam('blue');

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
        const roomCodeDisplay = document.getElementById('roomCodeDisplay');
        if (roomCodeDisplay) roomCodeDisplay.textContent = `Server ID: ${currentServerId}`;
        if (onServerCreatedCallback) onServerCreatedCallback();
    }).catch(err => {
        console.error("Error creating server:", err);
    });
}

// Join Existing Server Room
export function joinServer(srvId, onJoinedCallback) {
    const currentUser = getCurrentUser();
    setCurrentServerId(srvId);
    setMyTeam('red');

    console.log(`User ${currentUser} joining server ${srvId} as Red Team guest.`);

    update(ref(db, `servers/${srvId}`), {
        guest: currentUser,
        status: 'playing'
    }).then(() => {
        console.log("Successfully joined match. Starting game canvas interface.");
        if (onJoinedCallback) onJoinedCallback();
    }).catch(err => {
        console.error("Error joining server:", err);
    });
}

// Admin Clear All Matches & Data Utility
export function adminClearData(onClearedCallback) {
    if (confirm("ADMIN ACTION: Are you sure you want to clear all active servers, match data, and universal chat logs from Firebase?")) {
        console.log("Admin clearing all servers and user data nodes in Firebase...");
        
        const updates = {};
        updates['servers'] = null;
        updates['globalChat'] = null;

        update(ref(db), updates).then(() => {
            console.log("All servers and global chat wiped successfully.");
            setCurrentServerId(null);
            setMyTeam(null);
            alert("All matches and chat data have been cleared successfully.");
            if (onClearedCallback) onClearedCallback();
        }).catch(err => {
            console.error("Failed to clear Firebase data:", err);
            alert("Error clearing data: " + err.message);
        });
    }
}
