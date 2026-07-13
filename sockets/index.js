const data = require('../models/data');

function getTeamReserve(teamName, biddingPlayerCatId) {
    const defaultBaseBid = data.auctionDetails && data.auctionDetails.baseBid ? parseFloat(data.auctionDetails.baseBid) : 500;
    const maxPlayers = data.auctionDetails && data.auctionDetails.playersPerTeamMax ? parseInt(data.auctionDetails.playersPerTeamMax) : 15;
    
    const teamPlayers = data.players.filter(p => p.soldTo === teamName);
    
    const remainingSlots = maxPlayers - teamPlayers.length - 1;
    if (remainingSlots < 0) return 0;

    let categoryReserve = 0;
    let minPlayersSlotsCount = 0;

    if (data.categories) {
        data.categories.forEach(cat => {
            if (cat.id.startsWith('cat_all_')) return;

            const actualPlayersInCat = teamPlayers.filter(p => p.category_id === cat.id).length;
            const isCurrentCat = (biddingPlayerCatId === cat.id);
            const assumedBought = isCurrentCat ? 1 : 0;
            
            const needed = Math.max(0, (cat.minPlayers || 0) - (actualPlayersInCat + assumedBought));
            if (needed > 0) {
                const catBaseBid = cat.baseBid && cat.baseBid > 0 ? parseFloat(cat.baseBid) : defaultBaseBid;
                categoryReserve += needed * catBaseBid;
                minPlayersSlotsCount += needed;
            }
        });
    }

    const unrestrictedSlots = Math.max(0, remainingSlots - minPlayersSlotsCount);
    const unrestrictedReserve = unrestrictedSlots * defaultBaseBid;

    return categoryReserve + unrestrictedReserve;
}

function validateSoldAssignment(player, team, bidAmount) {
    if (!player) {
        return { valid: false, message: "No active player!" };
    }
    if (player.status !== 'available') {
        return { valid: false, message: "Player is not available for sale!" };
    }
    if (!team) {
        return { valid: false, message: "Team not found!" };
    }
    if (team.budget < bidAmount) {
        return { valid: false, message: "Insufficient budget!" };
    }

    const teamPlayers = data.players.filter(p => p.soldTo === team.name);
    const maxPlayersTotal = data.auctionDetails && data.auctionDetails.playersPerTeamMax ? parseInt(data.auctionDetails.playersPerTeamMax) : 15;
    if (teamPlayers.length >= maxPlayersTotal) {
        return { valid: false, message: `Squad is full (${teamPlayers.length}/${maxPlayersTotal} players)!` };
    }

    const currentCatId = player.category_id;
    let totalMinPlayersNeeded = 0;
    let totalMinBudgetNeeded = 0;
    const defaultBaseBid = data.auctionDetails && data.auctionDetails.baseBid ? parseFloat(data.auctionDetails.baseBid) : 500;

    const isActiveCategoryAll = !data.auctionState.activeCategory || 
                                data.auctionState.activeCategory === 'all' || 
                                data.auctionState.activeCategory.startsWith('cat_all_');

    if (data.categories && !isActiveCategoryAll) {
        data.categories.forEach(cat => {
            if (cat.id.startsWith('cat_all_')) return;
            const actualPlayersInCat = teamPlayers.filter(p => p.category_id === cat.id).length;
            const isCurrentCat = (currentCatId === cat.id);
            const assumedBought = isCurrentCat ? 1 : 0;
            
            const needed = Math.max(0, (cat.minPlayers || 0) - (actualPlayersInCat + assumedBought));
            if (needed > 0) {
                totalMinPlayersNeeded += needed;
                const catBaseBid = cat.baseBid && cat.baseBid > 0 ? parseFloat(cat.baseBid) : defaultBaseBid;
                totalMinBudgetNeeded += needed * catBaseBid;
            }
        });
    }

    const remainingSlots = maxPlayersTotal - teamPlayers.length - 1;
    if (remainingSlots < totalMinPlayersNeeded) {
        return { valid: false, message: `Purchase leaves ${team.name} with only ${remainingSlots} slots, which is less than the ${totalMinPlayersNeeded} slots required to fill minimum players for other categories!` };
    }

    if (team.budget - bidAmount < totalMinBudgetNeeded) {
        return { valid: false, message: `Purchase leaves ${team.name} with insufficient budget to cover minimum player counts reserve points!` };
    }

    if (currentCatId) {
        const category = data.categories.find(c => c.id === currentCatId);
        if (category && !category.id.startsWith('cat_all_')) {
            const limit = (category.maxPlayers && category.maxPlayers > 0) 
                ? category.maxPlayers 
                : (category.minPlayers && category.minPlayers > 0 ? category.minPlayers : 0);
            if (limit > 0 && !isActiveCategoryAll) {
                const teamPlayersInCat = teamPlayers.filter(p => p.category_id === currentCatId && p.status === 'sold').length;
                if (teamPlayersInCat >= limit) {
                    return { valid: false, message: "Team reached maximum allowed player limit for this category" };
                }
            }
            if (category.highestBidPerPlayer && category.highestBidPerPlayer > 0 && bidAmount > category.highestBidPerPlayer) {
                return { valid: false, message: `Bid exceeds the maximum allowed bid per player for the ${category.name} category!` };
            }
            if (category.categoryHighestBidAll && category.categoryHighestBidAll > 0) {
                const teamPlayersInCat = teamPlayers.filter(p => p.category_id === currentCatId);
                const spentInCat = teamPlayersInCat.reduce((sum, p) => sum + (p.soldPrice || 0), 0);
                if (spentInCat + bidAmount > category.categoryHighestBidAll) {
                    return { valid: false, message: `Purchase exceeds the total budget limit for the ${category.name} category!` };
                }
            }
        }
    }
    return { valid: true };
}

