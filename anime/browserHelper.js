const { spawnSync } = require('child_process');
const path = require('path');

async function getHTML(url) {
    try {
        console.log(`  [Browser] Fetching ${url} using Selenium bridge...`);
        const pythonPath = 'python'; // Asumiendo que python está en el PATH
        const scriptPath = path.join(__dirname, 'fetch_html.py');
        
        const result = spawnSync(pythonPath, [scriptPath, url], { 
            encoding: 'utf8', 
            maxBuffer: 1024 * 1024 * 20 // 20MB buffer
        });
        
        if (result.error) {
            console.error('Python bridge error:', result.error);
            return null;
        }
        
        return result.stdout;
    } catch (error) {
        console.error(`Error fetching with Python bridge: ${url}`, error.message);
        return null;
    }
}

module.exports = { getHTML };
