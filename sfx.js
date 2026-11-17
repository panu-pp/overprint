/* Overprint — sound + haptics. Print-shop foley + rising notes.
   All sounds synthesized live with Web Audio. Defines window.Sfx.
   API: Sfx.unlock(), Sfx.play(name, opts), Sfx.haptic(name, opts),
        Sfx.setMuted(b), Sfx.isMuted(), Sfx.setHaptics(b), Sfx.hapticsOn() */
(function () {
  'use strict';

  var ctx = null, master = null, noiseBuf = null;
  var lastPlay = {};

  function load(key, def) {
    try { var v = localStorage.getItem(key); return v === null ? def : v === '1'; } catch (e) { return def; }
  }
  function save(key, b) {
    try { localStorage.setItem(key, b ? '1' : '0'); } catch (e) {}
  }
  var muted = load('overprint_mute', false);
  var haptics = load('overprint_haptics', true);

  function unlock() {
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        var comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.knee.value = 12;
        comp.ratio.value = 4;
        comp.attack.value = 0.003;
        comp.release.value = 0.2;
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(comp);
        comp.connect(ctx.destination);
        var len = Math.floor(ctx.sampleRate * 1.0);
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(function () {});
      // iOS: play a silent blip inside the gesture to fully unlock
      var b = ctx.createBufferSource();
      b.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      b.connect(ctx.destination);
      b.start(0);
    } catch (e) {}
  }

  function ready() {
    return !!(ctx && master && ctx.state === 'running');
  }

  // ---------- primitives ----------
  // envelope: quick attack, exponential decay
  function env(g, t, peak, att, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  // tone(freq, {type, t, dur, gain, att, to, detune, dest})
  function tone(freq, o) {
    o = o || {};
    var t = ctx.currentTime + (o.t || 0);
    var dur = o.dur || 0.2;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || dur));
    if (o.detune) osc.detune.value = o.detune;
    env(g, t, o.gain || 0.3, o.att || 0.004, dur);
    osc.connect(g);
    g.connect(o.dest || master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // noise({t, dur, gain, ftype, f, q, to, att})
  function noise(o) {
    o = o || {};
    var t = ctx.currentTime + (o.t || 0);
    var dur = o.dur || 0.1;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = o.ftype || 'bandpass';
    f.frequency.setValueAtTime(o.f || 1000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    f.Q.value = o.q || 1;
    var g = ctx.createGain();
    env(g, t, o.gain || 0.3, o.att || 0.003, dur);
    src.connect(f); f.connect(g); g.connect(master);
    var off = Math.random() * 0.5;
    src.start(t, off, dur + 0.05);
  }

  // bell-ish pluck: sine fundamental + inharmonic partials
  function bell(freq, t, gain, dur) {
    tone(freq, { t: t, dur: dur, gain: gain, att: 0.002 });
    tone(freq * 2.0, { t: t, dur: dur * 0.6, gain: gain * 0.35, att: 0.002 });
    tone(freq * 2.76, { t: t, dur: dur * 0.35, gain: gain * 0.18, att: 0.002 });
    tone(freq * 5.4, { t: t, dur: dur * 0.15, gain: gain * 0.08, att: 0.001 });
  }

  // woody pluck: triangle with fast decay + click
  function pluck(freq, t, gain, dur) {
    tone(freq, { type: 'triangle', t: t, dur: dur, gain: gain, att: 0.002 });
    tone(freq * 3, { t: t, dur: dur * 0.25, gain: gain * 0.25, att: 0.001 });
    noise({ t: t, dur: 0.015, gain: gain * 0.4, ftype: 'highpass', f: 3000 });
  }

  // major pentatonic from C5, wrapping up an octave every 5 notes
  var PENTA = [0, 2, 4, 7, 9];
  function pentaFreq(n) {
    var i = Math.max(0, (n | 0) - 1);
    var oct = Math.min(Math.floor(i / 5), 2); // cap climb at the C7 octave
    var semi = PENTA[i % 5] + 12 * oct;
    return 523.25 * Math.pow(2, semi / 12);
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ---------- sounds ----------
  var S = {
    pick: function () {
      noise({ dur: 0.07, gain: 0.08, ftype: 'bandpass', f: 2500, to: 4500, q: 0.8, att: 0.02 });
    },
    place: function (o) {
      var s = clamp((o && o.size) || 3, 1, 9);
      var k = (s - 1) / 8; // 0..1
      tone(150 - k * 50, { type: 'sine', dur: 0.12 + k * 0.06, gain: 0.45 + k * 0.15, to: 60, glide: 0.1 });
      noise({ dur: 0.05 + k * 0.03, gain: 0.18 + k * 0.08, ftype: 'lowpass', f: 1400 - k * 400, q: 0.7 });
      noise({ t: 0.004, dur: 0.02, gain: 0.06, ftype: 'highpass', f: 4000 });
    },
    invalid: function () {
      tone(220, { type: 'triangle', dur: 0.09, gain: 0.25, to: 180 });
      noise({ dur: 0.03, gain: 0.08, ftype: 'lowpass', f: 900 });
    },
    clear: function (o) {
      var L = clamp((o && o.lines) || 1, 1, 5);
      var k = (L - 1) / 4;
      // roller chk-chk
      var hits = 2 + Math.min(L, 3) - 1;
      for (var i = 0; i < hits; i++) {
        var t = i * 0.06;
        noise({ t: t, dur: 0.04, gain: 0.22, ftype: 'bandpass', f: 1800 + i * 200 + k * 800, q: 2.5 });
        tone(120 + i * 10, { t: t, dur: 0.05, gain: 0.18, to: 70 });
      }
      // paper rip: rising filtered noise sweep
      var rt = hits * 0.06;
      noise({ t: rt, dur: 0.16 + k * 0.12, gain: 0.2 + k * 0.1, ftype: 'bandpass',
              f: 1200 + k * 600, to: 5000 + k * 3000, q: 1.5, att: 0.01 });
      // tonal sweetener, brighter with more lines
      tone(392 * Math.pow(2, k), { t: rt, dur: 0.25, gain: 0.08 + k * 0.06, type: 'triangle' });
      if (o && o.pure) {
        var base = 1046.5;
        [0, 4, 7, 12].forEach(function (s, j) {
          bell(base * Math.pow(2, s / 12), rt + 0.05 + j * 0.05, 0.1, 0.5);
        });
      }
    },
    step: function (o) {
      var f = pentaFreq((o && o.n) || 1);
      pluck(f, 0, 0.28, 0.28);
      bell(f, 0.0, 0.08, 0.35);
    },
    destroy: function () {
      for (var i = 0; i < 4; i++) {
        noise({ t: i * 0.025 + Math.random() * 0.01, dur: 0.035, gain: 0.25 - i * 0.04,
                ftype: 'bandpass', f: 1500 + Math.random() * 2500, q: 1.8 });
      }
      tone(180, { dur: 0.06, gain: 0.15, type: 'square', to: 80 });
    },
    bomb: function () {
      tone(110, { dur: 0.35, gain: 0.6, to: 35, glide: 0.3 });
      noise({ dur: 0.3, gain: 0.35, ftype: 'lowpass', f: 2500, to: 200, q: 0.7 });
      noise({ dur: 0.05, gain: 0.15, ftype: 'highpass', f: 3000 });
    },
    charge: function () {
      tone(300, { dur: 0.14, gain: 0.28, to: 900, glide: 0.1 });
      tone(900, { t: 0.09, dur: 0.08, gain: 0.08, to: 1300 });
    },
    chain: function () {
      noise({ dur: 0.45, gain: 0.16, ftype: 'bandpass', f: 400, to: 3000, q: 1.2, att: 0.2 });
      // slowed-tape: slightly wobbly detuned pair rising
      tone(260, { type: 'sawtooth', dur: 0.4, gain: 0.05, to: 520, glide: 0.38, att: 0.15, detune: -12 });
      tone(262, { type: 'triangle', dur: 0.4, gain: 0.1, to: 523, glide: 0.38, att: 0.15, detune: 8 });
    },
    // chain multiplier stamp lands: thump + pitch rising with the mult
    mult: function (o) {
      var n = clamp((o && o.n) || 2, 2, 16);
      tone(150 + n * 6, { dur: 0.12, gain: 0.45, to: 55 });
      noise({ dur: 0.05, gain: 0.18, ftype: 'bandpass', f: 1800, q: 1.2 });
      tone(330 * Math.pow(2, (n - 2) / 6), { t: 0.02, dur: 0.18, gain: 0.12, type: 'square', to: 330 * Math.pow(2, (n - 1) / 6) });
      if (n >= 8) bell(1568, 0.05, 0.12, 0.4);
    },
    // board emptied: big press slam + rising bell run
    clean: function () {
      tone(90, { dur: 0.45, gain: 0.6, to: 40, glide: 0.4 });
      noise({ dur: 0.4, gain: 0.3, ftype: 'lowpass', f: 3000, to: 300, q: 0.7 });
      [0, 4, 7, 12, 16, 19, 24].forEach(function (s, i) {
        bell(523.25 * Math.pow(2, s / 12), 0.12 + i * 0.06, 0.14, 0.6);
      });
    },
    payout: function (o) {
      var big = o && o.big;
      noise({ dur: 0.03, gain: 0.12, ftype: 'highpass', f: 2000 });
      bell(1318.5, 0.02, 0.2, 0.5);
      if (big) {
        bell(1760, 0.14, 0.2, 0.55);
        for (var i = 0; i < 6; i++) {
          tone(2600 + Math.random() * 2200, { t: 0.2 + i * 0.04, dur: 0.12, gain: 0.05 });
        }
      }
    },
    levelup: function () {
      [0, 4, 7, 12, 16].forEach(function (s, i) {
        bell(523.25 * Math.pow(2, s / 12), i * 0.07, 0.16, 0.5);
      });
    },
    curse: function () {
      tone(92, { type: 'sawtooth', dur: 0.35, gain: 0.12, detune: -20, to: 80 });
      tone(97, { type: 'sawtooth', dur: 0.35, gain: 0.12, detune: 15, to: 84 });
      noise({ dur: 0.25, gain: 0.06, ftype: 'lowpass', f: 500 });
    },
    ui: function () {
      tone(1400, { dur: 0.03, gain: 0.1, type: 'triangle' });
      noise({ dur: 0.015, gain: 0.05, ftype: 'highpass', f: 5000 });
    },
    buy: function () {
      S.place({ size: 5 });
      bell(1975.5, 0.09, 0.14, 0.35);
      bell(2637, 0.15, 0.1, 0.35);
    },
    gameover: function () {
      for (var i = 0; i < 5; i++) {
        var t = i * 0.16 * (1 + i * 0.15);
        noise({ t: t, dur: 0.06, gain: 0.18 - i * 0.025, ftype: 'bandpass', f: 1600 - i * 250, q: 2 });
        tone(140 - i * 15, { t: t, dur: 0.08, gain: 0.18 - i * 0.02, to: 60 });
      }
      tone(392, { type: 'triangle', dur: 1.2, gain: 0.14, to: 130, glide: 1.1, att: 0.02 });
    }
  };

  // ---------- haptics ----------
  var HAPT = {
    place: function () { return 8; },
    clear: function (o) { var L = clamp((o && o.lines) || 1, 1, 5); return Math.round(20 + (L - 1) * 3.75); },
    step: function () { return 12; },
    bomb: function () { return 45; },
    mult: function (o) { return Math.min(40, 14 + ((o && o.n) || 2) * 2); },
    clean: function () { return [50, 30, 80]; },
    gameover: function () { return [60, 40, 90]; }
  };

  function haptic(name, opts) {
    if (!haptics) return;
    try {
      if (!navigator.vibrate || !HAPT[name]) return;
      navigator.vibrate(HAPT[name](opts));
    } catch (e) {}
  }

  function play(name, opts) {
    haptic(name, opts);
    if (muted || !S[name]) return;
    if (ctx && ctx.state === 'suspended') { try { ctx.resume().catch(function () {}); } catch (e) {} }
    if (!ready()) return;
    var now = performance.now();
    var key = name + (opts && opts.n ? ':' + opts.n : '');
    if (lastPlay[key] && now - lastPlay[key] < 30) return;
    lastPlay[key] = now;
    try { S[name](opts || {}); } catch (e) {}
  }

  window.Sfx = {
    unlock: unlock,
    play: play,
    haptic: haptic,
    setMuted: function (b) { muted = !!b; save('overprint_mute', muted); },
    isMuted: function () { return muted; },
    setHaptics: function (b) { haptics = !!b; save('overprint_haptics', haptics); },
    hapticsOn: function () { return haptics; },
    names: Object.keys(S)
  };
})();
