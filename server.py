import json
import os
import time
import urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / 'data'
VISITS_FILE = DATA_DIR / 'visits.json'
ONE_DAY_MS = 24 * 60 * 60 * 1000
PORT = 8000


def ensure_data_file():
    DATA_DIR.mkdir(exist_ok=True)
    if not VISITS_FILE.exists():
        VISITS_FILE.write_text('{}', encoding='utf-8')


def read_visits():
    ensure_data_file()
    try:
        content = VISITS_FILE.read_text(encoding='utf-8')
        return json.loads(content or '{}')
    except Exception:
        return {}


def write_visits(data):
    ensure_data_file()
    VISITS_FILE.write_text(json.dumps(data, indent=2), encoding='utf-8')


def normalize_ip(headers, client_ip=None):
    forwarded = headers.get('X-Forwarded-For')
    if forwarded:
        return forwarded.split(',')[0].strip().replace('::ffff:', '')

    real_ip = headers.get('X-Real-IP')
    if real_ip:
        return real_ip.replace('::ffff:', '')

    if client_ip:
        return client_ip.replace('::ffff:', '')

    return 'unknown'


def is_local_ip(ip):
    if not ip or ip == 'unknown':
        return True
    if ip == '::1' or ip == 'localhost':
        return True
    if ip.startswith('127.'):
        return True
    if ip.startswith('10.'):
        return True
    if ip.startswith('192.168.'):
        return True
    if ip.startswith('172.'):
        try:
            second = int(ip.split('.')[1])
            return 16 <= second <= 31
        except ValueError:
            return False
    return False


def lookup_location(ip):
    if is_local_ip(ip):
        return 'Local network'

    try:
        request = urllib.request.Request(f'https://ipapi.co/{ip}/json/', headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(request, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
        if not data or data.get('error') or not data.get('country_name'):
            return 'Unavailable'
        parts = [data.get('city'), data.get('region'), data.get('country_name')]
        clean_parts = [part for part in parts if part]
        return ', '.join(clean_parts) if clean_parts else 'Unavailable'
    except Exception:
        return 'Unavailable'


class SiteHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/visit':
            self.handle_visit()
            return
        super().do_GET()

    def handle_visit(self):
        now = int(time.time() * 1000)
        ip = normalize_ip(self.headers, self.client_address[0] if self.client_address else None)
        visits = read_visits()
        recent_for_ip = [ts for ts in visits.get(ip, []) if now - ts <= ONE_DAY_MS]
        recent_for_ip.append(now)
        visits[ip] = recent_for_ip
        write_visits(visits)

        total_unique_ips = 0
        for timestamps in visits.values():
            if any(now - ts <= ONE_DAY_MS for ts in timestamps):
                total_unique_ips += 1

        location = lookup_location(ip)
        payload = {
            'ip': ip,
            'visitCount': len(recent_for_ip),
            'totalVisits': total_unique_ips,
            'location': location,
        }

        body = json.dumps(payload).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    server = ThreadingHTTPServer(('0.0.0.0', PORT), SiteHandler)
    print(f'Server running at http://localhost:{PORT}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down server.')
        server.server_close()
