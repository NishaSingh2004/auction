const express = require('express');
const router = express.Router();
const data = require('../models/data');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');


const authMiddleware = async (req, res, next) => {
    const cookies = req.headers.cookie;
    let username = null;
    if (cookies) {
        const adCookie = cookies.split(';').find(c => c.trim().startsWith('admin_session='));
        const saCookie = cookies.split(';').find(c => c.trim().startsWith('superadmin_session='));
        const legacyCookie = cookies.split(';').find(c => c.trim().startsWith('session='));
        
        // Prioritize admin session if testing side-by-side, otherwise fallback to superadmin or legacy
        const sessionCookie = adCookie || saCookie || legacyCookie;
        if (sessionCookie) {
            username = decodeURIComponent(sessionCookie.split('=')[1]);
        }
    }
    if (username) {
        const result = await data.db.query("SELECT * FROM users WHERE username = $1", [username]);
        req.user = result.rows[0];
        
        if (!req.user && username === 'superadmin') {
            req.user = { username: 'superadmin', role: 'superadmin', permissions: [] };
        } else if (req.user && username === 'superadmin') {
            req.user.role = 'superadmin';
        }

        if (!req.user && username === 'admin') {
            req.user = { username: 'admin', role: 'admin', permissions: [] };
        }
        
        if (req.user && req.user.permissions && typeof req.user.permissions === 'string') {
            try { req.user.permissions = JSON.parse(req.user.permissions); } catch(e) { req.user.permissions = []; }
        } else if (req.user && !req.user.permissions) {
            req.user.permissions = [];
        }
    }
    
    if (!req.user) {
        return res.redirect('/');
    }
    next();
};
router.use(authMiddleware);

const broadcastUpdates = () => {
    if (global.io) {
        global.io.emit('dataUpdate', { teams: data.teams, players: data.players, categories: data.categories });
        global.io.emit('auctionUpdate', data.auctionState);
    }
};

async function downloadGDriveFile(fileId, destPath) {
    const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch file from Google Drive. HTTP Status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(destPath, buffer);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, '../public/uploads');
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

router.get('/dashboard', (req, res) => {
    res.render('admin/dashboard', { data, user: req.user });
});

router.get('/teams', (req, res) => {
    res.render('admin/teams', { teams: data.teams });
});

router.get('/players', (req, res) => {
    res.render('admin/players', { players: data.players, categories: data.categories });
});

router.get('/auction', (req, res) => {
    res.render('admin/auction', { data });
});

router.post('/add-team', upload.single('logo'), async (req, res) => {
    const { name, color, shortName, shortcutKey } = req.body;
    const logoUrl = req.file ? '/uploads/' + req.file.filename : null;
    const pointsPerTeam = data.auctionDetails && data.auctionDetails.pointsPerTeam ? parseInt(data.auctionDetails.pointsPerTeam) : 100000;
    await data.addTeam({ 
        id: Date.now().toString(), 
        name, 
        budget: pointsPerTeam, 
        color: color || '#3b82f6',
        logo: logoUrl,
        shortName: shortName || '',
        shortcutKey: shortcutKey || ''
    });
    broadcastUpdates();
    res.json({ success: true, teams: data.teams });
});

router.post('/add-player', upload.single('photo'), async (req, res) => {
    const { 
        name, basePrice, role, phone, 
        formNo, age, fatherName, tagOwner, customTag,
        specification1, specification2, specification3,
        tshirtSize, jerseyName, jerseyNumber, trouserSize, detail
    } = req.body;
    const photoUrl = req.file ? '/uploads/' + req.file.filename : null;
    
    // Check for duplicate formNo
    if (formNo) {
        const activeAuctionId = (req.session && req.session.activeAuctionId) || (data.auctionDetails ? data.auctionDetails.id : 'active_auction');
        const existingPlayer = data.players.find(p => p.formNo === formNo && p.auction_id === activeAuctionId);
        if (existingPlayer) {
            return res.json({ success: false, message: 'Form Number already exists for another player in this auction!' });
        }
    }
    await data.addPlayer({
        id: Date.now().toString(),
        name,
        basePrice: (parseInt(basePrice) > 0) ? parseInt(basePrice) : (data.auctionDetails && data.auctionDetails.baseBid ? parseInt(data.auctionDetails.baseBid) : 1000),
        role: role || 'Batsman',
        status: 'available',
        soldTo: null,
        soldPrice: null,
        phone: phone || null,
        photo: photoUrl,
        formNo: formNo || '',
        age: age ? parseInt(age) : null,
        fatherName: fatherName || '',
        tagOwner: tagOwner || '',
        customTag: customTag || '',
        specification1: specification1 || '',
        specification2: specification2 || '',
        specification3: specification3 || '',
        tshirtSize: tshirtSize || '',
        jerseyName: jerseyName || '',
        jerseyNumber: jerseyNumber || '',
        trouserSize: trouserSize || '',
        detail: detail || ''
    });
    broadcastUpdates();
    res.json({ success: true, players: data.players });
});

