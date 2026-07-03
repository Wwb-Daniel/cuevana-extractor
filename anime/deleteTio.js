const supabase = require('./supabaseClient');

const TARGET_DOMAIN = 'tioanime.com';

async function deleteTioAnime() {
    console.log(`Searching for any content associated with: ${TARGET_DOMAIN}`);

    // 1. Find anime slugs/anime_ids associated with TioAnime
    const { data: animeData, error: animeError } = await supabase
        .from('anime')
        .select('anime_id')
        .ilike('source_url', `%${TARGET_DOMAIN}%`);

    if (animeError) {
        console.error('Error searching anime table:', animeError.message);
        return;
    }

    if (!animeData || animeData.length === 0) {
        console.log(`No records found associated with ${TARGET_DOMAIN}.`);
        return;
    }

    const animeIds = animeData.map(a => a.anime_id);
    console.log(`Found ${animeIds.length} animes to delete.`);

    // 2. Delete everything associated with these slugs
    console.log('Deleting episodes...');
    const { error: epDelError } = await supabase
        .from('episodes')
        .delete()
        .in('anime_id', animeIds);

    if (epDelError) {
        console.error('Error deleting episodes:', epDelError.message);
    }

    console.log('Deleting animes...');
    const { error: delError } = await supabase
        .from('anime')
        .delete()
        .in('anime_id', animeIds);

    if (delError) {
        console.error('Error deleting animes:', delError.message);
    } else {
        console.log(`Successfully deleted ${animeIds.length} animes from TioAnime.`);
    }
}

deleteTioAnime();
