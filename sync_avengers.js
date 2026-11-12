const puppeteer = require('puppeteer-core');
const https = require('https');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { uploadToR2 } = require('./upload_to_r2');

// ============================================================
// SYNC SAGA AVENGERS — sync_avengers.js
// Extrae, descarga, sube a Cloudflare R2 y registra en CinemaDB
// (Supabase Premium) toda la saga cinematográfica de The Avengers.
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_PREMIUM_URL || 'https://pdvdnjmqgcprwntabvia.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PREMIUM_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkdmRuam1xZ2NwcndudGFidmlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NTgwNjIsImV4cCI6MjA5ODEzNDA2Mn0.8qcpYfWH9bwDrEQSKzbYvKOqlYpBQmqNWgykTQBXO60';
const R2_PUBLIC_URL = 'https://pub-77522f1e717f46bead2250b84f1ca547.r2.dev';

const AVENGERS_SAGA = [
    {
        slug: 'the-avengers',
        canonicalTitle: 'The Avengers (Los Vengadores)',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/los-vengadores',
        year: 2012,
        rating: '8.0 IMDb',
        is_featured: false
    },
    {
        slug: 'vengadores-la-era-de-ultron',
        canonicalTitle: 'Vengadores: La era de Ultrón',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/los-vengadores-2',
        year: 2015,
        rating: '7.8 IMDb',
        is_featured: false
    },
    {
        slug: 'vengadores-infinity-war',
        canonicalTitle: 'Vengadores: Infinity War',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/vengadores-infinity-war',
        year: 2018,
        rating: '8.4 IMDb',
        is_featured: true
    },
    {
        slug: 'vengadores-endgame',
        canonicalTitle: 'Vengadores: Endgame',
        cuevanaUrl: 'https://cuevana3w.pro/pelicula/vengadores-endgame',
        year: 2019,
        rating: '8.4 IMDb',
        is_featured: true
    }
];

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

async function scrapeMetadata(movieUrl, chromePath) {
    console.log(`[Metadata] Extrayendo metadatos oficiales de: ${movieUrl}`);
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

            // Calidad de afiche a w500 para máxima nitidez
            if (poster && poster.includes('/w200/')) {
                poster = poster.replace('/w200/', '/w500/');
            }

            const genres = [];
            document.querySelectorAll('a').forEach(el => {
                if (el.href && el.href.includes('genero=')) genres.push(el.innerText.trim());
            });

            let duration = '2h 25m';
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

async function extractStream(cuevanaMovieUrl, chromePath) {
    console.log(`[Stream] Extrayendo flujo de video en vivo de: ${cuevanaMovieUrl}`);
    const html = await fetchHtml(cuevanaMovieUrl);

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
            if (u.includes('master.m3u8')) {
                console.log(`✨ Master M3U8 capturado: ${u.substring(0, 90)}...`);
                targetMasterUrl = u;
            }
        });

        // Intentar con el reproductor principal (Token 1 - Latino)
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

        if (!iframeUrl) {
            iframeUrl = primaryPlayer;
        }

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
        console.log(`\n📥 Descargando película completa a: ${outputPath}...`);
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

