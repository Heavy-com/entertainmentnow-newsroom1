// api/news.js — Vercel serverless function
// Proxies requests to NewsAPI so the browser key restriction is bypassed

const https = require('https');

const API_KEY = process.env.NEWS_API_KEY || 'eba3bb2993124fb0b3c1117f7535afc2';

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const q = req.query.q || 'entertainment';
  const pageSize = req.query.pageSize || '25';
  const sortBy = req.query.sortBy || 'publishedAt';

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
      res.status(proxyRes.statusCode).json(JSON.parse(data));
    });
  });

  proxyReq.on('error', (e) => {
    res.status(500).json({ error: e.message });
  });

  proxyReq.end();
};
