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
let categoriesCache = (typeof window !== 'undefined' && window.categoriesCache) ? window.categoriesCache : [];
let teamsCache = (typeof window !== 'undefined' && window.teamsCache) ? window.teamsCache : [];
let playersCache = (typeof window !== 'undefined' && window.playersCache) ? window.playersCache : [];

const formatCurrency = (amt) => {
    const units = window.auctionCurrencyUnit || '₹';
    return ['₹', '$', '€', '£'].includes(units) ? `${units}${amt.toLocaleString()}` : `${amt.toLocaleString()} ${units}`;
};

window.normalizePhotoUrl = function(url) {
    if (!url || typeof url !== 'string') return '/uploads/default-player.svg';
    url = url.trim();
    if (!url) return '/uploads/default-player.svg';
    if (url.includes('drive.google.com')) {
        const m = url.match(/[-\w]{25,}/);
        if (m) return `https://lh3.googleusercontent.com/d/${m[0]}`;
    }
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/')) return url;
    if (url.startsWith('uploads/')) return '/' + url;
    return '/uploads/' + url;
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
        if (statusOverlay) statusOverlay.classList.remove('active');
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
                historyList.innerHTML = ''; // clear it
                
                let hasBids = false;
                
                // Helper to create a bid item
                const createBidItem = (teamName, amount, isCurrent) => {
                    let teamLogoHtml = '<span style="width: 20px; height: 20px; background: rgba(255,255,255,0.1); border-radius: 2px; display: inline-block;"></span>';
                    if (teamsCache && teamName) {
                        const bidderTeam = teamsCache.find(t => t.name === teamName);
                        if (bidderTeam) {
                            if (bidderTeam.logo) {
                                teamLogoHtml = `<img src="${bidderTeam.logo}" style="width: 20px; height: 20px; border-radius: 2px; object-fit: cover;">`;
                            } else {
                                teamLogoHtml = `<span style="width: 20px; height: 20px; background: ${bidderTeam.color}; border-radius: 2px; display: inline-block;"></span>`;
                            }
                        }
                    }
                    const opacity = isCurrent ? '1' : '0.4';
                    return `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.05); opacity: ${opacity};">
                        <div style="display: flex; gap: 0.75rem; align-items: center;">
                            ${teamLogoHtml}
                            <div>
                                <div style="font-weight: 800; font-size: 0.95rem; color: #fff; text-transform: uppercase;">${teamName}</div>
                                <div style="font-size: 0.65rem; color: var(--text-muted);">${isCurrent ? 'Latest' : 'Past bid'}</div>
                            </div>
                        </div>
                        <div style="font-size: 1rem; font-weight: 800; color: #10b981;">${formatCurrency(amount)}</div>
                    </div>`;
                };
                
                // 1. Current Bid
                if (state.highestBidder) {
                    historyList.innerHTML += createBidItem(state.highestBidder, state.currentBid, true);
                    hasBids = true;
                }
                
                // 2. Past Bids (reverse so newest past bid is next)
                if (state.bidHistory && state.bidHistory.length > 0) {
                    const revHistory = [...state.bidHistory].reverse();
                    revHistory.forEach(b => {
                        if (b.teamName) {
                            historyList.innerHTML += createBidItem(b.teamName, b.amount, false);
                            hasBids = true;
                        }
                    });
                }
                
                if (!hasBids) {
                    historyList.innerHTML = '<div id="bidHistoryEmptyMsg" style="padding: 1.5rem; color: var(--text-muted); font-size: 0.85rem; font-style: italic; text-align: center;">Awaiting bids...</div>';
                }
            }
        }
        livePlayerName.textContent = state.currentPlayer.name;
        livePlayerRole.textContent = state.currentPlayer.role;
        liveBidAmount.textContent = formatCurrency(state.currentBid);
        liveHighestBidder.textContent = state.highestBidder ? state.highestBidder : 'NO BIDS YET';
        liveTimer.textContent = state.timer;
        liveTimer.style.display = state.timerOff ? 'none' : 'flex';
        currentBid = parseInt(state.currentBid, 10) || 0;
        auctionActive = state.status === 'active';
        
        // Update large logo box on page load or update
        const currentBidderLogoBox = document.getElementById('currentBidderLogoBox');
        if (currentBidderLogoBox) {
            if (state.highestBidder && teamsCache) {
                const bidderTeam = teamsCache.find(t => t.name === state.highestBidder);
                if (bidderTeam && bidderTeam.logo) {
                    currentBidderLogoBox.innerHTML = `<img src="${bidderTeam.logo}" style="width: 45px; height: 45px; border-radius: 6px; object-fit: cover;">`;
                } else if (bidderTeam) {
                    currentBidderLogoBox.innerHTML = `<span style="width: 45px; height: 45px; background: ${bidderTeam.color}; border-radius: 6px; display: inline-block;"></span>`;
                } else {
                    currentBidderLogoBox.innerHTML = '🏆';
                }
            } else {
                currentBidderLogoBox.innerHTML = '🏆';
            }
        }
        
        const navPlayerId = document.getElementById('navPlayerId');
        if (navPlayerId) {
            let p = state.currentPlayer;
            if (p) {
                let realId = p.formNo ? String(p.formNo).trim() : '';
                let shortUid = String(p.id || '--');
                if (shortUid.length > 8) shortUid = '..' + shortUid.slice(-5);
                navPlayerId.textContent = realId || shortUid;
            } else {
                navPlayerId.textContent = '--';
            }
        }
        
        const navRound = document.getElementById('navRound');
        if (navRound) navRound.textContent = state.activeCategoryName || window.auctionState.activeCategoryName || '1';
        
        // Dynamic player profile stats update & reconciliation
        let cp = state.currentPlayer;
        if (cp) {
            // Reconcile with window.playersCache to ensure all specifications/photo are fetched correctly
            if (window.playersCache && window.playersCache.length > 0) {
                const fullMatch = window.playersCache.find(p => String(p.id).trim() === String(cp.id).trim() || (p.formNo && String(p.formNo).trim() === String(cp.formNo).trim()));
                if (fullMatch) {
                    cp = Object.assign({}, fullMatch, cp);
                    if (fullMatch.photo && (!cp.photo || cp.photo === '/uploads/default-player.svg')) {
                        cp.photo = fullMatch.photo;
                    }
                }
            }

            // Normalization helper for photo URLs & error fallback
            const targetPhotoSrc = window.normalizePhotoUrl ? window.normalizePhotoUrl(cp.photo) : (cp.photo || '/uploads/default-player.svg');
            if (livePlayerPhoto) {
                livePlayerPhoto.onerror = function() {
                    this.onerror = null;
                    this.src = '/uploads/default-player.svg';
                };
                livePlayerPhoto.src = targetPhotoSrc;
            }

            // Batting (Specification 1 or Matches/Runs)
            const elStatLabel1 = document.getElementById('liveStatLabel1');
            const elMatches = document.getElementById('livePlayerMatches');
            if (cp.specification1 && String(cp.specification1).trim()) {
                if (elStatLabel1) elStatLabel1.textContent = 'BATTING';
                if (elMatches) elMatches.textContent = String(cp.specification1).trim();
            } else if (cp.matches != null && cp.matches !== '') {
                if (elStatLabel1) elStatLabel1.textContent = 'MATCHES';
                if (elMatches) elMatches.textContent = cp.matches;
            } else if (cp.runs != null && cp.runs !== '') {
                if (elStatLabel1) elStatLabel1.textContent = 'RUNS';
                if (elMatches) elMatches.textContent = cp.runs;
            } else {
                if (elStatLabel1) elStatLabel1.textContent = 'BATTING';
                if (elMatches) elMatches.textContent = '--';
            }

            // Bowling (Specification 2 or Wickets/Strike Rate)
            const elStatLabel2 = document.getElementById('liveStatLabel2');
            const elRuns = document.getElementById('livePlayerRuns');
            if (cp.specification2 && String(cp.specification2).trim()) {
                if (elStatLabel2) elStatLabel2.textContent = 'BOWLING';
                if (elRuns) elRuns.textContent = String(cp.specification2).trim();
            } else if (cp.strikeRate != null && cp.strikeRate !== '') {
                if (elStatLabel2) elStatLabel2.textContent = 'STRIKE RATE';
                if (elRuns) elRuns.textContent = cp.strikeRate;
            } else if (cp.wickets != null && cp.wickets !== '') {
                if (elStatLabel2) elStatLabel2.textContent = 'WICKETS';
                if (elRuns) elRuns.textContent = cp.wickets;
            } else {
                if (elStatLabel2) elStatLabel2.textContent = 'BOWLING';
                if (elRuns) elRuns.textContent = '--';
            }

            // Specialty / Specification 3 / Role
            const elStatLabel3 = document.getElementById('liveStatLabel3');
            const elSR = document.getElementById('livePlayerSR');
            const spec3OrDetail = cp.specification3 || cp.detail || cp.customTag;
            if (spec3OrDetail && String(spec3OrDetail).trim()) {
                if (elStatLabel3) elStatLabel3.textContent = 'SPECIALTY';
                if (elSR) elSR.textContent = String(spec3OrDetail).trim();
            } else if (cp.role && String(cp.role).trim()) {
                if (elStatLabel3) elStatLabel3.textContent = 'PLAYING ROLE';
                if (elSR) elSR.textContent = String(cp.role).trim();
            } else if (cp.strikeRate != null && cp.strikeRate !== '') {
                if (elStatLabel3) elStatLabel3.textContent = 'STRIKE RATE';
                if (elSR) elSR.textContent = cp.strikeRate;
            } else {
                if (elStatLabel3) elStatLabel3.textContent = 'PLAYING ROLE';
                if (elSR) elSR.textContent = '--';
            }

            // Kit Size or Age
            const elStatLabel4 = document.getElementById('liveStatLabel4');
            const elAvg = document.getElementById('livePlayerAvg');
            if (cp.age) {
                if (elStatLabel4) elStatLabel4.textContent = 'AGE';
                const ageStr = `${cp.age} YRS`;
                if (elAvg) elAvg.textContent = ageStr;
                if (livePlayerAge) livePlayerAge.textContent = ageStr;
            } else if (cp.tshirtSize || cp.trouserSize) {
                if (elStatLabel4) elStatLabel4.textContent = 'KIT SIZE';
                const kitStr = `${cp.tshirtSize || '--'} / ${cp.trouserSize || '--'}`;
                if (elAvg) elAvg.textContent = kitStr;
                if (livePlayerAge) livePlayerAge.textContent = kitStr;
            } else {
                if (elStatLabel4) elStatLabel4.textContent = 'AGE';
                if (elAvg) elAvg.textContent = '--';
                if (livePlayerAge) livePlayerAge.textContent = '--';
            }

            // Category Display
            const elCat = document.getElementById('liveCategoryDisplay');
            let catName = state.activeCategoryName || '';
            let catColor = '#38bdf8';
            const effectiveCats = categoriesCache && categoriesCache.length > 0 ? categoriesCache : (window.categoriesCache || []);
            if (cp.category_id && effectiveCats) {
                const catObj = effectiveCats.find(c => c.id === cp.category_id);
                if (catObj) {
                    catName = catObj.name;
                    catColor = catObj.color || '#38bdf8';
                }
            }
            if (!catName && cp.category_id) catName = cp.category_id;
            if (elCat) {
                elCat.textContent = catName || 'OPEN POOL';
                elCat.style.color = catColor;
                elCat.style.display = 'block';
            }

            // Base Price
            const elBase = document.getElementById('liveBasePriceDisplay');
            if (elBase) {
                elBase.textContent = formatCurrency(cp.basePrice || 0);
                elBase.style.display = 'block';
            }

            // Supplementary Meta bar
            const elKitMeta = document.getElementById('livePlayerKitMeta');
            if (elKitMeta) {
                if (cp.tshirtSize || cp.trouserSize) {
                    elKitMeta.textContent = `Kit: ${cp.tshirtSize || '--'} (Top) / ${cp.trouserSize || '--'} (Low)`;
                } else {
                    elKitMeta.textContent = 'Standard Kit';
                }
            }
            const elPhoneMeta = document.getElementById('livePlayerPhoneMeta');
            if (elPhoneMeta) {
                elPhoneMeta.textContent = cp.phone || '--';
            }
            const elStatusBadge = document.getElementById('livePlayerStatusBadge');
            if (elStatusBadge) {
                elStatusBadge.textContent = (cp.status || 'AVAILABLE').toUpperCase();
            }

            // Floating Form No. & Role tags on Player Image Box
            const elImgFormNo = document.getElementById('livePlayerImgFormNo');
            const elRoleIcon = document.getElementById('livePlayerRoleIcon');
            const elRoleText = document.getElementById('livePlayerRoleText');

            if (elImgFormNo) {
                let realFormNo = cp.formNo ? String(cp.formNo).trim() : (String(cp.id).length > 6 ? '..' + String(cp.id).slice(-5) : cp.id);
                elImgFormNo.textContent = realFormNo || '--';
            }

            let roleEmoji = '⚾';
            if (cp.role === 'Batsman') roleEmoji = '🏏';
            else if (cp.role === 'Bowler') roleEmoji = '🥎';
            else if (cp.role === 'All Rounder' || cp.role === 'All-Rounder') roleEmoji = '⚡';
            else if (cp.role === 'Wicket Keeper' || cp.role === 'Wicketkeeper') roleEmoji = '🧤';

            if (elRoleIcon) elRoleIcon.textContent = roleEmoji;
            if (elRoleText) elRoleText.textContent = cp.role || 'PLAYER';
        }

        // Dynamic Auction Progress update
        if (window.playersCache && window.playersCache.length > 0) {
            const totalP = window.playersCache.length;
            const completedP = window.playersCache.filter(p => p.status === 'sold' || p.status === 'unsold').length;
            const pct = Math.round((completedP / totalP) * 100);
            const elPct = document.getElementById('liveAuctionProgressPct');
            const elBar = document.getElementById('liveAuctionProgressBar');
            if (elPct) elPct.textContent = `${pct}%`;
            if (elBar) elBar.style.width = `${pct}%`;
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
        
        // Nav indicators
        const navIndSold = document.getElementById('navIndicatorSold');
        const navIndUnsold = document.getElementById('navIndicatorUnsold');
        const navIndLive = document.getElementById('navIndicatorLive');
        const navIndLiveDot = document.getElementById('navIndicatorLiveDot');
        
        // Reset nav indicators
        if (navIndSold) { navIndSold.style.background = 'rgba(255,255,255,0.05)'; navIndSold.style.borderColor = 'rgba(255,255,255,0.1)'; }
        if (navIndUnsold) { navIndUnsold.style.background = 'rgba(255,255,255,0.05)'; navIndUnsold.style.borderColor = 'rgba(255,255,255,0.1)'; }
        if (navIndLive) { navIndLive.style.background = 'rgba(255,255,255,0.05)'; navIndLive.style.borderColor = 'rgba(255,255,255,0.1)'; }
        if (navIndLiveDot) { navIndLiveDot.style.background = 'rgba(255,255,255,0.3)'; navIndLiveDot.style.boxShadow = 'none'; navIndLiveDot.style.animation = 'none'; }
        
        if (state.status === 'sold') {
            if (statusText) statusText.textContent = 'SOLD';
            if (statusText) statusText.className = 'status-text text-sold';
            if (statusOverlay) statusOverlay.classList.add('active');
            
            if (navIndSold) {
                navIndSold.style.background = 'rgba(16, 185, 129, 0.15)';
                navIndSold.style.borderColor = 'rgba(16, 185, 129, 0.4)';
            }

            // Trigger broadcast confetti celebration once per sold event
            if (state.currentPlayer && window.lastSoldPlayerCelebrated !== state.currentPlayer.id) {
                window.lastSoldPlayerCelebrated = state.currentPlayer.id;
                if (typeof window.triggerSoldConfetti === 'function') {
                    window.triggerSoldConfetti();
                }
            }
            
            // New UI
            if (playerStatusStamp) {
                const soldPrice = typeof formatCurrency === 'function' ? formatCurrency(state.currentBid) : state.currentBid;
                const teamName = state.highestBidder || 'Unknown';
                let logoHtml = '';
                if (window.teamsCache && teamName) {
                    const t = window.teamsCache.find(x => x.name === teamName);
                    if (t && t.logo) {
                        logoHtml = `<img src="${t.logo}" style="width: 35px; height: 35px; border-radius: 50%; display: block; margin: 5px auto 0; object-fit: contain; background: #fff; padding: 2px; box-shadow: 0 0 10px rgba(255,255,255,0.2);">`;
                    }
                }
                playerStatusStamp.innerHTML = `SOLD<br><div style="font-size: 1.2rem; line-height: 1.2; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.9); font-weight: 900; margin-top: 5px; background: rgba(0,0,0,0.65); padding: 8px 15px; border-radius: 8px; backdrop-filter: blur(5px);">to ${teamName}<br><span style="color: #fbbf24; font-size: 1.5rem;">${soldPrice}</span>${logoHtml}</div>`;
        
                playerStatusStamp.style.color = 'rgba(110, 231, 183, 0.95)';
                playerStatusStamp.style.textShadow = '0 0 80px rgba(16, 185, 129, 1), 0 0 30px rgba(16, 185, 129, 1)';
                playerStatusStamp.style.opacity = '1'; playerStatusStamp.style.display = 'block'; playerStatusStamp.style.zIndex = '9999';
                playerStatusStamp.style.transform = 'translate(-50%, -45%) scale(1)';
            }
            if (playerImageStatusOverlay) {
                playerImageStatusOverlay.style.background = 'rgba(16, 185, 129, 0.4)';
                playerImageStatusOverlay.style.opacity = '1';
            }
            if (bidHistoryUnsoldOverlay) bidHistoryUnsoldOverlay.style.opacity = '0';
        } else if (state.status === 'unsold') {
            window.lastSoldPlayerCelebrated = null;
            if (statusText) statusText.textContent = 'UNSOLD';
            if (statusText) statusText.className = 'status-text text-unsold';
            if (statusOverlay) statusOverlay.classList.add('active');
            
            if (navIndUnsold) {
                navIndUnsold.style.background = 'rgba(220, 38, 38, 0.15)';
                navIndUnsold.style.borderColor = 'rgba(220, 38, 38, 0.4)';
            }
            
            // New UI
            if (playerStatusStamp) {
                playerStatusStamp.textContent = 'UNSOLD';
                playerStatusStamp.style.color = 'rgba(255, 180, 180, 0.95)';
                playerStatusStamp.style.textShadow = '0 0 80px rgba(220, 38, 38, 1), 0 0 30px rgba(220, 38, 38, 1)';
                playerStatusStamp.style.opacity = '1'; playerStatusStamp.style.display = 'block'; playerStatusStamp.style.zIndex = '9999';
                playerStatusStamp.style.transform = 'translate(-50%, -45%) scale(1)';
            }
            if (playerImageStatusOverlay) {
                playerImageStatusOverlay.style.background = 'rgba(220, 38, 38, 0.4)';
                playerImageStatusOverlay.style.opacity = '1';
            }
            if (bidHistoryUnsoldOverlay) bidHistoryUnsoldOverlay.style.opacity = '1';
        } else {
            window.lastSoldPlayerCelebrated = null;
            if (statusOverlay) statusOverlay.classList.remove('active');
            
            if (navIndLive) {
                navIndLive.style.background = 'rgba(16, 185, 129, 0.15)';
                navIndLive.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                navIndLive.style.color = 'rgba(167, 243, 208, 0.95)';
                navIndLive.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.2)';
            }
            if (navIndLiveDot) {
                navIndLiveDot.style.background = '#10b981';
                navIndLiveDot.style.boxShadow = '0 0 8px #10b981, 0 0 14px rgba(16, 185, 129, 0.5)';
                navIndLiveDot.style.animation = 'liveGreenPulse 1.2s infinite ease-in-out';
            }
            
            // New UI clear
            if (playerStatusStamp) {
                playerStatusStamp.style.opacity = '0'; playerStatusStamp.style.display = 'none';
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
        
        let catName = state.activeCategoryName || '';
        let catColor = '#38bdf8';
        if (state.currentPlayer.category_id && categoriesCache) {
            const cat = categoriesCache.find(c => c.id === state.currentPlayer.category_id);
            if (cat) {
                catName = cat.name;
                catColor = cat.color || '#38bdf8';
                if (cat.baseBid && cat.baseBid > 0) {
                    calculatedBaseBid = Math.max(state.currentPlayer.basePrice || 0, cat.baseBid);
                }
            }
        }
        if (catDisplay) {
            catDisplay.textContent = catName || 'OPEN POOL';
            catDisplay.style.color = catColor;
            catDisplay.style.display = 'block';
        }
        
        if (basePriceDisplay) {
            basePriceDisplay.textContent = formatCurrency(calculatedBaseBid);
            basePriceDisplay.style.display = 'block';
        }
    } else {
        livePlayerName.textContent = 'Waiting for Admin...';
        livePlayerRole.textContent = '--';
        liveBidAmount.textContent = formatCurrency(0);
        liveHighestBidder.textContent = 'None';
        liveTimer.textContent = '30';
        liveTimer.style.display = state.timerOff ? 'none' : 'flex';
        if (statusOverlay) statusOverlay.classList.remove('active');
        auctionActive = false;
        if (livePlayerPhoto) livePlayerPhoto.src = '/uploads/default-player.svg';
        if (livePlayerAge) livePlayerAge.textContent = '--';
        const catDisplay = document.getElementById('liveCategoryDisplay');
        if (catDisplay) {
            catDisplay.textContent = '--';
            catDisplay.style.display = 'block';
        }
        const basePriceDisplay = document.getElementById('liveBasePriceDisplay');
        if (basePriceDisplay) {
            basePriceDisplay.textContent = '--';
            basePriceDisplay.style.display = 'block';
        }
        const elMatches = document.getElementById('livePlayerMatches');
        if (elMatches) elMatches.textContent = '--';
        const elRuns = document.getElementById('livePlayerRuns');
        if (elRuns) elRuns.textContent = '--';
        const elSR = document.getElementById('livePlayerSR');
        if (elSR) elSR.textContent = '--';
        const elKitMeta = document.getElementById('livePlayerKitMeta');
        if (elKitMeta) elKitMeta.textContent = '--';
        const elPhoneMeta = document.getElementById('livePlayerPhoneMeta');
        if (elPhoneMeta) elPhoneMeta.textContent = '--';
    }
    if (typeof checkBiddingValidity === 'function') {
        checkBiddingValidity();
    }
}

