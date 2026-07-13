const data = require('../models/data');
data.init().then(() => {
    console.log("Total players loaded:", data.players.length);
    console.log("Sample players:", data.players.slice(0, 10).map(p => ({
        id: p.id,
        name: p.name,
        formNo: p.formNo,
        auction_id: p.auction_id
    })));
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
