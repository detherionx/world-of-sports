import http from 'node:http';
import fs from 'node:fs/promises';
import worker from '../worker/index.js';
// Optional local secrets (Strava/TrainHeroic) live in the gitignored .env file.
try {
  process.loadEnvFile();
} catch {}
await fs.mkdir('.private/r2', { recursive: true });
// R2 stand-in: one file per object key under .private/r2/.
const file = (key) => '.private/r2/' + key.replaceAll('/', '__');
let initial;
try {
  initial = await fs.readFile('.private/bootstrap.json', 'utf8');
} catch {
  initial = JSON.stringify({
    profile: { name: 'Adventurer', sobrietyStart: new Date().toISOString().slice(0, 10) },
    sessions: [],
    races: [],
    manualRecords: [],
    coverage: 'No personal data imported',
    syncedAt: null,
  });
}
const secrets = [
  'STRAVA_CLIENT_ID',
  'STRAVA_CLIENT_SECRET',
  'STRAVA_REFRESH_TOKEN',
  'TRAINHEROIC_EMAIL',
  'TRAINHEROIC_PASSWORD',
];
const env = {
  LOCAL_DEV: '1',
  INITIAL_SNAPSHOT: initial,
  ...Object.fromEntries(secrets.filter((k) => process.env[k]).map((k) => [k, process.env[k]])),
  BUCKET: {
    get: async (key) => {
      try {
        const text = await fs.readFile(file(key), 'utf8');
        return { json: async () => JSON.parse(text) };
      } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
      }
    },
    put: async (key, value) => {
      await fs.writeFile(file(key) + '.tmp', value);
      await fs.rename(file(key) + '.tmp', file(key));
    },
    delete: (key) => fs.rm(file(key), { force: true }),
  },
};
http
  .createServer(async (req, res) => {
    try {
      if (req.headers.host !== '127.0.0.1:4173' && req.headers.host !== 'localhost:4173') {
        res.writeHead(403);
        res.end('Local-only server');
        return;
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 10_000_000) {
          res.writeHead(413);
          res.end('Too large');
          return;
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const response = await worker.fetch(
        new Request('http://' + req.headers.host + req.url, {
          method: req.method,
          headers: req.headers,
          ...(body.length ? { body } : {}),
          duplex: 'half',
        }),
        env,
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500);
      res.end('Local server error');
    }
  })
  .listen(4173, '127.0.0.1', () =>
    console.log('World of Sports: http://127.0.0.1:4173 · local access only.'),
  );
