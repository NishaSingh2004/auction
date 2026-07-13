// scratch/test-media-hub.js
// Script to programmatically verify media matching and zip extraction logic

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// Mock data model structure
const mockPlayers = [
    { id: 'p1', name: 'John Doe', formNo: '101', photo: null, auction_id: 'active_auction' },
    { id: 'p2', name: 'Alice Smith', formNo: '102', photo: null, auction_id: 'active_auction' },
    { id: 'p3', name: 'Bob Johnson', formNo: '103', photo: null, auction_id: 'active_auction' }
];

// Helper from routes/media.js
function findMatchedPlayer(filename, players) {
    const nameWithoutExt = path.parse(filename).name.trim().toLowerCase();
    
    // 1. Try matching by formNo (exact match or numeric comparison)
    let player = players.find(p => {
        if (!p.formNo) return false;
        const dbFormStr = p.formNo.toString().trim().toLowerCase();
        const dbFormInt = parseInt(dbFormStr, 10);
        const fileFormInt = parseInt(nameWithoutExt, 10);
        if (!isNaN(dbFormInt) && !isNaN(fileFormInt)) {
            return dbFormInt === fileFormInt;
        }
        return dbFormStr === nameWithoutExt;
    });
    if (player) return player;
    
    // 2. Try matching by name (exact name match)
    player = players.find(p => p.name && p.name.trim().toLowerCase() === nameWithoutExt);
    if (player) return player;
    
    // 3. Try matching by phone number or ID
    player = players.find(p => p.phone && p.phone.trim() === nameWithoutExt);
    if (player) return player;
    
    player = players.find(p => p.id === nameWithoutExt);
    if (player) return player;

    return null;
}

function runTests() {
    console.log('--- STARTING PROGRAMMATIC MEDIA HUB VERIFICATION ---');
    
    // Test Case 1: Matching by exact Form No
    console.log('\n[Test 1] Matching by Form No...');
    const match1 = findMatchedPlayer('101.jpg', mockPlayers);
    if (match1 && match1.id === 'p1') {
        console.log('✅ Success: "101.jpg" matched player "John Doe"');
    } else {
        console.error('❌ Failed: "101.jpg" did not match correctly. Found:', match1);
    }

    // Test Case 2: Matching by Form No with different extension
    const match2 = findMatchedPlayer('102.png', mockPlayers);
    if (match2 && match2.id === 'p2') {
        console.log('✅ Success: "102.png" matched player "Alice Smith"');
    } else {
        console.error('❌ Failed: "102.png" did not match correctly. Found:', match2);
    }

    // Test Case 3: Matching by Name case-insensitive
    const match3 = findMatchedPlayer('John Doe.webp', mockPlayers);
    if (match3 && match3.id === 'p1') {
        console.log('✅ Success: "John Doe.webp" matched player "John Doe"');
    } else {
        console.error('❌ Failed: "John Doe.webp" did not match correctly. Found:', match3);
    }

    // Test Case 4: Non-matching file
    const match4 = findMatchedPlayer('999.jpg', mockPlayers);
    if (match4 === null) {
        console.log('✅ Success: "999.jpg" correctly returned no match (null)');
    } else {
        console.error('❌ Failed: "999.jpg" returned unexpected match:', match4);
    }

    // Test Case 5: ZIP creation and extraction verification
    console.log('\n[Test 2] Verifying AdmZip integration...');
    const zip = new AdmZip();
    zip.addFile('101.jpg', Buffer.from('mock_image_101'));
    zip.addFile('103.jpg', Buffer.from('mock_image_103'));
    zip.addFile('unmatched.png', Buffer.from('mock_image_unmatched'));
    
    const zipBuffer = zip.toBuffer();
    const tempZipPath = path.join(__dirname, 'temp_test.zip');
    fs.writeFileSync(tempZipPath, zipBuffer);
    
    try {
        const readZip = new AdmZip(tempZipPath);
        const entries = readZip.getEntries();
        console.log(`✅ Success: ZIP created and read successfully with ${entries.length} entries`);
        
        let extractedMatches = 0;
        entries.forEach(entry => {
            const matchedPlayer = findMatchedPlayer(entry.entryName, mockPlayers);
            if (matchedPlayer) {
                extractedMatches++;
                console.log(`   - Extracted entry "${entry.entryName}" matched with: ${matchedPlayer.name}`);
            } else {
                console.log(`   - Extracted entry "${entry.entryName}" had no match`);
            }
        });
        
        if (extractedMatches === 2) {
            console.log('✅ Success: Extracted files match the expected number of players (2/3 matches)');
        } else {
            console.error(`❌ Failed: Expected 2 matches, got ${extractedMatches}`);
        }
    } catch (e) {
        console.error('❌ Failed zip extraction test:', e);
    } finally {
        if (fs.existsSync(tempZipPath)) {
            fs.unlinkSync(tempZipPath);
        }
    }
    
    console.log('\n--- VERIFICATION COMPLETE ---');
}

runTests();
