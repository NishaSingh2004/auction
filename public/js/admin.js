
window.calcNextMinBid = function() {
    const state = window.auctionState;
    if (!state || !state.currentPlayer) return 0;

    let catInc = null;
    if (typeof window.getActiveCategoryIncrement === 'function') {
        catInc = window.getActiveCategoryIncrement();
    }
    const defaultInc = parseInt(window.auctionBidIncreaseBy, 10) || 500;
    const increment = (catInc !== null && catInc !== undefined && catInc > 0) ? parseInt(catInc, 10) : defaultInc;

    // Check if any team has bid yet
    if (!state.highestBidder) {
        let base = parseInt(state.currentPlayer.basePrice, 10) || 0;
        if (base === 0 && window.auctionDetails && window.auctionDetails.baseBid) {
            base = parseInt(window.auctionDetails.baseBid, 10) || 0;
        }
        const current = parseInt(state.currentBid, 10) || 0;
        const startingBid = Math.max(current, base);
        return startingBid > 0 ? startingBid : increment;
    } else {
        // Highest bidder exists: next bid MUST be currentBid + increment
        const current = parseInt(state.currentBid, 10) || 0;
        return current + increment;
    }
};

window.syncManualBidInput = function() {
    const manualBidInput = document.getElementById('manualBidAmount');
    if (!manualBidInput) return;

    const nextMin = window.calcNextMinBid();
    
    // Only auto-update if the user is not actively typing a custom number in the input
    if (document.activeElement !== manualBidInput) {
        manualBidInput.value = nextMin > 0 ? nextMin : '';
    }

    window.checkManualBidValidity();
};

window.checkManualBidValidity = function() {
    const manualBidInput = document.getElementById('manualBidAmount');
    const warningContainer = document.getElementById('manualBidWarningContainer');
    const warningSpan = document.getElementById('minBidWarning');
    if (!manualBidInput) return;

    const state = window.auctionState;
    if (!state || !state.currentPlayer || state.status !== 'active') {
        if (warningContainer) warningContainer.style.display = 'none';
        return;
    }

    const nextMin = window.calcNextMinBid();
    const val = parseInt(manualBidInput.value) || 0;

    if (warningSpan) {
        warningSpan.textContent = window.formatCurrency(nextMin);
    }

    // Only show warning if user typed a value that is strictly less than nextMin
    if (manualBidInput.value.trim() !== '' && val < nextMin) {
        if (warningContainer) warningContainer.style.display = 'flex';
    } else {
        if (warningContainer) warningContainer.style.display = 'none';
    }
};

window.socket = io({ transports: ['websocket', 'polling'] });
const socket = window.socket;

window.formatCurrency = (amt) => {
    const units = window.auctionCurrencyUnit || '₹';
    return ['₹', '$', '€', '£'].includes(units) ? `${units}${amt.toLocaleString()}` : `${amt.toLocaleString()} ${units}`;
};

// Global Toast System
window.showToast = (message, type = 'success') => {
    const toast = document.createElement('div');
    toast.className = 'animate-fade-in';
    toast.style.position = 'fixed';
    toast.style.bottom = '2rem';
    toast.style.right = '2rem';
    
    // Choose colors based on type
    let gradient = 'linear-gradient(135deg, #10b981, #059669)'; // Success green
    let icon = '⚡';
    let shadow = 'rgba(16, 185, 129, 0.4)';
    
    if (type === 'error') {
        gradient = 'linear-gradient(135deg, #ef4444, #b91c1c)';
        icon = '⚠️';
        shadow = 'rgba(239, 68, 68, 0.4)';
    } else if (type === 'info') {
        gradient = 'linear-gradient(135deg, #3b82f6, #1d4ed8)';
        icon = '🛡️';
        shadow = 'rgba(59, 130, 246, 0.4)';
    } else if (type === 'warning') {
        gradient = 'linear-gradient(135deg, #f59e0b, #b45309)';
        icon = '🔸';
        shadow = 'rgba(245, 158, 11, 0.4)';
    }

    toast.style.background = gradient;
    toast.style.color = '#fff';
    toast.style.padding = '1rem 1.75rem';
    toast.style.borderRadius = '8px';
    toast.style.fontWeight = 'bold';
    toast.style.fontSize = '0.95rem';
    toast.style.boxShadow = `0 10px 25px ${shadow}`;
    toast.style.zIndex = '100000';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '0.75rem';
    toast.style.border = '1px solid rgba(255,255,255,0.1)';
    toast.innerHTML = `<span>${icon}</span> ${message}`;
    
    document.body.appendChild(toast);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
        toast.style.transition = 'all 0.5s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
};

window.syncData = () => {
    if (socket) {
        socket.emit('adminDataAdded');
        showToast('🔄 Synchronizing auction data...', 'info');
    }
};

// Add form listeners
let editingTeamId = null;
let editingPlayerId = null;

// Form submission logic with dynamic updates (no reload)
document.getElementById('addTeamForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const submitAction = document.getElementById('teamSubmitAction').value;
    
    const url = editingTeamId ? '/admin/edit-team' : '/admin/add-team';
    if (editingTeamId) {
        formData.append('teamId', editingTeamId);
    }
    
    const res = await fetch(url, {
        method: 'POST',
        body: formData
    });
    const result = await res.json();
    if(result.success) {
        if (submitAction === 'add_and_new') {
            showToast('🛡️ Franchise Saved! Ready for next.', 'info');
            e.target.reset();
            document.getElementById('logoPreview').src = '/uploads/default-player.svg';
        } else {
            showToast(editingTeamId ? '✅ Franchise Updated Successfully!' : '✅ Franchise Registered Successfully!');
            if (typeof window.resetTeamForm === 'function') {
                window.resetTeamForm();
            }
        }
        socket.emit('adminDataAdded');
    } else {
        showToast('⚠️ ' + (result.error || 'Error saving team'), 'error');
    }
});

document.getElementById('addPlayerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const submitAction = document.getElementById('playerSubmitAction').value;
    
    const url = editingPlayerId ? '/admin/edit-player' : '/admin/add-player';
    if (editingPlayerId) {
        formData.append('playerId', editingPlayerId);
    }
    
    const res = await fetch(url, {
        method: 'POST',
        body: formData
    });
    const result = await res.json();
    if(result.success) {
        if (submitAction === 'add_and_new') {
            showToast('⚡ Player Saved! Ready for next.', 'success');
            e.target.reset();
            document.getElementById('playerPhotoPreview').src = '/uploads/default-player.svg';
            if (typeof window.selectPlayingStyle === 'function') window.selectPlayingStyle('Batsman');
        } else {
            showToast(editingPlayerId ? '✅ Player Updated Successfully!' : '✅ Player Registered Successfully!');
            if (typeof window.resetPlayerForm === 'function') {
                window.resetPlayerForm();
            }
        }
        socket.emit('adminDataAdded');
    } else {
        showToast('⚠️ ' + (result.error || 'Error saving player'), 'error');
    }
});

// Real-time Form Number Check
const playerFormNoInput = document.getElementById('playerFormNoInput');
const formNoError = document.getElementById('formNoError');
if (playerFormNoInput && formNoError) {
    playerFormNoInput.addEventListener('input', () => {
        const val = playerFormNoInput.value.trim();
        if (!val) {
            formNoError.style.display = 'none';
            playerFormNoInput.style.borderColor = 'rgba(255,255,255,0.1)';
            return;
        }
        
        // Check against cache (excluding current player if editing)
        const isDuplicate = currentPlayersDataCache.some(p => String(p.formNo) === String(val) && p.id !== editingPlayerId);
        
        if (isDuplicate) {
            formNoError.style.display = 'block';
            playerFormNoInput.style.borderColor = '#ef4444';
            playerFormNoInput.setCustomValidity('Form Number already exists');
        } else {
            formNoError.style.display = 'none';
            playerFormNoInput.style.borderColor = '#10b981';
            playerFormNoInput.setCustomValidity('');
        }
    });
}

