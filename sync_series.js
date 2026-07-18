const puppeteer = require('puppeteer-core');
const os = require('os');
const fs = require('fs');
const https = require('https');
const { spawn, execSync } = require('child_process');

// ============================================================
// SYNC SERIES — sync_series.js
// Sincroniza automáticamente episodios nuevos de Cuevana
// a la base de datos premium y Cloudflare R2.
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

// ──────────────────────────────────────────────────────────
// UTILIDADES GENERALES
// ──────────────────────────────────────────────────────────

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

function fetchHtml(url, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) return reject(new Error('Demasiados redireccionamientos'));
        https.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let redirectUrl = res.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    const parsed = new URL(url);
                    redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
                }
                return fetchHtml(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', (err) => reject(err));
    });
}

function reFindAll(text, regex) {
    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        matches.push(match[1]);
    }
    return matches;
}

function sortedUnique(arr) {
    return Array.from(new Set(arr)).sort();
}

async function getSeriesEpisodes(seriesUrl, seriesSlug, chromePath) {
    const episodes = [];
    try {
        const html = await fetchHtml(seriesUrl);
        const seasonLinks = sortedUnique(reFindAll(html, /href=["']?([^"'\s>]*(?:temporada-\d+))["']?/g));
        
        for (const seasonLink of seasonLinks) {
            let sLink = seasonLink;
            if (!sLink.startsWith('http')) sLink = 'https://cuevana3i.sbs' + sLink;
            
            const seasonHtml = await fetchHtml(sLink);
            const episodeLinks = sortedUnique(reFindAll(seasonHtml, /href=["']?([^"'\s>]*(?:episodio-\d+x\d+))["']?/g));
            
            for (const epLink of episodeLinks) {
                let eLink = epLink;
                if (!eLink.startsWith('http')) eLink = 'https://cuevana3i.sbs' + eLink;
                
                const epCode = eLink.split('episodio-')[1]; // ej. 1x1
                const parts = epCode.split('x');
                const season = parseInt(parts[0]);
                const episode = parseInt(parts[1]);
                
                episodes.push({
                    epUrl: eLink,
                    seriesSlug,
                    season,
                    episode
                });
            }
        }
    } catch (err) {
        console.error(`Error al obtener episodios de la serie ${seriesSlug}:`, err.message);
    }
    return episodes;
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

// ──────────────────────────────────────────────────────────
// EXTRACCIÓN DE VIDEO
// ──────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────
// SCRAPING DE METADATOS DE SERIE
// ──────────────────────────────────────────────────────────

async function scrapeSeriesMetadata(seriesUrl, chromePath) {
    console.log(`[Puppeteer] Obteniendo metadatos de serie: ${seriesUrl}`);
    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: chromePath || undefined,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto(seriesUrl, { waitUntil: 'networkidle2', timeout: 30000 });

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

            // Año
            let year = null;
            const allElements = Array.from(document.querySelectorAll('*'));
            const yearBlock = allElements.find(el => el.innerText && el.innerText.includes('Año de estreno'));
            if (yearBlock) {
                const nextSibling = yearBlock.nextElementSibling;
                if (nextSibling) {
                    const m = nextSibling.innerText.match(/\b(19\d{2}|20\d{2})\b/);
                    if (m) year = parseInt(m[1]);
                }
                if (!year) {
                    const m = yearBlock.innerText.match(/\b(19\d{2}|20\d{2})\b/);
                    if (m) year = parseInt(m[1]);
                }
            }
            if (!year) {
                const titleMatch = document.title.match(/\((19\d{2}|20\d{2})\)/);
                if (titleMatch) year = parseInt(titleMatch[1]);
            }
            if (!year) {
                const metaText = document.querySelector('.meta, .info, .entry-content')?.innerText || '';
                const m = metaText.match(/\b(19\d{2}|20\d{2})\b/);
                if (m) year = parseInt(m[1]);
            }
            if (!year) year = new Date().getFullYear();

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

            return { title, description, poster, backdrop, genres, year, rating };
        });

        await browser.close();
        return metadata;
    } catch (e) {
        console.error('Error al extraer metadatos de serie:', e.message);
        if (browser) await browser.close();
        return null;
    }
}

