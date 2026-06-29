const puppeteer = require('puppeteer-core');
const https = require('https');
const { spawn, execSync } = require('child_process');
const os = require('os');
const fs = require('fs');

// Configuración de descifrado del sitio
const XOR_KEY = 'a45f04ce-2394-47c3-b718-0ecd97ce51d6';
const SERVERS = {
    '1': 'https://tiktokshopping.xyz/v/',
    '2': 'https://filemoon.sx/e/',
    '3': 'https://martinshop.xyz/e/',
    '4': 'https://dood.li/e/'
};

const SUPABASE_URL = process.env.SUPABASE_PREMIUM_URL || 'https://temrkymyquqjayxpfifk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PREMIUM_ANON_KEY || 'sb_publishable_ZyScqqMR8DOPPZAHYNXLfw_c-4Ouea3';

const R2_PUBLIC_URL = 'https://pub-77522f1e717f46bead2250b84f1ca547.r2.dev';

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

async function extractM3u8(playerUrl) {
    console.log(`\n[Puppeteer] Abriendo el reproductor: ${playerUrl}...`);
    let browser;
    try {
        browser = await puppeteer.connect({
            browserURL: 'http://127.0.0.1:9222',
            defaultViewport: null
        });
        console.log('🤖 Conectado a Chrome existente en el puerto 9222.');
    } catch (err) {
        const chromePath = getChromePath();
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
        await page.goto(playerUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (e) {
        // Ignorar timeouts
    }

    await new Promise(resolve => setTimeout(resolve, 5000));

    if (streams.length === 0) {
        console.log('[Puppeteer] Intentando simular clicks...');
        try {
            await page.evaluate(() => {
                const elements = [
                    document.querySelector('video'),
                    document.querySelector('.jw-video'),
                    document.querySelector('.jw-display-icon-container'),
                    document.querySelector('.play-button'),
                    document.body
                ];
                for (const el of elements) {
                    if (el) el.click();
                }
            });
            const width = await page.evaluate(() => window.innerWidth);
            const height = await page.evaluate(() => window.innerHeight);
            await page.mouse.click(width / 2, height / 2);
            await new Promise(resolve => setTimeout(resolve, 8000));
        } catch (e) {
            console.log('Error al simular clicks:', e.message);
        }
    }

    await page.close();
    if (browser.process() !== null) {
        await browser.close();
    } else {
        await browser.disconnect();
    }
    return streams;
}

function downloadAndRemux(stream, playerUrl, filename) {
    return new Promise((resolve, reject) => {
        const referer = playerUrl.split('/e/')[0] + '/';
        const tempTs = 'temp_episode.ts';
        console.log(`\n📥 Descargando HLS a TS: ${tempTs}...`);
        
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

function uploadToR2(filename) {
    console.log(`🤖 Ejecutando script de subida a R2 para: ${filename}...`);
    try {
        execSync(`python upload_to_r2.py "${filename}"`, { stdio: 'inherit' });
        return true;
    } catch (e) {
        console.error("❌ Falló la subida a R2:", e.message);
        return false;
    }
}

function registerSeriesToSupabase(seriesData) {
    return new Promise((resolve, reject) => {
        const url = `${SUPABASE_URL}/rest/v1/premium_series`;
        const data = JSON.stringify(seriesData);
        
        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Prefer': 'resolution=merge-duplicates'
            }
        }, (res) => {
            res.on('end', () => resolve(true));
            res.resume();
        });
        
        req.on('error', () => resolve(false));
        req.write(data);
        req.end();
    });
}

function registerEpisodeToSupabase(episodeData) {
    return new Promise((resolve, reject) => {
        const url = `${SUPABASE_URL}/rest/v1/premium_episodes`;
        const data = JSON.stringify(episodeData);
        
        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Prefer': 'resolution=merge-duplicates'
            }
        }, (res) => {
            res.on('end', () => resolve(true));
            res.resume();
        });
        
        req.on('error', () => resolve(false));
        req.write(data);
        req.end();
    });
}

function checkEpisodeExists(seriesId, season, episodeNum) {
    return new Promise((resolve) => {
        const url = `${SUPABASE_URL}/rest/v1/premium_episodes?series_id=eq.${encodeURIComponent(seriesId)}&season_number=eq.${season}&number=eq.${episodeNum}`;
        https.get(url, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed && parsed.length > 0);
                } catch(e) {
                    resolve(false);
                }
            });
        }).on('error', () => resolve(false));
    });
}

