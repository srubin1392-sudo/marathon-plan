exports.handler = async (event) => {
  const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
  const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
  const REDIRECT_URI = 'https://sams-marathon-plan.netlify.app/.netlify/functions/strava-auth';
  const { code } = event.queryStringParameters || {};
  if (!code) {
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&approval_prompt=force&scope=activity:read_all`;
    return { statusCode: 302, headers: { Location: authUrl }, body: '' };
  }
  try {
    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI })
    });
    const data = await response.json();
    const html = `<!DOCTYPE html><html><head><title>Connected!</title><style>body{background:#0a0e1a;color:#f0f0f0;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:16px;}h1{color:#FC4C02;}</style></head><body><h1>Strava Connected!</h1><p style="color:#9a9a9a;">You can close this window.</p><script>localStorage.setItem('strava_access_token','${data.access_token}');localStorage.setItem('strava_refresh_token','${data.refresh_token}');localStorage.setItem('strava_token_expires','${data.expires_at}');setTimeout(()=>{window.close();},2000);</script></body></html>`;
    return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: html };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
