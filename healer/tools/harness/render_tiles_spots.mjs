// 추가 확인용: 물가·상자·출구·상자/출구 스프라이트 시트
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { writeFileSync, existsSync } from 'node:fs';
const [dir, floorArg, prefix] = process.argv.slice(2);
const floor = parseInt(floorArg, 10);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 900 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.setContent('<canvas id="c"></canvas>');
const core = ['core/rng.js', 'core/events.js', 'core/data_classes.js', 'core/data_skills.js', 'core/data_items.js', 'core/data_monsters.js', 'core/state.js', 'core/dungeon/gen.js'];
await page.addScriptTag({ path: dir + '/pixel.js' });
for (const f of core) if (existsSync(dir + '/' + f)) await page.addScriptTag({ path: dir + '/' + f });
for (const f of ['sprites.js', 'tiles_dungeon.js', 'tiles_forest.js']) if (existsSync(dir + '/' + f)) await page.addScriptTag({ path: dir + '/' + f });
const result = await page.evaluate((floor) => {
  const map = DungeonGen.generate(floor);
  const T = 32, CH = 16; const c = document.getElementById('c'); const ctx = c.getContext('2d');
  const cache = new Map();
  const chunk = (ci, cj) => { const k = ci + ',' + cj; if (!cache.has(k)) cache.set(k, DungeonTiles.chunk(map, ci, cj)); return cache.get(k); };
  function view(cx, cy, zoom, vw, vh) {
    c.width = vw; c.height = vh; ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, vw, vh);
    const camX = Math.round(cx - vw / zoom / 2), camY = Math.round(cy - vh / zoom / 2);
    ctx.setTransform(zoom, 0, 0, zoom, -camX * zoom, -camY * zoom);
    for (let cj = 0; cj < 10; cj++) for (let ci = 0; ci < 10; ci++) ctx.drawImage(chunk(ci, cj), ci * CH * T, cj * CH * T);
    const draw = (img, x, y, ax, ay) => ctx.drawImage(img, Math.round(x) - ax, Math.round(y) - ay);
    for (const ch of map.chests) { const img = DungeonTiles.chestSprite(false, ch.type); draw(img, ch.x, ch.y, img.width / 2, img.height - 4); }
    const ex = DungeonTiles.exitSprite(); draw(ex, map.exit.x, map.exit.y, ex.width / 2, ex.height - 8);
    return c.toDataURL('image/png');
  }
  // 물 찾기
  let wx = 0, wy = 0, n = 0; for (let j = 0; j < map.rows; j++) for (let i = 0; i < map.cols; i++) if (map.tiles[j * map.cols + i] === 2) { wx += i; wy += j; n++; }
  const views = {};
  if (n) views.water = view((wx / n) * T, (wy / n) * T, 2, 780, 900);
  views.exit = view(map.exit.x, map.exit.y, 2, 780, 900);
  const hid = map.chests.find(ch => ch.type === 'hidden') || map.chests[0];
  views.chest = view(hid.x, hid.y, 3, 780, 900);
  // 스프라이트 시트 ×4
  c.width = 4 * 200; c.height = 4 * 70; ctx.setTransform(4, 0, 0, 4, 0, 0); ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#7db457'; ctx.fillRect(0, 0, 200, 70);
  let x = 2; for (const t of ['normal', 'hidden', 'quest']) for (const o of [false, true]) { ctx.drawImage(DungeonTiles.chestSprite(o, t), x, 4); x += 30; }
  ctx.drawImage(DungeonTiles.exitSprite(), 4, 30); ctx.drawImage(DungeonTiles.exitSprite(), 60, 30);
  views.sheet = c.toDataURL('image/png');
  return views;
}, floor);
for (const [k, v] of Object.entries(result)) writeFileSync(`${prefix}_${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
console.log('wrote', Object.keys(result).join(' '));
await browser.close();
