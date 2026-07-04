const puppeteer = require('puppeteer-core');
const os = require('os');
const fs = require('fs');
const https = require('https');
const { spawn, execSync } = require('child_process');

// ============================================================
// SYNC PELÍCULAS — sync_movies.js
// Sincroniza automáticamente las películas nuevas de Cuevana
// a la base de datos premium y Cloudflare R2.
// ============================================================

const XOR_KEY = 'a45f04ce-2394-47c3-b718-0ecd97ce51d6';
const SERVERS = {
    '1': 'https://tiktokshopping.xyz/v/',
    '2': 'https://filemoon.sx/e/',
    '3': 'https://martinshop.xyz/e/',
    '4': 'https://dood.li/e/'
};

const SUPABASE_URL = process.env.SUPABASE_PREMIUM_URL || 'https://pdvdnjmqgcprwntabvia.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PREMIUM_ANON_KEY || '';
const R2_PUBLIC_URL = 'https://pub-77522f1e717f46bead2250b84f1ca547.r2.dev';

// ──────────────────────────────────────────────
// UTILIDADES GENERALES
// ──────────────────────────────────────────────

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
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', (err) => reject(err));
    });
}

function decryptToken(tokenString) {
    try {
        if (tokenString.includes('token=')) {
            const token = tokenString.split('token=')[1].split('&')[0];
            const serverIndex = token[0];
            const encoded = token.substring(1);
            const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
            let decrypted = '';
            for (let i = 0; i < decoded.length; i++) {
                decrypted += String.fromCharCode(decoded.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
            }
            return SERVERS[serverIndex] ? SERVERS[serverIndex] + decrypted : null;
        }
        if (tokenString.includes('v=')) {
            return Buffer.from(tokenString.split('v=')[1].split('&')[0], 'base64').toString('utf-8');
        }
        return null;
    } catch (e) { return null; }
}

function makeSupabaseRequest(path, method, data = null) {
    return new Promise((resolve) => {
        const url = `${SUPABASE_URL}/rest/v1/${path}`;
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

const generateSlug = (title) =>
    title.toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

// ──────────────────────────────────────────────
// EXTRACCIÓN DE VIDEO
// ──────────────────────────────────────────────

async function extractM3u8(playerUrl, chromePath) {
    console.log(`[Puppeteer] Abriendo reproductor: ${playerUrl}...`);
    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: chromePath || undefined,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-web-security', '--disable-features=IsolateOrigins,site-per-process']
        });
    } catch (err) {
        console.error('Error al iniciar Puppeteer:', err.message);
        return [];
    }
    const page = await browser.newPage();
    const streams = [];
    page.on('request', req => {
        const u = req.url();
        if (u.includes('.m3u8') || u.includes('.mp4') || u.includes('.m4s') || u.includes('playlist') || u.includes('master')) {
            if (!streams.includes(u)) { streams.push(u); console.log(`✨ Stream capturado: ${u}`); }
        }
    });
    try {
        await page.goto(playerUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        await new Promise(r => setTimeout(r, 8000));
        await page.evaluate(() => { const el = document.querySelector('video') || document.body; if (el) el.click(); });
        await new Promise(r => setTimeout(r, 5000));
    } catch (e) {
        console.log('[Puppeteer] Timeout:', e.message);
    } finally {
        await browser.close();
    }
    return streams;
}

function downloadAndRemux(stream, playerUrl, filename) {
    return new Promise((resolve) => {
        const referer = new URL(playerUrl).origin + '/';
        const tempTs = `temp_${Date.now()}.ts`;
        console.log(`\n📥 Descargando HLS: ${tempTs}...`);
        const child = spawn('yt-dlp', ['--no-update', '--referer', referer, '--extractor-args', 'generic:impersonate', '-o', tempTs, stream], { stdio: 'inherit' });
        child.on('close', (code) => {
            if (code === 0) {
                try {
                    let isFakePng = false;
                    try {
                        const fd = fs.openSync(tempTs, 'r');
                        const header = Buffer.alloc(4);
                        fs.readSync(fd, header, 0, 4, 0);
                        fs.closeSync(fd);
                        isFakePng = (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47);
                    } catch (_) {}
                    const cmd = isFakePng
                        ? `ffmpeg -y -f mpegts -i "${tempTs}" -c copy -movflags +faststart "${filename}"`
                        : `ffmpeg -y -i "${tempTs}" -c copy -movflags +faststart "${filename}"`;
                    execSync(cmd, { stdio: 'inherit' });
                    if (fs.existsSync(tempTs)) fs.unlinkSync(tempTs);
                    resolve(true);
                } catch (err) {
                    if (fs.existsSync(tempTs)) fs.unlinkSync(tempTs);
                    resolve(false);
                }
            } else {
                if (fs.existsSync(tempTs)) fs.unlinkSync(tempTs);
                resolve(false);
            }
        });
    });
}

// ──────────────────────────────────────────────
// SCRAPING DE METADATOS DE PELÍCULA
// ──────────────────────────────────────────────

async function scrapeMovieMetadata(movieUrl, chromePath) {
    console.log(`[Puppeteer] Obteniendo metadatos de película: ${movieUrl}`);
    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: chromePath || undefined,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto(movieUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        const metadata = await page.evaluate(() => {
            const title = document.querySelector('h1')?.innerText?.trim() || '';

            // Sinopsis
            let description = '';
            const resumenEl = document.querySelector('.resumen, [class*="resumen"], .sinopsis, [class*="sinopsis"]');
            if (resumenEl && resumenEl.innerText.trim().length > 50) description = resumenEl.innerText.trim();
            if (!description) {
                const og = document.querySelector('meta[property="og:description"]');
                if (og && og.content && og.content.trim().length > 50) description = og.content.trim();
            }
            if (!description) {
                const meta = document.querySelector('meta[name="description"]');
                if (meta && meta.content && meta.content.trim().length > 50) description = meta.content.trim();
            }
            if (!description) {
                const p = Array.from(document.querySelectorAll('article p, main p, .content p')).find(el => el.innerText && el.innerText.trim().length > 100);
                description = p ? p.innerText.trim() : '';
            }

            // Imágenes
            const imgs = Array.from(document.querySelectorAll('img'));
            const posterImg = imgs.find(img => img.src && img.src.includes('image.tmdb.org/t/p/w200/'));
            const backdropImg = imgs.find(img => img.src && img.src.includes('image.tmdb.org/t/p/w1280/'));
            const poster = posterImg ? posterImg.src : '';
            const backdrop = backdropImg ? backdropImg.src : (posterImg ? posterImg.src : '');

            // Géneros
            const genres = [];
            document.querySelectorAll('a').forEach(el => { if (el.href && el.href.includes('genero=')) genres.push(el.innerText.trim()); });

            // Duración
            let duration = '';
            document.querySelectorAll('p, span, div').forEach(el => {
                const m = (el.innerText || '').match(/\b(\d+h\s*\d*m)\b/);
                if (m) duration = m[1];
            });

            // Año
            let year = new Date().getFullYear();
            document.querySelectorAll('p, span, div').forEach(el => {
                const m = (el.innerText || '').match(/\b(202\d)\b/);
                if (m) year = parseInt(m[1]);
            });

            // Rating real
            let rating = null;
            const scoreEl = document.querySelector('[data-score], [data-rating], [class*="score"], [class*="rating"], [class*="nota"], [class*="puntuacion"]');
            if (scoreEl) {
                const raw = scoreEl.dataset.score || scoreEl.dataset.rating || scoreEl.innerText.trim();
                const parsed = parseFloat(raw);
                if (!isNaN(parsed) && parsed > 0 && parsed <= 10) rating = parsed.toFixed(1);
            }
            if (!rating) {
                const m = document.body.innerText.match(/([5-9]\.[0-9])\s*\/\s*10/);
                if (m) rating = parseFloat(m[1]).toFixed(1);
            }

            return { title, description, poster, backdrop, genres, duration, year, rating };
        });

        await browser.close();
        return metadata;
    } catch (e) {
        console.error('Error al extraer metadatos de película:', e.message);
        if (browser) await browser.close();
        return null;
    }
}

// ──────────────────────────────────────────────
// SINCRONIZACIÓN PRINCIPAL DE PELÍCULAS
// ──────────────────────────────────────────────

async function syncMovies() {
    console.log('\n============================================');
    console.log('🎬 SINCRO DE PELÍCULAS NUEVAS');
    console.log('============================================');

    const chromePath = getChromePath();
    console.log(`Chrome: ${chromePath || 'auto-detect'}`);

    let html;
    try {
        html = await fetchHtml('https://cuevana.you/peliculas');
    } catch (e) {
        console.error('Error al obtener catálogo de películas:', e.message);
        return;
    }

    const regexLink = /href=["']?([^"'\s>]*\/pelicula\/[^"'\s>]+)["']?[^>]*>[\s\S]*?<div class="item-detail"><p>([^<]+)<\/p><\/div>/g;
    let match;
    const candidates = [];
    while ((match = regexLink.exec(html)) !== null) {
        let url = match[1];
        const title = match[2].trim();
        if (!url.startsWith('http')) url = 'https://cuevana.you' + url;
        if (!candidates.some(c => c.url === url)) candidates.push({ url, title });
    }
    console.log(`Encontradas ${candidates.length} películas en portada.`);

    let added = 0;
    let skipped = 0;
    let failed = 0;

    for (const candidate of candidates) {
        const slug = generateSlug(candidate.title || candidate.url.split('/').pop());

        // Verificar si ya existe
        const check = await makeSupabaseRequest(`premium_movies?id=eq.${slug}`, 'GET');
        if (check.data && check.data.length > 0) {
            console.log(`⏭️  '${candidate.title}' ya existe. Saltando...`);
            skipped++;
            continue;
        }

        console.log(`\n📥 Nueva película: ${candidate.title}`);

        // Metadatos
        const metadata = await scrapeMovieMetadata(candidate.url, chromePath);
        if (!metadata || !metadata.title) {
            console.log('⚠️  No se pudieron obtener metadatos. Saltando...');
            failed++;
            continue;
        }

        // Reproductores
        let movieHtml;
        try { movieHtml = await fetchHtml(candidate.url); }
        catch (e) { console.error('Error al obtener reproductores:', e.message); failed++; continue; }

        const regexServer = /data-server="([^"]+)"/g;
        let matchServer;
        const playerUrls = [];
        while ((matchServer = regexServer.exec(movieHtml)) !== null) {
            const dec = decryptToken(matchServer[1]);
            if (dec && !playerUrls.includes(dec)) playerUrls.push(dec);
        }

        let success = false;
        for (const playerUrl of playerUrls) {
            const streams = await extractM3u8(playerUrl, chromePath);
            if (streams && streams.length > 0) {
                const filename = slug.replace(/[^a-zA-Z0-9]/g, '_') + '.mp4';
                const downloaded = await downloadAndRemux(streams[0], playerUrl, filename);
                if (downloaded) {
                    try {
                        execSync(`python upload_to_r2.py "${filename}"`, { stdio: 'inherit' });
                        if (fs.existsSync(filename)) fs.unlinkSync(filename);
                        const record = {
                            id: slug,
                            title: metadata.title,
                            url: `${R2_PUBLIC_URL}/${filename}`,
                            poster: metadata.poster || 'https://cuevana.you/cuevana3.png',
                            backdrop: metadata.backdrop || metadata.poster || 'https://cuevana.you/cuevana3.png',
                            year: metadata.year || new Date().getFullYear(),
                            duration: metadata.duration || '',
                            genres: metadata.genres || [],
                            cast: '',
                            description: metadata.description || '',
                            rating: metadata.rating || null,
                            quality: '4K Ultra HD',
                            is_featured: false,
                            created_at: new Date().toISOString()
                        };
                        const res = await makeSupabaseRequest('premium_movies', 'POST', record);
                        if (res.status === 201 || res.status === 200 || res.status === 204) {
                            console.log(`🎉 Película '${metadata.title}' registrada.`);
                            success = true;
                            added++;
                            break;
                        }
                    } catch (err) { console.error('Error al subir/registrar película:', err.message); }
                }
            }
        }
        if (!success) { console.log(`❌ Falló la película '${candidate.title}'.`); failed++; }
    }

    console.log('\n============================================');
    console.log('📊 RESUMEN PELÍCULAS:');
    console.log(`  ✅ Agregadas:  ${added}`);
    console.log(`  ⏭️  Existentes: ${skipped}`);
    console.log(`  ❌ Fallidas:   ${failed}`);
    console.log('============================================');
}

syncMovies().catch(console.error);
