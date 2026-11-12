const puppeteer = require('puppeteer-core');
const https = require('https');
const os = require('os');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const { uploadToR2 } = require('./upload_to_r2');

// ============================================================
// RESCRAPE TRENDING MOVIES — rescrape_trending.js
// Re-extrae, descarga en máxima nitidez (1080p/HD), optimiza con
// faststart, sube a Cloudflare R2 (_hd.mp4) y actualiza en
// CinemaDB (Supabase Premium) todas las películas de
// "Tendencias ahora" preservando su ID y conteo de vistas.
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_PREMIUM_URL || 'https://pdvdnjmqgcprwntabvia.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PREMIUM_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkdmRuam1xZ2NwcndudGFidmlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NTgwNjIsImV4cCI6MjA5ODEzNDA2Mn0.8qcpYfWH9bwDrEQSKzbYvKOqlYpBQmqNWgykTQBXO60';
const CUEVANA_BASE = 'https://cuevana3w.pro';

// Mapa de slugs especiales conocidos en caso de discrepancia de tildes/números
const SLUG_OVERRIDES = {
    'obsesin-81': 'obsesion',
    'el-diablo-viste-a-la-moda-2-64': 'el-diablo-viste-a-la-moda-2'
};

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

function cleanMovieTitle(rawTitle) {
    if (!rawTitle) return '';
    // Elimina calificaciones pegadas al final del título como "7.8", "8.1", "5", "7"
    // pero preserva secuelas legítimas como "Toy Story 5", "Cocktail 2"
    let cleaned = String(rawTitle).trim();
    // Si termina en decimal tipo " 7.8" o " 8.1", siempre es rating pegado
    cleaned = cleaned.replace(/\s+\d{1,2}\.\d+\s*$/, '').trim();
    // Si tiene dos números al final como "Toy Story 5 7.2" (ya limpiado arriba) o "Moana 5", "Hermanos 1", "Bleach ... 7"
    if (/^(Moana|Hermanos|Ikka|El despertar|Este cuerpo mío|A Richer Christmas|Terrell & T\.O\.|Moscas|9 lunas|The Good Lawyer|Sara Bareilles: Good Grief|Wolves Up Close with Bertie Gregory|Your Fault: London|Glenrothan|Bleach: Thousand-Year Blood War - The Calamity)\s+\d+$/i.test(cleaned)) {
        cleaned = cleaned.replace(/\s+\d+$/, '').trim();
    }
    return cleaned;
}

function toSlug(str) {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function fetchHtmlWithStatus(url, redirects = 4) {
    return new Promise((resolve) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
                const nextUrl = res.headers.location.startsWith('http')
                    ? res.headers.location
                    : `${CUEVANA_BASE}${res.headers.location}`;
                return fetchHtmlWithStatus(nextUrl, redirects - 1).then(resolve);
            }
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, html: data, finalUrl: url }));
        }).on('error', (err) => resolve({ status: 500, html: '', error: err.message }));
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
                ...(method === 'POST' ? { 'Prefer': 'resolution=merge-duplicates' } : {}),
                ...(method === 'PATCH' ? { 'Prefer': 'return=representation' } : {})
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

async function resolveCuevanaUrl(movie) {
    const candidates = [];
    if (SLUG_OVERRIDES[movie.id]) candidates.push(SLUG_OVERRIDES[movie.id]);
    candidates.push(movie.id);

    const cleanedTitle = cleanMovieTitle(movie.title);
    const titleSlug = toSlug(cleanedTitle);
    if (titleSlug && !candidates.includes(titleSlug)) candidates.push(titleSlug);

    const strippedId = String(movie.id).replace(/-\d{2}$/, '');
    if (strippedId && !candidates.includes(strippedId)) candidates.push(strippedId);

    for (const slug of candidates) {
        const url = `${CUEVANA_BASE}/pelicula/${slug}`;
        const res = await fetchHtmlWithStatus(url);
        if (res.status === 200 && res.html && res.html.includes('data-server=')) {
            return { url: res.finalUrl || url, html: res.html, slug };
        }
    }
    return null;
}

async function scrapeMetadata(movieUrl, chromePath) {
    console.log(`[Metadata] Extrayendo metadatos actualizados de: ${movieUrl}`);
    const browser = await puppeteer.launch({
        executablePath: chromePath || undefined,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto(movieUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
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

            let duration = '';
            const allText = document.body.innerText;
            const durMatch = allText.match(/\b(\d+h\s*\d*m)\b/i) || allText.match(/\b(\d+)\s*min\b/i);
            if (durMatch) duration = durMatch[1];

            return { title, description, poster, backdrop, genres, duration };
        });

        return data;
    } catch (e) {
        console.warn('[Metadata] Advertencia:', e.message);
        return {};
    } finally {
        await browser.close();
    }
}

