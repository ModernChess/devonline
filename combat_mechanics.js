// =========================================================================
// COMBAT MECHANICS, SUPERUNITS, & ARTILLERY DUEL CONTROLLER
// =========================================================================

// ARTILLERY CARD DUEL SYSTEM EXTENSION STATE
let artilleryDuelState = {
    active: false,
    attackerTeam: null,
    defenderTeam: null,
    artilleryUnit: null,
    targetUnit: null,
    attackerCard: null // 'green' or 'red'
};

function getSuperunitsForTeam(teamName, allUnits) {
    let teamUnits = allUnits.filter(u => getTeamFromUnit(u) === teamName);
    let combatUnits = teamUnits.filter(u => !isSpecialUnit(u) && getUnitPower(u) !== Infinity);
    let specialUnits = teamUnits.filter(u => isSpecialUnit(u) || getUnitPower(u) === Infinity);
    let superunits = [];
    let visited = new Set();

    combatUnits.forEach(unit => {
        if (visited.has(unit)) return;
        let cluster = [];
        let queue = [unit];
        visited.add(unit);

        while (queue.length > 0) {
            let curr = queue.shift();
            cluster.push(curr);

            combatUnits.forEach(other => {
                if (!visited.has(other)) {
                    let touching = areUnitsAdjacent(curr, other);
                    let sharingEnemyBridge = false;
                    if (!touching) {
                        sharingEnemyBridge = allUnits.some(enemy => 
                            getTeamFromUnit(enemy) !== teamName && areUnitsAdjacent(curr, enemy) && areUnitsAdjacent(other, enemy)
                        );
                    }
                    if (touching || sharingEnemyBridge) {
                        visited.add(other);
                        queue.push(other);
                    }
                }
            });
        }

        let totalPower = cluster.reduce((sum, u) => sum + getUnitPower(u), 0);
        
        goldCores.forEach(core => {
            if (core.owner === teamName) {
                let supportingUnitInZone = cluster.some(u => core.captureZones.some(z => z.c === u.gridX && z.r === u.gridY) || (u.gridX === core.c && u.gridY === core.r));
                if (supportingUnitInZone) {
                    superunits.push({
                        units: cluster,
                        power: totalPower,
                        isSpecial: false,
                        isSpecialSuperunit: true,
                        core: core,
                        team: teamName
                    });
                    return;
                }
            }
        });

        superunits.push({
            units: cluster,
            power: totalPower,
            isSpecial: false,
            isSpecialSuperunit: false,
            team: teamName
        });
    });

    specialUnits.forEach(sp => {
        superunits.push({
            units: [sp],
            power: getUnitPower(sp),
            isSpecial: true,
            isSpecialSuperunit: false,
            team: teamName
        });
    });

    return superunits;
}

function isUnitLockedInStalemate(unit, allUnits) {
    if (isSpecialUnit(unit) || getUnitPower(unit) === Infinity) return false;
    let team = getTeamFromUnit(unit);
    let enemyTeam = team === 'blue' ? 'red' : 'blue';
    let mySuList = getSuperunitsForTeam(team, allUnits);
    let enemySuList = getSuperunitsForTeam(enemyTeam, allUnits);

    let mySu = mySuList.find(su => su.units.includes(unit));
    if (!mySu) return false;

    for (let oSu of enemySuList) {
        let inContact = mySu.units.some(u1 => oSu.units.some(u2 => areUnitsAdjacent(u1, u2)));
        if (inContact && mySu.power === oSu.power) {
            return true;
        }
    }
    return false;
}

