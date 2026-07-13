const fs = require('fs');

async function testScrape() {
    // Example public folder ID (this is a placeholder public folder ID we can try or use to inspect HTML structure)
    // Let's use a known public folder or see how Google Drive renders the page
    const folderId = '1FYLaoscxWBV_BU5sFouf7XCrv7cKktBY'; // Test folder ID (we'll see if it exists/is public)
    const url = `https://drive.google.com/embeddedfolderview?id=${folderId}`;
    
    try {
        console.log('Fetching', url);
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const html = await res.text();
        fs.writeFileSync('scratch/folder_page.html', html);
        console.log('Saved html to scratch/folder_page.html, size:', html.length);
        
        // Let's do some regex searches in the html
        // File entries in embeddedfolderview are typically inside a JSON array/object inside a script tag
        // e.g. ["id", "filename", ...] or similar.
        // Let's search for some patterns
        const entryPattern = /class="flip-entry"[^>]*id="entry-([a-zA-Z0-9_-]+)"[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>/g;
        let match;
        const filesFound = [];
        while ((match = entryPattern.exec(html)) !== null) {
            filesFound.push({
                id: match[1],
                name: match[2]
            });
        }
        console.log('Scraped files count:', filesFound.length);
        console.log('Files:', filesFound);
        
    } catch (err) {
        console.error('Error fetching/scraping:', err);
    }
}

testScrape();
