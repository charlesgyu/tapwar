// 캐릭터 시트 렌더: node render_sprites.mjs <jsDir> <out.png>
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const [dir, out] = process.argv.slice(2);
if (!dir || !out) { console.error('usage: render_sprites.mjs <jsDir> <out.png>'); process.exit(1); }
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1800 } });
let failed = false;
page.on('pageerror', e => { failed = true; console.log('PAGEERROR', e.message); });
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.setContent('<canvas id="c"></canvas>');
await page.addScriptTag({ path: dir + '/pixel.js' });
await page.addScriptTag({ path: dir + '/sprites.js' });
const data = await page.evaluate(() => {
  const kinds = ['player', 'villagerA', 'villagerB', 'villagerC', 'villagerD', 'villagerE', 'child', 'knight', 'priest', 'smith', 'merchant'];
  const dirs = ['down', 'up', 'right', 'left'];
  const sheets = {};
  const errs = [];
  for (const k of kinds) { try { sheets[k] = Sprites.get(k); } catch (e) { errs.push(k + ': ' + e.message); } }
  const list = Object.values(sheets);
  if (!list.length) return { errs };
  const fw = Math.max(...list.map(s => s.w)), fh = Math.max(...list.map(s => s.h));
  const S = 4, pad = 2;
  const cellW = (fw + pad) * S, cellH = (fh + pad) * S;
  const c = document.getElementById('c');
  const labelW = 110;
  c.width = labelW + cellW * 16 + 20; c.height = cellH * kinds.length + 40 + (fh + 8) * 2 + 60;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#3f9f85'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
  kinds.forEach((k, row) => {
    const s = sheets[k]; if (!s) return;
    ctx.fillText(k, 6, row * cellH + cellH / 2);
    dirs.forEach((d, di) => {
      for (let f = 0; f < 4; f++) {
        const img = s[d][f];
        const x = labelW + (di * 4 + f) * cellW, y = row * cellH;
        // 발 기준선
        ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(x, y + (s.anchor.y + pad) * S, cellW, 1);
        ctx.drawImage(img, x + pad * S, y + pad * S, img.width * S, img.height * S);
      }
    });
  });
  // 실제 게임 배율(2x) 미리보기: 포석 위 플레이어 4방향 걷기
  const y0 = cellH * kinds.length + 20;
  ctx.fillStyle = '#e9dfca'; ctx.fillRect(0, y0, c.width, (fh + 8) * 2 + 20);
  ctx.fillStyle = '#c9b899';
  for (let yy = y0; yy < y0 + (fh + 8) * 2 + 20; yy += 12) for (let xx = 0; xx < c.width; xx += 24) ctx.fillRect(xx + ((yy / 12) % 2) * 12, yy, 22, 10);
  ctx.fillStyle = '#e9dfca';
  for (let yy = y0; yy < y0 + (fh + 8) * 2 + 20; yy += 12) for (let xx = 0; xx < c.width; xx += 24) ctx.fillRect(xx + ((yy / 12) % 2) * 12 + 1, yy + 1, 20, 8);
  let x = 10;
  for (const k of ['player', 'villagerA', 'knight', 'priest', 'child', 'merchant']) {
    const s = sheets[k]; if (!s) continue;
    for (const d of dirs) for (let f = 0; f < 4; f++) { const img = s[d][f]; ctx.drawImage(img, x, y0 + 10, img.width * 2, img.height * 2); x += img.width * 2 + 4; }
    x += 16;
  }
  ctx.fillStyle = '#333'; ctx.font = '12px sans-serif';
  ctx.fillText('↑ 4x 확대 시트 (down / up / right / left × 4프레임)  ↓ 게임 배율(2x) 미리보기', 6, y0 + (fh + 8) * 2 + 12);
  return { png: c.toDataURL('image/png'), errs, fw, fh, anchor: list[0].anchor };
});
if (data.errs && data.errs.length) console.log('ERRORS', data.errs.join(' | '));
if (data.png) { writeFileSync(out, Buffer.from(data.png.split(',')[1], 'base64')); console.log('wrote', out, 'frame', data.fw + 'x' + data.fh, 'anchor', JSON.stringify(data.anchor)); }
await browser.close();
process.exit(failed ? 1 : 0);