function flashBid() {
    if (bidDisplay) {
        bidDisplay.classList.add('highlight');
        setTimeout(() => {
            bidDisplay.classList.remove('highlight');
        }, 500);
    }
}

// Live Scrolling Footer Ticker & Sponsor Updater
window.updateLiveFooterTicker = function(state, details) {
    const s = state || window.auctionState;
    const d = details || window.auctionDetailsCache;

    // 1. Update Sponsor in Footer
    if (d) {
        const spName = d.sponsorName || 'Official Tournament Sponsor';
        const tickerSponsor1 = document.getElementById('tickerSponsorName');
        const tickerSponsor2 = document.getElementById('tickerSponsorNameClone');
        if (tickerSponsor1) tickerSponsor1.textContent = spName;
        if (tickerSponsor2) tickerSponsor2.textContent = spName;

        const sponsorContainer = document.getElementById('footerSponsorLogoContainer');
        if (sponsorContainer) {
            if (d.sponsorLogo) {
                sponsorContainer.innerHTML = `<img id="footerSponsorLogoImg" src="${d.sponsorLogo}" alt="${spName}" class="footer-sponsor-img">`;
            } else if (d.sponsorName) {
                sponsorContainer.innerHTML = `<span id="footerSponsorNameText" class="footer-sponsor-text">${d.sponsorName}</span>`;
            } else {
                sponsorContainer.innerHTML = `<span id="footerSponsorDefault" class="footer-sponsor-text">OFFICIAL SPONSOR</span>`;
            }
        }
    }

    // 2. Update Live Auction & Player Info in Ticker
    if (s) {
        const curBid = typeof formatCurrency === 'function' ? formatCurrency(s.currentBid || 0) : (s.currentBid || 0);
        const pName = s.currentPlayer ? s.currentPlayer.name : 'Waiting for host...';
        const pRole = s.currentPlayer ? (s.currentPlayer.role || '--') : '--';
        const hBidder = s.highestBidder || 'NO BIDS YET';

        const elPName1 = document.getElementById('tickerPlayerName');
        const elPName2 = document.getElementById('tickerPlayerNameClone');
        if (elPName1) elPName1.textContent = pName;
        if (elPName2) elPName2.textContent = pName;

        const elPRole1 = document.getElementById('tickerPlayerRole');
        const elPRole2 = document.getElementById('tickerPlayerRoleClone');
        if (elPRole1) elPRole1.textContent = pRole;
        if (elPRole2) elPRole2.textContent = pRole;

        const elBid1 = document.getElementById('tickerBidAmount');
        const elBid2 = document.getElementById('tickerBidAmountClone');
        if (elBid1) elBid1.textContent = curBid;
        if (elBid2) elBid2.textContent = curBid;

        const elBidder1 = document.getElementById('tickerHighestBidder');
        const elBidder2 = document.getElementById('tickerHighestBidderClone');
        if (elBidder1) elBidder1.textContent = hBidder;
        if (elBidder2) elBidder2.textContent = hBidder;
    }
};

