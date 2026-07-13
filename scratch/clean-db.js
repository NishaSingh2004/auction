const data = require('../models/data');

async function run() {
    try {
        await data.init();
        const res = await data.db.query("DELETE FROM players WHERE name LIKE 'rzp_%'");
        console.log(`Deleted ${res.rowCount} test players starting with rzp_`);
    } catch (e) {
        console.error('Error cleaning database:', e);
    }
    process.exit(0);
}
run();