const uploadCsvForm = document.getElementById('uploadCsvForm');
if(uploadCsvForm) {
    uploadCsvForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        const fileInput = form.querySelector('input[type="file"]');
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            if (typeof showToast === 'function') showToast('Please select a file first.', 'error');
            return;
        }

        const formData = new FormData(form);
        const activeAuctionId = window.activeAuctionId || '';
        if (activeAuctionId) {
            formData.append('activeAuctionId', activeAuctionId);
        }
        const originalBtnText = submitBtn ? submitBtn.innerHTML : 'Upload File';
        
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span style="display:inline-block; margin-right:0.3rem;">⏳</span> Uploading...';
        }
        if (fileInput) fileInput.disabled = true;
        
        // Find or create progress container
        let progressContainer = form.querySelector('.upload-progress-container');
        if (!progressContainer) {
            progressContainer = document.createElement('div');
            progressContainer.className = 'upload-progress-container';
            progressContainer.style.marginTop = '0.5rem';
            progressContainer.style.background = 'rgba(255,255,255,0.05)';
            progressContainer.style.borderRadius = '4px';
            progressContainer.style.overflow = 'hidden';
            progressContainer.style.height = '6px';
            progressContainer.style.display = 'none';
            
            const progressBar = document.createElement('div');
            progressBar.className = 'upload-progress-bar';
            progressBar.style.background = 'var(--primary, #3b82f6)';
            progressBar.style.width = '0%';
            progressBar.style.height = '100%';
            progressBar.style.transition = 'width 0.1s ease';
            
            progressContainer.appendChild(progressBar);
            form.appendChild(progressContainer);
        }
        
        const progressBar = progressContainer.querySelector('.upload-progress-bar');
        progressBar.style.width = '0%';
        progressContainer.style.display = 'block';

        if (typeof showToast === 'function') {
            showToast('Uploading file...', 'info');
        }

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/admin/upload-players', true);
        
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percentComplete = Math.round((event.loaded / event.total) * 100);
                progressBar.style.width = `${percentComplete}%`;
            }
        };

        xhr.onload = function() {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
            if (fileInput) fileInput.disabled = false;
            progressContainer.style.display = 'none';

            if (xhr.status === 200) {
                try {
                    const result = JSON.parse(xhr.responseText);
                    if (result.success) {
                        form.reset();
                        socket.emit('adminDataAdded');

                        // Instantly update client cache and table
                        if (result.players && Array.isArray(result.players)) {
                            currentPlayersDataCache = result.players;
                            window.currentPlayersDataCache = result.players;
                            
                            const playersTableBody = document.querySelector('#playersTable tbody');
                            if (playersTableBody) {
                                playersTableBody.innerHTML = result.players.sort((a, b) => a.name.localeCompare(b.name)).map(player => {
                                    const cat = window.auctionCategoriesCache ? window.auctionCategoriesCache.find(c => c.id === player.category_id) : null;
                                    const catName = cat ? cat.name : 'OPEN';
                                    return `
                                        <tr style="font-size: 0.85rem;">
                                            <td style="text-align: center; vertical-align: top; padding: 0.65rem 0.5rem !important;">
                                                ${player.status === 'sold' ? `
                                                    <input type="checkbox" class="player-select-checkbox" data-id="${player.id}" onchange="updateBulkBtnState()">
                                                ` : `
                                                    <input type="checkbox" disabled style="opacity: 0.25;">
                                                `}
                                            </td>
                                            <td style="font-family: monospace; font-weight: 900; vertical-align: top; color: #fbbf24; padding: 0.65rem 0.5rem !important; font-size: 0.95rem;">
                                                #${player.formNo ? String(player.formNo).trim() : (String(player.id).length > 6 ? '..' + String(player.id).slice(-5) : player.id)}
                                            </td>
                                            <td style="font-family: monospace; font-size: 0.72rem; vertical-align: top; color: #94a3b8; padding: 0.65rem 0.5rem !important;">
                                                <span style="background: rgba(255,255,255,0.06); padding: 0.2rem 0.45rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);" title="Database UID: ${player.id}">UID: ${String(player.id).length > 6 ? '..' + String(player.id).slice(-5) : player.id}</span>
                                            </td>
                                            <td style="font-weight: 700; vertical-align: top; text-align: left; padding: 0.65rem 0.5rem !important;">
                                                ${player.name}
                                                ${player.detail ? `
                                                    <div style="font-size: 0.7rem; font-weight: normal; color: var(--text-muted); margin-top: 0.25rem; white-space: pre-wrap; line-height: 1.3; background: rgba(0,0,0,0.2); padding: 0.3rem 0.5rem; border-radius: 6px; border: 1px solid var(--border-color); font-family: monospace; max-width: 400px; max-height: 70px; overflow-y: auto; text-align: left;">${player.detail}</div>
                                                ` : ''}
                                            </td>
                                            <td style="color: var(--text-muted); vertical-align: top; text-align: left; padding: 0.65rem 0.5rem !important;">${catName}</td>
                                            <td style="color: var(--text-muted); vertical-align: top; text-align: left; padding: 0.65rem 0.5rem !important;">${player.role}</td>
                                            <td style="text-align: right; vertical-align: top; padding: 0.65rem 0.5rem !important;">
                                                <span class="badge badge-${player.status}" style="font-size: 0.65rem !important; padding: 0.15rem 0.4rem !important;">${(player.status || '').toUpperCase()}</span>
                                            </td>
                                            <td style="text-align: right; vertical-align: top; padding: 0.65rem 0.5rem !important;" onclick="event.stopPropagation();">
                                                ${player.status === 'sold' ? `
                                                    <button onclick="markPlayerUnsold('${player.id}')" class="btn" style="background: rgba(245, 158, 11, 0.12); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.2); padding: 0.3rem 0.55rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: all 0.2s; margin-right: 0.25rem;" title="Revert player to Unsold status">↩️ Unsold</button>
                                                ` : ''}
                                                <button class="btn edit-player-btn" data-id="${player.id}" data-name="${player.name}" data-role="${player.role}" data-baseprice="${player.basePrice}" data-phone="${player.phone || ''}" data-photo="${player.photo || ''}" data-formno="${player.formNo || ''}" data-age="${player.age || ''}" data-fathername="${player.fatherName || ''}" data-tagowner="${player.tagOwner || ''}" data-customtag="${player.customTag || ''}" data-specification1="${player.specification1 || ''}" data-specification2="${player.specification2 || ''}" data-specification3="${player.specification3 || ''}" data-tshirtsize="${player.tshirtSize || ''}" data-jerseyname="${player.jerseyName || ''}" data-jerseynumber="${player.jerseyNumber || ''}" data-trousersize="${player.trouserSize || ''}" data-detail="${player.detail || ''}" style="background: rgba(59, 130, 246, 0.12); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.2); padding: 0.3rem 0.55rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: all 0.2s; margin-right: 0.25rem;" title="Edit Player Details">✏️ Edit</button>
                                                <button onclick="deletePlayer('${player.id}')" class="btn btn-danger" style="padding: 0.3rem 0.55rem; font-size: 0.75rem; font-weight: 600; border-radius: 6px;" title="Delete Player Completely">🗑️ Delete</button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('');
                            }
                        }
                        
                        if (typeof showToast === 'function') {
                            showToast('Players Registered Successfully', 'success');
                        }
                        
                        let alertMsg = `Import Process Completed\n\n` +
                                       `Total rows found: ${result.total}\n` +
                                       `Successfully added: ${result.successful}\n`;
                        if (result.failed > 0) {
                            alertMsg += `Skipped (Duplicates/Missing Data): ${result.failed}\n\n` +
                                        `Note: If all rows were skipped, it usually means those players are already in your database.`;
                        }
                        alert(alertMsg);
                    } else {
                        let errorMsg = result.message || 'Error uploading file';
                        if (result.errors && result.errors.length > 0) {
                            errorMsg += '\n\n' + result.errors.join('\n');
                        }
                        if (typeof showToast === 'function') {
                            showToast(errorMsg, 'error');
                        }
                        alert(errorMsg);
                    }
                } catch (err) {
                    if (typeof showToast === 'function') {
                        showToast('Invalid response from server.', 'error');
                    }
                }
            } else {
                if (typeof showToast === 'function') {
                    showToast('Network error during file upload.', 'error');
                }
            }
        };

        xhr.onerror = function() {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
            if (fileInput) fileInput.disabled = false;
            progressContainer.style.display = 'none';
            if (typeof showToast === 'function') {
                showToast('Network error occurred.', 'error');
            }
        };

        xhr.send(formData);
    });
}

// Auction Logic
const startBtn = document.getElementById('startBtn');
const playerSelect = document.getElementById('playerSelect');
const resetTimerBtn = document.getElementById('resetTimerBtn');
const endAuctionBtn = document.getElementById('endAuctionBtn');
const unsoldBtn = document.getElementById('unsoldBtn');

const livePlayerName = document.getElementById('livePlayerName');
const livePlayerRole = document.getElementById('livePlayerRole');
const liveBidAmount = document.getElementById('liveBidAmount');
const liveHighestBidder = document.getElementById('liveHighestBidder');
const liveTimer = document.getElementById('liveTimer');
const bidDisplay = document.getElementById('bidDisplay');
const statusOverlay = document.getElementById('statusOverlay');
const statusText = document.getElementById('statusText');
const auctionStatusBadge = document.getElementById('auctionStatusBadge');

// Bidding Console State
let selectedTeamName = null;
let currentBidState = 0;

// Team Selection Synchronization
window.selectTeamForBid = function(teamName) {
    const btn = document.querySelector(`.team-tab-btn[data-teamname="${teamName}"]`);
    if (btn && btn.disabled) {
        selectedTeamName = null;
        const disp = document.getElementById('selectedTeamDisplay');
        if (disp) {
            disp.textContent = '';
            disp.style.display = 'none';
        }
        const qSelect = document.getElementById('quickTeamSelect');
        if (qSelect) qSelect.value = '';
        return;
    }
    if (selectedTeamName === teamName) {
        selectedTeamName = null;
    } else {
        selectedTeamName = teamName;
    }
    
    const disp = document.getElementById('selectedTeamDisplay');
    if (disp) {
        disp.textContent = selectedTeamName ? `Selected: ${selectedTeamName}` : '';
        disp.style.display = selectedTeamName ? 'block' : 'none';
    }
    
    const qSelect = document.getElementById('quickTeamSelect');
    if (qSelect) {
        qSelect.value = selectedTeamName || '';
    }

    // Sync quick tab button borders
    document.querySelectorAll('.team-tab-btn').forEach(btn => {
        if (selectedTeamName && btn.getAttribute('data-teamname') === selectedTeamName) {
            btn.style.border = '2px solid #34d399';
        } else {
            btn.style.border = '1px solid rgba(255,255,255,0.1)';
        }
    });

    // Sync team list card borders
    document.querySelectorAll('.team-card').forEach(card => {
        if (selectedTeamName && card.getAttribute('data-teamname') === selectedTeamName) {
            card.style.borderColor = 'var(--primary)';
            const expander = card.querySelector('.team-roster-expand');
            if (expander) expander.style.display = 'block';
        } else {
            card.style.borderColor = 'rgba(255,255,255,0.05)';
            const expander = card.querySelector('.team-roster-expand');
            if (expander) expander.style.display = 'none';
        }
    });
};

// Bind click listeners to initial team cards on page load
document.querySelectorAll('.team-card').forEach(card => {
    card.addEventListener('click', () => {
        const tName = card.getAttribute('data-teamname');
        if (window.selectTeamForBid) window.selectTeamForBid(tName);
    });
});

// Quick Bid Logic
document.querySelectorAll('.quick-bid-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const increment = parseInt(btn.getAttribute('data-increment'), 10) || 500;
        const current = parseInt(currentBidState, 10) || 0;
        const newBid = current + increment;
        socket.emit('placeBid', { teamName: selectedTeamName, bidAmount: newBid });
    });
});



if (startBtn) {
    startBtn.addEventListener('click', () => {
        const playerId = playerSelect ? playerSelect.value : null;
        if (playerId) {
            socket.emit('startAuction', { playerId });
            const opt = playerSelect.options[playerSelect.selectedIndex];
            const base = opt ? opt.getAttribute('data-base') : 0;
            currentBidState = parseInt(base, 10) || 0;
            showToast('⏳ Loading player for bidding...', 'info');
        } else {
            showToast('⚠️ Please select a player!', 'warning');
        }
    });
}

// Manual Bid Logic
const manualBidBtn = document.getElementById('manualBidBtn');
if (manualBidBtn) {
    manualBidBtn.addEventListener('click', () => {
        const input = document.getElementById('manualBidAmount');
        const rawValue = input ? input.value.trim() : '';
        const current = parseInt(currentBidState, 10) || 0;
        const nextMin = typeof window.calcNextMinBid === 'function' ? window.calcNextMinBid() : current;
        
        let amt = 0;
        if (!rawValue || rawValue === '0') {
            amt = nextMin;
        } else if (rawValue.startsWith('+')) {
            amt = current + parseInt(rawValue.substring(1), 10);
        } else if (rawValue.startsWith('-')) {
            amt = current - parseInt(rawValue.substring(1), 10);
        } else {
            amt = parseInt(rawValue, 10);
        }
        
        if (isNaN(amt) || amt <= 0) amt = nextMin;
        
        if (!currentPlayersDataCache || !currentPlayersDataCache.length) {
            showToast('⚠️ No active player.', 'warning');
            return;
        }

        if (!selectedTeamName) {
            showToast('⚠️ Please select a team first to place bid!', 'warning');
            return;
        }

        if (window.auctionState && window.auctionState.highestBidder && amt < nextMin) {
            showToast(`⚠️ Bid must be at least ${window.formatCurrency(nextMin)}!`, 'warning');
            if (input) input.value = nextMin;
            if (typeof window.checkManualBidValidity === 'function') window.checkManualBidValidity();
            return;
        }

        if (amt > 0) {
            socket.emit('placeBid', { teamName: selectedTeamName, bidAmount: amt });
            showToast(`⚡ Bid placed: ${window.formatCurrency(amt)} for ${selectedTeamName}`, 'success');
        } else {
            showToast('❌ Invalid bid amount!', 'error');
        }
    });
}

const manualBidUpBtn = document.getElementById('manualBidUpBtn');
if (manualBidUpBtn) {
    manualBidUpBtn.addEventListener('click', () => {
        const catInc = window.getActiveCategoryIncrement();
        const inc = catInc !== null ? parseInt(catInc, 10) : (parseInt(window.auctionBidIncreaseBy, 10) || 100);
        const current = parseInt(currentBidState, 10) || 0;
        const newBid = current + inc;
        socket.emit('placeBid', { teamName: selectedTeamName, bidAmount: newBid });
    });
}

const manualBidDownBtn = document.getElementById('manualBidDownBtn');
if (manualBidDownBtn) {
    manualBidDownBtn.addEventListener('click', () => {
        const catInc = window.getActiveCategoryIncrement();
        const inc = catInc !== null ? parseInt(catInc, 10) : (parseInt(window.auctionBidIncreaseBy, 10) || 100);
        const current = parseInt(currentBidState, 10) || 0;
        const newBid = Math.max(0, current - inc);
        socket.emit('placeBid', { teamName: selectedTeamName, bidAmount: newBid });
    });
}

const undoBidBtn = document.getElementById('undoBidBtn');
if(undoBidBtn) {
    undoBidBtn.addEventListener('click', () => {
        socket.emit('undoBid');
        showToast('↩️ Last bid undone', 'warning');
    });
}

// Indestructible Timer Controls Event Delegation
document.addEventListener('click', (e) => {
    const target = e.target.closest('button');
    if (!target) return;
    
    if (target.id === 'timerResetBtn' || target.id === 'resetTimerBtn') {
        socket.emit('resetTimer');
    } else if (target.id === 'timerPauseBtn') {
        socket.emit('togglePauseTimer');
    } else if (target.id === 'timerOnOffBtn') {
        socket.emit('toggleTimerOff');
    }
});

if (endAuctionBtn) {
    endAuctionBtn.addEventListener('click', (e) => {
        if (window.openSoldConfirmationModal) window.openSoldConfirmationModal(e);
    });
}
if(unsoldBtn) {
    unsoldBtn.addEventListener('click', () => {
        if (livePlayerName && livePlayerName.textContent.includes('Waiting')) {
            showToast('⚠️ No player is currently loaded!', 'error');
            return;
        }
        const currentPlayer = window.auctionState ? window.auctionState.currentPlayer : null;
        const playerDetails = currentPlayer ? ` #${currentPlayer.formNo || 'N/A'} ${currentPlayer.name}` : '';
        socket.emit('forceUnsold');
        showToast(`🚫 Unsold Player: ${playerDetails.trim()}`, 'error');
    });
}

function updateUI(state) {
    window.auctionState = state;
    if (typeof window.updateIncrementButtons === 'function') {
        window.updateIncrementButtons();
    }
    const statusBadgeEl = document.getElementById('auctionStatusBadge');
    const statusBadgeContainer = document.getElementById('auctionStatusBadgeContainer');
    const statusBadgeDot = document.getElementById('auctionStatusBadgeDot');
    if (statusBadgeEl) {
        statusBadgeEl.textContent = state.status.toUpperCase();
        if (state.status === 'active') {
            if (statusBadgeContainer) {
                statusBadgeContainer.style.background = 'rgba(16, 185, 129, 0.15)';
                statusBadgeContainer.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                statusBadgeContainer.style.color = '#10b981';
            }
            if (statusBadgeDot) {
                statusBadgeDot.style.background = '#10b981';
                statusBadgeDot.style.boxShadow = '0 0 6px #10b981';
            }
        } else {
            if (statusBadgeContainer) {
                statusBadgeContainer.style.background = 'rgba(220, 38, 38, 0.15)';
                statusBadgeContainer.style.borderColor = 'rgba(220, 38, 38, 0.3)';
                statusBadgeContainer.style.color = '#ef4444';
            }
            if (statusBadgeDot) {
                statusBadgeDot.style.background = '#ef4444';
                statusBadgeDot.style.boxShadow = 'none';
            }
        }
    }
    
    const timerToggle = document.getElementById('timerOnOffToggle');
    if(timerToggle) {
        timerToggle.checked = !state.timerOff;
    }

    const catFilter = document.getElementById('categoryFilterSelect');
    if (catFilter && state.activeCategory) {
        if (catFilter.value !== state.activeCategory) {
            catFilter.value = state.activeCategory;
            if (typeof window.updatePlayerSelectDropdown === 'function') {
                window.updatePlayerSelectDropdown();
            }
        }
    }
    
    const pSelect = document.getElementById('playerSelect');
    if (pSelect && state.currentPlayer) {
        pSelect.value = state.currentPlayer.id;
    }
    
    const livePlayerPhoto = document.getElementById('livePlayerPhoto');
    const livePlayerAge = document.getElementById('livePlayerAge');
    const livePlayerNameEl = document.getElementById('livePlayerName');
    const livePlayerRoleEl = document.getElementById('livePlayerRole');
    const liveBidAmountEl = document.getElementById('liveBidAmount');
    const liveHighestBidderEl = document.getElementById('liveHighestBidder');
    const liveTimerEl = document.getElementById('liveTimer');
    const statusOverlayEl = document.getElementById('statusOverlay');
    
    if (state.status === 'finished') {
        if (livePlayerNameEl) livePlayerNameEl.textContent = 'NO PLAYERS FOR BIDDING';
        if (livePlayerRoleEl) livePlayerRoleEl.textContent = 'All players have been successfully auctioned!';
        if (liveBidAmountEl) liveBidAmountEl.textContent = window.formatCurrency(0);
        if (liveHighestBidderEl) liveHighestBidderEl.textContent = 'None';
        if (liveTimerEl) {
            liveTimerEl.textContent = '0';
            liveTimerEl.style.display = state.timerOff ? 'none' : 'flex';
        }
        if (statusOverlayEl) statusOverlayEl.classList.remove('active');
        currentBidState = 0;
        if (livePlayerPhoto) livePlayerPhoto.src = '/uploads/default-player.svg';
        const basePriceDisplay = document.getElementById('liveBasePriceDisplay');
        if (basePriceDisplay) basePriceDisplay.style.display = 'none';
        if (livePlayerAge) livePlayerAge.textContent = 'Age: --';
        const livePlayerCaptainBadge = document.getElementById('livePlayerCaptainBadge');
        if (livePlayerCaptainBadge) livePlayerCaptainBadge.style.display = 'none';
        
        const formNoEl = document.getElementById('livePlayerFormNo');
        if (formNoEl) formNoEl.textContent = '[#--]';

        const bioDetailContainer = document.getElementById('livePlayerDetailContainer');
        const bioDetailEl = document.getElementById('bioDetail');
        if (bioDetailContainer) bioDetailContainer.style.display = 'none';
        if (bioDetailEl) bioDetailEl.textContent = '--';
    } else if (state.currentPlayer) {
        window.currentPlayerBasePrice = state.currentPlayer.basePrice || 0;
        if (livePlayerNameEl) livePlayerNameEl.textContent = state.currentPlayer.name;
        if (livePlayerRoleEl) livePlayerRoleEl.textContent = state.currentPlayer.role || '--';

        const bioDetailContainer = document.getElementById('livePlayerDetailContainer');
        const bioDetailEl = document.getElementById('bioDetail');
        if (bioDetailEl) {
            bioDetailEl.textContent = state.currentPlayer.detail || '';
            if (bioDetailContainer) {
                bioDetailContainer.style.display = state.currentPlayer.detail ? 'block' : 'none';
            }
        }
        
        const catDisplay = document.getElementById('liveCategoryDisplay');
        if (catDisplay) {
            if (state.currentPlayer.category_id && window.auctionCategoriesCache) {
                const cat = window.auctionCategoriesCache.find(c => c.id === state.currentPlayer.category_id);
                if (cat) {
                    catDisplay.textContent = cat.name;
                    catDisplay.style.borderColor = cat.color || 'var(--accent)';
                    catDisplay.style.color = cat.color || 'var(--accent)';
                    catDisplay.style.display = 'inline-block';
                    if (cat.baseBid && cat.baseBid > 0) {
                        window.currentPlayerBasePrice = Math.max(state.currentPlayer.basePrice || 0, cat.baseBid);
                    }
                } else {
                    catDisplay.style.display = 'none';
                }
            } else {
                catDisplay.style.display = 'none';
            }
        }
        
        const basePriceDisplay = document.getElementById('liveBasePriceDisplay');
        if (basePriceDisplay) {
            const basePriceVal = window.currentPlayerBasePrice || 0;
            basePriceDisplay.textContent = `Base Bid: ${window.formatCurrency(basePriceVal)}`;
            basePriceDisplay.style.display = 'inline-block';
        }
        
        if (liveBidAmountEl) liveBidAmountEl.textContent = window.formatCurrency(state.currentBid);
        if (liveHighestBidderEl) liveHighestBidderEl.textContent = state.highestBidder ? `🏆 Highest Bidder: ${state.highestBidder} (${window.formatCurrency(state.currentBid)})` : 'None';
        if (liveTimerEl) {
            liveTimerEl.textContent = state.timer;
            liveTimerEl.style.display = state.timerOff ? 'none' : 'flex';
        }
        currentBidState = parseInt(state.currentBid, 10) || 0;
        
        if (typeof window.syncManualBidInput === 'function') {
            window.syncManualBidInput();
        }
        const tempPreview = document.getElementById('tempBidPreview');
        if (tempPreview) {
            tempPreview.style.display = 'none';
        }
        
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
        
        const formNoEl = document.getElementById('livePlayerFormNo');
        if (formNoEl) formNoEl.textContent = `[#${state.currentPlayer.formNo || 'N/A'}]`;
        
        const bpEl = document.getElementById('bioBasePrice');
        if (bpEl) bpEl.textContent = window.formatCurrency(state.currentPlayer.basePrice || 0);
        
        const ageEl = document.getElementById('bioAge');
        if (ageEl) ageEl.textContent = `${state.currentPlayer.age || 'N/A'}`;
        
        const fatherEl = document.getElementById('bioFather');
        if (fatherEl) fatherEl.textContent = `${state.currentPlayer.fatherName || 'N/A'}`;
        
        const tagEl = document.getElementById('bioTag');
        if (tagEl) tagEl.textContent = `${state.currentPlayer.tagOwner || 'N/A'}`;
        
        const customEl = document.getElementById('bioCustom');
        if (customEl) customEl.textContent = `${state.currentPlayer.customTag || 'N/A'}`;
        
        const s1El = document.getElementById('bioSpec1');
        if (s1El) s1El.textContent = `${state.currentPlayer.specification1 || 'N/A'}`;
        
        const s2El = document.getElementById('bioSpec2');
        if (s2El) s2El.textContent = `${state.currentPlayer.specification2 || 'N/A'}`;
        
        const s3El = document.getElementById('bioSpec3');
        if (s3El) s3El.textContent = `${state.currentPlayer.specification3 || 'N/A'}`;
        
        const sizeEl = document.getElementById('bioSize');
        if (sizeEl) sizeEl.textContent = `${state.currentPlayer.tshirtSize || 'N/A'} / ${state.currentPlayer.trouserSize || 'N/A'}`;

        const pauseBtn = document.getElementById('timerPauseBtn');
        if (pauseBtn) {
            pauseBtn.textContent = state.isPaused ? '▶️ Resume Timer' : '⏸️ Pause Timer';
            pauseBtn.style.background = state.isPaused ? '#10b981' : '';
            pauseBtn.style.color = state.isPaused ? 'white' : '';
        }
        const onOffBtn = document.getElementById('timerOnOffBtn');
        if (onOffBtn) {
            onOffBtn.textContent = state.timerOff ? '⏰ Timer: OFF' : '⏰ Timer: ON';
            onOffBtn.style.background = state.timerOff ? '#ef4444' : '#2563eb';
        }
        
        if (state.timer <= 5 && state.status === 'active') {
            if (liveTimer) liveTimer.classList.add('warning');
        } else {
            if (liveTimer) liveTimer.classList.remove('warning');
        }

        if (state.status === 'sold') {
            if (statusText) {
                statusText.textContent = 'SOLD';
                statusText.className = 'status-text text-sold';
            }
            if (statusOverlay) statusOverlay.classList.add('active');
        } else if (state.status === 'unsold') {
            if (statusText) {
                statusText.textContent = 'UNSOLD';
                statusText.className = 'status-text text-unsold';
            }
            if (statusOverlay) statusOverlay.classList.add('active');
        } else {
            if (statusOverlay) statusOverlay.classList.remove('active');
        }
    } else {
        if (livePlayerName) livePlayerName.textContent = 'Waiting...';
        const basePriceDisplay = document.getElementById('liveBasePriceDisplay');
        if (basePriceDisplay) basePriceDisplay.style.display = 'none';
        if (livePlayerRole) livePlayerRole.textContent = '--';
        if (liveBidAmount) liveBidAmount.textContent = window.formatCurrency(0);
        if (liveHighestBidder) liveHighestBidder.textContent = 'None';
        if (liveTimer) liveTimer.textContent = '30';
        if (statusOverlay) statusOverlay.classList.remove('active');
        currentBidState = 0;
        if (livePlayerPhoto) livePlayerPhoto.src = '/uploads/default-player.svg';
        if (livePlayerAge) livePlayerAge.textContent = 'Age: --';
        const livePlayerCaptainBadge = document.getElementById('livePlayerCaptainBadge');
        if (livePlayerCaptainBadge) livePlayerCaptainBadge.style.display = 'none';
        
        const formNoEl = document.getElementById('livePlayerFormNo');
        if (formNoEl) formNoEl.textContent = '[#--]';
    }
    if (typeof window.updateTeamSelectButtons === 'function') {
        window.updateTeamSelectButtons();
    }
}

function flashBid() {
    bidDisplay.classList.add('highlight');
    setTimeout(() => {
        bidDisplay.classList.remove('highlight');
    }, 500);
}

socket.on('auctionUpdate', (state) => {
    updateUI(state);
});

socket.on('timerUpdate', (timer) => {
    const liveTimerEl = document.getElementById('liveTimer');
    if (!liveTimerEl) return;
    liveTimerEl.textContent = timer;
    if (timer <= 5) {
        liveTimerEl.classList.add('warning');
    } else {
        liveTimerEl.classList.remove('warning');
    }
});

socket.on('bidUpdate', (data) => {
    currentBidState = parseInt(data.currentBid, 10) || 0;
    if (window.auctionState) {
        window.auctionState.currentBid = currentBidState;
        window.auctionState.highestBidder = data.highestBidder;
    }
    const liveBidAmountEl = document.getElementById('liveBidAmount');
    const liveHighestBidderEl = document.getElementById('liveHighestBidder');
    if (liveBidAmountEl) liveBidAmountEl.textContent = window.formatCurrency(data.currentBid);
    if (liveHighestBidderEl) liveHighestBidderEl.textContent = data.highestBidder ? `🏆 Highest Bidder: ${data.highestBidder} (${window.formatCurrency(data.currentBid)})` : 'None';
    flashBid();

    if (typeof window.syncManualBidInput === 'function') {
        window.syncManualBidInput();
    }

    if (typeof window.updateTeamSelectButtons === 'function') {
        window.updateTeamSelectButtons();
    }
});

socket.on('bidError', (msg) => {
    if (typeof showToast === 'function') {
        showToast(`❌ ${msg}`, 'error');
    } else {
        alert(msg);
    }
    if (typeof window.syncManualBidInput === 'function') {
        window.syncManualBidInput();
    }
});

socket.on('auctionEnd', (state) => {
    updateUI(state);
});

let currentPlayersDataCache = window.currentPlayersDataCache || [];

window.getActiveCategoryIncrement = function() {
    const catFilter = document.getElementById('categoryFilterSelect');
    const selectedCatId = catFilter ? catFilter.value : 'all';
    
    let activeCatId = null;
    if (window.auctionState && window.auctionState.currentPlayer && window.auctionState.currentPlayer.category_id) {
        activeCatId = window.auctionState.currentPlayer.category_id;
    } else if (selectedCatId && selectedCatId !== 'all' && !selectedCatId.startsWith('cat_all_')) {
        activeCatId = selectedCatId;
    }

    if (activeCatId && window.auctionCategoriesCache) {
        const cat = window.auctionCategoriesCache.find(c => c.id === activeCatId);
        if (cat && cat.increment && cat.increment > 0) {
            return parseInt(cat.increment, 10);
        }
    }
    
    return null;
};

window.updateIncrementButtons = function() {
    const catInc = window.getActiveCategoryIncrement();
    const defaultInc = window.auctionBidIncreaseBy || 500;
    const finalInc = catInc !== null ? catInc : defaultInc;
    const units = window.auctionCurrencyUnit || '₹';

    const btnSingle = document.getElementById('quickBidBtnSingle');
    const btnDouble = document.getElementById('quickBidBtnDouble');
    const btnJump = document.getElementById('quickBidBtnJump');

    if (btnSingle) {
        btnSingle.setAttribute('data-increment', finalInc);
        const textDiv = btnSingle.querySelector('div:first-child');
        if (textDiv) textDiv.textContent = `+ ${window.formatCurrency(finalInc)}`;
    }
    if (btnDouble) {
        btnDouble.setAttribute('data-increment', finalInc * 2);
        const textDiv = btnDouble.querySelector('div:first-child');
        if (textDiv) textDiv.textContent = `+ ${window.formatCurrency(finalInc * 2)}`;
    }
    if (btnJump) {
        btnJump.setAttribute('data-increment', finalInc * 10);
        const textDiv = btnJump.querySelector('div:first-child');
        if (textDiv) textDiv.textContent = `+ ${window.formatCurrency(finalInc * 10)} (Jump)`;
    }
};

window.updatePlayerSelectDropdown = function() {
    const select = document.getElementById('playerSelect');
    const catFilter = document.getElementById('categoryFilterSelect');
    if (!select) return;
    if (!currentPlayersDataCache || !currentPlayersDataCache.length) return;

    const selectedCatId = catFilter ? catFilter.value : 'all';
    const currentVal = select.value;

    let filteredPlayers = currentPlayersDataCache.filter(p => p.status === 'available');

    if (selectedCatId && selectedCatId !== 'all' && !selectedCatId.startsWith('cat_all_')) {
        filteredPlayers = filteredPlayers.filter(p => p.category_id === selectedCatId);
    } else {
        filteredPlayers = filteredPlayers.filter(p => !p.category_id || p.category_id.startsWith('cat_all_'));
    }

    filteredPlayers.sort((a, b) => a.name.localeCompare(b.name));

    select.innerHTML = filteredPlayers.map(player => `
        <option value="${player.id}" data-base="${player.basePrice}" data-category="${player.category_id || ''}">${player.name} - ${window.formatCurrency(player.basePrice)}</option>
    `).join('');

    if (currentVal && filteredPlayers.some(p => p.id === currentVal)) {
        select.value = currentVal;
    }
};

function renderReleasePlayers() {
    const advPlayersContainer = document.getElementById('advancedPlayersListContainer');
    if (!advPlayersContainer) return;

    const searchInput = document.getElementById('unsoldSearchInput');
    const sortSelect = document.getElementById('unsoldSortSelect');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const cleanQuery = query.startsWith('#') ? query.slice(1) : query;
    const sortBy = sortSelect ? sortSelect.value : 'name-asc';

    let filtered = [];
    if (query !== '') {
        filtered = currentPlayersDataCache.filter(p => {
            const nameMatch = p.name.toLowerCase().includes(query);
            const formNoMatch = p.formNo && String(p.formNo).toLowerCase().includes(cleanQuery);
            return nameMatch || formNoMatch;
        });
    } else {
        filtered = currentPlayersDataCache.filter(p => p.status === 'unsold');
    }

    filtered.sort((a, b) => {
        if (sortBy === 'name-asc') {
            return a.name.localeCompare(b.name);
        } else if (sortBy === 'num-asc') {
            const numA = parseInt(a.formNo, 10);
            const numB = parseInt(b.formNo, 10);
            if (isNaN(numA) && isNaN(numB)) return String(a.formNo).localeCompare(String(b.formNo));
            if (isNaN(numA)) return 1;
            if (isNaN(numB)) return -1;
            return numA - numB;
        } else if (sortBy === 'num-desc') {
            const numA = parseInt(a.formNo, 10);
            const numB = parseInt(b.formNo, 10);
            if (isNaN(numA) && isNaN(numB)) return String(b.formNo).localeCompare(String(a.formNo));
            if (isNaN(numA)) return 1;
            if (isNaN(numB)) return -1;
            return numB - numA;
        }
        return 0;
    });

    if (filtered.length === 0) {
        advPlayersContainer.innerHTML = `<div style="font-size: 0.8rem; color: #64748b; text-align: center; padding: 2rem;">No players found.</div>`;
    } else {
        advPlayersContainer.innerHTML = filtered.map(player => {
            const cat = window.auctionCategoriesCache ? window.auctionCategoriesCache.find(c => c.id === player.category_id) : null;
            const catName = cat ? cat.name : 'OPEN';
            const units = window.auctionCurrencyUnit || '₹';
            const formattedBase = ['₹', '$', '€', '£'].includes(units) ? `${units}${player.basePrice.toLocaleString()}` : `${player.basePrice.toLocaleString()} ${units}`;
            
            let statusColor = '#94a3b8';
            if (player.status === 'sold') statusColor = '#10b981';
            else if (player.status === 'unsold') statusColor = '#ef4444';

            let actionButton = '';
            if (player.status === 'unsold') {
                actionButton = `<button onclick="resetPlayer('${player.id}')" class="btn" style="padding: 0.4rem 0.8rem; background: #6366f1; font-size: 0.75rem; border-radius: 4px; font-weight: bold; height: auto; border: none; cursor: pointer; transition: all 0.2s;">Re-auction</button>`;
            } else {
                actionButton = `<button onclick="markPlayerUnsoldDirect('${player.id}')" class="btn" style="padding: 0.4rem 0.8rem; background: #ef4444; font-size: 0.75rem; border-radius: 4px; font-weight: bold; height: auto; border: none; cursor: pointer; transition: all 0.2s;">Mark Unsold</button>`;
            }

            return `
                <div onclick="window.loadPlayerDirectFromCard('${player.id}')" style="display: flex; justify-content: space-between; align-items: center; background: #1e293b; padding: 0.6rem 1rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.03); cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='#1e293b'">
                    <div style="display: flex; flex-direction: column; text-align: left;">
                        <span style="font-weight: bold; font-size: 0.9rem; color: #fff;">#${player.formNo || 'N/A'} ${player.name}</span>
                        <div style="font-size: 0.75rem; color: #94a3b8; display: flex; gap: 0.5rem; margin-top: 0.1rem; flex-wrap: wrap;">
                            <span>Category: ${catName}</span>
                            <span>Base: ${formattedBase}</span>
                            <span style="color: ${statusColor}; font-weight: 500;">${player.status.toUpperCase()}</span>
                        </div>
                    </div>
                    <div onclick="event.stopPropagation()">
                        ${actionButton}
                    </div>
                </div>
            `;
        }).join('');
    }
}

socket.on('dataUpdate', ({ teams, players, categories }) => {
    currentPlayersDataCache = players;
    window.currentPlayersDataCache = players;
    window.currentTeamsCache = teams;
    if (categories) window.auctionCategoriesCache = categories;
    if (typeof window.updateIncrementButtons === 'function') {
        window.updateIncrementButtons();
    }

    // Update count labels
    const totTeams = document.getElementById('totalTeams');
    const totPlayers = document.getElementById('totalPlayers');
    if (totTeams) totTeams.textContent = teams.length;
    if (totPlayers) totPlayers.textContent = players.length;

    if (categories) {
        window.auctionCategoriesCache = categories;
        const catFilter = document.getElementById('categoryFilterSelect');
        if (catFilter) {
            const currentFilterVal = catFilter.value;
            const nonSystemCats = categories.filter(c => !c.id.startsWith('cat_all_'));
            catFilter.innerHTML = `<option value="all">All Categories</option>` + nonSystemCats.map(cat => `
                <option value="${cat.id}">${cat.name}</option>
            `).join('');
            if (currentFilterVal && Array.from(catFilter.options).some(o => o.value === currentFilterVal)) {
                catFilter.value = currentFilterVal;
            }
        }
    }

    // Update Dropdown List of available players
    if (typeof window.updatePlayerSelectDropdown === 'function') {
        window.updatePlayerSelectDropdown();
    }
    if (typeof window.refreshManualPlayerSelector === 'function') {
        window.refreshManualPlayerSelector();
    }

    // Update Left team list UI
    const teamList = document.getElementById('teamList');
    if (teamList) {
        teamList.innerHTML = teams.sort((a, b) => a.name.localeCompare(b.name)).map((team, index) => {
            const teamPlayers = players.filter(p => p.soldTo === team.name);
            const maxPlayers = window.auctionMaxPlayers || 15;
            const baseBid = window.auctionBaseBid || 500;
            const purseLeft = team.budget;
            const slotsLeft = maxPlayers - teamPlayers.length;
            const defaultBaseBid = window.auctionBaseBid || 1000;
            const currentCatId = window.auctionState && window.auctionState.currentPlayer ? window.auctionState.currentPlayer.category_id : null;

            let categoryRemaining = 0;
            let categoryBudgetNeeded = 0;
            let currentCatNeeds = 0;
            let currentCatBaseBid = defaultBaseBid;

            const isActiveCategoryAll = !window.auctionState || 
                                        !window.auctionState.activeCategory || 
                                        window.auctionState.activeCategory === 'all' || 
                                        window.auctionState.activeCategory.startsWith('cat_all_');

            if (window.auctionCategoriesCache && !isActiveCategoryAll) {
                window.auctionCategoriesCache.forEach(cat => {
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

            let reservePoints = 0;
            let maxBid = purseLeft;

            if (slotsLeft > 0) {
                if (isCategoryBid) {
                    const categoryBudgetNeededAfter = categoryBudgetNeeded - currentCatBaseBid;
                    const normalSlotsNeeded = slotsLeft - categoryRemaining;
                    const normalBudgetNeeded = Math.max(0, normalSlotsNeeded) * defaultBaseBid;
                    reservePoints = categoryBudgetNeededAfter + normalBudgetNeeded;
                    maxBid = purseLeft - reservePoints;
                } else {
                    const normalSlotsNeeded = slotsLeft - 1 - categoryRemaining;
                    const normalBudgetNeeded = Math.max(0, normalSlotsNeeded) * defaultBaseBid;
                    reservePoints = categoryBudgetNeeded + normalBudgetNeeded;
                    maxBid = purseLeft - reservePoints;
                }
            }

            maxBid = Math.max(0, Math.min(purseLeft, maxBid));
            const isSelected = selectedTeamName === team.name;
            const borderStyle = isSelected ? 'border: 1px solid var(--primary);' : 'border: 1px solid rgba(255,255,255,0.05);';
            const formatCurrency = (amt) => ['₹', '$', '€', '£'].includes(window.auctionCurrencyUnit) ? `${window.auctionCurrencyUnit}${amt.toLocaleString()}` : `${amt.toLocaleString()} ${window.auctionCurrencyUnit}`;
            return `
                <div class="team-card" data-teamname="${team.name}" style="padding: 0.75rem 1rem; background: #1e293b; ${borderStyle} border-radius: 6px; cursor: pointer; transition: all 0.2s;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="font-size: 0.8rem; color: #64748b; font-weight: bold;">${index + 1}.</span>
                            ${team.logo ? `<img src="${team.logo}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.1);">` : `<span style="background-color: ${team.color}; width: 14px; height: 14px; border-radius: 4px; display: inline-block;"></span>`}
                            <span style="font-weight: 600; font-size: 0.95rem; color: #f1f5f9;">${team.name}</span>
                        </div>
                        <span style="font-weight: bold; color: #10b981; font-size: 0.95rem;">${formatCurrency(team.budget)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: #94a3b8;">
                        <div style="display: flex; flex-direction: column; gap: 0.2rem;">
                            <span>Purse: ${formatCurrency(team.budget)}</span>
                            <span style="color: #fbbf24;">Reserve: ${formatCurrency(reservePoints)}</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 0.2rem; align-items: flex-end;">
                            <span style="background: rgba(255,255,255,0.05); padding: 0.1rem 0.4rem; border-radius: 4px; color: #cbd5e1; height: fit-content; font-size: 0.7rem;">Ply: ${teamPlayers.length}/${maxPlayers}</span>
                            <span style="color: #60a5fa; font-weight: bold; font-size: 0.75rem;">Max Bid: ${formatCurrency(maxBid)}</span>
                        </div>
                    </div>
                    <div class="team-roster-expand" style="display: ${isSelected ? 'block' : 'none'}; margin-top: 1rem; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.8rem;">
                        <div style="font-size: 0.75rem; color: #34d399; font-weight: bold; margin-bottom: 0.5rem; text-transform: uppercase;">Team Roster</div>
                        ${teamPlayers.length === 0 ? '<div style="font-size: 0.7rem; color: #64748b; font-style: italic;">No players bought yet.</div>' : ''}
                        <div style="display: flex; flex-direction: column; gap: 0.3rem;">
                            ${teamPlayers.map(p => `
                                <div style="display: flex; justify-content: space-between; font-size: 0.75rem; background: rgba(0,0,0,0.2); padding: 0.3rem 0.5rem; border-radius: 4px;">
                                    <span style="color: #e2e8f0;">${p.name}</span>
                                    <span style="color: #10b981;">${formatCurrency(p.soldPrice || 0)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Re-attach team click events since we rebuilt the elements
        document.querySelectorAll('.team-card').forEach(card => {
            card.addEventListener('click', () => {
                const tName = card.getAttribute('data-teamname');
                if (window.selectTeamForBid) window.selectTeamForBid(tName);
            });
        });
    }

    // Update advanced players list (re-auction / release pool)
    renderReleasePlayers();

    // Update adjustBudgetTeamSelect select dropdown
    const adjustBudgetSelect = document.getElementById('adjustBudgetTeamSelect');
    if (adjustBudgetSelect) {
        const currentVal = adjustBudgetSelect.value;
        adjustBudgetSelect.innerHTML = `<option value="" disabled selected style="background: #181a24; color: #94a3b8;">Select Franchise</option>` + teams.sort((a, b) => a.name.localeCompare(b.name)).map(team => `
            <option value="${team.name}" style="background: #181a24; color: #ffffff;">${team.name}</option>
        `).join('');
        if (currentVal) adjustBudgetSelect.value = currentVal;
    }

    // Update quickTeamSelect dropdown options
    const qSelect = document.getElementById('quickTeamSelect');
    if (qSelect) {
        const currentQVal = qSelect.value;
        qSelect.innerHTML = `<option value="" style="background: #181a24; color: #94a3b8; font-weight: 700;">SELECT TEAM</option>` + teams.sort((a, b) => a.name.localeCompare(b.name)).map(team => `
            <option value="${team.name}" style="background: #181a24; color: #ffffff; font-weight: 700;">${team.shortName || team.name}</option>
        `).join('');
        if (currentQVal) qSelect.value = currentQVal;
    }

    // Refresh Modal: Teams Table
    const teamsTableBody = document.querySelector('#teamsTable tbody');
    if (teamsTableBody) {
        teamsTableBody.innerHTML = teams.map(team => {
            const teamPlayers = players.filter(p => p.soldTo === team.name);
            return `
                <tr onclick="toggleAdminRoster('${team.name}')" style="border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.9rem; color: #e2e8f0; cursor: pointer; transition: background 0.15s;">
                    <td style="padding: 0.75rem 1rem;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            ${team.logo ? `<img src="${team.logo}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.15);">` : `<span style="background-color: ${team.color}; width: 14px; height: 14px; border-radius: 4px; display: inline-block;"></span>`}
                            <span style="font-weight: 600;">${team.name}</span>
                            <span class="admin-toggle-arrow" style="font-size: 0.8rem; color: #64748b; margin-left: 0.2rem;">▾</span>
                        </div>
                    </td>
                    <td style="padding: 0.75rem 1rem; color: #94a3b8;">${team.shortName || '--'}</td>
                    <td style="padding: 0.75rem 1rem; text-align: center;"><span style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold; border: 1px solid rgba(59, 130, 246, 0.25);">Key ${team.shortcutKey || '--'}</span></td>
                    <td style="padding: 0.75rem 1rem; text-align: right; font-weight: 700; color: #10b981;">${formatCurrency(team.budget)}</td>
                    <td style="padding: 0.75rem 1rem; text-align: right;">
                        <button type="button" class="btn edit-team-btn" data-id="${team.id}" data-name="${team.name}" data-shortname="${team.shortName || ''}" data-shortcutkey="${team.shortcutKey || ''}" data-budget="${team.budget}" data-color="${team.color}" data-logo="${team.logo || ''}" style="background: rgba(59, 130, 246, 0.12); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.25); padding: 0.35rem 0.65rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 600; margin-right: 0.4rem;" title="Edit Franchise Details">✏️ Edit</button>
                        <button type="button" onclick="deleteTeam('${team.id}')" class="btn" style="background: rgba(239, 68, 68, 0.12); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.25); padding: 0.35rem 0.65rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 600;" title="Delete Franchise Team">🗑️ Delete</button>
                    </td>
                </tr>
                <tr class="admin-roster-row" id="admin-roster-${team.name.replace(/\s+/g, '-')}" style="display: none; background: rgba(0,0,0,0.25);">
                    <td colspan="5" style="padding: 1.2rem 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <div style="display: flex; flex-direction: column; gap: 0.6rem;">
                            <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: bold; margin-bottom: 0.4rem; display: flex; justify-content: space-between; align-items: center;">
                                <span>SQUAD ROSTER & TEAM CAPTAIN AUTHORITY</span>
                                <span style="font-size: 0.75rem; text-transform: none; font-weight: normal; color: #fbbf24;">★ Click a player to nominate them as Captain</span>
                            </div>
                            ${teamPlayers.length === 0 ? `<div style="font-size: 0.8rem; color: #64748b; font-style: italic; text-align: left; padding: 0.2rem 0;">No players drafted to this franchise yet.</div>` : `
                                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.75rem;">
                                    ${teamPlayers.sort((a, b) => b.soldPrice - a.soldPrice).map(player => `
                                        <div onclick="nominateCaptain('${player.id}', '${team.name}')" class="captain-card-option" style="display: flex; justify-content: space-between; align-items: center; background: ${player.isCaptain ? 'rgba(251, 191, 36, 0.12)' : 'rgba(255,255,255,0.01)'}; padding: 0.6rem 0.8rem; border-radius: 6px; border: 1px solid ${player.isCaptain ? 'rgba(251, 191, 36, 0.4)' : 'rgba(255,255,255,0.04)'}; cursor: pointer; transition: all 0.2s;">
                                            <div style="display: flex; align-items: center; gap: 0.6rem;">
                                                <img src="${player.photo ? player.photo : '/uploads/default-player.svg'}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1.5px solid ${player.isCaptain ? '#fbbf24' : 'rgba(255,255,255,0.1)'};">
                                                <div style="display: flex; flex-direction: column; text-align: left;">
                                                    <span style="font-size: 0.85rem; font-weight: 600; color: ${player.isCaptain ? '#fbbf24' : '#f8fafc'};">
                                                        ${player.name} ${player.isCaptain ? '👑' : ''}
                                                    </span>
                                                    <span style="font-size: 0.7rem; color: #94a3b8;">${player.role}</span>
                                                </div>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                <span style="font-size: 0.85rem; font-weight: bold; color: #10b981;">${formatCurrency(player.soldPrice)}</span>
                                                <button type="button" onclick="event.stopPropagation(); window.removePlayerFromTeam('${player.id}', '${player.name.replace(/'/g, "\\'")}', '${team.name.replace(/'/g, "\\'")}', '${player.soldPrice}')" class="btn" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35); padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 800; cursor: pointer; transition: all 0.2s;" title="Remove player from ${team.name}">✕ Remove</button>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            `}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Refresh Modal: Players Table
    const playersTableBody = document.querySelector('#playersTable tbody');
    if (playersTableBody) {
        playersTableBody.innerHTML = players.sort((a, b) => a.name.localeCompare(b.name)).map(player => {
            const cat = window.auctionCategoriesCache ? window.auctionCategoriesCache.find(c => c.id === player.category_id) : null;
            const catName = cat ? cat.name : 'OPEN';
            return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.9rem; color: #e2e8f0;">
                    <td style="padding: 0.75rem 1rem; vertical-align: top;">
                        ${player.status === 'sold' ? `
                            <input type="checkbox" class="player-select-checkbox" data-id="${player.id}" onchange="updateBulkBtnState()">
                        ` : `
                            <input type="checkbox" disabled style="opacity: 0.3;">
                        `}
                    </td>
                    <td style="padding: 0.75rem 1rem; font-family: monospace; font-weight: 900; vertical-align: top; color: #fbbf24; font-size: 0.95rem;">
                        #${player.formNo ? String(player.formNo).trim() : (String(player.id).length > 6 ? '..' + String(player.id).slice(-5) : player.id)}
                    </td>
                    <td style="padding: 0.75rem 1rem; font-family: monospace; font-size: 0.72rem; vertical-align: top; color: #94a3b8;">
                        <span style="background: rgba(255,255,255,0.06); padding: 0.2rem 0.45rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);" title="Database UID: ${player.id}">UID: ${String(player.id).length > 6 ? '..' + String(player.id).slice(-5) : player.id}</span>
                    </td>
                    <td style="padding: 0.75rem 1rem; font-weight: 600; vertical-align: top;">
                        ${player.name}
                        ${player.detail ? `
                            <div style="font-size: 0.75rem; font-weight: normal; color: #94a3b8; margin-top: 0.4rem; white-space: pre-wrap; line-height: 1.4; background: rgba(0,0,0,0.15); padding: 0.4rem 0.6rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.05); font-family: monospace; max-width: 450px; max-height: 100px; overflow-y: auto; text-align: left;">${player.detail}</div>
                        ` : ''}
                    </td>
                    <td style="padding: 0.75rem 1rem; color: #94a3b8; font-size: 0.85rem; vertical-align: top;">${catName}</td>
                    <td style="padding: 0.75rem 1rem; color: #94a3b8; font-size: 0.85rem; vertical-align: top;">${player.role}</td>
                    <td style="padding: 0.75rem 1rem; text-align: right; vertical-align: top;">
                        <span class="badge badge-${player.status}" style="padding: 0.25rem 0.6rem; border-radius: 4px; font-weight: bold; font-size: 0.7rem;">${player.status.toUpperCase()}</span>
                    </td>
                    <td style="padding: 0.75rem 1rem; text-align: right; vertical-align: top;">
                        ${player.status === 'sold' ? `
                            <button onclick="markPlayerUnsold('${player.id}')" class="btn" style="background: rgba(245, 158, 11, 0.12); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.25); padding: 0.35rem 0.65rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 600; margin-right: 0.4rem;" title="Revert player to Unsold status">↩️ Unsold</button>
                        ` : ''}
                        <button class="btn edit-player-btn" data-id="${player.id}" data-name="${player.name}" data-role="${player.role}" data-baseprice="${player.basePrice}" data-phone="${player.phone || ''}" data-photo="${player.photo || ''}" data-formno="${player.formNo || ''}" data-age="${player.age || ''}" data-fathername="${player.fatherName || ''}" data-tagowner="${player.tagOwner || ''}" data-customtag="${player.customTag || ''}" data-specification1="${player.specification1 || ''}" data-specification2="${player.specification2 || ''}" data-specification3="${player.specification3 || ''}" data-tshirtsize="${player.tshirtSize || ''}" data-jerseyname="${player.jerseyName || ''}" data-jerseynumber="${player.jerseyNumber || ''}" data-trousersize="${player.trouserSize || ''}" data-detail="${player.detail || ''}" style="background: rgba(59, 130, 246, 0.12); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.25); padding: 0.35rem 0.65rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 600; margin-right: 0.4rem;" title="Edit Player Details">✏️ Edit</button>
                        <button onclick="deletePlayer('${player.id}')" class="btn" style="background: rgba(239, 68, 68, 0.12); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.25); padding: 0.35rem 0.65rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 600;" title="Delete Player Completely">🗑️ Delete</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Refresh Modal: Categories List
    const modalCategoryList = document.getElementById('modalCategoryList');
    if (modalCategoryList && categories) {
        modalCategoryList.innerHTML = categories.map(cat => {
            const catPlayers = cat.id.startsWith('cat_all_')
                ? players.filter(p => p.status === 'sold')
                : players.filter(p => p.category_id === cat.id && p.status === 'sold');
            const totalSold = catPlayers.reduce((sum, p) => sum + (p.soldPrice || 0), 0);
            const soldCount = catPlayers.length;
            const avgPrice = soldCount > 0 ? (totalSold / soldCount) : 0;
            const currency = window.auctionCurrencyUnit || '₹';
            
            const minPlayers = cat.id.startsWith('cat_all_') ? (window.auctionMinPlayers || 0) : (cat.minPlayers || 0);
            const maxPlayers = cat.id.startsWith('cat_all_') ? (window.auctionMaxPlayers || 0) : (cat.maxPlayers || 0);
            const baseBid = cat.id.startsWith('cat_all_') ? (window.auctionBaseBid || 0) : (cat.baseBid || 0);
            
            return `
                <div class="list-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.8rem; background: rgba(0,0,0,0.3); border-radius: 6px; border-left: 4px solid ${cat.color}; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="display: flex; flex-direction: column; gap: 0.2rem;">
                        <span style="font-weight: bold; font-size: 0.95rem; color: #fff;">${cat.name}</span>
                        <div style="font-size: 0.75rem; color: #94a3b8; display: flex; flex-wrap: wrap; gap: 0.2rem 0.8rem;">
                            <span>Min/Max: ${minPlayers}/${maxPlayers}</span>
                            <span>Base Bid: ${currency}${baseBid.toLocaleString()}</span>
                            <span style="color: #60a5fa; font-weight: 600;">Avg Price: ${currency}${Math.round(avgPrice).toLocaleString()}</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button type="button" class="btn edit-category-btn" data-id="${cat.id}" data-name="${cat.name}" data-maxplayers="${maxPlayers}" data-minplayers="${minPlayers}" data-basebid="${baseBid}" data-increment="${cat.increment}" data-reservebid="${cat.reservebid || cat.reserveBid || 0}" data-highestbidperplayer="${cat.highestBidPerPlayer}" data-categoryhighestbidall="${cat.categoryHighestBidAll}" data-color="${cat.color}" style="background: rgba(59, 130, 246, 0.12); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.25); padding: 0.35rem 0.65rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer; transition: all 0.2s; font-weight: 600;" title="Edit Category Details">✏️ Edit</button>
                        ${!cat.id.startsWith('cat_all_') ? `<button type="button" onclick="deleteCategory('${cat.id}')" class="btn btn-danger" style="padding: 0.35rem 0.65rem; font-size: 0.8rem;">DELETE</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }
    if (typeof window.updateTeamSelectButtons === 'function') {
        window.updateTeamSelectButtons();
    }
});

// Advanced form and click listeners
const adjustBudgetForm = document.getElementById('adjustBudgetForm');
if (adjustBudgetForm) {
    adjustBudgetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const teamName = formData.get('teamName');
        const rawAmt = parseInt(formData.get('amount')) || 0;
        
        const isDeduct = formData.get('actionType') === 'deduct';
        const amount = isDeduct ? -rawAmt : rawAmt;
        
        const res = await fetch('/admin/adjust-budget', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teamName, amount })
        });
        const result = await res.json();
        if(result.success) {
            e.target.reset();
            socket.emit('adminDataAdded');
            showToast('Budget adjusted successfully!');
        } else {
            showToast('Error adjusting budget', 'error');
        }
    });
}

window.resetPlayer = async (playerId) => {
    if (confirm('Are you sure you want to release this player back into the auction pool? This will refund any spent budgets if they were sold.')) {
        const res = await fetch('/admin/reset-player', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId })
        });
        const result = await res.json();
        if (result.success) {
            socket.emit('adminDataAdded');
            showToast('Player released back to pool', 'info');
        }
    }
};

const masterResetBtn = document.getElementById('masterResetBtn');
if (masterResetBtn) {
    masterResetBtn.addEventListener('click', async () => {
        if (confirm('⚠️ WARNING: This will completely reset all team budgets back to dynamic points, release all sold/unsold players back into the pool, and reset the live console. This cannot be undone! Are you absolutely sure?')) {
            const res = await fetch('/admin/reset-all', {
                method: 'POST'
            });
            const result = await res.json();
            if (result.success) {
                socket.emit('adminDataAdded');
                showToast('Auction reset completed!', 'warning');
                document.getElementById('dataModal').style.display = 'none';
            }
        }
    });
}

const clearAllDataBtn = document.getElementById('clearAllDataBtn');
if (clearAllDataBtn) {
    clearAllDataBtn.addEventListener('click', async () => {
        if (confirm('🚨 CRITICAL WARNING: This will completely delete all registered teams and all players from the database. This action is irreversible and all your registered rosters will be lost. Are you absolutely sure?')) {
            const res = await fetch('/admin/clear-all-data', {
                method: 'POST'
            });
            const result = await res.json();
            if (result.success) {
                socket.emit('adminDataAdded');
                showToast('All data deleted forever.', 'error');
                document.getElementById('dataModal').style.display = 'none';
                location.reload();
            }
        }
    });
}

const clearAllPlayersBtn = document.getElementById('clearAllPlayersBtn');
if (clearAllPlayersBtn) {
    clearAllPlayersBtn.addEventListener('click', async () => {
        if (confirm('🗑️ Are you sure you want to permanently delete all registered players? This will also clear all active auction boards. This action is irreversible!')) {
            const res = await fetch('/admin/clear-all-players', {
                method: 'POST'
            });
            const result = await res.json();
            if (result.success) {
                socket.emit('adminDataAdded');
                showToast('All player records deleted.', 'error');
                document.getElementById('dataModal').style.display = 'none';
                location.reload();
            }
        }
    });
}

const clearAllTeamsBtn = document.getElementById('clearAllTeamsBtn');
if (clearAllTeamsBtn) {
    clearAllTeamsBtn.addEventListener('click', async () => {
        if (confirm('🗑️ Are you sure you want to permanently delete all registered franchise teams? This will release all sold players back to available pool. This action is irreversible!')) {
            const res = await fetch('/admin/clear-all-teams', {
                method: 'POST'
            });
            const result = await res.json();
            if (result.success) {
                socket.emit('adminDataAdded');
                showToast('All franchise records deleted.', 'error');
                document.getElementById('dataModal').style.display = 'none';
                location.reload();
            }
        }
    });
}

window.deleteTeam = async (teamId) => {
    if (confirm('Are you absolutely sure you want to delete this franchise? All players signed to this franchise will be released back into the available pool.')) {
        const res = await fetch('/admin/delete-team', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teamId })
        });
        const result = await res.json();
        if (result.success) {
            socket.emit('adminDataAdded');
            showToast('Franchise deleted.', 'error');
        }
    }
};

window.deletePlayer = async (playerId) => {
    if (confirm('Are you sure you want to delete this player from the registry completely?')) {
        const res = await fetch('/admin/delete-player', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId })
        });
        const result = await res.json();
        if (result.success) {
            socket.emit('adminDataAdded');
            showToast('Player deleted from registry.', 'error');
        }
    }
};

window.markPlayerUnsold = async (playerId) => {
    const player = currentPlayersDataCache.find(p => p.id === playerId);
    const playerDetails = player ? ` #${player.formNo || 'N/A'} ${player.name}` : '';
    if (confirm(`Are you sure you want to revert${playerDetails} back to Unsold status and refund the team budget?`)) {
        const res = await fetch('/admin/mark-unsold', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId })
        });
        const result = await res.json();
        if (result.success) {
            socket.emit('adminDataAdded');
            showToast(`Unsold Player: ${playerDetails.trim()}`, 'warning');
        }
    }
};

window.markPlayerUnsoldDirect = async (playerId) => {
    const player = currentPlayersDataCache.find(p => p.id === playerId);
    const playerDetails = player ? ` #${player.formNo || 'N/A'} ${player.name}` : '';
    const res = await fetch('/admin/mark-unsold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId })
    });
    const result = await res.json();
    if (result.success) {
        socket.emit('adminDataAdded');
        showToast(`Unsold Player: ${playerDetails.trim()}`, 'warning');
    }
};

window.loadPlayerDirect = (player) => {
    if (!player) return;
    socket.emit('startAuction', { playerId: player.id });
    currentBidState = parseInt(player.basePrice) || 0;
    if (player.category_id && window.auctionCategoriesCache) {
        const cat = window.auctionCategoriesCache.find(c => c.id === player.category_id);
        if (cat && cat.baseBid && cat.baseBid > 0) {
            currentBidState = Math.max(currentBidState, parseInt(cat.baseBid));
        }
    }
    showToast(`⏳ Loading player #${player.formNo || 'N/A'} ${player.name} for bidding...`, 'info');
};

window.loadPlayerFromSearch = (playerId) => {
    const player = currentPlayersDataCache.find(p => p.id === playerId);
    if (!player) return;
    window.loadPlayerDirect(player);
    const input = document.getElementById('quickUnsoldInput');
    const preview = document.getElementById('quickUnsoldPreview');
    if (input) input.value = '';
    if (preview) {
        preview.style.display = 'none';
        preview.innerHTML = '';
    }
};

window.handleQuickUnsoldKeydown = (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        const preview = document.getElementById('quickUnsoldPreview');
        if (preview && preview.style.display !== 'none') {
            const firstItem = preview.querySelector('.search-result-item');
            if (firstItem) {
                const playerId = firstItem.getAttribute('data-id');
                if (playerId) {
                    window.loadPlayerFromSearch(playerId);
                }
            }
        }
    }
};

window.updateQuickUnsoldSearch = () => {
    const input = document.getElementById('quickUnsoldInput');
    const preview = document.getElementById('quickUnsoldPreview');
    if (!input || !preview) return;

    const query = input.value.trim().toLowerCase();
    if (!query) {
        preview.style.display = 'none';
        preview.innerHTML = '';
        return;
    }

    const norm = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanQuery = norm(query);

    let matches = currentPlayersDataCache.filter(p => {
        return norm(p.id) === cleanQuery ||
               (p.formNo && norm(p.formNo) === cleanQuery) ||
               (p.jerseyNumber && norm(p.jerseyNumber) === cleanQuery) ||
               norm(p.name).includes(cleanQuery);
    });

    if (matches.length === 0) {
        preview.style.display = 'block';
        preview.innerHTML = `<div style="padding: 0.8rem; color: #ef4444; font-size: 0.85rem; text-align: center;">No player found</div>`;
        return;
    }

    matches.sort((a, b) => {
        const aFormNorm = norm(a.formNo);
        const bFormNorm = norm(b.formNo);
        if (aFormNorm === cleanQuery && bFormNorm !== cleanQuery) return -1;
        if (bFormNorm === cleanQuery && aFormNorm !== cleanQuery) return 1;
        return a.name.localeCompare(b.name);
    });

    const topMatches = matches.slice(0, 5);

    preview.style.display = 'block';
    preview.innerHTML = topMatches.map((player, idx) => {
        let statusColor = '#94a3b8'; // available
        if (player.status === 'sold') statusColor = '#10b981'; // green
        else if (player.status === 'unsold') statusColor = '#ef4444'; // red

        const activeBg = idx === 0 ? 'background: rgba(255,255,255,0.08);' : '';

        return `
            <div class="search-result-item" data-id="${player.id}" onclick="window.loadPlayerFromSearch('${player.id}')" style="padding: 0.6rem 0.8rem; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s; text-align: left; ${activeBg}" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='${idx === 0 ? 'rgba(255,255,255,0.08)' : 'transparent'}'">
                <div style="font-weight: bold; color: #fff; font-size: 0.9rem;">#${player.formNo || 'N/A'} ${player.name}</div>
                <div style="font-size: 0.75rem; color: #94a3b8; display: flex; justify-content: space-between; margin-top: 0.15rem;">
                    <span>Role: ${player.role || 'N/A'}</span>
                    <span style="color: ${statusColor}; font-weight: bold;">${player.status.toUpperCase()}</span>
                </div>
            </div>
        `;
    }).join('');
};

window.loadPlayerDirectFromCard = (playerId) => {
    const player = currentPlayersDataCache.find(p => p.id === playerId);
    if (player) {
        window.loadPlayerDirect(player);
    }
};

window.toggleAdminRoster = (teamName) => {
    const idSafe = teamName.replace(/\s+/g, '-');
    const row = document.getElementById(`admin-roster-${idSafe}`);
    if (row) {
        const isHidden = row.style.display === 'none' || !row.style.display;
        row.style.display = isHidden ? 'table-row' : 'none';
        
        const parentRow = row.previousElementSibling;
        if (parentRow) {
            const arrow = parentRow.querySelector('.admin-toggle-arrow');
            if (arrow) arrow.textContent = isHidden ? '▴' : '▾';
        }
    }
};

window.nominateCaptain = async (playerId, teamName) => {
    if (confirm(`Do you want to appoint this player as the official Team Captain of ${teamName}?`)) {
        const res = await fetch('/admin/assign-captain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId })
        });
        const result = await res.json();
        if (result.success) {
            socket.emit('adminDataAdded');
            showToast(`Captain Nominated for ${teamName}!`, 'info');
            localStorage.setItem('expandedAdminTeam', teamName);
            // location.reload(); // Removed for dynamic update
        }
    }
};

