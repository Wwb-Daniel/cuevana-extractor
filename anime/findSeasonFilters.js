const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const BASE_URL = process.env.BASE_URL || 'https://tioanime.com';

async function findSeasonLinks() {
    console.log('Fetching directory to find season links...');
    try {
        const response = await axios.get(`${BASE_URL}/directorio`);
        const $ = cheerio.load(response.data);

        console.log('\n--- Season Filter Options ---');
        $('select[name="season"] option').each((i, el) => {
            console.log(`Option: "${$(el).text().trim()}" Value: "${$(el).val()}"`);
        });

        console.log('\n--- Year Filter Options (First 5) ---');
        $('select[name="year"] option').slice(0, 5).each((i, el) => {
            console.log(`Option: "${$(el).text().trim()}" Value: "${$(el).val()}"`);
        });

    } catch (e) {
        console.error('Error:', e.message);
    }
}

findSeasonLinks();
