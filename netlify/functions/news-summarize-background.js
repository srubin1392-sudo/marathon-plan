const https = require('https');
const http = require('http');
const { getStore } = require('@netlify/blobs');

const FEEDS = {
  politics: [
    { url: 'https://feeds.apnews.com/rss/apf-politics',               source: 'AP News' },
    { url: 'https://feeds.npr.org/1014/rss.xml',                      source: 'NPR' },
    { url: 'https://feeds.abcnews.com/abcnews/politicsheadlines',     source: 'ABC News' },
    { url: 'https://www.cbsnews.com/latest/rss/politics',             source: 'CBS News' },
    { url: 'https://thehill.com/feed/',                               source: 'The Hill' },
    { url: 'https://rss.politico.com/politics-news.xml',              source: 'Politico' },
    { url: 'https://www.axios.com/feeds/feed.rss',                    source: 'Axios' },
  ],
  world: [
    { url: 'https://feeds.apnews.com/rss/apf-intlnews',               source: 'AP News' },
    { url: 'http://feeds.bbci.co.uk/news/world/rss.xml',              source: 'BBC' },
    { url: 'https://www.aljazeera.com/xml/rss/all.xml',               source: 'Al Jazeera' },
    { url: 'https://feeds.npr.org/1004/rss.xml',                      source: 'NPR' },
    { url: 'https://www.theguardian.com/world/rss',                   source: 'The Guardian' },
    { url: 'https://feeds.reuters.com/reuters/worldNews',             source: 'Reuters' },
  ],
  sports: [
    { url: 'https://www.espn.com/espn/rss/nba/news',                  source: 'ESPN NBA' },
    { url: 'https://www.espn.com/espn/rss/nfl/news',                  source: 'ESPN NFL' },
    { url: 'https://www.espn.com/espn/rss/mlb/news',                  source: 'ESPN MLB' },
    { url: 'https://feeds.apnews.com/rss/apf-sports',                 source: 'AP News' },
    { url: 'https://www.cbssports.com/rss/headlines/nba/',            source: 'CBS Sports NBA' },
    { url: 'https://www.cbssports.com/rss/headlines/nfl/',            source: 'CBS Sports NFL' },
    { url: 'https://sports.yahoo.com/nba/rss.xml',                    source: 'Yahoo NBA' },
    { url: 'https://sports.yahoo.com/nfl/rss.xml',                    source: 'Yahoo NFL' },
    { url: 'https://www.theringer.com/rss/index.xml',                 source: 'The Ringer' },
    { url: 'https://bleacherreport.com/rss',                          source: 'Bleacher Report' },
    { url: 'https://profootballtalk.nbcsports.com/feed/',             source: 'ProFootballTalk' },
  ],
  local: [
    { url: 'https://gothamist.com/feed',                              source: 'Gothamist' },
    { url: 'https://thecity.nyc/feed/',                               source: 'The City' },
    { url: 'https://ny.curbed.com/rss/index.xml',                     source: 'Curbed NY' },
    { url: 'https://nyc.streetsblog.org/feed/',                       source: 'Streetsblog' },
    { url: 'https://www.wnyc.org/feeds/shows/newsbeat',               source: 'WNYC' },
    { url: 'https://www.nydailynews.com/arcio/rss/',                  source: 'NY Daily News' },
  ],
  eats: [
    { url: 'https://ny.eater.com/rss/index.xml',                      source: 'Eater NY' },
    { url: 'https://www.grubstreet.com/rss/index.xml',                source: 'Grub Street' },
    { url: 'https://www.timeout.com/newyork/rss',                     source: 'Time Out NY' },
    { url: 'https://www.seriouseats.com/feeds/all',                   source: 'Serious Eats' },
    { url: 'https://ny.curbed.com/rss/index.xml',                     source: 'Curbed NY' },
  ],
  entertainment: [
    { url: 'https://variety.com/feed/',                               source: 'Variety' },
    { url: 'https://deadline.com/feed/',                              source: 'Deadline' },
    { url: 'https://www.hollywoodreporter.com/feed/',                 source: 'Hollywood Reporter' },
    { url: 'https://www.vulture.com/rss/index.xml',                   source: 'Vulture' },
    { url: 'https://people.com/feed/',                                source: 'People' },
    { url: 'https://www.tmz.com/rss.xml',                             source: 'TMZ' },
    { url: 'https://ew.com/feed/',                                    source: 'EW' },
  ],
};

function fetchUrl(url, redirectsLeft = 4) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 8000);
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSS-Reader/1.0)' } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        clearTimeout(timer);
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        fetchUrl(next, redirectsLeft - 1).then(resolve).catch(reject);
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => body += d);
      res.on('end', () => { clearTimeout(timer); resolve(body); });
    }).on('error', e => { clearTimeout(timer); reject(e); });
  });
}

