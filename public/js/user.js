const socket = io({ transports: ['websocket', 'polling'] });

const livePlayerName = document.getElementById('livePlayerName');
const livePlayerRole = document.getElementById('livePlayerRole');
const liveBidAmount = document.getElementById('liveBidAmount');
const liveHighestBidder = document.getElementById('liveHighestBidder');
const liveTimer = document.getElementById('liveTimer');
const bidDisplay = document.getElementById('bidDisplay');
const statusOverlay = document.getElementById('statusOverlay');
const statusText = document.getElementById('statusText');

const bidAmountInput = document.getElementById('bidAmountInput');
const placeBidBtn = document.getElementById('placeBidBtn');
const bidError = document.getElementById('bidError');

const teamNameDataElement = document.getElementById('teamNameData');
const teamName = teamNameDataElement ? teamNameDataElement.dataset.teamname : '';
let currentBid = 0;
let auctionActive = false;
let categoriesCache = [];
let teamsCache = [];
let playersCache = [];

const formatCurrency = (amt) => {
    const units = window.auctionCurrencyUnit || '₹';
    return ['₹', '$', '€', '£'].includes(units) ? `${units}${amt.toLocaleString()}` : `${amt.toLocaleString()} ${units}`;
};

function getActiveCategoryIncrement(state) {
    let activeCatId = null;
    if (state && state.currentPlayer && state.currentPlayer.category_id) {
        activeCatId = state.currentPlayer.category_id;
    }
    if (activeCatId && categoriesCache) {
        const cat = categoriesCache.find(c => c.id === activeCatId);
        if (cat && cat.increment && cat.increment > 0) {
            return parseInt(cat.increment, 10);
        }
    }
    return window.auctionBidIncreaseBy || 100;
}

