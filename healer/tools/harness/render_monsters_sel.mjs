// 선택 렌더: node render_monsters_sel.mjs <jsDir> <out.png> <id1,id2,...> [scale]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { writeFileSync, existsSync } from 'node:fs';
const [dir, out, idsArg, scaleArg] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 2400 } });
let failed = false;
page.on('pageerror', e => { failed = true; console.log('PAGEERROR', e.message); });
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.setContent('<canvas id="c"></canvas>');
await page.addScriptTag({ path: dir + '/pixel.js' });
await page.addScriptTag({ path: dir + '/sprites_monsters.js' });
await page.addScriptTag({ path: dir + '/sprites_monsters_cave.js' });
const data = await page.evaluate(({ idsArg, S }) => {
  const ids = idsArg.split(',');
  const dirs = ['down', 'up', 'right', 'left'];
  const sheets = {}; for (const id of ids) sheets[id] = MonsterSprites.get(id);
  const list = Object.values(sheets); const pad = 2;
  const rowH = (s) => (s.h + pad * 2) * S;
  const c = document.getElementById('c');
  const maxW = Math.max(...list.map(s => s.w));
  c.width = (maxW + pad) * S * 18 + 10; c.height = list.reduce((a, s) => a + rowH(s), 0) + 10;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#3f9f85'; ctx.fillRect(0, 0, c.width, c.height);
  let y = 0;
  for (const id of ids) {
    const s = sheets[id]; let x = 4;
    for (const d of dirs) for (const img of (s[d] || [])) { ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(x, y + (s.anchor.y + pad) * S, (img.width + pad) * S, 1); ctx.drawImage(img, x + pad * S, y + pad * S, img.width * S, img.height * S); x += (img.width + pad) * S; }
    for (const img of (s.attack || [])) { ctx.drawImage(img, x + pad * S, y + pad * S, img.width * S, img.height * S); x += (img.width + pad) * S; }
    y += rowH(s);
  }
  return { png: c.toDataURL('image/png'), missing: list.filter(s => s.missing).map(s => s.missing) };
}, { idsArg, S: +(scaleArg || 3) });
if (data.missing.length) console.log('MISSING', data.missing);
writeFileSync(out, Buffer.from(data.png.split(',')[1], 'base64'));
await browser.close(); process.exit(failed ? 1 : 0);
