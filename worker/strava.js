import { fromStrava } from '../site/model.js';
// Strava API Policy (June 2026) allows caching API data for at most 7 days. The full activity
// list is therefore re-fetched on every sync into its own object, and ignored + deleted once
// stale. Durable Strava history comes from the athlete's own "Download your data" export.
const TOKEN_KEY = 'strava/token.json';
const CACHE_KEY = 'strava/api-cache.json';
const MAX_AGE = 7 * 86400000;

async function accessToken(env) {
  const saved = await (await env.BUCKET.get(TOKEN_KEY))?.json();
  if (saved?.expires_at * 1000 > Date.now() + 60000) return saved.access_token;
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      // Strava rotates refresh tokens, so the stored one wins over the bootstrap secret.
      refresh_token: saved?.refresh_token || env.STRAVA_REFRESH_TOKEN,
    }),
  });
  if (!r.ok) throw Error(`Strava token refresh failed (${r.status}).`);
  const { access_token, refresh_token, expires_at } = await r.json();
  await env.BUCKET.put(TOKEN_KEY, JSON.stringify({ access_token, refresh_token, expires_at }));
  return access_token;
}

export async function fetchStrava(env) {
  const token = await accessToken(env);
  const sessions = [];
  for (let page = 1; page <= 50; page++) {
    const r = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=200&page=${page}`,
      { headers: { Authorization: 'Bearer ' + token } },
    );
    if (!r.ok) throw Error(`Strava activities request failed (${r.status}).`);
    const batch = await r.json();
    sessions.push(...batch.map(fromStrava));
    if (batch.length < 200) break;
  }
  await env.BUCKET.put(
    CACHE_KEY,
    JSON.stringify({ fetchedAt: new Date().toISOString(), sessions }),
  );
  return sessions.length;
}

export async function readStravaCache(env) {
  const cache = await (await env.BUCKET.get(CACHE_KEY))?.json();
  if (cache && Date.now() - Date.parse(cache.fetchedAt) <= MAX_AGE) return cache;
  if (cache) await env.BUCKET.delete(CACHE_KEY);
  return null;
}
