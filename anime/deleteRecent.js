const supabase = require('./supabaseClient');

async function deleteRecent() {
    console.log('Deleting all animes created in the last 2 hours (presumably from our scraper)...');

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    // 1. Find recent animes
    const { data: animeData } = await supabase
        .from('anime')
        .select('anime_id, title')
        .gt('created_at', twoHoursAgo);

    if (!animeData || animeData.length === 0) {
        console.log('No recent animes found.');
        return;
    }

    const animeIds = animeData.map(a => a.anime_id);
    console.log(`Found ${animeIds.length} recent animes to delete.`);

    // 2. Delete episodes
    console.log('Deleting episodes...');
    await supabase.from('episodes').delete().in('anime_id', animeIds);

    // 3. Delete animes
    console.log('Deleting animes...');
    const { error } = await supabase.from('anime').delete().in('anime_id', animeIds);

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('Recent uploads cleared.');
    }
}

deleteRecent();
