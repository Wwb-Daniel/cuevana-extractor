/**
 * fix_series_descriptions.js
 * 
 * Busca en la base de datos todas las series que tienen:
 *   - description vacía o nula
 *   - description igual a los textos placeholder genéricos
 * 
 * Para cada una, visita la página de la serie en Cuevana y extrae
 * la sinopsis real desde el div.resumen o meta description.
 * 
 * Luego actualiza la base de datos con la sinopsis correcta.
 */

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_PREMIUM_URL || 'https://pdvdnjmqgcprwntabvia.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PREMIUM_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkdmRuam1xZ2NwcndudGFidmlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NTgwNjIsImV4cCI6MjA5ODEzNDA2Mn0.8qcpYfWH9bwDrEQSKzbYvKOqlYpBQmqNWgykTQBXO60';

// Textos placeholder que indican descripción genérica o vacía
const PLACEHOLDER_TEXTS = [
    'Sin descripción disponible.',
    'Sin descripción.',
    'Sin descripcion disponible.',
    'Sin descripcion.',
    ''
];

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchHtml(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'es-ES,es;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 15000
        }, (res) => {
            let data = '';
            // Seguir redirecciones
            if (res.statusCode === 301 || res.statusCode === 302) {
                const location = res.headers.location;
                if (location) {
                    const newUrl = location.startsWith('http') ? location : `https://cuevana.you${location}`;
                    res.resume();
                    return fetchHtml(newUrl).then(resolve).catch(reject);
                }
            }
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout al cargar URL'));
        });
    });
}

function makeSupabaseRequest(path, method, data = null) {
    return new Promise((resolve) => {
        const urlStr = `${SUPABASE_URL}/rest/v1/${path}`;
        const urlObj = new URL(urlStr);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
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
        if (method === 'PATCH') {
            options.headers['Prefer'] = 'return=minimal';
        }

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: body ? JSON.parse(body) : [] });
                } catch (e) {
                    resolve({ status: res.statusCode, data: [], raw: body });
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

/**
 * Extrae la sinopsis de la página HTML de una serie de Cuevana.
 * Intenta múltiples selectores para mayor robustez.
 */
function extractSynopsis(html) {
    if (!html) return '';

    // 1. Intentar <div class="resumen"> o <p class="resumen">
    const resumenMatch = html.match(/<div[^>]*class="[^"]*resumen[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
        || html.match(/<p[^>]*class="[^"]*resumen[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    if (resumenMatch) {
        const text = resumenMatch[1].replace(/<[^>]+>/g, '').trim();
        if (text.length > 50) return text;
    }

    // 2. Intentar meta description
    const metaMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]{60,})"[^>]*>/i)
        || html.match(/<meta[^>]*content="([^"]{60,})"[^>]*name="description"[^>]*>/i);
    if (metaMatch) {
        const text = metaMatch[1].trim();
        if (text.length > 50) return text;
    }

    // 3. Intentar og:description
    const ogMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]{60,})"[^>]*>/i)
        || html.match(/<meta[^>]*content="([^"]{60,})"[^>]*property="og:description"[^>]*>/i);
    if (ogMatch) {
        const text = ogMatch[1].trim();
        if (text.length > 50) return text;
    }

    // 4. Buscar cualquier <p> con suficiente texto que parezca descripción
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let match;
    const candidates = [];
    while ((match = pRegex.exec(html)) !== null) {
        const text = match[1].replace(/<[^>]+>/g, '').trim();
        // Filtrar textos que parezcan navegación o widgets (muy cortos o URLs)
        if (text.length > 100 && !text.includes('http') && !text.includes('©')) {
            candidates.push(text);
        }
    }
    // Ordenar por longitud y tomar el más completo
    candidates.sort((a, b) => b.length - a.length);
    if (candidates.length > 0) return candidates[0].substring(0, 1000);

    return '';
}

/**
 * Construye la URL de la serie en Cuevana a partir de su ID/slug
 */
function buildSeriesUrl(seriesId) {
    // El id es el slug, ej: "the-boys", "breaking-bad"
    return `https://cuevana.you/serie/${seriesId}`;
}

