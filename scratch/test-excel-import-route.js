const fs = require('fs');
const path = require('path');

async function run() {
    const csvPath = path.join(__dirname, 'test_photo_import.csv');
    if (!fs.existsSync(csvPath)) {
        console.error("CSV file not found:", csvPath);
        process.exit(1);
    }

    const fileBuffer = fs.readFileSync(csvPath);
    
    // Create FormData
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: 'text/csv' });
    formData.append('excelFile', blob, 'test_photo_import.csv');
    formData.append('activeAuctionId', 'active_auction');

    console.log("Posting file to bulk-excel-import...");
    try {
        const response = await fetch('http://localhost:3000/admin/media/bulk-excel-import', {
            method: 'POST',
            body: formData
        });
        
        console.log("Response status:", response.status);
        const text = await response.text();
        console.log("Raw response body:", text);
        
        const json = JSON.parse(text);
        if (json.success) {
            console.log("✅ Success! Import results:", json.data);
        } else {
            console.error("❌ Failed:", json.message || json);
        }
    } catch (e) {
        console.error("Error making request:", e);
    }
}

run();
