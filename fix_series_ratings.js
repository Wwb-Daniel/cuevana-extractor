/**
 * fix_series_ratings.js
 *
 * Busca todas las series que tienen rating null, vacío o el placeholder '7.8',
 * visita su página en Cuevana, extrae el score real de TMDB y actualiza la DB.
 */

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_PREMIUM_URL || 'https://pdvdnjmqgcprwntabvia.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PREMIUM_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkdmRuam1xZ2NwcndudGFidmlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NTgwNjIsImV4cCI6MjA5ODEzNDA2Mn0.8qcpYfWH9bwDrEQSKzbYvKOqlYpBQmqNWgykTQBXO60';

const PLACEHOLDER_RATINGS = ['7.8', '4.5 IMDb', '4.5', ''];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchHtml(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept-Language': 'es-ES,es;q=0.9'
            },
            timeout: 15000
        }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                const loc = res.headers.location;
                if (loc) {
                    const next = loc.startsWith('http') ? loc : `https://cuevana.you${loc}`;
                    res.resume();
                    return fetchHtml(next).then(resolve).catch(reject);
                }
            }
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

function makeRequest(path, method, body = null) {
    return new Promise((resolve) => {
        const u = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
        const opts = {
            hostname: u.hostname,
            path: u.pathname + u.search,
            method,
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                ...(method === 'PATCH' ? { 'Prefer': 'return=minimal' } : {})
            }
        };
        const req = https.request(opts, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: data ? JSON.parse(data) : [] }); }
                catch { resolve({ status: res.statusCode, data: [], raw: data }); }
            });
        });
        req.on('error', e => resolve({ status: 500, error: e.message }));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

/**
 * Extrae el rating real del HTML de Cuevana.
 * Prueba múltiples patrones en orden de confiabilidad.
 */
function extractRating(html) {
    if (!html) return null;

    // 1. data-score o data-rating
    const dataAttr = html.match(/data-(?:score|rating)=["']([\d.]+)["']/i);
    if (dataAttr) { const v = parseFloat(dataAttr[1]); if (v > 0 && v <= 10) return v.toFixed(1); }

    // 2. Clase con score/rating/nota/puntuacion/vote
    const classEl = html.match(/<[^>]*class="[^"]*(?:score|rating|nota|puntuacion|vote|calificacion)[^"]*"[^>]*>\s*([\d.]+)\s*<\/[^>]+>/i);
    if (classEl) { const v = parseFloat(classEl[1]); if (v > 0 && v <= 10) return v.toFixed(1); }

    // 3. Etiqueta de texto seguida de número
    const label = html.match(/(?:puntuaci[oó]n|calificaci[oó]n|vote_average|vote average|score)[^\d]*([\d.]{3,4})/i);
    if (label) { const v = parseFloat(label[1]); if (v > 0 && v <= 10) return v.toFixed(1); }

    // 4. Número decimal entre 5.0-9.9 junto a "/10" o "★"
    const generic = html.match(/([5-9]\.[0-9])\s*(?:\/\s*10|★)/i);
    if (generic) return parseFloat(generic[1]).toFixed(1);

    // 5. JSON-LD structured data (ratingValue)
    const jsonLd = html.match(/"ratingValue"\s*:\s*"?([\d.]+)"?/i);
    if (jsonLd) { const v = parseFloat(jsonLd[1]); if (v > 0 && v <= 10) return v.toFixed(1); }

    return null;
}

async function getAllSeriesWithBadRating() {
    console.log('🔍 Buscando series con rating placeholder o nulo...');
    const all = [];
    let offset = 0;
    while (true) {
        const res = await makeRequest(`premium_series?select=id,title,rating&limit=1000&offset=${offset}&order=id`, 'GET');
        if (!res.data || !Array.isArray(res.data) || res.data.length === 0) break;
        all.push(...res.data);
        if (res.data.length < 1000) break;
        offset += 1000;
    }
    console.log(`📊 Total series en DB: ${all.length}`);
    const bad = all.filter(s => {
        const r = (s.rating || '').toString().trim();
        return !r || PLACEHOLDER_RATINGS.includes(r);
    });
    console.log(`⚠️  Series con rating nulo/placeholder: ${bad.length}`);
    return bad;
}

async function fixRating(series) {
    const url = `https://cuevana.you/serie/${series.id}`;
    console.log(`\n🔧 [${series.id}] "${series.title}" — rating actual: "${series.rating || 'null'}"`);
    let html;
    try { html = await fetchHtml(url); }
    catch (e) { console.log(`   ❌ Error cargando: ${e.message}`); return false; }

    const rating = extractRating(html);
    if (!rating) { console.log(`   ⚠️  Rating no encontrado en la página.`); return false; }

    console.log(`   ✅ Rating encontrado: ${rating}`);
    const res = await makeRequest(`premium_series?id=eq.${encodeURIComponent(series.id)}`, 'PATCH', { rating });
    if (res.status === 200 || res.status === 204) {
        console.log(`   💾 Actualizado en DB.`);
        return true;
    }
    console.log(`   ❌ Error al actualizar: ${res.status}`);
    return false;
}

async function main() {
    console.log('='.repeat(60));
    console.log('⭐ FIX SERIES RATINGS');
    console.log('='.repeat(60));

    const bad = await getAllSeriesWithBadRating();
    if (!bad.length) {
        console.log('\n✅ Todas las series tienen rating real. Nada que corregir.');
        return;
    }

    console.log('\n📋 Primeras 20 a corregir:');
    bad.slice(0, 20).forEach((s, i) =>
        console.log(`  ${i+1}. [${s.id}] "${s.title}" → "${s.rating || 'null'}"`)
    );
    if (bad.length > 20) console.log(`  ... y ${bad.length - 20} más`);

    let fixed = 0, failed = 0;
    for (let i = 0; i < bad.length; i++) {
        console.log(`\n[${i+1}/${bad.length}]`);
        if (await fixRating(bad[i])) fixed++; else failed++;
        if (i < bad.length - 1) await delay(700);
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN:');
    console.log(`  ✅ Corregidas: ${fixed}`);
    console.log(`  ❌ Fallidas:   ${failed}`);
    console.log('='.repeat(60));
}

main().catch(console.error);