function updateUI(state) {
    const livePlayerPhoto = document.getElementById('livePlayerPhoto');
    const livePlayerAge = document.getElementById('livePlayerAge');
    
    if (state.status === 'finished') {
        livePlayerName.textContent = 'NO PLAYERS FOR BIDDING';
        livePlayerRole.textContent = 'All players have been successfully auctioned!';
        liveBidAmount.textContent = formatCurrency(0);
        liveHighestBidder.textContent = 'None';
        liveTimer.textContent = '0';
        liveTimer.style.display = state.timerOff ? 'none' : 'flex';
        statusOverlay.classList.remove('active');
        currentBid = 0;
        auctionActive = false;
        if (livePlayerPhoto) livePlayerPhoto.src = '/uploads/default-player.svg';
        if (livePlayerAge) livePlayerAge.textContent = 'Age: --';
        const livePlayerCaptainBadge = document.getElementById('livePlayerCaptainBadge');
        if (livePlayerCaptainBadge) livePlayerCaptainBadge.style.display = 'none';
        const catDisplay = document.getElementById('liveCategoryDisplay');
        if (catDisplay) catDisplay.style.display = 'none';
        const basePriceDisplay = document.getElementById('liveBasePriceDisplay');
        if (basePriceDisplay) basePriceDisplay.style.display = 'none';
    } else if (state.currentPlayer) {
        if (window.lastPlayerId !== state.currentPlayer.id) {
            window.lastPlayerId = state.currentPlayer.id;
            const historyList = document.getElementById('bidHistoryList');
            if (historyList) {
                historyList.innerHTML = '<div id="bidHistoryEmptyMsg" style="padding: 1.5rem; color: var(--text-muted); font-size: 0.85rem; font-style: italic; text-align: center;">Awaiting bids...</div>';
            }
        }
        livePlayerName.textContent = state.currentPlayer.name;
        livePlayerRole.textContent = state.currentPlayer.role;
        liveBidAmount.textContent = formatCurrency(state.currentBid);
        liveHighestBidder.textContent = state.highestBidder ? state.highestBidder : 'None';
        liveTimer.textContent = state.timer;
        liveTimer.style.display = state.timerOff ? 'none' : 'flex';
        currentBid = state.currentBid;
        auctionActive = state.status === 'active';
        
        if (livePlayerPhoto) {
            livePlayerPhoto.src = state.currentPlayer.photo ? state.currentPlayer.photo : '/uploads/default-player.svg';
        }
        if (livePlayerAge) {
            livePlayerAge.textContent = 'Age: ' + (state.currentPlayer.age ? state.currentPlayer.age : 'N/A');
        }
        const livePlayerCaptainBadge = document.getElementById('livePlayerCaptainBadge');
        if (livePlayerCaptainBadge) {
            livePlayerCaptainBadge.style.display = state.currentPlayer.isCaptain ? 'block' : 'none';
        }
        
        if (state.timer <= 5 && state.status === 'active') {
            liveTimer.classList.add('warning');
        } else {
            liveTimer.classList.remove('warning');
        }

        const playerImageStatusOverlay = document.getElementById('playerImageStatusOverlay');
        const playerStatusStamp = document.getElementById('playerStatusStamp');
        const bidHistoryUnsoldOverlay = document.getElementById('bidHistoryUnsoldOverlay');
        
        if (state.status === 'sold') {
            statusText.textContent = 'SOLD';
            statusText.className = 'status-text text-sold';
            statusOverlay.classList.add('active');
            
            // New UI
            if (playerStatusStamp) {
                playerStatusStamp.textContent = 'SOLD';
                playerStatusStamp.style.color = 'rgba(110, 231, 183, 0.95)';
                playerStatusStamp.style.textShadow = '0 0 80px rgba(16, 185, 129, 1), 0 0 30px rgba(16, 185, 129, 1)';
                playerStatusStamp.style.opacity = '1';
                playerStatusStamp.style.transform = 'translate(-50%, -50%) scale(1)';
            }
            if (playerImageStatusOverlay) {
                playerImageStatusOverlay.style.background = 'rgba(16, 185, 129, 0.4)';
                playerImageStatusOverlay.style.opacity = '1';
            }
            if (bidHistoryUnsoldOverlay) bidHistoryUnsoldOverlay.style.opacity = '0';
        } else if (state.status === 'unsold') {
            statusText.textContent = 'UNSOLD';
            statusText.className = 'status-text text-unsold';
            statusOverlay.classList.add('active');
            
            // New UI
            if (playerStatusStamp) {
                playerStatusStamp.textContent = 'UNSOLD';
                playerStatusStamp.style.color = 'rgba(255, 180, 180, 0.95)';
                playerStatusStamp.style.textShadow = '0 0 80px rgba(220, 38, 38, 1), 0 0 30px rgba(220, 38, 38, 1)';
                playerStatusStamp.style.opacity = '1';
                playerStatusStamp.style.transform = 'translate(-50%, -50%) scale(1)';
            }
            if (playerImageStatusOverlay) {
                playerImageStatusOverlay.style.background = 'rgba(220, 38, 38, 0.4)';
                playerImageStatusOverlay.style.opacity = '1';
            }
            if (bidHistoryUnsoldOverlay) bidHistoryUnsoldOverlay.style.opacity = '1';
        } else {
            statusOverlay.classList.remove('active');
            
            // New UI clear
            if (playerStatusStamp) {
                playerStatusStamp.style.opacity = '0';
                playerStatusStamp.style.transform = 'translate(-50%, -50%) scale(0.8)';
            }
            if (playerImageStatusOverlay) {
                playerImageStatusOverlay.style.opacity = '0';
            }
            if (bidHistoryUnsoldOverlay) bidHistoryUnsoldOverlay.style.opacity = '0';
        }

        if (bidAmountInput) {
            const inc = getActiveCategoryIncrement(state);
            bidAmountInput.value = currentBid + inc;
        }
        
        const catDisplay = document.getElementById('liveCategoryDisplay');
        const basePriceDisplay = document.getElementById('liveBasePriceDisplay');
        let calculatedBaseBid = state.currentPlayer.basePrice || 0;
        
        if (state.currentPlayer.category_id && categoriesCache) {
            const cat = categoriesCache.find(c => c.id === state.currentPlayer.category_id);
            if (cat) {
                if (catDisplay) {
                    catDisplay.textContent = cat.name;
                    catDisplay.style.borderColor = cat.color || 'var(--accent)';
                    catDisplay.style.color = cat.color || 'var(--accent)';
                    catDisplay.style.display = 'inline-block';
                }
                if (cat.baseBid && cat.baseBid > 0) {
                    calculatedBaseBid = Math.max(state.currentPlayer.basePrice || 0, cat.baseBid);
                }
            } else {
                if (catDisplay) catDisplay.style.display = 'none';
            }
        } else {
            if (catDisplay) catDisplay.style.display = 'none';
        }
        
        if (basePriceDisplay) {
            basePriceDisplay.textContent = `Base Bid: ${formatCurrency(calculatedBaseBid)}`;
            basePriceDisplay.style.display = 'inline-block';
        }
    } else {
        livePlayerName.textContent = 'Waiting for Admin...';
        livePlayerRole.textContent = '--';
        liveBidAmount.textContent = formatCurrency(0);
        liveHighestBidder.textContent = 'None';
        liveTimer.textContent = '30';
        liveTimer.style.display = state.timerOff ? 'none' : 'flex';
        statusOverlay.classList.remove('active');
        auctionActive = false;
        if (livePlayerPhoto) livePlayerPhoto.src = '/uploads/default-player.svg';
        if (livePlayerAge) livePlayerAge.textContent = 'Age: --';
        const catDisplay = document.getElementById('liveCategoryDisplay');
        if (catDisplay) catDisplay.style.display = 'none';
        const basePriceDisplay = document.getElementById('liveBasePriceDisplay');
        if (basePriceDisplay) basePriceDisplay.style.display = 'none';
    }
    if (typeof checkBiddingValidity === 'function') {
        checkBiddingValidity();
    }
}

