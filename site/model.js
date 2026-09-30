export const forms = [
  { name: 'The Trainee', xp: 0, text: 'Showing up is where the adventure starts.' },
  { name: 'The Trail Adventurer', xp: 1000, text: 'A stronger frame. A growing aerobic engine.' },
  { name: 'The Hybrid Guardian', xp: 3000, text: 'Strength and endurance, built over time.' },
];
export const day = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
export const daysBetween = (a, b) =>
  Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
export const time = (s) => {
  s = Math.round(s || 0);
  return s >= 3600
    ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const pace = (a) =>
  a.distance > 0 ? time(a.movingTime / (a.distance / 1000)) + '/km' : '—';
const runTypes = new Set(['Run', 'TrailRun', 'VirtualRun']);
export const isRun = (s) => runTypes.has(s.type);
export const xpFor = (s) => (s.source === 'trainheroic' || isRun(s) ? 100 : 50);
export const totalXP = (sessions) => sessions.reduce((n, s) => n + xpFor(s), 0);
export const stageFor = (xp) => (xp >= 3000 ? 2 : xp >= 1000 ? 1 : 0);
export function weekStart(date) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function variant(e) {
  const n = (e.notes || '').toLowerCase();
  if (/smith/.test(n)) return 'Smith machine';
  if (/leg press/.test(n)) return 'Leg press machine';
  if (/seated calf/.test(n)) return 'Seated calf machine';
  if (/(?:\bbb\b|barbell)/.test(n) && !/dumbbell/.test(n)) return 'Barbell';
  if (/(?:\bdbs?\b|dumbbell)/.test(n)) return 'Dumbbell';
  return e.instruction || e.title;
}
export function parseSet(s) {
  const m = String(s).match(/^(\d+)\s*(?:@\s*([\d.]+))?/);
  return m ? { reps: Number(m[1]), load: m[2] ? Number(m[2]) : null } : null;
}
export function records(sessions) {
  const map = new Map();
  for (const s of [...sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const e of s.exercises || []) {
      if (!e.performed?.length) continue;
      const v = variant(e);
      const key = e.title + '|' + v + '|' + (e.units?.[1] || 'logged');
      const known = map.get(key);
      for (const text of e.performed) {
        const p = parseSet(text);
        if (!p || p.load == null) continue;
        if (!known || p.load > known.load || (p.load === known.load && p.reps > known.reps)) {
          const old = map.get(key);
          if (!old || p.load > old.load || (p.load === old.load && p.reps > old.reps))
            map.set(key, {
              title: e.title,
              variant: v,
              ...p,
              date: s.date,
              sessionId: s.id,
              unit: e.units?.[1] || (/kg/.test(e.notes || '') ? 'kg' : 'logged units'),
              notes: e.notes,
            });
        }
      }
    }
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}
export function insights(snapshot) {
  const sessions = [...snapshot.sessions].sort((a, b) => b.date.localeCompare(a.date)),
    runs = sessions.filter(isRun),
    strength = sessions.filter((s) => s.source === 'trainheroic');
  const out = [];
  if (strength.length && runs.length)
    out.push({
      title: 'Consistency has two branches.',
      text: `This imported block contains ${strength.length} strength sessions and ${runs.length} runs. Session count describes the balance; it does not measure fitness. Your baseline goal is three of each per week.`,
      ids: [strength[0]?.id, runs[0]?.id].filter(Boolean),
    });
  const easy = runs.find((s) => s.avgHR != null && s.avgHR >= 130 && s.avgHR <= 145);
  if (easy)
    out.push({
      title: 'An aerobic foundation to repeat.',
      text: `${(easy.distance / 1000).toFixed(2)} km in ${time(easy.movingTime)}, average HR ${Math.round(easy.avgHR)} bpm${easy.elevation != null ? `, ${Math.round(easy.elevation)} m climbing` : ''}. Average HR is within your Z2 range; it does not tell us the exact minutes spent in each zone.`,
      ids: [easy.id],
    });
  const latest = strength[0];
  if (latest) {
    const legs = (latest.exercises || []).filter((e) =>
      /squat|curl seated|calf|adductor|abductor|deadlift/i.test(e.title),
    );
    const sets = legs.reduce((n, e) => n + e.performed.length, 0);
    out.push({
      title: 'Leg work leaves a footprint.',
      text: `The latest strength session included ${sets} logged lower-body sets across ${legs.length} exercises${latest.rpe != null ? `, with session RPE ${latest.rpe}` : ''}. These are logged sets, not verified hard sets. Judge the next run alongside your actual soreness.`,
      ids: [latest.id],
    });
  }
  const split = strength
    .flatMap((s) =>
      (s.exercises || [])
        .filter((e) => /split squat/i.test(e.title) && variant(e) === 'Dumbbell')
        .map((e) => ({ s, e, max: Math.max(...e.performed.map((t) => parseSet(t)?.load || 0)) })),
    )
    .sort((a, b) => a.s.date.localeCompare(b.s.date));
  if (split.length > 1) {
    const first = split[0],
      last = split.at(-1);
    out.push({
      title: 'Unilateral work is progressing.',
      text: `Dumbbell split-squat top logged load changed from ${first.max} to ${last.max} across this block. Comments preserve the implement; here loads are combined across both dumbbells. Load progression alone cannot establish a population strength ranking.`,
      ids: [first.s.id, last.s.id],
    });
  }
  return out;
}
export function validateSnapshot(s) {
  if (!s || !Array.isArray(s.sessions) || s.sessions.length > 5000)
    throw Error('Expected a snapshot with up to 5000 sessions.');
  if (!s.profile || !/^\d{4}-\d{2}-\d{2}$/.test(s.profile.sobrietyStart || ''))
    throw Error('A sobriety start date is required.');
  const ids = new Set();
  for (const x of s.sessions) {
    if (
      !x.id ||
      ids.has(x.id) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(x.date) ||
      !['strava', 'trainheroic'].includes(x.source)
    )
      throw Error('Invalid or duplicate session.');
    ids.add(x.id);
    if (x.source === 'trainheroic' && !x.exercises?.some((e) => e.performed?.length))
      throw Error('Strength sessions must include logged sets.');
  }
  return s;
}
// Replace all `source` sessions dated on/after `since` with `fresh`, keeping manual date overrides.
export function replaceSessions(sessions, source, fresh, since = '') {
  const old = new Map(sessions.map((s) => [s.id, s]));
  const kept = sessions.filter((s) => s.source !== source || (s.calendarDate || s.date) < since);
  const keptIds = new Set(kept.map((s) => s.id));
  return [
    ...kept,
    ...fresh
      .filter((s) => !keptIds.has(s.id))
      .map((s) => {
        const o = old.get(s.id);
        return o?.actualDateOverride
          ? { ...s, date: o.date, dateNote: o.dateNote, actualDateOverride: true }
          : s;
      }),
  ];
}
const stravaSession = (id, x) => ({
  id: 'strava:' + id,
  source: 'strava',
  url: 'https://www.strava.com/activities/' + id,
  ...x,
});
// Strava API activity (GET /athlete/activities).
export const fromStrava = (x) =>
  stravaSession(x.id, {
    type: x.sport_type || x.type,
    title: x.name,
    date: x.start_date_local.slice(0, 10),
    distance: x.distance || 0,
    movingTime: x.moving_time,
    elapsedTime: x.elapsed_time,
    avgHR: x.average_heartrate ?? null,
    elevation: x.total_elevation_gain ?? null,
  });
export function parseCsv(text) {
  const rows = [[]];
  let field = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') field += text[i++];
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') (rows.at(-1).push(field), (field = ''));
    else if (c === '\n') (rows.at(-1).push(field.replace(/\r$/, '')), rows.push([]), (field = ''));
    else field += c;
  }
  rows.at(-1).push(field);
  return rows.filter((r) => r.some((f) => f !== ''));
}
// activities.csv from Strava's "Download your data" export. Dates there are UTC, so they are
// converted to the Berlin calendar day. Duplicate headers (Distance, Elapsed Time) use the last
// column, which holds the raw metres/seconds.
export function parseStravaExport(text) {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ''));
  const col = (name) => header.lastIndexOf(name);
  const c = {
    id: col('Activity ID'),
    date: col('Activity Date'),
    name: col('Activity Name'),
    type: col('Activity Type'),
    distance: col('Distance'),
    moving: col('Moving Time'),
    elapsed: col('Elapsed Time'),
    hr: col('Average Heart Rate'),
    elevation: col('Elevation Gain'),
  };
  if ([c.id, c.date, c.type].includes(-1))
    throw Error('Not a Strava activities.csv (missing Activity ID, Date or Type).');
  const num = (r, i) => (i >= 0 && r[i] !== '' && !isNaN(r[i]) ? Number(r[i]) : null);
  return rows.map((r) => {
    const when = new Date(r[c.date] + ' UTC');
    if (isNaN(when)) throw Error('Unreadable activity date: ' + r[c.date]);
    return stravaSession(r[c.id], {
      type: r[c.type].replace(/\s+/g, ''),
      title: r[c.name] || r[c.type],
      date: day(when),
      distance: num(r, c.distance) || 0,
      movingTime: num(r, c.moving),
      elapsedTime: num(r, c.elapsed),
      avgHR: num(r, c.hr),
      elevation: num(r, c.elevation),
    });
  });
}
