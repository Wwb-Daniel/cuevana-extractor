const supabase = require('./supabaseClient');

async function listAnimes() {
    console.log('Listing all animes in the table...');
    const { data, error } = await supabase
        .from('anime')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        console.error('Error:', error.message);
        return;
    }

    const formatted = data.map(a => ({
        id: a.id,
        anime_id: a.anime_id,
        title: a.title,
        source: a.source,
        source_url: a.source_url,
        created_at: a.created_at
    }));

    console.table(formatted);
}

listAnimes();
