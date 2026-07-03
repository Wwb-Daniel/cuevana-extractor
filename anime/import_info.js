const fs = require('fs');
const supabase = require('./supabaseClient'); // already exists in this folder

async function main() {
    const text = fs.readFileSync('c:/Users/Lider_SK/Downloads/Cartelera-main/info.txt', 'utf8');

    // Parse iframes
    const iframeMap = {};
    const lines = text.split('\n');
    for (const line of lines) {
        const m = line.match(/CAP\s+(\d+)\s+TEM\s+2\s*=\s*(https?:\/\/\S+)/);
        if (m) {
            iframeMap[parseInt(m[1])] = m[2];
        }
    }

    // Parse episodes from HTML
    const episodes = [];
    // We can use a regex to match episode blocks
    // <div class="titleCardList--container episode-item" tabindex="0" aria-label="Los caídos" ...
    // <div class="titleCard-title_index">1</div>
    // <img src="https://occ-0-8047..." alt="...">
    // <span class="duration ellipsized">39 min</span>
    // data-tracking-uuid="...">Synopsis</div></p> // actually <div class="ptrack-content" ...>Synopsis</div></p>
    
    const epRegex = /<div class="titleCardList--container episode-item[^>]*aria-label="([^"]+)"[^>]*>.*?<div class="titleCard-title_index">(\d+)<\/div>.*?<img src="([^"]+)".*?<span class="duration ellipsized">([^<]+)<\/span>.*?<div class="ptrack-content"[^>]*>([^<]+)<\/div>/g;
    
    let match;
    while ((match = epRegex.exec(text)) !== null) {
        const title = match[1];
        const num = parseInt(match[2]);
        const img = match[3];
        const duration = match[4];
        const synopsis = match[5];

        episodes.push({
            number: num,
            title: title,
            image: img,
            duration: duration,
            description: synopsis,
            iframe: iframeMap[num] || null
        });
    }

    console.log(`Parsed ${episodes.length} episodes`);
    console.log(episodes);

    const seriesTitle = "Devil May Cry"; // Based on actors and plot

    // Let's insert into the DB
    // First, series
    let { data: seriesData, error: seriesError } = await supabase
        .from('series')
        .select('id')
        .eq('title', seriesTitle)
        .single();

    let seriesId;
    if (!seriesData) {
        console.log("Inserting new series...");
        const { data: newSeries, error: insertSeriesError } = await supabase
            .from('series')
            .insert({
                title: seriesTitle,
                description: "Dante, un cazador de demonios a sueldo, lucha contra fuerzas oscuras en una serie animada basada en la popular saga de videojuegos.",
                year: "2026", // Based on info.txt
                duration: "2 temporadas",
                image: episodes.length > 0 ? episodes[0].image : "",
                genres: ["Series de terror", "Series fantásticas"],
                actors: ["Johnny Yong Bosch", "Scout Taylor Compton", "Kevin Conroy"]
            })
            .select()
            .single();
        
        if (insertSeriesError) {
            console.error("Error inserting series:", insertSeriesError);
            return;
        }
        seriesId = newSeries.id;
    } else {
        seriesId = seriesData.id;
        console.log(`Found existing series with ID: ${seriesId}`);
    }

    // Insert season
    let { data: seasonData, error: seasonError } = await supabase
        .from('seasons')
        .select('id')
        .eq('series_id', seriesId)
        .eq('season_number', 2)
        .single();
    
    let seasonId;
    if (!seasonData) {
        console.log("Inserting new season...");
        const { data: newSeason, error: insertSeasonError } = await supabase
            .from('seasons')
            .insert({
                series_id: seriesId,
                season_number: 2,
                season_name: "Temporada 2"
            })
            .select()
            .single();
        
        if (insertSeasonError) {
            console.error("Error inserting season:", insertSeasonError);
            return;
        }
        seasonId = newSeason.id;
    } else {
        seasonId = seasonData.id;
        console.log(`Found existing season 2 with ID: ${seasonId}`);
    }

    // Insert episodes
    for (const ep of episodes) {
        // Multi-server format for iframe
        let iframeUrl = ep.iframe;
        if (iframeUrl) {
            iframeUrl = JSON.stringify([
                { name: "Opción 1", url: ep.iframe }
            ]);
        }

        const epData = {
            series_id: seriesId,
            season_id: seasonId,
            episode_number: ep.number.toString(),
            title: ep.title,
            description: ep.description,
            duration: ep.duration,
            img_url: ep.image,
            iframe_url: iframeUrl
        };

        // check if episode exists
        const { data: existingEp } = await supabase
            .from('series_episodes')
            .select('id')
            .eq('series_id', seriesId)
            .eq('season_id', seasonId)
            .eq('episode_number', ep.number.toString())
            .single();

        if (existingEp) {
            console.log(`Updating episode ${ep.number}...`);
            await supabase
                .from('series_episodes')
                .update(epData)
                .eq('id', existingEp.id);
        } else {
            console.log(`Inserting episode ${ep.number}...`);
            await supabase
                .from('series_episodes')
                .insert(epData);
        }
    }

    console.log("Finished uploading to database!");
}

main().catch(console.error);