// Auto-expand last expanded team and preserve modal state after reload
const initAdminDashboard = () => {
    // Click delegation for Franchise/Player Edit buttons to bypass inline HTML/EJS parsing linter warnings
    document.addEventListener('click', (e) => {
        const teamBtn = e.target.closest('.edit-team-btn');
        if (teamBtn) {
            e.stopPropagation();
            const dataset = teamBtn.dataset;
            if (typeof window.startEditTeam === 'function') {
                window.startEditTeam({
                    id: dataset.id,
                    name: dataset.name,
                    shortName: dataset.shortname,
                    shortcutKey: dataset.shortcutkey,
                    budget: parseInt(dataset.budget) || 0,
                    color: dataset.color,
                    logo: dataset.logo
                });
            }
            return;
        }

        const playerBtn = e.target.closest('.edit-player-btn');
        if (playerBtn) {
            e.stopPropagation();
            const dataset = playerBtn.dataset;
            if (typeof window.startEditPlayer === 'function') {
                window.startEditPlayer({
                    id: dataset.id,
                    name: dataset.name,
                    role: dataset.role,
                    basePrice: parseInt(dataset.baseprice) || 0,
                    phone: dataset.phone,
                    photo: dataset.photo,
                    formNo: dataset.formno,
                    age: dataset.age,
                    fatherName: dataset.fathername,
                    tagOwner: dataset.tagowner,
                    customTag: dataset.customtag,
                    specification1: dataset.specification1,
                    specification2: dataset.specification2,
                    specification3: dataset.specification3,
                    tshirtSize: dataset.tshirtsize,
                    jerseyName: dataset.jerseyname,
                    jerseyNumber: dataset.jerseynumber,
                    trouserSize: dataset.trousersize,
                    detail: dataset.detail
                });
            }
            return;
        }

        const catBtn = e.target.closest('.edit-category-btn');
        if (catBtn) {
            e.stopPropagation();
            const dataset = catBtn.dataset;
            if (typeof window.startEditCategory === 'function') {
                window.startEditCategory({
                    id: dataset.id,
                    name: dataset.name,
                    maxPlayers: parseInt(dataset.maxplayers) || 0,
                    minPlayers: parseInt(dataset.minplayers) || 0,
                    baseBid: parseInt(dataset.basebid) || 0,
                    increment: parseInt(dataset.increment) || 0,
                    reserveBid: parseInt(dataset.reservebid) || 0,
                    highestBidPerPlayer: parseInt(dataset.highestbidperplayer) || 0,
                    categoryHighestBidAll: parseInt(dataset.categoryhighestbidall) || 0,
                    color: dataset.color
                });
            }
            return;
        }
    });

    const keepModal = localStorage.getItem('keepDataModalOpen');
    if (keepModal === 'true') {
        localStorage.removeItem('keepDataModalOpen');
        const modal = document.getElementById('dataModal');
        if (modal) modal.style.display = 'flex';
        
        // Restore active modal tab if cached
        const keepTab = localStorage.getItem('keepDataModalTab');
        if (keepTab && window.switchModalTab) {
            window.switchModalTab(keepTab);
        }
    }
    
    // Check if we should show a player added toast notification
    const showToast = localStorage.getItem('showPlayerAddedToast');
    if (showToast === 'true') {
        localStorage.removeItem('showPlayerAddedToast');
        
        // Render a gorgeous floating toast notification
        const toast = document.createElement('div');
        toast.className = 'animate-fade-in';
        toast.style.position = 'fixed';
        toast.style.bottom = '2rem';
        toast.style.right = '2rem';
        toast.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        toast.style.color = '#fff';
        toast.style.padding = '1rem 1.75rem';
        toast.style.borderRadius = '8px';
        toast.style.fontWeight = 'bold';
        toast.style.fontSize = '0.95rem';
        toast.style.boxShadow = '0 10px 25px rgba(16, 185, 129, 0.4)';
        toast.style.zIndex = '100000';
        toast.style.display = 'flex';
        toast.style.alignItems = 'center';
        toast.style.gap = '0.75rem';
        toast.style.border = '1px solid rgba(255,255,255,0.1)';
        toast.innerHTML = `<span>⚡</span> Player Saved Successfully! Form ready for next entry.`;
        
        document.body.appendChild(toast);
        
        // Remove toast after 4 seconds with fadeout effect
        setTimeout(() => {
            toast.style.transition = 'all 0.5s ease';
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 500);
        }, 4000);
    }

    // Check if we should show a team added toast notification
    const showTeamToast = localStorage.getItem('showTeamAddedToast');
    if (showTeamToast === 'true') {
        localStorage.removeItem('showTeamAddedToast');
        
        // Render a gorgeous floating toast notification
        const toast = document.createElement('div');
        toast.className = 'animate-fade-in';
        toast.style.position = 'fixed';
        toast.style.bottom = '2rem';
        toast.style.right = '2rem';
        toast.style.background = 'linear-gradient(135deg, #3b82f6, #1d4ed8)';
        toast.style.color = '#fff';
        toast.style.padding = '1rem 1.75rem';
        toast.style.borderRadius = '8px';
        toast.style.fontWeight = 'bold';
        toast.style.fontSize = '0.95rem';
        toast.style.boxShadow = '0 10px 25px rgba(59, 130, 246, 0.4)';
        toast.style.zIndex = '100000';
        toast.style.display = 'flex';
        toast.style.alignItems = 'center';
        toast.style.gap = '0.75rem';
        toast.style.border = '1px solid rgba(255,255,255,0.1)';
        toast.innerHTML = `<span>🛡️</span> Team Saved Successfully! Form ready for next entry.`;
        
        document.body.appendChild(toast);
        
        // Remove toast after 4 seconds with fadeout effect
        setTimeout(() => {
            toast.style.transition = 'all 0.5s ease';
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 500);
        }, 4000);
    }
    
    const lastExpanded = localStorage.getItem('expandedAdminTeam');
    if (lastExpanded) {
        localStorage.removeItem('expandedAdminTeam');
        setTimeout(() => {
            window.toggleAdminRoster(lastExpanded);
        }, 150);
    }

    const catFilter = document.getElementById('categoryFilterSelect');
    if (catFilter) {
        catFilter.addEventListener('change', () => {
            const val = catFilter.value;
            socket.emit('setCategoryFilter', { categoryId: val });
            if (typeof window.updatePlayerSelectDropdown === 'function') {
                window.updatePlayerSelectDropdown();
            }
            if (typeof window.updateIncrementButtons === 'function') {
                window.updateIncrementButtons();
            }
        });
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminDashboard);
} else {
    initAdminDashboard();
}

