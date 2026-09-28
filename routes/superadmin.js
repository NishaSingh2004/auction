const express = require('express');
const router = express.Router();
const data = require('../models/data');


const authMiddleware = async (req, res, next) => {
    const cookies = req.headers.cookie;
    let username = null;
    if (cookies) {
        const sessionCookie = cookies.split(';').find(c => c.trim().startsWith('session='));
        if (sessionCookie) {
            username = decodeURIComponent(sessionCookie.split('=')[1]);
        }
    }
    if (username) {
        const result = await data.db.query("SELECT * FROM users WHERE username = $1", [username]);
        req.user = result.rows[0];
    }
    next();
};
router.use(authMiddleware);

// Superadmin middleware
const superAdminMiddleware = (req, res, next) => {
    if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).send("<script>alert('Access Denied. Superadmin only.'); window.location.href='/admin/dashboard';</script>");
    }
    next();
};

router.use(superAdminMiddleware);

router.get('/', async (req, res) => {
    try {
        const usersRes = await data.db.query("SELECT username, role, permissions FROM users WHERE role != 'superadmin'");
        res.render('superadmin/dashboard', { 
            data, 
            user: req.user,
            admins: usersRes.rows 
        });
    } catch (e) {
        console.error(e);
        res.status(500).send("Error loading superadmin dashboard");
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
    // permissions should be an array of strings like ['live', 'players', 'teams']
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


router.get('/settings', async (req, res) => {
    try {
        res.render('admin/dashboard', { data, user: req.user, showSettingsInline: true });
    } catch (e) {
        console.error(e);
        res.status(500).send("Error loading settings");
    }
});

module.exports = router;