function flashBid() {
    bidDisplay.classList.add('highlight');
    setTimeout(() => {
        bidDisplay.classList.remove('highlight');
    }, 500);
}

socket.on('auctionUpdate', (state) => {
    window.auctionState = state;
    updateUI(state);
    if (bidError) bidError.textContent = '';
});

socket.on('timerUpdate', (timer) => {
    liveTimer.textContent = timer;
    if (timer <= 5) {
        liveTimer.classList.add('warning');
    } else {
        liveTimer.classList.remove('warning');
    }
});

// Premium Pop Animation on Bid Update
function animateBidUpdate() {
    if (!liveBidAmount) return;
    liveBidAmount.style.transition = 'none';
    liveBidAmount.style.transform = 'scale(1.25)';
    liveBidAmount.style.textShadow = '0 0 30px #10b981, 0 0 60px #34d399';
    void liveBidAmount.offsetHeight; // force reflow
    liveBidAmount.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    liveBidAmount.style.transform = 'scale(1)';
    liveBidAmount.style.textShadow = '0 0 15px rgba(255,255,255,0.2)';
}

socket.on('bidUpdate', (data) => {
    liveBidAmount.textContent = formatCurrency(data.currentBid);
    liveHighestBidder.textContent = data.highestBidder;
    currentBid = data.currentBid;
    if (window.auctionState) {
        window.auctionState.currentBid = data.currentBid;
        window.auctionState.highestBidder = data.highestBidder;
    }
    
    // Update Simulated Bid History for User Dashboard
    const historyList = document.getElementById('bidHistoryList');
    const emptyMsg = document.getElementById('bidHistoryEmptyMsg');
    if (historyList) {
        if (emptyMsg) emptyMsg.style.display = 'none';
        const bidTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
        
        let teamLogoHtml = '<span style="width: 20px; height: 20px; background: rgba(255,255,255,0.1); border-radius: 2px; display: inline-block;"></span>';
        if (teamsCache && data.highestBidder) {
            const bidderTeam = teamsCache.find(t => t.name === data.highestBidder);
            if (bidderTeam) {
                if (bidderTeam.logo) {
                    teamLogoHtml = `<img src="${bidderTeam.logo}" style="width: 20px; height: 20px; border-radius: 2px; object-fit: cover;">`;
                } else {
                    teamLogoHtml = `<span style="width: 20px; height: 20px; background: ${bidderTeam.color}; border-radius: 2px; display: inline-block;"></span>`;
                }
            }
        }

        const historyItem = document.createElement('div');
        historyItem.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 1.15rem; border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.3s; animation: fadeIn 0.3s ease-out forwards;';
        historyItem.innerHTML = `
            <div style="display: flex; gap: 1rem; align-items: center;">
                ${teamLogoHtml}
                <div>
                    <div style="font-weight: 800; font-size: 1.1rem; color: #fff; text-transform: uppercase;">${data.highestBidder}</div>
                    <div style="font-size: 0.65rem; color: var(--text-muted);">${bidTime}</div>
                </div>
            </div>
            <div style="font-size: 1.1rem; font-weight: 800; color: var(--primary);">${formatCurrency(data.currentBid)}</div>
        `;
        historyList.prepend(historyItem);
        
        // Dim older items slightly
        const children = historyList.children;
        for (let i = 1; i < children.length; i++) {
            if (children[i].id !== 'bidHistoryEmptyMsg') {
                const amountDiv = children[i].querySelector('div:last-child');
                if (amountDiv) amountDiv.style.color = 'rgba(255,255,255,0.4)';
            }
        }
    }

    if (bidAmountInput) {
        const inc = getActiveCategoryIncrement(window.auctionState);
        bidAmountInput.value = currentBid + inc;
    }
    flashBid();
    animateBidUpdate();
    if (typeof checkBiddingValidity === 'function') {
        checkBiddingValidity();
    }
});

