const axios = require('axios');
const cheerio = require('cheerio');
const BASE_URL = 'https://tioanime.com';

async function debugHome() {
    try {
        const response = await axios.get(BASE_URL);
        const $ = cheerio.load(response.data);

        console.log('--- Checking "Últimos Animes" section ---');
        // Based on local research, latest animes are often in a section with h3 "Últimos Animes"
        let found = false;
        $('section').each((i, section) => {
            const h = $(section).find('h2, h3').text().toLowerCase();
            if (h.includes('últimos animes')) {
                found = true;
                console.log('Found section:', h);
                $(section).find('a').each((j, a) => {
                    const href = $(a).attr('href');
                    if (href && href.startsWith('/anime/')) {
                        console.log(`  - Anime: ${$(a).find('h3').text().trim()} | URL: ${href}`);
                    }
                });
            }
        });

        if (!found) {
            console.log('Section "Últimos Animes" not found by heading. Trying generic list...');
            $('.anime-list li').each((i, li) => {
                console.log(`  - Li item: ${$(li).find('h3').text().trim()} | URL: ${$(li).find('a').attr('href')}`);
            });
        }

    } catch (e) {
        console.error('Error:', e.message);
    }
}

debugHome();
