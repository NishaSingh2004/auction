const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const socketHandler = require('./sockets');

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

const indexRouter = require('./routes/index');
const adminRouter = require('./routes/admin');
const userRouter = require('./routes/user');
const mediaRouter = require('./routes/media');

app.use('/', indexRouter);
app.use('/admin', adminRouter);
app.use('/admin/media', mediaRouter);
app.use('/api/spreadsheet', mediaRouter);
app.use('/api/import', mediaRouter);
app.use('/api/admin', mediaRouter);
app.post('/confirm-import', mediaRouter.confirmExcelImportHandler);
app.post('/import', mediaRouter.confirmExcelImportHandler);
app.post('/confirm-excel-import', mediaRouter.confirmExcelImportHandler);
app.use('/user', userRouter);

socketHandler(io);

const PORT = process.env.PORT || 3000;
const data = require('./models/data');

data.init().then(() => {
    if (!process.env.VERCEL) {
        server.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    }
}).catch(console.error);

module.exports = app;
