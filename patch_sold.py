import sys

with open('views/admin/dashboard.ejs', 'r', encoding='utf-8') as f:
    content = f.read()

# Make selectedTeamName explicitly accessible from window in admin.js
# First replace the local let with a window property? Actually let's just make sure it's accessible.
# We will just rewrite the button click logic directly in the EJS.

old_btn = 'id="endAuctionBtn" class="btn"'
new_btn = 'id="endAuctionBtn" onclick="openSoldConfirmationModal(event)" class="btn"'
if new_btn not in content:
    content = content.replace(old_btn, new_btn)

script = """
<script>
window.openSoldConfirmationModal = function(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    const livePlayerName = document.getElementById('livePlayerName');
    if (livePlayerName && livePlayerName.textContent.includes('Waiting')) {
        if (typeof showToast !== 'undefined') showToast('⚠️ No player is currently loaded!', 'error');
        return;
    }
    
    // Fallback to checking the UI for selected team since selectedTeamName is a let in admin.js and might not be exposed globally.
    // Wait, in admin.js, selectedTeamName is local to the module!
    // We can extract it by checking the quickTeamSelect dropdown value, OR by checking the currently highlighted team card!
    let activeTeamName = null;
    const qSelect = document.getElementById('quickTeamSelect');
    if (qSelect && qSelect.value) {
        activeTeamName = qSelect.value;
    } else {
        // Find the active team card that has border-color var(--primary)
        const teamCards = document.querySelectorAll('.team-card');
        for (let c of teamCards) {
            if (c.style.borderColor === 'var(--primary)') {
                activeTeamName = c.getAttribute('data-teamname');
                break;
            }
        }
    }

    if (!activeTeamName) {
        if (typeof showToast !== 'undefined') showToast('⚠️ Please select a team to sell the player!', 'error');
        return;
    }

    const player = window.auctionState ? window.auctionState.currentPlayer : null;
    const bidPrice = window.auctionState ? (window.auctionState.currentBid || 0) : 0;
    const teamObj = window.currentTeamsCache ? window.currentTeamsCache.find(t => t.name === activeTeamName) : null;
    
    const txIdEl = document.getElementById('scmTxId');
    if(txIdEl) txIdEl.textContent = '#' + Math.floor(1000 + Math.random() * 9000) + 'A';
    
    const photoEl = document.getElementById('scmPlayerPhoto');
    if(photoEl) photoEl.src = (player && player.photo) ? player.photo : '/uploads/default-player.svg';
    
    const nameEl = document.getElementById('scmPlayerName');
    if(nameEl) nameEl.textContent = player ? player.name : 'Unknown Player';
    
    const roleEl = document.getElementById('scmPlayerRole');
    if(roleEl) roleEl.innerHTML = '🏏 ' + (player && player.role ? player.role : 'Player');
    
    const finalBidEl = document.getElementById('scmFinalBid');
    if(finalBidEl) finalBidEl.textContent = window.formatCurrencyLocal ? window.formatCurrencyLocal(bidPrice) : '₹' + bidPrice;
    
    const winTeamEl = document.getElementById('scmWinningTeam');
    if(winTeamEl) winTeamEl.textContent = activeTeamName;
    
    if (teamObj) {
        const teamPlayers = (window.currentPlayersDataCache || []).filter(p => p.soldTo === teamObj.name && p.status === 'sold');
        const totalSpent = teamPlayers.reduce((sum, p) => sum + (parseInt(p.soldPrice) || 0), 0);
        const remainingBeforeThisBid = teamObj.budget - totalSpent;
        const remainingAfterThisBid = remainingBeforeThisBid - bidPrice;
        
        const remainingPurseEl = document.getElementById('scmRemainingPurse');
        if(remainingPurseEl) remainingPurseEl.textContent = window.formatCurrencyLocal ? window.formatCurrencyLocal(remainingAfterThisBid) : '₹' + remainingAfterThisBid;
        
        const maxPlayers = window.auctionMaxPlayers || 15;
        const squadStatusEl = document.getElementById('scmSquadStatus');
        if(squadStatusEl) squadStatusEl.textContent = (teamPlayers.length + 1) + ' / ' + maxPlayers;
    } else {
        console.warn("Could not find teamObj for finances");
    }
    
    const modal = document.getElementById('soldConfirmationModal');
    if (modal) {
        modal.style.display = 'flex';
    }
    
    const confirmBtn = document.getElementById('scmConfirmBtn');
    if (confirmBtn) {
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        
        newConfirmBtn.addEventListener('click', () => {
            if (typeof socket !== 'undefined') {
                socket.emit('endAuction', { selectedTeamName: activeTeamName });
            }
            modal.style.display = 'none';
            if (typeof showToast !== 'undefined') showToast('🎉 Player SOLD to ' + activeTeamName + '!', 'success');
        });
    }
};
</script>
"""

if 'openSoldConfirmationModal =' not in content:
    content = content.replace('</body>', script + '\n</body>')

with open('views/admin/dashboard.ejs', 'w', encoding='utf-8') as f:
    f.write(content)
