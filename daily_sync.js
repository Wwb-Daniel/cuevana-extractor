const puppeteer = require('puppeteer-core');
const os = require('os');
const fs = require('fs');
const https = require('https');
const { spawn, execSync } = require('child_process');

const XOR_KEY = 'a45f04ce-2394-47c3-b718-0ecd97ce51d6';
const SERVERS = {
    '1': 'https://tiktokshopping.xyz/v/',
    '2': 'https://filemoon.sx/e/',
    '3': 'https://martinshop.xyz/e/',
    '4': 'https://dood.li/e/'
};

const SUPABASE_URL = process.env.SUPABASE_PREMIUM_URL || 'https://temrkymyquqjayxpfifk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PREMIUM_ANON_KEY || 'sb_publishable_ZyScqqMR8DOPPZAHYNXLfw_c-4Ouea3';

function getChromePath() {
    if (os.platform() === 'win32') {
        const paths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
        ];
        for (const p of paths) {
            if (fs.existsSync(p)) return p;
        }
    } else if (os.platform() === 'linux') {
        const paths = [
            '/usr/bin/google-chrome',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser'
        ];
        for (const p of paths) {
            if (fs.existsSync(p)) return p;
        }
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
            const encodedVideo = tokenString.split('v=')[1].split('&')[0];
            return Buffer.from(encodedVideo, 'base64').toString('utf-8');
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function extractM3u8(playerUrl, chromePath) {
    console.log(`[Puppeteer] Abriendo el reproductor: ${playerUrl}...`);
    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: chromePath || undefined,
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ]
        });
    } catch (err) {
        console.error("Error al iniciar Puppeteer:", err.message);
        return [];
    }

    const page = await browser.newPage();
    const streams = [];

    page.on('request', request => {
        const url = request.url();
        if (url.includes('.m3u8') || url.includes('.mp4') || url.includes('.m4s') || url.includes('playlist') || url.includes('master')) {
            if (!streams.includes(url)) {
                streams.push(url);
                console.log(`✨ [Capturado] URL de Stream encontrada: ${url}`);
            }
        }
    });

    try {
        await page.goto(playerUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        await new Promise(resolve => setTimeout(resolve, 8000));
        
        await page.evaluate(() => {
            const el = document.querySelector('video') || document.body;
            if (el) el.click();
        });
        await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (e) {
        console.log('[Puppeteer] Timeout o error en navegación de reproductor:', e.message);
    } finally {
        await browser.close();
    }
    return streams;
}

function downloadAndRemux(stream, playerUrl, filename) {
    return new Promise((resolve, reject) => {
        const referer = playerUrl.split('/e/')[0] + '/';
        const tempTs = `temp_${Date.now()}.ts`;
        console.log(`\n📥 Descargando HLS a TS temporal: ${tempTs}...`);
        
        const args = [
            '--no-update',
            '--referer', referer,
            '--extractor-args', 'generic:impersonate',
            '-o', tempTs,
            stream
        ];
        
        const child = spawn('yt-dlp', args, { stdio: 'inherit' });
        
        child.on('close', (code) => {
            if (code === 0) {
                console.log(`\n🔄 Remuxando con ffmpeg + faststart a ${filename}...`);
                try {
                    let isFakePng = false;
                    try {
                        const fd = fs.openSync(tempTs, 'r');
                        const header = Buffer.alloc(4);
                        fs.readSync(fd, header, 0, 4, 0);
                        fs.closeSync(fd);
                        isFakePng = (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47);
                    } catch (readErr) {
                        console.log("Error leyendo cabecera del archivo temporal:", readErr.message);
                    }

                    if (isFakePng) {
                        console.log("Detectada firma PNG falsa en los segmentos. Forzando demuxer mpegts...");
                        execSync(`ffmpeg -y -f mpegts -i "${tempTs}" -c copy -movflags +faststart "${filename}"`, { stdio: 'inherit' });
                    } else {
                        console.log("Formato estándar detectado (auto-detect)...");
                        execSync(`ffmpeg -y -i "${tempTs}" -c copy -movflags +faststart "${filename}"`, { stdio: 'inherit' });
                    }
                    console.log(`✅ Remuxing exitoso.`);
                    if (fs.existsSync(tempTs)) fs.unlinkSync(tempTs);
                    resolve(true);
                } catch (err) {
                    console.error(`❌ Error al remuxar con ffmpeg:`, err.message);
                    if (fs.existsSync(tempTs)) fs.unlinkSync(tempTs);
                    resolve(false);
                }
            } else {
                console.error(`❌ Error en yt-dlp. Código: ${code}`);
                if (fs.existsSync(tempTs)) fs.unlinkSync(tempTs);
                resolve(false);
            }
        });
    });
}

// REST API Helpers
function makeSupabaseRequest(path, method, data = null) {
    return new Promise((resolve) => {
        const url = `${SUPABASE_URL}/rest/v1/${path}`;
        const options = {
            method: method,
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        };
        if (method === 'POST') {
            options.headers['Prefer'] = 'resolution=merge-duplicates';
        }
        
        const req = https.request(url, options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: body ? JSON.parse(body) : [] });
                } catch (e) {
                    resolve({ status: res.statusCode, data: [] });
                }
            });
        });
        req.on('error', (e) => {
            resolve({ status: 500, error: e.message });
        });
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

