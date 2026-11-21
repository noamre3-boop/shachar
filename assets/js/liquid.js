/* Liquid glass: real refraction of whatever is behind an element.
   Each glass element gets its own SVG filter: an edge-lens displacement map (bends the backdrop
   near the rim, like thick glass) mixed with a slow turbulence (the glass "breathes"), fed to
   feDisplacementMap through `backdrop-filter: url(#…)`. Chromium renders this; other browsers
   keep the frosted blur fallback. Distortion swells with scroll speed and settles back. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  let defs = null, n = 0;
  function svgRoot() {
    if (defs) return defs;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    defs = document.createElementNS(NS, 'defs'); svg.appendChild(defs); document.body.appendChild(svg);
    return defs;
  }
  const isChromium = !!(window.chrome || /Chrome|Chromium|Edg\//.test(navigator.userAgent)) && !/Firefox/.test(navigator.userAgent);

  // Edge-lens map: R/G encode an inward pull near the rounded-rect rim (0.5 = no shift).
  function edgeMap(w, h, radius, band) {
    const s = 0.5, W = Math.max(2, Math.round(w * s)), H = Math.max(2, Math.round(h * s));
    const r = radius * s, b = Math.max(2, band * s);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); const img = g.createImageData(W, H); const d = img.data;
    const hx = W / 2, hy = H / 2;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const px = x + .5 - hx, py = y + .5 - hy;
        const qx = Math.abs(px) - (hx - r), qy = Math.abs(py) - (hy - r);
        const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
        const sdf = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r; // <0 inside
        let nx = 0, ny = 0;
        if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy) || 1; nx = qx / l * Math.sign(px); ny = qy / l * Math.sign(py); }
        else if (qx > qy) nx = Math.sign(px); else ny = Math.sign(py);
        const inD = -sdf;
        let m = 0;
        if (inD >= 0 && inD < b) { const t = 1 - inD / b; m = t * t * (3 - 2 * t); }
        const i = (y * W + x) * 4;
        d[i] = 128 - nx * m * 127; d[i + 1] = 128 - ny * m * 127; d[i + 2] = 128; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  function make(el, opts) {
    const o = Object.assign({ radius: 28, band: 46, scale: 70, ripple: .22, blur: 10, saturate: 175, freq: .0065 }, opts || {});
    const id = 'lg-' + (++n);
    const f = document.createElementNS(NS, 'filter');
    f.setAttribute('id', id); f.setAttribute('x', '0'); f.setAttribute('y', '0'); f.setAttribute('width', '100%'); f.setAttribute('height', '100%');
    f.setAttribute('filterUnits', 'userSpaceOnUse'); f.setAttribute('primitiveUnits', 'userSpaceOnUse'); f.setAttribute('color-interpolation-filters', 'sRGB');
    f.innerHTML =
      '<feImage result="map" x="0" y="0" preserveAspectRatio="none"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + o.freq + ' ' + (o.freq * 1.4) + '" numOctaves="2" seed="' + (n * 7) + '" result="noise"/>' +
      '<feComposite in="map" in2="noise" operator="arithmetic" k1="0" k2="1" k3="' + o.ripple + '" k4="' + (-o.ripple / 2) + '" result="mix"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="mix" scale="' + o.scale + '" xChannelSelector="R" yChannelSelector="G"/>';
    svgRoot().appendChild(f);
    const feImg = f.querySelector('feImage'), turb = f.querySelector('feTurbulence'), disp = f.querySelector('feDisplacementMap');
    function rebuild() {
      const w = el.offsetWidth, h = el.offsetHeight;
      if (!w || !h) return;
      f.setAttribute('width', w); f.setAttribute('height', h);
      feImg.setAttribute('width', w); feImg.setAttribute('height', h);
      feImg.setAttribute('href', edgeMap(w, h, Math.min(o.radius, w / 2, h / 2), o.band));
    }
    rebuild();
    new ResizeObserver(rebuild).observe(el);
    const fallback = 'blur(' + (o.blur + 6) + 'px) saturate(' + o.saturate + '%)';
    const fancy = 'url(#' + id + ') blur(' + o.blur + 'px) saturate(' + o.saturate + '%)';
    let ok = false;
    if (isChromium) {
      el.style.backdropFilter = fancy; el.style.webkitBackdropFilter = fancy;
      ok = /url\(/.test(getComputedStyle(el).backdropFilter || '');
    }
    if (!ok) { el.style.backdropFilter = fallback; el.style.webkitBackdropFilter = fallback; }
    el.classList.add(ok ? 'lg-live' : 'lg-flat');
    return { el, id, ok, disp, turb, base: o.scale, freq: o.freq, boost: 0 };
  }

  const items = [];
  let last = performance.now(), phase = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (document.hidden || !items.length) return;
    phase += dt;
    const off = document.documentElement.classList.contains('motion-off');
    items.forEach((it) => {
      if (!it.ok) return;
      it.boost *= Math.pow(.04, dt);                       // settle back after a scroll
      const breathe = off ? 0 : Math.sin(phase * .9 + it.base) * 6;
      it.disp.setAttribute('scale', (it.base + breathe + it.boost).toFixed(1));
      if (!off) {
        const f = it.freq * (1 + .08 * Math.sin(phase * .35 + it.base));
        it.turb.setAttribute('baseFrequency', f.toFixed(5) + ' ' + (f * 1.4).toFixed(5));
      }
    });
  }
  requestAnimationFrame(tick);

  window.Liquid = {
    attach(el, opts) { const it = make(el, opts); items.push(it); return it; },
    /** feed scroll velocity (px per frame) from any scroller */
    kick(v, only) { (only || items).forEach((it) => { it.boost = Math.min(it.base * 1.6, it.boost + Math.abs(v) * 2.2); }); },
    items,
  };
})();
