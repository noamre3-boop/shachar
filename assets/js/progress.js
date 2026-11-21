/* הקורסים שלי — the learner's own page: level, units, streak, XP, achievements and memory.
   Reads the same per-user state the chat writes (learn.js), so it is always in sync. */
(function () {
  'use strict';
  const S = window.Shachar;
  const { $, esc, icon, hydrateIcons } = S;
  const A = S.account, D = S.learnData;
  if (!A || !D) return;
  const L = D.get(), COURSES = D.COURSES, STYLES = D.STYLES;
  const stats = L.stats || { answers: 0, correct: 0, games: 0, wins: 0, bestOpen: 0, units: 0 };
  const started = COURSES.filter((c) => { const s = L.courses[c.id]; return s && (s.placed || s.pAns.length); });
  const name = A.firstName();
  const day = (d) => d.toLocaleDateString('en-CA');

  /* hello + numbers */
  const doneUnits = started.reduce((n, c) => n + L.courses[c.id].done.length, 0);
  const acc = stats.answers ? Math.round(stats.correct / stats.answers * 100) : null;
  const active = L.active && L.courses[L.active] && !L.courses[L.active].finished ? D.byId(L.active) : null;
  $('[data-who]').innerHTML = A.avatarHTML(64) + '<div><h1>' + esc(name ? 'היי ' + name + ',' : 'ההתקדמות שלי') + '</h1><p>' +
    (started.length ? 'יש לך ' + (L.xp || 0) + ' XP' + ((L.days.streak || 0) > 1 ? ' ורצף של ' + L.days.streak + ' ימים' : L.days.last === day(new Date()) ? ' ולמדת היום' : '') + '. ' + (active ? 'ממשיכים ב' + esc(active.title) + '?' : 'מה לומדים היום?')
      : 'עוד לא התחלת קורס. מבחן רמה של 5 שאלות, ויוצאים לדרך.') + '</p>' +
    '<a class="pg-cta" href="chat.html?learn=' + (active ? active.id : '') + '">' + icon('play') + (active ? 'להמשיך בצ׳אט' : 'להתחיל ללמוד') + '</a></div>';
  const kpi = (ic, v, t) => '<div class="pg-kpi"><span class="pg-kpi-ic">' + icon(ic) + '</span><b>' + v + '</b><small>' + t + '</small></div>';
  $('[data-kpis]').innerHTML = kpi('star', L.xp || 0, 'נקודות XP') + kpi('flame', L.days.streak || 0, 'ימים ברצף') +
    kpi('check', doneUnits, 'יחידות שהושלמו') + kpi('target', acc == null ? '—' : acc + '%', 'דיוק בתשובות');

  /* the last 7 days */
  const DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  const week = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5); week.push({ d, xp: (L.log || {})[day(d)] || 0 }); }
  const max = Math.max(20, ...week.map((w) => w.xp));
  $('[data-week]').innerHTML = week.map((w, i) => '<div class="pg-day' + (i === 6 ? ' today' : '') + (w.xp ? ' on' : '') + '"><span class="pg-bar"><i style="height:' + Math.round(w.xp / max * 100) + '%"></i></span><b>' + (w.xp || '') + '</b><small>' + DAYS[w.d.getDay()] + '</small></div>').join('');
  const weekXP = week.reduce((n, w) => n + w.xp, 0);
  $('[data-week-sub]').textContent = weekXP ? weekXP + ' XP השבוע' : 'עוד לא למדת השבוע';

  /* courses */
  function unitList(c, s) {
    return '<ol class="pg-units">' + c.units.map((U, i) => {
      const u = i + 1, st = s && s.done.includes(u) ? ((s.known || []).includes(u) ? 'known' : 'done') : s && s.placed && !s.finished && u === s.unit ? 'now' : '';
      return '<li class="' + st + '"><i>' + (st === 'done' || st === 'known' ? icon('check') : u) + '</i><span>' + esc(U.t) + '</span>' + (st === 'known' ? '<em>ממבחן הרמה</em>' : st === 'now' ? '<em>כאן ממשיכים</em>' : '') + '</li>';
    }).join('') + '</ol>';
  }
  $('[data-courses]').innerHTML = COURSES.map((c) => {
    const s = L.courses[c.id];
    const pct = s ? s.done.length * 20 : 0;
    const placed = s && s.placed;
    const score = placed ? s.pAns.reduce((a, b) => a + b, 0) : null;
    const act = !s || !(s.placed || s.pAns.length) ? 'להתחיל: מבחן רמה' : s.finished ? 'חזרה על הקורס' : !placed ? 'להמשיך את מבחן הרמה' : 'להמשיך ביחידה ' + s.unit;
    return '<article class="pg-course' + (L.active === c.id && s && !s.finished ? ' cur' : '') + (s && s.finished ? ' fin' : '') + '">' +
      '<div class="pg-c-top"><span class="lx-ic">' + icon(c.icon) + '</span><div class="pg-c-t"><h3>' + esc(c.title) + '</h3><p>' + esc(c.blurb) + '</p></div>' +
      '<div class="pg-ring" style="--p:' + pct + '" role="img" aria-label="' + pct + '% הושלם"><b>' + pct + '%</b></div></div>' +
      '<div class="pg-tags">' + (placed ? '<span>' + icon('gauge') + 'רמה: ' + esc(s.level) + '</span><span>' + icon('target') + 'מבחן רמה: ' + score + '/5</span>' : '<span>' + icon('clock') + (s && s.pAns.length ? 'באמצע מבחן הרמה' : 'עוד לא התחלת') + '</span>') +
      (s && s.style ? '<span>' + icon(STYLES[s.style].i) + esc(STYLES[s.style].t) + '</span>' : '') + (s && s.finished ? '<span class="gold">' + icon('trophy') + 'הושלם</span>' : '') + '</div>' +
      unitList(c, s) +
      '<a class="pg-go" href="chat.html?learn=' + c.id + '">' + icon('play') + act + '</a></article>';
  }).join('');

  /* achievements */
  const anyFinished = started.some((c) => L.courses[c.id].finished);
  const BADGES = [
    { i: 'target', t: 'צעד ראשון', d: 'מבחן רמה ראשון', ok: started.some((c) => L.courses[c.id].placed) },
    { i: 'check', t: 'יחידה ראשונה', d: 'השלמת יחידה', ok: (stats.units || 0) >= 1 || started.some((c) => L.courses[c.id].done.length > (L.courses[c.id].known || []).length) },
    { i: 'flame', t: 'שלושה ימים ברצף', d: 'ללמוד 3 ימים רצוף', ok: (L.days.streak || 0) >= 3 },
    { i: 'star', t: '100 XP', d: 'לצבור 100 נקודות', ok: (L.xp || 0) >= 100 },
    { i: 'game', t: 'ניצחון במשחק', d: 'לנצח סיבוב משחק', ok: (stats.wins || 0) >= 1 },
    { i: 'pen', t: 'תשובה מבריקה', d: '8/10 ומעלה בשאלה פתוחה', ok: (stats.bestOpen || 0) >= 8 },
    { i: 'bolt', t: 'חדות', d: '10 תשובות נכונות', ok: (stats.correct || 0) >= 10 },
    { i: 'trophy', t: 'סיום קורס', d: 'לסיים קורס שלם', ok: anyFinished },
  ];
  $('[data-badges]').innerHTML = BADGES.map((b) => '<div class="pg-badge' + (b.ok ? ' ok' : '') + '"><span>' + icon(b.ok ? b.i : 'lock') + '</span><b>' + b.t + '</b><small>' + b.d + '</small></div>').join('');
  $('[data-badge-sub]').textContent = BADGES.filter((b) => b.ok).length + ' מתוך ' + BADGES.length;

  /* memory */
  function paintMem() {
    const notes = A.mem.notes();
    const addr = { f: 'בלשון נקבה', m: 'בלשון זכר', n: 'בלי מגדר' }[A.mem.get('addr', '')] || 'עוד לא נבחר';
    $('[data-mem]').innerHTML = '<div class="pg-mem-row"><span>' + icon('smile') + 'פנייה: <b>' + addr + '</b></span></div>' +
      (notes.length ? '<ul class="pg-notes">' + notes.map((n) => '<li>' + icon('brain') + '<span>' + esc(n.t) + '</span></li>').join('') + '</ul>'
        : '<p class="pg-empty">עוד אין כאן כלום. בצ׳אט אפשר לכתוב "תזכור ש…", ושחר ישמור את זה כאן.</p>');
    hydrateIcons($('[data-mem]'));
  }
  paintMem();
  $('[data-open-mem]').addEventListener('click', () => { A.openPanel(); const d = $('#me-dlg'); if (d) d.addEventListener('close', paintMem, { once: true }); });
  hydrateIcons();
})();