async function processMovie(movieConfig, chromePath) {
    console.log('\n======================================================');
    console.log(`🎬 PROCESANDO: ${movieConfig.canonicalTitle} (${movieConfig.year})`);
    console.log('======================================================');

    // 1. Verificar si ya existe en Supabase y si su archivo en R2 tiene códec avc1 válido
    const check = await makeSupabaseRequest(`premium_movies?id=eq.${movieConfig.slug}`, 'GET');
    if (check.data && check.data.length > 0) {
        const existingUrl = check.data[0].url;
        const healthy = await isR2FileHealthyAvc1(existingUrl);
        if (healthy) {
            console.log(`⏭️ '${movieConfig.canonicalTitle}' ya existe en CinemaDB con códec avc1 válido. Saltando.`);
            return { success: true, skipped: true };
        }
        console.log(`🔄 '${movieConfig.canonicalTitle}' existe pero requiere re-muxeo H.264 (avc1). Re-procesando...`);
    }

    // 2. Extraer metadatos
    const meta = await scrapeMetadata(movieConfig.cuevanaUrl, chromePath);
    const finalTitle = movieConfig.canonicalTitle;
    const finalPoster = meta.poster || 'https://image.tmdb.org/t/p/w500/ugX4WZJO3jEvTOerctAWJLinujo.jpg';
    const finalBackdrop = meta.backdrop || finalPoster;
    const finalDesc = meta.description || `${finalTitle} - Saga cinematográfica de Marvel Studios Avengers.`;
    const finalDuration = meta.duration || '2h 25m';
    const finalGenres = (meta.genres && meta.genres.length > 0) ? meta.genres : ['Acción', 'Aventura', 'Ciencia Ficción'];

    // 3. Extraer flujo en vivo
    const streamInfo = await extractStream(movieConfig.cuevanaUrl, chromePath);

    // 4. Descarga local temporal en formato .ts (evita que yt-dlp corrompa streams con cabecera PNG falsa)
    const rawFileName = `temp_${movieConfig.slug}.ts`;
    const finalFileName = `${movieConfig.slug}.mp4`;

    const downloaded = await downloadStream(streamInfo.masterUrl, streamInfo.referer, rawFileName);
    if (!downloaded) {
        throw new Error(`Falló la descarga del flujo para ${movieConfig.canonicalTitle}`);
    }

    // 5. Remux Faststart con soporte -f mpegts
    const remuxed = remuxFaststart(rawFileName, finalFileName);
    if (!remuxed) {
        throw new Error(`Falló el remux MPEG-TS -> MP4 para ${movieConfig.canonicalTitle}`);
    }
    const fileToUpload = finalFileName;

    // 6. Subir a Cloudflare R2
    console.log(`📤 Subiendo a Cloudflare R2...`);
    const r2Url = await uploadToR2(fileToUpload, 'movie');
    console.log(`🎉 Archivo disponible en R2: ${r2Url}`);

    // Limpieza de archivos temporales
    try {
        if (fs.existsSync(rawFileName)) fs.unlinkSync(rawFileName);
        if (fs.existsSync(finalFileName)) fs.unlinkSync(finalFileName);
    } catch (_) {}

    // 7. Registrar en CinemaDB (Supabase Premium)
    const movieRecord = {
        id: movieConfig.slug,
        title: finalTitle,
        url: r2Url,
        poster: finalPoster,
        backdrop: finalBackdrop,
        year: movieConfig.year,
        duration: finalDuration,
        genres: finalGenres,
        cast: 'Robert Downey Jr., Chris Evans, Chris Hemsworth, Scarlett Johansson, Mark Ruffalo, Jeremy Renner',
        description: finalDesc,
        rating: movieConfig.rating,
        quality: '4K Ultra HD',
        is_featured: movieConfig.is_featured,
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

async function main() {
    console.log('======================================================');
    console.log('🚀 INICIANDO SINCRONIZACIÓN SAGA AVENGERS A CINEMADB');
    console.log('======================================================');

    const chromePath = getChromePath();
    console.log(`Chrome detectado: ${chromePath || 'auto'}`);

    const args = process.argv.slice(2);
    let targetList = AVENGERS_SAGA;

    // Soporte para filtrar por índice si se desea procesar una sola película
    const indexArg = args.indexOf('--index');
    if (indexArg !== -1 && args[indexArg + 1]) {
        const idx = parseInt(args[indexArg + 1], 10);
        targetList = [AVENGERS_SAGA[idx]];
    }

    const results = [];
    for (const item of targetList) {
        try {
            const result = await processMovie(item, chromePath);
            results.push({ movie: item.canonicalTitle, status: 'SUCCESS', details: result });
        } catch (e) {
            console.error(`❌ Error procesando ${item.canonicalTitle}:`, e.message);
            results.push({ movie: item.canonicalTitle, status: 'FAILED', error: e.message });
        }
    }

    console.log('\n======================================================');
    console.log('📊 RESUMEN FINAL SAGA AVENGERS:');
    console.log('======================================================');
    results.forEach(r => {
        console.log(`- ${r.movie}: ${r.status} ${r.error ? `(${r.error})` : ''}`);
    });
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Error fatal:', err);
            process.exit(1);
        });
}

module.exports = { AVENGERS_SAGA, processMovie, scrapeMetadata, extractStream };