router.post('/edit-team', upload.single('logo'), async (req, res) => {
    const { teamId, name, color, shortName, shortcutKey } = req.body;
    const logoUrl = req.file ? '/uploads/' + req.file.filename : undefined;
    
    const team = data.teams.find(t => t.id === teamId);
    if (!team) return res.json({ success: false, message: 'Team not found' });
    
    const updatedFields = {
        name,
        color,
        shortName: shortName || '',
        shortcutKey: shortcutKey || ''
    };
    if (logoUrl !== undefined) {
        updatedFields.logo = logoUrl;
    }
    
    await data.updateTeam(teamId, updatedFields);
    broadcastUpdates();
    res.json({ success: true, teams: data.teams });
});

router.post('/edit-player', upload.single('photo'), async (req, res) => {
    const { 
        playerId, name, basePrice, role, phone, 
        formNo, age, fatherName, tagOwner, customTag,
        specification1, specification2, specification3,
        tshirtSize, jerseyName, jerseyNumber, trouserSize, detail, category_id
    } = req.body;
    const photoUrl = req.file ? '/uploads/' + req.file.filename : undefined;
    
    const player = data.players.find(p => p.id === playerId);
    if (!player) return res.json({ success: false, message: 'Player not found' });

    // Check for duplicate formNo
    if (formNo && formNo !== player.formNo) {
        const activeAuctionId = (req.session && req.session.activeAuctionId) || (data.auctionDetails ? data.auctionDetails.id : 'active_auction');
        const existingPlayer = data.players.find(p => p.formNo === formNo && p.id !== playerId && p.auction_id === activeAuctionId);
        if (existingPlayer) {
            return res.json({ success: false, message: 'Form Number already exists for another player in this auction!' });
        }
    }
    
    const updatedFields = {
        name,
        basePrice: (parseInt(basePrice) > 0) ? parseInt(basePrice) : (data.auctionDetails && data.auctionDetails.baseBid ? parseInt(data.auctionDetails.baseBid) : 1000),
        role: role || 'Batsman',
        phone: phone || null,
        formNo: formNo || '',
        age: age ? parseInt(age) : null,
        fatherName: fatherName || '',
        tagOwner: tagOwner || '',
        customTag: customTag || '',
        specification1: specification1 || '',
        specification2: specification2 || '',
        specification3: specification3 || '',
        tshirtSize: tshirtSize || '',
        jerseyName: jerseyName || '',
        jerseyNumber: jerseyNumber || '',
        trouserSize: trouserSize || '',
        detail: detail || '',
        category_id: category_id || null
    };
    if (photoUrl !== undefined) {
        updatedFields.photo = photoUrl;
    }
    
    await data.updatePlayer(playerId, updatedFields);
    broadcastUpdates();
    res.json({ success: true, players: data.players });
});

const normalizeKey = (key) => {
    return key.replace(/^\uFEFF/i, '')
              .replace(/^"+|"+$/g, '')
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '');
};

const parseCSV = (content, separator = ',') => {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;
    
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const nextChar = content[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentField += '"';
                i++; // Skip the next quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === separator && !inQuotes) {
            currentRow.push(currentField.trim());
            currentField = '';
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                i++; // Skip LF in CRLF
            }
            currentRow.push(currentField.trim());
            if (currentRow.length > 0 && !(currentRow.length === 1 && currentRow[0] === '')) {
                rows.push(currentRow);
            }
            currentRow = [];
            currentField = '';
        } else {
            currentField += char;
        }
    }
    
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.length > 0 && !(currentRow.length === 1 && currentRow[0] === '')) {
            rows.push(currentRow);
        }
    }
    
    return rows;
};

const parseExcel = (filePath) => {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    return rows;
};

