const express = require('express');
const router = express.Router();
const data = require('../models/data');

router.get('/', (req, res) => {
    res.render('login');
});

router.get('/live', async (req, res) => {
    // Pass the spectator view
    res.render('user/dashboard', { 
        data, 
        username: 'Spectator'
    });
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const cleanUser = (username || '').trim();
    const cleanPass = (password || '').trim();
    
    try {
        // Fallback for hardcoded admin/superadmin if DB somehow fails
        if (cleanUser === 'admin' && cleanPass === 'admin') {
            res.setHeader('Set-Cookie', `session=${encodeURIComponent(cleanUser)}; Path=/; HttpOnly`);
            return res.redirect('/admin/dashboard');
        }
        if (cleanUser === 'superadmin' && cleanPass === 'superadmin') {
            res.setHeader('Set-Cookie', `session=${encodeURIComponent(cleanUser)}; Path=/; HttpOnly`);
            return res.redirect('/superadmin');
        }
        
        const result = await data.db.query("SELECT * FROM users WHERE username = $1 AND password = $2", [cleanUser, cleanPass]);
        const user = result.rows[0];
        
        if (user) {
            res.setHeader('Set-Cookie', `session=${encodeURIComponent(user.username)}; Path=/; HttpOnly`);
            if (user.role === 'superadmin') {
                return res.redirect('/superadmin');
            } else {
                return res.redirect('/admin/dashboard');
            }
        } else {
            res.send("<script>alert('Invalid Credentials!'); window.location.href='/';</script>");
        }
    } catch (e) {
        console.error('Login Error:', e);
        res.send("<script>alert('Database Error'); window.location.href='/';</script>");
    }
});

router.get('/logout', (req, res) => {
    res.setHeader('Set-Cookie', `session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
    res.redirect('/');
});

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

router.get('/auctions', async (req, res) => {
    if (!req.user) return res.redirect('/');
    res.render('dashboard', { user: req.user });
});

router.post('/api/create-auction', async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false });
    const { name } = req.body;
    const id = 'auction_' + Date.now();
    await data.db.query('INSERT INTO auctions (id, name, created_by, status) VALUES ($1, $2, $3, $4)', [id, name, req.user.username, 'active']);
    res.json({ success: true, id });
});

router.get('/api/my-auctions', async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false });
    const result = await data.db.query('SELECT * FROM auctions WHERE created_by = $1', [req.user.username]);
    res.json({ success: true, auctions: result.rows });
});

module.exports = router;
