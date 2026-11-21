/* רדאר ההתמדה — transparent early-warning scoring, interventions, local-LLM drafts.
   Everything runs in this browser; imported files are never stored or sent. */
(function () {
  'use strict';
  const { $, $$, esc, icon, hydrateIcons, toast, store, local, fmt } = window.Shachar;

  /* ---------------- reference data ---------------- */
  const FAC = [
    { id: 'edu', name: 'הפקולטה לחינוך ומנהיגות', short: 'חינוך ומנהיגות', share: .38, coord: 'נועה', depts: ['הוראה בחינוך היסודי', 'חינוך מיוחד', 'הוראת המדעים', 'ייעוץ חינוכי', 'מנהל ומנהיגות חינוכית'] },
    { id: 'sci', name: 'הפקולטה למדעים, בריאות וקיימות', short: 'מדעים, בריאות וקיימות', share: .27, coord: 'הילה', depts: ['מדעי המעבדה הרפואית', 'מדעי החיים', 'איכות הסביבה', 'מדעי הנתונים'] },
    { id: 'psy', name: 'הפקולטה לפסיכולוגיה, חברה ורוח', short: 'פסיכולוגיה, חברה ורוח', share: .35, coord: 'שירן', depts: ['פסיכולוגיה', 'מדעי ההתנהגות', 'עבודה סוציאלית', 'מדעי הרוח'] },
  ];
  const COORDS = ['נועה', 'הילה', 'שירן', 'רינה (דיקנאט)'];
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const FEATS = [
    { k: 'attendance', label: 'נוכחות בקורסי חובה', short: 'נוכחות', unit: '%', w: .30, c: (v) => clamp((85 - v) / 45), why: (v) => 'נוכחות של ' + v + '% בקורסי חובה' },
    { k: 'logins', label: 'כניסות ל-Moodle ב-14 יום', short: 'כניסות ל-Moodle', unit: '', w: .20, c: (v) => clamp((8 - v) / 8), why: (v) => (v === 0 ? 'אין כניסות' : 'רק ' + v + ' כניסות') + ' ל-Moodle בשבועיים' },
    { k: 'missing', label: 'מטלות שלא הוגשו', short: 'מטלות פתוחות', unit: '', w: .20, c: (v) => clamp(v / 4), why: (v) => v + ' מטלות שלא הוגשו ב-Moodle' },
    { k: 'overdue', label: 'ימי פיגור בתשלום', short: 'פיגור בתשלום', unit: ' יום', w: .15, c: (v) => clamp(v / 60), why: (v) => 'פיגור תשלום של ' + v + ' יום' },
    { k: 'grade', label: 'ממוצע ציונים', short: 'ממוצע', unit: '', w: .10, c: (v) => clamp((75 - v) / 25), why: (v) => 'ממוצע ציונים ' + v },
    { k: 'inq', label: 'פניות לרכזות ב-14 יום', short: 'פניות', unit: '', w: .05, c: (v) => clamp((v - 1) / 4), why: (v) => v + ' פניות לרכזות בשבועיים' },
  ];
  const HELP = {
    attendance: { t: 'חונכות אישית ושיעורי עזר', d: 'ירידה בנוכחות היא הסימן המוקדם ביותר' },
    logins: { t: 'שיחת ייעוץ אקדמי ובניית תוכנית לימוד', d: 'התנתקות מסביבת הלמידה' },
    missing: { t: 'חונכות אישית ופריסת מועדי הגשה', d: 'מטלות פתוחות בכמה קורסים' },
    overdue: { t: 'פריסת תשלומים או בדיקת מלגה', d: 'פיגור בגבייה' },
    grade: { t: 'ייעוץ אקדמי ובדיקת עומס הקורסים', d: 'ירידה בהישגים' },
    inq: { t: 'שיחה בדיקנאט לבדיקת חסמים אישיים או רגשיים', d: 'ריבוי פניות' },
  };
  const ST = { new: 'חדשה', assigned: 'שויכה', active: 'בטיפול', closed: 'נסגרה' };
  const ST_I = { new: 'bell', assigned: 'user', active: 'chat', closed: 'check' };
  const K = 8, X0 = .42, SLA = 72;

  /* ---------------- scoring ---------------- */
  let W = store.get('radar-weights', null) || Object.fromEntries(FEATS.map((f) => [f.k, f.w]));
  function scoreOf(s) {
    const sw = FEATS.reduce((a, f) => a + W[f.k], 0) || 1;
    const parts = FEATS.map((f) => ({ f, v: s[f.k], c: f.c(s[f.k]) * W[f.k] / sw }));
    const x = parts.reduce((a, p) => a + p.c, 0);
    const score = Math.round(100 / (1 + Math.exp(-K * (x - X0))));
    const tot = parts.reduce((a, p) => a + p.c, 0) || 1;
    const top = parts.filter((p) => p.c > .004).sort((a, b) => b.c - a.c).slice(0, 3).map((p) => ({ k: p.f.k, label: p.f.label, why: p.f.why(p.v), share: p.c / tot }));
    return { score, x, top };
  }
  const level = (s) => (s >= 85 ? { n: 'קריטי', c: 'var(--st-critical)' } : s >= thr() ? { n: 'גבוה', c: 'var(--st-serious)' } : s >= 50 ? { n: 'בינוני', c: 'var(--st-warn)' } : { n: 'נמוך', c: 'var(--st-good)' });

  /* ---------------- synthetic dataset (seeded) ---------------- */
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function demoData() {
    const r = rng(20271001);
    const n = (a) => (r() - .5) * 2 * a;
    const used = new Set([4127, 3380, 5012]);
    const out = [];
    const fixed = [
      { id: 4127, fac: 'edu', dept: 'חינוך מיוחד', year: 1, attendance: 54, logins: 3, missing: 3, overdue: 45, grade: 74, inq: 2, trend: [35, 37, 36, 39, 38, 55, 71], hrs: 30, status: 'active' },
      { id: 3380, fac: 'sci', dept: 'מדעי החיים', year: 1, attendance: 67, logins: 1, missing: 3, overdue: 0, grade: 52, inq: 3, trend: [41, 44, 47, 52, 58, 64, 70], hrs: 8, status: 'assigned' },
      { id: 5012, fac: 'psy', dept: 'פסיכולוגיה', year: 1, attendance: 68, logins: 4, missing: 3, overdue: 30, grade: 64, inq: 5, trend: [50, 52, 55, 57, 60, 63, 66], hrs: 5, status: 'new' },
    ];
    for (let i = 0; i < 177; i++) {
      const u = r();
      const fac = u < .38 ? FAC[0] : u < .65 ? FAC[1] : FAC[2];
      let id; do { id = 1000 + Math.floor(r() * 9000); } while (used.has(id)); used.add(id);
      const year = 1 + Math.floor(r() * 3);
      const lat = Math.pow(r(), 2.1) * (year === 1 ? 1.15 : .9);
      const R = Math.min(1, lat);
      const s = {
        id, fac: fac.id, dept: fac.depts[Math.floor(r() * fac.depts.length)], year,
        attendance: Math.round(Math.max(28, Math.min(100, 96 - R * 52 + n(6)))),
        logins: Math.max(0, Math.round(15 - R * 14 + n(2.5))),
        missing: Math.max(0, Math.round(R * 4.6 + n(.8) - .3)),
        overdue: R > .45 && r() < .6 ? Math.max(0, Math.round(R * 75 + n(12))) : r() < .08 ? Math.round(r() * 25) : 0,
        grade: Math.round(Math.max(40, Math.min(98, 88 - R * 30 + n(6)))),
        inq: Math.max(0, Math.round(R * 4 + r() * 1.4 - .4)),
      };
      const rising = r() < .55;
      s.trendSeed = [rising, r(), r()];
      s.hrs = Math.round(r() * 110);
      const p = r();
      s.status = s.hrs < 20 ? (p < .7 ? 'new' : 'assigned') : p < .2 ? 'assigned' : p < .75 ? 'active' : 'closed';
      out.push(s);
    }
    return fixed.concat(out).map(finish);
  }
  function finish(s) {
    const res = scoreOf(s);
    if (!s.trend) {
      const [rising, a, b] = s.trendSeed || [false, .5, .5];
      s.trend = Array.from({ length: 7 }, (_, w) => {
        const g = rising ? .42 + .58 * Math.pow(w / 7, 1.6) : .86 + .14 * (w / 7);
        return Math.max(2, Math.min(99, Math.round(res.score * g + (a - .5) * 8 + Math.sin(w * 1.7 + b * 6) * 3)));
      });
    }
    return s;
  }

  /* ---------------- state ---------------- */
  let mode = 'demo';
  let data = demoData();
  let sel = null;
  const st = store.get('radar-state', {});
  const saveState = () => store.set('radar-state', st);
  const S = (s) => st[mode + ':' + s.id] || (st[mode + ':' + s.id] = {});
  const thr = () => +$('[data-f="thr"]').value;
  let sort = { k: 'score', dir: -1 };

  function view() {
    const q = $('[data-f="q"]').value.trim(), fac = $('[data-f="fac"]').value, yr = $('[data-f="year"]').value, stf = $('[data-f="st"]').value;
    return data.map((s) => {
      const r = scoreOf(s);
      const ov = S(s);
      const status = ov.status || s.status || 'new';
      const alert = r.score >= thr();
      return { s, ...r, status: alert ? status : '—', alert, hrs: s.hrs == null ? 0 : s.hrs };
    }).filter((x) => {
      if (fac && x.s.fac !== fac) return false;
      if (yr && String(x.s.year) !== yr) return false;
      if (stf === 'alerts' && !(x.alert && x.status !== 'closed')) return false;
      if (stf && stf !== 'alerts' && x.status !== stf) return false;
      if (q) {
        const hay = ('#' + x.s.id + ' ' + x.s.dept + ' ' + facOf(x.s).short + ' ' + x.top.map((t) => t.label).join(' '));
        if (!hay.includes(q.replace(/^#/, '#'))) return false;
      }
      return true;
    }).sort((a, b) => {
      if (sort.k === 'status') return sort.dir * ('new assigned active closed —'.indexOf(a.status) - 'new assigned active closed —'.indexOf(b.status));
      if (sort.k === 'sla') return sort.dir * (a.hrs - b.hrs);
      return sort.dir * (a.score - b.score);
    });
  }
  const facOf = (s) => FAC.find((f) => f.id === s.fac) || { short: s.fac || '—', name: s.fac || '—', coord: 'רכזת הפקולטה' };
  const yearTxt = (y) => ['', "שנה א'", "שנה ב'", "שנה ג'", "שנה ד'"][y] || (y ? 'שנה ' + y : '');

  /* ---------------- rendering ---------------- */
  function spark(trend, score) {
    const pts = trend.concat([score]);
    const w = 84, h = 26, max = 100;
    const xy = pts.map((v, i) => [i * (w / (pts.length - 1)), h - (v / max) * h]);
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><path d="M' + xy.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') + '"/><circle cx="' + xy[xy.length - 1][0] + '" cy="' + xy[xy.length - 1][1] + '" r="2.6"/></svg>';
  }
  function slaCell(x) {
    if (!x.alert) return '<span class="sla muted">—</span>';
    if (x.status === 'closed') return '<span class="sla">טופלה</span>';
    const late = x.hrs > SLA;
    return '<span class="sla' + (late ? ' late' : '') + '">' + x.hrs + ' ש׳ ' + (late ? '· חריגה' : 'מתוך 72') + '<span class="bar"><i style="width:' + Math.min(100, x.hrs / SLA * 100) + '%"></i></span></span>';
  }
  function paint() {
    const rows = view();
    const body = $('[data-rows]');
    if (!rows.length) { body.innerHTML = '<tr class="empty-row"><td colspan="6">אין סטודנטים שעומדים בסינון. נסו להוריד את סף ההתראה או לבחור "כל הסטודנטים".</td></tr>'; }
    else body.innerHTML = rows.slice(0, 250).map((x) => {
      const lv = level(x.score);
      return '<tr tabindex="0" data-id="' + x.s.id + '" aria-selected="' + (sel === x.s.id) + '">' +
        '<td><span class="score"><b>' + x.score + '</b><span class="lvl"><i style="background:' + lv.c + '"></i>' + lv.n + '</span></span></td>' +
        '<td><div class="sid">סטודנט/ית #' + esc(x.s.id) + '</div><div class="sub">' + esc([facOf(x.s).short, x.s.dept, yearTxt(x.s.year)].filter(Boolean).join(' · ')) + '</div></td>' +
        '<td class="hide-sm">' + spark(x.s.trend || [], x.score) + '</td>' +
        '<td><div class="chips">' + x.top.map((t) => '<span class="chip">' + esc(t.why) + '</span>').join('') + '</div></td>' +
        '<td>' + (x.alert ? '<span class="st">' + icon(ST_I[x.status]) + ST[x.status] + '</span>' : '<span class="muted small">ללא התראה</span>') + '</td>' +
        '<td class="hide-sm">' + slaCell(x) + '</td></tr>';
    }).join('');
    $('[data-count]').textContent = 'מוצגים ' + fmt.int(Math.min(rows.length, 250)) + ' מתוך ' + fmt.int(data.length);
    kpis();
  }
  function kpis() {
    const all = data.map((s) => ({ s, ...scoreOf(s), status: S(s).status || s.status || 'new', hrs: s.hrs || 0 }));
    const alerts = all.filter((x) => x.score >= thr());
    const open = alerts.filter((x) => x.status !== 'closed');
    const fresh = alerts.filter((x) => x.status === 'new');
    const handled = alerts.filter((x) => x.status === 'active' || x.status === 'closed');
    const inSla = alerts.length ? alerts.filter((x) => (x.status === 'active' || x.status === 'closed') ? x.hrs <= SLA || x.status === 'closed' : x.hrs <= SLA).length / alerts.length : 1;
    $('[data-kpis]').innerHTML = [
      ['סטודנטים בניטור', fmt.int(all.length), mode === 'demo' ? 'נתוני הדגמה' : 'מהקובץ שלכם'],
      ['התראות פתוחות', fmt.int(open.length), 'מעל סף ' + thr()],
      ['חדשות מריצת הלילה', fmt.int(fresh.length), 'ממתינות לשיוך'],
      ['בתוך 72 שעות', fmt.pct(inSla), 'יעד 85% · ' + fmt.int(handled.length) + ' בטיפול או טופלו'],
    ].map(([a, b, c]) => '<div class="kpi"><small>' + a + '</small><b>' + b + '</b><span>' + c + '</span></div>').join('');
  }

  /* ---------------- drawer ---------------- */
  const drawer = $('[data-drawer]'), scrim = $('[data-scrim]');
  let lastFocus = null;
  function open(id) {
    const s = data.find((x) => String(x.s ? x.s.id : x.id) === String(id));
    if (!s) return;
    sel = s.id; lastFocus = document.activeElement;
    $$('[data-rows] tr').forEach((tr) => tr.setAttribute('aria-selected', String(tr.dataset.id === String(id))));
    const r = scoreOf(s), lv = level(r.score), ov = S(s), f = facOf(s);
    const status = ov.status || s.status || 'new';
    const prev = (s.trend || [])[Math.max(0, (s.trend || []).length - 2)];
    $('[data-dr-title]').textContent = 'סטודנט/ית #' + s.id;
    $('[data-dr-sub]').textContent = [f.name, s.dept, yearTxt(s.year)].filter(Boolean).join(' · ');
    const helps = r.top.map((t) => t.k).concat(r.score >= 85 ? ['inq'] : []).filter((k, i, a) => a.indexOf(k) === i);
    const checked = ov.help || [];
    const coord = ov.coord || f.coord;
    const tl = [['ההתראה נפתחה', (s.hrs || 0) + ' שעות · ריצת לילה']]
      .concat(status !== 'new' ? [['שויכה ל' + coord, 'אחרי ' + Math.max(1, Math.round((s.hrs || 1) * .2)) + ' שעות']] : [])
      .concat(status === 'active' || status === 'closed' ? [['שיחת התערבות תועדה', 'אחרי ' + Math.max(2, Math.round((s.hrs || 2) * .6)) + ' שעות']] : [])
      .concat(status === 'closed' ? [['ההתראה נסגרה', 'הסטודנט/ית חזר/ה למסלול']] : []);
    $('[data-dr-body]').innerHTML =
      '<div class="row-between"><div class="score"><b style="min-width:58px;height:40px;font-size:22px">' + r.score + '</b><div><span class="lvl"><i style="background:' + lv.c + '"></i>סיכון ' + lv.n + '</span><div class="small muted">' + (prev != null ? (r.score - prev >= 0 ? 'עלייה של ' : 'ירידה של ') + Math.abs(r.score - prev) + ' נק׳ מהשבוע שעבר' : '') + '</div></div></div>' +
      '<span class="st">' + icon(ST_I[status]) + ST[status] + '</span></div>' +
      '<div><h3>מגמה ב-8 שבועות <span class="small muted" style="font-weight:500">קו מקווקו: סף ההתראה</span></h3><div class="chart-box" data-trend></div></div>' +
      '<div><h3>שלושת הגורמים לציון</h3>' + r.top.map((t) => '<div class="factor"><span>' + esc(t.why) + '</span><b>' + Math.round(t.share * 100) + '%</b><span class="track"><i style="width:' + Math.round(t.share * 100) + '%"></i></span></div>').join('') +
      '<p class="small muted">המודל מציג את הסיבות, לא רק את המספר. האחוז הוא החלק של כל גורם בציון.</p></div>' +
      '<div><h3>הנתונים</h3><div class="ind-grid">' + FEATS.map((ft) => '<div class="ind"><small>' + esc(ft.short) + '</small><b>' + esc(s[ft.k]) + esc(ft.unit) + '</b></div>').join('') + '</div></div>' +
      '<div><h3>מענה מומלץ</h3>' + helps.map((k) => '<label class="chk"><input type="checkbox" data-help="' + k + '"' + (checked.includes(k) ? ' checked' : '') + '><span>' + esc(HELP[k].t) + '<small>' + esc(HELP[k].d) + '</small></span></label>').join('') + '</div>' +
      '<div class="split-2"><label class="field-l">גורם מטפל<select class="select" data-coord>' + COORDS.map((c) => '<option' + (c === coord ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></label>' +
      '<label class="field-l">סטטוס<select class="select" data-status>' + Object.entries(ST).map(([k, v]) => '<option value="' + k + '"' + (k === status ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></label></div>' +
      '<div><h3>פנייה לסטודנט/ית <button class="mini-btn" type="button" data-draft>' + icon('sparkle') + 'ניסוח במודל המקומי</button></h3>' +
      '<textarea class="textarea" data-msg rows="5" placeholder="לחצו על &quot;ניסוח במודל המקומי&quot; לקבלת טיוטה חמה, בלי ציון ובלי מונחים טכניים.">' + esc(ov.msg || '') + '</textarea>' +
      '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button class="mini-btn" type="button" data-copymsg>' + icon('copy') + 'העתקה</button><span class="small muted" data-draft-st></span></div></div>' +
      '<div><h3>ציר זמן</h3><ul class="timeline">' + tl.map(([a, b]) => '<li><span>' + esc(a) + '<small>' + esc(b) + '</small></span></li>').join('') + '</ul></div>';
    trendChart($('[data-trend]'), (s.trend || []).concat([r.score]));
    drawer.classList.add('open'); scrim.classList.add('on');
    drawer.querySelector('[data-dr-close]').focus();
    const body = $('[data-dr-body]');
    body.querySelectorAll('[data-help]').forEach((c) => c.addEventListener('change', () => { ov.help = $$('[data-help]:checked', body).map((x) => x.dataset.help); saveState(); }));
    $('[data-coord]', body).addEventListener('change', (e) => { ov.coord = e.target.value; if (!ov.status || ov.status === 'new') { ov.status = 'assigned'; $('[data-status]', body).value = 'assigned'; } saveState(); paint(); toast('שויך ל' + e.target.value); });
    $('[data-status]', body).addEventListener('change', (e) => { ov.status = e.target.value; saveState(); paint(); });
    $('[data-msg]', body).addEventListener('input', (e) => { ov.msg = e.target.value; saveState(); });
    $('[data-copymsg]', body).addEventListener('click', async () => { try { await navigator.clipboard.writeText($('[data-msg]', body).value); toast('הטיוטה הועתקה'); } catch { toast('לא הצלחתי להעתיק', 'warn'); } });
    $('[data-draft]', body).addEventListener('click', () => draft(s, r, coord, helps.filter((k) => !checked.length || checked.includes(k))));
  }
  function close() { drawer.classList.remove('open'); scrim.classList.remove('on'); sel = null; $$('[data-rows] tr').forEach((tr) => tr.setAttribute('aria-selected', 'false')); if (lastFocus) lastFocus.focus(); }
  $('[data-dr-close]').addEventListener('click', close);
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('open')) close(); });

  function trendChart(host, pts) {
    const w = 480, h = 150, pl = 30, pr = 10, pt = 14, pb = 24;
    const X = (i) => pl + i * ((w - pl - pr) / (pts.length - 1));
    const Y = (v) => pt + (1 - v / 100) * (h - pt - pb);
    const grid = [0, 50, 100].map((v) => '<line class="gridline" x1="' + pl + '" x2="' + (w - pr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text class="axis-t" x="' + (pl - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + v + '</text>').join('');
    const t = thr();
    const thrLine = '<line x1="' + pl + '" x2="' + (w - pr) + '" y1="' + Y(t) + '" y2="' + Y(t) + '" stroke="#111" stroke-width="1.2" stroke-dasharray="4 4" opacity=".55"/>';
    const path = 'M' + pts.map((v, i) => X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' L');
    const area = path + ' L' + X(pts.length - 1) + ' ' + Y(0) + ' L' + X(0) + ' ' + Y(0) + ' Z';
    const labels = pts.map((v, i) => '<text class="axis-t" x="' + X(i) + '" y="' + (h - 6) + '" text-anchor="middle">' + (i === pts.length - 1 ? 'השבוע' : '−' + (pts.length - 1 - i)) + '</text>').join('');
    host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="ציון הסיכון ב-8 השבועות האחרונים: ' + pts.join(', ') + '" style="direction:ltr">' + grid + thrLine +
      '<path d="' + area + '" fill="var(--series-1)" opacity=".08"/><path d="' + path + '" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      pts.map((v, i) => '<circle cx="' + X(i) + '" cy="' + Y(v) + '" r="' + (i === pts.length - 1 ? 4.5 : 3) + '" fill="' + (i === pts.length - 1 ? 'var(--series-1)' : '#fff') + '" stroke="var(--series-1)" stroke-width="2"/>').join('') +
      '<text class="lbl-t" x="' + (X(pts.length - 1) - 8) + '" y="' + (Y(pts[pts.length - 1]) - 9) + '" text-anchor="end">' + pts[pts.length - 1] + '</text>' + labels +
      pts.map((v, i) => '<rect x="' + (X(i) - 22) + '" y="0" width="44" height="' + h + '" fill="transparent" data-i="' + i + '"/>').join('') + '</svg><div class="chart-tip"></div>';
    const tip = $('.chart-tip', host), svg = $('svg', host);
    svg.addEventListener('pointermove', (e) => {
      const rct = e.target.closest('rect[data-i]');
      if (!rct) { tip.classList.remove('on'); return; }
      const i = +rct.dataset.i, b = svg.getBoundingClientRect();
      tip.style.left = (X(i) / w * b.width) + 'px'; tip.style.top = (Y(pts[i]) / h * b.height) + 'px';
      tip.textContent = (i === pts.length - 1 ? 'השבוע' : 'לפני ' + (pts.length - 1 - i) + ' שבועות') + ' · ציון ' + pts[i];
      tip.classList.add('on');
    });
    svg.addEventListener('pointerleave', () => tip.classList.remove('on'));
  }

  /* ---------------- local-LLM outreach draft ---------------- */
  async function draft(s, r, coord, helps) {
    const box = $('[data-msg]'), stl = $('[data-draft-st]'), btn = $('[data-draft]');
    const f = facOf(s);
    const name = coord.replace(/\s*\(.*\)$/, '');
    const offers = helps.map((k) => HELP[k].t).join('; ');
    const fallback = 'היי, כאן ' + name + ', ' + (coord.includes('דיקנאט') ? 'מדיקנאט הסטודנטים' : 'רכזת ' + f.name.replace('הפקולטה ', 'הפקולטה ')) + ' 🙂 רציתי לבדוק מה שלומך ואיך הסמסטר מתקדם. יש לנו כמה דרכים לעזור, למשל ' + helps.slice(0, 2).map((k) => HELP[k].t).join(' או ') + '. נוח לך לקבוע שיחה קצרה מחר ב-10:00 או ביום חמישי ב-13:00?';
    btn.disabled = true; stl.textContent = 'המודל המקומי כותב…';
    try {
      const text = await local.llm({
        system: 'את עוזרת כתיבה לרכזות במכללה. כתבי הודעת וואטסאפ קצרה (3–4 משפטים), חמה, מכבדת ולא שיפוטית, מהרכזת אל הסטודנט. המטרה: להזמין לשיחה קצרה ולהציע עזרה. אסור להזכיר ציון, סיכון, מודל, מעקב, נתונים או נוכחות באופן מאשים. בלי שמות של הסטודנט ובלי פרטים מזהים. החזירי רק את נוסח ההודעה.',
        user: 'שם הרכזת: ' + name + '. היחידה: ' + (coord.includes('דיקנאט') ? 'דיקנאט הסטודנטים' : f.name) + '.\nעזרה שאפשר להציע: ' + offers + '.\nהצעת מועדים לשיחה: מחר ב-10:00 או ביום חמישי ב-13:00.',
        maxLength: 260, temperature: .55,
        onTick: (sec) => { stl.textContent = 'המודל המקומי כותב… ' + Math.round(sec) + ' שנ׳'; },
      });
      box.value = text || fallback; stl.textContent = text ? 'נוסח במודל המקומי. כדאי לעבור ולהתאים לפני שליחה.' : 'טיוטה מתבנית.';
    } catch (e) {
      box.value = fallback; stl.textContent = 'המודל המקומי לא זמין, הוכנה טיוטה מתבנית.';
    } finally {
      btn.disabled = false;
      const ov = S(s); ov.msg = box.value; saveState();
    }
  }

  /* ---------------- weights ---------------- */
  function weights() {
    const host = $('[data-weights]');
    host.innerHTML = FEATS.map((f) => '<label><span>' + esc(f.label) + '</span><input type="range" min="0" max="0.5" step="0.05" value="' + W[f.k] + '" data-w="' + f.k + '" aria-label="משקל ' + esc(f.label) + '"><b data-wo="' + f.k + '">' + Math.round(W[f.k] * 100) + '</b></label>').join('') +
      '<div><button class="mini-btn" type="button" data-wreset>' + icon('refresh') + 'איפוס משקלות</button></div>';
    host.addEventListener('input', (e) => {
      const k = e.target.dataset.w; if (!k) return;
      W[k] = +e.target.value; $('[data-wo="' + k + '"]').textContent = Math.round(W[k] * 100);
      store.set('radar-weights', W); formula(); paint();
    });
    host.addEventListener('click', (e) => { if (e.target.closest('[data-wreset]')) { W = Object.fromEntries(FEATS.map((f) => [f.k, f.w])); store.set('radar-weights', null); weights(); formula(); paint(); } });
    hydrateIcons(host);
  }
  function formula() {
    $('[data-formula]').innerHTML = 'x = Σ wᵢ·cᵢ / Σ wᵢ   (cᵢ ∈ [0,1] per signal)<br>score = 100 / (1 + e^(−8·(x − 0.42)))<br>alert when score ≥ ' + thr() + ' · SLA 72h';
  }

  /* ---------------- CSV ---------------- */
  const ALIAS = {
    id: ['id', 'מזהה', 'student_id', 'מספר'], fac: ['faculty', 'פקולטה'], dept: ['dept', 'department', 'חוג', 'מחלקה'], year: ['year', 'שנה'],
    attendance: ['attendance', 'נוכחות'], logins: ['moodle_logins_14d', 'logins', 'כניסות_למודל', 'כניסות'], missing: ['missing_assignments', 'missing', 'מטלות_חסרות', 'מטלות'],
    overdue: ['payment_overdue_days', 'overdue', 'ימי_פיגור', 'פיגור'], grade: ['avg_grade', 'grade', 'ממוצע'], inq: ['inquiries_14d', 'inquiries', 'פניות'],
  };
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const d = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
      else if (c === '"') q = true;
      else if (c === d) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim()));
  }
  function fromCSV(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) throw new Error('הקובץ ריק או בלי שורות נתונים');
    const head = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const idx = {};
    for (const [k, al] of Object.entries(ALIAS)) idx[k] = head.findIndex((h) => al.includes(h));
    const need = ['attendance', 'logins', 'missing', 'overdue', 'grade'];
    const miss = need.filter((k) => idx[k] < 0);
    if (miss.length) throw new Error('חסרות עמודות: ' + miss.map((k) => ALIAS[k][0]).join(', '));
    const num = (v, d) => { const n = parseFloat(String(v || '').replace('%', '').replace(',', '.')); return isFinite(n) ? n : d; };
    return rows.slice(1).map((r, i) => {
      const facRaw = idx.fac >= 0 ? (r[idx.fac] || '').trim() : '';
      const fac = FAC.find((f) => f.id === facRaw || f.name === facRaw || f.short === facRaw || facRaw.includes(f.short.split(',')[0])) || null;
      return finish({
        id: idx.id >= 0 ? String(r[idx.id]).trim() || String(i + 1) : String(i + 1),
        fac: fac ? fac.id : facRaw || '—', dept: idx.dept >= 0 ? r[idx.dept] : '', year: Math.round(num(idx.year >= 0 ? r[idx.year] : '', 1)),
        attendance: Math.round(num(r[idx.attendance], 100)), logins: Math.round(num(r[idx.logins], 10)), missing: Math.round(num(r[idx.missing], 0)),
        overdue: Math.round(num(r[idx.overdue], 0)), grade: Math.round(num(r[idx.grade], 80)), inq: Math.round(num(idx.inq >= 0 ? r[idx.inq] : 0, 0)),
        hrs: 0, status: 'new', trendSeed: [false, .5, .5],
      });
    });
  }
  function download(name, text) {
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const csvCell = (v) => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
  function template() {
    download('shachar-template.csv', 'id,faculty,year,attendance,moodle_logins_14d,missing_assignments,payment_overdue_days,avg_grade,inquiries_14d\n' +
      '1001,חינוך ומנהיגות,1,92,12,0,0,86,0\n1002,מדעים,1,61,2,3,40,66,3\n1003,פסיכולוגיה,2,78,7,1,0,74,1\n');
  }
  function exportCSV() {
    const rows = view();
    const out = ['id,faculty,year,score,level,factor_1,factor_2,factor_3,status,hours_open'].concat(rows.map((x) => [x.s.id, facOf(x.s).short, x.s.year, x.score, level(x.score).n, ...[0, 1, 2].map((i) => (x.top[i] ? x.top[i].why : '')), x.alert ? ST[x.status] : 'ללא התראה', x.alert ? x.hrs : ''].map(csvCell).join(',')));
    download('shachar-radar-' + new Date().toISOString().slice(0, 10) + '.csv', out.join('\n') + '\n');
    toast('הקובץ יוצא (' + rows.length + ' שורות)');
  }
  const file = $('[data-file]');
  [$('[data-import]'), $('[data-import2]')].forEach((b) => b.addEventListener('click', () => file.click()));
  [$('[data-template]'), $('[data-template2]')].forEach((b) => b.addEventListener('click', template));
  $('[data-export]').addEventListener('click', exportCSV);
  file.addEventListener('change', async () => {
    const f = file.files[0]; if (!f) return;
    try {
      const rows = fromCSV(await f.text());
      data = rows; mode = 'file:' + f.name; close();
      $('[data-banner-text]').textContent = 'הנתונים מהקובץ "' + f.name + '" · ' + rows.length + ' שורות. הקובץ נקרא בדפדפן בלבד ולא נשמר.';
      $('[data-demo]').hidden = false;
      $('[data-f="st"]').value = '';
      paint(); toast('נטענו ' + rows.length + ' סטודנטים מהקובץ');
    } catch (e) { toast(e.message, 'warn'); }
    file.value = '';
  });
  $('[data-demo]').addEventListener('click', () => { data = demoData(); mode = 'demo'; $('[data-demo]').hidden = true; $('[data-banner-text]').textContent = 'נתוני הדגמה סינתטיים · 180 סטודנטים בשנים א\'–ג\'. אין כאן מידע על סטודנטים אמיתיים.'; $('[data-f="st"]').value = 'alerts'; paint(); });

  /* ---------------- wiring ---------------- */
  $('[data-f="fac"]').insertAdjacentHTML('beforeend', FAC.map((f) => '<option value="' + f.id + '">' + esc(f.short) + '</option>').join(''));
  $$('[data-f]').forEach((el) => el.addEventListener('input', () => { if (el.dataset.f === 'thr') { $('[data-thr-out]').textContent = el.value; formula(); } paint(); }));
  $$('[data-sort]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.sort; sort = { k, dir: sort.k === k ? -sort.dir : (k === 'sla' ? -1 : -1) }; paint(); }));
  $('[data-rows]').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) open(tr.dataset.id); });
  $('[data-rows]').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-id]')) { e.preventDefault(); open(e.target.dataset.id); } });

  weights(); formula(); paint(); hydrateIcons();
  const qid = new URLSearchParams(location.search).get('id');
  if (qid) open(qid);
})();
