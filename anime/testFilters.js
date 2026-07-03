const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://tioanime.com';

async function testFilters() {
    const filters = ['recent', 'popular', 'puntuacion'];
    for (const f of filters) {
        console.log(`Testing filter: ${f}`);
        try {
            const url = `${BASE_URL}/directorio?order=${f}`;
            const response = await axios.get(url);
            const $ = cheerio.load(response.data);
            const top = $('.anime-list .anime h3').first().text().trim();
            console.log(`  Top anime with ${f}: ${top}`);
        } catch (e) {
            console.log(`  Error with ${f}: ${e.message}`);
        }
    }
}

testFilters();
