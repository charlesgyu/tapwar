// 몬스터 시트 렌더: node render_monsters.mjs <jsDir> <out.png>   (pixel.js + sprites_monsters.js)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { writeFileSync, existsSync } from 'node:fs';
const [dir, out] = process.argv.slice(2);
if (!dir || !out) { console.error('usage: render_monsters.mjs <jsDir> <out.png>'); process.exit(1); }
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 2400 } });
let failed = false;
page.on('pageerror', e => { failed = true; console.log('PAGEERROR', e.message); });
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.setContent('<canvas id="c"></canvas>');
await page.addScriptTag({ path: dir + '/pixel.js' });
await page.addScriptTag({ path: dir + '/sprites_monsters.js' });
for (const f of ['sprites_monsters_forest.js', 'sprites_monsters_cave.js']) if (existsSync(dir + '/' + f)) await page.addScriptTag({ path: dir + '/' + f });
const data = await page.evaluate(() => {
  const ids = MonsterSprites.list();
  const dirs = ['down', 'up', 'right', 'left'];
  const sheets = {}; const errs = [];
  for (const id of ids) { try { sheets[id] = MonsterSprites.get(id); } catch (e) { errs.push(id + ': ' + e.message); } }
  const list = Object.values(sheets); if (!list.length) return { errs };
  const S = 3, pad = 2, labelW = 150;
  const rowH = (s) => (s.h + pad * 2) * S;
  const c = document.getElementById('c');
  const maxW = Math.max(...list.map(s => s.w));
  const frames = (s) => Math.max(...dirs.map(d => (s[d] || []).length)) + ((s.attack || []).length);
  c.width = labelW + (maxW + pad) * S * 20; c.height = list.reduce((a, s) => a + rowH(s), 0) + 120 + 200;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#3f9f85'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
  let y = 0;
  for (const id of ids) {
    const s = sheets[id]; if (!s) continue;
    ctx.fillStyle = '#fff'; ctx.fillText(`${id} ${s.w}x${s.h}`, 6, y + rowH(s) / 2);
    let x = labelW;
    for (const d of dirs) for (const img of (s[d] || [])) { ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(x, y + (s.anchor.y + pad) * S, (img.width + pad) * S, 1); ctx.drawImage(img, x + pad * S, y + pad * S, img.width * S, img.height * S); x += (img.width + pad) * S; }
    for (const img of (s.attack || [])) { ctx.drawImage(img, x + pad * S, y + pad * S, img.width * S, img.height * S); x += (img.width + pad) * S; }
    y += rowH(s);
  }
  // 2x 미리보기
  ctx.fillStyle = '#5a8a3a'; ctx.fillRect(0, y + 10, c.width, 190);
  let x = 10;
  for (const id of ids) { const s = sheets[id]; if (!s) continue; const img = s.down[0]; ctx.drawImage(img, x, y + 190 - img.height * 2, img.width * 2, img.height * 2); x += img.width * 2 + 8; if (x > c.width - 200) break; }
  ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.fillText('↑ 3x 시트 (down/up/right/left 프레임 + attack)   ↓ 게임 배율(2x) 미리보기', 6, y + 5);
  return { png: c.toDataURL('image/png'), errs, count: ids.length };
});
if (data.errs && data.errs.length) console.log('ERRORS', data.errs.join(' | '));
if (data.png) { writeFileSync(out, Buffer.from(data.png.split(',')[1], 'base64')); console.log('wrote', out, 'monsters', data.count); }
await browser.close();
process.exit(failed ? 1 : 0);
