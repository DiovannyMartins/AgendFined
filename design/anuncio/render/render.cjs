// Renderiza o anúncio quadro a quadro no Chrome (Playwright + WebCodecs) e mixa a trilha de trilha.js.
// Uso: node design/anuncio/render/render.cjs <html> <saida.mp4> 30 <pasta-da-narracao>
const { chromium } = require('D:/projeto/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const [html, out, fpsArg, voiceDir] = process.argv.slice(2);
const FPS = +(fpsArg || 30), W = 1080, H = 1920;
const fileUrl = (p) => 'file:///' + p.split(String.fromCharCode(92)).join('/');
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--allow-file-access-from-files'] });
  const ad = await b.newPage({ viewport: { width: W, height: H } });
  ad.on('pageerror', e => console.error('AD', e.message));
  await ad.goto(fileUrl(html)); await ad.evaluate(() => document.fonts.ready);
  const enc = await b.newPage();
  enc.on('pageerror', e => console.error('ENC', e.message));
  await enc.goto(fileUrl(path.join(__dirname, 'enc.html')));
  await enc.addScriptTag({ path: path.join(__dirname, 'mp4-muxer.js') });
  await enc.evaluate(({ W, H, FPS }) => {
    const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: FPS }, audio: { codec: 'aac', sampleRate: 48000, numberOfChannels: 2 }, fastStart: 'in-memory' });
    const encoder = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: e => { window.__err = String(e); } });
    encoder.configure({ codec: 'avc1.640032', width: W, height: H, bitrate: 12e6, framerate: FPS, avc: { format: 'avc' } });
    window.__enc = { muxer, encoder, i: 0 };
    window.__add = async (b64) => {
      const blob = await (await fetch('data:image/jpeg;base64,' + b64)).blob();
      const bmp = await createImageBitmap(blob);
      const f = new VideoFrame(bmp, { timestamp: Math.round(__enc.i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      __enc.encoder.encode(f, { keyFrame: __enc.i % (FPS * 2) === 0 }); f.close(); bmp.close(); __enc.i++;
      if (__enc.encoder.encodeQueueSize > 10) await new Promise(r => __enc.encoder.addEventListener('dequeue', r, { once: true }));
    };
    window.__finish = async () => { await __enc.encoder.flush(); __enc.muxer.finalize(); const buf = __enc.muxer.target.buffer; let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  }, { W, H, FPS });
  const dur = await ad.evaluate(() => window.DURATION);
  const n = Math.round(dur * FPS);
  for (let i = 0; i < n; i++) {
    await ad.evaluate(t => render(t), i / FPS);
    const jpg = await ad.screenshot({ type: 'jpeg', quality: 92 });
    await enc.evaluate(b64 => __add(b64), jpg.toString('base64'));
    if (i % 150 === 0) console.log(`frame ${i}/${n}`);
  }
  if (voiceDir) {
    const cues = await ad.evaluate(() => window.CUES);
    await enc.addScriptTag({ path: path.join(path.dirname(html), 'trilha.js') });
    const clips = Object.entries(await ad.evaluate(() => window.NARRATION)).map(([k, at]) => ({ at, b64: fs.readFileSync(path.join(voiceDir, k + '.mp3')).toString('base64') }));
    console.log('audio', await enc.evaluate(async ({ clips, dur, cues }) => {
      const SR = 48000;
      const voices = clips.map(c => ({ at: c.at, data: Uint8Array.from(atob(c.b64), ch => ch.charCodeAt(0)).buffer }));
      const { buffer: mix } = await renderTrilha({ dur, cues, voices, SR });
      const ch = [mix.getChannelData(0), mix.getChannelData(1)];
      let peak = 0; for (const d of ch) for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
      const g = peak > 0 ? 0.89 / peak : 1; for (const d of ch) for (let i = 0; i < d.length; i++) d[i] *= g;
      const ae = new AudioEncoder({ output: (c, m) => __enc.muxer.addAudioChunk(c, m), error: e => { window.__err = String(e); } });
      ae.configure({ codec: 'mp4a.40.2', sampleRate: SR, numberOfChannels: 2, bitrate: 192000 });
      for (let i = 0; i < mix.length; i += 1024) {
        const n = Math.min(1024, mix.length - i), data = new Float32Array(n * 2);
        data.set(ch[0].subarray(i, i + n), 0); data.set(ch[1].subarray(i, i + n), n);
        ae.encode(new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i * 1e6 / SR), data }));
      }
      await ae.flush(); return { peak, gain: g, seconds: mix.length / SR };
    }, { clips, dur, cues }));
  }
  const err = await enc.evaluate(() => window.__err);
  if (err) throw new Error(err);
  fs.writeFileSync(out, Buffer.from(await enc.evaluate(() => __finish()), 'base64'));
  console.log('done', out, fs.statSync(out).size);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
