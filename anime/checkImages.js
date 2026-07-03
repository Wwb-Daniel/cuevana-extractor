const supabase = require('./supabaseClient');

async function checkImageFormat() {
    console.log('Checking image and thumbnail URL formats for existing records...');

    // Check animes from other sources if possible
    const { data: animeData } = await supabase
        .from('anime')
        .select('title, poster_url, image_url')
        .limit(5);

    console.log('Sample Anime Images:');
    console.table(animeData);

    const { data: epData } = await supabase
        .from('episodes')
        .select('title, thumbnail_url')
        .limit(5);

    console.log('Sample Episode Thumbnails:');
    console.table(epData);
}

checkImageFormat();
