const https = require('https');
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const store = getStore({ name: 'news-cache', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_TOKEN });
    const cached = await store.get('latest', { type: 'json' });

    if (cached?.all?.length) {
      return { statusCode: 200, headers, body: JSON.stringify(cached) };
    }

    // No blob yet — kick off the background summarize and tell the client to poll
    const siteUrl = process.env.URL || 'https://sams-apps.netlify.app';
    const parsed = new URL('/.netlify/functions/news-summarize-background', siteUrl);
    https.request({ hostname: parsed.hostname, path: parsed.pathname, method: 'POST', headers: { 'Content-Length': 0 } }, () => {}).on('error', () => {}).end();

    return { statusCode: 200, headers, body: JSON.stringify({ loading: true }) };
  } catch (err) {
    console.error('news-fetch blob error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
