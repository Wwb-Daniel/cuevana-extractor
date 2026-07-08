const puppeteer = require('puppeteer-core');
const os = require('os');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { spawn, execSync } = require('child_process');

// ============================================================
// PELICINEHD DOWNLOADER & SYNCER
// Scrapes movie metadata, extracts stream URL, downloads,
// uploads to Cloudflare R2, and saves to Supabase.
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
        console.log(`\n📥 Descargando HLS con yt-dlp: ${tempTs}...`);
        
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
                    console.error("Error al remuxar con ffmpeg:", err.message);
                    if (fs.existsSync(tempTs)) fs.unlinkSync(tempTs);
                    resolve(false);
                }
            } else {
                console.error("Error en la descarga de yt-dlp");
                if (fs.existsSync(tempTs)) fs.unlinkSync(tempTs);
                resolve(false);
            }
        });
    });
}

async function scrapePelicineHD(movieUrl) {
    const chromePath = getChromePath();
    console.log(`Chrome path: ${chromePath}`);
    if (!chromePath) {
        console.error("No se encontró Google Chrome en las rutas estándar.");
        return null;
    }

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: false, // Ojo: false para poder saltar Cloudflare
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    const page = await browser.newPage();
    const streams = [];

    // Capturar URLs de streaming que pasen por la red
    page.on('request', req => {
        const u = req.url();
        if (u.includes('.m3u8') || u.includes('.mp4') || u.includes('.m4s') || u.includes('playlist') || u.includes('master')) {
            if (!streams.includes(u)) {
                streams.push(u);
                console.log(`✨ Stream capturado: ${u}`);
            }
        }
    });

    try {
        console.log(`\n🔗 Navegando a: ${movieUrl}`);
        await page.goto(movieUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // Manejar el reto de Cloudflare si está presente
        let title = await page.title();
        if (title.includes("momento") || title.includes("moment") || title.includes("Cloudflare")) {
            console.log("\n⚠️ Cloudflare detectado. Resuelve el reto en la ventana del navegador...");
            while (title.includes("momento") || title.includes("moment") || title.includes("Cloudflare")) {
                await new Promise(r => setTimeout(r, 2000));
                title = await page.title();
            }
            console.log("✅ ¡Reto superado! Continuando...");
            await new Promise(r => setTimeout(r, 3000));
        }

        // Extraer metadatos
        const metadata = await page.evaluate(() => {
            const titleEl = document.querySelector('h1, .entry-title, .title');
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
                if (el.href && (el.href.includes('genero=') || el.href.includes('/genre/'))) {
                    genres.push(el.innerText.trim());
                }
            });

            // Extraer el año
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
                if (text.includes('m') && (text.includes('h') || text.match(/\b\d+\s*min/))) {
                    duration = text.trim();
                }
            });

            return { title, description, poster, backdrop, genres, duration, year };
        });

        // Intentar activar el reproductor para capturar stream
        console.log("Simulando interacción para reproducir y capturar el stream...");
        
        // Buscar el player o iframe y hacer click
        await page.evaluate(() => {
            const playBtn = document.querySelector('.play-box, .play-video, #play-video, .item-server, iframe, video');
            if (playBtn) playBtn.click();
        });

        await new Promise(r => setTimeout(r, 8000));

        // Cerrar navegador
        await browser.close();

        return { metadata, streams };

    } catch (e) {
        console.error("Error durante el scraping:", e.message);
        await browser.close();
        return null;
    }
}

async function start() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log("Uso: node pelicinehd_downloader.js [URL_PELICINEHD_MOVIE]");
        process.exit(1);
    }

    const movieUrl = args[0];
    
    console.log("================================================================");
    console.log("🎬 PELICINEHD DOWNLOADER & SYNCER");
    console.log("================================================================");

    const scraped = await scrapePelicineHD(movieUrl);
    if (!scraped || !scraped.metadata.title) {
        console.error("❌ No se pudieron extraer los metadatos de la página.");
        process.exit(1);
    }

    const metadata = scraped.metadata;
    const streams = scraped.streams;

    console.log("\n✅ Metadatos Extraídos:");
    console.log(`- Título: ${metadata.title}`);
    console.log(`- Año: ${metadata.year}`);
    console.log(`- Duración: ${metadata.duration}`);
    console.log(`- Géneros: ${metadata.genres.join(', ')}`);

    const slug = generateSlug(metadata.title);
    console.log(`- Slug ID: ${slug}`);

    // Verificar si ya existe
    const exists = await checkMovieExists(slug);
    if (exists) {
        console.log(`\n⏭️ La película '${metadata.title}' ya existe en la base de datos. Saltando descarga...`);
        process.exit(0);
    }

    if (streams.length === 0) {
        console.error("\n❌ No se detectó ninguna URL de video (.m3u8 o .mp4).");
        process.exit(1);
    }

    const targetStream = streams[0];
    const cleanTitle = `${slug}.mp4`;
    console.log(`\n🎥 Stream a descargar: ${targetStream}`);
    console.log(`💾 Nombre de archivo final: ${cleanTitle}`);

    // Descargar
    const downloadSuccess = await downloadAndRemux(targetStream, movieUrl, cleanTitle);
    if (!downloadSuccess || !fs.existsSync(cleanTitle)) {
        console.error("❌ Falló la descarga o el remuxing del video.");
        process.exit(1);
    }

    console.log(`\n✅ Archivo descargado con éxito. Tamaño: ${(fs.statSync(cleanTitle).size / 1024 / 1024).toFixed(2)} MB`);

    // Subir a R2
    console.log(`\n☁️ Subiendo '${cleanTitle}' a Cloudflare R2...`);
    try {
        execSync(`python upload_to_r2.py "${cleanTitle}"`, { stdio: 'inherit' });
    } catch (e) {
        console.error("❌ Error al subir a R2:", e.message);
        process.exit(1);
    }

    // Registrar en Supabase
    const publicUrl = `${R2_PUBLIC_URL}/${cleanTitle}`;
    console.log(`\n✨ Registrando en la base de datos Supabase...`);
    
    const record = [{
        id: slug,
        title: metadata.title,
        description: metadata.description,
        poster: metadata.poster,
        backdrop: metadata.backdrop,
        genres: metadata.genres,
        year: metadata.year,
        duration: metadata.duration,
        url: publicUrl,
        created_at: '2026-03-01' // Para listarla abajo/orden de fecha
    }];

    const insertSuccess = await insertMovieToSupabase(record);
    if (insertSuccess) {
        console.log("\n🎉 ¡PROCESO COMPLETADO CON ÉXITO! La película está en línea y registrada.");
    } else {
        console.error("❌ La película se descargó y subió, pero falló el registro en la base de datos.");
    }

    // Limpieza
    try {
        if (fs.existsSync(cleanTitle)) fs.unlinkSync(cleanTitle);
    } catch (_) {}
}

start();
