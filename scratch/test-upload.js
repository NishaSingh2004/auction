const fs = require('fs');
const path = require('path');

async function testUpload(filename) {
    const filePath = path.join(__dirname, '../', filename);
    if (!fs.existsSync(filePath)) {
        console.error(`File does not exist: ${filePath}`);
        return;
    }
    const fileBuffer = fs.readFileSync(filePath);
    
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: 'text/csv' });
    formData.append('csvFile', blob, path.basename(filePath));

    console.log(`\n========================================`);
    console.log(`Uploading ${filename}...`);
    console.log(`========================================`);
    try {
        const res = await fetch('http://localhost:3001/admin/upload-players', {
            method: 'POST',
            body: formData
        });
        const json = await res.json();
        console.log(`Status code: ${res.status}`);
        if (json.success) {
            console.log(`SUCCESS! Total players now: ${json.players.length}`);
            console.log(`Last added player details:`, JSON.stringify(json.players[json.players.length - 1], null, 2));
        } else {
            console.log(`FAILED! Message:`, json.message);
        }
    } catch (e) {
        console.error(`Error uploading ${filename}:`, e);
    }
}

async function run() {
    await testUpload('sample_players.csv');
    await testUpload('scratch/rzp-key.csv');
}

run();
