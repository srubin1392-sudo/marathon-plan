const https = require('https');
const http = require('http');

const FEEDS = {
  politics: [
    { url: 'https://feeds.apnews.com/rss/apf-politics',               source: 'AP News' },
    { url: 'http://rss.cnn.com/rss/cnn_allpolitics.rss',              source: 'CNN' },
    { url: 'https://feeds.npr.org/1014/rss.xml',                      source: 'NPR' },
    { url: 'https://feeds.abcnews.com/abcnews/politicsheadlines',     source: 'ABC News' },
    { url: 'https://www.cbsnews.com/latest/rss/politics',             source: 'CBS News' },
    { url: 'https://thehill.com/feed/',                               source: 'The Hill' },
    { url: 'https://rss.politico.com/politics-news.xml',              source: 'Politico' },
  ],
  world: [
    { url: 'https://feeds.apnews.com/rss/apf-intlnews',               source: 'AP News' },
    { url: 'http://feeds.bbci.co.uk/news/world/rss.xml',              source: 'BBC' },
    { url: 'http://rss.cnn.com/rss/cnn_world.rss',                    source: 'CNN' },
    { url: 'https://www.aljazeera.com/xml/rss/all.xml',               source: 'Al Jazeera' },
    { url: 'https://feeds.npr.org/1004/rss.xml',                      source: 'NPR' },
    { url: 'https://www.theguardian.com/world/rss',                   source: 'The Guardian' },
    { url: 'https://feeds.reuters.com/reuters/worldNews',             source: 'Reuters' },
  ],
  sports: [
    { url: 'https://www.espn.com/espn/rss/nba/news',                  source: 'ESPN NBA' },
    { url: 'https://www.espn.com/espn/rss/nfl/news',                  source: 'ESPN NFL' },
    { url: 'https://www.espn.com/espn/rss/mlb/news',                  source: 'ESPN MLB' },
    { url: 'https://www.espn.com/espn/rss/soccer/news',               source: 'ESPN Soccer' },
    { url: 'https://feeds.apnews.com/rss/apf-sports',                 source: 'AP News' },
    { url: 'https://www.cbssports.com/rss/headlines/nba/',            source: 'CBS Sports NBA' },
    { url: 'https://www.cbssports.com/rss/headlines/nfl/',            source: 'CBS Sports NFL' },
    { url: 'https://sports.yahoo.com/nba/rss.xml',                    source: 'Yahoo NBA' },
    { url: 'https://sports.yahoo.com/nfl/rss.xml',                    source: 'Yahoo NFL' },
  ],
  local: [
    { url: 'https://ny.eater.com/rss/index.xml',                      source: 'Eater NY' },
    { url: 'https://www.grubstreet.com/rss/index.xml',                source: 'Grub Street' },
    { url: 'https://gothamist.com/feed',                              source: 'Gothamist' },
    { url: 'https://www.timeout.com/newyork/rss',                     source: 'Time Out NY' },
  ],
};

function fetchUrl(url, redirectsLeft = 4) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 6000);
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
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
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
  try {
    const d = new Date(s);
    return isNaN(d) ? new Date().toISOString() : d.toISOString();
  } catch { return new Date().toISOString(); }
}

function parseRSS(xml, source) {
  const raw = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  return raw.slice(0, 20).flatMap(item => {
    const title = extractText(item, 'title');
    const link = extractLink(item);
    if (!title || !link) return [];
    return [{
      title,
      link,
      description: (extractText(item, 'description') || extractText(item, 'summary') || '').slice(0, 300),
      time: parseDate(extractText(item, 'pubDate') || extractText(item, 'published')),
      image: extractImage(item),
      source,
    }];
  });
}

async function fetchFeed({ url, source }) {
  try {
    return parseRSS(await fetchUrl(url), source);
  } catch (e) {
    console.warn(`Feed skipped (${source}): ${e.message}`);
    return [];
  }
}

function toFallback(articles, category) {
  return articles.slice(0, 8).map(a => ({
    id: a.link,
    headline: a.title,
    summary: a.description.slice(0, 200),
    category,
    time: a.time,
    url: a.link,
    thumbnail: a.image || null,
    sources: [a.source],
  }));
}

async function summarize(articles, category) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Sort newest first, cap at 25 articles sent to Claude
  const recent = articles
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 50);

  if (!apiKey || !recent.length) return toFallback(recent, category);

  const catLabel = {
    politics: 'US politics',
    world: 'world news',
    sports: 'sports — prioritize NBA and NFL heavily; include notable MLB news; for soccer, only cover major events (World Cup, Champions League, big international results); skip all other sports',
    local: 'New York City — restaurants, bars, food scene, events, and cool new openings',
  }[category] || category;

  const articlesText = recent.map((a, i) =>
    `#${i + 1} [${a.source}] ${a.title}\n${a.description}`
  ).join('\n\n');

  const prompt = `You are a news editor for a mobile news app. Below are recent ${catLabel} articles from multiple outlets. Different outlets often cover the same story.

Group articles by story, then synthesize details from ALL outlets covering each story into one thorough summary. Pick the 8 most important distinct stories.

Return ONLY a JSON array — no markdown, no explanation:
[{"headline":"Sharp specific headline","summary":"A thorough 5-7 sentence paragraph (~150 words) synthesizing all sources. Cover: what happened, key details and context, different angles or reactions from the various outlets, and what it means or what comes next. The reader should feel fully informed without needing to read the original articles.","sources":["AP News","CNN"],"primary_id":1}]

primary_id = the article number (#N) of the most complete version (used for the link).

Articles:
${articlesText}`;

  const reqBody = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  try {
    const raw = await new Promise((resolve, reject) => {
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

    const json = JSON.parse(raw);
    const text = json.content?.[0]?.text || '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('no JSON array in Claude response');
    const selected = JSON.parse(match[0]);

    return selected.map(s => {
      const orig = recent[s.primary_id - 1] || recent[0];
      return {
        id: orig.link,
        headline: s.headline || orig.title,
        summary: s.summary || orig.description.slice(0, 200),
        category,
        time: orig.time,
        url: orig.link,
        thumbnail: orig.image || null,
        sources: Array.isArray(s.sources) ? s.sources : [orig.source],
      };
    });
  } catch (e) {
    console.warn(`Claude failed for ${category}: ${e.message}`);
    return toFallback(recent, category);
  }
}

exports.handler = async event => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const [polRaw, worldRaw, sportsRaw, localRaw] = await Promise.all([
      Promise.all(FEEDS.politics.map(fetchFeed)).then(r => r.flat()),
      Promise.all(FEEDS.world.map(fetchFeed)).then(r => r.flat()),
      Promise.all(FEEDS.sports.map(fetchFeed)).then(r => r.flat()),
      Promise.all(FEEDS.local.map(fetchFeed)).then(r => r.flat()),
    ]);

    const [politics, world, sports, local] = await Promise.all([
      summarize(polRaw, 'politics'),
      summarize(worldRaw, 'world'),
      summarize(sportsRaw, 'sports'),
      summarize(localRaw, 'local'),
    ]);

    const all = [...politics, ...world, ...sports, ...local]
      .sort((a, b) => new Date(b.time) - new Date(a.time));

    return { statusCode: 200, headers, body: JSON.stringify({ all, politics, world, sports, local }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
