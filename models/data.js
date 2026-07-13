const { Pool } = require('pg');
const { createClient } = require('redis');
const path = require('path');

// PostgreSQL Connection Pool
const pool = new Pool({
    user: process.env.PGUSER || 'postgres',
    host: process.env.PGHOST || 'localhost',
    database: process.env.PGDATABASE || 'auction',
    password: process.env.PGPASSWORD || 'postgres',
    port: process.env.PGPORT || 5432,
    connectionString: process.env.DATABASE_URL
});

// Redis Client
const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.error('[Redis] Error:', err));

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
    db: pool,
    redis: redisClient,
    
    async init() {
        try {
            // Connect Redis
            if (!this.redis.isOpen) {
                await this.redis.connect();
                console.log('[Redis] Connected.');
            }

            // Initializing Tables for PostgreSQL
            await this.db.query(`
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
                
                -- Add columns if they were created before these were added
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
                CREATE TABLE IF NOT EXISTS users (
                    username TEXT PRIMARY KEY,
                    password TEXT,
                    role TEXT
                );
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

            // Seed Admin
            const adminCheck = await this.db.query("SELECT * FROM users WHERE username = 'admin'");
            if (adminCheck.rows.length === 0) {
                await this.db.query("INSERT INTO users (username, password, role) VALUES ('admin', 'admin', 'admin')");
            }

            // Load or Create default auction details
            let detailsRes = await this.db.query("SELECT * FROM auction_details WHERE id = 'active_auction'");
            if (detailsRes.rows.length === 0) {
                await this.db.query(`
                    INSERT INTO auction_details (
                        id, logo, "sportsType", season, name, "auctionDate", "auctionTime",
                        "pointsPerTeam", units, "baseBid", "bidIncreaseBy", "playersPerTeamMax", "playersPerTeamMin"
                    ) VALUES (
                        'active_auction', null, 'Cricket', '2026', 
                        'THE RISING STAR AND GODAVARI VOX LEGIS U-23 LEAGUE 2026', 
                        '2026-05-09', '16:00', 100000, 'CR/LAC', 1000.0, 500.0, 16, 0
                    )
                `);
                detailsRes = await this.db.query("SELECT * FROM auction_details WHERE id = 'active_auction'");
            }
            this.auctionDetails = detailsRes.rows[0];

            // Load initial teams and players
            const currentId = this.auctionDetails ? this.auctionDetails.id : 'active_auction';
            await this.syncWithDB();

            // Restore State from Redis
            await this.loadStateFromRedis();

            console.log(`[PostgreSQL] Ready. Initialized with ${this.teams.length} teams and ${this.players.length} players.`);
        } catch (err) {
            console.error('[PostgreSQL/Redis] Initialization Error:', err);
            throw err;
        }
    },

    async syncWithDB() {
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
        await this.db.query('UPDATE teams SET budget = $1 WHERE name = $2', [newBudget, teamName]);
    },

    async resetPlayer(playerId) {
        const player = this.players.find(p => p.id === playerId);
        if (player) {
            if (player.status === 'sold' && player.soldTo) {
                const team = this.teams.find(t => t.name === player.soldTo);
                if (team) {
                    team.budget = parseInt(team.budget) + parseInt(player.soldPrice || 0);
                    await this.updateTeamBudget(team.name, team.budget);
                }
            }
            player.status = 'available';
            player.soldTo = null;
            player.soldPrice = null;
            await this.db.query('UPDATE players SET status = $1, "soldTo" = $2, "soldPrice" = $3 WHERE id = $4', ['available', null, null, playerId]);
            this.updateCategoryCounts();

            if (this.auctionState.currentPlayer && this.auctionState.currentPlayer.id === playerId) {
                this.auctionState.currentPlayer = null;
                this.auctionState.currentBid = 0;
                this.auctionState.highestBidder = null;
                this.auctionState.status = 'waiting';
            }
            await this.saveStateToRedis();
        }
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
                "pointsPerTeam", units, "baseBid", "bidIncreaseBy", "playersPerTeamMax", "playersPerTeamMin"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
            newId, fields.logo || null, fields.sportsType || 'Cricket', fields.season || '', fields.name || '',
            fields.auctionDate || '', fields.auctionTime || '', fields.pointsPerTeam || 100000, fields.units || 'CR/LAC',
            fields.baseBid || 1000, fields.bidIncreaseBy || 500, fields.playersPerTeamMax || 16, fields.playersPerTeamMin || 0
        ]);
        await this.db.query(`
            UPDATE players 
            SET "basePrice" = $1 
            WHERE ("basePrice" = 0 OR "basePrice" IS NULL) AND auction_id = $2
        `, [fields.baseBid || 1000, newId]);
        await this.syncWithDB();
        return newId;
    },

    async deleteAuctionDetails(id) {
        if (id === 'active_auction') return;
        await this.db.query('DELETE FROM auction_details WHERE id = $1', [id]);
        await this.syncWithDB();
    },

    async updateAuctionDetails(updatedFields) {
        const idToUpdate = updatedFields.id || 'active_auction';
        await this.db.query(`
            UPDATE auction_details 
            SET logo = COALESCE($1, logo), "sportsType" = $2, season = $3, name = $4, "auctionDate" = $5, "auctionTime" = $6,
                "pointsPerTeam" = $7, units = $8, "baseBid" = $9, "bidIncreaseBy" = $10, 
                "playersPerTeamMax" = $11, "playersPerTeamMin" = $12
            WHERE id = $13
        `, [
            updatedFields.logo || null,
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
            idToUpdate
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
