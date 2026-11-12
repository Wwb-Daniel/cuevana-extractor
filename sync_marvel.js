const https = require('https');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { uploadToR2 } = require('./upload_to_r2');
const { MARVEL_CATALOG } = require('./marvel_catalog');

let puppeteer = null;
function getPuppeteer() {
    if (!puppeteer) {
        puppeteer = require('puppeteer-core');
    }
    return puppeteer;
}

// ============================================================
// SYNC MARVEL UNIVERSE — sync_marvel.js
// Sincroniza, descarga, optimiza (Faststart) y sube a R2 / Supabase
// todas las películas, sagas y series del Universo Marvel.
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_PREMIUM_URL || 'https://pdvdnjmqgcprwntabvia.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PREMIUM_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkdmRuam1xZ2NwcndudGFidmlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NTgwNjIsImV4cCI6MjA5ODEzNDA2Mn0.8qcpYfWH9bwDrEQSKzbYvKOqlYpBQmqNWgykTQBXO60';
const R2_PUBLIC_URL = 'https://pub-77522f1e717f46bead2250b84f1ca547.r2.dev';

function getChromePath() {
    if (os.platform() === 'win32') {
        const paths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
        ];
        for (const p of paths) { if (fs.existsSync(p)) return p; }
    } else if (os.platform() === 'linux') {
        const paths = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
        for (const p of paths) { if (fs.existsSync(p)) return p; }
    }
    return null;
}

function fetchHtml(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function makeSupabaseRequest(endpoint, method, data = null) {
    return new Promise((resolve) => {
        const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
        const options = {
            method,
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                ...(method === 'POST' ? { 'Prefer': 'resolution=merge-duplicates' } : {})
            }
        };
        const req = https.request(url, options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: body ? JSON.parse(body) : [] }); }
                catch (e) { resolve({ status: res.statusCode, data: [] }); }
            });
        });
        req.on('error', (e) => resolve({ status: 500, error: e.message }));
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

async function isR2FileHealthyAvc1(url) {
    return new Promise((resolve) => {
        if (!url || !url.startsWith('https://')) return resolve(false);
        https.get(url, { headers: { Range: 'bytes=0-32767' } }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const str = Buffer.concat(chunks).toString('latin1');
                resolve(str.includes('avc1') && !str.includes('mp4v'));
            });
        }).on('error', () => resolve(false));
    });
}

async function scrapeMetadata(itemUrl, chromePath) {
    console.log(`[Metadata] Extrayendo metadatos oficiales de: ${itemUrl}`);
    const browser = await getPuppeteer().launch({
        executablePath: chromePath || undefined,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto(itemUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 2000));

        const data = await page.evaluate(() => {
            const titleEl = document.querySelector('h1');
            let title = titleEl ? titleEl.innerText.replace(/\s+\d{1,2}\.\d\s*$/, '').trim() : '';

            let description = '';
            const resumenEl = document.querySelector('.resumen, [class*="resumen"], .sinopsis, [class*="sinopsis"]');
            if (resumenEl && resumenEl.innerText.trim().length > 30) description = resumenEl.innerText.trim();
            if (!description) {
                const og = document.querySelector('meta[property="og:description"]');
                if (og && og.content) description = og.content.trim();
            }

            const imgs = Array.from(document.querySelectorAll('img'));
            const posterImg = imgs.find(img => img.src && (img.src.includes('tmdb.org') || img.src.includes('poster')));
            const backdropImg = imgs.find(img => img.src && img.src.includes('w1280'));

            let poster = posterImg ? posterImg.src : '';
            let backdrop = backdropImg ? backdropImg.src : '';

            if (poster && poster.includes('/w200/')) {
                poster = poster.replace('/w200/', '/w500/');
            }

            const genres = [];
            document.querySelectorAll('a').forEach(el => {
                if (el.href && el.href.includes('genero=')) genres.push(el.innerText.trim());
            });

            let duration = '2h 10m';
            const allText = document.body.innerText;
            const durMatch = allText.match(/\b(\d+h\s*\d*m)\b/i) || allText.match(/\b(\d+)\s*min\b/i);
            if (durMatch) duration = durMatch[1];

            return { title, description, poster, backdrop, genres, duration };
        });

        return data;
    } finally {
        await browser.close();
    }
}

