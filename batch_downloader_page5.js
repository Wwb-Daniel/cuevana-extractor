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

const SUPABASE_URL = process.env.SUPABASE_PREMIUM_URL || 'https://pdvdnjmqgcprwntabvia.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PREMIUM_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkdmRuam1xZ2NwcndudGFidmlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NTgwNjIsImV4cCI6MjA5ODEzNDA2Mn0.8qcpYfWH9bwDrEQSKzbYvKOqlYpBQmqNWgykTQBXO60';

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
    console.log(`\n[Puppeteer] Abriendo el reproductor: ${playerUrl}...`);
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
        await page.goto(playerUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (e) {
        console.log('Timeout al cargar, continuando...');
    }

    await new Promise(resolve => setTimeout(resolve, 8000));

    if (streams.length === 0) {
        console.log('[Puppeteer] No se detectó stream. Simulando click...');
        try {
            await page.evaluate(() => {
                const el = document.querySelector('video') || document.body;
                if (el) el.click();
            });
            await new Promise(resolve => setTimeout(resolve, 6000));
        } catch (e) {}
    }

    await browser.close();
    return streams;
}

function downloadWithYtdl(stream, playerUrl, filename) {
    return new Promise((resolve) => {
        const referer = new URL(playerUrl).origin + '/';
        const tempTs = `temp_${Date.now()}.ts`;
        console.log(`\n📥 Descargando HLS: ${tempTs}...`);
        
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
                console.log(`\n🔄 Remuxando stream MPEG-TS a MP4 limpio con ffmpeg...`);
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

function generateSlug(text) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

function checkMovieExists(slug) {
    return new Promise((resolve) => {
        const url = `${SUPABASE_URL}/rest/v1/premium_movies?id=eq.${slug}`;
        https.get(url, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        }, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    resolve(Array.isArray(data) && data.length > 0);
                } catch (e) {
                    resolve(false);
                }
            });
        }).on('error', () => resolve(false));
    });
}

function insertMovieToSupabase(record) {
    return new Promise((resolve) => {
        const url = `${SUPABASE_URL}/rest/v1/premium_movies`;
        const options = {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            }
        };
        const req = https.request(url, options, (res) => {
            resolve(res.statusCode === 201 || res.statusCode === 200 || res.statusCode === 204);
        });
        req.on('error', () => resolve(false));
        req.write(JSON.stringify(record));
        req.end();
    });
}

async function scrapeMoviePage(movieUrl, chromePath) {
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
            
            const imgs = Array.from(document.querySelectorAll('img'));
            const posterImg = imgs.find(img => img.src && img.src.includes('image.tmdb.org/t/p/w200/'));
            const backdropImg = imgs.find(img => img.src && img.src.includes('image.tmdb.org/t/p/w1280/'));
            const poster = posterImg ? posterImg.src : '';
            const backdrop = backdropImg ? backdropImg.src : (posterImg ? posterImg.src : '');
            
            const genres = [];
            document.querySelectorAll('a').forEach(el => {
                if (el.href && el.href.includes('genero=')) genres.push(el.innerText.trim());
            });
            
            let year = 2026;
            document.querySelectorAll('p, span, div').forEach(el => {
                const text = el.innerText || '';
                const match = text.match(/\b(202\d|201\d|200\d)\b/);
                if (match) year = parseInt(match[1]);
            });
            
            let duration = '1h 45m';
            document.querySelectorAll('p, span, div').forEach(el => {
                const text = el.innerText || '';
                if (text.includes('m') && (text.includes('h') || text.match(/\b\d+\s*min/))) {
                    duration = text.trim();
                }
            });
            
            return { title, description, poster, backdrop, genres, duration, year };
        });
        
        await browser.close();
        return metadata;
    } catch (e) {
        console.error("Error al extraer metadatos:", e.message);
        if (browser) await browser.close();
        return null;
    }
}

