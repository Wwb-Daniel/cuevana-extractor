const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const BASE_URL = process.env.BASE_URL || 'https://tioanime.com';

async function checkSeasonal() {
    console.log('Checking seasonal directory...');
    const url = `${BASE_URL}/directorio?year=2026&season=invierno`;
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const animes = [];
        $('.anime-list .anime').each((i, el) => {
            animes.push($(el).find('h3').text().trim());
        });
        console.log(`Found ${animes.length} seasonal animes.`);
        console.log('Titles:', animes.slice(0, 5).join(', '));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkSeasonal();