window.startEditTeam = (team) => {
    editingTeamId = team.id;
    
    // Change form title
    const titleElement = document.querySelector('#addTeamForm').previousElementSibling;
    if (titleElement) {
        titleElement.innerHTML = `<span style="color: #60a5fa;">✏️</span> Edit Franchise: ${team.name}`;
    }
    
    // Populate form fields
    const form = document.getElementById('addTeamForm');
    form.querySelector('[name="name"]').value = team.name;
    form.querySelector('[name="shortName"]').value = team.shortName;
    form.querySelector('[name="shortcutKey"]').value = team.shortcutKey;
    form.querySelector('[name="color"]').value = team.color;
    
    // Set logo preview if available
    if (team.logo) {
        document.getElementById('logoPreview').src = team.logo;
        document.getElementById('logoPreview').style.opacity = '1';
    } else {
        document.getElementById('logoPreview').src = '/uploads/default-player.svg';
        document.getElementById('logoPreview').style.opacity = '0.4';
    }
    
    // Update button text to emphasize EDIT mode
    const saveNewBtn = document.getElementById('saveNewTeamBtn');
    const addTeamBtn = document.getElementById('addTeamBtn');
    if (saveNewBtn) saveNewBtn.style.display = 'none'; // hide rapid-add button during edit
    if (addTeamBtn) {
        addTeamBtn.textContent = 'UPDATE FRANCHISE';
        addTeamBtn.className = 'btn';
        addTeamBtn.style.background = '#10b981'; // beautiful green for edit success!
    }
    
    // Append a "CANCEL EDIT" button if not already present
    let cancelBtn = form.querySelector('#cancelTeamEditBtn');
    if (!cancelBtn) {
        cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.id = 'cancelTeamEditBtn';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.style.width = '100%';
        cancelBtn.style.marginTop = '0.5rem';
        cancelBtn.style.background = 'rgba(255,255,255,0.05)';
        cancelBtn.style.color = '#94a3b8';
        cancelBtn.style.border = '1px solid rgba(255,255,255,0.1)';
        cancelBtn.textContent = 'CANCEL EDIT';
        cancelBtn.onclick = () => window.resetTeamForm();
        form.appendChild(cancelBtn);
    }
    
    // Scroll the form container smoothly to focus the admin's attention
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window.resetTeamForm = () => {
    editingTeamId = null;
    const form = document.getElementById('addTeamForm');
    form.reset();
    
    // Reset title
    const titleElement = form.previousElementSibling;
    if (titleElement) {
        titleElement.innerHTML = `<span style="color: #60a5fa;">🛡️</span> Add New Franchise`;
    }
    
    // Reset preview
    document.getElementById('logoPreview').src = '/uploads/default-player.svg';
    document.getElementById('logoPreview').style.opacity = '0.4';
    
    // Restore button styles
    const saveNewBtn = document.getElementById('saveNewTeamBtn');
    const addTeamBtn = document.getElementById('addTeamBtn');
    if (saveNewBtn) saveNewBtn.style.display = 'block';
    if (addTeamBtn) {
        addTeamBtn.textContent = 'ADD TEAM';
        addTeamBtn.className = 'btn btn-secondary';
        addTeamBtn.style.background = '';
    }
    
    // Remove cancel button
    const cancelBtn = form.querySelector('#cancelTeamEditBtn');
    if (cancelBtn) cancelBtn.remove();
};

window.startEditPlayer = (player) => {
    editingPlayerId = player.id;
    
    // Change form title
    const titleElement = document.querySelector('#addPlayerForm').querySelector('h3');
    if (titleElement) {
        titleElement.innerHTML = `<span style="color: #60a5fa;">✏️</span> Edit Player: ${player.name}`;
    }
    
    // Populate fields
    const form = document.getElementById('addPlayerForm');
    form.querySelector('[name="name"]').value = player.name;
    form.querySelector('[name="basePrice"]').value = player.basePrice;
    form.querySelector('[name="phone"]').value = player.phone;
    form.querySelector('[name="formNo"]').value = player.formNo;
    form.querySelector('[name="age"]').value = player.age;
    form.querySelector('[name="fatherName"]').value = player.fatherName;
    form.querySelector('[name="tagOwner"]').value = player.tagOwner;
    form.querySelector('[name="customTag"]').value = player.customTag;
    form.querySelector('[name="specification1"]').value = player.specification1;
    form.querySelector('[name="specification2"]').value = player.specification2;
    form.querySelector('[name="specification3"]').value = player.specification3;
    form.querySelector('[name="tshirtSize"]').value = player.tshirtSize;
    form.querySelector('[name="jerseyName"]').value = player.jerseyName;
    form.querySelector('[name="jerseyNumber"]').value = player.jerseyNumber;
    form.querySelector('[name="trouserSize"]').value = player.trouserSize;
    form.querySelector('[name="detail"]').value = player.detail;
    
    // Update playing style selection circles
    if (typeof window.selectPlayingStyle === 'function') {
        window.selectPlayingStyle(player.role);
    }
    
    // Photo preview
    if (player.photo) {
        document.getElementById('playerPhotoPreview').src = player.photo;
    } else {
        document.getElementById('playerPhotoPreview').src = '/uploads/default-player.svg';
    }

    // Swap button titles
    const saveNewBtn = document.getElementById('saveNewPlayerBtn');
    const addPlayerBtn = document.getElementById('addPlayerBtn');
    if (saveNewBtn) saveNewBtn.style.display = 'none';
    if (addPlayerBtn) {
        addPlayerBtn.textContent = 'UPDATE PLAYER';
        addPlayerBtn.className = 'btn';
        addPlayerBtn.style.background = '#10b981';
    }
    
    // Cancel button
    let cancelBtn = form.querySelector('#cancelPlayerEditBtn');
    if (!cancelBtn) {
        cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.id = 'cancelPlayerEditBtn';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.style.width = '100%';
        cancelBtn.style.background = 'rgba(255,255,255,0.05)';
        cancelBtn.style.color = '#94a3b8';
        cancelBtn.style.border = '1px solid rgba(255,255,255,0.1)';
        cancelBtn.textContent = 'CANCEL EDIT';
        cancelBtn.onclick = () => window.resetPlayerForm();
        
        // Let's insert cancel button after the buttons container
        const btnContainer = form.querySelector('div[style*="display: flex; gap: 1rem;"]');
        if (btnContainer) {
            btnContainer.parentNode.insertBefore(cancelBtn, btnContainer.nextSibling);
        } else {
            form.appendChild(cancelBtn);
        }
    }
    
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window.resetPlayerForm = () => {
    editingPlayerId = null;
    const form = document.getElementById('addPlayerForm');
    form.reset();
    
    // Reset title
    const titleElement = form.querySelector('h3');
    if (titleElement) {
        titleElement.innerHTML = `<span style="color: #60a5fa;">👤</span> Register New Player`;
    }
    
    // Reset style selection circle visuals by calling default style (Batsman)
    if (typeof window.selectPlayingStyle === 'function') {
        window.selectPlayingStyle('Batsman');
    }
    
    // Reset photo preview
    document.getElementById('playerPhotoPreview').src = '/uploads/default-player.svg';
    
    // Restore button styles
    const saveNewBtn = document.getElementById('saveNewPlayerBtn');
    const addPlayerBtn = document.getElementById('addPlayerBtn');
    if (saveNewBtn) saveNewBtn.style.display = 'block';
    if (addPlayerBtn) {
        addPlayerBtn.textContent = 'ADD PLAYER';
        addPlayerBtn.className = 'btn btn-secondary';
        addPlayerBtn.style.background = '';
    }
    
    // Remove cancel button
    const cancelBtn = form.querySelector('#cancelPlayerEditBtn');
    if (cancelBtn) cancelBtn.remove();
};

// Form submit handler for updating Auction Details
const updateAuctionForm = document.getElementById('updateAuctionForm');
if (updateAuctionForm) {
    updateAuctionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        try {
            const res = await fetch('/admin/update-auction-details', {
                method: 'POST',
                body: formData
            });
            const result = await res.json();
            if (result.success) {
                localStorage.setItem('keepDataModalOpen', 'true');
                localStorage.setItem('keepDataModalTab', 'auction');
                localStorage.setItem('keepInnerAuctionTab', 'list');
                window.location.reload();
            } else {
                if (typeof showToast === 'function') {
                    showToast('⚠️ Error: ' + (result.error || 'Failed to update'), 'error');
                } else {
                    alert('⚠️ Error: ' + (result.error || 'Failed to update'));
                }
            }
        } catch (err) {
            console.error(err);
            if (typeof showToast === 'function') {
                showToast('⚠️ Network Error!', 'error');
            } else {
                alert('⚠️ Network Error!');
            }
        }
    });
}

