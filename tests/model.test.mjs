import test from 'node:test';
import assert from 'node:assert/strict';
import {
  totalXP,
  stageFor,
  daysBetween,
  weekStart,
  variant,
  records,
  validateSnapshot,
  insights,
  replaceSessions,
  parseStravaExport,
} from '../site/model.js';
test('Calendar streak handles month boundaries', () => {
  assert.equal(daysBetween('2026-08-30', '2026-09-30'), 31);
  assert.equal(weekStart('2026-09-30'), '2026-09-28');
});
test('Cosmetic evolution uses earned XP', () => {
  assert.equal(stageFor(999), 0);
  assert.equal(stageFor(1000), 1);
  assert.equal(stageFor(3000), 2);
  assert.equal(totalXP([{ source: 'trainheroic' }, { type: 'Run' }, { type: 'Walk' }]), 250);
});
test('Comments keep Smith and barbell PRs separate', () => {
  const s = [
    {
      id: 'a',
      date: '2026-09-01',
      exercises: [{ title: 'Barbell Squat', performed: ['5 @ 100'] }],
    },
    {
      id: 'b',
      date: '2026-09-02',
      exercises: [{ title: 'Barbell Squat', notes: 'smith machine', performed: ['5 @ 105'] }],
    },
  ];
  assert.equal(variant(s[1].exercises[0]), 'Smith machine');
  assert.equal(records(s).length, 2);
});
test('Repeated imports cannot duplicate XP or admit scheduled-only sessions', () => {
  assert.throws(() =>
    validateSnapshot({
      profile: { sobrietyStart: '2026-08-30' },
      sessions: [{ id: 'x', date: '2026-09-01', source: 'trainheroic', exercises: [] }],
    }),
  );
  assert.throws(() =>
    validateSnapshot({
      profile: { sobrietyStart: '2026-08-30' },
      sessions: [
        { id: 'x', date: '2026-09-01', source: 'strava' },
        { id: 'x', date: '2026-09-01', source: 'strava' },
      ],
    }),
  );
});
test('Trail and virtual runs count as runs', () => {
  assert.equal(totalXP([{ type: 'TrailRun' }, { type: 'VirtualRun' }, { type: 'Walk' }]), 250);
});
test('Insights pick the latest sessions regardless of input order', () => {
  const sessions = [
    { id: 'new-run', source: 'strava', type: 'Run', date: '2026-09-20', distance: 0 },
    { id: 'old-lift', source: 'trainheroic', date: '2026-09-01', exercises: [] },
    { id: 'old-run', source: 'strava', type: 'Run', date: '2026-09-02', distance: 0 },
    { id: 'new-lift', source: 'trainheroic', date: '2026-09-21', exercises: [] },
  ];
  for (const order of [sessions, [...sessions].reverse()]) {
    const notes = insights({ sessions: order });
    assert.deepEqual(notes[0].ids, ['new-lift', 'new-run']);
    assert.deepEqual(notes.at(-1).ids, ['new-lift']);
  }
  assert.equal(sessions[0].id, 'new-run');
});
test('Source refresh replaces only its window and keeps date overrides', () => {
  const sessions = [
    { id: 'trainheroic:old', source: 'trainheroic', date: '2026-08-01' },
    { id: 'trainheroic:gone', source: 'trainheroic', date: '2026-09-20' },
    {
      id: 'trainheroic:moved',
      source: 'trainheroic',
      date: '2026-09-22',
      calendarDate: '2026-09-21',
      actualDateOverride: true,
    },
    { id: 'strava:1', source: 'strava', date: '2026-09-20' },
  ];
  const fresh = [
    {
      id: 'trainheroic:moved',
      source: 'trainheroic',
      date: '2026-09-21',
      calendarDate: '2026-09-21',
    },
  ];
  const out = replaceSessions(sessions, 'trainheroic', fresh, '2026-09-01');
  assert.deepEqual(
    out.map((s) => s.id),
    ['trainheroic:old', 'strava:1', 'trainheroic:moved'],
  );
  assert.equal(out.at(-1).date, '2026-09-22');
});
test('Strava export dates convert from UTC to the Berlin day', () => {
  const [s] = parseStravaExport(
    'Activity ID,Activity Date,Activity Name,Activity Type,Distance,Distance\n' +
      '5,"Sep 29, 2026, 10:30:00 PM","Late, easy",Trail Run,5.0,5012\n',
  );
  assert.equal(s.date, '2026-09-30');
  assert.equal(s.type, 'TrailRun');
  assert.equal(s.distance, 5012);
  assert.equal(s.title, 'Late, easy');
});