async function extractStream(cuevanaUrl, chromePath) {
    console.log(`[Stream] Extrayendo flujo de video en vivo de: ${cuevanaUrl}`);
    const html = await fetchHtml(cuevanaUrl);

    const regexServer = /data-server="([^"]+)"/g;
    let matchServer;
    const playerUrls = [];
    while ((matchServer = regexServer.exec(html)) !== null) {
        const val = matchServer[1];
        if (val.includes('tungtungsahur') || val.includes('token=')) {
            let dec = val;
            if (!dec.startsWith('http')) {
                dec = 'https://tungtungsahur.cuevana3w.pro/?token=' + val;
            }
            if (!playerUrls.includes(dec)) playerUrls.push(dec);
        }
    }

    if (playerUrls.length === 0) {
        throw new Error('No se encontraron reproductores compatibles en la página.');
    }

    const browser = await getPuppeteer().launch({
        executablePath: chromePath || undefined,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        let targetMasterUrl = null;
        let refererUsed = null;

        page.on('response', (res) => {
            const u = res.url();
            if (u.includes('master.m3u8')) {
                console.log(`✨ Master M3U8 capturado: ${u.substring(0, 90)}...`);
                targetMasterUrl = u;
            }
        });

        const primaryPlayer = playerUrls[0];
        console.log(`Cargando wrapper de reproductor: ${primaryPlayer}`);
        await page.goto(primaryPlayer, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 2000));

        let iframeUrl = null;
        for (const frame of page.frames()) {
            if (frame.url().includes('morencius.com') || frame.url().includes('/v/')) {
                iframeUrl = frame.url();
                break;
            }
        }

        if (!iframeUrl) iframeUrl = primaryPlayer;

        console.log(`Iniciando reproducción en embed: ${iframeUrl}`);
        refererUsed = iframeUrl;
        await page.goto(iframeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 2000));

        await page.evaluate(() => {
            if (window.jwplayer && window.jwplayer()) {
                window.jwplayer().play();
            }
        });

        for (let i = 0; i < 15 && !targetMasterUrl; i++) {
            await new Promise(r => setTimeout(r, 1000));
        }

        if (!targetMasterUrl) {
            throw new Error('No se capturó master.m3u8 en el tiempo límite.');
        }

        return { masterUrl: targetMasterUrl, referer: refererUsed };
    } finally {
        await browser.close();
    }
}

function downloadStream(streamUrl, referer, outputPath) {
    return new Promise((resolve) => {
        console.log(`\n📥 Descargando a archivo temporal: ${outputPath}...`);
        const args = [
            '--no-update',
            '--concurrent-fragments', '5',
            '--referer', referer,
            '-o', outputPath,
            streamUrl
        ];
        const child = spawn('yt-dlp', args, { stdio: 'inherit' });
        child.on('close', (code) => {
            resolve(code === 0 && fs.existsSync(outputPath));
        });
        child.on('error', (err) => {
            console.error('Error lanzando yt-dlp:', err.message);
            resolve(false);
        });
    });
}

function remuxFaststart(inputTs, outputMp4) {
    try {
        let isFakePng = false;
        try {
            const fd = fs.openSync(inputTs, 'r');
            const header = Buffer.alloc(4);
            fs.readSync(fd, header, 0, 4, 0);
            fs.closeSync(fd);
            isFakePng = (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47);
        } catch (_) {}
        console.log(`⚡ Remuxeando TS -> MP4 con faststart (fakePNG=${isFakePng})...`);
        const cmd = isFakePng
            ? `ffmpeg -y -f mpegts -i "${inputTs}" -c copy -movflags +faststart "${outputMp4}"`
            : `ffmpeg -y -i "${inputTs}" -c copy -movflags +faststart "${outputMp4}"`;
        execSync(cmd, { stdio: 'inherit' });
        return fs.existsSync(outputMp4);
    } catch (e) {
        console.warn('Advertencia en remux faststart:', e.message);
        return false;
    }
}

