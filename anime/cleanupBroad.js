const supabase = require('./supabaseClient');

const TARGET_DOMAIN = 'ww3.gnulahd.nu';

async function broadCleanup() {
    console.log(`Searching for any content associated with domain: ${TARGET_DOMAIN}`);

    // 1. Find anime slugs from episodes with that domain in iframe_url or source_url
    const { data: epData, error: epError } = await supabase
        .from('episodes')
        .select('anime_id')
        .or(`iframe_url.ilike.%${TARGET_DOMAIN}%,source_url.ilike.%${TARGET_DOMAIN}%`);

    if (epError) {
        console.error('Error searching episodes:', epError.message);
        return;
    }

    let animeSlugs = [];
    if (epData && epData.length > 0) {
        animeSlugs = [...new Set(epData.map(e => e.anime_id))];
    }

    // 2. Also check anime table itself for source_url containing the domain
    const { data: animeData, error: animeError } = await supabase
        .from('anime')
        .select('anime_id')
        .ilike('source_url', `%${TARGET_DOMAIN}%`);

    if (animeError) {
        console.error('Error searching anime table:', animeError.message);
    } else if (animeData && animeData.length > 0) {
        const moreSlugs = animeData.map(a => a.anime_id);
        animeSlugs = [...new Set([...animeSlugs, ...moreSlugs])];
    }

    if (animeSlugs.length === 0) {
        console.log(`No records found associated with ${TARGET_DOMAIN}.`);
        return;
    }

    console.log(`Found ${animeSlugs.length} animes to delete:`, animeSlugs);

    // 3. Delete everything associated with these slugs
    console.log('Deleting episodes...');
    const { error: epDelError } = await supabase
        .from('episodes')
        .delete()
        .in('anime_id', animeSlugs);

    if (epDelError) {
        console.error('Error deleting episodes:', epDelError.message);
    }

    console.log('Deleting animes...');
    const { error: delError } = await supabase
        .from('anime')
        .delete()
        .in('anime_id', animeSlugs);

    if (delError) {
        console.error('Error deleting animes:', delError.message);
    } else {
        console.log(`Successfully deleted ${animeSlugs.length} animes and their episodes.`);
    }
}

broadCleanup();