// ──────────────────────────────────────────────────────────
// SINCRONIZACIÓN PRINCIPAL DE SERIES
// ──────────────────────────────────────────────────────────

async function syncSeries() {
    console.log('\n============================================');
    console.log('📺 SINCRO DE SERIES Y EPISODIOS NUEVOS');
    console.log('============================================');

    const chromePath = getChromePath();
    console.log(`Chrome: ${chromePath || 'auto-detect'}`);

    let html;
    try {
        html = await fetchHtml('https://cuevana3i.sbs/series');
    } catch (e) {
        console.error('Error al obtener catálogo de series:', e.message);
        return;
    }

    // Capturar links de series actualizadas en portada (página 1 de /series)
    const regexSeries = /href=["']?([^"'\s>]*\/serie\/([^"'\s>\/]+))["']?/g;
    let match;
    const seriesList = [];
    while ((match = regexSeries.exec(html)) !== null) {
        let url = match[1];
        const slug = match[2];
        if (!url.startsWith('http')) url = 'https://cuevana3i.sbs' + url;
        if (!seriesList.some(s => s.slug === slug)) {
            seriesList.push({ url, slug });
        }
    }
    console.log(`Encontradas ${seriesList.length} series en portada.`);

    const candidates = [];
    for (const series of seriesList) {
        console.log(`🔍 Escaneando episodios de la serie: '${series.slug}'...`);
        const episodes = await getSeriesEpisodes(series.url, series.slug, chromePath);
        console.log(`  Encontrados ${episodes.length} episodios en total.`);
        
        // Filtrar y guardar candidatos
        for (const ep of episodes) {
            if (!candidates.some(c => c.seriesSlug === ep.seriesSlug && c.season === ep.season && c.episode === ep.episode)) {
                candidates.push(ep);
            }
        }
    }
    
    console.log(`\nTotal candidatos a verificar en la DB: ${candidates.length} episodios.`);

    let added = 0;
    let skipped = 0;
    let failed = 0;

    for (const candidate of candidates) {
        if (added >= 5) {
            console.log("⚠️ Se alcanzó el límite de 5 episodios agregados por ejecución. Terminando...");
            break;
        }
        // a) Verificar si el episodio ya existe
        const epCheck = await makeSupabaseRequest(
            `premium_episodes?series_id=eq.${candidate.seriesSlug}&season_number=eq.${candidate.season}&number=eq.${candidate.episode}`,
            'GET'
        );
        if (epCheck.data && epCheck.data.length > 0) {
            console.log(`⏭️  S${candidate.season}E${candidate.episode} de '${candidate.seriesSlug}' ya existe. Saltando...`);
            skipped++;
            continue;
        }

        console.log(`\n⚡ Nuevo: S${candidate.season}E${candidate.episode} — '${candidate.seriesSlug}'`);

        // b) Asegurar que la serie exista en premium_series
        const seriesCheck = await makeSupabaseRequest(`premium_series?id=eq.${candidate.seriesSlug}`, 'GET');
        let isNewSeries = false;
        if (!seriesCheck.data || seriesCheck.data.length === 0) {
            isNewSeries = true;
            console.log(`🆕 Creando entrada de serie: '${candidate.seriesSlug}'...`);
            const seriesUrl = `https://cuevana3i.sbs/serie/${candidate.seriesSlug}`;
            const sMeta = await scrapeSeriesMetadata(seriesUrl, chromePath);

            if (sMeta && sMeta.title) {
                const seriesRecord = {
                    id: candidate.seriesSlug,
                    title: sMeta.title,
                    poster: sMeta.poster || 'https://cuevana3i.sbs/cuevana3.png',
                    backdrop: sMeta.backdrop || sMeta.poster || 'https://cuevana3i.sbs/cuevana3.png',
                    year: sMeta.year || new Date().getFullYear(),
                    description: sMeta.description || '',
                    genres: sMeta.genres || [],
                    cast: '',
                    rating: sMeta.rating || null
                };
                await makeSupabaseRequest('premium_series', 'POST', seriesRecord);
                console.log(`✅ Serie '${sMeta.title}' creada.`);
            } else {
                console.log('⚠️  Sin metadatos de serie. Usando placeholder mínimo...');
                const seriesRecord = {
                    id: candidate.seriesSlug,
                    title: candidate.seriesSlug.replace(/-/g, ' '),
                    poster: 'https://cuevana3i.sbs/cuevana3.png',
                    backdrop: 'https://cuevana3i.sbs/cuevana3.png',
                    year: new Date().getFullYear(),
                    description: '',
                    genres: [],
                    cast: '',
                    rating: null
                };
                await makeSupabaseRequest('premium_series', 'POST', seriesRecord);
            }

            // Disparar workflow de descarga completa de la serie en background
            try {
                const ghToken = process.env.GITHUB_TOKEN;
                if (ghToken) {
                    const targetUrl = `https://cuevana3i.sbs/serie/${candidate.seriesSlug}`;
                    const cmd = `gh workflow run download_series.yml -f series_url="${targetUrl}" -f seasons="all" -f episodes="all"`;
                    execSync(cmd, { env: { ...process.env, GH_TOKEN: ghToken }, stdio: 'inherit' });
                    console.log(`🚀 Workflow de descarga completa disparado para '${candidate.seriesSlug}'.`);
                } else {
                    console.log('⚠️  GITHUB_TOKEN no disponible. No se disparó la descarga completa.');
                }
            } catch (triggerErr) {
                console.error(`❌ Error al disparar workflow:`, triggerErr.message);
            }
        }

        // Si la serie es nueva, la descarga completa ya se mandó → saltar episodio individual
        if (isNewSeries) {
            console.log(`⏭️  Serie nueva, ya mandada a descargar completa. Saltando episodio individual.`);
            continue;
        }

        // c) Descargar el episodio
        let epHtml;
        try { epHtml = await fetchHtml(candidate.epUrl); }
        catch (e) { console.error('Error al obtener HTML del episodio:', e.message); failed++; continue; }

        const regexServer = /data-server="([^"]+)"/g;
        let matchServer;
        const playerUrls = [];
        while ((matchServer = regexServer.exec(epHtml)) !== null) {
            const dec = decryptToken(matchServer[1]);
            if (dec && !playerUrls.includes(dec)) playerUrls.push(dec);
        }

        let success = false;
        for (const playerUrl of playerUrls) {
            const streams = await extractM3u8(playerUrl, chromePath);
            if (streams && streams.length > 0) {
                const filename = `${candidate.seriesSlug}_S${candidate.season}E${candidate.episode}.mp4`;
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

                        if (fs.existsSync(filename)) fs.unlinkSync(filename);
                        const epRecord = {
                            series_id: candidate.seriesSlug,
                            season_number: candidate.season,
                            number: candidate.episode,
                            title: `Episodio ${candidate.episode}`,
                            url: `${R2_PUBLIC_URL}/${filename}`,
                            duration: '45m',
                            description: `Temporada ${candidate.season} - Episodio ${candidate.episode}`,
                            created_at: new Date().toISOString()
                        };
                        const res = await makeSupabaseRequest('premium_episodes', 'POST', epRecord);
                        if (res.status === 201 || res.status === 200 || res.status === 204) {
                            console.log(`🎉 S${candidate.season}E${candidate.episode} registrado.`);
                            success = true;
                            added++;
                            break;
                        } else {
                            console.error(`❌ Error al registrar episodio en Supabase (status ${res.status}):`, res.data);
                        }
                    } catch (err) { console.error('Error al subir/registrar episodio:', err.message); }
                }
            }
        }
        if (!success) { console.log(`❌ Falló S${candidate.season}E${candidate.episode} de '${candidate.seriesSlug}'.`); failed++; }
    }

    console.log('\n============================================');
    console.log('📊 RESUMEN SERIES:');
    console.log(`  ✅ Agregados:  ${added}`);
    console.log(`  ⏭️  Existentes: ${skipped}`);
    console.log(`  ❌ Fallidos:   ${failed}`);
    console.log('============================================');
}

syncSeries().catch(console.error);
