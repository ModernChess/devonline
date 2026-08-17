// network.js - Firebase Service & Presence Management
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getDatabase, ref, set, get, update, remove, onValue, push, onDisconnect 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
    // Make sure your real Firebase configuration credentials are here
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    databaseURL: "YOUR_DATABASE_URL",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- PRESENCE SYSTEM (Fixes ghost/lingering accounts) ---
export function setupUserPresence(username) {
    const userStatusRef = ref(db, `players/${username}`);
    const connectedRef = ref(db, '.info/connected');

    onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            // When connected, set user online
            const activeData = { online: true, lastSeen: Date.now() };
            set(userStatusRef, activeData);

            // Automatically set to offline or remove when socket disconnects (tab closed/crash)
            onDisconnect(userStatusRef).set({ online: false, lastSeen: Date.now() });
        }
    });
}

export function markUserOffline(username) {
    if (!username) return;
    const userStatusRef = ref(db, `players/${username}`);
    set(userStatusRef, { online: false, lastSeen: Date.now() });
}

export { db, ref, set, get, update, remove, onValue, push };
