import { validateSnapshot, replaceSessions, parseStravaExport, day } from '../site/model.js';
import { ASSETS } from '../dist/assets.js';
import { verifyAccess } from './access.js';
import { fetchStrava, readStravaCache } from './strava.js';
import { fetchTrainHeroic } from './trainheroic.js';
const json = (data, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const key = 'training/snapshot.json';
const MAX_BODY = 10_000_000;
async function read(env) {
  if (!env.BUCKET) throw Error('Training storage is unavailable.');
  const object = await env.BUCKET.get(key);
  if (object) return validateSnapshot(await object.json());
  const seed =
    env.INITIAL_SNAPSHOT ||
    Array.from(
      { length: Number(env.INITIAL_SNAPSHOT_PARTS || 0) },
      (_, i) => env['INITIAL_SNAPSHOT_' + i] || '',
    ).join('');
  if (!seed) throw Error('No training has been imported yet.');
  const data = validateSnapshot(JSON.parse(seed));
  await env.BUCKET.put(key, JSON.stringify(data));
  return data;
}
const write = (env, s) => env.BUCKET.put(key, JSON.stringify(validateSnapshot(s)));
function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}
async function body(request) {
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return null;
  const text = await request.text();
  return text.length > MAX_BODY ? null : text;
}
const configured = (env) => ({
  strava: !!(env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET && env.STRAVA_REFRESH_TOKEN),
  trainheroic: !!(env.TRAINHEROIC_EMAIL && env.TRAINHEROIC_PASSWORD),
});
// Each source syncs independently; one failing never blocks or erases the other.
async function sync(env) {
  const on = configured(env),
    results = {};
  if (!on.strava && !on.trainheroic) throw Error('No training source is configured.');
  if (on.strava)
    results.strava = await fetchStrava(env).then(
      (activities) => ({ ok: true, activities }),
      (e) => ({ ok: false, error: e.message }),
    );
  if (on.trainheroic)
    try {
      const th = await fetchTrainHeroic(env, day());
      const state = await read(env);
      state.sessions = replaceSessions(state.sessions, 'trainheroic', th.sessions, th.start);
      state.trainheroicSyncedAt = state.syncedAt = new Date().toISOString();
      await write(env, state);
      results.trainheroic = { ok: true, sessions: th.sessions.length };
    } catch (e) {
      results.trainheroic = { ok: false, error: e.message };
    }
  return results;
}
async function handle(request, env) {
  const u = new URL(request.url);
  if (u.pathname === '/api/state' && request.method === 'GET') {
    const s = await read(env),
      cache = await readStravaCache(env),
      on = configured(env);
    if (cache) s.sessions = replaceSessions(s.sessions, 'strava', cache.sessions);
    return json({
      ...s,
      stravaFetchedAt: cache?.fetchedAt ?? null,
      backgroundSync: on.strava || on.trainheroic,
    });
  }
  if (!u.pathname.startsWith('/api/')) {
    const asset = ASSETS[u.pathname === '/' ? '/index.html' : u.pathname];
    return asset
      ? new Response(asset.body, {
          headers: {
            'Content-Type': asset.type,
            // Code revalidates every load so a deploy never mixes old and new modules.
            'Cache-Control': u.pathname === '/avatar.png' ? 'public,max-age=86400' : 'no-cache',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy':
              "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
          },
        })
      : new Response('Not found', { status: 404 });
  }
  if (request.method !== 'POST') return json({ error: 'Not found.' }, 404);
  if (!sameOrigin(request)) return json({ error: 'Cross-origin writes are not permitted.' }, 403);
  if (u.pathname === '/api/sync') {
    try {
      const results = await sync(env);
      return json(results, Object.values(results).some((r) => r.ok) ? 200 : 502);
    } catch (e) {
      return json({ error: e.message + ' Your existing data is unchanged.' }, 503);
    }
  }
  if (u.pathname !== '/api/import' && u.pathname !== '/api/import/strava-export')
    return json({ error: 'Not found.' }, 404);
  const text = await body(request);
  if (text === null) return json({ error: 'Import is too large.' }, 413);
  let s;
  try {
    if (u.pathname === '/api/import') s = validateSnapshot(JSON.parse(text));
    else {
      s = await read(env);
      s.sessions = replaceSessions(s.sessions, 'strava', parseStravaExport(text));
      s.stravaExportImportedAt = new Date().toISOString();
      validateSnapshot(s);
    }
  } catch (e) {
    return json({ error: 'Invalid import: ' + e.message }, 400);
  }
  await write(env, s);
  return json({ ok: true, sessions: s.sessions.length });
}
export default {
  async fetch(request, env) {
    if (!env.LOCAL_DEV) {
      if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD)
        return new Response('Cloudflare Access is not configured; private data stays hidden.', {
          status: 503,
        });
      if (!(await verifyAccess(request, env))) return new Response('Forbidden', { status: 403 });
    }
    try {
      return await handle(request, env);
    } catch {
      return json({ error: 'Training storage is unavailable. No records were erased.' }, 503);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      sync(env).then(
        (r) => console.log('Training sync', JSON.stringify(r)),
        (e) => console.error('Training sync failed; stored snapshot retained.', e.message),
      ),
    );
  },
};
