const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const BASE_URL = process.env.BASE_URL || 'https://tioanime.com';

async function researchPriority() {
    console.log('Analyzing home page for prioritization indicators...');
    try {
        const response = await axios.get(BASE_URL);
        const $ = cheerio.load(response.data);

        console.log('\n--- Checking for "Estrenos de temporada" or similar ---');
        // Look for sections with titles like "Estrenos", "Popular", "Temporada"
        $('h3, h2').each((i, el) => {
            const text = $(el).text().trim();
            console.log(`Heading found: "${text}"`);
        });

        // TioAnime usually has "Favoritos" or "Mas vistos" in sidebar
        console.log('\n--- Checking sidebar for popularity lists ---');
        $('.sidebar section').each((i, el) => {
            const title = $(el).find('h3').text().trim();
            console.log(`Sidebar section: "${title}"`);
            $(el).find('a').each((j, a) => {
                // console.log(`  - ${$(a).text().trim()} (${$(a).attr('href')})`);
            });
        });

    } catch (error) {
        console.error('Error researching priority:', error.message);
    }
}

researchPriority();
