const data = require('../models/data');

async function check() {
    await data.init();
    console.log("Categories in cache:", JSON.stringify(data.categories, null, 2));
    console.log("Categories from query:", JSON.stringify((await data.db.query("SELECT * FROM categories")).rows, null, 2));
    process.exit(0);
}

check().catch(e => {
    console.error(e);
    process.exit(1);
});
