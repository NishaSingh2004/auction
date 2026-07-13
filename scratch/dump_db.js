const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

async function dump() {
    const db = await open({
        filename: path.join(__dirname, 'auction.db'),
        driver: sqlite3.Database
    });
    const players = await db.all('SELECT id, name, status, auction_id FROM players');
    const teams = await db.all('SELECT id, name, auction_id FROM teams');
    const auction = await db.get("SELECT * FROM auction_details WHERE id = 'active_auction'");
    console.log('ACTIVE AUCTION:', JSON.stringify(auction, null, 2));
    console.log('PLAYERS:', JSON.stringify(players, null, 2));
    console.log('TEAMS:', JSON.stringify(teams, null, 2));
}

dump();
