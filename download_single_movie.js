const puppeteer = require('puppeteer-core');
const os = require('os');
const fs = require('fs');
const https = require('https');
const { spawn, execSync } = require('child_process');

// ============================================================
// DOWNLOAD SINGLE MOVIE — download_single_movie.js
// Scrapes metadata, downloads, uploads to Cloudflare R2,
// and registers a single movie by Cuevana URL.
// ============================================================

// Cargar .env.local si existe para facilitar la ejecución local
try {
    const path = require('path');
    const envPath = path.resolve(__dirname, '../Cinema-main/Cinema-main/.env.local');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        envContent.split('\n').forEach(line => {
            const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
            if (match) {
                const key = match[1];
                let value = match[2] || '';
                if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
                if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
                
                // Mapear variables para compatibilidad
                if (key.includes('SUPABASE_PREMIUM_URL')) {
                    process.env.SUPABASE_PREMIUM_URL = value;
                }
                if (key.includes('SUPABASE_PREMIUM_ANON_KEY')) {
                    process.env.SUPABASE_PREMIUM_ANON_KEY = value;
                }
            }
        });
    }
} catch (e) {
    // Silencioso
}

const XOR_KEY = 'a45f04ce-2394-47c3-b718-0ecd97ce51d6';
const SERVERS = {
    '1': 'https://tiktokshopping.xyz/v/',
    '2': 'https://filemoon.sx/e/',
    '3': 'https://martinshop.xyz/e/',
    '4': 'https://dood.li/e/'
};

const SUPABASE_URL = process.env.SUPABASE_PREMIUM_URL || 'https://pdvdnjmqgcprwntabvia.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PREMIUM_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkdmRuam1xZ2NwcndudGFidmlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NTgwNjIsImV4cCI6MjA5ODEzNDA2Mn0.8qcpYfWH9bwDrEQSKzbYvKOqlYpBQmqNWgykTQBXO60';
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

function generateSlug(text) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')           // Reemplazar espacios por -
        .replace(/[^\w\-]+/g, '')       // Remover caracteres no alfanuméricos
        .replace(/\-\-+/g, '-')         // Reemplazar múltiples - por uno solo
        .replace(/^-+/, '')             // Remover - inicial
        .replace(/-+$/, '');            // Remover - final
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

// ──────────────────────────────────────────────
// EXTRACCIÓN CON PUPPETEER
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
        await page.goto(movieUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

        const metadata = await page.evaluate(() => {
            const titleEl = document.querySelector('h1, .title, .entry-title');
            const title = titleEl ? titleEl.innerText.trim() : '';

            let description = '';
            const descEl = document.querySelector('.description, .synopsis, #description, .entry-content p, article p');
            if (descEl) description = descEl.innerText.trim();
            if (!description) {
                const meta = document.querySelector('meta[name="description"]');
                if (meta) description = meta.content.trim();
            }

            // Imágenes
            const imgs = Array.from(document.querySelectorAll('img'));
            const posterImg = imgs.find(img => img.src && img.src.includes('image.tmdb.org/t/p/w200/'));
            const backdropImg = imgs.find(img => img.src && img.src.includes('image.tmdb.org/t/p/w1280/'));
            const poster = posterImg ? posterImg.src : '';
            const backdrop = backdropImg ? backdropImg.src : (posterImg ? posterImg.src : '');

            // Géneros
            const genres = [];
            document.querySelectorAll('a').forEach(el => {
                if (el.href && el.href.includes('genero=')) genres.push(el.innerText.trim());
            });

            // Año
            let year = new Date().getFullYear();
            document.querySelectorAll('p, span, div').forEach(el => {
                const m = (el.innerText || '').match(/\b(202\d|201\d|200\d|19\d\d)\b/);
                if (m) year = parseInt(m[1]);
            });

            // Duración
            let duration = '1h 45m';
            document.querySelectorAll('p, span, div').forEach(el => {
                const txt = el.innerText || '';
                if (txt.includes('m') && (txt.includes('h') || txt.match(/\b\d+\s*min/))) {
                    duration = txt.trim();
                }
            });

            // Rating
            let rating = null;
            const scoreEl = document.querySelector('[data-score], [data-rating], [class*="score"], [class*="rating"]');
            if (scoreEl) {
                const raw = scoreEl.dataset.score || scoreEl.dataset.rating || scoreEl.innerText;
                const parsed = parseFloat(raw);
                if (!isNaN(parsed) && parsed > 0 && parsed <= 10) rating = parsed.toFixed(1);
            }

            return { title, description, poster, backdrop, genres, duration, year, rating };
        });

        await browser.close();
        return metadata;
    } catch (e) {
        console.error('Error al extraer metadatos:', e.message);
        if (browser) await browser.close();
        return null;
    }
}

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