function stripHtml(s) {
  return (s || '')
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .trim();
}

function extractText(item, tag) {
  const cdata = item.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`, 'i'));
  if (cdata) return cdata[1].trim();
  const plain = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return plain ? stripHtml(plain[1]) : '';
}

function extractLink(item) {
  const href = item.match(/<link[^>]+href="([^"]+)"/i);
  if (href?.[1]?.startsWith('http')) return href[1];
  const content = item.match(/<link[^>]*>\s*(https?:\/\/[^\s<]+)/i);
  if (content) return content[1].trim();
  const guid = item.match(/<guid[^>]*>(https?:\/\/[^\s<]+)<\/guid>/i);
  if (guid) return guid[1].trim();
  return '';
}

function extractImage(item) {
  return (
    item.match(/<media:content[^>]+url="([^"]+)"/i)?.[1] ||
    item.match(/<media:thumbnail[^>]+url="([^"]+)"/i)?.[1] ||
    item.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="image/i)?.[1] ||
    null
  );
}

function parseDate(s) {
  if (!s) return new Date().toISOString();
  try { const d = new Date(s); return isNaN(d) ? new Date().toISOString() : d.toISOString(); }
  catch { return new Date().toISOString(); }
}

function isPodcast(item) {
  if (/<enclosure[^>]+type="audio\//i.test(item)) return true;
  if (/soundcloud\.com|podcasts\.apple\.com|spotify\.com\/episode|anchor\.fm/i.test(item)) return true;
  return false;
}

function parseRSS(xml, source) {
  const raw = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  return raw.slice(0, 50).flatMap(item => {
    if (isPodcast(item)) return [];
    const title = extractText(item, 'title');
    const link = extractLink(item);
    if (!title || !link) return [];
    return [{
      title, link,
      description: (extractText(item, 'description') || extractText(item, 'summary') || '').slice(0, 600),
      time: parseDate(extractText(item, 'pubDate') || extractText(item, 'published')),
      image: extractImage(item),
      source,
    }];
  });
}

async function fetchFeed({ url, source }) {
  try { return parseRSS(await fetchUrl(url), source); }
  catch (e) { console.warn(`Feed skipped (${source}): ${e.message}`); return []; }
}

function toFallback(articles, category) {
  return articles.slice(0, 5).map(a => ({
    id: a.link, headline: a.title,
    summary: a.description,
    category, time: a.time, url: a.link,
    thumbnail: a.image || null, sources: [a.source],
  }));
}

function deduplicateArticles(articles) {
  const seen = [];
  return articles.filter(a => {
    const words = new Set(
      a.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3)
    );
    const isDup = seen.some(s => [...words].filter(w => s.has(w)).length >= 4);
    if (!isDup) seen.push(words);
    return !isDup;
  });
}

async function summarize(articles, category) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  // Take articles from the last 24h, deduplicated, capped at 15 for Claude
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recent = deduplicateArticles(
    articles
      .filter(a => new Date(a.time).getTime() > cutoff)
      .sort((a, b) => new Date(b.time) - new Date(a.time))
  ).slice(0, 15);
  if (!apiKey || !recent.length) return toFallback(recent, category);

  const catLabel = {
    politics: 'US politics',
    world: 'world news',
    sports: 'sports — prioritize NBA and NFL heavily; include notable MLB news; for soccer, only major events (World Cup, Champions League); skip all other sports',
    local: 'New York City local news and politics — city government, housing, transportation, crime, and local issues',
    eats: 'New York City food scene — restaurant openings, bar news, chef news, food events, and notable dining',
    entertainment: 'entertainment — movies, TV shows, celebrity gossip, reality TV, awards, and pop culture',
  }[category] || category;

  const articlesText = recent.map((a, i) =>
    `#${i + 1} [${a.source}] ${a.title}\n${a.description}`
  ).join('\n\n');

  const prompt = `You are a news editor writing comprehensive briefings for a mobile news app covering ${catLabel}.

CRITICAL RULES:
1. DO NOT copy or paraphrase the opening sentences of any single article. The reader already sees the headline.
2. Pull specific facts, names, numbers, and quotes from MULTIPLE sources and weave them together.
3. Every summary must read like a fully reported story — not a teaser or opener.

Group the articles below by story. Pick the 6 most newsworthy distinct stories, prioritizing variety across different topics and time periods — do not cluster on just the latest breaking news if there are important earlier stories.

For each story write a summary that is 8-10 sentences (~200 words). It must:
- Open with the most important new development (not the headline restated)
- Include specific facts: names, numbers, dates, locations, quotes
- Draw on details from multiple outlets to build a complete picture
- Explain why it matters and what comes next
- Flow as a single narrative paragraph — no bullet points, no headers

Return ONLY a valid JSON array, no markdown:
[{"headline":"Specific informative headline","summary":"Full 8-10 sentence narrative...","sources":["AP News","Reuters"],"primary_id":1}]

primary_id = #N of the article with the most detail.

Articles:
${articlesText}`;

  const reqBody = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3500,
    messages: [{ role: 'user', content: prompt }],
  });

  let rawResponse = '';
  try {
    rawResponse = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Claude timeout')), 20000);
      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(reqBody),
        },
      }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => { clearTimeout(timer); resolve(d); });
      });
      req.on('error', e => { clearTimeout(timer); reject(e); });
      req.write(reqBody);
      req.end();
    });

    const json = JSON.parse(rawResponse);
    if (json.error) throw new Error(`API error: ${json.error.type} — ${json.error.message}`);
    const text = json.content?.[0]?.text || '';
    console.log(`Claude OK for ${category}, chars: ${text.length}`);
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error(`no JSON array. Got: ${text.slice(0, 200)}`);
    const selected = JSON.parse(match[0]);

    return selected.map(s => {
      const orig = recent[s.primary_id - 1] || recent[0];
      return {
        id: orig.link,
        headline: s.headline || orig.title,
        summary: s.summary || orig.description,
        category, time: orig.time, url: orig.link,
        thumbnail: orig.image || null,
        sources: Array.isArray(s.sources) ? s.sources : [orig.source],
      };
    });
  } catch (e) {
    console.warn(`Claude FAILED for ${category}: ${e.message}`);
    console.warn(`Raw: ${rawResponse.slice(0, 300)}`);
    return toFallback(recent, category);
  }
}

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    console.log('news-summarize: fetching feeds...');
    const [polRaw, worldRaw, sportsRaw, localRaw, eatsRaw, entRaw] = await Promise.all([
      Promise.all(FEEDS.politics.map(fetchFeed)).then(r => r.flat()),
      Promise.all(FEEDS.world.map(fetchFeed)).then(r => r.flat()),
      Promise.all(FEEDS.sports.map(fetchFeed)).then(r => r.flat()),
      Promise.all(FEEDS.local.map(fetchFeed)).then(r => r.flat()),
      Promise.all(FEEDS.eats.map(fetchFeed)).then(r => r.flat()),
      Promise.all(FEEDS.entertainment.map(fetchFeed)).then(r => r.flat()),
    ]);
    console.log('Feeds done. Running Claude sequentially...');

    // Sequential so we never hit concurrent rate limits
    const politics      = await summarize(polRaw,   'politics');
    const world         = await summarize(worldRaw,  'world');
    const sports        = await summarize(sportsRaw, 'sports');
    const local         = await summarize(localRaw,  'local');
    const eats          = await summarize(eatsRaw,   'eats');
    const entertainment = await summarize(entRaw,    'entertainment');

    // Load today's existing cache and merge — so stories accumulate across runs
    const store = getStore({ name: 'news-cache', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_TOKEN });
    let existing = null;
    try { existing = await store.get('latest', { type: 'json' }); } catch {}

    const todayStr = new Date().toDateString();
    const sameDay = existing?.date === todayStr;

    // Merge fresh stories with today's existing stories; cap each category at 20
    function mergeCategory(prev, fresh) {
      if (!sameDay || !prev?.length) return fresh;
      const seen = new Set(prev.map(a => a.id));
      const added = fresh.filter(a => !seen.has(a.id));
      return [...prev, ...added]
        .sort((a, b) => new Date(b.time) - new Date(a.time))
        .slice(0, 30);
    }

    const mp = mergeCategory(existing?.politics,      politics);
    const mw = mergeCategory(existing?.world,         world);
    const ms = mergeCategory(existing?.sports,        sports);
    const ml = mergeCategory(existing?.local,         local);
    const me = mergeCategory(existing?.eats,          eats);
    const mn = mergeCategory(existing?.entertainment, entertainment);

    const all = [...mp, ...ml, ...me, ...mn, ...ms, ...mw]
      .sort((a, b) => new Date(b.time) - new Date(a.time));

    const result = {
      all, politics: mp, world: mw, sports: ms, local: ml, eats: me, entertainment: mn,
      generatedAt: new Date().toISOString(),
      date: todayStr,
    };

    await store.setJSON('latest', result);
    console.log(`news-summarize: done. stories: ${all.length} total (${sameDay ? 'merged' : 'fresh day'})`);

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, generatedAt: result.generatedAt }) };
  } catch (err) {
    console.error('news-summarize error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