document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.select-auction-btn');
    if (!btn) return;
    
    try {
        const res = await fetch('/admin/select-auction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ auctionId: btn.dataset.id })
        });
        const data = await res.json();
        if (data.success) {
            localStorage.setItem('keepDataModalOpen', 'true');
            localStorage.setItem('keepDataModalTab', 'auction');
            localStorage.setItem('keepInnerAuctionTab', 'list');
            window.location.reload();
        } else {
            alert('Error selecting auction');
        }
    } catch (err) {
        console.error(err);
        alert('Network Error');
    }
});

// ================== CATEGORIES LOGIC ==================
const addCategoryForm = document.getElementById('addCategoryForm');
if (addCategoryForm) {
    addCategoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(addCategoryForm);
        const data = Object.fromEntries(fd.entries());
        const action = document.getElementById('categorySubmitAction').value;
        const endpoint = data.id ? '/admin/edit-category' : '/admin/add-category';
        
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (result.success) {
                showToast(data.id ? 'Category updated!' : 'Category added!', 'success');
                if (typeof window.resetCategoryForm === 'function') {
                    window.resetCategoryForm();
                } else {
                    addCategoryForm.reset();
                }
                if (action === 'add_and_new') {
                    document.getElementById('categorySubmitAction').value = 'add'; 
                }
            } else {
                showToast(result.message || 'Error saving category', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Error connecting to server', 'error');
        }
    });
}