// ------------------------------------------------------------
// PROCESAMIENTO DE PELÍCULA
// ------------------------------------------------------------
async function processMovie(item, chromePath) {
    console.log('\n======================================================');
    console.log(`🎬 PROCESANDO PELÍCULA MARVEL: ${item.canonicalTitle} (${item.year})`);
    console.log('======================================================');

    // 1. Verificar si ya existe en Supabase y R2 con códec avc1
    const check = await makeSupabaseRequest(`premium_movies?id=eq.${item.slug}`, 'GET');
    if (check.data && check.data.length > 0) {
        const existingUrl = check.data[0].url;
        const healthy = await isR2FileHealthyAvc1(existingUrl);
        if (healthy) {
            console.log(`⏭️  '${item.canonicalTitle}' ya existe en CinemaDB con códec avc1 válido. Saltando.`);
            return { success: true, skipped: true };
        }
        console.log(`🔄 '${item.canonicalTitle}' existe pero requiere re-muxeo H.264 (avc1). Re-procesando...`);
    }

    // 2. Extraer metadatos
    const meta = await scrapeMetadata(item.cuevanaUrl, chromePath);
    const finalTitle = item.canonicalTitle;
    const finalPoster = meta.poster || 'https://image.tmdb.org/t/p/w500/ugX4WZJO3jEvTOerctAWJLinujo.jpg';
    const finalBackdrop = meta.backdrop || finalPoster;
    const finalDesc = meta.description || `${finalTitle} - Universo Cinematográfico de Marvel.`;
    const finalDuration = meta.duration || '2h 15m';
    const finalGenres = (meta.genres && meta.genres.length > 0) ? meta.genres : ['Acción', 'Aventura', 'Ciencia Ficción'];

    // 3. Extraer flujo en vivo
    const streamInfo = await extractStream(item.cuevanaUrl, chromePath);

    // 4. Descarga local temporal en formato .ts
    const rawFileName = `temp_${item.slug}.ts`;
    const finalFileName = `${item.slug}.mp4`;

    const downloaded = await downloadStream(streamInfo.masterUrl, streamInfo.referer, rawFileName);
    if (!downloaded) {
        throw new Error(`Falló la descarga del flujo para ${item.canonicalTitle}`);
    }

    // 5. Remux Faststart
    const remuxed = remuxFaststart(rawFileName, finalFileName);
    if (!remuxed) {
        throw new Error(`Falló el remux MPEG-TS -> MP4 para ${item.canonicalTitle}`);
    }

    // 6. Subir a Cloudflare R2
    console.log(`📤 Subiendo a Cloudflare R2...`);
    const r2Url = await uploadToR2(finalFileName, 'movie');
    console.log(`🎉 Archivo disponible en R2: ${r2Url}`);

    // Limpieza de archivos temporales
    try {
        if (fs.existsSync(rawFileName)) fs.unlinkSync(rawFileName);
        if (fs.existsSync(finalFileName)) fs.unlinkSync(finalFileName);
    } catch (_) {}

    // 7. Registrar en CinemaDB (Supabase Premium)
    const movieRecord = {
        id: item.slug,
        title: finalTitle,
        url: r2Url,
        poster: finalPoster,
        backdrop: finalBackdrop,
        year: item.year,
        duration: finalDuration,
        genres: finalGenres,
        cast: 'Marvel Studios Universe',
        description: finalDesc,
        rating: item.rating,
        quality: '4K Ultra HD',
        is_featured: item.is_featured || false,
        vistas: 0,
        created_at: new Date().toISOString()
    };

    console.log(`📝 Registrando película en la Base de Datos Premium de CinemaDB...`);
    const res = await makeSupabaseRequest('premium_movies', 'POST', movieRecord);
    if (res.status === 200 || res.status === 201 || res.status === 204) {
        console.log(`✅ ¡${finalTitle} agregada exitosamente a CinemaDB!`);
        return { success: true, movie: movieRecord };
    } else {
        throw new Error(`Error en Supabase (status ${res.status}): ${JSON.stringify(res.data)}`);
    }
}