// ──────────────────────────────────────────────
// DESCARGA Y CONVERSIÓN
// ──────────────────────────────────────────────

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
// PROCESAMIENTO PRINCIPAL
// ──────────────────────────────────────────────

async function main() {
    const movieUrl = process.argv[2];
    let customTitle = process.argv[3];

    if (!movieUrl) {
        console.log('Uso: node download_single_movie.js [URL_PELICULA] [TITULO_OPCIONAL]');
        process.exit(1);
    }

    const chromePath = getChromePath();
    console.log(`Iniciando descarga individual. Chrome: ${chromePath || 'auto-detect'}`);

    // Metadatos
    const metadata = await scrapeMovieMetadata(movieUrl, chromePath);
    if (!metadata || !metadata.title) {
        console.error('❌ Error: No se pudieron obtener los metadatos de la película.');
        process.exit(1);
    }

    if (customTitle) {
        metadata.title = customTitle;
    }

    const slug = generateSlug(metadata.title);
    console.log(`\n🎬 Película detectada: ${metadata.title} (Slug: ${slug})`);

    // Reproductores
    let movieHtml;
    try { movieHtml = await fetchHtml(movieUrl); }
    catch (e) { console.error('❌ Error al obtener reproductores:', e.message); process.exit(1); }

    const regexServer = /data-server="([^"]+)"/g;
    let matchServer;
    const playerUrls = [];
    while ((matchServer = regexServer.exec(movieHtml)) !== null) {
        const dec = decryptToken(matchServer[1]);
        if (dec && !playerUrls.includes(dec)) playerUrls.push(dec);
    }

    console.log(`Reproductores encontrados: ${playerUrls.length}`);

    let success = false;
    for (const playerUrl of playerUrls) {
        const streams = await extractM3u8(playerUrl, chromePath);
        if (streams && streams.length > 0) {
            const filename = slug.replace(/[^a-zA-Z0-9]/g, '_') + '.mp4';
            const downloaded = await downloadAndRemux(streams[0], playerUrl, filename);
            if (downloaded) {
                try {
                    let uploadSuccess = false;
                    for (let attempt = 1; attempt <= 3; attempt++) {
                        try {
                            console.log(`📤 Subiendo a R2 (intento ${attempt}/3)...`);
                            execSync(`python upload_to_r2.py "${filename}"`, { stdio: 'inherit' });
                            uploadSuccess = true;
                            break;
                        } catch (uploadErr) {
                            console.error(`⚠️ Error en intento ${attempt} de subida a R2:`, uploadErr.message);
                            if (attempt < 3) {
                                console.log('Esperando 10 segundos antes de reintentar...');
                                await new Promise(r => setTimeout(r, 10000));
                            }
                        }
                    }

                    if (!uploadSuccess) {
                        throw new Error(`Command failed: python upload_to_r2.py "${filename}"`);
                    }

                    // Mantener el archivo para que el paso de backup de GitHub Release pueda subirlo
                    // if (fs.existsSync(filename)) fs.unlinkSync(filename);

                    const record = {
                        id: slug,
                        title: metadata.title,
                        url: `${R2_PUBLIC_URL}/${filename}`,
                        poster: metadata.poster || 'https://cuevana3i.you/cuevana3.png',
                        backdrop: metadata.backdrop || metadata.poster || 'https://cuevana3i.you/cuevana3.png',
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

                    console.log('📝 Registrando película en Supabase...');
                    const res = await makeSupabaseRequest('premium_movies', 'POST', record);
                    if (res.status === 201 || res.status === 200 || res.status === 204) {
                        console.log(`🎉 Película '${metadata.title}' registrada y subida con éxito.`);
                        success = true;
                        break;
                    } else {
                        console.error(`❌ Error al registrar película en Supabase (status ${res.status}):`, res.data);
                    }
                } catch (err) { console.error('❌ Error al subir/registrar película:', err.message); }
            }
        }
    }

    if (success) {
        console.log('🏁 Sincronización de película individual completada con éxito.');
    } else {
        console.error('❌ Error: No se pudo descargar la película en ningún servidor compatible.');
        process.exit(1);
    }
}

main().catch(console.error);