const generateSlug = (title) => {
    return title
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

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
            const paragraphs = Array.from(document.querySelectorAll('p'));
            const descriptionEl = paragraphs.find(p => p.innerText && p.innerText.trim().length > 100);
            const description = descriptionEl ? descriptionEl.innerText.trim() : '';
            
            const imgs = Array.from(document.querySelectorAll('img'));
            const posterImg = imgs.find(img => img.src && img.src.includes('image.tmdb.org/t/p/w200/'));
            const backdropImg = imgs.find(img => img.src && img.src.includes('image.tmdb.org/t/p/w1280/'));
            
            const poster = posterImg ? posterImg.src : '';
            const backdrop = backdropImg ? backdropImg.src : (posterImg ? posterImg.src : '');
            
            const genres = [];
            document.querySelectorAll('a').forEach(el => {
                if (el.href && el.href.includes('genero=')) genres.push(el.innerText.trim());
            });
            
            let year = new Date().getFullYear();
            document.querySelectorAll('p, span, div').forEach(el => {
                const text = el.innerText || '';
                const match = text.match(/\b(202\d)\b/);
                if (match) year = parseInt(match[1]);
            });
            
            return { title, description, poster, backdrop, genres, year };
        });
        
        await browser.close();
        return metadata;
    } catch (e) {
        console.error("Error al extraer metadatos de serie:", e.message);
        if (browser) await browser.close();
        return null;
    }
}

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
            const paragraphs = Array.from(document.querySelectorAll('p'));
            const descriptionEl = paragraphs.find(p => p.innerText && p.innerText.trim().length > 100);
            const description = descriptionEl ? descriptionEl.innerText.trim() : '';
            
            const imgs = Array.from(document.querySelectorAll('img'));
            const posterImg = imgs.find(img => img.src && img.src.includes('image.tmdb.org/t/p/w200/'));
            const backdropImg = imgs.find(img => img.src && img.src.includes('image.tmdb.org/t/p/w1280/'));
            
            const poster = posterImg ? posterImg.src : '';
            const backdrop = backdropImg ? backdropImg.src : (posterImg ? posterImg.src : '');
            
            const genres = [];
            document.querySelectorAll('a').forEach(el => {
                if (el.href && el.href.includes('genero=')) genres.push(el.innerText.trim());
            });
            
            let duration = '1h 45m';
            document.querySelectorAll('p, span, div').forEach(el => {
                const text = el.innerText || '';
                const match = text.match(/\b(\d+h\s*\d*m)\b/);
                if (match) duration = match[1];
            });
            
            let year = new Date().getFullYear();
            document.querySelectorAll('p, span, div').forEach(el => {
                const text = el.innerText || '';
                const match = text.match(/\b(202\d)\b/);
                if (match) year = parseInt(match[1]);
            });
            
            return { title, description, poster, backdrop, genres, duration, year };
        });
        
        await browser.close();
        return metadata;
    } catch (e) {
        console.error("Error al extraer metadatos de película:", e.message);
        if (browser) await browser.close();
        return null;
    }
}

