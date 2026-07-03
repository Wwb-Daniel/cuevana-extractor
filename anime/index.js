const path = require('path');
const { scrapeDirectory, scrapeAnimeInfo, scrapeEpisodeVideo, scrapeLatestAnimes } = require('./scraper');
const { uploadAnime, getAnimeInfoFromDB, getEpisodeIframe } = require('./dbSync');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function main() {
    console.log(`[${new Date().toLocaleString()}] Starting scrape session with Priority & Repair logic...`);
    const maxPages = 10;
    const processedSlugs = new Set();

    try {
        // 1. Get Priority Animes (from home page)
        const priorityAnimes = await scrapeLatestAnimes();
        console.log(`Found ${priorityAnimes.length} priority animes from home page.`);

        // 2. Get Directory Animes
        const directoryAnimes = [];
        for (let p = 1; p <= maxPages; p++) {
            const { animes, hasNextPage } = await scrapeDirectory(p);
            directoryAnimes.push(...animes);
            if (!hasNextPage) break;
        }
        console.log(`Found ${directoryAnimes.length} animes in directory.`);

        // 3. Merge Lists and REVERSE (to process newest last)
        const queue = [...priorityAnimes, ...directoryAnimes].reverse();

        for (const item of queue) {
            const slug = item.url.split('/').pop();
            if (processedSlugs.has(slug)) continue;
            processedSlugs.add(slug);

            const dbInfo = await getAnimeInfoFromDB(slug);
            if (dbInfo && dbInfo.status === 'Finalizado') {
                continue;
            }

            console.log(`Processing anime: ${item.title}${item.isPriority ? ' [PRIORITY]' : ''}...`);
            try {
                const animeInfo = await scrapeAnimeInfo(item.url);

                if (animeInfo) {
                    for (const ep of animeInfo.episodes) {
                        const epNumMatch = ep.title.match(/Episodio (\d+)/);
                        const epNum = epNumMatch ? parseInt(epNumMatch[1]) : 0;

                        const currentIframe = await getEpisodeIframe(slug, epNum);
                        const isInvalid = currentIframe && currentIframe.includes('tioanime.com/ver/');
                        const isNotMultiServer = currentIframe && !currentIframe.startsWith('[');

                        // Fix: Re-scrape if missing, invalid TioAnime link, OR if it's an old single-link format
                        if (!currentIframe || isInvalid || isNotMultiServer) {
                            if (isInvalid) console.log(`  Fixing invalid iframe for Ep ${epNum}...`);
                            else if (isNotMultiServer) console.log(`  Upgrading Ep ${epNum} to multi-server...`);
                            else console.log(`  New episode found: Ep ${epNum}. Scraping video...`);

                            ep.video = await scrapeEpisodeVideo(ep.url);
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }

                    await uploadAnime(animeInfo);
                }
            } catch (err) {
                console.error(`Error processing anime ${item.title}:`, err.message);
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log(`[${new Date().toLocaleString()}] Scrape session complete.`);
        process.exit(0);
    } catch (err) {
        console.error('Fatal error in main loop:', err);
        process.exit(1);
    }
}

main();
