const path = require('path');
const cheerio = require('cheerio');
const { getHTML } = require('./browserHelper');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const BASE_URL = process.env.BASE_URL || 'https://www.animelatinohd.com';
const HEADERS = {
    'authority': 'tioanime.com',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
    'cache-control': 'max-age=0',
    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

async function scrapeDirectory(page = 1) {
    console.log(`Scraping directory page ${page}...`);
    try {
        const html = await getHTML(`${BASE_URL}/directorio?p=${page}`);
        if (!html) return { animes: [], hasNextPage: false };
        
        if (html.length < 10000) {
            const fs = require('fs');
            fs.writeFileSync('debug_short_response.html', html);
            console.log(`  Warning: Received very short HTML (${html.length} bytes). Saved to debug_short_response.html`);
        }

        const $ = cheerio.load(html);
        console.log(`  HTML length: ${html.length}. Searching for animes...`);
        const animes = [];

        $('.animes li').each((i, element) => {
            const anime = {
                title: $(element).find('.title').text().trim(),
                url: $(element).find('a').first().attr('href'),
                poster: $(element).find('img').attr('src'),
            };
            if (anime.title && anime.url) animes.push(anime);
        });
        
        console.log(`  Found ${animes.length} animes in this page.`);

        const hasNextPage = $('.pagination .next-episode').length > 0 || $('.pagination li:last-child').not('.disabled').length > 0;

        return { animes, hasNextPage };
    } catch (error) {
        console.error(`Error scraping directory page ${page}:`, error.message);
        return { animes: [], hasNextPage: false };
    }
}

async function scrapeAnimeInfo(animeUrl) {
    console.log(`Scraping anime info: ${animeUrl}...`);
    try {
        const html = await getHTML(`${BASE_URL}${animeUrl}`);
        if (!html) return null;
        
        const $ = cheerio.load(html);
        const scoreMatch = html.match(/id="score"\s*>\s*([\d.]+)\s*</);
        const votesMatch = html.match(/id="scored_by"\s*>\s*([\d,]+)\s*</);

        const anime = {
            title: $('.anime-single .title').first().text().trim(),
            status: $('.anime-single .status').text().trim(),
            type: $('.anime-single .meta .anime-type-peli').text().trim(),
            year: $('.anime-single .meta .year').text().trim(),
            season: $('.anime-single .meta > .season').first().text().trim().replace(/\s+/g, ' '),
            genres: [],
            synopsis: $('.anime-single .sinopsis').text().trim(),
            rating: scoreMatch ? scoreMatch[1] : ($('#score').text().trim() || 'N/A'),
            votes: votesMatch ? votesMatch[1] : ($('#scored_by').text().trim() || 'N/A'),
            poster: process.env.BASE_URL + $('.anime-single aside img').attr('src'),
            backdrop: process.env.BASE_URL + $('.anime-single .backdrop img').attr('src'),
            url: animeUrl,
            episodes: []
        };

        $('.anime-single .genres a').each((i, element) => {
            anime.genres.push($(element).text().trim());
        });

        // Extract episodes from script tags (TioAnime style)
        const scripts = $('script').get();
        let episodesData = [];
        let episodesDetails = [];
        const slug = animeUrl.split('/').pop();

        for (const s of scripts) {
            const content = $(s).html();
            if (content.includes('var episodes =')) {
                const epMatch = content.match(/var episodes = (\[.*?\]);/);
                const detailMatch = content.match(/var episodes_details = (\[.*?\]);/);
                if (epMatch) {
                    try {
                        episodesData = JSON.parse(epMatch[1]);
                    } catch (e) { }
                }
                if (detailMatch) {
                    try {
                        episodesDetails = JSON.parse(detailMatch[1]);
                    } catch (e) { }
                }
            }
        }

        if (episodesData.length > 0) {
            anime.episodes = episodesData.map((epNum, index) => ({
                title: `${anime.title} Episodio ${epNum}`,
                url: `${process.env.BASE_URL}/ver/${slug}-${epNum}`,
                thumb: `${process.env.BASE_URL}/uploads/thumbs/${slug}.jpg`,
                time: episodesDetails[index] || ''
            }));
        } else {
            // Fallback for static list if any
            $('.episodes-list li').each((i, element) => {
                const ep = {
                    title: $(element).find('p').text().trim(),
                    url: $(element).find('a').attr('href'),
                    thumb: $(element).find('img').attr('src'),
                    time: $(element).find('div > span').text().trim()
                };
                anime.episodes.push(ep);
            });
        }

        return anime;
    } catch (error) {
        console.error(`Error scraping anime info ${animeUrl}:`, error.message);
        return null;
    }
}

async function scrapeEpisodeVideo(episodeUrl) {
    // If episodeUrl is already absolute, don't prepend BASE_URL
    const fullUrl = episodeUrl.startsWith('http') ? episodeUrl : `${BASE_URL}${episodeUrl}`;
    console.log(`Scraping episode video: ${fullUrl}...`);
    try {
        const html = await getHTML(fullUrl);
        if (!html) return null;
        
        const $ = cheerio.load(html);

        // Extract from var videos = [...]
        const scripts = $('script').get();
        let videoServers = [];

        for (const s of scripts) {
            const content = $(s).html();
            if (content.includes('var videos =')) {
                const match = content.match(/var videos = (\[.*?\]);/);
                if (match) {
                    try {
                        // The format is [["Name", "URL", 0, 0], ...]
                        videoServers = JSON.parse(match[1]);
                    } catch (e) {
                        console.error('Error parsing videos JSON:', e.message);
                    }
                }
            }
        }

        if (videoServers.length > 0) {
            // Sort to prioritize Mega or Voe
            videoServers.sort((a, b) => {
                const nameA = a[0].toLowerCase();
                const nameB = b[0].toLowerCase();
                if (nameA.includes('mega')) return -1;
                if (nameB.includes('mega')) return 1;
                if (nameA.includes('voe')) return -1;
                if (nameB.includes('voe')) return 1;
                return 0;
            });
            return videoServers.map(v => ({ name: v[0], url: v[1] }));
        }

        // Fallback to static iframe
        const iframeSrc = $('#video-container iframe').attr('src');
        return iframeSrc ? [{ name: 'Default', url: iframeSrc }] : null;
    } catch (error) {
        console.error(`Error scraping episode video ${episodeUrl}:`, error.message);
        return null;
    }
}

async function scrapeLatestAnimes() {
    console.log('Scraping latest animes from home page for prioritization...');
    try {
        const html = await getHTML(BASE_URL);
        if (!html) return [];
        
        const $ = cheerio.load(html);
        const animes = [];

        console.log('  Parsing home page sections...');
        // TioAnime has sections titled "Últimos Animes"
        $('section, .sidebar section, .row').each((i, section) => {
            const h = $(section).find('h2, h3, h4').text().toLowerCase();
            if (h.includes('últimos') || h.includes('estrenos') || h.includes('populares') || h.includes('recientes')) {
                $(section).find('a').each((j, a) => {
                    const href = $(a).attr('href');
                    const title = $(a).find('h3, h4, .title').text().trim() || $(a).attr('title');
                    if (href && href.startsWith('/anime/') && !href.includes('/ver/')) {
                        animes.push({
                            title: title,
                            url: href,
                            isPriority: true
                        });
                    }
                });
            }
        });

        // Fallback or additional check for general popular list if needed
        return animes;
    } catch (error) {
        console.error('Error scraping latest animes:', error.message);
        return [];
    }
}

module.exports = {
    scrapeDirectory,
    scrapeAnimeInfo,
    scrapeEpisodeVideo,
    scrapeLatestAnimes
};
