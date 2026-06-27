import sys
import os
import urllib.request
import urllib.error
import json
import mimetypes

def upload():
    if len(sys.argv) < 2:
        print("Uso: python upload_to_insforge.py [ruta_archivo] [nombre_bucket]")
        sys.exit(1)
        
    filename = sys.argv[1]
    bucket_name = sys.argv[2] if len(sys.argv) > 2 else "movies"
    
    if not os.path.exists(filename):
        print(f"El archivo no existe: {filename}")
        sys.exit(1)
        
    # Verificar límite de tamaño de InsForge (50 MB)
    file_size = os.path.getsize(filename)
    if file_size > 50 * 1024 * 1024:
        print(f"⚠️ El archivo '{filename}' pesa {file_size / 1024 / 1024:.2f} MB, lo cual supera el límite de subida de InsForge (50 MB).")
        print("ℹ️ Este archivo se subirá únicamente a GitHub Releases debido al límite de tamaño de InsForge.")
        sys.exit(0)
        
    base_url = os.environ.get("INSFORGE_BASE_URL", "https://umbu9s7y.us-east.insforge.app")
    api_key = os.environ.get("INSFORGE_API_KEY", "ik_eb92792fde1c104d7468e4a5a1dbf885")
    
    print(f"🤖 Inicializando subida a InsForge: {base_url}...")
    
    # 1. Obtener estrategia de subida
    strategy_url = f"{base_url}/api/storage/buckets/{bucket_name}/upload-strategy"
    strategy_data = json.dumps({
        "filename": os.path.basename(filename),
        "contentType": mimetypes.guess_type(filename)[0] or "video/mp4",
        "size": os.path.getsize(filename)
    }).encode()
    
    print("🔑 Obteniendo estrategia de subida...")
    req = urllib.request.Request(strategy_url, data=strategy_data, headers={
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "Python"
    })
    
    try:
        res = urllib.request.urlopen(req)
        strategy = json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        print("❌ Error al obtener estrategia:", e.code, e.read().decode())
        sys.exit(1)
        
    method = strategy.get("method")
    upload_url = strategy.get("uploadUrl")
    key = strategy.get("key")
    
    print(f"Estrategia obtenida: {method}. Subiendo a: {upload_url}...")
    
    # 2. Subida del archivo
    if method == "presigned":
        # Subida a S3
        fields = strategy.get("fields", {})
        
        # Construir multipart body en Python
        boundary = b'----WebKitFormBoundary7MA4YWxkTrZu0gW'
        body = []
        
        # Añadir todos los campos de firma S3
        for k, v in fields.items():
            body.append(b'--' + boundary)
            body.append(f'Content-Disposition: form-data; name="{k}"'.encode())
            body.append(b'')
            body.append(v.encode())
            
        # Añadir el archivo
        body.append(b'--' + boundary)
        content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        body.append(f'Content-Disposition: form-data; name="file"; filename="{os.path.basename(filename)}"'.encode())
        body.append(f'Content-Type: {content_type}'.encode())
        body.append(b'')
        
        with open(filename, 'rb') as f:
            body.append(f.read())
            
        body.append(b'--' + boundary + b'--')
        body.append(b'')
        
        full_body = b'\r\n'.join(body)
        
        print("📤 Subiendo archivo a S3...")
        req_s3 = urllib.request.Request(upload_url, data=full_body, headers={
            "Content-Type": f"multipart/form-data; boundary={boundary.decode()}",
            "Content-Length": str(len(full_body)).encode(),
            "User-Agent": "Python"
        })
        
        try:
            res_s3 = urllib.request.urlopen(req_s3)
            print("STATUS S3:", res_s3.getcode())
        except urllib.error.HTTPError as e:
            print("❌ Error al subir a S3:", e.code, e.read().decode())
            sys.exit(1)
            
        # 3. Confirmar subida en InsForge
        confirm_url = f"{base_url}{strategy['confirmUrl']}"
        print(f"🔄 Confirmando subida en InsForge: {confirm_url}...")
        confirm_data = json.dumps({
            "size": os.path.getsize(filename),
            "contentType": content_type
        }).encode()
        
        req_confirm = urllib.request.Request(confirm_url, data=confirm_data, headers={
            "apikey": api_key,
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Python"
        })
        
        try:
            res_confirm = urllib.request.urlopen(req_confirm)
            confirm_res = json.loads(res_confirm.read().decode())
            print("\n=========================================")
            print("🎉 ¡SUBIDA A INSFORGE COMPLETADA CON ÉXITO!")
            print("=========================================")
            print("Bucket:", confirm_res.get("bucket"))
            print("Key:", confirm_res.get("key"))
            print("Tamaño:", f"{confirm_res.get('size') / 1024 / 1024:.2f} MB")
            print("URL pública de visualización:")
            print(f"{base_url}/api/storage/buckets/{bucket_name}/objects/{key}")
            print("=========================================")
        except urllib.error.HTTPError as e:
            print("❌ Error al confirmar la subida:", e.code, e.read().decode())
            sys.exit(1)
            
    else:
        # Método direct (Local Storage)
        boundary = b'----WebKitFormBoundary7MA4YWxkTrZu0gW'
        body = []
        body.append(b'--' + boundary)
        content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        body.append(f'Content-Disposition: form-data; name="file"; filename="{os.path.basename(filename)}"'.encode())
        body.append(f'Content-Type: {content_type}'.encode())
        body.append(b'')
        
        with open(filename, 'rb') as f:
            body.append(f.read())
            
        body.append(b'--' + boundary + b'--')
        body.append(b'')
        
        full_body = b'\r\n'.join(body)
        
        direct_url = f"{base_url}{upload_url}"
        print(f"📤 Subiendo directamente a InsForge: {direct_url}...")
        req_direct = urllib.request.Request(direct_url, data=full_body, headers={
            "apikey": api_key,
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary.decode()}",
            "Content-Length": str(len(full_body)).encode(),
            "User-Agent": "Python"
        })
        
        try:
            res_direct = urllib.request.urlopen(req_direct)
            direct_res = json.loads(res_direct.read().decode())
            print("\n=========================================")
            print("🎉 ¡SUBIDA A INSFORGE COMPLETADA CON ÉXITO!")
            print("=========================================")
            print("Bucket:", direct_res.get("bucket"))
            print("Key:", direct_res.get("key"))
            print("Tamaño:", f"{direct_res.get('size') / 1024 / 1024:.2f} MB")
            print("URL pública de visualización:")
            print(f"{base_url}/api/storage/buckets/{bucket_name}/objects/{key}")
            print("=========================================")
        except urllib.error.HTTPError as e:
            print("❌ Error al subir directamente:", e.code, e.read().decode())
            sys.exit(1)

if __name__ == "__main__":
    upload()
