/* BlockRogue meta layer: Polyomino Town.
 * Plain browser script. Defines window.MetaTown.
 * Between runs the player spends Ink on polyomino-shaped buildings and places
 * them on a 6x6 town grid. Placed buildings unlock perks and give run bonuses.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'blockrogue_meta_v1';
  var GRID = 6;
  var BASE_PERKS = ['shatter', 'reroll', 'golddust', 'domino', 'narrow', 'overclock'];
  var CURSES = { rubble: 1, heavy: 1, blind: 1 };
  var PERK_NAMES = {
    shatter: 'Shatter', reroll: 'Reroll', golddust: 'Gold Dust', domino: 'Domino',
    narrow: 'Narrow', overclock: 'Overclock', bomb: 'Bomb', recolor: 'Recolor',
    fill: 'Fill', echo: 'Echo', prism: 'Prism', spark: 'Spark', siphon: 'Siphon',
    thrift: 'Thrift', rubble: 'Rubble', heavy: 'Heavy', blind: 'Blind'
  };
  var INK_NAMES = { R: 'Pink', Y: 'Yellow', B: 'Blue' };

  var SHAPES = {
    mono: [[0, 0]],
    duo: [[0, 0], [1, 0]],
    i3: [[0, 0], [1, 0], [2, 0]],
    l3: [[0, 0], [0, 1], [1, 1]],
    t4: [[0, 0], [1, 0], [2, 0], [1, 1]],
    s4: [[1, 0], [2, 0], [0, 1], [1, 1]],
    p5: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]]
  };

  // tier = number of buildings you must own before this one is for sale.
  // Total cost 770 Ink (~15-20 runs at 1000-3000 score). Total cells 33 of 36.
  var BUILDINGS = [
    { id: 'bombshed', name: 'Bomb Shed', ink: 'R', shape: 'mono', cost: 20, tier: 0, unlock: 'bomb', abbr: 'BS' },
    { id: 'inkwell', name: 'Ink Well', ink: 'Y', shape: 'mono', cost: 25, tier: 0, charge: 'Y', abbr: 'IW' },
    { id: 'dyevat', name: 'Dye Vat', ink: 'B', shape: 'duo', cost: 35, tier: 0, unlock: 'recolor', abbr: 'DV' },
    { id: 'rubbleyard', name: 'Rubble Yard', ink: 'R', shape: 'duo', cost: 40, tier: 1, unlock: 'rubble', score: 0.05, abbr: 'RY' },
    { id: 'printshop', name: 'Print Shop', ink: 'Y', shape: 'duo', cost: 45, tier: 2, unlock: 'fill', abbr: 'PS' },
    { id: 'echohall', name: 'Echo Hall', ink: 'B', shape: 'i3', cost: 60, tier: 3, unlock: 'echo', abbr: 'EH' },
    { id: 'sparkforge', name: 'Spark Forge', ink: 'R', shape: 'l3', cost: 65, tier: 3, unlock: 'spark', abbr: 'SF' },
    { id: 'thriftmkt', name: 'Thrift Market', ink: 'Y', shape: 'l3', cost: 70, tier: 4, unlock: 'thrift', exp: 0.10, abbr: 'TM' },
    { id: 'siphonmill', name: 'Siphon Mill', ink: 'B', shape: 'i3', cost: 75, tier: 5, unlock: 'siphon', abbr: 'SM' },
    { id: 'prismtower', name: 'Prism Tower', ink: 'Y', shape: 't4', cost: 95, tier: 6, unlock: 'prism', refract: true, abbr: 'PT' },
    { id: 'foundry', name: 'Heavy Foundry', ink: 'R', shape: 's4', cost: 100, tier: 7, unlock: 'heavy', score: 0.10, abbr: 'HF' },
    { id: 'gallery', name: 'Blind Gallery', ink: 'B', shape: 'p5', cost: 140, tier: 9, unlock: 'blind', slot: 1, score: 0.10, abbr: 'BG' }
  ];
  var BY_ID = {};
  BUILDINGS.forEach(function (b, i) { b.index = i; BY_ID[b.id] = b; });

  var MAX_PAIR_CHARGES = 2; // per ink, from same-ink adjacency

  /* ---------------- storage ---------------- */
  var memoryStore = null;

  function defaults() {
    return { v: 1, ink: 0, totalInk: 0, owned: {}, placed: [] };
  }

  function sanitize(s) {
    var d = defaults();
    if (!s || typeof s !== 'object') return d;
    d.ink = Math.max(0, Math.floor(+s.ink || 0));
    d.totalInk = Math.max(0, Math.floor(+s.totalInk || 0));
    if (s.owned && typeof s.owned === 'object') {
      Object.keys(s.owned).forEach(function (k) { if (BY_ID[k] && s.owned[k]) d.owned[k] = true; });
    }
    if (Array.isArray(s.placed)) {
      s.placed.forEach(function (p) {
        if (!p || !BY_ID[p.id] || !d.owned[p.id]) return;
        if (d.placed.some(function (q) { return q.id === p.id; })) return;
        var cand = { id: p.id, x: p.x | 0, y: p.y | 0, rot: ((p.rot | 0) % 4 + 4) % 4 };
        if (fits(d.placed, cand, null)) d.placed.push(cand);
      });
    }
    return d;
  }

  function load() {
    var raw = null;
    try { raw = window.localStorage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
    if (raw) {
      try { return sanitize(JSON.parse(raw)); } catch (e) { /* fall through */ }
    }
    if (memoryStore) {
      try { return sanitize(JSON.parse(memoryStore)); } catch (e) { /* ignore */ }
    }
    return defaults();
  }

  function save(state) {
    var json;
    try { json = JSON.stringify(state); } catch (e) { return; }
    memoryStore = json;
    try { window.localStorage.setItem(STORAGE_KEY, json); } catch (e) { /* private mode */ }
  }

  function addInk(state, n) {
    n = Math.max(0, Math.floor(+n || 0));
    state.ink = (state.ink || 0) + n;
    state.totalInk = (state.totalInk || 0) + n;
    save(state);
    return state;
  }

  function resetAll() {
    memoryStore = null;
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    return defaults();
  }

  /* ---------------- geometry ---------------- */
  function rotCells(shapeKey, rot) {
    var cells = SHAPES[shapeKey].map(function (c) { return [c[0], c[1]]; });
    for (var r = 0; r < rot; r++) cells = cells.map(function (c) { return [-c[1], c[0]]; });
    var mx = Math.min.apply(null, cells.map(function (c) { return c[0]; }));
    var my = Math.min.apply(null, cells.map(function (c) { return c[1]; }));
    return cells.map(function (c) { return [c[0] - mx, c[1] - my]; });
  }

  // Pivot = cell nearest to the centroid, so a tap lands the shape "under the finger".
  function pivotOf(cells) {
    var cx = 0, cy = 0;
    cells.forEach(function (c) { cx += c[0]; cy += c[1]; });
    cx /= cells.length; cy /= cells.length;
    var best = cells[0], bd = 1e9;
    cells.forEach(function (c) {
      var d = (c[0] - cx) * (c[0] - cx) + (c[1] - cy) * (c[1] - cy);
      if (d < bd - 1e-6) { bd = d; best = c; }
    });
    return best;
  }

  function absCells(p) {
    return rotCells(BY_ID[p.id].shape, p.rot).map(function (c) { return [c[0] + p.x, c[1] + p.y]; });
  }

  function occupancy(placed, ignoreId) {
    var occ = {};
    placed.forEach(function (p) {
      if (p.id === ignoreId) return;
      absCells(p).forEach(function (c) { occ[c[0] + ',' + c[1]] = p.id; });
    });
    return occ;
  }

  function fits(placed, cand, ignoreId) {
    var occ = occupancy(placed, ignoreId);
    return absCells(cand).every(function (c) {
      return c[0] >= 0 && c[1] >= 0 && c[0] < GRID && c[1] < GRID && !occ[c[0] + ',' + c[1]];
    });
  }

  function neighborsMap(placed) {
    var occ = occupancy(placed, null);
    var nb = {};
    placed.forEach(function (p) { nb[p.id] = {}; });
    placed.forEach(function (p) {
      absCells(p).forEach(function (c) {
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var o = occ[(c[0] + d[0]) + ',' + (c[1] + d[1])];
          if (o && o !== p.id) nb[p.id][o] = true;
        });
      });
    });
    return nb;
  }

  /* ---------------- run modifiers ---------------- */
  function computeMods(state) {
    var placed = (state && state.placed) || [];
    var mods = {
      unlocked: BASE_PERKS.slice(),
      startCharges: { R: 0, Y: 0, B: 0 },
      extraSlots: 0, expMult: 1, scoreMult: 1, startPerk: null
    };
    var notes = [];
    var expAdd = 0, scoreAdd = 0;
    var nb = neighborsMap(placed);
    var sorted = placed.slice().sort(function (a, b) { return BY_ID[a.id].index - BY_ID[b.id].index; });

    sorted.forEach(function (p) {
      var b = BY_ID[p.id];
      if (b.unlock && mods.unlocked.indexOf(b.unlock) < 0) mods.unlocked.push(b.unlock);
      if (b.charge) mods.startCharges[b.charge] += 1;
      if (b.exp) expAdd += b.exp;
      if (b.score) scoreAdd += b.score;
      if (b.slot) mods.extraSlots += b.slot;
    });

    // Adjacency 1: Ink Bleed - each touching pair of same-ink buildings = +1 start charge of that ink.
    var pairCount = { R: 0, Y: 0, B: 0 };
    sorted.forEach(function (p, i) {
      sorted.slice(i + 1).forEach(function (q) {
        if (nb[p.id][q.id] && BY_ID[p.id].ink === BY_ID[q.id].ink) pairCount[BY_ID[p.id].ink]++;
      });
    });
    ['R', 'Y', 'B'].forEach(function (k) {
      var n = Math.min(MAX_PAIR_CHARGES, pairCount[k]);
      if (n > 0) { mods.startCharges[k] += n; notes.push('Ink Bleed: +' + n + ' ' + INK_NAMES[k] + ' charge'); }
    });

    // Adjacency 2: Full Press - a building touching both other inks = +5% EXP.
    var fullPress = 0;
    sorted.forEach(function (p) {
      var inks = {};
      Object.keys(nb[p.id]).forEach(function (o) { inks[BY_ID[o].ink] = true; });
      var mine = BY_ID[p.id].ink;
      var others = ['R', 'Y', 'B'].filter(function (k) { return k !== mine; });
      if (inks[others[0]] && inks[others[1]]) fullPress++;
    });
    if (fullPress) { expAdd += 0.05 * fullPress; notes.push('Full Press x' + fullPress + ': +' + (5 * fullPress) + '% EXP'); }

    // Prism Tower refracts: start the run holding a touching building's benefit perk.
    sorted.forEach(function (p) {
      if (!BY_ID[p.id].refract || mods.startPerk) return;
      var cands = Object.keys(nb[p.id]).map(function (o) { return BY_ID[o]; })
        .filter(function (b) { return b.unlock && !CURSES[b.unlock]; })
        .sort(function (a, b) { return a.index - b.index; });
      if (cands.length) { mods.startPerk = cands[0].unlock; notes.push('Prism refracts: start with ' + PERK_NAMES[cands[0].unlock]); }
    });

    mods.expMult = Math.round((1 + expAdd) * 100) / 100;
    mods.scoreMult = Math.round((1 + scoreAdd) * 100) / 100;
    return { mods: mods, notes: notes };
  }

  function getRunMods(state) { return computeMods(state).mods; }

  function describe(b) {
    var parts = [];
    if (b.unlock) parts.push((CURSES[b.unlock] ? 'Curse: ' : 'Unlocks ') + PERK_NAMES[b.unlock]);
    if (b.charge) parts.push('+1 ' + INK_NAMES[b.charge] + ' start charge');
    if (b.score) parts.push('+' + Math.round(b.score * 100) + '% score');
    if (b.exp) parts.push('+' + Math.round(b.exp * 100) + '% EXP');
    if (b.slot) parts.push('+1 perk slot');
    if (b.refract) parts.push('start with a touching building\'s perk');
    return parts.join(' · ');
  }

  /* ---------------- styles ---------------- */
  var STYLE_ID = 'mt-style';
  var CSS = [
    '.mt-root{position:relative;width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:6px;padding:10px 12px 12px;background:var(--paper,#f4efe4);color:var(--ink-dark,#1d2a2e);font-family:var(--font-body,system-ui,sans-serif);overflow:hidden;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}',
    '.mt-root *{box-sizing:border-box}',
    '.mt-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:0 0 auto}',
    '.mt-title{font-family:var(--font-display,inherit);font-size:20px;line-height:1;letter-spacing:.02em;text-transform:uppercase;text-shadow:2px 2px 0 var(--ink-r,#ff5c8a)}',
    '.mt-title small{display:block;font-family:var(--font-body,inherit);font-size:10px;letter-spacing:.12em;text-shadow:none;opacity:.7;margin-top:3px}',
    '.mt-ink{display:flex;align-items:center;gap:6px;padding:6px 10px;border:2px solid var(--ink-dark,#1d2a2e);background:var(--ink-y,#ffd23f);box-shadow:3px 3px 0 var(--ink-b,#3a6fd8);font-family:var(--font-display,inherit);font-size:18px;min-height:40px}',
    '.mt-ink i{width:12px;height:12px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--ink-dark,#1d2a2e);display:inline-block}',
    '.mt-gridwrap{flex:0 0 auto;display:flex;justify-content:center}',
    '.mt-grid{position:relative;display:grid;grid-template-columns:repeat(6,1fr);grid-template-rows:repeat(6,1fr);border:2px solid var(--ink-dark,#1d2a2e);box-shadow:3px 3px 0 var(--ink-b,#3a6fd8);background:var(--paper,#f4efe4);touch-action:none}',
    '.mt-cell{position:relative;border:1px dashed rgba(29,42,46,.25);display:flex;align-items:center;justify-content:center;font-family:var(--font-display,inherit);font-size:12px}',
    '.mt-cell.mt-b{border-style:solid;mix-blend-mode:multiply}',
    '.mt-cell.mt-R{background:var(--ink-r,#ff5c8a)}.mt-cell.mt-Y{background:var(--ink-y,#ffd23f)}.mt-cell.mt-B{background:var(--ink-b,#3a6fd8)}',
    '.mt-cell .mt-lbl{position:relative;z-index:2;background:var(--paper,#f4efe4);border:1.5px solid var(--ink-dark,#1d2a2e);padding:1px 3px;line-height:1.1}',
    '.mt-cell.mt-gok::after,.mt-cell.mt-gbad::after{content:"";position:absolute;inset:3px;z-index:3;pointer-events:none}',
    '.mt-cell.mt-gok::after{background:var(--ink-dark,#1d2a2e);opacity:.35;outline:2px solid var(--ink-dark,#1d2a2e)}',
    '.mt-cell.mt-gbad::after{background:var(--ink-r,#ff5c8a);opacity:.6;outline:2px solid var(--ink-r,#ff5c8a)}',
    '.mt-ctrl{flex:0 0 auto;display:flex;gap:6px;align-items:stretch;min-height:44px}',
    '.mt-ctrl .mt-hint{flex:1;display:flex;align-items:center;font-size:12px;line-height:1.25}',
    '.mt-btn{min-height:44px;min-width:44px;padding:0 12px;border:2px solid var(--ink-dark,#1d2a2e);background:var(--paper,#f4efe4);color:var(--ink-dark,#1d2a2e);font-family:var(--font-display,inherit);font-size:14px;text-transform:uppercase;cursor:pointer;box-shadow:2px 2px 0 var(--ink-r,#ff5c8a)}',
    '.mt-btn:active{transform:translate(2px,2px);box-shadow:none}',
    '.mt-btn[disabled]{opacity:.4;cursor:default;box-shadow:none}',
    '.mt-btn.mt-go{background:var(--ink-y,#ffd23f)}',
    '.mt-sum{flex:0 0 auto;font-size:11px;line-height:1.35;padding:5px 8px;border:1.5px solid var(--ink-dark,#1d2a2e);background:var(--paper,#f4efe4);box-shadow:2px 2px 0 var(--ink-y,#ffd23f)}',
    '.mt-sum b{font-family:var(--font-display,inherit);font-weight:normal}',
    '.mt-shop{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:6px;padding:2px 4px 4px 0}',
    '.mt-card{display:flex;align-items:center;gap:8px;padding:5px 6px;border:1.5px solid var(--ink-dark,#1d2a2e);background:var(--paper,#f4efe4);min-height:52px}',
    '.mt-card.mt-sel{box-shadow:3px 3px 0 var(--ink-r,#ff5c8a);border-width:2px}',
    '.mt-card.mt-locked{opacity:.5}',
    '.mt-prev{flex:0 0 40px;height:40px;display:flex;align-items:center;justify-content:center}',
    '.mt-prev span{position:absolute;width:9px;height:9px;border:1px solid var(--ink-dark,#1d2a2e);mix-blend-mode:multiply}',
    '.mt-info{flex:1;min-width:0}',
    '.mt-name{font-family:var(--font-display,inherit);font-size:13px;line-height:1.1}',
    '.mt-name em{font-style:normal;font-size:10px;opacity:.6;margin-left:4px;font-family:var(--font-body,inherit)}',
    '.mt-desc{font-size:11px;line-height:1.2;opacity:.85;margin-top:2px}',
    '.mt-card .mt-btn{font-size:12px;padding:0 8px;min-width:64px}',
    '.mt-tag{font-size:10px;letter-spacing:.08em;text-transform:uppercase;text-align:center;min-width:64px;opacity:.7}',
    '.mt-play{flex:0 0 auto;min-height:56px;font-size:22px;background:var(--ink-r,#ff5c8a);color:var(--paper,#f4efe4);box-shadow:3px 3px 0 var(--ink-b,#3a6fd8);letter-spacing:.06em}',
    '.mt-toast{position:absolute;left:50%;top:56px;transform:translateX(-50%);background:var(--ink-dark,#1d2a2e);color:var(--paper,#f4efe4);padding:6px 10px;font-size:12px;z-index:10;pointer-events:none;opacity:0;transition:opacity .2s}',
    '.mt-toast.mt-show{opacity:1}'
  ].join('\n');

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function ownedCount(state) { return Object.keys(state.owned).length; }

  /* ---------------- mount ---------------- */
  function mount(containerEl, state, onPlay) {
    injectStyle();
    state = state || load();
    var sel = null; // { id, rot, x, y, hasPos, origin:{x,y,rot}|null }

    var root = el('div', 'mt-root');
    var head = el('div', 'mt-head');
    var title = el('div', 'mt-title', 'Polyomino Town');
    title.appendChild(el('small', null, 'Build between runs'));
    var inkBox = el('div', 'mt-ink');
    inkBox.appendChild(el('i'));
    var inkNum = el('span', null, '0');
    inkBox.appendChild(inkNum);
    head.appendChild(title); head.appendChild(inkBox);

    var gridWrap = el('div', 'mt-gridwrap');
    var grid = el('div', 'mt-grid');
    var cells = [];
    for (var i = 0; i < GRID * GRID; i++) { var c = el('div', 'mt-cell'); grid.appendChild(c); cells.push(c); }
    gridWrap.appendChild(grid);

    var ctrl = el('div', 'mt-ctrl');
    var hint = el('div', 'mt-hint');
    var rotBtn = el('button', 'mt-btn', '↻');
    rotBtn.setAttribute('aria-label', 'Rotate');
    var cancelBtn = el('button', 'mt-btn', '✕');
    cancelBtn.setAttribute('aria-label', 'Cancel');
    var placeBtn = el('button', 'mt-btn mt-go', 'Place');
    ctrl.appendChild(hint); ctrl.appendChild(rotBtn); ctrl.appendChild(cancelBtn); ctrl.appendChild(placeBtn);

    var sum = el('div', 'mt-sum');
    var shop = el('div', 'mt-shop');
    var play = el('button', 'mt-btn mt-play', 'Play Run');
    var toast = el('div', 'mt-toast');

    root.appendChild(head); root.appendChild(gridWrap); root.appendChild(ctrl);
    root.appendChild(sum); root.appendChild(shop); root.appendChild(play); root.appendChild(toast);
    containerEl.appendChild(root);

    var toastTimer = 0;
    function say(msg) {
      toast.textContent = msg;
      toast.classList.add('mt-show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toast.classList.remove('mt-show'); }, 1400);
    }

    function layout() {
      var w = root.clientWidth - 24, h = root.clientHeight;
      var size = Math.floor(Math.max(180, Math.min(w, h * (h < 700 ? 0.38 : 0.42))) / GRID) * GRID;
      grid.style.width = size + 'px';
      grid.style.height = size + 'px';
    }

    function candidate() {
      if (!sel || !sel.hasPos) return null;
      return { id: sel.id, x: sel.x, y: sel.y, rot: sel.rot };
    }

    function renderGrid() {
      var occ = {};
      state.placed.forEach(function (p) {
        if (sel && sel.id === p.id) return;
        var ac = absCells(p);
        var piv = pivotOf(rotCells(BY_ID[p.id].shape, p.rot));
        ac.forEach(function (c) { occ[c[0] + ',' + c[1]] = { p: p, piv: c[0] - p.x === piv[0] && c[1] - p.y === piv[1] }; });
      });
      var ghost = {}, ghostOk = false, cand = candidate();
      if (cand) {
        ghostOk = fits(state.placed, cand, cand.id);
        absCells(cand).forEach(function (c) { ghost[c[0] + ',' + c[1]] = true; });
      }
      for (var y = 0; y < GRID; y++) {
        for (var x = 0; x < GRID; x++) {
          var cell = cells[y * GRID + x];
          var k = x + ',' + y, o = occ[k];
          cell.className = 'mt-cell';
          cell.textContent = '';
          cell.style.borderColor = '';
          cell.style.borderWidth = '';
          if (o) {
            var b = BY_ID[o.p.id];
            cell.classList.add('mt-b', 'mt-' + b.ink);
            var same = function (dx, dy) { var n = occ[(x + dx) + ',' + (y + dy)]; return n && n.p.id === o.p.id; };
            var dark = 'var(--ink-dark,#1d2a2e)';
            var fill = b.ink === 'R' ? 'var(--ink-r,#ff5c8a)' : b.ink === 'Y' ? 'var(--ink-y,#ffd23f)' : 'var(--ink-b,#3a6fd8)';
            cell.style.borderColor = [same(0, -1) ? fill : dark, same(1, 0) ? fill : dark, same(0, 1) ? fill : dark, same(-1, 0) ? fill : dark].join(' ');
            cell.style.borderWidth = '2px';
            if (o.piv) cell.appendChild(el('span', 'mt-lbl', b.abbr));
          }
          if (ghost[k]) {
            var gb = BY_ID[sel.id];
            if (!o) cell.classList.add('mt-' + gb.ink);
            cell.classList.add(ghostOk ? 'mt-gok' : 'mt-gbad');
          }
        }
      }
    }

    function renderCtrl() {
      var placing = !!sel;
      rotBtn.style.display = cancelBtn.style.display = placeBtn.style.display = placing ? '' : 'none';
      if (placing) {
        var b = BY_ID[sel.id];
        var cand = candidate();
        var ok = cand && fits(state.placed, cand, cand.id);
        placeBtn.disabled = !ok;
        hint.textContent = !sel.hasPos ? 'Tap or drag on the town to place ' + b.name + '.' :
          ok ? 'Tap the ghost or PLACE to build.' : 'Blocked. Move or rotate.';
      } else {
        hint.textContent = state.placed.length ? 'Tap a building in town to move it (free).' : 'Buy a building below, then place it in town.';
      }
      play.disabled = placing;
    }

    function renderSummary() {
      var r = computeMods(state), m = r.mods;
      var extra = m.unlocked.filter(function (p) { return BASE_PERKS.indexOf(p) < 0; });
      var lines = [];
      lines.push('<b>Run bonuses</b> — ' + (extra.length ? 'Perks: ' + extra.map(function (p) { return PERK_NAMES[p] + (CURSES[p] ? '*' : ''); }).join(', ') : 'base perks only'));
      var bits = [];
      var ch = ['R', 'Y', 'B'].filter(function (k) { return m.startCharges[k]; }).map(function (k) { return m.startCharges[k] + ' ' + INK_NAMES[k]; });
      if (ch.length) bits.push('Charges ' + ch.join('/'));
      if (m.scoreMult !== 1) bits.push('Score x' + m.scoreMult.toFixed(2));
      if (m.expMult !== 1) bits.push('EXP x' + m.expMult.toFixed(2));
      if (m.extraSlots) bits.push('+' + m.extraSlots + ' slot');
      if (m.startPerk) bits.push('Start: ' + PERK_NAMES[m.startPerk]);
      if (bits.length) lines.push(bits.join(' · '));
      lines.push('<span style="opacity:.7">Touching same ink: +1 charge (max 2/ink). Touching both other inks: +5% EXP.</span>');
      sum.innerHTML = lines.join('<br>');
    }

    function preview(b) {
      var box = el('div', 'mt-prev');
      var inner = el('div');
      inner.style.position = 'relative';
      var cs = rotCells(b.shape, 0);
      var w = 1 + Math.max.apply(null, cs.map(function (c) { return c[0]; }));
      var h = 1 + Math.max.apply(null, cs.map(function (c) { return c[1]; }));
      inner.style.width = (w * 10) + 'px';
      inner.style.height = (h * 10) + 'px';
      var col = b.ink === 'R' ? 'var(--ink-r,#ff5c8a)' : b.ink === 'Y' ? 'var(--ink-y,#ffd23f)' : 'var(--ink-b,#3a6fd8)';
      cs.forEach(function (c) {
        var s = el('span');
        s.style.left = (c[0] * 10) + 'px';
        s.style.top = (c[1] * 10) + 'px';
        s.style.background = col;
        inner.appendChild(s);
      });
      box.appendChild(inner);
      return box;
    }

    function renderShop() {
      var top = shop.scrollTop;
      shop.innerHTML = '';
      var n = ownedCount(state);
      BUILDINGS.forEach(function (b) {
        var owned = !!state.owned[b.id];
        var placed = state.placed.some(function (p) { return p.id === b.id; });
        var locked = !owned && n < b.tier;
        var card = el('div', 'mt-card' + (locked ? ' mt-locked' : '') + (sel && sel.id === b.id ? ' mt-sel' : ''));
        card.appendChild(preview(b));
        var info = el('div', 'mt-info');
        var nm = el('div', 'mt-name', b.name);
        nm.appendChild(el('em', null, INK_NAMES[b.ink] + ' · ' + SHAPES[b.shape].length + ' cell' + (SHAPES[b.shape].length > 1 ? 's' : '')));
        info.appendChild(nm);
        info.appendChild(el('div', 'mt-desc', describe(b)));
        card.appendChild(info);
        if (locked) {
          card.appendChild(el('div', 'mt-tag', 'Own ' + b.tier + ' bldgs'));
        } else if (!owned) {
          var buy = el('button', 'mt-btn mt-go', b.cost + ' ink');
          buy.disabled = state.ink < b.cost || !!sel;
          buy.addEventListener('click', function () { doBuy(b); });
          card.appendChild(buy);
        } else if (!placed) {
          var pl = el('button', 'mt-btn', 'Place');
          pl.disabled = !!sel && sel.id !== b.id;
          pl.addEventListener('click', function () { startPlacing(b.id, null); });
          card.appendChild(pl);
        } else {
          card.appendChild(el('div', 'mt-tag', 'Built'));
        }
        shop.appendChild(card);
      });
      shop.scrollTop = top;
    }

    function renderAll() {
      inkNum.textContent = String(state.ink);
      renderGrid(); renderCtrl(); renderSummary(); renderShop();
    }

    function doBuy(b) {
      if (state.owned[b.id] || state.ink < b.cost || ownedCount(state) < b.tier) return;
      state.ink -= b.cost;
      state.owned[b.id] = true;
      save(state);
      say(b.name + ' bought!');
      startPlacing(b.id, null);
    }

    function startPlacing(id, origin) {
      sel = { id: id, rot: origin ? origin.rot : 0, x: origin ? origin.x : 0, y: origin ? origin.y : 0, hasPos: !!origin, origin: origin };
      renderAll();
    }

    function cancel() {
      if (!sel) return;
      // A picked-up building returns to where it was; a fresh one stays in storage.
      sel = null;
      renderAll();
    }

    function commit() {
      var cand = candidate();
      if (!cand || !fits(state.placed, cand, cand.id)) return;
      state.placed = state.placed.filter(function (p) { return p.id !== cand.id; });
      state.placed.push(cand);
      save(state);
      sel = null;
      renderAll();
    }

    function rotate() {
      if (!sel) return;
      var b = BY_ID[sel.id];
      if (sel.hasPos) {
        // keep pivot under the same grid cell
        var oldP = pivotOf(rotCells(b.shape, sel.rot));
        var ax = sel.x + oldP[0], ay = sel.y + oldP[1];
        sel.rot = (sel.rot + 1) % 4;
        var np = pivotOf(rotCells(b.shape, sel.rot));
        sel.x = ax - np[0]; sel.y = ay - np[1];
      } else {
        sel.rot = (sel.rot + 1) % 4;
      }
      renderGrid(); renderCtrl();
    }

    function cellFromEvent(e) {
      var r = grid.getBoundingClientRect();
      var x = Math.floor((e.clientX - r.left) / (r.width / GRID));
      var y = Math.floor((e.clientY - r.top) / (r.height / GRID));
      if (x < 0 || y < 0 || x >= GRID || y >= GRID) return null;
      return [x, y];
    }

    function moveGhostTo(cell) {
      var piv = pivotOf(rotCells(BY_ID[sel.id].shape, sel.rot));
      var nx = cell[0] - piv[0], ny = cell[1] - piv[1];
      if (sel.hasPos && nx === sel.x && ny === sel.y) return false;
      sel.x = nx; sel.y = ny; sel.hasPos = true;
      return true;
    }

    var drag = null; // { moved, tapOnGhost }
    function onDown(e) {
      var cell = cellFromEvent(e);
      if (!cell) return;
      e.preventDefault();
      try { grid.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (!sel) {
        var occ = occupancy(state.placed, null);
        var id = occ[cell[0] + ',' + cell[1]];
        if (!id) return;
        var p = state.placed.filter(function (q) { return q.id === id; })[0];
        startPlacing(id, { x: p.x, y: p.y, rot: p.rot });
        drag = { moved: false, tapOnGhost: false, pickup: true };
        return;
      }
      var cand = candidate();
      var onGhost = cand && absCells(cand).some(function (c) { return c[0] === cell[0] && c[1] === cell[1]; });
      drag = { moved: false, tapOnGhost: !!onGhost, pickup: false };
      if (!onGhost) { moveGhostTo(cell); renderGrid(); renderCtrl(); }
    }
    function onMove(e) {
      if (!drag || !sel) return;
      var cell = cellFromEvent(e);
      if (!cell) return;
      if (moveGhostTo(cell)) { drag.moved = true; renderGrid(); renderCtrl(); }
    }
    function onUp() {
      if (!drag) return;
      var d = drag; drag = null;
      if (!sel) return;
      // Tapping an existing (valid) ghost confirms. Drag never auto-confirms, except
      // dragging a picked-up building to a new valid spot (a natural "move").
      if ((d.tapOnGhost && !d.moved) || (d.pickup && d.moved)) {
        var cand = candidate();
        if (cand && fits(state.placed, cand, cand.id)) commit();
      }
    }

    grid.addEventListener('pointerdown', onDown);
    grid.addEventListener('pointermove', onMove);
    grid.addEventListener('pointerup', onUp);
    grid.addEventListener('pointercancel', function () { drag = null; });
    rotBtn.addEventListener('click', rotate);
    cancelBtn.addEventListener('click', cancel);
    placeBtn.addEventListener('click', commit);
    play.addEventListener('click', function () {
      if (sel) return;
      save(state);
      if (typeof onPlay === 'function') onPlay();
    });
    function onKey(e) {
      if (!sel) return;
      if (e.key === 'r' || e.key === 'R') rotate();
      else if (e.key === 'Escape') cancel();
      else if (e.key === 'Enter') commit();
    }
    document.addEventListener('keydown', onKey);

    var ro = null;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(layout); ro.observe(root); }
    else window.addEventListener('resize', layout);

    layout();
    renderAll();

    return function unmount() {
      clearTimeout(toastTimer);
      document.removeEventListener('keydown', onKey);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', layout);
      if (root.parentNode) root.parentNode.removeChild(root);
    };
  }

  window.MetaTown = {
    load: load,
    save: save,
    addInk: addInk,
    getRunMods: getRunMods,
    mount: mount,
    resetAll: resetAll,
    BUILDINGS: BUILDINGS,
    PERK_NAMES: PERK_NAMES
  };
})();
