import { db } from './firebase-config.js';
import { ref, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getCurrentServerId, getMyTeam, setCurrentServerId, setMyTeam } from './lobby.js';
import { getCurrentUser } from './auth-presence.js';

let gameStateUnsubscribe = null;
let selectedUnit = null;
let currentUnits = [];
let currentTurn = 'blue';
let matchStatus = 'connecting';

// Start or listen to active match state canvas game
export function initGame(onGameOverCallback) {
    const serverId = getCurrentServerId();
    const myTeam = getMyTeam();
    const currentUser = getCurrentUser();
    
    if (!serverId) return;

    const teamBadge = document.getElementById('playerTeamBadge');
    if (teamBadge) {
        teamBadge.textContent = `Team: ${myTeam ? myTeam.toUpperCase() : 'SPECTATOR'} (${currentUser})`;
        teamBadge.style.color = myTeam === 'blue' ? 'var(--secondary)' : 'var(--danger)';
    }

    console.log(`Initializing game engine for server ${serverId} as team: ${myTeam}`);

    const serverRef = ref(db, `servers/${serverId}`);
    
    // Listen to real-time changes on the match server node
    if (gameStateUnsubscribe) gameStateUnsubscribe();
    gameStateUnsubscribe = onValue(serverRef, (snapshot) => {
        const data = snapshot.val();
        const banner = document.getElementById('statusBanner');

        if (!data) {
            console.warn("Server was deleted or closed mid-match.");
            if (banner) banner.textContent = "Game Over: The match server was closed or deleted.";
            alert("Match closed by host or terminated.");
            setTimeout(() => {
                leaveMatchCleanup();
                if (onGameOverCallback) onGameOverCallback();
            }, 1500);
            return;
        }

        // Check if opponent left or went offline abruptly
        const host = data.host;
        const guest = data.guest;
        const opponent = myTeam === 'blue' ? guest : host;

        if (data.status === 'playing' && !opponent) {
            if (banner) banner.textContent = "PAUSED: Opponent has left or disconnected!";
            console.warn("Opponent disconnected during match. Game paused.");
            return;
        }

        matchStatus = data.status;
        currentTurn = data.turn;
        currentUnits = data.units || [];

        if (banner) {
            if (matchStatus === 'waiting') {
                banner.textContent = "Waiting for opponent to join...";
            } else {
                if (currentTurn === myTeam) {
                    banner.textContent = "Your Turn! Make a tactical move.";
                    banner.style.color = "#4CAF50";
                } else {
                    banner.textContent = `Opponent's Turn (${currentTurn.toUpperCase()})...`;
                    banner.style.color = "#ffeb3b";
                }
            }
        }

        renderCanvas();
    });

    setupCanvasClickHandler();
}

// Render Board & Units on HTML5 Canvas with perspective mapping
function renderCanvas() {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cols = 8;
    const rows = 8;
    const cellSize = canvas.width / cols;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const myTeam = getMyTeam();

    // Draw board grid squares
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            // If player is Red team, flip board perspective vertically
            const displayR = (myTeam === 'red') ? (rows - 1 - r) : r;
            const displayC = (myTeam === 'red') ? (cols - 1 - c) : c;

            ctx.fillStyle = (r + c) % 2 === 0 ? '#262626' : '#1a1a1a';
            ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);

            // Highlight selected unit
            if (selectedUnit && selectedUnit.x === displayC && selectedUnit.y === displayR) {
                ctx.strokeStyle = '#00ff66';
                ctx.lineWidth = 3;
                ctx.strokeRect(c * cellSize + 2, r * cellSize + 2, cellSize - 4, cellSize - 4);
            }
        }
    }

    // Draw Units
    currentUnits.forEach(unit => {
        let renderR = unit.y;
        let renderC = unit.x;

        // Apply Red team coordinate perspective transformation mapping
        if (myTeam === 'red') {
            renderR = rows - 1 - unit.y;
            renderC = cols - 1 - unit.x;
        }

        const cx = renderC * cellSize + cellSize / 2;
        const cy = renderR * cellSize + cellSize / 2;

        ctx.beginPath();
        ctx.arc(cx, cy, cellSize * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = unit.team === 'blue' ? '#2196F3' : '#ff5252';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff';
        ctx.stroke();

        // Draw unit symbol letter inside token
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(unit.type === 'tank' ? 'T' : 'I', cx, cy);
    });
}

