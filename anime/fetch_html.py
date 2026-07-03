import sys
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
import time

def get_html(url):
    chrome_options = Options()
    chrome_options.add_argument('--headless')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.add_argument('--disable-blink-features=AutomationControlled')
    chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
    
    driver = webdriver.Chrome(options=chrome_options)
    try:
        driver.get(url)
        # Esperar a que pase el reto de Cloudflare (5-10 segundos)
        time.sleep(10)
        return driver.page_source
    finally:
        driver.quit()

if __name__ == "__main__":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    if len(sys.argv) > 1:
        print(get_html(sys.argv[1]))
