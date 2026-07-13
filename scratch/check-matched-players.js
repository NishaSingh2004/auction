const data = require('../models/data');
data.init().then(async () => {
    const res = await data.db.query("SELECT id, name, \"formNo\", photo, auction_id FROM players WHERE photo LIKE '/uploads/excel-%'");
    console.log("MATCHED PLAYERS count:", res.rows.length);
    console.log("MATCHED PLAYERS sample:", res.rows.slice(0, 20));
    
    // Also let's check what the active_auction ID in the running state actually is by checking the active_auction table details
    const activeRes = await data.db.query("SELECT * FROM auction_details");
    console.log("ACTIVE DETAILS IN DB:", activeRes.rows);
    
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