socket.on('auctionEnd', (state) => {
    window.auctionState = state;
    updateUI(state);
});

// State tracker to persist open rosters during live dynamic updates
const expandedTeams = new Set();

window.toggleRoster = (teamName) => {
    if (expandedTeams.has(teamName)) {
        expandedTeams.delete(teamName);
    } else {
        expandedTeams.add(teamName);
    }
    const card = document.querySelector(`.team-card[data-teamname="${teamName}"]`);
    if (card) {
        const roster = card.querySelector('.team-roster-list');
        const arrow = card.querySelector('.toggle-arrow');
        if (roster) {
            const isHidden = roster.style.display === 'none' || !roster.style.display;
            roster.style.display = isHidden ? 'flex' : 'none';
            if (arrow) arrow.textContent = isHidden ? '▴' : '▾';
        }
    }
};

socket.on('dataUpdate', ({ teams, players, categories }) => {
    if (teams) teamsCache = teams;
    if (players) playersCache = players;
    if (categories) categoriesCache = categories;
    const teamList = document.getElementById('teamList');
    if (teamList) {
        teamList.innerHTML = teams.sort((a, b) => a.name.localeCompare(b.name)).map((team) => {
            const teamPlayers = players.filter(p => p.soldTo === team.name);
            const isExpanded = expandedTeams.has(team.name);
            
            const rosterHTML = teamPlayers.length === 0 
                ? `<div style="font-size: 0.75rem; color: #64748b; font-style: italic; padding: 0.2rem 0; text-align: left;">No players drafted yet</div>`
                : teamPlayers.sort((a, b) => b.soldPrice - a.soldPrice).map(player => `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); padding: 0.4rem 0.6rem; border-radius: 4px; border: 1px solid ${player.isCaptain ? 'rgba(251, 191, 36, 0.2)' : 'rgba(255,255,255,0.02)'};">
                        <div style="display: flex; flex-direction: column; text-align: left;">
                            <span style="font-size: 0.8rem; font-weight: 600; color: ${player.isCaptain ? '#fbbf24' : '#e2e8f0'};">${player.name} ${player.isCaptain ? '👑' : ''}</span>
                            <span style="font-size: 0.65rem; color: #64748b; text-transform: uppercase;">${player.role}</span>
                        </div>
                        <span style="font-size: 0.8rem; font-weight: bold; color: #10b981;">${formatCurrency(player.soldPrice)}</span>
                    </div>
                `).join('');

            return `
                <div class="team-card" data-teamname="${team.name}" onclick="toggleRoster('${team.name}')" style="padding: 1rem; background: #0f172a; border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; cursor: pointer; transition: all 0.2s;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-weight: bold; color: #f8fafc; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                            ${team.logo ? `<img src="${team.logo}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.1);">` : `<span class="color-dot" style="background-color: ${team.color}; width: 24px; height: 24px; display: inline-block; border-radius: 4px;"></span>`}
                            <div>
                                <div>${team.name}</div>
                                <div style="font-size: 0.7rem; color: #64748b; font-weight: normal; margin-top: 0.2rem;">PURSE: ${formatCurrency(team.budget)}</div>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <div style="font-size: 1.5rem; font-weight: bold; color: #94a3b8;">${teamPlayers.length}<span style="font-size: 0.8rem; font-weight: normal; color: #64748b;">/18</span></div>
                            <span class="toggle-arrow" style="font-size: 0.9rem; color: #64748b;">${isExpanded ? '▴' : '▾'}</span>
                        </div>
                    </div>
                    <div style="margin-top: 0.8rem; background: rgba(255,255,255,0.1); height: 4px; border-radius: 2px; overflow: hidden;">
                        <div style="background: #10b981; height: 100%; width: ${(teamPlayers.length / 18) * 100}%;"></div>
                    </div>
                    <!-- Collapsible Roster Tray -->
                    <div class="team-roster-list" style="margin-top: 1rem; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.75rem; display: ${isExpanded ? 'flex' : 'none'}; flex-direction: column; gap: 0.4rem; max-height: 200px; overflow-y: auto;">
                        ${rosterHTML}
                    </div>
                </div>
            `;
        }).join('');
    }
    if (typeof checkBiddingValidity === 'function') {
        checkBiddingValidity();
    }
});