async function startBatch() {
    const chromePath = getChromePath();
    console.log(`📍 Iniciando Batch Scraper 2026 - PÁGINA 5. Chrome: ${chromePath}`);
    
    console.log("🔍 Escaneando página 5 de cuevana3i.you...");
    let pageHtml;
    try {
        pageHtml = await fetchHtml('https://cuevana3i.you/peliculas?page=5');
    } catch (e) {
        console.error("Error al descargar página 5:", e.message);
        process.exit(1);
    }
    
    const regexLink = /href=["']?([^"'\s>]*\/pelicula\/[^"'\s>]+)["']?[^>]*>[\s\S]*?<div class="item-detail"><p>([^<]+)<\/p><\/div>/g;
    let match;
    const candidates = [];
    
    while ((match = regexLink.exec(pageHtml)) !== null) {
        let url = match[1];
        const title = match[2].trim();
        
        if (!url.startsWith('http')) {
            url = 'https://cuevana3i.you' + url;
        }
        
        if (!candidates.some(c => c.url === url)) {
            candidates.push({ url, title });
        }
    }
    
    console.log(`📋 Se encontraron ${candidates.length} películas en la Página 5.`);
    
    let downloadedCount = 0;
    const limit = 20;
    
    for (const candidate of candidates) {
        if (downloadedCount >= limit) {
            console.log(`\n🎯 Límite de ${limit} películas alcanzado.`);
            break;
        }
        
        const slug = generateSlug(candidate.title || candidate.url.split('/').pop());
        console.log(`\n================================================================`);
        console.log(`🎬 Procesando Película: ${candidate.title || slug}`);
        console.log(`================================================================`);
        
        const exists = await checkMovieExists(slug);
        if (exists) {
            console.log(`⏭️ La película '${candidate.title}' ya existe en la base de datos. Saltando...`);
            continue;
        }
        
        const metadata = await scrapeMoviePage(candidate.url, chromePath);
        if (!metadata || !metadata.title) {
            console.log(`⚠️ No se pudieron obtener los metadatos para: ${candidate.url}. Saltando...`);
            continue;
        }
        
        console.log("Metadatos extraídos con éxito:");
        console.log(`- Título: ${metadata.title}`);
        console.log(`- Duración: ${metadata.duration}`);
        console.log(`- Año: ${metadata.year}`);
        console.log(`- Géneros: ${metadata.genres.join(', ')}`);
        
        let movieHtml;
        try {
            movieHtml = await fetchHtml(candidate.url);
        } catch (e) {
            console.error("Error al obtener HTML de película:", e.message);
            continue;
        }
        
        const regexServer = /data-server="([^"]+)"/g;
        let matchServer;
        const playerUrls = [];
        
        while ((matchServer = regexServer.exec(movieHtml)) !== null) {
            const serverUrl = matchServer[1];
            const decryptedUrl = decryptToken(serverUrl);
            if (decryptedUrl && !playerUrls.includes(decryptedUrl)) {
                playerUrls.push(decryptedUrl);
            }
        }
        
        if (playerUrls.length === 0) {
            console.log("⚠️ No se encontraron servidores de video decodificados. Saltando...");
            continue;
        }
        
        let success = false;
        for (const playerUrl of playerUrls) {
            const streams = await extractM3u8(playerUrl, chromePath);
            if (streams && streams.length > 0) {
                const mainStream = streams[0];
                const cleanTitle = slug.replace(/[^a-zA-Z0-9]/g, '_') + '.mp4';
                
                const downloaded = await downloadWithYtdl(mainStream, playerUrl, cleanTitle);
                if (downloaded) {
                    console.log(`📤 Subiendo '${cleanTitle}' a Cloudflare R2...`);
                    try {
                        execSync(`python upload_to_r2.py "${cleanTitle}"`, { stdio: 'inherit' });
                        fs.unlinkSync(cleanTitle);
                        console.log(`🗑️ Archivo local '${cleanTitle}' eliminado.`);
                        
                        const publicUrl = `https://pub-77522f1e717f46bead2250b84f1ca547.r2.dev/${cleanTitle}`;
                        const movieRecord = {
                            id: slug,
                            title: metadata.title,
                            url: publicUrl,
                            poster: metadata.poster || 'https://cuevana3i.you/cuevana3.png',
                            backdrop: metadata.backdrop || metadata.poster || 'https://cuevana3i.you/cuevana3.png',
                            year: metadata.year || 2026,
                            duration: metadata.duration,
                            genres: metadata.genres,
                            cast: '',
                            description: metadata.description || 'Sin descripción disponible.',
                            rating: '4.5 IMDb',
                            quality: '4K Ultra HD',
                            is_featured: false,
                            created_at: '2026-03-01T00:00:00.000Z'
                        };
                        
                        const inserted = await insertMovieToSupabase(movieRecord);
                        if (inserted) {
                            console.log(`🎉 Película '${metadata.title}' procesada, subida y registrada con éxito al final de la lista.`);
                            downloadedCount++;
                            success = true;
                            break;
                        }
                    } catch (uploadError) {
                        console.error("❌ Error durante la subida o registro:", uploadError.message);
                    }
                }
            }
        }
        
        if (!success) {
            console.log(`❌ No se pudo descargar la película '${candidate.title}' en ningún servidor.`);
        }
    }
    
    console.log(`\n🎉 Lote de página 5 completado. Total de películas descargadas en este lote: ${downloadedCount}`);
}

startBatch();