router.post('/upload-players', upload.single('csvFile'), async (req, res) => {
    if (!req.file) {
        return res.json({
            success: false,
            message: 'Validation failed',
            errors: ['No file uploaded']
        });
    }

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    console.log(`[DEBUG] Detected file type: ${ext}`);

    try {
        let parsedRows = [];

        if (ext === '.csv') {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const cleanContent = fileContent.replace(/^\uFEFF/, '').trim();
            if (!cleanContent) {
                fs.unlinkSync(filePath);
                return res.json({
                    success: false,
                    message: 'Validation failed',
                    errors: ['Uploaded CSV file is empty.']
                });
            }

            // Auto-detect separator: comma or semicolon based on the first line
            let firstLine = '';
            let inQuotes = false;
            for (let i = 0; i < cleanContent.length; i++) {
                const char = cleanContent[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if ((char === '\n' || char === '\r') && !inQuotes) {
                    firstLine = cleanContent.substring(0, i);
                    break;
                }
            }
            if (!firstLine) firstLine = cleanContent;

            const commaCount = (firstLine.match(/,/g) || []).length;
            const semicolonCount = (firstLine.match(/;/g) || []).length;
            const separator = semicolonCount > commaCount ? ';' : ',';

            parsedRows = parseCSV(cleanContent, separator);
        } else if (ext === '.xlsx' || ext === '.xls') {
            parsedRows = parseExcel(filePath);
        } else {
            fs.unlinkSync(filePath);
            return res.json({
                success: false,
                message: 'Validation failed',
                errors: ['Unsupported file format. Please upload a .csv, .xlsx, or .xls file.']
            });
        }

        console.log(`[DEBUG] Total parsed rows: ${parsedRows.length}`);

        if (parsedRows.length < 2) {
            fs.unlinkSync(filePath);
            return res.json({
                success: false,
                message: 'Validation failed',
                errors: ['Uploaded file must contain a header row and at least one data row.']
            });
        }

        // Parse headers
        const originalHeaders = parsedRows[0];
        const headers = originalHeaders.map(h => normalizeKey(String(h)));

        if (headers.length === 0 || headers.every(h => h === '')) {
            fs.unlinkSync(filePath);
            return res.json({
                success: false,
                message: 'Validation failed',
                errors: ['Invalid file format: no valid column headers found.']
            });
        }

        // Check if headers contain a Player Name column (the only strictly required column)
        const hasNameHeader = headers.some(h => ['name', 'playername', 'player', 'fullname', 'playernames', 'cricketername'].includes(h));
        const hasRoleHeader = headers.some(h => ['role', 'category', 'playerrole', 'type', 'specialization', 'playingstyle', 'style', 'position', 'playingrole'].includes(h));
        const hasPriceHeader = headers.some(h => ['baseprice', 'price', 'startingprice', 'bidprice', 'auctionprice', 'basebid', 'basevalue', 'cost', 'value', 'amount', 'bid', 'startprice'].includes(h));

        // Debugging logs for detected headers
        console.log(`[DEBUG] detected headers:`, originalHeaders);
        console.log(`[DEBUG] normalized headers:`, headers);
        console.log(`[DEBUG] mapped fields: Name exists: ${hasNameHeader}, Role exists: ${hasRoleHeader}, Price exists: ${hasPriceHeader}`);

        if (!hasNameHeader) {
            fs.unlinkSync(filePath);
            return res.json({ 
                success: false, 
                message: 'Validation failed',
                errors: ['Uploaded file is missing a required column for Player Name.']
            });
        }

        let totalRows = 0;
        let successfulReg = 0;
        let failedReg = 0;
        const results = [];
        const activeAuctionId = (data.auctionDetails ? data.auctionDetails.id : 'active_auction');

        // Loop through data rows
        for (let i = 1; i < parsedRows.length; i++) {
            const rawRow = parsedRows[i];
            if (rawRow.length === 0 || rawRow.every(v => v === undefined || v === null || String(v).trim() === '')) {
                // Skip empty rows
                continue;
            }

            totalRows++;

            // Map row data using normalized headers
            const normalizedRow = {};
            for (let j = 0; j < headers.length; j++) {
                const head = headers[j];
                const rawVal = rawRow[j] !== undefined && rawRow[j] !== null ? String(rawRow[j]) : '';
                if (head) {
                    normalizedRow[head] = rawVal.replace(/^\uFEFF/i, '').replace(/^"+|"+$/g, '').trim();
                }
            }

            // Extract values dynamically using possible mappings
            const name = normalizedRow['name'] || normalizedRow['playername'] || normalizedRow['player'] || normalizedRow['fullname'] || normalizedRow['playernames'] || normalizedRow['cricketername'] || '';
            const rawRole = normalizedRow['role'] || normalizedRow['category'] || normalizedRow['playerrole'] || normalizedRow['type'] || normalizedRow['specialization'] || normalizedRow['playingstyle'] || normalizedRow['style'] || normalizedRow['position'] || normalizedRow['playingrole'] || '';
            const rawPrice = normalizedRow['baseprice'] || normalizedRow['price'] || normalizedRow['startingprice'] || normalizedRow['bidprice'] || normalizedRow['auctionprice'] || normalizedRow['basebid'] || normalizedRow['basevalue'] || normalizedRow['cost'] || normalizedRow['value'] || normalizedRow['amount'] || normalizedRow['bid'] || normalizedRow['startprice'] || '';

            // Validation: Skip rows if player name is missing / empty
            if (!name.trim()) {
                console.log(`[CSV/Excel Parser] Row ${i} skipped: player name missing`);
                failedReg++;
                continue;
            }

            // Parse and validate basePrice (with fallback to auction baseBid)
            let basePrice = 0;
            const defaultBasePrice = data.auctionDetails && data.auctionDetails.baseBid ? parseInt(data.auctionDetails.baseBid) : 1000;
            if (rawPrice !== undefined && rawPrice !== null && String(rawPrice).trim() !== '') {
                const cleanPriceStr = String(rawPrice).replace(/[^0-9\-]/g, '');
                const parsedPrice = parseInt(cleanPriceStr);
                if (!isNaN(parsedPrice) && parsedPrice > 0) {
                    basePrice = parsedPrice;
                }
            }
            if (basePrice <= 0) {
                basePrice = defaultBasePrice;
            }

            // Prevent exact duplicate name + auctionId if already in database or current upload
            const cleanName = name.trim();
            const duplicateNameInDB = data.players.find(p => (p.name || '').trim().toLowerCase() === cleanName.toLowerCase() && p.auction_id === activeAuctionId);
            const duplicateNameInCSV = results.find(r => (r.name || '').trim().toLowerCase() === cleanName.toLowerCase());
            if (duplicateNameInDB || duplicateNameInCSV) {
                console.log(`[CSV/Excel Parser] Row ${i} skipped: duplicate player name "${cleanName}"`);
                failedReg++;
                continue;
            }

            // FormNo duplicate check
            const formNo = normalizedRow['formno'] || normalizedRow['formnumber'] || normalizedRow['form'] || normalizedRow['playerid'] || normalizedRow['srno'] || normalizedRow['slno'] || normalizedRow['serialnumber'] || normalizedRow['no'] || normalizedRow['number'] || normalizedRow['serialno'] || '';
            const cleanFormNo = formNo.trim();
            if (cleanFormNo) {
                const duplicateFormInDB = data.players.find(p => (p.formNo || '').trim() === cleanFormNo && p.auction_id === activeAuctionId);
                const duplicateFormInCSV = results.find(r => (r.formNo || '').trim() === cleanFormNo);
                if (duplicateFormInDB || duplicateFormInCSV) {
                    console.log(`[CSV/Excel Parser] Row ${i} skipped: duplicate formNo "${cleanFormNo}"`);
                    failedReg++;
                    continue;
                }
            }

            // Determine category_id if Category is specified
            let categoryId = null;
            const categoryName = normalizedRow['category'] || normalizedRow['categoryname'] || normalizedRow['tag'] || normalizedRow['categoryid'];
            if (categoryName && data.categories) {
                const cat = data.categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
                if (cat) categoryId = cat.id;
            }

            // Parse playing role/style (with safe fallback to "Player")
            let roleVal = 'Player';
            if (rawRole.trim()) {
                const lowerRole = rawRole.trim().toLowerCase();
                if (lowerRole.includes('batsman') || lowerRole.includes('bat')) {
                    roleVal = 'Batsman';
                } else if (lowerRole.includes('bowler') || lowerRole.includes('bowl')) {
                    roleVal = 'Bowler';
                } else if (lowerRole.includes('wicket') || lowerRole.includes('keeper') || lowerRole === 'wk') {
                    roleVal = 'Wicket-Keeper';
                } else if (lowerRole.includes('all-rounder') || lowerRole.includes('allrounder') || lowerRole.includes('ar') || lowerRole.includes('all rounder')) {
                    roleVal = 'All-Rounder';
                } else {
                    roleVal = rawRole.trim().charAt(0).toUpperCase() + rawRole.trim().slice(1);
                }
            }

            // Detail column (keep only actual detail from detail/description field if present, no raw CSV text)
            const finalDetail = normalizedRow['detail'] || normalizedRow['details'] || normalizedRow['description'] || normalizedRow['info'] || normalizedRow['about'] || '';

            let photoVal = normalizedRow['photo'] || normalizedRow['photourl'] || normalizedRow['imageurl'] || normalizedRow['image'] || null;
            if (photoVal && (photoVal.includes('drive.google.com') || photoVal.includes('docs.google.com'))) {
                try {
                    const fileIdMatch = photoVal.match(/(?:\/d\/|folders\/|id=)([a-zA-Z0-9_-]{10,})/);
                    if (fileIdMatch) {
                        const fileId = fileIdMatch[1];
                        const filename = `gdrive-${fileId}.jpg`;
                        const destPath = path.join(__dirname, '../public/uploads', filename);
                        await downloadGDriveFile(fileId, destPath);
                        photoVal = '/uploads/' + filename;
                    }
                } catch (e) {
                    console.error(`[GDrive Image Download Error] Row ${i}:`, e.message);
                    photoVal = null;
                }
            }

            results.push({
                id: Date.now().toString() + Math.random().toString().substring(2, 6) + i,
                name: name,
                basePrice: basePrice,
                role: roleVal,
                status: 'available',
                soldTo: null,
                soldPrice: null,
                phone: normalizedRow['phone'] || normalizedRow['phonenumber'] || normalizedRow['mobile'] || normalizedRow['mobileno'] || normalizedRow['mobilenumber'] || normalizedRow['contact'] || normalizedRow['contactno'] || normalizedRow['contactnumber'] || null,
                photo: photoVal,
                formNo: formNo,
                age: parseInt(normalizedRow['age'] || normalizedRow['playerage']) || null,
                fatherName: normalizedRow['fathername'] || normalizedRow['father'] || normalizedRow['fathersname'] || '',
                tagOwner: normalizedRow['tagowner'] || normalizedRow['owner'] || normalizedRow['franchise'] || normalizedRow['team'] || '',
                customTag: normalizedRow['customtag'] || normalizedRow['custom'] || normalizedRow['country'] || normalizedRow['nationality'] || '',
                specification1: normalizedRow['specification1'] || normalizedRow['spec1'] || normalizedRow['batting'] || normalizedRow['battingstyle'] || normalizedRow['battinghand'] || '',
                specification2: normalizedRow['specification2'] || normalizedRow['spec2'] || normalizedRow['bowling'] || normalizedRow['bowlingstyle'] || normalizedRow['bowlinghand'] || '',
                specification3: normalizedRow['specification3'] || normalizedRow['spec3'] || normalizedRow['spec'] || normalizedRow['specification'] || '',
                tshirtSize: normalizedRow['tshirtsize'] || normalizedRow['tshirt'] || normalizedRow['shirtsize'] || '',
                jerseyName: normalizedRow['jerseyname'] || normalizedRow['jname'] || normalizedRow['nameonjersey'] || '',
                jerseyNumber: normalizedRow['jerseynumber'] || normalizedRow['jerseyno'] || normalizedRow['jno'] || normalizedRow['numberonjersey'] || '',
                trouserSize: normalizedRow['trousersize'] || normalizedRow['trouser'] || normalizedRow['pantsize'] || '/uploads/default-player.svg' && normalizedRow['pant'] || '',
                detail: finalDetail,
                category_id: categoryId
            });
            successfulReg++;
        }

        console.log(`[DEBUG] Final player objects:`, JSON.stringify(results, null, 2));
        console.log(`[DEBUG] parsed players count: ${results.length}`);

        // Insert player records in bulk
        await data.addPlayersBulk(results);
        console.log(`[DEBUG] Inserted players count: ${results.length}`);

        fs.unlinkSync(filePath); // clean up file
        broadcastUpdates();
        return res.json({
            success: true,
            message: 'Spreadsheet imported successfully',
            data: {
                total: totalRows,
                successful: successfulReg,
                failed: failedReg,
                players: data.players
            },
            total: totalRows,
            successful: successfulReg,
            failed: failedReg,
            players: data.players
        });

    } catch (err) {
        console.error('[CSV/Excel Upload Error]', err);
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        return res.status(500).json({
            success: false,
            message: err.message || 'Internal server error'
        });
    }
});

router.post('/adjust-budget', async (req, res) => {
    const { teamName, amount } = req.body;
    await data.adjustTeamBudget(teamName, parseInt(amount));
    broadcastUpdates();
    res.json({ success: true, teams: data.teams });
});

router.post('/reset-player', async (req, res) => {
    const { playerId } = req.body;
    await data.resetPlayer(playerId);
    broadcastUpdates();
    res.json({ success: true, players: data.players, teams: data.teams });
});

router.post('/reset-all', async (req, res) => {
    await data.resetEntireAuction();
    broadcastUpdates();
    res.json({ success: true, teams: data.teams, players: data.players });
});

router.post('/delete-team', async (req, res) => {
    const { teamId } = req.body;
    await data.deleteTeam(teamId);
    broadcastUpdates();
    res.json({ success: true, teams: data.teams, players: data.players });
});

router.post('/delete-player', async (req, res) => {
    const { playerId } = req.body;
    await data.deletePlayer(playerId);
    broadcastUpdates();
    res.json({ success: true, players: data.players, teams: data.teams });
});

router.post('/mark-unsold', async (req, res) => {
    const { playerId } = req.body;
    const player = data.players.find(p => p.id === playerId);
    if (player) {
        if (player.status === 'sold') {
            if (player.soldTo && player.soldPrice) {
                const team = data.teams.find(t => t.name === player.soldTo);
                if (team) {
                    team.budget += player.soldPrice;
                    await data.updateTeamBudget(team.name, team.budget);
                }
            }
        }
        player.status = 'unsold';
        player.soldTo = null;
        player.soldPrice = null;
        await data.updatePlayerStatus(player);
    }
    broadcastUpdates();
    res.json({ success: true, players: data.players, teams: data.teams });
});

router.post('/bulk-mark-unsold', async (req, res) => {
    const { playerIds } = req.body;
    if (playerIds && Array.isArray(playerIds)) {
        for (let playerId of playerIds) {
            const player = data.players.find(p => p.id === playerId);
            if (player && player.status === 'sold') {
                if (player.soldTo && player.soldPrice) {
                    const team = data.teams.find(t => t.name === player.soldTo);
                    if (team) {
                        team.budget += player.soldPrice;
                        await data.updateTeamBudget(team.name, team.budget);
                    }
                }
                player.status = 'unsold';
                player.soldTo = null;
                player.soldPrice = null;
                await data.updatePlayerStatus(player);
                
                if (data.auctionState.currentPlayer && data.auctionState.currentPlayer.id === playerId) {
                    data.auctionState.currentPlayer = null;
                    data.auctionState.currentBid = 0;
                    data.auctionState.highestBidder = null;
                    data.auctionState.status = 'waiting';
                    await data.saveStateToRedis();
                }
            }
        }
        await data.syncWithDB();
        broadcastUpdates();
        res.json({ success: true, count: playerIds.length });
    } else {
        res.status(400).json({ success: false, message: 'Invalid request parameters' });
    }
});

router.post('/assign-captain', async (req, res) => {
    const { playerId } = req.body;
    await data.assignCaptain(playerId);
    broadcastUpdates();
    res.json({ success: true, players: data.players, teams: data.teams });
});

router.post('/update-auction-details', upload.single('logo'), async (req, res) => {
    try {
        const { 
            auctionId, submitAction, sportsType, season, name, auctionDate, auctionTime, 
            pointsPerTeam, units, baseBid, bidIncreaseBy, 
            playersPerTeamMax, playersPerTeamMin 
        } = req.body;
        
        const logoUrl = req.file ? '/uploads/' + req.file.filename : undefined;
        
        const updatedFields = {
            id: auctionId || 'active_auction',
            sportsType: sportsType || 'Cricket',
            season: season || '2026',
            name: name || '',
            auctionDate: auctionDate || '',
            auctionTime: auctionTime || '',
            pointsPerTeam: parseInt(pointsPerTeam) || 100000,
            units: units || 'CR/LAC',
            baseBid: parseFloat(baseBid) || 0,
            bidIncreaseBy: parseFloat(bidIncreaseBy) || 0,
            playersPerTeamMax: parseInt(playersPerTeamMax) || 0,
            playersPerTeamMin: parseInt(playersPerTeamMin) || 0
        };
        if (logoUrl !== undefined) {
            updatedFields.logo = logoUrl;
        }
        
        if (submitAction === 'create') {
            await data.createAuctionDetails(updatedFields);
        } else {
            await data.updateAuctionDetails(updatedFields);
        }

        // Apply new pointsPerTeam to all teams
        const newPointsPerTeam = parseInt(pointsPerTeam) || 100000;
        for (let team of data.teams) {
            const teamPlayers = data.players.filter(p => p.soldTo === team.name);
            const totalSpent = teamPlayers.reduce((sum, p) => sum + (p.soldPrice || 0), 0);
            team.budget = newPointsPerTeam - totalSpent;
            await data.updateTeam(team.id, { budget: team.budget });
        }
        broadcastUpdates();
        res.json({ success: true, auctionDetails: data.auctionDetails, auctionsList: data.auctionsList });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: err.message });
    }
});

