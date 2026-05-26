const https = require('https');

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const CACHE_DURATION_MS = 15 * 60 * 1000;
let cache = null;

// Scrape in batches to avoid timeout — Apify Twitter scraper is faster than Instagram
// 150 accounts total, split into 3 batches of 50
const ACCOUNTS_BATCH_1 = [
  'ABC','ABCSharkTank','AETV','AGT','AmazingRaceCBS','AmericanIdol','Andy','AP',
  'AppleTV','ArchDigest','BachelorABC','BacheloretteABC','BBMAs','BET','bflay',
  'blakeshelton','BravoTopChef','BravoTV','BravoWWHL','candacecbure',
  'carrieunderwood','CBS','CBSBigBrother','CBSMornings','CFDA',
  'CinemaBlend','CMT','CountryMusic','CourteneyCox','CriticsChoice',
  'danicamckellar','Discovery','Disney','DollyParton','enews',
  'etnow','FriendsTV','GAfamilyTV','GeneralHospital','GoldenBachABC',
  'goldenglobes','GordonRamsay','GreysABC','GuyFieri','gwenstefani',
  'hallmarkchannel','HallmarkWCTH','harrypotter','HeartlandOnCBC','HellsKitchenFOX'
];

const ACCOUNTS_BATCH_2 = [
  'hgtv','HISTORY','hulu','JerseyShore','juliannehough',
  'kardashianshulu','khloekardashian','KimKardashian','kourtneykardash','KrisJenner',
  'LatinGRAMMYs','lifetimetv','loveislandusa','mariolopezviva','MaskedSingerFOX',
  'MASTERCHEFonFOX','mgmplus','MissUniverse','MTV','MTVChallenge',
  'nbcsnl','NBCTheVoice','netflix','NFL','ninjawarrior',
  'nypost','officialdwts','OnTheRedCarpet','OscarawardsTv','PageSix',
  'paramountplus','peacock','people','playbill','PropertyBrother',
  'reba','RecordingAcad','robkardashian','RollingStone','RuPaulsDragRace',
  'SAGawards','sanbenito','SharnaBurgess','SouthernCharmTV','survivorcbs',
  'Susan_Lucci','TasteOfCountry','TeenMom','TheAcademy','TheEmmys'
];

const ACCOUNTS_BATCH_3 = [
  'TheTraitorsUS','TheView','TLC','TMZ','Variety',
  'VH1','voguemagazine','WEtv','withBAGpod','YandR_CBS',
  'Yellowstone','accesshollywood','AmericanPicker','americanpickers','Avengers',
  'BandB_CBS','Batman','BLACKPINK','blakelively','bridgerton',
  'bts_bighit','CameronMathison','CBSNews','ChelseaHouska','chipgaines',
  'DCOfficial','Deadpool','derekhough','DrDubrow','DrewBarrymore',
  'ElvisDuranShow','ErinRNapier','extratv','FoxNews','GeorgeTakei',
  'GretchenRossi','HarveyLevinTMZ','HeatherDubrow','JasonKelce','JHudShow',
  'jk_rowling','JLo','joannagaines','JonathanScott','JYPETWICE',
  'KathyHilton','katyperry','kellyclarkson','KellyClarksonTV','kellymarklive',
  'Kimzolciak','KyleRichards','LionelRichie','lukebryan','MAFSLifetime',
  'magnolia','Marvel','MrDrewScott','MSN','MSNBCDaily',
  'NBCNews','NeNeLeakes','ParisHilton','RealEricDane','RealHughJackman',
  'RyanSeacrest','scotsmanco','ScreamMovies','shondarhimes','SpiderMan',
  'StarTrek','starwars','Stray_Kids','Superman','TamraJudgeOC',
  'taylorswift13','TeddiMellencamp','Teresa_Giudice','TheWayHomeX','tkelce',
  'TomCruise','typennington','VancityReynolds','vgunvalson','weareoneEXO',
  'WilliamShatner','WillieNelson','Z100NewYork','ZooeyDeschanel'
];

function runApifyBatch(handles) {
  return new Promise((resolve, reject) => {
    const input = JSON.stringify({
      twitterHandles: handles,
      maxTweets: 3,
      addUserInfo: true
    });

    const options = {
      hostname: 'api.apify.com',
      path: `/v2/acts/apidojo~tweet-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=120&memory=256`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(input)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve([]); }
      });
    });

    req.on('error', () => resolve([]));
    req.write(input);
    req.end();
  });
}

function normalizeTweet(tweet) {
  const username = tweet.author?.userName || tweet.user?.screen_name || tweet.userName || 'unknown';
  const displayName = tweet.author?.name || tweet.user?.name || username;
  const text = tweet.text || tweet.full_text || '';
  const timestamp = tweet.createdAt || tweet.created_at || null;
  const url = tweet.url || (username !== 'unknown' ? `https://twitter.com/${username}/status/${tweet.id}` : null);

  return {
    _type: 'twitter',
    id: tweet.id || tweet.id_str,
    username,
    displayName,
    text,
    url,
    likesCount: tweet.likeCount || tweet.favorite_count || 0,
    retweetCount: tweet.retweetCount || tweet.retweet_count || 0,
    replyCount: tweet.replyCount || 0,
    viewCount: tweet.viewCount || 0,
    timestamp,
    _sortDate: timestamp ? new Date(timestamp) : new Date(0)
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
    // Run all 3 batches in parallel
    const [r1, r2, r3] = await Promise.all([
      runApifyBatch(ACCOUNTS_BATCH_1),
      runApifyBatch(ACCOUNTS_BATCH_2),
      runApifyBatch(ACCOUNTS_BATCH_3)
    ]);

    const rawTweets = [
      ...(Array.isArray(r1) ? r1 : Array.isArray(r1?.detail) ? r1.detail : []),
      ...(Array.isArray(r2) ? r2 : Array.isArray(r2?.detail) ? r2.detail : []),
      ...(Array.isArray(r3) ? r3 : Array.isArray(r3?.detail) ? r3.detail : [])
    ];

    const seen = new Set();
    const tweets = rawTweets
      .filter(t => {
        const id = t.id || t.id_str;
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return (t.text || t.full_text) && (t.createdAt || t.created_at);
      })
      .map(normalizeTweet)
      .sort((a, b) => b._sortDate - a._sortDate)
      .slice(0, 200); // cap at 200 most recent

    const data = { tweets, count: tweets.length, fetchedAt: new Date().toISOString() };
    cache = { timestamp: now, data };

    res.setHeader('X-Cache', 'MISS');
    res.status(200).json(data);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
