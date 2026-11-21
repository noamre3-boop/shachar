/* שאלו את שחר — a full-screen conversation with the local model, typed out live.
   The conversation is remembered per user, and exposes a small API (Shachar.chat) so the
   learning flows (learn.js) can post lessons, questions and cards into the same chat.
   What keeps people talking (see core.js for the research): Shachar answers in their form of
   address, offers quick follow-ups, welcomes them back with what they talked about last time,
   and has a small "question of the day" to start from. */
(function () {
  'use strict';
  const S = window.Shachar;
  const { $, $$, esc, rich, icon, hydrateIcons, toast, store, local, kb, reduced, sleep } = S;
  const A = S.account;

  const log = $('[data-log]'), form = $('[data-form]'), input = $('[data-input]');
  const send = $('[data-send]'), stop = $('[data-stop]'), pii = $('[data-pii]'), status = $('[data-status]'), dot = $('[data-dot]');
  let empty = $('[data-empty]');
  const PH = input.getAttribute('placeholder');

  /* ---------- the user's form of address (Hebrew is gendered; neutral is the default) ---------- */
  const addr = () => (A ? A.mem.get('addr', '') : '');
  const g = (f, m, n) => ({ f, m }[addr()] || n); // pick the right wording

  const SUGGEST = [
    'איך מתכוננים למבחן כשנשאר רק שבוע?',
    'נכשלתי בקורס, מה האפשרויות שלי?',
    'קשה לי לחזור לשגרה אחרי מילואים',
    'תסביר לי בפשטות מה זו סטיית תקן',
    'איך כותבים מייל למרצה על הארכה?',
  ];
  // a small daily spark: curiosity is the easiest way into a conversation
  const SPARKS = [
    { k: 'חידה של היום', q: 'בכיתה יש חמישה ציונים: 60, 70, 80, 90 ו-100. מה יקרה לממוצע ולחציון אם ה-100 יהפוך ל-1000?' },
    { k: 'שאלה טובה לשאול את עצמך', q: 'מה הדבר האחד שאם אסיים אותו היום, השבוע ירגיש קל יותר?' },
    { k: 'טיפ למידה', q: 'למה ללמוד בכמה פעמים קצרות עובד יותר טוב מלילה לבן לפני המבחן?' },
    { k: 'אתגר אנגלית', q: 'מה ההבדל בין however ל-therefore? אפשר דוגמה לכל אחת?' },
    { k: 'כתיבה', q: 'איך כותבים משפט פתיחה טוב לעבודה אקדמית?' },
    { k: 'מוטיבציה', q: 'מה עושים ביום שאין בכלל כוח ללמוד?' },
    { k: 'חידה של היום', q: 'הטלתי מטבע חמש פעמים ויצא עץ בכולן. מה הסיכוי שבפעם השישית ייצא עץ?' },
    { k: 'זמן', q: 'איך מחלקים שבוע עמוס בין עבודה, לימודים וקצת חיים?' },
    { k: 'מוח', q: 'למה דווקא כשמנסים להיזכר בלי להציץ, החומר נשאר יותר טוב?' },
    { k: 'אתגר אנגלית', q: 'מה פירוש המילה unreliable, ואיך אפשר לנחש את זה בלי מילון?' },
  ];

  /* ---------- privacy: mask IDs, phones, e-mails before anything is shown, sent or saved ---------- */
  function maskPII(s) {
    let hit = false;
    const out = s
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, () => { hit = true; return '[דוא״ל הוסתר]'; })
      .replace(/(?:\+?972[-\s]?|0)(?:[23489]|5\d|7\d)[-\s]?\d{3}[-\s]?\d{4}\b/g, () => { hit = true; return '[טלפון הוסתר]'; })
      .replace(/\b\d{9}\b/g, () => { hit = true; return '[ת״ז הוסתרה]'; });
    return { text: out, hit };
  }

  /* ---------- history: remembered per user ---------- */
  const mem = A ? A.mem : { get: (k, d) => store.get(k, d), set: (k, v) => store.set(k, v) };
  let history = mem.get('chat', []);
  const save = () => mem.set('chat', history.filter((m) => !m.pending).slice(-80));
  const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  const toBottom = () => { log.scrollTop = log.scrollHeight; };
  const asTurn = (m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.kind === 'card' ? (m.sum || '') : (m.text || '') });

  function clearHello() {
    if (empty && empty.isConnected) { empty.remove(); empty = null; log.insertAdjacentHTML('afterbegin', '<div class="spacer"></div>'); }
  }
  function add(html) { clearHello(); log.insertAdjacentHTML('beforeend', html); const el = log.lastElementChild; hydrateIcons(el); toBottom(); return el; }
  const AV = '<img class="av" src="assets/img/owl-face.webp" alt="">';
  const meHTML = (t) => '<div class="row me"><div class="bubble">' + esc(t) + '</div></div>';
  const validTo = (d) => (d.course ? 'חומר הקורס' : d.source ? 'אתר המכללה · נבדק ' + d.checked.split('-').reverse().join('.') : d.validTo ? 'בתוקף עד ' + d.validTo.split('-').reverse().join('.') : '');
  function extrasHTML(m) {
    const src = (m.hits || []).length ? '<details class="srcs-toggle"><summary class="mbtn" style="list-style:none;cursor:pointer">' + icon('book') + 'מקורות (' + m.hits.length + ')</summary><div class="srcs" style="margin-top:6px">' +
      m.hits.map((h) => '<details><summary>' + icon('file') + '<span>' + esc(h.title) + ' · ' + esc(h.h) + '</span><span class="v">' + esc(h.valid) + '</span></summary><p>' + rich(h.t) + '</p></details>').join('') + '</div></details>' : '';
    const mode = m.mode === 'extract' ? '<span class="mbtn" style="cursor:default">' + icon('book') + 'ציטוט מהמקור</span>' : '';
    return '<div class="meta">' + src + mode + '<button class="mbtn" type="button" data-copy>' + icon('copy') + 'העתקה</button><button class="mbtn" type="button" data-handoff>' + icon('inbox') + 'העברה לרכזת</button></div>';
  }
  function botShell(label) {
    return add('<div class="row bot">' + AV + '<div class="col"><div class="bubble"><span class="think"><span class="dots3"><i></i><i></i><i></i></span><span data-th>' + esc(label || 'שחר חושב…') + '</span></span></div></div></div>');
  }
  function botHTML(m) {
    if (m.kind === 'card') return '<div class="row bot lx-row lx-done lx-old">' + AV + '<div class="col">' + m.html + '</div></div>';
    return '<div class="row bot">' + AV + '<div class="col">' +
      (m.crisis ? '<div class="care"><b>לא לבד:</b> ער"ן 1201 (24/7) · מד"א 101 · דיקנאט הסטודנטים</div>' : '') +
      '<div class="bubble">' + rich(m.text) + '</div>' + (m.aside ? asideHTML(m.aside) : '') + (m.plain ? '' : extrasHTML(m)) + '</div></div>';
  }
  const asideHTML = (t) => '<p class="aside"><img src="assets/img/owl-face.webp" alt="">' + esc(t) + '</p>';

  /* ---------- live writing: the answer is typed out as it arrives ---------- */
  let typeTokenCancelled = false;
  async function typeOut(el, text) {
    if (reduced()) { el.innerHTML = rich(text); return; }
    el.textContent = '';
    const caret = document.createElement('span'); caret.className = 'caret';
    const tn = document.createTextNode(''); el.append(tn, caret);
    const parts = text.match(/\S+\s*/g) || [text];
    const pace = parts.length > 70 ? .55 : 1; // long answers flow faster
    for (let i = 0; i < parts.length; i++) {
      if (typeTokenCancelled) break;
      const follow = atBottom();
      tn.data += parts[i];
      if (follow) toBottom();
      const w = parts[i];
      await sleep((w.length > 8 ? 38 : 22 + Math.random() * 20 + (/[.,!?:]\s*$/.test(w) ? 80 : 0)) * pace);
    }
    el.innerHTML = rich(text);
  }

  /* ---------- quick replies: one tap to keep going ---------- */
  function clearQR() { $$('.qr', log).forEach((q) => q.remove()); }
  function showQR(col, items) {
    clearQR();
    if (!items || !items.length) return;
    const box = document.createElement('div');
    box.className = 'qr';
    items.forEach((it) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = it.t;
      b.addEventListener('click', () => { clearQR(); if (it.act) it.act(); else ask(it.say || it.t); });
      box.appendChild(b);
    });
    col.appendChild(box);
    if (atBottom()) toBottom();
  }
  const learnGo = (id) => () => (S.learn ? S.learn.go(id) : null);
  function repliesFor(q, res) {
    const course = (res.hits || []).find((h) => h.doc.course);
    const official = (res.hits || []).some((h) => !h.doc.course);
    if (res.crisis) return [];
    if (kb.EMO.test(q)) return [
      { t: g('בא לי לפרוק עוד', 'בא לי לפרוק עוד', 'בא לי לפרוק עוד') },
      { t: 'צעד קטן להיום', say: g('תני לי צעד אחד קטן להיום', 'תן לי צעד אחד קטן להיום', 'אפשר צעד אחד קטן להיום?') },
      { t: 'מי יכול לעזור במכללה?' },
    ];
    if (course) {
      const id = course.doc.id.replace('course-', '');
      return [
        { t: 'דוגמה מהחיים', say: 'אפשר דוגמה מהחיים על זה?' },
        { t: 'שאלת תרגול', say: g('תבחן אותי בשאלה אחת על זה', 'תבחן אותי בשאלה אחת על זה', 'אפשר שאלת תרגול אחת על זה?') },
        { t: 'ללמוד את זה כקורס', act: learnGo(id) },
      ];
    }
    if (official) return [
      { t: 'איך פונים אליהם?' },
      { t: 'להעביר לרכזת', act: () => openHandoff() },
      { t: 'יש עוד משהו שכדאי לדעת?' },
    ];
    if (/מה זה|מה זו|תסביר|תסבירי|הסבר|למה|איך/.test(q)) return [
      { t: 'בפשטות יותר', say: 'אפשר להסביר את זה בפשטות יותר?' },
      { t: 'דוגמה', say: 'אפשר דוגמה?' },
      { t: 'שאלת תרגול', say: 'אפשר שאלת תרגול על זה?' },
    ];
    return [
      { t: g('ספרי לי עוד', 'ספר לי עוד', 'אפשר להרחיב?') },
      { t: 'יש לך טיפ?' },
      { t: 'ללמוד משהו קצר', act: () => S.learn && S.learn.openCourses() },
    ];
  }

  /* ---------- a little about Shachar itself ----------
     Small self-disclosure invites openness (Lee et al., CHI 2020). A 4B model overdoes it and
     repeats itself, so these lines are hand-written, rare, and never fed back to the model. */
  const ASIDES = [
    'אגב, אני רץ על כרטיס מסך קטן במחשב הזה, אז כל תשובה היא גם קצת אימון כושר בשבילו.',
    'סוד קטן: אני ינשוף שמתלהב מגרפים. איפה שיש נתונים, אני שם.',
    'גם לי יש רגעים של "עוד חמש דקות". אצלי זה נקרא "טוען…".',
    'אני הכי אוהב שאלות "למה". הן תמיד מובילות למקומות מעניינים.',
    'מבחינתי אין שאלה טיפשית, יש רק שאלות שעוד לא נשאלו.',
    'אני כאן גם בשתיים בלילה. ינשופים, נו.',
    'טיפ ממני: הפסקה של חמש דקות עושה פלאים. גם לרובוטים.',
  ];
  function maybeAside(q, res) {
    if (!A || res.crisis || res.mode !== 'llm' || kb.EMO.test(q) && !/שמח|הצלחתי|התרגשתי/.test(q)) return '';
    const n = A.mem.get('asideGap', 0) + 1;
    if (n < 5 || Math.random() < .4) { A.mem.set('asideGap', n); return ''; }
    A.mem.set('asideGap', 0);
    const used = A.mem.get('asidesUsed', []);
    const pool = ASIDES.map((t, i) => i).filter((i) => !used.includes(i));
    const i = (pool.length ? pool : ASIDES.map((t, k) => k))[Math.floor(Math.random() * (pool.length || ASIDES.length))];
    A.mem.set('asidesUsed', (pool.length ? used : []).concat(i));
    return ASIDES[i];
  }

  /* ---------- free conversation ---------- */
  let ctl = null, busy = false;
  async function ask(raw) {
    const { text: q, hit } = maskPII(String(raw).trim());
    if (!q || busy) return;
    busy = true; typeTokenCancelled = false;
    clearQR();
    pii.hidden = !hit;
    const prior = history.filter((m) => !m.pending).map(asTurn).filter((m) => m.content);
    history.push({ role: 'user', text: q }); save();
    if (A) A.mem.set('lastSeen', Date.now());
    add(meHTML(q));
    const kept = A && A.learnFrom(q);
    if (kept) add('<div class="row me mem-row"><span class="mem-chip">' + icon('brain') + 'שחר יזכור: ' + esc(kept) + '</span></div>');
    const shell = botShell();
    const th = $('[data-th]', shell);
    send.hidden = true; stop.hidden = false;
    ctl = new AbortController();
    let res;
    try {
      res = await kb.converse(prior, q, { addr: addr(), profile: A ? A.profileText() : '', signal: ctl.signal, onTick: (s) => { th.textContent = s < 4 ? 'שחר חושב…' : 'שחר כותב… ' + Math.round(s) + ' שנ׳'; } });
    } catch (e) {
      res = { text: e.message === 'בוטל' ? 'עצרתי. אפשר לשאול שוב, או לנסח אחרת.' : 'משהו השתבש בחיבור למודל המקומי. נסו שוב בעוד רגע.', hits: [], mode: 'none' };
    }
    const m = { role: 'bot', text: res.text, mode: res.mode, crisis: !!res.crisis, hits: (res.hits || []).map((h) => ({ title: h.doc.title, h: h.h, t: h.t, valid: validTo(h.doc) })) };
    const col = $('.col', shell);
    col.innerHTML = (m.crisis ? '<div class="care"><b>לא לבד:</b> ער"ן 1201 (24/7) · מד"א 101 · דיקנאט הסטודנטים</div>' : '') + '<div class="bubble"></div>';
    await typeOut($('.bubble', col), m.text);
    $('.av', shell).classList.add('pop');
    m.aside = maybeAside(q, res);
    if (m.aside) col.insertAdjacentHTML('beforeend', asideHTML(m.aside));
    col.insertAdjacentHTML('beforeend', extrasHTML(m)); hydrateIcons(col);
    if (res.mode !== 'none' || res.hits.length) showQR(col, repliesFor(q, res));
    if (atBottom()) toBottom();
    history.push(m); save();
    ctl = null; busy = false; send.hidden = false; stop.hidden = true;
    if (!matchMedia('(pointer: coarse)').matches) input.focus();
  }

  /* ---------- the composer: free questions, or an answer the learning flow is waiting for ---------- */
  let waiting = null;
  function waitText(placeholder) {
    cancelWait();
    return new Promise((resolve) => {
      waiting = resolve;
      input.setAttribute('placeholder', placeholder || PH);
      form.classList.add('awaiting');
      if (!matchMedia('(pointer: coarse)').matches) input.focus();
      document.dispatchEvent(new CustomEvent('shachar:wait', { detail: true }));
    });
  }
  function cancelWait() {
    if (!waiting) return;
    const r = waiting; waiting = null;
    input.setAttribute('placeholder', PH); form.classList.remove('awaiting');
    document.dispatchEvent(new CustomEvent('shachar:wait', { detail: false }));
    r(null);
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value;
    if (!v.trim()) return;
    input.value = ''; autosize(); form.classList.remove('has-text');
    if (waiting) {
      const { text } = maskPII(v.trim());
      const r = waiting; waiting = null;
      input.setAttribute('placeholder', PH); form.classList.remove('awaiting');
      document.dispatchEvent(new CustomEvent('shachar:wait', { detail: false }));
      clearQR();
      history.push({ role: 'user', text }); save(); add(meHTML(text));
      r(text);
      return;
    }
    ask(v);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
  function autosize() { input.style.height = ''; input.style.height = Math.min(160, input.scrollHeight) + 'px'; }
  input.addEventListener('input', () => { autosize(); form.classList.toggle('has-text', !!input.value.trim()); });
  stop.addEventListener('click', () => { typeTokenCancelled = true; if (ctl) ctl.abort(); });
  $('[data-clear]').addEventListener('click', () => { history = []; save(); location.reload(); });

  /* ---------- copy / handoff ---------- */
  const dlg = $('#handoff');
  function openHandoff() {
    const lastQ = [...history].reverse().find((m) => m.role === 'user');
    dlg.querySelector('textarea').value = lastQ ? 'שאלתי את שחר: "' + lastQ.text + '". אשמח לעזרה.' : '';
    dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
  }
  log.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) {
      const b = c.closest('.col').querySelector('.bubble');
      try { await navigator.clipboard.writeText(b.textContent); toast('הועתק'); } catch { toast('לא הצלחתי להעתיק', 'warn'); }
    }
    if (e.target.closest('[data-handoff]')) openHandoff();
  });
  $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  $('[data-ticket]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, { text } = maskPII(f.body.value);
    const t = { id: 'P-' + Date.now().toString(36).toUpperCase().slice(-6), fac: f.fac.value, body: text, at: new Date().toISOString() };
    const ts = store.get('tickets', []); ts.unshift(t); store.set('tickets', ts.slice(0, 30));
    try { await navigator.clipboard.writeText('פנייה ' + t.id + '\n' + t.fac + '\n' + t.body); } catch { /* clipboard may be blocked */ }
    dlg.close(); toast('הפנייה ' + t.id + ' נפתחה והועתקה. בדרך כלל עונים בתוך 24 שעות');
  });

  /* ---------- API for the learning flows ---------- */
  S.chat = {
    log, form, input, add, typeOut, waitText, cancelWait, maskPII, toBottom, atBottom, showQR, clearQR, g,
    get waiting() { return !!waiting; },
    /** a plain bot message, typed out live and remembered (remember:false for a passing line) */
    async say(text, opts) {
      typeTokenCancelled = false;
      clearQR();
      const row = add('<div class="row bot">' + AV + '<div class="col"><div class="bubble"></div></div></div>');
      if (!opts || opts.remember !== false) { history.push({ role: 'bot', text, plain: true }); save(); }
      await typeOut($('.bubble', row), text);
      $('.av', row).classList.add('pop');
      if (atBottom()) toBottom();
      return row;
    },
    thinking(label) { return botShell(label); },
    /** an interactive card; it is remembered (as a static copy) once persist() is called */
    card(html) {
      clearQR();
      const row = add('<div class="row bot lx-row lx-live">' + AV + '<div class="col">' + html + '</div></div>');
      const entry = { role: 'bot', kind: 'card', html: '', sum: '', pending: true };
      history.push(entry);
      row._entry = entry;
      return row;
    },
    persist(row, sum) {
      row.classList.remove('lx-live'); row.classList.add('lx-done');
      const e = row._entry; if (!e) return;
      e.html = $('.col', row).innerHTML; e.sum = sum || ''; delete e.pending; save();
    },
    /** drop cards nobody answered (when the user jumps to something else) */
    dropLive() {
      $$('.lx-row.lx-live', log).forEach((row) => { const i = history.indexOf(row._entry); if (i >= 0) history.splice(i, 1); row.remove(); });
      cancelWait();
    },
    hello: () => (empty && empty.isConnected ? empty : null),
    hasHistory: () => history.some((m) => !m.pending),
  };

  /* ---------- the empty chat: greeting, form of address, question of the day ---------- */
  const name = A ? A.firstName() : '';
  const lastSeen = A ? A.mem.get('lastSeen', 0) : 0;
  const away = Date.now() - lastSeen;
  if (empty) {
    const h1 = $('h1', empty);
    if (h1 && name) h1.textContent = lastSeen ? 'היי ' + name + ', טוב לראות אותך שוב.' : 'היי ' + name + ', אני שחר.';
    const day = Math.floor(Date.now() / 864e5);
    const sp = SPARKS[day % SPARKS.length];
    const sugs = $('[data-sugs]');
    sugs.insertAdjacentHTML('beforebegin', '<button class="spark" type="button" data-spark><span class="spark-k">' + icon('sparkle') + esc(sp.k) + '</span><span class="spark-q">' + rich(sp.q) + '</span><span class="spark-go">' + icon('arrowL') + '</span></button>');
    $('[data-spark]', empty).addEventListener('click', () => ask(sp.q));
    sugs.innerHTML = SUGGEST.map((s) => '<button class="sug" type="button">' + esc(s) + '</button>').join('');
    sugs.addEventListener('click', (e) => { const b = e.target.closest('.sug'); if (b) ask(b.textContent); });
  }
  if (history.length) history.forEach((m) => add(m.role === 'user' ? meHTML(m.text) : botHTML(m)));

  // ask once how to address the user, and remember it
  function addrPicker(where) {
    const html = '<div class="addr"><span>' + icon('smile') + 'איך נוח לך שאפנה אליך?</span><div class="addr-opts">' +
      '<button type="button" data-a="f">בלשון נקבה</button><button type="button" data-a="m">בלשון זכר</button><button type="button" data-a="n">בלי מגדר</button></div></div>';
    let host;
    if (where === 'hello') { $('p', empty).insertAdjacentHTML('afterend', html); host = $('.addr', empty); }
    else { host = add('<div class="row bot">' + AV + '<div class="col">' + html + '</div></div>'); }
    hydrateIcons(host);
    host.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      A.mem.set('addr', b.dataset.a);
      const box = host.classList.contains('addr') ? host : $('.addr', host);
      box.innerHTML = '<span>' + icon('check') + ({ f: 'סגור, אפנה אלייך בלשון נקבה.', m: 'סגור, אפנה אליך בלשון זכר.', n: 'סגור, אדבר בלי מגדר.' }[b.dataset.a]) + ' אפשר לשנות בכל רגע ב"הזיכרון שלי".</span>';
      hydrateIcons(box);
    });
  }
  if (A && !addr()) addrPicker(empty ? 'hello' : 'log');

  // welcome back, with a thread to the last conversation (continuity keeps people coming back)
  if (!empty && history.length && away > 3 * 36e5) {
    const lastUser = [...history].reverse().find((m) => m.role === 'user' && m.text && m.text.length > 6);
    const topic = lastUser ? lastUser.text.replace(/\s+/g, ' ').slice(0, 48) + (lastUser.text.length > 48 ? '…' : '') : '';
    const hi = (name ? 'היי ' + name + '! ' : 'היי! ') + g('טוב שחזרת.', 'טוב שחזרת.', 'טוב לראות אותך שוב.');
    const line = hi + (topic ? ' בפעם הקודמת דיברנו על "' + topic + '". איך זה הסתדר?' : ' על מה בא לך לדבר היום?');
    S.chat.say(line, { remember: false }).then((row) => showQR($('.col', row), topic ? [
      { t: 'הסתדר!', say: 'זה הסתדר, תודה!' }, { t: 'עוד לא ממש', say: 'עוד לא ממש הסתדר' }, { t: 'משהו אחר', act: () => input.focus() },
    ] : [{ t: 'ללמוד משהו קצר', act: () => S.learn && S.learn.openCourses() }, { t: 'סתם לדבר', say: 'בא לי סתם לדבר קצת' }]));
  }
  if (A) A.mem.set('lastSeen', Date.now());

  // On the public site the model on the visitor's own computer is opt-in (the browser asks first).
  const conn = document.createElement('button');
  conn.type = 'button'; conn.className = 'lg-conn'; conn.hidden = true;
  conn.innerHTML = icon('cpu') + '<span>חיבור למודל במחשב שלי</span>';
  status.parentElement.after(conn); hydrateIcons(conn);
  conn.addEventListener('click', async () => {
    conn.disabled = true;
    const ok = await local.optIn();
    conn.disabled = false;
    toast(ok ? 'מחובר למודל שרץ במחשב שלך' : 'לא מצאתי מודל במחשב הזה. צריך ש-ComfyUI ירוץ (start.bat), ואז לנסות שוב.', ok ? 'info' : 'warn');
  });
  local.on((m) => {
    const on = m.state === 'ok' || m.state === 'busy';
    status.textContent = m.state === 'busy' ? 'שחר כותב…' : on ? 'מחובר · רץ על המחשב הזה' : m.state === 'off' ? 'מצב מקורות בלבד' : 'עוזר ה-AI של המכללה';
    if (dot) dot.className = 'st-dot' + (m.state === 'busy' ? ' busy' : on ? ' on' : '');
    conn.hidden = local.allowed();
  });

  /* ---------- liquid glass on the composer ---------- */
  if (window.Liquid) {
    const comp = Liquid.attach(form, { radius: 26, band: 30, scale: 40, ripple: .25, blur: 4, saturate: 180, freq: .011 });
    let lastTop = log.scrollTop;
    log.addEventListener('scroll', () => { const v = log.scrollTop - lastTop; lastTop = log.scrollTop; Liquid.kick(v, [comp]); }, { passive: true });
  }

  hydrateIcons();
  S.owlLive && S.owlLive($('[data-owl]'));
  const q = new URLSearchParams(location.search).get('q');
  if (q) ask(q);
})();
