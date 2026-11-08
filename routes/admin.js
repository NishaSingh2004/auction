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
        try {
            const result = await data.db.query("SELECT * FROM users WHERE username = $1", [username]);
            req.user = result.rows[0];
        } catch (dbErr) {
            console.error('[Admin AuthMiddleware] DB error:', dbErr.message);
        }
        
        if (!req.user && username === 'superadmin') {
            req.user = { username: 'superadmin', role: 'superadmin', permissions: ['live','teams','players','settings'] };
        } else if (req.user && username === 'superadmin') {
            req.user.role = 'superadmin';
        }

        if (!req.user && (username === 'admin' || username === 'anurag')) {
            req.user = { username: username, role: 'admin', permissions: ['live','teams','players','settings'] };
        } else if (req.user && username === 'anurag' && (!req.user.permissions || req.user.permissions.length === 0)) {
            req.user.permissions = ['live','teams','players','settings'];
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
        global.io.emit('dataUpdate', { 
            teams: data.teams, 
            players: data.players, 
            categories: data.categories,
            auctionDetails: data.auctionDetails,
            auctionsList: data.auctionsList
        });
        global.io.emit('auctionUpdate', data.auctionState);
    }
};

async function downloadGDriveFile(fileId, destPath) {
    const candidateUrls = [
        `https://lh3.googleusercontent.com/d/${fileId}`,
        `https://drive.google.com/thumbnail?id=${fileId}&sz=w2048`,
        `https://drive.google.com/uc?export=download&confirm=t&id=${fileId}`
    ];
    let lastError = null;
    for (const url of candidateUrls) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                }
            });
            if (response.ok && !response.headers.get('content-type')?.includes('text/html')) {
                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                if (buffer.length > 100) {
                    fs.writeFileSync(destPath, buffer);
                    return;
                }
            }
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError || new Error(`Failed to fetch file from Google Drive (${fileId}). File may be private or restricted.`);
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

router.get('/settings', (req, res) => {
    // Allow if admin or superadmin or has explicit settings permissions
    if (req.user && (req.user.role === 'superadmin' || req.user.username === 'admin' || (req.user.permissions && req.user.permissions.includes('settings')))) {
        res.render('admin/dashboard', { data, user: req.user, showSettingsInline: true });
    } else {
        res.status(403).send("<script>alert('Access Denied'); window.location.href='/admin/dashboard';</script>");
    }
});

router.get('/teams', (req, res) => {
    res.render('admin/teams', { teams: data.teams });
});


