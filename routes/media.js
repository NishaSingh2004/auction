const express = require('express');
const router = express.Router();
const data = require('../models/data');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// Ensure public/uploads exists
const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const cleanName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        cb(null, Date.now() + '-' + cleanName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Broadcast helper for socket updates
const broadcastUpdates = () => {
    if (global.io) {
        global.io.emit('dataUpdate', { teams: data.teams, players: data.players, categories: data.categories });
        global.io.emit('auctionUpdate', data.auctionState);
    }
};

// Helper to download files from URLs (including Google Drive conversion and timeout)
async function downloadUrlToFile(urlStr, destPath) {
    if (!urlStr || typeof urlStr !== 'string' || (!urlStr.trim().startsWith('http://') && !urlStr.trim().startsWith('https://'))) {
        throw new Error('Invalid URL format (must start with http:// or https://)');
    }
    let finalUrl = urlStr.trim();
    const fileIdMatch = finalUrl.match(/(?:\/d\/|folders\/|id=)([a-zA-Z0-9_-]{10,})/);
    if (finalUrl.includes('drive.google.com') && fileIdMatch) {
        const fileId = fileIdMatch[1];
        finalUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 seconds timeout per download

    try {
        const response = await fetch(finalUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`Failed to download from URL: ${urlStr}. Status: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(destPath, buffer);
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new Error('Request timed out (exceeded 6 seconds)');
        }
        throw err;
    }
}

// Audit Log Helpers
const logPath = path.join(uploadDir, 'audit-logs.json');
function addAuditLog(action, details, status = 'success') {
    let logs = [];
    try {
        if (fs.existsSync(logPath)) {
            logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
        }
    } catch (e) {
        console.error("Error reading audit logs:", e);
    }
    logs.unshift({
        timestamp: new Date().toISOString(),
        action,
        details,
        status
    });
    if (logs.length > 500) logs = logs.slice(0, 500);
    try {
        fs.writeFileSync(logPath, JSON.stringify(logs, null, 2), 'utf8');
    } catch (e) {
        console.error("Error writing audit logs:", e);
    }
}

// Asset Metadata Helpers
const metadataPath = path.join(uploadDir, 'assets-metadata.json');
function getMetadata() {
    try {
        if (fs.existsSync(metadataPath)) {
            return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        }
    } catch (e) {
        console.error("Error reading asset metadata:", e);
    }
    return {};
}

function saveMetadata(metadata) {
    try {
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    } catch (e) {
        console.error("Error writing asset metadata:", e);
    }
}

function updateAssetMetadata(filename, source, originalName) {
    const meta = getMetadata();
    meta[filename] = {
        source: source || 'manual',
        originalName: originalName || filename,
        uploadedAt: new Date().toISOString()
    };
    saveMetadata(meta);
}

// Player Matching Logic
function findMatchedPlayerByPriority(identifier, players) {
    if (!identifier) return null;
    const cleanId = String(identifier).trim();
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

function findMatchedPlayer(filename, players) {
    const nameWithoutExt = path.parse(filename).name.trim();
    const match = findMatchedPlayerByPriority(nameWithoutExt, players);
    return match ? match.player : null;
}

// Scrape file name from public Google Drive file view page
async function getGDriveFileName(fileId) {
    try {
        const url = `https://drive.google.com/file/d/${fileId}/view`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (!res.ok) return null;
        const html = await res.text();
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch) {
            let title = titleMatch[1].trim();
            title = title.replace(/\s*-\s*Google\s+Drive$/i, '');
            return title;
        }
    } catch (e) {
        console.error('Error fetching GDrive file page:', e);
    }
    return null;
}


// ==================== ENDPOINTS ====================

// 1. GET /admin/media/assets - Scan uploads and return metadata mapped to players/teams
router.get('/assets', async (req, res) => {
    try {
        const { activeAuctionId } = req.query;
        if (activeAuctionId && (!data.auctionDetails || data.auctionDetails.id !== activeAuctionId)) {
            try {
                await data.selectAuction(activeAuctionId);
            } catch (e) {
                console.error('[Assets Select Auction Error]', e);
            }
        }

        const files = fs.readdirSync(uploadDir);
        const metadata = getMetadata();
        const currentActiveAuctionId = data.auctionDetails ? data.auctionDetails.id : 'active_auction';
        
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
        const list = [];
        
        files.forEach(file => {
            const ext = path.extname(file).toLowerCase();
            if (!imageExtensions.includes(ext)) return;
            
            const filePath = path.join(uploadDir, file);
            let stat;
            try {
                stat = fs.statSync(filePath);
            } catch (e) {
                return;
            }
            
            const fileUrl = '/uploads/' + file;
            
            // Look up associated player
            const player = data.players.find(p => p.photo === fileUrl && p.auction_id === currentActiveAuctionId);
            // Look up associated team
            const team = data.teams.find(t => t.logo === fileUrl && t.auction_id === currentActiveAuctionId);
            
            const fileMeta = metadata[file] || { source: 'manual', originalName: file, uploadedAt: stat.mtime };
            
            list.push({
                filename: file,
                url: fileUrl,
                size: stat.size,
                source: fileMeta.source,
                originalName: fileMeta.originalName,
                uploadedAt: fileMeta.uploadedAt,
                player: player ? { id: player.id, name: player.name, formNo: player.formNo } : null,
                team: team ? { id: team.id, name: team.name } : null
            });
        });
        
        // Sort by upload date descending
        list.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
        
        res.json({ success: true, assets: list });
    } catch (err) {
        console.error('[Media API Assets Error]', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. POST /admin/media/upload-single - Upload single photo for a specific player or team
router.post('/upload-single', upload.single('photo'), async (req, res) => {
    if (!req.file) {
        return res.json({ success: false, message: 'No file uploaded' });
    }
    
    const { playerId, teamId, activeAuctionId } = req.body;
    if (activeAuctionId && (!data.auctionDetails || data.auctionDetails.id !== activeAuctionId)) {
        try {
            await data.selectAuction(activeAuctionId);
        } catch (e) {
            console.error('[Upload Single Select Auction Error]', e);
        }
    }
    
    const filename = req.file.filename;
    const photoUrl = '/uploads/' + filename;
    
    try {
        let matchedTarget = 'None';
        updateAssetMetadata(filename, 'manual', req.file.originalname);
        
        let activePlayerId = playerId;
        let matchedByLabel = '';
        if (!activePlayerId && !teamId) {
            const nameWithoutExt = path.parse(req.file.originalname).name.trim();
            const match = findMatchedPlayerByPriority(nameWithoutExt, data.players);
            if (match) {
                activePlayerId = match.player.id;
                matchedByLabel = ` (Auto matched by ${match.matchedBy})`;
            }
        }

        if (activePlayerId) {
            const player = data.players.find(p => p.id === activePlayerId);
            if (player) {
                await data.updatePlayer(activePlayerId, { photo: photoUrl });
                matchedTarget = `Player: ${player.name} (Form No: ${player.formNo || 'N/A'})${matchedByLabel}`;
                
                // Live redis state update
                if (data.auctionState.currentPlayer && data.auctionState.currentPlayer.id === activePlayerId) {
                    data.auctionState.currentPlayer.photo = photoUrl;
                    await data.saveStateToRedis();
                }
            }
        } else if (teamId) {
            const team = data.teams.find(t => t.id === teamId);
            if (team) {
                await data.updateTeam(teamId, { logo: photoUrl });
                matchedTarget = `Team: ${team.name}`;
            }
        }
        
        await data.syncWithDB();
        broadcastUpdates();
        
        addAuditLog('Single Upload', `Uploaded "${req.file.originalname}" associated with ${matchedTarget}`, 'success');
        
        res.json({ 
            success: true, 
            filename: filename, 
            url: photoUrl,
            message: `Successfully uploaded and associated with ${matchedTarget}`
        });
    } catch (err) {
        console.error('[Media API Single Upload Error]', err);
        addAuditLog('Single Upload Failed', `Failed to upload "${req.file.originalname}": ${err.message}`, 'error');
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. POST /admin/media/upload-bulk - Handle file upload in parallel queue
router.post('/upload-bulk', upload.single('photo'), async (req, res) => {
    const { activeAuctionId } = req.body;
    if (activeAuctionId && (!data.auctionDetails || data.auctionDetails.id !== activeAuctionId)) {
        try {
            await data.selectAuction(activeAuctionId);
        } catch (e) {
            console.error('[Upload Bulk Select Auction Error]', e);
        }
    }
    
    if (!req.file) {
        return res.json({ success: false, message: 'No file uploaded' });
    }
    
    const filename = req.file.filename;
    const photoUrl = '/uploads/' + filename;
    const originalName = req.file.originalname;
    
    try {
        updateAssetMetadata(filename, 'manual', originalName);
        
        // Match player dynamically
        const player = findMatchedPlayer(originalName, data.players);
        
        if (player) {
            await data.updatePlayer(player.id, { photo: photoUrl });
            
            // Live Redis state update
            if (data.auctionState.currentPlayer && data.auctionState.currentPlayer.id === player.id) {
                data.auctionState.currentPlayer.photo = photoUrl;
                await data.saveStateToRedis();
            }
            
            await data.syncWithDB();
            broadcastUpdates();
            
            addAuditLog('Bulk Photo Match', `Matched and updated player "${player.name}" (Form No: ${player.formNo || 'N/A'}) with file "${originalName}"`, 'success');
            
            return res.json({
                success: true,
                matched: true,
                filename: filename,
                url: photoUrl,
                player: { id: player.id, name: player.name, formNo: player.formNo }
            });
        } else {
            addAuditLog('Bulk Photo Unmatched', `Uploaded file "${originalName}" did not match any player`, 'success');
            return res.json({
                success: true,
                matched: false,
                filename: filename,
                url: photoUrl,
                message: 'No matching player found'
            });
        }
    } catch (err) {
        console.error('[Media API Bulk Upload Error]', err);
        addAuditLog('Bulk Upload Error', `Error uploading file "${originalName}": ${err.message}`, 'error');
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. POST /admin/media/zip-upload - Upload a ZIP archive, extract, and match players
router.post('/zip-upload', upload.single('zipFile'), async (req, res) => {
    const { activeAuctionId } = req.body;
    if (activeAuctionId && (!data.auctionDetails || data.auctionDetails.id !== activeAuctionId)) {
        try {
            await data.selectAuction(activeAuctionId);
        } catch (e) {
            console.error('[ZIP Select Auction Error]', e);
        }
    }
    
    if (!req.file) {
        return res.json({ success: false, message: 'No ZIP file uploaded' });
    }
    
    const zipPath = req.file.path;
    let matchedCount = 0;
    let unmatchedCount = 0;
    const results = [];
    const unmatchedNames = [];
    
    try {
        const zip = new AdmZip(zipPath);
        const zipEntries = zip.getEntries();
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
        
        for (const entry of zipEntries) {
            if (entry.isDirectory) continue;
            
            const originalName = path.basename(entry.entryName);
            const ext = path.extname(originalName).toLowerCase();
            if (!imageExtensions.includes(ext)) continue;
            
            // Check if there is a matched player
            const player = findMatchedPlayer(originalName, data.players);
            
            // Clean/uniquify file name
            const cleanOriginalName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            const targetFilename = `zip-${Date.now()}-${cleanOriginalName}`;
            const targetPath = path.join(uploadDir, targetFilename);
            
            // Extract the buffer and write file to uploads
            const dataBuffer = entry.getData();
            fs.writeFileSync(targetPath, dataBuffer);
            
            updateAssetMetadata(targetFilename, 'zip', originalName);
            
            if (player) {
                const photoUrl = '/uploads/' + targetFilename;
                await data.updatePlayer(player.id, { photo: photoUrl });
                
                if (data.auctionState.currentPlayer && data.auctionState.currentPlayer.id === player.id) {
                    data.auctionState.currentPlayer.photo = photoUrl;
                    await data.saveStateToRedis();
                }
                
                matchedCount++;
                results.push({
                    originalName: originalName,
                    matched: true,
                    playerName: player.name,
                    formNo: player.formNo
                });
            } else {
                unmatchedCount++;
                unmatchedNames.push(originalName);
                results.push({
                    originalName: originalName,
                    matched: false
                });
            }
        }
        
        // Remove the temporary uploaded ZIP file
        fs.unlinkSync(zipPath);
        
        await data.syncWithDB();
        broadcastUpdates();
        
        addAuditLog('ZIP Extraction', `Processed ZIP "${req.file.originalname}". Matched: ${matchedCount}, Unmatched: ${unmatchedCount}`, 'success');
        
        res.json({
            success: true,
            total: matchedCount + unmatchedCount,
            matched: matchedCount,
            unmatched: unmatchedCount,
            results: results,
            unmatchedNames: unmatchedNames
        });
    } catch (err) {
        console.error('[Media API ZIP Upload Error]', err);
        if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
        }
        addAuditLog('ZIP Extraction Failed', `Failed to process ZIP "${req.file.originalname}": ${err.message}`, 'error');
        res.status(500).json({ success: false, error: err.message });
    }
});

// 5. POST /admin/media/gdrive-file - Download Google Drive shared photo URL and link to player
router.post('/gdrive-file', async (req, res) => {
    const { url, playerId, activeAuctionId } = req.body;
    if (activeAuctionId && (!data.auctionDetails || data.auctionDetails.id !== activeAuctionId)) {
        try {
            await data.selectAuction(activeAuctionId);
        } catch (e) {
            console.error('[GDrive File Select Auction Error]', e);
        }
    }
    if (!url) {
        return res.json({ success: false, message: 'Google Drive URL is required.' });
    }
    
    try {
        const fileIdMatch = url.match(/(?:\/d\/|folders\/|id=)([a-zA-Z0-9_-]{10,})/);
        if (!fileIdMatch) {
            return res.json({ success: false, message: 'Could not extract File ID from Google Drive URL.' });
        }
        
        const fileId = fileIdMatch[1];
        const filename = `gdrive-${fileId}-${Date.now()}.jpg`;
        const destPath = path.join(uploadDir, filename);
        
        await downloadUrlToFile(url, destPath);
        updateAssetMetadata(filename, 'gdrive', `Google Drive File (${fileId})`);
        
        let targetLabel = 'None';
        const photoUrl = '/uploads/' + filename;
        
        if (playerId) {
            const player = data.players.find(p => p.id === playerId);
            if (player) {
                await data.updatePlayer(playerId, { photo: photoUrl });
                targetLabel = `Player: ${player.name} (Form No: ${player.formNo || 'N/A'})`;
                
                if (data.auctionState.currentPlayer && data.auctionState.currentPlayer.id === playerId) {
                    data.auctionState.currentPlayer.photo = photoUrl;
                    await data.saveStateToRedis();
                }
            }
        }
        
        await data.syncWithDB();
        broadcastUpdates();
        
        addAuditLog('Google Drive Import', `Downloaded single GDrive file and linked to ${targetLabel}`, 'success');
        
        res.json({
            success: true,
            filename: filename,
            url: photoUrl,
            message: `Successfully synced GDrive file and associated with ${targetLabel}`
        });
    } catch (err) {
        console.error('[Media API GDrive File Sync Error]', err);
        addAuditLog('Google Drive Import Failed', `Failed to import single GDrive file: ${err.message}`, 'error');
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6. POST /admin/media/sync-local - Sync and match images from a local directory path on server
router.post('/sync-local', async (req, res) => {
    const { pathVal, activeAuctionId } = req.body;
    if (activeAuctionId && (!data.auctionDetails || data.auctionDetails.id !== activeAuctionId)) {
        try {
            await data.selectAuction(activeAuctionId);
        } catch (e) {
            console.error('[Local Sync Select Auction Error]', e);
        }
    }
    if (!pathVal) {
        return res.json({ success: false, message: 'Local directory path is required.' });
    }
    
    try {
        const resolvedPath = path.resolve(process.cwd(), pathVal);
        if (!fs.existsSync(resolvedPath)) {
            return res.json({ success: false, message: `Local directory not found at: ${resolvedPath}` });
        }
        
        const stat = fs.statSync(resolvedPath);
        if (!stat.isDirectory()) {
            return res.json({ success: false, message: 'Specified path is not a directory.' });
        }
        
        const files = fs.readdirSync(resolvedPath);
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
        let matchedCount = 0;
        let unmatchedCount = 0;
        const results = [];
        const unmatchedNames = [];
        
        for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            if (!imageExtensions.includes(ext)) continue;
            
            const player = findMatchedPlayer(file, data.players);
            
            const cleanOriginalName = file.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            const targetFilename = `local-${Date.now()}-${cleanOriginalName}`;
            const targetPath = path.join(uploadDir, targetFilename);
            const sourcePath = path.join(resolvedPath, file);
            
            fs.copyFileSync(sourcePath, targetPath);
            updateAssetMetadata(targetFilename, 'local_folder', file);
            
            if (player) {
                const photoUrl = '/uploads/' + targetFilename;
                await data.updatePlayer(player.id, { photo: photoUrl });
                
                if (data.auctionState.currentPlayer && data.auctionState.currentPlayer.id === player.id) {
                    data.auctionState.currentPlayer.photo = photoUrl;
                    await data.saveStateToRedis();
                }
                
                matchedCount++;
                results.push({
                    filename: file,
                    matched: true,
                    playerName: player.name,
                    formNo: player.formNo
                });
            } else {
                unmatchedCount++;
                unmatchedNames.push(file);
                results.push({
                    filename: file,
                    matched: false
                });
            }
        }
        
        await data.syncWithDB();
        broadcastUpdates();
        
        addAuditLog('Local Directory Sync', `Scanned "${resolvedPath}". Matched: ${matchedCount}, Unmatched: ${unmatchedCount}`, 'success');
        
        res.json({
            success: true,
            total: matchedCount + unmatchedCount,
            matched: matchedCount,
            unmatched: unmatchedCount,
            results: results,
            unmatchedNames: unmatchedNames
        });
    } catch (err) {
        console.error('[Media API Local Sync Error]', err);
        addAuditLog('Local Directory Sync Failed', `Failed scanning local path "${pathVal}": ${err.message}`, 'error');
        res.status(500).json({ success: false, error: err.message });
    }
});

// 7. POST /admin/media/bulk-delete - Delete multiple asset files and clear database associations
router.post('/bulk-delete', async (req, res) => {
    const { filenames } = req.body;
    if (!filenames || !Array.isArray(filenames)) {
        return res.status(400).json({ success: false, message: 'Invalid filenames parameter.' });
    }
    
    let deletedCount = 0;
    const metadata = getMetadata();
    
    try {
        for (const file of filenames) {
            const filePath = path.join(uploadDir, file);
            const fileUrl = '/uploads/' + file;
            
            // Delete file from filesystem
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                } catch (e) {
                    console.error(`Error deleting file ${file}:`, e);
                }
            }
            
            // Delete from metadata
            delete metadata[file];
            
            // Nullify player association
            const matchedPlayers = data.players.filter(p => p.photo === fileUrl);
            for (const player of matchedPlayers) {
                await data.updatePlayer(player.id, { photo: null });
                
                if (data.auctionState.currentPlayer && data.auctionState.currentPlayer.id === player.id) {
                    data.auctionState.currentPlayer.photo = null;
                    await data.saveStateToRedis();
                }
            }
            
            // Nullify team association
            const matchedTeams = data.teams.filter(t => t.logo === fileUrl);
            for (const team of matchedTeams) {
                await data.updateTeam(team.id, { logo: null });
            }
        }
        
        saveMetadata(metadata);
        await data.syncWithDB();
        broadcastUpdates();
        
        addAuditLog('Bulk Deletion', `Deleted ${deletedCount} files and removed references from database.`, 'success');
        
        res.json({
            success: true,
            deletedCount: deletedCount
        });
    } catch (err) {
        console.error('[Media API Bulk Delete Error]', err);
        addAuditLog('Bulk Deletion Failed', `Error during bulk delete: ${err.message}`, 'error');
        res.status(500).json({ success: false, error: err.message });
    }
});

// 8. GET /admin/media/export-report - Export photo match details as CSV
router.get('/export-report', (req, res) => {
    try {
        const activeAuctionId = data.auctionDetails ? data.auctionDetails.id : 'active_auction';
        const activePlayers = data.players.filter(p => p.auction_id === activeAuctionId);
        
        let csvContent = 'Form Number,Player Name,Category,Photo Status,Photo URL/Path\n';
        
        activePlayers.forEach(p => {
            const cat = data.categories.find(c => c.id === p.category_id);
            const categoryName = cat ? cat.name : 'None';
            
            let status = 'Missing';
            let photoPath = 'N/A';
            
            if (p.photo) {
                photoPath = p.photo;
                if (p.photo.startsWith('/uploads/')) {
                    const localFilename = p.photo.replace('/uploads/', '');
                    const fullLocalPath = path.join(uploadDir, localFilename);
                    if (fs.existsSync(fullLocalPath)) {
                        status = 'Matched (Local)';
                    } else {
                        status = 'Broken Link (Local File Missing)';
                    }
                } else {
                    status = 'Matched (External Link)';
                }
            }
            
            // Sanitize values for CSV
            const formNo = (p.formNo || '').replace(/"/g, '""');
            const name = (p.name || '').replace(/"/g, '""');
            const category = categoryName.replace(/"/g, '""');
            
            csvContent += `"${formNo}","${name}","${category}","${status}","${photoPath}"\n`;
        });
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=players_photos_report.csv');
        res.status(200).send(csvContent);
    } catch (err) {
        console.error('[Media API Export Report Error]', err);
        res.status(500).send('Error generating photo report: ' + err.message);
    }
});

// 9. GET /admin/media/audit-logs - Fetch latest media operations audit logs
router.get('/audit-logs', (req, res) => {
    try {
        let logs = [];
        if (fs.existsSync(logPath)) {
            logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
        }
        res.json({ success: true, logs });
    } catch (err) {
        console.error('[Media API Audit Logs Error]', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 10. GET /admin/media/download-template - Generate and download sample Excel sheet
router.get('/download-template', (req, res) => {
    try {
        const headers = [['Form Number', 'Player Name', 'Photo URL']];
        const dataRows = [
            ['101', 'John Doe', 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&q=80'],
            ['102', 'Jane Smith', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80']
        ];
        const worksheet = XLSX.utils.aoa_to_sheet(headers.concat(dataRows));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Sample Template');
        
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=player_photos_template.xlsx');
        res.status(200).send(buffer);
    } catch (err) {
        console.error('[Template Download Error]', err);
        res.status(500).send('Error generating template: ' + err.message);
    }
});

// 11. POST /admin/media/preview-excel - Upload and parse spreadsheet columns/preview
router.post('/preview-excel', upload.single('excelFile'), async (req, res) => {
    if (!req.file) {
        return res.json({
            success: false,
            message: 'Validation failed',
            errors: ['No spreadsheet file uploaded']
        });
    }
    
    const { activeAuctionId } = req.body;
    if (activeAuctionId && (!data.auctionDetails || data.auctionDetails.id !== activeAuctionId)) {
        try {
            await data.selectAuction(activeAuctionId);
        } catch (e) {
            console.error('[Preview Select Auction Error]', e);
        }
    }
    
    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    
    try {
        let parsedRows = [];
        if (ext === '.csv') {
            const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').trim();
            const rows = content.split(/\r?\n/);
            parsedRows = rows.map(r => r.split(','));
        } else if (ext === '.xlsx' || ext === '.xls') {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            parsedRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        } else {
            fs.unlinkSync(filePath);
            return res.json({
                success: false,
                message: 'Validation failed',
                errors: ['Unsupported file format. Please upload .csv, .xlsx or .xls']
            });
        }
        
        if (parsedRows.length === 0) {
            fs.unlinkSync(filePath);
            return res.json({
                success: false,
                message: 'Validation failed',
                errors: ['File is empty']
            });
        }
        
        const rawHeaders = parsedRows[0].map(h => String(h).trim());
        
        // Aliases lookup
        const formAliases = ['formno', 'formnumber', 'form', 'playerid', 'srno', 'slno', 'serialnumber', 'no', 'number', 'serialno', 'registrationnumber'];
        const nameAliases = ['name', 'playername', 'player', 'fullname', 'playernames', 'cricketername'];
        const urlAliases = ['photo', 'photourl', 'imageurl', 'image', 'url', 'photolink', 'imagelink', 'playerphoto'];
        
        const normalizeKey = (key) => {
            return String(key).replace(/^\uFEFF/i, '')
                      .replace(/^"+|"+$/g, '')
                      .trim()
                      .toLowerCase()
                      .replace(/[^a-z0-9]/g, '');
        };
        
        const normalizedHeaders = rawHeaders.map(h => normalizeKey(h));
        
        let detectedFormColumn = '';
        let detectedNameColumn = '';
        let detectedUrlColumn = '';
        
        for (let i = 0; i < rawHeaders.length; i++) {
            const norm = normalizedHeaders[i];
            if (formAliases.includes(norm) && !detectedFormColumn) {
                detectedFormColumn = rawHeaders[i];
            } else if (nameAliases.includes(norm) && !detectedNameColumn) {
                detectedNameColumn = rawHeaders[i];
            } else if (urlAliases.includes(norm) && !detectedUrlColumn) {
                detectedUrlColumn = rawHeaders[i];
            }
        }
        
        const previewRows = parsedRows.slice(1, 6).map(row => {
            const rowObj = {};
            rawHeaders.forEach((h, index) => {
                rowObj[h] = row[index] !== undefined ? String(row[index]).trim() : '';
            });
            return rowObj;
        });
        
        res.json({
            success: true,
            message: 'Spreadsheet imported successfully',
            data: {
                tempFilename: req.file.filename,
                availableColumns: rawHeaders,
                totalRows: parsedRows.length - 1,
                detectedFormColumn,
                detectedNameColumn,
                detectedUrlColumn,
                previewRows
            },
            tempFilename: req.file.filename,
            availableColumns: rawHeaders,
            totalRows: parsedRows.length - 1,
            detectedFormColumn,
            detectedNameColumn,
            detectedUrlColumn,
            previewRows
        });
    } catch (err) {
        console.error('[Excel Preview Error]', err);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        return res.status(500).json({
            success: false,
            message: err.message || 'Internal server error'
        });
    }
});

// 12. confirmExcelImportHandler - Run the import processes on the mapped columns (supports both file and raw body)
const confirmExcelImportHandler = async (req, res) => {
    const { tempFilename, formColumn, nameColumn, urlColumn, activeAuctionId, allRows } = req.body;
    
    if (activeAuctionId && (!data.auctionDetails || data.auctionDetails.id !== activeAuctionId)) {
        try {
            await data.selectAuction(activeAuctionId);
        } catch (e) {
            console.error('[Confirm Select Auction Error]', e);
        }
    }
    
    if ((!tempFilename && (!allRows || allRows.length === 0)) || !urlColumn) {
        return res.json({
            success: true,
            message: 'Import completed'
        });
    }
    
    const filePath = tempFilename ? path.join(uploadDir, tempFilename) : null;
    if (filePath && !allRows && !fs.existsSync(filePath)) {
        return res.json({
            success: false,
            message: 'Validation failed',
            errors: ['Spreadsheet file not found or expired']
        });
    }
    
    const ext = tempFilename ? path.extname(tempFilename).toLowerCase() : '';
    
    let totalRows = 0;
    let matchedCount = 0;
    let failedCount = 0;
    const resultsList = [];
    
    try {
        let parsedRows = [];
        if (allRows && Array.isArray(allRows) && allRows.length > 0) {
            parsedRows = allRows;
        } else if (filePath) {
            if (ext === '.csv') {
                const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').trim();
                const rows = content.split(/\r?\n/);
                parsedRows = rows.map(r => r.split(','));
            } else if (ext === '.xlsx' || ext === '.xls') {
                const workbook = XLSX.readFile(filePath);
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                parsedRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
            }
        }
        
        if (parsedRows.length < 2) {
            if (filePath && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            return res.json({
                success: false,
                message: 'Validation failed',
                errors: ['Spreadsheet has no data rows']
            });
        }
        
        const rawHeaders = parsedRows[0].map(h => String(h).trim());
        
        const formIndex = formColumn && formColumn !== 'none' ? rawHeaders.indexOf(formColumn) : -1;
        const nameIndex = nameColumn && nameColumn !== 'none' ? rawHeaders.indexOf(nameColumn) : -1;
        const urlIndex = rawHeaders.indexOf(urlColumn);
        
        if (urlIndex === -1) {
            if (filePath && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            return res.json({
                success: false,
                message: 'Validation failed',
                errors: [`Photo URL column "${urlColumn}" not found in spreadsheet`]
            });
        }
        
        const rowsToProcess = [];
        for (let i = 1; i < parsedRows.length; i++) {
            const row = parsedRows[i];
            if (row.length === 0 || row.every(v => v === undefined || v === null || String(v).trim() === '')) {
                continue;
            }
            rowsToProcess.push({ index: i, row });
        }
        
        totalRows = rowsToProcess.length;
        
        const processRow = async ({ index, row }) => {
            const formVal = formIndex !== -1 && row[formIndex] !== undefined ? String(row[formIndex]).trim() : '';
            const nameVal = nameIndex !== -1 && row[nameIndex] !== undefined ? String(row[nameIndex]).trim() : '';
            const urlVal = row[urlIndex] !== undefined ? String(row[urlIndex]).trim() : '';
            
            if (!urlVal) {
                failedCount++;
                resultsList.push({
                    row: index + 1,
                    status: 'failed',
                    identifier: formVal || nameVal || `Row ${index + 1}`,
                    reason: 'Missing Photo URL'
                });
                return;
            }
            
            let player = null;
            if (formVal) {
                player = data.players.find(p => {
                    if (!p.formNo) return false;
                    const dbFormStr = p.formNo.toString().trim().toLowerCase();
                    const fileFormStr = formVal.trim().toLowerCase();
                    if (dbFormStr === fileFormStr) return true;
                    const dbFormInt = parseInt(dbFormStr, 10);
                    const fileFormInt = parseInt(fileFormStr, 10);
                    return (!isNaN(dbFormInt) && !isNaN(fileFormInt) && dbFormInt === fileFormInt);
                });
            }
            if (!player && nameVal) {
                player = data.players.find(p => p.name && p.name.trim().toLowerCase() === nameVal.toLowerCase());
            }
            
            if (!player) {
                failedCount++;
                resultsList.push({
                    row: index + 1,
                    status: 'failed',
                    identifier: formVal || nameVal || `Row ${index + 1}`,
                    reason: `Player not found (Form No: "${formVal}", Name: "${nameVal}")`
                });
                return;
            }
            
            try {
                const targetFilename = `excel-${player.id}-${Date.now()}.jpg`;
                const destPath = path.join(uploadDir, targetFilename);
                
                await downloadUrlToFile(urlVal, destPath);
                updateAssetMetadata(targetFilename, 'spreadsheet', urlVal);
                
                const photoUrl = '/uploads/' + targetFilename;
                await data.updatePlayer(player.id, { photo: photoUrl });
                
                if (data.auctionState.currentPlayer && data.auctionState.currentPlayer.id === player.id) {
                    data.auctionState.currentPlayer.photo = photoUrl;
                    await data.saveStateToRedis();
                }
                
                matchedCount++;
                resultsList.push({
                    row: index + 1,
                    status: 'success',
                    identifier: `${player.name} [#${player.formNo || 'N/A'}]`,
                    reason: 'Successfully imported & updated'
                });
            } catch (e) {
                console.error(`[Excel Link Sync Error] Row ${index+1}:`, e.message);
                failedCount++;
                resultsList.push({
                    row: index + 1,
                    status: 'failed',
                    identifier: `${player.name} [#${player.formNo || 'N/A'}]`,
                    reason: `Failed to download URL. Error: ${e.message}`
                });
            }
        };
        
        // Execute concurrently (up to 5 items in parallel)
        const concurrencyLimit = 5;
        const chunks = [];
        for (let i = 0; i < rowsToProcess.length; i += concurrencyLimit) {
            chunks.push(rowsToProcess.slice(i, i + concurrencyLimit));
        }
        
        for (const chunk of chunks) {
            await Promise.all(chunk.map(item => processRow(item)));
        }
        
        // Ensure sorted resultsList by row index
        resultsList.sort((a, b) => a.row - b.row);
        
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        await data.syncWithDB();
        broadcastUpdates();
        
        addAuditLog('Spreadsheet URL Sync', `Interactive Sync. Total: ${totalRows}, Matched: ${matchedCount}, Failed: ${failedCount}`, 'success');
        
        res.json({
            success: true,
            message: 'Import completed',
            data: {
                total: totalRows,
                matched: matchedCount,
                failed: failedCount,
                results: resultsList
            },
            total: totalRows,
            matched: matchedCount,
            failed: failedCount,
            results: resultsList
        });
        
    } catch (err) {
        console.error('[Confirm Import Error]', err);
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        return res.status(500).json({
            success: false,
            message: err.message || 'Internal server error'
        });
    }
};

router.post('/', confirmExcelImportHandler);
router.post('/confirm-excel-import', confirmExcelImportHandler);
router.post('/confirm-import', confirmExcelImportHandler);
router.post('/import', confirmExcelImportHandler);

router.confirmExcelImportHandler = confirmExcelImportHandler;

// 11. POST /admin/media/gdrive-folder - Scrape and sync public Google Drive folder images
router.post('/gdrive-folder', async (req, res) => {
    const { pathVal, activeAuctionId } = req.body;
    
    if (activeAuctionId && (!data.auctionDetails || data.auctionDetails.id !== activeAuctionId)) {
        try {
            await data.selectAuction(activeAuctionId);
        } catch (e) {
            console.error('[GDrive Folder Select Auction Error]', e);
        }
    }
    
    if (!pathVal) {
        return res.json({ success: false, message: 'Google Drive folder link is required.' });
    }

    try {
        const folderIdMatch = pathVal.match(/(?:\/d\/|folders\/|id=)([a-zA-Z0-9_-]{10,})/);
        if (!folderIdMatch) {
            return res.json({ success: false, message: 'Invalid Google Drive folder link format.' });
        }
        const folderId = folderIdMatch[1];
        const url = `https://drive.google.com/embeddedfolderview?id=${folderId}`;

        console.log(`[GDrive Sync] Fetching folder page: ${url}`);
        const driveRes = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (!driveRes.ok) {
            return res.json({ success: false, message: 'Failed to access Google Drive folder. Please verify permissions.' });
        }

        const html = await driveRes.text();
        const entryPattern = /class="flip-entry"[^>]*id="entry-([a-zA-Z0-9_-]+)"[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>/g;
        const filesFound = [];
        let match;
        while ((match = entryPattern.exec(html)) !== null) {
            filesFound.push({
                id: match[1],
                name: match[2]
            });
        }

        if (filesFound.length === 0) {
            return res.json({ success: false, message: 'No files found in Google Drive folder. Ensure it is public.' });
        }

        let matchedCount = 0;
        let unmatchedCount = 0;
        const results = [];
        const unmatchedNames = [];

        const processFile = async (file) => {
            const originalName = file.name;
            const player = findMatchedPlayer(originalName, data.players);
            
            const cleanOriginalName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            const targetFilename = `gdrive-${file.id}-${Date.now()}-${cleanOriginalName}`;
            const targetPath = path.join(uploadDir, targetFilename);

            if (player) {
                try {
                    await downloadUrlToFile(`https://drive.google.com/uc?export=download&id=${file.id}`, targetPath);
                    updateAssetMetadata(targetFilename, 'gdrive', originalName);
                    
                    const photoUrl = '/uploads/' + targetFilename;
                    await data.updatePlayer(player.id, { photo: photoUrl });

                    if (data.auctionState.currentPlayer && data.auctionState.currentPlayer.id === player.id) {
                        data.auctionState.currentPlayer.photo = photoUrl;
                        await data.saveStateToRedis();
                    }
                    matchedCount++;
                    results.push({ filename: originalName, matched: true, playerName: player.name });
                } catch (e) {
                    console.error(`[GDrive Folder Sync] Error downloading file ${originalName}:`, e.message);
                    unmatchedCount++;
                    unmatchedNames.push(`${originalName} (Download Error: ${e.message})`);
                }
            } else {
                unmatchedCount++;
                unmatchedNames.push(originalName);
                results.push({ filename: originalName, matched: false });
            }
        };

        // Chunk files processing (up to 5 concurrently)
        const concurrencyLimit = 5;
        const chunks = [];
        for (let i = 0; i < filesFound.length; i += concurrencyLimit) {
            chunks.push(filesFound.slice(i, i + concurrencyLimit));
        }
        
        for (const chunk of chunks) {
            await Promise.all(chunk.map(file => processFile(file)));
        }

        await data.syncWithDB();
        broadcastUpdates();

        addAuditLog('Google Drive Folder Sync', `Scraped GDrive folder. Total: ${filesFound.length}, Matched: ${matchedCount}, Unmatched: ${unmatchedCount}`, 'success');

        res.json({
            success: true,
            total: filesFound.length,
            matched: matchedCount,
            unmatched: unmatchedCount,
            results: results,
            unmatchedNames: unmatchedNames
        });

    } catch (err) {
        console.error('[GDrive Folder Sync Error]', err);
        addAuditLog('Google Drive Folder Sync Failed', `Failed scraping folder: ${err.message}`, 'error');
        res.status(500).json({ success: false, error: err.message });
    }
});

// 12. POST /admin/media/bulk-excel-import - Upload spreadsheet and auto-sync player photos
router.post('/bulk-excel-import', upload.single('excelFile'), async (req, res) => {
    if (!req.file) {
        return res.json({
            success: false,
            message: 'Validation failed',
            errors: ['No spreadsheet file uploaded']
        });
    }

    const { activeAuctionId } = req.body;
    if (activeAuctionId && (!data.auctionDetails || data.auctionDetails.id !== activeAuctionId)) {
        try {
            await data.selectAuction(activeAuctionId);
        } catch (e) {
            console.error('[Bulk Excel Select Auction Error]', e);
        }
    }

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    
    try {
        let parsedRows = [];
        if (ext === '.csv') {
            const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').trim();
            const rows = content.split(/\r?\n/);
            parsedRows = rows.map(r => r.split(','));
        } else if (ext === '.xlsx' || ext === '.xls') {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            parsedRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        } else {
            fs.unlinkSync(filePath);
            return res.json({
                success: false,
                message: 'Validation failed',
                errors: ['Unsupported file format. Please upload .csv, .xlsx or .xls']
            });
        }

        if (parsedRows.length < 2) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.json({
                success: false,
                message: 'Validation failed',
                errors: ['Spreadsheet is empty or has no data rows']
            });
        }

        const rawHeaders = parsedRows[0].map(h => String(h).trim());
        const normalizeHeader = (h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const normalizedHeaders = rawHeaders.map(h => normalizeHeader(h));

        // Column Aliases
        const playerIDAliases = ['playerid', 'id'];
        const formNumberAliases = ['formnumber', 'formno', 'form', 'formnumberorplayername'];
        const playerNumberAliases = ['playernumber', 'number', 'registrationnumber', 'regnumber', 'jerseynumber'];
        const playerNameAliases = ['playername', 'name', 'formnumberorplayername'];
        const photoUrlAliases = ['photourl', 'imageurl', 'photolink', 'imagelink', 'photo', 'url'];

        let playerIdIdx = -1;
        let formNoIdx = -1;
        let playerNumIdx = -1;
        let playerNameIdx = -1;
        let photoUrlIdx = -1;

        for (let i = 0; i < rawHeaders.length; i++) {
            const norm = normalizedHeaders[i];
            if (playerIDAliases.includes(norm) && playerIdIdx === -1) playerIdIdx = i;
            if (formNumberAliases.includes(norm) && formNoIdx === -1) formNoIdx = i;
            if (playerNumberAliases.includes(norm) && playerNumIdx === -1) playerNumIdx = i;
            if (playerNameAliases.includes(norm) && playerNameIdx === -1) playerNameIdx = i;
            if (photoUrlAliases.includes(norm) && photoUrlIdx === -1) photoUrlIdx = i;
        }

        // If not found, try simple contains/substring match
        for (let i = 0; i < rawHeaders.length; i++) {
            const norm = normalizedHeaders[i];
            if (photoUrlIdx === -1 && (norm.includes('url') || norm.includes('link') || norm.includes('photo') || norm.includes('image'))) {
                photoUrlIdx = i;
            }
            if (formNoIdx === -1 && (norm.includes('form') || norm.includes('sr'))) {
                formNoIdx = i;
            }
            if (playerNameIdx === -1 && (norm.includes('name') || norm.includes('player'))) {
                playerNameIdx = i;
            }
        }

        if (photoUrlIdx === -1) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.json({
                success: false,
                message: 'Validation failed',
                errors: ['Could not auto-detect Photo URL column in spreadsheet']
            });
        }

        let total = 0;
        let matched = 0;
        let failed = 0;
        let skipped = 0;
        let matchedById = 0;
        let matchedByFormNo = 0;
        let matchedByPlayerNo = 0;
        let matchedByName = 0;
        let unmatchedCount = 0;
        const unmatchedList = [];

        const rowsToProcess = parsedRows.slice(1).filter(row => {
            return row.length > 0 && row.some(v => v !== undefined && v !== null && String(v).trim() !== '');
        });

        total = rowsToProcess.length;

        const processRow = async (row) => {
            const urlVal = row[photoUrlIdx] !== undefined ? String(row[photoUrlIdx]).trim() : '';
            if (!urlVal) {
                skipped++;
                return;
            }

            // Find player using mapped columns and priority order
            let player = null;
            let matchedBy = '';

            // 1. Player ID
            if (playerIdIdx !== -1 && row[playerIdIdx]) {
                const val = String(row[playerIdIdx]).trim();
                player = data.players.find(p => p.id && String(p.id).trim() === val);
                if (player) matchedBy = 'Player ID';
            }

            // 2. Form Number
            if (!player && formNoIdx !== -1 && row[formNoIdx]) {
                const val = String(row[formNoIdx]).trim();
                const valInt = parseInt(val, 10);
                player = data.players.find(p => {
                    if (!p.formNo) return false;
                    const dbFormStr = String(p.formNo).trim();
                    if (dbFormStr === val) return true;
                    const dbFormInt = parseInt(dbFormStr, 10);
                    return (!isNaN(dbFormInt) && !isNaN(valInt) && dbFormInt === valInt);
                });
                if (player) matchedBy = 'Form Number';
            }

            // 3. Player Number / Registration Number / Jersey Number
            if (!player && playerNumIdx !== -1 && row[playerNumIdx]) {
                const val = String(row[playerNumIdx]).trim();
                const valInt = parseInt(val, 10);
                player = data.players.find(p => {
                    if (!p.jerseyNumber) return false;
                    const dbJerseyStr = String(p.jerseyNumber).trim();
                    if (dbJerseyStr === val) return true;
                    const dbJerseyInt = parseInt(dbJerseyStr, 10);
                    return (!isNaN(dbJerseyInt) && !isNaN(valInt) && dbJerseyInt === valInt);
                });
                if (player) matchedBy = 'Player Number';
            }

            // 4. Player Name
            if (!player && playerNameIdx !== -1 && row[playerNameIdx]) {
                const val = String(row[playerNameIdx]).trim().toLowerCase();
                player = data.players.find(p => p.name && p.name.trim().toLowerCase() === val);
                if (player) matchedBy = 'Player Name';
            }

            // Fallback match on all cells
            if (!player) {
                for (let i = 0; i < row.length; i++) {
                    if (i === photoUrlIdx || row[i] === undefined || row[i] === null || String(row[i]).trim() === '') continue;
                    const cellVal = String(row[i]).trim();
                    const match = findMatchedPlayerByPriority(cellVal, data.players);
                    if (match) {
                        player = match.player;
                        matchedBy = match.matchedBy;
                        break;
                    }
                }
            }

            if (!player) {
                unmatchedCount++;
                const rowIdentifier = (playerNameIdx !== -1 && row[playerNameIdx]) || (formNoIdx !== -1 && row[formNoIdx]) || `Row ${parsedRows.indexOf(row) + 1}`;
                unmatchedList.push(String(rowIdentifier));
                return;
            }

            // CHECK IF PHOTO IS ALREADY UPLOADED
            if (player.photo) {
                skipped++;
                unmatchedList.push(`${player.name} (Photo already uploaded)`);
                return;
            }

            // Download and assign
            try {
                const targetFilename = `excel-${player.id}-${Date.now()}.jpg`;
                const destPath = path.join(uploadDir, targetFilename);
                await downloadUrlToFile(urlVal, destPath);
                updateAssetMetadata(targetFilename, 'spreadsheet', urlVal);

                const photoUrl = '/uploads/' + targetFilename;
                await data.updatePlayer(player.id, { photo: photoUrl });

                if (data.auctionState.currentPlayer && data.auctionState.currentPlayer.id === player.id) {
                    data.auctionState.currentPlayer.photo = photoUrl;
                    await data.saveStateToRedis();
                }

                matched++;
                if (matchedBy === 'Player ID') matchedById++;
                else if (matchedBy === 'Form Number') matchedByFormNo++;
                else if (matchedBy === 'Player Number') matchedByPlayerNo++;
                else if (matchedBy === 'Player Name') matchedByName++;
            } catch (err) {
                console.error(`[Bulk Excel Sync Error] Row processing failed:`, err.message);
                failed++;
            }
        };

        // Execute concurrently (up to 5 in parallel)
        const concurrencyLimit = 5;
        const chunks = [];
        for (let i = 0; i < rowsToProcess.length; i += concurrencyLimit) {
            chunks.push(rowsToProcess.slice(i, i + concurrencyLimit));
        }

        for (const chunk of chunks) {
            await Promise.all(chunk.map(row => processRow(row)));
        }

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        await data.syncWithDB();
        broadcastUpdates();

        res.json({
            success: true,
            message: 'Spreadsheet imported successfully',
            data: {
                total: total,
                matched: matched,
                failed: failed,
                skipped: skipped,
                matchedById: matchedById,
                matchedByFormNo: matchedByFormNo,
                matchedByPlayerNo: matchedByPlayerNo,
                matchedByName: matchedByName,
                unmatched: unmatchedCount,
                unmatchedList: unmatchedList
            }
        });
    } catch (err) {
        console.error('[Bulk Excel Import Handler Error]', err);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// 13. POST /admin/media/bulk-gdrive-import - Sync player photos from Google Drive URL
router.post('/bulk-gdrive-import', async (req, res) => {
    const { url, activeAuctionId } = req.body;
    if (activeAuctionId && (!data.auctionDetails || data.auctionDetails.id !== activeAuctionId)) {
        try {
            await data.selectAuction(activeAuctionId);
        } catch (e) {
            console.error('[Bulk GDrive Select Auction Error]', e);
        }
    }

    if (!url) {
        return res.json({ success: false, message: 'Google Drive URL is required.' });
    }

    try {
        const fileIdMatch = url.match(/(?:\/d\/|folders\/|id=)([a-zA-Z0-9_-]{10,})/);
        if (!fileIdMatch) {
            return res.json({ success: false, message: 'Could not extract File or Folder ID from Google Drive URL.' });
        }
        const driveId = fileIdMatch[1];
        const isFolder = url.includes('folders/') || url.includes('embeddedfolderview'); 
        
        let filesFound = [];
        if (isFolder) {
            const embedUrl = `https://drive.google.com/embeddedfolderview?id=${driveId}`;
            const driveRes = await fetch(embedUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (!driveRes.ok) {
                return res.json({ success: false, message: 'Failed to access Google Drive folder. Please verify permissions.' });
            }
            const html = await driveRes.text();
            const entryPattern = /class="flip-entry"[^>]*id="entry-([a-zA-Z0-9_-]+)"[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>/g;
            let match;
            while ((match = entryPattern.exec(html)) !== null) {
                filesFound.push({
                    id: match[1],
                    name: match[2]
                });
            }
            if (filesFound.length === 0) {
                return res.json({ success: false, message: 'No files found in Google Drive folder. Ensure it is public.' });
            }
        } else {
            const fileName = await getGDriveFileName(driveId) || `gdrive_file_${driveId}.jpg`;
            filesFound.push({
                id: driveId,
                name: fileName
            });
        }

        let total = filesFound.length;
        let matched = 0;
        let failed = 0;
        let skipped = 0;
        let matchedById = 0;
        let matchedByFormNo = 0;
        let matchedByPlayerNo = 0;
        let matchedByName = 0;
        let unmatchedCount = 0;
        const unmatchedList = [];

        const processFile = async (file) => {
            const originalName = file.name;
            const nameWithoutExt = path.parse(originalName).name.trim();

            const match = findMatchedPlayerByPriority(nameWithoutExt, data.players);
            if (!match) {
                unmatchedCount++;
                unmatchedList.push(originalName);
                return;
            }

            const { player, matchedBy } = match;

            // CHECK IF PHOTO IS ALREADY UPLOADED
            if (player.photo) {
                skipped++;
                unmatchedList.push(`${originalName} (Photo already uploaded for ${player.name})`);
                return;
            }

            const cleanOriginalName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            const targetFilename = `gdrive-${file.id}-${Date.now()}-${cleanOriginalName}`;
            const targetPath = path.join(uploadDir, targetFilename);

            try {
                await downloadUrlToFile(`https://drive.google.com/uc?export=download&id=${file.id}`, targetPath);
                updateAssetMetadata(targetFilename, 'gdrive', originalName);
                
                const photoUrl = '/uploads/' + targetFilename;
                await data.updatePlayer(player.id, { photo: photoUrl });

                if (data.auctionState.currentPlayer && data.auctionState.currentPlayer.id === player.id) {
                    data.auctionState.currentPlayer.photo = photoUrl;
                    await data.saveStateToRedis();
                }

                matched++;
                if (matchedBy === 'Player ID') matchedById++;
                else if (matchedBy === 'Form Number') matchedByFormNo++;
                else if (matchedBy === 'Player Number') matchedByPlayerNo++;
                else if (matchedBy === 'Player Name') matchedByName++;
            } catch (e) {
                console.error(`[GDrive Sync] Error processing file ${originalName}:`, e.message);
                failed++;
            }
        };

        // Chunk files processing (up to 5 concurrently)
        const concurrencyLimit = 5;
        const chunks = [];
        for (let i = 0; i < filesFound.length; i += concurrencyLimit) {
            chunks.push(filesFound.slice(i, i + concurrencyLimit));
        }
        
        for (const chunk of chunks) {
            await Promise.all(chunk.map(file => processFile(file)));
        }

        await data.syncWithDB();
        broadcastUpdates();

        res.json({
            success: true,
            message: 'Google Drive sync completed',
            data: {
                total: total,
                matched: matched,
                failed: failed,
                skipped: skipped,
                matchedById: matchedById,
                matchedByFormNo: matchedByFormNo,
                matchedByPlayerNo: matchedByPlayerNo,
                matchedByName: matchedByName,
                unmatched: unmatchedCount,
                unmatchedList: unmatchedList
            }
        });
    } catch (err) {
        console.error('[Bulk GDrive Import Error]', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
