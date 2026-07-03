const supabase = require('./supabaseClient');

async function getAnimeInfoFromDB(slug) {
    const { data, error } = await supabase
        .from('anime')
        .select('id, status')
        .eq('anime_id', slug)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error(`Error checking DB for ${slug}:`, error.message);
    }
    return data;
}

async function getLatestEpisodeNum(slug) {
    const { data, error } = await supabase
        .from('episodes')
        .select('episode_num')
        .eq('anime_id', slug)
        .order('episode_num', { ascending: false })
        .limit(1)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error(`Error checking latest episode for ${slug}:`, error.message);
    }
    return data ? data.episode_num : 0;
}

async function getEpisodeIframe(slug, epNum) {
    const { data, error } = await supabase
        .from('episodes')
        .select('iframe_url')
        .eq('anime_id', slug)
        .eq('episode_num', epNum)
        .single();

    return data ? data.iframe_url : null;
}

async function episodeExists(slug, epNum) {
    const iframe = await getEpisodeIframe(slug, epNum);
    return !!iframe;
}

async function getBrokenAnimes() {
    console.log('Searching for animes with invalid iframe URLs in the database...');
    const { data, error } = await supabase
        .from('episodes')
        .select('anime_id')
        .ilike('iframe_url', '%tioanime.com/ver/%');

    if (error) {
        console.error('Error finding broken animes:', error.message);
        return [];
    }

    // Get unique anime_ids
    const uniqueAnimes = [...new Set(data.map(item => item.anime_id))];
    return uniqueAnimes;
}

async function getBrokenEpisodes() {
    console.log('Fetching specific broken episodes...');
    const { data, error } = await supabase
        .from('episodes')
        .select('anime_id, episode_num, source_url')
        .ilike('iframe_url', '%tioanime.com/ver/%');

    if (error) {
        console.error('Error fetching broken episodes:', error.message);
        return [];
    }
    return data;
}

async function updateEpisodeIframe(slug, epNum, iframeUrl) {
    const { error } = await supabase
        .from('episodes')
        .update({ iframe_url: iframeUrl })
        .match({ anime_id: slug, episode_num: epNum });

    if (error) console.error(`Error updating iframe for ${slug} ep ${epNum}:`, error.message);
}

async function uploadAnime(animeData) {
    const slug = animeData.url.split('/').pop();

    console.log(`Syncing anime: ${animeData.title} (${slug})...`);

    // 1. Check if anime exists
    const existingAnime = await getAnimeInfoFromDB(slug);
    let internalId;

    const animeObj = {
        title: animeData.title,
        anime_id: slug,
        status: animeData.status,
        rating: animeData.rating !== 'N/A' ? animeData.rating : null,
        description: animeData.synopsis,
        poster_url: animeData.poster,
        image_url: animeData.backdrop,
        year: animeData.year ? parseInt(animeData.year) : null,
        genres: animeData.genres,
        source: 'TioAnime',
        source_url: process.env.BASE_URL + animeData.url
    };

    if (existingAnime) {
        internalId = existingAnime.id;
        console.log(`Updating existing anime (ID: ${internalId})...`);
        const { error } = await supabase.from('anime').update(animeObj).eq('id', internalId);
        if (error) console.error('Error updating anime:', error.message);
    } else {
        console.log(`Inserting new anime...`);
        const { data: newAnime, error: insertError } = await supabase
            .from('anime')
            .insert(animeObj)
            .select()
            .single();

        if (insertError) {
            console.error('Error inserting anime:', insertError.message);
            return;
        }
        internalId = newAnime.id;
    }

    // 2. Insert episodes
    if (animeData.episodes && animeData.episodes.length > 0) {
        const newEpisodes = animeData.episodes;
        console.log(`Syncing ${newEpisodes.length} episodes for ${animeData.title}...`);

        for (const ep of newEpisodes) {
            const epNumMatch = ep.title.match(/Episodio (\d+)/);
            const epNum = epNumMatch ? parseInt(epNumMatch[1]) : 0;

            // Only insert if it doesn't have video URL yet (meaning it's a new or partial sync)
            // Or use upsert with onConflict. But we want to avoid re-scraping if we already have it.
            // This logic is mostly handled in index.js to avoid the call to scrapeEpisodeVideo

            const upsertData = {
                anime_id: slug,
                episode_num: epNum,
                title: ep.title,
                source_url: ep.url,
                thumbnail_url: ep.thumb
            };

            if (Array.isArray(ep.video) && ep.video.length > 0) {
                // Store all servers as a JSON string to support multiple options
                upsertData.iframe_url = JSON.stringify(ep.video);
            }

            const { error: epError } = await supabase
                .from('episodes')
                .upsert(upsertData, { onConflict: 'anime_id, episode_num' });

            if (epError) {
                console.error(`Error syncing episode ${epNum}:`, epError.message);
            }
        }
    }
}

module.exports = {
    uploadAnime,
    getAnimeInfoFromDB,
    episodeExists,
    getEpisodeIframe,
    getBrokenAnimes,
    getBrokenEpisodes,
    updateEpisodeIframe,
    getLatestEpisodeNum
};
