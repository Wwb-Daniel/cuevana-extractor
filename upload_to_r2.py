import os
import sys
import boto3
from botocore.client import Config

def upload():
    if len(sys.argv) < 2:
        print("Uso: python upload_to_r2.py [ruta_archivo] [nombre_bucket]")
        sys.exit(1)
        
    filename = sys.argv[1]
    bucket_name = sys.argv[2] if len(sys.argv) > 2 else "movie"
    
    if not os.path.exists(filename):
        print(f"El archivo no existe: {filename}")
        sys.exit(1)
        
    account_id = "d53f386c472c0914a6314c8e3f869f1a"
    endpoint_url = f"https://{account_id}.r2.cloudflarestorage.com"
    
    # Credenciales de Cloudflare R2
    access_key_id = os.environ.get("R2_ACCESS_KEY_ID", "fe39bf665d06666923f48b5763240c4f")
    secret_access_key = os.environ.get("R2_SECRET_ACCESS_KEY", "8a1e2ff8f0305ce224ef7e8cbb82f4bda97103ffd6a35d99ec7f2ad8853cf7ba")
    
    print(f"🤖 Inicializando cliente de Cloudflare R2...")
    s3 = boto3.client(
        service_name='s3',
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        config=Config(signature_version='s3v4'),
        region_name='auto'
    )
    
    object_name = os.path.basename(filename)
    print(f"📤 Subiendo '{filename}' a Cloudflare R2 (bucket: '{bucket_name}') como '{object_name}'...")
    
    try:
        s3.upload_file(filename, bucket_name, object_name)
        print("\n=========================================")
        print("🎉 ¡SUBIDA A CLOUDFLARE R2 COMPLETADA CON ÉXITO!")
        print("=========================================")
        print("Bucket:", bucket_name)
        print("Archivo:", object_name)
        print("Tamaño:", f"{os.path.getsize(filename) / 1024 / 1024:.2f} MB")
        print("=========================================")
    except Exception as e:
        print("❌ Error al subir a Cloudflare R2:", e)
        sys.exit(1)

if __name__ == "__main__":
    upload()