function resolveUnitInteractions(allUnits) {
    let blueSuList = getSuperunitsForTeam('blue', allUnits);
    let redSuList = getSuperunitsForTeam('red', allUnits);
    let unitsToDestroy = new Set();

    blueSuList.forEach(bSu => {
        redSuList.forEach(rSu => {
            let touching = bSu.units.some(bu => rSu.units.some(ru => areUnitsAdjacent(bu, ru) || (bu.gridX === ru.gridX && bu.gridY === ru.gridY)));
            if (touching) {
                if (bSu.power === Infinity && rSu.power === Infinity) {
                    bSu.units.forEach(u => unitsToDestroy.add(u));
                    rSu.units.forEach(u => unitsToDestroy.add(u));
                } else if (bSu.power > rSu.power) {
                    rSu.units.forEach(u => unitsToDestroy.add(u));
                } else if (rSu.power > bSu.power) {
                    bSu.units.forEach(u => unitsToDestroy.add(u));
                }
            }
        });
    });

    allUnits.forEach(ship => {
        let shipName = (ship.name || '').toLowerCase();
        if (shipName.includes('ship')) {
            let combatRanges = getUnitCombatRange(ship);
            allUnits.coreRangeHitCheck = true;
            allUnits.forEach(targetUnit => {
                if (getTeamFromUnit(targetUnit) !== getTeamFromUnit(ship)) {
                    let targetName = (targetUnit.name || '').toLowerCase();
                    if (targetName.includes('ship')) return;

                    let inRange = combatRanges.some(rangeBox => 
                        targetUnit.gridX >= rangeBox.startC && targetUnit.gridX <= rangeBox.endC &&
                        targetUnit.gridY >= rangeBox.startR && targetUnit.gridY <= rangeBox.endR
                    );
                    if (inRange) {
                        unitsToDestroy.add(targetUnit);
                    }
                }
            });
        }
    });

    if (unitsToDestroy.size > 0) {
        commitUnitDestruction(allUnits, unitsToDestroy);
    }

    checkWinConditions(allUnits);
}

// ARTILLERY CARD DUEL TRIGGER AND RESOLUTION FUNCTIONS
function triggerArtilleryDuel(artilleryUnit, targetUnit) {
    if (gameOver) return;
    
    artilleryDuelState = {
        active: true,
        attackerTeam: getTeamFromUnit(artilleryUnit),
        defenderTeam: getTeamFromUnit(targetUnit),
        artilleryUnit: artilleryUnit,
        targetUnit: targetUnit,
        attackerCard: null
    };

    console.log(`[INFO][combat_mechanics]: Artillery duel initiated by ${artilleryDuelState.attackerTeam.toUpperCase()} against ${artilleryDuelState.defenderTeam.toUpperCase()}! Attacker choosing card.`);
    showArtilleryCardModal('attacker');
}

function attackerChooseCard(cardColor) {
    if (!artilleryDuelState.active) return;
    
    artilleryDuelState.attackerCard = cardColor;
    console.log(`[INFO][combat_mechanics]: Attacker locked in their card choice. Handing over to defender for guessing.`);
    showArtilleryCardModal('defender');
}

function resolveArtilleryDuel(defenderGuess) {
    if (!artilleryDuelState.active) return;

    let { defenderTeam, targetUnit, attackerCard } = artilleryDuelState;
    let unitsToDestroy = new Set();

    console.log(`[INFO][combat_mechanics]: Defender guessed: ${defenderGuess}. Attacker's card was: ${attackerCard}.`);

    if (defenderGuess === attackerCard) {
        console.log(`[SUCCESS][combat_mechanics]: ${defenderTeam.toUpperCase()} successfully guessed the card! Artillery attack failed, target unit saved.`);
        alert(`Defense Success! ${defenderTeam.toUpperCase()} guessed correctly. Artillery strike neutralized!`);
    } else {
        console.warn(`[WARN][combat_mechanics]: ${defenderTeam.toUpperCase()} guessed incorrectly! Artillery strike successful.`);
        unitsToDestroy.add(targetUnit);
        commitUnitDestruction(units, unitsToDestroy);
        alert(`Attack Success! ${defenderTeam.toUpperCase()} guessed wrong. Target destroyed!`);
    }

    artilleryDuelState.active = false;
    currentTurn = currentTurn === 'blue' ? 'red' : 'blue';
    hideArtilleryCardModal();
    checkWinConditions(units);
}

