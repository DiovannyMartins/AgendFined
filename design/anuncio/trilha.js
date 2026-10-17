// Trilha do anúncio: música a 120 BPM, efeitos sonoros e narração, mixados com Web Audio.
// Tudo é sintetizado a partir de window.CUES (marcas de tempo do HTML), então música e
// efeitos acompanham a animação quadro a quadro. A música abaixa sob cada fala.
// Uso: const buf = await renderTrilha({ dur, cues, voices: [{ at, data: ArrayBuffer }] });
(function () {
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const CHORD = { Am: [57, 60, 64, 69], F: [53, 57, 60, 64], C: [55, 60, 64, 67], G: [55, 59, 62, 67] };
  const ROOT = { Am: 45, F: 41, C: 48, G: 43 };

  window.renderTrilha = async function ({ dur, cues, voices = [], stems = 'mix', SR = 48000 }) {
    const ctx = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
    const BEAT = 60 / cues.bpm, BAR = BEAT * 4, D0 = cues.drop, END = cues.end;

    // Ruído e reverb determinísticos
    let seed = 7;
    const rnd = () => { seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
    const noise = ctx.createBuffer(2, SR * 2, SR);
    for (let c = 0; c < 2; c++) { const d = noise.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; }
    const ir = ctx.createBuffer(2, Math.floor(SR * 2.4), SR);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / d.length, 3.2); }

    // Nós
    const G = (dest, v = 1) => { const g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; };
    const F = (type, f, q, dest) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(dest); return n; };
    const P = (p, dest) => { const n = ctx.createStereoPanner(); n.pan.value = p; n.connect(dest); return n; };
    const send = (from, to, amt) => from.connect(G(to, amt));
    const osc = (type, f, t, len, dest) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(dest); o.start(t); o.stop(t + len + .05); return o; };
    const hiss = (t, len, dest) => { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.connect(dest); s.start(t, rnd() * 1.5); s.stop(t + len + .05); return s; };
    const decay = (g, t, v, len) => { g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + len); };

    // Barramentos: música (com ducking), efeitos e voz, somados num compressor
    const want = (s) => stems === 'mix' || stems === s;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 3; comp.attack.value = .004; comp.release.value = .2;
    comp.connect(ctx.destination);
    const musicOut = G(comp, want('music') ? .45 : 0);
    const duck = G(musicOut);
    const music = G(duck);
    const sfx = G(comp, want('sfx') ? .9 : 0);
    const voice = G(F('highpass', 90, .7, G(comp, want('voice') ? 1 : 0)));
    const mverb = ctx.createConvolver(); mverb.buffer = ir; mverb.connect(G(duck, .5));
    const sverb = ctx.createConvolver(); sverb.buffer = ir; sverb.connect(G(sfx, .5));
    const delay = ctx.createDelay(1); delay.delayTime.value = BEAT * .75;
    delay.connect(F('lowpass', 2800, .5, G(delay, .32)));
    delay.connect(G(P(.45, music), .5));
    const delayIn = G(delay);

    // Instrumentos
    function kick(t, v = .9) {
      const g = G(music, 0); decay(g, t, v, .42);
      osc('sine', 160, t, .45, g).frequency.exponentialRampToValueAtTime(46, t + .11);
      const c = G(music, 0); decay(c, t, v * .3, .015); hiss(t, .02, F('highpass', 2500, .7, c));
    }
    function clap(t, v = .3) {
      const g = G(music, 0); send(g, mverb, .3);
      for (const o of [0, .011, .022]) { g.gain.setValueAtTime(v, t + o); g.gain.exponentialRampToValueAtTime(v * .3, t + o + .009); }
      decay(g, t + .033, v, .18);
      hiss(t, .22, F('bandpass', 1400, .9, g));
    }
    function hat(t, v = .06, open = false, p = .2) {
      const g = G(P(p, music), 0); decay(g, t, v, open ? .28 : .045);
      hiss(t, open ? .3 : .06, F('highpass', open ? 7000 : 8500, .6, g));
    }
    function bass(t, m, len, v = .26, cut = 520) {
      const g = G(music, 0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .006); g.gain.exponentialRampToValueAtTime(v * .5, t + len * .8); g.gain.linearRampToValueAtTime(0, t + len);
      const f = F('lowpass', cut, 3, g); f.frequency.setValueAtTime(cut * 2.2, t); f.frequency.exponentialRampToValueAtTime(cut, t + .12);
      osc('sawtooth', midi(m), t, len, f); osc('sine', midi(m - 12), t, len, G(g, .8));
    }
    function pad(t, notes, len, { v = .03, cut = 1800, cutEnd, a = .25, r = .6 } = {}) {
      const g = G(music, 0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.setValueAtTime(v, t + Math.max(a, len)); g.gain.linearRampToValueAtTime(0, t + Math.max(a, len) + r);
      const f = F('lowpass', cut, .7, g); if (cutEnd) { f.frequency.setValueAtTime(cut, t); f.frequency.exponentialRampToValueAtTime(cutEnd, t + len); }
      send(g, mverb, .35);
      for (const m of notes) for (const [cents, p] of [[-9, -.4], [9, .4]]) osc('sawtooth', midi(m), t, len + r, P(p, f)).detune.value = cents;
    }
    function pluck(t, m, v = .05, p = 0) {
      const g = G(P(p, music), 0); decay(g, t, v, .3);
      const f = F('lowpass', 4500, 2, g); f.frequency.setValueAtTime(4500, t); f.frequency.exponentialRampToValueAtTime(700, t + .25);
      osc('square', midi(m), t, .32, f); osc('sawtooth', midi(m), t, .32, f).detune.value = 7;
      send(g, delayIn, .4); send(g, mverb, .15);
    }
    function riser(t0, t1, v = .1, dest = music, verb = mverb) {
      const g = G(dest, 0); g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(v, t1 - .03); g.gain.linearRampToValueAtTime(0, t1);
      const f = F('bandpass', 300, 1.4, g); f.frequency.setValueAtTime(300, t0); f.frequency.exponentialRampToValueAtTime(7000, t1);
      hiss(t0, t1 - t0, f); send(g, verb, .3);
    }
    function impact(t, v = .8, dest = music, verb = mverb) {
      const g = G(dest, 0); decay(g, t, v, 1.4);
      osc('sine', 90, t, 1.5, g).frequency.exponentialRampToValueAtTime(32, t + .9);
      const n = G(dest, 0); decay(n, t, v * .45, .5); hiss(t, .6, F('lowpass', 1800, .5, n)); send(n, verb, .8);
    }
    function crash(t, v = .07) {
      const g = G(music, 0); decay(g, t, v, 1.8); hiss(t, 1.9, F('highpass', 5000, .5, g)); send(g, mverb, .3);
    }

    // Efeitos sonoros
    function whoosh(t, len = .6, v = .16) {
      const p = ctx.createStereoPanner(); p.pan.setValueAtTime(-.6, t); p.pan.linearRampToValueAtTime(.6, t + len); p.connect(sfx);
      const g = G(p, 0); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + len * .55); g.gain.exponentialRampToValueAtTime(.0001, t + len);
      const f = F('bandpass', 350, 1.5, g); f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(2600, t + len * .55); f.frequency.exponentialRampToValueAtTime(800, t + len);
      hiss(t, len, f); send(g, sverb, .25);
    }
    function pop(t, f = 700, v = .2, p = 0) {
      const g = G(P(p, sfx), 0); decay(g, t, v, .12);
      osc('sine', f * 1.7, t, .14, g).frequency.exponentialRampToValueAtTime(f, t + .04);
      send(g, sverb, .12);
    }
    function tap(t, v = .2) {
      const g = G(sfx, 0); decay(g, t, v, .05); osc('sine', 2200, t, .06, g).frequency.exponentialRampToValueAtTime(1300, t + .02);
      const c = G(sfx, 0); decay(c, t, v * .5, .012); hiss(t, .02, F('highpass', 4000, .7, c));
    }
    function chime(t, notes, v = .08, step = .08) {
      notes.forEach((m, i) => {
        const g = G(sfx, 0); decay(g, t + i * step, v, 1.1); send(g, sverb, .35);
        osc('sine', midi(m), t + i * step, 1.15, g); osc('sine', midi(m + 12), t + i * step, .6, G(g, .25));
      });
    }
    function tick(t, v = .05) { const g = G(sfx, 0); decay(g, t, v, .03); osc('triangle', 2600, t, .04, g); }
    function thump(t, v = .3) { const g = G(sfx, 0); decay(g, t, v, .25); osc('sine', 140, t, .26, g).frequency.exponentialRampToValueAtTime(55, t + .2); }

    // Música — abertura (logo)
    pad(0, [60, 64, 67, 71], 2.9, { v: .07, cut: 600, cutEnd: 4000, a: 1, r: .8 });
    impact(cues.logoIn, .45);
    [84, 88, 91, 95, 91, 88, 96, 95].forEach((m, i) => pluck(.45 + i * .3, m, .04, i % 2 ? .4 : -.4));
    // Música — problema: pulso tenso que cresce até o drop
    pad(3.2, [57, 60, 64], D0 - 3.35, { v: .055, cut: 450, cutEnd: 1500, a: .6, r: .15 });
    for (let t = D0 - BEAT / 2; t >= 3.5; t -= BEAT / 2) {
      bass(t, 45, .22, .22, 300);
      if (t >= D0 - 6) hat(t, .045, false, .15);
      if (t >= D0 - 2 * BAR && Math.round((D0 - t) / BEAT * 2) % 2 === 0) kick(t, .5);
    }
    for (let i = 0; i < 16; i++) clap(D0 - BAR / 2 + i * BEAT / 4 - .25, .04 + .2 * i / 15);
    riser(D0 - 3, D0, .12);
    // Música — groove a partir do drop
    impact(D0, .9); crash(D0, .09);
    let lifted = false;
    for (let b = 0; b < cues.bars; b++) {
      const t0 = D0 + b * BAR, lift = t0 >= cues.stats[0].t - 1 && b < cues.bars - 2, last = b === cues.bars - 1;
      const name = b === cues.bars - 2 ? 'F' : last ? 'G' : ['Am', 'F', 'C', 'G'][b % 4], ch = CHORD[name];
      pad(t0, ch, BAR - .05, { v: lift ? .034 : .028, cut: lift ? 2800 : 1700, a: .08, r: .3 });
      if (lift && !lifted) { crash(t0, .08); lifted = true; }
      for (let i = 0; i < 4; i++) {
        const t = t0 + i * BEAT;
        if (!last || i % 2 === 0) kick(t);
        if (i % 2 === 1) clap(t);
        bass(t + BEAT / 2, ROOT[name], .22);
        hat(t + BEAT / 2, lift ? .09 : .07, true, -.2);
        for (let s = 0; s < 4; s++) if (s !== 2) hat(t + s * BEAT / 4, s === 0 ? .035 : .05, false, .25);
      }
      if (lift) for (let s = 0; s < 16; s++) pluck(t0 + s * BEAT / 4, ch[s % 4] + (s % 4 === 3 ? 24 : 12), .036, s % 2 ? .35 : -.35);
      else [0, 1, 2, 3, 2, 1, 2, 3].forEach((n, s) => pluck(t0 + s * BEAT / 2, ch[n] + 12, .045, s % 2 ? .35 : -.35));
      if (b === 10) riser(t0 + 1, t0 + BAR, .07);
    }
    // Final: acorde de Dó resolvendo
    kick(END); impact(END, .75); crash(END, .1);
    pad(END, [48, 60, 64, 67, 72], .45, { v: .045, cut: 3000, a: .01, r: .9 });
    [60, 64, 67, 72].forEach((m, i) => pluck(END + i * .03, m + 12, .05, (i - 1.5) / 3));
    musicOut.gain.setValueAtTime(musicOut.gain.value, dur - .35); musicOut.gain.linearRampToValueAtTime(0, dur);

    // Efeitos nos eventos da tela
    whoosh(cues.logoIn - .15, .5, .08);
    for (const c of cues.chips) pop(c.t + .05, c.me ? 880 : 600, .22, c.me ? .3 : -.3);
    whoosh(cues.wipe - .05, .7, .22);
    for (const t of cues.scenes) whoosh(t - .15, .5, .08);
    whoosh(cues.phoneIn, .8, .12);
    chime(cues.nova, [76, 83], .07);
    for (const t of cues.taps) tap(t);
    chime(cues.check + .05, [72, 76, 79, 84], .07, .07);
    pop(cues.toast + .05, 520, .14); chime(cues.toast + .1, [81], .05);
    whoosh(cues.phoneOut, .7, .1);
    for (const s of cues.stats) {
      thump(s.t, .25);
      // Um tique a cada número da contagem (easeOut de 1,4 s, como no HTML)
      for (let k = 1; k <= s.to; k++) tick(s.t + 1.4 * (1 - Math.cbrt(1 - (k - .5) / s.to)));
    }
    whoosh(cues.outro - .2, .5, .1);
    pop(cues.cta + .15, 480, .16);

    // Narração e ducking da música
    const spans = [];
    for (const v of voices) {
      const buf = await ctx.decodeAudioData(v.data.slice(0));
      const s = ctx.createBufferSource(); s.buffer = buf; s.connect(voice); s.start(v.at);
      spans.push([v.at, v.at + buf.duration]);
    }
    // Falas com menos de 0,6 s de intervalo viram um trecho só, para a música não subir no meio.
    const merged = [];
    for (const sp of spans.sort((x, y) => x[0] - y[0])) {
      const prev = merged[merged.length - 1];
      if (prev && sp[0] - prev[1] < .6) prev[1] = Math.max(prev[1], sp[1]); else merged.push([...sp]);
    }
    const LOW = .32;
    for (const [a, b] of merged) {
      duck.gain.setValueAtTime(1, Math.max(0, a - .15)); duck.gain.linearRampToValueAtTime(LOW, a);
      duck.gain.setValueAtTime(LOW, b); duck.gain.linearRampToValueAtTime(1, b + .35);
    }
    return { buffer: await ctx.startRendering(), spans };
  };
})();