socket.on('auctionUpdate', (state) => {
    window.auctionState = state;
    updateUI(state);
    if (bidError) bidError.textContent = '';
    if (typeof window.updateLiveFooterTicker === 'function') {
        window.updateLiveFooterTicker(state, window.auctionDetailsCache);
    }
});

socket.on('timerUpdate', (timer) => {
    liveTimer.textContent = timer;
    if (timer <= 5) {
        liveTimer.classList.add('warning');
    } else {
        liveTimer.classList.remove('warning');
    }
});

// Premium Pop Animation on Bid Update (Emerald Green Theme)
function animateBidUpdate() {
    if (!liveBidAmount) return;
    liveBidAmount.style.transition = 'none';
    liveBidAmount.style.transform = 'scale(1.22)';
    liveBidAmount.style.color = '#10b981';
    liveBidAmount.style.textShadow = '0 0 35px #10b981, 0 0 65px #34d399';
    void liveBidAmount.offsetHeight; // force reflow
    liveBidAmount.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    liveBidAmount.style.transform = 'scale(1)';
    liveBidAmount.style.color = '#10b981';
    liveBidAmount.style.textShadow = '0 0 20px rgba(16, 185, 129, 0.4)';
}

socket.on('bidUpdate', (data) => {
    liveBidAmount.textContent = formatCurrency(data.currentBid);
    liveHighestBidder.textContent = data.highestBidder;
    currentBid = parseInt(data.currentBid, 10) || 0;
    if (window.auctionState) {
        window.auctionState.currentBid = currentBid;
        window.auctionState.highestBidder = data.highestBidder;
    }
    if (typeof window.updateLiveFooterTicker === 'function') {
        window.updateLiveFooterTicker(window.auctionState, window.auctionDetailsCache);
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
        historyItem.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.3s; animation: fadeIn 0.3s ease-out forwards;';
        historyItem.innerHTML = `
            <div style="display: flex; gap: 0.75rem; align-items: center;">
                ${teamLogoHtml}
                <div>
                    <div style="font-weight: 800; font-size: 0.95rem; color: #fff; text-transform: uppercase;">${data.highestBidder}</div>
                    <div style="font-size: 0.65rem; color: var(--text-muted);">${bidTime}</div>
                </div>
            </div>
            <div style="font-size: 1rem; font-weight: 800; color: #10b981;">${formatCurrency(data.currentBid)}</div>
        `;
        historyList.prepend(historyItem);
        
        // Update the big current bidder logo box
        const currentBidderLogoBox = document.getElementById('currentBidderLogoBox');
        if (currentBidderLogoBox) {
            if (teamLogoHtml.includes('img')) {
                currentBidderLogoBox.innerHTML = teamLogoHtml.replace('20px', '45px').replace('20px', '45px');
            } else if (teamLogoHtml.includes('span')) {
                currentBidderLogoBox.innerHTML = teamLogoHtml.replace('20px', '45px').replace('20px', '45px');
            } else {
                currentBidderLogoBox.innerHTML = '🏆';
            }
        }
        
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
        const inc = parseInt(getActiveCategoryIncrement(window.auctionState), 10) || 500;
        bidAmountInput.value = (parseInt(currentBid, 10) || 0) + inc;
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
    if (typeof window.updateLiveFooterTicker === 'function') {
        window.updateLiveFooterTicker(state, window.auctionDetailsCache);
    }
});

// State tracker to persist open rosters during live dynamic updates
const expandedTeams = new Set();

window.toggleRoster = (teamName) => {
    const wasExpanded = expandedTeams.has(teamName);
    if (wasExpanded) {
        expandedTeams.delete(teamName);
    } else {
        expandedTeams.add(teamName);
    }
    const isNowExpanded = !wasExpanded;
    const cards = document.querySelectorAll(`.team-card[data-teamname="${teamName}"]`);
    cards.forEach(card => {
        const roster = card.querySelector('.team-roster-list');
        const toggleBar = card.querySelector('.team-card-toggle-bar .toggle-text');
        const count = card.dataset.rosterCount || 0;
        if (roster) {
            roster.style.display = isNowExpanded ? 'flex' : 'none';
            if (toggleBar) {
                toggleBar.textContent = isNowExpanded ? `▴ HIDE SQUAD (${count})` : `▾ VIEW SQUAD (${count})`;
            }
            if (isNowExpanded) {
                card.classList.add('team-card-expanded');
                card.style.borderColor = 'rgba(251, 191, 36, 0.4)';
            } else {
                card.classList.remove('team-card-expanded');
                card.style.borderColor = 'rgba(255, 255, 255, 0.05)';
            }
        }
    });
};

socket.on('dataUpdate', ({ teams, players, categories, auctionDetails, auctionsList }) => {
    if (auctionDetails) {
        window.auctionDetailsCache = auctionDetails;
        const sponsorContainer = document.getElementById('liveSponsorContainer');
        if (sponsorContainer) {
            if (auctionDetails.sponsorLogo) {
                sponsorContainer.innerHTML = `<img id="liveSponsorLogoImg" src="${auctionDetails.sponsorLogo}" style="max-height: 38px; max-width: 140px; object-fit: contain; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.5));">`;
            } else if (auctionDetails.sponsorName) {
                sponsorContainer.innerHTML = `<div id="liveSponsorNameText" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 0.3rem 1rem; border-radius: 4px; font-size: 0.7rem; color: #fbbf24; text-transform: uppercase; letter-spacing: 1px; font-weight: 800;">${auctionDetails.sponsorName}</div>`;
            } else {
                sponsorContainer.innerHTML = `<div id="liveSponsorDefault" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 0.3rem 1rem; border-radius: 4px; font-size: 0.65rem; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">SPONSOR</div>`;
            }
        }
    }
    if (teams) {
        teamsCache = teams;
        window.teamsCache = teams;
        const mobileTeamsCount = document.getElementById('mobileTeamsCount');
        if (mobileTeamsCount) mobileTeamsCount.textContent = teams.length;
    }
    if (players) {
        playersCache = players;
        window.playersCache = players;
        const mobilePlayersCount = document.getElementById('mobilePlayersCount');
        if (mobilePlayersCount) mobilePlayersCount.textContent = players.length;
    }
    if (categories) categoriesCache = categories;
    
    if (typeof window.updateLiveFooterTicker === 'function') {
        window.updateLiveFooterTicker(window.auctionState, window.auctionDetailsCache);
    }
    
    if (typeof renderPlayerListTable === 'function') {
        renderPlayerListTable();
    }
    
    if (typeof renderTeamViewGrid === 'function') {
        renderTeamViewGrid();
    }
    
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
                <div class="team-card" onclick="toggleRoster('${team.name}')" data-teamname="${team.name}" style="cursor: pointer; display: flex; flex-direction: column; gap: 0.6rem; background: #1a1c23; padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            ${team.logo ? `<img src="${team.logo}" style="width: 28px; height: 28px; background: #cbd5e1; padding: 2px; border-radius: 50%; object-fit: contain;">` : `<div style="width: 28px; height: 28px; background: #cbd5e1; color: #000; font-size: 0.5rem; font-weight: 900; display: flex; align-items: center; justify-content: center; border-radius: 50%;">IMG</div>`}
                            <div style="font-size: 1rem; color: #fff; font-weight: 800; text-transform: uppercase;">${team.shortName || team.name}</div>
                        </div>
                        <div style="font-size: clamp(1rem, 2vw, 1.3rem); font-weight: 900; color: #fff; text-align: right; line-height: 1.1; word-break: break-word;">${formatCurrency(team.budget)}</div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                        <div>
                            <div style="font-size: 0.55rem; color: rgba(255,255,255,0.5); text-transform: uppercase; font-weight: 800; margin-bottom: 0.1rem;">MAX BID</div>
                            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.8); font-weight: 700;">${formatCurrency(Math.max(0, team.budget - Math.max(0, ((window.auctionMaxPlayers || 25) - teamPlayers.length) * (window.auctionBaseBid || 100000))))}</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 0.55rem; color: rgba(255,255,255,0.5); text-transform: uppercase; font-weight: 800; margin-bottom: 0.1rem;">RESERVE</div>
                            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.8); font-weight: 700;">${formatCurrency(Math.max(0, ((window.auctionMaxPlayers || 25) - teamPlayers.length) * (window.auctionBaseBid || 100000)))}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 0.55rem; color: rgba(255,255,255,0.5); text-transform: uppercase; font-weight: 800; margin-bottom: 0.1rem;">PLAYERS</div>
                            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.8); font-weight: 700;">${teamPlayers.length}/${window.auctionMaxPlayers || 25}</div>
                        </div>
                    </div>
                    
                    <!-- Progress Bar Line -->
                    <div style="height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden; margin-top: 0.2rem;">
                        <div style="background: ${team.color || '#fff'}; height: 100%; width: ${Math.min(100, ((teamPlayers.length / 25) * 100))}%;"></div>
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
        const increment = parseInt(getActiveCategoryIncrement(window.auctionState), 10) || 500;
        const cur = parseInt(currentBid, 10) || 0;
        const nextBidAmt = parseInt(bidAmountInput ? bidAmountInput.value : (cur + increment), 10) || (cur + increment);
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

    const increment = parseInt(getActiveCategoryIncrement(window.auctionState), 10) || 500;
    const cur = parseInt(currentBid, 10) || 0;
    const nextBidAmt = parseInt(bidAmountInput ? bidAmountInput.value : (cur + increment), 10) || (cur + increment);
    
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

