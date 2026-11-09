const { Pool, types } = require('pg');
const { createClient } = require('redis');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

// Configure pg type parsers: BIGINT (OID 20) and NUMERIC (OID 1700) to return numbers, preventing string concatenation
types.setTypeParser(20, (val) => val === null ? null : parseInt(val, 10));
types.setTypeParser(1700, (val) => val === null ? null : parseFloat(val));

// Determine the PostgreSQL connection URL:
const activeDbUrl = process.env.DATABASE_URL || 
                    process.env.POSTGRES_URL || 
                    (process.env.NODE_ENV === 'production' ? 'postgresql://postgres:qlzvuYGAEBfBszwuvnkxOEwsMXNoRTn@postgres.railway.internal:5432/railway' : null);

const isRemoteDb = Boolean(
    activeDbUrl &&
    !activeDbUrl.includes('localhost') &&
    !activeDbUrl.includes('127.0.0.1') &&
    !activeDbUrl.includes('@db:')
);

const poolConfig = {
    connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 5000,
    query_timeout: 2500,
    statement_timeout: 3000
};

if (activeDbUrl) {
    poolConfig.connectionString = activeDbUrl;
} else {
    poolConfig.user = process.env.PGUSER || 'postgres';
    poolConfig.host = process.env.PGHOST || 'localhost';
    poolConfig.database = process.env.PGDATABASE || 'auction';
    poolConfig.password = process.env.PGPASSWORD || 'postgres';
    poolConfig.port = process.env.PGPORT || 5432;
}

if (isRemoteDb) {
    poolConfig.ssl = { rejectUnauthorized: false };
}

let pgPool = new Pool(poolConfig);
pgPool.on('error', (err) => console.warn('[PostgreSQL Pool Warning]:', err.message));

let isPgConnected = false;
let sqliteDb = null;

async function getSqliteDb() {
    if (!sqliteDb) {
        sqliteDb = await open({
            filename: path.join(__dirname, '../auction.db'),
            driver: sqlite3.Database
        });
    }
    return sqliteDb;
}

// Resilient query adapter: routes queries to PostgreSQL when connected, falls back to SQLite
const dbAdapter = {
    async query(sql, params = []) {
        if (isPgConnected && pgPool) {
            try {
                return await pgPool.query(sql, params);
            } catch (pgErr) {
                console.warn('[PostgreSQL Query Fallback to SQLite]:', pgErr.message);
            }
        }
        
        try {
            const sdb = await getSqliteDb();
            let sqliteSql = sql.replace(/\$\d+/g, '?');
            const trimmed = sqliteSql.trim();
            const upper = trimmed.toUpperCase();

            // Handle multi-statement DDL if any
            if (upper.startsWith('CREATE TABLE') || upper.startsWith('ALTER TABLE')) {
                await sdb.exec(sqliteSql);
                return { rows: [] };
            }

            if (upper.startsWith('SELECT')) {
                const rows = await sdb.all(sqliteSql, params);
                return { rows: rows || [] };
            } else {
                const result = await sdb.run(sqliteSql, params);
                return { rows: [], rowCount: result ? result.changes : 0 };
            }
        } catch (sqliteErr) {
            console.error('[SQLite Query Error]:', sqliteErr.message, 'SQL:', sql);
            return { rows: [] };
        }
    }
};

// Redis Client with in-memory fallback for cloud / serverless compatibility
let redisClient = null;
const redisUrl = process.env.REDIS_URL || null;
if (redisUrl) {
    redisClient = createClient({
        url: redisUrl,
        socket: { 
            connectTimeout: 1500,
            reconnectStrategy: (retries) => retries > 2 ? new Error('Redis max retries') : 500
        }
    });
    redisClient.on('error', (err) => console.warn('[Redis] Warning:', err.message));
} else {
    const memStore = new Map();
    redisClient = {
        isOpen: true,
        connect: async () => {},
        get: async (key) => memStore.get(key) || null,
        set: async (key, val) => { memStore.set(key, val); return 'OK'; },
        del: async (key) => { memStore.delete(key); return 1; },
        on: () => {}
    };
}

