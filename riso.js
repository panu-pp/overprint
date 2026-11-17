/* riso.js — Risograph-print render module for BlockRogue.
 * Plain browser script, defines window.Riso. No deps.
 * Coordinates are CSS px: caller should ctx.setTransform(dpr,0,0,dpr,0,0) before drawing.
 * Sprites are pre-rendered at device-pixel resolution and cached lazily per (key, size).
 */
(function () {
  'use strict';

  var palette = {
    paper: '#F4EDE0',
    R: '#FF4F6D',   // fluorescent pink-red
    Y: '#FFCC2E',   // riso yellow
    B: '#2F62C8',   // medium blue
    dark: '#26222F',
    grey: '#A39B90'
  };
  // halftone shade ink per key (overprint: second ink multiplied on top)
  var SHADE = { R: '#2F62C8', Y: '#FF4F6D', B: '#26222F', X: '#26222F' };
  var SHADE_A = { R: 0.55, Y: 0.6, B: 0.45, X: 0.4 };
  // echo ink used for highlight glow (misprint in a second colour)
  var ECHO = { R: '#FFCC2E', Y: '#FF4F6D', B: '#FF4F6D', X: '#FFCC2E' };

  var FONT_DISPLAY = "'Dela Gothic One', 'Arial Black', sans-serif";
  var FONT_BODY = "'Space Grotesk', system-ui, sans-serif";
  var BOIL_MS = 125; // 8 fps step

  var dpr = 1;
  var grainTiles = [];   // 3 boil variants (canvas)
  var grainPatterns = [];
  var splats = {};       // key -> [3 canvases]
  var cellCache = {};    // "key|size|mode" -> [variants]
  var emptyCache = {};
  var particles = [];
  var texts = [];
  var shakeAmt = 0, shakeLast = 0, shakeOff = { x: 0, y: 0 };
  var inited = false;

  function inkOf(key) { return key === 'X' ? palette.grey : (palette[key] || palette.dark); }

  function rng(seed) {
    var a = (seed | 0) + 0x9E3779B9;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function mk(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ---------- CSS ---------- */
  function grainSvgUri(op) {
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>" +
      "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/>" +
      "<feColorMatrix values='0 0 0 0 .15 0 0 0 0 .13 0 0 0 0 .18 0 0 0 " + (op || 1.4) + " -.55'/></filter>" +
      "<rect width='100%' height='100%' filter='url(#n)'/></svg>";
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }

  function applyCss(root) {
    root = root || document.documentElement;
    var s = root.style;
    s.setProperty('--paper', palette.paper);
    s.setProperty('--ink-r', palette.R);
    s.setProperty('--ink-y', palette.Y);
    s.setProperty('--ink-b', palette.B);
    s.setProperty('--ink-dark', palette.dark);
    s.setProperty('--ink-grey', palette.grey);
    s.setProperty('--font-display', FONT_DISPLAY);
    s.setProperty('--font-body', FONT_BODY);
    if (document.getElementById('riso-css')) return;
    var st = document.createElement('style');
    st.id = 'riso-css';
    st.textContent =
      '.riso-grain{position:relative;isolation:isolate}' +
      '.riso-grain::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;' +
      'background-image:' + grainSvgUri() + ';background-size:180px 180px;mix-blend-mode:multiply;opacity:.55;z-index:5;' +
      'animation:riso-grain-boil .375s steps(1) infinite}' +
      '@keyframes riso-grain-boil{0%{background-position:0 0}33%{background-position:-61px 37px}66%{background-position:43px -71px}}' +
      '.riso-card{--card-ink:var(--ink-y);--card-mis:var(--ink-b);background:var(--card-ink);color:var(--ink-dark);' +
      'border:2px solid var(--ink-dark);border-radius:6px 9px 7px 8px/8px 6px 9px 7px;' +
      'box-shadow:3px 3px 0 var(--card-mis);animation:riso-card-boil .375s steps(1) infinite;font-family:var(--font-body)}' +
      '.riso-card.r{--card-ink:var(--ink-r);--card-mis:var(--ink-y)}' +
      '.riso-card.y{--card-ink:var(--ink-y);--card-mis:var(--ink-r)}' +
      '.riso-card.b{--card-ink:var(--ink-b);--card-mis:var(--ink-r);color:var(--paper)}' +
      '.riso-card.paper{--card-ink:var(--paper);--card-mis:var(--ink-b)}' +
      '@keyframes riso-card-boil{0%{box-shadow:3px 3px 0 var(--card-mis)}33%{box-shadow:2px 4px 0 var(--card-mis)}66%{box-shadow:4px 2px 0 var(--card-mis)}}' +
      '@media (prefers-reduced-motion:reduce){.riso-card,.riso-grain::after{animation:none}}';
    document.head.appendChild(st);
  }

  /* ---------- init ---------- */
  function makeGrain(seed) {
    var N = 192; // device px tile
    var c = mk(N, N), g = c.getContext('2d');
    var img = g.createImageData(N, N), d = img.data, r = rng(seed);
    for (var i = 0; i < d.length; i += 4) {
      var v = r();
      var a = 0;
      if (v < 0.06) a = 26 + r() * 30;      // dark speck
      else if (v < 0.30) a = 6 + r() * 8;   // soft tooth
      d[i] = 38; d[i + 1] = 30; d[i + 2] = 40; d[i + 3] = a;
    }
    g.putImageData(img, 0, 0);
    // a few paper fibres
    g.strokeStyle = 'rgba(120,96,70,0.10)'; g.lineWidth = 1;
    for (var k = 0; k < 10; k++) {
      var x = r() * N, y = r() * N, a2 = r() * 6.28, L = 6 + r() * 14;
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a2 + 0.6) * L * 0.5, y + Math.sin(a2 + 0.6) * L * 0.5,
        x + Math.cos(a2) * L, y + Math.sin(a2) * L);
      g.stroke();
    }
    return c;
  }

  function makeSplat(color, seed) {
    var S = Math.round(40 * dpr), c = mk(S, S), g = c.getContext('2d'), r = rng(seed);
    var cx = S / 2, cy = S / 2, R0 = S * 0.26;
    g.fillStyle = color;
    g.beginPath();
    var n = 14;
    for (var i = 0; i <= n; i++) {
      var a = i / n * Math.PI * 2, rr = R0 * (0.75 + r() * 0.5);
      var x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath(); g.fill();
    for (var k = 0; k < 6; k++) { // satellite droplets
      var a3 = r() * 6.28, dd = R0 * (1.1 + r() * 0.7), rad = S * (0.025 + r() * 0.05);
      g.beginPath(); g.arc(cx + Math.cos(a3) * dd, cy + Math.sin(a3) * dd, rad, 0, 6.28); g.fill();
    }
    speckle(g, S, S, r, 0.35);
    return c;
  }

  // uneven-ink knockouts
  function speckle(g, w, h, r, amt) {
    g.save();
    g.globalCompositeOperation = 'destination-out';
    var n = Math.round(w * h / (14 * dpr * dpr) * amt);
    for (var i = 0; i < n; i++) {
      g.fillStyle = 'rgba(0,0,0,' + (0.2 + r() * 0.5) + ')';
      var sz = (0.6 + r() * 1.1) * dpr;
      g.fillRect(r() * w, r() * h, sz, sz);
    }
    g.restore();
  }

  function init(d) {
    dpr = Math.max(1, Math.min(3, d || window.devicePixelRatio || 1));
    cellCache = {}; emptyCache = {};
    grainTiles = []; grainPatterns = [];
    var tmp = mk(1, 1).getContext('2d');
    for (var i = 0; i < 3; i++) {
      grainTiles.push(makeGrain(101 + i * 7));
      var p = tmp.createPattern(grainTiles[i], 'repeat');
      if (p.setTransform && window.DOMMatrix) p.setTransform(new DOMMatrix().scale(1 / dpr));
      grainPatterns.push(p);
    }
    ['R', 'Y', 'B', 'X', 'dark'].forEach(function (k) {
      var col = k === 'dark' ? palette.dark : inkOf(k);
      splats[k] = [makeSplat(col, 11), makeSplat(col, 23), makeSplat(col, 37)];
    });
    inited = true;
  }

  function frame(t) { return Math.floor((t || 0) / BOIL_MS) % 3; }

  /* ---------- paper ---------- */
  function drawPaper(ctx, w, h, t) {
    ctx.fillStyle = palette.paper;
    ctx.fillRect(0, 0, w, h);
    if (!inited) return;
    var f = frame(t);
    ctx.save();
    ctx.fillStyle = grainPatterns[f];
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /* ---------- cell sprite building ---------- */
  // rough rounded-square path in sprite device coords
  function roughRect(g, x, y, w, h, rad, r, wob) {
    var pts = [], n = 5;
    function corner(cx, cy, a0) {
      for (var i = 0; i <= n; i++) {
        var a = a0 + (i / n) * Math.PI / 2;
        pts.push([cx + Math.cos(a) * rad + (r() - 0.5) * wob, cy + Math.sin(a) * rad + (r() - 0.5) * wob]);
      }
    }
    corner(x + w - rad, y + rad, -Math.PI / 2);
    corner(x + w - rad, y + h - rad, 0);
    corner(x + rad, y + h - rad, Math.PI / 2);
    corner(x + rad, y + rad, Math.PI);
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
  }

  function halftone(g, x, y, w, h, color, alpha, ghost) {
    var step = Math.max(3 * dpr, w / 7);
    g.fillStyle = hexA(color, alpha);
    for (var j = -1; j < h / step + 1; j++) {
      for (var i = -1; i < w / step + 1; i++) {
        var px = x + i * step + (j & 1 ? step / 2 : 0), py = y + j * step * 0.87;
        // density gradient: heavier toward bottom-right
        var tt = ghost ? 0.55 : ((px - x) / w + (py - y) / h) / 2;
        var rad = ghost ? step * 0.26 : step * 0.62 * Math.max(0, (tt - 0.38) / 0.62);
        if (rad < 0.4 * dpr) continue;
        g.beginPath(); g.arc(px, py, rad, 0, 6.283); g.fill();
      }
    }
  }

  // mode: 'n' normal | 'g' ghost
  function buildCell(key, sz, mode, variant, shape) {
    var S = sz * dpr, pad = Math.ceil(S * 0.14 + 3 * dpr);
    var c = mk(S + pad * 2, S + pad * 2), g = c.getContext('2d');
    var r = rng(shape * 977 + variant * 131 + key.charCodeAt(0));
    var ink = inkOf(key);
    var inset = S * 0.06, rad = S * 0.16, wob = Math.max(0.8 * dpr, S * 0.035);
    // ink layer offset (misregistration of colour plate)
    var offs = [[0, 0], [0.6, -0.5], [-0.5, 0.6]][variant];
    var ix = pad + inset + offs[0] * dpr, iy = pad + inset + offs[1] * dpr, iw = S - inset * 2;

    if (mode === 'g') {
      g.save();
      roughRect(g, ix, iy, iw, iw, rad, r, wob);
      g.clip();
      halftone(g, ix, iy, iw, iw, ink, 0.85, true);
      g.restore();
      g.setLineDash([S * 0.12, S * 0.08]);
      g.lineDashOffset = variant * S * 0.07;
      g.lineWidth = Math.max(1.2 * dpr, S * 0.045);
      g.strokeStyle = hexA(palette.dark, 0.7);
      roughRect(g, ix + 1.2 * dpr, iy + 1.2 * dpr, iw, iw, rad, r, wob);
      g.stroke();
      return { c: c, pad: pad };
    }

    // flat ink
    g.fillStyle = ink;
    roughRect(g, ix, iy, iw, iw, rad, r, wob);
    g.fill();
    // halftone overprint (multiply) clipped to ink
    g.save();
    roughRect(g, ix, iy, iw, iw, rad, rng(shape * 977 + key.charCodeAt(0)), 0);
    g.clip();
    g.globalCompositeOperation = 'multiply';
    halftone(g, ix, iy, iw, iw, SHADE[key] || palette.dark, SHADE_A[key] || 0.5, false);
    // light top-left sheen: paper-coloured fine dots
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = hexA(palette.paper, 0.35);
    var st = Math.max(2.5 * dpr, iw / 10);
    for (var yy = 0; yy < iw * 0.32; yy += st) for (var xx = 0; xx < iw * 0.32 - yy; xx += st) {
      g.beginPath(); g.arc(ix + iw * 0.12 + xx, iy + iw * 0.12 + yy, st * 0.22, 0, 6.283); g.fill();
    }
    g.restore();
    if (key === 'X') { // stone: cracks
      g.strokeStyle = hexA(palette.dark, 0.55); g.lineWidth = Math.max(1, S * 0.03);
      g.beginPath();
      g.moveTo(ix + iw * 0.25, iy + iw * 0.2); g.lineTo(ix + iw * 0.45, iy + iw * 0.5);
      g.lineTo(ix + iw * 0.4, iy + iw * 0.78); g.moveTo(ix + iw * 0.45, iy + iw * 0.5);
      g.lineTo(ix + iw * 0.75, iy + iw * 0.6);
      g.stroke();
    }
    speckle(g, c.width, c.height, r, 0.25);
    // misregistered dark key-plate outline, offset 1-2px, wiggles per variant
    var o = [[1.6, 1.2], [-0.8, 1.7], [1.3, -0.9]][variant];
    g.globalCompositeOperation = 'multiply';
    g.strokeStyle = palette.dark;
    g.lineWidth = Math.max(1.3 * dpr, S * 0.05);
    g.lineJoin = 'round';
    roughRect(g, pad + inset + o[0] * dpr, pad + inset + o[1] * dpr, iw, iw, rad, r, wob * 1.2);
    g.stroke();
    g.globalCompositeOperation = 'source-over';
    return { c: c, pad: pad };
  }

  function getCell(key, s, mode) {
    var sz = Math.max(4, Math.round(s));
    var id = key + '|' + sz + '|' + mode;
    var v = cellCache[id];
    if (!v) {
      v = [];
      for (var shape = 0; shape < 2; shape++) for (var i = 0; i < 3; i++) v.push(buildCell(key, sz, mode, i, shape));
      cellCache[id] = v;
    }
    return v;
  }

  function blit(ctx, spr, x, y, s, scale) {
    var S = Math.round(s), p = spr.pad / dpr, w = spr.c.width / dpr;
    if (scale && scale !== 1) {
      var cx = x + s / 2, cy = y + s / 2, ww = w * scale;
      ctx.drawImage(spr.c, cx - ww / 2, cy - ww / 2, ww, ww);
    } else {
      ctx.drawImage(spr.c, x - p + (s - S) / 2, y - p + (s - S) / 2, w, w);
    }
  }

  function drawCell(ctx, x, y, s, key, opts) {
    if (!inited) init();
    opts = opts || {};
    key = (key === 'R' || key === 'Y' || key === 'B' || key === 'X') ? key : 'X';
    var t = opts.t != null ? opts.t : performance.now();
    var seed = opts.seed | 0;
    var f = (frame(t) + seed) % 3, shape = (seed >>> 1) & 1;
    var idx = shape * 3 + f;
    var a = opts.alpha != null ? opts.alpha : 1;
    var prevA = ctx.globalAlpha;
    if (a !== 1) ctx.globalAlpha = prevA * a;

    if (opts.ghost) {
      blit(ctx, getCell(key, s, 'g')[idx], x, y, s);
      ctx.globalAlpha = prevA;
      return;
    }

    var scale = 1;
    if (opts.highlight) {
      var ph = (t % 600) / 600;
      var pulse = 0.5 + 0.5 * Math.sin(ph * Math.PI * 2);
      scale = 1 + 0.05 * pulse;
      // echo misprint in second ink behind the block
      var eo = [[2, 2], [-2, 2], [2, -1]][frame(t)];
      var e = getCell(key === 'Y' ? 'R' : 'Y', s, 'n')[idx];
      ctx.globalAlpha = prevA * a * (0.35 + 0.4 * pulse);
      var p = e.pad / dpr, w = e.c.width / dpr;
      ctx.drawImage(e.c, x - p + eo[0] * s * 0.04, y - p + eo[1] * s * 0.04, w, w);
      ctx.globalAlpha = prevA * a;
    }

    blit(ctx, getCell(key, s, 'n')[idx], x, y, s, scale);

    if (opts.highlight) {
      // sparkle crosses in paper colour, stepped
      var fr = frame(t), m = s * 0.5;
      ctx.fillStyle = palette.paper;
      var sx = x + s * [0.28, 0.7, 0.55][fr], sy = y + s * [0.3, 0.38, 0.72][fr], k = s * 0.09;
      ctx.fillRect(sx - k, sy - k * 0.25, k * 2, k * 0.5);
      ctx.fillRect(sx - k * 0.25, sy - k, k * 0.5, k * 2);
      void m;
    }

    if (opts.selected) {
      var fr2 = frame(t);
      ctx.save();
      ctx.strokeStyle = palette.dark;
      ctx.lineWidth = Math.max(2, s * 0.07);
      ctx.setLineDash([s * 0.16, s * 0.1]);
      ctx.lineDashOffset = -fr2 * s * 0.087;
      var g2 = s * 0.06 + 2;
      ctx.strokeRect(x - g2, y - g2, s + g2 * 2, s + g2 * 2);
      ctx.strokeStyle = palette.R;
      ctx.lineWidth = Math.max(1.5, s * 0.04);
      ctx.strokeRect(x - g2 + 1.5, y - g2 + 1.5, s + g2 * 2, s + g2 * 2);
      ctx.restore();
    }

    if (opts.mark) {
      var fr3 = frame(t), jo = [[0, 0], [0.6, -0.4], [-0.4, 0.5]][fr3];
      ctx.font = Math.round(s * 0.46) + 'px ' + FONT_DISPLAY;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var tx = x + s / 2, ty = y + s * 0.53;
      ctx.fillStyle = key === 'B' ? palette.paper : palette.dark;
      ctx.fillText(opts.mark, tx + jo[0], ty + jo[1]);
    }
    ctx.globalAlpha = prevA;
  }

  /* ---------- empty slot ---------- */
  function buildEmpty(sz, variant) {
    var S = sz * dpr, c = mk(S, S), g = c.getContext('2d'), r = rng(500 + variant);
    var inset = S * 0.08;
    g.fillStyle = hexA(palette.dark, 0.045);
    roughRect(g, inset, inset, S - inset * 2, S - inset * 2, S * 0.14, r, S * 0.02);
    g.fill();
    // printer's crop marks at corners
    g.strokeStyle = hexA(palette.dark, 0.22);
    g.lineWidth = Math.max(1, S * 0.025);
    var L = S * 0.16, o = [[0.4, 0.3], [-0.3, 0.4], [0.3, -0.3]][variant], a = inset + o[0] * dpr, b = S - inset + o[1] * dpr;
    g.beginPath();
    g.moveTo(a, a + L); g.lineTo(a, a); g.lineTo(a + L, a);
    g.moveTo(b - L, a); g.lineTo(b, a); g.lineTo(b, a + L);
    g.moveTo(b, b - L); g.lineTo(b, b); g.lineTo(b - L, b);
    g.moveTo(a + L, b); g.lineTo(a, b); g.lineTo(a, b - L);
    g.stroke();
    g.fillStyle = hexA(palette.B, 0.18);
    g.beginPath(); g.arc(S / 2 + o[0] * dpr, S / 2 + o[1] * dpr, Math.max(1, S * 0.03), 0, 6.283); g.fill();
    return c;
  }

  function drawEmpty(ctx, x, y, s, opts) {
    if (!inited) init();
    opts = opts || {};
    var sz = Math.max(4, Math.round(s));
    var v = emptyCache[sz];
    if (!v) v = emptyCache[sz] = [buildEmpty(sz, 0), buildEmpty(sz, 1), buildEmpty(sz, 2)];
    var t = opts.t != null ? opts.t : performance.now();
    var f = (frame(t) + (opts.seed | 0)) % 3;
    var prevA = ctx.globalAlpha;
    if (opts.alpha != null) ctx.globalAlpha = prevA * opts.alpha;
    ctx.drawImage(v[f], x, y, sz, sz);
    ctx.globalAlpha = prevA;
  }

  /* ---------- fx ---------- */
  var MAXP = 360;
  function burst(x, y, key, n) {
    if (!inited) init();
    n = n || 14;
    var sk = splats[key] ? key : 'X';
    for (var i = 0; i < n; i++) {
      if (particles.length >= MAXP) particles.shift();
      var a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 260;
      var isSplat = i % 3 === 0;
      var col = Math.random() < 0.18 ? (key === 'B' ? 'R' : 'B') : sk; // occasional other ink
      if (col === 'dark') col = sk;
      particles.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120,
        life: 0, max: 0.6 + Math.random() * 0.6,
        size: isSplat ? 10 + Math.random() * 16 : 4 + Math.random() * 6,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 14,
        kind: isSplat ? 0 : 1, key: col, spr: (Math.random() * 3) | 0
      });
    }
  }

  function popText(x, y, text, key, size) {
    texts.push({ x: x, y: y, text: String(text), key: key || 'R', size: size || 28, life: 0, max: 1.1 });
    if (texts.length > 24) texts.shift();
  }

  function shake(amount) { shakeAmt = Math.max(shakeAmt, amount || 6); }

  function getShake() {
    var now = performance.now(), dt = Math.min(0.1, (now - (shakeLast || now)) / 1000);
    shakeLast = now;
    shakeAmt *= Math.pow(0.0025, dt);
    if (shakeAmt < 0.3) { shakeAmt = 0; shakeOff.x = 0; shakeOff.y = 0; return shakeOff; }
    shakeOff.x = (Math.random() * 2 - 1) * shakeAmt;
    shakeOff.y = (Math.random() * 2 - 1) * shakeAmt;
    return shakeOff;
  }

  function drawFx(ctx, t, dt) {
    if (!inited) init();
    dt = Math.min(0.05, dt || 0.016);
    var f = frame(t);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    var w = 0;
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vy += 620 * dt; p.vx *= Math.pow(0.4, dt);
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      particles[w++] = p;
      var k = 1 - p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      var rot = Math.round(p.rot * 2.5) / 2.5; // stepped rotation feels hand-drawn
      if (p.kind === 0) {
        var spr = splats[p.key][(p.spr + f) % 3], sz = p.size * (0.6 + 0.4 * k) * 1.8;
        ctx.translate(p.x, p.y); ctx.rotate(rot);
        ctx.drawImage(spr, -sz / 2, -sz / 2, sz, sz);
      } else {
        ctx.translate(p.x, p.y); ctx.rotate(rot);
        ctx.fillStyle = inkOf(p.key);
        var cw = p.size, ch = p.size * 0.55;
        ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
      }
      ctx.rotate(-rot); ctx.translate(-p.x, -p.y);
    }
    particles.length = w;
    ctx.restore();

    // floating text with misregistered double print
    var wt = 0;
    for (var j = 0; j < texts.length; j++) {
      var tx = texts[j];
      tx.life += dt;
      if (tx.life >= tx.max) continue;
      texts[wt++] = tx;
      var u = tx.life / tx.max;
      var pop = u < 0.15 ? 0.6 + (u / 0.15) * 0.55 : 1.15 - Math.min(0.15, (u - 0.15) * 0.5);
      var yy = tx.y - 46 * Math.sqrt(u);
      var fs = Math.round(tx.size * pop);
      var mo = [[3, 2], [2, 3], [3, 1]][f];
      ctx.save();
      ctx.globalAlpha = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
      ctx.font = fs + 'px ' + FONT_DISPLAY;
      // keep text on screen: shrink to fit 92% of canvas width, then clamp x inside the edges
      var sc = ctx.getTransform ? ctx.getTransform().a || 1 : 1;
      var cw = ctx.canvas.width / sc, pad = cw * 0.04;
      var tw = ctx.measureText(tx.text).width;
      if (tw > cw - pad * 2) { fs = Math.max(10, Math.floor(fs * (cw - pad * 2) / tw)); ctx.font = fs + 'px ' + FONT_DISPLAY; tw = ctx.measureText(tx.text).width; }
      var half = tw / 2 + 4;
      var xx = Math.min(Math.max(tx.x, pad + half), cw - pad - half);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = inkOf(tx.key);
      ctx.fillText(tx.text, xx + mo[0] * fs / 28, yy + mo[1] * fs / 28);
      ctx.fillStyle = palette.dark;
      ctx.fillText(tx.text, xx, yy);
      ctx.restore();
    }
    texts.length = wt;
  }

  /* ---------- piece icon ---------- */
  function drawPieceIcon(ctx, cells, cx, cy, s, key, t, opts) {
    if (!cells || !cells.length) return;
    var minR = 1e9, maxR = -1e9, minC = 1e9, maxC = -1e9, i;
    for (i = 0; i < cells.length; i++) {
      var rc = cells[i];
      if (rc[0] < minR) minR = rc[0]; if (rc[0] > maxR) maxR = rc[0];
      if (rc[1] < minC) minC = rc[1]; if (rc[1] > maxC) maxC = rc[1];
    }
    var w = (maxC - minC + 1) * s, h = (maxR - minR + 1) * s;
    var x0 = cx - w / 2, y0 = cy - h / 2;
    var o = { t: t, seed: 0, alpha: opts && opts.alpha, ghost: opts && opts.ghost, highlight: opts && opts.highlight };
    for (i = 0; i < cells.length; i++) {
      o.seed = i * 5 + 1;
      drawCell(ctx, x0 + (cells[i][1] - minC) * s, y0 + (cells[i][0] - minR) * s, s, key, o);
    }
  }

  window.Riso = {
    palette: palette,
    fonts: {
      display: FONT_DISPLAY, body: FONT_BODY,
      url: 'https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Space+Grotesk:wght@400;600;700&display=swap'
    },
    applyCss: applyCss,
    init: init,
    frame: frame,
    drawPaper: drawPaper,
    drawCell: drawCell,
    drawEmpty: drawEmpty,
    burst: burst,
    drawFx: drawFx,
    popText: popText,
    shake: shake,
    getShake: getShake,
    drawPieceIcon: drawPieceIcon,
    clearFx: function () { particles.length = 0; texts.length = 0; shakeAmt = 0; },
    clearCache: function () { cellCache = {}; emptyCache = {}; }
  };
})();
