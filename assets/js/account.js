/* שחר · account — Google sign-in (Firebase Auth) and a per-user memory.
   - the opening screen (login.html) signs in with Google, or as a guest
   - every other page has a tiny gate in <head> that sends signed-out visitors to login.html
   - memory is kept per user on this device: conversation, notes the user asked to remember,
     course progress. A short profile of it is handed to the local model with every message. */
(function () {
  'use strict';
  const S = window.Shachar;
  const { $, $$, esc, icon, hydrateIcons, toast, store } = S;

  // Public web-app identifiers (not secrets): the key only names the Firebase project.
  const FB = {
    apiKey: 'AIzaSyDOLdiuyDa1vX9IADB87O6Cj89lzX6o1FQ',
    authDomain: 'solid-oxygen-zk9gj.firebaseapp.com',
    projectId: 'solid-oxygen-zk9gj',
    messagingSenderId: '603133862348',
    appId: '1:603133862348:web:430ec8e3f044c6d4e5bd69',
  };
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

  /* ---------------- session (who is signed in on this device) ---------------- */
  const session = {
    get() { return store.get('session', null); },
    set(u) { store.set('session', u); },
    clear() { try { localStorage.removeItem('shachar:session'); } catch { /* ignore */ } },
  };
  const me = session.get();

  /* ---------------- per-user memory ---------------- */
  const uid = me ? me.uid : 'guest';
  const key = (k) => 'u:' + uid + ':' + k;
  const mem = {
    get: (k, d) => store.get(key(k), d),
    set: (k, v) => store.set(key(k), v),
    notes() { return mem.get('notes', []); },
    addNote(t) {
      t = String(t).trim().replace(/\s+/g, ' ').slice(0, 160);
      if (t.length < 3) return false;
      const n = mem.notes();
      if (n.some((x) => x.t === t)) return false;
      n.push({ t, at: Date.now() }); mem.set('notes', n.slice(-30));
      return true;
    },
    removeNote(i) { const n = mem.notes(); n.splice(i, 1); mem.set('notes', n); },
    forget() {
      try { Object.keys(localStorage).filter((k) => k.indexOf('shachar:u:' + uid + ':') === 0).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
    },
    providers: [], // other modules add { profile(): string, panel(): html }
  };

  function firstName() {
    const nick = mem.get('nick', '');
    if (nick) return nick;
    if (!me || me.guest || !me.name) return '';
    return String(me.name).trim().split(/\s+/)[0];
  }

  /* Pick up things worth remembering from what the user writes (they can see and delete them). */
  function learnFrom(text) {
    const s = String(text).trim();
    let saved = null;
    let m = s.match(/(?:^|[\s,])(?:תזכור|תזכרי|תזכרו|זכור|זכרי|שים לב|שימי לב)\s*(?:ש|כי|:|-)?\s*([^?]{3,160})/);
    if (m) { const t = m[1].replace(/^ש/, '').trim(); if (mem.addNote(t)) saved = t; }
    m = s.match(/(?:קוראים לי|השם שלי(?: הוא)?|תקרא לי|תקראי לי|תקראו לי)\s+([א-תA-Za-z'"׳-]{2,20})/);
    if (m) { mem.set('nick', m[1]); saved = saved || 'השם שלך: ' + m[1]; }
    if (!saved) { // an explicit "remember…" already holds these details
      m = s.match(/אני (?:סטודנט|סטודנטית|לומד|לומדת)\s+(?:ל?תואר\s+)?(?:ב|ל)(חינוך|פסיכולוגיה|מדעי ה?\S+|ניהול|עבודה סוציאלית|הנדסת \S+|תקשורת|ביולוגיה|כלכלה|מדעי המחשב|סיעוד|קרימינולוגיה|אמנות|מוזיקה|תזונה|ספרות|היסטוריה|מתמטיקה)/);
      if (m && mem.addNote('לומד/ת ' + m[1])) saved = 'לומד/ת ' + m[1];
      m = s.match(/אני (?:בשנה|בשנת לימודים)\s+(ראשונה|שנייה|שניה|שלישית|רביעית|א׳|ב׳|ג׳|ד׳|א'|ב'|ג'|ד')/);
      if (m && mem.addNote('בשנה ' + m[1])) saved = saved || 'בשנה ' + m[1];
    }
    // recent topics, so "what did we talk about?" has an answer next time
    if (s.length > 8 && !/להתאבד|לפגוע בעצמי|רוצה למות/.test(s)) {
      const t = mem.get('topics', []); t.push(s.slice(0, 70)); mem.set('topics', t.slice(-8));
    }
    return saved;
  }

  /* A short profile handed to the model with each message. */
  function profileText() {
    const lines = [];
    const n = firstName();
    if (n) lines.push('שם: ' + n + ' (אפשר לפנות בשם מדי פעם, לא בכל הודעה).');
    const notes = mem.notes();
    if (notes.length) lines.push('דברים שהמשתמש ביקש שתזכור: ' + notes.map((x) => x.t).join('; ') + '.');
    mem.providers.forEach((p) => { try { const t = p.profile && p.profile(); if (t) lines.push(t); } catch (e) { console.error(e); } });
    const topics = mem.get('topics', []).slice(-5, -1);
    if (topics.length) lines.push('נושאים ששאל עליהם לאחרונה: ' + topics.join(' | ') + '.');
    if (!lines.length) return '';
    return 'הזיכרון שלך על המשתמש הזה (השתמש בו רק כשזה עוזר, ואל תצטט אותו סתם):\n- ' + lines.join('\n- ');
  }

  /* ---------------- Firebase (loaded only when needed) ---------------- */
  let F = null;
  function fb() {
    if (F) return Promise.resolve(F);
    return Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js')]).then(([app, A]) => {
      const a = app.initializeApp(FB);
      F = { A, auth: A.getAuth(a) };
      try { F.auth.languageCode = 'he'; } catch { /* ignore */ }
      return F;
    });
  }
  const fromUser = (u) => ({ uid: u.uid, name: u.displayName || '', email: u.email || '', photo: u.photoURL || '', guest: false, at: Date.now() });

  function nextPage() {
    const n = new URLSearchParams(location.search).get('next') || 'index.html';
    return /^[\w.-]+\.html([?#].*)?$/.test(n) ? n : 'index.html'; // stay on this site
  }
  async function signIn(btn) {
    if (btn) btn.classList.add('busy');
    try {
      const f = F || await fb();
      const provider = new f.A.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      let cred;
      try { cred = await f.A.signInWithPopup(f.auth, provider); }
      catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') { await f.A.signInWithRedirect(f.auth, provider); return; }
        throw e;
      }
      session.set(fromUser(cred.user));
      location.replace(nextPage());
    } catch (e) {
      const c = e && e.code || '';
      if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') { /* user closed it */ }
      else if (c === 'auth/unauthorized-domain') toast('הכתובת הזו עוד לא מאושרת להתחברות עם Google. בינתיים אפשר להיכנס כאורח.', 'warn');
      else if (c === 'auth/network-request-failed' || !F) toast('אין חיבור לשירות ההתחברות. בדקו את האינטרנט, או היכנסו כאורח.', 'warn');
      else { toast('ההתחברות לא הצליחה. נסו שוב, או היכנסו כאורח.', 'warn'); console.error(e); }
    } finally { if (btn) btn.classList.remove('busy'); }
  }
  function guest() {
    session.set({ uid: 'guest', name: '', email: '', photo: '', guest: true, at: Date.now() });
    location.replace(nextPage());
  }
  async function signOut() {
    try { if (me && !me.guest) { const f = await fb(); await f.A.signOut(f.auth); } } catch { /* offline: still sign out here */ }
    session.clear();
    location.replace('login.html');
  }

  /* ---------------- opening screen ---------------- */
  function loginPage(root) {
    if (me) { location.replace(nextPage()); return; }
    fb().then((f) => f.A.getRedirectResult(f.auth)).then((r) => { if (r && r.user) { session.set(fromUser(r.user)); location.replace(nextPage()); } }).catch(() => { /* shown on click */ });
    $('[data-google]', root).addEventListener('click', (e) => signIn(e.currentTarget));
    $('[data-guest]', root).addEventListener('click', guest);
    S.owlLive($('[data-owl]', root));
  }

  /* ---------------- signed-in pages: verify quietly, show who is here ---------------- */
  function verify() {
    if (!me || me.guest) return;
    fb().then((f) => f.A.onAuthStateChanged(f.auth, (u) => {
      if (u) { const s = fromUser(u); if (s.name !== me.name || s.photo !== me.photo) session.set(s); return; }
      session.clear(); location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() || 'index.html'));
    })).catch(() => { /* offline: keep the local session */ });
  }

  function avatarHTML(size) {
    const n = firstName() || (me && me.guest ? 'אורח' : '');
    const letter = esc((n || '?').charAt(0));
    if (me && me.photo) return '<span class="me-av" style="--s:' + size + 'px"><img src="' + esc(me.photo) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()"><b>' + letter + '</b></span>';
    return '<span class="me-av" style="--s:' + size + 'px"><b>' + letter + '</b></span>';
  }

  function chip() {
    const end = $('.nav-end');
    if (!end || !me) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'me-chip'; b.setAttribute('data-me', '');
    b.setAttribute('aria-label', 'החשבון שלי ומה ששחר זוכר');
    b.innerHTML = avatarHTML(26) + '<span class="me-name">' + esc(firstName() || 'אורח') + '</span>';
    end.insertBefore(b, end.firstChild);
    b.addEventListener('click', openPanel);
  }

  function openPanel() {
    let d = $('#me-dlg');
    if (!d) {
      d = document.createElement('dialog');
      d.className = 'dlg me-dlg'; d.id = 'me-dlg'; d.setAttribute('aria-labelledby', 'me-h');
      document.body.appendChild(d);
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    }
    const notes = mem.notes();
    const panels = mem.providers.map((p) => { try { return p.panel ? p.panel() : ''; } catch { return ''; } }).join('');
    d.innerHTML = '<div class="dlg-in" data-lenis-prevent>' +
      '<div class="dlg-head"><h2 id="me-h">מה שחר זוכר</h2><button class="round-btn" type="button" data-close aria-label="סגירה">' + icon('x') + '</button></div>' +
      '<div class="me-who">' + avatarHTML(46) + '<div><b>' + esc(me.guest ? 'אורח' : (me.name || firstName())) + '</b><small>' + esc(me.guest ? 'בלי חשבון · הזיכרון נשמר במכשיר הזה בלבד' : (me.email ? me.email + ' · ' : '') + 'מחובר עם Google') + '</small></div></div>' +
      '<h3 class="me-h3">' + icon('brain') + 'דברים שביקשת שאזכור</h3>' +
      (notes.length ? '<ul class="me-notes">' + notes.map((n, i) => '<li><span>' + esc(n.t) + '</span><button type="button" data-del="' + i + '" aria-label="מחיקה">' + icon('x') + '</button></li>').join('') + '</ul>'
        : '<p class="me-empty">עוד אין כאן כלום. אפשר לכתוב לשחר "תזכור ש…", או להוסיף כאן.</p>') +
      '<form class="me-add" data-add><input name="t" maxlength="160" placeholder="למשל: אני לומדת חינוך, שנה ב׳" aria-label="משהו ששחר יזכור"><button class="btn btn-dark" type="submit">הוספה</button></form>' +
      panels +
      '<p class="me-fine">' + icon('lock') + 'הזיכרון נשמר במכשיר הזה, תחת ' + (me.guest ? 'כניסת האורח' : 'החשבון שלך') + '. השיחות עם המודל המקומי לא יוצאות מהמחשב.</p>' +
      '<div class="me-actions"><button class="btn btn-line" type="button" data-forget>' + icon('trash') + 'מחיקת הזיכרון</button><button class="btn btn-dark" type="button" data-signout>' + icon('logout') + (me.guest ? 'יציאה' : 'התנתקות') + '</button></div>' +
      '</div>';
    hydrateIcons(d);
    $('[data-close]', d).addEventListener('click', () => d.close());
    $$('[data-del]', d).forEach((b) => b.addEventListener('click', () => { mem.removeNote(+b.dataset.del); openPanel(); }));
    $('[data-add]', d).addEventListener('submit', (e) => { e.preventDefault(); if (mem.addNote(e.target.t.value)) { toast('אזכור את זה'); openPanel(); } });
    $('[data-forget]', d).addEventListener('click', () => {
      if (!confirm('למחוק את כל מה ששחר זוכר עליך? זה כולל את השיחות, ההערות וההתקדמות בקורסים, ואי אפשר לבטל.')) return;
      mem.forget(); d.close(); toast('הזיכרון נמחק'); setTimeout(() => location.reload(), 700);
    });
    $('[data-signout]', d).addEventListener('click', signOut);
    if (!d.open) d.showModal ? d.showModal() : d.setAttribute('open', '');
  }

  S.account = { me, uid, mem, firstName, learnFrom, profileText, signIn, signOut, guest, openPanel, avatarHTML };

  function boot() {
    const login = $('[data-login]');
    if (login) { loginPage(login); return; }
    chip();
    setTimeout(verify, 1200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
