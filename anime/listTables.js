const supabase = require('./supabaseClient');

async function listAllTables() {
    console.log('Listing all tables in public schema...');

    // Using a trick: try to query a non-existent table to get the schema error which often lists tables
    // Or better, use RPC if available, but usually we just try common names
    const commonTableNames = ['anime', 'animes', 'episode', 'episodes', 'peli', 'pelis', 'movie', 'movies', 'serie', 'series'];

    for (const table of commonTableNames) {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .limit(1);

        if (error) {
            console.log(`Table ${table}: NOT FOUND (${error.message})`);
        } else {
            console.log(`Table ${table}: FOUND!`);
        }
    }
}

listAllTables();
