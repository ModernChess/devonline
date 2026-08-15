// =========================================================================
// TEAM CORE, ECONOMY, BASES, & WIN CONDITIONS CONTROLLER
// =========================================================================

let currentTurn = 'blue';
let blueCoins = 0;
let redCoins = 0;
let destroyedUnitsQueue = [];
let flagAnimations = {};
let gameOver = false;
let winnerMessage = '';

// ALL gold cores (1 to 6) start NEUTRAL (owner: null), while gc7 and gc8 act as team base win-conditions.
let goldCores = [
    { id: 'gc1', c: 6, r: 4, owner: null, isBase: false, captureZones: [{c:6, r:3}, {c:6, r:5}, {c:5, r:4}, {c:7, r:4}, {c:5, r:3}, {c:5, r:5}, {c:7, r:3}, {c:7, r:5}] },
    { id: 'gc2', c: 1, r: 5, owner: null, isBase: false, captureZones: [{c:1, r:4}, {c:1, r:6}, {c:0, r:5}, {c:2, r:5}, {c:0, r:4}, {c:0, r:6}, {c:2, r:4}, {c:2, r:6}] }, 
    { id: 'gc3', c: 12, r: 7, owner: null, isBase: false, captureZones: [{c:12, r:6}, {c:12, r:8}, {c:11, r:7}, {c:13, r:7}, {c:11, r:6}, {c:11, r:8}, {c:13, r:6}, {c:13, r:8}] },
    { id: 'gc4', c: 5, r: 14, owner: null, isBase: false, captureZones: [{c:5, r:13}, {c:5, r:15}, {c:4, r:14}, {c:6, r:14}, {c:4, r:13}, {c:4, r:15}, {c:6, r:13}, {c:6, r:15}] },
    { id: 'gc5', c: 16, r: 12, owner: null, isBase: false, captureZones: [{c:16, r:11}, {c:16, r:13}, {c:15, r:12}, {c:17, r:12}, {c:15, r:11}, {c:15, r:13}, {c:17, r:11}, {c:17, r:13}] },
    { id: 'gc6', c: 11, r: 16, owner: null, isBase: false, captureZones: [{c:11, r:15}, {c:11, r:17}, {c:10, r:16}, {c:12, r:16}, {c:10, r:15}, {c:10, r:17}, {c:12, r:15}, {c:12, r:17}] },
    // gc7: Red Base Special Gold Core (placed at Red original base coordinate c:11, r:0 / L1)
    { id: 'gc7', c: 11, r: 0, owner: 'red', isBase: true, teamBase: 'red', captureZones: [{c:11, r:1}, {c:10, r:0}, {c:12, r:0}, {c:10, r:1}, {c:12, r:1}] },
    // gc8: Blue Base Special Gold Core (placed at Blue original base coordinate c:0, r:11 / A12)
    { id: 'gc8', c: 0, r: 11, owner: 'blue', isBase: true, teamBase: 'blue', captureZones: [{c:0, r:10}, {c:0, r:12}, {c:1, r:11}, {c:1, r:10}, {c:1, r:12}] }
];

const TeamLog = {
    info: (msg, data = null) => console.log(`[INFO][team_core]: ${msg}`, data ?? ''),
    warn: (msg, data = null) => console.warn(`[WARN][team_core]: ${msg}`, data ?? ''),
    success: (msg, data = null) => console.log(`[SUCCESS][team_core]: ${msg}`, data ?? '')
};

function getTeamFromUnit(unit) {
    if (!unit) return null;
    if (unit.team) return unit.team.toLowerCase();
    if (unit._assignedTeam) return unit._assignedTeam;
    
    let nameStr = (unit.name || '').toLowerCase();
    if (nameStr.includes('red') || nameStr.includes('black')) return 'red';
    if (nameStr.includes('blue') || nameStr.includes('white')) return 'blue';
    
    if (unit.img && unit.img.src) {
        let src = unit.img.src.toLowerCase();
        if (src.includes('red')) return 'red';
        if (src.includes('blue')) return 'blue';
    }

    let team = unit.gridY < 9 ? 'red' : 'blue';
    unit._assignedTeam = team;
    return team;
}

function getUnitPower(unit) {
    if (!unit) return 0;
    let name = (unit.name || '').toLowerCase();
    if (name.includes('ship')) return Infinity;
    if (name.includes('artillery') || name.includes('boat')) return 0;
    if (name.includes('tank')) return 2;
    if (name.includes('infantry') || name.includes('soldier')) return 1;
    return 1;
}

function isSpecialUnit(unit) {
    if (!unit) return false;
    let name = (unit.name || '').toLowerCase();
    return name.includes('artillery') || name.includes('boat') || getUnitPower(unit) === 0;
}

function areUnitsAdjacent(u1, u2) {
    let dx = Math.abs(u1.gridX - u2.gridX);
    let dy = Math.abs(u1.gridY - u2.gridY);
    return dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0);
}

