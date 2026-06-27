const { createClient } = require('@insforge/sdk');
const fs = require('fs');
const path = require('path');

async function upload() {
    const filename = process.argv[2];
    const bucketName = process.argv[3] || 'movies';
    const baseUrl = process.env.INSFORGE_BASE_URL || 'https://umbu9s7y.us-east.insforge.app';
    const apiKey = process.env.INSFORGE_API_KEY || 'ik_eb92792fde1c104d7468e4a5a1dbf885';

    if (!filename) {
        console.error('Uso: node upload_to_insforge.js [ruta_del_archivo] [nombre_del_bucket]');
        process.exit(1);
    }

    if (!fs.existsSync(filename)) {
        console.error(`El archivo no existe: ${filename}`);
        process.exit(1);
    }

    console.log(`🤖 Inicializando cliente de InsForge...`);
    const client = createClient({
        baseUrl: baseUrl,
        anonKey: apiKey
    });

    console.log(`📂 Leyendo archivo: ${filename}...`);
    const fileBuffer = fs.readFileSync(filename);
    const fileBlob = new Blob([fileBuffer]);

    const destinationPath = path.basename(filename);
    console.log(`📤 Subiendo a InsForge en bucket '${bucketName}' como '${destinationPath}'...`);
    
    try {
        const { data, error } = await client.storage
            .from(bucketName)
            .upload(destinationPath, fileBlob);

        if (error) {
            console.error('❌ Error de InsForge al subir:', error.message || error);
            process.exit(1);
        }

        console.log('\n=========================================');
        console.log('🎉 ¡SUBIDA COMPLETADA CON ÉXITO!');
        console.log('=========================================');
        console.log(`Bucket: ${data.bucket}`);
        console.log(`Key: ${data.key}`);
        console.log(`Tamaño: ${(data.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`URL pública de visualización:`);
        console.log(data.url);
        console.log('=========================================');
    } catch (e) {
        console.error('❌ Error inesperado durante la subida:', e.message);
        process.exit(1);
    }
}

upload();
