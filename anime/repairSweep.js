const { scrapeEpisodeVideo } = require('./scraper');
const { getBrokenEpisodes, updateEpisodeIframe } = require('./dbSync');

async function runSurgicalRepair() {
    console.log(`[${new Date().toLocaleString()}] Starting SURGICAL REPAIR SWEEP...`);

    try {
        const brokenEpisodes = await getBrokenEpisodes();
        console.log(`Found ${brokenEpisodes.length} specific episodes with broken links.`);

        if (brokenEpisodes.length === 0) {
            console.log("No broken episodes found! Database is clean.");
            process.exit(0);
        }

        let count = 0;
        for (const ep of brokenEpisodes) {
            count++;
            console.log(`[${count}/${brokenEpisodes.length}] Repairing: ${ep.anime_id} - Episode ${ep.episode_num}`);

            try {
                // Determine URL (db usually has relative /ver/...)
                // scrapeEpisodeVideo handles relative paths by prepending BASE_URL
                const videoSource = await scrapeEpisodeVideo(ep.source_url);

                if (videoSource && videoSource.length > 0) {
                    const newIframe = videoSource[0].url;
                    // Double check it's not the bad one again (shouldn't be if scraper works)
                    if (!newIframe.includes('tioanime.com/ver/')) {
                        await updateEpisodeIframe(ep.anime_id, ep.episode_num, newIframe);
                        console.log(`   -> FIXED! New URL: ${newIframe}`);
                    } else {
                        console.log(`   -> WARNING: Scraper returned bad URL again: ${newIframe}`);
                    }
                } else {
                    console.log(`   -> FAILED: Could not scrape video source.`);
                }

                // Delay to be nice to the server
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (err) {
                console.error(`   -> ERROR: ${err.message}`);
            }
        }

        console.log(`\n[${new Date().toLocaleString()}] Surgical repair complete.`);
        process.exit(0);
    } catch (err) {
        console.error('Fatal error in surgical repair:', err);
        process.exit(1);
    }
}

runSurgicalRepair();
