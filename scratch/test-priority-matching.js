// scratch/test-priority-matching.js
// Verification script for the player photo auto-matching priority engine

const path = require('path');

// Mock data model matching the schema
const mockPlayers = [
    { id: '101', name: 'John Doe', formNo: '202', jerseyNumber: '303' },
    { id: '202', name: 'Alice Smith', formNo: '404', jerseyNumber: '505' },
    { id: '303', name: 'Bob Johnson', formNo: '606', jerseyNumber: '101' }, // jerseyNumber is '101'
    { id: '900', name: 'Virat Kohli', formNo: '707', jerseyNumber: '808' },
    { id: '901', name: 'Rohit Sharma', formNo: '101', jerseyNumber: '809' }  // formNo is '101'
];

function findMatchedPlayerByPriority(identifier, players) {
    if (!identifier) return null;
    const cleanId = String(identifier).trim();
    const cleanIdLower = cleanId.toLowerCase();
    const cleanIdInt = parseInt(cleanId, 10);
    
    // Priority 1: Player ID
    let player = players.find(p => p.id && String(p.id).trim() === cleanId);
    if (player) return { player, matchedBy: 'Player ID' };
    
    // Priority 2: Form Number
    player = players.find(p => {
        if (!p.formNo) return false;
        const dbFormStr = String(p.formNo).trim();
        if (dbFormStr === cleanId) return true;
        const dbFormInt = parseInt(dbFormStr, 10);
        return (!isNaN(dbFormInt) && !isNaN(cleanIdInt) && dbFormInt === cleanIdInt);
    });
    if (player) return { player, matchedBy: 'Form Number' };
    
    // Priority 3, 4, 5: Player Number / Registration Number / Jersey Number (maps to jerseyNumber)
    player = players.find(p => {
        if (!p.jerseyNumber) return false;
        const dbJerseyStr = String(p.jerseyNumber).trim();
        if (dbJerseyStr === cleanId) return true;
        const dbJerseyInt = parseInt(dbJerseyStr, 10);
        return (!isNaN(dbJerseyInt) && !isNaN(cleanIdInt) && dbJerseyInt === cleanIdInt);
    });
    if (player) return { player, matchedBy: 'Player Number' };
    
    // Priority 6: Player Name (case-insensitive)
    player = players.find(p => p.name && p.name.trim().toLowerCase() === cleanIdLower);
    if (player) return { player, matchedBy: 'Player Name' };
    
    return null;
}

function runTests() {
    console.log('--- STARTING PROGRAMMATIC PRIORITY AUTO-MATCHING VERIFICATION ---');
    let failures = 0;

    const assertMatch = (testName, identifier, expectedPlayerId, expectedMatchedBy) => {
        const result = findMatchedPlayerByPriority(identifier, mockPlayers);
        if (!result) {
            console.error(`❌ ${testName} Failed: No match found for "${identifier}"`);
            failures++;
            return;
        }
        const { player, matchedBy } = result;
        if (player.id === expectedPlayerId && matchedBy === expectedMatchedBy) {
            console.log(`✅ ${testName} Passed: "${identifier}" matched ${player.name} by ${matchedBy}`);
        } else {
            console.error(`❌ ${testName} Failed: Expected player ID "${expectedPlayerId}" matched by "${expectedMatchedBy}", got ID "${player.id}" matched by "${matchedBy}"`);
            failures++;
        }
    };

    // Test 1: Priority 1 - Player ID
    assertMatch('Test 1: Player ID Match', '202', '202', 'Player ID');

    // Test 2: Priority 2 - Form Number
    assertMatch('Test 2: Form Number Match', '404', '202', 'Form Number');

    // Test 3: Priority 3/4/5 - Player/Jersey Number
    assertMatch('Test 3: Jersey Number Match', '505', '202', 'Player Number');

    // Test 4: Priority 6 - Player Name case-insensitive
    assertMatch('Test 4: Player Name case-insensitive', 'virat kohli', '900', 'Player Name');

    // Test 5: Verify priority resolution (P1 > P2 > P3)
    // "101" matches Player ID: '101' (P1), Form Number of Rohit Sharma (P2), Jersey Number of Bob Johnson (P3)
    // Should match Player ID '101' (John Doe)
    assertMatch('Test 5: Priority P1 over P2 and P3', '101', '101', 'Player ID');

    // Test 6: Verify priority resolution (P2 over P3)
    // Rohit Sharma has Form No '101' (P2)
    // Let's remove John Doe (ID '101') from players list and search "101" - should match Rohit Sharma by Form Number (P2)
    const mockWithoutP1 = mockPlayers.filter(p => p.id !== '101');
    const resultP2 = findMatchedPlayerByPriority('101', mockWithoutP1);
    if (resultP2 && resultP2.player.id === '901' && resultP2.matchedBy === 'Form Number') {
        console.log('✅ Test 6 Passed: Priority P2 over P3');
    } else {
        console.error('❌ Test 6 Failed: Priority P2 over P3 did not resolve to Form Number');
        failures++;
    }

    console.log(`\n--- VERIFICATION COMPLETED with ${failures} failures ---`);
    process.exit(failures > 0 ? 1 : 0);
}

runTests();