function checkWinConditions(allUnits) {
    if (gameOver) return;

    let redLandUnits = allUnits.filter(u => getTeamFromUnit(u) === 'red' && !isSpecialUnit(u) && getUnitPower(u) !== Infinity);
    let blueLandUnits = allUnits.filter(u => getTeamFromUnit(u) === 'blue' && !isSpecialUnit(u) && getUnitPower(u) !== Infinity);
    let redTotal = allUnits.filter(u => getTeamFromUnit(u) === 'red');
    let blueTotal = allUnits.filter(u => getTeamFromUnit(u) === 'blue');

    if (redLandUnits.length === 0 || redTotal.length === 0) {
        gameOver = true;
        winnerMessage = 'BLUE TEAM WINS BY ANNIHILATION!';
        TeamLog.success(winnerMessage);
        return;
    }
    if (blueLandUnits.length === 0 || blueTotal.length === 0) {
        gameOver = true;
        winnerMessage = 'RED TEAM WINS BY ANNIHILATION!';
        TeamLog.success(winnerMessage);
        return;
    }

    goldCores.forEach(core => {
        if (core.isBase && core.owner && core.teamBase) {
            if (core.owner !== core.teamBase) {
                gameOver = true;
                winnerMessage = `${core.owner.toUpperCase()} TEAM WINS BY CAPTURING ENEMY BASE!`;
                TeamLog.success(winnerMessage);
            }
        }
    });
}

function commitUnitDestruction(unitsArray, unitsToDestroy) {
    unitsToDestroy.forEach(u => {
        let index = unitsArray.indexOf(u);
        if (index !== -1) {
            unitsArray.splice(index, 1);
        }
        if (!destroyedUnitsQueue.some(item => item.unit === u)) {
            destroyedUnitsQueue.push({
                unit: u,
                startTime: performance.now(),
                duration: 1800
            });
        }
    });
}

// Shop integration functions for purchasing units using gold coins
function toggleShop() {
    let modal = document.getElementById('shop-modal');
    if (!modal) return;
    modal.style.display = modal.style.display === 'block' ? 'none' : 'block';
}

function buyUnit(unitType) {
    if (gameOver) return;

    let activeTeam = currentTurn;
    let cost = 0;
    let unitName = '';
    let unitRange = 2;
    let unitCategory = 'land';
    let imgRef, loadRef;

    if (activeTeam === 'blue') {
        if (unitType === 'infantry') { cost = 1; unitName = 'Infantry'; unitRange = 2; imgRef = blueInfantryImg; loadRef = () => blueInfantryLoaded; }
        else if (unitType === 'tank') { cost = 1; unitName = 'Tank'; unitRange = 3; imgRef = blueTankImg; loadRef = () => blueTankLoaded; }
        else if (unitType === 'artillery') { cost = 2; unitName = 'Artillery'; unitRange = 2; imgRef = blueArtilleryImg; loadRef = () => blueArtilleryLoaded; }
        else if (unitType === 'ship') { cost = 2; unitName = 'Ship'; unitRange = 2; unitCategory = 'water'; imgRef = blueShipImg; loadRef = () => blueShipLoaded; }
    } else {
        if (unitType === 'infantry') { cost = 1; unitName = 'Infantry'; unitRange = 2; imgRef = redInfantryImg; loadRef = () => redInfantryLoaded; }
        else if (unitType === 'tank') { cost = 1; unitName = 'Tank'; unitRange = 3; imgRef = redTankImg; loadRef = () => redTankLoaded; }
        else if (unitType === 'artillery') { cost = 2; unitName = 'Artillery'; unitRange = 2; imgRef = redArtilleryImg; loadRef = () => redArtilleryLoaded; }
        else if (unitType === 'ship') { cost = 2; unitName = 'Ship'; unitRange = 2; unitCategory = 'water'; imgRef = redShipImg; loadRef = () => redShipLoaded; }
    }

    let currentCoins = activeTeam === 'blue' ? blueCoins : redCoins;
    if (currentCoins < cost) {
        TeamLog.warn(`Not enough gold to buy ${unitType}! Required: ${cost}, Available: ${currentCoins}`);
        alert(`Not enough gold! You need ${cost} gold coins.`);
        return;
    }

    if (activeTeam === 'blue') blueCoins -= cost;
    else redCoins -= cost;

    let spawnPos = null;
    if (unitCategory === 'water') {
        spawnPos = getPortSquare(activeTeam);
    } else {
        let baseSquares = getBaseSquares(activeTeam);
        let availableBase = baseSquares.filter(b => !units.some(u => u.gridX === b.c && u.gridY === b.r));
        if (availableBase.length > 0) {
            spawnPos = availableBase[0];
        } else {
            spawnPos = baseSquares[0] || {c: 0, r: 0};
        }
    }

    if (unitType === 'infantry') {
        for (let i = 0; i < 2; i++) {
            let pos = i === 0 ? spawnPos : (getBaseSquares(activeTeam).find(b => !units.some(u => u.gridX === b.c && u.gridY === b.r)) || spawnPos);
            units.push({
                name: unitName,
                type: unitCategory,
                range: unitRange,
                gridX: pos.c,
                gridY: pos.r,
                x: pos.c * cellSize,
                y: pos.r * cellSize,
                img: imgRef,
                loaded: loadRef,
                team: activeTeam
            });
        }
        TeamLog.success(`${activeTeam.toUpperCase()} successfully recruited 2x Infantry via shop!`);
    } else {
        units.push({
            name: unitName,
            type: unitCategory,
            range: unitRange,
            gridX: spawnPos.c,
            gridY: spawnPos.r,
            x: spawnPos.c * cellSize,
            y: spawnPos.r * cellSize,
            img: imgRef,
            loaded: loadRef,
            team: activeTeam
        });
        TeamLog.success(`${activeTeam.toUpperCase()} successfully recruited 1x ${unitName} via shop!`);
    }

    toggleShop();
}