// ------------------------------------------------------------
// PROCESAMIENTO DE SERIES Y EPISODIOS
// ------------------------------------------------------------
async function getSeriesEpisodes(seriesUrl, seriesSlug) {
    const episodes = [];
    try {
        const html = await fetchHtml(seriesUrl);
        const regexSeason = /href="([^"]*(?:temporada-\d+))"/g;
        let matchSeason;
        const seasonLinks = [];
        while ((matchSeason = regexSeason.exec(html)) !== null) {
            let sLink = matchSeason[1];
            if (!sLink.startsWith('http')) sLink = 'https://cuevana3w.pro' + sLink;
            if (!seasonLinks.includes(sLink)) seasonLinks.push(sLink);
        }

        if (seasonLinks.length === 0) {
            seasonLinks.push(`${seriesUrl}/temporada-1`);
        }

        for (const seasonLink of seasonLinks) {
            const seasonHtml = await fetchHtml(seasonLink);
            const regexEp = /href="([^"]*(?:episodio-\d+x\d+))"/g;
            let matchEp;
            while ((matchEp = regexEp.exec(seasonHtml)) !== null) {
                let eLink = matchEp[1];
                if (!eLink.startsWith('http')) eLink = 'https://cuevana3w.pro' + eLink;
                const epCode = eLink.split('episodio-')[1];
                if (epCode) {
                    const parts = epCode.split('x');
                    const season = parseInt(parts[0], 10);
                    const episode = parseInt(parts[1], 10);
                    if (!episodes.some(e => e.season === season && e.episode === episode)) {
                        episodes.push({ epUrl: eLink, seriesSlug, season, episode });
                    }
                }
            }
        }
    } catch (err) {
        console.error(`Error obteniendo episodios de ${seriesSlug}:`, err.message);
    }
    return episodes;
}

async function processSeries(item, chromePath, maxEpisodes = 999) {
    console.log('\n======================================================');
    console.log(`📺 PROCESANDO SERIE MARVEL: ${item.canonicalTitle} (${item.year})`);
    console.log('======================================================');

    // 1. Asegurar que la serie exista en premium_series
    const seriesCheck = await makeSupabaseRequest(`premium_series?id=eq.${item.slug}`, 'GET');
    if (!seriesCheck.data || seriesCheck.data.length === 0) {
        console.log(`🆕 Registrando serie '${item.canonicalTitle}' en premium_series...`);
        const meta = await scrapeMetadata(item.cuevanaUrl, chromePath);
        const seriesRecord = {
            id: item.slug,
            title: item.canonicalTitle,
            poster: meta.poster || 'https://cuevana3w.pro/cuevana3.png',
            backdrop: meta.backdrop || meta.poster || 'https://cuevana3w.pro/cuevana3.png',
            year: item.year,
            description: meta.description || `${item.canonicalTitle} - Serie original de Marvel Studios.`,
            genres: (meta.genres && meta.genres.length > 0) ? meta.genres : ['Acción', 'Aventura', 'Sci-Fi & Fantasy'],
            cast: 'Marvel Studios Television',
            rating: item.rating
        };
        await makeSupabaseRequest('premium_series', 'POST', seriesRecord);
        console.log(`✅ Serie '${item.canonicalTitle}' creada en CinemaDB.`);
    }

    // 2. Obtener lista de episodios
    const episodes = await getSeriesEpisodes(item.cuevanaUrl, item.slug);
    console.log(`📋 Total de episodios encontrados para ${item.canonicalTitle}: ${episodes.length}`);

    let processedCount = 0;
    for (const ep of episodes) {
        if (processedCount >= maxEpisodes) {
            console.log(`Límite de maxEpisodes (${maxEpisodes}) alcanzado para esta serie.`);
            break;
        }

        // Verificar si el episodio ya existe
        const epCheck = await makeSupabaseRequest(
            `premium_episodes?series_id=eq.${item.slug}&season_number=eq.${ep.season}&number=eq.${ep.episode}`,
            'GET'
        );
        if (epCheck.data && epCheck.data.length > 0) {
            console.log(`⏭️  S${ep.season}E${ep.episode} de '${item.canonicalTitle}' ya existe. Saltando.`);
            continue;
        }

        console.log(`\n⚡ Procesando: S${ep.season}E${ep.episode} de '${item.canonicalTitle}'`);
        const filename = `${item.slug}_S${ep.season}E${ep.episode}.mp4`;
        const rawFileName = `temp_${item.slug}_S${ep.season}E${ep.episode}.ts`;

        try {
            const streamInfo = await extractStream(ep.epUrl, chromePath);
            const downloaded = await downloadStream(streamInfo.masterUrl, streamInfo.referer, rawFileName);
            if (!downloaded) {
                console.error(`❌ Falló la descarga de S${ep.season}E${ep.episode}`);
                continue;
            }

            const remuxed = remuxFaststart(rawFileName, filename);
            if (!remuxed) {
                console.error(`❌ Falló el remux faststart de S${ep.season}E${ep.episode}`);
                continue;
            }

            console.log(`📤 Subiendo S${ep.season}E${ep.episode} a Cloudflare R2...`);
            const r2Url = await uploadToR2(filename, 'movie');

            try {
                if (fs.existsSync(rawFileName)) fs.unlinkSync(rawFileName);
                if (fs.existsSync(filename)) fs.unlinkSync(filename);
            } catch (_) {}

            const episodeRecord = {
                series_id: item.slug,
                season_number: ep.season,
                number: ep.episode,
                title: `Episodio ${ep.episode}`,
                url: r2Url,
                duration: '45m',
                description: `Temporada ${ep.season} - Episodio ${ep.episode}`
            };

            await makeSupabaseRequest('premium_episodes', 'POST', episodeRecord);
            console.log(`✅ ¡S${ep.season}E${ep.episode} registrado exitosamente!`);
            processedCount++;
        } catch (epErr) {
            console.error(`❌ Error procesando episodio S${ep.season}E${ep.episode}:`, epErr.message);
            try {
                if (fs.existsSync(rawFileName)) fs.unlinkSync(rawFileName);
                if (fs.existsSync(filename)) fs.unlinkSync(filename);
            } catch (_) {}
        }
    }

    return { success: true, processedEpisodes: processedCount };
}

