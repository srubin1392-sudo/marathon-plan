exports.handler = async (event) => {
  const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
  const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  const authHeader = event.headers.authorization || '';
  let accessToken = authHeader.replace('Bearer ', '');
  const refreshToken = event.queryStringParameters?.refresh_token;
  const tokenExpires = parseInt(event.queryStringParameters?.expires_at || '0');
  if (Date.now() / 1000 > tokenExpires - 300 && refreshToken) {
    const refreshRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: refreshToken, grant_type: 'refresh_token' })
    });
    const refreshData = await refreshRes.json();
    return { statusCode: 200, headers, body: JSON.stringify({ token_refreshed: true, access_token: refreshData.access_token, refresh_token: refreshData.refresh_token, expires_at: refreshData.expires_at }) };
  }
  if (!accessToken) return { statusCode: 401, headers, body: JSON.stringify({ error: 'No access token' }) };
  const TRAINING_START = new Date('2026-04-27T00:00:00');
  const TRAINING_START_UNIX = Math.floor(TRAINING_START.getTime() / 1000);
  const res = await fetch('https://www.strava.com/api/v3/athlete/activities?after=' + TRAINING_START_UNIX + '&per_page=100', { headers: { Authorization: 'Bearer ' + accessToken } });
  const activities = await res.json();
  if (!Array.isArray(activities)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid response' }) };
  const runs = activities.filter(a => a.type === 'Run' || a.sport_type === 'Run').map(a => {
    const date = new Date(a.start_date_local);
    const daysSinceStart = Math.floor((date - TRAINING_START) / (1000 * 60 * 60 * 24));
    const weekNum = Math.floor(daysSinceStart / 7) + 1;
    const weekKey = 'Wk ' + weekNum;
    const miles = Math.round((a.distance / 1609.34) * 100) / 100;
    const paceSecsMile = a.moving_time / (a.distance / 1609.34);
    let paceMins = Math.floor(paceSecsMile / 60);
    let paceSecs = Math.round(paceSecsMile % 60);
    if (paceSecs === 60) { paceMins++; paceSecs = 0; }
    const avgHR = a.average_heartrate || null;
    const maxHR = a.max_heartrate || null;
    let zone = null;
    if (avgHR) {
      if (avgHR < 136) zone = 'Z1';
      else if (avgHR < 151) zone = 'Z2';
      else if (avgHR < 165) zone = 'Z3';
      else if (avgHR < 180) zone = 'Z4';
      else zone = 'Z5';
    }
    const zoneColors = { Z1: '#4a90d9', Z2: '#34d399', Z3: '#f59e0b', Z4: '#FC4C02', Z5: '#c084fc' };
    const h = Math.floor(a.moving_time / 3600);
    const m = Math.floor((a.moving_time % 3600) / 60);
    const s = a.moving_time % 60;
    const totalTime = h > 0 ? h + ':' + ('0'+m).slice(-2) + ':' + ('0'+s).slice(-2) : m + ':' + ('0'+s).slice(-2);
    return {
      id: a.id,
      name: a.name,
      date: a.start_date_local.split('T')[0],
      dayOfWeek: date.getDay(),
      weekKey,
      weekNum,
      miles,
      movingTime: a.moving_time,
      pace: paceMins + ':' + paceSecs.toString().padStart(2, '0'),
      totalTime,
      avgHR,
      maxHR,
      zone,
      zoneColor: zone ? zoneColors[zone] : '#9a9a9a',
      isLongRun: miles >= 10,
      elevationGain: Math.round((a.total_elevation_gain || 0) * 3.28084)
    };
  });
  const weeklyMileage = {};
  runs.forEach(run => {
    if (!weeklyMileage[run.weekKey]) weeklyMileage[run.weekKey] = { miles: 0, runs: [] };
    weeklyMileage[run.weekKey].miles = Math.round((weeklyMileage[run.weekKey].miles + run.miles) * 100) / 100;
    weeklyMileage[run.weekKey].runs.push(run);
  });
  return { statusCode: 200, headers, body: JSON.stringify({ runs, weeklyMileage }) };
};