module.exports = (io) => {
    let timerInterval = null;

    const broadcastAuctionUpdate = () => {
        io.emit('auctionUpdate', data.auctionState);
    };

    const handleAuctionEnd = async () => {
        const player = data.auctionState.currentPlayer;
        if (!player) return;

        const currentCatId = player.category_id;
        const category = currentCatId ? data.categories.find(c => c.id === currentCatId) : null;
        const reserveBid = (category && category.reserveBid) ? category.reserveBid : 0;

        if (data.auctionState.highestBidder && data.auctionState.currentBid >= reserveBid) {
            const team = data.teams.find(t => t.name === data.auctionState.highestBidder);
            const validation = validateSoldAssignment(player, team, data.auctionState.currentBid);
            if (validation.valid) {
                data.auctionState.status = 'sold';
                player.status = 'sold';
                player.soldTo = data.auctionState.highestBidder;
                player.soldPrice = data.auctionState.currentBid;
                if (team) {
                    team.budget -= data.auctionState.currentBid;
                    await data.updateTeamBudget(team.name, team.budget);
                }
                await data.updatePlayerStatus(player);
            } else {
                console.log(`[Auction] SOLD validation failed: ${validation.message}`);
                data.auctionState.status = 'unsold';
                player.status = 'unsold';
                player.soldTo = null;
                player.soldPrice = null;
                await data.updatePlayerStatus(player);
            }
        } else {
            data.auctionState.status = 'unsold';
            player.status = 'unsold';
            player.soldTo = null;
            player.soldPrice = null;
            await data.updatePlayerStatus(player);
        }

        io.emit('auctionEnd', data.auctionState);
        io.emit('dataUpdate', { teams: data.teams, players: data.players, categories: data.categories });
        broadcastAuctionUpdate();

        // Wait 4 seconds, then auto-load the next available player
        setTimeout(async () => {
            const activeCat = data.auctionState.activeCategory;
            const nextPlayer = data.players.find(p => 
                p.status === 'available' && 
                (!activeCat || activeCat === 'all' || activeCat.startsWith('cat_all_') || p.category_id === activeCat)
            );
            if (nextPlayer) {
                data.auctionState.currentPlayer = nextPlayer;

                const nextCatId = nextPlayer.category_id;
                const nextCategory = nextCatId ? data.categories.find(c => c.id === nextCatId) : null;
                let startingBid = nextPlayer.basePrice || 0;
                if (startingBid === 0) {
                    startingBid = data.auctionDetails && data.auctionDetails.baseBid ? parseFloat(data.auctionDetails.baseBid) : 1000;
                }
                if (nextCategory && nextCategory.baseBid && nextCategory.baseBid > 0) {
                    startingBid = Math.max(startingBid, nextCategory.baseBid);
                }

                data.auctionState.currentBid = startingBid;
                data.auctionState.highestBidder = null;
                data.auctionState.timer = 30;
                data.auctionState.status = 'active';
                data.auctionState.bidHistory = [];
                data.auctionState.isPaused = false;
                data.auctionState.timerOff = false;

                broadcastAuctionUpdate();

                if (timerInterval) clearInterval(timerInterval);
                timerInterval = setInterval(() => {
                    if (data.auctionState.status === 'active' && !data.auctionState.isPaused && !data.auctionState.timerOff) {
                        if (data.auctionState.timer > 0) {
                            data.auctionState.timer--;
                            io.emit('timerUpdate', data.auctionState.timer);
                        } else {
                            clearInterval(timerInterval);
                            handleAuctionEnd();
                        }
                    }
                }, 1000);
            } else {
                data.auctionState.currentPlayer = null;
                data.auctionState.currentBid = 0;
                data.auctionState.highestBidder = null;
                data.auctionState.timer = 0;
                data.auctionState.status = 'finished';

                broadcastAuctionUpdate();
                io.emit('dataUpdate', { teams: data.teams, players: data.players, categories: data.categories });
            }
        }, 4000);
    };

    io.on('connection', (socket) => {
        socket.emit('auctionUpdate', data.auctionState);
        socket.emit('dataUpdate', { teams: data.teams, players: data.players, categories: data.categories });

        socket.on('startAuction', ({ playerId }) => {
            const player = data.players.find(p => p.id === playerId);
            if (player) {
                data.auctionState.currentPlayer = player;
                data.auctionState.activeCategory = player.category_id || 'all';

                const currentCatId = player.category_id;
                const category = currentCatId ? data.categories.find(c => c.id === currentCatId) : null;
                let startingBid = player.basePrice || 0;
                if (startingBid === 0) {
                    startingBid = data.auctionDetails && data.auctionDetails.baseBid ? parseFloat(data.auctionDetails.baseBid) : 1000;
                }
                if (category && category.baseBid && category.baseBid > 0) {
                    startingBid = Math.max(startingBid, category.baseBid);
                }

                data.auctionState.currentBid = startingBid;
                data.auctionState.highestBidder = null;
                data.auctionState.timer = 30;
                data.auctionState.status = 'active';
                data.auctionState.bidHistory = [];
                data.auctionState.isPaused = false;
                data.auctionState.timerOff = false;

                broadcastAuctionUpdate();

                if (timerInterval) clearInterval(timerInterval);
                timerInterval = setInterval(() => {
                    if (data.auctionState.status === 'active' && !data.auctionState.isPaused && !data.auctionState.timerOff) {
                        if (data.auctionState.timer > 0) {
                            data.auctionState.timer--;
                            io.emit('timerUpdate', data.auctionState.timer);
                        } else {
                            clearInterval(timerInterval);
                            handleAuctionEnd();
                        }
                    }
                }, 1000);
            }
        });

        socket.on('placeBid', async ({ teamName, bidAmount }, callback) => {
            if (data.auctionState.status !== 'active') {
                socket.emit('bidError', 'Auction is not active!');
                return;
            }
            if (!data.auctionState.timerOff && data.auctionState.timer <= 0) {
                socket.emit('bidError', 'Time has run out for this player!');
                return;
            }

            const currentCatId = data.auctionState.currentPlayer ? data.auctionState.currentPlayer.category_id : null;
            const category = currentCatId ? data.categories.find(c => c.id === currentCatId) : null;
            const increment = (category && category.increment && category.increment > 0) 
                ? category.increment 
                : (data.auctionDetails && data.auctionDetails.bidIncreaseBy ? parseFloat(data.auctionDetails.bidIncreaseBy) : 500);

            // Starting bid and increment check
            let minRequiredBid = 0;
            if (!data.auctionState.highestBidder) {
                minRequiredBid = Math.max((data.auctionState.currentPlayer && data.auctionState.currentPlayer.basePrice) || 0, (category && category.baseBid) || 0);
            } else {
                minRequiredBid = data.auctionState.currentBid + increment;
            }

            if (bidAmount < minRequiredBid) {
                socket.emit('bidError', `Bid amount must be at least ${minRequiredBid.toLocaleString()}!`);
                return;
            }

            if (teamName) {
                const team = data.teams.find(t => t.name === teamName);
                if (!team) {
                    socket.emit('bidError', `Team "${teamName}" not found!`);
                    return;
                }
                if (team.budget < bidAmount) {
                    const unit = data.auctionDetails && data.auctionDetails.units ? data.auctionDetails.units : '₹';
                    socket.emit('bidError', `${teamName} does not have enough budget (Remaining: ${unit}${team.budget.toLocaleString()}, Attempted Bid: ${unit}${bidAmount.toLocaleString()})!`);
                    return;
                }

                const teamPlayers = data.players.filter(p => p.soldTo === teamName);
                const maxPlayersTotal = data.auctionDetails && data.auctionDetails.playersPerTeamMax ? parseInt(data.auctionDetails.playersPerTeamMax) : 15;
                if (teamPlayers.length >= maxPlayersTotal) {
                    socket.emit('bidError', `${teamName} has already reached the maximum squad limit of ${maxPlayersTotal} players!`);
                    return;
                }

                // Enforce Category Rules
                // Calculate category minimum slots and budget needed after this bid is successful
                const purseLeft = team.budget;
                const slotsLeft = maxPlayersTotal - teamPlayers.length;
                const defaultBaseBid = data.auctionDetails && data.auctionDetails.baseBid ? parseFloat(data.auctionDetails.baseBid) : 1000;

                let categoryRemaining = 0;
                let categoryBudgetNeeded = 0;
                let currentCatNeeds = 0;
                let currentCatBaseBid = defaultBaseBid;

                const isActiveCategoryAll = !data.auctionState.activeCategory || 
                                            data.auctionState.activeCategory === 'all' || 
                                            data.auctionState.activeCategory.startsWith('cat_all_');

                if (data.categories && !isActiveCategoryAll) {
                    data.categories.forEach(cat => {
                        if (cat.id.startsWith('cat_all_')) return;
                        const actualPlayersInCat = teamPlayers.filter(p => p.category_id === cat.id).length;
                        const needed = Math.max(0, (cat.minPlayers || 0) - actualPlayersInCat);
                        if (needed > 0) {
                            categoryRemaining += needed;
                            const catBaseBid = cat.baseBid && cat.baseBid > 0 ? parseFloat(cat.baseBid) : defaultBaseBid;
                            categoryBudgetNeeded += needed * catBaseBid;
                            if (currentCatId === cat.id) {
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
                    socket.emit('bidError', `Bidding on this player leaves ${teamName} with only ${remainingSlots} slots, which is less than the ${neededCategorySlotsAfterBid} slots required to fill minimum players for other categories!`);
                    return;
                }

                if (purseLeft - bidAmount < reservePoint) {
                    const unit = data.auctionDetails && data.auctionDetails.units ? data.auctionDetails.units : '₹';
                    socket.emit('bidError', `Bidding ${unit}${bidAmount.toLocaleString()} leaves ${teamName} with ${unit}${(purseLeft - bidAmount).toLocaleString()} budget, which is less than the required reserve of ${unit}${reservePoint.toLocaleString()} to buy remaining category/normal players!`);
                    return;
                }

                if (category && !category.id.startsWith('cat_all_')) {
                    // Max players constraint for category
                    const limit = (category.maxPlayers && category.maxPlayers > 0) 
                        ? category.maxPlayers 
                        : (category.minPlayers && category.minPlayers > 0 ? category.minPlayers : 0);
                    if (limit > 0 && !isActiveCategoryAll) {
                        const teamPlayersInCat = teamPlayers.filter(p => p.category_id === currentCatId && p.status === 'sold').length;
                        if (teamPlayersInCat >= limit) {
                            if (callback && typeof callback === 'function') {
                                callback({ success: false, message: "Maximum category player limit reached" });
                            }
                            socket.emit('bidError', 'Team reached maximum allowed player limit for this category');
                            return;
                        }
                    }
                    // Highest bid per player constraint
                    if (category.highestBidPerPlayer && category.highestBidPerPlayer > 0 && bidAmount > category.highestBidPerPlayer) {
                        const unit = data.auctionDetails && data.auctionDetails.units ? data.auctionDetails.units : '₹';
                        socket.emit('bidError', `Bid exceeds the maximum allowed bid per player for the ${category.name} category (${unit}${category.highestBidPerPlayer.toLocaleString()})!`);
                        return;
                    }
                    // Category highest bid all constraint
                    if (category.categoryHighestBidAll && category.categoryHighestBidAll > 0) {
                        const teamPlayersInCat = teamPlayers.filter(p => p.category_id === currentCatId);
                        const spentInCat = teamPlayersInCat.reduce((sum, p) => sum + (p.soldPrice || 0), 0);
                        if (spentInCat + bidAmount > category.categoryHighestBidAll) {
                            const unit = data.auctionDetails && data.auctionDetails.units ? data.auctionDetails.units : '₹';
                            socket.emit('bidError', `${teamName} exceeds the total budget limit for the ${category.name} category (${unit}${category.categoryHighestBidAll.toLocaleString()})!`);
                            return;
                        }
                    }
                }
            }

            // Prevent bids from going below the player's base price
            let minBase = data.auctionState.currentPlayer ? data.auctionState.currentPlayer.basePrice : 0;
            if (category && category.baseBid && category.baseBid > 0) {
                minBase = category.baseBid;
            }

            if (data.auctionState.currentPlayer && bidAmount < minBase) {
                const unit = data.auctionDetails && data.auctionDetails.units ? data.auctionDetails.units : '₹';
                socket.emit('bidError', `Bid amount cannot be less than the base price (${unit}${minBase.toLocaleString()})!`);
                return;
            }

            // If all validation passes:
            if (!data.auctionState.bidHistory) data.auctionState.bidHistory = [];
            data.auctionState.bidHistory.push({
                teamName: data.auctionState.highestBidder,
                amount: data.auctionState.currentBid
            });

            data.auctionState.currentBid = bidAmount;
            data.auctionState.highestBidder = teamName || null;
            data.auctionState.timer = 30; 

            await data.saveStateToRedis();

            io.emit('bidUpdate', {
                currentBid: data.auctionState.currentBid,
                highestBidder: data.auctionState.highestBidder
            });
            io.emit('timerUpdate', data.auctionState.timer);
            broadcastAuctionUpdate();
            if (callback && typeof callback === 'function') {
                callback({ success: true });
            }
        });

        socket.on('resetTimer', async () => {
            if (data.auctionState.status === 'active') {
                data.auctionState.timer = 30;
                await data.saveStateToRedis();
                io.emit('timerUpdate', data.auctionState.timer);
            }
        });

        socket.on('togglePauseTimer', () => {
            data.auctionState.isPaused = !data.auctionState.isPaused;
            broadcastAuctionUpdate();
        });

        socket.on('toggleTimerOff', async () => {
            data.auctionState.timerOff = !data.auctionState.timerOff;
            await data.saveStateToRedis();
            broadcastAuctionUpdate();
        });

        socket.on('endAuction', async ({ selectedTeamName } = {}) => {
            if (data.auctionState.status === 'active') {
                if (!selectedTeamName) {
                    socket.emit('bidError', 'Cannot sell: Please select a team to sell the player!');
                    return;
                }
                const team = data.teams.find(t => t.name === selectedTeamName);
                const validation = validateSoldAssignment(data.auctionState.currentPlayer, team, data.auctionState.currentBid);
                if (!validation.valid) {
                    socket.emit('bidError', `Cannot sell: ${validation.message}`);
                    return;
                }

                data.auctionState.highestBidder = selectedTeamName;
                data.auctionState.timer = 0;
                if (timerInterval) clearInterval(timerInterval);
                await handleAuctionEnd();
            }
        });

        socket.on('undoBid', () => {
            if (data.auctionState.status === 'active' && data.auctionState.bidHistory && data.auctionState.bidHistory.length > 0) {
                const lastBid = data.auctionState.bidHistory.pop();
                data.auctionState.currentBid = lastBid.amount;
                data.auctionState.highestBidder = lastBid.teamName;
                data.auctionState.timer = 30;
                io.emit('bidUpdate', {
                    currentBid: data.auctionState.currentBid,
                    highestBidder: data.auctionState.highestBidder
                });
                io.emit('timerUpdate', data.auctionState.timer);
            }
        });

        socket.on('forceUnsold', async () => {
            if (data.auctionState.status === 'active') {
                data.auctionState.highestBidder = null;
                data.auctionState.timer = 0;
                if (timerInterval) clearInterval(timerInterval);
                await handleAuctionEnd();
            }
        });

        socket.on('setCategoryFilter', async ({ categoryId }) => {
            data.auctionState.activeCategory = categoryId;
            await data.saveStateToRedis();
            broadcastAuctionUpdate();
        });

        socket.on('adminDataAdded', async () => {
            await data.syncWithDB();
            io.emit('dataUpdate', { teams: data.teams, players: data.players, categories: data.categories });
            broadcastAuctionUpdate();
        });
    });
};