// ------------------------------------------------------------
// LISTADO DE ESTADO DEL CATÁLOGO (PRE-AUDITORÍA)
// ------------------------------------------------------------
async function listCatalogStatus() {
    console.log('\n======================================================');
    console.log('📊 ESTADO ACTUAL DEL CATÁLOGO MARVEL EN CINEMADB');
    console.log('======================================================');

    const moviesRes = await makeSupabaseRequest('premium_movies?select=id,title,quality,url', 'GET');
    const existingMovies = new Map((moviesRes.data || []).map(m => [m.id, m]));

    const seriesRes = await makeSupabaseRequest('premium_series?select=id,title', 'GET');
    const existingSeries = new Set((seriesRes.data || []).map(s => s.id));

    let syncedCount = 0;
    let pendingCount = 0;

    for (const item of MARVEL_CATALOG) {
        if (item.type === 'movie') {
            const hasMovie = existingMovies.has(item.slug);
            const status = hasMovie ? '✅ EN CINEMADB (4K HD)' : '⏳ PENDIENTE DE DESCARGA';
            if (hasMovie) syncedCount++; else pendingCount++;
            console.log(`[PELÍCULA] [${item.saga.toUpperCase()}] ${item.canonicalTitle.padEnd(45)} -> ${status}`);
        } else {
            const hasSeries = existingSeries.has(item.slug);
            const status = hasSeries ? '✅ SERIE CREADA' : '⏳ PENDIENTE';
            if (hasSeries) syncedCount++; else pendingCount++;
            console.log(`[SERIE]    [${item.saga.toUpperCase()}] ${item.canonicalTitle.padEnd(45)} -> ${status}`);
        }
    }

    console.log('\n------------------------------------------------------');
    console.log(`Total catálogo: ${MARVEL_CATALOG.length} | Sincronizados: ${syncedCount} | Pendientes: ${pendingCount}`);
    console.log('------------------------------------------------------\n');
}

