const https = require('https');

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const CACHE_DURATION_MS = 15 * 60 * 1000;
let cache = null;

const ACCOUNTS = [
  'people',
  'tmz',
  'variety',
  'billboard',
  'enews'
];

function runApifyActor(input) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(input);
    const options = {
      hostname: 'api.apify.com',
      path: `/v2/acts/apify~instagram-post-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=120&memory=256`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('Failed to parse Apify response')); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function normalizePost(post) {
  return {
    _type: 'instagram',
    id: post.id || post.shortCode,
    username: post.ownerUsername || 'unknown',
    displayName: post.ownerFullName || post.ownerUsername || 'Unknown',
    caption: post.caption || '',
    hashtags: post.hashtags || [],
    url: post.url,
    displayUrl: post.displayUrl || null,
    videoUrl: post.videoUrl || null,
    type: post.type || 'Image',
    likesCount: post.likesCount || 0,
    commentsCount: post.commentsCount || 0,
    videoViewCount: post.videoViewCount || 0,
    timestamp: post.timestamp,
    _sortDate: new Date(post.timestamp)
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!APIFY_TOKEN) return res.status(500).json({ error: 'APIFY_TOKEN not set' });

  const now = Date.now();
  if (cache && (now - cache.timestamp) < CACHE_DURATION_MS) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cache.data);
  }

  try {
    const input = {
      username: ACCOUNTS,
      resultsType: 'posts',
      resultsLimit: 3,
      addParentData: false
    };

    const { status, body } = await runApifyActor(input);

    // Apify returns the array directly, or wraps it — handle both
    const rawPosts = Array.isArray(body) ? body
      : Array.isArray(body.detail) ? body.detail
      : null;

    if (!rawPosts) {
      return res.status(500).json({ error: 'Unexpected Apify response', detail: body });
    }

    const posts = rawPosts
      .filter(p => p.timestamp && p.url)
      .map(normalizePost)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const data = { posts, count: posts.length, fetchedAt: new Date().toISOString() };
    cache = { timestamp: now, data };

    res.setHeader('X-Cache', 'MISS');
    res.status(200).json(data);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
