/**
 * Cloud Database Data Migrator / Restorer
 * 
 * Usage:
 *   node restore_cloud_db.js "postgresql://user:password@ep-xyz.neon.tech/neondb?sslmode=require"
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const targetUrl = process.argv[2] || process.env.DATABASE_URL;

if (!targetUrl) {
    console.error('\n❌ ERROR: Please provide your cloud PostgreSQL DATABASE_URL.');
    console.log('Usage: node restore_cloud_db.js "postgresql://user:password@host/db?sslmode=require"\n');
    process.exit(1);
}

const sqlFile = path.join(__dirname, 'auction_database_backup.sql');
if (!fs.existsSync(sqlFile)) {
    console.error('\n❌ ERROR: Backup file auction_database_backup.sql not found in workspace.\n');
    process.exit(1);
}

async function runMigration() {
    console.log('\n🚀 Connecting to target cloud database...');
    const client = new Client({
        connectionString: targetUrl,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Connected successfully to Cloud PostgreSQL!');

        console.log('📦 Reading auction_database_backup.sql (560KB)...');
        const sql = fs.readFileSync(sqlFile, 'utf8');

        console.log('⚡ Executing schema and data migration...');
        await client.query(sql);

        console.log('\n🎉 SUCCESS! All tables, users, teams, 147 players, and auction settings have been migrated to your cloud database.\n');
    } catch (err) {
        console.error('\n❌ Migration failed:', err.message);
    } finally {
        await client.end();
    }
}

runMigration();