let currentLivePlayerSearchQuery = '';
let currentLivePlayerStatusFilter = 'all';

window.filterLivePlayerTable = function(query) {
    currentLivePlayerSearchQuery = (query || '').toLowerCase().trim();
    renderPlayerListTable();
};

window.setLivePlayerStatusFilter = function(status, btn) {
    currentLivePlayerStatusFilter = status || 'all';
    document.querySelectorAll('.status-filter-pill').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderPlayerListTable();
};

function updatePlayerFilterCounts() {
    const players = window.playersCache || [];
    const countAll = players.length;
    const countAvailable = players.filter(p => !p.status || p.status === 'available').length;
    const countSold = players.filter(p => p.status === 'sold').length;
    const countUnsold = players.filter(p => p.status === 'unsold').length;
    const totalSpent = players.filter(p => p.status === 'sold').reduce((sum, p) => sum + (p.soldPrice || 0), 0);

    const elAll = document.getElementById('countFilterAll');
    const elAvail = document.getElementById('countFilterAvailable');
    const elSold = document.getElementById('countFilterSold');
    const elUnsold = document.getElementById('countFilterUnsold');
    const elMobile = document.getElementById('mobilePlayersCount');

    if (elAll) elAll.textContent = countAll;
    if (elAvail) elAvail.textContent = countAvailable;
    if (elSold) elSold.textContent = countSold;
    if (elUnsold) elUnsold.textContent = countUnsold;
    if (elMobile) elMobile.textContent = countAll;

    // Slide 2 KPI Summary Chips
    const kpiAll = document.getElementById('kpiTotalPlayers');
    const kpiAvail = document.getElementById('kpiAvailablePlayers');
    const kpiSold = document.getElementById('kpiSoldPlayers');
    const kpiSpent = document.getElementById('kpiTotalSpent');

    if (kpiAll) kpiAll.textContent = countAll;
    if (kpiAvail) kpiAvail.textContent = countAvailable;
    if (kpiSold) kpiSold.textContent = countSold;
    if (kpiSpent) kpiSpent.textContent = formatCurrency(totalSpent);
}

