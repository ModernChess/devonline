// ==========================================
// NETWORK & FIREBASE MODULE (network.js)
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getDatabase, ref, set, get, update, remove, onValue, push, runTransaction 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
    databaseURL: "https://mchess12333-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export function logMessage(msg) {
    const logsContainer = document.getElementById('console-logs');
    if (!logsContainer) return;
    const timeStr = new Date().toLocaleTimeString();
    logsContainer.innerHTML += `[${timeStr}] ${msg}<br>`;
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

export async function setPresence(username, statusData) {
    await set(ref(db, `presence/${username}`), statusData);
}

export function listenPresence(callback) {
    onValue(ref(db, 'presence'), (snapshot) => {
        callback(snapshot.val() || {});
    });
}

export async function checkExistingRooms(username) {
    const snapshot = await get(ref(db, 'rooms'));
    if (!snapshot.exists()) return null;
    
    const rooms = snapshot.val();
    for (const [roomId, roomData] of Object.entries(rooms)) {
        if ((roomData.host === username || roomData.guest === username) && roomData.status === 'playing') {
            return roomId;
        }
    }
    return null;
}

export async function removeRoom(roomId) {
    await remove(ref(db, `rooms/${roomId}`));
}

export async function removeAllRooms() {
    await remove(ref(db, 'rooms'));
}

export function listenRooms(callback) {
    onValue(ref(db, 'rooms'), (snapshot) => {
        callback(snapshot.val() || {});
    });
}

export async function createNewRoom(roomData) {
    const newRoomRef = push(ref(db, 'rooms'));
    await set(newRoomRef, roomData);
    return newRoomRef.key;
}

export function listenRoomChanges(roomId, callback) {
    onValue(ref(db, `rooms/${roomId}`), (snapshot) => {
        callback(snapshot.val());
    });
}

export async function joinServerRoom(roomId, username) {
    const roomRef = ref(db, `rooms/${roomId}`);
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) return null;

    const room = snapshot.val();
    if (room.host === username) {
        return 'white';
    }

    await update(roomRef, { guest: username, status: 'playing' });
    return 'black';
}

export function sendGlobalMessage(sender, text) {
    push(ref(db, 'globalChat'), { sender, text, timestamp: Date.now() });
}

export function listenGlobalChat(callback) {
    onValue(ref(db, 'globalChat'), (snapshot) => {
        callback(snapshot.val() || {});
    });
}

export function sendMatchMessage(roomId, sender, text) {
    push(ref(db, `rooms/${roomId}/chat`), { sender, text, timestamp: Date.now() });
}

export function listenMatchChat(roomId, callback) {
    onValue(ref(db, `rooms/${roomId}/chat`), (snapshot) => {
        callback(snapshot.val() || {});
    });
}

export async function executeMoveTransaction(roomId, userTeam, fromR, fromC, toR, toC) {
    const roomRef = ref(db, `rooms/${roomId}`);
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
