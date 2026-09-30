import {
  TrainHeroicClient,
  fetchAthleteWorkouts,
  presentAthleteWorkouts,
} from '@trainheroic-unofficial/js';
// TrainHeroic has no public API. This uses the community SDK over the web app's undocumented
// endpoints (pinned in package.json); a TrainHeroic-side change can break sync without warning.
const SESSION_KEY = 'trainheroic/session.json';
export const WINDOW_DAYS = 35;

export const fromTrainHeroic = (x) => ({
  id: 'trainheroic:' + x.id,
  source: 'trainheroic',
  type: 'Strength',
  title: x.program || x.title || 'Strength session',
  date: x.date,
  calendarDate: x.date,
  rpe: x.rpe ?? null,
  notes: x.notes ?? null,
  exercises: x.blocks.flatMap((b) => b.exercises).filter((e) => e.performed.length),
});

export async function fetchTrainHeroic(env, today) {
  const saved = await (await env.BUCKET.get(SESSION_KEY))?.json();
  const client = new TrainHeroicClient(
    env.TRAINHEROIC_EMAIL,
    env.TRAINHEROIC_PASSWORD,
    saved?.sessionId ?? null,
  );
  const start = new Date(Date.parse(today + 'T12:00:00Z') - WINDOW_DAYS * 86400000)
    .toISOString()
    .slice(0, 10);
  const workouts = presentAthleteWorkouts(await fetchAthleteWorkouts(client, start, today));
  if (client.sessionId && client.sessionId !== saved?.sessionId)
    await env.BUCKET.put(SESSION_KEY, JSON.stringify({ sessionId: client.sessionId }));
  return { start, sessions: workouts.filter((w) => w.logged).map(fromTrainHeroic) };
}
