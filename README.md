# World of Sports

A character-led sports RPG and personal training journal. An original animated gnome has three visible evolution forms. Training earns cosmetic progress; missed sessions and rest never erase XP.

## Build

Node 22+. `npm install`, then `npm test`, or `npm run dev` for a local-only server at http://127.0.0.1:4173.

Locally, put your private snapshot at `.private/bootstrap.json` (it seeds storage on first launch) and optional source secrets in `.env` (see `.env.example`). Local storage objects live in `.private/r2/`; delete them to re-seed. Nothing under `.private/` or `.env` is committed. The local server binds to loopback only and checks Host and write origins.

`site/` is the interface, `site/model.js` the shared metrics and parsers, `worker/` the Cloudflare Worker. The build embeds the interface and avatar atlas as `dist/assets.js`; wrangler bundles the rest.

## Hosting: Cloudflare Workers + R2 + Access

The Worker **fails closed**: without `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` it serves nothing, and every request must carry a valid Cloudflare Access JWT, which the Worker verifies itself.

1. `npx wrangler login`, then `npx wrangler r2 bucket create world-of-sports`.
2. `npm run deploy`. Note the `*.workers.dev` URL.
3. Cloudflare dashboard → Workers & Pages → world-of-sports → Settings → Domains & Routes → workers.dev → enable **Cloudflare Access**. In Zero Trust → Access → Applications, restrict the policy to your email and copy the **Application Audience (AUD) tag**. Your team domain is `<team>.cloudflareaccess.com`.
4. `npx wrangler secret put ACCESS_TEAM_DOMAIN` and `npx wrangler secret put ACCESS_AUD`.
5. Seed once: `npx wrangler secret put INITIAL_SNAPSHOT < .private/bootstrap.json`.

R2 objects: `training/snapshot.json` (profile, Strava export history, TrainHeroic sessions), `strava/api-cache.json`, `strava/token.json`, `trainheroic/session.json`. A cron runs sync every 6 hours; "Refresh training" runs it on demand. Each source syncs independently and failures never erase stored data.

## Strava: export + API

Strava's API Policy (June 2026) caps cached API data at 7 days and bars feeding it to AI. So:

- **History** comes from your own export: strava.com → Settings → My Account → Download or Delete Your Account → request archive, unzip, then "Import Strava export" → `activities.csv`. Re-import any time; it replaces stored Strava history.
- **Fresh data** comes from the API: every sync re-fetches the full activity list into `strava/api-cache.json`. While that cache is under 7 days old it replaces the export view (so deletions on Strava disappear here too); once stale it is deleted and the export history shows again.

Setup: create an API app at strava.com/settings/api (Authorization Callback Domain `localhost`; the API needs a Strava subscription since June 2026). Put its ID and secret in `.env`, run `npm run strava:auth`, approve, then `npx wrangler secret put` each of `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`. The Worker stores rotated refresh tokens in R2. Field notes are deterministic; don't add LLM analysis of Strava data.

The official Strava MCP is for AI assistants only and can't be used by this server.

## TrainHeroic: unofficial SDK

TrainHeroic has no public API. Sync uses the community [`@trainheroic-unofficial/js`](https://github.com/alandotcom/trainheroic-unofficial) SDK (pinned) against the web app's undocumented endpoints, logging in with your credentials: `npx wrangler secret put TRAINHEROIC_EMAIL` / `TRAINHEROIC_PASSWORD`. Each sync replaces logged sessions in the last 35 days (keeping manual date overrides); older sessions stay as stored. A TrainHeroic-side change can break sync without warning; stored data is kept when it does.

## Progression

- Run/logged strength: 100 XP; walk/elliptical: 50 XP. Unique IDs prevent duplicate credit.
- Levels every 500 XP. Cosmetic forms at 0 / 1000 / 3000 XP. Future-form previews do not change progress.
- XP reflects the imported block, not lifetime fitness. Harder effort earns no bonus. Rest never removes XP.
- Berlin calendar dates govern sobriety and countdowns; completed days differ from ordinal day.
- Comments override equipment titles. Smith, BB, DB and calf-machine variants remain separate. Records are best IN IMPORTED BLOCK, never claimed all-time.
- User-reported running PRs stay unverified. GPS race activities are not official result times. Bench weights are per DB; split-squat weights combined DBs.
- Average Z2 HR is not measured zone duration. No fabricated readiness or strength ranking.

## Verification

`npm test` covers date boundaries, evolution, variants, duplicate rejection, Strava export parsing, the 7-day Strava cache, source refresh windows, and Access JWT enforcement. The Strava export parser is written to Strava's documented `activities.csv` columns; check the first real import.
