const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwEfRdatqUNdOugH8qaKklbcsvH_pJMv7X-kkKUOmW-zrl6jlzNv3yLeO_pZer-FDPU0g/exec';
const PORT = process.env.PORT || 8080;

/* Follow redirects for GET requests */
function getJSON(targetUrl) {
  return new Promise((resolve, reject) => {
    function follow(u, hops) {
      if (hops > 10) return reject(new Error('Too many redirects'));
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return follow(res.headers.location, hops + 1);
        }
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch(e) { reject(new Error('Invalid JSON from Google: ' + body.substring(0, 120))); }
        });
        res.on('error', reject);
      }).on('error', reject);
    }
    follow(targetUrl, 0);
  });
}

/* POST JSON to Apps Script (server-side, no CORS) */
function postJSON(targetUrl, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);

    function follow(u, hops) {
      if (hops > 10) return reject(new Error('Too many redirects'));
      const isHttps = u.startsWith('https');
      const mod = isHttps ? https : http;
      const parsed = new url.URL(u);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };
      const req = mod.request(options, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return follow(res.headers.location, hops + 1);
        }
        let resp = '';
        res.on('data', chunk => resp += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(resp)); }
          catch(e) { reject(new Error('Invalid JSON response: ' + resp.substring(0, 120))); }
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    }
    follow(targetUrl, 0);
  });
}

/* Read request body */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  };

  /* Static HTML */
  if (parsed.pathname === '/' || parsed.pathname === '/index.html') {
    try {
      const file = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(file);
    } catch(e) {
      res.writeHead(500); return res.end('index.html not found');
    }
  }

  /* GET proxy — plants and loadGardens */
  if (parsed.pathname === '/api' && req.method === 'GET') {
    try {
      const params = new url.URLSearchParams(parsed.query).toString();
      const googleUrl = APPS_SCRIPT_URL + (params ? '?' + params : '');
      const data = await getJSON(googleUrl);
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify(data));
    } catch(e) {
      res.writeHead(500, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  /* POST proxy — saveGardens */
  if (parsed.pathname === '/api' && req.method === 'POST') {
    try {
      const rawBody = await readBody(req);
      const payload = JSON.parse(rawBody);
      const data = await postJSON(APPS_SCRIPT_URL, payload);
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify(data));
    } catch(e) {
      res.writeHead(500, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  /* OPTIONS preflight */
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => console.log('Garden planner on port ' + PORT));
