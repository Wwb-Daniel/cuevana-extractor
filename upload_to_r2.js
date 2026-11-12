const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const https = require('https');
const fs = require('fs');
const path = require('path');

function getServerTimeSkew() {
    return new Promise((resolve) => {
        const req = https.get('https://cloudflare.com', (res) => {
            const serverDateStr = res.headers.date;
            if (serverDateStr) {
                const serverTime = new Date(serverDateStr).getTime();
                const localTime = Date.now();
                const skew = serverTime - localTime;
                console.log(`Clock skew detected: ${skew} ms (${(skew / 1000 / 60).toFixed(1)} minutes)`);
                resolve(skew);
            } else {
                resolve(0);
            }
        });
        req.on('error', () => resolve(0));
    });
}

async function uploadToR2(filePath, bucketName = 'movie') {
    if (!fs.existsSync(filePath)) {
        throw new Error(`El archivo no existe: ${filePath}`);
    }

    const clockSkew = await getServerTimeSkew();

    const accountId = 'd53f386c472c0914a6314c8e3f869f1a';
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID || 'fe39bf665d06666923f48b5763240c4f';
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '8a1e2ff8f0305ce224ef7e8cbb82f4bda97103ffd6a35d99ec7f2ad8853cf7ba';

    const s3 = new S3Client({
        region: 'auto',
        endpoint: endpoint,
        credentials: {
            accessKeyId,
            secretAccessKey
        },
        systemClockOffset: clockSkew
    });

    const fileName = path.basename(filePath);
    const fileStream = fs.createReadStream(filePath);
    const stats = fs.statSync(filePath);

    let contentType = 'application/octet-stream';
    if (fileName.toLowerCase().endsWith('.mp4')) {
        contentType = 'video/mp4';
    } else if (fileName.toLowerCase().endsWith('.m3u8')) {
        contentType = 'application/x-mpegURL';
    }

    console.log(`Subiendo '${fileName}' (${(stats.size / 1024 / 1024).toFixed(2)} MB) a Cloudflare R2 [${bucketName}]...`);

    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: fileName,
        Body: fileStream,
        ContentType: contentType
    });

    await s3.send(command);
    console.log(`✅ ¡Subida a Cloudflare R2 completada exitosamente! -> ${fileName}`);
    return `https://pub-77522f1e717f46bead2250b84f1ca547.r2.dev/${fileName}`;
}

async function test() {
    fs.writeFileSync('test_r2_upload.txt', 'test content');
    try {
        const url = await uploadToR2('test_r2_upload.txt', 'movie');
        console.log('SUCCESS URL:', url);
    } catch (e) {
        console.error('FAILED:', e);
    } finally {
        if (fs.existsSync('test_r2_upload.txt')) fs.unlinkSync('test_r2_upload.txt');
    }
}

test();
