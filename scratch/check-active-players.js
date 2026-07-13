const data = require('../models/data');
data.init().then(async () => {
    const res = await data.db.query("SELECT id, name, \"formNo\", \"jerseyNumber\", photo FROM players WHERE auction_id = 'active_auction'");
    console.log("ACTIVE AUCTION PLAYERS:", res.rows);
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