function renderPlayerListTable() {
    const tbody = document.getElementById('playerListTableBody');
    if (!tbody || !window.playersCache) return;
    
    updatePlayerFilterCounts();
    
    const players = window.playersCache;
    const teams = window.teamsCache || [];

    if (players.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="padding: 2.5rem; text-align: center; color: rgba(255,255,255,0.4);">No players loaded in database.</td></tr>';
        return;
    }

    const filteredPlayers = players.filter(p => {
        const pStatus = (p.status || 'available').toLowerCase();
        if (currentLivePlayerStatusFilter !== 'all') {
            if (currentLivePlayerStatusFilter === 'available' && pStatus !== 'available') return false;
            if (currentLivePlayerStatusFilter === 'sold' && pStatus !== 'sold') return false;
            if (currentLivePlayerStatusFilter === 'unsold' && pStatus !== 'unsold') return false;
        }
        if (currentLivePlayerSearchQuery) {
            const name = (p.name || '').toLowerCase();
            const role = (p.role || '').toLowerCase();
            const formNo = String(p.formNo || '').toLowerCase();
            const uid = String(p.id || '').toLowerCase();
            const soldTo = String(p.soldTo || '').toLowerCase();
            const matches = name.includes(currentLivePlayerSearchQuery) ||
                            role.includes(currentLivePlayerSearchQuery) ||
                            formNo.includes(currentLivePlayerSearchQuery) ||
                            uid.includes(currentLivePlayerSearchQuery) ||
                            soldTo.includes(currentLivePlayerSearchQuery);
            if (!matches) return false;
        }
        return true;
    });

    if (filteredPlayers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="padding: 2.5rem; text-align: center; color: rgba(255,255,255,0.4); font-style: italic;">No players match the selected filter.</td></tr>';
        return;
    }
    
    let html = '';
    filteredPlayers.forEach(p => {
        let statusColor = '#fbbf24'; // available
        if (p.status === 'sold') statusColor = '#10b981';
        if (p.status === 'unsold') statusColor = '#ef4444';
        
        let teamHtml = '-';
        if (p.status === 'sold' && p.soldTo) {
            const team = teams.find(t => t.name === p.soldTo);
            const teamLogo = team && team.logo ? `<img src="${team.logo}" style="width:24px; height:24px; border-radius:50%; object-fit:contain; background:#fff; padding:2px;">` : '';
            teamHtml = `<div style="display:flex; align-items:center; gap:0.5rem;">${teamLogo} <span style="font-weight:800; color:#fff; font-size:0.85rem;">${formatCurrency(p.soldPrice || 0)}</span></div>`;
        }
        
        let roleIcon = '⚾';
        if (p.role === 'Batsman') roleIcon = '🏏';
        if (p.role === 'Bowler') roleIcon = '🥎';
        if (p.role === 'All Rounder' || p.role === 'All-Rounder') roleIcon = '⚡';
        
        let paddedId = p.id || '00';
        if (!isNaN(paddedId) && paddedId.toString().length < 3) {
            paddedId = paddedId.toString().padStart(3, '0');
        }
        let realUploadedId = p.formNo ? String(p.formNo).trim() : paddedId;
        let shortUid = String(p.id).length > 6 ? '..' + String(p.id).slice(-5) : p.id;
        
        html += `
            <tr class="clickable-player-row" onclick="openLivePlayerDetailsModal('${p.id}')" style="border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; transition: background 0.15s;">
                <td class="col-real-id" style="padding: 0.85rem 1rem;">
                    <span class="badge-real-id" style="font-weight: 900; color: #fbbf24; font-size: 1.05rem; font-family: monospace; background: rgba(251,191,36,0.1); padding: 0.25rem 0.6rem; border-radius: 6px; border: 1px solid rgba(251,191,36,0.25);">#${realUploadedId}</span>
                </td>
                <td class="col-uid" style="padding: 0.85rem 1rem;">
                    <span class="badge-uid" style="font-size: 0.75rem; color: #94a3b8; font-family: monospace; background: rgba(255,255,255,0.06); padding: 0.25rem 0.55rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);" title="DB Unique ID: ${p.id}">UID: ${shortUid}</span>
                </td>
                <td class="col-player-info" style="padding: 0.85rem 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.8rem;">
                        <img src="${p.photo || '/uploads/default-player.svg'}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.1); background: #1a1c23;">
                        <span style="color: #fff; font-weight: 800; font-size: 0.95rem;">${p.name}</span>
                    </div>
                </td>
                <td class="col-role" style="padding: 0.85rem 1rem;">
                    <div style="display: inline-flex; align-items: center; gap: 0.4rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.75rem; color: rgba(255,255,255,0.8);">
                        <span>${roleIcon}</span> ${p.role}
                    </div>
                </td>
                <td class="col-base-price" style="padding: 0.85rem 1rem; color: rgba(255,255,255,0.6); font-size: 0.85rem;">${formatCurrency(p.basePrice || 0)}</td>
                <td class="col-status" style="padding: 0.85rem 1rem; font-weight: 800; font-size: 0.85rem; color: ${statusColor}; text-transform: uppercase;">
                    ${p.status || 'available'}
                </td>
                <td class="col-sold" style="padding: 0.85rem 1rem;">
                    ${teamHtml}
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

function renderTeamViewGrid() {
    const grid = document.getElementById('teamViewGrid');
    if (!grid || !window.teamsCache || !window.playersCache) return;
    
    let html = '';
    const teams = window.teamsCache;
    const players = window.playersCache;
    const maxPlayers = window.auctionMaxPlayers || 25;
    const baseBid = window.auctionBaseBid || 100000;
    
    // Calculate total spent across all teams
    const totalSpent = players.filter(p => p.status === 'sold').reduce((sum, p) => sum + (p.soldPrice || 0), 0);
    const elTotalSpent = document.getElementById('teamViewTotalSpent');
    if (elTotalSpent) elTotalSpent.textContent = formatCurrency(totalSpent);
    
    const elSubtitle = document.getElementById('teamViewSubtitle');
    if (elSubtitle) elSubtitle.textContent = `Live roster and purse status for all ${teams.length} participating teams.`;
    
    teams.forEach((team, index) => {
        const teamPlayers = players.filter(p => p.soldTo === team.name);
        const rosterCount = teamPlayers.length;
        const reserve = Math.max(0, (maxPlayers - rosterCount) * baseBid);
        const maxBid = Math.max(0, team.budget - reserve);
        
        let logoHtml = team.logo ? `<img src="${team.logo}" style="width: 32px; height: 32px; object-fit: contain;">` : `<div style="width:32px; height:32px; background:rgba(255,255,255,0.1); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.6rem; color:#fff; font-weight:800;">IMG</div>`;
        
        const isExpanded = expandedTeams.has(team.name);
        const toggleLabel = isExpanded ? `▴ HIDE SQUAD (${rosterCount})` : `▾ VIEW SQUAD (${rosterCount})`;
        
        const rosterHTML = teamPlayers.length === 0 
            ? `<div style="font-size: 0.85rem; color: #64748b; font-style: italic; padding: 0.5rem 0; text-align: left;">No players drafted yet</div>`
            : teamPlayers.sort((a, b) => b.soldPrice - a.soldPrice).map(player => `
                <div class="team-roster-player-item" onclick="event.stopPropagation(); window.openLivePlayerDetailsModal('${player.id}')" style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); padding: 0.65rem 0.85rem; border-radius: 6px; border: 1px solid ${player.isCaptain ? 'rgba(251, 191, 36, 0.25)' : 'rgba(255,255,255,0.04)'}; margin-bottom: 0.4rem; cursor: pointer; transition: all 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='rgba(255,255,255,0.02)'">
                    <div style="display: flex; flex-direction: column; text-align: left; gap: 2px;">
                        <span style="font-size: 0.88rem; font-weight: 700; color: ${player.isCaptain ? '#fbbf24' : '#e2e8f0'};">${player.name} ${player.isCaptain ? '👑' : ''}</span>
                        <span style="font-size: 0.72rem; color: #94a3b8; text-transform: uppercase; font-weight: 600;">${player.role} • #${player.formNo || player.id}</span>
                    </div>
                    <div style="display: flex; align-items: center; text-align: right;">
                        <span style="font-size: 0.95rem; font-weight: 900; color: #10b981; font-family: 'Plus Jakarta Sans', monospace;">${formatCurrency(player.soldPrice)}</span>
                    </div>
                </div>
            `).join('');

        html += `
        <div class="team-card ${isExpanded ? 'team-card-expanded' : ''}" data-teamname="${team.name}" data-roster-count="${rosterCount}" onclick="window.toggleRoster('${team.name}')" style="cursor: pointer; background: #101115; border: 1px solid ${isExpanded ? 'rgba(251, 191, 36, 0.4)' : 'rgba(255,255,255,0.05)'}; border-radius: 8px; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; touch-action: manipulation; transition: all 0.2s ease;">
            <!-- Top row -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                ${logoHtml}
                <div style="background: rgba(255,255,255,0.05); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; color: rgba(255,255,255,0.7); font-weight: 800; font-family: monospace;">#${index + 1}</div>
            </div>
            
            <!-- Title -->
            <div style="font-size: 1.05rem; font-weight: 800; color: #fff; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${team.name}">${team.name}</div>
            
            <!-- Stats -->
            <div style="display: flex; flex-direction: column; gap: 0.6rem; font-size: 0.8rem;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: rgba(255,255,255,0.6);">Purse</span>
                    <span style="color: #fbbf24; font-weight: 800; font-size: 0.9rem;">${formatCurrency(team.budget)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: rgba(255,255,255,0.6);">Reserve</span>
                    <span style="color: #fff; font-weight: 800;">${formatCurrency(reserve)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: rgba(255,255,255,0.6);">Roster</span>
                    <span style="color: #fff; font-weight: 800;">${rosterCount}/${maxPlayers}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: rgba(255,255,255,0.6);">Max Bid</span>
                    <span style="color: #fff; font-weight: 800;">${formatCurrency(maxBid)}</span>
                </div>
            </div>
            
            <!-- Progress Line -->
            <div style="height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; margin-top: auto;">
                <div style="background: ${team.color || '#e11d48'}; height: 100%; width: ${Math.min(100, (rosterCount/maxPlayers)*100)}%;"></div>
            </div>

            <!-- Interactive Toggle Button -->
            <div class="team-card-toggle-bar" style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 0.45rem; text-align: center; color: #fbbf24; font-weight: 800; font-size: 0.72rem; letter-spacing: 0.5px; transition: all 0.2s;">
                <span class="toggle-text">${toggleLabel}</span>
            </div>
            
            <div class="team-roster-list" style="display: ${isExpanded ? 'flex' : 'none'}; flex-direction: column; margin-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1rem;">
                <div style="font-size: 0.8rem; font-weight: 800; color: rgba(255,255,255,0.5); text-transform: uppercase; margin-bottom: 0.75rem;">Drafted Players (${rosterCount})</div>
                ${rosterHTML}
            </div>
        </div>`;
    });
    
    grid.innerHTML = html;
}

window.removePlayerFromTeam = async function(playerId, playerName, teamName, soldPrice) {
    if (!playerId) return;
    const priceFormatted = soldPrice ? formatCurrency(soldPrice) : 'the amount';
    const confirmMsg = `Are you sure you want to remove ${playerName || 'this player'} from ${teamName || 'this team'}?\n\nThis will refund ${priceFormatted} back to ${teamName || 'the team'}'s purse and return the player to the available pool.`;
    if (!confirm(confirmMsg)) return;

    // Optimistic instant UI update
    if (window.playersCache) {
        const p = window.playersCache.find(x => String(x.id).trim() === String(playerId).trim() || (x.formNo && String(x.formNo).trim() === String(playerId).trim()));
        if (p) {
            p.status = 'available';
            p.soldTo = null;
            p.soldPrice = null;
        }
    }
    if (window.teamsCache) {
        const t = window.teamsCache.find(x => x.name === teamName);
        if (t) {
            t.budget = parseInt(t.budget || 0) + parseInt(soldPrice || 0);
        }
    }
    if (typeof renderTeamViewGrid === 'function') renderTeamViewGrid();
    if (typeof renderPlayerListTable === 'function') renderPlayerListTable();

    try {
        if (typeof socket !== 'undefined' && socket && socket.connected) {
            socket.emit('removePlayerFromTeam', { playerId: String(playerId) });
        }
        const res = await fetch('/api/remove-player-from-team', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId: String(playerId) })
        });
        const resData = await res.json();
        if (!resData.success && typeof socket !== 'undefined' && socket) {
            socket.emit('removePlayerFromTeam', { playerId: String(playerId) });
        }
    } catch (err) {
        console.warn('API remove fallback to socket:', err);
        if (typeof socket !== 'undefined' && socket) {
            socket.emit('removePlayerFromTeam', { playerId: String(playerId) });
        }
    }
};

