const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbweC6ECammMbkHKha5xLaWtXzKXPZRNG7Ap4WEhTicuxe_Ak2_Muo6mHlPGNR-Qxcn23g/exec';
const PORT = process.env.PORT || 8080;

function fetchFromGoogle(targetUrl) {
  return new Promise((resolve, reject) => {
    function follow(u, redirects) {
      if (redirects > 10) return reject(new Error('Too many redirects'));
      https.get(u, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return follow(res.headers.location, redirects + 1);
        }
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(body));
        res.on('error', reject);
      }).on('error', reject);
    }
    follow(targetUrl, 0);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  // Serve static files
  if (parsed.pathname === '/' || parsed.pathname === '/index.html') {
    const file = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(file);
  }

  // Proxy endpoint — app calls /api?action=... instead of Google directly
  if (parsed.pathname === '/api') {
    try {
      const params = new url.URLSearchParams(parsed.query).toString();
      const googleUrl = APPS_SCRIPT_URL + (params ? '?' + params : '');
      const body = await fetchFromGoogle(googleUrl);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      });
      res.end(body);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('Garden planner running on port ' + PORT);
});
