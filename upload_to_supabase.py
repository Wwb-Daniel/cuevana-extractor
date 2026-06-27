import sys
import os
import urllib.request
import urllib.error
import mimetypes

def upload():
    if len(sys.argv) < 2:
        print("Uso: python upload_to_supabase.py [ruta_archivo] [nombre_bucket]")
        sys.exit(1)
        
    filename = sys.argv[1]
    bucket_name = sys.argv[2] if len(sys.argv) > 2 else "movies"
    
    if not os.path.exists(filename):
        print(f"El archivo no existe: {filename}")
        sys.exit(1)
        
    project_ref = "pdvdnjmqgcprwntabvia"
    base_url = f"https://{project_ref}.supabase.co"
    api_key = os.environ.get("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkdmRuam1xZ2NwcndudGFidmlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NTgwNjIsImV4cCI6MjA5ODEzNDA2Mn0.8qcpYfWH9bwDrEQSKzbYvKOqlYpBQmqNWgykTQBXO60")
    
    object_name = os.path.basename(filename)
    upload_url = f"{base_url}/storage/v1/object/{bucket_name}/{object_name}"
    
    print(f"🤖 Inicializando subida a Supabase: {base_url}...")
    print(f"📤 Subiendo '{filename}' a bucket '{bucket_name}'...")
    
    file_size = os.path.getsize(filename)
    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    
    with open(filename, 'rb') as f:
        file_data = f.read()
        
    req = urllib.request.Request(
        upload_url,
        data=file_data,
        headers={
            "apikey": api_key,
            "Authorization": f"Bearer {api_key}",
            "Content-Type": content_type,
            "User-Agent": "Python"
        },
        method="POST"
    )
    
    try:
        res = urllib.request.urlopen(req)
        print("STATUS:", res.getcode())
        print("\n=========================================")
        print("🎉 ¡SUBIDA A SUPABASE COMPLETADA CON ÉXITO!")
        print("=========================================")
        print("Bucket:", bucket_name)
        print("Archivo:", object_name)
        print("Tamaño:", f"{file_size / 1024 / 1024:.2f} MB")
        print("URL pública de visualización/streaming:")
        print(f"{base_url}/storage/v1/object/public/{bucket_name}/{object_name}")
        print("=========================================")
    except urllib.error.HTTPError as e:
        print("❌ Error al subir a Supabase:", e.code, e.read().decode())
        sys.exit(1)
    except Exception as e:
        print("❌ Error inesperado:", e)
        sys.exit(1)

if __name__ == "__main__":
    upload()
