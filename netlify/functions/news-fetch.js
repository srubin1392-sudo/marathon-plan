const https = require('https');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const apiKey = process.env.GUARDIAN_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'GUARDIAN_API_KEY not set in Netlify environment variables.' }) };
  }

  const stripHtml = (str) => str ? str.replace(/<[^>]*>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim() : '';

  const guardianFetch = (params) => new Promise((resolve, reject) => {
    const qs = new URLSearchParams({
      'show-fields': 'trailText,thumbnail,headline',
      'page-size': '15',
      'order-by': 'newest',
      'api-key': apiKey,
      ...params
    }).toString();
    const url = `https://content.guardianapis.com/search?${qs}`;
    https.get(url, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch(e) { reject(e); }
      });
    }).on('error', reject);
  });

  const normalize = (results, category) =>
    (results || []).map(a => ({
      id: a.id,
      headline: stripHtml(a.fields?.headline || a.webTitle),
      summary: stripHtml(a.fields?.trailText || ''),
      category,
      time: a.webPublicationDate,
      url: a.webUrl,
      thumbnail: a.fields?.thumbnail || null
    }));

  try {
    const [pol, world, sports, local] = await Promise.all([
      guardianFetch({ section: 'politics,us-news' }),
      guardianFetch({ section: 'world' }),
      guardianFetch({ section: 'sport', q: 'NFL OR NBA OR MLB OR MLS OR soccer OR tennis OR golf' }),
      guardianFetch({ section: 'us-news', q: 'new york' })
    ]);

    const politics = normalize(pol.response?.results, 'politics');
    const worldNews = normalize(world.response?.results, 'world');
    const sportsNews = normalize(sports.response?.results, 'sports');
    const localNews = normalize(local.response?.results, 'local');

    const all = [...politics, ...worldNews, ...sportsNews, ...localNews]
      .sort((a, b) => new Date(b.time) - new Date(a.time));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ all, politics, world: worldNews, sports: sportsNews, local: localNews })
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
