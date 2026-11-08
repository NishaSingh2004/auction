const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const socketHandler = require('./sockets');
const data = require('./models/data');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
global.io = io;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use((req, res, next) => {
    const cookies = req.headers.cookie;
    req.cookies = {};
    if (cookies) {
        cookies.split(';').forEach(cookie => {
            const parts = cookie.split('=');
            req.cookies[parts[0].trim()] = decodeURIComponent(parts[1]);
        });
    }
    next();
});

let vercelInitPromise = null;
app.use(async (req, res, next) => {
    if (process.env.VERCEL) {
        if (!vercelInitPromise) {
            vercelInitPromise = data.init().catch(err => {
                console.error('[Vercel DB Init Error]:', err);
                vercelInitPromise = null;
                throw err;
            });
        }
        try {
            await vercelInitPromise;
        } catch (e) {
            return res.status(500).send('Database initialization error: ' + e.message);
        }
    }
    next();
});

app.use((req, res, next) => {
    // Ensure data object and its properties are always guaranteed non-null for all views
    if (!data.auctionState) {
        data.auctionState = {
            currentPlayer: null,
            currentBid: 0,
            highestBidder: null,
            highestBidderTeamId: null,
            timer: 30,
            status: 'waiting',
            round: 1,
            isPaused: false,
            timerOff: false,
            bidHistory: [],
            activeCategory: 'all',
            activeCategoryName: 'ALL'
        };
    }
    if (!data.auctionDetails) {
        data.auctionDetails = {
            id: 'active_auction',
            name: 'THE RISING STAR AND GODAVARI VOX LEGIS U-23 LEAGUE 2026',
            season: '2026',
            baseBid: 1000,
            bidIncreaseBy: 500,
            playersPerTeamMax: 16,
            units: 'Rs'
        };
    }
    if (!data.teams) data.teams = [];
    if (!data.players) data.players = [];
    if (!data.categories) data.categories = [];
    if (!data.auctionsList) data.auctionsList = [];
    next();
});

const indexRouter = require('./routes/index');
const adminRouter = require('./routes/admin');
const superadminRouter = require('./routes/superadmin');
const userRouter = require('./routes/user');
const mediaRouter = require('./routes/media');

app.use('/', indexRouter);
app.use('/admin', adminRouter);
app.use('/superadmin', superadminRouter);
app.use('/admin/media', mediaRouter);
app.use('/api/spreadsheet', mediaRouter);
app.use('/api/import', mediaRouter);
app.use('/api/admin', mediaRouter);
app.post('/confirm-import', mediaRouter.confirmExcelImportHandler);
app.post('/import', mediaRouter.confirmExcelImportHandler);
app.post('/confirm-excel-import', mediaRouter.confirmExcelImportHandler);
app.use('/user', userRouter);

socketHandler(io);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

if (!process.env.VERCEL) {
    server.listen(PORT, '0.0.0.0', () => {
        console.log('Server is running on port ' + PORT);
    });

    if (PORT !== 3000) {
        try {
            const server3000 = http.createServer(app);
            io.attach(server3000);
            server3000.listen(3000, '0.0.0.0', () => {
                console.log('Also listening on port 3000');
            }).on('error', (e) => console.log('Port 3000 listener:', e.message));
        } catch (e) {}
    }

    if (PORT !== 8080) {
        try {
            const server8080 = http.createServer(app);
            io.attach(server8080);
            server8080.listen(8080, '0.0.0.0', () => {
                console.log('Also listening on port 8080');
            }).on('error', (e) => console.log('Port 8080 listener:', e.message));
        } catch (e) {}
    }
}

data.init().catch(err => console.error('[DB Init Warning]:', err.message));

module.exports = app;
