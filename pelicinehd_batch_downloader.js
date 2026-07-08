const puppeteer = require('puppeteer-core');
const os = require('os');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { spawn, execSync } = require('child_process');

// ============================================================
// PELICINEHD BATCH DOWNLOADER & SYNCER
// Scrapes multiple movies from a PelicineHD catalog page/section,
// bypasses Cloudflare once, downloads missing movies, uploads to R2,
// and registers to Supabase.
// ============================================================

// Cargar variables de entorno local
try {
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
                
                if (key.includes('SUPABASE_PREMIUM_URL')) process.env.SUPABASE_PREMIUM_URL = value;
                if (key.includes('SUPABASE_PREMIUM_ANON_KEY')) process.env.SUPABASE_PREMIUM_ANON_KEY = value;
            }
        });
    }
} catch (e) {}

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

function generateSlug(text) {
    return text.toString().toLowerCase()
        .normalize("NFD").replace(/\p{Diacritic}/gu, "")
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
                } catch (e) { resolve(false); }
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

function downloadAndRemux(stream, referer, filename) {
    return new Promise((resolve) => {
        const tempTs = `temp_${Date.now()}.ts`;
        console.log(`📥 Descargando HLS: ${tempTs}...`);
        
        const args = [
            '--no-update',
            '--referer', referer,
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '--extractor-args', 'generic:impersonate',
            '-o', tempTs,
            stream
        ];
        
        const child = spawn('yt-dlp', args, { stdio: 'inherit' });
        
        child.on('close', (code) => {
            if (code === 0) {
                console.log(`🔄 Remuxando stream MPEG-TS a MP4 limpio...`);
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
                    console.error("Error al remuxar:", err.message);
                    if (fs.existsSync(tempTs)) fs.unlinkSync(tempTs);
                    resolve(false);
                }
            } else {
                console.error("Error en yt-dlp");
                if (fs.existsSync(tempTs)) fs.unlinkSync(tempTs);
                resolve(false);
            }
        });
    });
}