window.deleteCategory = async function(id) {
    if(!confirm('Are you sure you want to delete this category? This will remove the category from all assigned players.')) return;
    
    try {
        const res = await fetch('/admin/delete-category', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const result = await res.json();
        if (result.success) {
            showToast('Category deleted', 'success');
        } else {
            showToast(result.message || 'Error deleting category', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Error connecting to server', 'error');
    }
};

let editingCategoryId = null;

window.startEditCategory = (cat) => {
    editingCategoryId = cat.id;
    
    // Change form title
    const titleElement = document.querySelector('#addCategoryForm').previousElementSibling;
    if (titleElement) {
        titleElement.innerHTML = `<span style="color: #60a5fa;">✏️</span> Edit Category: ${cat.name}`;
    }
    
    // Populate form fields
    const form = document.getElementById('addCategoryForm');
    form.querySelector('[name="id"]').value = cat.id;
    form.querySelector('[name="name"]').value = cat.name;
    form.querySelector('[name="maxPlayers"]').value = cat.maxPlayers || 0;
    form.querySelector('[name="minPlayers"]').value = cat.minPlayers || 0;
    form.querySelector('[name="baseBid"]').value = cat.baseBid || 0;
    form.querySelector('[name="increment"]').value = cat.increment || 0;
    form.querySelector('[name="reserveBid"]').value = cat.reserveBid || 0;
    form.querySelector('[name="highestBidPerPlayer"]').value = cat.highestBidPerPlayer || 0;
    form.querySelector('[name="categoryHighestBidAll"]').value = cat.categoryHighestBidAll || 0;
    form.querySelector('[name="color"]').value = cat.color || '#ffffff';
    
    // Update button text
    const saveNewBtn = document.getElementById('saveNewCategoryBtn');
    const addCategoryBtn = document.getElementById('addCategoryBtn');
    if (saveNewBtn) saveNewBtn.style.display = 'none';
    if (addCategoryBtn) {
        addCategoryBtn.textContent = 'UPDATE CATEGORY';
        addCategoryBtn.className = 'btn';
        addCategoryBtn.style.background = '#10b981';
    }
    
    // Cancel button
    let cancelBtn = form.querySelector('#cancelCategoryEditBtn');
    if (!cancelBtn) {
        cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.id = 'cancelCategoryEditBtn';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.style.width = '100%';
        cancelBtn.style.marginTop = '0.5rem';
        cancelBtn.style.background = 'rgba(255,255,255,0.05)';
        cancelBtn.style.color = '#94a3b8';
        cancelBtn.style.border = '1px solid rgba(255,255,255,0.1)';
        cancelBtn.textContent = 'CANCEL EDIT';
        cancelBtn.onclick = () => window.resetCategoryForm();
        form.appendChild(cancelBtn);
    }
};

window.resetCategoryForm = () => {
    editingCategoryId = null;
    const form = document.getElementById('addCategoryForm');
    form.reset();
    form.querySelector('[name="id"]').value = '';
    
    // Reset title
    const titleElement = form.previousElementSibling;
    if (titleElement) {
        titleElement.innerHTML = `<span style="color: #60a5fa;">📁</span> Add New Category`;
    }
    
    // Restore buttons
    const saveNewBtn = document.getElementById('saveNewCategoryBtn');
    const addCategoryBtn = document.getElementById('addCategoryBtn');
    if (saveNewBtn) saveNewBtn.style.display = 'block';
    if (addCategoryBtn) {
        addCategoryBtn.textContent = 'ADD CATEGORY';
        addCategoryBtn.className = 'btn btn-secondary';
        addCategoryBtn.style.background = '';
    }
    
    const cancelBtn = form.querySelector('#cancelCategoryEditBtn');
    if (cancelBtn) cancelBtn.remove();
};

// Dynamic Temporary Bid Preview Helper
function updateTempBidPreview() {
    const input = document.getElementById('manualBidAmount');
    let preview = document.getElementById('tempBidPreview');
    const bidDisplay = document.getElementById('bidDisplay');
    
    if (!bidDisplay) return;
    
    if (!preview) {
        preview = document.createElement('div');
        preview.id = 'tempBidPreview';
        preview.className = 'animate-pulse';
        preview.style.color = '#fbbf24';
        preview.style.fontSize = '1.1rem';
        preview.style.fontWeight = 'bold';
        preview.style.marginTop = '0.5rem';
        preview.style.background = 'rgba(251, 191, 36, 0.1)';
        preview.style.border = '1px dashed rgba(251, 191, 36, 0.3)';
        preview.style.padding = '0.4rem 1rem';
        preview.style.borderRadius = '8px';
        preview.style.display = 'none';
        preview.style.textAlign = 'center';
        bidDisplay.appendChild(preview);
    }
    
    const val = input ? parseInt(input.value) : 0;
    if (val > 0) {
        const units = window.auctionCurrencyUnit || '₹';
        preview.innerHTML = `⏳ Temporary Bid: ${units}${val.toLocaleString()} ${selectedTeamName ? `for ${selectedTeamName}` : ''} <span style="font-size: 0.8rem; color: #94a3b8; display: block; margin-top: 2px;">Press Enter to Confirm | Esc to Cancel</span>`;
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
}

// Auto-Bid UI Helper
function updateAutoBidUI(active) {
    let indicator = document.getElementById('autoBidIndicator');
    if (active) {
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'autoBidIndicator';
            indicator.className = 'animate-pulse';
            indicator.style.position = 'fixed';
            indicator.style.top = '1rem';
            indicator.style.left = '50%';
            indicator.style.transform = 'translateX(-50%)';
            indicator.style.background = 'linear-gradient(135deg, #f59e0b, #ef4444)';
            indicator.style.color = 'white';
            indicator.style.padding = '0.5rem 1.5rem';
            indicator.style.borderRadius = '20px';
            indicator.style.fontWeight = 'bold';
            indicator.style.fontSize = '0.9rem';
            indicator.style.zIndex = '99999';
            indicator.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.5)';
            indicator.innerHTML = `🤖 AUTO-BID MODE ACTIVE (${selectedTeamName || 'No Team'})`;
            document.body.appendChild(indicator);
        } else {
            indicator.innerHTML = `🤖 AUTO-BID MODE ACTIVE (${selectedTeamName || 'No Team'})`;
        }
    } else {
        if (indicator) indicator.remove();
    }
}

// Auto-Bid Mode Controller
let autoBidInterval = null;
window.toggleAutoBidMode = function() {
    if (autoBidInterval) {
        clearInterval(autoBidInterval);
        autoBidInterval = null;
        showToast('🤖 Auto-Bid Mode: OFF', 'warning');
        updateAutoBidUI(false);
    } else {
        if (!selectedTeamName) {
            showToast('⚠️ Select a team first to start auto-bids!', 'warning');
            return;
        }
        showToast('🤖 Auto-Bid Mode: ON (Bidding every 2.5s)', 'info');
        updateAutoBidUI(true);
        autoBidInterval = setInterval(() => {
            if (window.auctionState && window.auctionState.status === 'active') {
                const inc = parseInt(window.getActiveCategoryIncrement() || window.auctionBidIncreaseBy || 500, 10);
                const current = parseInt(currentBidState, 10) || 0;
                const newBid = current + inc;
                socket.emit('placeBid', { teamName: selectedTeamName, bidAmount: newBid });
            } else {
                window.toggleAutoBidMode();
            }
        }, 2500);
    }
};

// Listen to input changes in manual bid input to update temporary preview
const manualBidInput = document.getElementById('manualBidAmount');
if (manualBidInput) {
    manualBidInput.addEventListener('input', updateTempBidPreview);
}

// Hook into manual bid button click to clear preview
const manualBidSubmitBtn = document.getElementById('manualBidBtn');
if (manualBidSubmitBtn) {
    manualBidSubmitBtn.addEventListener('click', () => {
        setTimeout(updateTempBidPreview, 100);
    });
}

// Premium Pop Animation on Bid Update
function animateBidUpdate() {
    const liveBidEl = document.getElementById('liveBidAmount');
    if (!liveBidEl) return;
    
    // Reset animation
    liveBidEl.style.transition = 'none';
    liveBidEl.style.transform = 'scale(1.25)';
    liveBidEl.style.textShadow = '0 0 35px #10b981, 0 0 65px #34d399';
    
    // Force reflow
    void liveBidEl.offsetHeight;
    
    // Transition back smoothly
    liveBidEl.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    liveBidEl.style.transform = 'scale(1)';
    liveBidEl.style.textShadow = '0 0 25px rgba(52,211,153,0.5)';
}

// Hook into sockets bidUpdate event for pop animation
socket.on('bidUpdate', (data) => {
    animateBidUpdate();
});

// Main Keydown Event Listener
document.addEventListener('keydown', (e) => {
    // Only capture if user is not typing in other inputs
    const activeEl = document.activeElement;
    if (activeEl) {
        const tagName = (activeEl.tagName || '').toUpperCase();
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || activeEl.id === 'manualBidAmount' || activeEl.isContentEditable) {
            if (e.key !== 'Enter' && e.key !== 'Escape') {
                return;
            }
        }
    }
    
    const key = e.key.toLowerCase();
    
    // 1. Key "1" -> Increase bid by 1,000 directly
    if (key === '1') {
        e.preventDefault();
        const current = parseInt(currentBidState, 10) || 0;
        const newBid = current + 1000;
        socket.emit('placeBid', { teamName: selectedTeamName, bidAmount: newBid });
        return;
    }
    
    // 2. Key "5" -> Increase bid by 5,000 directly
    if (key === '5') {
        e.preventDefault();
        const current = parseInt(currentBidState, 10) || 0;
        const newBid = current + 5000;
        socket.emit('placeBid', { teamName: selectedTeamName, bidAmount: newBid });
        return;
    }
    
    // 3. ArrowUp -> Increase bid directly
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        const catInc = window.getActiveCategoryIncrement();
        const increment = catInc !== null ? parseInt(catInc, 10) : (parseInt(window.auctionBidIncreaseBy, 10) || 100);
        const current = parseInt(currentBidState, 10) || 0;
        const newBid = current + increment;
        socket.emit('placeBid', { teamName: selectedTeamName, bidAmount: newBid });
        return;
    }
    
    // 4. ArrowDown -> Decrease bid directly
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        const catInc = window.getActiveCategoryIncrement();
        const decrement = catInc !== null ? parseInt(catInc, 10) : (parseInt(window.auctionBidIncreaseBy, 10) || 100);
        const current = parseInt(currentBidState, 10) || 0;
        const newBid = Math.max(0, current - decrement);
        socket.emit('placeBid', { teamName: selectedTeamName, bidAmount: newBid });
        return;
    }
    
    // 5. Enter -> Confirm bid
    if (e.key === 'Enter') {
        e.preventDefault();
        const input = document.getElementById('manualBidAmount');
        const manualBidBtn = document.getElementById('manualBidBtn');
        if (manualBidBtn && input && input.value.trim() !== '') {
            manualBidBtn.click();
        }
        return;
    }
    
    // 6. Escape -> Cancel current temporary bid
    if (e.key === 'Escape') {
        e.preventDefault();
        const input = document.getElementById('manualBidAmount');
        if (input) {
            input.value = '';
            updateTempBidPreview();
            showToast('❌ Temporary bid cancelled', 'warning');
        }
        return;
    }
    
    // 7. Space -> Trigger auto-bid mode
    if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        window.toggleAutoBidMode();
        return;
    }
    
    // 8. SOLD (S) and UNSOLD (U) Actions
    if (key === 's') {
        e.preventDefault();
        const endAuctionBtn = document.getElementById('endAuctionBtn');
        if (endAuctionBtn) endAuctionBtn.click();
        return;
    }
    if (key === 'u') {
        e.preventDefault();
        const unsoldBtn = document.getElementById('unsoldBtn');
        if (unsoldBtn) unsoldBtn.click();
        return;
    }
    
    // 9. Team Shortcut Keys
    if (window.currentTeamsCache) {
        const matchingTeam = window.currentTeamsCache.find(t => t.shortcutKey && t.shortcutKey.toLowerCase() === key);
        if (matchingTeam) {
            e.preventDefault();
            if (window.selectTeamForBid) {
                window.selectTeamForBid(matchingTeam.name);
                
                document.querySelectorAll('.team-card').forEach(c => {
                    if (c.getAttribute('data-teamname') === matchingTeam.name) {
                        c.style.borderColor = 'var(--primary)';
                        const expander = c.querySelector('.team-roster-expand');
                        if (expander) expander.style.display = 'block';
                    } else {
                        c.style.borderColor = 'rgba(255,255,255,0.05)';
                        const expander = c.querySelector('.team-roster-expand');
                        if (expander) expander.style.display = 'none';
                    }
                });
                
                showToast(`🛡️ Selected Team: ${matchingTeam.name}`, 'info');
                updateTempBidPreview();
            }
        }
    }
});