socket.on('bidError', (msg) => {
    if (bidError) bidError.textContent = msg;
});

if (placeBidBtn) {
    placeBidBtn.addEventListener('click', () => {
        if (!auctionActive) return;
        const amount = parseInt(bidAmountInput.value);
        if (amount > currentBid) {
            socket.emit('placeBid', { teamName, bidAmount: amount });
            if (bidError) bidError.textContent = '';
        } else {
            if (bidError) bidError.textContent = 'Bid must be higher than current bid.';
        }
    });
}

if (bidAmountInput) {
    bidAmountInput.addEventListener('input', () => {
        if (typeof checkBiddingValidity === 'function') {
            checkBiddingValidity();
        }
    });
}

function checkBiddingValidity() {
    if (!teamName || !window.auctionState || !window.auctionState.currentPlayer) {
        if (placeBidBtn) placeBidBtn.disabled = false;
        if (bidAmountInput) bidAmountInput.disabled = false;
        return;
    }
    const player = window.auctionState.currentPlayer;
    const currentCatId = player.category_id;
    
    // Find the category
    const category = currentCatId ? categoriesCache.find(c => c.id === currentCatId) : null;
    
    // Find the team
    const team = teamsCache.find(t => t.name === teamName);
    if (!team) return;
    
    const teamPlayers = playersCache.filter(p => p.soldTo === teamName);
    const maxPlayersTotal = window.auctionMaxPlayers || 15;
    
    // 1. Overall squad limit
    if (teamPlayers.length >= maxPlayersTotal) {
        if (placeBidBtn) placeBidBtn.disabled = true;
        if (bidAmountInput) bidAmountInput.disabled = true;
        if (bidError) bidError.textContent = `Squad is full (${maxPlayersTotal}/${maxPlayersTotal} players)!`;
        return;
    }
    
    // 2. Category max/min player count limit
    const state = window.auctionState;
    const isActiveCategoryAll = !state || !state.activeCategory || state.activeCategory === 'all' || state.activeCategory.startsWith('cat_all_');

    if (category && !category.id.startsWith('cat_all_')) {
        const limit = (category.maxPlayers && category.maxPlayers > 0) 
            ? category.maxPlayers 
            : (category.minPlayers && category.minPlayers > 0 ? category.minPlayers : 0);
        if (limit > 0 && !isActiveCategoryAll) {
            const teamPlayersInCat = teamPlayers.filter(p => p.category_id === currentCatId && p.status === 'sold').length;
            if (teamPlayersInCat >= limit) {
                if (placeBidBtn) placeBidBtn.disabled = true;
                if (bidAmountInput) bidAmountInput.disabled = true;
                if (bidError) bidError.textContent = `Team reached maximum allowed player limit for this category`;
                return;
            }
        }
        
        // 3. Category highest bid per player constraint
        const increment = getActiveCategoryIncrement(window.auctionState);
        const nextBidAmt = parseInt(bidAmountInput ? bidAmountInput.value : (currentBid + increment)) || (currentBid + increment);
        if (category.highestBidPerPlayer && category.highestBidPerPlayer > 0 && nextBidAmt > category.highestBidPerPlayer) {
            if (placeBidBtn) placeBidBtn.disabled = true;
            if (bidAmountInput) bidAmountInput.disabled = true;
            if (bidError) bidError.textContent = `Next bid exceeds maximum allowed bid per player for the ${category.name} category!`;
            return;
        }
        
        // 4. Category highest bid all constraint
        if (category.categoryHighestBidAll && category.categoryHighestBidAll > 0) {
            const teamPlayersInCat = teamPlayers.filter(p => p.category_id === currentCatId);
            const spentInCat = teamPlayersInCat.reduce((sum, p) => sum + (p.soldPrice || 0), 0);
            if (spentInCat + nextBidAmt > category.categoryHighestBidAll) {
                if (placeBidBtn) placeBidBtn.disabled = true;
                if (bidAmountInput) bidAmountInput.disabled = true;
                if (bidError) bidError.textContent = `Next bid exceeds total budget limit for the ${category.name} category!`;
                return;
            }
        }
    }
    
    // 5. Min category slots/budget reserve constraints
    const purseLeft = team.budget;
    const slotsLeft = maxPlayersTotal - teamPlayers.length;
    const defaultBaseBid = window.auctionBaseBid || 1000;

    let categoryRemaining = 0;
    let categoryBudgetNeeded = 0;
    let currentCatNeeds = 0;
    let currentCatBaseBid = defaultBaseBid;

    if (!isActiveCategoryAll && categoriesCache) {
        categoriesCache.forEach(c => {
            if (c.id.startsWith('cat_all_')) return;
            const actualPlayersInCat = teamPlayers.filter(p => p.category_id === c.id).length;
            const needed = Math.max(0, (c.minPlayers || 0) - actualPlayersInCat);
            if (needed > 0) {
                categoryRemaining += needed;
                const catBaseBid = c.baseBid && c.baseBid > 0 ? parseFloat(c.baseBid) : defaultBaseBid;
                categoryBudgetNeeded += needed * catBaseBid;
                if (currentCatId === c.id) {
                    currentCatNeeds = needed;
                    currentCatBaseBid = catBaseBid;
                }
            }
        });
    }

    const isCategoryBid = currentCatId && !currentCatId.startsWith('cat_all_') && currentCatNeeds > 0;

    let reservePoint = 0;
    if (isCategoryBid) {
        const categoryBudgetNeededAfter = categoryBudgetNeeded - currentCatBaseBid;
        const normalSlotsNeeded = slotsLeft - categoryRemaining;
        const normalBudgetNeeded = Math.max(0, normalSlotsNeeded) * defaultBaseBid;
        reservePoint = categoryBudgetNeededAfter + normalBudgetNeeded;
    } else {
        const normalSlotsNeeded = slotsLeft - 1 - categoryRemaining;
        const normalBudgetNeeded = Math.max(0, normalSlotsNeeded) * defaultBaseBid;
        reservePoint = categoryBudgetNeeded + normalBudgetNeeded;
    }

    const neededCategorySlotsAfterBid = isCategoryBid ? (categoryRemaining - 1) : categoryRemaining;
    const remainingSlots = slotsLeft - 1;

    if (remainingSlots < neededCategorySlotsAfterBid) {
        if (placeBidBtn) placeBidBtn.disabled = true;
        if (bidAmountInput) bidAmountInput.disabled = true;
        if (bidError) bidError.textContent = `Bidding leaves insufficient slots (${remainingSlots}) for other category minimums (${neededCategorySlotsAfterBid})!`;
        return;
    }

    const increment = getActiveCategoryIncrement(window.auctionState);
    const nextBidAmt = parseInt(bidAmountInput ? bidAmountInput.value : (currentBid + increment)) || (currentBid + increment);
    
    if (purseLeft < nextBidAmt) {
        if (placeBidBtn) placeBidBtn.disabled = true;
        if (bidAmountInput) bidAmountInput.disabled = true;
        if (bidError) bidError.textContent = `Insufficient budget!`;
        return;
    }

    if (purseLeft - nextBidAmt < reservePoint) {
        if (placeBidBtn) placeBidBtn.disabled = true;
        if (bidAmountInput) bidAmountInput.disabled = true;
        if (bidError) bidError.textContent = `Bidding leaves insufficient budget reserve for other slots!`;
        return;
    }
    
    // If all pass:
    if (placeBidBtn) placeBidBtn.disabled = false;
    if (bidAmountInput) bidAmountInput.disabled = false;
    if (bidError && (bidError.textContent.includes('Squad is full') || bidError.textContent.includes('Limit reached') || bidError.textContent.includes('maximum allowed') || bidError.textContent.includes('exceeds') || bidError.textContent.includes('insufficient') || bidError.textContent.includes('budget'))) {
        bidError.textContent = '';
    }
}