async function syncMovies(chromePath) {
    console.log("\n==========================================");
    console.log("🎬 INICIANDO SINCRO DE PELÍCULAS NUEVAS");
    console.log("==========================================");
    
    let html;
    try {
        html = await fetchHtml('https://cuevana.you/peliculas');
    } catch (e) {
        console.error("Error al obtener catálogo de películas:", e.message);
        return;
    }
    
    const regexLink = /href=["']?([^"'\s>]*\/pelicula\/[^"'\s>]+)["']?[^>]*>[\s\S]*?<div class="item-detail"><p>([^<]+)<\/p><\/div>/g;
    let match;
    const candidates = [];
    
    while ((match = regexLink.exec(html)) !== null) {
        let url = match[1];
        const title = match[2].trim();
        if (!url.startsWith('http')) url = 'https://cuevana.you' + url;
        if (!candidates.some(c => c.url === url)) {
            candidates.push({ url, title });
        }
    }
    
    console.log(`Se encontraron ${candidates.length} películas en portada.`);
    
    for (const candidate of candidates) {
        const slug = generateSlug(candidate.title || candidate.url.split('/').pop());
        
        // Verificar existencia en DB
        const check = await makeSupabaseRequest(`premium_movies?id=eq.${slug}`, 'GET');
        if (check.data && check.data.length > 0) {
            console.log(`⏭️ La película '${candidate.title}' ya existe. Saltando...`);
            continue;
        }
        
        console.log(`📥 Procesando nueva película: ${candidate.title}`);
        
        // Obtener metadatos
        const metadata = await scrapeMovieMetadata(candidate.url, chromePath);
        if (!metadata || !metadata.title) {
            console.log("⚠️ Falló extracción de metadatos. Saltando...");
            continue;
        }
        
        // Obtener reproductores
        let movieHtml;
        try {
            movieHtml = await fetchHtml(candidate.url);
        } catch (e) {
            console.error("Error al obtener reproductores:", e.message);
            continue;
        }
        
        const regexServer = /data-server="([^"]+)"/g;
        let matchServer;
        const playerUrls = [];
        while ((matchServer = regexServer.exec(movieHtml)) !== null) {
            const decrypted = decryptToken(matchServer[1]);
            if (decrypted && !playerUrls.includes(decrypted)) playerUrls.push(decrypted);
        }
        
        let success = false;
        for (const playerUrl of playerUrls) {
            const streams = await extractM3u8(playerUrl, chromePath);
            if (streams && streams.length > 0) {
                const cleanTitle = slug.replace(/[^a-zA-Z0-9]/g, '_') + '.mp4';
                const downloaded = await downloadAndRemux(streams[0], playerUrl, cleanTitle);
                
                if (downloaded) {
                    console.log(`📤 Subiendo '${cleanTitle}' a Cloudflare R2...`);
                    try {
                        execSync(`python upload_to_r2.py "${cleanTitle}"`, { stdio: 'inherit' });
                        if (fs.existsSync(cleanTitle)) fs.unlinkSync(cleanTitle);
                        
                        const movieRecord = {
                            id: slug,
                            title: metadata.title,
                            url: `https://pub-77522f1e717f46bead2250b84f1ca547.r2.dev/${cleanTitle}`,
                            poster: metadata.poster || 'https://cuevana.you/cuevana3.png',
                            backdrop: metadata.backdrop || metadata.poster || 'https://cuevana.you/cuevana3.png',
                            year: metadata.year || new Date().getFullYear(),
                            duration: metadata.duration,
                            genres: metadata.genres,
                            cast: '',
                            description: metadata.description || 'Sin descripción disponible.',
                            rating: '4.5 IMDb',
                            quality: '4K Ultra HD',
                            is_featured: false,
                            created_at: new Date().toISOString()
                        };
                        
                        const res = await makeSupabaseRequest('premium_movies', 'POST', movieRecord);
                        if (res.status === 201 || res.status === 200 || res.status === 204) {
                            console.log(`🎉 Película '${metadata.title}' registrada con éxito.`);
                            success = true;
                            break;
                        }
                    } catch (err) {
                        console.error("Error al subir o registrar película:", err.message);
                    }
                }
            }
        }
        if (!success) {
            console.log(`❌ No se pudo descargar la película '${candidate.title}' en ningún servidor.`);
        }
    }
}