// Canvas Click Interaction Controller
function setupCanvasClickHandler() {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;

    // Remove existing listener to prevent stacking duplicate bindings
    const newCanvas = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(newCanvas, canvas);

    newCanvas.addEventListener('click', (e) => {
        const myTeam = getMyTeam();
        if (currentTurn !== myTeam) {
            console.warn("Not your turn!");
            return;
        }

        const rect = newCanvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        const cols = 8;
        const rows = 8;
        const cellSize = newCanvas.width / cols;

        const clickedCol = Math.floor(clickX / cellSize);
        const clickedRow = Math.floor(clickY / cellSize);

        // Map back clicked canvas coordinates based on player team perspective
        let boardX = clickedCol;
        let boardY = clickedRow;

        if (myTeam === 'red') {
            boardX = cols - 1 - clickedCol;
            boardY = rows - 1 - clickedRow;
        }

        console.log(`Canvas clicked at grid coordinate: [${boardX}, ${boardY}]`);

        const clickedUnit = currentUnits.find(u => u.x === boardX && u.y === boardY);

        if (selectedUnit) {
            if (clickedUnit && clickedUnit.team === myTeam) {
                // Switch selected unit to another friendly unit
                selectedUnit = clickedUnit;
                console.log(`Switched selection to friendly unit: ${selectedUnit.id}`);
            } else {
                // Execute move or attack action to target cell
                executeMoveOrAttack(selectedUnit, boardX, boardY);
                selectedUnit = null;
            }
        } else {
            if (clickedUnit && clickedUnit.team === myTeam) {
                selectedUnit = clickedUnit;
                console.log(`Selected unit: ${selectedUnit.id} at [${boardX}, ${boardY}]`);
            }
        }
        renderCanvas();
    });
}

// Execute unit movement, cluster power rule verification, and turn switch
function executeMoveOrAttack(unit, targetX, targetY) {
    const serverId = getCurrentServerId();
    if (!serverId) return;

    // Basic range validation (Manhattan distance <= 2 for simplicity or adjacent check)
    const distX = Math.abs(unit.x - targetX);
    const distY = Math.abs(unit.y - targetY);

    if (distX > 2 || distY > 2) {
        console.warn("Move rejected: Out of range.");
        alert("Target is out of movement range!");
        return;
    }

    console.log(`Executing move for unit ${unit.id} to [${targetX}, ${targetY}]`);

    let updatedUnits = currentUnits.map(u => {
        if (u.id === unit.id) {
            return { ...u, x: targetX, y: targetY };
        }
        return u;
    });

    // Check combat / cluster power capture rules (if target square contains enemy unit)
    const targetOccupant = currentUnits.find(u => u.x === targetX && u.y === targetY);
    if (targetOccupant && targetOccupant.team !== unit.team) {
        console.log(`Combat initiated! Unit ${unit.id} attacks enemy unit ${targetOccupant.id}`);
        // Remove enemy unit captured in combat clash
        updatedUnits = updatedUnits.filter(u => u.id !== targetOccupant.id);
    }

    const nextTurn = currentTurn === 'blue' ? 'red' : 'blue';

    update(ref(db, `servers/${serverId}`), {
        units: updatedUnits,
        turn: nextTurn
    }).then(() => {
        console.log(`Move completed successfully. Turn passed to: ${nextTurn}`);
    }).catch(err => {
        console.error("Failed to sync move to Firebase:", err);
    });
}

// Surrender or Leave Match Cleanly
export function surrenderMatch(onCompleteCallback) {
    const serverId = getCurrentServerId();
    const myTeam = getMyTeam();
    const currentUser = getCurrentUser();

    if (!serverId) {
        leaveMatchCleanup();
        if (onCompleteCallback) onCompleteCallback();
        return;
    }

    console.log(`User ${currentUser} (${myTeam}) is surrendering/leaving match server ${serverId}`);

    const serverRef = ref(db, `servers/${serverId}`);
    remove(serverRef).then(() => {
        console.log("Match server destroyed due to surrender/leave.");
        leaveMatchCleanup();
        if (onCompleteCallback) onCompleteCallback();
    }).catch(err => {
        console.error("Error deleting match server on surrender:", err);
        leaveMatchCleanup();
        if (onCompleteCallback) onCompleteCallback();
    });
}

function leaveMatchCleanup() {
    setCurrentServerId(null);
    setMyTeam(null);
    if (gameStateUnsubscribe) {
        gameStateUnsubscribe();
        gameStateUnsubscribe = null;
    }
    selectedUnit = null;
}
