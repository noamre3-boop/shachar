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

  // a profile photo that fails to load falls back to the letter under it
  document.addEventListener('error', (e) => { if (e.target && e.target.matches && e.target.matches('img[data-fallback]')) e.target.remove(); }, true);

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
    if (me && me.photo) return '<span class="me-av" style="--s:' + size + 'px"><img src="' + esc(me.photo) + '" alt="" referrerpolicy="no-referrer" data-fallback><b>' + letter + '</b></span>';
    return '<span class="me-av" style="--s:' + size + 'px"><b>' + letter + '</b></span>';
  }

  /* ---------------- Shachar's outfit: picked in Settings, worn wherever he talks to you ---------------- */
  const OUTFITS = {
    classic: { t: 'קלאסי', body: 'assets/img/owl-noeyes.webp', face: 'assets/img/owl-face.webp' },
    coat: { t: 'מעיל', body: 'assets/img/shachar-coat.webp', face: 'assets/img/shachar-coat-face.webp' },
    sweater: { t: 'סוודר', body: 'assets/img/shachar-sweater.webp', face: 'assets/img/shachar-sweater-face.webp' },
    headset: { t: 'אוזניות', body: 'assets/img/shachar-headset.webp', face: 'assets/img/shachar-headset-face.webp' },
  };
  const outfit = () => { const k = mem.get('outfit', 'classic'); return OUTFITS[k] ? k : 'classic'; };
  const faceSrc = () => OUTFITS[outfit()].face;
  // a live owl in an outfit (eye spots per outfit come from the CSS); without `fit` it follows the user's choice
  function owlHTML(cls, attrs, fit) {
    const k = fit || outfit();
    return '<div class="owl-live ' + (cls || '') + '" data-fit="' + k + '"' + (fit ? '' : ' data-dress') + (attrs ? ' ' + attrs : '') + '><div class="owl-tilt">' +
      '<img class="owl-body" src="' + OUTFITS[k].body + '" alt=""><span class="owl-eye" style="--x:40%"></span><span class="owl-eye" style="--x:59.9%"></span><span class="owl-sheen"></span></div></div>';
  }
  // put the chosen outfit on every owl and avatar marked data-dress
  function dress(root) {
    const k = outfit(), o = OUTFITS[k];
    $$('[data-dress]', root || document).forEach((el) => {
      if (el.tagName === 'IMG') { if (el.getAttribute('src') !== o.face) el.setAttribute('src', o.face); return; }
      el.dataset.fit = k;
      const img = $('.owl-body', el);
      if (img && img.getAttribute('src') !== o.body) img.setAttribute('src', o.body);
    });
  }

  function chip() {
    const end = $('.nav-end');
    if (!end || !me) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'me-chip'; b.setAttribute('data-me', '');
    b.setAttribute('aria-label', 'הגדרות');
    b.innerHTML = avatarHTML(26) + '<span class="me-name">' + esc(firstName() || 'אורח') + '</span>';
    end.insertBefore(b, end.firstChild);
    b.addEventListener('click', openPanel);
  }

  /* ---------------- Settings: Shachar's outfit, sounds and motion, how to address you, the memory ---------------- */
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
    const cur = outfit();
    const sw = (k, on, t, sub) => '<button type="button" class="set-row" role="switch" data-sw="' + k + '" aria-checked="' + on + '"><span><b>' + t + '</b><small>' + sub + '</small></span><i class="sw-ui" aria-hidden="true"></i></button>';
    const keep = d.querySelector('.dlg-in') ? d.querySelector('.dlg-in').scrollTop : 0;
    d.innerHTML = '<div class="dlg-in" data-lenis-prevent>' +
      '<div class="dlg-head"><h2 id="me-h">הגדרות</h2><button class="round-btn" type="button" data-close aria-label="סגירה">' + icon('x') + '</button></div>' +
      '<div class="me-who">' + avatarHTML(46) + '<div><b>' + esc(me.guest ? (firstName() || 'אורח') : (me.name || firstName())) + '</b><small>' + esc(me.guest ? 'בלי חשבון · הזיכרון נשמר במכשיר הזה בלבד' : (me.email ? me.email + ' · ' : '') + 'מחובר עם Google') + '</small></div></div>' +
      '<h3 class="me-h3">' + icon('palette') + 'העיצוב של שחר</h3>' +
      '<div class="fit-grid">' + Object.keys(OUTFITS).map((k) => '<button type="button" class="fit" data-pick="' + k + '" aria-pressed="' + (k === cur) + '">' + owlHTML('fit-owl', 'aria-hidden="true"', k) + '<span>' + OUTFITS[k].t + '</span></button>').join('') + '</div>' +
      '<h3 class="me-h3">' + icon('sound') + 'צלילים ותנועה</h3>' +
      '<div class="set-list">' +
        sw('sound', mem.get('sound', true) !== false, 'צלילים בתרגול', 'צליל קצר על תשובה נכונה או שגויה') +
        sw('motion', !S.reduced(), 'אנימציות', 'שחר זז, ממצמץ ומגיב לתשובות') +
      '</div>' +
      '<h3 class="me-h3">' + icon('smile') + 'איך לפנות אליך</h3>' +
      '<div class="me-addr" data-addr>' + [['f', 'בלשון נקבה'], ['m', 'בלשון זכר'], ['n', 'בלי מגדר']].map(([k, t]) => '<button type="button" data-a="' + k + '" aria-pressed="' + (mem.get('addr', 'n') === k) + '">' + t + '</button>').join('') + '</div>' +
      '<h3 class="me-h3">' + icon('brain') + 'הזיכרון שלי</h3>' +
      (notes.length ? '<ul class="me-notes">' + notes.map((n, i) => '<li><span>' + esc(n.t) + '</span><button type="button" data-del="' + i + '" aria-label="מחיקה">' + icon('x') + '</button></li>').join('') + '</ul>'
        : '<p class="me-empty">עוד אין כאן כלום. אפשר לכתוב לשחר "תזכור ש…", או להוסיף כאן.</p>') +
      '<form class="me-add" data-add><input name="t" maxlength="160" placeholder="למשל: אני לומדת חינוך, שנה ב׳" aria-label="משהו ששחר יזכור"><button class="btn btn-dark" type="submit">הוספה</button></form>' +
      panels +
      '<p class="me-fine">' + icon('lock') + 'הזיכרון וההגדרות נשמרים במכשיר הזה, תחת ' + (me.guest ? 'כניסת האורח' : 'החשבון שלך') + '.</p>' +
      '<div class="me-actions"><button class="btn btn-line" type="button" data-forget>' + icon('trash') + 'מחיקת הזיכרון</button><button class="btn btn-dark" type="button" data-signout>' + icon('logout') + (me.guest ? 'יציאה' : 'התנתקות') + '</button></div>' +
      '</div>';
    hydrateIcons(d);
    d.querySelector('.dlg-in').scrollTop = keep;
    $('[data-close]', d).addEventListener('click', () => d.close());
    $$('[data-pick]', d).forEach((b) => b.addEventListener('click', () => {
      mem.set('outfit', b.dataset.pick); dress();
      $$('[data-pick]', d).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const o = $('.owl-live', b); o.classList.remove('hop'); void o.offsetWidth; o.classList.add('hop');
      $$('.owl-live[data-dress]').forEach((x) => { x.classList.remove('hop'); void x.offsetWidth; x.classList.add('hop'); });
      if (S.sfx) S.sfx('tap');
    }));
    $$('[data-sw]', d).forEach((b) => b.addEventListener('click', () => {
      const on = b.getAttribute('aria-checked') !== 'true';
      b.setAttribute('aria-checked', String(on));
      if (b.dataset.sw === 'sound') { mem.set('sound', on); if (on && S.sfx) S.sfx('ok'); }
      if (b.dataset.sw === 'motion') { document.documentElement.classList.toggle('motion-off', !on); store.set('motion', on ? 'on' : 'off'); }
    }));
    $$('[data-del]', d).forEach((b) => b.addEventListener('click', () => { mem.removeNote(+b.dataset.del); openPanel(); }));
    $$('[data-addr] [data-a]', d).forEach((b) => b.addEventListener('click', () => { mem.set('addr', b.dataset.a); mem.set('addrAuto', false); openPanel(); toast('מעכשיו כך אפנה אליך'); }));
    $('[data-add]', d).addEventListener('submit', (e) => { e.preventDefault(); if (mem.addNote(e.target.t.value)) { toast('אזכור את זה'); openPanel(); } });
    $('[data-forget]', d).addEventListener('click', () => {
      if (!confirm('למחוק את כל מה ששחר זוכר עליך? זה כולל את השיחות, ההערות וההתקדמות בקורסים, ואי אפשר לבטל.')) return;
      mem.forget(); d.close(); toast('הזיכרון נמחק'); setTimeout(() => location.reload(), 700);
    });
    $('[data-signout]', d).addEventListener('click', signOut);
    if (!d.open) d.showModal ? d.showModal() : d.setAttribute('open', '');
  }

  /* Hebrew is gendered. Without asking, the form of address is guessed from a clearly gendered first name;
     unisex or unknown names stay neutral. It can always be changed in "מה שחר זוכר". */
  const NAMES_F = ('נועה מאיה תמר שירה יעל מיכל דנה הילה שני אביגיל רחל שרה רבקה לאה אסתר חנה אורית מירב מיטל ענבל ענבר קרן גלית הדס אפרת יפעת לימור ליאת לילך נטע נעמה עינב שירן שלי תהל אלמה ליבי סיון סיוון אדל אלינור אלונה אורטל הגר הודיה טליה יהודית לינוי ליהי ליה מרים נגה נוגה נטלי סופיה ענת פזית קורל רינה רות שושנה תהילה תמי אנה מרינה אולגה לנה יוליה ' +
    'noa maya maia tamar shira yael michal dana hila shani avigail abigail rachel sarah sara rivka leah esther hannah hana orit merav meital inbal inbar keren galit hadas efrat yifat limor liat lilach neta naama einav shiran shelly shelli tahel alma libi sivan adel elinor alona ortal hagar hodaya talia yehudit linoy lihi lia miriam noga natali natalie sofia anat pazit coral rina ruth tehila tami anna marina olga lena julia yulia maria emma olivia sophia mia ella').split(' ');
  const NAMES_M = ('יוסי יוסף משה דוד אברהם יצחק יעקב אלי איתי איתן עידו עומר אורי גיא יונתן נתנאל אריה רון ניר אלון ערן עמרי יואב אסף תומר רועי עוז אוריאל אליאב בן חיים יאיר יהונתן מתן נדב שלמה אלעד בועז גלעד דביר הראל ליאם מיכאל אוהד אייל איל דן דניאל אמיר אבי שמעון ראובן לוי יהודה בנימין אהרון זאב מאיר שמואל גבריאל רפאל ירון עופר עמוס עזרא רמי קובי שגיא אביתר ' +
    'yossi yosef joseph moshe david avraham avi itzik yitzhak yaakov jacob eli itai itay eitan ethan ido omer uri guy yonatan jonathan netanel ron nir alon eran omri yoav asaf assaf tomer roi oz ben haim chaim yair matan nadav shlomo elad boaz gilad dvir harel liam michael ohad eyal dan daniel amir shimon reuven levi yehuda benjamin aharon aaron zeev meir shmuel gabriel rafael yaron ofer amos ezra rami kobi sagi evyatar john james mark peter paul alex alexander ivan').split(' ');
  function guessAddr(n) {
    n = String(n || '').trim().toLowerCase();
    return NAMES_F.includes(n) ? 'f' : NAMES_M.includes(n) ? 'm' : 'n';
  }
  if (me && !mem.get('addr', '')) { mem.set('addr', me.guest ? 'n' : guessAddr(firstName())); mem.set('addrAuto', true); }

  S.account = { me, uid, mem, firstName, learnFrom, profileText, signIn, signOut, guest, openPanel, avatarHTML, guessAddr, OUTFITS, outfit, faceSrc, owlHTML, dress };

  function boot() {
    const login = $('[data-login]');
    if (login) { loginPage(login); return; }
    dress();
    chip();
    setTimeout(verify, 1200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
