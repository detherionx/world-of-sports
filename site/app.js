import {
  forms,
  day,
  daysBetween,
  time,
  pace,
  xpFor,
  isRun,
  totalXP,
  stageFor,
  weekStart,
  records,
  insights,
  variant,
} from '/model.js';
const $ = (id) => document.getElementById(id);
let snapshot = null,
  earned = 0;
const escape = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const shortDate = (d) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
function showMessage(s) {
  $('message').textContent = s;
}
function setStage(stage, preview = false) {
  $('avatar').style.backgroundPosition = `${stage * 50}% 0`;
  $('stage-label').textContent = (preview ? 'PREVIEW / ' : '') + forms[stage].name.toUpperCase();
  $('stage-label').classList.toggle('preview-label', preview);
  $('stage-description').textContent = forms[stage].text;
  $('character-name').textContent = snapshot?.profile?.name
    ? `${snapshot.profile.name}'s adventurer`
    : 'Your adventurer';
  $('avatar').setAttribute('aria-label', forms[stage].name + ' gnome avatar');
  $('avatar').classList.remove('celebrate');
  requestAnimationFrame(() => $('avatar').classList.add('celebrate'));
  setTimeout(() => $('avatar').classList.remove('celebrate'), 850);
}
function render() {
  const s = snapshot.sessions,
    profile = snapshot.profile,
    today = day(),
    xp = totalXP(s);
  earned = stageFor(xp);
  setStage(earned);
  $('name').textContent = (profile.name || 'ADVENTURER').toUpperCase();
  $('today').textContent = new Date().toLocaleDateString('en-GB', {
    timeZone: 'Europe/Berlin',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const sober = Math.max(0, daysBetween(profile.sobrietyStart, today));
  $('sobriety').innerHTML = `${sober}<small> days</small>`;
  $('sobriety-note').textContent =
    `Since ${shortDate(profile.sobrietyStart)} ${profile.sobrietyStart.slice(0, 4)} · day ${sober + 1}`;
  $('level').textContent = `LEVEL ${Math.floor(xp / 500) + 1}`;
  $('xp-total').textContent = `${xp.toLocaleString()} XP`;
  $('xp-next').textContent = `${500 - (xp % 500)} to next level`;
  $('xp-bar').style.width = `${(xp % 500) / 5}%`;
  const runs = s.filter(isRun),
    strength = s.filter((x) => x.source === 'trainheroic');
  $('strength-stat').textContent = `${strength.length} logged sessions`;
  $('endurance-stat').textContent =
    `${(runs.reduce((n, x) => n + x.distance, 0) / 1000).toFixed(1)} km · ${runs.length} runs`;
  const easy = runs.filter((x) => x.avgHR != null && x.avgHR >= 130 && x.avgHR <= 145);
  $('endurance-note').textContent = `${easy.length} runs with average HR in Z2 · 130–145 bpm`;
  const start = weekStart(today),
    weekly = s.filter((x) => x.date >= start && x.date <= today);
  $('weekly-label').textContent =
    `${weekly.filter((x) => x.source === 'trainheroic').length}/3 strength · ${weekly.filter(isRun).length}/3 runs`;
  $('week-dots').innerHTML = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10),
      done = weekly.some((x) => x.date === date);
    return `<div class="week-day"><span class="day-dot ${done ? 'done' : ''}" title="${escape(date)}: ${weekly.filter((x) => x.date === date).length} sessions">${done ? '✓' : ''}</span>${['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</div>`;
  }).join('');
  $('races').innerHTML = (snapshot.races || [])
    .map(
      (r, i) =>
        `<button class="race ${i === 0 ? 'current' : ''}" data-race="${i}"><span class="race-icon" aria-hidden="true">${['♧', '♧', '◈', '◇'][i] || '◇'}</span><small>${r.date ? escape(shortDate(r.date)) + ' ' + r.date.slice(0, 4) : '2027 / DATE TBC'}</small><h3>${escape(r.name)}</h3><p>${escape(r.distance || 'Distance to confirm')}</p><span class="race-countdown">${r.date ? (daysBetween(today, r.date) >= 0 ? daysBetween(today, r.date) + ' days to go' : 'Race day passed') : 'On the horizon'}</span></button>`,
    )
    .join('');
  $('coverage').textContent =
    `${escape(snapshot.coverage || 'Imported history')} · ${s.length} sessions`;
  $('sessions').innerHTML =
    [...s]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(
        (x) =>
          `<button class="session" data-session="${escape(x.id)}"><span class="session-date"><strong>${Number(x.date.slice(-2))}</strong>${new Date(x.date + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'short' })}</span><span><h3>${escape(x.title)}</h3><p>${x.source === 'trainheroic' ? `${x.exercises.length} logged exercises${x.rpe != null ? ' · RPE ' + x.rpe : ''}` : `${x.distance ? (x.distance / 1000).toFixed(2) + ' km · ' : ''}${time(x.movingTime)}${x.avgHR != null ? ' · ' + Math.round(x.avgHR) + ' bpm' : ''}`}</p></span><span class="session-kind">${x.source === 'trainheroic' ? 'STRENGTH' : escape(x.type.toUpperCase())} · +${xpFor(x)} XP</span></button>`,
      )
      .join('') || '<p>No sessions imported yet. Your adventure starts with real data.</p>';
  const recs = records(s);
  $('record-list').innerHTML =
    (snapshot.manualRecords || [])
      .map(
        (r) =>
          `<article class="record"><p class="eyebrow">USER-REPORTED PR</p><h3>${escape(r.title)}</h3><strong>${escape(r.value)}</strong><p>${escape(r.note)}</p><small>Awaiting a matching official result</small></article>`,
      )
      .join('') +
    recs
      .map(
        (r) =>
          `<article class="record"><p class="eyebrow">BEST IN IMPORTED BLOCK</p><h3>${escape(r.title)}</h3><strong>${r.reps} × ${r.load}</strong><p>${escape(r.variant)} · ${escape(r.unit)}${/Dumbbell Bench/.test(r.title) ? ' per dumbbell' : /Split Squat/.test(r.title) && r.variant === 'Dumbbell' ? ' combined dumbbells' : ''}</p><small>${shortDate(r.date)} · ${escape(r.notes || 'As logged; machine values are equipment-specific.')}</small><p><button class="subtle" data-session="${escape(r.sessionId)}">View evidence</button></p></article>`,
      )
      .join('');
  $('insight-list').innerHTML = insights(snapshot)
    .map(
      (r, i) =>
        `<article class="insight"><p class="eyebrow">FIELD NOTE ${String(i + 1).padStart(2, '0')}</p><h3>${escape(r.title)}</h3><p>${escape(r.text)}</p>${r.ids.map((id) => `<button data-session="${escape(id)}">View session</button>`).join(' · ')}</article>`,
    )
    .join('');
  $('source-status').textContent =
    `Snapshot ${snapshot.syncedAt ? new Date(snapshot.syncedAt).toLocaleString('en-GB', { timeZone: 'Europe/Berlin' }) : 'not imported'} · Background MCP sync ${snapshot.backgroundSync ? 'configured' : 'not connected'}`;
  $('evolution-line').innerHTML = forms
    .map(
      (f, i) =>
        `<button class="evolution-form ${i === earned ? 'earned' : ''}" data-stage="${i}"><div class="mini-avatar" style="background-position:${i * 50}% 0" role="img" aria-label="${f.name}"></div><strong>${f.name}</strong><small>${f.xp.toLocaleString()} XP · ${i <= earned ? 'unlocked' : 'future form'}</small></button>`,
    )
    .join('');
}
function detail(id) {
  const x = snapshot.sessions.find((s) => s.id === id);
  if (!x) return;
  $('detail-content').innerHTML =
    `<p class="eyebrow">${shortDate(x.date)} ${x.date.slice(0, 4)} / ${escape(x.source)}</p><h2>${escape(x.title)}</h2>${x.dateNote ? `<p class="tiny">${escape(x.dateNote)}</p>` : ''}${x.notes ? `<p class="muted">${escape(x.notes)}</p>` : ''}${x.source === 'trainheroic' ? (x.exercises || []).map((e) => `<div class="exercise"><h3>${escape(e.title)}</h3><p>${escape(variant(e))} · ${escape(e.units?.[1] || 'units as logged')}</p><code>${e.performed.map(escape).join(' · ')}</code>${e.notes ? `<p>Comment: ${escape(e.notes)}</p>` : ''}</div>`).join('') : `<div class="detail-grid"><div class="detail-stat"><strong>${(x.distance / 1000).toFixed(2)} km</strong><small>Recorded distance</small></div><div class="detail-stat"><strong>${time(x.movingTime)}</strong><small>Moving time</small></div><div class="detail-stat"><strong>${time(x.elapsedTime)}</strong><small>Elapsed time</small></div><div class="detail-stat"><strong>${pace(x)}</strong><small>Recorded average pace</small></div><div class="detail-stat"><strong>${x.avgHR != null ? Math.round(x.avgHR) + ' bpm' : 'Not recorded'}</strong><small>Average heart rate</small></div><div class="detail-stat"><strong>${x.elevation != null ? x.elevation + ' m' : 'Not recorded'}</strong><small>Climbing</small></div></div>${x.url ? `<a href="${escape(x.url)}" target="_blank" rel="noopener">Open original activity</a>` : ''}`}`;
  $('detail-dialog').showModal();
}
async function load() {
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    const data = await r.json();
    if (!r.ok) throw Error(data.error || 'Training is unavailable.');
    snapshot = data;
    render();
  } catch (e) {
    showMessage(e.message);
    $('source-status').textContent = 'Training unavailable. Existing records have not been erased.';
  }
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('button');
  if (!el) return;
  if (el.dataset.close) $(el.dataset.close).close();
  if (el.dataset.session) detail(el.dataset.session);
  if (el.dataset.stage) {
    setStage(Number(el.dataset.stage), Number(el.dataset.stage) !== earned);
    $('evolution-dialog').close();
  }
  if (el.dataset.race) {
    const r = snapshot.races[Number(el.dataset.race)];
    $('detail-content').innerHTML =
      `<div class="race-detail"><p class="eyebrow">NEXT STARTING LINE</p><h2>${escape(r.name)}</h2><p>${escape(r.date || 'Date awaiting confirmation')} · ${escape(r.distance || 'Distance awaiting confirmation')}</p><p>${escape(r.note || '')}</p>${r.url ? `<a href="${escape(r.url)}" target="_blank" rel="noopener">Race information</a>` : ''}</div>`;
    $('detail-dialog').showModal();
  }
  if (el.dataset.tab) {
    for (const b of document.querySelectorAll('[role=tab]')) {
      const active = b === el;
      b.setAttribute('aria-selected', String(active));
      b.tabIndex = active ? 0 : -1;
      $(b.dataset.tab).hidden = !active;
    }
  }
});
document.querySelector('.tabbar').addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const tabs = [...document.querySelectorAll('[role=tab]')],
    i = tabs.indexOf(document.activeElement),
    next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? tabs.length - 1
          : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].click();
  tabs[next].focus();
});
$('evolution-open').onclick = () => $('evolution-dialog').showModal();
$('restore-stage').onclick = () => {
  setStage(earned);
  $('evolution-dialog').close();
};
$('sync-button').onclick = async () => {
  const b = $('sync-button');
  b.disabled = true;
  b.textContent = 'Refreshing…';
  try {
    const r = await fetch('/api/sync', { method: 'POST' }),
      result = await r.json();
    if (!r.ok) throw Error(result.error);
    await load();
    showMessage('Training refreshed. Duplicate sessions do not earn extra XP.');
  } catch (e) {
    showMessage(e.message + ' The imported snapshot is still available.');
  } finally {
    b.disabled = false;
    b.textContent = 'Refresh training';
  }
};
load();
// Re-render only when the Berlin date changes, so an open evolution preview isn't reset every minute.
let shownDay = day();
setInterval(() => {
  if (snapshot && day() !== shownDay) {
    shownDay = day();
    render();
  }
}, 60000);
