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

    function normalizeText(str) {
        if (!str) return '';
        return String(str)
            .toLowerCase()
            .replace(/[_\.\-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function stripNonAlphanumeric(str) {
        if (!str) return '';
        return String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    // Client-side player matching priority engine (Matches by Player ID or Player Name reliably)
    function findMatchedPlayerByPriority(nameWithoutExt, players) {
        if (!nameWithoutExt || !players || !players.length) return null;
        
        const rawStr = String(nameWithoutExt).trim();
        const norm = (str) => {
            if (!str) return '';
            return String(str).toLowerCase()
                .replace(/[_.\-]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        };
        const strip = (str) => {
            if (!str) return '';
            return String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
        };
        const stripTitles = (str) => {
            return norm(str).replace(/^(?:dr|mr|mrs|ms|prof|shri|adv|capt)\.?\s+/i, '').trim();
        };

        const normStr = norm(rawStr);
        const strippedStr = strip(rawStr);
        const titleFreeStr = stripTitles(rawStr);
        
        // Check if identifier contains a pure integer or prefix + integer
        let extractedNumber = null;
        const pureInt = parseInt(rawStr, 10);
        if (!isNaN(pureInt) && /^\d+$/.test(rawStr)) {
            extractedNumber = pureInt;
        } else {
            const prefixMatch = rawStr.match(/^(?:id|player|p|form|f|no|img|image|photo|pic|picture|sr|srno|slno|sl)[\s_\-#]*(\d+)$/i);
            if (prefixMatch) {
                extractedNumber = parseInt(prefixMatch[1], 10);
            }
        }

        // Priority 1: Match by Form Number (high priority for auction player lists)
        let player = players.find(p => {
            if (!p.formNo) return false;
            const dbFormStr = String(p.formNo).trim();
            if (dbFormStr.toLowerCase() === rawStr.toLowerCase()) return true;
            if (extractedNumber !== null) {
                const dbFormInt = parseInt(dbFormStr, 10);
                if (!isNaN(dbFormInt) && dbFormInt === extractedNumber) return true;
            }
            return false;
        });
        if (player) return { player, matchedBy: 'Form Number' };

        // Priority 2: Match by Player ID (exact string or integer comparison)
        player = players.find(p => {
            if (p.id === undefined || p.id === null) return false;
            const pIdStr = String(p.id).trim();
            if (pIdStr.toLowerCase() === rawStr.toLowerCase()) return true;
            if (extractedNumber !== null) {
                const pIdInt = parseInt(pIdStr, 10);
                if (!isNaN(pIdInt) && pIdInt === extractedNumber) return true;
            }
            return false;
        });
        if (player) return { player, matchedBy: 'Player ID' };

        // Priority 3: Match by Player Name (normalized: "Virat_Kohli", "Dr. Mayur" -> "dr mayur")
        player = players.find(p => {
            if (!p.name) return false;
            return norm(p.name) === normStr;
        });
        if (player) return { player, matchedBy: 'Player Name' };

        // Priority 4: Match by Player Name (stripped alphanumeric: "ViratKohli" -> "viratkohli")
        player = players.find(p => {
            if (!p.name) return false;
            return strip(p.name) === strippedStr;
        });
        if (player) return { player, matchedBy: 'Player Name' };

        // Priority 5: Match by Player Name (Title-free: "Dr. Mayur" vs "Mayur")
        if (titleFreeStr) {
            player = players.find(p => {
                if (!p.name) return false;
                return stripTitles(p.name) === titleFreeStr;
            });
            if (player) return { player, matchedBy: 'Player Name' };
        }

        // Priority 6: Match by Jersey Number / Player Number
        player = players.find(p => {
            if (!p.jerseyNumber) return false;
            const dbJerseyStr = String(p.jerseyNumber).trim();
            if (dbJerseyStr.toLowerCase() === rawStr.toLowerCase()) return true;
            if (extractedNumber !== null) {
                const dbJerseyInt = parseInt(dbJerseyStr, 10);
                if (!isNaN(dbJerseyInt) && dbJerseyInt === extractedNumber) return true;
            }
            return false;
        });
        if (player) return { player, matchedBy: 'Player Number' };

        // Priority 7: Compound pattern - leading number ("1 - Virat Kohli", "144_Dr_Mayur", "144-Dr. Mayur")
        const leadingNumMatch = rawStr.match(/^(\d+)[\s_\-]+(.+)$/);
        if (leadingNumMatch) {
            const numPart = parseInt(leadingNumMatch[1], 10);
            const namePart = norm(leadingNumMatch[2]);
            player = players.find(p => p.name && norm(p.name) === namePart);
            if (player) return { player, matchedBy: 'Player Name' };
            player = players.find(p => p.formNo && parseInt(p.formNo, 10) === numPart);
            if (player) return { player, matchedBy: 'Form Number' };
            player = players.find(p => parseInt(p.id, 10) === numPart);
            if (player) return { player, matchedBy: 'Player ID' };
        }

        // Priority 8: Compound pattern - trailing number ("Virat Kohli_1", "Dr Mayur (144)", "Dr. Mayur_144")
        const trailingNumMatch = rawStr.match(/^(.+?)[\s_\-]+(\d+)$/) || rawStr.match(/^(.+?)\s*\((.+?)\)$/);
        if (trailingNumMatch) {
            const namePart = norm(trailingNumMatch[1]);
            const numPart = parseInt(trailingNumMatch[2], 10);
            player = players.find(p => p.name && norm(p.name) === namePart);
            if (player) return { player, matchedBy: 'Player Name' };
            if (!isNaN(numPart)) {
                player = players.find(p => p.formNo && parseInt(p.formNo, 10) === numPart);
                if (player) return { player, matchedBy: 'Form Number' };
                player = players.find(p => parseInt(p.id, 10) === numPart);
                if (player) return { player, matchedBy: 'Player ID' };
            }
        }

        // Priority 9: Smart partial name match
        if (normStr.length >= 4) {
            const partialMatches = players.filter(p => {
                if (!p.name) return false;
                const pNorm = norm(p.name);
                return (pNorm.length >= 4 && (pNorm.includes(normStr) || normStr.includes(pNorm)));
            });
            if (partialMatches.length === 1) {
                return { player: partialMatches[0], matchedBy: 'Player Name' };
            }
        }

        return null;
    }

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
                let players = window.currentPlayersDataCache || [];
                if (!players.length && window.cachedPlayers && window.cachedPlayers.length) {
                    players = window.cachedPlayers;
                }
                if (!players.length) {
                    try {
                        const pRes = await fetch('/admin/api/players?activeAuctionId=' + encodeURIComponent(activeAuctionId));
                        if (pRes.ok) {
                            const pData = await pRes.json();
                            if (pData.success && pData.players && pData.players.length) {
                                players = pData.players;
                                window.currentPlayersDataCache = pData.players;
                            }
                        }
                    } catch (fetchErr) {
                        console.error('Failed to pre-fetch players for matching:', fetchErr);
                    }
                }
                
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
                        // Directly assign and overwrite photo (never skip matched players)
                        matchedQueue.push({ file, player: match.player });
                        
                        if (match.matchedBy === 'Player ID') matchedById++;
                        else if (match.matchedBy === 'Form Number') matchedByFormNo++;
                        else if (match.matchedBy === 'Player Number') matchedByPlayerNo++;
                        else if (match.matchedBy === 'Player Name') matchedByName++;
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

        const statusHeaderEl = document.querySelector('#bulkSummaryReport > div:first-child');
        if (statusHeaderEl) {
            if ((summary.failed || 0) > 0 && (summary.matched || 0) === 0) {
                statusHeaderEl.textContent = '❌ Photo Download Failed (Check Drive Permissions)';
                statusHeaderEl.style.color = '#ef4444';
            } else if ((summary.failed || 0) > 0) {
                statusHeaderEl.textContent = `⚠️ Import Partially Completed (${summary.failed} Failed Downloads)`;
                statusHeaderEl.style.color = '#f59e0b';
            } else {
                statusHeaderEl.textContent = '✅ Import Completed Successfully';
                statusHeaderEl.style.color = 'var(--success)';
            }
        }

        const unmatchedListContainer = document.getElementById('unmatchedListContainer');
        const unmatchedListEl = document.getElementById('unmatchedList');
        
        unmatchedListEl.innerHTML = '';
        
        if (summary.unmatchedList && summary.unmatchedList.length > 0) {
            unmatchedListContainer.style.display = 'block';
            const unmatchedTitle = unmatchedListContainer.querySelector('div');
            if (unmatchedTitle) {
                unmatchedTitle.textContent = (summary.failed > 0) ? 'Failed / Unmatched Details:' : 'Unmatched Photos:';
            }
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
            let title = '✅ Import Completed Successfully';
            let extraHelp = '';
            
            if ((summary.failed || 0) > 0 && (summary.matched || 0) === 0) {
                title = '⚠️ Photo Download Failed';
                extraHelp = '\n\nWhy did photos fail to download?\n' +
                            '• Private Google Drive links: Google Drive prevents downloads if permissions are not set to "Anyone with the link can view". In Google Drive, open the folder -> Share -> Change to "Anyone with the link".\n' +
                            '• Quickest Alternative: Click the "📁 FOLDER" tab to upload your photo files directly from your computer without Google Drive permissions!';
            } else if ((summary.failed || 0) > 0) {
                title = '⚠️ Import Completed with Some Errors';
                extraHelp = `\n\n${summary.failed} photo(s) failed to download. Check drive sharing permissions or use the "📁 FOLDER" tab to upload remaining photos directly.`;
            }

            let msg = `${title}\n\n` +
                   `Total Processed: ${summary.total || 0}\n` +
                   `Successfully Assigned: ${summary.matched || 0}\n` +
                   `Skipped (Empty URL): ${summary.skipped || 0}\n` +
                   `Failed to Download: ${summary.failed || 0}\n\n` +
                   `Matched by Player ID: ${summary.matchedById || 0}\n` +
                   `Matched by Form Number: ${summary.matchedByFormNo || 0}\n` +
                   `Matched by Player Number: ${summary.matchedByPlayerNo || 0}\n` +
                   `Matched by Player Name: ${summary.matchedByName || 0}\n` +
                   `Unmatched Players: ${summary.unmatched || 0}` +
                   extraHelp;
            alert(msg);
        }, 100);
    }
})();
