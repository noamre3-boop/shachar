/* Sign-in screen.
   - the form: a soft light follows the mouse, the Google button leans toward it
   - the scene: Shachar stands on a glossy floor. His reflection is drawn live (eyes and blinks included),
     and the floor behaves like water: moving the mouse over it, or tapping it, sends out ripples
     that bend the reflection and catch the light. A small wave simulation on the CPU, drawn with WebGL.
     The floor is a real plane seen in perspective, so the ripples lie down on it and open up as they come closer. */
(function () {
  'use strict';
  const S = window.Shachar || {};
  const form = document.querySelector('.ln-form');
  const g = document.querySelector('[data-google]');
  const coarse = matchMedia('(pointer: coarse)').matches;

  addEventListener('pointermove', (e) => {
    if (form) {
      const r = form.getBoundingClientRect();
      form.style.setProperty('--sx', (e.clientX - r.left) + 'px');
      form.style.setProperty('--sy', (e.clientY - r.top) + 'px');
    }
    if (g && !coarse && !(S.calm && S.calm())) {
      const r = g.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const near = Math.abs(dx) < r.width * .75 && Math.abs(dy) < 90;
      g.style.setProperty('--gx', near ? (dx * .04).toFixed(1) + 'px' : '0px');
      g.style.setProperty('--gy', near ? (dy * .1).toFixed(1) + 'px' : '0px');
    }
  }, { passive: true });

  /* ---------------- the water floor ---------------- */
  const art = document.querySelector('[data-art]');
  const cv = document.querySelector('[data-water]');
  const hero = document.querySelector('.ln-hero');
  if (!art || !cv || !hero) return;
  const tilt = hero.querySelector('.owl-tilt');
  const body = hero.querySelector('.owl-body');
  const eyes = [...hero.querySelectorAll('.owl-eye')];
  const badge = hero.querySelector('[data-badge]');
  const badgeImg = badge && badge.querySelector('img');
  const gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return;

  const VS = 'attribute vec2 a; varying vec2 v; void main(){ v = vec2(a.x * .5 + .5, .5 - a.y * .5); gl_Position = vec4(a, 0., 1.); }';
  /* Each pixel is mapped back to a point on the floor plane: the canvas top is the far edge (where he stands),
     the bottom is closest to us. The waves live on the plane, in square cells. */
  const FS = [
    'precision highp float;',
    'varying vec2 v;',
    'uniform sampler2D uOwl, uWave;',
    'uniform vec2 uRes;',
    'uniform vec4 uRect;', // the owl in canvas px (y above the floor line is negative)
    'uniform vec4 uCam;', // Y0 (canvas top to the horizon, px), focal length, nearest depth, depth span
    'void main(){',
    '  vec2 p = v * uRes;',
    '  float y = p.y, k = uCam.x / (y + uCam.x);',
    '  float Z = uCam.y * k;',
    '  vec2 g = vec2((p.x - uRes.x * .5) * k / uRes.x + .5, (uCam.y - Z) / uCam.w);',
    '  vec2 gr = (texture2D(uWave, g).rg - .5) * 2.;',
    '  float s = (y + uCam.x) / (uRes.y + uCam.x);', // 1 near us, smaller far away
    '  float t = y / uRes.y;',
    // the reflection: mirrored about the floor line, bent by the waves (less so far away)
    '  vec2 q = vec2(p.x, -y) + gr * vec2(30., 20.) * s;',
    '  vec2 uv = (q - uRect.xy) / uRect.zw;',
    '  float b = .003 + y / uRect.w * .03;',
    '  vec4 c = texture2D(uOwl, uv) * .36 + (texture2D(uOwl, uv + vec2(b, 0.)) + texture2D(uOwl, uv - vec2(b, 0.)) + texture2D(uOwl, uv + vec2(0., b * 1.6)) + texture2D(uOwl, uv - vec2(0., b * 1.6))) * .16;',
    '  if (uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1.) c *= 0.;',
    // Fresnel: a glancing look (far away) mirrors more, looking down (near us) mirrors less
    '  c *= exp(-y / (uRect.w * .62)) * mix(.78, .26, pow(t, .7));',
    '  vec4 o = c;',
    // depth: the near water is a touch deeper and cooler, the far edge catches the bright wall
    '  float deep = .14 * t * t;',
    '  o = o * (1. - deep) + vec4(vec3(.47, .56, .7) * deep, deep);',
    '  float glow = exp(-y / (uRes.y * .09)) * .3;',
    '  o = o * (1. - glow) + vec4(glow);',
    // a soft contact shadow right under him
    '  float cx = (p.x - (uRect.x + uRect.z * .5)) / (uRect.z * .3);',
    '  float sh = exp(-cx * cx - (y * y) / (uRect.w * uRect.w * .0016)) * .18;',
    '  o = o * (1. - sh) + vec4(0., 0., 0., sh);',
    // the surface: a key light glints on the crests, the back slopes darken
    '  vec3 n = normalize(vec3(-gr.x * 2.2, 1., -gr.y * 2.2));',
    '  vec3 e = normalize(vec3((p.x / uRes.x - .5) * .6, .3 + .7 * (1. - t), 1.));',
    '  vec3 h = normalize(normalize(vec3(-.35, .8, -.5)) + e);',
    '  float glint = max(pow(max(dot(n, h), 0.), 60.) - pow(max(h.y, 0.), 60.), 0.) * 1.4;',
    '  float lit = dot(gr, vec2(-.38, -.92));',
    '  float hi = clamp(glint + max(lit, 0.) * .55, 0., .9);',
    '  float lo = min(.45, clamp(-lit, 0., 1.) * (.42 + .25 * s));',
    '  o = o * (1. - lo) + vec4(vec3(.38, .46, .6) * lo, lo);',
    '  o = o * (1. - hi) + vec4(hi);',
    '  gl_FragColor = o;',
    '}',
  ].join('\n');

  function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (err) { console.warn('water off:', err); return; }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aLoc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(aLoc); gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(prog, n);
  const uRes = U('uRes'), uRect = U('uRect'), uCam = U('uCam');
  gl.uniform1i(U('uOwl'), 0); gl.uniform1i(U('uWave'), 1);
  function tex(unit) {
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  const tOwl = tex(0), tWave = tex(1);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

  // Shachar, redrawn small every frame (body, live eyes, the pin) for the reflection
  const oc = document.createElement('canvas'); const ox = oc.getContext('2d');
  oc.width = oc.height = 256;

  // the camera over the plane, and the waves on it: two height buffers, the classic ripple recurrence
  const GW = coarse ? 200 : 300;
  let GH = 100, h0, h1, px, W = 0, H = 0, Y0 = 1, F = 1, ZN = 1, ZS = 1;
  function size() {
    const r = cv.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    gl.viewport(0, 0, cv.width, cv.height);
    Y0 = H * .5; // the horizon sits half a floor-height above the far edge
    F = 1.75 * (H + Y0); // near us a ring looks a bit under twice as wide as it is tall
    ZN = F * Y0 / (H + Y0); ZS = F - ZN;
    GH = Math.max(40, Math.min(320, Math.round(GW * ZS / W))); // square cells: W wide (the far edge), ZS deep
    h0 = new Float32Array(GW * GH); h1 = new Float32Array(GW * GH); px = new Uint8Array(GW * GH * 4);
  }
  size();
  addEventListener('resize', size);

  function toPlane(x, y) { // canvas px to wave cells
    const k = Y0 / (Math.max(0, y) + Y0);
    return { i: ((x - W / 2) * k / W + .5) * GW, j: (F - F * k) / ZS * GH };
  }
  function drop(x, y, amp, rad) { // x, y in canvas px; rad in cells
    const c = toPlane(x, y), r = rad || 2.6;
    for (let j = Math.max(1, Math.floor(c.j - r * 2)); j < Math.min(GH - 1, Math.ceil(c.j + r * 2)); j++) {
      for (let i = Math.max(1, Math.floor(c.i - r * 2)); i < Math.min(GW - 1, Math.ceil(c.i + r * 2)); i++) {
        const dx = i - c.i, dy = j - c.j;
        h1[j * GW + i] += amp * Math.exp(-(dx * dx + dy * dy) / (r * r));
      }
    }
  }
  function step() {
    for (let j = 1; j < GH - 1; j++) {
      const o = j * GW;
      for (let i = 1; i < GW - 1; i++) {
        const k = o + i;
        h0[k] = ((h1[k - 1] + h1[k + 1] + h1[k - GW] + h1[k + GW]) * .5 - h0[k]) * .985;
      }
    }
    const t = h0; h0 = h1; h1 = t;
  }
  function upload() {
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) {
        const k = j * GW + i, q = k * 4;
        const dx = (h1[k + (i < GW - 1 ? 1 : 0)] - h1[k - (i > 0 ? 1 : 0)]) * 2.4;
        const dy = (h1[k + (j < GH - 1 ? GW : 0)] - h1[k - (j > 0 ? GW : 0)]) * 2.4;
        px[q] = 128 + Math.max(-127, Math.min(127, dx * 127));
        px[q + 1] = 128 + Math.max(-127, Math.min(127, dy * 127));
        px[q + 2] = 0; px[q + 3] = 255;
      }
    }
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tWave);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GW, GH, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
  }

  // the mouse (or a finger) on the floor
  let lx = -1, ly = -1;
  function onFloor(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, in: e.clientY >= r.top && e.clientY <= r.bottom && e.clientX >= r.left && e.clientX <= r.right }; }
  art.addEventListener('pointermove', (e) => {
    const p = onFloor(e);
    if (!p.in) { lx = -1; return; }
    const sp = lx < 0 ? 0 : Math.hypot(p.x - lx, p.y - ly);
    if (sp > .5) drop(p.x, p.y, Math.min(1.6, .3 + sp * .07), 2.4);
    lx = p.x; ly = p.y;
  }, { passive: true });
  art.addEventListener('pointerdown', (e) => { const p = onFloor(e); if (p.in) drop(p.x, p.y, 2.8, 3.4); }, { passive: true });
  art.addEventListener('pointerleave', () => { lx = -1; });

  const eyeColor = () => getComputedStyle(eyes[0] || hero).getPropertyValue('--eye-2').trim() || '#4fd9f7';
  function drawOwl() {
    const tr = tilt.getBoundingClientRect();
    const at = (r) => ({ x: (r.left + r.width / 2 - tr.left) / tr.width * 256, y: (r.top + r.height / 2 - tr.top) / tr.height * 256 });
    ox.clearRect(0, 0, 256, 256);
    if (body.complete && body.naturalWidth) ox.drawImage(body, 0, 0, 256, 256);
    const col = eyeColor();
    eyes.forEach((el) => {
      const r = el.getBoundingClientRect(), c = at(r);
      const rx = r.width / tr.width * 128, ry = Math.max(.6, r.height / tr.height * 128);
      ox.save(); ox.translate(c.x, c.y); ox.scale(1, ry / rx);
      const gr = ox.createRadialGradient(0, 0, 0, 0, 0, rx * 1.6);
      gr.addColorStop(0, '#eaffff'); gr.addColorStop(.45, col); gr.addColorStop(1, 'rgba(60, 200, 255, 0)');
      ox.fillStyle = gr; ox.beginPath(); ox.arc(0, 0, rx * 1.6, 0, Math.PI * 2); ox.fill(); ox.restore();
    });
    if (badgeImg && badgeImg.complete && badgeImg.naturalWidth) {
      const r = badge.getBoundingClientRect(), c = at(r), rr = r.width / tr.width * 128;
      ox.fillStyle = '#f2f5f9'; ox.beginPath(); ox.arc(c.x, c.y, rr, 0, Math.PI * 2); ox.fill();
      const iw = rr * 1.08, ih = iw * badgeImg.naturalHeight / badgeImg.naturalWidth;
      ox.drawImage(badgeImg, c.x - iw / 2 + rr * .06, c.y - ih / 2, iw, ih);
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tOwl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, oc);
    return tr;
  }

  let visible = true;
  if ('IntersectionObserver' in window) new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(cv);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  let started = performance.now(), ambient = started + 8000, lastMove = started;
  art.addEventListener('pointermove', () => { lastMove = performance.now(); }, { passive: true });
  (function frame(now) {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const still = S.reduced && S.reduced();
    if (!still) {
      // a first ring as he settles, then now and then a quiet drop if nobody is playing
      if (started && now - started > 700) { const tr = tilt.getBoundingClientRect(), cr = cv.getBoundingClientRect(); drop(tr.left - cr.left + tr.width / 2, 6, 2.4, 4); started = 0; }
      if (now > ambient) { if (now - lastMove > 6000) drop(W * (.2 + Math.random() * .6), H * (.3 + Math.random() * .6), 1.1, 2.6); ambient = now + 6000 + Math.random() * 6000; }
      step(); step();
    }
    upload();
    const tr = drawOwl(), cr = cv.getBoundingClientRect();
    gl.uniform2f(uRes, W, H);
    gl.uniform4f(uRect, tr.left - cr.left, tr.top - cr.top, tr.width, tr.height);
    gl.uniform4f(uCam, Y0, F, ZN, ZS);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  })(performance.now());
})();