// Extrae metadatos de la serie
async function getSeriesMetadata(seriesUrl, seriesSlug) {
    console.log(`\n🔍 Obteniendo metadatos de la serie...`);
    try {
        const html = await fetchHtml(seriesUrl);
        
        // 1. Título
        let title = seriesSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
        if (titleMatch) {
            title = titleMatch[1].replace('Serie', '').trim();
        }
        
        // 2. Poster y Backdrop
        let poster = '';
        let backdrop = '';
        const imgTags = reFindAll(html, /<img[^>]*src=["']?([^"'\s>]+)["']?/g);
        const tmdbPoster = imgTags.find(img => img.includes('image.tmdb.org/t/p/w1280/') || img.includes('image.tmdb.org/t/p/w200/'));
        if (tmdbPoster) {
            poster = tmdbPoster;
            backdrop = tmdbPoster;
        }
        
        // 3. Resumen
        let description = '';
        const descMatch = html.match(/<div class="resumen">([\s\S]*?)<\/div>/) || html.match(/<p class="resumen">([\s\S]*?)<\/p>/);
        if (descMatch) {
            description = descMatch[1].replace(/<[^>]*>/g, '').trim();
        }
        
        // 4. Géneros
        const genres = [];
        const genreRegex = /href=["']?[^"'\s>]*genero=([^"'\s>]+)["']?/g;
        let match;
        while ((match = genreRegex.exec(html)) !== null) {
            const gen = decodeURIComponent(match[1]).trim();
            if (gen && !genres.includes(gen)) genres.push(gen);
        }
        
        // 5. Año
        let year = new Date().getFullYear();
        const yearMatch = html.match(/a?o de estreno<\/h2><p>La primera temporada fue publicada en el a?o (\d{4})/i) || html.match(/(\d{4})/);
        if (yearMatch) {
            year = parseInt(yearMatch[1]);
        }
        
        // 6. Actores
        let cast = '';
        const castMatch = html.match(/Actores<\/h2><p>([\s\S]*?)<\/p>/i);
        if (castMatch) {
            cast = castMatch[1].trim();
        }
        
        return {
            id: seriesSlug,
            title,
            poster,
            backdrop,
            year,
            description,
            genres,
            cast,
            rating: '7.8'
        };
    } catch(e) {
        console.error("Error al extraer metadatos de la serie:", e.message);
        return null;
    }
}

function reFindAll(text, regex) {
    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        matches.push(match[1]);
    }
    return matches;
}

// Procesa una película de serie (Episodio)
async function processEpisode(episodeUrl, seriesId, season, episodeNum) {
    console.log(`\n================================================================`);
    // El nombre de archivo final será limpio
    const filename = `${seriesId}_S${season}E${episodeNum}.mp4`;
    console.log(`📺 PROCESANDO EPISODIO: Temporada ${season}, Episodio ${episodeNum}`);
    console.log(`URL: ${episodeUrl}`);
    console.log(`Archivo destino: ${filename}`);
    console.log(`================================================================`);
    
    // 1. Verificar si ya existe en Supabase
    const exists = await checkEpisodeExists(seriesId, season, episodeNum);
    if (exists) {
        console.log(`⏭️ Episodio ya registrado. Saltando descarga.`);
        return {
            series_id: seriesId,
            season_number: season,
            number: episodeNum,
            title: `Episodio ${episodeNum}`,
            url: `${R2_PUBLIC_URL}/${filename}`
        };
    }
    
    // 2. Extraer reproductores
    let html;
    try {
        html = await fetchHtml(episodeUrl);
    } catch (e) {
        console.error("❌ No se pudo cargar el HTML del episodio:", e.message);
        return null;
    }
    
    const regex = /data-server="([^"]+)"/g;
    let match;
    const playerUrls = [];
    while ((match = regex.exec(html)) !== null) {
        const decrypted = decryptToken(match[1]);
        if (decrypted && !playerUrls.includes(decrypted)) {
            playerUrls.push(decrypted);
        }
    }
    
    if (playerUrls.length === 0) {
        console.log(`⚠️ No se encontraron servidores en el episodio ${season}x${episodeNum}.`);
        return null;
    }
    
    console.log(`Se encontraron ${playerUrls.length} servidores de video.`);
    
    // 3. Intentar extraer de reproductores
    let downloaded = false;
    for (const playerUrl of playerUrls) {
        console.log(`🎯 Extrayendo de: ${playerUrl}`);
        const streams = await extractM3u8(playerUrl);
        if (streams && streams.length > 0) {
            console.log(`✨ Stream capturado: ${streams[0]}`);
            downloaded = await downloadAndRemux(streams[0], playerUrl, filename);
            if (downloaded) break;
        }
    }
    
    if (!downloaded) {
        console.error(`❌ Falló la descarga de este episodio en todos los servidores.`);
        return null;
    }
    
    // 4. Subir a R2
    const uploaded = uploadToR2(filename);
    if (!uploaded) return null;
    
    // Eliminar archivo local
    if (fs.existsSync(filename)) fs.unlinkSync(filename);
    
    const episodeData = {
        series_id: seriesId,
        season_number: season,
        number: episodeNum,
        title: `Episodio ${episodeNum}`,
        url: `${R2_PUBLIC_URL}/${filename}`,
        duration: '45m',
        description: `Temporada ${season} - Episodio ${episodeNum}`
    };
    
    // 5. Registrar en Supabase
    const registered = await registerEpisodeToSupabase(episodeData);
    if (registered) {
        console.log(`✅ Episodio registrado con éxito en la base de datos.`);
        return episodeData;
    } else {
        console.error(`❌ Error al registrar el episodio en Supabase.`);
        return null;
    }
}

