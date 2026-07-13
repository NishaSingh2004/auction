const { Pool } = require('pg');
const { createClient } = require('redis');

async function test() {
    console.log('Testing Redis connection...');
    const redisClient = createClient({
        url: 'redis://localhost:6379'
    });
    redisClient.on('error', (err) => console.error('[Redis] Error:', err));
    try {
        await redisClient.connect();
        console.log('[Redis] Connected successfully!');
        await redisClient.disconnect();
    } catch (e) {
        console.error('[Redis] Failed to connect:', e);
    }

    console.log('Testing Postgres connection...');
    const pool = new Pool({
        user: 'postgres',
        host: 'localhost',
        database: 'auction',
        password: 'postgres',
        port: 5432
    });
    try {
        const client = await pool.connect();
        console.log('[Postgres] Connected successfully!');
        const res = await client.query('SELECT NOW()');
        console.log('[Postgres] Query result:', res.rows[0]);
        client.release();
        await pool.end();
    } catch (e) {
        console.error('[Postgres] Failed to connect:', e);
    }
}

test();
