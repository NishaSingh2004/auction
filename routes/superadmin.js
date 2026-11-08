const multer = require('multer');
const path = require('path');
const fs = require('fs');

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

const express = require('express');
const router = express.Router();
const data = require('../models/data');

// Superadmin middleware
const authMiddleware = async (req, res, next) => {
    const cookies = req.headers.cookie;
    let username = null;
    if (cookies) {
        const saCookie = cookies.split(';').find(c => c.trim().startsWith('superadmin_session='));
        const adCookie = cookies.split(';').find(c => c.trim().startsWith('admin_session='));
        // Legacy fallback
        const legacyCookie = cookies.split(';').find(c => c.trim().startsWith('session='));
        
        // Prioritize superadmin session, but allow admin session (for admins with settings perm)
        const sessionCookie = saCookie || adCookie || legacyCookie;
        if (sessionCookie) {
            username = decodeURIComponent(sessionCookie.split('=')[1]);
        }
    }
    if (username) {
        let result = null;
        try {
            result = await data.db.query("SELECT * FROM users WHERE username = $1", [username]);
        } catch (dbErr) {
            console.error('[Superadmin Auth] DB error:', dbErr.message);
        }
        req.user = result && result.rows ? result.rows[0] : null;
        
        // Foolproof superadmin fallback if DB record is missing or corrupted
        if (!req.user && username === 'superadmin') {
            req.user = { username: 'superadmin', role: 'superadmin', permissions: ['live','teams','players','settings'] };
        } else if (req.user && username === 'superadmin') {
            req.user.role = 'superadmin';
        }
        
        if (req.user && req.user.permissions && typeof req.user.permissions === 'string') {
            try { req.user.permissions = JSON.parse(req.user.permissions); } catch(e) { req.user.permissions = []; }
        } else if (req.user && !req.user.permissions) {
            req.user.permissions = [];
        }
    }
    next();
};
router.use(authMiddleware);

const superAdminMiddleware = (req, res, next) => {
    const isSettingsRoute = req.path === '/settings';
    const hasSettingsPerm = req.user && req.user.role === 'admin' && req.user.permissions && req.user.permissions.includes('settings');

    if (!req.user) {
        return res.redirect('/');
    }
    if (req.user.role !== 'superadmin' && !(isSettingsRoute && hasSettingsPerm)) {
        return res.status(403).send("<script>alert('Access Denied. Insufficient Permissions.'); window.location.href='/admin/dashboard';</script>");
    }
    next();
};

router.use(superAdminMiddleware);

router.get('/', async (req, res) => {
    try {
        let admins = [];
        try {
            const usersRes = await data.db.query("SELECT username, role, permissions FROM users WHERE role != 'superadmin'");
            admins = usersRes ? usersRes.rows : [];
        } catch (dbErr) {
            console.error('[Superadmin Route] DB Error fetching admins:', dbErr.message);
        }
        res.render('superadmin/dashboard', { 
            data, 
            user: req.user,
            admins 
        });
    } catch (e) {
        console.error(e);
        res.status(500).send("Error loading superadmin dashboard");
    }
});

router.get('/settings', async (req, res) => {
    try {
        res.render('admin/dashboard', { data, user: req.user, showSettingsInline: true });
    } catch (e) {
        console.error(e);
        res.status(500).send("Error loading settings");
    }
});

// Create Admin
router.post('/create-admin', async (req, res) => {
    const { username, password } = req.body;
    try {
        await data.db.query(
            "INSERT INTO users (username, password, role, permissions) VALUES ($1, $2, 'admin', '[]')",
            [username, password]
        );
        res.redirect('/superadmin');
    } catch (e) {
        console.error(e);
        res.send("<script>alert('Error creating admin. Username might exist.'); window.location.href='/superadmin';</script>");
    }
});

// Delete Admin
router.post('/delete-admin', async (req, res) => {
    const { username } = req.body;
    try {
        await data.db.query("DELETE FROM users WHERE username = $1 AND role = 'admin'", [username]);
        res.redirect('/superadmin');
    } catch (e) {
        console.error(e);
        res.redirect('/superadmin');
    }
});

// Update Permissions
router.post('/update-permissions', async (req, res) => {
    const { username, permissions } = req.body; 
    let permsJson = '[]';
    if (permissions) {
        permsJson = JSON.stringify(Array.isArray(permissions) ? permissions : [permissions]);
    }
    try {
        await data.db.query("UPDATE users SET permissions = $1 WHERE username = $2 AND role = 'admin'", [permsJson, username]);
        res.redirect('/superadmin');
    } catch (e) {
        console.error(e);
        res.redirect('/superadmin');
    }
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
        console.error('[Superadmin Update Sponsor Error]', err);
        res.json({ success: false, error: err.message });
    }
});

module.exports = router;