window.handleRemovePlayerClick = function(btn) {
    if (!btn) return;
    const playerId = btn.getAttribute('data-player-id');
    const playerName = btn.getAttribute('data-player-name') || 'player';
    const teamName = btn.getAttribute('data-team-name') || 'team';
    const soldPrice = btn.getAttribute('data-sold-price') || '0';
    window.removePlayerFromTeam(playerId, playerName, teamName, soldPrice);
};

// Ensure it renders if we click it later
if (typeof window !== 'undefined' && window.playersCache && window.teamsCache) {
    renderPlayerListTable();
    renderTeamViewGrid();
}

if (typeof window !== 'undefined' && window.auctionState) {
    updateUI(window.auctionState);
}

if (typeof window !== 'undefined' && typeof window.updateLiveFooterTicker === 'function') {
    window.updateLiveFooterTicker(window.auctionState, window.auctionDetailsCache);
}

// Responsive adaptive layout handler for screen orientation & resize
if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
        const isMobile = window.innerWidth <= 1080;
        const navCenterHome = document.getElementById('navCenterHome');
        const navRoundTimerWrapper = document.getElementById('navRoundTimerWrapper');
        const mainGrid = document.getElementById('mainGrid');
        
        if (navCenterHome) {
            navCenterHome.style.display = isMobile ? 'none' : 'flex';
        }
        if (navRoundTimerWrapper) {
            navRoundTimerWrapper.style.display = isMobile ? 'none' : 'flex';
        }
        if (mainGrid && mainGrid.style.display !== 'none') {
            mainGrid.style.display = isMobile ? 'flex' : 'grid';
            if (!isMobile) {
                mainGrid.style.gridTemplateColumns = 'minmax(0, 1fr) minmax(0, 1.05fr) minmax(0, 1fr)';
            } else {
                mainGrid.style.gridTemplateColumns = '';
            }
        }
    });

    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 150);
    });
}

