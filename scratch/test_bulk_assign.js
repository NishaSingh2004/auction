const http = require('http');
const data = require('../models/data');

// Helper to make POST request
function makePostRequest(path, body) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(body);
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let responseBody = '';
            res.on('data', (chunk) => { responseBody += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(responseBody));
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${responseBody}`));
                }
            });
        });

        req.on('error', (e) => { reject(e); });
        req.write(postData);
        req.end();
    });
}

async function runTests() {
    console.log("=== STARTING BULK ASSIGNMENT INTEGRATION TESTS ===");
    await data.init();
    const currentId = data.auctionDetails ? data.auctionDetails.id : 'active_auction';

    // 1. Clean up any existing test categories or players
    await data.db.query("DELETE FROM categories WHERE id IN ('cat_test_u16', 'cat_test_u19')");
    await data.db.query("DELETE FROM players WHERE id IN ('p_t1', 'p_t2', 'p_t3', 'p_t4')");

    // 2. Insert test categories
    // Test Category 1: Max players = 2 (should not block assignment)
    await data.db.query(`
        INSERT INTO categories (id, auction_id, name, "maxPlayers", "minPlayers", "baseBid", "increment", "reserveBid", color)
        VALUES ('cat_test_u16', $1, 'Test U16', 2, 2, 1000, 500, 0, '#ff0000')
    `, [currentId]);

    // Test Category 2: Max players = 3
    await data.db.query(`
        INSERT INTO categories (id, auction_id, name, "maxPlayers", "minPlayers", "baseBid", "increment", "reserveBid", color)
        VALUES ('cat_test_u19', $1, 'Test U19', 3, 3, 2000, 500, 0, '#00ff00')
    `, [currentId]);

    // 3. Insert test players
    for (let i = 1; i <= 4; i++) {
        await data.db.query(`
            INSERT INTO players (id, auction_id, name, "basePrice", role, status, category_id)
            VALUES ($1, $2, $3, 1000, 'Batsman', 'available', NULL)
        `, [`p_t${i}`, currentId, `Test Player ${i}`]);
    }

    // Sync in-memory cache
    await data.syncWithDB();

    console.log("Database initialized with 2 test categories and 4 test players.");

    let pass = true;

    // Test Case 1: Try to assign 4 players to 'Test U16' (max 2). Expect success because category maxPlayers doesn't block category assignment.
    console.log("\n--- TEST CASE 1: Assigning 4 players to category with max limit = 2 (Should Succeed) ---");
    try {
        const res = await makePostRequest('/admin/bulk-assign-categories', {
            playerIds: ['p_t1', 'p_t2', 'p_t3', 'p_t4'],
            categoryIds: ['cat_test_u16']
        });
        console.log("Response:", res);
        if (res.success === true && res.summary.assigned === 4) {
            console.log("PASS: Successfully assigned all 4 players regardless of category max limit.");
        } else {
            console.log("FAIL: Expected successful assignment of all 4 players.");
            pass = false;
        }

        // Verify database: 4 players should have category_id 'cat_test_u16'
        const checkDb = await data.db.query("SELECT * FROM players WHERE category_id = 'cat_test_u16'");
        if (checkDb.rows.length === 4) {
            console.log("PASS: DB updated correctly, 4 players in category.");
        } else {
            console.log("FAIL: Database state incorrect! Assigned players count:", checkDb.rows.length);
            pass = false;
        }
    } catch (e) {
        console.error("Test Case 1 failed with error:", e);
        pass = false;
    }

    // Test Case 2: Try to re-assign same 4 players to 'Test U16'. Expect assigned=0, already=4.
    console.log("\n--- TEST CASE 2: Re-assigning same 4 players to Test U16 ---");
    try {
        const res = await makePostRequest('/admin/bulk-assign-categories', {
            playerIds: ['p_t1', 'p_t2', 'p_t3', 'p_t4'],
            categoryIds: ['cat_test_u16']
        });
        console.log("Response:", res);
        if (res.success === true && res.summary.assigned === 0 && res.summary.already === 4) {
            console.log("PASS: Correctly skipped all 4 players as they are already in the category.");
        } else {
            console.log("FAIL: Expected assigned = 0 and already = 4.");
            pass = false;
        }
    } catch (e) {
        console.error("Test Case 2 failed with error:", e);
        pass = false;
    }

    // Test Case 3: Remove P1, P2, P3, P4 from Test U16.
    console.log("\n--- TEST CASE 3: Removing players in bulk from Test U16 ---");
    try {
        const res = await makePostRequest('/admin/bulk-remove-categories', {
            playerIds: ['p_t1', 'p_t2', 'p_t3', 'p_t4'],
            categoryIds: ['cat_test_u16']
        });
        console.log("Response:", res);
        if (res.success === true && res.removedCount === 4) {
            console.log("PASS: Successfully removed all 4 assignments.");
        } else {
            console.log("FAIL: Expected removedCount = 4.");
            pass = false;
        }

        // Verify database
        const checkDb = await data.db.query("SELECT category_id FROM players WHERE id IN ('p_t1', 'p_t2', 'p_t3', 'p_t4')");
        const allNull = checkDb.rows.every(r => r.category_id === null);
        if (allNull) {
            console.log("PASS: All test players successfully reset to category_id = NULL.");
        } else {
            console.log("FAIL: Some players still have category_id:", checkDb.rows);
            pass = false;
        }
    } catch (e) {
        console.error("Test Case 3 failed with error:", e);
        pass = false;
    }

    // Clean up database
    await data.db.query("DELETE FROM categories WHERE id IN ('cat_test_u16', 'cat_test_u19')");
    await data.db.query("DELETE FROM players WHERE id IN ('p_t1', 'p_t2', 'p_t3', 'p_t4')");
    await data.syncWithDB();

    console.log("\n=== TEST RUN FINISHED ===");
    if (pass) {
        console.log("ALL TESTS PASSED SUCCESSFULLY! ✅");
    } else {
        console.error("SOME TESTS FAILED! ❌");
    }
    process.exit(pass ? 0 : 1);
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
