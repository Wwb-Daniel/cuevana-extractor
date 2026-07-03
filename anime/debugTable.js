const supabase = require('./supabaseClient');

async function debugTable() {
    console.log('Debugging animes table...');

    // Check if we can select by id
    const { data, error } = await supabase
        .from('animes')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error selecting from animes:', error.message);
    } else {
        console.log('Sample data from animes:', data[0]);
    }

    // Check episodes link
    const { data: epData, error: epError } = await supabase
        .from('episodes')
        .select('anime_id, iframe_url')
        .limit(1);

    if (epError) {
        console.error('Error selecting from episodes:', epError.message);
    } else {
        console.log('Sample data from episodes:', epData[0]);
    }
}

debugTable();