// Lightweight Broadcast Confetti Burst Animation
window.triggerSoldConfetti = function() {
    const canvas = document.getElementById('liveConfettiCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = 'block';

    const colors = ['#fbbf24', '#10b981', '#38bdf8', '#f43f5e', '#a855f7', '#f59e0b', '#ffffff'];
    const particles = [];
    const particleCount = 130;

    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: canvas.width / 2 + (Math.random() - 0.5) * (canvas.width * 0.4),
            y: canvas.height * 0.35 + (Math.random() - 0.5) * 80,
            vx: (Math.random() - 0.5) * 16,
            vy: (Math.random() * -13) - 5,
            size: Math.random() * 8 + 5,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 10,
            opacity: 1,
            decay: Math.random() * 0.007 + 0.005
        });
    }

    let start = performance.now();
    function animate(now) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let activeCount = 0;

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.38; // gravity
            p.vx *= 0.99; // drag
            p.rotation += p.rotationSpeed;
            p.opacity -= p.decay;

            if (p.opacity > 0 && p.y < canvas.height + 20) {
                activeCount++;
                ctx.save();
                ctx.globalAlpha = Math.max(0, p.opacity);
                ctx.translate(p.x, p.y);
                ctx.rotate((p.rotation * Math.PI) / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
                ctx.restore();
            }
        }

        if (activeCount > 0 && (now - start) < 4500) {
            requestAnimationFrame(animate);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.style.display = 'none';
        }
    }
    requestAnimationFrame(animate);
};

