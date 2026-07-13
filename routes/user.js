const express = require('express');
const router = express.Router();
const data = require('../models/data');

router.get('/dashboard', (req, res) => {
    const username = req.query.username || 'User';
    res.render('user/dashboard', { data, username });
});

router.get('/auction', (req, res) => {
    const username = req.query.username || 'User';
    res.render('user/auction', { data, username });
});

module.exports = router;