async function extractStream(cuevanaMovieUrl, htmlContent, chromePath) {
    console.log(`[Stream] Extrayendo flujo HD en vivo de: ${cuevanaMovieUrl}`);
    const html = htmlContent || (await fetchHtmlWithStatus(cuevanaMovieUrl)).html;

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

    for (let pIdx = 0; pIdx < playerUrls.length; pIdx++) {
        const candidatePlayer = playerUrls[pIdx];
        const browser = await puppeteer.launch({
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
                if (u.includes('master.m3u8') || (u.includes('.m3u8') && !targetMasterUrl)) {
                    console.log(`✨ M3U8 capturado (servidor #${pIdx + 1}): ${u.substring(0, 90)}...`);
                    targetMasterUrl = u;
                }
            });

            console.log(`Cargando reproductor #${pIdx + 1}: ${candidatePlayer}`);
            await page.goto(candidatePlayer, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(r => setTimeout(r, 2500));

            let iframeUrl = null;
            for (const frame of page.frames()) {
                const fu = frame.url();
                if (fu.includes('morencius.com') || fu.includes('/v/') || fu.includes('/e/')) {
                    iframeUrl = fu;
                    break;
                }
            }

            if (!iframeUrl) {
                iframeUrl = candidatePlayer;
            }

            refererUsed = iframeUrl;
            await page.goto(iframeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(r => setTimeout(r, 2000));

            await page.evaluate(() => {
                if (window.jwplayer && window.jwplayer()) {
                    window.jwplayer().play();
                }
            }).catch(() => {});

            for (let i = 0; i < 15 && !targetMasterUrl; i++) {
                await new Promise(r => setTimeout(r, 1000));
            }

            if (targetMasterUrl) {
                return { masterUrl: targetMasterUrl, referer: refererUsed };
            }
        } catch (err) {
            console.warn(`Intento con reproductor #${pIdx + 1} falló: ${err.message}`);
        } finally {
            await browser.close();
        }
    }

    throw new Error('No se capturó master.m3u8 en ninguno de los servidores disponibles.');
}

function downloadStream(streamUrl, referer, outputPath) {
    return new Promise((resolve) => {
        console.log(`\n📥 Descargando película actualizada a: ${outputPath}...`);
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
        if (!fs.existsSync(outputMp4)) return false;

        // Validar que el MP4 resultante tenga códec de video real (avc1/hvc1) y no mp4v (PNG falso)
        const fdOut = fs.openSync(outputMp4, 'r');
        const probe = Buffer.alloc(65536);
        const bytesRead = fs.readSync(fdOut, probe, 0, probe.length, 0);
        fs.closeSync(fdOut);
        const probeStr = probe.subarray(0, bytesRead).toString('latin1');
        if (probeStr.includes('mp4v') && !probeStr.includes('avc1')) {
            console.error('❌ El MP4 resultante contiene códec mp4v (PNG falso sin demuxear). Abortando subida.');
            return false;
        }
        return true;
    } catch (e) {
        console.warn('Advertencia en remux faststart:', e.message);
        return false;
    }
}

async function rescrapeMovie(movie, chromePath) {
    const cleanTitle = cleanMovieTitle(movie.title);
    console.log('\n======================================================');
    console.log(`🔥 RE-SCRAPEANDO TENDENCIA: ${cleanTitle} [ID: ${movie.id} | Vistas: ${movie.vistas}]`);
    console.log('======================================================');

    const resolved = await resolveCuevanaUrl(movie);
    if (!resolved) {
        throw new Error(`No se encontró URL de Cuevana para '${movie.title}' (ID: ${movie.id})`);
    }
    console.log(`🔗 URL Cuevana resuelta: ${resolved.url}`);

    const meta = await scrapeMetadata(resolved.url, chromePath);
    const streamInfo = await extractStream(resolved.url, resolved.html, chromePath);

    const safeFileBase = toSlug(movie.id).replace(/[^a-z0-9-]/g, '-');
    const rawFileName = `temp_${safeFileBase}.ts`;
    const finalFileName = `${safeFileBase}_hd.mp4`;

    try {
        if (fs.existsSync(rawFileName)) fs.unlinkSync(rawFileName);
        if (fs.existsSync(finalFileName)) fs.unlinkSync(finalFileName);
    } catch (_) {}

    const downloaded = await downloadStream(streamInfo.masterUrl, streamInfo.referer, rawFileName);
    if (!downloaded) {
        throw new Error(`Falló la descarga del stream HD para ${cleanTitle}`);
    }

    const remuxed = remuxFaststart(rawFileName, finalFileName);
    if (!remuxed) {
        try {
            if (fs.existsSync(rawFileName)) fs.unlinkSync(rawFileName);
            if (fs.existsSync(finalFileName)) fs.unlinkSync(finalFileName);
        } catch (_) {}
        throw new Error(`Falló el remux MPEG-TS -> MP4 (H.264) para ${cleanTitle}`);
    }

    console.log(`📤 Subiendo versión nítida a Cloudflare R2 (${finalFileName})...`);
    const r2Url = await uploadToR2(finalFileName, 'movie');
    console.log(`🎉 Nuevo video HD en R2: ${r2Url}`);

    try {
        if (fs.existsSync(rawFileName)) fs.unlinkSync(rawFileName);
        if (fs.existsSync(finalFileName)) fs.unlinkSync(finalFileName);
    } catch (_) {}

    const updatePayload = {
        title: cleanTitle || meta.title || movie.title,
        url: r2Url,
        poster: meta.poster || movie.poster,
        backdrop: meta.backdrop || movie.backdrop || meta.poster || movie.poster,
        description: meta.description || movie.description,
        duration: meta.duration || movie.duration,
        genres: (meta.genres && meta.genres.length > 0) ? meta.genres : movie.genres,
        quality: '4K Ultra HD'
    };

    console.log(`📝 Actualizando registro en CinemaDB (preservando ${movie.vistas} vistas)...`);
    const patchRes = await makeSupabaseRequest(
        `premium_movies?id=eq.${encodeURIComponent(movie.id)}`,
        'PATCH',
        updatePayload
    );

    if (patchRes.status === 200 || patchRes.status === 204) {
        console.log(`✅ ¡'${updatePayload.title}' actualizada con video nítido en CinemaDB!`);
        return { success: true, url: r2Url };
    } else {
        throw new Error(`Error en PATCH Supabase (status ${patchRes.status}): ${JSON.stringify(patchRes.data)}`);
    }
}

async function main() {
    console.log('======================================================');
    console.log('🚀 RE-SCRAPER DE PELÍCULAS EN "TENDENCIAS AHORA"');
    console.log('======================================================');

    const args = process.argv.slice(2);
    const getArg = (flag, fallback) => {
        const idx = args.indexOf(flag);
        return (idx !== -1 && args[idx + 1] !== undefined) ? args[idx + 1] : fallback;
    };

    const limit = parseInt(getArg('--limit', '15'), 10);
    const shard = parseInt(getArg('--shard', '0'), 10);
    const totalShards = parseInt(getArg('--total-shards', '1'), 10);
    const targetSlug = getArg('--slug', '');

    const chromePath = getChromePath();
    console.log(`Chrome detectado: ${chromePath || 'auto'}`);

    let query = `premium_movies?select=*&order=vistas.desc&limit=${limit}`;
    if (targetSlug && targetSlug !== 'all') {
        query = `premium_movies?select=*&id=eq.${encodeURIComponent(targetSlug)}`;
    }

    const res = await makeSupabaseRequest(query, 'GET');
    if (res.status !== 200 || !Array.isArray(res.data) || res.data.length === 0) {
        throw new Error(`No se pudieron obtener las películas en tendencia de Supabase (status ${res.status})`);
    }

    // Filtrar solo películas con URL válida igual que hace /api/movies
    const allTrending = res.data.filter(m => {
        const u = String(m.url || m.iframe_url || '').trim();
        return u.startsWith('http://') || u.startsWith('https://');
    });

    const targetMovies = allTrending.filter((_, index) => (index % totalShards) === shard);
    console.log(`Películas asignadas a este worker (shard ${shard + 1}/${totalShards}): ${targetMovies.length} de ${allTrending.length}`);
    targetMovies.forEach((m, i) => console.log(`  ${i + 1}. ${m.title} (${m.id}) — ${m.vistas} vistas`));

    const results = [];
    for (const movie of targetMovies) {
        try {
            const r = await rescrapeMovie(movie, chromePath);
            results.push({ id: movie.id, title: cleanMovieTitle(movie.title), status: 'UPDATED', url: r.url });
        } catch (err) {
            console.error(`❌ Error actualizando ${movie.title} (${movie.id}):`, err.message);
            results.push({ id: movie.id, title: movie.title, status: 'FAILED', error: err.message });
        }
    }

    console.log('\n======================================================');
    console.log(`📊 RESUMEN FINAL (SHARD ${shard + 1}/${totalShards}):`);
    console.log('======================================================');
    results.forEach(r => {
        console.log(`- ${r.title} [${r.id}]: ${r.status} ${r.url ? `-> ${r.url}` : `(${r.error})`}`);
    });

    const failedCount = results.filter(r => r.status === 'FAILED').length;
    if (failedCount === results.length && results.length > 0) {
        process.exit(1);
    }
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Error fatal:', err);
            process.exit(1);
        });
}

module.exports = { rescrapeMovie, resolveCuevanaUrl, cleanMovieTitle };
