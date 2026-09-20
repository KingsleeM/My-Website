const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const VISITS_FILE = path.join(DATA_DIR, 'visits.json');
const ONE_DAY = 24 * 60 * 60 * 1000;

function ensureDataFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(VISITS_FILE)) {
    fs.writeFileSync(VISITS_FILE, '{}', 'utf8');
  }
}

function readVisits() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(VISITS_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function writeVisits(visits) {
  ensureDataFile();
  fs.writeFileSync(VISITS_FILE, JSON.stringify(visits, null, 2), 'utf8');
}

function normalizeIp(rawIp) {
  if (!rawIp) return 'unknown';
  const cleaned = rawIp.split(',')[0].trim();
  return cleaned.replace(/^::ffff:/, '');
}

function isLocalIp(ip) {
  if (!ip || ip === 'unknown') return true;
  if (ip === '::1' || ip === 'localhost') return true;
  if (ip.startsWith('127.')) return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('172.16.') || ip.startsWith('172.17.') || ip.startsWith('172.18.') || ip.startsWith('172.19.') || ip.startsWith('172.20.') || ip.startsWith('172.21.') || ip.startsWith('172.22.') || ip.startsWith('172.23.') || ip.startsWith('172.24.') || ip.startsWith('172.25.') || ip.startsWith('172.26.') || ip.startsWith('172.27.') || ip.startsWith('172.28.') || ip.startsWith('172.29.') || ip.startsWith('172.30.') || ip.startsWith('172.31.')) return true;
  if (ip.startsWith('192.168.')) return true;
  return false;
}

async function getLocation(ip) {
  if (isLocalIp(ip)) return 'Local network';

  try {
    const response = await fetch(`https://ipapi.co/${ip}/json/`);
    if (!response.ok) return 'Unavailable';

    const data = await response.json();
    if (!data || data.error || !data.country_name) return 'Unavailable';

    const parts = [data.city, data.region, data.country_name].filter(Boolean);
    return parts.length ? parts.join(', ') : 'Unavailable';
  } catch {
    return 'Unavailable';
  }
}

async function handleVisit(req, res) {
  const ip = normalizeIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown');
  const now = Date.now();
  const visits = readVisits();
  const recentForIp = Array.isArray(visits[ip]) ? visits[ip] : [];
  const activeIps = Object.entries(visits).filter(([, entry]) => Array.isArray(entry) && entry.some((time) => now - time <= ONE_DAY));

  const cleanedRecent = recentForIp.filter((time) => now - time <= ONE_DAY);
  cleanedRecent.push(now);
  visits[ip] = cleanedRecent;
  writeVisits(visits);

  const totalVisits = activeIps.length + (cleanedRecent.length > 0 && !activeIps.some(([savedIp]) => savedIp === ip) ? 1 : 0);
  const location = await getLocation(ip);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ip,
    totalVisits,
    visitCount: cleanedRecent.length,
    location
  }));
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };
  return map[ext] || 'application/octet-stream';
}

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  let filePath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  const safePath = path.normalize(path.join(ROOT, filePath));

  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(safePath, (error, content) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': mimeType(safePath) });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (requestUrl.pathname === '/api/visit') {
    await handleVisit(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
