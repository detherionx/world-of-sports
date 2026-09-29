# World of Sports

A character-led sports RPG and personal training journal. An original animated gnome has three visible evolution forms. Training earns cosmetic progress; missed sessions and rest never erase XP.

## Build

Node 22+, no package installation required. Run `npm test`, `npm run build`, or `npm run dev` for a local-only server at http://127.0.0.1:4173.

For personal data locally, place the private snapshot at `.private/bootstrap.json` before the first launch. Local durable state lives in `.private/training.json`; neither file is committed. The local server binds only to loopback and checks Host and write origins. The public repository starts with an empty adventure, not leaked personal training data.

`site/` is the interface, `worker/index.js` the server, `site/model.js` the shared metrics. The build embeds the interface and original avatar atlas in a Cloudflare-compatible Worker. `.openai/hosting.json` identifies its private Sites deployment. This repo contains no personal snapshots or credentials.

## Private storage and access

R2 stores one JSON snapshot at `training/snapshot.json`. The owner-private Sites dispatch is the authorization boundary for ALL routes, including imports. Do not make the Site public without adding application authorization. Bootstrap once from secret runtime `INITIAL_SNAPSHOT`, or chunks `INITIAL_SNAPSHOT_0...N` and `INITIAL_SNAPSHOT_PARTS`. No snapshot is bundled into source. Later reads use durable state.

`GET /api/state` reads training. `POST /api/import` validates a complete snapshot through the owner/service boundary. `POST /api/sync` refreshes authorized MCP sources. Failures retain the stored snapshot. Runtime secrets belong in hosting configuration.

## MCP synchronization

The chat plugin session is NOT a background credential. Runtime requires separately authorized `STRAVA_MCP_URL` and `TRAINHEROIC_MCP_URL`, optional secret `STRAVA_MCP_TOKEN` and `TRAINHEROIC_MCP_TOKEN`, and optional tool-name overrides `STRAVA_MCP_TOOL` / `TRAINHEROIC_MCP_TOOL`. Streamable HTTP initialization and SSE results are supported. Adapters require structured JSON; formatted text-only results fail rather than guess. Inspect the actual endpoint payloads before enabling sync.

Refresh upserts by source ID, preserving moved-date overrides and ignoring unlogged strength work. The Worker exposes a scheduled handler, but NO cron is configured in the first deployment. No unattended schedule is running. Source deletion handling needs completion before enabling live Strava synchronization. Resolve Strava's current AI data-use requirements before adding LLM reports; shipped analysis is deterministic.

## Progression

- Run/logged strength: 100 XP; walk/elliptical: 50 XP. Unique IDs prevent duplicate credit.
- Levels every 500 XP. Cosmetic forms at 0 / 1000 / 3000 XP. Future-form previews do not change progress.
- XP reflects the imported block, not lifetime fitness. Harder effort earns no bonus. Rest never removes XP.
- Berlin calendar dates govern sobriety and countdowns; completed days differ from ordinal day.
- Comments override equipment titles. Smith, BB, DB and calf-machine variants remain separate. Records are best IN IMPORTED BLOCK, never claimed all-time.
- User-reported running PRs stay unverified. GPS race activities are not official result times. Bench weights are per DB; split-squat weights combined DBs.
- Average Z2 HR is not measured zone duration. No fabricated readiness or strength ranking.

## Verification

Tests cover date boundaries, evolution, variants, duplicate rejection and worker storage/error behavior. Browser QA is unavailable in this authoring runtime; review the deployed UI for final visual feedback.
