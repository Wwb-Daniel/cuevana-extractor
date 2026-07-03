const supabase = require('./supabaseClient');

async function checkSchema() {
    console.log('Checking database schema...');

    // Try to list tables (though Supabase JS doesn't have a direct listTables, 
    // we usually know the tables or try to select from them)
    const tables = ['animes', 'episodes', 'genres', 'anime_genres'];

    for (const table of tables) {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .limit(1);

        if (error) {
            console.error(`Error reading table ${table}:`, error.message);
        } else {
            console.log(`Table ${table} exists. Columns:`, Object.keys(data[0] || {}).join(', '));
        }
    }
}

checkSchema();
