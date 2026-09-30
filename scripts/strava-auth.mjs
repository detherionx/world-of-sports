import http from 'node:http';
import fs from 'node:fs/promises';
// One-time: authorize your own Strava API app for activity:read_all and save the refresh token
// to the gitignored .env. Needs STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in .env, and the
// app's "Authorization Callback Domain" set to localhost (strava.com/settings/api).
try {
  process.loadEnvFile();
} catch {}
const { STRAVA_CLIENT_ID: id, STRAVA_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) {
  console.error('Add STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET to .env first.');
  process.exit(1);
}
const redirect = 'http://localhost:8723/callback';
const server = http
  .createServer(async (req, res) => {
    const u = new URL(req.url, redirect);
    if (u.pathname !== '/callback') return res.writeHead(404).end();
    const code = u.searchParams.get('code');
    if (!code || !u.searchParams.get('scope')?.includes('activity:read_all')) {
      res.end('Authorization denied or "View data about your activities" was unticked. Retry.');
      return;
    }
    const r = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: id,
        client_secret: secret,
        code,
        grant_type: 'authorization_code',
      }),
    });
    if (!r.ok) {
      res.end('Token exchange failed: ' + r.status);
      console.error('Token exchange failed:', r.status, await r.text());
      return server.close();
    }
    const { refresh_token } = await r.json();
    let env = '';
    try {
      env = await fs.readFile('.env', 'utf8');
    } catch {}
    const line = 'STRAVA_REFRESH_TOKEN=' + refresh_token;
    env = /^STRAVA_REFRESH_TOKEN=.*$/m.test(env)
      ? env.replace(/^STRAVA_REFRESH_TOKEN=.*$/m, line)
      : env.replace(/\n?$/, '\n') + line + '\n';
    await fs.writeFile('.env', env);
    res.end('Strava connected. You can close this tab.');
    console.log('Saved STRAVA_REFRESH_TOKEN to .env.');
    console.log(
      'For Cloudflare: npx wrangler secret put STRAVA_REFRESH_TOKEN (paste it from .env).',
    );
    server.close();
  })
  .listen(8723, 'localhost', () =>
    console.log(
      'Open this URL and approve access:\n' +
        `https://www.strava.com/oauth/authorize?client_id=${id}&response_type=code` +
        `&redirect_uri=${encodeURIComponent(redirect)}&approval_prompt=force&scope=activity:read_all`,
    ),
  );
