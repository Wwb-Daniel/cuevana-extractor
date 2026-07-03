const supabase = require('./supabaseClient');

async function deleteAllScraped() {
    console.log('Cleaning all animes uploaded by our scraper...');

    // 1. Find all animes where source is 'TioAnime'
    const { data: animeData, error: findError } = await supabase
        .from('anime')
        .select('anime_id, title')
        .eq('source', 'TioAnime');

    if (findError) {
        console.error('Error finding animes:', findError.message);
        return;
    }

    if (!animeData || animeData.length === 0) {
        console.log('No more animes with source: TioAnime found.');

        // Secondary check: look for any animes with tioanime.com in source_url
        console.log('Checking for animes with tioanime.com source_url...');
        const { data: secondaryData } = await supabase
            .from('anime')
            .select('anime_id, title')
            .ilike('source_url', '%tioanime.com%');

        if (!secondaryData || secondaryData.length === 0) {
            console.log('No records associated with TioAnime found.');
            return;
        }

        animeData.push(...secondaryData);
    }

    const animeIds = [...new Set(animeData.map(a => a.anime_id))];
    console.log(`Found ${animeIds.length} animes to delete.`);

    // 2. Delete episodes
    console.log('Deleting episodes...');
    const { error: epError } = await supabase
        .from('episodes')
        .delete()
        .in('anime_id', animeIds);

    if (epError) console.error('Error deleting episodes:', epError.message);

    // 3. Delete animes
    console.log('Deleting animes...');
    const { error: delError } = await supabase
        .from('anime')
        .delete()
        .in('anime_id', animeIds);

    if (delError) {
        console.error('Error deleting animes:', delError.message);
    } else {
        console.log(`Successfully deleted ${animeIds.length} animes from the scraper.`);
    }
}

deleteAllScraped();