window.updateTeamSelectButtons = function() {
    const buttons = document.querySelectorAll('.team-tab-btn');
    if (!buttons || buttons.length === 0) return;
    
    const state = window.auctionState;
    const currentPlayer = state ? state.currentPlayer : null;
    const isAuctionActive = state && state.status === 'active';
    
    buttons.forEach(btn => {
        const teamName = btn.getAttribute('data-teamname');
        if (!teamName) return;
        
        // Find team object
        const team = window.currentTeamsCache ? window.currentTeamsCache.find(t => t.name === teamName) : null;
        if (!team) return;
        
        const teamPlayers = currentPlayersDataCache ? currentPlayersDataCache.filter(p => p.soldTo === teamName) : [];
        const maxPlayersTotal = window.auctionMaxPlayers || 15;
        
        let blockReason = null;
        
        // 1. Overall squad limit
        if (teamPlayers.length >= maxPlayersTotal) {
            blockReason = `Squad full (${teamPlayers.length}/${maxPlayersTotal})`;
        } else if (isAuctionActive && currentPlayer) {
            // Check category limits
            const currentCatId = currentPlayer.category_id;
            const cat = window.auctionCategoriesCache ? window.auctionCategoriesCache.find(c => c.id === currentCatId) : null;
            
            const isActiveCategoryAll = !state || !state.activeCategory || state.activeCategory === 'all' || state.activeCategory.startsWith('cat_all_');

            // 1. Check category limits if category is valid and active category is not "all"
            if (cat && !cat.id.startsWith('cat_all_') && !isActiveCategoryAll) {
                const limit = (cat.maxPlayers && cat.maxPlayers > 0) 
                    ? cat.maxPlayers 
                    : (cat.minPlayers && cat.minPlayers > 0 ? cat.minPlayers : 0);
                const teamPlayersInCat = teamPlayers.filter(p => p.category_id === currentCatId && p.status === 'sold').length;
                if (limit > 0 && teamPlayersInCat >= limit) {
                    blockReason = `Team reached maximum allowed player limit for this category`;
                }
            }

            // 2. Budget and other checks if blockReason is not already set
            if (!blockReason) {
                // Determine increment and minRequiredBid
                const increment = (cat && cat.increment && cat.increment > 0) 
                    ? cat.increment 
                    : (window.auctionBidIncreaseBy || 500);
                let minRequiredBid = 0;
                if (!state.highestBidder) {
                    minRequiredBid = Math.max(currentPlayer.basePrice || 0, (cat && cat.baseBid) || 0);
                } else {
                    minRequiredBid = (parseInt(currentBidState, 10) || 0) + increment;
                }

                // Min category reserve logic
                const purseLeft = team.budget;
                const slotsLeft = maxPlayersTotal - teamPlayers.length;
                const defaultBaseBid = window.auctionBaseBid || 1000;

                let categoryRemaining = 0;
                let categoryBudgetNeeded = 0;
                let currentCatNeeds = 0;
                let currentCatBaseBid = defaultBaseBid;

                if (window.auctionCategoriesCache && !isActiveCategoryAll) {
                    window.auctionCategoriesCache.forEach(c => {
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

                if (team.budget < minRequiredBid) {
                    blockReason = `Insufficient budget (Next bid: ${minRequiredBid.toLocaleString()})`;
                } else if (remainingSlots < neededCategorySlotsAfterBid) {
                    blockReason = `Bidding leaves too few slots (${remainingSlots}) for other category minimums (${neededCategorySlotsAfterBid})`;
                } else if (purseLeft - minRequiredBid < reservePoint) {
                    blockReason = `Insufficient reserve points for other category minimums`;
                } else if (cat && !cat.id.startsWith('cat_all_')) {
                    if (cat.highestBidPerPlayer && cat.highestBidPerPlayer > 0 && minRequiredBid > cat.highestBidPerPlayer) {
                        blockReason = `Exceeds category maximum bid per player`;
                    } else if (cat.categoryHighestBidAll && cat.categoryHighestBidAll > 0) {
                        const teamPlayersInCat = teamPlayers.filter(p => p.category_id === currentCatId && p.status === 'sold').length;
                        const spentInCat = teamPlayersInCat.reduce((sum, p) => sum + (p.soldPrice || 0), 0);
                        if (spentInCat + minRequiredBid > cat.categoryHighestBidAll) {
                            blockReason = `Exceeds category budget limit`;
                        }
                    }
                }
            }
        }
        
        if (blockReason) {
            btn.disabled = true;
            btn.style.opacity = '0.4';
            btn.style.cursor = 'not-allowed';
            btn.title = blockReason;
            // Remove selection if it was selected
            if (selectedTeamName === teamName) {
                selectedTeamName = null;
                const disp = document.getElementById('selectedTeamDisplay');
                if (disp) {
                    disp.textContent = '';
                    disp.style.display = 'none';
                }
                const qSelect = document.getElementById('quickTeamSelect');
                if (qSelect) qSelect.value = '';
                btn.style.border = '1px solid rgba(255,255,255,0.1)';
            }
        } else {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.title = `Select ${teamName} to place bids`;
        }
    });
};


window.toggleSelectAllPlayers = function(master) {
    const checkboxes = document.querySelectorAll('.player-select-checkbox');
    checkboxes.forEach(cb => {
        if (!cb.disabled) {
            cb.checked = master.checked;
        }
    });
    window.updateBulkBtnState();
};

window.updateBulkBtnState = function() {
    const checkboxes = document.querySelectorAll('.player-select-checkbox:checked');
    const btn = document.getElementById('bulkUnsoldBtn');
    if (btn) {
        btn.disabled = checkboxes.length === 0;
        btn.textContent = `↩️ Bulk Unsold (${checkboxes.length} Selected)`;
    }
};

window.bulkUnsoldSelectedPlayers = async function() {
    const checkboxes = document.querySelectorAll('.player-select-checkbox:checked');
    const playerIds = Array.from(checkboxes).map(cb => cb.getAttribute('data-id'));
    if (playerIds.length === 0) return;
    
    if (confirm(`Mark ${playerIds.length} selected players as Unsold?`)) {
        try {
            const res = await fetch('/admin/bulk-mark-unsold', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerIds })
            });
            const result = await res.json();
            if (result.success) {
                // Clear checkboxes
                document.querySelectorAll('.player-select-checkbox').forEach(cb => cb.checked = false);
                const selectAll = document.getElementById('selectAllPlayers');
                if (selectAll) selectAll.checked = false;
                window.updateBulkBtnState();
                
                socket.emit('adminDataAdded');
                showToast(`${playerIds.length} Players Marked as Unsold Successfully`, 'success');
            } else {
                showToast(result.message || 'Error processing bulk unsold request', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Error connecting to server', 'error');
        }
    }
};

window.openBulkAddModal = () => {
    window.bulkActionType = 'add';
    document.getElementById('bulkCategoryModalTitle').innerHTML = '📁 Bulk Assign Players to Categories';
    document.getElementById('bulkActionBtn').textContent = 'Assign Players';
    document.getElementById('bulkCategoryModal').style.display = 'flex';
    
    // Clear search and selects
    document.getElementById('bulkPlayerSearchInput').value = '';
    document.getElementById('bulkPlayerSelectAll').checked = false;
    document.getElementById('bulkCategorySelectAll').checked = false;
    
    window.populateBulkLists();
};

window.openBulkRemoveModal = () => {
    window.bulkActionType = 'remove';
    document.getElementById('bulkCategoryModalTitle').innerHTML = '🗑️ Bulk Remove Players from Categories';
    document.getElementById('bulkActionBtn').textContent = 'Remove Players';
    document.getElementById('bulkCategoryModal').style.display = 'flex';
    
    // Clear search and selects
    document.getElementById('bulkPlayerSearchInput').value = '';
    document.getElementById('bulkPlayerSelectAll').checked = false;
    document.getElementById('bulkCategorySelectAll').checked = false;
    
    window.populateBulkLists();
};

window.closeBulkCategoryModal = () => {
    document.getElementById('bulkCategoryModal').style.display = 'none';
};

window.populateBulkLists = () => {
    const searchVal = document.getElementById('bulkPlayerSearchInput').value.trim().toLowerCase();
    
    // Players List
    const playersContainer = document.getElementById('bulkPlayersListContainer');
    let players = currentPlayersDataCache || [];
    players = [...players].sort((a, b) => a.name.localeCompare(b.name));
    
    // Filter by name
    const filteredPlayers = players.filter(p => p.name.toLowerCase().includes(searchVal));
    
    playersContainer.innerHTML = filteredPlayers.map(p => {
        let catText = '';
        if (p.category_id && window.auctionCategoriesCache) {
            const cat = window.auctionCategoriesCache.find(c => c.id === p.category_id);
            if (cat) {
                catText = ` <span style="font-size: 0.7rem; color: ${cat.color || '#94a3b8'}; background: rgba(255,255,255,0.05); padding: 0.1rem 0.3rem; border-radius: 4px; margin-left: 0.4rem;">${cat.name}</span>`;
            }
        }
        return `
            <label style="display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0.6rem; background: rgba(255,255,255,0.03); border-radius: 6px; cursor: pointer; transition: background 0.15s; font-size: 0.85rem;" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                <div style="display: flex; align-items: center; gap: 0.5rem; text-align: left; width: 100%;">
                    <input type="checkbox" class="bulk-player-checkbox" value="${p.id}" onchange="window.updateBulkModalCounts()">
                    <span style="color: #f1f5f9; font-weight: 500;">${p.name}</span>
                    ${catText}
                </div>
            </label>
        `;
    }).join('');
    
    // Categories List (exclude 'All' system category)
    const categoriesContainer = document.getElementById('bulkCategoriesListContainer');
    const categories = (window.auctionCategoriesCache || []).filter(c => !c.id.startsWith('cat_all_'));
    
    categoriesContainer.innerHTML = categories.map(c => {
        const assignedPlayers = (currentPlayersDataCache || []).filter(p => p.category_id === c.id);
        const maxText = c.maxPlayers > 0 ? ` (Max: ${c.maxPlayers})` : ' (Unlimited)';
        return `
            <label style="display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0.6rem; background: rgba(255,255,255,0.03); border-radius: 6px; cursor: pointer; transition: background 0.15s; font-size: 0.85rem;" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                <div style="display: flex; align-items: center; gap: 0.5rem; text-align: left; width: 100%;">
                    <input type="checkbox" class="bulk-category-checkbox" value="${c.id}" onchange="window.updateBulkModalCounts()">
                    <span style="color: #f1f5f9; font-weight: 500; border-left: 3px solid ${c.color || '#fff'}; padding-left: 0.4rem;">${c.name}</span>
                    <span style="font-size: 0.7rem; color: #94a3b8; margin-left: auto;">${assignedPlayers.length} players${maxText}</span>
                </div>
            </label>
        `;
    }).join('');
    
    window.updateBulkModalCounts();
};

window.filterBulkPlayersList = () => {
    const checkedPlayerIds = new Set(
        Array.from(document.querySelectorAll('.bulk-player-checkbox:checked')).map(cb => cb.value)
    );
    
    const searchVal = document.getElementById('bulkPlayerSearchInput').value.trim().toLowerCase();
    const playersContainer = document.getElementById('bulkPlayersListContainer');
    let players = currentPlayersDataCache || [];
    players = [...players].sort((a, b) => a.name.localeCompare(b.name));
    
    const filteredPlayers = players.filter(p => p.name.toLowerCase().includes(searchVal));
    
    playersContainer.innerHTML = filteredPlayers.map(p => {
        let catText = '';
        if (p.category_id && window.auctionCategoriesCache) {
            const cat = window.auctionCategoriesCache.find(c => c.id === p.category_id);
            if (cat) {
                catText = ` <span style="font-size: 0.7rem; color: ${cat.color || '#94a3b8'}; background: rgba(255,255,255,0.05); padding: 0.1rem 0.3rem; border-radius: 4px; margin-left: 0.4rem;">${cat.name}</span>`;
            }
        }
        const isChecked = checkedPlayerIds.has(p.id) ? 'checked' : '';
        return `
            <label style="display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0.6rem; background: rgba(255,255,255,0.03); border-radius: 6px; cursor: pointer; transition: background 0.15s; font-size: 0.85rem;" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                <div style="display: flex; align-items: center; gap: 0.5rem; text-align: left; width: 100%;">
                    <input type="checkbox" class="bulk-player-checkbox" value="${p.id}" ${isChecked} onchange="window.updateBulkModalCounts()">
                    <span style="color: #f1f5f9; font-weight: 500;">${p.name}</span>
                    ${catText}
                </div>
            </label>
        `;
    }).join('');
    
    const allVisible = document.querySelectorAll('.bulk-player-checkbox');
    const allVisibleChecked = Array.from(allVisible).every(cb => cb.checked);
    document.getElementById('bulkPlayerSelectAll').checked = allVisible.length > 0 && allVisibleChecked;
};

window.updateBulkModalCounts = () => {
    const playersChecked = document.querySelectorAll('.bulk-player-checkbox:checked').length;
    const categoriesChecked = document.querySelectorAll('.bulk-category-checkbox:checked').length;
    
    document.getElementById('bulkPlayerSelectedCount').textContent = playersChecked;
    document.getElementById('bulkCategorySelectedCount').textContent = categoriesChecked;
};

window.toggleSelectAllBulkPlayers = (selectAllCb) => {
    const visibleCheckboxes = document.querySelectorAll('.bulk-player-checkbox');
    visibleCheckboxes.forEach(cb => {
        cb.checked = selectAllCb.checked;
    });
    window.updateBulkModalCounts();
};

window.toggleSelectAllBulkCategories = (selectAllCb) => {
    const checkboxes = document.querySelectorAll('.bulk-category-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = selectAllCb.checked;
    });
    window.updateBulkModalCounts();
};

window.executeBulkAssignment = async () => {
    const playerCheckboxes = document.querySelectorAll('.bulk-player-checkbox:checked');
    const categoryCheckboxes = document.querySelectorAll('.bulk-category-checkbox:checked');
    
    const playerIds = Array.from(playerCheckboxes).map(cb => cb.value);
    const categoryIds = Array.from(categoryCheckboxes).map(cb => cb.value);
    
    if (playerIds.length === 0) {
        showToast('Please select at least one player!', 'warning');
        return;
    }
    if (categoryIds.length === 0) {
        showToast('Please select at least one category!', 'warning');
        return;
    }
    
    const action = window.bulkActionType;
    const url = action === 'add' ? '/admin/bulk-assign-categories' : '/admin/bulk-remove-categories';
    
    const assignBtn = document.getElementById('bulkActionBtn');
    const spinner = document.getElementById('bulkSpinner');
    assignBtn.disabled = true;
    spinner.style.display = 'flex';
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerIds, categoryIds })
        });
        const result = await response.json();
        
        if (result.success) {
            if (action === 'add') {
                showToast('Players Assigned Successfully', 'success');
                alert(`Category Assignment Summary:\n\nAssigned Successfully: ${result.summary.assigned}\nAlready Assigned: ${result.summary.already}\nFailed: ${result.summary.failed}`);
            } else {
                showToast('Players Removed Successfully', 'success');
                alert(`Category Removal Summary:\n\nRemoved Successfully: ${result.removedCount}`);
            }
            window.closeBulkCategoryModal();
            socket.emit('adminDataAdded');
        } else {
            showToast(result.message || 'Operation failed', 'error');
            alert(`Error: ${result.message || 'Operation failed'}`);
        }
    } catch (error) {
        console.error(error);
        showToast('Network error during operation.', 'error');
    } finally {
        assignBtn.disabled = false;
        spinner.style.display = 'none';
    }
};
document.addEventListener('DOMContentLoaded', () => {
    const qSelect = document.getElementById('quickTeamSelect');
    if (qSelect) {
        qSelect.addEventListener('change', (e) => {
            if (window.selectTeamForBid) {
                window.selectTeamForBid(e.target.value);
            }
        });
    }
});

