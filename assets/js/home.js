/* Home page: product-window demo, carousels, integration map, memory, team. */
(function () {
  'use strict';
  const { $, $$, esc, sleep, icon, hydrateIcons, toast, reduced, kb, local } = window.Shachar;

  const PEOPLE = {
    shachar: { name: 'שחר', av: 'assets/img/owl-face.webp', bot: true },
    noa: { name: 'נועה', av: 'assets/img/av-noa.webp' },
    yossi: { name: 'יוסי', av: 'assets/img/av-yossi.webp' },
    rina: { name: 'רינה', av: 'assets/img/av-rina.webp' },
    daniel: { name: 'דניאל', av: 'assets/img/av-daniel.webp' },
    maya: { name: 'מאיה', av: 'assets/img/av-maya.webp' },
    tamar: { name: 'תמר', av: 'assets/img/av-tamar.webp' },
    me: { name: 'אני', av: null },
  };
  const M = (s) => s.replace(/@([֐-׿\w-]+)/g, '<span class="mention">@$1</span>').replace(/#([֐-׿\w-]{2,}[֐-׿\w])/g, '<span class="chan-ref">#$1</span>');

  function msgHTML(m) {
    const p = PEOPLE[m.who] || PEOPLE.me;
    const av = p.av ? '<img src="' + p.av + '" alt="">' : icon('user');
    const body = (m.html ? m.html : (Array.isArray(m.text) ? m.text : [m.text]).map((t) => '<p>' + M(esc(t)) + '</p>').join(''));
    return '<div class="msg"><span class="av' + (p.bot ? ' bot' : '') + '"' + (p.av ? '' : ' style="display:grid;place-items:center;color:#667"') + '>' + av + '</span><div style="min-width:0"><div class="who"><b>' + esc(p.name) + '</b>' + (p.bot ? '<span class="app-tag">AI</span>' : '') + '<time>' + esc(m.t || '') + '</time></div>' + body + (m.extra || '') + '</div></div>';
  }

  /* ---------------- scripted conversations ---------------- */
  const alertCard =
    '<div class="attach"><div class="attach-head"><span>התראות בעדיפות גבוהה · ריצת הלילה</span><span>3 מתוך 6</span></div>' +
    '<div class="attach-row"><span class="risk">82</span><span><b>סטודנטית #4127</b> · חינוך · שנה א\'<div class="chips" style="margin-top:3px"><span class="chip">נוכחות 54%</span><span class="chip">3 מטלות פתוחות</span><span class="chip">פיגור 45 יום</span></div></span><span class="chip">↑27</span></div>' +
    '<div class="attach-row"><span class="risk mid">76</span><span><b>סטודנט #3380</b> · מדעים · שנה א\'<div class="chips" style="margin-top:3px"><span class="chip">ירידה בכניסות ל-Moodle</span><span class="chip">ציון 52 בבוחן</span></div></span><span class="chip">↑18</span></div>' +
    '<div class="attach-row"><span class="risk low">71</span><span><b>סטודנטית #5012</b> · פסיכולוגיה · שנה א\'<div class="chips" style="margin-top:3px"><span class="chip">4 פניות בשבוע</span><span class="chip">נוכחות 68%</span></div></span><span class="chip">↑12</span></div></div>';
  const factors =
    '<div class="attach"><div class="attach-head"><span>שלושת הגורמים לציון 82</span><span>8 שבועות</span></div>' +
    '<div class="attach-row"><span class="chip">42%</span><span>ירידה בנוכחות בקורסי חובה</span><span></span></div>' +
    '<div class="attach-row"><span class="chip">33%</span><span>3 מטלות שלא הוגשו ב-Moodle</span><span></span></div>' +
    '<div class="attach-row"><span class="chip">25%</span><span>פיגור תשלום של 45 יום</span><span></span></div></div>';
  const src = (t) => '<span class="src">' + icon('book') + esc(t) + '</span>';
  const statusCard =
    '<div class="attach"><div class="attach-head"><span>תמונת מצב לפורום · רבעון 3</span><span>יעד 2028</span></div>' +
    '<div class="attach-row"><span class="chip">1.58 → 3.35</span><span>בשלות Data &amp; AI (ממוצע משוקלל)</span><span></span></div>' +
    '<div class="attach-row"><span class="chip">3 מתוך 5</span><span>מערכות ליבה מחוברות: מכלול, Moodle, Priority</span><span></span></div>' +
    '<div class="attach-row"><span class="chip">12 מתוך 15</span><span>מדדי ליבה שאושרו במילון המונחים</span><span></span></div>' +
    '<div class="attach-row"><span class="chip">87%</span><span>התראות שטופלו בתוך 72 שעות (יעד 85%)</span><span></span></div></div>';

  const SCENES = [
    { ch: 'מנהל-אקדמי', members: 12, day: 'היום', msgs: [
      { who: 'shachar', t: '07:10', text: 'בוקר טוב. ריצת הלילה הסתיימה: 2,198 סטודנטים נסרקו ונפתחו 6 התראות חדשות. שלוש בעדיפות גבוהה, כולן בשנה א\'.', extra: alertCard },
      { who: 'yossi', t: '07:42', text: '@שחר תשייך את שלוש הדחופות לרכזות הפקולטות, ותעדכן אותי עד הצהריים.' },
      { who: 'shachar', t: '07:42', text: 'שויכו: שתיים לנועה (חינוך), אחת לרינה בדיקנאט. כל אחת קיבלה את שלושת הגורמים ואת המענה המומלץ. אעדכן כאן ב-12:00.' },
      { who: 'noa', t: '08:05', text: 'קיבלתי. את #4127 אני מזמינה לשיחה כבר מחר.' },
    ] },
    { ch: 'רכזות-חינוך', members: 7, day: 'יום שלישי', msgs: [
      { who: 'noa', t: '08:45', text: '@שחר מה קרה עם #4127? בסמסטר שעבר היא הייתה בסדר גמור.' },
      { who: 'shachar', t: '08:45', text: 'הציון שלה עלה מ-38 ל-82 בתוך שבועיים ועבר את סף ההתראה (70). אלה הגורמים:', extra: factors },
      { who: 'shachar', t: '08:46', text: 'מענה מומלץ: חונכות אישית, שיחה בדיקנאט לבדיקת חסמים, ובדיקת פריסת תשלומים. להכין זימון לשיחת ייעוץ למחר בבוקר?', extra: '<div class="acts"><span class="go">שליחת זימון</span><span>הקצאה לרכזת</span></div>' },
      { who: 'noa', t: '08:51', text: 'כן, ל-10:00. ותעדכן את @רינה.' },
      { who: 'shachar', t: '08:51', text: 'הזימון נשלח, ורינה בתמונה. אם לא תתועד שיחה, אזכיר כאן בעוד 72 שעות.' },
    ] },
    { ch: 'שחר', dm: true, members: 2, day: 'הלילה', msgs: [
      { who: 'maya', t: '02:14', text: 'נכשלתי במבחן בסטטיסטיקה 😕 מה האפשרויות שלי עכשיו?' },
      { who: 'shachar', t: '02:14', text: 'זה קורה, ויש מה לעשות. הזכאות למועד נוסף, לבחינה חוזרת או ללימוד חוזר של הקורס נקבעת בתקנון הלימודים, ואת הפרטים המדויקים כדאי לבדוק מול רכזת הפקולטה. כבר עכשיו אפשר לבקש שיעורי עזר או חונכות דרך דיקנאט הסטודנטים.', extra: src('אחרי כישלון בקורס · בתוקף עד 30.09.2027') },
      { who: 'maya', t: '02:16', text: 'ואם אני במילואים בשבוע של המועד?' },
      { who: 'shachar', t: '02:16', text: 'סטודנטים ששירתו במילואים זכאים להתאמות, למשל מועדי בחינה מיוחדים והארכות להגשת עבודות. פותחים בקשה מול הרכזת עם אישור השירות. לפתוח לך את הפנייה עכשיו?', extra: src('סטודנטים במילואים · בתוקף עד 30.09.2027') },
      { who: 'maya', t: '02:17', text: 'כן בבקשה 🙏' },
      { who: 'shachar', t: '02:17', text: 'הפנייה נפתחה ועברה לרכזת הפקולטה. בדרך כלל עונים בתוך 24 שעות. לילה טוב, ובהצלחה!' },
    ] },
    { ch: 'פורום-משילות', members: 9, day: 'יום רביעי', msgs: [
      { who: 'daniel', t: '15:20', text: '@שחר צריך תמונת מצב לפורום המשילות של מחר.' },
      { who: 'shachar', t: '15:20', text: 'הנה מה שאספתי מהדשבורדים ומיומן ההתראות:', extra: statusCard },
      { who: 'rina', t: '15:24', text: 'תוסיף גם את שיעור הפניות שנענו אוטומטית.' },
      { who: 'shachar', t: '15:24', text: '24% מהפניות הרוטיניות נענו החודש אוטומטית, מעל יעד המינימום (20%). עדכנתי את המצגת ושיתפתי אותה כאן.' },
    ] },
  ];

  /* ---------------- product window ---------------- */
  function demo() {
    const root = $('#demo');
    if (!root) return;
    const log = $('[data-log]', root), tabs = $$('.tab', root), ind = $('.tab-ind', root);
    const title = $('[data-chan-title]', root), members = $('[data-members]', root), side = $('[data-side]', root);
    const form = $('[data-form]', root), input = $('[data-input]', root), composer = $('[data-composer]', root);
    let cur = -1, token = 0, timer = null, live = false, progT = null;

    function placeInd() {
      const t = tabs[Math.max(cur, 0)];
      if (!t || !ind) return;
      const r = t.getBoundingClientRect(), pr = t.parentElement.getBoundingClientRect();
      ind.style.width = r.width + 'px';
      ind.style.insetInlineStart = (pr.right - r.right) + 'px';
    }
    addEventListener('resize', placeInd, { passive: true });

    function setChannel(sc) {
      title.innerHTML = sc.dm ? '<span class="av" style="width:20px;height:20px;border-radius:5px;overflow:hidden;display:inline-block;vertical-align:-4px;margin-inline-end:6px"><img src="assets/img/owl-face.webp" alt="" style="width:100%;height:100%"></span>שחר' : '# ' + esc(sc.ch);
      members.textContent = sc.members;
      $$('.it[data-ch]', side).forEach((it) => it.classList.toggle('on', it.dataset.ch === sc.ch));
      input.placeholder = sc.dm ? 'הודעה לשחר…' : 'הודעה ל-#' + sc.ch + '… (נסו לתייג את @שחר)';
    }
    function scrollEnd() { log.scrollTop = log.scrollHeight; }
    function append(html) { const d = document.createElement('div'); d.innerHTML = html; const el = d.firstChild; log.appendChild(el); scrollEnd(); return el; }
    function typing(who) {
      return append('<div class="msg" data-typing><span class="av bot"><img src="' + PEOPLE[who].av + '" alt=""></span><div><div class="who"><b>' + esc(PEOPLE[who].name) + '</b>' + (PEOPLE[who].bot ? '<span class="app-tag">AI</span>' : '') + '</div><span class="typing"><i></i><i></i><i></i></span></div></div>');
    }

    async function play(i, opts) {
      const my = ++token;
      cur = i; live = false;
      tabs.forEach((t, k) => t.setAttribute('aria-selected', String(k === i)));
      placeInd();
      // phone: tabs are a scrolling row, keep the active one in view without moving the page
      const bar = tabs[i].parentElement;
      if (bar.scrollWidth > bar.clientWidth + 2) {
        const tr = tabs[i].getBoundingClientRect(), br = bar.getBoundingClientRect();
        bar.scrollBy({ left: (tr.left + tr.width / 2) - (br.left + br.width / 2), behavior: reduced() ? 'auto' : 'smooth' });
      }
      ind && ind.style.setProperty('--p', 0);
      const sc = SCENES[i];
      setChannel(sc);
      log.innerHTML = '<div class="spacer"></div><div class="chan-day"><span>' + esc(sc.day) + '</span></div>';
      const instant = (opts && opts.instant) || reduced();
      for (const m of sc.msgs) {
        if (my !== token) return;
        if (!instant) {
          const isBot = PEOPLE[m.who].bot;
          if (isBot) { const ty = typing(m.who); await sleep(900 + Math.min(1400, (m.text || '').length * 9)); ty.remove(); }
          else await sleep(650);
          if (my !== token) return;
        }
        append(msgHTML(m));
        if (!instant) await sleep(500);
      }
      if (my !== token) return;
      // progress then auto-advance
      clearInterval(progT);
      const t0 = performance.now(), dur = 6500;
      progT = setInterval(() => {
        if (my !== token || live) { clearInterval(progT); return; }
        const p = Math.min(1, (performance.now() - t0) / dur);
        ind && ind.style.setProperty('--p', p);
        if (p >= 1) { clearInterval(progT); if (inView) play((cur + 1) % SCENES.length); }
      }, 60);
    }

    tabs.forEach((t, k) => t.addEventListener('click', () => { clearInterval(progT); play(k); }));
    tabs.forEach((t, k) => t.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const n = (k + (e.key === 'ArrowLeft' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[n].focus(); tabs[n].click();
      }
    }));

    // live composer → local model
    input.addEventListener('input', () => composer.classList.toggle('has-text', !!input.value.trim()));
    input.addEventListener('focus', () => { live = true; clearInterval(progT); token++; });
    let busy = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q || busy) return;
      busy = true; live = true; token++;
      input.value = ''; composer.classList.remove('has-text');
      const now = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
      append(msgHTML({ who: 'me', t: now, text: q }));
      const ty = typing('shachar');
      const tyText = $('.typing', ty);
      try {
        const res = await kb.answer(q.replace(/@שחר/g, '').trim(), { onTick: (s) => { if (s > 3 && tyText) tyText.setAttribute('title', 'המודל המקומי חושב… ' + Math.round(s) + ' שנ׳'); } });
        ty.remove();
        const srcs = (res.hits || []).slice(0, 2).map((h) => src(h.doc.title + ' · ' + h.h)).join(' ');
        const modeTag = res.mode === 'llm' ? '<span class="src" style="border-color:rgba(12,163,12,.3)">' + icon('cpu') + 'נענה במודל המקומי · Qwen3-VL 4B</span>'
          : res.mode === 'extract' ? '<span class="src">' + icon('book') + 'ציטוט מהמקור (המודל המקומי לא מחובר כרגע)</span>' : '';
        append(msgHTML({ who: 'shachar', t: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }), text: res.text, extra: '<div class="chips" style="gap:6px;margin-top:2px">' + srcs + modeTag + '</div>' }));
      } catch (err) {
        ty.remove();
        append(msgHTML({ who: 'shachar', t: '', text: 'משהו השתבש בחיבור למודל המקומי (' + err.message + '). נסו שוב, או פתחו את "שאלו את שחר".' }));
      } finally { busy = false; }
    });

    let inView = true, started = false;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((en) => {
        inView = en[0].isIntersecting;
        if (inView && !started) { started = true; play(0); }
      }, { threshold: .25 }).observe(root);
    } else { started = true; play(0); }
    requestAnimationFrame(placeInd);
  }

  /* ---------------- integration constellation ---------------- */
  const SYS = [
    { n: 'מכלול', i: 'cap', c: '#2b5cff', hot: true }, { n: 'Moodle', i: 'book', c: '#f98012', hot: true }, { n: 'Priority', i: 'card', c: '#0e7c66', hot: true },
    { n: 'קומבוקס', i: 'whatsapp', c: '#25a35a' }, { n: 'מידע אישי', i: 'user', c: '#6b4ce6' }, { n: 'Microsoft 365', i: 'cloud', c: '#0a64c8' },
  ];
  const MISC = ['calendar', 'mail', 'phone', 'chart', 'pie', 'folder', 'file', 'globe', 'library', 'db', 'shield', 'users', 'clock', 'inbox', 'key', 'flag', 'target', 'route', 'star', 'log', 'gauge', 'video', 'mic', 'hand'];
  const MISC_C = ['#e0703f', '#0a64c8', '#2b5cff', '#8a5cf6', '#d03b3b', '#0e7c66', '#555', '#1f9bd1', '#c98a00', '#6b4ce6', '#25a35a', '#ff5d8f'];
  function constellation() {
    const host = $('[data-constel]');
    if (!host) return;
    const W = 560, H = 520, cx = 280, cy = 330; // antenna tip of the owl roughly here
    const hot = [[150, 168], [280, 120], [404, 172]];
    const ring = [];
    // arc-ish cloud of points above the owl
    let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let r = 0; r < 4; r++) {
      const rad = 150 + r * 52, count = 7 + r * 3;
      for (let k = 0; k < count; k++) {
        const a = Math.PI * (0.06 + 0.88 * (k + .5) / count) + (rnd() - .5) * .08;
        const x = cx - Math.cos(a) * rad * 1.08, y = cy - 40 - Math.sin(a) * rad * .92;
        if (y > 300 && Math.abs(x - cx) < 170) continue;
        if (hot.some(([hx, hy]) => Math.hypot(hx - x, hy - y) < 56)) continue;
        ring.push([x, y, r]);
      }
    }
    const svg = $('svg.links', host);
    let paths = '';
    hot.forEach(([x, y]) => { paths += '<path d="M' + x + ' ' + (y + 26) + ' Q ' + ((x + cx) / 2) + ' ' + (y + 120) + ' ' + cx + ' ' + (cy - 92) + '"/>'; });
    svg.innerHTML = paths;
    const frag = document.createDocumentFragment();
    hot.forEach(([x, y], k) => {
      const s = SYS[k];
      const d = document.createElement('span');
      d.className = 'node hot';
      d.style.cssText = 'left:' + (x / W * 100) + '%;top:' + (y / H * 100) + '%;--c:' + s.c + ';--d:' + (k * .7) + 's';
      d.innerHTML = icon(s.i) + '<span class="lbl">' + esc(s.n) + '</span>';
      frag.appendChild(d);
    });
    ring.forEach(([x, y, r], k) => {
      const d = document.createElement('span');
      const isSys = k % 9 === 2 && SYS[3 + (k % 3)];
      const s = isSys ? SYS[3 + (k % 3)] : null;
      d.className = 'node';
      const size = r === 0 ? 34 : r === 1 ? 30 : r === 2 ? 26 : 22;
      d.style.cssText = 'left:' + (x / W * 100) + '%;top:' + (y / H * 100) + '%;--s:' + size + 'px;--c:' + (s ? s.c : MISC_C[k % MISC_C.length]) + ';--d:' + ((k % 7) * .45) + 's;opacity:' + (1 - r * .14);
      d.innerHTML = icon(s ? s.i : MISC[k % MISC.length]);
      if (s) d.title = s.n;
      frag.appendChild(d);
    });
    host.appendChild(frag);
  }

  /* ---------------- stacked coworker cards ---------------- */
  const CARDS = [
    { ch: 'רכזות-חינוך', msgs: [
      { who: 'shachar', t: '07:12', text: 'סיכום בוקר: ריצת הלילה הסתיימה ב-05:40, ונפתחו 3 התראות חדשות בשנה א\'. שתיים כבר שויכו.' },
      { who: 'noa', t: '07:20', text: 'עם #4127 דיברתי אתמול. היא מתחילה חונכות ביום ראשון.' },
      { who: 'yossi', t: '07:24', text: 'רגע, בואו נוודא שגם הדיקנאט בתמונה לפני שסוגרים.' },
      { who: 'shachar', t: '07:24', text: 'צודק. אשאיר את ההתראה פתוחה עד שרינה תתעד את השיחה, ואעדכן כאן כשזה קורה.' },
    ] },
    { ch: 'דיקנאט', msgs: [
      { who: 'rina', t: '13:30', text: '@שחר חזרתי מחופשה. איפה עומד הטיפול בסטודנט מהפקולטה למדעים?' },
      { who: 'shachar', t: '13:30', text: 'נועה פתחה אותו ביום שלישי: פיגור תשלום של 60 יום ושתי מטלות פתוחות. היא צירפה את @דניאל לבדיקת נתוני הגבייה.' },
      { who: 'daniel', t: '13:32', text: 'נתוני הגבייה עודכנו הבוקר, הפיגור כבר הוסדר.' },
      { who: 'shachar', t: '13:33', text: 'אז אפשר להתקדם. הכנתי טיוטת זימון לשיחה עם הסטודנט. לשלוח אחרי שתעברי עליה?' },
    ] },
    { ch: 'שירות-סטודנטים', msgs: [
      { who: 'daniel', t: '09:02', text: 'יש עומס פניות בוואטסאפ הבוקר. קרה משהו?' },
      { who: 'shachar', t: '09:02', text: 'אתמול פורסם מועד ב\' בסטטיסטיקה, ו-64% מהפניות עוסקות בו. הכנתי תשובה מתוך התקנון עם הפניה למקור.' },
      { who: 'noa', t: '09:05', text: 'עברתי עליה, מאושרת.' },
      { who: 'shachar', t: '09:05', text: 'פורסמה. מעכשיו הפניות האלה נענות אוטומטית, ובקשות חריגות עוברות אלייך.' },
    ] },
    { ch: 'סגל-חדש', msgs: [
      { who: 'tamar', t: '10:15', text: 'יום ראשון שלי 👋 איפה מוצאים את מילון המונחים, ומי אחראי על דשבורד ההתמדה?' },
      { who: 'shachar', t: '10:15', text: 'המילון נמצא בקטלוג הנתונים (מוצמד ב-#פורום-משילות). את דשבורד ההתמדה מתחזק @דניאל, והוא מתעדכן בכל יום ראשון.' },
      { who: 'daniel', t: '10:17', text: 'ברוכה הבאה! אוסיף אותך להרשאות של הפקולטה.' },
      { who: 'shachar', t: '10:17', text: 'נוסף. שיתפתי איתך גם את נוהל ההתראות ואת יעד ה-72 שעות, כדי שתתחילי מאותו מקום כמו כולן.' },
    ] },
  ];
  function stack() {
    const host = $('[data-stack]');
    if (!host) return;
    const dots = $('[data-dots]', host);
    const els = CARDS.map((c, k) => {
      const el = document.createElement('article');
      el.className = 'card-chat';
      el.innerHTML = '<div class="cc-head"><span>#</span>' + esc(c.ch) + '</div><div class="cc-body">' + c.msgs.map(msgHTML).join('') + '</div>';
      host.insertBefore(el, host.firstChild);
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('aria-label', 'שיחה ' + (k + 1)); b.innerHTML = '<i></i>';
      b.addEventListener('click', () => go(k));
      dots.appendChild(b);
      return el;
    });
    let cur = 0, t = null;
    function layout() {
      els.forEach((el, k) => {
        const d = (k - cur + els.length) % els.length;
        el.style.zIndex = String(10 - d);
        el.style.transform = d === 0 ? 'none' : 'translateY(' + (-d * 15) + 'px) scale(' + (1 - d * .04) + ')';
        el.style.opacity = d > 3 ? '0' : '1';
        el.style.filter = d ? 'brightness(' + (1 - d * .02) + ')' : 'none';
        el.setAttribute('aria-hidden', String(d !== 0));
        el.querySelector('.cc-body').style.visibility = d > 0 ? 'hidden' : 'visible';
      });
      $$('button', dots).forEach((b, k) => b.setAttribute('aria-current', String(k === cur)));
    }
    function go(k) { cur = (k + els.length) % els.length; layout(); restart(); }
    function restart() { clearInterval(t); if (!reduced()) t = setInterval(() => go(cur + 1), 7000); }
    $('[data-prev]', host.parentElement).addEventListener('click', () => go(cur - 1));
    $('[data-next]', host.parentElement).addEventListener('click', () => go(cur + 1));
    layout(); restart();
  }

  /* ---------------- memory pills ---------------- */
  const MEMS = [
    ['העדפה', 'שלוש שורות, ואז שורה תחתונה'],
    ['מונח', '"סטודנט פעיל" = רשום בסמסטר הנוכחי'],
    ['עדיפות', 'שנה א\' בחינוך קודם'],
    ['צירוף', 'פיגור בגבייה ← לצרף את הכספים'],
    ['מקור', 'התקנון בתוקף עד 30.09.2027'],
    ['תיקון', '"נשירה" נמדדת עד סוף שנה א\''],
  ];
  function memory() {
    const list = $('[data-mem-list]');
    if (!list) return;
    let i = 0;
    function render() {
      const items = [0, 1, 2, 3].map((k) => MEMS[(i + k) % MEMS.length]);
      list.innerHTML = items.map(([a, b], k) => '<div class="mem' + (k === 0 ? ' fresh' : '') + (k === 3 ? ' ghost' : '') + '"><small>' + esc(a) + '</small><i></i><span>' + esc(b) + '</span></div>').join('');
      const first = list.firstChild;
      if (first && !reduced()) first.animate([{ opacity: 0, transform: 'translateY(-14px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
    render();
    if (!reduced()) setInterval(() => { i = (i - 1 + MEMS.length) % MEMS.length; render(); }, 3200);
  }

  /* ---------------- team carousel ---------------- */
  const TEAM = [
    { name: 'דרור', handle: '@דרור', role: 'מוקד שירות 24/7', img: 'assets/img/mate-dror.webp', tools: [['קומבוקס', 'whatsapp', '#25a35a'], ['תקנונים', 'book', '#f98012'], ['Microsoft 365', 'cloud', '#0a64c8']], ch: 'שירות-סטודנטים',
      chat: [{ who: 'noa', t: '10:24', text: '@שחר אני רוצה עמית שעונה לסטודנטים בוואטסאפ גם בלילה, רק מתוך התקנונים.' },
        { who: 'shachar', t: '10:24', text: ['✅ נוצר. הכירו את @דרור, עמית השירות החדש שלכם.', '@דרור, הציגו את עצמכם'] },
        { who: 'dror', t: '10:24', text: '👋 אני דרור. אני עונה על שאלות מנהליות מסביב לשעון, רק מתוך התקנונים ועם הפניה למקור. כשמשהו דורש שיקול דעת, אני מעביר לרכזת עם סיכום קצר, כדי שאף סטודנט לא יצטרך להסביר הכל מחדש.' }] },
    { name: 'נוגה', handle: '@נוגה', role: 'אוריינות AI ו-AI Hub', img: 'assets/img/mate-noga.webp', tools: [['Moodle', 'book', '#f98012'], ['הספרייה', 'library', '#6b4ce6'], ['יומן', 'calendar', '#e0703f']], ch: 'ai-hub',
      chat: [{ who: 'rina', t: '11:02', text: '@שחר צריך עמיתה שמלווה את סדנאות הפתיחה ב-AI Hub ועונה לסטודנטים אחרי הסדנה.' },
        { who: 'shachar', t: '11:02', text: ['✅ מוכן. הכירו את @נוגה.', '@נוגה, ספרי מה את עושה'] },
        { who: 'noga', t: '11:03', text: '✨ אני נוגה. אני שולחת תזכורות לסדנאות, עונה על שאלות בנושא שימוש אחראי בכלי AI ויושרה אקדמית, ומסכמת לרינה מה הסטודנטים שאלו הכי הרבה בכל שבוע.' }] },
    { name: 'אופק', handle: '@אופק', role: 'רישום ו-Lead Scoring', img: 'assets/img/mate-ofek.webp', tools: [['CRM', 'users', '#2b5cff'], ['מרכזייה', 'phone', '#0e7c66'], ['Power BI', 'chart', '#c98a00']], ch: 'רישום',
      chat: [{ who: 'yossi', t: '14:10', text: '@שחר אנחנו צריכים מישהו שיעזור ליועצי הרישום לדעת למי להתקשר קודם.' },
        { who: 'shachar', t: '14:10', text: ['✅ נוצר. הכירו את @אופק, עמית הרישום.', '@אופק, הציגו את עצמכם'] },
        { who: 'ofek', t: '14:11', text: '📈 אני אופק. בכל בוקר אני מדרג את המתעניינים לפי הסיכוי שירשמו, ומכין ליועצים רשימת שיחות עם הסיבה לכל שורה. כך הזמן הולך למי שהכי צריך שיחה.' }] },
    { name: 'גפן', handle: '@גפן', role: 'כספים וגבייה', img: 'assets/img/mate-gefen.webp', tools: [['Priority', 'card', '#0e7c66'], ['מכלול', 'cap', '#2b5cff'], ['דוא״ל', 'mail', '#d03b3b']], ch: 'כספים',
      chat: [{ who: 'daniel', t: '16:40', text: '@שחר מגיע לנו עמית שמזהה פיגורי תשלום לפני שהם נהיים בעיה.' },
        { who: 'shachar', t: '16:40', text: ['✅ בוצע. הכירו את @גפן.', '@גפן, הציגי את עצמך'] },
        { who: 'gefen', t: '16:41', text: '💳 אני גפן. אני עוקבת אחרי פיגורים ב-Priority, מציעה פריסת תשלומים או בדיקת מלגה, ומתריעה לרכזת כשפיגור מצטרף לסימני סיכון אחרים.' }] },
    { name: 'אלון', handle: '@אלון', role: 'משילות ואיכות נתונים', img: 'assets/img/mate-alon.webp', tools: [['קטלוג נתונים', 'db', '#6b4ce6'], ['dbt', 'check', '#e0703f'], ['Power BI', 'chart', '#c98a00']], ch: 'פורום-משילות',
      chat: [{ who: 'yossi', t: '08:30', text: '@שחר אני רוצה שמישהו ישמור על מילון המונחים ויתריע כשמספרים לא מתיישבים.' },
        { who: 'shachar', t: '08:30', text: ['✅ נוצר. הכירו את @אלון.', '@אלון, הציגו את עצמכם'] },
        { who: 'alon', t: '08:31', text: '🧭 אני אלון. אני מריץ בדיקות איכות על כל טעינה, מסמן כפילויות ושדות חסרים, ומוודא ש"סטודנט פעיל" אומר אותו דבר בכל יחידה ובכל דוח.' }] },
  ];
  ['dror', 'noga', 'ofek', 'gefen', 'alon'].forEach((k, i) => { PEOPLE[k] = { name: TEAM[i].name, av: TEAM[i].img, bot: true }; });
  function team() {
    const chat = $('[data-team-chat]'), prof = $('[data-team-profile]'), dots = $('[data-team-dots]');
    if (!chat) return;
    let cur = 0, t = null;
    TEAM.forEach((m, k) => {
      const pre = new Image(); pre.src = 'assets/img/art-' + m.img.replace(/^.*mate-|\.webp$/g, '') + '.webp';
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('aria-label', m.name); b.innerHTML = '<i></i>';
      b.addEventListener('click', () => go(k));
      dots.appendChild(b);
    });
    function render() {
      const m = TEAM[cur];
      chat.innerHTML = '<div class="chan-head"><b># ' + esc(m.ch) + '</b></div><div class="body">' + m.chat.map(msgHTML).join('') + '</div>';
      const key = m.img.replace(/^.*mate-|\.webp$/g, '');
      prof.innerHTML = '<img class="p-bg" src="assets/img/art-' + key + '.webp" alt="">' +
        '<div class="p-glass"><div class="p-top"><div><p class="p-name">' + esc(m.name) + '</p><p class="p-role">' + esc(m.role) + '</p></div><span class="handle">' + esc(m.handle) + '</span></div>' +
        '<p class="p-label">גישה ל</p><div class="p-tools">' + m.tools.map(([n, i, c]) => '<span class="tool-chip" style="--c:' + c + '">' + icon(i) + esc(n) + '</span>').join('') + '</div></div>' +
        '<div class="p-art"><img src="' + m.img + '" alt="' + esc(m.name) + ', ' + esc(m.role) + '"></div>';
      $$('button', dots).forEach((b, k) => b.setAttribute('aria-current', String(k === cur)));
    }
    async function go(k) {
      cur = (k + TEAM.length) % TEAM.length;
      chat.classList.add('out'); prof.classList.add('out');
      await sleep(reduced() ? 0 : 280);
      render();
      chat.classList.remove('out'); prof.classList.remove('out');
      restart();
    }
    function restart() { clearInterval(t); if (!reduced()) t = setInterval(() => go(cur + 1), 8000); }
    $('[data-team-prev]').addEventListener('click', () => go(cur - 1));
    $('[data-team-next]').addEventListener('click', () => go(cur + 1));
    render(); restart();
  }

  /* ---------------- dark section lamp follows pointer ---------------- */
  function lamp() {
    const st = $('[data-stage]');
    if (!st || reduced()) return;
    const l = $('.lamp', st);
    let tx = 50, ty = 40, x = 50, y = 40, auto = true, last = 0;
    st.parentElement.addEventListener('pointermove', (e) => {
      const r = st.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * 100; ty = ((e.clientY - r.top) / r.height) * 100; auto = false; last = performance.now();
    });
    (function f(now) {
      requestAnimationFrame(f);
      if (performance.now() - last > 2500) auto = true;
      if (auto) { tx = 50 + Math.cos(now / 2100) * 26; ty = 42 + Math.sin(now / 1500) * 22; }
      x += (tx - x) * .06; y += (ty - y) * .06;
      l.style.setProperty('--lx', x + '%'); l.style.setProperty('--ly', y + '%');
    })(0);
  }

  /* ---------------- CTA mini grid + peek + faq ---------------- */
  function misc() {
    const g = $('[data-mini-grid]');
    if (g) {
      const all = SYS.map((s) => [s.i, s.c]).concat(MISC.slice(0, 22).map((i, k) => [i, MISC_C[k % MISC_C.length]]));
      g.innerHTML = all.slice(0, 28).map(([i, c]) => '<span style="--c:' + c + '">' + icon(i) + '</span>').join('');
    }
    const peek = $('[data-peek]');
    if (peek && 'IntersectionObserver' in window) {
      new IntersectionObserver((en) => { peek.style.setProperty('--py', en[0].isIntersecting ? '18px' : '120px'); }, { threshold: .4 }).observe(peek);
      peek.style.setProperty('--py', '120px');
    }
    const dlg = $('#faq');
    $$('[data-open-faq]').forEach((b) => b.addEventListener('click', () => { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }));
    $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }

  /* ---------------- live mascot: tilts toward the pointer, eyes track it and blink ---------------- */
  function boot() { demo(); constellation(); stack(); memory(); team(); lamp(); misc(); window.Shachar.owlLive(); hydrateIcons(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