async function getAllSeriesWithBadDescription() {
    console.log('🔍 Buscando series con descripción vacía o genérica...');
    
    // Traer todas las series en lotes de 1000
    const allSeries = [];
    let offset = 0;
    const limit = 1000;
    
    while (true) {
        const res = await makeSupabaseRequest(
            `premium_series?select=id,title,description&limit=${limit}&offset=${offset}&order=id`,
            'GET'
        );
        
        if (!res.data || !Array.isArray(res.data) || res.data.length === 0) break;
        allSeries.push(...res.data);
        if (res.data.length < limit) break;
        offset += limit;
    }
    
    console.log(`📊 Total de series en la base de datos: ${allSeries.length}`);
    
    // Filtrar las que tienen descripción mala
    const badSeries = allSeries.filter(s => {
        const desc = (s.description || '').trim();
        return PLACEHOLDER_TEXTS.includes(desc) || desc.length < 30;
    });
    
    console.log(`⚠️  Series con descripción vacía o placeholder: ${badSeries.length}`);
    return badSeries;
}

async function fixSeriesDescription(series) {
    const url = buildSeriesUrl(series.id);
    console.log(`\n🔧 [${series.id}] "${series.title}"`);
    console.log(`   Desc actual: "${(series.description || '').substring(0, 60)}..."`);
    console.log(`   URL: ${url}`);
    
    let html;
    try {
        html = await fetchHtml(url);
    } catch (e) {
        console.log(`   ❌ Error al cargar página: ${e.message}`);
        return false;
    }
    
    const synopsis = extractSynopsis(html);
    
    if (!synopsis || synopsis.length < 30) {
        console.log(`   ⚠️  No se encontró sinopsis en la página.`);
        return false;
    }
    
    console.log(`   ✅ Sinopsis encontrada (${synopsis.length} chars): "${synopsis.substring(0, 80)}..."`);
    
    // Actualizar en Supabase
    const res = await makeSupabaseRequest(
        `premium_series?id=eq.${encodeURIComponent(series.id)}`,
        'PATCH',
        { description: synopsis }
    );
    
    if (res.status === 200 || res.status === 204) {
        console.log(`   💾 Actualizado en la base de datos.`);
        return true;
    } else {
        console.log(`   ❌ Error al actualizar: Status ${res.status}`, res.raw || '');
        return false;
    }
}

async function main() {
    console.log('='.repeat(60));
    console.log('🔧 FIX SERIES DESCRIPTIONS');
    console.log('='.repeat(60));
    console.log(`Supabase: ${SUPABASE_URL}`);
    
    // 1. Obtener todas las series con descripción mala
    const badSeries = await getAllSeriesWithBadDescription();
    
    if (badSeries.length === 0) {
        console.log('\n✅ ¡Todas las series tienen descripción! No hay nada que corregir.');
        return;
    }
    
    // 2. Mostrar resumen antes de procesar
    console.log('\n📋 Series a corregir:');
    badSeries.slice(0, 20).forEach((s, i) => {
        console.log(`  ${i + 1}. [${s.id}] "${s.title}" - "${(s.description || 'VACÍA').substring(0, 40)}"`);
    });
    if (badSeries.length > 20) {
        console.log(`  ... y ${badSeries.length - 20} más`);
    }
    
    // 3. Procesar cada serie
    console.log(`\n🚀 Iniciando proceso de corrección para ${badSeries.length} series...`);
    
    let fixed = 0;
    let failed = 0;
    let notFound = 0;
    
    for (let i = 0; i < badSeries.length; i++) {
        const series = badSeries[i];
        console.log(`\n[${i + 1}/${badSeries.length}]`);
        
        const success = await fixSeriesDescription(series);
        if (success) {
            fixed++;
        } else {
            failed++;
        }
        
        // Pequeña pausa para no saturar el servidor
        if (i < badSeries.length - 1) {
            await delay(800);
        }
    }
    
    // 4. Resumen final
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN FINAL:');
    console.log(`  ✅ Corregidas:       ${fixed}`);
    console.log(`  ❌ Fallidas:         ${failed}`);
    console.log(`  📊 Total procesadas: ${badSeries.length}`);
    console.log('='.repeat(60));
    
    if (failed > 0) {
        console.log('\n⚠️  Las series que fallaron pueden no tener página en Cuevana o el sitio las bloqueó.');
        console.log('   Puedes volver a correr el script para reintentar.');
    }
}

main().catch(console.error);
