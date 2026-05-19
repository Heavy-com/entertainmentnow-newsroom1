// entertainmentnow — NewsAPI proxy server
// Run with: node server.js
// Then open dashboard.html in your browser at http://localhost:3000

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 3000;
const API_KEY = 'eba3bb2993124fb0b3c1117f7535afc2'; // your NewsAPI key

const server = http.createServer((req, res) => {
  // CORS headers — allow the dashboard to call this from localhost
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Serve the dashboard HTML
  if (req.url === '/' || req.url === '/index.html') {
    const fs = require('fs');
    const dashPath = __dirname + '/dashboard.html';
    if (fs.existsSync(dashPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fs.readFileSync(dashPath));
    } else {
      res.writeHead(404);
      res.end('dashboard.html not found — make sure it is in the same folder as server.js');
    }
    return;
  }

  // Proxy /api/news?q=... → NewsAPI
  if (req.url.startsWith('/api/news')) {
    const parsed = url.parse(req.url, true);
    const q = parsed.query.q || 'entertainment';
    const pageSize = parsed.query.pageSize || '25';
    const sortBy = parsed.query.sortBy || 'publishedAt';

    const apiPath = `/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=${sortBy}&pageSize=${pageSize}&apiKey=${API_KEY}`;

    const options = {
      hostname: 'newsapi.org',
      path: apiPath,
      method: 'GET',
      headers: { 'User-Agent': 'EntertainmentNow/1.0' }
    };

    const proxyReq = https.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
        res.end(data);
      });
    });

    proxyReq.on('error', (e) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    });

    proxyReq.end();
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('');
  console.log('  entertainmentnow newsroom proxy running');
  console.log(`  → Open http://localhost:${PORT} in your browser`);
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
