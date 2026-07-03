const supabase = require('./supabaseClient');

async function getColumnNames() {
    console.log('Querying anime table...');
    const { data: animeData, error: animeError } = await supabase.from('anime').select('*').limit(1);
    if (animeError) {
        console.error('Error fetching from anime:', animeError.message);
    } else if (animeData && animeData.length > 0) {
        console.log('Columns in anime:', Object.keys(animeData[0]));
    } else {
        console.log('Anime table is empty, trying to get schema another way...');
    }

    console.log('Querying episodes table...');
    const { data: epData, error: epError } = await supabase.from('episodes').select('*').limit(1);
    if (epError) {
        console.error('Error fetching from episodes:', epError.message);
    } else if (epData && epData.length > 0) {
        console.log('Columns in episodes:', Object.keys(epData[0]));
    } else {
        console.log('Episodes table is empty.');
    }
}

getColumnNames();
