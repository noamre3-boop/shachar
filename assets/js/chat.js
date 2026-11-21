/* שאלו את שחר — open conversation with the local model, typed out live, on liquid glass.
   The conversation is remembered per user, and exposes a small API (Shachar.chat) so the
   learning flows (learn.js) can post lessons, questions and cards into the same chat. */
(function () {
  'use strict';
  const S = window.Shachar;
  const { $, $$, esc, icon, hydrateIcons, toast, store, local, kb, reduced, sleep } = S;
  const A = S.account;

  const chat = $('[data-chat]'), log = $('[data-log]'), form = $('[data-form]'), input = $('[data-input]');
  const send = $('[data-send]'), stop = $('[data-stop]'), pii = $('[data-pii]'), status = $('[data-status]');
  let empty = $('[data-empty]');
  const PH = input.getAttribute('placeholder');

  const SUGGEST = [
    'איך מתכוננים למבחן כשנשאר רק שבוע?',
    'נכשלתי בקורס, מה האפשרויות שלי?',
    'קשה לי לחזור לשגרה אחרי מילואים',
    'תסביר לי בפשטות מה זו סטיית תקן',
    'איך כותבים מייל למרצה על הארכה?',
    'מי רואה את הנתונים שלי?',
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
  const validTo = (d) => (d.source ? 'אתר המכללה · נבדק ' + d.checked.split('-').reverse().join('.') : d.validTo ? 'בתוקף עד ' + d.validTo.split('-').reverse().join('.') : '');
  function extrasHTML(m) {
    const src = (m.hits || []).length ? '<details class="srcs-toggle"><summary class="mbtn" style="list-style:none;cursor:pointer">' + icon('book') + 'מקורות (' + m.hits.length + ')</summary><div class="srcs" style="margin-top:6px">' +
      m.hits.map((h) => '<details><summary>' + icon('file') + '<span>' + esc(h.title) + ' · ' + esc(h.h) + '</span><span class="v">' + esc(h.valid) + '</span></summary><p>' + esc(h.t) + '</p></details>').join('') + '</div></details>' : '';
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
      '<div class="bubble">' + esc(m.text) + '</div>' + (m.plain ? '' : extrasHTML(m)) + '</div></div>';
  }

  /* ---------- live writing: the answer is typed out as it arrives ---------- */
  let typeTokenCancelled = false;
  async function typeOut(el, text) {
    if (reduced()) { el.textContent = text; return; }
    el.textContent = '';
    const caret = document.createElement('span'); caret.className = 'caret';
    const tn = document.createTextNode(''); el.append(tn, caret);
    const parts = text.match(/\S+\s*/g) || [text];
    for (let i = 0; i < parts.length; i++) {
      if (typeTokenCancelled) break;
      const follow = atBottom();
      tn.data += parts[i];
      if (follow) toBottom();
      const w = parts[i];
      await sleep(w.length > 8 ? 40 : 24 + Math.random() * 22 + (/[.,!?:]\s*$/.test(w) ? 80 : 0));
    }
    tn.data = text; caret.remove();
  }

  /* ---------- free conversation ---------- */
  let ctl = null, busy = false;
  async function ask(raw) {
    const { text: q, hit } = maskPII(String(raw).trim());
    if (!q || busy) return;
    busy = true; typeTokenCancelled = false;
    pii.hidden = !hit;
    const prior = history.filter((m) => !m.pending).map(asTurn).filter((m) => m.content);
    history.push({ role: 'user', text: q }); save();
    add(meHTML(q));
    const kept = A && A.learnFrom(q);
    if (kept) add('<div class="row me mem-row"><span class="mem-chip">' + icon('brain') + 'שחר יזכור: ' + esc(kept) + '</span></div>');
    const shell = botShell();
    const th = $('[data-th]', shell);
    send.hidden = true; stop.hidden = false;
    ctl = new AbortController();
    let res;
    try {
      res = await kb.converse(prior, q, { profile: A ? A.profileText() : '', signal: ctl.signal, onTick: (s) => { th.textContent = s < 4 ? 'שחר חושב…' : 'שחר כותב תשובה… ' + Math.round(s) + ' שנ׳'; } });
    } catch (e) {
      res = { text: e.message === 'בוטל' ? 'עצרתי. אפשר לשאול שוב, או לנסח אחרת.' : 'משהו השתבש בחיבור למודל המקומי. נסו שוב בעוד רגע.', hits: [], mode: 'none' };
    }
    const m = { role: 'bot', text: res.text, mode: res.mode, crisis: !!res.crisis, hits: (res.hits || []).map((h) => ({ title: h.doc.title, h: h.h, t: h.t, valid: validTo(h.doc) })) };
    const col = $('.col', shell);
    col.innerHTML = (m.crisis ? '<div class="care"><b>לא לבד:</b> ער"ן 1201 (24/7) · מד"א 101 · דיקנאט הסטודנטים</div>' : '') + '<div class="bubble"></div>';
    await typeOut($('.bubble', col), m.text);
    col.insertAdjacentHTML('beforeend', extrasHTML(m)); hydrateIcons(col);
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
  log.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) {
      const b = c.closest('.col').querySelector('.bubble');
      try { await navigator.clipboard.writeText(b.textContent); toast('הועתק'); } catch { toast('לא הצלחתי להעתיק', 'warn'); }
    }
    if (e.target.closest('[data-handoff]')) {
      const lastQ = [...history].reverse().find((m) => m.role === 'user');
      dlg.querySelector('textarea').value = lastQ ? 'שאלתי את שחר: "' + lastQ.text + '". אשמח לעזרה.' : '';
      dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
    }
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
    log, form, input, add, typeOut, waitText, cancelWait, maskPII, toBottom, atBottom,
    get waiting() { return !!waiting; },
    /** a plain bot message, typed out live and remembered */
    async say(text) {
      typeTokenCancelled = false;
      const row = add('<div class="row bot">' + AV + '<div class="col"><div class="bubble"></div></div></div>');
      const entry = { role: 'bot', text, plain: true };
      history.push(entry); save();
      await typeOut($('.bubble', row), text);
      if (atBottom()) toBottom();
      return row;
    },
    thinking(label) { return botShell(label); },
    /** an interactive card; it is remembered (as a static copy) once persist() is called */
    card(html) {
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

  /* ---------- suggestions, history, status ---------- */
  const sugs = $('[data-sugs]');
  if (sugs) {
    sugs.innerHTML = SUGGEST.map((s) => '<button class="sug" type="button">' + esc(s) + '</button>').join('');
    sugs.addEventListener('click', (e) => { const b = e.target.closest('.sug'); if (b) ask(b.textContent); });
  }
  const name = A ? A.firstName() : '';
  const h1 = empty && $('h1', empty);
  if (h1 && name) h1.textContent = 'היי ' + name + ', טוב לראות אותך.';
  if (history.length) history.forEach((m) => add(m.role === 'user' ? meHTML(m.text) : botHTML(m)));

  // On the public site the model on the visitor's own computer is opt-in (the browser asks first).
  const conn = document.createElement('button');
  conn.type = 'button'; conn.className = 'lg-conn'; conn.hidden = true;
  conn.innerHTML = icon('cpu') + '<span>חיבור למודל במחשב שלי</span>';
  status.after(conn); hydrateIcons(conn);
  conn.addEventListener('click', async () => {
    conn.disabled = true;
    const ok = await local.optIn();
    conn.disabled = false;
    toast(ok ? 'מחובר למודל שרץ במחשב שלך' : 'לא מצאתי מודל במחשב הזה. צריך ש-ComfyUI ירוץ (start.bat), ואז לנסות שוב.', ok ? 'info' : 'warn');
  });
  local.on((m) => {
    const on = m.state === 'ok' || m.state === 'busy';
    status.textContent = m.state === 'busy' ? 'כותב…' : on ? 'מחובר · רץ על המחשב הזה' : m.state === 'off' ? 'מצב מקורות בלבד' : 'עוזר ה-AI של המכללה';
    conn.hidden = local.allowed();
  });

  /* ---------- liquid glass + scroll-driven distortion ---------- */
  if (window.Liquid) {
    const win = Liquid.attach(chat, { radius: 34, band: 60, scale: 74, ripple: .26, blur: 14, saturate: 180, freq: .0055 });
    const head = Liquid.attach($('[data-head]'), { radius: 22, band: 26, scale: 46, ripple: .3, blur: 5, saturate: 190, freq: .012 });
    const comp = Liquid.attach(form, { radius: 26, band: 30, scale: 50, ripple: .3, blur: 5, saturate: 190, freq: .011 });
    let lastTop = log.scrollTop;
    log.addEventListener('scroll', () => { const v = log.scrollTop - lastTop; lastTop = log.scrollTop; Liquid.kick(v, [head, comp]); }, { passive: true });
    addEventListener('wheel', (e) => { if (!log.contains(e.target)) Liquid.kick(e.deltaY * .25, [win]); }, { passive: true });
  }

  hydrateIcons();
  const q = new URLSearchParams(location.search).get('q');
  if (q) ask(q);
})();