const data = {
    teams: [],
    players: [],
    categories: [],
    auctionState: {
        currentPlayer: null,
        currentBid: 0,
        highestBidder: null,
        timer: 30,
        status: 'waiting',
        isPaused: false,
        timerOff: false,
        bidHistory: [],
        activeCategory: 'all'
    },
    db: dbAdapter,
    redis: redisClient,
    
    async init() {
        console.log('[Data] Initializing auction database and state...');
        
        // 1. Immediately ensure SQLite tables and users exist in <5ms
        try {
            const sdb = await getSqliteDb();
            await sdb.exec(`
                CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password TEXT, role TEXT, permissions TEXT, active_auction_id TEXT);
                CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, auction_id TEXT, name TEXT, "maxPlayers" INTEGER, "minPlayers" INTEGER, "baseBid" INTEGER, increment INTEGER, "reserveBid" INTEGER, "highestBidPerPlayer" INTEGER, "categoryHighestBidAll" INTEGER, color TEXT);
            `);
            try { await sdb.exec(`ALTER TABLE users ADD COLUMN active_auction_id TEXT;`); } catch(e){}
            const defaultPerms = JSON.stringify(['live', 'teams', 'players', 'settings']);
            await sdb.run('INSERT OR IGNORE INTO users (username, password, role, permissions, active_auction_id) VALUES (?, ?, ?, ?, ?)',
                ['superadmin', 'superadmin', 'superadmin', defaultPerms, 'active_auction']);
            await sdb.run('INSERT OR IGNORE INTO users (username, password, role, permissions, active_auction_id) VALUES (?, ?, ?, ?, ?)',
                ['admin', 'admin', 'admin', defaultPerms, 'active_auction']);
            await sdb.run('INSERT OR IGNORE INTO users (username, password, role, permissions, active_auction_id) VALUES (?, ?, ?, ?, ?)',
                ['anurag', 'anurag', 'admin', defaultPerms, 'active_auction']);
        } catch (e) {
            console.warn('[SQLite Init Warn]:', e.message);
        }

        // 2. Load data immediately into memory from SQLite so dashboard and live views render in <5ms
        await this.syncWithDB();

        // 3. Connect Redis with 1.5s timeout
        try {
            if (this.redis && !this.redis.isOpen) {
                await Promise.race([
                    this.redis.connect(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Redis Timeout')), 1500))
                ]);
                console.log('[Redis] Connected.');
            }
        } catch (rErr) {
            console.warn('[Redis] Connection warning, using in-memory state fallback:', rErr.message);
            const memStore = new Map();
            this.redis = {
                isOpen: true,
                get: async (k) => memStore.get(k) || null,
                set: async (k, v) => { memStore.set(k, v); return 'OK'; },
                del: async (k) => { memStore.delete(k); return 1; }
            };
        }

        // 4. Test PostgreSQL connection with 2.0s timeout
        try {
            await Promise.race([
                pgPool.query('SELECT 1'),
                new Promise((_, reject) => setTimeout(() => reject(new Error('PostgreSQL Connection Timeout (2s)')), 2000))
            ]);
            isPgConnected = true;
            console.log('[PostgreSQL] Connected successfully to cloud database.');
            await this.initPostgreSQLTables();
            await this.syncWithDB();
        } catch (pgErr) {
            isPgConnected = false;
            console.log(`[Database] Remote PostgreSQL unavailable (${pgErr.message}). Seamlessly running on SQLite auction.db with full persistence.`);
        }

        // 5. Restore State from Redis or memory
        await this.loadStateFromRedis();
        console.log(`[Data Ready] Ready with ${this.teams.length} teams and ${this.players.length} players.`);
    },

    async initPostgreSQLTables() {
        try {
            await pgPool.query(`
                CREATE TABLE IF NOT EXISTS auctions (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    code TEXT UNIQUE,
                    created_by TEXT,
                    status TEXT DEFAULT 'setup'
                );
                CREATE TABLE IF NOT EXISTS categories (
                    id TEXT PRIMARY KEY,
                    auction_id TEXT,
                    name TEXT,
                    "maxPlayers" INTEGER,
                    "minPlayers" INTEGER,
                    "baseBid" INTEGER,
                    "increment" INTEGER,
                    "reserveBid" INTEGER,
                    "highestBidPerPlayer" INTEGER,
                    "categoryHighestBidAll" INTEGER,
                    color TEXT
                );
                ALTER TABLE categories ADD COLUMN IF NOT EXISTS "highestBidPerPlayer" INTEGER;
                ALTER TABLE categories ADD COLUMN IF NOT EXISTS "categoryHighestBidAll" INTEGER;
                
                CREATE TABLE IF NOT EXISTS teams (
                    id TEXT PRIMARY KEY,
                    auction_id TEXT,
                    name TEXT,
                    budget INTEGER,
                    color TEXT,
                    logo TEXT,
                    "shortName" TEXT,
                    "shortcutKey" TEXT
                );
                CREATE TABLE IF NOT EXISTS players (
                    id TEXT PRIMARY KEY,
                    auction_id TEXT,
                    name TEXT,
                    "basePrice" INTEGER,
                    role TEXT,
                    status TEXT,
                    "soldTo" TEXT,
                    "soldPrice" INTEGER,
                    phone TEXT,
                    photo TEXT,
                    "isCaptain" INTEGER DEFAULT 0,
                    "formNo" TEXT,
                    age INTEGER,
                    "fatherName" TEXT,
                    "tagOwner" TEXT,
                    "selectTeam" TEXT,
                    "customTag" TEXT,
                    specification1 TEXT,
                    specification2 TEXT,
                    specification3 TEXT,
                    "tshirtSize" TEXT,
                    "jerseyName" TEXT,
                    "jerseyNumber" TEXT,
                    "trouserSize" TEXT,
                    detail TEXT,
                    category_id TEXT
                );
                ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions TEXT;
                ALTER TABLE users ADD COLUMN IF NOT EXISTS active_auction_id TEXT;
                CREATE TABLE IF NOT EXISTS users (
                    username TEXT PRIMARY KEY,
                    password TEXT,
                    role TEXT,
                    permissions TEXT,
                    active_auction_id TEXT
                );
                ALTER TABLE auction_details ADD COLUMN IF NOT EXISTS "sponsorLogo" TEXT;
                ALTER TABLE auction_details ADD COLUMN IF NOT EXISTS "sponsorName" TEXT;
                CREATE TABLE IF NOT EXISTS auction_details (
                    id TEXT PRIMARY KEY,
                    logo TEXT,
                    "sportsType" TEXT,
                    season TEXT,
                    name TEXT,
                    "auctionDate" TEXT,
                    "auctionTime" TEXT,
                    "pointsPerTeam" INTEGER,
                    units TEXT,
                    "baseBid" REAL,
                    "bidIncreaseBy" REAL,
                    "playersPerTeamMax" INTEGER,
                    "playersPerTeamMin" INTEGER
                );
            `);

            const defaultPerms = JSON.stringify(['live', 'teams', 'players', 'settings']);
            const saCheck = await pgPool.query("SELECT * FROM users WHERE username = 'superadmin'");
            if (saCheck.rows.length === 0) {
                await pgPool.query("INSERT INTO users (username, password, role, permissions) VALUES ('superadmin', 'superadmin', 'superadmin', $1)", [defaultPerms]);
            }
            const adminCheck = await pgPool.query("SELECT * FROM users WHERE username = 'admin'");
            if (adminCheck.rows.length === 0) {
                await pgPool.query("INSERT INTO users (username, password, role, permissions) VALUES ('admin', 'admin', 'admin', $1)", [defaultPerms]);
            }
            const anuragCheck = await pgPool.query("SELECT * FROM users WHERE username = 'anurag'");
            if (anuragCheck.rows.length === 0) {
                await pgPool.query("INSERT INTO users (username, password, role, permissions) VALUES ('anurag', 'anurag', 'admin', $1)", [defaultPerms]);
            }

            // Load or Create default auction details in PG
            let detailsRes = await pgPool.query("SELECT * FROM auction_details WHERE id = 'active_auction'");
            if (detailsRes.rows.length === 0) {
                await pgPool.query(`
                    INSERT INTO auction_details (
                        id, logo, "sportsType", season, name, "auctionDate", "auctionTime",
                        "pointsPerTeam", units, "baseBid", "bidIncreaseBy", "playersPerTeamMax", "playersPerTeamMin"
                    ) VALUES (
                        'active_auction', null, 'Cricket', '2026', 
                        'THE RISING STAR AND GODAVARI VOX LEGIS U-23 LEAGUE 2026', 
                        '2026-05-09', '16:00', 100000, 'CR/LAC', 1000.0, 500.0, 16, 0
                    )
                `);
            }

            // Auto-seed players and teams if PG database is freshly deployed
            const countCheck = await pgPool.query('SELECT COUNT(*) FROM players');
            const playerCount = parseInt(countCheck.rows[0].count, 10);
            if (playerCount === 0) {
                const fs = require('fs');
                const backupFile = path.join(__dirname, '../auction_database_backup.sql');
                if (fs.existsSync(backupFile)) {
                    console.log('[PostgreSQL] Database is fresh (0 players). Auto-seeding players & teams...');
                    const sql = fs.readFileSync(backupFile, 'utf8');
                    await pgPool.query(sql);
                    console.log('[PostgreSQL] Auto-seed complete!');
                }
            }
        } catch (err) {
            console.warn('[PostgreSQL init tables warning]:', err.message);
        }
    },

    async syncWithDB() {
        try {
        const currentId = this.auctionDetails ? this.auctionDetails.id : 'active_auction';
        const teamsRes = await this.db.query('SELECT * FROM teams WHERE auction_id = $1', [currentId]);
        this.teams = teamsRes.rows;
        const playersRes = await this.db.query('SELECT * FROM players WHERE auction_id = $1', [currentId]);
        this.players = playersRes.rows;
        const detailsRes = await this.db.query("SELECT * FROM auction_details WHERE id = $1", [currentId]);
        if (detailsRes.rows.length > 0) this.auctionDetails = detailsRes.rows[0];
        const listRes = await this.db.query("SELECT * FROM auction_details");
        this.auctionsList = listRes.rows;
        
        const catRes = await this.db.query('SELECT * FROM categories WHERE auction_id = $1', [currentId]);
        this.categories = catRes.rows;

        // Ensure numeric fields are explicitly parsed as numbers
        if (this.players) {
            this.players.forEach(p => {
                p.basePrice = parseInt(p.basePrice, 10) || 0;
                if (p.soldPrice !== null && p.soldPrice !== undefined) {
                    p.soldPrice = parseInt(p.soldPrice, 10);
                }
                if (p.age !== null && p.age !== undefined) {
                    p.age = parseInt(p.age, 10);
                }
            });
        }
        if (this.teams) {
            this.teams.forEach(t => {
                t.budget = parseInt(t.budget, 10) || 0;
            });
        }
        if (this.auctionDetails) {
            if (this.auctionDetails.baseBid !== null && this.auctionDetails.baseBid !== undefined) {
                this.auctionDetails.baseBid = parseFloat(this.auctionDetails.baseBid) || 0;
            }
            if (this.auctionDetails.bidIncreaseBy !== null && this.auctionDetails.bidIncreaseBy !== undefined) {
                this.auctionDetails.bidIncreaseBy = parseFloat(this.auctionDetails.bidIncreaseBy) || 500;
            }
        }
        if (this.categories) {
            this.categories.forEach(c => {
                if (c.baseBid !== null && c.baseBid !== undefined) c.baseBid = parseInt(c.baseBid, 10) || 0;
                if (c.increment !== null && c.increment !== undefined) c.increment = parseInt(c.increment, 10) || 0;
                if (c.reserveBid !== null && c.reserveBid !== undefined) c.reserveBid = parseInt(c.reserveBid, 10) || 0;
                if (c.highestBidPerPlayer !== null && c.highestBidPerPlayer !== undefined) c.highestBidPerPlayer = parseInt(c.highestBidPerPlayer, 10) || 0;
                if (c.categoryHighestBidAll !== null && c.categoryHighestBidAll !== undefined) c.categoryHighestBidAll = parseInt(c.categoryHighestBidAll, 10) || 0;
            });
        }
        
        // Ensure "All" category exists and has correct auction details
        const allCatIndex = this.categories.findIndex(c => c.id.startsWith('cat_all_'));
        const allCatMax = this.auctionDetails ? (this.auctionDetails.playersPerTeamMax || 0) : 0;
        const allCatMin = this.auctionDetails ? (this.auctionDetails.playersPerTeamMin || 0) : 0;
        const allCatBase = this.auctionDetails ? (this.auctionDetails.baseBid || 0) : 0;
        const allCatInc = this.auctionDetails ? (this.auctionDetails.bidIncreaseBy || 0) : 0;

        if (allCatIndex === -1) {
            const allCat = {
                id: 'cat_all_' + currentId,
                auction_id: currentId,
                name: 'All',
                maxPlayers: allCatMax,
                minPlayers: allCatMin,
                baseBid: allCatBase,
                increment: allCatInc,
                reserveBid: 0,
                highestBidPerPlayer: 0,
                categoryHighestBidAll: 0,
                color: '#ffffff'
            };
            await this.db.query(`
                INSERT INTO categories (id, auction_id, name, "maxPlayers", "minPlayers", "baseBid", "increment", "reserveBid", "highestBidPerPlayer", "categoryHighestBidAll", color)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [allCat.id, allCat.auction_id, allCat.name, allCat.maxPlayers, allCat.minPlayers, allCat.baseBid, allCat.increment, allCat.reserveBid, allCat.highestBidPerPlayer, allCat.categoryHighestBidAll, allCat.color]);
            this.categories.push(allCat);
        } else {
            // Update existing "All" category if limits or base bid have changed
            const existingAll = this.categories[allCatIndex];
            if (existingAll.maxPlayers !== allCatMax || existingAll.minPlayers !== allCatMin || existingAll.baseBid !== allCatBase || existingAll.increment !== allCatInc) {
                await this.db.query(`
                    UPDATE categories
                    SET "maxPlayers" = $1, "minPlayers" = $2, "baseBid" = $3, "increment" = $4
                    WHERE id = $5
                `, [allCatMax, allCatMin, allCatBase, allCatInc, existingAll.id]);
                existingAll.maxPlayers = allCatMax;
                existingAll.minPlayers = allCatMin;
                existingAll.baseBid = allCatBase;
                existingAll.increment = allCatInc;
            }
        }
        this.updateCategoryCounts();
        } catch (syncErr) {
            console.error('[PostgreSQL] syncWithDB warning:', syncErr.message);
        }
    },

    updateCategoryCounts() {
        if (!this.teams) return;
        this.teams.forEach(team => {
            const counts = {};
            const teamPlayers = this.players.filter(p => p.soldTo === team.name && p.status === 'sold');
            teamPlayers.forEach(p => {
                if (p.category_id) {
                    const cat = this.categories.find(c => c.id === p.category_id);
                    if (cat) {
                        counts[cat.name] = (counts[cat.name] || 0) + 1;
                    }
                }
            });
            team.categoryCounts = counts;
        });
    },

    async saveStateToRedis() {
        try {
            await this.redis.set('auction_state', JSON.stringify(this.auctionState));
        } catch (err) {
            console.error('[Redis] Save State Error:', err);
        }
    },

    async loadStateFromRedis() {
        try {
            const savedState = await this.redis.get('auction_state');
            if (savedState) {
                this.auctionState = JSON.parse(savedState);
                if (this.auctionState) {
                    this.auctionState.currentBid = parseInt(this.auctionState.currentBid, 10) || 0;
                    if (this.auctionState.currentBid > 1e11 || isNaN(this.auctionState.currentBid)) {
                        console.warn('[Redis] Resetting corrupted currentBid to basePrice');
                        let startingBid = (this.auctionState.currentPlayer && parseInt(this.auctionState.currentPlayer.basePrice, 10)) || 0;
                        if (startingBid === 0 && this.auctionDetails && this.auctionDetails.baseBid) {
                            startingBid = parseInt(this.auctionDetails.baseBid, 10) || 1000;
                        }
                        this.auctionState.currentBid = startingBid || 1000;
                        this.auctionState.highestBidder = null;
                        this.auctionState.bidHistory = [];
                        await this.saveStateToRedis();
                    }
                }
                console.log('[Redis] Auction state restored.');
            }
        } catch (err) {
            console.error('[Redis] Load State Error:', err);
        }
    },

    async selectAuction(id) {
        const res = await this.db.query("SELECT * FROM auction_details WHERE id = $1", [id]);
        if (res.rows.length > 0) {
            this.auctionDetails = res.rows[0];
            try {
                await this.redis.set('last_active_auction_id', id);
            } catch (e) {
                console.error('[Redis] Failed to save last_active_auction_id:', e.message);
            }
            await this.syncWithDB();
            
            this.auctionState.currentPlayer = null;
            this.auctionState.currentBid = 0;
            this.auctionState.highestBidder = null;
            this.auctionState.status = 'finished';
            await this.saveStateToRedis();
        }
    },

    async addTeam(team) {
        team.auction_id = this.auctionDetails.id;
        this.teams.push(team);
        await this.db.query(`
            INSERT INTO teams (id, name, budget, color, logo, "shortName", "shortcutKey", auction_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [team.id, team.name, team.budget, team.color, team.logo || null, team.shortName || '', team.shortcutKey || '', team.auction_id]);
    },

    async addPlayer(player) {
        player.auction_id = this.auctionDetails.id;
        this.players.push(player);
        
        if (this.auctionState.status === 'finished') {
            this.auctionState.status = 'waiting';
        }

        await this.db.query(`
            INSERT INTO players (
                id, name, "basePrice", role, status, "soldTo", "soldPrice", phone, photo,
                "formNo", age, "fatherName", "tagOwner", "customTag",
                specification1, specification2, specification3,
                "tshirtSize", "jerseyName", "jerseyNumber", "trouserSize", detail, auction_id, category_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
        `, [player.id, player.name, player.basePrice, player.role, player.status, player.soldTo, player.soldPrice, player.phone || null, player.photo || null, player.formNo || '', player.age || null, player.fatherName || '', player.tagOwner || '', player.customTag || '', player.specification1 || '', player.specification2 || '', player.specification3 || '', player.tshirtSize || '', player.jerseyName || '', player.jerseyNumber || '', player.trouserSize || '', player.detail || '', player.auction_id, player.category_id || null]);
        this.updateCategoryCounts();
        await this.saveStateToRedis();
    },

    async addPlayersBulk(playersList) {
        if (!playersList || playersList.length === 0) return;
        const currentId = this.auctionDetails ? this.auctionDetails.id : 'active_auction';
        
        // Prepare values and query
        const queryParts = [];
        const values = [];
        let valIndex = 1;
        
        for (let player of playersList) {
            player.auction_id = currentId;
            this.players.push(player);
            
            const rowValues = [
                player.id, player.name, player.basePrice, player.role, player.status, player.soldTo, player.soldPrice, player.phone || null, player.photo || null,
                player.formNo || '', player.age || null, player.fatherName || '', player.tagOwner || '', player.customTag || '',
                player.specification1 || '', player.specification2 || '', player.specification3 || '',
                player.tshirtSize || '', player.jerseyName || '', player.jerseyNumber || '', player.trouserSize || '', player.detail || '', player.auction_id, player.category_id || null
            ];
            
            const valuePlaceholders = rowValues.map(() => `$${valIndex++}`).join(', ');
            queryParts.push(`(${valuePlaceholders})`);
            values.push(...rowValues);
        }
        
        if (this.auctionState.status === 'finished') {
            this.auctionState.status = 'waiting';
        }
        
        const sql = `
            INSERT INTO players (
                id, name, "basePrice", role, status, "soldTo", "soldPrice", phone, photo,
                "formNo", age, "fatherName", "tagOwner", "customTag",
                specification1, specification2, specification3,
                "tshirtSize", "jerseyName", "jerseyNumber", "trouserSize", detail, auction_id, category_id
            ) VALUES ${queryParts.join(', ')}
        `;
        
        await this.db.query(sql, values);
        await this.syncWithDB();
        this.updateCategoryCounts();
        await this.saveStateToRedis();
    },

    async updateTeam(teamId, updatedFields) {
        const team = this.teams.find(t => t.id === teamId);
        if (team) {
            const oldName = team.name;
            Object.assign(team, updatedFields);
            await this.db.query(`
                UPDATE teams 
                SET name = $1, budget = $2, color = $3, logo = $4, "shortName" = $5, "shortcutKey" = $6 
                WHERE id = $7
            `, [
                team.name, team.budget, team.color, team.logo || null, team.shortName || '', team.shortcutKey || '',
                teamId
            ]);
            
            if (oldName !== team.name) {
                for (let p of this.players) {
                    if (p.soldTo === oldName) {
                        p.soldTo = team.name;
                        await this.db.query('UPDATE players SET "soldTo" = $1 WHERE id = $2', [team.name, p.id]);
                    }
                }
            }
        }
    },

    async updatePlayer(playerId, updatedFields) {
        const player = this.players.find(p => p.id === playerId);
        if (player) {
            Object.assign(player, updatedFields);
            await this.db.query(`
            UPDATE players SET 
                name=$1, "basePrice"=$2, role=$3, phone=$4, photo=$5, 
                "formNo"=$6, age=$7, "fatherName"=$8, "tagOwner"=$9, "customTag"=$10,
                specification1=$11, specification2=$12, specification3=$13,
                "tshirtSize"=$14, "jerseyName"=$15, "jerseyNumber"=$16, "trouserSize"=$17, detail=$18, category_id=$19
            WHERE id=$20
        `, [
            player.name, player.basePrice, player.role, player.phone, player.photo,
            player.formNo, player.age, player.fatherName, player.tagOwner, player.customTag,
            player.specification1, player.specification2, player.specification3,
            player.tshirtSize, player.jerseyName, player.jerseyNumber, player.trouserSize, player.detail, player.category_id || null,
            player.id
        ]);
        }
    },

    async updatePlayerStatus(player) {
        await this.db.query('UPDATE players SET status = $1, "soldTo" = $2, "soldPrice" = $3 WHERE id = $4', 
            [player.status, player.soldTo, player.soldPrice, player.id]);
        this.updateCategoryCounts();
        await this.saveStateToRedis();
    },

    async updateTeamBudget(teamName, newBudget) {
        const team = this.teams.find(t => t.name === teamName || t.name.trim().toLowerCase() === String(teamName).trim().toLowerCase());
        if (team && team.id) {
            await this.db.query('UPDATE teams SET budget = $1 WHERE id = $2', [newBudget, team.id]);
        } else {
            await this.db.query('UPDATE teams SET budget = $1 WHERE name = $2', [newBudget, teamName]);
        }
    },

    async resetPlayer(playerId) {
        let player = this.players.find(p => String(p.id).trim() === String(playerId).trim() || (p.formNo && String(p.formNo).trim() === String(playerId).trim()));
        
        // Query database to get authoritative current status, soldTo, and soldPrice
        const targetId = player ? String(player.id) : String(playerId).trim();
        const dbRes = await this.db.query('SELECT * FROM players WHERE id = $1', [targetId]);
        const dbPlayer = dbRes.rows[0];
        
        const effectiveStatus = (player && player.status === 'sold') ? player.status : (dbPlayer ? dbPlayer.status : null);
        const effectiveSoldTo = (player && player.soldTo) ? player.soldTo : (dbPlayer ? dbPlayer.soldTo : null);
        const effectiveSoldPrice = (player && player.soldPrice) ? player.soldPrice : (dbPlayer ? dbPlayer.soldPrice : 0);

        if (effectiveStatus === 'sold' && effectiveSoldTo) {
            const team = this.teams.find(t => t.name === effectiveSoldTo || t.name.trim().toLowerCase() === String(effectiveSoldTo).trim().toLowerCase());
            if (team) {
                team.budget = parseInt(team.budget) + parseInt(effectiveSoldPrice || 0);
                await this.updateTeamBudget(team.name, team.budget);
            }
        }

        await this.db.query('UPDATE players SET status = $1, "soldTo" = $2, "soldPrice" = $3 WHERE id = $4', ['available', null, null, targetId]);

        if (player) {
            player.status = 'available';
            player.soldTo = null;
            player.soldPrice = null;
        }

        this.updateCategoryCounts();

        if (this.auctionState.currentPlayer && (String(this.auctionState.currentPlayer.id).trim() === targetId)) {
            this.auctionState.currentPlayer = null;
            this.auctionState.currentBid = 0;
            this.auctionState.highestBidder = null;
            this.auctionState.status = 'waiting';
        }
        await this.saveStateToRedis();
    },

    async adjustTeamBudget(teamName, adjustment) {
        const team = this.teams.find(t => t.name === teamName);
        if (team) {
            team.budget = parseInt(team.budget) + parseInt(adjustment);
            await this.db.query('UPDATE teams SET budget = $1 WHERE name = $2', [team.budget, teamName]);
        }
    },

    async resetEntireAuction() {
        const resetPoints = this.auctionDetails ? this.auctionDetails.pointsPerTeam : 100000;
        for (let p of this.players) {
            p.status = 'available';
            p.soldTo = null;
            p.soldPrice = null;
        }
        await this.db.query("UPDATE players SET status = 'available', \"soldTo\" = NULL, \"soldPrice\" = NULL");
        
        for (let t of this.teams) {
            t.budget = resetPoints; 
        }
        await this.db.query("UPDATE teams SET budget = $1", [resetPoints]);
        this.updateCategoryCounts();

        this.auctionState.currentPlayer = null;
        this.auctionState.currentBid = 0;
        this.auctionState.highestBidder = null;
        this.auctionState.timer = 30;
        this.auctionState.status = 'waiting';
        this.auctionState.activeCategory = 'all';
        await this.saveStateToRedis();
    },

    async deleteTeam(teamId) {
        const team = this.teams.find(t => t.id === teamId);
        if (team) {
            this.teams = this.teams.filter(t => t.id !== teamId);
            await this.db.query('DELETE FROM teams WHERE id = $1', [teamId]);
            for (let p of this.players) {
                if (p.soldTo === team.name) {
                    p.status = 'available';
                    p.soldTo = null;
                    p.soldPrice = null;
                    await this.db.query('UPDATE players SET status = $1, "soldTo" = $2, "soldPrice" = $3 WHERE id = $4', ['available', null, null, p.id]);
                }
            }
            this.updateCategoryCounts();
        }
    },

    async deletePlayer(playerId) {
        this.players = this.players.filter(p => p.id !== playerId);
        await this.db.query('DELETE FROM players WHERE id = $1', [playerId]);
        this.updateCategoryCounts();
        if (this.auctionState.currentPlayer && this.auctionState.currentPlayer.id === playerId) {
            this.auctionState.currentPlayer = null;
            this.auctionState.currentBid = 0;
            this.auctionState.highestBidder = null;
            this.auctionState.status = 'waiting';
        }
        await this.saveStateToRedis();
    },

    async assignCaptain(playerId) {
        const player = this.players.find(p => p.id === playerId);
        if (player && player.soldTo) {
            for (let p of this.players) {
                if (p.soldTo === player.soldTo) {
                    p.isCaptain = 0;
                }
            }
            await this.db.query('UPDATE players SET "isCaptain" = 0 WHERE "soldTo" = $1', [player.soldTo]);
            player.isCaptain = 1;
            await this.db.query('UPDATE players SET "isCaptain" = 1 WHERE id = $1', [playerId]);
        }
    },

    async createAuctionDetails(fields) {
        const newId = 'auction_' + Date.now();
        await this.db.query(`
            INSERT INTO auction_details (
                id, logo, "sportsType", season, name, "auctionDate", "auctionTime",
                "pointsPerTeam", units, "baseBid", "bidIncreaseBy", "playersPerTeamMax", "playersPerTeamMin",
                "sponsorLogo", "sponsorName"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
            newId, fields.logo || null, fields.sportsType || 'Cricket', fields.season || '', fields.name || '',
            fields.auctionDate || '', fields.auctionTime || '', fields.pointsPerTeam || 100000, fields.units || 'CR/LAC',
            fields.baseBid || 1000, fields.bidIncreaseBy || 500, fields.playersPerTeamMax || 16, fields.playersPerTeamMin || 0,
            fields.sponsorLogo || null, fields.sponsorName || ''
        ]);
        await this.db.query(`
            UPDATE players 
            SET "basePrice" = $1 
            WHERE ("basePrice" = 0 OR "basePrice" IS NULL) AND auction_id = $2
        `, [fields.baseBid || 1000, newId]);
        await this.syncWithDB();
        return newId;
    },

    async createBlankAuctionForAdmin(username, password) {
        const cleanUser = (username || '').trim();
        const cleanPass = (password || '').trim();
        if (!cleanUser || !cleanPass) throw new Error('Username and password are required');

        const newAuctionId = 'auction_' + cleanUser.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
        const tournamentName = `${cleanUser.toUpperCase()} PREMIER LEAGUE ${new Date().getFullYear()}`;

        // 1. Create fresh blank tournament in auction_details (0 teams, 0 players)
        await this.db.query(`
            INSERT INTO auction_details (
                id, logo, "sportsType", season, name, "auctionDate", "auctionTime",
                "pointsPerTeam", units, "baseBid", "bidIncreaseBy", "playersPerTeamMax", "playersPerTeamMin",
                "sponsorLogo", "sponsorName"
            ) VALUES ($1, null, 'Cricket', $2, $3, '2026-05-09', '16:00', 100000, 'CR/LAC', 1000.0, 500.0, 16, 0, null, '')
        `, [newAuctionId, String(new Date().getFullYear()), tournamentName]);

        // 2. Create default 'All' category for this blank tournament
        const catId = 'cat_all_' + newAuctionId;
        await this.db.query(`
            INSERT INTO categories (
                id, auction_id, name, "maxPlayers", "minPlayers", "baseBid", increment, "reserveBid", "highestBidPerPlayer", "categoryHighestBidAll", color
            ) VALUES ($1, $2, 'All', 16, 0, 1000, 500, 0, 0, 0, '#ffffff')
        `, [catId, newAuctionId]);

        // 3. Insert new admin account linked directly to their blank auction
        const defaultPerms = JSON.stringify(['live', 'teams', 'players', 'settings']);
        await this.db.query(
            "INSERT INTO users (username, password, role, permissions, active_auction_id) VALUES ($1, $2, 'admin', $3, $4)",
            [cleanUser, cleanPass, defaultPerms, newAuctionId]
        );

        await this.syncWithDB();
        return newAuctionId;
    },

    async deleteAuctionDetails(id) {
        if (!id || id === 'active_auction') return;
        await this.db.query('DELETE FROM auction_details WHERE id = $1', [id]);
        await this.db.query('DELETE FROM teams WHERE auction_id = $1', [id]);
        await this.db.query('DELETE FROM players WHERE auction_id = $1', [id]);
        await this.db.query('DELETE FROM categories WHERE auction_id = $1', [id]);
        if (this.auctionDetails && this.auctionDetails.id === id) {
            await this.selectAuction('active_auction');
        } else {
            await this.syncWithDB();
        }
    },

    async updateSponsorDetails(id, fields) {
        const idToUpdate = id || (this.auctionDetails ? this.auctionDetails.id : 'active_auction');
        if (fields.sponsorLogo !== undefined) {
            await this.db.query('UPDATE auction_details SET "sponsorLogo" = $1, "sponsorName" = $2 WHERE id = $3', [
                fields.sponsorLogo,
                fields.sponsorName || '',
                idToUpdate
            ]);
        } else {
            await this.db.query('UPDATE auction_details SET "sponsorName" = $1 WHERE id = $2', [
                fields.sponsorName || '',
                idToUpdate
            ]);
        }
        await this.syncWithDB();
    },

    async updateAuctionDetails(updatedFields) {
        const idToUpdate = updatedFields.id || 'active_auction';
        await this.db.query(`
            UPDATE auction_details 
            SET logo = COALESCE($1, logo), "sportsType" = $2, season = $3, name = $4, "auctionDate" = $5, "auctionTime" = $6,
                "pointsPerTeam" = $7, units = $8, "baseBid" = $9, "bidIncreaseBy" = $10, 
                "playersPerTeamMax" = $11, "playersPerTeamMin" = $12,
                "sponsorLogo" = COALESCE($14, "sponsorLogo"),
                "sponsorName" = $15
            WHERE id = $13
        `, [
            updatedFields.logo !== undefined ? updatedFields.logo : null,
            updatedFields.sportsType || 'Cricket',
            updatedFields.season || '',
            updatedFields.name || '',
            updatedFields.auctionDate || '',
            updatedFields.auctionTime || '',
            updatedFields.pointsPerTeam || 100000,
            updatedFields.units || 'CR/LAC',
            updatedFields.baseBid || 1000,
            updatedFields.bidIncreaseBy || 500,
            updatedFields.playersPerTeamMax || 16,
            updatedFields.playersPerTeamMin || 0,
            idToUpdate,
            updatedFields.sponsorLogo !== undefined ? updatedFields.sponsorLogo : null,
            updatedFields.sponsorName !== undefined ? updatedFields.sponsorName : ''
        ]);
        await this.db.query(`
            UPDATE players 
            SET "basePrice" = $1 
            WHERE ("basePrice" = 0 OR "basePrice" IS NULL) AND auction_id = $2
        `, [updatedFields.baseBid || 1000, idToUpdate]);
        await this.syncWithDB();
    },

    async clearAllData() {
        this.teams = [];
        this.players = [];
        await this.db.query("DELETE FROM teams");
        await this.db.query("DELETE FROM players");
        this.updateCategoryCounts();
        
        this.auctionState.currentPlayer = null;
        this.auctionState.currentBid = 0;
        this.auctionState.highestBidder = null;
        this.auctionState.timer = 30;
        this.auctionState.status = 'waiting';
        this.auctionState.activeCategory = 'all';
        await this.saveStateToRedis();
    },

    async clearAllPlayers() {
        const currentId = this.auctionDetails ? this.auctionDetails.id : 'active_auction';
        this.players = [];
        await this.db.query("DELETE FROM players WHERE auction_id = $1", [currentId]);
        this.updateCategoryCounts();
        
        this.auctionState.currentPlayer = null;
        this.auctionState.currentBid = 0;
        this.auctionState.highestBidder = null;
        this.auctionState.status = 'waiting';
        await this.saveStateToRedis();
    },

    async clearAllTeams() {
        const currentId = this.auctionDetails ? this.auctionDetails.id : 'active_auction';
        this.teams = [];
        await this.db.query("DELETE FROM teams WHERE auction_id = $1", [currentId]);
        
        // Reset all players to available status
        for (let p of this.players) {
            p.status = 'available';
            p.soldTo = null;
            p.soldPrice = null;
            p.isCaptain = 0;
        }
        await this.db.query("UPDATE players SET status = 'available', \"soldTo\" = NULL, \"soldPrice\" = NULL, \"isCaptain\" = 0 WHERE auction_id = $1", [currentId]);
        this.updateCategoryCounts();
        
        this.auctionState.highestBidder = null;
        await this.saveStateToRedis();
    }
};

module.exports = data;