window.filterDirectoryTable = function() {
    const input = document.getElementById('directorySearchInput');
    if (!input) return;
    const filter = input.value.toLowerCase();
    const table = document.getElementById('playersTable');
    if (!table) return;
    const rows = table.getElementsByTagName('tbody')[0].getElementsByTagName('tr');
    
    for (let i = 0; i < rows.length; i++) {
        const noCol = rows[i].getElementsByTagName('td')[1];
        const nameCol = rows[i].getElementsByTagName('td')[2];
        if (noCol && nameCol) {
            const noText = noCol.textContent || noCol.innerText;
            const nameText = nameCol.textContent || nameCol.innerText;
            if (noText.toLowerCase().includes(filter) || nameText.toLowerCase().includes(filter)) {
                rows[i].style.display = '';
            } else {
                rows[i].style.display = 'none';
            }
        }
    }
};

// Hook input event on manualBidAmount for live validation
const manualBidInputEl = document.getElementById('manualBidAmount');
if (manualBidInputEl) {
    manualBidInputEl.addEventListener('input', () => {
        if (typeof window.checkManualBidValidity === 'function') {
            window.checkManualBidValidity();
        }
    });
}


window.removePlayerFromTeam = async function(playerId, playerName, teamName, soldPrice) {
    if (!playerId) return;
    const priceFormatted = soldPrice ? (typeof formatCurrency === 'function' ? formatCurrency(soldPrice) : '₹' + Number(soldPrice).toLocaleString()) : 'the sold amount';
    const confirmMsg = `Are you sure you want to remove ${playerName || 'this player'} from ${teamName || 'this team'}?\n\nThis will refund ${priceFormatted} back to ${teamName || 'the team'}'s purse and return the player to the available pool.`;
    
    if (!confirm(confirmMsg)) return;

    // Optimistic local cache update for instant UI feedback
    if (window.currentPlayersDataCache) {
        const p = window.currentPlayersDataCache.find(x => String(x.id).trim() === String(playerId).trim() || (x.formNo && String(x.formNo).trim() === String(playerId).trim()));
        if (p) {
            p.status = 'available';
            p.soldTo = null;
            p.soldPrice = null;
        }
    }
    if (window.currentTeamsCache) {
        const t = window.currentTeamsCache.find(x => x.name === teamName);
        if (t) {
            t.budget = parseInt(t.budget || 0) + parseInt(soldPrice || 0);
        }
    }
    if (typeof openTeamDetailsModal === 'function') {
        const modal = document.getElementById('teamDetailsModalOverlay');
        if (modal && modal.style.display !== 'none') {
            openTeamDetailsModal(teamName);
        }
    }

    try {
        const res = await fetch('/admin/reset-player', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId })
        });
        const data = await res.json();
        if (data.success) {
            if (typeof socket !== 'undefined') {
                socket.emit('adminDataAdded');
                socket.emit('removePlayerFromTeam', { playerId });
            }
            if (typeof showToast === 'function') {
                showToast(`Removed ${playerName || 'player'} from ${teamName}`, 'success');
            }
            const modal = document.getElementById('teamDetailsModalOverlay');
            if (modal && modal.style.display !== 'none' && typeof openTeamDetailsModal === 'function') {
                openTeamDetailsModal(teamName);
            }
            return;
        }
    } catch (err) {
        console.warn('HTTP reset-player error, falling back to socket:', err);
    }

    if (typeof socket !== 'undefined') {
        socket.emit('removePlayerFromTeam', { playerId });
        if (typeof showToast === 'function') {
            showToast(`Removed ${playerName || 'player'} from ${teamName}`, 'success');
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
