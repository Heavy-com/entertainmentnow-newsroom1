const https = require('https');

const CACHE_DURATION_MS = 15 * 60 * 1000;
let cache = null;

const ACCOUNTS = [
  'ABC','ABCSharkTank','AETV','AGT','AmazingRaceCBS','AmericanIdol','Andy','AP',
  'AppleTV','ArchDigest','BachelorABC','BacheloretteABC','BBMAs','BET','bflay',
  'blakeshelton','BravoTopChef','BravoTV','BravoWWHL','candacecbure',
  'carrieunderwood','CBS','CBSBigBrother','CBSMornings','CFDA',
  'CinemaBlend','CMT','CountryMusic','CourteneyCox','CriticsChoice',
  'danicamckellar','Discovery','Disney','DollyParton','enews',
  'etnow','FriendsTV','GAfamilyTV','GeneralHospital','GoldenBachABC',
  'goldenglobes','GordonRamsay','GreysABC','GuyFieri','gwenstefani',
  'hallmarkchannel','HallmarkWCTH','harrypotter','HeartlandOnCBC','HellsKitchenFOX',
  'hgtv','HISTORY','hulu','JerseyShore','juliannehough',
  'kardashianshulu','khloekardashian','KimKardashian','kourtneykardash','KrisJenner',
  'LatinGRAMMYs','lifetimetv','loveislandusa','mariolopezviva','MaskedSingerFOX',
  'MASTERCHEFonFOX','mgmplus','MissUniverse','MTV','MTVChallenge',
  'nbcsnl','NBCTheVoice','netflix','NFL','ninjawarrior',
  'nypost','officialdwts','OnTheRedCarpet','OscarawardsTv','PageSix',
  'paramountplus','peacock','people','playbill','PropertyBrother',
  'reba','RecordingAcad','robkardashian','RollingStone','RuPaulsDragRace',
  'SAGawards','sanbenito','SharnaBurgess','SouthernCharmTV','survivorcbs',
  'Susan_Lucci','TasteOfCountry','TeenMom','TheAcademy','TheEmmys',
  'TheTraitorsUS','TheView','TLC','TMZ','Variety',
  'VH1','voguemagazine','WEtv','withBAGpod','YandR_CBS',
  'Yellowstone','accesshollywood','americanpickers','Avengers',
  'BandB_CBS','Batman','BLACKPINK','blakelively','bridgerton',
  'bts_bighit','CameronMathison','CBSNews','ChelseaHouska','chipgaines',
  'DCOfficial','Deadpool','derekhough','DrDubrow','DrewBarrymore',
  'ElvisDuranShow','ErinRNapier','extratv','FoxNews','GeorgeTakei',
  'GretchenRossi','HarveyLevinTMZ','HeatherDubrow','JasonKelce','JHudShow',
  'jk_rowling','JLo','joannagaines','JonathanScott','JYPETWICE',
  'KathyHilton','katyperry','kellyclarkson','KellyClarksonTV','kellymarklive',
  'Kimzolciak','KyleRichards','LionelRichie','lukebryan','MAFSLifetime',
  'magnolia','Marvel','MrDrewScott','MSNBCDaily',
  'NBCNews','NeNeLeakes','ParisHilton','RealEricDane','RealHughJackman',
  'RyanSeacrest','ScreamMovies','shondarhimes','SpiderMan',
  'StarTrek','starwars','Stray_Kids','Superman','TamraJudgeOC',
  'taylorswift13','TeddiMellencamp','Teresa_Giudice','TheWayHomeX','tkelce',
  'TomCruise','typennington','VancityReynolds','vgunvalson',
  'WilliamShatner','WillieNelson','Z100NewYork','ZooeyDeschanel'
];

// Nitter instances to try in order
const NITTER_HOSTS = [
  'nitter.poast.org',
  'nitter.privacydev.net',
  'nitter.lucabased.space'
];

function fetchUrl(hostname, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; newsbot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      },
      timeout: 8000
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function parseRSSItems(xml, handle) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = tag => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return m ? (m[1] || m[2] || '').trim() : '';
    };
    const title = get('title');
    const link = get('link') || get('guid');
    const pubDate = get('pubDate');
    const desc = get('description');

    // Strip HTML from description to get plain text
    const text = (desc || title).replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();

    if (text && pubDate) {
      items.push({
        _type: 'twitter',
        id: link || `${handle}-${pubDate}`,
        username: handle,
        displayName: handle,
        text: text.slice(0, 560),
        url: link ? link.replace('nitter.poast.org','twitter.com').replace('nitter.privacydev.net','twitter.com').replace('nitter.lucabased.space','twitter.com') : `https://twitter.com/${handle}`,
        likesCount: 0,
        retweetCount: 0,
        replyCount: 0,
        viewCount: 0,
        timestamp: new Date(pubDate).toISOString(),
        _sortDate: new Date(pubDate)
      });
    }
  }
  return items;
}

async function fetchAccountRSS(handle) {
  for (const host of NITTER_HOSTS) {
    try {
      const { status, body } = await fetchUrl(host, `/${handle}/rss`);
      if (status === 200 && body.includes('<item>')) {
        const items = parseRSSItems(body, handle);
        if (items.length) return items.slice(0, 3);
      }
    } catch (e) {
      // try next host
    }
  }
  return [];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const now = Date.now();
  if (cache && (now - cache.timestamp) < CACHE_DURATION_MS) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cache.data);
  }

  try {
    // Fetch in parallel batches of 20 to avoid overwhelming nitter
    const results = [];
    const batchSize = 20;
    for (let i = 0; i < ACCOUNTS.length; i += batchSize) {
      const batch = ACCOUNTS.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(h => fetchAccountRSS(h)));
      results.push(...batchResults.flat());
    }

    const seen = new Set();
    const tweets = results
      .filter(t => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      })
      .sort((a, b) => b._sortDate - a._sortDate)
      .slice(0, 300);

    const data = { tweets, count: tweets.length, fetchedAt: new Date().toISOString() };
    cache = { timestamp: now, data };

    res.setHeader('X-Cache', 'MISS');
    res.status(200).json(data);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