router.get('/api/players', (req, res) => {
    const activeAuctionId = req.query.activeAuctionId || (data.auctionDetails ? data.auctionDetails.id : 'active_auction');
    const filteredPlayers = data.players.filter(p => !p.auction_id || p.auction_id === activeAuctionId);
    res.json({
        success: true,
        players: filteredPlayers,
        allPlayers: data.players,
        teams: data.teams,
        categories: data.categories,
        auctionDetails: data.auctionDetails
    });
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
    let filePath = null;
    try {
        if (!req.file) {
            return res.json({
                success: false,
                message: 'Validation failed',
                errors: ['No spreadsheet file uploaded. Please upload a .csv, .xlsx, or .xls file.']
            });
        }

        filePath = req.file.path;
        const fileExt = path.extname(req.file.originalname).toLowerCase();
        let parsedRows = [];

        console.log(`[DEBUG] Upload file extension: ${fileExt}`);

        if (fileExt === '.csv') {
            const fileContent = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').trim();
            const lines = fileContent.split(/\r?\n/);
            parsedRows = lines.map(line => {
                const values = [];
                let current = '';
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (char === '"' || char === "'") {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        values.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                values.push(current.trim());
                return values;
            });
        } else if (fileExt === '.xlsx' || fileExt === '.xls') {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            parsedRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
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

        const normalizeKey = (key) => {
            return String(key).replace(/^\uFEFF/i, '')
                      .replace(/^"+|"+$/g, '')
                      .trim()
                      .toLowerCase()
                      .replace(/[^a-z0-9]/g, '');
        };

        // Resilient header detection: Scan rows 0 to 4 to find the true column headers row
        let headerRowIndex = 0;
        let detectedHeaders = null;
        for (let r = 0; r < Math.min(5, parsedRows.length - 1); r++) {
            const rowCandidates = parsedRows[r].map(h => normalizeKey(String(h)));
            const hasName = rowCandidates.some(h => h.includes('name') || h.includes('player') || h.includes('first') || h.includes('cricketer'));
            if (hasName) {
                headerRowIndex = r;
                detectedHeaders = rowCandidates;
                break;
            }
        }

        if (detectedHeaders === null) {
            headerRowIndex = 0;
            detectedHeaders = parsedRows[0].map(h => normalizeKey(String(h)));
        }

        const originalHeaders = parsedRows[headerRowIndex];
        const headers = detectedHeaders;

        console.log(`[DEBUG] Detected header row at index ${headerRowIndex}:`, originalHeaders);
        console.log(`[DEBUG] Normalized headers:`, headers);

        // Check strictly required column: Player Name
        const hasNameHeader = headers.some(h => h.includes('name') || h.includes('player') || h.includes('first') || h.includes('cricketer'));
        if (!hasNameHeader) {
            fs.unlinkSync(filePath);
            return res.json({ 
                success: false, 
                message: 'Validation failed',
                errors: ['Uploaded file is missing a required column for Player Name.']
            });
        }

        // Active auction isolation
        const activeAuctionId = req.body.activeAuctionId || req.body.auctionId || (data.auctionDetails ? data.auctionDetails.id : 'active_auction');
        if (activeAuctionId && (!data.auctionDetails || data.auctionDetails.id !== activeAuctionId)) {
            try {
                await data.selectAuction(activeAuctionId);
            } catch (e) {
                console.error('[Upload Players Select Auction Error]', e.message);
            }
        }

        const defaultBasePrice = data.auctionDetails && data.auctionDetails.baseBid ? parseInt(data.auctionDetails.baseBid, 10) : 1000;
        let totalRows = 0;
        let successfulReg = 0;
        let failedReg = 0;
        const results = [];

        const isUrl = (val) => {
            if (!val || typeof val !== 'string') return false;
            const s = val.trim().toLowerCase();
            return s.startsWith('http://') || s.startsWith('https://') || s.includes('drive.google.com') || s.includes('docs.google.com') || s.includes('googleusercontent.com');
        };

        // Loop through data rows starting immediately after header row
        for (let i = headerRowIndex + 1; i < parsedRows.length; i++) {
            const rawRow = parsedRows[i];
            if (!rawRow || rawRow.length === 0 || rawRow.every(v => v === undefined || v === null || String(v).trim() === '')) {
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

            const keys = Object.keys(normalizedRow);

            // 1. Resolve Player Name (Support First Name + Last Name or Single Column Name)
            const firstNameKey = keys.find(k => ['firstname', 'first', 'firstnames', 'fname'].includes(k));
            const lastNameKey = keys.find(k => ['lastname', 'last', 'surname', 'lname'].includes(k));
            let name = '';

            if (firstNameKey && normalizedRow[firstNameKey]) {
                name = normalizedRow[firstNameKey].trim();
                if (lastNameKey && normalizedRow[lastNameKey]) {
                    name += ' ' + normalizedRow[lastNameKey].trim();
                }
            } else {
                const nameKey = keys.find(k => ['playername', 'name', 'fullname', 'cricketername', 'player'].includes(k)) || 
                                keys.find(k => (k.includes('name') || k.includes('player')) && !['father', 'mother', 'jersey', 'team', 'owner', 'tag'].some(w => k.includes(w)));
                if (nameKey && normalizedRow[nameKey]) {
                    name = normalizedRow[nameKey].trim();
                }
            }

            if (!name) {
                console.log(`[Spreadsheet Parser] Row ${i} skipped: player name missing`);
                failedReg++;
                continue;
            }

            // 2. Base Price (Filter out transaction IDs, fee descriptions, etc.)
            const excludedPriceWords = ['paid', 'fee', 'registration', 'utr', 'transaction', 'ref', 'payment', 'receipt', 'bill', 'account', 'phone', 'mobile'];
            const priceKey = keys.find(k => ['baseprice', 'price', 'basebid', 'startprice', 'basevalue', 'playerprice', 'bidprice'].includes(k)) || 
                             keys.find(k => (k.includes('price') || k.includes('basebid') || k.includes('startprice') || k.includes('baseprice')) && !excludedPriceWords.some(ex => k.includes(ex)));

            let basePrice = defaultBasePrice;
            if (priceKey && normalizedRow[priceKey]) {
                const cleanPriceStr = String(normalizedRow[priceKey]).replace(/[^0-9]/g, '');
                const parsedPrice = parseInt(cleanPriceStr, 10);
                // Sanity check: valid auction base price must be positive and not an enormous transaction reference number (> 500,000,000)
                if (!isNaN(parsedPrice) && parsedPrice > 0 && parsedPrice <= 500000000) {
                    basePrice = parsedPrice;
                }
            }

            // 3. Resolve Photo URL (from photo columns or any URL-bearing cell)
            let photoVal = null;
            const photoColAliases = ['photo', 'playerphoto', 'playerphotos', 'photourl', 'imageurl', 'image', 'picture', 'photos', 'playerpic', 'photolink', 'imagelink', 'pic'];
            for (const pk of photoColAliases) {
                if (normalizedRow[pk] && normalizedRow[pk].trim()) {
                    photoVal = normalizedRow[pk].trim();
                    break;
                }
            }
            // Check if any other cell contains a web or drive URL
            if (!photoVal) {
                for (const k of keys) {
                    if (isUrl(normalizedRow[k])) {
                        photoVal = normalizedRow[k].trim();
                        break;
                    }
                }
            }

            // If Google Drive link, quickly convert to direct high-speed CDN image link without blocking
            if (photoVal && (photoVal.includes('drive.google.com') || photoVal.includes('docs.google.com') || photoVal.includes('googleusercontent.com'))) {
                const fileIdMatch = photoVal.match(/(?:\/d\/|folders\/|id=)([a-zA-Z0-9_-]{10,})/);
                if (fileIdMatch) {
                    const fileId = fileIdMatch[1];
                    const localFilename = `gdrive-${fileId}.jpg`;
                    const destPath = path.join(__dirname, '../public/uploads', localFilename);
                    if (fs.existsSync(destPath)) {
                        photoVal = '/uploads/' + localFilename;
                    } else {
                        photoVal = `https://lh3.googleusercontent.com/d/${fileId}`;
                    }
                }
            }

            // 4. Form Number / Serial Number (Ensure it is NOT a URL)
            let formNo = '';
            const formNoCandidates = [
                normalizedRow['formno'],
                normalizedRow['formnumber'],
                normalizedRow['form'],
                normalizedRow['srno'],
                normalizedRow['slno'],
                normalizedRow['serialnumber'],
                normalizedRow['serialno'],
                normalizedRow['no'],
                normalizedRow['number'],
                normalizedRow['playerid'],
                normalizedRow['id']
            ];
            for (const cand of formNoCandidates) {
                if (cand && !isUrl(cand)) {
                    formNo = String(cand).trim();
                    break;
                }
            }
            if (!formNo) {
                formNo = String(i - headerRowIndex);
            }

            // 5. Playing Role
            const roleKey = keys.find(k => ['role', 'category', 'playerrole', 'type', 'playingrole'].includes(k)) || 
                            keys.find(k => k.includes('role') || k.includes('type') || k.includes('style') || k.includes('skill'));
            const rawRole = roleKey ? (normalizedRow[roleKey] || '') : '';
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

            // 6. Category ID lookup
            let categoryId = null;
            const categoryName = normalizedRow['category'] || normalizedRow['categoryname'] || normalizedRow['tag'] || normalizedRow['categoryid'];
            if (categoryName && data.categories) {
                const cat = data.categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
                if (cat) categoryId = cat.id;
            }

            // 7. Age parsing
            let ageVal = parseInt(normalizedRow['age'] || normalizedRow['playerage'] || '', 10);
            if (isNaN(ageVal) || ageVal < 5 || ageVal > 120) {
                ageVal = null;
            }

            const finalDetail = normalizedRow['detail'] || normalizedRow['details'] || normalizedRow['description'] || normalizedRow['info'] || normalizedRow['about'] || '';

            results.push({
                id: Date.now().toString() + Math.random().toString().substring(2, 6) + i,
                auction_id: activeAuctionId,
                name: name,
                basePrice: basePrice,
                role: roleVal,
                status: 'available',
                soldTo: null,
                soldPrice: null,
                phone: normalizedRow['phone'] || normalizedRow['phonenumber'] || normalizedRow['mobile'] || normalizedRow['mobileno'] || normalizedRow['mobilenumber'] || normalizedRow['contact'] || normalizedRow['contactno'] || normalizedRow['contactnumber'] || null,
                photo: photoVal,
                formNo: formNo,
                age: ageVal,
                fatherName: normalizedRow['fathername'] || normalizedRow['father'] || normalizedRow['fathersname'] || '',
                tagOwner: normalizedRow['tagowner'] || normalizedRow['owner'] || normalizedRow['franchise'] || normalizedRow['team'] || '',
                customTag: normalizedRow['customtag'] || normalizedRow['custom'] || normalizedRow['country'] || normalizedRow['nationality'] || '',
                specification1: normalizedRow['specification1'] || normalizedRow['spec1'] || normalizedRow['batting'] || normalizedRow['battingstyle'] || normalizedRow['battinghand'] || '',
                specification2: normalizedRow['specification2'] || normalizedRow['spec2'] || normalizedRow['bowling'] || normalizedRow['bowlingstyle'] || normalizedRow['bowlinghand'] || '',
                specification3: normalizedRow['specification3'] || normalizedRow['spec3'] || normalizedRow['spec'] || normalizedRow['specification'] || '',
                tshirtSize: normalizedRow['tshirtsize'] || normalizedRow['tshirt'] || normalizedRow['shirtsize'] || '',
                jerseyName: normalizedRow['jerseyname'] || normalizedRow['jname'] || normalizedRow['nameonjersey'] || '',
                jerseyNumber: normalizedRow['jerseynumber'] || normalizedRow['jerseyno'] || normalizedRow['jno'] || normalizedRow['numberonjersey'] || '',
                trouserSize: normalizedRow['trousersize'] || normalizedRow['trouser'] || normalizedRow['pantsize'] || normalizedRow['pant'] || '',
                detail: finalDetail,
                category_id: categoryId
            });
            successfulReg++;
        }

        console.log(`[DEBUG] Successfully parsed ${results.length} players for auction ${activeAuctionId}`);

        // Insert player records in bulk and sync
        await data.addPlayersBulk(results);
        await data.syncWithDB();

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
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
            try { fs.unlinkSync(filePath); } catch (e) {}
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
    await data.syncWithDB();
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

router.post('/update-sponsor', upload.single('sponsorLogo'), async (req, res) => {
    try {
        const { sponsorName, removeLogo, auctionId } = req.body;
        const targetId = auctionId || (data.auctionDetails ? data.auctionDetails.id : 'active_auction');
        
        const updateFields = {
            sponsorName: sponsorName !== undefined ? sponsorName.trim() : ''
        };

        if (req.file) {
            updateFields.sponsorLogo = '/uploads/' + req.file.filename;
        } else if (removeLogo === 'true' || removeLogo === true) {
            updateFields.sponsorLogo = null;
        }

        await data.updateSponsorDetails(targetId, updateFields);
        broadcastUpdates();
        res.json({ 
            success: true, 
            message: 'Sponsor logo & details updated successfully!',
            auctionDetails: data.auctionDetails 
        });
    } catch (err) {
        console.error('[Update Sponsor Error]', err);
        res.json({ success: false, error: err.message });
    }
});

router.post('/update-auction-details', upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'sponsorLogo', maxCount: 1 }
]), async (req, res) => {
    try {
        const { 
            auctionId, submitAction, sportsType, season, name, auctionDate, auctionTime, 
            pointsPerTeam, units, baseBid, bidIncreaseBy, 
            playersPerTeamMax, playersPerTeamMin,
            sponsorName
        } = req.body;
        
        const logoFile = req.files && req.files.logo ? req.files.logo[0] : (req.file && req.file.fieldname === 'logo' ? req.file : null);
        const sponsorLogoFile = req.files && req.files.sponsorLogo ? req.files.sponsorLogo[0] : (req.file && req.file.fieldname === 'sponsorLogo' ? req.file : null);
        
        const logoUrl = logoFile ? '/uploads/' + logoFile.filename : undefined;
        const sponsorLogoUrl = sponsorLogoFile ? '/uploads/' + sponsorLogoFile.filename : undefined;
        
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
            playersPerTeamMin: parseInt(playersPerTeamMin) || 0,
            sponsorName: sponsorName !== undefined ? sponsorName : ''
        };
        if (logoUrl !== undefined) {
            updatedFields.logo = logoUrl;
        }
        if (sponsorLogoUrl !== undefined) {
            updatedFields.sponsorLogo = sponsorLogoUrl;
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

        const norm = (s) => (s || '').toLowerCase().replace(/[_\.\-]+/g, ' ').replace(/\s+/g, ' ').trim();
        const strip = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        function findMatchingPlayer(rawName, playerPool) {
            if (!rawName || !playerPool || !playerPool.length) return null;
            const cleanStr = String(rawName).trim();
            const normClean = norm(cleanStr);
            const stripClean = strip(cleanStr);
            
            let extractedNum = null;
            const pureInt = parseInt(cleanStr, 10);
            if (!isNaN(pureInt) && /^\d+$/.test(cleanStr)) {
                extractedNum = pureInt;
            } else {
                const prefixMatch = cleanStr.match(/^(?:id|player|p|form|f|no)[\s_\-#]*(\d+)$/i);
                if (prefixMatch) extractedNum = parseInt(prefixMatch[1], 10);
            }

            // 1. By Player ID
            let p = playerPool.find(item => {
                if (item.id === undefined || item.id === null) return false;
                const pIdStr = String(item.id).trim();
                if (pIdStr.toLowerCase() === cleanStr.toLowerCase()) return true;
                if (extractedNum !== null) {
                    const pIdInt = parseInt(pIdStr, 10);
                    if (!isNaN(pIdInt) && pIdInt === extractedNum) return true;
                }
                return false;
            });
            if (p) return p;

            // 2. By Player Name
            p = playerPool.find(item => item.name && norm(item.name) === normClean);
            if (p) return p;
            p = playerPool.find(item => item.name && strip(item.name) === stripClean);
            if (p) return p;

            // 3. By Form No
            p = playerPool.find(item => {
                if (!item.formNo) return false;
                const fStr = String(item.formNo).trim();
                if (fStr.toLowerCase() === cleanStr.toLowerCase()) return true;
                if (extractedNum !== null) {
                    const fInt = parseInt(fStr, 10);
                    if (!isNaN(fInt) && fInt === extractedNum) return true;
                }
                return false;
            });
            if (p) return p;

            // 4. By Jersey / Player Number
            p = playerPool.find(item => {
                if (!item.jerseyNumber) return false;
                const jStr = String(item.jerseyNumber).trim();
                if (jStr.toLowerCase() === cleanStr.toLowerCase()) return true;
                if (extractedNum !== null) {
                    const jInt = parseInt(jStr, 10);
                    if (!isNaN(jInt) && jInt === extractedNum) return true;
                }
                return false;
            });
            if (p) return p;

            // 5. Compound patterns: "1 - Virat Kohli" or "Virat Kohli_1"
            const leadMatch = cleanStr.match(/^(\d+)[\s_\-]+(.+)$/);
            if (leadMatch) {
                const numPart = parseInt(leadMatch[1], 10);
                const namePart = norm(leadMatch[2]);
                p = playerPool.find(item => item.name && norm(item.name) === namePart);
                if (p) return p;
                p = playerPool.find(item => parseInt(item.id, 10) === numPart || parseInt(item.formNo, 10) === numPart);
                if (p) return p;
            }

            const trailMatch = cleanStr.match(/^(.+?)[\s_\-]+(\d+)$/) || cleanStr.match(/^(.+?)\s*\((.+?)\)$/);
            if (trailMatch) {
                const namePart = norm(trailMatch[1]);
                const numPart = parseInt(trailMatch[2], 10);
                p = playerPool.find(item => item.name && norm(item.name) === namePart);
                if (p) return p;
                if (!isNaN(numPart)) {
                    p = playerPool.find(item => parseInt(item.id, 10) === numPart || parseInt(item.formNo, 10) === numPart);
                    if (p) return p;
                }
            }

            return null;
        }

        const auctionPlayers = data.players.filter(p => !activeAuctionId || p.auction_id === activeAuctionId);

        for (const file of filesFound) {
            const originalName = file.name;
            const fileBaseName = path.parse(originalName).name.trim();

            // Find the player matching Player ID, Name, Form No, or Player No
            const player = findMatchingPlayer(fileBaseName, auctionPlayers);

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