// ------------------------------------------------------------
// FUNCIÓN PRINCIPAL
// ------------------------------------------------------------
async function main() {
    console.log('======================================================');
    console.log('🚀 SINCRONIZADOR MAESTRO MARVEL — CINEMADB');
    console.log('======================================================');

    const chromePath = getChromePath();
    console.log(`Chrome detectado: ${chromePath || 'auto'}`);

    const args = process.argv.slice(2);
    const getArg = (flag, fallback) => {
        const idx = args.indexOf(flag);
        return (idx !== -1 && args[idx + 1] !== undefined) ? args[idx + 1] : fallback;
    };

    if (args.includes('--list')) {
        await listCatalogStatus();
        return;
    }

    const target = getArg('--target', 'all').toLowerCase();
    const shard = parseInt(getArg('--shard', '0'), 10);
    const totalShards = parseInt(getArg('--total-shards', '1'), 10);
    const maxItems = parseInt(getArg('--max-items', '999'), 10);
    const maxEpisodes = parseInt(getArg('--max-episodes', '999'), 10);

    // Filtrar catálogo según target
    let itemsToProcess = MARVEL_CATALOG;
    if (target === 'mcu') {
        itemsToProcess = MARVEL_CATALOG.filter(i => i.saga === 'mcu');
    } else if (target.startsWith('phase')) {
        const phaseNum = target.replace('phase', '');
        itemsToProcess = MARVEL_CATALOG.filter(i => i.phase === phaseNum);
    } else if (target === 'spiderman') {
        itemsToProcess = MARVEL_CATALOG.filter(i => i.saga === 'spiderman');
    } else if (target === 'xmen') {
        itemsToProcess = MARVEL_CATALOG.filter(i => i.saga === 'xmen');
    } else if (target === 'venom') {
        itemsToProcess = MARVEL_CATALOG.filter(i => i.saga === 'venom');
    } else if (target === 'deadpool') {
        itemsToProcess = MARVEL_CATALOG.filter(i => i.saga === 'deadpool');
    } else if (target === 'series') {
        itemsToProcess = MARVEL_CATALOG.filter(i => i.type === 'series');
    } else if (target !== 'all') {
        itemsToProcess = MARVEL_CATALOG.filter(i => i.slug === target);
    }

    // Aplicar sharding
    if (totalShards > 1) {
        itemsToProcess = itemsToProcess.filter((_, idx) => idx % totalShards === shard);
        console.log(`🔀 Shard ${shard}/${totalShards}: procesando ${itemsToProcess.length} elementos asignados.`);
    } else {
        console.log(`📋 Total de elementos seleccionados para procesar: ${itemsToProcess.length}`);
    }

    if (maxItems < itemsToProcess.length) {
        itemsToProcess = itemsToProcess.slice(0, maxItems);
        console.log(`Límite de --max-items aplicado: procesando ${itemsToProcess.length} elementos.`);
    }

    const summary = [];
    for (const item of itemsToProcess) {
        try {
            if (item.type === 'movie') {
                const res = await processMovie(item, chromePath);
                summary.push({ title: item.canonicalTitle, status: res.skipped ? 'SKIPPED' : 'SUCCESS' });
            } else if (item.type === 'series') {
                const res = await processSeries(item, chromePath, maxEpisodes);
                summary.push({ title: item.canonicalTitle, status: 'SERIES_PROCESSED' });
            }
        } catch (err) {
            console.error(`❌ Error procesando ${item.canonicalTitle}:`, err.message);
            summary.push({ title: item.canonicalTitle, status: `FAILED: ${err.message}` });
        }
    }

    console.log('\n======================================================');
    console.log('📊 RESUMEN FINAL SINCRONIZACIÓN MARVEL:');
    console.log('======================================================');
    summary.forEach(s => console.log(`- ${s.title}: ${s.status}`));
}

if (require.main === module) {
    main().catch(err => {
        console.error('Error fatal:', err);
        process.exit(1);
    });
}

module.exports = {
    processMovie,
    processSeries,
    listCatalogStatus
};
