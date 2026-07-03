const supabase = require('./supabaseClient');

const TARGET_IFRAME = 'https://ww3.gnulahd.nu/nuevo/player.php?id=aHR0cHM6Ly9maWxlbW9vbi50by9lL2g0cTZrb3BuZWp1Mg==&_t=1767836902629';

async function cleanup() {
    console.log(`Searching for episodes with iframe: ${TARGET_IFRAME}`);

    // 1. Find episodes with the target iframe
    const { data: episodes, error: epError } = await supabase
        .from('episodes')
        .select('anime_id')
        .eq('iframe_url', TARGET_IFRAME);

    if (epError) {
        console.error('Error fetching episodes:', epError.message);
        return;
    }

    if (!episodes || episodes.length === 0) {
        console.log('No episodes found with that iframe.');
        return;
    }

    // 2. Extract unique anime_id (slug)
    const animeIds = [...new Set(episodes.map(e => e.anime_id))];
    console.log(`Found ${animeIds.length} anime slugs to delete:`, animeIds);

    // 3. Delete those animes by anime_id (slug column)
    console.log('Deleting animes by anime_id...');

    // Deleting episodes first
    const { error: epDelError } = await supabase
        .from('episodes')
        .delete()
        .in('anime_id', animeIds);

    if (epDelError) {
        console.error('Error deleting episodes:', epDelError.message);
    }

    const { error: delError } = await supabase
        .from('anime')
        .delete()
        .in('anime_id', animeIds);

    if (delError) {
        console.error('Error deleting animes:', delError.message);
    } else {
        console.log(`Successfully deleted ${animeIds.length} animes.`);
    }
}

cleanup();