async function main() {
    const seriesUrl = process.argv[2];
    const seasonsArg = process.argv[3] || 'all'; // 'all' o '1' o '1,2'
    const episodesArg = process.argv[4] || 'all'; // 'all' o '1' o '1-3'
    
    if (!seriesUrl) {
        console.log('Uso: node cuevana_series_extractor.js [URL_SERIE] [SEASONS_OPCIONAL] [EPISODES_OPCIONAL]');
        console.log('Ejemplos:');
        console.log('  node cuevana_series_extractor.js https://cuevana.you/serie/la-casa-del-dragon all all');
        console.log('  node cuevana_series_extractor.js https://cuevana.you/serie/la-casa-del-dragon 1 1-3');
        process.exit(1);
    }
    
    const seriesSlug = seriesUrl.split('/serie/')[1].split('/')[0];
    console.log(`🤖 Iniciando extractor de series para: ${seriesSlug}`);
    
    // 1. Obtener metadatos de la serie
    const seriesMetadata = await getSeriesMetadata(seriesUrl, seriesSlug);
    if (!seriesMetadata) {
        console.error("❌ No se pudieron obtener metadatos de la serie. Abortando.");
        process.exit(1);
    }
    
    // Registrar serie en Supabase
    console.log(`💾 Registrando serie en la base de datos...`);
    await registerSeriesToSupabase(seriesMetadata);
    
    // 2. Obtener lista de temporadas disponibles
    const html = await fetchHtml(seriesUrl);
    const seasonLinks = sortedUnique(reFindAll(html, /href=["']?([^"'\s>]*(?:temporada-\d+))["']?/g));
    console.log(`Se encontraron ${seasonLinks.length} temporadas disponibles.`);
    
    // Filtrar temporadas según el argumento
    const seasonsFilter = seasonsArg.toLowerCase() === 'all' 
        ? null 
        : seasonsArg.split(',').map(s => parseInt(s.trim()));
        
    for (const seasonLink of seasonLinks) {
        const seasonNum = parseInt(seasonLink.split('temporada-')[1]);
        if (seasonsFilter && !seasonsFilter.includes(seasonNum)) {
            console.log(`⏭️ Saltando Temporada ${seasonNum} por filtro.`);
            continue;
        }
        
        console.log(`\n=========================================`);
        console.log(`📂 PROCESANDO TEMPORADA ${seasonNum}`);
        console.log(`URL de Temporada: ${seasonLink}`);
        console.log(`=========================================`);
        
        // Obtener episodios de la temporada
        const seasonHtml = await fetchHtml(seasonLink);
        const episodeLinks = sortedUnique(reFindAll(seasonHtml, /href=["']?([^"'\s>]*(?:episodio-\d+x\d+))["']?/g));
        console.log(`Se encontraron ${episodeLinks.length} episodios en la Temporada ${seasonNum}.`);
        
        // Parsear filtros de episodios
        let allowedEpisodes = null;
        if (episodesArg.toLowerCase() !== 'all') {
            allowedEpisodes = [];
            if (episodesArg.includes('-')) {
                const parts = episodesArg.split('-');
                const start = parseInt(parts[0]);
                const end = parseInt(parts[1]);
                for (let i = start; i <= end; i++) allowedEpisodes.push(i);
            } else {
                allowedEpisodes = episodesArg.split(',').map(e => parseInt(e.trim()));
            }
        }
        
        // Ordenar episodios por número
        const parsedEpisodes = episodeLinks.map(link => {
            const epCode = link.split('episodio-')[1]; // ej. 1x1
            const parts = epCode.split('x');
            return {
                url: link,
                season: parseInt(parts[0]),
                number: parseInt(parts[1])
            };
        }).sort((a, b) => a.number - b.number);
        
        // Descargar episodios secuencialmente
        for (const ep of parsedEpisodes) {
            if (allowedEpisodes && !allowedEpisodes.includes(ep.number)) {
                console.log(`⏭️ Saltando Episodio ${ep.season}x${ep.number} por filtro.`);
                continue;
            }
            
            await processEpisode(ep.url, seriesSlug, ep.season, ep.number);
        }
    }
    
    console.log(`\n🎉 Extracción de la serie "${seriesMetadata.title}" completada.`);
}

function sortedUnique(arr) {
    return Array.from(new Set(arr)).sort();
}

main();
