/* Overprint meta layer: Town map (v2, center-out unlock).
 * Plain browser script. Defines window.MetaTown.
 * 5x5 map. The player owns the center (Press House) and buys any locked tile
 * that touches an owned tile (up/down/left/right). Every tile shows its reward;
 * cost grows with distance from the center. Rewards apply to every run.
 * API: load, save, addInk, getRunMods, mount(el, state, onPlay) -> unmount, resetAll.
 */
(function () {
  'use strict';

  var KEY = 'blockrogue_meta_v2', OLD_KEY = 'blockrogue_meta_v1';
  var SIZE = 5, HOME = '2,2';
  var BASE = ['shatter', 'reroll', 'golddust', 'domino', 'narrow', 'crease', 'nudge', 'tilt', 'turn', 'wetpatch', 'smudge', 'pebble', 'aftershock', 'wetink'];
  var COST = [0, 15, 35, 60, 110]; // by Manhattan distance from center. Full map = 1260 Ink.
  var INK = { R: 'red', Y: 'yellow', B: 'blue' };

  // perk id -> [name, ink, type, description]
  var PERK = {
    bomb:    ['Ink Bomb', 'R', 'act', 'Auto: WHEN a pure line clears → blast the most crowded 3×3. Arm (2 red) → 5×5.'],
    recolor: ['Overink', 'R', 'act', 'Auto: WHEN a chain opens → re-ink a + shape to chain ink. Arm (1 red) → 3×3.'],
    slide:   ['Slide', 'B', 'react', 'Auto: WHEN a column clears → every block right of it shifts 1 step left.'],
    echo:    ['Echo', 'B', 'react', 'Auto: WHEN Overink is used → +1 charge.'],
    prism:   ['Prism', 'Y', 'react', 'Auto: WHEN a pure line clears → +1 charge of its ink.'],
    spark:   ['Spark', 'R', 'react', 'Auto: WHEN perks destroy blocks → +20 pot each.'],
    siphon:  ['Siphon', 'B', 'react', 'Auto: WHEN a red block is destroyed → +1 blue charge.'],
    thrift:  ['Thrift', 'Y', 'pass', 'Passive: the first armable perk to fire each chain is boosted for free.'],
    spill:   ['Spill', 'X', 'curse', 'Curse +50% score: after each tray, 0–2 grey blocks land. Grey blocks you clear or destroy add chain +1.'],
    heavy:   ['Heavy Type', 'X', 'curse', 'Curse +50% score: pieces come bigger; line points ×1.25.'],
    blot:    ['Ink Blot', 'X', 'curse', 'Curse +50% score: a sealed 2×2 blot inside the board; clears through it score ×3.']
  };

  // Map layout. Ring 1 = cheap engine starters, outer ring + corners = big rewards.
  var TILES = {
    '2,2': { kind: 'home' },
    '1,2': { kind: 'perk', id: 'slide' },  '3,2': { kind: 'charge', ink: 'Y' },
    '2,1': { kind: 'perk', id: 'bomb' },  '2,3': { kind: 'exp', v: 0.1 },
    '0,2': { kind: 'perk', id: 'recolor' }, '4,2': { kind: 'charge', ink: 'R' },
    '2,0': { kind: 'perk', id: 'spill' },  '2,4': { kind: 'charge', ink: 'B' },
    '1,1': { kind: 'perk', id: 'spark' },   '1,3': { kind: 'score', v: 0.1 },
    '3,1': { kind: 'exp', v: 0.1 },         '3,3': { kind: 'perk', id: 'siphon' },
    '0,1': { kind: 'perk', id: 'echo' },    '0,3': { kind: 'perk', id: 'heavy' },
    '1,0': { kind: 'perk', id: 'thrift' },  '1,4': { kind: 'perk', id: 'prism' },
    '3,0': { kind: 'score', v: 0.1 },       '3,4': { kind: 'wet', max: 3 },
    '4,1': { kind: 'perk', id: 'blot' },   '4,3': { kind: 'score', v: 0.1 },
    '0,0': { kind: 'slot' }, '4,4': { kind: 'slot' },
    '0,4': { kind: 'kit' },  '4,0': { kind: 'score', v: 0.2, big: true }
  };

  function rc(key) { var p = key.split(','); return [+p[0], +p[1]]; }
  function dist(key) { var p = rc(key); return Math.abs(p[0] - 2) + Math.abs(p[1] - 2); }
  function costOf(key) { return COST[dist(key)]; }
  // upgradeable tiles (max > 1): level n+1 costs base x (n+1)
  function maxOf(key) { return (TILES[key] && TILES[key].max) || 1; }
  function lvOf(s, key) { return owns(s, key) ? ((s.lv && s.lv[key]) || 1) : 0; }
  function nextCost(s, key) { return costOf(key) * (lvOf(s, key) + 1); }
  function spent(s, key) { var n = lvOf(s, key), t = 0; for (var i = 1; i <= n; i++) t += costOf(key) * i; return t; }
  function upgradable(s, key) { return owns(s, key) && lvOf(s, key) < maxOf(key); }

  function info(key, s) {
    var t = TILES[key];
    switch (t.kind) {
      case 'home': return { name: 'Press House', label: 'HOME', ink: 'D', glyph: '⌂', desc: 'Your print shop. Expand outward from here.' };
      case 'perk': {
        var p = PERK[t.id];
        var g = p[2] === 'curse' ? '☠' : p[2] === 'act' ? '▶' : p[2] === 'react' ? '↺' : '∞';
        return { name: p[0], label: p[0].split(' ').pop().toUpperCase(), ink: p[1], glyph: g, desc: 'Unlocks ' + p[0] + ' in level-up picks. ' + p[3] };
      }
      case 'charge': return { name: INK[t.ink][0].toUpperCase() + INK[t.ink].slice(1) + ' Well', label: '+1 CHG', ink: t.ink, glyph: '●', desc: 'Start every run with +1 ' + INK[t.ink] + ' charge.' };
      case 'exp': return { name: 'Study', label: '+10% EXP', ink: 'B', glyph: '✦', desc: '+10% EXP in every run.' };
      case 'score': return { name: t.big ? 'Masterprint' : 'Gallery', label: '+' + Math.round(t.v * 100) + '% PTS', ink: 'R', glyph: '×', desc: '+' + Math.round(t.v * 100) + '% score in every run.' };
      case 'slot': return { name: 'Workshop', label: '+1 SLOT', ink: 'Y', glyph: '▢', desc: '+1 perk slot in your rack.' };
      case 'wet': { var lv = s ? lvOf(s, key) : 0;
        return { name: 'Retarder', label: lv ? 'WET ' + lv + '/' + t.max : 'WET +10%', ink: 'B', glyph: '≈', desc: 'Slows drying: Wet Ink stacks +10% more of each chain\'s gain per level (' + lv + '/' + t.max + ' built). Only matters when you pick Wet Ink in a run.' }; }
      case 'kit': return { name: 'Starter Kit', label: 'KIT', ink: 'Y', glyph: '★', desc: 'Start each run with a random unlocked active perk.' };
    }
  }

  /* ---------- state ---------- */
  var mem = null;
  function fresh() { return { v: 2, ink: 0, totalInk: 0, owned: [HOME], lv: {} }; }
  function read(k) { try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function load() {
    var s = read(KEY);
    if (s && Array.isArray(s.owned)) { if (!s.lv) s.lv = {}; mem = s; return s; }
    if (mem) return mem;
    s = fresh();
    // migrate from the old polyomino town: keep ink balance + refund what was spent
    var old = read(OLD_KEY);
    if (old) {
      var refund = { bombshed: 20, inkwell: 25, dyevat: 35, rubbleyard: 40, printshop: 45, echohall: 60, sparkforge: 65, thriftmkt: 70, siphonmill: 75, prismtower: 95, foundry: 100, gallery: 140 };
      var ink = old.ink | 0;
      if (old.owned) Object.keys(old.owned).forEach(function (id) { if (old.owned[id]) ink += refund[id] || 0; });
      s.ink = ink; s.totalInk = old.totalInk | 0;
    }
    mem = s; save(s); return s;
  }
  function save(s) { mem = s; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { } }
  function addInk(s, n) { s.ink += Math.max(0, n | 0); s.totalInk = (s.totalInk | 0) + Math.max(0, n | 0); save(s); }
  function owns(s, key) { return s.owned.indexOf(key) >= 0; }
  function buyable(s, key) {
    if (owns(s, key)) return upgradable(s, key);
    var p = rc(key);
    return [[-1, 0], [1, 0], [0, -1], [0, 1]].some(function (d) { return owns(s, (p[0] + d[0]) + ',' + (p[1] + d[1])); });
  }
  function buy(s, key) {
    if (!buyable(s, key)) return false;
    if (owns(s, key)) { var uc = nextCost(s, key); if (s.ink < uc) return false; s.ink -= uc; if (!s.lv) s.lv = {}; s.lv[key] = lvOf(s, key) + 1; save(s); }
    else { if (s.ink < costOf(key)) return false; s.ink -= costOf(key); s.owned.push(key); save(s); }
    if (window.Sfx) { try { window.Sfx.play('buy'); } catch (e) { } }
    return true;
  }

  function getRunMods(s) {
    var m = { unlocked: BASE.slice(), startCharges: { R: 0, Y: 0, B: 0 }, extraSlots: 0, expMult: 1, scoreMult: 1, startPerk: null, wetBonus: 0 };
    var kit = false;
    s.owned.forEach(function (k) {
      var t = TILES[k]; if (!t) return;
      if (t.kind === 'perk') m.unlocked.push(t.id);
      else if (t.kind === 'charge') m.startCharges[t.ink]++;
      else if (t.kind === 'exp') m.expMult += t.v;
      else if (t.kind === 'score') m.scoreMult += t.v;
      else if (t.kind === 'slot') m.extraSlots++;
      else if (t.kind === 'kit') kit = true;
      else if (t.kind === 'wet') m.wetBonus += 0.1 * lvOf(s, k);
    });
    m.expMult = Math.round(m.expMult * 100) / 100;
    m.scoreMult = Math.round(m.scoreMult * 100) / 100;
    m.wetBonus = Math.round(m.wetBonus * 100) / 100;
    if (kit) {
      var acts = ['shatter', 'reroll', 'nudge', 'tilt', 'turn', 'bomb', 'recolor'].filter(function (id) { return m.unlocked.indexOf(id) >= 0; });
      m.startPerk = acts[(Math.random() * acts.length) | 0];
    }
    return m;
  }

  /* ---------- UI ---------- */
  var CSS = '' +
    '.mt-root{position:absolute;inset:0;display:flex;flex-direction:column;gap:1.6cqh;padding:3cqh 5cqw 2.4cqh;box-sizing:border-box;background:var(--paper);color:var(--ink-dark);font-family:var(--font-body)}' +
    '.mt-head{display:flex;align-items:flex-end;justify-content:space-between}' +
    '.mt-title{font-family:var(--font-display);font-size:8cqw;line-height:1;text-shadow:.6cqw .5cqw 0 var(--ink-y)}' +
    '.mt-ink{font-family:var(--font-display);font-size:5cqw;font-variant-numeric:tabular-nums}' +
    '.mt-ink small{font-family:var(--font-body);font-size:2.6cqw;letter-spacing:.12em;margin-right:1.4cqw;opacity:.7}' +
    '.mt-hint{font-size:2.9cqw;opacity:.75;margin:0}' +
    '.mt-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:1.6cqw;width:100%;aspect-ratio:1/1;max-width:100%}' +
    '.mt-t{position:relative;border:.5cqw solid var(--ink-dark);border-radius:3px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.3cqh;' +
      'font-family:var(--font-display);color:var(--ink-dark);background:#fffaf0;padding:0;cursor:pointer;min-width:0;overflow:hidden}' +
    '.mt-t .g{font-size:5cqw;line-height:1}' +
    '.mt-t .l{font-size:1.9cqw;line-height:1.1;text-align:center;letter-spacing:.02em}' +
    '.mt-t .c{position:absolute;bottom:.4cqh;right:1cqw;font-family:var(--font-body);font-weight:700;font-size:2.1cqw}' +
    '.mt-t.own{background:var(--tc);box-shadow:.8cqw .7cqw 0 var(--ink-dark)}' +
    '.mt-t.own.dk{color:var(--paper)}' +
    '.mt-t.buy{border-style:dashed;border-color:var(--tc);border-width:.7cqw;animation:mt-pulse 1.2s ease-in-out infinite}' +
    '.mt-t.buy.ok{background:color-mix(in srgb,var(--tc) 18%,#fffaf0)}' +
    '.mt-t.lock{opacity:.38}' +
    '.mt-t.own.up{border-style:dashed;animation:mt-pulse 1.2s ease-in-out infinite}' +
    '.mt-t.sel{outline:.8cqw solid var(--ink-r);outline-offset:.5cqw;z-index:1}' +
    '@keyframes mt-pulse{50%{transform:scale(.94)}}' +
    '.mt-panel{border:.5cqw solid var(--ink-dark);border-radius:3px;background:#fffaf0;padding:1.4cqh 3.4cqw;display:grid;grid-template-columns:1fr auto;gap:.6cqh 3cqw;align-items:center;box-shadow:.8cqw .7cqw 0 var(--pc,var(--ink-dark))}' +
    '.mt-panel h3{margin:0;font-family:var(--font-display);font-weight:400;font-size:4.2cqw}' +
    '.mt-panel p{margin:0;font-size:2.9cqw;line-height:1.35;grid-column:1/-1}' +
    '.mt-buy{font-family:var(--font-display);font-size:3.4cqw;background:var(--ink-dark);color:var(--paper);border:0;border-radius:3px;padding:1cqh 3.6cqw;box-shadow:.6cqw .5cqw 0 var(--ink-r);cursor:pointer}' +
    '.mt-buy:disabled{opacity:.35;cursor:default;box-shadow:none}' +
    '.mt-sum{font-size:2.7cqw;line-height:1.4;opacity:.85}' +
    '.mt-sum b{font-family:var(--font-display);font-weight:400}' +
    '.mt-foot{margin-top:auto;display:flex;gap:3cqw;align-items:center}' +
    '.mt-play{flex:1;font-family:var(--font-display);font-size:5cqw;background:var(--ink-dark);color:var(--paper);border:0;border-radius:3px;padding:1.6cqh 0;box-shadow:1cqw .8cqw 0 var(--ink-r);cursor:pointer}' +
    '.mt-reset{font-family:var(--font-body);font-size:2.4cqw;background:transparent;border:.4cqw solid var(--ink-dark);border-radius:3px;padding:1cqh 2cqw;color:var(--ink-dark);cursor:pointer;opacity:.6}' +
    '.mt-t:focus-visible,.mt-buy:focus-visible,.mt-play:focus-visible{outline:.8cqw solid var(--ink-b);outline-offset:.4cqw}' +
    '@media (prefers-reduced-motion:reduce){.mt-t.buy{animation:none}}';

  function injectCss() {
    if (document.getElementById('mt-css')) return;
    var st = document.createElement('style'); st.id = 'mt-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  var TC = { R: 'var(--ink-r)', Y: 'var(--ink-y)', B: 'var(--ink-b)', X: 'var(--ink-grey)', D: 'var(--ink-dark)' };

  function mount(el, state, onPlay) {
    injectCss();
    var root = document.createElement('div'); root.className = 'mt-root';
    el.appendChild(root);
    var sel = null, resetArm = false;

    function pickDefault() {
      var best = null;
      Object.keys(TILES).forEach(function (k) {
        if (buyable(state, k) && (best === null || costOf(k) < costOf(best))) best = k;
      });
      return best || HOME;
    }
    sel = pickDefault();

    function summary() {
      var m = getRunMods(state);
      var extra = m.unlocked.filter(function (id) { return BASE.indexOf(id) < 0; }).map(function (id) { return PERK[id][0]; });
      var parts = [];
      var ch = ['R', 'Y', 'B'].filter(function (k) { return m.startCharges[k]; }).map(function (k) { return '+' + m.startCharges[k] + ' ' + INK[k]; });
      if (ch.length) parts.push('Start charges ' + ch.join(', '));
      if (m.extraSlots) parts.push('+' + m.extraSlots + ' slot');
      if (m.expMult > 1) parts.push('EXP ×' + m.expMult);
      if (m.scoreMult > 1) parts.push('Score ×' + m.scoreMult);
      if (m.wetBonus > 0) parts.push('Wet Ink +' + Math.round(m.wetBonus * 100) + '%');
      return '<b>' + (state.owned.length - 1) + '/24 tiles</b> · ' + (parts.length ? parts.join(' · ') : 'no run bonuses yet') +
        '<br>Unlocked: ' + (extra.length ? extra.join(', ') : 'base perks only');
    }

    function render() {
      var html = '<div class="mt-head"><div class="mt-title">TOWN</div><div class="mt-ink"><small>INK</small>' + state.ink + '</div></div>' +
        '<p class="mt-hint">Buy tiles next to ones you own. Further from the center = pricier, stronger.</p><div class="mt-grid">';
      for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) {
        var k = r + ',' + c, f = info(k, state), own = owns(state, k), can = buyable(state, k), up = upgradable(state, k), cost = own ? nextCost(state, k) : costOf(k);
        var cls = 'mt-t ' + (own ? 'own' + (f.ink === 'D' || f.ink === 'B' || f.ink === 'X' ? ' dk' : '') + (up ? ' up' : '') : can ? 'buy' + (state.ink >= cost ? ' ok' : '') : 'lock') + (k === sel ? ' sel' : '');
        html += '<button type="button" class="' + cls + '" data-k="' + k + '" style="--tc:' + TC[f.ink] + '" aria-label="' + f.name + (own && !up ? ', owned' : (up ? ', upgrade costs ' : ', costs ') + cost + ' ink') + '">' +
          '<span class="g">' + f.glyph + '</span><span class="l">' + f.label + '</span>' + (own && !up ? '' : '<span class="c">' + cost + '</span>') + '</button>';
      }
      html += '</div>';
      var f2 = info(sel, state), own2 = owns(state, sel), can2 = buyable(state, sel), up2 = upgradable(state, sel), cost2 = own2 ? nextCost(state, sel) : costOf(sel);
      var btn = up2 ? '<button class="mt-buy" data-buy="1"' + (state.ink < cost2 ? ' disabled' : '') + '>UPGRADE · ' + cost2 + '</button>' :
        own2 ? '<button class="mt-buy" disabled>' + (maxOf(sel) > 1 ? 'MAX' : 'OWNED') + '</button>' :
        !can2 ? '<button class="mt-buy" disabled>LOCKED</button>' :
        '<button class="mt-buy" data-buy="1"' + (state.ink < cost2 ? ' disabled' : '') + '>BUY · ' + cost2 + '</button>';
      html += '<div class="mt-panel" style="--pc:' + TC[f2.ink] + '"><h3>' + f2.glyph + ' ' + f2.name + '</h3>' + btn + '<p>' + f2.desc +
        (!own2 && !can2 ? ' Own a neighbouring tile first.' : ((!own2 || up2) && state.ink < cost2 ? ' Need ' + (cost2 - state.ink) + ' more Ink.' : '')) + '</p></div>';
      html += '<div class="mt-sum">' + summary() + '</div>';
      html += '<div class="mt-foot"><button class="mt-play" data-play="1">PLAY RUN</button><button class="mt-reset" data-reset="1">' + (resetArm ? 'Tap again: refund all' : 'Refund all') + '</button></div>';
      root.innerHTML = html;
    }

    function onClick(e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.dataset.k) { sel = t.dataset.k; resetArm = false; render(); return; }
      if (t.dataset.buy) { if (buy(state, sel)) { var nx = sel; sel = nx; } render(); return; }
      if (t.dataset.play) { onPlay && onPlay(); return; }
      if (t.dataset.reset) {
        if (!resetArm) { resetArm = true; render(); return; }
        var f = fresh(); state.ink = state.ink + state.owned.reduce(function (s, k) { return s + spent(state, k); }, 0);
        state.owned = f.owned; state.lv = {}; save(state); resetArm = false; sel = pickDefault(); render();
      }
    }
    root.addEventListener('click', onClick);
    render();
    return function unmount() { root.removeEventListener('click', onClick); if (root.parentNode) root.parentNode.removeChild(root); };
  }

  function resetAll() { var s = fresh(); save(s); return s; }

  window.MetaTown = { load: load, save: save, addInk: addInk, getRunMods: getRunMods, mount: mount, resetAll: resetAll, TILES: TILES };
})();
