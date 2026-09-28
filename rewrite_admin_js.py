import sys

with open('public/js/admin.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_block = """if (endAuctionBtn) {
    endAuctionBtn.addEventListener('click', () => {
        if (livePlayerName && livePlayerName.textContent.includes('Waiting')) {
            showToast('⚠️ No player is currently loaded!', 'error');
            return;
        }
        if (!selectedTeamName) {
            showToast('⚠️ Please select a team to sell the player!', 'error');
            return;
        }
        socket.emit('endAuction', { selectedTeamName });
        showToast('🎉 Player SOLD!', 'success');
    });
}"""

new_block = """if (endAuctionBtn) {
    endAuctionBtn.addEventListener('click', () => {
        if (livePlayerName && livePlayerName.textContent.includes('Waiting')) {
            showToast('⚠️ No player is currently loaded!', 'error');
            return;
        }
        if (!selectedTeamName) {
            showToast('⚠️ Please select a team to sell the player!', 'error');
            return;
        }

        // --- NEW: SOLD CONFIRMATION MODAL LOGIC ---
        const player = window.auctionState.currentPlayer;
        const bidPrice = window.auctionState.currentBid || 0;
        const teamObj = window.currentTeamsCache ? window.currentTeamsCache.find(t => t.name === selectedTeamName) : null;
        
        if (!player || !teamObj) {
            socket.emit('endAuction', { selectedTeamName });
            showToast('🎉 Player SOLD!', 'success');
            return;
        }

        // Populate Modal Fields
        document.getElementById('scmTxId').textContent = '#' + Math.floor(1000 + Math.random() * 9000) + 'A';
        document.getElementById('scmPlayerPhoto').src = player.photo || '/uploads/default-player.svg';
        document.getElementById('scmPlayerName').textContent = player.name;
        document.getElementById('scmPlayerRole').innerHTML = '🏏 ' + (player.role || 'Player');
        
        // Final Bid and Team Info
        document.getElementById('scmFinalBid').textContent = window.formatCurrencyLocal ? window.formatCurrencyLocal(bidPrice) : '₹' + bidPrice;
        document.getElementById('scmWinningTeam').textContent = teamObj.name;
        
        // Finances calculation
        const teamPlayers = window.currentPlayersDataCache.filter(p => p.soldTo === teamObj.name && p.status === 'sold');
        const totalSpent = teamPlayers.reduce((sum, p) => sum + (parseInt(p.soldPrice) || 0), 0);
        const remainingBeforeThisBid = teamObj.budget - totalSpent;
        const remainingAfterThisBid = remainingBeforeThisBid - bidPrice;
        
        document.getElementById('scmRemainingPurse').textContent = window.formatCurrencyLocal ? window.formatCurrencyLocal(remainingAfterThisBid) : '₹' + remainingAfterThisBid;
        
        const maxPlayers = window.auctionMaxPlayers || 15;
        document.getElementById('scmSquadStatus').textContent = (teamPlayers.length + 1) + ' / ' + maxPlayers;

        // Show Modal
        const modal = document.getElementById('soldConfirmationModal');
        if (modal) modal.style.display = 'flex';
        
        // Bind Confirm Button
        const confirmBtn = document.getElementById('scmConfirmBtn');
        if (confirmBtn) {
            // Remove previous listeners to prevent multiple emits
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
            
            newConfirmBtn.addEventListener('click', () => {
                socket.emit('endAuction', { selectedTeamName });
                if (modal) modal.style.display = 'none';
                showToast('🎉 Player SOLD to ' + selectedTeamName + '!', 'success');
            });
        } else {
            // Fallback
            socket.emit('endAuction', { selectedTeamName });
        }
    });
}"""

content = content.replace(old_block, new_block)

with open('public/js/admin.js', 'w', encoding='utf-8') as f:
    f.write(content)
