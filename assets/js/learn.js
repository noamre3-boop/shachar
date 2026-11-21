/* שחר · learn — courses inside the existing chat.
   1. choose a course → 5-question placement test → level and a starting unit
   2. choose a learning style: game · multiple choice · open questions · personal style
   3. units: short lesson → practice in the chosen style → next unit
   Progress is saved per user after every answer, so the chat can resume exactly there. */
(function () {
  'use strict';
  const S = window.Shachar;
  const { $, $$, esc, icon, hydrateIcons, toast, local, sleep } = S;
  const A = S.account, C = S.chat;
  const COURSES = window.SHACHAR_COURSES || [];
  if (!A || !COURSES.length) return;
  const byId = (id) => COURSES.find((c) => c.id === id);

  const STYLES = {
    game: { t: 'משחק', d: 'שעון, נקודות, רצף ושלושה לבבות', i: 'game' },
    mcq: { t: 'שאלות אמריקאיות', d: 'שיעור קצר, ואז שאלות עם הסבר אחרי כל תשובה', i: 'list2' },
    open: { t: 'שאלות פתוחות', d: 'עונים במילים שלך, ושחר נותן משוב', i: 'pen' },
    custom: { t: 'סגנון אישי', d: 'מספרים לשחר איך נוח לך, והוא מתאים את ההסבר', i: 'sparkle' },
  };
  const LET = ['א', 'ב', 'ג', 'ד', 'ה'];
  const GAME_SECONDS = 20;

  /* ---------- state, per user ---------- */
  let L = A.mem.get('learn', null) || {};
  L.courses = L.courses || {}; L.xp = L.xp || 0; L.days = L.days || { last: '', streak: 0 };
  const save = () => A.mem.set('learn', L);
  const cs = (id) => (L.courses[id] = L.courses[id] || { placed: false, pAns: [], unit: 1, done: [], known: [], style: '', custom: '', pos: null, finished: false });
  const today = (d) => (d || new Date()).toLocaleDateString('en-CA');
  function touchDay() {
    const t = today();
    if (L.days.last === t) return;
    L.days.streak = L.days.last === today(new Date(Date.now() - 864e5)) ? (L.days.streak || 0) + 1 : 1;
    L.days.last = t;
  }
  function addXP(n) { L.xp = (L.xp || 0) + n; touchDay(); save(); }
  const nextUnit = (s) => { for (let u = 1; u <= 5; u++) if (!s.done.includes(u)) return u; return 0; };

  /* ---------- memory: what the model and the "what Shachar remembers" panel see ---------- */
  A.mem.providers.push({
    profile() {
      const parts = [];
      COURSES.forEach((c) => {
        const s = L.courses[c.id];
        if (!s || !(s.placed || s.pAns.length)) return;
        parts.push(c.title + ': ' + (s.placed ? 'רמה ' + s.level + ', ' + s.done.length + ' מתוך 5 יחידות' + (s.finished ? ', הקורס הושלם' : ', עכשיו ביחידה ' + s.unit + ' ("' + c.units[s.unit - 1].t + '")') : 'באמצע מבחן הרמה'));
      });
      if (!parts.length) return '';
      let t = 'לומד/ת עם שחר: ' + parts.join('; ') + '.';
      const a = L.active && L.courses[L.active];
      if (a && a.style) t += ' סגנון לימוד מועדף: ' + STYLES[a.style].t + (a.custom ? ' ("' + a.custom + '")' : '') + '.';
      if (a && a.placed && !a.finished && a.pos) {
        const U = byId(L.active).units[a.unit - 1];
        t += '\n- החומר של היחידה הנוכחית (אם שואלים עליו, הסבר לפיו): ' + U.lesson;
      }
      return t;
    },
    panel() {
      const rows = COURSES.map((c) => {
        const s = L.courses[c.id];
        if (!s || !(s.placed || s.pAns.length)) return '';
        const n = s.done.length;
        return '<li><span class="lx-ic">' + icon(c.icon) + '</span><div><b>' + esc(c.title) + '</b><small>' + (s.placed ? (s.finished ? 'הושלם' : 'יחידה ' + s.unit + ' מתוך 5') + ' · ' + esc(s.level) + (s.style ? ' · ' + STYLES[s.style].t : '') : 'באמצע מבחן הרמה') + '</small><span class="lx-bar"><i style="width:' + n * 20 + '%"></i></span></div></li>';
      }).join('');
      return '<h3 class="me-h3">' + icon('cap') + 'לימודים</h3>' + (rows
        ? '<p class="me-stats">' + icon('star') + (L.xp || 0) + ' XP · ' + icon('flame') + 'רצף ' + (L.days.streak || 0) + ' ימים</p><ul class="me-learn">' + rows + '</ul>'
        : '<p class="me-empty">עוד לא התחלת קורס. בצ׳אט, הכפתור "קורסים" פותח אותם.</p>');
    },
  });

  if (!C) return; // the rest runs inside the chat only


  /* ---------- small helpers ---------- */
  // English inside Hebrew text: keep each English run left-to-right
  function rich(s) {
    // a run of English (with its own spaces, commas, hyphens, "= 0.05"), plus a final ./!/? only
    // when it ends an English sentence; brackets and Hebrew punctuation stay outside the run
    return esc(String(s).replace(/(?:-(?=[A-Za-z]))?[A-Za-z_](?:[A-Za-z0-9_ ,.;:'’=-]*[A-Za-z0-9_])?(?:-(?=[\s,)]|$))?(?:[.!?](?=["”״'\s]|$))?/g, (m) => {
      // only a real English sentence keeps its final mark inside the run
      if (/[.!?]$/.test(m) && (m.match(/[A-Za-z]{2,}/g) || []).length < 3) return '\u0001' + m.slice(0, -1) + '\u0002' + m.slice(-1);
      return '\u0001' + m + '\u0002';
    }))
      .replace(/\u0001/g, '<span class="en" dir="ltr">').replace(/\u0002/g, '</span>');
  }
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const canLLM = () => local.state === 'ok' || local.state === 'busy';
  const kick = (c, u, extra) => '<div class="lx-kick">' + icon(c.icon) + '<span>' + esc(c.title) + (u ? ' · יחידה ' + u + ' מתוך 5' : '') + (extra ? ' · ' + esc(extra) : '') + '</span></div>';
  function lock(row, chosen) {
    $$('button', row).forEach((b) => { b.disabled = true; if (chosen && b !== chosen) b.classList.add('dim'); });
    if (chosen) chosen.classList.add('picked');
  }
  function mapHTML(c, s, cur) {
    return '<ol class="lx-map">' + c.units.map((U, i) => {
      const u = i + 1, st = s.done.includes(u) ? (s.known.includes(u) ? 'known' : 'done') : u === cur ? 'now' : '';
      return '<li class="' + st + '"><i>' + (st === 'done' || st === 'known' ? icon('check') : u) + '</i><span>' + esc(U.t) + '</span>' + (st === 'known' ? '<em>ידוע ממבחן הרמה</em>' : st === 'now' ? '<em>כאן ממשיכים</em>' : '') + '</li>';
    }).join('') + '</ol>';
  }

  /* ---------- flows: one at a time ---------- */
  let flow = 0;
  const timers = new Set();
  function begin() { C.dropLive(); timers.forEach(clearTimeout); timers.clear(); return ++flow; }
  const alive = (f) => f === flow;

  /* ---------- the local model as a tutor ---------- */
  const TEACH = 'אתה "שחר", מורה פרטי סבלני וחם במכללה. כתוב בעברית פשוטה ותקנית, במשפטים קצרים, בלשון פנייה ניטרלית שלא מניחה מגדר (משפטים עם "אפשר" ו"כדאי"). ' +
    'אל תכתוב כותרות, רשימות ממוספרות או סימני Markdown. שמור על דיוק עובדתי, ואל תוסיף עובדות שלא הופיעו בחומר.';
  async function teach(prompt, max) {
    const prof = A.profileText();
    return local.llm({ system: TEACH + (prof ? '\n\n' + prof : ''), messages: [{ role: 'user', content: prompt }], maxLength: max || 380, temperature: .35 });
  }

  /* ---------- a multiple-choice question card ---------- */
  function askMCQ(o) {
    return new Promise((resolve) => {
      const opts = shuffle(o.o.map((t, i) => ({ t, ok: i === 0 })));
      if (o.skip) opts.push({ t: 'לא יודע/ת', ok: false, skip: true });
      const timed = o.time && !S.reduced();
      const row = C.card('<div class="lx-card lx-q">' + o.kicker + (o.hud || '') +
        (o.time ? '<div class="lx-timer"><i style="animation-duration:' + o.time + 's"></i></div>' : '') +
        '<h3 class="lx-qt">' + rich(o.q) + '</h3><div class="lx-opts">' +
        opts.map((x, i) => '<button class="lx-opt' + (x.skip ? ' lx-skip' : '') + '" type="button" data-n="' + i + '"><span class="lx-l">' + (x.skip ? '?' : LET[i]) + '</span><span class="lx-t">' + rich(x.t) + '</span></button>').join('') +
        '</div></div>');
      const card = $('.lx-card', row);
      let done = false, timer = null;
      function finish(n) {
        if (done || !row.isConnected) return; done = true;
        if (timer) { clearTimeout(timer); timers.delete(timer); }
        const pick = opts[n];
        $$('.lx-opt', row).forEach((b, j) => {
          b.disabled = true;
          if (opts[j].ok && !o.hideAnswer) b.classList.add('ok');
          else if (j === n) b.classList.add(o.hideAnswer ? 'picked' : 'bad');
          else b.classList.add('dim');
        });
        const bar = $('.lx-timer', row); if (bar) bar.classList.add('stop');
        const ok = !!(pick && pick.ok);
        if (o.e && !o.hideAnswer) card.insertAdjacentHTML('beforeend', '<p class="lx-exp ' + (ok ? 'good' : 'miss') + '">' + icon(ok ? 'check' : 'alert') + '<span><b>' + (ok ? 'נכון.' : n < 0 ? 'נגמר הזמן.' : 'לא בדיוק.') + '</b> ' + rich(o.e) + '</span></p>');
        if (o.pts && ok) card.insertAdjacentHTML('beforeend', '<span class="lx-pop">+' + o.pts() + ' XP</span>');
        hydrateIcons(card);
        if (C.atBottom() || row === C.log.lastElementChild) C.toBottom();
        C.persist(row, '[' + (o.label || 'שאלה') + ': ' + o.q + ' | ' + (pick ? 'בחר: ' + pick.t : 'לא ענה בזמן') + (o.hideAnswer ? '' : ' | ' + (ok ? 'נכון' : 'לא נכון')) + ']');
        resolve({ ok, timedOut: n < 0, skip: !!(pick && pick.skip) });
      }
      row.addEventListener('click', (e) => { const b = e.target.closest('.lx-opt'); if (b && !b.disabled) finish(+b.dataset.n); });
      if (timed) { timer = setTimeout(() => finish(-1), o.time * 1000); timers.add(timer); }
    });
  }

  /* ---------- course picker ---------- */
  function coursesHTML() {
    return '<div class="lx-card lx-courses">' +
      '<div class="lx-stats"><span>' + icon('flame') + 'רצף: ' + (L.days.streak || 0) + ' ימים</span><span>' + icon('star') + (L.xp || 0) + ' XP</span></div>' +
      '<div class="lx-tiles">' + COURSES.map((c) => {
        const s = L.courses[c.id];
        const n = s ? s.done.length : 0;
        const st = !s || !s.placed ? (s && s.pAns.length ? 'מבחן רמה: שאלה ' + (s.pAns.length + 1) + ' מתוך 5' : 'עוד לא התחלת') : s.finished ? 'הושלם' : 'יחידה ' + s.unit + ' מתוך 5 · ' + s.level;
        return '<button class="lx-tile' + (L.active === c.id && s && !s.finished ? ' cur' : '') + '" type="button" data-course="' + c.id + '"><span class="lx-ic">' + icon(c.icon) + '</span>' +
          '<b>' + esc(c.title) + '</b><small>' + esc(c.blurb) + '</small><span class="lx-bar"><i style="width:' + (n * 20) + '%"></i></span><em>' + esc(st) + '</em></button>';
      }).join('') + '</div></div>';
  }
  async function openCourses() {
    const f = begin();
    const any = Object.values(L.courses).some((s) => s.placed || s.pAns.length);
    await C.say(any ? 'אלה הקורסים. אפשר להמשיך מאיפה שעצרת, או להתחיל משהו חדש.' : 'אלה הקורסים שאפשר ללמוד איתי. בכל קורס מתחילים במבחן רמה קצר של 5 שאלות, ואחר כך לומדים בסגנון שנוח לך.');
    if (!alive(f)) return;
    const row = C.card(coursesHTML());
    row.addEventListener('click', (e) => {
      const b = e.target.closest('[data-course]');
      if (!b || b.disabled) return;
      lock(row, b); C.persist(row, '[בחר קורס: ' + byId(b.dataset.course).title + ']');
      go(b.dataset.course);
    });
  }

  /* ---------- entering a course ---------- */
  async function go(id, f) {
    f = f || begin();
    const c = byId(id), s = cs(id);
    L.active = id; touchDay(); save(); chips();
    if (s.finished) return finished(id, f);
    if (!s.placed) return placement(id, f);
    if (!s.style) return pickStyle(id, f);
    return runUnit(id, f);
  }

  async function placement(id, f) {
    const c = byId(id), s = cs(id);
    if (!s.pAns.length) await C.say('מתחילים ב' + c.title + '. קודם 5 שאלות קצרות, מהקלה לקשה, כדי שאדע מאיפה כדאי להתחיל. אין כאן ציון, ו"לא יודע/ת" היא תשובה לגמרי בסדר.');
    else await C.say('ממשיכים את מבחן הרמה ב' + c.title + ', משאלה ' + (s.pAns.length + 1) + '.');
    for (let i = s.pAns.length; i < 5; i++) {
      if (!alive(f)) return;
      const p = c.placement[i];
      const r = await askMCQ({ kicker: kick(c, 0, 'מבחן רמה · שאלה ' + (i + 1) + ' מתוך 5'), q: p.q, o: p.o, skip: true, hideAnswer: true, label: 'מבחן רמה' });
      if (!alive(f)) return;
      s.pAns.push(r.ok ? 1 : 0); save();
      await sleep(260);
    }
    const score = s.pAns.reduce((a, b) => a + b, 0);
    const miss = s.pAns.indexOf(0);
    s.unit = miss < 0 ? 5 : miss + 1;
    s.known = []; for (let u = 1; u < s.unit; u++) s.known.push(u);
    s.done = s.known.slice();
    s.level = score <= 1 ? 'מתחילים' : score <= 3 ? 'בינוני' : 'מתקדמים';
    s.placed = true; s.pos = null; addXP(score * 5);
    const row = C.card('<div class="lx-card lx-result">' + kick(c, 0, 'תוצאת מבחן הרמה') +
      '<div class="lx-score"><b>' + score + '<small>/5</small></b><span>רמה: <strong>' + esc(s.level) + '</strong></span></div>' +
      mapHTML(c, s, s.unit) + '</div>');
    C.persist(row, '[מבחן רמה ב' + c.title + ': ' + score + ' מתוך 5, רמה ' + s.level + ', מתחילים מיחידה ' + s.unit + ']');
    chips();
    await C.say(s.known.length
      ? 'יפה. יחידות 1' + (s.known.length > 1 ? '–' + s.known.length : '') + ' כבר מוכרות לך, אז נתחיל מיחידה ' + s.unit + ': ' + c.units[s.unit - 1].t + '. אפשר לחזור ליחידות הקודמות בכל רגע.'
      : 'מעולה, נתחיל מההתחלה: יחידה 1, ' + c.units[0].t + '. נבנה את זה צעד אחרי צעד.');
    if (!alive(f)) return;
    return s.style ? runUnit(id, f) : pickStyle(id, f);
  }

  /* ---------- learning style ---------- */
  async function pickStyle(id, f) {
    f = f || begin();
    const s = cs(id);
    await C.say('איך נוח לך ללמוד? אפשר להחליף סגנון בכל רגע מהכפתור "סגנון" שמעל תיבת ההודעה.');
    if (!alive(f)) return;
    const row = C.card('<div class="lx-card lx-styles"><div class="lx-tiles">' + Object.keys(STYLES).map((k) =>
      '<button class="lx-tile' + (s.style === k ? ' cur' : '') + '" type="button" data-style="' + k + '"><span class="lx-ic">' + icon(STYLES[k].i) + '</span><b>' + STYLES[k].t + '</b><small>' + STYLES[k].d + '</small></button>').join('') + '</div></div>');
    const k = await new Promise((res) => row.addEventListener('click', (e) => { const b = e.target.closest('[data-style]'); if (b && !b.disabled) { lock(row, b); res(b.dataset.style); } }));
    if (!alive(f)) return;
    C.persist(row, '[בחר סגנון לימוד: ' + STYLES[k].t + ']');
    if (k === 'custom') {
      await C.say('ספרו לי במשפט איך הכי נוח לך ללמוד. למשל: "עם דוגמאות מכדורגל", "קצר ולעניין", "כמו סיפור", או "כאילו אני בכיתה ו׳".');
      if (!alive(f)) return;
      const t = await C.waitText('איך נוח לך ללמוד?');
      if (!alive(f) || t == null) return;
      s.custom = t.slice(0, 200);
      A.mem.addNote('סגנון לימוד מועדף: ' + s.custom);
    }
    s.style = k;
    // a new style restarts the current practice (the lesson already seen stays seen)
    if (s.pos && s.pos.phase !== 'lesson') s.pos = { unit: s.unit, phase: 'practice', qi: 0, score: 0 };
    save(); chips();
    await C.say(k === 'game' ? 'משחק זה. אחרי כל שיעור קצר יש סיבוב שאלות על הזמן, עם נקודות ולבבות.'
      : k === 'open' ? 'שאלות פתוחות. אחרי כל שיעור תהיה שאלה אחת, ותקבלו משוב על התשובה.'
        : k === 'custom' ? 'סגור. אתאים את ההסבר לסגנון שלך, ואשלב שאלות אמריקאיות ופתוחות.'
          : 'שאלות אמריקאיות. אחרי כל תשובה יופיע הסבר קצר.');
    if (!alive(f)) return;
    return runUnit(id, f);
  }

  /* ---------- a unit: lesson → practice → result ---------- */
  async function runUnit(id, f) {
    const c = byId(id), s = cs(id);
    if (!s.unit || s.done.includes(s.unit)) s.unit = nextUnit(s);
    if (!s.unit) { s.finished = true; save(); return finished(id, f); }
    const u = s.unit;
    if (!s.pos || s.pos.unit !== u) s.pos = { unit: u, phase: 'lesson' };
    save(); chips();
    if (s.pos.phase === 'lesson') {
      const ok = await lesson(id, u, f);
      if (!ok || !alive(f)) return;
      s.pos = { unit: u, phase: 'practice', qi: 0, score: 0 }; save();
    }
    let passed;
    if (s.style === 'game') passed = await game(id, u, f);
    else if (s.style === 'open') passed = await openQ(id, u, f);
    else if (s.style === 'custom') passed = await mixed(id, u, f);
    else passed = await mcqs(id, u, f, c.units[u - 1].mcq);
    if (passed == null || !alive(f)) return;
    return unitEnd(id, u, passed, f);
  }

  async function lesson(id, u, f) {
    const c = byId(id), s = cs(id), U = c.units[u - 1];
    let text = U.lesson;
    if (s.style === 'custom' && s.custom && canLLM()) {
      const th = C.thinking('שחר מתאים את ההסבר בשבילך…');
      try {
        const t = await teach('הסבר מחדש את השיעור הבא בסגנון שהסטודנט ביקש: "' + s.custom + '". שמור על כל העובדות והמושגים, בלי להוסיף עובדות חדשות. 4 עד 7 משפטים.\n\nהשיעור:\n' + U.lesson, 420);
        if (t && t.length > 60) text = t;
      } catch { /* fall back to the written lesson */ }
      th.remove();
      if (!alive(f)) return false;
    }
    const row = C.card('<div class="lx-card lx-lesson">' + kick(c, u, 'שיעור') + '<h3>' + rich(U.t) + '</h3><p class="lx-body" data-body></p>' +
      '<p class="lx-tip" hidden>' + icon('sparkle') + '<span>' + rich(U.tip) + '</span></p>' +
      '<div class="lx-actions" hidden><button class="lx-btn" type="button" data-go>' + icon('play') + 'לתרגול</button><button class="lx-ghost" type="button" data-again>' + icon('refresh') + 'הסבר אחר</button></div>' +
      '<p class="lx-hint" hidden>אפשר גם לשאול אותי כל שאלה על החומר בתיבת ההודעה.</p></div>');
    await C.typeOut($('[data-body]', row), text);
    $('[data-body]', row).innerHTML = rich(text);
    const follow = C.atBottom();
    $$('[hidden]', row).forEach((el) => { el.hidden = false; });
    if (follow) C.toBottom();
    if (!alive(f)) return false;
    return new Promise((res) => row.addEventListener('click', async (e) => {
      if (e.target.closest('[data-go]')) { lock(row, e.target.closest('[data-go]')); $('.lx-hint', row).remove(); C.persist(row, '[שיעור: ' + U.t + ']'); res(true); }
      const again = e.target.closest('[data-again]');
      if (again && !again.disabled) { again.disabled = true; await explainAgain(c, U); again.disabled = false; }
    }));
  }
  async function explainAgain(c, U) {
    if (canLLM()) {
      const th = C.thinking('שחר מחפש דרך אחרת להסביר…');
      let t = '';
      try { t = await teach('הסבר את הנושא "' + U.t + '" בדרך אחרת ופשוטה יותר, עם דוגמה אחת מחיי סטודנטים. 3 עד 5 משפטים.\n\nהחומר:\n' + U.lesson, 320); } catch { /* below */ }
      th.remove();
      if (t && t.length > 30) { await C.say(t); return; }
    }
    await C.say('בקצרה: ' + U.tip + (canLLM() ? '' : ' (כשהמודל המקומי מחובר, אוכל גם לנסח את כל ההסבר מחדש.)'));
  }

  async function mcqs(id, u, f, list, label) {
    const c = byId(id), s = cs(id), pos = s.pos;
    for (let i = pos.qi || 0; i < list.length; i++) {
      if (!alive(f)) return null;
      const r = await askMCQ({ kicker: kick(c, u, (label || 'שאלה') + ' ' + (i + 1) + ' מתוך ' + list.length), q: list[i].q, o: list[i].o, e: list[i].e, pts: () => 10 });
      if (!alive(f)) return null;
      if (r.ok) { pos.score = (pos.score || 0) + 1; addXP(10); }
      pos.qi = i + 1; save();
      await sleep(420);
    }
    return pos.score >= Math.ceil(list.length * 2 / 3);
  }

  /* game: rounds against the clock, XP with streak bonus, three hearts */
  function hudHTML(g, i, n) {
    return '<div class="lx-hud"><span class="lx-hearts" aria-label="' + g.hearts + ' לבבות">' + [0, 1, 2].map((k) => '<i class="' + (k < g.hearts ? 'on' : '') + '">' + icon('heart') + '</i>').join('') + '</span>' +
      '<span>' + icon('star') + g.xp + ' XP</span><span>' + icon('flame') + 'רצף ' + g.streak + '</span><span class="lx-round">סיבוב ' + (i + 1) + '/' + n + '</span></div>';
  }
  async function game(id, u, f) {
    const c = byId(id), s = cs(id), pos = s.pos, U = c.units[u - 1];
    if (!pos.pool) {
      const extra = [c.placement[u - 1]].concat(u > 1 ? [shuffle(c.units[u - 2].mcq)[0]] : []);
      pos.pool = shuffle(U.mcq.concat(extra.map((x) => ({ q: x.q, o: x.o, e: x.e || '' }))));
      pos.g = { hearts: 3, xp: 0, streak: 0, best: 0, right: 0 }; save();
    }
    const g = pos.g, pool = pos.pool;
    if (!pos.qi) await C.say('משחק! ' + pool.length + ' סיבובים, ' + GAME_SECONDS + ' שניות לכל שאלה ושלושה לבבות. תשובה נכונה שווה 10 נקודות, ועל רצף יש בונוס. בהצלחה!');
    for (let i = pos.qi || 0; i < pool.length; i++) {
      if (!alive(f)) return null;
      const pts = () => 10 + Math.max(0, g.streak) * 5;
      const r = await askMCQ({ kicker: kick(c, u, 'משחק'), hud: hudHTML(g, i, pool.length), q: pool[i].q, o: pool[i].o, e: pool[i].e, time: GAME_SECONDS, pts, label: 'משחק' });
      if (!alive(f)) return null;
      if (r.ok) { const p = pts(); g.streak++; g.best = Math.max(g.best, g.streak); g.xp += p; g.right++; addXP(p); }
      else { g.streak = 0; g.hearts--; }
      pos.qi = i + 1; save();
      if (g.hearts <= 0) break;
      await sleep(650);
    }
    const won = g.hearts > 0 && g.right >= Math.ceil(pool.length * .6);
    const row = C.card('<div class="lx-card lx-result ' + (won ? 'win' : '') + '">' + kick(c, u, 'סוף המשחק') +
      '<div class="lx-score"><b>' + g.xp + '<small> XP</small></b><span>' + g.right + ' מתוך ' + pool.length + ' נכונות · רצף שיא ' + g.best + ' · ' + g.hearts + ' לבבות</span></div></div>');
    C.persist(row, '[משחק ביחידה ' + u + ': ' + g.right + ' מתוך ' + pool.length + ', ' + g.xp + ' XP]');
    return won;
  }

  /* open question, graded by the local model (or by key points when it is off) */
  function heuristic(U, ans) {
    const a = ans.toLowerCase();
    const covered = U.open.kw.map((grp) => grp.some((w) => a.includes(w.toLowerCase())));
    const n = covered.filter(Boolean).length;
    let score = Math.round((n / covered.length) * 10);
    if (ans.trim().length < 15) score = Math.min(score, 3);
    else score = Math.max(score, 2);
    return { score, covered };
  }
  async function grade(U, ans) {
    const h = heuristic(U, ans);
    if (!canLLM()) return { score: h.score, covered: h.covered, text: '', mode: 'keys' };
    const th = C.thinking('שחר קורא את התשובה…');
    let text = '';
    try {
      text = await teach('שאלה: ' + U.open.q + '\nנקודות שתשובה טובה כוללת:\n- ' + U.open.key.join('\n- ') + '\n\nתשובת הסטודנט: "' + ans + '"\n\n' +
        'הערך את התשובה בהגינות ובעידוד. השורה הראשונה תהיה בדיוק בפורמט "ציון: X/10". אחריה כתוב 2 עד 3 משפטים: מה טוב בתשובה, ומה כדאי להוסיף או לדייק. כתוב בלשון ניטרלית: בלי "אתה" או "את" ובלי פעלים בזכר או בנקבה, למשל "התשובה מסבירה יפה…", "כדאי להוסיף…".', 260);
    } catch { /* use the key points */ }
    th.remove();
    const m = text.match(/ציון\s*[:：]?\s*(\d{1,2})\s*(?:\/|מתוך)\s*10/) || text.match(/(\d{1,2})\s*\/\s*10/);
    const score = m ? Math.max(0, Math.min(10, +m[1])) : h.score;
    const fb = text.replace(/^.*ציון.*$/m, '').replace(/^\s+|\s+$/g, '');
    return { score, covered: h.covered, text: fb, mode: m ? 'llm' : 'keys' };
  }
  async function openQ(id, u, f) {
    const c = byId(id), s = cs(id), U = c.units[u - 1];
    const row = C.card('<div class="lx-card lx-open">' + kick(c, u, 'שאלה פתוחה') + '<h3 class="lx-qt">' + rich(U.open.q) + '</h3><p class="lx-hint">' + icon('pen') + 'כתבו את התשובה בתיבת ההודעה למטה. אין תשובה אחת נכונה.</p></div>');
    C.persist(row, '[שאלה פתוחה: ' + U.open.q + ']');
    const ans = await C.waitText('התשובה שלך…');
    if (!alive(f) || ans == null) return null;
    const g = await grade(U, ans);
    if (!alive(f)) return null;
    addXP(g.score * 2);
    const res = C.card('<div class="lx-card lx-feedback">' + kick(c, u, 'משוב') +
      '<div class="lx-score"><b>' + g.score + '<small>/10</small></b><span>' + (g.score >= 8 ? 'תשובה מצוינת' : g.score >= 6 ? 'תשובה טובה' : g.score >= 4 ? 'בכיוון הנכון' : 'כדאי להרחיב') + '</span></div>' +
      (g.text ? '<p class="lx-body">' + rich(g.text) + '</p>' : '') +
      '<p class="lx-sub">' + (g.mode === 'llm' ? 'מה כדאי שיופיע בתשובה:' : 'מה כדאי שיופיע בתשובה (סימנתי את מה שזיהיתי אצלך):') + '</p>' +
      '<ul class="lx-keys">' + U.open.key.map((k, i) => '<li class="' + (g.mode === 'keys' && g.covered[i] ? 'hit' : '') + '">' + icon(g.mode === 'keys' && g.covered[i] ? 'check' : 'sparkle') + '<span>' + rich(k) + '</span></li>').join('') + '</ul></div>');
    C.persist(res, '[משוב לשאלה הפתוחה: ' + g.score + '/10. ' + (g.text || '') + ']');
    s.pos.open = g.score; save();
    return g.score >= 6;
  }
  async function mixed(id, u, f) {
    const c = byId(id), s = cs(id), U = c.units[u - 1];
    if (s.pos.phase === 'practice') {
      const r = await mcqs(id, u, f, U.mcq.slice(0, 2));
      if (r == null || !alive(f)) return null;
      s.pos.phase = 'open'; s.pos.mcq = s.pos.score; save();
      await C.say('ועכשיו שאלה אחת במילים שלך.');
      if (!alive(f)) return null;
    }
    const o = await openQ(id, u, f);
    if (o == null) return null;
    return (s.pos.mcq || 0) >= 1 && (s.pos.open || 0) >= 5;
  }

  async function unitEnd(id, u, passed, f) {
    const c = byId(id), s = cs(id);
    if (passed) {
      if (!s.done.includes(u)) s.done.push(u);
      s.pos = null; addXP(20);
      const nu = nextUnit(s);
      s.unit = nu || u; if (!nu) s.finished = true;
      save(); chips();
      if (s.finished) return finished(id, f);
      const row = C.card('<div class="lx-card lx-result win">' + kick(c, u, 'הושלמה') + '<div class="lx-score"><b>' + icon('check') + '</b><span>יחידה ' + u + ' הושלמה. ' + s.done.length + ' מתוך 5 בקורס.</span></div>' + mapHTML(c, s, nu) +
        '<div class="lx-actions"><button class="lx-btn" type="button" data-next>' + icon('play') + 'ליחידה ' + nu + '</button><button class="lx-ghost" type="button" data-pause>הפסקה, נמשיך אחר כך</button></div></div>');
      const k = await new Promise((res) => row.addEventListener('click', (e) => { const b = e.target.closest('[data-next],[data-pause]'); if (b && !b.disabled) { lock(row, b); res(b.hasAttribute('data-next')); } }));
      if (!alive(f)) return;
      C.persist(row, '[יחידה ' + u + ' הושלמה]');
      if (k) return runUnit(id, f);
      return C.say('מעולה. כשתחזרו, כפתור "המשך" יחכה כאן, ונמשיך בדיוק מיחידה ' + nu + '.');
    }
    const row = C.card('<div class="lx-card lx-result">' + kick(c, u, 'כמעט') + '<p class="lx-body">כמעט! כדאי לחזק את היחידה הזו לפני שממשיכים.</p>' +
      '<div class="lx-actions"><button class="lx-btn" type="button" data-a="lesson">' + icon('book') + 'לחזור על השיעור</button><button class="lx-ghost" type="button" data-a="retry">' + icon('refresh') + 'לנסות שוב</button><button class="lx-ghost" type="button" data-a="skip">להמשיך בכל זאת</button></div></div>');
    const a = await new Promise((res) => row.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) { lock(row, b); res(b.dataset.a); } }));
    if (!alive(f)) return;
    C.persist(row, '[יחידה ' + u + ' לא עברה: ' + a + ']');
    if (a === 'lesson') s.pos = { unit: u, phase: 'lesson' };
    else if (a === 'retry') s.pos = { unit: u, phase: 'practice', qi: 0, score: 0 };
    else {
      s.pos = null;
      let nu = 0; for (let k = u + 1; k <= 5; k++) if (!s.done.includes(k)) { nu = k; break; }
      s.unit = nu || u;
      if (!nu) { save(); await C.say('זו היחידה האחרונה שנשארה. כדאי לנסות אותה שוב כשמתאים.'); return; }
    }
    save();
    return runUnit(id, f);
  }

  async function finished(id, f) {
    const c = byId(id), s = cs(id);
    const row = C.card('<div class="lx-card lx-result win lx-done-course">' + kick(c, 0, 'סיום') +
      '<div class="lx-score"><b>' + icon('trophy') + '</b><span>סיימת את ' + esc(c.title) + '! ' + (L.xp || 0) + ' XP בסך הכל.</span></div>' + mapHTML(c, s, 0) +
      '<div class="lx-actions"><button class="lx-btn" type="button" data-more>' + icon('book') + 'קורס נוסף</button><button class="lx-ghost" type="button" data-review>' + icon('refresh') + 'חזרה על הקורס מההתחלה</button></div></div>');
    const k = await new Promise((res) => row.addEventListener('click', (e) => { const b = e.target.closest('[data-more],[data-review]'); if (b && !b.disabled) { lock(row, b); res(b.hasAttribute('data-more')); } }));
    if (!alive(f)) return;
    C.persist(row, '[סיים את הקורס ' + c.title + ']');
    if (k) return openCourses();
    s.finished = false; s.done = []; s.known = []; s.unit = 1; s.pos = null; save();
    return runUnit(id, f);
  }

  /* ---------- resume ---------- */
  function resumeLine(id) {
    const c = byId(id), s = cs(id);
    if (!s.placed) return 'מבחן הרמה · שאלה ' + (s.pAns.length + 1) + ' מתוך 5';
    const u = s.unit || nextUnit(s);
    const ph = s.pos && s.pos.unit === u ? (s.pos.phase === 'lesson' ? 'שיעור' : 'תרגול') : 'שיעור';
    return 'יחידה ' + u + ' מתוך 5 · ' + c.units[u - 1].t + ' · ' + ph;
  }
  const activeOpen = () => L.active && byId(L.active) && !cs(L.active).finished && (cs(L.active).placed || cs(L.active).pAns.length);
  function resume() { if (activeOpen()) go(L.active); else openCourses(); }
  function resumeCard() {
    const c = byId(L.active);
    const row = C.card('<div class="lx-card lx-resume">' + kick(c, 0, 'נעצרת כאן') + '<p class="lx-body">' + esc(resumeLine(L.active)) + '</p>' +
      '<div class="lx-actions"><button class="lx-btn" type="button" data-r>' + icon('play') + 'המשך</button><button class="lx-ghost" type="button" data-o>' + icon('book') + 'כל הקורסים</button></div></div>');
    row.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r],[data-o]');
      if (!b) return;
      const r = b.hasAttribute('data-r');
      row.remove(); C.dropLive();
      if (r) go(L.active); else openCourses();
    });
  }

  /* ---------- the quick bar inside the composer ---------- */
  let bar = null;
  function chips() {
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'lx-chips'; bar.setAttribute('data-chips', '');
      C.form.insertBefore(bar, C.form.firstChild);
      bar.addEventListener('click', (e) => {
        const b = e.target.closest('[data-c]');
        if (!b) return;
        const k = b.dataset.c;
        if (k === 'courses') openCourses();
        if (k === 'resume') resume();
        if (k === 'style' && L.active) pickStyle(L.active);
        if (k === 'memory') A.openPanel();
        if (k === 'cancel') { C.cancelWait(); toast('בוטל. אפשר להמשיך מהכפתור "המשך".', 'info'); }
      });
      document.addEventListener('shachar:wait', (e) => { const x = $('[data-c="cancel"]', bar); if (x) x.hidden = !e.detail; });
    }
    const act = activeOpen() ? byId(L.active) : null;
    const st = act && cs(act.id).style;
    bar.innerHTML =
      '<button type="button" data-c="courses">' + icon('book') + '<span>קורסים</span></button>' +
      (act ? '<button type="button" data-c="resume" class="hot">' + icon('play') + '<span>המשך · ' + esc(act.short) + '</span></button>' : '') +
      (act && cs(act.id).placed ? '<button type="button" data-c="style">' + icon(st ? STYLES[st].i : 'sparkle') + '<span>סגנון' + (st ? ': ' + STYLES[st].t : '') + '</span></button>' : '') +
      '<button type="button" data-c="memory">' + icon('brain') + '<span>הזיכרון שלי</span></button>' +
      '<button type="button" data-c="cancel" class="cancel"' + (C.waiting ? '' : ' hidden') + '>' + icon('x') + '<span>ביטול</span></button>';
  }

  /* ---------- the empty chat: greet and offer learning ---------- */
  function hello(h) {
    const p = $('p', h);
    const act = activeOpen() ? byId(L.active) : null;
    const box = document.createElement('div');
    box.className = 'hello-learn';
    box.innerHTML = (act ? '<button type="button" class="hl hot" data-h="resume">' + icon('play') + '<span><b>להמשיך: ' + esc(act.title) + '</b><small>' + esc(resumeLine(act.id)) + '</small></span></button>' : '') +
      '<button type="button" class="hl" data-h="courses">' + icon('cap') + '<span><b>' + (act ? 'כל הקורסים' : 'ללמוד עם שחר') + '</b><small>' + (act ? 'סטטיסטיקה, כתיבה אקדמית ואנגלית' : 'מבחן רמה קצר, ואז לומדים בסגנון שלך') + '</small></span></button>';
    p.after(box);
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-h]'); if (!b) return; if (b.dataset.h === 'resume') resume(); else openCourses(); });
  }

  /* ---------- boot ---------- */
  chips();
  const h = C.hello();
  if (h) hello(h);
  else if (activeOpen()) resumeCard();
  hydrateIcons();
  S.learn = { openCourses, resume, go };
})();
