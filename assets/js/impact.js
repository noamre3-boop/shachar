/* מחשבון ההשפעה — ROI over time, initiatives, maturity. Figures follow the CDAIO thesis (Finance division, 2026–27). */
(function () {
  'use strict';
  const { $, $$, esc, icon, hydrateIcons, toast, store, fmt } = window.Shachar;

  const BASE = { cohort: 700, base: 10, target: 5, years: 3, income: 35000, coef: 84.8 };
  const COEF_BASE = 83.1, COEF_CAP = 85, GAP_VALUE = 1128000; // 1.9 points = 30 students = ₪1.128M a year
  const SL = [
    { k: 'cohort', label: 'גודל מחזור שנה א\'', min: 300, max: 1200, step: 10, f: (v) => fmt.int(v), note: 'סטודנטים חדשים בכל שנה' },
    { k: 'base', label: 'נשירה בשנה א\' היום', min: 6, max: 16, step: .5, f: (v) => v + '%', note: 'לעומת כ-5% בשנים המתקדמות' },
    { k: 'target', label: 'נשירה בשנה א\' עם שחר', min: 2, max: 10, step: .5, f: (v) => v + '%', note: 'יעד העבודה: 5%' },
    { k: 'years', label: 'שנות תואר שנשמרות', min: 1, max: 4, step: 1, f: (v) => v, note: 'סטודנט שנושר בשנה א\' מאבד 3–4 שנות הכנסה' },
    { k: 'income', label: 'הכנסה נטו לשנת לימודים', min: 20000, max: 50000, step: 1000, f: (v) => fmt.ils(v), note: 'שכר לימוד ותקצוב, לפי תחשיב תשפ״ז' },
    { k: 'coef', label: 'מקדם סיום בזמן (יעד)', min: 83.1, max: 85, step: .1, f: (v) => (+v).toFixed(1) + '%', note: 'היום 83.1%, תקרת ות״ת 85%' },
  ];
  const INITS = [
    { rank: 1, name: 'שכבת נתונים מוסדית ראשונית', cat: 'Infrastructure', desc: 'איחוד נתונים ממערכות הליבה לטובת אנליטיקה, בקרה ופיתוח מודלים, כתשתית רחבה לכל השאר.', budget: 180000, v: 5, f: 4, r: 2, tag: 'תשתית חובה', gate: 'חיבור 3 מערכות ליבה (מכלול, Moodle, Priority) · Q2 2027', status: 'בתכנון', req: true },
    { rank: 2, name: 'מילון מונחים וקטלוג נכסי מידע', cat: 'Governance', desc: 'הגדרות מוסכמות, בעלויות מידע, מיפוי מקורות, כללי איכות והרשאות.', budget: 45000, v: 4, f: 5, r: 1, tag: 'תנאי סף', gate: 'אישור 15 מדדי ליבה בפורום המשילות · Q1 2027', status: 'להתחלה מיידית', req: true },
    { rank: 3, name: 'דשבורד התמדה, נשירה וסיום בזמן', cat: 'BI', desc: 'כלי ניהולי שמציג מגמות, סיכונים, התראות וכדאיות כלכלית של התערבות.', budget: 35000, v: 5, f: 4, r: 2, tag: 'Quick win', gate: 'MVP על בסיס 5 רישיונות Power BI הקיימים · Q2 2027', status: 'בתכנון' },
    { rank: 4, name: 'מודל חיזוי נשירה וגרירת תואר', cat: 'Business / AI', desc: 'זיהוי מוקדם של סטודנטים בסיכון לנשירה או לחריגה ממשך הלימודים התקני. הלב של שחר.', budget: 120000, v: 5, f: 3, r: 3, tag: 'יוזמת העוגן', gate: 'מודל מאומת על נתוני עבר (Recall מעל 70%) · Q3 2027', status: 'בתכנון', anchor: true, req: true },
    { rank: 5, name: 'אוריינות AI לסגל ולסטודנטים', cat: 'Literacy', desc: 'קהילת סגל לקידום אוריינות AI ולמידת עמיתים, לצד הכשרות לסטודנטים ב-AI Hub.', budget: 50000, v: 4, f: 4, r: 1, tag: 'ליווי שוטף', gate: 'מחזור א\' של שגרירי דאטה ופתיחת ה-AI Hub · Q2 2027', status: 'מאושר בתוכנית האסטרטגית' },
    { rank: 6, name: 'סוכן שירות חכם לסטודנט (RAG)', cat: 'Service / GenAI', desc: 'מענה אוטומטי לשאלות מנהליות ואקדמיות נפוצות על בסיס תקנונים ומידע מוסדי.', budget: 60000, v: 4, f: 3, r: 2, tag: 'פיילוט מבוקר', gate: 'פיילוט על תקנונים פומביים בלבד ב-AI Hub · Q3 2027', status: 'רעיון להמשך' },
    { rank: 7, name: 'Next Best Offer לסטודנטים', cat: 'Process / AI', desc: 'הצעת מסלול חלופי בתוך המכללה לסטודנט שהמסלול הנוכחי לא מתאים לו, עם הכרה מרבית בנקודות זכות.', budget: 40000, v: 4, f: 2, r: 3, tag: 'שלב ב\'', gate: 'אפיון אקדמי אחרי פיילוט ההתערבות · Q4 2027', status: 'רעיון עסקי' },
  ];
  const MAT = [
    { label: 'אסטרטגיה, משילות ובעלות מידע', a: 1.5, b: 3.5, w: .20 },
    { label: 'נתונים, ארכיטקטורה ואינטגרציה', a: 1.5, b: 3.5, w: .25 },
    { label: 'אנליטיקה, BI ו-AI', a: 1, b: 3, w: .20 },
    { label: 'אנשים, אוריינות ותרבות', a: 2, b: 3.5, w: .15 },
    { label: 'תהליכים, תפעול ואבטחה', a: 2, b: 3.25, w: .20 },
  ];
  const MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
  const mLabel = (i) => MONTHS[i % 12] + ' ' + String(27 + Math.floor(i / 12));
  const PILOT = 9; // October 2027 (Jan 2027 = 0)
  const SPAN = 36;

  let P = Object.assign({}, BASE, store.get('impact', {}));
  let on = store.get('impact-inits', null) || INITS.map(() => true);
  const score = (x) => Math.round((.5 * x.v + .35 * x.f - .15 * x.r) * 100) / 100;

  function model() {
    const retained = Math.max(0, P.cohort * (P.base - P.target) / 100);
    const lifetime = retained * P.income * P.years;
    const coefGain = Math.max(0, Math.min(COEF_CAP, P.coef) - COEF_BASE);
    const vatat = coefGain / (COEF_CAP - COEF_BASE) * GAP_VALUE;
    const invest = INITS.reduce((a, x, i) => a + (on[i] ? x.budget : 0), 0);
    const cum = [];
    let c = 0;
    for (let m = 0; m < SPAN; m++) {
      let flow = 0;
      for (let k = 0; PILOT + 12 * k <= m; k++) {           // each cohort from the pilot onwards
        const age = m - (PILOT + 12 * k);
        if (age < P.years * 12) flow += retained * P.income / 12;
      }
      if (m >= PILOT + 12) flow += vatat / 12;               // on-time completion effect a year later
      c += flow; cum.push(c);
    }
    let pay = cum.findIndex((v) => v >= invest);
    return { retained, lifetime, vatat, invest, cum, pay };
  }

  /* ---------------- sliders ---------------- */
  function sliders() {
    $('[data-sliders]').innerHTML = SL.map((s) => '<div class="sl"><label for="sl-' + s.k + '"><span>' + esc(s.label) + '</span><output data-o="' + s.k + '">' + s.f(P[s.k]) + '</output></label>' +
      '<input id="sl-' + s.k + '" type="range" min="' + s.min + '" max="' + s.max + '" step="' + s.step + '" value="' + P[s.k] + '" data-k="' + s.k + '"><small>' + esc(s.note) + '</small></div>').join('');
    $('[data-sliders]').oninput = ((e) => {
      const k = e.target.dataset.k; if (!k) return;
      P[k] = +e.target.value;
      if (k === 'target' && P.target > P.base) { P.target = P.base; e.target.value = P.base; }
      $('[data-o="' + k + '"]').textContent = SL.find((s) => s.k === k).f(P[k]);
      store.set('impact', P); update();
    });
  }

  /* ---------------- KPIs + chart ---------------- */
  function update() {
    const m = model();
    const payTxt = m.pay < 0 ? 'אחרי 2029' : mLabel(m.pay) + ' · ' + (m.pay - PILOT + 1) + ' ח׳ מהפיילוט';
    $('[data-ikpis]').innerHTML = [
      ['סטודנטים שנשמרים בכל מחזור', fmt.int(Math.round(m.retained)), 'מתוך ' + fmt.int(P.cohort)],
      ['ערך לאורך התואר', fmt.ilsM(m.lifetime), 'לכל מחזור'],
      ['תקצוב ות״ת בשנה', fmt.ilsM(m.vatat), 'משיפור מקדם הסיום'],
      ['החזר ההשקעה', m.pay < 0 ? '—' : mLabel(m.pay), m.pay < 0 ? 'לא בתוך 36 חודשים' : (m.pay - PILOT + 1) + ' חודשים מהפיילוט'],
    ].map(([a, b, c]) => '<div class="kpi"><small>' + a + '</small><b>' + b + '</b><span>' + c + '</span></div>').join('');
    $('[data-budget]').textContent = 'השקעה כוללת: ' + fmt.ils(m.invest);
    $('[data-explain]').textContent = 'בסיס: נשירה של ' + P.base + '% ומקדם ' + COEF_BASE + '%. פער של 1.9 נקודות במקדם שווה 30 סטודנטים ו-' + fmt.ils(GAP_VALUE) + ' בשנה. ההחזר: ' + payTxt + '.';
    chart(m);
    window.__impact = m;
  }

  function chart(m) {
    const host = $('[data-chart]');
    const w = 640, h = 280, pl = 16, pr = 58, pt = 18, pb = 30;
    const top = Math.max(m.invest * 1.25, m.cum[SPAN - 1] * 1.05, 1);
    const step = top > 6e6 ? 2e6 : top > 3e6 ? 1e6 : top > 1.2e6 ? 5e5 : 2.5e5;
    const ymax = Math.ceil(top / step) * step;
    // RTL reading: time runs right-to-left so the newest month sits at the left edge
    const X = (i) => w - pr - i * ((w - pl - pr) / (SPAN - 1));
    const Y = (v) => pt + (1 - v / ymax) * (h - pt - pb);
    let g = '';
    for (let v = 0; v <= ymax + 1; v += step) g += '<line class="gridline" x1="' + pl + '" x2="' + (w - pr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text class="axis-t" x="' + (w - pr + 10) + '" y="' + (Y(v) + 4) + '" text-anchor="start">' + (v === 0 ? '0' : '₪' + (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + 'M') + '</text>';
    for (let i = 0; i < SPAN; i += 6) g += '<text class="axis-t" x="' + X(i) + '" y="' + (h - 8) + '" text-anchor="middle">' + mLabel(i) + '</text>';
    const pilotX = X(PILOT);
    g += '<line x1="' + pilotX + '" x2="' + pilotX + '" y1="' + pt + '" y2="' + (h - pb) + '" stroke="rgba(0,0,0,.18)" stroke-width="1"/><text class="axis-t" x="' + (pilotX - 6) + '" y="' + (pt + 10) + '" text-anchor="end">פיילוט</text>';
    const line = 'M' + m.cum.map((v, i) => X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' L');
    const area = line + ' L' + X(SPAN - 1) + ' ' + Y(0) + ' L' + X(0) + ' ' + Y(0) + ' Z';
    const inv = '<line x1="' + pl + '" x2="' + (w - pr) + '" y1="' + Y(m.invest) + '" y2="' + Y(m.invest) + '" stroke="#111" stroke-width="1.5" stroke-dasharray="5 5"/>' +
      '<text class="lbl-t" x="' + pl + '" y="' + (Y(m.invest) - 7) + '" text-anchor="start">השקעה ' + fmt.ils(m.invest) + '</text>';
    const pay = m.pay >= 0 ? '<circle cx="' + X(m.pay) + '" cy="' + Y(m.cum[m.pay]) + '" r="6" fill="#111" stroke="#fff" stroke-width="2"/><text class="lbl-t" x="' + X(m.pay) + '" y="' + (Y(m.cum[m.pay]) + 22) + '" text-anchor="middle">החזר: ' + mLabel(m.pay) + '</text>' : '';
    const endLbl = '<text class="lbl-t" x="' + (X(SPAN - 1) + 4) + '" y="' + (Y(m.cum[SPAN - 1]) - 10) + '" text-anchor="start">' + fmt.ilsM(m.cum[SPAN - 1]) + '</text>';
    const hits = m.cum.map((v, i) => '<rect data-i="' + i + '" x="' + (X(i) - (w - pl - pr) / (SPAN - 1) / 2) + '" y="' + pt + '" width="' + ((w - pl - pr) / (SPAN - 1)) + '" height="' + (h - pt - pb) + '" fill="transparent"/>').join('');
    host.innerHTML = '<svg style="direction:ltr" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="ערך מצטבר מול השקעה לאורך 36 חודשים. נקודת ההחזר: ' + (m.pay >= 0 ? mLabel(m.pay) : 'לא בטווח') + '">' + g +
      '<path d="' + area + '" fill="var(--series-1)" opacity=".08"/>' + inv + '<path d="' + line + '" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round"/>' + pay + endLbl +
      '<line data-x x1="0" x2="0" y1="' + pt + '" y2="' + (h - pb) + '" stroke="#111" stroke-width="1" opacity="0"/><circle data-dot r="5" fill="var(--series-1)" stroke="#fff" stroke-width="2" opacity="0"/>' + hits + '</svg><div class="chart-tip"></div>';
    const svg = $('svg', host), tip = $('.chart-tip', host), xl = $('[data-x]', svg), dot = $('[data-dot]', svg);
    svg.addEventListener('pointermove', (e) => {
      const r = e.target.closest('rect[data-i]');
      if (!r) return;
      const i = +r.dataset.i, b = svg.getBoundingClientRect(), sx = b.width / w;
      xl.setAttribute('x1', X(i)); xl.setAttribute('x2', X(i)); xl.setAttribute('opacity', '.25');
      dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y(m.cum[i])); dot.setAttribute('opacity', '1');
      tip.style.left = X(i) * sx + 'px'; tip.style.top = Y(m.cum[i]) * sx + 'px';
      tip.innerHTML = mLabel(i) + ' · ' + fmt.ils(m.cum[i]) + (m.cum[i] >= m.invest ? ' · מעל ההשקעה' : '');
      tip.classList.add('on');
    });
    svg.addEventListener('pointerleave', () => { tip.classList.remove('on'); xl.setAttribute('opacity', '0'); dot.setAttribute('opacity', '0'); });
  }

  /* ---------------- initiatives ---------------- */
  function inits() {
    const host = $('[data-inits]');
    host.innerHTML = INITS.map((x, i) => '<article class="init' + (x.anchor ? ' anchor' : '') + (on[i] ? '' : ' off') + '">' +
      '<label class="switch" title="' + (x.req ? 'תנאי הכרחי לשחר' : 'כולל בתקציב') + '"><input type="checkbox" data-i="' + i + '"' + (on[i] ? ' checked' : '') + (x.req ? ' disabled' : '') + ' aria-label="לכלול את ' + esc(x.name) + ' בתקציב"><span></span></label>' +
      '<div class="meta"><span class="tag">#' + x.rank + '</span><span class="tag">' + esc(x.cat) + '</span><span class="tag' + (x.anchor ? ' ok' : '') + '">' + esc(x.tag) + '</span></div>' +
      '<h4>' + esc(x.name) + '</h4><p>' + esc(x.desc) + '</p>' +
      '<div class="meta"><span class="tag">' + fmt.ils(x.budget) + '</span><span class="tag">ציון ' + score(x).toFixed(2) + '</span><span class="tag">ערך ' + x.v + ' · ישימות ' + x.f + ' · סיכון ' + x.r + '</span></div>' +
      '<div class="gate">שער החלטה: ' + esc(x.gate) + '<br>סטטוס: ' + esc(x.status) + '</div></article>').join('');
    host.onchange = (e) => {
      const i = e.target.dataset.i; if (i == null) return;
      on[+i] = e.target.checked; store.set('impact-inits', on);
      e.target.closest('.init').classList.toggle('off', !on[+i]);
      update();
    };
  }

  /* ---------------- maturity ---------------- */
  function maturity() {
    const pos = (v) => ((v - 1) / 4 * 100);
    const wa = MAT.reduce((s, x) => s + x.a * x.w, 0), wb = MAT.reduce((s, x) => s + x.b * x.w, 0);
    $('[data-mat]').innerHTML = MAT.map((x) => '<div class="mat-row"><div>' + esc(x.label) + '<small>משקל ' + Math.round(x.w * 100) + '%</small></div>' +
      '<div class="mat-track" role="img" aria-label="' + esc(x.label) + ': היום ' + x.a + ', יעד 2028 ' + x.b + '"><span class="rail"></span><span class="gap" style="right:' + pos(x.a) + '%;width:' + (pos(x.b) - pos(x.a)) + '%"></span>' +
      '<span class="pt" style="right:' + pos(x.a) + '%;background:var(--series-1)" title="היום ' + x.a + '"><span>' + x.a + '</span></span>' +
      '<span class="pt" style="right:' + pos(x.b) + '%;background:var(--series-2)" title="יעד 2028 ' + x.b + '"><span>' + x.b + '</span></span></div></div>').join('') +
      '<div class="mat-row" style="border:0"><div><b>ציון משוקלל</b></div><div class="mat-track"><span class="rail"></span><span class="gap" style="right:' + pos(wa) + '%;width:' + (pos(wb) - pos(wa)) + '%"></span>' +
      '<span class="pt" style="right:' + pos(wa) + '%;background:var(--series-1)"><span>' + wa.toFixed(2) + '</span></span><span class="pt" style="right:' + pos(wb) + '%;background:var(--series-2)"><span>' + wb.toFixed(2) + '</span></span></div></div>';
  }

  /* ---------------- summary ---------------- */
  function summary() {
    const m = model();
    const sel = INITS.filter((_, i) => on[i]);
    return [
      'שחר · סיכום השפעה להנהלה',
      '',
      'הנחות: מחזור שנה א\' של ' + fmt.int(P.cohort) + ' סטודנטים, נשירה של ' + P.base + '% היום ויעד של ' + P.target + '% עם שחר, ' + P.years + ' שנות תואר שנשמרות, הכנסה נטו של ' + fmt.ils(P.income) + ' לשנת לימודים, ומקדם סיום בזמן ' + (+P.coef).toFixed(1) + '%.',
      '',
      '• סטודנטים שנשמרים בכל מחזור: ' + Math.round(m.retained),
      '• ערך לאורך התואר, לכל מחזור: ' + fmt.ils(m.lifetime),
      '• תקצוב ות״ת נוסף בשנה: ' + fmt.ils(m.vatat),
      '• השקעה כוללת (' + sel.length + ' יוזמות): ' + fmt.ils(m.invest),
      '• החזר ההשקעה: ' + (m.pay < 0 ? 'לא בתוך 36 חודשים' : mLabel(m.pay) + ', ' + (m.pay - PILOT + 1) + ' חודשים מפתיחת הפיילוט באוקטובר 2027'),
      '',
      'היוזמות בתקציב: ' + sel.map((x) => x.name).join('; ') + '.',
      'בשלות Data & AI: 1.58 היום, יעד 3.35 ב-2028.',
      '',
      'המקור: עבודת CDAIO (אוקטובר 2026). החישוב נעשה במחשבון ההשפעה של שחר.',
    ].join('\n');
  }
  const dlg = $('#sum');
  $('[data-summary]').addEventListener('click', () => { $('[data-sum-text]').textContent = summary(); dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', ''); });
  $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  $('[data-copy-sum]').addEventListener('click', async () => { try { await navigator.clipboard.writeText(summary()); toast('הסיכום הועתק'); } catch { toast('לא הצלחתי להעתיק', 'warn'); } });
  $('[data-print]').addEventListener('click', () => { dlg.close(); setTimeout(() => window.print(), 100); });
  $('[data-reset]').addEventListener('click', () => { P = Object.assign({}, BASE); on = INITS.map(() => true); store.set('impact', null); store.set('impact-inits', null); $('[data-sliders]').innerHTML = ''; sliders(); inits(); update(); });

  sliders(); inits(); maturity(); update(); hydrateIcons();
})();
