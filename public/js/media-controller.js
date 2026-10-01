// public/js/media-controller.js
// Client-side controller for Bulk Player Photo Upload inside the Players Section

(function () {
    let activeSource = 'excel';

    // 1. Switch Upload Source
    window.switchBulkPhotoSource = function (source) {
        activeSource = source;

        // Reset buttons active state
        document.querySelectorAll('.bulk-source-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.style.background = 'rgba(255, 255, 255, 0.02)';
            btn.style.color = '#94a3b8';
            btn.style.borderColor = 'rgba(255, 255, 255, 0.05)';
        });

        const activeBtn = document.getElementById('btnSource' + source.charAt(0).toUpperCase() + source.slice(1));
        if (activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.style.background = 'rgba(59, 130, 246, 0.15)';
            activeBtn.style.color = '#60a5fa';
            activeBtn.style.borderColor = 'rgba(59, 130, 246, 0.3)';
        }

        // Switch input visibility
        document.querySelectorAll('.bulk-input-group').forEach(group => {
            group.style.display = 'none';
        });

        const activeGroup = document.getElementById('inputGroup' + source.charAt(0).toUpperCase() + source.slice(1));
        if (activeGroup) {
            activeGroup.style.display = 'block';
        }

        // Hide status container when switching sources
        document.getElementById('bulkSyncStatusContainer').style.display = 'none';
    };

    // Client-side player matching priority engine
    function findMatchedPlayerByPriority(nameWithoutExt, players) {
        if (!nameWithoutExt) return null;
        const cleanId = String(nameWithoutExt).trim();
        const cleanIdLower = cleanId.toLowerCase();
        const cleanIdInt = parseInt(cleanId, 10);
        
        // Priority 1: Player ID
        let player = players.find(p => p.id && String(p.id).trim() === cleanId);
        if (player) return { player, matchedBy: 'Player ID' };
        
        // Priority 2: Form Number
        player = players.find(p => {
            if (!p.formNo) return false;
            const dbFormStr = String(p.formNo).trim();
            if (dbFormStr === cleanId) return true;
            const dbFormInt = parseInt(dbFormStr, 10);
            return (!isNaN(dbFormInt) && !isNaN(cleanIdInt) && dbFormInt === cleanIdInt);
        });
        if (player) return { player, matchedBy: 'Form Number' };
        
        // Priority 3, 4, 5: Player Number / Registration Number / Jersey Number (maps to jerseyNumber)
        player = players.find(p => {
            if (!p.jerseyNumber) return false;
            const dbJerseyStr = String(p.jerseyNumber).trim();
            if (dbJerseyStr === cleanId) return true;
            const dbJerseyInt = parseInt(dbJerseyStr, 10);
            return (!isNaN(dbJerseyInt) && !isNaN(cleanIdInt) && dbJerseyInt === cleanIdInt);
        });
        if (player) return { player, matchedBy: 'Player Number' };
        
        // Priority 6: Player Name (case-insensitive)
        player = players.find(p => p.name && p.name.trim().toLowerCase() === cleanIdLower);
        if (player) return { player, matchedBy: 'Player Name' };
        
        return null;
    }

    // Extract file base name without path or extension
    function getFileBaseName(filename) {
        const parts = filename.split('/');
        const nameWithExt = parts[parts.length - 1];
        const dotIndex = nameWithExt.lastIndexOf('.');
        return dotIndex === -1 ? nameWithExt : nameWithExt.substring(0, dotIndex);
    }

    // 2. Execute Bulk Photo Upload & Sync
    window.executeBulkPhotoUpload = async function () {
        const syncBtn = document.getElementById('bulkSyncBtn');
        const statusContainer = document.getElementById('bulkSyncStatusContainer');
        const statusTitle = document.getElementById('bulkStatusTitle');
        const statusCount = document.getElementById('bulkStatusCount');
        const progressBar = document.getElementById('bulkStatusProgressBar');
        const summaryReport = document.getElementById('bulkSummaryReport');
        
        // Reset status views
        statusContainer.style.display = 'flex';
        statusTitle.textContent = 'Processing...';
        statusCount.textContent = '0%';
        progressBar.style.width = '0%';
        summaryReport.style.display = 'none';
        
        syncBtn.disabled = true;

        const activeAuctionId = window.activeAuctionId || '';

        try {
            if (activeSource === 'excel') {
                // Option 1: Excel Sheet Upload
                const fileInput = document.getElementById('bulkExcelFileInput');
                const file = fileInput.files[0];
                if (!file) {
                    alert('⚠️ Please select an Excel or CSV file first.');
                    statusContainer.style.display = 'none';
                    syncBtn.disabled = false;
                    return;
                }

                statusTitle.textContent = 'Uploading spreadsheet...';
                progressBar.style.width = '30%';
                statusCount.textContent = '30%';

                const formData = new FormData();
                formData.append('excelFile', file);
                formData.append('activeAuctionId', activeAuctionId);

                const res = await fetch('/admin/media/bulk-excel-import', {
                    method: 'POST',
                    body: formData
                });

                if (!res.ok) {
                    throw new Error(`Server returned HTTP ${res.status}`);
                }

                const result = await res.json();
                if (result.success) {
                    progressBar.style.width = '100%';
                    statusCount.textContent = '100%';
                    statusTitle.textContent = 'Sync Complete!';
                    displayImportSummary(result.data);
                } else {
                    throw new Error(result.message || (result.errors && result.errors.join(', ')) || 'Import failed');
                }

            } else if (activeSource === 'gdrive') {
                // Option 3: Google Drive Sync
                const linkInput = document.getElementById('bulkGDriveLinkInput');
                const url = linkInput.value.trim();
                if (!url) {
                    alert('⚠️ Please paste a Google Drive public file or folder link.');
                    statusContainer.style.display = 'none';
                    syncBtn.disabled = false;
                    return;
                }

                statusTitle.textContent = 'Connecting to Google Drive...';
                progressBar.style.width = '20%';
                statusCount.textContent = '20%';

                const res = await fetch('/admin/media/bulk-gdrive-import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url, activeAuctionId })
                });

                if (!res.ok) {
                    throw new Error(`Server returned HTTP ${res.status}`);
                }

                const result = await res.json();
                if (result.success) {
                    progressBar.style.width = '100%';
                    statusCount.textContent = '100%';
                    statusTitle.textContent = 'Sync Complete!';
                    displayImportSummary(result.data);
                } else {
                    throw new Error(result.message || 'GDrive sync failed');
                }

            } else if (activeSource === 'folder') {
                // Option 2: Local Folder Upload
                const folderInput = document.getElementById('bulkFolderFileInput');
                const files = folderInput.files;
                if (!files || files.length === 0) {
                    alert('⚠️ Please select a folder containing images.');
                    statusContainer.style.display = 'none';
                    syncBtn.disabled = false;
                    return;
                }

                statusTitle.textContent = 'Auto-matching files...';
                const players = window.currentPlayersDataCache || [];
                
                const matchedQueue = [];
                let unmatchedCount = 0;
                let skippedCount = 0;
                const unmatchedList = [];

                let matchedById = 0;
                let matchedByFormNo = 0;
                let matchedByPlayerNo = 0;
                let matchedByName = 0;

                // 1. Run client-side auto-matching
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    if (!file.type.startsWith('image/')) continue; // Skip non-images

                    const nameWithoutExt = getFileBaseName(file.name);
                    const match = findMatchedPlayerByPriority(nameWithoutExt, players);

                    if (match) {
                        if (match.player.photo) {
                            skippedCount++;
                            unmatchedList.push(`${file.name} (Photo already uploaded for ${match.player.name})`);
                        } else {
                            matchedQueue.push({ file, player: match.player });
                            
                            if (match.matchedBy === 'Player ID') matchedById++;
                            else if (match.matchedBy === 'Form Number') matchedByFormNo++;
                            else if (match.matchedBy === 'Player Number') matchedByPlayerNo++;
                            else if (match.matchedBy === 'Player Name') matchedByName++;
                        }
                    } else {
                        unmatchedCount++;
                        unmatchedList.push(file.name);
                    }
                }

                const totalPhotos = matchedQueue.length + skippedCount + unmatchedCount;
                if (matchedQueue.length === 0) {
                    progressBar.style.width = '100%';
                    statusCount.textContent = '100%';
                    statusTitle.textContent = 'Sync Complete!';
                    displayImportSummary({
                        total: totalPhotos,
                        matched: 0,
                        failed: 0,
                        skipped: skippedCount,
                        matchedById: 0,
                        matchedByFormNo: 0,
                        matchedByPlayerNo: 0,
                        matchedByName: 0,
                        unmatched: unmatchedCount,
                        unmatchedList: unmatchedList
                    });
                    syncBtn.disabled = false;
                    return;
                }

                statusTitle.textContent = `Uploading ${matchedQueue.length} matched photos...`;

                let processedCount = 0;
                let successCount = 0;
                let failedCount = 0;

                // 2. Upload matched images concurrently (concurrency limit = 5)
                const concurrencyLimit = 5;
                const uploadItem = async (item) => {
                    const formData = new FormData();
                    formData.append('photo', item.file);
                    formData.append('playerId', item.player.id);
                    formData.append('activeAuctionId', activeAuctionId);

                    try {
                        const uploadRes = await fetch('/admin/media/upload-single', {
                            method: 'POST',
                            body: formData
                        });
                        const uploadResult = await uploadRes.json();
                        if (uploadResult.success) {
                            successCount++;
                        } else {
                            failedCount++;
                        }
                    } catch (uploadErr) {
                        console.error('Folder upload single error:', uploadErr);
                        failedCount++;
                    } finally {
                        processedCount++;
                        const percent = Math.round((processedCount / matchedQueue.length) * 100);
                        progressBar.style.width = percent + '%';
                        statusCount.textContent = percent + '%';
                        statusTitle.textContent = `Uploading matched: ${processedCount}/${matchedQueue.length}`;
                    }
                };

                const chunks = [];
                for (let i = 0; i < matchedQueue.length; i += concurrencyLimit) {
                    chunks.push(matchedQueue.slice(i, i + concurrencyLimit));
                }

                for (const chunk of chunks) {
                    await Promise.all(chunk.map(item => uploadItem(item)));
                }

                statusTitle.textContent = 'Sync Complete!';
                displayImportSummary({
                    total: totalPhotos,
                    matched: successCount,
                    failed: failedCount,
                    skipped: skippedCount,
                    matchedById,
                    matchedByFormNo,
                    matchedByPlayerNo,
                    matchedByName,
                    unmatched: unmatchedCount,
                    unmatchedList
                });
            }

            // Sync players cache and trigger interface updates
            if (window.syncData) {
                window.syncData();
            }

        } catch (err) {
            console.error('Bulk sync failed:', err);
            statusTitle.textContent = '❌ Error during sync';
            alert(`❌ Sync failed: ${err.message}`);
        } finally {
            syncBtn.disabled = false;
        }
    };

    // 3. Render Import Summary and list unmatched images
    function displayImportSummary(summary) {
        document.getElementById('bulkSummaryReport').style.display = 'flex';
        
        const safeSetText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };

        safeSetText('sumTotal', summary.total || 0);
        safeSetText('sumAssigned', summary.matched || 0);
        safeSetText('sumSkipped', summary.skipped || 0);
        safeSetText('sumFailed', summary.failed || 0);
        
        // Group ID/Form/Number if the UI only has one field
        safeSetText('sumById', (summary.matchedById || 0) + (summary.matchedByFormNo || 0) + (summary.matchedByPlayerNo || 0));
        safeSetText('sumByForm', summary.matchedByFormNo || 0);
        safeSetText('sumByNumber', summary.matchedByPlayerNo || 0);
        safeSetText('sumByName', summary.matchedByName || 0);
        safeSetText('sumUnmatched', summary.unmatched || 0);

        const unmatchedListContainer = document.getElementById('unmatchedListContainer');
        const unmatchedListEl = document.getElementById('unmatchedList');
        
        unmatchedListEl.innerHTML = '';
        
        if (summary.unmatchedList && summary.unmatchedList.length > 0) {
            unmatchedListContainer.style.display = 'block';
            summary.unmatchedList.slice(0, 50).forEach(item => {
                const li = document.createElement('li');
                li.textContent = item;
                unmatchedListEl.appendChild(li);
            });
            if (summary.unmatchedList.length > 50) {
                const li = document.createElement('li');
                li.textContent = `...and ${summary.unmatchedList.length - 50} more.`;
                li.style.listStyle = 'none';
                li.style.fontWeight = 'bold';
                unmatchedListEl.appendChild(li);
            }
        } else {
            unmatchedListContainer.style.display = 'none';
        }
        
        // Final alert popup summary (clean format)
        setTimeout(() => {
            let msg = "";
            if (summary.skipped > 0) {
                msg += "Already file photos are uploaded\n\n";
            }
            msg += `Import Completed Successfully\n\n` +
                   `Total Photos Found: ${summary.total || 0}\n` +
                   `Successfully Assigned: ${summary.matched || 0}\n` +
                   `Skipped: ${summary.skipped || 0}\n` +
                   `Failed: ${summary.failed || 0}\n\n` +
                   `Matched by Player ID: ${summary.matchedById || 0}\n` +
                   `Matched by Form Number: ${summary.matchedByFormNo || 0}\n` +
                   `Matched by Player Number: ${summary.matchedByPlayerNo || 0}\n` +
                   `Matched by Player Name: ${summary.matchedByName || 0}\n` +
                   `Unmatched: ${summary.unmatched || 0}`;
            alert(msg);
        }, 100);
    }
})();
