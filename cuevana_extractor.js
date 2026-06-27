const puppeteer = require('puppeteer-core');
const https = require('https');
const { spawn } = require('child_process');
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

// Buscar ruta de Chrome en el sistema operativo local
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

// Decodificar tokens XOR y Base64
function decryptToken(tokenString) {
    try {
        // Método 1: XOR
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
        
        // Método 2: Base64 directo
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
        console.log('⚠️ No se detectó Chrome en el puerto 9222. Iniciando nueva instancia local...');
        const chromePath = getChromePath();
        if (!chromePath) {
            console.warn('❌ ADVERTENCIA: No se encontró Google Chrome en las rutas estándar. Intentando abrir sin ruta fija...');
        } else {
            console.log(`📍 Chrome encontrado en: ${chromePath}`);
        }
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

    // Capturar streams
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

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Si no hay enlaces de stream, simular interacción
    if (streams.length === 0) {
        console.log('[Puppeteer] No se detectó stream de red. Intentando simular clicks en la pantalla...');
        try {
            await page.evaluate(() => {
                const elements = [
                    document.querySelector('video'),
                    document.querySelector('.jw-video'),
                    document.querySelector('.jw-display-icon-container'),
                    document.querySelector('.play-button'),
                    document.querySelector('#vplayer'),
                    document.body
                ];
                for (const el of elements) {
                    if (el) {
                        el.click();
                        const evt = document.createEvent("MouseEvents");
                        evt.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
                        el.dispatchEvent(evt);
                    }
                }
            });
            const width = await page.evaluate(() => window.innerWidth);
            const height = await page.evaluate(() => window.innerHeight);
            await page.mouse.click(width / 2, height / 2);
            await new Promise(resolve => setTimeout(resolve, 8000));
        } catch (e) {
            console.log('Error al simular interacción física:', e.message);
        }
    }

    await page.close();
    // Solo cerrar si es una instancia lanzada localmente
    if (browser.process() !== null) {
        await browser.close();
    } else {
        await browser.disconnect();
    }
    return streams;
}

// Descarga automática con yt-dlp
function downloadWithYtdl(stream, playerUrl, filename) {
    return new Promise((resolve, reject) => {
        // Asegurar extensión .mp4
        if (!filename.endsWith('.mp4')) {
            filename += '.mp4';
        }
        
        const referer = playerUrl.split('/e/')[0] + '/';
        console.log(`\n📥 Iniciando descarga automática con yt-dlp...`);
        console.log(`Destino: ${filename}`);
        console.log(`Referer: ${referer}`);
        
        const args = [
            '--no-update',
            '--referer', referer,
            '--remux-video', 'mp4',
            '-o', filename,
            stream
        ];
        
        // Ejecutar yt-dlp y heredar stdio para ver el progreso real en consola
        const child = spawn('yt-dlp', args, { stdio: 'inherit' });
        
        child.on('close', (code) => {
            if (code === 0) {
                console.log(`\n✅ Descarga completada exitosamente: ${filename}`);
                resolve(true);
            } else {
                console.error(`\n❌ Error en yt-dlp. Código de salida: ${code}`);
                resolve(false);
            }
        });
        
        child.on('error', (err) => {
            console.error(`\n❌ No se pudo ejecutar yt-dlp. Asegúrate de que esté instalado en el PATH.`, err.message);
            resolve(false);
        });
    });
}

async function main() {
    const movieUrl = process.argv[2];
    const outputFilename = process.argv[3] || 'video.mp4';
    
    if (!movieUrl) {
        console.log('Uso: node cuevana_extractor.js [URL_DE_LA_PELICULA] [NOMBRE_DE_ARCHIVO_OPCIONAL]');
        process.exit(1);
    }

    console.log(`🔍 Analizando la película en: ${movieUrl}`);
    try {
        const html = await fetchHtml(movieUrl);
        const regex = /data-server="([^"]+)"/g;
        let match;
        const playerUrls = [];

        while ((match = regex.exec(html)) !== null) {
            const serverUrl = match[1];
            const decryptedUrl = decryptToken(serverUrl);
            if (decryptedUrl && !playerUrls.includes(decryptedUrl)) {
                playerUrls.push(decryptedUrl);
            }
        }

        if (playerUrls.length === 0) {
            console.log('❌ No se encontraron servidores de video en esta página.');
            process.exit(1);
        }

        console.log('\n--- Reproductores directos encontrados (Decodificados) ---');
        playerUrls.forEach((url, i) => console.log(`[${i + 1}] ${url}`));

        // Servidores de extracción automática compatibles
        let success = false;
        for (const playerUrl of playerUrls) {
            // Intentamos extraer desde martinshop, tiktokshopping, o cualquier otro
            console.log(`\n🎯 Iniciando extracción automática del stream en: ${playerUrl}`);
            const streams = await extractM3u8(playerUrl);
            
            if (streams && streams.length > 0) {
                console.log('\n================================================================');
                console.log('🎉 RESULTADO: URLS DE VIDEO DETECTADAS');
                console.log('================================================================');
                streams.forEach((stream, i) => {
                    console.log(`[Opción ${i + 1}] ${stream}`);
                });
                
                // Intentamos descargar la primera opción
                const mainStream = streams[0];
                const filename = streams.length > 1 ? outputFilename.replace('.mp4', `_1.mp4`) : outputFilename;
                
                console.log(`\n📥 Intentando descargar la Opción 1...`);
                const downloaded = await downloadWithYtdl(mainStream, playerUrl, filename);
                
                if (downloaded) {
                    success = true;
                    break;
                } else {
                    console.log('⚠️ Falló la descarga de la opción 1. Intentando con la siguiente opción si existe...');
                    if (streams.length > 1) {
                        for (let i = 1; i < streams.length; i++) {
                            const alternateFilename = outputFilename.replace('.mp4', `_${i+1}.mp4`);
                            const altDownloaded = await downloadWithYtdl(streams[i], playerUrl, alternateFilename);
                            if (altDownloaded) {
                                success = true;
                                break;
                            }
                        }
                    }
                }
                
                if (success) break;
            }
        }

        if (!success) {
            console.log('\n❌ No se pudo interceptar o descargar la URL del stream de video en ninguno de los servidores.');
        }

    } catch (error) {
        console.error('Ocurrió un error general:', error.message);
    }
}

main();
