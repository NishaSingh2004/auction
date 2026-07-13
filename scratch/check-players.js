const data = require('../models/data');
data.init().then(async () => {
    const resAuctions = await data.db.query('SELECT * FROM auctions');
    console.log("ALL AUCTIONS:", resAuctions.rows);
    
    const resDetails = await data.db.query('SELECT * FROM auction_details');
    console.log("ALL AUCTION DETAILS:", resDetails.rows);
    
    const resCount = await data.db.query('SELECT auction_id, COUNT(*) FROM players GROUP BY auction_id');
    console.log("PLAYERS PER AUCTION:", resCount.rows);
    
    const resAllPlayers = await data.db.query('SELECT id, name, "formNo", auction_id FROM players');
    console.log("ALL PLAYERS (total " + resAllPlayers.rows.length + "):", resAllPlayers.rows.slice(0, 20));
    
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
