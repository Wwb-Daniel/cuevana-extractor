const supabase = require('./supabaseClient');

async function checkTioImages() {
    console.log('Checking TioAnime records specifically...');

    const { data: animeData } = await supabase
        .from('anime')
        .select('title, poster_url, image_url, source_url')
        .ilike('source_url', '%tioanime.com%')
        .limit(5);

    console.log('Sample TioAnime Images:');
    console.table(animeData);

    if (animeData.length > 0) {
        // Get slug from the first one
        const slug = animeData[0].source_url.split('/').pop();
        const { data: epData } = await supabase
            .from('episodes')
            .select('title, thumbnail_url, iframe_url')
            .eq('anime_id', slug)
            .limit(5);

        console.log(`Sample Episodes for ${slug}:`);
        console.table(epData);
    }
}

checkTioImages();