function showArtilleryCardModal(phase) {
    let modal = document.getElementById('artillery-card-modal');
    let title = document.getElementById('duel-modal-title');
    let desc = document.getElementById('duel-modal-desc');
    let btnContainer = document.getElementById('duel-button-container');

    if (!modal) {
        console.log(`[INFO][combat_mechanics]: [UI Modal Phase: ${phase}] Modal element 'artillery-card-modal' not found in DOM.`);
        return;
    }

    modal.style.display = 'block';

    if (phase === 'attacker') {
        if (title) title.innerText = `${artilleryDuelState.attackerTeam.toUpperCase()} ARTILLERY ATTACK`;
        if (desc) desc.innerText = `${artilleryDuelState.attackerTeam.toUpperCase()} player: Choose a secret card color (Green or Red).`;
        if (btnContainer) {
            btnContainer.innerHTML = `
                <button class="duel-card-btn green" onclick="attackerChooseCard('green')">Green Card</button>
                <button class="duel-card-btn red" onclick="attackerChooseCard('red')">Red Card</button>
            `;
        }
    } else if (phase === 'defender') {
        if (title) title.innerText = `${artilleryDuelState.defenderTeam.toUpperCase()} DEFENSE RESPONSE`;
        if (desc) desc.innerText = `${artilleryDuelState.defenderTeam.toUpperCase()} player: Guess the attacker's card color to deflect the strike!`;
        if (btnContainer) {
            btnContainer.innerHTML = `
                <button class="duel-card-btn green" onclick="resolveArtilleryDuel('green')">Guess Green</button>
                <button class="duel-card-btn red" onclick="resolveArtilleryDuel('red')">Guess Red</button>
            `;
        }
    }
}

function hideArtilleryCardModal() {
    let modal = document.getElementById('artillery-card-modal');
    if (modal) modal.style.display = 'none';
}

function tryMoveUnit(unit, newC, newR) {
    if (gameOver || !unit) return false;
    if (isUnitLockedInStalemate(unit, units)) {
        return false;
    }

    let movingTeam = getTeamFromUnit(unit);
    let movingPower = getUnitPower(unit);

    goldCores.forEach(core => {
        let inZone = core.captureZones.some(z => z.c === newC && z.r === newR) || (core.c === newC && core.r === newR);

        if (inZone) {
            let defendingTeam = core.owner;
            
            if (defendingTeam !== movingTeam) {
                if (defendingTeam && defendingTeam !== movingTeam) {
                    let defenderSu = getSuperunitsForTeam(defendingTeam, units).find(su => su.core === core || su.units.some(u => core.captureZones.some(z => z.c === u.gridX && z.r === u.gridY)));
                    let defenderPower = defenderSu ? defenderSu.power : 0;

                    if (movingPower > defenderPower) {
                        core.owner = movingTeam;
                        if (movingTeam === 'blue') blueCoins++;
                        else redCoins++;
                        flagAnimations[core.id] = performance.now();
                        console.log(`[SUCCESS][combat_mechanics]: ${movingTeam.toUpperCase()} captured enemy/neutral Gold Core ${core.id}!`);
                    } else {
                        let directlyConnectedToDefenderUnits = units.some(defU => getTeamFromUnit(defU) === defendingTeam && areUnitsAdjacent(unit, defU));
                        if (directlyConnectedToDefenderUnits) {
                            unitsToDestroy.add(unit);
                            console.warn(`[WARN][combat_mechanics]: ${movingTeam.toUpperCase()} unit failed to capture core ${core.id} and was destroyed due to direct unit contact.`);
                        } else {
                            console.log(`[INFO][combat_mechanics]: ${movingTeam.toUpperCase()} unit failed to capture core ${core.id} but survived safely.`);
                        }
                    }
                } else if (!defendingTeam) {
                    core.owner = movingTeam;
                    if (movingTeam === 'blue') blueCoins++;
                    else redCoins++;
                    flagAnimations[core.id] = performance.now();
                    console.log(`[SUCCESS][combat_mechanics]: ${movingTeam.toUpperCase()} claimed neutral Gold Core ${core.id}!`);
                }
            }
        }
    });

    unit.gridX = newC;
    unit.gridY = newR;

    resolveUnitInteractions(units);
    currentTurn = currentTurn === 'blue' ? 'red' : 'blue';
    return true;
}
