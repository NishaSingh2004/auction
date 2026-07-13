const fs = require('fs');
const path = require('path');

async function testUpload(filename) {
    const filePath = path.join(__dirname, '../', filename);
    if (!fs.existsSync(filePath)) {
        console.error(`File does not exist: ${filePath}`);
        return;
    }
    const fileBuffer = fs.readFileSync(filePath);
    
    const ext = path.extname(filePath).toLowerCase();
    let type = 'text/csv';
    if (ext === '.xlsx') {
        type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (ext === '.xls') {
        type = 'application/vnd.ms-excel';
    }

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: type });
    formData.append('csvFile', blob, path.basename(filePath));

    console.log(`\n========================================`);
    console.log(`Uploading ${filename}...`);
    console.log(`========================================`);
    try {
        const res = await fetch('http://127.0.0.1:3000/admin/upload-players', {
            method: 'POST',
            body: formData
        });
        const json = await res.json();
        console.log(`Status code: ${res.status}`);
        if (json.success) {
            console.log(`SUCCESS!`);
            console.log(`Total rows in file: ${json.total}`);
            console.log(`Successful registrations: ${json.successful}`);
            console.log(`Failed/skipped rows: ${json.failed}`);
            console.log(`Last added player:`, JSON.stringify(json.players[json.players.length - 1], null, 2));
        } else {
            console.log(`FAILED! Message:`, json.message);
        }
    } catch (e) {
        console.error(`Error uploading ${filename}:`, e);
    }
}

async function run() {
    await testUpload('scratch/flexible_players.xlsx');
    await testUpload('scratch/verification_players.xlsx');
    await testUpload('scratch/verification_players.csv');
    await testUpload('scratch/test_players.csv');
    await testUpload('scratch/rzp-key.csv');
}

run();
