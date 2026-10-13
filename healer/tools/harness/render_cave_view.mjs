// 동굴 시트만 보기 좋게 렌더(down/up/right 4프레임 + attack 2프레임, 3x) + 2x 미리보기
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const [dir, out, only] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 2400 } });
let failed = false;
page.on('pageerror', e => { failed = true; console.log('PAGEERROR', e.message); });
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.setContent('<canvas id="c"></canvas>');
await page.addScriptTag({ path: dir + '/pixel.js' });
await page.addScriptTag({ path: dir + '/sprites_monsters.js' });
await page.addScriptTag({ path: dir + '/sprites_monsters_cave.js' });
const data = await page.evaluate((only) => {
  let ids = MonsterSprites.list(); if (only) ids = ids.filter(i => only.split(',').includes(i));
  const sheets = {}; for (const id of ids) sheets[id] = MonsterSprites.get(id);
  const S = 3, pad = 2, labelW = 130;
  const c = document.getElementById('c');
  const rowH = s => (s.h + pad * 2) * S;
  const list = ids.map(i => sheets[i]);
  c.width = labelW + Math.max(...list.map(s => (s.w + pad) * S * 14)); c.height = list.reduce((a, s) => a + rowH(s), 0) + 260;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#4a4a5a'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = 'bold 14px sans-serif'; ctx.textBaseline = 'middle';
  let y = 0;
  for (const id of ids) {
    const s = sheets[id]; ctx.fillStyle = '#fff'; ctx.fillText(`${id} ${s.w}x${s.h}`, 6, y + 12);
    let x = labelW;
    const imgs = [...s.down, ...s.up, ...s.right, ...(s.attack || [])];
    for (const img of imgs) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, y + (s.anchor.y + pad) * S, (img.width + pad) * S - 2, 1); ctx.drawImage(img, x + pad * S, y + pad * S, img.width * S, img.height * S); x += (img.width + pad) * S; }
    y += rowH(s);
  }
  ctx.fillStyle = '#5a6a4a'; ctx.fillRect(0, y + 10, c.width, 240);
  let x = 10;
  for (const id of ids) { const s = sheets[id]; const img = s.down[0]; ctx.drawImage(img, x, y + 240 - img.height * 2, img.width * 2, img.height * 2); x += img.width * 2 + 8; }
  return { png: c.toDataURL('image/png'), count: ids.length };
}, only || '');
writeFileSync(out, Buffer.from(data.png.split(',')[1], 'base64')); console.log('wrote', out, data.count);
await browser.close(); process.exit(failed ? 1 : 0);
