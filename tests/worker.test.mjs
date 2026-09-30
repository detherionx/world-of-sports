import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { fromTrainHeroic } from '../worker/trainheroic.js';
const snapshot = {
  profile: { sobrietyStart: '2026-08-30' },
  sessions: [
    {
      id: 'strava:1',
      source: 'strava',
      date: '2026-09-28',
      type: 'Run',
      movingTime: 600,
      distance: 1000,
    },
  ],
};
const memory = new Map();
const env = {
  LOCAL_DEV: '1',
  INITIAL_SNAPSHOT_PARTS: '2',
  INITIAL_SNAPSHOT_0: JSON.stringify(snapshot).slice(0, 30),
  INITIAL_SNAPSHOT_1: JSON.stringify(snapshot).slice(30),
  BUCKET: {
    get: async (k) => (memory.has(k) ? { json: async () => JSON.parse(memory.get(k)) } : null),
    put: async (k, v) => memory.set(k, v),
    delete: async (k) => memory.delete(k),
  },
};
test('Snapshot bootstraps privately and persists', async () => {
  const r = await worker.fetch(new Request('https://example.com/api/state'), env);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).sessions.length, 1);
  assert.equal(memory.size, 1);
});
test('Unconfigured sync preserves existing training', async () => {
  const before = memory.get('training/snapshot.json');
  const r = await worker.fetch(
    new Request('https://example.com/api/sync', { method: 'POST' }),
    env,
  );
  assert.equal(r.status, 503);
  assert.equal(memory.get('training/snapshot.json'), before);
});
test('Cross origin writes rejected', async () => {
  const r = await worker.fetch(
    new Request('https://example.com/api/import', {
      method: 'POST',
      headers: { Origin: 'https://other.example' },
      body: JSON.stringify(snapshot),
    }),
    env,
  );
  assert.equal(r.status, 403);
});
test('Character assets and page serve with correct MIME', async () => {
  for (const [path, type] of [
    ['/', 'text/html'],
    ['/avatar.png', 'image/png'],
    ['/app.js', 'text/javascript'],
  ]) {
    const r = await worker.fetch(new Request('https://example.com' + path), env);
    assert.equal(r.status, 200);
    assert.ok(r.headers.get('content-type').startsWith(type));
  }
});
test('Malformed import is a 400 and keeps stored training', async () => {
  const before = memory.get('training/snapshot.json');
  for (const body of ['{not json', JSON.stringify({ sessions: [] })]) {
    const r = await worker.fetch(
      new Request('https://example.com/api/import', { method: 'POST', body }),
      env,
    );
    assert.equal(r.status, 400);
  }
  assert.equal(memory.get('training/snapshot.json'), before);
});
const realFetch = globalThis.fetch;
const mockFetch = (routes) =>
  (globalThis.fetch = async (url) => {
    const hit = Object.entries(routes).find(([prefix]) => String(url).startsWith(prefix));
    if (!hit) throw Error('Unexpected fetch ' + url);
    return Response.json(hit[1]);
  });
const stravaEnv = {
  ...env,
  STRAVA_CLIENT_ID: '1',
  STRAVA_CLIENT_SECRET: 's',
  STRAVA_REFRESH_TOKEN: 'r1',
};
const stateIds = async () =>
  (
    await (await worker.fetch(new Request('https://example.com/api/state'), env)).json()
  ).sessions.map((s) => s.id);
test('Strava sync caches the API list, which replaces stored Strava sessions while fresh', async (t) => {
  t.after(() => (globalThis.fetch = realFetch));
  mockFetch({
    'https://www.strava.com/oauth/token': {
      access_token: 'a',
      refresh_token: 'r2',
      expires_at: Date.now() / 1000 + 3600,
    },
    'https://www.strava.com/api/v3/athlete/activities': [
      {
        id: 2,
        sport_type: 'TrailRun',
        name: 'Hills',
        start_date_local: '2026-09-29T07:00:00Z',
        distance: 8000,
        moving_time: 3000,
        elapsed_time: 3100,
      },
    ],
  });
  const r = await worker.fetch(
    new Request('https://example.com/api/sync', { method: 'POST' }),
    stravaEnv,
  );
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { strava: { ok: true, activities: 1 } });
  assert.equal(JSON.parse(memory.get('strava/token.json')).refresh_token, 'r2');
  assert.deepEqual(await stateIds(), ['strava:2']);
});
test('Strava API cache older than 7 days is deleted and stored history returns', async () => {
  const cache = JSON.parse(memory.get('strava/api-cache.json'));
  cache.fetchedAt = new Date(Date.now() - 8 * 86400000).toISOString();
  memory.set('strava/api-cache.json', JSON.stringify(cache));
  assert.deepEqual(await stateIds(), ['strava:1']);
  assert.equal(memory.has('strava/api-cache.json'), false);
});
test('Strava export import replaces stored Strava history; bad CSV is a 400', async () => {
  const post = (body) =>
    worker.fetch(
      new Request('https://example.com/api/import/strava-export', { method: 'POST', body }),
      env,
    );
  const csv =
    'Activity ID,Activity Date,Activity Name,Activity Type,Elapsed Time,Distance,Moving Time\n' +
    '7,"Sep 20, 2026, 6:00:00 AM",Easy,Run,1900,5000,1800\n';
  assert.equal((await post(csv)).status, 200);
  assert.deepEqual(await stateIds(), ['strava:7']);
  assert.equal((await post('a,b\n1,2')).status, 400);
  assert.deepEqual(await stateIds(), ['strava:7']);
});
test('TrainHeroic workouts keep only logged exercises', () => {
  const s = fromTrainHeroic({
    id: 9,
    date: '2026-09-29',
    program: 'Base',
    rpe: 7,
    blocks: [
      {
        exercises: [
          { title: 'Squat', performed: ['5 @ 100'] },
          { title: 'Row', performed: [] },
        ],
      },
    ],
  });
  assert.equal(s.id, 'trainheroic:9');
  assert.deepEqual(
    s.exercises.map((e) => e.title),
    ['Squat'],
  );
});
test('Production refuses to serve without a valid Cloudflare Access token', async (t) => {
  t.after(() => (globalThis.fetch = realFetch));
  const prod = { ...env, LOCAL_DEV: undefined };
  const get = (headers = {}) => new Request('https://example.com/api/state', { headers });
  assert.equal((await worker.fetch(get(), prod)).status, 503);
  const access = { ...prod, ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud1' };
  assert.equal((await worker.fetch(get(), access)).status, 403);
  const alg = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { ...alg, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ['sign', 'verify'],
  );
  mockFetch({
    'https://team.cloudflareaccess.com/cdn-cgi/access/certs': {
      keys: [{ ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1' }],
    },
  });
  const b64 = (x) => Buffer.from(x).toString('base64url');
  const status = async (claims) => {
    const unsigned =
      b64(JSON.stringify({ alg: 'RS256', kid: 'k1' })) + '.' + b64(JSON.stringify(claims));
    const sig = await crypto.subtle.sign(alg, privateKey, new TextEncoder().encode(unsigned));
    const token = unsigned + '.' + b64(new Uint8Array(sig));
    return (await worker.fetch(get({ 'Cf-Access-Jwt-Assertion': token }), access)).status;
  };
  const good = {
    iss: 'https://team.cloudflareaccess.com',
    aud: ['aud1'],
    exp: Date.now() / 1000 + 60,
  };
  assert.equal(await status(good), 200);
  assert.equal(await status({ ...good, aud: ['other'] }), 403);
  assert.equal(await status({ ...good, exp: Date.now() / 1000 - 1 }), 403);
});
