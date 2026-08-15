import { db } from './firebase-config.js';
import { ref, onValue, push, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getCurrentUser, setCurrentUser, verifyAndLogin, initPresenceSystem, cleanLogout } from './auth-presence.js';
import { getCurrentServerId, setCurrentServerId, getMyTeam, setMyTeam, initLobby, sendGlobalChatMessage, createServer, joinServer, adminClearData } from './lobby.js';
import { initGame, surrenderMatch } from './game.js';

// Setup Live System Console Interceptor Tracker Drawer
(() => {
    const logsEl = document.getElementById('console-logs');
    if (!logsEl) return;

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    function appendLog(type, args) {
        const line = document.createElement('div');
        line.style.whiteSpace = 'pre-wrap';
        if (type === 'warn') line.style.color = '#ffeb3b';
        if (type === 'error') line.style.color = '#ff5252';
        
        const timestamp = new Date().toLocaleTimeString();
        line.textContent = `[${timestamp}] ` + Array.from(args).map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : arg
        ).join(' ');
        
        logsEl.appendChild(line);
        logsEl.scrollTop = logsEl.scrollHeight;
    }

    console.log = function(...args) { originalLog.apply(console, args); appendLog('log', args); };
    console.warn = function(...args) { originalWarn.apply(console, args); appendLog('warn', args); };
    console.error = function(...args) { originalError.apply(console, args); appendLog('error', args); };

    const clearBtn = document.getElementById('clearConsole');
    if (clearBtn) {
        clearBtn.onclick = () => { logsEl.innerHTML = ''; };
    }
})();

// Screen Router Controller
export function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
    console.log(`Router: Switched view screen to -> #${screenId}`);
}

// Browser Reload / Close Guard during active matches
window.addEventListener('beforeunload', (e) => {
    const serverId = getCurrentServerId();
    if (serverId) {
        e.preventDefault();
        e.returnValue = "You have an active match running! Leaving or reloading will close or abandon the match session.";
        return e.returnValue;
    }
});

// Room-Specific Match Chat Handler
let matchChatUnsubscribe = null;
function initMatchChat() {
    const serverId = getCurrentServerId();
    const chatMessagesEl = document.getElementById('chatMessages');
    if (!serverId || !chatMessagesEl) return;

    const chatRef = ref(db, `servers/${serverId}/chat`);
    if (matchChatUnsubscribe) matchChatUnsubscribe();

    matchChatUnsubscribe = onValue(chatRef, (snapshot) => {
        const data = snapshot.val();
        chatMessagesEl.innerHTML = '';

        if (!data) {
            chatMessagesEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.75rem; text-align:center;">No match messages yet.</div>';
            return;
        }

        Object.values(data).forEach(msg => {
            const div = document.createElement('div');
            div.className = 'chat-msg';
            div.innerHTML = `<b>${msg.sender}:</b> ${msg.text}`;
            chatMessagesEl.appendChild(div);
        });
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    });
}

function sendMatchChatMessage() {
    const serverId = getCurrentServerId();
    const input = document.getElementById('chatInput');
    const currentUser = getCurrentUser();
    if (!serverId || !input) return;

    const text = input.value.trim();
    if (!text) return;

    console.log(`Sending match chat message: "${text}"`);
    const chatRef = ref(db, `servers/${serverId}/chat`);
    push(chatRef, {
        sender: currentUser,
        text: text,
        timestamp: serverTimestamp()
    });
    input.value = '';
}

// Main Application Bootstrapper on DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log("Modern Chess Online (Modularized) booting up...");

    const currentUser = getCurrentUser();
    const serverId = getCurrentServerId();

    // Setup Event Listeners for UI controls
    document.getElementById('loginBtn')?.addEventListener('click', handleLoginAction);
    document.getElementById('userInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLoginAction(); });
    document.getElementById('passInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLoginAction(); });
    
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        cleanLogout(getCurrentServerId(), () => {
            showScreen('login-screen');
        });
    });

    document.getElementById('createServerBtn')?.addEventListener('click', () => {
        createServer(() => {
            showScreen('wait-screen');
            initMatchChat();
        });
    });

    document.getElementById('cancelRoomBtn')?.addEventListener('click', () => {
        surrenderMatch(() => {
            showScreen('lobby-screen');
        });
    });

    document.getElementById('surrenderBtn')?.addEventListener('click', () => {
        if (confirm("Are you sure you want to surrender or leave the ongoing match?")) {
            surrenderMatch(() => {
                showScreen('lobby-screen');
            });
        }
    });

    document.getElementById('adminClearBtn')?.addEventListener('click', () => {
        adminClearData(() => {
            showScreen('lobby-screen');
        });
    });

    document.getElementById('globalChatSend')?.addEventListener('click', sendGlobalChatMessage);
    document.getElementById('globalChatInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendGlobalChatMessage(); });

    document.getElementById('chatSend')?.addEventListener('click', sendMatchChatMessage);
    document.getElementById('chatInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMatchChatMessage(); });

    // Match chat toggle expand/collapse accordion
    document.getElementById('chatToggle')?.addEventListener('click', () => {
        const body = document.querySelector('.chat-body');
        const inputArea = document.querySelector('.chat-input-area');
        if (body && inputArea) {
            const isHidden = body.style.display === 'none';
            body.style.display = isHidden ? 'flex' : 'none';
            inputArea.style.display = isHidden ? 'flex' : 'none';
        }
    });

    // Reconnection Screen Handlers
    document.getElementById('rejoinYesBtn')?.addEventListener('click', () => {
        console.log("User chose to rejoin existing session server:", serverId);
        showScreen('game-screen');
        initGame(() => { showScreen('lobby-screen'); });
        initMatchChat();
    });

    document.getElementById('rejoinNoBtn')?.addEventListener('click', () => {
        console.log("User chose to terminate existing session.");
        surrenderMatch(() => {
            showScreen('lobby-screen');
            initLobby(handleJoinServer);
        });
    });

    // Initial Routing Logic on Boot
    if (!currentUser) {
        showScreen('login-screen');
    } else {
        console.log(`Restoring session for logged-in user: ${currentUser}`);
        initPresenceSystem((errMessage) => {
            alert(errMessage);
            window.location.reload();
        });

        if (serverId) {
            // Check if server still exists in Firebase before showing reconnect prompt
            const srvRef = ref(db, `servers/${serverId}`);
            onValue(srvRef, (snapshot) => {
                const srvData = snapshot.val();
                if (srvData) {
                    showScreen('reconnect-screen');
                } else {
                    console.warn("Saved server ID no longer exists. Clearing state and heading to lobby.");
                    setCurrentServerId(null);
                    setMyTeam(null);
                    showScreen('lobby-screen');
                    initLobby(handleJoinServer);
                }
            }, { onlyOnce: true });
        } else {
            showScreen('lobby-screen');
            initLobby(handleJoinServer);
        }
    }
});

function handleLoginAction() {
    const userIn = document.getElementById('userInput')?.value.trim();
    const passIn = document.getElementById('passInput')?.value.trim();
    const errEl = document.getElementById('loginError');

    if (!userIn || !passIn) {
        if (errEl) errEl.textContent = "Please enter both username and password.";
        return;
    }

    verifyAndLogin(userIn, passIn, (success, errMessage) => {
        if (success) {
            if (errEl) errEl.textContent = "";
            showScreen('lobby-screen');
            initLobby(handleJoinServer);
        } else {
            if (errEl) errEl.textContent = errMessage;
        }
    });
}

function handleJoinServer() {
    showScreen('game-screen');
    initGame(() => {
        showScreen('lobby-screen');
    });
    initMatchChat();
}