function drawTeamUIAndFlags() {
    let now = performance.now();

    ctx.fillStyle = 'rgba(26, 26, 26, 0.85)';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.fillRect(12, 12, 160, 60);
    ctx.strokeRect(12, 12, 160, 60);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Turn: ${currentTurn.toUpperCase()}`, 24, 20);
    ctx.fillStyle = '#3498db';
    ctx.fillText(`Blue Coins: ${blueCoins}`, 24, 38);
    ctx.fillStyle = '#e74c3c';
    ctx.fillText(`Red Coins: ${redCoins}`, 24, 54);

    if (gameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(winnerMessage, canvas.width / 2, canvas.height / 2);
        return;
    }

    goldCores.forEach(core => {
        let cx = core.c * cellSize + cellSize / 2;
        let cy = core.r * cellSize + cellSize / 2;

        if (core.owner) {
            ctx.fillStyle = core.owner === 'blue' ? '#3498db' : '#e74c3c';
            ctx.beginPath();
            ctx.arc(cx, cy, cellSize * 0.25, 0, Math.PI * 2);
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
        }

        if (flagAnimations[core.id]) {
            let elapsed = now - flagAnimations[core.id];
            let duration = 500;
            if (elapsed < duration) {
                let progress = elapsed / duration;
                let dropOffset = (1 - Math.cos(progress * Math.PI * 0.5)) * (cellSize * 1.5);
                let renderY = cy - (cellSize * 1.5) + dropOffset;

                ctx.fillStyle = core.owner === 'blue' ? '#2980b9' : '#c0392b';
                ctx.fillRect(cx - 4, renderY, 8, cellSize * 0.8);
                ctx.fillStyle = '#f1c40f';
                ctx.beginPath();
                ctx.moveTo(cx + 4, renderY);
                ctx.lineTo(cx + 16, renderY + 6);
                ctx.lineTo(cx + 4, renderY + 12);
                ctx.fill();
            } else {
                delete flagAnimations[core.id];
            }
        }
    });

    let mapCenterX = canvas.width / 2;
    let mapCenterY = canvas.height / 2;

    ['blue', 'red'].forEach(teamName => {
        let suList = getSuperunitsForTeam(teamName, units);
        suList.forEach(su => {
            if (su.units.length <= 1 && su.power !== Infinity && !su.isSpecialSuperunit) return;

            let avgX = su.units.reduce((sum, u) => sum + (u.renderX !== undefined ? u.renderX : u.gridX * cellSize), 0) / su.units.length;
            let avgY = su.units.reduce((sum, u) => sum + (u.renderY !== undefined ? u.renderY : u.gridY * cellSize), 0) / su.units.length;

            if (su.isSpecialSuperunit && su.core) {
                avgX = (avgX + su.core.c * cellSize) / 2;
                avgY = (avgY + su.core.r * cellSize) / 2;
            }

            let unitCenterX = avgX + cellSize / 2;
            let unitCenterY = avgY + cellSize / 2;

            let dirX = mapCenterX - unitCenterX;
            let dirY = mapCenterY - unitCenterY;
            let length = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
            
            let significantDistance = cellSize * 1.8;
            let offsetX = (dirX / length) * significantDistance;
            let offsetY = (dirY / length) * significantDistance;

            let badgeX = unitCenterX + offsetX - 22;
            let badgeY = unitCenterY + offsetY - 12;

            ctx.fillStyle = '#cc0000';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5;
            let powerDisplay = su.power === Infinity ? '∞' : su.power;
            
            ctx.beginPath();
            ctx.fillRect(badgeX, badgeY, 44, 24);
            ctx.strokeRect(badgeX, badgeY, 44, 24);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            let lockedText = su.units.some(u => isUnitLockedInStalemate(u, units)) ? ' 🔒' : '';
            ctx.fillText(`${powerDisplay}${lockedText}`, badgeX + 22, badgeY + 12);
        });
    });

    destroyedUnitsQueue = destroyedUnitsQueue.filter(item => {
        let elapsed = now - item.startTime;
        let progress = elapsed / item.duration;
        if (progress >= 1.0) return false;

        let u = item.unit;
        let rx = u.gridX * cellSize;
        let ry = u.gridY * cellSize;

        ctx.fillStyle = `rgba(255, 50, 50, ${1 - progress})`;
        ctx.fillRect(rx + 2, ry + 2, cellSize - 4, cellSize - 4);
        return true;
    });
}