async function run() {
    const args = process.argv.slice(2);
    const targetUrl = args[0] || 'https://pelicinehd.com/';
    
    console.log("================================================================");
    console.log("🎬 PELICINEHD BATCH DOWNLOADER & SYNCER");
    console.log("================================================================");
    console.log(`Origen a escanear: ${targetUrl}`);

    const chromePath = getChromePath();
    if (!chromePath) {
        console.error("❌ No se encontró Chrome.");
        process.exit(1);
    }

    function getBrowserWSEndpoint(port) {
        return new Promise((resolve, reject) => {
            const http = require('http');
            http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const versionInfo = JSON.parse(data);
                        resolve(versionInfo.webSocketDebuggerUrl);
                    } catch (e) { reject(e); }
                });
            }).on('error', reject);
        });
    }

    let browser;
    let isConnectedToExisting = false;
    try {
        console.log("🔗 Intentando conectar a un navegador Google Chrome existente en el puerto 9222...");
        const wsEndpoint = await getBrowserWSEndpoint(9222);
        browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
        console.log("✅ ¡Conectado con éxito a tu navegador Chrome actual!");
        isConnectedToExisting = true;
    } catch (e) {
        console.log("❌ No se detectó Chrome abierto en el puerto 9222. Iniciando navegador nuevo...");
        browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: false,
            ignoreDefaultArgs: ['--enable-automation'],
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-blink-features=AutomationControlled'
            ]
        });
    }

    // Si nos conectamos a un navegador existente, usamos la pestaña activa o creamos una nueva
    let page;
    if (isConnectedToExisting) {
        const pages = await browser.pages();
        page = pages.find(p => p.url().includes('pelicinehd.com')) || pages[0] || await browser.newPage();
    } else {
        page = await browser.newPage();
    }
    
    try {
        console.log("\n🔗 Cargando página de inicio/catálogo...");
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // Cloudflare
        let title = await page.title();
        if (title.includes("momento") || title.includes("moment") || title.includes("Cloudflare")) {
            console.log("\n⚠️ CLOUDFLARE DETECTADO. Resuelve el reto en la ventana del navegador...");
            while (title.includes("momento") || title.includes("moment") || title.includes("Cloudflare")) {
                await new Promise(r => setTimeout(r, 1000));
                title = await page.title();
            }
            console.log("✅ ¡Reto superado!");
            await new Promise(r => setTimeout(r, 3000));
        }

        // Obtener todas las películas de esa sección
        console.log("🔍 Escaneando enlaces de películas...");
        const moviesToScrape = await page.evaluate(() => {
            const list = [];
            document.querySelectorAll('a').forEach(el => {
                const href = el.href;
                if (href && (href.includes('/movies/') || href.includes('/movie/') || href.includes('/pelicula/'))) {
                    // Intentar obtener el título
                    let titleText = el.innerText ? el.innerText.trim() : '';
                    if (!titleText) {
                        const img = el.querySelector('img');
                        if (img && img.alt) titleText = img.alt.trim();
                    }
                    if (!titleText && el.closest('.item')) {
                        const h3 = el.closest('.item').querySelector('h3, .title, .data a');
                        if (h3) titleText = h3.innerText.trim();
                    }
                    if (!titleText && el.closest('article')) {
                        const h2 = el.closest('article').querySelector('h2, h3, .title');
                        if (h2) titleText = h2.innerText.trim();
                    }
                    
                    if (titleText && titleText.length > 1) {
                        if (!list.some(m => m.url === href)) {
                            list.push({ url: href, title: titleText });
                        }
                    }
                }
            });
            return list;
        });

        console.log(`📋 Se encontraron ${moviesToScrape.length} películas disponibles.`);

        let processed = 0;
        const maxMovies = 20;

        for (const movie of moviesToScrape) {
            if (processed >= maxMovies) {
                console.log(`\n🎯 Límite de procesamiento de ${maxMovies} películas alcanzado.`);
                break;
            }

            const slug = generateSlug(movie.title);
            console.log(`\n----------------------------------------------------------------`);
            console.log(`[${processed + 1}/${moviesToScrape.length}] Película: ${movie.title} (${slug})`);
            console.log(`----------------------------------------------------------------`);

            // Verificar duplicado
            const exists = await checkMovieExists(slug);
            if (exists) {
                console.log(`⏭️ Ya existe en base de datos. Saltando...`);
                continue;
            }

            console.log(`🔍 Cargando página de detalles: ${movie.url}...`);
            const streams = [];
            
            // Listener de streams
            const requestListener = (req) => {
                const u = req.url();
                if (u.includes('.m3u8') || u.includes('.mp4') || u.includes('.m4s') || u.includes('playlist') || u.includes('master')) {
                    if (!streams.includes(u)) {
                        streams.push(u);
                        console.log(`✨ Stream capturado: ${u}`);
                    }
                }
            };
            page.on('request', requestListener);

            await page.goto(movie.url, { waitUntil: 'networkidle2', timeout: 45000 });
            await new Promise(r => setTimeout(r, 2000));

            // Metadatos
            const metadata = await page.evaluate(() => {
                const titleEl = document.querySelector('h1, .entry-title, .title');
                const title = titleEl ? titleEl.innerText.trim() : '';

                let description = '';
                const descEl = document.querySelector('.description, .synopsis, #description, .entry-content p, article p');
                if (descEl) description = descEl.innerText.trim();

                const tmdbImgs = Array.from(document.querySelectorAll('img'))
                    .map(img => img.src)
                    .filter(src => src && src.includes('image.tmdb.org/t/p/'));
                
                let poster = '';
                let backdrop = '';
                
                if (tmdbImgs.length > 0) {
                    const firstTmdb = tmdbImgs[0];
                    const match = firstTmdb.match(/\/t\/p\/[^/]+\/(.+)$/);
                    if (match) {
                        const filename = match[1];
                        poster = `https://image.tmdb.org/t/p/w500/${filename}`;
                        backdrop = `https://image.tmdb.org/t/p/w1280/${filename}`;
                    }
                }

                const genres = [];
                document.querySelectorAll('a').forEach(el => {
                    if (el.href && (el.href.includes('genero=') || el.href.includes('/genre/'))) {
                        genres.push(el.innerText.trim());
                    }
                });

                let year = null;
                const allElements = Array.from(document.querySelectorAll('*'));
                const yearBlock = allElements.find(el => el.innerText && el.innerText.includes('Año'));
                if (yearBlock) {
                    const m = yearBlock.innerText.match(/\b(19\d{2}|20\d{2})\b/);
                    if (m) year = parseInt(m[1]);
                }
                if (!year) {
                    const titleMatch = document.title.match(/\((19\d{2}|20\d{2})\)/);
                    if (titleMatch) year = parseInt(titleMatch[1]);
                }
                if (!year) year = new Date().getFullYear();

                let duration = '1h 45m';
                document.querySelectorAll('p, span, div').forEach(el => {
                    const text = el.innerText || '';
                    const match = text.match(/\b(\d+h\s*\d*m|\d+\s*min)\b/);
                    if (match) {
                        duration = match[1];
                    }
                });

                return { title, description, poster, backdrop, genres, duration, year };
            });

            // Forzar reproducción para capturar stream
            await page.evaluate(() => {
                const playBtn = document.querySelector('.play-box, .play-video, #play-video, .item-server, iframe, video');
                if (playBtn) playBtn.click();
            });

            await new Promise(r => setTimeout(r, 6000));
            page.off('request', requestListener);

            if (streams.length === 0) {
                console.warn("⚠️ No se capturaron streams de video. Continuando con la siguiente...");
                continue;
            }

            const targetStream = streams[0];
            const cleanTitle = `${slug}.mp4`;

            // Descarga
            const downloadSuccess = await downloadAndRemux(targetStream, movie.url, cleanTitle);
            if (!downloadSuccess || !fs.existsSync(cleanTitle)) {
                console.error("❌ Falló la descarga.");
                continue;
            }

            // R2
            console.log(`☁️ Subiendo '${cleanTitle}' a R2...`);
            try {
                execSync(`python upload_to_r2.py "${cleanTitle}"`, { stdio: 'inherit' });
            } catch (e) {
                console.error("❌ Falló subida a R2.");
                if (fs.existsSync(cleanTitle)) fs.unlinkSync(cleanTitle);
                continue;
            }

            // Supabase
            const publicUrl = `${R2_PUBLIC_URL}/${cleanTitle}`;
            const record = [{
                id: slug,
                title: metadata.title || movie.title,
                description: metadata.description,
                poster: metadata.poster,
                backdrop: metadata.backdrop,
                genres: metadata.genres,
                year: metadata.year,
                duration: metadata.duration,
                url: publicUrl,
                created_at: new Date().toISOString()
            }];

            const insertSuccess = await insertMovieToSupabase(record);
            if (insertSuccess) {
                console.log(`✅ ¡Completado y publicado!: ${movie.title}`);
                processed++;
            } else {
                console.error("❌ Error al registrar en Supabase.");
            }

            // Limpieza
            try {
                if (fs.existsSync(cleanTitle)) fs.unlinkSync(cleanTitle);
            } catch (_) {}
        }

        console.log(`\n🏁 Proceso de lote terminado. Procesadas con éxito: ${processed}`);

    } catch (e) {
        console.error("Error general:", e.message);
    } finally {
        if (browser) {
            if (isConnectedToExisting) {
                browser.disconnect();
            } else {
                await browser.close();
            }
        }
    }
}

run();