async function syncSeriesAndEpisodes(chromePath) {
    console.log("\n==========================================");
    console.log("📺 INICIANDO SINCRO DE SERIES Y CAPÍTULOS");
    console.log("==========================================");
    
    let html;
    try {
        html = await fetchHtml('https://cuevana.you/episodios/recientes');
    } catch (e) {
        console.error("Error al obtener lista de episodios recientes:", e.message);
        return;
    }
    
    // Captura links con formato: /serie/<slug>/episodio-<season>x<episode>
    const regexEp = /href=["']?([^"'\s>]*\/serie\/([^"'\s>]+)\/episodio-(\d+)x(\d+))["']?/g;
    let match;
    const candidates = [];
    
    while ((match = regexEp.exec(html)) !== null) {
        const epUrl = match[1];
        const seriesSlug = match[2];
        const season = parseInt(match[3]);
        const episode = parseInt(match[4]);
        
        if (!candidates.some(c => c.seriesSlug === seriesSlug && c.season === season && c.episode === episode)) {
            candidates.push({ epUrl, seriesSlug, season, episode });
        }
    }
    
    console.log(`Se encontraron ${candidates.length} episodios recientes en la lista.`);
    
    for (const candidate of candidates) {
        // a. Verificar si el episodio ya existe
        const epCheck = await makeSupabaseRequest(`premium_episodes?series_id=eq.${candidate.seriesSlug}&season_number=eq.${candidate.season}&number=eq.${candidate.episode}`, 'GET');
        if (epCheck.data && epCheck.data.length > 0) {
            console.log(`⏭️ S${candidate.season}E${candidate.episode} de '${candidate.seriesSlug}' ya existe. Saltando...`);
            continue;
        }
        
        console.log(`\n⚡ Nuevo Episodio Detectado: S${candidate.season}E${candidate.episode} de '${candidate.seriesSlug}'`);
        
        // b. Asegurar existencia de la serie en la tabla premium_series
        const seriesCheck = await makeSupabaseRequest(`premium_series?id=eq.${candidate.seriesSlug}`, 'GET');
        let isNewSeries = false;
        if (!seriesCheck.data || seriesCheck.data.length === 0) {
            isNewSeries = true;
            console.log(`🆕 Creando nueva serie en DB: '${candidate.seriesSlug}'...`);
            const seriesUrl = `https://cuevana.you/serie/${candidate.seriesSlug}`;
            const sMeta = await scrapeSeriesMetadata(seriesUrl, chromePath);
            if (sMeta && sMeta.title) {
                const seriesRecord = {
                    id: candidate.seriesSlug,
                    title: sMeta.title,
                    poster: sMeta.poster || 'https://cuevana.you/cuevana3.png',
                    backdrop: sMeta.backdrop || sMeta.poster || 'https://cuevana.you/cuevana3.png',
                    year: sMeta.year || new Date().getFullYear(),
                    description: sMeta.description || 'Sin descripción disponible.',
                    genres: sMeta.genres || [],
                    cast: '',
                    rating: '7.8'
                };
                await makeSupabaseRequest('premium_series', 'POST', seriesRecord);
                console.log(`✅ Serie '${sMeta.title}' creada con éxito.`);
            } else {
                console.log("⚠️ No se pudieron obtener metadatos de la serie. Usando placeholders...");
                const seriesRecord = {
                    id: candidate.seriesSlug,
                    title: candidate.seriesSlug.replace(/-/g, ' ').toUpperCase(),
                    poster: 'https://cuevana.you/cuevana3.png',
                    backdrop: 'https://cuevana.you/cuevana3.png',
                    year: new Date().getFullYear(),
                    description: 'Sin descripción.',
                    genres: [],
                    cast: '',
                    rating: '7.8'
                };
                await makeSupabaseRequest('premium_series', 'POST', seriesRecord);
            }

            // Si es una serie nueva, disparar el workflow de descarga completa en segundo plano
            try {
                const ghToken = process.env.GITHUB_TOKEN;
                if (ghToken) {
                    console.log(`🚀 Disparando descarga completa en segundo plano para la nueva serie: ${candidate.seriesSlug}...`);
                    const targetSeriesUrl = `https://cuevana.you/serie/${candidate.seriesSlug}`;
                    const cmd = `gh workflow run download_series.yml -f series_url="${targetSeriesUrl}" -f seasons="all" -f episodes="all"`;
                    execSync(cmd, { env: { ...process.env, GH_TOKEN: ghToken }, stdio: 'inherit' });
                    console.log(`✅ Workflow disparado para ${candidate.seriesSlug}.`);
                } else {
                    console.log("⚠️ GITHUB_TOKEN no disponible en las variables de entorno, no se pudo disparar la descarga completa.");
                }
            } catch (triggerErr) {
                console.error(`❌ Error al disparar workflow de descarga completa:`, triggerErr.message);
            }
        }

        if (isNewSeries) {
            console.log(`⏭️ La serie '${candidate.seriesSlug}' es nueva y ya se mandó a descargar completa en segundo plano. Saltando descarga individual.`);
            continue;
        }
        
        // c. Descargar episodio
        let epHtml;
        try {
            epHtml = await fetchHtml(candidate.epUrl);
        } catch (e) {
            console.error("Error al obtener HTML del episodio:", e.message);
            continue;
        }
        
        const regexServer = /data-server="([^"]+)"/g;
        let matchServer;
        const playerUrls = [];
        while ((matchServer = regexServer.exec(epHtml)) !== null) {
            const decrypted = decryptToken(matchServer[1]);
            if (decrypted && !playerUrls.includes(decrypted)) playerUrls.push(decrypted);
        }
        
        let success = false;
        for (const playerUrl of playerUrls) {
            const streams = await extractM3u8(playerUrl, chromePath);
            if (streams && streams.length > 0) {
                const filename = `${candidate.seriesSlug}_S${candidate.season}E${candidate.episode}.mp4`;
                const downloaded = await downloadAndRemux(streams[0], playerUrl, filename);
                
                if (downloaded) {
                    console.log(`📤 Subiendo '${filename}' a Cloudflare R2...`);
                    try {
                        execSync(`python upload_to_r2.py "${filename}"`, { stdio: 'inherit' });
                        if (fs.existsSync(filename)) fs.unlinkSync(filename);
                        
                        const epRecord = {
                            series_id: candidate.seriesSlug,
                            season_number: candidate.season,
                            number: candidate.episode,
                            title: `Episodio ${candidate.episode}`,
                            url: `https://pub-77522f1e717f46bead2250b84f1ca547.r2.dev/${filename}`,
                            duration: '45m',
                            description: `Temporada ${candidate.season} - Episodio ${candidate.episode}`,
                            created_at: new Date().toISOString()
                        };
                        
                        const res = await makeSupabaseRequest('premium_episodes', 'POST', epRecord);
                        if (res.status === 201 || res.status === 200 || res.status === 204) {
                            console.log(`🎉 Episodio S${candidate.season}E${candidate.episode} registrado con éxito.`);
                            success = true;
                            break;
                        }
                    } catch (err) {
                        console.error("Error al subir o registrar episodio:", err.message);
                    }
                }
            }
        }
        if (!success) {
            console.log(`❌ No se pudo descargar el episodio S${candidate.season}E${candidate.episode} de '${candidate.seriesSlug}'.`);
        }
    }
}

async function startSync() {
    const chromePath = getChromePath();
    console.log(`🚀 INICIANDO SUPER MEGA SYNC ENGINE DIARIO. Chrome: ${chromePath}`);
    
    // 1. Sincronizar series y nuevos capítulos
    await syncSeriesAndEpisodes(chromePath);
    
    // 2. Sincronizar películas nuevas en portada
    await syncMovies(chromePath);
    
    console.log("\n🏁 PROCESO DE SINCRONIZACIÓN DIARIO COMPLETADO.");
}

startSync();
