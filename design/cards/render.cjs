// Captura cada .card de agendfined-cards.html como PNG 1080×1350, nas duas versões:
// png/organico (rodapé "link na bio") e png/anuncio (só o site; o botão é do Instagram).
// Uso: node design/cards/render.cjs [pasta-de-saida]
const { chromium } = require('D:/projeto/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const html = path.join(__dirname, 'agendfined-cards.html');
const out = process.argv[2] || path.join(__dirname, 'png');
const fileUrl = (p) => 'file:///' + p.split(String.fromCharCode(92)).join('/');
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--allow-file-access-from-files'] });
  const page = await b.newPage({ viewport: { width: 1200, height: 1500 } });
  page.on('pageerror', e => console.error(e.message));
  for (const v of ['organico', 'anuncio']) {
    const dir = path.join(out, v);
    fs.mkdirSync(dir, { recursive: true });
    await page.goto(fileUrl(html) + '?v=' + v, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    for (const card of await page.$$('.card')) {
      const file = path.join(dir, (await card.getAttribute('id')) + '.png');
      await card.screenshot({ path: file });
      console.log(file);
    }
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