router.post('/select-auction', async (req, res) => {
    try {
        const { auctionId } = req.body;
        await data.selectAuction(auctionId);
        broadcastUpdates();
        res.json({ success: true, auctionDetails: data.auctionDetails, teams: data.teams, players: data.players });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: err.message });
    }
});

router.post('/delete-auction-details', async (req, res) => {
    try {
        const { auctionId } = req.body;
        await data.deleteAuctionDetails(auctionId);
        broadcastUpdates();
        res.json({ success: true, auctionsList: data.auctionsList });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: err.message });
    }
});

router.post('/clear-all-data', async (req, res) => {
    try {
        await data.clearAllData();
        broadcastUpdates();
        res.json({ success: true, teams: data.teams, players: data.players });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: err.message });
    }
});

router.post('/clear-all-players', async (req, res) => {
    try {
        await data.clearAllPlayers();
        broadcastUpdates();
        res.json({ success: true, teams: data.teams, players: data.players });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: err.message });
    }
});

router.post('/clear-all-teams', async (req, res) => {
    try {
        await data.clearAllTeams();
        broadcastUpdates();
        res.json({ success: true, teams: data.teams, players: data.players });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: err.message });
    }
});

// ================== CATEGORIES ==================
router.post('/add-category', async (req, res) => {
    const cat = req.body;
    cat.id = 'cat_' + Date.now();
    const currentId = data.auctionDetails ? data.auctionDetails.id : 'active_auction';
    cat.auction_id = currentId;
    
    await data.db.query(`
        INSERT INTO categories (id, auction_id, name, "maxPlayers", "minPlayers", "baseBid", "increment", "reserveBid", "highestBidPerPlayer", "categoryHighestBidAll", color)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [cat.id, cat.auction_id, cat.name, cat.maxPlayers || 0, cat.minPlayers || 0, cat.baseBid || 0, cat.increment || 0, cat.reserveBid || 0, cat.highestBidPerPlayer || 0, cat.categoryHighestBidAll || 0, cat.color || '#ffffff']);
    
    await data.syncWithDB();
    broadcastUpdates();
    res.json({ success: true, categories: data.categories });
});

router.post('/edit-category', async (req, res) => {
    const catData = req.body;
    const idx = data.categories.findIndex(c => c.id === catData.id);
    if (idx !== -1) {
        await data.db.query(`
            UPDATE categories SET name=$1, "maxPlayers"=$2, "minPlayers"=$3, "baseBid"=$4, "increment"=$5, "reserveBid"=$6, "highestBidPerPlayer"=$7, "categoryHighestBidAll"=$8, color=$9
            WHERE id=$10
        `, [catData.name, catData.maxPlayers || 0, catData.minPlayers || 0, catData.baseBid || 0, catData.increment || 0, catData.reserveBid || 0, catData.highestBidPerPlayer || 0, catData.categoryHighestBidAll || 0, catData.color || '#ffffff', catData.id]);
        
        await data.syncWithDB();
        broadcastUpdates();
        res.json({ success: true, categories: data.categories });
    } else {
        res.status(404).json({ success: false, message: 'Category not found' });
    }
});

router.post('/delete-category', async (req, res) => {
    const { id } = req.body;
    if (id && !id.startsWith('cat_all_')) { // Cannot delete default All category
        await data.db.query('DELETE FROM categories WHERE id=$1', [id]);
        
        // Remove category from players
        await data.db.query('UPDATE players SET category_id = NULL WHERE category_id=$1', [id]);
        
        await data.syncWithDB();
        broadcastUpdates();
        res.json({ success: true, categories: data.categories });
    } else {
        res.status(400).json({ success: false, message: 'Cannot delete default category' });
    }
});

router.post('/bulk-assign-categories', async (req, res) => {
    const { playerIds, categoryIds } = req.body;
    if (!playerIds || !categoryIds || !Array.isArray(playerIds) || !Array.isArray(categoryIds)) {
        return res.status(400).json({ success: false, message: 'Invalid player or category parameters' });
    }

    const client = await data.db.connect();
    try {
        await client.query('BEGIN');

        // Fetch categories to get details
        const categoriesRes = await client.query('SELECT * FROM categories WHERE id = ANY($1)', [categoryIds]);
        const selectedCategories = categoriesRes.rows;

        // Fetch players to get their current category_id
        const playersRes = await client.query('SELECT * FROM players WHERE id = ANY($1)', [playerIds]);
        const selectedPlayers = playersRes.rows;

        // We will keep track of new assignments, skips (already assigned) and failures
        let assigned = 0;
        let already = 0;
        let failed = 0;

        // Let's copy player IDs with their current categories to track updates in-memory for sequential loop logic
        const playerCategoryMap = {};
        selectedPlayers.forEach(p => {
            playerCategoryMap[p.id] = p.category_id;
        });

        // Loop over each selected category
        for (const cat of selectedCategories) {
            const maxPlayers = cat.maxPlayers || 0;
            
            // Get current assigned count in DB for this category
            const countRes = await client.query('SELECT COUNT(*) FROM players WHERE category_id = $1', [cat.id]);
            let currentAssigned = parseInt(countRes.rows[0].count, 10);

            // Determine which selected players are candidates for this category
            const toAssignList = [];

            for (const player of selectedPlayers) {
                const currentCat = playerCategoryMap[player.id];

                // If player is already in this category
                if (currentCat === cat.id) {
                    already++;
                    continue;
                }

                // If player is in another category (not starts with cat_all_ and not null)
                if (currentCat && !currentCat.startsWith('cat_all_')) {
                    already++;
                    continue;
                }

                // Otherwise, the player is eligible to be assigned
                toAssignList.push(player);
            }

            // Perform the assignment
            for (const player of toAssignList) {
                await client.query('UPDATE players SET category_id = $1 WHERE id = $2', [cat.id, player.id]);
                // Update in our temporary map in case there are other categories
                playerCategoryMap[player.id] = cat.id;
                assigned++;
            }
        }

        await client.query('COMMIT');
        
        // Refresh local cache and broadcast
        await data.syncWithDB();
        broadcastUpdates();

        return res.json({
            success: true,
            summary: { assigned, already, failed }
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Bulk Assign Error]', err);
        return res.status(500).json({ success: false, message: 'Internal server error: ' + err.message });
    } finally {
        client.release();
    }
});

router.post('/bulk-remove-categories', async (req, res) => {
    const { playerIds, categoryIds } = req.body;
    if (!playerIds || !categoryIds || !Array.isArray(playerIds) || !Array.isArray(categoryIds)) {
        return res.status(400).json({ success: false, message: 'Invalid player or category parameters' });
    }

    const client = await data.db.connect();
    try {
        await client.query('BEGIN');

        let removedCount = 0;

        // Perform the removal
        for (const catId of categoryIds) {
            // Update players who are assigned to this category and are in the selected players list
            const resUpdate = await client.query('UPDATE players SET category_id = NULL WHERE category_id = $1 AND id = ANY($2)', [catId, playerIds]);
            removedCount += resUpdate.rowCount;
        }

        await client.query('COMMIT');

        // Refresh local cache and broadcast
        await data.syncWithDB();
        broadcastUpdates();

        return res.json({
            success: true,
            removedCount
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Bulk Remove Error]', err);
        return res.status(500).json({ success: false, message: 'Internal server error: ' + err.message });
    } finally {
        client.release();
    }
});

router.post('/sync-photos-bulk', async (req, res) => {
    const { source, pathVal } = req.body;
    if (!source || !pathVal) {
        return res.json({ success: false, message: 'Source and sync path/URL are required.' });
    }

    try {
        const activeAuctionId = (data.auctionDetails ? data.auctionDetails.id : 'active_auction');
        let filesFound = [];

        if (source === 'gdrive') {
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
                return res.json({ success: false, message: 'Failed to access Google Drive folder. Please verify the folder ID and permissions.' });
            }

            const html = await driveRes.text();
            const entryPattern = /class="flip-entry"[^>]*id="entry-([a-zA-Z0-9_-]+)"[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>/g;
            let match;
            while ((match = entryPattern.exec(html)) !== null) {
                filesFound.push({
                    id: match[1],
                    name: match[2],
                    source: 'gdrive'
                });
            }

            if (filesFound.length === 0) {
                return res.json({ success: false, message: 'No files found in the Google Drive folder. Please ensure the folder is shared publicly as "Anyone with the link can view" and contains files.' });
            }
        } else if (source === 'local') {
            const resolvedPath = path.resolve(process.cwd(), pathVal);
            console.log(`[Local Sync] Scanning directory: ${resolvedPath}`);
            
            if (!fs.existsSync(resolvedPath)) {
                return res.json({ success: false, message: `Local directory not found at: ${resolvedPath}` });
            }
            const stat = fs.statSync(resolvedPath);
            if (!stat.isDirectory()) {
                return res.json({ success: false, message: 'Specified path is not a directory.' });
            }

            const files = fs.readdirSync(resolvedPath);
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
            
            for (const file of files) {
                const ext = path.extname(file).toLowerCase();
                if (imageExtensions.includes(ext)) {
                    filesFound.push({
                        path: path.join(resolvedPath, file),
                        name: file,
                        source: 'local'
                    });
                }
            }

            if (filesFound.length === 0) {
                return res.json({ success: false, message: `No image files found in directory: ${resolvedPath}` });
            }
        } else {
            return res.json({ success: false, message: 'Invalid sync source specified.' });
        }

        let matchedCount = 0;
        let unmatchedCount = 0;
        const unmatchedNames = [];

        for (const file of filesFound) {
            const originalName = file.name;
            const fileFormNoStr = path.parse(originalName).name.trim();
            const fileFormNoInt = parseInt(fileFormNoStr, 10);

            // Find the player with matching formNo in the current active auction
            const player = data.players.find(p => {
                if (!p.formNo || p.auction_id !== activeAuctionId) return false;
                const dbFormNoStr = p.formNo.trim();
                const dbFormNoInt = parseInt(dbFormNoStr, 10);
                if (!isNaN(fileFormNoInt) && !isNaN(dbFormNoInt)) {
                    return fileFormNoInt === dbFormNoInt;
                }
                return dbFormNoStr.toLowerCase() === fileFormNoStr.toLowerCase();
            });

            if (player) {
                try {
                    let filename;
                    if (file.source === 'gdrive') {
                        filename = `gdrive-${file.id}-${originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
                        const destPath = path.join(__dirname, '../public/uploads', filename);
                        await downloadGDriveFile(file.id, destPath);
                    } else {
                        filename = `local-${Date.now()}-${originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
                        const destPath = path.join(__dirname, '../public/uploads', filename);
                        fs.copyFileSync(file.path, destPath);
                    }

                    const photoUrl = '/uploads/' + filename;
                    // Update player photo in DB
                    await data.updatePlayer(player.id, { photo: photoUrl });

                    // If the updated player is the current active player, update in live state too
                    if (data.auctionState.currentPlayer && data.auctionState.currentPlayer.id === player.id) {
                        data.auctionState.currentPlayer.photo = photoUrl;
                        await data.saveStateToRedis();
                    }
                    matchedCount++;
                } catch (e) {
                    console.error(`[Sync Bulk] Error syncing file ${originalName}:`, e.message);
                    unmatchedCount++;
                    unmatchedNames.push(`${originalName} (Error: ${e.message})`);
                }
            } else {
                unmatchedCount++;
                unmatchedNames.push(originalName);
            }
        }

        // Sync and broadcast
        await data.syncWithDB();
        broadcastUpdates();

        return res.json({
            success: true,
            total: filesFound.length,
            matched: matchedCount,
            unmatched: unmatchedCount,
            unmatchedNames: unmatchedNames
        });
    } catch (err) {
        console.error('[Bulk Photos Sync Error]', err);
        return res.status(500).json({ success: false, message: 'Internal server error: ' + err.message });
    }
});

module.exports = router;
