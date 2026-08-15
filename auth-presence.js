import { db } from './firebase-config.js';
import { ref, set, onValue, remove, get, onDisconnect, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Unique session token generated per browser instance to prevent simultaneous multi-device logins
let sessionToken = localStorage.getItem('devOnlineSessionToken');
if (!sessionToken) {
    sessionToken = 'sess_' + Math.random().toString(36.2) + Date.now().toString(36);
    localStorage.setItem('devOnlineSessionToken', sessionToken);
}

// 10 Preset Accounts
const validUsers = {};
for (let i = 1; i <= 10; i++) {
    validUsers[`player${i}`] = "123";
}

let currentUser = localStorage.getItem('devOnlineUser') || null;
let presenceRef = null;
let sessionUnsubscribe = null;

export function getCurrentUser() {
    return currentUser;
}

export function setCurrentUser(user) {
    currentUser = user;
    if (user) {
        localStorage.setItem('devOnlineUser', user);
    } else {
        localStorage.removeItem('devOnlineUser');
    }
}

export function getValidUsers() {
    return validUsers;
}

// Initialize active player presence system & multi-device token conflict detection
export function initPresenceSystem(onConcurrentLoginDetected) {
    if (!currentUser) return;
    presenceRef = ref(db, `presence/${currentUser}`);
    
    // Write active session token to Firebase presence node
    set(presenceRef, {
        online: true,
        sessionToken: sessionToken,
        lastSeen: serverTimestamp()
    });
    onDisconnect(presenceRef).remove();

    // Heartbeat update interval
    const heartbeatInterval = setInterval(() => {
        if (currentUser) {
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
            if (onConcurrentLoginDetected) {
                onConcurrentLoginDetected("Your account was logged in from another device. You have been signed out.");
            }
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

        if (countTextEl) countTextEl.textContent = `Active Players (${count})`;
        if (listEl) {
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
        }

        if (dotEl) {
            if (count > 1) {
                dotEl.classList.add('active-multiple');
            } else {
                dotEl.classList.remove('active-multiple');
            }
        }
    });
}

// Clean logout helper
export function cleanLogout(currentServerId, onComplete) {
    console.log(`User ${currentUser} logging out / exiting.`);
    if (presenceRef) {
        remove(presenceRef);
    }
    setCurrentUser(null);
    if (onComplete) onComplete();
}

// Check if user is already online elsewhere before letting them log in
export function verifyAndLogin(username, password, callback) {
    if (validUsers[username] && validUsers[username] === password) {
        const targetPresenceRef = ref(db, `presence/${username}`);
        get(targetPresenceRef).then(snapshot => {
            const existingPresence = snapshot.val();
            if (existingPresence && existingPresence.online) {
                console.warn(`Login rejected: User ${username} is already active on another device.`);
                callback(false, "Error: Account is already logged in on another device!");
                return;
            }

            setCurrentUser(username);
            console.log(`Login successful. Welcome user: ${username}`);
            initPresenceSystem((msg) => {
                window.location.reload();
            });
            callback(true, "");
        }).catch(err => {
            console.error("Presence check error during login:", err);
            callback(false, "Login verification failed. Try again.");
        });
    } else {
        console.warn(`Login failed for username: "${username}"`);
        callback(false, "Invalid account credentials!");
    }
}
